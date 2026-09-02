import {
  computeSkinMeshSamplingGrid,
  countConnectedComponentsFromPositions,
  reinforceQuadConnectionsForMesh,
} from "./meshExport.ts";
import type { SkinMeshResult } from "./meshExport.ts";
import { buildMeshResultFromTriangles, meshGridShape } from "../cloud-sculpt/meshExport.ts";
import type { Triangle } from "../cloud-sculpt/meshExport.ts";
import type { PreviewMeshRequest } from "./previewMeshWorkerProtocol.ts";
import type { Patch } from "./field.ts";
import { flatNormalsFromTriangleSoup } from "./previewMeshBuffers.ts";

export interface ParallelMeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  faceCount: number;
}

export type ParallelMeshFinalizePhase = "assembling" | "topology" | "components";

function trianglesFromPositions(positions: Float32Array): Triangle[] {
  if (positions.length % 9 !== 0) throw new Error("parallel mesh position buffer is not triangular");
  const triangles: Triangle[] = new Array(positions.length / 9);
  for (let i = 0, face = 0; i < positions.length; i += 9, face++) {
    triangles[face] = {
      a: { x: positions[i], y: positions[i + 1], z: positions[i + 2] },
      b: { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] },
      c: { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] },
    };
  }
  return triangles;
}

/** Rebuild audited mesh metadata from an exact Float32 triangle buffer.
 * Used when Stage 6 can reuse a matching preview/inspection instead of
 * repeating the resolution³ SDF sampling pass. */
export function buildSkinMeshResultFromPositions(
  positions: Float32Array,
  targetLongestMm: number,
  patches: Patch[],
  quadMeshJoinWidth: number,
  internalEdgeCount: number,
  onFinalizePhase?: (phase: ParallelMeshFinalizePhase, faceCount: number) => void,
  computeComponents = true,
): SkinMeshResult {
  const faceCount = positions.length / 9;
  onFinalizePhase?.("assembling", faceCount);
  const triangles = trianglesFromPositions(positions);
  onFinalizePhase?.("topology", triangles.length);
  const base = buildMeshResultFromTriangles(triangles, targetLongestMm);
  const reinforced = reinforceQuadConnectionsForMesh(patches, quadMeshJoinWidth);
  const connectedComponents = computeComponents
    ? countConnectedComponentsFromPositions(positions)
    : 0;
  onFinalizePhase?.("components", triangles.length);
  return {
    ...base,
    connectedComponents,
    reinforcedConnectionPoints: reinforced.reinforcedPointCount,
    internalEdgeCount,
  };
}

/** Shared nested-Worker mesh path used by both ordinary final preview and
 * final-precision diagnostics. The request determines whether Internal is
 * included; diagnostics pass null so they measure the outer SKIN only. */
export function buildParallelMeshBuffers(
  request: PreviewMeshRequest,
  onSliceComplete?: (completed: number, total: number, faceCount: number) => void,
): Promise<ParallelMeshBuffers> {
  const grid = computeSkinMeshSamplingGrid({
    mode: request.mode, host: request.host, hostK: request.hostK, thickness: request.thickness,
    patches: request.patches, roundK: request.roundK,
    options: { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
    coinBulge: request.coinBulge, quadMeshJoinWidth: request.quadMeshJoinWidth,
    coinBulgeBalance: request.coinBulgeBalance, internalGraph: request.internalGraph,
    scaffoldPillars: request.scaffoldPillars,
  });
  const { nz } = meshGridShape(grid.bounds, grid.resolution);
  const workerCount = Math.max(1, Math.min(nz, Math.round(request.workerCount)));
  if (workerCount <= 1) return Promise.reject(new Error("single-worker"));
  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    const results: Array<ParallelMeshBuffers | undefined> = new Array(workerCount);
    let completed = 0;
    const fail = (error: Error) => {
      workers.forEach((worker) => worker.terminate());
      reject(error);
    };
    for (let index = 0; index < workerCount; index++) {
      const worker = new Worker(new URL("./previewMeshSlice.worker.ts", import.meta.url), { type: "module" });
      workers.push(worker);
      worker.onmessage = (sliceEvent: MessageEvent<{
        type: "result" | "error";
        sliceIndex: number;
        positions?: Float32Array;
        normals?: Float32Array;
        faceCount?: number;
        message?: string;
      }>) => {
        const message = sliceEvent.data;
        if (message.type === "error" || !message.positions || !message.normals || message.faceCount === undefined) {
          fail(new Error(message.message ?? "slice worker failed"));
          return;
        }
        worker.terminate();
        results[message.sliceIndex] = {
          positions: message.positions,
          normals: message.normals,
          faceCount: message.faceCount,
        };
        completed++;
        onSliceComplete?.(completed, workerCount, message.faceCount);
        if (completed !== workerCount) return;
        const positionLength = results.reduce((sum, result) => sum + result!.positions.length, 0);
        const normalLength = results.reduce((sum, result) => sum + result!.normals.length, 0);
        const positions = new Float32Array(positionLength);
        const normals = new Float32Array(normalLength);
        let positionOffset = 0;
        let normalOffset = 0;
        let faceCount = 0;
        for (const result of results as ParallelMeshBuffers[]) {
          positions.set(result.positions, positionOffset);
          normals.set(result.normals, normalOffset);
          positionOffset += result.positions.length;
          normalOffset += result.normals.length;
          faceCount += result.faceCount;
        }
        resolve({ positions, normals, faceCount });
      };
      worker.onerror = (workerError) => fail(new Error(workerError.message));
      worker.postMessage({
        request,
        sliceIndex: index,
        zStart: Math.floor((index * nz) / workerCount),
        zEnd: Math.floor(((index + 1) * nz) / workerCount),
      });
    }
  });
}

/** Exact parallel mesh result for inspection/export workers. Float32 identity
 * intentionally matches the coordinates ultimately saved to STL/3MF. */
export async function buildParallelSkinMesh(
  request: PreviewMeshRequest,
  onSliceComplete?: (completed: number, total: number, faceCount: number) => void,
  onFinalizePhase?: (phase: ParallelMeshFinalizePhase, faceCount: number) => void,
  onPositionBuffer?: (positions: Float32Array, normals: Float32Array) => void,
  computeComponents = true,
): Promise<SkinMeshResult> {
  const buffers = await buildParallelMeshBuffers({ ...request, positionsOnly: true }, onSliceComplete);
  // positionsOnly deliberately keeps the sixteen slice messages small, so
  // their normal buffers are empty. Build flat display normals once in this
  // parent Worker before Stage 6 transfers the exact mesh to the renderer.
  const normals = buffers.normals.length === buffers.positions.length
    ? buffers.normals
    : flatNormalsFromTriangleSoup(buffers.positions);
  onPositionBuffer?.(buffers.positions, normals);
  return buildSkinMeshResultFromPositions(
    buffers.positions,
    request.targetLongestMm,
    request.patches,
    request.quadMeshJoinWidth,
    request.internalGraph?.edges.length ?? 0,
    onFinalizePhase,
    computeComponents,
  );
}

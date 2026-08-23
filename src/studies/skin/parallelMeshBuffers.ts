import { computeSkinMeshSamplingGrid, countConnectedComponents, reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import type { SkinMeshResult } from "./meshExport.ts";
import { buildMeshResultFromTriangles, meshGridShape } from "../cloud-sculpt/meshExport.ts";
import type { Triangle } from "../cloud-sculpt/meshExport.ts";
import type { PreviewMeshRequest } from "./previewMeshWorkerProtocol.ts";

export interface ParallelMeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  faceCount: number;
}

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
): Promise<SkinMeshResult> {
  const buffers = await buildParallelMeshBuffers({ ...request, positionsOnly: true }, onSliceComplete);
  const triangles = trianglesFromPositions(buffers.positions);
  const base = buildMeshResultFromTriangles(triangles, request.targetLongestMm);
  const reinforced = reinforceQuadConnectionsForMesh(request.patches, request.quadMeshJoinWidth);
  return {
    ...base,
    connectedComponents: countConnectedComponents(triangles),
    reinforcedConnectionPoints: reinforced.reinforcedPointCount,
    internalEdgeCount: request.internalGraph?.edges.length ?? 0,
  };
}

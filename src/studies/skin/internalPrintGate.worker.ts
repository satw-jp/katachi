import { createCompositeSdfEvaluator } from "./field.ts";
import { evaluateInternalPrintGate } from "./internalPrintGate.ts";
import { encodeBinaryStl, inspectSavedStlTopology, inspectWatertight, orientMeshForSavedStl, type Triangle } from "../cloud-sculpt/meshExport.ts";
import { buildSkinMesh, countConnectedComponents, reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import { buildParallelMeshBuffers } from "./parallelMeshBuffers.ts";
import type { InternalPrintGateRequest, InternalPrintGateWorkerMessage } from "./internalPrintGateWorkerProtocol.ts";

self.onmessage = async (event: MessageEvent<InternalPrintGateRequest>) => {
  const request = event.data;
  if (request.type !== "check") return;
  const started = performance.now();
  try {
    const reinforced = reinforceQuadConnectionsForMesh(request.patches, request.quadMeshJoinWidth);
    const surfaceSdf = createCompositeSdfEvaluator(
      request.mode, request.host, request.hostK, request.thickness, reinforced.patches,
      request.roundK, request.coinBulge, request.coinBulgeBalance,
    );
    let mesh: ReturnType<typeof buildSkinMesh>;
    try {
      const buffers = request.prebuiltPositions?.length
        ? { positions: request.prebuiltPositions, normals: new Float32Array(0), faceCount: request.prebuiltPositions.length / 9 }
        : await buildParallelMeshBuffers({ ...request, type: "build" });
      const triangles: Triangle[] = [];
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let index = 0; index + 8 < buffers.positions.length; index += 9) {
        const a = { x: buffers.positions[index], y: buffers.positions[index + 1], z: buffers.positions[index + 2] };
        const b = { x: buffers.positions[index + 3], y: buffers.positions[index + 4], z: buffers.positions[index + 5] };
        const c = { x: buffers.positions[index + 6], y: buffers.positions[index + 7], z: buffers.positions[index + 8] };
        triangles.push({ a, b, c });
        for (const point of [a, b, c]) {
          minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); minZ = Math.min(minZ, point.z);
          maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); maxZ = Math.max(maxZ, point.z);
        }
      }
      const longest = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
      const scaleMmPerUnit = longest > 0 ? request.targetLongestMm / longest : 1;
      mesh = {
        triangles,
        sourceBounds: {
          min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ },
          size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }, longest,
        },
        mmBounds: {
          min: { x: minX * scaleMmPerUnit, y: minY * scaleMmPerUnit, z: minZ * scaleMmPerUnit },
          max: { x: maxX * scaleMmPerUnit, y: maxY * scaleMmPerUnit, z: maxZ * scaleMmPerUnit },
          size: { x: (maxX - minX) * scaleMmPerUnit, y: (maxY - minY) * scaleMmPerUnit, z: (maxZ - minZ) * scaleMmPerUnit },
          longest: request.targetLongestMm,
        },
        scaleMmPerUnit,
        watertight: inspectWatertight(triangles, scaleMmPerUnit),
        connectedComponents: countConnectedComponents(triangles),
        reinforcedConnectionPoints: reinforced.reinforcedPointCount,
        internalEdgeCount: request.internalGraph.edges.length,
      };
    } catch {
      mesh = buildSkinMesh(
        request.mode, request.host, request.hostK, request.thickness, request.patches,
        request.roundK, { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
        request.coinBulge, request.quadMeshJoinWidth, request.coinBulgeBalance, request.internalGraph,
      );
    }
    // Only winding is repairable. Any other saved-STL defect must stop
    // before orientation can drop or mask it.
    const inputSavedTopology = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);
    if (!inputSavedTopology.closed || !inputSavedTopology.degenerateFree || inputSavedTopology.nonFiniteTriangleCount > 0 || inputSavedTopology.connectedComponents !== 1) {
      throw new Error("Fail closed: input 保存STL topology NG（closed=" + inputSavedTopology.closed + ", degenerate=" + inputSavedTopology.degenerateTriangleCount + ", nonFinite=" + inputSavedTopology.nonFiniteTriangleCount + ", components=" + inputSavedTopology.connectedComponents + ", open=" + inputSavedTopology.openEdges + ", nonManifold=" + inputSavedTopology.nonManifoldEdges + ", windingInconsistent=" + inputSavedTopology.windingInconsistentEdges + "）");
    }
    // Repair face direction in exact Float32 STL identity, then make the
    // gate and cached bytes speak about that same saved mesh.
    const repaired = orientMeshForSavedStl(mesh);
    const savedTopology = inspectSavedStlTopology(repaired.triangles, repaired.scaleMmPerUnit);
    if (!savedTopology.ok || savedTopology.connectedComponents !== 1) {
      throw new Error("Fail closed: 保存STL topology NG（closed=" + savedTopology.closed + ", winding=" + savedTopology.windingConsistent + ", degenerate=" + savedTopology.degenerateTriangleCount + ", nonFinite=" + savedTopology.nonFiniteTriangleCount + ", components=" + savedTopology.connectedComponents + ", open=" + savedTopology.openEdges + ", nonManifold=" + savedTopology.nonManifoldEdges + ", windingInconsistent=" + savedTopology.windingInconsistentEdges + "）");
    }
    mesh = {
      ...mesh,
      ...repaired,
      watertight: inspectWatertight(repaired.triangles, repaired.scaleMmPerUnit),
      connectedComponents: savedTopology.connectedComponents,
      removedSavedDegenerateTriangleCount: repaired.removedSavedDegenerateTriangleCount ?? savedTopology.degenerateTriangleCount,
    };
    const report = evaluateInternalPrintGate({
      graph: request.internalGraph,
      mesh,
      resolution: request.resolution,
      targetLongestMm: request.targetLongestMm,
      surfaceSdf: (point) => surfaceSdf(point.x, point.y, point.z),
    });
    const stl = encodeBinaryStl(mesh, request.baseName);
    const message: InternalPrintGateWorkerMessage = {
      type: "result", requestId: request.requestId, generation: request.generation,
      report, stl, elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message, [stl]);
  } catch (error) {
    const message: InternalPrintGateWorkerMessage = {
      type: "error", requestId: request.requestId, generation: request.generation,
      message: (error as Error).message, elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message);
  }
};

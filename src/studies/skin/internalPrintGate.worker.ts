import { createCompositeSdfEvaluator } from "./field.ts";
import { evaluateInternalPrintGate } from "./internalPrintGate.ts";
import { encodeBinaryStl, inspectSavedStlTopology, orientMeshForSavedStl } from "../cloud-sculpt/meshExport.ts";
import { buildSkinMesh, meshSummary, reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import { buildParallelMeshBuffers, buildSkinMeshResultFromPositions } from "./parallelMeshBuffers.ts";
import {
  diagnoseSkinRebuildFinalMeshDegenerateFaceIndices,
  mergeSkinRebuildGraphsAtSupportContacts,
  repairSkinRebuildFinalMesh,
} from "./rebuild/model.ts";
import type { InternalPrintGateProgressPhase, InternalPrintGateRequest, InternalPrintGateWorkerMessage } from "./internalPrintGateWorkerProtocol.ts";

self.onmessage = async (event: MessageEvent<InternalPrintGateRequest>) => {
  const request = event.data;
  if (request.type !== "check") return;
  const started = performance.now();
  try {
    let completedSlices = 0;
    let totalSlices = Math.max(1, request.workerCount);
    let faceCount = request.prebuiltPositions?.length ? request.prebuiltPositions.length / 9 : 0;
    const reportProgress = (phase: InternalPrintGateProgressPhase, detail: string): void => {
      const message: InternalPrintGateWorkerMessage = {
        type: "progress",
        requestId: request.requestId,
        generation: request.generation,
        phase,
        completedSlices,
        totalSlices,
        faceCount,
        detail,
        elapsedMs: performance.now() - started,
      };
      (self as unknown as Worker).postMessage(message);
    };
    reportProgress("preparing", request.prebuiltPositions?.length
      ? `工程6検査済み ${faceCount.toLocaleString()}面を再利用`
      : `SDFと${request.workerCount}個のslice Workerを準備`);
    const reinforced = reinforceQuadConnectionsForMesh(request.patches, request.quadMeshJoinWidth);
    const surfaceSdf = createCompositeSdfEvaluator(
      request.mode, request.host, request.hostK, request.thickness, reinforced.patches,
      request.roundK, request.coinBulge, request.coinBulgeBalance,
    );
    let mesh: ReturnType<typeof buildSkinMesh>;
    try {
      const buffers = request.prebuiltPositions?.length
        ? { positions: request.prebuiltPositions, normals: new Float32Array(0), faceCount: request.prebuiltPositions.length / 9 }
        : await buildParallelMeshBuffers({ ...request, type: "build" }, (completed, total, sliceFaceCount) => {
          completedSlices = completed;
          totalSlices = total;
          faceCount += sliceFaceCount;
          reportProgress("sampling", `${completed}/${total} slice完了 · ${faceCount.toLocaleString()}面`);
        });
      faceCount = buffers.faceCount;
      if (request.prebuiltPositions?.length) completedSlices = totalSlices;
      mesh = buildSkinMeshResultFromPositions(
        buffers.positions,
        request.targetLongestMm,
        request.patches,
        request.quadMeshJoinWidth,
        request.internalGraph.edges.length,
        (phase, faces) => {
          faceCount = faces;
          reportProgress(phase, phase === "assembling"
            ? `Float32三角形 ${faces.toLocaleString()}面を組み立て`
            : phase === "topology"
              ? `辺共有と水密を検査 · ${faces.toLocaleString()}面`
              : `連結部品数を検査 · ${faces.toLocaleString()}面`);
        },
      );
      if (request.prebuiltPositions?.length && request.prebuiltScaleMmPerUnit) {
        const scale = request.prebuiltScaleMmPerUnit;
        const zShift = request.prebuiltPlateShiftSourceZ ?? 0;
        const sourceBounds = mesh.sourceBounds;
        mesh = {
          ...mesh,
          scaleMmPerUnit: scale,
          plateShiftSourceZ: zShift,
          mmBounds: {
            min: {
              x: sourceBounds.min.x * scale,
              y: sourceBounds.min.y * scale,
              z: (sourceBounds.min.z + zShift) * scale,
            },
            max: {
              x: sourceBounds.max.x * scale,
              y: sourceBounds.max.y * scale,
              z: (sourceBounds.max.z + zShift) * scale,
            },
            size: {
              x: sourceBounds.size.x * scale,
              y: sourceBounds.size.y * scale,
              z: sourceBounds.size.z * scale,
            },
            longest: sourceBounds.longest * scale,
          },
        };
      }
    } catch {
      reportProgress("sampling", "並列経路を使えないため背景Worker 1本へ切替");
      mesh = buildSkinMesh(
        request.mode, request.host, request.hostK, request.thickness, request.patches,
        request.roundK, { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
        request.coinBulge, request.quadMeshJoinWidth, request.coinBulgeBalance, request.internalGraph,
      );
    }
    const diagnosticDegenerateFaceIndices = request.skinRebuildRepair
      ? diagnoseSkinRebuildFinalMeshDegenerateFaceIndices(mesh)
      : undefined;
    if (request.skinRebuildRepair) {
      reportProgress("repair", `閉じた微小空洞だけを整理 · ${mesh.triangles.length.toLocaleString()}面`);
      mesh = repairSkinRebuildFinalMesh(mesh);
      faceCount = mesh.triangles.length;
    }
    // Winding and the explicitly bounded SKIN REBUILD micro-island cleanup
    // are repairable. Any remaining saved-STL defect must stop here.
    reportProgress("saved-topology", `保存座標で水密・部品数を検査 · ${mesh.triangles.length.toLocaleString()}面`);
    const inputSavedTopology = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);
    const expectedMeshComponents = Math.max(1, Math.round(request.expectedMeshComponents ?? 1));
    if (!inputSavedTopology.closed
      || !inputSavedTopology.degenerateFree
      || inputSavedTopology.nonFiniteTriangleCount > 0
      || inputSavedTopology.connectedComponents !== expectedMeshComponents) {
      const componentHint = inputSavedTopology.connectedComponents > 1
        ? " · Surface Patternが蜘蛛の巣と物理的に分離しています。工程3→4→5A→5Bを再実行してください"
        : "";
      throw new Error("Fail closed: input 保存STL topology NG（closed=" + inputSavedTopology.closed + ", degenerate=" + inputSavedTopology.degenerateTriangleCount + ", nonFinite=" + inputSavedTopology.nonFiniteTriangleCount + ", components=" + inputSavedTopology.connectedComponents + ", open=" + inputSavedTopology.openEdges + ", nonManifold=" + inputSavedTopology.nonManifoldEdges + ", windingInconsistent=" + inputSavedTopology.windingInconsistentEdges + "）" + componentHint);
    }
    // Repair face direction in exact Float32 STL identity, then make the
    // gate and cached bytes speak about that same saved mesh.
    const repairAlreadyOriented = Boolean(request.skinRebuildRepair && inputSavedTopology.windingConsistent);
    reportProgress(
      "saved-topology",
      repairAlreadyOriented
        ? "修復済み面方向を再利用（同じ保存座標の重複検査を省略）"
        : "面方向を揃え、保存STL topologyを再確認",
    );
    const repaired = repairAlreadyOriented ? mesh : orientMeshForSavedStl(mesh);
    const savedTopology = repairAlreadyOriented
      ? inputSavedTopology
      : inspectSavedStlTopology(repaired.triangles, repaired.scaleMmPerUnit);
    if (!savedTopology.ok || savedTopology.connectedComponents !== expectedMeshComponents) {
      throw new Error("Fail closed: 保存STL topology NG（closed=" + savedTopology.closed + ", winding=" + savedTopology.windingConsistent + ", degenerate=" + savedTopology.degenerateTriangleCount + ", nonFinite=" + savedTopology.nonFiniteTriangleCount + ", components=" + savedTopology.connectedComponents + ", open=" + savedTopology.openEdges + ", nonManifold=" + savedTopology.nonManifoldEdges + ", windingInconsistent=" + savedTopology.windingInconsistentEdges + "）");
    }
    mesh = {
      ...mesh,
      ...repaired,
      watertight: {
        ok: savedTopology.closed,
        openEdges: savedTopology.openEdges,
        nonManifoldEdges: savedTopology.nonManifoldEdges,
        totalEdges: savedTopology.totalEdges,
      },
      connectedComponents: savedTopology.connectedComponents,
      removedSavedDegenerateTriangleCount: repaired.removedSavedDegenerateTriangleCount ?? savedTopology.degenerateTriangleCount,
    };
    const reachabilityGraph = request.printSupportGraph?.edges.length
      ? mergeSkinRebuildGraphsAtSupportContacts(request.internalGraph, request.printSupportGraph)
      : request.internalGraph;
    reportProgress("printability", `積層到達・線径・bridgeを判定 · BODY ${request.internalGraph.edges.length}辺 + support ${request.printSupportGraph?.edges.length ?? 0}本`);
    const report = evaluateInternalPrintGate({
      graph: reachabilityGraph,
      mesh,
      resolution: request.resolution,
      targetLongestMm: request.targetLongestMm,
      surfaceSdf: (point) => surfaceSdf(point.x, point.y, point.z),
      buildPlateZSource: request.buildPlateZSource,
      expectedMeshComponents,
    });
    reportProgress("encoding", `判定済み ${mesh.triangles.length.toLocaleString()}面をSTLへ変換`);
    const stl = encodeBinaryStl(mesh, request.baseName);
    const message: InternalPrintGateWorkerMessage = {
      type: "result", requestId: request.requestId, generation: request.generation,
      report, stl, summary: meshSummary(mesh), scaleMmPerUnit: mesh.scaleMmPerUnit,
      plateShiftSourceZ: mesh.plateShiftSourceZ ?? 0,
      repairedSavedTriangleHoleCount: mesh.repairedSavedTriangleHoleCount ?? 0,
      diagnosticDegenerateFaceIndices,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message, [
      stl,
      ...(diagnosticDegenerateFaceIndices ? [diagnosticDegenerateFaceIndices.buffer] : []),
    ]);
  } catch (error) {
    const message: InternalPrintGateWorkerMessage = {
      type: "error", requestId: request.requestId, generation: request.generation,
      message: (error as Error).message, elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message);
  }
};

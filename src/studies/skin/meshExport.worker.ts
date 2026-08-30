import { encodeBinaryStl, encodeObj, inspectSavedStlTopology, orientMeshForSavedStl } from "../cloud-sculpt/meshExport.ts";
import { buildPrintSupportMesh, buildSkinMesh, encodeObjFromBinaryStl, meshSummary } from "./meshExport.ts";
import { buildParallelSkinMesh, buildSkinMeshResultFromPositions } from "./parallelMeshBuffers.ts";
import { flatNormalsFromTriangleSoup, packPreviewMeshBuffers } from "./previewMeshBuffers.ts";
import type { MeshExportProgressPhase, MeshExportRequest, MeshExportWorkerMessage } from "./meshExportWorkerProtocol.ts";

self.onmessage = async (event: MessageEvent<MeshExportRequest>) => {
  const request = event.data;
  if (request.type !== "export") return;
  const started = performance.now();
  try {
    let completedSlices = 0;
    let totalSlices = Math.max(1, request.workerCount);
    let faceCount = 0;
    const reportProgress = (phase: MeshExportProgressPhase, detail: string): void => {
      const progress: MeshExportWorkerMessage = {
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
      (self as unknown as Worker).postMessage(progress);
    };
    const buildSupportArtifacts = (scaleMmPerUnit: number, plateShiftSourceZ: number) => {
      if (!request.printSupportGraph?.edges.length) return {};
      reportProgress("support", `別印刷サポート ${request.printSupportGraph.edges.length}本を閉じた円柱へ変換`);
      const raw = buildPrintSupportMesh(request.printSupportGraph, scaleMmPerUnit, {
        sourceOffset: { x: 0, y: 0, z: plateShiftSourceZ },
        extendVerticalRootsToPlateZ: 0,
      });
      const support = orientMeshForSavedStl(raw);
      const topology = inspectSavedStlTopology(support.triangles, support.scaleMmPerUnit);
      if (!topology.ok) throw new Error(`print support STL topology NG（open=${topology.openEdges}, nonManifold=${topology.nonManifoldEdges}, winding=${topology.windingInconsistentEdges}）`);
      return {
        supportStl: encodeBinaryStl(support, `${request.baseName}-print-support`),
        supportObj: encodeObj(support),
        supportSummary: `印刷サポート ${request.printSupportGraph.edges.length}本 / ${support.triangles.length.toLocaleString()}面 / ${topology.connectedComponents}部品 / BODY共通Z・Plate 0`,
      };
    };
    if (request.operation === "export" && request.cachedStl) {
      reportProgress("encoding", "判定済みBODY STLからOBJを生成");
      const stl = request.cachedStl;
      const obj = encodeObjFromBinaryStl(stl);
      const support = buildSupportArtifacts(
        request.cachedScaleMmPerUnit ?? 1,
        request.cachedPlateShiftSourceZ ?? 0,
      );
      const message: MeshExportWorkerMessage = {
        type: "result",
        requestId: request.requestId,
        generation: request.generation,
        stl,
        obj,
        ...support,
        summary: `${request.cachedSummary ?? "内部判定済みmesh"} / 判定済みSTL再利用`,
        watertightOk: true,
        cacheHit: true,
        elapsedMs: performance.now() - started,
      };
      const transfers = [stl, ...(support.supportStl ? [support.supportStl] : [])];
      (self as unknown as Worker).postMessage(message, transfers);
      return;
    }
    reportProgress("preparing", request.prebuiltPositions?.length
      ? `検査済み ${Math.floor(request.prebuiltPositions.length / 9).toLocaleString()}面を再利用`
      : `SDFと${request.workerCount}個のslice Workerを準備`);
    let result: ReturnType<typeof buildSkinMesh>;
    let exactPositions: Float32Array | undefined;
    let exactNormals: Float32Array | undefined;
    try {
      if (request.prebuiltPositions?.length) {
        exactPositions = request.prebuiltPositions;
        exactNormals = flatNormalsFromTriangleSoup(exactPositions);
        faceCount = exactPositions.length / 9;
        completedSlices = totalSlices;
        result = buildSkinMeshResultFromPositions(
          exactPositions,
          request.targetLongestMm,
          request.patches,
          request.quadMeshJoinWidth,
          request.internalGraph?.edges.length ?? 0,
          (phase, faces) => {
            faceCount = faces;
            reportProgress(phase, phase === "assembling"
              ? `Float32三角形 ${faces.toLocaleString()}面を組み立て`
              : phase === "topology"
                ? `辺共有と水密を検査 · ${faces.toLocaleString()}面`
                : `連結部品数を検査 · ${faces.toLocaleString()}面`);
          },
        );
      } else {
        result = await buildParallelSkinMesh(
          { ...request, type: "build" },
          (completed, total, sliceFaceCount) => {
            completedSlices = completed;
            totalSlices = total;
            faceCount += sliceFaceCount;
            reportProgress("sampling", `${completed}/${total} slice完了 · ${faceCount.toLocaleString()}面`);
          },
          (phase, faces) => {
            faceCount = faces;
            reportProgress(phase, phase === "assembling"
              ? `sliceをFloat32三角形 ${faces.toLocaleString()}面へ結合`
              : phase === "topology"
                ? `辺共有と水密を検査 · ${faces.toLocaleString()}面`
                : `連結部品数を検査 · ${faces.toLocaleString()}面`);
          },
          (positions, normals) => {
            exactPositions = positions;
            exactNormals = normals;
          },
        );
      }
    } catch {
      reportProgress("sampling", "並列経路を使えないため背景Worker 1本へ切替");
      exactPositions = undefined;
      result = buildSkinMesh(
        request.mode, request.host, request.hostK, request.thickness, request.patches, request.roundK,
        { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
        request.coinBulge, request.quadMeshJoinWidth, request.coinBulgeBalance, request.internalGraph,
      );
      if (request.operation === "inspect") {
        const buffers = packPreviewMeshBuffers(result.triangles);
        exactPositions = buffers.positions;
        exactNormals = buffers.normals;
      }
    }
    if (request.operation === "inspect" && exactPositions && !exactNormals) {
      exactNormals = flatNormalsFromTriangleSoup(exactPositions);
    }
    if (request.operation !== "inspect") reportProgress("encoding", "BODY STL / OBJを直列化");
    const stl = request.operation === "inspect" ? new ArrayBuffer(0) : encodeBinaryStl(result, request.baseName);
    const obj = request.operation === "export" ? encodeObj(result) : "";
    const support = request.operation === "export"
      ? buildSupportArtifacts(result.scaleMmPerUnit, result.plateShiftSourceZ ?? 0)
      : {};
    const message: MeshExportWorkerMessage = {
      type: "result",
      requestId: request.requestId,
      generation: request.generation,
      stl,
      obj,
      ...support,
      positions: request.operation === "inspect" ? exactPositions : undefined,
      normals: request.operation === "inspect" ? exactNormals : undefined,
      summary: meshSummary(result),
      watertightOk: result.watertight.ok,
      cacheHit: false,
      elapsedMs: performance.now() - started,
    };
    const transfers = [
      stl,
      ...(support.supportStl ? [support.supportStl] : []),
      ...(exactPositions && request.operation === "inspect" ? [exactPositions.buffer] : []),
      ...(exactNormals && request.operation === "inspect" ? [exactNormals.buffer] : []),
    ];
    (self as unknown as Worker).postMessage(message, transfers);
  } catch (error) {
    const message: MeshExportWorkerMessage = {
      type: "error",
      requestId: request.requestId,
      generation: request.generation,
      message: (error as Error).message,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message);
  }
};

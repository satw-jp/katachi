import { buildParallelSkinMesh } from "../parallelMeshBuffers.ts";
import type { SkinMeshResult } from "../meshExport.ts";
import type { PreviewMeshRequest } from "../previewMeshWorkerProtocol.ts";
import { findSkinRebuildLowestPoints } from "./model.ts";
import { classifySkinRebuildOverhangFromStage3 } from "./overhangInteriorClassification.ts";
import type {
  SkinRebuildLowestPointRequest,
  SkinRebuildLowestPointWorkerMessage,
  SkinRebuildLowestProgressPhase,
} from "./lowestPointWorkerProtocol.ts";

function post(message: SkinRebuildLowestPointWorkerMessage, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

self.onmessage = async (event: MessageEvent<SkinRebuildLowestPointRequest>) => {
  const request = event.data;
  if (request.type !== "build") return;
  const started = performance.now();
  let faceCount = 0;
  let parallel = request.workerCount > 1;
  const progress = (
    phase: SkinRebuildLowestProgressPhase,
    completed: number,
    total: number,
  ): void => post({
    type: "progress",
    requestId: request.requestId,
    phase,
    completed,
    total,
    workerCount: parallel ? request.workerCount : 1,
    faceCount,
    elapsedMs: performance.now() - started,
  });

  try {
    let mesh: SkinMeshResult | undefined;
    if (parallel) {
      const meshRequest: PreviewMeshRequest = {
        type: "build",
        requestId: request.requestId,
        generation: request.requestId,
        host: request.base.host,
        hostK: request.base.hostK,
        thickness: request.settings.surfaceThickness,
        patches: request.patterns,
        internalGraph: request.dryWeb,
        roundK: request.settings.roundK,
        coinBulge: 0,
        coinBulgeBalance: 0,
        quadMeshJoinWidth: 0,
        mode: "plate",
        resolution: request.settings.analysisResolution,
        targetLongestMm: request.settings.targetLongestMm,
        workerCount: request.workerCount,
        positionsOnly: true,
      };
      progress("mesh", 0, request.workerCount);
      try {
        mesh = await buildParallelSkinMesh(meshRequest, (completed, total, sliceFaceCount) => {
          faceCount += sliceFaceCount;
          progress("mesh", completed, total);
        });
        faceCount = mesh.triangles.length;
      } catch {
        parallel = false;
        faceCount = 0;
        progress("fallback", 0, 1);
      }
    }

    if (mesh) progress("orientation", 0, 1);
    const diagnosed = findSkinRebuildLowestPoints(
      request.base,
      request.patterns,
      request.patternSides,
      request.dryWeb,
      request.settings,
      mesh,
      {
        onProgress: (value) => {
          const phase = value.stage === "motif-attribution" ? "attribution" : "reachability";
          progress(phase, value.completed, value.total);
        },
      },
    );
    faceCount = diagnosed.mesh.triangles.length;
    progress("overhang", diagnosed.mesh.triangles.length, diagnosed.mesh.triangles.length);
    const sourceLongest = diagnosed.mesh.sourceBounds.longest;
    const scaleMmPerUnit = sourceLongest > 0 ? request.settings.targetLongestMm / sourceLongest : 0;
    const overhangAreaMm2 = diagnosed.overhang.areaSourceSquared * scaleMmPerUnit * scaleMmPerUnit;
    const overhangAreaPercent = diagnosed.overhang.totalAreaSourceSquared > 0
      ? diagnosed.overhang.areaSourceSquared / diagnosed.overhang.totalAreaSourceSquared * 100
      : 0;
    const overhangInterior = classifySkinRebuildOverhangFromStage3(
      diagnosed.overhang.positions,
      diagnosed.overhang.faceRegionIds,
      request.patternSides,
    );
    progress("complete", 1, 1);
    const result: SkinRebuildLowestPointWorkerMessage = {
      type: "result",
      requestId: request.requestId,
      lowestPoints: diagnosed.lowestPoints,
      meshPositions: diagnosed.meshPositions,
      meshNormals: diagnosed.meshNormals,
      overhangFacePositions: diagnosed.overhang.positions,
      overhangFaceRegionIds: diagnosed.overhang.faceRegionIds,
      overhangRegions: diagnosed.overhang.regions,
      overhangInterior,
      overhangFaceCount: diagnosed.overhang.faceCount,
      overhangRegionCount: diagnosed.overhang.regionCount,
      overhangAreaMm2,
      overhangAreaPercent,
      workerCount: parallel ? request.workerCount : 1,
      faceCount,
      parallel,
      elapsedMs: performance.now() - started,
    };
    const transfer = [
      diagnosed.meshPositions.buffer,
      diagnosed.meshNormals.buffer,
      diagnosed.overhang.positions.buffer,
      diagnosed.overhang.faceRegionIds.buffer,
      overhangInterior.faceClasses.buffer,
      overhangInterior.insideFaceRegionIds.buffer,
    ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
    post(result, transfer);
  } catch (error) {
    post({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: performance.now() - started,
    });
  }
};

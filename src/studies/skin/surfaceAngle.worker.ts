/// <reference lib="webworker" />

import { buildSkinMesh, computeSkinSamplingBounds, reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import { packPreviewMeshBuffers } from "./previewMeshBuffers.ts";
import { diagnoseSurfaceAnglePositions } from "./surfaceAngleDiagnosis.ts";
import { findMotifMeshLowestPoints } from "./motifLowestPoint.ts";
import { buildParallelMeshBuffers, type ParallelMeshBuffers } from "./parallelMeshBuffers.ts";
import type { PreviewMeshRequest } from "./previewMeshWorkerProtocol.ts";
import type { SurfaceAngleDiagnosisRequest, SurfaceAngleWorkerMessage } from "./surfaceAngleWorkerProtocol.ts";

self.onmessage = async (event: MessageEvent<SurfaceAngleDiagnosisRequest>): Promise<void> => {
  const request = event.data;
  const started = performance.now();
  try {
    if (request.type === "recheck") {
      const diagnosis = diagnoseSurfaceAnglePositions(
        request.basePositions, request.internalGraph, request.thresholdDeg, request.meshStep,
      );
      const motifLowestPoints = request.mode === "plate"
        ? findMotifMeshLowestPoints(
            request.basePositions, request.patches, request.internalGraph, request.meshStep, request.roundK, request.baseNormals,
          )
        : [];
      const { beforeDangerPositions, afterDangerPositions, mitigatedPositions, ...metrics } = diagnosis;
      const message: SurfaceAngleWorkerMessage = {
        type: "result", generation: request.generation, metrics,
        basePositions: request.basePositions, baseNormals: request.baseNormals, baseFaceCount: request.baseFaceCount,
        resolution: request.resolution, internalEdgeCount: request.internalGraph.edges.length, motifLowestPoints,
        beforeDangerPositions, afterDangerPositions, mitigatedPositions,
        elapsedMs: request.previousElapsedMs + performance.now() - started,
      };
      self.postMessage(message, {
        transfer: [request.basePositions.buffer, request.baseNormals.buffer, beforeDangerPositions.buffer, afterDangerPositions.buffer, mitigatedPositions.buffer],
      });
      return;
    }
    // Diagnose the outer SKIN at the author's exact final resolution. The
    // shared nested-Worker path keeps the main thread interactive and avoids
    // the former resolution-36 shortcut that was not valid evidence.
    const meshRequest: PreviewMeshRequest = {
      ...request,
      type: "build",
      requestId: 0,
      internalGraph: null,
    };
    let base: ParallelMeshBuffers;
    try {
      let faceCount = 0;
      base = await buildParallelMeshBuffers(meshRequest, (completedSlices, totalSlices, sliceFaceCount) => {
        faceCount += sliceFaceCount;
        const progress: SurfaceAngleWorkerMessage = {
          type: "progress", generation: request.generation, completedSlices, totalSlices, faceCount,
          elapsedMs: performance.now() - started,
        };
        self.postMessage(progress);
      });
    } catch {
      const surface = buildSkinMesh(
        request.mode,
        request.host,
        request.hostK,
        request.thickness,
        request.patches,
        request.roundK,
        { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
        request.coinBulge,
        request.quadMeshJoinWidth,
        request.coinBulgeBalance,
        null,
      );
      base = { ...packPreviewMeshBuffers(surface.triangles), faceCount: surface.triangles.length };
    }
    const reinforced = reinforceQuadConnectionsForMesh(request.patches, request.quadMeshJoinWidth);
    const bounds = computeSkinSamplingBounds(request.host, request.hostK, request.thickness, reinforced.patches);
    const meshStep = bounds.longest > 0 ? bounds.longest / request.resolution : 1 / request.resolution;
    const diagnosis = diagnoseSurfaceAnglePositions(
      base.positions,
      request.internalGraph,
      request.thresholdDeg,
      meshStep,
    );
    const motifLowestPoints = request.mode === "plate"
      ? findMotifMeshLowestPoints(base.positions, request.patches, request.internalGraph, meshStep, request.roundK, base.normals)
      : [];
    const {
      beforeDangerPositions,
      afterDangerPositions,
      mitigatedPositions,
      ...metrics
    } = diagnosis;
    const message: SurfaceAngleWorkerMessage = {
      type: "result",
      generation: request.generation,
      metrics,
      basePositions: base.positions,
      baseNormals: base.normals,
      baseFaceCount: base.faceCount,
      resolution: request.resolution,
      internalEdgeCount: request.internalGraph?.edges.length ?? 0,
      motifLowestPoints,
      beforeDangerPositions,
      afterDangerPositions,
      mitigatedPositions,
      elapsedMs: performance.now() - started,
    };
    self.postMessage(message, {
      transfer: [
        base.positions.buffer,
        base.normals.buffer,
        beforeDangerPositions.buffer,
        afterDangerPositions.buffer,
        mitigatedPositions.buffer,
      ],
    });
  } catch (error) {
    const message: SurfaceAngleWorkerMessage = {
      type: "error",
      generation: request.generation,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: performance.now() - started,
    };
    self.postMessage(message);
  }
};

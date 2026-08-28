/// <reference lib="webworker" />

import { buildSkinMesh, computeSkinSamplingBounds, reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import { packPreviewMeshBuffers } from "./previewMeshBuffers.ts";
import {
  compileInternalGraphReachability,
  diagnoseSurfaceAnglePositions,
  type SurfaceAngleDiagnosisProgress,
} from "./surfaceAngleDiagnosis.ts";
import {
  findMotifMeshLowestPoints,
  recomputeMotifLowestPointReachability,
} from "./motifLowestPoint.ts";
import {
  composeStage7ProvisionalDeltaDiagnosis,
  isValidStage7ProvisionalDeltaBaseline,
  validateStage7ProvisionalReachabilityMonotonic,
} from "./stage7ProvisionalDeltaRecheck.ts";
import { buildParallelMeshBuffers, type ParallelMeshBuffers } from "./parallelMeshBuffers.ts";
import type { PreviewMeshRequest } from "./previewMeshWorkerProtocol.ts";
import type { SurfaceAngleDiagnosisRequest, SurfaceAngleWorkerMessage } from "./surfaceAngleWorkerProtocol.ts";

function createProgressReporter(
  generation: number,
  started: number,
  recheckScope?: {
    mode: "full" | "delta";
    queryFaceCount: number;
    baselineFaceCount: number;
  },
): (progress: SurfaceAngleDiagnosisProgress) => void {
  const lastByStage = new Map<string, number>();
  return (progress) => {
    const last = lastByStage.get(progress.stage);
    const step = progress.total > 0 ? Math.max(1, Math.ceil(progress.total / 100)) : 1;
    if (progress.completed !== 0 && progress.completed !== progress.total
      && last !== undefined && progress.completed - last < step) return;
    lastByStage.set(progress.stage, progress.completed);
    const message: SurfaceAngleWorkerMessage = {
      type: "progress",
      generation,
      completedSlices: progress.completed,
      totalSlices: progress.total,
      faceCount: progress.stage === "dangerous-face-contact" ? progress.completed : 0,
      elapsedMs: performance.now() - started,
      stage: progress.stage,
      completed: progress.completed,
      total: progress.total,
      ...(recheckScope ? {
        recheckMode: recheckScope.mode,
        recheckQueryFaceCount: recheckScope.queryFaceCount,
        recheckBaselineFaceCount: recheckScope.baselineFaceCount,
      } : {}),
    };
    self.postMessage(message);
  };
}

self.onmessage = async (event: MessageEvent<SurfaceAngleDiagnosisRequest>): Promise<void> => {
  const request = event.data;
  const started = performance.now();
  try {
    if (request.type === "recheck") {
      const requestedDelta = request.recheckMode === "delta";
      const baseline = request.baseline;
      const baselineBeforeDangerFaceCount = baseline && baseline.beforeDangerPositions instanceof Float32Array
        ? baseline.beforeDangerPositions.length / 9 : 0;
      const baselineAfterDangerFaceCount = baseline && baseline.afterDangerPositions instanceof Float32Array
        ? baseline.afterDangerPositions.length / 9 : 0;
      const proof = requestedDelta && request.baseGraph && request.internalGraph
        ? validateStage7ProvisionalReachabilityMonotonic(request.baseGraph, request.internalGraph)
        : null;
      const baselineValid = isValidStage7ProvisionalDeltaBaseline(baseline);
      const deltaEligible = requestedDelta
        && Boolean(proof?.eligible)
        && baselineValid;
      const monotonicProof: "passed" | "failed" | "not-requested" = requestedDelta
        ? proof?.eligible ? "passed" : "failed"
        : "not-requested";
      let fallbackReason: "proof-failed" | "baseline-invalid" | "composition-mismatch" | undefined;
      if (requestedDelta && !proof?.eligible) fallbackReason = "proof-failed";
      else if (requestedDelta && !baselineValid) fallbackReason = "baseline-invalid";
      const recheckScope = {
        mode: deltaEligible ? "delta" as const : "full" as const,
        queryFaceCount: deltaEligible ? baselineAfterDangerFaceCount : Math.floor(request.basePositions.length / 9),
        baselineFaceCount: baselineBeforeDangerFaceCount,
      };
      let reportPhaseProgress = createProgressReporter(request.generation, started, recheckScope);
      const reachability = compileInternalGraphReachability(request.internalGraph, { onProgress: reportPhaseProgress });
      const diagnose = (positions: Float32Array) => diagnoseSurfaceAnglePositions(
        positions, request.internalGraph, request.thresholdDeg, request.meshStep,
        {
          reachabilityQuery: reachability,
          onProgress: (progress) => {
            if (progress.stage !== "complete") reportPhaseProgress(progress);
          },
        },
      );
      let diagnosis = diagnose(deltaEligible ? baseline!.afterDangerPositions.slice() : request.basePositions);
      let finalDiagnosis = diagnosis;
      if (deltaEligible) {
        const merged = composeStage7ProvisionalDeltaDiagnosis(baseline, diagnosis);
        if (merged) {
          finalDiagnosis = merged;
        } else {
          // Keep the exact compiled query, but repeat the original full input
          // when baseline composition does not pass its strict audit.
          fallbackReason = "composition-mismatch";
          recheckScope.mode = "full";
          recheckScope.queryFaceCount = Math.floor(request.basePositions.length / 9);
          // Start a fresh reporter so the full fallback's phase starts at zero
          // even after a partially completed delta phase.
          reportPhaseProgress = createProgressReporter(request.generation, started, recheckScope);
          diagnosis = diagnose(request.basePositions);
          finalDiagnosis = diagnosis;
        }
      }
      let motifLowestPoints;
      if (request.motifLowestPoints !== undefined) {
        reportPhaseProgress({
          stage: "motif-reachability",
          completed: 0,
          total: request.motifLowestPoints.length,
        });
        motifLowestPoints = recomputeMotifLowestPointReachability(
          request.motifLowestPoints,
          reachability,
          request.meshStep,
        );
        reportPhaseProgress({
          stage: "motif-reachability",
          completed: motifLowestPoints.length,
          total: motifLowestPoints.length,
        });
      } else {
        motifLowestPoints = request.mode === "plate"
          ? findMotifMeshLowestPoints(
              request.basePositions, request.patches, request.internalGraph, request.meshStep, request.roundK, request.baseNormals,
              { reachabilityQuery: reachability, onProgress: reportPhaseProgress },
            )
          : [];
      }
      reportPhaseProgress({ stage: "complete", completed: 1, total: 1 });
      const { beforeDangerPositions, afterDangerPositions, mitigatedPositions, ...metrics } = finalDiagnosis;
      const message: SurfaceAngleWorkerMessage = {
        type: "result", generation: request.generation, metrics,
        basePositions: request.basePositions, baseNormals: request.baseNormals, baseFaceCount: request.baseFaceCount,
        resolution: request.resolution, internalEdgeCount: request.internalGraph?.edges.length ?? 0, motifLowestPoints,
        beforeDangerPositions, afterDangerPositions, mitigatedPositions,
        elapsedMs: request.previousElapsedMs + performance.now() - started,
        ...(request.recheckMode ? {
          recheckAudit: {
            requestedMode: request.recheckMode,
            mode: recheckScope.mode,
            queryFaceCount: recheckScope.queryFaceCount,
            baselineBeforeDangerFaceCount,
            baselineAfterDangerFaceCount,
            monotonicProof,
            ...(fallbackReason ? { fallbackReason } : {}),
          },
        } : {}),
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

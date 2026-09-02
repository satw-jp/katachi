import {
  createEmptySkinRebuildGraph,
  mergeSkinRebuildGraphs,
  reinforceSkinRebuildOverhangRegion,
} from "./model.ts";
import {
  analyzeSkinRebuildPermanentReinforcementRedundancy,
  type SkinRebuildPermanentReinforcementRoute,
} from "./permanentReinforcementRedundancy.ts";
import type {
  SkinRebuildStage5BRequest,
  SkinRebuildStage5BWorkerMessage,
} from "./stage5bReinforcementWorkerProtocol.ts";

function post(message: SkinRebuildStage5BWorkerMessage): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = (event: MessageEvent<SkinRebuildStage5BRequest>) => {
  const request = event.data;
  if (request.type !== "build") return;
  const started = performance.now();
  try {
    let lattice = request.lattice;
    let reinforcement = createEmptySkinRebuildGraph();
    const regions: Extract<SkinRebuildStage5BWorkerMessage, { type: "result" }>["regions"] = [];
    const failures: Extract<SkinRebuildStage5BWorkerMessage, { type: "result" }>["failures"] = [];
    const routes: SkinRebuildPermanentReinforcementRoute[] = [];
    let lastProgressAt = Number.NEGATIVE_INFINITY;
    for (let regionIndex = 0; regionIndex < request.regions.length; regionIndex++) {
      const region = request.regions[regionIndex];
      try {
        let pendingSamples = region.surfaceSamples;
        let passCount = 0;
        let surfaceContactCount = 0;
        let segmentCount = 0;
        let maximumEdgeAngleDeg = 0;
        let redundantRouteCount = 0;
        while (pendingSamples.length > 0 && passCount < 3) {
          passCount++;
          const hubSample = pendingSamples[0];
          let result: ReturnType<typeof reinforceSkinRebuildOverhangRegion>;
          try {
            result = reinforceSkinRebuildOverhangRegion(
              request.base,
              request.patterns,
              request.patternSides,
              lattice,
              hubSample?.point ?? region.surfacePoint,
              hubSample?.normal ?? region.surfaceNormal,
              request.settings,
              pendingSamples,
              {
                onProgress: (progress) => {
                  const now = performance.now();
                  const terminal = progress.phase !== "routing"
                    || progress.candidateIndex === 0
                    || progress.candidateIndex === progress.candidateCount;
                  if (!terminal && now - lastProgressAt < 40) return;
                  lastProgressAt = now;
                  post({
                    type: "progress",
                    requestId: request.requestId,
                    regionIndex,
                    regionCount: request.regions.length,
                    regionId: region.regionId,
                    progress,
                    elapsedMs: now - started,
                  });
                },
              },
            );
          } catch (error) {
            if (surfaceContactCount === 0) throw error;
            break;
          }
          lattice = result.lattice;
          reinforcement = mergeSkinRebuildGraphs(reinforcement, result.reinforcement);
          routes.push(...result.routes.map((route) => ({ ...route, regionId: region.regionId })));
          surfaceContactCount += result.surfaceContactCount;
          segmentCount += result.segmentCount;
          maximumEdgeAngleDeg = Math.max(maximumEdgeAngleDeg, result.maximumEdgeAngleDeg);
          redundantRouteCount += result.redundantRouteCount;
          const nextPending = result.uncoveredSurfaceContactIndices
            .map((index) => pendingSamples[index])
            .filter((sample): sample is typeof pendingSamples[number] => Boolean(sample));
          if (nextPending.length >= pendingSamples.length) {
            pendingSamples = nextPending;
            break;
          }
          pendingSamples = nextPending;
        }
        regions.push({
          regionId: region.regionId,
          complete: pendingSamples.length === 0,
          passCount,
          surfaceContactCount,
          uncoveredSurfaceContactCount: pendingSamples.length,
          segmentCount,
          maximumEdgeAngleDeg,
          redundantRouteCount,
        });
      } catch (error) {
        failures.push({
          regionId: region.regionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const redundancy = analyzeSkinRebuildPermanentReinforcementRedundancy({
      beforeGraph: request.lattice,
      afterGraph: lattice,
      reinforcementGraph: reinforcement,
      motifPatchIds: request.patternSides.map((side) => side.patchId),
      routes,
      regions,
      surfaceSampleCount: request.regions.reduce((sum, region) => sum + region.surfaceSamples.length, 0),
      minimumStrutDiameterMm: request.settings.strutDiameterMm,
    });
    post({
      type: "result",
      requestId: request.requestId,
      lattice,
      reinforcement,
      regions,
      failures,
      redundancy,
      elapsedMs: performance.now() - started,
    });
  } catch (error) {
    post({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: performance.now() - started,
    });
  }
};

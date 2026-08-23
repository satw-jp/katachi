/// <reference lib="webworker" />

import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { estimateCoverage, estimateMortar, estimatePatchComponents } from "./field.ts";
import { estimateRingLinking, findDeepPatchOverlaps } from "./linking.ts";
import type { GaugeBuildRequest, GaugeWorkerMessage } from "./gaugeWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<GaugeBuildRequest>): void => {
  const request = event.data;
  if (request.type !== "build") return;
  try {
    const mortar = estimateMortar(request.patches);
    const coverage = estimateCoverage(
      request.host,
      request.hostK,
      request.thickness,
      request.patches,
      request.roundK,
    );
    const patchComponents = estimatePatchComponents(request.patches, request.roundK);
    const bounds = request.host.length > 0 ? computeSamplingBounds(request.host, request.hostK) : null;
    const mmPerUnit = bounds && bounds.longest > 0 ? request.targetLongestMm / bounds.longest : 1;
    const linking = estimateRingLinking(request.patches);
    const overlaps = findDeepPatchOverlaps(request.patches);
    const message: GaugeWorkerMessage = {
      type: "result",
      generation: request.generation,
      mortar,
      coverage,
      patchComponents,
      mmPerUnit,
      linking,
      overlaps,
    };
    self.postMessage(message);
  } catch (error) {
    const message: GaugeWorkerMessage = {
      type: "error",
      generation: request.generation,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
};

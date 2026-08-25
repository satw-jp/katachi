/// <reference lib="webworker" />

import { resolveDryWebRouting } from "./dryWebRouting.ts";
import { buildTargetedGridInternalStructure } from "./targetedGrid.ts";
import type { DryWebPreviewWorkerMessage, DryWebPreviewWorkerRequest } from "./dryWebPreviewWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<DryWebPreviewWorkerRequest>): void => {
  const request = event.data;
  const started = performance.now();
  try {
    const routing = resolveDryWebRouting(request.entries, request.scaleMmPerUnit);
    const graph = buildTargetedGridInternalStructure(
      request.host,
      request.hostK,
      request.patches,
      routing.targets,
      request.internalDensity,
      request.internalRadius,
    );
    const message: DryWebPreviewWorkerMessage = {
      type: "result",
      generation: request.generation,
      requestId: request.requestId,
      paintRevision: request.paintRevision,
      surfaceFingerprint: request.surfaceFingerprint,
      resolution: request.resolution,
      targets: routing.targets,
      facts: routing.facts,
      graph,
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  } catch (error) {
    const message: DryWebPreviewWorkerMessage = {
      type: "error",
      generation: request.generation,
      requestId: request.requestId,
      paintRevision: request.paintRevision,
      message: error instanceof Error ? error.message : String(error),
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  }
};

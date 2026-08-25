/// <reference lib="webworker" />

import { SupportPaintLiveState } from "./supportPaintLive.ts";
import type { SupportPaintWorkerMessage, SupportPaintWorkerRequest } from "./supportPaintWorkerProtocol.ts";

let generation = 0;
let live: SupportPaintLiveState | null = null;

self.onmessage = (event: MessageEvent<SupportPaintWorkerRequest>): void => {
  const request = event.data;
  const started = performance.now();
  try {
    if (request.type === "initialize") {
      generation = request.generation;
      live = new SupportPaintLiveState(
        request.automaticResult,
        request.supportSurfacePositionsMm,
        null,
      );
      const snapshot = request.supportPaint
        ? live.replace(request.supportPaint)
        : { changes: [], facts: {
            strokeCount: 0,
            automaticCounts: {
              inside: request.automaticResult.counts.insideSupportSite,
              outside: request.automaticResult.counts.outsideSupportSite,
              unresolved: request.automaticResult.counts.unresolvedSupportSite,
            },
            paintedSupportSiteCount: 0,
            manualOverrideSupportSiteCount: 0,
            autoResetSupportSiteCount: 0,
            finalCounts: {
              inside: request.automaticResult.counts.insideSupportSite,
              outside: request.automaticResult.counts.outsideSupportSite,
              unresolved: request.automaticResult.counts.unresolvedSupportSite,
            },
          } };
      const message: SupportPaintWorkerMessage = {
        type: "ready",
        generation,
        revision: request.revision,
        snapshot,
        computeMs: performance.now() - started,
      };
      self.postMessage(message);
      return;
    }
    if (!live || request.generation !== generation) return;
    const snapshot = request.type === "dab"
      ? live.applyDab(request.stroke)
      : request.type === "restore"
        ? live.restore(request.snapshot)
        : live.replace(request.supportPaint);
    const message: SupportPaintWorkerMessage = {
      type: request.type,
      generation,
      revision: request.revision,
      requestId: request.requestId,
      changes: snapshot.changes,
      facts: snapshot.facts,
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  } catch (error) {
    const message: SupportPaintWorkerMessage = {
      type: "error",
      generation: request.generation,
      revision: request.revision,
      ...("requestId" in request ? { requestId: request.requestId } : {}),
      message: error instanceof Error ? error.message : String(error),
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  }
};

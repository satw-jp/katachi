/// <reference lib="webworker" />

import {
  applySupportPaintToPolicyResult,
  validateOverhangAssignmentLedger,
} from "./overhangSupportPolicy.ts";
import type {
  SupportPaintWorkerMessage,
  SupportPaintWorkerRequest,
} from "./supportPaintWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<SupportPaintWorkerRequest>): void => {
  const request = event.data;
  if (request.type !== "apply") return;
  const started = performance.now();
  try {
    const result = applySupportPaintToPolicyResult(
      request.automaticResult,
      request.supportSurfacePositionsMm,
      request.supportPaint,
    );
    validateOverhangAssignmentLedger(result);
    const message: SupportPaintWorkerMessage = {
      type: "result",
      revision: request.revision,
      result,
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  } catch (error) {
    const message: SupportPaintWorkerMessage = {
      type: "error",
      revision: request.revision,
      message: error instanceof Error ? error.message : String(error),
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  }
};

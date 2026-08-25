/// <reference lib="webworker" />

import { SupportPaintSurfaceIndex } from "./supportPaintSurfaceIndex.ts";
import type { SupportPaintRaycastWorkerMessage, SupportPaintRaycastWorkerRequest } from "./supportPaintRaycastWorkerProtocol.ts";

let generation = 0;
let index: SupportPaintSurfaceIndex | null = null;

self.onmessage = (event: MessageEvent<SupportPaintRaycastWorkerRequest>): void => {
  const request = event.data;
  try {
    if (request.type === "initialize") {
      const started = performance.now();
      generation = request.generation;
      self.postMessage({ type: "progress", generation, phase: "building", triangleCount: request.positions.length / 9 } satisfies SupportPaintRaycastWorkerMessage);
      index = new SupportPaintSurfaceIndex(request.positions);
      const message: SupportPaintRaycastWorkerMessage = {
        type: "ready", generation, triangleCount: index.triangleCount, nodeCount: index.nodeCount,
        buildMs: performance.now() - started,
      };
      self.postMessage(message);
      return;
    }
    if (!index || request.generation !== generation) return;
    const started = performance.now();
    const message: SupportPaintRaycastWorkerMessage = {
      type: "hit", generation, requestId: request.requestId,
      hit: index.raycast(request.ray, request.clipping), computeMs: performance.now() - started,
    };
    self.postMessage(message);
  } catch (error) {
    const message: SupportPaintRaycastWorkerMessage = {
      type: "error", generation: request.generation,
      ...(request.type === "raycast" ? { requestId: request.requestId } : {}),
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
};

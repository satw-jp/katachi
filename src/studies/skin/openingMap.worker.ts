import { measureOpenings } from "./openingMap.ts";
import type { OpeningMapRequest, OpeningMapWorkerMessage } from "./openingMapWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<OpeningMapRequest>) => {
  const request = event.data;
  if (request.type !== "measure") return;
  const started = performance.now();
  const post = (message: OpeningMapWorkerMessage) => (self as unknown as Worker).postMessage(message);
  try {
    const result = measureOpenings(request, (stage) => post({ type: "progress", requestId: request.requestId, generation: request.generation, stage, elapsedMs: performance.now() - started }));
    post({ type: "result", requestId: request.requestId, generation: request.generation, result, elapsedMs: performance.now() - started });
  } catch (error) {
    post({ type: "error", requestId: request.requestId, generation: request.generation, message: (error as Error).message, elapsedMs: performance.now() - started });
  }
};

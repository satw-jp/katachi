import type { SamplingWorkerRequest, SamplingWorkerResponse } from "./contracts.ts";
import { fitObservationCameras } from "./cameraFit.ts";
import { calculatePca } from "./pca.ts";
import { sampleSdfSurface } from "./surfaceSampling.ts";
import { validateFormGeometry, validatePointBudget } from "./validation.ts";

export function processSamplingRequest(request: SamplingWorkerRequest, postProgress?: (response: SamplingWorkerResponse) => void): Extract<SamplingWorkerResponse, { type: "result" }> {
  validateFormGeometry(request.geometry);
  validatePointBudget(request.pointBudget);
  postProgress?.({ type: "progress", requestId: request.requestId, progress: { stage: "validating", fraction: 1, message: "Validating geometry" } });
  const pointSet = sampleSdfSurface(request.geometry, request.pointBudget, {
    samplingVersion: request.samplingVersion,
    onProgress: (progress) => postProgress?.({ type: "progress", requestId: request.requestId, progress }),
  });
  postProgress?.({ type: "progress", requestId: request.requestId, progress: { stage: "pca", fraction: 0, message: "Calculating principal directions" } });
  const pca = calculatePca(pointSet);
  const cameraFit = fitObservationCameras(pointSet, pca);
  postProgress?.({ type: "progress", requestId: request.requestId, progress: { stage: "complete", fraction: 1, message: `${pointSet.pointCount} points ready` } });
  return { type: "result", requestId: request.requestId, pointSet, pca, cameraFit };
}

const workerScope = globalThis as typeof globalThis & { postMessage?: (message: SamplingWorkerResponse, transfer: Transferable[]) => void; onmessage?: (event: MessageEvent<SamplingWorkerRequest>) => void };
if (typeof workerScope.postMessage === "function") {
  workerScope.onmessage = (event): void => {
    const request = event.data;
    try {
      if (request.type !== "sample") throw new RangeError("Unknown FORM worker request");
      const result = processSamplingRequest(request, (progress) => workerScope.postMessage?.(progress, []));
      workerScope.postMessage?.(result, [result.pointSet.positions.buffer]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      workerScope.postMessage?.({ type: "error", requestId: request?.requestId ?? "unknown", error: message }, []);
    }
  };
}

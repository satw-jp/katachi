import { buildNPartitionMeshes } from "./nPartition.ts";
import type { NPartitionBuildRequest, NPartitionWorkerMessage } from "./nPartitionWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<NPartitionBuildRequest>) => {
  const request = event.data;
  if (request.type !== "build-n") return;
  const startedAt = performance.now();
  const post = (message: NPartitionWorkerMessage) => (self as unknown as Worker).postMessage(message);
  try {
    const result = buildNPartitionMeshes(
      request.mode, request.host, request.hostK, request.thickness, request.patches,
      request.groups, request.roundK, request.options, request.coinBulge, request.quadMeshJoinWidth,
      request.coinBulgeBalance,
      (fraction, stage) => post({ type: "progress", requestId: request.requestId, stage, fraction, elapsedMs: performance.now() - startedAt }),
    );
    post({ type: "result", requestId: request.requestId, result, elapsedMs: performance.now() - startedAt });
  } catch (error) {
    post({ type: "error", requestId: request.requestId, message: (error as Error).message, elapsedMs: performance.now() - startedAt });
  }
};

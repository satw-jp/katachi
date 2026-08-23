// ---------------------------------------------------------------------------
// T13 audit fix P0-2: buildPartitionMeshes runs here, off the main thread,
// so a slow A/B split (real CoinSRF: 141 patches) no longer freezes the tab
// (main.ts's old synchronous call exceeded a 30s verification timeout twice
// in the audit -- see skin/README.md Observation). Cancellation is handled
// by main.ts simply calling worker.terminate() (blunt but immediate and
// correct for a single long-running computation with no partial state worth
// preserving); this file does not need to poll a cancellation flag itself.
// ---------------------------------------------------------------------------

import { buildPartitionMeshes } from "./partition.ts";
import type { PartitionBuildRequest, PartitionWorkerMessage } from "./partitionWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<PartitionBuildRequest>) => {
  const request = event.data;
  if (request.type !== "build") return;
  // gate-correction P1-2: measure elapsed time from when the build request
  // is actually received, not from Worker module load -- the previous round
  // included module/script startup latency in every reported elapsedMs.
  const startedAt = performance.now();
  const { requestId } = request;
  const post = (message: PartitionWorkerMessage) => (self as unknown as Worker).postMessage(message);
  try {
    const result = buildPartitionMeshes(
      request.mode,
      request.host,
      request.hostK,
      request.thickness,
      request.patches,
      request.groupA,
      request.groupB,
      request.roundK,
      request.options,
      request.coinBulge,
      request.quadMeshJoinWidth,
      request.coinBulgeBalance,
      (fraction, stage) => {
        post({ type: "progress", requestId, stage, fraction, elapsedMs: performance.now() - startedAt });
      },
    );
    post({ type: "result", requestId, result, elapsedMs: performance.now() - startedAt });
  } catch (err) {
    post({ type: "error", requestId, message: (err as Error).message, elapsedMs: performance.now() - startedAt });
  }
};

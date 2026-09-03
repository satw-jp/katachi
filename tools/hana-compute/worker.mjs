import { parentPort } from "node:worker_threads";
import {
  parseHanaFinalizationSnapshot,
} from "../../src/studies/hana/finalizationCore.ts";
import { encodeHanaFinalizationResult } from "../../src/studies/hana/computeProtocol.ts";
import { CpuJsHanaComputeEngine } from "../../src/studies/hana/computeEngine.ts";

if (!parentPort) throw new Error("HANA compute worker requires parentPort");

const cancelled = new Set();
const engine = new CpuJsHanaComputeEngine();

parentPort.on("message", async (message) => {
  if (message?.type === "cancel") {
    if (typeof message.requestId === "string") cancelled.add(message.requestId);
    return;
  }
  if (message?.type !== "finalize" || typeof message.requestId !== "string") return;
  const requestId = message.requestId;
  try {
    const snapshot = parseHanaFinalizationSnapshot(message.snapshot);
    const result = await engine.finalize(snapshot, {
      isCancelled: () => cancelled.has(requestId),
    });
    if (cancelled.has(requestId)) {
      cancelled.delete(requestId);
      parentPort.postMessage({ type: "cancelled", requestId });
      return;
    }
    const encoded = encodeHanaFinalizationResult(result);
    parentPort.postMessage({ type: "result", requestId, buffer: encoded }, [encoded]);
  } catch (error) {
    cancelled.delete(requestId);
    parentPort.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : "HANA compute worker failed",
    });
  }
});

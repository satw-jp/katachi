import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  FRAME_KIND_JSON_REQUEST,
  PersistentCudaWorker,
  encodeWorkerFrame,
} from "./persistent-cuda-worker.mjs";

test("persistent worker frames use explicit magic, version, kind and uint64 length", () => {
  const frame = encodeWorkerFrame(FRAME_KIND_JSON_REQUEST, Buffer.from("{}"));
  assert.equal(frame.subarray(0, 4).toString("ascii"), "KCF1");
  assert.equal(frame.readUInt16LE(4), 1);
  assert.equal(frame.readUInt16LE(6), FRAME_KIND_JSON_REQUEST);
  assert.equal(frame.readBigUInt64LE(8), 2n);
  assert.equal(frame.subarray(16).toString("utf8"), "{}");
});

test("real persistent CUDA worker reuses context and recovers after an active crash", {
  skip: process.platform !== "win32",
  timeout: 20_000,
}, async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/containment-v1.json", import.meta.url),
    "utf8",
  ));
  const worker = new PersistentCudaWorker();
  try {
    const first = await worker.evaluate({ ...fixture, clientRequestId: "persistent-test-1" });
    const firstState = worker.diagnostics();
    const second = await worker.evaluate({ ...fixture, clientRequestId: "persistent-test-2" });
    const secondState = worker.diagnostics();
    assert.equal(firstState.pid, secondState.pid);
    assert.equal(firstState.generation, secondState.generation);
    assert.equal(second.result.timing.contextReused, true);
    assert.equal(second.result.timing.moduleReused, true);
    assert.equal(second.result.timing.functionReused, true);
    assert.equal(second.result.timing.ballBufferReused, true);
    assert.equal(second.result.timing.sampleBufferReused, true);
    assert.equal(second.result.timing.outputBufferReused, true);

    const longRequest = {
      ...fixture,
      clientRequestId: "persistent-test-crash",
      quality: { ...fixture.quality, benchmarkIterations: 10_000 },
    };
    const interrupted = worker.evaluate(longRequest);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await worker.terminateWorker();
    await assert.rejects(interrupted, (error) => error?.code === "cuda_worker_crashed");

    const recovered = await worker.evaluate({ ...fixture, clientRequestId: "persistent-test-recovered" });
    const recoveredState = worker.diagnostics();
    assert.notEqual(recoveredState.pid, secondState.pid);
    assert.equal(recoveredState.generation, secondState.generation + 1);
    assert.equal(recovered.result.productionApplied, false);
    assert.equal(recovered.result.shadow, true);
    assert.deepEqual(
      recovered.result.samples.map(({ sampleId, edgeId }) => ({ sampleId, edgeId })),
      fixture.input.samples.map(({ sampleId, edgeId }) => ({ sampleId, edgeId })),
    );
  } finally {
    await worker.close();
  }
});

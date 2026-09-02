import assert from "node:assert/strict";

import { createRequest, fixtureSummary } from "./build_fixture.mjs";
import { HikariMitsubaClient } from "./client.ts";

const client = new HikariMitsubaClient({ timeoutMs: 120_000 });
const capabilities = await client.capabilities();
assert.equal(capabilities.bindAddress, "127.0.0.1");
assert.equal(capabilities.port, 47659);
assert.equal(capabilities.optix, "unknown");
assert.equal(capabilities.workerReady, true);
assert.equal(capabilities.cudaAvailable, true, "RTX smoke requires CUDA capability");
assert.equal(capabilities.selectedVariant, "cuda_ad_rgb");
assert.ok(capabilities.gpu?.name);

const renders = [];
for (const purpose of ["body", "receiver"]) {
  const result = await client.render(createRequest(purpose, "cuda"), { timeoutMs: 120_000 });
  assert.equal(result.metadata.purpose, purpose);
  assert.equal(result.metadata.executionDevice, "cuda");
  assert.equal(result.metadata.selectedVariant, "cuda_ad_rgb");
  assert.equal(result.metadata.cudaFallback, false);
  assert.equal(result.artifact.byteLength, result.metadata.artifactByteLength);
  renders.push({
    purpose,
    renderMs: result.metadata.renderMs,
    artifactHash: result.metadata.artifactHash,
    artifactBytes: result.artifact.byteLength,
  });
}

// Exercise browser-side abort plus the server's provenance-bound cancellation
// path with a deliberately larger but still bounded request.
const cancelRequest = { ...createRequest("body", "cuda"), requestId: "p0-cancel-cuda", spp: 32, resolution: { width: 256, height: 256 } };
const controller = new AbortController();
const pending = client.render(cancelRequest, { signal: controller.signal, timeoutMs: 120_000 });
setTimeout(() => controller.abort(), 10);
let cancellationCode = "completed-too-quickly";
try {
  await pending;
} catch (error) {
  cancellationCode = error?.code ?? "unknown";
}
assert.equal(cancellationCode, "cancelled");
const reconnected = await client.capabilities();
assert.equal(reconnected.workerReady, true);

console.log(JSON.stringify({ fixture: fixtureSummary, gpu: capabilities.gpu, renders, cancellationCode }, null, 2));

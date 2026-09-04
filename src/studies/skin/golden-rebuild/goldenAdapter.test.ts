import assert from "node:assert/strict";
import {
  createGoldenAdapterRegistry,
  DEFAULT_GOLDEN_RUNTIME_DATA,
  GOLDEN_ARTIFACT_IDS,
  GOLDEN_SOURCE_HEAD,
} from "./goldenAdapter.ts";

const registry = createGoldenAdapterRegistry();
assert.deepEqual(registry.list().map((artifact) => artifact.id), GOLDEN_ARTIFACT_IDS);
assert.equal(registry.get("body")?.status, "current");
assert.equal(registry.get("body")?.provenance.source, "golden-luna:production-runtime");
assert.equal(registry.get("reinforcement")?.status, "unavailable");
assert.equal(registry.get("removable-support")?.provenance.source, "current-stage8:sparseResult.graph");
assert.equal(registry.list().filter((artifact) => "graph" in artifact).length, 5);
assert.equal(GOLDEN_SOURCE_HEAD, "c93a031569219c95f69d5ee0570e2b6845a0368a");

const body = registry.get("body");
assert.ok(body);
assert.ok(body.data);
const originalSummary = body.data.summary;
try {
  (body.data as { summary: string }).summary = "mutated";
} catch {
  // Object.freeze is expected to reject mutation in strict mode.
}
assert.equal(body.data.summary, originalSummary, "adapter data is read-only");

const copiedSource = JSON.parse(JSON.stringify(DEFAULT_GOLDEN_RUNTIME_DATA)) as typeof DEFAULT_GOLDEN_RUNTIME_DATA;
const copiedRegistry = createGoldenAdapterRegistry(copiedSource);
assert.notEqual(copiedRegistry.get("body"), registry.get("body"));
assert.equal(copiedRegistry.get("body")?.fingerprint, registry.get("body")?.fingerprint);

console.log("golden rebuild read-only adapter passed");

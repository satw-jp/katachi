import assert from "node:assert/strict";
import {
  createArtifactRegistry,
  createDerivedArtifact,
  createGraphArtifact,
  fingerprintValue,
} from "./contracts.ts";

const provenance = {
  source: "test:golden",
  sourceFingerprint: "source-fp",
  upstream: ["base"],
  algorithmVersion: "v0",
};

const artifact = createDerivedArtifact({
  data: { counts: { nodes: 2 }, nested: { label: "stable" } },
  status: "current",
  role: "test.graph",
  provenance,
});

assert.equal(artifact.status, "current");
assert.deepEqual(artifact.provenance, provenance, "provenance is retained");
assert.equal(
  fingerprintValue("stable", { b: 2, a: 1 }),
  fingerprintValue("stable", { a: 1, b: 2 }),
  "canonical fingerprints are stable across object key order",
);
assert.equal(typeof artifact.fingerprint, "string");
assert.equal(artifact.fingerprint?.length, 64);

const graph = createGraphArtifact({
  id: "surface",
  data: { summary: "surface", graph: { nodeCount: 2, edgeCount: 1 } },
  graph: { nodeCount: 2, edgeCount: 1 },
  status: "current",
  role: "derived.surface-graph",
  provenance,
});
assert.deepEqual(graph.graph, { nodeCount: 2, edgeCount: 1 });
assert.equal(graph.editable, false);

const registry = createArtifactRegistry([{
  id: "one",
  ...artifact,
}]);
assert.equal(registry.has("one"), true);
assert.equal(registry.get("one")?.role, "test.graph");
assert.deepEqual(registry.list().map((item) => item.id), ["one"]);

console.log("golden rebuild contracts passed");

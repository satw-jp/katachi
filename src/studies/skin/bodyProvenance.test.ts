import assert from "node:assert/strict";
import { test } from "node:test";
import { BODY_PROVENANCE_FORMAT, BODY_PROVENANCE_ID, parseBodyProvenance, validateBodyProvenanceGraph, validateBodyProvenanceInput } from "./bodyProvenance.ts";

const sha = "a".repeat(64);
const valid = () => ({
  format: BODY_PROVENANCE_FORMAT, id: BODY_PROVENANCE_ID, recipeSha256: sha, bodyStlSha256: "b".repeat(64),
  targetLongestMm: 80, resolution: 128, internalStructure: "targetedGrid", expectedGraphNodes: 1490, expectedGraphEdges: 823,
});

test("strict v1 BODY provenance accepts the exact known contract", () => {
  const provenance = parseBodyProvenance(valid());
  validateBodyProvenanceInput(provenance, { recipeSha256: sha, bodyStlSha256: "b".repeat(64), targetLongestMm: 80, resolution: 128, internalStructure: "targetedGrid" });
  validateBodyProvenanceGraph(provenance, { nodes: { length: 1490 }, edges: { length: 823 } });
});

test("strict v1 BODY provenance rejects malformed, byte, option, and graph mismatches", () => {
  assert.throws(() => parseBodyProvenance({ ...valid(), extra: true }), /schema keys/);
  assert.throws(() => parseBodyProvenance({ ...valid(), recipeSha256: "A".repeat(64) }), /lowercase SHA-256/);
  const provenance = parseBodyProvenance(valid());
  assert.throws(() => validateBodyProvenanceInput(provenance, { recipeSha256: "c".repeat(64), bodyStlSha256: "b".repeat(64), targetLongestMm: 80, resolution: 128, internalStructure: "targetedGrid" }), /recipeSha256/);
  assert.throws(() => validateBodyProvenanceGraph(provenance, { nodes: { length: 1491 }, edges: { length: 823 } }), /expected graph/);
});

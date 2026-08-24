import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OVERHANG_SUPPORT_POLICY,
  assignOverhangSupportTargets,
  summarizeOverhangAssignmentLedger,
  validateOverhangAssignmentLedger,
} from "./overhangSupportPolicy.ts";

const triangle = (z: number, offsetX = 0): Float32Array => new Float32Array([
  offsetX, 0, z, offsetX + 2, 0, z, offsetX, 2, z,
]);

test("mixed diagnosed faces and explicit Profile points form a deterministic exactly-once partition", () => {
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [triangle(3, 10), triangle(3)],
    explicitTargets: [{ xMm: 10, yMm: 1, zMm: 3 }, { xMm: 1, yMm: 1, zMm: 3 }],
    finalSurfacePositionsMm: triangle(1),
  });
  assert.equal(result.policy, OVERHANG_SUPPORT_POLICY);
  assert.deepEqual(result.entries.map((entry) => entry.id), [
    "diagnosed-face:000000", "diagnosed-face:000001", "explicit-profile:000000", "explicit-profile:000001",
  ]);
  assert.deepEqual(result.entries.map((entry) => entry.classification), ["outside", "inside", "outside", "inside"]);
  assert.deepEqual(result.counts, { total: 4, inside: 2, outside: 2, unresolved: 0, duplicate: 0, unassigned: 0 });
  assert.equal(result.outsideFacePositionsMm.length, 9);
  assert.equal(result.outsideExplicitTargetsMm.length, 1);
  assert.equal(result.insideTargets.length, 2);
  assert.deepEqual(validateOverhangAssignmentLedger(result), result.counts);
});

test("malformed input remains in the ledger as unresolved and fails closed", () => {
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1])],
    explicitTargets: [{ xMm: Number.NaN, yMm: 1, zMm: 3 }],
    finalSurfacePositionsMm: triangle(0),
  });
  assert.equal(result.counts.total, 2);
  assert.equal(result.counts.unresolved, 2);
  assert.throws(() => validateOverhangAssignmentLedger(result), /unresolved/);
});

test("duplicate and missing assignments are rejected instead of normalized away", () => {
  const valid = assignOverhangSupportTargets({ diagnosedFaces: [triangle(3)], finalSurfacePositionsMm: triangle(0) });
  const duplicate = {
    ...valid,
    entries: [valid.entries[0], { ...valid.entries[0], classification: "outside" as const }],
  };
  const duplicateCounts = summarizeOverhangAssignmentLedger(duplicate);
  assert.equal(duplicateCounts.duplicate, 1);
  assert.throws(() => validateOverhangAssignmentLedger({ ...duplicate, counts: duplicateCounts }), /duplicate/);

  const unassigned = {
    ...valid,
    entries: [{ ...valid.entries[0], classification: undefined as never }],
  };
  const unassignedCounts = summarizeOverhangAssignmentLedger(unassigned);
  assert.equal(unassignedCounts.unassigned, 1);
  assert.throws(() => validateOverhangAssignmentLedger({ ...unassigned, counts: unassignedCounts }), /partition/);
});

test("partly blocked deterministic samples are unresolved rather than silently routed", () => {
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [new Float32Array([0, 0, 3, 2, 0, 3, 0, 2, 3])],
    finalSurfacePositionsMm: triangle(1, 0.9),
  });
  assert.equal(result.counts.unresolved, 1);
  assert.equal(result.outsideFacePositionsMm.length, 0);
  assert.equal(result.insideTargets.length, 0);
});

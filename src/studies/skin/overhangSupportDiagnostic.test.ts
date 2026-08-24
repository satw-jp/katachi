import assert from "node:assert/strict";
import { test } from "node:test";
import { assignOverhangSupportTargets, validateOverhangAssignmentLedger } from "./overhangSupportPolicy.ts";
import { buildOverhangSupportDiagnostic } from "./overhangSupportDiagnostic.ts";

const face = new Float32Array([0, 0, 3, 2, 0, 3, 0, 2, 3]);
const lower = new Float32Array([0.9, 0, 1, 2.9, 0, 1, 0.9, 2, 1]);

test("mixed faces are diagnostic-only when every support site is classified", () => {
  const assignments = assignOverhangSupportTargets({ diagnosedFaces: [face], finalSurfacePositionsMm: lower });
  assert.equal(assignments.counts.mixedFace, 1);
  assert.equal(assignments.counts.unresolvedSupportSite, 0);
  assert.doesNotThrow(() => validateOverhangAssignmentLedger(assignments));

  const diagnostic = buildOverhangSupportDiagnostic({
    ledger: assignments,
    finalSurfacePositionsMm: lower,
    dryWebConnectionCandidatesMm: [{ xMm: 1, yMm: 1, zMm: 1 }],
    plateZMm: 0,
  });
  assert.deepEqual(diagnostic.summary, {
    unresolvedTotal: 0,
    baseClassificationUnresolved: 0,
    insideDryWebDestinationMissing: 0,
    outsideScaffoldDestinationMissing: 0,
    other: 0,
    v087ExcludedCoordinateMatches: 0,
  });
  assert.deepEqual(diagnostic.records, []);
});

test("only an unresolved individual support site is reported and fails closed", () => {
  const assignments = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: Number.NaN, yMm: 1, zMm: 3 }],
    finalSurfacePositionsMm: lower,
  });
  assert.throws(() => validateOverhangAssignmentLedger(assignments), /unresolved support sites/);

  const diagnostic = buildOverhangSupportDiagnostic({
    ledger: assignments,
    finalSurfacePositionsMm: lower,
    plateZMm: 0,
  });
  assert.equal(diagnostic.summary.unresolvedTotal, 1);
  assert.equal(diagnostic.summary.other, 1);
  assert.equal(diagnostic.records[0].failureReason, "malformed-or-nonfinite-explicit-target");
});

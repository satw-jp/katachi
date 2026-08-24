import assert from "node:assert/strict";
import { test } from "node:test";
import { assignOverhangSupportTargets } from "./overhangSupportPolicy.ts";
import { buildOverhangSupportDiagnostic } from "./overhangSupportDiagnostic.ts";

const face = new Float32Array([0, 0, 3, 2, 0, 3, 0, 2, 3]);
const lower = new Float32Array([0.9, 0, 1, 2.9, 0, 1, 0.9, 2, 1]);

test("mixed lower-envelope samples produce a coordinate-preserving v087 exclusion diagnostic", () => {
  const assignments = assignOverhangSupportTargets({ diagnosedFaces: [face], finalSurfacePositionsMm: lower });
  const diagnostic = buildOverhangSupportDiagnostic({
    ledger: assignments,
    finalSurfacePositionsMm: lower,
    dryWebConnectionCandidatesMm: [{ xMm: 1, yMm: 1, zMm: 1 }],
    plateZMm: 0,
  });
  assert.deepEqual(diagnostic.summary, {
    unresolvedTotal: 1,
    baseClassificationUnresolved: 1,
    insideDryWebDestinationMissing: 0,
    outsideScaffoldDestinationMissing: 0,
    other: 0,
    v087ExcludedCoordinateMatches: 1,
  });
  assert.equal(diagnostic.records[0].id, "diagnosed-face:000000");
  assert.equal(diagnostic.records[0].currentMmClassification, "unresolved");
  assert.deepEqual(diagnostic.records[0].sampleCounts, { inside: 1, outside: 3 });
  assert.equal(diagnostic.records[0].nearestLowerSurfaceDistanceMm, 2);
  assert.ok(diagnostic.records[0].nearestDryWebConnectionCandidateDistanceMm! > 0);
  assert.equal(diagnostic.records[0].nearestScaffoldConnectionCandidateDistanceMm, 3);
});

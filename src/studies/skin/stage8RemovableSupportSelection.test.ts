import assert from "node:assert/strict";
import {
  createDryWebSupportSeparationPresentation,
} from "./dryWebSupportSeparationPresentation.ts";
import {
  selectStage8RemovableSupportPreviewLeaves,
} from "./stage8RemovableSupportSelection.ts";
import type { OverhangAssignmentEntry } from "./overhangSupportPolicy.ts";

const triangle = (x: number): Float32Array => new Float32Array([
  x, 0, 0,
  x, 1, 0,
  x, 0, 1,
]);
const concat = (...parts: Float32Array[]): Float32Array => {
  const result = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
const entry = (
  source: OverhangAssignmentEntry["source"],
  sourceIndex: number,
  classification: OverhangAssignmentEntry["classification"],
  options: Partial<OverhangAssignmentEntry> = {},
): OverhangAssignmentEntry => ({
  id: `${source}:${sourceIndex}:${options.siteIndex ?? 0}`,
  source,
  sourceIndex,
  siteIndex: options.siteIndex ?? 0,
  classification,
  ...(source === "diagnosed-face" ? { faceIndex: sourceIndex } : {}),
  positionMm: { xMm: sourceIndex, yMm: 0, zMm: 1 },
  ...options,
});
const outsideFaceEntries = (faceIndex: number): OverhangAssignmentEntry[] =>
  [0, 1, 2, 3].map((siteIndex) => entry("diagnosed-face", faceIndex, "outside", { faceIndex, siteIndex }));

const t0 = triangle(0);
const t1 = triangle(1);
const t2 = triangle(2);
const separation = createDryWebSupportSeparationPresentation({
  beforeDangerPositions: concat(t0, t1, t2),
  afterDangerPositions: concat(t0, t1),
  mitigatedPositions: t2,
  entries: [...outsideFaceEntries(0), ...outsideFaceEntries(1)],
});
assert.equal(separation.state, "current");
assert.deepEqual(separation.outsideSourceFaceIndices, [0, 1]);

const diagnosedBefore = outsideFaceEntries(0).concat(outsideFaceEntries(1), outsideFaceEntries(2));
const entries: OverhangAssignmentEntry[] = [
  ...diagnosedBefore,
  entry("explicit-profile", 0, "outside", { positionMm: { xMm: 20, yMm: 0, zMm: 1 } }),
  entry("diagnosed-face", 0, "outside", { faceIndex: 0, siteIndex: 9, duplicateOf: "diagnosed-face:0:0" }),
  entry("diagnosed-face", 1, "outside", { faceIndex: 1, siteIndex: 8, positionMm: { xMm: Number.NaN, yMm: 0, zMm: 1 } }),
  entry("diagnosed-face", 1, "inside", { faceIndex: 1, siteIndex: 7 }),
];
const entriesSnapshot = JSON.stringify(entries);
const first = selectStage8RemovableSupportPreviewLeaves({ entries, separation, maximumLeaves: 3 });
const second = selectStage8RemovableSupportPreviewLeaves({ entries, separation, maximumLeaves: 3 });
assert.equal(first.failClosedReason, null);
assert.equal(first.exactOrangeFaceCount, 2);
assert.equal(first.diagnosedEligibleSiteCount, 8);
assert.equal(first.explicitEligibleSiteCount, 1);
assert.equal(first.excludedPreAttachmentDiagnosedOutsideSiteCount, 4);
assert.equal(first.sampledCount, 3);
assert.equal(first.limited, true);
assert.deepEqual(first.leaves, second.leaves, "bounded selection must be deterministic");
assert.equal(first.leaves.length, 3);
assert.equal(JSON.stringify(entries), entriesSnapshot, "selection must not mutate the ledger");

const malformed = {
  ...separation,
  outsideSourceFaceIndices: [0, 0],
};
const failClosed = selectStage8RemovableSupportPreviewLeaves({
  entries,
  separation: malformed,
  maximumLeaves: 20,
});
assert.notEqual(failClosed.failClosedReason, null);
assert.equal(failClosed.diagnosedEligibleSiteCount, 0);
assert.equal(failClosed.explicitEligibleSiteCount, 1, "explicit profile targets survive diagnosis-index failure");
assert.equal(failClosed.excludedPreAttachmentDiagnosedOutsideSiteCount, 12);
assert.equal(failClosed.leaves.length, 1);

const missing = selectStage8RemovableSupportPreviewLeaves({
  entries,
  separation: { ...separation, outsideSourceFaceIndices: undefined as never },
  maximumLeaves: 20,
});
assert.notEqual(missing.failClosedReason, null);
assert.equal(missing.diagnosedEligibleSiteCount, 0);
assert.equal(missing.explicitEligibleSiteCount, 1);

const direct = selectStage8RemovableSupportPreviewLeaves(entries, null, 20);
assert.notEqual(direct.failClosedReason, null);
assert.equal(direct.diagnosedEligibleSiteCount, 0);
assert.equal(direct.explicitEligibleSiteCount, 1);
assert.equal(direct.leaves.length, 1);

console.log("stage8RemovableSupportSelection: exact-orange gating, explicit retention, fail-closed indices, deterministic cap, and immutability passed");

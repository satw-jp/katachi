import assert from "node:assert/strict";
import {
  BAMBU3MF_EXACT_ORANGE_SELECTION_MODE,
  BAMBU3MF_LEGACY_SELECTION_MODE,
  buildBambu3mfOutputSelection,
  shouldApplyBambu3mfDiagnosedSupportPaint,
  validateBambu3mfSupportSelectionEvidence,
} from "./bambu3mfOutputSelection.ts";
import { createDryWebSupportSeparationPresentation } from "./dryWebSupportSeparationPresentation.ts";
import type { OverhangAssignmentEntry, OverhangSupportRayFacts } from "./overhangSupportPolicy.ts";
import type { SupportPaintApplicationFacts } from "./supportPaint.ts";

const triangle = (x: number): Float32Array => new Float32Array([
  x, 0, 0, x, 1, 0, x, 0, 1,
]);
const concat = (...parts: Float32Array[]): Float32Array => {
  const result = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
const entry = (faceIndex: number, siteIndex: number, classification: OverhangAssignmentEntry["classification"] = "outside"): OverhangAssignmentEntry => ({
  id: `diagnosed-face:${faceIndex}:site:${siteIndex}`,
  source: "diagnosed-face",
  sourceIndex: faceIndex,
  siteIndex,
  faceIndex,
  classification,
  positionMm: { xMm: faceIndex, yMm: siteIndex, zMm: 1 },
});
const originalEntries = [0, 1].flatMap((faceIndex) => [0, 1, 2, 3].map((siteIndex) => entry(faceIndex, siteIndex)));
const originalCounts = {
  total: 8, inside: 0, outside: 8, unresolved: 0, duplicate: 0, unassigned: 0,
  mixedFace: 0, insideSupportSite: 0, outsideSupportSite: 8, unresolvedSupportSite: 0, duplicateSupportSite: 0,
};
const rayFacts: OverhangSupportRayFacts = {
  method: "support-free-surface-downward-ray-v1",
  surfaceSource: "support-free-final-surface",
  rayDirection: "negative-z",
  meshScaleMm: 10,
  lowerIntersectionEpsilonMm: 0.001,
  gridCellSizeMm: 0.25,
  gridCellCount: 1,
  surfaceTriangleCount: 1,
  invalidSurfaceTriangleCount: 0,
};
const paintFacts: SupportPaintApplicationFacts = {
  strokeCount: 2,
  automaticCounts: { inside: 4, outside: 4, unresolved: 0 },
  paintedSupportSiteCount: 2,
  manualOverrideSupportSiteCount: 2,
  autoResetSupportSiteCount: 0,
  finalCounts: { inside: 0, outside: 8, unresolved: 0 },
};
const separation = createDryWebSupportSeparationPresentation({
  beforeDangerPositions: concat(triangle(0), triangle(1)),
  afterDangerPositions: triangle(0),
  mitigatedPositions: triangle(1),
  entries: originalEntries,
});

const baseInput = {
  internalStructure: "targetedGrid",
  legacyDangerousPositions: concat(triangle(0), triangle(1)),
  separation,
  separationIsCurrent: true,
  sourceFaceCount: 2,
  generation: 9,
  originalEntries,
  originalClassificationCounts: originalCounts,
  originalSupportRayFacts: rayFacts,
  originalSupportPaintFacts: paintFacts,
  explicitTargetCount: 1,
};

const sourceSnapshot = JSON.stringify({ positions: [...baseInput.legacyDangerousPositions], entries: originalEntries, facts: paintFacts });
const exact = buildBambu3mfOutputSelection(baseInput);
assert.equal(exact.ok, true);
if (!exact.ok) throw new Error(exact.reason);
assert.equal(exact.evidence.mode, BAMBU3MF_EXACT_ORANGE_SELECTION_MODE);
assert.deepEqual([...exact.dangerousPositions], [...triangle(0)]);
assert.equal(exact.evidence.exactOrangeFaceCount, 1);
assert.equal(exact.evidence.exactOrangeDiagnosedSiteCount, 4);
assert.deepEqual(exact.evidence.exactOrangeSourceFaceIndices, [0]);
assert.deepEqual(exact.evidence.originalSupportPaintFacts, paintFacts, "original paint facts remain evidence");
assert.equal(shouldApplyBambu3mfDiagnosedSupportPaint(exact.evidence.mode), false, "exact-orange is not repainted");
assert.notEqual(exact.dangerousPositions, separation.outsidePositions, "selected soup is cloned");
assert.equal(JSON.stringify({ positions: [...baseInput.legacyDangerousPositions], entries: originalEntries, facts: paintFacts }), sourceSnapshot, "selection does not mutate inputs");

type BaseInputOverrides = Omit<Partial<typeof baseInput>, "separation"> & {
  separation?: typeof separation | null;
};
const failure = (override: BaseInputOverrides): string => {
  const result = buildBambu3mfOutputSelection({ ...baseInput, ...override });
  assert.equal(result.ok, false);
  return result.ok ? "" : result.reason;
};
assert.match(failure({ separationIsCurrent: false }), /stale/);
assert.match(failure({ separation: null }), /missing or stale/);
assert.match(failure({ separation: { ...separation, unresolvedFaceCount: 1 } }), /unresolved red/);
assert.match(failure({ separation: { ...separation, outsideFaceCount: 2 } }), /matching the orange count/);
assert.match(failure({ separation: { ...separation, outsidePositions: new Float32Array([Number.NaN, ...triangle(0).slice(1)]) } }), /finite triangle soup/);
assert.match(failure({
  separation: { ...separation, outsideSourceFaceIndices: [1] },
  originalEntries: originalEntries.map((item) => item.faceIndex === 1 ? { ...item, classification: "inside" } : item),
}), /outside in the original ledger/);

const legacy = buildBambu3mfOutputSelection({ ...baseInput, internalStructure: "voronoiEdge", separation: null, separationIsCurrent: false });
assert.equal(legacy.ok, true);
if (!legacy.ok) throw new Error(legacy.reason);
assert.equal(legacy.evidence.mode, BAMBU3MF_LEGACY_SELECTION_MODE);
assert.deepEqual([...legacy.dangerousPositions], [...baseInput.legacyDangerousPositions]);
assert.notEqual(legacy.dangerousPositions, baseInput.legacyDangerousPositions, "legacy soup is also cloned");
assert.notEqual(exact.evidence.selectionIdentity, legacy.evidence.selectionIdentity, "selection mode participates in identity");
const changedGeneration = buildBambu3mfOutputSelection({ ...baseInput, generation: 10 });
assert.equal(changedGeneration.ok, true);
if (!changedGeneration.ok) throw new Error(changedGeneration.reason);
assert.notEqual(exact.evidence.selectionIdentity, changedGeneration.evidence.selectionIdentity, "generation participates in exact identity");
const changedSourceIdentity = buildBambu3mfOutputSelection({
  ...baseInput,
  separation: { ...separation, outsideSourceFaceIndices: [1], outsidePositions: triangle(1), outsideFaceCount: 1 },
});
assert.equal(changedSourceIdentity.ok, true);
if (!changedSourceIdentity.ok) throw new Error(changedSourceIdentity.reason);
assert.notEqual(exact.evidence.selectionIdentity, changedSourceIdentity.evidence.selectionIdentity, "source IDs participate in exact identity");
assert.equal(shouldApplyBambu3mfDiagnosedSupportPaint(legacy.evidence.mode), true, "legacy keeps diagnosed Paint application");
assert.throws(() => validateBambu3mfSupportSelectionEvidence({
  evidence: { ...exact.evidence, exactOrangeDiagnosedSiteCount: 3 },
  dangerousPositions: exact.dangerousPositions,
}), /diagnosed site count/);

const largeEntries = Array.from({ length: 100_000 }, (_, index) => entry(Math.floor(index / 4), index % 4));
const largeSourceIds = Array.from({ length: 2_000 }, (_, index) => index * 2);
const largeSelection = buildBambu3mfOutputSelection({
  ...baseInput,
  legacyDangerousPositions: new Float32Array(25_000 * 9),
  sourceFaceCount: 25_000,
  originalEntries: largeEntries,
  separation: {
    ...separation,
    outsideFaceCount: largeSourceIds.length,
    outsideSourceFaceIndices: largeSourceIds,
    outsidePositions: new Float32Array(largeSourceIds.length * 9),
  },
});
assert.equal(largeSelection.ok, true);
if (!largeSelection.ok) throw new Error(largeSelection.reason);
assert.equal(largeSelection.evidence.exactOrangeDiagnosedSiteCount, largeSourceIds.length * 4);

console.log("bambu3mfOutputSelection: exact current/stale/missing/red/count/nonfinite gates, cloning, legacy route, Paint policy, original evidence, and selection identity passed");

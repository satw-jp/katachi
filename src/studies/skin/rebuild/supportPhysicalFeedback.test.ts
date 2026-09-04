import assert from "node:assert/strict";
import { canonicalStringify } from "../graphCore.ts";
import {
  buildSparseRemovableSupport,
  type SparseRemovableSupportFace,
  type SparseRemovableSupportRequest,
} from "./sparseRemovableSupport.ts";
import {
  applySupportPhysicalFeedback,
  classifySupportContactTier,
} from "./supportPhysicalFeedback.ts";

const face = (
  regionId: number,
  x: number,
  y: number,
  z: number,
  faceIndex: number,
): SparseRemovableSupportFace => ({
  regionId,
  ownerPatchId: 1,
  position: { x, y, z },
  normal: { x: 0, y: 0, z: -1 },
  faceIndex,
});

const baseRequest: SparseRemovableSupportRequest = {
  projectedOutsideFaces: [face(0, 0, 0, 5, 0), face(1, 0.2, 0, 5, 1)],
  outsideRegionCount: 2,
  plateZ: 0,
  shaftRadius: 0.05,
  neckRadius: 0.025,
  removalGap: 0.05,
  lowStartBand: 0.2,
  maxCandidatesPerRegion: 3,
  maxLeaningRoutes: 0,
  bodySdf: () => 10,
  targetSdf: (target, x, y, z) => Math.hypot(x - target.position.x, y - target.position.y, z - target.position.z) - 0.05,
  otherBodySdf: () => 10,
};

const build = (request: SparseRemovableSupportRequest = baseRequest) => buildSparseRemovableSupport(request);

const clear = build();
assert.equal(clear.diagnostics.generatedSupportCount, 2);

const point = applySupportPhysicalFeedback(clear, baseRequest, {
  maxUnbracedLengthMm: 100,
  scaleMmPerUnit: 1,
  braceEnabled: false,
  tipDiameterMm: 0.05,
  neckLengthMm: 0.1,
  contactGapMm: 0,
});
assert.equal(point.metrics.pointContactCount, 2, "small regions use point contacts");
assert.equal(point.metrics.targetCount, 2);
assert.equal(point.metrics.nodeCount, point.graph.nodes.length);
assert.equal(point.metrics.edgeCount, point.graph.edges.length);
assert.equal(point.metrics.crownContactCount, 0);
assert.equal(point.metrics.patchCandidateCount, 0);
assert.equal(point.metrics.braceCount, 0);
assert.equal(point.metrics.safety.acceptedBodyCollisionCount, 0);
assert.equal(point.metrics.safety.plateViolationCount, 0);
assert.equal(point.metrics.safety.invalidGeometryCount, 0);
assert.equal(point.metrics.safety.zeroLengthEdgeCount, 0);

const highFaces = Array.from({ length: 8 }, (_, index) => face(3, index * 0.18, 0, 5, index));
const highRequest = { ...baseRequest, projectedOutsideFaces: highFaces, outsideRegionCount: 1, coverageRadius: 0 };
const high = applySupportPhysicalFeedback(build(highRequest), highRequest, {
  maxUnbracedLengthMm: 100,
  scaleMmPerUnit: 1,
  braceEnabled: false,
});
assert.equal(high.metrics.crownContactCount, 3, "high coverage remains sparse but uses crown contacts");
assert.equal(high.metrics.pointContactCount, 0);
assert.ok(high.graph.edges.length > build(highRequest).graph.edges.length, "crown adds a trunk fan-out");

const criticalFaces = Array.from({ length: 20 }, (_, index) => face(4, index * 0.18, 0, 5, index));
const criticalRequest = { ...baseRequest, projectedOutsideFaces: criticalFaces, outsideRegionCount: 1, coverageRadius: 0 };
const critical = applySupportPhysicalFeedback(build(criticalRequest), criticalRequest, {
  maxUnbracedLengthMm: 100,
  scaleMmPerUnit: 1,
  braceEnabled: false,
  patchEnabled: true,
});
assert.equal(critical.metrics.patchCandidateCount, 3, "critical coverage produces temporary patch candidates");
assert.ok(critical.metrics.patchCandidates.every((candidate) => candidate.exportable === false));

const criticalProduction = applySupportPhysicalFeedback(build(criticalRequest), criticalRequest, {
  maxUnbracedLengthMm: 100,
  scaleMmPerUnit: 1,
  braceEnabled: false,
});
assert.equal(criticalProduction.metrics.patchCandidateCount, 0, "production patch candidates stay OFF");
assert.ok(criticalProduction.metrics.criticalRegionsWithoutEnhancedContact > 0);

const braced = applySupportPhysicalFeedback(clear, baseRequest, {
  maxUnbracedLengthMm: 2,
  maxBraceDistanceMm: 1,
  maxBraceSpanMm: 1,
  scaleMmPerUnit: 1,
  braceEnabled: true,
});
const unbracedStrict = applySupportPhysicalFeedback(clear, baseRequest, {
  maxUnbracedLengthMm: 2,
  maxBraceDistanceMm: 1,
  maxBraceSpanMm: 1,
  scaleMmPerUnit: 1,
  braceEnabled: false,
});
assert.ok(braced.metrics.braceCount > 0, "nearby long supports receive minimal mutual braces");
assert.equal(braced.metrics.bracedSupportCount, 2);
assert.ok(braced.metrics.longUnbracedCount < unbracedStrict.metrics.longUnbracedCount);
assert.ok(braced.metrics.trunks.every((trunk) => trunk.stableConnection));
assert.ok(braced.metrics.trunks.every((trunk) => trunk.firstBraceHeightMm > 0));
assert.ok(braced.metrics.trunks.every((trunk) => trunk.subsequentBraceSpacingMm >= 0));
assert.equal(braced.metrics.safety.acceptedBodyCollisionCount, 0);
assert.equal(braced.metrics.safety.plateViolationCount, 0);
assert.equal(braced.metrics.safety.invalidGeometryCount, 0);
assert.equal(braced.metrics.safety.zeroLengthEdgeCount, 0);
assert.equal(braced.metrics.safety.nearDuplicateEdgeCount, 0);
assert.equal(braced.metrics.nodeCount, braced.graph.nodes.length);
assert.equal(braced.metrics.edgeCount, braced.graph.edges.length);
assert.equal(braced.metrics.patchEnabled, false);

const bodyBetweenRequest: SparseRemovableSupportRequest = {
  ...baseRequest,
  projectedOutsideFaces: [face(5, -0.5, 0, 5, 0), face(5, 0.5, 0, 5, 1)],
  outsideRegionCount: 1,
  coverageRadius: 0,
};
const bodyBetweenBase = build(bodyBetweenRequest);
const bodyBetween = applySupportPhysicalFeedback(bodyBetweenBase, {
  ...bodyBetweenRequest,
  bodySdf: (x, _y, z) => Math.hypot(x, z - 2.5) - 1.8,
}, {
  maxUnbracedLengthMm: 1,
  maxBraceDistanceMm: 2,
  maxBraceSpanMm: 2,
  scaleMmPerUnit: 1,
  braceEnabled: true,
});
assert.equal(bodyBetween.metrics.braceCount, 0, "a BODY obstruction between shafts rejects the brace");
assert.ok(bodyBetween.metrics.safety.braceRejectedByBody > 0);

const duplicateFreeAgain = applySupportPhysicalFeedback(clear, baseRequest, {
  maxUnbracedLengthMm: 2,
  maxBraceDistanceMm: 1,
  maxBraceSpanMm: 1,
  scaleMmPerUnit: 1,
  braceEnabled: true,
});
assert.equal(canonicalStringify(braced.graph), canonicalStringify(duplicateFreeAgain.graph), "same input is deterministic");
assert.equal(canonicalStringify(braced.metrics), canonicalStringify(duplicateFreeAgain.metrics));

const gapZero = applySupportPhysicalFeedback(clear, baseRequest, {
  maxUnbracedLengthMm: 100,
  scaleMmPerUnit: 1,
  braceEnabled: false,
  contactGapMm: 0,
});
const gapCandidate = applySupportPhysicalFeedback(clear, baseRequest, {
  maxUnbracedLengthMm: 100,
  scaleMmPerUnit: 1,
  braceEnabled: false,
  contactGapMm: 0.1,
});
assert.equal(gapZero.metrics.gapEnabledCount, 0);
assert.equal(gapCandidate.metrics.gapEnabledCount, 2);
assert.ok(gapCandidate.acceptedRoutes.every(({ route }) => route.target.z < 5));
assert.equal(gapCandidate.metrics.safety.acceptedBodyCollisionCount, 0);
assert.equal(canonicalStringify(gapCandidate.graph), canonicalStringify(applySupportPhysicalFeedback(clear, baseRequest, {
  maxUnbracedLengthMm: 100,
  scaleMmPerUnit: 1,
  braceEnabled: false,
  contactGapMm: 0.1,
}).graph));

const syntheticTarget = {
  id: "synthetic",
  regionId: 1,
  ownerPatchId: 1,
  position: { x: 0, y: 0, z: 1 },
  normal: { x: 0, y: 0, z: -1 },
  sourceFaceIndices: [0],
};
assert.equal(classifySupportContactTier(syntheticTarget, 1), "point");
assert.equal(classifySupportContactTier(syntheticTarget, 8), "crown");
assert.equal(classifySupportContactTier(syntheticTarget, 20), "patch");
assert.equal(classifySupportContactTier({ ...syntheticTarget, coverageTier: "high" } as never, 1), "crown");
assert.equal(classifySupportContactTier({ ...syntheticTarget, coverageTier: "critical" } as never, 1), "patch");

console.log("supportPhysicalFeedback.test.ts: PASS");

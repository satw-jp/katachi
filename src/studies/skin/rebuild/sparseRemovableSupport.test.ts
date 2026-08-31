import assert from "node:assert/strict";
import {
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
  projectSkinRebuildFinalArtworkOverhangToStage4,
} from "./overhangInteriorClassification.ts";
import {
  buildSparseRemovableSupport,
  extractSparseRemovableSupportTargets,
  type SparseRemovableSupportFace,
} from "./sparseRemovableSupport.ts";

const face = (
  regionId: number,
  x: number,
  y: number,
  z: number,
  faceIndex: number,
): SparseRemovableSupportFace => ({
  regionId,
  position: { x, y, z },
  normal: { x: 0, y: 0, z: -1 },
  faceIndex,
});

const baseRequest = {
  plateZ: 0,
  shaftRadius: 0.05,
  neckRadius: 0.025,
  removalGap: 0.05,
  lowStartBand: 0.2,
  maxCandidatesPerRegion: 3,
  maxLeaningRoutes: 4,
  bodySdf: () => 10,
};

// Stage 7's triangle positions move, while Stage 4 remains the exact source
// of both responsibility class and region id. The projection never invokes a
// new SDF classifier.
const stage4Positions = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0,
  10, 0, 0, 11, 0, 0, 10, 1, 0,
]);
const stage7Positions = new Float32Array([
  0.1, 0.1, 0.4, 1.1, 0.1, 0.4, 0.1, 1.1, 0.4,
  10.1, 0.1, 0.4, 11.1, 0.1, 0.4, 10.1, 1.1, 0.4,
]);
const projected = projectSkinRebuildFinalArtworkOverhangToStage4(
  stage7Positions,
  new Int32Array([71, 72]),
  stage4Positions,
  {
    faceClasses: new Int8Array([SKIN_REBUILD_OVERHANG_INSIDE, SKIN_REBUILD_OVERHANG_OUTSIDE]),
    faceRegionIds: new Int32Array([5, 9]),
  },
);
assert.equal(projected.insideFaceCount, 1);
assert.equal(projected.outsideFaceCount, 1);
assert.deepEqual([...projected.outsideByRegion.keys()], [9]);
assert.equal(projected.outsideByRegion.get(9)?.[0].stage7FaceIndex, 1);
assert.equal(projected.faces[0].responsibility, SKIN_REBUILD_OVERHANG_INSIDE);
assert.equal(projected.faces[1].responsibilityRegionId, 9);

// A dense final-artwork diagnosis remains sparse: at most three low-band
// representatives are retained for one Stage 4 responsibility region.
const denseFaces = Array.from({ length: 489 }, (_, index) =>
  face(4, (index % 9) * 0.05, Math.floor(index / 9) * 0.01, 1 + (index % 4) * 0.01, index));
const denseTargets = extractSparseRemovableSupportTargets(denseFaces, {
  shaftRadius: 0.05,
  removalGap: 0.05,
  lowStartBand: 0.2,
  maxCandidatesPerRegion: 3,
});
assert.equal(denseTargets.rawCandidateCount, 489);
assert.ok(denseTargets.targets.length <= 3);

const sparseFaces = [
  face(0, 0, 0, 2, 0),
  face(0, 0.2, 0, 2.05, 1),
  face(0, 0.4, 0, 2.1, 2),
  face(1, 1, 0, 2, 3),
  face(1, 1.25, 0, 2.05, 4),
];
const clear = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: sparseFaces,
  outsideRegionCount: 2,
  coverageRadius: 0,
});
assert.equal(clear.diagnostics.insideDerivedSupportCount, 0);
assert.equal(clear.diagnostics.outsideRegionCount, 2);
assert.equal(clear.diagnostics.rawCandidateCount, sparseFaces.length);
assert.ok(clear.diagnostics.criticalTargetCount <= 6);
assert.equal(clear.diagnostics.generatedSupportCount, clear.diagnostics.verticalCount);
assert.equal(clear.diagnostics.leaningCount, 0, "vertical routes are preferred when BODY-clear");
assert.equal(clear.diagnostics.unsupportedTargetCount, 0);
assert.ok(clear.acceptedRoutes.every(({ route }) => route.segments.every((segment) => segment.radius <= baseRequest.shaftRadius)));
assert.ok(clear.acceptedRoutes.every(({ route }) => route.segments.every((segment) => {
  const horizontal = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
  const vertical = Math.abs(segment.end.z - segment.start.z);
  return horizontal <= vertical * Math.tan(Math.PI / 4) + 1e-9;
})));
assert.ok(clear.graph.edges.some((edge) => edge.radius === baseRequest.neckRadius), "contact neck is narrower than shaft");

// Greedy coverage selects one candidate when its contact footprint covers the
// second critical target; this is intentionally not a global optimization.
const covered = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(2, 0, 0, 2, 0), face(2, 0.2, 0, 2, 1)],
  outsideRegionCount: 1,
  coverageRadius: 0.25,
});
assert.equal(covered.diagnostics.criticalTargetCount, 2);
assert.equal(covered.diagnostics.generatedSupportCount, 1);
assert.equal(covered.diagnostics.coveredTargetCount, 2);

// Capsule spacing is tested against the exact segment-to-segment distance,
// including the two parallel shafts, rather than only endpoint distance.
const spacing = buildSparseRemovableSupport({
  ...baseRequest,
  removalGap: 0.08,
  projectedOutsideFaces: [face(3, 0, 0, 2, 0), face(3, 0.17, 0, 2, 1)],
  outsideRegionCount: 1,
  coverageRadius: 0,
});
assert.equal(spacing.diagnostics.generatedSupportCount, 1);
assert.ok(spacing.diagnostics.rejectedBySpacing > 0);
assert.equal(spacing.diagnostics.unsupportedTargetCount, 1);

// A bounded spherical BODY obstruction rejects the vertical route; a
// deterministic leaning root then succeeds while retaining the 45° limit.
const leaning = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(8, 0, 0, 2, 0)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 2,
  bodySdf: (x, y, z) => Math.hypot(x, y, z - 1) - 0.2,
});
assert.equal(leaning.diagnostics.verticalCount, 0);
assert.equal(leaning.diagnostics.leaningCount, 1);
assert.ok(leaning.acceptedRoutes[0].route.segments.every((segment) => {
  const horizontal = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
  return horizontal <= Math.abs(segment.end.z - segment.start.z) * Math.tan(Math.PI / 4) + 1e-8;
}));

const bodyRejected = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(10, 0, 0, 2, 0)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 0,
  bodySdf: (x, y, z) => Math.hypot(x, y, z - 1) - 0.2,
});
assert.equal(bodyRejected.diagnostics.generatedSupportCount, 0);
assert.ok(bodyRejected.diagnostics.rejectedByBody > 0);
assert.equal(bodyRejected.diagnostics.insideDerivedSupportCount, 0);

// The pure result is deterministic for identical inputs.
assert.deepEqual(
  buildSparseRemovableSupport({ ...baseRequest, projectedOutsideFaces: sparseFaces, outsideRegionCount: 2, coverageRadius: 0 }),
  clear,
);

console.log("sparseRemovableSupport: Stage 4 projection, sparse greedy routing, keep-out, spacing, and determinism passed");

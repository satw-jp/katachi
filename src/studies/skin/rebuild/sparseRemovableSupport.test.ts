import assert from "node:assert/strict";
import { smoothMin } from "../../cloud-sculpt/field.ts";
import {
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
  projectSkinRebuildFinalArtworkOverhangToStage4,
} from "./overhangInteriorClassification.ts";
import {
  auditSparseRemovableSupportCapsule,
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
  ownerPatchId = 1,
): SparseRemovableSupportFace => ({
  regionId,
  ownerPatchId,
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
  targetSdf: (target: { position: { x: number; y: number; z: number } }, x: number, y: number, z: number) =>
    Math.hypot(x - target.position.x, y - target.position.y, z - target.position.z) - 0.05,
  otherBodySdf: () => 10,
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
    faceOwnerPatchIds: new Int32Array([71, 72]),
  },
);
assert.equal(projected.insideFaceCount, 1);
assert.equal(projected.outsideFaceCount, 1);
assert.deepEqual([...projected.outsideByRegion.keys()], [9]);
assert.equal(projected.outsideByRegion.get(9)?.[0].stage7FaceIndex, 1);
assert.equal(projected.faces[0].responsibility, SKIN_REBUILD_OVERHANG_INSIDE);
assert.equal(projected.faces[1].responsibilityRegionId, 9);
assert.equal(projected.faces[1].responsibilityOwnerPatchId, 72);

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

// Production defaults use a 1.6 mm shaft and a separate 0.6 mm contact neck.
// On a flat underside, the transition must move the shaft endpoint clear of
// the BODY before the terminal neck is allowed to touch the owner target.
const actualDefaultFlatUnderside = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(16, 0, 0, 2, 0)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 0,
  scaleMmPerUnit: 1,
  shaftRadius: 0.8,
  neckRadius: 0.3,
  contactNeckDiameterMm: 0.6,
  bodySdf: (_x, _y, z) => 2 - z,
  targetSdf: (_target, _x, _y, z) => 2 - z,
  otherBodySdf: () => 10,
  targetRadius: 0.3,
  maximumOverlapLength: 1.5,
  maximumDepth: 1.5,
});
assert.equal(actualDefaultFlatUnderside.diagnostics.generatedSupportCount, 1,
  "the actual default shaft/neck physical ratio must accept a flat-underside support");
assert.equal(actualDefaultFlatUnderside.diagnostics.verticalCount, 1);
assert.equal(actualDefaultFlatUnderside.acceptedRoutes[0]?.route.segments.at(-1)?.radius, 0.3);
assert.ok((actualDefaultFlatUnderside.acceptedRoutes[0]?.route.segments[0]?.end.z ?? 0) < 2 - 0.8,
  "the shaft endpoint must be strictly outside the flat BODY underside");

// A projected Outside face without the Stage 4 owner patch remains visible
// demand, but no owner target/contact route may be invented for it.
const ownerlessOutside = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(17, 0, 0, 2, 0, -1)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 0,
});
assert.equal(ownerlessOutside.diagnostics.generatedSupportCount, 0);
assert.ok(ownerlessOutside.diagnostics.unsupportedTargetCount > 0,
  "ownerless Outside demand must be counted unsupported");
assert.ok(ownerlessOutside.graph.stats.unsupportedCount > 0);
assert.ok(ownerlessOutside.diagnostics.rejectedByRemovability > 0);
assert.equal(ownerlessOutside.debug.rejectedCandidates[0]?.ownerPatchId, -1);
assert.match(ownerlessOutside.debug.rejectedCandidates[0]?.detail ?? "", /owner Patch id unavailable/);

// The diagnostic count follows distinct current projected region ids, even
// when the historical Stage 4 responsibility set contains more regions.
const currentRegionSubset = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(21, 0, 0, 2, 0), face(21, 0.1, 0, 2.02, 1)],
  maxLeaningRoutes: 0,
});
assert.equal(currentRegionSubset.diagnostics.outsideRegionCount, 1);

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
  plateBounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
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

// A shaft/body contact is never a licensable terminal suffix. The body is
// placed exactly at the shaft's final point so the old contiguous-suffix bug
// would have accepted this candidate before the contact neck was audited.
const nonTerminalContact = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(12, 0, 0, 2, 0)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 0,
  bodySdf: (x, y, z) => Math.hypot(x, y, z - 1.925) - 0.06,
});
assert.equal(nonTerminalContact.diagnostics.generatedSupportCount, 0);
assert.ok(nonTerminalContact.diagnostics.rejectedByBody > 0,
  "a BODY contact on the non-terminal shaft must reject by BODY");
assert.match(nonTerminalContact.debug.routeAttempts[0]?.attempts[0]?.detail ?? "", /non-terminal|BODY/);

// Leaning roots are unavailable without an explicit finite physical plate
// rectangle. Unknown XY bounds must not be treated as proof of reachability.
const noBoundsLeaning = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(13, 0, 0, 2, 0)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 2,
  bodySdf: (x, y, z) => Math.hypot(x, y, z - 1) - 0.2,
});
assert.equal(noBoundsLeaning.diagnostics.generatedSupportCount, 0);
assert.equal(noBoundsLeaning.diagnostics.leaningCount, 0);
assert.ok(noBoundsLeaning.diagnostics.rejectedByBody > 0);
assert.ok(noBoundsLeaning.debug.routeAttempts[0]?.attempts.every((attempt) => attempt.kind === "vertical"),
  "no-bounds routing must not claim a leaning attempt");

// An explicit finite rectangle makes the same bounded leaning fallback
// available, while a root outside that rectangle is a hard rejection.
const plateOutside = buildSparseRemovableSupport({
  ...baseRequest,
  projectedOutsideFaces: [face(14, 2, 0, 2, 0)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 0,
  plateBounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
});
assert.equal(plateOutside.diagnostics.generatedSupportCount, 0);
assert.ok(plateOutside.diagnostics.rejectedByRemovability > 0,
  "an explicit plate-outside vertical root must reject");

const auditTarget = {
  id: "audit-target",
  regionId: 15,
  ownerPatchId: 1,
  position: { x: 0, y: 0, z: 2 },
  normal: { x: 0, y: 0, z: -1 },
  sourceFaceIndices: [0],
};
const auditSegment = (start: { x: number; y: number; z: number }, radius = 0.05) => ({
  start,
  end: auditTarget.position,
  radius,
});
const auditRequest = (bodySdf: (x: number, y: number, z: number) => number,
  targetSdf: (target: typeof auditTarget, x: number, y: number, z: number) => number,
  otherBodySdf: (target: typeof auditTarget, x: number, y: number, z: number) => number) => ({
  ...baseRequest,
  projectedOutsideFaces: [face(15, 0, 0, 2, 0)],
  outsideRegionCount: 1,
  maxLeaningRoutes: 0,
  bodySdf,
  targetSdf,
  otherBodySdf,
  targetRadius: 0.05,
  maximumOverlapLength: 0.5,
  maximumDepth: 0.5,
});

// This is the TASK-E two-ring3d smooth-min fixture. The complete BODY field
// is not an exact target/remainder partition; the independent other field
// remains authoritative for wrong-terminal rejection.
const ring3dTarget = (x: number, y: number, z: number): number => Math.hypot(x, y, z - 2) - 0.05;
const ring3dOther = (x: number, y: number, z: number): number => Math.hypot(x - 0.135, y, z - 1.89) - 0.025;
const ring3dSmoothMinBody = (x: number, y: number, z: number): number =>
  smoothMin(ring3dTarget(x, y, z), ring3dOther(x, y, z), 0.045);
const sparseSmoothMin = auditSparseRemovableSupportCapsule(
  auditSegment({ x: 0.5, y: 0, z: 0 }),
  auditRequest(
    ring3dSmoothMinBody,
    (_target, x, y, z) => ring3dTarget(x, y, z),
    (_target, x, y, z) => ring3dOther(x, y, z),
  ),
  auditTarget,
);
assert.equal(sparseSmoothMin.accepted, false,
  "Sparse audit must reject the two-ring3d smooth-min fixture");

const intendedTargetSdf = (_x: number, _y: number, z: number): number => Math.abs(z - 2) - 0.05;
const wrongTerminalSdf = (_x: number, _y: number, z: number): number => Math.abs(z - 1.9) - 0.04;
const sparseWrongTerminal = auditSparseRemovableSupportCapsule(
  auditSegment({ x: 0, y: 0, z: 0 }, 0.1),
  auditRequest(
    (x, y, z) => smoothMin(intendedTargetSdf(x, y, z), wrongTerminalSdf(x, y, z), 0.045),
    (_target, x, y, z) => intendedTargetSdf(x, y, z),
    (_target, x, y, z) => wrongTerminalSdf(x, y, z),
  ),
  auditTarget,
);
assert.equal(sparseWrongTerminal.accepted, false,
  "Sparse audit must reject a wrong terminal owner even at the endpoint");

const nonLipschitzTarget = (_x: number, _y: number, z: number): number => z >= 0.98 ? -0.4 : 0.09;
const sparseNonLipschitzTarget = auditSparseRemovableSupportCapsule(
  auditSegment({ x: 0, y: 0, z: 0 }, 0.1),
  auditRequest(
    () => 10,
    (_target, x, y, z) => nonLipschitzTarget(x, y, z),
    () => 10,
  ),
  auditTarget,
);
assert.equal(sparseNonLipschitzTarget.accepted, false,
  "Sparse audit must reject a non-Lipschitz owner target field");

const sparseLegitimateTerminal = auditSparseRemovableSupportCapsule(
  auditSegment({ x: 0, y: 0, z: 0 }, 0.1),
  auditRequest(
    intendedTargetSdf,
    (_target, x, y, z) => intendedTargetSdf(x, y, z),
    () => 10,
  ),
  auditTarget,
);
assert.equal(sparseLegitimateTerminal.accepted, true,
  "Sparse audit must retain a legitimate exact owner target contact");

// The pure result is deterministic for identical inputs.
assert.deepEqual(
  buildSparseRemovableSupport({ ...baseRequest, projectedOutsideFaces: sparseFaces, outsideRegionCount: 2, coverageRadius: 0 }),
  clear,
);

console.log("sparseRemovableSupport: Stage 4 projection, sparse greedy routing, keep-out, spacing, and determinism passed");

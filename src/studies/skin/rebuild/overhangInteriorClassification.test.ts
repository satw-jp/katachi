import assert from "node:assert/strict";
import type { SkinRebuildPatternSide } from "./model.ts";
import {
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
  SKIN_REBUILD_STAGE7_DANGER_BOUNDARY,
  SKIN_REBUILD_STAGE7_DANGER_UNCLASSIFIED,
  classifySkinRebuildOverhangFromStage3,
  computeSkinRebuildMeshInteriorInterfaceDistancesMm,
  mapSkinRebuildStage7DangerFacesByExactTriangle,
  partitionSkinRebuildLowestPointsByOverhangResponsibility,
  projectSkinRebuildFinalArtworkOverhangToStage4,
} from "./overhangInteriorClassification.ts";

const stage3: SkinRebuildPatternSide = {
  patchId: 7,
  surfacePosition: { x: 0, y: 0, z: 0 },
  outwardNormal: { x: 0, y: 0, z: 1 },
  insidePosition: { x: 0, y: 0, z: -0.1 },
  outsidePosition: { x: 0, y: 0, z: 0.1 },
  insideSignedDistance: -0.1,
  outsideSignedDistance: 0.1,
  baseSideIsInside: true,
};

// The two faces are on opposite sides of the stored Stage 3 surface plane.
const positions = new Float32Array([
  0, 0, -0.2, 0, 1, -0.2, 1, 0, -0.2,
  0, 0, 0.2, 1, 0, 0.2, 0, 1, 0.2,
]);
const classified = classifySkinRebuildOverhangFromStage3(
  positions,
  new Int32Array([3, 3]),
  [stage3],
);
assert.deepEqual([...classified.faceClasses], [
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
]);
assert.deepEqual([...classified.faceRegionIds], [3, 3]);
assert.deepEqual([...classified.faceOwnerPatchIds], [7, 7]);
assert.deepEqual([...classified.insideFaceRegionIds], [3, -1]);
assert.equal(classified.insideFaceCount, 1);
assert.equal(classified.outsideFaceCount, 1);
assert.deepEqual(classified.insideRegionIds, [3]);
assert.deepEqual(classified.outsideRegionIds, [3]);
assert.equal(classified.mixedRegionCount, 1);
assert.equal(stage3.baseSideIsInside, true, "Stage 3 result must remain immutable");

// The explicit 7.5 checkpoint uses this existing projection: Stage 7 supplies
// current triangle positions while Stage 4 supplies the stored Stage 3 class,
// region, and owner.  It must not reclassify from a second SDF.
const finalArtworkProjection = projectSkinRebuildFinalArtworkOverhangToStage4(
  positions,
  new Int32Array([31, 31]),
  positions,
  classified,
);
assert.equal(finalArtworkProjection.insideFaceCount, 1);
assert.equal(finalArtworkProjection.outsideFaceCount, 1);
assert.equal(finalArtworkProjection.unclassifiedFaceCount, 0);
assert.deepEqual([...finalArtworkProjection.outsideByRegion.keys()], [3]);
assert.deepEqual(finalArtworkProjection.outsideByRegion.get(3)?.map((face) => ({
  stage7FaceIndex: face.stage7FaceIndex,
  responsibilityOwnerPatchId: face.responsibilityOwnerPatchId,
})), [{ stage7FaceIndex: 1, responsibilityOwnerPatchId: 7 }]);

const projected = partitionSkinRebuildLowestPointsByOverhangResponsibility([
  {
    patchId: 1,
    position: { x: 0.2, y: 0.2, z: -0.19 },
    normal: { x: 0, y: 0, z: -1 },
    overhangAngleDeg: 90,
    plateContact: false,
    needsSupport: true,
    basis: "finalMesh",
  },
  {
    patchId: 2,
    position: { x: 0.2, y: 0.2, z: 0.19 },
    normal: { x: 0, y: 0, z: -1 },
    overhangAngleDeg: 90,
    plateContact: false,
    needsSupport: true,
    basis: "finalMesh",
  },
], positions, classified);
assert.deepEqual(projected.inside.map((point) => point.patchId), [1]);
assert.deepEqual(projected.outside.map((point) => point.patchId), [2]);
assert.deepEqual(projected.unclassified, []);

const unavailable = classifySkinRebuildOverhangFromStage3(
  positions.subarray(0, 9),
  new Int32Array([9]),
  [{ ...stage3, baseSideIsInside: false }],
);
assert.equal(unavailable.unclassifiedFaceCount, 1, "an ambiguous Stage 3 row must fail closed for 5B");
assert.deepEqual([...unavailable.insideFaceRegionIds], [-1]);
assert.deepEqual([...unavailable.faceOwnerPatchIds], [-1]);
const unavailableProjection = projectSkinRebuildFinalArtworkOverhangToStage4(
  positions.subarray(0, 9),
  new Int32Array([9]),
  positions.subarray(0, 9),
  unavailable,
);
assert.equal(unavailableProjection.unclassifiedFaceCount, 1,
  "the Stage 7 projection must preserve an unavailable Stage 3 verdict as ambiguous");

// Stage 6.5 Boundary distance is measured from actual shared
// Inside/Outside mesh edges, then propagated only across same-class faces.
// The mirrored two-sided strip must respond identically to a symmetric total
// thickness, while a disconnected Inside face must never be swallowed.
const interfaceMesh = new Float32Array([
  // Inside seed and Outside seed share the (0,0,0)–(2,0,0) edge.
  0, 0, 0, 2, 0, 0, 1, 1, 0,
  2, 0, 0, 0, 0, 0, 1, -1, 0,
  // One same-class face farther from the interface on each side.
  0, 0, 0, 1, 1, 0, 0, 2, 0,
  0, 0, 0, 1, -1, 0, 0, -2, 0,
  // Disconnected same-class face with no Inside/Outside interface edge.
  10, 10, 0, 11, 10, 0, 10, 11, 0,
]);
const interfaceDistances = computeSkinRebuildMeshInteriorInterfaceDistancesMm(
  interfaceMesh,
  new Int8Array([
    SKIN_REBUILD_OVERHANG_INSIDE,
    SKIN_REBUILD_OVERHANG_OUTSIDE,
    SKIN_REBUILD_OVERHANG_INSIDE,
    SKIN_REBUILD_OVERHANG_OUTSIDE,
    SKIN_REBUILD_OVERHANG_INSIDE,
  ]),
  3,
);
assert.ok(Math.abs(interfaceDistances[0] - interfaceDistances[1]) < 1e-5,
  "the two interface seed faces must have equal physical distance");
assert.ok(Math.abs(interfaceDistances[0] - 1) < 1e-5,
  "a seed must start at its centroid-to-interface-edge distance, not zero or the Stage 3 plane");
assert.ok(Math.abs(interfaceDistances[2] - interfaceDistances[3]) < 1e-5,
  "same-class propagation must remain symmetric on both sides");
assert.equal(interfaceDistances[4], Number.POSITIVE_INFINITY,
  "a disconnected same-class face must remain outside the interface distance field");
const boundaryFacesAt = (totalThicknessMm: number): boolean[] =>
  [...interfaceDistances].map((distanceMm) => Number.isFinite(distanceMm) && distanceMm <= totalThicknessMm * 0.5);
assert.deepEqual(boundaryFacesAt(2), [true, true, false, false, false],
  "a 2mm total band must consume one physical millimetre on each side");
assert.deepEqual(boundaryFacesAt(8), [true, true, true, true, false],
  "a wider symmetric band must expand both class sides equally without swallowing disconnected faces");

// Stage 7 danger presentation must transfer the current overhang triangles to
// their exact full-mesh faces.  Duplicate coordinates consume a stable queue;
// a nearby-but-different triangle is not a nearest-neighbour match.
const exactInside = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const exactOutside = new Float32Array([2, 0, 0, 3, 0, 0, 2, 1, 0]);
const exactBoundary = new Float32Array([4, 0, 0, 5, 0, 0, 4, 1, 0]);
const exactUnknown = new Float32Array([6, 0, 0, 7, 0, 0, 6, 1, 0]);
const exactFullPositions = new Float32Array([
  ...exactInside,
  ...exactInside,
  ...exactOutside,
  ...exactBoundary,
  ...exactUnknown,
]);
const exactMapping = mapSkinRebuildStage7DangerFacesByExactTriangle(
  exactFullPositions,
  new Int8Array([
    SKIN_REBUILD_OVERHANG_INSIDE,
    SKIN_REBUILD_STAGE7_DANGER_BOUNDARY,
    SKIN_REBUILD_OVERHANG_OUTSIDE,
    SKIN_REBUILD_STAGE7_DANGER_UNCLASSIFIED,
    SKIN_REBUILD_STAGE7_DANGER_UNCLASSIFIED,
  ]),
  new Float32Array([
    ...exactInside,
    ...exactInside,
    ...exactOutside,
    ...exactUnknown,
    // Close to exactUnknown, but not the same full-mesh triangle.
    6.0001, 0, 0, 7.0001, 0, 0, 6.0001, 1, 0,
  ]),
  new Int32Array([10, 10, 20, 30, 40]),
);
assert.deepEqual([...exactMapping.faceClasses], [
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
  SKIN_REBUILD_STAGE7_DANGER_UNCLASSIFIED,
  SKIN_REBUILD_STAGE7_DANGER_UNCLASSIFIED,
]);
assert.deepEqual([...exactMapping.fullMeshFaceIndices], [0, 1, 2, 4, -1],
  "Stage 7 danger faces must retain their exact full-mesh identities for combined display and targeting");
assert.equal(exactMapping.supportTargetFaceCount, 2,
  "Outside and Boundary faces share the removable-support presentation class");
assert.equal(exactMapping.insideDangerFaceCount, 1,
  "Inside faces remain danger-only without a removable-support class");
assert.equal(exactMapping.unclassifiedFaceCount, 2,
  "unclassified and non-exact mapping faces fail closed");
assert.equal(exactMapping.supportTargetRegionCount, 2);
assert.equal(exactMapping.insideDangerRegionCount, 1);
assert.equal(exactMapping.unclassifiedRegionCount, 2);
assert.equal(exactMapping.available, false,
  "any missing exact identity makes the Stage 7 mapping unavailable");

console.log("overhangInteriorClassification: Stage 3 orientation projection, inside-only mask, and symmetric mesh interface distance passed");

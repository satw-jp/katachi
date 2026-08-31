import assert from "node:assert/strict";
import type { SkinRebuildPatternSide } from "./model.ts";
import {
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
  classifySkinRebuildOverhangFromStage3,
  partitionSkinRebuildLowestPointsByOverhangResponsibility,
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

console.log("overhangInteriorClassification: Stage 3 orientation projection and inside-only mask passed");

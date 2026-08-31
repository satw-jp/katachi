import assert from "node:assert/strict";
import type { Patch } from "../field.ts";
import type { SkinRebuildPatternSide } from "./model.ts";
import { buildInteriorClassificationDebugPresentation } from "./interiorClassificationPresentation.ts";

const patterns = [
  { id: 4, points: [{ id: 1, x: 1, y: 2, z: 3, r: 0.2 }] },
  { id: 9, points: [{ id: 2, x: 4, y: 5, z: 6, r: 0.2 }] },
] as Patch[];

const side: SkinRebuildPatternSide = {
  patchId: 4,
  surfacePosition: { x: 1, y: 2, z: 2.9 },
  outwardNormal: { x: 0, y: 0, z: 1 },
  insidePosition: { x: 1, y: 2, z: 2.8 },
  outsidePosition: { x: 1, y: 2, z: 3 },
  insideSignedDistance: -0.12,
  outsideSignedDistance: 0.11,
  baseSideIsInside: true,
};

const current = buildInteriorClassificationDebugPresentation(patterns, [side]);
assert.deepEqual(current.counts, {
  motifCount: 2,
  inside: 1,
  outside: 1,
  boundary: 1,
  ambiguous: 0,
  unclassified: 1,
});
assert.deepEqual(current.markers.map((marker) => marker.category), [
  "inside",
  "outside",
  "boundary",
  "unclassified",
]);
assert.equal(current.markers[0]?.signedDistance, -0.12);
assert.equal(current.markers[1]?.signedDistance, 0.11);
assert.deepEqual(current.markers[3]?.position, { x: 4, y: 5, z: 6 });

const ambiguous = buildInteriorClassificationDebugPresentation(patterns.slice(0, 1), [
  { ...side, baseSideIsInside: false },
]);
assert.equal(ambiguous.counts.ambiguous, 1, "the existing Stage 3 verdict is exposed without reclassification");
assert.equal(ambiguous.counts.inside, 0);
assert.equal(ambiguous.counts.outside, 0);
assert.deepEqual(ambiguous.markers.map((marker) => marker.category), ["boundary"]);
assert.equal(side.baseSideIsInside, true, "presentation must not mutate the Stage 3 result");

console.log("interiorClassificationPresentation: stored samples, ambiguous verdict, and unclassified motifs passed");

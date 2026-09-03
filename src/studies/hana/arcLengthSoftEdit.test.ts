import assert from "node:assert/strict";
import test from "node:test";

import { HANA_ARC_LENGTH_SOFT_EDIT_RADII, applyArcLengthSoftEdit } from "./arcLengthSoftEdit.ts";
import type { HanaStroke3D } from "./stroke3d.ts";

function stroke(count: number): HanaStroke3D {
  return {
    id: "arc-edit",
    sourceGestureId: "raw-1",
    sourceViewportId: "front",
    sourceViewDirection: "front",
    initialPlaneValue: 0,
    curve: { type: "catmull-rom", parameterization: "centripetal", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    controlPoints: Array.from({ length: count }, (_, index) => ({
      id: `p-${index}`,
      position: { x: index * 8 / Math.max(1, count - 1), y: 0, z: 0 },
      provenance: { sourceStroke: "raw-1", sourceT: index / Math.max(1, count - 1), sourcePointStart: index, sourcePointEnd: index, pressure: 0.5, time: index },
    })),
  };
}

test("arc-length Soft Edit has a continuous world-space falloff", () => {
  const sparse = applyArcLengthSoftEdit(stroke(32), 16, "right", { x: 4, y: 1, z: 0 }, "medium");
  const dense = applyArcLengthSoftEdit(stroke(128), 64, "right", { x: 4, y: 1, z: 0 }, "medium");
  assert.equal(sparse.radius, HANA_ARC_LENGTH_SOFT_EDIT_RADII.medium);
  assert.equal(sparse.affectedControlIndices[0], 11);
  assert.equal(dense.affectedControlIndices[0], 41);
  const sparseMaximum = Math.max(...sparse.weights);
  assert.equal(sparseMaximum, sparse.weights[Math.floor(sparse.weights.length / 2)]);
  assert.ok(dense.affectedControlIndices.length > sparse.affectedControlIndices.length);
});

test("arc-length Soft Edit preserves fixed axes and source provenance", () => {
  const source = stroke(32);
  const before = structuredClone(source);
  const result = applyArcLengthSoftEdit(source, 16, "right", { x: 99, y: 2, z: 3 }, "low");
  assert.deepEqual(source, before);
  assert.ok(result.stroke.controlPoints.every((point, index) => {
    const original = source.controlPoints[index];
    return point.position.x === original.position.x
      && point.provenance.sourceStroke === original.provenance.sourceStroke
      && point.provenance.sourceT === original.provenance.sourceT;
  }));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSurfaceDrawAnchor,
  createSurfaceDrawStroke,
  parseSurfaceDrawStroke,
  serializeSurfaceDrawStroke,
  validateSurfaceDrawStroke,
} from "./surfaceDraw.ts";

const anchor = {
  id: "surface-anchor-1",
  surfaceId: "surface-1",
  hitPosition: { x: 1, y: 2, z: 3 },
  localTangentFrame: {
    normal: { x: 0, y: 1, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    bitangent: { x: 0, y: 0, z: 1 },
  },
  sourceTriangle: 12,
  barycentric: { a: 0.2, b: 0.3, c: 0.5 },
  provenance: {
    sourceGestureId: "gesture-1",
    sourcePointStart: 4,
    sourcePointEnd: 5,
    sourceT: 0.25,
    order: 0,
  },
};

test("Surface Draw foundation keeps hit geometry and provenance without projection UI", () => {
  const empty = createSurfaceDrawStroke("surface-draw-1", "gesture-1");
  const stroke = appendSurfaceDrawAnchor(empty, anchor);
  assert.equal(empty.anchors.length, 0);
  assert.equal(stroke.anchors[0]?.sourceTriangle, 12);
  assert.equal(stroke.anchors[0]?.barycentric.c, 0.5);
  assert.equal(validateSurfaceDrawStroke(stroke).valid, true);
});

test("Surface Draw contract round-trips and rejects invalid barycentric data", () => {
  const stroke = appendSurfaceDrawAnchor(createSurfaceDrawStroke("surface-draw-1", "gesture-1"), anchor);
  const serialized = serializeSurfaceDrawStroke(stroke);
  assert.equal(serializeSurfaceDrawStroke(parseSurfaceDrawStroke(serialized)), serialized);
  const broken = structuredClone(stroke);
  broken.anchors[0]!.barycentric.c = 2;
  assert.equal(validateSurfaceDrawStroke(broken).valid, false);
  assert.throws(() => parseSurfaceDrawStroke(JSON.stringify(broken)), /barycentric/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { SupportPaintSurfaceIndex } from "./supportPaintSurfaceIndex.ts";

const positions = new Float32Array([
  -1, -1, 0, 1, -1, 0, 0, 1, 0,
  -1, -1, -1, 1, -1, -1, 0, 1, -1,
]);

test("BVH build performs no Array.from or Array sort allocation", () => {
  const source = new Float32Array(9 * 32);
  for (let triangle = 0; triangle < 32; triangle++) {
    const offset = triangle * 9;
    source.set([triangle, 0, 0, triangle + 0.5, 0, 0, triangle, 0.5, 0], offset);
  }
  const originalFrom = Array.from;
  const originalSort = Array.prototype.sort;
  Array.from = (() => { throw new Error("Array.from forbidden during BVH build"); }) as typeof Array.from;
  Array.prototype.sort = (() => { throw new Error("Array sort forbidden during BVH build"); }) as typeof Array.prototype.sort;
  try {
    const index = new SupportPaintSurfaceIndex(source);
    assert.equal(index.triangleCount, 32);
  } finally {
    Array.from = originalFrom;
    Array.prototype.sort = originalSort;
  }
});

test("BVH returns the nearest front-facing Surface hit", () => {
  const index = new SupportPaintSurfaceIndex(positions);
  const hit = index.raycast({ origin: { x: 0, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } }, null);
  assert.ok(hit);
  assert.equal(hit.triangleIndex, 0);
  assert.equal(hit.position.z, 0);
  assert.deepEqual(hit.normal, { x: 0, y: 0, z: 1 });
});

test("clipping skips a hidden near triangle and returns the next visible Surface", () => {
  const index = new SupportPaintSurfaceIndex(positions);
  const hit = index.raycast(
    { origin: { x: 0, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } },
    {
      x: { enabled: false, position: 0, direction: 1 },
      y: { enabled: false, position: 0, direction: 1 },
      z: { enabled: true, position: -0.5, direction: -1 },
    },
  );
  assert.ok(hit);
  assert.equal(hit.triangleIndex, 1);
  assert.equal(hit.position.z, -1);
});

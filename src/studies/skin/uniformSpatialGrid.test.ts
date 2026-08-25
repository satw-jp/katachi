import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUniformSpatialGrid3,
  queryUniformSpatialGridRayNeighborhood,
  queryUniformSpatialGridSphere,
} from "./uniformSpatialGrid.ts";

function lattice(count: number): Float32Array {
  const side = Math.ceil(Math.cbrt(count));
  const points = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    points[index * 3] = index % side;
    points[index * 3 + 1] = Math.floor(index / side) % side;
    points[index * 3 + 2] = Math.floor(index / (side * side));
  }
  return points;
}

test("sphere query matches a brute-force search exactly", () => {
  const points = lattice(30_000);
  const grid = buildUniformSpatialGrid3(points);
  const center = { x: 12.4, y: 10.2, z: 8.7 };
  const radius = 3.25;
  const indexed = queryUniformSpatialGridSphere(grid, center, radius).sort((a, b) => a - b);
  const brute: number[] = [];
  for (let index = 0; index < points.length / 3; index++) {
    const dx = points[index * 3] - center.x;
    const dy = points[index * 3 + 1] - center.y;
    const dz = points[index * 3 + 2] - center.z;
    if (dx * dx + dy * dy + dz * dz <= radius * radius) brute.push(index);
  }
  assert.deepEqual(indexed, brute);
  assert.ok(indexed.length < 500, "brush checks a local subset, not all 30k sites");
});

test("ray neighbourhood contains screen-picking candidates without scanning all sites", () => {
  const points = lattice(30_000);
  const grid = buildUniformSpatialGrid3(points);
  const candidates = queryUniformSpatialGridRayNeighborhood(
    grid,
    { x: -10, y: 12, z: 8 },
    { x: 1, y: 0, z: 0 },
  );
  assert.ok(candidates.length > 0);
  assert.ok(candidates.length < points.length / 3 / 3, "ray traversal excludes most support sites");
  const expected = 8 * 32 * 32 + 12 * 32 + 12;
  assert.ok(candidates.includes(expected));
});

test("30k-site grid logs indexed and full-scan timing evidence", () => {
  const points = lattice(30_000);
  const buildStart = performance.now();
  const grid = buildUniformSpatialGrid3(points);
  const buildMs = performance.now() - buildStart;
  const center = { x: 15, y: 15, z: 10 };
  const radius = 4;

  const indexedStart = performance.now();
  let indexedChecks = 0;
  for (let iteration = 0; iteration < 100; iteration++) {
    indexedChecks += queryUniformSpatialGridSphere(grid, center, radius).length;
  }
  const indexedMs = performance.now() - indexedStart;

  const fullStart = performance.now();
  let fullChecks = 0;
  for (let iteration = 0; iteration < 100; iteration++) {
    for (let index = 0; index < points.length / 3; index++) {
      const dx = points[index * 3] - center.x;
      const dy = points[index * 3 + 1] - center.y;
      const dz = points[index * 3 + 2] - center.z;
      if (dx * dx + dy * dy + dz * dz <= radius * radius) fullChecks++;
    }
  }
  const fullMs = performance.now() - fullStart;
  assert.equal(indexedChecks, fullChecks);
  console.info(
    "[Support Paint perf 30k] grid build=" + buildMs.toFixed(2) + "ms"
    + " indexed100=" + indexedMs.toFixed(2) + "ms"
    + " full100=" + fullMs.toFixed(2) + "ms"
    + " candidates/query=" + (indexedChecks / 100).toFixed(0),
  );
});

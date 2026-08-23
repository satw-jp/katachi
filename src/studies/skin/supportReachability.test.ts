import assert from "node:assert/strict";
import { test } from "node:test";
import { filterSupportEnforcerReachability } from "./supportReachability.ts";

const triangle = (z: number, offsetX = 0): Float32Array => new Float32Array([
  offsetX, 0, z, offsetX + 2, 0, z, offsetX, 2, z,
]);

test("lower envelope keeps exterior candidates and rejects a stacked interior candidate", () => {
  const candidates = new Float32Array([...triangle(4, 10), ...triangle(2)]);
  const surface = new Float32Array([...triangle(4, 10), ...triangle(1)]);
  const result = filterSupportEnforcerReachability(candidates, surface);
  assert.equal(result.candidateFaceCount, 2);
  assert.equal(result.keptFaceCount, 1);
  assert.equal(result.rejectedFaceCount, 1);
  assert.deepEqual(Array.from(result.keptPositions), Array.from(triangle(4, 10)));
});

test("same-height self intersections are ignored while a lower surface blocks", () => {
  const candidate = triangle(5);
  assert.equal(filterSupportEnforcerReachability(candidate, candidate).keptFaceCount, 1);
  assert.equal(filterSupportEnforcerReachability(candidate, new Float32Array([...candidate, ...triangle(4.99)])).keptFaceCount, 0);
});

test("kept soup preserves deterministic input order", () => {
  const first = triangle(2, 10);
  const second = triangle(3, 20);
  const result = filterSupportEnforcerReachability(new Float32Array([...first, ...second]), new Float32Array([...first, ...second]));
  assert.deepEqual(Array.from(result.keptPositions), [...first, ...second]);
});

test("degenerate and non-finite candidates fail closed without corrupting the output", () => {
  const invalid = new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0]);
  const nonFinite = new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0]);
  const result = filterSupportEnforcerReachability(new Float32Array([...invalid, ...nonFinite]), triangle(0));
  assert.equal(result.keptFaceCount, 0);
  assert.equal(result.invalidCandidateFaceCount, 2);
  assert.equal(result.keptPositions.length, 0);
});

test("XY spatial index finds triangles that cross multiple cells", () => {
  const candidate = triangle(5, 30);
  const broadLower = new Float32Array([0, 0, 1, 80, 0, 1, 0, 80, 1]);
  const result = filterSupportEnforcerReachability(candidate, broadLower);
  assert.equal(result.gridCellCount > 1, true);
  assert.equal(result.rejectedFaceCount, 1);
});


test("empty or invalid final Surface occluders fail closed", () => {
  const candidate = triangle(5);
  assert.throws(() => filterSupportEnforcerReachability(candidate, new Float32Array()), /occlusion meshが空/);
  assert.throws(() => filterSupportEnforcerReachability(candidate, new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0])), /無効面/);
  assert.throws(() => filterSupportEnforcerReachability(candidate, new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0])), /無効面/);
});

test("a mixed valid and invalid final Surface occluder fails closed", () => {
  const candidate = triangle(5);
  const degenerate = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
  assert.throws(() => filterSupportEnforcerReachability(candidate, new Float32Array([...triangle(5), ...degenerate])), /無効面/);
});

test("a tiny nonzero final Surface triangle remains a usable occluder", () => {
  const tinySurface = new Float32Array([0, 0, 1, 1e-11, 0, 1, 0, 1e-11, 1]);
  const candidate = new Float32Array([0, 0, 2, 1e-11, 0, 2, 0, 1e-11, 2]);
  const result = filterSupportEnforcerReachability(candidate, tinySurface);
  assert.equal(result.surfaceTriangleCount, 1);
  assert.equal(result.invalidSurfaceTriangleCount, 0);
  assert.equal(result.rejectedFaceCount, 1);
  assert.equal(result.keptFaceCount, 0);
  const collinear = new Float32Array([0, 0, 1, 1e-11, 0, 1, 2e-11, 0, 1]);
  assert.throws(() => filterSupportEnforcerReachability(candidate, collinear), /無効面/);
});


test("a near-collinear nonzero XY Surface triangle still occludes", () => {
  const surface = new Float32Array([0, 0, 1, 2, 0, 1, 4, 1e-12, 1]);
  const candidate = new Float32Array([0, 0, 2, 2, 0, 2, 4, 1e-12, 2]);
  const result = filterSupportEnforcerReachability(candidate, surface);
  assert.equal(result.invalidSurfaceTriangleCount, 0);
  assert.equal(result.rejectedFaceCount, 1);
});

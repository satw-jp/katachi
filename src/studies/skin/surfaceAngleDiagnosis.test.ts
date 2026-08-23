import assert from "node:assert/strict";
import type { Triangle } from "../cloud-sculpt/meshExport.ts";
import { diagnoseSurfaceAnglePositions, diagnoseSurfaceAngles, surfaceOverhangAngleDeg } from "./surfaceAngleDiagnosis.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

const downward: Triangle = {
  a: { x: 0, y: 0, z: 0 },
  b: { x: 0, y: 1, z: 0 },
  c: { x: 1, y: 0, z: 0 },
};
const upward: Triangle = { a: downward.a, b: downward.c, c: downward.b };
const vertical: Triangle = {
  a: { x: 0, y: 0, z: 0 },
  b: { x: 0, y: 0, z: 1 },
  c: { x: 0, y: 1, z: 0 },
};

assert.equal(surfaceOverhangAngleDeg({ x: 0, y: 0, z: -1 }), 90);
assert.equal(surfaceOverhangAngleDeg({ x: 1, y: 0, z: 0 }), 0);
assert.equal(surfaceOverhangAngleDeg({ x: 0, y: 0, z: 1 }), 0);
assert.ok(Math.abs(surfaceOverhangAngleDeg({ x: 0.5, y: 0, z: -Math.sqrt(0.75) }) - 60) < 1e-9);

const before = diagnoseSurfaceAngles([downward, upward, vertical], null, 45, 0.05);
assert.equal(before.dangerousFaceCountBefore, 1);
assert.equal(before.dangerousFaceCountAfter, 1);
assert.equal(before.mitigatedFaceCount, 0);
assert.equal(before.beforeDangerPositions.length, 9);
assert.equal(before.afterDangerPositions.length, 9);
assert.equal(before.mitigatedPositions.length, 0);

const graph: InternalStructureGraph = {
  kind: "voronoiEdge",
  nodes: [
    { id: 0, position: { x: 1 / 3, y: 1 / 3, z: -0.1 }, radius: 0.04 },
    { id: 1, position: { x: 1 / 3, y: 1 / 3, z: -0.4 }, radius: 0.04 },
  ],
  edges: [{ id: 0, start: 0, end: 1, radius: 0.04 }],
  stats: {
    inputPoints: 0,
    delaunayTetrahedra: 0,
    candidateEdges: 1,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  },
};
const after = diagnoseSurfaceAngles([downward], graph, 45, 0.05);
assert.equal(after.dangerousFaceCountBefore, 1);
assert.equal(after.dangerousFaceCountAfter, 0);
assert.equal(after.mitigatedFaceCount, 1);
assert.equal(after.beforeDangerPositions.length, 9);
assert.equal(after.afterDangerPositions.length, 0);
assert.equal(after.mitigatedPositions.length, 9);
assert.ok(Math.abs(after.dangerousAreaBefore - after.mitigatedArea) < 1e-12);

const strict = diagnoseSurfaceAngles([downward], null, 91, 0.05);
assert.equal(strict.thresholdDeg, 90);
assert.equal(strict.dangerousFaceCountBefore, 1);

const bufferResult = diagnoseSurfaceAnglePositions(
  new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]), graph, 45, 0.05,
);
assert.equal(bufferResult.dangerousFaceCountBefore, after.dangerousFaceCountBefore);
assert.equal(bufferResult.mitigatedFaceCount, after.mitigatedFaceCount);

console.log("surface angle diagnosis tests: 22 passed");

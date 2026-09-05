import assert from "node:assert/strict";
import { test } from "node:test";
import { characterizeHostMesh } from "./externalStlHostDiagnostics.ts";
import type { ParsedHostMesh } from "./externalStlHost.ts";

function mesh(positions: number[], normals: number[]): ParsedHostMesh {
  const triangleCount = positions.length / 9;
  return {
    positions: new Float64Array(positions),
    geometricNormals: new Float64Array(normals),
    triangleCount,
    validTriangleIndices: Array.from({ length: triangleCount }, (_, index) => index),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    coordinateFrame: "right-handed-y-up-mm",
  };
}

test("open two-triangle mesh reports boundary edges and one component", () => {
  const diagnostics = characterizeHostMesh(mesh([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    1, 0, 0, 1, 1, 0, 0, 1, 0,
  ], [
    0, 0, 1,
    0, 0, 1,
  ]));
  assert.equal(diagnostics.topology.validTriangleCount, 2);
  assert.equal(diagnostics.topology.degenerateTriangleCount, 0);
  assert.equal(diagnostics.topology.connectedComponentCount, 1);
  assert.equal(diagnostics.topology.boundaryEdgeCount, 4);
  assert.equal(diagnostics.topology.nonManifoldEdgeCount, 0);
  assert.equal(diagnostics.topology.watertightDiagnostic, "OPEN");
  assert.equal(diagnostics.normals.medianDihedralDeg, 0);
});

test("duplicate welded vertices and degenerate triangles are derived diagnostics", () => {
  const diagnostics = characterizeHostMesh(mesh([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 1e-9, 0, 0, 0, 1e-9, 0,
  ], [
    0, 0, 1,
    0, 0, 1,
  ]), 1e-6);
  assert.equal(diagnostics.topology.validTriangleCount, 1);
  assert.equal(diagnostics.topology.degenerateTriangleCount, 1);
  assert.ok(diagnostics.topology.weldedVertexCount < 6);
});

test("degeneracy classification is invariant under uniform unit scaling", () => {
  const positions = [
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 1e-9, 0, 0, 0, 1e-9, 0,
  ];
  const normals = [0, 0, 1, 0, 0, 1];
  const base = characterizeHostMesh(mesh(positions, normals));
  const scaled = characterizeHostMesh(mesh(positions.map((value) => value * 10), normals));
  assert.equal(scaled.topology.validTriangleCount, base.topology.validTriangleCount);
  assert.equal(scaled.topology.degenerateTriangleCount, base.topology.degenerateTriangleCount);
  assert.equal(scaled.topology.boundaryEdgeCount, base.topology.boundaryEdgeCount);
});

test("same-winding adjacent triangles report an orientation inconsistency", () => {
  const diagnostics = characterizeHostMesh(mesh([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    1, 0, 0, 0, 1, 0, 1, 1, 0,
  ], [
    0, 0, 1,
    0, 0, 1,
  ]));
  assert.equal(diagnostics.topology.orientationInconsistencyEdgeCount, 1);
  assert.equal(diagnostics.normals.maximumDihedralDeg, 0);
});

import assert from "node:assert/strict";
import { canonicalizeSkinRebuildExportDegenerates } from "./exportLocalDegenerateCanonicalization.ts";
import { inspectSavedStlTopology, type MeshBuildResult, type Triangle } from "../../cloud-sculpt/meshExport.ts";

const tetrahedron: Triangle[] = [
  { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: 1, z: 0 } },
  { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 1 }, c: { x: 1, y: 0, z: 0 } },
  { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 }, c: { x: 0, y: 0, z: 1 } },
  { a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 0, z: 1 }, c: { x: 0, y: 1, z: 0 } },
];

function mesh(triangles: Triangle[], removedSavedDegenerateTriangleCount?: number): MeshBuildResult {
  return {
    triangles,
    sourceBounds: {
      min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 },
      size: { x: 1, y: 1, z: 1 }, longest: 1,
    },
    mmBounds: {
      min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 },
      size: { x: 1, y: 1, z: 1 }, longest: 1,
    },
    scaleMmPerUnit: 1,
    watertight: { ok: true, openEdges: 0, nonManifoldEdges: 0, totalEdges: 6 },
    ...(removedSavedDegenerateTriangleCount === undefined ? {} : { removedSavedDegenerateTriangleCount }),
  };
}

const degenerateFaces: Triangle[] = [
  { a: { x: 0.25, y: 0.25, z: 0.25 }, b: { x: 0.25, y: 0.25, z: 0.25 }, c: { x: 0.25, y: 0.25, z: 0.25 } },
  { a: { x: 0.5, y: 0.5, z: 0.5 }, b: { x: 0.5, y: 0.5, z: 0.5 }, c: { x: 0.5, y: 0.5, z: 0.5 } },
];
const sourceSurvivorKeys = new Set(tetrahedron.flatMap((triangle) =>
  [triangle.a, triangle.b, triangle.c].map((point) => `${point.x},${point.y},${point.z}`)));
const canonicalized = canonicalizeSkinRebuildExportDegenerates(mesh([...tetrahedron, ...degenerateFaces]));
assert.equal(canonicalized.canonicalizedSavedDegenerateTriangleCount, 2);
assert.equal(canonicalized.before.degenerateTriangleCount, 2);
assert.equal(canonicalized.after.ok, true);
assert.equal(canonicalized.mesh.removedSavedDegenerateTriangleCount, 0);
assert.equal(canonicalized.mesh.triangles.length, tetrahedron.length);
assert.deepEqual(
  new Set(canonicalized.mesh.triangles.flatMap((triangle) =>
    [triangle.a, triangle.b, triangle.c].map((point) => `${point.x},${point.y},${point.z}`))),
  sourceSurvivorKeys,
  "canonicalization must preserve surviving vertex positions exactly",
);

const repairedMetadata = canonicalizeSkinRebuildExportDegenerates(mesh(tetrahedron, 2));
assert.equal(repairedMetadata.canonicalizedSavedDegenerateTriangleCount, 2);
assert.equal(repairedMetadata.after.ok, true);
assert.equal(repairedMetadata.mesh.removedSavedDegenerateTriangleCount, 0);

assert.throws(
  () => canonicalizeSkinRebuildExportDegenerates(mesh([...tetrahedron, degenerateFaces[0]])),
  /expected exactly 2 fully degenerate faces, found 1/,
);
assert.equal(inspectSavedStlTopology(canonicalized.mesh.triangles, 1).ok, true);

console.log("exportLocalDegenerateCanonicalization: exact two-face export-only cleanup and topology recheck passed");

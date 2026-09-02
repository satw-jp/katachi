import assert from "node:assert/strict";
import { createPatchesSdfEvaluator, patchesSdf, type Patch } from "../field.ts";
import { countConnectedComponents, countConnectedComponentsFromPositions, encodeObjFromBinaryStl } from "../meshExport.ts";
import { flatNormalsFromTriangleSoup } from "../previewMeshBuffers.ts";

const stage6Triangle = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const stage6Normals = flatNormalsFromTriangleSoup(stage6Triangle);
assert.deepEqual([...stage6Normals], [0, 0, 1, 0, 0, 1, 0, 0, 1],
  "Stage 6 must return display normals for its exact meshed triangle soup");
assert.throws(() => flatNormalsFromTriangleSoup(new Float32Array(3)), /not triangular/);

const separatedTriangles = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0,
  10, 0, 0, 11, 0, 0, 10, 1, 0,
]);
const separatedTriangleObjects = [
  { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: 1, z: 0 } },
  { a: { x: 10, y: 0, z: 0 }, b: { x: 11, y: 0, z: 0 }, c: { x: 10, y: 1, z: 0 } },
];
assert.equal(
  countConnectedComponentsFromPositions(separatedTriangles),
  countConnectedComponents(separatedTriangleObjects),
  "direct Float32 component counting must preserve the authoritative triangle-soup result",
);

const internalPatches: Patch[] = [
  {
    id: -1,
    shape: "coin",
    points: [
      { x: -0.75, y: 0.25, z: 0.5, r: 0.2 },
      { x: 0.4, y: -0.3, z: 0.1, r: 0.12 },
    ],
  },
  {
    id: -2,
    shape: "coin",
    points: [{ x: 0.8, y: 0.6, z: -0.4, r: 0.31 }],
  },
];
for (const blend of [0, 0.04]) {
  const evaluate = createPatchesSdfEvaluator(internalPatches, blend);
  for (const [x, y, z] of [
    [0, 0, 0],
    [-0.75, 0.25, 0.5],
    [0.2, -0.1, 0.9],
    [2, -3, 1],
  ] as const) {
    const legacy = patchesSdf(internalPatches, blend, x, y, z);
    const compiled = evaluate(x, y, z);
    assert.ok(
      Math.abs(compiled - legacy) <= Number.EPSILON * Math.max(1, Math.abs(legacy)) * 4,
      `compiled internal SDF changed the value at ${x},${y},${z} (blend ${blend})`,
    );
  }
}
assert.equal(createPatchesSdfEvaluator([], 0.04)(0, 0, 0), 1e5);

const stl = new ArrayBuffer(84 + 50);
const view = new DataView(stl);
view.setUint32(80, 1, true);
let offset = 84 + 12;
for (const point of [[0, 0, 0], [10.5, 0, 0], [0, 20.25, 0]] as const) {
  view.setFloat32(offset, point[0], true);
  view.setFloat32(offset + 4, point[1], true);
  view.setFloat32(offset + 8, point[2], true);
  offset += 12;
}

const obj = encodeObjFromBinaryStl(stl);
assert.match(obj, /# triangles 1/);
assert.match(obj, /v 0 0 0/);
assert.match(obj, /v 10\.5 0 0/);
assert.match(obj, /v 0 20\.25 0/);
assert.match(obj, /f 1 2 3/);
assert.throws(() => encodeObjFromBinaryStl(new ArrayBuffer(83)), /truncated/);
const wrongSize = stl.slice(0);
new DataView(wrongSize).setUint32(80, 2, true);
assert.throws(() => encodeObjFromBinaryStl(wrongSize), /size is invalid/);

console.log("SKIN REBUILD cached mesh export tests passed");

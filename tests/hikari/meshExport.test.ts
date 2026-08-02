import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeObj,
  makeExportBaseName,
  type MeshBuildResult,
} from "../../src/studies/cloud-sculpt/meshExport.ts";

test("OBJ export shares coincident vertices across adjacent triangles", () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 1, y: 0, z: 0 };
  const c = { x: 1, y: 1, z: 0 };
  const d = { x: 0, y: 1, z: 0 };
  const result = {
    triangles: [{ a, b, c }, { a, b: c, c: d }],
    scaleMmPerUnit: 10,
    sourceBounds: null,
    mmBounds: null,
    watertight: null,
  } as unknown as MeshBuildResult;

  const obj = encodeObj(result);
  assert.equal(obj.match(/^v /gm)?.length, 4);
  assert.equal(obj.match(/^f /gm)?.length, 2);
  assert.match(obj, /# shared_vertices 4/);
  assert.match(obj, /^f 1 2 3$/m);
  assert.match(obj, /^f 1 3 4$/m);
  assert.match(obj, /^# Katachi Cloud Sculpt OBJ$/m);
  assert.match(makeExportBaseName(), /^katachi-cloud-\d{8}$/);
});

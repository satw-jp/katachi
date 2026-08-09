import assert from "node:assert/strict";
import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { countBoundaryVoxels, fillSurfaceField } from "./volumeSurface.ts";

const size = 12;
const field = new Float32Array(size ** 3);
for (let z = 0; z < size; z++) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dz = z - size / 2;
      field[x + size * (y + size * z)] = 3.5 - Math.hypot(dx, dy, dz);
    }
  }
}

const surface = new MarchingCubes(size, new THREE.MeshBasicMaterial(), false, false, 10_000);
fillSurfaceField(surface.field, field, { phase: "positive", threshold: 0 });
surface.isolation = 0;
surface.update();
assert.ok(surface.count > 0, "a closed scalar blob should produce triangles");
assert.equal(surface.count % 3, 0);

const positions = surface.geometry.getAttribute("position");
for (let index = 0; index < surface.count; index++) {
  assert.ok(Number.isFinite(positions.getX(index)));
  assert.ok(Number.isFinite(positions.getY(index)));
  assert.ok(Number.isFinite(positions.getZ(index)));
}

const negative = new Float32Array(field.length);
fillSurfaceField(negative, field, { phase: "negative", threshold: 0 });
assert.equal(negative[0], -field[0]);

assert.equal(countBoundaryVoxels(field, size, 0), 0);
field[0] = 1;
assert.equal(countBoundaryVoxels(field, size, 0), 1);

console.log("volumeSurface: 8 assertions passed");

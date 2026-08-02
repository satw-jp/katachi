import assert from "node:assert/strict";
import * as THREE from "three";
import { createVolumeMask } from "./volumeMask.ts";

const geometry = new THREE.BoxGeometry(1.4, 1.4, 1.4);
const size = 11;
const mask = createVolumeMask(geometry, size);
const index = (x: number, y: number, z: number) => x + size * (y + size * z);

assert.equal(mask.inside[index(5, 5, 5)], 1, "箱の中心は内側");
assert.equal(mask.inside[index(0, 0, 0)], 0, "格子の角は外側");
const insideCount = Array.from(mask.inside).filter(Boolean).length;
assert.ok(insideCount > 0 && insideCount < size ** 3, "内側と外側の両方が存在する");
assert.ok(mask.distanceToSurface[index(5, 5, 5)] > 0, "中心は表面から離れている");
assert.equal(Math.min(...mask.distanceToSurface), 0, "表面近傍のボクセルが存在する");

console.log("5 passed — hitsuji volume mask");

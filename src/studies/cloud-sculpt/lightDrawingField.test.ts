import assert from "node:assert/strict";

import {
  buildLightDrawingField,
  type LightDrawingSample,
} from "./lightDrawingField.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const domain = { minX: -2, minZ: -2, sizeX: 4, sizeZ: 4 };
const samples: LightDrawingSample[] = [
  { x: -0.6, z: 0.2, energy: 0.8, color: [1, 0.7, 0.4] },
  { x: 0.4, z: -0.5, energy: 1, color: [0.6, 0.9, 1] },
  { x: 0.45, z: -0.48, energy: 0.7, color: [0.6, 0.9, 1] },
];

test("fixed domain is preserved instead of following hit percentiles", () => {
  const field = buildLightDrawingField(samples, {
    domain,
    emittedRayCount: 256,
    width: 32,
    height: 32,
  });
  assert.equal(field.minX, domain.minX);
  assert.equal(field.minZ, domain.minZ);
  assert.equal(field.sizeX, domain.sizeX);
  assert.equal(field.sizeZ, domain.sizeZ);
});

test("doubling identical rays and emitted count preserves exposure", () => {
  const first = buildLightDrawingField(samples, {
    domain,
    emittedRayCount: 256,
    width: 32,
    height: 32,
  });
  const doubled = buildLightDrawingField([...samples, ...samples], {
    domain,
    emittedRayCount: 512,
    width: 32,
    height: 32,
  });
  assert.deepEqual(doubled.data, first.data);
});

test("a new bright hit does not re-normalize an unchanged distant hit", () => {
  const first = buildLightDrawingField(samples, {
    domain,
    emittedRayCount: 256,
    width: 32,
    height: 32,
    reconstructionRadius: 0,
  });
  const hotspot = Array.from({ length: 40 }, () => ({
    x: 1.5,
    z: 1.5,
    energy: 1,
    color: [1, 1, 1] as [number, number, number],
  }));
  const second = buildLightDrawingField([...samples, ...hotspot], {
    domain,
    emittedRayCount: 256,
    width: 32,
    height: 32,
    reconstructionRadius: 0,
  });
  const x = Math.round(((-0.6 - domain.minX) / domain.sizeX) * 31);
  const y = Math.round(((0.2 - domain.minZ) / domain.sizeZ) * 31);
  const offset = (y * 32 + x) * 4;
  assert.equal(second.data[offset], first.data[offset]);
  assert.equal(second.data[offset + 1], first.data[offset + 1]);
  assert.equal(second.data[offset + 2], first.data[offset + 2]);
});

console.log(`passed ${passed} light-drawing field tests`);

import assert from "node:assert/strict";
import { createPhaseField, PHASE_SIZE, type PhaseFieldCondition } from "./deformation.ts";

const voxelCount = PHASE_SIZE ** 3;
const inside = new Uint8Array(voxelCount);
const distanceToSurface = new Uint8Array(voxelCount);
distanceToSurface.fill(8);

for (let z = 7; z <= 16; z++) {
  for (let y = 7; y <= 16; y++) {
    for (let x = 7; x <= 16; x++) {
      const index = x + PHASE_SIZE * (y + PHASE_SIZE * z);
      inside[index] = 1;
      if (x === 7 || x === 16 || y === 7 || y === 16 || z === 7 || z === 16) {
        distanceToSurface[index] = 0;
      }
    }
  }
}

const condition = (mode: PhaseFieldCondition["mode"]): PhaseFieldCondition => ({
  mode,
  inside,
  distanceToSurface,
});

const insideField = createPhaseField(42, 20, condition("inside"));
const outsideField = createPhaseField(42, 20, condition("outside"));
const surfaceField = createPhaseField(42, 20, condition("surface"));
const zeroWindField = createPhaseField(42, 20, condition("inside"), {
  windX: 0,
  windZ: 0,
  cohesion: 1,
});
const xWindField = createPhaseField(42, 20, condition("inside"), {
  windX: 0.45,
  windZ: 0,
  cohesion: 1,
});
const zWindField = createPhaseField(42, 20, condition("inside"), {
  windX: 0,
  windZ: 0.45,
  cohesion: 1,
});
const curvedWindField = createPhaseField(42, 20, condition("inside"), {
  windMode: "curved",
  windX: 0.45,
  windZ: 0,
  curl: 0.85,
  cohesion: 1,
});
const pulsingWindField = createPhaseField(42, 20, condition("inside"), {
  windMode: "pulsing",
  windX: 0.45,
  windZ: 0,
  pulseCycles: 3,
  cohesion: 1,
});

for (let index = 0; index < voxelCount; index++) {
  if (inside[index] === 0) assert.equal(insideField[index], 0, "inside condition must freeze exterior voxels");
  if (inside[index] === 1) assert.equal(outsideField[index], 0, "outside condition must freeze interior voxels");
  if (distanceToSurface[index] <= 1) {
    assert.ok(
      Math.abs(surfaceField[index] - 0.95) < 1e-6,
      "surface source must remain fixed during evolution",
    );
  }
}

assert.deepEqual(
  createPhaseField(42, 20, condition("inside")),
  insideField,
  "conditioned phase evolution must remain deterministic",
);
assert.notDeepEqual(createPhaseField(42, 0, condition("inside")), insideField, "time must evolve the active domain");
assert.deepEqual(zeroWindField, insideField, "zero wind with default cohesion must preserve the previous evolution");
assert.notDeepEqual(xWindField, insideField, "uniform wind must change the evolved phase field");
assert.notDeepEqual(zWindField, xWindField, "wind direction must change the evolved phase field");
assert.notDeepEqual(curvedWindField, xWindField, "a spatially curved wind must differ from uniform advection");
assert.notDeepEqual(pulsingWindField, xWindField, "a pulsing wind must differ from continuous advection");

console.log("10 passed — hitsuji conditioned phase and wind");

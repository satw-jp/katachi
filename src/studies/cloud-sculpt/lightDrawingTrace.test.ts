import assert from "node:assert/strict";

import * as THREE from "three";
import { createCloudHikariShape } from "./hikariAdapter.ts";
import { traceFocusedRay } from "./optics.ts";

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

const ball = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const plain = createCloudHikariShape(ball, 0, { surfaceTraceStrength: 0 });
const traced = createCloudHikariShape(ball, 0, { surfaceTraceStrength: 0.34 });
assert.ok(plain && traced);

test("curved ribbon is saved as geometry and changes the local boundary", () => {
  assert.equal(traced.asset.representation.kind, "metaballs-v1");
  if (traced.asset.representation.kind !== "metaballs-v1") return;
  assert.equal(traced.asset.representation.surfaceTrace?.kind, "curved-ribbon-v1");
  assert.equal(traced.asset.representation.surfaceTrace?.strength, 0.34);
  assert.notEqual(traced.asset.sourceHash, plain.asset.sourceHash);

  const localPoint = { x: 0, y: 1, z: 0 };
  assert.ok(traced.runtime.distance(localPoint) < plain.runtime.distance(localPoint) - 0.04);

  const distantPoint = { x: -1, y: 0, z: 0 };
  assert.ok(Math.abs(traced.runtime.distance(distantPoint) - plain.runtime.distance(distantPoint)) < 1e-5);

  const plainNormal = plain.runtime.normal(localPoint, 0.002);
  const tracedNormal = traced.runtime.normal(localPoint, 0.002);
  assert.ok(plainNormal && tracedNormal);
  assert.ok(Math.hypot(
    tracedNormal.x - plainNormal.x,
    tracedNormal.y - plainNormal.y,
    tracedNormal.z - plainNormal.z,
  ) > 0.08);
});

test("LD1 trace moves real refracted receiver hits", () => {
  const incident = new THREE.Vector3(0, -1, 0);
  const floorY = -1.55;
  const displacements: number[] = [];
  let sharedHits = 0;
  for (let ix = 0; ix < 15; ix++) {
    for (let iz = 0; iz < 15; iz++) {
      const x = -0.84 + (ix / 14) * 1.68;
      const z = -0.84 + (iz / 14) * 1.68;
      const origin = new THREE.Vector3(x, 2.2, z);
      const baseRay = traceFocusedRay(plain.runtime, origin, incident, 1.5, floorY, 5);
      const tracedRay = traceFocusedRay(traced.runtime, origin, incident, 1.5, floorY, 5);
      if (!baseRay.floorHit || !tracedRay.floorHit || !baseRay.entry || !tracedRay.entry) continue;
      sharedHits++;
      displacements.push(baseRay.floorHit.distanceTo(tracedRay.floorHit));
    }
  }
  assert.ok(sharedHits >= 80, `expected at least 80 shared receiver hits, got ${sharedHits}`);
  const meanDisplacement = displacements.reduce((sum, value) => sum + value, 0) / displacements.length;
  const movedHits = displacements.filter((value) => value > 0.01).length;
  assert.ok(meanDisplacement > 0.015, `mean receiver displacement was ${meanDisplacement}`);
  assert.ok(movedHits > sharedHits * 0.2, `only ${movedHits}/${sharedHits} hits moved`);
});

console.log(`passed ${passed} light-drawing trace tests`);

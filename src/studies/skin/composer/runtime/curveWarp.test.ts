import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { curveControlOffset, curveControlPoint, curveSamplePoint } from "./composerRuntime.ts";

function testEdge(): { start: THREE.Vector3; end: THREE.Vector3; midpoint: THREE.Vector3; direction: THREE.Vector3; length: number; density: number; connectivity: number; directionChange: number; supportRole: number; motifInfluence: number } {
  const start = new THREE.Vector3(0, 0, 0);
  const end = new THREE.Vector3(2, 0, 0);
  return {
    start, end,
    midpoint: new THREE.Vector3(1, 0, 0),
    direction: new THREE.Vector3(1, 0, 0),
    length: 2,
    density: 0.5, connectivity: 0.6, directionChange: 0.4, supportRole: 0.3, motifInfluence: 0.5,
  };
}

test("curve helpers never mutate the source edge", () => {
  const edge = testEdge();
  const before = { start: edge.start.clone(), end: edge.end.clone(), midpoint: edge.midpoint.clone(), direction: edge.direction.clone() };
  const { bend, sag } = curveControlOffset(edge, 3, 12345);
  const control = edge.midpoint.clone().add(bend).add(sag);
  curveSamplePoint(edge, control, 0.37);
  curveControlPoint(edge, { amount: 0.8, bend: 0.5, sag: 0.5, flow: 0.5 }, 3, 12345);
  assert.deepEqual(edge.start.toArray(), before.start.toArray());
  assert.deepEqual(edge.end.toArray(), before.end.toArray());
  assert.deepEqual(edge.midpoint.toArray(), before.midpoint.toArray());
  assert.deepEqual(edge.direction.toArray(), before.direction.toArray());
});

test("curved sample deviates from the straight lerp, endpoints stay fixed", () => {
  const edge = testEdge();
  const { bend, sag } = curveControlOffset(edge, 3, 12345);
  const control = edge.midpoint.clone().add(bend).add(sag);
  const mid = curveSamplePoint(edge, control, 0.5);
  const straight = edge.start.clone().lerp(edge.end, 0.5);
  assert.ok(mid.distanceTo(straight) > 1e-6);
  assert.deepEqual(curveSamplePoint(edge, control, 0).toArray(), edge.start.toArray());
  assert.deepEqual(curveSamplePoint(edge, control, 1).toArray(), edge.end.toArray());
});

test("curve control point is deterministic per seed and index", () => {
  const edge = testEdge();
  const params = { amount: 0.8, bend: 0.5, sag: 0.5, flow: 0.5 };
  const first = curveControlPoint(edge, params, 3, 12345);
  const second = curveControlPoint(edge, params, 3, 12345);
  const other = curveControlPoint(edge, params, 4, 12345);
  assert.deepEqual(first.toArray(), second.toArray());
  assert.ok(first.distanceTo(other) > 1e-9);
});

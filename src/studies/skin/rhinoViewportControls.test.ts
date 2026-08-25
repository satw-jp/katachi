import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  applyRhinoOrthographicDrag,
  isAxomeLeftRotateCandidate,
  RHINO_DRAG_THRESHOLD_PX,
  resolveRhinoViewportGesture,
  shouldStartRhinoCameraGesture,
} from "./rhinoViewportControls.ts";

function camera(): THREE.OrthographicCamera {
  const value = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.01, 100);
  value.position.set(5, -5, 5);
  value.up.set(-1, 1, 2).normalize();
  value.lookAt(0, 0, 0);
  return value;
}

test("Rhino drag mapping adds Axome plain-left rotate without stealing modified gestures", () => {
  assert.equal(RHINO_DRAG_THRESHOLD_PX, 4);
  assert.equal(shouldStartRhinoCameraGesture(0), false);
  assert.equal(shouldStartRhinoCameraGesture(0, true), true);
  assert.equal(shouldStartRhinoCameraGesture(2), true);
  assert.equal(isAxomeLeftRotateCandidate(0, "axome", { shiftKey: false, metaKey: false }, true), true);
  assert.equal(isAxomeLeftRotateCandidate(0, "top", { shiftKey: false, metaKey: false }, true), false);
  assert.equal(isAxomeLeftRotateCandidate(0, "axome", { shiftKey: true, metaKey: false }, true), false);
  assert.equal(isAxomeLeftRotateCandidate(0, "axome", { shiftKey: false, metaKey: true }, true), false);
  assert.equal(isAxomeLeftRotateCandidate(0, "axome", { shiftKey: false, metaKey: false }, false), false);
  assert.equal(resolveRhinoViewportGesture("top", { shiftKey: false, metaKey: false }), "pan");
  assert.equal(resolveRhinoViewportGesture("front", { shiftKey: true, metaKey: false }), "pan");
  assert.equal(resolveRhinoViewportGesture("axome", { shiftKey: false, metaKey: false }), "rotate");
  assert.equal(resolveRhinoViewportGesture("axome", { shiftKey: true, metaKey: false }), "pan");
  assert.equal(resolveRhinoViewportGesture("axome", { shiftKey: false, metaKey: true }), "zoom");
  assert.equal(resolveRhinoViewportGesture("right", { shiftKey: false, metaKey: true }), "zoom");
});

test("orthographic pan moves camera and target together without changing view direction or zoom", () => {
  const value = camera();
  const target = new THREE.Vector3();
  const beforeEye = value.position.clone().sub(target);
  const beforeZoom = value.zoom;
  applyRhinoOrthographicDrag(value, target, "pan", 120, -40, 800, 600);
  assert.ok(target.length() > 0);
  assert.ok(value.position.clone().sub(target).distanceTo(beforeEye) < 1e-10);
  assert.equal(value.zoom, beforeZoom);
});

test("Command vertical drag zooms without moving camera or target", () => {
  const value = camera();
  const target = new THREE.Vector3(1, 2, 3);
  const position = value.position.clone();
  applyRhinoOrthographicDrag(value, target, "zoom", 90, -50, 800, 600);
  assert.ok(value.zoom > 1);
  assert.ok(value.position.distanceTo(position) < 1e-12);
  assert.deepEqual(target.toArray(), [1, 2, 3]);
});

test("Axome quaternion rotation crosses poles continuously around the current panned target", () => {
  const value = camera();
  const target = new THREE.Vector3(1.5, -0.75, 0.4);
  value.position.copy(target).add(new THREE.Vector3(5, -5, 5));
  value.lookAt(target);
  const radius = value.position.distanceTo(target);
  let maxStep = 0;
  let previous = value.position.clone();
  for (let index = 0; index < 720; index++) {
    applyRhinoOrthographicDrag(value, target, "rotate", 0, 2.5, 800, 600);
    maxStep = Math.max(maxStep, value.position.distanceTo(previous));
    previous = value.position.clone();
    assert.ok(value.position.toArray().every(Number.isFinite));
    assert.ok(Math.abs(value.position.distanceTo(target) - radius) < 1e-9);
    assert.ok(Math.abs(value.position.clone().sub(target).normalize().dot(value.up)) < 1e-9);
  }
  assert.ok(maxStep < radius * 0.02, "no pole crossing may jump");
  assert.deepEqual(target.toArray(), [1.5, -0.75, 0.4]);
});

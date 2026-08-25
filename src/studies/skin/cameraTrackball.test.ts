import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import {
  createViewportClippingState,
  reduceViewportClippingState,
  viewportPointVisible,
  type ViewportClippingBounds,
} from "./viewportClipping.ts";

type TrackballInternals = TrackballControls & {
  _movePrev: THREE.Vector2;
  _moveCurr: THREE.Vector2;
};

const windowStub = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  pageXOffset: 0,
  pageYOffset: 0,
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: windowStub,
});

function fakeElement(): HTMLElement {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    style: {},
    ownerDocument: { documentElement: { clientLeft: 0, clientTop: 0 } },
    getBoundingClientRect: () => ({
      left: 0, top: 0, width: 800, height: 600,
      right: 800, bottom: 600, x: 0, y: 0,
      toJSON: () => ({}),
    }),
    clientWidth: 800,
    clientHeight: 600,
  } as unknown as HTMLElement;
}

function createControls(target = new THREE.Vector3()): {
  camera: THREE.PerspectiveCamera;
  controls: TrackballInternals;
} {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 5));
  camera.up.set(0, 1, 0);
  const controls = new TrackballControls(camera, fakeElement()) as TrackballInternals;
  controls.target.copy(target);
  controls.rotateSpeed = 1;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.3;
  controls.staticMoving = true;
  controls.keys = ["", "", ""];
  controls.update();
  return { camera, controls };
}

function rotateBy(
  controls: TrackballInternals,
  axis: "x" | "y",
  radians: number,
  steps: number,
  camera: THREE.PerspectiveCamera,
): number {
  let maxStep = 0;
  let previous = camera.position.clone();
  for (let step = 0; step < steps; step++) {
    controls._moveCurr[axis] += radians / steps;
    controls.update();
    maxStep = Math.max(maxStep, camera.position.distanceTo(previous));
    previous = camera.position.clone();
    const eye = camera.position.clone().sub(controls.target).normalize();
    assert.ok(Math.abs(eye.dot(camera.up.clone().normalize())) < 1e-9, "camera up stays orthogonal through poles");
    assert.ok(camera.position.toArray().every(Number.isFinite), "camera never jumps to a non-finite pose");
  }
  return maxStep;
}

test("vertical mouse rotation crosses both poles for two complete turns", () => {
  const target = new THREE.Vector3(1.25, -0.75, 0.5);
  const { camera, controls } = createControls(target);
  const start = camera.position.clone();
  const radius = start.distanceTo(target);

  const maxStep = rotateBy(controls, "y", Math.PI * 4, 128, camera);

  assert.ok(maxStep < radius * 0.11, "no pole step is a flip or jump");
  assert.ok(camera.position.distanceTo(start) < 1e-8, "two vertical turns close continuously");
  assert.ok(Math.abs(camera.position.distanceTo(target) - radius) < 1e-10, "object centre remains the rotation axis");
  controls.dispose();
});

test("horizontal mouse rotation completes 360 degrees around the same target", () => {
  const target = new THREE.Vector3(-0.4, 0.8, -1.2);
  const { camera, controls } = createControls(target);
  const start = camera.position.clone();
  const radius = start.distanceTo(target);

  const maxStep = rotateBy(controls, "x", Math.PI * 2, 96, camera);

  assert.ok(maxStep < radius * 0.08, "horizontal orbit has no discontinuity");
  assert.ok(camera.position.distanceTo(start) < 1e-8, "one horizontal turn closes continuously");
  assert.ok(Math.abs(camera.position.distanceTo(target) - radius) < 1e-10);
  controls.dispose();
});

test("object-coordinate clipping result is invariant under camera trackball rotation", () => {
  const bounds: ViewportClippingBounds = {
    x: { min: -5, max: 5 },
    y: { min: -5, max: 5 },
    z: { min: -5, max: 5 },
  };
  let clipping = createViewportClippingState(bounds);
  clipping = reduceViewportClippingState(clipping, bounds, { type: "toggle", axis: "x", enabled: true });
  clipping = reduceViewportClippingState(clipping, bounds, { type: "position", axis: "x", position: 1 });
  const visibleBefore = viewportPointVisible({ x: 2, y: 0, z: 0 }, clipping);
  const hiddenBefore = viewportPointVisible({ x: 0, y: 0, z: 0 }, clipping);

  const { camera, controls } = createControls();
  rotateBy(controls, "y", Math.PI * 4, 128, camera);
  rotateBy(controls, "x", Math.PI * 2, 96, camera);

  assert.equal(viewportPointVisible({ x: 2, y: 0, z: 0 }, clipping), visibleBefore);
  assert.equal(viewportPointVisible({ x: 0, y: 0, z: 0 }, clipping), hiddenBefore);
  controls.dispose();
});

test("standard trackball keeps zoom, pan and reset enabled without keyboard mode capture", () => {
  const { camera, controls } = createControls();
  const initialPosition = camera.position.clone();
  const initialUp = camera.up.clone();
  assert.equal(controls.noZoom, false);
  assert.equal(controls.noPan, false);
  assert.deepEqual(controls.keys, ["", "", ""]);

  rotateBy(controls, "y", Math.PI * 0.75, 24, camera);
  controls.reset();

  assert.ok(camera.position.distanceTo(initialPosition) < 1e-12);
  assert.ok(camera.up.distanceTo(initialUp) < 1e-12);
  controls.dispose();
});

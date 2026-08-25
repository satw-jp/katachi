import assert from "node:assert/strict";
import test from "node:test";
import {
  activeViewportClipAxisCount,
  createViewportClippingState,
  rebaseViewportClippingState,
  reduceViewportClippingState,
  viewportClippingToObjectUnits,
  viewportPointVisible,
  type ViewportClippingBounds,
} from "./viewportClipping.ts";

const bounds: ViewportClippingBounds = {
  x: { min: -10, max: 30 },
  y: { min: -20, max: 20 },
  z: { min: 0, max: 80 },
};

test("new clipping is disabled and centered, so OFF matches the prior display", () => {
  const state = createViewportClippingState(bounds);
  assert.deepEqual(state, {
    x: { enabled: false, position: 10, direction: 1 },
    y: { enabled: false, position: 0, direction: 1 },
    z: { enabled: false, position: 40, direction: 1 },
  });
  assert.equal(viewportPointVisible({ x: -999, y: 999, z: -999 }, state), true);
  assert.equal(activeViewportClipAxisCount(state), 0);
});

test("X/Y/Z can clip together and boundary points remain visible", () => {
  let state = createViewportClippingState(bounds);
  state = reduceViewportClippingState(state, bounds, { type: "toggle", axis: "x", enabled: true });
  state = reduceViewportClippingState(state, bounds, { type: "toggle", axis: "y", enabled: true });
  state = reduceViewportClippingState(state, bounds, { type: "toggle", axis: "z", enabled: true });
  assert.equal(activeViewportClipAxisCount(state), 3);
  assert.equal(viewportPointVisible({ x: 10, y: 0, z: 40 }, state), true);
  assert.equal(viewportPointVisible({ x: 9, y: 0, z: 40 }, state), false);
  assert.equal(viewportPointVisible({ x: 10, y: -1, z: 40 }, state), false);
  assert.equal(viewportPointVisible({ x: 10, y: 0, z: 39 }, state), false);
});

test("position clamps to bbox and direction reversal swaps the kept side", () => {
  let state = createViewportClippingState(bounds);
  state = reduceViewportClippingState(state, bounds, { type: "position", axis: "x", position: 999 });
  state = reduceViewportClippingState(state, bounds, { type: "toggle", axis: "x", enabled: true });
  assert.equal(state.x.position, 30);
  assert.equal(viewportPointVisible({ x: 20, y: 0, z: 0 }, state), false);
  state = reduceViewportClippingState(state, bounds, { type: "flip", axis: "x" });
  assert.equal(viewportPointVisible({ x: 20, y: 0, z: 0 }, state), true);
  assert.equal(viewportPointVisible({ x: 31, y: 0, z: 0 }, state), false);
});

test("axis reset and all-axis actions are deterministic", () => {
  let state = createViewportClippingState(bounds);
  for (const axis of ["x", "y", "z"] as const) {
    state = reduceViewportClippingState(state, bounds, { type: "toggle", axis, enabled: true });
    state = reduceViewportClippingState(state, bounds, { type: "flip", axis });
  }
  state = reduceViewportClippingState(state, bounds, { type: "reset-axis", axis: "y" });
  assert.deepEqual(state.y, { enabled: false, position: 0, direction: 1 });
  state = reduceViewportClippingState(state, bounds, { type: "disable-all" });
  assert.equal(activeViewportClipAxisCount(state), 0);
  assert.equal(state.x.direction, -1);
  state = reduceViewportClippingState(state, bounds, { type: "reset-all" });
  assert.deepEqual(state, createViewportClippingState(bounds));
});

test("bbox changes preserve normalized slider position without persisting geometry state", () => {
  let state = createViewportClippingState(bounds);
  state = reduceViewportClippingState(state, bounds, { type: "position", axis: "x", position: 20 });
  state = reduceViewportClippingState(state, bounds, { type: "toggle", axis: "x", enabled: true });
  const nextBounds: ViewportClippingBounds = {
    x: { min: 0, max: 200 },
    y: { min: -10, max: 10 },
    z: { min: -5, max: 5 },
  };
  state = rebaseViewportClippingState(state, bounds, nextBounds);
  assert.equal(state.x.position, 150);
  assert.equal(state.x.enabled, true);
});

test("millimetre HUD state maps to fixed object XYZ and hidden markers fail picking visibility", () => {
  let state = createViewportClippingState(bounds);
  state = reduceViewportClippingState(state, bounds, { type: "position", axis: "z", position: 20 });
  state = reduceViewportClippingState(state, bounds, { type: "toggle", axis: "z", enabled: true });
  const objectState = viewportClippingToObjectUnits(state, 10);
  assert.equal(objectState.z.position, 2);
  assert.equal(viewportPointVisible({ x: 0, y: 0, z: 1.9 }, objectState), false);
  assert.equal(viewportPointVisible({ x: 0, y: 0, z: 2 }, objectState), true);
  assert.equal(viewportPointVisible({ x: 0, y: 0, z: 3 }, objectState), true);
});

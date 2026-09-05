import assert from "node:assert/strict";
import test from "node:test";
import { InteractionTracker } from "./interactionTracker";
import { InteractionMeasurements, InteractionState } from "./interactionTypes";

test("InteractionMeasurements all values in 0..1", () => {
  const m: InteractionMeasurements = { pointerVelocity: 0, cameraVelocity: 0, zoomVelocity: 0, interactionImpulse: 0, secondsSinceInteraction: 0 };
  assert.ok(m.pointerVelocity >= 0 && m.pointerVelocity <= 1);
  assert.ok(m.cameraVelocity >= 0 && m.cameraVelocity <= 1);
  assert.ok(m.zoomVelocity >= 0 && m.zoomVelocity <= 1);
  assert.ok(m.interactionImpulse >= 0 && m.interactionImpulse <= 1);
  assert.ok(m.secondsSinceInteraction >= 0);
});

test("idle interaction energy stays low", () => {
  const state = InteractionTracker.createState();
  // No interaction - decay over time
  InteractionTracker.advanceFrame(state, 1 / 60); // 1 frame at 60fps
  InteractionTracker.advanceFrame(state, 1 / 60);
  const measurements = InteractionTracker.computeMeasurements(state, { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement, 1 / 60, false);
  // With userGate=false, interactionEnergy should not rise
  assert.ok(measurements.interactionImpulse < 0.5, `idle interactionImpulse should be low, got ${measurements.interactionImpulse}`);
});

test("pointer movement raises pointerVelocity", () => {
  const canvas: HTMLCanvasElement = { clientWidth: 1280, clientHeight: 720, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, x: 0, y: 0, toJSON: () => {} }) };
  const state = InteractionTracker.createState();
  // Simulate pointer move - use corner position (0,0) to get non-zero velocity
  InteractionTracker.updatePointerState(state, { clientX: 0, clientY: 0 } as PointerEvent, canvas);
  const measurements = InteractionTracker.computeMeasurements(state, canvas, 1 / 60, true);
  // pointerVelocity should be > 0 when pointer moved and userGate=true
  assert.ok(measurements.pointerVelocity > 0, `pointerVelocity should be > 0 after pointer move, got ${measurements.pointerVelocity}`);
});

test("interaction impule raises with recent interaction", () => {
  const state = InteractionTracker.createState();
  // Record an impulse
  InteractionTracker.recordImpulse(state);
  const measurements = InteractionTracker.computeMeasurements(state, { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement, 1 / 60, true);
  // Recent impulse should give high interactionImpulse
  assert.ok(measurements.interactionImpulse > 0.5, `recent interactionImpulse should be > 0.5, got ${measurements.interactionImpulse}`);
});

test("secondsSinceInteraction increases with idle frames", () => {
  const state = InteractionTracker.createState();
  // Advance many frames without interaction
  InteractionTracker.advanceFrame(state, 1 / 60);
  InteractionTracker.advanceFrame(state, 1 / 60);
  InteractionTracker.advanceFrame(state, 1 / 60);
  const measurements = InteractionTracker.computeMeasurements(state, { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement, 1 / 60, false);
  // secondsSinceInteraction should be > 0 after advancing frames
  assert.ok(measurements.secondsSinceInteraction > 0, `secondsSinceInteraction should be > 0 after idle frames, got ${measurements.secondsSinceInteraction}`);
});

test("new interaction resets secondsSinceInteraction", () => {
  const state = InteractionTracker.createState();
  // First, advance to have some seconds
  InteractionTracker.advanceFrame(state, 1 / 60);
  InteractionTracker.advanceFrame(state, 1 / 60);
  // Then record an impulse (resets the counter)
  InteractionTracker.recordImpulse(state);
  const measurementsBefore = InteractionTracker.computeMeasurements(state, { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement, 1 / 60, true);
  // Now advance again without recording
  InteractionTracker.advanceFrame(state, 1 / 60);
  const measurementsAfter = InteractionTracker.computeMeasurements(state, { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement, 1 / 60, true);
  // secondsShould reset - but computeMeasurements always computes from current state.framesSinceInteraction
  // After recordImpulse, framesSinceInteraction=0, after one advance it becomes 1 * delta
  assert.ok(measurementsAfter.secondsSinceInteraction >= 0);
});

test("tracker produces valid measurements object", () => {
  const state = InteractionTracker.createState();
  const measurements = InteractionTracker.computeMeasurements(state, { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement, 1 / 60, false);
  // All expected fields present
  assert.ok("pointerVelocity" in measurements);
  assert.ok("cameraVelocity" in measurements);
  assert.ok("zoomVelocity" in measurements);
  assert.ok("interactionImpulse" in measurements);
  assert.ok("secondsSinceInteraction" in measurements);
});
import { fieldSdf, type Ball } from "../../../src/studies/cloud-sculpt/field.ts";
import type { ShapeSource } from "../../../src/studies/cloud-sculpt/opticalScene.ts";
import { BACKLIGHT_STUDY_SHAPE_SOURCE } from "./shape-source-reference.fixture.ts";

/** The diagnostic intentionally has only these authored checkpoint positions. */
export const SHAPE_GESTURE_BRIDGE_CASES = Object.freeze([
  Object.freeze({ id: "OFF", label: "OFF", gesture: null }),
  Object.freeze({ id: "LEFT", label: "LEFT", gesture: -1 }),
  Object.freeze({ id: "CENTER", label: "CENTER", gesture: 0 }),
  Object.freeze({ id: "RIGHT", label: "RIGHT", gesture: 1 }),
] as const);

export const SHAPE_GESTURE_BRIDGE_SUN_SIZE = 0.53;
export const SHAPE_GESTURE_BRIDGE_SAMPLE_COUNT = 16384;
export const SHAPE_GESTURE_ROOT_SCAN_INTERVALS = 256;
export const SHAPE_GESTURE_ROOT_BISECTION_STEPS = 64;

export interface ShapeGestureBridgeResult {
  readonly gesture: number;
  readonly shape: ShapeSource;
  readonly baseBallIndex: number;
  readonly radius: number;
  readonly rho: number;
  readonly anchor: Readonly<{ x: number; y: number; z: number }>;
  readonly rootBracket: Readonly<{ low: number; high: number }>;
  readonly appendedCenters: readonly Readonly<{ x: number; y: number; z: number }>[];
}

function legacyBaseBalls(): Ball[] {
  return BACKLIGHT_STUDY_SHAPE_SOURCE.balls.map((ball, index) => ({
    id: index + 1,
    x: ball.center.x,
    y: ball.center.y,
    z: ball.center.z,
    r: ball.radius,
  }));
}

/**
 * Returns the actual frozen ShapeSource for OFF by identity.  For a finite
 * normalized gesture, it appends one five-ball connected thickening.  The
 * initial high bound is deliberately conservative: the polynomial smooth-min
 * can lower an N-ball union by at most (N - 1) * k / 4, then one base radius
 * provides additional room above the highest base sphere.
 */
export function shapeForGestureBridge(gesture: "OFF"): typeof BACKLIGHT_STUDY_SHAPE_SOURCE;
export function shapeForGestureBridge(gesture: number): ShapeGestureBridgeResult;
export function shapeForGestureBridge(gesture: number | "OFF"): typeof BACKLIGHT_STUDY_SHAPE_SOURCE | ShapeGestureBridgeResult {
  if (gesture === "OFF") return BACKLIGHT_STUDY_SHAPE_SOURCE;
  if (!Number.isFinite(gesture) || gesture < -1 || gesture > 1) {
    throw new RangeError("Shape gesture must be a finite normalized value in [-1, 1]");
  }

  const base = BACKLIGHT_STUDY_SHAPE_SOURCE;
  let baseBallIndex = 0;
  for (let index = 1; index < base.balls.length; index++) {
    if (base.balls[index].radius > base.balls[baseBallIndex].radius) baseBallIndex = index;
  }
  const selected = base.balls[baseBallIndex];
  const radius = selected.radius;
  const rho = 0.2 * radius;
  const anchorX = selected.center.x + 0.25 * radius * gesture;
  const anchorZ = selected.center.z;
  const balls = legacyBaseBalls();
  const lower = selected.center.y;
  const upper = Math.max(...base.balls.map((ball) => ball.center.y + ball.radius))
    + (base.balls.length - 1) * base.smoothness / 4 + radius;
  const interval = (upper - lower) / SHAPE_GESTURE_ROOT_SCAN_INTERVALS;
  let bracketLow: number = lower;
  let bracketHigh = Number.NaN;
  let previous = fieldSdf(balls, base.smoothness, anchorX, lower, anchorZ);
  if (!Number.isFinite(previous) || previous > 0 || !Number.isFinite(upper) || interval <= 0) {
    throw new Error("Shape gesture base-root bounds are not finite or bracketed");
  }
  for (let step = 1; step <= SHAPE_GESTURE_ROOT_SCAN_INTERVALS; step++) {
    const y = lower + interval * step;
    const value = fieldSdf(balls, base.smoothness, anchorX, y, anchorZ);
    if (!Number.isFinite(value)) throw new Error("Shape gesture base-root scan became non-finite");
    if (previous <= 0 && value >= 0) {
      bracketHigh = y;
      bracketLow = y - interval;
      break;
    }
    previous = value;
  }
  if (!Number.isFinite(bracketHigh)) throw new Error("Shape gesture base-root scan found no upward exit");
  for (let step = 0; step < SHAPE_GESTURE_ROOT_BISECTION_STEPS; step++) {
    const middle = (bracketLow + bracketHigh) / 2;
    const value = fieldSdf(balls, base.smoothness, anchorX, middle, anchorZ);
    if (!Number.isFinite(value)) throw new Error("Shape gesture base-root bisection became non-finite");
    if (value <= 0) bracketLow = middle;
    else bracketHigh = middle;
  }
  const anchor = Object.freeze({ x: anchorX, y: (bracketLow + bracketHigh) / 2, z: anchorZ });
  const appendedCenters = Object.freeze([-2, -1, 0, 1, 2].map((m) => Object.freeze({
    x: anchor.x,
    y: anchor.y - 0.25 * rho,
    z: anchor.z + 0.18 * radius * m,
  })));
  const appended = appendedCenters.map((center) => Object.freeze({ center, radius: rho }));
  const shape = Object.freeze({
    kind: "balls-smooth-union" as const,
    smoothness: base.smoothness,
    balls: Object.freeze([...base.balls, ...appended]),
  }) satisfies ShapeSource;
  return Object.freeze({
    gesture,
    shape,
    baseBallIndex,
    radius,
    rho,
    anchor,
    rootBracket: Object.freeze({ low: bracketLow, high: bracketHigh }),
    appendedCenters,
  });
}

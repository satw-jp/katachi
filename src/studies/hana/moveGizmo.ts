import type { HanaViewDirection } from "./gesture.ts";

/** World-fixed Move Gizmo axes (v0 has no object / view / CPlane alignment). */
export type HanaWorldAxis = "x" | "y" | "z";

export const HANA_WORLD_AXES: readonly HanaWorldAxis[] = ["x", "y", "z"];

export interface HanaVector3Like {
  x: number;
  y: number;
  z: number;
}

export interface HanaScreenPoint {
  x: number;
  y: number;
}

export function hanaWorldAxisVector(axis: HanaWorldAxis): HanaVector3Like {
  if (axis === "x") return { x: 1, y: 0, z: 0 };
  if (axis === "y") return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

/**
 * Arrows shown per viewport. An axis parallel to the view direction has no
 * arrow (Top shows X/Y, Front shows X/Z, Right shows Y/Z). Axome may show all
 * three for presentation with interaction disabled by the caller.
 */
export function hanaViewportGizmoAxes(direction: HanaViewDirection): HanaWorldAxis[] {
  if (direction === "front") return ["x", "z"];
  if (direction === "right") return ["y", "z"];
  if (direction === "axome") return ["x", "y", "z"];
  return ["x", "y"];
}

/** World component frozen by a direct planar drag in each viewport. */
export function resolveHanaViewportEditPlane(direction: HanaViewDirection): HanaWorldAxis {
  if (direction === "front") return "y";
  if (direction === "right") return "x";
  return "z";
}

/**
 * Constrain a drag target to one world axis. Untouched components are assigned
 * back exactly (no epsilon drift), independent of viewport.
 */
export function applyHanaAxisConstraint(
  original: HanaVector3Like,
  target: HanaVector3Like,
  axis: HanaWorldAxis,
): HanaVector3Like {
  if (axis === "x") return { x: target.x, y: original.y, z: original.z };
  if (axis === "y") return { x: original.x, y: target.y, z: original.z };
  return { x: original.x, y: original.y, z: target.z };
}

/**
 * Map pointer movement onto a world axis using its screen projection.
 * Returns the signed world delta along the axis, or 0 when the axis projects
 * to a degenerate (view-parallel) segment.
 */
export function hanaGizmoAxisScreenDelta(input: {
  startPointer: HanaScreenPoint;
  currentPointer: HanaScreenPoint;
  axisOriginScreen: HanaScreenPoint;
  axisUnitTipScreen: HanaScreenPoint;
}): number {
  const screenX = input.axisUnitTipScreen.x - input.axisOriginScreen.x;
  const screenY = input.axisUnitTipScreen.y - input.axisOriginScreen.y;
  const screenLength = Math.hypot(screenX, screenY);
  if (!(screenLength > 1e-6)) return 0;
  const pointerX = input.currentPointer.x - input.startPointer.x;
  const pointerY = input.currentPointer.y - input.startPointer.y;
  const alongPixels = (pointerX * screenX + pointerY * screenY) / screenLength;
  return alongPixels / screenLength;
}

/**
 * Screen-space arrow tip at a constant pixel length, so the Gizmo never grows
 * or shrinks with zoom. World geometry is untouched; this is editor overlay.
 */
export function hanaGizmoArrowTip(
  originScreen: HanaScreenPoint,
  unitTipScreen: HanaScreenPoint,
  pixelLength: number,
): HanaScreenPoint {
  const screenX = unitTipScreen.x - originScreen.x;
  const screenY = unitTipScreen.y - originScreen.y;
  const screenLength = Math.hypot(screenX, screenY);
  if (!(screenLength > 1e-6) || !(pixelLength > 0)) return { ...originScreen };
  return {
    x: originScreen.x + (screenX / screenLength) * pixelLength,
    y: originScreen.y + (screenY / screenLength) * pixelLength,
  };
}

function distanceToSegment(
  point: HanaScreenPoint,
  start: HanaScreenPoint,
  end: HanaScreenPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!(lengthSquared > 1e-12)) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Hit-test Gizmo axes in screen space. Returns the nearest axis within the
 * interaction threshold (deliberately wider than the compact visual), or null.
 * Taps within the origin dead zone belong to the Control Point itself, and
 * misses resolve to null so Control Point picking stays reachable.
 */
export function hitTestHanaGizmoAxis(
  pointer: HanaScreenPoint,
  originScreen: HanaScreenPoint,
  tipScreens: Partial<Record<HanaWorldAxis, HanaScreenPoint>>,
  thresholdPixels: number,
  originDeadZonePixels = 10,
): HanaWorldAxis | null {
  if (Math.hypot(pointer.x - originScreen.x, pointer.y - originScreen.y) < originDeadZonePixels) return null;
  let best: HanaWorldAxis | null = null;
  let bestDistance = thresholdPixels;
  for (const axis of HANA_WORLD_AXES) {
    const tip = tipScreens[axis];
    if (!tip) continue;
    const distance = distanceToSegment(pointer, originScreen, tip);
    if (distance <= bestDistance && (best === null || distance < bestDistance)) {
      best = axis;
      bestDistance = distance;
    }
  }
  return best;
}

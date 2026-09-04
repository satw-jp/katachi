export const HANA_VIEW_PRESETS = ["front", "side", "top", "iso"] as const;
export type HanaViewPreset = typeof HANA_VIEW_PRESETS[number];

export interface HanaTouchPoint {
  id: number;
  x: number;
  y: number;
}

export interface HanaTouchGestureDelta {
  centerX: number;
  centerY: number;
  deltaX: number;
  deltaY: number;
  previousDistance: number;
  distance: number;
  zoomDelta: number;
}

function center(points: readonly HanaTouchPoint[]): { x: number; y: number } {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function distance(points: readonly HanaTouchPoint[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
}

/** Pure two-finger delta used by the HANA touch camera path. */
export function touchGestureDelta(
  previous: readonly HanaTouchPoint[],
  current: readonly HanaTouchPoint[],
): HanaTouchGestureDelta | null {
  if (previous.length < 2 || current.length < 2) return null;
  const previousCenter = center(previous);
  const currentCenter = center(current);
  const previousDistance = distance(previous);
  const currentDistance = distance(current);
  return {
    centerX: currentCenter.x,
    centerY: currentCenter.y,
    deltaX: currentCenter.x - previousCenter.x,
    deltaY: currentCenter.y - previousCenter.y,
    previousDistance,
    distance: currentDistance,
    zoomDelta: previousDistance - currentDistance,
  };
}

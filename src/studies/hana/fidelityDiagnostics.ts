import type { HanaVector3 } from "./stroke3d.ts";

export interface HanaFidelityError {
  pointIndex: number;
  distance: number;
}

export interface HanaFidelitySummary {
  pointCount: number;
  median: number;
  p95: number;
  max: number;
  radius: number;
  aboveRadiusCount: number;
  aboveRadiusRatio: number;
  worst: HanaFidelityError[];
}

function distancePointToSegment(point: HanaVector3, from: HanaVector3, to: HanaVector3): number {
  const direction = {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  };
  const offset = {
    x: point.x - from.x,
    y: point.y - from.y,
    z: point.z - from.z,
  };
  const lengthSquared = direction.x ** 2 + direction.y ** 2 + direction.z ** 2;
  const amount = lengthSquared > Number.EPSILON
    ? Math.max(0, Math.min(1, (
      offset.x * direction.x
      + offset.y * direction.y
      + offset.z * direction.z
    ) / lengthSquared))
    : 0;
  return Math.hypot(
    point.x - (from.x + direction.x * amount),
    point.y - (from.y + direction.y * amount),
    point.z - (from.z + direction.z * amount),
  );
}

export function pointToPolylineDistance(
  point: HanaVector3,
  polyline: readonly HanaVector3[],
): number {
  if (polyline.length === 0) return Number.POSITIVE_INFINITY;
  if (polyline.length === 1) return Math.hypot(
    point.x - polyline[0].x,
    point.y - polyline[0].y,
    point.z - polyline[0].z,
  );
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polyline.length; index += 1) {
    closest = Math.min(
      closest,
      distancePointToSegment(point, polyline[index - 1], polyline[index]),
    );
  }
  return closest;
}

export function pointToPolylineErrors(
  points: readonly HanaVector3[],
  polyline: readonly HanaVector3[],
): HanaFidelityError[] {
  return points.map((point, pointIndex) => ({
    pointIndex,
    distance: pointToPolylineDistance(point, polyline),
  }));
}

export function summarizePointToPolylineDistance(
  points: readonly HanaVector3[],
  polyline: readonly HanaVector3[],
  radius: number,
  worstCount = 5,
): HanaFidelitySummary {
  const errors = pointToPolylineErrors(points, polyline);
  const sorted = errors.map((error) => error.distance).sort((a, b) => a - b);
  const percentile = (amount: number): number => {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * amount))];
  };
  const normalizedRadius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const aboveRadiusCount = normalizedRadius > 0
    ? errors.filter((error) => error.distance > normalizedRadius).length
    : 0;
  return {
    pointCount: points.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    max: percentile(1),
    radius: normalizedRadius,
    aboveRadiusCount,
    aboveRadiusRatio: points.length > 0 ? aboveRadiusCount / points.length : 0,
    worst: [...errors]
      .sort((a, b) => b.distance - a.distance)
      .slice(0, Math.max(0, Math.trunc(worstCount))),
  };
}

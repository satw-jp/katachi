import type { FabricationParameters, MaterialSpanAnchor, MaterialSpanPath, Mm, Point3Mm } from "./fabricationSpanTypes.ts";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distanceMm(a: Point3Mm, b: Point3Mm): Mm {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function addPoint(points: Point3Mm[], point: Point3Mm): void {
  const previous = points[points.length - 1];
  if (previous && previous.x === point.x && previous.y === point.y && previous.z === point.z) return;
  points.push(point);
}

/**
 * A deliberately legible path: leave A vertically, cross once, arrive
 * vertically, and finish exactly at B. The material is allowed to decide the
 * final sag; this function never adds noise or a pre-shaped sag curve.
 */
export function buildMaterialSpanPath(
  startAnchor: MaterialSpanAnchor,
  endAnchor: MaterialSpanAnchor,
  parameters: Pick<FabricationParameters, "spanLiftMm" | "sampleCount">,
): MaterialSpanPath {
  const sampleCount = Math.max(1, Math.floor(parameters.sampleCount));
  const lift = parameters.spanLiftMm;
  const start = startAnchor.positionMm;
  const end = endAnchor.positionMm;
  const departure: Point3Mm = { x: start.x, y: start.y, z: start.z + lift };
  const arrival: Point3Mm = { x: end.x, y: end.y, z: end.z + lift };
  const points: Point3Mm[] = [];

  addPoint(points, start);
  addPoint(points, departure);
  for (let index = 1; index < sampleCount; index += 1) {
    const t = index / sampleCount;
    addPoint(points, {
      x: lerp(departure.x, arrival.x, t),
      y: lerp(departure.y, arrival.y, t),
      z: lerp(departure.z, arrival.z, t),
    });
  }
  addPoint(points, arrival);
  addPoint(points, end);

  return { startAnchor, endAnchor, points };
}

export function materialSpanPathLengthMm(path: MaterialSpanPath): Mm {
  let length = 0;
  for (let index = 1; index < path.points.length; index += 1) {
    length += distanceMm(path.points[index - 1], path.points[index]);
  }
  return length;
}

export function anchorDistanceMm(startAnchor: MaterialSpanAnchor, endAnchor: MaterialSpanAnchor): Mm {
  return distanceMm(startAnchor.positionMm, endAnchor.positionMm);
}

export function pointDistanceMm(a: Point3Mm, b: Point3Mm): Mm {
  return distanceMm(a, b);
}

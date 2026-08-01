import { transformPoint } from "./opticalGeometry.ts";
import type { Medium, Vec3 } from "./opticalScene.ts";

interface Interval { near: number; far: number; }

/**
 * Length of a finite host segment occupied by the union of inclusion balls.
 * Overlapping constituent balls are merged, so a soft cluster never counts
 * the same light-path section twice. Packed inclusions currently use the same
 * ball-union absorption mask in BODY and receiver transport.
 */
export function segmentLengthInsideInclusions(
  start: Vec3,
  end: Vec3,
  inclusions: readonly Medium[],
): number {
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (!Number.isFinite(length) || length <= 1e-9) return 0;
  const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
  const intervals: Interval[] = [];
  for (const medium of inclusions) {
    for (const ball of medium.shape.balls) {
      const center = transformPoint(ball.center, medium.pose);
      const radius = ball.radius * medium.pose.uniformScale;
      const ox = start.x - center.x;
      const oy = start.y - center.y;
      const oz = start.z - center.z;
      const projection = ox * direction.x + oy * direction.y + oz * direction.z;
      const determinant = projection * projection
        - (ox * ox + oy * oy + oz * oz - radius * radius);
      if (!Number.isFinite(determinant) || determinant < 0) continue;
      const root = Math.sqrt(Math.max(0, determinant));
      const near = Math.max(0, -projection - root);
      const far = Math.min(length, -projection + root);
      if (far > near) intervals.push({ near, far });
    }
  }
  intervals.sort((a, b) => a.near - b.near || a.far - b.far);
  let total = 0;
  let active: Interval | null = null;
  for (const interval of intervals) {
    if (!active) active = { ...interval };
    else if (interval.near <= active.far) active.far = Math.max(active.far, interval.far);
    else {
      total += active.far - active.near;
      active = { ...interval };
    }
  }
  if (active) total += active.far - active.near;
  return Math.max(0, Math.min(length, total));
}

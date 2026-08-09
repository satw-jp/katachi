import type { FlowerComponent, Vec3 } from "./packing.ts";

export interface UnifiedSamplingCube {
  center: Vec3;
  halfExtent: number;
  usableRatio: number;
}

export function unifiedSamplingCube(
  components: readonly FlowerComponent[],
  blend: number,
  resolution: number,
): UnifiedSamplingCube {
  if (components.length === 0) {
    return { center: { x: 0, y: 0, z: 0 }, halfExtent: 1, usableRatio: 0.7 };
  }

  const expansion = blend * 0.35;
  const minimum = { x: Infinity, y: Infinity, z: Infinity };
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const component of components) {
    const extent = component.radius + expansion;
    minimum.x = Math.min(minimum.x, component.position.x - extent);
    minimum.y = Math.min(minimum.y, component.position.y - extent);
    minimum.z = Math.min(minimum.z, component.position.z - extent);
    maximum.x = Math.max(maximum.x, component.position.x + extent);
    maximum.y = Math.max(maximum.y, component.position.y + extent);
    maximum.z = Math.max(maximum.z, component.position.z + extent);
  }

  const center = {
    x: (minimum.x + maximum.x) * 0.5,
    y: (minimum.y + maximum.y) * 0.5,
    z: (minimum.z + maximum.z) * 0.5,
  };
  const requiredHalfExtent = Math.max(
    maximum.x - center.x,
    maximum.y - center.y,
    maximum.z - center.z,
  );
  // MarchingCubes deliberately skips its outer grid layers because normals
  // are undefined there. Keep the complete zero surface inside the sampled
  // interior instead of allowing Soft petals to be clipped into flat caps.
  const usableRatio = Math.max(0.55, (resolution - 6) / resolution);
  return {
    center,
    halfExtent: Math.max(requiredHalfExtent / usableRatio, 1e-4),
    usableRatio,
  };
}

export function smoothUnionDistance(a: number, b: number, k: number): number {
  if (!Number.isFinite(a)) return b;
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function flowerFieldSdf(
  components: readonly FlowerComponent[],
  point: Vec3,
  blend: number,
  neckFactor = 0.36,
): number {
  let distance = Number.POSITIVE_INFINITY;
  for (const component of components) {
    const dx = point.x - component.position.x;
    const dy = point.y - component.position.y;
    const dz = point.z - component.position.z;
    const sphereDistance = Math.hypot(dx, dy, dz) - component.radius;
    distance = smoothUnionDistance(distance, sphereDistance, blend);
  }

  const core = components[0];
  if (core) {
    for (const petal of components.slice(1)) {
      const neckRadius = Math.min(core.radius, petal.radius) * neckFactor;
      const neckDistance = pointSegmentDistance(point, core.position, petal.position) - neckRadius;
      distance = smoothUnionDistance(distance, neckDistance, blend * 0.55);
    }
  }
  return distance;
}

function pointSegmentDistance(point: Vec3, start: Vec3, end: Vec3): number {
  const ab = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const ap = { x: point.x - start.x, y: point.y - start.y, z: point.z - start.z };
  const denominator = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t = denominator > 0
    ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / denominator))
    : 0;
  return Math.hypot(
    point.x - (start.x + ab.x * t),
    point.y - (start.y + ab.y * t),
    point.z - (start.z + ab.z * t),
  );
}

import type { Ball } from "../cloud-sculpt/field.ts";

export const BASE_FOOTPRINT_SCHEMA = "katachi.skin.base-footprint.v1" as const;
export const BASE_FOOTPRINT_SOURCE = "support-free-host-field-outer-hull-v1" as const;

export interface BaseFootprintPointMm {
  xMm: number;
  yMm: number;
}

export interface BaseFootprint2d {
  schema: typeof BASE_FOOTPRINT_SCHEMA;
  source: typeof BASE_FOOTPRINT_SOURCE;
  valid: boolean;
  reason: string | null;
  vertices: BaseFootprintPointMm[];
  sourceBallCount: number;
  boundaryEpsilonMm: number;
  boundsMm: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
}

export type BaseFootprintClassification = "inside" | "outside" | "unresolved";

const CIRCLE_SAMPLE_COUNT = 64;

function cross(
  origin: BaseFootprintPointMm,
  a: BaseFootprintPointMm,
  b: BaseFootprintPointMm,
): number {
  return (a.xMm - origin.xMm) * (b.yMm - origin.yMm)
    - (a.yMm - origin.yMm) * (b.xMm - origin.xMm);
}

function convexHull(points: readonly BaseFootprintPointMm[]): BaseFootprintPointMm[] {
  const sorted = Array.from(points)
    .sort((a, b) => a.xMm - b.xMm || a.yMm - b.yMm);
  const unique = sorted.filter((point, index) => (
    index === 0
    || point.xMm !== sorted[index - 1].xMm
    || point.yMm !== sorted[index - 1].yMm
  ));
  if (unique.length < 3) return [];
  const lower: BaseFootprintPointMm[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: BaseFootprintPointMm[] = [];
  for (let index = unique.length - 1; index >= 0; index--) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function invalidFootprint(sourceBallCount: number, reason: string): BaseFootprint2d {
  return {
    schema: BASE_FOOTPRINT_SCHEMA,
    source: BASE_FOOTPRINT_SOURCE,
    valid: false,
    reason,
    vertices: [],
    sourceBallCount,
    boundaryEpsilonMm: 0.001,
    boundsMm: null,
  };
}

/**
 * Build one outer XY footprint from the support-free host field.
 *
 * Only authored host balls, host blend k, and the source-to-mm scale are
 * accepted. Dry Web, scaffold, patch holes, diagnosed Surface triangles and
 * any intermediate/fused BODY are intentionally absent from this contract.
 * The convex outer hull fills internal holes and local concavities by design:
 * the author's routing rule asks only whether a support site lies within the
 * base form's outer footprint.
 */
export function buildBaseFootprint(
  host: readonly Ball[],
  hostK: number,
  scaleMmPerUnit: number,
): BaseFootprint2d {
  if (!(scaleMmPerUnit > 0) || !Number.isFinite(scaleMmPerUnit)) {
    return invalidFootprint(host.length, "invalid-source-to-mm-scale");
  }
  if (!Number.isFinite(hostK) || hostK < 0) {
    return invalidFootprint(host.length, "invalid-host-blend");
  }
  if (host.length === 0) return invalidFootprint(0, "empty-host");
  const samples: BaseFootprintPointMm[] = [];
  // Two equally influential smooth-min fields can extend k/4 beyond their
  // hard union. Including that margin keeps the footprint conservative at
  // blended outer seams without consulting a generated BODY mesh.
  const blendMargin = hostK * 0.25;
  for (const ball of host) {
    if (![ball.x, ball.y, ball.z, ball.r].every(Number.isFinite) || !(ball.r > 0)) {
      return invalidFootprint(host.length, "malformed-or-nonfinite-host-ball");
    }
    const radiusMm = (ball.r + blendMargin) * scaleMmPerUnit;
    const xMm = ball.x * scaleMmPerUnit;
    const yMm = ball.y * scaleMmPerUnit;
    for (let sample = 0; sample < CIRCLE_SAMPLE_COUNT; sample++) {
      const angle = sample / CIRCLE_SAMPLE_COUNT * Math.PI * 2;
      samples.push({
        xMm: xMm + Math.cos(angle) * radiusMm,
        yMm: yMm + Math.sin(angle) * radiusMm,
      });
    }
  }
  const vertices = convexHull(samples);
  if (vertices.length < 3) return invalidFootprint(host.length, "outer-footprint-hull-unavailable");
  const xs = vertices.map((point) => point.xMm);
  const ys = vertices.map((point) => point.yMm);
  const boundsMm = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
  const longest = Math.max(boundsMm.maxX - boundsMm.minX, boundsMm.maxY - boundsMm.minY);
  return {
    schema: BASE_FOOTPRINT_SCHEMA,
    source: BASE_FOOTPRINT_SOURCE,
    valid: true,
    reason: null,
    vertices,
    sourceBallCount: host.length,
    boundaryEpsilonMm: Math.max(0.001, longest * 1e-6),
    boundsMm,
  };
}

/** Boundary is deliberately inside. Invalid coordinates or footprint fail closed. */
export function classifyPointByBaseFootprint(
  footprint: BaseFootprint2d,
  xMm: number,
  yMm: number,
): BaseFootprintClassification {
  if (!footprint.valid || footprint.vertices.length < 3 || !footprint.boundsMm) return "unresolved";
  if (![xMm, yMm].every(Number.isFinite)) return "unresolved";
  const epsilon = footprint.boundaryEpsilonMm;
  const bounds = footprint.boundsMm;
  if (
    xMm < bounds.minX - epsilon
    || xMm > bounds.maxX + epsilon
    || yMm < bounds.minY - epsilon
    || yMm > bounds.maxY + epsilon
  ) return "outside";
  for (let index = 0; index < footprint.vertices.length; index++) {
    const from = footprint.vertices[index];
    const to = footprint.vertices[(index + 1) % footprint.vertices.length];
    const edgeX = to.xMm - from.xMm;
    const edgeY = to.yMm - from.yMm;
    const edgeLength = Math.hypot(edgeX, edgeY);
    const side = edgeX * (yMm - from.yMm) - edgeY * (xMm - from.xMm);
    if (side < -epsilon * Math.max(edgeLength, 1)) return "outside";
  }
  return "inside";
}

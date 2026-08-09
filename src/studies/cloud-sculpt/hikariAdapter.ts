import {
  createRuntimeShape,
  type Bounds3,
  type CurvedRibbonSurfaceTrace,
  type JsonValue,
  type RuntimeShape,
  type ShapeAsset,
} from "../../lib/hikari/index.ts";
import type { Ball } from "./field.ts";

export interface CloudShapeAssetOptions {
  id?: string;
  studyVersion?: string;
  nativeMmPerShapeUnit?: number | null;
  recipe?: JsonValue;
  /** Existing Hikari control, now interpreted as saved boundary geometry. */
  surfaceTraceStrength?: number;
}

export interface CloudHikariShape {
  asset: ShapeAsset;
  runtime: RuntimeShape;
  /** The current WebGPU shader can consume this representation without conversion. */
  gpuMetaballs: {
    balls: Ball[];
    smoothK: number;
  };
}

/**
 * Adapt the current Cloud Sculpt field without changing its geometry.
 * Empty fields have no optical boundary, so they deliberately produce null.
 */
export function createCloudHikariShape(
  balls: readonly Ball[],
  smoothK: number,
  options: CloudShapeAssetOptions = {},
): CloudHikariShape | null {
  if (balls.length === 0) return null;
  const asset = createCloudShapeAsset(balls, smoothK, options);
  return {
    asset,
    runtime: createRuntimeShape(asset),
    gpuMetaballs: {
      balls: balls.map((ball) => ({ ...ball })),
      smoothK,
    },
  };
}

export function createCloudShapeAsset(
  balls: readonly Ball[],
  smoothK: number,
  options: CloudShapeAssetOptions = {},
): ShapeAsset {
  if (balls.length === 0) throw new Error("Cloud ShapeAsset requires at least one ball");
  if (!Number.isFinite(smoothK) || smoothK < 0) throw new Error("Cloud smoothK must be non-negative");
  const traceStrength = options.surfaceTraceStrength ?? 0;
  if (!Number.isFinite(traceStrength) || traceStrength < 0 || traceStrength > 1) {
    throw new Error("Cloud surface trace strength must be between 0 and 1");
  }
  const baseBounds = cloudShapeBounds(balls);
  const surfaceTrace = createSurfaceTrace(baseBounds, traceStrength);
  const fingerprint = cloudShapeFingerprint(balls, smoothK, traceStrength);

  return {
    formatVersion: 1,
    id: options.id ?? "cloud-sculpt-current",
    revision: fingerprint,
    source: {
      studyId: "cloud-sculpt",
      ...(options.studyVersion ? { studyVersion: options.studyVersion } : {}),
    },
    bounds: expandBoundsForTrace(baseBounds, surfaceTrace),
    nativeMmPerShapeUnit: options.nativeMmPerShapeUnit ?? null,
    representation: {
      kind: "metaballs-v1",
      balls: balls.map((ball) => ({
        id: String(ball.id),
        x: ball.x,
        y: ball.y,
        z: ball.z,
        radius: ball.r,
        regionId: "body",
      })),
      smoothK,
      distanceQuality: "distance-like",
      recommendedStepScale: 0.72,
      ...(surfaceTrace ? { surfaceTrace } : {}),
    },
    regions: [{ id: "body", label: "Cloud body", authoredRole: "host" }],
    recipe: options.recipe ?? { formatVersion: 1, studyId: "cloud-sculpt", entries: [] },
    sourceHash: fingerprint,
    approximations: [
      "Polynomial smooth union is distance-like rather than an exact Euclidean signed-distance field.",
      "Bounds use primitive extents; smooth union can extend the zero set slightly beyond them.",
      ...(surfaceTrace
        ? ["curved-ribbon-v1 is a deterministic band-limited surface trace, not a measured physical scan."]
        : []),
    ],
  };
}

export function cloudShapeBounds(balls: readonly Ball[]): Bounds3 {
  if (balls.length === 0) throw new Error("Cloud bounds require at least one ball");
  const bounds: Bounds3 = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (const ball of balls) {
    bounds.min.x = Math.min(bounds.min.x, ball.x - ball.r);
    bounds.min.y = Math.min(bounds.min.y, ball.y - ball.r);
    bounds.min.z = Math.min(bounds.min.z, ball.z - ball.r);
    bounds.max.x = Math.max(bounds.max.x, ball.x + ball.r);
    bounds.max.y = Math.max(bounds.max.y, ball.y + ball.r);
    bounds.max.z = Math.max(bounds.max.z, ball.z + ball.r);
  }
  return bounds;
}

/**
 * Exact-number, order-preserving change fingerprint for live invalidation.
 * This is intentionally labelled fnv1a32 and is not a cryptographic provenance hash.
 */
export function cloudShapeFingerprint(
  balls: readonly Ball[],
  smoothK: number,
  surfaceTraceStrength = 0,
): string {
  const canonical = JSON.stringify({
    smoothK,
    balls: balls.map(({ id, x, y, z, r }) => ({ id, x, y, z, r })),
    ...(surfaceTraceStrength > 0
      ? { surfaceTrace: { kind: "curved-ribbon-v1", strength: surfaceTraceStrength } }
      : {}),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function createSurfaceTrace(
  bounds: Bounds3,
  strength: number,
): CurvedRibbonSurfaceTrace | undefined {
  if (strength <= 0) return undefined;
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  return {
    kind: "curved-ribbon-v1",
    center,
    referenceRadius: Math.max(
      0.1,
      Math.hypot(
        bounds.max.x - center.x,
        bounds.max.y - center.y,
        bounds.max.z - center.z,
      ),
    ),
    strength,
  };
}

function expandBoundsForTrace(
  bounds: Bounds3,
  trace: CurvedRibbonSurfaceTrace | undefined,
): Bounds3 {
  if (!trace) return bounds;
  const padding = trace.strength * trace.referenceRadius * 0.22;
  return {
    min: {
      x: bounds.min.x - padding,
      y: bounds.min.y - padding,
      z: bounds.min.z - padding,
    },
    max: {
      x: bounds.max.x + padding,
      y: bounds.max.y + padding,
      z: bounds.max.z + padding,
    },
  };
}

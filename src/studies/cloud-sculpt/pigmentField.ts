/**
 * Object-local, deterministic pigment concentration fields.
 *
 * This module deliberately has no renderer dependency: CPU, GPU, and export
 * implementations can share the recorded recipe and the constants below.
 */
import type { PhysicalScale, Vec3 } from "./opticalScene.ts";
import { hashSeed } from "./random.ts";

export type PigmentFieldMode = "uniform" | "diffused" | "pooled" | "streaked" | "hand-trace";

export interface PigmentField {
  id: string;
  mode: PigmentFieldMode;
  seed: string;
  baseConcentration: number;
  contrast: number;
  featureScaleMm: number;
  /** Recorded fabrication direction, expressed in the shape's local space. */
  directionObject: Vec3;
  /** Object-local origin for this field; it never follows whole-body pose. */
  offsetObject: Vec3;
  frozenRevision: string;
  /** Frozen author gesture in object-local coordinates. */
  handTrace?: readonly Vec3[];
}

export interface PigmentReferenceVectors {
  direction: Vec3;
  tangent: Vec3;
  bitangent: Vec3;
  /** Seed-derived numeric values intended to be copied into GPU constants. */
  seedConstants: readonly [number, number, number, number];
}

export interface PigmentConcentrationSample {
  concentration: number;
  /** hand-trace without a frozen path deliberately falls back to the baseline. */
  issue?: "hand-trace-requires-frozen-points";
}

export const DEFAULT_PIGMENT_FIELD: PigmentField = {
  id: "pigment-field", mode: "uniform", seed: "pigment", baseConcentration: 1,
  contrast: 0.25, featureScaleMm: 12,
  directionObject: { x: 0, y: -1, z: 0 }, offsetObject: { x: 0, y: 0, z: 0 },
  frozenRevision: "pigment-field-v1",
};

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown, fallback: number): number {
  const result = finite(value, fallback);
  return result >= 0 ? result : fallback;
}

function vector(value: Partial<Vec3> | undefined, fallback: Vec3): Vec3 {
  return { x: finite(value?.x, fallback.x), y: finite(value?.y, fallback.y), z: finite(value?.z, fallback.z) };
}

function normalized(value: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!(length > 1e-9) || !Number.isFinite(length)) return { ...fallback };
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function validTrace(points: unknown): readonly Vec3[] | undefined {
  if (!Array.isArray(points)) return undefined;
  const result: Vec3[] = [];
  // The cap is part of the interchange contract: evaluation always terminates.
  for (let i = 0; i < points.length && i < 2048; i++) {
    const point = points[i] as Partial<Vec3> | undefined;
    const x = point?.x; const y = point?.y; const z = point?.z;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      result.push({ x: x as number, y: y as number, z: z as number });
    }
  }
  return result.length ? result : undefined;
}

/** Normalizes persisted/untrusted input into a finite, versioned field record. */
export function normalizePigmentField(value: Partial<PigmentField> | undefined): PigmentField {
  const raw = value ?? {};
  const mode: PigmentFieldMode = raw.mode === "diffused" || raw.mode === "pooled" || raw.mode === "streaked" || raw.mode === "hand-trace"
    ? raw.mode : "uniform";
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : DEFAULT_PIGMENT_FIELD.id,
    mode,
    seed: typeof raw.seed === "string" && raw.seed.trim() ? raw.seed : DEFAULT_PIGMENT_FIELD.seed,
    baseConcentration: nonNegative(raw.baseConcentration, DEFAULT_PIGMENT_FIELD.baseConcentration),
    contrast: nonNegative(raw.contrast, DEFAULT_PIGMENT_FIELD.contrast),
    featureScaleMm: Math.max(0.001, nonNegative(raw.featureScaleMm, DEFAULT_PIGMENT_FIELD.featureScaleMm)),
    directionObject: vector(raw.directionObject, DEFAULT_PIGMENT_FIELD.directionObject),
    offsetObject: vector(raw.offsetObject, DEFAULT_PIGMENT_FIELD.offsetObject),
    frozenRevision: typeof raw.frozenRevision === "string" && raw.frozenRevision.trim() ? raw.frozenRevision : DEFAULT_PIGMENT_FIELD.frozenRevision,
    handTrace: validTrace(raw.handTrace),
  };
}

/** Seed-derived basis and constants; mirrors should use these rather than hidden random state. */
export function pigmentReferenceVectors(field: PigmentField): PigmentReferenceVectors {
  const normalizedField = normalizePigmentField(field);
  const direction = normalized(normalizedField.directionObject, DEFAULT_PIGMENT_FIELD.directionObject);
  const helper = Math.abs(direction.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangent = normalized({
    x: helper.y * direction.z - helper.z * direction.y,
    y: helper.z * direction.x - helper.x * direction.z,
    z: helper.x * direction.y - helper.y * direction.x,
  }, { x: 1, y: 0, z: 0 });
  const bitangent = {
    x: direction.y * tangent.z - direction.z * tangent.y,
    y: direction.z * tangent.x - direction.x * tangent.z,
    z: direction.x * tangent.y - direction.y * tangent.x,
  };
  const seed = hashSeed(normalizedField.seed);
  return {
    direction, tangent, bitangent,
    seedConstants: [((seed >>> 0) + 0.5) / 4294967296, ((seed >>> 8) + 0.5) / 16777216, ((seed >>> 16) + 0.5) / 65536, ((seed >>> 24) + 0.5) / 256],
  };
}

function clampCoordinate(value: number): number { return Math.max(-1048576, Math.min(1048576, value)); }
function fade(value: number): number { return value * value * (3 - 2 * value); }
function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }

function lattice(seed: number, x: number, y: number, z: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x6c8e9cf5) ^ Math.imul(z | 0, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(seed: number, x: number, y: number, z: number): number {
  const px = clampCoordinate(x); const py = clampCoordinate(y); const pz = clampCoordinate(z);
  const ix = Math.floor(px); const iy = Math.floor(py); const iz = Math.floor(pz);
  const fx = fade(px - ix); const fy = fade(py - iy); const fz = fade(pz - iz);
  const a = mix(lattice(seed, ix, iy, iz), lattice(seed, ix + 1, iy, iz), fx);
  const b = mix(lattice(seed, ix, iy + 1, iz), lattice(seed, ix + 1, iy + 1, iz), fx);
  const c = mix(lattice(seed, ix, iy, iz + 1), lattice(seed, ix + 1, iy, iz + 1), fx);
  const d = mix(lattice(seed, ix, iy + 1, iz + 1), lattice(seed, ix + 1, iy + 1, iz + 1), fx);
  return mix(mix(a, b, fy), mix(c, d, fy), fz) * 2 - 1;
}

function fbm(seed: number, x: number, y: number, z: number): number {
  let sum = 0; let amplitude = 0.58; let frequency = 1; let weight = 0;
  for (let octave = 0; octave < 4; octave++) {
    sum += valueNoise((seed + Math.imul(octave, 0x9e3779b9)) >>> 0, x * frequency, y * frequency, z * frequency) * amplitude;
    weight += amplitude; amplitude *= 0.5; frequency *= 2;
  }
  return sum / weight;
}

function localMm(field: PigmentField, point: Vec3, mmPerShapeUnit: number): Vec3 {
  return {
    x: (finite(point.x, 0) - field.offsetObject.x) * mmPerShapeUnit,
    y: (finite(point.y, 0) - field.offsetObject.y) * mmPerShapeUnit,
    z: (finite(point.z, 0) - field.offsetObject.z) * mmPerShapeUnit,
  };
}

function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

/** Detailed sampling reports the intentional baseline fallback for an empty hand trace. */
export function samplePigmentConcentrationDetailed(fieldInput: PigmentField, pointObject: Vec3, physicalScale: PhysicalScale): PigmentConcentrationSample {
  const field = normalizePigmentField(fieldInput);
  if (field.mode === "uniform") return { concentration: field.baseConcentration };
  const mmPerUnit = Number.isFinite(physicalScale?.mmPerShapeUnit) && physicalScale.mmPerShapeUnit > 0 ? physicalScale.mmPerShapeUnit : 1;
  const vectors = pigmentReferenceVectors(field);
  const point = localMm(field, pointObject, mmPerUnit);
  const scale = field.featureScaleMm;
  const tx = dot(point, vectors.tangent) / scale;
  const ty = dot(point, vectors.bitangent) / scale;
  const tz = dot(point, vectors.direction) / scale;
  const seed = hashSeed(field.seed);
  let variation = 0;
  if (field.mode === "diffused") variation = fbm(seed, tx, ty, tz);
  else if (field.mode === "pooled") {
    const gradient = Math.tanh(tz * 0.7);
    const pockets = fbm(seed ^ 0x68bc21eb, tx * 0.55, ty * 0.55, tz * 0.55);
    variation = Math.max(-1, Math.min(1, gradient * 0.55 + pockets * 0.7));
  } else if (field.mode === "streaked") {
    // Slow change along the recorded pour direction makes the field thread-like.
    variation = fbm(seed ^ 0x2c1b3c6d, tx * 1.8, ty * 1.8, tz * 0.18);
  } else {
    const trace = field.handTrace;
    if (!trace) return { concentration: field.baseConcentration, issue: "hand-trace-requires-frozen-points" };
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (let i = 0; i < trace.length; i++) {
      const tracePoint = localMm(field, trace[i], mmPerUnit);
      const dx = point.x - tracePoint.x; const dy = point.y - tracePoint.y; const dz = point.z - tracePoint.z;
      nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy + dz * dz);
    }
    const falloff = Math.exp(-nearestSquared / (2 * scale * scale));
    variation = falloff * 2 - 1;
  }
  return { concentration: Math.max(0, field.baseConcentration * (1 + field.contrast * variation)) };
}

/** Scalar convenience form for optical integration. */
export function samplePigmentConcentration(field: PigmentField, pointObject: Vec3, physicalScale: PhysicalScale): number {
  return samplePigmentConcentrationDetailed(field, pointObject, physicalScale).concentration;
}

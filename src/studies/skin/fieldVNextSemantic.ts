/**
 * FIELD vNext semantic evaluator.
 *
 * This is a pure CPU mirror of the Legacy FIELD composite contract, driven by
 * the uncapped FieldGpuPayload rather than Patch[]. It intentionally keeps its
 * arithmetic local so the parity test compares two implementations instead of
 * calling the Legacy evaluator from both sides.
 *
 * The payload scan is row-major and sequential. No spatial grid, neighbour
 * expansion, or 256-point cap is used here.
 */

import type { Ball } from "../cloud-sculpt/field.ts";
import type { SkinMode } from "./field.ts";
import type { FieldGpuPayload } from "./fieldGpuPayload.ts";

export type FieldSample = { x: number; y: number; z: number };

export type FieldVNextSemanticConfig = {
  mode: SkinMode;
  host: ReadonlyArray<Ball>;
  hostK: number;
  thickness: number;
  roundK: number;
  coinBulge: number;
  coinBulgeBalance: number;
  payload: FieldGpuPayload;
};

export type FieldVNextParityReport = {
  tolerance: number;
  sampleCount: number;
  mismatchCount: number;
  maxAbsoluteError: number;
  meanAbsoluteError: number;
};

export const FIELD_VNEXT_PARITY_TOLERANCE = 1e-5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function smoothSubtraction(d1: number, d2: number, k: number): number {
  if (k <= 0) return Math.max(-d1, d2);
  const h = clamp01(0.5 - (0.5 * (d2 + d1)) / k);
  return d2 * (1 - h) + -d1 * h + k * h * (1 - h);
}

function smoothIntersection(d1: number, d2: number, k: number): number {
  if (k <= 0) return Math.max(d1, d2);
  const h = clamp01(0.5 - (0.5 * (d2 - d1)) / k);
  return d2 * (1 - h) + d1 * h + k * h * (1 - h);
}

function ballDistance(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): number {
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - radius;
}

function hostDistance(host: ReadonlyArray<Ball>, hostK: number, sample: FieldSample): number {
  if (host.length === 0) return 1e3;
  const first = host[0];
  let distance = ballDistance(sample.x, sample.y, sample.z, first.x, first.y, first.z, first.r);
  for (let index = 1; index < host.length; index++) {
    const ball = host[index];
    const candidate = ballDistance(sample.x, sample.y, sample.z, ball.x, ball.y, ball.z, ball.r);
    distance = smoothMin(distance, candidate, hostK);
  }
  return distance;
}

function payloadShapeCode(payload: FieldGpuPayload, index: number): number {
  return payload.metadata[index * 4 + 1];
}

function matchesShape(code: number, shape: "coin" | "flatRing" | "ring3d" | "flower"): boolean {
  if (shape === "coin") return code === 0;
  if (shape === "flatRing") return code === 1;
  if (shape === "ring3d") return code === 2;
  return code === 3;
}

function isRaised(code: number): boolean {
  return code === 2 || code === 3;
}

function evaluatePatchUnion(
  payload: FieldGpuPayload,
  roundK: number,
  sample: FieldSample,
  include: (shapeCode: number) => boolean,
): number {
  let hasPoint = false;
  let distance = 1e5;
  for (let index = 0; index < payload.primitiveCount; index++) {
    if (!include(payloadShapeCode(payload, index))) continue;
    const geometryOffset = index * 4;
    const candidate = ballDistance(
      sample.x,
      sample.y,
      sample.z,
      payload.geometry[geometryOffset],
      payload.geometry[geometryOffset + 1],
      payload.geometry[geometryOffset + 2],
      payload.geometry[geometryOffset + 3],
    );
    distance = hasPoint ? smoothMin(distance, candidate, roundK) : candidate;
    hasPoint = true;
  }
  return hasPoint ? distance : 1e5;
}

function coinBulgeSides(coinBulge: number, balance: number): { front: number; back: number } {
  const amount = Math.max(0, coinBulge);
  const clamped = Math.max(-1, Math.min(1, balance));
  return clamped >= 0
    ? { front: amount, back: amount * (1 - clamped) }
    : { front: amount * (1 + clamped), back: amount };
}

function shellDistance(config: FieldVNextSemanticConfig, sample: FieldSample): number {
  return Math.abs(hostDistance(config.host, config.hostK, sample)) - config.thickness / 2;
}

function asymmetricHostBand(
  config: FieldVNextSemanticConfig,
  sample: FieldSample,
  frontHalfWidth: number,
  backHalfWidth: number,
): number {
  const distance = hostDistance(config.host, config.hostK, sample);
  return Math.max(distance - frontHalfWidth, -distance - backHalfWidth);
}

/** Evaluate the Legacy FIELD composite semantics from the vNext payload. */
export function evaluateFieldVNextSemantic(
  config: FieldVNextSemanticConfig,
  sample: FieldSample,
): number {
  const { payload, roundK } = config;
  const shell = shellDistance(config, sample);
  if (payload.primitiveCount === 0) return config.mode === "plate" ? 1e5 : shell;

  if (config.mode === "window") {
    const patch = evaluatePatchUnion(payload, roundK, sample, () => true);
    return smoothSubtraction(patch, shell, roundK);
  }

  const flat = (shapeCode: number) => !isRaised(shapeCode);
  const raised = (shapeCode: number) => isRaised(shapeCode);

  if (config.coinBulge <= 0) {
    const flatDistance = evaluatePatchUnion(payload, roundK, sample, flat);
    const hasFlat = payloadHasShape(payload, flat);
    const raisedDistance = evaluatePatchUnion(payload, roundK, sample, raised);
    const hasRaised = payloadHasShape(payload, raised);
    const plateFlat = hasFlat ? smoothIntersection(shell, flatDistance, roundK) : 1e5;
    if (!hasRaised) return plateFlat;
    return hasFlat ? smoothMin(plateFlat, raisedDistance, roundK) : raisedDistance;
  }

  const hasCoin = payloadHasShape(payload, (shapeCode) => matchesShape(shapeCode, "coin"));
  const hasFlatRing = payloadHasShape(payload, (shapeCode) => matchesShape(shapeCode, "flatRing"));
  const hasRaised = payloadHasShape(payload, raised);
  const sides = coinBulgeSides(config.coinBulge, config.coinBulgeBalance);

  let plateFlat = 1e5;
  let hasFlat = false;
  if (hasCoin) {
    const coinBand = asymmetricHostBand(
      config,
      sample,
      config.thickness / 2 + sides.front,
      config.thickness / 2 + sides.back,
    );
    const coinDistance = evaluatePatchUnion(
      payload,
      roundK,
      sample,
      (shapeCode) => matchesShape(shapeCode, "coin"),
    );
    plateFlat = smoothIntersection(coinBand, coinDistance, roundK);
    hasFlat = true;
  }
  if (hasFlatRing) {
    const flatRingDistance = evaluatePatchUnion(
      payload,
      roundK,
      sample,
      (shapeCode) => matchesShape(shapeCode, "flatRing"),
    );
    const plateFlatRing = smoothIntersection(shell, flatRingDistance, roundK);
    plateFlat = hasFlat ? smoothMin(plateFlat, plateFlatRing, roundK) : plateFlatRing;
    hasFlat = true;
  }
  if (!hasRaised) return hasFlat ? plateFlat : 1e5;
  const raisedDistance = evaluatePatchUnion(payload, roundK, sample, raised);
  return hasFlat ? smoothMin(plateFlat, raisedDistance, roundK) : raisedDistance;
}

function payloadHasShape(
  payload: FieldGpuPayload,
  include: (shapeCode: number) => boolean,
): boolean {
  for (let index = 0; index < payload.primitiveCount; index++) {
    if (include(payloadShapeCode(payload, index))) return true;
  }
  return false;
}

/** Compare two point evaluators and return explicit numerical evidence. */
export function compareFieldVNextSemantics(
  legacyEvaluator: (x: number, y: number, z: number) => number,
  vNextEvaluator: (sample: FieldSample) => number,
  samples: ReadonlyArray<FieldSample>,
  tolerance = FIELD_VNEXT_PARITY_TOLERANCE,
): FieldVNextParityReport {
  let sumAbsoluteError = 0;
  let maxAbsoluteError = 0;
  let mismatchCount = 0;
  for (const sample of samples) {
    const legacy = legacyEvaluator(sample.x, sample.y, sample.z);
    const vNext = vNextEvaluator(sample);
    const absoluteError = Number.isFinite(legacy) && Number.isFinite(vNext)
      ? Math.abs(legacy - vNext)
      : Number.POSITIVE_INFINITY;
    sumAbsoluteError += absoluteError;
    if (absoluteError > maxAbsoluteError) maxAbsoluteError = absoluteError;
    if (absoluteError > tolerance) mismatchCount++;
  }
  return {
    tolerance,
    sampleCount: samples.length,
    mismatchCount,
    maxAbsoluteError,
    meanAbsoluteError: samples.length === 0 ? 0 : sumAbsoluteError / samples.length,
  };
}

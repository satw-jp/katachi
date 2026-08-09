import {
  LD1_CONTRACT,
  makeLd1Config,
  runLd1Reference,
  runLd1ReferenceWithSamples,
  type FluxLedger,
  type Ld1Config,
  type Ld1ReferenceResult,
} from "./ld1Reference.ts";
import { blurFluxRgbEnergyNormalized, type FluxRgb, type ReceiverTransportField } from "../receiverTransport.ts";

/** Bounded pre-stage source-size visual readiness comparison; never a GO. */
export const LD2_SOURCE_ANGULAR_DIAMETERS = [0.53, 5, 20] as const;
export const LD2_ESTIMATORS = ["legacy-negative-evidence", "primary", "audit"] as const;
export type Ld2Estimator = typeof LD2_ESTIMATORS[number];
/**
 * Frozen before qualification: LD1's radius-2 128² footprint scaled to the
 * fixed 512² LD2 receiver resolution (512 / 128 × 2 = 8 texels).
 */
export const LD2_READINESS_RECONSTRUCTION_RADIUS_TEXELS = 8 as const;
/** Fixed physical footprint derived only from the frozen radius-8 kernel. */
export const LD2_READINESS_LOCAL_CONCENTRATION_WINDOW_TEXELS = 2 * LD2_READINESS_RECONSTRUCTION_RADIUS_TEXELS + 1;
export const LD2_READINESS_LOCAL_CONCENTRATION_TEXEL_PITCH = 2.8 / 512;
export const LD2_READINESS_LOCAL_CONCENTRATION_PHYSICAL_SIDE = .09296875; // 17 × (2.8 / 512)
export const LD2_TRACE_ROI = { minU: -0.95, maxU: 1.15, minV: -0.30, maxV: 0.55 } as const;
export const LD2_WARNINGS = [
  "SOURCE-SIZE READINESS / VISUAL CANDIDATE",
  "NOT OPT-LD-1 OR OPT-LD-2 GO / ACCEPTANCE",
  "FORMAL OPT-LD-2 HAS NOT STARTED",
  "CPU-ONLY · NOT SHARED ShapeSource / WebGPU / Blender · NOT PRODUCTION",
] as const;

/** All optical and receiver choices are fixed across the three source diameters. */
export const LD2_CANONICAL_CONFIG = {
  seed: LD1_CONTRACT.seed,
  bulgeAmplitude: .18,
  form: "connected-ridge",
  exitSurfaceMode: "opposing",
  ridgePosition: 0,
  ridgeBend: 0,
  ior: LD1_CONTRACT.ior,
  receiverY: LD1_CONTRACT.receiverY,
  receiverSize: 2.8,
  fieldWidth: 512,
  fieldHeight: 512,
  displayScale: LD1_CONTRACT.displayScale,
  exposure: LD1_CONTRACT.exposure,
  sourceAngularRadiusDegrees: LD1_CONTRACT.sourceAngularRadiusDegrees,
} as const satisfies Omit<Ld1Config, "sampleCount" | "sourceAngularDiameterDegrees">;

export interface Ld2SoftnessMetrics {
  /** Max single texel / total flux; retained as diagnostic negative evidence. */
  peakConcentration: number;
  /** Max complete 17×17 physical window / full-field flux; active readiness concentration. */
  localConcentration: number;
  effectiveArea: number;
  centroid: { u: number; v: number } | null;
  principalAxisRadians: number | null;
}

export interface Ld2CaseMetrics extends Ld2SoftnessMetrics {
  diameterDegrees: number;
  rawTransmission: FluxRgb;
  misses: number;
  escaped: FluxRgb;
  tir: FluxRgb;
  rejected: FluxRgb;
  supportLeakage: number;
  terminalClosureResidual: FluxRgb;
}

export interface Ld2Case {
  diameterDegrees: number;
  result: Ld1ReferenceResult;
  /** Fixed radius-8, flux-conserving LD2 readiness field; never display-only. */
  qualificationField: ReceiverTransportField;
  metrics: Ld2CaseMetrics;
}

export interface Ld2Run {
  sampleCount: number;
  estimator: Ld2Estimator;
  cases: Ld2Case[];
}

export interface Ld2GateFailure {
  code: string;
  message: string;
  actual: number;
  threshold: number;
}

/** Pure result for this bounded checkpoint; it neither reruns nor adjusts any field. */
export interface Ld2GateEvaluation {
  qualified: boolean;
  failures: Ld2GateFailure[];
}

type Ld2ConcentrationMetric = "local" | "max-texel";

/**
 * Evaluates the fixed readiness contract against already-computed primary and
 * audit runs. It deliberately reports failures instead of changing sampling,
 * thresholds, fields, support, display, or metrics.
 */
export function evaluateLd2ReadinessGates(primary16: Ld2Run, primary32: Ld2Run, audit16: Ld2Run, audit32: Ld2Run): Ld2GateEvaluation {
  return evaluateLd2ReadinessGatesForConcentration(primary16, primary32, audit16, audit32, "local");
}

/** Pure radius-8 diagnostic replay using the retained max-texel metric. */
export function evaluateLd2MaxTexelNegativeEvidenceGates(primary16: Ld2Run, primary32: Ld2Run, audit16: Ld2Run, audit32: Ld2Run): Ld2GateEvaluation {
  return evaluateLd2ReadinessGatesForConcentration(primary16, primary32, audit16, audit32, "max-texel");
}

function evaluateLd2ReadinessGatesForConcentration(primary16: Ld2Run, primary32: Ld2Run, audit16: Ld2Run, audit32: Ld2Run, concentrationMetric: Ld2ConcentrationMetric): Ld2GateEvaluation {
  const failures: Ld2GateFailure[] = [];
  const concentration = (metrics: Ld2CaseMetrics): number => concentrationMetric === "local" ? metrics.localConcentration : metrics.peakConcentration;
  const concentrationCode = concentrationMetric === "local" ? "local-concentration" : "max-texel-concentration";
  const concentrationLabel = concentrationMetric === "local" ? "local concentration" : "max-texel concentration";
  const runs: Array<["primary" | "audit", Ld2Run, Ld2Run]> = [["primary", primary16, primary32], ["audit", audit16, audit32]];
  for (const [name, low, high] of runs) {
    if (low.estimator !== name || high.estimator !== name) failures.push(gateFailure(`${name}:estimator-contract`, "run estimator does not match the fixed gate role", 1, 0));
    if (low.sampleCount !== 16384 || high.sampleCount !== 32768 || low.cases.length !== 3 || high.cases.length !== 3) failures.push(gateFailure(`${name}:run-contract`, "run shape is not the fixed 16,384/32,768 three-diameter contract", 1, 0));
    for (let index = 0; index < Math.min(low.cases.length, high.cases.length); index++) {
      const a = low.cases[index].metrics; const b = high.cases[index].metrics; const diameter = b.diameterDegrees;
      for (const channel of ["r", "g", "b"] as const) gateAtMost(failures, `${name}:${diameter}:raw-${channel}-convergence`, `${name} ${diameter}° raw ${channel} convergence`, relativeDifference(a.rawTransmission[channel], b.rawTransmission[channel]), .02);
      gateAtMost(failures, `${name}:${diameter}:${concentrationCode}-convergence`, `${name} ${diameter}° ${concentrationLabel} convergence`, relativeDifference(concentration(a), concentration(b)), .05);
      gateAtMost(failures, `${name}:${diameter}:effective-area-convergence`, `${name} ${diameter}° effective area convergence`, relativeDifference(a.effectiveArea, b.effectiveArea), .05);
      for (const channel of ["r", "g", "b"] as const) gateAtMost(failures, `${name}:${diameter}:closure-${channel}`, `${name} ${diameter}° terminal closure ${channel}`, Math.abs(b.terminalClosureResidual[channel]), 2e-8);
      gateAtMost(failures, `${name}:${diameter}:support-leakage`, `${name} ${diameter}° support leakage`, b.supportLeakage, 0);
      gateAtMost(failures, `${name}:${diameter}:tir-r`, `${name} ${diameter}° TIR R`, Math.abs(b.tir.r), 0);
      gateAtMost(failures, `${name}:${diameter}:tir-g`, `${name} ${diameter}° TIR G`, Math.abs(b.tir.g), 0);
      gateAtMost(failures, `${name}:${diameter}:tir-b`, `${name} ${diameter}° TIR B`, Math.abs(b.tir.b), 0);
      if (index > 0) {
        const previousLow = low.cases[index - 1].metrics; const previousHigh = high.cases[index - 1].metrics;
        gateStrictGreater(failures, `${name}:${previousHigh.diameterDegrees}-${diameter}:${concentrationCode}-monotonic`, `${name} ${previousHigh.diameterDegrees}°→${diameter}° ${concentrationLabel} decrease`, concentration(previousHigh) - concentration(b), 0);
        gateStrictGreater(failures, `${name}:${previousHigh.diameterDegrees}-${diameter}:effective-area-monotonic`, `${name} ${previousHigh.diameterDegrees}°→${diameter}° effective-area increase`, b.effectiveArea - previousHigh.effectiveArea, 0);
        gateStrictGreater(failures, `${name}:${previousHigh.diameterDegrees}-${diameter}:${concentrationCode}-margin`, `${name} ${previousHigh.diameterDegrees}°→${diameter}° ${concentrationLabel} margin`, concentration(previousHigh) - concentration(b), 2 * (Math.abs(concentration(previousLow) - concentration(previousHigh)) + Math.abs(concentration(a) - concentration(b))));
        gateStrictGreater(failures, `${name}:${previousHigh.diameterDegrees}-${diameter}:effective-area-margin`, `${name} ${previousHigh.diameterDegrees}°→${diameter}° effective-area margin`, b.effectiveArea - previousHigh.effectiveArea, 2 * (Math.abs(previousLow.effectiveArea - previousHigh.effectiveArea) + Math.abs(a.effectiveArea - b.effectiveArea)));
      }
    }
    const baseline = high.cases[0]?.metrics;
    if (baseline) for (const item of high.cases.slice(1)) {
      const current = item.metrics; const diameter = current.diameterDegrees;
      for (const channel of ["r", "g", "b"] as const) gateAtMost(failures, `${name}:${diameter}:raw-${channel}-baseline`, `${name} ${diameter}° raw ${channel} versus 0.53°`, relativeDifference(current.rawTransmission[channel], baseline.rawTransmission[channel]), .05);
      const centroidDelta = current.centroid && baseline.centroid ? Math.hypot(current.centroid.u - baseline.centroid.u, current.centroid.v - baseline.centroid.v) : Infinity;
      gateAtMost(failures, `${name}:${diameter}:centroid`, `${name} ${diameter}° ROI centroid shift`, centroidDelta, .02);
      gateAtMost(failures, `${name}:${diameter}:orientation`, `${name} ${diameter}° principal-axis difference`, orientationDifferenceRadians(current.principalAxisRadians, baseline.principalAxisRadians), 5 * Math.PI / 180);
    }
  }
  for (let index = 0; index < Math.min(primary32.cases.length, audit32.cases.length); index++) {
    const primary = primary32.cases[index].metrics; const audit = audit32.cases[index].metrics; const diameter = primary.diameterDegrees;
    gateAtMost(failures, `primary-audit:${diameter}:${concentrationCode}-discrepancy`, `primary/audit ${diameter}° ${concentrationLabel} discrepancy`, relativeDifference(concentration(primary), concentration(audit)), .05);
    gateAtMost(failures, `primary-audit:${diameter}:effective-area-discrepancy`, `primary/audit ${diameter}° effective-area discrepancy`, relativeDifference(primary.effectiveArea, audit.effectiveArea), .05);
    for (const channel of ["r", "g", "b"] as const) gateAtMost(failures, `primary-audit:${diameter}:raw-${channel}-discrepancy`, `primary/audit ${diameter}° raw ${channel} discrepancy`, relativeDifference(primary.rawTransmission[channel], audit.rawTransmission[channel]), .02);
  }
  return { qualified: failures.length === 0, failures };
}

/**
 * Runs the ON field only, with a shared deterministic sample prefix for every
 * diameter. Primary/audit are scrambled 4D Sobol integration buffers. Their
 * four dimensions form a base-2 digital net; dimensions 0/1 fill the aperture
 * square and dimensions 2/3 supply disk area q and angle t, then
 * radius=sqrt(q), angle=2πt. Each coordinate is independently nested-uniform
 * Owen-scrambled, with its root fixed by seed + the literal primary/audit
 * suffix + dimension. This is one precommitted estimator design; there are no
 * shifts, rerolls, or outcome-selecting variants.
 */
export function runLd2SourceSize(sampleCount = 16384, estimator: Ld2Estimator = "primary"): Ld2Run {
  if (sampleCount !== 16384 && sampleCount !== 32768) throw new RangeError("LD2 source-size comparison is fixed to 16,384 or 32,768 shared-prefix samples");
  if (!LD2_ESTIMATORS.includes(estimator)) throw new RangeError("unknown LD2 estimator");
  const samples = estimator === "legacy-negative-evidence" ? null : generateLd2IntegrationSamples(sampleCount, LD2_CANONICAL_CONFIG.seed, estimator);
  const cases = LD2_SOURCE_ANGULAR_DIAMETERS.map((diameterDegrees) => {
    const config = makeLd1Config({
      ...LD2_CANONICAL_CONFIG,
      sampleCount,
      sourceAngularDiameterDegrees: diameterDegrees,
    });
    const result = samples === null ? runLd1Reference(config) : runLd1ReferenceWithSamples(samples, config);
    const on = result.on;
    // LD1's radius-2 reconstruction remains immutable negative evidence. LD2
    // measures its own world-scale-matched radius-8 field directly from raw flux.
    const qualificationField = blurFluxRgbEnergyNormalized(on.rawField, LD2_READINESS_RECONSTRUCTION_RADIUS_TEXELS);
    return {
      diameterDegrees,
      result,
      qualificationField,
      metrics: measureLd2CaseMetrics(diameterDegrees, result, qualificationField),
    };
  });
  return { sampleCount, estimator, cases };
}

/**
 * Pure negative-evidence replay: rebuilds the old radius-2 metric view from
 * already-computed LD2 results. It neither traces rays nor changes samples,
 * thresholds, the evaluator, or the retained LD1 reconstruction.
 */
export function replayLd2Radius2Metrics(run: Ld2Run): Ld2Run {
  return {
    ...run,
    cases: run.cases.map((item) => ({
      ...item,
      metrics: measureLd2CaseMetrics(item.diameterDegrees, item.result, item.result.on.reconstructedField),
    })),
  };
}

/** Prefix-invariant 4D scrambled Sobol buffer for the opt-in LD2 estimator. */
export function generateLd2IntegrationSamples(sampleCount: number, seed: string, estimator: Exclude<Ld2Estimator, "legacy-negative-evidence"> = "primary"): Float32Array {
  if (!Number.isInteger(sampleCount) || sampleCount <= 0 || sampleCount > 32768) throw new RangeError("LD2 integration sampleCount must be a positive bounded integer");
  const suffix = estimator === "primary" ? ":ld2-primary" : estimator === "audit" ? ":ld2-audit" : null;
  if (suffix === null) throw new RangeError("low-discrepancy generator requires primary or audit");
  const roots = [0, 1, 2, 3].map((dimension) => hash32(hashString(`${seed}${suffix}:${dimension}`)));
  const output = new Float32Array(sampleCount * 4);
  for (let index = 0; index < sampleCount; index++) {
    const apertureX = 2 * uintToUnit(nestedOwenScramble(sobolUint(index, 0), roots[0])) - 1;
    const apertureZ = 2 * uintToUnit(nestedOwenScramble(sobolUint(index, 1), roots[1])) - 1;
    const q = uintToUnit(nestedOwenScramble(sobolUint(index, 2), roots[2]));
    const angle = Math.PI * 2 * uintToUnit(nestedOwenScramble(sobolUint(index, 3), roots[3]));
    const radius = Math.sqrt(q); const offset = index * 4;
    output[offset] = Math.fround(apertureX); output[offset + 1] = Math.fround(apertureZ);
    output[offset + 2] = Math.fround(Math.cos(angle) * radius); output[offset + 3] = Math.fround(Math.sin(angle) * radius);
  }
  return output;
}

/** Metrics are taken before support containment from the fixed energy-normalized reconstruction. */
export function measureLd2Softness(field: ReceiverTransportField): Ld2SoftnessMetrics {
  let sumY = 0; let sumY2 = 0; let maxY = 0;
  for (let offset = 0; offset < field.depositedFluxRgb.length; offset += 3) {
    const y = luminance(field.depositedFluxRgb[offset], field.depositedFluxRgb[offset + 1], field.depositedFluxRgb[offset + 2]);
    sumY += y; sumY2 += y * y; maxY = Math.max(maxY, y);
  }
  const localConcentration = measureLd2LocalConcentration(field, sumY);
  let roiY = 0; let sumU = 0; let sumV = 0;
  forEachRoiTexel(field, (offset, u, v) => {
    const y = luminance(field.depositedFluxRgb[offset], field.depositedFluxRgb[offset + 1], field.depositedFluxRgb[offset + 2]);
    roiY += y; sumU += y * u; sumV += y * v;
  });
  if (!(roiY > 0)) return { peakConcentration: sumY > 0 ? maxY / sumY : 0, localConcentration, effectiveArea: sumY2 > 0 ? sumY * sumY / sumY2 : 0, centroid: null, principalAxisRadians: null };
  const centroid = { u: sumU / roiY, v: sumV / roiY };
  let uu = 0; let uv = 0; let vv = 0;
  forEachRoiTexel(field, (offset, u, v) => {
    const y = luminance(field.depositedFluxRgb[offset], field.depositedFluxRgb[offset + 1], field.depositedFluxRgb[offset + 2]);
    const du = u - centroid.u; const dv = v - centroid.v;
    uu += y * du * du; uv += y * du * dv; vv += y * dv * dv;
  });
  return {
    peakConcentration: sumY > 0 ? maxY / sumY : 0,
    localConcentration,
    effectiveArea: sumY2 > 0 ? sumY * sumY / sumY2 : 0,
    centroid,
    principalAxisRadians: .5 * Math.atan2(2 * uv, uu - vv),
  };
}

/**
 * Full-raster nonnegative piecewise-constant concentration. Q considers only
 * complete grid-aligned 17×17 windows: no ROI, crop, padding, or display data.
 */
export function measureLd2LocalConcentration(field: ReceiverTransportField, totalLuminance?: number): number {
  const window = LD2_READINESS_LOCAL_CONCENTRATION_WINDOW_TEXELS;
  if (field.width < window || field.height < window) return 0;
  const stride = field.width + 1;
  const sums = new Float64Array((field.height + 1) * stride);
  let total = totalLuminance ?? 0;
  if (totalLuminance === undefined) for (let offset = 0; offset < field.depositedFluxRgb.length; offset += 3) total += luminance(field.depositedFluxRgb[offset], field.depositedFluxRgb[offset + 1], field.depositedFluxRgb[offset + 2]);
  if (!(total > 0)) return 0;
  for (let y = 1; y <= field.height; y++) {
    let row = 0;
    for (let x = 1; x <= field.width; x++) {
      const offset = ((y - 1) * field.width + x - 1) * 3;
      row += luminance(field.depositedFluxRgb[offset], field.depositedFluxRgb[offset + 1], field.depositedFluxRgb[offset + 2]);
      sums[y * stride + x] = sums[(y - 1) * stride + x] + row;
    }
  }
  let maximum = 0;
  for (let y = 0; y <= field.height - window; y++) for (let x = 0; x <= field.width - window; x++) {
    const x1 = x + window; const y1 = y + window;
    maximum = Math.max(maximum, sums[y1 * stride + x1] - sums[y * stride + x1] - sums[y1 * stride + x] + sums[y * stride + x]);
  }
  return maximum / total;
}

function measureLd2CaseMetrics(diameterDegrees: number, result: Ld1ReferenceResult, field: ReceiverTransportField): Ld2CaseMetrics {
  const on = result.on;
  return {
    diameterDegrees,
    ...measureLd2Softness(field),
    rawTransmission: { ...on.ledger.deposited },
    misses: on.ledger.missCount,
    escaped: { ...on.ledger.escaped },
    tir: { ...on.ledger.tir },
    rejected: { ...on.ledger.rejected },
    supportLeakage: on.supportLeakage,
    terminalClosureResidual: terminalClosureResidual(on.ledger),
  };
}

export function luminance(r: number, g: number, b: number): number { return .2126 * r + .7152 * g + .0722 * b; }

export function terminalClosureResidual(ledger: FluxLedger): FluxRgb {
  const residual = (channel: keyof FluxRgb): number => ledger.input[channel] - ledger.deposited[channel] - ledger.escaped[channel] - ledger.tir[channel] - ledger.reflected[channel] - ledger.absorbed[channel] - ledger.unresolved[channel];
  return { r: residual("r"), g: residual("g"), b: residual("b") };
}

export function relativeDifference(a: number, b: number): number { return Math.abs(a - b) / Math.max(1e-15, Math.abs(b)); }
export function orientationDifferenceRadians(a: number | null, b: number | null): number {
  if (a === null || b === null) return Infinity;
  const delta = Math.abs(a - b) % Math.PI;
  return Math.min(delta, Math.PI - delta);
}

function gateAtMost(failures: Ld2GateFailure[], code: string, message: string, actual: number, threshold: number): void { if (!(actual <= threshold)) failures.push(gateFailure(code, message, actual, threshold)); }
function gateStrictGreater(failures: Ld2GateFailure[], code: string, message: string, actual: number, threshold: number): void { if (!(actual > threshold)) failures.push(gateFailure(code, message, actual, threshold)); }
function gateFailure(code: string, message: string, actual: number, threshold: number): Ld2GateFailure { return { code, message, actual, threshold }; }

function forEachRoiTexel(field: ReceiverTransportField, visit: (offset: number, u: number, v: number) => void): void {
  for (let y = 0; y < field.height; y++) for (let x = 0; x < field.width; x++) {
    const u = field.minU + (x + .5) / field.width * field.sizeU;
    const v = field.minV + (y + .5) / field.height * field.sizeV;
    if (u < LD2_TRACE_ROI.minU || u > LD2_TRACE_ROI.maxU || v < LD2_TRACE_ROI.minV || v > LD2_TRACE_ROI.maxV) continue;
    visit((y * field.width + x) * 3, u, v);
  }
}

const SOBOL_PARAMETERS = [
  { degree: 0, polynomial: 0, initial: [] },
  { degree: 1, polynomial: 0, initial: [1] },
  { degree: 2, polynomial: 1, initial: [1, 3] },
  { degree: 3, polynomial: 1, initial: [1, 3, 1] },
] as const;
const SOBOL_DIRECTIONS = SOBOL_PARAMETERS.map((parameters) => {
  const directions = new Uint32Array(32);
  if (parameters.degree === 0) for (let bit = 0; bit < 32; bit++) directions[bit] = (1 << (31 - bit)) >>> 0;
  else {
    for (let bit = 0; bit < parameters.degree; bit++) directions[bit] = (parameters.initial[bit] << (31 - bit)) >>> 0;
    for (let bit = parameters.degree; bit < 32; bit++) {
      let value = directions[bit - parameters.degree] ^ (directions[bit - parameters.degree] >>> parameters.degree);
      for (let degreeBit = 1; degreeBit < parameters.degree; degreeBit++) if ((parameters.polynomial >>> (parameters.degree - 1 - degreeBit)) & 1) value ^= directions[bit - degreeBit];
      directions[bit] = value >>> 0;
    }
  }
  return directions;
});
function sobolUint(index: number, dimension: number): number { let gray = (index ^ (index >>> 1)) >>> 0; let value = 0; let bit = 0; const directions = SOBOL_DIRECTIONS[dimension]; while (gray !== 0) { if (gray & 1) value ^= directions[bit]; gray >>>= 1; bit++; } return value >>> 0; }

/**
 * Nested-uniform Owen scrambling over a 32-bit Sobol coordinate. The next
 * flip is a stable hash of this dimension's fixed root, bit depth, and the
 * already-scrambled MSB prefix, so every branch has an independently fixed
 * randomization while prefixes remain nested and deterministic.
 */
function nestedOwenScramble(value: number, root: number): number {
  let prefix = 0;
  for (let bitDepth = 0; bitDepth < 32; bitDepth++) {
    const inputBit = (value >>> (31 - bitDepth)) & 1;
    const flip = hash32(root ^ hash32(bitDepth) ^ hash32(prefix)) & 1;
    const outputBit = inputBit ^ flip;
    prefix = ((prefix << 1) | outputBit) >>> 0;
  }
  return prefix;
}

function uintToUnit(value: number): number { return value / 0x1_0000_0000; }
function hash32(input: number): number { let value = input >>> 0; value ^= value >>> 16; value = Math.imul(value, 0x7feb352d) >>> 0; value ^= value >>> 15; value = Math.imul(value, 0x846ca68b) >>> 0; value ^= value >>> 16; return value >>> 0; }
function hashString(value: string): number { let hash = 2166136261; for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }

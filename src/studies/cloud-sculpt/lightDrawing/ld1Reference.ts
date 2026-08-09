import { generateFiniteLightSamples } from "../finiteLightSamples.ts";
import {
  applyShadowContainedSupport,
  blurFluxRgbEnergyNormalized,
  createReceiverTransportField,
  integrateFluxRgb,
  measureSupportLeakage,
  splatBilinearCoverageFlux,
  splatBilinearFluxRgb,
  splatBilinearStraightFluxRgb,
  summarizeReceiverField,
  type FluxRgb,
  type ReceiverTransportField,
} from "../receiverTransport.ts";

/** CPU-only, production-unimported OPT-LD-1 readiness reference. */
export const LD1_CONTRACT = {
  label: "OPT-LD-1 READINESS / CANDIDATE",
  warning: "NOT OPT-LD-1 GO OR ACCEPTANCE",
  scope: "CPU-ONLY · NOT SHARED ShapeSource / WebGPU / Blender · NOT PRODUCTION",
  seed: "hikari-opt-ld-1-candidate-v1",
  sampleCount: 16384,
  sourceAngularRadiusDegrees: 0.53,
  ior: 1.49,
  receiverY: -0.62,
  displayScale: 9,
  exposure: 1,
  reconstructionRadiusTexels: 2,
  supportAllowanceTexels: 1,
} as const;

export interface Vec3 { x: number; y: number; z: number }
export interface RaySegment { from: Vec3; to: Vec3 }
export interface GeometryProfileSample { x: number; z: number; relief: number; topY: number; lowerY: number; thickness: number; gradientX: number; gradientZ: number }
/** A deliberately small, non-persistent exploratory vocabulary; not authored ShapeSource support. */
export const LD1_FORM_PRESETS = [
  { value: "single-bulge", label: "ひとつのふくらみ", plainLabel: "single bulge", description: "中央がひとつ持ち上がる形" },
  { value: "connected-ridge", label: "連なる稜線", plainLabel: "connected ridge", description: "一本につながった稜線の形" },
  { value: "pinch-valley", label: "つまんだ谷", plainLabel: "pinch / valley", description: "中央をつまんで谷をつくる形" },
] as const;
export type Ld1Form = typeof LD1_FORM_PRESETS[number]["value"];
export const LD1_DEFAULT_FORM: Ld1Form = "single-bulge";
/** Finite exit-surface comparison; flat is the exact historical reference path. */
export const LD1_EXIT_SURFACE_PRESETS = [
  { value: "flat", factor: 0, label: "平らな出口", plainLabel: "flat exit", description: "出口は平ら。二回目の曲がりが、表面で生まれた流れを仕上げます" },
  { value: "following", factor: 1, label: "形に沿う出口", plainLabel: "following exit", description: "出口が表面に沿い、同じ位置で見た縦の厚みが一定になります" },
  { value: "opposing", factor: -0.5, label: "反対向きの出口", plainLabel: "opposing exit", description: "出口が反対へ動き、厚み差が広がります。光は強まるだけでなく、分かれたり広がったりします" },
] as const;
export type Ld1ExitSurfaceMode = typeof LD1_EXIT_SURFACE_PRESETS[number]["value"];
export const LD1_DEFAULT_EXIT_SURFACE_MODE: Ld1ExitSurfaceMode = "flat";
/** Connected-ridge-only local gesture bounds. They deliberately do not define authored shape data. */
export const LD1_RIDGE_POSITION_MIN = -0.18;
export const LD1_RIDGE_POSITION_MAX = 0.18;
export const LD1_RIDGE_BEND_MIN = -0.20;
export const LD1_RIDGE_BEND_MAX = 0.20;
export const LD1_RIDGE_POSITION_RANGE = { min: LD1_RIDGE_POSITION_MIN, max: LD1_RIDGE_POSITION_MAX } as const;
export const LD1_RIDGE_BEND_RANGE = { min: LD1_RIDGE_BEND_MIN, max: LD1_RIDGE_BEND_MAX } as const;
export interface Ld1Config {
  sampleCount: number;
  seed: string;
  bulgeAmplitude: number;
  form: Ld1Form;
  exitSurfaceMode: Ld1ExitSurfaceMode;
  ridgePosition: number;
  ridgeBend: number;
  ior: number;
  sourceAngularRadiusDegrees: number;
  /**
   * Opt-in finite-source diameter model. Null preserves the captured LD1
   * radius/slope direction calculation exactly.
   */
  sourceAngularDiameterDegrees: number | null;
  receiverY: number;
  fieldWidth: number;
  fieldHeight: number;
  receiverSize: number;
  displayScale: number;
  exposure: number;
}
export interface FluxLedger {
  input: FluxRgb;
  /** Interface-exit throughput is intermediate only; never a terminal closure bucket. */
  interfaceExit: FluxRgb;
  /** Raw receiver-hit flux. Accepted/rejected are its support-containment partition. */
  deposited: FluxRgb; accepted: FluxRgb; rejected: FluxRgb;
  escaped: FluxRgb; tir: FluxRgb; reflected: FluxRgb; absorbed: FluxRgb; unresolved: FluxRgb;
  inputCount: number; deliveredCount: number; supportRejectedTexelCount: number; escapedCount: number; tirCount: number; missCount: number; invalidCount: number;
}
export interface TraceOutcome { kind: "delivered" | "support-rejected" | "miss" | "tir" | "escaped-domain" | "invalid"; flux: FluxRgb; incident: RaySegment; inside?: RaySegment; outgoing?: RaySegment }
export interface Ld1CaseResult {
  amplitude: number;
  field: ReceiverTransportField;
  rawField: ReceiverTransportField;
  reconstructedField: ReceiverTransportField;
  ledger: FluxLedger;
  centroid: { u: number; v: number } | null;
  supportLeakage: number;
  representative: TraceOutcome[];
}
export interface Ld1ReferenceResult {
  config: Ld1Config;
  samples: Float32Array;
  support: Uint8Array;
  straightField: ReceiverTransportField;
  off: Ld1CaseResult;
  on: Ld1CaseResult;
  signedDifference: Float32Array;
  absoluteDifference: Float32Array;
  profile: GeometryProfileSample[];
  centroidDelta: { u: number; v: number } | null;
}

const PLATE_HALF_EXTENT = 1.08;
export const LD1_GEOMETRY = {
  lowerY: 0,
  baseTopY: .34,
  sourceY: 1.35,
  maxBulgeAmplitude: .32,
} as const;
/** Fixed physical domain for every ray-diagram guide and segment. */
export const LD1_RAY_DIAGRAM_DOMAIN = {
  minX: -1.5, maxX: 1.5,
  minY: -.70, maxY: 1.43,
} as const;
const LOWER_Y = LD1_GEOMETRY.lowerY;
const TOP_Y = LD1_GEOMETRY.baseTopY;
const SOURCE_Y = LD1_GEOMETRY.sourceY;
const ABSORPTION = { r: 0.035, g: 0.018, b: 0.012 };
const INPUT_COLOUR = { r: 1, g: 0.94, b: 0.84 };
export const LD1_RECONSTRUCTION_RADIUS_TEXELS = LD1_CONTRACT.reconstructionRadiusTexels;
export const LD1_SUPPORT_EXPANSION_TEXELS = LD1_CONTRACT.reconstructionRadiusTexels + LD1_CONTRACT.supportAllowanceTexels;

export const LD1_DEFAULT_CONFIG: Ld1Config = {
  sampleCount: LD1_CONTRACT.sampleCount, seed: LD1_CONTRACT.seed, bulgeAmplitude: 0.18,
  form: LD1_DEFAULT_FORM, exitSurfaceMode: LD1_DEFAULT_EXIT_SURFACE_MODE,
  ridgePosition: 0, ridgeBend: 0,
  ior: LD1_CONTRACT.ior, sourceAngularRadiusDegrees: LD1_CONTRACT.sourceAngularRadiusDegrees,
  sourceAngularDiameterDegrees: null,
  receiverY: LD1_CONTRACT.receiverY, fieldWidth: 128, fieldHeight: 128, receiverSize: 2.8,
  displayScale: LD1_CONTRACT.displayScale, exposure: LD1_CONTRACT.exposure,
};

export function mapLd1RayDiagramX(x: number): number {
  return (x - LD1_RAY_DIAGRAM_DOMAIN.minX) / (LD1_RAY_DIAGRAM_DOMAIN.maxX - LD1_RAY_DIAGRAM_DOMAIN.minX);
}

/** Normalized screen y: zero is the fixed physical-domain top. */
export function mapLd1RayDiagramY(y: number): number {
  return (LD1_RAY_DIAGRAM_DOMAIN.maxY - y) / (LD1_RAY_DIAGRAM_DOMAIN.maxY - LD1_RAY_DIAGRAM_DOMAIN.minY);
}

export function makeLd1Config(overrides: Partial<Ld1Config> = {}): Ld1Config {
  const value = { ...LD1_DEFAULT_CONFIG, ...overrides };
  if (!Number.isInteger(value.sampleCount) || value.sampleCount <= 0 || value.sampleCount > 32768) throw new RangeError("sampleCount must be a positive bounded integer");
  if (!Number.isFinite(value.bulgeAmplitude) || value.bulgeAmplitude < 0 || value.bulgeAmplitude > 0.32) throw new RangeError("bulgeAmplitude must be within [0, 0.32]");
  if (!Number.isFinite(value.ridgePosition) || value.ridgePosition < LD1_RIDGE_POSITION_MIN || value.ridgePosition > LD1_RIDGE_POSITION_MAX) throw new RangeError("ridgePosition must be within [-0.18, 0.18]");
  if (!Number.isFinite(value.ridgeBend) || value.ridgeBend < LD1_RIDGE_BEND_MIN || value.ridgeBend > LD1_RIDGE_BEND_MAX) throw new RangeError("ridgeBend must be within [-0.20, 0.20]");
  if (!LD1_FORM_PRESETS.some((preset) => preset.value === value.form)) throw new RangeError("form must be one of the finite LD1 form presets");
  if (!LD1_EXIT_SURFACE_PRESETS.some((preset) => preset.value === value.exitSurfaceMode)) throw new RangeError("exitSurfaceMode must be one of the finite LD1 exit-surface presets");
  if (!Number.isFinite(value.ior) || value.ior <= 1 || value.ior > 2.5) throw new RangeError("ior must be finite and within (1, 2.5]");
  for (const key of ["sourceAngularRadiusDegrees", "receiverY", "receiverSize", "displayScale", "exposure"] as const) if (!Number.isFinite(value[key])) throw new RangeError(`${key} must be finite`);
  if (value.sourceAngularRadiusDegrees < 0 || value.sourceAngularRadiusDegrees > 5 || value.receiverY >= LOWER_Y || value.receiverSize <= 0 || value.displayScale <= 0 || value.exposure <= 0) throw new RangeError("invalid fixed optical domain");
  if (value.sourceAngularDiameterDegrees !== null && (!Number.isFinite(value.sourceAngularDiameterDegrees) || value.sourceAngularDiameterDegrees < 0 || value.sourceAngularDiameterDegrees > 20)) throw new RangeError("sourceAngularDiameterDegrees must be null or within [0, 20]");
  if (!Number.isInteger(value.fieldWidth) || !Number.isInteger(value.fieldHeight) || value.fieldWidth < 8 || value.fieldHeight < 8) throw new RangeError("field dimensions must be integers >= 8");
  return value;
}

/** The real upper height field. With amplitude zero, both relief and gradient are exactly zero. */
export function reliefAndGradient(x: number, z: number, amplitude: number, form: Ld1Form = LD1_DEFAULT_FORM, ridgePosition = 0, ridgeBend = 0): { relief: number; gradientX: number; gradientZ: number } {
  if (![x, z, amplitude].every(Number.isFinite)) return { relief: NaN, gradientX: NaN, gradientZ: NaN };
  if (amplitude === 0) return { relief: 0, gradientX: 0, gradientZ: 0 };
  if (form === "connected-ridge") {
    // Retain the captured reference calculation exactly for neutral controls.
    if (ridgePosition === 0 && ridgeBend === 0) {
      const ridge = Math.exp(-((x * x) / 1.16 + (z * z) / 0.16));
      return { relief: amplitude * ridge, gradientX: amplitude * ridge * (-2 * x / 1.16), gradientZ: amplitude * ridge * (-2 * z / 0.16) };
    }
    // One continuous, elongated Gaussian ridge; local controls translate and curve it.
    const d = z - ridgePosition - ridgeBend * (x * x - .30);
    const ridge = Math.exp(-((x * x) / 1.16 + (d * d) / 0.16));
    return {
      relief: amplitude * ridge,
      gradientX: amplitude * ridge * (-2 * x / 1.16 + 25 * ridgeBend * x * d),
      gradientZ: amplitude * ridge * (-12.5 * d),
    };
  }
  if (form === "pinch-valley") {
    // Its deepest point is -0.58 * amplitude, retaining >= 0.1544 plate thickness at amplitude 0.32.
    const envelope = Math.exp(-((x * x) / 0.44 + (z * z) / 0.55));
    const valley = 2.4 * x * x - 0.58;
    return {
      relief: amplitude * envelope * valley,
      gradientX: amplitude * envelope * (4.8 * x - (2 * x / 0.44) * valley),
      gradientZ: amplitude * envelope * (-(2 * z / 0.55) * valley),
    };
  }
  // Preserve the original single-bulge calculation exactly for default callers.
  const radial = Math.exp(-((x * x) / 0.48 + (z * z) / 0.7));
  const phase = 3.8 * x + 1.15 * z;
  const wave = 0.86 + 0.14 * Math.cos(phase);
  const relief = amplitude * radial * wave;
  return {
    relief,
    gradientX: amplitude * radial * ((-2 * x / 0.48) * wave - 0.14 * 3.8 * Math.sin(phase)),
    gradientZ: amplitude * radial * ((-2 * z / 0.7) * wave - 0.14 * 1.15 * Math.sin(phase)),
  };
}

export function upperSurfaceNormal(x: number, z: number, amplitude: number, form: Ld1Form = LD1_DEFAULT_FORM, ridgePosition = 0, ridgeBend = 0): Vec3 {
  const g = reliefAndGradient(x, z, amplitude, form, ridgePosition, ridgeBend);
  return normalize({ x: -g.gradientX, y: 1, z: -g.gradientZ });
}

function exitSurfaceFactor(mode: Ld1ExitSurfaceMode): number {
  return LD1_EXIT_SURFACE_PRESETS.find((preset) => preset.value === mode)!.factor;
}

/** Analytic far surface L(x,z)=q*r(x,z). Height zero is the historical flat exit. */
export function lowerSurfaceAndGradient(
  x: number,
  z: number,
  amplitude: number,
  form: Ld1Form = LD1_DEFAULT_FORM,
  mode: Ld1ExitSurfaceMode = LD1_DEFAULT_EXIT_SURFACE_MODE,
  ridgePosition = 0,
  ridgeBend = 0,
): { height: number; gradientX: number; gradientZ: number } {
  const q = exitSurfaceFactor(mode);
  const g = reliefAndGradient(x, z, amplitude, form, ridgePosition, ridgeBend);
  return { height: q * g.relief, gradientX: q * g.gradientX, gradientZ: q * g.gradientZ };
}

/** Exit normal points upward into the incident material. */
export function lowerSurfaceNormal(
  x: number,
  z: number,
  amplitude: number,
  form: Ld1Form = LD1_DEFAULT_FORM,
  mode: Ld1ExitSurfaceMode = LD1_DEFAULT_EXIT_SURFACE_MODE,
  ridgePosition = 0,
  ridgeBend = 0,
): Vec3 {
  const g = lowerSurfaceAndGradient(x, z, amplitude, form, mode, ridgePosition, ridgeBend);
  return normalize({ x: -g.gradientX, y: 1, z: -g.gradientZ });
}

export type LowerSurfaceIntersection =
  | { kind: "hit"; point: Vec3; residual: number }
  | { kind: "outside"; point: Vec3; residual: number }
  | { kind: "invalid"; residual: number };

/** Bounded analytic intersection for the far surface; never falls back to a plane. */
export function intersectLowerSurface(
  origin: Vec3,
  direction: Vec3,
  amplitude: number,
  form: Ld1Form,
  mode: Ld1ExitSurfaceMode,
  ridgePosition = 0,
  ridgeBend = 0,
): LowerSurfaceIntersection {
  if (mode === "flat" || amplitude === 0) {
    const point = planeHit(origin, direction, LOWER_Y);
    if (!point) return { kind: "invalid", residual: Infinity };
    return withinPlate(point) ? { kind: "hit", point, residual: 0 } : { kind: "outside", point, residual: 0 };
  }
  if (!(direction.y < -1e-8) || ![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite)) return { kind: "invalid", residual: Infinity };
  const initial = lowerSurfaceAndGradient(origin.x, origin.z, amplitude, form, mode, ridgePosition, ridgeBend);
  let t = (initial.height - origin.y) / direction.y;
  for (let iteration = 0; iteration < 8; iteration++) {
    if (!Number.isFinite(t)) return { kind: "invalid", residual: Infinity };
    const point = add(origin, scale(direction, t));
    const g = lowerSurfaceAndGradient(point.x, point.z, amplitude, form, mode, ridgePosition, ridgeBend);
    const residual = point.y - g.height;
    const derivative = direction.y - g.gradientX * direction.x - g.gradientZ * direction.z;
    if (!Number.isFinite(residual) || !Number.isFinite(derivative) || Math.abs(derivative) < 1e-9) return { kind: "invalid", residual: Math.abs(residual) };
    t -= residual / derivative;
  }
  const point = add(origin, scale(direction, t));
  const g = lowerSurfaceAndGradient(point.x, point.z, amplitude, form, mode, ridgePosition, ridgeBend);
  const residual = Math.abs(point.y - g.height);
  if (!(t > 1e-9) || !Number.isFinite(point.x + point.y + point.z) || !Number.isFinite(residual) || residual > 1e-8) return { kind: "invalid", residual };
  return withinPlate(point) ? { kind: "hit", point, residual } : { kind: "outside", point, residual };
}

/** Snell refraction with a normal pointing into the incident medium; null is TIR/invalid. */
export function refractSnell(incident: Vec3, normalTowardIncident: Vec3, nIncident: number, nTransmitted: number): Vec3 | null {
  if (![incident.x, incident.y, incident.z, normalTowardIncident.x, normalTowardIncident.y, normalTowardIncident.z, nIncident, nTransmitted].every(Number.isFinite) || nIncident <= 0 || nTransmitted <= 0) return null;
  const i = normalize(incident); const n = normalize(normalTowardIncident);
  const cosI = -dot(i, n);
  if (!(cosI >= 0)) return null;
  const eta = nIncident / nTransmitted;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  return normalize(add(scale(i, eta), scale(n, eta * cosI - Math.sqrt(k))));
}

export function fresnelDielectric(incident: Vec3, normalTowardIncident: Vec3, nIncident: number, nTransmitted: number): number {
  const cosI = Math.max(0, -dot(normalize(incident), normalize(normalTowardIncident)));
  const sinT2 = (nIncident / nTransmitted) ** 2 * Math.max(0, 1 - cosI * cosI);
  if (sinT2 >= 1) return 1;
  const cosT = Math.sqrt(Math.max(0, 1 - sinT2));
  const rs = ((nIncident * cosI - nTransmitted * cosT) / (nIncident * cosI + nTransmitted * cosT)) ** 2;
  const rp = ((nIncident * cosT - nTransmitted * cosI) / (nIncident * cosT + nTransmitted * cosI)) ** 2;
  return Math.min(1, Math.max(0, (rs + rp) * .5));
}

/**
 * Bounded lower-interface accounting: exit throughput is intermediate, while
 * a TIR path owns its surviving flux exactly once as a terminal outcome.
 */
export function classifyExitTerminal(
  afterAbsorption: FluxRgb,
  outgoingDirection: Vec3 | null,
  fresnelReflectance: number,
): { interfaceExit: FluxRgb; reflected: FluxRgb; tir: FluxRgb } {
  if (!outgoingDirection) return { interfaceExit: zeroRgb(), reflected: zeroRgb(), tir: { ...afterAbsorption } };
  const reflectance = Number.isFinite(fresnelReflectance) ? Math.min(1, Math.max(0, fresnelReflectance)) : 1;
  return {
    interfaceExit: scaleRgb(afterAbsorption, 1 - reflectance),
    reflected: scaleRgb(afterAbsorption, reflectance),
    tir: zeroRgb(),
  };
}

export function runLd1Reference(overrides: Partial<Ld1Config> = {}): Ld1ReferenceResult {
  const config = makeLd1Config(overrides);
  const samples = generateFiniteLightSamples(config.sampleCount, config.seed);
  return runLd1ReferenceConfigured(samples, config);
}

/**
 * Explicit bounded-sample path for local estimators. Ordinary LD1 callers use
 * runLd1Reference above, preserving its canonical generator and captured
 * bytes. This entry point never changes that default path.
 */
export function runLd1ReferenceWithSamples(samples: Float32Array, overrides: Partial<Ld1Config> = {}): Ld1ReferenceResult {
  const config = makeLd1Config(overrides);
  validateExplicitSamples(samples, config.sampleCount);
  return runLd1ReferenceConfigured(samples, config);
}

function runLd1ReferenceConfigured(samples: Float32Array, config: Ld1Config): Ld1ReferenceResult {
  const straightField = createField(config, "straight");
  const support = buildCausalStraightSupport(samples, config, straightField);
  const off = traceCase(samples, config, 0, support);
  const on = traceCase(samples, config, config.bulgeAmplitude, support);
  const signedDifference = new Float32Array(on.field.depositedFluxRgb.length);
  const absoluteDifference = new Float32Array(signedDifference.length);
  for (let i = 0; i < signedDifference.length; i++) { signedDifference[i] = on.field.depositedFluxRgb[i] - off.field.depositedFluxRgb[i]; absoluteDifference[i] = Math.abs(signedDifference[i]); }
  const centroidDelta = off.centroid && on.centroid ? { u: on.centroid.u - off.centroid.u, v: on.centroid.v - off.centroid.v } : null;
  const profile: GeometryProfileSample[] = Array.from({ length: 25 }, (_, i) => {
    const x = -1.05 + i * 2.1 / 24; const z = 0;
    const g = reliefAndGradient(x, z, config.bulgeAmplitude, config.form, config.ridgePosition, config.ridgeBend);
    const lower = lowerSurfaceAndGradient(x, z, config.bulgeAmplitude, config.form, config.exitSurfaceMode, config.ridgePosition, config.ridgeBend);
    return { x, z, relief: g.relief, topY: TOP_Y + g.relief, lowerY: lower.height, thickness: TOP_Y + g.relief - lower.height, gradientX: g.gradientX, gradientZ: g.gradientZ };
  });
  return { config, samples, support, straightField, off, on, signedDifference, absoluteDifference, profile, centroidDelta };
}

function validateExplicitSamples(samples: Float32Array, sampleCount: number): void {
  if (!(samples instanceof Float32Array) || samples.length !== sampleCount * 4) throw new RangeError("explicit samples must be a Float32Array with sampleCount * 4 values");
  const epsilon = 1e-6;
  for (let index = 0; index < sampleCount; index++) {
    const offset = index * 4; const apertureX = samples[offset]; const apertureZ = samples[offset + 1]; const angularU = samples[offset + 2]; const angularV = samples[offset + 3];
    if (![apertureX, apertureZ, angularU, angularV].every(Number.isFinite)) throw new RangeError("explicit samples must be finite");
    if (Math.abs(apertureX) > 1 + epsilon || Math.abs(apertureZ) > 1 + epsilon) throw new RangeError("explicit aperture samples must be within [-1, 1]");
    if (angularU * angularU + angularV * angularV > 1 + epsilon) throw new RangeError("explicit angular samples must lie in the unit disk");
  }
}

export function physicalDisplayRgb(field: ReceiverTransportField, config: Pick<Ld1Config, "displayScale" | "exposure">): Float32Array {
  const output = new Float32Array(field.depositedFluxRgb.length);
  const multiplier = config.displayScale * config.exposure / field.texelArea;
  for (let i = 0; i < output.length; i++) output[i] = field.depositedFluxRgb[i] * multiplier;
  return output;
}

function buildCausalStraightSupport(samples: Float32Array, config: Ld1Config, field: ReceiverTransportField): Uint8Array {
  const flux = sampleFlux(config.sampleCount);
  for (let index = 0; index < config.sampleCount; index++) {
    const ray = incidentRay(samples, index, config);
    const landing = planeHit(ray.origin, ray.direction, config.receiverY);
    if (!landing || !withinReceiver(landing, config)) continue;
    splatBilinearCoverageFlux(field, landing.x, landing.z, 1);
    splatBilinearStraightFluxRgb(field, landing.x, landing.z, flux);
  }
  return Uint8Array.from(field.geometricCoverage, (value) => value > 0 ? 1 : 0);
}

function traceCase(samples: Float32Array, config: Ld1Config, amplitude: number, support: Uint8Array): Ld1CaseResult {
  const rawField = createField(config, amplitude === 0 ? "off" : "on");
  const ledger = emptyLedger(config.sampleCount);
  const representatives: TraceOutcome[] = [];
  for (let index = 0; index < config.sampleCount; index++) {
    const outcome = traceSample(samples, index, config, amplitude, rawField, ledger);
    if (representatives.length < 6 && (outcome.kind === "delivered" || outcome.kind === "tir" || outcome.kind === "escaped-domain")) representatives.push(outcome);
  }
  // This is a fixed display reconstruction only: it runs after all single-hit
  // physical deposits, conserves RGB flux, and is identical for OFF and ON.
  const reconstructedField = blurFluxRgbEnergyNormalized(rawField, LD1_RECONSTRUCTION_RADIUS_TEXELS);
  const contained = applyShadowContainedSupport(reconstructedField, support, LD1_SUPPORT_EXPANSION_TEXELS);
  ledger.rejected = contained.rejectedFluxRgb;
  ledger.accepted = integrateFluxRgb(contained.field);
  ledger.supportRejectedTexelCount = countSupportClippedTexels(reconstructedField, contained.field);
  const field = contained.field;
  const summary = summarizeReceiverField(field);
  return { amplitude, field, rawField, reconstructedField, ledger, centroid: summary.fluxCentroid, supportLeakage: measureSupportLeakage(field, support, LD1_SUPPORT_EXPANSION_TEXELS).ratio, representative: representatives };
}

function traceSample(samples: Float32Array, index: number, config: Ld1Config, amplitude: number, field: ReceiverTransportField, ledger: FluxLedger): TraceOutcome {
  const ray = incidentRay(samples, index, config); const input = sampleFlux(config.sampleCount); ledger.input = addRgb(ledger.input, input);
  const entry = intersectUpper(ray.origin, ray.direction, amplitude, config.form, config.ridgePosition, config.ridgeBend);
  if (!entry) { ledger.missCount++; ledger.escaped = addRgb(ledger.escaped, input); return { kind: "miss", flux: input, incident: { from: ray.origin, to: add(ray.origin, scale(ray.direction, 2)) } }; }
  const entryNormal = upperSurfaceNormal(entry.x, entry.z, amplitude, config.form, config.ridgePosition, config.ridgeBend);
  const insideDirection = refractSnell(ray.direction, entryNormal, 1, config.ior);
  const rEntry = fresnelDielectric(ray.direction, entryNormal, 1, config.ior);
  ledger.reflected = addRgb(ledger.reflected, scaleRgb(input, rEntry));
  const afterEntry = scaleRgb(input, 1 - rEntry);
  if (!insideDirection) { ledger.invalidCount++; ledger.unresolved = addRgb(ledger.unresolved, afterEntry); return { kind: "invalid", flux: afterEntry, incident: { from: ray.origin, to: entry } }; }
  const lowerIntersection = intersectLowerSurface(entry, insideDirection, amplitude, config.form, config.exitSurfaceMode, config.ridgePosition, config.ridgeBend);
  if (lowerIntersection.kind === "invalid") { ledger.invalidCount++; ledger.unresolved = addRgb(ledger.unresolved, afterEntry); return { kind: "invalid", flux: afterEntry, incident: { from: ray.origin, to: entry } }; }
  if (lowerIntersection.kind === "outside") { ledger.escapedCount++; ledger.escaped = addRgb(ledger.escaped, afterEntry); return { kind: "escaped-domain", flux: afterEntry, incident: { from: ray.origin, to: entry }, inside: { from: entry, to: lowerIntersection.point } }; }
  const lower = lowerIntersection.point;
  const thickness = distance(entry, lower);
  const afterAbsorption = { r: afterEntry.r * Math.exp(-ABSORPTION.r * thickness), g: afterEntry.g * Math.exp(-ABSORPTION.g * thickness), b: afterEntry.b * Math.exp(-ABSORPTION.b * thickness) };
  ledger.absorbed = addRgb(ledger.absorbed, subtractRgb(afterEntry, afterAbsorption));
  const lowerNormal = config.exitSurfaceMode === "flat" || amplitude === 0
    ? { x: 0, y: 1, z: 0 }
    : lowerSurfaceNormal(lower.x, lower.z, amplitude, config.form, config.exitSurfaceMode, config.ridgePosition, config.ridgeBend);
  const outgoingDirection = refractSnell(insideDirection, lowerNormal, config.ior, 1);
  const rExit = fresnelDielectric(insideDirection, lowerNormal, config.ior, 1);
  // TIR is a single terminal outcome in this bounded reference, not also an
  // exit-interface reflection bucket. This prevents double accounting.
  const exit = classifyExitTerminal(afterAbsorption, outgoingDirection, rExit);
  if (!outgoingDirection) { ledger.tirCount++; ledger.tir = addRgb(ledger.tir, exit.tir); return { kind: "tir", flux: exit.tir, incident: { from: ray.origin, to: entry }, inside: { from: entry, to: lower } }; }
  ledger.reflected = addRgb(ledger.reflected, exit.reflected);
  const interfaceExit = exit.interfaceExit; ledger.interfaceExit = addRgb(ledger.interfaceExit, interfaceExit);
  const landing = planeHit(lower, outgoingDirection, config.receiverY);
  if (!landing || !withinReceiver(landing, config)) { ledger.escapedCount++; ledger.escaped = addRgb(ledger.escaped, interfaceExit); return { kind: "escaped-domain", flux: interfaceExit, incident: { from: ray.origin, to: entry }, inside: { from: entry, to: lower }, outgoing: landing ? { from: lower, to: landing } : undefined }; }
  splatBilinearFluxRgb(field, landing.x, landing.z, interfaceExit); ledger.deposited = addRgb(ledger.deposited, interfaceExit); ledger.deliveredCount++;
  return { kind: "delivered", flux: interfaceExit, incident: { from: ray.origin, to: entry }, inside: { from: entry, to: lower }, outgoing: { from: lower, to: landing } };
}

function createField(config: Ld1Config, revision: string): ReceiverTransportField { return createReceiverTransportField({ receiverId: "ld1-fixed-receiver", sceneRevision: `ld1-${revision}`, lightRevision: `finite-${config.seed}`, width: config.fieldWidth, height: config.fieldHeight, minU: -config.receiverSize / 2, minV: -config.receiverSize / 2, sizeU: config.receiverSize, sizeV: config.receiverSize }); }
/** The fixed normalized central direction used by the explicit diameter model. */
export const LD1_FIXED_CENTRAL_DIRECTION: Vec3 = normalize({ x: .12, y: -1, z: .07 });

export interface Ld1SourceDirectionBasis { central: Vec3; tangentU: Vec3; tangentV: Vec3 }

/** A deterministic right-handed orthonormal basis around the fixed source axis. */
export function makeLd1SourceDirectionBasis(central: Vec3 = LD1_FIXED_CENTRAL_DIRECTION): Ld1SourceDirectionBasis {
  const axis = normalize(central);
  const reference = Math.abs(axis.y) < .9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangentU = normalize(cross(reference, axis));
  return { central: axis, tangentU, tangentV: normalize(cross(axis, tangentU)) };
}

/**
 * Pure source-disk mapper for the corrected opt-in diameter model. The legacy
 * field remains intentionally separate in incidentRay so captured LD1 hashes
 * keep their original radius/slope semantics.
 */
export function mapLd1SourceDiskDirection(diskU: number, diskV: number, diameterDegrees: number, basis = makeLd1SourceDirectionBasis()): Vec3 {
  const radiusSlope = Math.tan((diameterDegrees * Math.PI / 180) / 2);
  return normalize(add(basis.central, add(scale(basis.tangentU, diskU * radiusSlope), scale(basis.tangentV, diskV * radiusSlope))));
}

function incidentRay(samples: Float32Array, index: number, config: Ld1Config): { origin: Vec3; direction: Vec3 } {
  const i = index * 4;
  // Do not consolidate these branches: the null branch is the historical
  // expression, retained byte-for-byte in behavior for LD1 compatibility.
  const direction = config.sourceAngularDiameterDegrees === null
    ? normalize({ x: .12 + samples[i + 2] * (config.sourceAngularRadiusDegrees * Math.PI / 180), y: -1, z: .07 + samples[i + 3] * (config.sourceAngularRadiusDegrees * Math.PI / 180) })
    : mapLd1SourceDiskDirection(samples[i + 2], samples[i + 3], config.sourceAngularDiameterDegrees);
  return { origin: { x: samples[i] * .88, y: SOURCE_Y, z: samples[i + 1] * .88 }, direction };
}
function intersectUpper(origin: Vec3, direction: Vec3, amplitude: number, form: Ld1Form, ridgePosition: number, ridgeBend: number): Vec3 | null { if (!(direction.y < -1e-8)) return null; let t = (TOP_Y + reliefAndGradient(origin.x, origin.z, amplitude, form, ridgePosition, ridgeBend).relief - origin.y) / direction.y; for (let iteration = 0; iteration < 8; iteration++) { const p = add(origin, scale(direction, t)); const g = reliefAndGradient(p.x, p.z, amplitude, form, ridgePosition, ridgeBend); const f = p.y - TOP_Y - g.relief; const derivative = direction.y - g.gradientX * direction.x - g.gradientZ * direction.z; if (!Number.isFinite(t) || !Number.isFinite(derivative) || Math.abs(derivative) < 1e-9) return null; t -= f / derivative; } const hit = add(origin, scale(direction, t)); return t > 0 && withinPlate(hit) && Number.isFinite(hit.x + hit.y + hit.z) ? hit : null; }
function planeHit(origin: Vec3, direction: Vec3, y: number): Vec3 | null { if (!Number.isFinite(y) || Math.abs(direction.y) < 1e-9) return null; const t = (y - origin.y) / direction.y; return t > 0 && Number.isFinite(t) ? add(origin, scale(direction, t)) : null; }
function withinPlate(p: Vec3): boolean { return Math.abs(p.x) <= PLATE_HALF_EXTENT && Math.abs(p.z) <= PLATE_HALF_EXTENT; }
function withinReceiver(p: Vec3, c: Ld1Config): boolean { return Math.abs(p.x) <= c.receiverSize / 2 && Math.abs(p.z) <= c.receiverSize / 2; }
function sampleFlux(count: number): FluxRgb { return scaleRgb(INPUT_COLOUR, 1 / count); }
function zeroRgb(): FluxRgb { return { r: 0, g: 0, b: 0 }; }
function emptyLedger(inputCount: number): FluxLedger { return { input: { r: 0, g: 0, b: 0 }, interfaceExit: { r: 0, g: 0, b: 0 }, deposited: { r: 0, g: 0, b: 0 }, accepted: { r: 0, g: 0, b: 0 }, rejected: { r: 0, g: 0, b: 0 }, escaped: { r: 0, g: 0, b: 0 }, tir: { r: 0, g: 0, b: 0 }, reflected: { r: 0, g: 0, b: 0 }, absorbed: { r: 0, g: 0, b: 0 }, unresolved: { r: 0, g: 0, b: 0 }, inputCount, deliveredCount: 0, supportRejectedTexelCount: 0, escapedCount: 0, tirCount: 0, missCount: 0, invalidCount: 0 }; }
/** Counts only nonzero reconstructed texels that lose RGB during support containment. */
export function countSupportClippedTexels(reconstructed: ReceiverTransportField, contained: ReceiverTransportField): number { let count = 0; for (let i = 0; i < reconstructed.depositedFluxRgb.length; i += 3) { const before = reconstructed.depositedFluxRgb[i] + reconstructed.depositedFluxRgb[i + 1] + reconstructed.depositedFluxRgb[i + 2]; const after = contained.depositedFluxRgb[i] + contained.depositedFluxRgb[i + 1] + contained.depositedFluxRgb[i + 2]; if (before > 1e-12 && before > after + 1e-12) count++; } return count; }
function normalize(v: Vec3): Vec3 { const length = Math.hypot(v.x, v.y, v.z); return length > 0 && Number.isFinite(length) ? { x: v.x / length, y: v.y / length, z: v.z / length } : { x: NaN, y: NaN, z: NaN }; }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(a: Vec3, amount: number): Vec3 { return { x: a.x * amount, y: a.y * amount, z: a.z * amount }; }
function distance(a: Vec3, b: Vec3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function addRgb(a: FluxRgb, b: FluxRgb): FluxRgb { return { r: a.r + b.r, g: a.g + b.g, b: a.b + b.b }; }
function subtractRgb(a: FluxRgb, b: FluxRgb): FluxRgb { return { r: Math.max(0, a.r - b.r), g: Math.max(0, a.g - b.g), b: Math.max(0, a.b - b.b) }; }
function scaleRgb(a: FluxRgb, amount: number): FluxRgb { return { r: a.r * amount, g: a.g * amount, b: a.b * amount }; }

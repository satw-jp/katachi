import {
  GPU_OPTICS_RESULT_FLOATS,
  GPU_OPTICS_RESULT_OFFSETS,
  gpuOpticsResultOffset,
  type GpuOpticsResult,
} from "./opticsGpu.ts";
import {
  OPTICAL_EVENT_CONTRACT_VERSION,
  observed,
  receiverFluxRgb,
  unavailable,
  validateOpticalEvent,
  type BackendCapabilityDescriptor,
  type MissingReason,
  type Observed,
  type OpticalEvent,
  type OpticalPathAttributes,
  type ReceiverOpticalEvent,
  type ReceiverFluxRgb,
  type SourceBackend,
} from "./opticalEvents.ts";
import type { Rgb, Vec3 } from "./opticalScene.ts";

export type ReceiverSampleOutcome = "receiver-hit" | "absorbed" | "escaped" | "rejected" | "unresolved";

/** Raw CPU branch data. RGB values are deliberately unbranded until adapted. */
interface ReceiverSampleObservationBase {
  sampleId: string;
  sceneRevision: string;
  lightRevision: string;
  outcome: ReceiverSampleOutcome;
  path: OpticalPathAttributes;
  receiverId: Observed<string>;
  receiverUv: Observed<readonly [number, number]>;
  deliveredFluxRgb: Observed<Rgb>;
  shadowCoverageWeight: Observed<number>;
  sampleWeight: Observed<number>;
}

export interface CpuReceiverSampleObservation extends ReceiverSampleObservationBase {
  backend: "cpu-receiver";
}

export interface GpuReceiverSampleObservation extends ReceiverSampleObservationBase {
  backend: "webgpu-receiver";
  flags: {
    entryValid: boolean;
    exitValid: boolean;
    floorValid: boolean;
    baselineValid: boolean;
    outgoingValid: boolean;
  };
}

export type ReceiverSampleObservation = CpuReceiverSampleObservation | GpuReceiverSampleObservation;

/** Test-only sink type. The normal renderer passes no sink, so no raw records are allocated. */
export type ReceiverEventSink =
  | ((observation: ReceiverSampleObservation) => void)
  | { record(observation: ReceiverSampleObservation): void };

/** Fixed receiver bounds supplied by the field/runtime; decoder never guesses them. */
export interface ReceiverDomainContext {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

export function recordReceiverObservation(
  sink: ReceiverEventSink,
  observation: ReceiverSampleObservation,
): void {
  if (typeof sink === "function") sink(observation);
  else sink.record(observation);
}

export interface DecodeGpuReceiverOptions {
  receiverDomain: ReceiverDomainContext;
  /** Per-sample receiver flux supplied by the runtime accumulator. */
  sampleFlux: number;
  sampleId?: string;
  sceneRevision?: string;
  lightRevision?: string;
  receiverId?: Observed<string>;
  receiverUv?: Observed<readonly [number, number]>;
  sampleWeight?: Observed<number>;
  shadowCoverageWeight?: Observed<number>;
}

const unsupportedPath = <T>(reason: MissingReason = "unsupported-path"): Observed<T> => unavailable(reason);

function backendSpecific<T>(backend: SourceBackend, semantics: string, value?: T): Observed<T> {
  return value === undefined
    ? { state: "backend-specific", backend, semantics }
    : { state: "backend-specific", backend, semantics, value };
}

function isReceiverPointInDomain(
  domain: ReceiverDomainContext,
  u: number,
  v: number,
): boolean {
  return Number.isFinite(domain.minU)
    && Number.isFinite(domain.maxU)
    && Number.isFinite(domain.minV)
    && Number.isFinite(domain.maxV)
    && domain.minU <= domain.maxU
    && domain.minV <= domain.maxV
    && Number.isFinite(u)
    && Number.isFinite(v)
    && u >= domain.minU
    && u <= domain.maxU
    && v >= domain.minV
    && v <= domain.maxV;
}

function assertReceiverDomain(domain: ReceiverDomainContext): void {
  if (!Number.isFinite(domain.minU)
    || !Number.isFinite(domain.maxU)
    || !Number.isFinite(domain.minV)
    || !Number.isFinite(domain.maxV)
    || domain.minU > domain.maxU
    || domain.minV > domain.maxV) {
    throw new RangeError("GPU receiver decoder requires finite ordered receiver-domain bounds");
  }
}

function normalizeDirection(value: Vec3): Vec3 | undefined {
  const length = Math.hypot(value.x, value.y, value.z);
  return Number.isFinite(length) && length > 1e-12
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : undefined;
}

function normalizeObservationPath(path: OpticalPathAttributes): OpticalPathAttributes {
  if (path.exitDirectionWorld.state !== "available") return path;
  const direction = normalizeDirection(path.exitDirectionWorld.value);
  return {
    ...path,
    exitDirectionWorld: direction
      ? observed(direction, path.exitDirectionWorld.confidence, path.exitDirectionWorld.provenance)
      : unavailable("invalid-input"),
  };
}

function assertRawIdentity(observation: ReceiverSampleObservation): void {
  if (!observation.sampleId || !observation.sceneRevision || !observation.lightRevision) {
    throw new TypeError("Optical receiver observations require sample, scene, and light revisions");
  }
}

function adaptRgbObserved(value: Observed<Rgb>): Observed<ReceiverFluxRgb> {
  if (value.state === "available") {
    return observed(receiverFluxRgb(value.value), value.confidence, value.provenance);
  }
  if (value.state === "backend-specific" && value.value !== undefined) {
    return { ...value, value: receiverFluxRgb(value.value) };
  }
  return value as Observed<ReceiverFluxRgb>;
}

function mapOutcome(
  outcome: ReceiverSampleOutcome,
): ReceiverOpticalEvent["outcome"] {
  if (outcome === "receiver-hit") {
    return { kind: "terminal", terminalEvent: observed("receiver-hit", "exact", "backend-branch") };
  }
  return {
    kind: "diagnostic",
    termination: observed(outcome, "exact", "backend-branch"),
  };
}

function adaptReceiverObservation(
  observation: ReceiverSampleObservation,
): ReceiverOpticalEvent {
  assertRawIdentity(observation);
  const event: ReceiverOpticalEvent = {
    contractVersion: OPTICAL_EVENT_CONTRACT_VERSION,
    sampleId: observation.sampleId,
    sceneRevision: observation.sceneRevision,
    lightRevision: observation.lightRevision,
    sourceBackend: observation.backend,
    transportDomain: "receiver",
    outcome: mapOutcome(observation.outcome),
    path: normalizeObservationPath(observation.path),
    receiverId: observation.receiverId,
    receiverUv: observation.receiverUv,
    deliveredFluxRgb: adaptRgbObserved(observation.deliveredFluxRgb),
    shadowCoverageWeight: observation.shadowCoverageWeight,
    sampleWeight: observation.sampleWeight,
  };
  const issues = validateOpticalEvent(event);
  if (issues.length > 0) throw new TypeError(`Invalid optical receiver event: ${issues.join("; ")}`);
  return event;
}

export function adaptCpuReceiverObservation(
  observation: CpuReceiverSampleObservation,
): ReceiverOpticalEvent {
  if (observation.backend !== "cpu-receiver") throw new TypeError("CPU adapter received a non-CPU observation");
  return adaptReceiverObservation(observation);
}

export function adaptGpuReceiverObservation(
  observation: GpuReceiverSampleObservation,
): ReceiverOpticalEvent {
  if (observation.backend !== "webgpu-receiver") throw new TypeError("WebGPU adapter received a non-WebGPU observation");
  if (!observation.flags.entryValid || !observation.flags.baselineValid) {
    throw new RangeError("A WebGPU baseline miss is not an affected receiver sample and cannot become an event");
  }
  return adaptReceiverObservation(observation);
}

function readResult(values: Float32Array, sampleIndex: number): {
  flags: GpuReceiverSampleObservation["flags"];
  baseline: Vec3 | undefined;
  throughput: Rgb;
  exit: Vec3 | undefined;
  floor: Vec3 | undefined;
} {
  if (values.length < gpuOpticsResultOffset(sampleIndex) + GPU_OPTICS_RESULT_FLOATS) {
    throw new RangeError("GPU optics payload is shorter than the requested 28-float record");
  }
  const offset = gpuOpticsResultOffset(sampleIndex);
  const flagsOffset = offset + GPU_OPTICS_RESULT_OFFSETS.flags;
  const baselineOffset = offset + GPU_OPTICS_RESULT_OFFSETS.baseline;
  const throughputOffset = offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb;
  const vector = (vectorOffset: number): Vec3 => ({
    x: values[vectorOffset],
    y: values[vectorOffset + 1],
    z: values[vectorOffset + 2],
  });
  const flags = {
    entryValid: values[flagsOffset] > 0.5,
    exitValid: values[flagsOffset + 1] > 0.5,
    floorValid: values[flagsOffset + 2] > 0.5,
    baselineValid: values[baselineOffset + 3] > 0.5,
    outgoingValid: values[throughputOffset + 3] > 0.5,
  };
  return {
    flags,
    baseline: flags.baselineValid ? vector(baselineOffset) : undefined,
    throughput: {
      r: values[throughputOffset],
      g: values[throughputOffset + 1],
      b: values[throughputOffset + 2],
    },
    exit: flags.exitValid ? vector(offset + GPU_OPTICS_RESULT_OFFSETS.exit) : undefined,
    floor: flags.floorValid ? vector(offset + GPU_OPTICS_RESULT_OFFSETS.floor) : undefined,
  };
}

/** Decode only fields represented by the existing 28-float GPU payload. */
export function decodeGpuReceiverObservation(
  payload: GpuOpticsResult,
  sampleIndex: number,
  options: DecodeGpuReceiverOptions,
): GpuReceiverSampleObservation;
export function decodeGpuReceiverObservation(
  payload: Float32Array,
  sampleIndex: number,
  options: DecodeGpuReceiverOptions,
): GpuReceiverSampleObservation;
export function decodeGpuReceiverObservation(
  payload: GpuOpticsResult | Float32Array,
  sampleIndex: number,
  options: DecodeGpuReceiverOptions,
): GpuReceiverSampleObservation {
  if (!options || !options.receiverDomain) {
    throw new TypeError("GPU receiver decoder requires explicit receiver-domain bounds");
  }
  assertReceiverDomain(options.receiverDomain);
  if (!Number.isFinite(options.sampleFlux) || options.sampleFlux < 0) {
    throw new RangeError("GPU receiver decoder requires a finite non-negative sampleFlux");
  }
  const values = payload instanceof Float32Array ? payload : payload.values;
  const decoded = readResult(values, sampleIndex);
  const { flags, throughput, exit, floor } = decoded;
  const sampleId = options.sampleId ?? `gpu-sample-${sampleIndex}`;
  const sceneRevision = options.sceneRevision ?? "gpu-payload";
  const lightRevision = options.lightRevision ?? "gpu-payload";
  const receiverId = options.receiverId ?? unsupportedPath<string>("not-emitted-by-backend");
  const receiverUv = options.receiverUv
    ?? (floor ? observed([floor.x, floor.z] as const, "exact", "lossless-derivation") : unsupportedPath<readonly [number, number]>("unsupported-path"));
  const sampleWeight = options.sampleWeight ?? observed(1, "exact", "lossless-derivation");
  const shadowCoverageWeight = options.shadowCoverageWeight
    ?? (flags.baselineValid ? observed(1, "exact", "backend-output") : unsupportedPath<number>("unsupported-path"));
  const exitDirection = flags.outgoingValid && flags.floorValid && exit && floor
    ? normalizeDirection({ x: floor.x - exit.x, y: floor.y - exit.y, z: floor.z - exit.z })
    : undefined;
  let outcome: ReceiverSampleOutcome = "unresolved";
  const floorInReceiverDomain = floor !== undefined
    && isReceiverPointInDomain(options.receiverDomain, floor.x, floor.z);
  if (flags.entryValid && flags.baselineValid) {
    if (flags.floorValid && flags.exitValid && floorInReceiverDomain) outcome = "receiver-hit";
    else if (flags.exitValid) outcome = "escaped";
    else outcome = "unresolved";
  }
  const deliveredFluxRgb = outcome === "receiver-hit"
    ? observed({
        r: throughput.r * options.sampleFlux,
        g: throughput.g * options.sampleFlux,
        b: throughput.b * options.sampleFlux,
      }, "exact", "backend-output")
    : unsupportedPath<Rgb>("unsupported-path");
  const path: OpticalPathAttributes = {
    internalBounceCount: unsupportedPath("not-emitted-by-backend"),
    hadInternalReflection: unsupportedPath("not-emitted-by-backend"),
    opticalPathLength: unsupportedPath("not-emitted-by-backend"),
    exitDirectionWorld: exitDirection
      ? observed(exitDirection, "bounded", "lossless-derivation")
      : backendSpecific("webgpu-receiver", "The 28-float payload cannot provide a finite non-zero outgoing direction for this sample."),
    mediumIds: backendSpecific("webgpu-receiver", "Medium identifiers are absent from the 28-float payload."),
    inclusionIds: unsupportedPath("not-emitted-by-backend"),
  };
  return {
    backend: "webgpu-receiver",
    sampleId,
    sceneRevision,
    lightRevision,
    outcome,
    path,
    receiverId,
    receiverUv,
    deliveredFluxRgb,
    shadowCoverageWeight,
    sampleWeight,
    flags,
  };
}

/** Return the R0.5 BODY capability boundary; BODY pixels are never decoded as events. */
export const bodyCapabilityDescriptor: BackendCapabilityDescriptor = Object.freeze({
  backend: "body-webgl",
  domain: "view",
  capabilities: Object.freeze({
    terminalEvent: "ambiguous",
    surfaceReflection: "unavailable",
    transmission: "unavailable",
    receiverHit: "unavailable",
    internalBounceCount: "unavailable",
    hadInternalReflection: "unavailable",
    opticalPathLength: "unavailable",
    exitDirection: "unavailable",
    mediumId: "unavailable",
    inclusionId: "unavailable",
    absorbed: "unavailable",
    escaped: "unavailable",
    rejected: "unavailable",
    unresolved: "unavailable",
    shadowCoverage: "backend-specific",
    emittedFlux: "unavailable",
    deliveredFlux: "unavailable",
    absorbedFlux: "unavailable",
    capturedRadiance: "ambiguous",
    sampleWeight: "backend-specific",
  }),
});

export const BODY_CAPABILITY_DESCRIPTOR = bodyCapabilityDescriptor;

export function opticalEventFromReceiverObservation(
  observation: ReceiverSampleObservation,
): OpticalEvent {
  return observation.backend === "cpu-receiver"
    ? adaptCpuReceiverObservation(observation)
    : adaptGpuReceiverObservation(observation);
}

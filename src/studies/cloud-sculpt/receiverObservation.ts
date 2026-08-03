import {
  observed,
  receiverFluxRgb,
  unavailable,
  type Observed,
  type ReceiverFluxRgb,
  type SourceBackend,
} from "./opticalEvents.ts";
import {
  FRAME_TRANSPORT_LEDGER_CONTRACT_VERSION,
  type FrameTransportLedger,
  type ReceiverLedgerScope,
} from "./frameTransportLedger.ts";
import type { EnergyLedger, FluxRgb, ReceiverTransportField } from "./receiverTransport.ts";

/** Reasons are intentionally additive to (and independent from) the R0.5 event taxonomy. */
export const RECEIVER_UNRESOLVED_REASONS = Object.freeze([
  "no-host-entry",
  "receiver-miss",
  "entry-tir-terminal",
  "exit-tir-terminal",
  "invalid-number",
  "gpu-combined-attenuation-only",
  "nested-path-not-represented",
] as const);

export type ReceiverUnresolvedReason = (typeof RECEIVER_UNRESOLVED_REASONS)[number];

export type ReceiverOutcome = "receiver-hit" | "absorbed" | "escaped" | "rejected" | "unresolved";

export interface ReceiverOutcomeCounts {
  readonly sampleCount: number;
  readonly receiverHit: number;
  readonly absorbed: number;
  readonly escaped: number;
  readonly rejected: number;
  readonly unresolved: number;
  readonly unresolvedReasons: Readonly<Record<ReceiverUnresolvedReason, number>>;
  /** Alias kept explicit for reports that call this quantity reasonCounts. */
  readonly reasonCounts: Readonly<Record<ReceiverUnresolvedReason, number>>;
  readonly details: Readonly<Record<ReceiverUnresolvedReason, number>>;
  readonly noHostEntry: number;
  readonly receiverMiss: number;
  readonly entryTirTerminal: number;
  readonly exitTirTerminal: number;
  readonly invalidNumber: number;
  readonly gpuCombinedAttenuationOnly: number;
  readonly nestedPathNotRepresented: number;
}

export interface ReceiverObservationRgbSums {
  readonly entered: FluxRgb;
  readonly deposited: FluxRgb;
  readonly absorbed: FluxRgb;
  readonly interfaceLoss: FluxRgb;
  readonly combinedAttenuation: FluxRgb;
  readonly escaped: FluxRgb;
  readonly reflected: FluxRgb;
  readonly rejected: FluxRgb;
  readonly unresolved: FluxRgb;
  readonly unknownAttenuation: FluxRgb;
}

export interface ReceiverObservationCentroid {
  readonly u: number | null;
  readonly v: number | null;
  readonly weight: number;
}

export interface ReceiverObservationEnvelope {
  readonly minU: number | null;
  readonly maxU: number | null;
  readonly minV: number | null;
  readonly maxV: number | null;
}

/**
 * The immutable, aggregate-only result of one receiver computation.  No
 * sample/event arrays are retained: all quantities are running RGB/scalar
 * sums, counts, centroid accumulators, min/max bounds, and reason counts.
 */
export interface ReceiverObservationFrame {
  readonly contractVersion: "hikari-receiver-observation/1";
  readonly frameId: number;
  readonly sourceBackend: Extract<SourceBackend, "cpu-receiver" | "webgpu-receiver">;
  readonly backend: Extract<SourceBackend, "cpu-receiver" | "webgpu-receiver">;
  readonly receiverId: string;
  readonly sceneRevision: string;
  readonly lightRevision: string;
  readonly sampleCount: number;
  readonly outcomeCounts: ReceiverOutcomeCounts;
  readonly rgb: ReceiverObservationRgbSums;
  readonly enteredFluxRgb: FluxRgb;
  readonly depositedFluxRgb: FluxRgb;
  readonly absorbedFluxRgb: FluxRgb;
  readonly interfaceLossFluxRgb: FluxRgb;
  readonly combinedAttenuationFluxRgb: FluxRgb;
  readonly escapedFluxRgb: FluxRgb;
  readonly unresolvedFluxRgb: FluxRgb;
  readonly centroid: ReceiverObservationCentroid;
  readonly envelope: ReceiverObservationEnvelope;
  readonly attenuation: R1AttenuationObservation;
  readonly unresolvedFraction: number;
  readonly scope: ReceiverLedgerScope;
}

export interface R1AttenuationObservation {
  readonly absorbedFluxRgb: Observed<ReceiverFluxRgb>;
  readonly interfaceLossFluxRgb: Observed<ReceiverFluxRgb>;
  readonly combinedAttenuationFluxRgb: Observed<ReceiverFluxRgb>;
  readonly unknownAttenuationFluxRgb: Observed<ReceiverFluxRgb>;
}

export interface CpuOpticalPathStages {
  readonly enteredRgb: FluxRgb;
  readonly afterEntryInterfaceRgb: FluxRgb;
  readonly afterMediumRgb: FluxRgb;
  readonly afterExitInterfaceRgb: FluxRgb;
  readonly entryInterfaceLossRgb: FluxRgb;
  readonly absorbedRgb: FluxRgb;
  readonly exitInterfaceLossRgb: FluxRgb;
  readonly interfaceLossRgb: FluxRgb;
  readonly combinedAttenuationRgb: FluxRgb;
}

export interface CpuOpticalPathInput {
  readonly enteredRgb?: FluxRgb;
  readonly hostAbsorption: FluxRgb;
  readonly inclusionAbsorption: FluxRgb;
  readonly hostIor: number;
  readonly inclusionIor: number;
  readonly hostDistance: number;
  readonly inclusionDistance: number;
  readonly traversedInclusion: boolean;
  /** False for an outer-exit TIR terminal; no exit-interface loss is charged. */
  readonly exitResolved?: boolean;
}

export interface ReceiverObservationRecord {
  readonly outcome: ReceiverOutcome;
  readonly receiverUv?: readonly [number, number] | null;
  readonly deliveredFluxRgb?: FluxRgb | null;
  readonly enteredRgb?: FluxRgb | null;
  readonly attenuation?: Partial<CpuOpticalPathStages> | null;
  readonly combinedAttenuationRgb?: FluxRgb | null;
  readonly unknownAttenuationRgb?: FluxRgb | null;
  readonly sampleWeight?: number;
  readonly unresolvedReason?: ReceiverUnresolvedReason;
  /** Physical receiver-flux multiplier; defaults to sampleWeight for fixtures. */
  readonly fluxWeight?: number;
  readonly reflectedFluxRgb?: FluxRgb | null;
  readonly rejectedFluxRgb?: FluxRgb | null;
  readonly escapedFluxRgb?: FluxRgb | null;
}

export interface ReceiverObservationFluxFinalization {
  readonly depositedFluxRgb?: FluxRgb;
  readonly rejectedFluxRgb?: FluxRgb;
}

export interface ReceiverObservationCollectorOptions {
  readonly sourceBackend?: Extract<SourceBackend, "cpu-receiver" | "webgpu-receiver">;
  readonly receiverId?: string;
  readonly sceneRevision?: string;
  readonly lightRevision?: string;
}

const ZERO_RGB: FluxRgb = { r: 0, g: 0, b: 0 };

function rgb(value?: FluxRgb | null): FluxRgb {
  if (!value) return { ...ZERO_RGB };
  return {
    r: Number.isFinite(value.r) ? value.r : 0,
    g: Number.isFinite(value.g) ? value.g : 0,
    b: Number.isFinite(value.b) ? value.b : 0,
  };
}

function hasInvalidRgb(value?: FluxRgb | null): boolean {
  return !!value && (!Number.isFinite(value.r) || !Number.isFinite(value.g) || !Number.isFinite(value.b));
}

function addRgb(target: FluxRgb, value: FluxRgb, weight = 1): void {
  target.r += value.r * weight;
  target.g += value.g * weight;
  target.b += value.b * weight;
}

function maxDifferenceRgb(a: FluxRgb, b: FluxRgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

function interfaceTransmission(iorA: number, iorB: number): number {
  if (!Number.isFinite(iorA) || !Number.isFinite(iorB) || iorA <= 0 || iorB <= 0) return 1;
  const reflection = Math.pow((iorA - iorB) / (iorA + iorB), 2);
  return 1 - reflection;
}

/**
 * Split the values already used by the CPU receiver path.  The throughput
 * expression itself is kept in the same multiplication order as optics.ts;
 * this helper only names its intermediate stages and applies max(·, 0) to
 * reported differences.
 */
export function calculateCpuOpticalPathStages(input: CpuOpticalPathInput): CpuOpticalPathStages {
  const enteredRgb = rgb(input.enteredRgb ?? { r: 1, g: 1, b: 1 });
  const hostInterface = interfaceTransmission(1, input.hostIor);
  const inclusionInterface = input.traversedInclusion
    ? interfaceTransmission(input.hostIor, input.inclusionIor)
    : 1;
  const entryFactor = hostInterface * inclusionInterface * inclusionInterface;
  const afterEntryInterfaceRgb = {
    r: enteredRgb.r * entryFactor,
    g: enteredRgb.g * entryFactor,
    b: enteredRgb.b * entryFactor,
  };
  const safeHostDistance = Number.isFinite(input.hostDistance) ? Math.max(0, input.hostDistance) : 0;
  const safeInclusionDistance = input.traversedInclusion && Number.isFinite(input.inclusionDistance)
    ? Math.max(0, input.inclusionDistance)
    : 0;
  const afterMediumRgb = {
    r: afterEntryInterfaceRgb.r * Math.exp(
      -Math.max(0, Number.isFinite(input.hostAbsorption.r) ? input.hostAbsorption.r : 0) * safeHostDistance
      - Math.max(0, Number.isFinite(input.inclusionAbsorption.r) ? input.inclusionAbsorption.r : 0) * safeInclusionDistance,
    ),
    g: afterEntryInterfaceRgb.g * Math.exp(
      -Math.max(0, Number.isFinite(input.hostAbsorption.g) ? input.hostAbsorption.g : 0) * safeHostDistance
      - Math.max(0, Number.isFinite(input.inclusionAbsorption.g) ? input.inclusionAbsorption.g : 0) * safeInclusionDistance,
    ),
    b: afterEntryInterfaceRgb.b * Math.exp(
      -Math.max(0, Number.isFinite(input.hostAbsorption.b) ? input.hostAbsorption.b : 0) * safeHostDistance
      - Math.max(0, Number.isFinite(input.inclusionAbsorption.b) ? input.inclusionAbsorption.b : 0) * safeInclusionDistance,
    ),
  };
  const exitResolved = input.exitResolved !== false;
  const afterExitInterfaceRgb = exitResolved
    ? {
        r: afterMediumRgb.r * hostInterface,
        g: afterMediumRgb.g * hostInterface,
        b: afterMediumRgb.b * hostInterface,
      }
    : { ...afterMediumRgb };
  const entryInterfaceLossRgb = {
    r: Math.max(enteredRgb.r - afterEntryInterfaceRgb.r, 0),
    g: Math.max(enteredRgb.g - afterEntryInterfaceRgb.g, 0),
    b: Math.max(enteredRgb.b - afterEntryInterfaceRgb.b, 0),
  };
  const absorbedRgb = {
    r: Math.max(afterEntryInterfaceRgb.r - afterMediumRgb.r, 0),
    g: Math.max(afterEntryInterfaceRgb.g - afterMediumRgb.g, 0),
    b: Math.max(afterEntryInterfaceRgb.b - afterMediumRgb.b, 0),
  };
  const exitInterfaceLossRgb = exitResolved
    ? {
        r: Math.max(afterMediumRgb.r - afterExitInterfaceRgb.r, 0),
        g: Math.max(afterMediumRgb.g - afterExitInterfaceRgb.g, 0),
        b: Math.max(afterMediumRgb.b - afterExitInterfaceRgb.b, 0),
      }
    : { ...ZERO_RGB };
  const interfaceLossRgb = {
    r: entryInterfaceLossRgb.r + exitInterfaceLossRgb.r,
    g: entryInterfaceLossRgb.g + exitInterfaceLossRgb.g,
    b: entryInterfaceLossRgb.b + exitInterfaceLossRgb.b,
  };
  return {
    enteredRgb,
    afterEntryInterfaceRgb,
    afterMediumRgb,
    afterExitInterfaceRgb,
    entryInterfaceLossRgb,
    absorbedRgb,
    exitInterfaceLossRgb,
    interfaceLossRgb,
    combinedAttenuationRgb: {
      r: absorbedRgb.r + interfaceLossRgb.r,
      g: absorbedRgb.g + interfaceLossRgb.g,
      b: absorbedRgb.b + interfaceLossRgb.b,
    },
  };
}

/** Short aliases used by deterministic unit fixtures. */
export const splitCpuAttenuation = calculateCpuOpticalPathStages;
export const deriveCpuAttenuationSplit = calculateCpuOpticalPathStages;

function reasonCounts(): Record<ReceiverUnresolvedReason, number> {
  return {
    "no-host-entry": 0,
    "receiver-miss": 0,
    "entry-tir-terminal": 0,
    "exit-tir-terminal": 0,
    "invalid-number": 0,
    "gpu-combined-attenuation-only": 0,
    "nested-path-not-represented": 0,
  };
}

function initialRgbSums(): Record<keyof ReceiverObservationRgbSums, FluxRgb> {
  return {
    entered: { ...ZERO_RGB },
    deposited: { ...ZERO_RGB },
    absorbed: { ...ZERO_RGB },
    interfaceLoss: { ...ZERO_RGB },
    combinedAttenuation: { ...ZERO_RGB },
    escaped: { ...ZERO_RGB },
    reflected: { ...ZERO_RGB },
    rejected: { ...ZERO_RGB },
    unresolved: { ...ZERO_RGB },
    unknownAttenuation: { ...ZERO_RGB },
  };
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

function copyRgb(value: FluxRgb): FluxRgb {
  return { r: value.r, g: value.g, b: value.b };
}

function asFiniteWeight(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 1 : Math.max(0, value);
}

export class ReceiverObservationCollector {
  private lifecycle: "idle" | "recording" | "sealed" = "idle";
  private frameId = 0;
  private sourceBackend: Extract<SourceBackend, "cpu-receiver" | "webgpu-receiver"> = "cpu-receiver";
  private receiverId = "receiver";
  private sceneRevision = "scene";
  private lightRevision = "light";
  private sampleCount = 0;
  private counts = {
    receiverHit: 0,
    absorbed: 0,
    escaped: 0,
    rejected: 0,
    unresolved: 0,
  };
  private reasons = reasonCounts();
  private sums = initialRgbSums();
  private centroidU = 0;
  private centroidV = 0;
  private centroidWeight = 0;
  private minU = Number.POSITIVE_INFINITY;
  private maxU = Number.NEGATIVE_INFINITY;
  private minV = Number.POSITIVE_INFINITY;
  private maxV = Number.NEGATIVE_INFINITY;

  constructor(options: ReceiverObservationCollectorOptions = {}) {
    this.configure(options);
  }

  configure(options: ReceiverObservationCollectorOptions = {}): this {
    if (this.lifecycle === "recording") throw new Error("Cannot configure an active receiver observation frame");
    if (options.sourceBackend) this.sourceBackend = options.sourceBackend;
    if (options.receiverId !== undefined) this.receiverId = options.receiverId;
    if (options.sceneRevision !== undefined) this.sceneRevision = options.sceneRevision;
    if (options.lightRevision !== undefined) this.lightRevision = options.lightRevision;
    return this;
  }

  reset(frameId: number, options: ReceiverObservationCollectorOptions = {}): void {
    if (!Number.isInteger(frameId) || frameId < 0) throw new RangeError("Receiver observation frameId must be a non-negative integer");
    this.configure(options);
    this.frameId = frameId;
    this.lifecycle = "recording";
    this.sampleCount = 0;
    this.counts = { receiverHit: 0, absorbed: 0, escaped: 0, rejected: 0, unresolved: 0 };
    this.reasons = reasonCounts();
    this.sums = initialRgbSums();
    this.centroidU = 0;
    this.centroidV = 0;
    this.centroidWeight = 0;
    this.minU = Number.POSITIVE_INFINITY;
    this.maxU = Number.NEGATIVE_INFINITY;
    this.minV = Number.POSITIVE_INFINITY;
    this.maxV = Number.NEGATIVE_INFINITY;
  }

  private assertRecording(): void {
    if (this.lifecycle !== "recording") throw new Error("Receiver observation collector must be reset before recording");
  }

  record(record: ReceiverObservationRecord): void {
    this.assertRecording();
    if (!record || typeof record !== "object") throw new TypeError("Receiver observation record is required");
    const weight = asFiniteWeight(record.sampleWeight);
    const fluxWeight = asFiniteWeight(record.fluxWeight ?? weight);
    const invalidNumber = hasInvalidRgb(record.enteredRgb)
      || hasInvalidRgb(record.deliveredFluxRgb)
      || hasInvalidRgb(record.combinedAttenuationRgb)
      || hasInvalidRgb(record.unknownAttenuationRgb)
      || hasInvalidRgb(record.reflectedFluxRgb)
      || hasInvalidRgb(record.rejectedFluxRgb)
      || hasInvalidRgb(record.escapedFluxRgb)
      || (record.sampleWeight !== undefined && !Number.isFinite(record.sampleWeight))
      || (record.fluxWeight !== undefined && !Number.isFinite(record.fluxWeight))
      || (record.attenuation !== undefined && !!record.attenuation && (
        hasInvalidRgb(record.attenuation.enteredRgb)
        || hasInvalidRgb(record.attenuation.afterEntryInterfaceRgb)
        || hasInvalidRgb(record.attenuation.afterMediumRgb)
        || hasInvalidRgb(record.attenuation.afterExitInterfaceRgb)
        || hasInvalidRgb(record.attenuation.entryInterfaceLossRgb)
        || hasInvalidRgb(record.attenuation.absorbedRgb)
        || hasInvalidRgb(record.attenuation.exitInterfaceLossRgb)
        || hasInvalidRgb(record.attenuation.interfaceLossRgb)
        || hasInvalidRgb(record.attenuation.combinedAttenuationRgb)
      ));
    this.sampleCount += weight;
    if (record.outcome === "receiver-hit") this.counts.receiverHit += weight;
    else if (record.outcome === "absorbed") this.counts.absorbed += weight;
    else if (record.outcome === "escaped") this.counts.escaped += weight;
    else if (record.outcome === "rejected") this.counts.rejected += weight;
    else if (record.outcome === "unresolved") this.counts.unresolved += weight;
    if (record.unresolvedReason) this.reasons[record.unresolvedReason] += weight;
    if (invalidNumber && record.unresolvedReason !== "invalid-number") this.reasons["invalid-number"] += weight;

    const entered = rgb(record.enteredRgb);
    addRgb(this.sums.entered, entered, fluxWeight);
    const delivered = rgb(record.deliveredFluxRgb);
    if (record.outcome === "receiver-hit") addRgb(this.sums.deposited, delivered, fluxWeight);
    if (record.attenuation) {
      const attenuation = record.attenuation;
      if (attenuation.absorbedRgb) addRgb(this.sums.absorbed, rgb(attenuation.absorbedRgb), fluxWeight);
      if (attenuation.interfaceLossRgb) addRgb(this.sums.interfaceLoss, rgb(attenuation.interfaceLossRgb), fluxWeight);
      if (attenuation.combinedAttenuationRgb) addRgb(this.sums.combinedAttenuation, rgb(attenuation.combinedAttenuationRgb), fluxWeight);
    }
    if (record.combinedAttenuationRgb) addRgb(this.sums.combinedAttenuation, rgb(record.combinedAttenuationRgb), fluxWeight);
    if (record.unknownAttenuationRgb) addRgb(this.sums.unknownAttenuation, rgb(record.unknownAttenuationRgb), fluxWeight);
    if (record.escapedFluxRgb) addRgb(this.sums.escaped, rgb(record.escapedFluxRgb), fluxWeight);
    if (record.reflectedFluxRgb) addRgb(this.sums.reflected, rgb(record.reflectedFluxRgb), fluxWeight);
    if (record.rejectedFluxRgb) addRgb(this.sums.rejected, rgb(record.rejectedFluxRgb), fluxWeight);
    if (record.outcome === "unresolved" && record.enteredRgb) addRgb(this.sums.unresolved, entered, fluxWeight);

    if (record.receiverUv && Number.isFinite(record.receiverUv[0]) && Number.isFinite(record.receiverUv[1])) {
      const [u, v] = record.receiverUv;
      const luminance = Math.max(
        0,
        delivered.r + delivered.g + delivered.b,
        entered.r + entered.g + entered.b,
      );
      const centroidWeight = fluxWeight * (luminance > 0 ? luminance : 1);
      this.centroidU += u * centroidWeight;
      this.centroidV += v * centroidWeight;
      this.centroidWeight += centroidWeight;
      this.minU = Math.min(this.minU, u);
      this.maxU = Math.max(this.maxU, u);
      this.minV = Math.min(this.minV, v);
      this.maxV = Math.max(this.maxV, v);
    }
  }

  recordSample(record: ReceiverObservationRecord): void { this.record(record); }

  recordOutcome(outcome: ReceiverOutcome, options: Omit<ReceiverObservationRecord, "outcome"> = {}): void {
    this.record({ ...options, outcome });
  }

  recordAttenuation(
    attenuation: Partial<CpuOpticalPathStages>,
    options: Omit<ReceiverObservationRecord, "attenuation"> = { outcome: "escaped" },
  ): void {
    this.record({ ...options, attenuation });
  }

  /**
   * Replace the pre-reconstruction deposit sum with the completed field's
   * already-integrated value and add support rejection exactly once. This
   * consumes aggregate diagnostics only; it never rereads field texels.
   */
  finalizeFluxTotals(values: ReceiverObservationFluxFinalization): void {
    this.assertRecording();
    if (values.depositedFluxRgb) this.sums.deposited = rgb(values.depositedFluxRgb);
    if (values.rejectedFluxRgb) addRgb(this.sums.rejected, rgb(values.rejectedFluxRgb));
  }

  seal(): ReceiverObservationFrame {
    this.assertRecording();
    this.lifecycle = "sealed";
    const reasons = { ...this.reasons };
    const outcomeCounts: ReceiverOutcomeCounts = {
      sampleCount: this.sampleCount,
      ...this.counts,
      unresolvedReasons: reasons,
      reasonCounts: reasons,
      details: reasons,
      noHostEntry: reasons["no-host-entry"],
      receiverMiss: reasons["receiver-miss"],
      entryTirTerminal: reasons["entry-tir-terminal"],
      exitTirTerminal: reasons["exit-tir-terminal"],
      invalidNumber: reasons["invalid-number"],
      gpuCombinedAttenuationOnly: reasons["gpu-combined-attenuation-only"],
      nestedPathNotRepresented: reasons["nested-path-not-represented"],
    };
    const entered = copyRgb(this.sums.entered);
    const unresolvedFraction = this.sampleCount > 0 ? this.counts.unresolved / this.sampleCount : 0;
    const frame: ReceiverObservationFrame = {
      contractVersion: "hikari-receiver-observation/1",
      frameId: this.frameId,
      sourceBackend: this.sourceBackend,
      backend: this.sourceBackend,
      receiverId: this.receiverId,
      sceneRevision: this.sceneRevision,
      lightRevision: this.lightRevision,
      sampleCount: this.sampleCount,
      outcomeCounts,
      rgb: {
        entered,
        deposited: copyRgb(this.sums.deposited),
        absorbed: copyRgb(this.sums.absorbed),
        interfaceLoss: copyRgb(this.sums.interfaceLoss),
        combinedAttenuation: copyRgb(this.sums.combinedAttenuation),
        escaped: copyRgb(this.sums.escaped),
        reflected: copyRgb(this.sums.reflected),
        rejected: copyRgb(this.sums.rejected),
        unresolved: copyRgb(this.sums.unresolved),
        unknownAttenuation: copyRgb(this.sums.unknownAttenuation),
      },
      enteredFluxRgb: copyRgb(this.sums.entered),
      depositedFluxRgb: copyRgb(this.sums.deposited),
      absorbedFluxRgb: copyRgb(this.sums.absorbed),
      interfaceLossFluxRgb: copyRgb(this.sums.interfaceLoss),
      combinedAttenuationFluxRgb: copyRgb(this.sums.combinedAttenuation),
      escapedFluxRgb: copyRgb(this.sums.escaped),
      unresolvedFluxRgb: copyRgb(this.sums.unresolved),
      centroid: {
        u: this.centroidWeight > 0 ? this.centroidU / this.centroidWeight : null,
        v: this.centroidWeight > 0 ? this.centroidV / this.centroidWeight : null,
        weight: this.centroidWeight,
      },
      envelope: {
        minU: Number.isFinite(this.minU) ? this.minU : null,
        maxU: Number.isFinite(this.maxU) ? this.maxU : null,
        minV: Number.isFinite(this.minV) ? this.minV : null,
        maxV: Number.isFinite(this.maxV) ? this.maxV : null,
      },
      attenuation: {
        absorbedFluxRgb: this.sourceBackend === "cpu-receiver"
          ? observed(receiverFluxRgb(this.sums.absorbed), "exact", "backend-branch")
          : ({
              state: "ambiguous",
              reason: "The existing 28-float WebGPU payload contains combined attenuation only.",
              candidates: ["Beer-Lambert absorption", "interface loss"],
            } as const),
        interfaceLossFluxRgb: this.sourceBackend === "cpu-receiver"
          ? observed(receiverFluxRgb(this.sums.interfaceLoss), "exact", "backend-branch")
          : ({
              state: "ambiguous",
              reason: "The existing 28-float WebGPU payload contains combined attenuation only.",
              candidates: ["Beer-Lambert absorption", "interface loss"],
            } as const),
        combinedAttenuationFluxRgb: observed(receiverFluxRgb(this.sums.combinedAttenuation), "exact", "lossless-derivation"),
        unknownAttenuationFluxRgb: this.sourceBackend === "cpu-receiver"
          ? observed(receiverFluxRgb(this.sums.unknownAttenuation), "exact", "lossless-derivation")
          : observed(receiverFluxRgb(this.sums.unknownAttenuation), "bounded", "backend-branch"),
      },
      unresolvedFraction,
      scope: {
        kind: "affected-baseline-in-fixed-receiver-domain",
        receiverId: this.receiverId,
        sceneRevision: this.sceneRevision,
        lightRevision: this.lightRevision,
      },
    };
    return freezeDeep(frame);
  }

  get state(): "idle" | "recording" | "sealed" { return this.lifecycle; }
}

export interface R1FrameLedgerOptions {
  readonly frame?: ReceiverObservationFrame;
  readonly field?: ReceiverTransportField;
  readonly energyLedger?: EnergyLedger;
  readonly scope?: ReceiverLedgerScope;
  readonly rejectedFluxRgb?: FluxRgb;
  readonly escapedFluxRgb?: FluxRgb;
  readonly unresolvedFluxRgb?: FluxRgb;
  readonly receiverId?: string;
  readonly sceneRevision?: string;
  readonly lightRevision?: string;
}

function resolveFrame(
  frameOrOptions: ReceiverObservationFrame | R1FrameLedgerOptions,
): { frame: ReceiverObservationFrame; options: R1FrameLedgerOptions } {
  if ("contractVersion" in frameOrOptions && frameOrOptions.contractVersion === "hikari-receiver-observation/1") {
    return { frame: frameOrOptions, options: {} };
  }
  const options = frameOrOptions as R1FrameLedgerOptions;
  if (!options.frame) throw new TypeError("R1 frame ledger builder requires a sealed observation frame");
  return { frame: options.frame, options };
}

function combineRgb(a: FluxRgb, b: FluxRgb): FluxRgb {
  return { r: a.r + b.r, g: a.g + b.g, b: a.b + b.b };
}

function ledgerObserved(value: FluxRgb): Observed<ReceiverFluxRgb> {
  return observed(receiverFluxRgb(value), "exact", "lossless-derivation");
}

function makeLedger(
  frame: ReceiverObservationFrame,
  sourceBackend: Extract<SourceBackend, "cpu-receiver" | "webgpu-receiver">,
  options: R1FrameLedgerOptions,
): FrameTransportLedger {
  const rejected = options.rejectedFluxRgb ?? frame.rgb.rejected;
  const unresolved = options.unresolvedFluxRgb ?? frame.rgb.unresolved;
  const interfaceLoss = frame.rgb.interfaceLoss;
  const escaped = combineRgb(
    options.escapedFluxRgb ?? frame.rgb.escaped,
    interfaceLoss,
  );
  const scope = options.scope ?? frame.scope;
  const absorbed = sourceBackend === "cpu-receiver"
    ? ledgerObserved(frame.rgb.absorbed)
    : frame.attenuation.absorbedFluxRgb;
  return {
    contractVersion: FRAME_TRANSPORT_LEDGER_CONTRACT_VERSION,
    sourceBackend,
    receiver: {
      scope: { ...scope },
      emittedFluxRgb: ledgerObserved(frame.rgb.entered),
      deliveredFluxRgb: ledgerObserved(frame.rgb.deposited),
      absorbedFluxRgb: absorbed,
      escapedFluxRgb: ledgerObserved(escaped),
      rejectedFluxRgb: ledgerObserved(rejected),
      unresolvedFluxRgb: ledgerObserved(unresolved),
    },
    view: {
      capturedRadianceIntegralRgb: unavailable("not-emitted-by-backend"),
      sampleWeight: unavailable("not-emitted-by-backend"),
    },
  };
}

export function buildR1CpuFrameLedger(
  frameOrOptions: ReceiverObservationFrame | R1FrameLedgerOptions,
  additionalOptions: R1FrameLedgerOptions = {},
): FrameTransportLedger {
  const { frame, options } = resolveFrame(frameOrOptions);
  if (frame.sourceBackend !== "cpu-receiver") throw new TypeError("CPU frame ledger requires a CPU observation frame");
  return makeLedger(frame, "cpu-receiver", { ...options, ...additionalOptions });
}

export function buildR1GpuFrameLedger(
  frameOrOptions: ReceiverObservationFrame | R1FrameLedgerOptions,
  additionalOptions: R1FrameLedgerOptions = {},
): FrameTransportLedger {
  const { frame, options } = resolveFrame(frameOrOptions);
  if (frame.sourceBackend !== "webgpu-receiver") throw new TypeError("WebGPU frame ledger requires a WebGPU observation frame");
  return makeLedger(frame, "webgpu-receiver", { ...options, ...additionalOptions });
}

export interface ReceiverObservationParityMetrics {
  readonly sampleCount: { readonly cpu: number; readonly webgpu: number; readonly exact: boolean };
  readonly sampleCountExact: boolean;
  readonly normalizedOutcomeCountL1: number;
  readonly outcomeCountL1: number;
  readonly unresolvedFractionAbsoluteDifference: number;
  readonly unresolvedFractionDifference: number;
  readonly gates: {
    readonly sampleCount: boolean;
    readonly outcomeCount: boolean;
    readonly unresolvedFraction: boolean;
  };
  readonly pass: boolean;
}

const OUTCOME_KEYS: readonly ("receiverHit" | "absorbed" | "escaped" | "rejected" | "unresolved")[] = [
  "receiverHit", "absorbed", "escaped", "rejected", "unresolved",
];

export function compareReceiverObservationFrames(
  cpu: ReceiverObservationFrame,
  webgpu: ReceiverObservationFrame,
): ReceiverObservationParityMetrics {
  const cpuCount = cpu.sampleCount;
  const gpuCount = webgpu.sampleCount;
  const exact = cpuCount === gpuCount;
  const cpuDenominator = cpuCount > 0 ? cpuCount : 1;
  const gpuDenominator = gpuCount > 0 ? gpuCount : 1;
  let l1 = 0;
  for (const key of OUTCOME_KEYS) {
    l1 += Math.abs(cpu.outcomeCounts[key] / cpuDenominator - webgpu.outcomeCounts[key] / gpuDenominator);
  }
  const unresolvedFractionAbsoluteDifference = Math.abs(cpu.unresolvedFraction - webgpu.unresolvedFraction);
  const gates = {
    sampleCount: exact,
    outcomeCount: l1 <= 0.05,
    unresolvedFraction: unresolvedFractionAbsoluteDifference <= 0.01,
  } as const;
  return {
    sampleCount: { cpu: cpuCount, webgpu: gpuCount, exact },
    sampleCountExact: exact,
    normalizedOutcomeCountL1: l1,
    outcomeCountL1: l1,
    unresolvedFractionAbsoluteDifference,
    unresolvedFractionDifference: unresolvedFractionAbsoluteDifference,
    gates,
    pass: Object.values(gates).every(Boolean),
  };
}

export interface ReceiverUnresolvedClassificationInput {
  readonly entryValid?: boolean;
  readonly exitValid?: boolean;
  readonly outgoingValid?: boolean;
  readonly baselineValid?: boolean;
  readonly receiverHit?: boolean;
  readonly receiverInDomain?: boolean;
  readonly entryTir?: boolean;
  readonly exitTir?: boolean;
  readonly nestedPathUnresolved?: boolean;
  readonly invalidNumber?: boolean;
  readonly gpuCombinedAttenuationOnly?: boolean;
}

/** Classify only when the branch evidence supports a reason; never call boundary exhaustion TIR. */
export function classifyReceiverUnresolvedReason(
  input: ReceiverUnresolvedClassificationInput,
): ReceiverUnresolvedReason | undefined {
  if (input.invalidNumber) return "invalid-number";
  if (input.gpuCombinedAttenuationOnly) return "gpu-combined-attenuation-only";
  if (input.entryTir) return "entry-tir-terminal";
  if (input.exitTir) return "exit-tir-terminal";
  if (input.nestedPathUnresolved) return "nested-path-not-represented";
  if (input.entryValid === false) return "no-host-entry";
  if (input.baselineValid === false || input.receiverInDomain === false || input.receiverHit === false) return "receiver-miss";
  if (input.exitValid === false) return "nested-path-not-represented";
  if (input.outgoingValid === false && input.exitValid) return "exit-tir-terminal";
  return undefined;
}

export function receiverFrameToR1Attenuation(frame: ReceiverObservationFrame): R1AttenuationObservation {
  return frame.attenuation;
}

/** Ensure a deterministic field/ledger report has finite aggregate values. */
export function isReceiverObservationFrameFinite(frame: ReceiverObservationFrame): boolean {
  const values = [
    frame.frameId,
    frame.sampleCount,
    frame.unresolvedFraction,
    frame.centroid.weight,
    frame.centroid.u ?? 0,
    frame.centroid.v ?? 0,
    ...Object.values(frame.rgb).flatMap((value) => [value.r, value.g, value.b]),
    ...Object.values(frame.outcomeCounts).filter((value): value is number => typeof value === "number"),
  ];
  return values.every(Number.isFinite)
    && maxDifferenceRgb(frame.rgb.entered, frame.rgb.entered) === 0;
}

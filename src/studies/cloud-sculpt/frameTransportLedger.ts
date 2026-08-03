import type { EnergyLedger, FluxRgb } from "./receiverTransport.ts";
import {
  OPTICAL_EVENT_CONTRACT_VERSION,
  observed,
  receiverFluxRgb,
  unavailable,
  type Observed,
  type ReceiverFluxRgb,
  type SourceBackend,
  type ViewRadianceRgb,
} from "./opticalEvents.ts";

export const FRAME_TRANSPORT_LEDGER_CONTRACT_VERSION = "hikari-frame-transport-ledger/0.5" as const;

export interface ReceiverLedgerScope {
  kind: "affected-baseline-in-fixed-receiver-domain";
  receiverId: string;
  sceneRevision: string;
  lightRevision: string;
}

export interface FrameTransportLedger {
  contractVersion: typeof FRAME_TRANSPORT_LEDGER_CONTRACT_VERSION;
  sourceBackend: SourceBackend;
  receiver: {
    scope: ReceiverLedgerScope;
    emittedFluxRgb: Observed<ReceiverFluxRgb>;
    deliveredFluxRgb: Observed<ReceiverFluxRgb>;
    absorbedFluxRgb: Observed<ReceiverFluxRgb>;
    escapedFluxRgb: Observed<ReceiverFluxRgb>;
    rejectedFluxRgb: Observed<ReceiverFluxRgb>;
    unresolvedFluxRgb: Observed<ReceiverFluxRgb>;
  };
  view: {
    capturedRadianceIntegralRgb: Observed<ViewRadianceRgb>;
    sampleWeight: Observed<number>;
  };
}

export interface ReceiverClosureResult {
  status: "closed" | "open" | "not-computable";
  residualRgb: Observed<ReceiverFluxRgb>;
  relativeResidual: Observed<number>;
  tolerance: number;
  issues: readonly string[];
}

export interface CurrentEnergyLedgerAdapterOptions {
  sourceBackend: SourceBackend;
  scope: ReceiverLedgerScope;
  capturedRadianceIntegralRgb?: Observed<ViewRadianceRgb>;
  sampleWeight?: Observed<number>;
}

const ABSORBED_IS_MIXED: Observed<ReceiverFluxRgb> = {
  state: "ambiguous",
  reason: "Current materialInterfaceLossRgb combines Beer-Lambert absorption and interface loss; pure absorbed flux is not available.",
  candidates: ["material absorption", "Fresnel/interface loss"],
};

function availableFlux(value: FluxRgb): Observed<ReceiverFluxRgb> {
  return observed(receiverFluxRgb(value), "exact", "lossless-derivation");
}

function addRgb(a: ReceiverFluxRgb, b: ReceiverFluxRgb): ReceiverFluxRgb {
  return receiverFluxRgb({ r: a.r + b.r, g: a.g + b.g, b: a.b + b.b });
}

function makeOptions(
  sourceBackendOrOptions: SourceBackend | CurrentEnergyLedgerAdapterOptions,
  scope?: ReceiverLedgerScope,
): CurrentEnergyLedgerAdapterOptions {
  if (typeof sourceBackendOrOptions === "string") {
    if (!scope) throw new TypeError("Receiver ledger scope is required");
    return { sourceBackend: sourceBackendOrOptions, scope };
  }
  return sourceBackendOrOptions;
}

/**
 * Adapt the existing EnergyLedger without changing its names or semantics.
 * `reflectedRgb` and `escapedRgb` become one contract escaped bucket exactly
 * once; the current mixed loss remains ambiguous instead of being relabelled.
 */
export function adaptCurrentEnergyLedger(
  energyLedger: EnergyLedger,
  options: CurrentEnergyLedgerAdapterOptions,
): FrameTransportLedger;
export function adaptCurrentEnergyLedger(
  energyLedger: EnergyLedger,
  sourceBackend: SourceBackend,
  scope: ReceiverLedgerScope,
): FrameTransportLedger;
export function adaptCurrentEnergyLedger(
  energyLedger: EnergyLedger,
  sourceBackendOrOptions: SourceBackend | CurrentEnergyLedgerAdapterOptions,
  scope?: ReceiverLedgerScope,
): FrameTransportLedger {
  const options = makeOptions(sourceBackendOrOptions, scope);
  const ledger = energyLedger;
  const escaped = addRgb(
    receiverFluxRgb(ledger.reflectedRgb),
    receiverFluxRgb(ledger.escapedRgb),
  );
  return {
    contractVersion: "hikari-frame-transport-ledger/0.5",
    sourceBackend: options.sourceBackend,
    receiver: {
      scope: { ...options.scope },
      emittedFluxRgb: availableFlux(ledger.incidentRgb),
      deliveredFluxRgb: availableFlux(ledger.depositedRgb),
      absorbedFluxRgb: ABSORBED_IS_MIXED,
      escapedFluxRgb: availableFlux(escaped),
      rejectedFluxRgb: availableFlux(ledger.supportRejectedRgb),
      unresolvedFluxRgb: availableFlux(ledger.unresolvedLossRgb),
    },
    view: {
      capturedRadianceIntegralRgb: options.capturedRadianceIntegralRgb
        ?? unavailable("not-emitted-by-backend"),
      sampleWeight: options.sampleWeight ?? unavailable("not-emitted-by-backend"),
    },
  };
}

function closureTolerance(sourceBackend: SourceBackend): number {
  if (sourceBackend === "cpu-receiver") return 0.01;
  if (sourceBackend === "webgpu-receiver") return 0.05;
  return 0;
}

function availableValues(
  ledger: FrameTransportLedger,
):
  | {
      emitted: ReceiverFluxRgb;
      delivered: ReceiverFluxRgb;
      absorbed: ReceiverFluxRgb;
      escaped: ReceiverFluxRgb;
      rejected: ReceiverFluxRgb;
      unresolved: ReceiverFluxRgb;
    }
  | undefined {
  const values = [
    ledger.receiver.emittedFluxRgb,
    ledger.receiver.deliveredFluxRgb,
    ledger.receiver.absorbedFluxRgb,
    ledger.receiver.escapedFluxRgb,
    ledger.receiver.rejectedFluxRgb,
    ledger.receiver.unresolvedFluxRgb,
  ] as const;
  const [emitted, delivered, absorbed, escaped, rejected, unresolved] = values;
  if (
    emitted.state !== "available"
    || delivered.state !== "available"
    || absorbed.state !== "available"
    || escaped.state !== "available"
    || rejected.state !== "available"
    || unresolved.state !== "available"
  ) return undefined;
  return {
    emitted: emitted.value,
    delivered: delivered.value,
    absorbed: absorbed.value,
    escaped: escaped.value,
    rejected: rejected.value,
    unresolved: unresolved.value,
  };
}

function fluxSum(...values: readonly ReceiverFluxRgb[]): ReceiverFluxRgb {
  return receiverFluxRgb(values.reduce(
    (sum, value) => ({ r: sum.r + value.r, g: sum.g + value.g, b: sum.b + value.b }),
    { r: 0, g: 0, b: 0 },
  ));
}

function fluxDifference(a: ReceiverFluxRgb, b: ReceiverFluxRgb): ReceiverFluxRgb {
  // A residual is a signed diagnostic quantity even though its unit is still
  // receiver flux. It must not go through receiverFluxRgb(), which correctly
  // rejects negative *observed input* flux.
  return { r: a.r - b.r, g: a.g - b.g, b: a.b - b.b } as ReceiverFluxRgb;
}

function relativeFlux(value: ReceiverFluxRgb, emitted: ReceiverFluxRgb): number {
  const denominator = Math.max(emitted.r, emitted.g, emitted.b, 1e-12);
  return Math.max(Math.abs(value.r), Math.abs(value.g), Math.abs(value.b)) / denominator;
}

function isExactZeroFlux(value: ReceiverFluxRgb): boolean {
  return value.r === 0 && value.g === 0 && value.b === 0;
}

/** Evaluate only a Receiver ledger. View radiance and BODY are out of scope. */
export function evaluateReceiverClosure(ledger: FrameTransportLedger): ReceiverClosureResult {
  const tolerance = closureTolerance(ledger.sourceBackend);
  if (ledger.sourceBackend === "body-webgl" || ledger.receiver.scope.kind !== "affected-baseline-in-fixed-receiver-domain") {
    return {
      status: "not-computable",
      residualRgb: unavailable("unsupported-path"),
      relativeResidual: unavailable("unsupported-path"),
      tolerance,
      issues: ["Receiver closure is not computable for the BODY/view domain or an unsupported scope."],
    };
  }
  const values = availableValues(ledger);
  if (!values) {
    const unavailableFields = [
      ["emittedFluxRgb", ledger.receiver.emittedFluxRgb],
      ["deliveredFluxRgb", ledger.receiver.deliveredFluxRgb],
      ["absorbedFluxRgb", ledger.receiver.absorbedFluxRgb],
      ["escapedFluxRgb", ledger.receiver.escapedFluxRgb],
      ["rejectedFluxRgb", ledger.receiver.rejectedFluxRgb],
      ["unresolvedFluxRgb", ledger.receiver.unresolvedFluxRgb],
    ] as const;
    const issues = unavailableFields
      .filter(([, value]) => value.state !== "available")
      .map(([name, value]) => `${name} is ${value.state}`);
    return {
      status: "not-computable",
      residualRgb: unavailable("diagnostic-disabled"),
      relativeResidual: unavailable("diagnostic-disabled"),
      tolerance,
      issues,
    };
  }
  const accounted = fluxSum(
    values.delivered,
    values.absorbed,
    values.escaped,
    values.rejected,
    values.unresolved,
  );
  const residual = fluxDifference(values.emitted, accounted);
  const emittedIsZero = isExactZeroFlux(values.emitted);
  const accountedIsZero = isExactZeroFlux(accounted);
  const relativeResidual = emittedIsZero
    ? accountedIsZero ? 0 : Number.POSITIVE_INFINITY
    : relativeFlux(residual, values.emitted);
  const unresolvedRelative = emittedIsZero
    ? isExactZeroFlux(values.unresolved) ? 0 : Number.POSITIVE_INFINITY
    : relativeFlux(values.unresolved, values.emitted);
  const issues: string[] = [];
  if (emittedIsZero) {
    if (!accountedIsZero) issues.push("zero emitted flux has non-zero accounted receiver flux");
    if (!isExactZeroFlux(values.unresolved)) issues.push("zero emitted flux has non-zero unresolved flux");
  } else {
    if (relativeResidual > tolerance) issues.push(`relative residual ${relativeResidual} exceeds tolerance ${tolerance}`);
    if (unresolvedRelative > tolerance) issues.push(`unresolved flux ratio ${unresolvedRelative} exceeds tolerance ${tolerance}`);
  }
  return {
    status: issues.length === 0 ? "closed" : "open",
    residualRgb: observed(residual, "exact", "lossless-derivation"),
    relativeResidual: observed(relativeResidual, "exact", "lossless-derivation"),
    tolerance,
    issues,
  };
}

// Keep the contract import visible to type-aware consumers without coupling the
// current ledger to the event module's runtime implementation.
export const FRAME_TRANSPORT_EVENT_CONTRACT_VERSION = OPTICAL_EVENT_CONTRACT_VERSION;

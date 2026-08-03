import type { Rgb, Vec3 } from "./opticalScene.ts";

/** The version is intentionally independent from the Hikari application version. */
export const OPTICAL_EVENT_CONTRACT_VERSION = "hikari-optical-event/0.5" as const;

export type TransportDomain = "view" | "receiver";
export type SourceBackend = "body-webgl" | "cpu-receiver" | "webgpu-receiver";
export type CapabilityState =
  | "available"
  | "derivable without guessing"
  | "unavailable"
  | "ambiguous"
  | "backend-specific";

export type AcquisitionConfidence = "exact" | "bounded" | "approximate";
export type MissingReason =
  | "not-emitted-by-backend"
  | "mixed-in-final-output"
  | "unsupported-path"
  | "diagnostic-disabled"
  | "invalid-input"
  | "classification-not-unique";

export type Observed<T> =
  | {
      state: "available";
      value: T;
      confidence: AcquisitionConfidence;
      provenance: "backend-output" | "backend-branch" | "lossless-derivation";
    }
  | { state: "unavailable"; reason: MissingReason }
  | { state: "unknown"; reason: string }
  | { state: "ambiguous"; reason: string; candidates?: readonly string[] }
  | {
      state: "backend-specific";
      backend: SourceBackend;
      semantics: string;
      value?: T;
    };

declare const receiverFluxUnit: unique symbol;
declare const viewRadianceUnit: unique symbol;
export type ReceiverFluxRgb = Readonly<Rgb> & {
  readonly [receiverFluxUnit]: "receiver-flux";
};
export type ViewRadianceRgb = Readonly<Rgb> & {
  readonly [viewRadianceUnit]: "view-radiance";
};

export type ViewTerminalEvent = "surface-reflection" | "transmission";
export type ReceiverTerminalEvent = "receiver-hit";
export type DiagnosticTermination = "absorbed" | "escaped" | "rejected" | "unresolved";

export interface OpticalPathAttributes {
  internalBounceCount: Observed<number>;
  hadInternalReflection: Observed<boolean>;
  opticalPathLength: Observed<{
    shapeUnits: number;
    millimetres: number;
    scaleSource: "assumed" | "derived-from-mesh" | "author";
  }>;
  exitDirectionWorld: Observed<Vec3>;
  mediumIds: Observed<readonly string[]>;
  inclusionIds: Observed<readonly string[]>;
}

export interface EventIdentity {
  contractVersion: typeof OPTICAL_EVENT_CONTRACT_VERSION;
  sampleId: string;
  sceneRevision: string;
  lightRevision: string;
  sourceBackend: SourceBackend;
}

export type PathOutcome<TTerminal extends string> =
  | { kind: "terminal"; terminalEvent: Observed<TTerminal> }
  | { kind: "diagnostic"; termination: Observed<DiagnosticTermination> };

export interface ViewOpticalEvent extends EventIdentity {
  transportDomain: "view";
  outcome: PathOutcome<ViewTerminalEvent>;
  path: OpticalPathAttributes;
  capturedRadianceRgb: Observed<ViewRadianceRgb>;
  sampleWeight: Observed<number>;
}

export interface ReceiverOpticalEvent extends EventIdentity {
  transportDomain: "receiver";
  outcome: PathOutcome<ReceiverTerminalEvent>;
  path: OpticalPathAttributes;
  receiverId: Observed<string>;
  receiverUv: Observed<readonly [number, number]>;
  deliveredFluxRgb: Observed<ReceiverFluxRgb>;
  shadowCoverageWeight: Observed<number>;
  sampleWeight: Observed<number>;
}

export type OpticalEvent = ViewOpticalEvent | ReceiverOpticalEvent;

export type OpticalCapability =
  | "terminalEvent"
  | "surfaceReflection"
  | "transmission"
  | "receiverHit"
  | "internalBounceCount"
  | "hadInternalReflection"
  | "opticalPathLength"
  | "exitDirection"
  | "mediumId"
  | "inclusionId"
  | "absorbed"
  | "escaped"
  | "rejected"
  | "unresolved"
  | "shadowCoverage"
  | "emittedFlux"
  | "deliveredFlux"
  | "absorbedFlux"
  | "capturedRadiance"
  | "sampleWeight";

export interface BackendCapabilityDescriptor {
  backend: SourceBackend;
  domain: TransportDomain;
  capabilities: Readonly<Record<OpticalCapability, CapabilityState>>;
}

export function observed<T>(
  value: T,
  confidence: AcquisitionConfidence,
  provenance: "backend-output" | "backend-branch" | "lossless-derivation",
): Observed<T> {
  return { state: "available", value, confidence, provenance };
}

export function unavailable<T>(reason: MissingReason): Observed<T> {
  return { state: "unavailable", reason };
}

/** Brand a copy so callers cannot accidentally mix receiver flux with view radiance. */
export function receiverFluxRgb(value: Rgb): ReceiverFluxRgb {
  return { r: value.r, g: value.g, b: value.b } as ReceiverFluxRgb;
}

/** Brand a copy so callers cannot accidentally mix view radiance with receiver flux. */
export function viewRadianceRgb(value: Rgb): ViewRadianceRgb {
  return { r: value.r, g: value.g, b: value.b } as ViewRadianceRgb;
}

const BODY_CAPABILITIES: Readonly<Record<OpticalCapability, CapabilityState>> = {
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
};

const CPU_CAPABILITIES: Readonly<Record<OpticalCapability, CapabilityState>> = {
  terminalEvent: "derivable without guessing",
  surfaceReflection: "backend-specific",
  transmission: "derivable without guessing",
  receiverHit: "available",
  internalBounceCount: "unavailable",
  hadInternalReflection: "unavailable",
  opticalPathLength: "derivable without guessing",
  exitDirection: "derivable without guessing",
  mediumId: "backend-specific",
  inclusionId: "backend-specific",
  absorbed: "ambiguous",
  escaped: "available",
  rejected: "available",
  unresolved: "available",
  shadowCoverage: "available",
  emittedFlux: "derivable without guessing",
  deliveredFlux: "available",
  absorbedFlux: "ambiguous",
  capturedRadiance: "unavailable",
  sampleWeight: "available",
};

const WEBGPU_CAPABILITIES: Readonly<Record<OpticalCapability, CapabilityState>> = {
  terminalEvent: "ambiguous",
  surfaceReflection: "backend-specific",
  transmission: "derivable without guessing",
  receiverHit: "available",
  internalBounceCount: "unavailable",
  hadInternalReflection: "unavailable",
  opticalPathLength: "unavailable",
  exitDirection: "backend-specific",
  mediumId: "backend-specific",
  inclusionId: "unavailable",
  absorbed: "ambiguous",
  escaped: "available",
  rejected: "available",
  unresolved: "derivable without guessing",
  shadowCoverage: "available",
  emittedFlux: "derivable without guessing",
  deliveredFlux: "available",
  absorbedFlux: "ambiguous",
  capturedRadiance: "unavailable",
  sampleWeight: "available",
};

function descriptor(
  backend: SourceBackend,
  domain: TransportDomain,
  capabilities: Readonly<Record<OpticalCapability, CapabilityState>>,
): BackendCapabilityDescriptor {
  return Object.freeze({ backend, domain, capabilities: Object.freeze({ ...capabilities }) });
}

/** Capability matrix from the R0.5 handoff. It is data, not an inference from runtime pixels. */
export const CURRENT_OPTICAL_BACKEND_CAPABILITIES = Object.freeze([
  descriptor("body-webgl", "view", BODY_CAPABILITIES),
  descriptor("cpu-receiver", "receiver", CPU_CAPABILITIES),
  descriptor("webgpu-receiver", "receiver", WEBGPU_CAPABILITIES),
] as const);

function isSourceBackend(value: unknown): value is SourceBackend {
  return value === "body-webgl" || value === "cpu-receiver" || value === "webgpu-receiver";
}

function isMissingReason(value: unknown): value is MissingReason {
  return value === "not-emitted-by-backend"
    || value === "mixed-in-final-output"
    || value === "unsupported-path"
    || value === "diagnostic-disabled"
    || value === "invalid-input"
    || value === "classification-not-unique";
}

function isAcquisitionConfidence(value: unknown): value is AcquisitionConfidence {
  return value === "exact" || value === "bounded" || value === "approximate";
}

function isProvenance(value: unknown): value is "backend-output" | "backend-branch" | "lossless-derivation" {
  return value === "backend-output" || value === "backend-branch" || value === "lossless-derivation";
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isRgb(value: unknown): value is Rgb {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNonNegative(candidate.r)
    && isFiniteNonNegative(candidate.g)
    && isFiniteNonNegative(candidate.b);
}

function addIssue(issues: string[], condition: boolean, message: string): void {
  if (!condition) issues.push(message);
}

function observedState<T>(value: unknown): value is Observed<T> {
  if (!value || typeof value !== "object") return false;
  const state = (value as { state?: unknown }).state;
  return state === "available"
    || state === "unavailable"
    || state === "unknown"
    || state === "ambiguous"
    || state === "backend-specific";
}

function validateObservedShape(value: unknown, label: string, issues: string[]): void {
  if (!observedState<unknown>(value)) {
    issues.push(`${label} is not an Observed value`);
    return;
  }
  if (value.state === "available") {
    addIssue(issues, isAcquisitionConfidence(value.confidence), `${label}.confidence is invalid`);
    addIssue(issues, isProvenance(value.provenance), `${label}.provenance is invalid`);
  } else if (value.state === "unavailable") {
    addIssue(issues, isMissingReason(value.reason), `${label}.reason is invalid`);
  } else if (value.state === "unknown" || value.state === "ambiguous") {
    addIssue(issues, typeof value.reason === "string" && value.reason.length > 0, `${label}.reason is invalid`);
    if (value.state === "ambiguous" && value.candidates !== undefined) {
      addIssue(
        issues,
        Array.isArray(value.candidates) && value.candidates.every((candidate) => typeof candidate === "string"),
        `${label}.candidates is invalid`,
      );
    }
  } else {
    addIssue(issues, isSourceBackend(value.backend), `${label}.backend is invalid`);
    addIssue(issues, typeof value.semantics === "string" && value.semantics.length > 0, `${label}.semantics is invalid`);
  }
}

function validateAvailableRgbObserved(
  value: unknown,
  label: string,
  issues: string[],
): void {
  validateObservedShape(value, label, issues);
  if (!observedState<Readonly<Rgb>>(value)) return;
  if (value.state === "available") {
    addIssue(issues, isRgb(value.value), `${label}.value must be finite and non-negative RGB`);
  } else if (value.state === "backend-specific" && value.value !== undefined) {
    addIssue(issues, isRgb(value.value), `${label}.value must be finite and non-negative RGB`);
  }
}

function validatePath(path: OpticalPathAttributes | undefined, issues: string[]): void {
  if (!path || typeof path !== "object") {
    issues.push("path is invalid");
    return;
  }
  const internalBounceCount = (path as Partial<OpticalPathAttributes>).internalBounceCount as unknown;
  validateObservedShape(internalBounceCount, "path.internalBounceCount", issues);
  if (observedState<number>(internalBounceCount) && internalBounceCount.state === "available") {
    addIssue(
      issues,
      Number.isInteger(internalBounceCount.value) && internalBounceCount.value >= 0,
      "path.internalBounceCount.value must be a non-negative integer",
    );
  } else if (observedState<number>(internalBounceCount) && internalBounceCount.state === "backend-specific" && internalBounceCount.value !== undefined) {
    addIssue(
      issues,
      Number.isInteger(internalBounceCount.value) && internalBounceCount.value >= 0,
      "path.internalBounceCount.value must be a non-negative integer",
    );
  }
  const hadInternalReflection = (path as Partial<OpticalPathAttributes>).hadInternalReflection as unknown;
  validateObservedShape(hadInternalReflection, "path.hadInternalReflection", issues);
  if (observedState<boolean>(hadInternalReflection) && hadInternalReflection.state === "available") {
    addIssue(issues, typeof hadInternalReflection.value === "boolean", "path.hadInternalReflection.value must be boolean");
  } else if (observedState<boolean>(hadInternalReflection) && hadInternalReflection.state === "backend-specific" && hadInternalReflection.value !== undefined) {
    addIssue(issues, typeof hadInternalReflection.value === "boolean", "path.hadInternalReflection.value must be boolean");
  }
  if (
    observedState<number>(internalBounceCount)
    && internalBounceCount.state === "available"
    && observedState<boolean>(hadInternalReflection)
    && hadInternalReflection.state === "available"
  ) {
    addIssue(
      issues,
      hadInternalReflection.value === (internalBounceCount.value > 0),
      "path bounce count and hadInternalReflection disagree",
    );
  }

  const opticalPathLength = (path as Partial<OpticalPathAttributes>).opticalPathLength as unknown;
  validateObservedShape(opticalPathLength, "path.opticalPathLength", issues);
  if (observedState<unknown>(opticalPathLength) && opticalPathLength.state === "available") {
    const length = opticalPathLength.value;
    if (!isRecord(length)) {
      issues.push("path.opticalPathLength.value is invalid");
    } else {
      addIssue(issues, isFiniteNonNegative(length.shapeUnits), "path.opticalPathLength.shapeUnits must be finite and non-negative");
      addIssue(issues, isFiniteNonNegative(length.millimetres), "path.opticalPathLength.millimetres must be finite and non-negative");
      addIssue(
        issues,
        length.scaleSource === "assumed" || length.scaleSource === "derived-from-mesh" || length.scaleSource === "author",
        "path.opticalPathLength.scaleSource is invalid",
      );
    }
  } else if (observedState<unknown>(opticalPathLength) && opticalPathLength.state === "backend-specific" && opticalPathLength.value !== undefined) {
    const length = opticalPathLength.value;
    if (!isRecord(length)) {
      issues.push("path.opticalPathLength.value is invalid");
    } else {
      addIssue(issues, isFiniteNonNegative(length.shapeUnits), "path.opticalPathLength.shapeUnits must be finite and non-negative");
      addIssue(issues, isFiniteNonNegative(length.millimetres), "path.opticalPathLength.millimetres must be finite and non-negative");
      addIssue(
        issues,
        length.scaleSource === "assumed" || length.scaleSource === "derived-from-mesh" || length.scaleSource === "author",
        "path.opticalPathLength.scaleSource is invalid",
      );
    }
  }

  const exitDirectionWorld = (path as Partial<OpticalPathAttributes>).exitDirectionWorld as unknown;
  validateObservedShape(exitDirectionWorld, "path.exitDirectionWorld", issues);
  if (observedState<unknown>(exitDirectionWorld) && exitDirectionWorld.state === "available") {
    const direction = exitDirectionWorld.value;
    if (!isRecord(direction)) {
      issues.push("path.exitDirectionWorld.value is invalid");
    } else {
      addIssue(
        issues,
        isFiniteNumber(direction.x) && isFiniteNumber(direction.y) && isFiniteNumber(direction.z),
        "path.exitDirectionWorld.value must be finite",
      );
    }
  } else if (observedState<unknown>(exitDirectionWorld) && exitDirectionWorld.state === "backend-specific" && exitDirectionWorld.value !== undefined) {
    const direction = exitDirectionWorld.value;
    if (!isRecord(direction)) {
      issues.push("path.exitDirectionWorld.value is invalid");
    } else {
      addIssue(
        issues,
        isFiniteNumber(direction.x) && isFiniteNumber(direction.y) && isFiniteNumber(direction.z),
        "path.exitDirectionWorld.value must be finite",
      );
    }
  }

  const mediumIds = (path as Partial<OpticalPathAttributes>).mediumIds as unknown;
  validateObservedShape(mediumIds, "path.mediumIds", issues);
  if (observedState<unknown>(mediumIds) && mediumIds.state === "available") {
    addIssue(
      issues,
      Array.isArray(mediumIds.value) && mediumIds.value.every((id) => typeof id === "string" && id.length > 0),
      "path.mediumIds.value is invalid",
    );
  } else if (observedState<unknown>(mediumIds) && mediumIds.state === "backend-specific" && mediumIds.value !== undefined) {
    addIssue(
      issues,
      Array.isArray(mediumIds.value) && mediumIds.value.every((id) => typeof id === "string" && id.length > 0),
      "path.mediumIds.value is invalid",
    );
  }
  const inclusionIds = (path as Partial<OpticalPathAttributes>).inclusionIds as unknown;
  validateObservedShape(inclusionIds, "path.inclusionIds", issues);
  if (observedState<unknown>(inclusionIds) && inclusionIds.state === "available") {
    addIssue(
      issues,
      Array.isArray(inclusionIds.value) && inclusionIds.value.every((id) => typeof id === "string" && id.length > 0),
      "path.inclusionIds.value is invalid",
    );
  } else if (observedState<unknown>(inclusionIds) && inclusionIds.state === "backend-specific" && inclusionIds.value !== undefined) {
    addIssue(
      issues,
      Array.isArray(inclusionIds.value) && inclusionIds.value.every((id) => typeof id === "string" && id.length > 0),
      "path.inclusionIds.value is invalid",
    );
  }
}

function validateIdentity(event: OpticalEvent, issues: string[]): void {
  addIssue(issues, event.contractVersion === OPTICAL_EVENT_CONTRACT_VERSION, "contractVersion is invalid");
  addIssue(issues, typeof event.sampleId === "string" && event.sampleId.length > 0, "sampleId is invalid");
  addIssue(issues, typeof event.sceneRevision === "string" && event.sceneRevision.length > 0, "sceneRevision is invalid");
  addIssue(issues, typeof event.lightRevision === "string" && event.lightRevision.length > 0, "lightRevision is invalid");
  addIssue(issues, isSourceBackend(event.sourceBackend), "sourceBackend is invalid");
}

function validateOutcome(event: OpticalEvent, issues: string[]): void {
  if (!event.outcome || typeof event.outcome !== "object") {
    issues.push("outcome is invalid");
    return;
  }
  if (event.outcome.kind === "terminal") {
    validateObservedShape(event.outcome.terminalEvent, "outcome.terminalEvent", issues);
    if (
      observedState<string>(event.outcome.terminalEvent)
      && (event.outcome.terminalEvent.state === "available" || event.outcome.terminalEvent.state === "backend-specific")
      && (event.outcome.terminalEvent.state === "available" || event.outcome.terminalEvent.value !== undefined)
    ) {
      if (event.transportDomain === "view") {
        addIssue(
          issues,
          event.outcome.terminalEvent.value === "surface-reflection" || event.outcome.terminalEvent.value === "transmission",
          "view terminal event is invalid",
        );
      } else {
        addIssue(issues, event.outcome.terminalEvent.value === "receiver-hit", "receiver terminal event is invalid");
      }
    }
  } else if (event.outcome.kind === "diagnostic") {
    validateObservedShape(event.outcome.termination, "outcome.termination", issues);
    if (
      observedState<DiagnosticTermination>(event.outcome.termination)
      && (event.outcome.termination.state === "available" || event.outcome.termination.state === "backend-specific")
      && (event.outcome.termination.state === "available" || event.outcome.termination.value !== undefined)
    ) {
      addIssue(
        issues,
        event.outcome.termination.value === "absorbed"
          || event.outcome.termination.value === "escaped"
          || event.outcome.termination.value === "rejected"
          || event.outcome.termination.value === "unresolved",
        "diagnostic termination is invalid",
      );
    }
  } else {
    issues.push("outcome.kind is invalid");
  }
}

/**
 * Validate a contract event without coercing or filling missing values. An
 * empty tuple means the event satisfies all R0.5 invariants.
 */
export function validateOpticalEvent(event: OpticalEvent): readonly string[] {
  const issues: string[] = [];
  try {
    if (!event || typeof event !== "object") return ["event is invalid"];
    if (event.transportDomain !== "view" && event.transportDomain !== "receiver") {
      issues.push("transportDomain is invalid");
      return issues;
    }
    validateIdentity(event, issues);
    validateOutcome(event, issues);
    validatePath(event.path, issues);

    if (event.transportDomain === "view") {
      if ("deliveredFluxRgb" in event || "receiverId" in event || "receiverUv" in event) {
        issues.push("view event must not carry receiver fields");
      }
      validateAvailableRgbObserved(event.capturedRadianceRgb, "capturedRadianceRgb", issues);
      validateObservedShape(event.sampleWeight, "sampleWeight", issues);
      if (observedState<number>(event.sampleWeight) && event.sampleWeight.state === "available") {
        addIssue(issues, isFiniteNonNegative(event.sampleWeight.value), "sampleWeight.value must be finite and non-negative");
      }
    } else {
      if ("capturedRadianceRgb" in event) issues.push("receiver event must not carry captured radiance");
      validateObservedShape(event.receiverId, "receiverId", issues);
      if (observedState<string>(event.receiverId) && (event.receiverId.state === "available" || event.receiverId.state === "backend-specific")) {
        if (event.receiverId.state === "available" || event.receiverId.value !== undefined) {
          addIssue(issues, typeof event.receiverId.value === "string" && event.receiverId.value.length > 0, "receiverId.value is invalid");
        }
      }
      validateObservedShape(event.receiverUv, "receiverUv", issues);
      if (observedState<readonly [number, number]>(event.receiverUv) && (event.receiverUv.state === "available" || event.receiverUv.state === "backend-specific")) {
        const hasValue = event.receiverUv.state === "available" || event.receiverUv.value !== undefined;
        if (hasValue) {
        addIssue(
          issues,
          Array.isArray(event.receiverUv.value)
            && event.receiverUv.value.length === 2
            && event.receiverUv.value.every((coordinate) => isFiniteNumber(coordinate)),
          "receiverUv.value is invalid",
        );
        }
      }
      validateAvailableRgbObserved(event.deliveredFluxRgb, "deliveredFluxRgb", issues);
      if (event.outcome.kind === "terminal") {
        addIssue(
          issues,
          event.deliveredFluxRgb.state === "available",
          "receiver terminal receiver-hit must carry available deliveredFluxRgb",
        );
      } else if (event.outcome.kind === "diagnostic") {
        addIssue(
          issues,
          event.deliveredFluxRgb.state !== "available"
            && (event.deliveredFluxRgb.state !== "backend-specific" || event.deliveredFluxRgb.value === undefined),
          "receiver diagnostic event must not carry a delivered-flux value",
        );
      }
      validateObservedShape(event.shadowCoverageWeight, "shadowCoverageWeight", issues);
      if (observedState<number>(event.shadowCoverageWeight) && (event.shadowCoverageWeight.state === "available" || event.shadowCoverageWeight.state === "backend-specific")) {
        if (event.shadowCoverageWeight.state === "available" || event.shadowCoverageWeight.value !== undefined) {
          addIssue(issues, isFiniteNonNegative(event.shadowCoverageWeight.value), "shadowCoverageWeight.value must be finite and non-negative");
        }
      }
      validateObservedShape(event.sampleWeight, "sampleWeight", issues);
      if (observedState<number>(event.sampleWeight) && (event.sampleWeight.state === "available" || event.sampleWeight.state === "backend-specific")) {
        if (event.sampleWeight.state === "available" || event.sampleWeight.value !== undefined) {
          addIssue(issues, isFiniteNonNegative(event.sampleWeight.value), "sampleWeight.value must be finite and non-negative");
        }
      }
    }
  } catch {
    // Runtime callers may pass an untyped/malformed object. Validation is a
    // diagnostic boundary and must report an issue rather than throw.
    issues.push("event contains a malformed runtime shape");
  }
  return issues;
}

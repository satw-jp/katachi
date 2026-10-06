import type {
  Observed,
  ReceiverFluxRgb,
  SourceBackend,
  TransportDomain,
} from "./opticalEvents.ts";
import {
  GPU_OPTICS_RESULT_FLOATS,
  GPU_OPTICS_RESULT_OFFSETS,
} from "./opticsGpu.ts";

/** The R1 observation contract is independent from the application version. */
export const R1_OPTICAL_OBSERVATION_CONTRACT_VERSION = "hikari-optical-observation/1" as const;

export type R1ObservationDomain = Extract<TransportDomain, "view" | "receiver">;

export type R1DisplayLayerId =
  | "viewSurfaceReflection"
  | "viewTransmission"
  | "viewInternalReflection"
  | "receiverDelivery"
  | "shadowCoverage";

/** Availability is deliberately distinct from a zero-valued observation. */
export type R1Availability =
  | { readonly kind: "available" }
  | { readonly kind: "partial"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "ambiguous"; readonly reason: string }
  | {
      readonly kind: "backend-specific";
      readonly backend: SourceBackend;
      readonly semantics: string;
    }
  | { readonly kind: "unsupported"; readonly reason: string };

export type R1EnergyRole = "view-radiance" | "receiver-flux" | "scalar-coverage";

type R1LayerDefinitionMap = {
  readonly viewSurfaceReflection: {
    readonly id: "viewSurfaceReflection";
    readonly domain: "view";
    readonly energyRole: "view-radiance";
    readonly derivedFrom: readonly [];
  };
  readonly viewTransmission: {
    readonly id: "viewTransmission";
    readonly domain: "view";
    readonly energyRole: "view-radiance";
    readonly derivedFrom: readonly [];
  };
  readonly viewInternalReflection: {
    readonly id: "viewInternalReflection";
    readonly domain: "view";
    readonly energyRole: "view-radiance";
    readonly derivedFrom: readonly ["viewTransmission", "hadInternalReflection"];
  };
  readonly receiverDelivery: {
    readonly id: "receiverDelivery";
    readonly domain: "receiver";
    readonly energyRole: "receiver-flux";
    readonly derivedFrom: readonly [];
  };
  readonly shadowCoverage: {
    readonly id: "shadowCoverage";
    readonly domain: "receiver";
    readonly energyRole: "scalar-coverage";
    readonly derivedFrom: readonly [];
  };
};

export type R1DisplayLayerDefinition = R1LayerDefinitionMap[R1DisplayLayerId];

/** Canonical domain, energy role, and derivation for every R1 display layer. */
export const R1_DISPLAY_LAYER_DEFINITIONS = Object.freeze({
  viewSurfaceReflection: Object.freeze({
    id: "viewSurfaceReflection",
    domain: "view",
    energyRole: "view-radiance",
    derivedFrom: Object.freeze([] as const),
  }),
  viewTransmission: Object.freeze({
    id: "viewTransmission",
    domain: "view",
    energyRole: "view-radiance",
    derivedFrom: Object.freeze([] as const),
  }),
  viewInternalReflection: Object.freeze({
    id: "viewInternalReflection",
    domain: "view",
    energyRole: "view-radiance",
    derivedFrom: Object.freeze(["viewTransmission", "hadInternalReflection"] as const),
  }),
  receiverDelivery: Object.freeze({
    id: "receiverDelivery",
    domain: "receiver",
    energyRole: "receiver-flux",
    derivedFrom: Object.freeze([] as const),
  }),
  shadowCoverage: Object.freeze({
    id: "shadowCoverage",
    domain: "receiver",
    energyRole: "scalar-coverage",
    derivedFrom: Object.freeze([] as const),
  }),
}) satisfies R1LayerDefinitionMap;

/** Alias emphasizing that the map is the optical-observation contract source. */
export const R1_OPTICAL_OBSERVATION_LAYER_DEFINITIONS = R1_DISPLAY_LAYER_DEFINITIONS;

type R1DisplayLayerObservationFields = {
  readonly sourceBackend: SourceBackend;
  readonly availability: R1Availability;
  readonly sampleCount: Observed<number>;
  readonly displayScale: number;
  readonly internalResolution: Observed<readonly [number, number]>;
  readonly textureFormat: Observed<string>;
};

/** The layer ID discriminates domain, role, and derivation at compile time. */
export type R1DisplayLayerDescriptor = {
  [LayerId in R1DisplayLayerId]: R1LayerDefinitionMap[LayerId] & R1DisplayLayerObservationFields;
}[R1DisplayLayerId];

export interface R1AttenuationObservation {
  readonly absorbedFluxRgb: Observed<ReceiverFluxRgb>;
  readonly interfaceLossFluxRgb: Observed<ReceiverFluxRgb>;
  readonly combinedAttenuationFluxRgb: Observed<ReceiverFluxRgb>;
  readonly unknownAttenuationFluxRgb: Observed<ReceiverFluxRgb>;
}

export type R1ObservationSnapshot = {
  readonly contractVersion: typeof R1_OPTICAL_OBSERVATION_CONTRACT_VERSION;
  readonly backend: SourceBackend;
  readonly frameId: number;
  readonly capturedAtMs: number;
  readonly layers: Partial<Record<R1DisplayLayerId, R1Availability>>;
};

/** Path codes are written into the diagnostic transmission attachment alpha. */
export const VIEW_PATH_CODE = Object.freeze({
  noEvent: 0,
  transmittedWithoutInternalReflection: 1,
  transmittedAfterOneInternalReflection: 2,
  unresolvedOuterPath: 3,
  ambiguousNestedFallback: 4,
} as const);

export type ViewPathCode = (typeof VIEW_PATH_CODE)[keyof typeof VIEW_PATH_CODE];

/** Stable prefixes used by R1 capability and fixed-case expectations. */
export const R1_OBSERVATION_REASON_CODES = Object.freeze({
  bodyBoundedView: "body-view-bounded-path",
  bodyNoReceiverTransport: "body-no-receiver-transport",
  receiverBackendNoViewRadiance: "receiver-backend-no-view-radiance",
  outerTirTerminal: "receiver-tir-terminal",
  nestedFallback: "nested-fallback",
  receiverInternalReflectionUnsupported: "receiver-internal-reflection-unsupported",
  cpuAttenuationResolved: "cpu-attenuation-resolved",
  webgpuAttenuationAmbiguous: "webgpu-attenuation-ambiguous",
  receiverNoHit: "receiver-no-hit",
  invalidPathRejected: "invalid-path-rejected",
  boundaryEventLimit: "boundary-event-limit",
} as const);

function reason(code: string, explanation: string): string {
  return `${code}: ${explanation}`;
}

function unsupported(code: string, explanation: string): R1Availability {
  return Object.freeze({ kind: "unsupported", reason: reason(code, explanation) });
}

function partial(code: string, explanation: string): R1Availability {
  return Object.freeze({ kind: "partial", reason: reason(code, explanation) });
}

function backendSpecific(backend: SourceBackend, semantics: string): R1Availability {
  return Object.freeze({ kind: "backend-specific", backend, semantics });
}

const AVAILABLE = Object.freeze({ kind: "available" } as const);

const BODY_VIEW_CAPABILITIES: Readonly<Record<
  Extract<R1DisplayLayerId, "viewSurfaceReflection" | "viewTransmission" | "viewInternalReflection">,
  R1Availability
>> = Object.freeze({
  viewSurfaceReflection: AVAILABLE,
  viewTransmission: partial(
    R1_OBSERVATION_REASON_CODES.bodyBoundedView,
    "bounded BODY observation can leave nested or unresolved transmission paths",
  ),
  viewInternalReflection: partial(
    R1_OBSERVATION_REASON_CODES.bodyBoundedView,
    "derived only from viewTransmission paths with a bounded one-bounce internal reflection",
  ),
});

const BODY_RECEIVER_CAPABILITIES: Readonly<Record<
  Extract<R1DisplayLayerId, "receiverDelivery" | "shadowCoverage">,
  R1Availability
>> = Object.freeze({
  receiverDelivery: unsupported(
    R1_OBSERVATION_REASON_CODES.bodyNoReceiverTransport,
    "BODY view rendering does not emit receiver flux",
  ),
  shadowCoverage: backendSpecific(
    "body-webgl",
    "body-shadow-coverage-input: backend-specific receiver coverage input used by BODY display; coverage is not emitted by BODY",
  ),
});

const RECEIVER_VIEW_CAPABILITIES: Readonly<Record<
  Extract<R1DisplayLayerId, "viewSurfaceReflection" | "viewTransmission" | "viewInternalReflection">,
  R1Availability
>> = Object.freeze({
  viewSurfaceReflection: unsupported(
    R1_OBSERVATION_REASON_CODES.receiverBackendNoViewRadiance,
    "receiver transport does not capture view radiance",
  ),
  viewTransmission: unsupported(
    R1_OBSERVATION_REASON_CODES.receiverBackendNoViewRadiance,
    "receiver transport does not capture view transmission radiance",
  ),
  viewInternalReflection: unsupported(
    R1_OBSERVATION_REASON_CODES.receiverBackendNoViewRadiance,
    "receiver transport has no view path attribute from which to derive internal reflection",
  ),
});

const RECEIVER_LAYER_CAPABILITIES: Readonly<Record<
  Extract<R1DisplayLayerId, "receiverDelivery" | "shadowCoverage">,
  R1Availability
>> = Object.freeze({
  receiverDelivery: AVAILABLE,
  shadowCoverage: AVAILABLE,
});

export type R1CapabilityMatrix = Readonly<{
  readonly [backend in SourceBackend]: Readonly<Record<R1DisplayLayerId, R1Availability>>;
}>;

/**
 * R1 capability truth for every backend/layer pair.  This is a declaration of
 * what a backend can observe, not an inference from an empty or zero texture.
 */
export const R1_OPTICAL_OBSERVATION_CAPABILITIES: R1CapabilityMatrix = Object.freeze({
  "body-webgl": Object.freeze({
    ...BODY_VIEW_CAPABILITIES,
    ...BODY_RECEIVER_CAPABILITIES,
  }),
  "cpu-receiver": Object.freeze({
    ...RECEIVER_VIEW_CAPABILITIES,
    ...RECEIVER_LAYER_CAPABILITIES,
  }),
  "webgpu-receiver": Object.freeze({
    ...RECEIVER_VIEW_CAPABILITIES,
    ...RECEIVER_LAYER_CAPABILITIES,
  }),
});

export interface R1OpticalObservationCapabilityEntry {
  readonly backend: SourceBackend;
  readonly layer: R1DisplayLayerId;
  readonly availability: R1Availability;
}

const R1_BACKENDS = ["body-webgl", "cpu-receiver", "webgpu-receiver"] as const satisfies readonly SourceBackend[];
const R1_LAYERS = [
  "viewSurfaceReflection",
  "viewTransmission",
  "viewInternalReflection",
  "receiverDelivery",
  "shadowCoverage",
] as const satisfies readonly R1DisplayLayerId[];

/** Flat immutable form for consumers that enumerate the 3 × 5 matrix. */
export const R1_OPTICAL_OBSERVATION_CAPABILITY_ENTRIES = Object.freeze(
  R1_BACKENDS.flatMap((backend) =>
    R1_LAYERS.map((layer) =>
      Object.freeze({
        backend,
        layer,
        availability: R1_OPTICAL_OBSERVATION_CAPABILITIES[backend][layer],
      }),
    ),
  ),
);

/** Existing v1 GPU payload layout, referenced without copying its offsets. */
export const R1_GPU_RESULT_DESCRIPTOR_V1 = Object.freeze({
  version: "hikari-gpu-optics-result/1",
  floatsPerSample: GPU_OPTICS_RESULT_FLOATS,
  offsets: GPU_OPTICS_RESULT_OFFSETS,
  optionalFields: Object.freeze([] as const),
} as const);

export type R1GpuResultDescriptorV1 = typeof R1_GPU_RESULT_DESCRIPTOR_V1;

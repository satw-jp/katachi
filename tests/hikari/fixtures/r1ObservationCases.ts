import type { R1Availability, R1DisplayLayerId, ViewPathCode } from "../../../src/studies/cloud-sculpt/opticalObservation.ts";
import {
  R1_OBSERVATION_REASON_CODES,
  VIEW_PATH_CODE,
} from "../../../src/studies/cloud-sculpt/opticalObservation.ts";
import { OPTICAL_EVENT_FIXED_CASES, type OpticalEventFixedCase } from "./opticalEventCases.ts";

export interface R1ExpectedLayer {
  readonly availability: R1Availability;
  readonly pathCodes?: readonly ViewPathCode[];
  /** A layer may be present and valid even when this fixed case contributes zero. */
  readonly zeroValueAllowed?: boolean;
}

export interface R1AttenuationExpectation {
  readonly absorbedFluxRgb: R1Availability;
  readonly interfaceLossFluxRgb: R1Availability;
  readonly combinedAttenuationFluxRgb: R1Availability;
  readonly unknownAttenuationFluxRgb: R1Availability;
}

export interface R1ObservationExpectation {
  readonly viewSurfaceReflection: R1ExpectedLayer;
  readonly viewTransmission: R1ExpectedLayer;
  readonly viewInternalReflection: R1ExpectedLayer;
  readonly receiverDelivery: R1ExpectedLayer;
  readonly shadowCoverage: R1ExpectedLayer;
  readonly receiverAfterInternalReflection: R1Availability;
  readonly attenuation: {
    readonly cpu: R1AttenuationExpectation;
    readonly webgpu: R1AttenuationExpectation;
  };
}

export interface R1ObservationFixedCase {
  readonly id: OpticalEventFixedCase["id"];
  /** The R0.5 object itself is reused; no second event taxonomy is introduced. */
  readonly catalogCase: OpticalEventFixedCase;
  readonly expectation: R1ObservationExpectation;
}

const AVAILABLE: R1Availability = Object.freeze({ kind: "available" });

function partial(code: string, explanation: string): R1Availability {
  return Object.freeze({ kind: "partial", reason: `${code}: ${explanation}` });
}

function ambiguous(code: string, explanation: string): R1Availability {
  return Object.freeze({ kind: "ambiguous", reason: `${code}: ${explanation}` });
}

function unsupported(code: string, explanation: string): R1Availability {
  return Object.freeze({ kind: "unsupported", reason: `${code}: ${explanation}` });
}

function backendSpecific(semantics: string): R1Availability {
  return Object.freeze({ kind: "backend-specific", backend: "body-webgl", semantics });
}

const NO_RECEIVER_INTERNAL_REFLECTION = unsupported(
  R1_OBSERVATION_REASON_CODES.receiverInternalReflectionUnsupported,
  "receiver transport stops at outer-exit TIR and does not trace a later receiver hit",
);

const CPU_RESOLVED_ATTENUATION: R1AttenuationExpectation = Object.freeze({
  absorbedFluxRgb: AVAILABLE,
  interfaceLossFluxRgb: AVAILABLE,
  combinedAttenuationFluxRgb: AVAILABLE,
  unknownAttenuationFluxRgb: AVAILABLE,
});

const WEBGPU_AMBIGUOUS_ATTENUATION: R1AttenuationExpectation = Object.freeze({
  absorbedFluxRgb: ambiguous(
    R1_OBSERVATION_REASON_CODES.webgpuAttenuationAmbiguous,
    "the v1 payload contains only combined throughput, not a Beer–Lambert/interface split",
  ),
  interfaceLossFluxRgb: ambiguous(
    R1_OBSERVATION_REASON_CODES.webgpuAttenuationAmbiguous,
    "the v1 payload contains only combined throughput, not a Beer–Lambert/interface split",
  ),
  combinedAttenuationFluxRgb: AVAILABLE,
  unknownAttenuationFluxRgb: ambiguous(
    R1_OBSERVATION_REASON_CODES.webgpuAttenuationAmbiguous,
    "unresolved allocation cannot be separated from the v1 combined throughput field",
  ),
});

const RECEIVER_UNSUPPORTED_ATTENUATION: R1AttenuationExpectation = Object.freeze({
  absorbedFluxRgb: unsupported(
    R1_OBSERVATION_REASON_CODES.receiverInternalReflectionUnsupported,
    "receiver attenuation is not resolved after an internal-reflection path",
  ),
  interfaceLossFluxRgb: unsupported(
    R1_OBSERVATION_REASON_CODES.receiverInternalReflectionUnsupported,
    "receiver attenuation is not resolved after an internal-reflection path",
  ),
  combinedAttenuationFluxRgb: unsupported(
    R1_OBSERVATION_REASON_CODES.receiverInternalReflectionUnsupported,
    "receiver attenuation is not resolved after an internal-reflection path",
  ),
  unknownAttenuationFluxRgb: ambiguous(
    R1_OBSERVATION_REASON_CODES.receiverInternalReflectionUnsupported,
    "unresolved receiver transport cannot be allocated to an attenuation component",
  ),
});

const BOUNDARY_EVENT_LIMIT_CPU_ATTENUATION: R1AttenuationExpectation = Object.freeze({
  absorbedFluxRgb: ambiguous(
    R1_OBSERVATION_REASON_CODES.boundaryEventLimit,
    "event exhaustion prevents unique allocation between absorption and interface loss",
  ),
  interfaceLossFluxRgb: ambiguous(
    R1_OBSERVATION_REASON_CODES.boundaryEventLimit,
    "event exhaustion prevents unique allocation between absorption and interface loss",
  ),
  combinedAttenuationFluxRgb: ambiguous(
    R1_OBSERVATION_REASON_CODES.boundaryEventLimit,
    "event exhaustion prevents a uniquely resolved attenuation total",
  ),
  unknownAttenuationFluxRgb: AVAILABLE,
});

const VIEW_RECEIVER_DOMAIN = backendSpecific(
  "R1 fixed case is a receiver-domain sample; BODY view layers are a separate source",
);

function layer(
  availability: R1Availability,
  pathCodes?: readonly ViewPathCode[],
  zeroValueAllowed = false,
): R1ExpectedLayer {
  return Object.freeze({
    availability,
    ...(pathCodes === undefined ? {} : { pathCodes: Object.freeze([...pathCodes]) }),
    ...(zeroValueAllowed ? { zeroValueAllowed: true } : {}),
  });
}

function freezeLayerExpectation(value: R1ExpectedLayer): R1ExpectedLayer {
  const pathCodes = value.pathCodes === undefined
    ? undefined
    : Object.freeze([...value.pathCodes]);
  return Object.freeze({
    ...value,
    ...(pathCodes === undefined ? {} : { pathCodes }),
  });
}

function freezeAttenuationExpectation(value: R1AttenuationExpectation): R1AttenuationExpectation {
  return Object.freeze({ ...value });
}

function freezeObservationExpectation(value: R1ObservationExpectation): R1ObservationExpectation {
  const attenuation = Object.freeze({
    cpu: freezeAttenuationExpectation(value.attenuation.cpu),
    webgpu: freezeAttenuationExpectation(value.attenuation.webgpu),
  });
  return Object.freeze({
    viewSurfaceReflection: freezeLayerExpectation(value.viewSurfaceReflection),
    viewTransmission: freezeLayerExpectation(value.viewTransmission),
    viewInternalReflection: freezeLayerExpectation(value.viewInternalReflection),
    receiverDelivery: freezeLayerExpectation(value.receiverDelivery),
    shadowCoverage: freezeLayerExpectation(value.shadowCoverage),
    receiverAfterInternalReflection: Object.freeze({ ...value.receiverAfterInternalReflection }),
    attenuation,
  });
}

function receiverCase(
  catalogCase: OpticalEventFixedCase,
  expectation: R1ObservationExpectation,
): R1ObservationFixedCase {
  return Object.freeze({
    id: catalogCase.id,
    catalogCase,
    expectation: freezeObservationExpectation(expectation),
  });
}

const noEvent = Object.freeze([VIEW_PATH_CODE.noEvent] as const);
const transmitted = Object.freeze([VIEW_PATH_CODE.transmittedWithoutInternalReflection] as const);
const internalReflection = Object.freeze([VIEW_PATH_CODE.transmittedAfterOneInternalReflection] as const);
const nestedFallback = Object.freeze([VIEW_PATH_CODE.ambiguousNestedFallback] as const);

export const R1_OBSERVATION_CASES = Object.freeze([
  receiverCase(OPTICAL_EVENT_FIXED_CASES[0], {
    viewSurfaceReflection: layer(AVAILABLE),
    viewTransmission: layer(AVAILABLE, noEvent, true),
    viewInternalReflection: layer(AVAILABLE, noEvent, true),
    receiverDelivery: layer(AVAILABLE, undefined, true),
    shadowCoverage: layer(AVAILABLE, undefined, true),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: CPU_RESOLVED_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[1], {
    viewSurfaceReflection: layer(AVAILABLE, noEvent, true),
    viewTransmission: layer(AVAILABLE, transmitted),
    viewInternalReflection: layer(AVAILABLE, noEvent, true),
    receiverDelivery: layer(AVAILABLE, undefined, true),
    shadowCoverage: layer(AVAILABLE, undefined, true),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: CPU_RESOLVED_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[2], {
    viewSurfaceReflection: layer(AVAILABLE),
    viewTransmission: layer(AVAILABLE, internalReflection),
    viewInternalReflection: layer(AVAILABLE, internalReflection),
    receiverDelivery: layer(NO_RECEIVER_INTERNAL_REFLECTION, undefined, true),
    shadowCoverage: layer(AVAILABLE, undefined, true),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: RECEIVER_UNSUPPORTED_ATTENUATION, webgpu: RECEIVER_UNSUPPORTED_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[3], {
    viewSurfaceReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewTransmission: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewInternalReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    receiverDelivery: layer(AVAILABLE),
    shadowCoverage: layer(AVAILABLE),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: CPU_RESOLVED_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[4], {
    viewSurfaceReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewTransmission: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewInternalReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    receiverDelivery: layer(AVAILABLE),
    shadowCoverage: layer(AVAILABLE),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: CPU_RESOLVED_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[5], {
    viewSurfaceReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewTransmission: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewInternalReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    receiverDelivery: layer(ambiguous(
      R1_OBSERVATION_REASON_CODES.boundaryEventLimit,
      "receiver transport is unresolved after the straight boundary event limit",
    ), undefined, true),
    shadowCoverage: layer(AVAILABLE, undefined, true),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: BOUNDARY_EVENT_LIMIT_CPU_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[6], {
    viewSurfaceReflection: layer(AVAILABLE),
    viewTransmission: layer(partial(
      R1_OBSERVATION_REASON_CODES.nestedFallback,
      "nested inclusion transmission uses the bounded fallback path",
    ), nestedFallback),
    viewInternalReflection: layer(partial(
      R1_OBSERVATION_REASON_CODES.nestedFallback,
      "nested inclusion path attributes are only partially resolved",
    ), nestedFallback),
    receiverDelivery: layer(AVAILABLE),
    shadowCoverage: layer(AVAILABLE),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: CPU_RESOLVED_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[7], {
    viewSurfaceReflection: layer(AVAILABLE, noEvent, true),
    viewTransmission: layer(AVAILABLE, noEvent, true),
    viewInternalReflection: layer(AVAILABLE, noEvent, true),
    receiverDelivery: layer(AVAILABLE, undefined, true),
    shadowCoverage: layer(AVAILABLE),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: CPU_RESOLVED_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[8], {
    viewSurfaceReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewTransmission: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewInternalReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    receiverDelivery: layer(AVAILABLE, undefined, true),
    shadowCoverage: layer(AVAILABLE, undefined, true),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: { cpu: CPU_RESOLVED_ATTENUATION, webgpu: WEBGPU_AMBIGUOUS_ATTENUATION },
  }),
  receiverCase(OPTICAL_EVENT_FIXED_CASES[9], {
    viewSurfaceReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewTransmission: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    viewInternalReflection: layer(VIEW_RECEIVER_DOMAIN, undefined, true),
    receiverDelivery: layer(AVAILABLE, undefined, true),
    shadowCoverage: layer(AVAILABLE, undefined, true),
    receiverAfterInternalReflection: NO_RECEIVER_INTERNAL_REFLECTION,
    attenuation: {
      cpu: Object.freeze({
        absorbedFluxRgb: unsupported(
          R1_OBSERVATION_REASON_CODES.invalidPathRejected,
          "the rejected path is not allocated to an attenuation component",
        ),
        interfaceLossFluxRgb: unsupported(
          R1_OBSERVATION_REASON_CODES.invalidPathRejected,
          "the rejected path is not allocated to an attenuation component",
        ),
        combinedAttenuationFluxRgb: AVAILABLE,
        unknownAttenuationFluxRgb: AVAILABLE,
      }),
      webgpu: WEBGPU_AMBIGUOUS_ATTENUATION,
    },
  }),
] as const satisfies readonly R1ObservationFixedCase[]);

/** Convenience lookup that retains the exact R0.5 case order and IDs. */
export const R1_OBSERVATION_EXPECTATIONS = Object.freeze(
  Object.fromEntries(R1_OBSERVATION_CASES.map(({ id, expectation }) => [id, expectation])) as Record<
    OpticalEventFixedCase["id"],
    R1ObservationExpectation
  >,
);

/** Compile-time guard: this fixture must describe precisely the existing ten cases. */
const _r1LayerIds: readonly R1DisplayLayerId[] = [
  "viewSurfaceReflection",
  "viewTransmission",
  "viewInternalReflection",
  "receiverDelivery",
  "shadowCoverage",
];

void _r1LayerIds;

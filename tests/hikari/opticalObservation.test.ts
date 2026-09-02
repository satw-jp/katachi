import assert from "node:assert/strict";
import test from "node:test";
import {
  R1_OPTICAL_OBSERVATION_CAPABILITIES,
  R1_OPTICAL_OBSERVATION_CAPABILITY_ENTRIES,
  R1_OPTICAL_OBSERVATION_CONTRACT_VERSION,
  R1_OPTICAL_OBSERVATION_LAYER_DEFINITIONS,
  R1_DISPLAY_LAYER_DEFINITIONS,
  R1_GPU_RESULT_DESCRIPTOR_V1,
  VIEW_PATH_CODE,
  type R1Availability,
  type R1DisplayLayerDescriptor,
  type R1ObservationSnapshot,
  type ViewPathCode,
} from "../../src/studies/cloud-sculpt/opticalObservation.ts";
import {
  observed,
  receiverFluxRgb,
  unavailable,
} from "../../src/studies/cloud-sculpt/opticalEvents.ts";
import {
  GPU_OPTICS_RESULT_FLOATS,
  GPU_OPTICS_RESULT_OFFSETS,
} from "../../src/studies/cloud-sculpt/opticsGpu.ts";
import { OPTICAL_EVENT_FIXED_CASES } from "./fixtures/opticalEventCases.ts";
import {
  R1_OBSERVATION_CASES,
  R1_OBSERVATION_EXPECTATIONS,
} from "./fixtures/r1ObservationCases.ts";

const EXPECTED_LAYER_DEFINITIONS = [
  { id: "viewSurfaceReflection", domain: "view", energyRole: "view-radiance", derivedFrom: [] },
  { id: "viewTransmission", domain: "view", energyRole: "view-radiance", derivedFrom: [] },
  {
    id: "viewInternalReflection",
    domain: "view",
    energyRole: "view-radiance",
    derivedFrom: ["viewTransmission", "hadInternalReflection"],
  },
  { id: "receiverDelivery", domain: "receiver", energyRole: "receiver-flux", derivedFrom: [] },
  { id: "shadowCoverage", domain: "receiver", energyRole: "scalar-coverage", derivedFrom: [] },
] as const;

const EXPECTED_BACKENDS = ["body-webgl", "cpu-receiver", "webgpu-receiver"] as const;

const EXPECTED_CAPABILITY_KINDS = {
  "body-webgl": {
    viewSurfaceReflection: "available",
    viewTransmission: "partial",
    viewInternalReflection: "partial",
    receiverDelivery: "unsupported",
    shadowCoverage: "backend-specific",
  },
  "cpu-receiver": {
    viewSurfaceReflection: "unsupported",
    viewTransmission: "unsupported",
    viewInternalReflection: "unsupported",
    receiverDelivery: "available",
    shadowCoverage: "available",
  },
  "webgpu-receiver": {
    viewSurfaceReflection: "unsupported",
    viewTransmission: "unsupported",
    viewInternalReflection: "unsupported",
    receiverDelivery: "available",
    shadowCoverage: "available",
  },
} as const;

test("R1 canonical five-layer mapping is exact and immutable", () => {
  assert.strictEqual(R1_OPTICAL_OBSERVATION_LAYER_DEFINITIONS, R1_DISPLAY_LAYER_DEFINITIONS);
  assert.deepEqual(Object.keys(R1_DISPLAY_LAYER_DEFINITIONS), EXPECTED_LAYER_DEFINITIONS.map(({ id }) => id));
  for (const expected of EXPECTED_LAYER_DEFINITIONS) {
    const actual = R1_DISPLAY_LAYER_DEFINITIONS[expected.id];
    assert.deepEqual(actual, expected);
    assert.equal(Object.isFrozen(actual), true);
    assert.equal(Object.isFrozen(actual.derivedFrom), true);
  }
});

test("R1 availability keeps every handoff state explicit", () => {
  const states: readonly R1Availability[] = [
    { kind: "available" },
    { kind: "partial", reason: "stable-code: bounded" },
    { kind: "unavailable", reason: "stable-code: not emitted" },
    { kind: "ambiguous", reason: "stable-code: mixed" },
    { kind: "backend-specific", backend: "webgpu-receiver", semantics: "floor-hit direction only" },
    { kind: "unsupported", reason: "stable-code: no path" },
  ];
  assert.deepEqual(states.map(({ kind }) => kind), [
    "available",
    "partial",
    "unavailable",
    "ambiguous",
    "backend-specific",
    "unsupported",
  ]);
});

test("R1 capability matrix names every existing backend/layer pair", () => {
  const layerIds = EXPECTED_LAYER_DEFINITIONS.map(({ id }) => id);
  assert.deepEqual(Object.keys(R1_OPTICAL_OBSERVATION_CAPABILITIES).sort(), [...EXPECTED_BACKENDS].sort());
  assert.equal(R1_OPTICAL_OBSERVATION_CAPABILITY_ENTRIES.length, EXPECTED_BACKENDS.length * layerIds.length);

  for (const backend of EXPECTED_BACKENDS) {
    const layers = R1_OPTICAL_OBSERVATION_CAPABILITIES[backend];
    assert.deepEqual(Object.keys(layers).sort(), [...layerIds].sort());
    for (const layerId of layerIds) {
      const availability = layers[layerId];
      assert.ok(availability, `${backend}/${layerId} must be explicit`);
      assert.equal(availability.kind, EXPECTED_CAPABILITY_KINDS[backend][layerId]);
      assert.equal(typeof availability.kind, "string");
      if (availability.kind === "partial" || availability.kind === "unavailable"
        || availability.kind === "ambiguous" || availability.kind === "unsupported") {
        assert.match(availability.reason, /^[a-z0-9-]+: /);
      }
      if (availability.kind === "backend-specific") {
        assert.ok(availability.semantics.length > 0);
      }
    }
  }

  assert.equal(R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].viewSurfaceReflection.kind, "available");
  assert.equal(R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].viewTransmission.kind, "partial");
  assert.equal(R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].receiverDelivery.kind, "unsupported");
  const bodyShadowCoverage = R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].shadowCoverage;
  assert.equal(bodyShadowCoverage.kind, "backend-specific");
  if (bodyShadowCoverage.kind === "backend-specific") {
    assert.equal(bodyShadowCoverage.backend, "body-webgl");
    assert.match(bodyShadowCoverage.semantics, /input/);
    assert.match(bodyShadowCoverage.semantics, /not emitted by BODY/);
  }
  assert.equal(R1_OPTICAL_OBSERVATION_CAPABILITIES["cpu-receiver"].receiverDelivery.kind, "available");
  assert.equal(R1_OPTICAL_OBSERVATION_CAPABILITIES["webgpu-receiver"].shadowCoverage.kind, "available");
});

test("R1 layer descriptor keeps radiance, flux, and scalar coverage distinct", () => {
  const descriptor = {
    ...R1_DISPLAY_LAYER_DEFINITIONS.viewInternalReflection,
    sourceBackend: "body-webgl",
    availability: R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].viewInternalReflection,
    sampleCount: observed(128, "bounded", "backend-output"),
    displayScale: 1,
    internalResolution: observed([64, 64] as const, "exact", "backend-output"),
    textureFormat: observed("RGBA16F", "exact", "backend-output"),
  } as const satisfies R1DisplayLayerDescriptor;

  assert.deepEqual(descriptor.derivedFrom, ["viewTransmission", "hadInternalReflection"]);
  assert.equal(descriptor.energyRole, "view-radiance");
  assert.equal(descriptor.sampleCount.state, "available");
  assert.equal(descriptor.internalResolution.state, "available");
  assert.equal(descriptor.textureFormat.state, "available");

  const receiverFlux = receiverFluxRgb({ r: 1, g: 0.5, b: 0.25 });
  const fluxObservation = observed(receiverFlux, "exact", "backend-output");
  const unavailableResolution = unavailable<readonly [number, number]>("not-emitted-by-backend");
  assert.equal(fluxObservation.value, receiverFlux);
  assert.equal(unavailableResolution.state, "unavailable");
});

const COMPILE_TIME_DESCRIPTOR_EXAMPLES = [
  {
    ...R1_DISPLAY_LAYER_DEFINITIONS.viewSurfaceReflection,
    sourceBackend: "body-webgl",
    availability: R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].viewSurfaceReflection,
    sampleCount: observed(1, "exact", "backend-output"),
    displayScale: 1,
    internalResolution: observed([1, 1] as const, "exact", "backend-output"),
    textureFormat: observed("RGBA16F", "exact", "backend-output"),
  },
  {
    ...R1_DISPLAY_LAYER_DEFINITIONS.viewTransmission,
    sourceBackend: "body-webgl",
    availability: R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].viewTransmission,
    sampleCount: observed(1, "exact", "backend-output"),
    displayScale: 1,
    internalResolution: observed([1, 1] as const, "exact", "backend-output"),
    textureFormat: observed("RGBA16F", "exact", "backend-output"),
  },
  {
    ...R1_DISPLAY_LAYER_DEFINITIONS.viewInternalReflection,
    sourceBackend: "body-webgl",
    availability: R1_OPTICAL_OBSERVATION_CAPABILITIES["body-webgl"].viewInternalReflection,
    sampleCount: observed(1, "exact", "backend-output"),
    displayScale: 1,
    internalResolution: observed([1, 1] as const, "exact", "backend-output"),
    textureFormat: observed("RGBA16F", "exact", "backend-output"),
  },
  {
    ...R1_DISPLAY_LAYER_DEFINITIONS.receiverDelivery,
    sourceBackend: "cpu-receiver",
    availability: R1_OPTICAL_OBSERVATION_CAPABILITIES["cpu-receiver"].receiverDelivery,
    sampleCount: observed(1, "exact", "backend-output"),
    displayScale: 1,
    internalResolution: observed([1, 1] as const, "exact", "backend-output"),
    textureFormat: observed("RGBA32F", "exact", "backend-output"),
  },
  {
    ...R1_DISPLAY_LAYER_DEFINITIONS.shadowCoverage,
    sourceBackend: "cpu-receiver",
    availability: R1_OPTICAL_OBSERVATION_CAPABILITIES["cpu-receiver"].shadowCoverage,
    sampleCount: observed(1, "exact", "backend-output"),
    displayScale: 1,
    internalResolution: observed([1, 1] as const, "exact", "backend-output"),
    textureFormat: observed("R32F", "exact", "backend-output"),
  },
] as const satisfies readonly R1DisplayLayerDescriptor[];

test("R1 descriptor union has a compile-time example for every canonical layer", () => {
  assert.equal(COMPILE_TIME_DESCRIPTOR_EXAMPLES.length, EXPECTED_LAYER_DEFINITIONS.length);
  assert.deepEqual(
    COMPILE_TIME_DESCRIPTOR_EXAMPLES.map(({ id, domain, energyRole, derivedFrom }) => ({
      id,
      domain,
      energyRole,
      derivedFrom,
    })),
    EXPECTED_LAYER_DEFINITIONS,
  );
});

test("ViewPathCode is a stable unique 0..4 codebook", () => {
  const codes: readonly ViewPathCode[] = [
    VIEW_PATH_CODE.noEvent,
    VIEW_PATH_CODE.transmittedWithoutInternalReflection,
    VIEW_PATH_CODE.transmittedAfterOneInternalReflection,
    VIEW_PATH_CODE.unresolvedOuterPath,
    VIEW_PATH_CODE.ambiguousNestedFallback,
  ];
  assert.deepEqual(codes, [0, 1, 2, 3, 4]);
  assert.equal(new Set(codes).size, codes.length);
});

type AvailabilityKind = R1Availability["kind"];

interface R1CaseSummary {
  readonly id: string;
  readonly layerKinds: {
    readonly viewSurfaceReflection: AvailabilityKind;
    readonly viewTransmission: AvailabilityKind;
    readonly viewInternalReflection: AvailabilityKind;
    readonly receiverDelivery: AvailabilityKind;
    readonly shadowCoverage: AvailabilityKind;
  };
  readonly pathCodes: Partial<Record<"viewSurfaceReflection" | "viewTransmission" | "viewInternalReflection", readonly ViewPathCode[]>>;
  readonly receiverAfterInternalReflection: AvailabilityKind;
  readonly cpuAttenuation: {
    readonly absorbedFluxRgb: AvailabilityKind;
    readonly interfaceLossFluxRgb: AvailabilityKind;
    readonly combinedAttenuationFluxRgb: AvailabilityKind;
    readonly unknownAttenuationFluxRgb: AvailabilityKind;
  };
  readonly webgpuAttenuation: {
    readonly absorbedFluxRgb: AvailabilityKind;
    readonly interfaceLossFluxRgb: AvailabilityKind;
    readonly combinedAttenuationFluxRgb: AvailabilityKind;
    readonly unknownAttenuationFluxRgb: AvailabilityKind;
  };
}

const EXPECTED_CASE_SUMMARIES = [
  {
    id: "R05-view-surface-reflection",
    layerKinds: {
      viewSurfaceReflection: "available",
      viewTransmission: "available",
      viewInternalReflection: "available",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: { viewTransmission: [0], viewInternalReflection: [0] },
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "available", interfaceLossFluxRgb: "available", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-view-simple-transmission",
    layerKinds: {
      viewSurfaceReflection: "available",
      viewTransmission: "available",
      viewInternalReflection: "available",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: { viewSurfaceReflection: [0], viewTransmission: [1], viewInternalReflection: [0] },
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "available", interfaceLossFluxRgb: "available", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-path-internal-reflection",
    layerKinds: {
      viewSurfaceReflection: "available",
      viewTransmission: "available",
      viewInternalReflection: "available",
      receiverDelivery: "unsupported",
      shadowCoverage: "available",
    },
    pathCodes: { viewTransmission: [2], viewInternalReflection: [2] },
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "unsupported", interfaceLossFluxRgb: "unsupported", combinedAttenuationFluxRgb: "unsupported", unknownAttenuationFluxRgb: "ambiguous" },
    webgpuAttenuation: { absorbedFluxRgb: "unsupported", interfaceLossFluxRgb: "unsupported", combinedAttenuationFluxRgb: "unsupported", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-receiver-focus",
    layerKinds: {
      viewSurfaceReflection: "backend-specific",
      viewTransmission: "backend-specific",
      viewInternalReflection: "backend-specific",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: {},
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "available", interfaceLossFluxRgb: "available", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-receiver-absorbing-medium",
    layerKinds: {
      viewSurfaceReflection: "backend-specific",
      viewTransmission: "backend-specific",
      viewInternalReflection: "backend-specific",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: {},
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "available", interfaceLossFluxRgb: "available", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-boundary-event-limit",
    layerKinds: {
      viewSurfaceReflection: "backend-specific",
      viewTransmission: "backend-specific",
      viewInternalReflection: "backend-specific",
      receiverDelivery: "ambiguous",
      shadowCoverage: "available",
    },
    pathCodes: {},
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "ambiguous", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-inclusion-pass",
    layerKinds: {
      viewSurfaceReflection: "available",
      viewTransmission: "partial",
      viewInternalReflection: "partial",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: { viewTransmission: [4], viewInternalReflection: [4] },
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "available", interfaceLossFluxRgb: "available", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-shadow-coverage",
    layerKinds: {
      viewSurfaceReflection: "available",
      viewTransmission: "available",
      viewInternalReflection: "available",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: { viewSurfaceReflection: [0], viewTransmission: [0], viewInternalReflection: [0] },
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "available", interfaceLossFluxRgb: "available", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-receiver-escaped",
    layerKinds: {
      viewSurfaceReflection: "backend-specific",
      viewTransmission: "backend-specific",
      viewInternalReflection: "backend-specific",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: {},
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "available", interfaceLossFluxRgb: "available", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
  {
    id: "R05-invalid-path-rejected",
    layerKinds: {
      viewSurfaceReflection: "backend-specific",
      viewTransmission: "backend-specific",
      viewInternalReflection: "backend-specific",
      receiverDelivery: "available",
      shadowCoverage: "available",
    },
    pathCodes: {},
    receiverAfterInternalReflection: "unsupported",
    cpuAttenuation: { absorbedFluxRgb: "unsupported", interfaceLossFluxRgb: "unsupported", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "available" },
    webgpuAttenuation: { absorbedFluxRgb: "ambiguous", interfaceLossFluxRgb: "ambiguous", combinedAttenuationFluxRgb: "available", unknownAttenuationFluxRgb: "ambiguous" },
  },
] as const satisfies readonly R1CaseSummary[];

test("R1 fixed cases exhaustively reuse the ten R0.5 catalog objects", () => {
  assert.equal(R1_OBSERVATION_CASES.length, OPTICAL_EVENT_FIXED_CASES.length);
  assert.equal(R1_OBSERVATION_CASES.length, EXPECTED_CASE_SUMMARIES.length);
  assert.deepEqual(
    Object.keys(R1_OBSERVATION_EXPECTATIONS).sort(),
    EXPECTED_CASE_SUMMARIES.map(({ id }) => id).sort(),
  );
  assert.deepEqual(
    R1_OBSERVATION_CASES.map(({ id }) => id),
    EXPECTED_CASE_SUMMARIES.map(({ id }) => id),
  );
  for (const [index, fixedCase] of R1_OBSERVATION_CASES.entries()) {
    const expected = EXPECTED_CASE_SUMMARIES[index];
    assert.ok(expected);
    assert.strictEqual(fixedCase.catalogCase, OPTICAL_EVENT_FIXED_CASES[index]);
    assert.equal(fixedCase.id, expected.id);
    const actualLayers = [
      ["viewSurfaceReflection", fixedCase.expectation.viewSurfaceReflection],
      ["viewTransmission", fixedCase.expectation.viewTransmission],
      ["viewInternalReflection", fixedCase.expectation.viewInternalReflection],
      ["receiverDelivery", fixedCase.expectation.receiverDelivery],
      ["shadowCoverage", fixedCase.expectation.shadowCoverage],
    ] as const;
    for (const [layerId, actualLayer] of actualLayers) {
      assert.equal(actualLayer.availability.kind, expected.layerKinds[layerId]);
      const expectedPath = expected.pathCodes[layerId];
      if (expectedPath === undefined) assert.equal(actualLayer.pathCodes, undefined);
      else assert.deepEqual(actualLayer.pathCodes, expectedPath);
    }
    assert.equal(
      fixedCase.expectation.receiverAfterInternalReflection.kind,
      expected.receiverAfterInternalReflection,
    );
    const actualCpu = fixedCase.expectation.attenuation.cpu;
    const actualWebgpu = fixedCase.expectation.attenuation.webgpu;
    const attenuationFields = [
      "absorbedFluxRgb",
      "interfaceLossFluxRgb",
      "combinedAttenuationFluxRgb",
      "unknownAttenuationFluxRgb",
    ] as const;
    for (const field of attenuationFields) {
      assert.equal(actualCpu[field].kind, expected.cpuAttenuation[field]);
      assert.equal(actualWebgpu[field].kind, expected.webgpuAttenuation[field]);
    }
    if (fixedCase.id === "R05-inclusion-pass") {
      assert.equal(fixedCase.expectation.viewTransmission.availability.kind, "partial");
      if (fixedCase.expectation.viewTransmission.availability.kind === "partial") {
        assert.match(fixedCase.expectation.viewTransmission.availability.reason, /^nested-fallback: /);
      }
    }
    if (fixedCase.id === "R05-path-internal-reflection") {
      assert.match(
        fixedCase.expectation.receiverAfterInternalReflection.kind === "unsupported"
          ? fixedCase.expectation.receiverAfterInternalReflection.reason
          : "",
        /^receiver-internal-reflection-unsupported: /,
      );
    }
    if (fixedCase.id === "R05-invalid-path-rejected") {
      assert.equal(fixedCase.expectation.attenuation.cpu.absorbedFluxRgb.kind, "unsupported");
      if (fixedCase.expectation.attenuation.cpu.absorbedFluxRgb.kind === "unsupported") {
        assert.match(fixedCase.expectation.attenuation.cpu.absorbedFluxRgb.reason, /^invalid-path-rejected: /);
      }
    }
  }
});

test("boundary-event-limit is unresolved exhaustion, not a TIR view case", () => {
  const boundary = R1_OBSERVATION_CASES[5];
  assert.equal(boundary.id, "R05-boundary-event-limit");
  const viewLayers = [
    boundary.expectation.viewSurfaceReflection,
    boundary.expectation.viewTransmission,
    boundary.expectation.viewInternalReflection,
  ];
  for (const viewLayer of viewLayers) {
    assert.equal(viewLayer.pathCodes, undefined);
    assert.equal(viewLayer.availability.kind, "backend-specific");
  }
  const receiverAvailability = boundary.expectation.receiverDelivery.availability;
  assert.equal(receiverAvailability.kind, "ambiguous");
  if (receiverAvailability.kind === "ambiguous") {
    assert.match(receiverAvailability.reason, /^boundary-event-limit: /);
    assert.doesNotMatch(receiverAvailability.reason, /tir/i);
  }
});

test("R1 fixed-case graph and lookup are deeply immutable without freezing R0.5 catalog", () => {
  assert.equal(Object.isFrozen(R1_OBSERVATION_CASES), true);
  assert.equal(Object.isFrozen(R1_OBSERVATION_EXPECTATIONS), true);
  assert.equal(Reflect.set(R1_OBSERVATION_CASES, 0, R1_OBSERVATION_CASES[0]), false);
  assert.equal(Reflect.set(R1_OBSERVATION_EXPECTATIONS, R1_OBSERVATION_CASES[0].id, R1_OBSERVATION_CASES[0].expectation), false);
  for (const fixedCase of R1_OBSERVATION_CASES) {
    assert.equal(Object.isFrozen(fixedCase), true);
    assert.strictEqual(R1_OBSERVATION_EXPECTATIONS[fixedCase.id], fixedCase.expectation);
    assert.equal(Object.isFrozen(fixedCase.expectation), true);
    const layers = [
      fixedCase.expectation.viewSurfaceReflection,
      fixedCase.expectation.viewTransmission,
      fixedCase.expectation.viewInternalReflection,
      fixedCase.expectation.receiverDelivery,
      fixedCase.expectation.shadowCoverage,
    ];
    for (const layerExpectation of layers) {
      assert.equal(Object.isFrozen(layerExpectation), true);
      assert.equal(Object.isFrozen(layerExpectation.availability), true);
      if (layerExpectation.pathCodes !== undefined) {
        assert.equal(Object.isFrozen(layerExpectation.pathCodes), true);
        assert.equal(Reflect.set(layerExpectation.pathCodes, 0, VIEW_PATH_CODE.noEvent), false);
      }
    }
    assert.equal(Object.isFrozen(fixedCase.expectation.receiverAfterInternalReflection), true);
    assert.equal(Object.isFrozen(fixedCase.expectation.attenuation), true);
    for (const attenuation of [fixedCase.expectation.attenuation.cpu, fixedCase.expectation.attenuation.webgpu]) {
      assert.equal(Object.isFrozen(attenuation), true);
      assert.equal(Object.isFrozen(attenuation.absorbedFluxRgb), true);
      assert.equal(Object.isFrozen(attenuation.interfaceLossFluxRgb), true);
      assert.equal(Object.isFrozen(attenuation.combinedAttenuationFluxRgb), true);
      assert.equal(Object.isFrozen(attenuation.unknownAttenuationFluxRgb), true);
    }
  }
});

test("R1 snapshot contract is versioned and backend/frame fields are finite", () => {
  const snapshot = {
    contractVersion: R1_OPTICAL_OBSERVATION_CONTRACT_VERSION,
    backend: "body-webgl",
    frameId: 12,
    capturedAtMs: 345.5,
    layers: {
      viewSurfaceReflection: { kind: "available" },
      receiverDelivery: {
        kind: "unsupported",
        reason: "body-no-receiver-transport: view backend",
      },
    },
  } as const satisfies R1ObservationSnapshot;
  assert.equal(snapshot.contractVersion, "hikari-optical-observation/1");
  assert.equal(Number.isFinite(snapshot.frameId), true);
  assert.equal(Number.isFinite(snapshot.capturedAtMs), true);
});

test("R1 GPU descriptor references the unchanged v1 payload layout", () => {
  assert.equal(R1_GPU_RESULT_DESCRIPTOR_V1.version, "hikari-gpu-optics-result/1");
  assert.equal(R1_GPU_RESULT_DESCRIPTOR_V1.floatsPerSample, GPU_OPTICS_RESULT_FLOATS);
  assert.strictEqual(R1_GPU_RESULT_DESCRIPTOR_V1.offsets, GPU_OPTICS_RESULT_OFFSETS);
  assert.deepEqual(R1_GPU_RESULT_DESCRIPTOR_V1.offsets, GPU_OPTICS_RESULT_OFFSETS);
  assert.deepEqual(R1_GPU_RESULT_DESCRIPTOR_V1.optionalFields, []);
  assert.equal(Object.isFrozen(R1_GPU_RESULT_DESCRIPTOR_V1.optionalFields), true);
  assert.equal(Reflect.set(R1_GPU_RESULT_DESCRIPTOR_V1.optionalFields, 0, "future-field"), false);
  assert.equal(R1_GPU_RESULT_DESCRIPTOR_V1.optionalFields.length, 0);
});

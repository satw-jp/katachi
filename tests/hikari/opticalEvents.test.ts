import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_OPTICAL_BACKEND_CAPABILITIES,
  OPTICAL_EVENT_CONTRACT_VERSION,
  observed,
  receiverFluxRgb,
  unavailable,
  validateOpticalEvent,
  viewRadianceRgb,
  type OpticalPathAttributes,
  type OpticalEvent,
  type ReceiverOpticalEvent,
  type ViewOpticalEvent,
} from "../../src/studies/cloud-sculpt/opticalEvents.ts";

const path: OpticalPathAttributes = {
  internalBounceCount: observed(0, "exact", "backend-branch"),
  hadInternalReflection: observed(false, "exact", "backend-branch"),
  opticalPathLength: observed({ shapeUnits: 2, millimetres: 40, scaleSource: "assumed" }, "exact", "lossless-derivation"),
  exitDirectionWorld: observed({ x: 0, y: 0, z: -1 }, "exact", "backend-branch"),
  mediumIds: unavailable("not-emitted-by-backend"),
  inclusionIds: unavailable("not-emitted-by-backend"),
};

function identity(sourceBackend: "body-webgl" | "cpu-receiver" | "webgpu-receiver") {
  return {
    contractVersion: OPTICAL_EVENT_CONTRACT_VERSION,
    sampleId: "test-sample",
    sceneRevision: "scene-r0.5",
    lightRevision: "light-r0.5",
    sourceBackend,
  } as const;
}

test("view and receiver events validate as separate domains", () => {
  const view: ViewOpticalEvent = {
    ...identity("body-webgl"),
    transportDomain: "view",
    outcome: { kind: "terminal", terminalEvent: observed("transmission", "exact", "backend-branch") },
    path,
    capturedRadianceRgb: observed(viewRadianceRgb({ r: 0.4, g: 0.5, b: 0.6 }), "exact", "backend-output"),
    sampleWeight: observed(1, "exact", "backend-output"),
  };
  const receiver: ReceiverOpticalEvent = {
    ...identity("cpu-receiver"),
    transportDomain: "receiver",
    outcome: { kind: "terminal", terminalEvent: observed("receiver-hit", "exact", "backend-branch") },
    path,
    receiverId: observed("test-floor", "exact", "backend-branch"),
    receiverUv: observed([0, 0] as const, "exact", "backend-branch"),
    deliveredFluxRgb: observed(receiverFluxRgb({ r: 0.2, g: 0.2, b: 0.2 }), "exact", "backend-output"),
    shadowCoverageWeight: observed(1, "exact", "backend-branch"),
    sampleWeight: observed(1, "exact", "backend-output"),
  };
  assert.deepEqual(validateOpticalEvent(view), []);
  assert.deepEqual(validateOpticalEvent(receiver), []);
});

test("validator rejects negative/non-finite RGB, weights, and inconsistent bounce state", () => {
  const event: ViewOpticalEvent = {
    ...identity("body-webgl"),
    transportDomain: "view",
    outcome: { kind: "terminal", terminalEvent: observed("transmission", "exact", "backend-branch") },
    path: {
      ...path,
      internalBounceCount: observed(-1, "exact", "backend-branch"),
      hadInternalReflection: observed(false, "exact", "backend-branch"),
    },
    capturedRadianceRgb: { state: "available", value: { r: Number.NaN, g: -1, b: 0 }, confidence: "exact", provenance: "backend-output" },
    sampleWeight: observed(-0.1, "exact", "backend-output"),
  };
  const issues = validateOpticalEvent(event);
  assert.ok(issues.some((issue) => issue.includes("internalBounceCount")));
  assert.ok(issues.some((issue) => issue.includes("RGB")));
  assert.ok(issues.some((issue) => issue.includes("sampleWeight")));
});

test("validator enforces terminal and diagnostic enums for available and backend-specific values", () => {
  const receiver: ReceiverOpticalEvent = {
    ...identity("cpu-receiver"),
    transportDomain: "receiver",
    outcome: {
      kind: "terminal",
      terminalEvent: { state: "backend-specific", backend: "cpu-receiver", semantics: "malformed test", value: "internal-reflection" as never },
    },
    path,
    receiverId: observed("test-floor", "exact", "backend-branch"),
    receiverUv: observed([0, 0] as const, "exact", "backend-branch"),
    deliveredFluxRgb: observed(receiverFluxRgb({ r: 0.2, g: 0.2, b: 0.2 }), "exact", "backend-output"),
    shadowCoverageWeight: observed(1, "exact", "backend-branch"),
    sampleWeight: observed(1, "exact", "backend-output"),
  };
  const receiverIssues = validateOpticalEvent(receiver);
  assert.ok(receiverIssues.some((issue) => issue.includes("receiver terminal event")));
  const availableInvalidReceiver = {
    ...receiver,
    outcome: { kind: "terminal", terminalEvent: observed("internal-reflection" as never, "exact", "backend-branch") },
  } as ReceiverOpticalEvent;
  assert.ok(validateOpticalEvent(availableInvalidReceiver).some((issue) => issue.includes("receiver terminal event")));

  const view: ViewOpticalEvent = {
    ...identity("body-webgl"),
    transportDomain: "view",
    outcome: {
      kind: "diagnostic",
      termination: { state: "backend-specific", backend: "body-webgl", semantics: "malformed test", value: "surface-reflection" as never },
    },
    path,
    capturedRadianceRgb: { state: "ambiguous", reason: "fixture" },
    sampleWeight: unavailable("not-emitted-by-backend"),
  };
  const viewIssues = validateOpticalEvent(view);
  assert.ok(viewIssues.some((issue) => issue.includes("diagnostic termination")));
});

test("validator reports malformed runtime shapes without throwing", () => {
  const malformed: unknown[] = [
    undefined,
    null,
    {},
    {
      ...identity("cpu-receiver"),
      transportDomain: "receiver",
      outcome: { kind: "terminal", terminalEvent: undefined },
      path: {
        internalBounceCount: undefined,
        hadInternalReflection: { state: "available", value: "yes" },
        opticalPathLength: { state: "available", value: null },
        exitDirectionWorld: { state: "available", value: null },
        mediumIds: { state: "available", value: null },
        inclusionIds: { state: "available", value: { not: "an-array" } },
      },
      receiverId: { state: "available", value: 42 },
      receiverUv: { state: "available", value: { length: 2 } },
      deliveredFluxRgb: { state: "available", value: null },
      shadowCoverageWeight: { state: "available", value: Number.NaN },
      sampleWeight: { state: "available", value: -1 },
    },
    {
      ...identity("webgpu-receiver"),
      transportDomain: "receiver",
      outcome: { kind: "diagnostic", termination: { state: "available", value: "not-a-termination" } },
      path: {
        internalBounceCount: { state: "available", value: 0 },
        hadInternalReflection: { state: "available", value: false },
        opticalPathLength: { state: "available", value: { shapeUnits: 1, millimetres: 20, scaleSource: "assumed" } },
        exitDirectionWorld: { state: "backend-specific", backend: "webgpu-receiver", semantics: "payload" },
        mediumIds: { state: "available", value: ["host"] },
        inclusionIds: { state: "available", value: [] },
      },
      receiverId: unavailable("not-emitted-by-backend"),
      receiverUv: unavailable("unsupported-path"),
      deliveredFluxRgb: unavailable("unsupported-path"),
      shadowCoverageWeight: unavailable("unsupported-path"),
      sampleWeight: observed(1, "exact", "backend-output"),
    },
  ];

  for (const candidate of malformed) {
    let issues: readonly string[] = [];
    assert.doesNotThrow(() => {
      issues = validateOpticalEvent(candidate as OpticalEvent);
    });
    assert.ok(issues.length > 0, "malformed candidate must produce at least one issue");
  }
});

test("capability matrix exactly names the three R0.5 backends and domains", () => {
  assert.deepEqual(CURRENT_OPTICAL_BACKEND_CAPABILITIES, [
    {
      backend: "body-webgl",
      domain: "view",
      capabilities: {
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
      },
    },
    {
      backend: "cpu-receiver",
      domain: "receiver",
      capabilities: {
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
      },
    },
    {
      backend: "webgpu-receiver",
      domain: "receiver",
      capabilities: {
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
      },
    },
  ]);
});

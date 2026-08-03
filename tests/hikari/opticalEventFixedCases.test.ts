import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DEFAULT_HIKARI_SETTINGS } from "../../src/studies/cloud-sculpt/hikari.ts";
import { OpticsLayer, type OpticalSettings } from "../../src/studies/cloud-sculpt/optics.ts";
import { findInvalidContainment } from "../../src/studies/cloud-sculpt/opticalGeometry.ts";
import { traceStraightRay } from "../../src/studies/cloud-sculpt/opticalTrace.ts";
import {
  DEFAULT_ASSUMED_PHYSICAL_SCALE,
  IDENTITY_POSE,
  opticalDepthForShapePath,
  transmissionFromOpticalDepth,
  type Medium,
  type OpticalScene,
} from "../../src/studies/cloud-sculpt/opticalScene.ts";
import {
  blurCoverageEnergyNormalized,
  createReceiverTransportField,
  integrateCoverageFlux,
  integrateFluxRgb,
  splatBilinearCoverageFlux,
  splatBilinearFluxRgb,
} from "../../src/studies/cloud-sculpt/receiverTransport.ts";
import {
  adaptCurrentEnergyLedger,
  evaluateReceiverClosure,
  type FrameTransportLedger,
} from "../../src/studies/cloud-sculpt/frameTransportLedger.ts";
import {
  bodyCapabilityDescriptor,
  adaptCpuReceiverObservation,
  recordReceiverObservation,
  type CpuReceiverSampleObservation,
  type ReceiverSampleObservation,
  type ReceiverEventSink,
} from "../../src/studies/cloud-sculpt/opticalEventAdapters.ts";
import {
  observed,
  receiverFluxRgb,
  unavailable,
  validateOpticalEvent,
  type OpticalPathAttributes,
  type ReceiverFluxRgb,
  type ViewOpticalEvent,
} from "../../src/studies/cloud-sculpt/opticalEvents.ts";
import { OPTICAL_EVENT_FIXED_CASES } from "./fixtures/opticalEventCases.ts";

function medium(
  id: string,
  radius: number,
  center: { x: number; y: number; z: number },
  ior: number,
  absorptionPerMm = { r: 0, g: 0, b: 0 },
): Medium {
  return {
    id,
    material: { id, label: id, ior, absorptionPerMm, roughness: 0 },
    shape: { kind: "balls-smooth-union", balls: [{ center, radius }], smoothness: 0 },
    pose: IDENTITY_POSE,
  };
}

function sceneForBoundaryCase(): OpticalScene {
  return {
    host: medium("host", 1.5, { x: 0, y: 0, z: 0 }, 1.5),
    inclusions: [medium("inclusion-limit", 0.4, { x: 0, y: 0, z: 0 }, 1.2)],
    receiver: { id: "test-floor", pose: IDENTITY_POSE, normal: { x: 0, y: 1, z: 0 } },
    light: { direction: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 } },
    physicalScale: { mmPerShapeUnit: 20, source: "assumed" },
    boundaryEpsilon: 1e-5,
  };
}

function sceneForSimpleSphere(absorptionPerMm = { r: 0, g: 0, b: 0 }): OpticalScene {
  return {
    host: medium("host", 1, { x: 0, y: 0, z: 0 }, 1.5, absorptionPerMm),
    inclusions: [],
    receiver: { id: "test-floor", pose: IDENTITY_POSE, normal: { x: 0, y: 1, z: 0 } },
    light: { direction: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 } },
    physicalScale: { mmPerShapeUnit: 20, source: "assumed" },
    boundaryEpsilon: 1e-5,
  };
}

function sceneForInclusionPass(): OpticalScene {
  return {
    host: medium("host", 1.5, { x: 0, y: 0, z: 0 }, 1.5, { r: 0.005, g: 0.005, b: 0.005 }),
    inclusions: [medium("inclusion-a", 0.35, { x: 0, y: 0, z: 0 }, 1.2, { r: 0.001, g: 0.02, b: 0.04 })],
    receiver: { id: "test-floor", pose: IDENTITY_POSE, normal: { x: 0, y: 0, z: 1 } },
    light: { direction: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 } },
    physicalScale: { mmPerShapeUnit: 20, source: "assumed" },
    boundaryEpsilon: 1e-5,
  };
}

const path: OpticalPathAttributes = {
  internalBounceCount: observed(0, "exact", "backend-branch"),
  hadInternalReflection: observed(false, "exact", "backend-branch"),
  opticalPathLength: observed({ shapeUnits: 2, millimetres: 40, scaleSource: "assumed" }, "exact", "lossless-derivation"),
  exitDirectionWorld: observed({ x: 0, y: 0, z: -1 }, "exact", "backend-branch"),
  mediumIds: unavailable("not-emitted-by-backend"),
  inclusionIds: unavailable("not-emitted-by-backend"),
};

const scope = {
  kind: "affected-baseline-in-fixed-receiver-domain" as const,
  receiverId: "test-floor",
  sceneRevision: "fixture",
  lightRevision: "fixture",
};

function closedLedger(values: {
  emitted: ReceiverFluxRgb;
  delivered: ReceiverFluxRgb;
  absorbed: ReceiverFluxRgb;
  escaped: ReceiverFluxRgb;
  rejected: ReceiverFluxRgb;
  unresolved: ReceiverFluxRgb;
}): FrameTransportLedger {
  return {
    contractVersion: "hikari-frame-transport-ledger/0.5",
    sourceBackend: "cpu-receiver",
    receiver: {
      scope,
      emittedFluxRgb: observed(values.emitted, "exact", "backend-output"),
      deliveredFluxRgb: observed(values.delivered, "exact", "backend-output"),
      absorbedFluxRgb: observed(values.absorbed, "exact", "backend-output"),
      escapedFluxRgb: observed(values.escaped, "exact", "backend-output"),
      rejectedFluxRgb: observed(values.rejected, "exact", "backend-output"),
      unresolvedFluxRgb: observed(values.unresolved, "exact", "backend-output"),
    },
    view: {
      capturedRadianceIntegralRgb: unavailable("not-emitted-by-backend"),
      sampleWeight: unavailable("not-emitted-by-backend"),
    },
  };
}

function unitLedger(partial: Partial<{
  delivered: number;
  absorbed: number;
  escaped: number;
  rejected: number;
  unresolved: number;
}>): FrameTransportLedger {
  const delivered = partial.delivered ?? 0;
  const absorbed = partial.absorbed ?? 0;
  const escaped = partial.escaped ?? 0;
  const rejected = partial.rejected ?? 0;
  const unresolved = partial.unresolved ?? 0;
  return closedLedger({
    emitted: receiverFluxRgb({ r: 1, g: 1, b: 1 }),
    delivered: receiverFluxRgb({ r: delivered, g: delivered, b: delivered }),
    absorbed: receiverFluxRgb({ r: absorbed, g: absorbed, b: absorbed }),
    escaped: receiverFluxRgb({ r: escaped, g: escaped, b: escaped }),
    rejected: receiverFluxRgb({ r: rejected, g: rejected, b: rejected }),
    unresolved: receiverFluxRgb({ r: unresolved, g: unresolved, b: unresolved }),
  });
}

function cpuDiagnosticEvent(outcome: "escaped" | "rejected" | "unresolved") {
  return adaptCpuReceiverObservation({
    backend: "cpu-receiver",
    sampleId: `fixture:${outcome}`,
    sceneRevision: "fixture",
    lightRevision: "fixture",
    outcome,
    path,
    receiverId: observed("test-floor", "exact", "backend-branch"),
    receiverUv: observed([0, 0] as const, "bounded", "backend-branch"),
    deliveredFluxRgb: unavailable("unsupported-path"),
    shadowCoverageWeight: observed(1, "exact", "backend-branch"),
    sampleWeight: observed(1, "exact", "backend-output"),
  });
}

function case9InstrumentationSettings(): OpticalSettings {
  return {
    ...DEFAULT_HIKARI_SETTINGS,
    opticalSampleCount: 256,
    opticalRayCount: 8,
    opticalSeed: "R05-receiver-escaped",
    inclusionEnabled: false,
    inclusionMode: "single",
    lightWidth: 1,
    sunSize: 0.53,
  };
}

function outsideCase9ReceiverDomain(observation: ReceiverSampleObservation): boolean {
  if (observation.receiverUv.state !== "available") return false;
  const [u, v] = observation.receiverUv.value;
  return u < -16 || u > 16 || v < -16 || v > 16;
}

function report(id: string): void {
  console.log(`FIXED_CASE_RESULT ${id} PASS`);
}

test("catalog has all ten exact IDs and no duplicate", () => {
  const ids = OPTICAL_EVENT_FIXED_CASES.map((fixedCase) => fixedCase.id);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(ids, [
    "R05-view-surface-reflection",
    "R05-view-simple-transmission",
    "R05-path-internal-reflection",
    "R05-receiver-focus",
    "R05-receiver-absorbing-medium",
    "R05-boundary-event-limit",
    "R05-inclusion-pass",
    "R05-shadow-coverage",
    "R05-receiver-escaped",
    "R05-invalid-path-rejected",
  ]);
  for (const fixedCase of OPTICAL_EVENT_FIXED_CASES) {
    assert.equal(fixedCase.physicalScale.mmPerShapeUnit, 20);
    assert.equal(fixedCase.physicalScale.source, "assumed");
    assert.ok(fixedCase.tolerance.contract <= 1e-12);
  }
});

test("R05-view-surface-reflection: BODY remains ambiguous and View stays separate", () => {
  assert.deepEqual(OPTICAL_EVENT_FIXED_CASES[0].reference.surfacePoint, { x: 0, y: 0, z: 1 });
  assert.equal(bodyCapabilityDescriptor.capabilities.terminalEvent, "ambiguous");
  assert.equal(bodyCapabilityDescriptor.capabilities.capturedRadiance, "ambiguous");
  const event: ViewOpticalEvent = {
    contractVersion: "hikari-optical-event/0.5",
    sampleId: "R05-view-surface-reflection:1",
    sceneRevision: "fixture",
    lightRevision: "fixture",
    sourceBackend: "body-webgl",
    transportDomain: "view",
    outcome: { kind: "terminal", terminalEvent: observed("surface-reflection", "exact", "backend-branch") },
    path,
    capturedRadianceRgb: { state: "ambiguous", reason: "BODY final mix contains reflection and transmission" },
    sampleWeight: { state: "backend-specific", backend: "body-webgl", semantics: "Realtime/progressive weighting is not emitted" },
  };
  assert.deepEqual(validateOpticalEvent(event), []);
  report("R05-view-surface-reflection");
});

test("R05-view-simple-transmission: center chord, exit direction, and terminal distinction", () => {
  const fixedCase = OPTICAL_EVENT_FIXED_CASES[1];
  const ray = { origin: fixedCase.reference.rayOrigin!, direction: fixedCase.reference.rayDirection! };
  const trace = traceStraightRay(sceneForSimpleSphere(), ray, { maxDistance: 8, maxEvents: 4 });
  assert.equal(trace.valid, true);
  const hostSegment = trace.segments.find((segment) => segment.mediumId === "host");
  assert.ok(hostSegment);
  assert.ok(Math.abs(hostSegment.lengthShapeUnits - fixedCase.expected.pathLengthShapeUnits!) <= fixedCase.tolerance.pathShapeUnits);
  assert.equal(fixedCase.expected.pathLengthShapeUnits, 2);
  assert.equal(fixedCase.expected.pathLengthMillimetres, 40);
  assert.equal(trace.boundaryEvents.length, 2);
  assert.ok(Math.abs(trace.boundaryEvents[0].point.z - 1) <= fixedCase.tolerance.pointShapeUnits);
  assert.ok(Math.abs(trace.boundaryEvents[1].point.z + 1) <= fixedCase.tolerance.pointShapeUnits);
  assert.ok(Math.abs(trace.throughput.r - 0.9216) <= fixedCase.tolerance.throughput);
  assert.ok(Math.abs(trace.throughput.g - 0.9216) <= fixedCase.tolerance.throughput);
  assert.ok(Math.abs(trace.throughput.b - 0.9216) <= fixedCase.tolerance.throughput);
  assert.deepEqual(ray.direction, { x: 0, y: 0, z: -1 });
  assert.equal(path.exitDirectionWorld.state, "available");
  if (path.exitDirectionWorld.state === "available") assert.deepEqual(path.exitDirectionWorld.value, { x: 0, y: 0, z: -1 });
  const event: ViewOpticalEvent = {
    contractVersion: "hikari-optical-event/0.5",
    sampleId: "R05-view-simple-transmission:1",
    sceneRevision: "fixture",
    lightRevision: "fixture",
    sourceBackend: "body-webgl",
    transportDomain: "view",
    outcome: { kind: "terminal", terminalEvent: observed("transmission", "exact", "backend-branch") },
    path,
    capturedRadianceRgb: unavailable("mixed-in-final-output"),
    sampleWeight: unavailable("not-emitted-by-backend"),
  };
  assert.deepEqual(validateOpticalEvent(event), []);
  assert.equal(event.outcome.kind, "terminal");
  if (event.outcome.kind === "terminal" && event.outcome.terminalEvent.state === "available") {
    assert.equal(event.outcome.terminalEvent.value, "transmission");
  }
  report("R05-view-simple-transmission");
});

test("R05-path-internal-reflection: deterministic exit geometry establishes TIR metadata", () => {
  const fixedCase = OPTICAL_EVENT_FIXED_CASES[2];
  const origin = fixedCase.reference.rayOrigin!;
  const direction = fixedCase.reference.rayDirection!;
  assert.deepEqual(origin, { x: 0, y: 0, z: 0.8 });
  assert.deepEqual(direction, { x: 1, y: 0, z: 0 });
  const radius = fixedCase.geometry.hostRadius;
  const b = 2 * (origin.x * direction.x + origin.y * direction.y + origin.z * direction.z);
  const c = origin.x ** 2 + origin.y ** 2 + origin.z ** 2 - radius ** 2;
  const discriminant = b ** 2 - 4 * c;
  assert.ok(discriminant > 0);
  const tExit = (-b + Math.sqrt(discriminant)) / 2;
  const exitPoint = {
    x: origin.x + direction.x * tExit,
    y: origin.y + direction.y * tExit,
    z: origin.z + direction.z * tExit,
  };
  const exitNormalLength = Math.hypot(exitPoint.x, exitPoint.y, exitPoint.z);
  const exitNormal = {
    x: exitPoint.x / exitNormalLength,
    y: exitPoint.y / exitNormalLength,
    z: exitPoint.z / exitNormalLength,
  };
  assert.ok(Math.abs(tExit - 0.6) <= fixedCase.tolerance.pointShapeUnits);
  assert.ok(Math.abs(exitNormal.x - 0.6) <= fixedCase.tolerance.pointShapeUnits);
  assert.ok(Math.abs(exitNormal.z - 0.8) <= fixedCase.tolerance.pointShapeUnits);
  const cosine = Math.abs(direction.x * exitNormal.x + direction.y * exitNormal.y + direction.z * exitNormal.z);
  const sinSquared = 1 - cosine ** 2;
  const criticalSin = 1 / fixedCase.material.hostIor;
  const refractedDiscriminant = 1 - fixedCase.material.hostIor ** 2 * sinSquared;
  assert.ok(sinSquared > criticalSin ** 2);
  assert.ok(refractedDiscriminant < 0, "the deterministic exit is beyond the host/air critical angle");
  const reflected = {
    x: direction.x - 2 * (direction.x * exitNormal.x) * exitNormal.x,
    y: direction.y - 2 * (direction.x * exitNormal.x) * exitNormal.y,
    z: direction.z - 2 * (direction.x * exitNormal.x) * exitNormal.z,
  };
  const tirPath: OpticalPathAttributes = {
    ...path,
    internalBounceCount: observed(1, "exact", "backend-branch"),
    hadInternalReflection: observed(true, "exact", "backend-branch"),
    opticalPathLength: observed({ shapeUnits: tExit, millimetres: tExit * fixedCase.physicalScale.mmPerShapeUnit, scaleSource: "assumed" }, "exact", "lossless-derivation"),
    exitDirectionWorld: observed(reflected, "exact", "backend-branch"),
  };
  const event: ViewOpticalEvent = {
    contractVersion: "hikari-optical-event/0.5",
    sampleId: "R05-path-internal-reflection:1",
    sceneRevision: "fixture",
    lightRevision: "fixture",
    sourceBackend: "body-webgl",
    transportDomain: "view",
    outcome: { kind: "terminal", terminalEvent: observed("transmission", "exact", "backend-branch") },
    path: tirPath,
    capturedRadianceRgb: unavailable("mixed-in-final-output"),
    sampleWeight: unavailable("not-emitted-by-backend"),
  };
  assert.deepEqual(validateOpticalEvent(event), []);
  assert.equal(event.outcome.kind, "terminal");
  assert.equal(event.path.internalBounceCount.state, "available");
  if (event.path.internalBounceCount.state === "available") assert.ok(event.path.internalBounceCount.value >= fixedCase.expected.internalBounceCount!.minimum);
  report("R05-path-internal-reflection");
});

test("R05-receiver-focus: positive RGB deposit and closed pure ledger", () => {
  const field = createReceiverTransportField({ receiverId: "test-floor", sceneRevision: "fixture", lightRevision: "fixture", width: 16, height: 16, minU: -16, minV: -16, sizeU: 32, sizeV: 32 });
  const splat = splatBilinearFluxRgb(field, 0, 0, { r: 0.7, g: 0.6, b: 0.5 });
  assert.deepEqual(splat.escapedRgb, { r: 0, g: 0, b: 0 });
  assert.ok(integrateFluxRgb(field).r > 0);
  const recorded: CpuReceiverSampleObservation[] = [];
  const sink: ReceiverEventSink = (observation) => recorded.push(observation);
  recordReceiverObservation(sink, {
    backend: "cpu-receiver",
    sampleId: "R05-receiver-focus:sink",
    sceneRevision: "fixture",
    lightRevision: "fixture",
    outcome: "receiver-hit",
    path,
    receiverId: observed("test-floor", "exact", "backend-branch"),
    receiverUv: observed([0, 0] as const, "bounded", "backend-branch"),
    deliveredFluxRgb: observed({ r: 0.7, g: 0.6, b: 0.5 }, "exact", "backend-output"),
    shadowCoverageWeight: observed(1, "exact", "backend-branch"),
    sampleWeight: observed(1, "exact", "backend-output"),
  });
  assert.equal(recorded.length, 1);
  const event = adaptCpuReceiverObservation(recorded[0]);
  assert.equal(event.outcome.kind, "terminal");
  assert.equal(event.deliveredFluxRgb.state, "available");
  if (event.deliveredFluxRgb.state === "available") assert.ok(event.deliveredFluxRgb.value.r > 0 && event.deliveredFluxRgb.value.g > 0 && event.deliveredFluxRgb.value.b > 0);
  assert.equal(evaluateReceiverClosure(unitLedger({ delivered: 1 })).status, "closed");
  report("R05-receiver-focus");
});

test("R05-receiver-absorbing-medium: per-channel Beer-Lambert factors and mixed loss", () => {
  const fixedCase = OPTICAL_EVENT_FIXED_CASES[4];
  const depth = opticalDepthForShapePath(2, { absorptionPerMm: fixedCase.material.hostAbsorptionPerMm }, fixedCase.physicalScale);
  const factors = transmissionFromOpticalDepth(depth);
  assert.deepEqual(depth, { r: 0.4, g: 0.8, b: 1.6 });
  assert.ok(Math.abs(factors.r - Math.exp(-0.4)) <= fixedCase.tolerance.throughput);
  assert.ok(Math.abs(factors.g - Math.exp(-0.8)) <= fixedCase.tolerance.throughput);
  assert.ok(Math.abs(factors.b - Math.exp(-1.6)) <= fixedCase.tolerance.throughput);
  assert.ok(factors.r > factors.g && factors.g > factors.b);
  const trace = traceStraightRay(sceneForSimpleSphere(fixedCase.material.hostAbsorptionPerMm), {
    origin: fixedCase.reference.rayOrigin!,
    direction: fixedCase.reference.rayDirection!,
  }, { maxDistance: 8, maxEvents: 4 });
  assert.equal(trace.valid, true);
  const hostDepth = trace.opticalDepthByMedium.find((entry) => entry.mediumId === "host");
  assert.ok(hostDepth);
  assert.ok(Math.abs(hostDepth.opticalDepth.r - depth.r) <= fixedCase.tolerance.throughput);
  assert.ok(Math.abs(hostDepth.opticalDepth.g - depth.g) <= fixedCase.tolerance.throughput);
  assert.ok(Math.abs(hostDepth.opticalDepth.b - depth.b) <= fixedCase.tolerance.throughput);
  const current = {
    incidentRgb: { r: 1, g: 1, b: 1 }, depositedRgb: { r: 0.9, g: 0.8, b: 0.6 }, absorbedRgb: { r: 0.1, g: 0.2, b: 0.4 },
    reflectedRgb: { r: 0, g: 0, b: 0 }, escapedRgb: { r: 0, g: 0, b: 0 }, supportRejectedRgb: { r: 0, g: 0, b: 0 }, unresolvedLossRgb: { r: 0, g: 0, b: 0 }, accountedRgb: { r: 1, g: 1, b: 1 }, residualRgb: { r: 0, g: 0, b: 0 }, relativeResidual: 0,
  };
  const adapted = adaptCurrentEnergyLedger(current, "cpu-receiver", scope);
  assert.equal(adapted.receiver.absorbedFluxRgb.state, "ambiguous");
  assert.equal(evaluateReceiverClosure(adapted).status, "not-computable");
  report("R05-receiver-absorbing-medium");
});

test("R05-boundary-event-limit: maxEvents is unresolved once and closes", () => {
  const fixedCase = OPTICAL_EVENT_FIXED_CASES[5];
  const scene = sceneForBoundaryCase();
  const limited = traceStraightRay(scene, { origin: fixedCase.reference.rayOrigin!, direction: fixedCase.reference.rayDirection! }, { maxDistance: 8, maxEvents: fixedCase.reference.maxEvents });
  assert.equal(limited.valid, false);
  assert.ok(limited.issues.some((issue) => issue.includes("maxEvents")));
  const unresolvedEvent = cpuDiagnosticEvent("unresolved");
  assert.equal(unresolvedEvent.outcome.kind, "diagnostic");
  if (unresolvedEvent.outcome.kind === "diagnostic" && unresolvedEvent.outcome.termination.state === "available") assert.equal(unresolvedEvent.outcome.termination.value, "unresolved");
  assert.equal(evaluateReceiverClosure(unitLedger({ delivered: 0.995, unresolved: 0.005 })).status, "closed");
  report("R05-boundary-event-limit");
});

test("R05-inclusion-pass: separate inclusion-a boundaries and throughput", () => {
  const fixedCase = OPTICAL_EVENT_FIXED_CASES[6];
  const scene = sceneForInclusionPass();
  const passed = traceStraightRay(scene, { origin: fixedCase.reference.rayOrigin!, direction: fixedCase.reference.rayDirection! }, { maxDistance: 8, maxEvents: fixedCase.reference.maxEvents });
  assert.equal(passed.valid, true);
  assert.ok(passed.boundaryEvents.some((event) => event.boundaryMediumId === "inclusion-a"));
  assert.ok(passed.boundaryEvents.some((event) => event.fromMediumId === "host" && event.toMediumId === "inclusion-a"));
  assert.ok(passed.throughput.r < 1 && passed.throughput.g < 1 && passed.throughput.b < 1);
  const unresolved = cpuDiagnosticEvent("unresolved");
  assert.equal(unresolved.outcome.kind, "diagnostic");
  report("R05-inclusion-pass");
});

test("R05-shadow-coverage: 16x16 scalar splat/blur preserves coverage without RGB", () => {
  const fixedCase = OPTICAL_EVENT_FIXED_CASES[7];
  const fixture = fixedCase.reference.pureField!;
  const field = createReceiverTransportField({ receiverId: "test-floor", sceneRevision: "fixture", lightRevision: "fixture", ...fixture });
  assert.equal(splatBilinearCoverageFlux(field, 0, 0, 1).escaped, 0);
  const before = integrateCoverageFlux(field);
  const blurred = blurCoverageEnergyNormalized(field, 2);
  const after = integrateCoverageFlux(blurred);
  assert.ok(Math.abs(before - after) <= fixedCase.tolerance.coverage);
  assert.deepEqual(integrateFluxRgb(field), { r: 0, g: 0, b: 0 });
  report("R05-shadow-coverage");
});

test("R05-receiver-escaped: normalized out-of-domain RGB splat is escaped once", () => {
  const fixedCase = OPTICAL_EVENT_FIXED_CASES[8];
  const direction = fixedCase.reference.rayDirection!;
  assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-6);
  const field = createReceiverTransportField({ receiverId: "test-floor", sceneRevision: "fixture", lightRevision: "fixture", width: 16, height: 16, minU: -16, minV: -16, sizeU: 32, sizeV: 32 });
  const escaped = splatBilinearFluxRgb(field, 20, 0, { r: 1, g: 0.5, b: 0.25 });
  assert.ok(escaped.escapedRgb.r > 0);
  assert.deepEqual(integrateFluxRgb(field), { r: 0, g: 0, b: 0 });
  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const observations: ReceiverSampleObservation[] = [];
  const rebuildCpu = (layer as unknown as { rebuildCpu: Function }).rebuildCpu;
  const instrumented = rebuildCpu.call(
    layer,
    [{ id: 1, x: 0, y: 0, z: 0, r: 1 }],
    0,
    case9InstrumentationSettings(),
    { sampleCountOverride: 256, publish: false, eventSink: (observation: ReceiverSampleObservation) => observations.push(observation) },
  ) as { field: { diagnostics: { outOfDomainDepositCount: number; energyLedger: { escapedRgb: { r: number; g: number; b: number } } } } };
  assert.ok(instrumented.field.diagnostics.outOfDomainDepositCount > 0);
  const outsideEvents = observations.filter(outsideCase9ReceiverDomain);
  assert.ok(outsideEvents.length > 0, "case 9 must exercise an actual CPU out-of-domain instrumentation event");
  assert.ok(outsideEvents.every((observation) => observation.outcome === "escaped"));
  assert.equal(observations.filter((observation) => outsideCase9ReceiverDomain(observation) && observation.outcome === "receiver-hit").length, 0);
  const escapedEvent = adaptCpuReceiverObservation(outsideEvents[0]);
  assert.equal(escapedEvent.outcome.kind, "diagnostic");
  if (escapedEvent.outcome.kind === "diagnostic" && escapedEvent.outcome.termination.state === "available") {
    assert.equal(escapedEvent.outcome.termination.value, "escaped");
  }
  assert.ok(instrumented.field.diagnostics.energyLedger.escapedRgb.r > 0);
  assert.equal(evaluateReceiverClosure(unitLedger({ escaped: 1 })).status, "closed");
  report("R05-receiver-escaped");
});

test("R05-invalid-path-rejected: containment witness is rejected once", () => {
  const scene: OpticalScene = {
    ...sceneForBoundaryCase(),
    host: medium("host", 1, { x: 0, y: 0, z: 0 }, 1.5),
    inclusions: [medium("invalid-inclusion", 0.4, { x: 1.2, y: 0, z: 0 }, 1.2)],
    physicalScale: DEFAULT_ASSUMED_PHYSICAL_SCALE,
  };
  const failure = findInvalidContainment(scene);
  assert.ok(failure);
  assert.equal(failure.inclusionId, "invalid-inclusion");
  const rejectedEvent = cpuDiagnosticEvent("rejected");
  assert.equal(rejectedEvent.outcome.kind, "diagnostic");
  assert.equal(evaluateReceiverClosure(unitLedger({ rejected: 1 })).status, "closed");
  report("R05-invalid-path-rejected");
});

test("CPU adapter preserves a concrete inclusion id and normalized direction", () => {
  const event = adaptCpuReceiverObservation({
    backend: "cpu-receiver",
    sampleId: "cpu-inclusion",
    sceneRevision: "fixture",
    lightRevision: "fixture",
    outcome: "receiver-hit",
    path: {
      ...path,
      exitDirectionWorld: observed({ x: 3, y: 0, z: 4 }, "bounded", "backend-branch"),
      inclusionIds: { state: "backend-specific", backend: "cpu-receiver", semantics: "single inclusion", value: ["inclusion-a"] },
    },
    receiverId: observed("test-floor", "exact", "backend-branch"),
    receiverUv: observed([0, 0] as const, "bounded", "backend-branch"),
    deliveredFluxRgb: observed({ r: 1, g: 1, b: 1 }, "exact", "backend-output"),
    shadowCoverageWeight: observed(1, "exact", "backend-branch"),
    sampleWeight: observed(1, "exact", "backend-output"),
  });
  assert.equal(event.path.exitDirectionWorld.state, "available");
  if (event.path.exitDirectionWorld.state === "available") assert.ok(Math.abs(Math.hypot(event.path.exitDirectionWorld.value.x, event.path.exitDirectionWorld.value.y, event.path.exitDirectionWorld.value.z) - 1) <= 1e-12);
});

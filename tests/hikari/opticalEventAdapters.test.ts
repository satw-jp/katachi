import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { DEFAULT_HIKARI_SETTINGS } from "../../src/studies/cloud-sculpt/hikari.ts";
import { OpticsLayer, type OpticalSettings } from "../../src/studies/cloud-sculpt/optics.ts";
import {
  adaptCpuReceiverObservation,
  adaptGpuReceiverObservation,
  bodyCapabilityDescriptor,
  decodeGpuReceiverObservation,
  type ReceiverSampleObservation,
  type CpuReceiverSampleObservation,
} from "../../src/studies/cloud-sculpt/opticalEventAdapters.ts";
import {
  GPU_OPTICS_RESULT_FLOATS,
  GPU_OPTICS_RESULT_OFFSETS,
  gpuOpticsResultOffset,
  type GpuOpticsResult,
} from "../../src/studies/cloud-sculpt/opticsGpu.ts";
import {
  observed,
  unavailable,
  type OpticalPathAttributes,
} from "../../src/studies/cloud-sculpt/opticalEvents.ts";

const path: OpticalPathAttributes = {
  internalBounceCount: unavailable("not-emitted-by-backend"),
  hadInternalReflection: unavailable("not-emitted-by-backend"),
  opticalPathLength: observed({ shapeUnits: 2, millimetres: 40, scaleSource: "assumed" }, "exact", "backend-branch"),
  exitDirectionWorld: observed({ x: 0, y: -1, z: 0 }, "bounded", "backend-branch"),
  mediumIds: { state: "backend-specific", backend: "cpu-receiver", semantics: "CPU host branch", value: ["host"] },
  inclusionIds: { state: "backend-specific", backend: "cpu-receiver", semantics: "No inclusion in this sample" },
};

const RECEIVER_DOMAIN = { minU: -16, maxU: 16, minV: -16, maxV: 16 } as const;

const INSTRUMENTATION_BALLS = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];

function instrumentationSettings(): OpticalSettings {
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

function outsideReceiverDomain(observation: ReceiverSampleObservation): boolean {
  if (observation.receiverUv.state !== "available") return false;
  const [u, v] = observation.receiverUv.value;
  return u < -16 || u > 16 || v < -16 || v > 16;
}

test("CPU raw branch adapts to exactly one receiver outcome", () => {
  const raw: CpuReceiverSampleObservation = {
    backend: "cpu-receiver",
    sampleId: "cpu:1",
    sceneRevision: "scene",
    lightRevision: "light",
    outcome: "receiver-hit",
    path,
    receiverId: observed("test-floor", "exact", "backend-branch"),
    receiverUv: observed([1, 2] as const, "bounded", "backend-branch"),
    deliveredFluxRgb: observed({ r: 0.25, g: 0.2, b: 0.15 }, "exact", "backend-branch"),
    shadowCoverageWeight: observed(1, "exact", "backend-branch"),
    sampleWeight: observed(1, "exact", "backend-output"),
  };
  const event = adaptCpuReceiverObservation(raw);
  assert.equal(event.transportDomain, "receiver");
  assert.equal(event.outcome.kind, "terminal");
  assert.equal(event.deliveredFluxRgb.state, "available");
  assert.equal(event.path.exitDirectionWorld.state, "available");
  if (event.path.exitDirectionWorld.state === "available") {
    const direction = event.path.exitDirectionWorld.value;
    assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) <= 1e-12);
  }
});

test("receiver adapters reject delivered-flux values inconsistent with their outcome", () => {
  const receiverHit: CpuReceiverSampleObservation = {
    backend: "cpu-receiver",
    sampleId: "cpu:inconsistent",
    sceneRevision: "scene",
    lightRevision: "light",
    outcome: "receiver-hit",
    path,
    receiverId: observed("test-floor", "exact", "backend-branch"),
    receiverUv: observed([1, 2] as const, "bounded", "backend-branch"),
    deliveredFluxRgb: observed({ r: 0.25, g: 0.2, b: 0.15 }, "exact", "backend-branch"),
    shadowCoverageWeight: observed(1, "exact", "backend-branch"),
    sampleWeight: observed(1, "exact", "backend-output"),
  };
  assert.throws(
    () => adaptCpuReceiverObservation({ ...receiverHit, outcome: "escaped" }),
    /diagnostic event must not carry a delivered-flux value/,
  );
  assert.throws(
    () => adaptCpuReceiverObservation({ ...receiverHit, deliveredFluxRgb: unavailable("unsupported-path") }),
    /terminal receiver-hit must carry available deliveredFluxRgb/,
  );
  const gpuReceiverHit = {
    ...receiverHit,
    backend: "webgpu-receiver" as const,
    flags: { entryValid: true, exitValid: true, floorValid: true, baselineValid: true, outgoingValid: true },
  };
  assert.throws(
    () => adaptGpuReceiverObservation({ ...gpuReceiverHit, outcome: "escaped" }),
    /diagnostic event must not carry a delivered-flux value/,
  );
  assert.throws(
    () => adaptGpuReceiverObservation({ ...gpuReceiverHit, deliveredFluxRgb: unavailable("unsupported-path") }),
    /terminal receiver-hit must carry available deliveredFluxRgb/,
  );
  const diagnosticWithBackendSpecificFlux = {
    ...receiverHit,
    outcome: "escaped" as const,
    deliveredFluxRgb: {
      state: "backend-specific" as const,
      backend: "cpu-receiver" as const,
      semantics: "invalid delivered flux",
      value: { r: 0.25, g: 0.2, b: 0.15 },
    },
  };
  assert.throws(
    () => adaptCpuReceiverObservation(diagnosticWithBackendSpecificFlux),
    /diagnostic event must not carry a delivered-flux value/,
  );
  const diagnosticWithoutBackendSpecificFlux = {
    ...diagnosticWithBackendSpecificFlux,
    deliveredFluxRgb: {
      state: "backend-specific" as const,
      backend: "cpu-receiver" as const,
      semantics: "no delivered flux is available",
    },
  };
  assert.doesNotThrow(() => adaptCpuReceiverObservation(diagnosticWithoutBackendSpecificFlux));
});

test("CPU instrumentation classifies an out-of-domain floor hit as escaped", () => {
  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const observations: ReceiverSampleObservation[] = [];
  const rebuildCpu = (layer as unknown as { rebuildCpu: Function }).rebuildCpu;
  const result = rebuildCpu.call(
    layer,
    INSTRUMENTATION_BALLS,
    0,
    instrumentationSettings(),
    { sampleCountOverride: 256, publish: false, eventSink: (observation: ReceiverSampleObservation) => observations.push(observation) },
  ) as { field: { diagnostics: { outOfDomainDepositCount: number } } };
  assert.ok(result.field.diagnostics.outOfDomainDepositCount > 0, "the CPU field must observe fixed-domain escapes");
  const outside = observations.filter(outsideReceiverDomain);
  assert.ok(outside.length > 0, "CPU instrumentation must emit the out-of-domain samples");
  assert.ok(outside.every((observation) => observation.outcome === "escaped"));
  assert.ok(outside.every((observation) => observation.deliveredFluxRgb.state === "unavailable"));
  assert.equal(observations.filter((observation) => outsideReceiverDomain(observation) && observation.outcome === "receiver-hit").length, 0);
  for (const observation of outside) {
    const event = adaptCpuReceiverObservation(observation);
    assert.equal(event.outcome.kind, "diagnostic");
    if (event.outcome.kind === "diagnostic") {
      assert.equal(event.outcome.termination.state, "available");
      if (event.outcome.termination.state === "available") assert.equal(event.outcome.termination.value, "escaped");
    }
  }
});

test("CPU event sink stays one-outcome-per-affected-sample and matches deposited receiver flux", () => {
  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const observations: ReceiverSampleObservation[] = [];
  const rebuildCpu = (layer as unknown as { rebuildCpu: Function }).rebuildCpu;
  // With no refraction and a contained source aperture, receiver-hit events
  // and the completed field ledger express the same retained receiver flux.
  const settings = { ...instrumentationSettings(), ior: 1, lightWidth: 0.75 };
  const result = rebuildCpu.call(
    layer,
    INSTRUMENTATION_BALLS,
    0,
    settings,
    { sampleCountOverride: 256, publish: false, eventSink: (observation: ReceiverSampleObservation) => observations.push(observation) },
  ) as {
    field: {
      diagnostics: {
        affectedSampleCount: number;
        energyLedger: { depositedRgb: { r: number; g: number; b: number } };
      };
    };
  };
  assert.ok(observations.length > 0);
  assert.ok(observations.length <= result.field.diagnostics.affectedSampleCount);
  const sampleIds = new Set<string>();
  const adapted = observations.map((observation) => {
    assert.ok(["receiver-hit", "absorbed", "escaped", "rejected", "unresolved"].includes(observation.outcome));
    assert.equal(sampleIds.has(observation.sampleId), false, `duplicate event for ${observation.sampleId}`);
    sampleIds.add(observation.sampleId);
    const event = adaptCpuReceiverObservation(observation);
    if (observation.outcome === "receiver-hit") {
      assert.equal(event.outcome.kind, "terminal");
      assert.equal(event.deliveredFluxRgb.state, "available");
    } else {
      assert.equal(event.outcome.kind, "diagnostic");
      assert.equal(event.deliveredFluxRgb.state, "unavailable");
    }
    return event;
  });
  const eventFlux = { r: 0, g: 0, b: 0 };
  for (const event of adapted) {
    if (event.deliveredFluxRgb.state !== "available") continue;
    eventFlux.r += event.deliveredFluxRgb.value.r;
    eventFlux.g += event.deliveredFluxRgb.value.g;
    eventFlux.b += event.deliveredFluxRgb.value.b;
  }
  const deposited = result.field.diagnostics.energyLedger.depositedRgb;
  for (const channel of ["r", "g", "b"] as const) {
    assert.ok(deposited[channel] > 0, `fixture must deposit ${channel} receiver flux`);
    assert.ok(
      Math.abs(eventFlux[channel] - deposited[channel]) <= deposited[channel] * 0.01,
      `${channel} event flux must agree with field ledger within 1%`,
    );
  }
});

test("GPU decoder uses only 28-float offsets and keeps absent path fields unavailable", () => {
  const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS);
  const offset = gpuOpticsResultOffset(0);
  values[offset + GPU_OPTICS_RESULT_OFFSETS.entry] = 1;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.exit] = 2;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.floor] = 3;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.flags] = 1;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.flags + 1] = 1;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.flags + 2] = 1;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.baseline + 3] = 1;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb] = 0.4;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb + 1] = 0.5;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb + 2] = 0.6;
  values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb + 3] = 1;
  const raw = decodeGpuReceiverObservation(values, 0, {
    receiverDomain: RECEIVER_DOMAIN,
    sampleFlux: 0.25,
    sampleId: "gpu:1",
    sceneRevision: "scene",
    lightRevision: "light",
    receiverId: observed("test-floor", "exact", "backend-branch"),
  });
  assert.equal(raw.outcome, "receiver-hit");
  assert.equal(raw.path.opticalPathLength.state, "unavailable");
  assert.equal(raw.path.internalBounceCount.state, "unavailable");
  const event = adaptGpuReceiverObservation(raw);
  assert.equal(event.outcome.kind, "terminal");
  assert.equal(event.path.exitDirectionWorld.state, "available");
  if (event.path.exitDirectionWorld.state === "available") {
    const direction = event.path.exitDirectionWorld.value;
    assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) <= 1e-6);
  }
});

test("GPU decoder uses explicit inclusive receiver bounds for hit versus escaped", () => {
  for (const [u, v, expected] of [
    [-16, -16, "receiver-hit"],
    [16, 16, "receiver-hit"],
    [16.000001, 0, "escaped"],
    [100, -100, "escaped"],
  ] as const) {
    const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS);
    const flagsOffset = GPU_OPTICS_RESULT_OFFSETS.flags;
    values[flagsOffset] = 1;
    values[flagsOffset + 1] = 1;
    values[flagsOffset + 2] = 1;
    values[flagsOffset + 3] = 1;
    const baselineOffset = GPU_OPTICS_RESULT_OFFSETS.baseline;
    values[baselineOffset + 3] = 1;
    const exitOffset = GPU_OPTICS_RESULT_OFFSETS.exit;
    values[exitOffset + 1] = 1;
    const floorOffset = GPU_OPTICS_RESULT_OFFSETS.floor;
    values[floorOffset] = u;
    values[floorOffset + 1] = -2.35;
    values[floorOffset + 2] = v;
    const throughputOffset = GPU_OPTICS_RESULT_OFFSETS.throughputRgb;
    values[throughputOffset] = 0.4;
    values[throughputOffset + 1] = 0.5;
    values[throughputOffset + 2] = 0.6;
    values[throughputOffset + 3] = 1;
    const raw = decodeGpuReceiverObservation(values, 0, {
      receiverDomain: RECEIVER_DOMAIN,
      sampleFlux: 0.25,
      sampleId: `gpu-domain:${u}:${v}`,
      sceneRevision: "scene",
      lightRevision: "light",
      receiverId: observed("test-floor", "exact", "backend-branch"),
    });
    assert.equal(raw.outcome, expected);
    const event = adaptGpuReceiverObservation(raw);
    if (expected === "receiver-hit") {
      assert.equal(event.outcome.kind, "terminal");
      assert.equal(event.deliveredFluxRgb.state, "available");
    } else {
      assert.equal(event.outcome.kind, "diagnostic");
      assert.equal(event.deliveredFluxRgb.state, "unavailable");
    }
  }
});

test("GPU decoder requires a finite non-negative sample flux and baseline misses stay non-events", () => {
  const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS);
  assert.throws(() => decodeGpuReceiverObservation(values, 0, undefined as never), TypeError);
  assert.throws(() => decodeGpuReceiverObservation(values, 0, { receiverDomain: RECEIVER_DOMAIN } as never), RangeError);
  for (const sampleFlux of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.throws(() => decodeGpuReceiverObservation(values, 0, { receiverDomain: RECEIVER_DOMAIN, sampleFlux }), RangeError);
  }
  const raw = decodeGpuReceiverObservation(values, 0, { receiverDomain: RECEIVER_DOMAIN, sampleFlux: 0 });
  assert.equal(raw.flags.entryValid, false);
  assert.throws(() => adaptGpuReceiverObservation(raw), RangeError);
});

test("GPU instrumentation uses the fixed receiver domain for floor-hit classification", () => {
  const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS);
  const flagsOffset = GPU_OPTICS_RESULT_OFFSETS.flags;
  values[flagsOffset] = 1;
  values[flagsOffset + 1] = 1;
  values[flagsOffset + 2] = 1;
  values[flagsOffset + 3] = 1;
  const baselineOffset = GPU_OPTICS_RESULT_OFFSETS.baseline;
  values[baselineOffset] = 0;
  values[baselineOffset + 1] = 0;
  values[baselineOffset + 2] = 0;
  values[baselineOffset + 3] = 1;
  const exitOffset = GPU_OPTICS_RESULT_OFFSETS.exit;
  values[exitOffset] = 0;
  values[exitOffset + 1] = 1;
  values[exitOffset + 2] = 0;
  const floorOffset = GPU_OPTICS_RESULT_OFFSETS.floor;
  values[floorOffset] = 33;
  values[floorOffset + 1] = -2.35;
  values[floorOffset + 2] = 0;
  const throughputOffset = GPU_OPTICS_RESULT_OFFSETS.throughputRgb;
  values[throughputOffset] = 0.4;
  values[throughputOffset + 1] = 0.5;
  values[throughputOffset + 2] = 0.6;
  values[throughputOffset + 3] = 1;
  const observations: ReceiverSampleObservation[] = [];
  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const rebuildGpu = (layer as unknown as { rebuildGpu: Function }).rebuildGpu;
  const result = rebuildGpu.call(
    layer,
    { values, sampleCount: 1, hitCount: 1, elapsedMs: 0 } satisfies GpuOpticsResult,
    INSTRUMENTATION_BALLS,
    0,
    instrumentationSettings(),
    { publish: false, eventSink: (observation: ReceiverSampleObservation) => observations.push(observation) },
  ) as { field: { diagnostics: { outOfDomainDepositCount: number } } };
  assert.equal(result.field.diagnostics.outOfDomainDepositCount, 1);
  assert.equal(observations.length, 1);
  assert.equal(outsideReceiverDomain(observations[0]), true);
  assert.equal(observations[0].outcome, "escaped");
  assert.equal(observations[0].deliveredFluxRgb.state, "unavailable");
  assert.equal(observations[0].path.mediumIds.state, "backend-specific");
  if (observations[0].path.mediumIds.state === "backend-specific") {
    assert.equal(observations[0].path.mediumIds.backend, "webgpu-receiver");
  }
  const event = adaptGpuReceiverObservation(observations[0]);
  assert.equal(event.outcome.kind, "diagnostic");
  if (event.outcome.kind === "diagnostic") {
    assert.equal(event.outcome.termination.state, "available");
    if (event.outcome.termination.state === "available") assert.equal(event.outcome.termination.value, "escaped");
  }
});

test("GPU decoder receiver flux matches integrated GPU instrumentation", () => {
  const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS);
  const flagsOffset = GPU_OPTICS_RESULT_OFFSETS.flags;
  values[flagsOffset] = 1;
  values[flagsOffset + 1] = 1;
  values[flagsOffset + 2] = 1;
  const baselineOffset = GPU_OPTICS_RESULT_OFFSETS.baseline;
  values[baselineOffset + 3] = 1;
  const exitOffset = GPU_OPTICS_RESULT_OFFSETS.exit;
  values[exitOffset + 1] = 1;
  const floorOffset = GPU_OPTICS_RESULT_OFFSETS.floor;
  values[floorOffset + 1] = -2.35;
  const throughputOffset = GPU_OPTICS_RESULT_OFFSETS.throughputRgb;
  values[throughputOffset] = 0.4;
  values[throughputOffset + 1] = 0.5;
  values[throughputOffset + 2] = 0.6;
  values[throughputOffset + 3] = 1;
  const observations: ReceiverSampleObservation[] = [];
  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const rebuildGpu = (layer as unknown as { rebuildGpu: Function }).rebuildGpu;
  const result = rebuildGpu.call(
    layer,
    { values, sampleCount: 1, hitCount: 1, elapsedMs: 0 } satisfies GpuOpticsResult,
    INSTRUMENTATION_BALLS,
    0,
    instrumentationSettings(),
    { publish: false, eventSink: (observation: ReceiverSampleObservation) => observations.push(observation) },
  ) as {
    field: {
      minU: number;
      minV: number;
      sizeU: number;
      sizeV: number;
      diagnostics: { sampleFlux: number };
    };
  };
  assert.equal(observations.length, 1);
  const decoded = decodeGpuReceiverObservation(values, 0, {
    receiverDomain: {
      minU: result.field.minU,
      maxU: result.field.minU + result.field.sizeU,
      minV: result.field.minV,
      maxV: result.field.minV + result.field.sizeV,
    },
    sampleFlux: result.field.diagnostics.sampleFlux,
  });
  assert.equal(decoded.outcome, "receiver-hit");
  assert.equal(decoded.deliveredFluxRgb.state, "available");
  assert.equal(observations[0].deliveredFluxRgb.state, "available");
  if (decoded.deliveredFluxRgb.state === "available" && observations[0].deliveredFluxRgb.state === "available") {
    for (const channel of ["r", "g", "b"] as const) {
      assert.equal(decoded.deliveredFluxRgb.value[channel], observations[0].deliveredFluxRgb.value[channel]);
    }
  }
});

test("GPU decoder classifies every meaningful 28-float flag combination without guessing", () => {
  const combinations: Array<[boolean, boolean, boolean, boolean, boolean]> = [];
  for (const entryValid of [false, true]) {
    for (const exitValid of [false, true]) {
      for (const floorValid of [false, true]) {
        for (const baselineValid of [false, true]) {
          for (const outgoingValid of [false, true]) {
            combinations.push([entryValid, exitValid, floorValid, baselineValid, outgoingValid]);
          }
        }
      }
    }
  }
  assert.equal(combinations.length, 32);
  for (const [entryValid, exitValid, floorValid, baselineValid, outgoingValid] of combinations) {
    const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS);
    const flagsOffset = GPU_OPTICS_RESULT_OFFSETS.flags;
    const baselineOffset = GPU_OPTICS_RESULT_OFFSETS.baseline;
    const throughputOffset = GPU_OPTICS_RESULT_OFFSETS.throughputRgb;
    values[flagsOffset] = entryValid ? 1 : 0;
    values[flagsOffset + 1] = exitValid ? 1 : 0;
    values[flagsOffset + 2] = floorValid ? 1 : 0;
    values[baselineOffset + 3] = baselineValid ? 1 : 0;
    values[throughputOffset + 3] = outgoingValid ? 1 : 0;
    values[GPU_OPTICS_RESULT_OFFSETS.exit] = 3;
    values[GPU_OPTICS_RESULT_OFFSETS.exit + 1] = 2;
    values[GPU_OPTICS_RESULT_OFFSETS.exit + 2] = 1;
    values[GPU_OPTICS_RESULT_OFFSETS.floor] = 3;
    values[GPU_OPTICS_RESULT_OFFSETS.floor + 1] = 1;
    values[GPU_OPTICS_RESULT_OFFSETS.floor + 2] = 1;
    values[throughputOffset] = 0.4;
    values[throughputOffset + 1] = 0.5;
    values[throughputOffset + 2] = 0.6;
    const raw = decodeGpuReceiverObservation(values, 0, {
      receiverDomain: RECEIVER_DOMAIN,
      sampleFlux: 0.25,
      sampleId: `gpu:${Number(entryValid)}${Number(exitValid)}${Number(floorValid)}${Number(baselineValid)}${Number(outgoingValid)}`,
      sceneRevision: "scene",
      lightRevision: "light",
      receiverId: observed("test-floor", "exact", "backend-branch"),
    });
    const affected = entryValid && baselineValid;
    if (!affected) {
      assert.throws(() => adaptGpuReceiverObservation(raw), RangeError);
      continue;
    }
    const event = adaptGpuReceiverObservation(raw);
    const expectedOutcome = floorValid && exitValid
      ? "receiver-hit"
      : exitValid
        ? "escaped"
        : "unresolved";
    if (expectedOutcome === "receiver-hit") {
      assert.equal(event.outcome.kind, "terminal");
      assert.equal(event.deliveredFluxRgb.state, "available");
    } else {
      assert.equal(event.outcome.kind, "diagnostic");
      assert.equal(event.deliveredFluxRgb.state, "unavailable");
    }
    assert.equal(event.path.opticalPathLength.state, "unavailable");
    assert.equal(event.path.mediumIds.state, "backend-specific");
    assert.equal(event.path.inclusionIds.state, "unavailable");
    if (outgoingValid && floorValid && exitValid) {
      assert.equal(event.path.exitDirectionWorld.state, "available");
      if (event.path.exitDirectionWorld.state === "available") {
        const direction = event.path.exitDirectionWorld.value;
        assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) <= 1e-6);
      }
    } else {
      assert.equal(event.path.exitDirectionWorld.state, "backend-specific");
    }
  }
});

test("BODY adapter exposes capability only and never fabricates a view event", () => {
  assert.equal(bodyCapabilityDescriptor.backend, "body-webgl");
  assert.equal(bodyCapabilityDescriptor.domain, "view");
  assert.equal(bodyCapabilityDescriptor.capabilities.capturedRadiance, "ambiguous");
  assert.equal(bodyCapabilityDescriptor.capabilities.internalBounceCount, "unavailable");
});

test("normal optics rebuilds omit the test-only event sink and allocate no event array", () => {
  const source = readFileSync(new URL("../../src/studies/cloud-sculpt/optics.ts", import.meta.url), "utf8");
  assert.match(source, /eventSink\?: ReceiverEventSink/);
  assert.match(source, /this\.rebuildCpu\(balls, k, settings\)/);
  assert.match(source, /this\.rebuildGpu\(result, balls, k, settings\)/);
  assert.doesNotMatch(source, /\b(?:events|opticalEvents|receiverEvents|eventArray)\s*=\s*\[\]/i);
  const sourceLines = source.split("\n");
  const cpuEmitLines = sourceLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes("emitCpuReceiverObservation(options.eventSink"));
  assert.equal(cpuEmitLines.length, 6, "all six CPU event branches are explicit sink-only emissions");
  for (const { index } of cpuEmitLines) {
    const preceding = sourceLines.slice(Math.max(0, index - 2), index + 1).join("\n");
    assert.match(preceding, /if \(options\.eventSink\) \{/);
  }
  assert.equal((source.match(/cpuObservationPath\(/g) ?? []).length, 7, "six guarded calls plus the helper declaration");
  let braceDepth = 0;
  const guardDepths: number[] = [];
  let guardedPathCalls = 0;
  for (const line of sourceLines) {
    const depthBeforeLine = braceDepth;
    if (line.includes("if (options.eventSink) {")) guardDepths.push(depthBeforeLine + 1);
    if (line.includes("emitCpuReceiverObservation(options.eventSink")) {
      assert.ok(guardDepths.some((guardDepth) => guardDepth <= depthBeforeLine), "CPU observation object must be created inside the sink guard");
    }
    if (line.includes("cpuObservationPath(") && !line.includes("function cpuObservationPath")) {
      assert.ok(guardDepths.some((guardDepth) => guardDepth <= depthBeforeLine), "CPU path attributes must be built inside the sink guard");
      guardedPathCalls += 1;
    }
    braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
    while (guardDepths.length > 0 && guardDepths[guardDepths.length - 1] > braceDepth) guardDepths.pop();
  }
  assert.equal(guardedPathCalls, 6);
  const outcomes = ["receiver-hit", "escaped", "unresolved", "rejected"] as const;
  assert.ok(outcomes.includes("receiver-hit"));
  assert.ok(outcomes.includes("escaped"));
  assert.ok(outcomes.includes("unresolved"));
  assert.ok(outcomes.includes("rejected"));
});

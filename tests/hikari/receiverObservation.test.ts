import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  buildR1CpuFrameLedger,
  buildR1GpuFrameLedger,
  calculateCpuOpticalPathStages,
  classifyReceiverUnresolvedReason,
  compareReceiverObservationFrames,
  ReceiverObservationCollector,
  splitCpuAttenuation,
} from "../../src/studies/cloud-sculpt/receiverObservation.ts";
import {
  approximateOpticalPathThroughput,
  OpticsLayer,
  type ReceiverBuildOptions,
  type ReceiverBuildResult,
} from "../../src/studies/cloud-sculpt/optics.ts";
import { evaluateReceiverClosure } from "../../src/studies/cloud-sculpt/frameTransportLedger.ts";
import { DEFAULT_HIKARI_SETTINGS, HikariLayer } from "../../src/studies/cloud-sculpt/hikari.ts";
import {
  GPU_OPTICS_RESULT_FLOATS,
  GPU_OPTICS_RESULT_OFFSETS,
  type GpuOpticsResult,
} from "../../src/studies/cloud-sculpt/opticsGpu.ts";
import type { ReceiverSampleObservation } from "../../src/studies/cloud-sculpt/opticalEventAdapters.ts";

function unitStages(overrides: Partial<Parameters<typeof calculateCpuOpticalPathStages>[0]> = {}) {
  return calculateCpuOpticalPathStages({
    hostAbsorption: { r: 0, g: 0, b: 0 },
    inclusionAbsorption: { r: 0, g: 0, b: 0 },
    hostIor: 1.5,
    inclusionIor: 1.5,
    hostDistance: 1,
    inclusionDistance: 0,
    traversedInclusion: false,
    ...overrides,
  });
}

function makeFrame(backend: "cpu-receiver" | "webgpu-receiver", frameId: number) {
  const collector = new ReceiverObservationCollector({
    sourceBackend: backend,
    receiverId: "floor",
    sceneRevision: "scene",
    lightRevision: "light",
  });
  collector.reset(frameId);
  const stages = unitStages();
  collector.record({
    outcome: "receiver-hit",
    receiverUv: [1, 2],
    enteredRgb: { r: 1, g: 1, b: 1 },
    deliveredFluxRgb: stages.afterExitInterfaceRgb,
    attenuation: backend === "cpu-receiver"
      ? stages
      : { combinedAttenuationRgb: { r: 1 - stages.afterExitInterfaceRgb.r, g: 1 - stages.afterExitInterfaceRgb.g, b: 1 - stages.afterExitInterfaceRgb.b } },
  });
  return collector.seal();
}

const parityBalls = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const paritySettings = {
  ...DEFAULT_HIKARI_SETTINGS,
  opticalSampleCount: 256,
  opticalRayCount: 8,
  opticalSeed: "r1b-off-on",
  inclusionEnabled: false,
  inclusionMode: "single" as const,
};

function typedArrayBytes(value: Float32Array): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function fieldBytes(field: { geometricCoverage: Float32Array; straightThroughputRgb: Float32Array; depositedFluxRgb: Float32Array; lossFluxRgb: Float32Array }): Uint8Array[] {
  return [
    typedArrayBytes(field.geometricCoverage),
    typedArrayBytes(field.straightThroughputRgb),
    typedArrayBytes(field.depositedFluxRgb),
    typedArrayBytes(field.lossFluxRgb),
  ];
}

function syntheticGpuResult(sampleCount = 8): GpuOpticsResult {
  const values = new Float32Array(sampleCount * GPU_OPTICS_RESULT_FLOATS);
  for (let sample = 0; sample < sampleCount; sample++) {
    const offset = sample * GPU_OPTICS_RESULT_FLOATS;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.origin] = 0;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.origin + 1] = 2;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.origin + 3] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.entry] = 0;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.entry + 1] = 0.8;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.entry + 3] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.exit] = 0;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.exit + 1] = 0;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.exit + 3] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.floor] = (sample - 3) * 0.2;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.floor + 1] = -1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.floor + 2] = (sample - 3) * 0.1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.floor + 3] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.flags] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.flags + 1] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.flags + 2] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.flags + 3] = 0.8;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.baseline] = (sample - 3) * 0.15;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.baseline + 1] = 0;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.baseline + 2] = (sample - 3) * 0.1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.baseline + 3] = 1;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb] = 0.72;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb + 1] = 0.61;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb + 2] = 0.53;
    values[offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb + 3] = 1;
  }
  return { values, sampleCount, hitCount: sampleCount, elapsedMs: 0 };
}

function rebuildCpuForParity(layer: OpticsLayer, sink: ReceiverSampleObservation[]): ReceiverBuildResult {
  return (layer as unknown as {
    rebuildCpu: (balls: typeof parityBalls, k: number, settings: typeof paritySettings, options: ReceiverBuildOptions) => ReceiverBuildResult;
  }).rebuildCpu(parityBalls, 1, paritySettings, {
    sampleCountOverride: 64,
    publish: false,
    eventSink: (observation: ReceiverSampleObservation) => sink.push(observation),
  });
}

function rebuildGpuForParity(layer: OpticsLayer, sink: ReceiverSampleObservation[]): ReceiverBuildResult {
  return (layer as unknown as {
    rebuildGpu: (result: GpuOpticsResult, balls: typeof parityBalls, k: number, settings: typeof paritySettings, options: ReceiverBuildOptions) => ReceiverBuildResult;
  }).rebuildGpu(syntheticGpuResult(), parityBalls, 1, paritySettings, {
    publish: false,
    eventSink: (observation: ReceiverSampleObservation) => sink.push(observation),
  });
}

test("CPU attenuation stages close per channel for zero, absorption, and grazing paths", () => {
  const zero = unitStages({ hostDistance: 0 });
  assert.deepEqual(zero.absorbedRgb, { r: 0, g: 0, b: 0 });
  for (const channel of ["r", "g", "b"] as const) {
    assert.ok(Math.abs(zero.enteredRgb[channel] - (
      zero.afterExitInterfaceRgb[channel]
      + zero.absorbedRgb[channel]
      + zero.interfaceLossRgb[channel]
    )) <= 1e-12);
  }
  const absorbing = unitStages({
    hostDistance: 2,
    hostAbsorption: { r: 2, g: 1, b: 0.2 },
  });
  assert.ok(absorbing.absorbedRgb.r > absorbing.absorbedRgb.g);
  assert.ok(absorbing.afterMediumRgb.r < absorbing.afterMediumRgb.g);
  const grazing = unitStages({ hostIor: 1.01, hostDistance: 0.1 });
  assert.ok(grazing.interfaceLossRgb.r < zero.interfaceLossRgb.r);
});

test("TIR/terminal stages do not charge a fictitious exit interface loss", () => {
  const tir = unitStages({ exitResolved: false });
  assert.deepEqual(tir.exitInterfaceLossRgb, { r: 0, g: 0, b: 0 });
  assert.deepEqual(tir.afterExitInterfaceRgb, tir.afterMediumRgb);
  assert.equal(splitCpuAttenuation, calculateCpuOpticalPathStages);
});

test("approximate throughput keeps existing values while exposing named stages", () => {
  const result = approximateOpticalPathThroughput(
    { r: 0, g: 0, b: 0 },
    { r: 0, g: 0, b: 0 },
    1.5,
    1.5,
    1,
    0,
    false,
  );
  assert.ok(result.stages);
  assert.equal(result.exitIncidentRgb.r, 0.96);
  assert.equal(result.transmittedRgb.r, 0.9216);
  assert.deepEqual(result.absorbedRgb, result.stages.absorbedRgb);
  const tir = approximateOpticalPathThroughput(
    { r: 0, g: 0, b: 0 },
    { r: 0, g: 0, b: 0 },
    1.5,
    1.5,
    1,
    0,
    false,
    false,
  );
  assert.deepEqual(tir.transmittedRgb, tir.exitIncidentRgb);
  assert.deepEqual(tir.stages.exitInterfaceLossRgb, { r: 0, g: 0, b: 0 });
});

test("collector lifecycle, reset, zero-sample frame, and deep freeze are deterministic", () => {
  const collector = new ReceiverObservationCollector({ sourceBackend: "cpu-receiver" });
  assert.throws(() => collector.seal());
  collector.reset(7, { receiverId: "floor", sceneRevision: "s", lightRevision: "l" });
  const frame = collector.seal();
  assert.equal(frame.sampleCount, 0);
  assert.equal(frame.outcomeCounts.unresolved, 0);
  assert.equal(Object.isFrozen(frame), true);
  assert.equal(Object.isFrozen(frame.rgb), true);
  assert.equal(Object.isFrozen(frame.outcomeCounts.unresolvedReasons), true);
  assert.throws(() => collector.record({ outcome: "escaped" }));
  collector.reset(8);
  collector.record({ outcome: "escaped", enteredRgb: { r: 1, g: 1, b: 1 } });
  const next = collector.seal();
  assert.equal(next.sampleCount, 1);
  assert.equal(next.outcomeCounts.escaped, 1);
  assert.notEqual(next.frameId, frame.frameId);
  assert.equal(Object.keys(next).some((key) => /sample|event/i.test(key) && Array.isArray((next as unknown as Record<string, unknown>)[key])), false);
});

test("collector reset clears all aggregate state and reason counters", () => {
  const collector = new ReceiverObservationCollector({ sourceBackend: "cpu-receiver" });
  collector.reset(1);
  collector.record({
    outcome: "unresolved",
    unresolvedReason: "entry-tir-terminal",
    receiverUv: [3, 4],
    enteredRgb: { r: 1, g: 1, b: 1 },
  });
  collector.seal();
  collector.reset(2);
  const frame = collector.seal();
  assert.equal(frame.sampleCount, 0);
  assert.equal(frame.outcomeCounts.unresolvedReasons["entry-tir-terminal"], 0);
  assert.equal(frame.centroid.u, null);
  assert.equal(frame.envelope.minU, null);
});

test("R1 CPU ledger counts interface loss once under escaped and closes", () => {
  const collector = new ReceiverObservationCollector({ sourceBackend: "cpu-receiver" });
  collector.reset(1, { receiverId: "floor", sceneRevision: "scene", lightRevision: "light" });
  collector.record({
    outcome: "receiver-hit",
    receiverUv: [0, 0],
    enteredRgb: { r: 1, g: 1, b: 1 },
    deliveredFluxRgb: { r: 0.8, g: 0.7, b: 0.6 },
    attenuation: {
      absorbedRgb: { r: 0.1, g: 0.1, b: 0.1 },
      interfaceLossRgb: { r: 0.1, g: 0.2, b: 0.3 },
      combinedAttenuationRgb: { r: 0.2, g: 0.3, b: 0.4 },
    },
  });
  const frame = collector.seal();
  const ledger = buildR1CpuFrameLedger(frame);
  assert.equal(ledger.receiver.escapedFluxRgb.state, "available");
  if (ledger.receiver.escapedFluxRgb.state === "available") {
    assert.deepEqual(ledger.receiver.escapedFluxRgb.value, { r: 0.1, g: 0.2, b: 0.3 });
  }
  assert.equal(evaluateReceiverClosure(ledger).status, "closed");
});

test("GPU ledger keeps absorption/interface split ambiguous and closure unavailable", () => {
  const frame = makeFrame("webgpu-receiver", 2);
  const ledger = buildR1GpuFrameLedger(frame);
  assert.equal(ledger.receiver.absorbedFluxRgb.state, "ambiguous");
  assert.equal(evaluateReceiverClosure(ledger).status, "not-computable");
  assert.equal(frame.attenuation.combinedAttenuationFluxRgb.state, "available");
});

test("reason classification is truthful and does not call boundary exhaustion TIR", () => {
  assert.equal(classifyReceiverUnresolvedReason({ entryValid: false }), "no-host-entry");
  assert.equal(classifyReceiverUnresolvedReason({ entryTir: true }), "entry-tir-terminal");
  assert.equal(classifyReceiverUnresolvedReason({ exitTir: true }), "exit-tir-terminal");
  assert.equal(classifyReceiverUnresolvedReason({ nestedPathUnresolved: true }), "nested-path-not-represented");
  assert.equal(classifyReceiverUnresolvedReason({ exitValid: false }), "nested-path-not-represented");
  assert.equal(classifyReceiverUnresolvedReason({ gpuCombinedAttenuationOnly: true }), "gpu-combined-attenuation-only");
  assert.equal(classifyReceiverUnresolvedReason({ entryValid: true, exitValid: true, outgoingValid: true }), undefined);
});

test("invalid numeric aggregate inputs are counted as invalid-number", () => {
  const collector = new ReceiverObservationCollector();
  collector.reset(11);
  collector.record({ outcome: "unresolved", enteredRgb: { r: Number.NaN, g: 1, b: 1 } });
  const frame = collector.seal();
  assert.equal(frame.outcomeCounts.invalidNumber, 1);
  assert.equal(frame.outcomeCounts.unresolvedReasons["invalid-number"], 1);
});

test("CPU/GPU aggregate parity exposes all R1b gates", () => {
  const cpu = makeFrame("cpu-receiver", 3);
  const gpu = makeFrame("webgpu-receiver", 4);
  const metrics = compareReceiverObservationFrames(cpu, gpu);
  assert.equal(metrics.sampleCountExact, true);
  assert.equal(metrics.normalizedOutcomeCountL1, 0);
  assert.equal(metrics.unresolvedFractionAbsoluteDifference, 0);
  assert.deepEqual(metrics.gates, { sampleCount: true, outcomeCount: true, unresolvedFraction: true });
  assert.equal(metrics.pass, true);
});

test("CPU feature-off/on preserves every receiver field byte and R0.5 event order", () => {
  const off = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const on = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true, receiverObservation: true });
  const offEvents: ReceiverSampleObservation[] = [];
  const onEvents: ReceiverSampleObservation[] = [];
  const offResult = rebuildCpuForParity(off, offEvents);
  const onResult = rebuildCpuForParity(on, onEvents);
  for (const [offBytes, onBytes] of fieldBytes(offResult.field)) {
    assert.deepEqual(offBytes, onBytes);
  }
  assert.deepEqual(onEvents, offEvents);
  const frame = onResult.observationFrame;
  assert.ok(frame);
  assert.equal(frame.sampleCount, 64);
  assert.equal(frame.sampleCount, onResult.sampleCount);
  assert.equal(
    frame.outcomeCounts.receiverHit
      + frame.outcomeCounts.absorbed
      + frame.outcomeCounts.escaped
      + frame.outcomeCounts.rejected
      + frame.outcomeCounts.unresolved,
    frame.sampleCount,
  );
  assert.equal(on.getLatestReceiverObservation(), null, "publish:false parity must not publish a snapshot");
});

test("synthetic GPU feature-off/on preserves every receiver field byte and event order", () => {
  const off = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const on = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true, receiverObservation: true });
  const offEvents: ReceiverSampleObservation[] = [];
  const onEvents: ReceiverSampleObservation[] = [];
  const offResult = rebuildGpuForParity(off, offEvents);
  const onResult = rebuildGpuForParity(on, onEvents);
  for (const [offBytes, onBytes] of fieldBytes(offResult.field)) {
    assert.deepEqual(offBytes, onBytes);
  }
  assert.deepEqual(onEvents, offEvents);
  const frame = onResult.observationFrame;
  assert.ok(frame);
  assert.equal(frame.sampleCount, 8);
  assert.equal(frame.sampleCount, onResult.sampleCount);
  assert.equal(
    frame.outcomeCounts.receiverHit
      + frame.outcomeCounts.absorbed
      + frame.outcomeCounts.escaped
      + frame.outcomeCounts.rejected
      + frame.outcomeCounts.unresolved,
    frame.sampleCount,
  );
  assert.equal(on.getLatestReceiverObservation(), null, "publish:false synthetic GPU parity must not publish");
});

test("enabled CPU rebuild publishes one immutable Hikari/Optics snapshot, while disabled stays null", () => {
  const enabled = new HikariLayer(new THREE.Scene(), { disableWebGpu: true, receiverObservation: true });
  const result = (enabled.optics as unknown as {
    rebuildCpu: (balls: typeof parityBalls, k: number, settings: typeof paritySettings, options: ReceiverBuildOptions) => ReceiverBuildResult;
  }).rebuildCpu(parityBalls, 1, paritySettings, { sampleCountOverride: 32, publish: true });
  const snapshot = enabled.getLatestReceiverObservation();
  assert.ok(result.observationFrame);
  assert.strictEqual(snapshot, result.observationFrame);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot?.rgb), true);
  const disabled = new HikariLayer(new THREE.Scene(), { disableWebGpu: true });
  assert.equal(disabled.getLatestReceiverObservation(), null);
});

test("support rejection finalization closes a CPU ledger and charges interface loss once", () => {
  const collector = new ReceiverObservationCollector({ sourceBackend: "cpu-receiver" });
  collector.reset(12, { receiverId: "floor", sceneRevision: "support", lightRevision: "support" });
  collector.record({
    outcome: "receiver-hit",
    receiverUv: [0, 0],
    enteredRgb: { r: 1, g: 1, b: 1 },
    deliveredFluxRgb: { r: 0.9, g: 0.9, b: 0.9 },
    attenuation: {
      absorbedRgb: { r: 0, g: 0, b: 0 },
      interfaceLossRgb: { r: 0.1, g: 0.1, b: 0.1 },
      combinedAttenuationRgb: { r: 0.1, g: 0.1, b: 0.1 },
    },
  });
  collector.finalizeFluxTotals({
    depositedFluxRgb: { r: 0.7, g: 0.7, b: 0.7 },
    rejectedFluxRgb: { r: 0.2, g: 0.2, b: 0.2 },
  });
  const frame = collector.seal();
  const ledger = buildR1CpuFrameLedger(frame);
  assert.equal(ledger.receiver.rejectedFluxRgb.state, "available");
  assert.equal(ledger.receiver.escapedFluxRgb.state, "available");
  if (ledger.receiver.rejectedFluxRgb.state === "available") {
    assert.deepEqual(ledger.receiver.rejectedFluxRgb.value, { r: 0.2, g: 0.2, b: 0.2 });
  }
  if (ledger.receiver.escapedFluxRgb.state === "available") {
    assert.deepEqual(ledger.receiver.escapedFluxRgb.value, { r: 0.1, g: 0.1, b: 0.1 });
  }
  assert.equal(evaluateReceiverClosure(ledger).status, "closed");
});

test("completed receiver reconstruction carries non-zero support rejection into the closed R1 ledger", () => {
  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true, receiverObservation: true });
  const settings = { ...paritySettings, opticalSeed: "sun-01", lightWidth: 0.45 };
  const result = (layer as unknown as {
    rebuildCpu: (balls: typeof parityBalls, k: number, settings: typeof settings, options: ReceiverBuildOptions) => ReceiverBuildResult;
  }).rebuildCpu(parityBalls, 1, settings, {
    sampleCountOverride: 256,
    publish: false,
    collectObservation: true,
  });
  assert.ok(result.observationFrame);
  assert.ok(result.field.diagnostics.supportRejectedFluxRgb.r > 0);
  assert.ok(result.field.diagnostics.supportRejectedFluxRgb.g > 0);
  assert.ok(result.field.diagnostics.supportRejectedFluxRgb.b > 0);
  const ledger = result.frameLedger!;
  assert.equal(evaluateReceiverClosure(ledger).status, "closed");
  if (ledger.receiver.escapedFluxRgb.state === "available") {
    assert.ok(Math.abs(
      ledger.receiver.escapedFluxRgb.value.r - result.observationFrame!.rgb.escaped.r - result.observationFrame!.rgb.interfaceLoss.r,
    ) <= 1e-9);
  }
});

test("feature-off Hikari receiver snapshot remains unavailable", () => {
  const scene = new THREE.Scene();
  const hikari = new HikariLayer(scene, { disableWebGpu: true });
  assert.equal(hikari.getLatestReceiverObservation(), null);
  // Keep this assertion independent of WebGPU/renderer availability: opting in
  // only changes the internal observation lifecycle and never creates a stale
  // snapshot before a completed receiver frame.
  const optedIn = new HikariLayer(scene, { disableWebGpu: true, receiverObservation: true });
  assert.equal(optedIn.getLatestReceiverObservation(), null);
  assert.equal(DEFAULT_HIKARI_SETTINGS.phenomenon, "flow");
  hikari.optics.invalidateTransport();
});

import assert from "node:assert/strict";
import test from "node:test";
import { defaultHanaMaterialSettings } from "./authoringDocument.ts";
import {
  CpuJsHanaComputeEngine,
  HANA_COMPUTE_CAPABILITY_VERSION,
  HANA_CPU_ENGINE_CAPABILITIES,
  assertHanaComputeEngineCompatibility,
  createHanaComputeEngine,
  registeredHanaComputeEngineIds,
} from "./computeEngine.ts";
import { computeHanaFinalization, createHanaFinalizationSnapshot } from "./finalizationCore.ts";
import { deriveStroke3D } from "./stroke3d.ts";

function snapshot() {
  const raw = {
    id: "engine-gesture",
    viewportId: "viewport-front",
    viewDirection: "front" as const,
    pointerType: "pen" as const,
    viewportSize: { width: 100, height: 100 },
    points: [
      { x: 0, y: 0, pressure: 0.5, time: 0 },
      { x: 1, y: 0.2, pressure: 0.5, time: 10 },
      { x: 2, y: 0, pressure: 0.5, time: 20 },
    ],
  };
  return createHanaFinalizationSnapshot({
    requestId: "engine-request",
    documentId: "engine-document",
    documentRevision: 1,
    objectRevision: 1,
    generationId: 1,
    stroke: deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }), 3),
    materialSettings: defaultHanaMaterialSettings(0.5),
  });
}

test("v0 exposes only the deterministic CPU compute engine", async () => {
  const engine = new CpuJsHanaComputeEngine();
  assert.deepEqual(engine.capabilities, HANA_CPU_ENGINE_CAPABILITIES);
  assert.equal(engine.capabilities.gpu, false);
  const result = await engine.finalize(snapshot(), undefined, { zSlicesPerYield: 8, yieldToBrowser: async () => undefined });
  const direct = await computeHanaFinalization(snapshot(), undefined, { zSlicesPerYield: 8, yieldToBrowser: async () => undefined });
  assert.deepEqual(Array.from(result.positions), Array.from(direct.positions));
  assert.deepEqual(result.counts, direct.counts);
});

test("engine registry and capability compatibility reject unknown or mismatched versions", () => {
  assert.deepEqual(registeredHanaComputeEngineIds(), ["cpu-js-v0"]);
  assert.equal(createHanaComputeEngine().id, "cpu-js-v0");
  assert.equal(HANA_CPU_ENGINE_CAPABILITIES.capabilityVersion, HANA_COMPUTE_CAPABILITY_VERSION);
  assert.doesNotThrow(() => assertHanaComputeEngineCompatibility(HANA_CPU_ENGINE_CAPABILITIES, {
    snapshotVersion: HANA_CPU_ENGINE_CAPABILITIES.supportedSnapshotVersion,
    protocolVersion: HANA_CPU_ENGINE_CAPABILITIES.supportedProtocolVersion,
    algorithmVersion: HANA_CPU_ENGINE_CAPABILITIES.algorithmVersion,
    engineId: HANA_CPU_ENGINE_CAPABILITIES.engineId,
  }));
  assert.throws(() => createHanaComputeEngine("not-registered"), /Unknown HANA compute engine/);
  assert.throws(() => assertHanaComputeEngineCompatibility(HANA_CPU_ENGINE_CAPABILITIES, {
    protocolVersion: "katachi.hana-compute-wire.v999",
  }), /Unsupported protocol version/);
});

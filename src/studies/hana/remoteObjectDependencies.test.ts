import assert from "node:assert/strict";
import test from "node:test";
import { deriveHanaRemoteObjectDirtySet } from "./remoteObjectDependencies.ts";
import { HanaRemoteObjectResultRegistry } from "./remoteObjectResultRegistry.ts";
import type { HanaRemoteObjectJob } from "./remoteObjectCoordinator.ts";
import type { HanaFinalizationResultV0 } from "./finalizationCore.ts";

test("object dirty set separates direct, dependent, and independent objects", () => {
  const result = deriveHanaRemoteObjectDirtySet(
    ["stem", "connector", "flower", "petal", "surface-draw"],
    [
      { objectId: "connector", dependsOn: ["stem"] },
      { objectId: "flower", dependsOn: ["connector", "petal"] },
    ],
    ["stem"],
  );
  assert.deepEqual(result.directDirty, ["stem"]);
  assert.deepEqual(result.dependentDirty, ["connector", "flower"]);
  assert.deepEqual(result.clean, ["petal", "surface-draw"]);
});

function resultFor(job: HanaRemoteObjectJob): HanaFinalizationResultV0 {
  return {
    format: "katachi.hana-finalization-result.v0",
    requestId: job.snapshot.requestId,
    documentRevision: job.snapshot.documentRevision,
    objectId: job.snapshot.objectId,
    objectRevision: job.snapshot.objectRevision,
    generationId: job.snapshot.generationId,
    algorithmVersion: job.snapshot.algorithmVersion,
    positions: new Float32Array([0, 0, 0]),
    normals: new Float32Array([0, 0, 1]),
    indices: new Uint32Array([0]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    counts: { controls: 1, smooth: 1, materialSamples: 1, voxels: 1, candidates: 1, triangles: 0, components: 0, effectiveResolution: 8 },
    timings: { smoothCenterline: 0, materialSamples: 0, fieldPreparation: 0, effectiveResolution: 0, meshGeneration: 0, validation: 0, total: 0 },
    validation: { finite: true, nonEmpty: true, watertight: true, components: 1, errors: [] },
  };
}

test("object result registry rejects stale identity and applies independent objects", () => {
  const job = {
    objectId: "stem",
    priority: "active" as const,
    snapshot: {
      format: "katachi.hana-finalization-snapshot.v0" as const,
      requestId: "stem-g2",
      documentId: "doc",
      documentRevision: 4,
      objectId: "stem",
      objectRevision: 2,
      generationId: 2,
      algorithmVersion: "hana-cpu-js-v0",
      authoringTolerance: 0.09,
      units: { lengthUnit: "object" as const, scaleToMillimetres: 1 },
      sourceStrokeIds: ["raw-stem"],
      controls: [{
        id: "stem-control",
        position: { x: 0, y: 0, z: 0 },
        provenance: { sourceStroke: "raw-stem", sourceT: 0, sourcePointStart: 0, sourcePointEnd: 0, pressure: 0.5, time: 0 },
      }],
      curveSettings: { alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
      materialSettings: { mapping: "uniform" as const, baseRadius: 0.18, minRadius: 0.05, maxRadius: 0.5, pressureInfluence: 0, speedInfluence: 0 },
      gestureMaterialSettings: { mapping: "uniform" as const, pressureInfluence: 0, speedInfluence: 0 },
    },
  } satisfies HanaRemoteObjectJob;
  const registry = new HanaRemoteObjectResultRegistry();
  const stale = { ...resultFor(job), generationId: 1 };
  assert.equal(registry.apply(job, stale), false);
  assert.equal(registry.has("stem"), false);
  assert.equal(registry.apply(job, resultFor(job)), true);
  assert.equal(registry.has("stem"), true);
});


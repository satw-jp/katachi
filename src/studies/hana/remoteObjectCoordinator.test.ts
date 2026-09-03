import assert from "node:assert/strict";
import test from "node:test";
import type {
  HanaComputeBackend,
  HanaComputeCapabilities,
  HanaComputeHealth,
  HanaComputeFinalizeOptions,
} from "./computeBackend.ts";
import type {
  HanaFinalizationResultV0,
  HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";
import { HanaRemoteObjectCoordinator } from "./remoteObjectCoordinator.ts";

const capabilities: HanaComputeCapabilities = {
  engine: "cpu-js-v0",
  binaryMesh: true,
  cancellation: true,
  objectLevelFinalization: true,
  gpu: false,
};

function health(): HanaComputeHealth {
  return {
    status: "ready",
    protocolVersion: "katachi.hana-compute-wire.v0",
    algorithmVersion: "hana-cpu-js-v0",
    engine: "cpu-js-v0",
    workerCount: 2,
    activeJobs: 0,
    queuedJobs: 0,
    uptime: 1,
  };
}

function result(snapshot: HanaFinalizationSnapshotV0): HanaFinalizationResultV0 {
  return {
    format: "katachi.hana-finalization-result.v0",
    requestId: snapshot.requestId,
    documentRevision: snapshot.documentRevision,
    objectId: snapshot.objectId,
    objectRevision: snapshot.objectRevision,
    generationId: snapshot.generationId,
    algorithmVersion: snapshot.algorithmVersion,
    positions: new Float32Array([0, 0, 0]),
    normals: new Float32Array([0, 0, 1]),
    indices: new Uint32Array([0]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    counts: { controls: snapshot.controls.length, smooth: 1, materialSamples: 1, voxels: 1, candidates: 1, triangles: 0, components: 0, effectiveResolution: 8 },
    timings: { smoothCenterline: 0, materialSamples: 0, fieldPreparation: 0, effectiveResolution: 0, meshGeneration: 0, validation: 0, total: 0 },
    validation: { finite: true, nonEmpty: true, watertight: true, components: 1, errors: [] },
  };
}

function snapshot(objectId: string, generationId: number): HanaFinalizationSnapshotV0 {
  return {
    format: "katachi.hana-finalization-snapshot.v0",
    requestId: `${objectId}-${generationId}`,
    documentId: "coordinator-document",
    documentRevision: generationId,
    objectId,
    objectRevision: generationId,
    generationId,
    algorithmVersion: "hana-cpu-js-v0",
    authoringTolerance: 0.09,
    units: { lengthUnit: "object", scaleToMillimetres: 1 },
    sourceStrokeIds: [`gesture-${objectId}`],
    controls: [{
      id: `${objectId}-control`,
      position: { x: 0, y: 0, z: 0 },
      provenance: { sourceStroke: `gesture-${objectId}`, sourceT: 0, sourcePointStart: 0, sourcePointEnd: 0, pressure: 0.5, time: 0 },
    }],
    curveSettings: { alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    materialSettings: { mapping: "uniform", baseRadius: 0.18, minRadius: 0.05, maxRadius: 0.5, pressureInfluence: 0, speedInfluence: 0 },
    gestureMaterialSettings: { mapping: "uniform", pressureInfluence: 0, speedInfluence: 0 },
  };
}

class FakeBackend implements HanaComputeBackend {
  readonly id = "fake";
  readonly capabilities = capabilities;
  readonly started: string[] = [];
  readonly cancelled: string[] = [];
  active = 0;
  maxActive = 0;

  healthCheck(): Promise<HanaComputeHealth> {
    return Promise.resolve(health());
  }

  async finalize(source: HanaFinalizationSnapshotV0, options: HanaComputeFinalizeOptions): Promise<HanaFinalizationResultV0> {
    this.started.push(source.requestId);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 8);
        options.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("cancelled", "AbortError"));
        }, { once: true });
      });
      if (options.signal.aborted) throw new DOMException("cancelled", "AbortError");
      return result(source);
    } finally {
      this.active -= 1;
    }
  }

  async cancel(source: HanaFinalizationSnapshotV0): Promise<void> {
    this.cancelled.push(source.requestId);
  }
}

test("object coordinator runs independent objects in a bounded parallel queue", async () => {
  const backend = new FakeBackend();
  const results: string[] = [];
  const coordinator = new HanaRemoteObjectCoordinator(backend, { maxConcurrent: 2, onResult: (objectId) => results.push(objectId) });
  coordinator.enqueue({ objectId: "stem", snapshot: snapshot("stem", 1), priority: "active" });
  coordinator.enqueue({ objectId: "petal", snapshot: snapshot("petal", 1), priority: "visible" });
  coordinator.enqueue({ objectId: "background", snapshot: snapshot("background", 1), priority: "background" });
  await coordinator.whenIdle();
  assert.equal(backend.maxActive, 2);
  assert.deepEqual(results, ["stem", "petal", "background"]);
  assert.equal(coordinator.state().queued, 0);
  assert.equal(coordinator.state().active, 0);
  assert.equal(coordinator.state().completed, 3);
});

test("object coordinator cancels and supersedes only the same object", async () => {
  const backend = new FakeBackend();
  const results: string[] = [];
  const stale: number[] = [];
  const coordinator = new HanaRemoteObjectCoordinator(backend, {
    maxConcurrent: 2,
    onResult: (objectId, value) => results.push(`${objectId}:${value.generationId}`),
    onStale: (_objectId, generationId) => stale.push(generationId),
  });
  coordinator.enqueue({ objectId: "petal", snapshot: snapshot("petal", 1), priority: "visible" });
  await new Promise((resolve) => setTimeout(resolve, 1));
  coordinator.enqueue({ objectId: "petal", snapshot: snapshot("petal", 2), priority: "active" });
  coordinator.enqueue({ objectId: "core", snapshot: snapshot("core", 1), priority: "visible" });
  await coordinator.whenIdle();
  assert.deepEqual(results.sort(), ["core:1", "petal:2"]);
  assert.ok(stale.includes(1));
  assert.ok(backend.cancelled.includes("petal-1"));
  assert.equal(coordinator.state().completed, 2);
});

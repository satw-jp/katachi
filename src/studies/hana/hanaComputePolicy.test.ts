import assert from "node:assert/strict";
import test from "node:test";
import { defaultHanaMaterialSettings } from "./authoringDocument.ts";
import {
  chooseHanaAutoCompute,
  estimateHanaComputeWork,
  HANA_AUTO_THRESHOLDS,
} from "./hanaComputePolicy.ts";
import {
  AutoHanaComputeBackend,
  HANA_COMPUTE_CAPABILITIES,
  type HanaComputeFinalizeOptions,
  type HanaComputeHealth,
} from "./computeBackend.ts";
import { createHanaFinalizationSnapshot } from "./finalizationCore.ts";
import { deriveStroke3D } from "./stroke3d.ts";

function snapshot(baseRadius = 0.18) {
  const raw = {
    id: "policy-gesture",
    viewportId: "viewport-front",
    viewDirection: "front" as const,
    pointerType: "pen" as const,
    viewportSize: { width: 100, height: 100 },
    points: Array.from({ length: 32 }, (_, index) => ({
      x: index * 0.5,
      y: Math.sin(index * 0.2),
      pressure: 0.5,
      time: index * 10,
    })),
  };
  return createHanaFinalizationSnapshot({
    requestId: "policy-request",
    documentId: "policy-document",
    documentRevision: 1,
    objectRevision: 1,
    generationId: 1,
    stroke: deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }), 32),
    materialSettings: defaultHanaMaterialSettings(baseRadius),
  });
}

function health(status: "ready" | "unavailable"): HanaComputeHealth {
  return {
    status,
    protocolVersion: "katachi.hana-compute-wire.v0",
    algorithmVersion: "hana-cpu-js-v0",
    engine: "cpu-js-v0",
    workerCount: 4,
    activeJobs: 0,
    queuedJobs: 0,
    uptime: 1,
    ...(status === "unavailable" ? { reason: "offline" } : {}),
  };
}

test("AUTO estimate is deterministic and includes object workload fields", () => {
  const source = snapshot();
  const first = estimateHanaComputeWork(source, { objectCount: 3, dependencyCount: 2 });
  assert.deepEqual(first, estimateHanaComputeWork(source, { objectCount: 3, dependencyCount: 2 }));
  assert.equal(first.objectCount, 3);
  assert.equal(first.dependencyCount, 2);
  assert.ok(first.boundsVolume > 0);
  assert.ok(first.candidateCountEstimate >= first.materialSamples);
  assert.ok(HANA_AUTO_THRESHOLDS.estimatedVoxelsForWindows > 0);
});

test("AUTO returns deterministic reason for local, remote, and unavailable choices", () => {
  const light = chooseHanaAutoCompute(snapshot(0.5), health("ready"));
  assert.equal(light.choice, "local");
  assert.match(light.reason, /AUTO chose LOCAL/);
  const heavy = chooseHanaAutoCompute(snapshot(0.01), health("ready"));
  assert.equal(heavy.choice, "windows");
  assert.match(heavy.reason, /AUTO chose WINDOWS/);
  const offline = chooseHanaAutoCompute(snapshot(0.01), health("unavailable"));
  assert.equal(offline.choice, "local");
  assert.match(offline.reason, /remote unavailable/);
});

class FakeRemote {
  readonly id = "windows";
  readonly capabilities = HANA_COMPUTE_CAPABILITIES;
  readonly strict = false;
  healthValue: HanaComputeHealth = health("unavailable");
  healthCalls = 0;
  finalizeCalls = 0;

  healthCheck(): Promise<HanaComputeHealth> {
    this.healthCalls += 1;
    return Promise.resolve(this.healthValue);
  }

  async finalize(_source: ReturnType<typeof snapshot>, _options: HanaComputeFinalizeOptions) {
    this.finalizeCalls += 1;
    throw new Error("remote unavailable");
  }
}

test("AUTO caches an unhealthy remote and reports safe local selection", async () => {
  const remote = new FakeRemote();
  const auto = new AutoHanaComputeBackend({ windows: remote, healthCacheMilliseconds: 10_000 });
  const progress: string[] = [];
  const options = { signal: new AbortController().signal, onProgress: (value: { stage: string }) => progress.push(value.stage) };
  await auto.finalize(snapshot(0.5), options);
  await auto.finalize(snapshot(0.5), options);
  assert.equal(remote.healthCalls, 1);
  assert.equal(remote.finalizeCalls, 0);
  assert.equal(auto.lastDecision?.choice, "local");
  assert.match(progress[0] ?? "", /AUTO chose LOCAL/);
});

test("AUTO falls back to Local only after a current heavy remote failure", async () => {
  const remote = new FakeRemote();
  remote.healthValue = health("ready");
  const auto = new AutoHanaComputeBackend({ windows: remote, healthCacheMilliseconds: 10_000 });
  const progress: string[] = [];
  const result = await auto.finalize(snapshot(), {
    signal: new AbortController().signal,
    onProgress: (value) => progress.push(value.stage),
  });
  assert.equal(remote.finalizeCalls, 1);
  assert.equal(result.validation.finite, true);
  assert.ok(progress.some((stage) => stage.includes("AUTO fallback LOCAL")));
});

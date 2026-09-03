import assert from "node:assert/strict";
import test from "node:test";
import { defaultHanaMaterialSettings } from "./authoringDocument.ts";
import {
  HANA_AUTO_THRESHOLDS,
  LocalHanaComputeBackend,
  estimateHanaComputeWork,
} from "./computeBackend.ts";
import { computeHanaFinalization, createHanaFinalizationSnapshot } from "./finalizationCore.ts";
import { deriveStroke3D } from "./stroke3d.ts";
import type { HanaStrokePoint, HanaViewportStroke } from "./gesture.ts";

function snapshot() {
  const raw: HanaViewportStroke = {
    id: "gesture-backend",
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: Array.from({ length: 8 }, (_, index): HanaStrokePoint => ({ x: index, y: index % 2, pressure: 0.5, time: index * 10 })),
  };
  return createHanaFinalizationSnapshot({
    requestId: "backend-request",
    documentId: "backend-document",
    documentRevision: 1,
    objectRevision: 1,
    generationId: 1,
    stroke: deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }), 8),
    materialSettings: defaultHanaMaterialSettings(0.18),
  });
}

test("Local backend uses the shared core and reports readiness", async () => {
  const backend = new LocalHanaComputeBackend();
  assert.equal((await backend.healthCheck()).status, "ready");
  const result = await backend.finalize(snapshot(), { signal: new AbortController().signal });
  const direct = await computeHanaFinalization(snapshot(), undefined, { zSlicesPerYield: 4, yieldToBrowser: async () => undefined });
  assert.deepEqual(Array.from(result.positions), Array.from(direct.positions));
  assert.deepEqual(result.counts, direct.counts);
});

test("Auto work estimate is deterministic and exposes documented thresholds", () => {
  const value = estimateHanaComputeWork(snapshot());
  assert.deepEqual(value, estimateHanaComputeWork(snapshot()));
  assert.ok(HANA_AUTO_THRESHOLDS.materialSamplesForWindows > 0);
  assert.ok(value.controls > 0 && value.smooth > 0 && value.materialSamples > 0);
});

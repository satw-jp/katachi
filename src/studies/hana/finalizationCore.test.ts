import assert from "node:assert/strict";
import test from "node:test";
import { defaultHanaMaterialSettings } from "./authoringDocument.ts";
import {
  computeHanaFinalization,
  createHanaFinalizationSnapshot,
  finalizationResultToTriangles,
  parseHanaFinalizationSnapshot,
  serializeHanaFinalizationSnapshot,
} from "./finalizationCore.ts";
import { deriveStroke3D } from "./stroke3d.ts";
import type { HanaStrokePoint, HanaViewportStroke } from "./gesture.ts";

function source(): HanaViewportStroke {
  const points: HanaStrokePoint[] = Array.from({ length: 12 }, (_, index) => ({
    x: index * 12,
    y: Math.sin(index * 0.5) * 8,
    pressure: 0.2 + index / 20,
    time: index * 30,
  }));
  return {
    id: "gesture-finalization-core",
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 1024, height: 768 },
    points,
  };
}

function snapshot() {
  const raw = source();
  const stroke = deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }), 16);
  return createHanaFinalizationSnapshot({
    requestId: "request-1",
    documentId: "document-1",
    documentRevision: 4,
    objectRevision: 2,
    generationId: 7,
    stroke,
    materialSettings: defaultHanaMaterialSettings(0.18),
  });
}

test("finalization snapshot is deterministic and round-trips without the document", () => {
  const original = snapshot();
  const encoded = serializeHanaFinalizationSnapshot(original);
  const decoded = parseHanaFinalizationSnapshot(JSON.parse(encoded));
  assert.equal(serializeHanaFinalizationSnapshot(decoded), encoded);
  assert.equal(decoded.format, "katachi.hana-finalization-snapshot.v0");
  assert.equal(decoded.controls.length, 16);
  assert.equal("rawGestures" in decoded, false);
  assert.equal("editorState" in decoded, false);
});

test("shared finalization core returns typed arrays and a non-empty mesh", async () => {
  const result = await computeHanaFinalization(snapshot(), undefined, {
    zSlicesPerYield: 8,
    yieldToBrowser: async () => undefined,
  });
  assert.equal(result.format, "katachi.hana-finalization-result.v0");
  assert.ok(result.positions instanceof Float32Array);
  assert.ok(result.normals instanceof Float32Array);
  assert.ok(result.indices instanceof Uint32Array);
  assert.ok(result.positions.length > 0);
  assert.equal(result.counts.triangles, result.positions.length / 9);
  assert.equal(finalizationResultToTriangles(result).length, result.counts.triangles);
  assert.equal(result.validation.finite, true);
  assert.equal(result.validation.nonEmpty, true);
});

test("finalization cancellation is observed before meshing completes", async () => {
  let cancelled = false;
  await assert.rejects(
    computeHanaFinalization(snapshot(), { isCancelled: () => cancelled }, {
      zSlicesPerYield: 1,
      yieldToBrowser: async () => { cancelled = true; },
    }),
    /HANA_FINALIZATION_CANCELLED|Point Field mesh generation was superseded/,
  );
});

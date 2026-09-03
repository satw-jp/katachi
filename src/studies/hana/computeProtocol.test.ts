import assert from "node:assert/strict";
import test from "node:test";
import { defaultHanaMaterialSettings } from "./authoringDocument.ts";
import {
  computeHanaFinalization,
  createHanaFinalizationSnapshot,
  type HanaFinalizationResultV0,
} from "./finalizationCore.ts";
import { decodeHanaFinalizationResult, encodeHanaFinalizationResult } from "./computeProtocol.ts";
import { deriveStroke3D } from "./stroke3d.ts";

function result(): HanaFinalizationResultV0 {
  return {
    format: "katachi.hana-finalization-result.v0",
    requestId: "wire-request",
    documentRevision: 2,
    objectId: "wire-object",
    objectRevision: 3,
    generationId: 4,
    algorithmVersion: "hana-cpu-js-v0",
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
    counts: { controls: 2, smooth: 9, materialSamples: 8, voxels: 64, candidates: 32, triangles: 1, components: 1, effectiveResolution: 8 },
    timings: { smoothCenterline: 1, materialSamples: 2, fieldPreparation: 3, effectiveResolution: 4, meshGeneration: 5, validation: 6, total: 21 },
    validation: { finite: true, nonEmpty: true, watertight: true, components: 1, errors: [] },
  };
}

function snapshot() {
  const raw = {
    id: "wire-gesture",
    viewportId: "viewport-front",
    viewDirection: "front" as const,
    pointerType: "pen" as const,
    viewportSize: { width: 100, height: 100 },
    points: [
      { x: 0, y: 0, pressure: 0.2, time: 0 },
      { x: 1, y: 0.2, pressure: 0.5, time: 10 },
      { x: 2, y: 0, pressure: 0.8, time: 20 },
    ],
  };
  return createHanaFinalizationSnapshot({
    requestId: "parity-request",
    documentId: "parity-document",
    documentRevision: 1,
    objectRevision: 1,
    generationId: 1,
    stroke: deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }), 3),
    materialSettings: defaultHanaMaterialSettings(0.5),
  });
}

test("binary finalization wire round-trips typed arrays without base64", () => {
  const encoded = encodeHanaFinalizationResult(result());
  const decoded = decodeHanaFinalizationResult(encoded);
  assert.deepEqual(Array.from(decoded.positions), Array.from(result().positions));
  assert.deepEqual(Array.from(decoded.normals), Array.from(result().normals));
  assert.deepEqual(Array.from(decoded.indices), Array.from(result().indices));
  assert.equal(decoded.requestId, "wire-request");
  assert.equal(new TextDecoder().decode(encoded).includes("base64"), false);
});

test("binary finalization wire rejects truncation and oversized payloads", () => {
  const encoded = encodeHanaFinalizationResult(result());
  assert.throws(() => decodeHanaFinalizationResult(encoded.slice(0, 3)), /truncated/);
  assert.throws(() => decodeHanaFinalizationResult(encoded, encoded.byteLength - 1), /size limit/);
});

test("shared finalization remains numerically identical through the binary wire", async () => {
  const local = await computeHanaFinalization(snapshot(), undefined, {
    zSlicesPerYield: 8,
    yieldToBrowser: async () => undefined,
  });
  const remoteWireResult = decodeHanaFinalizationResult(encodeHanaFinalizationResult(local));
  assert.deepEqual(Array.from(remoteWireResult.positions), Array.from(local.positions));
  assert.deepEqual(Array.from(remoteWireResult.normals), Array.from(local.normals));
  assert.deepEqual(Array.from(remoteWireResult.indices), Array.from(local.indices));
  assert.deepEqual(remoteWireResult.counts, local.counts);
  assert.deepEqual(remoteWireResult.validation, local.validation);
});

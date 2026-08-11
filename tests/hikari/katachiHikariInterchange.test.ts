import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_FIELD_PARAMS } from "../../src/studies/cloud-sculpt/field.ts";
import { DEFAULT_HIKARI_SETTINGS } from "../../src/studies/cloud-sculpt/hikari.ts";
import { parseKatachiInterchangeCase } from "../../src/studies/cloud-sculpt/katachiHikariInterchange.ts";

function fixture(overrides: Record<string, unknown> = {}): string {
  const recipe = {
    formatVersion: 1,
    studyId: "cloud-sculpt",
    exportedAt: "2026-08-11T00:00:00.000Z",
    entries: [
      { t: 1, op: "clear", args: {} },
      { t: 2, op: "addBall", args: { id: 7, x: 0.2, y: 0.1, z: -0.3, r: 0.8 } },
    ],
  };
  return JSON.stringify({
    formatVersion: 1,
    id: "katachi-to-hikari",
    capturedAtUtc: "2026-08-11T00:00:00.000Z",
    appVersion: "katachi-next",
    gitCommit: "abc123",
    assets: [{
      formatVersion: 1,
      id: "shape-1",
      source: { studyId: "cloud-sculpt" },
      recipe,
      representation: {
        kind: "metaballs-v1",
        smoothK: DEFAULT_FIELD_PARAMS.k,
        balls: [{ id: "7", x: 0.2, y: 0.1, z: -0.3, radius: 0.8 }],
      },
    }],
    scene: {
      host: { shapeAssetId: "shape-1" },
      camera: {
        position: { x: 1, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fovYDeg: 42,
      },
    },
    renderer: { backend: "webgpu", sampleCount: 65536 },
    controls: { ...DEFAULT_HIKARI_SETTINGS, trailLength: 18 },
    observation: { observed: ["光が形を回る"], interpretation: [], decision: [] },
    ...overrides,
  });
}

test("standalone Hikari consumes Katachi's canonical ShapeAsset case boundary", () => {
  const value = parseKatachiInterchangeCase(fixture());
  assert.equal(value.caseId, "katachi-to-hikari");
  assert.equal(value.shape.recipeEntries.length, 2);
  assert.equal(value.hikariSettings.trailLength, 18);
  assert.deepEqual(value.camera.position, [1, 2, 3]);
  assert.equal(value.backend.kind, "webgpu");
  assert.match(value.observation, /光が形を回る/);
});

test("interchange rejects a recipe that does not reproduce the serialized shape", () => {
  const raw = JSON.parse(fixture()) as {
    assets: Array<{ representation: { balls: Array<{ radius: number }> } }>;
  };
  raw.assets[0].representation.balls[0].radius = 0.9;
  assert.throws(
    () => parseKatachiInterchangeCase(JSON.stringify(raw)),
    /recipe differs from ShapeAsset/,
  );
});

test("ordinary legacy Hikari cases remain selected by their existing parser", () => {
  const main = readFileSync(
    new URL("../../src/studies/cloud-sculpt/main.ts", import.meta.url),
    "utf8",
  );
  assert.match(main, /fromKatachi\s*\? parseKatachiInterchangeCase\(text\)\s*:\s*parseHikariCase\(text\)/);
  assert.match(main, /Katachi共有caseから形・光・視点を開きました/);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as THREE from "three";
import { fieldSdf, type Ball } from "../../src/studies/cloud-sculpt/field.ts";
import { DEFAULT_HIKARI_SETTINGS, normalizeHikariSettings } from "../../src/studies/cloud-sculpt/hikari.ts";
import {
  DEFAULT_EXPERIMENTAL_LIGHT_BAND,
  deriveExperimentalLightBand,
  EXPERIMENTAL_LIGHT_BAND_BALL_COUNT,
  EXPERIMENTAL_LIGHT_BAND_SOURCE_SIZES,
} from "../../src/studies/cloud-sculpt/lightDrawingBand.ts";
import { createHikariCase, parseHikariCase, serializeHikariCase } from "../../src/studies/cloud-sculpt/hikariCase.ts";
import { createHikariDocument, parseHikariDocument, serializeHikariDocument } from "../../src/studies/cloud-sculpt/hikariDocument.ts";
import { OpticsLayer } from "../../src/studies/cloud-sculpt/optics.ts";
import {
  BACKLIGHT_STUDY_SHAPE_SOURCE,
  SHAPE_SOURCE_REFERENCE_SETTINGS,
} from "./light-drawing/shape-source-reference.fixture.ts";

const baseBalls: Ball[] = BACKLIGHT_STUDY_SHAPE_SOURCE.balls.map((ball, index) => ({
  id: index + 1,
  x: ball.center.x,
  y: ball.center.y,
  z: ball.center.z,
  r: ball.radius,
}));
const k = BACKLIGHT_STUDY_SHAPE_SOURCE.smoothness;

function enabled(position: "left" | "center" | "right" = "center") {
  return { lightDrawingBand: { ...DEFAULT_EXPERIMENTAL_LIGHT_BAND, position } };
}

function hash(values: Float32Array): string {
  return createHash("sha256").update(values).digest("hex");
}

function absDifferenceCentroid(a: Float32Array, b: Float32Array, width: number): number {
  let weight = 0;
  let x = 0;
  for (let index = 0; index < a.length; index += 3) {
    const difference = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
    weight += difference;
    x += difference * ((index / 3) % width);
  }
  return x / weight;
}

function fieldConcentration(field: Float32Array): number {
  let maximum = 0;
  for (const value of field) maximum = Math.max(maximum, value);
  return maximum;
}

test("experimental light band is inert by default and its persisted geometry is frozen", () => {
  const defaults = normalizeHikariSettings({});
  assert.deepEqual(defaults.lightDrawingBand, DEFAULT_EXPERIMENTAL_LIGHT_BAND);
  const tampered = normalizeHikariSettings({
    lightDrawingBand: {
      version: 1,
      position: "left",
      ballCount: 999,
      radiusRatio: 9,
      xOffsetRatio: 9,
      zSpacingRatio: 9,
      insetRatio: 9,
      rootScanIntervals: 1,
      rootBisections: 1,
    } as never,
  });
  assert.deepEqual(tampered.lightDrawingBand, { ...DEFAULT_EXPERIMENTAL_LIGHT_BAND, position: "left" });
  assert.equal(deriveExperimentalLightBand(baseBalls, k, defaults).balls, baseBalls);
  assert.equal(deriveExperimentalLightBand(baseBalls, k, { lightDrawingBand: { ...DEFAULT_EXPERIMENTAL_LIGHT_BAND, position: "off" } }).balls, baseBalls);
});

test("17-ball band is deterministic, input-safe, connected, rooted, and visibly protrudes", () => {
  const before = structuredClone(baseBalls);
  const first = deriveExperimentalLightBand(baseBalls, k, enabled());
  const second = deriveExperimentalLightBand(baseBalls, k, enabled());
  assert.equal(first.enabled, true, first.reason ?? "unexpected unavailable result");
  assert.equal(first.appendedCount, EXPERIMENTAL_LIGHT_BAND_BALL_COUNT);
  assert.equal(first.balls.length, baseBalls.length + EXPERIMENTAL_LIGHT_BAND_BALL_COUNT);
  assert.deepEqual(first.balls, second.balls);
  assert.deepEqual(baseBalls, before);
  assert.deepEqual(first.balls.slice(0, baseBalls.length), baseBalls);
  const appended = first.balls.slice(baseBalls.length);
  const rho = appended[0].r;
  assert.equal(rho, 0.16 * baseBalls[5].r, "largest-radius lowest-index anchor");
  assert.ok(appended.every((ball) => Number.isFinite(ball.x) && Number.isFinite(ball.y) && Number.isFinite(ball.z) && Number.isFinite(ball.r)));
  assert.equal(new Set(appended.map((ball) => ball.id)).size, EXPERIMENTAL_LIGHT_BAND_BALL_COUNT);
  assert.ok(appended.every((ball) => ball.id < 0 && !baseBalls.some((base) => base.id === ball.id)));
  for (let index = 1; index < appended.length; index++) {
    const a = appended[index - 1]; const b = appended[index];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 2 * rho);
  }
  assert.ok(appended.some((ball) => fieldSdf(baseBalls, k, ball.x, ball.y + ball.r, ball.z) > 0), "band must protrude from the base surface");
  assert.ok(appended.every((ball) => fieldSdf(baseBalls, k, ball.x, ball.y, ball.z) < 0), "inset centers remain connected");
  assert.equal((appended[16].z - appended[0].z) / rho, 10, "fixed 5× width-to-thickness ratio");
});

test("invalid base fields and GPU cap return one unavailable result without changing input", () => {
  const invalid = [...baseBalls.slice(0, 2), { id: 3, x: Number.NaN, y: 0, z: 0, r: 1 }];
  const original = structuredClone(invalid);
  assert.equal(deriveExperimentalLightBand(invalid, k, enabled()).enabled, false);
  assert.deepEqual(invalid, original);
  const capped = Array.from({ length: 240 }, (_, index) => ({ id: index + 1, x: 0, y: 0, z: 0, r: 1 }));
  assert.equal(deriveExperimentalLightBand(capped, k, enabled()).enabled, false);
});

test("Hikari case and .hkr document roundtrips retain the same derived shape without changing its recipe", () => {
  const settings = normalizeHikariSettings({
    ...DEFAULT_HIKARI_SETTINGS,
    lightDrawingBand: { ...DEFAULT_EXPERIMENTAL_LIGHT_BAND, position: "right" },
  });
  const original = deriveExperimentalLightBand(baseBalls, k, settings);
  const value = createHikariCase({
    caseId: "experimental-band", appVersion: "test", commit: "test", observation: "",
    shape: { studyId: "cloud-sculpt", recipeEntries: [] }, hikariSettings: settings,
    camera: { position: [0, 0, 5], target: [0, 0, 0], fov: 45, aspect: 1 },
    compatibility: { safeModeQuery: "auto", compatibilityMode: false },
    backend: { kind: "cpu", text: "test", requestedSampleCount: 256 },
  });
  const restored = parseHikariCase(serializeHikariCase(value));
  assert.deepEqual(restored.hikariSettings.lightDrawingBand, settings.lightDrawingBand);
  assert.deepEqual(deriveExperimentalLightBand(baseBalls, k, restored.hikariSettings).balls, original.balls);
  const document = createHikariDocument({
    documentId: "experimental-band", appVersion: "test", commit: "test", activeViewId: "view-1",
    views: [{ viewId: "view-1", name: "band", createdAt: "2026-08-09T00:00:00.000Z", case: value }], createdAt: "2026-08-09T00:00:00.000Z",
  });
  const reopened = parseHikariDocument(serializeHikariDocument(document));
  assert.deepEqual(
    deriveExperimentalLightBand(baseBalls, k, reopened.views[0].case.hikariSettings).balls,
    original.balls,
  );
});

test("fixed reference receiver changes across positions and source sizes without retuning", () => {
  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const run = (position: "off" | "left" | "center" | "right", sunSize: number) => {
    const shape = deriveExperimentalLightBand(baseBalls, k, {
      lightDrawingBand: { ...DEFAULT_EXPERIMENTAL_LIGHT_BAND, position },
    });
    return layer.runCpuShapeSourceReferenceCase({
      kind: "balls-smooth-union",
      balls: shape.balls.map((ball) => ({ center: { x: ball.x, y: ball.y, z: ball.z }, radius: ball.r })),
      smoothness: k,
    }, { ...SHAPE_SOURCE_REFERENCE_SETTINGS, sunSize, opticalSampleCount: 16384 }, { sampleCount: 16384 }).field;
  };
  const off = run("off", 0.53);
  const left = run("left", 0.53);
  const center = run("center", 0.53);
  const right = run("right", 0.53);
  assert.notEqual(hash(off.depositedFluxRgb), hash(left.depositedFluxRgb));
  assert.notEqual(hash(off.depositedFluxRgb), hash(center.depositedFluxRgb));
  assert.notEqual(hash(off.depositedFluxRgb), hash(right.depositedFluxRgb));
  const centroids = [left, center, right].map((field) => absDifferenceCentroid(off.depositedFluxRgb, field.depositedFluxRgb, field.width));
  assert.ok(centroids[0] - centroids[1] >= 1 && centroids[1] - centroids[2] >= 1, `expected monotonic centroids: ${centroids}`);
  const sources = EXPERIMENTAL_LIGHT_BAND_SOURCE_SIZES.map((size) => run("center", size));
  const concentration = sources.map((field) => fieldConcentration(field.depositedFluxRgb));
  const area = sources.map((field) => field.depositedFluxRgb.reduce((count, value) => count + (value > 1e-8 ? 1 : 0), 0));
  assert.ok(concentration[0] > concentration[1] && concentration[1] > concentration[2], `expected decreasing concentration: ${concentration}`);
  assert.ok(area[0] < area[1] && area[1] < area[2], `expected increasing area: ${area}`);
});

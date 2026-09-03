import assert from "node:assert/strict";
import test from "node:test";

import { defaultHanaMaterialSettings } from "./authoringDocument.ts";
import {
  boundedMaterialProfile,
  buildGestureChannel,
  mapGestureToMaterialProfile,
} from "./gestureMaterial.ts";
import type { HanaViewportStroke } from "./gesture.ts";

function fixture(): HanaViewportStroke {
  return {
    id: "gesture-material",
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: [
      { x: 0, y: 0, pressure: 0.1, time: 0 },
      { x: 2, y: 0, pressure: 0.3, time: 100 },
      { x: 8, y: 1, pressure: 0.9, time: 200 },
      { x: 9, y: 3, pressure: 0.5, time: 800 },
    ],
  };
}

test("gesture channels are deterministic, arc-length based, finite and provenance preserving", () => {
  const source = fixture();
  const before = structuredClone(source);
  const first = buildGestureChannel(source);
  const second = buildGestureChannel(source);
  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.equal(first[0].arcLength, 0);
  assert.equal(first[first.length - 1]?.sourcePointEnd, 3);
  assert.ok(first.every((sample) => Number.isFinite(sample.speed) && Number.isFinite(sample.time)));
  assert.ok(first.every((sample, index) => index === 0 || sample.arcLength >= first[index - 1].arcLength));
});

test("Uniform mapping is exactly compatible with a constant Thickness", () => {
  const settings = defaultHanaMaterialSettings(0.18);
  const profile = mapGestureToMaterialProfile(fixture(), settings, { sampleCount: 32 });
  assert.equal(profile.length, 32);
  assert.ok(profile.every((sample) => sample.radius === 0.18));
  assert.ok(profile.every((sample) => sample.sourceGestureSample.sourceGestureId === "gesture-material"));
});

test("pressure and speed mapping stay within configured bounds and are deterministic", () => {
  const settings = {
    ...defaultHanaMaterialSettings(0.18),
    mapping: "pressure-speed" as const,
    minRadius: 0.1,
    maxRadius: 0.3,
    pressureInfluence: 1,
    speedInfluence: 1,
  };
  const first = mapGestureToMaterialProfile(fixture(), settings, { sampleCount: 24 });
  const second = mapGestureToMaterialProfile(fixture(), settings, { sampleCount: 24 });
  assert.deepEqual(first, second);
  assert.ok(first.every((sample) => sample.radius >= 0.1 && sample.radius <= 0.3));
  assert.ok(new Set(first.map((sample) => sample.radius)).size > 1);
});

test("live material profile is bounded without changing the final profile policy", () => {
  const source = {
    ...fixture(),
    points: Array.from({ length: 1000 }, (_, index) => ({
      x: index * 0.1,
      y: Math.sin(index / 20),
      pressure: (index % 10) / 10,
      time: index * 4,
    })),
  };
  const bounded = boundedMaterialProfile(source, defaultHanaMaterialSettings(), 64);
  const final = mapGestureToMaterialProfile(source, defaultHanaMaterialSettings());
  assert.equal(bounded.length, 64);
  assert.equal(final.length, 1000);
  assert.deepEqual(source.points[0], { x: 0, y: 0, pressure: 0, time: 0 });
});

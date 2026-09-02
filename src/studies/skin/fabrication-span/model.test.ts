import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFabricationSpanCoupon,
  calculateExtrudedVolumeMm3,
  calculateFilamentLengthMm,
  calculatePathLengthMm,
  DEFAULT_EXTRUSION_PRESETS,
  DEFAULT_FABRICATION_FIXTURE,
  DEFAULT_FABRICATION_PROFILE,
  DEFAULT_FEED_PRESETS,
  generateFabricationGcode,
  planStraightTrajectory,
  type FabricationSpanIntent,
  type Point3,
  validateFabricationProfile,
  validateFabricationSpanIntent,
} from "./model.ts";

const point = (x: number, y: number, z: number): Point3 => ({ x, y, z });

function validIntent(overrides: Partial<FabricationSpanIntent> = {}): FabricationSpanIntent {
  return {
    id: "span-001",
    anchorA: point(0, 0, 3),
    anchorB: point(40, 0, 3),
    feedRateMmPerMin: 900,
    extrusion: { mode: "relative", filamentMm: 4, multiplier: 1 },
    role: "material-span",
    ...overrides,
  };
}

test("intent rejects non-finite values, invalid anchors, and non-positive fabrication conditions", () => {
  assert.throws(() => validateFabricationSpanIntent(validIntent({ feedRateMmPerMin: Number.NaN })));
  assert.throws(() => validateFabricationSpanIntent(validIntent({ anchorA: point(Number.POSITIVE_INFINITY, 0, 3) })));
  assert.throws(() => validateFabricationSpanIntent(validIntent({ anchorA: point(0, 0, 3), anchorB: point(0, 0, 3) })));
  assert.throws(() => validateFabricationSpanIntent(validIntent({ feedRateMmPerMin: 0 })));
  assert.throws(() => validateFabricationSpanIntent(validIntent({ extrusion: { mode: "relative", filamentMm: -1, multiplier: 1 } })));
  assert.throws(() => validateFabricationSpanIntent(validIntent({ extrusion: { mode: "relative", filamentMm: 1, multiplier: Number.NaN } })));
  assert.throws(() => validateFabricationSpanIntent(validIntent({ role: "not-a-span" as "material-span" })));
});

test("profile rejects non-positive nozzle and filament diameters", () => {
  assert.throws(() => validateFabricationProfile({ ...DEFAULT_FABRICATION_PROFILE, nozzleDiameterMm: 0 }));
  assert.throws(() => validateFabricationProfile({ ...DEFAULT_FABRICATION_PROFILE, nozzleDiameterMm: -0.8 }));
  assert.throws(() => validateFabricationProfile({ ...DEFAULT_FABRICATION_PROFILE, filamentDiameterMm: 0 }));
  assert.throws(() => validateFabricationProfile({ ...DEFAULT_FABRICATION_PROFILE, filamentDiameterMm: Number.NaN }));
});

test("straight geometry has expected length and preserves anchors", () => {
  assert.equal(calculatePathLengthMm(point(0, 0, 0), point(3, 4, 0)), 5);
  const intent = validIntent();
  const trajectory = planStraightTrajectory(intent);
  assert.equal(trajectory.geometry, "straight");
  assert.deepEqual(trajectory.start, intent.anchorA);
  assert.deepEqual(trajectory.end, intent.anchorB);
  assert.equal(trajectory.pathLengthMm, 40);
});

test("extrusion follows path volume divided by filament cross-sectional area", () => {
  const pathLength = 40;
  const multiplier = 1.1;
  const expectedVolume = pathLength * DEFAULT_FABRICATION_PROFILE.lineWidthMm * DEFAULT_FABRICATION_PROFILE.layerHeightMm * multiplier;
  const expectedFilament = expectedVolume / (Math.PI * (DEFAULT_FABRICATION_PROFILE.filamentDiameterMm / 2) ** 2);
  assert.equal(calculateExtrudedVolumeMm3(pathLength, DEFAULT_FABRICATION_PROFILE, multiplier), expectedVolume);
  assert.equal(calculateFilamentLengthMm(pathLength, DEFAULT_FABRICATION_PROFILE, multiplier), expectedFilament);
  assert(calculateFilamentLengthMm(pathLength, DEFAULT_FABRICATION_PROFILE, multiplier) < Number.MAX_VALUE);
  assert.throws(() => calculateFilamentLengthMm(Number.POSITIVE_INFINITY, DEFAULT_FABRICATION_PROFILE, 1));
});

test("path length and multiplier both increase filament length deterministically", () => {
  const short = calculateFilamentLengthMm(20, DEFAULT_FABRICATION_PROFILE, 1);
  const long = calculateFilamentLengthMm(40, DEFAULT_FABRICATION_PROFILE, 1);
  const more = calculateFilamentLengthMm(40, DEFAULT_FABRICATION_PROFILE, 1.2);
  assert(long > short);
  assert(more > long);
});

test("coupon rows use unique deterministic IDs and straight trajectories", () => {
  const config = {
    profile: DEFAULT_FABRICATION_PROFILE,
    fixture: DEFAULT_FABRICATION_FIXTURE,
    feedPresets: DEFAULT_FEED_PRESETS,
    extrusionPresets: DEFAULT_EXTRUSION_PRESETS,
  } as const;
  const first = buildFabricationSpanCoupon(config);
  const second = buildFabricationSpanCoupon(config);
  assert.deepEqual(first, second);
  assert.deepEqual(first.spans.map((span) => span.intent.id), [
    "F1-E1", "F1-E2", "F1-E3",
    "F2-E1", "F2-E2", "F2-E3",
    "F3-E1", "F3-E2", "F3-E3",
  ]);
  assert.equal(first.spans.length, 9);
  for (const span of first.spans) {
    assert.equal(span.trajectory.geometry, "straight");
    assert.deepEqual(span.trajectory.start, span.intent.anchorA);
    assert.deepEqual(span.trajectory.end, span.intent.anchorB);
    assert(Number.isFinite(span.intent.extrusion.filamentMm));
  }
});

test("G-code contains a traceable comment and move pair for every span", () => {
  const coupon = buildFabricationSpanCoupon({
    profile: DEFAULT_FABRICATION_PROFILE,
    fixture: DEFAULT_FABRICATION_FIXTURE,
    feedPresets: DEFAULT_FEED_PRESETS,
    extrusionPresets: DEFAULT_EXTRUSION_PRESETS,
  });
  const gcode = generateFabricationGcode(coupon);
  assert.match(gcode, /; SKIN FABRICATION SPAN 0/);
  assert.match(gcode, /; MACHINE START \/ END NOT INCLUDED/);
  assert.match(gcode, /M83/);
  for (const span of coupon.spans) {
    assert.match(gcode, new RegExp(`; span id = ${span.intent.id}`));
  }
  assert.equal((gcode.match(/; travel move/g) ?? []).length, coupon.spans.length);
  assert.equal((gcode.match(/; extrusion move/g) ?? []).length, coupon.spans.length);
  assert(!gcode.includes("sag"));
  assert(!gcode.includes("random"));
  assert(!/[+-]?(?:NaN|Infinity)/.test(gcode));
});

test("preview and G-code consume the same planned trajectory source", () => {
  const coupon = buildFabricationSpanCoupon({
    profile: DEFAULT_FABRICATION_PROFILE,
    fixture: DEFAULT_FABRICATION_FIXTURE,
    feedPresets: DEFAULT_FEED_PRESETS,
    extrusionPresets: DEFAULT_EXTRUSION_PRESETS,
  });
  for (const span of coupon.spans) {
    assert.deepEqual(span.trajectory.start, span.extrusionMove.start);
    assert.deepEqual(span.trajectory.end, span.extrusionMove.end);
    assert.equal(span.extrusionMove.extrusionMm, span.intent.extrusion.filamentMm);
  }
  const firstGcode = generateFabricationGcode(coupon);
  const secondGcode = generateFabricationGcode(buildFabricationSpanCoupon({
    profile: DEFAULT_FABRICATION_PROFILE,
    fixture: DEFAULT_FABRICATION_FIXTURE,
    feedPresets: DEFAULT_FEED_PRESETS,
    extrusionPresets: DEFAULT_EXTRUSION_PRESETS,
  }));
  assert.equal(firstGcode, secondGcode);
});

console.log("SKIN Fabrication Span model tests passed");

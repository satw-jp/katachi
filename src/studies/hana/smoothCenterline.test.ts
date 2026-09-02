import assert from "node:assert/strict";
import test from "node:test";

import type { HanaStroke3D } from "./stroke3d.ts";
import {
  HANA_CONTROL_POINT_COUNT,
  HANA_CURVE_SETTINGS,
} from "./stroke3d.ts";
import {
  HANA_SOFT_EDIT_WEIGHTS,
  applySoftViewportEdit,
  controlPointRoughness,
  displayControlPositions,
  editorStrokeColor,
  sampleSmoothCenterline,
  strokeBounds,
} from "./smoothCenterline.ts";

function fixtureStroke(): HanaStroke3D {
  return {
    id: "stroke3d-1",
    sourceGestureId: "gesture-1",
    sourceViewportId: "viewport-front",
    sourceViewDirection: "front",
    initialPlaneValue: 0,
    curve: { ...HANA_CURVE_SETTINGS },
    controlPoints: Array.from({ length: HANA_CONTROL_POINT_COUNT }, (_, index) => ({
      id: `control-${index + 1}`,
      position: { x: index, y: 0, z: Math.sin(index * 0.25) },
      provenance: {
        sourceStroke: "gesture-1",
        sourceT: index / (HANA_CONTROL_POINT_COUNT - 1),
        sourcePointStart: index * 2,
        sourcePointEnd: index * 2 + 1,
        pressure: 0.1 + index * 0.01,
        time: index * 8,
      },
    })),
  };
}

function zigzagStroke(): HanaStroke3D {
  const stroke = fixtureStroke();
  stroke.controlPoints = stroke.controlPoints.map((point, index) => ({
    ...point,
    position: { x: index, y: index % 2 === 0 ? 1 : -1, z: 0 },
  }));
  return stroke;
}

test("centripetal Catmull-Rom emits eight samples per segment and preserves controls", () => {
  const stroke = fixtureStroke();
  const smooth = sampleSmoothCenterline(stroke);
  assert.equal(smooth.length, (HANA_CONTROL_POINT_COUNT - 1) * 8 + 1);
  assert.deepEqual(smooth[0].position, stroke.controlPoints[0].position);
  assert.deepEqual(smooth[smooth.length - 1].position, stroke.controlPoints[31].position);
  stroke.controlPoints.forEach((control, index) => {
    assert.deepEqual(smooth[index * 8].position, control.position);
  });
  assert.ok(smooth.every((point) => (
    Number.isFinite(point.position.x)
    && Number.isFinite(point.position.y)
    && Number.isFinite(point.position.z)
  )));
  assert.ok(smooth.every((point, index) => index === 0 || point.position.x >= smooth[index - 1].position.x));
});

test("smooth samples interpolate sourceT, pressure and time without changing controls", () => {
  const stroke = fixtureStroke();
  const before = structuredClone(stroke.controlPoints);
  const smooth = sampleSmoothCenterline(stroke);
  assert.deepEqual(stroke.controlPoints, before);
  assert.equal(smooth[0].sourceT, 0);
  assert.equal(smooth[smooth.length - 1].sourceT, 1);
  assert.ok(smooth.every((point, index) => index === 0 || point.time >= smooth[index - 1].time));
  assert.ok(smooth.some((point) => point.pressure > 0.1 && point.pressure < 0.11));
});

test("smoothness is non-destructive, deterministic, bounded, and legacy-safe", () => {
  const stroke = fixtureStroke();
  const controlsBefore = structuredClone(stroke.controlPoints);
  const zero = sampleSmoothCenterline(stroke);
  const legacy = structuredClone(stroke);
  delete legacy.curve.smoothness;
  assert.deepEqual(sampleSmoothCenterline(legacy), zero);

  for (const smoothness of [0, 0.25, 0.5, 0.75, 1]) {
    stroke.curve.smoothness = smoothness;
    const smooth = sampleSmoothCenterline(stroke);
    assert.equal(smooth.length, (HANA_CONTROL_POINT_COUNT - 1) * 8 + 1);
    assert.deepEqual(smooth[0].position, stroke.controlPoints[0].position);
    assert.deepEqual(smooth[smooth.length - 1].position, stroke.controlPoints.at(-1)?.position);
    assert.ok(smooth.every((point) => (
      Number.isFinite(point.position.x)
      && Number.isFinite(point.position.y)
      && Number.isFinite(point.position.z)
    )));
    assert.deepEqual(stroke.controlPoints, controlsBefore);
    assert.deepEqual(sampleSmoothCenterline(stroke), smooth);
  }
});

test("smoothness reduces known zigzag roughness without changing metadata", () => {
  const stroke = zigzagStroke();
  const controlsBefore = structuredClone(stroke.controlPoints);
  const roughness: number[] = [];
  stroke.curve.smoothness = 0;
  const baseline = sampleSmoothCenterline(stroke);
  for (const smoothness of [0, 0.5, 1]) {
    stroke.curve.smoothness = smoothness;
    roughness.push(controlPointRoughness(displayControlPositions(stroke)));
    const smooth = sampleSmoothCenterline(stroke);
    assert.equal(smooth.length, 249);
    assert.deepEqual(smooth.map((point) => point.sourceT), baseline.map((point) => point.sourceT));
    assert.deepEqual(smooth.map((point) => point.pressure), baseline.map((point) => point.pressure));
    assert.deepEqual(smooth.map((point) => point.time), baseline.map((point) => point.time));
    assert.deepEqual(sampleSmoothCenterline(stroke), smooth);
  }
  assert.ok(roughness[1] <= roughness[0]);
  assert.ok(roughness[2] <= roughness[1]);
  assert.ok(roughness[2] < roughness[0]);
  assert.deepEqual(stroke.controlPoints, controlsBefore);
});

test("soft edit presets use exact index weights and preserve provenance", () => {
  assert.deepEqual(HANA_SOFT_EDIT_WEIGHTS.off, [1]);
  assert.deepEqual(HANA_SOFT_EDIT_WEIGHTS.low, [1, 0.67, 0.33]);
  assert.deepEqual(HANA_SOFT_EDIT_WEIGHTS.medium, [1, 0.8, 0.6, 0.4, 0.2]);
  const expectedCounts = { off: 1, low: 5, medium: 9 } as const;
  for (const strength of ["off", "low", "medium"] as const) {
    const stroke = fixtureStroke();
    const provenance = structuredClone(stroke.controlPoints.map((point) => point.provenance));
    const edit = applySoftViewportEdit(stroke, 16, "right", { x: 99, y: 5, z: 3 }, strength);
    assert.equal(edit.affectedControlIndices.length, expectedCounts[strength]);
    assert.equal(stroke.controlPoints[16].position.x, 16);
    assert.equal(stroke.controlPoints[16].position.y, 5);
    assert.equal(stroke.controlPoints[16].position.z, 3);
    const preset = HANA_SOFT_EDIT_WEIGHTS[strength];
    for (let distance = 0; distance < preset.length; distance += 1) {
      assert.equal(stroke.controlPoints[16 - distance].position.y, 5 * preset[distance]);
      assert.equal(stroke.controlPoints[16 + distance].position.y, 5 * preset[distance]);
    }
    assert.deepEqual(stroke.controlPoints.map((point) => point.provenance), provenance);
  }
});

test("soft edit keeps the hidden axis fixed in every orthographic view", () => {
  const cases = [
    { direction: "front", hidden: "y" },
    { direction: "right", hidden: "x" },
    { direction: "top", hidden: "z" },
  ] as const;
  for (const testCase of cases) {
    const stroke = fixtureStroke();
    const before = stroke.controlPoints.map((point) => point.position[testCase.hidden]);
    applySoftViewportEdit(stroke, 16, testCase.direction, { x: 7, y: 8, z: 9 }, "medium");
    assert.deepEqual(stroke.controlPoints.map((point) => point.position[testCase.hidden]), before);
  }
});

test("bounds and editor color are deterministic presentation data", () => {
  const stroke = fixtureStroke();
  assert.deepEqual(strokeBounds(stroke)?.min.x, 0);
  assert.deepEqual(strokeBounds(stroke)?.max.x, 31);
  assert.equal(editorStrokeColor(stroke.id), editorStrokeColor(stroke.id));
  assert.equal("color" in stroke, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_HIKARI_SETTINGS, normalizeHikariSettings } from "../../src/studies/cloud-sculpt/hikari.ts";
import { buildCloudOpticalScene } from "../../src/studies/cloud-sculpt/opticalSceneAdapter.ts";
import { findInvalidContainment } from "../../src/studies/cloud-sculpt/opticalGeometry.ts";
import { segmentLengthInsideInclusions } from "../../src/studies/cloud-sculpt/inclusionTransport.ts";
import { approximateOpticalPathThroughput } from "../../src/studies/cloud-sculpt/optics.ts";
import type { Medium } from "../../src/studies/cloud-sculpt/opticalScene.ts";

const hostBalls = [
  { id: 1, x: 0, y: 0, z: 0, r: 3.2 },
  { id: 2, x: 1.8, y: 0.2, z: 0, r: 2.4 },
];

test("packed inclusions are deterministic, varied, and contained", () => {
  const settings = normalizeHikariSettings({
    ...DEFAULT_HIKARI_SETTINGS,
    inclusionMode: "packed",
    inclusionSeed: "packing-contract-01",
    inclusionCount: 8,
    inclusionShapeFamily: "mixed",
    inclusionSizeMinMm: 4,
    inclusionSizeMaxMm: 12,
    inclusionPlacement: "scattered",
    inclusionMinimumWallMm: 1,
    inclusionMinimumGapMm: 0.5,
  });
  const first = buildCloudOpticalScene(hostBalls, 0.5, settings);
  const replay = buildCloudOpticalScene(hostBalls, 0.5, settings);

  assert.equal(first.inclusionRequestedCount, 8);
  assert.equal(first.inclusionGeneratedCount, 8);
  assert.equal(first.inclusionValid, true);
  assert.equal(first.receiverInclusionSupported, true);
  assert.equal(findInvalidContainment(first.scene), null);
  assert.deepEqual(first.scene.inclusions, replay.scene.inclusions);
  assert.ok(new Set(first.scene.inclusions.map((medium) => medium.shape.balls.length)).size > 1);
  assert.ok(new Set(first.scene.inclusions.map((medium) => medium.shape.balls[0].radius.toFixed(4))).size > 1);
  assert.ok(first.scene.inclusions.every((medium) => medium.material.ior === settings.ior));
});

test("packed settings normalize bounds while legacy scenes remain single", () => {
  const packed = normalizeHikariSettings({
    inclusionMode: "packed",
    inclusionCount: 99,
    inclusionShapeFamily: "stretched",
    inclusionPlacement: "layered",
  });
  assert.equal(packed.inclusionCount, 16);
  assert.equal(packed.inclusionShapeFamily, "stretched");
  assert.equal(packed.inclusionPlacement, "layered");

  const legacy = normalizeHikariSettings({ inclusionEnabled: true });
  const scene = buildCloudOpticalScene(hostBalls, 0.5, legacy);
  assert.equal(legacy.inclusionMode, "single");
  assert.equal(scene.inclusionGeneratedCount, 1);
  assert.equal(scene.receiverInclusionSupported, true);
});

test("packed low-absorption path reaches the receiver with greater throughput", () => {
  const material = {
    id: "packed",
    label: "packed",
    ior: 1.5,
    absorptionPerMm: { r: 0, g: 0, b: 0 },
    roughness: 0,
  };
  const inclusion: Medium = {
    id: "cluster",
    material,
    shape: {
      kind: "balls-smooth-union",
      balls: [
        { center: { x: -0.5, y: 0, z: 0 }, radius: 1 },
        { center: { x: 0.5, y: 0, z: 0 }, radius: 1 },
      ],
      smoothness: 0.2,
    },
    pose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      uniformScale: 1,
    },
  };
  const totalDistance = 5;
  const inclusionDistance = segmentLengthInsideInclusions(
    { x: -2.5, y: 0, z: 0 },
    { x: 2.5, y: 0, z: 0 },
    [inclusion],
  );
  assert.equal(inclusionDistance, 3);
  const hostOnly = approximateOpticalPathThroughput(
    { r: 1, g: 1, b: 1 }, material.absorptionPerMm,
    1.5, 1.5, totalDistance, 0, false,
  );
  const packed = approximateOpticalPathThroughput(
    { r: 1, g: 1, b: 1 }, material.absorptionPerMm,
    1.5, 1.5, totalDistance - inclusionDistance, inclusionDistance, true,
  );
  assert.ok(packed.transmittedRgb.r > hostOnly.transmittedRgb.r);
  assert.ok(packed.transmittedRgb.g > hostOnly.transmittedRgb.g);
  assert.ok(packed.transmittedRgb.b > hostOnly.transmittedRgb.b);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HIKARI_SETTINGS,
  normalizeHikariSettings,
} from "../../src/studies/cloud-sculpt/hikari.ts";
import {
  absorptionFromDisplayColor,
  buildCloudOpticalScene,
} from "../../src/studies/cloud-sculpt/opticalSceneAdapter.ts";

test("custom transmitted color becomes complementary Beer-Lambert absorption", () => {
  const red = absorptionFromDisplayColor("#ff0000", 1);
  assert.ok(red.r < red.g);
  assert.ok(red.r < red.b);
  assert.ok(Math.abs(red.g - red.b) < 1e-12);

  const white = absorptionFromDisplayColor("#ffffff", 1);
  assert.deepEqual(white, { r: 0.04, g: 0.04, b: 0.04 });
});

test("near-white and pastel colors vary continuously toward saturated absorption", () => {
  const white = absorptionFromDisplayColor("#ffffff", 1);
  const nearWhite = absorptionFromDisplayColor("#fffefe", 1);
  const pastel = absorptionFromDisplayColor("#ff8080", 1);
  const saturated = absorptionFromDisplayColor("#ff0000", 1);

  assert.equal(nearWhite.r, white.r);
  assert.ok(nearWhite.g > white.g && nearWhite.g < 0.05);
  assert.ok(nearWhite.b > white.b && nearWhite.b < 0.05);
  assert.ok(pastel.g > nearWhite.g && pastel.g < saturated.g);
  assert.ok(pastel.b > nearWhite.b && pastel.b < saturated.b);
});

test("custom absorption color keeps concentration separate", () => {
  const low = absorptionFromDisplayColor("#f0a85b", 0.5);
  const high = absorptionFromDisplayColor("#f0a85b", 1);
  assert.deepEqual(high, { r: low.r * 2, g: low.g * 2, b: low.b * 2 });
  assert.deepEqual(absorptionFromDisplayColor("#f0a85b", 0), { r: 0, g: 0, b: 0 });
});

test("dense Ref range can suppress a two-unit path while preserving a colored channel", () => {
  const densePurple = absorptionFromDisplayColor("#4b123f", 40);
  const leastAbsorbed = Math.min(densePurple.r, densePurple.g, densePurple.b);
  const twoUnitTransmission = Math.exp(-leastAbsorbed * 2);

  assert.ok(Math.abs(leastAbsorbed - 1.6) < 1e-12);
  assert.ok(twoUnitTransmission > 0.035 && twoUnitTransmission < 0.045);
  assert.ok(Math.max(densePurple.r, densePurple.g, densePurple.b) > leastAbsorbed);
});

test("Hikari settings normalize custom colors and migrate legacy documents", () => {
  const custom = normalizeHikariSettings({
    hostPreset: "custom",
    hostTransmissionColor: "#12ABef",
  });
  assert.equal(custom.hostPreset, "custom");
  assert.equal(custom.hostTransmissionColor, "#12abef");

  const invalid = normalizeHikariSettings({
    hostPreset: "custom",
    hostTransmissionColor: "not-a-color",
  });
  assert.equal(invalid.hostTransmissionColor, DEFAULT_HIKARI_SETTINGS.hostTransmissionColor);
  assert.equal(
    normalizeHikariSettings({}).hostTransmissionColor,
    DEFAULT_HIKARI_SETTINGS.hostTransmissionColor,
  );
  assert.equal(
    normalizeHikariSettings({ inclusionTransmissionColor: "#35A7d4" })
      .inclusionTransmissionColor,
    "#35a7d4",
  );
  assert.equal(
    normalizeHikariSettings({ inclusionTransmissionColor: "invalid" })
      .inclusionTransmissionColor,
    DEFAULT_HIKARI_SETTINGS.inclusionTransmissionColor,
  );
  const dense = normalizeHikariSettings({ absorption: 40, inclusionAbsorption: 40 });
  assert.equal(dense.absorption, 40);
  assert.equal(dense.inclusionAbsorption, 40);
  const clamped = normalizeHikariSettings({ absorption: 99, inclusionAbsorption: 99 });
  assert.equal(clamped.absorption, 40);
  assert.equal(clamped.inclusionAbsorption, 40);
});

test("inclusion transmitted color preserves legacy neutral concentration and reaches every backend", () => {
  const neutral = buildCloudOpticalScene(
    [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
    0.6,
    normalizeHikariSettings({
      ...DEFAULT_HIKARI_SETTINGS,
      inclusionTransmissionColor: "#ffffff",
      inclusionAbsorption: 0.02,
    }),
  );
  assert.deepEqual(neutral.inclusionAbsorptionPerShapeUnit, {
    r: 0.02,
    g: 0.02,
    b: 0.02,
  });

  const red = buildCloudOpticalScene(
    [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
    0.6,
    normalizeHikariSettings({
      ...DEFAULT_HIKARI_SETTINGS,
      inclusionTransmissionColor: "#ff0000",
      inclusionAbsorption: 0.5,
    }),
  );
  assert.ok(red.inclusionAbsorptionPerShapeUnit.r < red.inclusionAbsorptionPerShapeUnit.g);
  assert.equal(
    red.scene.inclusions[0].material.absorptionPerMm.r,
    red.inclusionAbsorptionPerShapeUnit.r / 20,
  );
  assert.equal(
    red.scene.inclusions[0].material.absorptionPerMm.g,
    red.inclusionAbsorptionPerShapeUnit.g / 20,
  );

  const redHalf = buildCloudOpticalScene(
    [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
    0.6,
    normalizeHikariSettings({
      ...DEFAULT_HIKARI_SETTINGS,
      inclusionTransmissionColor: "#ff0000",
      inclusionAbsorption: 0.25,
    }),
  );
  assert.deepEqual(red.inclusionAbsorptionPerShapeUnit, {
    r: redHalf.inclusionAbsorptionPerShapeUnit.r * 2,
    g: redHalf.inclusionAbsorptionPerShapeUnit.g * 2,
    b: redHalf.inclusionAbsorptionPerShapeUnit.b * 2,
  });
  assert.deepEqual(
    buildCloudOpticalScene(
      [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
      0.6,
      normalizeHikariSettings({
        ...DEFAULT_HIKARI_SETTINGS,
        inclusionTransmissionColor: "#ff0000",
        inclusionAbsorption: 0,
      }),
    ).inclusionAbsorptionPerShapeUnit,
    { r: 0, g: 0, b: 0 },
  );
});

test("custom color reaches the shared OpticalScene used by body, receiver, and Blender", () => {
  const settings = normalizeHikariSettings({
    ...DEFAULT_HIKARI_SETTINGS,
    phenomenon: "optics",
    hostPreset: "custom",
    hostTransmissionColor: "#ff0000",
    absorption: 1,
  });
  const adapter = buildCloudOpticalScene(
    [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
    0.6,
    settings,
  );
  assert.deepEqual(adapter.hostAbsorptionPerShapeUnit, { r: 0.04, g: 1.04, b: 1.04 });
  assert.ok(Math.abs(adapter.scene.host.material.absorptionPerMm.r - 0.002) < 1e-12);
  assert.ok(Math.abs(adapter.scene.host.material.absorptionPerMm.g - 0.052) < 1e-12);
  assert.ok(Math.abs(adapter.scene.host.material.absorptionPerMm.b - 0.052) < 1e-12);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { growBalls } from "../../src/studies/cloud-sculpt/field.ts";
import { DEFAULT_HIKARI_SETTINGS } from "../../src/studies/cloud-sculpt/hikari.ts";
import { OpticsLayer, receiverReconstructionRadius } from "../../src/studies/cloud-sculpt/optics.ts";
import { integrateFluxRgb } from "../../src/studies/cloud-sculpt/receiverTransport.ts";
import type { ShapeSource } from "../../src/studies/cloud-sculpt/opticalScene.ts";
import {
  BACKLIGHT_STUDY_PROVENANCE,
  BACKLIGHT_STUDY_SHAPE_SOURCE,
  SHAPE_SOURCE_REFERENCE_PANELS,
  SHAPE_SOURCE_REFERENCE_SETTINGS,
  settingsForShapeSourceReferencePanel,
} from "./light-drawing/shape-source-reference.fixture.ts";

function finiteNumbers(values: Float32Array): boolean {
  for (const value of values) if (!Number.isFinite(value)) return false;
  return true;
}

function finiteRgb(value: { r: number; g: number; b: number }): boolean {
  return Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b);
}

test("ShapeSource reference fixture is frozen and replays the documented grow recipe without ids", () => {
  assert.equal(BACKLIGHT_STUDY_PROVENANCE.documentId, "hikari-blender-backlight-study");
  assert.equal(BACKLIGHT_STUDY_PROVENANCE.documentVersion, "0.29.2");
  assert.equal(BACKLIGHT_STUDY_PROVENANCE.commit, "b8f7b50");
  assert.ok(Object.isFrozen(BACKLIGHT_STUDY_SHAPE_SOURCE));
  assert.ok(Object.isFrozen(BACKLIGHT_STUDY_SHAPE_SOURCE.balls));
  assert.ok(Object.isFrozen(BACKLIGHT_STUDY_SHAPE_SOURCE.balls[0].center));
  assert.ok(Object.isFrozen(SHAPE_SOURCE_REFERENCE_SETTINGS));
  const replay = growBalls(BACKLIGHT_STUDY_PROVENANCE.recipe);
  assert.equal(replay.length, BACKLIGHT_STUDY_SHAPE_SOURCE.balls.length);
  for (let index = 0; index < replay.length; index++) {
    const actual = replay[index]; const expected = BACKLIGHT_STUDY_SHAPE_SOURCE.balls[index];
    assert.deepEqual({ x: actual.x, y: actual.y, z: actual.z, radius: actual.r }, { ...expected.center, radius: expected.radius });
  }
  assert.equal(BACKLIGHT_STUDY_SHAPE_SOURCE.smoothness, BACKLIGHT_STUDY_PROVENANCE.recipe.k);
});

test("ShapeSource CPU diagnostic validates inputs and stays a bounded non-publishing reference", () => {
  const scene = new THREE.Scene(); let causticCallbacks = 0; let pendingCallbacks = 0;
  const layer = new OpticsLayer(scene, {
    disableWebGpu: true,
    onCausticField: () => { causticCallbacks++; },
    onTransportPending: () => { pendingCallbacks++; },
  });
  const settings = settingsForShapeSourceReferencePanel(SHAPE_SOURCE_REFERENCE_PANELS[0]);
  const beforeShape = JSON.stringify(BACKLIGHT_STUDY_SHAPE_SOURCE);
  const beforeSettings = JSON.stringify(settings);
  const beforeSceneChildren = scene.children.length;
  const beforeGroupChildren = layer.group.children.length;
  const beforeSignature = (layer as unknown as { signature: string }).signature;

  assert.throws(() => layer.runCpuShapeSourceReferenceCase(BACKLIGHT_STUDY_SHAPE_SOURCE, settings, { sampleCount: 255 }), /256 through 65536/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase(BACKLIGHT_STUDY_SHAPE_SOURCE, settings, { sampleCount: 65537 }), /256 through 65536/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase(BACKLIGHT_STUDY_SHAPE_SOURCE, settings, { sampleCount: 256.5 }), /integer/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase({ ...BACKLIGHT_STUDY_SHAPE_SOURCE, kind: "not-a-shape" } as unknown as ShapeSource, settings, { sampleCount: 256 }), /balls-smooth-union/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase({ ...BACKLIGHT_STUDY_SHAPE_SOURCE, balls: [] }, settings, { sampleCount: 256 }), /at least one ball/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase({ ...BACKLIGHT_STUDY_SHAPE_SOURCE, smoothness: -1 }, settings, { sampleCount: 256 }), /smoothness/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase({ ...BACKLIGHT_STUDY_SHAPE_SOURCE, smoothness: Number.NaN }, settings, { sampleCount: 256 }), /smoothness/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase({ ...BACKLIGHT_STUDY_SHAPE_SOURCE, balls: [{ center: { x: 0, y: 0, z: 0 }, radius: 0 }] }, settings, { sampleCount: 256 }), /positive radii/);
  assert.throws(() => layer.runCpuShapeSourceReferenceCase({ ...BACKLIGHT_STUDY_SHAPE_SOURCE, balls: [{ center: { x: Number.NaN, y: 0, z: 0 }, radius: 1 }] }, settings, { sampleCount: 256 }), /finite centers/);

  const first = layer.runCpuShapeSourceReferenceCase(BACKLIGHT_STUDY_SHAPE_SOURCE, settings, { sampleCount: 256 });
  const second = layer.runCpuShapeSourceReferenceCase(BACKLIGHT_STUDY_SHAPE_SOURCE, settings, { sampleCount: 256 });
  assert.equal(first.sampleCount, 256);
  assert.equal(second.sampleCount, 256);
  assert.deepEqual(integrateFluxRgb(first.field), integrateFluxRgb(second.field));
  assert.equal(causticCallbacks, 0);
  assert.equal(pendingCallbacks, 0);
  assert.equal(scene.children.length, beforeSceneChildren);
  assert.equal(layer.group.children.length, beforeGroupChildren);
  assert.equal((layer as unknown as { signature: string }).signature, beforeSignature);
  assert.equal(JSON.stringify(BACKLIGHT_STUDY_SHAPE_SOURCE), beforeShape);
  assert.equal(JSON.stringify(settings), beforeSettings);
});

test("fixed ShapeSource panels keep the production receiver frame and finite deposited-ledger result", () => {
  assert.deepEqual(SHAPE_SOURCE_REFERENCE_PANELS.map((panel) => panel.sunSize), [0.53, 5, 20]);
  assert.ok(SHAPE_SOURCE_REFERENCE_PANELS.every((panel) => panel.sampleCount === 16384));
  assert.equal(SHAPE_SOURCE_REFERENCE_SETTINGS.phenomenon, "optics");
  assert.equal(SHAPE_SOURCE_REFERENCE_SETTINGS.daylightMode, "manual");
  assert.equal(SHAPE_SOURCE_REFERENCE_SETTINGS.lightAngle, -24);
  assert.equal(SHAPE_SOURCE_REFERENCE_SETTINGS.lightWidth, 1);
  assert.equal(SHAPE_SOURCE_REFERENCE_SETTINGS.inclusionEnabled, false);
  assert.notEqual(SHAPE_SOURCE_REFERENCE_SETTINGS.opticalSeed, DEFAULT_HIKARI_SETTINGS.opticalSeed);
  assert.equal(receiverReconstructionRadius(16384), 3);

  const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
  const result = layer.runCpuShapeSourceReferenceCase(
    BACKLIGHT_STUDY_SHAPE_SOURCE,
    settingsForShapeSourceReferencePanel(SHAPE_SOURCE_REFERENCE_PANELS[0]),
    { sampleCount: 16384 },
  );
  assert.equal(result.sampleCount, 16384);
  assert.equal(result.field.width, 512);
  assert.equal(result.field.height, 512);
  assert.equal(result.field.minU, -16);
  assert.equal(result.field.minV, -16);
  assert.equal(result.field.sizeU, 32);
  assert.equal(result.field.sizeV, 32);
  assert.ok(finiteNumbers(result.field.depositedFluxRgb));
  assert.ok(finiteNumbers(result.field.geometricCoverage));
  assert.ok(finiteNumbers(result.field.lossFluxRgb));
  const deposited = integrateFluxRgb(result.field);
  assert.ok(deposited.r > 0 && deposited.g > 0 && deposited.b > 0);
  assert.ok(result.field.diagnostics.inDomainDepositCount > 0);
  assert.ok(finiteRgb(result.field.diagnostics.energyLedger.residualRgb));
  assert.ok(Number.isFinite(result.field.diagnostics.energyLedger.relativeResidual));
});

test("ShapeSource reference harness copy keeps this checkpoint bounded and truthful", () => {
  const html = readFileSync(new URL("./light-drawing/shape-source-reference-harness.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("./light-drawing/shape-source-reference-harness.ts", import.meta.url), "utf8");
  for (const required of [
    "Actual Hikari CPU ShapeSource receiver behavior",
    "comparison checkpoint only; not analytic/product pixel parity.",
    "not OPT-LD-2/LD3 GO or acceptance; not WebGPU/Blender/physical validation.",
    "16,384-sample diagnostic override, not SAFE-mode performance.",
    "Absence of obvious softening is valid.",
    "[-16,16]² domain",
  ]) assert.ok(html.includes(required), `missing static copy: ${required}`);
  assert.match(source, /new OpticsLayer\(new THREE\.Scene\(\), \{ disableWebGpu: true \}\)/);
  assert.match(source, /depositedFluxRgb\[source\] \/ field\.texelArea/);
  assert.match(source, /const COMMON_EXPOSURE = 32/);
  assert.doesNotMatch(html + source, /17×17|effective area|monotonic|pass\/fail|promotion|WebGPU\s*compute/i);
});

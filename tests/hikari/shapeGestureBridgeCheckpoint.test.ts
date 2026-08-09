import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { fieldSdf } from "../../src/studies/cloud-sculpt/field.ts";
import { OpticsLayer } from "../../src/studies/cloud-sculpt/optics.ts";
import { BACKLIGHT_STUDY_SHAPE_SOURCE, SHAPE_SOURCE_REFERENCE_SETTINGS } from "./light-drawing/shape-source-reference.fixture.ts";
import {
  SHAPE_GESTURE_BRIDGE_CASES,
  SHAPE_GESTURE_BRIDGE_SAMPLE_COUNT,
  SHAPE_GESTURE_BRIDGE_SUN_SIZE,
  SHAPE_GESTURE_ROOT_BISECTION_STEPS,
  SHAPE_GESTURE_ROOT_SCAN_INTERVALS,
  shapeForGestureBridge,
} from "./light-drawing/shape-gesture-bridge.fixture.ts";
import { gestureBridgeSettings, runShapeGestureBridgeCase } from "./light-drawing/shape-gesture-bridge.ts";

function finite(values: Float32Array): boolean { for (const value of values) if (!Number.isFinite(value)) return false; return true; }
function fluxHash(values: Float32Array): string { return createHash("sha256").update(values).digest("hex"); }
function baseSdf(x: number, y: number, z: number): number {
  return fieldSdf(BACKLIGHT_STUDY_SHAPE_SOURCE.balls.map((ball, id) => ({ id, x: ball.center.x, y: ball.center.y, z: ball.center.z, r: ball.radius })), BACKLIGHT_STUDY_SHAPE_SOURCE.smoothness, x, y, z);
}

test("gesture bridge preserves the frozen OFF identity and deterministically appends one connected five-ball form", () => {
  const frozenJson = JSON.stringify(BACKLIGHT_STUDY_SHAPE_SOURCE);
  assert.equal(shapeForGestureBridge("OFF"), BACKLIGHT_STUDY_SHAPE_SOURCE);
  assert.deepEqual(shapeForGestureBridge("OFF"), BACKLIGHT_STUDY_SHAPE_SOURCE);
  assert.throws(() => shapeForGestureBridge(Number.NaN), /finite normalized/);
  assert.throws(() => shapeForGestureBridge(-1.01), /finite normalized/);
  assert.throws(() => shapeForGestureBridge(1.01), /finite normalized/);
  assert.equal(SHAPE_GESTURE_ROOT_SCAN_INTERVALS, 256);
  assert.equal(SHAPE_GESTURE_ROOT_BISECTION_STEPS, 64);
  const left = shapeForGestureBridge(-1); const center = shapeForGestureBridge(0); const right = shapeForGestureBridge(1);
  assert.deepEqual(center, shapeForGestureBridge(0));
  assert.equal(JSON.stringify(BACKLIGHT_STUDY_SHAPE_SOURCE), frozenJson);
  assert.equal(center.baseBallIndex, 5, "largest radius; lowest index wins ties");
  for (const bridge of [left, center, right]) {
    assert.ok(Object.isFrozen(bridge.shape) && Object.isFrozen(bridge.shape.balls) && Object.isFrozen(bridge.appendedCenters));
    assert.equal(bridge.shape.balls.length, BACKLIGHT_STUDY_SHAPE_SOURCE.balls.length + 5);
    assert.deepEqual(bridge.shape.balls.slice(0, BACKLIGHT_STUDY_SHAPE_SOURCE.balls.length), BACKLIGHT_STUDY_SHAPE_SOURCE.balls);
    assert.equal(bridge.shape.smoothness, BACKLIGHT_STUDY_SHAPE_SOURCE.smoothness);
    assert.ok(Number.isFinite(bridge.rootBracket.low) && Number.isFinite(bridge.rootBracket.high));
    assert.ok(Math.abs(baseSdf(bridge.anchor.x, bridge.anchor.y, bridge.anchor.z)) < 1e-10);
    assert.equal(bridge.rho, .2 * bridge.radius);
    assert.ok(Math.abs(Math.abs(bridge.appendedCenters[0].z - bridge.appendedCenters[1].z) - .18 * bridge.radius) < 1e-15);
    for (let i = 1; i < bridge.appendedCenters.length; i++) {
      const a = bridge.appendedCenters[i - 1]; const b = bridge.appendedCenters[i];
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - .18 * bridge.radius) < 1e-15);
      assert.ok(.18 * bridge.radius < 2 * bridge.rho);
    }
    const central = bridge.appendedCenters[2];
    assert.ok(Math.abs((central.y + bridge.rho) - (bridge.anchor.y + .75 * bridge.rho)) < 1e-12);
    assert.ok(baseSdf(central.x, central.y, central.z) < 0, "central append remains connected to the base field");
  }
  assert.equal(center.anchor.x - left.anchor.x, .25 * center.radius);
  assert.equal(right.anchor.x - center.anchor.x, .25 * center.radius);
  assert.equal(left.anchor.z, center.anchor.z); assert.equal(center.anchor.z, right.anchor.z);
});

test("all frozen gesture cases run through the actual CPU ShapeSource seam without publishing", () => {
  const scene = new THREE.Scene(); let callbacks = 0;
  const layer = new OpticsLayer(scene, { disableWebGpu: true, onCausticField: () => { callbacks++; }, onTransportPending: () => { callbacks++; } });
  const beforeScene = scene.children.length; const beforeGroup = layer.group.children.length; const beforeSignature = (layer as unknown as { signature: string }).signature;
  const settingsBefore = JSON.stringify(SHAPE_SOURCE_REFERENCE_SETTINGS);
  const commonSettings = gestureBridgeSettings();
  assert.deepEqual(commonSettings, { ...SHAPE_SOURCE_REFERENCE_SETTINGS, sunSize: SHAPE_GESTURE_BRIDGE_SUN_SIZE });
  assert.equal(commonSettings.sunSize, SHAPE_GESTURE_BRIDGE_SUN_SIZE);
  assert.equal(commonSettings.opticalSampleCount, SHAPE_GESTURE_BRIDGE_SAMPLE_COUNT);
  const replay: string[] = [];
  let offFluxHash = "";
  for (const item of SHAPE_GESTURE_BRIDGE_CASES) {
    const result = runShapeGestureBridgeCase(layer, item.gesture === null ? "OFF" : item.gesture);
    const hash = fluxHash(result.field.depositedFluxRgb);
    replay.push(JSON.stringify({ summary: result.summary, hash }));
    if (item.id === "OFF") offFluxHash = hash;
    else assert.notEqual(hash, offFluxHash, `${item.id} receiver deposit must differ from OFF`);
    assert.equal(result.sampleCount, SHAPE_GESTURE_BRIDGE_SAMPLE_COUNT);
    assert.equal(result.field.width, 512); assert.equal(result.field.height, 512);
    assert.equal(result.field.minU, -16); assert.equal(result.field.minV, -16);
    assert.equal(result.field.sizeU, 32); assert.equal(result.field.sizeV, 32);
    assert.ok(finite(result.field.depositedFluxRgb)); assert.ok(finite(result.field.geometricCoverage));
    assert.ok(Number.isFinite(result.summary.relativeClosureResidual));
    assert.ok(result.summary.inDomainDepositCount >= 0);
    assert.ok(result.summary.integratedDepositedRgb.r >= 0 && result.summary.integratedDepositedRgb.g >= 0 && result.summary.integratedDepositedRgb.b >= 0);
  }
  const repeat = runShapeGestureBridgeCase(layer, "OFF");
  assert.equal(JSON.stringify({ summary: repeat.summary, hash: fluxHash(repeat.field.depositedFluxRgb) }), replay[0]);
  assert.equal(callbacks, 0); assert.equal(scene.children.length, beforeScene); assert.equal(layer.group.children.length, beforeGroup);
  assert.equal((layer as unknown as { signature: string }).signature, beforeSignature);
  assert.equal(JSON.stringify(SHAPE_SOURCE_REFERENCE_SETTINGS), settingsBefore);
});

test("gesture bridge harness copy stays a static bounded candidate", () => {
  const html = readFileSync(new URL("./light-drawing/shape-gesture-bridge-harness.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("./light-drawing/shape-gesture-bridge-harness.ts", import.meta.url), "utf8");
  for (const required of [
    "four frozen states", "Actual Hikari CPU ShapeSource geometry", "harness-only bridge candidate", "Not continuous motion / LD3", "Not persisted/shared renderer/WebGPU/Blender/physical", "Not OPT-LD-1/2/3 GO or acceptance", "No adaptive exposure/geometry tuning", "absence of a line is valid evidence", "Cyan = positive added light; orange = negative removed light", "explanatory projection of constituent balls", "not the actual smooth-union body renderer", "Canvases render once; no receiver-field arrays are retained", "No slider, retrace, retry",
  ]) assert.ok(html.includes(required), `missing static copy: ${required}`);
  assert.ok(html.includes("selector highlights one already-rendered frozen card"));
  assert.doesNotMatch(html, /selector swaps already-computed pixels and body state/i);
  assert.match(source, /new OpticsLayer\(new THREE\.Scene\(\), \{ disableWebGpu: true \}\)/);
  assert.match(source, /const COMMON_EXPOSURE = 32/); assert.match(source, /const FIXED_SIGNED_DIFFERENCE_SCALE = 1 \/ COMMON_EXPOSURE/);
  assert.doesNotMatch(html, /<input[^>]+type=["']range/i);
  assert.equal((source.match(/runShapeGestureBridgeCase\(layer,/g) ?? []).length, 1, "one actual seam invocation site");
  assert.doesNotMatch(source, /\bCachedCase\b|readonly\s+(?:pixels|irradiance|field|depositedFluxRgb)\b|(?:fieldCache|receiverFieldCache)/i);
});

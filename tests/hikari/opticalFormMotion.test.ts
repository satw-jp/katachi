import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_OPTICAL_FORM_MOTION,
  mapOpticalFormMotion,
  normalizeOpticalFormMotion,
  opticalTrailLifecycle,
} from "../../src/studies/cloud-sculpt/formObservation/opticalMotion.ts";

test("FORM motion settings are finite and bounded", () => {
  assert.deepEqual(normalizeOpticalFormMotion({}), DEFAULT_OPTICAL_FORM_MOTION);
  assert.deepEqual(normalizeOpticalFormMotion({
    mode: "pulse",
    trailLength: 99,
    speed: -4,
    pointMotion: Number.NaN,
    opticalMapping: 8,
  }), {
    mode: "pulse",
    trailLength: 1.8,
    speed: 0.1,
    pointMotion: 0,
    opticalMapping: 8,
    trailDensity: 1,
  });
  assert.equal(normalizeOpticalFormMotion({ mode: "orbit" }).mode, "orbit");
  assert.equal(normalizeOpticalFormMotion({ mode: "flowTrails" }).mode, "flowTrails");
  assert.deepEqual(normalizeOpticalFormMotion({
    trailLength: 99,
    speed: 99,
    pointMotion: 99,
    opticalMapping: 99,
  }), {
    mode: "stream",
    trailLength: 1.8,
    speed: 20,
    pointMotion: 0.8,
    opticalMapping: 20,
    trailDensity: 1,
  });
  assert.equal(normalizeOpticalFormMotion({ trailDensity: 99 }).trailDensity, 4);
});

test("soft curves detach, travel outward, and fade before their deterministic restart", () => {
  const attached = opticalTrailLifecycle(0, 1, 1, 0.3);
  const detached = opticalTrailLifecycle(0, 5, 1, 0.3);
  const dying = opticalTrailLifecycle(0, 7, 1, 1.1);
  assert.ok(detached.detachment > attached.detachment);
  assert.ok(detached.opacity > 0);
  assert.ok(dying.detachment > detached.detachment);
  assert.ok(dying.opacity < detached.opacity);
  assert.deepEqual(
    opticalTrailLifecycle(0.2, 3, 2, 0.6),
    opticalTrailLifecycle(0.2, 3, 2, 0.6),
  );
});

test("caustics and redistribution lengthen and accelerate the same shape signal", () => {
  const quiet = mapOpticalFormMotion({
    shapeReach: 0.7,
    redistribution: 0,
    caustic: 0,
    shadow: 0,
  }, DEFAULT_OPTICAL_FORM_MOTION);
  const concentrated = mapOpticalFormMotion({
    shapeReach: 0.7,
    redistribution: 0.8,
    caustic: 1,
    shadow: 0,
  }, DEFAULT_OPTICAL_FORM_MOTION);
  assert.ok(concentrated.trailLength > quiet.trailLength * 5);
  assert.ok(concentrated.speed > quiet.speed);
  assert.ok(concentrated.pointMotion > quiet.pointMotion);
  assert.ok(quiet.pointMotion >= DEFAULT_OPTICAL_FORM_MOTION.pointMotion * 0.5);
  assert.ok(concentrated.brightness > quiet.brightness);
});

test("shadow damps motion without inventing a new direction", () => {
  const lit = mapOpticalFormMotion({
    shapeReach: 0.5,
    redistribution: 0.7,
    caustic: 0.4,
    shadow: 0,
  }, DEFAULT_OPTICAL_FORM_MOTION);
  const shadowed = mapOpticalFormMotion({
    shapeReach: 0.5,
    redistribution: 0.7,
    caustic: 0.4,
    shadow: 1,
  }, DEFAULT_OPTICAL_FORM_MOTION);
  assert.ok(shadowed.speed < lit.speed);
  assert.ok(shadowed.brightness < lit.brightness);
  assert.equal(shadowed.trailLength, lit.trailLength);
});

test("query UI exposes four grounded motion variants and five bounded author controls", () => {
  const controller = readFileSync(
    new URL("../../src/studies/cloud-sculpt/opticalImprintController.ts", import.meta.url),
    "utf8",
  );
  assert.match(controller, /\["stream", "流走 STREAM"\]/);
  assert.match(controller, /\["pulse", "伸縮 PULSE"\]/);
  assert.match(controller, /\["orbit", "包絡 ORBIT（3D）"\]/);
  assert.match(controller, /\["flowTrails", "FLOW TRAILS（原型）"\]/);
  assert.match(controller, /const motionControls = \[trailLength, motionSpeed, pointMotion, opticalMapping, trailDensity\]/);
  assert.match(controller, /軌跡密度/);
  assert.match(controller, /renderer\.setOpticalFormMotion\(/);
  assert.match(controller, /FORMの背景を黒にする/);
  const renderer = readFileSync(
    new URL("../../src/studies/cloud-sculpt/renderer.ts", import.meta.url),
    "utf8",
  );
  assert.match(renderer, /vec2 rootDirection = normalize\(originNdc/);
  assert.match(renderer, /gl_PointSize = mix\(1\.4, 10\.5/);
  assert.match(renderer, /vec3 rainbow = opticalRainbow/);
  assert.match(renderer, /if \(uMotionMode == 2\)/);
  assert.match(renderer, /vec3 tangent3 = normalize\(cross\(vec3\(0\.0, 1\.0, 0\.0\), radial3\)/);
  assert.match(renderer, /position \+ orbitCurve \+ orbitEscape/);
  assert.match(renderer, /flowPhase = aPhase \+ uTime \* localSpeed - trail \* 0\.65/);
  assert.match(renderer, /flowPhase \* 6\.2831853/);
  assert.match(renderer, /flowPhase \* 4\.7/);
  assert.match(renderer, /this\.opticalFormMotion\.mode === "flowTrails"/);
  assert.match(renderer, /Current screen-radial STREAM\/PULSE remains available unchanged/);
});

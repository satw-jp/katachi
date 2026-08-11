import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveOpticalImprint,
  evaluateOpticalDissolveKeep,
  isOpticalImprintQueryEnabled,
  normalizeOpticalDissolveSettings,
  opticalImprintViewRelation,
  OPTICAL_DISSOLVE_PRESETS,
} from "../../src/studies/cloud-sculpt/opticalImprint.ts";
import type { ReceiverTransportField } from "../../src/studies/cloud-sculpt/receiverTransport.ts";

function fixture(): ReceiverTransportField {
  return {
    receiverId: "imprint-test",
    sceneRevision: "shape-a",
    lightRevision: "light-a",
    width: 3,
    height: 2,
    minU: -1,
    minV: -1,
    sizeU: 2,
    sizeV: 2,
    texelArea: 0.25,
    geometricCoverage: new Float32Array([0, 0.1, 0.2, 0.05, 0.12, 0]),
    straightThroughputRgb: new Float32Array([
      0, 0, 0,
      0.02, 0.02, 0.02,
      0.08, 0.07, 0.06,
      0.01, 0.01, 0.01,
      0.04, 0.04, 0.04,
      0, 0, 0,
    ]),
    depositedFluxRgb: new Float32Array([
      0, 0, 0,
      0.04, 0.03, 0.02,
      0.18, 0.12, 0.05,
      0.015, 0.02, 0.03,
      0.02, 0.08, 0.14,
      0, 0, 0,
    ]),
    lossFluxRgb: new Float32Array(18),
  };
}

test("Optical Imprint derives deterministic four-layer display data without mutating transport", () => {
  const field = fixture();
  const coverageBefore = field.geometricCoverage.slice();
  const straightBefore = field.straightThroughputRgb.slice();
  const depositedBefore = field.depositedFluxRgb.slice();
  const first = deriveOpticalImprint(field);
  const second = deriveOpticalImprint(field);

  assert.deepEqual(first.structure, second.structure);
  assert.deepEqual(first.light, second.light);
  assert.equal(first.structure.length, field.width * field.height * 4);
  assert.equal(first.light.length, field.width * field.height * 4);
  assert.ok(first.diagnostics.coveredTexels > 0);
  assert.ok(first.diagnostics.litTexels > 0);
  assert.ok(first.diagnostics.causticTexels > 0);
  assert.ok(first.diagnostics.causticDisplayScale > 0);
  assert.ok(first.supportUv[0] >= 0 && first.supportUv[2] <= 1);
  assert.ok(first.supportUv[1] >= 0 && first.supportUv[3] <= 1);
  assert.ok(first.supportUv[0] < first.supportUv[2]);
  assert.ok(first.supportUv[1] < first.supportUv[3]);
  assert.ok(first.structure.some((value, index) => index % 4 === 2 && value > 0));
  assert.ok(first.structure.some((value, index) => index % 4 === 3 && value > 0));
  assert.ok(first.light.some((value, index) => index % 4 < 3 && value > 0));
  assert.deepEqual(field.geometricCoverage, coverageBefore);
  assert.deepEqual(field.straightThroughputRgb, straightBefore);
  assert.deepEqual(field.depositedFluxRgb, depositedBefore);
});

test("Optical Imprint responds to a changed receiver pattern", () => {
  const original = deriveOpticalImprint(fixture());
  const changedField = fixture();
  changedField.depositedFluxRgb[3] = 0.4;
  changedField.depositedFluxRgb[4] = 0.22;
  const changed = deriveOpticalImprint(changedField);
  assert.notDeepEqual(changed.light, original.light);
  assert.notDeepEqual(changed.structure, original.structure);
  assert.ok(changed.diagnostics.integratedDeliveredFlux > original.diagnostics.integratedDeliveredFlux);
});

test("captured direction is exact and off-axis direction separates and fades", () => {
  const anchor = {
    forward: [0, 0, -1] as const,
    right: [1, 0, 0] as const,
    up: [0, 1, 0] as const,
  };
  assert.deepEqual(opticalImprintViewRelation(anchor, [0, 0, -1]), {
    offset: [0, 0],
    alignment: 1,
  });
  const offAxis = opticalImprintViewRelation(anchor, [0.5, 0.25, -0.75]);
  assert.ok(offAxis.offset[0] > 0);
  assert.ok(offAxis.offset[1] > 0);
  assert.ok(offAxis.alignment > 0 && offAxis.alignment < 1);
  const reverse = opticalImprintViewRelation(anchor, [0, 0, 1]);
  assert.equal(reverse.alignment, 0);
});

test("Optical Imprint stays behind an explicit query and reuses the receiver callback", () => {
  assert.equal(isOpticalImprintQueryEnabled(""), false);
  assert.equal(isOpticalImprintQueryEnabled("?opticalImprint=0"), false);
  assert.equal(isOpticalImprintQueryEnabled("?opticalImprint=1"), true);

  const main = readFileSync(
    new URL("../../src/studies/cloud-sculpt/main.ts", import.meta.url),
    "utf8",
  );
  const controller = readFileSync(
    new URL("../../src/studies/cloud-sculpt/opticalImprintController.ts", import.meta.url),
    "utf8",
  );
  const renderer = readFileSync(
    new URL("../../src/studies/cloud-sculpt/renderer.ts", import.meta.url),
    "utf8",
  );
  assert.match(main, /if \(opticalImprintEnabled\)/);
  assert.match(main, /opticalImprint\?\.updateField\(field\)/);
  assert.match(controller, /SOLID/);
  assert.match(controller, /HALF \(default\)/);
  assert.match(controller, /DRAWING/);
  assert.match(controller, /deterministic display mask; changes neither shape\/material nor transport; caustics do not physically erode the body/i);
  assert.match(controller, /retention/);
  assert.match(controller, /stroke half-width \(receiver texels\)/);
  assert.match(controller, /caustic erosion/);
  assert.match(controller, /optical trail reach \(receiver texels\)/);
  assert.match(controller, /背景・投影/);
  assert.match(controller, /makeRange\("コースティクス誇張", 0, 8, 0\.1, 3\.2\)/);
  assert.match(controller, /makeRange\("投影の大きさ", 0\.5, 2\.5, 0\.05, 1\.15\)/);
  assert.match(controller, /makeRange\("左右の位置", -0\.5, 0\.5, 0\.01, 0\)/);
  assert.match(controller, /makeRange\("上下の位置", -0\.5, 0\.5, 0\.01, 0\)/);
  assert.match(controller, /makeRange\("層のずれ", 0, 2, 0\.05, 1\)/);
  assert.match(controller, /makeRange\("濃さ", 0, 1, 0\.05, 0\.82\)/);
  assert.match(controller, /separation: Number\(separation\.input\.value\)/);
  assert.match(controller, /opacity: Number\(opacity\.input\.value\)/);
  assert.match(controller, /causticBoost: Number\(causticBoost\.input\.value\)/);
  assert.match(controller, /scale: Number\(scale\.input\.value\)/);
  assert.match(controller, /offsetX: Number\(offsetX\.input\.value\)/);
  assert.match(controller, /offsetY: Number\(offsetY\.input\.value\)/);
  assert.match(
    renderer,
    /uOpticalImprintCausticBoost\.value = THREE\.MathUtils\.clamp\(\s*options\.causticBoost,\s*0,\s*8,\s*\)/,
  );
  const dissolveSection = controller.slice(
    controller.indexOf("// These are the only authorable Optical Dissolve Drawing controls."),
    controller.indexOf("const dissolveControls"),
  );
  assert.equal((dissolveSection.match(/makeRange\(/g) ?? []).length, 4);
  assert.match(controller, /const dissolveControls = \[retention, strokeHalfWidth, causticErosion, trailReach\]/);
  assert.match(controller, /形と背景を一体化/);
  assert.match(controller, /前景として重ねる/);
  assert.doesNotMatch(controller, /traceStraightRay|rebuildCpu|runReceiverParityCase/);
});

test("Optical Dissolve presets are frozen, clamped, and SOLID is an exact scalar bypass", () => {
  assert.ok(Object.isFrozen(OPTICAL_DISSOLVE_PRESETS));
  assert.ok(Object.isFrozen(OPTICAL_DISSOLVE_PRESETS.half));
  assert.deepEqual(OPTICAL_DISSOLVE_PRESETS.solid, {
    retention: 1,
    strokeHalfWidth: 0,
    causticErosion: 0,
    trailReach: 0,
  });
  assert.deepEqual(OPTICAL_DISSOLVE_PRESETS.half, {
    retention: 0.52,
    strokeHalfWidth: 1.6,
    causticErosion: 0.45,
    trailReach: 5,
  });
  assert.deepEqual(OPTICAL_DISSOLVE_PRESETS.drawing, {
    retention: 0.18,
    strokeHalfWidth: 1.05,
    causticErosion: 0.8,
    trailReach: 9,
  });
  assert.deepEqual(normalizeOpticalDissolveSettings({
    retention: -1,
    strokeHalfWidth: 8,
    causticErosion: -2,
    trailReach: 99,
  }), {
    retention: 0.15,
    strokeHalfWidth: 2.5,
    causticErosion: 0,
    trailReach: 12,
  });
  const common = {
    settings: OPTICAL_DISSOLVE_PRESETS.drawing,
    travelled: 1.4,
    facing: 0.35,
    junction: 0.5,
    caustic: 0.7,
    stroke: 0.8,
    angleVisibility: 1,
    projectionMask: 1,
  };
  assert.equal(evaluateOpticalDissolveKeep({ ...common, preset: "solid" }), 1);
  const first = evaluateOpticalDissolveKeep({ ...common, preset: "half" });
  const second = evaluateOpticalDissolveKeep({ ...common, preset: "half" });
  assert.equal(first, second);
  assert.ok(first > 0 && first <= 1);
  assert.equal(evaluateOpticalDissolveKeep({ ...common, preset: "half", angleVisibility: 0 }), 1);
  assert.equal(evaluateOpticalDissolveKeep({ ...common, preset: "half", projectionMask: 0 }), 1);
});

test("Optical Dissolve remains a no-retrace display composite with an exact SOLID source bypass", () => {
  const shader = readFileSync(
    new URL("../../src/studies/cloud-sculpt/shaders.ts", import.meta.url),
    "utf8",
  );
  const dissolve = shader.slice(
    shader.indexOf("float opticalImprintDissolveKeep("),
    shader.indexOf("vec3 rotateEnvironment", shader.indexOf("float opticalImprintDissolveKeep(")),
  );
  assert.match(shader, /if \(uOpticalDissolveMode == 0\) \{\s*color = opticalImprintComposite\(color, vUv, true\);/);
  assert.match(shader, /!hasTransmittedExit \|\| uOpticalImprintEnabled == 0 \|\| uOpticalImprintPlacement == 0/);
  assert.match(shader, /vec3 solidBody = opticalImprintComposite\(color, vUv, true\);/);
  assert.match(shader, /vec3 underBody = opticalImprintComposite\(screenEnvironment\(ro, rd\), vUv, false\);/);
  assert.match(shader, /color = mix\(underBody, solidBody, keep\);/);
  assert.match(dissolve, /\/ 12\.0/);
  assert.match(dissolve, /trailStep \* 0\.5/);
  assert.doesNotMatch(dissolve, /uTime|uProgressiveSampleIndex|random|noise|discard|marchInside/);
});

test("invalid receiver dimensions fail before allocating display arrays", () => {
  const field = fixture();
  field.width = 4;
  assert.throws(() => deriveOpticalImprint(field), /do not match/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { presentFragmentShader } from "../../src/studies/cloud-sculpt/renderer.ts";
import { fragmentShader } from "../../src/studies/cloud-sculpt/shaders.ts";

test("view transport uses geometric rather than cosmetic surface normals", () => {
  assert.match(fragmentShader, /refract\(rd, geometricNormal, eta\)/);
  assert.match(fragmentShader, /refract\(finalHostDirection, -exitGeometricNormal, uIor\)/);
  assert.doesNotMatch(fragmentShader, /refract\(rd, n, eta\)/);
  assert.doesNotMatch(fragmentShader, /refract\(finalHostDirection, -exitNormal, uIor\)/);
  assert.match(fragmentShader, /vec3 cosmeticOutgoing = refract\(\s*exitIncidentDirection,\s*-exitNormal,\s*uIor/);
  assert.match(fragmentShader, /roughOpticalEnvironment\(\s*hasExit \? exitPoint : p,\s*displayOutgoing/);
});

test("unresolved nested view paths keep continuous host-only appearance", () => {
  assert.match(fragmentShader, /Keep the already solved outer-host path/);
  assert.match(fragmentShader, /bool hasTransmittedExit = false/);
  assert.match(fragmentShader, /vec3 color = mix\(refractedColor \* transmission, reflectedColor, fresnel\)/);
  assert.doesNotMatch(fragmentShader, /unresolvedAmbient/);
});

test("outer TIR attempts a bounded internal bounce before the view fallback", () => {
  assert.match(fragmentShader, /vec3 tirDirection = reflect\(finalHostDirection, -exitGeometricNormal\)/);
  assert.match(fragmentShader, /bool hasTirExit = marchInside/);
  assert.match(fragmentShader, /outgoing = tirDirection/);
  assert.match(fragmentShader, /if \(length\(tirRefractedOut\) >= 0\.01\)/);
  assert.match(fragmentShader, /Never sample the outside environment using the/);
  assert.doesNotMatch(fragmentShader, /Progressive Render will replace this approximation/);
});

test("progressive body samples vary rough transmission without changing realtime compatibility", () => {
  assert.match(fragmentShader, /if \(uProgressiveLinearOutput == 1\) \{/);
  assert.match(fragmentShader, /float index = float\(uProgressiveSampleIndex \+ 1\)/);
  assert.match(fragmentShader, /return mix\(center, roughSample, roughMix\)/);
  assert.match(fragmentShader, /if \(uCompatibilityMode == 1\) return center/);
});

test("visible sun and finite lighting share the authored angular diameter", () => {
  assert.match(fragmentShader, /float visibleSunDisc\(vec3 direction\)/);
  assert.match(fragmentShader, /float diameterDeg = clamp\(uSunSize, 0\.1, 30\.0\)/);
  assert.match(fragmentShader, /float radius = radians\(diameterDeg \* 0\.5\)/);
  assert.match(fragmentShader, /float sunDisc = visibleSunDisc\(direction\)/);
  assert.match(fragmentShader, /float diskRadius = tan\(radians\(max\(0\.1, uSunSize\) \* 0\.5\)\)/);
  assert.doesNotMatch(fragmentShader, /pow\(max\(dot\(direction, normalize\(uLightDir\)\), 0\.0\), 420\.0\)/);
});

test("optional background media preserves screen composition and can enter body optics", () => {
  assert.match(fragmentShader, /uniform sampler2D uBackgroundMedia/);
  assert.match(fragmentShader, /uniform int uBackgroundMediaEnabled/);
  assert.match(fragmentShader, /vec2 backgroundMediaCoverUv\(vec2 uv\)/);
  assert.match(fragmentShader, /vec3 backgroundMediaDirectional\(vec3 direction\)/);
  assert.match(fragmentShader, /naturalEnvironment\(origin, direction, true, false\)/);
  assert.match(fragmentShader, /naturalEnvironment\(origin, direction, true, uBackgroundMediaEnvironment == 1\)/);
  assert.match(fragmentShader, /backgroundMediaScene\(direction, directionalMedia\) \* uGroundReflectance/);
  assert.match(fragmentShader, /vec3 pairedDirect = vec3\(1\.0 - removedBaseline\)\s*\+ displayAddedTransport/);
  assert.match(fragmentShader, /vec3 environment = screenEnvironment\(ro, rd\)/);
});

test("Blender comparison backlight is a finite BODY-only environment emitter", () => {
  assert.match(fragmentShader, /uniform int uBacklightEnabled/);
  assert.match(fragmentShader, /vec3 backlightEnvironment\(vec3 origin, vec3 direction, vec3 fallback\)/);
  assert.match(fragmentShader, /vec3 panelNormal = normalize\(uLightDir\)/);
  assert.match(fragmentShader, /vec3 panelCenter = uShapeCenter \+ panelNormal \* uBacklightDistance/);
  assert.match(fragmentShader, /return vec3\(1\.0, 0\.95, 0\.90\) \* uBacklightIntensity/);
  assert.match(fragmentShader, /return backlightEnvironment\(origin, direction, fallback\);/);
});

test("equal-IOR inclusion is integrated as Blender-style absorption void", () => {
  assert.match(fragmentShader, /bool inclusionIsAbsorptionVoid\(\)/);
  assert.match(fragmentShader, /abs\(uIor - uInclusionIor\) < 0\.0005/);
  assert.match(fragmentShader, /uniform vec3 uInclusionBallPos\[64\]/);
  assert.match(fragmentShader, /radius \* 0\.07855/);
  assert.match(fragmentShader, /if \(i >= uInclusionBallCount\) break/);
  assert.match(fragmentShader, /vec3 absorptionVoidOpticalDepth\(/);
  assert.match(fragmentShader, /mix\(\s*hostCoefficient,\s*uInclusionAbsorptionRgb,/);
  assert.match(fragmentShader, /&& !inclusionIsAbsorptionVoid\(\)/);
});

test("realtime and progressive presentation apply the renderer output colorspace", () => {
  const bodyTransforms = fragmentShader.match(/#include <colorspace_fragment>/g) ?? [];
  assert.ok(bodyTransforms.length >= 4);
  assert.match(presentFragmentShader, /#include <colorspace_fragment>/);
});

test("expressive receiver stroke redistributes only delivered light", () => {
  assert.match(fragmentShader, /vec3 receiverStrokeLight\(vec2 uv, float receiverCosine\)/);
  assert.match(fragmentShader, /for \(int y = 0; y < 4; y\+\+\)/);
  assert.match(fragmentShader, /for \(int x = 0; x < 4; x\+\+\)/);
  assert.match(fragmentShader, /return blockSum \* \(0\.25 \* strokeActive\)/);
  assert.match(fragmentShader, /vec3 displayAddedTransport = uReceiverDisplayMode == 1/);
  assert.match(fragmentShader, /vec3 pairedDirect = vec3\(1\.0 - removedBaseline\)\s*\+ displayAddedTransport/);
  assert.match(fragmentShader, /if \(uReceiverDisplayMode >= 2 && pairedWeight > 0\.0\)/);
  assert.doesNotMatch(fragmentShader, /receiverStrokeShadow/);
  assert.doesNotMatch(fragmentShader, /receiverStrokeBackdrop/);
});

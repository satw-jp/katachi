import assert from "node:assert/strict";
import test from "node:test";
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
  assert.match(fragmentShader, /if \(length\(tirRefractedOut\) >= 0\.01\)/);
  assert.match(fragmentShader, /Progressive Render will replace this approximation/);
});

test("progressive body samples vary rough transmission without changing realtime compatibility", () => {
  assert.match(fragmentShader, /if \(uProgressiveLinearOutput == 1\) \{/);
  assert.match(fragmentShader, /float index = float\(uProgressiveSampleIndex \+ 1\)/);
  assert.match(fragmentShader, /return mix\(center, roughSample, roughMix\)/);
  assert.match(fragmentShader, /if \(uCompatibilityMode == 1\) return center/);
});

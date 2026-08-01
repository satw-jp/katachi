import assert from "node:assert/strict";
import test from "node:test";
import { fragmentShader } from "../../src/studies/cloud-sculpt/shaders.ts";

test("view transport uses geometric rather than cosmetic surface normals", () => {
  assert.match(fragmentShader, /refract\(rd, geometricNormal, eta\)/);
  assert.match(fragmentShader, /refract\(finalHostDirection, -exitGeometricNormal, uIor\)/);
  assert.doesNotMatch(fragmentShader, /refract\(rd, n, eta\)/);
  assert.doesNotMatch(fragmentShader, /refract\(finalHostDirection, -exitNormal, uIor\)/);
});

test("unresolved nested view paths keep continuous host-only appearance", () => {
  assert.match(fragmentShader, /Keep the already solved outer-host path/);
  assert.match(fragmentShader, /bool hasTransmittedExit = false/);
  assert.match(fragmentShader, /bool viewContinuityFallback = !hasTransmittedExit/);
  assert.match(fragmentShader, /vec3 color = mix\(refractedColor \* transmission, reflectedColor, fresnel\)/);
  assert.doesNotMatch(fragmentShader, /unresolvedAmbient/);
});

test("outer TIR gets a bounded internal bounce and cannot masquerade as transmission", () => {
  assert.match(fragmentShader, /vec3 tirDirection = reflect\(finalHostDirection, -exitGeometricNormal\)/);
  assert.match(fragmentShader, /bool hasTirExit = marchInside/);
  assert.match(fragmentShader, /if \(length\(tirRefractedOut\) >= 0\.01\)/);
  assert.match(fragmentShader, /bool viewContinuityFallback = !hasTransmittedExit/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { fragmentShader } from "../../src/studies/cloud-sculpt/shaders.ts";

test("view transport uses geometric rather than cosmetic surface normals", () => {
  assert.match(fragmentShader, /refract\(rd, geometricNormal, eta\)/);
  assert.match(fragmentShader, /refract\(finalHostDirection, -exitGeometricNormal, uIor\)/);
  assert.doesNotMatch(fragmentShader, /refract\(rd, n, eta\)/);
  assert.doesNotMatch(fragmentShader, /refract\(finalHostDirection, -exitNormal, uIor\)/);
});

test("unresolved view paths retain bounded ambient instead of becoming black", () => {
  assert.match(fragmentShader, /unresolvedAmbient \* \(1\.0 - fresnel\)/);
  assert.doesNotMatch(fragmentShader, /\? reflectedColor \* fresnel\s*:/);
});

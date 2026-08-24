import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../../lib/hash.ts";
import { parseRecipe, replay } from "./history.ts";
import {
  buildPrintValidationFacts, canonicalPrintProfileJson,
  geometryFingerprintLowResolution,
  printProfileSha256,
  assertResolvedPrintPlanSupportCounts,
  resolveCliPrintPlan,
  resolveWorkerPrintPlan,
  validateSkinPrintProfile,
  type PrintRecipeBinding,
  type SkinPrintProfileV1,
} from "./printProfile.ts";

const recipeText = readFileSync(
  fileURLToPath(new URL("./presets/skin-v088-low-resolution-fixture.recipe.json", import.meta.url)),
  "utf8",
);
const profile: SkinPrintProfileV1 = validateSkinPrintProfile(JSON.parse(readFileSync(
  fileURLToPath(new URL("./presets/skin-v088-low-resolution-fixture.print-profile.json", import.meta.url)),
  "utf8",
)));
const replayedFixture = replay(parseRecipe(recipeText));
const recipeSha256 = profile.shapeRecipe.sha256;
const binding: PrintRecipeBinding = {
  recipeSha256,
  seed: replayedFixture.hostParams.seed,
  currentInternalStructure: replayedFixture.skinParams.internalStructure,
  currentDryWebNormalizedRadius: replayedFixture.skinParams.internalRadius,
  scaleMmPerUnit: profile.internalStructure.dryWebPhysicalRadiusMm / replayedFixture.skinParams.internalRadius,
};

test("low-resolution recipe and Print Profile are one exact-byte pair", async () => {
  assert.equal(await sha256Hex(recipeText), profile.shapeRecipe.sha256);
  assert.equal(replayedFixture.hostParams.seed, profile.shapeRecipe.seed);
  assert.equal(replayedFixture.skinParams.internalStructure, profile.internalStructure.method);
  assert.equal(replayedFixture.skinParams.internalRadius, profile.internalStructure.dryWebNormalizedRadius);
  assert.equal(profile.geometry.surfaceResolution, 24);
  assert.equal(profile.geometry.fusedResolution, 32);
  assert.equal(profile.geometry.targetLongestMm, 24);
  assert.equal(profile.geometry.angleThresholdDeg, 45);
  assert.equal(profile.expectedClassificationCounts?.unresolvedSupportSite, 0);
  assert.equal(profile.expectedClassificationCounts?.duplicateSupportSite, 0);
});

test("Print Profile canonicalization and SHA are key-order independent", async () => {
  const reordered = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
  const reversed = Object.fromEntries(Object.entries(reordered).reverse());
  assert.equal(canonicalPrintProfileJson(profile), canonicalPrintProfileJson(validateSkinPrintProfile(reversed)));
  assert.equal(await printProfileSha256(profile), await printProfileSha256(validateSkinPrintProfile(reversed)));
});

test("Profile validation rejects inconsistent radius and diameter", () => {
  const invalid = structuredClone(profile);
  invalid.scaffold.footDiameterMm = 2.3;
  assert.throws(() => validateSkinPrintProfile(invalid), /radius\/diameter/);
});

test("recipe SHA and Seed fail closed", async () => {
  const sha = await printProfileSha256(profile);
  assert.throws(() => resolveCliPrintPlan(profile, sha, { ...binding, seed: "wrong" }), /Seed/);
  assert.throws(() => resolveCliPrintPlan(profile, sha, { ...binding, recipeSha256: "b".repeat(64) }), /Recipe SHA/);
});

test("old v1 Profile without policy fields remains compatible", () => {
  const old = structuredClone(profile);
  old.artifactVersion = "fixture-001";
  delete old.supportPolicy;
  delete old.expectedClassificationCounts;
  assert.equal(validateSkinPrintProfile(old).supportPolicy, undefined);
});

test("new Profile classification counts are checked at runtime", async () => {
  const sha = await printProfileSha256(profile);
  const plan = resolveCliPrintPlan(profile, sha, binding);
  assert.throws(() => assertResolvedPrintPlanSupportCounts(plan, {
    total: 4, inside: 1, outside: 3, unresolved: 0, duplicate: 0, unassigned: 0, mixedFace: 1,
    insideSupportSite: 1, outsideSupportSite: 3, unresolvedSupportSite: 0, duplicateSupportSite: 0,
  }), /do not match|match/);
  assert.deepEqual(assertResolvedPrintPlanSupportCounts(plan, profile.expectedClassificationCounts!), undefined);
});

test("low-resolution CLI and Worker resolve identical print plans", async () => {
  const sha = await printProfileSha256(profile);
  assert.deepEqual(resolveCliPrintPlan(profile, sha, binding), resolveWorkerPrintPlan(profile, sha, binding));
});

test("CLI and Worker validation facts share one format", async () => {
  const sha = await printProfileSha256(profile);
  const cliPlan = resolveCliPrintPlan(profile, sha, binding);
  const workerPlan = resolveWorkerPrintPlan(profile, sha, binding);
  const fingerprint = await geometryFingerprintLowResolution(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const facts = { bboxMm: { width: 1, depth: 1, height: 0 }, faceCount: 1, vertexCount: 3, connectedComponents: 1, watertight: false, degenerateTriangleCount: 0, internalGraphNodes: 2, internalGraphEdges: 1, scaffoldPillarCount: 1, plateAnchorOk: true, plateSpreadMm: 0, fingerprint, supportPolicy: profile.supportPolicy, classificationCounts: profile.expectedClassificationCounts };
  assert.deepEqual(buildPrintValidationFacts(cliPlan, facts), buildPrintValidationFacts(workerPlan, facts));
});

test("geometry fingerprint ignores triangle and per-triangle vertex order", async () => {
  const a = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]);
  const b = new Float32Array([1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
  assert.equal((await geometryFingerprintLowResolution(a)).sha256, (await geometryFingerprintLowResolution(b)).sha256);
  assert.equal((await geometryFingerprintLowResolution(a, 1)).status, "deferred-high-resolution");
});

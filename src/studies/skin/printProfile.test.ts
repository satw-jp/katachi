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
  assertV088FinalizationReady,
  resolveCliPrintPlan,
  resolveWorkerPrintPlan,
  validateSkinPrintProfile,
  type PrintRecipeBinding,
  type SkinPrintProfileV1,
} from "./printProfile.ts";
import {
  LEGACY_OVERHANG_SUPPORT_POLICY,
  OVERHANG_SUPPORT_POLICY,
  OVERHANG_SUPPORT_RAY_METHOD,
  type OverhangSupportRayFacts,
} from "./overhangSupportPolicy.ts";
import { validateSupportPaint } from "./supportPaint.ts";

const recipeText = readFileSync(
  fileURLToPath(new URL("./presets/skin-v088-low-resolution-fixture.recipe.json", import.meta.url)),
  "utf8",
);
const legacyProfile: SkinPrintProfileV1 = validateSkinPrintProfile(JSON.parse(readFileSync(
  fileURLToPath(new URL("./presets/skin-v088-low-resolution-fixture.print-profile.json", import.meta.url)),
  "utf8",
)));
const replayedFixture = replay(parseRecipe(recipeText));
const rayFacts: OverhangSupportRayFacts = {
  method: OVERHANG_SUPPORT_RAY_METHOD,
  surfaceSource: "support-free-final-surface",
  rayDirection: "negative-z",
  meshScaleMm: 24,
  lowerIntersectionEpsilonMm: 0.001,
  gridCellSizeMm: 0.375,
  gridCellCount: 100,
  surfaceTriangleCount: 200,
  invalidSurfaceTriangleCount: 0,
};
const profile: SkinPrintProfileV1 = validateSkinPrintProfile({
  ...legacyProfile,
  supportPolicy: OVERHANG_SUPPORT_POLICY,
  supportClassification: {
    method: OVERHANG_SUPPORT_RAY_METHOD,
    surfaceSource: "support-free-final-surface",
    rayDirection: "negative-z",
    lowerIntersectionEpsilonMm: rayFacts.lowerIntersectionEpsilonMm,
  },
});
const recipeSha256 = profile.shapeRecipe.sha256;
const binding: PrintRecipeBinding = {
  recipeSha256,
  seed: replayedFixture.hostParams.seed,
  currentInternalStructure: replayedFixture.skinParams.internalStructure,
  currentDryWebNormalizedRadius: replayedFixture.skinParams.internalRadius,
  scaleMmPerUnit: profile.internalStructure.dryWebPhysicalRadiusMm / replayedFixture.skinParams.internalRadius,
  currentSupportRayEpsilonMm: rayFacts.lowerIntersectionEpsilonMm,
};

test("low-resolution recipe and legacy Print Profile remain one exact-byte compatible pair", async () => {
  assert.equal(await sha256Hex(recipeText), legacyProfile.shapeRecipe.sha256);
  assert.equal(replayedFixture.hostParams.seed, legacyProfile.shapeRecipe.seed);
  assert.equal(replayedFixture.skinParams.internalStructure, legacyProfile.internalStructure.method);
  assert.equal(replayedFixture.skinParams.internalRadius, legacyProfile.internalStructure.dryWebNormalizedRadius);
  assert.equal(legacyProfile.geometry.surfaceResolution, 24);
  assert.equal(legacyProfile.geometry.fusedResolution, 32);
  assert.equal(legacyProfile.geometry.targetLongestMm, 24);
  assert.equal(legacyProfile.geometry.angleThresholdDeg, 45);
  assert.equal(legacyProfile.supportPolicy, LEGACY_OVERHANG_SUPPORT_POLICY);
  assert.equal(legacyProfile.expectedClassificationCounts?.unresolvedSupportSite, 0);
  assert.equal(legacyProfile.expectedClassificationCounts?.duplicateSupportSite, 0);
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

test("current policy requires a millimetre ray epsilon", () => {
  const invalid = structuredClone(profile) as SkinPrintProfileV1;
  delete invalid.supportClassification;
  assert.throws(() => validateSkinPrintProfile(invalid), /millimetre epsilon/);
});

test("recipe SHA, Seed, and epsilon fail closed", async () => {
  const sha = await printProfileSha256(profile);
  assert.throws(() => resolveCliPrintPlan(profile, sha, { ...binding, seed: "wrong" }), /Seed/);
  assert.throws(() => resolveCliPrintPlan(profile, sha, { ...binding, recipeSha256: "b".repeat(64) }), /Recipe SHA/);
  assert.throws(() => resolveCliPrintPlan(profile, sha, { ...binding, currentSupportRayEpsilonMm: 0.002 }), /epsilon/);
});

test("supportPaint round-trips, changes Profile SHA, and resolves identically for CLI and Worker", async () => {
  const supportPaint = validateSupportPaint({
    schema: "katachi.skin.support-paint.v1", coordinateSpace: "support-free-surface-bbox-normalized-v1", sourceLongestMm: 24,
    strokes: [{ order: 0, mode: "inside", centerNormalized: { x: 0.1, y: 0, z: -0.2 }, radiusMm: 3, radiusNormalized: 0.125, surfaceNormal: { x: 0, y: 0, z: 1 }, normalCosineThreshold: 0.5, paintBackfaces: false }],
  });
  const painted = validateSkinPrintProfile({ ...profile, supportPaint });
  assert.deepEqual(validateSkinPrintProfile(JSON.parse(JSON.stringify(painted))).supportPaint, supportPaint);
  assert.notEqual(await printProfileSha256(painted), await printProfileSha256(profile));
  const paintedBinding = { ...binding, currentSupportPaint: supportPaint };
  const sha = await printProfileSha256(painted);
  assert.deepEqual(resolveCliPrintPlan(painted, sha, paintedBinding), resolveWorkerPrintPlan(painted, sha, paintedBinding));
  assert.throws(() => resolveCliPrintPlan(painted, sha, { ...binding, currentSupportPaint: null }), /Support Paint/);
});

test("old v1 Profile without policy fields remains compatible", () => {
  const old = structuredClone(legacyProfile);
  old.artifactVersion = "fixture-001";
  delete old.supportPolicy;
  delete old.expectedClassificationCounts;
  delete old.supportClassification;
  assert.equal(validateSkinPrintProfile(old).supportPolicy, undefined);
});

test("withdrawn footprint Profile parses but cannot resolve a production plan", async () => {
  const sha = await printProfileSha256(legacyProfile);
  assert.throws(() => resolveCliPrintPlan(legacyProfile, sha, binding), /撤回済み|current Surface-ray/);
});

test("new Profile classification counts and ray facts are checked at runtime", async () => {
  const sha = await printProfileSha256(profile);
  const plan = resolveCliPrintPlan(profile, sha, binding);
  assert.throws(() => assertResolvedPrintPlanSupportCounts(plan, {
    total: 4, inside: 1, outside: 3, unresolved: 0, duplicate: 0, unassigned: 0, mixedFace: 1,
    insideSupportSite: 1, outsideSupportSite: 3, unresolvedSupportSite: 0, duplicateSupportSite: 0,
  }, rayFacts), /do not match|match/);
  assert.throws(() => assertResolvedPrintPlanSupportCounts(plan, profile.expectedClassificationCounts!, { ...rayFacts, lowerIntersectionEpsilonMm: 0.002 }), /epsilon/);
  assert.deepEqual(assertResolvedPrintPlanSupportCounts(plan, profile.expectedClassificationCounts!, rayFacts), undefined);
});

test("v088 finalization accepts only exact Surface 128 reprojection, fused 240, counts, and running commit", () => {
  const counts = profile.expectedClassificationCounts!;
  const commit = "5".repeat(40);
  const ready = {
    surfaceResolution: 128, fusedResolution: 240,
    reprojectedSurfaceResolution: 128, reprojectedClassificationCounts: counts,
    classificationCounts: counts, expectedProfileClassificationCounts: counts,
    profileMatches: true, generatorCommit: commit, runningAppCommit: commit,
  };
  assert.equal(assertV088FinalizationReady(ready), undefined);
  assert.throws(() => assertV088FinalizationReady({ ...ready, surfaceResolution: 48 }), /Surface 128/);
  assert.throws(() => assertV088FinalizationReady({ ...ready, fusedResolution: 128 }), /fused 240/);
  assert.throws(() => assertV088FinalizationReady({ ...ready, reprojectedSurfaceResolution: null, reprojectedClassificationCounts: null }), /reprojection/);
  assert.throws(() => assertV088FinalizationReady({ ...ready, profileMatches: false }), /Profile/);
  assert.throws(() => assertV088FinalizationReady({ ...ready, generatorCommit: "working-tree" }), /generatorCommit/);
  assert.throws(() => assertV088FinalizationReady({ ...ready, generatorCommit: "6".repeat(40) }), /generatorCommit/);
});

test("v088 finalization fails closed for unresolved, duplicate, and Profile count drift", () => {
  const counts = profile.expectedClassificationCounts!;
  const commit = "5".repeat(40);
  const ready = {
    surfaceResolution: 128, fusedResolution: 240,
    reprojectedSurfaceResolution: 128, reprojectedClassificationCounts: counts,
    classificationCounts: counts, expectedProfileClassificationCounts: counts,
    profileMatches: true, generatorCommit: commit, runningAppCommit: commit,
  };
  const unresolved = { ...counts, inside: counts.inside - 1, unresolved: 1, insideSupportSite: counts.insideSupportSite - 1, unresolvedSupportSite: 1 };
  assert.throws(() => assertV088FinalizationReady({ ...ready, reprojectedClassificationCounts: unresolved, classificationCounts: unresolved, expectedProfileClassificationCounts: unresolved }), /unresolved/);
  const duplicate = { ...counts, duplicate: 1, duplicateSupportSite: 1 };
  assert.throws(() => assertV088FinalizationReady({ ...ready, reprojectedClassificationCounts: duplicate, classificationCounts: duplicate, expectedProfileClassificationCounts: duplicate }), /duplicate/);
  assert.throws(() => assertV088FinalizationReady({ ...ready, expectedProfileClassificationCounts: { ...counts, mixedFace: counts.mixedFace + 1 } }), /Profile classification counts/);
});

test("low-resolution CLI and Worker resolve identical print plans", async () => {
  const sha = await printProfileSha256(profile);
  assert.deepEqual(resolveCliPrintPlan(profile, sha, binding), resolveWorkerPrintPlan(profile, sha, binding));
});

test("CLI and Worker validation facts share one format and epsilon", async () => {
  const sha = await printProfileSha256(profile);
  const cliPlan = resolveCliPrintPlan(profile, sha, binding);
  const workerPlan = resolveWorkerPrintPlan(profile, sha, binding);
  const fingerprint = await geometryFingerprintLowResolution(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const facts = {
    bboxMm: { width: 1, depth: 1, height: 0 }, faceCount: 1, vertexCount: 3,
    connectedComponents: 1, watertight: false, degenerateTriangleCount: 0,
    internalGraphNodes: 2, internalGraphEdges: 1, scaffoldPillarCount: 1,
    plateAnchorOk: true, plateSpreadMm: 0, fingerprint,
    supportPolicy: OVERHANG_SUPPORT_POLICY, supportRayFacts: rayFacts,
    classificationCounts: profile.expectedClassificationCounts,
    supportPaintFacts: {
      strokeCount: 0, automaticCounts: { inside: profile.expectedClassificationCounts!.inside, outside: profile.expectedClassificationCounts!.outside, unresolved: 0 },
      paintedSupportSiteCount: 0, manualOverrideSupportSiteCount: 0, autoResetSupportSiteCount: 0,
      finalCounts: { inside: profile.expectedClassificationCounts!.inside, outside: profile.expectedClassificationCounts!.outside, unresolved: 0 },
    },
  };
  const cliFacts = buildPrintValidationFacts(cliPlan, facts);
  assert.deepEqual(cliFacts, buildPrintValidationFacts(workerPlan, facts));
  assert.equal(cliFacts.supportClassification.lowerIntersectionEpsilonMm, 0.001);
});

test("geometry fingerprint ignores triangle and per-triangle vertex order", async () => {
  const a = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]);
  const b = new Float32Array([1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
  assert.equal((await geometryFingerprintLowResolution(a)).sha256, (await geometryFingerprintLowResolution(b)).sha256);
  assert.equal((await geometryFingerprintLowResolution(a, 1)).status, "deferred-high-resolution");
});

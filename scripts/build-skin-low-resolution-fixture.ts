import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../src/lib/hash.ts";
import { parseRecipe, replay } from "../src/studies/skin/history.ts";
import { buildSkinMesh, computeSkinSamplingBounds } from "../src/studies/skin/meshExport.ts";
import { diagnoseSurfaceAnglePositions } from "../src/studies/skin/surfaceAngleDiagnosis.ts";
import { assignOverhangSupportTargets, validateOverhangAssignmentLedger } from "../src/studies/skin/overhangSupportPolicy.ts";
import { buildBaseFootprint } from "../src/studies/skin/baseFootprint.ts";
import { DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS } from "../src/studies/skin/externalScaffold.ts";
import { buildSkinPrintProfileV1 } from "../src/studies/skin/printProfile.ts";

const recipePath = fileURLToPath(new URL("../src/studies/skin/presets/skin-v088-low-resolution-fixture.recipe.json", import.meta.url));
const profilePath = fileURLToPath(new URL("../src/studies/skin/presets/skin-v088-low-resolution-fixture.print-profile.json", import.meta.url));
const recipeText = await readFile(recipePath, "utf8");
const state = replay(parseRecipe(recipeText));
const surfaceResolution = 24;
const fusedResolution = 32;
const targetLongestMm = 24;
const angleThresholdDeg = 45;
const surface = buildSkinMesh(
  state.mode, state.host, state.hostParams.k, state.skinParams.thickness, state.patches,
  state.skinParams.roundK, { resolution: surfaceResolution, targetLongestMm }, state.skinParams.coinBulge,
  state.skinParams.quadMeshJoinWidth, state.skinParams.coinBulgeBalance,
);
const surfacePositions = new Float32Array(surface.triangles.flatMap((triangle) => [
  triangle.a.x, triangle.a.y, triangle.a.z,
  triangle.b.x, triangle.b.y, triangle.b.z,
  triangle.c.x, triangle.c.y, triangle.c.z,
]));
const meshStep = computeSkinSamplingBounds(state.host, state.hostParams.k, state.skinParams.thickness, state.patches).longest / surfaceResolution;
const diagnosis = diagnoseSurfaceAnglePositions(surfacePositions, null, angleThresholdDeg, meshStep);
const assignments = assignOverhangSupportTargets({
  diagnosedFaces: new Float32Array(diagnosis.beforeDangerPositions.map((value) => value * surface.scaleMmPerUnit)),
  supportSurfacePositionsMm: new Float32Array(surfacePositions.map((value) => value * surface.scaleMmPerUnit)),
  baseFootprint: buildBaseFootprint(state.host, state.hostParams.k, surface.scaleMmPerUnit),
});
validateOverhangAssignmentLedger(assignments);
const scaffold = { ...DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS, baseRadiusMm: 1.2 };
const dryWebPhysicalRadiusMm = state.skinParams.internalRadius * surface.scaleMmPerUnit;
if (!assignments.rayFacts) throw new Error("support-free Surface ray facts are unavailable");
const profile = buildSkinPrintProfileV1({
  profileName: "phase-a-low paired browser fixture",
  appVersion: "0.70.0",
  artifactVersion: "v088-low-resolution-fixture",
  generatorCommit: "fixture-builder",
  generatorTag: null,
  supportPolicy: assignments.policy,
  supportClassification: {
    method: assignments.rayFacts.method, surfaceSource: assignments.rayFacts.surfaceSource,
    rayDirection: assignments.rayFacts.rayDirection, lowerIntersectionEpsilonMm: assignments.rayFacts.lowerIntersectionEpsilonMm,
  },
  expectedClassificationCounts: assignments.counts,
  shapeRecipe: { sha256: await sha256Hex(recipeText), seed: state.hostParams.seed, pathHint: "skin-v088-low-resolution-fixture.recipe.json" },
  geometry: { targetLongestMm, surfaceResolution, fusedResolution, angleThresholdDeg },
  internalStructure: { method: "targetedGrid", dryWebNormalizedRadius: state.skinParams.internalRadius, dryWebPhysicalRadiusMm },
  scaffold: {
    coverageMode: scaffold.coverageMode, perimeterBandMm: scaffold.perimeterBandMm, spacingMm: scaffold.spacingMm,
    shaftRadiusMm: scaffold.shaftRadiusMm, footRadiusMm: scaffold.baseRadiusMm, contactRadiusMm: scaffold.tipRadiusMm,
    contactOverlapMm: scaffold.contactOverlapMm, plateAnchorDropMm: scaffold.plateAnchorDropMm,
    baseHeightMm: scaffold.baseHeightMm, tipHeightMm: scaffold.tipHeightMm, xyClearanceMm: scaffold.xyClearanceMm,
    sides: scaffold.sides, baseInteriorPolicy: "exclude-host-interior-v1", explicitTargets: [],
  },
  printer: { printer: "Bambu Lab A1 mini", nozzleMm: 0.4, material: "PLA", layerHeightMm: 0.2, automaticSupport: false, supportType: "normal(manual)" },
  slicer: { application: "Bambu Studio", version: "fixture", printerPresetId: "A1 mini", filamentPresetId: "Generic PLA", processPresetId: "0.20mm Standard" },
  executionHints: { workerCount: 2 },
});
await writeFile(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ recipePath, profilePath, recipeSha256: profile.shapeRecipe.sha256, seed: profile.shapeRecipe.seed, geometry: profile.geometry, counts: profile.expectedClassificationCounts }));

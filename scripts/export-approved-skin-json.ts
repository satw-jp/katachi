import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildDenseFlowerV6Style, DENSE_FLOWER_V6_STYLE_PRESET_ID } from "../src/studies/skin/denseFlowerPreset.ts";
import {
  createEmptyState,
  DEFAULT_SKIN_HOST_PARAMS,
  record,
  replay,
  type SkinHistoryEntry,
  type SkinRecipe,
} from "../src/studies/skin/history.ts";

const exportedAt = "2026-08-22T10:00:00.000Z";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(scriptDir, "../src/studies/skin/presets");
const recipeFilename = "skin-v055-a1mini-dry-web-ok-20260822.recipe.json";
const gateFilename = "skin-v055-a1mini-dry-web-ok-20260822.gate.json";

const state = createEmptyState();
const history: SkinHistoryEntry[] = [];
let timestamp = Date.parse(exportedAt);
const originalNow = Date.now;
Date.now = () => timestamp++;

try {
  record(history, state, "growHost", { params: { ...DEFAULT_SKIN_HOST_PARAMS } });
  const result = buildDenseFlowerV6Style(state.host, state.hostParams.k, state.skinParams);
  record(history, state, "applySurfacePreset", {
    presetId: DENSE_FLOWER_V6_STYLE_PRESET_ID,
    params: result.params,
    patches: result.lace.patches,
  });
  record(history, state, "setSkinParam", { key: "internalStructure", value: "targetedGrid" });
} finally {
  Date.now = originalNow;
}

const replayed = replay(history);
if (replayed.patches.length !== 418) throw new Error(`Expected 418 patches, got ${replayed.patches.length}`);
if (replayed.mode !== "plate") throw new Error(`Expected plate mode, got ${replayed.mode}`);
if (replayed.skinParams.internalStructure !== "targetedGrid") throw new Error("Expected targetedGrid Internal Structure");
if (replayed.skinParams.internalDensity !== 28 || replayed.skinParams.internalRadius !== 0.045) {
  throw new Error("Approved Internal Structure settings changed");
}

const recipe: SkinRecipe = {
  formatVersion: 1,
  studyId: "skin",
  exportedAt,
  entries: history,
};
const recipeText = `${JSON.stringify(recipe, null, 2)}\n`;
const recipeSha256 = createHash("sha256").update(recipeText).digest("hex");

const gate = {
  formatVersion: 1,
  kind: "katachi-skin-internal-print-gate-provenance",
  generatedAt: exportedAt,
  tool: {
    name: "Katachi SKIN",
    version: "0.55.0",
    publicUrl: "https://katachi.a-8c3.workers.dev/skin",
    cloudflareVersionId: "8370907e-c9d0-4494-90d9-8dbe4002e57f",
  },
  recipe: {
    filename: recipeFilename,
    sha256: recipeSha256,
    operationCount: history.length,
    patchCount: replayed.patches.length,
    mode: replayed.mode,
    internalStructure: replayed.skinParams.internalStructure,
    internalDensity: replayed.skinParams.internalDensity,
    internalRadiusModelUnits: replayed.skinParams.internalRadius,
    internalRandomness: replayed.skinParams.internalRandomness,
  },
  printIntent: {
    printer: "Bambu Lab A1 mini",
    nozzleDiameterMm: 0.4,
    material: "PLA",
    layerHeightMm: 0.2,
    targetLongestMm: 80,
    outerSkinSupport: "Bambu Studioで付加する（Katachiの内部構造判定対象外）",
  },
  profile: {
    id: "bambu-a1-mini-pla-04-02",
    minStrutDiameterMm: 0.8,
    maxBridgeMm: 5,
    maxAngleFromVerticalDeg: 45,
    minVoxelsAcrossDiameter: 2.5,
    minSurfaceOverlapMm: 0.2,
  },
  measuredResult: {
    ok: true,
    meshResolution: 128,
    meshWatertight: true,
    meshComponents: 1,
    removedDegenerateTriangles: 0,
    angleThresholdDeg: 45,
    lowestPointMarkers: 418,
    reinforcedLowestPointMarkers: 418,
    unsupportedAreaBeforePercent: 14.0,
    unsupportedAreaAfterPercent: 2.9,
    mitigatedPercent: 79.5,
    internalNodes: 1490,
    internalEdges: 823,
    surfaceAnchorNodes: 1490,
    floatingGraphComponents: 0,
    unsupportedNodes: 0,
    unsupportedEdges: 0,
    bridgeEdges: 314,
    overlongBridges: 0,
    maxObservedBridgeMm: 1.4,
    strutDiameterMm: 1.69,
    voxelStepMm: 0.625,
    voxelsAcrossDiameter: 2.7,
    finalExportEnabled: true,
  },
  limitations: [
    "OKはInternal Dry Webと最終メッシュの簡易ゲートであり、外側SKINのサポート、材料状態、機体校正、実機強度を保証しない。",
    "Bambu Studioで外側サポートとスライス後プレビューを確認してから印刷する。",
  ],
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, recipeFilename), recipeText, "utf8");
await writeFile(resolve(outputDir, gateFilename), `${JSON.stringify(gate, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ outputDir, recipeFilename, gateFilename, recipeSha256, patchCount: replayed.patches.length }, null, 2));

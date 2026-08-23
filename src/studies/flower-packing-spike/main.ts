import "./style.css";
import manifest from "./manifest.json";
import {
  DEFAULT_PACKING_PARAMS,
  PACKING_MOTIF_PRESETS,
  createComparison,
  flowerComponents,
  packingMotifFromSearch,
  recommendedPackingCount,
  parseComparison,
  serializeComparison,
  stableContentHash,
  type ComparisonMode,
  type PackingComparison,
  type PackingParams,
} from "./packing.ts";
import { FlowerPackingRenderer, type FlowerViewMode } from "./renderer.ts";
import { buildFlowerPackingUi } from "./ui.ts";
import {
  buildLaceMesh,
  encodeLaceStl,
  type LaceMeshInspection,
  type LaceMeshOptions,
} from "./laceMesh.ts";

const app = document.getElementById("app");
if (!app) throw new Error("#app was not found");

const atlasMotif = packingMotifFromSearch(window.location.search);
const initialMotif = atlasMotif ?? PACKING_MOTIF_PRESETS[1].definition;
let params: PackingParams = {
  ...DEFAULT_PACKING_PARAMS,
  count: recommendedPackingCount(initialMotif),
  targetCoverage: 0.5,
  motif: { ...initialMotif },
};
let mode: ComparisonMode = "motif";
let showProxies = false;
let viewMode: FlowerViewMode = "unified";
let comparison: PackingComparison;
let laceInspection: LaceMeshInspection | null = null;

const ui = buildFlowerPackingUi(app, params, mode, manifest.version, manifest.updatedAt, {
  onParamsChange: (next) => {
    params = { ...next };
    invalidateLaceInspection();
    scheduleRepack();
  },
  onComparisonModeChange: (next) => {
    mode = next;
    invalidateLaceInspection();
    repack();
  },
  onShowProxiesChange: (show) => {
    showProxies = show;
    renderComparison();
  },
  onViewModeChange: (next) => {
    viewMode = next;
    renderComparison();
    ui.setStatus(next === "unified" ? "同じ配置を一体のfield表示にしました。" : "同じ配置を球表示に戻しました。");
  },
  onCameraViewChange: (next) => {
    flowerRenderer.setCameraView(next);
    ui.setStatus(`${next === "front" ? "正面" : next === "side" ? "横" : "斜め"}から観察しています。`);
  },
  onRepack: () => {
    invalidateLaceInspection();
    repack();
  },
  onSaveComparison: () => downloadText(
    `katachi-flower-packing-${mode}-seed-${params.seed}.json`,
    serializeComparison(comparison),
  ),
  onFreezeSoft: () => freezeRightPanel(),
  onOpenFile: (file) => void openComparison(file),
  onInspectLace: (options) => inspectLace(options),
  onExportLace: () => exportLace(),
  onLaceOptionsChange: () => invalidateLaceInspection(),
});

const viewport = document.getElementById("viewport");
if (!viewport) throw new Error("#viewport was not found");
const flowerRenderer = new FlowerPackingRenderer(viewport);

let repackFrame = 0;
function scheduleRepack(): void {
  window.cancelAnimationFrame(repackFrame);
  repackFrame = window.requestAnimationFrame(() => repack());
}

function invalidateLaceInspection(): void {
  laceInspection = null;
  if (comparison) renderComparison();
  ui.setLaceStatus("条件が変わりました。もう一度検査してください。", false, false);
}

function repack(): void {
  const startedAt = performance.now();
  comparison = createComparison(params, mode);
  params = { ...comparison.params };
  ui.setParams(params);
  ui.setComparison(comparison);
  renderComparison();
  const elapsed = performance.now() - startedAt;
  if (params.packingBasis === "coverage") {
    ui.setStatus(
      `目標 ${(params.targetCoverage * 100).toFixed(0)}% · 実体充填 左 ${(comparison.left.result.diagnostics.materialCoverage * 100).toFixed(1)}% / 右 ${(comparison.right.result.diagnostics.materialCoverage * 100).toFixed(1)}% · Seed ${params.seed}`,
    );
  } else {
    ui.setStatus(`同じ初期配置から比較しました · ${elapsed.toFixed(0)} ms · Seed ${params.seed}`);
  }
}

function renderComparison(): void {
  if (!comparison) return;
  flowerRenderer.update(
    { result: comparison.left.result, params: comparison.left.params, color: 0xd8d5cd },
    {
      result: comparison.right.result,
      params: comparison.right.params,
      color: comparison.mode === "response" ? 0xf08a68 : 0x94b8e8,
    },
    showProxies,
    viewMode,
    laceInspection?.mesh ?? null,
  );
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

async function inspectLace(options: LaceMeshOptions): Promise<void> {
  ui.setLaceStatus("一体殻を計算中…", true, false);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  try {
    laceInspection = buildLaceMesh(comparison.right.result, comparison.right.params, options);
    viewMode = "unified";
    ui.setViewMode(viewMode);
    renderComparison();
    const mesh = laceInspection.mesh;
    const summary = [
      `花のつながり ${laceInspection.instanceGroups}群`,
      `保存mesh ${laceInspection.meshComponents}成分`,
      mesh.watertight.ok ? "閉面 OK" : `開いた辺 ${mesh.watertight.openEdges}`,
      `最小接続 ${laceInspection.minimumBridgeMm.toFixed(2)} mm`,
      `${mesh.triangles.length.toLocaleString()}面`,
    ].join(" · ");
    const cleanup = laceInspection.removedFragmentTriangles > 0
      ? ` · 微小なmesh片 ${laceInspection.removedFragmentTriangles}面を除去`
      : "";
    if (laceInspection.printReady) {
      ui.setLaceStatus(`${summary}${cleanup}。一体形状としてSTL保存できます。`, true, true);
    } else {
      ui.setLaceStatus(`${summary}${cleanup}。${laceInspection.reasons.join("。")}`, false, false);
    }
  } catch (error) {
    laceInspection = null;
    ui.setLaceStatus(`一体殻を作れません: ${(error as Error).message}`, false, false);
  }
}

function exportLace(): void {
  if (!laceInspection?.printReady) {
    ui.setLaceStatus("接続・閉面・厚みの検査を通るまでSTLは保存できません。", false, false);
    return;
  }
  try {
    const binary = encodeLaceStl(laceInspection, `Katachi flower lace seed ${params.seed}`);
    downloadBlob(
      `katachi-flower-lace-seed-${params.seed}.stl`,
      new Blob([binary], { type: "model/stl" }),
    );
    ui.setLaceStatus(
      `STLを保存しました · 一体 ${laceInspection.meshComponents}成分 · 最小接続 ${laceInspection.minimumBridgeMm.toFixed(2)} mm`,
      true,
      true,
    );
  } catch (error) {
    ui.setLaceStatus(`STLを保存できません: ${(error as Error).message}`, false, false);
  }
}

async function openComparison(file: File): Promise<void> {
  try {
    invalidateLaceInspection();
    comparison = parseComparison(await file.text());
    params = { ...comparison.params };
    mode = comparison.mode;
    ui.setParams(params);
    ui.setMode(mode);
    ui.setComparison(comparison);
    renderComparison();
    ui.setStatus(`保存した比較を開きました · ${file.name}`);
  } catch (error) {
    ui.setStatus(`開けません: ${(error as Error).message}`, false);
  }
}

function freezeRightPanel(): void {
  const chosen = comparison.right;
  const chosenParams = chosen.params;
  const realized = chosen.result.instances.map((instance) => ({
    instanceId: instance.id,
    components: flowerComponents(instance, chosenParams).map((component) => ({
      kind: component.kind,
      position: component.position,
      radius: component.radius,
    })),
  }));
  const content = {
    format: "katachi-geometry-snapshot-draft",
    formatVersion: 0,
    snapshotId: `flower-${comparison.mode}-seed-${chosenParams.seed}`,
    createdAt: new Date().toISOString(),
    source: {
      studyId: manifest.id,
      studyVersion: manifest.version,
      algorithm: { type: "surface-relaxation", version: "spike-rigid-soft-1" },
      seed: chosenParams.seed,
      parameters: chosenParams,
      response: chosen.result.response,
      proxyMode: chosen.result.proxyMode,
    },
    physicalScale: {
      mmPerShapeUnit: 1,
      source: "assumed",
    },
    realized,
    diagnostics: {
      ...chosen.result.diagnostics,
      deformationVerified: chosen.result.response === "rigid" || chosen.result.diagnostics.meanDeformation > 0,
      warnings: [
        "PACK-SPIKE draft only; this is not the versioned Katachi/Hikari Snapshot v1 contract.",
        "Physical scale is assumed and must not be presented as a measured object size.",
      ],
    },
    materialSlots: ["motif-body"],
    semanticTags: ["flower-motif", chosen.result.response],
  };
  const withHash = { ...content, contentHash: stableContentHash(content) };
  downloadText(
    `katachi-flower-${chosen.result.response}-seed-${chosenParams.seed}.katachi.json`,
    JSON.stringify(withHash, null, 2),
  );
  ui.setStatus("右側の状態をFreezeしました。Hikari未接続のdraft Snapshotです。");
}

repack();

function animate(): void {
  flowerRenderer.render();
  window.requestAnimationFrame(animate);
}
animate();

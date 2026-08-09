import "./style.css";
import manifest from "./manifest.json";
import {
  DEFAULT_PACKING_PARAMS,
  createComparison,
  flowerComponents,
  parseComparison,
  serializeComparison,
  stableContentHash,
  type ComparisonMode,
  type PackingComparison,
  type PackingParams,
} from "./packing.ts";
import { FlowerPackingRenderer, type FlowerViewMode } from "./renderer.ts";
import { buildFlowerPackingUi } from "./ui.ts";

const app = document.getElementById("app");
if (!app) throw new Error("#app was not found");

let params: PackingParams = { ...DEFAULT_PACKING_PARAMS };
let mode: ComparisonMode = "response";
let showProxies = false;
let viewMode: FlowerViewMode = "unified";
let comparison: PackingComparison;

const ui = buildFlowerPackingUi(app, params, mode, manifest.version, manifest.updatedAt, {
  onParamsChange: (next) => {
    params = { ...next };
    scheduleRepack();
  },
  onComparisonModeChange: (next) => {
    mode = next;
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
  onRepack: () => repack(),
  onSaveComparison: () => downloadText(
    `katachi-flower-packing-${mode}-seed-${params.seed}.json`,
    serializeComparison(comparison),
  ),
  onFreezeSoft: () => freezeRightPanel(),
  onOpenFile: (file) => void openComparison(file),
});

const viewport = document.getElementById("viewport");
if (!viewport) throw new Error("#viewport was not found");
const flowerRenderer = new FlowerPackingRenderer(viewport);

let repackFrame = 0;
function scheduleRepack(): void {
  window.cancelAnimationFrame(repackFrame);
  repackFrame = window.requestAnimationFrame(() => repack());
}

function repack(): void {
  const startedAt = performance.now();
  comparison = createComparison(params, mode);
  params = { ...comparison.params };
  ui.setParams(params);
  ui.setComparison(comparison);
  renderComparison();
  const elapsed = performance.now() - startedAt;
  ui.setStatus(`同じ初期配置から比較しました · ${elapsed.toFixed(0)} ms · Seed ${params.seed}`);
}

function renderComparison(): void {
  if (!comparison) return;
  flowerRenderer.update(
    { result: comparison.left.result, color: 0xd8d5cd },
    { result: comparison.right.result, color: comparison.mode === "response" ? 0xf08a68 : 0x94b8e8 },
    comparison.params,
    showProxies,
    viewMode,
  );
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

async function openComparison(file: File): Promise<void> {
  try {
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
  const realized = chosen.result.instances.map((instance) => ({
    instanceId: instance.id,
    components: flowerComponents(instance, comparison.params).map((component) => ({
      kind: component.kind,
      position: component.position,
      radius: component.radius,
    })),
  }));
  const content = {
    format: "katachi-geometry-snapshot-draft",
    formatVersion: 0,
    snapshotId: `flower-${comparison.mode}-seed-${comparison.params.seed}`,
    createdAt: new Date().toISOString(),
    source: {
      studyId: manifest.id,
      studyVersion: manifest.version,
      algorithm: { type: "surface-relaxation", version: "spike-rigid-soft-1" },
      seed: comparison.params.seed,
      parameters: comparison.params,
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
    `katachi-flower-${chosen.result.response}-seed-${comparison.params.seed}.katachi.json`,
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

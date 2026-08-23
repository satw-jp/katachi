import "./style.css";
import manifest from "./manifest.json";
import { encodeBinaryStl, type MeshBuildResult } from "../cloud-sculpt/meshExport.ts";
import {
  DEFAULT_CORE_NETWORK_PARAMS,
  ROUTE_STRATEGIES,
  buildCoreGraph,
  buildCenterStemGraph,
  createNetworkFixture,
  instancesForNodes,
  realizeRoutes,
  realizeCenterStemRoutes,
  selectPatch,
  type CoreNetworkParams,
  type NetworkFixture,
  type PatchLocation,
  type RouteStrategy,
} from "./model.ts";
import { buildNetworkMesh, createNetworkField, type NetworkField } from "./field.ts";
import { inspectCoreNetwork, type CoreNetworkDiagnostics } from "./diagnostics.ts";
import { FlowerCoreNetworkRenderer, type NetworkPanelRender } from "./renderer.ts";
import { buildCoreNetworkUi } from "./ui.ts";

const app = document.getElementById("app");
if (!app) throw new Error("#app was not found");

let params: CoreNetworkParams = {
  ...DEFAULT_CORE_NETWORK_PARAMS,
  buildDirection: { ...DEFAULT_CORE_NETWORK_PARAMS.buildDirection },
};
let fixture: NetworkFixture = createNetworkFixture(params);
let patchLocation: PatchLocation = "top";
let globalStrategy: RouteStrategy = "center-stem";
let globalResult: { panel: NetworkPanelRender; field: NetworkField; mesh: MeshBuildResult } | null = null;
let comparisonFrame = 0;

const PATCH_DIRECTIONS: Record<PatchLocation, { x: number; y: number; z: number }> = {
  top: { x: 0, y: 1, z: 0 },
  side: { x: 1, y: 0, z: 0 },
  bottom: { x: 0, y: -1, z: 0 },
};

const ui = buildCoreNetworkUi(app, params, manifest.version, manifest.updatedAt, {
  onParamsChange: (next) => {
    const packingChanged = next.seed !== params.seed || next.targetCoverage !== params.targetCoverage;
    params = { ...next, buildDirection: { ...next.buildDirection } };
    if (packingChanged) fixture = createNetworkFixture(params);
    invalidateGlobal();
    scheduleComparison();
  },
  onPatchLocationChange: (next) => {
    patchLocation = next;
    renderer.setPatchDirection(PATCH_DIRECTIONS[next]);
    scheduleComparison();
  },
  onCameraViewChange: (view) => renderer.setCameraView(view, globalResult !== null),
  onCrossSectionChange: (crossSection) => {
    params = { ...params, crossSection };
    invalidateGlobal();
    scheduleComparison();
  },
  onGlobalStrategyChange: (strategy) => {
    globalStrategy = strategy;
    invalidateGlobal();
  },
  onShowComparison: () => renderComparison(),
  onInspectGlobal: () => inspectGlobal(),
  onExportStl: () => exportStl(),
  onExportRecipe: () => exportRecipe(),
});

const viewport = document.getElementById("network-viewport");
if (!viewport) throw new Error("#network-viewport was not found");
const renderer = new FlowerCoreNetworkRenderer(viewport);
renderer.setPatchDirection(PATCH_DIRECTIONS[patchLocation]);

function makePanel(
  nodes: ReturnType<typeof selectPatch> | NetworkFixture["nodes"],
  strategy: RouteStrategy,
  resolution: number,
  supportResolution: number,
): { panel: NetworkPanelRender; field: NetworkField } {
  const edges = strategy === "center-stem" ? buildCenterStemGraph(nodes) : buildCoreGraph(nodes, params);
  const routes = strategy === "center-stem"
    ? realizeCenterStemRoutes(nodes, params)
    : realizeRoutes(nodes, edges, strategy, params);
  const instances = instancesForNodes(fixture.result, nodes);
  const field = createNetworkField(instances, fixture.packingParams, routes, params);
  const mesh = buildNetworkMesh(field, params, resolution);
  const diagnosticNodeIds = strategy === "center-stem"
    ? [...nodes.map((node) => node.id), -1]
    : nodes.map((node) => node.id);
  const diagnostics = inspectCoreNetwork(diagnosticNodeIds, edges, mesh, field, params, supportResolution);
  return {
    field,
    panel: { strategy, mesh, routes, diagnostics, params },
  };
}

function scheduleComparison(): void {
  window.cancelAnimationFrame(comparisonFrame);
  comparisonFrame = window.requestAnimationFrame(renderComparison);
}

function renderComparison(): void {
  const startedAt = performance.now();
  globalResult = null;
  ui.setMode("comparison");
  const nodes = selectPatch(fixture.nodes, patchLocation);
  const previewResolution = Math.max(104, Math.min(128, Math.ceil(params.targetLongestMm / params.middleDiameterMm * 1.45)));
  const panels = ROUTE_STRATEGIES.map((strategy) => makePanel(nodes, strategy, previewResolution, 20).panel);
  renderer.updateComparison(panels);
  ui.setPanelDiagnostics(Object.fromEntries(panels.map((panel) => [panel.strategy, panel.diagnostics])) as Record<RouteStrategy, CoreNetworkDiagnostics>);
  const ready = panels.filter((panel) => panel.diagnostics.printGeometryReady).length;
  ui.setStatus(
    `${patchLocation === "top" ? "球の上" : patchLocation === "side" ? "球の横" : "球の下"}の同じ7花・同じ接続を比較 · 閉じた一体mesh ${ready}/3 · ${(performance.now() - startedAt).toFixed(0)} ms`,
    ready === panels.length,
  );
}

function invalidateGlobal(): void {
  globalResult = null;
  ui.setGlobalStatus("条件が変わりました。全球meshをもう一度検査してください。", false, false);
}

async function inspectGlobal(): Promise<void> {
  ui.setGlobalStatus("全球の花と枝を一つのfieldからmesh化しています…", true, false);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  const startedAt = performance.now();
  const built = makePanel(fixture.nodes, globalStrategy, Math.round(params.meshResolution), 28);
  globalResult = { panel: built.panel, field: built.field, mesh: built.panel.mesh };
  renderer.updateGlobal(built.panel);
  ui.setMode("global");
  const d = built.panel.diagnostics;
  const bridgeOk = d.support.maximumUnsupportedSpanMm <= params.bridgeLimitMm;
  const supportSummary = bridgeOk
    ? `最長支持なし ${d.support.maximumUnsupportedSpanMm.toFixed(1)}mm ≤ 仮許容${params.bridgeLimitMm.toFixed(0)}mm`
    : `最長支持なし ${d.support.maximumUnsupportedSpanMm.toFixed(1)}mm > 仮許容${params.bridgeLimitMm.toFixed(0)}mm`;
  const geometrySummary = d.printGeometryReady
    ? `保存条件: 一体・閉面・最小径${d.minimumConnectorDiameterMm.toFixed(1)}mm`
    : `保存条件未達: ${d.reasons.join(" / ")}`;
  ui.setGlobalStatus(
    `${fixture.nodes.length}花 / ${d.edgeCount}枝 / ${d.cycleRank}輪 · ${geometrySummary} · 危険下面 ${d.riskyDownFacingAreaMm2.toFixed(0)}mm² · 推定開始領域 ${d.support.unsupportedStarts} · ${supportSummary} · 推定層 ${d.support.sampledLayerMm.toFixed(1)}mm（設定${params.layerHeightMm.toFixed(2)}mmの実スライスではありません） · ${(performance.now() - startedAt).toFixed(0)}ms`,
    d.printGeometryReady && bridgeOk,
    d.printGeometryReady,
  );
}

function download(filename: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

function exportStl(): void {
  if (!globalResult?.panel.diagnostics.printGeometryReady) return;
  const filename = `katachi-flower-core-network-${globalStrategy}-seed-${params.seed}.stl`;
  download(filename, new Blob([encodeBinaryStl(globalResult.mesh, filename)], { type: "model/stl" }));
}

function exportRecipe(): void {
  const nodes = globalResult ? fixture.nodes : selectPatch(fixture.nodes, patchLocation);
  const edges = globalStrategy === "center-stem" ? buildCenterStemGraph(nodes) : buildCoreGraph(nodes, params);
  const routes = globalStrategy === "center-stem"
    ? realizeCenterStemRoutes(nodes, params)
    : realizeRoutes(nodes, edges, globalStrategy, params);
  const recipe = {
    formatVersion: 1,
    studyId: manifest.id,
    studyVersion: manifest.version,
    source: {
      studyId: "flower-packing-spike",
      snapshotId: `seed-${params.seed}-coverage-${params.targetCoverage.toFixed(3)}`,
      flowerDefinitionRevision: "packing-flower-field-v1",
      coreExtractionVersion: 1,
      seed: params.seed,
      targetCoverage: params.targetCoverage,
      resultingFlowerCount: fixture.nodes.length,
    },
    scope: globalResult ? "global" : `patch-${patchLocation}`,
    routeStrategy: globalStrategy,
    params,
    selectedEdges: edges,
    routeControlPoints: routes.map((route) => ({
      edge: route.edge,
      samples: route.samples.map((sample) => sample.position),
    })),
    physicalScale: { targetLongestMm: params.targetLongestMm, source: "chosen-at-export" },
    diagnostics: globalResult?.panel.diagnostics ?? null,
    derivedMeshVersion: 1,
  };
  download(
    `katachi-flower-core-network-${globalStrategy}-seed-${params.seed}.json`,
    new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }),
  );
}

function animate(): void {
  renderer.render();
  window.requestAnimationFrame(animate);
}

renderComparison();
window.setTimeout(() => void inspectGlobal(), 0);
animate();

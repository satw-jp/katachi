import { createSlider, type SliderHandle } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import {
  ROUTE_LABELS,
  ROUTE_STRATEGIES,
  GLOBAL_ROUTE_STRATEGIES,
  type ConnectorCrossSection,
  type CoreNetworkParams,
  type PatchLocation,
  type RouteStrategy,
} from "./model.ts";
import type { CoreNetworkDiagnostics } from "./diagnostics.ts";
import type { NetworkCameraView } from "./renderer.ts";

export interface CoreNetworkUiCallbacks {
  onParamsChange: (params: CoreNetworkParams) => void;
  onPatchLocationChange: (location: PatchLocation) => void;
  onCameraViewChange: (view: NetworkCameraView) => void;
  onCrossSectionChange: (crossSection: ConnectorCrossSection) => void;
  onGlobalStrategyChange: (strategy: RouteStrategy) => void;
  onShowComparison: () => void;
  onInspectGlobal: () => void | Promise<void>;
  onExportStl: () => void;
  onExportRecipe: () => void;
}

export interface CoreNetworkUi {
  setStatus: (text: string, ok?: boolean) => void;
  setPanelDiagnostics: (values: Record<RouteStrategy, CoreNetworkDiagnostics>) => void;
  setGlobalStatus: (text: string, ok: boolean, canExport: boolean) => void;
  setMode: (mode: "comparison" | "global") => void;
}

interface MetricCard {
  root: HTMLElement;
  component: HTMLElement;
  cycles: HTMLElement;
  risk: HTMLElement;
  span: HTMLElement;
  edges: HTMLElement;
  diameter: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metricCard(strategy: RouteStrategy): MetricCard {
  const root = el("section", "network-metric-card");
  root.dataset.strategy = strategy;
  root.append(el("div", "network-card-kicker", strategy.toUpperCase()), el("h2", "network-card-title", ROUTE_LABELS[strategy]));
  const component = el("span", "network-card-value", "—");
  const cycles = el("span", "network-card-value", "—");
  const risk = el("span", "network-card-value", "—");
  const span = el("span", "network-card-value", "—");
  const edges = el("span", "network-card-value", "—");
  const diameter = el("span", "network-card-value", "—");
  const grid = el("div", "network-card-grid");
  for (const [label, value] of [
    ["一体", component], ["枝 / 輪", edges], ["最小径", diameter], ["危険面", risk], ["支持なし", span],
  ] as const) {
    const item = el("div", "network-card-item");
    item.append(el("span", "network-card-label", label), value);
    grid.appendChild(item);
  }
  root.appendChild(grid);
  return { root, component, cycles, risk, span, edges, diameter };
}

export function buildCoreNetworkUi(
  app: HTMLElement,
  initialParams: CoreNetworkParams,
  version: string,
  updatedAt: string,
  callbacks: CoreNetworkUiCallbacks,
): CoreNetworkUi {
  let params: CoreNetworkParams = { ...initialParams, buildDirection: { ...initialParams.buildDirection } };
  const shell = el("div", "network-shell");
  const viewport = el("main", "network-viewport");
  viewport.id = "network-viewport";
  const overlay = el("div", "network-overlay");
  const cards = Object.fromEntries(ROUTE_STRATEGIES.map((strategy) => [strategy, metricCard(strategy)])) as Record<RouteStrategy, MetricCard>;
  ROUTE_STRATEGIES.forEach((strategy) => overlay.appendChild(cards[strategy].root));
  viewport.appendChild(overlay);

  const panel = el("aside", "network-panel");
  panel.append(el("div", "panel-kicker", "FLOWER CORE NETWORK / BUILD-AWARE"));
  panel.append(el("h1", "panel-title", "花芯をつなぐ"));
  panel.appendChild(createVersionRow(version, updatedAt));
  const nav = el("nav", "nav-row");
  for (const [href, label] of [
    ["./studies.html", "Studies"],
    ["./flower-packing-spike.html", "Flower Packing"],
    ["./flower-form-spike.html", "花一個"],
  ]) {
    const link = el("a", "nav-link", label);
    link.href = href;
    nav.appendChild(link);
  }
  panel.appendChild(nav);
  panel.appendChild(el("p", "question-copy", "閉じた立体の表面に花を配置し、各花芯の裏から茎を中心方向へ伸ばして一体にする。外には花、内には茎が集まる形を残し、造形方向に対する危険を観察する。"));

  panel.appendChild(el("div", "section-title", "観察する場所"));
  const locationControl = el("div", "segmented three-segment");
  let location: PatchLocation = "top";
  for (const [value, label] of [["top", "球の上"], ["side", "球の横"], ["bottom", "球の下"]] as const) {
    const button = el("button", "segment-button", label);
    button.classList.toggle("active", value === location);
    button.onclick = () => {
      location = value;
      for (const child of locationControl.querySelectorAll("button")) child.classList.remove("active");
      button.classList.add("active");
      callbacks.onPatchLocationChange(value);
    };
    locationControl.appendChild(button);
  }
  panel.appendChild(locationControl);

  panel.appendChild(el("div", "section-title", "見る方向"));
  const cameraControl = el("div", "segmented three-segment");
  for (const [value, label] of [["outside", "外から"], ["inside", "内から"], ["side", "横から"]] as const) {
    const button = el("button", "segment-button", label);
    button.classList.toggle("active", value === "outside");
    button.onclick = () => {
      for (const child of cameraControl.querySelectorAll("button")) child.classList.remove("active");
      button.classList.add("active");
      callbacks.onCameraViewChange(value);
    };
    cameraControl.appendChild(button);
  }
  panel.appendChild(cameraControl);

  panel.appendChild(el("div", "section-title", "枝の形"));
  const crossControl = el("div", "segmented");
  const roundButton = el("button", "segment-button", "円");
  const diamondButton = el("button", "segment-button active", "菱形");
  crossControl.append(roundButton, diamondButton);
  const chooseCrossSection = (value: ConnectorCrossSection): void => {
    params = { ...params, crossSection: value };
    roundButton.classList.toggle("active", value === "round");
    diamondButton.classList.toggle("active", value === "diamond");
    callbacks.onCrossSectionChange(value);
  };
  roundButton.onclick = () => chooseCrossSection("round");
  diamondButton.onclick = () => chooseCrossSection("diamond");
  panel.appendChild(crossControl);

  const sliderHandles: SliderHandle[] = [];
  const addSlider = (
    key: keyof CoreNetworkParams,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
  ): void => {
    const value = params[key];
    if (typeof value !== "number") return;
    const handle = createSlider({
      label, min, max, step, initial: value, format,
      onChange: (next) => {
        params = { ...params, [key]: next };
        callbacks.onParamsChange(params);
      },
    });
    sliderHandles.push(handle);
    panel.appendChild(handle.row);
  };
  addSlider("middleDiameterMm", "枝の細さ", 0.8, 2.4, 0.1, (value) => `${value.toFixed(1)} mm`);
  addSlider("rootDiameterMm", "根元の太さ", 1.2, 3.6, 0.1, (value) => `${value.toFixed(1)} mm`);
  addSlider("rootInset", "内側の深さ", 0.04, 0.18, 0.005, (value) => value.toFixed(3));
  addSlider("archRise", "アーチ高さ", 0, 0.28, 0.01, (value) => value.toFixed(2));
  addSlider("loopAmount", "輪の量", 0, 1, 0.05, (value) => `${Math.round(value * 100)}%`);

  panel.appendChild(el("p", "hint", "橙線は枝の中心経路。赤い面は造形方向に対する危険下面の推定で、実際のサポート量ではない。"));

  panel.appendChild(el("div", "section-title", "表面を横につなぐ別案"));
  const compareAction = el("button", "secondary-action", "7花の三案を比較");
  compareAction.onclick = callbacks.onShowComparison;
  panel.appendChild(compareAction);

  panel.appendChild(el("div", "section-title", "閉じた立体の内側"));
  const strategyRow = el("div", "select-row row");
  strategyRow.appendChild(el("label", undefined, "採用経路"));
  const strategySelect = document.createElement("select");
  for (const strategy of GLOBAL_ROUTE_STRATEGIES) {
    const option = document.createElement("option");
    option.value = strategy;
    option.textContent = ROUTE_LABELS[strategy];
    option.selected = strategy === "center-stem";
    strategySelect.appendChild(option);
  }
  strategySelect.onchange = () => callbacks.onGlobalStrategyChange(strategySelect.value as RouteStrategy);
  strategyRow.appendChild(strategySelect);
  panel.appendChild(strategyRow);

  const globalAction = el("button", "primary-action", "中心へ集まる茎を表示・検査");
  globalAction.onclick = () => void callbacks.onInspectGlobal();
  panel.appendChild(globalAction);
  const exportButton = el("button", "secondary-action", "STLを保存");
  exportButton.disabled = true;
  exportButton.onclick = callbacks.onExportStl;
  panel.appendChild(exportButton);
  const recipeButton = el("button", "secondary-action", "設計recipeを保存");
  recipeButton.onclick = callbacks.onExportRecipe;
  panel.appendChild(recipeButton);
  const globalStatus = el("div", "global-status", "まだ全球検査をしていません。");
  panel.appendChild(globalStatus);

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "製造推定の設定";
  details.appendChild(summary);
  const detailContainer = el("div", "details-inner");
  const addDetailSlider = (
    key: keyof CoreNetworkParams,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
  ): void => {
    const value = params[key];
    if (typeof value !== "number") return;
    const handle = createSlider({
      label, min, max, step, initial: value, format,
      onChange: (next) => {
        params = { ...params, [key]: next };
        callbacks.onParamsChange(params);
      },
    });
    sliderHandles.push(handle);
    detailContainer.appendChild(handle.row);
  };
  addDetailSlider("targetLongestMm", "仕上がり外径", 60, 180, 5, (value) => `${Math.round(value)} mm`);
  addDetailSlider("meshResolution", "mesh細かさ", 80, 160, 4, (value) => String(Math.round(value)));
  addDetailSlider("layerHeightMm", "積層ピッチ", 0.1, 0.36, 0.02, (value) => `${value.toFixed(2)} mm`);
  addDetailSlider("overhangLimitDeg", "下面の閾値", 30, 65, 1, (value) => `${Math.round(value)}°`);
  addDetailSlider("bridgeLimitMm", "許容bridge", 4, 20, 1, (value) => `${Math.round(value)} mm`);
  details.appendChild(detailContainer);
  panel.appendChild(details);

  const status = el("div", "status-line", "7花比較を準備中…");
  panel.appendChild(status);
  shell.append(viewport, panel);
  app.appendChild(shell);

  return {
    setStatus: (text, ok = true) => {
      status.textContent = text;
      status.dataset.ok = ok ? "true" : "false";
    },
    setPanelDiagnostics: (values) => {
      for (const strategy of ROUTE_STRATEGIES) {
        const diagnostic = values[strategy];
        const card = cards[strategy];
        card.component.textContent = diagnostic.meshComponents === 1 ? "1成分" : `${diagnostic.meshComponents}成分`;
        card.cycles.textContent = `${diagnostic.cycleRank}`;
        card.edges.textContent = `${diagnostic.edgeCount} / ${diagnostic.cycleRank}`;
        card.diameter.textContent = `${diagnostic.minimumConnectorDiameterMm.toFixed(1)} mm`;
        card.risk.textContent = `${diagnostic.riskyDownFacingAreaMm2.toFixed(0)} mm²`;
        card.span.textContent = `${diagnostic.support.maximumUnsupportedSpanMm.toFixed(1)} mm`;
        card.root.classList.toggle("not-ready", !diagnostic.printGeometryReady);
      }
    },
    setGlobalStatus: (text, ok, canExport) => {
      globalStatus.textContent = text;
      globalStatus.dataset.ok = ok ? "true" : "false";
      exportButton.disabled = !canExport;
    },
    setMode: (mode) => {
      overlay.classList.toggle("global-mode", mode === "global");
    },
  };
}

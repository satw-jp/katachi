import { createSlider, type SliderHandle } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import type { ComparisonMode, DomainKind, PackingComparison, PackingParams } from "./packing.ts";
import type { FlowerViewMode } from "./renderer.ts";

export interface FlowerPackingUiCallbacks {
  onParamsChange: (next: PackingParams) => void;
  onComparisonModeChange: (mode: ComparisonMode) => void;
  onShowProxiesChange: (show: boolean) => void;
  onViewModeChange: (mode: FlowerViewMode) => void;
  onRepack: () => void;
  onSaveComparison: () => void;
  onFreezeSoft: () => void;
  onOpenFile: (file: File) => void;
}

export interface FlowerPackingUi {
  setComparison: (comparison: PackingComparison) => void;
  setStatus: (text: string, ok?: boolean) => void;
  setParams: (params: PackingParams) => void;
  setMode: (mode: ComparisonMode) => void;
}

interface PanelMetrics {
  root: HTMLElement;
  title: HTMLElement;
  state: HTMLElement;
  collisions: HTMLElement;
  penetration: HTMLElement;
  deformation: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metricPanel(side: "left" | "right"): PanelMetrics {
  const root = el("section", `comparison-card comparison-card-${side}`);
  const eyebrow = el("div", "comparison-eyebrow", side === "left" ? "LEFT" : "RIGHT");
  const title = el("h2", "comparison-title", "—");
  const state = el("div", "comparison-state", "—");
  const grid = el("dl", "metric-grid");
  const collisions = el("dd", "metric-value", "0");
  const penetration = el("dd", "metric-value", "0.000");
  const deformation = el("dd", "metric-value", "0%");
  for (const [label, value] of [
    ["未解決", collisions],
    ["最大貫通", penetration],
    ["平均変形", deformation],
  ] as const) {
    grid.append(el("dt", "metric-label", label), value);
  }
  root.append(eyebrow, title, state, grid);
  return { root, title, state, collisions, penetration, deformation };
}

export function buildFlowerPackingUi(
  app: HTMLElement,
  initialParams: PackingParams,
  initialMode: ComparisonMode,
  version: string,
  updatedAt: string,
  callbacks: FlowerPackingUiCallbacks,
): FlowerPackingUi {
  const shell = el("div", "study-shell");
  const viewport = el("main", "viewport-shell");
  viewport.id = "viewport";

  const labels = el("div", "comparison-overlay");
  const leftMetrics = metricPanel("left");
  const rightMetrics = metricPanel("right");
  labels.append(leftMetrics.root, rightMetrics.root);
  viewport.appendChild(labels);

  const panel = el("aside", "panel");
  panel.appendChild(el("div", "panel-kicker", "PACK-SPIKE / MOTIF ON SURFACE"));
  panel.appendChild(el("h1", "panel-title", "花を詰める — Rigid / Soft"));
  panel.appendChild(createVersionRow(version, updatedAt));

  const nav = el("nav", "nav-row");
  for (const [href, label] of [
    ["./studies.html", "Studies"],
    ["./flower-form-spike.html", "花一個"],
    ["./skin.html", "Surface Packing"],
    ["./pack.html", "Void Packing"],
  ]) {
    const link = el("a", "nav-link", label);
    link.href = href;
    nav.appendChild(link);
  }
  panel.appendChild(nav);

  panel.appendChild(
    el(
      "p",
      "question-copy",
      "同じ花・同じ表面・同じSeedで、形を保つ場合と、押されて応答する場合を並べて見る。",
    ),
  );

  const modeTitle = el("div", "section-title", "何を比べるか");
  panel.appendChild(modeTitle);
  const modeControl = el("div", "segmented");
  const responseButton = el("button", "segment-button", "硬さ：Rigid / Soft");
  const proxyButton = el("button", "segment-button", "当たり判定：L0 / L1");
  modeControl.append(responseButton, proxyButton);
  panel.appendChild(modeControl);

  let params = { ...initialParams };
  let mode = initialMode;
  const sliderHandles = new Map<keyof PackingParams, SliderHandle>();

  const syncMode = (): void => {
    responseButton.classList.toggle("active", mode === "response");
    proxyButton.classList.toggle("active", mode === "proxy");
  };
  responseButton.onclick = () => {
    mode = "response";
    syncMode();
    callbacks.onComparisonModeChange(mode);
  };
  proxyButton.onclick = () => {
    mode = "proxy";
    syncMode();
    callbacks.onComparisonModeChange(mode);
  };
  syncMode();

  const domainRow = el("div", "row select-row");
  domainRow.appendChild(el("label", undefined, "配置面"));
  const domainSelect = document.createElement("select");
  for (const [value, label] of [
    ["sphere-surface", "Sphere Surface"],
    ["plane", "Plane"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    domainSelect.appendChild(option);
  }
  domainSelect.value = initialParams.domain;
  domainSelect.onchange = () => {
    const domain = domainSelect.value as DomainKind;
    const count = domain === "plane" && params.count > 20 ? 18 : params.count;
    params = { ...params, domain, count };
    sliderHandles.get("count")?.set(count);
    callbacks.onParamsChange(params);
  };
  domainRow.appendChild(domainSelect);
  panel.appendChild(domainRow);

  const seedRow = el("div", "row seed-row");
  seedRow.appendChild(el("label", undefined, "Seed"));
  const seedInput = document.createElement("input");
  seedInput.type = "number";
  seedInput.step = "1";
  seedInput.value = String(initialParams.seed);
  seedInput.onchange = () => {
    params = { ...params, seed: Math.trunc(Number(seedInput.value)) };
    callbacks.onParamsChange(params);
  };
  seedRow.appendChild(seedInput);
  panel.appendChild(seedRow);

  const addSlider = (
    key: keyof PackingParams,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
  ): void => {
    const value = params[key];
    if (typeof value !== "number") return;
    const handle = createSlider({
      label,
      min,
      max,
      step,
      initial: value,
      format,
      onChange: (next) => {
        params = { ...params, [key]: next };
        callbacks.onParamsChange(params);
      },
    });
    sliderHandles.set(key, handle);
    panel.appendChild(handle.row);
  };

  addSlider("count", "花の数", 8, 64, 1, (value) => String(Math.round(value)));
  addSlider("flowerSize", "花の大きさ", 0.14, 0.34, 0.01, (value) => value.toFixed(2));
  addSlider("clearance", "Gap", 0, 0.12, 0.005, (value) => value.toFixed(3));
  addSlider("softness", "柔らかさ", 0.05, 1, 0.01, (value) => value.toFixed(2));

  const proxyRow = el("label", "check-row");
  const proxyCheck = document.createElement("input");
  proxyCheck.type = "checkbox";
  proxyCheck.onchange = () => callbacks.onShowProxiesChange(proxyCheck.checked);
  proxyRow.append(proxyCheck, document.createTextNode(" Collision Proxyを表示"));
  panel.appendChild(proxyRow);

  const viewTitle = el("div", "section-title shape-title", "花の見え方");
  panel.appendChild(viewTitle);
  const viewControl = el("div", "segmented");
  const spheresButton = el("button", "segment-button", "球をそのまま");
  const unifiedButton = el("button", "segment-button active", "一体の花");
  viewControl.append(spheresButton, unifiedButton);
  panel.appendChild(viewControl);
  let viewMode: FlowerViewMode = "unified";
  const syncViewMode = (): void => {
    spheresButton.classList.toggle("active", viewMode === "spheres");
    unifiedButton.classList.toggle("active", viewMode === "unified");
  };
  spheresButton.onclick = () => {
    viewMode = "spheres";
    syncViewMode();
    callbacks.onViewModeChange(viewMode);
  };
  unifiedButton.onclick = () => {
    viewMode = "unified";
    syncViewMode();
    callbacks.onViewModeChange(viewMode);
  };

  const repack = el("button", "primary-action", "同じ条件で詰め直す");
  repack.onclick = callbacks.onRepack;
  panel.appendChild(repack);

  const hint = el(
    "p",
    "hint",
    "一体の花は、花弁と短い付け根の衝突Proxyから導くfield。Softも要素が離れない範囲で応答する。ドラッグで回転。",
  );
  panel.appendChild(hint);

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "記録と診断";
  details.appendChild(summary);
  const iterationsValue = params.iterations;
  const iterationHandle = createSlider({
    label: "反復回数",
    min: 30,
    max: 240,
    step: 10,
    initial: iterationsValue,
    format: (value) => String(Math.round(value)),
    onChange: (next) => {
      params = { ...params, iterations: next };
      callbacks.onParamsChange(params);
    },
  });
  sliderHandles.set("iterations", iterationHandle);
  details.appendChild(iterationHandle.row);

  const actions = el("div", "record-actions");
  const save = el("button", undefined, "比較を保存 JSON");
  save.onclick = callbacks.onSaveComparison;
  const freeze = el("button", undefined, "右側をFreeze");
  freeze.onclick = callbacks.onFreezeSoft;
  actions.append(save, freeze);
  details.appendChild(actions);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (file) callbacks.onOpenFile(file);
    fileInput.value = "";
  };
  details.appendChild(fileInput);
  panel.appendChild(details);

  const status = el("div", "status-line", "比較を準備中…");
  panel.appendChild(status);
  shell.append(viewport, panel);
  app.appendChild(shell);

  const setMetric = (target: PanelMetrics, label: string, result: PackingComparison["left"]["result"]): void => {
    const diagnostic = result.diagnostics;
    target.title.textContent = label;
    const complete = diagnostic.convergence === "converged";
    target.state.textContent = complete ? "収束" : "部分的に配置";
    target.state.classList.toggle("ok", complete);
    target.collisions.textContent = String(diagnostic.collisionCount);
    target.penetration.textContent = diagnostic.maxPenetration.toFixed(4);
    target.deformation.textContent = `${(diagnostic.meanDeformation * 100).toFixed(1)}%`;
  };

  return {
    setComparison: (comparison) => {
      setMetric(leftMetrics, comparison.left.label, comparison.left.result);
      setMetric(rightMetrics, comparison.right.label, comparison.right.result);
    },
    setStatus: (text, ok = true) => {
      status.textContent = text;
      status.dataset.ok = ok ? "true" : "false";
    },
    setParams: (next) => {
      params = { ...next };
      seedInput.value = String(next.seed);
      domainSelect.value = next.domain;
      for (const [key, handle] of sliderHandles) {
        const value = next[key];
        if (typeof value === "number") handle.set(value);
      }
    },
    setMode: (next) => {
      mode = next;
      syncMode();
    },
  };
}

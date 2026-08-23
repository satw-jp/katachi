import { createSlider, type SliderHandle } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import {
  PACKING_MOTIF_PRESETS,
  packingMotifPresetId,
  recommendedPackingCount,
  type ComparisonMode,
  type DomainKind,
  type PackingBasis,
  type PackingFlowerDefinition,
  type PackingComparison,
  type PackingParams,
} from "./packing.ts";
import type { FlowerPetalCount } from "./flowerForm.ts";
import type { FlowerViewMode, PackingCameraView } from "./renderer.ts";
import { DEFAULT_LACE_MESH_OPTIONS, type LaceMeshOptions } from "./laceMesh.ts";

export interface FlowerPackingUiCallbacks {
  onParamsChange: (next: PackingParams) => void;
  onComparisonModeChange: (mode: ComparisonMode) => void;
  onShowProxiesChange: (show: boolean) => void;
  onViewModeChange: (mode: FlowerViewMode) => void;
  onCameraViewChange: (view: PackingCameraView) => void;
  onRepack: () => void;
  onSaveComparison: () => void;
  onFreezeSoft: () => void;
  onOpenFile: (file: File) => void;
  onInspectLace: (options: LaceMeshOptions) => void | Promise<void>;
  onExportLace: () => void;
  onLaceOptionsChange: () => void;
}

export interface FlowerPackingUi {
  setComparison: (comparison: PackingComparison) => void;
  setStatus: (text: string, ok?: boolean) => void;
  setParams: (params: PackingParams) => void;
  setMode: (mode: ComparisonMode) => void;
  setViewMode: (mode: FlowerViewMode) => void;
  setLaceStatus: (text: string, ok?: boolean, canExport?: boolean) => void;
}

interface PanelMetrics {
  root: HTMLElement;
  title: HTMLElement;
  state: HTMLElement;
  collisions: HTMLElement;
  penetration: HTMLElement;
  deformation: HTMLElement;
  count: HTMLElement;
  materialCoverage: HTMLElement;
  territoryCoverage: HTMLElement;
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
  const count = el("dd", "metric-value", "0");
  const materialCoverage = el("dd", "metric-value", "0%");
  const territoryCoverage = el("dd", "metric-value", "0%");
  for (const [label, value] of [
    ["花の数", count],
    ["実体充填", materialCoverage],
    ["占有範囲", territoryCoverage],
    ["未解決", collisions],
    ["最大貫通", penetration],
    ["平均変形", deformation],
  ] as const) {
    const item = el("div", "metric-item");
    item.append(el("dt", "metric-label", label), value);
    grid.appendChild(item);
  }
  root.append(eyebrow, title, state, grid);
  return { root, title, state, collisions, penetration, deformation, count, materialCoverage, territoryCoverage };
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
  panel.appendChild(el("h1", "panel-title", "花を詰める — 形の比較"));
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
      "同じ表面・同じSeedで、現在の4枚花と調整中の花を並べる。形を変えたまま、硬さと当たり判定も比較する。",
    ),
  );

  const modeTitle = el("div", "section-title", "何を比べるか");
  panel.appendChild(modeTitle);
  const modeControl = el("div", "segmented");
  modeControl.classList.add("comparison-mode-segmented");
  const motifButton = el("button", "segment-button", "花の形：4枚 / 選択形");
  const responseButton = el("button", "segment-button", "硬さ：Rigid / Soft");
  const proxyButton = el("button", "segment-button", "当たり判定：L0 / L1");
  modeControl.append(motifButton, responseButton, proxyButton);
  panel.appendChild(modeControl);

  let params = { ...initialParams };
  let mode = initialMode;
  const sliderHandles = new Map<keyof PackingParams, SliderHandle>();

  const syncMode = (): void => {
    motifButton.classList.toggle("active", mode === "motif");
    responseButton.classList.toggle("active", mode === "response");
    proxyButton.classList.toggle("active", mode === "proxy");
  };
  motifButton.onclick = () => {
    mode = "motif";
    syncMode();
    callbacks.onComparisonModeChange(mode);
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

  panel.appendChild(el("div", "section-title", "詰める花"));
  const motifRow = el("div", "row select-row");
  motifRow.appendChild(el("label", undefined, "花の形"));
  const motifSelect = document.createElement("select");
  for (const preset of PACKING_MOTIF_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    motifSelect.appendChild(option);
  }
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Form Atlas / 調整中の花";
  motifSelect.appendChild(customOption);
  const motifSummary = el("div", "motif-summary");
  const motifSummaryValues = new Map<string, HTMLElement>();
  for (const [key, label] of [
    ["petalCount", "花弁"],
    ["showCore", "花芯"],
    ["opening", "開き"],
    ["neck", "付け根"],
    ["coreSize", "花芯サイズ"],
    ["cupping", "反り"],
    ["coreLift", "花芯高さ"],
    ["growthDifference", "成長差"],
  ] as const) {
    const item = el("div", "motif-summary-item");
    const value = el("span", "motif-summary-value", "—");
    motifSummaryValues.set(key, value);
    item.append(el("span", "motif-summary-label", label), value);
    motifSummary.appendChild(item);
  }

  type MotifNumericKey = Exclude<keyof PackingFlowerDefinition, "showCore">;
  const motifControlHandles = new Map<MotifNumericKey, SliderHandle>();
  const motifDetails = document.createElement("details");
  motifDetails.className = "motif-controls";
  motifDetails.open = true;
  const motifDetailsSummary = document.createElement("summary");
  motifDetailsSummary.textContent = "花の形をすべて調整";
  motifDetails.appendChild(motifDetailsSummary);
  let syncMotif = (): void => {};
  const addMotifSlider = (
    key: MotifNumericKey,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = (value) => value.toFixed(2),
  ): void => {
    const handle = createSlider({
      label,
      min,
      max,
      step,
      initial: params.motif[key],
      format,
      onChange: (next) => {
        const value = key === "petalCount" ? Math.round(next) as FlowerPetalCount : next;
        const motif = { ...params.motif, [key]: value };
        const count = key === "petalCount"
          ? Math.min(params.count, recommendedPackingCount(motif))
          : params.count;
        params = { ...params, count, motif };
        sliderHandles.get("count")?.set(count);
        syncMotif();
        callbacks.onParamsChange(params);
      },
    });
    motifControlHandles.set(key, handle);
    motifDetails.appendChild(handle.row);
  };
  addMotifSlider("petalCount", "花弁の数", 3, 12, 1, (value) => `${Math.round(value)}枚`);
  addMotifSlider("opening", "花弁の開き", 0.72, 1.22, 0.01);
  addMotifSlider("neck", "付け根の太さ", 0.14, 0.62, 0.01);
  addMotifSlider("coreSize", "花芯の大きさ", 0.42, 0.78, 0.01);
  addMotifSlider("cupping", "花弁の反り", -0.18, 0.5, 0.01);
  addMotifSlider("coreLift", "花芯の高さ", -0.12, 0.5, 0.01);
  addMotifSlider("growthDifference", "花弁の成長差", 0, 0.34, 0.01);
  const motifCoreRow = el("label", "check-row motif-core-row");
  const motifCoreCheck = document.createElement("input");
  motifCoreCheck.type = "checkbox";
  motifCoreCheck.onchange = () => {
    const motif = { ...params.motif, showCore: motifCoreCheck.checked };
    const count = Math.min(params.count, recommendedPackingCount(motif));
    params = { ...params, count, motif };
    sliderHandles.get("count")?.set(count);
    syncMotif();
    callbacks.onParamsChange(params);
  };
  motifCoreRow.append(motifCoreCheck, document.createTextNode(" 花芯をつける"));
  motifDetails.appendChild(motifCoreRow);

  syncMotif = (): void => {
    const id = packingMotifPresetId(params.motif);
    customOption.hidden = id !== "custom";
    motifSelect.value = id;
    const motif = params.motif;
    motifSummaryValues.get("petalCount")!.textContent = `${motif.petalCount}枚`;
    motifSummaryValues.get("showCore")!.textContent = motif.showCore ? "あり" : "なし";
    motifSummaryValues.get("opening")!.textContent = motif.opening.toFixed(2);
    motifSummaryValues.get("neck")!.textContent = motif.neck.toFixed(2);
    motifSummaryValues.get("coreSize")!.textContent = motif.coreSize.toFixed(2);
    motifSummaryValues.get("cupping")!.textContent = motif.cupping.toFixed(2);
    motifSummaryValues.get("coreLift")!.textContent = motif.coreLift.toFixed(2);
    motifSummaryValues.get("growthDifference")!.textContent = motif.growthDifference.toFixed(2);
    motifCoreCheck.checked = motif.showCore;
    for (const [key, handle] of motifControlHandles) handle.set(motif[key]);
    for (const key of ["coreSize", "coreLift"] as const) {
      const handle = motifControlHandles.get(key);
      handle?.row.classList.toggle("control-disabled", !motif.showCore);
      const input = handle?.row.querySelector("input");
      if (input) input.disabled = !motif.showCore;
    }
  };
  motifSelect.onchange = () => {
    const preset = PACKING_MOTIF_PRESETS.find((entry) => entry.id === motifSelect.value);
    if (!preset) return;
    const count = Math.min(params.count, recommendedPackingCount(preset.definition));
    params = { ...params, count, motif: { ...preset.definition } };
    sliderHandles.get("count")?.set(count);
    syncMotif();
    callbacks.onParamsChange(params);
  };
  motifRow.appendChild(motifSelect);
  panel.appendChild(motifRow);
  panel.appendChild(motifSummary);
  panel.appendChild(motifDetails);
  syncMotif();

  panel.appendChild(el("div", "section-title", "詰め方"));
  const packingBasisControl = el("div", "segmented packing-basis-segmented");
  const countBasisButton = el("button", "segment-button", "個数で詰める");
  const coverageBasisButton = el("button", "segment-button", "充填率で詰める");
  packingBasisControl.append(countBasisButton, coverageBasisButton);
  panel.appendChild(packingBasisControl);
  let syncPackingBasis = (): void => {};
  const choosePackingBasis = (packingBasis: PackingBasis): void => {
    params = { ...params, packingBasis };
    syncPackingBasis();
    callbacks.onParamsChange(params);
  };
  countBasisButton.onclick = () => choosePackingBasis("count");
  coverageBasisButton.onclick = () => choosePackingBasis("coverage");

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

  addSlider("targetCoverage", "目標充填率", 0.08, 0.9, 0.01, (value) => `${Math.round(value * 100)}%`);
  addSlider("count", "花の数", 8, 96, 1, (value) => String(Math.round(value)));
  addSlider("flowerSize", "花の大きさ", 0.14, 0.34, 0.01, (value) => value.toFixed(2));
  addSlider("clearance", "花の間隔", 0, 0.12, 0.005, (value) => value.toFixed(3));
  addSlider("softness", "柔らかさ", 0.05, 1, 0.01, (value) => value.toFixed(2));

  syncPackingBasis = (): void => {
    const coverageMode = params.packingBasis === "coverage";
    countBasisButton.classList.toggle("active", !coverageMode);
    coverageBasisButton.classList.toggle("active", coverageMode);
    for (const [key, disabled] of [
      ["count", coverageMode],
      ["targetCoverage", !coverageMode],
    ] as const) {
      const handle = sliderHandles.get(key);
      handle?.row.classList.toggle("control-disabled", disabled);
      const input = handle?.row.querySelector("input");
      if (input) input.disabled = disabled;
    }
  };
  syncPackingBasis();
  panel.appendChild(el(
    "p",
    "hint coverage-hint",
    "実体充填は中央穴を空きとして測る。占有範囲は花の外周全体を測る。充填率モードでは花の数が結果になる。",
  ));

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
  const cameraControl = el("div", "segmented camera-view-segmented");
  for (const [cameraView, label] of [
    ["front", "正面"],
    ["side", "横から"],
    ["oblique", "斜め"],
  ] as const) {
    const button = el("button", "segment-button", label);
    if (cameraView === "oblique") button.classList.add("active");
    button.onclick = () => {
      for (const sibling of cameraControl.querySelectorAll("button")) sibling.classList.remove("active");
      button.classList.add("active");
      callbacks.onCameraViewChange(cameraView);
    };
    cameraControl.appendChild(button);
  }
  panel.appendChild(cameraControl);

  const laceDetails = document.createElement("details");
  laceDetails.className = "lace-controls";
  laceDetails.open = true;
  const laceSummary = document.createElement("summary");
  laceSummary.textContent = "プリント用レース殻";
  laceDetails.appendChild(laceSummary);
  let laceOptions: LaceMeshOptions = { ...DEFAULT_LACE_MESH_OPTIONS };
  const addLaceSlider = (
    key: keyof LaceMeshOptions,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
  ): void => {
    const handle = createSlider({
      label,
      min,
      max,
      step,
      initial: laceOptions[key],
      format,
      onChange: (value) => {
        laceOptions = { ...laceOptions, [key]: key === "resolution" ? Math.round(value) : value };
        callbacks.onLaceOptionsChange();
      },
    });
    laceDetails.appendChild(handle.row);
  };
  addLaceSlider("fusionRadius", "つなぐ太さ", 0.01, 0.12, 0.005, (value) => value.toFixed(3));
  addLaceSlider("resolution", "mesh細かさ", 40, 80, 4, (value) => String(Math.round(value)));
  addLaceSlider("targetLongestMm", "仕上がり外径", 60, 180, 5, (value) => `${Math.round(value)} mm`);
  addLaceSlider("minimumThicknessMm", "必要な接続厚", 0.8, 3, 0.1, (value) => `${value.toFixed(1)} mm`);
  const laceActions = el("div", "lace-actions");
  const inspectLace = el("button", "primary-action lace-inspect", "右側を一体殻として検査");
  inspectLace.onclick = () => void callbacks.onInspectLace({ ...laceOptions });
  const exportLace = el("button", undefined, "STLを保存");
  exportLace.disabled = true;
  exportLace.onclick = callbacks.onExportLace;
  laceActions.append(inspectLace, exportLace);
  const laceStatus = el("div", "lace-status", "まだ検査していません。");
  laceDetails.append(
    el("p", "hint", "下地の球は含めない。中央穴と花の間の穴を塞ぐ土台は足さず、花同士だけをつなぐ。太くしすぎて穴が閉じないかは目視する。"),
    laceActions,
    laceStatus,
  );
  panel.appendChild(laceDetails);

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
    target.count.textContent = String(result.instances.length);
    target.materialCoverage.textContent = `${(diagnostic.materialCoverage * 100).toFixed(1)}%`;
    target.territoryCoverage.textContent = `${(diagnostic.territoryCoverage * 100).toFixed(1)}%`;
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
      syncMotif();
      seedInput.value = String(next.seed);
      domainSelect.value = next.domain;
      for (const [key, handle] of sliderHandles) {
        const value = next[key];
        if (typeof value === "number") handle.set(value);
      }
      syncPackingBasis();
    },
    setMode: (next) => {
      mode = next;
      syncMode();
    },
    setViewMode: (next) => {
      viewMode = next;
      syncViewMode();
    },
    setLaceStatus: (text, ok = true, canExport = false) => {
      laceStatus.textContent = text;
      laceStatus.dataset.ok = ok ? "true" : "false";
      exportLace.disabled = !canExport;
    },
  };
}

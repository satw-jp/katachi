// ---------------------------------------------------------------------------
// Control panel for S2c. Same visual language as S1/S2/S2b (panel, sliders,
// section labels, permanent banner). New here: the physical-quantity
// sliders (each labeled with its real unit, T2d-mpm.md §1), a run/auto-run
// pair instead of a continuous simulation always ticking (MPM is far more
// expensive per frame than the metaball SDF, so running is an explicit
// choice, not implicit), and the freeze -> "S1 レシピとして書き出す" pair
// that returns a result to S1/S2b's world (T2d-mpm.md §2 "還流").
// ---------------------------------------------------------------------------

import type { MpmParams } from "./params.ts";
import type { BackendKind } from "./gpu/capabilities.ts";

export interface UiCallbacks {
  onParamChange: (key: keyof MpmParams, value: number | string) => void;
  onSeedDefault: () => void;
  onReseed: () => void;
  onImportS1File: (file: File) => void;
  /** T2f: import a binary STL, voxel-fill its interior, and seed particles from it (same downstream state as any other seeding). */
  onImportStlFile: (file: File) => void;
  onRunOnce: () => void;
  onAutoRunToggle: (enabled: boolean) => void;
  onFreeze: () => void;
  onExportHistory: () => void;
  onImportHistoryFile: (file: File) => void;
  onExportFrozenS1: () => void;
  onClear: () => void;
  /** Manual backend switch (T2e "手動切替もあるとよい"). Only fired for a backend the caller has confirmed is usable. */
  onBackendChange: (kind: BackendKind) => void;
}

export interface BackendInfo {
  /** Backend currently executing physics. */
  active: BackendKind;
  /** Whether WebGPU is available at all on this device/browser (controls whether the manual switch to "webgpu" is enabled). */
  webgpuAvailable: boolean;
  /** true while capability detection is still in flight (startup only). */
  detecting: boolean;
  /** Adapter identity string, when known (T2e "現在のバックエンドを画面に常時表示"). */
  adapterInfo?: string;
  /** Why WebGPU is unavailable (secure-context, unsupported browser, ...), when it is. Shown verbatim in the badge detail. */
  unavailableReason?: string;
}

export interface UiHandles {
  root: HTMLElement;
  setParticleCount: (n: number) => void;
  setStepCount: (n: number) => void;
  setFps: (fps: number) => void;
  setHistoryCount: (n: number) => void;
  setFrozenCount: (n: number) => void;
  /** Reflect an autorun stop initiated by code (e.g. freeze) back into the checkbox. */
  setAutoRun: (enabled: boolean) => void;
  setStatus: (text: string) => void;
  syncParams: (params: MpmParams) => void;
  /** Update the always-visible backend badge + manual-switch control (T2e "現在のバックエンドを画面に常時表示"). */
  setBackendInfo: (info: BackendInfo) => void;
}

interface SliderSpec {
  key: keyof MpmParams;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
}

const PHASE_SPEC: SliderSpec = { key: "phase", label: "相 (0=弾性固体 / 1=粘性流体)", min: 0, max: 1, step: 0.01, decimals: 2 };

const SOLID_SPECS: SliderSpec[] = [
  { key: "youngsModulusPa", label: "ヤング率 E (Pa)", min: 200, max: 30000, step: 50 },
  { key: "poissonRatio", label: "ポアソン比 ν", min: 0, max: 0.49, step: 0.01, decimals: 2 },
];

const FLUID_SPECS: SliderSpec[] = [
  { key: "fluidBulkModulusPa", label: "体積弾性率 K (Pa)", min: 200, max: 30000, step: 50 },
  { key: "fluidViscosityPaS", label: "粘性係数 μ (Pa·s)", min: 0, max: 100, step: 0.5, decimals: 1 },
];

const SHARED_SPECS: SliderSpec[] = [
  { key: "densityKgM3", label: "密度 ρ (kg/m³)", min: 100, max: 3000, step: 10 },
  { key: "gravity", label: "重力加速度 (sketch/s²)", min: 0, max: 20, step: 0.1, decimals: 1 },
];

const SEED_SPECS: SliderSpec[] = [
  { key: "particlesPerUnitVolume", label: "粒子密度 (個/体積)", min: 20, max: 600, step: 10 },
  { key: "substepsPerRun", label: "1回の実行あたりのサブステップ数", min: 1, max: 200, step: 1 },
  // T2e "gridN を UI に出す（T2d の宿題）" — 既存 setParam のまま履歴に記録される。
  // 上限128はWebGPUでの実測（README）を根拠に設定、CPUでは重い（下限寄りを推奨）。
  { key: "gridN", label: "格子解像度 gridN", min: 16, max: 128, step: 4 },
];

export function buildUi(container: HTMLElement, params: MpmParams, version: string, updatedAt: string, callbacks: UiCallbacks): UiHandles {
  const banner = document.createElement("div");
  banner.className = "approx-banner";
  banner.textContent =
    "MLS-MPM による連続体の近似。格子解像度と時間刻みに依存する。実物の保証はしない。" +
    "構成則: Neo-Hookean 弾性固体 ⇄ 弱圧縮粘性流体（式は README 参照）。CPU 実装（実測は README）。";
  container.appendChild(banner);

  // Always-visible backend badge (T2e "現在のバックエンドを画面に常時表示" — a正直さ
  // requirement, not decoration: which backend is computing must never be hidden).
  const backendBadge = document.createElement("div");
  backendBadge.className = "backend-badge";
  backendBadge.textContent = "バックエンド: 検出中…";
  container.appendChild(backendBadge);

  const root = document.createElement("div");
  root.className = "panel";

  const navRow = document.createElement("div");
  navRow.className = "nav-row";
  const navBack = document.createElement("a");
  navBack.className = "nav-link";
  navBack.href = "./sag.html";
  navBack.textContent = "← S2b たわむ";
  navRow.appendChild(navBack);
  const navHome = document.createElement("a");
  navHome.className = "nav-link";
  navHome.href = "./index.html";
  navHome.textContent = "← S1 雲をこねる";
  navRow.appendChild(navHome);
  const navFoam = document.createElement("a");
  navFoam.className = "nav-link";
  navFoam.href = "./foam.html";
  navFoam.textContent = "S-foam 泡のセル →";
  navRow.appendChild(navFoam);
  const navRings = document.createElement("a");
  navRings.className = "nav-link";
  navRings.href = "./rings.html";
  navRings.textContent = "S-rings 輪の手 →";
  navRow.appendChild(navRings);
  const navPack = document.createElement("a");
  navPack.className = "nav-link";
  navPack.href = "./pack.html";
  navPack.textContent = "S-pack 虚を詰める →";
  navRow.appendChild(navPack);
  const navSkin = document.createElement("a");
  navSkin.className = "nav-link";
  navSkin.href = "./skin.html";
  navSkin.textContent = "S-skin 表面に詰める →";
  navRow.appendChild(navSkin);
  root.appendChild(navRow);

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "本物を混ぜる — MPM";
  root.appendChild(title);

  const versionRow = document.createElement("div");
  versionRow.className = "version-row";
  versionRow.textContent = `v${version} · updated ${updatedAt}`;
  root.appendChild(versionRow);

  // --- Backend (T2e 手動切替) ------------------------------------------------
  addSectionLabel(root, "バックエンド (計算)");
  const backendRow = document.createElement("div");
  backendRow.className = "row";
  const cpuRadioLabel = document.createElement("label");
  cpuRadioLabel.className = "checkbox-label";
  const cpuRadio = document.createElement("input");
  cpuRadio.type = "radio";
  cpuRadio.name = "mpm-backend";
  cpuRadio.value = "cpu";
  cpuRadioLabel.appendChild(cpuRadio);
  cpuRadioLabel.appendChild(document.createTextNode(" CPU"));
  const gpuRadioLabel = document.createElement("label");
  gpuRadioLabel.className = "checkbox-label";
  const gpuRadio = document.createElement("input");
  gpuRadio.type = "radio";
  gpuRadio.name = "mpm-backend";
  gpuRadio.value = "webgpu";
  gpuRadioLabel.appendChild(gpuRadio);
  gpuRadioLabel.appendChild(document.createTextNode(" WebGPU"));
  cpuRadio.onchange = () => {
    if (cpuRadio.checked) callbacks.onBackendChange("cpu");
  };
  gpuRadio.onchange = () => {
    if (gpuRadio.checked) callbacks.onBackendChange("webgpu");
  };
  backendRow.appendChild(cpuRadioLabel);
  backendRow.appendChild(gpuRadioLabel);
  root.appendChild(backendRow);
  const backendDetail = document.createElement("div");
  backendDetail.className = "hint";
  root.appendChild(backendDetail);

  // --- Seeding -------------------------------------------------------------
  addSectionLabel(root, "種まき");
  const seedRow = document.createElement("div");
  seedRow.className = "row";
  const seedDefaultBtn = document.createElement("button");
  seedDefaultBtn.textContent = "S1既定の雲から撒く";
  seedDefaultBtn.onclick = () => callbacks.onSeedDefault();
  const reseedBtn = document.createElement("button");
  reseedBtn.textContent = "シードを振り直す";
  reseedBtn.onclick = () => callbacks.onReseed();
  seedRow.appendChild(seedDefaultBtn);
  seedRow.appendChild(reseedBtn);
  root.appendChild(seedRow);

  const importS1Row = document.createElement("div");
  importS1Row.className = "row";
  const importS1Label = document.createElement("label");
  importS1Label.textContent = "S1/S2bレシピを取り込む";
  const importS1Input = document.createElement("input");
  importS1Input.type = "file";
  importS1Input.accept = "application/json";
  importS1Input.onchange = () => {
    const file = importS1Input.files?.[0];
    if (file) callbacks.onImportS1File(file);
    importS1Input.value = "";
  };
  importS1Row.appendChild(importS1Label);
  importS1Row.appendChild(importS1Input);
  root.appendChild(importS1Row);

  // --- STL import (T2f) -----------------------------------------------------
  const importStlRow = document.createElement("div");
  importStlRow.className = "row";
  const importStlLabel = document.createElement("label");
  importStlLabel.textContent = "STLを取り込む";
  const importStlInput = document.createElement("input");
  importStlInput.type = "file";
  importStlInput.accept = ".stl,model/stl,application/sla,application/vnd.ms-pki.stl";
  importStlInput.onchange = () => {
    const file = importStlInput.files?.[0];
    if (file) callbacks.onImportStlFile(file);
    importStlInput.value = "";
  };
  importStlRow.appendChild(importStlLabel);
  importStlRow.appendChild(importStlInput);
  root.appendChild(importStlRow);

  const stlHint = document.createElement("div");
  stlHint.className = "hint";
  stlHint.textContent =
    "バイナリSTLのみ対応（ASCIIは非対応 — Blenderの書き出し設定でBinaryを選んでください）。" +
    "取り込むと最長辺がドメインの6割程度へ自動スケールされ、地面の上に置き直されます。" +
    "内外判定は偶奇のレイキャストなので、穴のある非水密メッシュは誤って充填されることがあります" +
    "（変だと思ったらBlender側で穴を塞いでから書き出し直してください）。";
  root.appendChild(stlHint);

  const sliders: { spec: SliderSpec; set: (v: number) => void }[] = [];
  const mount = (spec: SliderSpec) => {
    const built = buildSlider(spec, params, callbacks.onParamChange);
    sliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  };

  for (const spec of SEED_SPECS) mount(spec);

  // --- Constitutive law ------------------------------------------------------
  addSectionLabel(root, "構成則 — 相のつまみ");
  mount(PHASE_SPEC);

  addSectionLabel(root, "固体の端 (Neo-Hookean)");
  for (const spec of SOLID_SPECS) mount(spec);

  addSectionLabel(root, "流体の端 (弱圧縮性)");
  for (const spec of FLUID_SPECS) mount(spec);

  addSectionLabel(root, "共通の物理量");
  for (const spec of SHARED_SPECS) mount(spec);

  // --- Run ---------------------------------------------------------------
  addSectionLabel(root, "実行");
  const runRow = document.createElement("div");
  runRow.className = "row";
  const runBtn = document.createElement("button");
  runBtn.textContent = "実行 (Nサブステップ)";
  runBtn.onclick = () => callbacks.onRunOnce();
  runRow.appendChild(runBtn);
  const autoLabel = document.createElement("label");
  autoLabel.className = "checkbox-label";
  const autoCheckbox = document.createElement("input");
  autoCheckbox.type = "checkbox";
  autoCheckbox.onchange = () => callbacks.onAutoRunToggle(autoCheckbox.checked);
  autoLabel.appendChild(autoCheckbox);
  autoLabel.appendChild(document.createTextNode(" 自動実行"));
  runRow.appendChild(autoLabel);
  root.appendChild(runRow);

  const freezeRow = document.createElement("div");
  freezeRow.className = "row";
  const freezeBtn = document.createElement("button");
  freezeBtn.textContent = "凍らせる (Freeze)";
  freezeBtn.title = "今の粒子群を球のリストに焼き付けます";
  freezeBtn.onclick = () => callbacks.onFreeze();
  freezeRow.appendChild(freezeBtn);
  root.appendChild(freezeRow);

  const exportFrozenRow = document.createElement("div");
  exportFrozenRow.className = "row";
  const exportFrozenBtn = document.createElement("button");
  exportFrozenBtn.textContent = "凍結結果をS1レシピで書き出す";
  exportFrozenBtn.onclick = () => callbacks.onExportFrozenS1();
  exportFrozenRow.appendChild(exportFrozenBtn);
  root.appendChild(exportFrozenRow);

  const status = document.createElement("div");
  status.className = "selection-info";
  root.appendChild(status);

  // --- History -------------------------------------------------------------
  const sep = document.createElement("hr");
  root.appendChild(sep);

  const historyRow = document.createElement("div");
  historyRow.className = "row";
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "履歴を書き出す (Export JSON)";
  exportBtn.onclick = () => callbacks.onExportHistory();
  historyRow.appendChild(exportBtn);
  root.appendChild(historyRow);

  const importRow = document.createElement("div");
  importRow.className = "row";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.onchange = () => {
    const file = importInput.files?.[0];
    if (file) callbacks.onImportHistoryFile(file);
    importInput.value = "";
  };
  importRow.appendChild(importInput);
  root.appendChild(importRow);

  const clearBtn = document.createElement("button");
  clearBtn.className = "danger";
  clearBtn.textContent = "すべて消去 (Clear)";
  clearBtn.onclick = () => callbacks.onClear();
  root.appendChild(clearBtn);

  const particleCount = document.createElement("div");
  particleCount.className = "history-count";
  root.appendChild(particleCount);

  const stepCount = document.createElement("div");
  stepCount.className = "history-count";
  root.appendChild(stepCount);

  const historyCount = document.createElement("div");
  historyCount.className = "history-count";
  root.appendChild(historyCount);

  const frozenCount = document.createElement("div");
  frozenCount.className = "history-count";
  root.appendChild(frozenCount);

  const fps = document.createElement("div");
  fps.className = "fps";
  root.appendChild(fps);

  container.appendChild(root);

  return {
    root,
    setParticleCount: (n) => {
      particleCount.textContent = `粒子数: ${n.toLocaleString()}`;
    },
    setStepCount: (n) => {
      stepCount.textContent = `累計サブステップ: ${n.toLocaleString()}`;
    },
    setFps: (f) => {
      fps.textContent = `~${f.toFixed(0)} fps`;
    },
    setHistoryCount: (n) => {
      historyCount.textContent = `操作履歴: ${n} 件`;
    },
    setAutoRun: (enabled) => {
      autoCheckbox.checked = enabled;
    },
    setFrozenCount: (n) => {
      frozenCount.textContent = `凍結結果: ${n} 件`;
      exportFrozenBtn.disabled = n <= 0;
    },
    setStatus: (text) => {
      status.textContent = text;
    },
    syncParams: (p) => {
      for (const { spec, set } of sliders) set(Number(p[spec.key]));
    },
    setBackendInfo: (info) => {
      cpuRadio.checked = info.active === "cpu";
      gpuRadio.checked = info.active === "webgpu";
      gpuRadio.disabled = !info.webgpuAvailable;
      if (info.detecting) {
        backendBadge.textContent = "バックエンド: 検出中…";
        backendDetail.textContent = "WebGPU の対応を確認しています。";
      } else if (info.active === "webgpu") {
        backendBadge.textContent = `バックエンド: WebGPU${info.adapterInfo ? ` (${info.adapterInfo})` : ""}`;
        backendDetail.textContent = "計算は GPU (WebGPU compute) で実行中。CPU は検算・フォールバック用に残っている。";
      } else {
        backendBadge.textContent = info.webgpuAvailable ? "バックエンド: CPU (手動選択)" : "バックエンド: CPU (WebGPU 非対応のため自動フォールバック)";
        backendDetail.textContent = info.webgpuAvailable
          ? "計算は CPU (TypeScript) で実行中。"
          : `CPU 実装にフォールバック中。${info.unavailableReason ?? "この環境では WebGPU が使えない。"}`;
      }
    },
  };
}

function addSectionLabel(root: HTMLElement, text: string): void {
  const label = document.createElement("div");
  label.className = "section-label";
  label.textContent = text;
  root.appendChild(label);
}

function buildSlider(
  spec: SliderSpec,
  params: MpmParams,
  onChange: UiCallbacks["onParamChange"],
): { row: HTMLElement; set: (v: number) => void } {
  const row = document.createElement("div");
  row.className = "row slider-row";

  const label = document.createElement("label");
  label.textContent = spec.label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(spec.min);
  slider.max = String(spec.max);
  slider.step = String(spec.step);
  slider.value = String(params[spec.key]);

  const valueOut = document.createElement("span");
  valueOut.className = "value-out";
  const fmt = (v: number) => (spec.decimals !== undefined ? v.toFixed(spec.decimals) : String(v));
  valueOut.textContent = fmt(Number(params[spec.key]));

  slider.oninput = () => {
    const value = Number(slider.value);
    valueOut.textContent = fmt(value);
    onChange(spec.key, value);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(valueOut);

  const set = (v: number) => {
    slider.value = String(v);
    valueOut.textContent = fmt(v);
  };
  return { row, set };
}

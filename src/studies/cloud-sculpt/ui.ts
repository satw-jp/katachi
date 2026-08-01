// ---------------------------------------------------------------------------
// Minimal DOM control panel: sliders for the field params (つまみ), buttons
// for history export/import and clearing, and the Version/UpdatedAt strip
// required by ~/Projects/AGENTS.md UI rules.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "./field.ts";
import type {
  HikariPhenomenon,
  HikariMode,
  HikariSettings,
  HikariSpawn,
  DaylightMode,
  OpticalColorMode,
  OpticalDispersionMode,
  OpticalHostPreset,
  OpticalMaterial,
  OpticalRainbowModel,
  OpticalView,
  WorkspaceView,
} from "./hikari.ts";
import { formatMinutes, resolveDaylight } from "./daylight.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import { createSlider } from "../../lib/ui/slider.ts";

export interface UiCallbacks {
  onParamChange: (key: keyof FieldParams, value: number | string) => void;
  onGrow: () => void;
  onReroll: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  /** Per-ball radius edit for the currently selected ball. */
  onBallRadiusChange: (r: number) => void;
  /** Per-ball position edit (one axis) for the currently selected ball. */
  onBallPositionChange: (axis: "x" | "y" | "z", value: number) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onMeshInspect: (options: MeshExportUiOptions) => void;
  onMeshExport: (options: MeshExportUiOptions) => void;
  onViewChange: (view: WorkspaceView) => void;
  onHikariChange: (settings: HikariSettings) => void;
  onHikariCaseSave: (details: { caseId: string; observation: string }) => void;
  onHikariCaseImportFile: (file: File) => void;
  onBlenderExport: (details: {
    caseId: string;
    observation: string;
    options: MeshExportUiOptions;
  }) => void;
}

export interface UiHandles {
  root: HTMLElement;
  setSelectionInfo: (text: string) => void;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  /**
   * Show/populate the per-ball editor for `ball`, or hide it when null.
   * Fields currently focused by the user are left untouched so live typing
   * / dragging is not clobbered by an unrelated refresh.
   */
  setBallEditor: (ball: Ball | null) => void;
  /** Push current param values back into the sliders/seed input (after import / reroll). */
  syncParams: (params: FieldParams) => void;
  setMeshStatus: (text: string, ok?: boolean) => void;
  setView: (view: WorkspaceView) => void;
  setHikariSource: (text: string) => void;
  setHikariCaseStatus: (text: string, ok?: boolean) => void;
  setBlenderExportStatus: (text: string, ok?: boolean) => void;
  syncHikariCaseDetails: (details: { caseId: string; observation: string }) => void;
  syncHikariSettings: (settings: HikariSettings) => void;
  setOpticsComputeStatus: (
    status: { text: string; kind: "checking" | "computing" | "webgpu" | "cpu" | "error" },
  ) => void;
}

export interface MeshExportUiOptions {
  resolution: number;
  targetLongestMm: number;
}

const PARAM_SPECS: {
  key: keyof FieldParams;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "count", label: "球の数", min: 1, max: 40, step: 1 },
  { key: "radiusBase", label: "半径", min: 0.15, max: 1.5, step: 0.01 },
  { key: "radiusSpread", label: "半径のばらつき", min: 0, max: 1.5, step: 0.01 },
  { key: "k", label: "ブレンド強さ k", min: 0, max: 1.5, step: 0.01 },
];

export function buildUi(
  container: HTMLElement,
  params: FieldParams,
  version: string,
  updatedAt: string,
  initialView: WorkspaceView,
  initialHikari: HikariSettings,
  callbacks: UiCallbacks,
): UiHandles {
  const root = document.createElement("div");
  root.className = "panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "雲をこねる — Cloud Sculpt";
  root.appendChild(title);

  const workspaceSwitch = document.createElement("div");
  workspaceSwitch.className = "workspace-switch";
  const katachiButton = document.createElement("button");
  katachiButton.type = "button";
  katachiButton.textContent = "KATACHI";
  const hikariButton = document.createElement("button");
  hikariButton.type = "button";
  hikariButton.textContent = "HIKARI";
  workspaceSwitch.appendChild(katachiButton);
  workspaceSwitch.appendChild(hikariButton);
  root.appendChild(workspaceSwitch);

  const nav = document.createElement("a");
  nav.className = "nav-link";
  nav.href = "./gravity.html";
  nav.textContent = "S2 重力を入れる →";
  root.appendChild(nav);

  const navSag = document.createElement("a");
  navSag.className = "nav-link";
  navSag.href = "./sag.html";
  navSag.textContent = "S2b たわむ →";
  root.appendChild(navSag);

  const navMpm = document.createElement("a");
  navMpm.className = "nav-link";
  navMpm.href = "./mpm.html";
  navMpm.textContent = "S2c 本物を混ぜる (MPM) →";
  root.appendChild(navMpm);

  const navFoam = document.createElement("a");
  navFoam.className = "nav-link";
  navFoam.href = "./foam.html";
  navFoam.textContent = "S-foam 泡のセル →";
  root.appendChild(navFoam);

  const navRings = document.createElement("a");
  navRings.className = "nav-link";
  navRings.href = "./rings.html";
  navRings.textContent = "S-rings 輪の手 →";
  root.appendChild(navRings);

  const navPack = document.createElement("a");
  navPack.className = "nav-link";
  navPack.href = "./pack.html";
  navPack.textContent = "S-pack 虚を詰める →";
  root.appendChild(navPack);

  const navSkin = document.createElement("a");
  navSkin.className = "nav-link";
  navSkin.href = "./skin.html";
  navSkin.textContent = "S-skin 表面に詰める →";
  root.appendChild(navSkin);

  const versionRow = createVersionRow(version, updatedAt);
  root.appendChild(versionRow);

  const growRow = document.createElement("div");
  growRow.className = "row";
  const growBtn = document.createElement("button");
  growBtn.textContent = "育て直す (Grow)";
  growBtn.title = "現在のつまみ設定から新しい雲を生成します";
  growBtn.onclick = () => callbacks.onGrow();
  const rerollBtn = document.createElement("button");
  rerollBtn.textContent = "シードを振る";
  rerollBtn.onclick = () => callbacks.onReroll();
  growRow.appendChild(growBtn);
  growRow.appendChild(rerollBtn);
  root.appendChild(growRow);

  const sliders: { spec: (typeof PARAM_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of PARAM_SPECS) {
    const built = buildSlider(spec, params, callbacks.onParamChange);
    sliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  const seedRow = document.createElement("div");
  seedRow.className = "row";
  const seedLabel = document.createElement("label");
  seedLabel.textContent = "シード";
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.value = params.seed;
  seedInput.onchange = () => callbacks.onParamChange("seed", seedInput.value);
  seedRow.appendChild(seedLabel);
  seedRow.appendChild(seedInput);
  root.appendChild(seedRow);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent =
    "クリック: 雲の表面に球を追加 / 既存の球をクリックで選択。ドラッグ: 選択中の球を移動。Delete: 選択を削除。";
  root.appendChild(hint);

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "選択を削除 (Delete)";
  deleteBtn.onclick = () => callbacks.onDeleteSelected();
  root.appendChild(deleteBtn);

  const selectionInfo = document.createElement("div");
  selectionInfo.className = "selection-info";
  selectionInfo.textContent = "選択なし";
  root.appendChild(selectionInfo);

  // --- Per-ball editor (shown only while a ball is selected) ----------------
  const ballEditor = document.createElement("div");
  ballEditor.className = "ball-editor";
  ballEditor.hidden = true;

  const ballEditorTitle = document.createElement("div");
  ballEditorTitle.className = "ball-editor-title";
  ballEditorTitle.textContent = "選択中の球";
  ballEditor.appendChild(ballEditorTitle);

  // radius slider for this ball
  const rRow = document.createElement("div");
  rRow.className = "row slider-row";
  const rLabel = document.createElement("label");
  rLabel.textContent = "この球の半径";
  const rSlider = document.createElement("input");
  rSlider.type = "range";
  rSlider.min = "0.05";
  rSlider.max = "2";
  rSlider.step = "0.01";
  const rOut = document.createElement("span");
  rOut.className = "value-out";
  rSlider.oninput = () => {
    const v = Number(rSlider.value);
    rOut.textContent = v.toFixed(2);
    callbacks.onBallRadiusChange(v);
  };
  rRow.appendChild(rLabel);
  rRow.appendChild(rSlider);
  rRow.appendChild(rOut);
  ballEditor.appendChild(rRow);

  // precise x/y/z numeric inputs (drag is coarse; these are exact)
  const posRow = document.createElement("div");
  posRow.className = "row pos-row";
  const posInputs: Record<"x" | "y" | "z", HTMLInputElement> = {} as never;
  for (const axis of ["x", "y", "z"] as const) {
    const field = document.createElement("label");
    field.className = "pos-field";
    field.textContent = axis.toUpperCase();
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.05";
    input.oninput = () => callbacks.onBallPositionChange(axis, Number(input.value));
    field.appendChild(input);
    posRow.appendChild(field);
    posInputs[axis] = input;
  }
  ballEditor.appendChild(posRow);
  root.appendChild(ballEditor);

  const sep = document.createElement("hr");
  root.appendChild(sep);

  const historyRow = document.createElement("div");
  historyRow.className = "row";
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "履歴を書き出す (Export JSON)";
  exportBtn.onclick = () => callbacks.onExport();
  historyRow.appendChild(exportBtn);
  root.appendChild(historyRow);

  const importRow = document.createElement("div");
  importRow.className = "row";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.onchange = () => {
    const file = importInput.files?.[0];
    if (file) callbacks.onImportFile(file);
    importInput.value = "";
  };
  importRow.appendChild(importInput);
  root.appendChild(importRow);

  const meshPanel = document.createElement("div");
  meshPanel.className = "mesh-export";

  const meshTitle = document.createElement("div");
  meshTitle.className = "mesh-export-title";
  meshTitle.textContent = "3Dデータ";
  meshPanel.appendChild(meshTitle);

  const sizeRow = document.createElement("div");
  sizeRow.className = "row mesh-row";
  const sizeLabel = document.createElement("label");
  sizeLabel.textContent = "最長辺 mm";
  const sizeInput = document.createElement("input");
  sizeInput.type = "number";
  sizeInput.min = "10";
  sizeInput.max = "240";
  sizeInput.step = "1";
  sizeInput.value = "80";
  sizeRow.appendChild(sizeLabel);
  sizeRow.appendChild(sizeInput);
  meshPanel.appendChild(sizeRow);

  const resolutionRow = document.createElement("div");
  resolutionRow.className = "row mesh-row";
  const resolutionLabel = document.createElement("label");
  resolutionLabel.textContent = "解像度";
  const resolutionInput = document.createElement("input");
  resolutionInput.type = "range";
  resolutionInput.min = "32";
  resolutionInput.max = "192";
  resolutionInput.step = "16";
  resolutionInput.value = "96";
  const resolutionOut = document.createElement("span");
  resolutionOut.className = "value-out";
  resolutionOut.textContent = resolutionInput.value;
  resolutionInput.oninput = () => {
    resolutionOut.textContent = resolutionInput.value;
  };
  resolutionRow.appendChild(resolutionLabel);
  resolutionRow.appendChild(resolutionInput);
  resolutionRow.appendChild(resolutionOut);
  meshPanel.appendChild(resolutionRow);

  const meshButtonRow = document.createElement("div");
  meshButtonRow.className = "row";
  const inspectMeshBtn = document.createElement("button");
  inspectMeshBtn.textContent = "メッシュを検査";
  inspectMeshBtn.onclick = () => callbacks.onMeshInspect(readMeshOptions());
  const exportMeshBtn = document.createElement("button");
  exportMeshBtn.textContent = "3Dデータで書き出す";
  exportMeshBtn.onclick = () => callbacks.onMeshExport(readMeshOptions());
  meshButtonRow.appendChild(inspectMeshBtn);
  meshButtonRow.appendChild(exportMeshBtn);
  meshPanel.appendChild(meshButtonRow);

  const meshStatus = document.createElement("div");
  meshStatus.className = "mesh-status";
  meshStatus.textContent = "未検査";
  meshPanel.appendChild(meshStatus);
  root.appendChild(meshPanel);

  const clearBtn = document.createElement("button");
  clearBtn.className = "danger";
  clearBtn.textContent = "すべて消去 (Clear)";
  clearBtn.onclick = () => callbacks.onClear();
  root.appendChild(clearBtn);

  const historyCount = document.createElement("div");
  historyCount.className = "history-count";
  root.appendChild(historyCount);

  const fps = document.createElement("div");
  fps.className = "fps";
  root.appendChild(fps);

  const katachiControls = document.createElement("div");
  katachiControls.className = "workspace-controls katachi-controls";
  let remaining = versionRow.nextSibling;
  while (remaining) {
    const next = remaining.nextSibling;
    katachiControls.appendChild(remaining);
    remaining = next;
  }
  root.appendChild(katachiControls);

  let hikariState = { ...initialHikari };
  const hikariControls = document.createElement("div");
  hikariControls.className = "workspace-controls hikari-controls";

  const sourceInfo = document.createElement("div");
  sourceInfo.className = "hikari-source";
  sourceInfo.textContent = "同じ場を観察中";
  hikariControls.appendChild(sourceInfo);

  const caseTitle = document.createElement("div");
  caseTitle.className = "hikari-section-title";
  caseTitle.textContent = "記録";
  hikariControls.appendChild(caseTitle);
  const caseIdInput = document.createElement("input");
  caseIdInput.type = "text";
  caseIdInput.value = `hikari-${new Date().toISOString().slice(0, 10)}`;
  caseIdInput.placeholder = "case ID";
  hikariControls.appendChild(caseIdInput);
  const observationInput = document.createElement("textarea");
  observationInput.placeholder = "観察メモ（任意）";
  observationInput.rows = 2;
  hikariControls.appendChild(observationInput);
  const caseSave = document.createElement("button");
  caseSave.type = "button";
  caseSave.textContent = "この景色を保存";
  caseSave.onclick = () => callbacks.onHikariCaseSave({ caseId: caseIdInput.value.trim() || "hikari-case", observation: observationInput.value });
  hikariControls.appendChild(caseSave);
  const caseOpen = document.createElement("button");
  caseOpen.type = "button";
  caseOpen.textContent = "caseを開く";
  const caseFile = document.createElement("input");
  caseFile.type = "file";
  caseFile.accept = "application/json,.json";
  caseFile.hidden = true;
  caseOpen.onclick = () => caseFile.click();
  caseFile.onchange = () => { const file = caseFile.files?.[0]; if (file) callbacks.onHikariCaseImportFile(file); caseFile.value = ""; };
  hikariControls.appendChild(caseOpen);
  hikariControls.appendChild(caseFile);
  const caseStatus = document.createElement("div");
  caseStatus.className = "hint";
  hikariControls.appendChild(caseStatus);

  const blenderTitle = document.createElement("div");
  blenderTitle.className = "hikari-section-title";
  blenderTitle.textContent = "Blenderへ渡す";
  hikariControls.appendChild(blenderTitle);

  const blenderSizeRow = document.createElement("div");
  blenderSizeRow.className = "row mesh-row";
  const blenderSizeLabel = document.createElement("label");
  blenderSizeLabel.textContent = "実物の最長辺 mm";
  const blenderSizeInput = document.createElement("input");
  blenderSizeInput.type = "number";
  blenderSizeInput.min = "10";
  blenderSizeInput.max = "10000";
  blenderSizeInput.step = "1";
  blenderSizeInput.value = "80";
  blenderSizeRow.appendChild(blenderSizeLabel);
  blenderSizeRow.appendChild(blenderSizeInput);
  hikariControls.appendChild(blenderSizeRow);

  const blenderResolutionRow = document.createElement("div");
  blenderResolutionRow.className = "row mesh-row";
  const blenderResolutionLabel = document.createElement("label");
  blenderResolutionLabel.textContent = "形のなめらかさ";
  const blenderResolutionInput = document.createElement("input");
  blenderResolutionInput.type = "range";
  blenderResolutionInput.min = "32";
  blenderResolutionInput.max = "192";
  blenderResolutionInput.step = "16";
  blenderResolutionInput.value = "96";
  const blenderResolutionOut = document.createElement("span");
  blenderResolutionOut.className = "value-out";
  blenderResolutionOut.textContent = blenderResolutionInput.value;
  blenderResolutionInput.oninput = () => {
    blenderResolutionOut.textContent = blenderResolutionInput.value;
  };
  blenderResolutionRow.appendChild(blenderResolutionLabel);
  blenderResolutionRow.appendChild(blenderResolutionInput);
  blenderResolutionRow.appendChild(blenderResolutionOut);
  hikariControls.appendChild(blenderResolutionRow);

  const blenderExportButton = document.createElement("button");
  blenderExportButton.type = "button";
  blenderExportButton.textContent = "Blender用一式を書き出す";
  blenderExportButton.onclick = () => callbacks.onBlenderExport({
    caseId: caseIdInput.value.trim() || "hikari-case",
    observation: observationInput.value,
    options: {
      resolution: Number(blenderResolutionInput.value),
      targetLongestMm: Number(blenderSizeInput.value),
    },
  });
  hikariControls.appendChild(blenderExportButton);

  const blenderExportStatus = document.createElement("div");
  blenderExportStatus.className = "hint";
  blenderExportStatus.textContent = "v0.20: 形・実寸・素材・内包・床・太陽・カメラを、Blender用の軸変換と一緒に渡します";
  hikariControls.appendChild(blenderExportStatus);

  const hikariControlSyncers: Array<(settings: HikariSettings) => void> = [];

  const phenomenonTitle = document.createElement("div");
  phenomenonTitle.className = "hikari-section-title";
  phenomenonTitle.textContent = "現象";
  hikariControls.appendChild(phenomenonTitle);
  const phenomenonControl = createSegmentedControl<HikariPhenomenon>(
    ["flow", "optics"],
    hikariState.phenomenon,
    (phenomenon) => {
      applyPhenomenon(phenomenon);
      updateHikari({ phenomenon });
    },
  );
  hikariControls.appendChild(phenomenonControl.root);
  hikariControlSyncers.push((settings) => phenomenonControl.set(settings.phenomenon));

  const flowControls = document.createElement("div");
  flowControls.className = "hikari-mode-controls";

  const displayTitle = document.createElement("div");
  displayTitle.className = "hikari-section-title";
  displayTitle.textContent = "表示";
  flowControls.appendChild(displayTitle);
  const modeControl = createSegmentedControl<HikariMode>(
    ["points", "trails", "density"],
    hikariState.mode,
    (mode) => updateHikari({ mode }),
  );
  flowControls.appendChild(modeControl.root);
  hikariControlSyncers.push((settings) => modeControl.set(settings.mode));

  const spawnTitle = document.createElement("div");
  spawnTitle.className = "hikari-section-title";
  spawnTitle.textContent = "粒子の発生";
  flowControls.appendChild(spawnTitle);
  const spawnControl = createSegmentedControl<HikariSpawn>(
    ["surface", "inside"],
    hikariState.spawn,
    (spawn) => updateHikari({ spawn }),
  );
  flowControls.appendChild(spawnControl.root);
  hikariControlSyncers.push((settings) => spawnControl.set(settings.spawn));

  const hikariSliders: Array<{
    key: keyof Pick<
      HikariSettings,
      "particleCount" | "speed" | "curl" | "trailLength" | "particleSize" | "exposure" | "blur"
    >;
    label: string;
    min: number;
    max: number;
    step: number;
  }> = [
    { key: "particleCount", label: "粒子数", min: 500, max: 12000, step: 250 },
    { key: "speed", label: "速さ", min: 0, max: 3, step: 0.05 },
    { key: "curl", label: "渦", min: 0, max: 2.5, step: 0.05 },
    { key: "trailLength", label: "軌跡の長さ", min: 2, max: 24, step: 1 },
    { key: "particleSize", label: "粒子サイズ", min: 0.5, max: 6, step: 0.1 },
    { key: "exposure", label: "露光", min: 0.1, max: 3, step: 0.05 },
    { key: "blur", label: "にじみ", min: 0, max: 12, step: 0.25 },
  ];
  for (const spec of hikariSliders) {
    const built = createSlider({
      label: spec.label,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      initial: hikariState[spec.key],
      format: (value) => (spec.step >= 1 ? value.toFixed(0) : value.toFixed(2)),
      onChange: (value) => updateHikari({ [spec.key]: value }),
    });
    flowControls.appendChild(built.row);
    hikariControlSyncers.push((settings) => built.set(settings[spec.key]));
  }

  const hikariSeedRow = document.createElement("div");
  hikariSeedRow.className = "row";
  const hikariSeedLabel = document.createElement("label");
  hikariSeedLabel.textContent = "Hikari Seed";
  const hikariSeedInput = document.createElement("input");
  hikariSeedInput.type = "text";
  hikariSeedInput.value = hikariState.seed;
  hikariSeedInput.onchange = () => updateHikari({ seed: hikariSeedInput.value });
  hikariSeedRow.appendChild(hikariSeedLabel);
  hikariSeedRow.appendChild(hikariSeedInput);
  flowControls.appendChild(hikariSeedRow);
  hikariControlSyncers.push((settings) => { hikariSeedInput.value = settings.seed; });

  const approximationNote = document.createElement("div");
  approximationNote.className = "hint";
  approximationNote.textContent =
    "v0.1: 現在の球場から粒子を近似サンプリングしています。Surface はSDFへ投影、Insideは球体積に基づくため、均一密度ではありません。";
  flowControls.appendChild(approximationNote);
  hikariControls.appendChild(flowControls);

  const opticsControls = document.createElement("div");
  opticsControls.className = "hikari-mode-controls";
  const opticalSourceInfo = document.createElement("div");
  opticalSourceInfo.className = "hikari-source";
  opticalSourceInfo.textContent = "LIGHT SOURCE — SUN / 平行光場";
  opticsControls.appendChild(opticalSourceInfo);

  const opticsComputeStatus = document.createElement("div");
  opticsComputeStatus.className = "optics-compute-status";
  opticsComputeStatus.dataset.kind = "checking";
  opticsComputeStatus.textContent = "GPUを確認中";
  opticsControls.appendChild(opticsComputeStatus);

  const daylightTitle = document.createElement("div");
  daylightTitle.className = "hikari-section-title";
  daylightTitle.textContent = "自然光";
  opticsControls.appendChild(daylightTitle);
  const daylightModeControl = createSegmentedControl<DaylightMode>(
    ["tokyo", "manual"],
    hikariState.daylightMode,
    (daylightMode) => {
      const next = { ...hikariState, daylightMode };
      applyDaylightVisibility(next);
      updateHikari({ daylightMode });
    },
    { tokyo: "東京の日時", manual: "手動" },
  );
  opticsControls.appendChild(daylightModeControl.root);

  const tokyoDaylightControls = document.createElement("div");
  const daylightDateRow = document.createElement("div");
  daylightDateRow.className = "row";
  const daylightDateLabel = document.createElement("label");
  daylightDateLabel.textContent = "東京の日付";
  const daylightDateInput = document.createElement("input");
  daylightDateInput.type = "date";
  daylightDateInput.value = hikariState.daylightDate;
  daylightDateInput.onchange = () => {
    const next = { ...hikariState, daylightDate: daylightDateInput.value };
    updateDaylightReadout(next);
    updateHikari({ daylightDate: daylightDateInput.value });
  };
  daylightDateRow.appendChild(daylightDateLabel);
  daylightDateRow.appendChild(daylightDateInput);
  tokyoDaylightControls.appendChild(daylightDateRow);
  const daylightTime = createSlider({
    label: "東京の時刻",
    min: 0,
    max: 1439,
    step: 5,
    initial: hikariState.daylightMinutes,
    format: formatMinutes,
    onChange: (daylightMinutes) => {
      const next = { ...hikariState, daylightMinutes };
      updateDaylightReadout(next);
      updateHikari({ daylightMinutes });
    },
  });
  tokyoDaylightControls.appendChild(daylightTime.row);
  opticsControls.appendChild(tokyoDaylightControls);
  const daylightReadout = document.createElement("div");
  daylightReadout.className = "hint";
  opticsControls.appendChild(daylightReadout);
  let manualLightAngleRow: HTMLElement | null = null;
  function updateDaylightReadout(settings: HikariSettings): void {
    const daylight = resolveDaylight(settings);
    daylightReadout.textContent = daylight.label;
    opticalSourceInfo.textContent = daylight.mode === "tokyo"
      ? "LIGHT SOURCE — TOKYO SUN / 平行光場"
      : "LIGHT SOURCE — MANUAL SUN / 平行光場";
  }
  function applyDaylightVisibility(settings: HikariSettings): void {
    tokyoDaylightControls.style.display = settings.daylightMode === "tokyo" ? "" : "none";
    if (manualLightAngleRow) manualLightAngleRow.style.display = settings.daylightMode === "manual" ? "" : "none";
    updateDaylightReadout(settings);
  }
  applyDaylightVisibility(hikariState);
  hikariControlSyncers.push((settings) => {
    daylightModeControl.set(settings.daylightMode);
    daylightDateInput.value = settings.daylightDate;
    daylightTime.set(settings.daylightMinutes);
    applyDaylightVisibility(settings);
  });

  const opticalViewTitle = document.createElement("div");
  opticalViewTitle.className = "hikari-section-title";
  opticalViewTitle.textContent = "観察";
  opticsControls.appendChild(opticalViewTitle);
  const opticalViewControl = createSegmentedControl<OpticalView>(
    ["natural", "analysis"],
    hikariState.opticalView,
    (opticalView) => updateHikari({ opticalView }),
  );
  opticsControls.appendChild(opticalViewControl.root);
  hikariControlSyncers.push((settings) => opticalViewControl.set(settings.opticalView));

  const opticalColorTitle = document.createElement("div");
  opticalColorTitle.className = "hikari-section-title";
  opticalColorTitle.textContent = "色";
  opticsControls.appendChild(opticalColorTitle);
  const opticalColorControl = createSegmentedControl<OpticalColorMode>(
    ["color", "mono"],
    hikariState.opticalColorMode,
    (opticalColorMode) => updateHikari({ opticalColorMode }),
  );
  opticsControls.appendChild(opticalColorControl.root);
  hikariControlSyncers.push((settings) => opticalColorControl.set(settings.opticalColorMode));

  let applyRainbowModelVisibility = (_model: OpticalRainbowModel): void => {};
  const rainbowModelTitle = document.createElement("div");
  rainbowModelTitle.className = "hikari-section-title";
  rainbowModelTitle.textContent = "虹のしくみ";
  opticsControls.appendChild(rainbowModelTitle);
  const rainbowModelControl = createSegmentedControl<OpticalRainbowModel>(
    ["prism", "stress", "both"],
    hikariState.rainbowModel,
    (rainbowModel) => {
      applyRainbowModelVisibility(rainbowModel);
      updateHikari({ rainbowModel });
    },
  );
  opticsControls.appendChild(rainbowModelControl.root);
  hikariControlSyncers.push((settings) => rainbowModelControl.set(settings.rainbowModel));

  const dispersionModeGroup = document.createElement("div");
  const dispersionModeTitle = document.createElement("div");
  dispersionModeTitle.className = "hikari-section-title";
  dispersionModeTitle.textContent = "プリズムの範囲";
  dispersionModeGroup.appendChild(dispersionModeTitle);
  const dispersionModeControl = createSegmentedControl<OpticalDispersionMode>(
    ["local", "global"],
    hikariState.dispersionMode,
    (dispersionMode) => updateHikari({ dispersionMode }),
  );
  dispersionModeGroup.appendChild(dispersionModeControl.root);
  opticsControls.appendChild(dispersionModeGroup);
  hikariControlSyncers.push((settings) => dispersionModeControl.set(settings.dispersionMode));

  const hostPresetTitle = document.createElement("div");
  hostPresetTitle.className = "hikari-section-title";
  hostPresetTitle.textContent = "外側の色";
  opticsControls.appendChild(hostPresetTitle);
  const hostPresetControl = createSegmentedControl<OpticalHostPreset>(
    ["clear", "amber", "dark"],
    hikariState.hostPreset,
    (hostPreset) => updateHikari({ hostPreset }),
    { clear: "透明", amber: "琥珀", dark: "濃色" },
  );
  opticsControls.appendChild(hostPresetControl.root);
  hikariControlSyncers.push((settings) => hostPresetControl.set(settings.hostPreset));

  const inclusionControls = document.createElement("div");
  const inclusionToggle = document.createElement("button");
  inclusionToggle.type = "button";
  inclusionToggle.className = "optical-ray-toggle";
  const applyInclusionVisibility = (enabled: boolean): void => {
    inclusionToggle.classList.toggle("active", enabled);
    inclusionToggle.textContent = `無色の内包 ${enabled ? "ON" : "OFF"}`;
    inclusionToggle.setAttribute("aria-pressed", String(enabled));
    inclusionControls.style.display = enabled ? "" : "none";
  };
  applyInclusionVisibility(hikariState.inclusionEnabled);
  inclusionToggle.onclick = () => {
    const enabled = !hikariState.inclusionEnabled;
    applyInclusionVisibility(enabled);
    updateHikari({ inclusionEnabled: enabled });
  };
  opticsControls.appendChild(inclusionToggle);

  const inclusionSliders: Array<{
    key: keyof Pick<
      HikariSettings,
      | "inclusionIor"
      | "inclusionAbsorption"
      | "inclusionOffsetX"
      | "inclusionOffsetY"
      | "inclusionOffsetZ"
      | "inclusionRadius"
    >;
    label: string;
    min: number;
    max: number;
    step: number;
  }> = [
    { key: "inclusionIor", label: "内包の屈折率", min: 1, max: 1.8, step: 0.001 },
    { key: "inclusionAbsorption", label: "内包の吸収", min: 0, max: 2.5, step: 0.01 },
    { key: "inclusionOffsetX", label: "内包 X", min: -1.5, max: 1.5, step: 0.01 },
    { key: "inclusionOffsetY", label: "内包 Y", min: -1.5, max: 1.5, step: 0.01 },
    { key: "inclusionOffsetZ", label: "内包 Z", min: -1.5, max: 1.5, step: 0.01 },
    { key: "inclusionRadius", label: "内包の大きさ", min: 0.12, max: 1.2, step: 0.01 },
  ];
  for (const spec of inclusionSliders) {
    const built = createSlider({
      label: spec.label,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      initial: hikariState[spec.key],
      format: (value) => (spec.key === "inclusionIor" ? value.toFixed(3) : value.toFixed(2)),
      onChange: (value) => updateHikari({ [spec.key]: value }),
    });
    inclusionControls.appendChild(built.row);
    hikariControlSyncers.push((settings) => built.set(settings[spec.key]));
  }
  opticsControls.appendChild(inclusionControls);
  hikariControlSyncers.push((settings) => applyInclusionVisibility(settings.inclusionEnabled));

  const materialTitle = document.createElement("div");
  materialTitle.className = "hikari-section-title";
  materialTitle.textContent = "物質";
  opticsControls.appendChild(materialTitle);

  let setIorSlider: ((value: number) => void) | null = null;
  const materialControl = createSegmentedControl<OpticalMaterial>(
    ["water", "glass"],
    hikariState.opticalMaterial,
    (opticalMaterial) => {
      const ior = opticalMaterial === "water" ? 1.333 : 1.5;
      setIorSlider?.(ior);
      updateHikari({ opticalMaterial, ior });
    },
  );
  opticsControls.appendChild(materialControl.root);
  hikariControlSyncers.push((settings) => materialControl.set(settings.opticalMaterial));

  const opticalDisplayTitle = document.createElement("div");
  opticalDisplayTitle.className = "hikari-section-title";
  opticalDisplayTitle.textContent = "光の表示";
  opticsControls.appendChild(opticalDisplayTitle);
  const rayToggle = document.createElement("button");
  rayToggle.type = "button";
  rayToggle.className = "optical-ray-toggle";
  const applyRayVisibility = (visible: boolean): void => {
    rayToggle.classList.toggle("active", visible);
    rayToggle.textContent = `光線表示 ${visible ? "ON" : "OFF"}`;
    rayToggle.setAttribute("aria-pressed", String(visible));
  };
  applyRayVisibility(hikariState.opticalDisplay === "both");
  rayToggle.onclick = () => {
    const visible = hikariState.opticalDisplay !== "both";
    applyRayVisibility(visible);
    updateHikari({ opticalDisplay: visible ? "both" : "density" });
  };
  opticsControls.appendChild(rayToggle);
  hikariControlSyncers.push((settings) => applyRayVisibility(settings.opticalDisplay === "both"));

  const opticalSliders: Array<{
    key: keyof Pick<
      HikariSettings,
      | "ior"
      | "lightAngle"
      | "lightWidth"
      | "opticalRayCount"
      | "opticalSampleCount"
      | "absorption"
      | "causticStrength"
      | "skyIntensity"
      | "sunIntensity"
      | "sunSize"
      | "groundReflectance"
      | "opticalExposure"
      | "surfaceRoughness"
      | "surfaceVariation"
      | "materialVariation"
      | "materialScale"
      | "environmentContrast"
      | "environmentRotation"
      | "environmentMist"
      | "dispersion"
      | "stressAmount"
      | "polarization"
    >;
    label: string;
    min: number;
    max: number;
    step: number;
  }> = [
    { key: "ior", label: "屈折率", min: 1.01, max: 1.8, step: 0.001 },
    { key: "dispersion", label: "プリズム", min: 0, max: 1, step: 0.01 },
    { key: "stressAmount", label: "硬化応力", min: 0, max: 1, step: 0.01 },
    { key: "polarization", label: "偏光", min: 0, max: 1, step: 0.01 },
    { key: "surfaceRoughness", label: "表面の粗さ", min: 0, max: 0.65, step: 0.01 },
    { key: "surfaceVariation", label: "表面の揺らぎ", min: 0, max: 0.4, step: 0.01 },
    { key: "materialVariation", label: "内部のむら", min: 0, max: 1, step: 0.01 },
    { key: "materialScale", label: "むらの大きさ", min: 0.25, max: 3, step: 0.05 },
    { key: "lightAngle", label: "光の角度", min: -70, max: 70, step: 1 },
    { key: "lightWidth", label: "光場の幅", min: 0.45, max: 1.8, step: 0.05 },
    { key: "opticalRayCount", label: "表示する光線", min: 8, max: 120, step: 4 },
    {
      key: "opticalSampleCount",
      label: "計算する光",
      min: 4096,
      max: 131072,
      step: 4096,
    },
    { key: "absorption", label: "吸収", min: 0, max: 2.5, step: 0.05 },
    { key: "causticStrength", label: "光溜まり", min: 0.2, max: 2.5, step: 0.05 },
    { key: "environmentContrast", label: "環境のコントラスト", min: 0, max: 2, step: 0.05 },
    { key: "environmentRotation", label: "環境の回転 °", min: -180, max: 180, step: 1 },
    { key: "environmentMist", label: "靄", min: 0, max: 1, step: 0.01 },
    { key: "skyIntensity", label: "空の明るさ", min: 0.1, max: 2.5, step: 0.05 },
    { key: "sunIntensity", label: "太陽の強さ", min: 0, max: 3, step: 0.05 },
    { key: "sunSize", label: "光源の広がり °", min: 0.1, max: 30, step: 0.1 },
    { key: "groundReflectance", label: "地面の反射", min: 0.05, max: 1.5, step: 0.05 },
    { key: "opticalExposure", label: "露出", min: 0.25, max: 2.5, step: 0.05 },
  ];
  const prismRows: HTMLElement[] = [];
  const stressRows: HTMLElement[] = [];
  for (const spec of opticalSliders) {
    const built = createSlider({
      label: spec.label,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      initial: hikariState[spec.key],
      format: (value) =>
        spec.key === "ior"
          ? value.toFixed(3)
          : spec.step >= 1
            ? value.toFixed(0)
            : value.toFixed(2),
      onChange: (value) => updateHikari({ [spec.key]: value }),
    });
    if (spec.key === "ior") setIorSlider = built.set;
    if (spec.key === "dispersion") prismRows.push(built.row);
    if (spec.key === "stressAmount" || spec.key === "polarization") {
      stressRows.push(built.row);
    }
    opticsControls.appendChild(built.row);
    if (spec.key === "lightAngle") manualLightAngleRow = built.row;
    hikariControlSyncers.push((settings) => built.set(settings[spec.key]));
  }
  applyDaylightVisibility(hikariState);
  applyRainbowModelVisibility = (model) => {
    const prismVisible = model !== "stress";
    const stressVisible = model !== "prism";
    dispersionModeGroup.style.display = prismVisible ? "" : "none";
    for (const row of prismRows) {
      row.style.display = prismVisible ? "" : "none";
    }
    for (const row of stressRows) {
      row.style.display = stressVisible ? "" : "none";
    }
  };
  applyRainbowModelVisibility(hikariState.rainbowModel);

  const opticsNote = document.createElement("div");
  opticsNote.className = "hint";
  opticsNote.textContent =
    "v0.19.0: 東京の日付と時刻から太陽の方位・高度を変えられます。内包はまず一つの球で検証中です。CPUとWebGPUは同じ太陽方向と内包経路から床の集光を作ります。";
  opticsControls.appendChild(opticsNote);
  hikariControls.appendChild(opticsControls);

  function applyPhenomenon(phenomenon: HikariPhenomenon): void {
    flowControls.hidden = phenomenon !== "flow";
    opticsControls.hidden = phenomenon !== "optics";
  }
  applyPhenomenon(hikariState.phenomenon);
  root.appendChild(hikariControls);

  let currentView = initialView;
  const applyView = (view: WorkspaceView): void => {
    currentView = view;
    root.dataset.view = view;
    katachiButton.classList.toggle("active", view === "katachi");
    hikariButton.classList.toggle("active", view === "hikari");
    katachiControls.hidden = view !== "katachi";
    hikariControls.hidden = view !== "hikari";
  };
  katachiButton.onclick = () => {
    if (currentView === "katachi") return;
    applyView("katachi");
    callbacks.onViewChange("katachi");
  };
  hikariButton.onclick = () => {
    if (currentView === "hikari") return;
    applyView("hikari");
    callbacks.onViewChange("hikari");
  };
  applyView(initialView);

  container.appendChild(root);

  return {
    root,
    setSelectionInfo: (text) => {
      selectionInfo.textContent = text;
    },
    setHistoryCount: (n) => {
      historyCount.textContent = `操作履歴: ${n} 件`;
    },
    setFps: (f) => {
      fps.textContent = `~${f.toFixed(0)} fps`;
    },
    setBallEditor: (ball) => {
      if (!ball) {
        ballEditor.hidden = true;
        return;
      }
      ballEditor.hidden = false;
      // Don't clobber a control the user is actively holding/typing in.
      if (document.activeElement !== rSlider) {
        rSlider.value = String(ball.r);
        rOut.textContent = ball.r.toFixed(2);
      }
      for (const axis of ["x", "y", "z"] as const) {
        const input = posInputs[axis];
        if (document.activeElement !== input) input.value = ball[axis].toFixed(2);
      }
    },
    syncParams: (p) => {
      for (const { spec, set } of sliders) set(Number(p[spec.key]));
      seedInput.value = p.seed;
    },
    setMeshStatus: (text, ok) => {
      meshStatus.textContent = text;
      meshStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setView: applyView,
    setHikariSource: (text) => {
      sourceInfo.textContent = text;
    },
    setHikariCaseStatus: (text, ok) => {
      caseStatus.textContent = text;
      caseStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setBlenderExportStatus: (text, ok) => {
      blenderExportStatus.textContent = text;
      blenderExportStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    syncHikariCaseDetails: (details) => {
      caseIdInput.value = details.caseId;
      observationInput.value = details.observation;
    },
    syncHikariSettings: (settings) => {
      hikariState = { ...settings };
      for (const sync of hikariControlSyncers) sync(hikariState);
      applyPhenomenon(hikariState.phenomenon);
      applyRainbowModelVisibility(hikariState.rainbowModel);
    },
    setOpticsComputeStatus: (status) => {
      opticsComputeStatus.textContent = status.text;
      opticsComputeStatus.dataset.kind = status.kind;
    },
  };

  function updateHikari(patch: Partial<HikariSettings>): void {
    hikariState = { ...hikariState, ...patch };
    callbacks.onHikariChange({ ...hikariState });
  }

  function readMeshOptions(): MeshExportUiOptions {
    return {
      resolution: Number(resolutionInput.value),
      targetLongestMm: Number(sizeInput.value),
    };
  }
}

function createSegmentedControl<T extends string>(
  values: readonly T[],
  initial: T,
  onChange: (value: T) => void,
  labels: Partial<Record<T, string>> = {},
): { root: HTMLElement; set: (value: T) => void } {
  const root = document.createElement("div");
  root.className = "segmented-control";
  const buttons = new Map<T, HTMLButtonElement>();
  const set = (value: T): void => {
    for (const [candidate, button] of buttons) {
      button.classList.toggle("active", candidate === value);
    }
  };
  for (const value of values) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = labels[value] ?? value;
    button.onclick = () => {
      set(value);
      onChange(value);
    };
    buttons.set(value, button);
    root.appendChild(button);
  }
  set(initial);
  return { root, set };
}

function buildSlider(
  spec: (typeof PARAM_SPECS)[number],
  params: FieldParams,
  onChange: UiCallbacks["onParamChange"],
): { row: HTMLElement; set: (v: number) => void } {
  const initial = Number(params[spec.key]);
  return createSlider({
    label: spec.label,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    initial,
    formatInitial: String,
    formatInput: (value) => value.toFixed(2),
    format: (value) => (spec.step >= 1 ? String(value) : value.toFixed(2)),
    onChange: (value) => onChange(spec.key, value),
  });
}

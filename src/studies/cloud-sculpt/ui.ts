// ---------------------------------------------------------------------------
// Minimal DOM control panel: sliders for the field params (つまみ), buttons
// for history export/import and clearing, and the Version/UpdatedAt strip
// required by ~/Projects/AGENTS.md UI rules.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "./field.ts";
import { createVersionRow } from "../../lib/ui/version.ts";

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
  callbacks: UiCallbacks,
): UiHandles {
  const root = document.createElement("div");
  root.className = "panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "雲をこねる — Cloud Sculpt";
  root.appendChild(title);

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
  };

  function readMeshOptions(): MeshExportUiOptions {
    return {
      resolution: Number(resolutionInput.value),
      targetLongestMm: Number(sizeInput.value),
    };
  }
}

function buildSlider(
  spec: (typeof PARAM_SPECS)[number],
  params: FieldParams,
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
  valueOut.textContent = String(params[spec.key]);

  slider.oninput = () => {
    const value = Number(slider.value);
    valueOut.textContent = value.toFixed(2);
    onChange(spec.key, value);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(valueOut);

  const set = (v: number) => {
    slider.value = String(v);
    valueOut.textContent = spec.step >= 1 ? String(v) : v.toFixed(2);
  };
  return { row, set };
}

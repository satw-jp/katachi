// ---------------------------------------------------------------------------
// Control panel for S2: the same つまみ/球 editor as S1 (cloud-sculpt/ui.ts),
// plus a "接地させる" button and a permanent approximation-honesty banner
// (AGENTS §1 正直な計算 — never optional). A plain link back to S1 sits at
// the top instead of a hub screen (T2-gravity.md: 凝ったハブ画面は作らない).
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "../cloud-sculpt/field.ts";
import { createSlider } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";

export interface UiCallbacks {
  onParamChange: (key: keyof FieldParams, value: number | string) => void;
  onGrow: () => void;
  onReroll: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  onBallRadiusChange: (r: number) => void;
  onBallPositionChange: (axis: "x" | "y" | "z", value: number) => void;
  onSnapToGround: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export interface UiHandles {
  root: HTMLElement;
  setSelectionInfo: (text: string) => void;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  setBallEditor: (ball: Ball | null) => void;
  syncParams: (params: FieldParams) => void;
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
  // Permanent approximation-honesty banner (T2-gravity.md §3 — "画面のどこか
  // に常設で小さく"). Placed over the viewport, not inside the scroll panel,
  // so it can never be scrolled out of sight.
  const banner = document.createElement("div");
  banner.className = "approx-banner";
  banner.textContent =
    "粗い近似: 質量の流れ ÷ 接続断面積。FEM ではない。実物の保証はしない。（S3 で実物と校正予定）";
  container.appendChild(banner);

  const root = document.createElement("div");
  root.className = "panel";

  const navRow = document.createElement("div");
  navRow.className = "nav-row";
  const nav = document.createElement("a");
  nav.className = "nav-link";
  nav.href = "./index.html";
  nav.textContent = "← S1 雲をこねる";
  navRow.appendChild(nav);
  const navSag = document.createElement("a");
  navSag.className = "nav-link";
  navSag.href = "./sag.html";
  navSag.textContent = "S2b たわむ →";
  navRow.appendChild(navSag);
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
  const navInteriorGrowth = document.createElement("a");
  navInteriorGrowth.className = "nav-link";
  navInteriorGrowth.href = "./interior-growth.html";
  navInteriorGrowth.textContent = "S-interior-growth 内部から育つ →";
  navRow.appendChild(navInteriorGrowth);
  root.appendChild(navRow);

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "重力を入れる — Gravity";
  root.appendChild(title);

  const versionRow = createVersionRow(version, updatedAt);
  root.appendChild(versionRow);

  const groundRow = document.createElement("div");
  groundRow.className = "row";
  const groundBtn = document.createElement("button");
  groundBtn.textContent = "接地させる (Snap to Ground)";
  groundBtn.title = "雲の最下点が y=0 に触れるよう、全体を上下に動かします";
  groundBtn.onclick = () => callbacks.onSnapToGround();
  groundRow.appendChild(groundBtn);
  root.appendChild(groundRow);

  const growRow = document.createElement("div");
  growRow.className = "row";
  const growBtn = document.createElement("button");
  growBtn.textContent = "育て直す (Grow)";
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

  const ballEditor = document.createElement("div");
  ballEditor.className = "ball-editor";
  ballEditor.hidden = true;

  const ballEditorTitle = document.createElement("div");
  ballEditorTitle.className = "ball-editor-title";
  ballEditorTitle.textContent = "選択中の球";
  ballEditor.appendChild(ballEditorTitle);

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
  };
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

// ---------------------------------------------------------------------------
// Control panel for S2b: S1/S2's つまみ + ball editor shape, plus the one
// knob (柔らかさ — label unchanged by T2c per instructions: "相" naming is
// deferred to T2d), a ghost toggle, the permanent approximation banner text
// (T2b-sag.md §4, extended by T2c-liquid-freeze.md §3 with a line about the
// liquid end being a surface-tension sketch), and — new in T2c — the
// "凍らせる (Freeze)" button.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import type { SagParams } from "./params.ts";

export interface UiCallbacks {
  onParamChange: (key: keyof SagParams, value: number | string) => void;
  onGrow: () => void;
  onReroll: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  onBallRadiusChange: (r: number) => void;
  onBallPositionChange: (axis: "x" | "y" | "z", value: number) => void;
  onGhostToggle: (enabled: boolean) => void;
  onFreeze: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export interface UiHandles {
  root: HTMLElement;
  setSelectionInfo: (text: string) => void;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  setBallEditor: (ball: Ball | null) => void;
  syncParams: (params: SagParams) => void;
  setBrokenNote: (n: number) => void;
}

const FIELD_PARAM_SPECS: {
  key: keyof SagParams;
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

const SOFTNESS_SPEC = { key: "softness" as const, label: "柔らかさ (0=剛 / 1=柔)", min: 0, max: 1, step: 0.01 };

export function buildUi(
  container: HTMLElement,
  params: SagParams,
  version: string,
  updatedAt: string,
  callbacks: UiCallbacks,
): UiHandles {
  // Permanent approximation-honesty banner — never scrolls away (AGENTS §1,
  // T2b-sag.md §4). Same placement pattern as S2's banner.
  const banner = document.createElement("div");
  banner.className = "approx-banner";
  banner.textContent =
    "粗い近似: バネの素描。弾性論ではない。実物の保証はしない。（S3 で実物と校正予定）" +
    " 液体は表面張力の素描。流体力学ではない。";
  container.appendChild(banner);

  const root = document.createElement("div");
  root.className = "panel";

  const navRow = document.createElement("div");
  navRow.className = "nav-row";
  const navBack = document.createElement("a");
  navBack.className = "nav-link";
  navBack.href = "./gravity.html";
  navBack.textContent = "← S2 重力を入れる";
  navRow.appendChild(navBack);
  const navMpm = document.createElement("a");
  navMpm.className = "nav-link";
  navMpm.href = "./mpm.html";
  navMpm.textContent = "S2c 本物を混ぜる (MPM) →";
  navRow.appendChild(navMpm);
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
  title.textContent = "たわむ — Sag";
  root.appendChild(title);

  const versionRow = document.createElement("div");
  versionRow.className = "version-row";
  versionRow.textContent = `v${version} · updated ${updatedAt}`;
  root.appendChild(versionRow);

  // --- Softness: the one new knob, given its own visually distinct row ---
  const softnessSep = document.createElement("div");
  softnessSep.className = "section-label";
  softnessSep.textContent = "材料の場";
  root.appendChild(softnessSep);
  const softnessBuilt = buildSlider(SOFTNESS_SPEC, params, callbacks.onParamChange);
  root.appendChild(softnessBuilt.row);

  const ghostRow = document.createElement("div");
  ghostRow.className = "row";
  const ghostLabel = document.createElement("label");
  ghostLabel.className = "checkbox-label";
  const ghostCheckbox = document.createElement("input");
  ghostCheckbox.type = "checkbox";
  ghostCheckbox.checked = true;
  ghostCheckbox.onchange = () => callbacks.onGhostToggle(ghostCheckbox.checked);
  ghostLabel.appendChild(ghostCheckbox);
  ghostLabel.appendChild(document.createTextNode(" 休み形をゴーストで重ねる"));
  ghostRow.appendChild(ghostLabel);
  root.appendChild(ghostRow);

  const brokenNote = document.createElement("div");
  brokenNote.className = "broken-note";
  brokenNote.hidden = true;
  root.appendChild(brokenNote);

  // T2c: freeze bakes the current たわみ into the正本 and zeroes softness
  // ("固体 = どの力にももう従わない" — RESEARCH v2 Y5). Placed right under
  // the softness knob it consumes, so the "液体→凍らせる" gesture reads as
  // one motion.
  const freezeRow = document.createElement("div");
  freezeRow.className = "row";
  const freezeBtn = document.createElement("button");
  freezeBtn.textContent = "凍らせる (Freeze)";
  freezeBtn.title = "たわみ形を正本に焼き付け、柔らかさを0に戻します";
  freezeBtn.onclick = () => callbacks.onFreeze();
  freezeRow.appendChild(freezeBtn);
  root.appendChild(freezeRow);

  const genSep = document.createElement("div");
  genSep.className = "section-label";
  genSep.textContent = "場の生成";
  root.appendChild(genSep);

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

  const sliders: { spec: (typeof FIELD_PARAM_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of FIELD_PARAM_SPECS) {
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
    "こねる操作はたわんだ表示の上から行い、休み形（正本）を編集します。クリック: 表面に球を追加 / 既存の球を選択。ドラッグ: 選択中の球を移動。Delete: 選択を削除。";
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
  ballEditorTitle.textContent = "選択中の球（休み形）";
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
      softnessBuilt.set(p.softness);
      seedInput.value = p.seed;
    },
    setBrokenNote: (n) => {
      if (n <= 0) {
        brokenNote.hidden = true;
        return;
      }
      brokenNote.hidden = false;
      brokenNote.textContent = `壊れた: ${n} 球のバネが伸び切りました（最大の苦しさ色で表示）`;
    },
  };
}

function buildSlider(
  spec: { key: keyof SagParams; label: string; min: number; max: number; step: number },
  params: SagParams,
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

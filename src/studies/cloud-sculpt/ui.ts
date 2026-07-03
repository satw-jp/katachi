// ---------------------------------------------------------------------------
// Minimal DOM control panel: sliders for the field params (つまみ), buttons
// for history export/import and clearing, and the Version/UpdatedAt strip
// required by ~/Projects/AGENTS.md UI rules.
// ---------------------------------------------------------------------------

import type { FieldParams } from "./field.ts";

export interface UiCallbacks {
  onParamChange: (key: keyof FieldParams, value: number | string) => void;
  onGrow: () => void;
  onReroll: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export interface UiHandles {
  root: HTMLElement;
  setSelectionInfo: (text: string) => void;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  /** Push current param values back into the sliders/seed input (after import / reroll). */
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
  const root = document.createElement("div");
  root.className = "panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "雲をこねる — Cloud Sculpt";
  root.appendChild(title);

  const versionRow = document.createElement("div");
  versionRow.className = "version-row";
  versionRow.textContent = `v${version} · updated ${updatedAt}`;
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
  seedInput.oninput = () => callbacks.onParamChange("seed", seedInput.value);
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

// ---------------------------------------------------------------------------
// Foam's control panel. Structurally mirrors cloud-sculpt/ui.ts (sliders,
// export/import, mesh panel, Version/UpdatedAt strip) but adds the
// opening/thickness knobs and an "S1 recipe を読み込む" file input, and
// drops the per-ball editor (no per-ball picking in this Study; see
// docs/tasks/T7-foam-cells.md "やらないこと").
// ---------------------------------------------------------------------------

import type { FieldParams } from "../cloud-sculpt/field.ts";
import type { FoamParams } from "./cell.ts";

export interface FoamUiCallbacks {
  onFieldParamChange: (key: keyof FieldParams, value: number | string) => void;
  onFoamParamChange: (key: keyof FoamParams, value: number) => void;
  onGrow: () => void;
  onReroll: () => void;
  onClear: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onImportS1File: (file: File) => void;
  onMeshInspect: (options: FoamMeshUiOptions) => void;
  onMeshExport: (options: FoamMeshUiOptions) => void;
}

export interface FoamUiHandles {
  root: HTMLElement;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  setBallCount: (n: number) => void;
  syncFieldParams: (params: FieldParams) => void;
  syncFoamParams: (params: FoamParams) => void;
  setMeshStatus: (text: string, ok?: boolean) => void;
}

export interface FoamMeshUiOptions {
  resolution: number;
  targetLongestMm: number;
}

const FIELD_SPECS: { key: keyof FieldParams; label: string; min: number; max: number; step: number }[] = [
  { key: "count", label: "球の数", min: 1, max: 40, step: 1 },
  { key: "radiusBase", label: "半径", min: 0.15, max: 1.5, step: 0.01 },
  { key: "radiusSpread", label: "半径のばらつき", min: 0, max: 1.5, step: 0.01 },
  { key: "k", label: "ブレンド強さ k", min: 0, max: 1.5, step: 0.01 },
];

const FOAM_SPECS: { key: keyof FoamParams; label: string; min: number; max: number; step: number }[] = [
  { key: "opening", label: "開口 (0=殻 / 1=糸)", min: 0, max: 1, step: 0.01 },
  { key: "thickness", label: "厚み", min: 0.005, max: 0.3, step: 0.005 },
];

export function buildFoamUi(
  container: HTMLElement,
  fieldParams: FieldParams,
  foamParams: FoamParams,
  version: string,
  updatedAt: string,
  callbacks: FoamUiCallbacks,
): FoamUiHandles {
  const root = document.createElement("div");
  root.className = "panel";

  const navRow = document.createElement("div");
  navRow.className = "nav-row";
  const navHome = document.createElement("a");
  navHome.className = "nav-link";
  navHome.href = "./index.html";
  navHome.textContent = "← S1 雲をこねる";
  navRow.appendChild(navHome);
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
  title.textContent = "泡のセル — Foam Cells";
  root.appendChild(title);

  const banner = document.createElement("div");
  banner.className = "approx-banner";
  banner.textContent =
    "同じ雲(球のリスト)をセルに分解し、開口一本で 体積→穴あき殻→糸 を掃引します。糸=泡のPlateau境界。";
  root.appendChild(banner);

  const versionRow = document.createElement("div");
  versionRow.className = "version-row";
  versionRow.textContent = `v${version} · updated ${updatedAt}`;
  root.appendChild(versionRow);

  const ballCount = document.createElement("div");
  ballCount.className = "ball-count";
  root.appendChild(ballCount);

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

  const fieldSliders: { spec: (typeof FIELD_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of FIELD_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, fieldParams[spec.key] as number, (v) =>
      callbacks.onFieldParamChange(spec.key, v),
    );
    fieldSliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  const seedRow = document.createElement("div");
  seedRow.className = "row";
  const seedLabel = document.createElement("label");
  seedLabel.textContent = "シード";
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.value = fieldParams.seed;
  seedInput.onchange = () => callbacks.onFieldParamChange("seed", seedInput.value);
  seedRow.appendChild(seedLabel);
  seedRow.appendChild(seedInput);
  root.appendChild(seedRow);

  const sep0 = document.createElement("hr");
  root.appendChild(sep0);

  const foamTitle = document.createElement("div");
  foamTitle.className = "mesh-export-title";
  foamTitle.textContent = "泡のつまみ";
  root.appendChild(foamTitle);

  const foamSliders: { spec: (typeof FOAM_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of FOAM_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, foamParams[spec.key], (v) =>
      callbacks.onFoamParamChange(spec.key, v),
    );
    foamSliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  const sep1 = document.createElement("hr");
  root.appendChild(sep1);

  const s1ImportRow = document.createElement("div");
  s1ImportRow.className = "row";
  const s1ImportLabel = document.createElement("label");
  s1ImportLabel.textContent = "S1 レシピを読み込む";
  s1ImportLabel.className = "file-label";
  const s1ImportInput = document.createElement("input");
  s1ImportInput.type = "file";
  s1ImportInput.accept = "application/json";
  s1ImportInput.onchange = () => {
    const file = s1ImportInput.files?.[0];
    if (file) callbacks.onImportS1File(file);
    s1ImportInput.value = "";
  };
  s1ImportRow.appendChild(s1ImportLabel);
  s1ImportRow.appendChild(s1ImportInput);
  root.appendChild(s1ImportRow);

  const sep2 = document.createElement("hr");
  root.appendChild(sep2);

  const historyRow = document.createElement("div");
  historyRow.className = "row";
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "履歴を書き出す (Export JSON)";
  exportBtn.onclick = () => callbacks.onExport();
  historyRow.appendChild(exportBtn);
  root.appendChild(historyRow);

  const importRow = document.createElement("div");
  importRow.className = "row";
  const importLabel = document.createElement("label");
  importLabel.textContent = "foam 履歴を読み込む";
  importLabel.className = "file-label";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.onchange = () => {
    const file = importInput.files?.[0];
    if (file) callbacks.onImportFile(file);
    importInput.value = "";
  };
  importRow.appendChild(importLabel);
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
  resolutionInput.max = "256";
  resolutionInput.step = "16";
  resolutionInput.value = "128";
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

  const meshHint = document.createElement("div");
  meshHint.className = "hint";
  meshHint.textContent =
    "糸(開口が高い状態)は解像度が低いと千切れます。千切れたら水密検査がそのまま NG を表示します。";
  meshPanel.appendChild(meshHint);

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
    setHistoryCount: (n) => {
      historyCount.textContent = `操作履歴: ${n} 件`;
    },
    setFps: (f) => {
      fps.textContent = `~${f.toFixed(0)} fps`;
    },
    setBallCount: (n) => {
      ballCount.textContent = `球: ${n}`;
    },
    syncFieldParams: (p) => {
      for (const { spec, set } of fieldSliders) set(Number(p[spec.key]));
      seedInput.value = p.seed;
    },
    syncFoamParams: (p) => {
      for (const { spec, set } of foamSliders) set(p[spec.key]);
    },
    setMeshStatus: (text, ok) => {
      meshStatus.textContent = text;
      meshStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
  };

  function readMeshOptions(): FoamMeshUiOptions {
    return {
      resolution: Number(resolutionInput.value),
      targetLongestMm: Number(sizeInput.value),
    };
  }
}

function buildSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  onChange: (v: number) => void,
): { row: HTMLElement; set: (v: number) => void } {
  const row = document.createElement("div");
  row.className = "row slider-row";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(initial);

  const valueOut = document.createElement("span");
  valueOut.className = "value-out";
  valueOut.textContent = step >= 1 ? String(initial) : initial.toFixed(3);

  slider.oninput = () => {
    const value = Number(slider.value);
    valueOut.textContent = step >= 1 ? String(value) : value.toFixed(3);
    onChange(value);
  };

  row.appendChild(labelEl);
  row.appendChild(slider);
  row.appendChild(valueOut);

  const set = (v: number) => {
    slider.value = String(v);
    valueOut.textContent = step >= 1 ? String(v) : v.toFixed(3);
  };
  return { row, set };
}

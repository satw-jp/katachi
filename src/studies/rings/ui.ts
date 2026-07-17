// ---------------------------------------------------------------------------
// Control panel: ring-add knobs, ring list (select/duplicate/delete), the
// selected ring's move/rotate editor, the linking-number instrument table,
// overlap warnings, history export/import, S1 recipe export, mesh export,
// and the Version/UpdatedAt strip (~/Projects/AGENTS.md UI rule).
// ---------------------------------------------------------------------------

import type { LinkingRow, OverlapWarning } from "./linking.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import type { RingGroup, RingRecipe } from "./ring.ts";

export type DragMode = "move" | "rotate";

export interface UiCallbacks {
  onAddRing: () => void;
  onRingRecipeFieldChange: (key: keyof RingRecipe, value: number | string) => void;
  onAxisPresetChange: (preset: "x" | "y" | "z") => void;
  onKChange: (value: number) => void;
  onSelectRing: (ringId: number | null) => void;
  onDuplicateRing: (ringId: number) => void;
  onDeleteRing: (ringId: number) => void;
  onDragModeChange: (mode: DragMode) => void;
  onRotateNudge: (axis: "x" | "y" | "z", angleDeg: number) => void;
  onClear: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onExportS1: () => void;
  onMeshInspect: (options: MeshUiOptions) => void;
  onMeshExport: (options: MeshUiOptions) => void;
}

export interface MeshUiOptions {
  resolution: number;
  targetLongestMm: number;
}

export interface UiHandles {
  root: HTMLElement;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  setBallCount: (n: number, maxBalls: number) => void;
  setRings: (groups: RingGroup[], selectedId: number | null) => void;
  setLinking: (rows: LinkingRow[], warnings: OverlapWarning[]) => void;
  setMeshStatus: (text: string, ok?: boolean) => void;
  syncRecipeDraft: (recipe: RingRecipe) => void;
  syncK: (k: number) => void;
}

const RECIPE_SPECS: {
  key: keyof RingRecipe;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "R", label: "輪の半径 R", min: 0.2, max: 3, step: 0.01 },
  { key: "n", label: "節の数 n", min: 3, max: 40, step: 1 },
  { key: "r", label: "球の太さ r", min: 0.03, max: 0.5, step: 0.005 },
  { key: "wobbleR", label: "太さのふわつき", min: 0, max: 1, step: 0.01 },
  { key: "wobblePos", label: "位置のふわつき", min: 0, max: 1, step: 0.01 },
];

export function buildRingsUi(
  container: HTMLElement,
  initialRecipe: RingRecipe,
  initialK: number,
  version: string,
  updatedAt: string,
  callbacks: UiCallbacks,
): UiHandles {
  const root = document.createElement("div");
  root.className = "panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "輪の手 — Ring Hand (S-rings)";
  root.appendChild(title);

  const navLinks: [string, string][] = [
    ["./index.html", "S1 雲をこねる →"],
    ["./gravity.html", "S2 重力を入れる →"],
    ["./sag.html", "S2b たわむ →"],
    ["./mpm.html", "S2c 本物を混ぜる (MPM) →"],
    ["./foam.html", "S-foam 泡のセル →"],
    ["./pack.html", "S-pack 虚を詰める →"],
    ["./skin.html", "S-skin 表面に詰める →"],
  ];
  for (const [href, label] of navLinks) {
    const a = document.createElement("a");
    a.className = "nav-link";
    a.href = href;
    a.textContent = label;
    root.appendChild(a);
  }

  const versionRow = createVersionRow(version, updatedAt);
  root.appendChild(versionRow);

  // --- Add ring ------------------------------------------------------------
  const addTitle = document.createElement("div");
  addTitle.className = "section-title";
  addTitle.textContent = "輪を追加";
  root.appendChild(addTitle);

  const recipeSliders: { spec: (typeof RECIPE_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of RECIPE_SPECS) {
    const built = buildSlider(spec, initialRecipe, (v) => callbacks.onRingRecipeFieldChange(spec.key, v));
    recipeSliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  const seedRow = document.createElement("div");
  seedRow.className = "row";
  const seedLabel = document.createElement("label");
  seedLabel.textContent = "シード";
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.value = initialRecipe.seed;
  seedInput.onchange = () => callbacks.onRingRecipeFieldChange("seed", seedInput.value);
  seedRow.appendChild(seedLabel);
  seedRow.appendChild(seedInput);
  root.appendChild(seedRow);

  const axisRow = document.createElement("div");
  axisRow.className = "row";
  const axisLabel = document.createElement("label");
  axisLabel.textContent = "向き";
  const axisSelect = document.createElement("select");
  const axisOptions: [string, string][] = [
    ["z", "水平 (XY面, 軸=Z)"],
    ["y", "縦・前向き (XZ面, 軸=Y)"],
    ["x", "縦・横向き (YZ面, 軸=X)"],
  ];
  for (const [value, label] of axisOptions) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    axisSelect.appendChild(opt);
  }
  axisSelect.onchange = () => callbacks.onAxisPresetChange(axisSelect.value as "x" | "y" | "z");
  axisRow.appendChild(axisLabel);
  axisRow.appendChild(axisSelect);
  root.appendChild(axisRow);

  const addBtn = document.createElement("button");
  addBtn.textContent = "輪を追加 (Add Ring)";
  addBtn.onclick = () => callbacks.onAddRing();
  root.appendChild(addBtn);

  const sep0 = document.createElement("hr");
  root.appendChild(sep0);

  // --- Field-level blend k ---------------------------------------------------
  const kRow = document.createElement("div");
  kRow.className = "row slider-row";
  const kLabel = document.createElement("label");
  kLabel.textContent = "ブレンド強さ k";
  const kSlider = document.createElement("input");
  kSlider.type = "range";
  kSlider.min = "0";
  kSlider.max = "0.6";
  kSlider.step = "0.01";
  kSlider.value = String(initialK);
  const kOut = document.createElement("span");
  kOut.className = "value-out";
  kOut.textContent = initialK.toFixed(2);
  kSlider.oninput = () => {
    const v = Number(kSlider.value);
    kOut.textContent = v.toFixed(2);
    callbacks.onKChange(v);
  };
  kRow.appendChild(kLabel);
  kRow.appendChild(kSlider);
  kRow.appendChild(kOut);
  root.appendChild(kRow);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent =
    "クリック: 球をクリックでその球が属する輪を単位として選択。ドラッグ: 下の「移動/回転」モードに従って選択中の輪を動かす。Delete: 選択中の輪を削除。";
  root.appendChild(hint);

  // --- Drag mode toggle ------------------------------------------------------
  const modeRow = document.createElement("div");
  modeRow.className = "row mode-row";
  const moveModeBtn = document.createElement("button");
  moveModeBtn.textContent = "移動モード";
  moveModeBtn.classList.add("mode-active");
  const rotateModeBtn = document.createElement("button");
  rotateModeBtn.textContent = "回転モード";
  moveModeBtn.onclick = () => {
    callbacks.onDragModeChange("move");
    moveModeBtn.classList.add("mode-active");
    rotateModeBtn.classList.remove("mode-active");
  };
  rotateModeBtn.onclick = () => {
    callbacks.onDragModeChange("rotate");
    rotateModeBtn.classList.add("mode-active");
    moveModeBtn.classList.remove("mode-active");
  };
  modeRow.appendChild(moveModeBtn);
  modeRow.appendChild(rotateModeBtn);
  root.appendChild(modeRow);

  const rotateNudgeTitle = document.createElement("div");
  rotateNudgeTitle.className = "hint";
  rotateNudgeTitle.textContent = "数値で回転（選択中の輪、ワールド軸まわり・15度刻み）:";
  root.appendChild(rotateNudgeTitle);
  const nudgeRow = document.createElement("div");
  nudgeRow.className = "row nudge-row";
  for (const axis of ["x", "y", "z"] as const) {
    const minus = document.createElement("button");
    minus.textContent = `${axis.toUpperCase()} -15°`;
    minus.onclick = () => callbacks.onRotateNudge(axis, -15);
    const plus = document.createElement("button");
    plus.textContent = `${axis.toUpperCase()} +15°`;
    plus.onclick = () => callbacks.onRotateNudge(axis, 15);
    nudgeRow.appendChild(minus);
    nudgeRow.appendChild(plus);
  }
  root.appendChild(nudgeRow);

  const sep1 = document.createElement("hr");
  root.appendChild(sep1);

  // --- Ring list ---------------------------------------------------------
  const listTitle = document.createElement("div");
  listTitle.className = "section-title";
  listTitle.textContent = "輪の一覧";
  root.appendChild(listTitle);
  const ringList = document.createElement("div");
  ringList.className = "ring-list";
  root.appendChild(ringList);

  const sep2 = document.createElement("hr");
  root.appendChild(sep2);

  // --- Linking number instrument -------------------------------------------
  const linkTitle = document.createElement("div");
  linkTitle.className = "section-title";
  linkTitle.textContent = "絡み数（Gauss linking number）";
  root.appendChild(linkTitle);
  const linkTable = document.createElement("div");
  linkTable.className = "link-table";
  root.appendChild(linkTable);
  const warnBox = document.createElement("div");
  warnBox.className = "overlap-warnings";
  root.appendChild(warnBox);

  const sep3 = document.createElement("hr");
  root.appendChild(sep3);

  // --- History export / import ----------------------------------------------
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

  const s1Row = document.createElement("div");
  s1Row.className = "row";
  const s1Btn = document.createElement("button");
  s1Btn.textContent = "S1 レシピで書き出す (球のみ)";
  s1Btn.title = "グループ情報は落ちます。S1 で開くと同じ雲として STL 化できます。";
  s1Btn.onclick = () => callbacks.onExportS1();
  s1Row.appendChild(s1Btn);
  root.appendChild(s1Row);

  // --- Mesh export ---------------------------------------------------------
  const meshPanel = document.createElement("div");
  meshPanel.className = "mesh-export";

  const meshTitle = document.createElement("div");
  meshTitle.className = "mesh-export-title";
  meshTitle.textContent = "3Dデータ（S1と同じ書き出し）";
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
  exportMeshBtn.textContent = "3Dデータで書き出す (STL/OBJ)";
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

  const ballCount = document.createElement("div");
  ballCount.className = "history-count";
  root.appendChild(ballCount);

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
    setBallCount: (n, maxBalls) => {
      ballCount.textContent =
        n > maxBalls
          ? `球: ${n} 個 ⚠ 画面は最初の${maxBalls}球のみ表示（3Dデータには全球含む）`
          : `球: ${n} 個`;
    },
    setRings: (groups, selectedId) => {
      ringList.innerHTML = "";
      if (groups.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = "輪はまだありません。";
        ringList.appendChild(empty);
        return;
      }
      for (const g of [...groups].sort((a, b) => a.id - b.id)) {
        const row = document.createElement("div");
        row.className = "ring-row" + (g.id === selectedId ? " selected" : "");
        const label = document.createElement("span");
        label.textContent = `輪 #${g.id} (${g.ballIds.length}球)`;
        label.className = "ring-label";
        label.onclick = () => callbacks.onSelectRing(g.id === selectedId ? null : g.id);
        const dup = document.createElement("button");
        dup.textContent = "複製";
        dup.onclick = () => callbacks.onDuplicateRing(g.id);
        const del = document.createElement("button");
        del.textContent = "削除";
        del.className = "danger";
        del.onclick = () => callbacks.onDeleteRing(g.id);
        row.appendChild(label);
        row.appendChild(dup);
        row.appendChild(del);
        ringList.appendChild(row);
      }
    },
    setLinking: (rows, warnings) => {
      linkTable.innerHTML = "";
      if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = "輪が2つ以上必要です。";
        linkTable.appendChild(empty);
      } else {
        for (const row of rows) {
          const line = document.createElement("div");
          line.className = "link-row" + (row.rounded !== 0 ? " linked" : "");
          line.textContent = `輪${row.ringA} と 輪${row.ringB}: 絡み ${row.rounded} (実測 ${row.raw.toFixed(3)})`;
          linkTable.appendChild(line);
        }
      }
      warnBox.innerHTML = "";
      for (const w of warnings) {
        const line = document.createElement("div");
        line.className = "overlap-warning";
        line.textContent = `⚠ 輪${w.ringA} と 輪${w.ringB}: 深いめり込み（融合。絡みでなく合体に見える可能性、重なり率 ${(w.worstOverlapFraction * 100).toFixed(0)}%）`;
        warnBox.appendChild(line);
      }
    },
    setMeshStatus: (text, ok) => {
      meshStatus.textContent = text;
      meshStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    syncRecipeDraft: (recipe) => {
      for (const { spec, set } of recipeSliders) set(Number(recipe[spec.key]));
      seedInput.value = recipe.seed;
    },
    syncK: (k) => {
      kSlider.value = String(k);
      kOut.textContent = k.toFixed(2);
    },
  };

  function readMeshOptions(): MeshUiOptions {
    return {
      resolution: Number(resolutionInput.value),
      targetLongestMm: Number(sizeInput.value),
    };
  }
}

function buildSlider(
  spec: (typeof RECIPE_SPECS)[number],
  recipe: RingRecipe,
  onChange: (v: number) => void,
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
  slider.value = String(recipe[spec.key]);

  const valueOut = document.createElement("span");
  valueOut.className = "value-out";
  valueOut.textContent = String(recipe[spec.key]);

  slider.oninput = () => {
    const value = Number(slider.value);
    valueOut.textContent = spec.step >= 1 ? String(value) : value.toFixed(3);
    onChange(value);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(valueOut);

  const set = (v: number) => {
    slider.value = String(v);
    valueOut.textContent = spec.step >= 1 ? String(v) : v.toFixed(3);
  };
  return { row, set };
}

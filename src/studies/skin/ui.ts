// ---------------------------------------------------------------------------
// Skin's control panel. Structurally mirrors pack/ui.ts (sliders, export/
// import, mesh panel, Version/UpdatedAt strip) with a host section, a skin
// (patch) section, a manual-patch toggle, gauges (mortar / coverage / patch
// components), and -- new for this Study -- the mode toggle (プレートが実 /
// 形態が実) that is T10's whole point.
// ---------------------------------------------------------------------------

import type { FieldParams } from "../cloud-sculpt/field.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import type { CoverageReport, MortarReport, PatchShape, SkinMode, SkinParams } from "./field.ts";
import type { PackPatchesResult } from "./field.ts";
import type { SkinLinkingReport, SkinOverlapWarning } from "./linking.ts";
import type { SkinViewMode } from "./renderer.ts";
import { PATCH_MAX_POINTS } from "./shaders.ts";

export interface UiCallbacks {
  onHostParamChange: (key: keyof FieldParams, value: number | string) => void;
  onGrowHost: () => void;
  onRerollHost: () => void;
  onImportS1File: (file: File) => void;
  onSkinParamChange: (key: keyof SkinParams, value: number | string) => void;
  onPackPatches: () => void;
  /** Switch the active viewport display (T12: raymarch / beads / full mesh). */
  onSetViewMode: (mode: SkinViewMode) => void;
  onClearPatches: () => void;
  onClearAll: () => void;
  onSetMode: (mode: SkinMode) => void;
  onToggleAddPatchMode: (active: boolean) => void;
  onManualRadiusChange: (r: number) => void;
  onDeleteSelectedPatch: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onMeshInspect: (options: MeshUiOptions) => void;
  onMeshExport: (options: MeshUiOptions) => void;
}

export interface UiHandles {
  root: HTMLElement;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  setCounts: (hostBalls: number, patches: number) => void;
  setSelectionInfo: (text: string) => void;
  setGauges: (
    mortar: MortarReport,
    coverage: CoverageReport,
    patchComponents: number,
    mmPerUnit: number,
    linking: SkinLinkingReport,
    overlaps: SkinOverlapWarning[],
  ) => void;
  setPackResult: (result: PackPatchesResult | null) => void;
  syncHostParams: (params: FieldParams) => void;
  syncSkinParams: (params: SkinParams) => void;
  setMode: (mode: SkinMode) => void;
  setAddPatchModeActive: (active: boolean) => void;
  setMeshStatus: (text: string, ok?: boolean) => void;
  /** Update the three-way view toggle's active button + honest caption
   * (approximation disclosure for beads, capacity note for raymarch). */
  setViewMode: (mode: SkinViewMode, totalPatchPoints: number) => void;
  /** Show/hide the "自動でビーズ表示に切り替えました" banner (T12 §2). */
  setAutoSwitchNotice: (active: boolean) => void;
  /** Re-render just the shape-selector buttons' active state (T12 bugfix --
   * clicking a shape button used to leave the OLD shape looking selected
   * until the next full syncSkinParams(), e.g. after a history import). */
  setPatchShape: (shape: PatchShape) => void;
  getMeshOptions: () => MeshUiOptions;
}

export interface MeshUiOptions {
  resolution: number;
  targetLongestMm: number;
}

const HOST_SPECS: { key: keyof FieldParams; label: string; min: number; max: number; step: number }[] = [
  { key: "count", label: "球の数", min: 1, max: 40, step: 1 },
  { key: "radiusBase", label: "半径", min: 0.15, max: 1.5, step: 0.01 },
  { key: "radiusSpread", label: "半径のばらつき", min: 0, max: 1.5, step: 0.01 },
  { key: "k", label: "ブレンド強さ k", min: 0, max: 1.5, step: 0.01 },
];

const SKIN_SPECS: { key: keyof SkinParams; label: string; min: number; max: number; step: number }[] = [
  { key: "thickness", label: "殻の厚み（プレート板厚）", min: 0.02, max: 0.4, step: 0.005 },
  { key: "minR", label: "パッチの大きさ 下限", min: 0.03, max: 0.4, step: 0.005 },
  { key: "maxR", label: "パッチの大きさ 上限", min: 0.06, max: 0.8, step: 0.01 },
  { key: "irregularity", label: "形の不揃い（コインのみ）", min: 0, max: 1, step: 0.01 },
  // T11 §2: negative side = 重なり許容（絡みの偶発装置）。
  { key: "gap", label: "目地 g（負=重なり許容）", min: -0.3, max: 0.3, step: 0.005 },
  { key: "attempts", label: "詰め込みの強さ (試行数)", min: 20, max: 4000, step: 20 },
  { key: "roundK", label: "丸さ k (合成の滑らかさ)", min: 0, max: 0.4, step: 0.005 },
];

const RING_SPECS: { key: keyof SkinParams; label: string; min: number; max: number; step: number }[] = [
  { key: "flatRingHoleRatio", label: "内孔率（平リングのみ）", min: 0, max: 0.95, step: 0.01 },
  { key: "ringNodeCount", label: "節数（リング系）", min: 4, max: 24, step: 1 },
  { key: "ringTubeR", label: "管太さ（立体リングのみ）", min: 0.01, max: 0.25, step: 0.005 },
  { key: "ringWobbleR", label: "太さのふわつき（リング系）", min: 0, max: 1, step: 0.01 },
  { key: "ringWobblePos", label: "位置のふわつき（立体リングのみ）", min: 0, max: 1, step: 0.01 },
];

const SHAPE_LABELS: [PatchShape, string][] = [
  ["coin", "コイン"],
  ["flatRing", "平リング"],
  ["ring3d", "立体リング"],
];

export function buildUi(
  container: HTMLElement,
  hostParams: FieldParams,
  skinParams: SkinParams,
  mode: SkinMode,
  version: string,
  updatedAt: string,
  callbacks: UiCallbacks,
): UiHandles {
  const root = document.createElement("div");
  root.className = "panel";

  const navRow = document.createElement("div");
  navRow.className = "nav-row";
  const navLinks: [string, string][] = [
    ["./index.html", "S1 雲をこねる"],
    ["./gravity.html", "S2 重力を入れる"],
    ["./sag.html", "S2b たわむ"],
    ["./mpm.html", "S2c 本物を混ぜる (MPM)"],
    ["./foam.html", "S-foam 泡のセル"],
    ["./rings.html", "S-rings 輪の手"],
    ["./pack.html", "S-pack 虚を詰める"],
  ];
  for (const [href, label] of navLinks) {
    const a = document.createElement("a");
    a.className = "nav-link";
    a.href = href;
    a.textContent = `${label} →`;
    navRow.appendChild(a);
  }
  root.appendChild(navRow);

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "表面に詰める — Surface Patch Packing (S-skin)";
  root.appendChild(title);

  const banner = document.createElement("div");
  banner.className = "approx-banner";
  banner.textContent =
    "実体（ホスト）の表面に不定形の閉パッチを目地つきで貪欲に詰めます。同じパッキングから、プレートが実（形態は暗示）と、殻に窓が開く版が出ます。";
  root.appendChild(banner);

  const versionRow = createVersionRow(version, updatedAt);
  root.appendChild(versionRow);

  const counts = document.createElement("div");
  counts.className = "ball-count";
  root.appendChild(counts);

  // --- Mode toggle (この Study の眼目) --------------------------------------
  const modeTitle = document.createElement("div");
  modeTitle.className = "section-title";
  modeTitle.textContent = "地と図の反転";
  root.appendChild(modeTitle);

  const modeToggle = document.createElement("div");
  modeToggle.className = "mode-toggle";
  const plateBtn = document.createElement("button");
  plateBtn.textContent = "プレートが実";
  plateBtn.onclick = () => callbacks.onSetMode("plate");
  const windowBtn = document.createElement("button");
  windowBtn.textContent = "形態が実（窓）";
  windowBtn.onclick = () => callbacks.onSetMode("window");
  modeToggle.appendChild(plateBtn);
  modeToggle.appendChild(windowBtn);
  root.appendChild(modeToggle);

  const modeExplainer = document.createElement("div");
  modeExplainer.className = "mode-explainer";
  root.appendChild(modeExplainer);
  function renderModeExplainer(m: SkinMode): void {
    modeExplainer.textContent =
      m === "plate"
        ? "殻 ∩ パッチ群。パッチだけが物体になり、形態そのものは印刷されません（バラバラの部品）。"
        : "殻 − パッチ群。パッチの場所に殻へ窓が開きます（同じ殻の一部として繋がったまま）。";
  }
  renderModeExplainer(mode);

  root.appendChild(document.createElement("hr"));

  // --- Host section ----------------------------------------------------
  const hostTitle = document.createElement("div");
  hostTitle.className = "section-title";
  hostTitle.textContent = "実体（ホスト）";
  root.appendChild(hostTitle);

  const growRow = document.createElement("div");
  growRow.className = "row";
  const growBtn = document.createElement("button");
  growBtn.textContent = "育て直す (Grow)";
  growBtn.onclick = () => callbacks.onGrowHost();
  const rerollBtn = document.createElement("button");
  rerollBtn.textContent = "シードを振る";
  rerollBtn.onclick = () => callbacks.onRerollHost();
  growRow.appendChild(growBtn);
  growRow.appendChild(rerollBtn);
  root.appendChild(growRow);

  const hostSliders: { spec: (typeof HOST_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of HOST_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, hostParams[spec.key] as number, (v) =>
      callbacks.onHostParamChange(spec.key, v),
    );
    hostSliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  const seedRow = document.createElement("div");
  seedRow.className = "row";
  const seedLabel = document.createElement("label");
  seedLabel.textContent = "シード";
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.value = hostParams.seed;
  seedInput.onchange = () => callbacks.onHostParamChange("seed", seedInput.value);
  seedRow.appendChild(seedLabel);
  seedRow.appendChild(seedInput);
  root.appendChild(seedRow);

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

  root.appendChild(document.createElement("hr"));

  // --- Skin (patch) section -----------------------------------------------
  const skinTitle = document.createElement("div");
  skinTitle.className = "section-title";
  skinTitle.textContent = "詰める（表面パッチのつまみ）";
  root.appendChild(skinTitle);

  // --- Patch shape (T11 §1) ------------------------------------------------
  const shapeRow = document.createElement("div");
  shapeRow.className = "mode-toggle";
  const shapeButtons: Record<PatchShape, HTMLButtonElement> = {} as Record<PatchShape, HTMLButtonElement>;
  for (const [shape, label] of SHAPE_LABELS) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => callbacks.onSkinParamChange("patchShape", shape);
    shapeButtons[shape] = btn;
    shapeRow.appendChild(btn);
  }
  root.appendChild(shapeRow);
  function renderShapeButtons(shape: PatchShape): void {
    for (const [s, btn] of Object.entries(shapeButtons) as [PatchShape, HTMLButtonElement][]) {
      btn.classList.toggle("mode-active", s === shape);
    }
  }
  renderShapeButtons(skinParams.patchShape);

  const shapeHint = document.createElement("div");
  shapeHint.className = "hint";
  shapeHint.textContent =
    "コイン=不定形の塊（従来どおり）。平リング=同心の内孔を持つ環状プレート（窓モードでO字窓）。立体リング=表面に接するトーラス（節のある球の鎖、S-rings と同じ語彙）。次の「詰める」または手動追加からこの形状が使われます。";
  root.appendChild(shapeHint);

  const skinSliders: { spec: (typeof SKIN_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of SKIN_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, skinParams[spec.key] as number, (v) =>
      callbacks.onSkinParamChange(spec.key, v),
    );
    skinSliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  const ringSlidersTitle = document.createElement("div");
  ringSlidersTitle.className = "section-title";
  ringSlidersTitle.textContent = "リング系のつまみ（平リング・立体リング）";
  root.appendChild(ringSlidersTitle);

  const ringSliders: { spec: (typeof RING_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of RING_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, skinParams[spec.key] as number, (v) =>
      callbacks.onSkinParamChange(spec.key, v),
    );
    ringSliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  const skinSeedRow = document.createElement("div");
  skinSeedRow.className = "row";
  const skinSeedLabel = document.createElement("label");
  skinSeedLabel.textContent = "詰めるシード";
  const skinSeedInput = document.createElement("input");
  skinSeedInput.type = "text";
  skinSeedInput.value = skinParams.seed;
  skinSeedInput.onchange = () => callbacks.onSkinParamChange("seed", skinSeedInput.value);
  skinSeedRow.appendChild(skinSeedLabel);
  skinSeedRow.appendChild(skinSeedInput);
  root.appendChild(skinSeedRow);

  const packBtnRow = document.createElement("div");
  packBtnRow.className = "row";
  const packBtn = document.createElement("button");
  packBtn.textContent = "詰める (Pack)";
  packBtn.title = "現在のパッチに加えて、表面へ貪欲にパッチを追加します";
  packBtn.onclick = () => callbacks.onPackPatches();
  const clearPatchesBtn = document.createElement("button");
  clearPatchesBtn.textContent = "パッチを消す";
  clearPatchesBtn.onclick = () => callbacks.onClearPatches();
  packBtnRow.appendChild(packBtn);
  packBtnRow.appendChild(clearPatchesBtn);
  root.appendChild(packBtnRow);

  const packResult = document.createElement("div");
  packResult.className = "hint";
  root.appendChild(packResult);

  // T12: 三択の表示モード（レイマーチ/ビーズ/全体メッシュ）。ビューポートの容量
  // 制限（先頭パッチ/点のみ描画、shaders.ts の PATCH_MAX_POINTS）で密な詰めが
  // 疎に見える問題への正直な出口 -- T11 は「全体メッシュ」の一本足だったが、
  // 重くてインタラクティブに確認できなかった（作者報告 2026-07-13「メッシュ確認
  // は重い」）。ビーズは InstancedMesh のため uniform 予算の制約を受けず、かつ
  // 通常の three.js シーンなのでオービット/ズームがそのままインタラクティブ。
  const viewTitle = document.createElement("div");
  viewTitle.className = "section-title";
  viewTitle.textContent = "表示モード";
  root.appendChild(viewTitle);

  const viewToggle = document.createElement("div");
  viewToggle.className = "mode-toggle";
  const viewButtons: Record<SkinViewMode, HTMLButtonElement> = {} as Record<SkinViewMode, HTMLButtonElement>;
  const VIEW_LABELS: [SkinViewMode, string][] = [
    ["raymarch", "レイマーチ"],
    ["beads", "ビーズ"],
    ["mesh", "全体メッシュ"],
  ];
  for (const [mode, label] of VIEW_LABELS) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => callbacks.onSetViewMode(mode);
    viewButtons[mode] = btn;
    viewToggle.appendChild(btn);
  }
  root.appendChild(viewToggle);

  const autoSwitchNotice = document.createElement("div");
  autoSwitchNotice.className = "hint auto-switch-notice";
  autoSwitchNotice.textContent =
    "⚠ 点群がレイマーチの表示容量を超えたため、自動でビーズ表示に切り替えました（先頭だけを黙って描く旧挙動は廃止）。";
  autoSwitchNotice.style.display = "none";
  root.appendChild(autoSwitchNotice);

  const viewCaption = document.createElement("div");
  viewCaption.className = "hint";
  root.appendChild(viewCaption);

  function renderViewMode(mode: SkinViewMode, totalPatchPoints: number): void {
    for (const [m, btn] of Object.entries(viewButtons) as [SkinViewMode, HTMLButtonElement][]) {
      btn.classList.toggle("mode-active", m === mode);
    }
    if (mode === "raymarch") {
      viewCaption.textContent =
        totalPatchPoints > PATCH_MAX_POINTS
          ? `レイマーチ: 食い込みなしで滑らかだが表示容量に上限あり（画面は先頭${PATCH_MAX_POINTS}点まで。全${totalPatchPoints}点は超過中 -- 「ビーズ」か「全体メッシュ」で全量を見てください）`
          : "レイマーチ: 食い込みなしで滑らかな合成場をそのまま描画（この点数では容量内）。";
    } else if (mode === "beads") {
      viewCaption.textContent =
        `ビーズ近似: ブレンド（smooth-min）省略・配置と密度は全量正確（全${totalPatchPoints}点）。リングは元々数珠なので見た目の乖離は小さいはずだが、コインの融合など見た目が変わる形状もある（README 参照）。容量の制約なしにオービット/ズームできる。`;
    } else {
      viewCaption.textContent = "全体メッシュ: STL と同じ実データ全部を lit mesh で表示（正確・やや重い）。編集操作をするとレイマーチ/ビーズへ自動的に戻ります。";
    }
  }

  const manualRow = document.createElement("div");
  manualRow.className = "row";
  const addPatchToggle = document.createElement("button");
  addPatchToggle.textContent = "パッチを手で追加 (クリック)";
  let addPatchActive = false;
  addPatchToggle.onclick = () => {
    addPatchActive = !addPatchActive;
    callbacks.onToggleAddPatchMode(addPatchActive);
  };
  manualRow.appendChild(addPatchToggle);
  root.appendChild(manualRow);

  const manualRadiusBuilt = buildSlider("手動のパッチ半径", 0.03, 0.8, 0.01, skinParams.maxR * 0.5, (v) =>
    callbacks.onManualRadiusChange(v),
  );
  root.appendChild(manualRadiusBuilt.row);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent =
    "「パッチを手で追加」を有効にしてホストの表面をクリックすると、その場所に手動のパッチを置きます。既存のパッチをクリックで選択、Delete で削除。";
  root.appendChild(hint);

  const deletePatchBtn = document.createElement("button");
  deletePatchBtn.textContent = "選択したパッチを削除 (Delete)";
  deletePatchBtn.onclick = () => callbacks.onDeleteSelectedPatch();
  root.appendChild(deletePatchBtn);

  const selectionInfo = document.createElement("div");
  selectionInfo.className = "selection-info";
  selectionInfo.textContent = "選択なし";
  root.appendChild(selectionInfo);

  root.appendChild(document.createElement("hr"));

  // --- Gauges (計器) -------------------------------------------------------
  const gaugesPanel = document.createElement("div");
  gaugesPanel.className = "gauges";
  const gaugesTitle = document.createElement("div");
  gaugesTitle.className = "gauges-title";
  gaugesTitle.textContent = "計器";
  gaugesPanel.appendChild(gaugesTitle);

  const mortarRow = document.createElement("div");
  mortarRow.className = "gauge-row";
  const mortarLabel = document.createElement("span");
  mortarLabel.textContent = "最薄の目地／プレート最小間隔";
  const mortarValue = document.createElement("span");
  mortarValue.className = "gauge-value";
  mortarRow.appendChild(mortarLabel);
  mortarRow.appendChild(mortarValue);
  gaugesPanel.appendChild(mortarRow);

  const coverageRow = document.createElement("div");
  coverageRow.className = "gauge-row";
  const coverageLabel = document.createElement("span");
  coverageLabel.textContent = "表面被覆率（粗い推定）";
  const coverageValue = document.createElement("span");
  coverageValue.className = "gauge-value";
  coverageRow.appendChild(coverageLabel);
  coverageRow.appendChild(coverageValue);
  gaugesPanel.appendChild(coverageRow);

  const componentsRow = document.createElement("div");
  componentsRow.className = "gauge-row";
  const componentsLabel = document.createElement("span");
  componentsLabel.textContent = "連結成分数（パッチ隣接の推定・プレート版）";
  const componentsValue = document.createElement("span");
  componentsValue.className = "gauge-value";
  componentsRow.appendChild(componentsLabel);
  componentsRow.appendChild(componentsValue);
  gaugesPanel.appendChild(componentsRow);

  const componentsHint = document.createElement("div");
  componentsHint.className = "hint";
  componentsHint.textContent =
    "上の連結成分数はパッチどうしの隣接から計算した速報値（プレート版向け）。実際に書き出したメッシュの部品数は「メッシュを検査」の結果に出ます。";
  gaugesPanel.appendChild(componentsHint);

  root.appendChild(gaugesPanel);

  // --- 絡み計器 (T11 §2, 立体リングの眼目) -----------------------------------
  const linkingPanel = document.createElement("div");
  linkingPanel.className = "gauges";
  const linkingTitle = document.createElement("div");
  linkingTitle.className = "gauges-title";
  linkingTitle.textContent = "絡み計器（立体リングの Gauss linking number）";
  linkingPanel.appendChild(linkingTitle);

  const linkedRatioRow = document.createElement("div");
  linkedRatioRow.className = "gauge-row";
  const linkedRatioLabel = document.createElement("span");
  linkedRatioLabel.textContent = "絡んだペア数 / 隣接ペア数";
  const linkedRatioValue = document.createElement("span");
  linkedRatioValue.className = "gauge-value";
  linkedRatioRow.appendChild(linkedRatioLabel);
  linkedRatioRow.appendChild(linkedRatioValue);
  linkingPanel.appendChild(linkedRatioRow);

  const linkingComponentsRow = document.createElement("div");
  linkingComponentsRow.className = "gauge-row";
  const linkingComponentsLabel = document.createElement("span");
  linkingComponentsLabel.textContent = "連結成分数（絡みで繋がった群）";
  const linkingComponentsValue = document.createElement("span");
  linkingComponentsValue.className = "gauge-value";
  linkingComponentsRow.appendChild(linkingComponentsLabel);
  linkingComponentsRow.appendChild(linkingComponentsValue);
  linkingPanel.appendChild(linkingComponentsRow);

  const linkingHint = document.createElement("div");
  linkingHint.className = "hint";
  linkingHint.textContent =
    "布になったか点在かの目安: 立体リングの数に対して連結成分数が小さいほど布に近い（1個なら全リングが一続き）。隣接ペアのみ Gauss linking number を計算（S-rings/linking.ts を流用、離散中点則）。";
  linkingPanel.appendChild(linkingHint);

  const overlapRow = document.createElement("div");
  overlapRow.className = "gauge-row";
  const overlapLabel = document.createElement("span");
  overlapLabel.textContent = "深いめり込み（融合）警告";
  const overlapValue = document.createElement("span");
  overlapValue.className = "gauge-value";
  overlapRow.appendChild(overlapLabel);
  overlapRow.appendChild(overlapValue);
  linkingPanel.appendChild(overlapRow);

  root.appendChild(linkingPanel);

  root.appendChild(document.createElement("hr"));

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
  importLabel.textContent = "skin 履歴を読み込む";
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
  sizeInput.oninput = () => refreshGaugesMm();
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
  resolutionInput.max = "224";
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

  const meshHint = document.createElement("div");
  meshHint.className = "hint";
  meshHint.textContent =
    "プレート版は分離部品のまま水密であることを検査します。窓版は殻自体が繋がったままか、部品数が正直に出ます。";
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

  const clearAllBtn = document.createElement("button");
  clearAllBtn.className = "danger";
  clearAllBtn.textContent = "すべて消去 (Clear All)";
  clearAllBtn.onclick = () => callbacks.onClearAll();
  root.appendChild(clearAllBtn);

  const historyCount = document.createElement("div");
  historyCount.className = "history-count";
  root.appendChild(historyCount);

  const fps = document.createElement("div");
  fps.className = "fps";
  root.appendChild(fps);

  container.appendChild(root);

  let lastMortar: MortarReport = { value: null, touching: false };
  let lastCoverage: CoverageReport = { coverage: 0, shellSamples: 0 };
  let lastComponents = 0;
  let lastMmPerUnit = 1;
  let lastLinking: SkinLinkingReport = { ringPatchCount: 0, adjacentPairs: 0, linkedPairs: 0, componentCount: 0, rows: [] };
  let lastOverlaps: SkinOverlapWarning[] = [];

  function refreshGaugesMm(): void {
    renderGauges(lastMortar, lastCoverage, lastComponents, lastMmPerUnit, lastLinking, lastOverlaps);
  }

  function renderGauges(
    mortar: MortarReport,
    coverage: CoverageReport,
    patchComponents: number,
    mmPerUnit: number,
    linking: SkinLinkingReport,
    overlaps: SkinOverlapWarning[],
  ): void {
    lastMortar = mortar;
    lastCoverage = coverage;
    lastComponents = patchComponents;
    lastMmPerUnit = mmPerUnit;
    lastLinking = linking;
    lastOverlaps = overlaps;
    if (mortar.value === null) {
      mortarValue.textContent = "— (パッチ2つ未満)";
      mortarRow.className = "gauge-row";
    } else {
      const mm = mortar.value * mmPerUnit;
      mortarValue.textContent = `${mortar.value.toFixed(3)} unit (${mm.toFixed(2)} mm)${
        mortar.touching ? " — 接触あり" : ""
      }`;
      mortarRow.className = mortar.touching ? "gauge-row warn" : "gauge-row ok";
    }
    const pct = (coverage.coverage * 100).toFixed(1);
    coverageValue.textContent = `${pct}% (殻サンプル ${coverage.shellSamples.toLocaleString()})`;
    coverageRow.className = "gauge-row";
    componentsValue.textContent = `${patchComponents}`;
    componentsRow.className = "gauge-row";

    if (linking.ringPatchCount === 0) {
      linkedRatioValue.textContent = "— (立体リングなし)";
      linkingComponentsValue.textContent = "—";
    } else {
      linkedRatioValue.textContent = `${linking.linkedPairs} / ${linking.adjacentPairs}`;
      linkingComponentsValue.textContent = `${linking.componentCount} (立体リング ${linking.ringPatchCount} 個中)`;
    }
    overlapValue.textContent = overlaps.length === 0 ? "なし" : `${overlaps.length} 組`;
    overlapRow.className = overlaps.length > 0 ? "gauge-row warn" : "gauge-row ok";
  }

  return {
    root,
    setHistoryCount: (n) => {
      historyCount.textContent = `操作履歴: ${n} 件`;
    },
    setFps: (f) => {
      fps.textContent = `~${f.toFixed(0)} fps`;
    },
    setCounts: (hostBalls, patches) => {
      counts.textContent = `ホスト球: ${hostBalls} / パッチ: ${patches}`;
    },
    setSelectionInfo: (text) => {
      selectionInfo.textContent = text;
    },
    setGauges: (mortar, coverage, patchComponents, mmPerUnit, linking, overlaps) =>
      renderGauges(mortar, coverage, patchComponents, mmPerUnit, linking, overlaps),
    setPackResult: (result) => {
      if (!result) {
        packResult.textContent = "";
        packResult.classList.remove("pack-saturated");
        return;
      }
      // 飽和の無言は禁止（作者報告 2026-07-13:「試行数を増やしても密度が変わらない」）。
      // 試行数は飽和を破れない — 破れるのは下限サイズと目地。なので処方箋まで言う。
      const saturated = result.stoppedEarly || result.placed === 0;
      packResult.textContent = saturated
        ? `詰めた: ${result.placed} 個追加（表面が飽和 — このパッチ下限サイズと目地ではもう入りません。` +
          `密度を上げるには「パッチの大きさ 下限」か「目地」を小さくしてください。試行数を増やしても飽和は破れません）`
        : `詰めた: ${result.placed} 個追加 / 棄却 ${result.triedAndRejected} 回`;
      packResult.classList.toggle("pack-saturated", saturated);
    },
    syncHostParams: (p) => {
      for (const { spec, set } of hostSliders) set(Number(p[spec.key]));
      seedInput.value = p.seed;
    },
    syncSkinParams: (p) => {
      for (const { spec, set } of skinSliders) set(Number(p[spec.key]));
      for (const { spec, set } of ringSliders) set(Number(p[spec.key]));
      skinSeedInput.value = p.seed;
      renderShapeButtons(p.patchShape);
    },
    setMode: (m) => {
      plateBtn.classList.toggle("mode-active", m === "plate");
      windowBtn.classList.toggle("mode-active", m === "window");
      renderModeExplainer(m);
    },
    setAddPatchModeActive: (active) => {
      addPatchActive = active;
      addPatchToggle.classList.toggle("active", active);
      addPatchToggle.textContent = active ? "パッチを手で追加 (有効・クリックで配置)" : "パッチを手で追加 (クリック)";
    },
    setViewMode: (mode, totalPatchPoints) => renderViewMode(mode, totalPatchPoints),
    setAutoSwitchNotice: (active) => {
      autoSwitchNotice.style.display = active ? "block" : "none";
    },
    setPatchShape: (shape) => renderShapeButtons(shape),
    setMeshStatus: (text, ok) => {
      meshStatus.textContent = text;
      meshStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    getMeshOptions: () => readMeshOptions(),
  };

  function readMeshOptions(): MeshUiOptions {
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

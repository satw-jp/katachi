// ---------------------------------------------------------------------------
// Pack's control panel. Structurally mirrors cloud-sculpt/ui.ts and
// foam/ui.ts (sliders, export/import, mesh panel, Version/UpdatedAt strip)
// with a host section, a pack (unit) section, a manual-unit toggle, and the
// gauges (thinnest wall / fill ratio) T9 §3 asks for.
//
// T14 additions: a unit-kind toggle (球 / 雲), the cloud-unit knobs (単位の
// 球数・半径ばらつき・単位の丸さ k — task doc §1), and an "S1 レシピを単位に
// する" file input (§2, registers a prototype). The cloud knobs are only
// shown while unit kind is "cloud" (they have no effect on sphere units, so
// showing them there would misrepresent what the knobs do).
// ---------------------------------------------------------------------------

import type { FieldParams } from "../cloud-sculpt/field.ts";
import { createSlider } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import type { PackMode, PackParams, ThinnestWallReport, FillReport, UnitKind } from "./field.ts";
import type { PackResult } from "./field.ts";
import type { PackViewMode } from "./renderer.ts";
import { VOID_MAX_BALLS, VOID_MAX_UNITS } from "./shaders.ts";

export interface UiCallbacks {
  onHostParamChange: (key: keyof FieldParams, value: number | string) => void;
  onGrowHost: () => void;
  onRerollHost: () => void;
  onImportS1File: (file: File) => void;
  onPackParamChange: (key: keyof PackParams, value: number | string | boolean) => void;
  onSetMode: (mode: PackMode) => void;
  /** T14: switch which kind of unit the packer places (recorded as setPackParam). */
  onSetUnitKind: (kind: UnitKind) => void;
  /** T15 §2: switch between random (T9 greedy) and grid placement (recorded
   * as setPackParam, same "reuse the generic op" convention as unit kind). */
  onSetPlacementMode: (mode: "random" | "grid") => void;
  /** T14 §2: register an S1 recipe as a unit origin shape (詰め材). */
  onImportPrototypeFile: (file: File) => void;
  /** Switch the active viewport display (T13: raymarch / beads / full mesh). */
  onSetViewMode: (mode: PackViewMode) => void;
  onPackUnits: () => void;
  onClearVoids: () => void;
  onClearAll: () => void;
  onToggleAddVoidMode: (active: boolean) => void;
  onManualRadiusChange: (r: number) => void;
  onDeleteSelectedUnit: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onMeshInspect: (options: MeshUiOptions) => void;
  onMeshExport: (options: MeshUiOptions) => void;
}

export interface UiHandles {
  root: HTMLElement;
  setHistoryCount: (n: number) => void;
  setFps: (fps: number) => void;
  /** T14: counts are host balls / units / total constituent balls. */
  setCounts: (hostBalls: number, units: number, unitBalls: number) => void;
  setSelectionInfo: (text: string) => void;
  setGauges: (wall: ThinnestWallReport, fill: FillReport, mmPerUnit: number) => void;
  setPackResult: (result: PackResult | null) => void;
  syncHostParams: (params: FieldParams) => void;
  syncPackParams: (params: PackParams) => void;
  setMode: (mode: PackMode) => void;
  /** T14: highlight the active unit-kind button + show/hide the cloud knobs. */
  setUnitKind: (kind: UnitKind) => void;
  /** T15 §2: highlight the active placement-mode button + show/hide the grid knobs. */
  setPlacementMode: (mode: "random" | "grid") => void;
  /** T14 §2: reflect how many prototypes are registered (and that packing now uses them). */
  setPrototypeInfo: (count: number, lastSource?: string) => void;
  setAddVoidModeActive: (active: boolean) => void;
  setMeshStatus: (text: string, ok?: boolean) => void;
  /** Update the three-way view toggle's active button + honest caption. */
  setViewMode: (mode: PackViewMode, totalUnits: number, totalBalls: number) => void;
  /** Show/hide the "自動でビーズ表示に切り替えました" banner. */
  setAutoSwitchNotice: (active: boolean) => void;
  /** Current mm-export settings, read without triggering a mesh build — used
   * by main.ts to keep the gauges' mm conversion "連動" with the export size. */
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

const PACK_SPECS: { key: keyof PackParams; label: string; min: number; max: number; step: number }[] = [
  { key: "minR", label: "単位の大きさ 下限", min: 0.02, max: 0.5, step: 0.005 },
  { key: "maxR", label: "単位の大きさ 上限", min: 0.05, max: 1.0, step: 0.01 },
  { key: "gap", label: "隙間 g (骨の最小太さ)", min: 0, max: 0.3, step: 0.005 },
  { key: "penetration", label: "食い込み", min: 0, max: 1.0, step: 0.01 },
  { key: "attempts", label: "詰め込みの強さ (試行数)", min: 20, max: 4000, step: 20 },
  { key: "roundK", label: "丸さ k (単位間の合成)", min: 0, max: 0.6, step: 0.01 },
];

// T14 §1: cloud-unit knobs — only meaningful for kind="cloud" (procedural
// generation; prototypes carry their own ball count and k). Shown/hidden by
// setUnitKind.
const CLOUD_SPECS: { key: keyof PackParams; label: string; min: number; max: number; step: number }[] = [
  { key: "unitBallsMin", label: "単位の球数 下限", min: 1, max: 10, step: 1 },
  { key: "unitBallsMax", label: "単位の球数 上限", min: 1, max: 10, step: 1 },
  { key: "unitRadiusSpread", label: "単位内の半径ばらつき", min: 0, max: 1.5, step: 0.01 },
  { key: "unitLocalK", label: "単位の丸さ k (単位内)", min: 0, max: 0.8, step: 0.01 },
];

// T15 §1: shape knobs, moved in from skin's SkinParams. Each list shows only
// the knobs that shape's generator actually reads (AGENTS §6 — showing a
// knob with no effect would be dishonest), split by unit kind rather than
// one shared bucket.
const COIN_SPECS: { key: keyof PackParams; label: string; min: number; max: number; step: number }[] = [
  { key: "unitIrregularity", label: "コインの不揃い", min: 0, max: 1, step: 0.01 },
  { key: "unitLocalK", label: "単位の丸さ k (単位内)", min: 0, max: 0.8, step: 0.01 },
];
const FLAT_RING_SPECS: { key: keyof PackParams; label: string; min: number; max: number; step: number }[] = [
  { key: "flatRingHoleRatio", label: "平リング 内孔率", min: 0, max: 0.95, step: 0.01 },
  { key: "ringNodeCount", label: "リングの節の数", min: 3, max: 24, step: 1 },
  { key: "ringWobbleR", label: "節の太さのばらつき", min: 0, max: 1, step: 0.01 },
  { key: "unitLocalK", label: "単位の丸さ k (単位内)", min: 0, max: 0.8, step: 0.01 },
];
const RING3D_SPECS: { key: keyof PackParams; label: string; min: number; max: number; step: number }[] = [
  { key: "ringNodeCount", label: "リングの節の数", min: 3, max: 24, step: 1 },
  { key: "ringTubeR", label: "管の太さ", min: 0.01, max: 0.3, step: 0.01 },
  { key: "ringWobbleR", label: "節の太さのばらつき", min: 0, max: 1, step: 0.01 },
  { key: "ringWobblePos", label: "節の位置のばらつき", min: 0, max: 1, step: 0.01 },
  { key: "unitLocalK", label: "単位の丸さ k (単位内)", min: 0, max: 0.8, step: 0.01 },
];

// T15 §2: grid placement knobs. spacing/scatter are sliders; stagger/
// alternate are checkboxes; axis is a small 3-way toggle. Shown/hidden by
// setPlacementMode (only meaningful in "grid").
const GRID_SPECS: { key: keyof PackParams; label: string; min: number; max: number; step: number }[] = [
  { key: "gridSpacing", label: "間隔", min: 0.08, max: 1.2, step: 0.01 },
  { key: "gridScatter", label: "ばらし (0=格子 → 1=ランダムに近い)", min: 0, max: 1, step: 0.01 },
];

export function buildUi(
  container: HTMLElement,
  hostParams: FieldParams,
  packParams: PackParams,
  mode: PackMode,
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
    ["./skin.html", "S-skin 表面に詰める"],
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
  title.textContent = "虚を詰める — Void Packing (S-pack)";
  root.appendChild(title);

  const banner = document.createElement("div");
  banner.className = "approx-banner";
  banner.textContent =
    "実体（ホスト）に単位（球または雲）を貪欲に詰め、host − void を滑らかに合成します。積む単位は虚。残った肉が骨組みです。単位どうしの衝突は外接球で粗く取ります（近似）。";
  root.appendChild(banner);

  const versionRow = createVersionRow(version, updatedAt);
  root.appendChild(versionRow);

  const counts = document.createElement("div");
  counts.className = "ball-count";
  root.appendChild(counts);

  // --- Mode toggle (T13 §1) ------------------------------------------------
  const modeTitle = document.createElement("div");
  modeTitle.className = "section-title";
  modeTitle.textContent = "地と図の反転";
  root.appendChild(modeTitle);

  const modeToggle = document.createElement("div");
  modeToggle.className = "mode-toggle";
  const carveBtn = document.createElement("button");
  carveBtn.textContent = "実体に虚を詰める";
  carveBtn.onclick = () => callbacks.onSetMode("carve");
  const fillBtn = document.createElement("button");
  fillBtn.textContent = "虚に実を詰める";
  fillBtn.onclick = () => callbacks.onSetMode("fill");
  modeToggle.appendChild(carveBtn);
  modeToggle.appendChild(fillBtn);
  root.appendChild(modeToggle);

  const modeExplainer = document.createElement("div");
  modeExplainer.className = "mode-explainer";
  root.appendChild(modeExplainer);
  function renderModeExplainer(m: PackMode): void {
    modeExplainer.textContent =
      m === "carve"
        ? "host − voids。実体（ホスト）を印刷し、詰めた単位を滑らかに減算します。骨組みが残ります。"
        : "単位の smooth-union。ホストは型枠（配置の拘束だけに使い、印刷されません・半透明の下敷き表示）。詰めた実の集積が作品になります。";
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

  // --- Pack (unit) section -----------------------------------------------
  const packTitle = document.createElement("div");
  packTitle.className = "section-title";
  packTitle.textContent = "詰める（単位のつまみ）";
  root.appendChild(packTitle);

  // T14 §1 / T15 §1: 詰める単位の切替 (球 / 雲 / コイン / 平リング / 立体リング)
  const unitKindToggle = document.createElement("div");
  unitKindToggle.className = "mode-toggle unit-kind-toggle";
  const UNIT_KIND_LABELS: [UnitKind, string][] = [
    ["sphere", "球"],
    ["cloud", "雲"],
    ["coin", "コイン"],
    ["flatRing", "平リング"],
    ["ring3d", "立体リング"],
  ];
  const unitKindButtons: Record<UnitKind, HTMLButtonElement> = {} as Record<UnitKind, HTMLButtonElement>;
  for (const [kind, label] of UNIT_KIND_LABELS) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => callbacks.onSetUnitKind(kind);
    unitKindButtons[kind] = btn;
    unitKindToggle.appendChild(btn);
  }
  root.appendChild(unitKindToggle);

  const unitKindExplainer = document.createElement("div");
  unitKindExplainer.className = "mode-explainer";
  root.appendChild(unitKindExplainer);
  function renderUnitKindExplainer(kind: UnitKind, protoCount: number): void {
    if (kind === "sphere") {
      unitKindExplainer.textContent = "単位 = 球1個。v0.2 までと同じ挙動です。";
    } else if (kind === "cloud" && protoCount > 0) {
      unitKindExplainer.textContent = `単位 = 読み込んだ S1 原型（${protoCount}個からランダム選択）を大きさ正規化＋ランダム回転で複製。大きさ下限/上限は単位の外接半径です。`;
    } else if (kind === "cloud") {
      unitKindExplainer.textContent =
        "単位 = 球の小群（シードから決定的に生成、単位ごとに形が違う）。大きさ下限/上限は単位の外接半径として働きます。";
    } else {
      // T15 §1: coin/flatRing/ring3d — skin から移植した表層の語彙が内部へ。
      const shapeNote =
        kind === "coin"
          ? "コイン = アンカー＋副点のブロブ（skin のコイン生成の内部版・表面への射影なし）。"
          : kind === "flatRing"
            ? "平リング = 平面上の節の輪（内孔率で穴の有無が決まる）。"
            : "立体リング = S-rings の輪生成そのもの（球の鎖のトーラス）。";
      unitKindExplainer.textContent = `${shapeNote}向き（法線）は配置モードから与えられます — グリッドでは軸で指定、ランダムでは等方ランダム。`;
    }
  }

  const packSliders: { spec: (typeof PACK_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of PACK_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, packParams[spec.key] as number, (v) =>
      callbacks.onPackParamChange(spec.key, v),
    );
    packSliders.push({ spec, set: built.set });
    root.appendChild(built.row);
  }

  // T14: cloud-only knobs, wrapped so setUnitKind can show/hide them together.
  const cloudKnobs = document.createElement("div");
  cloudKnobs.className = "cloud-knobs";
  const cloudSliders: { spec: (typeof CLOUD_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of CLOUD_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, packParams[spec.key] as number, (v) =>
      callbacks.onPackParamChange(spec.key, v),
    );
    cloudSliders.push({ spec, set: built.set });
    cloudKnobs.appendChild(built.row);
  }
  const cloudKnobsHint = document.createElement("div");
  cloudKnobsHint.className = "hint";
  cloudKnobsHint.textContent =
    "球数・ばらつき・単位の丸さ k は、原型未登録のときの生成用つまみです（原型を読み込むと原型の形と k が優先されます）。";
  cloudKnobs.appendChild(cloudKnobsHint);
  root.appendChild(cloudKnobs);

  // T15 §1: shape-specific knobs (coin / flatRing / ring3d), shown only for
  // the matching unit kind — same show/hide-by-kind pattern as cloudKnobs.
  const coinKnobs = document.createElement("div");
  coinKnobs.className = "cloud-knobs";
  const coinSliders: { spec: (typeof COIN_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of COIN_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, packParams[spec.key] as number, (v) =>
      callbacks.onPackParamChange(spec.key, v),
    );
    coinSliders.push({ spec, set: built.set });
    coinKnobs.appendChild(built.row);
  }
  root.appendChild(coinKnobs);

  const flatRingKnobs = document.createElement("div");
  flatRingKnobs.className = "cloud-knobs";
  const flatRingSliders: { spec: (typeof FLAT_RING_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of FLAT_RING_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, packParams[spec.key] as number, (v) =>
      callbacks.onPackParamChange(spec.key, v),
    );
    flatRingSliders.push({ spec, set: built.set });
    flatRingKnobs.appendChild(built.row);
  }
  root.appendChild(flatRingKnobs);

  const ring3dKnobs = document.createElement("div");
  ring3dKnobs.className = "cloud-knobs";
  const ring3dSliders: { spec: (typeof RING3D_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of RING3D_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, packParams[spec.key] as number, (v) =>
      callbacks.onPackParamChange(spec.key, v),
    );
    ring3dSliders.push({ spec, set: built.set });
    ring3dKnobs.appendChild(built.row);
  }
  root.appendChild(ring3dKnobs);

  // --- T15 §2: 配置モード (ランダム / グリッド) ------------------------------
  const placementTitle = document.createElement("div");
  placementTitle.className = "section-title";
  placementTitle.textContent = "配置モード";
  root.appendChild(placementTitle);

  const placementToggle = document.createElement("div");
  placementToggle.className = "mode-toggle";
  const randomPlacementBtn = document.createElement("button");
  randomPlacementBtn.textContent = "ランダム（現行・貪欲）";
  randomPlacementBtn.onclick = () => callbacks.onSetPlacementMode("random");
  const gridPlacementBtn = document.createElement("button");
  gridPlacementBtn.textContent = "グリッド";
  gridPlacementBtn.onclick = () => callbacks.onSetPlacementMode("grid");
  placementToggle.appendChild(randomPlacementBtn);
  placementToggle.appendChild(gridPlacementBtn);
  root.appendChild(placementToggle);

  const placementExplainer = document.createElement("div");
  placementExplainer.className = "mode-explainer";
  root.appendChild(placementExplainer);
  function renderPlacementExplainer(mode: "random" | "grid"): void {
    placementExplainer.textContent =
      mode === "random"
        ? "ホスト内部を一様乱数でサンプリングし、置ける最大半径を貪欲に採用します（T9 以来の挙動）。"
        : "立方格子の格子点にホスト内部だけ採用して置きます。ばらし=0 は完全格子、上げると位置・回転・大きさに揺らぎが注がれます。";
  }
  renderPlacementExplainer(packParams.placementMode);

  // T15 §2: グリッドのつまみ（間隔・ばらしのスライダー、千鳥・向き交互の
  // チェックボックス、向きの軸トグル）— 配置モードが "grid" のときだけ表示。
  const gridKnobs = document.createElement("div");
  gridKnobs.className = "cloud-knobs";

  const gridSliders: { spec: (typeof GRID_SPECS)[number]; set: (v: number) => void }[] = [];
  for (const spec of GRID_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, packParams[spec.key] as number, (v) =>
      callbacks.onPackParamChange(spec.key, v),
    );
    gridSliders.push({ spec, set: built.set });
    gridKnobs.appendChild(built.row);
  }

  const staggerRow = document.createElement("div");
  staggerRow.className = "row";
  const staggerCheck = document.createElement("input");
  staggerCheck.type = "checkbox";
  staggerCheck.id = "grid-stagger";
  staggerCheck.checked = packParams.gridStagger;
  staggerCheck.onchange = () => callbacks.onPackParamChange("gridStagger", staggerCheck.checked);
  const staggerLabel = document.createElement("label");
  staggerLabel.htmlFor = "grid-stagger";
  staggerLabel.textContent = "千鳥（層ごとに半ピッチずらす）";
  staggerRow.appendChild(staggerCheck);
  staggerRow.appendChild(staggerLabel);
  gridKnobs.appendChild(staggerRow);

  const alternateRow = document.createElement("div");
  alternateRow.className = "row";
  const alternateCheck = document.createElement("input");
  alternateCheck.type = "checkbox";
  alternateCheck.id = "grid-alternate";
  alternateCheck.checked = packParams.gridAlternate;
  alternateCheck.onchange = () => callbacks.onPackParamChange("gridAlternate", alternateCheck.checked);
  const alternateLabel = document.createElement("label");
  alternateLabel.htmlFor = "grid-alternate";
  alternateLabel.textContent = "向きを層ごとに交互（合板/クロスライク）";
  alternateRow.appendChild(alternateCheck);
  alternateRow.appendChild(alternateLabel);
  gridKnobs.appendChild(alternateRow);

  const axisRow = document.createElement("div");
  axisRow.className = "row";
  const axisLabel = document.createElement("label");
  axisLabel.textContent = "向き（法線の軸）";
  axisRow.appendChild(axisLabel);
  const axisToggle = document.createElement("div");
  axisToggle.className = "mode-toggle";
  const AXIS_LABELS: ["x" | "y" | "z", string][] = [
    ["x", "X"],
    ["y", "Y"],
    ["z", "Z"],
  ];
  const axisButtons: Record<"x" | "y" | "z", HTMLButtonElement> = {} as Record<"x" | "y" | "z", HTMLButtonElement>;
  for (const [axis, label] of AXIS_LABELS) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => {
      callbacks.onPackParamChange("gridAxis", axis);
      renderGridAxis(axis);
    };
    axisButtons[axis] = btn;
    axisToggle.appendChild(btn);
  }
  axisRow.appendChild(axisToggle);
  gridKnobs.appendChild(axisRow);

  const gridKnobsHint = document.createElement("div");
  gridKnobsHint.className = "hint";
  gridKnobsHint.textContent =
    "球/雲の単位には向きの効果はありません（コイン/リング系のみ）。単位の大きさは間隔と隙間 g から決まります（大きさ下限/上限は使いません）。";
  gridKnobs.appendChild(gridKnobsHint);
  root.appendChild(gridKnobs);

  root.appendChild(document.createElement("hr"));

  // T14 §2: S1 レシピを単位（詰め材）として登録
  const protoImportRow = document.createElement("div");
  protoImportRow.className = "row";
  const protoImportLabel = document.createElement("label");
  protoImportLabel.textContent = "S1 レシピを単位にする";
  protoImportLabel.className = "file-label";
  const protoImportInput = document.createElement("input");
  protoImportInput.type = "file";
  protoImportInput.accept = "application/json";
  protoImportInput.onchange = () => {
    const file = protoImportInput.files?.[0];
    if (file) callbacks.onImportPrototypeFile(file);
    protoImportInput.value = "";
  };
  protoImportRow.appendChild(protoImportLabel);
  protoImportRow.appendChild(protoImportInput);
  root.appendChild(protoImportRow);

  const protoInfo = document.createElement("div");
  protoInfo.className = "hint";
  protoInfo.textContent = "原型: なし（雲は手続き生成）";
  root.appendChild(protoInfo);

  const packSeedRow = document.createElement("div");
  packSeedRow.className = "row";
  const packSeedLabel = document.createElement("label");
  packSeedLabel.textContent = "詰めるシード";
  const packSeedInput = document.createElement("input");
  packSeedInput.type = "text";
  packSeedInput.value = packParams.seed;
  packSeedInput.onchange = () => callbacks.onPackParamChange("seed", packSeedInput.value);
  packSeedRow.appendChild(packSeedLabel);
  packSeedRow.appendChild(packSeedInput);
  root.appendChild(packSeedRow);

  const packBtnRow = document.createElement("div");
  packBtnRow.className = "row";
  const packBtn = document.createElement("button");
  packBtn.textContent = "詰める (Pack)";
  packBtn.title = "現在の単位に加えて、ホスト内部へ貪欲に単位を追加します";
  packBtn.onclick = () => callbacks.onPackUnits();
  const clearVoidsBtn = document.createElement("button");
  clearVoidsBtn.textContent = "虚を消す";
  clearVoidsBtn.onclick = () => callbacks.onClearVoids();
  packBtnRow.appendChild(packBtn);
  packBtnRow.appendChild(clearVoidsBtn);
  root.appendChild(packBtnRow);

  const packResult = document.createElement("div");
  packResult.className = "hint";
  root.appendChild(packResult);

  // T13: 三択の表示モード（レイマーチ/ビーズ/全体メッシュ）、skin/ui.ts の T12
  // 実装を移植。T14: レイマーチの容量は 球数(VOID_MAX_BALLS) と 単位数
  // (VOID_MAX_UNITS) の二本立てになった。
  const viewTitle = document.createElement("div");
  viewTitle.className = "section-title";
  viewTitle.textContent = "表示モード";
  root.appendChild(viewTitle);

  const viewToggle = document.createElement("div");
  viewToggle.className = "mode-toggle";
  const viewButtons: Record<PackViewMode, HTMLButtonElement> = {} as Record<PackViewMode, HTMLButtonElement>;
  const VIEW_LABELS: [PackViewMode, string][] = [
    ["raymarch", "レイマーチ"],
    ["beads", "ビーズ"],
    ["mesh", "全体メッシュ"],
  ];
  for (const [vm, label] of VIEW_LABELS) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => callbacks.onSetViewMode(vm);
    viewButtons[vm] = btn;
    viewToggle.appendChild(btn);
  }
  root.appendChild(viewToggle);

  const autoSwitchNotice = document.createElement("div");
  autoSwitchNotice.className = "hint auto-switch-notice";
  autoSwitchNotice.textContent =
    "⚠ 単位（または球）の数がレイマーチの表示容量を超えたため、自動でビーズ表示に切り替えました（先頭だけを黙って描く旧挙動は廃止）。";
  autoSwitchNotice.style.display = "none";
  root.appendChild(autoSwitchNotice);

  const viewCaption = document.createElement("div");
  viewCaption.className = "hint";
  root.appendChild(viewCaption);

  function renderViewMode(vm: PackViewMode, totalUnits: number, totalBalls: number): void {
    for (const [m, btn] of Object.entries(viewButtons) as [PackViewMode, HTMLButtonElement][]) {
      btn.classList.toggle("mode-active", m === vm);
    }
    if (vm === "raymarch") {
      const over = totalBalls > VOID_MAX_BALLS || totalUnits > VOID_MAX_UNITS;
      viewCaption.textContent = over
        ? `レイマーチ: 表示容量に上限あり（球${VOID_MAX_BALLS}個 / 単位${VOID_MAX_UNITS}個まで。現在 単位${totalUnits}・球${totalBalls}で超過中 -- 「ビーズ」か「全体メッシュ」で全量を見てください）`
        : `レイマーチ: 滑らかな合成場をそのまま描画（単位${totalUnits}・球${totalBalls}、容量内）。`;
    } else if (vm === "beads") {
      viewCaption.textContent = `ビーズ近似: ブレンド（smooth-min、単位内も単位間も）省略・配置と密度は全量正確（単位${totalUnits}・球${totalBalls}）。容量の制約なしにオービット/ズームできる。ホストは半透明の下敷きとして常に表示。`;
    } else {
      viewCaption.textContent =
        "全体メッシュ: STL と同じ実データ全部を lit mesh で表示（正確・やや重い）。編集操作をするとレイマーチ/ビーズへ自動的に戻ります。";
    }
  }

  const manualRow = document.createElement("div");
  manualRow.className = "row";
  const addVoidToggle = document.createElement("button");
  addVoidToggle.textContent = "単位を手で追加 (クリック)";
  let addVoidActive = false;
  addVoidToggle.onclick = () => {
    addVoidActive = !addVoidActive;
    callbacks.onToggleAddVoidMode(addVoidActive);
  };
  manualRow.appendChild(addVoidToggle);
  root.appendChild(manualRow);

  const manualRadiusBuilt = buildSlider("手動の単位半径", 0.02, 1.0, 0.01, packParams.maxR * 0.5, (v) =>
    callbacks.onManualRadiusChange(v),
  );
  root.appendChild(manualRadiusBuilt.row);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent =
    "「単位を手で追加」を有効にしてホストの表面をクリックすると、その場所に現在の単位種（球/雲）を置きます。既存の単位をクリックで選択、Delete で単位ごと削除。";
  root.appendChild(hint);

  const deleteVoidBtn = document.createElement("button");
  deleteVoidBtn.textContent = "選択した単位を削除 (Delete)";
  deleteVoidBtn.onclick = () => callbacks.onDeleteSelectedUnit();
  root.appendChild(deleteVoidBtn);

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

  const wallRow = document.createElement("div");
  wallRow.className = "gauge-row";
  const wallLabel = document.createElement("span");
  wallLabel.textContent = "最薄の肉（外接球ベース推定）";
  const wallValue = document.createElement("span");
  wallValue.className = "gauge-value";
  wallRow.appendChild(wallLabel);
  wallRow.appendChild(wallValue);
  gaugesPanel.appendChild(wallRow);

  const gaugeNote = document.createElement("div");
  gaugeNote.className = "hint";
  gaugeNote.textContent =
    "最薄の肉は単位の外接球どうし・外接球とホスト表面の距離で測る近似（詰めるとき使った同じ粗い判定）。雲単位の実球はもっと内側にあるため実物はこれより厚いことがあり、逆に等値面の中腹はサンプルしないため薄い箇所もありえます。";
  gaugesPanel.appendChild(gaugeNote);

  const fillRow = document.createElement("div");
  fillRow.className = "gauge-row";
  const fillLabel = document.createElement("span");
  fillLabel.textContent = "充填率";
  const fillValue = document.createElement("span");
  fillValue.className = "gauge-value";
  fillRow.appendChild(fillLabel);
  fillRow.appendChild(fillValue);
  gaugesPanel.appendChild(fillRow);

  root.appendChild(gaugesPanel);

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
  importLabel.textContent = "pack 履歴を読み込む";
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
  meshHint.textContent = "骨組みが細いときは水密が解像度に依存します。千切れたら水密検査がそのまま NG を表示します。";
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

  let lastWall: ThinnestWallReport = { value: null, hasOpening: false };
  let lastFill: FillReport = { fillRatio: 0, hostVolumeEstimate: 0, voidVolumeSum: 0 };
  let lastMmPerUnit = 1;
  let lastProtoCount = 0;
  let lastUnitKind: UnitKind = packParams.unitKind;

  function refreshGaugesMm(): void {
    renderGauges(lastWall, lastFill, lastMmPerUnit);
  }

  function renderGauges(wall: ThinnestWallReport, fill: FillReport, mmPerUnit: number): void {
    lastWall = wall;
    lastFill = fill;
    lastMmPerUnit = mmPerUnit;
    if (wall.value === null) {
      wallValue.textContent = "— (単位なし)";
      wallRow.className = "gauge-row";
    } else {
      const mm = wall.value * mmPerUnit;
      wallValue.textContent = `${wall.value.toFixed(3)} unit (${mm.toFixed(2)} mm)${
        wall.hasOpening ? " — 開口あり" : ""
      }`;
      wallRow.className = wall.hasOpening ? "gauge-row warn" : "gauge-row ok";
    }
    fillValue.textContent = `${(fill.fillRatio * 100).toFixed(1)}%`;
    fillRow.className = "gauge-row";
  }

  function renderUnitKind(kind: UnitKind): void {
    lastUnitKind = kind;
    for (const [k, btn] of Object.entries(unitKindButtons) as [UnitKind, HTMLButtonElement][]) {
      btn.classList.toggle("mode-active", k === kind);
    }
    cloudKnobs.style.display = kind === "cloud" ? "" : "none";
    coinKnobs.style.display = kind === "coin" ? "" : "none";
    flatRingKnobs.style.display = kind === "flatRing" ? "" : "none";
    ring3dKnobs.style.display = kind === "ring3d" ? "" : "none";
    renderUnitKindExplainer(kind, lastProtoCount);
  }
  renderUnitKind(packParams.unitKind);

  function renderPlacementMode(mode: "random" | "grid"): void {
    randomPlacementBtn.classList.toggle("mode-active", mode === "random");
    gridPlacementBtn.classList.toggle("mode-active", mode === "grid");
    gridKnobs.style.display = mode === "grid" ? "" : "none";
    renderPlacementExplainer(mode);
  }
  renderPlacementMode(packParams.placementMode);

  function renderGridAxis(axis: "x" | "y" | "z"): void {
    for (const [a, btn] of Object.entries(axisButtons) as ["x" | "y" | "z", HTMLButtonElement][]) {
      btn.classList.toggle("mode-active", a === axis);
    }
  }
  renderGridAxis(packParams.gridAxis);

  return {
    root,
    setHistoryCount: (n) => {
      historyCount.textContent = `操作履歴: ${n} 件`;
    },
    setFps: (f) => {
      fps.textContent = `~${f.toFixed(0)} fps`;
    },
    setCounts: (hostBalls, units, unitBalls) => {
      counts.textContent = `ホスト球: ${hostBalls} / 単位: ${units}（球 ${unitBalls}）`;
    },
    setSelectionInfo: (text) => {
      selectionInfo.textContent = text;
    },
    setGauges: (wall, fill, mmPerUnit) => renderGauges(wall, fill, mmPerUnit),
    setPackResult: (result) => {
      if (!result) {
        packResult.textContent = "";
        packResult.classList.remove("pack-saturated");
        return;
      }
      // 飽和の無言は禁止（skin/T12末尾の教訓の移植: 作者報告「試行数を増やしても
      // 密度が変わらない」）。飽和を破るのは下限サイズと隙間 g — 試行数では破れない。
      const saturated = result.stoppedEarly || result.placed === 0;
      packResult.textContent = saturated
        ? `詰めた: ${result.placed} 個追加（飽和 — この単位の下限サイズと隙間 g ではもう入りません。` +
          `密度を上げるには「単位の大きさ 下限」か「隙間 g」を小さくしてください。試行数を増やしても飽和は破れません）`
        : `詰めた: ${result.placed} 個追加 / 棄却 ${result.triedAndRejected} 回`;
      packResult.classList.toggle("pack-saturated", saturated);
    },
    syncHostParams: (p) => {
      for (const { spec, set } of hostSliders) set(Number(p[spec.key]));
      seedInput.value = p.seed;
    },
    syncPackParams: (p) => {
      for (const { spec, set } of packSliders) set(Number(p[spec.key]));
      for (const { spec, set } of cloudSliders) set(Number(p[spec.key]));
      for (const { spec, set } of coinSliders) set(Number(p[spec.key]));
      for (const { spec, set } of flatRingSliders) set(Number(p[spec.key]));
      for (const { spec, set } of ring3dSliders) set(Number(p[spec.key]));
      for (const { spec, set } of gridSliders) set(Number(p[spec.key]));
      packSeedInput.value = p.seed;
      staggerCheck.checked = p.gridStagger;
      alternateCheck.checked = p.gridAlternate;
      renderGridAxis(p.gridAxis);
      renderPlacementMode(p.placementMode);
      renderUnitKind(p.unitKind);
    },
    setMode: (m) => {
      carveBtn.classList.toggle("mode-active", m === "carve");
      fillBtn.classList.toggle("mode-active", m === "fill");
      renderModeExplainer(m);
    },
    setUnitKind: (kind) => renderUnitKind(kind),
    setPlacementMode: (mode) => renderPlacementMode(mode),
    setPrototypeInfo: (count, lastSource) => {
      lastProtoCount = count;
      protoInfo.textContent =
        count === 0
          ? "原型: なし（雲は手続き生成）"
          : `原型: ${count} 個登録済み${lastSource ? `（最新: ${lastSource}）` : ""} — 雲単位はここからランダム選択されます`;
      renderUnitKindExplainer(lastUnitKind, count);
    },
    setAddVoidModeActive: (active) => {
      addVoidActive = active;
      addVoidToggle.classList.toggle("active", active);
      addVoidToggle.textContent = active ? "単位を手で追加 (有効・クリックで配置)" : "単位を手で追加 (クリック)";
    },
    setViewMode: (vm, totalUnits, totalBalls) => renderViewMode(vm, totalUnits, totalBalls),
    setAutoSwitchNotice: (active) => {
      autoSwitchNotice.style.display = active ? "block" : "none";
    },
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
  return createSlider({
    label,
    min,
    max,
    step,
    initial,
    format: (value) => (step >= 1 ? String(value) : value.toFixed(3)),
    onChange,
  });
}

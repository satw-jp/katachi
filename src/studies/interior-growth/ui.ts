// ---------------------------------------------------------------------------
// S-interior-growth panel. Stage 1A.1 (docs/sonnet-instruction-20260724-
// katachi-interior-growth-author-feedback.md §3): main screen top to bottom
// is Printer preset -> Host shape -> Layer height -> Support threshold angle
// -> 生成ボタン. The only two numbers an author edits on the main screen are
// layerHeightMm and supportThresholdAngleDeg (plus Custom printer's X/Y/Z,
// shown only when Custom is selected). Everything Phase 1A originally
// exposed directly (lateral mm/layer, span mm, STL目標最長辺, seed, the
// GrowthParams sliders, root目標数) now lives in a closed-by-default
// "研究用詳細" <details> block — present, not deleted, per §3's own
// "GrowthParamsを削除する必要はない。既定値を持つ内部パラメータとし…".
// ---------------------------------------------------------------------------

import { createSlider } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import {
  HOST_FIXTURES,
  PRINTER_PRESETS,
  type FabricationEnvelope,
  type GrowthParams,
  type GrowthUnitKind,
  type GrowthUnitRole,
  type HostFitResult,
  type HostFixtureId,
  type PrinterPresetId,
  type Vec3,
} from "./field.ts";
import type { GrowthMetrics, GrowthResult, GrowthVariant, RejectionReason } from "./growth.ts";
import { REJECTION_REASONS } from "./growth.ts";
import type { CoverageStopReason } from "./coverage.ts";

const COVERAGE_STOP_REASON_LABEL: Record<CoverageStopReason, string> = {
  "target-reached": "目標到達",
  "coverage-unreachable": "到達可能な未被覆面なし",
  "candidate-budget-exhausted": "budget上限",
  "base-budget-exhausted": "base budget上限",
  "trunk-budget-exhausted": "trunk budget上限",
  "surface-spread-blocked": "表面沿いの拡がりが停滞",
  "support-angle-blocked": "support角度制約で停滞",
  "host-boundary-blocked": "host境界で停滞",
  "mesh-connectivity-failed": "mesh連結性を満たせず",
  "not-run": "未実行",
};

const VARIANTS: GrowthVariant[] = ["field-only", "coin-constrained", "ring-constrained"];
const VARIANT_LABEL: Record<GrowthVariant, string> = {
  "field-only": "Field only",
  "coin-constrained": "Coin",
  "ring-constrained": "Ring",
};
/** §13's "base / trunk / spread unit内訳" display order — root first, then the stages in the order growth actually runs them. */
const ROLE_LABELS: [GrowthUnitRole, string][] = [
  ["root", "root"],
  ["primary-path", "primary path（上端到達）"],
  ["base", "connected base（板に接する）"],
  ["trunk", "upward trunk"],
  ["surface-approach", "surface approach（移動）"],
  ["surface-spread", "surface spread（接平面沿い）"],
  ["unknown", "未記録（旧形式）"],
];

const REASON_LABEL: Record<RejectionReason, string> = {
  "host-exterior": "host外",
  "root-not-on-plate": "root未接地",
  "no-parent-contact": "parent非接触",
  "lateral-advance-exceeded": "横張り出し超過",
  "unsupported-span-exceeded": "無支持span超過",
  "ring-horizontal": "水平ring",
  "ring-discontinuous-support": "ring支持不連続",
  "void-bias-skip": "voidBiasによる意図的skip",
  "negative-rise-rejected": "下降方向のstep（build-axis単調性違反）",
};

/** Only the NUMERIC GrowthParams fields — seed (string) and unitKind (GrowthUnitKind) have their own dedicated callbacks below, so a slider's onChange can safely hand back a plain `number`. */
export type NumericGrowthParamKey = "lift" | "drift" | "cohesion" | "branching" | "voidBias" | "unitRadius" | "ringNodeCount" | "ringTubeR" | "rootTarget";

export interface UiCallbacks {
  onPrinterPresetChange: (id: PrinterPresetId) => void;
  onCustomBuildVolumeChange: (axis: "x" | "y" | "z", valueMm: number) => void;
  onHostChange: (hostId: HostFixtureId) => void;
  onBuildAxisChange: (axis: "x" | "y" | "z") => void;
  onLayerHeightChange: (mm: number) => void;
  onSupportThresholdAngleChange: (deg: number) => void;
  onTargetSurfaceCoverageChange: (fraction: number) => void;
  onParamChange: (key: NumericGrowthParamKey, value: number) => void;
  onSeedChange: (seed: string) => void;
  onUnitKindChange: (kind: GrowthUnitKind) => void;
  onGenerate: () => void;
  /** O3 §8: terminate the in-flight Worker run. Only ever enabled while one is actually in flight. */
  onCancelGenerate: () => void;
  onToggleSurfaceMesh: (show: boolean) => void;
  onToggleRejected: (show: boolean) => void;
  onToggleVoids: (show: boolean) => void;
  onToggleCoverageSamples: (show: boolean) => void;
  onVoidResolutionChange: (value: number) => void;
  onExportRecipe: () => void;
  onImportRecipeFile: (file: File) => void;
  onSaveStl: (variant: GrowthVariant) => void;
  onSaveProvenance: (variant: GrowthVariant) => void;
  onClear: () => void;
}

export interface UiHandles {
  root: HTMLElement;
  setStatus: (text: string, isError?: boolean) => void;
  /**
   * O3 §8's progress display. `null` clears it and returns the panel to its
   * idle state. Reports the stage and the elapsed time separately from the
   * candidate counter, so "which of the three" and "how long has this been
   * going" are both legible rather than fused into one bar.
   */
  setProgress: (progress: { candidateIndex: number; candidateTotal: number; label: string; stage: string; completed: number; total: number; elapsedMs: number } | null) => void;
  setMetrics: (results: Partial<Record<GrowthVariant, GrowthResult>>, metrics: Partial<Record<GrowthVariant, GrowthMetrics>>) => void;
  setSaveEnabled: (variant: GrowthVariant, ok: boolean, reasons: string[]) => void;
  setHistoryCount: (n: number) => void;
  setDerivedLateral: (mmPerLayer: number) => void;
  setFit: (fit: HostFitResult) => void;
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function numberInputRow(label: string, initial: number, hint: string, onChange: (v: number) => void, opts?: { min?: number; max?: number; step?: number }): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement("div");
  row.className = "row mesh-row";
  const lab = document.createElement("label");
  lab.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(opts?.step ?? 0.01);
  if (opts?.min !== undefined) input.min = String(opts.min);
  if (opts?.max !== undefined) input.max = String(opts.max);
  input.value = String(initial);
  input.title = hint;
  input.oninput = () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onChange(v);
  };
  row.appendChild(lab);
  row.appendChild(input);
  return { row, input };
}

export function buildInteriorGrowthUi(
  container: HTMLElement,
  hostId: HostFixtureId,
  envelope: FabricationEnvelope,
  params: GrowthParams,
  printerPresetId: PrinterPresetId,
  customBuildVolumeMm: Vec3,
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
  title.textContent = "内部から育つネットワーク — Interior Growth (Stage 1A.1)";
  root.appendChild(title);

  const banner = document.createElement("div");
  banner.className = "approx-banner";
  banner.textContent =
    "合成host（box/sphere/waisted）の内部でcoin/ringを育てる自己完結Study。表示は「support-constrained growth」「内部サポート危険域の推定」であり、印刷可能性・サポート不要は断定しない。実CoinSRF・実スライサー検証は対象外。support threshold angleは特定スライサーと同一のsupport領域になるとは断定しない、Katachi独自の局所近似規約。";
  root.appendChild(banner);

  // --- 1. Printer preset ------------------------------------------------
  const printerSection = document.createElement("div");
  printerSection.className = "section-title";
  printerSection.textContent = "Printer";
  root.appendChild(printerSection);

  const printerRow = document.createElement("div");
  printerRow.className = "row mode-row";
  const printerButtons = new Map<PrinterPresetId, HTMLButtonElement>();
  const customVolumeWrap = document.createElement("div");
  customVolumeWrap.style.display = printerPresetId === "custom" ? "" : "none";
  for (const preset of PRINTER_PRESETS) {
    const btn = document.createElement("button");
    btn.textContent = preset.label;
    if (preset.id === printerPresetId) btn.classList.add("mode-active");
    btn.onclick = () => {
      for (const b of printerButtons.values()) b.classList.remove("mode-active");
      btn.classList.add("mode-active");
      customVolumeWrap.style.display = preset.id === "custom" ? "" : "none";
      callbacks.onPrinterPresetChange(preset.id);
    };
    printerButtons.set(preset.id, btn);
    printerRow.appendChild(btn);
  }
  root.appendChild(printerRow);

  for (const axis of ["x", "y", "z"] as const) {
    const { row } = numberInputRow(`Custom build volume ${axis.toUpperCase()} (mm)`, customBuildVolumeMm[axis], "Custom機種のbuild volume（作者入力、公式値ではない）", (v) => callbacks.onCustomBuildVolumeChange(axis, v), { min: 10, step: 1 });
    customVolumeWrap.appendChild(row);
  }
  root.appendChild(customVolumeWrap);

  const fitInfo = document.createElement("div");
  fitInfo.className = "hint";
  root.appendChild(fitInfo);

  // --- 2. Host shape ------------------------------------------------------
  const hostSection = document.createElement("div");
  hostSection.className = "section-title";
  hostSection.textContent = "Host shape";
  root.appendChild(hostSection);

  const hostRow = document.createElement("div");
  hostRow.className = "row mode-row";
  const hostButtons = new Map<HostFixtureId, HTMLButtonElement>();
  for (const fixture of HOST_FIXTURES) {
    const btn = document.createElement("button");
    btn.textContent = fixture.label;
    if (fixture.id === hostId) btn.classList.add("mode-active");
    btn.onclick = () => {
      for (const b of hostButtons.values()) b.classList.remove("mode-active");
      btn.classList.add("mode-active");
      callbacks.onHostChange(fixture.id);
    };
    hostButtons.set(fixture.id, btn);
    hostRow.appendChild(btn);
  }
  root.appendChild(hostRow);

  // --- 3/4. Layer height + support threshold angle -----------------------
  const paramsSection = document.createElement("div");
  paramsSection.className = "section-title";
  paramsSection.textContent = "造形条件";
  root.appendChild(paramsSection);

  const { row: layerRow } = numberInputRow("Layer height (mm)", envelope.layerHeightMm, "1層の高さ", (v) => callbacks.onLayerHeightChange(v), { min: 0.01, step: 0.01 });
  root.appendChild(layerRow);

  const { row: angleRow } = numberInputRow(
    "Support threshold angle (deg)",
    envelope.supportThresholdAngleDeg,
    "0°=build plateに平行な下面、90°=垂直壁。Katachi独自の局所近似規約",
    (v) => callbacks.onSupportThresholdAngleChange(v),
    { min: 1, max: 89, step: 1 },
  );
  root.appendChild(angleRow);

  const derivedRow = document.createElement("div");
  derivedRow.className = "hint";
  root.appendChild(derivedRow);

  // --- 造形表現: Target surface occupancy (plan doc §6) --------------------
  // printer設定とは別セクション — layer height/support angleが機種の制約である
  // のに対し、これは作者が形を決めるcreative parameterであるため。
  const coverageSection = document.createElement("div");
  coverageSection.className = "section-title";
  coverageSection.textContent = "造形表現 — Target surface occupancy";
  root.appendChild(coverageSection);

  const coverageHint = document.createElement("div");
  coverageHint.className = "hint";
  coverageHint.textContent = "printerの制約ではなく作者が形を決めるcreative parameter。host表面のうち、build-plateへ到達した材質でどれだけ覆うかの目標。";
  root.appendChild(coverageHint);

  const coveragePresets: { label: string; value: number }[] = [
    { label: "25%", value: 0.25 },
    { label: "50%", value: 0.5 },
    { label: "75%", value: 0.75 },
  ];
  const coverageButtonsRow = document.createElement("div");
  coverageButtonsRow.className = "row mode-row";
  const coverageButtons = new Map<number, HTMLButtonElement>();
  const coverageCustomBtn = document.createElement("button");
  coverageCustomBtn.textContent = "Custom";
  const coverageCustomWrap = document.createElement("div");
  coverageCustomWrap.style.display = "none";
  const { row: coverageCustomRow, input: coverageCustomInput } = numberInputRow(
    "Custom target (%)",
    Math.round(params.targetSurfaceCoverage * 100),
    "0〜100の任意%",
    (v) => callbacks.onTargetSurfaceCoverageChange(Math.max(0, Math.min(1, v / 100))),
    { min: 0, max: 100, step: 1 },
  );
  coverageCustomWrap.appendChild(coverageCustomRow);

  function setCoverageActive(matchValue: number | null): void {
    for (const b of coverageButtons.values()) b.classList.remove("mode-active");
    coverageCustomBtn.classList.remove("mode-active");
    if (matchValue !== null && coverageButtons.has(matchValue)) {
      coverageButtons.get(matchValue)!.classList.add("mode-active");
      coverageCustomWrap.style.display = "none";
    } else {
      coverageCustomBtn.classList.add("mode-active");
      coverageCustomWrap.style.display = "";
    }
  }

  for (const preset of coveragePresets) {
    const btn = document.createElement("button");
    btn.textContent = preset.label;
    btn.onclick = () => {
      setCoverageActive(preset.value);
      coverageCustomInput.value = String(Math.round(preset.value * 100));
      callbacks.onTargetSurfaceCoverageChange(preset.value);
    };
    coverageButtons.set(preset.value, btn);
    coverageButtonsRow.appendChild(btn);
  }
  coverageCustomBtn.onclick = () => setCoverageActive(null);
  coverageButtonsRow.appendChild(coverageCustomBtn);
  root.appendChild(coverageButtonsRow);
  root.appendChild(coverageCustomWrap);

  const initialPreset = coveragePresets.find((p) => Math.abs(p.value - params.targetSurfaceCoverage) < 1e-9);
  setCoverageActive(initialPreset ? initialPreset.value : null);

  // --- 5. Generate ----------------------------------------------------------
  const generateBtn = document.createElement("button");
  generateBtn.textContent = "3候補生成（Field only / Coin / Ring）";
  generateBtn.onclick = () => callbacks.onGenerate();
  root.appendChild(generateBtn);

  // O3 §8: cancel is a separate control that only exists while a run is in
  // flight — never a disabled-looking button the author has to guess about.
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "生成を中止";
  cancelBtn.className = "secondary";
  cancelBtn.style.display = "none";
  cancelBtn.onclick = () => callbacks.onCancelGenerate();
  root.appendChild(cancelBtn);

  const progressRow = document.createElement("div");
  progressRow.className = "hint";
  progressRow.style.display = "none";
  root.appendChild(progressRow);

  const statusRow = document.createElement("div");
  statusRow.className = "hint";
  root.appendChild(statusRow);

  // --- always-visible candidate summary (§7) ------------------------------
  const summaryWrap = document.createElement("div");
  summaryWrap.className = "metric-table-wrap";
  root.appendChild(summaryWrap);

  // --- Viewport toggles ------------------------------------------------
  const toggleSection = document.createElement("div");
  toggleSection.className = "section-title";
  toggleSection.textContent = "比較表示";
  root.appendChild(toggleSection);

  const surfaceToggleRow = document.createElement("label");
  surfaceToggleRow.className = "row";
  const surfaceToggle = document.createElement("input");
  surfaceToggle.type = "checkbox";
  surfaceToggle.checked = true;
  surfaceToggle.onchange = () => callbacks.onToggleSurfaceMesh(surfaceToggle.checked);
  surfaceToggleRow.appendChild(surfaceToggle);
  surfaceToggleRow.appendChild(document.createTextNode(" 保存予定meshの表面（ON） / 生成単位の構造（OFF）"));
  root.appendChild(surfaceToggleRow);

  const rejectedToggleRow = document.createElement("label");
  rejectedToggleRow.className = "row";
  const rejectedToggle = document.createElement("input");
  rejectedToggle.type = "checkbox";
  rejectedToggle.checked = false;
  rejectedToggle.onchange = () => callbacks.onToggleRejected(rejectedToggle.checked);
  rejectedToggleRow.appendChild(rejectedToggle);
  rejectedToggleRow.appendChild(document.createTextNode(" rejected candidate表示（赤）"));
  root.appendChild(rejectedToggleRow);

  const voidToggleRow = document.createElement("label");
  voidToggleRow.className = "row";
  const voidToggle = document.createElement("input");
  voidToggle.type = "checkbox";
  voidToggle.checked = false;
  voidToggle.onchange = () => callbacks.onToggleVoids(voidToggle.checked);
  voidToggleRow.appendChild(voidToggle);
  voidToggleRow.appendChild(document.createTextNode(" void表示（水色=外部連通 / 橙=閉じたvoid）"));
  root.appendChild(voidToggleRow);

  const coverageToggleRow = document.createElement("label");
  coverageToggleRow.className = "row";
  const coverageToggle = document.createElement("input");
  coverageToggle.type = "checkbox";
  coverageToggle.checked = false; // off by default — 4000点の常時表示は形本体を読みにくくするため、作者が選んで見る
  coverageToggle.onchange = () => callbacks.onToggleCoverageSamples(coverageToggle.checked);
  coverageToggleRow.appendChild(coverageToggle);
  coverageToggleRow.appendChild(document.createTextNode(" surface coverage sample表示（緑=covered / 暗い灰=uncovered）"));
  root.appendChild(coverageToggleRow);

  const voidResSlider = createSlider({
    label: "voidグリッド解像度",
    min: 10,
    max: 40,
    step: 2,
    initial: 26,
    format: (v) => String(v),
    onChange: (v) => callbacks.onVoidResolutionChange(v),
  });
  root.appendChild(voidResSlider.row);

  const legend = document.createElement("div");
  legend.className = "hint";
  legend.textContent = "凡例: 表面表示=STL経路と同じ三角形 / 構造表示=橙root・青parent接続unit / 赤=rejected candidate / 灰=host+build volume / 緑=primary path上端";
  root.appendChild(legend);

  // --- Metric table (詳細、折りたたみ) --------------------------------------
  const metricsDetails = document.createElement("details");
  metricsDetails.open = false;
  const metricsSummary = document.createElement("summary");
  metricsSummary.textContent = "metric table（詳細）";
  metricsDetails.appendChild(metricsSummary);
  const metricsTableWrap = document.createElement("div");
  metricsTableWrap.className = "metric-table-wrap";
  metricsDetails.appendChild(metricsTableWrap);
  root.appendChild(metricsDetails);

  // --- 研究用詳細 (closed by default; §3's "折りたたみは初期状態で閉じ") ---------
  const researchDetails = document.createElement("details");
  researchDetails.open = false;
  const researchSummary = document.createElement("summary");
  researchSummary.textContent = "研究用詳細（GrowthParams）";
  researchDetails.appendChild(researchSummary);

  const axisRow = document.createElement("div");
  axisRow.className = "row mode-row";
  const axisButtons = new Map<"x" | "y" | "z", HTMLButtonElement>();
  for (const axis of ["x", "y", "z"] as const) {
    const btn = document.createElement("button");
    btn.textContent = `build axis ${axis.toUpperCase()}`;
    if ((axis === "x" && envelope.buildAxis.x === 1) || (axis === "y" && envelope.buildAxis.y === 1) || (axis === "z" && envelope.buildAxis.z === 1)) {
      btn.classList.add("mode-active");
    }
    btn.onclick = () => {
      for (const b of axisButtons.values()) b.classList.remove("mode-active");
      btn.classList.add("mode-active");
      callbacks.onBuildAxisChange(axis);
    };
    axisButtons.set(axis, btn);
    axisRow.appendChild(btn);
  }
  researchDetails.appendChild(axisRow);

  const seedRow = document.createElement("div");
  seedRow.className = "row";
  const seedLabel = document.createElement("label");
  seedLabel.textContent = "seed";
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.value = params.seed;
  seedInput.oninput = () => callbacks.onSeedChange(seedInput.value);
  seedRow.appendChild(seedLabel);
  seedRow.appendChild(seedInput);
  researchDetails.appendChild(seedRow);

  const kindRow = document.createElement("div");
  kindRow.className = "row mode-row";
  const kindButtons = new Map<GrowthUnitKind, HTMLButtonElement>();
  for (const kind of ["coin", "ring"] as const) {
    const btn = document.createElement("button");
    btn.textContent = `field-only unit: ${kind}`;
    if (kind === params.unitKind) btn.classList.add("mode-active");
    btn.onclick = () => {
      for (const b of kindButtons.values()) b.classList.remove("mode-active");
      btn.classList.add("mode-active");
      callbacks.onUnitKindChange(kind);
    };
    kindButtons.set(kind, btn);
    kindRow.appendChild(btn);
  }
  researchDetails.appendChild(kindRow);

  const sliderDefs: { key: NumericGrowthParamKey; label: string; min: number; max: number; step: number }[] = [
    { key: "lift", label: "lift", min: 0, max: 1, step: 0.01 },
    { key: "drift", label: "drift", min: 0, max: 1, step: 0.01 },
    { key: "cohesion", label: "cohesion", min: 0, max: 1, step: 0.01 },
    { key: "branching", label: "branching", min: 0, max: 1, step: 0.01 },
    { key: "voidBias", label: "voidBias", min: 0, max: 1, step: 0.01 },
    { key: "unitRadius", label: "unit半径", min: 0.04, max: 0.3, step: 0.005 },
    { key: "ringNodeCount", label: "ring節数", min: 4, max: 16, step: 1 },
    { key: "ringTubeR", label: "ring太さ比", min: 0.1, max: 0.5, step: 0.01 },
    { key: "rootTarget", label: "root目標数", min: 1, max: 12, step: 1 },
  ];
  for (const def of sliderDefs) {
    const slider = createSlider({
      label: def.label,
      min: def.min,
      max: def.max,
      step: def.step,
      initial: params[def.key] as number,
      format: (v) => fmt(v, def.step < 1 ? 2 : 0),
      onChange: (v) => callbacks.onParamChange(def.key, v),
    });
    researchDetails.appendChild(slider.row);
  }
  root.appendChild(researchDetails);

  // --- Export --------------------------------------------------------------
  const exportSection = document.createElement("div");
  exportSection.className = "section-title";
  exportSection.textContent = "書き出し";
  root.appendChild(exportSection);

  const saveButtons = new Map<GrowthVariant, { stl: HTMLButtonElement; provenance: HTMLButtonElement }>();
  for (const variant of VARIANTS) {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.className = "hint";
    label.style.width = "70px";
    label.textContent = VARIANT_LABEL[variant];
    const stlBtn = document.createElement("button");
    stlBtn.textContent = "STL保存";
    stlBtn.disabled = true;
    stlBtn.onclick = () => callbacks.onSaveStl(variant);
    const provBtn = document.createElement("button");
    provBtn.textContent = "provenance保存";
    provBtn.disabled = true;
    provBtn.onclick = () => callbacks.onSaveProvenance(variant);
    row.appendChild(label);
    row.appendChild(stlBtn);
    row.appendChild(provBtn);
    root.appendChild(row);
    saveButtons.set(variant, { stl: stlBtn, provenance: provBtn });
  }

  const exportRow = document.createElement("div");
  exportRow.className = "row";
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "recipe書き出し";
  exportBtn.onclick = () => callbacks.onExportRecipe();
  const importLabel = document.createElement("label");
  importLabel.textContent = "recipe読み込み";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.onchange = () => {
    const file = importInput.files?.[0];
    if (file) callbacks.onImportRecipeFile(file);
    importInput.value = "";
  };
  exportRow.appendChild(exportBtn);
  root.appendChild(exportRow);
  root.appendChild(importLabel);
  root.appendChild(importInput);

  const clearBtn = document.createElement("button");
  clearBtn.className = "danger";
  clearBtn.textContent = "クリア";
  clearBtn.onclick = () => callbacks.onClear();
  root.appendChild(clearBtn);

  const historyCount = document.createElement("div");
  historyCount.className = "history-count";
  root.appendChild(historyCount);

  const versionRow = createVersionRow(version, updatedAt);
  root.appendChild(versionRow);

  container.appendChild(root);

  function renderSaveReasons(reasons: string[]): string {
    return reasons.length === 0 ? "" : ` (${reasons.join(" / ")})`;
  }

  function metricRow(label: string, values: (metrics: GrowthMetrics) => string, metrics: Partial<Record<GrowthVariant, GrowthMetrics>>, target: HTMLElement): void {
    const row = document.createElement("div");
    row.className = "metric-row";
    const lab = document.createElement("span");
    lab.className = "metric-label";
    lab.textContent = label;
    row.appendChild(lab);
    for (const variant of VARIANTS) {
      const cell = document.createElement("span");
      cell.className = "metric-cell";
      const m = metrics[variant];
      cell.textContent = m ? values(m) : "—";
      row.appendChild(cell);
    }
    target.appendChild(row);
  }

  function headerRow(target: HTMLElement): void {
    const header = document.createElement("div");
    header.className = "metric-row metric-header";
    const labCell = document.createElement("span");
    labCell.className = "metric-label";
    labCell.textContent = "";
    header.appendChild(labCell);
    for (const variant of VARIANTS) {
      const cell = document.createElement("span");
      cell.className = "metric-cell";
      cell.textContent = VARIANT_LABEL[variant];
      header.appendChild(cell);
    }
    target.appendChild(header);
  }

  return {
    root,
    setStatus: (text, isError) => {
      statusRow.textContent = text;
      statusRow.style.color = isError ? "var(--danger)" : "";
    },
    setProgress: (progress) => {
      if (!progress) {
        progressRow.style.display = "none";
        progressRow.textContent = "";
        cancelBtn.style.display = "none";
        generateBtn.disabled = false;
        return;
      }
      progressRow.style.display = "";
      cancelBtn.style.display = "";
      generateBtn.disabled = true;
      const unitPart = progress.total > 0 ? ` — accepted ${progress.completed} / 上限 ${progress.total} unit` : "";
      progressRow.textContent = `生成中 ${progress.candidateIndex}/${progress.candidateTotal}（${progress.label}）: ${progress.stage}${unitPart} — 経過 ${(progress.elapsedMs / 1000).toFixed(1)} 秒`;
    },
    setDerivedLateral: (mmPerLayer) => {
      derivedRow.textContent = `derived lateral allowance: ${fmt(mmPerLayer, 3)} mm/layer（layer height / tan(angle) — read-only、45°ならlayer heightと同じ）`;
    },
    setFit: (fit) => {
      fitInfo.textContent = `build volume ${fit.buildVolumeMm.x}×${fit.buildVolumeMm.y}×${fit.buildVolumeMm.z} mm（study margin ${(fit.marginFraction * 100).toFixed(0)}%, Katachi側の仮の余白） / 最終host bbox ${fmt(fit.hostBboxMm.x, 1)}×${fmt(fit.hostBboxMm.y, 1)}×${fmt(fit.hostBboxMm.z, 1)} mm`;
    },
    setHistoryCount: (n) => {
      historyCount.textContent = `履歴 ${n} 件`;
    },
    setSaveEnabled: (variant, ok, reasons) => {
      const buttons = saveButtons.get(variant);
      if (!buttons) return;
      buttons.stl.disabled = !ok;
      buttons.provenance.disabled = !ok;
      buttons.stl.title = ok ? "" : `保存後topology不合格${renderSaveReasons(reasons)}`;
    },
    setMetrics: (results, metrics) => {
      summaryWrap.replaceChildren();
      headerRow(summaryWrap);
      metricRow("accepted", (m) => String(m.acceptedCount), metrics, summaryWrap);
      metricRow("rejected合計", (m) => String(m.rejectedTotal), metrics, summaryWrap);
      metricRow("height coverage", (m) => `${fmt(m.heightCoverage * 100, 1)}%`, metrics, summaryWrap);
      metricRow("top reached", (m) => (m.topReached ? "reached" : "not-reached"), metrics, summaryWrap);
      metricRow("surface target%", (m) => `${fmt(m.targetSurfaceCoverage * 100, 0)}%`, metrics, summaryWrap);
      metricRow("surface measured%", (m) => `${fmt(m.measuredSurfaceCoverage * 100, 1)}%`, metrics, summaryWrap);
      metricRow("surface gap%", (m) => `${fmt(m.coverageGap * 100, 1)}pt`, metrics, summaryWrap);
      metricRow("surface停止理由", (m) => COVERAGE_STOP_REASON_LABEL[m.coverageStopReason], metrics, summaryWrap);
      const anyResult = VARIANTS.some((v) => results[v]);
      summaryWrap.style.display = anyResult ? "" : "none";

      metricsTableWrap.replaceChildren();
      headerRow(metricsTableWrap);
      metricRow("accepted", (m) => String(m.acceptedCount), metrics, metricsTableWrap);
      metricRow("root数", (m) => String(m.rootCount), metrics, metricsTableWrap);
      metricRow("edge数", (m) => String(m.edgeCount), metrics, metricsTableWrap);
      metricRow("primary path長", (m) => String(m.primaryPathLength), metrics, metricsTableWrap);
      metricRow("height coverage", (m) => `${fmt(m.heightCoverage * 100, 1)}%`, metrics, metricsTableWrap);
      metricRow("top reached", (m) => (m.topReached ? "yes" : "no"), metrics, metricsTableWrap);
      metricRow("自動budget(最小/総)", (m) => `${m.autoBudget.minimumPathUnits}/${m.autoBudget.totalBudget}`, metrics, metricsTableWrap);
      metricRow("root未到達", (m) => String(m.unreachableCount), metrics, metricsTableWrap);
      metricRow("degree min/med/max", (m) => `${m.degree.min}/${fmt(m.degree.median, 1)}/${m.degree.max}`, metrics, metricsTableWrap);
      metricRow("host占有率", (m) => `${fmt(m.hostOccupancy * 100, 1)}%`, metrics, metricsTableWrap);
      metricRow("closed void数", (m) => String(m.closedVoidComponents), metrics, metricsTableWrap);
      metricRow("最大横張り出し(field)", (m) => fmt(m.maxLateralStepField, 3), metrics, metricsTableWrap);
      metricRow("clip数/最大clip", (m) => `${m.clippedUnitCount}/${fmt(m.maxClipFieldUnits, 3)}`, metrics, metricsTableWrap);
      metricRow("早期終了", (m) => (m.earlyTerminated ? "yes" : "no"), metrics, metricsTableWrap);
      metricRow("surface target%", (m) => `${fmt(m.targetSurfaceCoverage * 100, 0)}%`, metrics, metricsTableWrap);
      metricRow("surface measured%", (m) => `${fmt(m.measuredSurfaceCoverage * 100, 1)}%`, metrics, metricsTableWrap);
      metricRow("surface gap%", (m) => `${fmt(m.coverageGap * 100, 1)}pt`, metrics, metricsTableWrap);
      metricRow("surface停止理由", (m) => COVERAGE_STOP_REASON_LABEL[m.coverageStopReason], metrics, metricsTableWrap);
      metricRow("surface covered/uncovered/unreachable sample", (m) => `${m.coveredSampleCount}/${m.coverageSampleCount - m.coveredSampleCount - m.unreachableSampleCount}/${m.unreachableSampleCount}`, metrics, metricsTableWrap);
      metricRow("surface probe depth(field)", (m) => fmt(m.coverageProbeDepthField, 4), metrics, metricsTableWrap);
      metricRow("algorithm", (m) => m.algorithmVersion, metrics, metricsTableWrap);
      metricRow("reached region数（完全被覆のみ）", (m) => (m.regionCount === null || m.reachedRegionCount === null ? "未記録" : `${m.reachedRegionCount}/${m.regionCount}`), metrics, metricsTableWrap);
      metricRow("zero-gain accepted数", (m) => (m.zeroGainAcceptedCount === null ? "未記録" : String(m.zeroGainAcceptedCount)), metrics, metricsTableWrap);
      // O2 §6.1/§6.2: the connected base's own effect, reported as the two
      // route costs side by side rather than asserted.
      // O2 audit-fix §2.2: three separate rows, never one "graph root / plate
      // contact" cell — graph roots, VERIFIED material contact, and the coarse
      // near-plate candidate set are three different numbers.
      metricRow("graph root", (m) => String(m.rootCount), metrics, metricsTableWrap);
      metricRow("実プレート接触（材質最下端 ≤ 1 layer）", (m) => (m.actualPlateContactCount === null ? "未記録" : String(m.actualPlateContactCount)), metrics, metricsTableWrap);
      metricRow("region launch候補（near-plate）", (m) => (m.launchPointCount === null ? "未記録" : String(m.launchPointCount)), metrics, metricsTableWrap);
      metricRow("region到達コスト 全launch / 単一root", (m) =>
        m.meanAssignedRouteCost === null || m.meanSingleSourceRouteCost === null || m.meanAssignedRouteCost < 0
          ? "未記録"
          : `${fmt(m.meanAssignedRouteCost, 1)} / ${fmt(m.meanSingleSourceRouteCost, 1)} unit（推定）`,
        metrics, metricsTableWrap);
      // §13's unit用途別内訳 — which job actually consumed the budget.
      for (const [role, label] of ROLE_LABELS) {
        metricRow(`  unit用途: ${label}`, (m) => String(m.roleCounts[role] ?? 0), metrics, metricsTableWrap);
      }
      metricRow("rejected合計", (m) => String(m.rejectedTotal), metrics, metricsTableWrap);
      for (const reason of REJECTION_REASONS) {
        metricRow(`  └ ${REASON_LABEL[reason]}`, (m) => String(m.rejected[reason]), metrics, metricsTableWrap);
      }
    },
  };
}

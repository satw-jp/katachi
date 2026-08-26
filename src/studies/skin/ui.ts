// ---------------------------------------------------------------------------
// Skin's control panel. Structurally mirrors pack/ui.ts (sliders, export/
// import, mesh panel, Version/UpdatedAt strip) with a host section, a skin
// (patch) section, a manual-patch toggle, gauges (mortar / coverage / patch
// components), and -- new for this Study -- the mode toggle (プレートが実 /
// 形態が実) that is T10's whole point.
// ---------------------------------------------------------------------------

import type { FieldParams } from "../cloud-sculpt/field.ts";
import { createSlider } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import type {
  CoverageReport,
  ContactReinforcementMode,
  InternalStructureMode,
  FlowerConnectionMode,
  FlowerMotifPresetId,
  MotifShapeParams,
  MotifPlacement,
  Patch,
  MortarReport,
  PatchShape,
  QuadConnectionMode,
  QuadTilingMode,
  SkinMode,
  SkinParams,
  SurfaceGenerationMode,
} from "./field.ts";
import { captureMotifShapeParams } from "./field.ts";
import type { PackPatchesResult } from "./field.ts";
import { PACKING_MOTIF_PRESETS } from "../flower-packing-spike/packing.ts";
import type { SkinLinkingReport, SkinOverlapWarning } from "./linking.ts";
import type { SkinDisplayStyle, SkinViewMode } from "./renderer.ts";
import type { InternalObservationMode } from "./previewMeshBuffers.ts";
import type { SupportSiteClassification, SupportSiteDepthMode } from "./supportOverlayPresentation.ts";
import type { SupportPaintMode } from "./supportPaint.ts";
import { invokeExclusiveSupportPaintUndo, supportPaintOperationLabel } from "./supportPaintUndoRouting.ts";
import {
  VIEWPORT_CLIP_AXES,
  type ViewportClippingAction,
  type ViewportClippingBounds,
  type ViewportClippingState,
} from "./viewportClipping.ts";
import type { SurfaceAngleDiagnosisView } from "./surfaceAngleWorkerProtocol.ts";
import type { OpeningMeasurement } from "./openingMapWorkerProtocol.ts";
import type { DenseFlowerOpening } from "./denseFlowerSample.ts";
import type { DenseSampleView } from "./renderer.ts";
import { PATCH_MAX_POINTS } from "./shaders.ts";
import { EMPTY_ANNOTATION, type ElementAnnotationValue } from "../../lib/elementAnnotations.ts";
import { matchesElementSearch } from "../../lib/elementLabels.ts";
import type { PatchEditIntent } from "./elementTransform.ts";
import type { InternalPrintGateReport } from "./internalPrintGate.ts";
import type { BambuSupportType } from "./bambu3mf.ts";
import { enableMotifPreview3D, renderFlowerConnectionPreview, renderMotifPreview } from "./motifPreview.ts";
import { ring3dCenterlineDiameter } from "./motifReshape.ts";
import {
  describePartitionSelectionLabel,
  getTutorialStepContent,
  TUTORIAL_TOTAL_STEPS,
  type PartitionSelectionInfo,
  type TutorialStepId,
} from "./partitionTutorial.ts";

export interface PrintProfileUiSummary {
  profileName: string;
  profileSha256: string;
  matches: boolean;
  status: string;
  values: Array<[string, string]>;
}

export interface UiCallbacks {
  onUndo: () => void;
  onUndoSteps: (steps: number) => void;
  onHostParamChange: (key: keyof FieldParams, value: number | string) => void;
  onGrowHost: () => void;
  onRerollHost: () => void;
  onImportS1File: (file: File) => void;
  onSkinParamChange: (key: keyof SkinParams, value: number | string | boolean) => void;
  onPackPatches: () => void;
  /** Keep the primary organization and add smaller motifs only to its
   * largest remaining gaps. The realized result is stored in the recipe. */
  onFillLaceGaps: () => void;
  /** Replace surface elements with an editable reconstruction of the v6
   * visual principles. The exact preserved STL remains a reference. */
  onCreateDenseFlowerV6Style: () => Promise<void>;
  /** Diagnose distinct touching neighbours per realized motif. */
  onAnalyzeContacts: () => void;
  /** Reinforce motifs below the target using the selected local/whole mode. */
  onReinforceContacts: () => void;
  /** Remove only existing flower patches and pack them again with the
   * currently visible flower controls. Other patch shapes stay untouched. */
  onRepackFlowers: () => void;
  /** Switch the active viewport display (T12: raymarch / beads / full mesh). */
  onSetViewMode: (mode: SkinViewMode) => void;
  onSetDisplayStyle: (style: SkinDisplayStyle) => void;
  onSetInternalObservationMode: (mode: InternalObservationMode) => void;
  onViewportClippingAction: (action: ViewportClippingAction) => void;
  onDiagnoseSurfaceAngles: (thresholdDeg: number) => void;
  onShowSurfaceDiagnostics: () => string;
  onSetSurfaceAngleDiagnosisView: (view: SurfaceAngleDiagnosisView) => void;
  onSurfaceAngleThresholdChange: () => void;
  onToggleOverhangSupportSites: (show: boolean) => void;
  onSetOverhangSupportDepthMode: (mode: SupportSiteDepthMode) => void;
  onToggleMixedSupportFaces: (show: boolean) => void;
  onToggleSupportFootprint: (show: boolean) => void;
  onSetSupportPaintEnabled: (enabled: boolean) => void;
  onSetSupportPaintMode: (mode: SupportPaintMode) => void;
  onSetSupportPaintRadiusMm: (radiusMm: number) => void;
  onSetSupportPaintBackfaces: (enabled: boolean) => void;
  onUndoSupportPaint: () => void;
  onRedoSupportPaint: () => void;
  onResetSupportPaint: () => void;
  onSaveSupportPaintDraft: () => void;
  onLoadSupportPaintDraft: (file: File) => void;
  onVerifySupportPaintReprojection: () => void;
  onToggleMotifLowestPoints: (show: boolean, thresholdDeg: number) => void;
  onPreviewMeshResolutionChange: (resolution: number) => void;
  onCancelPreviewMesh: () => void;
  onToggleElementNames: (show: boolean) => void;
  onElementSelect: (patchId: number) => void;
  onElementAnnotationSave: (patchId: number, value: ElementAnnotationValue) => void;
  onElementEdit: (patchId: number, intent: PatchEditIntent) => void;
  onDuplicateElement: (patchId: number) => void;
  /** Regenerate exactly one selected motif from its local draft. */
  onReshapePatch: (patchId: number, params: MotifShapeParams, ringDiameter?: number) => boolean;
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
  onCancelMeshExport: () => void;
  onBambu3mfExport: (options: MeshUiOptions, supportType: BambuSupportType) => void;
  onImportPrintProfile: (file: File) => void;
  onSavePrintProfile: () => void;
  onMeasureOpenings: (options: OpeningMapUiOptions) => void;
  onOpenDenseFlowerSample: () => void;
  onDenseFlowerSampleView: (view: DenseSampleView) => void;
  onCancelOpeningMap: () => void;
  onClearOpeningMap: () => void;
  onOpeningMapDisplayCountChange: (count: number | "all") => void;
  onOpeningMapConditionsChange: () => void;
  /** Generate the current field as STL and send it directly to the local
   * Optimizer engine. No file hand-off or second screen is involved. */
  onPrintCheck: (options: MeshUiOptions) => void;
  /** Local, fail-closed Internal-only print gate for the fixed A1 mini
   * profile. Outer-SKIN support remains the slicer's responsibility. */
  onInternalPrintGate: (options: MeshUiOptions) => void;
  // --- Generation-native N partition ----------------------------------
  onProposeNPartition: (count: number) => void;
  onBuildNPartition: () => void;
  onCancelNPartitionBuild: () => void;
  onExportNPartition: () => void;
  // --- T13 coin由来A/B分割 ---------------------------------------------
  onToggleSeedPickMode: (active: boolean) => void;
  onProposeGroups: () => void;
  onAssignSelectedPatchToGroup: (group: "A" | "B") => void;
  onClearSeeds: () => void;
  onConfirmPartition: () => void;
  onBuildPartition: () => void;
  onCancelPartitionBuild: () => void;
  /** Only enabled once the gate (watertight + real mesh overlap/gap within
   * tolerance) passes -- see main.ts's evaluatePartitionGate. */
  onExportPartition: (parts: Array<"A" | "B">) => void;
  /** Always available once a build result exists, gate or no gate -- an
   * explicit, differently-labeled "検証用・非合格" escape hatch (audit fix
   * P0-3) so an out-of-tolerance result is never silently shipped as if it
   * were a normal export. */
  onExportPartitionVerification: (parts: Array<"A" | "B">) => void;
  /** Bead-preview-only toggle (A+B / Aのみ / Bのみ) -- does not affect export. */
  onSetPartitionPreviewFilter: (filter: "both" | "A" | "B") => void;
  // --- A/B partition guided tutorial (optional overlay; no geometry change) ---
  onTutorialOpen: () => void;
  onTutorialClose: () => void;
  onTutorialPrev: () => void;
  onTutorialAdvance: () => void;
  onTutorialRestart: () => void;
  /** Stop browsing a past step and jump the displayed page back to the real
   * workflow position. */
  onTutorialReturnToCurrent: () => void;
}

export interface UiHandles {
  root: HTMLElement;
  displayToolsRoot: HTMLElement;
  historyIoRoot: HTMLElement;
  setHistoryCount: (n: number) => void;
  setUndoHistory: (labels: string[]) => void;
  setUndoStatus: (text: string) => void;
  setShapeUndoLocked: (locked: boolean) => void;
  setFps: (fps: number) => void;
  setCounts: (hostBalls: number, patches: number) => void;
  setSelectionInfo: (text: string) => void;
  setElementRegistry: (rows: Array<{ id: number; name: string; annotation: ElementAnnotationValue }>, selectedId: number | null) => void;
  setElementEditStatus: (text: string, ok?: boolean) => void;
  getElementMoveStep: () => number;
  setSelectedMotif: (
    patch: Patch | null,
    current: SkinParams,
    eligibility: { ok: boolean; reason?: string },
  ) => void;
  setMotifReshapeStatus: (text: string, ok?: boolean) => void;
  setGauges: (
    mortar: MortarReport,
    coverage: CoverageReport,
    patchComponents: number,
    mmPerUnit: number,
    linking: SkinLinkingReport,
    overlaps: SkinOverlapWarning[],
  ) => void;
  setPackResult: (result: PackPatchesResult | null) => void;
  setContactStatus: (text: string, ok?: boolean) => void;
  syncHostParams: (params: FieldParams) => void;
  syncSkinParams: (params: SkinParams) => void;
  updateMotifPreview: (params: SkinParams) => void;
  setMode: (mode: SkinMode) => void;
  setAddPatchModeActive: (active: boolean) => void;
  setMeshStatus: (text: string, ok?: boolean) => void;
  setMeshExportRunning: (running: boolean) => void;
  setBambu3mfExportRunning: (running: boolean) => void;
  setBambu3mfExportStatus: (text: string, ok?: boolean) => void;
  setPrintProfileSummary: (summary: PrintProfileUiSummary | null) => void;
  setMeshOptions: (options: MeshUiOptions) => void;
  setInternalPrintGateExportAllowed: (allowed: boolean, required: boolean) => void;
  setPrintCheckRunning: (running: boolean) => void;
  setPrintCheckStatus: (text: string, ok?: boolean) => void;
  setPrintCheckMetrics: (metrics: PrintCheckMetrics | null) => void;
  setInternalPrintGateRunning: (running: boolean) => void;
  setInternalPrintGateStatus: (text: string, ok?: boolean) => void;
  setInternalPrintGateReport: (report: InternalPrintGateReport | null) => void;
  setNPartitionProposal: (text: string, groupCount?: number) => void;
  setNPartitionStatus: (text: string, ok?: boolean) => void;
  setNPartitionMetrics: (text: string) => void;
  setNPartitionBuildRunning: (running: boolean) => void;
  setNPartitionExportEnabled: (enabled: boolean) => void;
  getNPartitionCount: () => number;
  // --- T13 coin由来A/B分割 ---------------------------------------------
  setSeedPickModeActive: (active: boolean) => void;
  setPartitionDraftInfo: (text: string) => void;
  /** T14: the always-visible "選択中Patch: #ID / 現在 A（青）" line next to
   * the A/B assign buttons, and the buttons' enabled state (disabled when
   * null -- nothing selected to assign). Independent of setSelectionInfo's
   * far-away general patch info; this one lives right where the A/B
   * decision is made (作者方針 "A/Bボタンと同時に視界へ入る位置"). */
  setPartitionSelectedPatch: (info: PartitionSelectionInfo | null) => void;
  /** T15 P1: static emphasis border/background on the Aへ/Bへ row --
   * SEPARATE from setPartitionSelectedPatch because emphasis must only show
   * while the author is actually in an A/B workflow context (selection-
   * final-polish P1: a plain patch pick during ordinary Pack/delete/mesh
   * work must not make A/B assignment look like the primary action). The
   * label text and button-enabled state, by contrast, simply reflect "is
   * something selected" and stay wired to setPartitionSelectedPatch. */
  setPartitionActionEmphasis: (active: boolean) => void;
  setPartitionStatus: (text: string, ok?: boolean) => void;
  setPartitionMetrics: (text: string) => void;
  setPartitionExportEnabled: (enabled: boolean) => void;
  setPartitionVerificationExportEnabled: (enabled: boolean) => void;
  /** Disables "分割してメッシュ化" while a Worker request is in flight
   * (prevents double-invocation) and enables/disables "キャンセル" inversely. */
  setPartitionBuildRunning: (running: boolean) => void;
  /**
   * Compact in-panel A/B guide card. When closed, only the start button shows.
   * Does not block canvas or existing controls. Highlights are non-modal CSS
   * outline only (no click-blocking overlay).
   */
  setPartitionTutorial: (state: {
    open: boolean;
    /** The step currently being READ (may be a past step, see isViewingPast). */
    step: TutorialStepId;
    /** The real workflow's step (derivePartitionTutorialStep), never rewound. */
    actualStep: TutorialStepId;
    /** True when `step` is a past step, not the real workflow position. */
    isViewingPast: boolean;
    canPrev: boolean;
    canAdvance: boolean;
    /** "confirm" = advancing may set a review flag (only possible at the real
     * step 4/5); "next" = advancing only turns the displayed page; "none" =
     * no advance control shown. */
    advanceMode: "confirm" | "next" | "none";
  }) => void;
  /** Update the three-way view toggle's active button + honest caption
   * (approximation disclosure for beads, capacity note for raymarch). */
  setViewMode: (mode: SkinViewMode, totalPatchPoints: number, coinBulge: number) => void;
  setDisplayStyle: (style: SkinDisplayStyle) => void;
  setInternalObservationMode: (mode: InternalObservationMode) => void;
  setViewportClippingState: (available: boolean, bounds: ViewportClippingBounds | null, state: ViewportClippingState) => void;
  setSurfaceAngleDiagnosisRunning: (running: boolean) => void;
  setSurfaceAngleDiagnosisStatus: (text: string, ok?: boolean) => void;
  setSurfaceStartupStatus: (text: string, ok?: boolean) => void;
  setSurfaceAngleDiagnosisView: (view: SurfaceAngleDiagnosisView, available: boolean, hasInternal: boolean) => void;
  setOverhangSupportSiteOverlay: (available: boolean, show: boolean, showMixed: boolean, showFootprint: boolean, depthMode: SupportSiteDepthMode, text: string, ok?: boolean) => void;
  setOverhangSupportSiteSelection: (text: string, classification?: SupportSiteClassification) => void;
  setSupportPaintState: (state: {
    available: boolean; enabled: boolean; mode: SupportPaintMode; radiusMm: number; paintBackfaces: boolean;
    operationCount: number; sampleCount: number; paintedSiteCount: number; manualOverrideSiteCount: number; canUndo: boolean; canRedo: boolean; status: string;
    canSaveDraft: boolean; draftStatus: string;
    editingResolution: number | null; printResolution: number; canVerifyReprojection: boolean; reprojectionStatus: string;
  }) => void;
  setMotifLowestPointStatus: (text: string, ok?: boolean) => void;
  getSurfaceAngleThreshold: () => number;
  setSurfaceAngleThreshold: (value: number) => void;
  /** Status for the non-blocking low-resolution mesh preview Worker. */
  setMeshPreviewStatus: (text: string, running?: boolean) => void;
  /** Show/hide the "自動でビーズ表示に切り替えました" banner (T12 §2). */
  setAutoSwitchNotice: (active: boolean) => void;
  /** Re-render just the shape-selector buttons' active state (T12 bugfix --
   * clicking a shape button used to leave the OLD shape looking selected
   * until the next full syncSkinParams(), e.g. after a history import). */
  setPatchShape: (shape: PatchShape) => void;
  setMotifPlacement: (placement: MotifPlacement) => void;
  setLaceMotifPlacement: (placement: MotifPlacement) => void;
  setSurfaceGenerationMode: (mode: SurfaceGenerationMode) => void;
  setInternalStructure: (mode: InternalStructureMode) => void;
  setInternalStructureStatus: (text: string, ok?: boolean) => void;
  setQuadFlowStatus: (text: string, ok?: boolean) => void;
  setVoronoiStatus: (text: string, ok?: boolean) => void;
  setGoldbergStatus: (text: string, ok?: boolean) => void;
  getMeshOptions: () => MeshUiOptions;
  setOpeningMapRunning: (running: boolean) => void;
  setOpeningMapStatus: (text: string, ok?: boolean) => void;
  setOpeningMapResults: (openings: OpeningMeasurement[] | null, displayed: number, likelyMergedByOffset?: boolean) => void;
  setDenseFlowerSampleRunning: (running: boolean) => void;
  setDenseFlowerSampleActive: (active: boolean, view?: DenseSampleView) => void;
  setDenseFlowerSampleResults: (openings: DenseFlowerOpening[], total: number) => void;
  clearOpeningMap: () => void;
}

export interface MeshUiOptions {
  resolution: number;
  targetLongestMm: number;
}

export interface OpeningMapUiOptions extends MeshUiOptions {
  resolution: number;
  automaticOffset: boolean;
  offsetMm: number;
  minAreaMm2: number;
}

export interface PrintCheckMetrics {
  topology: string;
  size: string;
  wall: string;
  internalSupport: string;
  bestOrientation: string;
}

const HOST_SPECS: { key: keyof FieldParams; label: string; min: number; max: number; step: number }[] = [
  { key: "count", label: "球の数", min: 1, max: 40, step: 1 },
  { key: "radiusBase", label: "半径", min: 0.15, max: 1.5, step: 0.01 },
  { key: "radiusSpread", label: "半径のばらつき", min: 0, max: 1.5, step: 0.01 },
  { key: "k", label: "ブレンド強さ k", min: 0, max: 1.5, step: 0.01 },
];

const SKIN_SPECS: { key: keyof SkinParams; label: string; min: number; max: number; step: number }[] = [
  { key: "thickness", label: "殻の厚み（プレート板厚）", min: 0.02, max: 0.4, step: 0.005 },
  { key: "minR", label: "詰める形の大きさ 下限", min: 0.03, max: 0.4, step: 0.005 },
  { key: "maxR", label: "詰める形の大きさ 上限", min: 0.06, max: 0.8, step: 0.01 },
  { key: "irregularity", label: "形の不揃い（コインのみ）", min: 0, max: 1, step: 0.01 },
  // T11 §2: negative side = 重なり許容（絡みの偶発装置）。
  { key: "gap", label: "目地 g（負=重なり許容）", min: -0.3, max: 0.3, step: 0.005 },
  { key: "attempts", label: "詰め込みの強さ (試行数)", min: 20, max: 4000, step: 20 },
  { key: "roundK", label: "丸さ k (合成の滑らかさ)", min: 0, max: 0.4, step: 0.005 },
  { key: "coinHoleRatio", label: "コインの中央穴", min: 0, max: 0.95, step: 0.01 },
  // T14 coin-bulge experiment (作者Observation 2026-07-20). 既定0 = 従来形状
  // と数式一致。コイン形状の plate mode だけに効く -- flatRing/ring3d/window
  // modeは無変化（field.ts's compositeSdf 参照）。
  { key: "coinBulge", label: "コイン中央のふくらみ", min: 0, max: 0.32, step: 0.005 },
  { key: "coinBulgeBalance", label: "表裏バランス（−裏 / ＋表）", min: -1, max: 1, step: 0.01 },
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
  ["flower", "花モチーフ"],
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
  const displayToolsRoot = document.createElement("div");
  displayToolsRoot.className = "skin-display-tools";
  const displayToolsTitle = document.createElement("strong");
  displayToolsTitle.className = "skin-display-tools-title";
  displayToolsTitle.textContent = "表示";
  displayToolsRoot.appendChild(displayToolsTitle);

  const undoDock = document.createElement("div");
  undoDock.className = "history-undo-dock";
  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.className = "history-undo-button";
  undoButton.textContent = "↶ 形状を戻す";
  undoButton.title = "形状履歴を1つ戻します。Support Paint中は無効です";
  undoButton.setAttribute("aria-label", "形状履歴を1つ戻す");
  undoButton.onclick = () => callbacks.onUndo();
  const undoMeta = document.createElement("div");
  undoMeta.className = "history-undo-meta";
  const undoCount = document.createElement("span");
  const undoShortcut = document.createElement("kbd");
  undoShortcut.textContent = "Ctrl+Z";
  undoMeta.append(undoCount, undoShortcut);
  const undoStatus = document.createElement("div");
  undoStatus.className = "history-undo-status";
  undoStatus.setAttribute("aria-live", "polite");
  const undoHistorySelect = document.createElement("select");
  undoHistorySelect.className = "history-undo-select";
  undoHistorySelect.setAttribute("aria-label", "戻す履歴を選ぶ");
  const undoManyButton = document.createElement("button");
  undoManyButton.type = "button";
  undoManyButton.className = "history-undo-many";
  undoManyButton.textContent = "選んだ所まで戻す";
  undoManyButton.onclick = () => callbacks.onUndoSteps(Math.max(1, Number(undoHistorySelect.value) || 1));
  undoDock.append(undoButton, undoMeta, undoHistorySelect, undoManyButton, undoStatus);
  let shapeUndoLocked = false;
  let shapeUndoableCount = 0;
  let shapeUndoHistoryAvailable = false;
  const syncShapeUndoLock = () => {
    undoButton.disabled = shapeUndoLocked || shapeUndoableCount === 0;
    undoHistorySelect.disabled = shapeUndoLocked || !shapeUndoHistoryAvailable;
    undoManyButton.disabled = shapeUndoLocked || !shapeUndoHistoryAvailable;
    undoDock.classList.toggle("is-paint-locked", shapeUndoLocked);
    undoShortcut.textContent = shapeUndoLocked ? "Paint中は無効" : "Ctrl+Z";
    if (shapeUndoLocked) undoStatus.textContent = "Paint中のUndoは右のSupport Paint Undoへ送られます";
  };
  // History actions belong to the left tools pane so they never cover the
  // one/four-view canvas. The callback and shared history remain unchanged.
  displayToolsRoot.appendChild(undoDock);

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "表面に詰める — Surface Patch Packing (S-skin)";
  root.appendChild(title);

  const versionRow = createVersionRow(version, updatedAt);
  root.appendChild(versionRow);

  const counts = document.createElement("div");
  counts.className = "ball-count";
  root.appendChild(counts);

  // --- Mode toggle (この Study の眼目) --------------------------------------
  const modeTitle = document.createElement("div");
  modeTitle.className = "section-title";
  modeTitle.textContent = "出力の見方（後から変更できます）";
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
  hostTitle.id = "skin-step-base";
  hostTitle.className = "workflow-step-title";
  hostTitle.textContent = "FORM / 1 Base";
  root.appendChild(hostTitle);
  const hostLead = document.createElement("div");
  hostLead.className = "workflow-step-lead";
  hostLead.textContent = "まず表面を持つ元のかたちを作るか、S1のレシピを読み込みます。";
  root.appendChild(hostLead);

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
  s1ImportRow.after(modeTitle, modeToggle, modeExplainer);

  root.appendChild(document.createElement("hr"));

  // --- Skin (patch) section -----------------------------------------------
  const skinTitle = document.createElement("div");
  skinTitle.id = "skin-step-surface";
  skinTitle.className = "workflow-step-title";
  skinTitle.textContent = "SURFACE / 2 Surface composition";
  root.appendChild(skinTitle);

  const generationTitle = document.createElement("div");
  generationTitle.className = "workflow-step-lead";
  generationTitle.textContent = "使える方式と、これから実装する候補を一度に比較できます。";
  root.appendChild(generationTitle);
  const generationRow = document.createElement("div");
  generationRow.className = "surface-variation-grid";
  type SurfaceVariationId = "random" | "regularQuad" | "variedQuad" | "fieldQuad" | "voronoi" | "goldberg";
  const surfaceVariationButtons = new Map<SurfaceVariationId, HTMLButtonElement>();
  const surfaceVariations: Array<{
    id: SurfaceVariationId;
    name: string;
    description: string;
    state: "available" | "prototype" | "research";
  }> = [
    { id: "random", name: "ランダムPACK", description: "大小を混ぜて自由に詰める", state: "available" },
    { id: "regularQuad", name: "均一クアッド", description: "同じ密度の四角形で覆う", state: "available" },
    { id: "variedQuad", name: "不均一クアッド", description: "四角形の大きさを揺らす", state: "available" },
    { id: "fieldQuad", name: "曲率密度クアッド", description: "曲がりの強い所へセルを寄せる", state: "prototype" },
    { id: "voronoi", name: "Voronoi / CVT", description: "不規則な領域で表面を覆う", state: "prototype" },
    { id: "goldberg", name: "六角形＋五角形", description: "12個の五角役物と六角領域", state: "prototype" },
  ];
  let activeGenerationMode = skinParams.surfaceGenerationMode;
  let activeQuadTilingMode = skinParams.quadTilingMode;
  for (const variation of surfaceVariations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "surface-variation-card";
    const cardName = document.createElement("span");
    cardName.className = "surface-variation-name";
    cardName.textContent = variation.name;
    const cardDescription = document.createElement("span");
    cardDescription.className = "surface-variation-description";
    cardDescription.textContent = variation.description;
    const cardState = document.createElement("span");
    cardState.className = `surface-variation-state ${variation.state === "research" ? "research" : "available"}`;
    cardState.textContent = variation.state === "available" ? "使用可"
      : variation.state === "prototype" ? "試作可" : "研究候補";
    button.append(cardName, cardDescription, cardState);
    button.disabled = variation.state === "research";
    if (variation.state !== "research") button.onclick = () => {
      if (variation.id === "random") {
        renderSurfaceGenerationMode("randomPack");
        callbacks.onSkinParamChange("surfaceGenerationMode", "randomPack");
        return;
      }
      if (variation.id === "voronoi") {
        renderSurfaceGenerationMode("voronoi");
        callbacks.onSkinParamChange("surfaceGenerationMode", "voronoi");
        return;
      }
      if (variation.id === "goldberg") {
        renderSurfaceGenerationMode("goldberg");
        callbacks.onSkinParamChange("surfaceGenerationMode", "goldberg");
        return;
      }
      const tilingMode: QuadTilingMode = variation.id === "variedQuad" ? "varied"
        : variation.id === "fieldQuad" ? "field" : "regular";
      renderSurfaceGenerationMode("quadFlow");
      renderQuadTilingMode(tilingMode);
      callbacks.onSkinParamChange("surfaceGenerationMode", "quadFlow");
      callbacks.onSkinParamChange("quadTilingMode", tilingMode);
    };
    surfaceVariationButtons.set(variation.id, button);
    generationRow.appendChild(button);
  }
  root.appendChild(generationRow);

  const quadFlowPanel = document.createElement("div");
  quadFlowPanel.className = "shape-specific quad-flow-panel";
  const quadFlowHint = document.createElement("div");
  quadFlowHint.className = "hint";
  quadFlowHint.textContent = "選んだ形を各セルいっぱいに変形します。接続は共有辺の隙間に最も近い球だけを大きくします。橙は将来の役物候補です。";
  quadFlowPanel.appendChild(quadFlowHint);
  const quadDivisionsSlider = buildSlider(
    "面ごとの分割数",
    2,
    10,
    1,
    skinParams.quadDivisions,
    (value) => callbacks.onSkinParamChange("quadDivisions", Math.round(value)),
  );
  quadFlowPanel.appendChild(quadDivisionsSlider.row);

  const quadVariationSlider = buildSlider(
    "セル寸法のばらつき",
    0,
    0.45,
    0.01,
    skinParams.quadSizeVariation,
    (value) => callbacks.onSkinParamChange("quadSizeVariation", value),
  );
  quadFlowPanel.appendChild(quadVariationSlider.row);
  const quadCurvatureSlider = buildSlider(
    "曲率への寄せ方",
    0,
    1,
    0.01,
    skinParams.quadCurvatureAttraction,
    (value) => callbacks.onSkinParamChange("quadCurvatureAttraction", value),
  );
  quadFlowPanel.appendChild(quadCurvatureSlider.row);
  function renderQuadTilingMode(mode: QuadTilingMode): void {
    activeQuadTilingMode = mode;
    quadVariationSlider.row.hidden = mode !== "varied";
    quadCurvatureSlider.row.hidden = mode !== "field";
    renderSurfaceVariationCards();
  }
  renderQuadTilingMode(skinParams.quadTilingMode);

  const quadConnectionAdjustment = document.createElement("div");
  quadConnectionAdjustment.className = "quad-connection-adjustment";
  const quadConnectionTitle = document.createElement("div");
  quadConnectionTitle.className = "motif-connection-title";
  quadConnectionTitle.textContent = "隣同士のつながり";
  quadConnectionAdjustment.appendChild(quadConnectionTitle);
  const quadConnectionRow = document.createElement("div");
  quadConnectionRow.className = "mode-toggle";
  const quadConnectionButtons = new Map<QuadConnectionMode, HTMLButtonElement>();
  for (const [mode, label] of [
    ["local", "隙間だけつなぐ"],
    ["separate", "離して並べる"],
  ] as Array<[QuadConnectionMode, string]>) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => {
      renderQuadConnectionMode(mode);
      callbacks.onSkinParamChange("quadConnectionMode", mode);
    };
    quadConnectionButtons.set(mode, button);
    quadConnectionRow.appendChild(button);
  }
  quadConnectionAdjustment.appendChild(quadConnectionRow);
  const quadConnectionDepthSlider = buildSlider(
    "接合の重なり",
    0,
    2,
    0.05,
    skinParams.quadConnectionDepth,
    (value) => callbacks.onSkinParamChange("quadConnectionDepth", value),
  );
  quadConnectionAdjustment.appendChild(quadConnectionDepthSlider.row);
  const quadMeshJoinSlider = buildSlider(
    "メッシュ接合の太さ",
    0,
    0.25,
    0.01,
    skinParams.quadMeshJoinWidth,
    (value) => callbacks.onSkinParamChange("quadMeshJoinWidth", value),
  );
  quadConnectionAdjustment.appendChild(quadMeshJoinSlider.row);
  function renderQuadConnectionMode(mode: QuadConnectionMode): void {
    for (const [candidate, button] of quadConnectionButtons) {
      button.classList.toggle("mode-active", candidate === mode);
    }
    quadConnectionDepthSlider.row.hidden = mode !== "local";
    quadMeshJoinSlider.row.hidden = mode !== "local";
  }
  renderQuadConnectionMode(skinParams.quadConnectionMode);
  const quadConnectionWarning = document.createElement("div");
  quadConnectionWarning.className = "hint";
  quadConnectionAdjustment.appendChild(quadConnectionWarning);
  function renderQuadConnectionWarning(shape: PatchShape): void {
    quadConnectionWarning.textContent = shape === "flatRing" || shape === "ring3d"
      ? "元のリング節は太らせず、隙間方向へ短い接続部を伸ばします。輪の穴を保ったまま接続を試みます。"
      : "元の形全体は太らせず、隙間方向へ短い接続部だけを伸ばします。";
  }
  renderQuadConnectionWarning(skinParams.patchShape);

  const quadFlowStatus = document.createElement("div");
  quadFlowStatus.className = "quad-flow-status";
  quadFlowStatus.textContent = "格子を準備中";
  quadFlowPanel.appendChild(quadFlowStatus);
  const tilingResearch = document.createElement("details");
  tilingResearch.className = "flower-details";
  const tilingResearchSummary = document.createElement("summary");
  tilingResearchSummary.textContent = "次の表面充填・印刷分割案";
  tilingResearch.appendChild(tilingResearchSummary);
  const tilingResearchBody = document.createElement("div");
  tilingResearchBody.className = "hint";
  tilingResearchBody.textContent =
    "曲率密度クアッド、Voronoi/CVT、六角形＋12個の五角役物まで試作できます。いずれも厳密なリメッシュや専用多角形輪郭ではありません。印刷分割はモチーフを横切らずセル境界をつなぎ、造形範囲・支持・継ぎ目の見え方・接合面積を同時に評価します。";
  tilingResearch.appendChild(tilingResearchBody);
  quadFlowPanel.appendChild(tilingResearch);
  root.appendChild(quadFlowPanel);

  const voronoiPanel = document.createElement("div");
  voronoiPanel.className = "shape-specific voronoi-flow-panel";
  const voronoiHint = document.createElement("div");
  voronoiHint.className = "hint";
  voronoiHint.textContent =
    "球面上で種点を均し、ホスト表面へ投影する試作です。いまはVoronoi多角形そのものではなく、種点と近傍関係に沿って形を配置します。";
  voronoiPanel.appendChild(voronoiHint);
  const voronoiSeedSlider = buildSlider(
    "種点（詰める数）", 24, 400, 1, skinParams.voronoiSeedCount,
    (value) => callbacks.onSkinParamChange("voronoiSeedCount", Math.round(value)),
  );
  voronoiPanel.appendChild(voronoiSeedSlider.row);
  const voronoiRelaxationSlider = buildSlider(
    "均し回数", 0, 5, 1, skinParams.voronoiRelaxationSteps,
    (value) => callbacks.onSkinParamChange("voronoiRelaxationSteps", Math.round(value)),
  );
  voronoiPanel.appendChild(voronoiRelaxationSlider.row);
  const voronoiStatus = document.createElement("div");
  voronoiStatus.className = "quad-flow-status";
  voronoiStatus.textContent = "種点を準備中";
  voronoiPanel.appendChild(voronoiStatus);
  root.appendChild(voronoiPanel);

  const goldbergPanel = document.createElement("div");
  goldbergPanel.className = "shape-specific goldberg-flow-panel";
  const goldbergHint = document.createElement("div");
  goldbergHint.className = "hint";
  goldbergHint.textContent =
    "正二十面体を細分し、12個の五角価点と残りの六角価点を保ったままホスト表面へ投影します。専用の五角形・六角形輪郭ではなく、選んだ形を各点へ配置する試作です。";
  goldbergPanel.appendChild(goldbergHint);
  const goldbergFrequencySlider = buildSlider(
    "細分の密度", 1, 6, 1, skinParams.goldbergFrequency,
    (value) => callbacks.onSkinParamChange("goldbergFrequency", Math.round(value)),
  );
  goldbergPanel.appendChild(goldbergFrequencySlider.row);
  const goldbergStatus = document.createElement("div");
  goldbergStatus.className = "quad-flow-status";
  goldbergStatus.textContent = "六角形＋五角形を準備中";
  goldbergPanel.appendChild(goldbergStatus);
  root.appendChild(goldbergPanel);

  function renderSurfaceGenerationMode(generationMode: SurfaceGenerationMode): void {
    activeGenerationMode = generationMode;
    quadFlowPanel.hidden = generationMode !== "quadFlow";
    voronoiPanel.hidden = generationMode !== "voronoi";
    goldbergPanel.hidden = generationMode !== "goldberg";
    quadConnectionAdjustment.hidden = generationMode === "randomPack";
    renderSurfaceVariationCards();
  }
  function renderSurfaceVariationCards(): void {
    const activeId: SurfaceVariationId = activeGenerationMode === "randomPack" ? "random"
      : activeGenerationMode === "voronoi" ? "voronoi"
      : activeGenerationMode === "goldberg" ? "goldberg"
      : activeQuadTilingMode === "field" ? "fieldQuad"
      : activeQuadTilingMode === "varied" ? "variedQuad" : "regularQuad";
    for (const [id, button] of surfaceVariationButtons) button.classList.toggle("mode-active", id === activeId);
  }
  renderSurfaceGenerationMode(skinParams.surfaceGenerationMode);

  // --- Patch shape (T11 §1) ------------------------------------------------
  const shapeRow = document.createElement("div");
  const shapeTitle = document.createElement("div");
  shapeTitle.id = "skin-step-shape";
  shapeTitle.className = "workflow-step-title";
  shapeTitle.textContent = "SURFACE / 3 Filled Shape";
  root.appendChild(shapeTitle);
  const shapeLead = document.createElement("div");
  shapeLead.className = "workflow-step-lead";
  shapeLead.textContent = "表面へ繰り返す単位を選びます。4種類すべて同じ接続・分割へ進めます。";
  root.appendChild(shapeLead);
  shapeRow.className = "shape-card-grid";
  const shapeButtons: Record<PatchShape, HTMLButtonElement> = {} as Record<PatchShape, HTMLButtonElement>;
  for (const [shape, label] of SHAPE_LABELS) {
    const btn = document.createElement("button");
    btn.className = "shape-card";
    const name = document.createElement("span");
    name.className = "shape-card-name";
    name.textContent = label;
    const description = document.createElement("span");
    description.className = "shape-card-description";
    description.textContent = shape === "coin" ? "面をつくる塊"
      : shape === "flatRing" ? "穴のある薄い輪"
      : shape === "ring3d" ? "数珠状の立体ループ"
      : "花弁と花芯のモチーフ";
    btn.append(name, description);
    btn.onclick = () => callbacks.onSkinParamChange("patchShape", shape);
    shapeButtons[shape] = btn;
    shapeRow.appendChild(btn);
  }
  root.appendChild(shapeRow);
  function renderShapeButtons(shape: PatchShape): void {
    for (const [s, btn] of Object.entries(shapeButtons) as [PatchShape, HTMLButtonElement][]) {
      btn.classList.toggle("mode-active", s === shape);
    }
    renderQuadConnectionWarning(shape);
  }
  renderShapeButtons(skinParams.patchShape);

  const placementTitle = document.createElement("div");
  placementTitle.className = "section-title";
  placementTitle.textContent = "ベースに対する生成位置";
  root.appendChild(placementTitle);
  const placementToggle = document.createElement("div");
  placementToggle.className = "mode-toggle motif-placement-toggle";
  const placementButtons = new Map<MotifPlacement, HTMLButtonElement>();
  const placementChoices: Array<[MotifPlacement, string]> = [
    ["surface", "表面（現在）"],
    ["center", "面を中心"],
    ["inside", "内側"],
  ];
  for (const [placement, label] of placementChoices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => callbacks.onSkinParamChange("motifPlacement", placement);
    placementButtons.set(placement, button);
    placementToggle.appendChild(button);
  }
  root.appendChild(placementToggle);
  const placementHint = document.createElement("div");
  placementHint.className = "hint";
  placementHint.textContent = "表面は従来どおり。面を中心は形の厚み中心を基準面へ合わせ、内側は形全体をベース内へ収めます。次の生成から反映します。";
  root.appendChild(placementHint);
  function renderMotifPlacement(placement: MotifPlacement): void {
    for (const [candidate, button] of placementButtons) button.classList.toggle("mode-active", candidate === placement);
  }
  renderMotifPlacement(skinParams.motifPlacement ?? "surface");

  const shapeHint = document.createElement("div");
  shapeHint.className = "hint";
  shapeHint.textContent =
    "次の「詰める」から選んだ形を使います。花モチーフはPACK-SPIKEと同じ定義を自由曲面へ沿わせます。";
  root.appendChild(shapeHint);

  const adjustmentTitle = document.createElement("div");
  adjustmentTitle.id = "skin-step-adjust";
  adjustmentTitle.className = "workflow-step-title";
  adjustmentTitle.textContent = "SURFACE / 4 Surface mesh generation";
  root.appendChild(adjustmentTitle);
  const adjustmentLead = document.createElement("div");
  adjustmentLead.className = "workflow-step-lead";
  adjustmentLead.textContent = "選択中の形に必要な項目だけを表示します。詳細値は折りたためます。";
  root.appendChild(adjustmentLead);

  const motifPreview = document.createElement("section");
  motifPreview.className = "motif-live-preview";
  const motifPreviewHeader = document.createElement("div");
  motifPreviewHeader.className = "motif-live-preview-header";
  const motifPreviewTitle = document.createElement("strong");
  motifPreviewTitle.textContent = "選んだ形・3Dプレビュー";
  const motifPreviewBadge = document.createElement("span");
  motifPreviewHeader.append(motifPreviewTitle, motifPreviewBadge);
  const motifPreviewCanvas = document.createElement("canvas");
  motifPreviewCanvas.width = 640;
  motifPreviewCanvas.height = 360;
  motifPreviewCanvas.setAttribute("aria-label", "選択中の形状パラメータの回転可能な3Dプレビュー");
  enableMotifPreview3D(motifPreviewCanvas);
  const motifPreviewHint = document.createElement("div");
  motifPreviewHint.className = "motif-live-preview-hint";
  motifPreviewHint.textContent = "ドラッグで回転、ホイールで拡大縮小できます。曲面への沿い方と印刷結果は生成後に確認します。";
  const motifConnectionTitle = document.createElement("div");
  motifConnectionTitle.className = "motif-connection-preview-title";
  motifConnectionTitle.textContent = "ランダムPACK・花のつながり";
  const motifConnectionCanvas = document.createElement("canvas");
  motifConnectionCanvas.className = "motif-connection-preview-canvas";
  motifConnectionCanvas.width = 640;
  motifConnectionCanvas.height = 200;
  motifConnectionCanvas.setAttribute("aria-label", "融合量と花の接続方法の関係図");
  motifPreview.append(motifPreviewHeader, motifPreviewCanvas, motifPreviewHint, motifConnectionTitle, motifConnectionCanvas);
  root.appendChild(motifPreview);
  let motifPreviewParams: SkinParams = { ...skinParams };
  function updateMotifPreview(params: SkinParams): void {
    motifPreviewParams = { ...params };
    const shapeLabel = SHAPE_LABELS.find(([shape]) => shape === params.patchShape)?.[1] ?? params.patchShape;
    const placementLabel = placementChoices.find(([placement]) => placement === (params.motifPlacement ?? "surface"))?.[1] ?? "表面";
    motifPreviewBadge.textContent = `${shapeLabel} · ${placementLabel}`;
    renderMotifPreview(motifPreviewCanvas, motifPreviewParams);
    const showConnection = params.patchShape === "flower" && params.surfaceGenerationMode === "randomPack";
    motifConnectionTitle.hidden = !showConnection;
    motifConnectionCanvas.hidden = !showConnection;
    if (showConnection) renderFlowerConnectionPreview(motifConnectionCanvas, motifPreviewParams);
  }
  updateMotifPreview(motifPreviewParams);
  root.appendChild(quadConnectionAdjustment);

  const flowerMotifPanel = document.createElement("div");
  flowerMotifPanel.className = "shape-specific motif-picker";
  const flowerMotifTitle = document.createElement("div");
  flowerMotifTitle.className = "section-title";
  flowerMotifTitle.textContent = "PACK-SPIKE / MOTIF ON SURFACE";
  flowerMotifPanel.appendChild(flowerMotifTitle);
  const flowerMotifButtonsRow = document.createElement("div");
  flowerMotifButtonsRow.className = "motif-preset-grid";
  const flowerMotifButtons = new Map<FlowerMotifPresetId, HTMLButtonElement>();
  let activeFlowerPreset: FlowerMotifPresetId = skinParams.flowerMotifPreset;
  for (const preset of PACKING_MOTIF_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.onclick = () => {
      applyFlowerPreset(preset.id);
    };
    flowerMotifButtons.set(preset.id, button);
    flowerMotifButtonsRow.appendChild(button);
  }
  flowerMotifPanel.appendChild(flowerMotifButtonsRow);

  const flowerCustomTitle = document.createElement("div");
  flowerCustomTitle.className = "motif-connection-title";
  flowerCustomTitle.textContent = "花を調整";
  flowerMotifPanel.appendChild(flowerCustomTitle);

  const flowerSliders = new Map<keyof SkinParams, { set: (value: number) => void }>();
  function markFlowerCustom(): void {
    if (activeFlowerPreset === "custom") return;
    renderFlowerMotifPreset("custom");
    callbacks.onSkinParamChange("flowerMotifPreset", "custom");
  }
  function addFlowerSlider(
    parent: HTMLElement,
    key: keyof SkinParams,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void {
    const built = buildSlider(label, min, max, step, Number(skinParams[key]), (value) => {
      markFlowerCustom();
      callbacks.onSkinParamChange(key, step >= 1 ? Math.round(value) : value);
    });
    flowerSliders.set(key, built);
    parent.appendChild(built.row);
  }

  addFlowerSlider(flowerMotifPanel, "flowerPetalCount", "花弁の数", 3, 12, 1);

  const flowerCoreRow = document.createElement("div");
  flowerCoreRow.className = "mode-toggle flower-core-toggle";
  const flowerCoreOn = document.createElement("button");
  flowerCoreOn.type = "button";
  flowerCoreOn.textContent = "花芯あり";
  const flowerCoreOff = document.createElement("button");
  flowerCoreOff.type = "button";
  flowerCoreOff.textContent = "花芯なし";
  flowerCoreRow.append(flowerCoreOn, flowerCoreOff);
  flowerMotifPanel.appendChild(flowerCoreRow);
  function renderFlowerCore(showCore: boolean): void {
    flowerCoreOn.classList.toggle("mode-active", showCore);
    flowerCoreOff.classList.toggle("mode-active", !showCore);
  }
  function setFlowerCore(showCore: boolean): void {
    markFlowerCustom();
    renderFlowerCore(showCore);
    callbacks.onSkinParamChange("flowerShowCore", showCore);
  }
  flowerCoreOn.onclick = () => setFlowerCore(true);
  flowerCoreOff.onclick = () => setFlowerCore(false);
  renderFlowerCore(skinParams.flowerShowCore);

  addFlowerSlider(flowerMotifPanel, "flowerExpansion", "ランダムPACKの融合", 0, 2, 0.05);
  const flowerExpansionHint = document.createElement("div");
  flowerExpansionHint.className = "hint";
  flowerExpansionHint.textContent = "ランダムPACK専用。QUAD-FLOWでは上の「接合の重なり」を使います。";
  flowerMotifPanel.appendChild(flowerExpansionHint);

  const flowerDetails = document.createElement("details");
  flowerDetails.className = "flower-details";
  const flowerDetailsSummary = document.createElement("summary");
  flowerDetailsSummary.textContent = "花の詳細";
  flowerDetails.appendChild(flowerDetailsSummary);
  addFlowerSlider(flowerDetails, "flowerOpening", "花の開き", 0.72, 1.22, 0.01);
  addFlowerSlider(flowerDetails, "flowerNeck", "花弁の首", 0.14, 0.62, 0.01);
  addFlowerSlider(flowerDetails, "flowerCoreSize", "花芯の大きさ", 0.42, 0.78, 0.01);
  addFlowerSlider(flowerDetails, "flowerCupping", "花弁の起き上がり", -0.18, 0.5, 0.01);
  addFlowerSlider(flowerDetails, "flowerCoreLift", "花芯の高さ", -0.12, 0.5, 0.01);
  addFlowerSlider(flowerDetails, "flowerGrowthDifference", "花弁の成長差", 0, 0.34, 0.01);
  flowerMotifPanel.appendChild(flowerDetails);

  const repackFlowersButton = document.createElement("button");
  repackFlowersButton.type = "button";
  repackFlowersButton.className = "primary-action flower-repack-action";
  repackFlowersButton.textContent = "この設定で花を詰め直す";
  repackFlowersButton.onclick = () => callbacks.onRepackFlowers();
  flowerMotifPanel.appendChild(repackFlowersButton);
  const flowerConnectionTitle = document.createElement("div");
  flowerConnectionTitle.className = "motif-connection-title";
  flowerConnectionTitle.textContent = "ランダムPACKの花のつながり";
  flowerMotifPanel.appendChild(flowerConnectionTitle);
  const flowerConnectionRow = document.createElement("div");
  flowerConnectionRow.className = "mode-toggle flower-connection-toggle";
  const flowerConnectionButtons = new Map<FlowerConnectionMode, HTMLButtonElement>();
  const flowerConnectionChoices: Array<[FlowerConnectionMode, string]> = [
    ["fused", "一体の花（融合）"],
    ["separate", "離して並べる"],
  ];
  for (const [mode, label] of flowerConnectionChoices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => {
      renderFlowerConnectionMode(mode);
      callbacks.onSkinParamChange("flowerConnectionMode", mode);
    };
    flowerConnectionButtons.set(mode, button);
    flowerConnectionRow.appendChild(button);
  }
  flowerMotifPanel.appendChild(flowerConnectionRow);
  const flowerMotifHint = document.createElement("div");
  flowerMotifHint.className = "hint";
  flowerMotifHint.textContent = "「一体の花」は枝を足さず花全体を膨らませます。QUAD-FLOWの接続は上の共通設定です。";
  flowerMotifPanel.appendChild(flowerMotifHint);
  root.appendChild(flowerMotifPanel);

  function renderFlowerMotifPreset(id: FlowerMotifPresetId): void {
    activeFlowerPreset = id;
    for (const [presetId, button] of flowerMotifButtons) {
      button.classList.toggle("mode-active", presetId === id);
    }
  }
  function renderFlowerParameterControls(params: SkinParams): void {
    for (const [key, handle] of flowerSliders) handle.set(Number(params[key]));
    renderFlowerCore(params.flowerShowCore);
  }
  function applyFlowerPreset(id: Exclude<FlowerMotifPresetId, "custom">): void {
    const preset = PACKING_MOTIF_PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    const definition = preset.definition;
    renderFlowerMotifPreset(id);
    const values: Array<[keyof SkinParams, number | boolean]> = [
      ["flowerPetalCount", definition.petalCount],
      ["flowerShowCore", definition.showCore],
      ["flowerOpening", definition.opening],
      ["flowerNeck", definition.neck],
      ["flowerCoreSize", definition.coreSize],
      ["flowerCupping", definition.cupping],
      ["flowerCoreLift", definition.coreLift],
      ["flowerGrowthDifference", definition.growthDifference],
      ["flowerExpansion", 1],
    ];
    callbacks.onSkinParamChange("flowerMotifPreset", id);
    for (const [key, value] of values) callbacks.onSkinParamChange(key, value);
    for (const [key, value] of values) {
      if (typeof value === "number") flowerSliders.get(key)?.set(value);
    }
    renderFlowerCore(definition.showCore);
  }
  renderFlowerMotifPreset(skinParams.flowerMotifPreset);
  renderFlowerParameterControls(skinParams);
  function renderFlowerConnectionMode(mode: FlowerConnectionMode): void {
    for (const [connectionMode, button] of flowerConnectionButtons) {
      button.classList.toggle("mode-active", connectionMode === mode);
    }
  }
  renderFlowerConnectionMode(skinParams.flowerConnectionMode);

  const commonAdjustmentDetails = document.createElement("details");
  commonAdjustmentDetails.className = "adjustment-details";
  const commonAdjustmentSummary = document.createElement("summary");
  commonAdjustmentSummary.textContent = "形状と造形の詳細調整";
  commonAdjustmentDetails.appendChild(commonAdjustmentSummary);
  root.appendChild(commonAdjustmentDetails);

  const skinSliders: { spec: (typeof SKIN_SPECS)[number]; set: (v: number) => void; row: HTMLElement }[] = [];
  let coinBulgeSliderSet: ((v: number) => void) | null = null;
  let coinBulgeBalanceSliderSet: ((v: number) => void) | null = null;
  let coinBulgeValue = skinParams.coinBulge;
  let coinBulgeBalanceValue = skinParams.coinBulgeBalance;
  for (const spec of SKIN_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, skinParams[spec.key] as number, (v) => {
      callbacks.onSkinParamChange(spec.key, v);
      if (spec.key === "coinBulge") coinBulgeValue = v;
      if (spec.key === "coinBulgeBalance") coinBulgeBalanceValue = v;
      if (spec.key === "coinBulge" || spec.key === "coinBulgeBalance") renderCoinBulgeState();
    });
    skinSliders.push({ spec, set: built.set, row: built.row });
    commonAdjustmentDetails.appendChild(built.row);
    if (spec.key === "coinBulge") coinBulgeSliderSet = built.set;
    if (spec.key === "coinBulgeBalance") coinBulgeBalanceSliderSet = built.set;
  }

  // T14 coin-bulge experiment (instruction §4): preset buttons for quick
  // 0/+0.04/+0.08/+0.12 comparison, and a short (not long-form) visual state
  // -- 作者方針 "長い説明文を常時追加しない". Presets are comparison values,
  // not a推奨 -- no preset is visually marked as recommended.
  const coinBulgePresetRow = document.createElement("div");
  coinBulgePresetRow.className = "mode-toggle";
  const coinBulgePresets = [0, 0.04, 0.08, 0.12];
  const coinBulgePresetButtons: HTMLButtonElement[] = [];
  for (const presetValue of coinBulgePresets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = presetValue === 0 ? "0" : `+${presetValue.toFixed(2)}`;
    btn.onclick = () => {
      coinBulgeSliderSet?.(presetValue);
      callbacks.onSkinParamChange("coinBulge", presetValue);
      coinBulgeValue = presetValue;
      renderCoinBulgeState();
    };
    coinBulgePresetButtons.push(btn);
    coinBulgePresetRow.appendChild(btn);
  }
  commonAdjustmentDetails.appendChild(coinBulgePresetRow);

  const coinBulgeBalancePresetRow = document.createElement("div");
  coinBulgeBalancePresetRow.className = "mode-toggle";
  const coinBulgeBalancePresets: Array<[number, string]> = [[-1, "裏のみ"], [0, "両面"], [1, "表のみ"]];
  const coinBulgeBalancePresetButtons: HTMLButtonElement[] = [];
  for (const [presetValue, label] of coinBulgeBalancePresets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.onclick = () => {
      coinBulgeBalanceSliderSet?.(presetValue);
      callbacks.onSkinParamChange("coinBulgeBalance", presetValue);
      coinBulgeBalanceValue = presetValue;
      renderCoinBulgeState();
    };
    coinBulgeBalancePresetButtons.push(btn);
    coinBulgeBalancePresetRow.appendChild(btn);
  }
  commonAdjustmentDetails.appendChild(coinBulgeBalancePresetRow);

  const coinBulgeState = document.createElement("div");
  coinBulgeState.className = "hint";
  commonAdjustmentDetails.appendChild(coinBulgeState);

  function renderCoinBulgeState(): void {
    for (let i = 0; i < coinBulgePresets.length; i++) {
      coinBulgePresetButtons[i].classList.toggle("mode-active", Math.abs(coinBulgePresets[i] - coinBulgeValue) < 1e-6);
    }
    for (let i = 0; i < coinBulgeBalancePresets.length; i++) {
      coinBulgeBalancePresetButtons[i].classList.toggle(
        "mode-active",
        Math.abs(coinBulgeBalancePresets[i][0] - coinBulgeBalanceValue) < 1e-6,
      );
    }
    const balanceLabel = coinBulgeBalanceValue <= -0.999
      ? "裏だけ"
      : coinBulgeBalanceValue >= 0.999
        ? "表だけ"
        : Math.abs(coinBulgeBalanceValue) < 0.001
          ? "表裏同量"
          : `${coinBulgeBalanceValue > 0 ? "表" : "裏"}寄り ${Math.round(Math.abs(coinBulgeBalanceValue) * 100)}%`;
    coinBulgeState.textContent =
      coinBulgeValue > 0
        ? `中央 +${coinBulgeValue.toFixed(3)} / ${balanceLabel}（表=外側・裏=内側）`
        : "0: 従来（コイン・平リングとも旧形状と同一）";
  }
  renderCoinBulgeState();

  const ringSlidersTitle = document.createElement("div");
  ringSlidersTitle.className = "section-title";
  ringSlidersTitle.textContent = "リング系のつまみ（平リング・立体リング）";
  commonAdjustmentDetails.appendChild(ringSlidersTitle);

  const ringSliders: { spec: (typeof RING_SPECS)[number]; set: (v: number) => void; row: HTMLElement }[] = [];
  for (const spec of RING_SPECS) {
    const built = buildSlider(spec.label, spec.min, spec.max, spec.step, skinParams[spec.key] as number, (v) =>
      callbacks.onSkinParamChange(spec.key, v),
    );
    ringSliders.push({ spec, set: built.set, row: built.row });
    commonAdjustmentDetails.appendChild(built.row);
  }

  function renderShapeSpecificControls(shape: PatchShape): void {
    flowerMotifPanel.hidden = shape !== "flower";
    const irregularity = skinSliders.find(({ spec }) => spec.key === "irregularity")?.row;
    if (irregularity) irregularity.hidden = shape !== "coin";
    for (const key of ["coinHoleRatio", "coinBulge", "coinBulgeBalance"] as const) {
      const coinOnly = skinSliders.find(({ spec }) => spec.key === key)?.row;
      if (coinOnly) coinOnly.hidden = shape !== "coin";
    }
    coinBulgePresetRow.hidden = shape !== "coin";
    coinBulgeBalancePresetRow.hidden = shape !== "coin";
    coinBulgeState.hidden = shape !== "coin";
    const isRing = shape === "flatRing" || shape === "ring3d";
    ringSlidersTitle.hidden = !isRing;
    for (const { row } of ringSliders) row.hidden = !isRing;
  }
  renderShapeSpecificControls(skinParams.patchShape);

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

  const lacePanel = document.createElement("section");
  lacePanel.className = "lace-fill-panel";
  const densePresetTitle = document.createElement("div");
  densePresetTitle.className = "section-title";
  densePresetTitle.textContent = "デフォルトサンプル：高密度花 v6スタイル";
  const densePresetHint = document.createElement("div");
  densePresetHint.className = "hint";
  densePresetHint.textContent = "現在のベース形状へ、読み取れる大小の花とレース状の隙間を一操作で再現します。保存v6そのものではなく、編集・UNDO・分割できる原理再現です。";
  const densePresetButton = document.createElement("button");
  densePresetButton.type = "button";
  densePresetButton.className = "primary-action";
  densePresetButton.textContent = "v6スタイルを編集可能データとして作る";
  const densePresetStatus = document.createElement("div");
  densePresetStatus.className = "mesh-status";
  densePresetButton.onclick = async () => {
    densePresetButton.disabled = true;
    densePresetButton.textContent = "v6スタイルを生成中…";
    densePresetStatus.textContent = "初回の花配置と空隙充填を計算しています";
    try {
      await callbacks.onCreateDenseFlowerV6Style();
      densePresetStatus.textContent = "編集可能なv6スタイルを作りました。1回のUNDOで元へ戻せます";
      densePresetStatus.dataset.ok = "true";
    } catch (error) {
      densePresetStatus.textContent = `生成できませんでした: ${(error as Error).message}`;
      densePresetStatus.dataset.ok = "false";
    } finally {
      densePresetButton.disabled = false;
      densePresetButton.textContent = "v6スタイルを編集可能データとして作る";
    }
  };
  lacePanel.append(densePresetTitle, densePresetHint, densePresetButton, densePresetStatus);
  const laceTitle = document.createElement("div");
  laceTitle.className = "section-title";
  laceTitle.textContent = "多段レース充填（v6の原理）";
  const laceHint = document.createElement("div");
  laceHint.className = "hint";
  laceHint.textContent = "今の並びを残し、大きい空隙から順に小さな形を足します。形を一様に膨らませないため、花の輪郭とレース状の隙間を保てます。花・コイン・リングすべてに使えます。";
  lacePanel.append(laceTitle, laceHint);
  const lacePassesSlider = buildSlider(
    "大中小の段階", 1, 6, 1, skinParams.lacePasses,
    (value) => callbacks.onSkinParamChange("lacePasses", Math.round(value)),
  );
  const laceMinScaleSlider = buildSlider(
    "最小形の比率", 0.2, 1, 0.05, skinParams.laceMinScale,
    (value) => callbacks.onSkinParamChange("laceMinScale", value),
  );
  const laceGapSlider = buildSlider(
    "残す隙間（負=接触）", -0.12, 0.18, 0.005, skinParams.laceGap,
    (value) => callbacks.onSkinParamChange("laceGap", value),
  );
  lacePanel.append(lacePassesSlider.row, laceMinScaleSlider.row, laceGapSlider.row);
  const lacePlacementTitle = document.createElement("div");
  lacePlacementTitle.className = "section-title";
  lacePlacementTitle.textContent = "空隙へ追加する形の位置";
  const lacePlacementToggle = document.createElement("div");
  lacePlacementToggle.className = "mode-toggle motif-placement-toggle";
  const lacePlacementButtons = new Map<MotifPlacement, HTMLButtonElement>();
  for (const [placement, label] of placementChoices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => callbacks.onSkinParamChange("laceMotifPlacement", placement);
    lacePlacementButtons.set(placement, button);
    lacePlacementToggle.appendChild(button);
  }
  function renderLaceMotifPlacement(placement: MotifPlacement): void {
    for (const [candidate, button] of lacePlacementButtons) button.classList.toggle("mode-active", candidate === placement);
  }
  renderLaceMotifPlacement(skinParams.laceMotifPlacement ?? "surface");
  const lacePlacementHint = document.createElement("div");
  lacePlacementHint.className = "hint";
  lacePlacementHint.textContent = "上の初回配置とは別設定です。例えば、最初の花は表面、空隙へ足す花だけ面を中心にできます。";
  lacePanel.append(lacePlacementTitle, lacePlacementToggle, lacePlacementHint);
  const laceButton = document.createElement("button");
  laceButton.type = "button";
  laceButton.textContent = "空隙へ大中小を追加";
  laceButton.onclick = () => callbacks.onFillLaceGaps();
  lacePanel.appendChild(laceButton);
  const laceWarning = document.createElement("div");
  laceWarning.className = "hint";
  laceWarning.textContent = "正の隙間は見た目を優先し、全要素の接続を保証しません。印刷前に空隙マップと接続・分割を確認します。";
  lacePanel.appendChild(laceWarning);
  root.appendChild(lacePanel);

  const contactPanel = document.createElement("section");
  contactPanel.className = "contact-strength-panel";
  const contactTitle = document.createElement("div");
  contactTitle.className = "section-title";
  contactTitle.textContent = "花どうしの接点";
  const contactHint = document.createElement("div");
  contactHint.className = "hint";
  contactHint.textContent = "花ごとに、球表面が触れている別の花を数えます。補強方法は接点だけ、または花全体の拡大から選べます。";
  contactPanel.append(contactTitle, contactHint);
  const contactModeRow = document.createElement("div");
  contactModeRow.className = "row mode-row contact-reinforcement-mode";
  const contactModeButtons = new Map<ContactReinforcementMode, HTMLButtonElement>();
  for (const [mode, label] of [
    ["localPoints", "接続部分だけ"],
    ["wholeMotif", "花全体"],
  ] as Array<[ContactReinforcementMode, string]>) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => {
      renderContactReinforcementMode(mode);
      callbacks.onSkinParamChange("contactReinforcementMode", mode);
    };
    contactModeButtons.set(mode, button);
    contactModeRow.appendChild(button);
  }
  contactPanel.appendChild(contactModeRow);
  const contactTargetSlider = buildSlider(
    "必要な接続相手", 2, 4, 1, skinParams.contactTarget,
    (value) => callbacks.onSkinParamChange("contactTarget", Math.round(value)),
  );
  const contactMaxGrowthSlider = buildSlider(
    "局所補強の上限", 0, 0.2, 0.005, skinParams.contactMaxGrowth,
    (value) => callbacks.onSkinParamChange("contactMaxGrowth", value),
  );
  const contactOverlapSlider = buildSlider(
    "接点の重なり", 0, 0.05, 0.0025, skinParams.contactOverlap,
    (value) => callbacks.onSkinParamChange("contactOverlap", value),
  );
  const contactWholeScaleSlider = buildSlider(
    "花全体の拡大上限", 0, 1, 0.01, skinParams.contactWholeScaleMax,
    (value) => callbacks.onSkinParamChange("contactWholeScaleMax", value),
  );
  contactPanel.append(contactTargetSlider.row, contactMaxGrowthSlider.row, contactWholeScaleSlider.row, contactOverlapSlider.row);
  const contactButtons = document.createElement("div");
  contactButtons.className = "row contact-actions";
  const analyzeContactsButton = document.createElement("button");
  analyzeContactsButton.type = "button";
  analyzeContactsButton.textContent = "接点数を色で確認";
  analyzeContactsButton.onclick = () => callbacks.onAnalyzeContacts();
  const reinforceContactsButton = document.createElement("button");
  reinforceContactsButton.type = "button";
  reinforceContactsButton.textContent = "弱い花だけ補強";
  reinforceContactsButton.onclick = () => callbacks.onReinforceContacts();
  contactButtons.append(analyzeContactsButton, reinforceContactsButton);
  const contactLegend = document.createElement("div");
  contactLegend.className = "contact-legend";
  contactLegend.innerHTML = '<span class="contact-red">0–1</span><span class="contact-orange">目標未満</span><span class="contact-green">目標以上</span>';
  const contactStatus = document.createElement("div");
  contactStatus.className = "hint contact-status";
  contactStatus.textContent = "未確認";
  contactPanel.append(contactButtons, contactLegend, contactStatus);
  const contactWarning = document.createElement("div");
  contactWarning.className = "hint";
  contactWarning.textContent = "接点数は球どうしの接触近似です。最終メッシュの連結や印刷強度を保証しません。";
  contactPanel.appendChild(contactWarning);
  function renderContactReinforcementMode(mode: ContactReinforcementMode): void {
    for (const [candidate, button] of contactModeButtons) button.classList.toggle("mode-active", candidate === mode);
    contactMaxGrowthSlider.row.hidden = mode !== "localPoints";
    contactWholeScaleSlider.row.hidden = mode !== "wholeMotif";
    reinforceContactsButton.textContent = mode === "wholeMotif" ? "弱い花を上限まで丸ごと拡大" : "弱い花の接続部を補強";
    contactHint.textContent = mode === "wholeMotif"
      ? "弱い花の花芯・全花弁・配置を中心から同じ比率で拡大します。届かなくても指定上限まで拡大します。0.15は元の115%です。"
      : "弱い花のうち、隣に一番近い花びらだけを太くします。従来の補強方法です。";
  }
  renderContactReinforcementMode(skinParams.contactReinforcementMode ?? "localPoints");
  root.appendChild(contactPanel);

  const packBtnRow = document.createElement("div");
  packBtnRow.className = "row";
  const packBtn = document.createElement("button");
  packBtn.className = "primary-action";
  packBtn.textContent = "この設定で表面を生成";
  packBtn.title = "選んだ表面の組み方・形状・調整値で生成します";
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

  // Internal Structure is independent from Surface generation. These controls
  // never repack, remove, select, annotate, or partition surface elements.
  const internalTitle = document.createElement("div");
  internalTitle.className = "section-title internal-structure-title";
  internalTitle.textContent = "INTERNAL STRUCTURE / 7 Internal Structure";
  root.appendChild(internalTitle);

  const internalPanel = document.createElement("div");
  internalPanel.className = "internal-structure-panel";
  root.appendChild(internalPanel);
  const internalToggle = document.createElement("div");
  internalToggle.className = "mode-toggle";
  const internalButtons: Record<InternalStructureMode, HTMLButtonElement> = {
    none: document.createElement("button"),
    targetedGrid: document.createElement("button"),
    voronoiEdge: document.createElement("button"),
  };
  internalButtons.none.textContent = "None";
  internalButtons.targetedGrid.textContent = "赤点→Dry Web";
  internalButtons.voronoiEdge.textContent = "Voronoi Edge";
  for (const internalMode of ["none", "targetedGrid", "voronoiEdge"] as InternalStructureMode[]) {
    const button = internalButtons[internalMode];
    button.type = "button";
    button.onclick = () => {
      renderInternalStructure(internalMode);
      callbacks.onSkinParamChange("internalStructure", internalMode);
    };
    internalToggle.appendChild(button);
  }
  internalPanel.appendChild(internalToggle);

  const internalControls = document.createElement("div");
  internalControls.className = "internal-structure-controls";
  internalPanel.appendChild(internalControls);

  const internalObservationLabel = document.createElement("div");
  internalObservationLabel.className = "hint internal-observation-label";
  internalObservationLabel.textContent = "Internalの観察表示";
  const internalObservationToggle = document.createElement("div");
  internalObservationToggle.className = "mode-toggle internal-observation-toggle";
  const internalObservationButtons = new Map<InternalObservationMode, HTMLButtonElement>();
  for (const [mode, label] of [
    ["normal", "通常"],
    ["ghostSkin", "SKIN半透明"],
    ["internalOnly", "SKIN非表示"],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", mode === "internalOnly"
      ? "SKINを隠してInternal Structureだけを見る"
      : mode === "ghostSkin" ? "SKINを半透明にして内部を見る" : "通常表示へ戻す");
    button.onclick = () => callbacks.onSetInternalObservationMode(mode);
    internalObservationButtons.set(mode, button);
    internalObservationToggle.appendChild(button);
  }
  const internalObservationHint = document.createElement("div");
  internalObservationHint.className = "hint internal-observation-hint";
  internalObservationHint.textContent =
    "表示だけを切り替えます。Surface生成・履歴・メッシュ書き出しは変わりません。";
  displayToolsRoot.append(internalObservationLabel, internalObservationToggle, internalObservationHint);

  const internalDensitySlider = buildSlider(
    "Density（内部点数）", 8, 72, 1, skinParams.internalDensity,
    (value) => callbacks.onSkinParamChange("internalDensity", value),
  );
  const targetedCountSlider = buildSlider(
    "追加する補強線の本数", 0, 72, 1, skinParams.internalDensity,
    (value) => callbacks.onSkinParamChange("internalDensity", value),
  );
  const internalRadiusSlider = buildSlider(
    "Radius（線径）", 0.015, 0.12, 0.005, skinParams.internalRadius,
    (value) => callbacks.onSkinParamChange("internalRadius", value),
  );
  const internalRandomnessSlider = buildSlider(
    "Randomness（点配置の揺らぎ）", 0, 1, 0.01, skinParams.internalRandomness,
    (value) => callbacks.onSkinParamChange("internalRandomness", value),
  );
  internalControls.append(
    internalDensitySlider.row, targetedCountSlider.row, internalRadiusSlider.row, internalRandomnessSlider.row,
  );
  const internalMethodHint = document.createElement("div");
  internalMethodHint.className = "hint internal-method-hint";
  internalControls.appendChild(internalMethodHint);
  const internalStatus = document.createElement("div");
  internalStatus.className = "hint internal-structure-status";
  internalPanel.appendChild(internalStatus);

  const surfaceAnglePanel = document.createElement("section");
  surfaceAnglePanel.className = "surface-angle-diagnosis";
  const surfaceAngleTitle = document.createElement("strong");
  surfaceAngleTitle.textContent = "SURFACE / Surface angle diagnosis";
  const surfaceAngleHint = document.createElement("div");
  surfaceAngleHint.className = "hint";
  surfaceAngleHint.textContent =
    "造形方向は+Z固定。0°=垂直壁、90°=下向き水平面です。左上の最終精度と同じSurface meshを完成させてから測ります。";
  let surfaceAngleThreshold = 45;
  const surfaceAngleThresholdSlider = buildSlider(
    "危険角度の閾値", 0, 90, 1, surfaceAngleThreshold,
    (value) => {
      surfaceAngleThreshold = value;
      callbacks.onSurfaceAngleThresholdChange();
    },
  );
  const surfaceAngleActions = document.createElement("div");
  surfaceAngleActions.className = "row surface-angle-actions";
  const surfaceAngleRun = document.createElement("button");
  surfaceAngleRun.type = "button";
  surfaceAngleRun.className = "primary-action";
  surfaceAngleRun.textContent = "最終精度で診断";
  surfaceAngleRun.onclick = () => callbacks.onDiagnoseSurfaceAngles(surfaceAngleThreshold);
  const surfaceAngleViewToggle = document.createElement("div");
  surfaceAngleViewToggle.className = "mode-toggle surface-angle-view-toggle";
  const surfaceAngleViewButtons = new Map<SurfaceAngleDiagnosisView, HTMLButtonElement>();
  for (const [view, label] of [["before", "付加前"], ["after", "付加後"]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = true;
    button.onclick = () => callbacks.onSetSurfaceAngleDiagnosisView(view);
    surfaceAngleViewButtons.set(view, button);
    surfaceAngleViewToggle.appendChild(button);
  }
  surfaceAngleActions.append(surfaceAngleRun, surfaceAngleViewToggle);
  const surfaceAngleLegend = document.createElement("div");
  surfaceAngleLegend.className = "surface-angle-legend";
  surfaceAngleLegend.innerHTML =
    '<span><i class="surface-angle-swatch is-danger"></i>赤面 = 閾値以上・未支援</span>' +
    '<span><i class="surface-angle-swatch is-mitigated"></i>青緑面 = Internal到達候補</span>' +
    '<span><i class="surface-angle-swatch is-support-inside"></i>青丸 = inside / Dry Web</span>' +
    '<span><i class="surface-angle-swatch is-support-outside"></i>橙三角 = outside / scaffold</span>' +
    '<span><i class="surface-angle-swatch is-support-unresolved"></i>赤× = unresolved</span>' +
    '<span><i class="surface-angle-swatch is-support-footprint"></i>白線 = base外周footprint</span>' +
    '<span><i class="surface-angle-swatch is-support-mixed"></i>紫線 = mixed face（任意表示）</span>';
  const surfaceAngleStatus = document.createElement("div");
  surfaceAngleStatus.className = "mesh-status surface-angle-status";
  surfaceAngleStatus.textContent = "未診断";
  surfaceAngleStatus.setAttribute("aria-live", "polite");
  const surfaceStartupStatus = document.createElement("div");
  surfaceStartupStatus.className = "mesh-status surface-startup-status";
  surfaceStartupStatus.textContent = "起動実測: 待機中";
  surfaceStartupStatus.setAttribute("aria-live", "polite");
  const surfaceDiagnosticsActions = document.createElement("div");
  surfaceDiagnosticsActions.className = "row surface-angle-diagnostics-actions";
  const surfaceDiagnosticsButton = document.createElement("button");
  surfaceDiagnosticsButton.type = "button";
  surfaceDiagnosticsButton.textContent = "Windows確認情報を表示";
  const surfaceDiagnosticsOutput = document.createElement("pre");
  surfaceDiagnosticsOutput.className = "surface-angle-diagnostics-output";
  surfaceDiagnosticsOutput.hidden = true;
  surfaceDiagnosticsButton.onclick = () => {
    surfaceDiagnosticsOutput.textContent = callbacks.onShowSurfaceDiagnostics();
    surfaceDiagnosticsOutput.hidden = false;
    surfaceDiagnosticsButton.textContent = "Windows確認情報を更新";
  };
  surfaceDiagnosticsActions.appendChild(surfaceDiagnosticsButton);
  const supportSiteToggle = document.createElement("label");
  supportSiteToggle.className = "support-site-toggle";
  const supportSiteCheckbox = document.createElement("input");
  supportSiteCheckbox.type = "checkbox";
  supportSiteCheckbox.checked = true;
  supportSiteCheckbox.disabled = true;
  supportSiteCheckbox.onchange = () => callbacks.onToggleOverhangSupportSites(supportSiteCheckbox.checked);
  const supportSiteLabel = document.createElement("span");
  supportSiteLabel.textContent = "inside / outside支持点を形状上に表示";
  supportSiteToggle.append(supportSiteCheckbox, supportSiteLabel);
  const supportDepthMode = document.createElement("div");
  supportDepthMode.className = "mode-toggle support-depth-mode";
  const supportDepthButtons = new Map<SupportSiteDepthMode, HTMLButtonElement>();
  for (const [mode, label] of [["front-only", "前面のみ"], ["show-back", "背面を半透明表示"]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = true;
    button.onclick = () => callbacks.onSetOverhangSupportDepthMode(mode);
    supportDepthButtons.set(mode, button);
    supportDepthMode.appendChild(button);
  }
  const mixedFaceToggle = document.createElement("label");
  mixedFaceToggle.className = "mixed-face-toggle";
  const mixedFaceCheckbox = document.createElement("input");
  mixedFaceCheckbox.type = "checkbox";
  mixedFaceCheckbox.checked = false;
  mixedFaceCheckbox.disabled = true;
  mixedFaceCheckbox.onchange = () => callbacks.onToggleMixedSupportFaces(mixedFaceCheckbox.checked);
  const mixedFaceLabel = document.createElement("span");
  mixedFaceLabel.textContent = "mixed faceの紫輪郭を表示（診断のみ）";
  mixedFaceToggle.append(mixedFaceCheckbox, mixedFaceLabel);
  const footprintToggle = document.createElement("label");
  footprintToggle.className = "footprint-toggle";
  const footprintCheckbox = document.createElement("input");
  footprintCheckbox.type = "checkbox";
  footprintCheckbox.checked = true;
  footprintCheckbox.disabled = true;
  footprintCheckbox.onchange = () => callbacks.onToggleSupportFootprint(footprintCheckbox.checked);
  footprintToggle.append(footprintCheckbox, document.createTextNode(" base外周footprintを表示"));
  const supportSiteStatus = document.createElement("div");
  supportSiteStatus.className = "mesh-status support-site-status";
  supportSiteStatus.textContent = "支持点は未診断";
  supportSiteStatus.setAttribute("aria-live", "polite");
  const supportSiteSelectionStatus = document.createElement("div");
  supportSiteSelectionStatus.className = "hint support-site-selection-status";
  supportSiteSelectionStatus.textContent = "支持点を選ぶと plate-visible / body-blocked を表示します";
  supportSiteSelectionStatus.setAttribute("aria-live", "polite");
  const supportPaintPanel = document.createElement("section");
  supportPaintPanel.className = "support-paint-panel";
  const supportPaintTitle = document.createElement("strong");
  supportPaintTitle.textContent = "INTERNAL STRUCTURE / 6 Support Paint 1";
  const supportPaintHint = document.createElement("div");
  supportPaintHint.className = "hint";
  supportPaintHint.textContent = "自動分類を下書きとして、形状生成前の支持方式だけを塗り直します。赤いunresolvedは変更できません。";
  const supportPaintEnable = document.createElement("label");
  supportPaintEnable.className = "support-paint-enable";
  const supportPaintEnableCheckbox = document.createElement("input");
  supportPaintEnableCheckbox.type = "checkbox";
  supportPaintEnableCheckbox.disabled = true;
  supportPaintEnableCheckbox.onchange = () => callbacks.onSetSupportPaintEnabled(supportPaintEnableCheckbox.checked);
  supportPaintEnable.append(supportPaintEnableCheckbox, document.createTextNode(" ペイントを使う"));
  const supportPaintModes = document.createElement("div");
  supportPaintModes.className = "mode-toggle support-paint-modes";
  const supportPaintModeButtons = new Map<SupportPaintMode, HTMLButtonElement>();
  for (const [mode, label] of [["inside", "青 · Dry Web"], ["outside", "橙 · scaffold"], ["auto", "Autoへ戻す"]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = true;
    button.onclick = () => callbacks.onSetSupportPaintMode(mode);
    supportPaintModeButtons.set(mode, button);
    supportPaintModes.appendChild(button);
  }
  const supportPaintRadius = buildSlider("ブラシ半径", 1, 20, 0.5, 6, (value) => callbacks.onSetSupportPaintRadiusMm(value));
  const supportPaintRadiusInput = supportPaintRadius.row.querySelector<HTMLInputElement>("input")!;
  const supportPaintRadiusValue = supportPaintRadius.row.querySelector<HTMLElement>(".value-out")!;
  supportPaintRadiusValue.textContent = "半径 6.0 mm / 直径 12.0 mm";
  const supportPaintBackfaces = document.createElement("label");
  supportPaintBackfaces.className = "support-paint-backfaces";
  const supportPaintBackfacesCheckbox = document.createElement("input");
  supportPaintBackfacesCheckbox.type = "checkbox";
  supportPaintBackfacesCheckbox.disabled = true;
  supportPaintBackfacesCheckbox.onchange = () => callbacks.onSetSupportPaintBackfaces(supportPaintBackfacesCheckbox.checked);
  supportPaintBackfaces.append(supportPaintBackfacesCheckbox, document.createTextNode(" 背面も塗る（明示ON）"));
  const supportPaintActions = document.createElement("div");
  supportPaintActions.className = "row support-paint-actions";
  const supportPaintUndo = document.createElement("button");
  supportPaintUndo.type = "button"; supportPaintUndo.textContent = "Paint Undo"; supportPaintUndo.disabled = true;
  supportPaintUndo.onclick = (event) => invokeExclusiveSupportPaintUndo(event, callbacks.onUndoSupportPaint);
  const supportPaintRedo = document.createElement("button");
  supportPaintRedo.type = "button"; supportPaintRedo.textContent = "Redo"; supportPaintRedo.disabled = true; supportPaintRedo.onclick = () => callbacks.onRedoSupportPaint();
  const supportPaintReset = document.createElement("button");
  supportPaintReset.type = "button"; supportPaintReset.textContent = "すべてリセット"; supportPaintReset.disabled = true; supportPaintReset.onclick = () => callbacks.onResetSupportPaint();
  for (const button of [supportPaintUndo, supportPaintRedo, supportPaintReset]) {
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
  }
  supportPaintActions.append(supportPaintUndo, supportPaintRedo, supportPaintReset);
  const supportPaintDraftActions = document.createElement("div");
  supportPaintDraftActions.className = "row support-paint-draft-actions";
  const supportPaintDraftSave = document.createElement("button");
  supportPaintDraftSave.type = "button"; supportPaintDraftSave.textContent = "作業を保存";
  supportPaintDraftSave.onclick = () => callbacks.onSaveSupportPaintDraft();
  const supportPaintDraftLoad = document.createElement("button");
  supportPaintDraftLoad.type = "button"; supportPaintDraftLoad.textContent = "作業を読み込む";
  const supportPaintDraftInput = document.createElement("input");
  supportPaintDraftInput.type = "file"; supportPaintDraftInput.accept = "application/json,.json"; supportPaintDraftInput.hidden = true;
  supportPaintDraftLoad.onclick = () => supportPaintDraftInput.click();
  supportPaintDraftInput.onchange = () => { const file = supportPaintDraftInput.files?.[0]; if (file) callbacks.onLoadSupportPaintDraft(file); supportPaintDraftInput.value = ""; };
  supportPaintDraftActions.append(supportPaintDraftSave, supportPaintDraftLoad, supportPaintDraftInput);
  const supportPaintDraftStatus = document.createElement("div");
  supportPaintDraftStatus.className = "hint support-paint-draft-status";
  supportPaintDraftStatus.textContent = "Shape Recipe読込後にautosaveできます";
  const supportPaintResolutionStatus = document.createElement("div");
  supportPaintResolutionStatus.className = "support-paint-resolution-status";
  supportPaintResolutionStatus.textContent = "編集 preview Surface -- / 印刷 Surface 128（未生成）";
  const supportPaintReprojectionButton = document.createElement("button");
  supportPaintReprojectionButton.type = "button"; supportPaintReprojectionButton.textContent = "Surface 48へ再投影確認";
  supportPaintReprojectionButton.onclick = () => callbacks.onVerifySupportPaintReprojection();
  const supportPaintReprojectionStatus = document.createElement("div");
  supportPaintReprojectionStatus.className = "hint support-paint-reprojection-status";
  supportPaintReprojectionStatus.textContent = "未検証";
  const supportPaintStatus = document.createElement("div");
  supportPaintStatus.className = "mesh-status support-paint-status";
  supportPaintStatus.textContent = "支持点の診断後に使えます";
  supportPaintStatus.setAttribute("aria-live", "polite");
  supportPaintPanel.append(supportPaintTitle, supportPaintHint, supportPaintEnable, supportPaintModes, supportPaintRadius.row, supportPaintBackfaces, supportPaintActions, supportPaintDraftActions, supportPaintResolutionStatus, supportPaintReprojectionButton, supportPaintReprojectionStatus, supportPaintStatus);
  const motifLowestToggle = document.createElement("label");
  motifLowestToggle.className = "surface-lowest-toggle";
  const motifLowestCheckbox = document.createElement("input");
  motifLowestCheckbox.type = "checkbox";
  motifLowestCheckbox.onchange = () => callbacks.onToggleMotifLowestPoints(motifLowestCheckbox.checked, surfaceAngleThreshold);
  const motifLowestLabel = document.createElement("span");
  motifLowestLabel.textContent = "最終メッシュ上の各要素最下端を表示";
  motifLowestToggle.append(motifLowestCheckbox, motifLowestLabel);
  const motifLowestHint = document.createElement("div");
  motifLowestHint.className = "hint";
  motifLowestHint.textContent =
    "最終Surface meshの頂点を最も近い花・コイン・リングへ帰属させ、要素ごとの最小Zを示します。赤=未到達、青緑=Internal到達候補。";
  const motifLowestStatus = document.createElement("div");
  motifLowestStatus.className = "mesh-status motif-lowest-status";
  motifLowestStatus.textContent = "非表示";
  motifLowestStatus.setAttribute("aria-live", "polite");
  const surfaceAngleLimit = document.createElement("div");
  surfaceAngleLimit.className = "hint";
  surfaceAngleLimit.textContent =
    "面角度と近接だけを見る一次スクリーニングです。ブリッジ、熱、荷重、実機の印刷成功は判定しません。";
  surfaceAnglePanel.append(
    surfaceAngleTitle,
    surfaceAngleHint,
    surfaceAngleThresholdSlider.row,
    surfaceAngleActions,
    surfaceAngleStatus,
    surfaceStartupStatus,
    surfaceDiagnosticsActions,
    surfaceDiagnosticsOutput,
    supportPaintPanel,
    surfaceAngleLimit,
  );
  internalPanel.appendChild(surfaceAnglePanel);
  displayToolsRoot.append(
    surfaceAngleLegend,
    supportSiteToggle,
    supportDepthMode,
    mixedFaceToggle,
    footprintToggle,
    supportSiteStatus,
    motifLowestToggle,
    motifLowestHint,
    motifLowestStatus,
  );

  function renderInternalObservation(mode: InternalObservationMode): void {
    for (const [candidate, button] of internalObservationButtons) {
      button.classList.toggle("mode-active", candidate === mode);
    }
  }

  function renderInternalStructure(internalMode: InternalStructureMode): void {
    internalButtons.none.classList.toggle("mode-active", internalMode === "none");
    internalButtons.targetedGrid.classList.toggle("mode-active", internalMode === "targetedGrid");
    internalButtons.voronoiEdge.classList.toggle("mode-active", internalMode === "voronoiEdge");
    internalControls.hidden = internalMode === "none";
    internalDensitySlider.row.hidden = internalMode !== "voronoiEdge";
    targetedCountSlider.row.hidden = internalMode !== "targetedGrid";
    internalRandomnessSlider.row.hidden = internalMode !== "voronoiEdge";
    internalMethodHint.textContent = internalMode === "targetedGrid"
      ? "全要素の赤点を内側から支え、花どうしの最短隙間を短い直線で一体化します。本数は最小網へ足す補強線、Radiusは全線共通です。初回は最終精度診断が必要です。"
      : "内部点から3D Voronoiのedge graphを作ります。";
    for (const button of internalObservationButtons.values()) button.disabled = internalMode === "none";
  }
  renderInternalObservation("normal");
  renderInternalStructure(skinParams.internalStructure);

  // T12: 三択の表示モード（レイマーチ/ビーズ/全体メッシュ）。ビューポートの容量
  // 制限（先頭パッチ/点のみ描画、shaders.ts の PATCH_MAX_POINTS）で密な詰めが
  // 疎に見える問題への正直な出口 -- T11 は「全体メッシュ」の一本足だったが、
  // 重くてインタラクティブに確認できなかった（作者報告 2026-07-13「メッシュ確認
  // は重い」）。ビーズは InstancedMesh のため uniform 予算の制約を受けず、かつ
  // 通常の three.js シーンなのでオービット/ズームがそのままインタラクティブ。
  const viewDock = document.createElement("section");
  viewDock.className = "viewport-view-dock";
  const viewTitle = document.createElement("strong");
  viewTitle.className = "viewport-view-title";
  viewTitle.textContent = "生成結果を見る";
  viewDock.appendChild(viewTitle);

  const viewToggle = document.createElement("div");
  viewToggle.className = "mode-toggle viewport-view-toggle";
  const viewButtons: Record<SkinViewMode, HTMLButtonElement> = {} as Record<SkinViewMode, HTMLButtonElement>;
  const VIEW_LABELS: [SkinViewMode, string][] = [
    ["raymarch", "レイマーチ"],
    ["beads", "ビーズ"],
    ["mesh", "段階メッシュ"],
  ];
  for (const [mode, label] of VIEW_LABELS) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => callbacks.onSetViewMode(mode);
    viewButtons[mode] = btn;
    viewToggle.appendChild(btn);
  }
  const displayStyleToggle = document.createElement("div");
  displayStyleToggle.className = "mode-toggle viewport-display-style";
  const displayStyleButtons = new Map<SkinDisplayStyle, HTMLButtonElement>();
  for (const [style, label] of [["solid", "通常"], ["ghost", "ゴースト"]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", style === "ghost" ? "裏側を透過して見る" : "通常の陰影で見る");
    button.onclick = () => callbacks.onSetDisplayStyle(style);
    displayStyleButtons.set(style, button);
    displayStyleToggle.appendChild(button);
  }
  const meshPreviewStatus = document.createElement("div");
  meshPreviewStatus.className = "viewport-view-status";
  meshPreviewStatus.textContent = "最初から切り替えられます";
  const quickResolutionRow = document.createElement("label");
  quickResolutionRow.className = "viewport-mesh-resolution";
  quickResolutionRow.appendChild(document.createTextNode("最終精度"));
  const quickResolutionInput = document.createElement("input");
  quickResolutionInput.type = "number";
  quickResolutionInput.min = "16";
  quickResolutionInput.max = "224";
  quickResolutionInput.step = "8";
  quickResolutionInput.value = "128";
  quickResolutionInput.oninput = () => {
    const value = Number(quickResolutionInput.value);
    if (!Number.isFinite(value)) return;
    resolutionInput.value = String(Math.max(16, Math.min(224, Math.round(value))));
    resolutionOut.textContent = resolutionInput.value;
  };
  quickResolutionInput.onchange = () => {
    const value = Math.max(16, Math.min(224, Math.round(Number(quickResolutionInput.value) || 128)));
    quickResolutionInput.value = String(value);
    resolutionInput.value = String(value);
    resolutionOut.textContent = String(value);
    callbacks.onPreviewMeshResolutionChange(value);
  };
  quickResolutionRow.appendChild(quickResolutionInput);
  viewDock.append(viewToggle, displayStyleToggle, quickResolutionRow, meshPreviewStatus);
  const viewportElement = container.querySelector("#viewport") ?? container;
  displayToolsRoot.appendChild(viewDock);

  const clippingHud = document.createElement("section");
  clippingHud.className = "viewport-clipping-hud";
  clippingHud.setAttribute("aria-label", "XYZ clipping planes");
  for (const type of ["pointerdown", "pointerup", "pointercancel", "click"] as const) {
    clippingHud.addEventListener(type, (event) => event.stopPropagation());
  }
  const clippingHeader = document.createElement("div");
  clippingHeader.className = "viewport-clipping-header";
  const clippingTitle = document.createElement("strong");
  clippingTitle.textContent = "CLIP XYZ";
  const clippingAllOff = document.createElement("button");
  clippingAllOff.type = "button";
  clippingAllOff.textContent = "ALL OFF";
  clippingAllOff.onclick = () => callbacks.onViewportClippingAction({ type: "disable-all" });
  const clippingResetAll = document.createElement("button");
  clippingResetAll.type = "button";
  clippingResetAll.textContent = "RESET";
  clippingResetAll.onclick = () => callbacks.onViewportClippingAction({ type: "reset-all" });
  clippingHeader.append(clippingTitle, clippingAllOff, clippingResetAll);
  clippingHud.appendChild(clippingHeader);

  const clippingRows = new Map<typeof VIEWPORT_CLIP_AXES[number], {
    row: HTMLDivElement;
    enabled: HTMLInputElement;
    slider: HTMLInputElement;
    direction: HTMLButtonElement;
    value: HTMLOutputElement;
    reset: HTMLButtonElement;
  }>();
  for (const axis of VIEWPORT_CLIP_AXES) {
    const row = document.createElement("div");
    row.className = "viewport-clipping-row";
    row.dataset.axis = axis;
    const axisLabel = document.createElement("label");
    axisLabel.className = "viewport-clipping-axis";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.onchange = () => callbacks.onViewportClippingAction({ type: "toggle", axis, enabled: enabled.checked });
    axisLabel.append(enabled, document.createTextNode(axis.toUpperCase()));
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "0";
    slider.step = "0.1";
    slider.value = "0";
    slider.oninput = () => callbacks.onViewportClippingAction({ type: "position", axis, position: Number(slider.value) });
    const direction = document.createElement("button");
    direction.type = "button";
    direction.className = "viewport-clipping-direction";
    direction.textContent = ">= ";
    direction.setAttribute("aria-label", axis.toUpperCase() + " clip direction");
    direction.onclick = () => callbacks.onViewportClippingAction({ type: "flip", axis });
    const value = document.createElement("output");
    value.className = "viewport-clipping-value";
    value.textContent = "--";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "viewport-clipping-reset";
    reset.textContent = "R";
    reset.title = axis.toUpperCase() + " reset";
    reset.onclick = () => callbacks.onViewportClippingAction({ type: "reset-axis", axis });
    row.append(axisLabel, slider, direction, value, reset);
    clippingRows.set(axis, { row, enabled, slider, direction, value, reset });
    clippingHud.appendChild(row);
  }
  displayToolsRoot.appendChild(clippingHud);

  const viewportTaskStatus = document.createElement("section");
  viewportTaskStatus.className = "viewport-task-status";
  viewportTaskStatus.setAttribute("aria-live", "polite");
  viewportTaskStatus.hidden = true;
  const viewportTaskLabel = document.createElement("strong");
  viewportTaskLabel.textContent = "形を変換しています";
  const viewportTaskText = document.createElement("span");
  viewportTaskText.textContent = "準備中";
  const viewportTaskCancel = document.createElement("button");
  viewportTaskCancel.type = "button";
  viewportTaskCancel.textContent = "計算を止める";
  viewportTaskCancel.onclick = () => callbacks.onCancelPreviewMesh();
  viewportTaskStatus.append(viewportTaskLabel, viewportTaskText, viewportTaskCancel);
  viewportElement.appendChild(viewportTaskStatus);

  const elementNamesRow = document.createElement("label");
  elementNamesRow.className = "row element-names-toggle";
  const elementNamesToggle = document.createElement("input");
  elementNamesToggle.type = "checkbox";
  elementNamesToggle.checked = false;
  elementNamesToggle.onchange = () => callbacks.onToggleElementNames(elementNamesToggle.checked);
  elementNamesRow.append(elementNamesToggle, document.createTextNode(" 要素番号を常に表示"));
  displayToolsRoot.appendChild(elementNamesRow);
  const elementNamesHint = document.createElement("div");
  elementNamesHint.className = "hint";
  elementNamesHint.textContent = "通常はカーソルを重ねた要素と選択中の要素だけ表示します。常時表示では代表24要素を表示します。";
  displayToolsRoot.appendChild(elementNamesHint);

  // Compact review registry: names remain derived in main.ts; this panel only
  // edits the explicit saved review fields for the selected machine key.
  const registry = document.createElement("details");
  registry.className = "element-registry";
  const registrySummary = document.createElement("summary");
  registrySummary.textContent = "要素を探す・記録する";
  registry.appendChild(registrySummary);
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "例: 花 025 / コイン";
  registry.appendChild(search);
  const list = document.createElement("div");
  list.className = "element-registry-list";
  registry.appendChild(list);
  const controls = document.createElement("div");
  controls.className = "element-review-controls";
  const keep = document.createElement("input"); keep.type = "checkbox";
  const weak = document.createElement("input"); weak.type = "checkbox";
  const opening = document.createElement("input"); opening.type = "checkbox";
  for (const [input, label] of [[keep, "残したい"], [weak, "接点が弱い"], [opening, "空隙が大きい"]] as const) {
    const row = document.createElement("label"); row.append(input, document.createTextNode(` ${label}`)); controls.appendChild(row);
  }
  const note = document.createElement("textarea"); note.placeholder = "メモ"; note.rows = 2;
  const save = document.createElement("button"); save.textContent = "記録を保存";
  controls.append(note, save);
  registry.appendChild(controls);
  root.appendChild(registry);
  let registryRows: Array<{ id: number; name: string; annotation: ElementAnnotationValue }> = [];
  let registrySelected: number | null = null;
  const renderRegistry = () => {
    list.replaceChildren();
    const query = search.value.trim().toLowerCase();
    let shown = registryRows.filter((row) => matchesElementSearch(row.name, row.id, query));
    if (registrySelected !== null && !shown.some((row) => row.id === registrySelected)) {
      const selected = registryRows.find((row) => row.id === registrySelected); if (selected) shown = [selected, ...shown];
    }
    for (const row of shown.slice(0, 12)) {
      const button = document.createElement("button"); button.textContent = row.name; button.classList.toggle("mode-active", row.id === registrySelected);
      button.onclick = () => callbacks.onElementSelect(row.id); list.appendChild(button);
    }
    const selected = registryRows.find((row) => row.id === registrySelected);
    keep.checked = selected?.annotation.keep ?? false; weak.checked = selected?.annotation.weakContact ?? false;
    opening.checked = selected?.annotation.largeOpening ?? false; note.value = selected?.annotation.note ?? "";
    controls.hidden = !selected;
    editor.hidden = !selected;
    selectedElementDock.hidden = !selected;
  };
  search.oninput = renderRegistry;
  save.onclick = () => { if (registrySelected !== null) callbacks.onElementAnnotationSave(registrySelected, { keep: keep.checked, weakContact: weak.checked, largeOpening: opening.checked, note: note.value }); };
  const clear = document.createElement("button"); clear.textContent = "記録を消す";
  clear.onclick = () => { if (registrySelected !== null) callbacks.onElementAnnotationSave(registrySelected, { ...EMPTY_ANNOTATION }); };
  controls.appendChild(clear);

  const editor = document.createElement("div");
  editor.id = "element-editor";
  editor.className = "element-editor";
  const editorTitle = document.createElement("strong");
  editorTitle.textContent = "選択した要素を少し調整";
  const editorHint = document.createElement("div");
  editorHint.className = "hint";
  editorHint.textContent = "矢印キーで移動（Shiftで4倍）。3D上の選択形状はドラッグできます。";
  const sizeStep = document.createElement("input"); sizeStep.type = "number"; sizeStep.min = "1"; sizeStep.max = "50"; sizeStep.step = "1"; sizeStep.value = "10";
  const rotateStep = document.createElement("input"); rotateStep.type = "number"; rotateStep.min = "1"; rotateStep.max = "90"; rotateStep.step = "1"; rotateStep.value = "15";
  const moveStep = document.createElement("input"); moveStep.type = "number"; moveStep.min = "0.005"; moveStep.max = "0.3"; moveStep.step = "0.005"; moveStep.value = "0.05";
  const editorNumber = (label: string, input: HTMLInputElement) => {
    const row = document.createElement("label"); row.className = "row"; row.append(document.createTextNode(label), input); editor.appendChild(row);
  };
  editorNumber("大きさの刻み（%）", sizeStep);
  editorNumber("回す角度（度）", rotateStep);
  editorNumber("動かす刻み", moveStep);
  const editorButtons = document.createElement("div"); editorButtons.className = "element-editor-buttons";
  const nudgeButtons = document.createElement("div"); nudgeButtons.className = "element-editor-nudge-buttons";
  const bounded = (input: HTMLInputElement, fallback: number) => {
    const value = Number(input.value); const min = Number(input.min); const max = Number(input.max);
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  const edit = (intent: PatchEditIntent) => { if (registrySelected !== null) callbacks.onElementEdit(registrySelected, intent); };
  const addEditButton = (label: string, intent: () => PatchEditIntent) => {
    const button = document.createElement("button"); button.textContent = label; button.onclick = () => edit(intent()); editorButtons.appendChild(button);
  };
  const addNudgeButton = (label: string, intent: () => PatchEditIntent) => {
    const button = document.createElement("button"); button.textContent = label; button.onclick = () => edit(intent()); nudgeButtons.appendChild(button);
  };
  addEditButton("小さく", () => ({ kind: "scale", factor: 1 - bounded(sizeStep, 10) / 100 }));
  addEditButton("大きく", () => ({ kind: "scale", factor: 1 + bounded(sizeStep, 10) / 100 }));
  addEditButton("左へ回す", () => ({ kind: "rotate", degrees: -bounded(rotateStep, 15) }));
  addEditButton("右へ回す", () => ({ kind: "rotate", degrees: bounded(rotateStep, 15) }));
  const duplicateButton = document.createElement("button");
  duplicateButton.textContent = "複製";
  duplicateButton.onclick = () => { if (registrySelected !== null) callbacks.onDuplicateElement(registrySelected); };
  editorButtons.appendChild(duplicateButton);
  addNudgeButton("←", () => ({ kind: "nudge", u: -bounded(moveStep, 0.05), v: 0 }));
  addNudgeButton("→", () => ({ kind: "nudge", u: bounded(moveStep, 0.05), v: 0 }));
  addNudgeButton("↑", () => ({ kind: "nudge", u: 0, v: bounded(moveStep, 0.05) }));
  addNudgeButton("↓", () => ({ kind: "nudge", u: 0, v: -bounded(moveStep, 0.05) }));
  const editorStatus = document.createElement("div"); editorStatus.className = "element-editor-status"; editorStatus.textContent = "要素を選ぶと調整できます";
  editor.prepend(editorTitle, editorHint);
  editor.append(editorButtons, nudgeButtons, editorStatus);

  // This is deliberately separate from Step 4's whole-family preview and
  // controls above. It edits a realized element's own saved generator values
  // without changing the next Pack settings or moving any neighbour.
  const selectedMotif = document.createElement("section");
  selectedMotif.className = "selected-motif-editor";
  selectedMotif.hidden = true;
  const selectedMotifTitle = document.createElement("strong");
  selectedMotifTitle.textContent = "選んだ形だけ調整";
  const selectedMotifSource = document.createElement("div");
  selectedMotifSource.className = "selected-motif-source";
  const selectedMotifCanvas = document.createElement("canvas");
  selectedMotifCanvas.width = 320;
  selectedMotifCanvas.height = 180;
  selectedMotifCanvas.setAttribute("aria-label", "選んだ要素だけの形状プレビュー");
  enableMotifPreview3D(selectedMotifCanvas);
  const selectedMotifControls = document.createElement("div");
  selectedMotifControls.className = "selected-motif-controls";
  const selectedPlacementRow = document.createElement("div");
  selectedPlacementRow.className = "selected-motif-row selected-placement-row";
  const selectedPlacementLabel = document.createElement("span");
  selectedPlacementLabel.textContent = "表面からの位置";
  const selectedPlacementButtons = document.createElement("div");
  selectedPlacementButtons.className = "mode-toggle";
  let selectedMotifPlacement: MotifPlacement = "surface";
  const selectedPlacementChoices: Array<[MotifPlacement, string]> = [
    ["surface", "表面"], ["center", "面中心"], ["inside", "内側"],
  ];
  const selectedPlacementButtonMap = new Map<MotifPlacement, HTMLButtonElement>();
  for (const [placement, label] of selectedPlacementChoices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => {
      if (!selectedMotifPatch || !selectedMotifEligible) return;
      callbacks.onElementEdit(selectedMotifPatch.id, { kind: "placement", placement });
      selectedMotifPlacement = placement;
      for (const [choice, choiceButton] of selectedPlacementButtonMap) {
        choiceButton.classList.toggle("mode-active", choice === placement);
      }
      selectedMotifStatus.textContent = `${label}へ移動しました。接点・空隙・メッシュ・分割を再確認してください`;
      selectedMotifStatus.classList.remove("warn");
    };
    selectedPlacementButtonMap.set(placement, button);
    selectedPlacementButtons.appendChild(button);
  }
  selectedPlacementRow.append(selectedPlacementLabel, selectedPlacementButtons);
  selectedMotifControls.appendChild(selectedPlacementRow);
  const selectedMotifApply = document.createElement("button");
  selectedMotifApply.type = "button";
  selectedMotifApply.className = "primary-action";
  selectedMotifApply.textContent = "この要素だけ更新";
  selectedMotifApply.disabled = true;
  const selectedMotifStatus = document.createElement("div");
  selectedMotifStatus.className = "element-editor-status";
  selectedMotifStatus.textContent = "要素を選ぶと、その要素の保存値を表示します";
  const selectedMotifHint = document.createElement("div");
  selectedMotifHint.className = "hint";
  selectedMotifHint.textContent = "隣の要素は動かしません。更新後は接点・空隙・メッシュ・分割をもう一度確認します。";
  selectedMotif.append(
    selectedMotifTitle,
    selectedMotifSource,
    selectedMotifCanvas,
    selectedMotifControls,
    selectedMotifApply,
    selectedMotifStatus,
    selectedMotifHint,
  );
  const selectedElementDock = document.createElement("aside");
  selectedElementDock.className = "selected-element-dock";
  selectedElementDock.hidden = true;
  selectedElementDock.append(editor, selectedMotif);
  // This dock deliberately lives inside the viewport so it stays beside the
  // selected object. Do not let its controls bubble into the viewport's
  // click/drag picker: removing the selected button during pointerup would
  // otherwise cancel the subsequent click before "この要素だけ更新" runs.
  for (const type of ["pointerdown", "pointerup", "pointercancel"] as const) {
    selectedElementDock.addEventListener(type, (event) => event.stopPropagation());
  }
  (container.querySelector("#viewport") ?? container).appendChild(selectedElementDock);

  let selectedMotifPatch: Patch | null = null;
  let selectedMotifDraft: MotifShapeParams | null = null;
  let selectedRingDiameter: number | null = null;
  let selectedRingInitialDiameter: number | null = null;
  let selectedMotifSignature = "";
  let selectedMotifEligible = false;
  const selectedMotifRows: Array<{ shapes: Patch["shape"][]; sync: () => void; row: HTMLElement }> = [];
  const motifNumber = (
    label: string,
    key: Exclude<keyof MotifShapeParams, "flowerMotifPreset" | "flowerShowCore">,
    min: number,
    max: number,
    step: number,
    shapes: Patch["shape"][],
  ) => {
    const row = document.createElement("label");
    row.className = "selected-motif-row";
    const caption = document.createElement("span");
    caption.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min); input.max = String(max); input.step = String(step);
    const output = document.createElement("output");
    const sync = () => {
      if (!selectedMotifDraft) return;
      input.value = String(selectedMotifDraft[key]);
      output.textContent = step >= 1 ? String(Math.round(Number(selectedMotifDraft[key]))) : Number(selectedMotifDraft[key]).toFixed(2);
    };
    input.oninput = () => {
      if (!selectedMotifDraft) return;
      (selectedMotifDraft as unknown as Record<string, number | boolean | string>)[key] =
        step >= 1 ? Math.round(Number(input.value)) : Number(input.value);
      if (shapes.includes("flower")) selectedMotifDraft.flowerMotifPreset = "custom";
      selectedMotifApply.textContent = "この要素だけ更新（変更あり）";
      selectedMotifApply.disabled = !selectedMotifEligible;
      selectedMotifStatus.textContent = "未保存の変更があります";
      selectedMotifStatus.classList.remove("warn");
      sync();
      renderSelectedMotifPreview();
    };
    row.append(caption, input, output);
    selectedMotifControls.appendChild(row);
    selectedMotifRows.push({ shapes, sync, row });
  };
  let selectedMotifCurrent: SkinParams = { ...skinParams };
  const ringDiameterRow = document.createElement("label");
  ringDiameterRow.className = "selected-motif-row selected-ring-diameter-row";
  const ringDiameterCaption = document.createElement("span");
  ringDiameterCaption.textContent = "リング直径（中心線）";
  const ringDiameterInput = document.createElement("input");
  ringDiameterInput.type = "number";
  ringDiameterInput.step = "0.01";
  ringDiameterInput.setAttribute("aria-label", "リング直径（中心線）");
  const ringDiameterUnit = document.createElement("output");
  ringDiameterUnit.textContent = "形状単位";
  ringDiameterRow.append(ringDiameterCaption, ringDiameterInput, ringDiameterUnit);
  selectedMotifControls.appendChild(ringDiameterRow);
  function selectedRingOrbitScale(): number {
    if (
      selectedMotifPatch?.shape !== "ring3d" ||
      selectedRingDiameter === null ||
      selectedRingInitialDiameter === null ||
      selectedRingInitialDiameter <= 0
    ) return 1;
    return Math.min(4, Math.max(0.25, selectedRingDiameter / selectedRingInitialDiameter));
  }
  function renderSelectedMotifPreview(): void {
    if (!selectedMotifDraft || !selectedMotifPatch) return;
    renderMotifPreview(
      selectedMotifCanvas,
      { ...selectedMotifCurrent, ...selectedMotifDraft, patchShape: selectedMotifPatch.shape },
      selectedRingOrbitScale(),
    );
  }
  ringDiameterInput.oninput = () => {
    if (!selectedMotifPatch || selectedMotifPatch.shape !== "ring3d") return;
    const value = Number(ringDiameterInput.value);
    if (!Number.isFinite(value)) return;
    const min = Math.max(0.04, selectedMotifCurrent.minR * 0.5);
    const max = Math.max(min, selectedMotifCurrent.maxR * 5);
    selectedRingDiameter = Math.min(max, Math.max(min, value));
    ringDiameterInput.value = selectedRingDiameter.toFixed(3);
    selectedMotifApply.textContent = "この要素だけ更新（変更あり）";
    selectedMotifApply.disabled = !selectedMotifEligible;
    selectedMotifStatus.textContent = "未保存の直径変更があります（管の太さは変わりません）";
    selectedMotifStatus.classList.remove("warn");
    renderSelectedMotifPreview();
  };
  motifNumber("輪郭のゆらぎ", "irregularity", 0, 1, 0.01, ["coin"]);
  motifNumber("コインの中央穴", "coinHoleRatio", 0, 0.95, 0.01, ["coin"]);
  motifNumber("穴の大きさ", "flatRingHoleRatio", 0.08, 0.9, 0.01, ["flatRing"]);
  motifNumber("節の数", "ringNodeCount", 4, 18, 1, ["flatRing", "ring3d"]);
  motifNumber("管の太さ", "ringTubeR", 0.02, 0.3, 0.005, ["ring3d"]);
  motifNumber("節のゆらぎ", "ringWobbleR", 0, 1, 0.01, ["flatRing", "ring3d"]);
  motifNumber("並びのゆらぎ", "ringWobblePos", 0, 1, 0.01, ["ring3d"]);
  motifNumber("花弁の数", "flowerPetalCount", 3, 12, 1, ["flower"]);
  motifNumber("花の開き", "flowerOpening", 0.72, 1.22, 0.01, ["flower"]);
  motifNumber("花弁の首", "flowerNeck", 0.14, 0.62, 0.01, ["flower"]);
  motifNumber("花芯の大きさ", "flowerCoreSize", 0.42, 0.78, 0.01, ["flower"]);
  motifNumber("花弁の起き上がり", "flowerCupping", -0.18, 0.5, 0.01, ["flower"]);
  motifNumber("花芯の高さ", "flowerCoreLift", -0.12, 0.5, 0.01, ["flower"]);
  motifNumber("花弁の成長差", "flowerGrowthDifference", 0, 0.34, 0.01, ["flower"]);
  motifNumber("花の融合幅", "flowerExpansion", 0, 2, 0.05, ["flower"]);
  const coreRow = document.createElement("div");
  coreRow.className = "selected-motif-core";
  const coreLabel = document.createElement("span"); coreLabel.textContent = "花芯";
  const coreToggle = document.createElement("button"); coreToggle.type = "button";
  coreToggle.onclick = () => {
    if (!selectedMotifDraft) return;
    selectedMotifDraft.flowerShowCore = !selectedMotifDraft.flowerShowCore;
    selectedMotifDraft.flowerMotifPreset = "custom";
    selectedMotifApply.textContent = "この要素だけ更新（変更あり）";
    selectedMotifApply.disabled = !selectedMotifEligible;
    selectedMotifStatus.textContent = "未保存の変更があります";
    selectedMotifStatus.classList.remove("warn");
    syncSelectedMotifControls();
    renderSelectedMotifPreview();
  };
  coreRow.append(coreLabel, coreToggle);
  selectedMotifControls.appendChild(coreRow);
  const presetRow = document.createElement("div");
  presetRow.className = "selected-motif-row";
  const presetLabel = document.createElement("span"); presetLabel.textContent = "元の花型";
  const presetValue = document.createElement("output");
  presetRow.append(presetLabel, presetValue);
  selectedMotifControls.appendChild(presetRow);
  function syncSelectedMotifControls(): void {
    if (!selectedMotifDraft || !selectedMotifPatch) return;
    for (const entry of selectedMotifRows) {
      entry.row.hidden = !entry.shapes.includes(selectedMotifPatch.shape);
      entry.sync();
    }
    coreRow.hidden = selectedMotifPatch.shape !== "flower";
    presetRow.hidden = selectedMotifPatch.shape !== "flower";
    ringDiameterRow.hidden = selectedMotifPatch.shape !== "ring3d";
    if (selectedMotifPatch.shape === "ring3d" && selectedRingDiameter !== null) {
      const min = Math.max(0.04, selectedMotifCurrent.minR * 0.5);
      const max = Math.max(min, selectedMotifCurrent.maxR * 5);
      ringDiameterInput.min = String(min);
      ringDiameterInput.max = String(max);
      ringDiameterInput.value = selectedRingDiameter.toFixed(3);
    }
    coreToggle.textContent = selectedMotifDraft.flowerShowCore ? "あり" : "なし";
    coreToggle.classList.toggle("mode-active", selectedMotifDraft.flowerShowCore);
    presetValue.textContent = selectedMotifDraft.flowerMotifPreset === "custom" ? "手調整" : selectedMotifDraft.flowerMotifPreset;
  }
  function setSelectedMotif(
    patch: Patch | null,
    current: SkinParams,
    eligibility: { ok: boolean; reason?: string },
  ): void {
    selectedMotifCurrent = { ...current };
    if (!patch) {
      selectedMotifPatch = null;
      selectedMotifDraft = null;
      selectedRingDiameter = null;
      selectedRingInitialDiameter = null;
      selectedMotifSignature = "";
      selectedMotifEligible = false;
      selectedMotifApply.textContent = "この要素だけ更新";
      selectedMotifApply.disabled = true;
      selectedMotif.hidden = true;
      return;
    }
    // Surface clicks and registry selection both flow here immediately. Open
    // once when the selected element changes, but respect a later manual
    // close while that same element remains selected.
    // Fill newly-added motif keys from current defaults before applying a
    // legacy patch capture. Old recipes therefore show coin hole=0 instead
    // of an empty/NaN control, without changing their realized points.
    const source = { ...captureMotifShapeParams(current), ...(patch.motifParams ?? {}) };
    const ringDiameter = ring3dCenterlineDiameter(patch);
    const signature = `${patch.id}:${JSON.stringify(source)}:${ringDiameter?.toFixed(6) ?? ""}`;
    if (signature !== selectedMotifSignature) {
      selectedMotifPatch = patch;
      selectedMotifDraft = { ...source };
      selectedRingDiameter = ringDiameter;
      selectedRingInitialDiameter = ringDiameter;
      selectedMotifSignature = signature;
      selectedMotifApply.textContent = "この要素だけ更新";
      selectedMotifStatus.textContent = "保存値を変更してから、この要素だけ更新します";
      selectedMotifStatus.classList.remove("warn");
    } else {
      selectedMotifPatch = patch;
    }
    selectedMotif.hidden = false;
    selectedMotifTitle.textContent = `選んだ${SHAPE_LABELS.find(([shape]) => shape === patch.shape)?.[1] ?? "形"}だけ調整`;
    selectedMotifSource.textContent = patch.motifParams
      ? "この要素を作った保存値"
      : "以前のレシピ：いまの生成設定を仮の初期値として表示中";
    selectedMotifEligible = eligibility.ok;
    selectedMotifPlacement = patch.motifPlacement ?? "surface";
    for (const [placement, button] of selectedPlacementButtonMap) {
      button.classList.toggle("mode-active", placement === selectedMotifPlacement);
      button.disabled = !eligibility.ok;
    }
    selectedMotifApply.disabled = !eligibility.ok;
    if (!eligibility.ok) {
      selectedMotifStatus.textContent = eligibility.reason ?? "この要素は個別に更新できません";
      selectedMotifStatus.classList.add("warn");
    } else if (selectedMotifStatus.classList.contains("warn")) {
      selectedMotifStatus.textContent = "保存値を変更してから、この要素だけ更新します";
      selectedMotifStatus.classList.remove("warn");
    }
    syncSelectedMotifControls();
    renderSelectedMotifPreview();
  }
  selectedMotifApply.onclick = () => {
    if (selectedMotifApply.disabled || !selectedMotifPatch || !selectedMotifDraft) return;
    const beforePointCount = selectedMotifPatch.points.length;
    const updated = callbacks.onReshapePatch(
      selectedMotifPatch.id,
      { ...selectedMotifDraft },
      selectedMotifPatch.shape === "ring3d" ? selectedRingDiameter ?? undefined : undefined,
    );
    if (!updated) return;
    const afterPointCount = selectedMotifPatch?.points.length ?? beforePointCount;
    selectedMotifApply.textContent = "この要素だけ更新";
    selectedMotifStatus.textContent = `更新しました（点 ${beforePointCount} → ${afterPointCount}）。接点・空隙・メッシュ・分割を再確認してください`;
    selectedMotifStatus.classList.remove("warn");
  };

  const autoSwitchNotice = document.createElement("div");
  autoSwitchNotice.className = "hint auto-switch-notice";
  autoSwitchNotice.textContent =
    "⚠ 点群がレイマーチの表示容量を超えたため、自動でビーズ表示に切り替えました（先頭だけを黙って描く旧挙動は廃止）。";
  autoSwitchNotice.style.display = "none";
  root.appendChild(autoSwitchNotice);

  const viewCaption = document.createElement("div");
  viewCaption.className = "hint";
  root.appendChild(viewCaption);

  function renderViewMode(mode: SkinViewMode, totalPatchPoints: number, coinBulge: number): void {
    for (const [m, btn] of Object.entries(viewButtons) as [SkinViewMode, HTMLButtonElement][]) {
      btn.classList.toggle("mode-active", m === mode);
    }
    if (mode === "raymarch") {
      viewCaption.textContent =
        totalPatchPoints > PATCH_MAX_POINTS
          ? `レイマーチ: 食い込みなしで滑らかだが表示容量に上限あり（画面は先頭${PATCH_MAX_POINTS}点まで。全${totalPatchPoints}点は超過中 -- 「ビーズ」か「全体メッシュ」で全量を見てください）` +
            (coinBulge > 0 ? " ※容量内ならふくらみ比較もそのまま反映されます。" : "")
          : "レイマーチ: 食い込みなしで滑らかな合成場をそのまま描画（この点数では容量内）。";
    } else if (mode === "beads") {
      viewCaption.textContent =
        `ビーズ近似: ブレンド（smooth-min）省略・配置と密度は全量正確（全${totalPatchPoints}点）。リングは元々数珠なので見た目の乖離は小さいはずだが、コインの融合など見た目が変わる形状もある（README 参照）。容量の制約なしにオービット/ズームできる。` +
        (coinBulge > 0
          ? " ⚠ ビーズは生のPatchPoint球をそのまま描くため、コインのふくらみ（shell clippingの差）を正しく表しません。ふくらみ比較には「全体メッシュ」を使ってください。"
          : "");
    } else {
      viewCaption.textContent = "段階メッシュ: まず粗い形を表示し、画面を動かせるまま設定解像度の形へ自動更新します。印刷・書き出しは別の検査経路です。";
    }
  }

  function renderDisplayStyle(style: SkinDisplayStyle): void {
    for (const [candidate, button] of displayStyleButtons) {
      button.classList.toggle("mode-active", candidate === style);
    }
  }
  renderDisplayStyle("solid");

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

  const resultTools = document.createElement("details");
  resultTools.className = "result-tools";
  const resultToolsSummary = document.createElement("summary");
  resultToolsSummary.textContent = "生成結果を見る・手で直す";
  resultTools.appendChild(resultToolsSummary);
  resultTools.append(
    autoSwitchNotice,
    viewCaption,
    manualRow,
    manualRadiusBuilt.row,
    hint,
    deletePatchBtn,
    selectionInfo,
    gaugesPanel,
    linkingPanel,
  );
  root.appendChild(resultTools);

  // These experimental controls stay together at the end of Properties so
  // the author workflow rail remains a clean 1–10 path. The child nodes are
  // the existing controls; only their containing section is new.
  const frozenExperiments = document.createElement("section");
  frozenExperiments.className = "skin-frozen-experiments";
  frozenExperiments.setAttribute("aria-label", "凍結中の実験");
  const frozenExperimentsTitle = document.createElement("div");
  frozenExperimentsTitle.className = "skin-frozen-experiments-title";
  frozenExperimentsTitle.textContent = "凍結中の実験";
  frozenExperiments.append(frozenExperimentsTitle, document.createElement("hr"));

  // --- Generation-native N partition -------------------------------------
  const nPartitionPanel = document.createElement("section");
  nPartitionPanel.className = "mesh-export n-partition";

  const nPartitionTitle = document.createElement("div");
  nPartitionTitle.id = "skin-step-split";
  nPartitionTitle.className = "mesh-export-title";
  nPartitionTitle.textContent = "Frozen split";
  nPartitionPanel.appendChild(nPartitionTitle);

  const nPartitionHint = document.createElement("div");
  nPartitionHint.className = "hint";
  nPartitionHint.textContent =
    "平面では切りません。Surface Packingの流れをN色に分け、曲面境界の検証用部品を生成します。接着・隙間・強度は未確認です。";
  nPartitionPanel.appendChild(nPartitionHint);

  const nCountRow = document.createElement("div");
  nCountRow.className = "row mesh-row";
  const nCountLabel = document.createElement("label");
  nCountLabel.textContent = "部品数";
  const nCountSelect = document.createElement("select");
  nCountSelect.setAttribute("aria-label", "N分割の部品数");
  for (let count = 2; count <= 6; count++) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = `${count}分割`;
    option.selected = count === 3;
    nCountSelect.appendChild(option);
  }
  nCountRow.append(nCountLabel, nCountSelect);
  nPartitionPanel.appendChild(nCountRow);

  const nProposeBtn = document.createElement("button");
  nProposeBtn.type = "button";
  nProposeBtn.className = "primary-action";
  nProposeBtn.textContent = "N色の分け方を提案・確定";
  nProposeBtn.onclick = () => callbacks.onProposeNPartition(Number(nCountSelect.value));
  nPartitionPanel.appendChild(nProposeBtn);

  const nLegend = document.createElement("div");
  nLegend.className = "n-partition-legend";
  nLegend.hidden = true;
  nPartitionPanel.appendChild(nLegend);

  const nProposal = document.createElement("div");
  nProposal.className = "selection-info";
  nProposal.textContent = "未提案";
  nProposal.setAttribute("aria-live", "polite");
  nPartitionPanel.appendChild(nProposal);

  const nBuildRow = document.createElement("div");
  nBuildRow.className = "row";
  const nBuildBtn = document.createElement("button");
  nBuildBtn.type = "button";
  nBuildBtn.textContent = "このN分割を生成";
  nBuildBtn.onclick = () => callbacks.onBuildNPartition();
  const nCancelBtn = document.createElement("button");
  nCancelBtn.type = "button";
  nCancelBtn.textContent = "キャンセル";
  nCancelBtn.disabled = true;
  nCancelBtn.onclick = () => callbacks.onCancelNPartitionBuild();
  nBuildRow.append(nBuildBtn, nCancelBtn);
  nPartitionPanel.appendChild(nBuildRow);

  const nStatus = document.createElement("div");
  nStatus.className = "mesh-status";
  nStatus.textContent = "未生成";
  nStatus.setAttribute("aria-live", "polite");
  nPartitionPanel.appendChild(nStatus);

  const nMetrics = document.createElement("pre");
  nMetrics.className = "partition-metrics";
  nPartitionPanel.appendChild(nMetrics);

  const nExportHint = document.createElement("div");
  nExportHint.className = "hint";
  nExportHint.textContent =
    "現在のN分割は形状・水密・部品数・体積差を確認する検証版です。印刷成功や接着強度は保証しません。";
  nPartitionPanel.appendChild(nExportHint);

  const nExportBtn = document.createElement("button");
  nExportBtn.type = "button";
  nExportBtn.textContent = "検証用N部品をまとめて保存";
  nExportBtn.disabled = true;
  nExportBtn.onclick = () => callbacks.onExportNPartition();
  nPartitionPanel.appendChild(nExportBtn);

  frozenExperiments.append(nPartitionPanel, document.createElement("hr"));

  // --- T13 coin由来A/B分割 --------------------------------------------------
  const partitionPanel = document.createElement("details");
  partitionPanel.className = "mesh-export";

  const partitionTitle = document.createElement("summary");
  partitionTitle.className = "mesh-export-title";
  partitionTitle.textContent = "詳細を開く: 旧A/B分割";
  partitionPanel.appendChild(partitionTitle);

  // --- Optional guided tutorial (compact card; never a modal overlay) ------
  const tutorialStartBtn = document.createElement("button");
  tutorialStartBtn.type = "button";
  tutorialStartBtn.className = "tutorial-start-btn";
  tutorialStartBtn.textContent = "分割ガイドを開始";
  tutorialStartBtn.onclick = () => callbacks.onTutorialOpen();
  partitionPanel.appendChild(tutorialStartBtn);

  const tutorialCard = document.createElement("section");
  tutorialCard.className = "partition-tutorial";
  tutorialCard.hidden = true;
  tutorialCard.setAttribute("aria-label", "A/B分割ガイド");

  const tutorialHeader = document.createElement("div");
  tutorialHeader.className = "partition-tutorial-header";
  const tutorialStepLabel = document.createElement("div");
  tutorialStepLabel.className = "partition-tutorial-step";
  tutorialStepLabel.textContent = `Step 1 / ${TUTORIAL_TOTAL_STEPS}`;
  const tutorialCloseBtn = document.createElement("button");
  tutorialCloseBtn.type = "button";
  tutorialCloseBtn.textContent = "閉じる";
  tutorialCloseBtn.onclick = () => {
    callbacks.onTutorialClose();
    // Avoid leaving focus on a now-hidden control.
    tutorialStartBtn.focus();
  };
  tutorialHeader.appendChild(tutorialStepLabel);
  tutorialHeader.appendChild(tutorialCloseBtn);
  tutorialCard.appendChild(tutorialHeader);

  const tutorialHeading = document.createElement("h3");
  tutorialHeading.className = "partition-tutorial-title";
  tutorialHeading.textContent = "";
  tutorialCard.appendChild(tutorialHeading);

  // T14 §2.5: the one-line imperative instruction (TutorialStepContent.short)
  // is now the primary always-visible content -- 作者方針 2026-07-20 "文字は
  // あまり読まない...今すべき操作を強調表示が大事". The old multi-bullet
  // body moves into a collapsed <details>, closed by default, so a first
  // glance at the card shows only Step N/8 + heading + this one line.
  const tutorialShort = document.createElement("div");
  tutorialShort.className = "partition-tutorial-short";
  tutorialShort.setAttribute("aria-live", "polite");
  tutorialCard.appendChild(tutorialShort);

  // Shown only while browsing a past step (displayedStep !== actualStep), so
  // it's always clear that reading an earlier step is not the same as the
  // real workflow having moved backward.
  const tutorialViewingPastNote = document.createElement("div");
  tutorialViewingPastNote.className = "partition-tutorial-viewing-past";
  tutorialViewingPastNote.hidden = true;
  tutorialCard.appendChild(tutorialViewingPastNote);

  const tutorialDetails = document.createElement("details");
  tutorialDetails.className = "partition-tutorial-details";
  const tutorialSummary = document.createElement("summary");
  tutorialSummary.textContent = "詳しく見る";
  tutorialDetails.appendChild(tutorialSummary);
  const tutorialBody = document.createElement("ul");
  tutorialBody.className = "partition-tutorial-body";
  tutorialDetails.appendChild(tutorialBody);
  tutorialCard.appendChild(tutorialDetails);

  const tutorialNav = document.createElement("div");
  tutorialNav.className = "partition-tutorial-nav row";
  const tutorialPrevBtn = document.createElement("button");
  tutorialPrevBtn.type = "button";
  tutorialPrevBtn.textContent = "前へ";
  tutorialPrevBtn.onclick = () => callbacks.onTutorialPrev();
  const tutorialAdvanceBtn = document.createElement("button");
  tutorialAdvanceBtn.type = "button";
  tutorialAdvanceBtn.dataset.tutorialTarget = "confirm-review";
  tutorialAdvanceBtn.textContent = "確認した";
  tutorialAdvanceBtn.onclick = () => callbacks.onTutorialAdvance();
  const tutorialRestartBtn = document.createElement("button");
  tutorialRestartBtn.type = "button";
  tutorialRestartBtn.textContent = "最初から読む";
  tutorialRestartBtn.onclick = () => callbacks.onTutorialRestart();
  const tutorialReturnBtn = document.createElement("button");
  tutorialReturnBtn.type = "button";
  tutorialReturnBtn.hidden = true;
  tutorialReturnBtn.onclick = () => callbacks.onTutorialReturnToCurrent();
  tutorialNav.appendChild(tutorialPrevBtn);
  tutorialNav.appendChild(tutorialAdvanceBtn);
  tutorialNav.appendChild(tutorialRestartBtn);
  tutorialNav.appendChild(tutorialReturnBtn);
  tutorialCard.appendChild(tutorialNav);
  partitionPanel.appendChild(tutorialCard);

  const partitionHint = document.createElement("div");
  partitionHint.className = "hint";
  partitionHint.textContent =
    "「A端・B端を選び直す」を押し、分けたい方向の片端をA端、反対側をB端として順にクリックします。2点目で選択モードは自動終了します。" +
    "両端からの隣接グラフ距離を使い、個数が約半分になるA/B候補を提案します。" +
    "個別パッチの群は「選択中のパッチをA/Bへ」で上書きできます。AもBも使うかは作者が確定・分割実行後に判断してください（自動判定なし）。";
  partitionPanel.appendChild(partitionHint);

  const partitionLegend = document.createElement("div");
  partitionLegend.className = "partition-legend";
  partitionLegend.dataset.tutorialTarget = "legend";
  partitionLegend.innerHTML =
    '<span><i class="partition-swatch partition-swatch-a"></i><strong>青 = A</strong></span>' +
    '<span><i class="partition-swatch partition-swatch-b"></i><strong>オレンジ = B</strong></span>';
  partitionPanel.appendChild(partitionLegend);

  const seedModeRow = document.createElement("div");
  seedModeRow.className = "row";
  const seedModeToggle = document.createElement("button");
  seedModeToggle.type = "button";
  seedModeToggle.dataset.tutorialTarget = "seed-pick";
  seedModeToggle.textContent = "A端・B端を選び直す";
  let seedModeActive = false;
  const renderSeedModeButton = () => {
    seedModeToggle.classList.toggle("active", seedModeActive);
    seedModeToggle.textContent = seedModeActive
      ? "両端選択を中止（A端→B端）"
      : "A端・B端を選び直す";
  };
  seedModeToggle.onclick = () => {
    seedModeActive = !seedModeActive;
    renderSeedModeButton();
    callbacks.onToggleSeedPickMode(seedModeActive);
  };
  const clearSeedsBtn = document.createElement("button");
  clearSeedsBtn.type = "button";
  clearSeedsBtn.textContent = "端点と色分けをクリア";
  clearSeedsBtn.onclick = () => callbacks.onClearSeeds();
  seedModeRow.appendChild(seedModeToggle);
  seedModeRow.appendChild(clearSeedsBtn);
  partitionPanel.appendChild(seedModeRow);

  const proposeRow = document.createElement("div");
  proposeRow.className = "row";
  const proposeBtn = document.createElement("button");
  proposeBtn.type = "button";
  proposeBtn.dataset.tutorialTarget = "propose";
  proposeBtn.textContent = "両端から約半分のA/B候補を提案";
  proposeBtn.onclick = () => callbacks.onProposeGroups();
  proposeRow.appendChild(proposeBtn);
  partitionPanel.appendChild(proposeRow);

  // T14 §2.2: always-visible "選択中Patch: ..." line, right where the A/B
  // decision is made -- independent of the far-away general selection-info
  // line (which stays as-is). Color swatch + text both, per 作者方針
  // "色見本と文字の両方を使う".
  const partitionSelectionRow = document.createElement("div");
  partitionSelectionRow.className = "partition-selection-line";
  const partitionSelectionSwatch = document.createElement("i");
  partitionSelectionSwatch.className = "partition-swatch";
  partitionSelectionSwatch.hidden = true;
  const partitionSelectionText = document.createElement("span");
  partitionSelectionText.setAttribute("aria-live", "polite");
  partitionSelectionText.textContent = describePartitionSelectionLabel(null);
  partitionSelectionRow.appendChild(partitionSelectionSwatch);
  partitionSelectionRow.appendChild(partitionSelectionText);
  partitionPanel.appendChild(partitionSelectionRow);

  const overrideRow = document.createElement("div");
  overrideRow.className = "row";
  overrideRow.dataset.tutorialTarget = "assign-ab";
  const assignABtn = document.createElement("button");
  assignABtn.type = "button";
  assignABtn.textContent = "選択中のパッチをAへ";
  assignABtn.disabled = true;
  assignABtn.onclick = () => callbacks.onAssignSelectedPatchToGroup("A");
  const assignBBtn = document.createElement("button");
  assignBBtn.type = "button";
  assignBBtn.textContent = "選択中のパッチをBへ";
  assignBBtn.disabled = true;
  assignBBtn.onclick = () => callbacks.onAssignSelectedPatchToGroup("B");
  overrideRow.appendChild(assignABtn);
  overrideRow.appendChild(assignBBtn);
  partitionPanel.appendChild(overrideRow);

  const partitionDraftInfo = document.createElement("div");
  partitionDraftInfo.className = "selection-info";
  partitionDraftInfo.textContent = "シード未選択";
  partitionPanel.appendChild(partitionDraftInfo);

  const previewFilterRow = document.createElement("div");
  previewFilterRow.className = "row";
  previewFilterRow.dataset.tutorialTarget = "preview-filter";
  const previewFilterLabel = document.createElement("span");
  previewFilterLabel.textContent = "プレビュー: ";
  previewFilterRow.appendChild(previewFilterLabel);
  const previewFilterButtons: Record<"both" | "A" | "B", HTMLButtonElement> = {} as never;
  for (const [key, label] of [["both", "A+B"], ["A", "Aのみ"], ["B", "Bのみ"]] as const) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.onclick = () => {
      for (const k of ["both", "A", "B"] as const) previewFilterButtons[k].classList.toggle("mode-active", k === key);
      callbacks.onSetPartitionPreviewFilter(key);
    };
    previewFilterButtons[key] = btn;
    previewFilterRow.appendChild(btn);
  }
  previewFilterButtons.both.classList.add("mode-active");
  partitionPanel.appendChild(previewFilterRow);

  const confirmRow = document.createElement("div");
  confirmRow.className = "row";
  const confirmPartitionBtn = document.createElement("button");
  confirmPartitionBtn.type = "button";
  confirmPartitionBtn.dataset.tutorialTarget = "confirm";
  confirmPartitionBtn.textContent = "このA/B構成を確定（履歴へ記録）";
  confirmPartitionBtn.onclick = () => callbacks.onConfirmPartition();
  confirmRow.appendChild(confirmPartitionBtn);
  partitionPanel.appendChild(confirmRow);

  const buildRow = document.createElement("div");
  buildRow.className = "row";
  const buildPartitionBtn = document.createElement("button");
  buildPartitionBtn.type = "button";
  buildPartitionBtn.dataset.tutorialTarget = "build";
  buildPartitionBtn.textContent = "確定したA/Bを物理分割してメッシュ化（Workerで実行）";
  buildPartitionBtn.onclick = () => callbacks.onBuildPartition();
  const cancelPartitionBtn = document.createElement("button");
  cancelPartitionBtn.type = "button";
  cancelPartitionBtn.dataset.tutorialTarget = "cancel-build";
  cancelPartitionBtn.textContent = "キャンセル";
  cancelPartitionBtn.disabled = true;
  cancelPartitionBtn.onclick = () => callbacks.onCancelPartitionBuild();
  buildRow.appendChild(buildPartitionBtn);
  buildRow.appendChild(cancelPartitionBtn);
  partitionPanel.appendChild(buildRow);

  const partitionStatus = document.createElement("div");
  partitionStatus.className = "mesh-status";
  partitionStatus.textContent = "未分割";
  partitionPanel.appendChild(partitionStatus);

  const partitionMetrics = document.createElement("pre");
  partitionMetrics.className = "partition-metrics";
  partitionPanel.appendChild(partitionMetrics);

  const exportHint = document.createElement("div");
  exportHint.className = "hint";
  exportHint.textContent =
    "通常書き出しは、A/Bが各1個の連結部品で、実メッシュが保存後トポロジー有効かつ重複・未割当体積が許容値内のときだけ有効になります。" +
    "許容値外でも構造や数値を確認したい場合は「検証用として書き出す（非合格）」を使ってください（ファイル名で区別されます）。";
  partitionPanel.appendChild(exportHint);

  const exportRow = document.createElement("div");
  exportRow.className = "row";
  exportRow.dataset.tutorialTarget = "export-normal";
  const exportABtn = document.createElement("button");
  exportABtn.type = "button";
  exportABtn.textContent = "part-Aのみ書き出す";
  exportABtn.disabled = true;
  exportABtn.onclick = () => callbacks.onExportPartition(["A"]);
  const exportBBtn = document.createElement("button");
  exportBBtn.type = "button";
  exportBBtn.textContent = "part-Bのみ書き出す";
  exportBBtn.disabled = true;
  exportBBtn.onclick = () => callbacks.onExportPartition(["B"]);
  const exportBothBtn = document.createElement("button");
  exportBothBtn.type = "button";
  exportBothBtn.textContent = "両方書き出す";
  exportBothBtn.disabled = true;
  exportBothBtn.onclick = () => callbacks.onExportPartition(["A", "B"]);
  exportRow.appendChild(exportABtn);
  exportRow.appendChild(exportBBtn);
  exportRow.appendChild(exportBothBtn);
  partitionPanel.appendChild(exportRow);

  const verificationExportRow = document.createElement("div");
  verificationExportRow.className = "row";
  verificationExportRow.dataset.tutorialTarget = "export-verify";
  const verifyExportABtn = document.createElement("button");
  verifyExportABtn.type = "button";
  verifyExportABtn.className = "secondary";
  verifyExportABtn.textContent = "検証用A（非合格）";
  verifyExportABtn.disabled = true;
  verifyExportABtn.onclick = () => callbacks.onExportPartitionVerification(["A"]);
  const verifyExportBBtn = document.createElement("button");
  verifyExportBBtn.type = "button";
  verifyExportBBtn.className = "secondary";
  verifyExportBBtn.textContent = "検証用B（非合格）";
  verifyExportBBtn.disabled = true;
  verifyExportBBtn.onclick = () => callbacks.onExportPartitionVerification(["B"]);
  const verifyExportBothBtn = document.createElement("button");
  verifyExportBothBtn.type = "button";
  verifyExportBothBtn.className = "secondary";
  verifyExportBothBtn.textContent = "検証用 両方（非合格）";
  verifyExportBothBtn.disabled = true;
  verifyExportBothBtn.onclick = () => callbacks.onExportPartitionVerification(["A", "B"]);
  verificationExportRow.appendChild(verifyExportABtn);
  verificationExportRow.appendChild(verifyExportBBtn);
  verificationExportRow.appendChild(verifyExportBothBtn);
  partitionPanel.appendChild(verificationExportRow);

  frozenExperiments.append(partitionPanel, document.createElement("hr"));

  const historyRow = document.createElement("div");
  historyRow.className = "row skin-history-export-row";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "skin-history-export";
  exportBtn.textContent = "履歴を書き出す (Export JSON)";
  exportBtn.onclick = () => callbacks.onExport();
  historyRow.appendChild(exportBtn);

  const importRow = document.createElement("div");
  importRow.className = "row skin-history-import-row";
  importRow.dataset.tutorialTarget = "import-recipe";
  const importLabel = document.createElement("label");
  importLabel.textContent = "skin 履歴を読み込む";
  importLabel.className = "file-label skin-history-import-label";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.setAttribute("aria-label", "skin 履歴を読み込む");
  const importFileName = document.createElement("span");
  importFileName.className = "skin-history-file-name";
  importFileName.textContent = "未選択";
  importFileName.setAttribute("aria-live", "polite");
  importInput.onchange = () => {
    const file = importInput.files?.[0];
    if (file) {
      importFileName.textContent = file.name;
      importFileName.title = file.name;
      callbacks.onImportFile(file);
    }
    importInput.value = "";
  };
  importRow.appendChild(importLabel);
  importRow.appendChild(importInput);
  importRow.appendChild(importFileName);
  const historyIo = document.createElement("div");
  historyIo.className = "skin-history-io";
  historyIo.setAttribute("aria-label", "History import and export");
  historyIo.append(historyRow, importRow);
  root.appendChild(historyIo);

  const meshPanel = document.createElement("div");
  meshPanel.className = "mesh-export surface-mesh-generation-panel";

  const meshTitle = document.createElement("div");
  meshTitle.className = "mesh-export-title";
  meshTitle.textContent = "SURFACE / 4 Surface mesh generation";
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
  sizeInput.oninput = () => { refreshGaugesMm(); callbacks.onOpeningMapConditionsChange(); };
  sizeRow.appendChild(sizeLabel);
  sizeRow.appendChild(sizeInput);
  meshPanel.appendChild(sizeRow);

  const resolutionRow = document.createElement("div");
  resolutionRow.className = "row mesh-row";
  const resolutionLabel = document.createElement("label");
  resolutionLabel.textContent = "解像度";
  const resolutionInput = document.createElement("input");
  resolutionInput.type = "range";
  resolutionInput.min = "16";
  resolutionInput.max = "224";
  resolutionInput.step = "8";
  // A 0.8 mm minimum Internal strut needs at least 2.5 samples across its
  // diameter in the fixed 80 mm A1 mini workflow. 128 is the first standard
  // authoring resolution that clears that representation gate.
  resolutionInput.value = "128";
  const resolutionOut = document.createElement("span");
  resolutionOut.className = "value-out";
  resolutionOut.textContent = resolutionInput.value;
  resolutionInput.oninput = () => {
    resolutionOut.textContent = resolutionInput.value;
    quickResolutionInput.value = resolutionInput.value;
    callbacks.onOpeningMapConditionsChange();
  };
  resolutionInput.onchange = () => callbacks.onPreviewMeshResolutionChange(Number(resolutionInput.value));
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
  const cancelMeshExportBtn = document.createElement("button");
  cancelMeshExportBtn.textContent = "書き出しをキャンセル";
  cancelMeshExportBtn.disabled = true;
  cancelMeshExportBtn.onclick = () => callbacks.onCancelMeshExport();
  let meshExportRunning = false;
  let internalPrintGateRequired = false;
  let internalPrintGateExportAllowed = true;
  const syncMeshExportButtons = () => {
    exportMeshBtn.disabled = meshExportRunning || (internalPrintGateRequired && !internalPrintGateExportAllowed);
    inspectMeshBtn.disabled = meshExportRunning;
    cancelMeshExportBtn.disabled = !meshExportRunning;
    exportMeshBtn.textContent = meshExportRunning ? "別処理で書き出し中…" : "3Dデータで書き出す";
    exportMeshBtn.title = internalPrintGateRequired && !internalPrintGateExportAllowed
      ? "A1 mini条件の内部構造判定がOKになるまで書き出せません"
      : "";
  };
  meshButtonRow.appendChild(inspectMeshBtn);
  meshButtonRow.appendChild(exportMeshBtn);
  meshButtonRow.appendChild(cancelMeshExportBtn);
  meshPanel.appendChild(meshButtonRow);

  const meshStatus = document.createElement("div");
  meshStatus.className = "mesh-status";
  meshStatus.textContent = "未検査";
  meshPanel.appendChild(meshStatus);

  const bambuExportPanel = document.createElement("section");
  bambuExportPanel.className = "bambu-3mf-export";
  const bambuExportTitle = document.createElement("strong");
  bambuExportTitle.textContent = "v088候補一式（Bambu Studio用3MF + 来歴）";
  const bambuExportHint = document.createElement("div");
  bambuExportHint.className = "hint";
  bambuExportHint.textContent =
    "共有policyで全オーバーハングをinside / outside / unresolvedへ一度だけ分類します。outsideだけを除去可能なbuild-plate scaffoldへ、insideだけをDry Webへ送り、unresolved・重複・未割当は保存を止めます。成功するとv088-named 3MF、Shape Recipe、Print Profile、validation JSON、正確な保存bytesのSHA-256一覧を一式で保存します。";
  const printProfileActions = document.createElement("div");
  printProfileActions.className = "row bambu-3mf-actions";
  const printProfileInput = document.createElement("input");
  printProfileInput.type = "file";
  printProfileInput.accept = "application/json,.json";
  printProfileInput.hidden = true;
  printProfileInput.onchange = () => {
    const file = printProfileInput.files?.[0];
    if (file) callbacks.onImportPrintProfile(file);
    printProfileInput.value = "";
  };
  const printProfileLoad = document.createElement("button");
  printProfileLoad.type = "button";
  printProfileLoad.textContent = "Print Profileを読み込む";
  printProfileLoad.onclick = () => printProfileInput.click();
  const printProfileSave = document.createElement("button");
  printProfileSave.type = "button";
  printProfileSave.textContent = "現在のProfileを保存";
  printProfileSave.onclick = () => callbacks.onSavePrintProfile();
  printProfileActions.append(printProfileInput, printProfileLoad, printProfileSave);
  const printProfileStatus = document.createElement("div");
  printProfileStatus.className = "mesh-status";
  printProfileStatus.textContent = "Print Profile未読込";
  printProfileStatus.setAttribute("aria-live", "polite");
  const printProfileMetrics = document.createElement("div");
  printProfileMetrics.className = "print-metrics";
  printProfileMetrics.hidden = true;

  const bambuExportRow = document.createElement("div");
  bambuExportRow.className = "row bambu-3mf-actions";
  const bambuSupportType = document.createElement("select");
  bambuSupportType.setAttribute("aria-label", "Bambu Studioのサポート方式");
  for (const [value, label] of [
    ["normal(manual)", "Katachi一体融合支柱（自動Support OFF）"],
  ] as Array<[BambuSupportType, string]>) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    bambuSupportType.appendChild(option);
  }
  const bambuExportBtn = document.createElement("button");
  bambuExportBtn.type = "button";
  bambuExportBtn.className = "primary-action";
  bambuExportBtn.textContent = "v088候補一式を保存";
  bambuExportBtn.onclick = () => callbacks.onBambu3mfExport(
    readMeshOptions(),
    bambuSupportType.value as BambuSupportType,
  );
  bambuExportRow.append(bambuSupportType, bambuExportBtn);
  const bambuExportStatus = document.createElement("div");
  bambuExportStatus.className = "mesh-status bambu-3mf-status";
  bambuExportStatus.textContent = "先に「最終精度で診断」を実行してください";
  bambuExportStatus.setAttribute("aria-live", "polite");
  const bambuExportLimit = document.createElement("div");
  bambuExportLimit.className = "hint";
  bambuExportLimit.textContent =
    "outside scaffoldはbuild plateからの-Z routeがclearなものだけです。insideはDry Web補強だけに使い、outsideをDry Webへ混ぜません。printApproval=falseの研究候補です。Previewで自動Supportが0 g、支柱が外側へ分布し、floating regions警告と0.2/0.4/0.6 mm層の開始島が消えることを確認するまでは印刷しないでください。";
  bambuExportPanel.append(bambuExportTitle, bambuExportHint, printProfileActions, printProfileStatus, printProfileMetrics, bambuExportRow, bambuExportStatus, bambuExportLimit);
  meshPanel.appendChild(bambuExportPanel);
  root.appendChild(meshPanel);

  const openingPanel = document.createElement("section");
  openingPanel.className = "mesh-export opening-map";
  const openingTitle = document.createElement("div");
  openingTitle.className = "mesh-export-title";
  openingTitle.textContent = "空隙マップ（詳細）";
  openingPanel.appendChild(openingTitle);
  const denseSampleCard = document.createElement("div");
  denseSampleCard.className = "dense-sample-card";
  const denseSampleTitle = document.createElement("strong");
  denseSampleTitle.textContent = "参考：高密度花モデル v6（保存済み・閲覧専用）";
  const denseSampleText = document.createElement("div");
  denseSampleText.className = "hint";
  denseSampleText.textContent = "現在の作業モデルではありません。Goldbergではなく、花の輪郭・大小の混在・レース状の隙間が残った参照形状です。元recipeがないため閲覧専用です。";
  const denseSampleOpen = document.createElement("button");
  denseSampleOpen.type = "button";
  denseSampleOpen.textContent = "保存済み参考モデルv6を開く";
  denseSampleOpen.onclick = () => callbacks.onOpenDenseFlowerSample();
  const denseSampleViews = document.createElement("div");
  denseSampleViews.className = "mode-toggle dense-sample-views";
  denseSampleViews.hidden = true;
  const denseSampleViewButtons = {} as Record<DenseSampleView, HTMLButtonElement>;
  for (const [view, label] of [["3d", "3Dで見る"], ["sixViews", "6方向一覧"]] as Array<[DenseSampleView, string]>) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => callbacks.onDenseFlowerSampleView(view);
    denseSampleViewButtons[view] = button;
    denseSampleViews.appendChild(button);
  }
  denseSampleCard.append(denseSampleTitle, denseSampleText, denseSampleOpen, denseSampleViews);
  const openingHint = document.createElement("div");
  openingHint.className = "hint";
  openingHint.textContent = "現在の作業モデルを対象に、有限解像度の計測面で覆われない領域を推定します。自動では、花や立体リングの高さに合わせて形状の胴を通る計測面を選びます。色は番号の識別のみです。";
  openingPanel.appendChild(openingHint);
  const openingAutoOffset = document.createElement("input"); openingAutoOffset.type = "checkbox"; openingAutoOffset.checked = true; openingAutoOffset.setAttribute("aria-label", "形状の高さへ自動調整");
  const openingOffset = document.createElement("input"); openingOffset.type = "number"; openingOffset.min = "-20"; openingOffset.max = "20"; openingOffset.step = "0.1"; openingOffset.value = "0.0"; openingOffset.disabled = true; openingOffset.setAttribute("aria-label", "手動オフセット mm");
  const openingMinArea = document.createElement("input"); openingMinArea.type = "number"; openingMinArea.min = "0"; openingMinArea.max = "10000"; openingMinArea.step = "0.1"; openingMinArea.value = "0.5";
  const openingResolution = document.createElement("input"); openingResolution.type = "range"; openingResolution.min = "24"; openingResolution.max = "64"; openingResolution.step = "8"; openingResolution.value = "48";
  const openingResolutionOut = document.createElement("span"); openingResolutionOut.className = "value-out"; openingResolutionOut.textContent = openingResolution.value;
  const makeOpeningRow = (label: string, input: HTMLInputElement, output?: HTMLElement) => { const row = document.createElement("div"); row.className = "row mesh-row"; const l = document.createElement("label"); l.textContent = label; row.append(l, input); if (output) row.append(output); openingPanel.appendChild(row); };
  makeOpeningRow("形状の高さへ自動調整", openingAutoOffset);
  makeOpeningRow("手動オフセット mm", openingOffset);
  makeOpeningRow("最小面積 mm²", openingMinArea);
  makeOpeningRow("計測解像度", openingResolution, openingResolutionOut);
  const openingConditionChanged = () => callbacks.onOpeningMapConditionsChange();
  openingAutoOffset.onchange = () => { openingOffset.disabled = openingAutoOffset.checked; openingConditionChanged(); };
  openingOffset.oninput = openingConditionChanged; openingMinArea.oninput = openingConditionChanged;
  openingResolution.oninput = () => { openingResolutionOut.textContent = openingResolution.value; openingConditionChanged(); };
  const openingButtons = document.createElement("div"); openingButtons.className = "row";
  const measureOpeningsBtn = document.createElement("button"); measureOpeningsBtn.className = "primary-action"; measureOpeningsBtn.textContent = "今の作業モデルの空隙番号を表示";
  measureOpeningsBtn.onclick = () => callbacks.onMeasureOpenings({ ...readMeshOptions(), resolution: Number(openingResolution.value), automaticOffset: openingAutoOffset.checked, offsetMm: Number(openingOffset.value), minAreaMm2: Number(openingMinArea.value) });
  const cancelOpeningsBtn = document.createElement("button"); cancelOpeningsBtn.textContent = "キャンセル"; cancelOpeningsBtn.disabled = true; cancelOpeningsBtn.onclick = () => callbacks.onCancelOpeningMap();
  const clearOpeningsBtn = document.createElement("button"); clearOpeningsBtn.textContent = "表示を消す"; clearOpeningsBtn.onclick = () => callbacks.onClearOpeningMap();
  openingButtons.append(measureOpeningsBtn, cancelOpeningsBtn, clearOpeningsBtn); openingPanel.appendChild(openingButtons);
  const openingDisplayRow = document.createElement("div"); openingDisplayRow.className = "row";
  const openingDisplayLabel = document.createElement("label"); openingDisplayLabel.textContent = "表示数";
  const openingDisplay = document.createElement("select");
  for (const [value, text] of [["10", "10"], ["20", "20"], ["40", "40"], ["all", "すべて"]]) { const option = document.createElement("option"); option.value = value; option.textContent = text; openingDisplay.appendChild(option); }
  openingDisplay.value = "20";
  openingDisplay.onchange = () => callbacks.onOpeningMapDisplayCountChange(openingDisplay.value === "all" ? "all" : Number(openingDisplay.value));
  openingDisplayRow.append(openingDisplayLabel, openingDisplay); openingPanel.appendChild(openingDisplayRow);
  const openingStatus = document.createElement("div"); openingStatus.className = "mesh-status"; openingStatus.textContent = "未計測"; openingPanel.appendChild(openingStatus);
  const openingSummary = document.createElement("div"); openingSummary.className = "opening-summary"; openingPanel.appendChild(openingSummary);
  const openingList = document.createElement("div"); openingList.className = "opening-list"; openingPanel.appendChild(openingList);
  openingPanel.appendChild(denseSampleCard);
  frozenExperiments.appendChild(openingPanel);

  const internalGatePanel = document.createElement("section");
  internalGatePanel.className = "mesh-export internal-print-gate";
  const internalGateTitle = document.createElement("div");
  internalGateTitle.className = "mesh-export-title";
  internalGateTitle.textContent = "内部構造の印刷ゲート";
  const internalGateProfile = document.createElement("strong");
  internalGateProfile.textContent = "A1 mini · 0.4 mmノズル · PLA · 0.2 mm積層";
  const internalGateHint = document.createElement("div");
  internalGateHint.className = "hint";
  internalGateHint.textContent =
    "外側SKINのオーバーハングはBambu Studioへ任せます。ここではInternal自身の水密・融合起点・積層順・線径・bridgeだけを最終meshで判定し、OKになるまで通常の3D書き出しを止めます。";
  const internalGateLimits = document.createElement("div");
  internalGateLimits.className = "hint";
  internalGateLimits.textContent =
    "Katachi保守値: 最低線径0.80 mm / bridge上限5.0 mm / 垂直から45°以内 / 線径2.5 voxel以上。メーカー保証値ではありません。";
  const internalGateButton = document.createElement("button");
  internalGateButton.type = "button";
  internalGateButton.className = "primary-action";
  internalGateButton.textContent = "A1 mini条件で内部を最終判定";
  internalGateButton.onclick = () => callbacks.onInternalPrintGate(readMeshOptions());
  const internalGateStatus = document.createElement("div");
  internalGateStatus.className = "mesh-status";
  internalGateStatus.textContent = "未判定 · Internal付き3Dデータは書き出せません";
  internalGateStatus.dataset.ok = "false";
  internalGateStatus.setAttribute("aria-live", "polite");
  const internalGateMetrics = document.createElement("div");
  internalGateMetrics.className = "print-metrics";
  internalGateMetrics.hidden = true;
  internalGatePanel.append(
    internalGateTitle, internalGateProfile, internalGateHint, internalGateLimits,
    internalGateButton, internalGateStatus, internalGateMetrics,
  );
  root.appendChild(internalGatePanel);

  const printPanel = document.createElement("section");
  printPanel.className = "mesh-export print-preparation";
  const printTitle = document.createElement("div");
  printTitle.className = "mesh-export-title";
  printTitle.textContent = "PRINT SUPPORT / 10 Print validation / print runs";
  printPanel.appendChild(printTitle);

  const printHint = document.createElement("div");
  printHint.className = "hint";
  printHint.textContent =
    "Internal付きでは最終ゲートが作った同一STLを再利用し、Optimizerの概算診断へ渡します。STLを保存して別画面へ移る必要はありません。数値は形状からの推定で、実機の成功を保証しません。";
  printPanel.appendChild(printHint);
  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    const localOnlyHint = document.createElement("div");
    localOnlyHint.className = "hint";
    localOnlyHint.append("公開版は形状確認用です。Optimizer診断はKatachiを起動し、");
    const localLink = document.createElement("a");
    localLink.href = "http://localhost:5174/skin.html";
    localLink.textContent = "ローカル版を開く";
    localLink.target = "_blank";
    localLink.rel = "noopener";
    localOnlyHint.append(localLink, " から実行します。");
    printPanel.appendChild(localOnlyHint);
  }

  const printCheckBtn = document.createElement("button");
  printCheckBtn.type = "button";
  printCheckBtn.className = "primary-action";
  printCheckBtn.textContent = "今の形を印刷確認";
  printCheckBtn.onclick = () => callbacks.onPrintCheck(readMeshOptions());
  printPanel.appendChild(printCheckBtn);

  const printStatus = document.createElement("div");
  printStatus.className = "mesh-status";
  printStatus.textContent = "未確認";
  printStatus.setAttribute("aria-live", "polite");
  printPanel.appendChild(printStatus);

  const printMetrics = document.createElement("div");
  printMetrics.className = "print-metrics";
  printMetrics.hidden = true;
  printPanel.appendChild(printMetrics);
  root.appendChild(printPanel);

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
  root.appendChild(frozenExperiments);

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
    displayToolsRoot,
    historyIoRoot: historyIo,
    setElementRegistry: (rows, selectedId) => { registryRows = rows; registrySelected = selectedId; renderRegistry(); },
    setElementEditStatus: (text, ok) => { editorStatus.textContent = text; editorStatus.classList.toggle("warn", ok === false); },
    getElementMoveStep: () => bounded(moveStep, 0.05),
    setSelectedMotif,
    setMotifReshapeStatus: (text, ok) => {
      selectedMotifStatus.textContent = text;
      selectedMotifStatus.classList.toggle("warn", ok === false);
    },
    setHistoryCount: (n) => {
      historyCount.textContent = `操作履歴: ${n} 件`;
      const undoable = Math.max(0, n - 1);
      shapeUndoableCount = undoable;
      undoCount.textContent = `戻せる操作 ${undoable}`;
      if (!shapeUndoLocked) undoStatus.textContent = "";
      syncShapeUndoLock();
    },
    setUndoHistory: (labels) => {
      undoHistorySelect.replaceChildren();
      const recent = labels.slice(-10).reverse();
      recent.forEach((label, index) => {
        const option = document.createElement("option");
        option.value = String(index + 1);
        option.textContent = `${index + 1}つ前 · ${label}`;
        undoHistorySelect.appendChild(option);
      });
      const hasHistory = recent.length > 0;
      shapeUndoHistoryAvailable = hasHistory;
      syncShapeUndoLock();
    },
    setUndoStatus: (text) => { undoStatus.textContent = text; },
    setShapeUndoLocked: (locked) => { shapeUndoLocked = locked; syncShapeUndoLock(); },
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
      const lace = result as PackPatchesResult & {
        laceAdded?: number;
        lacePasses?: number;
        laceSmallestRadius?: number | null;
        laceLargestRadius?: number | null;
      };
      if (lace.laceAdded !== undefined) {
        const sizes = lace.laceSmallestRadius !== null && lace.laceLargestRadius !== null
          ? ` / 大きさ ${lace.laceSmallestRadius?.toFixed(3)}–${lace.laceLargestRadius?.toFixed(3)}`
          : "";
        packResult.textContent = `レース充填 ${lace.lacePasses}段 / ${lace.laceAdded}個追加${sizes} / 隙間 ${skinParams.laceGap.toFixed(3)}`;
        packResult.classList.toggle("pack-saturated", lace.laceAdded === 0);
        return;
      }
      // 飽和の無言は禁止（作者報告 2026-07-13:「試行数を増やしても密度が変わらない」）。
      // 試行数は飽和を破れない — 破れるのは下限サイズと目地。なので処方箋まで言う。
      const saturated = result.stoppedEarly || result.placed === 0;
      const flowerConnection = result.flowerConnections > 0
        ? ` / 花の接続 ${result.flowerConnections}本（接続点 ${result.flowerBridgePoints}個）`
        : "";
      const flowerFusion = result.flowerFusedPatches > 0
        ? result.flowerFusionLocalized
          ? ` / 局所融合 ${result.flowerFusedPatches}花（調整球 ${result.flowerFusionAdjustedPoints}個 / ` +
            `最大 ${result.flowerFusionRadius.toFixed(3)} / 未接続辺 ${result.flowerFusionOpenEdges}/${result.flowerFusionEdgeCount}）`
          : ` / 一体化 ${result.flowerFusedPatches}花（共通の融合幅 ${result.flowerFusionRadius.toFixed(3)}）`
        : "";
      const shapeLabel = result.quadConnectionShape
        ? SHAPE_LABELS.find(([shape]) => shape === result.quadConnectionShape)?.[1] ?? result.quadConnectionShape
        : "";
      const quadConnection = result.quadConnectionLocalized
        ? ` / 局所接続 ${shapeLabel}（接続球 ${result.quadConnectionAdjustedPoints}個 / ` +
          `最大 ${result.quadConnectionMaxRadius.toFixed(3)} / 未接続辺 ${result.quadConnectionOpenEdges}/${result.quadConnectionEdgeCount}）`
        : "";
      const connectionSummary = quadConnection || flowerFusion;
      packResult.textContent = saturated
        ? `詰めた: ${result.placed} 個追加（表面が飽和 — このパッチ下限サイズと目地ではもう入りません。` +
          `密度を上げるには「パッチの大きさ 下限」か「目地」を小さくしてください。試行数を増やしても飽和は破れません）`
        : `詰めた: ${result.placed} 個追加 / 棄却 ${result.triedAndRejected} 回${connectionSummary}${flowerConnection}`;
      packResult.classList.toggle("pack-saturated", saturated);
    },
    setContactStatus: (text, ok) => {
      contactStatus.textContent = text;
      contactStatus.classList.toggle("ok", ok === true);
      contactStatus.classList.toggle("warn", ok === false);
    },
    syncHostParams: (p) => {
      for (const { spec, set } of hostSliders) set(Number(p[spec.key]));
      seedInput.value = p.seed;
    },
    syncSkinParams: (p) => {
      for (const { spec, set } of skinSliders) set(Number(p[spec.key]));
      for (const { spec, set } of ringSliders) set(Number(p[spec.key]));
      internalDensitySlider.set(p.internalDensity);
      targetedCountSlider.set(p.internalDensity);
      internalRadiusSlider.set(p.internalRadius);
      internalRandomnessSlider.set(p.internalRandomness);
      renderInternalStructure(p.internalStructure);
      skinSeedInput.value = p.seed;
      renderShapeButtons(p.patchShape);
      renderMotifPlacement(p.motifPlacement ?? "surface");
      renderShapeSpecificControls(p.patchShape);
      renderSurfaceGenerationMode(p.surfaceGenerationMode);
      quadDivisionsSlider.set(p.quadDivisions);
      renderQuadTilingMode(p.quadTilingMode);
      quadVariationSlider.set(p.quadSizeVariation);
      quadCurvatureSlider.set(p.quadCurvatureAttraction);
      renderQuadConnectionMode(p.quadConnectionMode);
      quadConnectionDepthSlider.set(p.quadConnectionDepth);
      quadMeshJoinSlider.set(p.quadMeshJoinWidth);
      voronoiSeedSlider.set(p.voronoiSeedCount);
      voronoiRelaxationSlider.set(p.voronoiRelaxationSteps);
      goldbergFrequencySlider.set(p.goldbergFrequency);
      lacePassesSlider.set(p.lacePasses);
      renderLaceMotifPlacement(p.laceMotifPlacement ?? "surface");
      laceMinScaleSlider.set(p.laceMinScale);
      laceGapSlider.set(p.laceGap);
      contactTargetSlider.set(p.contactTarget);
      contactMaxGrowthSlider.set(p.contactMaxGrowth);
      contactWholeScaleSlider.set(p.contactWholeScaleMax);
      contactOverlapSlider.set(p.contactOverlap);
      renderContactReinforcementMode(p.contactReinforcementMode ?? "localPoints");
      packBtn.textContent = "この設定で表面を生成";
      renderFlowerMotifPreset(p.flowerMotifPreset);
      renderFlowerParameterControls(p);
      renderFlowerConnectionMode(p.flowerConnectionMode);
      coinBulgeValue = p.coinBulge;
      coinBulgeBalanceValue = p.coinBulgeBalance;
      renderCoinBulgeState();
      updateMotifPreview(p);
    },
    updateMotifPreview,
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
    setViewMode: (mode, totalPatchPoints, coinBulge) => renderViewMode(mode, totalPatchPoints, coinBulge),
    setDisplayStyle: (style) => renderDisplayStyle(style),
    setInternalObservationMode: (mode) => renderInternalObservation(mode),
    setViewportClippingState: (available, bounds, clippingState) => {
      clippingHud.classList.toggle("is-unavailable", !available);
      clippingAllOff.disabled = !available;
      clippingResetAll.disabled = !available;
      for (const axis of VIEWPORT_CLIP_AXES) {
        const controls = clippingRows.get(axis)!;
        const range = bounds?.[axis] ?? { min: 0, max: 0 };
        const span = Math.max(0, range.max - range.min);
        controls.enabled.disabled = !available;
        controls.enabled.checked = available && clippingState[axis].enabled;
        controls.slider.disabled = !available;
        controls.slider.min = String(range.min);
        controls.slider.max = String(range.max);
        controls.slider.step = String(Math.max(0.01, span / 500));
        controls.slider.value = String(Math.min(range.max, Math.max(range.min, clippingState[axis].position)));
        controls.direction.disabled = !available;
        controls.direction.textContent = clippingState[axis].direction === 1 ? ">=" : "<=";
        controls.direction.title = clippingState[axis].direction === 1
          ? axis.toUpperCase() + ": keep greater side"
          : axis.toUpperCase() + ": keep lesser side";
        controls.value.textContent = available ? clippingState[axis].position.toFixed(1) + " mm" : "--";
        controls.reset.disabled = !available;
        controls.row.classList.toggle("is-enabled", available && clippingState[axis].enabled);
      }
    },
    setSurfaceAngleDiagnosisRunning: (running) => {
      surfaceAngleRun.disabled = running;
      surfaceAngleRun.textContent = running ? "最終精度で診断中…" : "最終精度で診断";
    },
    setSurfaceAngleDiagnosisStatus: (text, ok) => {
      surfaceAngleStatus.textContent = text;
      surfaceAngleStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setSurfaceStartupStatus: (text, ok) => {
      surfaceStartupStatus.textContent = text;
      surfaceStartupStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setSurfaceAngleDiagnosisView: (view, available, hasInternal) => {
      for (const [candidate, button] of surfaceAngleViewButtons) {
        button.disabled = !available || (candidate === "after" && !hasInternal);
        button.classList.toggle("mode-active", available && candidate === view);
      }
    },
    setOverhangSupportSiteOverlay: (available, show, showMixed, showFootprint, depthMode, text, ok) => {
      supportSiteCheckbox.disabled = !available;
      supportSiteCheckbox.checked = show;
      for (const [mode, button] of supportDepthButtons) {
        button.disabled = !available || !show;
        button.classList.toggle("mode-active", mode === depthMode);
      }
      mixedFaceCheckbox.disabled = !available;
      mixedFaceCheckbox.checked = showMixed;
      footprintCheckbox.disabled = !available;
      footprintCheckbox.checked = showFootprint;
      supportSiteStatus.textContent = text;
      supportSiteStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setOverhangSupportSiteSelection: (text, classification) => {
      supportSiteSelectionStatus.textContent = text;
      supportSiteSelectionStatus.dataset.classification = classification ?? "none";
    },
    setSupportPaintState: (state) => {
      supportPaintEnableCheckbox.disabled = !state.available;
      supportPaintEnableCheckbox.checked = state.enabled;
      for (const [mode, button] of supportPaintModeButtons) {
        button.disabled = !state.available || !state.enabled;
        button.classList.toggle("mode-active", mode === state.mode);
      }
      supportPaintRadiusInput.disabled = !state.available || !state.enabled;
      supportPaintRadius.set(state.radiusMm);
      supportPaintRadiusValue.textContent = "半径 " + state.radiusMm.toFixed(1) + " mm / 直径 " + (state.radiusMm * 2).toFixed(1) + " mm";
      supportPaintBackfacesCheckbox.disabled = !state.available || !state.enabled;
      supportPaintBackfacesCheckbox.checked = state.paintBackfaces;
      supportPaintUndo.disabled = !state.canUndo;
      supportPaintRedo.disabled = !state.canRedo;
      supportPaintReset.disabled = state.sampleCount === 0;
      supportPaintDraftSave.disabled = !state.canSaveDraft;
      supportPaintDraftLoad.disabled = !state.available;
      supportPaintDraftStatus.textContent = state.draftStatus;
      supportPaintResolutionStatus.textContent = "編集 preview Surface " + (state.editingResolution ?? "--") + " / 印刷 Surface " + state.printResolution + "（未生成）";
      supportPaintReprojectionButton.disabled = !state.canVerifyReprojection;
      supportPaintReprojectionStatus.textContent = state.reprojectionStatus;
      supportPaintStatus.textContent = `${state.status} · ${supportPaintOperationLabel(state.operationCount, state.sampleCount)} · 塗布site ${state.paintedSiteCount} · 自動から変更 ${state.manualOverrideSiteCount}`;
    },
    setMotifLowestPointStatus: (text, ok) => {
      motifLowestStatus.textContent = text;
      motifLowestStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    getSurfaceAngleThreshold: () => surfaceAngleThreshold,
    setSurfaceAngleThreshold: (value) => { surfaceAngleThreshold = value; surfaceAngleThresholdSlider.set(value); },
    setMeshPreviewStatus: (text, running = false) => {
      meshPreviewStatus.textContent = text;
      viewDock.classList.toggle("is-building", running);
      viewportTaskText.textContent = text;
      viewportTaskStatus.hidden = !running;
    },
    setAutoSwitchNotice: (active) => {
      autoSwitchNotice.style.display = active ? "block" : "none";
    },
    setPatchShape: (shape) => {
      renderShapeButtons(shape);
      renderShapeSpecificControls(shape);
      updateMotifPreview({ ...motifPreviewParams, patchShape: shape });
    },
    setMotifPlacement: (placement) => renderMotifPlacement(placement),
    setLaceMotifPlacement: (placement) => renderLaceMotifPlacement(placement),
    setSurfaceGenerationMode: (generationMode) => {
      renderSurfaceGenerationMode(generationMode);
      packBtn.textContent = "この設定で表面を生成";
    },
    setInternalStructure: (internalMode) => renderInternalStructure(internalMode),
    setInternalStructureStatus: (text, ok) => {
      internalStatus.textContent = text;
      internalStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setQuadFlowStatus: (text, ok) => {
      quadFlowStatus.textContent = text;
      quadFlowStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setVoronoiStatus: (text, ok) => {
      voronoiStatus.textContent = text;
      voronoiStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setGoldbergStatus: (text, ok) => {
      goldbergStatus.textContent = text;
      goldbergStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setMeshStatus: (text, ok) => {
      meshStatus.textContent = text;
      meshStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setMeshExportRunning: (running) => {
      meshExportRunning = running;
      syncMeshExportButtons();
    },
    setBambu3mfExportRunning: (running) => {
      bambuExportBtn.disabled = running;
      bambuSupportType.disabled = running;
    bambuExportBtn.textContent = running ? "v088候補一式を作成中…" : "v088候補一式を保存";
    },
    setBambu3mfExportStatus: (text, ok) => {
      bambuExportStatus.textContent = text;
      bambuExportStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setPrintProfileSummary: (summary) => {
      printProfileMetrics.replaceChildren();
      printProfileMetrics.hidden = summary === null;
      if (!summary) {
        printProfileStatus.textContent = "Print Profile未読込";
        printProfileStatus.dataset.ok = "unknown";
        return;
      }
      printProfileStatus.textContent = `${summary.profileName} · ${summary.status}`;
      printProfileStatus.dataset.ok = String(summary.matches);
      const rows: Array<[string, string]> = [["Profile SHA-256", summary.profileSha256], ...summary.values];
      for (const [label, value] of rows) {
        const row = document.createElement("div"); row.className = "print-metric";
        const name = document.createElement("span"); name.textContent = label;
        const result = document.createElement("strong"); result.textContent = value;
        row.append(name, result); printProfileMetrics.appendChild(row);
      }
    },
    setMeshOptions: (options) => {
      resolutionInput.value = String(options.resolution);
      resolutionOut.textContent = String(options.resolution);
      quickResolutionInput.value = String(options.resolution);
      sizeInput.value = String(options.targetLongestMm);
    },
    setInternalPrintGateExportAllowed: (allowed, required) => {
      internalPrintGateExportAllowed = allowed;
      internalPrintGateRequired = required;
      syncMeshExportButtons();
    },
    setOpeningMapRunning: (running) => {
      measureOpeningsBtn.disabled = running;
      cancelOpeningsBtn.disabled = !running;
    },
    setOpeningMapStatus: (text, ok) => {
      openingStatus.textContent = text;
      openingStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setOpeningMapResults: (openings, displayed, likelyMergedByOffset = false) => {
      openingList.replaceChildren();
      if (!openings) { openingSummary.textContent = ""; return; }
      openingSummary.textContent = likelyMergedByOffset
        ? `この1件は穴ではなく、オフセットで一続きになった未被覆面の可能性が高いです。0 mmで再計測してください。`
        : `${openings.length}件を受理 / 表示 ${Math.min(displayed, openings.length)}件。面積・周長は有限解像度の導出面による推定です。`;
      for (const opening of openings) {
        const row = document.createElement("div"); row.className = "opening-row";
        const swatch = document.createElement("i"); swatch.className = "opening-swatch"; swatch.style.background = opening.color;
        const id = document.createElement("strong"); id.textContent = opening.id;
        const metrics = document.createElement("span"); metrics.textContent = `面積 ${opening.areaMm2.toFixed(1)} mm² / 周長 ${opening.perimeterMm.toFixed(1)} mm / 形状 ${opening.shapeIndex.toFixed(2)}`;
        row.append(swatch, id, metrics); openingList.appendChild(row);
      }
    },
    setDenseFlowerSampleRunning: (running) => {
      denseSampleOpen.disabled = running;
      denseSampleOpen.textContent = running ? "保存済み参考モデルv6を読み込み中…" : "保存済み参考モデルv6を開く";
    },
    setDenseFlowerSampleActive: (active, view = "3d") => {
      denseSampleViews.hidden = !active;
      denseSampleOpen.textContent = active ? "保存済み参考モデルv6を読み直す" : "保存済み参考モデルv6を開く";
      for (const [candidate, button] of Object.entries(denseSampleViewButtons) as Array<[DenseSampleView, HTMLButtonElement]>) {
        button.classList.toggle("mode-active", active && candidate === view);
      }
    },
    setDenseFlowerSampleResults: (openings, total) => {
      openingList.replaceChildren();
      openingSummary.textContent = `${total}件の計測空隙 / 上位${openings.length}件を色・番号表示。タグはドラッグできます。`;
      for (const opening of openings) {
        const row = document.createElement("div"); row.className = "opening-row";
        const swatch = document.createElement("i"); swatch.className = "opening-swatch"; swatch.style.background = opening.color;
        const id = document.createElement("strong"); id.textContent = opening.id;
        const metrics = document.createElement("span"); metrics.textContent = `面積 ${opening.areaMm2.toFixed(1)} mm² / 周長 ${opening.perimeterMm.toFixed(1)} mm / 形状 ${opening.shapeIndex.toFixed(2)}`;
        row.append(swatch, id, metrics); openingList.appendChild(row);
      }
    },
    clearOpeningMap: () => { openingList.replaceChildren(); openingSummary.textContent = ""; },
    setPrintCheckRunning: (running) => {
      printCheckBtn.disabled = running;
      printCheckBtn.textContent = running ? "印刷確認中…" : "今の形を印刷確認";
    },
    setPrintCheckStatus: (text, ok) => {
      printStatus.textContent = text;
      printStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setPrintCheckMetrics: (metrics) => {
      printMetrics.replaceChildren();
      printMetrics.hidden = metrics === null;
      if (!metrics) return;
      const rows: Array<[string, string]> = [
        ["閉じた形", metrics.topology],
        ["大きさ", metrics.size],
        ["薄い部分の目安", metrics.wall],
        ["内側サポート候補", metrics.internalSupport],
        ["向きの候補", metrics.bestOrientation],
      ];
      for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.className = "print-metric";
        const name = document.createElement("span");
        name.textContent = label;
        const result = document.createElement("strong");
        result.textContent = value;
        row.append(name, result);
        printMetrics.appendChild(row);
      }
    },
    setInternalPrintGateRunning: (running) => {
      internalGateButton.disabled = running;
      internalGateButton.textContent = running ? "内部構造を最終判定中…" : "A1 mini条件で内部を最終判定";
    },
    setInternalPrintGateStatus: (text, ok) => {
      internalGateStatus.textContent = text;
      internalGateStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setInternalPrintGateReport: (report) => {
      internalGateMetrics.replaceChildren();
      internalGateMetrics.hidden = report === null;
      if (!report) return;
      const rows: Array<[string, string]> = [
        ["最終mesh", `${report.watertight ? "水密" : "非水密"} · ${report.meshComponents}部品 · 退化${report.removedDegenerateTriangles}面`],
        ["実寸線径", `${report.minDiameterMm.toFixed(2)} mm · ${report.voxelsAcrossDiameter.toFixed(1)} voxel`],
        ["外殻との起点", `${report.surfaceAnchorNodes} node · 浮遊連結群${report.floatingGraphComponents}`],
        ["積層順", `未支持 node ${report.unsupportedNodes} / edge ${report.unsupportedEdges}`],
        ["内部bridge", `${report.bridgeEdges}本 · 上限超過${report.overlongBridges} · 最長${report.maxObservedBridgeMm.toFixed(1)} mm`],
      ];
      for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.className = "print-metric";
        const name = document.createElement("span");
        name.textContent = label;
        const result = document.createElement("strong");
        result.textContent = value;
        row.append(name, result);
        internalGateMetrics.appendChild(row);
      }
      if (report.reasons.length > 0) {
        const failures = document.createElement("div");
        failures.className = "mesh-status";
        failures.dataset.ok = "false";
        failures.textContent = report.reasons.map((reason) => `・${reason}`).join("\n");
        internalGateMetrics.appendChild(failures);
      }
    },
    setNPartitionProposal: (text, groupCount = 0) => {
      nProposal.textContent = text;
      nLegend.replaceChildren();
      nLegend.hidden = groupCount === 0;
      for (let index = 0; index < groupCount; index++) {
        const item = document.createElement("span");
        item.className = "n-partition-legend-item";
        const swatch = document.createElement("i");
        swatch.className = `n-partition-swatch n-partition-swatch-${index + 1}`;
        const label = document.createElement("strong");
        label.textContent = `部品${index + 1}`;
        item.append(swatch, label);
        nLegend.appendChild(item);
      }
    },
    setNPartitionStatus: (text, ok) => {
      nStatus.textContent = text;
      nStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setNPartitionMetrics: (text) => {
      nMetrics.textContent = text;
    },
    setNPartitionBuildRunning: (running) => {
      nProposeBtn.disabled = running;
      nBuildBtn.disabled = running;
      nCancelBtn.disabled = !running;
      nBuildBtn.textContent = running ? "生成中…" : "このN分割を生成";
    },
    setNPartitionExportEnabled: (enabled) => {
      nExportBtn.disabled = !enabled;
    },
    getNPartitionCount: () => Number(nCountSelect.value),
    getMeshOptions: () => readMeshOptions(),
    setSeedPickModeActive: (active) => {
      seedModeActive = active;
      renderSeedModeButton();
    },
    setPartitionDraftInfo: (text) => {
      partitionDraftInfo.textContent = text;
    },
    setPartitionSelectedPatch: (info) => {
      partitionSelectionText.textContent = describePartitionSelectionLabel(info);
      partitionSelectionSwatch.hidden = info === null;
      partitionSelectionSwatch.className = `partition-swatch partition-swatch-${(info?.group ?? "none").toLowerCase()}`;
      assignABtn.disabled = info === null;
      assignBBtn.disabled = info === null;
    },
    setPartitionActionEmphasis: (active) => {
      // T14 §2.3 / T15 P1: once a patch is selected WHILE actually doing
      // A/B work, the A/B decision is "the current primary action" -- give
      // the whole row a static, non-animated emphasis. Deliberately NOT
      // driven by selection alone (see setPartitionSelectedPatch) -- a
      // plain patch pick during ordinary Pack/delete/mesh work must not
      // make A/B assignment look like the primary action.
      overrideRow.classList.toggle("action-emphasis", active);
    },
    setPartitionStatus: (text, ok) => {
      partitionStatus.textContent = text;
      partitionStatus.dataset.ok = ok === undefined ? "unknown" : String(ok);
    },
    setPartitionMetrics: (text) => {
      partitionMetrics.textContent = text;
    },
    setPartitionExportEnabled: (enabled) => {
      exportABtn.disabled = !enabled;
      exportBBtn.disabled = !enabled;
      exportBothBtn.disabled = !enabled;
    },
    setPartitionVerificationExportEnabled: (enabled) => {
      verifyExportABtn.disabled = !enabled;
      verifyExportBBtn.disabled = !enabled;
      verifyExportBothBtn.disabled = !enabled;
    },
    setPartitionBuildRunning: (running) => {
      buildPartitionBtn.disabled = running;
      cancelPartitionBtn.disabled = !running;
    },
    setPartitionTutorial: ({ open, step, actualStep, isViewingPast, canPrev, canAdvance, advanceMode }) => {
      tutorialStartBtn.hidden = open;
      tutorialCard.hidden = !open;
      if (!open) {
        // Clear all highlights when the guide is closed so free A/B use is unchanged.
        for (const el of partitionPanel.querySelectorAll(".tutorial-highlight")) {
          el.classList.remove("tutorial-highlight");
        }
        for (const el of root.querySelectorAll(".tutorial-highlight")) {
          el.classList.remove("tutorial-highlight");
        }
        for (const el of document.querySelectorAll(".tutorial-highlight")) {
          el.classList.remove("tutorial-highlight");
        }
        return;
      }
      const content = getTutorialStepContent(step);
      tutorialStepLabel.textContent = `Step ${step} / ${TUTORIAL_TOTAL_STEPS}`;
      tutorialHeading.textContent = content.title;
      tutorialShort.textContent = content.short;
      tutorialBody.replaceChildren();
      for (const line of content.body) {
        const li = document.createElement("li");
        li.textContent = line;
        tutorialBody.appendChild(li);
      }
      // Re-collapse on every step change -- an author who left a PREVIOUS
      // step's details open shouldn't have it silently stay open showing
      // this step's (unrelated) detail text without them choosing to open it.
      tutorialDetails.open = false;
      tutorialViewingPastNote.hidden = !isViewingPast;
      tutorialViewingPastNote.textContent = isViewingPast
        ? `表示中 Step ${step} / 現在の工程 Step ${actualStep}（読んでいるだけで、実際の工程は変わりません）`
        : "";
      tutorialReturnBtn.hidden = !isViewingPast;
      tutorialReturnBtn.textContent = `現在の工程へ戻る（Step ${actualStep}）`;

      tutorialPrevBtn.disabled = !canPrev;
      // advanceMode (not content.advance) decides both the button's meaning
      // and its label: while browsing a past step, content.advance may say
      // "confirm" (e.g. reading step 4/5's text again) but this must show
      // "次へ" and only turn the page -- advanceMode already encodes that.
      const showAdvance = advanceMode !== "none" && canAdvance;
      tutorialAdvanceBtn.hidden = !showAdvance;
      tutorialAdvanceBtn.disabled = !showAdvance;
      tutorialAdvanceBtn.textContent = advanceMode === "confirm" ? "確認した" : "次へ";

      // Highlights point at controls for the REAL step; suppress them while
      // reading a past step so nothing is highlighted that isn't actually
      // the next real action.
      const targets = isViewingPast ? new Set<string>() : new Set(content.highlightTargets);
      // History import now lives in the PROJECT bar, outside this Properties
      // root. Search the current document so the existing import-recipe guide
      // target remains highlighted after the node move.
      // Include the detached-root case for unit callers while also covering
      // the history target after it moves into the PROJECT bar.
      const allTargets = new Set<HTMLElement>([
        ...root.querySelectorAll<HTMLElement>("[data-tutorial-target]"),
        ...document.querySelectorAll<HTMLElement>("[data-tutorial-target]"),
      ]);
      for (const el of allTargets) {
        const key = el.dataset.tutorialTarget ?? "";
        el.classList.toggle("tutorial-highlight", targets.has(key));
      }
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

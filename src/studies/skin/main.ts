// ---------------------------------------------------------------------------
// S-skin (T10) — entry point. Wires host field (shared with S1) + skin field
// (this Study's patch packing + mode-dependent composite SDF) + history +
// renderer + UI. See README.md for Question/Setup/Observation/Hypothesis/Next.
//
// Realized patches can be selected and adjusted without repacking: controls,
// arrow keys, and a surface-tangent pointer drag all record the same exact
// editPatch history entry and therefore remain undoable/replayable.
// ---------------------------------------------------------------------------

import "./style.css";
import { eventTargetsViewport, ndcFromPointer } from "../../lib/input.ts";
import { startFrameLoop } from "../../lib/loop.ts";
// R2 昇格 (2026-07-26): このファイルにあった private な sha256Hex を Library へ移した。
// 呼び出し順・保存順・provenance へ入る hash は変えていない。
import { sha256Hex } from "../../lib/hash.ts";
import manifest from "./manifest.json";
import type { NPartitionSelection, PartitionSelection, SkinHistoryEntry } from "./history.ts";
import {
  DEFAULT_SKIN_HOST_PARAMS,
  createEmptyState,
  loadHostFromS1Recipe,
  parseRecipe,
  record,
  replay,
  serializeRecipe,
  undoLastHistoryEntry,
} from "./history.ts";
import {
  DEFAULT_SKIN_PARAMS,
  buildPatchAdjacency,
  buildPatchAdjacencyForPatch,
  connectFlowerPatchesDirectly,
  estimateCoverage,
  estimateMortar,
  estimatePatchComponents,
  freshPatchId,
  fuseFlowerPatchesByExpansion,
  generateShapePoints,
  captureMotifShapeParams,
  packPatchesGreedy,
  projectToSurface,
  proposeGroupsBetweenEndpoints,
  proposeGroupsFromSeeds,
} from "./field.ts";
import type { Patch, PackPatchesResult, PatchAdjacencyEdge } from "./field.ts";
import { estimateRingLinking, findDeepPatchOverlaps } from "./linking.ts";
import {
  buildSkinMesh,
  computeSkinSamplingBounds,
  downloadSkinMeshArtifacts,
  makeSkinExportBaseName,
  reinforceQuadConnectionsForMesh,
} from "./meshExport.ts";
import type { PartitionResult } from "./partition.ts";
import type { PartitionBuildRequest, PartitionWorkerMessage } from "./partitionWorkerProtocol.ts";
import { proposeNGroups } from "./nPartition.ts";
import type { NPartitionResult } from "./nPartition.ts";
import type { NPartitionBuildRequest, NPartitionWorkerMessage } from "./nPartitionWorkerProtocol.ts";
import { encodeBinaryStl } from "../cloud-sculpt/meshExport.ts";
import type { DenseSampleView, SkinDisplayStyle, SkinViewMode } from "./renderer.ts";
import type { InternalObservationMode } from "./previewMeshBuffers.ts";
import { SkinRenderer } from "./renderer.ts";
import { pickPatchBySpheres, raymarchComposite, raymarchHost } from "./picking.ts";
import { HOST_MAX_BALLS, PATCH_MAX_COUNT, PATCH_MAX_POINTS } from "./shaders.ts";
import type { MeshUiOptions, OpeningMapUiOptions } from "./ui.ts";
import { buildUi } from "./ui.ts";
import type { OpeningMapRequest, OpeningMapResult, OpeningMapWorkerMessage } from "./openingMapWorkerProtocol.ts";
import { checkGeneratedStl, formatDirection } from "./printPreparation.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import { buildQuadFlowGrid, packPatchesOnQuadFlow } from "./quadFlow.ts";
import type { QuadFlowGrid, QuadFlowPackResult } from "./quadFlow.ts";
import { packPatchesOnVoronoi } from "./voronoiFlow.ts";
import type { VoronoiPackResult } from "./voronoiFlow.ts";
import { packPatchesOnGoldberg } from "./goldbergFlow.ts";
import type { GoldbergPackResult } from "./goldbergFlow.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import { buildVoronoiInternalStructure } from "./voronoi.ts";
import { buildTargetedGridInternalStructure } from "./targetedGrid.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
import { fillLargestSurfaceGaps } from "./laceFill.ts";
import { analyzePatchContacts, reinforceWeakPatchContacts } from "./contactStrength.ts";
import type { ContactReport } from "./contactStrength.ts";
import { loadDenseFlowerSample } from "./denseFlowerSample.ts";
import { buildDenseFlowerV6Style, DENSE_FLOWER_V6_STYLE_PRESET_ID } from "./denseFlowerPreset.ts";
import { elementDisplayName } from "../../lib/elementLabels.ts";
import { annotationFor, type SurfaceElementReference } from "../../lib/elementAnnotations.ts";
import {
  derivePatchSurfaceFrame,
  editEligibility,
  nudgeFromPointerDrag,
  transformPatch,
  type PatchEditIntent,
  type PatchSurfaceFrame,
  type PointerRay,
} from "./elementTransform.ts";
import { reshapePatchMotif } from "./motifReshape.ts";
import { chooseProgressivePreviewResolutions } from "./previewMeshBuffers.ts";
import type { PreviewMeshRequest, PreviewMeshWorkerMessage } from "./previewMeshWorkerProtocol.ts";
import type { GaugeBuildRequest, GaugeWorkerMessage } from "./gaugeWorkerProtocol.ts";
import type { MeshExportRequest, MeshExportWorkerMessage } from "./meshExportWorkerProtocol.ts";
import type { InternalPrintGateReport } from "./internalPrintGate.ts";
import type { InternalPrintGateRequest, InternalPrintGateWorkerMessage } from "./internalPrintGateWorkerProtocol.ts";
import type {
  SurfaceAngleDiagnosisRequest,
  SurfaceAngleDiagnosisView,
  SurfaceAngleWorkerMessage,
} from "./surfaceAngleWorkerProtocol.ts";
import {
  triangleSoupLongestExtent,
  type BambuSupportType,
} from "./bambu3mf.ts";
import type { Bambu3mfExportRequest, Bambu3mfWorkerMessage } from "./bambu3mfWorkerProtocol.ts";
import { DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS } from "./externalScaffold.ts";
import {
  matchPrintProfile, printProfileSha256, resolveWorkerPrintPlan, validateSkinPrintProfile,
  assertResolvedPrintPlanSupportCounts, type ResolvedPrintPlan, type SkinPrintProfileV1,
} from "./printProfile.ts";
import {
  assignOverhangSupportTargets,
  validateOverhangAssignmentLedger,
  type OverhangSupportPolicyResult,
} from "./overhangSupportPolicy.ts";
import type { OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import {
  correctTutorialFlags,
  derivePartitionTutorialStep,
  describePartitionInvalidationStatus,
  derivePartitionViewportFocus,
  deriveTutorialNavState,
  draftMatchesConfirmedPartition,
  loadTutorialPersistedUi,
  normalizeDisplayedStep,
  resolvePartitionSelectionGroup,
  saveTutorialPersistedUi,
  type PartitionTutorialSnapshot,
  type TutorialPersistedUi,
  type TutorialStepId,
} from "./partitionTutorial.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// T14 selection visibility (作者Observation 2026-07-20): a floating chip
// naming "the next thing to do", overlaid directly on the viewport instead
// of relying on side-panel text the author said they don't read closely.
// See updateOperationFocus().
const viewportChip = document.createElement("div");
viewportChip.className = "viewport-chip";
viewportChip.hidden = true;
viewport.appendChild(viewportChip);

const emptyViewportHint = document.createElement("div");
emptyViewportHint.className = "viewport-empty-hint";
emptyViewportHint.textContent = "ベース形状を表示中｜1〜4を選び、「この設定で表面を生成」を押します";
emptyViewportHint.hidden = true;
viewport.appendChild(emptyViewportHint);

// --- State -------------------------------------------------------------
let history: SkinHistoryEntry[] = [];
let state = createEmptyState();
let selectedPatchId: number | null = null;
let addPatchMode = false;
let manualRadius = DEFAULT_SKIN_PARAMS.maxR * 0.5;
let lastPackResult: PackPatchesResult | null = null;
let currentQuadGrid: QuadFlowGrid | null = null;
let internalStructureGraph: InternalStructureGraph | null = null;
let internalStructureFingerprint = "";
let targetedSupportSource: {
  surfaceFingerprint: string;
  resolution: number;
  targets: Array<MotifLowestPoint | OverhangDryWebTarget>;
} | null = null;
// T12: three-way view toggle (レイマーチ / ビーズ / 全体メッシュ), replacing
// T11's boolean mesh-overlay flag. See afterMutation() for the auto-switch
// rule (raymarch -> beads once the point count exceeds the shader's
// PATCH_MAX_POINTS uniform budget -- "黙って先頭だけ描くのを廃止", T12 §2).
let viewMode: SkinViewMode = "raymarch";
let displayStyle: SkinDisplayStyle = "solid";
let internalObservationMode: InternalObservationMode = "normal";
let showElementNames = false;
let hoveredPatchId: number | null = null;
let hoverPickFrameId: number | null = null;
let hoverPickPointer: { clientX: number; clientY: number } | null = null;
let activePreviewMeshWorker: Worker | null = null;
let previewMeshRequestId = 0;
let previewMeshGeneration = 0;
let previewMeshStatusTimer: number | null = null;
let previewMeshCache: { generation: number; resolution: number; fingerprint: string; positions: Float32Array; normals: Float32Array; faceCount: number } | null = null;
let activeGaugeWorker: Worker | null = null;
let gaugeGeneration = 0;
let gaugeDebounceTimer: number | null = null;
let activeMeshExportWorker: Worker | null = null;
let meshExportRequestId = 0;
let meshExportGeneration = 0;
let meshExportStatusTimer: number | null = null;
let activePrintCheckMeshWorker: Worker | null = null;
let printCheckMeshReject: ((error: Error) => void) | null = null;
let printCheckMeshRequestId = 0;
let printCheckMeshGeneration = 0;
let activeInternalPrintGateWorker: Worker | null = null;
let internalPrintGateRequestId = 0;
let internalPrintGateGeneration = 0;
let pendingInternalPrintGateFingerprint = "";
let internalPrintGateCache: { fingerprint: string; report: InternalPrintGateReport; stl: ArrayBuffer } | null = null;
let internalPrintGateStatusTimer: number | null = null;
let activeSurfaceAngleWorker: Worker | null = null;
let surfaceAngleGeneration = 0;
let surfaceAngleCache: Extract<SurfaceAngleWorkerMessage, { type: "result" }> | null = null;
let activeBambu3mfWorker: Worker | null = null;
let bambu3mfRequestId = 0;
let bambu3mfGeneration = 0;
let bambu3mfStatusTimer: number | null = null;
let bambu3mfExportCache: {
  fingerprint: string;
  archive: ArrayBuffer;
  validationFacts: Extract<Bambu3mfWorkerMessage, { type: "result" }>["validationFacts"];
} | null = null;
let showMotifLowestPoints = false;

let activeOpeningMapWorker: Worker | null = null;
let openingMapRequestId = 0;
let openingMapGeneration = 0;
let openingMapResult: OpeningMapResult | null = null;
let openingMapDisplayCount: number | "all" = 20;
let openingMapEverRun = false;
let denseFlowerSampleActive = false;
let denseFlowerSampleLoadId = 0;
let lastContactReport: ContactReport | null = null;

// --- T13 coin由来A/B分割 state ------------------------------------------
let seedPickMode = false;
const seedPatchIds = new Set<number>();
let seedAId: number | null = null;
let seedBId: number | null = null;
let draftGroupA = new Set<number>();
let draftGroupB = new Set<number>();
let lastAdjacencyEdges: PatchAdjacencyEdge[] = [];
let partitionResult: PartitionResult | null = null;
let activePartitionWorker: Worker | null = null;
let partitionRequestId = 0;
// Bumped whenever the confirmed partition or the underlying patch set
// changes -- any in-flight worker result tagged with a stale generation is
// discarded on arrival (audit fix: "patch/historyが変わったら古い結果を採用
// しない").
let partitionGeneration = 0;
// SHA-256 of the exact recipe TEXT last imported via "skin 履歴を読み込む",
// so provenance can cite which input produced a given A/B split. Null until
// an import happens (a freshly-grown, never-imported session has no single
// "input recipe" to cite).
let importedRecipeSha256: string | null = null;
let importedRecipeFilename: string | null = null;
let activePrintProfile: SkinPrintProfileV1 | null = null;
let activePrintProfileSha256: string | null = null;
let activePrintProfileFilename: string | null = null;
let activePrintProfileText: string | null = null;
let importedRecipeText: string | null = null;
let overhangSupportResult: OverhangSupportPolicyResult | null = null;

// --- Generation-native N partition state ---------------------------------
let draftNGroups: number[][] = [];
let nSeedIds: number[] = [];
let nPartitionResult: NPartitionResult | null = null;
let activeNPartitionWorker: Worker | null = null;
let nPartitionRequestId = 0;
let nPartitionGeneration = 0;

// Optional A/B guide open/author-review flags (localStorage only — never
// mixed into recipe/history). Geometry and partition state are untouched.
let tutorialUi: TutorialPersistedUi = loadTutorialPersistedUi();
// Which guide step is currently being READ, separate from the real workflow
// position (derivePartitionTutorialStep). Session-only by design (not
// persisted): null means "follow the real step", a number means the author
// is paging back through past steps with 前へ/最初から読む. See
// deriveTutorialNavState in partitionTutorial.ts for how this is reconciled.
let tutorialDisplayedStep: TutorialStepId | null = null;

const skinRenderer = new SkinRenderer(viewport);

// Compact, viewport-local edit affordance. The buttons intentionally call
// applyElementEdit below rather than mutating geometry themselves, so their
// changes remain ordinary replayable editPatch history entries.
const quickEditToolbar = document.createElement("div");
quickEditToolbar.className = "quick-edit-toolbar";
quickEditToolbar.hidden = true;
quickEditToolbar.setAttribute("role", "group");
quickEditToolbar.setAttribute("aria-label", "選択した形のかんたん調整");
viewport.appendChild(quickEditToolbar);

const QUICK_EDIT_ACTIONS: Array<{ label: string; title: string; intent?: PatchEditIntent; duplicate?: true }> = [
  { label: "縮小", title: "選択した形を 10% 縮小", intent: { kind: "scale", factor: 0.9 } },
  { label: "拡大", title: "選択した形を 10% 拡大", intent: { kind: "scale", factor: 1.1 } },
  { label: "左回転", title: "選択した形を左へ 15度 回転", intent: { kind: "rotate", degrees: -15 } },
  { label: "右回転", title: "選択した形を右へ 15度 回転", intent: { kind: "rotate", degrees: 15 } },
  { label: "複製", title: "選択した形を複製して少し横へ置く", duplicate: true },
];

for (const action of QUICK_EDIT_ACTIONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action.label;
  button.title = action.title;
  if (action.duplicate) button.classList.add("quick-edit-duplicate");
  button.setAttribute("aria-label", action.title);
  // The viewport owns pointer selection/dragging. A toolbar pointer must
  // never bubble into that path or OrbitControls behind the overlay.
  for (const type of ["pointerdown", "pointerup", "pointercancel"] as const) {
    button.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (selectedPatchId === null) return;
    if (action.duplicate) duplicateElement(selectedPatchId);
    else if (action.intent) applyElementEdit(selectedPatchId, action.intent);
  });
  quickEditToolbar.appendChild(button);
}

let quickEditPatchId: number | null = null;
let quickEditAllowed = false;
let directManipulationActive = false;

function syncQuickEditAvailability(): void {
  quickEditPatchId = selectedPatchId;
  quickEditAllowed = selectedPatchId !== null && editEligibility(state.patches, selectedPatchId).ok;
  if (!quickEditAllowed) quickEditToolbar.hidden = true;
}

function clampQuickEdit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quickEditOverlapArea(
  candidate: { x: number; y: number; width: number; height: number },
  obstacle: DOMRect,
): number {
  const width = Math.max(0, Math.min(candidate.x + candidate.width, obstacle.right) - Math.max(candidate.x, obstacle.left));
  const height = Math.max(0, Math.min(candidate.y + candidate.height, obstacle.bottom) - Math.max(candidate.y, obstacle.top));
  return width * height;
}

/** Position the compact toolbar once per existing render frame. A deliberate
 * clear zone around the selected motif/cursor leaves room to start and steer
 * a direct drag; candidates then prefer the side that avoids persistent UI. */
function updateQuickEditToolbar(): void {
  const patch = quickEditPatchId === null ? null : state.patches.find((candidate) => candidate.id === quickEditPatchId) ?? null;
  if (directManipulationActive || !quickEditAllowed || selectedPatchId !== quickEditPatchId || !patch || denseFlowerSampleActive) {
    quickEditToolbar.hidden = true;
    return;
  }
  const anchor = skinRenderer.projectPatchAnchor(patch);
  if (!anchor) {
    quickEditToolbar.hidden = true;
    return;
  }
  const viewportRect = viewport.getBoundingClientRect();
  const width = 196;
  const height = 108;
  const inset = 14;
  const cursorClearance = 72;
  const cursorSafeRadius = 52;
  const clampX = (x: number) => clampQuickEdit(x, inset, Math.max(inset, viewport.clientWidth - width - inset));
  const clampY = (y: number) => clampQuickEdit(y, inset, Math.max(inset, viewport.clientHeight - height - inset));
  const candidates = [
    { x: clampX(anchor.x + cursorClearance), y: clampY(anchor.y - height * 0.5) },
    { x: clampX(anchor.x - width - cursorClearance), y: clampY(anchor.y - height * 0.5) },
    { x: clampX(anchor.x - width * 0.5), y: clampY(anchor.y + cursorClearance) },
    { x: clampX(anchor.x - width * 0.5), y: clampY(anchor.y - height - cursorClearance) },
  ];
  const obstacles = [
    new DOMRect(
      anchor.x - cursorSafeRadius,
      anchor.y - cursorSafeRadius,
      cursorSafeRadius * 2,
      cursorSafeRadius * 2,
    ),
    ...[...app.querySelectorAll<HTMLElement>(
    ".viewport-view-dock, .history-undo-dock, .selected-element-dock, .viewport-task-status",
  )]
    .filter((element) => !element.hidden)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return new DOMRect(rect.left - viewportRect.left, rect.top - viewportRect.top, rect.width, rect.height);
    }),
  ];
  const chosen = candidates.reduce((best, candidate) => {
    const score = obstacles.reduce(
      (total, obstacle) => total + quickEditOverlapArea({ ...candidate, width, height }, obstacle),
      0,
    );
    const bestScore = obstacles.reduce(
      (total, obstacle) => total + quickEditOverlapArea({ ...best, width, height }, obstacle),
      0,
    );
    return score < bestScore ? candidate : best;
  });
  quickEditToolbar.style.left = `${chosen.x.toFixed(1)}px`;
  quickEditToolbar.style.top = `${chosen.y.toFixed(1)}px`;
  quickEditToolbar.hidden = false;
}

// Seed the initial host so the app opens with something to look at (same
// default grow S1/pack open with).
record(history, state, "growHost", { params: { ...DEFAULT_SKIN_HOST_PARAMS } });

function applyElementEdit(patchId: number, intent: PatchEditIntent, preparedPatch?: Patch): boolean {
  const eligibility = editEligibility(state.patches, patchId);
  if (!eligibility.ok) {
    ui.setElementEditStatus(eligibility.reason, false);
    return false;
  }
  const patch = state.patches.find((candidate) => candidate.id === patchId);
  if (!patch) {
    ui.setElementEditStatus("選択した要素が見つかりません", false);
    return false;
  }
  let editedPatch = preparedPatch;
  if (!editedPatch) {
    const result = transformPatch(patch, state.host, state.hostParams.k, intent);
    if (!result.ok) {
      ui.setElementEditStatus(result.reason, false);
      return false;
    }
    editedPatch = result.patch;
  }
  record(history, state, "editPatch", { patch: editedPatch, intent });
  // A local author edit never repacks, renumbers, or silently regenerates
  // connections. The camera also stays still for repeated keys/drags.
  selectedPatchId = patchId;
  lastPackResult = null;
  afterMutation({ patchOnlyId: patchId });
  const changed = intent.kind === "scale" ? "大きさ" : intent.kind === "rotate" ? "向き" : intent.kind === "placement" ? "表面からの位置" : "位置";
  ui.setElementEditStatus(`${changed}を変更しました。UNDOで戻せます`, true);
  return true;
}

function duplicateElement(patchId: number): boolean {
  const eligibility = editEligibility(state.patches, patchId);
  const source = state.patches.find((patch) => patch.id === patchId);
  if (!eligibility.ok || !source || source.points.some((point) => point.role === "bridge" || point.role === "surfaceConnector")) {
    ui.setElementEditStatus(eligibility.ok ? "接続を持つ要素は複製できません" : eligibility.reason, false);
    return false;
  }
  const copy: Patch = {
    id: freshPatchId(),
    shape: source.shape,
    motifPlacement: source.motifPlacement,
    ...(source.ringDiameter !== undefined ? { ringDiameter: source.ringDiameter } : {}),
    motifParams: source.motifParams ? { ...source.motifParams } : undefined,
    points: source.points.map((point) => ({ ...point })),
  };
  const maximumRadius = Math.max(...copy.points.map((point) => point.r), 0.05);
  const moved = transformPatch(copy, state.host, state.hostParams.k, { kind: "nudge", u: maximumRadius * 0.65, v: maximumRadius * 0.15 });
  if (!moved.ok) {
    ui.setElementEditStatus(`複製先を決められません: ${moved.reason}`, false);
    return false;
  }
  record(history, state, "addPatch", { patch: moved.patch });
  selectedPatchId = moved.patch.id;
  lastPackResult = null;
  afterMutation({ patchOnlyId: moved.patch.id });
  ui.setElementEditStatus(
    `複製しました（${elementDisplayName("surface", moved.patch.shape, moved.patch.id)}）。ドラッグで位置を調整できます`,
    true,
  );
  return true;
}

function regrowHost(): void {
  record(history, state, "growHost", { params: { ...state.hostParams } });
  selectedPatchId = null;
  afterMutation();
}

// --- UI ------------------------------------------------------------------
const ui = buildUi(app, state.hostParams, state.skinParams, state.mode, manifest.version, manifest.updatedAt, {
  onUndo: () => undoLastOperation(),
  onUndoSteps: (steps) => undoSeveralOperations(steps),
  onHostParamChange: (key, value) => {
    record(history, state, "setHostParam", { key, value });
    if (key !== "k") {
      regrowHost();
      return;
    }
    afterMutation();
  },
  onGrowHost: () => regrowHost(),
  onRerollHost: () => {
    const seed = Math.random().toString(36).slice(2, 8);
    record(history, state, "growHost", { params: { ...state.hostParams, seed } });
    selectedPatchId = null;
    ui.syncHostParams(state.hostParams);
    afterMutation();
  },
  onImportS1File: (file) => importS1Recipe(file),
  onSkinParamChange: (key, value) => {
    const enteringTargetedGrid = key === "internalStructure" && value === "targetedGrid";
    record(history, state, "setSkinParam", { key, value });
    ui.updateMotifPreview(state.skinParams);
    if (key === "patchShape") ui.setPatchShape(state.skinParams.patchShape);
    if (key === "motifPlacement") ui.setMotifPlacement(state.skinParams.motifPlacement);
    if (key === "laceMotifPlacement") ui.setLaceMotifPlacement(state.skinParams.laceMotifPlacement);
    if (key === "surfaceGenerationMode") {
      ui.setSurfaceGenerationMode(state.skinParams.surfaceGenerationMode);
    }
    if (key === "internalStructure") {
      ui.setInternalStructure(state.skinParams.internalStructure);
      if (state.skinParams.internalStructure === "none") setInternalObservationMode("normal");
    }
    // T14 (instruction §3.2, extended to the pre-existing thickness/roundK
    // per §3.2's "共通関数化の方が安全で最小なら揃える"): thickness/roundK/
    // coinBulge are all read LIVE by compositeSdf for EVERY already-placed
    // patch (unlike minR/maxR/irregularity/gap/attempts/patchShape/ring-
    // specific knobs, which only affect patches created by a FUTURE
    // "詰める" -- existing patches keep whatever shape they were packed
    // with). A confirmed A/B result/build was computed from the field as it
    // was at that moment, so changing any of these three stales it exactly
    // the same way a draft edit does. Patch identity/positions and the
    // confirmed A/B GROUPING itself are untouched -- only the physical
    // result/Worker/export/metrics are invalidated, so a re-confirm is
    // never required, only a rebuild.
    if (key === "thickness" || key === "roundK" || key === "coinBulge" || key === "coinBulgeBalance" || key === "quadMeshJoinWidth") {
      invalidateStaleResultForShapeParamChange();
      invalidateNPartitionResult("形状設定が変わったため、N分割をもう一度生成してください");
    }
    if (key === "contactTarget" || key === "contactMaxGrowth" || key === "contactOverlap" ||
      key === "contactReinforcementMode" || key === "contactWholeScaleMax") {
      clearContactView("設定が変わりました。「接点数を色で確認」を押してください");
    }
    afterMutation({ skipGauges: true });
    if (enteringTargetedGrid) {
      window.setTimeout(() => startSurfaceAngleDiagnosis(ui.getSurfaceAngleThreshold()), 0);
    }
  },
  onSetViewMode: (mode) => {
    invalidateSurfaceAngleDiagnosis("通常の生成結果表示へ戻りました");
    // A first-hit raymarch cannot reveal geometry behind the front surface.
    // Choosing it explicitly therefore returns to honest opaque shading.
    if (mode === "raymarch" && internalObservationMode !== "normal") {
      setInternalObservationMode("normal");
    }
    if (mode === "raymarch" && displayStyle === "ghost") {
      displayStyle = "solid";
      skinRenderer.setDisplayStyle(displayStyle);
      ui.setDisplayStyle(displayStyle);
    }
    setViewMode(mode);
  },
  onSetDisplayStyle: (style) => {
    invalidateSurfaceAngleDiagnosis("表示を切り替えたため、角度診断を終了しました");
    if (internalObservationMode !== "normal") setInternalObservationMode("normal");
    displayStyle = style;
    skinRenderer.setDisplayStyle(style);
    ui.setDisplayStyle(style);
    if (style === "ghost" && viewMode === "raymarch") {
      ui.setMeshPreviewStatus("ゴースト表示用の段階メッシュを準備しています", true);
      setViewMode("mesh");
    } else {
      render();
    }
  },
  onSetInternalObservationMode: (mode) => {
    invalidateSurfaceAngleDiagnosis("Internal表示を切り替えたため、角度診断を終了しました");
    setInternalObservationMode(mode);
  },
  onDiagnoseSurfaceAngles: (thresholdDeg) => startSurfaceAngleDiagnosis(thresholdDeg),
  onSetSurfaceAngleDiagnosisView: (diagnosisView) => showSurfaceAngleDiagnosisView(diagnosisView),
  onSurfaceAngleThresholdChange: () => { invalidateSurfaceAngleDiagnosis("閾値が変わりました。もう一度診断してください"); refreshPrintProfileSummary(); },
  onToggleMotifLowestPoints: (show, thresholdDeg) => {
    showMotifLowestPoints = show;
    if (show && !surfaceAngleCache) startSurfaceAngleDiagnosis(thresholdDeg);
    else {
      refreshMotifLowestPointMarkers();
      render();
    }
  },
  onPreviewMeshResolutionChange: (resolution) => {
    refreshPrintProfileSummary();
    invalidateSurfaceAngleDiagnosis("解像度が変わりました。もう一度診断してください");
    invalidateInternalPrintGate("最終mesh解像度が変わりました。内部構造をもう一度判定してください");
    const wasBuilding = activePreviewMeshWorker !== null;
    cancelPreviewMeshBuild();
    if (viewMode === "mesh" || wasBuilding) {
      startPreviewMeshBuild();
    } else {
      ui.setMeshPreviewStatus(`最終精度 ${resolution} · 段階メッシュを選ぶと粗表示から更新します`);
    }
  },
  onCancelPreviewMesh: () => cancelPreviewMeshBuild(true),
  onToggleElementNames: (show) => {
    showElementNames = show;
    skinRenderer.setElementNames(state.patches, selectedPatchId, showElementNames, hoveredPatchId);
  },
  onElementSelect: (patchId) => {
    const patch = state.patches.find((candidate) => candidate.id === patchId);
    if (!patch) return;
    selectedPatchId = patchId;
    skinRenderer.focusPatch(patch);
    skinRenderer.updateBeadSelection(selectedPatchId);
    skinRenderer.setElementNames(state.patches, selectedPatchId, showElementNames, hoveredPatchId);
    syncElementRegistry();
    updateSelectionLabel();
    render();
  },
  onElementAnnotationSave: (patchId, value) => {
    const reference: SurfaceElementReference = { domain: "surface", setRevision: state.patchSetRevision, patchId };
    record(history, state, "setAnnotation", { reference, value });
    syncElementRegistry();
    syncUndoHistory();
  },
  onElementEdit: (patchId, intent) => { applyElementEdit(patchId, intent); },
  onDuplicateElement: (patchId) => { duplicateElement(patchId); },
  onReshapePatch: (patchId, params, ringDiameter) => {
    const eligibility = editEligibility(state.patches, patchId);
    if (!eligibility.ok) {
      ui.setMotifReshapeStatus(eligibility.reason, false);
      return false;
    }
    const patch = state.patches.find((candidate) => candidate.id === patchId);
    if (!patch) {
      ui.setMotifReshapeStatus("選択した要素が見つかりません", false);
      return false;
    }
    const result = reshapePatchMotif(patch, state.host, state.hostParams.k, state.skinParams, params, state.patches, ringDiameter);
    if (!result.ok) {
      ui.setMotifReshapeStatus(result.reason, false);
      return false;
    }
    record(history, state, "reshapePatch", { patch: result.patch, params: result.patch.motifParams! });
    // A local reshape intentionally leaves every neighbouring patch in place.
    selectedPatchId = patchId;
    lastPackResult = null;
    afterMutation({ patchOnlyId: patchId });
    const reshaped = state.patches.find((candidate) => candidate.id === patchId);
    if (reshaped) skinRenderer.focusPatch(reshaped);
    ui.setMotifReshapeStatus("この要素だけ形を更新しました。接点・空隙・メッシュ・分割は再確認してください", true);
    return true;
  },
  onPackPatches: () => {
    const result = packCurrentSurface(state.skinParams, state.patches);
    currentQuadGrid = "quadGrid" in result ? (result as QuadFlowPackResult).quadGrid : null;
    lastPackResult = result;
    record(history, state, "packPatches", { patches: result.patches, identity: "replace" });
    selectedPatchId = null;
    afterMutation();
    updateSurfacePackStatus(result);
  },
  onFillLaceGaps: () => {
    const result = fillLargestSurfaceGaps(state.host, state.hostParams.k, state.patches, state.skinParams);
    lastPackResult = result;
    record(history, state, "packPatches", { patches: result.patches, identity: "preserve" });
    selectedPatchId = null;
    afterMutation();
    ui.setPackResult(result);
  },
  onCreateDenseFlowerV6Style: async () => {
    if (state.host.length === 0) throw new Error("先にベース形状を作ってください");
    // Paint the progress text before this bounded synchronous generation.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const result = buildDenseFlowerV6Style(state.host, state.hostParams.k, state.skinParams);
    record(history, state, "applySurfacePreset", {
      presetId: DENSE_FLOWER_V6_STYLE_PRESET_ID,
      params: result.params,
      patches: result.lace.patches,
    });
    selectedPatchId = null;
    lastPackResult = result.lace;
    currentQuadGrid = null;
    ui.syncSkinParams(state.skinParams);
    afterMutation();
    ui.setPackResult(result.lace);
  },
  onAnalyzeContacts: () => showContactReport(analyzePatchContacts(state.patches, state.skinParams.contactTarget)),
  onReinforceContacts: () => {
    if (state.patches.length === 0) {
      ui.setContactStatus("先に表面へ花・コイン・リングを生成してください", false);
      return;
    }
    const result = reinforceWeakPatchContacts(state.patches, {
      target: state.skinParams.contactTarget,
      maxGrowth: state.skinParams.contactMaxGrowth,
      overlap: state.skinParams.contactOverlap,
      mode: state.skinParams.contactReinforcementMode,
      wholeScaleMax: state.skinParams.contactWholeScaleMax,
    });
    record(history, state, "packPatches", { patches: result.patches, identity: "preserve" });
    selectedPatchId = null;
    afterMutation();
    showContactReport(result.after, false);
    const unresolved = result.unresolvedIds.length > 0
      ? result.mode === "wholeMotif"
        ? ` / 未達 ${result.unresolvedIds.length}花（上限まで拡大済み。必要なら拡大上限を上げてください）`
        : ` / 未達 ${result.unresolvedIds.length}花`
      : " / 全花が目標到達";
    const adjustment = result.mode === "wholeMotif"
      ? `花全体 ${result.adjustedPatchCount}個（最大 ${(100 * (1 + result.maxAddition)).toFixed(0)}%）`
      : `局所調整 ${result.adjustedPointCount}点（最大 +${result.maxAddition.toFixed(3)}）`;
    ui.setContactStatus(
      `弱い花 ${result.before.weakCount}→${result.after.weakCount} / 新しい接点 ${result.addedEdges} / ${adjustment}${unresolved}`,
      result.after.weakCount === 0,
    );
  },
  onRepackFlowers: () => {
    const flowerParams = { ...state.skinParams, patchShape: "flower" as const };
    const result = packCurrentSurface(
      flowerParams,
      state.patches.filter((patch) => patch.shape !== "flower"),
    );
    currentQuadGrid = "quadGrid" in result ? (result as QuadFlowPackResult).quadGrid : null;
    lastPackResult = result;
    record(history, state, "packPatches", { patches: result.patches });
    selectedPatchId = null;
    afterMutation();
    updateSurfacePackStatus(result);
  },
  onClearPatches: () => {
    record(history, state, "clearPatches", {});
    selectedPatchId = null;
    lastPackResult = null;
    afterMutation();
  },
  onClearAll: () => {
    record(history, state, "clearAll", {});
    selectedPatchId = null;
    lastPackResult = null;
    afterMutation();
  },
  onSetMode: (mode) => {
    record(history, state, "setMode", { mode });
    invalidateSurfaceAngleDiagnosis();
    invalidateInternalPrintGate("実体モードが変わりました。内部構造をもう一度判定してください");
    invalidateNPartitionResult("実体モードが変わったため、N分割をもう一度生成してください");
    invalidateOpeningMap();
    ui.setMode(state.mode);
    updateEmptyViewportHint();
    render();
  },
  onToggleAddPatchMode: (active) => {
    addPatchMode = active;
    viewport.classList.toggle("add-patch-mode", active);
    ui.setAddPatchModeActive(active);
    updateOperationFocus(); // add-patch mode suppresses the A/B focus chip/frame
  },
  onManualRadiusChange: (r) => {
    manualRadius = r;
  },
  onDeleteSelectedPatch: () => deleteSelectedPatch(),
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
  onMeshInspect: (options) => inspectMesh(options),
  onMeshExport: (options) => exportMesh(options),
  onCancelMeshExport: () => cancelMeshExport(true),
  onBambu3mfExport: (options, supportType) => exportBambu3mf(options, supportType),
  onImportPrintProfile: (file) => void importPrintProfile(file),
  onSavePrintProfile: () => void saveCurrentPrintProfile(),
  onInternalPrintGate: (options) => startInternalPrintGate(options),
  onMeasureOpenings: (options) => {
    invalidateSurfaceAngleDiagnosis("空隙マップへ切り替えました");
    measureOpeningMap(options);
  },
  onOpenDenseFlowerSample: () => openDenseFlowerSample(),
  onDenseFlowerSampleView: (view) => setDenseFlowerSampleView(view),
  onCancelOpeningMap: () => cancelOpeningMap(),
  onClearOpeningMap: () => clearOpeningMapDisplay(),
  onOpeningMapDisplayCountChange: (count) => { openingMapDisplayCount = count; refreshOpeningMapDisplay(); },
  onOpeningMapConditionsChange: () => { invalidateOpeningMap(); refreshPrintProfileSummary(); },
  onPrintCheck: (options) => void checkCurrentPrint(options),
  onProposeNPartition: (count) => proposeAndConfirmNPartition(count),
  onBuildNPartition: () => buildNPartition(),
  onCancelNPartitionBuild: () => cancelNPartitionBuild(),
  onExportNPartition: () => void exportNPartition(),
  onToggleSeedPickMode: (active) => {
    seedPickMode = active;
    viewport.classList.toggle("seed-pick-mode", active);
    if (active) {
      // Starting endpoint selection always means a fresh A -> B sequence.
      // This removes the previous ambiguous state where clicking with two
      // endpoints already present silently replaced only B.
      seedAId = null;
      seedBId = null;
      seedPatchIds.clear();
      draftGroupA = new Set();
      draftGroupB = new Set();
      invalidateStalePartitionResult();
      refreshPartitionDraft();
    } else {
      // "両端選択を中止": this callback only ever fires here while the
      // selection is INCOMPLETE -- handleClick's seed-pick branch flips
      // seedPickMode to false itself (bypassing this callback) the instant
      // both endpoints are picked, so a manual "中止" always means
      // discarding a half-picked (or empty) selection, never a completed
      // pair. Must fully discard seedAId/seedBId and their badges, not
      // just hide the viewport chrome while leaving a half-set A endpoint
      // behind (selection-final-polish P0 -- "中止したのかAだけ確定した
      // のか視覚で判別できない" problem).
      discardEndpointSelection();
    }
  },
  onProposeGroups: () => {
    if (seedAId === null || seedBId === null) {
      alert("A端とB端を1個ずつ選んでください（1クリック目=A端、2クリック目=B端）");
      return;
    }
    lastAdjacencyEdges = buildPatchAdjacency(state.patches, state.skinParams.roundK);
    const proposal = proposeGroupsBetweenEndpoints(state.patches, lastAdjacencyEdges, seedAId, seedBId);
    draftGroupA = new Set(proposal.groupA);
    draftGroupB = new Set(proposal.groupB);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
  },
  onAssignSelectedPatchToGroup: (group) => {
    if (selectedPatchId === null) {
      alert("A/Bへ割り当てるパッチをクリックで選択してください");
      return;
    }
    ensureDraftInitialized();
    draftGroupA.delete(selectedPatchId);
    draftGroupB.delete(selectedPatchId);
    (group === "A" ? draftGroupA : draftGroupB).add(selectedPatchId);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
  },
  onClearSeeds: () => {
    // Shared with onToggleSeedPickMode(false)'s "中止" path -- both discard
    // whatever endpoint/draft state exists and refresh every dependent
    // display the same way (selection-final-polish P0).
    discardEndpointSelection();
    ui.setPartitionStatus("未分割");
  },
  onConfirmPartition: () => confirmPartition(),
  onBuildPartition: () => buildPartition(),
  onCancelPartitionBuild: () => cancelPartitionBuild(),
  onExportPartition: (parts) => void exportPartition(parts, false),
  onExportPartitionVerification: (parts) => void exportPartition(parts, true),
  onSetPartitionPreviewFilter: (filter) => {
    skinRenderer.setBeadGroupFilter(filter);
    render();
  },
  onTutorialOpen: () => tutorialOpen(),
  onTutorialClose: () => tutorialClose(),
  onTutorialPrev: () => tutorialPrev(),
  onTutorialAdvance: () => tutorialAdvance(),
  onTutorialRestart: () => tutorialRestart(),
  onTutorialReturnToCurrent: () => tutorialReturnToCurrent(),
});
ui.setMode(state.mode);
skinRenderer.resize();
afterMutation();
refreshPartitionTutorial();

function currentTargetSurfaceFingerprint(): string {
  return JSON.stringify({
    mode: state.mode,
    hostK: state.hostParams.k,
    host: state.host.map((ball) => [ball.x, ball.y, ball.z, ball.r]),
    thickness: state.skinParams.thickness,
    roundK: state.skinParams.roundK,
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    patches: state.patches.map((patch) => [
      patch.id,
      patch.shape,
      patch.points.map((point) => [point.x, point.y, point.z, point.r, point.role ?? ""]),
    ]),
  });
}

function splitTriangleSoup(positions: Float32Array): Float32Array[] {
  if (positions.length % 9 !== 0) throw new Error("overhang diagnosis buffer is not a triangle soup");
  const faces: Float32Array[] = [];
  for (let offset = 0; offset < positions.length; offset += 9) faces.push(positions.slice(offset, offset + 9));
  return faces;
}

function classifySurfaceAngleSupport(
  message: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
): OverhangSupportPolicyResult {
  const sourceLongest = triangleSoupLongestExtent(message.basePositions);
  const targetLongestMm = ui.getMeshOptions().targetLongestMm;
  if (!(sourceLongest > 0) || !(targetLongestMm > 0)) throw new Error("Fail closed: BODYの実寸Scaleを求められませんでした");
  const scaleMmPerUnit = targetLongestMm / sourceLongest;
  const finalSurfacePositionsMm = new Float32Array(message.basePositions.map((value) => value * scaleMmPerUnit));
  const diagnosedPositionsMm = new Float32Array(message.beforeDangerPositions.map((value) => value * scaleMmPerUnit));
  const result = assignOverhangSupportTargets({
    diagnosedFaces: splitTriangleSoup(diagnosedPositionsMm),
    explicitTargets: activePrintProfile?.scaffold.explicitTargets ?? [],
    finalSurfacePositionsMm,
  });
  if (activePrintProfile && activePrintProfileSha256) {
    const plan = resolveWorkerPrintPlan(activePrintProfile, activePrintProfileSha256, currentPrintProfileBinding(activePrintProfile, false));
    assertResolvedPrintPlanSupportCounts(plan, result.counts);
  } else {
    validateOverhangAssignmentLedger(result);
  }
  return result;
}

function sourceDryWebTargets(result: OverhangSupportPolicyResult, scaleMmPerUnit: number): Array<OverhangDryWebTarget> {
  return result.insideTargets.map((target) => ({
    ...target,
    position: {
      x: target.position.x / scaleMmPerUnit,
      y: target.position.y / scaleMmPerUnit,
      z: target.position.z / scaleMmPerUnit,
    },
  }));
}

function diagnosedPositionsForPolicy(result: OverhangSupportPolicyResult): Float32Array {
  const positions: number[] = [];
  for (const entry of result.entries) {
    if (entry.source === "diagnosed-face" && entry.positionsMm) positions.push(...entry.positionsMm);
  }
  return new Float32Array(positions);
}

function targetedSupportSourceIsCurrent(): boolean {
  if (!targetedSupportSource) return false;
  return targetedSupportSource.surfaceFingerprint === currentTargetSurfaceFingerprint()
    && targetedSupportSource.resolution === Math.max(16, Math.round(ui.getMeshOptions().resolution));
}

function getInternalStructureGraph(): InternalStructureGraph | null {
  if (state.skinParams.internalStructure === "none" || state.host.length === 0) {
    internalStructureFingerprint = "";
    internalStructureGraph = null;
    return null;
  }
  const targetedTargets = state.skinParams.internalStructure === "targetedGrid" && targetedSupportSourceIsCurrent()
    ? targetedSupportSource!.targets
    : null;
  if (state.skinParams.internalStructure === "targetedGrid" && !targetedTargets) {
    internalStructureFingerprint = "";
    internalStructureGraph = null;
    return null;
  }
  const fingerprint = JSON.stringify({
    mode: state.skinParams.internalStructure,
    density: state.skinParams.internalDensity,
    radius: state.skinParams.internalRadius,
    randomness: state.skinParams.internalRandomness,
    seed: state.skinParams.seed,
    hostK: state.hostParams.k,
    host: state.host.map((ball) => [ball.x, ball.y, ball.z, ball.r]),
    targetSurface: targetedSupportSource?.surfaceFingerprint ?? "",
    targets: targetedTargets?.map((target) => [
      target.patchId,
      target.position.x, target.position.y, target.position.z,
      target.normal?.x ?? null, target.normal?.y ?? null, target.normal?.z ?? null,
    ]) ?? [],
  });
  if (fingerprint === internalStructureFingerprint) return internalStructureGraph;
  internalStructureGraph = state.skinParams.internalStructure === "targetedGrid"
    ? buildTargetedGridInternalStructure(
      state.host,
      state.hostParams.k,
      state.patches,
      targetedTargets!,
      state.skinParams.internalDensity,
      state.skinParams.internalRadius,
    )
    : buildVoronoiInternalStructure(
      state.host, state.hostParams.k, state.skinParams.internalDensity,
      state.skinParams.internalRadius, state.skinParams.internalRandomness, state.skinParams.seed,
    );
  internalStructureFingerprint = fingerprint;
  return internalStructureGraph;
}

function refreshInternalStructure(): void {
  try {
    const graph = getInternalStructureGraph();
    skinRenderer.setInternalStructure(graph);
    if (!graph) {
      ui.setInternalStructureStatus(state.skinParams.internalStructure === "targetedGrid"
        ? state.mode === "window"
          ? "赤点→Dry Webは「プレートが実」で使います"
          : activeSurfaceAngleWorker
            ? "最終精度診断から赤点を取得しています…"
            : "最終精度で角度診断すると、全赤点からDry Webを生成します"
        : "None — Surface のみ");
      return;
    }
    const stats = graph.stats;
    ui.setInternalStructureStatus(graph.kind === "targetedGrid"
      ? `赤点 ${stats.connectedTargets ?? 0}/${stats.requestedTargets ?? 0}本を接続 / ` +
        `Dry node ${stats.gridNodeCount ?? 0} / Dry edge ${stats.gridEdgeCount ?? 0} / 全edge ${graph.edges.length} / ` +
        `分離群 ${stats.removedIsolatedEdges}`
      : `内部点${stats.inputPoints} / node ${graph.nodes.length} / edge ${graph.edges.length} / ` +
        `境界clip ${stats.clippedEdges} / 除外 ${stats.removedShortEdges + stats.removedOutsideEdges + stats.removedIsolatedEdges}`,
      graph.edges.length > 0,
    );
  } catch (error) {
    internalStructureGraph = null;
    internalStructureFingerprint = "";
    skinRenderer.setInternalStructure(null);
    ui.setInternalStructureStatus(`生成失敗: ${(error as Error).message}`, false);
  }
}

function refreshMotifLowestPointMarkers(): void {
  if (!showMotifLowestPoints) {
    skinRenderer.setMotifLowestPointMarkers(null);
    ui.setMotifLowestPointStatus("非表示");
    return;
  }
  const diagnosis = surfaceAngleCache;
  if (!diagnosis) {
    skinRenderer.setMotifLowestPointMarkers(null);
    ui.setMotifLowestPointStatus(activeSurfaceAngleWorker
      ? "最終精度のSurface meshを生成して最下端を測っています…"
      : "最終精度で診断すると表示できます");
    return;
  }
  const markers = diagnosis.motifLowestPoints;
  skinRenderer.setMotifLowestPointMarkers(markers);
  if (markers.length === 0) {
    ui.setMotifLowestPointStatus(state.mode === "window"
      ? "最下端の要素帰属は「プレートが実」で確認してください"
      : "最終メッシュ上で帰属できる要素がありませんでした");
    return;
  }
  const reached = markers.filter((marker) => marker.reachedByInternal).length;
  const shapeCounts = new Map<string, number>();
  for (const marker of markers) shapeCounts.set(marker.shape, (shapeCounts.get(marker.shape) ?? 0) + 1);
  const shapeLabels: Record<string, string> = { flower: "花", coin: "コイン", flatRing: "平リング", ring3d: "立体リング" };
  const breakdown = [...shapeCounts].map(([shape, count]) => `${shapeLabels[shape] ?? shape}${count}`).join(" / ");
  const hasInternal = diagnosis.internalEdgeCount > 0;
  ui.setMotifLowestPointStatus(hasInternal
    ? `最終mesh解像度${diagnosis.resolution} · 最下端 ${markers.length}点（${breakdown}） · Internal到達 ${reached} / 未到達 ${markers.length - reached}`
    : `最終mesh解像度${diagnosis.resolution} · 最下端 ${markers.length}点（${breakdown}） · Internal Structureなし`,
    hasInternal,
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ||
    target instanceof HTMLInputElement || (target instanceof HTMLElement && target.isContentEditable);
}

window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
  const target = event.target;
  if (isTypingTarget(target)) return;
  event.preventDefault();
  undoLastOperation();
});

window.addEventListener("keydown", (event) => {
  if (!event.key.startsWith("Arrow") || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
  if (selectedPatchId === null || addPatchMode || seedPickMode) return;
  const step = ui.getElementMoveStep() * (event.shiftKey ? 4 : 1);
  const intent: PatchEditIntent = event.key === "ArrowLeft" ? { kind: "nudge", u: -step, v: 0 }
    : event.key === "ArrowRight" ? { kind: "nudge", u: step, v: 0 }
      : event.key === "ArrowUp" ? { kind: "nudge", u: 0, v: step }
        : { kind: "nudge", u: 0, v: -step };
  event.preventDefault();
  applyElementEdit(selectedPatchId, intent);
});

// --- Pointer interaction ---------------------------------------------------
// Click (no drag) on a patch -> select it (toggle). Click on host skin while
// "add patch" mode is active -> place a manual patch there. Same click/orbit
// disambiguation pattern as pack/cloud-sculpt.

let pointerDownPos: { x: number; y: number } | null = null;
let patchDrag: {
  pointerId: number;
  patchId: number;
  startX: number;
  startY: number;
  startRay: PointerRay;
  frame: PatchSurfaceFrame;
  sourcePatch: Patch;
  latestRay: PointerRay | null;
  frameRequestId: number | null;
  active: boolean;
} | null = null;
const DRAG_THRESHOLD = 4;

function pointerRay(event: Pick<PointerEvent, "clientX" | "clientY">): ReturnType<typeof skinRenderer.screenToRay> {
  const { x, y } = ndcFromPointer(event, viewport);
  return skinRenderer.screenToRay(x, y);
}

function fastPatchId(ray: PointerRay): number | null {
  return pickPatchBySpheres(state.patches, ray.origin, ray.dir, state.skinParams.roundK * 0.35);
}

function setHoveredPatch(patchId: number | null): void {
  if (hoveredPatchId === patchId) return;
  hoveredPatchId = patchId;
  skinRenderer.setElementNames(state.patches, selectedPatchId, showElementNames, hoveredPatchId);
}

function flushHoverPick(): void {
  hoverPickFrameId = null;
  const pointer = hoverPickPointer;
  hoverPickPointer = null;
  if (!pointer || patchDrag || addPatchMode || seedPickMode || denseFlowerSampleActive) return;
  setHoveredPatch(fastPatchId(pointerRay(pointer)));
}

viewport.addEventListener("pointermove", (event) => {
  if (event.target !== skinRenderer.renderer.domElement || patchDrag || directManipulationActive) return;
  hoverPickPointer = { clientX: event.clientX, clientY: event.clientY };
  if (hoverPickFrameId === null) hoverPickFrameId = window.requestAnimationFrame(flushHoverPick);
});

viewport.addEventListener("pointerleave", () => {
  hoverPickPointer = null;
  if (hoverPickFrameId !== null) window.cancelAnimationFrame(hoverPickFrameId);
  hoverPickFrameId = null;
  setHoveredPatch(null);
});

function patchDragPreview(
  drag: NonNullable<typeof patchDrag>,
  ray: PointerRay,
): { patch: Patch; intent: Extract<PatchEditIntent, { kind: "nudge" }> } | null {
  const intent = nudgeFromPointerDrag(drag.startRay, ray, drag.frame);
  if (!intent || Math.hypot(intent.u, intent.v) < 1e-5) return null;
  const result = transformPatch(drag.sourcePatch, state.host, state.hostParams.k, intent);
  return result.ok ? { patch: result.patch, intent } : null;
}

function flushPatchDragPreview(drag: NonNullable<typeof patchDrag>): void {
  drag.frameRequestId = null;
  if (!drag.active || !drag.latestRay || patchDrag !== drag) return;
  const preview = patchDragPreview(drag, drag.latestRay);
  if (!preview) return;
  skinRenderer.updatePatchDragPreview(preview.patch, drag.patchId);
}

function schedulePatchDragPreview(drag: NonNullable<typeof patchDrag>): void {
  if (drag.frameRequestId !== null) return;
  drag.frameRequestId = window.requestAnimationFrame(() => flushPatchDragPreview(drag));
}

function finishPatchDrag(restoreSource = true): void {
  const drag = patchDrag;
  if (drag?.frameRequestId !== null && drag?.frameRequestId !== undefined) {
    window.cancelAnimationFrame(drag.frameRequestId);
  }
  if (restoreSource && drag) skinRenderer.updatePatchBeads(drag.sourcePatch, selectedPatchId);
  skinRenderer.clearPatchDragPreview();
  skinRenderer.setOrbitEnabled(true);
  viewport.classList.remove("patch-dragging");
  directManipulationActive = false;
  patchDrag = null;
}

viewport.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  if (e.button !== 0 || selectedPatchId === null || addPatchMode || seedPickMode) return;
  const ray = pointerRay(e);
  if (fastPatchId(ray) !== selectedPatchId) return;
  const patch = state.patches.find((candidate) => candidate.id === selectedPatchId);
  if (!patch) return;
  const frame = derivePatchSurfaceFrame(patch, state.host, state.hostParams.k);
  if (!frame) return;
  patchDrag = {
    pointerId: e.pointerId,
    patchId: selectedPatchId,
    startX: e.clientX,
    startY: e.clientY,
    startRay: ray,
    frame,
    sourcePatch: patch,
    latestRay: null,
    frameRequestId: null,
    active: false,
  };
  skinRenderer.setOrbitEnabled(false);
});

window.addEventListener("pointermove", (e) => {
  if (!patchDrag || e.pointerId !== patchDrag.pointerId) return;
  if (Math.hypot(e.clientX - patchDrag.startX, e.clientY - patchDrag.startY) <= DRAG_THRESHOLD) return;
  patchDrag.active = true;
  directManipulationActive = true;
  quickEditToolbar.hidden = true;
  patchDrag.latestRay = pointerRay(e);
  schedulePatchDragPreview(patchDrag);
  viewport.classList.add("patch-dragging");
  ui.setElementEditStatus("ドラッグ中｜軽量ビーズで追従・離すと位置を保存", true);
});

window.addEventListener("pointerup", (e) => {
  if (patchDrag && e.pointerId === patchDrag.pointerId) {
    const drag = patchDrag;
    const wasActive = drag.active;
    const finalPreview = wasActive ? patchDragPreview(drag, pointerRay(e)) : null;
    finishPatchDrag(!finalPreview);
    pointerDownPos = null;
    if (wasActive) {
      if (!finalPreview) {
        ui.setElementEditStatus("この向きでは表面上の移動先を決められませんでした", false);
      } else {
        applyElementEdit(drag.patchId, finalPreview.intent, finalPreview.patch);
      }
      return;
    }
    if (eventTargetsViewport(e, viewport)) handleClick(e);
    return;
  }
  if (!pointerDownPos) return;
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  pointerDownPos = null;
  if (Math.hypot(dx, dy) > DRAG_THRESHOLD) return; // was an orbit drag, not a click
  if (!eventTargetsViewport(e, viewport)) return;
  handleClick(e);
});

window.addEventListener("pointercancel", () => {
  pointerDownPos = null;
  if (patchDrag) finishPatchDrag();
});

function handleClick(e: PointerEvent): void {
  const ray = pointerRay(e);

  if (addPatchMode) {
    const hit = raymarchHost(state.host, state.hostParams.k, ray.origin, ray.dir);
    if (!hit) return;
    const proj = projectToSurface(state.host, state.hostParams.k, hit.point.x, hit.point.y, hit.point.z);
    const anchor = proj ?? { x: hit.point.x, y: hit.point.y, z: hit.point.z, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z };
    // Manual patches use the currently selected shape's generator (T11 §1 --
    // "手動追加・削除まで" is in scope for all three shapes, unlike dragging,
    // which stays out of scope). Like the greedy packer's anchor step, the
    // radius does NOT honor `gap` against other patches here (same
    // documented simplification T10 made for manual coin add) -- only the
    // shape's own internal geometry (ring node count, hole ratio, tube
    // radius, wobble) comes from the live skinParams. Once placed, the
    // realized patch can now be moved by arrow keys or surface drag.
    const patchId = freshPatchId();
    const rng = makeRng(hashSeed(`${state.skinParams.seed}-manual-${patchId}`));
    const points = generateShapePoints(
      state.skinParams.patchShape,
      state.host,
      state.hostParams.k,
      anchor,
      manualRadius,
      state.skinParams,
      rng,
      patchId,
      state.patches,
    );
    if (points.length === 0) return;
    const patch: Patch = {
      id: patchId,
      shape: state.skinParams.patchShape,
      motifPlacement: state.skinParams.motifPlacement ?? "surface",
      motifParams: captureMotifShapeParams(state.skinParams),
      points,
    };
    record(history, state, "addPatch", { patch });
    rebuildFlowerIntegration();
    selectedPatchId = patch.id;
    afterMutation();
    return;
  }

  if (seedPickMode) {
    const quickId = fastPatchId(ray);
    const hit = quickId === null ? raymarchComposite(
      state.mode, state.host, state.hostParams.k, state.skinParams.thickness,
      state.patches, state.skinParams.roundK, ray.origin, ray.dir, state.skinParams.coinBulge,
      state.skinParams.coinBulgeBalance,
    ) : null;
    const hitId = quickId ?? hit?.patchId ?? null;
    if (hitId !== null) {
      if (hitId === seedAId) seedAId = null;
      else if (hitId === seedBId) seedBId = null;
      else if (seedAId === null) seedAId = hitId;
      else seedBId = hitId;
      seedPatchIds.clear();
      if (seedAId !== null) seedPatchIds.add(seedAId);
      if (seedBId !== null) seedPatchIds.add(seedBId);
      if (seedAId !== null && seedBId !== null) {
        seedPickMode = false;
        viewport.classList.remove("seed-pick-mode");
        ui.setSeedPickModeActive(false);
      }
      refreshPartitionDraft();
    }
    return;
  }

  const quickId = fastPatchId(ray);
  const hit = quickId === null ? raymarchComposite(
    state.mode,
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    state.patches,
    state.skinParams.roundK,
    ray.origin,
    ray.dir,
    state.skinParams.coinBulge,
    state.skinParams.coinBulgeBalance,
  ) : null;
  const hitId = quickId ?? hit?.patchId ?? null;
  if (hitId !== null) {
    selectedPatchId = hitId === selectedPatchId ? null : hitId;
  } else {
    selectedPatchId = null;
  }
  // Cheap re-color only (no rebuild) -- keeps the bead view's selection in
  // sync even though this path deliberately skips the full afterMutation()
  // (picking doesn't change host/patches, same reasoning as pack/main.ts).
  skinRenderer.updateBeadSelection(selectedPatchId);
  skinRenderer.setElementNames(state.patches, selectedPatchId, showElementNames, hoveredPatchId);
  syncElementRegistry();
  updateSelectionLabel();
  render();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT") return; // don't eat text-field edits
    deleteSelectedPatch();
  }
});

function deleteSelectedPatch(): void {
  if (selectedPatchId === null) return;
  record(history, state, "removePatch", { id: selectedPatchId });
  rebuildFlowerIntegration();
  selectedPatchId = null;
  afterMutation();
}

/** Manual add/delete changes the authored flower set. Recompute either the
 * legacy branch network or the current common surface-fusion radius, then
 * store the realized result; replay never reruns this inference. */
function rebuildFlowerIntegration(): void {
  if (!state.patches.some((patch) => patch.shape === "flower")) return;
  if (state.skinParams.flowerConnectionMode === "direct") {
    const connected = connectFlowerPatchesDirectly(state.host, state.hostParams.k, state.patches);
    record(history, state, "packPatches", { patches: connected.patches, identity: "preserve" });
  } else if (state.skinParams.flowerConnectionMode === "fused") {
    const fused = fuseFlowerPatchesByExpansion(state.patches, state.skinParams.flowerExpansion);
    record(history, state, "packPatches", { patches: fused.patches, identity: "preserve" });
  }
}

function updateSelectionLabel(): void {
  const p = selectedPatchId === null ? null : state.patches.find((p) => p.id === selectedPatchId) ?? null;
  syncQuickEditAvailability();
  syncElementRegistry();
  // T12: these are raymarch-only limits (GLSL uniform-array budgets --
  // shaders.ts's HOST_MAX_BALLS/PATCH_MAX_COUNT/PATCH_MAX_POINTS). Beads and
  // the full-mesh view have no such cap, so showing this warning there would
  // be dishonest (AGENTS §6) -- it would describe a limitation that view
  // doesn't actually have.
  const isRaymarch = viewMode === "raymarch";
  const hostCap =
    isRaymarch && state.host.length > HOST_MAX_BALLS
      ? ` ⚠ 画面はホスト最初の${HOST_MAX_BALLS}球のみ表示（全${state.host.length}球はSTL/検査には含まれる）`
      : "";
  const totalPoints = state.patches.reduce((s, pp) => s + pp.points.length, 0);
  const patchCap =
    isRaymarch && state.patches.length > PATCH_MAX_COUNT
      ? ` ⚠ 画面はパッチ最初の${PATCH_MAX_COUNT}個のみ表示（全${state.patches.length}個はSTL/検査には含まれる）`
      : "";
  // T11 §環境の注意: 立体リングは球数が嵩む (each ring has ringNodeCount
  // nodes vs. a coin's 4-9 sub-points) -- shaders.ts's uniform-array budget
  // (PATCH_MAX_POINTS) is a real ceiling on what the RAYMARCH VIEWPORT can
  // show, so report it honestly rather than silently truncating. T12: only
  // shown in raymarch mode -- beads mode is exactly the escape hatch this
  // limit motivated (see ui.ts's renderViewMode "beads" caption).
  const pointCap =
    isRaymarch && totalPoints > PATCH_MAX_POINTS
      ? ` ⚠ 画面は点群の先頭${PATCH_MAX_POINTS}個のみ表示（全${totalPoints}点はSTL/検査には含まれる。「ビーズ」表示に切り替えると全量が見えます）`
      : "";
  let partitionInfo = "";
  if (p) {
    // T13 audit fix (instruction §2 "UI情報"): ID/shape/group/seed/neighbor
    // IDs/degree/min clearance for the selected patch. Adjacency is
    // recomputed fresh (not from the possibly-stale lastAdjacencyEdges left
    // over from the last "提案" click) so this always reflects the CURRENT
    // patch set. Only selected-vs-other pairs are measured; rebuilding the
    // complete O(n²) graph on every click/nudge caused avoidable stalls.
    const edges = buildPatchAdjacencyForPatch(state.patches, p.id, state.skinParams.roundK);
    const neighborEdges = edges.filter((e) => e.aId === p.id || e.bId === p.id);
    const neighborIds = neighborEdges.map((e) => (e.aId === p.id ? e.bId : e.aId));
    const minClearance = neighborEdges.length ? Math.min(...neighborEdges.map((e) => e.distance)) : null;
    const group = draftGroupA.has(p.id) ? "A" : draftGroupB.has(p.id) ? "B" : "未割当";
    const seedText = p.id === seedAId ? "・A端" : p.id === seedBId ? "・B端" : "";
    partitionInfo =
      ` / 群=${group}${seedText} / 隣接${neighborEdges.length}個` +
      (neighborIds.length ? ` (ID ${neighborIds.join(",")})` : "") +
      (minClearance === null ? "" : ` / 最小clearance ${minClearance.toFixed(4)}`);
  }
  ui.setSelectionInfo(
    (p ? `選択中: ${elementDisplayName("surface", p.shape, p.id)}（点${p.points.length}個）${partitionInfo}` : "選択なし") +
      hostCap + patchCap + pointCap,
  );
  ui.setCounts(state.host.length, state.patches.length);
  updateOperationFocus();
}

function syncElementRegistry(): void {
  ui.setElementRegistry(
    state.patches.map((patch) => {
      const reference: SurfaceElementReference = { domain: "surface", setRevision: state.patchSetRevision, patchId: patch.id };
      return { id: patch.id, name: elementDisplayName("surface", patch.shape, patch.id), annotation: annotationFor(state.annotations, reference) };
    }),
    selectedPatchId,
  );
  const selectedPatch = selectedPatchId === null ? null : state.patches.find((patch) => patch.id === selectedPatchId) ?? null;
  const eligibility = selectedPatch
    ? editEligibility(state.patches, selectedPatch.id)
    : { ok: false, reason: "要素を選ぶと、この要素だけ更新できます" };
  ui.setSelectedMotif(selectedPatch, state.skinParams, eligibility);
}

// --- T14 selection visibility (作者Observation 2026-07-20 "選択してA/Bに
// 変更するときに選択しているものの表示を変えないと選択できているのかわから
// ない") -----------------------------------------------------------------

/** 優先順位: 端点選択モード（明示的に開始された操作）> A/B操作文脈での通常
 * Patch選択 > 何もない（パッチが無い、手動追加モード中、またはA/B操作を
 * していない通常操作中は何も強調しない）。
 *
 * inPartitionContext はここでは決めず main.ts 側の呼び出し元で導出する
 * （derivePartitionViewportFocus の doc comment 参照 -- UI更新への循環
 * 呼出しを作らないため、この関数自体はUIを一切読み書きしない）。 */
function computeViewportFocus(): ReturnType<typeof derivePartitionViewportFocus> {
  const inPartitionContext =
    seedPickMode ||
    draftGroupA.size + draftGroupB.size > 0 ||
    state.partition !== null ||
    (tutorialUi.open && derivePartitionTutorialStep(buildTutorialSnapshot()) === 5);
  return derivePartitionViewportFocus({
    addPatchMode,
    seedPickMode,
    seedAPicked: seedAId !== null,
    hasPatches: state.patches.length > 0,
    inPartitionContext,
    hasSelection: selectedPatchId !== null,
  });
}

/** Viewport chip/frame naming "the next thing to do" (instruction §2.3/2.4),
 * plus the A/B panel's always-visible selection line + button enable state
 * + row emphasis (§2.2/2.3). Cheap DOM-only work -- safe to call after every
 * relevant mutation rather than threading a dedicated call through each one. */
function updateOperationFocus(): void {
  const focus = computeViewportFocus();
  viewport.classList.remove("focus-wait", "focus-seed-a", "focus-seed-b");
  switch (focus) {
    case "hidden":
      viewportChip.hidden = true;
      break;
    case "no-selection":
      viewport.classList.add("focus-wait");
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-wait";
      viewportChip.textContent = "① coinをクリック";
      break;
    case "selected":
      // Frame intentionally NOT re-added here -- instruction §2.3
      // "viewportの強調枠を解除する" once a patch is selected; the chip
      // stays (repurposed) and the A/B row takes over as the primary cue.
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-selected";
      viewportChip.textContent = "② AかBを押す";
      break;
    case "seed-a-wait":
      viewport.classList.add("focus-seed-a");
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-seed-a";
      viewportChip.textContent = "A端をクリック";
      break;
    case "seed-b-wait":
      viewport.classList.add("focus-seed-b");
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-seed-b";
      viewportChip.textContent = "B端をクリック";
      break;
  }

  const info =
    selectedPatchId === null
      ? null
      : { id: selectedPatchId, group: resolvePartitionSelectionGroup(selectedPatchId, [...draftGroupA], [...draftGroupB]) };
  ui.setPartitionSelectedPatch(info);
  // T15 P1: the row's static emphasis border must track FOCUS (i.e. "am I
  // in an A/B workflow context"), not selection alone -- selecting a patch
  // during ordinary Pack/delete/mesh work must not visually promote A/B
  // assignment to "the" primary action.
  ui.setPartitionActionEmphasis(focus === "selected");
}

/** A/Bエンドポイントの3Dバッジ位置を更新する（instruction §2.4）。各patchの
 * points[0]を表示用の安定した代表点として使う。穴あきコインでは中心ではなく
 * 外周の第1点だが、バッジは形状IDの目印なので幾何中心を要求しない。 */
function updateEndpointBadges(): void {
  const posOf = (id: number | null): { x: number; y: number; z: number } | null => {
    if (id === null) return null;
    const patch = state.patches.find((pp) => pp.id === id);
    const pt = patch?.points[0];
    return pt ? { x: pt.x, y: pt.y, z: pt.z } : null;
  };
  skinRenderer.setEndpointBadges({ A: posOf(seedAId), B: posOf(seedBId) });
}

function clearContactView(message?: string): void {
  const hadReport = lastContactReport !== null;
  lastContactReport = null;
  skinRenderer.updateContactStrength(null, state.skinParams.contactTarget);
  if (message && hadReport) ui.setContactStatus(message);
}

function showContactReport(report: ContactReport, updateStatus = true): void {
  lastContactReport = report;
  if (viewMode !== "beads") setViewMode("beads");
  skinRenderer.updateContactStrength(report.rows, state.skinParams.contactTarget);
  if (!updateStatus) return;
  const c = report.counts;
  ui.setContactStatus(
    `0接点 ${c.zero} / 1接点 ${c.one} / 2接点 ${c.two} / 3以上 ${c.threeOrMore} / ` +
    `弱い花 ${report.weakCount} / 連結群 ${report.componentCount}`,
    report.weakCount === 0,
  );
}

// --- Generation-native N partition ---------------------------------------

function showNPartitionGroups(groups: number[][]): void {
  skinRenderer.updateNBeadGroups(groups.length > 0 ? groups.map((group) => new Set(group)) : null);
  if (groups.length > 0 && viewMode !== "beads") setViewMode("beads");
}

function proposeAndConfirmNPartition(requestedCount: number): void {
  if (state.patches.length < requestedCount) {
    alert(`パッチが${state.patches.length}個しかないため、${requestedCount}分割できません。先にSurface Packingでパッチを増やしてください`);
    return;
  }
  cancelNPartitionBuild();
  cancelPartitionBuild();
  lastAdjacencyEdges = buildPatchAdjacency(state.patches, state.skinParams.roundK);
  const proposal = proposeNGroups(state.patches, lastAdjacencyEdges, requestedCount);
  draftNGroups = proposal.groups.map((group) => [...group]);
  nSeedIds = [...proposal.seedIds];
  const selection: NPartitionSelection = {
    groups: draftNGroups.map((group) => [...group]),
    seedIds: [...nSeedIds],
    adjacencyThreshold: Math.max(0.001, state.skinParams.roundK * 0.5),
    confirmedAt: new Date().toISOString(),
  };
  record(history, state, "confirmNPartition", { selection });
  // N and legacy A/B are intentionally exclusive authoring paths.
  draftGroupA = new Set();
  draftGroupB = new Set();
  seedPatchIds.clear();
  seedAId = null;
  seedBId = null;
  partitionResult = null;
  nPartitionResult = null;
  nPartitionGeneration++;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setNPartitionExportEnabled(false);
  ui.setNPartitionMetrics("");
  ui.setNPartitionProposal(
    draftNGroups.map((group, index) => `部品${index + 1}: ${group.length}パッチ`).join(" / "),
    draftNGroups.length,
  );
  ui.setNPartitionStatus("N色に分けて履歴へ記録しました。色を確認してから生成してください");
  updateEndpointBadges();
  showNPartitionGroups(draftNGroups);
  syncUndoHistory();
  render();
}

function invalidateNPartitionResult(message: string): void {
  if (!nPartitionResult && !activeNPartitionWorker) return;
  nPartitionGeneration++;
  if (activeNPartitionWorker) {
    activeNPartitionWorker.terminate();
    activeNPartitionWorker = null;
  }
  nPartitionResult = null;
  ui.setNPartitionBuildRunning(false);
  ui.setNPartitionExportEnabled(false);
  ui.setNPartitionMetrics("");
  ui.setNPartitionStatus(message, false);
}

function cancelNPartitionBuild(): void {
  if (!activeNPartitionWorker) return;
  nPartitionGeneration++;
  activeNPartitionWorker.terminate();
  activeNPartitionWorker = null;
  ui.setNPartitionBuildRunning(false);
  ui.setNPartitionStatus("N分割の生成をキャンセルしました");
}

function formatNPartitionMetrics(result: NPartitionResult): string {
  const topology = result.verification.topologyOk ? "水密確認OK" : "水密確認NG";
  const components = result.verification.singleComponentParts ? "各部品1連結" : "複数の塊を含む部品あり";
  const ratio = result.verification.volumeRatio === null
    ? "計算不可"
    : `${(result.verification.volumeRatio * 100).toFixed(2)}%`;
  return [
    ...result.parts.map((part) =>
      `部品${part.index}: ${part.patchIds.length}パッチ / ${part.connectedComponents}連結 / ${part.mesh.triangles.length.toLocaleString()}面 / 水密=${part.savedTopology.ok}`),
    `全体: ${topology} / ${components} / 元形状との体積差 ${ratio}`,
    "注意: 実メッシュ同士の重複・隙間検査はN版では未実装のため、保存物は検証用です",
  ].join("\n");
}

function buildNPartition(): void {
  if (!state.nPartition || state.nPartition.groups.length === 0) {
    alert("先に分割数を選び、『N色の分け方を提案・確定』を押してください");
    return;
  }
  if (activeNPartitionWorker) return;
  const requestId = ++nPartitionRequestId;
  const generation = nPartitionGeneration;
  const worker = new Worker(new URL("./nPartition.worker.ts", import.meta.url), { type: "module" });
  activeNPartitionWorker = worker;
  nPartitionResult = null;
  ui.setNPartitionBuildRunning(true);
  ui.setNPartitionExportEnabled(false);
  ui.setNPartitionMetrics("");
  ui.setNPartitionStatus("曲面境界のN部品を生成しています…");

  const finish = (): void => {
    if (activeNPartitionWorker === worker) activeNPartitionWorker = null;
    worker.terminate();
    ui.setNPartitionBuildRunning(false);
  };
  worker.onmessage = (event: MessageEvent<NPartitionWorkerMessage>) => {
    const message = event.data;
    if (message.requestId !== requestId) return;
    if (generation !== nPartitionGeneration) {
      finish();
      ui.setNPartitionStatus("形または分け方が変わったため、古い結果を破棄しました", false);
      return;
    }
    if (message.type === "progress") {
      ui.setNPartitionStatus(`${message.stage}…（${(message.elapsedMs / 1000).toFixed(1)}秒）`);
      return;
    }
    finish();
    if (message.type === "error") {
      ui.setNPartitionStatus(`生成失敗: ${message.message}`, false);
      return;
    }
    nPartitionResult = message.result;
    const verified = message.result.verification.topologyOk &&
      message.result.verification.singleComponentParts &&
      message.result.verification.volumeWithinTolerance;
    ui.setNPartitionStatus(
      `N部品を生成しました（${(message.elapsedMs / 1000).toFixed(1)}秒）。${verified ? "基本検査OK" : "要確認"}`,
      verified,
    );
    ui.setNPartitionMetrics(formatNPartitionMetrics(message.result));
    ui.setNPartitionExportEnabled(true);
    showNPartitionGroups(state.nPartition?.groups ?? draftNGroups);
  };
  worker.onerror = (event) => {
    finish();
    ui.setNPartitionStatus(`生成失敗: ${event.message}`, false);
  };
  const request: NPartitionBuildRequest = {
    type: "build-n",
    requestId,
    mode: state.mode,
    host: state.host,
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches,
    groups: state.nPartition.groups.map((group) => [...group]),
    roundK: state.skinParams.roundK,
    options: ui.getMeshOptions(),
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
  };
  worker.postMessage(request);
}

async function exportNPartition(): Promise<void> {
  if (!nPartitionResult || !state.nPartition) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const baseName = `yohaku-skin-n${nPartitionResult.parts.length}-VERIFICATION-${stamp}`;
  const outputs = [] as Array<{ filename: string; sha256: string; part: number }>;
  for (const part of nPartitionResult.parts) {
    const filename = `${baseName}-part-${String(part.index).padStart(2, "0")}.stl`;
    const bytes = encodeBinaryStl(part.mesh, filename);
    outputs.push({ filename, sha256: await sha256Hex(bytes), part: part.index });
    downloadBlob(new Blob([bytes], { type: "model/stl" }), filename);
  }
  downloadBlob(new Blob([serializeRecipe(history)], { type: "application/json" }), `${baseName}.recipe.json`);
  const provenance = {
    generatedAt: new Date().toISOString(),
    tool: { name: "Katachi S-skin", version: manifest.version, updatedAt: manifest.updatedAt },
    method: "generation-native patch-graph N ownership; no planar cutter",
    verificationOnly: true,
    mode: state.mode,
    shapeParameters: {
      thickness: state.skinParams.thickness,
      roundK: state.skinParams.roundK,
      coinBulge: state.skinParams.coinBulge,
      coinBulgeBalance: state.skinParams.coinBulgeBalance,
      quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    },
    selection: state.nPartition,
    inputRecipe: { filename: importedRecipeFilename, sha256: importedRecipeSha256 },
    outputs,
    result: {
      resolution: nPartitionResult.resolution,
      targetLongestMm: nPartitionResult.targetLongestMm,
      scaleMmPerUnit: nPartitionResult.scaleMmPerUnit,
      originalSavedTopology: nPartitionResult.originalSavedTopology,
      originalVolumeMm3: nPartitionResult.originalVolumeMm3,
      volumeDiffMm3: nPartitionResult.volumeDiffMm3,
      verification: nPartitionResult.verification,
      parts: nPartitionResult.parts.map((part) => ({
        index: part.index,
        patchIds: part.patchIds,
        connectedComponents: part.connectedComponents,
        faceCount: part.mesh.triangles.length,
        savedTopology: part.savedTopology,
        volumeMm3: part.volumeMm3,
        mmBounds: part.mesh.mmBounds,
      })),
    },
  };
  downloadBlob(new Blob([JSON.stringify(provenance, null, 2)], { type: "application/json" }), `${baseName}-provenance.json`);
}

// --- T13 coin由来A/B分割 ----------------------------------------------------
// 作者裁定 codex-instruction-20260719-katachi-coin-ab-partition.md: seedから
// 隣接グラフでA候補を提案し（proposeGroupsFromSeeds）、作者が個別パッチを
// 上書きしてから明示的に「確定」して初めて履歴（confirmPartition）へ記録する。
// 確定後、物理分割（buildPartitionMeshes, ownership field）でA/Bそれぞれの
// watertightメッシュを作る。どちらの群が本体/不要かは一切判定しない。

/** If nothing has been proposed/edited yet, start the working draft from the
 * last CONFIRMED partition (so re-opening the panel to tweak one patch
 * doesn't lose the rest), or otherwise put every patch in B (so assigning a
 * single patch to A is a one-click "peel this one off" action instead of
 * requiring a full proposal first). */
function ensureDraftInitialized(): void {
  if (draftGroupA.size > 0 || draftGroupB.size > 0) return;
  if (state.partition) {
    draftGroupA = new Set(state.partition.groupA);
    draftGroupB = new Set(state.partition.groupB);
  } else {
    draftGroupB = new Set(state.patches.map((p) => p.id));
  }
}

function refreshPartitionDraft(): void {
  // Drop any draft membership for patches that no longer exist (e.g. deleted
  // since the draft was built) so counts/coloring stay honest.
  const known = new Set(state.patches.map((p) => p.id));
  for (const id of [...draftGroupA]) if (!known.has(id)) draftGroupA.delete(id);
  for (const id of [...draftGroupB]) if (!known.has(id)) draftGroupB.delete(id);
  for (const id of [...seedPatchIds]) if (!known.has(id)) seedPatchIds.delete(id);
  if (seedAId !== null && !known.has(seedAId)) seedAId = null;
  if (seedBId !== null && !known.has(seedBId)) seedBId = null;

  const a = draftGroupA.size;
  const b = draftGroupB.size;
  const unassigned = state.patches.length - a - b;
  const seedText = `A端 ${seedAId === null ? "未選択" : `#${seedAId}`} / B端 ${seedBId === null ? "未選択" : `#${seedBId}`}`;
  ui.setPartitionDraftInfo(
    `${seedText} / A候補 ${a}個 / B候補 ${b}個` +
      (unassigned > 0 ? ` / 未割当 ${unassigned}個（未確定・警告色で表示）` : ""),
  );
  skinRenderer.updateBeadGroups(a + b > 0 ? { A: new Set(draftGroupA), B: new Set(draftGroupB) } : null);
  updateEndpointBadges();
  updateOperationFocus();
  refreshPartitionTutorial();
  render();
}

/** Discard whatever endpoint selection is in progress (seedA/B, the seed
 * highlight set, and any A/B draft derived from it), invalidate any stale
 * partition build/result via the existing safe path, and refresh every
 * dependent display (badges, bead colors, tutorial, viewport focus) from
 * the same now-cleared state. Shared by onClearSeeds ("clear") and
 * onToggleSeedPickMode(false) when cancelling an INCOMPLETE selection
 * (selection-final-polish P0) -- 「中止」 must discard the half-picked
 * endpoint entirely, not just hide the viewport chrome while seedAId and
 * its badge silently survive underneath. */
function discardEndpointSelection(): void {
  seedPatchIds.clear();
  seedAId = null;
  seedBId = null;
  draftGroupA = new Set();
  draftGroupB = new Set();
  invalidateStalePartitionResult();
  refreshPartitionDraft();
}

function buildTutorialSnapshot(): PartitionTutorialSnapshot {
  const a = draftGroupA.size;
  const b = draftGroupB.size;
  const unassigned = Math.max(0, state.patches.length - a - b);
  return {
    patchCount: state.patches.length,
    seedPickMode,
    seedAId,
    seedBId,
    draftACount: a,
    draftBCount: b,
    unassignedCount: unassigned,
    // "confirmed" must mean THIS exact draft was confirmed, not merely that
    // something was confirmed at some point -- a draft edited after
    // confirming (propose again, move one patch, reselect endpoints) must
    // fall back to step 6, not keep showing build/export as if nothing changed.
    confirmed: draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition),
    workerRunning: activePartitionWorker !== null,
    hasResult: partitionResult !== null,
    gateOk: partitionResult?.gate.ok ?? false,
    visualReviewed: tutorialUi.visualReviewed,
    manualReviewed: tutorialUi.manualReviewed,
  };
}

function persistAndRefreshTutorial(): void {
  saveTutorialPersistedUi(tutorialUi);
  refreshPartitionTutorial();
}

/** State-driven guide step + highlight. Safe to call often; no geometry side effects. */
function refreshPartitionTutorial(): void {
  const raw = buildTutorialSnapshot();
  const corrected = correctTutorialFlags(raw, tutorialUi);
  if (
    corrected.visualReviewed !== tutorialUi.visualReviewed ||
    corrected.manualReviewed !== tutorialUi.manualReviewed
  ) {
    tutorialUi = { ...tutorialUi, ...corrected };
    saveTutorialPersistedUi(tutorialUi);
  }
  const snapshot: PartitionTutorialSnapshot = {
    ...raw,
    visualReviewed: tutorialUi.visualReviewed,
    manualReviewed: tutorialUi.manualReviewed,
  };
  const actualStep = derivePartitionTutorialStep(snapshot);
  // If the real workflow regressed below wherever the author was reading
  // (e.g. reselecting endpoints while browsing a past step), stop pinning to
  // a step the workflow hasn't even reached anymore.
  tutorialDisplayedStep = normalizeDisplayedStep(actualStep, tutorialDisplayedStep);
  // Once the real workflow catches up to wherever the author was reading,
  // resume following it automatically instead of staying pinned to the past.
  if (tutorialDisplayedStep === actualStep) tutorialDisplayedStep = null;
  const displayedStep = tutorialDisplayedStep ?? actualStep;
  const nav = deriveTutorialNavState(actualStep, displayedStep, {
    visualReviewed: tutorialUi.visualReviewed,
    manualReviewed: tutorialUi.manualReviewed,
  });
  ui.setPartitionTutorial({
    open: tutorialUi.open,
    step: nav.displayedStep,
    actualStep,
    isViewingPast: nav.isViewingPast,
    canPrev: nav.canPrev,
    canAdvance: nav.canAdvance,
    advanceMode: nav.advanceMode,
  });
}

function tutorialOpen(): void {
  tutorialUi = { ...tutorialUi, open: true };
  tutorialDisplayedStep = null; // reopen showing the real step, not a stale browsed page
  persistAndRefreshTutorial();
}

function tutorialClose(): void {
  tutorialUi = { ...tutorialUi, open: false };
  persistAndRefreshTutorial();
}

function tutorialPrev(): void {
  // View-only: turn the displayed page back one step. Never touches
  // geometry/history/draft, and never mutates visualReviewed/manualReviewed
  // -- those are real-workflow flags, not reading position.
  const actualStep = derivePartitionTutorialStep(buildTutorialSnapshot());
  const current = tutorialDisplayedStep ?? actualStep;
  const target = Math.max(1, current - 1) as TutorialStepId;
  tutorialDisplayedStep = target === actualStep ? null : target;
  refreshPartitionTutorial();
}

function tutorialAdvance(): void {
  const actualStep = derivePartitionTutorialStep(buildTutorialSnapshot());
  const displayedStep = tutorialDisplayedStep ?? actualStep;
  if (displayedStep !== actualStep) {
    // Browsing a past step: 次へ only turns the page, at most back up to the
    // real position -- it must not set review flags for a step the real
    // workflow isn't actually standing on right now.
    const target = Math.min(actualStep, displayedStep + 1) as TutorialStepId;
    tutorialDisplayedStep = target === actualStep ? null : target;
    refreshPartitionTutorial();
    return;
  }
  // At the real step: this is the only place visualReviewed/manualReviewed
  // may change, and only for the step the workflow is actually asking about.
  if (actualStep === 4) {
    tutorialUi = { ...tutorialUi, visualReviewed: true };
  } else if (actualStep === 5) {
    tutorialUi = { ...tutorialUi, manualReviewed: true };
  }
  persistAndRefreshTutorial();
}

function tutorialRestart(): void {
  // View-only: jump the displayed page to Step 1. Does not reset the real
  // workflow (visualReviewed/manualReviewed, draft, confirm, or build state).
  tutorialDisplayedStep = 1;
  refreshPartitionTutorial();
}

function tutorialReturnToCurrent(): void {
  tutorialDisplayedStep = null;
  refreshPartitionTutorial();
}

/** Any draft edit (propose again, manual A/B move, reselecting endpoints)
 * invalidates whatever a previous build (partitionResult) or an IN-FLIGHT
 * build (activePartitionWorker) was computing -- both were derived from
 * whatever state.partition/draft looked like at the time, and no longer
 * correspond to what's now on screen. Clears them and the export links so
 * the author can never export -- or silently receive -- a result for a
 * configuration that isn't the one currently shown. Does not touch
 * state.partition (the confirmed history record) itself.
 *
 * Deliberately does NOT early-return just because partitionResult is null:
 * partitionResult IS null for the entire duration a build Worker is running
 * (buildPartition() sets it null at the start), so an early return on that
 * alone would let partitionGeneration go unbumped while a build is in
 * flight -- exactly the P0 bug this closes (post-limit-audit-fixes'
 * inflight-draft-fix round; see README Observation v0.11). An in-flight
 * Worker is terminated immediately, not just outrun via the generation
 * check, so a late message from it can never be adopted even if the
 * generation comparison were ever bypassed.
 *
 * Always invalidates unconditionally rather than diffing old/new draft
 * membership first (a redundant "already in that group" click only costs a
 * rare extra re-confirm+rebuild; skipping invalidation risks resurrecting
 * this exact bug) -- see README Observation v0.11 for that trade-off. The
 * status text, however, DOES check whether the post-edit draft still matches
 * the last confirmed configuration (draftMatchesConfirmedPartition) so it
 * can honestly tell the author whether a re-confirm is actually required or
 * whether the edit was a no-op relative to history and only a rebuild is
 * needed (invalidation-status-honesty round; see README Observation v0.11). */
function invalidateStalePartitionResult(): void {
  const hadResult = partitionResult !== null;
  const hadRunningWorker = activePartitionWorker !== null;
  if (!hadResult && !hadRunningWorker) return; // nothing was ever built or building

  partitionGeneration++;
  if (activePartitionWorker) {
    activePartitionWorker.terminate();
    activePartitionWorker = null;
    ui.setPartitionBuildRunning(false);
  }
  partitionResult = null;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  const stillConfirmed = draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition);
  ui.setPartitionStatus(describePartitionInvalidationStatus(hadRunningWorker, stillConfirmed), false);
  refreshPartitionTutorial();
}

/** T14 §3.2 (extended to thickness/roundK, see onSkinParamChange's doc
 * comment): thickness/roundK/coinBulge are field-shape parameters read live
 * by compositeSdf for every existing patch, so changing any of them stales
 * a built partition result/Worker exactly like a draft edit does -- but the
 * REASON is different (the shape changed under an unchanged A/B grouping,
 * not the grouping itself), so the status text must say so honestly rather
 * than reusing invalidateStalePartitionResult()'s "A/B変更" wording, which
 * would incorrectly suggest the author edited the draft. Reuses
 * invalidateStalePartitionResult()'s generation-bump/Worker-terminate/
 * result-export-metrics-clear mechanics unmodified (does not touch
 * state.partition or the draft groups) and only overrides the status text
 * afterward, and only when something was actually invalidated (avoids a
 * status flash when nothing was ever built). */
function invalidateStaleResultForShapeParamChange(): void {
  const hadSomethingToInvalidate = partitionResult !== null || activePartitionWorker !== null;
  invalidateStalePartitionResult();
  if (hadSomethingToInvalidate) {
    ui.setPartitionStatus("形状設定が変わったため、同じA/B構成でも物理分割をもう一度実行してください", false);
  }
}

function confirmPartition(): void {
  const unassigned = state.patches.filter((p) => !draftGroupA.has(p.id) && !draftGroupB.has(p.id));
  if (draftGroupA.size === 0 || draftGroupB.size === 0 || unassigned.length > 0) {
    alert("A/Bとも1個以上、かつ全パッチを重複・未割当なく割り当ててから確定してください");
    return;
  }
  const selection: PartitionSelection = {
    groupA: [...draftGroupA],
    groupB: [...draftGroupB],
    seedIds: [seedAId, seedBId].filter((id): id is number => id !== null),
    adjacencyThreshold: Math.max(0.001, state.skinParams.roundK * 0.5),
    confirmedAt: new Date().toISOString(),
  };
  record(history, state, "confirmPartition", { selection });
  partitionResult = null;
  partitionGeneration++;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  ui.setPartitionStatus("確定しました。「確定したA/Bを物理分割してメッシュ化」を押してください");
  afterMutation();
}

function buildPartition(): void {
  if (!state.partition) {
    alert("先にA/B構成を確定してください");
    return;
  }
  // The screen's color split (draftGroupA/B, via updateBeadGroups) can drift
  // from state.partition if the author edited the draft after confirming
  // without re-confirming. Re-check right before computing so the build
  // never silently uses a stale confirmed configuration that no longer
  // matches what's on screen.
  if (!draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition)) {
    alert("A/Bを変更したため、もう一度「確定」してください");
    ui.setPartitionStatus("A/Bを変更したため、もう一度「確定」してください", false);
    refreshPartitionTutorial();
    return;
  }
  if (activePartitionWorker) {
    alert("既に分割を実行中です。完了かキャンセルを待ってください（二重実行防止）");
    return;
  }
  const requestId = ++partitionRequestId;
  const generation = partitionGeneration;
  const worker = new Worker(new URL("./partition.worker.ts", import.meta.url), { type: "module" });
  activePartitionWorker = worker;
  partitionResult = null;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  ui.setPartitionBuildRunning(true);
  ui.setPartitionStatus("Workerへ計算を送信しています…");
  refreshPartitionTutorial();

  // gate-correction P1-2: every exit path terminates the Worker (a Worker
  // that merely posts a result message stays alive/idle otherwise -- the
  // previous round only terminated it on the error/stale paths).
  const finish = (): void => {
    if (activePartitionWorker === worker) activePartitionWorker = null;
    worker.terminate();
    ui.setPartitionBuildRunning(false);
  };

  worker.onmessage = (event: MessageEvent<PartitionWorkerMessage>) => {
    const msg = event.data;
    if (msg.requestId !== requestId) return; // a stale worker's leftover message
    if (generation !== partitionGeneration) {
      // Patches/confirmation changed while this build was running. P1-2:
      // terminate THE MOMENT this is detected, even mid-progress -- don't
      // let a doomed computation run to completion just because the final
      // message hasn't arrived yet.
      finish();
      ui.setPartitionStatus("パッチ/確定が変更されたため、実行中だった結果を破棄しました");
      refreshPartitionTutorial();
      return;
    }
    if (msg.type === "progress") {
      ui.setPartitionStatus(`${msg.stage}… (経過 ${(msg.elapsedMs / 1000).toFixed(1)}秒)`);
      refreshPartitionTutorial();
      return;
    }
    finish();
    if (msg.type === "error") {
      ui.setPartitionMetrics("");
      ui.setPartitionStatus(`失敗（経過 ${(msg.elapsedMs / 1000).toFixed(1)}秒）: ${msg.message}`, false);
      refreshPartitionTutorial();
      return;
    }
    partitionResult = msg.result;
    const gate = msg.result.gate;
    ui.setPartitionStatus(
      `完了（経過 ${(msg.elapsedMs / 1000).toFixed(1)}秒） / 元形状(保存後)=${msg.result.originalSavedTopology.ok} / A(保存後)=${msg.result.a.savedTopology.ok} / B(保存後)=${msg.result.b.savedTopology.ok} / ${gate.ok ? "通常書き出し可" : "通常書き出し不可"}`,
      gate.ok,
    );
    ui.setPartitionMetrics(formatPartitionMetrics(msg.result));
    ui.setPartitionExportEnabled(gate.ok);
    ui.setPartitionVerificationExportEnabled(true);
    if (state.partition) skinRenderer.updateBeadGroups({ A: new Set(state.partition.groupA), B: new Set(state.partition.groupB) });
    refreshPartitionTutorial();
  };
  worker.onerror = (event) => {
    if (requestId !== partitionRequestId) return;
    finish();
    ui.setPartitionMetrics("");
    ui.setPartitionStatus(`失敗: ${event.message}`, false);
    refreshPartitionTutorial();
  };

  const request: PartitionBuildRequest = {
    type: "build",
    requestId,
    mode: state.mode,
    host: state.host,
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches,
    groupA: state.partition.groupA,
    groupB: state.partition.groupB,
    roundK: state.skinParams.roundK,
    options: ui.getMeshOptions(),
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
  };
  worker.postMessage(request);
}

function cancelPartitionBuild(): void {
  if (!activePartitionWorker) return;
  activePartitionWorker.terminate();
  activePartitionWorker = null;
  ui.setPartitionBuildRunning(false);
  ui.setPartitionStatus("キャンセルしました");
  refreshPartitionTutorial();
}

/** Rough "手が届く/触れる目安" reference -- a bbox extent alone can't tell
 * whether a real hand fits through a narrow opening, so this is presented as
 * a plain size comparison only (instruction §2: "『手が通る』『サポートを
 * 除去できる』と判定しない"). */
const HAND_ACCESS_REFERENCE_MM = [100, 125, 150] as const;

function formatPartitionMetrics(r: PartitionResult): string {
  const mm3 = (v: number) => v.toFixed(2);
  const mm2 = (v: number) => v.toFixed(2);
  const pct = (v: number) => (v * 100).toFixed(2);
  const bboxText = (b: PartitionResult["a"]["mesh"]["mmBounds"]) =>
    `${b.size.x.toFixed(1)} x ${b.size.y.toFixed(1)} x ${b.size.z.toFixed(1)} mm (最長辺 ${b.longest.toFixed(1)} mm)`;
  // winding-volume-final Task 6: "watertight"はOptimizer/trimeshと意味が
  // ずれる（Optimizerのwatertightは境界閉塞のみ、windingを含まない）ため、
  // 閉塞・面方向・退化の3条件を別々に表示する。
  const topologyText = (t: PartitionResult["a"]["savedTopology"]) =>
    `境界閉塞 ${t.closed ? "OK" : "NG"}(開いた辺${t.openEdges}・非多様体辺${t.nonManifoldEdges}) / 面方向整合 ${t.windingConsistent ? "OK" : "NG"}(不整合${t.windingInconsistentEdges}辺) / 退化なし ${t.degenerateFree ? "OK" : "NG"}(${t.degenerateTriangleCount}枚) / 連結成分${t.connectedComponents} / 総合 ${t.ok ? "OK" : "NG"}`;
  const boundaryEquivDiameter = Math.sqrt((4 * r.boundaryAreaMm2) / Math.PI);
  const referenceLine = HAND_ACCESS_REFERENCE_MM.map(
    (mm) => `${mm}mm比: 共有境界の等価直径比 ${(boundaryEquivDiameter / mm).toFixed(2)}倍`,
  ).join(" / ");
  const g = r.gate;
  const quantityLine = (label: string, q: (typeof g)["overlap"], fq: PartitionResult["meshFidelity"]["overlap"]) =>
    `${label}: 点推定 ${mm3(fq.volumeMm3)}mm3 (${pct(q.ratio)}%) / 95%上限 ${mm3(fq.upper95VolumeMm3)}mm3 (${pct(q.upper95Ratio)}%) / 許容${pct(q.toleranceRatio)}% / ${q.ok ? "OK" : "NG"}`;
  const volumeDiffText =
    r.volumeDiffMm3 === null
      ? "無効（元形状/A/Bのいずれかのトポロジーが無効なため計算不可）"
      : `${mm3(r.volumeDiffMm3)} mm3 (${pct(g.volumeDiff.ratio)}%、許容${pct(g.volumeDiff.toleranceRatio)}%、${g.volumeDiff.ok ? "OK" : "NG"})`;
  return [
    `元形状: 体積 ${mm3(r.originalVolumeMm3)} mm3 (符号付き ${r.originalSignedVolumeMm3.toFixed(2)}) / ${topologyText(r.originalSavedTopology)}`,
    `part-A: Patch ${r.a.patchIds.length}個 (ID ${r.a.patchIds.join(",")}) / 体積 ${mm3(r.a.volumeMm3)} mm3 (符号付き ${r.a.signedVolumeMm3.toFixed(2)}) / 面 ${r.a.mesh.triangles.length} / 保存時退化面除去 ${r.a.mesh.removedSavedDegenerateTriangleCount ?? 0}枚 / ${topologyText(r.a.savedTopology)}`,
    `  Scale適用後bbox: ${bboxText(r.a.mesh.mmBounds)}`,
    `part-B: Patch ${r.b.patchIds.length}個 (ID ${r.b.patchIds.join(",")}) / 体積 ${mm3(r.b.volumeMm3)} mm3 (符号付き ${r.b.signedVolumeMm3.toFixed(2)}) / 面 ${r.b.mesh.triangles.length} / 保存時退化面除去 ${r.b.mesh.removedSavedDegenerateTriangleCount ?? 0}枚 / ${topologyText(r.b.savedTopology)}`,
    `  Scale適用後bbox: ${bboxText(r.b.mesh.mmBounds)}`,
    `共通Scale: ${r.scaleMmPerUnit.toFixed(6)} mm/unit（original/A/B共通 = ${g.commonScale}）`,
    `境界面積（三角形走査の近似） ${mm2(r.boundaryAreaMm2)} mm2 / 等価直径（参考値、円と仮定） ${boundaryEquivDiameter.toFixed(1)} mm`,
    `  ${referenceLine}（作者の比較目盛りであり、手が通る/サポートを除去できるの判定ではない）`,
    `体積指標の有効性: ${g.volumeMetricsValid ? "有効（元形状/A/Bとも保存後トポロジー有効）" : "無効（元形状またはA/Bの保存後トポロジーが無効）"}`,
    `A+Bとの体積差: ${volumeDiffText}`,
    `[解析場の整合 fieldConsistency（式の自己矛盾チェック・出力メッシュは未参照・参考値）] 重複 ${mm3(r.fieldConsistency.overlapVolumeMm3)} mm3 / 未割当 ${mm3(r.fieldConsistency.gapVolumeMm3)} mm3 （${r.fieldConsistency.sampleCount}点中${r.fieldConsistency.insideOriginalSamples}点が元形状内）`,
    `[実メッシュ検証 meshFidelity（採用ゲートが見る値・出力三角形を実測、95%上限はWilson score）]`,
    `  重複・未割当は元形状内部サンプルに条件付け、元形状の実体積でスケール。不整合はbbox全体に対する保守的上限を元形状の実体積で割った比率。`,
    `  ${quantityLine("重複（元形状内部でA/B両方）", g.overlap, r.meshFidelity.overlap)}`,
    `  ${quantityLine("未割当（元形状内部だがA/Bどちらでもない）", g.gap, r.meshFidelity.gap)}`,
    `  ${quantityLine("不整合(A/Bにあるが元形状外)", g.inconsistent, r.meshFidelity.inconsistent)}`,
    `  （${r.meshFidelity.sampleCount}点中${r.meshFidelity.insideOriginalSamples}点が元形状内、seed=${r.meshFidelity.seed}、insideOriginalSamplesValid=${g.insideOriginalSamplesValid}）`,
    `ゲート判定: ${g.ok ? "合格（通常書き出し可）" : `不合格: ${g.reasons.join(" / ")}`}`,
  ].join("\n");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 4-file export (instruction §3): `<base>-part-a.stl`, `<base>-part-b.stl`,
 * `<base>-partition.recipe.json` (history including confirmPartition --
 * replay reproduces the identical A/B without re-running any RNG/proposal),
 * `<base>-partition-provenance.json`. `verification=true` bypasses the
 * watertight/overlap/gap gate for an explicitly-labeled "検証用・非合格"
 * output (audit fix P0-3) -- the filename itself carries an UNVERIFIED
 * marker so it can never be mistaken for a normal, gated export. Both
 * sides' metrics are always written to provenance regardless of which
 * STL(s) `parts` actually requests, so "反対側をどう扱ったか" is never lost.
 */
async function exportPartition(parts: Array<"A" | "B">, verification: boolean): Promise<void> {
  if (!partitionResult || !state.partition) return;
  const gate = partitionResult.gate;
  if (!verification && !gate.ok) {
    alert("通常書き出しはwatertight・重複・未割当・体積差が許容値内のときだけ有効です。「検証用として書き出す（非合格）」を使ってください");
    return;
  }
  // gate-correction: previous round's stamp was YYYYMMDD only, colliding
  // with an already-downloaded verification artifact from an earlier round
  // (that file is explicitly kept as-is, not to be overwritten -- see
  // README.md/manifest.json this round's notes). Full to-the-second
  // timestamp avoids any same-day collision.
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const baseName = verification ? `yohaku-skin-partition-UNVERIFIED-${stamp}` : `yohaku-skin-partition-${stamp}`;
  const bytesA = encodeBinaryStl(partitionResult.a.mesh, `${baseName}-part-a`);
  const bytesB = encodeBinaryStl(partitionResult.b.mesh, `${baseName}-part-b`);
  const [stlASha256, stlBSha256] = await Promise.all([sha256Hex(bytesA), sha256Hex(bytesB)]);
  if (parts.includes("A")) downloadBlob(new Blob([bytesA], { type: "model/stl" }), `${baseName}-part-a.stl`);
  if (parts.includes("B")) downloadBlob(new Blob([bytesB], { type: "model/stl" }), `${baseName}-part-b.stl`);
  downloadBlob(new Blob([serializeRecipe(history)], { type: "application/json" }), `${baseName}-partition.recipe.json`);
  // gate-correction: distinguish an actually-downloaded side (real filename,
  // hash of the bytes that were saved) from a side that was only computed
  // in-memory for this export call -- the previous round recorded both
  // sides as if both had been written to disk regardless of `parts`.
  const outputStl = {
    partA: parts.includes("A")
      ? { filename: `${baseName}-part-a.stl`, sha256: stlASha256, saved: true as const }
      : { sha256: stlASha256, saved: false as const, note: "generatedButNotDownloaded" as const },
    partB: parts.includes("B")
      ? { filename: `${baseName}-part-b.stl`, sha256: stlBSha256, saved: true as const }
      : { sha256: stlBSha256, saved: false as const, note: "generatedButNotDownloaded" as const },
  };
  const provenance = {
    generatedAt: new Date().toISOString(),
    tool: { name: "Katachi S-skin", version: manifest.version, updatedAt: manifest.updatedAt },
    mode: state.mode,
    resolution: partitionResult.resolution,
    targetLongestMm: partitionResult.targetLongestMm,
    scaleMmPerUnit: partitionResult.scaleMmPerUnit,
    scaleAssumption: "scaleMmPerUnitはmeshの最長辺をtargetLongestMmへ合わせた結果の倍率であり、実機較正値ではない。original/A/Bは共通のこの倍率でRescaleされている（gate.commonScaleで検証）",
    exportedParts: parts,
    verification,
    // T14 (instruction §3.3): explicit shape parameters, not just implied by
    // inputRecipe -- coinBulge changes the generated field, so a provenance
    // reader must be able to tell WITHOUT replaying the recipe whether this
    // export used the coin-bulge experiment and at what value.
    shapeParameters: {
      thickness: state.skinParams.thickness,
      roundK: state.skinParams.roundK,
      coinBulge: state.skinParams.coinBulge,
      coinBulgeBalance: state.skinParams.coinBulgeBalance,
      quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    },
    gate,
    inputRecipe: { filename: importedRecipeFilename, sha256: importedRecipeSha256 },
    outputStl,
    original: {
      volumeMm3: partitionResult.originalVolumeMm3,
      signedVolumeMm3: partitionResult.originalSignedVolumeMm3,
      savedTopology: partitionResult.originalSavedTopology,
    },
    partA: {
      patchIds: partitionResult.a.patchIds,
      volumeMm3: partitionResult.a.volumeMm3,
      signedVolumeMm3: partitionResult.a.signedVolumeMm3,
      faceCount: partitionResult.a.mesh.triangles.length,
      connectedComponents: partitionResult.a.connectedComponents,
      mmBounds: partitionResult.a.mesh.mmBounds,
      savedTopology: partitionResult.a.savedTopology,
      removedSavedDegenerateTriangleCount: partitionResult.a.mesh.removedSavedDegenerateTriangleCount ?? 0,
    },
    partB: {
      patchIds: partitionResult.b.patchIds,
      volumeMm3: partitionResult.b.volumeMm3,
      signedVolumeMm3: partitionResult.b.signedVolumeMm3,
      faceCount: partitionResult.b.mesh.triangles.length,
      connectedComponents: partitionResult.b.connectedComponents,
      mmBounds: partitionResult.b.mesh.mmBounds,
      savedTopology: partitionResult.b.savedTopology,
      removedSavedDegenerateTriangleCount: partitionResult.b.mesh.removedSavedDegenerateTriangleCount ?? 0,
    },
    originalVolumeMm3: partitionResult.originalVolumeMm3,
    volumeDiffMm3: partitionResult.volumeDiffMm3,
    volumeMetricsValid: gate.volumeMetricsValid,
    boundaryAreaMm2: partitionResult.boundaryAreaMm2,
    fieldConsistency: partitionResult.fieldConsistency,
    meshFidelity: partitionResult.meshFidelity,
    allPatchIds: state.patches.map((p) => p.id),
    seedIds: state.partition.seedIds,
    adjacencyThreshold: state.partition.adjacencyThreshold,
    confirmedAt: state.partition.confirmedAt,
    limitations: [
      "boundaryAreaMm2は三角形走査による近似（解析的な厳密面積ではない）。等価直径は円と仮定した参考値",
      "fieldConsistencyは解析場の自己矛盾チェックであり、出力メッシュそのものの重複・隙間は測っていない",
      "meshFidelityのoverlap/gapは元形状内部サンプルに条件付けたWilson score intervalの95%上側信頼限界を元形状の実体積（符号付き三角形和）でスケールしたもの。inconsistentはサンプリングbbox全体に対する保守的上限を元形状の実体積で割った比率（数式・限界はskin/README.md Observation参照）",
      "savedTopologyはFloat32で丸めた保存後の三角形から判定した値（Float64のin-memory三角形とは異なりうる）。closed/windingConsistent/degenerateFreeがすべて真の場合のみokがtrue",
      "volumeMetricsValid=falseの場合、volumeDiffMm3はnullであり、体積・統計指標は合否判定に使用されていない",
      "ownership fieldはA/B別々のcompositeSdf差分による近似で、真の測地距離分割ではない",
      "100/125/150mm比較値は作者の比較目盛りであり、手が通る/サポートを除去できるの判定ではない",
      "この分割・数値はKatachi生成場からの推定であり、実物の強度・接合可能性・印刷可能性を保証しない",
      verification ? "verification=trueは通常のwatertight/重複/隙間/体積差ゲートを満たしていない出力です。検証・調査以外の用途に使わないでください" : null,
    ].filter((s): s is string => s !== null),
  };
  downloadBlob(
    new Blob([JSON.stringify(provenance, null, 2)], { type: "application/json" }),
    `${baseName}-partition-provenance.json`,
  );
}

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  const json = serializeRecipe(history);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `skin-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyHistoryEntries(entries: SkinHistoryEntry[]): void {
  cancelPartitionBuild();
  cancelNPartitionBuild();
  history = entries;
  state = replay(entries);
  selectedPatchId = null;
  addPatchMode = false;
  viewport.classList.remove("add-patch-mode");
  ui.setAddPatchModeActive(false);
  lastPackResult = null;
  currentQuadGrid = null;
  seedPatchIds.clear();
  seedAId = null;
  seedBId = null;
  if (state.partition) {
    for (const id of state.partition.seedIds) seedPatchIds.add(id);
    seedAId = state.partition.seedIds[0] ?? null;
    seedBId = state.partition.seedIds[1] ?? null;
    draftGroupA = new Set(state.partition.groupA);
    draftGroupB = new Set(state.partition.groupB);
  } else {
    draftGroupA = new Set();
    draftGroupB = new Set();
  }
  if (state.nPartition) {
    draftNGroups = state.nPartition.groups.map((group) => [...group]);
    nSeedIds = [...state.nPartition.seedIds];
    ui.setNPartitionProposal(
      draftNGroups.map((group, index) => `部品${index + 1}: ${group.length}パッチ`).join(" / "),
      draftNGroups.length,
    );
    ui.setNPartitionStatus("確定済みのN分割を読み込みました。曲面部品を生成してください");
  } else {
    draftNGroups = [];
    nSeedIds = [];
    ui.setNPartitionProposal("未提案");
    ui.setNPartitionStatus("未生成");
  }
  partitionResult = null;
  nPartitionResult = null;
  partitionGeneration++;
  nPartitionGeneration++;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  ui.setPartitionStatus(state.partition ? "確定済みのA/Bを読み込みました。物理分割を実行してください" : "未分割");
  ui.setNPartitionExportEnabled(false);
  ui.setNPartitionMetrics("");
  // Recipe change: drop author-review flags so the guide does not stick on
  // a step that no longer matches the loaded state (state wins), and stop
  // browsing any past-step page so the guide shows the new real step.
  tutorialUi = {
    ...tutorialUi,
    visualReviewed: false,
    manualReviewed: false,
  };
  tutorialDisplayedStep = null;
  saveTutorialPersistedUi(tutorialUi);
  ui.syncHostParams(state.hostParams);
  ui.syncSkinParams(state.skinParams);
  ui.setMode(state.mode);
  afterMutation();
  refreshPartitionDraft();
  if (state.nPartition) showNPartitionGroups(state.nPartition.groups);
  refreshPrintProfileSummary();
}

function applyRecipeText(text: string): void {
  importedRecipeText = text;
  applyHistoryEntries(parseRecipe(text));
}

function undoLastOperation(): void {
  const result = undoLastHistoryEntry(history);
  if (!result.undone) {
    ui.setUndoStatus("これ以上戻せません");
    return;
  }
  importedRecipeSha256 = null;
  importedRecipeFilename = null;
  importedRecipeText = null;
  applyHistoryEntries(result.history);
  ui.setUndoStatus("直前の操作を戻しました");
}

function undoSeveralOperations(requestedSteps: number): void {
  const steps = Math.max(1, Math.min(10, Math.round(requestedSteps)));
  const available = Math.max(0, history.length - 1);
  if (available === 0) {
    ui.setUndoStatus("これ以上戻せません");
    return;
  }
  const actual = Math.min(steps, available);
  importedRecipeSha256 = null;
  importedRecipeFilename = null;
  importedRecipeText = null;
  applyHistoryEntries(history.slice(0, history.length - actual));
  ui.setUndoStatus(`${actual}操作前まで戻しました`);
}

function describeHistoryEntry(entry: SkinHistoryEntry): string {
  switch (entry.op) {
    case "growHost": return "ベースを生成";
    case "setHostParam": return "ベースを調整";
    case "loadHostFromS1Recipe": return "ベースを読込";
    case "setSkinParam": return "生成設定を変更";
    case "packPatches": return "表面を生成";
    case "applySurfacePreset": return "高密度花v6スタイルを生成";
    case "addPatch": return "要素を追加";
    case "removePatch": return "要素を削除";
    case "editPatch": return "要素の位置・大きさを調整";
    case "reshapePatch": return "要素の形を調整";
    case "clearPatches": return "要素を消去";
    case "setMode": return "実体モードを変更";
    case "confirmPartition": return "A/B分割を確定";
    case "confirmNPartition": return "N分割を確定";
    case "clearPartition": return "分割を解除";
    case "setAnnotation": return "要素メモを保存";
    case "removeAnnotation": return "要素メモを削除";
    case "clearAll": return "すべて消去";
  }
}

function syncUndoHistory(): void {
  ui.setHistoryCount(history.length);
  ui.setUndoHistory(history.slice(1).map(describeHistoryEntry));
}

async function importHistory(file: File): Promise<void> {
  try {
    const text = await file.text();
    // Captured BEFORE applyRecipeText/replay touches anything -- this is the
    // hash of the exact bytes the author picked, cited in partition
    // provenance as `inputRecipe` (instruction: "入力recipe SHA-256").
    importedRecipeSha256 = await sha256Hex(text);
    importedRecipeFilename = file.name;
    importedRecipeText = text;
    applyRecipeText(text);
  } catch (err) {
    alert(`履歴の読み込みに失敗しました: ${(err as Error).message}`);
  }
}

async function importS1Recipe(file: File): Promise<void> {
  try {
    const text = await file.text();
    const { balls, params } = loadHostFromS1Recipe(text);
    record(history, state, "loadHostFromS1Recipe", { balls, params, source: "S1" });
    ui.syncHostParams(state.hostParams);
    afterMutation();
  } catch (err) {
    alert(`S1 レシピの読み込みに失敗しました: ${(err as Error).message}`);
  }
}

function currentPrintScaleMmPerUnit(): number | undefined {
  const diagnosis = surfaceAngleCache;
  if (!diagnosis) return undefined;
  const sourceLongest = triangleSoupLongestExtent(diagnosis.basePositions);
  const targetLongestMm = ui.getMeshOptions().targetLongestMm;
  return sourceLongest > 0 && targetLongestMm > 0 ? targetLongestMm / sourceLongest : undefined;
}

function currentPrintProfileBinding(profile: SkinPrintProfileV1, includeScale = true) {
  const options = ui.getMeshOptions();
  return {
    recipeSha256: importedRecipeSha256,
    seed: state.hostParams.seed,
    currentInternalStructure: state.skinParams.internalStructure,
    currentDryWebNormalizedRadius: state.skinParams.internalRadius,
    currentTargetLongestMm: options.targetLongestMm,
    currentSurfaceResolution: Math.round(options.resolution),
    currentFusedResolution: profile.geometry.fusedResolution,
    currentAngleThresholdDeg: ui.getSurfaceAngleThreshold(),
    ...(overhangSupportResult ? { currentSupportClassificationCounts: overhangSupportResult.counts } : {}),
    ...(includeScale && currentPrintScaleMmPerUnit() !== undefined ? { scaleMmPerUnit: currentPrintScaleMmPerUnit() } : {}),
  };
}

function refreshPrintProfileSummary(): void {
  if (!activePrintProfile || !activePrintProfileSha256) { ui.setPrintProfileSummary(null); return; }
  const profile = activePrintProfile;
  const match = matchPrintProfile(profile, currentPrintProfileBinding(profile));
  const actualScale = currentPrintScaleMmPerUnit();
  const actualDryWebDiameterMm = actualScale === undefined ? "最終精度診断後に確定" : (state.skinParams.internalRadius * actualScale * 2).toFixed(3) + " mm";
  ui.setPrintProfileSummary({
    profileName: profile.profileName,
    profileSha256: activePrintProfileSha256,
    matches: match.matches,
    status: match.matches ? "現在設定と一致" : match.reasons.join(" / "),
    values: [
      ["読込ファイル", activePrintProfileFilename ?? "画面で作成"],
      ["Support policy", profile.supportPolicy ?? "outside-breakaway-scaffold-inside-dry-web-v1"],
      ["分類 total / inside / outside / unresolved", (() => {
        const counts = overhangSupportResult?.counts ?? profile.expectedClassificationCounts;
        return counts ? `${counts.total} / ${counts.inside} / ${counts.outside} / ${counts.unresolved}` : "診断後に確定";
      })()],
      ["最長辺", profile.geometry.targetLongestMm + " mm"],
      ["Surface / 融合", profile.geometry.surfaceResolution + " / " + profile.geometry.fusedResolution],
      ["角度閾値", profile.geometry.angleThresholdDeg + "°"],
      ["Dry Web 正規化径", String(profile.internalStructure.dryWebNormalizedRadius)],
      ["Dry Web 実寸直径", profile.internalStructure.dryWebPhysicalDiameterMm.toFixed(3) + " mm（現在 " + actualDryWebDiameterMm + "）"],
      ["scaffold 軸 / 足 / 接点", profile.scaffold.shaftDiameterMm.toFixed(2) + " / " + profile.scaffold.footDiameterMm.toFixed(2) + " / " + profile.scaffold.contactDiameterMm.toFixed(2) + " mm"],
      ["scaffold 間隔 / overlap", profile.scaffold.spacingMm.toFixed(2) + " / " + profile.scaffold.contactOverlapMm.toFixed(2) + " mm"],
      ["Printer", profile.printer.printer + " · nozzle " + profile.printer.nozzleMm + " mm · " + profile.printer.material + " · layer " + profile.printer.layerHeightMm + " mm"],
      ["Generator", profile.generatorCommit + (profile.generatorTag ? " · " + profile.generatorTag : "")],
    ],
  });
}

async function importPrintProfile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const profile = validateSkinPrintProfile(JSON.parse(text));
    const sha = await printProfileSha256(profile);
    activePrintProfile = profile; activePrintProfileSha256 = sha; activePrintProfileFilename = file.name; activePrintProfileText = text;
    ui.setMeshOptions({ resolution: profile.geometry.surfaceResolution, targetLongestMm: profile.geometry.targetLongestMm });
    ui.setSurfaceAngleThreshold(profile.geometry.angleThresholdDeg);
    invalidateSurfaceAngleDiagnosis("Print Profileを読み込みました。Profile精度で再診断してください");
    refreshPrintProfileSummary();
  } catch (error) {
    alert("Print Profileの読み込みに失敗しました: " + (error as Error).message);
  }
}

async function saveCurrentPrintProfile(): Promise<void> {
  if (!importedRecipeSha256 || !importedRecipeFilename) { alert("先にShape Recipeを読み込んでください"); return; }
  const scaleMmPerUnit = currentPrintScaleMmPerUnit();
  if (scaleMmPerUnit === undefined || !surfaceAngleCache) { alert("先に最終精度診断を実行してください"); return; }
  if (state.skinParams.internalStructure !== "targetedGrid") { alert("Print Profile v1はDry Web（targetedGrid）に限定しています"); return; }
  if (!overhangSupportResult) { alert("先に共有ポリシーでオーバーハング分類を完了してください"); return; }
  const options = ui.getMeshOptions();
  const dryRadiusMm = state.skinParams.internalRadius * scaleMmPerUnit;
  const scaffold = { ...DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS, baseRadiusMm: 1.2 };
  const profile = validateSkinPrintProfile({
    schema: "katachi.skin.print-profile.v1", profileVersion: 1,
    profileName: (importedRecipeFilename.endsWith(".json") ? importedRecipeFilename.slice(0, -5) : importedRecipeFilename) + " print",
    appVersion: manifest.version, artifactVersion: "v088",
    generatorCommit: import.meta.env.VITE_GIT_COMMIT || "working-tree", generatorTag: null,
    supportPolicy: overhangSupportResult.policy,
    expectedClassificationCounts: overhangSupportResult.counts,
    shapeRecipe: { sha256: importedRecipeSha256, seed: state.hostParams.seed, pathHint: importedRecipeFilename },
    geometry: { targetLongestMm: options.targetLongestMm, surfaceResolution: Math.round(options.resolution), fusedResolution: options.resolution <= 24 ? 32 : Math.max(240, Math.round(options.resolution)), angleThresholdDeg: ui.getSurfaceAngleThreshold() },
    internalStructure: { method: "targetedGrid", dryWebNormalizedRadius: state.skinParams.internalRadius, dryWebPhysicalRadiusMm: dryRadiusMm, dryWebPhysicalDiameterMm: dryRadiusMm * 2 },
    scaffold: { coverageMode: scaffold.coverageMode, perimeterBandMm: scaffold.perimeterBandMm, spacingMm: scaffold.spacingMm,
      shaftRadiusMm: scaffold.shaftRadiusMm, shaftDiameterMm: scaffold.shaftRadiusMm * 2, footRadiusMm: scaffold.baseRadiusMm, footDiameterMm: scaffold.baseRadiusMm * 2,
      contactRadiusMm: scaffold.tipRadiusMm, contactDiameterMm: scaffold.tipRadiusMm * 2, contactOverlapMm: scaffold.contactOverlapMm,
      plateAnchorDropMm: scaffold.plateAnchorDropMm, baseHeightMm: scaffold.baseHeightMm, tipHeightMm: scaffold.tipHeightMm, xyClearanceMm: scaffold.xyClearanceMm, sides: scaffold.sides,
      baseInteriorPolicy: "exclude-host-interior-v1", explicitTargets: [] },
    printer: { printer: "Bambu Lab A1 mini", nozzleMm: 0.4, material: "PLA", layerHeightMm: 0.2, automaticSupport: false, supportType: "normal(manual)" },
    slicer: { application: "Bambu Studio", version: "not-recorded", printerPresetId: "Bambu Lab A1 mini 0.4 nozzle", filamentPresetId: "Generic PLA", processPresetId: "0.20mm Standard BBL A1M" },
    executionHints: { workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) },
  });
  const profileText = JSON.stringify(profile, null, 2) + "\n";
  activePrintProfile = profile; activePrintProfileSha256 = await printProfileSha256(profile); activePrintProfileFilename = null; activePrintProfileText = profileText;
  downloadBlob(new Blob([profileText], { type: "application/json" }), `v088-${importedRecipeFilename.endsWith(".recipe.json") ? importedRecipeFilename.slice(0, -12) : importedRecipeFilename}.print-profile.json`);
  refreshPrintProfileSummary();
}

function internalPrintGateFingerprint(options: MeshUiOptions, graph: InternalStructureGraph): string {
  return JSON.stringify({
    history,
    mode: state.mode,
    resolution: Math.max(16, Math.round(options.resolution)),
    targetLongestMm: options.targetLongestMm,
    graphKind: graph.kind,
    nodes: graph.nodes.map((node) => [
      node.id, node.position.x, node.position.y, node.position.z, node.radius,
    ]),
    edges: graph.edges.map((edge) => [edge.start, edge.end, edge.radius]),
  });
}

function clearInternalPrintGateStatusTimer(): void {
  if (internalPrintGateStatusTimer !== null) window.clearInterval(internalPrintGateStatusTimer);
  internalPrintGateStatusTimer = null;
}

function invalidateInternalPrintGate(message = "未判定 · Internal付き3Dデータは書き出せません"): void {
  clearInternalPrintGateStatusTimer();
  internalPrintGateGeneration++;
  activeInternalPrintGateWorker?.terminate();
  activeInternalPrintGateWorker = null;
  pendingInternalPrintGateFingerprint = "";
  internalPrintGateCache = null;
  ui.setInternalPrintGateRunning(false);
  ui.setInternalPrintGateReport(null);
  ui.setInternalPrintGateExportAllowed(
    state.skinParams.internalStructure === "none",
    state.skinParams.internalStructure !== "none",
  );
  ui.setInternalPrintGateStatus(
    state.skinParams.internalStructure === "none" ? "Internalなし · このゲートは対象外です" : message,
    state.skinParams.internalStructure === "none" ? undefined : false,
  );
}

function startInternalPrintGate(options: MeshUiOptions): void {
  const graph = getInternalStructureGraph();
  if (!graph?.edges.length) {
    ui.setInternalPrintGateReport(null);
    ui.setInternalPrintGateExportAllowed(state.skinParams.internalStructure === "none", state.skinParams.internalStructure !== "none");
    ui.setInternalPrintGateStatus(
      state.skinParams.internalStructure === "targetedGrid"
        ? "NG · 赤点→Dry Webを最終精度診断で生成してから判定してください"
        : "NG · Internal StructureをONにしてから判定してください",
      false,
    );
    return;
  }
  activeInternalPrintGateWorker?.terminate();
  const generation = ++internalPrintGateGeneration;
  const requestId = ++internalPrintGateRequestId;
  const fingerprint = internalPrintGateFingerprint(options, graph);
  if (internalPrintGateCache?.fingerprint === fingerprint) {
    ui.setInternalPrintGateReport(internalPrintGateCache.report);
    ui.setInternalPrintGateExportAllowed(internalPrintGateCache.report.ok, true);
    ui.setInternalPrintGateStatus(
      internalPrintGateCache.report.ok
        ? "内部構造：OK · 前回の同一mesh判定を再利用"
        : `内部構造：NG · 前回の同一mesh判定を再利用（${internalPrintGateCache.report.reasons.length}項目）`,
      internalPrintGateCache.report.ok,
    );
    return;
  }
  const reusablePreview = previewMeshCache?.fingerprint === fingerprint && previewMeshCache.resolution === Math.max(16, Math.round(options.resolution))
    ? previewMeshCache.positions.slice()
    : undefined;
  pendingInternalPrintGateFingerprint = fingerprint;
  internalPrintGateCache = null;
  ui.setInternalPrintGateExportAllowed(false, true);
  ui.setInternalPrintGateReport(null);
  ui.setInternalPrintGateRunning(true);
  const gateStarted = performance.now();
  const gateStage = reusablePreview ? "表示済みの最終meshを再利用して判定中" : "最終meshを並列生成して判定中";
  ui.setInternalPrintGateStatus(`${gateStage} · 0秒`);
  clearInternalPrintGateStatusTimer();
  internalPrintGateStatusTimer = window.setInterval(() => {
    ui.setInternalPrintGateStatus(`${gateStage} · ${Math.floor((performance.now() - gateStarted) / 1000)}秒 · 画面は操作できます`);
  }, 1000);
  const request: InternalPrintGateRequest = {
    type: "check",
    requestId,
    generation,
    host: state.host.map((ball) => ({ ...ball })),
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches.map((patch) => ({
      ...patch,
      motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
      points: patch.points.map((point) => ({ ...point })),
    })),
    internalGraph: graph,
    roundK: state.skinParams.roundK,
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    mode: state.mode,
    resolution: Math.max(16, Math.round(options.resolution)),
    targetLongestMm: options.targetLongestMm,
    workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
    prebuiltPositions: reusablePreview,
    baseName: makeSkinExportBaseName(state.mode, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance),
  };
  const worker = new Worker(new URL("./internalPrintGate.worker.ts", import.meta.url), { type: "module" });
  activeInternalPrintGateWorker = worker;
  worker.onmessage = (event: MessageEvent<InternalPrintGateWorkerMessage>) => {
    const message = event.data;
    if (
      worker !== activeInternalPrintGateWorker || message.requestId !== requestId ||
      message.generation !== internalPrintGateGeneration || pendingInternalPrintGateFingerprint !== fingerprint
    ) {
      worker.terminate();
      return;
    }
    worker.terminate();
    activeInternalPrintGateWorker = null;
    clearInternalPrintGateStatusTimer();
    ui.setInternalPrintGateRunning(false);
    if (message.type === "error") {
      pendingInternalPrintGateFingerprint = "";
      ui.setInternalPrintGateStatus(`NG · 判定できませんでした: ${message.message}`, false);
      ui.setInternalPrintGateExportAllowed(false, true);
      return;
    }
    const currentGraph = getInternalStructureGraph();
    if (!currentGraph || internalPrintGateFingerprint(options, currentGraph) !== fingerprint) {
      pendingInternalPrintGateFingerprint = "";
      ui.setInternalPrintGateStatus("形が変わったため、古い判定結果を破棄しました", false);
      return;
    }
    internalPrintGateCache = { fingerprint, report: message.report, stl: message.stl };
    pendingInternalPrintGateFingerprint = "";
    ui.setInternalPrintGateReport(message.report);
    ui.setInternalPrintGateExportAllowed(message.report.ok, true);
    ui.setInternalPrintGateStatus(
      message.report.ok
        ? `内部構造：OK · 通常の3D書き出しを許可 · ${(message.elapsedMs / 1000).toFixed(1)}秒`
        : `内部構造：NG · ${message.report.reasons.length}項目を直してください · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
      message.report.ok,
    );
  };
  worker.onerror = (event) => {
    if (worker !== activeInternalPrintGateWorker) return;
    worker.terminate();
    activeInternalPrintGateWorker = null;
    pendingInternalPrintGateFingerprint = "";
    clearInternalPrintGateStatusTimer();
    ui.setInternalPrintGateRunning(false);
    ui.setInternalPrintGateStatus(`NG · 判定Workerに失敗しました: ${event.message}`, false);
    ui.setInternalPrintGateExportAllowed(false, true);
  };
  if (request.prebuiltPositions) worker.postMessage(request, [request.prebuiltPositions.buffer]);
  else worker.postMessage(request);
}

function inspectMesh(options: MeshUiOptions): void {
  cancelMeshExport(false);
  const internalGraph = getInternalStructureGraph();
  if (state.skinParams.internalStructure === "targetedGrid" && !internalGraph) {
    ui.setMeshStatus("赤点→Dry Webは最終精度診断の完了後に検査できます", false);
    return;
  }
  const requestId = ++meshExportRequestId;
  const generation = meshExportGeneration;
  const request: MeshExportRequest = {
    type: "export", operation: "inspect", requestId, generation,
    host: state.host.map((ball) => ({ ...ball })), hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches.map((patch) => ({
      ...patch, motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
      points: patch.points.map((point) => ({ ...point })),
    })),
    internalGraph, roundK: state.skinParams.roundK, coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance, quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    mode: state.mode, resolution: Math.max(16, Math.round(options.resolution)),
    targetLongestMm: options.targetLongestMm,
    workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
    baseName: makeSkinExportBaseName(state.mode, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance),
  };
  const worker = new Worker(new URL("./meshExport.worker.ts", import.meta.url), { type: "module" });
  activeMeshExportWorker = worker;
  const started = performance.now();
  ui.setMeshExportRunning(true);
  ui.setMeshStatus("最終meshを並列検査中 · 0秒 · 画面は操作できます");
  meshExportStatusTimer = window.setInterval(() => {
    if (activeMeshExportWorker === worker) ui.setMeshStatus("最終meshを並列検査中 · " + ((performance.now() - started) / 1000).toFixed(1) + "秒 · 画面は操作できます");
  }, 500);
  worker.onmessage = (event: MessageEvent<MeshExportWorkerMessage>) => {
    const message = event.data;
    if (activeMeshExportWorker !== worker || message.requestId !== requestId || message.generation !== meshExportGeneration) return;
    if (message.type === "progress") {
      ui.setMeshStatus(`最終meshを並列検査中 · ${message.completedSlices}/${message.totalSlices} slice · ${message.faceCount.toLocaleString()}面 · ${(message.elapsedMs / 1000).toFixed(1)}秒 · 画面は操作できます`);
      return;
    }
    clearMeshExportWorker();
    if (message.type === "error") {
      ui.setMeshStatus("検査失敗: " + message.message, false);
      return;
    }
    ui.setMeshStatus(message.summary + " / 並列検査 " + (message.elapsedMs / 1000).toFixed(1) + "秒", message.watertightOk);
  };
  worker.onerror = (event) => {
    if (activeMeshExportWorker !== worker) return;
    clearMeshExportWorker();
    ui.setMeshStatus("検査Workerに失敗しました: " + event.message, false);
  };
  worker.postMessage(request);
}

let pendingMeshExport: { requestId: number; generation: number; baseName: string; recipe: string } | null = null;

function clearMeshExportWorker(): void {
  if (activeMeshExportWorker) {
    activeMeshExportWorker.terminate();
    activeMeshExportWorker = null;
  }
  if (meshExportStatusTimer !== null) {
    window.clearInterval(meshExportStatusTimer);
    meshExportStatusTimer = null;
  }
  ui.setMeshExportRunning(false);
}

function cancelMeshExport(notify = false): void {
  const wasRunning = activeMeshExportWorker !== null;
  clearMeshExportWorker();
  pendingMeshExport = null;
  if (notify && wasRunning) ui.setMeshStatus("書き出しをキャンセルしました。形状は変更していません");
}

function exportMesh(options: MeshUiOptions): void {
  cancelMeshExport(false);
  const internalGraph = getInternalStructureGraph();
  if (state.skinParams.internalStructure === "targetedGrid" && !internalGraph) {
    ui.setMeshStatus("赤点→Dry Webは最終精度診断の完了後に書き出せます", false);
    return;
  }
  if (internalGraph?.edges.length) {
    const fingerprint = internalPrintGateFingerprint(options, internalGraph);
    if (!internalPrintGateCache || internalPrintGateCache.fingerprint !== fingerprint) {
      ui.setMeshStatus("書き出し停止: A1 mini条件で内部構造を最終判定してください", false);
      ui.setInternalPrintGateStatus("未判定 · Internal付き3Dデータは書き出せません", false);
      return;
    }
    if (!internalPrintGateCache.report.ok) {
      ui.setMeshStatus(`書き出し停止: 内部構造がNGです（${internalPrintGateCache.report.reasons.length}項目）`, false);
      return;
    }
  }
  const requestId = ++meshExportRequestId;
  const generation = meshExportGeneration;
  const baseName = makeSkinExportBaseName(state.mode, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance);
  const recipe = serializeRecipe(history);
  const request: MeshExportRequest = {
    type: "export",
    operation: "export",
    requestId,
    generation,
    host: state.host.map((ball) => ({ ...ball })),
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches.map((patch) => ({
      ...patch,
      motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
      points: patch.points.map((point) => ({ ...point })),
    })),
    internalGraph,
    roundK: state.skinParams.roundK,
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    mode: state.mode,
    resolution: Math.max(16, Math.round(options.resolution)),
    targetLongestMm: options.targetLongestMm,
    workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
    baseName,
  };
  pendingMeshExport = { requestId, generation, baseName, recipe };
  const worker = new Worker(new URL("./meshExport.worker.ts", import.meta.url), { type: "module" });
  activeMeshExportWorker = worker;
  const started = performance.now();
  ui.setMeshExportRunning(true);
  ui.setMeshStatus("別処理で3Dデータを作成中… 画面はそのまま操作できます");
  meshExportStatusTimer = window.setInterval(() => {
    if (activeMeshExportWorker !== worker) return;
    ui.setMeshStatus(`別処理で3Dデータを作成中… ${((performance.now() - started) / 1000).toFixed(1)}秒（画面は操作できます）`);
  }, 500);
  worker.onmessage = (event: MessageEvent<MeshExportWorkerMessage>) => {
    const message = event.data;
    const pending = pendingMeshExport;
    if (
      !pending || activeMeshExportWorker !== worker ||
      message.requestId !== pending.requestId || message.generation !== pending.generation ||
      pending.generation !== meshExportGeneration
    ) return;
    if (message.type === "progress") {
      ui.setMeshStatus(`別処理で3Dデータを作成中 · ${message.completedSlices}/${message.totalSlices} slice · ${message.faceCount.toLocaleString()}面 · ${(message.elapsedMs / 1000).toFixed(1)}秒（画面は操作できます）`);
      return;
    }
    clearMeshExportWorker();
    pendingMeshExport = null;
    if (message.type === "error") {
      ui.setMeshStatus(`書き出し失敗: ${message.message}`, false);
      return;
    }
    downloadSkinMeshArtifacts(message.stl, message.obj, pending.recipe, pending.baseName);
    ui.setMeshStatus(`${message.summary} / 保存完了 ${(message.elapsedMs / 1000).toFixed(1)}秒`, message.watertightOk);
  };
  worker.onerror = (event) => {
    if (activeMeshExportWorker !== worker) return;
    clearMeshExportWorker();
    pendingMeshExport = null;
    ui.setMeshStatus(`書き出し失敗: ${event.message}`, false);
  };
  worker.postMessage(request);
}

function cloneOpeningRequest(options: OpeningMapUiOptions): OpeningMapRequest {
  return {
    type: "measure", requestId: ++openingMapRequestId, generation: openingMapGeneration,
    host: state.host.map((ball) => ({ ...ball })), hostK: state.hostParams.k, thickness: state.skinParams.thickness,
    patches: state.patches.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })),
    roundK: state.skinParams.roundK, coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance, quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    mode: state.mode, resolution: Math.min(64, Math.max(24, Math.round(options.resolution))), targetLongestMm: options.targetLongestMm,
    automaticOffset: options.automaticOffset, offsetMm: Math.min(20, Math.max(-20, options.offsetMm)), minAreaMm2: Math.max(0, options.minAreaMm2),
  };
}

function measureOpeningMap(options: OpeningMapUiOptions): void {
  if (activeOpeningMapWorker) return;
  if (denseFlowerSampleActive) {
    denseFlowerSampleActive = false;
    skinRenderer.clearDenseFlowerSample();
    ui.setDenseFlowerSampleActive(false);
  }
  let request: OpeningMapRequest;
  try { request = cloneOpeningRequest(options); } catch (error) { ui.setOpeningMapStatus(`開始できませんでした: ${(error as Error).message}`, false); return; }
  openingMapEverRun = true;
  const worker = new Worker(new URL("./openingMap.worker.ts", import.meta.url), { type: "module" });
  activeOpeningMapWorker = worker;
  ui.setOpeningMapRunning(true);
  ui.setOpeningMapStatus("現在の形状メッシュを準備中…");
  worker.onmessage = (event: MessageEvent<OpeningMapWorkerMessage>) => {
    const message = event.data;
    if (message.requestId !== request.requestId || message.generation !== openingMapGeneration || worker !== activeOpeningMapWorker) { worker.terminate(); return; }
    if (message.type === "progress") { ui.setOpeningMapStatus(`${message.stage} · 経過 ${(message.elapsedMs / 1000).toFixed(1)}秒`); return; }
    activeOpeningMapWorker = null; worker.terminate(); ui.setOpeningMapRunning(false);
    if (message.type === "error") { ui.setOpeningMapStatus(`計測できませんでした: ${message.message}`, false); return; }
    openingMapResult = message.result;
    ui.setOpeningMapStatus(message.result.likelyMergedByOffset
      ? `オフセット ${message.result.offsetMm.toFixed(1)} mmで未被覆面が一続きになりました · 0 mmで再計測してください`
      : `計測完了 · ${message.result.openings.length}件 · ${message.result.automaticOffset ? `自動計測面 ${message.result.offsetMm.toFixed(1)} mm · ` : ""}経過 ${(message.elapsedMs / 1000).toFixed(1)}秒`,
    !message.result.likelyMergedByOffset);
    viewMode = "mesh";
    skinRenderer.setMeshOverlay(message.result.meshTriangles);
    refreshOpeningMapDisplay();
    skinRenderer.setViewMode(viewMode);
    ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
  };
  worker.onerror = (event) => { if (worker !== activeOpeningMapWorker) return; activeOpeningMapWorker = null; worker.terminate(); ui.setOpeningMapRunning(false); ui.setOpeningMapStatus(`計測Workerに失敗しました: ${event.message}`, false); };
  worker.postMessage(request);
}

async function openDenseFlowerSample(): Promise<void> {
  cancelOpeningMap(false);
  const loadId = ++denseFlowerSampleLoadId;
  denseFlowerSampleActive = false;
  openingMapResult = null;
  skinRenderer.clearDenseFlowerSample();
  skinRenderer.setOpeningMap(null);
  ui.clearOpeningMap();
  ui.setDenseFlowerSampleRunning(true);
  ui.setDenseFlowerSampleActive(false);
  ui.setOpeningMapStatus("高密度花モデル v6 を読み込み中… 0/41");
  try {
    const sample = await loadDenseFlowerSample((loaded, total) => {
      if (loadId === denseFlowerSampleLoadId) ui.setOpeningMapStatus(`高密度花モデル v6 を読み込み中… ${loaded}/${total}`);
    });
    if (loadId !== denseFlowerSampleLoadId) return;
    denseFlowerSampleActive = true;
    viewMode = "mesh";
    skinRenderer.setDenseFlowerSample(sample);
    ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
    ui.setDenseFlowerSampleActive(true, "3d");
    ui.setDenseFlowerSampleResults(sample.openings, sample.report.counts.reported_openings);
    ui.setOpeningMapStatus(
      `v6参照形状 · 空隙${sample.report.counts.reported_openings}件 · 上位40件表示 · offset ${sample.report.method.measurement_surface_offset_mm.toFixed(1)} mm · recipeなし（保存STLの来歴を表示）`,
      true,
    );
    emptyViewportHint.hidden = true;
  } catch (error) {
    if (loadId !== denseFlowerSampleLoadId) return;
    ui.setOpeningMapStatus(`高密度花モデルを開けませんでした: ${(error as Error).message}`, false);
  } finally {
    if (loadId === denseFlowerSampleLoadId) ui.setDenseFlowerSampleRunning(false);
  }
}

function setDenseFlowerSampleView(view: DenseSampleView): void {
  if (!denseFlowerSampleActive) return;
  skinRenderer.setDenseFlowerSampleView(view);
  ui.setDenseFlowerSampleActive(true, view);
}

function displayedOpenings(): import("./openingMapWorkerProtocol.ts").OpeningMeasurement[] {
  if (!openingMapResult) return [];
  return openingMapDisplayCount === "all" ? openingMapResult.openings : openingMapResult.openings.slice(0, openingMapDisplayCount);
}

function refreshOpeningMapDisplay(): void {
  if (!openingMapResult) return;
  const displayed = displayedOpenings();
  skinRenderer.setOpeningMap(displayed);
  ui.setOpeningMapResults(openingMapResult.openings, displayed.length, openingMapResult.likelyMergedByOffset);
}

function clearOpeningMapDisplay(): void {
  cancelOpeningMap(false);
  denseFlowerSampleLoadId++;
  denseFlowerSampleActive = false;
  openingMapResult = null;
  skinRenderer.clearDenseFlowerSample();
  skinRenderer.setOpeningMap(null);
  ui.clearOpeningMap();
  ui.setDenseFlowerSampleRunning(false);
  ui.setDenseFlowerSampleActive(false);
  ui.setOpeningMapStatus("表示を消しました");
}

function cancelOpeningMap(showStatus = true): void {
  if (!activeOpeningMapWorker) return;
  activeOpeningMapWorker.terminate(); activeOpeningMapWorker = null; openingMapGeneration++;
  ui.setOpeningMapRunning(false);
  if (showStatus) ui.setOpeningMapStatus("計測をキャンセルしました");
}

/** Mutations invalidate both completed estimates and in-flight Workers. */
function invalidateOpeningMap(): void {
  const hadMeasurement = openingMapEverRun || activeOpeningMapWorker !== null || openingMapResult !== null || denseFlowerSampleActive;
  if (activeOpeningMapWorker) { activeOpeningMapWorker.terminate(); activeOpeningMapWorker = null; ui.setOpeningMapRunning(false); }
  openingMapGeneration++;
  if (!hadMeasurement) return;
  denseFlowerSampleLoadId++;
  denseFlowerSampleActive = false;
  openingMapResult = null;
  skinRenderer.clearDenseFlowerSample();
  skinRenderer.setMeshOverlay(null);
  skinRenderer.setOpeningMap(null);
  ui.clearOpeningMap();
  ui.setDenseFlowerSampleRunning(false);
  ui.setDenseFlowerSampleActive(false);
  ui.setOpeningMapStatus("形状または計測条件が変わったため、もう一度測ってください");
}

function invalidateSurfaceAngleDiagnosis(message = "形が変わりました。もう一度診断してください"): void {
  const hadDiagnosis = activeSurfaceAngleWorker !== null || surfaceAngleCache !== null;
  surfaceAngleGeneration++;
  if (activeSurfaceAngleWorker) {
    activeSurfaceAngleWorker.terminate();
    activeSurfaceAngleWorker = null;
  }
  surfaceAngleCache = null;
  overhangSupportResult = null;
  skinRenderer.clearSurfaceAngleOverlay();
  cancelBambu3mfExport(false);
  if (showMotifLowestPoints) refreshMotifLowestPointMarkers();
  ui.setSurfaceAngleDiagnosisRunning(false);
  ui.setSurfaceAngleDiagnosisView("before", false, false);
  if (hadDiagnosis) {
    ui.setSurfaceAngleDiagnosisStatus(message);
    ui.setBambu3mfExportStatus("角度診断が古くなりました。もう一度「最終精度で診断」を実行してください");
  }
}

function clearBambu3mfStatusTimer(): void {
  if (bambu3mfStatusTimer !== null) window.clearInterval(bambu3mfStatusTimer);
  bambu3mfStatusTimer = null;
}

function cancelBambu3mfExport(notify: boolean): void {
  const wasRunning = activeBambu3mfWorker !== null;
  bambu3mfGeneration++;
  activeBambu3mfWorker?.terminate();
  activeBambu3mfWorker = null;
  clearBambu3mfStatusTimer();
  ui.setBambu3mfExportRunning(false);
  if (notify && wasRunning) ui.setBambu3mfExportStatus("3MF書き出しを中止しました。形状は変更していません");
}

async function saveV088CandidateBundle(
  baseName: string,
  archive: ArrayBuffer,
  validationFacts: Extract<Bambu3mfWorkerMessage, { type: "result" }>['validationFacts'],
): Promise<void> {
  if (!importedRecipeText || !activePrintProfileText) throw new Error("Fail closed: exact Shape Recipe and Print Profile bytes are unavailable");
  const prefix = `v088-${baseName}`;
  const artifacts: Array<{ filename: string; bytes: Uint8Array; type: string }> = [
    { filename: `${prefix}.3mf`, bytes: new Uint8Array(archive.slice(0)), type: "model/3mf" },
    { filename: `${prefix}.shape-recipe.json`, bytes: new TextEncoder().encode(importedRecipeText), type: "application/json" },
    { filename: `${prefix}.print-profile.json`, bytes: new TextEncoder().encode(activePrintProfileText), type: "application/json" },
    { filename: `${prefix}.validation.json`, bytes: new TextEncoder().encode(JSON.stringify(validationFacts, null, 2) + "\n"), type: "application/json" },
  ];
  const hashes = await Promise.all(artifacts.map(async (artifact) => `${await sha256Hex(artifact.bytes.buffer as ArrayBuffer)}  ${artifact.filename}`));
  for (const artifact of artifacts) downloadBlob(new Blob([artifact.bytes.buffer as ArrayBuffer], { type: artifact.type }), artifact.filename);
  downloadBlob(new Blob([hashes.join("\n") + "\n"], { type: "text/plain" }), `${prefix}.sha256.txt`);
}

function exportBambu3mf(options: MeshUiOptions, supportType: BambuSupportType): void {
  cancelBambu3mfExport(false);
  if (!activePrintProfile || !activePrintProfileSha256) {
    ui.setBambu3mfExportStatus("先にShape RecipeとPrint Profileを読み込んでください", false);
    return;
  }
  const diagnosis = surfaceAngleCache;
  if (!diagnosis) {
    ui.setBambu3mfExportStatus("先に「最終精度で診断」を実行してください", false);
    return;
  }
  const resolution = Math.max(16, Math.round(options.resolution));
  if (diagnosis.resolution !== resolution) {
    ui.setBambu3mfExportStatus("解像度が変わりました。もう一度「最終精度で診断」を実行してください", false);
    return;
  }
  const assignments = overhangSupportResult;
  if (!assignments) {
    ui.setBambu3mfExportStatus("先に共有ポリシーでオーバーハング分類を完了してください", false);
    return;
  }
  const sourceLongest = triangleSoupLongestExtent(diagnosis.basePositions);
  if (!(sourceLongest > 0) || !(options.targetLongestMm > 0)) {
    ui.setBambu3mfExportStatus("BODYの実寸Scaleを求められませんでした", false);
    return;
  }
  const scaleMmPerUnit = options.targetLongestMm / sourceLongest;
  let printPlan: ResolvedPrintPlan;
  try {
    printPlan = resolveWorkerPrintPlan(activePrintProfile, activePrintProfileSha256, currentPrintProfileBinding(activePrintProfile));
    assertResolvedPrintPlanSupportCounts(printPlan, assignments.counts);
  } catch (error) {
    ui.setBambu3mfExportStatus((error as Error).message, false);
    refreshPrintProfileSummary();
    return;
  }
  if (supportType !== printPlan.printer.supportType) {
    ui.setBambu3mfExportStatus("Support方式がPrint Profileと一致しません", false);
    return;
  }
  const internalGraph = getInternalStructureGraph();
  let bodyStl: ArrayBuffer | undefined;
  let bodyPositions: Float32Array | undefined;
  if (internalGraph?.edges.length) {
    const fingerprint = internalPrintGateFingerprint(options, internalGraph);
    if (!internalPrintGateCache || internalPrintGateCache.fingerprint !== fingerprint || !internalPrintGateCache.report.ok) {
      ui.setBambu3mfExportStatus("Internal付きBODYは、先にA1 mini条件の内部最終判定をOKにしてください", false);
      return;
    }
    bodyStl = internalPrintGateCache.stl.slice(0);
  } else {
    // Worker reuses finalSurfacePositions as BODY when no gate STL is needed.
    bodyPositions = undefined;
  }
  const dangerousPositions = new Float32Array(diagnosedPositionsForPolicy(assignments).map((value) => value / scaleMmPerUnit));
  const finalSurfacePositions = diagnosis.basePositions.slice();
  const requestId = ++bambu3mfRequestId;
  const generation = ++bambu3mfGeneration;
  const baseName = makeSkinExportBaseName(state.mode, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance);
  const exportFingerprint = JSON.stringify({
    surfaceAngleGeneration,
    resolution,
    targetLongestMm: options.targetLongestMm,
    supportType,
    printProfileSha256: printPlan.profileSha256,
    resolvedPlan: printPlan,
    classificationCounts: assignments.counts,
    generatorVersion: manifest.version,
  });
  if (bambu3mfExportCache?.fingerprint === exportFingerprint) {
    void saveV088CandidateBundle(baseName, bambu3mfExportCache.archive, bambu3mfExportCache.validationFacts)
      .then(() => ui.setBambu3mfExportStatus("再計算なし・同じ診断結果のv088候補一式を保存しました · 0.0秒", true))
      .catch((error) => ui.setBambu3mfExportStatus(`v088候補保存に失敗しました: ${(error as Error).message}`, false));
    return;
  }
  const request: Bambu3mfExportRequest = {
    type: "export",
    requestId,
    generation,
    bodyStl,
    bodyPositions,
    finalSurfacePositions,
    dangerousPositions,
    scaleMmPerUnit,
    printPlan,
    fusedMeshInput: {
      mode: state.mode,
      host: state.host,
      hostK: state.hostParams.k,
      thickness: state.skinParams.thickness,
      patches: state.patches,
      roundK: state.skinParams.roundK,
      options: { resolution: printPlan.fusedResolution, targetLongestMm: printPlan.targetLongestMm },
      coinBulge: state.skinParams.coinBulge,
      quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
      coinBulgeBalance: state.skinParams.coinBulgeBalance,
      internalGraph,
    },
    supportType,
    title: `v088-${baseName}-fused-scaffold`,
    generatorVersion: manifest.version,
  };
  const worker = new Worker(new URL("./bambu3mf.worker.ts", import.meta.url), { type: "module" });
  activeBambu3mfWorker = worker;
  const started = performance.now();
  const dangerFaces = dangerousPositions.length / 9;
  let progressStage = `3MF 1/7 · 入力を準備 · policy=${assignments.policy} · inside=${assignments.counts.inside} outside=${assignments.counts.outside} unresolved=${assignments.counts.unresolved} · 候補${dangerFaces.toLocaleString()}面`;
  ui.setBambu3mfExportRunning(true);
  ui.setBambu3mfExportStatus(`${progressStage} · 0秒`);
  bambu3mfStatusTimer = window.setInterval(() => {
    ui.setBambu3mfExportStatus(
      `${progressStage} · ${Math.floor((performance.now() - started) / 1000)}秒 · 画面は操作できます`,
    );
  }, 1000);
  worker.onmessage = (event: MessageEvent<Bambu3mfWorkerMessage>) => {
    const message = event.data;
    if (
      worker !== activeBambu3mfWorker || message.requestId !== requestId ||
      message.generation !== bambu3mfGeneration
    ) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") {
      progressStage = `3MF ${message.stageIndex}/${message.stageCount} · ${message.stage}${message.detail ? ` · ${message.detail}` : ""}`;
      ui.setBambu3mfExportStatus(`${progressStage} · ${(message.elapsedMs / 1000).toFixed(1)}秒 · 画面は操作できます`);
      return;
    }
    worker.terminate();
    activeBambu3mfWorker = null;
    clearBambu3mfStatusTimer();
    ui.setBambu3mfExportRunning(false);
    if (message.type === "error") {
      ui.setBambu3mfExportStatus(`3MFを作成できませんでした: ${message.message}`, false);
      return;
    }
    bambu3mfExportCache = {
      fingerprint: exportFingerprint,
      archive: message.archive.slice(0),
      validationFacts: message.validationFacts,
    };
    void saveV088CandidateBundle(baseName, message.archive, message.validationFacts)
      .catch((error) => ui.setBambu3mfExportStatus(`v088候補保存に失敗しました: ${(error as Error).message}`, false));
    const sizeMb = message.stats.archiveBytes / (1024 * 1024);
    ui.setBambu3mfExportStatus(
      `保存完了 · policy=${message.supportPolicy} · total=${message.classificationCounts.total} / inside=${message.classificationCounts.inside} / outside=${message.classificationCounts.outside} / unresolved=${message.classificationCounts.unresolved} · 候補${message.reachability.candidateFaceCount.toLocaleString()} → 外側直下到達${message.reachability.keptFaceCount.toLocaleString()} / 内側・遮蔽除外${message.reachability.rejectedFaceCount.toLocaleString()}（無効${message.reachability.invalidCandidateFaceCount.toLocaleString()}） · 全到達候補${message.scaffold.coverageFaceCount.toLocaleString()} → 支柱${message.scaffold.pillarCount.toLocaleString()}本（BODY衝突除外${message.scaffold.collisionRejectedFaceCount.toLocaleString()}） · 最終一体mesh ${message.stats.bodyFaces.toLocaleString()}面 · ${sizeMb.toFixed(1)} MB · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
      true,
    );
  };
  worker.onerror = (event) => {
    if (worker !== activeBambu3mfWorker) return;
    worker.terminate();
    activeBambu3mfWorker = null;
    clearBambu3mfStatusTimer();
    ui.setBambu3mfExportRunning(false);
    ui.setBambu3mfExportStatus(`3MF Workerに失敗しました: ${event.message}`, false);
  };
  const transfer: Transferable[] = [dangerousPositions.buffer, finalSurfacePositions.buffer];
  if (bodyStl) transfer.push(bodyStl);
  if (bodyPositions) transfer.push(bodyPositions.buffer);
  worker.postMessage(request, transfer);
}

function showSurfaceAngleDiagnosisView(nextView: SurfaceAngleDiagnosisView): void {
  const result = surfaceAngleCache;
  if (!result) return;
  const hasInternal = result.internalEdgeCount > 0;
  if (nextView === "after" && !hasInternal) return;
  if (nextView === "before") {
    skinRenderer.setSurfaceAngleOverlay(result.beforeDangerPositions, new Float32Array(0), false);
  } else {
    skinRenderer.setSurfaceAngleOverlay(result.afterDangerPositions, result.mitigatedPositions, true);
  }
  ui.setSurfaceAngleDiagnosisView(nextView, true, hasInternal);
  ui.setMeshPreviewStatus(nextView === "before"
    ? `角度診断・付加前 · ${result.metrics.dangerousFaceCountBefore.toLocaleString()}面を赤表示`
    : `角度診断・付加後 · 未支援${result.metrics.dangerousFaceCountAfter.toLocaleString()}面 / Internal到達${result.metrics.mitigatedFaceCount.toLocaleString()}面`);
  render();
}

function finishSurfaceAngleDiagnosis(
  message: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
): void {
  surfaceAngleCache = message;
  skinRenderer.setMeshOverlayBuffers(message.basePositions, message.baseNormals);
  viewMode = "mesh";
  skinRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
  const areaPct = (area: number) => message.metrics.surfaceArea > 0
    ? `${(area / message.metrics.surfaceArea * 100).toFixed(1)}%`
    : "0.0%";
  const reducedPct = message.metrics.dangerousAreaBefore > 0
    ? `${(message.metrics.mitigatedArea / message.metrics.dangerousAreaBefore * 100).toFixed(1)}%`
    : "0.0%";
  const hasInternal = message.internalEdgeCount > 0;
  const classification = overhangSupportResult?.counts;
  ui.setSurfaceAngleDiagnosisRunning(false);
  ui.setSurfaceAngleDiagnosisStatus(hasInternal
    ? `最終mesh解像度${message.resolution} · 閾値${message.metrics.thresholdDeg.toFixed(0)}° · 付加前 ${areaPct(message.metrics.dangerousAreaBefore)} → 付加後未支援 ${areaPct(message.metrics.dangerousAreaAfter)} · 軽減候補 ${reducedPct} · ${(message.elapsedMs / 1000).toFixed(1)}秒`
    : `最終mesh解像度${message.resolution} · 閾値${message.metrics.thresholdDeg.toFixed(0)}° · 危険候補 ${areaPct(message.metrics.dangerousAreaBefore)} · Internal Structureなし（付加後比較は無効）`,
    true,
  );
  const supportFaceCount = hasInternal
    ? message.metrics.dangerousFaceCountAfter
    : message.metrics.dangerousFaceCountBefore;
  if (supportFaceCount === 0) {
    ui.setBambu3mfExportStatus(classification
      ? `準備完了 · policy=${overhangSupportResult!.policy} · total=${classification.total} / inside=${classification.inside} / outside=${classification.outside} / unresolved=${classification.unresolved}`
      : "Internal付加後に未支援の赤面は0面です。外部支柱は不要です", true);
  } else {
    const gateNote = hasInternal ? " · Internal最終判定OKも必要" : "";
    const stage = hasInternal ? "付加後に残る赤面" : "赤面";
    ui.setBambu3mfExportStatus(
      classification
        ? `準備完了 · policy=${overhangSupportResult!.policy} · total=${classification.total} / inside=${classification.inside} / outside=${classification.outside} / unresolved=${classification.unresolved} · ${stage}${supportFaceCount.toLocaleString()}面${gateNote}`
        : `準備完了 · ${stage}${supportFaceCount.toLocaleString()}面をSupport Enforcerへ変換できます${gateNote}`,
      true,
    );
  }
  showSurfaceAngleDiagnosisView("before");
  ui.setSurfaceAngleDiagnosisView("before", true, hasInternal);
  refreshPrintProfileSummary();
  refreshMotifLowestPointMarkers();
}

function recheckTargetedGridFromExactMesh(
  base: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
  graph: InternalStructureGraph,
): void {
  ui.setSurfaceAngleDiagnosisRunning(true);
  ui.setSurfaceAngleDiagnosisStatus("全赤点からDry Webを生成しました。同じ最終メッシュ上で付加後を別Workerで再診断しています…");
  const reinforced = reinforceQuadConnectionsForMesh(state.patches, state.skinParams.quadMeshJoinWidth);
  const bounds = computeSkinSamplingBounds(state.host, state.hostParams.k, state.skinParams.thickness, reinforced.patches);
  const meshStep = bounds.longest > 0 ? bounds.longest / base.resolution : 1 / base.resolution;
  const worker = new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
  activeSurfaceAngleWorker = worker;
  const request: SurfaceAngleDiagnosisRequest = {
    type: "recheck", generation: surfaceAngleGeneration,
    basePositions: base.basePositions.slice(), baseNormals: base.baseNormals.slice(), baseFaceCount: base.baseFaceCount,
    resolution: base.resolution, internalGraph: graph, thresholdDeg: base.metrics.thresholdDeg, meshStep,
    mode: state.mode,
    patches: state.patches.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })),
    roundK: state.skinParams.roundK, previousElapsedMs: base.elapsedMs,
  };
  worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
    const message = event.data;
    if (worker !== activeSurfaceAngleWorker || message.generation !== surfaceAngleGeneration) return;
    if (message.type === "progress") return;
    worker.terminate();
    activeSurfaceAngleWorker = null;
    ui.setSurfaceAngleDiagnosisRunning(false);
    if (message.type === "error") {
      ui.setSurfaceAngleDiagnosisStatus(`Dry Webの付加後診断に失敗しました: ${message.message}`, false);
      return;
    }
    finishSurfaceAngleDiagnosis(message);
  };
  worker.onerror = (event) => {
    if (worker === activeSurfaceAngleWorker) activeSurfaceAngleWorker = null;
    worker.terminate();
    ui.setSurfaceAngleDiagnosisRunning(false);
    ui.setSurfaceAngleDiagnosisStatus(`Dry Webの付加後診断Workerに失敗しました: ${event.message}`, false);
  };
  worker.postMessage(request, [request.basePositions.buffer, request.baseNormals.buffer]);
}

function startSurfaceAngleDiagnosis(thresholdDeg: number): void {
  if (state.host.length === 0) {
    ui.setSurfaceAngleDiagnosisStatus("まずベース形状を作ってください", false);
    return;
  }
  if (activeSurfaceAngleWorker) activeSurfaceAngleWorker.terminate();
  cancelPreviewMeshBuild();
  clearOpeningMapDisplay();
  surfaceAngleGeneration++;
  const generation = surfaceAngleGeneration;
  surfaceAngleCache = null;
  overhangSupportResult = null;
  // A new exact diagnosis must rebuild Dry Web targets from this run's
  // inside assignments; never let a prior mesh's target ledger leak into it.
  targetedSupportSource = null;
  skinRenderer.clearSurfaceAngleOverlay();
  ui.setSurfaceAngleDiagnosisView("before", false, false);
  ui.setSurfaceAngleDiagnosisRunning(true);
  ui.setSurfaceAngleDiagnosisStatus("最終精度の外殻Surface meshを並列生成して診断しています…");
  if (internalObservationMode !== "normal") {
    internalObservationMode = "normal";
    skinRenderer.setInternalObservationMode("normal");
    ui.setInternalObservationMode("normal");
  }
  if (displayStyle !== "solid") {
    displayStyle = "solid";
    skinRenderer.setDisplayStyle("solid");
    ui.setDisplayStyle("solid");
  }
  const options = ui.getMeshOptions();
  const resolution = Math.max(16, Math.round(options.resolution));
  const internalGraph = getInternalStructureGraph();
  const request: SurfaceAngleDiagnosisRequest = {
    type: "build",
    generation,
    host: state.host.map((ball) => ({ ...ball })),
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches.map((patch) => ({
      ...patch,
      motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
      points: patch.points.map((point) => ({ ...point })),
    })),
    internalGraph,
    roundK: state.skinParams.roundK,
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    mode: state.mode,
    thresholdDeg,
    resolution,
    targetLongestMm: options.targetLongestMm,
    workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
  };
  const worker = new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
  activeSurfaceAngleWorker = worker;
  if (showMotifLowestPoints) refreshMotifLowestPointMarkers();
  worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
    const message = event.data;
    if (message.generation !== surfaceAngleGeneration || worker !== activeSurfaceAngleWorker) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") {
      ui.setSurfaceAngleDiagnosisStatus(`最終mesh ${message.completedSlices}/${message.totalSlices} slice · ${message.faceCount.toLocaleString()}面 · ${(message.elapsedMs / 1000).toFixed(1)}秒 · 画面は操作できます`);
      return;
    }
    activeSurfaceAngleWorker = null;
    worker.terminate();
    ui.setSurfaceAngleDiagnosisRunning(false);
    if (message.type === "error") {
      ui.setSurfaceAngleDiagnosisStatus(`診断できませんでした: ${message.message}`, false);
      return;
    }
    try {
      overhangSupportResult = classifySurfaceAngleSupport(message);
    } catch (error) {
      overhangSupportResult = null;
      ui.setSurfaceAngleDiagnosisStatus(`オーバーハング分類に失敗しました: ${(error as Error).message}`, false);
      return;
    }
    const sourceLongest = triangleSoupLongestExtent(message.basePositions);
    const scaleMmPerUnit = ui.getMeshOptions().targetLongestMm / sourceLongest;
    if (state.skinParams.internalStructure === "targetedGrid" && !internalGraph?.edges.length && overhangSupportResult.insideTargets.length > 0) {
      targetedSupportSource = {
        surfaceFingerprint: currentTargetSurfaceFingerprint(),
        resolution: message.resolution,
        targets: sourceDryWebTargets(overhangSupportResult, scaleMmPerUnit),
      };
      internalStructureFingerprint = "";
      surfaceAngleCache = message;
      skinRenderer.setMeshOverlayBuffers(message.basePositions, message.baseNormals);
      viewMode = "mesh";
      skinRenderer.setViewMode(viewMode);
      ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
      refreshInternalStructure();
      const targetedGraph = getInternalStructureGraph();
      if (targetedGraph?.edges.length) {
        recheckTargetedGridFromExactMesh(message, targetedGraph);
        return;
      }
    }
    finishSurfaceAngleDiagnosis(message);
  };
  worker.onerror = (event) => {
    if (worker !== activeSurfaceAngleWorker) return;
    activeSurfaceAngleWorker = null;
    worker.terminate();
    ui.setSurfaceAngleDiagnosisRunning(false);
    ui.setSurfaceAngleDiagnosisStatus(`角度診断Workerに失敗しました: ${event.message}`, false);
  };
  worker.postMessage(request);
}

async function checkCurrentPrint(options: MeshUiOptions): Promise<void> {
  // serializeRecipe includes an export timestamp, so two calls for an
  // unchanged shape are intentionally not byte-identical. The immutable
  // history entries themselves are the stable source identity needed here.
  const sourceFingerprint = JSON.stringify(history);
  const internalGraph = getInternalStructureGraph();
  if (state.skinParams.internalStructure === "targetedGrid" && !internalGraph) {
    ui.setPrintCheckStatus("赤点→Dry Webは最終精度診断の完了後に確認できます", false);
    return;
  }
  const gateFingerprint = internalGraph?.edges.length ? internalPrintGateFingerprint(options, internalGraph) : null;
  if (gateFingerprint && (!internalPrintGateCache || internalPrintGateCache.fingerprint !== gateFingerprint || !internalPrintGateCache.report.ok)) {
    ui.setPrintCheckStatus("先にA1 mini条件の内部最終判定をOKにしてください。OK時の同一STLを再利用します", false);
    return;
  }
  ui.setPrintCheckRunning(true);
  ui.setPrintCheckMetrics(null);
  ui.setPrintCheckStatus(gateFingerprint ? "最終ゲートの同一STLを再利用しています…" : "今の形から3Dデータを作っています…");
  try {
    const baseName = makeSkinExportBaseName(state.mode, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance);
    const stl = gateFingerprint
      ? internalPrintGateCache!.stl.slice(0)
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          activePrintCheckMeshWorker?.terminate();
          printCheckMeshReject?.(new Error("新しい印刷確認を開始したため、前の処理を停止しました"));
          printCheckMeshReject = reject;
          const worker = new Worker(new URL("./meshExport.worker.ts", import.meta.url), { type: "module" });
          activePrintCheckMeshWorker = worker;
          const requestId = ++printCheckMeshRequestId;
          const generation = printCheckMeshGeneration;
          const request: MeshExportRequest = {
            type: "export", operation: "stl", requestId, generation,
            host: state.host.map((ball) => ({ ...ball })), hostK: state.hostParams.k,
            thickness: state.skinParams.thickness,
            patches: state.patches.map((patch) => ({
              ...patch, motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
              points: patch.points.map((point) => ({ ...point })),
            })),
            internalGraph, roundK: state.skinParams.roundK, coinBulge: state.skinParams.coinBulge,
            coinBulgeBalance: state.skinParams.coinBulgeBalance, quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
            mode: state.mode, resolution: Math.max(16, Math.round(options.resolution)),
            targetLongestMm: options.targetLongestMm,
            workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
            baseName,
          };
          worker.onmessage = (event: MessageEvent<MeshExportWorkerMessage>) => {
            const message = event.data;
            if (worker !== activePrintCheckMeshWorker || message.requestId !== requestId || message.generation !== printCheckMeshGeneration) return;
            if (message.type === "progress") {
              ui.setPrintCheckStatus(`確認用mesh ${message.completedSlices}/${message.totalSlices} slice · ${message.faceCount.toLocaleString()}面 · ${(message.elapsedMs / 1000).toFixed(1)}秒 · 画面は操作できます`);
              return;
            }
            worker.terminate();
            activePrintCheckMeshWorker = null;
            printCheckMeshReject = null;
            if (message.type === "error") reject(new Error(message.message));
            else resolve(message.stl);
          };
          worker.onerror = (event) => {
            if (worker === activePrintCheckMeshWorker) activePrintCheckMeshWorker = null;
            printCheckMeshReject = null;
            worker.terminate();
            reject(new Error(`確認用mesh Worker: ${event.message}`));
          };
          worker.postMessage(request);
        });
    if (JSON.stringify(history) !== sourceFingerprint) {
      throw new Error("形が変更されたため、古い確認結果を破棄しました。もう一度実行してください");
    }
    const summary = await checkGeneratedStl(stl, `${baseName}.stl`, ({ percent, stage, elapsedSeconds }) => {
      if (JSON.stringify(history) !== sourceFingerprint) return;
      ui.setPrintCheckStatus(`確認 ${percent}% · ${stage} · 経過 ${elapsedSeconds.toFixed(1)}秒`);
    }, { quick: true });
    if (JSON.stringify(history) !== sourceFingerprint) {
      throw new Error("確認中に形が変更されたため、古い結果を表示しません。もう一度実行してください");
    }
    const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
    const best = summary.bestInternalOverhangRatio;
    ui.setPrintCheckMetrics({
      topology: summary.watertight ? `閉じています（${summary.shellCount}部品）` : "開いた箇所があります",
      size: `${summary.sizeMm.map((value) => value.toFixed(1)).join(" × ")} mm`,
      wall: summary.wallP05Mm == null ? "測定できませんでした" : `${summary.wallP05Mm.toFixed(2)} mm（推定）`,
      internalSupport: `${pct(summary.internalOverhangRatio)}（推定）`,
      bestOrientation: best == null
        ? "候補なし"
        : `${formatDirection(summary.bestDirection)}方向 · 内側 ${pct(best)}（推定）`,
    });
    ui.setPrintCheckStatus("確認完了 · 下の数値を見て、分け方や向きを調整できます", summary.watertight);
  } catch (err) {
    ui.setPrintCheckMetrics(null);
    ui.setPrintCheckStatus(`確認できませんでした: ${(err as Error).message}`, false);
  } finally {
    ui.setPrintCheckRunning(false);
  }
}

// --- Gauges -----------------------------------------------------------
// Computed on-demand after state mutations (not every animation frame), same
// convention as pack/main.ts's refreshGauges.

function refreshGauges(): void {
  const generation = ++gaugeGeneration;
  if (gaugeDebounceTimer !== null) window.clearTimeout(gaugeDebounceTimer);
  gaugeDebounceTimer = null;
  if (activeGaugeWorker) {
    activeGaugeWorker.terminate();
    activeGaugeWorker = null;
  }
  // Arrow-key repeats and shape Apply clicks can arrive in a short burst.
  // Coalesce those edits before cloning the realized geometry to the Worker;
  // the viewport and the selected bead instances update synchronously.
  gaugeDebounceTimer = window.setTimeout(() => {
    gaugeDebounceTimer = null;
    if (generation !== gaugeGeneration) return;
    const worker = new Worker(new URL("./gauge.worker.ts", import.meta.url), { type: "module" });
    activeGaugeWorker = worker;
    const { targetLongestMm } = ui.getMeshOptions();
    const request: GaugeBuildRequest = {
      type: "build",
      generation,
      host: state.host,
      hostK: state.hostParams.k,
      thickness: state.skinParams.thickness,
      patches: state.patches,
      roundK: state.skinParams.roundK,
      targetLongestMm,
    };
    worker.onmessage = (event: MessageEvent<GaugeWorkerMessage>) => {
      const message = event.data;
      if (message.generation !== gaugeGeneration || worker !== activeGaugeWorker) {
        worker.terminate();
        return;
      }
      activeGaugeWorker = null;
      worker.terminate();
      if (message.type === "error") {
        console.warn(`Gauge Worker: ${message.message}`);
        return;
      }
      ui.setGauges(
        message.mortar,
        message.coverage,
        message.patchComponents,
        message.mmPerUnit,
        message.linking,
        message.overlaps,
      );
    };
    worker.onerror = (event) => {
      if (worker === activeGaugeWorker) activeGaugeWorker = null;
      worker.terminate();
      console.warn(`Gauge Worker: ${event.message}`);
    };
    worker.postMessage(request);
  }, 90);
}

function totalPatchPoints(): number {
  return state.patches.reduce((s, p) => s + p.points.length, 0);
}

function clearPreviewMeshStatusTimer(): void {
  if (previewMeshStatusTimer !== null) window.clearInterval(previewMeshStatusTimer);
  previewMeshStatusTimer = null;
}

function cancelPreviewMeshBuild(showStatus = false): void {
  if (activePreviewMeshWorker) {
    activePreviewMeshWorker.terminate();
    activePreviewMeshWorker = null;
  }
  clearPreviewMeshStatusTimer();
  if (showStatus) ui.setMeshPreviewStatus("軽量メッシュ生成を中止しました");
}

function clonePreviewMeshRequest(resolution: number, targetLongestMm: number): PreviewMeshRequest {
  return {
    type: "build",
    requestId: ++previewMeshRequestId,
    generation: previewMeshGeneration,
    host: state.host.map((ball) => ({ ...ball })),
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches.map((patch) => ({
      ...patch,
      motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
      points: patch.points.map((point) => ({ ...point })),
    })),
    internalGraph: getInternalStructureGraph(),
    roundK: state.skinParams.roundK,
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    mode: state.mode,
    resolution,
    targetLongestMm,
    workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
  };
}

function installPreviewMesh(cache: NonNullable<typeof previewMeshCache>): void {
  skinRenderer.setMeshOverlayBuffers(cache.positions, cache.normals);
  viewMode = "mesh";
  skinRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
}

function startPreviewMeshStage(resolution: number, finalResolution: number, targetLongestMm: number): void {
  if (activePreviewMeshWorker) return;
  const refining = resolution === finalResolution && previewMeshCache?.generation === previewMeshGeneration;
  const request = clonePreviewMeshRequest(resolution, targetLongestMm);
  const requestFingerprint = request.internalGraph?.edges.length
    ? internalPrintGateFingerprint({ resolution, targetLongestMm }, request.internalGraph)
    : "";
  const worker = new Worker(new URL("./previewMesh.worker.ts", import.meta.url), { type: "module" });
  activePreviewMeshWorker = worker;
  const started = performance.now();
  const stageLabel = refining ? `形状に近い高精度メッシュへ${request.workerCount}並列で更新中` : `操作用の粗いメッシュを${request.workerCount}並列で準備中`;
  ui.setMeshPreviewStatus(`${stageLabel} · 解像度${resolution}`, true);
  previewMeshStatusTimer = window.setInterval(() => {
    ui.setMeshPreviewStatus(`${stageLabel} · ${(performance.now() - started) / 1000 | 0}秒 · 画面は操作できます`, true);
  }, 500);
  worker.onmessage = (event: MessageEvent<PreviewMeshWorkerMessage>) => {
    const message = event.data;
    if (message.requestId !== request.requestId || message.generation !== previewMeshGeneration || worker !== activePreviewMeshWorker) {
      worker.terminate();
      return;
    }
    activePreviewMeshWorker = null;
    clearPreviewMeshStatusTimer();
    worker.terminate();
    if (message.type === "error") {
      ui.setMeshPreviewStatus(refining
        ? `粗いメッシュを表示中 / 高精度化できませんでした: ${message.message}`
        : `メッシュを作れませんでした: ${message.message}`);
      return;
    }
    previewMeshCache = {
      generation: message.generation,
      resolution: message.resolution,
      fingerprint: requestFingerprint,
      positions: message.positions,
      normals: message.normals,
      faceCount: message.faceCount,
    };
    installPreviewMesh(previewMeshCache);
    if (message.resolution < finalResolution) {
      ui.setMeshPreviewStatus(
        `粗表示 ${message.faceCount.toLocaleString()}面 · 続けて解像度${finalResolution}へ高精度化します`, true,
      );
      window.setTimeout(() => {
        if (viewMode === "mesh" && message.generation === previewMeshGeneration && !activePreviewMeshWorker) {
          startPreviewMeshStage(finalResolution, finalResolution, targetLongestMm);
        }
      }, 0);
      return;
    }
    ui.setMeshPreviewStatus(
      `高精度メッシュ ${message.faceCount.toLocaleString()}面 · 解像度${message.resolution} · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
    );
  };
  worker.onerror = (event) => {
    if (worker !== activePreviewMeshWorker) return;
    activePreviewMeshWorker = null;
    clearPreviewMeshStatusTimer();
    worker.terminate();
    ui.setMeshPreviewStatus(refining
      ? `粗いメッシュを表示中 / 高精度Workerに失敗しました: ${event.message}`
      : `メッシュWorkerに失敗しました: ${event.message}`);
  };
  worker.postMessage(request);
}

function startPreviewMeshBuild(): void {
  if (activePreviewMeshWorker) return;
  const options = ui.getMeshOptions();
  const { coarse: coarseResolution, final: finalResolution } = chooseProgressivePreviewResolutions(
    options.resolution,
    totalPatchPoints(),
  );
  if (previewMeshCache?.generation === previewMeshGeneration) {
    installPreviewMesh(previewMeshCache);
    if (previewMeshCache.resolution >= finalResolution) {
      ui.setMeshPreviewStatus(
        `高精度メッシュ ${previewMeshCache.faceCount.toLocaleString()}面 · 解像度${previewMeshCache.resolution}`,
      );
      return;
    }
    startPreviewMeshStage(finalResolution, finalResolution, options.targetLongestMm);
    return;
  }
  startPreviewMeshStage(coarseResolution, finalResolution, options.targetLongestMm);
}

/** The screen mesh is a cancellable progressive Worker preview: a coarse
 * result appears first, then the exact author-selected resolution replaces
 * it. Export/inspection keep their separate audited build path. */
function setViewMode(mode: SkinViewMode): void {
  if (mode !== "mesh") cancelPreviewMeshBuild();
  if (mode === "mesh") {
    if (openingMapResult) {
      skinRenderer.setMeshOverlay(openingMapResult.meshTriangles);
      refreshOpeningMapDisplay();
      viewMode = "mesh";
      skinRenderer.setViewMode(viewMode);
      ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
      ui.setMeshPreviewStatus("空隙マップと同じ計測メッシュを表示中");
      return;
    }
    startPreviewMeshBuild();
    return;
  }
  viewMode = mode;
  if (mode === "beads") skinRenderer.updateBeads(state.host, state.patches, selectedPatchId);
  skinRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
  ui.setMeshPreviewStatus(mode === "raymarch" ? "レイマーチ表示" : "ビーズ表示");
}

function setInternalObservationMode(mode: InternalObservationMode): void {
  if (mode !== "normal" && state.skinParams.internalStructure === "none") {
    ui.setInternalStructureStatus("Internal StructureをONにすると観察表示を使えます", false);
    return;
  }
  internalObservationMode = mode;
  if (mode !== "normal" && displayStyle !== "solid") {
    displayStyle = "solid";
    skinRenderer.setDisplayStyle(displayStyle);
    ui.setDisplayStyle(displayStyle);
  }
  skinRenderer.setInternalObservationMode(mode);
  ui.setInternalObservationMode(mode);
  if (mode !== "normal" && viewMode === "raymarch") {
    setViewMode("beads");
    ui.setMeshPreviewStatus(mode === "internalOnly"
      ? "Internal Structureのみ表示中"
      : "SKIN半透明 / Internal Structure観察中");
    return;
  }
  skinRenderer.setViewMode(viewMode);
  render();
}

function afterMutation(opts: { skipGauges?: boolean; patchOnlyId?: number } = {}): void {
  // Every field/host/patch mutation reaches this common path.  The display
  // count control bypasses it, so it can redraw without recomputing.
  meshExportGeneration++;
  printCheckMeshGeneration++;
  if (activePrintCheckMeshWorker) {
    activePrintCheckMeshWorker.terminate();
    activePrintCheckMeshWorker = null;
    printCheckMeshReject?.(new Error("形が変わったため、進行中の印刷確認を停止しました"));
    printCheckMeshReject = null;
    ui.setPrintCheckRunning(false);
    ui.setPrintCheckStatus("形が変わったため、進行中の印刷確認を停止しました");
  }
  invalidateInternalPrintGate();
  if (activeMeshExportWorker) {
    cancelMeshExport(false);
    ui.setMeshStatus("形が変わったため、進行中の書き出しを停止しました");
  }
  cancelPreviewMeshBuild();
  previewMeshGeneration++;
  previewMeshCache = null;
  invalidateSurfaceAngleDiagnosis();
  invalidateOpeningMap();
  if (!opts.skipGauges) clearContactView("形状が変わったため、接点数を再確認してください");
  if (hoveredPatchId !== null && !state.patches.some((patch) => patch.id === hoveredPatchId)) hoveredPatchId = null;
  skinRenderer.setElementNames(state.patches, selectedPatchId, showElementNames, hoveredPatchId);
  syncUndoHistory();
  ui.setPackResult(lastPackResult);
  if (opts.patchOnlyId === undefined) refreshQuadFlowGrid();
  refreshInternalStructure();
  refreshMotifLowestPointMarkers();
  const totalPoints = totalPatchPoints();
  if (viewMode === "mesh") {
    // Any mutation invalidates the cached triangle soup -- don't leave a
    // stale mesh on screen (T11's rule, kept for T12's three-way toggle).
    skinRenderer.setMeshOverlay(null);
    viewMode = displayStyle === "ghost" || internalObservationMode !== "normal" ? "beads"
      : totalPoints > PATCH_MAX_POINTS ? "beads" : "raymarch";
    ui.setMeshPreviewStatus("形が変わりました。メッシュをもう一度選ぶと、粗表示から高精度化します");
  }
  if (!opts.skipGauges) {
    // Host/patch mutations make any earlier triangle count/topology report
    // stale. Never leave a previous shape's "水密 / 部品数" beside the new
    // fused field.
    ui.setMeshStatus("未検査");
    // Bead geometry only needs rebuilding when host/patches actually
    // changed -- skinParam slider drags call afterMutation({skipGauges:
    // true}) precisely because they don't touch host/patches yet (only the
    // next "詰める" does), so this stays cheap during dragging even with
    // thousands of bead instances.
    const editedPatch = opts.patchOnlyId === undefined
      ? null
      : state.patches.find((patch) => patch.id === opts.patchOnlyId) ?? null;
    if (!editedPatch || !skinRenderer.updatePatchBeads(editedPatch, selectedPatchId)) {
      skinRenderer.updateBeads(state.host, state.patches, selectedPatchId);
    }
    // T12 §2 "自動切替": once the point count exceeds the raymarch's
    // uniform-array budget, stop silently under-drawing (T11's "隙間だら
    // け" bug) and switch to the uncapped bead view instead. Only fires
    // when currently ON raymarch -- a user who deliberately chose "全体メ
    // ッシュ" or already switched to beads is left alone.
    if (totalPoints > PATCH_MAX_POINTS && viewMode === "raymarch") {
      viewMode = "beads";
      ui.setAutoSwitchNotice(true);
    } else {
      ui.setAutoSwitchNotice(false);
    }
  }
  skinRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, totalPoints, state.skinParams.coinBulge);
  updateSelectionLabel();
  updateEmptyViewportHint();
  if (!opts.skipGauges) {
    refreshGauges();
    // T13: a structural patch change (pack/add/remove/clear) invalidates any
    // in-progress or built partition (history.ts's applyEntry already nulls
    // state.partition for those ops) -- keep the panel/renderer/export
    // buttons honest about that instead of showing a stale A/B split.
    // T13 audit fix: any structural patch change stales an in-flight or
    // completed partition build, regardless of whether a result had already
    // arrived -- bump the generation unconditionally so a worker response
    // that lands after this point gets discarded (see buildPartition()).
    partitionGeneration++;
    nPartitionGeneration++;
    if (!state.partition && partitionResult) {
      partitionResult = null;
      ui.setPartitionExportEnabled(false);
      ui.setPartitionVerificationExportEnabled(false);
      ui.setPartitionMetrics("");
      ui.setPartitionStatus("パッチが変更されたため未分割に戻りました");
    }
    if (!state.nPartition && (nPartitionResult || draftNGroups.length > 0 || activeNPartitionWorker)) {
      if (activeNPartitionWorker) {
        activeNPartitionWorker.terminate();
        activeNPartitionWorker = null;
      }
      nPartitionResult = null;
      draftNGroups = [];
      nSeedIds = [];
      ui.setNPartitionBuildRunning(false);
      ui.setNPartitionExportEnabled(false);
      ui.setNPartitionMetrics("");
      ui.setNPartitionProposal("未提案");
      ui.setNPartitionStatus("パッチが変更されたため、N分割を作り直してください");
      skinRenderer.updateNBeadGroups(null);
    }
    refreshPartitionDraft();
  }
  render();
}

function packCurrentSurface(params: typeof state.skinParams, existing: Patch[]): PackPatchesResult {
  if (params.surfaceGenerationMode === "quadFlow") {
    return packPatchesOnQuadFlow(state.host, state.hostParams.k, params);
  }
  if (params.surfaceGenerationMode === "voronoi") {
    return packPatchesOnVoronoi(state.host, state.hostParams.k, params);
  }
  if (params.surfaceGenerationMode === "goldberg") {
    return packPatchesOnGoldberg(state.host, state.hostParams.k, params);
  }
  return packPatchesGreedy(state.host, state.hostParams.k, existing, params);
}

function updateSurfacePackStatus(result: PackPatchesResult): void {
  if ("voronoiSeedCount" in result) {
    const voronoi = result as VoronoiPackResult;
    ui.setVoronoiStatus(
      `種点${voronoi.voronoiSeedCount} / 近傍辺${voronoi.voronoiNeighbourEdges} / ` +
        `均し${voronoi.voronoiRelaxationSteps}回 / 投影失敗${voronoi.voronoiProjectionFailures}`,
      voronoi.voronoiProjectionFailures === 0 && voronoi.quadConnectionOpenEdges === 0,
    );
  }
  if ("goldbergSiteCount" in result) {
    const goldberg = result as GoldbergPackResult;
    ui.setGoldbergStatus(
      `全${goldberg.goldbergSiteCount}セル / 五角役物${goldberg.goldbergPentagonCount} / ` +
        `六角${goldberg.goldbergHexagonCount} / 投影失敗${goldberg.goldbergProjectionFailures}`,
      goldberg.goldbergProjectionFailures === 0 && goldberg.goldbergIrregularCount === 0
        && goldberg.quadConnectionOpenEdges === 0,
    );
  }
}

function refreshQuadFlowGrid(): void {
  if (state.skinParams.surfaceGenerationMode === "randomPack") {
    currentQuadGrid = null;
    skinRenderer.setQuadFlowGrid(null);
    ui.setQuadFlowStatus("現行ランダムPACKを使用中");
    ui.setVoronoiStatus("Voronoi / CVT を選ぶと種点設定が使えます");
    ui.setGoldbergStatus("六角形＋五角形を選ぶと細分設定が使えます");
    return;
  }
  if (state.skinParams.surfaceGenerationMode === "voronoi") {
    currentQuadGrid = null;
    skinRenderer.setQuadFlowGrid(null);
    ui.setVoronoiStatus(
      `種点${Math.round(state.skinParams.voronoiSeedCount)} / 均し${Math.round(state.skinParams.voronoiRelaxationSteps)}回 / 生成後に投影結果を表示`,
    );
    return;
  }
  if (state.skinParams.surfaceGenerationMode === "goldberg") {
    currentQuadGrid = null;
    skinRenderer.setQuadFlowGrid(null);
    const frequency = Math.round(state.skinParams.goldbergFrequency);
    ui.setGoldbergStatus(`細分${frequency} / 理論セル${10 * frequency * frequency + 2} / 生成後に役物数を表示`);
    return;
  }
  currentQuadGrid = buildQuadFlowGrid(
    state.host,
    state.hostParams.k,
    state.skinParams.quadDivisions,
    state.skinParams.quadTilingMode,
    state.skinParams.quadSizeVariation,
    state.skinParams.seed,
    state.skinParams.quadCurvatureAttraction,
  );
  skinRenderer.setQuadFlowGrid(currentQuadGrid);
  const failed = currentQuadGrid.projectionFailures;
  const tilingLabel = currentQuadGrid.tilingMode === "varied" ? "不均一"
    : currentQuadGrid.tilingMode === "field" ? "曲率密度" : "均一";
  const curvature = currentQuadGrid.tilingMode === "field"
    ? ` / 曲率指標${currentQuadGrid.curvatureMinimum.toFixed(2)}–${currentQuadGrid.curvatureMaximum.toFixed(2)}`
    : "";
  ui.setQuadFlowStatus(
    `${tilingLabel} / 全${currentQuadGrid.cells.length}セル / ` +
      `役物候補${currentQuadGrid.specialCellCount} / ` +
      `特異点${currentQuadGrid.extraordinaryVertexCount} / 投影失敗${failed}${curvature}`,
    failed === 0,
  );
}

function updateEmptyViewportHint(): void {
  emptyViewportHint.textContent = state.skinParams.surfaceGenerationMode === "quadFlow"
    ? "ベース形状を表示中｜格子を確認し、「この設定で表面を生成」を押します"
    : state.skinParams.surfaceGenerationMode === "voronoi"
      ? "ベース形状を表示中｜種点数と均し回数を決め、「この設定で表面を生成」を押します"
      : state.skinParams.surfaceGenerationMode === "goldberg"
        ? "ベース形状を表示中｜細分の密度を決め、「この設定で表面を生成」を押します"
      : "ベース形状を表示中｜1〜4を選び、「この設定で表面を生成」を押します";
  emptyViewportHint.hidden = state.host.length === 0 || state.patches.length > 0;
}

// Debug / verification handle (used by automated checks and the "same shape
// after import" test in README). Read state, or feed a recipe directly.
(window as unknown as Record<string, unknown>).__skin = {
  getHost: () => state.host.map((b) => ({ ...b })),
  getPatches: () => state.patches.map((p) => ({ id: p.id, shape: p.shape, points: p.points.map((pt) => ({ ...pt })) })),
  getHostParams: () => ({ ...state.hostParams }),
  getSkinParams: () => ({ ...state.skinParams }),
  getInternalStructureGraph: () => getInternalStructureGraph(),
  getMotifLowestPoints: () => surfaceAngleCache?.motifLowestPoints.map((marker) => ({
    ...marker,
    position: { ...marker.position },
  })) ?? [],
  getMode: () => state.mode,
  getHistory: () => history.map((e) => ({ ...e })),
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
  setMode: (mode: "plate" | "window") => {
    record(history, state, "setMode", { mode });
    invalidateOpeningMap();
    ui.setMode(state.mode);
    render();
  },
  packPatches: () => {
    const result = packCurrentSurface(state.skinParams, state.patches);
    currentQuadGrid = "quadGrid" in result ? (result as QuadFlowPackResult).quadGrid : null;
    lastPackResult = result;
    record(history, state, "packPatches", { patches: result.patches });
    afterMutation();
    updateSurfacePackStatus(result);
    return result;
  },
  inspectMesh: (options: MeshUiOptions) =>
    buildSkinMesh(
      state.mode, state.host, state.hostParams.k, state.skinParams.thickness, state.patches,
      state.skinParams.roundK, options, state.skinParams.coinBulge, state.skinParams.quadMeshJoinWidth,
      state.skinParams.coinBulgeBalance, getInternalStructureGraph(),
    ),
  getViewMode: () => viewMode,
  getDisplayStyle: () => displayStyle,
  getInternalObservationMode: () => internalObservationMode,
  getInternalLayerVisibility: () => skinRenderer.getLayerVisibility(),
  getOpeningMap: () => openingMapResult ? {
    running: activeOpeningMapWorker !== null,
    displayCount: openingMapDisplayCount,
    scaleMmPerUnit: openingMapResult.scaleMmPerUnit,
    offsetMm: openingMapResult.offsetMm,
    minAreaMm2: openingMapResult.minAreaMm2,
    openings: openingMapResult.openings.map((opening) => ({
      ...opening,
      centroid: { ...opening.centroid },
      averageNormal: { ...opening.averageNormal },
      triangles: opening.triangles.map((triangle) => ({ a: { ...triangle.a }, b: { ...triangle.b }, c: { ...triangle.c } })),
    })),
  } : { running: activeOpeningMapWorker !== null, displayCount: openingMapDisplayCount, openings: [] },
  setViewMode: (mode: SkinViewMode) => setViewMode(mode),
  getTotalPatchPoints: () => totalPatchPoints(),
  getSelectedPatchId: () => selectedPatchId,
  // Direct render-cost measurement (ms/frame averaged over n calls),
  // bypassing requestAnimationFrame -- rAF is throttled or paused entirely
  // in a backgrounded/automated tab (document.hidden), which makes the
  // on-screen fps counter (tick()) unusable for verification in that
  // environment. This calls the SAME renderer.render() the real loop uses,
  // orbiting the camera slightly each call so OrbitControls' damping update
  // isn't skipped, giving an honest per-frame cost independent of tab focus.
  benchmarkRender: (n = 120) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      skinRenderer.camera.position.x += Math.sin(i) * 0.001;
      skinRenderer.render();
    }
    const ms = (performance.now() - t0) / n;
    return { msPerFrame: ms, fps: 1000 / ms, frames: n };
  },
  gauges: () => ({
    mortar: estimateMortar(state.patches),
    coverage: estimateCoverage(state.host, state.hostParams.k, state.skinParams.thickness, state.patches, state.skinParams.roundK),
    patchComponents: estimatePatchComponents(state.patches, state.skinParams.roundK),
    linking: estimateRingLinking(state.patches),
    overlaps: findDeepPatchOverlaps(state.patches),
  }),
  // --- T13 coin由来A/B分割 debug handle (same convention as the rest of
  // __skin: read state, or drive it directly, for manual/automated checks
  // since this project has no test runner -- see AGENTS.md §3) ------------
  getAdjacency: () => buildPatchAdjacency(state.patches, state.skinParams.roundK),
  getSeedIds: () => [...seedPatchIds],
  setSeedIds: (ids: number[]) => {
    seedPatchIds.clear();
    seedAId = ids[0] ?? null;
    seedBId = ids[1] ?? null;
    if (seedAId !== null) seedPatchIds.add(seedAId);
    if (seedBId !== null) seedPatchIds.add(seedBId);
    refreshPartitionDraft();
  },
  proposeGroups: () => {
    lastAdjacencyEdges = buildPatchAdjacency(state.patches, state.skinParams.roundK);
    const proposal = seedAId !== null && seedBId !== null
      ? proposeGroupsBetweenEndpoints(state.patches, lastAdjacencyEdges, seedAId, seedBId)
      : proposeGroupsFromSeeds(state.patches, lastAdjacencyEdges, [...seedPatchIds]);
    draftGroupA = new Set(proposal.groupA);
    draftGroupB = new Set(proposal.groupB);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
    return proposal;
  },
  getDraftGroups: () => ({ groupA: [...draftGroupA], groupB: [...draftGroupB] }),
  draftMatchesConfirmed: () => draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition),
  assignPatchToGroup: (id: number, group: "A" | "B") => {
    ensureDraftInitialized();
    draftGroupA.delete(id);
    draftGroupB.delete(id);
    (group === "A" ? draftGroupA : draftGroupB).add(id);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
  },
  confirmPartition: () => confirmPartition(),
  getPartition: () => (state.partition ? { ...state.partition } : null),
  /** Now Worker-driven (T13 audit fix P0-2) -- returns a Promise that
   * resolves once the build finishes (result, error, or discarded-as-stale),
   * for manual/automated verification (this project has no test runner,
   * see AGENTS.md §3 -- window.__skin is the established debug convention). */
  buildPartition: (): Promise<PartitionResult | null> => {
    buildPartition();
    return new Promise((resolve) => {
      const poll = () => {
        if (activePartitionWorker) {
          setTimeout(poll, 200);
          return;
        }
        resolve(partitionResult);
      };
      setTimeout(poll, 200);
    });
  },
  cancelPartitionBuild: () => cancelPartitionBuild(),
  getPartitionResult: () => partitionResult,
  getPartitionGate: () => partitionResult?.gate ?? null,
  getImportedRecipeInfo: () => ({ filename: importedRecipeFilename, sha256: importedRecipeSha256 }),
  // Guided tutorial (read-only / open-close helpers for verification).
  getPartitionTutorial: () => {
    const actualStep = derivePartitionTutorialStep(buildTutorialSnapshot());
    const displayedStep = tutorialDisplayedStep ?? actualStep;
    return {
      ...tutorialUi,
      step: displayedStep,
      actualStep,
      displayedStep,
      isViewingPast: displayedStep !== actualStep,
      snapshot: buildTutorialSnapshot(),
    };
  },
  openPartitionTutorial: () => tutorialOpen(),
  closePartitionTutorial: () => tutorialClose(),
  tutorialPrev: () => tutorialPrev(),
  tutorialAdvance: () => tutorialAdvance(),
  tutorialRestart: () => tutorialRestart(),
  tutorialReturnToCurrent: () => tutorialReturnToCurrent(),
};

// --- Render loop ------------------------------------------------------

function render(): void {
  skinRenderer.update(
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    state.patches,
    state.skinParams.roundK,
    state.mode,
    selectedPatchId,
    state.skinParams.coinBulge,
    state.skinParams.coinBulgeBalance,
  );
}

let lastFrame = performance.now();
let frameCount = 0;
let fpsAccum = 0;

function renderFrame(now: number): void {
  const dt = now - lastFrame;
  lastFrame = now;
  frameCount++;
  fpsAccum += dt;
  if (fpsAccum >= 500) {
    ui.setFps(1000 / (fpsAccum / frameCount));
    fpsAccum = 0;
    frameCount = 0;
  }
  skinRenderer.render();
  updateQuickEditToolbar();
}

render();
startFrameLoop(renderFrame);

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
import { eventTargetsViewport } from "../../lib/input.ts";
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
import { supportOverlayPickingIncludesBack, type SupportSiteDepthMode } from "./supportOverlayPresentation.ts";
import {
  createViewportClippingState,
  rebaseViewportClippingState,
  reduceViewportClippingState,
  viewportClippingToObjectUnits,
  type ViewportClippingAction,
  type ViewportClippingBounds,
} from "./viewportClipping.ts";
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
import { RHINO_DRAG_THRESHOLD_PX } from "./rhinoViewportControls.ts";
import { chooseProgressivePreviewResolutions } from "./previewMeshBuffers.ts";
import type { PreviewMeshRequest, PreviewMeshWorkerMessage } from "./previewMeshWorkerProtocol.ts";
import type { GaugeBuildRequest, GaugeWorkerMessage } from "./gaugeWorkerProtocol.ts";
import type { MeshExportRequest, MeshExportWorkerMessage } from "./meshExportWorkerProtocol.ts";
import type { InternalPrintGateReport } from "./internalPrintGate.ts";
import type { InternalPrintGateRequest, InternalPrintGateWorkerMessage } from "./internalPrintGateWorkerProtocol.ts";
import type {
  SurfaceAngleDiagnosisRequest,
  SurfaceAngleDiagnosisBuildRequest,
  SurfaceAngleDiagnosisView,
  SurfaceAngleWorkerMessage,
} from "./surfaceAngleWorkerProtocol.ts";
import type { SupportPaintRaycastWorkerMessage, SupportPaintRaycastWorkerRequest } from "./supportPaintRaycastWorkerProtocol.ts";
import type { SurfaceSupportClassificationMessage, SurfaceSupportClassificationRequest } from "./surfaceSupportClassificationWorkerProtocol.ts";
import {
  createSupportPaintInteractionCounters,
  supportPaintInteractionCounterFailures,
  type SupportPaintInteractionCounters,
} from "./supportPaintInteractionCounters.ts";
import {
  buildSurfacePersistentCacheKeys,
  createSurfaceWorkerOnCacheMiss,
  createAutomaticSupportClassificationWorkerOnCacheMiss,
  detectSurfacePersistentCacheCapability,
  readLegacySurfacePersistentCache,
  readSurfacePersistentCache,
  runSurfacePersistentCacheIfAvailable,
  surfacePersistentCacheRoute,
  writeSurfacePersistentCache,
  type SurfaceCacheMissReport,
  type SurfaceMeshCacheValue,
  type SurfacePersistentCacheCapability,
  type SurfacePersistentCacheKeys,
  type SurfaceAngleResult,
} from "./surfaceAnglePersistentCache.ts";
import {
  triangleSoupLongestExtent,
  type BambuSupportType,
} from "./bambu3mf.ts";
import type { Bambu3mfExportRequest, Bambu3mfWorkerMessage } from "./bambu3mfWorkerProtocol.ts";
import { DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS } from "./externalScaffold.ts";
import {
  buildSupportForest,
  outsideLeavesFromAssignments,
  reinforceDryWebGraph,
  retainedVerticalMembers,
  uniformLowestSurfaceLeaves,
  type SupportForestMode,
} from "./branchingSupport.ts";
import { dryWebRoutingFactsText, type DryWebRoutingFacts } from "./dryWebRouting.ts";
import type { DryWebPreviewWorkerMessage, DryWebPreviewWorkerRequest } from "./dryWebPreviewWorkerProtocol.ts";
import {
  buildSkinPrintProfileV1, matchPrintProfile, printProfileSha256, resolveWorkerPrintPlan, validateSkinPrintProfile,
  assertResolvedPrintPlanSupportCounts, assertV088FinalizationReady,
  V088_FUSED_RESOLUTION, V088_SURFACE_RESOLUTION,
  type PrintSupportClassificationCounts, type ResolvedPrintPlan, type SkinPrintProfileV1,
} from "./printProfile.ts";
import {
  applySupportPaintToPolicyResult,
  assignOverhangSupportTargets,
  OVERHANG_SUPPORT_POLICY,
  validateOverhangAssignmentLedger,
  type OverhangSupportPolicyResult,
} from "./overhangSupportPolicy.ts";
import { SUPPORT_REACHABILITY_RAY_EPSILON_VERSION } from "./supportReachability.ts";
import type { OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import {
  HeavyComputationLifecycle,
  HeavyComputationProgressState,
  isCurrentWorkerRun,
} from "./heavyComputationLifecycle.ts";
import {
  appendActiveSupportPaintSample,
  beginSupportPaintStroke,
  buildSupportPaintFrame,
  createSupportPaintSession,
  createSupportPaintStroke,
  emptySupportPaint,
  finishActiveSupportPaintStroke,
  redoSupportPaint,
  resetSupportPaint,
  reviseSupportPaintSession,
  shouldSampleSupportPaintPoint,
  supportPaintSessionDocument,
  undoSupportPaint,
  type SupportPaintMode,
  type SupportPaintStrokeV1,
  type SupportPaintV1,
} from "./supportPaint.ts";
import type { SupportPaintWorkerMessage, SupportPaintWorkerRequest } from "./supportPaintWorkerProtocol.ts";
import { canInvokeShapeUndo, invokeExclusiveSupportPaintUndo, resolveSkinUndoOwner } from "./supportPaintUndoRouting.ts";
import {
  assertSupportPaintDraftBinding, createSupportPaintDraft, serializeSupportPaintDraft,
  supportPaintDraftStorageKey, validateSupportPaintDraft, type SupportPaintDraftV1,
} from "./supportPaintDraft.ts";
import { supportPaintReprojectionFacts } from "./supportPaintReprojection.ts";
import {
  DEFAULT_SKIN_EDITOR_LAYOUT,
  fitSkinEditorLayout,
  resizeSkinEditorBottomPane,
  resizeSkinEditorPane,
  validateSkinEditorLayoutDraft,
  type SkinEditorLayoutDraftV1,
} from "./editorLayout.ts";
import { buildBaseFootprint } from "./baseFootprint.ts";
import { skinViewDirectionLabel } from "./multiViewport.ts";
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

const SKIN_EDITOR_LAYOUT_STORAGE_KEY = "katachi.skin.editor-layout.local.v1";
function loadSkinEditorLayout(): SkinEditorLayoutDraftV1 {
  try {
    const text = localStorage.getItem(SKIN_EDITOR_LAYOUT_STORAGE_KEY);
    return text ? validateSkinEditorLayoutDraft(JSON.parse(text)) : { ...DEFAULT_SKIN_EDITOR_LAYOUT };
  } catch {
    return { ...DEFAULT_SKIN_EDITOR_LAYOUT };
  }
}

type LocalV088ReviewCase = "A" | "B";
type LocalV088ReviewView = "top" | "side" | "back";
let localV088ReviewSelection: {
  reviewCase: LocalV088ReviewCase;
  view: LocalV088ReviewView;
} | null = null;
let localV088ReviewUrlViewPending = false;
let localV088ReviewUrlViewApplied = false;

const app = document.getElementById("app")!;
let editorLayoutState = fitSkinEditorLayout(loadSkinEditorLayout(), window.innerWidth);
let editorLayoutCommitCallback: () => void = () => {};

// Editor-only project chrome. The .fkei actions and project-level Export are
// intentionally visible placeholders until their file/state contracts exist.
// Existing recipe-history controls are attached below after buildUi creates
// their nodes; their callbacks and JSON contract remain unchanged.
const projectBar = document.createElement("header");
projectBar.className = "skin-project-bar";
projectBar.setAttribute("aria-label", "Project actions");
const projectIdentity = document.createElement("div");
projectIdentity.className = "skin-project-identity";
const projectEyebrow = document.createElement("span");
projectEyebrow.className = "skin-project-eyebrow";
projectEyebrow.textContent = "PROJECT";
const projectName = document.createElement("strong");
projectName.className = "skin-project-name";
projectName.textContent = "SKIN";
const projectFormat = document.createElement("span");
projectFormat.className = "skin-project-format";
projectFormat.textContent = ".fkei / author workflow shell";
projectIdentity.append(projectEyebrow, projectName, projectFormat);

const projectActions = document.createElement("nav");
projectActions.className = "skin-project-actions";
projectActions.setAttribute("aria-label", "Project file and history actions");
const projectOpenButton = document.createElement("button");
projectOpenButton.type = "button";
projectOpenButton.className = "skin-project-action is-placeholder";
projectOpenButton.textContent = ".fkei Open";
projectOpenButton.disabled = true;
projectOpenButton.title = ".fkei Open is reserved for the workflow file format task";
const projectSaveButton = document.createElement("button");
projectSaveButton.type = "button";
projectSaveButton.className = "skin-project-action is-placeholder";
projectSaveButton.textContent = ".fkei Save";
projectSaveButton.disabled = true;
projectSaveButton.title = ".fkei Save is reserved for the workflow file format task";
const projectUndoButton = document.createElement("button");
projectUndoButton.type = "button";
projectUndoButton.className = "skin-project-action";
projectUndoButton.textContent = "Undo · Shape";
projectUndoButton.disabled = true;
projectUndoButton.title = "Shape history Undo (Support Paint has its own Undo)";
projectUndoButton.onclick = () => {
  if (supportPaintEnabled) undoOneSupportPaintOperation();
  else requestShapeUndo();
};
const projectRedoButton = document.createElement("button");
projectRedoButton.type = "button";
projectRedoButton.className = "skin-project-action is-placeholder";
projectRedoButton.textContent = "Redo";
projectRedoButton.disabled = true;
projectRedoButton.title = "Shape Redo is not implemented; Support Paint Redo appears while Paint is active";
projectRedoButton.onclick = () => redoOneSupportPaintOperation();
const projectExportButton = document.createElement("button");
projectExportButton.type = "button";
projectExportButton.className = "skin-project-action is-placeholder";
projectExportButton.textContent = "Export";
projectExportButton.disabled = true;
projectExportButton.title = "Project export is reserved for the export task";
projectActions.append(projectOpenButton, projectSaveButton, projectUndoButton, projectRedoButton, projectExportButton);
const projectMeta = document.createElement("div");
projectMeta.className = "skin-project-meta";
projectMeta.textContent = "UI SHELL · author review";
projectBar.append(projectIdentity, projectActions, projectMeta);

const leftPane = document.createElement("aside");
leftPane.className = "skin-editor-pane skin-left-pane";
leftPane.setAttribute("aria-label", "表示ツール");
const leftPaneHeader = document.createElement("header");
leftPaneHeader.className = "skin-pane-header";
leftPaneHeader.innerHTML = "<strong>TOOLS</strong><span>表示操作</span>";
const leftPaneBody = document.createElement("div");
leftPaneBody.className = "skin-pane-body";
leftPane.append(leftPaneHeader, leftPaneBody);
const rightPane = document.createElement("aside");
rightPane.className = "skin-editor-pane skin-right-pane";
rightPane.setAttribute("aria-label", "Workflow and properties");
const rightPaneHeader = document.createElement("header");
rightPaneHeader.className = "skin-pane-header";
rightPaneHeader.innerHTML = "<strong>WORKFLOW</strong><span>工程1–10 · properties below</span>";
const rightPaneBody = document.createElement("div");
rightPaneBody.className = "skin-pane-body";
rightPane.append(rightPaneHeader, rightPaneBody);

function buildWorkflowShell(): HTMLElement {
  const shell = document.createElement("section");
  shell.className = "skin-workflow-shell";
  shell.setAttribute("aria-label", "SKIN author workflow");
  const heading = document.createElement("button");
  heading.type = "button";
  heading.className = "skin-workflow-shell-heading";
  heading.id = "skin-workflow-heading";
  heading.setAttribute("aria-controls", "skin-workflow-map");
  const headingLabel = document.createElement("strong");
  heading.appendChild(headingLabel);
  const workflowMap = document.createElement("div");
  workflowMap.id = "skin-workflow-map";
  workflowMap.className = "skin-workflow-map";
  workflowMap.setAttribute("aria-labelledby", heading.id);
  shell.append(heading, workflowMap);

  let workflowExpanded = true;
  const renderWorkflowState = (): void => {
    headingLabel.textContent = `WORKFLOW ${workflowExpanded ? "▾" : "▸"}`;
    heading.setAttribute("aria-expanded", String(workflowExpanded));
    heading.setAttribute("aria-label", workflowExpanded ? "WORKFLOWを折りたたむ" : "WORKFLOWを展開する");
    workflowMap.hidden = !workflowExpanded;
    workflowMap.setAttribute("aria-hidden", String(!workflowExpanded));
    shell.classList.toggle("is-collapsed", !workflowExpanded);
  };
  heading.addEventListener("click", () => {
    workflowExpanded = !workflowExpanded;
    renderWorkflowState();
  });
  renderWorkflowState();

  const stages: Array<{
    key: "surface" | "internal" | "print";
    title: string;
    note: string;
    steps: Array<{ number: number; label: string; target?: string; available: boolean; note?: string }>;
  }> = [
    {
      key: "surface",
      title: "A — FORM / SURFACE",
      note: "外形から表面診断まで",
      steps: [
        { number: 1, label: "Base", target: "#skin-step-base", available: true },
        { number: 2, label: "Surface composition", target: "#skin-step-surface", available: true },
        { number: 3, label: "Filled Shape", target: "#skin-step-shape", available: true },
        { number: 4, label: "Surface mesh generation", target: ".surface-mesh-generation-panel", available: true },
        { number: 5, label: "Surface angle diagnosis", target: ".surface-angle-diagnosis", available: true },
      ],
    },
    {
      key: "internal",
      title: "B — INTERNAL STRUCTURE",
      note: "作品として残る内部構造",
      steps: [
        { number: 6, label: "Support Paint 1", target: ".support-paint-panel", available: true, note: "draft / current" },
        { number: 7, label: "作品内部の構造", target: "#skin-step-internal", available: true },
        { number: 8, label: "Combined artwork diagnosis / Support Paint 2", available: false, note: "not connected" },
      ],
    },
    {
      key: "print",
      title: "C — PRINT SUPPORT",
      note: "印刷後に外す支え",
      steps: [
        { number: 9, label: "Removable print supports", target: ".phase-a-support-panel", available: true, note: "preview only" },
        { number: 10, label: "Print validation / print runs", target: ".print-preparation", available: true, note: "validation only" },
      ],
    },
  ];

  for (const stage of stages) {
    const group = document.createElement("section");
    group.className = `skin-workflow-group is-${stage.key}`;
    const groupHeader = document.createElement("div");
    groupHeader.className = "skin-workflow-group-header";
    const groupTitle = document.createElement("strong");
    groupTitle.textContent = stage.title;
    const groupNote = document.createElement("span");
    groupNote.textContent = stage.note;
    groupHeader.append(groupTitle, groupNote);
    group.appendChild(groupHeader);

    for (const step of stage.steps) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `skin-workflow-step${step.available ? " is-available" : " is-disabled"}`;
      card.disabled = !step.available;
      card.dataset.step = String(step.number);
      card.dataset.stepLabel = step.label;
      card.setAttribute("aria-label", `${step.number} ${step.label}`);
      if (step.target) card.dataset.workflowTarget = step.target;
      const number = document.createElement("span");
      number.className = "skin-workflow-step-number";
      number.textContent = String(step.number);
      const copy = document.createElement("span");
      copy.className = "skin-workflow-step-copy";
      const label = document.createElement("strong");
      label.textContent = step.label;
      copy.appendChild(label);
      if (step.note) {
        const note = document.createElement("small");
        note.textContent = step.note;
        copy.appendChild(note);
      }
      const state = document.createElement("span");
      state.className = "skin-workflow-step-state";
      state.textContent = step.available ? "available" : "placeholder";
      card.append(number, copy, state);
      group.appendChild(card);
    }
    workflowMap.appendChild(group);
  }
  return shell;
}
const workflowShell = buildWorkflowShell();
function scrollWorkflowTarget(targetSelector: string): void {
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!target) return;
  const panel = target.closest<HTMLElement>(".skin-right-pane .panel");
  if (!panel) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const panelRect = panel.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  panel.scrollTo({
    top: Math.max(0, panel.scrollTop + targetRect.top - panelRect.top - 8),
    behavior: "smooth",
  });
}
workflowShell.querySelectorAll<HTMLButtonElement>(".skin-workflow-step[data-workflow-target]").forEach((card) => {
  const targetSelector = card.dataset.workflowTarget;
  if (!targetSelector) return;
  card.onclick = () => {
    scrollWorkflowTarget(targetSelector);
  };
});

const bottomPane = document.createElement("footer");
bottomPane.className = "skin-bottom-status-pane";
bottomPane.setAttribute("aria-label", "Review status");
const bottomReviewStatus = document.createElement("strong");
bottomReviewStatus.className = "skin-bottom-review";
bottomReviewStatus.textContent = "SKIN editor | --";
const bottomReviewSettings = document.createElement("span");
bottomReviewSettings.className = "skin-bottom-settings";
bottomReviewSettings.textContent = "Surface48 · 119.5mm · 45° · scaffold Ø1.4 / foot Ø2.4mm";
const bottomSupportStatus = document.createElement("div");
bottomSupportStatus.className = "skin-bottom-support";
bottomSupportStatus.textContent = "Support site | 未選択";
bottomSupportStatus.setAttribute("aria-live", "polite");
const bottomAutosaveStatus = document.createElement("div");
bottomAutosaveStatus.className = "skin-bottom-autosave";
bottomAutosaveStatus.textContent = "Autosave | 未保存";
bottomAutosaveStatus.setAttribute("aria-live", "polite");
const bottomRightStatus = document.createElement("div");
bottomRightStatus.className = "skin-bottom-right-status";
const bottomComputation = document.createElement("div");
bottomComputation.className = "skin-bottom-computation";
bottomComputation.hidden = true;
const bottomComputationLabel = document.createElement("strong");
bottomComputationLabel.className = "skin-bottom-computation-label";
const bottomComputationPercent = document.createElement("strong");
bottomComputationPercent.className = "skin-bottom-computation-percent";
const bottomComputationDetail = document.createElement("span");
bottomComputationDetail.className = "skin-bottom-computation-detail";
bottomComputationDetail.setAttribute("aria-live", "polite");
const bottomComputationCancel = document.createElement("button");
bottomComputationCancel.type = "button";
bottomComputationCancel.className = "skin-bottom-computation-cancel";
bottomComputationCancel.textContent = "キャンセル";
bottomComputationCancel.disabled = true;
bottomComputationCancel.onclick = () => cancelActiveHeavyComputation();
bottomComputation.append(bottomComputationLabel, bottomComputationPercent, bottomComputationDetail, bottomComputationCancel);
bottomRightStatus.append(bottomComputation, bottomAutosaveStatus);
const bottomWorkflowSummary = document.createElement("div");
bottomWorkflowSummary.className = "skin-bottom-workflow-summary";
const bottomWorkflowCurrent = document.createElement("span");
bottomWorkflowCurrent.className = "skin-bottom-workflow-current is-placeholder";
bottomWorkflowCurrent.textContent = "Current | not connected";
const bottomWorkflowGeneration = document.createElement("span");
bottomWorkflowGeneration.className = "skin-bottom-workflow-generation is-placeholder";
bottomWorkflowGeneration.textContent = "Generation | not connected";
const bottomWorkflowError = document.createElement("span");
bottomWorkflowError.className = "skin-bottom-workflow-error is-placeholder";
bottomWorkflowError.textContent = "Error | not connected";
const bottomWorkflowStale = document.createElement("span");
bottomWorkflowStale.className = "skin-bottom-workflow-stale is-placeholder";
bottomWorkflowStale.textContent = "Stale result | reserved";
const bottomWorkflowFrozen = document.createElement("span");
bottomWorkflowFrozen.className = "skin-bottom-workflow-frozen is-placeholder";
bottomWorkflowFrozen.textContent = "Frozen split | reserved";
bottomWorkflowSummary.append(bottomWorkflowCurrent, bottomWorkflowGeneration, bottomWorkflowError, bottomWorkflowStale, bottomWorkflowFrozen);
const bottomReviewTools = document.createElement("div");
bottomReviewTools.className = "skin-bottom-review-tools";
bottomReviewTools.hidden = true;
const bottomReviewLegend = document.createElement("span");
bottomReviewLegend.className = "skin-bottom-review-legend";
const bottomReviewChoices = document.createElement("nav");
bottomReviewChoices.className = "skin-bottom-review-choices";
bottomReviewTools.append(bottomReviewLegend, bottomReviewChoices);
bottomPane.append(bottomWorkflowSummary, bottomReviewStatus, bottomReviewSettings, bottomSupportStatus, bottomRightStatus, bottomReviewTools);

interface HeavyComputationHandle {
  id: number;
  update: (detail: string, progress?: number) => void;
  /** Apply observed worker progress and stop any prior visual estimate. */
  updateActual: (detail: string, progress: number) => void;
  smoothTo: (cap: number, durationMs?: number) => void;
  finish: () => void;
}

const heavyComputationLifecycle = new HeavyComputationLifecycle();
const heavyComputationRegistrations = new Map<number, {
  cancel: () => void;
  finish: () => void;
  render: () => void;
}>();
let activeHeavyComputation: { id: number; cancel: () => void; finish: () => void } | null = null;
const HEAVY_PROGRESS_TICK_MS = 250;
const HEAVY_PROGRESS_SMOOTH_DURATION_MS = 60_000;

function beginHeavyComputation(label: string, cancel: () => void): HeavyComputationHandle {
  const operation = heavyComputationLifecycle.begin(label);
  const id = operation.id;
  const progressState = new HeavyComputationProgressState();
  let finished = false;
  let smoothTimer: number | null = null;
  let smoothStartedAt = 0;
  let smoothDurationMs = HEAVY_PROGRESS_SMOOTH_DURATION_MS;
  const render = (): void => {
    const snapshot = progressState.snapshot();
    bottomComputationLabel.textContent = label;
    bottomComputationPercent.textContent = `${snapshot.estimated ? "約" : ""}${Math.round(snapshot.progress)}%`;
    bottomComputationDetail.textContent = snapshot.detail;
  };
  const isVisible = (): boolean => !finished && heavyComputationLifecycle.isVisible(operation);
  const stopSmoothing = (): void => {
    if (smoothTimer !== null) window.clearInterval(smoothTimer);
    smoothTimer = null;
  };
  const tickSmoothing = (): void => {
    if (finished) {
      stopSmoothing();
      return;
    }
    const fraction = Math.min(1, (performance.now() - smoothStartedAt) / smoothDurationMs);
    const completed = progressState.advanceSmoothing(fraction);
    if (isVisible()) render();
    if (completed) stopSmoothing();
  };
  const update = (detail: string, progress?: number): void => {
    if (finished) return;
    const nextProgress = progress;
    // Keep the operation's snapshot current even while another operation is
    // visible; only DOM rendering is visibility-gated.
    progressState.update(detail, nextProgress);
    if (isVisible()) render();
  };
  const updateActual = (detail: string, progressValue: number): void => {
    if (finished) return;
    progressState.updateActual(detail, progressValue);
    if (isVisible()) render();
  };
  const smoothTo = (cap: number, durationMs = HEAVY_PROGRESS_SMOOTH_DURATION_MS): void => {
    if (finished || !progressState.smoothTo(cap)) return;
    stopSmoothing();
    smoothStartedAt = performance.now();
    smoothDurationMs = Math.max(1, durationMs);
    smoothTimer = window.setInterval(tickSmoothing, HEAVY_PROGRESS_TICK_MS);
    tickSmoothing();
  };
  const finish = (): void => {
    if (finished) return;
    finished = true;
    stopSmoothing();
    heavyComputationRegistrations.delete(id);
    const revealed = heavyComputationLifecycle.finish(operation);
    if (revealed) {
      const registration = heavyComputationRegistrations.get(revealed.id);
      if (registration) {
        activeHeavyComputation = { id: revealed.id, cancel: registration.cancel, finish: registration.finish };
        bottomComputation.hidden = false;
        bottomComputationCancel.disabled = false;
        registration.render();
        return;
      }
    }
    if (activeHeavyComputation?.id === id || !heavyComputationLifecycle.current()) {
      activeHeavyComputation = null;
      bottomComputation.hidden = true;
      bottomComputationCancel.disabled = true;
      bottomComputationPercent.textContent = "";
      bottomComputationDetail.textContent = "";
    }
  };
  heavyComputationRegistrations.set(id, { cancel, finish, render });
  activeHeavyComputation = { id, cancel, finish };
  bottomComputation.hidden = false;
  bottomComputationCancel.disabled = false;
  render();
  return { id, update, updateActual, smoothTo, finish };
}

function cancelActiveHeavyComputation(): void {
  const active = activeHeavyComputation;
  if (!active) return;
  active.cancel();
  if (activeHeavyComputation?.id === active.id) {
    active.finish();
  }
}

function workerFractionPercent(fraction: number): number {
  return Number.isFinite(fraction) ? Math.max(0, Math.min(100, fraction * 100)) : 0;
}

const bottomPaneDivider = document.createElement("div");
bottomPaneDivider.className = "skin-bottom-pane-divider";
bottomPaneDivider.setAttribute("role", "separator");
bottomPaneDivider.setAttribute("aria-orientation", "horizontal");
bottomPaneDivider.tabIndex = 0;
const bottomPaneToggle = document.createElement("button");
bottomPaneToggle.type = "button";
bottomPaneToggle.className = "skin-bottom-pane-collapse";
bottomPaneToggle.setAttribute("aria-label", "下部ステータスペインを開閉");
bottomPaneToggle.onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  editorLayoutState = { ...editorLayoutState, bottomCollapsed: !editorLayoutState.bottomCollapsed };
  applyEditorLayoutDom();
  skinRenderer.resize();
  commitEditorLayout();
};
bottomPaneDivider.appendChild(bottomPaneToggle);

function buildPaneDivider(side: "left" | "right"): HTMLDivElement {
  const divider = document.createElement("div");
  divider.className = `skin-pane-divider is-${side}`;
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-orientation", "vertical");
  divider.tabIndex = 0;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "skin-pane-collapse";
  toggle.setAttribute("aria-label", side === "left" ? "左ツールペインを開閉" : "右Propertiesを開閉");
  toggle.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (side === "left") editorLayoutState = { ...editorLayoutState, leftCollapsed: !editorLayoutState.leftCollapsed };
    else if (!editorLayoutState.rightCollapsed) {
      editorLayoutState = { ...editorLayoutState, rightCollapsed: true };
    } else {
      // At narrow widths fitSkinEditorLayout intentionally keeps the center
      // usable by collapsing the right pane when both side panes are open.
      // Opening the right pane is still an explicit author action, so let it
      // take the available side width and collapse the opposite pane when
      // necessary. No new layout state or persistence contract is introduced.
      const workspaceWidth = app.clientWidth || window.innerWidth;
      const candidate = fitSkinEditorLayout(
        { ...editorLayoutState, rightCollapsed: false },
        workspaceWidth,
      );
      editorLayoutState = candidate.rightCollapsed
        ? fitSkinEditorLayout(
          { ...editorLayoutState, leftCollapsed: true, rightCollapsed: false },
          workspaceWidth,
        )
        : candidate;
    }
    applyEditorLayoutDom();
    if (side === "right") skinRenderer.resize();
    commitEditorLayout();
  };
  divider.appendChild(toggle);
  return divider;
}
const leftPaneDivider = buildPaneDivider("left");
const rightPaneDivider = buildPaneDivider("right");
const viewport = document.createElement("div");
viewport.id = "viewport";
app.append(projectBar, leftPane, leftPaneDivider, viewport, rightPaneDivider, rightPane, bottomPaneDivider, bottomPane);

function applyEditorLayoutDom(): void {
  const fitted = fitSkinEditorLayout(editorLayoutState, app.clientWidth || window.innerWidth);
  editorLayoutState = fitted;
  const leftWidth = fitted.leftCollapsed ? 0 : fitted.leftWidthPx;
  const rightWidth = fitted.rightCollapsed ? 0 : fitted.rightWidthPx;
  app.style.gridTemplateColumns = `${leftWidth}px 8px minmax(360px, 1fr) 8px ${rightWidth}px`;
  app.style.gridTemplateRows = `42px minmax(240px, 1fr) 8px ${fitted.bottomCollapsed ? 0 : fitted.bottomHeightPx}px`;
  leftPane.hidden = fitted.leftCollapsed;
  rightPane.hidden = fitted.rightCollapsed;
  leftPaneDivider.classList.toggle("is-collapsed", fitted.leftCollapsed);
  rightPaneDivider.classList.toggle("is-collapsed", fitted.rightCollapsed);
  leftPaneDivider.querySelector("button")!.textContent = fitted.leftCollapsed ? "›" : "‹";
  rightPaneDivider.querySelector("button")!.textContent = fitted.rightCollapsed ? "‹" : "›";
  bottomPane.hidden = fitted.bottomCollapsed;
  bottomPaneDivider.classList.toggle("is-collapsed", fitted.bottomCollapsed);
  bottomPaneToggle.textContent = fitted.bottomCollapsed ? "STATUS ▲" : "STATUS ▼";
}
function persistEditorLayout(): void {
  localStorage.setItem(SKIN_EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(editorLayoutState));
}
function commitEditorLayout(): void {
  persistEditorLayout();
  editorLayoutCommitCallback();
}
applyEditorLayoutDom();

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

const supportPaintCssBrush = document.createElement("div");
supportPaintCssBrush.className = "support-paint-css-brush";
supportPaintCssBrush.hidden = true;
supportPaintCssBrush.setAttribute("aria-hidden", "true");
viewport.appendChild(supportPaintCssBrush);

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
let phaseADryWebPreview: {
  surfaceFingerprint: string;
  resolution: number;
  paintRevision: number;
  graph: InternalStructureGraph;
  facts: DryWebRoutingFacts;
  computeMs: number;
} | null = null;
let activeDryWebPreviewWorker: Worker | null = null;
let dryWebPreviewGeneration = 0;
let dryWebPreviewRequestId = 0;
let dryWebPreviewPending = false;
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
let renderFrameRequestId: number | null = null;
let renderFrameScope: "none" | "active" | "full" = "none";
let activePreviewMeshWorker: Worker | null = null;
let previewMeshHeavyComputation: HeavyComputationHandle | null = null;
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
let internalPrintGateHeavyComputation: HeavyComputationHandle | null = null;
let internalPrintGateRequestId = 0;
let internalPrintGateGeneration = 0;
let pendingInternalPrintGateFingerprint = "";
let internalPrintGateCache: { fingerprint: string; report: InternalPrintGateReport; stl: ArrayBuffer } | null = null;
let internalPrintGateStatusTimer: number | null = null;
let activeSurfaceAngleWorker: Worker | null = null;
let activeSurfaceSupportClassificationWorker: Worker | null = null;
let surfaceHeavyComputation: HeavyComputationHandle | null = null;
const SURFACE_PROGRESS_CACHE_LOOKUP = 2;
const SURFACE_PROGRESS_WORKER_START = 5;
const SURFACE_PROGRESS_CLASSIFICATION = 80;
let surfaceAngleGeneration = 0;
let surfaceAngleCache: Extract<SurfaceAngleWorkerMessage, { type: "result" }> | null = null;
let activeSurfacePersistentCacheKeys: SurfacePersistentCacheKeys | null = null;
let activeSurfaceCacheMissReport: SurfaceCacheMissReport | null = null;
let activeLegacySurfaceCacheKey: string | null = null;
let surfaceAnglePersistentCacheStatus: "idle" | "miss" | "mesh-hit" | "hit" | "migrated" | "ledger-upgrade" | "stored" | "unavailable" | "error" = "idle";
let surfacePersistentCacheCapability: SurfacePersistentCacheCapability = detectSurfacePersistentCacheCapability();
let surfaceWorkerLaunchCount = 0;
let surfaceGenerationWorkerLaunchCount = 0;
let automaticFaceDiagnosisWorkerLaunchCount = 0;
let automaticSupportClassificationWorkerLaunchCount = 0;
let paintBvhWorkerLaunchCount = 0;
let surfaceCacheLookupMs = 0;
let surfaceClassificationRestoreMs = 0;
let supportClassificationComputeMs = 0;
let paintBvhBuildMs = 0;
const skinBootStartedAt = (performance.getEntriesByType("navigation")[0]?.startTime ?? performance.now());
let skinShellInteractiveMs: number | null = null;
let reviewRecipeLoadMs = 0;
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
let showOverhangSupportSites = true;
let showMixedSupportFaces = false;
let showSupportFootprint = true;
let supportSiteDepthMode: SupportSiteDepthMode = "show-back";
let supportPaintEnabled = false;
let supportPaintMode: SupportPaintMode = "inside";
let supportPaintRadiusMm = 6;
let supportPaintBackfaces = false;
let supportPaintSession = createSupportPaintSession();
let supportPaintStatusText = "自動分類を下書きとして表示中";
let supportPaintDraftSavedAt: string | null = null;
let supportPaintDraftDirty = false;
let activeSupportPaintReprojectionWorker: Worker | null = null;
let supportPaintReprojectionHeavyComputation: HeavyComputationHandle | null = null;
let supportPaintReprojectionGeneration = 0;
let supportPaintReprojectionStatus = "未検証";
const SUPPORT_PAINT_REPROJECTION_RESOLUTION = 48;
const SUPPORT_PAINT_PRINT_RESOLUTION = V088_SURFACE_RESOLUTION;
const RUNNING_APP_COMMIT = import.meta.env.VITE_GIT_COMMIT;
if (!/^[0-9a-f]{40}$/.test(RUNNING_APP_COMMIT)) {
  throw new Error("SKIN v088 boot error: exact running app commit SHA is unavailable");
}
let v088Surface128Proof: {
  surfaceAngleGeneration: number;
  resolution: number;
  counts: PrintSupportClassificationCounts;
} | null = null;
let activeSupportPaintWorker: Worker | null = null;
let supportPaintApplyWorkerReady = false;
let supportPaintApplyGeneration = 0;
let supportPaintApplyRequestId = 0;
let supportPaintApplyReplacePending = 0;
const supportPaintDryWebRefreshRequestIds = new Set<number>();
let activeSupportPaintRaycastWorker: Worker | null = null;
let supportPaintRaycastHeavyComputation: HeavyComputationHandle | null = null;
let supportPaintRaycastGeneration = 0;
let supportPaintRaycastReady = false;
let supportPaintRaycastRequestId = 0;
let supportPaintInteractionCounters = createSupportPaintInteractionCounters();
let lastSupportPaintInteractionCounters: SupportPaintInteractionCounters | null = null;
let supportPaintSurfaceCache: {
  diagnosis: Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
  targetLongestMm: number;
  positionsMm: Float32Array;
  frame: ReturnType<typeof buildSupportPaintFrame>;
  scaleMmPerUnit: number;
} | null = null;
let supportPaintDrag: {
  pointerId: number;
  lastSampleCenterMm: { xMm: number; yMm: number; zMm: number } | null;
  latestPointer: { clientX: number; clientY: number } | null;
  inFlightRequestId: number | null;
  inFlightStartedAt: number;
  lastRaycastDispatchMs: number;
  throttleTimer: number | null;
  finishing: boolean;
  commitOnFinish: boolean;
  surfaceRaycastDurationsMs: number[];
  pointerDurationsMs: number[];
  brushCircleDurationsMs: number[];
  paintDisplayDurationsMs: number[];
  dabStartedAt: Map<number, number>;
  pendingDabCount: number;
  previewChanges: Map<string, "inside" | "outside" | "unresolved">;
  journalBefore: Map<string, SupportPaintLiveChange>;
  journalAfter: Map<string, SupportPaintLiveChange>;
  journalFactsBefore: SupportPaintLiveFacts;
  adaptiveRaycastIntervalMs: number;
  lastMetricsUiMs: number;
  siteCount: number;
  startedAt: number;
  changed: boolean;
} | null = null;
let viewportClippingBoundsMm: ViewportClippingBounds | null = null;
let viewportClippingStateMm = createViewportClippingState();
let viewportClippingScaleMmPerUnit = 1;
let viewportClippingLastMeshRevision = -1;
let viewportClippingLastPreviewGeneration = -1;
let viewportClippingLastTargetLongestMm = Number.NaN;

let activeOpeningMapWorker: Worker | null = null;
let openingMapHeavyComputation: HeavyComputationHandle | null = null;
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
let partitionHeavyComputation: HeavyComputationHandle | null = null;
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
let automaticOverhangSupportResult: OverhangSupportPolicyResult | null = null;
let overhangSupportResult: OverhangSupportPolicyResult | null = null;
let selectedOverhangSupportSiteId: string | null = null;

// --- Generation-native N partition state ---------------------------------
let draftNGroups: number[][] = [];
let nSeedIds: number[] = [];
let nPartitionResult: NPartitionResult | null = null;
let activeNPartitionWorker: Worker | null = null;
let nPartitionHeavyComputation: HeavyComputationHandle | null = null;
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
skinRenderer.setFourViewSplit(editorLayoutState.fourSplitX, editorLayoutState.fourSplitY);

function refreshBottomStatusPane(): void {
  const editorView = skinRenderer.captureEditorViewDraft(editorLayoutState);
  const direction = editorView.viewports[editorView.selectedViewport]?.direction;
  const directionLabel = direction ? skinViewDirectionLabel(direction) : "--";
  bottomReviewStatus.textContent = localV088ReviewSelection
    ? `v088 exception review | Case ${localV088ReviewSelection.reviewCase} | ${directionLabel}`
    : `SKIN editor | ${directionLabel}`;

  const selectedEntry = selectedOverhangSupportSiteId && overhangSupportResult
    ? overhangSupportResult.entries.find((entry) => entry.id === selectedOverhangSupportSiteId) ?? null
    : null;
  if (selectedEntry) {
    const lowerDistance = selectedEntry.nearestLowerSurfaceDistanceMm;
    const distanceText = lowerDistance == null ? "下側Surfaceなし" : `下側Surface ${lowerDistance.toFixed(4)} mm`;
    const basis = selectedEntry.rayResult ?? selectedEntry.reason ?? "ray-unresolved";
    bottomSupportStatus.textContent = `Support site | ${selectedEntry.classification} | ${basis} | ${distanceText}`;
    bottomSupportStatus.dataset.classification = selectedEntry.classification;
  } else {
    bottomSupportStatus.textContent = "Support site | 未選択";
    bottomSupportStatus.dataset.classification = "none";
  }
  bottomAutosaveStatus.textContent = `Autosave | ${supportPaintDraftStatusText()}`;
}

refreshBottomStatusPane();

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
  // never bubble into that path or the trackball behind the overlay.
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
function viewportBoundsFromObject(
  objectBounds: ViewportClippingBounds,
  scaleMmPerUnit: number,
): ViewportClippingBounds {
  return {
    x: { min: objectBounds.x.min * scaleMmPerUnit, max: objectBounds.x.max * scaleMmPerUnit },
    y: { min: objectBounds.y.min * scaleMmPerUnit, max: objectBounds.y.max * scaleMmPerUnit },
    z: { min: objectBounds.z.min * scaleMmPerUnit, max: objectBounds.z.max * scaleMmPerUnit },
  };
}

function currentViewportBoundsObject(): ViewportClippingBounds | null {
  const meshBounds = skinRenderer.getMeshBoundsObject();
  if (meshBounds) return meshBounds;
  if (state.host.length === 0) return null;
  const bounds = computeSkinSamplingBounds(
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    state.patches,
  );
  return {
    x: { min: bounds.min.x, max: bounds.max.x },
    y: { min: bounds.min.y, max: bounds.max.y },
    z: { min: bounds.min.z, max: bounds.max.z },
  };
}

function applyViewportClippingState(): void {
  const bounds = viewportClippingBoundsMm;
  if (!bounds) {
    skinRenderer.setViewportClippingState(null);
    ui.setViewportClippingState(false, null, viewportClippingStateMm);
    return;
  }
  skinRenderer.setViewportClippingState(
    viewportClippingToObjectUnits(viewportClippingStateMm, viewportClippingScaleMmPerUnit),
  );
  ui.setViewportClippingState(true, bounds, viewportClippingStateMm);
}

function refreshViewportClippingBounds(force = false): void {
  const meshRevision = skinRenderer.getMeshBoundsRevision();
  const targetLongestMm = ui.getMeshOptions().targetLongestMm;
  if (!force &&
    meshRevision === viewportClippingLastMeshRevision &&
    previewMeshGeneration === viewportClippingLastPreviewGeneration &&
    targetLongestMm === viewportClippingLastTargetLongestMm
  ) return;
  viewportClippingLastMeshRevision = meshRevision;
  viewportClippingLastPreviewGeneration = previewMeshGeneration;
  viewportClippingLastTargetLongestMm = targetLongestMm;
  const objectBounds = currentViewportBoundsObject();
  if (!objectBounds) {
    viewportClippingBoundsMm = null;
    applyViewportClippingState();
    return;
  }
  const longest = Math.max(
    objectBounds.x.max - objectBounds.x.min,
    objectBounds.y.max - objectBounds.y.min,
    objectBounds.z.max - objectBounds.z.min,
  );
  if (!(longest > 0) || !(targetLongestMm > 0)) {
    viewportClippingBoundsMm = null;
    applyViewportClippingState();
    return;
  }
  const nextScale = targetLongestMm / longest;
  const nextBounds = viewportBoundsFromObject(objectBounds, nextScale);
  viewportClippingStateMm = rebaseViewportClippingState(
    viewportClippingStateMm,
    viewportClippingBoundsMm,
    nextBounds,
  );
  viewportClippingBoundsMm = nextBounds;
  viewportClippingScaleMmPerUnit = nextScale;
  applyViewportClippingState();
}

function updateViewportClipping(action: ViewportClippingAction): void {
  if (!viewportClippingBoundsMm) return;
  viewportClippingStateMm = reduceViewportClippingState(
    viewportClippingStateMm,
    viewportClippingBoundsMm,
    action,
  );
  applyViewportClippingState();
}

const ui = buildUi(app, state.hostParams, state.skinParams, state.mode, manifest.version, manifest.updatedAt, {
  onUndo: () => requestShapeUndo(),
  onUndoSteps: (steps) => requestShapeUndoSteps(steps),
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
  onViewportClippingAction: (action) => updateViewportClipping(action),
  onDiagnoseSurfaceAngles: (thresholdDeg) => startSurfaceAngleDiagnosis(thresholdDeg),
  onShowSurfaceDiagnostics: () => formatSurfaceEnvironmentDiagnostics(),
  onSetSurfaceAngleDiagnosisView: (diagnosisView) => showSurfaceAngleDiagnosisView(diagnosisView),
  onSurfaceAngleThresholdChange: () => { invalidateSurfaceAngleDiagnosis("閾値が変わりました。もう一度診断してください"); refreshPrintProfileSummary(); },
  onToggleOverhangSupportSites: (show) => {
    showOverhangSupportSites = show;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onSetOverhangSupportDepthMode: (mode) => {
    supportSiteDepthMode = mode;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onToggleMixedSupportFaces: (show) => {
    showMixedSupportFaces = show;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onToggleSupportFootprint: (show) => {
    showSupportFootprint = show;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onSetSupportPaintEnabled: (enabled) => setSupportPaintEnabled(enabled),
  onSetSupportPaintMode: (mode) => { supportPaintMode = mode; markSupportPaintDraftDirty(); refreshSupportPaintUi(); },
  onSetSupportPaintRadiusMm: (radiusMm) => { supportPaintRadiusMm = radiusMm; markSupportPaintDraftDirty(); refreshSupportPaintUi(); },
  onSetSupportPaintBackfaces: (enabled) => { supportPaintBackfaces = enabled; markSupportPaintDraftDirty(); refreshSupportPaintUi(); },
  onUndoSupportPaint: () => undoOneSupportPaintOperation(),
  onRedoSupportPaint: () => redoOneSupportPaintOperation(),
  onResetSupportPaint: () => { supportPaintSession = reviseSupportPaintSession(supportPaintSession, resetSupportPaint(supportPaintSession.history)); resetSupportPaintUndoJournal(); invalidateSupportPaintReprojection(); autosaveSupportPaintDraft(); reapplySupportPaint("Support Paintを自動分類へ戻しました", supportPaintSession.history.present, true); },
  onSaveSupportPaintDraft: () => saveSupportPaintDraftDownload(),
  onLoadSupportPaintDraft: (file) => loadSupportPaintDraftFile(file),
  onVerifySupportPaintReprojection: () => startSupportPaintReprojectionVerification(),
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

// Move the existing history DOM nodes into PROJECT without rebuilding them or
// registering a second set of handlers. The Properties root keeps all other
// controls, including Shape/Paint Undo and the frozen experiment group.
projectActions.appendChild(ui.historyIoRoot);

interface PhaseASupportPreviewSettings {
  supportMode: SupportForestMode;
  objectLiftMm: number;
  tipRadiusMm: number;
  trunkMinimumRadiusMm: number;
  loadWidening: number;
  maximumUnsupportedLengthMm: number;
  branchAngleDeg: number;
  baseVolumeVerticalSupports: boolean;
  dryWebMinimumDiameterMm: number;
  dryWebMaximumUnreinforcedLengthMm: number;
}

const phaseASupportSettings: PhaseASupportPreviewSettings = {
  supportMode: "branching",
  objectLiftMm: 1.2,
  tipRadiusMm: 0.35,
  trunkMinimumRadiusMm: 0.70,
  loadWidening: 0.08,
  maximumUnsupportedLengthMm: 12,
  branchAngleDeg: 40,
  baseVolumeVerticalSupports: false,
  dryWebMinimumDiameterMm: 1.6,
  dryWebMaximumUnreinforcedLengthMm: 12,
};

const phaseASupportPanel = document.createElement("section");
phaseASupportPanel.className = "phase-a-support-panel";
phaseASupportPanel.dataset.phaseA = "support-forest";
const phaseATitle = document.createElement("h3");
phaseATitle.textContent = "PRINT SUPPORT / 9 Removable print supports";
const phaseANote = document.createElement("p");
phaseANote.className = "phase-a-support-note";
phaseANote.textContent = "Surface 48 / Case A用。現在のSupport Paint分類を葉として使い、書き出しは行いません。";
const phaseAControls = document.createElement("div");
phaseAControls.className = "phase-a-support-controls";

function addPhaseANumberControl(
  labelText: string,
  key: Exclude<keyof PhaseASupportPreviewSettings, "supportMode" | "baseVolumeVerticalSupports">,
  min: number,
  max: number,
  step: number,
  suffix: string,
): void {
  const label = document.createElement("label");
  label.textContent = labelText;
  const valueWrap = document.createElement("span");
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(phaseASupportSettings[key]);
  input.dataset.phaseAControl = key;
  const unit = document.createElement("small");
  unit.textContent = suffix;
  input.addEventListener("change", () => {
    const value = Math.max(min, Math.min(max, Number(input.value)));
    if (!Number.isFinite(value)) return;
    phaseASupportSettings[key] = value;
    input.value = String(value);
    refreshPhaseASupportPreview();
  });
  valueWrap.append(input, unit);
  label.append(valueWrap);
  phaseAControls.appendChild(label);
}

const phaseAModeLabel = document.createElement("label");
phaseAModeLabel.textContent = "support mode";
const phaseAModeSelect = document.createElement("select");
phaseAModeSelect.dataset.phaseAControl = "supportMode";
for (const [value, text] of [["vertical", "Vertical（旧比較）"], ["branching", "Branching"]] as const) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  option.selected = value === phaseASupportSettings.supportMode;
  phaseAModeSelect.appendChild(option);
}
phaseAModeSelect.addEventListener("change", () => {
  phaseASupportSettings.supportMode = phaseAModeSelect.value as SupportForestMode;
  refreshPhaseASupportPreview();
});
phaseAModeLabel.appendChild(phaseAModeSelect);
phaseAControls.appendChild(phaseAModeLabel);
addPhaseANumberControl("object lift", "objectLiftMm", 0, 3, 0.1, "mm");
addPhaseANumberControl("tip radius", "tipRadiusMm", 0.2, 0.8, 0.05, "mm");
addPhaseANumberControl("trunk minimum radius", "trunkMinimumRadiusMm", 0.4, 2, 0.05, "mm");
addPhaseANumberControl("load widening", "loadWidening", 0, 0.2, 0.01, "r + k√L");
addPhaseANumberControl("maximum unsupported length", "maximumUnsupportedLengthMm", 4, 30, 1, "mm");
addPhaseANumberControl("branch angle", "branchAngleDeg", 25, 45, 1, "° from vertical");

const phaseAVerticalLabel = document.createElement("label");
phaseAVerticalLabel.className = "phase-a-support-checkbox";
const phaseAVerticalInput = document.createElement("input");
phaseAVerticalInput.type = "checkbox";
phaseAVerticalInput.dataset.phaseAControl = "baseVolumeVerticalSupports";
phaseAVerticalInput.checked = phaseASupportSettings.baseVolumeVerticalSupports;
phaseAVerticalInput.addEventListener("change", () => {
  phaseASupportSettings.baseVolumeVerticalSupports = phaseAVerticalInput.checked;
  refreshPhaseASupportPreview();
});
phaseAVerticalLabel.append(phaseAVerticalInput, document.createTextNode("base-volume vertical supports ON"));
phaseAControls.appendChild(phaseAVerticalLabel);
addPhaseANumberControl("Dry Web minimum diameter", "dryWebMinimumDiameterMm", 0.8, 4, 0.1, "mm");
addPhaseANumberControl("Dry Web maximum unreinforced", "dryWebMaximumUnreinforcedLengthMm", 4, 30, 1, "mm");

const phaseASupportStatus = document.createElement("p");
phaseASupportStatus.className = "phase-a-support-status";
phaseASupportStatus.textContent = "Surface診断後に支持林を表示します";
const phaseARefreshButton = document.createElement("button");
phaseARefreshButton.type = "button";
phaseARefreshButton.className = "phase-a-support-refresh";
phaseARefreshButton.textContent = "現在のPaint分類からpreview更新";
phaseARefreshButton.addEventListener("click", () => refreshPhaseASupportPreview());
phaseASupportPanel.append(phaseATitle, phaseANote, phaseAControls, phaseARefreshButton, phaseASupportStatus);
const surfaceAnglePanel = ui.root.querySelector(".surface-angle-diagnosis");
if (surfaceAnglePanel) surfaceAnglePanel.insertAdjacentElement("afterend", phaseASupportPanel);
else ui.root.appendChild(phaseASupportPanel);

rightPaneBody.append(workflowShell, ui.root);
leftPaneBody.appendChild(ui.displayToolsRoot);

function installPaneResize(divider: HTMLDivElement, side: "left" | "right"): void {
  let drag: {
    pointerId: number;
    pendingX: number;
    frameId: number;
    restoreOrbit: boolean;
  } | null = null;
  const applyPending = () => {
    if (!drag) return;
    drag.frameId = 0;
    const rect = app.getBoundingClientRect();
    editorLayoutState = resizeSkinEditorPane(editorLayoutState, side, drag.pendingX, rect.left, rect.right);
    editorLayoutState = fitSkinEditorLayout(editorLayoutState, rect.width);
    applyEditorLayoutDom();
    skinRenderer.resize();
  };
  divider.addEventListener("pointerdown", (event) => {
    if (event.target !== divider || drag) return;
    event.preventDefault();
    event.stopPropagation();
    divider.setPointerCapture(event.pointerId);
    const restoreOrbit = !supportPaintEnabled;
    skinRenderer.setOrbitEnabled(false);
    drag = { pointerId: event.pointerId, pendingX: event.clientX, frameId: 0, restoreOrbit };
    divider.classList.add("is-dragging");
  });
  divider.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.pendingX = event.clientX;
    if (drag.frameId === 0) drag.frameId = requestAnimationFrame(applyPending);
  });
  const finish = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frameId !== 0) {
      cancelAnimationFrame(drag.frameId);
      applyPending();
    }
    const restoreOrbit = drag.restoreOrbit;
    drag = null;
    divider.classList.remove("is-dragging");
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
    skinRenderer.setOrbitEnabled(restoreOrbit);
    commitEditorLayout();
  };
  divider.addEventListener("pointerup", finish);
  divider.addEventListener("pointercancel", finish);
  divider.addEventListener("dblclick", (event) => {
    if (event.target !== divider) return;
    event.preventDefault();
    editorLayoutState = {
      ...editorLayoutState,
      ...(side === "left"
        ? { leftWidthPx: DEFAULT_SKIN_EDITOR_LAYOUT.leftWidthPx, leftCollapsed: false }
        : { rightWidthPx: DEFAULT_SKIN_EDITOR_LAYOUT.rightWidthPx, rightCollapsed: false }),
    };
    applyEditorLayoutDom();
    skinRenderer.resize();
    commitEditorLayout();
  });
}
installPaneResize(leftPaneDivider, "left");
installPaneResize(rightPaneDivider, "right");

function installBottomPaneResize(divider: HTMLDivElement): void {
  let drag: { pointerId: number; pendingY: number; frameId: number; restoreOrbit: boolean } | null = null;
  const applyPending = () => {
    if (!drag) return;
    drag.frameId = 0;
    const rect = app.getBoundingClientRect();
    editorLayoutState = resizeSkinEditorBottomPane(editorLayoutState, drag.pendingY, rect.bottom);
    applyEditorLayoutDom();
    skinRenderer.resize();
  };
  divider.addEventListener("pointerdown", (event) => {
    if (event.target !== divider || drag) return;
    event.preventDefault();
    event.stopPropagation();
    divider.setPointerCapture(event.pointerId);
    const restoreOrbit = !supportPaintEnabled;
    skinRenderer.setOrbitEnabled(false);
    editorLayoutState = { ...editorLayoutState, bottomCollapsed: false };
    drag = { pointerId: event.pointerId, pendingY: event.clientY, frameId: 0, restoreOrbit };
    divider.classList.add("is-dragging");
  });
  divider.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.pendingY = event.clientY;
    if (drag.frameId === 0) drag.frameId = requestAnimationFrame(applyPending);
  });
  const finish = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frameId !== 0) { cancelAnimationFrame(drag.frameId); applyPending(); }
    const restoreOrbit = drag.restoreOrbit;
    drag = null;
    divider.classList.remove("is-dragging");
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
    skinRenderer.setOrbitEnabled(restoreOrbit);
    commitEditorLayout();
  };
  divider.addEventListener("pointerup", finish);
  divider.addEventListener("pointercancel", finish);
  divider.addEventListener("dblclick", (event) => {
    if (event.target !== divider) return;
    event.preventDefault();
    editorLayoutState = {
      ...editorLayoutState,
      bottomHeightPx: DEFAULT_SKIN_EDITOR_LAYOUT.bottomHeightPx,
      bottomCollapsed: false,
    };
    applyEditorLayoutDom();
    skinRenderer.resize();
    commitEditorLayout();
  });
}
installBottomPaneResize(bottomPaneDivider);

editorLayoutCommitCallback = () => {
  markSupportPaintDraftDirty();
  autosaveSupportPaintDraft();
  refreshBottomStatusPane();
  requestRenderFrame();
};
let layoutResizeFrame = 0;
window.addEventListener("resize", () => {
  if (layoutResizeFrame !== 0) return;
  layoutResizeFrame = requestAnimationFrame(() => {
    layoutResizeFrame = 0;
    editorLayoutState = fitSkinEditorLayout(editorLayoutState, app.clientWidth || window.innerWidth);
    applyEditorLayoutDom();
    skinRenderer.resize();
    persistEditorLayout();
  });
});
ui.setMode(state.mode);
skinRenderer.resize();
// Defer model/renderer initialization until after the browser has painted the interactive shell.

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
  options: { commit?: boolean; enforceProfile?: boolean } = {},
): OverhangSupportPolicyResult {
  const sourceLongest = triangleSoupLongestExtent(message.basePositions);
  const targetLongestMm = ui.getMeshOptions().targetLongestMm;
  if (!(sourceLongest > 0) || !(targetLongestMm > 0)) throw new Error("Fail closed: BODYの実寸Scaleを求められませんでした");
  const scaleMmPerUnit = targetLongestMm / sourceLongest;
  const diagnosedPositionsMm = new Float32Array(message.beforeDangerPositions.map((value) => value * scaleMmPerUnit));
  const supportSurfacePositionsMm = new Float32Array(message.basePositions.map((value) => value * scaleMmPerUnit));
  const baseFootprint = buildBaseFootprint(state.host, state.hostParams.k, scaleMmPerUnit);
  const automaticResult = assignOverhangSupportTargets({
    diagnosedFaces: splitTriangleSoup(diagnosedPositionsMm),
    supportSurfacePositionsMm,
    explicitTargets: activePrintProfile?.scaffold.explicitTargets ?? [],
    baseFootprint,
  });
  if (options.commit !== false) automaticOverhangSupportResult = automaticResult;
  const paint = supportPaintSession.history.present.strokes.length > 0 ? supportPaintSession.history.present : null;
  const result = applySupportPaintToPolicyResult(automaticResult, supportSurfacePositionsMm, paint);
  try {
    if (options.enforceProfile !== false && activePrintProfile && activePrintProfileSha256) {
      const isPrintResolutionTransition = message.resolution === V088_SURFACE_RESOLUTION
        && activePrintProfile.geometry.surfaceResolution !== V088_SURFACE_RESOLUTION;
      if (isPrintResolutionTransition) {
        const sourceMatch = matchPrintProfile(activePrintProfile, currentPrintProfileFinalizationSourceBinding());
        if (!sourceMatch.matches) throw new Error(`Print Profile mismatch: ${sourceMatch.reasons.join(" / ")}`);
        validateOverhangAssignmentLedger(result);
      } else {
        const plan = resolveWorkerPrintPlan(activePrintProfile, activePrintProfileSha256, currentPrintProfileBinding(activePrintProfile, false));
        assertResolvedPrintPlanSupportCounts(plan, result.counts, result.rayFacts);
      }
    } else {
      validateOverhangAssignmentLedger(result);
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    (failure as Error & { supportResult?: OverhangSupportPolicyResult }).supportResult = result;
    throw failure;
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
  return result.diagnosedFacePositionsMm.slice();
}

function overhangSupportCountsText(result: OverhangSupportPolicyResult): string {
  const counts = result.counts;
  const paint = result.paintFacts;
  const paintText = paint ? ` / painted ${paint.paintedSupportSiteCount.toLocaleString()} / overridden ${paint.manualOverrideSupportSiteCount.toLocaleString()}` : "";
  return `mixed face ${counts.mixedFace.toLocaleString()} / inside site ${counts.insideSupportSite.toLocaleString()} / outside site ${counts.outsideSupportSite.toLocaleString()} / unresolved site ${counts.unresolvedSupportSite.toLocaleString()} / duplicate site ${counts.duplicateSupportSite.toLocaleString()}${paintText}`;
}

function refreshOverhangSupportSiteOverlay(): void {
  const result = overhangSupportResult;
  const diagnosis = surfaceAngleCache;
  if (!result || !diagnosis) {
    skinRenderer.clearOverhangSupportSiteOverlay();
    ui.setOverhangSupportSiteOverlay(false, showOverhangSupportSites, showMixedSupportFaces, showSupportFootprint, supportSiteDepthMode, "支持点は未診断");
    return;
  }
  const sourceLongest = triangleSoupLongestExtent(diagnosis.basePositions);
  const targetLongestMm = ui.getMeshOptions().targetLongestMm;
  if (!(sourceLongest > 0) || !(targetLongestMm > 0)) {
    skinRenderer.clearOverhangSupportSiteOverlay();
    ui.setOverhangSupportSiteOverlay(true, showOverhangSupportSites, showMixedSupportFaces, showSupportFootprint, supportSiteDepthMode, "支持点の表示Scaleを求められませんでした", false);
    return;
  }
  const scaleMmPerUnit = targetLongestMm / sourceLongest;
  const markerRadius = 0.55 / scaleMmPerUnit;
  const drawableEntries = result.entries.filter((entry) => entry.positionMm && !entry.duplicateOf);
  // Editing stays a low-to-medium density preview. Saved normalized strokes
  // are reprojected to every high-resolution site by the export Worker.
  const previewStride = Math.max(1, Math.ceil(drawableEntries.length / 40_000));
  const markers = drawableEntries.flatMap((entry, index) => {
    if (entry.classification !== "unresolved" && index % previewStride !== 0) return [];
    return [{
      id: entry.id,
      classification: entry.classification,
      markerRadius,
      normal: entry.normal ? { x: entry.normal.xMm, y: entry.normal.yMm, z: entry.normal.zMm } : undefined,
      position: {
        x: entry.positionMm!.xMm / scaleMmPerUnit,
        y: entry.positionMm!.yMm / scaleMmPerUnit,
        z: entry.positionMm!.zMm / scaleMmPerUnit,
      },
    }];
  });
  const mixedPositions: number[] = [];
  if (showMixedSupportFaces) {
    for (const faceIndex of result.mixedFaceIndices) {
      const offset = faceIndex * 9;
      if (offset < 0 || offset + 9 > diagnosis.beforeDangerPositions.length) continue;
      mixedPositions.push(...diagnosis.beforeDangerPositions.subarray(offset, offset + 9));
    }
  }
  const footprintPositions: number[] = [];
  const footprint = result.baseFootprint;
  if (showOverhangSupportSites && showSupportFootprint && footprint?.valid && footprint.vertices.length >= 3) {
    let baseZ = Infinity;
    for (let offset = 2; offset < diagnosis.basePositions.length; offset += 3) {
      baseZ = Math.min(baseZ, diagnosis.basePositions[offset]);
    }
    if (Number.isFinite(baseZ)) {
      const outlineZ = baseZ - markerRadius * 0.2;
      for (const point of footprint.vertices) {
        footprintPositions.push(point.xMm / scaleMmPerUnit, point.yMm / scaleMmPerUnit, outlineZ);
      }
    }
  }
  if (showOverhangSupportSites || showMixedSupportFaces) {
    skinRenderer.setOverhangSupportSiteOverlay(
      showOverhangSupportSites ? markers : [],
      new Float32Array(mixedPositions),
      new Float32Array(footprintPositions),
      supportSiteDepthMode,
    );
  } else {
    skinRenderer.clearOverhangSupportSiteOverlay();
  }
  const ok = result.counts.unresolvedSupportSite === 0
    && result.counts.duplicateSupportSite === 0;
  ui.setOverhangSupportSiteOverlay(
    true,
    showOverhangSupportSites,
    showMixedSupportFaces,
    showSupportFootprint,
    supportSiteDepthMode,
    overhangSupportCountsText(result),
    ok,
  );
}

function setSelectedOverhangSupportSite(id: string | null): void {
  selectedOverhangSupportSiteId = id;
  const result = overhangSupportResult;
  const entry = id && result ? result.entries.find((candidate) => candidate.id === id) : null;
  if (!entry) {
    ui.setOverhangSupportSiteSelection("支持点を選ぶと plate-visible / body-blocked を表示します");
    refreshBottomStatusPane();
    return;
  }
  const distance = entry.nearestLowerSurfaceDistanceMm;
  const distanceText = distance == null ? "lower bodyなし" : `lower bodyまで ${distance.toFixed(4)} mm`;
  const epsilonText = result?.rayFacts ? `epsilon ${result.rayFacts.lowerIntersectionEpsilonMm.toFixed(6)} mm` : "epsilon不明";
  const paintText = entry.supportPaintMode ? ` · paint=${entry.supportPaintMode}#${entry.supportPaintStrokeOrder}` : " · paint=auto draft";
  ui.setOverhangSupportSiteSelection(
    `${entry.id} · ${entry.classification} · ${entry.rayResult ?? "ray-unresolved"} · ${distanceText} · ${epsilonText}${paintText}`,
    entry.classification,
  );
  refreshBottomStatusPane();
}


function supportPaintEditingContext(): {
  positionsMm: Float32Array;
  frame: ReturnType<typeof buildSupportPaintFrame>;
  scaleMmPerUnit: number;
} | null {
  if (!surfaceAngleCache) return null;
  const targetLongestMm = ui.getMeshOptions().targetLongestMm;
  if (
    supportPaintSurfaceCache
    && supportPaintSurfaceCache.diagnosis === surfaceAngleCache
    && supportPaintSurfaceCache.targetLongestMm === targetLongestMm
  ) return supportPaintSurfaceCache;
  const sourceLongest = triangleSoupLongestExtent(surfaceAngleCache.basePositions);
  if (!(sourceLongest > 0) || !(targetLongestMm > 0)) return null;
  const scaleMmPerUnit = targetLongestMm / sourceLongest;
  const positionsMm = new Float32Array(surfaceAngleCache.basePositions.length);
  for (let index = 0; index < positionsMm.length; index++) {
    positionsMm[index] = surfaceAngleCache.basePositions[index] * scaleMmPerUnit;
  }
  supportPaintSurfaceCache = {
    diagnosis: surfaceAngleCache,
    targetLongestMm,
    positionsMm,
    frame: buildSupportPaintFrame(positionsMm),
    scaleMmPerUnit,
  };
  return supportPaintSurfaceCache;
}

function dryWebPreviewIsCurrent(): boolean {
  return Boolean(
    phaseADryWebPreview
    && surfaceAngleCache
    && phaseADryWebPreview.surfaceFingerprint === currentTargetSurfaceFingerprint()
    && phaseADryWebPreview.resolution === surfaceAngleCache.resolution
    && phaseADryWebPreview.paintRevision === supportPaintSession.revision,
  );
}

function terminateDryWebPreviewWorker(clearResult = false): void {
  if (activeDryWebPreviewWorker) activeDryWebPreviewWorker.terminate();
  activeDryWebPreviewWorker = null;
  dryWebPreviewGeneration++;
  dryWebPreviewPending = false;
  if (clearResult) {
    phaseADryWebPreview = null;
    targetedSupportSource = null;
  }
}

function requestDryWebPreviewUpdate(reason: string): void {
  if (supportPaintDrag) return;
  const result = overhangSupportResult;
  const context = supportPaintEditingContext();
  if (!surfaceAngleCache || !result || !context || state.skinParams.internalStructure !== "targetedGrid") {
    terminateDryWebPreviewWorker(true);
    skinRenderer.setInternalStructure(null);
    return;
  }
  if (activeDryWebPreviewWorker) activeDryWebPreviewWorker.terminate();
  const worker = new Worker(new URL("./dryWebPreview.worker.ts", import.meta.url), { type: "module" });
  const generation = ++dryWebPreviewGeneration;
  const requestId = ++dryWebPreviewRequestId;
  const paintRevision = supportPaintSession.revision;
  const surfaceFingerprint = currentTargetSurfaceFingerprint();
  activeDryWebPreviewWorker = worker;
  dryWebPreviewPending = true;
  phaseASupportStatus.textContent = reason + " · Dry Web Worker更新中…";
  phaseASupportStatus.dataset.stale = "true";
  worker.onmessage = (event: MessageEvent<DryWebPreviewWorkerMessage>) => {
    const message = event.data;
    if (worker !== activeDryWebPreviewWorker || message.generation !== dryWebPreviewGeneration || message.requestId !== requestId) return;
    worker.terminate();
    activeDryWebPreviewWorker = null;
    dryWebPreviewPending = false;
    if (message.type === "error") {
      phaseASupportStatus.textContent = "Dry Web preview Worker失敗: " + message.message;
      phaseASupportStatus.dataset.ok = "false";
      return;
    }
    if (
      message.paintRevision !== supportPaintSession.revision
      || message.surfaceFingerprint !== currentTargetSurfaceFingerprint()
      || message.resolution !== surfaceAngleCache?.resolution
    ) return;
    phaseADryWebPreview = {
      surfaceFingerprint: message.surfaceFingerprint,
      resolution: message.resolution,
      paintRevision: message.paintRevision,
      graph: message.graph,
      facts: message.facts,
      computeMs: message.computeMs,
    };
    targetedSupportSource = {
      surfaceFingerprint: message.surfaceFingerprint,
      resolution: message.resolution,
      targets: message.targets,
    };
    internalStructureGraph = message.graph;
    internalStructureFingerprint = "";
    ui.setInternalStructureStatus(
      dryWebRoutingFactsText(message.facts)
      + ` / node ${message.graph.nodes.length.toLocaleString()} / edge ${message.graph.edges.length.toLocaleString()}`
      + ` / Worker ${message.computeMs.toFixed(1)}ms`,
      message.graph.edges.length > 0,
    );
    refreshPhaseASupportPreview();
  };
  worker.onerror = (event) => {
    if (worker !== activeDryWebPreviewWorker) return;
    worker.terminate();
    activeDryWebPreviewWorker = null;
    dryWebPreviewPending = false;
    phaseASupportStatus.textContent = "Dry Web preview Worker失敗: " + event.message;
    phaseASupportStatus.dataset.ok = "false";
  };
  const request: DryWebPreviewWorkerRequest = {
    type: "build",
    generation,
    requestId,
    paintRevision,
    surfaceFingerprint,
    resolution: surfaceAngleCache.resolution,
    entries: result.entries.map((entry) => ({
      ...entry,
      ...(entry.positionMm ? { positionMm: { ...entry.positionMm } } : {}),
      ...(entry.normal ? { normal: { ...entry.normal } } : {}),
    })),
    scaleMmPerUnit: context.scaleMmPerUnit,
    host: state.host.map((ball) => ({ ...ball })),
    hostK: state.hostParams.k,
    patches: state.patches.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })),
    internalDensity: state.skinParams.internalDensity,
    internalRadius: state.skinParams.internalRadius,
  };
  worker.postMessage(request);
}

function refreshPhaseASupportPreview(): void {
  const result = overhangSupportResult;
  const context = supportPaintEditingContext();
  if (!surfaceAngleCache || !result || !context) {
    skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
    phaseASupportStatus.textContent = "Surface診断後に支持林を表示します";
    delete phaseASupportStatus.dataset.ok;
    return;
  }
  try {
    let plateZMm = Infinity;
    for (let offset = 2; offset < context.positionsMm.length; offset += 3) {
      plateZMm = Math.min(plateZMm, context.positionsMm[offset]);
    }
    if (!Number.isFinite(plateZMm)) throw new Error("BODYの最下面を求められません");
    const outsideLeaves = outsideLeavesFromAssignments(result.entries);
    const cradleLeaves = phaseASupportSettings.objectLiftMm > 0
      ? uniformLowestSurfaceLeaves(
        context.positionsMm,
        Math.max(2.4, phaseASupportSettings.trunkMinimumRadiusMm * 4),
        0.9,
      )
      : [];
    const forest = buildSupportForest([...outsideLeaves, ...cradleLeaves], {
      mode: phaseASupportSettings.supportMode,
      plateZMm,
      objectLiftMm: phaseASupportSettings.objectLiftMm,
      tipRadiusMm: phaseASupportSettings.tipRadiusMm,
      trunkMinimumRadiusMm: phaseASupportSettings.trunkMinimumRadiusMm,
      loadWidening: phaseASupportSettings.loadWidening,
      maximumUnsupportedLengthMm: phaseASupportSettings.maximumUnsupportedLengthMm,
      branchAngleDeg: phaseASupportSettings.branchAngleDeg,
      footRadiusMm: Math.max(1.0, phaseASupportSettings.trunkMinimumRadiusMm * 1.45),
      raftRadiusMm: Math.max(0.75, phaseASupportSettings.trunkMinimumRadiusMm),
    });
    const retained = phaseASupportSettings.baseVolumeVerticalSupports
      ? retainedVerticalMembers(result.entries, phaseASupportSettings.trunkMinimumRadiusMm)
        .map((member) => ({
          ...member,
          start: { ...member.start, zMm: member.start.zMm + phaseASupportSettings.objectLiftMm },
          end: { ...member.end, zMm: member.end.zMm + phaseASupportSettings.objectLiftMm },
        }))
      : [];
    const dryWebPreview = dryWebPreviewIsCurrent() ? phaseADryWebPreview : null;
    const reinforcedDryWeb = reinforceDryWebGraph(
      dryWebPreview?.graph ?? null,
      context.scaleMmPerUnit,
      phaseASupportSettings.dryWebMinimumDiameterMm,
      phaseASupportSettings.dryWebMaximumUnreinforcedLengthMm,
    );
    skinRenderer.setInternalStructure(reinforcedDryWeb);
    skinRenderer.setPhaseASupportPreview(
      forest,
      retained,
      context.scaleMmPerUnit,
      phaseASupportSettings.objectLiftMm,
    );
    const stats = forest.stats;
    const dryWebText = reinforcedDryWeb && dryWebPreview
      ? `Dry Web ${reinforcedDryWeb.edges.length.toLocaleString()} edge / 最小径${phaseASupportSettings.dryWebMinimumDiameterMm.toFixed(1)}mm / `
        + dryWebRoutingFactsText(dryWebPreview.facts)
        + ` / Worker ${dryWebPreview.computeMs.toFixed(1)}ms`
      : dryWebPreviewPending
        ? "Dry Web Worker更新中"
        : "Dry Web未生成";
    phaseASupportStatus.textContent =
      `${phaseASupportSettings.supportMode === "branching" ? "Branching" : "Vertical"} · outside葉 ${outsideLeaves.length.toLocaleString()} / `
      + `最下面cradle ${cradleLeaves.length.toLocaleString()} / branch ${stats.branchCount.toLocaleString()} / `
      + `brace ${stats.braceCount.toLocaleString()} / foot ${stats.rootCount.toLocaleString()} / `
      + `最大部材 ${stats.maximumMemberLengthMm.toFixed(1)}mm / 最大角 ${stats.maximumBranchAngleDeg.toFixed(1)}° / `
      + `base内 retained ${retained.length.toLocaleString()} / ${dryWebText}`;
    delete phaseASupportStatus.dataset.stale;
    phaseASupportStatus.dataset.ok = String(stats.unsupportedLengthViolationCount === 0
      && stats.maximumBranchAngleDeg <= phaseASupportSettings.branchAngleDeg + 1e-4);
    render();
  } catch (error) {
    skinRenderer.setPhaseASupportPreview(null, [], context.scaleMmPerUnit, 0);
    phaseASupportStatus.textContent = `支持林preview生成失敗: ${error instanceof Error ? error.message : String(error)}`;
    phaseASupportStatus.dataset.ok = "false";
  }
}

function terminateSupportPaintRaycastWorker(): void {
  if (activeSupportPaintRaycastWorker) activeSupportPaintRaycastWorker.terminate();
  activeSupportPaintRaycastWorker = null;
  supportPaintRaycastReady = false;
  supportPaintRaycastGeneration++;
  supportPaintRaycastHeavyComputation?.finish();
  supportPaintRaycastHeavyComputation = null;
}

function cancelSupportPaintRaycastBuild(): void {
  if (!activeSupportPaintRaycastWorker && !supportPaintRaycastHeavyComputation) return;
  terminateSupportPaintRaycastWorker();
  refreshSupportPaintUi("Paint Surface indexの構築をキャンセルしました");
  refreshSurfaceStartupStatus("Paint BVH canceled");
}

function initializeSupportPaintRaycastWorker(diagnosis: Extract<SurfaceAngleWorkerMessage, { type: "result" }>): void {
  if (activeSupportPaintRaycastWorker) return;
  const generation = supportPaintRaycastGeneration;
  const worker = new Worker(new URL("./supportPaintRaycast.worker.ts", import.meta.url), { type: "module" });
  activeSupportPaintRaycastWorker = worker;
  supportPaintRaycastHeavyComputation?.finish();
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (!isCurrentWorkerRun(worker, activeSupportPaintRaycastWorker, null, undefined, generation, supportPaintRaycastGeneration)
      || supportPaintRaycastHeavyComputation?.id !== heavy.id) return;
    cancelSupportPaintRaycastBuild();
  };
  heavy = beginHeavyComputation("Paint BVH 全体進捗", cancel);
  supportPaintRaycastHeavyComputation = heavy;
  heavy.update("Paint Surface indexをWorkerへ送信しています…", 0);
  heavy.smoothTo(99);
  paintBvhWorkerLaunchCount++;
  const requestedAt = performance.now();
  supportPaintRaycastReady = false;
  refreshSupportPaintUi("Paint Surface indexをWorkerで準備中 · viewportは操作できます");
  refreshSurfaceStartupStatus("Paint BVH building");
  worker.onmessage = (event: MessageEvent<SupportPaintRaycastWorkerMessage>) => {
    const message = event.data;
    if (!isCurrentWorkerRun(worker, activeSupportPaintRaycastWorker, null, undefined, generation, supportPaintRaycastGeneration, message.generation)) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") {
      refreshSupportPaintUi("Paint Surface index構築中 · " + message.triangleCount.toLocaleString() + "面 · viewportは操作できます");
      refreshSurfaceStartupStatus("Paint BVH building");
      heavy.update(
        "Paint Surface index構築中 · " + message.triangleCount.toLocaleString() + "面",
        12,
      );
      return;
    }
    if (message.type === "ready") {
      supportPaintRaycastReady = true;
      paintBvhBuildMs = performance.now() - requestedAt;
      console.info("[Support Paint BVH] ready", { ...message, roundTripMs: paintBvhBuildMs });
      refreshSupportPaintUi("Paint Surface index ready · " + message.triangleCount.toLocaleString() + "面 · build " + message.buildMs.toFixed(1) + "ms · round-trip " + paintBvhBuildMs.toFixed(1) + "ms");
      refreshSurfaceStartupStatus("ready");
      heavy.update("Paint Surface index完了", 100);
      heavy.finish();
      if (supportPaintRaycastHeavyComputation?.id === heavy.id) supportPaintRaycastHeavyComputation = null;
      return;
    }
    if (message.type === "error") {
      activeSupportPaintRaycastWorker = null;
      supportPaintRaycastGeneration++;
      worker.terminate();
      heavy.finish();
      if (supportPaintRaycastHeavyComputation?.id === heavy.id) supportPaintRaycastHeavyComputation = null;
      handleSupportPaintRaycastError(message.message, message.requestId);
      return;
    }
    handleSupportPaintRaycastHit(message);
  };
  worker.onerror = (event) => {
    if (!isCurrentWorkerRun(worker, activeSupportPaintRaycastWorker, null, undefined, generation, supportPaintRaycastGeneration)) {
      worker.terminate();
      return;
    }
    activeSupportPaintRaycastWorker = null;
    supportPaintRaycastGeneration++;
    worker.terminate();
    supportPaintRaycastReady = false;
    heavy.finish();
    if (supportPaintRaycastHeavyComputation?.id === heavy.id) supportPaintRaycastHeavyComputation = null;
    handleSupportPaintRaycastError(event.message);
  };
  const positions = diagnosis.basePositions.slice();
  const request: SupportPaintRaycastWorkerRequest = { type: "initialize", generation, positions };
  worker.postMessage(request, [positions.buffer]);
}

function currentSupportPaintDocument(includeActive = false): SupportPaintV1 {
  return supportPaintSessionDocument(supportPaintSession, includeActive);
}

function invalidateSupportPaintReprojection(): void {
  v088Surface128Proof = null;
  supportPaintReprojectionGeneration++;
  if (activeSupportPaintReprojectionWorker) { activeSupportPaintReprojectionWorker.terminate(); activeSupportPaintReprojectionWorker = null; }
  supportPaintReprojectionHeavyComputation?.finish();
  supportPaintReprojectionHeavyComputation = null;
  supportPaintReprojectionStatus = "未検証";
}

function currentSupportPaintDraftBinding(): { recipeSha256: string; seed: string; targetLongestMm: number } | null {
  if (!importedRecipeSha256) return null;
  return { recipeSha256: importedRecipeSha256, seed: state.hostParams.seed, targetLongestMm: ui.getMeshOptions().targetLongestMm };
}

function currentSupportPaintDraft(savedAt?: string): SupportPaintDraftV1 | null {
  const binding = currentSupportPaintDraftBinding();
  if (!binding) return null;
  return createSupportPaintDraft({
    savedAt, ...binding, supportPaint: supportPaintSession.history.present,
    brush: { mode: supportPaintMode, radiusMm: supportPaintRadiusMm, paintBackfaces: supportPaintBackfaces },
    editorView: skinRenderer.captureEditorViewDraft(editorLayoutState),
  });
}

function supportPaintDraftStatusText(): string {
  if (!currentSupportPaintDraftBinding()) return "Shape Recipe未読込 · 未保存";
  if (supportPaintDraftDirty) return supportPaintDraftSavedAt ? "未保存の変更あり · 前回 " + new Date(supportPaintDraftSavedAt).toLocaleTimeString("ja-JP", { hour12: false }) : "未保存";
  return supportPaintDraftSavedAt ? "保存済み · " + new Date(supportPaintDraftSavedAt).toLocaleTimeString("ja-JP", { hour12: false }) : "未保存";
}

function markSupportPaintDraftDirty(): void { supportPaintDraftDirty = true; refreshBottomStatusPane(); }

function autosaveSupportPaintDraft(): SupportPaintDraftV1 | null {
  const binding = currentSupportPaintDraftBinding();
  const draft = currentSupportPaintDraft();
  if (!binding || !draft) { supportPaintDraftDirty = true; return null; }
  try {
    localStorage.setItem(supportPaintDraftStorageKey(binding), serializeSupportPaintDraft(draft));
    supportPaintDraftSavedAt = draft.savedAt; supportPaintDraftDirty = false;
    refreshBottomStatusPane();
    return draft;
  } catch (error) {
    supportPaintDraftDirty = true;
    supportPaintStatusText = "autosave失敗: " + (error instanceof Error ? error.message : String(error));
    refreshBottomStatusPane();
    return null;
  }
}

function saveSupportPaintDraftDownload(): void {
  const draft = autosaveSupportPaintDraft();
  if (!draft) { refreshSupportPaintUi("Shape Recipeを読み込むまでdraftを保存できません"); return; }
  const base = importedRecipeFilename?.replace(/.recipe.json$/i, "") ?? "skin";
  downloadBlob(new Blob([serializeSupportPaintDraft(draft)], { type: "application/json" }), base + ".support-paint-draft.json");
  refreshSupportPaintUi("Support Paint draftを保存しました");
}

function applySupportPaintDraft(draft: SupportPaintDraftV1, source: "autosave" | "file"): void {
  const binding = currentSupportPaintDraftBinding();
  if (!binding) throw new Error("先に対応するShape Recipeを読み込んでください");
  assertSupportPaintDraftBinding(draft, binding);
  terminateSupportPaintApplyWorker();
  supportPaintSession = createSupportPaintSession(draft.supportPaint);
  resetSupportPaintUndoJournal();
  invalidateSupportPaintReprojection();
  supportPaintMode = draft.brush.mode; supportPaintRadiusMm = draft.brush.radiusMm; supportPaintBackfaces = draft.brush.paintBackfaces;
  if (draft.editorView?.layout) {
    editorLayoutState = validateSkinEditorLayoutDraft(draft.editorView.layout);
    applyEditorLayoutDom();
    skinRenderer.resize();
    persistEditorLayout();
  }
  if (draft.editorView) skinRenderer.restoreEditorViewDraft(draft.editorView);
  localStorage.setItem(supportPaintDraftStorageKey(binding), serializeSupportPaintDraft(draft));
  supportPaintDraftSavedAt = draft.savedAt; supportPaintDraftDirty = false;
  if (automaticOverhangSupportResult && supportPaintEditingContext()) {
    reapplySupportPaint(source === "autosave" ? "autosaveからSupport Paintを復元しました" : "draftからSupport Paintを復元しました", supportPaintSession.history.present, true);
  } else {
    refreshSupportPaintUi(source === "autosave" ? "autosaveを復元しました · 診断後に色と件数を再計算します" : "draftを復元しました · 診断後に色と件数を再計算します");
  }
}

function restoreAutosavedSupportPaintDraft(): boolean {
  const binding = currentSupportPaintDraftBinding();
  if (!binding) return false;
  const text = localStorage.getItem(supportPaintDraftStorageKey(binding));
  if (!text) return false;
  try { applySupportPaintDraft(validateSupportPaintDraft(JSON.parse(text)), "autosave"); return true; }
  catch (error) { supportPaintDraftDirty = true; supportPaintStatusText = "autosave復元失敗: " + (error instanceof Error ? error.message : String(error)); return false; }
}

async function loadSupportPaintDraftFile(file: File): Promise<void> {
  try { applySupportPaintDraft(validateSupportPaintDraft(JSON.parse(await file.text())), "file"); }
  catch (error) { alert("Support Paint draftの読み込みに失敗しました: " + (error instanceof Error ? error.message : String(error))); }
}

function refreshSupportPaintUi(status = supportPaintStatusText): void {
  supportPaintStatusText = status;
  const facts = overhangSupportResult?.paintFacts;
  const paint = currentSupportPaintDocument();
  ui.setSupportPaintState({
    available: Boolean(automaticOverhangSupportResult && surfaceAngleCache),
    enabled: supportPaintEnabled,
    mode: supportPaintMode,
    radiusMm: supportPaintRadiusMm,
    paintBackfaces: supportPaintBackfaces,
    operationCount: supportPaintSession.history.past.length,
    sampleCount: paint.strokes.length,
    paintedSiteCount: facts?.paintedSupportSiteCount ?? 0,
    manualOverrideSiteCount: facts?.manualOverrideSupportSiteCount ?? 0,
    canUndo: supportPaintSession.history.past.length > 0 && !supportPaintDrag && supportPaintApplyReplacePending === 0,
    canRedo: supportPaintSession.history.future.length > 0 && !supportPaintDrag && supportPaintApplyReplacePending === 0,
    canSaveDraft: Boolean(currentSupportPaintDraftBinding()) && !supportPaintSession.activeStroke,
    draftStatus: supportPaintDraftStatusText(),
    editingResolution: surfaceAngleCache?.resolution ?? null,
    printResolution: SUPPORT_PAINT_PRINT_RESOLUTION,
    canVerifyReprojection: supportPaintSession.history.present.strokes.length > 0 && Boolean(importedRecipeSha256) && !activeSupportPaintReprojectionWorker,
    reprojectionStatus: supportPaintReprojectionStatus,
    status,
  });
  refreshBottomStatusPane();
  syncProjectBar();
}

function invalidateSupportPaintEditingResources(): void {
  supportPaintSession = reviseSupportPaintSession(supportPaintSession);
  terminateSupportPaintApplyWorker();
  invalidateSupportPaintReprojection();
  if (supportPaintDrag?.throttleTimer !== null && supportPaintDrag?.throttleTimer !== undefined) window.clearTimeout(supportPaintDrag.throttleTimer);
  supportPaintDrag = null;
  terminateSupportPaintRaycastWorker();
  supportPaintCssBrush.hidden = true;
  supportPaintSurfaceCache = null;
  resetSupportPaintUndoJournal();
  skinRenderer.clearOverhangSupportSitePreview();
}

function setSupportPaintEnabled(enabled: boolean): void {
  supportPaintEnabled = enabled && Boolean(automaticOverhangSupportResult && surfaceAngleCache);
  showOverhangSupportSites = true;
  viewport.classList.toggle("support-paint-active", supportPaintEnabled);
  // Support Paint owns plain left drag. Outside paint mode the Axome
  // viewport can use the same button for thresholded camera rotation.
  skinRenderer.setAxomeLeftRotateEnabled(!supportPaintEnabled);
  ui.setShapeUndoLocked(supportPaintEnabled);
  skinRenderer.setOrbitEnabled(true);
  supportPaintCssBrush.hidden = !supportPaintEnabled;
  if (supportPaintEnabled) {
    supportPaintEditingContext();
    if (surfaceAngleCache) initializeSupportPaintRaycastWorker(surfaceAngleCache);
    initializeSupportPaintApplyWorker("Support Paintを開始できます");
    supportPaintInteractionCounters = createSupportPaintInteractionCounters();
  }
  refreshOverhangSupportSiteOverlay();
  refreshSupportPaintUi(supportPaintEnabled ? "ドラッグして支持方式を塗ります" : "自動分類＋保存済みoverrideを表示中");
  render();
}

function refreshPaintedDryWebTargets(): void {
  if (!surfaceAngleCache || !overhangSupportResult || state.skinParams.internalStructure !== "targetedGrid") return;
  const sourceLongest = triangleSoupLongestExtent(surfaceAngleCache.basePositions);
  const scaleMmPerUnit = ui.getMeshOptions().targetLongestMm / sourceLongest;
  if (!(scaleMmPerUnit > 0)) return;
  targetedSupportSource = {
    surfaceFingerprint: currentTargetSurfaceFingerprint(),
    resolution: surfaceAngleCache.resolution,
    targets: sourceDryWebTargets(overhangSupportResult, scaleMmPerUnit),
  };
  internalStructureFingerprint = "";
  internalStructureGraph = null;
  skinRenderer.setInternalStructure(null);
  ui.setInternalStructureStatus("Support Paint routing更新済み · derived Dry Webは編集完了後の生成時に適用します");
}

interface SupportPaintPreviewPerformance {
  siteCount: number;
  sampleCount: number;
  surfaceRaycastDurationsMs: number[];
  pointerDurationsMs: number[];
  brushCircleDurationsMs: number[];
  paintDisplayDurationsMs: number[];
  startedAt: number;
}

type SupportPaintLiveChange = Extract<SupportPaintWorkerMessage, { type: "dab" }>["changes"][number];
type SupportPaintLiveFacts = Extract<SupportPaintWorkerMessage, { type: "dab" }>["facts"];

interface SupportPaintDragJournal {
  before: SupportPaintLiveChange[];
  after: SupportPaintLiveChange[];
  factsBefore: SupportPaintLiveFacts;
  factsAfter: SupportPaintLiveFacts;
}

let supportPaintUndoJournalPast: SupportPaintDragJournal[] = [];
let supportPaintUndoJournalFuture: SupportPaintDragJournal[] = [];

function cloneSupportPaintLiveFacts(facts: SupportPaintLiveFacts): SupportPaintLiveFacts {
  return {
    ...facts,
    automaticCounts: { ...facts.automaticCounts },
    finalCounts: { ...facts.finalCounts },
  };
}

function currentSupportPaintLiveFacts(): SupportPaintLiveFacts {
  if (overhangSupportResult?.paintFacts) return cloneSupportPaintLiveFacts(overhangSupportResult.paintFacts);
  const automaticCounts = automaticOverhangSupportResult?.counts;
  return {
    strokeCount: supportPaintSession.history.present.strokes.length,
    automaticCounts: {
      inside: automaticCounts?.insideSupportSite ?? 0,
      outside: automaticCounts?.outsideSupportSite ?? 0,
      unresolved: automaticCounts?.unresolvedSupportSite ?? 0,
    },
    paintedSupportSiteCount: 0,
    manualOverrideSupportSiteCount: 0,
    autoResetSupportSiteCount: 0,
    finalCounts: {
      inside: overhangSupportResult?.counts.insideSupportSite ?? automaticCounts?.insideSupportSite ?? 0,
      outside: overhangSupportResult?.counts.outsideSupportSite ?? automaticCounts?.outsideSupportSite ?? 0,
      unresolved: overhangSupportResult?.counts.unresolvedSupportSite ?? automaticCounts?.unresolvedSupportSite ?? 0,
    },
  };
}

function supportPaintEntrySnapshot(
  siteIndex: number,
  entry: OverhangSupportPolicyResult["entries"][number],
): SupportPaintLiveChange {
  return {
    siteIndex,
    id: entry.id,
    classification: entry.classification,
    automaticClassification: entry.automaticClassification ?? entry.classification,
    supportPaintStrokeOrder: entry.supportPaintStrokeOrder,
    supportPaintMode: entry.supportPaintMode,
    manuallyPainted: entry.manuallyPainted === true,
    manuallyOverridden: entry.manuallyOverridden === true,
  };
}

function resetSupportPaintUndoJournal(): void {
  supportPaintUndoJournalPast = [];
  supportPaintUndoJournalFuture = [];
}

function supportPaintP95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function ensureEditableOverhangSupportResult(): OverhangSupportPolicyResult | null {
  if (!overhangSupportResult) return null;
  if (overhangSupportResult === automaticOverhangSupportResult) {
    overhangSupportResult = {
      ...overhangSupportResult,
      entries: overhangSupportResult.entries.map((entry) => ({ ...entry })),
      counts: { ...overhangSupportResult.counts },
      paintFacts: overhangSupportResult.paintFacts ? { ...overhangSupportResult.paintFacts } : null,
    };
  }
  return overhangSupportResult;
}

function refreshLiveSupportPaintCounts(): void {
  const result = overhangSupportResult;
  if (!result) return;
  const ok = result.counts.unresolvedSupportSite === 0 && result.counts.duplicateSupportSite === 0;
  ui.setOverhangSupportSiteOverlay(
    true,
    showOverhangSupportSites,
    showMixedSupportFaces,
    showSupportFootprint,
    supportSiteDepthMode,
    overhangSupportCountsText(result),
    ok,
  );
  refreshSupportPaintUi();
}

function applySupportPaintLiveSnapshot(
  changes: readonly SupportPaintLiveChange[],
  facts: SupportPaintLiveFacts,
  preview: boolean,
): void {
  const result = ensureEditableOverhangSupportResult();
  if (!result) return;
  const activeJournal = preview ? supportPaintDrag : null;
  const markerChanges: Array<{ id: string; classification: "inside" | "outside" | "unresolved" }> = [];
  for (const change of changes) {
    const entry = result.entries[change.siteIndex];
    if (!entry || entry.id !== change.id) {
      throw new Error("Support Paint live site index mismatch: " + change.siteIndex + " / " + change.id);
    }
    if (activeJournal && !activeJournal.journalBefore.has(change.id)) {
      activeJournal.journalBefore.set(change.id, supportPaintEntrySnapshot(change.siteIndex, entry));
    }
    entry.classification = change.classification;
    entry.automaticClassification = change.automaticClassification;
    entry.supportPaintStrokeOrder = change.supportPaintStrokeOrder;
    entry.supportPaintMode = change.supportPaintMode;
    entry.manuallyPainted = change.manuallyPainted;
    entry.manuallyOverridden = change.manuallyOverridden;
    if (activeJournal) activeJournal.journalAfter.set(change.id, { ...change });
    markerChanges.push({ id: change.id, classification: change.classification });
  }
  result.counts.inside = facts.finalCounts.inside;
  result.counts.outside = facts.finalCounts.outside;
  result.counts.unresolved = facts.finalCounts.unresolved;
  result.counts.insideSupportSite = facts.finalCounts.inside;
  result.counts.outsideSupportSite = facts.finalCounts.outside;
  result.counts.unresolvedSupportSite = facts.finalCounts.unresolved;
  result.paintFacts = { ...facts };
  if (preview) {
    const updated = skinRenderer.previewOverhangSupportSiteClassifications(markerChanges);
    const drag = supportPaintDrag;
    if (drag) {
      for (const change of markerChanges) drag.previewChanges.set(change.id, change.classification);
      if (updated > 0) {
        supportPaintInteractionCounters.dragMarkerPartialUpdates += updated;
        supportPaintInteractionCounters.dragWebglRenders++;
        requestRenderFrame(true);
      }
    }
  } else {
    const updated = skinRenderer.commitOverhangSupportSiteClassifications(markerChanges);
    if (updated > 0) requestRenderFrame();
    // A real Case A forest contains tens of thousands of members. Rebuilding
    // it inside Paint pointerup would regress the already accepted Paint/Undo
    // interaction. Keep Paint fast and let the author explicitly refresh the
    // structure after finishing a classification edit.
    phaseASupportStatus.textContent = "Support Paint分類が更新されました。「現在のPaint分類からpreview更新」で支持林へ反映します";
    phaseASupportStatus.dataset.stale = "true";
  }
}

function terminateSupportPaintApplyWorker(): void {
  if (activeSupportPaintWorker) activeSupportPaintWorker.terminate();
  activeSupportPaintWorker = null;
  supportPaintApplyWorkerReady = false;
  supportPaintApplyReplacePending = 0;
  supportPaintDryWebRefreshRequestIds.clear();
  supportPaintApplyGeneration++;
}

function maybeFinalizeSupportPaintDrag(drag: NonNullable<typeof supportPaintDrag>): void {
  if (
    supportPaintDrag === drag
    && drag.finishing
    && drag.inFlightRequestId === null
    && !drag.latestPointer
    && drag.pendingDabCount === 0
  ) finalizeSupportPaintDrag(drag, drag.commitOnFinish);
}

function failSupportPaintApplyWorker(status: string): void {
  const drag = supportPaintDrag;
  terminateSupportPaintApplyWorker();
  if (drag) {
    supportPaintSession = finishActiveSupportPaintStroke(supportPaintSession, false);
    supportPaintDrag = null;
    overhangSupportResult = automaticOverhangSupportResult;
    skinRenderer.clearOverhangSupportSitePreview();
    refreshOverhangSupportSiteOverlay();
  }
  refreshSupportPaintUi(status);
}

function initializeSupportPaintApplyWorker(status: string): void {
  if (activeSupportPaintWorker) return;
  const context = supportPaintEditingContext();
  if (!automaticOverhangSupportResult || !context) {
    refreshSupportPaintUi("支持点の診断後に使えます");
    return;
  }
  ensureEditableOverhangSupportResult();
  const worker = new Worker(new URL("./supportPaint.worker.ts", import.meta.url), { type: "module" });
  const generation = ++supportPaintApplyGeneration;
  activeSupportPaintWorker = worker;
  supportPaintApplyWorkerReady = false;
  const initializedAt = performance.now();
  refreshSupportPaintUi(status + " · Paint差分Workerを初期化中…");
  worker.onmessage = (event: MessageEvent<SupportPaintWorkerMessage>) => {
    const message = event.data;
    if (worker !== activeSupportPaintWorker || message.generation !== supportPaintApplyGeneration) return;
    if (message.type === "error") {
      failSupportPaintApplyWorker("Support Paint差分Worker失敗: " + message.message);
      return;
    }
    try {
      if (message.type === "ready") {
        supportPaintApplyWorkerReady = true;
        if (message.revision !== supportPaintSession.revision) {
          reapplySupportPaint(status + " · 最新strokeへ同期", supportPaintSession.history.present);
          return;
        }
        applySupportPaintLiveSnapshot(message.snapshot.changes, message.snapshot.facts, false);
        refreshLiveSupportPaintCounts();
        requestDryWebPreviewUpdate("Support Paint確定ledgerを復元しました");
        refreshSupportPaintUi(
          status + " · Paint差分Worker ready " + message.computeMs.toFixed(1)
          + "ms / round-trip " + (performance.now() - initializedAt).toFixed(1) + "ms",
        );
        return;
      }
      if (message.type === "replace" || message.type === "restore") {
        const refreshDryWeb = supportPaintDryWebRefreshRequestIds.delete(message.requestId);
        supportPaintApplyReplacePending = Math.max(0, supportPaintApplyReplacePending - 1);
        if (message.revision !== supportPaintSession.revision) return;
        applySupportPaintLiveSnapshot(message.changes, message.facts, false);
        refreshLiveSupportPaintCounts();
        if (refreshDryWeb) requestDryWebPreviewUpdate("Support Paint確定ledgerを復元しました");
        refreshSupportPaintUi(status + " · Paint差分 " + message.computeMs.toFixed(1) + "ms");
        return;
      }
      const drag = supportPaintDrag;
      if (!drag) return;
      const startedAt = drag.dabStartedAt.get(message.requestId);
      drag.dabStartedAt.delete(message.requestId);
      drag.pendingDabCount = Math.max(0, drag.pendingDabCount - 1);
      applySupportPaintLiveSnapshot(message.changes, message.facts, true);
      if (startedAt !== undefined) drag.paintDisplayDurationsMs.push(performance.now() - startedAt);
      const now = performance.now();
      if (now - drag.lastMetricsUiMs >= 1000) {
        drag.lastMetricsUiMs = now;
        refreshSupportPaintUi(
          "drag latency · brush " + supportPaintP95(drag.brushCircleDurationsMs).toFixed(1)
          + "ms / Surface hit " + supportPaintP95(drag.pointerDurationsMs).toFixed(1)
          + "ms / paint display " + supportPaintP95(drag.paintDisplayDurationsMs).toFixed(1)
          + "ms · adaptive " + drag.adaptiveRaycastIntervalMs.toFixed(1) + "ms",
        );
      }
      maybeFinalizeSupportPaintDrag(drag);
    } catch (error) {
      failSupportPaintApplyWorker("Support Paint差分適用 fail-closed: " + (error instanceof Error ? error.message : String(error)));
    }
  };
  worker.onerror = (event) => {
    if (worker !== activeSupportPaintWorker) return;
    failSupportPaintApplyWorker("Support Paint差分Worker失敗: " + event.message);
  };
  const positions = context.positionsMm.slice();
  const request: SupportPaintWorkerRequest = {
    type: "initialize",
    generation,
    revision: supportPaintSession.revision,
    automaticResult: automaticOverhangSupportResult,
    supportSurfacePositionsMm: positions,
    supportPaint: supportPaintSession.history.present.strokes.length > 0
      ? supportPaintSession.history.present
      : null,
  };
  worker.postMessage(request, [positions.buffer]);
}

function reapplySupportPaint(
  status: string,
  paint = supportPaintSession.history.present,
  refreshDryWeb = false,
  _previewPerformance?: SupportPaintPreviewPerformance,
): void {
  if (!automaticOverhangSupportResult || !supportPaintEditingContext()) {
    refreshSupportPaintUi("支持点の診断後に使えます");
    return;
  }
  if (!activeSupportPaintWorker) {
    initializeSupportPaintApplyWorker(status);
    return;
  }
  if (!supportPaintApplyWorkerReady) {
    refreshSupportPaintUi(status + " · Paint差分Worker初期化待ち");
    return;
  }
  const requestId = ++supportPaintApplyRequestId;
  supportPaintApplyReplacePending++;
  if (refreshDryWeb) supportPaintDryWebRefreshRequestIds.add(requestId);
  const request: SupportPaintWorkerRequest = {
    type: "replace",
    generation: supportPaintApplyGeneration,
    revision: supportPaintSession.revision,
    requestId,
    supportPaint: paint,
  };
  activeSupportPaintWorker.postMessage(request);
}

function restoreSupportPaintJournal(
  snapshot: { changes: SupportPaintLiveChange[]; facts: SupportPaintLiveFacts },
  status: string,
): void {
  applySupportPaintLiveSnapshot(snapshot.changes, snapshot.facts, false);
  refreshLiveSupportPaintCounts();
  requestDryWebPreviewUpdate(status);
  if (!activeSupportPaintWorker || !supportPaintApplyWorkerReady) {
    initializeSupportPaintApplyWorker(status);
    return;
  }
  const requestId = ++supportPaintApplyRequestId;
  supportPaintApplyReplacePending++;
  const request: SupportPaintWorkerRequest = {
    type: "restore",
    generation: supportPaintApplyGeneration,
    revision: supportPaintSession.revision,
    requestId,
    snapshot,
  };
  activeSupportPaintWorker.postMessage(request);
  refreshSupportPaintUi(status);
}

function undoOneSupportPaintOperation(): void {
  if (supportPaintDrag || supportPaintApplyReplacePending > 0) {
    refreshSupportPaintUi("Paint差分の確定後にUndoできます");
    return;
  }
  if (supportPaintSession.history.past.length === 0) {
    refreshSupportPaintUi("これ以上Paint操作を戻せません");
    return;
  }
  const shapeHistoryBefore = history;
  const surfaceBefore = surfaceAngleCache;
  const cacheKeysBefore = activeSurfacePersistentCacheKeys;
  supportPaintSession = reviseSupportPaintSession(
    supportPaintSession,
    undoSupportPaint(supportPaintSession.history),
  );
  invalidateSupportPaintReprojection();
  autosaveSupportPaintDraft();
  const journal = supportPaintUndoJournalPast.pop();
  if (journal) {
    supportPaintUndoJournalFuture.push(journal);
    restoreSupportPaintJournal(
      { changes: journal.before, facts: journal.factsBefore },
      "Support Paintの直前1 dragを戻しました",
    );
  } else {
    reapplySupportPaint("Support Paintの直前1操作を戻しました", supportPaintSession.history.present, true);
  }
  if (history !== shapeHistoryBefore || surfaceAngleCache !== surfaceBefore || activeSurfacePersistentCacheKeys !== cacheKeysBefore) {
    throw new Error("Support Paint Undo must not mutate shape history, Surface diagnosis, or cache key");
  }
}

function redoOneSupportPaintOperation(): void {
  if (supportPaintDrag || supportPaintApplyReplacePending > 0) {
    refreshSupportPaintUi("Paint差分の確定後にRedoできます");
    return;
  }
  if (supportPaintSession.history.future.length === 0) {
    refreshSupportPaintUi("これ以上Paint操作を進められません");
    return;
  }
  supportPaintSession = reviseSupportPaintSession(
    supportPaintSession,
    redoSupportPaint(supportPaintSession.history),
  );
  invalidateSupportPaintReprojection();
  autosaveSupportPaintDraft();
  const journal = supportPaintUndoJournalFuture.pop();
  if (journal) {
    supportPaintUndoJournalPast.push(journal);
    restoreSupportPaintJournal(
      { changes: journal.after, facts: journal.factsAfter },
      "Support Paintの直前1 dragを進めました",
    );
  } else {
    reapplySupportPaint("Support Paintの直前1操作を進めました", supportPaintSession.history.present, true);
  }
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
          ? "Dry Webは「プレートが実」で使います"
          : activeSurfaceAngleWorker
            ? "最終精度診断から赤点を取得しています…"
            : "最終精度で角度診断すると、Dry Webを生成します"
        : "なし — Surface のみ");
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
  const owner = resolveSkinUndoOwner({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    typing: isTypingTarget(event.target),
    supportPaintEnabled,
  });
  if (!owner) return;
  if (owner === "support-paint") {
    invokeExclusiveSupportPaintUndo(event, undoOneSupportPaintOperation);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  requestShapeUndo();
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
// disambiguation pattern as pack/cloud-sculpt; trackball drags still exceed
// DRAG_THRESHOLD before release and therefore cannot become clicks.

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
const DRAG_THRESHOLD = RHINO_DRAG_THRESHOLD_PX;

function pointerRay(event: Pick<PointerEvent, "clientX" | "clientY">): ReturnType<typeof skinRenderer.screenToRay> {
  return skinRenderer.screenToRayFromClient(event.clientX, event.clientY);
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
  if (!pointer || patchDrag || supportPaintEnabled || addPatchMode || seedPickMode || denseFlowerSampleActive) return;
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

const SUPPORT_PAINT_RAYCAST_MIN_INTERVAL_MS = 4;
const SUPPORT_PAINT_RAYCAST_MAX_INTERVAL_MS = 32;

function updateSupportPaintCssBrush(pointer: { clientX: number; clientY: number }): void {
  if (!supportPaintEnabled) { supportPaintCssBrush.hidden = true; return; }
  const scaleMmPerUnit = supportPaintSurfaceCache?.scaleMmPerUnit;
  const screenScale = skinRenderer.supportPaintBrushScreenScale(pointer.clientX, pointer.clientY);
  if (!(scaleMmPerUnit && scaleMmPerUnit > 0) || !screenScale) { supportPaintCssBrush.hidden = true; return; }
  const radiusPx = Math.max(2, supportPaintRadiusMm / scaleMmPerUnit * screenScale.pixelsPerObjectUnit);
  const viewportRect = viewport.getBoundingClientRect();
  const x = pointer.clientX - viewportRect.left - radiusPx;
  const y = pointer.clientY - viewportRect.top - radiusPx;
  supportPaintCssBrush.hidden = false;
  if (supportPaintCssBrush.dataset.mode !== supportPaintMode) supportPaintCssBrush.dataset.mode = supportPaintMode;
  const diameter = (radiusPx * 2).toFixed(2) + "px";
  if (supportPaintCssBrush.style.getPropertyValue("--support-paint-brush-diameter") !== diameter) {
    supportPaintCssBrush.style.setProperty("--support-paint-brush-diameter", diameter);
  }
  supportPaintCssBrush.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
}

function resetSupportPaintStrokeCounters(): void {
  supportPaintInteractionCounters.dragPointerMoves = 0;
  supportPaintInteractionCounters.dragMainThreadTriangleScans = 0;
  supportPaintInteractionCounters.dragWebglRenders = 0;
  supportPaintInteractionCounters.dragWorkerRaycasts = 0;
  supportPaintInteractionCounters.dragDabRequests = 0;
  supportPaintInteractionCounters.dragMarkerPartialUpdates = 0;
  supportPaintInteractionCounters.pointerupHistoryCommits = 0;
  supportPaintInteractionCounters.paintApplyWorkerLaunches = 0;
  supportPaintInteractionCounters.fullOverlaySyncsAfterPointerup = 0;
  supportPaintInteractionCounters.fullRendersAfterPointerup = 0;
}

function dispatchSupportPaintDab(
  drag: NonNullable<typeof supportPaintDrag>,
  stroke: SupportPaintStrokeV1,
): void {
  if (!activeSupportPaintWorker || !supportPaintApplyWorkerReady) return;
  const requestId = ++supportPaintApplyRequestId;
  drag.pendingDabCount++;
  supportPaintInteractionCounters.dragDabRequests++;
  drag.dabStartedAt.set(requestId, performance.now());
  const request: SupportPaintWorkerRequest = {
    type: "dab",
    generation: supportPaintApplyGeneration,
    revision: supportPaintSession.revision,
    requestId,
    stroke,
  };
  activeSupportPaintWorker.postMessage(request);
}

function appendSupportPaintWorkerHit(
  drag: NonNullable<typeof supportPaintDrag>,
  hit: NonNullable<Extract<SupportPaintRaycastWorkerMessage, { type: "hit" }>["hit"]>,
): void {
  const context = supportPaintEditingContext();
  if (!context) return;
  const centerMm = {
    xMm: hit.position.x * context.scaleMmPerUnit,
    yMm: hit.position.y * context.scaleMmPerUnit,
    zMm: hit.position.z * context.scaleMmPerUnit,
  };
  if (!shouldSampleSupportPaintPoint(drag.lastSampleCenterMm, centerMm, supportPaintRadiusMm)) return;
  const stroke = createSupportPaintStroke({
    order: supportPaintSession.history.present.strokes.length + (supportPaintSession.activeStroke?.samples.length ?? 0),
    mode: supportPaintMode,
    centerMm,
    radiusMm: supportPaintRadiusMm,
    surfaceNormal: { xMm: hit.normal.x, yMm: hit.normal.y, zMm: hit.normal.z },
    frame: context.frame,
    paintBackfaces: supportPaintBackfaces,
  });
  supportPaintSession = appendActiveSupportPaintSample(supportPaintSession, stroke);
  const activeSamples = supportPaintSession.activeStroke?.samples;
  const appended = activeSamples?.[activeSamples.length - 1];
  if (!appended) return;
  dispatchSupportPaintDab(drag, appended);
  drag.lastSampleCenterMm = { ...centerMm };
  drag.changed = true;
}

function dispatchSupportPaintRaycast(drag: NonNullable<typeof supportPaintDrag>, force = false): void {
  if (supportPaintDrag !== drag || drag.inFlightRequestId !== null || !drag.latestPointer) return;
  if (!activeSupportPaintRaycastWorker || !supportPaintRaycastReady) {
    if (drag.finishing) { drag.latestPointer = null; finalizeSupportPaintDrag(drag, false); }
    return;
  }
  const now = performance.now();
  const waitMs = drag.adaptiveRaycastIntervalMs - (now - drag.lastRaycastDispatchMs);
  if (!force && waitMs > 0) {
    if (drag.throttleTimer === null) {
      drag.throttleTimer = window.setTimeout(() => {
        drag.throttleTimer = null;
        dispatchSupportPaintRaycast(drag);
      }, waitMs);
    }
    return;
  }
  if (drag.throttleTimer !== null) { window.clearTimeout(drag.throttleTimer); drag.throttleTimer = null; }
  const pointer = drag.latestPointer;
  drag.latestPointer = null;
  const frame = skinRenderer.supportPaintPointerFrame(pointer.clientX, pointer.clientY);
  if (!frame) {
    if (drag.finishing) finalizeSupportPaintDrag(drag, drag.commitOnFinish);
    return;
  }
  const requestId = ++supportPaintRaycastRequestId;
  drag.inFlightRequestId = requestId;
  drag.inFlightStartedAt = performance.now();
  drag.lastRaycastDispatchMs = drag.inFlightStartedAt;
  supportPaintInteractionCounters.dragWorkerRaycasts++;
  const request: SupportPaintRaycastWorkerRequest = {
    type: "raycast", generation: supportPaintRaycastGeneration, requestId,
    ray: frame.ray, clipping: skinRenderer.getViewportClippingState(),
  };
  activeSupportPaintRaycastWorker.postMessage(request);
}

function handleSupportPaintRaycastHit(message: Extract<SupportPaintRaycastWorkerMessage, { type: "hit" }>): void {
  const drag = supportPaintDrag;
  if (!drag || drag.inFlightRequestId !== message.requestId) return;
  const roundTripMs = performance.now() - drag.inFlightStartedAt;
  drag.inFlightRequestId = null;
  drag.surfaceRaycastDurationsMs.push(message.computeMs);
  drag.pointerDurationsMs.push(roundTripMs);
  drag.adaptiveRaycastIntervalMs = Math.max(
    SUPPORT_PAINT_RAYCAST_MIN_INTERVAL_MS,
    Math.min(SUPPORT_PAINT_RAYCAST_MAX_INTERVAL_MS, roundTripMs * 0.65),
  );
  if (message.hit) appendSupportPaintWorkerHit(drag, message.hit);
  if (drag.finishing) {
    if (drag.latestPointer) dispatchSupportPaintRaycast(drag, true);
    else maybeFinalizeSupportPaintDrag(drag);
    return;
  }
  if (drag.latestPointer) dispatchSupportPaintRaycast(drag);
}

function handleSupportPaintRaycastError(message: string, requestId?: number): void {
  const drag = supportPaintDrag;
  if (drag && (requestId === undefined || drag.inFlightRequestId === requestId)) {
    drag.inFlightRequestId = null;
    drag.latestPointer = null;
    drag.finishing = true;
    drag.commitOnFinish = false;
    if (drag.pendingDabCount === 0) finalizeSupportPaintDrag(drag, false);
  }
  refreshSupportPaintUi(`Paint Surface Worker失敗: ${message}`);
}

function scheduleSupportPaintPointer(
  pointer: { clientX: number; clientY: number },
  drag: NonNullable<typeof supportPaintDrag>,
): void {
  const brushStartedAt = performance.now();
  updateSupportPaintCssBrush(pointer);
  drag.brushCircleDurationsMs.push(performance.now() - brushStartedAt);
  supportPaintInteractionCounters.dragPointerMoves++;
  drag.latestPointer = pointer;
  dispatchSupportPaintRaycast(drag);
}

function finalizeSupportPaintDrag(drag: NonNullable<typeof supportPaintDrag>, commit: boolean): void {
  if (supportPaintDrag !== drag) return;
  if (drag.inFlightRequestId !== null || drag.latestPointer || drag.pendingDabCount > 0) return;
  if (drag.throttleTimer !== null) window.clearTimeout(drag.throttleTimer);
  drag.throttleTimer = null;
  const pointerupStartedAt = performance.now();
  const sampleCount = supportPaintSession.activeStroke?.samples.length ?? 0;
  supportPaintDrag = null;
  if (commit && drag.changed && sampleCount > 0) {
    supportPaintSession = finishActiveSupportPaintStroke(supportPaintSession, true);
    supportPaintInteractionCounters.pointerupHistoryCommits++;
    supportPaintUndoJournalPast.push({
      before: [...drag.journalBefore.values()].map((change) => ({ ...change })),
      after: [...drag.journalAfter.values()].map((change) => ({ ...change })),
      factsBefore: cloneSupportPaintLiveFacts(drag.journalFactsBefore),
      factsAfter: currentSupportPaintLiveFacts(),
    });
    supportPaintUndoJournalFuture = [];
    invalidateSupportPaintReprojection();
    skinRenderer.commitOverhangSupportSiteClassifications(
      [...drag.previewChanges].map(([id, classification]) => ({ id, classification })),
    );
    autosaveSupportPaintDraft();
    refreshLiveSupportPaintCounts();
    requestDryWebPreviewUpdate("Support Paint pointerup後に更新");
    lastSupportPaintInteractionCounters = { ...supportPaintInteractionCounters };
    refreshSupportPaintUi(
      "Support Paintを1 drag確定 · " + sampleCount + " sample"
      + " · brush p95 " + supportPaintP95(drag.brushCircleDurationsMs).toFixed(1) + "ms"
      + " · Surface hit p95 " + supportPaintP95(drag.pointerDurationsMs).toFixed(1) + "ms"
      + " · paint表示 p95 " + supportPaintP95(drag.paintDisplayDurationsMs).toFixed(1) + "ms"
      + " · pointerup " + (performance.now() - pointerupStartedAt).toFixed(1) + "ms",
    );
  } else {
    supportPaintSession = finishActiveSupportPaintStroke(supportPaintSession, false);
    skinRenderer.clearOverhangSupportSitePreview();
    reapplySupportPaint("塗布対象は変わりませんでした", supportPaintSession.history.present, true);
  }
}

function finishSupportPaintDrag(commit: boolean, pointer?: { clientX: number; clientY: number }): void {
  const drag = supportPaintDrag;
  if (!drag || drag.finishing) return;
  if (pointer) {
    updateSupportPaintCssBrush(pointer);
    drag.latestPointer = pointer;
  }
  drag.finishing = true;
  drag.commitOnFinish = commit;
  if (drag.inFlightRequestId === null) {
    if (drag.latestPointer) dispatchSupportPaintRaycast(drag, true);
    else finalizeSupportPaintDrag(drag, commit);
  }
}

viewport.addEventListener("pointerdown", (e) => {
  // Capture before TrackballControls sees the canvas event. A selected-patch
  // direct drag can therefore disable camera rotation before the control
  // acquires pointer capture; HUD and toolbar descendants remain untouched.
  if (e.target !== skinRenderer.renderer.domElement) return;
  skinRenderer.activateViewportAt(e.clientX, e.clientY);
  if (e.button === 0 && e.shiftKey) {
    // Shift + left drag belongs to the viewport camera even while paint is enabled.
    pointerDownPos = null;
    return;
  }
  if (supportPaintEnabled) {
    pointerDownPos = null;
    if (e.button !== 0 || !overhangSupportResult) return;
    e.preventDefault();
    const context = supportPaintEditingContext();
    if (!context) return;
    if (!activeSupportPaintRaycastWorker || !supportPaintRaycastReady) {
      if (!activeSupportPaintRaycastWorker && surfaceAngleCache) initializeSupportPaintRaycastWorker(surfaceAngleCache);
      refreshSupportPaintUi("Paint Surface indexの準備を待ってください");
      return;
    }
    if (!activeSupportPaintWorker || !supportPaintApplyWorkerReady || supportPaintApplyReplacePending > 0) {
      refreshSupportPaintUi("Paint差分Workerの準備を待ってください");
      return;
    }
    if (activeDryWebPreviewWorker) {
      terminateDryWebPreviewWorker(false);
      phaseASupportStatus.textContent = "Paint drag中 · Dry Webはpointerup後に1回更新します";
      phaseASupportStatus.dataset.stale = "true";
    }
    const initialPaint = supportPaintSession.history.present.strokes.length > 0
      ? undefined
      : emptySupportPaint(context.frame.longestMm);
    supportPaintSession = beginSupportPaintStroke(supportPaintSession, initialPaint);
    resetSupportPaintStrokeCounters();
    supportPaintDrag = {
      pointerId: e.pointerId,
      lastSampleCenterMm: null,
      latestPointer: null,
      inFlightRequestId: null,
      inFlightStartedAt: 0,
      lastRaycastDispatchMs: Number.NEGATIVE_INFINITY,
      throttleTimer: null,
      finishing: false,
      commitOnFinish: true,
      surfaceRaycastDurationsMs: [],
      pointerDurationsMs: [],
      brushCircleDurationsMs: [],
      paintDisplayDurationsMs: [],
      dabStartedAt: new Map(),
      pendingDabCount: 0,
      previewChanges: new Map(),
      journalBefore: new Map(),
      journalAfter: new Map(),
      journalFactsBefore: currentSupportPaintLiveFacts(),
      adaptiveRaycastIntervalMs: SUPPORT_PAINT_RAYCAST_MIN_INTERVAL_MS,
      lastMetricsUiMs: performance.now(),
      siteCount: overhangSupportResult.entries.length,
      startedAt: performance.now(),
      changed: false,
    };
    skinRenderer.renderer.domElement.setPointerCapture?.(e.pointerId);
    scheduleSupportPaintPointer(e, supportPaintDrag);
    return;
  }
  if (e.button !== 0) {
    pointerDownPos = null;
    return;
  }
  pointerDownPos = { x: e.clientX, y: e.clientY };
  // In Axome an unmodified left drag belongs to camera rotation. A release
  // inside the shared threshold still reaches handleClick for selection.
  if (skinRenderer.isAxomeViewportAt(e.clientX, e.clientY)) return;
  if (selectedPatchId === null || addPatchMode || seedPickMode) return;
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
}, { capture: true });

window.addEventListener("pointermove", (e) => {
  if (skinRenderer.isRhinoCameraGestureActive()) return;
  if (supportPaintDrag && e.pointerId === supportPaintDrag.pointerId) { scheduleSupportPaintPointer(e, supportPaintDrag); return; }
  if (supportPaintEnabled) {
    supportPaintInteractionCounters.hoverPointerMoves++;
    updateSupportPaintCssBrush(e);
    return;
  }
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
  if (supportPaintDrag && e.pointerId === supportPaintDrag.pointerId) { finishSupportPaintDrag(true, e); return; }
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
  if (supportPaintDrag) finishSupportPaintDrag(false);
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

  if (showOverhangSupportSites && overhangSupportResult) {
    const supportSite = skinRenderer.pickOverhangSupportSite(
      e.clientX, e.clientY, 10,
      supportOverlayPickingIncludesBack(supportSiteDepthMode, true),
    );
    if (supportSite) {
      setSelectedOverhangSupportSite(supportSite.id);
      return;
    }
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
  nPartitionHeavyComputation?.finish();
  nPartitionHeavyComputation = null;
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
  if (!activeNPartitionWorker) {
    nPartitionHeavyComputation?.finish();
    nPartitionHeavyComputation = null;
    return;
  }
  nPartitionGeneration++;
  activeNPartitionWorker.terminate();
  activeNPartitionWorker = null;
  nPartitionHeavyComputation?.finish();
  nPartitionHeavyComputation = null;
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
  nPartitionHeavyComputation?.finish();
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (!isCurrentWorkerRun(worker, activeNPartitionWorker, requestId, requestId, generation, nPartitionGeneration)
      || nPartitionHeavyComputation?.id !== heavy.id) return;
    cancelNPartitionBuild();
  };
  heavy = beginHeavyComputation("N分割 全体進捗", cancel);
  nPartitionHeavyComputation = heavy;
  heavy.update("Workerへ計算を送信しています…", 0);
  heavy.smoothTo(99);

  const finish = (): void => {
    if (!isCurrentWorkerRun(worker, activeNPartitionWorker, requestId, requestId, generation, nPartitionGeneration)) return;
    worker.terminate();
    activeNPartitionWorker = null;
    heavy.update("N分割完了", 100);
    heavy.finish();
    if (nPartitionHeavyComputation?.id === heavy.id) nPartitionHeavyComputation = null;
    ui.setNPartitionBuildRunning(false);
  };
  worker.onmessage = (event: MessageEvent<NPartitionWorkerMessage>) => {
    const message = event.data;
    if (!isCurrentWorkerRun(worker, activeNPartitionWorker, requestId, message.requestId, generation, nPartitionGeneration)) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") {
      heavy.update(
        `${message.stage}…（${(message.elapsedMs / 1000).toFixed(1)}秒）`,
        workerFractionPercent(message.fraction),
      );
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
    if (!isCurrentWorkerRun(worker, activeNPartitionWorker, requestId, requestId, generation, nPartitionGeneration)) {
      worker.terminate();
      return;
    }
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
  partitionHeavyComputation?.finish();
  partitionHeavyComputation = null;
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
  partitionHeavyComputation?.finish();
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (!isCurrentWorkerRun(worker, activePartitionWorker, requestId, requestId, generation, partitionGeneration)
      || partitionHeavyComputation?.id !== heavy.id) return;
    cancelPartitionBuild();
  };
  heavy = beginHeavyComputation("A/B分割 全体進捗", cancel);
  partitionHeavyComputation = heavy;
  heavy.update("Workerへ計算を送信しています…", 0);
  heavy.smoothTo(99);
  refreshPartitionTutorial();

  // gate-correction P1-2: every exit path terminates the Worker (a Worker
  // that merely posts a result message stays alive/idle otherwise -- the
  // previous round only terminated it on the error/stale paths).
  const finish = (): void => {
    if (!isCurrentWorkerRun(worker, activePartitionWorker, requestId, requestId, generation, partitionGeneration)) return;
    worker.terminate();
    activePartitionWorker = null;
    heavy.update("A/B分割完了", 100);
    heavy.finish();
    if (partitionHeavyComputation?.id === heavy.id) partitionHeavyComputation = null;
    ui.setPartitionBuildRunning(false);
  };

  worker.onmessage = (event: MessageEvent<PartitionWorkerMessage>) => {
    const msg = event.data;
    if (!isCurrentWorkerRun(worker, activePartitionWorker, requestId, msg.requestId, generation, partitionGeneration)) {
      worker.terminate();
      return;
    }
    if (msg.type === "progress") {
      heavy.update(
        `${msg.stage}… (経過 ${(msg.elapsedMs / 1000).toFixed(1)}秒)`,
        workerFractionPercent(msg.fraction),
      );
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
    if (!isCurrentWorkerRun(worker, activePartitionWorker, requestId, requestId, generation, partitionGeneration)) {
      worker.terminate();
      return;
    }
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
  if (!activePartitionWorker) {
    partitionHeavyComputation?.finish();
    partitionHeavyComputation = null;
    return;
  }
  partitionGeneration++;
  activePartitionWorker.terminate();
  activePartitionWorker = null;
  partitionHeavyComputation?.finish();
  partitionHeavyComputation = null;
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

function requestShapeUndo(): void {
  if (!canInvokeShapeUndo(supportPaintEnabled)) {
    ui.setUndoStatus("Support Paint中です。右のPaint UndoまたはCtrl/Cmd+Zを使ってください");
    return;
  }
  undoLastOperation();
}

function requestShapeUndoSteps(steps: number): void {
  if (!canInvokeShapeUndo(supportPaintEnabled)) {
    ui.setUndoStatus("Support Paint中は形状履歴を戻せません");
    return;
  }
  undoSeveralOperations(steps);
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
  syncProjectBar();
}

function syncProjectBar(): void {
  const paintBusy = Boolean(supportPaintDrag) || supportPaintApplyReplacePending > 0;
  const canPaintUndo = supportPaintEnabled && supportPaintSession.history.past.length > 0 && !paintBusy;
  const canShapeUndo = !supportPaintEnabled && history.length > 1;
  const canPaintRedo = supportPaintEnabled && supportPaintSession.history.future.length > 0 && !paintBusy;

  projectUndoButton.disabled = !(canPaintUndo || canShapeUndo);
  projectUndoButton.textContent = supportPaintEnabled ? "Undo · Paint" : "Undo · Shape";
  projectUndoButton.title = supportPaintEnabled
    ? "Support Paint Undo（右のPaint履歴と同じ）"
    : "Shape history Undo（既存の形状履歴）";
  projectRedoButton.disabled = !canPaintRedo;
  projectRedoButton.textContent = supportPaintEnabled ? "Redo · Paint" : "Redo";
  projectRedoButton.title = supportPaintEnabled
    ? "Support Paint Redo（右のPaint履歴と同じ）"
    : "Shape Redoは未実装。Paint中のみPaint Redoを表示します";
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
    supportPaintSession = createSupportPaintSession(); resetSupportPaintUndoJournal(); supportPaintDraftSavedAt = null; supportPaintDraftDirty = false;
    applyRecipeText(text);
    restoreAutosavedSupportPaintDraft();
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

function currentV088Surface128Proof(): typeof v088Surface128Proof {
  return v088Surface128Proof
    && v088Surface128Proof.surfaceAngleGeneration === surfaceAngleGeneration
    && surfaceAngleCache?.resolution === V088_SURFACE_RESOLUTION
    ? v088Surface128Proof
    : null;
}

function currentPrintScaleMmPerUnit(): number | undefined {
  const diagnosis = surfaceAngleCache;
  if (!diagnosis) return undefined;
  const sourceLongest = triangleSoupLongestExtent(diagnosis.basePositions);
  const targetLongestMm = ui.getMeshOptions().targetLongestMm;
  return sourceLongest > 0 && targetLongestMm > 0 ? targetLongestMm / sourceLongest : undefined;
}

function currentPrintProfileFinalizationSourceBinding() {
  const options = ui.getMeshOptions();
  return {
    recipeSha256: importedRecipeSha256,
    seed: state.hostParams.seed,
    currentInternalStructure: state.skinParams.internalStructure,
    currentDryWebNormalizedRadius: state.skinParams.internalRadius,
    currentTargetLongestMm: options.targetLongestMm,
    currentAngleThresholdDeg: ui.getSurfaceAngleThreshold(),
    currentSupportPaint: supportPaintSession.history.present.strokes.length > 0 ? supportPaintSession.history.present : null,
  };
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
    ...(overhangSupportResult?.rayFacts ? { currentSupportRayEpsilonMm: overhangSupportResult.rayFacts.lowerIntersectionEpsilonMm } : {}),
    currentSupportPaint: supportPaintSession.history.present.strokes.length > 0 ? supportPaintSession.history.present : null,
    ...(includeScale && currentPrintScaleMmPerUnit() !== undefined ? { scaleMmPerUnit: currentPrintScaleMmPerUnit() } : {}),
  };
}

function refreshPrintProfileSummary(): void {
  if (!activePrintProfile || !activePrintProfileSha256) { ui.setPrintProfileSummary(null); return; }
  const profile = activePrintProfile;
  const match = matchPrintProfile(profile, currentPrintProfileBinding(profile));
  const actualScale = currentPrintScaleMmPerUnit();
  const actualDryWebDiameterMm = actualScale === undefined ? "最終精度診断後に確定" : (state.skinParams.internalRadius * actualScale * 2).toFixed(3) + " mm";
  const supportRayEpsilonMm = overhangSupportResult?.rayFacts?.lowerIntersectionEpsilonMm
    ?? profile.supportClassification?.lowerIntersectionEpsilonMm;
  const proof = currentV088Surface128Proof();
  let finalizationStatus = "Surface 128再投影・分類が未完了";
  try {
    assertV088FinalizationReady({
      surfaceResolution: profile.geometry.surfaceResolution, fusedResolution: profile.geometry.fusedResolution,
      reprojectedSurfaceResolution: proof?.resolution ?? null, reprojectedClassificationCounts: proof?.counts ?? null,
      classificationCounts: overhangSupportResult?.counts ?? null,
      expectedProfileClassificationCounts: profile.expectedClassificationCounts ?? null,
      profileMatches: match.matches, generatorCommit: profile.generatorCommit, runningAppCommit: RUNNING_APP_COMMIT,
    });
    finalizationStatus = "保存・3MF生成条件に一致";
  } catch (error) {
    finalizationStatus = (error as Error).message;
  }
  ui.setPrintProfileSummary({
    profileName: profile.profileName,
    profileSha256: activePrintProfileSha256,
    matches: match.matches,
    status: match.matches ? "現在設定と一致" : match.reasons.join(" / "),
    values: [
      ["読込ファイル", activePrintProfileFilename ?? "画面で作成"],
      ["Support policy", profile.supportPolicy ?? "未記録"],
      ["Surface ray epsilon", supportRayEpsilonMm === undefined ? "診断後に確定" : `${supportRayEpsilonMm.toFixed(6)} mm`],
      ["Support Paint", `${profile.supportPaint?.strokes.length ?? 0} sample（現在 ${supportPaintSession.history.present.strokes.length}）`],
      ["分類 total / inside / outside / unresolved", (() => {
        const counts = overhangSupportResult?.counts ?? profile.expectedClassificationCounts;
        return counts ? `${counts.mixedFace} mixed / ${counts.insideSupportSite} inside site / ${counts.outsideSupportSite} outside site / ${counts.unresolvedSupportSite} unresolved site / ${counts.duplicateSupportSite} duplicate site` : "診断後に確定";
      })()],
      ["最長辺", profile.geometry.targetLongestMm + " mm"],
      ["Surface / 融合", profile.geometry.surfaceResolution + " / " + profile.geometry.fusedResolution],
      ["角度閾値", profile.geometry.angleThresholdDeg + "°"],
      ["Dry Web 正規化径", String(profile.internalStructure.dryWebNormalizedRadius)],
      ["Dry Web 実寸直径", profile.internalStructure.dryWebPhysicalDiameterMm.toFixed(3) + " mm（現在 " + actualDryWebDiameterMm + "）"],
      ["scaffold 軸 / 足 / 接点", profile.scaffold.shaftDiameterMm.toFixed(2) + " / " + profile.scaffold.footDiameterMm.toFixed(2) + " / " + profile.scaffold.contactDiameterMm.toFixed(2) + " mm"],
      ["scaffold 間隔 / overlap", profile.scaffold.spacingMm.toFixed(2) + " / " + profile.scaffold.contactOverlapMm.toFixed(2) + " mm"],
      ["Printer", profile.printer.printer + " · nozzle " + profile.printer.nozzleMm + " mm · " + profile.printer.material + " · layer " + profile.printer.layerHeightMm + " mm"],
      ["Profile generator", profile.generatorCommit + (profile.generatorTag ? " · " + profile.generatorTag : "")],
      ["実行中app commit", RUNNING_APP_COMMIT],
      ["v088 finalization", finalizationStatus],
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
    supportPaintSession = createSupportPaintSession(profile.supportPaint ?? emptySupportPaint(profile.geometry.targetLongestMm));
    resetSupportPaintUndoJournal();
    supportPaintDraftSavedAt = null; supportPaintDraftDirty = false;
    restoreAutosavedSupportPaintDraft();
    refreshPrintProfileSummary();
  } catch (error) {
    alert("Print Profileの読み込みに失敗しました: " + (error as Error).message);
  }
}

async function saveCurrentPrintProfile(): Promise<void> {
  if (supportPaintDrag || supportPaintApplyReplacePending > 0) { alert("Support Paintの確定を待ってください"); return; }
  refreshPaintedDryWebTargets();
  if (!importedRecipeSha256 || !importedRecipeFilename) { alert("先にShape Recipeを読み込んでください"); return; }
  const scaleMmPerUnit = currentPrintScaleMmPerUnit();
  if (scaleMmPerUnit === undefined || !surfaceAngleCache) { alert("先に最終精度診断を実行してください"); return; }
  if (state.skinParams.internalStructure !== "targetedGrid") { alert("Print Profile v1はDry Web（targetedGrid）に限定しています"); return; }
  if (!overhangSupportResult) { alert("先に共有ポリシーでオーバーハング分類を完了してください"); return; }
  if (!overhangSupportResult.rayFacts) { alert("support-free Surface ray factsがありません"); return; }
  const options = ui.getMeshOptions();
  const proof = currentV088Surface128Proof();
  const dryRadiusMm = state.skinParams.internalRadius * scaleMmPerUnit;
  const scaffold = { ...DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS, baseRadiusMm: 1.2 };
  const profile = buildSkinPrintProfileV1({
    profileName: (importedRecipeFilename.endsWith(".json") ? importedRecipeFilename.slice(0, -5) : importedRecipeFilename) + " print",
    appVersion: manifest.version, artifactVersion: "v088",
    generatorCommit: RUNNING_APP_COMMIT, generatorTag: null,
    supportPolicy: overhangSupportResult.policy,
    supportClassification: {
      method: overhangSupportResult.rayFacts.method,
      surfaceSource: overhangSupportResult.rayFacts.surfaceSource,
      rayDirection: overhangSupportResult.rayFacts.rayDirection,
      lowerIntersectionEpsilonMm: overhangSupportResult.rayFacts.lowerIntersectionEpsilonMm,
    },
    expectedClassificationCounts: overhangSupportResult.counts,
    ...(supportPaintSession.history.present.strokes.length > 0 ? { supportPaint: supportPaintSession.history.present } : {}),
    shapeRecipe: { sha256: importedRecipeSha256, seed: state.hostParams.seed, pathHint: importedRecipeFilename },
    geometry: { targetLongestMm: options.targetLongestMm, surfaceResolution: V088_SURFACE_RESOLUTION, fusedResolution: V088_FUSED_RESOLUTION, angleThresholdDeg: ui.getSurfaceAngleThreshold() },
    internalStructure: { method: "targetedGrid", dryWebNormalizedRadius: state.skinParams.internalRadius, dryWebPhysicalRadiusMm: dryRadiusMm },
    scaffold: { coverageMode: scaffold.coverageMode, perimeterBandMm: scaffold.perimeterBandMm, spacingMm: scaffold.spacingMm,
      shaftRadiusMm: scaffold.shaftRadiusMm, footRadiusMm: scaffold.baseRadiusMm,
      contactRadiusMm: scaffold.tipRadiusMm, contactOverlapMm: scaffold.contactOverlapMm,
      plateAnchorDropMm: scaffold.plateAnchorDropMm, baseHeightMm: scaffold.baseHeightMm, tipHeightMm: scaffold.tipHeightMm, xyClearanceMm: scaffold.xyClearanceMm, sides: scaffold.sides,
      baseInteriorPolicy: "exclude-host-interior-v1", explicitTargets: [] },
    printer: { printer: "Bambu Lab A1 mini", nozzleMm: 0.4, material: "PLA", layerHeightMm: 0.2, automaticSupport: false, supportType: "normal(manual)" },
    slicer: { application: "Bambu Studio", version: "not-recorded", printerPresetId: "Bambu Lab A1 mini 0.4 nozzle", filamentPresetId: "Generic PLA", processPresetId: "0.20mm Standard BBL A1M" },
    executionHints: { workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) },
  });
  const profileMatch = matchPrintProfile(profile, currentPrintProfileBinding(profile));
  try {
    assertV088FinalizationReady({
      surfaceResolution: profile.geometry.surfaceResolution, fusedResolution: profile.geometry.fusedResolution,
      reprojectedSurfaceResolution: proof?.resolution ?? null, reprojectedClassificationCounts: proof?.counts ?? null,
      classificationCounts: overhangSupportResult.counts, expectedProfileClassificationCounts: profile.expectedClassificationCounts ?? null,
      profileMatches: profileMatch.matches, generatorCommit: profile.generatorCommit, runningAppCommit: RUNNING_APP_COMMIT,
    });
  } catch (error) {
    alert((error as Error).message);
    return;
  }
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
  internalPrintGateHeavyComputation?.finish();
  internalPrintGateHeavyComputation = null;
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

function cancelInternalPrintGate(): void {
  if (!activeInternalPrintGateWorker && !internalPrintGateHeavyComputation) return;
  invalidateInternalPrintGate("内部構造判定をキャンセルしました");
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
  internalPrintGateHeavyComputation?.finish();
  internalPrintGateHeavyComputation = null;
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
  const worker = new Worker(new URL("./internalPrintGate.worker.ts", import.meta.url), { type: "module" });
  activeInternalPrintGateWorker = worker;
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (!isCurrentWorkerRun(worker, activeInternalPrintGateWorker, requestId, requestId, generation, internalPrintGateGeneration)
      || pendingInternalPrintGateFingerprint !== fingerprint
      || internalPrintGateHeavyComputation?.id !== heavy.id) return;
    cancelInternalPrintGate();
  };
  heavy = beginHeavyComputation("Internal判定 全体進捗", cancel);
  internalPrintGateHeavyComputation = heavy;
  heavy.update(`${gateStage} · 0秒`, 0);
  heavy.smoothTo(99);
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
  worker.onmessage = (event: MessageEvent<InternalPrintGateWorkerMessage>) => {
    const message = event.data;
    if (
      !isCurrentWorkerRun(worker, activeInternalPrintGateWorker, requestId, message.requestId, generation, internalPrintGateGeneration, message.generation) ||
      pendingInternalPrintGateFingerprint !== fingerprint
    ) {
      worker.terminate();
      return;
    }
    worker.terminate();
    activeInternalPrintGateWorker = null;
    clearInternalPrintGateStatusTimer();
    ui.setInternalPrintGateRunning(false);
    if (message.type === "error") {
      heavy.finish();
      if (internalPrintGateHeavyComputation?.id === heavy.id) internalPrintGateHeavyComputation = null;
      pendingInternalPrintGateFingerprint = "";
      ui.setInternalPrintGateStatus(`NG · 判定できませんでした: ${message.message}`, false);
      ui.setInternalPrintGateExportAllowed(false, true);
      return;
    }
    heavy.update("Internal判定完了", 100);
    heavy.finish();
    if (internalPrintGateHeavyComputation?.id === heavy.id) internalPrintGateHeavyComputation = null;
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
    if (!isCurrentWorkerRun(worker, activeInternalPrintGateWorker, null, undefined, generation, internalPrintGateGeneration) ||
      pendingInternalPrintGateFingerprint !== fingerprint) {
      worker.terminate();
      return;
    }
    worker.terminate();
    activeInternalPrintGateWorker = null;
    pendingInternalPrintGateFingerprint = "";
    clearInternalPrintGateStatusTimer();
    heavy.finish();
    if (internalPrintGateHeavyComputation?.id === heavy.id) internalPrintGateHeavyComputation = null;
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

function openingMapStageProgress(stage: string): number {
  if (stage.includes("現在の形状メッシュ")) return 20;
  if (stage.includes("ホスト表面")) return 45;
  if (stage.includes("被覆を分類")) return 70;
  if (stage.includes("空隙を連結")) return 88;
  return 50;
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
  openingMapHeavyComputation?.finish();
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (!isCurrentWorkerRun(worker, activeOpeningMapWorker, request.requestId, request.requestId, request.generation, openingMapGeneration)
      || openingMapHeavyComputation?.id !== heavy.id) return;
    cancelOpeningMap(true);
  };
  heavy = beginHeavyComputation("Opening Map 全体進捗", cancel);
  openingMapHeavyComputation = heavy;
  heavy.update("現在の形状メッシュを準備中…", 0);
  heavy.smoothTo(99);
  worker.onmessage = (event: MessageEvent<OpeningMapWorkerMessage>) => {
    const message = event.data;
    if (!isCurrentWorkerRun(worker, activeOpeningMapWorker, request.requestId, message.requestId, request.generation, openingMapGeneration, message.generation)) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") {
      heavy.update(
        `${message.stage} · 経過 ${(message.elapsedMs / 1000).toFixed(1)}秒`,
        openingMapStageProgress(message.stage),
      );
      ui.setOpeningMapStatus(`${message.stage} · 経過 ${(message.elapsedMs / 1000).toFixed(1)}秒`);
      return;
    }
    activeOpeningMapWorker = null; worker.terminate(); ui.setOpeningMapRunning(false);
    if (message.type === "error") {
      heavy.finish();
      if (openingMapHeavyComputation?.id === heavy.id) openingMapHeavyComputation = null;
      ui.setOpeningMapStatus(`計測できませんでした: ${message.message}`, false);
      return;
    }
    heavy.update("Opening Map完了", 100);
    heavy.finish();
    if (openingMapHeavyComputation?.id === heavy.id) openingMapHeavyComputation = null;
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
  worker.onerror = (event) => {
    if (!isCurrentWorkerRun(worker, activeOpeningMapWorker, null, undefined, request.generation, openingMapGeneration)) {
      worker.terminate();
      return;
    }
    activeOpeningMapWorker = null;
    worker.terminate();
    heavy.finish();
    if (openingMapHeavyComputation?.id === heavy.id) openingMapHeavyComputation = null;
    ui.setOpeningMapRunning(false);
    ui.setOpeningMapStatus(`計測Workerに失敗しました: ${event.message}`, false);
  };
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
  if (!activeOpeningMapWorker) {
    openingMapHeavyComputation?.finish();
    openingMapHeavyComputation = null;
    return;
  }
  activeOpeningMapWorker.terminate(); activeOpeningMapWorker = null; openingMapGeneration++;
  openingMapHeavyComputation?.finish();
  openingMapHeavyComputation = null;
  ui.setOpeningMapRunning(false);
  if (showStatus) ui.setOpeningMapStatus("計測をキャンセルしました");
}

/** Mutations invalidate both completed estimates and in-flight Workers. */
function invalidateOpeningMap(): void {
  const hadMeasurement = openingMapEverRun || activeOpeningMapWorker !== null || openingMapResult !== null || denseFlowerSampleActive;
  openingMapHeavyComputation?.finish();
  openingMapHeavyComputation = null;
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
  const hadDiagnosis = activeSurfaceAngleWorker !== null || activeSurfaceSupportClassificationWorker !== null || surfaceAngleCache !== null;
  surfaceHeavyComputation?.finish();
  surfaceHeavyComputation = null;
  surfaceAngleGeneration++;
  if (activeSurfaceAngleWorker) {
    activeSurfaceAngleWorker.terminate();
    activeSurfaceAngleWorker = null;
  }
  if (activeSurfaceSupportClassificationWorker) {
    activeSurfaceSupportClassificationWorker.terminate();
    activeSurfaceSupportClassificationWorker = null;
  }
  activeSurfacePersistentCacheKeys = null;
  activeSurfaceCacheMissReport = null;
  activeLegacySurfaceCacheKey = null;
  invalidateSupportPaintEditingResources();
  surfaceAngleCache = null;
  automaticOverhangSupportResult = null;
  overhangSupportResult = null;
  supportPaintEnabled = false;
  ui.setShapeUndoLocked(false);
  viewport.classList.remove("support-paint-active");
  skinRenderer.setOrbitEnabled(true);
  setSelectedOverhangSupportSite(null);
  refreshSupportPaintUi("支持点の診断後に使えます");
  skinRenderer.clearSurfaceAngleOverlay();
  skinRenderer.clearOverhangSupportSiteOverlay();
  terminateDryWebPreviewWorker(true);
  skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
  phaseASupportStatus.textContent = "Surface診断後に支持林を表示します";
  delete phaseASupportStatus.dataset.ok;
  delete phaseASupportStatus.dataset.stale;
  ui.setOverhangSupportSiteOverlay(false, showOverhangSupportSites, showMixedSupportFaces, showSupportFootprint, supportSiteDepthMode, "支持点は未診断");
  cancelBambu3mfExport(false);
  if (showMotifLowestPoints) refreshMotifLowestPointMarkers();
  ui.setSurfaceAngleDiagnosisRunning(false);
  ui.setSurfaceAngleDiagnosisView("before", false, false);
  if (hadDiagnosis) {
    ui.setSurfaceAngleDiagnosisStatus(message);
    ui.setBambu3mfExportStatus("角度診断が古くなりました。もう一度「最終精度で診断」を実行してください");
  }
}

function cancelSurfaceAngleDiagnosis(): void {
  if (!surfaceHeavyComputation && !activeSurfaceAngleWorker && !activeSurfaceSupportClassificationWorker) return;
  invalidateSurfaceAngleDiagnosis("角度診断をキャンセルしました");
  ui.setSurfaceAngleDiagnosisStatus("角度診断をキャンセルしました");
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
  if (supportPaintDrag || supportPaintApplyReplacePending > 0) {
    ui.setBambu3mfExportStatus("Support Paintの確定を待ってください", false);
    return;
  }
  refreshPaintedDryWebTargets();
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
  const proof = currentV088Surface128Proof();
  const profileMatch = matchPrintProfile(activePrintProfile, currentPrintProfileBinding(activePrintProfile));
  try {
    assertV088FinalizationReady({
      surfaceResolution: activePrintProfile.geometry.surfaceResolution, fusedResolution: activePrintProfile.geometry.fusedResolution,
      reprojectedSurfaceResolution: proof?.resolution ?? null, reprojectedClassificationCounts: proof?.counts ?? null,
      classificationCounts: assignments.counts, expectedProfileClassificationCounts: activePrintProfile.expectedClassificationCounts ?? null,
      profileMatches: profileMatch.matches, generatorCommit: activePrintProfile.generatorCommit, runningAppCommit: RUNNING_APP_COMMIT,
    });
  } catch (error) {
    ui.setBambu3mfExportStatus((error as Error).message, false);
    refreshPrintProfileSummary();
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
    assertResolvedPrintPlanSupportCounts(printPlan, assignments.counts, assignments.rayFacts);
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
  let progressStage = `3MF 1/7 · 入力を準備 · policy=${assignments.policy} · mixed=${assignments.counts.mixedFace} inside-site=${assignments.counts.insideSupportSite} outside-site=${assignments.counts.outsideSupportSite} unresolved-site=${assignments.counts.unresolvedSupportSite} duplicate-site=${assignments.counts.duplicateSupportSite} · 候補${dangerFaces.toLocaleString()}面`;
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
      `保存完了 · policy=${message.supportPolicy} · mixed face=${message.classificationCounts.mixedFace} / inside site=${message.classificationCounts.insideSupportSite} / outside site=${message.classificationCounts.outsideSupportSite} / unresolved site=${message.classificationCounts.unresolvedSupportSite} / duplicate site=${message.classificationCounts.duplicateSupportSite} · 候補${message.reachability.candidateFaceCount.toLocaleString()} → 外側直下到達${message.reachability.keptFaceCount.toLocaleString()} / 内側・遮蔽除外${message.reachability.rejectedFaceCount.toLocaleString()}（無効${message.reachability.invalidCandidateFaceCount.toLocaleString()}） · 全到達候補${message.scaffold.coverageFaceCount.toLocaleString()} → 支柱${message.scaffold.pillarCount.toLocaleString()}本（BODY衝突除外${message.scaffold.collisionRejectedFaceCount.toLocaleString()}） · 最終一体mesh ${message.stats.bodyFaces.toLocaleString()}面 · ${sizeMb.toFixed(1)} MB · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
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

function refreshSurfaceStartupStatus(phase: string): void {
  const shell = skinShellInteractiveMs === null ? "pending" : skinShellInteractiveMs.toFixed(1) + "ms";
  ui.setSurfaceStartupStatus(
    "起動実測 · " + phase
    + " · shell " + shell
    + " · recipe " + reviewRecipeLoadMs.toFixed(1) + "ms"
    + " · cache lookup " + surfaceCacheLookupMs.toFixed(1) + "ms"
    + " · ledger restore " + surfaceClassificationRestoreMs.toFixed(1) + "ms"
    + " · classification Worker " + supportClassificationComputeMs.toFixed(1) + "ms"
    + " · Paint BVH " + paintBvhBuildMs.toFixed(1) + "ms"
    + " · 回数 Surface生成 " + surfaceGenerationWorkerLaunchCount
    + " / 面判定 " + automaticFaceDiagnosisWorkerLaunchCount
    + " / 自動分類 " + automaticSupportClassificationWorkerLaunchCount
    + " / Paint BVH " + paintBvhWorkerLaunchCount,
    phase.startsWith("ready"),
  );
}

function formatSurfaceEnvironmentDiagnostics(): string {
  const capability = surfacePersistentCacheCapability;
  const yesNo = (value: boolean | null): string => value === null ? "unknown" : value ? "yes" : "no";
  const activeKeys = activeSurfacePersistentCacheKeys;
  return [
    "Surface / Windows確認情報（取得時点）",
    `origin: ${capability.origin ?? location.origin}`,
    `isSecureContext: ${yesNo(capability.isSecureContext)}`,
    `crypto: ${yesNo(capability.cryptoAvailable)}`,
    `crypto.subtle: ${yesNo(capability.subtleAvailable)}`,
    `crypto.subtle.digest: ${yesNo(capability.digestAvailable)}`,
    `indexedDB: ${yesNo(capability.indexedDBAvailable)}`,
    `Worker: ${yesNo(capability.workerAvailable)}`,
    `navigator.hardwareConcurrency: ${capability.hardwareConcurrency ?? "unknown"}`,
    `cache status: ${surfaceAnglePersistentCacheStatus}`,
    `cache available: ${yesNo(capability.cacheAvailable)}`,
    `unavailable reasons: ${capability.unavailableReasons.join(", ") || "none"}`,
    `active cache keys: mesh=${activeKeys?.meshKey ? "set" : "null"} / diagnosis=${activeKeys?.diagnosisKey ? "set" : "null"}`,
    `Worker launches: Surface=${surfaceWorkerLaunchCount} / Surface生成=${surfaceGenerationWorkerLaunchCount} / 面判定=${automaticFaceDiagnosisWorkerLaunchCount} / 自動分類=${automaticSupportClassificationWorkerLaunchCount} / Paint BVH=${paintBvhWorkerLaunchCount}`,
    `timings: cache lookup=${surfaceCacheLookupMs.toFixed(1)}ms / ledger restore=${surfaceClassificationRestoreMs.toFixed(1)}ms / classification=${supportClassificationComputeMs.toFixed(1)}ms / Paint BVH=${paintBvhBuildMs.toFixed(1)}ms`,
    `resolution: ${surfaceAngleCache?.resolution ?? "none"}`,
  ].join("\n");
}

function persistFinishedSurfaceAngleDiagnosis(
  message: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
): void {
  const keys = activeSurfacePersistentCacheKeys;
  const automaticResult = automaticOverhangSupportResult;
  if (!surfacePersistentCacheCapability.cacheAvailable
    || !keys
    || !automaticResult
    || ["hit", "unavailable", "error"].includes(surfaceAnglePersistentCacheStatus)) return;
  void runSurfacePersistentCacheIfAvailable(
    surfacePersistentCacheCapability,
    () => writeSurfacePersistentCache(keys, message, automaticResult).then(() => true),
  ).then((stored) => {
      if (!stored) return;
      if (keys.diagnosisKey !== activeSurfacePersistentCacheKeys?.diagnosisKey) return;
      surfaceAnglePersistentCacheStatus = "stored";
      console.info("[SKIN Surface cache] stored", {
        meshKey: keys.meshKey, diagnosisKey: keys.diagnosisKey, resolution: message.resolution,
        classificationCounts: automaticResult.counts,
      });
      refreshSurfaceStartupStatus("ready · cache stored");
    })
    .catch((error) => {
      if (keys.diagnosisKey !== activeSurfacePersistentCacheKeys?.diagnosisKey) return;
      surfaceAnglePersistentCacheStatus = "error";
      console.warn("[SKIN Surface cache] write failed", error);
    });
}

function finishSurfaceAngleDiagnosis(
  message: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
  heavy: HeavyComputationHandle,
): void {
  heavy.update("Surface診断完了", 100);
  heavy.finish();
  if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
  persistFinishedSurfaceAngleDiagnosis(message);
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
  v088Surface128Proof = message.resolution === V088_SURFACE_RESOLUTION && classification
    ? { surfaceAngleGeneration, resolution: message.resolution, counts: { ...classification } }
    : null;
  ui.setSurfaceAngleDiagnosisRunning(false);
  const cacheText = surfaceAnglePersistentCacheStatus === "ledger-upgrade"
    ? "保存済み診断hit・分類ledger補完 · Surface Worker " + surfaceGenerationWorkerLaunchCount + " · 面判定Worker " + automaticFaceDiagnosisWorkerLaunchCount
    : surfaceAnglePersistentCacheStatus === "migrated"
    ? `旧Case A cache→同一Surface mesh key移行 · Surface Worker ${surfaceGenerationWorkerLaunchCount} · 面判定Worker ${automaticFaceDiagnosisWorkerLaunchCount}`
    : surfaceAnglePersistentCacheStatus === "hit"
      ? `永続cache hit · Surface Worker ${surfaceGenerationWorkerLaunchCount} · 面判定Worker ${automaticFaceDiagnosisWorkerLaunchCount}`
    : surfaceAnglePersistentCacheStatus === "mesh-hit"
      ? `Surface mesh cache hit · Surface Worker ${surfaceGenerationWorkerLaunchCount} · 面判定Worker ${automaticFaceDiagnosisWorkerLaunchCount}`
    : surfaceAnglePersistentCacheStatus === "unavailable"
      ? `永続cache unavailable · cacheを使わず再計算 · Surface Worker ${surfaceGenerationWorkerLaunchCount} · 面判定Worker ${automaticFaceDiagnosisWorkerLaunchCount}`
    : surfaceAnglePersistentCacheStatus === "error"
      ? `永続cache error · cacheを使わず再計算 · Surface Worker ${surfaceGenerationWorkerLaunchCount} · 面判定Worker ${automaticFaceDiagnosisWorkerLaunchCount}`
      : "永続cache miss · Surface Worker " + surfaceGenerationWorkerLaunchCount + " · 面判定Worker " + automaticFaceDiagnosisWorkerLaunchCount;
  const elapsedText = ["hit", "migrated", "ledger-upgrade"].includes(surfaceAnglePersistentCacheStatus)
    ? "保存済み診断 " + (message.elapsedMs / 1000).toFixed(1) + "秒（今回の読込時間には非計上）"
    : "今回診断 " + (message.elapsedMs / 1000).toFixed(1) + "秒";
  ui.setSurfaceAngleDiagnosisStatus(hasInternal
    ? `${cacheText} · 最終mesh解像度${message.resolution} · 閾値${message.metrics.thresholdDeg.toFixed(0)}° · 付加前 ${areaPct(message.metrics.dangerousAreaBefore)} → 付加後未支援 ${areaPct(message.metrics.dangerousAreaAfter)} · 軽減候補 ${reducedPct}` + " · " + elapsedText
    : `${cacheText} · 最終mesh解像度${message.resolution} · 閾値${message.metrics.thresholdDeg.toFixed(0)}° · 危険候補 ${areaPct(message.metrics.dangerousAreaBefore)} · Internal Structureなし（付加後比較は無効）`,
    true,
  );
  const supportFaceCount = hasInternal
    ? message.metrics.dangerousFaceCountAfter
    : message.metrics.dangerousFaceCountBefore;
  if (supportFaceCount === 0) {
    ui.setBambu3mfExportStatus(classification
      ? `準備完了 · policy=${overhangSupportResult!.policy} · mixed face=${classification.mixedFace} / inside site=${classification.insideSupportSite} / outside site=${classification.outsideSupportSite} / unresolved site=${classification.unresolvedSupportSite} / duplicate site=${classification.duplicateSupportSite}`
      : "Internal付加後に未支援の赤面は0面です。外部支柱は不要です", true);
  } else {
    const gateNote = hasInternal ? " · Internal最終判定OKも必要" : "";
    const stage = hasInternal ? "付加後に残る赤面" : "赤面";
    ui.setBambu3mfExportStatus(
      classification
        ? `準備完了 · policy=${overhangSupportResult!.policy} · mixed face=${classification.mixedFace} / inside site=${classification.insideSupportSite} / outside site=${classification.outsideSupportSite} / unresolved site=${classification.unresolvedSupportSite} / duplicate site=${classification.duplicateSupportSite} · ${stage}${supportFaceCount.toLocaleString()}面${gateNote}`
        : `準備完了 · ${stage}${supportFaceCount.toLocaleString()}面をSupport Enforcerへ変換できます${gateNote}`,
      true,
    );
  }
  refreshOverhangSupportSiteOverlay();
  setSelectedOverhangSupportSite(null);
  refreshSupportPaintUi("自動分類を下書きとしてSupport Paintを使えます");
  showSurfaceAngleDiagnosisView("before");
  applyLocalReviewCamera(message.basePositions);
  ui.setSurfaceAngleDiagnosisView("before", true, hasInternal);
  refreshPrintProfileSummary();
  refreshMotifLowestPointMarkers();
  refreshPhaseASupportPreview();
  requestDryWebPreviewUpdate("自動Dry Web判定を適用");
  refreshSurfaceStartupStatus("ready");
}

function recheckTargetedGridFromExactMesh(
  base: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
  graph: InternalStructureGraph,
  heavy: HeavyComputationHandle,
): void {
  const generation = surfaceAngleGeneration;
  ui.setSurfaceAngleDiagnosisRunning(true);
  ui.setSurfaceAngleDiagnosisStatus("全赤点からDry Webを生成しました。同じ最終メッシュ上で付加後を別Workerで再診断しています…");
  const reinforced = reinforceQuadConnectionsForMesh(state.patches, state.skinParams.quadMeshJoinWidth);
  const bounds = computeSkinSamplingBounds(state.host, state.hostParams.k, state.skinParams.thickness, reinforced.patches);
  const meshStep = bounds.longest > 0 ? bounds.longest / base.resolution : 1 / base.resolution;
  const worker = createSurfaceWorkerOnCacheMiss(null, () => {
    surfaceWorkerLaunchCount++;
    automaticFaceDiagnosisWorkerLaunchCount++;
    return new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
  })!;
  activeSurfaceAngleWorker = worker;
  heavy.update("Dry Web付加後のSurface再診断Workerを実行中…", 50);
  heavy.smoothTo(SURFACE_PROGRESS_CLASSIFICATION - 1);
  const request: SurfaceAngleDiagnosisRequest = {
    type: "recheck", generation,
    basePositions: base.basePositions.slice(), baseNormals: base.baseNormals.slice(), baseFaceCount: base.baseFaceCount,
    resolution: base.resolution, internalGraph: graph, thresholdDeg: base.metrics.thresholdDeg, meshStep,
    mode: state.mode,
    patches: state.patches.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })),
    roundK: state.skinParams.roundK, previousElapsedMs: base.elapsedMs,
  };
  worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
    const message = event.data;
    if (!isCurrentWorkerRun(worker, activeSurfaceAngleWorker, null, undefined, generation, surfaceAngleGeneration, message.generation)) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") return;
    worker.terminate();
    activeSurfaceAngleWorker = null;
    ui.setSurfaceAngleDiagnosisRunning(false);
    if (message.type === "error") {
      ui.setSurfaceAngleDiagnosisStatus(`Dry Webの付加後診断に失敗しました: ${message.message}`, false);
      heavy.finish();
      if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
      return;
    }
    finishSurfaceAngleDiagnosis(message, heavy);
  };
  worker.onerror = (event) => {
    if (!isCurrentWorkerRun(worker, activeSurfaceAngleWorker, null, undefined, generation, surfaceAngleGeneration)) {
      worker.terminate();
      return;
    }
    activeSurfaceAngleWorker = null;
    worker.terminate();
    ui.setSurfaceAngleDiagnosisRunning(false);
    heavy.finish();
    if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
    ui.setSurfaceAngleDiagnosisStatus(`Dry Webの付加後診断Workerに失敗しました: ${event.message}`, false);
  };
  worker.postMessage(request, [request.basePositions.buffer, request.baseNormals.buffer]);
}

function startSupportPaintReprojectionVerification(): void {
  if (supportPaintSession.history.present.strokes.length === 0) { supportPaintReprojectionStatus = "Paint sampleがないため未検証"; refreshSupportPaintUi(); return; }
  if (!importedRecipeSha256) { supportPaintReprojectionStatus = "Shape Recipe未読込 · fail-closed"; refreshSupportPaintUi(); return; }
  if (activeSupportPaintReprojectionWorker) activeSupportPaintReprojectionWorker.terminate();
  supportPaintReprojectionHeavyComputation?.finish();
  const generation = ++supportPaintReprojectionGeneration;
  const options = ui.getMeshOptions();
  const request: SurfaceAngleDiagnosisRequest = {
    type: "build", generation,
    host: state.host.map((ball) => ({ ...ball })), hostK: state.hostParams.k, thickness: state.skinParams.thickness,
    patches: state.patches.map((patch) => ({ ...patch, motifParams: patch.motifParams ? { ...patch.motifParams } : undefined, points: patch.points.map((point) => ({ ...point })) })),
    internalGraph: null, roundK: state.skinParams.roundK, coinBulge: state.skinParams.coinBulge, coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth, mode: state.mode, thresholdDeg: ui.getSurfaceAngleThreshold(),
    resolution: SUPPORT_PAINT_REPROJECTION_RESOLUTION, targetLongestMm: options.targetLongestMm,
    workerCount: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
  };
  const worker = new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
  activeSupportPaintReprojectionWorker = worker;
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (!isCurrentWorkerRun(worker, activeSupportPaintReprojectionWorker, null, undefined, generation, supportPaintReprojectionGeneration)
      || supportPaintReprojectionHeavyComputation?.id !== heavy.id) return;
    cancelSupportPaintReprojection();
  };
  heavy = beginHeavyComputation("Support Paint再投影 全体進捗", cancel);
  supportPaintReprojectionHeavyComputation = heavy;
  heavy.update("Surface 48をWorkerへ送信しています…", 0);
  heavy.smoothTo(99);
  supportPaintReprojectionStatus = "Surface 48を低解像度Workerで準備中…"; refreshSupportPaintUi();
  worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
    const message = event.data;
    if (!isCurrentWorkerRun(worker, activeSupportPaintReprojectionWorker, null, undefined, generation, supportPaintReprojectionGeneration, message.generation)) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") {
      const fraction = message.totalSlices > 0 ? message.completedSlices / message.totalSlices : 0;
      supportPaintReprojectionStatus = "Surface 48を準備中 · " + message.completedSlices + "/" + message.totalSlices; refreshSupportPaintUi();
      heavy.update(
        "Surface 48を準備中 · " + message.completedSlices + "/" + message.totalSlices + " slice",
        5 + fraction * 80,
      );
      return;
    }
    activeSupportPaintReprojectionWorker = null; worker.terminate();
    if (message.type === "error") {
      heavy.finish();
      if (supportPaintReprojectionHeavyComputation?.id === heavy.id) supportPaintReprojectionHeavyComputation = null;
      supportPaintReprojectionStatus = "Surface 48再投影失敗: " + message.message; refreshSupportPaintUi(); return;
    }
    try {
      heavy.update("Surface 48の保存Paint領域を検証中…", 90);
      const classified = classifySurfaceAngleSupport(message, { commit: false, enforceProfile: false });
      const longest = triangleSoupLongestExtent(message.basePositions);
      const scale = options.targetLongestMm / longest;
      if (!(scale > 0)) throw new Error("Surface 48 scaleを求められません");
      const surfaceMm = new Float32Array(message.basePositions.map((value) => value * scale));
      const targetFacts = supportPaintReprojectionFacts({
        resolution: message.resolution, sites: classified.entries, supportPaint: supportPaintSession.history.present, frame: buildSupportPaintFrame(surfaceMm),
      });
      if (!targetFacts.regionMatch || targetFacts.oppositeNormalCount !== 0) throw new Error("反対面または保存brush領域外への適用を検出しました");
      const currentContext = supportPaintEditingContext();
      const currentFacts = overhangSupportResult && currentContext ? supportPaintReprojectionFacts({
        resolution: surfaceAngleCache?.resolution ?? 0, sites: overhangSupportResult.entries, supportPaint: supportPaintSession.history.present, frame: currentContext.frame,
      }) : null;
      const currentText = currentFacts ? "編集Surface " + currentFacts.resolution + " affected inside/outside " + currentFacts.affectedInsideCount + "/" + currentFacts.affectedOutsideCount + " → " : "";
      supportPaintReprojectionStatus = currentText + "Surface 48 affected inside/outside " + targetFacts.affectedInsideCount + "/" + targetFacts.affectedOutsideCount
        + " · Auto " + targetFacts.affectedAutoCount + " · override " + targetFacts.manualOverrideCount
        + " · 反対面 " + targetFacts.oppositeNormalCount + " · 正規化領域一致";
      refreshSupportPaintUi("Surface 48へのID非依存再投影を確認しました");
      heavy.update("Support Paint再投影完了", 100);
      heavy.finish();
      if (supportPaintReprojectionHeavyComputation?.id === heavy.id) supportPaintReprojectionHeavyComputation = null;
    } catch (error) {
      heavy.finish();
      if (supportPaintReprojectionHeavyComputation?.id === heavy.id) supportPaintReprojectionHeavyComputation = null;
      supportPaintReprojectionStatus = "Surface 48再投影 fail-closed: " + (error instanceof Error ? error.message : String(error));
      refreshSupportPaintUi();
    }
  };
  worker.onerror = (event) => {
    if (!isCurrentWorkerRun(worker, activeSupportPaintReprojectionWorker, null, undefined, generation, supportPaintReprojectionGeneration)) {
      worker.terminate();
      return;
    }
    activeSupportPaintReprojectionWorker = null; worker.terminate();
    heavy.finish();
    if (supportPaintReprojectionHeavyComputation?.id === heavy.id) supportPaintReprojectionHeavyComputation = null;
    supportPaintReprojectionStatus = "Surface 48 Worker失敗: " + event.message; refreshSupportPaintUi();
  };
  worker.postMessage(request);
}

function cancelSupportPaintReprojection(): void {
  if (!activeSupportPaintReprojectionWorker && !supportPaintReprojectionHeavyComputation) return;
  if (activeSupportPaintReprojectionWorker) activeSupportPaintReprojectionWorker.terminate();
  activeSupportPaintReprojectionWorker = null;
  supportPaintReprojectionGeneration++;
  supportPaintReprojectionHeavyComputation?.finish();
  supportPaintReprojectionHeavyComputation = null;
  supportPaintReprojectionStatus = "Surface 48再投影をキャンセルしました";
  refreshSupportPaintUi();
}

async function startSurfaceAngleDiagnosis(thresholdDeg: number): Promise<void> {
  if (state.host.length === 0) {
    ui.setSurfaceAngleDiagnosisStatus("まずベース形状を作ってください", false);
    return;
  }
  if (activeSurfaceAngleWorker) activeSurfaceAngleWorker.terminate();
  activeSurfaceAngleWorker = null;
  if (activeSurfaceSupportClassificationWorker) activeSurfaceSupportClassificationWorker.terminate();
  activeSurfaceSupportClassificationWorker = null;
  cancelPreviewMeshBuild();
  clearOpeningMapDisplay();
  surfaceAngleGeneration++;
  const generation = surfaceAngleGeneration;
  surfaceHeavyComputation?.finish();
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (generation !== surfaceAngleGeneration || surfaceHeavyComputation?.id !== heavy.id) return;
    cancelSurfaceAngleDiagnosis();
  };
  heavy = beginHeavyComputation("Surface診断 全体進捗", cancel);
  surfaceHeavyComputation = heavy;
  heavy.update("cache capabilityを確認中…", 0);
  surfacePersistentCacheCapability = detectSurfacePersistentCacheCapability();
  activeSurfacePersistentCacheKeys = null;
  activeSurfaceCacheMissReport = null;
  activeLegacySurfaceCacheKey = null;
  surfaceAnglePersistentCacheStatus = "idle";
  surfaceWorkerLaunchCount = 0;
  invalidateSupportPaintEditingResources();
  surfaceAngleCache = null;
  automaticOverhangSupportResult = null;
  overhangSupportResult = null;
  supportPaintEnabled = false;
  ui.setShapeUndoLocked(false);
  viewport.classList.remove("support-paint-active");
  skinRenderer.setOrbitEnabled(true);
  setSelectedOverhangSupportSite(null);
  refreshSupportPaintUi("支持点を診断中…");
  // A new exact diagnosis must rebuild Dry Web targets from this run's
  // inside assignments; never let a prior mesh's target ledger leak into it.
  terminateDryWebPreviewWorker(true);
  targetedSupportSource = null;
  skinRenderer.clearSurfaceAngleOverlay();
  skinRenderer.clearOverhangSupportSiteOverlay();
  ui.setOverhangSupportSiteOverlay(false, showOverhangSupportSites, showMixedSupportFaces, showSupportFootprint, supportSiteDepthMode, "支持点を診断中…");
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
  const request: SurfaceAngleDiagnosisBuildRequest = {
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
  const adoptResult = (message: SurfaceAngleResult, cachedAutomaticResult?: OverhangSupportPolicyResult): void => {
    if (message.generation !== surfaceAngleGeneration || generation !== surfaceAngleGeneration) return;
    if (!cachedAutomaticResult) {
      activeSurfaceSupportClassificationWorker?.terminate();
      const worker = createAutomaticSupportClassificationWorkerOnCacheMiss(null, () =>
        new Worker(new URL("./surfaceSupportClassification.worker.ts", import.meta.url), { type: "module" }),
      )!;
      activeSurfaceSupportClassificationWorker = worker;
      automaticSupportClassificationWorkerLaunchCount++;
      const requestedAt = performance.now();
      ui.setSurfaceAngleDiagnosisRunning(true);
      ui.setSurfaceAngleDiagnosisStatus("Surface準備完了 · 自動支持点分類をWorkerで計算中 · 画面は操作できます");
      heavy.updateActual(
        "自動支持点分類Worker · ledgerを計算中… · 80%",
        SURFACE_PROGRESS_CLASSIFICATION,
      );
      refreshSurfaceStartupStatus("classification Worker");
      worker.onmessage = (event: MessageEvent<SurfaceSupportClassificationMessage>) => {
        const classified = event.data;
        if (!isCurrentWorkerRun(worker, activeSurfaceSupportClassificationWorker, null, undefined, generation, surfaceAngleGeneration, classified.generation)) {
          worker.terminate();
          return;
        }
        worker.terminate();
        activeSurfaceSupportClassificationWorker = null;
        if (classified.type === "error") {
          ui.setSurfaceAngleDiagnosisRunning(false);
          heavy.finish();
          if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
          ui.setSurfaceAngleDiagnosisStatus("自動支持点分類Workerに失敗しました: " + classified.message, false);
          return;
        }
        supportClassificationComputeMs = classified.computeMs;
        surfaceClassificationRestoreMs = performance.now() - requestedAt;
        adoptResult(classified.diagnosis, classified.automaticResult);
      };
      worker.onerror = (event) => {
        if (!isCurrentWorkerRun(worker, activeSurfaceSupportClassificationWorker, null, undefined, generation, surfaceAngleGeneration)) {
          worker.terminate();
          return;
        }
        activeSurfaceSupportClassificationWorker = null;
        worker.terminate();
        ui.setSurfaceAngleDiagnosisRunning(false);
        heavy.finish();
        if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
        ui.setSurfaceAngleDiagnosisStatus("自動支持点分類Workerに失敗しました: " + event.message, false);
      };
      const classifyRequest: SurfaceSupportClassificationRequest = {
        type: "classify", generation, diagnosis: message, targetLongestMm: options.targetLongestMm,
        host: state.host.map((ball) => ({ ...ball })), hostK: state.hostParams.k,
        explicitTargets: activePrintProfile?.scaffold.explicitTargets.map((target) => ({ ...target })) ?? [],
      };
      worker.postMessage(classifyRequest, [
        message.basePositions.buffer, message.baseNormals.buffer, message.beforeDangerPositions.buffer,
        message.afterDangerPositions.buffer, message.mitigatedPositions.buffer,
      ]);
      return;
    }

    const restoreStarted = performance.now();
    ui.setSurfaceAngleDiagnosisRunning(false);
    try {
      validateOverhangAssignmentLedger(cachedAutomaticResult);
      automaticOverhangSupportResult = cachedAutomaticResult;
      overhangSupportResult = cachedAutomaticResult;
      const sourceLongest = triangleSoupLongestExtent(message.basePositions);
      const scaleMmPerUnit = ui.getMeshOptions().targetLongestMm / sourceLongest;
      if (state.skinParams.internalStructure === "targetedGrid" && !internalGraph?.edges.length && overhangSupportResult.insideTargets.length > 0) {
        targetedSupportSource = {
          surfaceFingerprint: currentTargetSurfaceFingerprint(),
          resolution: message.resolution,
          targets: sourceDryWebTargets(overhangSupportResult, scaleMmPerUnit),
        };
        internalStructureFingerprint = "";
        if (message.internalEdgeCount > 0 && ["hit", "ledger-upgrade", "migrated"].includes(surfaceAnglePersistentCacheStatus)) {
          internalStructureGraph = null;
          skinRenderer.setInternalStructure(null);
          ui.setInternalStructureStatus("保存済みDry Web診断を使用中 · 編集起動ではderived graphを同期再構築しません");
          surfaceClassificationRestoreMs = performance.now() - restoreStarted;
          finishSurfaceAngleDiagnosis(message, heavy);
          if (supportPaintSession.history.present.strokes.length > 0) {
            reapplySupportPaint("保存済みSupport PaintをWorkerで復元しました", supportPaintSession.history.present, false);
          }
          return;
        }
        surfaceAngleCache = message;
        skinRenderer.setMeshOverlayBuffers(message.basePositions, message.baseNormals);
        viewMode = "mesh";
        skinRenderer.setViewMode(viewMode);
        ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
        refreshInternalStructure();
        const targetedGraph = getInternalStructureGraph();
        if (targetedGraph?.edges.length) {
          recheckTargetedGridFromExactMesh(message, targetedGraph, heavy);
          return;
        }
      }
      surfaceClassificationRestoreMs = performance.now() - restoreStarted;
      finishSurfaceAngleDiagnosis(message, heavy);
      if (supportPaintSession.history.present.strokes.length > 0) reapplySupportPaint("保存済みSupport PaintをWorkerで復元しました", supportPaintSession.history.present, false);
    } catch (error) {
      const failure = error as Error;
      surfaceAngleCache = message;
      skinRenderer.setMeshOverlayBuffers(message.basePositions, message.baseNormals);
      viewMode = "mesh";
      skinRenderer.setViewMode(viewMode);
      ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
      refreshOverhangSupportSiteOverlay();
      showSurfaceAngleDiagnosisView("before");
      ui.setSurfaceAngleDiagnosisRunning(false);
      heavy.finish();
      if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
      ui.setSurfaceAngleDiagnosisStatus("分類ledger／cache結果の適用に失敗しました: " + failure.message, false);
    }
  };

  surfaceGenerationWorkerLaunchCount = 0;
  automaticFaceDiagnosisWorkerLaunchCount = 0;
  automaticSupportClassificationWorkerLaunchCount = 0;
  paintBvhWorkerLaunchCount = 0;
  surfaceWorkerLaunchCount = 0;
  surfaceCacheLookupMs = 0;
  surfaceClassificationRestoreMs = 0;
  supportClassificationComputeMs = 0;
  paintBvhBuildMs = 0;
  activeSurfacePersistentCacheKeys = null;
  activeLegacySurfaceCacheKey = null;
  activeSurfaceCacheMissReport = null;
  surfaceAnglePersistentCacheStatus = "idle";

  const startFreshSurfaceWorker = (
    reason: "miss" | "unavailable" | "error",
    miss?: SurfaceCacheMissReport,
  ): void => {
    if (generation !== surfaceAngleGeneration) return;
    if (reason === "unavailable" || reason === "error") {
      activeSurfacePersistentCacheKeys = null;
      activeSurfaceCacheMissReport = null;
      activeLegacySurfaceCacheKey = null;
    } else if (miss) {
      activeSurfaceCacheMissReport = miss;
    }
    surfaceAnglePersistentCacheStatus = reason;
    const cacheLabel = reason === "unavailable"
      ? "永続cache unavailable · cacheを使わず再計算 · Surface Worker開始"
      : reason === "error"
        ? "永続cache error · cacheを使わず再計算 · Surface Worker開始"
        : miss
          ? `Surface mesh/面判定 cache miss · current mesh=${miss.currentMeshKey.slice(0, 24)}… · 保存mesh=${miss.nearestMeshKey?.slice(0, 24) ?? "なし"} · 差分=${miss.meshDifferences.map((item) => item.component).join(", ") || "保存済みkeyなし"} · Surface Worker開始`
          : "永続cache miss · cacheを使わず再計算 · Surface Worker開始";
    const worker = createSurfaceWorkerOnCacheMiss(null, () => {
      surfaceGenerationWorkerLaunchCount++;
      surfaceWorkerLaunchCount++;
      automaticFaceDiagnosisWorkerLaunchCount++;
      return new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
    });
    if (!worker) throw new Error("Surface cache route did not create a Worker");
    activeSurfaceAngleWorker = worker;
    heavy.update(
      `${reason === "unavailable" ? "cache unavailable · " : reason === "error" ? "cache error · " : "cache miss · "}Surface Worker開始 · 起動回数 ${surfaceWorkerLaunchCount}`,
      SURFACE_PROGRESS_WORKER_START,
    );
    heavy.smoothTo(SURFACE_PROGRESS_CLASSIFICATION - 1);
    ui.setSurfaceAngleDiagnosisStatus(`${cacheLabel} · 起動回数 ${surfaceWorkerLaunchCount}`);
    refreshSurfaceStartupStatus("Surface Worker");
    if (showMotifLowestPoints) refreshMotifLowestPointMarkers();
    const progressLabel = reason === "unavailable"
      ? "永続cache unavailable · cacheを使わず再計算 · Surface Worker実行中"
      : reason === "error"
        ? "永続cache error · cacheを使わず再計算 · Surface Worker実行中"
        : "永続cache miss · Surface Worker実行中";
    worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
      const message = event.data;
      if (!isCurrentWorkerRun(worker, activeSurfaceAngleWorker, null, undefined, generation, surfaceAngleGeneration, message.generation)) {
        worker.terminate();
        return;
      }
      if (message.type === "progress") {
        const sliceFraction = message.totalSlices > 0
          ? Math.max(0, Math.min(1, message.completedSlices / message.totalSlices))
          : 0;
        const overallProgress = SURFACE_PROGRESS_WORKER_START
          + sliceFraction * (SURFACE_PROGRESS_CLASSIFICATION - SURFACE_PROGRESS_WORKER_START);
        heavy.update(
          `${progressLabel} · ${message.completedSlices}/${message.totalSlices} slice · ${message.faceCount.toLocaleString()}面 · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
          overallProgress,
        );
        ui.setSurfaceAngleDiagnosisStatus(`${progressLabel} · ${message.completedSlices}/${message.totalSlices} slice · ${message.faceCount.toLocaleString()}面 · ${(message.elapsedMs / 1000).toFixed(1)}秒 · 画面は操作できます`);
        return;
      }
      activeSurfaceAngleWorker = null;
      worker.terminate();
      if (message.type === "error") {
        ui.setSurfaceAngleDiagnosisRunning(false);
        ui.setSurfaceAngleDiagnosisStatus(`診断できませんでした: ${message.message}`, false);
        heavy.finish();
        if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
        return;
      }
      adoptResult(message);
    };
    worker.onerror = (event) => {
      if (!isCurrentWorkerRun(worker, activeSurfaceAngleWorker, null, undefined, generation, surfaceAngleGeneration)) {
        worker.terminate();
        return;
      }
      activeSurfaceAngleWorker = null;
      worker.terminate();
      ui.setSurfaceAngleDiagnosisRunning(false);
      heavy.finish();
      if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
      ui.setSurfaceAngleDiagnosisStatus(`角度診断Workerに失敗しました: ${event.message}`, false);
    };
    worker.postMessage(request);
  };

  let lookup: Awaited<ReturnType<typeof readSurfacePersistentCache>> | null = null;
  const cacheLookupStarted = performance.now();
  refreshSurfaceStartupStatus("cache lookup");
  heavy.update("cache capability確認 · persistent cache lookup中…", SURFACE_PROGRESS_CACHE_LOOKUP);
  heavy.smoothTo(SURFACE_PROGRESS_WORKER_START - 1, 15_000);
  if (surfacePersistentCacheRoute(surfacePersistentCacheCapability) === "fresh-worker") {
    surfaceCacheLookupMs = performance.now() - cacheLookupStarted;
    surfaceAnglePersistentCacheStatus = "unavailable";
    console.info("[SKIN Surface cache] unavailable; starting fresh Worker", {
      generation,
      capability: surfacePersistentCacheCapability,
    });
    startFreshSurfaceWorker("unavailable");
    return;
  }
  try {
    const cacheResult = await runSurfacePersistentCacheIfAvailable(
      surfacePersistentCacheCapability,
      async () => {
        const cacheKeys = await buildSurfacePersistentCacheKeys(request, {
          supportClassificationPolicyVersion: OVERHANG_SUPPORT_POLICY,
          rayEpsilonVersion: SUPPORT_REACHABILITY_RAY_EPSILON_VERSION,
        });
        if (generation !== surfaceAngleGeneration) return null;
        const cacheLookup = await readSurfacePersistentCache(cacheKeys, generation);
        return { cacheKeys, cacheLookup };
      },
    );
    surfaceCacheLookupMs = performance.now() - cacheLookupStarted;
    if (cacheResult === undefined || cacheResult === null) return;
    if (generation !== surfaceAngleGeneration) return;
    activeSurfacePersistentCacheKeys = cacheResult.cacheKeys;
    lookup = cacheResult.cacheLookup;
    activeSurfaceCacheMissReport = lookup.miss;

    if (!lookup.diagnosis && lookup.unclassifiedDiagnosis) {
      surfaceAnglePersistentCacheStatus = "ledger-upgrade";
      ui.setSurfaceAngleDiagnosisStatus("保存済みSurface／角度診断を復元 · 分類ledgerだけをWorkerで補完します · 画面は操作できます");
      adoptResult(lookup.unclassifiedDiagnosis);
      return;
    }

    if (!lookup.diagnosis) {
      const legacy = await runSurfacePersistentCacheIfAvailable(
        surfacePersistentCacheCapability,
        () => readLegacySurfacePersistentCache(request, RUNNING_APP_COMMIT, generation),
      );
      if (legacy === undefined) {
        activeSurfacePersistentCacheKeys = null;
        activeSurfaceCacheMissReport = null;
        activeLegacySurfaceCacheKey = null;
        surfaceAnglePersistentCacheStatus = "unavailable";
        startFreshSurfaceWorker("unavailable");
        return;
      }
      if (generation !== surfaceAngleGeneration) return;
      if (legacy) {
        activeLegacySurfaceCacheKey = legacy.key;
        surfaceAnglePersistentCacheStatus = "migrated";
        console.info("[SKIN Surface cache] legacy v1 exact request migrated to stable two-layer keys", {
          legacyKey: legacy.key,
          meshKey: cacheResult.cacheKeys.meshKey,
          diagnosisKey: cacheResult.cacheKeys.diagnosisKey,
          meshComponents: cacheResult.cacheKeys.meshComponents,
          diagnosisComponents: cacheResult.cacheKeys.diagnosisComponents,
          surfaceGenerationWorkerLaunchCount,
          automaticFaceDiagnosisWorkerLaunchCount,
        });
        adoptResult(legacy.result);
        return;
      }
    }
  } catch (error) {
    surfaceAnglePersistentCacheStatus = "error";
    activeSurfacePersistentCacheKeys = null;
    activeSurfaceCacheMissReport = null;
    activeLegacySurfaceCacheKey = null;
    console.warn("[SKIN Surface cache] key or lookup failed; starting fresh Worker", error);
    startFreshSurfaceWorker("error");
    return;
  }

  if (!lookup) return;
  if (lookup.diagnosis) {
    surfaceAnglePersistentCacheStatus = "hit";
    console.info("[SKIN Surface cache] diagnosis hit; both Worker launches forbidden", {
      meshKey: activeSurfacePersistentCacheKeys?.meshKey,
      diagnosisKey: activeSurfacePersistentCacheKeys?.diagnosisKey,
      surfaceGenerationWorkerLaunchCount,
      automaticFaceDiagnosisWorkerLaunchCount,
    });
    adoptResult(lookup.diagnosis.result, lookup.diagnosis.automaticResult);
    return;
  }

  const miss = lookup.miss;
  console.info("[SKIN Surface cache] miss diagnostics", {
    current: { meshKey: miss.currentMeshKey, diagnosisKey: miss.currentDiagnosisKey },
    saved: { meshKeys: miss.savedMeshKeys, diagnosisKeys: miss.savedDiagnosisKeys },
    differences: { mesh: miss.meshDifferences, diagnosis: miss.diagnosisDifferences },
  });

  if (lookup.mesh) {
    surfaceAnglePersistentCacheStatus = "mesh-hit";
    const mesh: SurfaceMeshCacheValue = lookup.mesh;
    const reinforced = reinforceQuadConnectionsForMesh(state.patches, state.skinParams.quadMeshJoinWidth);
    const bounds = computeSkinSamplingBounds(state.host, state.hostParams.k, state.skinParams.thickness, reinforced.patches);
    const meshStep = bounds.longest > 0 ? bounds.longest / mesh.resolution : 1 / mesh.resolution;
    const worker = createSurfaceWorkerOnCacheMiss(null, () => {
      surfaceWorkerLaunchCount++;
      automaticFaceDiagnosisWorkerLaunchCount++;
      return new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
    })!;
    activeSurfaceAngleWorker = worker;
    heavy.update("Surface mesh cache hit · 面判定Workerを実行中…", 55);
    heavy.smoothTo(SURFACE_PROGRESS_CLASSIFICATION - 1);
    ui.setSurfaceAngleDiagnosisStatus(
      `Surface mesh cache hit · 面判定key miss · current=${miss.currentDiagnosisKey.slice(0, 28)}… · 差分=${miss.diagnosisDifferences.map((item) => item.component).join(", ") || "保存済みkeyなし"}`,
    );
    const recheck: SurfaceAngleDiagnosisRequest = {
      type: "recheck", generation,
      basePositions: mesh.basePositions.slice(), baseNormals: mesh.baseNormals.slice(), baseFaceCount: mesh.baseFaceCount,
      resolution: mesh.resolution, internalGraph, thresholdDeg, meshStep, mode: state.mode,
      patches: state.patches.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })),
      roundK: state.skinParams.roundK, previousElapsedMs: 0,
    };
    worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
      const message = event.data;
      if (!isCurrentWorkerRun(worker, activeSurfaceAngleWorker, null, undefined, generation, surfaceAngleGeneration, message.generation)) {
        worker.terminate();
        return;
      }
      if (message.type === "progress") return;
      activeSurfaceAngleWorker = null; worker.terminate();
      if (message.type === "error") {
        ui.setSurfaceAngleDiagnosisRunning(false);
        ui.setSurfaceAngleDiagnosisStatus(`面判定cache missの再診断に失敗しました: ${message.message}`, false);
        heavy.finish();
        if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
        return;
      }
      adoptResult(message);
    };
    worker.onerror = (event) => {
      if (!isCurrentWorkerRun(worker, activeSurfaceAngleWorker, null, undefined, generation, surfaceAngleGeneration)) {
        worker.terminate();
        return;
      }
      activeSurfaceAngleWorker = null;
      worker.terminate(); ui.setSurfaceAngleDiagnosisRunning(false);
      heavy.finish();
      if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
      ui.setSurfaceAngleDiagnosisStatus(`面判定Workerに失敗しました: ${event.message}`, false);
    };
    worker.postMessage(recheck, [recheck.basePositions.buffer, recheck.baseNormals.buffer]);
    return;
  }

  startFreshSurfaceWorker("miss", miss);
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
  previewMeshHeavyComputation?.finish();
  previewMeshHeavyComputation = null;
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
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (previewMeshHeavyComputation?.id !== heavy.id) return;
    cancelPreviewMeshBuild(true);
  };
  heavy = previewMeshHeavyComputation ?? beginHeavyComputation("Preview mesh 全体進捗", cancel);
  if (!previewMeshHeavyComputation) {
    previewMeshHeavyComputation = heavy;
    heavy.update(`${stageLabel} · 解像度${resolution}`, 0);
  } else {
    heavy.update(`${stageLabel} · 解像度${resolution}`);
  }
  heavy.smoothTo(99);
  previewMeshStatusTimer = window.setInterval(() => {
    ui.setMeshPreviewStatus(`${stageLabel} · ${(performance.now() - started) / 1000 | 0}秒 · 画面は操作できます`, true);
  }, 500);
  worker.onmessage = (event: MessageEvent<PreviewMeshWorkerMessage>) => {
    const message = event.data;
    if (!isCurrentWorkerRun(worker, activePreviewMeshWorker, request.requestId, message.requestId, request.generation, previewMeshGeneration, message.generation)) {
      worker.terminate();
      return;
    }
    activePreviewMeshWorker = null;
    clearPreviewMeshStatusTimer();
    worker.terminate();
    if (message.type === "error") {
      heavy.finish();
      if (previewMeshHeavyComputation?.id === heavy.id) previewMeshHeavyComputation = null;
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
      heavy.update(
        `粗いメッシュ完了 · ${message.faceCount.toLocaleString()}面 · 続けて解像度${finalResolution}へ高精度化`,
        45,
      );
      heavy.smoothTo(99);
      ui.setMeshPreviewStatus(
        `粗表示 ${message.faceCount.toLocaleString()}面 · 続けて解像度${finalResolution}へ高精度化します`, true,
      );
      window.setTimeout(() => {
        if (viewMode === "mesh" && message.generation === previewMeshGeneration && !activePreviewMeshWorker && previewMeshHeavyComputation?.id === heavy.id) {
          startPreviewMeshStage(finalResolution, finalResolution, targetLongestMm);
        }
      }, 0);
      return;
    }
    heavy.update("Preview mesh完了", 100);
    heavy.finish();
    if (previewMeshHeavyComputation?.id === heavy.id) previewMeshHeavyComputation = null;
    ui.setMeshPreviewStatus(
      `高精度メッシュ ${message.faceCount.toLocaleString()}面 · 解像度${message.resolution} · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
    );
  };
  worker.onerror = (event) => {
    if (!isCurrentWorkerRun(worker, activePreviewMeshWorker, null, undefined, request.generation, previewMeshGeneration)) {
      worker.terminate();
      return;
    }
    activePreviewMeshWorker = null;
    clearPreviewMeshStatusTimer();
    worker.terminate();
    heavy.finish();
    if (previewMeshHeavyComputation?.id === heavy.id) previewMeshHeavyComputation = null;
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
  getViewportClipping: () => ({
    boundsMm: viewportClippingBoundsMm,
    stateMm: viewportClippingStateMm,
    scaleMmPerUnit: viewportClippingScaleMmPerUnit,
    objectState: skinRenderer.getViewportClippingState(),
  }),
  setViewportClipping: (action: ViewportClippingAction) => updateViewportClipping(action),
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
  // moving the camera slightly each call so the full camera-dependent path
  // is exercised, giving an honest per-frame cost independent of tab focus.
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
  getSurfacePersistentCacheDebug: () => ({
    meshKey: activeSurfacePersistentCacheKeys?.meshKey ?? null,
    diagnosisKey: activeSurfacePersistentCacheKeys?.diagnosisKey ?? null,
    meshComponents: activeSurfacePersistentCacheKeys?.meshComponents ?? null,
    diagnosisComponents: activeSurfacePersistentCacheKeys?.diagnosisComponents ?? null,
    legacyMigratedFromKey: activeLegacySurfaceCacheKey,
    miss: activeSurfaceCacheMissReport,
    status: surfaceAnglePersistentCacheStatus,
    cacheStatus: surfaceAnglePersistentCacheStatus,
    capability: {
      origin: surfacePersistentCacheCapability.origin,
      isSecureContext: surfacePersistentCacheCapability.isSecureContext,
      crypto: surfacePersistentCacheCapability.cryptoAvailable,
      subtle: surfacePersistentCacheCapability.subtleAvailable,
      digest: surfacePersistentCacheCapability.digestAvailable,
      indexedDB: surfacePersistentCacheCapability.indexedDBAvailable,
      Worker: surfacePersistentCacheCapability.workerAvailable,
      hardwareConcurrency: surfacePersistentCacheCapability.hardwareConcurrency,
      cacheAvailable: surfacePersistentCacheCapability.cacheAvailable,
      unavailableReasons: [...surfacePersistentCacheCapability.unavailableReasons],
    },
    workerLaunchCount: surfaceWorkerLaunchCount,
    surfaceGenerationWorkerLaunchCount,
    automaticFaceDiagnosisWorkerLaunchCount,
    automaticSupportClassificationWorkerLaunchCount,
    paintBvhWorkerLaunchCount,
    timingsMs: {
      shellInteractive: skinShellInteractiveMs, recipeLoad: reviewRecipeLoadMs, cacheLookup: surfaceCacheLookupMs,
      ledgerRestore: surfaceClassificationRestoreMs, classificationWorker: supportClassificationComputeMs, paintBvh: paintBvhBuildMs,
    },
    classificationCounts: automaticOverhangSupportResult?.counts ?? null,
    cacheHitWorkerInvariantOk: surfaceAnglePersistentCacheStatus !== "hit"
      || (surfaceGenerationWorkerLaunchCount === 0 && automaticFaceDiagnosisWorkerLaunchCount === 0
        && automaticSupportClassificationWorkerLaunchCount === 0
        && (supportPaintEnabled || paintBvhWorkerLaunchCount === 0)),
    meshHitWorkerInvariantOk: surfaceAnglePersistentCacheStatus !== "mesh-hit"
      || surfaceGenerationWorkerLaunchCount === 0,
    resolution: surfaceAngleCache?.resolution ?? null,
  }),
  getOverhangSupportReview: () => ({
    recipeFilename: importedRecipeFilename,
    profileFilename: activePrintProfileFilename,
    profileMatch: activePrintProfile ? currentPrintProfileBinding(activePrintProfile, false) : null,
    counts: overhangSupportResult?.counts ?? null,
    rayFacts: overhangSupportResult?.rayFacts ?? null,
    supportPaint: {
      enabled: supportPaintEnabled,
      mode: supportPaintMode,
      radiusMm: supportPaintRadiusMm,
      paintBackfaces: supportPaintBackfaces,
      strokeCount: supportPaintSession.history.present.strokes.length,
      facts: overhangSupportResult?.paintFacts ?? null,
      canUndo: supportPaintSession.history.past.length > 0,
      canRedo: supportPaintSession.history.future.length > 0,
      performance: {
        raycastWorkerReady: supportPaintRaycastReady,
        raycastInFlight: supportPaintDrag?.inFlightRequestId ?? null,
        currentCounters: { ...supportPaintInteractionCounters },
        lastCompletedStrokeCounters: lastSupportPaintInteractionCounters ? { ...lastSupportPaintInteractionCounters } : null,
        failures: lastSupportPaintInteractionCounters
          ? supportPaintInteractionCounterFailures(lastSupportPaintInteractionCounters, true)
          : [],
      },
    },
    selectedSupportSite: selectedOverhangSupportSiteId && overhangSupportResult
      ? overhangSupportResult.entries.find((entry) => entry.id === selectedOverhangSupportSiteId) ?? null
      : null,
    baseFootprint: overhangSupportResult?.baseFootprint
      ? {
          valid: overhangSupportResult.baseFootprint.valid,
          source: overhangSupportResult.baseFootprint.source,
          vertexCount: overhangSupportResult.baseFootprint.vertices.length,
          reason: overhangSupportResult.baseFootprint.reason,
        }
      : null,
    overlayVisible: showOverhangSupportSites,
    mixedVisible: showMixedSupportFaces,
    footprintVisible: showSupportFootprint,
    depthMode: supportSiteDepthMode,
    reviewViewSource: {
      urlInitialViewPending: localV088ReviewUrlViewPending,
      urlInitialViewApplied: localV088ReviewUrlViewApplied,
      currentEditorView: skinRenderer.captureEditorViewDraft(editorLayoutState),
    },
    markerPresentation: {
      inside: { color: "#3185ff", glyph: "circle" },
      outside: { color: "#ff922e", glyph: "triangle" },
      unresolved: { color: "#ff3b30", glyph: "cross" },
      backCoverage: 0.1875,
    },
    renderedOverlay: skinRenderer.getOverhangSupportSiteOverlayDebug(),
  }),
  setLocalV088ReviewView: (view: LocalV088ReviewView) => {
    if (!localV088ReviewSelection || !surfaceAngleCache) return false;
    localV088ReviewSelection = { ...localV088ReviewSelection, view };
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    window.history.replaceState(null, "", "?" + params.toString());
    installLocalV088ReviewNavigation(localV088ReviewSelection);
    applyLocalReviewCamera(surfaceAngleCache.basePositions, true);
    return true;
  },
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

function installLocalV088ReviewNavigation(selection: NonNullable<typeof localV088ReviewSelection>): void {
  document.querySelector(".local-v088-review-navigation")?.remove();
  bottomReviewTools.hidden = false;
  bottomReviewLegend.textContent = "-Z ray: plate-visible=outside 橙三角 · body-blocked=inside 青丸 · unresolved 赤× · 背面18.75% · footprint 白（参考） · mixed 紫（任意）";
  bottomReviewChoices.replaceChildren();
  const choices: Array<[string, LocalV088ReviewCase, LocalV088ReviewView]> = [
    ["A 上", "A", "top"], ["A 横", "A", "side"], ["A 裏", "A", "back"],
    ["B 上", "B", "top"], ["B 横", "B", "side"], ["B 裏", "B", "back"],
  ];
  for (const [label, reviewCase, view] of choices) {
    const link = document.createElement("a");
    link.className = "skin-bottom-review-choice";
    link.textContent = label;
    link.href = "?reviewCase=" + reviewCase + "&view=" + view
      + (new URLSearchParams(window.location.search).get("views") === "four" ? "&views=four" : "");
    const active = reviewCase === selection.reviewCase && view === selection.view;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    bottomReviewChoices.append(link);
  }
  refreshBottomStatusPane();
}

function applyLocalReviewCamera(positions: Float32Array, forceUrlView = false): void {
  if (!localV088ReviewSelection || positions.length < 3) return;
  skinRenderer.setViewportBoundsFromPositions(positions);
  if (!forceUrlView && !localV088ReviewUrlViewPending) return;
  localV088ReviewUrlViewPending = false;
  localV088ReviewUrlViewApplied = true;
  const params = new URLSearchParams(window.location.search);
  if (params.get("views") === "four") {
    skinRenderer.setViewportMode("four");
  } else {
    skinRenderer.selectViewport(1);
    skinRenderer.setViewportDirection(
      1,
      localV088ReviewSelection.view === "top"
        ? "top"
        : localV088ReviewSelection.view === "back"
          ? "back"
          : "right",
    );
    skinRenderer.setViewportMode("one");
  }
  refreshBottomStatusPane();
  render();
}

async function loadLocalV088ReviewFixture(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (!["127.0.0.1", "localhost"].includes(window.location.hostname)) return;

  const reviewCase = params.get("reviewCase");
  if (reviewCase === "A" || reviewCase === "B") {
    const view = params.get("view");
    localV088ReviewSelection = {
      reviewCase,
      view: view === "side" || view === "back" ? view : "top",
    };
    localV088ReviewUrlViewPending = params.has("view") || params.has("views");
    localV088ReviewUrlViewApplied = false;
    installLocalV088ReviewNavigation(localV088ReviewSelection);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const recipeLoadStarted = performance.now();
      const recipe = reviewCase === "A"
        ? {
            url: new URL("./presets/skin-v087-actual-review-source.recipe.json", import.meta.url),
            filename: "skin-v087-actual-review-source.recipe.json",
            label: "Case A · actual v087 Shape Recipe",
          }
        : {
            url: new URL("../../../samples/yohaku-skin-plate-20260719.recipe.json", import.meta.url),
            filename: "yohaku-skin-plate-20260719.recipe.json",
            label: "Case B · existing boundary stress recipe",
          };
      ui.setSurfaceAngleDiagnosisStatus(recipe.label + ": recipeを読み込んでいます…");
      const response = await fetch(recipe.url);
      if (!response.ok) throw new Error("recipe HTTP " + response.status);
      const recipeText = await response.text();
      await importHistory(new File([recipeText], recipe.filename, { type: "application/json" }));
      reviewRecipeLoadMs = performance.now() - recipeLoadStarted;
      refreshSurfaceStartupStatus("recipe loaded");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      ui.setMeshOptions({ resolution: 48, targetLongestMm: 119.5 });
      ui.setSurfaceAngleThreshold(45);
      ui.setSurfaceAngleDiagnosisStatus(recipe.label + ": Surface48支持点を診断しています…");
      startSurfaceAngleDiagnosis(45);
      const revealReviewPanel = () => document.querySelector<HTMLElement>(".surface-angle-diagnosis")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(revealReviewPanel, 1500);
      window.setTimeout(revealReviewPanel, 6000);
    } catch (error) {
      ui.setSurfaceAngleDiagnosisStatus("review caseを読み込めませんでした: " + (error as Error).message, false);
    }
    return;
  }

  if (params.get("reviewFixture") !== "v088-low") return;
  try {
    ui.setSurfaceAngleDiagnosisStatus("review fixture: recipeを読み込んでいます…");
    const recipeUrl = new URL("./presets/skin-v088-low-resolution-fixture.recipe.json", import.meta.url);
    const recipeResponse = await fetch(recipeUrl);
    if (!recipeResponse.ok) throw new Error("recipe HTTP " + recipeResponse.status);
    const recipeText = await recipeResponse.text();
    await importHistory(new File([recipeText], "skin-v088-low-resolution-fixture.recipe.json", { type: "application/json" }));

    ui.setSurfaceAngleDiagnosisStatus("review fixture: Print Profileを読み込んでいます…");
    const profileUrl = new URL("./presets/skin-v088-low-resolution-fixture.print-profile.json", import.meta.url);
    const profileResponse = await fetch(profileUrl);
    if (!profileResponse.ok) throw new Error("Print Profile HTTP " + profileResponse.status);
    const profileText = await profileResponse.text();
    await importPrintProfile(new File([profileText], "skin-v088-low-resolution-fixture.print-profile.json", { type: "application/json" }));

    ui.setSurfaceAngleDiagnosisStatus("review fixture一致 · 低解像度支持点を診断しています…");
    startSurfaceAngleDiagnosis(ui.getSurfaceAngleThreshold());
    const revealReviewPanel = () => document.querySelector<HTMLElement>(".surface-angle-diagnosis")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(revealReviewPanel, 1500);
    window.setTimeout(revealReviewPanel, 5000);
  } catch (error) {
    ui.setSurfaceAngleDiagnosisStatus("review fixtureを読み込めませんでした: " + (error as Error).message, false);
  }
}

// --- Demand-driven render loop -------------------------------------------
// Four scissored views share one scene and can cost roughly four draws. Keep
// the canvas idle until geometry, a camera, clipping, or paint state changes.

function requestRenderFrame(activeViewportOnly = false): void {
  if (!activeViewportOnly) renderFrameScope = "full";
  else if (renderFrameScope === "none") renderFrameScope = "active";
  if (renderFrameRequestId !== null) return;
  renderFrameRequestId = window.requestAnimationFrame(renderFrame);
}

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
  requestRenderFrame();
}

function renderFrame(): void {
  renderFrameRequestId = null;
  const scope = renderFrameScope;
  renderFrameScope = "none";
  refreshViewportClippingBounds();
  const started = performance.now();
  skinRenderer.render(scope === "active");
  if (scope !== "active") updateQuickEditToolbar();
  const elapsed = performance.now() - started;
  if (elapsed > 0) ui.setFps(1000 / elapsed);
}

skinRenderer.setRenderRequestCallback(requestRenderFrame);
skinRenderer.setEditorViewChangeCallback(() => {
  const split = skinRenderer.getFourViewSplit();
  editorLayoutState = { ...editorLayoutState, fourSplitX: split.x, fourSplitY: split.y };
  persistEditorLayout();
  markSupportPaintDraftDirty();
  autosaveSupportPaintDraft();
  refreshBottomStatusPane();
  requestRenderFrame();
});
window.addEventListener("pointermove", () => { if (!supportPaintEnabled) requestRenderFrame(); }, { passive: true });
window.addEventListener("pointerup", () => { if (!supportPaintEnabled) requestRenderFrame(); }, { passive: true });
viewport.addEventListener("wheel", (event) => {
  if (event.target === skinRenderer.renderer.domElement) {
    skinRenderer.activateViewportAt(event.clientX, event.clientY);
    requestRenderFrame();
  }
}, { capture: true, passive: true });

requestAnimationFrame(() => {
  skinShellInteractiveMs = performance.now() - skinBootStartedAt;
  refreshSurfaceStartupStatus("shell interactive");
  window.setTimeout(() => {
    afterMutation();
    refreshPartitionTutorial();
    void loadLocalV088ReviewFixture();
  }, 0);
});

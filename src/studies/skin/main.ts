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
  syncReplayIdCounters,
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
  createCompositeSdfEvaluator,
  patchesSdf,
} from "./field.ts";
import type { Patch, PackPatchesResult, PatchAdjacencyEdge, SkinMode } from "./field.ts";
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
import { SkinRenderer } from "./renderer.ts";
import { pickPatchBySpheres, raymarchComposite, raymarchHost } from "./picking.ts";
import { HOST_MAX_BALLS, PATCH_MAX_COUNT, PATCH_MAX_POINTS } from "./shaders.ts";
import type { ArtworkGraphUiStatus, MeshUiOptions, OpeningMapUiOptions } from "./ui.ts";
import { buildUi } from "./ui.ts";
import { canonicalStringify } from "./graphCore.ts";
import { createSurfaceGraph } from "./surfaceGraph.ts";
import { createArtworkGraph, type ArtworkGraph } from "./artworkGraph.ts";
import {
  cloneDryWebArtworkGraphPatches,
  DRY_WEB_ARTWORK_GRAPH_REFRESH_PROMPT,
  inspectDryWebArtworkGraphBoundary,
  type DryWebArtworkGraphBoundaryDecision,
} from "./dryWebArtworkGraphBoundary.ts";
import { createArtworkGraphOverlayPresentation } from "./artworkGraphOverlayPresentation.ts";
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
import {
  chooseProgressivePreviewResolutions,
  observationModeKeepingInternalGraphVisible,
  type InternalObservationMode,
} from "./previewMeshBuffers.ts";
import type { PreviewMeshRequest, PreviewMeshWorkerMessage } from "./previewMeshWorkerProtocol.ts";
import type { GaugeBuildRequest, GaugeWorkerMessage } from "./gaugeWorkerProtocol.ts";
import type { MeshExportRequest, MeshExportWorkerMessage } from "./meshExportWorkerProtocol.ts";
import {
  A1_MINI_PLA_04_02,
  internalStructureOutputBlockReason,
  screenInternalStructureAngles,
  type InternalAngleScreeningReport,
  type InternalPrintGateReport,
} from "./internalPrintGate.ts";
import type { InternalPrintGateRequest, InternalPrintGateWorkerMessage } from "./internalPrintGateWorkerProtocol.ts";
import type {
  SurfaceAngleDiagnosisRequest,
  SurfaceAngleDiagnosisBuildRequest,
  SurfaceAngleDiagnosisView,
  SurfaceAngleWorkerMessage,
} from "./surfaceAngleWorkerProtocol.ts";
import {
  deriveRiskDrivenInternalLattice,
  type RiskDrivenInternalLatticeFacts,
  type RiskSeverity,
} from "./riskDrivenInternalLattice.ts";
import type { SupportPaintRaycastWorkerMessage, SupportPaintRaycastWorkerRequest } from "./supportPaintRaycastWorkerProtocol.ts";
import type { SurfaceSupportClassificationMessage, SurfaceSupportClassificationRequest } from "./surfaceSupportClassificationWorkerProtocol.ts";
import { deriveSurfaceSupportClassificationWorkerCount } from "./surfaceSupportClassificationParallel.ts";
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
  buildBambu3mf,
  parseBinaryStlPositions,
  triangleSoupLongestExtent,
  type BambuSupportType,
} from "./bambu3mf.ts";
import type { Bambu3mfExportRequest, Bambu3mfWorkerMessage } from "./bambu3mfWorkerProtocol.ts";
import { DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS } from "./externalScaffold.ts";
import {
  buildSupportForest,
  reinforceDryWebGraph,
  retainedVerticalMembers,
  selectSupportForestPreviewLeaves,
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
  buildFkeiRuntimeSaveSnapshot,
  saveFkeiRuntime,
  type FkeiRuntimeSaveFacts,
} from "./fkeiRuntimeSave.ts";
import {
  applyFkeiRestorePlanAtomically,
  createFkeiRestorePlan,
  type FkeiRestorePlan,
} from "./fkeiRuntimeRestore.ts";
import {
  fkeiArtworkGraphPatches,
  fkeiArtworkGraphSourceKey,
  fkeiShapeFingerprint,
} from "./fkeiRestoreIdentity.ts";
import { fkeiRestoredRiskDrivenCheckpointGraphIsCurrent, hydrateFkeiRiskDrivenLatticeArtifact } from "./fkeiRiskDrivenLattice.ts";
import {
  parseFkeiDocument,
  type FkeiDocument,
  type FkeiDryWebArtifact,
  type FkeiPrintProfileArtifact,
  type FkeiSupportPaintArtifact,
  type FkeiSurfaceBinding,
  type FkeiSurfaceArtifact,
} from "./fkei.ts";
import {
  DEFAULT_SKIN_REBUILD_SETTINGS,
  assembleSkinRebuildProject,
  buildSkinRebuildLattice,
  buildSkinRebuildPrintSupport,
  classifySkinRebuildPatternSides,
  createEmptySkinRebuildGraph,
  mergeSkinRebuildGraphsAtSupportContacts,
  removeSkinRebuildLatticeEdge,
  retainConnectedSkinRebuildLatticeConnections,
  skinRebuildDisconnectedPatternIds,
  skinRebuildRequiresSpiderSupport,
  skinRebuildSpiderSupportTargetIds,
  type SkinRebuildBase,
  type SkinRebuildLowestPoint,
  type SkinRebuildPatternSide,
  type SkinRebuildProject,
  type SkinRebuildSettings,
} from "./rebuild/model.ts";
import {
  sampleSkinRebuildOverhangRegionSurface,
  type SkinRebuildOverhangRegion,
} from "./rebuild/overhangRegions.ts";
import {
  chooseSkinRebuildLowestWorkerCount,
  skinRebuildLowestProgressPercent,
  type SkinRebuildLowestPointRequest,
  type SkinRebuildLowestPointWorkerMessage,
} from "./rebuild/lowestPointWorkerProtocol.ts";
import {
  skinRebuildStage5BProgressPercent,
  type SkinRebuildStage5BRequest,
  type SkinRebuildStage5BWorkerMessage,
} from "./rebuild/stage5bReinforcementWorkerProtocol.ts";
import { stage6MeshProgressPercent } from "./rebuild/stage6MeshProgress.ts";
import {
  SKIN_REBUILD_FKEI_SCHEMA,
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
  type SkinRebuildFkeiDocument,
} from "./rebuild/fkei.ts";
import {
  applySupportPaintToPolicyResult,
  assignOverhangSupportTargets,
  OVERHANG_SUPPORT_POLICY,
  validateOverhangAssignmentLedger,
  type OverhangSupportPolicyResult,
} from "./overhangSupportPolicy.ts";
import { SUPPORT_REACHABILITY_RAY_EPSILON_VERSION } from "./supportReachability.ts";
import type { OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import { dryWebAuthorPresentation, normalizeDryWebRequiredContacts } from "./dryWebAuthorPresentation.ts";
import {
  createDryWebGraphViewPresentation,
  preserveDryWebGraphViewForCompletion,
  preserveDryWebGraphViewState,
  type DryWebGraphViewOption,
  type DryWebGraphViewViewportState,
} from "./dryWebGraphViewPresentation.ts";
import {
  createDryWebSupportSeparationPresentation,
  dryWebSupportSeparationOutputBlockReason,
  type DryWebSupportSeparationPresentation,
} from "./dryWebSupportSeparationPresentation.ts";
import { selectStage8RemovableSupportPreviewLeaves } from "./stage8RemovableSupportSelection.ts";
import { buildBambu3mfOutputSelection } from "./bambu3mfOutputSelection.ts";
import {
  createStage7RedFaceLocatorPresentation,
  stage7RedFaceLocatorOverlayPolicy,
  type Stage7RedFaceLocatorPresentation,
} from "./stage7RedFaceLocatorPresentation.ts";
import {
  createStage7RedFaceDryWebCandidatePresentation,
  type Stage7RedFaceDryWebCandidatePresentation,
  type Stage7RedFaceDryWebCandidate,
} from "./stage7RedFaceDryWebCandidatePresentation.ts";
import {
  createStage7RedFaceReinforcementPlan,
  type Stage7RedFaceReinforcementPlan,
} from "./stage7RedFaceReinforcementPlan.ts";
import {
  createExplicitTopologyRepairPlan,
  evaluateExplicitTopologyRepairReadiness,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT,
  explicitTopologyRepairAdoptionScaleIsCurrent,
  explicitTopologyRepairPlanIsCurrent,
  type ExplicitTopologyRepairCurrentness,
  type ExplicitTopologyRepairEndpointOverlap,
  type ExplicitTopologyRepairIdentity,
  type ExplicitTopologyRepairReadiness,
} from "./explicitTopologyRepairPlan.ts";
import {
  createStage7ProvisionalRecheckPresentation,
  type Stage7ProvisionalRecheckPresentation,
} from "./stage7ProvisionalRecheckPresentation.ts";
import {
  createStage7ProvisionalAdoptionGatePresentation,
  type Stage7ProvisionalAdoptionGatePresentation,
} from "./stage7ProvisionalAdoptionGatePresentation.ts";
import {
  cloneStage7CanonicalCandidateGraph,
  createStage7CanonicalCandidateAdoptionPresentation,
  decideStage7CanonicalCandidateExactRecheck,
  type Stage7CanonicalCandidateAdoptionPresentation,
} from "./stage7CanonicalCandidateAdoptionPresentation.ts";
import {
  createDryWebArtworkReadinessPresentation,
  type DryWebArtworkReadinessStageState,
} from "./dryWebArtworkReadinessPresentation.ts";
import {
  createDryWebInsideTargetPresentation,
  type DryWebInsideTargetPresentationState,
} from "./dryWebInsideTargetPresentation.ts";
import {
  createDryWebTargetConnectionMappingPresentation,
  type DryWebTargetConnectionMappingPresentation,
} from "./dryWebTargetConnectionMappingPresentation.ts";
import {
  createDryWebInsufficientEdgePresentation,
  type DryWebInsufficientEdgePresentation,
} from "./dryWebInsufficientEdgePresentation.ts";
import {
  createDryWebContactFloorPresentation,
  type DryWebContactFloorPresentation,
} from "./dryWebContactFloorPresentation.ts";
import {
  createDryWebContactFloorOverlayPresentation,
  type DryWebContactFloorOverlayPresentation,
  type DryWebContactFloorResidualCategory,
} from "./dryWebContactFloorOverlayPresentation.ts";
import type {
  TargetedGridContactFacts,
  TargetedGridContactFloorFacts,
  TargetedGridInternalStructureStats,
  TargetedGridTargetConnectionFact,
} from "./targetedGrid.ts";
import {
  createDryWebExactRecheckPresentation,
  dryWebPreviewTerminalDecision,
  dryWebContactPresentationCanReapply,
  isDryWebRequiredContactsOnlyChange,
  type DryWebContactPresentationOwner,
  type DryWebExactRecheckPresentation,
  type DryWebPreviewTerminalKind,
} from "./dryWebLifecycle.ts";
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
const isSkinRebuildApp = document.documentElement.dataset.skinApp === "rebuild";
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
projectName.textContent = isSkinRebuildApp ? "SKIN REBUILD" : "SKIN";
const projectFormat = document.createElement("span");
projectFormat.className = "skin-project-format";
projectFormat.textContent = isSkinRebuildApp
  ? ".fkei / original editor shell"
  : ".fkei / author workflow shell";
projectIdentity.append(projectEyebrow, projectName, projectFormat);

const projectActions = document.createElement("nav");
projectActions.className = "skin-project-actions";
projectActions.setAttribute("aria-label", "Project file and history actions");
const projectOpenButton = document.createElement("button");
projectOpenButton.type = "button";
projectOpenButton.className = "skin-project-action";
projectOpenButton.textContent = ".fkei Open";
projectOpenButton.disabled = false;
projectOpenButton.title = "Stage 1〜3のSKIN状態を.fkeiから開く";
const projectOpenInput = document.createElement("input");
projectOpenInput.type = "file";
projectOpenInput.accept = ".fkei,application/json,application/octet-stream";
projectOpenInput.hidden = true;
const projectSaveButton = document.createElement("button");
projectSaveButton.type = "button";
projectSaveButton.className = "skin-project-action";
projectSaveButton.textContent = ".fkei Save";
projectSaveButton.disabled = false;
projectSaveButton.title = "現在のSKIN状態を.fkeiとして保存";
const projectSampleButton = document.createElement("button");
projectSampleButton.type = "button";
projectSampleButton.className = "skin-project-action";
projectSampleButton.textContent = "Stage 2 Sample";
projectSampleButton.title = "元SKINのBase Shape / Surface Patternで作った同梱.fkeiを開く";
projectSampleButton.hidden = !isSkinRebuildApp;
projectSampleButton.onclick = async () => {
  try {
    projectSampleButton.disabled = true;
    projectMeta.textContent = "同梱Stage 2 sampleを検証中…";
    const response = await fetch("./samples/skin-rebuild-original-stage2.fkei", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const file = new File([await response.blob()], "skin-rebuild-original-stage2.fkei", { type: "application/json" });
    await openFkeiProject(file);
  } catch (error) {
    projectMeta.textContent = `Sample Open失敗: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    projectSampleButton.disabled = false;
  }
};
const projectCompleteSampleButton = document.createElement("button");
projectCompleteSampleButton.type = "button";
projectCompleteSampleButton.className = "skin-project-action";
projectCompleteSampleButton.textContent = "完成 Sample";
projectCompleteSampleButton.title = "工程3〜6と蜘蛛の巣ラティスを含む初回プリント候補.fkeiを開く";
projectCompleteSampleButton.hidden = !isSkinRebuildApp;
projectCompleteSampleButton.onclick = async () => {
  try {
    projectCompleteSampleButton.disabled = true;
    projectMeta.textContent = "同梱SKIN REBUILD完成sampleを検証中…";
    const response = await fetch("./samples/skin-rebuild-first-print.fkei", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const file = new File([await response.blob()], "skin-rebuild-first-print.fkei", { type: "application/json" });
    await openFkeiProject(file);
  } catch (error) {
    projectMeta.textContent = `完成Sample Open失敗: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    projectCompleteSampleButton.disabled = false;
  }
};
const projectUndoButton = document.createElement("button");
projectUndoButton.type = "button";
projectUndoButton.className = "skin-project-action";
projectUndoButton.textContent = "Undo · Shape";
projectUndoButton.disabled = true;
projectUndoButton.title = "Shape history Undo (Support Paint has its own Undo)";
projectUndoButton.onclick = () => requestProjectUndo();
const projectRedoButton = document.createElement("button");
projectRedoButton.type = "button";
projectRedoButton.className = "skin-project-action is-placeholder";
projectRedoButton.textContent = "Redo";
projectRedoButton.disabled = true;
projectRedoButton.title = "Shape Redo is not implemented; Support Paint Redo appears while Paint is active";
projectRedoButton.onclick = () => requestProjectRedo();
const projectExportButton = document.createElement("button");
projectExportButton.type = "button";
projectExportButton.className = "skin-project-action is-placeholder";
projectExportButton.textContent = "Export";
projectExportButton.disabled = true;
projectExportButton.title = "Project export is reserved for the export task";
projectActions.append(
  projectOpenButton,
  projectOpenInput,
  projectSaveButton,
  projectSampleButton,
  projectCompleteSampleButton,
  projectUndoButton,
  projectRedoButton,
  projectExportButton,
);
const projectMeta = document.createElement("div");
projectMeta.className = "skin-project-meta";
projectMeta.setAttribute("aria-live", "polite");
projectMeta.textContent = isSkinRebuildApp
  ? "ORIGINAL UI · Base Shape / Surface Pattern preserved"
  : "UI SHELL · author review";
projectSaveButton.onclick = () => saveCurrentFkeiProject();
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
rightPaneHeader.innerHTML = "<strong>WORKFLOW</strong><span>8 author stages · properties below</span>";
const rightPaneBody = document.createElement("div");
rightPaneBody.className = "skin-pane-body";
rightPane.append(rightPaneHeader, rightPaneBody);

const bottomPane = document.createElement("footer");
bottomPane.className = "skin-bottom-status-pane";
bottomPane.setAttribute("aria-label", "Review status");
const bottomReviewStatus = document.createElement("strong");
bottomReviewStatus.className = "skin-bottom-review";
bottomReviewStatus.textContent = `${isSkinRebuildApp ? "SKIN REBUILD" : "SKIN"} editor | --`;
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
    // Either side changes the canvas CSS box. Keep the WebGL drawing buffer,
    // camera aspect and client-coordinate picking on that same box; otherwise
    // opening the left tools pane makes the visible line and click ray diverge.
    skinRenderer.resize();
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

const skinRebuildRegionMarquee = document.createElement("div");
skinRebuildRegionMarquee.className = "skin-rebuild-region-marquee";
skinRebuildRegionMarquee.hidden = true;
skinRebuildRegionMarquee.setAttribute("aria-hidden", "true");
viewport.appendChild(skinRebuildRegionMarquee);

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
let artworkGraphSnapshot: ArtworkGraph | null = null;
let artworkGraphSourceKey: string | null = null;
let artworkGraphLastError: string | null = null;
let artworkGraphOverlayEnabled = false;
let selectedPatchId: number | null = null;
let addPatchMode = false;
let manualRadius = DEFAULT_SKIN_PARAMS.maxR * 0.5;
let lastPackResult: PackPatchesResult | null = null;
let currentQuadGrid: QuadFlowGrid | null = null;
let internalStructureGraph: InternalStructureGraph | null = null;
let internalStructureFingerprint = "";
type SkinRebuildPipelineRuntime = {
  shapeFingerprint: string;
  settings: SkinRebuildSettings;
  base: SkinRebuildBase;
  patternSides: SkinRebuildPatternSide[];
  dryWeb: InternalStructureGraph | null;
  lowestPoints: SkinRebuildLowestPoint[] | null;
  overhang: {
    faceCount: number;
    regionCount: number;
    areaMm2: number;
    areaPercent: number;
    meshPositions: Float32Array;
    meshNormals: Float32Array;
    positions: Float32Array;
    faceRegionIds: Int32Array;
    regions: SkinRebuildOverhangRegion[];
  } | null;
  project: SkinRebuildProject | null;
};
type SkinRebuildFinalArtworkDiagnosis = {
  project: SkinRebuildProject;
  lowestPoints: SkinRebuildLowestPoint[];
  meshPositions: Float32Array;
  meshNormals: Float32Array;
  overhangFacePositions: Float32Array;
  overhangFaceRegionIds: Int32Array;
  overhangRegions: SkinRebuildOverhangRegion[];
  overhangFaceCount: number;
  overhangRegionCount: number;
  overhangAreaMm2: number;
  overhangAreaPercent: number;
  faceCount: number;
  workerCount: number;
  elapsedMs: number;
};
let skinRebuildPipeline: SkinRebuildPipelineRuntime | null = null;
let skinRebuildFinalizedArtworkProject: SkinRebuildProject | null = null;
let skinRebuildFinalArtworkDiagnosis: SkinRebuildFinalArtworkDiagnosis | null = null;
let skinRebuildStage8CompletedProject: SkinRebuildProject | null = null;
let skinRebuildInsideStatus: HTMLElement | null = null;
let skinRebuildLowestStatus: HTMLElement | null = null;
let skinRebuildLatticeStatus: HTMLElement | null = null;
let skinRebuildFinalDiagnosisStatus: HTMLElement | null = null;
let skinRebuildPrintSupportStatus: HTMLElement | null = null;
let skinRebuildSaveStatus: HTMLElement | null = null;
let skinRebuildReinforcementStatus: HTMLElement | null = null;
let skinRebuildStage8ExportStatus: HTMLElement | null = null;
let skinRebuildLowestButton: HTMLButtonElement | null = null;
let skinRebuildLatticeButton: HTMLButtonElement | null = null;
let skinRebuildFinalDiagnosisButton: HTMLButtonElement | null = null;
let skinRebuildPrintSupportButton: HTMLButtonElement | null = null;
let skinRebuildStage8ExportButton: HTMLButtonElement | null = null;
let skinRebuildSaveButton: HTMLButtonElement | null = null;
let skinRebuildThresholdInput: HTMLInputElement | null = null;
let skinRebuildDiameterInput: HTMLInputElement | null = null;
let skinRebuildSupportDiameterInput: HTMLInputElement | null = null;
let skinRebuildLatticeEdgeSelect: HTMLSelectElement | null = null;
let skinRebuildLatticeDeleteButton: HTMLButtonElement | null = null;
type SkinRebuildViewportSelectionMode = "pattern" | "lattice-edge";
let skinRebuildViewportSelectionMode: SkinRebuildViewportSelectionMode = "pattern";
let skinRebuildViewportSelectionStatus: HTMLElement | null = null;
let skinRebuildSpiderLatticeToggle: HTMLInputElement | null = null;
let skinRebuildSelectedTargetPatchId: number | null = null;
let skinRebuildSelectedOverhangRegionIds = new Set<number>();
let skinRebuildReinforcedOverhangRegionIds = new Set<number>();
let skinRebuildRegionDragSelectEnabled = false;
let skinRebuildRegionDragSelection: {
  pointerId: number;
  operation: "replace" | "add" | "remove";
  startX: number;
  startY: number;
} | null = null;
let skinRebuildSelectedTargetStatus: HTMLElement | null = null;
let skinRebuildSelectedTargetButton: HTMLButtonElement | null = null;
let skinRebuildSelectedRegionStatus: HTMLElement | null = null;
let skinRebuildSelectedRegionReinforceButton: HTMLButtonElement | null = null;
let skinRebuildBulkSupportButton: HTMLButtonElement | null = null;
let skinRebuildCompleteSupportButton: HTMLButtonElement | null = null;
let skinRebuildUnsupportedFocusButton: HTMLButtonElement | null = null;
let skinRebuildConnectAllButton: HTMLButtonElement | null = null;
type SkinRebuildReinforcementPreview = { graph: InternalStructureGraph; edgeIds: number[] };
let skinRebuildReinforcementPreview: SkinRebuildReinforcementPreview | null = null;
let activeSkinRebuildLowestWorker: Worker | null = null;
let skinRebuildLowestRequestId = 0;
let skinRebuildLowestHeavyComputation: HeavyComputationHandle | null = null;
let skinRebuildLowestStatusTimer: number | null = null;
let activeSkinRebuildStage5BWorker: Worker | null = null;
let skinRebuildStage5BRequestId = 0;
let skinRebuildStage5BHeavyComputation: HeavyComputationHandle | null = null;
let activeSkinRebuildPrintSupportWorker: Worker | null = null;
let skinRebuildPrintSupportRequestId = 0;
let internalAngleScreeningEnabled = false;
let internalAngleScreeningGraph: InternalStructureGraph | null = null;
let internalAngleScreening: InternalAngleScreeningReport | null = null;
type TargetedSupportSourceState = {
  surfaceFingerprint: string;
  resolution: number;
  targets: Array<MotifLowestPoint | OverhangDryWebTarget>;
};
let targetedSupportSource: TargetedSupportSourceState | null = null;
type PhaseADryWebPreviewState = {
  surfaceFingerprint: string;
  resolution: number;
  paintRevision: number;
  artworkGraphSnapshot: ArtworkGraph;
  artworkGraphSourceKey: string;
  graph: InternalStructureGraph;
  /** Runtime-only worker fact; never persisted with the graph/history. */
  targetConnectionFacts: TargetedGridTargetConnectionFact[] | null;
  /** Runtime-only worker fact; never persisted with the graph/history. */
  contactFloorFacts: TargetedGridContactFloorFacts | null;
  /** Null after Stage 7 candidate adoption: the old generator facts are no longer current. */
  facts: DryWebRoutingFacts | null;
  computeMs: number;
};
let phaseADryWebPreview: PhaseADryWebPreviewState | null = null;
let activeDryWebPreviewWorker: Worker | null = null;
let dryWebPreviewGeneration = 0;
let dryWebPreviewRequestId = 0;
let dryWebPreviewPending = false;
let dryWebPreviewStartTimer: number | null = null;
let dryWebPreviewHeavyComputation: HeavyComputationHandle | null = null;
let activeDryWebExactRecheckWorker: Worker | null = null;
let dryWebExactRecheckGeneration = 0;
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
type SkinRebuildStage6BodyMeshCache = {
  fingerprint: string;
  positions: Float32Array;
  normals: Float32Array;
  summary: string;
  watertightOk: boolean;
};
let stage6BodyMeshCache: SkinRebuildStage6BodyMeshCache | null = null;
type SkinRebuildExportFormatSelection = {
  threeMf: boolean;
  stl: boolean;
  obj: boolean;
  recipe: boolean;
};
const DEFAULT_SKIN_REBUILD_EXPORT_FORMATS: SkinRebuildExportFormatSelection = {
  threeMf: true,
  stl: true,
  obj: true,
  recipe: true,
};
type SkinRebuildWorkflowStatusSnapshot = {
  text: string;
  ok: string | null;
};
type SkinRebuildWorkflowSnapshot = {
  pipeline: SkinRebuildPipelineRuntime | null;
  finalizedArtworkProject: SkinRebuildProject | null;
  finalArtworkDiagnosis: SkinRebuildFinalArtworkDiagnosis | null;
  stage8CompletedProject: SkinRebuildProject | null;
  stage6BodyMeshCache: SkinRebuildStage6BodyMeshCache | null;
  reinforcementPreview: SkinRebuildReinforcementPreview | null;
  selectedTargetPatchId: number | null;
  selectedOverhangRegionIds: Set<number>;
  reinforcedOverhangRegionIds: Set<number>;
  statuses: {
    inside: SkinRebuildWorkflowStatusSnapshot | null;
    lowest: SkinRebuildWorkflowStatusSnapshot | null;
    lattice: SkinRebuildWorkflowStatusSnapshot | null;
    reinforcement: SkinRebuildWorkflowStatusSnapshot | null;
    finalDiagnosis: SkinRebuildWorkflowStatusSnapshot | null;
    printSupport: SkinRebuildWorkflowStatusSnapshot | null;
    save: SkinRebuildWorkflowStatusSnapshot | null;
    stage8Export: SkinRebuildWorkflowStatusSnapshot | null;
  };
};
type SkinRebuildWorkflowHistoryEntry = {
  label: string;
  before: SkinRebuildWorkflowSnapshot;
  after: SkinRebuildWorkflowSnapshot;
};
let skinRebuildWorkflowHistoryPast: SkinRebuildWorkflowHistoryEntry[] = [];
let skinRebuildWorkflowHistoryFuture: SkinRebuildWorkflowHistoryEntry[] = [];
let activeGaugeWorker: Worker | null = null;
let gaugeGeneration = 0;
let gaugeDebounceTimer: number | null = null;
let activeMeshExportWorker: Worker | null = null;
let meshExportRequestId = 0;
let meshExportGeneration = 0;
let meshExportStatusTimer: number | null = null;
let meshExportHeavyComputation: HeavyComputationHandle | null = null;
let pendingMeshExportAfterGate: {
  options: MeshUiOptions;
  fingerprint: string;
  formats: SkinRebuildExportFormatSelection;
} | null = null;
let activePrintCheckMeshWorker: Worker | null = null;
let printCheckMeshReject: ((error: Error) => void) | null = null;
let printCheckMeshRequestId = 0;
let printCheckMeshGeneration = 0;
let activeInternalPrintGateWorker: Worker | null = null;
let internalPrintGateHeavyComputation: HeavyComputationHandle | null = null;
let internalPrintGateRequestId = 0;
let internalPrintGateGeneration = 0;
let pendingInternalPrintGateFingerprint = "";
let internalPrintGateCache: {
  fingerprint: string;
  report: InternalPrintGateReport;
  stl: ArrayBuffer;
  summary: string;
  scaleMmPerUnit: number;
  plateShiftSourceZ: number;
} | null = null;
let internalPrintGateStatusTimer: number | null = null;
let activeSurfaceAngleWorker: Worker | null = null;
let activeSurfaceSupportClassificationWorker: Worker | null = null;
let surfaceHeavyComputation: HeavyComputationHandle | null = null;
const SURFACE_PROGRESS_CACHE_LOOKUP = 2;
const SURFACE_PROGRESS_WORKER_START = 5;
const SURFACE_PROGRESS_CLASSIFICATION = 80;
let surfaceAngleGeneration = 0;
let surfaceAngleCache: Extract<SurfaceAngleWorkerMessage, { type: "result" }> | null = null;
// Checkpoint 1 is a presentation-only derivation from the accepted Surface
// diagnosis. It has no save/export identity and is cleared with that cache.
let riskDrivenInternalLatticeFacts: RiskDrivenInternalLatticeFacts | null = null;
let riskDrivenInternalLatticeOverlayEnabled = false;
let restoredRiskDrivenLattice: FkeiRestorePlan["riskDrivenLattice"] = null;
let restoredCanonicalDryWeb: FkeiRestorePlan["canonicalDryWeb"] = null;
let riskDrivenPermanentLatticeOverlayEnabled = false;
let restoredRiskDrivenLatticeBodyWorker: Worker | null = null;
let restoredRiskDrivenLatticeBodyGeneration = 0;
// Binding captured at the same accepted Surface diagnosis commit as the
// result/cache context. Save compares this immutable session fact to current
// runtime settings; it never reconstructs it from the current UI alone.
let acceptedSurfaceSaveBinding: FkeiSurfaceBinding | null = null;
let installedSurfaceAngleDiagnosisView: SurfaceAngleDiagnosisView | null = null;
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
let dryWebAuthorIntegrationPresentation = false;
let dryWebInsideTargetOverlayVisible = false;
let dryWebInsufficientEdgeOverlayVisible = false;
let dryWebContactFloorOverlayVisible: DryWebContactFloorResidualCategory | null = null;
let dryWebSupportSeparation: DryWebSupportSeparationPresentation | null = null;
let dryWebSupportSeparationSource: Extract<SurfaceAngleWorkerMessage, { type: "result" }> | null = null;
let dryWebSupportSeparationVisible = false;
let dryWebSupportSeparationRestoreViewState: DryWebGraphViewViewportState | null = null;
let dryWebSupportSeparationRestoreDiagnosisView: SurfaceAngleDiagnosisView | null = null;
let dryWebRedFaceLocatorVisible = false;
let dryWebRedFaceLocatorRestoreViewState: DryWebGraphViewViewportState | null = null;
let dryWebRedFaceLocatorRestoreDiagnosisView: SurfaceAngleDiagnosisView | null = null;
let dryWebRedFaceDryWebCandidateVisible = false;
type Stage7RedFaceReinforcementPlanBinding = {
  readonly source: "red-face-reinforcement" | "explicit-topology-repair";
  readonly sourceGraph: InternalStructureGraph;
  readonly exactSource: Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
  readonly candidateFaceIds: readonly number[];
  readonly targetDiameterMm: number;
  readonly scaleMmPerUnit: number;
  readonly plan: Stage7RedFaceReinforcementPlan;
  readonly explicitIdentity: ExplicitTopologyRepairIdentity | null;
};
let stage7RedFaceReinforcementPlan: Stage7RedFaceReinforcementPlanBinding | null = null;
let stage7RedFaceReinforcementPlanMessage: string | null = null;
interface Stage7ProvisionalRecheckBinding {
  readonly plan: Stage7RedFaceReinforcementPlan;
  readonly sourceGraph: InternalStructureGraph;
  readonly baseDiagnosis: Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
  readonly baselineSeparation: DryWebSupportSeparationPresentation;
  readonly exactSource: Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
  readonly candidateFaceIds: readonly number[];
  readonly targetDiameterMm: number;
  readonly scaleMmPerUnit: number;
  readonly supportEntries: OverhangSupportPolicyResult["entries"] | null;
  readonly meshStep: number;
  readonly mode: SkinMode;
}

type Stage7ProvisionalRecheckResult = {
  readonly binding: Stage7ProvisionalRecheckBinding;
  readonly source: Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
  readonly separation: DryWebSupportSeparationPresentation;
  readonly elapsedMs: number;
};

interface Stage7ProvisionalAdoptionGateApproval {
  /** The exact provisional plan object reviewed by the author. */
  readonly plan: Stage7RedFaceReinforcementPlan;
  /** The exact provisional recheck result object reviewed by the author. */
  readonly result: Stage7ProvisionalRecheckResult;
}

let activeStage7ProvisionalRecheckWorker: Worker | null = null;
let stage7ProvisionalRecheckGeneration = 0;
let stage7ProvisionalRecheckHeavyComputation: HeavyComputationHandle | null = null;
let stage7ProvisionalRecheckRunBinding: Stage7ProvisionalRecheckBinding | null = null;
let stage7ProvisionalRecheckResult: Stage7ProvisionalRecheckResult | null = null;
let stage7ProvisionalRecheckElapsedMs: number | null = null;
let stage7ProvisionalRecheckTerminal: "missing" | "stale" | "error" = "missing";
let stage7ProvisionalRecheckMessage: string | null = null;
let stage7ProvisionalAdoptionGateApproval: Stage7ProvisionalAdoptionGateApproval | null = null;
interface Stage7CanonicalCandidateAdoptionUndo {
  readonly phaseADryWebPreview: PhaseADryWebPreviewState;
  readonly internalStructureGraph: InternalStructureGraph | null;
  readonly internalAngleScreeningGraph: InternalStructureGraph | null;
  readonly internalAngleScreening: InternalAngleScreeningReport | null;
  readonly dryWebSupportSeparation: DryWebSupportSeparationPresentation | null;
  readonly dryWebSupportSeparationSource: Extract<SurfaceAngleWorkerMessage, { type: "result" }> | null;
  readonly dryWebSupportSeparationVisible: boolean;
  readonly dryWebSupportSeparationRestoreViewState: DryWebGraphViewViewportState | null;
  readonly dryWebSupportSeparationRestoreDiagnosisView: SurfaceAngleDiagnosisView | null;
  readonly installedSurfaceAngleDiagnosisView: SurfaceAngleDiagnosisView | null;
  readonly dryWebInsideTargetOverlayVisible: boolean;
  readonly dryWebInsufficientEdgeOverlayVisible: boolean;
  readonly dryWebContactFloorOverlayVisible: DryWebContactFloorResidualCategory | null;
  readonly dryWebRedFaceLocatorVisible: boolean;
  readonly dryWebRedFaceLocatorRestoreViewState: DryWebGraphViewViewportState | null;
  readonly dryWebRedFaceLocatorRestoreDiagnosisView: SurfaceAngleDiagnosisView | null;
  readonly dryWebRedFaceDryWebCandidateVisible: boolean;
  readonly dryWebContactPresentationOwner: DryWebContactPresentationOwner;
  readonly stage7RedFaceReinforcementPlan: Stage7RedFaceReinforcementPlanBinding | null;
  readonly stage7RedFaceReinforcementPlanMessage: string | null;
  readonly stage7ProvisionalRecheckResult: Stage7ProvisionalRecheckResult | null;
  readonly stage7ProvisionalRecheckElapsedMs: number | null;
  readonly stage7ProvisionalRecheckTerminal: "missing" | "stale" | "error";
  readonly stage7ProvisionalRecheckMessage: string | null;
  readonly stage7ProvisionalAdoptionGateApproval: Stage7ProvisionalAdoptionGateApproval | null;
}

interface Stage7CanonicalCandidateAdoptionRecord {
  readonly graph: InternalStructureGraph;
  readonly surfaceAngleCache: Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
  readonly artworkGraphSnapshot: ArtworkGraph | null;
  readonly artworkGraphSourceKey: string | null;
  readonly targetedSupportSource: TargetedSupportSourceState | null;
  readonly paintRevision: number;
  readonly surfaceFingerprint: string;
  readonly resolution: number;
  readonly mode: SkinMode;
  readonly supportSettingsKey: string;
  /** Exact print scale captured when this candidate became canonical. */
  readonly scaleMmPerUnit: number;
  readonly exactValidated: boolean;
}

let stage7CanonicalCandidateAdoption: Stage7CanonicalCandidateAdoptionRecord | null = null;
let stage7CanonicalCandidateAdoptionUndo: Stage7CanonicalCandidateAdoptionUndo | null = null;
// Exactly one author diagnostic owns the bead colors at a time.  This is
// separate from the removable-support presentation flag above: A/B, N-way,
// and legacy contact views may temporarily take over without invalidating the
// already-generated Dry Web graph, but the Dry Web legend must then disappear.
let dryWebContactPresentationOwner: DryWebContactPresentationOwner = "none";
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
let activeSupportPaintRaycastWorker: Worker | null = null;
let supportPaintRaycastHeavyComputation: HeavyComputationHandle | null = null;
let supportPaintRaycastGeneration = 0;
let supportPaintRaycastReady = false;
let supportPaintRaycastRequestId = 0;
let supportPaintInteractionCounters = createSupportPaintInteractionCounters();
let lastSupportPaintInteractionCounters: SupportPaintInteractionCounters | null = null;
type SupportPaintSurfaceCacheState = {
  diagnosis: Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
  targetLongestMm: number;
  positionsMm: Float32Array;
  frame: ReturnType<typeof buildSupportPaintFrame>;
  scaleMmPerUnit: number;
};
let supportPaintSurfaceCache: SupportPaintSurfaceCacheState | null = null;
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

/**
 * The history replay path preserves legacy optional Patch keys as explicit
 * `undefined` properties. Graph Core intentionally rejects that shape, so
 * the Stage 3 adapter removes only those absent optional values before
 * handing the facts to the existing graph factories. Defined facts and
 * nested point/motif data are copied unchanged.
 */
function currentGraphPatches(): Patch[] {
  return fkeiArtworkGraphPatches(state);
}

function currentArtworkGraphSourceKey(): string {
  return fkeiArtworkGraphSourceKey(state);
}

function currentDryWebArtworkGraphBoundary(): DryWebArtworkGraphBoundaryDecision {
  let currentSourceKey: string | null = null;
  try {
    currentSourceKey = currentArtworkGraphSourceKey();
  } catch {
    // A source-key failure is intentionally fail-closed by the pure boundary.
  }
  return inspectDryWebArtworkGraphBoundary({
    snapshot: artworkGraphSnapshot,
    snapshotSourceKey: artworkGraphSourceKey,
    currentSourceKey,
    currentPatchSetRevision: state.patchSetRevision,
  });
}

function syncArtworkGraphStatus(): void {
  let currentKey: string | null = null;
  let keyError: string | null = null;
  try {
    currentKey = currentArtworkGraphSourceKey();
  } catch (error) {
    keyError = error instanceof Error ? error.message : String(error);
  }
  const boundary = inspectDryWebArtworkGraphBoundary({
    snapshot: artworkGraphSnapshot,
    snapshotSourceKey: artworkGraphSourceKey,
    currentSourceKey: currentKey,
    currentPatchSetRevision: state.patchSetRevision,
  });
  const isCurrent = boundary.status === "current";
  const status: ArtworkGraphUiStatus["status"] = state.patches.length === 0
    ? "not-ready"
    : artworkGraphSnapshot === null
      ? "not-ready"
      : isCurrent
        ? "ready"
        : "stale";
  const detail = keyError
    ? `現在のSurfaceをGraph化できません: ${keyError}`
    : state.patches.length === 0
      ? artworkGraphSnapshot === null
        ? "Surfaceパッチがないため未準備です。Surfaceを生成するとGraph化できます。"
        : "Surfaceパッチがないため未準備です。前回snapshotは現在のSurfaceとして扱いません。"
      : artworkGraphSnapshot === null
        ? artworkGraphLastError ?? "現在のSurfaceをボタンでsnapshot化してください。"
        : isCurrent
          ? "現在のSurfaceから生成したin-memory snapshotです。"
          : boundary.reason;
  ui.setArtworkGraphStatus({
    status,
    currentPatchCount: state.patches.length,
    snapshotNodeCount: artworkGraphSnapshot?.surfaceDraft.nodes.length ?? null,
    relationCount: artworkGraphSnapshot?.surfaceDraft.edges.length ?? null,
    patchSetRevision: state.patchSetRevision,
    artworkState: artworkGraphSnapshot?.state === "surfaceDraft" ? "surfaceDraft" : null,
    detail,
  });
  const overlay = createArtworkGraphOverlayPresentation(
    artworkGraphSnapshot,
    boundary.status,
    artworkGraphOverlayEnabled,
  );
  skinRenderer.setArtworkGraphOverlay(overlay.markers, overlay.enabled);
  ui.setArtworkGraphOverlayState({
    enabled: overlay.enabled,
    status: overlay.status,
    nodeCount: artworkGraphSnapshot?.surfaceDraft.nodes.length ?? 0,
  });
}

function deriveCurrentArtworkGraph(): void {
  // Replacing the explicit Stage-3 snapshot invalidates any Stage-4 result
  // immediately. The diagnosis/Paint facts remain available for the next
  // run, but no graph derived from the previous snapshot stays visible.
  invalidateDryWebPreviewForInputChange(
    `Stage 3 snapshotを更新しました。${DRY_WEB_ARTWORK_GRAPH_REFRESH_PROMPT}`,
  );
  if (state.patches.length === 0) {
    syncArtworkGraphStatus();
    refreshDryWebActions();
    return;
  }
  try {
    const patches = currentGraphPatches();
    const sourceKey = canonicalStringify({ patchSetRevision: state.patchSetRevision, patches });
    const surfaceGraph = createSurfaceGraph(patches, state.patchSetRevision, {
      revision: state.patchSetRevision,
    });
    artworkGraphSnapshot = createArtworkGraph(surfaceGraph, { revision: state.patchSetRevision });
    artworkGraphSourceKey = sourceKey;
    artworkGraphLastError = null;
    artworkGraphOverlayEnabled = true;
  } catch (error) {
    artworkGraphLastError = error instanceof Error ? error.message : String(error);
  }
  syncArtworkGraphStatus();
  refreshDryWebActions();
}

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
    : `${isSkinRebuildApp ? "SKIN REBUILD" : "SKIN"} editor | ${directionLabel}`;

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
      syncPhaseAVerticalControl();
      if (state.skinParams.internalStructure === "targetedGrid" && supportPaintMode === "outside") {
        // Existing outside strokes remain in the v1 document for compatibility,
        // but new Stage 4 Dry Web edits are inside-only.
        supportPaintMode = "inside";
      }
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
    // Required Dry Web contacts is an author-preview threshold only. Keep the
    // current generator facts while recomputing their pass/warning summary.
    // The next explicit generation passes the selected floor to the Worker.
    if (key === "dryWebRequiredContacts") {
      clearStage7CanonicalCandidateAdoption();
      if (stage7RedFaceReinforcementPlan || stage7ProvisionalRecheckIsActive() || stage7ProvisionalRecheckResult) {
        clearStage7RedFaceReinforcementPlan();
        stage7RedFaceReinforcementPlanMessage = "必要接触数が変わったため、仮Graph計画と比較結果を破棄しました。";
      }
      releaseDryWebInsufficientEdgeOverlayForCompetingView();
      syncUndoHistory();
      syncArtworkGraphStatus();
      ui.setInternalStructureStatus("必要接触数の変更は現在結果を再判定します。形状へ反映するにはDry Webを再生成します。");
      refreshDryWebActions();
      render();
      return;
    }
    afterMutation({ skipGauges: true });
  },
  onSetViewMode: (mode) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    releaseDryWebSupportSeparationPresentationForCompetingView();
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
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    releaseDryWebSupportSeparationPresentationForCompetingView();
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
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    releaseDryWebSupportSeparationPresentationForCompetingView();
    const restoredCheckpointCurrent = Boolean(
      restoredCanonicalDryWeb
      && restoredRiskDrivenLattice
      && restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice),
    );
    if (!restoredCheckpointCurrent) {
      invalidateSurfaceAngleDiagnosis("Internal表示を切り替えたため、角度診断を終了しました");
    }
    setInternalObservationMode(mode);
  },
  onSetDryWebGraphView: (option: DryWebGraphViewOption) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    releaseDryWebSupportSeparationPresentationForCompetingView();
    // Stage 4 observation must not take the generic callbacks above: those
    // intentionally invalidate a diagnosis, while this panel only changes
    // the existing viewport presentation around the current graph.
    const restoredGraphCurrent = Boolean(
      restoredCanonicalDryWeb
      && restoredRiskDrivenLattice
      && restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice),
    );
    if (state.skinParams.internalStructure !== "targetedGrid"
      || ((!dryWebPreviewIsCurrent() || phaseADryWebPreview?.graph?.kind !== "targetedGrid") && !restoredGraphCurrent)) {
      refreshDryWebActions();
      return;
    }
    setViewMode(option.viewMode);
    setInternalObservationMode(option.observationMode);
  },
  onSetDryWebInsideTargetVisible: (visible) => setDryWebInsideTargetOverlayVisible(visible),
  onSetDryWebInsufficientEdgeVisible: (visible) => setDryWebInsufficientEdgeOverlayVisible(visible),
  onSetDryWebContactFloorOverlay: (category) => setDryWebContactFloorOverlay(category),
  onSetDryWebSupportSeparationVisible: (visible) => setDryWebSupportSeparationVisible(visible),
  onSetDryWebRedFaceLocatorVisible: (visible) => setDryWebRedFaceLocatorVisible(visible),
  onSetDryWebRedFaceDryWebCandidateVisible: (visible) => setDryWebRedFaceDryWebCandidateVisible(visible),
  onToggleRiskDrivenInternalLatticeOverlay: (visible) => {
    const facts = riskDrivenInternalLatticeFacts;
    if (!facts || !surfaceAngleCache) {
      clearRiskDrivenInternalLatticePresentation("missing", "現在のSurface診断がありません。Surface診断完了後に表示できます。");
      return;
    }
    riskDrivenInternalLatticeOverlayEnabled = visible;
    skinRenderer.setRiskDrivenInternalLatticeOverlay(facts, visible);
    updateRiskDrivenInternalLatticeUi(facts);
    render();
  },
  onToggleRiskDrivenPermanentLatticeOverlay: (visible) => {
    if (!restoredRiskDrivenLattice || !restoredCanonicalDryWeb
      || !restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice)) {
      riskDrivenPermanentLatticeOverlayEnabled = false;
      skinRenderer.clearRiskDrivenPermanentLatticeOverlay();
      ui.setRiskDrivenPermanentLattice({ available: false, enabled: false, status: "saved latticeは現在のShape/Paint bindingと一致しません", onBody: "" });
      return;
    }
    riskDrivenPermanentLatticeOverlayEnabled = visible;
    skinRenderer.setRiskDrivenPermanentLatticeOverlay(restoredRiskDrivenLattice, visible);
    ui.setRiskDrivenPermanentLattice({ available: true, enabled: visible, status: "saved 56 nodes / 48 edges · 8 spines", onBody: "BODY未生成" }); render();
  },
  onRebuildRiskDrivenPermanentLatticeBody: () => {
    if (!restoredRiskDrivenLattice || !restoredCanonicalDryWeb
      || !restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice)) {
      ui.setRiskDrivenPermanentLattice({ available: Boolean(restoredRiskDrivenLattice), enabled: riskDrivenPermanentLatticeOverlayEnabled, status: "checkpointがstaleです", onBody: "再Openまたは現在状態の確認が必要" });
      return;
    }
    try {
      ui.setRiskDrivenPermanentLattice({ available: true, enabled: riskDrivenPermanentLatticeOverlayEnabled, status: "resolution128 BODYを再構築中", onBody: "planner/外部入力なし" });
      restoredRiskDrivenLatticeBodyWorker?.terminate();
      const generation = ++restoredRiskDrivenLatticeBodyGeneration;
      const capturedCanonical = restoredCanonicalDryWeb;
      const capturedLattice = restoredRiskDrivenLattice;
      const worker = new Worker(new URL("./fkeiRiskDrivenLatticeBody.worker.ts", import.meta.url), { type: "module" });
      restoredRiskDrivenLatticeBodyWorker = worker;
      worker.onmessage = (event: MessageEvent<{ type: "result" | "error"; generation: number; stl?: ArrayBuffer; triangleCount?: number; closed?: boolean; components?: number; savedDiameterMm?: number; stlSha256?: string; message?: string }>) => {
        const message = event.data;
        if (worker !== restoredRiskDrivenLatticeBodyWorker || message.generation !== generation
          || restoredCanonicalDryWeb !== capturedCanonical || restoredRiskDrivenLattice !== capturedLattice
          || !restoredRiskDrivenCheckpointIsCurrent(capturedCanonical, capturedLattice)) { worker.terminate(); restoredRiskDrivenLatticeBodyWorker = null; return; }
        worker.terminate(); restoredRiskDrivenLatticeBodyWorker = null;
        if (message.type === "error" || !message.stl || message.triangleCount !== capturedLattice.generationFacts.triangleCount || message.closed !== true || message.components !== 1 || message.savedDiameterMm !== capturedLattice.generationFacts.savedDiameterMm || message.stlSha256 !== capturedLattice.stlSha256) { ui.setRiskDrivenPermanentLattice({ available: true, enabled: riskDrivenPermanentLatticeOverlayEnabled, status: "BODY再構築に失敗", onBody: message.message ?? "saved geometry SHA mismatch" }); return; }
        downloadBlob(new Blob([message.stl], { type: "model/stl" }), "skin-risk-driven-lattice-v0-restored-res128.stl");
        ui.setRiskDrivenPermanentLattice({ available: true, enabled: riskDrivenPermanentLatticeOverlayEnabled, status: `BODY ${message.triangleCount.toLocaleString()} triangles`, onBody: `closed / 1 component / ${message.savedDiameterMm.toFixed(12)}mm` });
      };
      worker.onerror = () => { if (worker === restoredRiskDrivenLatticeBodyWorker) { worker.terminate(); restoredRiskDrivenLatticeBodyWorker = null; ui.setRiskDrivenPermanentLattice({ available: true, enabled: riskDrivenPermanentLatticeOverlayEnabled, status: "BODY再構築に失敗", onBody: "Worker error" }); } };
      worker.postMessage({ type: "rebuild", generation, state: { ...state, host: state.host.map((ball) => ({ ...ball })), patches: state.patches.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })) }, canonical: capturedCanonical, lattice: capturedLattice });
    } catch (error) {
      restoredRiskDrivenLatticeBodyGeneration++;
      restoredRiskDrivenLatticeBodyWorker?.terminate();
      restoredRiskDrivenLatticeBodyWorker = null;
      ui.setRiskDrivenPermanentLattice({ available: true, enabled: riskDrivenPermanentLatticeOverlayEnabled, status: "BODY再構築に失敗", onBody: error instanceof Error ? error.message : "Workerを開始できません" });
    }
  },
  onBuildDryWebRedFaceReinforcementPlan: () => buildStage7RedFaceReinforcementPlan(),
  onBuildPatch6ExplicitTopologyRepairPlan: () => buildPatch6ExplicitTopologyRepairPlan(),
  onDiscardDryWebRedFaceReinforcementPlan: () => discardStage7RedFaceReinforcementPlan(),
  onRecheckDryWebRedFaceReinforcementPlan: () => requestStage7ProvisionalRecheck(),
  onDiscardDryWebRedFaceReinforcementComparison: () => discardStage7ProvisionalRecheck(),
  onApproveDryWebRedFaceProvisionalComparison: () => approveStage7ProvisionalAdoptionGate(),
  onReturnDryWebRedFaceProvisionalComparisonToPending: () => returnStage7ProvisionalAdoptionGateToPending(),
  onAdoptDryWebRedFaceCanonicalCandidate: () => adoptStage7CanonicalCandidate(),
  onUndoDryWebRedFaceCanonicalCandidateAdoption: () => undoStage7CanonicalCandidateAdoption(),
  onToggleInternalAngleScreening: (enabled) => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); releaseDryWebSupportSeparationPresentationForCompetingView(); setInternalAngleScreeningEnabled(enabled); },
  onViewportClippingAction: (action) => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); releaseDryWebSupportSeparationPresentationForCompetingView(); updateViewportClipping(action); },
  onDiagnoseSurfaceAngles: (thresholdDeg) => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); releaseDryWebSupportSeparationPresentationForCompetingView(); startSurfaceAngleDiagnosis(thresholdDeg); },
  onGenerateDryWeb: () => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); releaseDryWebSupportSeparationPresentationForCompetingView(); requestDryWebPreviewUpdate("作者がDry Web生成を開始"); },
  onRecheckDryWebAfterAttachment: () => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); releaseDryWebSupportSeparationPresentationForCompetingView(); requestDryWebExactRecheck(); },
  onShowSurfaceDiagnostics: () => formatSurfaceEnvironmentDiagnostics(),
  onSetSurfaceAngleDiagnosisView: (diagnosisView) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    releaseDryWebSupportSeparationPresentationForCompetingView();
    showSurfaceAngleDiagnosisView(diagnosisView);
  },
  onSurfaceAngleThresholdChange: () => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); releaseDryWebSupportSeparationPresentationForCompetingView(); invalidateSurfaceAngleDiagnosis("閾値が変わりました。もう一度診断してください"); refreshPrintProfileSummary(); },
  onToggleOverhangSupportSites: (show) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    dryWebAuthorIntegrationPresentation = false;
    showOverhangSupportSites = show;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onSetOverhangSupportDepthMode: (mode) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    dryWebAuthorIntegrationPresentation = false;
    supportSiteDepthMode = mode;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onToggleMixedSupportFaces: (show) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    dryWebAuthorIntegrationPresentation = false;
    showMixedSupportFaces = show;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onToggleSupportFootprint: (show) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    dryWebAuthorIntegrationPresentation = false;
    showSupportFootprint = show;
    refreshOverhangSupportSiteOverlay();
    render();
  },
  onSetSupportPaintEnabled: (enabled) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    setSupportPaintEnabled(enabled);
  },
  onSetSupportPaintMode: (mode) => {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    if (state.skinParams.internalStructure === "targetedGrid" && mode === "outside") {
      supportPaintMode = "inside";
      refreshSupportPaintUi("Dry Webではinsideだけを編集します。outside / scaffoldは後段で扱います");
      return;
    }
    supportPaintMode = mode;
    markSupportPaintDraftDirty();
    refreshSupportPaintUi();
  },
  onSetSupportPaintRadiusMm: (radiusMm) => { releaseDryWebInsideTargetOverlayForCompetingView(); releaseDryWebInsufficientEdgeOverlayForCompetingView(); supportPaintRadiusMm = radiusMm; markSupportPaintDraftDirty(); refreshSupportPaintUi(); },
  onSetSupportPaintBackfaces: (enabled) => { releaseDryWebInsideTargetOverlayForCompetingView(); releaseDryWebInsufficientEdgeOverlayForCompetingView(); supportPaintBackfaces = enabled; markSupportPaintDraftDirty(); refreshSupportPaintUi(); },
  onUndoSupportPaint: () => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); undoOneSupportPaintOperation(); },
  onRedoSupportPaint: () => { releaseDryWebInsufficientEdgeOverlayForCompetingView(); redoOneSupportPaintOperation(); },
  onResetSupportPaint: () => {
    invalidateDryWebPreviewForInputChange("Support Paintを自動分類へ戻しました。Dry Webをもう一度生成してください");
    supportPaintSession = reviseSupportPaintSession(supportPaintSession, resetSupportPaint(supportPaintSession.history));
    resetSupportPaintUndoJournal();
    invalidateSupportPaintReprojection();
    autosaveSupportPaintDraft();
    reapplySupportPaint("Support Paintを自動分類へ戻しました", supportPaintSession.history.present);
  },
  onSaveSupportPaintDraft: () => saveSupportPaintDraftDownload(),
  onLoadSupportPaintDraft: (file) => loadSupportPaintDraftFile(file),
  onVerifySupportPaintReprojection: () => startSupportPaintReprojectionVerification(),
  onToggleMotifLowestPoints: (show, thresholdDeg) => {
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
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
  onCreateArtworkGraph: () => deriveCurrentArtworkGraph(),
  onToggleArtworkGraphOverlay: (enabled) => {
    artworkGraphOverlayEnabled = enabled;
    syncArtworkGraphStatus();
    render();
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
    refreshInternalAngleScreening(internalAngleScreeningGraph);
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
  onOpeningMapConditionsChange: () => {
    if (stage7RedFaceReinforcementPlan || stage7ProvisionalRecheckIsActive() || stage7ProvisionalRecheckResult) {
      clearStage7RedFaceReinforcementPlan();
      stage7RedFaceReinforcementPlanMessage = "meshの実寸設定が変わったため、仮Graph計画と比較結果を破棄しました。";
    }
    invalidateOpeningMap();
    refreshPrintProfileSummary();
    refreshDryWebSupportSeparationUi();
  },
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

syncArtworkGraphStatus();

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

const PHASE_A_SUPPORT_PREVIEW_MAX_LEAVES = 2_000;

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
phaseASupportPanel.dataset.owner = "removable-print-support";
phaseASupportPanel.dataset.role = "removable-support-preview";
const phaseATitle = document.createElement("h3");
phaseATitle.textContent = "8. Removable Print Support";
const phaseANote = document.createElement("p");
phaseANote.className = "phase-a-support-note";
phaseANote.textContent = "Surface 48 / Case A用。現在のSupport Paint分類から最大2,000葉だけを表示用に抽出します。Artwork Dry Webの物理設定はStage 4にあります。書き出し・印刷判定には使いません。";
const phaseAControls = document.createElement("div");
phaseAControls.className = "phase-a-support-controls";
phaseAControls.dataset.owner = "removable-print-support";
phaseAControls.dataset.role = "removable-support-controls";

function addPhaseANumberControl(
  labelText: string,
  key: Exclude<keyof PhaseASupportPreviewSettings, "supportMode" | "baseVolumeVerticalSupports">,
  min: number,
  max: number,
  step: number,
  suffix: string,
): HTMLLabelElement {
  const label = document.createElement("label");
  label.dataset.owner = "removable-print-support";
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
    clearStage7CanonicalCandidateAdoption();
    if (stage7ProvisionalRecheckIsActive() || stage7ProvisionalRecheckResult) {
      clearStage7ProvisionalRecheck("Stage 4 settingsが変わったため、仮Graph比較を破棄しました。", "stale");
    }
    refreshPhaseASupportPreview();
    refreshDryWebActions();
  });
  valueWrap.append(input, unit);
  label.append(valueWrap);
  phaseAControls.appendChild(label);
  return label;
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
  clearStage7CanonicalCandidateAdoption();
  if (stage7ProvisionalRecheckIsActive() || stage7ProvisionalRecheckResult) {
    clearStage7ProvisionalRecheck("Stage 4 settingsが変わったため、仮Graph比較を破棄しました。", "stale");
  }
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
const phaseAVerticalText = document.createTextNode("base-volume vertical supports ON");
function syncPhaseAVerticalControl(): void {
  const ignoredForDryWeb = state.skinParams.internalStructure === "targetedGrid";
  phaseAVerticalInput.disabled = ignoredForDryWeb;
  phaseAVerticalLabel.dataset.ignored = String(ignoredForDryWeb);
  phaseAVerticalLabel.title = ignoredForDryWeb
    ? "Dry WebではBase内部のretained verticalを生成しません"
    : "表示用のbase-volume vertical supportsを切り替えます";
  phaseAVerticalText.textContent = ignoredForDryWeb
    ? "base-volume vertical supports ignored（Dry Web）"
    : "base-volume vertical supports ON";
}
phaseAVerticalInput.addEventListener("change", () => {
  phaseASupportSettings.baseVolumeVerticalSupports = phaseAVerticalInput.checked;
  clearStage7CanonicalCandidateAdoption();
  if (stage7ProvisionalRecheckIsActive() || stage7ProvisionalRecheckResult) {
    clearStage7ProvisionalRecheck("Stage 4 settingsが変わったため、仮Graph比較を破棄しました。", "stale");
  }
  refreshPhaseASupportPreview();
});
phaseAVerticalLabel.append(phaseAVerticalInput, phaseAVerticalText);
phaseAControls.appendChild(phaseAVerticalLabel);
const phaseADryWebMinimumLabel = addPhaseANumberControl("Dry Web minimum diameter", "dryWebMinimumDiameterMm", 0.8, 4, 0.1, "mm");
const phaseADryWebMaximumLabel = addPhaseANumberControl("Dry Web maximum unreinforced", "dryWebMaximumUnreinforcedLengthMm", 4, 30, 1, "mm");
phaseADryWebMinimumLabel.dataset.owner = "artwork-dry-web";
phaseADryWebMaximumLabel.dataset.owner = "artwork-dry-web";

const phaseADryWebArtworkControls = document.createElement("section");
phaseADryWebArtworkControls.className = "phase-a-support-controls phase-a-dry-web-artwork-controls";
phaseADryWebArtworkControls.dataset.owner = "artwork-dry-web";
phaseADryWebArtworkControls.dataset.role = "artwork-dry-web-physical-settings";
const phaseADryWebTitle = document.createElement("strong");
phaseADryWebTitle.textContent = "Artwork Dry Web physical settings";
const phaseADryWebHint = document.createElement("div");
phaseADryWebHint.className = "hint";
phaseADryWebHint.textContent = "作品として残るInternal Structureの物理設定です。Removable Print Supportの支持林設定とは別に保持します。";
phaseADryWebArtworkControls.append(phaseADryWebTitle, phaseADryWebHint, phaseADryWebMinimumLabel, phaseADryWebMaximumLabel);
const phaseADryWebStageBody = ui.root.querySelector<HTMLElement>("#skin-stage-4-body");
if (phaseADryWebStageBody) phaseADryWebStageBody.appendChild(phaseADryWebArtworkControls);
else ui.root.appendChild(phaseADryWebArtworkControls);

const phaseASupportStatus = document.createElement("p");
phaseASupportStatus.className = "phase-a-support-status";
phaseASupportStatus.textContent = "工程7でInternal Structureを生成・確認した後に使います";
const phaseARefreshButton = document.createElement("button");
phaseARefreshButton.type = "button";
phaseARefreshButton.className = "phase-a-support-refresh";
phaseARefreshButton.textContent = "Internal Structureを確認して印刷用サポートpreview生成";
phaseARefreshButton.disabled = true;
let phaseASupportPreviewRequested = false;
phaseARefreshButton.addEventListener("click", () => {
  const graph = getInternalStructureGraph();
  if (!graph?.edges.length || !surfaceAngleCache || !overhangSupportResult) {
    phaseASupportStatus.textContent = "先に工程7でInternal Structureを生成・確認してください";
    return;
  }
  const separationBlockReason = dryWebSupportSeparationOutputBlockReason(
    state.skinParams.internalStructure,
    dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null,
  );
  if (separationBlockReason) {
    phaseASupportStatus.textContent = separationBlockReason;
    phaseASupportStatus.dataset.stale = "true";
    delete phaseASupportStatus.dataset.ok;
    return;
  }
  phaseASupportPreviewRequested = true;
  refreshPhaseASupportPreview();
});
phaseASupportPanel.append(phaseATitle, phaseANote, phaseAControls, phaseARefreshButton, phaseASupportStatus);
const phaseASupportStageBody = ui.root.querySelector<HTMLElement>("#skin-stage-8-body");
if (phaseASupportStageBody) phaseASupportStageBody.appendChild(phaseASupportPanel);
else ui.root.appendChild(phaseASupportPanel);
syncPhaseAVerticalControl();

rightPaneBody.appendChild(ui.root);
leftPaneBody.appendChild(ui.displayToolsRoot);
let refreshSkinRebuildAxomeRollControl = () => {};
if (isSkinRebuildApp) {
  const printPlateControl = document.createElement("section");
  printPlateControl.className = "skin-rebuild-print-plate-control";
  const selectionControl = document.createElement("section");
  selectionControl.className = "skin-rebuild-viewport-selection-control";
  const selectionTitle = document.createElement("strong");
  selectionTitle.textContent = "メイン画面の選択対象";
  const selectionChoices = document.createElement("div");
  selectionChoices.className = "skin-rebuild-viewport-selection-choices";
  const patternSelectionLabel = document.createElement("label");
  const patternSelectionInput = document.createElement("input");
  patternSelectionInput.type = "radio";
  patternSelectionInput.name = "skin-rebuild-viewport-selection";
  patternSelectionInput.value = "pattern";
  patternSelectionInput.checked = true;
  patternSelectionInput.setAttribute("aria-label", "表面パターンを選択");
  patternSelectionLabel.append(patternSelectionInput, document.createTextNode(" 表面パターン"));
  const latticeSelectionLabel = document.createElement("label");
  const latticeSelectionInput = document.createElement("input");
  latticeSelectionInput.type = "radio";
  latticeSelectionInput.name = "skin-rebuild-viewport-selection";
  latticeSelectionInput.value = "lattice-edge";
  latticeSelectionInput.setAttribute("aria-label", "蜘蛛ラティス線と赤面を選択");
  latticeSelectionLabel.append(latticeSelectionInput, document.createTextNode(" 蜘蛛ラティス線＋赤面"));
  selectionChoices.append(patternSelectionLabel, latticeSelectionLabel);
  const selectionStatus = document.createElement("small");
  selectionStatus.className = "hint skin-rebuild-viewport-selection-status";
  selectionStatus.setAttribute("aria-live", "polite");
  const regionDragLabel = document.createElement("label");
  regionDragLabel.className = "row skin-rebuild-region-drag-toggle";
  const regionDragInput = document.createElement("input");
  regionDragInput.type = "checkbox";
  regionDragInput.setAttribute("aria-label", "赤面エリアをドラッグで複数選択");
  regionDragLabel.append(regionDragInput, document.createTextNode(" 赤面エリアを四角形でドラッグ選択"));
  const regionSelectionHint = document.createElement("small");
  regionSelectionHint.className = "hint";
  regionSelectionHint.textContent = "Shift+クリックで追加、Ctrl+クリックで除外。ドラッグ選択ONでは黄色い四角形に少しでも入った赤面をまとめて選びます。";
  selectionControl.append(selectionTitle, selectionChoices, regionDragLabel, regionSelectionHint, selectionStatus);
  const printPlateLabel = document.createElement("label");
  printPlateLabel.className = "row";
  const printPlateToggle = document.createElement("input");
  printPlateToggle.type = "checkbox";
  printPlateToggle.checked = true;
  printPlateToggle.setAttribute("aria-label", "印刷プレート面を表示");
  printPlateLabel.append(printPlateToggle, document.createTextNode(" 印刷プレート面を表示"));
  const axomeRollControl = document.createElement("div");
  axomeRollControl.className = "skin-rebuild-axome-roll-control";
  const axomeRollTitle = document.createElement("strong");
  axomeRollTitle.textContent = "Axome roll調整";
  const axomeRollRow = document.createElement("div");
  axomeRollRow.className = "skin-rebuild-axome-roll-row";
  const axomeRollInput = document.createElement("input");
  axomeRollInput.type = "range";
  axomeRollInput.min = "-180";
  axomeRollInput.max = "180";
  axomeRollInput.step = "1";
  axomeRollInput.value = "0";
  axomeRollInput.setAttribute("aria-label", "Axome roll角度");
  const axomeRollOutput = document.createElement("output");
  axomeRollOutput.textContent = "0°";
  const axomeLevelButton = document.createElement("button");
  axomeLevelButton.type = "button";
  axomeLevelButton.textContent = "水平に戻す";
  axomeLevelButton.title = "現在のAxome視線のまま印刷プレートを画面上で水平にします";
  const axomeRollHint = document.createElement("small");
  axomeRollHint.className = "hint";
  axomeRollHint.textContent = "選択中のAxome camera.upだけを調整します。モデル・プレート座標・書き出しは変わりません。";
  axomeRollRow.append(axomeRollInput, axomeRollOutput, axomeLevelButton);
  axomeRollControl.append(axomeRollTitle, axomeRollRow, axomeRollHint);
  const spiderLatticeLabel = document.createElement("label");
  spiderLatticeLabel.className = "row";
  const spiderLatticeToggle = document.createElement("input");
  spiderLatticeToggle.type = "checkbox";
  spiderLatticeToggle.checked = true;
  spiderLatticeToggle.setAttribute("aria-label", "クモの巣ラティスを表示");
  spiderLatticeLabel.append(spiderLatticeToggle, document.createTextNode(" クモの巣ラティスを表示"));
  const printSupportLabel = document.createElement("label");
  printSupportLabel.className = "row";
  const printSupportToggle = document.createElement("input");
  printSupportToggle.type = "checkbox";
  printSupportToggle.checked = true;
  printSupportToggle.setAttribute("aria-label", "印刷サポートを表示");
  printSupportLabel.append(printSupportToggle, document.createTextNode(" 印刷サポートを表示（橙）"));
  const overhangLabel = document.createElement("label");
  overhangLabel.className = "row";
  const overhangToggle = document.createElement("input");
  overhangToggle.type = "checkbox";
  overhangToggle.checked = true;
  overhangToggle.setAttribute("aria-label", "オーバーハング危険面を表示");
  overhangLabel.append(overhangToggle, document.createTextNode(" オーバーハング危険面を表示（赤／補強済みは緑）"));
  const printPlateHint = document.createElement("small");
  printPlateHint.className = "hint";
  printPlateHint.textContent = "表示専用です。赤=未補強、緑=蜘蛛補強済み、水色=補強部材です。危険面診断はスライサーの完全な再現ではありません。";
  printPlateControl.append(selectionControl, printPlateLabel, axomeRollControl, spiderLatticeLabel, printSupportLabel, overhangLabel, printPlateHint);
  ui.displayToolsRoot.insertBefore(printPlateControl, ui.displayToolsRoot.children[1] ?? null);
  skinRebuildViewportSelectionStatus = selectionStatus;
  skinRebuildSpiderLatticeToggle = spiderLatticeToggle;
  patternSelectionInput.onchange = () => {
    if (patternSelectionInput.checked) setSkinRebuildViewportSelectionMode("pattern");
  };
  latticeSelectionInput.onchange = () => {
    if (latticeSelectionInput.checked) setSkinRebuildViewportSelectionMode("lattice-edge");
  };
  regionDragInput.onchange = () => {
    skinRebuildRegionDragSelectEnabled = regionDragInput.checked;
    viewport.classList.toggle("skin-rebuild-region-drag-pick-mode", skinRebuildRegionDragSelectEnabled);
    refreshSkinRebuildViewportSelectionStatus();
  };
  printPlateToggle.onchange = () => skinRenderer.setPrintPlateVisible(printPlateToggle.checked);
  refreshSkinRebuildAxomeRollControl = () => {
    const roll = skinRenderer.selectedAxomeRollDegrees();
    const available = roll != null && Number.isFinite(roll);
    axomeRollInput.disabled = !available;
    axomeLevelButton.disabled = !available;
    axomeRollControl.classList.toggle("is-disabled", !available);
    if (available) {
      const rounded = Math.round(roll);
      axomeRollInput.value = String(rounded);
      axomeRollOutput.value = `${rounded}°`;
      axomeRollOutput.textContent = `${rounded}°`;
    } else {
      axomeRollOutput.value = "Axomeを選択";
      axomeRollOutput.textContent = "Axomeを選択";
    }
  };
  axomeRollInput.oninput = () => {
    skinRenderer.setSelectedAxomeRollDegrees(Number(axomeRollInput.value), true);
    refreshSkinRebuildAxomeRollControl();
  };
  axomeLevelButton.onclick = () => {
    skinRenderer.setSelectedAxomeRollDegrees(0, true);
    refreshSkinRebuildAxomeRollControl();
  };
  spiderLatticeToggle.onchange = () => skinRenderer.setInternalStructureVisible(spiderLatticeToggle.checked);
  printSupportToggle.onchange = () => skinRenderer.setPrintSupportVisible(printSupportToggle.checked);
  overhangToggle.onchange = () => skinRenderer.setSkinRebuildOverhangVisible(overhangToggle.checked);
  skinRenderer.setPrintPlateVisible(true);
  refreshSkinRebuildAxomeRollControl();
  refreshSkinRebuildViewportSelectionStatus();
  installSkinRebuildPipelinePanel();
}

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
  return fkeiShapeFingerprint(state);
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

/** Stage 4 Dry Web authoring must not present removable outside/scaffold
 * triangles as if they were artwork integration.  Keep the classification
 * ledger and user visibility settings intact; a later Stage 7/8 toggle calls
 * refreshOverhangSupportSiteOverlay() and can show the preserved overlay. */
function hideRemovableSupportOverlayForDryWeb(): void {
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  dryWebAuthorIntegrationPresentation = true;
  skinRenderer.clearOverhangSupportSiteOverlay();
  const result = overhangSupportResult;
  ui.setOverhangSupportSiteOverlay(
    Boolean(result && surfaceAngleCache),
    false,
    false,
    false,
    supportSiteDepthMode,
    result
      ? "Dry Web統合表示中 · outside / scaffold表示を隠しています（ledgerは保持）"
      : "Dry Web統合表示中 · outside / scaffold表示を隠しています",
    undefined,
  );
}

function refreshOverhangSupportSiteOverlay(): void {
  if (dryWebInsideTargetOverlayVisible) return;
  if (dryWebAuthorIntegrationPresentation) {
    hideRemovableSupportOverlayForDryWeb();
    return;
  }
  const result = overhangSupportResult;
  const diagnosis = surfaceAngleCache;
  if (!result || !diagnosis) {
    skinRenderer.clearOverhangSupportSiteOverlay();
    ui.setOverhangSupportSiteOverlay(false, showOverhangSupportSites, showMixedSupportFaces, showSupportFootprint, supportSiteDepthMode, "支持点は未診断");
    return;
  }
  if (!showOverhangSupportSites && !showMixedSupportFaces) {
    skinRenderer.clearOverhangSupportSiteOverlay();
    const ok = result.counts.unresolvedSupportSite === 0
      && result.counts.duplicateSupportSite === 0;
    ui.setOverhangSupportSiteOverlay(
      true,
      false,
      false,
      showSupportFootprint,
      supportSiteDepthMode,
      overhangSupportCountsText(result),
      ok,
    );
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
  const markers = showOverhangSupportSites
    ? (() => {
      const drawableEntries = result.entries.filter((entry) => entry.positionMm && !entry.duplicateOf);
      // Editing stays a low-to-medium density preview. Saved normalized strokes
      // are reprojected to every high-resolution site by the export Worker.
      const previewStride = Math.max(1, Math.ceil(drawableEntries.length / 40_000));
      return drawableEntries.flatMap((entry, index) => {
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
    })()
    : [];
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
    && !dryWebPreviewPending
    && surfaceAngleCache
    && phaseADryWebPreview.surfaceFingerprint === currentTargetSurfaceFingerprint()
    && phaseADryWebPreview.resolution === surfaceAngleCache.resolution
    && phaseADryWebPreview.paintRevision === supportPaintSession.revision
    && phaseADryWebPreview.artworkGraphSnapshot === artworkGraphSnapshot
    && phaseADryWebPreview.artworkGraphSourceKey === artworkGraphSourceKey
    && currentDryWebArtworkGraphBoundary().status === "current",
  );
}

function currentDryWebContactFacts(): TargetedGridContactFacts | undefined {
  if (state.skinParams.internalStructure !== "targetedGrid" || !dryWebPreviewIsCurrent()) return undefined;
  const graph = phaseADryWebPreview?.graph;
  if (!graph || graph.kind !== "targetedGrid") return undefined;
  return (graph.stats as TargetedGridInternalStructureStats).dryWebContactFacts;
}

function currentDryWebInsufficientEdgePresentation(): DryWebInsufficientEdgePresentation {
  const targeted = state.skinParams.internalStructure === "targetedGrid";
  const running = targeted && dryWebInsideTargetRunActive();
  const current = targeted && dryWebPreviewIsCurrent();
  const graph = current && phaseADryWebPreview?.graph?.kind === "targetedGrid"
    ? phaseADryWebPreview.graph
    : null;
  return createDryWebInsufficientEdgePresentation({
    current,
    running,
    stale: targeted && Boolean(phaseADryWebPreview) && !current,
    graph,
    contactFacts: current ? currentDryWebContactFacts() ?? null : null,
    requiredContacts: state.skinParams.dryWebRequiredContacts,
    targetConnectionFacts: current ? phaseADryWebPreview?.targetConnectionFacts ?? null : null,
    targetSourceCount: current ? targetedSupportSource?.targets.length : undefined,
    surfaceContextVisible: (viewMode === "beads" || viewMode === "mesh") && internalObservationMode !== "internalOnly",
  });
}

function currentDryWebContactFloorPresentation(): DryWebContactFloorPresentation {
  const targeted = state.skinParams.internalStructure === "targetedGrid";
  const current = targeted && dryWebPreviewIsCurrent();
  return createDryWebContactFloorPresentation({
    current,
    running: targeted && dryWebInsideTargetRunActive(),
    stale: targeted && Boolean(phaseADryWebPreview) && !current,
    facts: current ? phaseADryWebPreview?.contactFloorFacts ?? null : null,
    contactFacts: current ? currentDryWebContactFacts() ?? null : null,
    requiredContacts: state.skinParams.dryWebRequiredContacts,
  });
}

function currentDryWebContactFloorOverlayPresentation(): DryWebContactFloorOverlayPresentation {
  const targeted = state.skinParams.internalStructure === "targetedGrid";
  const current = targeted && dryWebPreviewIsCurrent();
  return createDryWebContactFloorOverlayPresentation({
    current,
    running: targeted && dryWebInsideTargetRunActive(),
    stale: targeted && Boolean(phaseADryWebPreview) && !current,
    surfaceContextVisible: internalObservationMode !== "internalOnly",
    snapshot: current ? artworkGraphSnapshot : null,
    contactFloor: current ? currentDryWebContactFloorPresentation() : null,
    category: dryWebContactFloorOverlayVisible,
    enabled: dryWebContactFloorOverlayVisible !== null,
  });
}

/** Claim the visible bead palette for an explicit non-Dry-Web diagnostic.
 * Keeping the owner in main.ts lets the legend follow the same decision as
 * the renderer, even when the competing diagnostic only refreshes an existing
 * bead mesh and does not change the generated graph. */
function claimCompetingDryWebPresentation(owner: Exclude<DryWebContactPresentationOwner, "none" | "dryWeb">): void {
  releaseDryWebInsideTargetOverlayForCompetingView();
  dryWebContactPresentationOwner = owner;
  skinRenderer.updateDryWebContactPresentation(null, state.skinParams.dryWebRequiredContacts);
  // A current facts report may still be useful as text, but its color legend
  // must not describe the competing palette now on screen.
  if (currentDryWebContactFacts()) refreshDryWebActions();
}

function releaseCompetingDryWebPresentation(owner: Exclude<DryWebContactPresentationOwner, "none" | "dryWeb">): void {
  if (dryWebContactPresentationOwner !== owner) return;
  dryWebContactPresentationOwner = "none";
  refreshDryWebActions();
}

/** Keep the author-facing 3D contact palette derived from the current graph
 * facts. The threshold is an interpretation-only change, so this is a cheap
 * recolor; no Dry Web worker, graph rebuild, or output geometry is involved.
 * Bead view is the uncapped 3D representation that can retain patch identity
 * (the raymarch shader intentionally has no per-patch color lookup). */
function syncDryWebContactVisualization(facts = currentDryWebContactFacts()): void {
  if (!facts || !dryWebContactPresentationCanReapply(dryWebContactPresentationOwner)) {
    if (!facts) dryWebContactPresentationOwner = "none";
    skinRenderer.updateDryWebContactPresentation(null, state.skinParams.dryWebRequiredContacts);
    return;
  }
  dryWebContactPresentationOwner = "dryWeb";
  skinRenderer.updateDryWebContactPresentation(
    facts,
    state.skinParams.dryWebRequiredContacts,
  );
  const preservedViewState = preserveDryWebGraphViewState({ viewMode, internalObservationMode });
  if (preservedViewState.viewMode !== viewMode) setViewMode(preservedViewState.viewMode);
  if (preservedViewState.internalObservationMode !== internalObservationMode) {
    setInternalObservationMode(preservedViewState.internalObservationMode);
  }
}

type DryWebPreviewProgress = Extract<DryWebPreviewWorkerMessage, { type: "progress" }>;

function clearDryWebPreviewStartTimer(): void {
  if (dryWebPreviewStartTimer !== null) window.clearTimeout(dryWebPreviewStartTimer);
  dryWebPreviewStartTimer = null;
}

function terminateDryWebExactRecheck(): void {
  dryWebExactRecheckGeneration++;
  const worker = activeDryWebExactRecheckWorker;
  activeDryWebExactRecheckWorker = null;
  if (!worker) return;
  worker.onmessage = null;
  worker.onerror = null;
  if (activeSurfaceAngleWorker === worker) activeSurfaceAngleWorker = null;
  worker.terminate();
}

function dryWebSupportSeparationIsCurrent(): boolean {
  return Boolean(
    state.skinParams.internalStructure === "targetedGrid"
    && dryWebSupportSeparation?.state === "current"
    && dryWebSupportSeparationSource === surfaceAngleCache
    && dryWebPreviewIsCurrent(),
  );
}

function currentDryWebExactRecheckPresentation(): DryWebExactRecheckPresentation {
  const targeted = state.skinParams.internalStructure === "targetedGrid";
  const graph = phaseADryWebPreview?.graph ?? null;
  const boundary = currentDryWebArtworkGraphBoundary();
  return createDryWebExactRecheckPresentation({
    targetedGrid: targeted,
    graphCurrent: targeted && dryWebPreviewIsCurrent(),
    graphKind: graph?.kind ?? null,
    stage3BoundaryCurrent: boundary.status === "current",
    hasGraph: phaseADryWebPreview !== null,
    exactFactsCurrent: targeted && dryWebSupportSeparationIsCurrent(),
    runActive: dryWebInsideTargetRunActive(),
  });
}

function currentStage7RedFaceLocatorPresentation(): Stage7RedFaceLocatorPresentation {
  const targeted = state.skinParams.internalStructure === "targetedGrid";
  const running = targeted && canonicalDryWebOrSurfaceRunIsActive();
  const current = targeted && dryWebSupportSeparationIsCurrent();
  // A current generator graph without an exact result is a missing Stage 7
  // fact, not an old red-face result. Only a previously published exact
  // separation can make the locator stale.
  const stale = targeted && Boolean(dryWebSupportSeparation) && !current;
  return createStage7RedFaceLocatorPresentation({
    current,
    running,
    stale,
    separation: current ? dryWebSupportSeparation : null,
    afterDangerPositions: current ? dryWebSupportSeparationSource?.afterDangerPositions ?? null : null,
  });
}

function currentStage7RedFaceDryWebCandidatePresentation(): Stage7RedFaceDryWebCandidatePresentation {
  const targetedGrid = state.skinParams.internalStructure === "targetedGrid";
  const graphCurrent = targetedGrid && dryWebPreviewIsCurrent();
  const exactCurrent = targetedGrid && dryWebSupportSeparationIsCurrent();
  const locator = currentStage7RedFaceLocatorPresentation();
  const graph = graphCurrent && phaseADryWebPreview?.graph?.kind === "targetedGrid"
    ? phaseADryWebPreview.graph
    : null;
  return createStage7RedFaceDryWebCandidatePresentation({
    current: graphCurrent && exactCurrent,
    targetedGrid,
    running: targetedGrid && canonicalDryWebOrSurfaceRunIsActive(),
    stale: targetedGrid && Boolean(dryWebSupportSeparation) && (!graphCurrent || !exactCurrent),
    redFaceLocator: locator,
    graph,
  });
}

function stage7RedFaceCandidateFaceIds(candidates: readonly Stage7RedFaceDryWebCandidate[]): number[] {
  return candidates.map((candidate) => candidate.faceId);
}

function sameStage7RedFaceCandidateOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((faceId, index) => faceId === b[index]);
}

const PATCH_6_EXPLICIT_TOPOLOGY_REPAIR = Object.freeze({
  // Source-space geometry is canonical. The validation scale below is kept
  // only as read-only provenance; current readiness measures this same
  // geometry against the current Surface-derived scale.
  validationScaleMmPerUnit: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT,
  radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS,
  nodes: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES,
  edges: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES,
  topologyEvidence: Object.freeze({
    resolution: 128,
    baselineComponents: 2,
    provisionalComponents: 1,
    closed: true,
    openEdges: 0,
    nonManifoldEdges: 0,
    degenerateTriangles: 0,
    nonFiniteTriangles: 0,
    windingAfterRepair: 0,
    baselineUnsupportedNodes: 59,
    provisionalUnsupportedNodes: 59,
    baselineUnsupportedEdges: 59,
    provisionalUnsupportedEdges: 59,
    baselineOverlongBridges: 1,
    provisionalOverlongBridges: 1,
    baselineMaxObservedBridgeMm: 5.0017992063047645,
    provisionalMaxObservedBridgeMm: 5.0017992063047645,
  }),
});

function currentExplicitTopologyRepairIdentity(): ExplicitTopologyRepairIdentity | null {
  const preview = phaseADryWebPreview;
  const graph = preview?.graph ?? null;
  // Bind the candidate to the producer-owned identities recorded by the
  // accepted Dry Web/exact results. Do not reconstruct these fields from the
  // current UI: readiness must be able to detect producer/current drift.
  const surfaceIdentity = dryWebSupportSeparationSource;
  const dryWebIdentity = preview;
  const artworkGraphIdentity = preview?.artworkGraphSnapshot ?? null;
  const targetedSupportSourceIdentity = targetedSupportSource;
  if (!graph || !surfaceIdentity || !dryWebIdentity || !artworkGraphIdentity || !targetedSupportSourceIdentity) return null;
  return {
    canonicalGraphIdentity: graph,
    surfaceIdentity,
    dryWebIdentity,
    artworkGraphIdentity,
    targetedSupportSourceIdentity,
    paintRevision: preview.paintRevision,
    surfaceFingerprint: preview.surfaceFingerprint,
    resolution: preview.resolution,
    mode: state.mode,
    supportSettingsKey: JSON.stringify(phaseASupportSettings),
  };
}

function currentExplicitTopologyRepairCurrentness(): ExplicitTopologyRepairCurrentness | null {
  const graph = phaseADryWebPreview?.graph ?? null;
  const surfaceIdentity = surfaceAngleCache;
  const dryWebIdentity = phaseADryWebPreview;
  const artworkGraphIdentity = artworkGraphSnapshot;
  const targetedSupportSourceIdentity = targetedSupportSource;
  if (!graph || !surfaceIdentity || !dryWebIdentity || !artworkGraphIdentity || !targetedSupportSourceIdentity) return null;
  return {
    canonicalGraphIdentity: graph,
    surfaceIdentity,
    dryWebIdentity,
    artworkGraphIdentity,
    targetedSupportSourceIdentity,
    paintRevision: supportPaintSession.revision,
    surfaceFingerprint: currentTargetSurfaceFingerprint(),
    resolution: Math.max(16, Math.round(ui.getMeshOptions().resolution)),
    mode: state.mode,
    supportSettingsKey: JSON.stringify(phaseASupportSettings),
  };
}

function currentPatch6ExplicitTopologyRepairSurfaceContext(): {
  readonly patches: Patch[];
  readonly surfaceSdf: (point: { x: number; y: number; z: number }) => number;
} | null {
  if (state.host.length === 0 || state.patches.length === 0) return null;
  const reinforced = reinforceQuadConnectionsForMesh(state.patches, state.skinParams.quadMeshJoinWidth);
  const evaluate = createCompositeSdfEvaluator(
    state.mode,
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    reinforced.patches,
    state.skinParams.roundK,
    state.skinParams.coinBulge,
    state.skinParams.coinBulgeBalance,
  );
  return {
    patches: reinforced.patches,
    surfaceSdf: (point) => evaluate(point.x, point.y, point.z),
  };
}

function currentPatch6ExplicitTopologyRepairEndpointOverlaps(
  scaleMmPerUnit: number | undefined,
  finalSurfacePatches: Patch[] | null,
): ExplicitTopologyRepairEndpointOverlap[] {
  const endpointPairs = [
    { patchId: 6, endpointNodeId: 2471 },
    { patchId: 22, endpointNodeId: 2474 },
  ];
  return endpointPairs.map(({ patchId, endpointNodeId }) => {
    const node = PATCH_6_EXPLICIT_TOPOLOGY_REPAIR.nodes.find((candidate) => candidate.id === endpointNodeId);
    const patch = finalSurfacePatches?.find((candidate) => candidate.id === patchId);
    const sdf = node && patch && typeof scaleMmPerUnit === "number" && Number.isFinite(scaleMmPerUnit) && scaleMmPerUnit > 0
      ? patchesSdf([patch], state.skinParams.roundK, node.position.x, node.position.y, node.position.z)
      : Number.NaN;
    return {
      patchId,
      endpointNodeId,
      overlapMm: Number.isFinite(sdf) && typeof scaleMmPerUnit === "number"
        ? Math.max(0, -sdf * scaleMmPerUnit)
        : Number.NaN,
    };
  });
}

function currentPatch6ExplicitTopologyRepairReadiness(): ExplicitTopologyRepairReadiness {
  const currentGraph = phaseADryWebPreview?.graph ?? null;
  const currentScale = currentPrintScaleMmPerUnit();
  const targetSourceCurrent = state.skinParams.internalStructure === "targetedGrid"
    && targetedSupportSourceIsCurrent();
  const producerBindingsCurrent = targetSourceCurrent
    && dryWebPreviewIsCurrent()
    && currentDryWebArtworkGraphBoundary().status === "current"
    && dryWebSupportSeparationIsCurrent()
    && dryWebSupportSeparationSource === surfaceAngleCache;
  const finalSurface = producerBindingsCurrent ? currentPatch6ExplicitTopologyRepairSurfaceContext() : null;
  return evaluateExplicitTopologyRepairReadiness({
    baselineGraph: currentGraph,
    candidateNodes: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR.nodes,
    candidateEdges: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR.edges,
    identity: currentExplicitTopologyRepairIdentity(),
    currentness: producerBindingsCurrent ? currentExplicitTopologyRepairCurrentness() : null,
    exactCurrent: producerBindingsCurrent,
    unresolvedFaceCount: producerBindingsCurrent
      ? dryWebSupportSeparation?.unresolvedFaceCount ?? null
      : null,
    currentScaleMmPerUnit: currentScale,
    targetLongestMm: ui.getMeshOptions().targetLongestMm,
    validationScaleMmPerUnit: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT,
    surfaceSdf: finalSurface?.surfaceSdf ?? null,
    endpointOverlaps: currentPatch6ExplicitTopologyRepairEndpointOverlaps(currentScale, finalSurface?.patches ?? null),
  });
}

function explicitTopologyRepairBindingIsCurrent(binding: Stage7RedFaceReinforcementPlanBinding): boolean {
  if (binding.source !== "explicit-topology-repair" || !binding.explicitIdentity) return false;
  const current = currentExplicitTopologyRepairIdentity();
  return current !== null
    && explicitTopologyRepairPlanIsCurrent(binding.explicitIdentity, current)
    && currentDryWebArtworkGraphBoundary().status === "current"
    && dryWebPreviewIsCurrent();
}

/** A provisional plan is valid only while every source boundary it observed
 * remains the exact object/value it planned from. It is never canonical graph
 * state and therefore has no graph fingerprint or history entry. */
function currentStage7RedFaceReinforcementPlan(
  candidatePresentation: Stage7RedFaceDryWebCandidatePresentation,
): Stage7RedFaceReinforcementPlan | null {
  const planBinding = stage7RedFaceReinforcementPlan;
  if (!planBinding) return null;
  const currentGraph = phaseADryWebPreview?.graph ?? null;
  const currentExactSource = dryWebSupportSeparationSource;
  const currentScale = currentPrintScaleMmPerUnit();
  const currentFaceIds = stage7RedFaceCandidateFaceIds(candidatePresentation.candidates);
  const candidateStillCurrent = candidatePresentation.state === "current"
    || (stage7ProvisionalRecheckIsActive() && candidatePresentation.state === "running");
  const sourceCurrent = planBinding.source === "explicit-topology-repair"
    ? explicitTopologyRepairBindingIsCurrent(planBinding)
    : candidateStillCurrent
      && candidatePresentation.enabled
      && sameStage7RedFaceCandidateOrder(currentFaceIds, planBinding.candidateFaceIds);
  const current = sourceCurrent
    && currentGraph === planBinding.sourceGraph
    && currentExactSource === planBinding.exactSource
    && dryWebSupportSeparationIsCurrent()
    && Number.isFinite(currentScale)
    && currentScale === planBinding.scaleMmPerUnit
    && phaseASupportSettings.dryWebMinimumDiameterMm === planBinding.targetDiameterMm
    && planBinding.plan.state === "current"
    && planBinding.plan.graph !== null;
  if (!current) {
    clearStage7ProvisionalRecheck("仮Graph計画のsource/settingsが変わったため、比較を破棄しました。", "stale");
    stage7RedFaceReinforcementPlan = null;
    stage7RedFaceReinforcementPlanMessage = null;
    return null;
  }
  return planBinding.plan;
}

function stage7ProvisionalRecheckIsActive(): boolean {
  return Boolean(
    activeStage7ProvisionalRecheckWorker
    || stage7ProvisionalRecheckHeavyComputation
    || stage7ProvisionalRecheckRunBinding,
  );
}

/** Canonical work is kept separate from the provisional comparison worker. */
function canonicalDryWebOrSurfaceRunIsActive(): boolean {
  return Boolean(
    activeDryWebPreviewWorker
    || activeDryWebExactRecheckWorker
    || dryWebPreviewHeavyComputation
    || activeSurfaceAngleWorker
    || activeSurfaceSupportClassificationWorker
    || surfaceHeavyComputation
    || supportPaintDrag
    || supportPaintApplyReplacePending > 0
    || (activeSupportPaintWorker && !supportPaintApplyWorkerReady)
  );
}

/** Adoption must never replace or snapshot state while any competing work is live. */
function stage7CanonicalCandidateAdoptionCompetingWorkIsActive(): boolean {
  return Boolean(
    activeHeavyComputation
    || activeDryWebPreviewWorker
    || activeDryWebExactRecheckWorker
    || dryWebPreviewHeavyComputation
    || activeSurfaceAngleWorker
    || activeSurfaceSupportClassificationWorker
    || surfaceHeavyComputation
    || activePreviewMeshWorker
    || previewMeshHeavyComputation
    || activeGaugeWorker
    || gaugeDebounceTimer !== null
    || activeMeshExportWorker
    || activePrintCheckMeshWorker
    || activeInternalPrintGateWorker
    || internalPrintGateHeavyComputation
    || activeBambu3mfWorker
    || activeSupportPaintReprojectionWorker
    || supportPaintReprojectionHeavyComputation
    || supportPaintDrag
    || supportPaintApplyReplacePending > 0
    || (activeSupportPaintWorker && !supportPaintApplyWorkerReady)
    || activeSupportPaintRaycastWorker && !supportPaintRaycastReady
    || supportPaintRaycastHeavyComputation
    || activeOpeningMapWorker
    || openingMapHeavyComputation
    || activePartitionWorker
    || partitionHeavyComputation
    || activeNPartitionWorker
    || nPartitionHeavyComputation
    || activeStage7ProvisionalRecheckWorker
    || stage7ProvisionalRecheckHeavyComputation
  );
}

function stage7ProvisionalSeparationCounts(
  separation: DryWebSupportSeparationPresentation,
): { teal: number; orange: number; red: number } {
  return {
    teal: separation.mitigatedFaceCount,
    orange: separation.outsideFaceCount,
    red: separation.unresolvedFaceCount,
  };
}

function stage7ProvisionalMeshStep(
  diagnosis: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
): number {
  const reinforced = reinforceQuadConnectionsForMesh(state.patches, state.skinParams.quadMeshJoinWidth);
  const bounds = computeSkinSamplingBounds(
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    reinforced.patches,
  );
  return bounds.longest > 0 ? bounds.longest / diagnosis.resolution : 1 / diagnosis.resolution;
}

const EMPTY_RISK_SEVERITY_DISTRIBUTION: Readonly<Record<RiskSeverity, number>> = Object.freeze({
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
});

function clearRiskDrivenInternalLatticePresentation(
  status: "missing" | "running" | "stale" | "disabled",
  reason: string,
): void {
  riskDrivenInternalLatticeFacts = null;
  riskDrivenInternalLatticeOverlayEnabled = false;
  skinRenderer.clearRiskDrivenInternalLatticeOverlay();
  ui.setRiskDrivenInternalLattice({
    available: false,
    enabled: false,
    status,
    clusterCount: 0,
    candidateCount: 0,
    severityDistribution: EMPTY_RISK_SEVERITY_DISTRIBUTION,
    riskyArea: null,
    topCandidate: null,
    reason,
  });
}

function updateRiskDrivenInternalLatticeUi(facts: RiskDrivenInternalLatticeFacts): void {
  ui.setRiskDrivenInternalLattice({
    available: true,
    enabled: riskDrivenInternalLatticeOverlayEnabled,
    status: "current",
    clusterCount: facts.clusters.length,
    candidateCount: facts.candidates.length,
    severityDistribution: facts.severityDistribution,
    riskyArea: facts.riskyArea,
    topCandidate: facts.candidates[0]
      ? {
        supportGain: facts.candidates[0].supportGain,
        requiredLatticeLength: facts.candidates[0].requiredLatticeLength,
      }
      : null,
    reason: facts.heuristicNote,
  });
}

/** Derive the read-only Checkpoint 1 facts from the accepted Surface result. */
function refreshRiskDrivenInternalLatticePresentation(): void {
  const diagnosis = surfaceAngleCache;
  if (!diagnosis) {
    clearRiskDrivenInternalLatticePresentation(
      "missing",
      "現在のSurface診断がありません。Surface診断完了後に表示できます。",
    );
    return;
  }
  let result: ReturnType<typeof deriveRiskDrivenInternalLattice>;
  try {
    result = deriveRiskDrivenInternalLattice({
      surfacePositions: diagnosis.basePositions,
      surfaceNormals: diagnosis.baseNormals,
      thresholdDeg: diagnosis.metrics.thresholdDeg,
      meshStep: stage7ProvisionalMeshStep(diagnosis),
      resolution: diagnosis.resolution,
    });
  } catch (error) {
    console.error("[SKIN Risk-Driven Internal Lattice] derivation failed", error);
    clearRiskDrivenInternalLatticePresentation(
      "disabled",
      "Risk Clusterを表示できません（Surface diagnosisデータが不正です）",
    );
    return;
  }
  if (result.status !== "current") {
    console.warn("[SKIN Risk-Driven Internal Lattice] disabled", result.reason);
    clearRiskDrivenInternalLatticePresentation(
      "disabled",
      "Risk Clusterを表示できません（Surface diagnosisデータが不正です）",
    );
    return;
  }
  riskDrivenInternalLatticeFacts = result;
  if (riskDrivenInternalLatticeOverlayEnabled) {
    skinRenderer.setRiskDrivenInternalLatticeOverlay(result, true);
  } else {
    skinRenderer.setRiskDrivenInternalLatticeOverlay(result, false);
  }
  updateRiskDrivenInternalLatticeUi(result);
}

function stage7ProvisionalRecheckBindingIsCurrent(binding: Stage7ProvisionalRecheckBinding): boolean {
  const candidatePresentation = currentStage7RedFaceDryWebCandidatePresentation();
  const plan = currentStage7RedFaceReinforcementPlan(candidatePresentation);
  const planBinding = stage7RedFaceReinforcementPlan;
  const currentGraph = phaseADryWebPreview?.graph ?? null;
  const currentExactSource = dryWebSupportSeparationSource;
  const currentBaseline = dryWebSupportSeparation;
  const currentDiagnosis = surfaceAngleCache;
  const currentScale = currentPrintScaleMmPerUnit();
  const currentSupportEntries = overhangSupportResult?.entries ?? null;
  const sourceIdentityCurrent = planBinding?.source === "explicit-topology-repair"
    ? explicitTopologyRepairBindingIsCurrent(planBinding)
    : sameStage7RedFaceCandidateOrder(
      stage7RedFaceCandidateFaceIds(candidatePresentation.candidates),
      binding.candidateFaceIds,
    );
  return state.skinParams.internalStructure === "targetedGrid"
    && plan === binding.plan
    && planBinding?.plan === binding.plan
    && sourceIdentityCurrent
    && currentGraph === binding.sourceGraph
    && currentDiagnosis === binding.baseDiagnosis
    && currentBaseline === binding.baselineSeparation
    && currentExactSource === binding.exactSource
    && dryWebSupportSeparationIsCurrent()
    && currentSupportEntries === binding.supportEntries
    && Number.isFinite(currentScale)
    && currentScale === binding.scaleMmPerUnit
    && phaseASupportSettings.dryWebMinimumDiameterMm === binding.targetDiameterMm
    && currentDiagnosis.metrics.thresholdDeg === binding.baseDiagnosis.metrics.thresholdDeg
    && stage7ProvisionalMeshStep(binding.baseDiagnosis) === binding.meshStep
    && state.mode === binding.mode;
}

function stage7ProvisionalRecheckMessageMatchesBinding(
  message: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
  binding: Stage7ProvisionalRecheckBinding,
): boolean {
  const sameFloat32 = (a: Float32Array, b: Float32Array): boolean =>
    a.length === b.length && a.every((value, index) => value === b[index]);
  const baselineBeforeDangerFaceCount = binding.exactSource.beforeDangerPositions.length / 9;
  const baselineAfterDangerFaceCount = binding.exactSource.afterDangerPositions.length / 9;
  const audit = message.recheckAudit;
  const auditMatches = audit !== undefined
    && audit.requestedMode === "delta"
    && audit.baselineBeforeDangerFaceCount === baselineBeforeDangerFaceCount
    && audit.baselineAfterDangerFaceCount === baselineAfterDangerFaceCount
    && ((audit.mode === "delta"
      && audit.monotonicProof === "passed"
      && audit.fallbackReason === undefined
      && audit.queryFaceCount === baselineAfterDangerFaceCount)
      || (audit.mode === "full"
        && (audit.monotonicProof === "passed" || audit.monotonicProof === "failed")
        && audit.fallbackReason !== undefined
        && audit.queryFaceCount === binding.baseDiagnosis.baseFaceCount));
  return message.resolution === binding.baseDiagnosis.resolution
    && message.baseFaceCount === binding.baseDiagnosis.baseFaceCount
    && message.internalEdgeCount === binding.plan.graph?.edges.length
    && message.metrics.thresholdDeg === binding.baseDiagnosis.metrics.thresholdDeg
    && auditMatches
    && sameFloat32(message.basePositions, binding.baseDiagnosis.basePositions)
    && sameFloat32(message.baseNormals, binding.baseDiagnosis.baseNormals)
    && message.beforeDangerPositions.length % 9 === 0
    && message.afterDangerPositions.length % 9 === 0
    && message.mitigatedPositions.length % 9 === 0;
}

function currentStage7ProvisionalRecheckPresentation(): Stage7ProvisionalRecheckPresentation {
  const result = stage7ProvisionalRecheckResult;
  const resultCurrent = result !== null && stage7ProvisionalRecheckBindingIsCurrent(result.binding);
  const candidatePresentation = currentStage7RedFaceDryWebCandidatePresentation();
  const currentPlan = currentStage7RedFaceReinforcementPlan(candidatePresentation);
  const actionReady = currentPlan !== null
    && state.skinParams.internalStructure === "targetedGrid"
    && surfaceAngleCache !== null
    && dryWebSupportSeparation !== null
    && dryWebSupportSeparationSource === surfaceAngleCache
    && overhangSupportResult !== null
    && !canonicalDryWebOrSurfaceRunIsActive()
    && !stage7ProvisionalRecheckIsActive();
  const stale = stage7ProvisionalRecheckTerminal === "stale"
    || (result !== null && !resultCurrent);
  const error = stage7ProvisionalRecheckTerminal === "error"
    ? stage7ProvisionalRecheckMessage
    : null;
  return createStage7ProvisionalRecheckPresentation({
    actionReady,
    running: stage7ProvisionalRecheckIsActive(),
    current: resultCurrent,
    stale,
    error,
    baseline: resultCurrent ? stage7ProvisionalSeparationCounts(result!.binding.baselineSeparation) : null,
    provisional: resultCurrent ? stage7ProvisionalSeparationCounts(result!.separation) : null,
    elapsedMs: stage7ProvisionalRecheckElapsedMs,
  });
}

function currentStage7ProvisionalAdoptionGatePresentation(): Stage7ProvisionalAdoptionGatePresentation {
  const comparison = currentStage7ProvisionalRecheckPresentation();
  const candidatePresentation = currentStage7RedFaceDryWebCandidatePresentation();
  const plan = currentStage7RedFaceReinforcementPlan(candidatePresentation);
  const result = stage7ProvisionalRecheckResult;
  const build = (approval: Stage7ProvisionalAdoptionGateApproval | null): Stage7ProvisionalAdoptionGatePresentation =>
    createStage7ProvisionalAdoptionGatePresentation({
      planIdentity: plan,
      resultIdentity: result,
      planCurrent: plan !== null,
      resultCurrent: result !== null && stage7ProvisionalRecheckBindingIsCurrent(result.binding),
      comparisonState: comparison.state,
      comparisonCurrent: comparison.current,
      comparisonStatus: comparison.status,
      approval: approval
        ? { planIdentity: approval.plan, resultIdentity: approval.result }
        : null,
    });
  let presentation = build(stage7ProvisionalAdoptionGateApproval);
  // An identity mismatch is a fail-closed invalidation, not a new pending
  // review. Recompute after dropping the stale volatile marker so a newly
  // current result can immediately show the explicit review action.
  if (stage7ProvisionalAdoptionGateApproval
    && presentation.state !== "author-approved-for-next-confirmation") {
    stage7ProvisionalAdoptionGateApproval = null;
    presentation = build(null);
  }
  return presentation;
}

function stage7CanonicalCandidateAdoptionIsCurrent(options: { clearStale?: boolean } = {}): boolean {
  const adoption = stage7CanonicalCandidateAdoption;
  if (!adoption || state.skinParams.internalStructure !== "targetedGrid") return false;
  const preview = phaseADryWebPreview;
  const currentResolution = Math.max(16, Math.round(ui.getMeshOptions().resolution));
  const currentScaleMmPerUnit = currentPrintScaleMmPerUnit();
  const current = Boolean(
    preview
    && preview.graph === adoption.graph
    && preview.targetConnectionFacts === null
    && preview.contactFloorFacts === null
    && preview.facts === null
    && internalStructureGraph === adoption.graph
    && surfaceAngleCache === adoption.surfaceAngleCache
    && preview.artworkGraphSnapshot === adoption.artworkGraphSnapshot
    && preview.artworkGraphSourceKey === adoption.artworkGraphSourceKey
    && artworkGraphSnapshot === adoption.artworkGraphSnapshot
    && artworkGraphSourceKey === adoption.artworkGraphSourceKey
    && preview.paintRevision === adoption.paintRevision
    && supportPaintSession.revision === adoption.paintRevision
    && preview.surfaceFingerprint === adoption.surfaceFingerprint
    && currentTargetSurfaceFingerprint() === adoption.surfaceFingerprint
    && preview.resolution === adoption.resolution
    && currentResolution === adoption.resolution
    && explicitTopologyRepairAdoptionScaleIsCurrent(adoption.scaleMmPerUnit, currentScaleMmPerUnit)
    && state.mode === adoption.mode
    && JSON.stringify(phaseASupportSettings) === adoption.supportSettingsKey
    && targetedSupportSource === adoption.targetedSupportSource
    && currentDryWebArtworkGraphBoundary().status === "current"
    && dryWebPreviewIsCurrent()
  );
  if (!current && options.clearStale !== false) stage7CanonicalCandidateAdoptionUndo = null;
  return current;
}

function stage7CanonicalCandidateAdoptionUndoIsCurrent(): boolean {
  const adoption = stage7CanonicalCandidateAdoption;
  const undo = stage7CanonicalCandidateAdoptionUndo;
  if (!adoption || !undo || !stage7CanonicalCandidateAdoptionIsCurrent()) return false;
  const current = dryWebSupportSeparation === null
    && dryWebSupportSeparationSource === null
    && surfaceAngleCache === adoption.surfaceAngleCache
    && !canonicalDryWebOrSurfaceRunIsActive();
  if (!current) stage7CanonicalCandidateAdoptionUndo = null;
  return current;
}

function currentStage7CanonicalCandidateAdoptionPresentation(): Stage7CanonicalCandidateAdoptionPresentation {
  const adoption = stage7CanonicalCandidateAdoption;
  const adoptionCurrent = stage7CanonicalCandidateAdoptionIsCurrent();
  return createStage7CanonicalCandidateAdoptionPresentation({
    approved: currentStage7ProvisionalAdoptionGatePresentation().state === "author-approved-for-next-confirmation",
    adopted: adoption !== null,
    adoptionCurrent,
    undoCurrent: adoptionCurrent && stage7CanonicalCandidateAdoptionUndoIsCurrent(),
    exactValidated: adoption?.exactValidated ?? false,
    competingWorkActive: stage7CanonicalCandidateAdoptionCompetingWorkIsActive(),
    graph: adoptionCurrent ? adoption?.graph ?? null : null,
  });
}

function captureStage7CanonicalCandidateAdoptionUndo(): Stage7CanonicalCandidateAdoptionUndo | null {
  if (!phaseADryWebPreview) return null;
  return {
    phaseADryWebPreview,
    internalStructureGraph,
    internalAngleScreeningGraph,
    internalAngleScreening,
    dryWebSupportSeparation,
    dryWebSupportSeparationSource,
    dryWebSupportSeparationVisible,
    dryWebSupportSeparationRestoreViewState,
    dryWebSupportSeparationRestoreDiagnosisView,
    installedSurfaceAngleDiagnosisView,
    dryWebInsideTargetOverlayVisible,
    dryWebInsufficientEdgeOverlayVisible,
    dryWebContactFloorOverlayVisible,
    dryWebRedFaceLocatorVisible,
    dryWebRedFaceLocatorRestoreViewState,
    dryWebRedFaceLocatorRestoreDiagnosisView,
    dryWebRedFaceDryWebCandidateVisible,
    dryWebContactPresentationOwner,
    stage7RedFaceReinforcementPlan,
    stage7RedFaceReinforcementPlanMessage,
    stage7ProvisionalRecheckResult,
    stage7ProvisionalRecheckElapsedMs,
    stage7ProvisionalRecheckTerminal,
    stage7ProvisionalRecheckMessage,
    stage7ProvisionalAdoptionGateApproval,
  };
}

function clearStage7CanonicalCandidateAdoption(): void {
  stage7CanonicalCandidateAdoption = null;
  stage7CanonicalCandidateAdoptionUndo = null;
}

function restoreStage7CanonicalCandidateAdoptionUndo(undo: Stage7CanonicalCandidateAdoptionUndo): void {
  phaseADryWebPreview = undo.phaseADryWebPreview;
  internalStructureGraph = undo.internalStructureGraph;
  internalStructureFingerprint = "";
  internalAngleScreeningGraph = undo.internalAngleScreeningGraph;
  internalAngleScreening = undo.internalAngleScreening;
  dryWebSupportSeparation = undo.dryWebSupportSeparation;
  dryWebSupportSeparationSource = undo.dryWebSupportSeparationSource;
  dryWebSupportSeparationVisible = undo.dryWebSupportSeparationVisible;
  dryWebSupportSeparationRestoreViewState = undo.dryWebSupportSeparationRestoreViewState;
  dryWebSupportSeparationRestoreDiagnosisView = undo.dryWebSupportSeparationRestoreDiagnosisView;
  installedSurfaceAngleDiagnosisView = undo.installedSurfaceAngleDiagnosisView;
  dryWebInsideTargetOverlayVisible = false;
  dryWebInsufficientEdgeOverlayVisible = false;
  dryWebContactFloorOverlayVisible = null;
  dryWebRedFaceLocatorVisible = false;
  dryWebRedFaceDryWebCandidateVisible = false;
  dryWebContactPresentationOwner = undo.dryWebContactPresentationOwner;
  stage7RedFaceReinforcementPlan = undo.stage7RedFaceReinforcementPlan;
  stage7RedFaceReinforcementPlanMessage = undo.stage7RedFaceReinforcementPlanMessage;
  stage7ProvisionalRecheckResult = undo.stage7ProvisionalRecheckResult;
  stage7ProvisionalRecheckElapsedMs = undo.stage7ProvisionalRecheckElapsedMs;
  stage7ProvisionalRecheckTerminal = undo.stage7ProvisionalRecheckTerminal;
  stage7ProvisionalRecheckMessage = undo.stage7ProvisionalRecheckMessage;
  stage7ProvisionalAdoptionGateApproval = undo.stage7ProvisionalAdoptionGateApproval;
  skinRenderer.clearSurfaceAngleOverlay();
  skinRenderer.clearDryWebRedFaceLocator();
  skinRenderer.clearDryWebRedFaceDryWebCandidateOverlay();
  skinRenderer.clearDryWebInsufficientEdgeOverlay();
  skinRenderer.clearDryWebContactFloorOverlay();
  skinRenderer.setInternalStructure(internalStructureGraph);
  skinRenderer.setInternalAngleScreening(internalAngleScreening);
  ui.setInternalAngleScreening(
    internalAngleScreeningGraph !== null,
    internalAngleScreeningEnabled,
    internalAngleScreening,
  );
  if (undo.dryWebContactPresentationOwner === "dryWeb") syncDryWebContactVisualization();
  // Re-enter the existing presentation setters in a deterministic priority
  // order. Each setter re-checks current facts and exclusivity; a stale
  // captured overlay therefore stays off instead of being painted blindly.
  if (undo.dryWebSupportSeparationVisible && dryWebSupportSeparationIsCurrent()) {
    setDryWebSupportSeparationVisible(true);
    dryWebSupportSeparationRestoreViewState = undo.dryWebSupportSeparationRestoreViewState;
    dryWebSupportSeparationRestoreDiagnosisView = undo.dryWebSupportSeparationRestoreDiagnosisView;
    installedSurfaceAngleDiagnosisView = undo.installedSurfaceAngleDiagnosisView;
  } else if (undo.dryWebRedFaceDryWebCandidateVisible) {
    setDryWebRedFaceDryWebCandidateVisible(true);
    dryWebRedFaceLocatorRestoreViewState = undo.dryWebRedFaceLocatorRestoreViewState;
    dryWebRedFaceLocatorRestoreDiagnosisView = undo.dryWebRedFaceLocatorRestoreDiagnosisView;
  } else if (undo.dryWebRedFaceLocatorVisible) {
    setDryWebRedFaceLocatorVisible(true);
    dryWebRedFaceLocatorRestoreViewState = undo.dryWebRedFaceLocatorRestoreViewState;
    dryWebRedFaceLocatorRestoreDiagnosisView = undo.dryWebRedFaceLocatorRestoreDiagnosisView;
  } else if (undo.dryWebInsideTargetOverlayVisible) {
    setDryWebInsideTargetOverlayVisible(true);
  } else if (undo.dryWebContactFloorOverlayVisible !== null) {
    setDryWebContactFloorOverlay(undo.dryWebContactFloorOverlayVisible);
  } else if (undo.dryWebInsufficientEdgeOverlayVisible) {
    setDryWebInsufficientEdgeOverlayVisible(true);
  }
  refreshDryWebSupportSeparationUi();
  refreshDryWebActions();
  syncPhaseASupportPreviewAvailability(internalStructureGraph);
  render();
}

function adoptStage7CanonicalCandidate(): void {
  const gate = currentStage7ProvisionalAdoptionGatePresentation();
  if (gate.state !== "author-approved-for-next-confirmation"
    || canonicalDryWebOrSurfaceRunIsActive()
    || stage7CanonicalCandidateAdoptionCompetingWorkIsActive()
    || stage7CanonicalCandidateAdoption !== null) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  const binding = stage7RedFaceReinforcementPlan;
  const approvedPlan = binding?.plan;
  const currentGraph = phaseADryWebPreview?.graph;
  const currentDiagnosis = surfaceAngleCache;
  const currentScale = currentPrintScaleMmPerUnit();
  if (!binding || !approvedPlan || !approvedPlan.graph || !currentGraph
    || approvedPlan.state !== "current"
    || currentGraph !== binding.sourceGraph
    || !currentDiagnosis
    || dryWebSupportSeparationSource !== currentDiagnosis
    || !dryWebSupportSeparationIsCurrent()
    || !stage7ProvisionalRecheckResult
    || !stage7ProvisionalRecheckBindingIsCurrent(stage7ProvisionalRecheckResult.binding)
    || currentStage7ProvisionalRecheckPresentation().state !== "current"
    || !Number.isFinite(currentScale)
    || currentScale !== binding.scaleMmPerUnit) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  const undo = captureStage7CanonicalCandidateAdoptionUndo();
  if (!undo) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  // This is a session transition: clear the old exact/provisional evidence
  // only after the exact pre-adoption references have been captured.
  clearDryWebSupportSeparation();
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  const candidateGraph = cloneStage7CanonicalCandidateGraph(approvedPlan.graph);
  phaseADryWebPreview = {
    ...undo.phaseADryWebPreview,
    graph: candidateGraph,
    targetConnectionFacts: null,
    contactFloorFacts: null,
    facts: null,
  };
  internalStructureGraph = candidateGraph;
  internalStructureFingerprint = "";
  skinRenderer.setInternalStructure(candidateGraph);
  refreshInternalAngleScreening(candidateGraph);
  stage7CanonicalCandidateAdoption = {
    graph: candidateGraph,
    surfaceAngleCache: currentDiagnosis,
    artworkGraphSnapshot,
    artworkGraphSourceKey,
    targetedSupportSource,
    paintRevision: supportPaintSession.revision,
    surfaceFingerprint: currentTargetSurfaceFingerprint(),
    resolution: currentDiagnosis.resolution,
    mode: state.mode,
    supportSettingsKey: JSON.stringify(phaseASupportSettings),
    scaleMmPerUnit: currentScale,
    exactValidated: false,
  };
  stage7CanonicalCandidateAdoptionUndo = undo;
  ui.setInternalStructureStatus(
    `Stage 7作品候補を採用 · candidate ${candidateGraph.nodes.length.toLocaleString()} node / ${candidateGraph.edges.length.toLocaleString()} edge · 旧generator facts無効 · exact再診断が必要`,
    candidateGraph.edges.length > 0,
  );
  ui.setSurfaceAngleDiagnosisStatus("Stage 7作品候補を採用しました · 旧exact separationとgenerator factsは無効です · 「Dry Web付加後を再診断」で再検証してください");
  refreshInternalAngleScreening(candidateGraph);
  syncPhaseASupportPreviewAvailability(candidateGraph);
  refreshDryWebSupportSeparationUi();
  refreshDryWebActions("Stage 7作品候補を採用しました。旧factsは無効です。「Dry Web付加後を再診断」で再検証してください");
  render();
}

function undoStage7CanonicalCandidateAdoption(): void {
  if (!stage7CanonicalCandidateAdoptionUndoIsCurrent()) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  const undo = stage7CanonicalCandidateAdoptionUndo;
  if (!undo) return;
  restoreStage7CanonicalCandidateAdoptionUndo(undo);
  clearStage7CanonicalCandidateAdoption();
  ui.setSurfaceAngleDiagnosisStatus("採用前へ戻しました。Dry Web candidate Graphとexact separationを採用前の状態へ復元しました");
  refreshDryWebSupportSeparationUi();
  render();
}

function terminateStage7ProvisionalRecheck(): void {
  stage7ProvisionalRecheckGeneration++;
  const worker = activeStage7ProvisionalRecheckWorker;
  activeStage7ProvisionalRecheckWorker = null;
  stage7ProvisionalRecheckRunBinding = null;
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
  stage7ProvisionalRecheckHeavyComputation?.finish();
  stage7ProvisionalRecheckHeavyComputation = null;
}

function clearStage7ProvisionalRecheck(
  reason: string | null = null,
  state: "missing" | "stale" = "missing",
): void {
  terminateStage7ProvisionalRecheck();
  stage7ProvisionalRecheckResult = null;
  // Approval is deliberately volatile and tied to this exact result. Any
  // rerun, cancellation, discard, or stale transition clears it fail-closed.
  stage7ProvisionalAdoptionGateApproval = null;
  stage7ProvisionalRecheckElapsedMs = null;
  stage7ProvisionalRecheckTerminal = state;
  stage7ProvisionalRecheckMessage = reason;
}

function captureStage7ProvisionalRecheckBinding(): Stage7ProvisionalRecheckBinding | null {
  const candidatePresentation = currentStage7RedFaceDryWebCandidatePresentation();
  const planBinding = stage7RedFaceReinforcementPlan;
  const plan = currentStage7RedFaceReinforcementPlan(candidatePresentation);
  const baselineSeparation = dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null;
  const exactSource = dryWebSupportSeparationSource;
  // The exact result that produced the current separation is the immutable
  // Stage 7 baseline boundary. Do not derive a fresh baseline from live mesh
  // or settings while preparing the provisional request.
  const baseDiagnosis = exactSource ?? surfaceAngleCache;
  const sourceGraph = phaseADryWebPreview?.graph ?? null;
  const scaleMmPerUnit = currentPrintScaleMmPerUnit();
  const sourcePresentationCurrent = planBinding?.source === "explicit-topology-repair"
    ? explicitTopologyRepairBindingIsCurrent(planBinding)
    : candidatePresentation.state === "current" && candidatePresentation.enabled;
  if (!plan
    || !planBinding
    || planBinding.plan !== plan
    || !sourcePresentationCurrent
    || !baselineSeparation
    || !baseDiagnosis
    || !exactSource
    || !sourceGraph
    || sourceGraph.kind !== "targetedGrid"
    || !dryWebSupportSeparationIsCurrent()
    || typeof scaleMmPerUnit !== "number"
    || !Number.isFinite(scaleMmPerUnit)
    || !(scaleMmPerUnit > 0)
    || !Number.isFinite(phaseASupportSettings.dryWebMinimumDiameterMm)
    || !(phaseASupportSettings.dryWebMinimumDiameterMm > 0)
    || !overhangSupportResult) return null;
  const targetDiameterMm = phaseASupportSettings.dryWebMinimumDiameterMm;
  const candidateFaceIds = Object.freeze([...planBinding.candidateFaceIds]);
  return {
    plan,
    sourceGraph,
    baseDiagnosis,
    baselineSeparation,
    exactSource,
    candidateFaceIds,
    targetDiameterMm,
    scaleMmPerUnit,
    supportEntries: overhangSupportResult.entries,
    meshStep: stage7ProvisionalMeshStep(baseDiagnosis),
    mode: state.mode,
  };
}

function discardStage7ProvisionalRecheck(): void {
  if (!stage7ProvisionalRecheckIsActive() && !stage7ProvisionalRecheckResult) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  clearStage7ProvisionalRecheck("仮診断結果を破棄しました。仮Graph計画とcanonical stateは変更していません。");
  refreshDryWebSupportSeparationUi();
}

function requestStage7ProvisionalRecheck(): void {
  const binding = captureStage7ProvisionalRecheckBinding();
  if (!binding || canonicalDryWebOrSurfaceRunIsActive() || stage7ProvisionalRecheckIsActive()) {
    stage7ProvisionalAdoptionGateApproval = null;
    stage7ProvisionalRecheckMessage = "current仮Graph計画・exact baseline・source/settingsがそろっていないか、別の診断が実行中です。仮Graph exact比較は開始しません。";
    stage7ProvisionalRecheckTerminal = "stale";
    refreshDryWebSupportSeparationUi();
    return;
  }

  clearStage7ProvisionalRecheck();
  const generation = ++stage7ProvisionalRecheckGeneration;
  const worker = new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
  activeStage7ProvisionalRecheckWorker = worker;
  stage7ProvisionalRecheckRunBinding = binding;
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (!isCurrentWorkerRun(
      worker,
      activeStage7ProvisionalRecheckWorker,
      null,
      undefined,
      generation,
      stage7ProvisionalRecheckGeneration,
    ) || stage7ProvisionalRecheckHeavyComputation?.id !== heavy.id) return;
    clearStage7ProvisionalRecheck("仮Graph exact比較をキャンセルしました。仮Graph計画とcanonical stateは変更していません。", "missing");
    ui.setSurfaceAngleDiagnosisStatus("仮Graph exact比較をキャンセルしました。計画は保持しています。", false);
    refreshDryWebSupportSeparationUi();
  };
  heavy = beginHeavyComputation("仮Graph exact比較 全体進捗", cancel);
  stage7ProvisionalRecheckHeavyComputation = heavy;
  stage7ProvisionalRecheckElapsedMs = 0;
  stage7ProvisionalRecheckTerminal = "missing";
  stage7ProvisionalRecheckMessage = null;
  refreshDryWebSupportSeparationUi();

  const baselineSource = binding.exactSource;
  let latestScopeText = "差分適用条件を確認中";
  heavy.updateActual(`仮Graph exact比較 · ${latestScopeText} · 接触索引を準備しています…`, 0);
  ui.setSurfaceAngleDiagnosisStatus(`仮Graph exact比較 · ${latestScopeText} · 接触索引を準備しています…`);

  const savedMotifLowestPoints = Array.isArray(baselineSource.motifLowestPoints)
    ? baselineSource.motifLowestPoints.map((marker) => {
      const clone = { ...marker, position: { ...marker.position } };
      if (marker.normal !== undefined) clone.normal = { ...marker.normal };
      return clone;
    })
    : undefined;
  const reusesMotifLowestPoints = savedMotifLowestPoints !== undefined;
  const phaseRanges: Record<string, [number, number]> = reusesMotifLowestPoints
    ? {
      "reachability-index": [0, 18],
      "dangerous-face-contact": [18, 68],
      "motif-reachability": [68, 99],
      complete: [100, 100],
    }
    : {
      "reachability-index": [0, 15],
      "dangerous-face-contact": [15, 58],
      "motif-attribution": [58, 79],
      "motif-reachability": [79, 99],
      complete: [100, 100],
    };
  let currentPhase: string | null = null;
  let phaseStartedElapsedMs = 0;
  const request: SurfaceAngleDiagnosisRequest = {
    type: "recheck",
    generation,
    basePositions: baselineSource.basePositions.slice(),
    baseNormals: baselineSource.baseNormals.slice(),
    baseFaceCount: baselineSource.baseFaceCount,
    resolution: baselineSource.resolution,
    internalGraph: binding.plan.graph,
    thresholdDeg: baselineSource.metrics.thresholdDeg,
    meshStep: binding.meshStep,
    mode: binding.mode,
    patches: state.patches.map((patch) => ({
      ...patch,
      motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
      points: patch.points.map((point) => ({ ...point })),
    })),
    roundK: state.skinParams.roundK,
    previousElapsedMs: 0,
    ...(savedMotifLowestPoints !== undefined ? { motifLowestPoints: savedMotifLowestPoints } : {}),
    recheckMode: "delta",
    baseGraph: binding.sourceGraph,
    baseline: {
      beforeDangerPositions: baselineSource.beforeDangerPositions.slice(),
      afterDangerPositions: baselineSource.afterDangerPositions.slice(),
      mitigatedPositions: baselineSource.mitigatedPositions.slice(),
      metrics: { ...baselineSource.metrics },
    },
  };
  worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
    const message = event.data;
    if (!isCurrentWorkerRun(
      worker,
      activeStage7ProvisionalRecheckWorker,
      null,
      undefined,
      generation,
      stage7ProvisionalRecheckGeneration,
      message.generation,
    )) {
      worker.terminate();
      return;
    }
    if (message.type === "progress") {
      stage7ProvisionalRecheckElapsedMs = message.elapsedMs;
      const stageLabels: Record<string, [string, string]> = {
        "reachability-index": ["接触索引", "edge"],
        "dangerous-face-contact": ["危険面接触", "面"],
        "motif-attribution": ["最下点帰属（legacy全走査）", "頂点"],
        "motif-reachability": [reusesMotifLowestPoints ? "最下点再利用/到達確認" : "最下点到達確認", "patch"],
        complete: ["完了", ""],
      };
      const stage = message.stage ? stageLabels[message.stage] : undefined;
      latestScopeText = message.recheckMode === "delta"
        && typeof message.recheckQueryFaceCount === "number"
        && typeof message.recheckBaselineFaceCount === "number"
        ? `差分 ${message.recheckQueryFaceCount.toLocaleString()}/${message.recheckBaselineFaceCount.toLocaleString()}面`
        : "全件 fallback";
      const completed = message.completed ?? message.completedSlices;
      const total = message.total ?? message.totalSlices;
      const phase = message.stage ?? "worker";
      if (phase !== currentPhase) {
        currentPhase = phase;
        phaseStartedElapsedMs = message.elapsedMs;
      }
      const fraction = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
      const phaseElapsedMs = Math.max(0, message.elapsedMs - phaseStartedElapsedMs);
      const [phaseStart, phaseEnd] = phaseRanges[phase] ?? [0, 0];
      const progress = phase === "complete" ? 100 : phaseStart + (phaseEnd - phaseStart) * fraction;
      const detail = stage
        ? `${latestScopeText} · ${stage[0]}${stage[1] ? ` ${completed.toLocaleString()}/${total.toLocaleString()} ${stage[1]}` : ""} · 工程内進捗${(fraction * 100).toFixed(0)}% · 工程内経過 ${(phaseElapsedMs / 1000).toFixed(1)}秒 · 合計 ${(message.elapsedMs / 1000).toFixed(1)}秒`
        : `${latestScopeText} · 仮Graph exact比較Worker · ${completed}/${total} slice · ${message.faceCount.toLocaleString()}面 · 工程内経過 ${(phaseElapsedMs / 1000).toFixed(1)}秒 · 合計 ${(message.elapsedMs / 1000).toFixed(1)}秒`;
      heavy.updateActual(`仮Graph exact比較 · ${detail}`, progress);
      ui.setSurfaceAngleDiagnosisStatus(`仮Graph exact比較 · ${detail} · 画面は操作できます`);
      refreshDryWebSupportSeparationUi();
      return;
    }

    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    activeStage7ProvisionalRecheckWorker = null;
    stage7ProvisionalRecheckGeneration++;
    const capturedBinding = stage7ProvisionalRecheckRunBinding;
    stage7ProvisionalRecheckRunBinding = null;
    if (stage7ProvisionalRecheckHeavyComputation?.id === heavy.id) stage7ProvisionalRecheckHeavyComputation = null;
    heavy.updateActual(`仮Graph exact比較 · ${latestScopeText} · 完了`, 100);
    heavy.finish();
    stage7ProvisionalRecheckElapsedMs = message.elapsedMs;
    if (message.type === "error") {
      stage7ProvisionalAdoptionGateApproval = null;
      stage7ProvisionalRecheckResult = null;
      stage7ProvisionalRecheckTerminal = "error";
      stage7ProvisionalRecheckMessage = message.message;
      ui.setSurfaceAngleDiagnosisStatus(`仮Graph exact比較に失敗しました: ${message.message}`, false);
      refreshDryWebSupportSeparationUi();
      return;
    }
    if (!capturedBinding
      || !stage7ProvisionalRecheckBindingIsCurrent(capturedBinding)
      || !stage7ProvisionalRecheckMessageMatchesBinding(message, capturedBinding)) {
      stage7ProvisionalAdoptionGateApproval = null;
      stage7ProvisionalRecheckResult = null;
      stage7ProvisionalRecheckTerminal = "stale";
      stage7ProvisionalRecheckMessage = "仮Graph exact比較結果がplan/source/settingsと一致しないため破棄しました。canonical stateは変更していません。";
      ui.setSurfaceAngleDiagnosisStatus(stage7ProvisionalRecheckMessage, false);
      refreshDryWebSupportSeparationUi();
      return;
    }
    const separation = createDryWebSupportSeparationPresentation({
      beforeDangerPositions: message.beforeDangerPositions,
      afterDangerPositions: message.afterDangerPositions,
      mitigatedPositions: message.mitigatedPositions,
      entries: capturedBinding.supportEntries,
    });
    if (separation.state !== "current") {
      stage7ProvisionalAdoptionGateApproval = null;
      stage7ProvisionalRecheckResult = null;
      stage7ProvisionalRecheckTerminal = "error";
      stage7ProvisionalRecheckMessage = separation.reason;
      ui.setSurfaceAngleDiagnosisStatus(`仮Graph exact比較を採用できません: ${separation.reason}`, false);
      refreshDryWebSupportSeparationUi();
      return;
    }
    stage7ProvisionalRecheckResult = {
      binding: capturedBinding,
      source: message,
      separation,
      elapsedMs: message.elapsedMs,
    };
    stage7ProvisionalRecheckTerminal = "missing";
    stage7ProvisionalRecheckMessage = null;
    ui.setSurfaceAngleDiagnosisStatus(`仮Graph exact比較が完了しました · ${latestScopeText} · canonical未変更`);
    refreshDryWebSupportSeparationUi();
  };
  worker.onerror = (event) => {
    if (!isCurrentWorkerRun(
      worker,
      activeStage7ProvisionalRecheckWorker,
      null,
      undefined,
      generation,
      stage7ProvisionalRecheckGeneration,
    )) {
      worker.terminate();
      return;
    }
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    activeStage7ProvisionalRecheckWorker = null;
    stage7ProvisionalRecheckGeneration++;
    stage7ProvisionalRecheckRunBinding = null;
    if (stage7ProvisionalRecheckHeavyComputation?.id === heavy.id) stage7ProvisionalRecheckHeavyComputation = null;
    heavy.finish();
    stage7ProvisionalRecheckTerminal = "error";
    stage7ProvisionalRecheckMessage = event.message;
    stage7ProvisionalAdoptionGateApproval = null;
    stage7ProvisionalRecheckResult = null;
    ui.setSurfaceAngleDiagnosisStatus(`仮Graph exact比較Workerに失敗しました: ${event.message}`, false);
    refreshDryWebSupportSeparationUi();
  };
  const requestBaseline = request.baseline;
  const transferables: Transferable[] = [request.basePositions.buffer, request.baseNormals.buffer];
  if (requestBaseline) {
    transferables.push(
      requestBaseline.beforeDangerPositions.buffer,
      requestBaseline.afterDangerPositions.buffer,
      requestBaseline.mitigatedPositions.buffer,
    );
  }
  worker.postMessage(request, transferables);
}

function approveStage7ProvisionalAdoptionGate(): void {
  const gate = currentStage7ProvisionalAdoptionGatePresentation();
  if (gate.state !== "ready-for-author-review") {
    refreshDryWebSupportSeparationUi();
    return;
  }
  const candidatePresentation = currentStage7RedFaceDryWebCandidatePresentation();
  const plan = currentStage7RedFaceReinforcementPlan(candidatePresentation);
  const result = stage7ProvisionalRecheckResult;
  if (!plan || !result
    || !stage7ProvisionalRecheckBindingIsCurrent(result.binding)
    || currentStage7ProvisionalRecheckPresentation().state !== "current") {
    refreshDryWebSupportSeparationUi();
    return;
  }
  stage7ProvisionalAdoptionGateApproval = { plan, result };
  ui.setSurfaceAngleDiagnosisStatus("作者がこのexact provisional比較を確認しました · 次の採用確認へ進めます · canonical未変更");
  refreshDryWebSupportSeparationUi();
}

function returnStage7ProvisionalAdoptionGateToPending(): void {
  const gate = currentStage7ProvisionalAdoptionGatePresentation();
  if (gate.state !== "author-approved-for-next-confirmation") {
    refreshDryWebSupportSeparationUi();
    return;
  }
  stage7ProvisionalAdoptionGateApproval = null;
  ui.setSurfaceAngleDiagnosisStatus("このexact provisional比較を保留に戻しました · canonical未変更");
  refreshDryWebSupportSeparationUi();
}

function buildStage7RedFaceReinforcementPlan(): void {
  const candidatePresentation = currentStage7RedFaceDryWebCandidatePresentation();
  const currentGraph = phaseADryWebPreview?.graph ?? null;
  const currentExactSource = dryWebSupportSeparationSource;
  const scaleMmPerUnit = currentPrintScaleMmPerUnit();
  if (candidatePresentation.state !== "current"
    || !candidatePresentation.enabled
    || !currentGraph
    || currentGraph.kind !== "targetedGrid"
    || !currentExactSource
    || !dryWebSupportSeparationIsCurrent()
    || dryWebInsideTargetRunActive()
    || stage7RedFaceReinforcementPlan !== null) {
    stage7RedFaceReinforcementPlanMessage = "current候補・exact boundary・print scaleがそろっていないため、仮Graph計画は作成しません。";
    refreshDryWebSupportSeparationUi();
    return;
  }
  // Rebuilding is always a fresh provisional checkpoint; do not carry a
  // comparison from a previous plan into the new plan object.
  clearStage7ProvisionalRecheck();
  if (typeof scaleMmPerUnit !== "number" || !Number.isFinite(scaleMmPerUnit) || !(scaleMmPerUnit > 0)) {
    stage7RedFaceReinforcementPlanMessage = "current print scaleが有限・正値ではないため、仮Graph計画は作成しません。";
    refreshDryWebSupportSeparationUi();
    return;
  }
  const targetDiameterMm = phaseASupportSettings.dryWebMinimumDiameterMm;
  const reinforcementRadius = targetDiameterMm * 0.5 / scaleMmPerUnit;
  const plan = createStage7RedFaceReinforcementPlan({
    graph: currentGraph,
    candidates: candidatePresentation.candidates,
    targetDiameterMm,
    reinforcementRadius,
  });
  if (plan.state !== "current" || !plan.graph) {
    stage7RedFaceReinforcementPlan = null;
    stage7RedFaceReinforcementPlanMessage = plan.reason;
    refreshDryWebSupportSeparationUi();
    return;
  }
  stage7RedFaceReinforcementPlan = {
    source: "red-face-reinforcement",
    sourceGraph: currentGraph,
    exactSource: currentExactSource,
    candidateFaceIds: Object.freeze(stage7RedFaceCandidateFaceIds(candidatePresentation.candidates)),
    targetDiameterMm,
    scaleMmPerUnit,
    plan,
    explicitIdentity: null,
  };
  stage7RedFaceReinforcementPlanMessage = null;
  refreshDryWebSupportSeparationUi();
}

function patch6ExplicitTopologyRepairPlanIsAvailable(): boolean {
  const readiness = currentPatch6ExplicitTopologyRepairReadiness();
  return state.skinParams.internalStructure === "targetedGrid"
    && readiness.available
    && stage7RedFaceReinforcementPlan === null
    && stage7CanonicalCandidateAdoption === null
    && !canonicalDryWebOrSurfaceRunIsActive()
    && !stage7ProvisionalRecheckIsActive();
}

function buildPatch6ExplicitTopologyRepairPlan(): void {
  const currentGraph = phaseADryWebPreview?.graph ?? null;
  const currentExactSource = dryWebSupportSeparationSource;
  const scaleMmPerUnit = currentPrintScaleMmPerUnit();
  const identity = currentExplicitTopologyRepairIdentity();
  const readiness = currentPatch6ExplicitTopologyRepairReadiness();
  if (!readiness.available
    || !patch6ExplicitTopologyRepairPlanIsAvailable()
    || !currentGraph || !currentExactSource || !identity || typeof scaleMmPerUnit !== "number") {
    stage7RedFaceReinforcementPlanMessage = readiness.reason;
    refreshDryWebSupportSeparationUi();
    return;
  }
  clearStage7ProvisionalRecheck();
  const result = createExplicitTopologyRepairPlan({
    baselineGraph: currentGraph,
    nodes: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR.nodes,
    edges: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR.edges,
    scaleMmPerUnit,
    targetDiameterMm: phaseASupportSettings.dryWebMinimumDiameterMm,
    reason: "明示topology repair · isolated Patch 6 → main Patch 22 · 3 edge · read-only resolution 128事前検証済み",
    topologyEvidence: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR.topologyEvidence,
    identity,
  });
  if (result.plan.state !== "current" || !result.plan.graph) {
    stage7RedFaceReinforcementPlanMessage = result.plan.reason;
    refreshDryWebSupportSeparationUi();
    return;
  }
  stage7RedFaceReinforcementPlan = {
    source: "explicit-topology-repair",
    sourceGraph: currentGraph,
    exactSource: currentExactSource,
    candidateFaceIds: Object.freeze([]),
    targetDiameterMm: phaseASupportSettings.dryWebMinimumDiameterMm,
    scaleMmPerUnit,
    plan: result.plan,
    explicitIdentity: result.identity,
  };
  stage7RedFaceReinforcementPlanMessage = null;
  refreshDryWebSupportSeparationUi();
}

function discardStage7RedFaceReinforcementPlan(): void {
  // The plan is the comparison's identity root. Stop/clear its provisional
  // run before dropping that root; canonical graph/diagnosis remain untouched.
  clearStage7ProvisionalRecheck("仮Graph計画を破棄するため、比較結果を破棄しました。", "missing");
  if (!stage7RedFaceReinforcementPlan) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  stage7RedFaceReinforcementPlan = null;
  stage7RedFaceReinforcementPlanMessage = "仮Graph計画を破棄しました。canonical Graphは変更していません。";
  refreshDryWebSupportSeparationUi();
}

function clearStage7RedFaceReinforcementPlan(): void {
  clearStage7ProvisionalRecheck();
  stage7RedFaceReinforcementPlan = null;
  stage7RedFaceReinforcementPlanMessage = null;
}

function clearDryWebSupportSeparation(preserveCanonicalCandidate = false): void {
  if (!preserveCanonicalCandidate) clearStage7CanonicalCandidateAdoption();
  clearStage7RedFaceReinforcementPlan();
  skinRenderer.clearDryWebRedFaceDryWebCandidateOverlay();
  dryWebRedFaceDryWebCandidateVisible = false;
  if (dryWebRedFaceLocatorVisible) skinRenderer.clearDryWebRedFaceLocator();
  if (dryWebSupportSeparationVisible) {
    skinRenderer.clearSurfaceAngleOverlay();
    installedSurfaceAngleDiagnosisView = null;
  }
  dryWebSupportSeparation = null;
  dryWebSupportSeparationSource = null;
  dryWebSupportSeparationVisible = false;
  dryWebSupportSeparationRestoreViewState = null;
  dryWebSupportSeparationRestoreDiagnosisView = null;
  dryWebRedFaceLocatorVisible = false;
  dryWebRedFaceLocatorRestoreViewState = null;
  dryWebRedFaceLocatorRestoreDiagnosisView = null;
}

/** Release only the Stage 7 presentation when another author action owns the
 * viewport. The competing action supplies its own view; the Stage 7 snapshot
 * must not be restored over that explicit choice. */
function releaseDryWebSupportSeparationPresentationForCompetingView(): void {
  releaseDryWebRedFaceLocatorForCompetingView();
  if (!dryWebSupportSeparationVisible) return;
  skinRenderer.clearSurfaceAngleOverlay();
  installedSurfaceAngleDiagnosisView = null;
  dryWebSupportSeparationVisible = false;
  dryWebSupportSeparationRestoreViewState = null;
  dryWebSupportSeparationRestoreDiagnosisView = null;
  refreshDryWebSupportSeparationUi();
  render();
}

/** Release the independent Stage 7 locator without taking ownership away
 * from an already-visible three-color separation. Generic viewport actions
 * call this before installing their own presentation. */
function releaseDryWebRedFaceLocatorForCompetingView(): void {
  if (dryWebRedFaceDryWebCandidateVisible) {
    dryWebRedFaceDryWebCandidateVisible = false;
    skinRenderer.clearDryWebRedFaceDryWebCandidateOverlay();
  }
  if (!dryWebRedFaceLocatorVisible) return;
  skinRenderer.clearDryWebRedFaceLocator();
  dryWebRedFaceLocatorVisible = false;
  dryWebRedFaceLocatorRestoreViewState = null;
  dryWebRedFaceLocatorRestoreDiagnosisView = null;
  refreshDryWebSupportSeparationUi();
  render();
}

function refreshDryWebSupportSeparationUi(): void {
  if (dryWebSupportSeparation && !dryWebSupportSeparationIsCurrent()) clearDryWebSupportSeparation();
  const current = dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null;
  const exactRecheck = currentDryWebExactRecheckPresentation();
  const redFaceLocator = currentStage7RedFaceLocatorPresentation();
  if (dryWebRedFaceLocatorVisible && (!redFaceLocator.enabled || redFaceLocator.state !== "current")) {
    skinRenderer.clearDryWebRedFaceLocator();
    dryWebRedFaceLocatorVisible = false;
    dryWebRedFaceLocatorRestoreViewState = null;
    dryWebRedFaceLocatorRestoreDiagnosisView = null;
  }
  const redFaceDryWebCandidate = currentStage7RedFaceDryWebCandidatePresentation();
  const currentRedFaceReinforcementPlan = currentStage7RedFaceReinforcementPlan(redFaceDryWebCandidate);
  const redFaceReinforcementComparison = currentStage7ProvisionalRecheckPresentation();
  const redFaceProvisionalAdoptionGate = currentStage7ProvisionalAdoptionGatePresentation();
  const canonicalCandidateAdoption = currentStage7CanonicalCandidateAdoptionPresentation();
  const currentPrintScale = currentPrintScaleMmPerUnit();
  const patch6Readiness = currentPatch6ExplicitTopologyRepairReadiness();
  const patch6PlanAvailable = state.skinParams.internalStructure === "targetedGrid"
    && patch6Readiness.available
    && stage7RedFaceReinforcementPlan === null
    && stage7CanonicalCandidateAdoption === null
    && !canonicalDryWebOrSurfaceRunIsActive()
    && !stage7ProvisionalRecheckIsActive();
  const hasCurrentPrintScale = typeof currentPrintScale === "number"
    && Number.isFinite(currentPrintScale)
    && currentPrintScale > 0;
  const reinforcementPlanAvailable = currentRedFaceReinforcementPlan === null
    && redFaceDryWebCandidate.state === "current"
    && redFaceDryWebCandidate.enabled
    && dryWebSupportSeparationIsCurrent()
    && hasCurrentPrintScale
    && !dryWebInsideTargetRunActive();
  const reinforcementPlanReason = currentRedFaceReinforcementPlan
    ? currentRedFaceReinforcementPlan.reason
    : stage7RedFaceReinforcementPlanMessage
      ?? (redFaceDryWebCandidate.state === "current" && redFaceDryWebCandidate.enabled
        ? `${redFaceDryWebCandidate.reason} · target diameter ${phaseASupportSettings.dryWebMinimumDiameterMm.toFixed(3)} mm / normalized radius ${hasCurrentPrintScale ? (phaseASupportSettings.dryWebMinimumDiameterMm * 0.5 / currentPrintScale).toFixed(6) : "--"} · 仮Graph未作成`
        : "current赤面→Dry Web候補がそろうと仮Graph計画を作成できます。");
  if (dryWebRedFaceDryWebCandidateVisible && (redFaceDryWebCandidate.state !== "current" || !redFaceDryWebCandidate.enabled)) {
    skinRenderer.clearDryWebRedFaceDryWebCandidateOverlay();
    dryWebRedFaceDryWebCandidateVisible = false;
    if (dryWebRedFaceLocatorVisible) {
      skinRenderer.clearDryWebRedFaceLocator();
      dryWebRedFaceLocatorVisible = false;
      dryWebRedFaceLocatorRestoreViewState = null;
      dryWebRedFaceLocatorRestoreDiagnosisView = null;
    }
  }
  ui.setDryWebSupportSeparationState({
    state: current?.state ?? "missing",
    available: current !== null,
    visible: current !== null && dryWebSupportSeparationVisible,
    mitigatedFaceCount: current?.mitigatedFaceCount ?? 0,
    outsideFaceCount: current?.outsideFaceCount ?? 0,
    unresolvedFaceCount: current?.unresolvedFaceCount ?? 0,
    reason: current?.reason ?? exactRecheck.reason,
    recheckEnabled: exactRecheck.enabled,
    redFaceLocator: {
      state: redFaceLocator.state,
      enabled: redFaceLocator.enabled,
      count: redFaceLocator.count,
      faceIds: redFaceLocator.faceIds,
      status: redFaceLocator.status,
      visible: dryWebRedFaceLocatorVisible,
    },
    redFaceDryWebCandidate: {
      state: redFaceDryWebCandidate.state,
      enabled: redFaceDryWebCandidate.enabled,
      totalRedFaceCount: redFaceDryWebCandidate.totalRedFaceCount,
      previewedCandidateCount: redFaceDryWebCandidate.previewedCandidateCount,
      minLength: redFaceDryWebCandidate.minLength,
      meanLength: redFaceDryWebCandidate.meanLength,
      maxLength: redFaceDryWebCandidate.maxLength,
      reason: redFaceDryWebCandidate.reason,
      visible: dryWebRedFaceDryWebCandidateVisible,
    },
    redFaceReinforcementPlan: {
      available: reinforcementPlanAvailable,
      current: currentRedFaceReinforcementPlan !== null,
      facts: currentRedFaceReinforcementPlan?.facts ?? null,
      reason: reinforcementPlanReason,
      previewedCandidateCount: redFaceDryWebCandidate.previewedCandidateCount,
      totalRedFaceCount: redFaceDryWebCandidate.totalRedFaceCount,
    },
    explicitTopologyRepair: {
      available: patch6PlanAvailable,
      current: currentRedFaceReinforcementPlan?.facts.planSource === "explicit-topology-repair",
      reason: currentRedFaceReinforcementPlan?.facts.planSource === "explicit-topology-repair"
        ? `Patch 6 explicit topology repair planはcurrentです。次に仮Graphで再診断してください。 · ${patch6Readiness.reason}`
        : patch6Readiness.reason,
      currentScaleMmPerUnit: patch6Readiness.currentScaleMmPerUnit,
      validationScaleMmPerUnit: patch6Readiness.validationScaleMmPerUnit,
    },
    redFaceReinforcementComparison,
    redFaceProvisionalAdoptionGate,
    canonicalCandidateAdoption,
  });
}

function adoptDryWebSupportSeparation(
  message: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
): void {
  dryWebSupportSeparation = createDryWebSupportSeparationPresentation({
    beforeDangerPositions: message.beforeDangerPositions,
    afterDangerPositions: message.afterDangerPositions,
    mitigatedPositions: message.mitigatedPositions,
    entries: overhangSupportResult?.entries ?? null,
  });
  dryWebSupportSeparationSource = message;
  dryWebSupportSeparationVisible = false;
  dryWebSupportSeparationRestoreViewState = null;
  dryWebSupportSeparationRestoreDiagnosisView = null;
  refreshDryWebSupportSeparationUi();
  syncPhaseASupportPreviewAvailability(phaseADryWebPreview?.graph ?? null);
}

function setDryWebSupportSeparationVisible(visible: boolean): void {
  if (dryWebRedFaceDryWebCandidateVisible) {
    setDryWebRedFaceDryWebCandidateVisible(false);
  }
  if (visible && dryWebRedFaceLocatorVisible) releaseDryWebRedFaceLocatorForCompetingView();
  if (!visible && dryWebRedFaceLocatorVisible) {
    setDryWebRedFaceLocatorVisible(false);
    return;
  }
  if (visible) {
    releaseDryWebInsideTargetOverlayForCompetingView();
    releaseDryWebInsufficientEdgeOverlayForCompetingView();
    denseFlowerSampleLoadId++;
    denseFlowerSampleActive = false;
    skinRenderer.clearDenseFlowerSample();
    ui.setDenseFlowerSampleRunning(false);
    ui.setDenseFlowerSampleActive(false);
  }
  if (visible && dryWebSupportSeparationVisible) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  if (!visible) {
    if (!dryWebSupportSeparationVisible) {
      refreshDryWebSupportSeparationUi();
      return;
    }
    const restoreViewState = dryWebSupportSeparationRestoreViewState;
    const restoreDiagnosisView = dryWebSupportSeparationRestoreDiagnosisView;
    dryWebSupportSeparationVisible = false;
    dryWebSupportSeparationRestoreViewState = null;
    dryWebSupportSeparationRestoreDiagnosisView = null;
    skinRenderer.clearSurfaceAngleOverlay();
    installedSurfaceAngleDiagnosisView = null;
    if (restoreViewState) {
      if (restoreViewState.internalObservationMode !== internalObservationMode) {
        setInternalObservationMode(restoreViewState.internalObservationMode);
      }
      if (restoreViewState.viewMode !== viewMode) setViewMode(restoreViewState.viewMode);
    }
    if (restoreDiagnosisView) {
      showSurfaceAngleDiagnosisView(restoreDiagnosisView, true);
    } else {
      if (dryWebAuthorIntegrationPresentation) hideRemovableSupportOverlayForDryWeb();
      syncDryWebContactVisualization();
    }
    refreshDryWebSupportSeparationUi();
    render();
    return;
  }

  if (!dryWebSupportSeparationIsCurrent() || !dryWebSupportSeparation) {
    clearDryWebSupportSeparation();
    refreshDryWebSupportSeparationUi();
    return;
  }
  dryWebSupportSeparationRestoreViewState = preserveDryWebGraphViewState({ viewMode, internalObservationMode });
  dryWebSupportSeparationRestoreDiagnosisView = installedSurfaceAngleDiagnosisView;
  dryWebSupportSeparationVisible = true;
  if (viewMode !== "mesh") {
    viewMode = "mesh";
    skinRenderer.setViewMode(viewMode);
    ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
  }
  if (internalObservationMode === "internalOnly") setInternalObservationMode("normal");
  skinRenderer.setSurfaceAngleOverlay(
    dryWebSupportSeparation.unresolvedPositions,
    dryWebSupportSeparation.mitigatedPositions,
    true,
    dryWebSupportSeparation.outsidePositions,
  );
  installedSurfaceAngleDiagnosisView = null;
  refreshDryWebSupportSeparationUi();
  render();
}

function setDryWebRedFaceLocatorVisible(visible: boolean): void {
  if (!visible && dryWebRedFaceDryWebCandidateVisible) {
    setDryWebRedFaceDryWebCandidateVisible(false);
    return;
  }
  if (visible && dryWebRedFaceLocatorVisible) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  const presentation = currentStage7RedFaceLocatorPresentation();
  const policy = stage7RedFaceLocatorOverlayPolicy(presentation, visible);
  if (!visible || policy.clearOverlay) {
    if (!dryWebRedFaceLocatorVisible) {
      refreshDryWebSupportSeparationUi();
      return;
    }
    const restoreViewState = dryWebRedFaceLocatorRestoreViewState;
    const restoreDiagnosisView = dryWebRedFaceLocatorRestoreDiagnosisView;
    dryWebRedFaceLocatorVisible = false;
    dryWebRedFaceLocatorRestoreViewState = null;
    dryWebRedFaceLocatorRestoreDiagnosisView = null;
    skinRenderer.clearDryWebRedFaceLocator();
    if (restoreViewState) {
      if (restoreViewState.internalObservationMode !== internalObservationMode) {
        setInternalObservationMode(restoreViewState.internalObservationMode);
      }
      if (restoreViewState.viewMode !== viewMode) setViewMode(restoreViewState.viewMode);
    }
    if (restoreDiagnosisView && !dryWebSupportSeparationVisible) {
      showSurfaceAngleDiagnosisView(restoreDiagnosisView, true);
    } else if (!dryWebSupportSeparationVisible) {
      syncDryWebContactVisualization();
    }
    refreshDryWebSupportSeparationUi();
    render();
    return;
  }
  if (!presentation.enabled || presentation.state !== "current" || !surfaceAngleCache) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  denseFlowerSampleLoadId++;
  denseFlowerSampleActive = false;
  skinRenderer.clearDenseFlowerSample();
  ui.setDenseFlowerSampleRunning(false);
  ui.setDenseFlowerSampleActive(false);
  dryWebRedFaceLocatorRestoreViewState = preserveDryWebGraphViewState({ viewMode, internalObservationMode });
  dryWebRedFaceLocatorRestoreDiagnosisView = installedSurfaceAngleDiagnosisView;
  dryWebRedFaceLocatorVisible = true;
  if (viewMode !== "mesh") {
    viewMode = "mesh";
    skinRenderer.setViewMode(viewMode);
    ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
  }
  if (internalObservationMode === "internalOnly") setInternalObservationMode("normal");
  skinRenderer.setDryWebRedFaceLocator(
    surfaceAngleCache.basePositions,
    presentation.redPositions,
    policy.mode === "red-only",
  );
  installedSurfaceAngleDiagnosisView = null;
  refreshDryWebSupportSeparationUi();
  render();
}

function setDryWebRedFaceDryWebCandidateVisible(visible: boolean): void {
  if (!visible && dryWebRedFaceDryWebCandidateVisible) {
    dryWebRedFaceDryWebCandidateVisible = false;
    skinRenderer.clearDryWebRedFaceDryWebCandidateOverlay();
    // Candidate mode borrows the exact locator's viewport ownership. Turning
    // the shared restore action off therefore restores the same prior view.
    if (dryWebRedFaceLocatorVisible) setDryWebRedFaceLocatorVisible(false);
    refreshDryWebSupportSeparationUi();
    render();
    return;
  }
  if (!visible) {
    skinRenderer.clearDryWebRedFaceDryWebCandidateOverlay();
    refreshDryWebSupportSeparationUi();
    return;
  }
  if (dryWebRedFaceDryWebCandidateVisible) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  const presentation = currentStage7RedFaceDryWebCandidatePresentation();
  if (presentation.state !== "current" || !presentation.enabled) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  denseFlowerSampleLoadId++;
  denseFlowerSampleActive = false;
  skinRenderer.clearDenseFlowerSample();
  ui.setDenseFlowerSampleRunning(false);
  ui.setDenseFlowerSampleActive(false);
  // The existing red locator supplies the exact red-face context and owns
  // restoration of the prior viewport; the cyan paths remain independent.
  setDryWebRedFaceLocatorVisible(true);
  if (!dryWebRedFaceLocatorVisible) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  const currentPresentation = currentStage7RedFaceDryWebCandidatePresentation();
  if (currentPresentation.state !== "current" || !currentPresentation.enabled) {
    refreshDryWebSupportSeparationUi();
    return;
  }
  dryWebRedFaceDryWebCandidateVisible = true;
  skinRenderer.setDryWebRedFaceDryWebCandidateOverlay(currentPresentation.linePositions, true);
  refreshDryWebSupportSeparationUi();
  render();
}

function clearDryWebPreviewResult(): void {
  clearStage7CanonicalCandidateAdoption();
  releaseDryWebInsideTargetOverlayForCompetingView();
  clearDryWebInsufficientEdgeOverlayState();
  phaseADryWebPreview = null;
  clearDryWebSupportSeparation();
  targetedSupportSource = null;
  dryWebContactPresentationOwner = "none";
  skinRenderer.updateDryWebContactPresentation(null, state.skinParams.dryWebRequiredContacts);
  internalStructureFingerprint = "";
  internalStructureGraph = null;
  skinRenderer.setInternalStructure(null);
  refreshInternalAngleScreening(null);
  syncPhaseASupportPreviewAvailability(null);
  refreshDryWebSupportSeparationUi();
}

/** Exact post-attachment diagnosis is a validation step for an already-built
 * graph. If it fails, the graph is not an author-visible result: invalidate
 * its generation and clear the graph/facts/palette together. The caller must
 * first prove that its Worker is still current, so an old Worker can never
 * erase a newer run. */
function failClosedDryWebExactRecheck(status: string): void {
  dryWebPreviewGeneration++;
  clearDryWebPreviewResult();
  phaseASupportStatus.textContent = status;
  phaseASupportStatus.dataset.stale = "true";
  delete phaseASupportStatus.dataset.ok;
  ui.setInternalStructureStatus(status, false);
  // Demand-driven rendering has no animation loop to pick up the cleared
  // graph. One central request keeps both accepted failure paths visually in
  // sync without touching stale-worker early returns.
  render();
}

function settleDryWebPreviewWorkerTerminal(
  worker: Worker,
  kind: DryWebPreviewTerminalKind,
  heavy: HeavyComputationHandle,
): boolean {
  if (worker !== activeDryWebPreviewWorker) return false;
  const decision = dryWebPreviewTerminalDecision(kind);
  if (decision.detachWorker) {
    worker.onmessage = null;
    worker.onerror = null;
    activeDryWebPreviewWorker = null;
    worker.terminate();
  }
  if (decision.clearPending) dryWebPreviewPending = false;
  if (decision.clearPreview) {
    // A failed/stale terminal must not let an earlier graph become current
    // again, even when the Surface fingerprint itself has not changed.
    dryWebPreviewGeneration++;
    clearDryWebPreviewResult();
  }
  if (decision.releaseHeavy) {
    heavy.finish();
    if (dryWebPreviewHeavyComputation?.id === heavy.id) dryWebPreviewHeavyComputation = null;
    if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
  }
  return true;
}

function terminateDryWebPreviewWorker(clearResult = false): void {
  releaseDryWebInsideTargetOverlayForCompetingView();
  clearDryWebInsufficientEdgeOverlayState();
  clearDryWebPreviewStartTimer();
  dryWebPreviewGeneration++;
  const worker = activeDryWebPreviewWorker;
  activeDryWebPreviewWorker = null;
  dryWebPreviewPending = false;
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
  terminateDryWebExactRecheck();
  if (dryWebPreviewHeavyComputation) {
    dryWebPreviewHeavyComputation.finish();
    dryWebPreviewHeavyComputation = null;
  }
  if (clearResult) {
    clearDryWebPreviewResult();
  }
}

function dryWebGenerationCanStart(): boolean {
  return currentDryWebArtworkGraphBoundary().canStart
    && state.skinParams.internalStructure === "targetedGrid"
    && Boolean(surfaceAngleCache && automaticOverhangSupportResult && overhangSupportResult)
    && !activeSurfaceAngleWorker
    && !activeSurfaceSupportClassificationWorker
    && !surfaceHeavyComputation
    && !supportPaintDrag
    && supportPaintApplyReplacePending === 0
    && !(activeSupportPaintWorker && !supportPaintApplyWorkerReady)
    && !activeDryWebPreviewWorker
    && !activeDryWebExactRecheckWorker
    && !dryWebPreviewHeavyComputation
    && !activeStage7ProvisionalRecheckWorker
    && !stage7ProvisionalRecheckHeavyComputation;
}

interface DryWebActionsRefreshOptions {
  /** Reuse a boundary already checked by the caller; useful on hot paths. */
  artworkGraphBoundary?: DryWebArtworkGraphBoundaryDecision;
  /** A running worker cannot be started again; avoid a readiness scan. */
  canGenerate?: boolean;
}

function refreshDryWebActions(status?: string, options: DryWebActionsRefreshOptions = {}): void {
  const targeted = state.skinParams.internalStructure === "targetedGrid";
  const artworkGraphBoundary = options.artworkGraphBoundary ?? currentDryWebArtworkGraphBoundary();
  const contactFacts = targeted ? currentDryWebContactFacts() : undefined;
  syncDryWebContactVisualization(contactFacts);
  const integration = targeted
    ? dryWebAuthorPresentation(
      state.skinParams.dryWebRequiredContacts,
      state.patches.length,
      contactFacts,
    )
    : null;
  if (integration && dryWebContactPresentationOwner !== "dryWeb") {
    // Keep the generator-facts text available for the author, but never leave
    // a legend claiming ownership of colors that a partition/contact view is
    // currently drawing.
    integration.contactBins = null;
  }
  const diagnosisRunning = Boolean(
    activeSurfaceAngleWorker || activeSurfaceSupportClassificationWorker || surfaceHeavyComputation,
  );
  const dryWebRunning = Boolean(
    activeDryWebPreviewWorker
    || activeDryWebExactRecheckWorker
    || dryWebPreviewHeavyComputation
    || activeStage7ProvisionalRecheckWorker
    || stage7ProvisionalRecheckHeavyComputation,
  );
  const dryWebPreviewCurrent = targeted && dryWebPreviewIsCurrent();
  const restoredDryWebCurrent = Boolean(
    targeted
    && restoredCanonicalDryWeb
    && restoredRiskDrivenLattice
    && restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice),
  );
  const graphView = createDryWebGraphViewPresentation({
    graph: dryWebPreviewCurrent && phaseADryWebPreview?.graph?.kind === "targetedGrid"
      ? phaseADryWebPreview.graph
      : restoredDryWebCurrent ? restoredCanonicalDryWeb!.graph : null,
    current: dryWebPreviewCurrent || restoredDryWebCurrent,
    running: dryWebRunning,
    stale: Boolean(phaseADryWebPreview) && !dryWebPreviewCurrent,
  });
  const targetConnectionMapping: DryWebTargetConnectionMappingPresentation =
    createDryWebTargetConnectionMappingPresentation({
      current: dryWebPreviewCurrent,
      running: dryWebRunning,
      stale: Boolean(phaseADryWebPreview) && !dryWebPreviewCurrent,
      facts: dryWebPreviewCurrent ? phaseADryWebPreview?.targetConnectionFacts ?? null : null,
      sourceTargets: dryWebPreviewCurrent ? targetedSupportSource?.targets ?? null : null,
    });
  const insufficientEdge = currentDryWebInsufficientEdgePresentation();
  if (!insufficientEdge.available && dryWebInsufficientEdgeOverlayVisible) {
    dryWebInsufficientEdgeOverlayVisible = false;
    skinRenderer.clearDryWebInsufficientEdgeOverlay();
  }
  const contactFloor = currentDryWebContactFloorPresentation();
  refreshDryWebInsideTargetPresentation();
  const staleSeparation = dryWebSupportSeparation !== null && !dryWebSupportSeparationIsCurrent();
  refreshDryWebSupportSeparationUi();
  const currentSeparation = dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null;
  const readinessStage4: DryWebArtworkReadinessStageState = !targeted
    ? "missing"
    : graphView.state === "current"
      ? "current"
      : graphView.state === "running"
        ? "running"
        : graphView.state === "stale"
          ? "stale"
          : diagnosisRunning
            ? "running"
            : "missing";
  const readinessSurface = integration && integration.status !== "uncomputed" && contactFacts
    ? {
      elementCount: integration.totalPatchCount,
      requiredContacts: integration.requiredContacts,
      passingElementCount: integration.passingPatchCount,
      insufficientElementCount: integration.insufficientPatchCount,
    }
    : null;
  const readinessGraph = graphView.state === "current"
    && graphView.nodeCount !== null
    && graphView.edgeCount !== null
    && contactFacts
    ? {
      nodeCount: graphView.nodeCount,
      edgeCount: graphView.edgeCount,
      componentCount: contactFacts.componentCount,
      mainComponentSize: contactFacts.mainComponentSize,
    }
    : null;
  const readinessSeparation = currentSeparation
    ? {
      tealFaceCount: currentSeparation.mitigatedFaceCount,
      orangeFaceCount: currentSeparation.outsideFaceCount,
      redFaceCount: currentSeparation.unresolvedFaceCount,
    }
    : null;
  ui.setDryWebArtworkReadiness(createDryWebArtworkReadinessPresentation({
    stage3: artworkGraphBoundary.status,
    stage4: readinessStage4,
    stage7: activeDryWebExactRecheckWorker
      ? "running"
      : currentSeparation
        ? "current"
        : staleSeparation
          ? "stale"
          : "missing",
    surface: readinessSurface,
    graph: readinessGraph,
    separation: readinessSeparation,
    configured: {
      requiredContacts: state.skinParams.dryWebRequiredContacts ?? 3,
      minimumDiameterMm: phaseASupportSettings.dryWebMinimumDiameterMm,
      maximumUnreinforcedSpanMm: phaseASupportSettings.dryWebMaximumUnreinforcedLengthMm,
    },
  }));
  const paintPending = Boolean(
    supportPaintDrag
    || supportPaintApplyReplacePending > 0
    || (activeSupportPaintWorker && !supportPaintApplyWorkerReady)
  );
  const hasDiagnosis = Boolean(surfaceAngleCache && automaticOverhangSupportResult && overhangSupportResult);
  const detail = status
    ?? (!targeted
      ? "Dry Webは「プレートが実」で使います"
      : !artworkGraphBoundary.canStart
        ? artworkGraphBoundary.reason
      : diagnosisRunning
        ? "Surface診断中です。完了後にPaint分類を確認できます"
        : dryWebRunning
          ? "Dry Web生成中です。下部のキャンセルで停止できます"
          : paintPending
            ? "Paint分類の確定を待っています"
            : !hasDiagnosis
              ? "先にDry Web用のSurface診断を実行してください"
              : "insideの自動分類を確認し、必要ならPaint後にDry Web生成を押してください");
  ui.setDryWebActionsState({
    visible: targeted,
    canDiagnose: targeted && !diagnosisRunning && !dryWebRunning && !paintPending,
    diagnosisRunning,
    canGenerate: options.canGenerate ?? dryWebGenerationCanStart(),
    generateRunning: dryWebRunning,
    status: detail,
    graphView,
    targetConnectionMapping,
    insufficientEdge,
    insufficientEdgeVisible: dryWebInsufficientEdgeOverlayVisible,
    contactFloor,
    contactFloorOverlay: currentDryWebContactFloorOverlayPresentation(),
    integrationStatus: integration?.text,
    integration: integration
      ? {
        status: integration.status,
        text: integration.text,
        requiredContacts: integration.requiredContacts,
        contactBins: integration.contactBins,
      }
      : undefined,
  });
}

function invalidateDryWebPreviewForInputChange(status: string): void {
  clearStage7CanonicalCandidateAdoption();
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  dryWebAuthorIntegrationPresentation = false;
  terminateDryWebPreviewWorker(true);
  // The exact post-Dry-Web Surface recheck shares the legacy Surface
  // diagnosis button.  Invalidation/cancel must release that UI lock even
  // though the recheck worker is owned by the Dry Web request.
  ui.setSurfaceAngleDiagnosisRunning(false);
  internalStructureGraph = null;
  internalStructureFingerprint = "";
  skinRenderer.setInternalStructure(null);
  refreshInternalAngleScreening(null);
  syncPhaseASupportPreviewAvailability(null);
  phaseASupportStatus.textContent = status;
  phaseASupportStatus.dataset.stale = "true";
  delete phaseASupportStatus.dataset.ok;
  ui.setInternalStructureStatus(status, false);
  ui.setSurfaceAngleDiagnosisStatus(status, false);
  refreshDryWebActions(status);
  render();
}

function dryWebProgressDetail(progress: DryWebPreviewProgress): string {
  if (progress.phase === "routing") return `Dry Web routing ${progress.completed}/${progress.total}`;
  if (progress.phase === "pair-search") return `Dry Web候補探索 ${progress.completed}/${progress.total}組`;
  if (progress.phase === "candidate-ordering") return "Dry Web候補順序を確定中";
  if (progress.phase === "tree") return "Dry Web spanning treeを構築中";
  if (progress.phase === "target-connections") {
    return `Dry Web target接続 ${progress.completed}/${progress.total}`;
  }
  return "Dry Web graph構築完了・付加後exact再診断は未実行";
}

function dryWebProgressPercent(progress: DryWebPreviewProgress): number {
  const fraction = progress.total > 0
    ? Math.max(0, Math.min(1, progress.completed / progress.total))
    : 0;
  switch (progress.phase) {
    case "routing": return 99 + fraction * 0.02;
    case "pair-search": return 99.02 + fraction * 0.18;
    case "candidate-ordering": return 99.20 + fraction * 0.03;
    case "tree": return 99.23 + fraction * 0.12;
    case "target-connections": return 99.35 + fraction * 0.14;
    case "complete": return 99.49;
  }
}

function cancelDryWebPreviewUpdate(): void {
  if (!activeDryWebPreviewWorker && !activeDryWebExactRecheckWorker && !dryWebPreviewHeavyComputation) return;
  phaseASupportStatus.textContent = "Dry Webをキャンセル中…";
  phaseASupportStatus.dataset.stale = "true";
  terminateDryWebPreviewWorker(true);
  ui.setSurfaceAngleDiagnosisRunning(false);
  internalStructureGraph = null;
  internalStructureFingerprint = "";
  skinRenderer.setInternalStructure(null);
  refreshInternalAngleScreening(null);
  syncPhaseASupportPreviewAvailability(null);
  ui.setInternalStructureStatus("Dry Web生成をキャンセルしました", false);
  ui.setSurfaceAngleDiagnosisStatus("Dry Web生成をキャンセルしました", false);
  phaseASupportStatus.textContent = "Dry Web生成をキャンセルしました";
  delete phaseASupportStatus.dataset.ok;
  refreshDryWebActions("Dry Web生成をキャンセルしました。Paint分類は保持されています。もう一度生成できます");
  render();
}

/** Start the existing exact post-attachment diagnosis only from its explicit
 * Stage 7 action. The generator itself stops after publishing its current
 * graph, so this separate heavy operation is observable and cancellable. */
function requestDryWebExactRecheck(): void {
  const presentation = currentDryWebExactRecheckPresentation();
  if (!presentation.enabled) {
    refreshDryWebActions(presentation.reason);
    return;
  }
  const baseDiagnosis = surfaceAngleCache;
  const graph = phaseADryWebPreview?.graph;
  if (!baseDiagnosis || !graph || graph.kind !== "targetedGrid") {
    // Keep the guard close to the existing canonical inputs as a second
    // fail-closed check; no exact Worker is started without both facts.
    refreshDryWebActions("Dry Web graphまたはSurface診断がcurrentではありません。旧Stage 7 factsは表示しません。");
    return;
  }

  const expectedCanonicalCandidate = stage7CanonicalCandidateAdoption
    && stage7CanonicalCandidateAdoptionIsCurrent()
    ? stage7CanonicalCandidateAdoption
    : null;
  // A repeat is still an explicit new exact run. Do not show the previous
  // separation/red-face facts while this run is pending.
  clearDryWebSupportSeparation(expectedCanonicalCandidate !== null);
  let heavy: HeavyComputationHandle | null = null;
  const cancel = (): void => {
    if (heavy && dryWebPreviewHeavyComputation?.id === heavy.id) cancelDryWebPreviewUpdate();
  };
  heavy = beginHeavyComputation("Dry Web付加後Surface再診断 全体進捗", cancel);
  dryWebPreviewHeavyComputation = heavy;
  phaseASupportStatus.textContent = "Dry Web生成完了 · Dry Web付加後Surfaceを再診断中…";
  phaseASupportStatus.dataset.stale = "true";
  delete phaseASupportStatus.dataset.ok;
  refreshDryWebActions("Dry Web付加後Surfaceを再診断中…");
  recheckTargetedGridFromExactMesh(baseDiagnosis, graph, heavy, expectedCanonicalCandidate);
}

interface DryWebPreviewUpdateOptions {
  heavy?: HeavyComputationHandle;
}

function requestDryWebPreviewUpdate(reason: string, options: DryWebPreviewUpdateOptions = {}): void {
  if (supportPaintDrag) return;
  if (state.skinParams.internalStructure !== "targetedGrid") {
    terminateDryWebPreviewWorker(true);
    return;
  }
  const artworkGraphBoundary = currentDryWebArtworkGraphBoundary();
  if (!artworkGraphBoundary.canStart) {
    invalidateDryWebPreviewForInputChange(artworkGraphBoundary.reason);
    return;
  }
  const result = overhangSupportResult;
  const context = supportPaintEditingContext();
  if (!surfaceAngleCache || !result || !context) {
    terminateDryWebPreviewWorker(true);
    skinRenderer.setInternalStructure(null);
    refreshInternalAngleScreening(null);
    return;
  }
  if (!dryWebGenerationCanStart() && !options.heavy) {
    refreshDryWebActions("Dry Web生成の前提が未完了です。Surface診断とPaint確定を確認してください");
    return;
  }
  const artworkGraphForRun = artworkGraphSnapshot;
  const artworkGraphSourceKeyForRun = artworkGraphSourceKey;
  if (!artworkGraphForRun || !artworkGraphSourceKeyForRun) {
    invalidateDryWebPreviewForInputChange(
      `Dry Web生成を開始できません。${DRY_WEB_ARTWORK_GRAPH_REFRESH_PROMPT}`,
    );
    return;
  }
  let snapshotPatches: Patch[];
  try {
    snapshotPatches = cloneDryWebArtworkGraphPatches(artworkGraphForRun);
  } catch (error) {
    invalidateDryWebPreviewForInputChange(
      `Dry Web生成を開始できません。Stage 3 snapshotのPatch factsを読み出せません。${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  // Any Paint/Internal refresh returns to step 7. A previously requested
  // removable-support preview must not survive across that author boundary.
  phaseASupportPreviewRequested = false;
  phaseARefreshButton.disabled = true;
  skinRenderer.setPhaseASupportPreview(null, [], context.scaleMmPerUnit, 0);
  terminateDryWebPreviewWorker(true);
  let heavy = options.heavy ?? null;
  let ownsHeavy = false;
  if (!heavy) {
    let localHeavy: HeavyComputationHandle | null = null;
    const cancel = (): void => {
      if (localHeavy && dryWebPreviewHeavyComputation?.id === localHeavy.id) cancelDryWebPreviewUpdate();
    };
    localHeavy = beginHeavyComputation("Dry Web 全体進捗", cancel);
    heavy = localHeavy;
    dryWebPreviewHeavyComputation = localHeavy;
    ownsHeavy = true;
  }
  const worker = new Worker(new URL("./dryWebPreview.worker.ts", import.meta.url), { type: "module" });
  const generation = ++dryWebPreviewGeneration;
  const requestId = ++dryWebPreviewRequestId;
  const paintRevision = supportPaintSession.revision;
  const surfaceFingerprint = currentTargetSurfaceFingerprint();
  const resolutionForRun = surfaceAngleCache.resolution;
  const patchSetRevisionForRun = state.patchSetRevision;
  activeDryWebPreviewWorker = worker;
  dryWebPreviewPending = true;
  phaseASupportStatus.textContent = reason + " · Dry Web Worker更新中…";
  phaseASupportStatus.dataset.stale = "true";
  refreshDryWebActions("Dry Web生成中です。進捗は下部に表示されます");
  worker.onmessage = (event: MessageEvent<DryWebPreviewWorkerMessage>) => {
    const message = event.data;
    if (worker !== activeDryWebPreviewWorker || message.generation !== dryWebPreviewGeneration || message.requestId !== requestId) {
      // An old worker may still deliver one queued event after a new run has
      // taken ownership. Detach only that old worker; never clear the new run.
      if (worker !== activeDryWebPreviewWorker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      }
      return;
    }
    if (message.type === "progress" || message.type === "result") {
      // Progress can be emitted many thousands of times. Keep this path to
      // scalar/identity checks; canonicalizing all current Patch facts is
      // reserved for the terminal result below.
      const artworkGraphWasReplaced = artworkGraphSnapshot !== artworkGraphForRun
        || artworkGraphSourceKey !== artworkGraphSourceKeyForRun
        || state.patchSetRevision !== patchSetRevisionForRun;
      const currentArtworkGraphBoundary = message.type === "result"
        ? currentDryWebArtworkGraphBoundary()
        : null;
      const artworkGraphStale = message.type === "result"
        ? currentArtworkGraphBoundary!.status !== "current" || artworkGraphWasReplaced
        : artworkGraphWasReplaced;
      if (
        artworkGraphStale
        || message.paintRevision !== paintRevision
        || message.surfaceFingerprint !== surfaceFingerprint
        || message.resolution !== resolutionForRun
      ) {
        settleDryWebPreviewWorkerTerminal(worker, "stale", heavy!);
        const staleStatus = currentArtworkGraphBoundary && currentArtworkGraphBoundary.status !== "current"
          ? currentArtworkGraphBoundary.reason
          : artworkGraphWasReplaced
            ? `Stage 3 snapshotが置き換わりました。${DRY_WEB_ARTWORK_GRAPH_REFRESH_PROMPT}`
            : "Dry Web生成結果が古くなりました。もう一度生成してください";
        phaseASupportStatus.textContent = staleStatus;
        phaseASupportStatus.dataset.stale = "true";
        delete phaseASupportStatus.dataset.ok;
        ui.setInternalStructureStatus(staleStatus, false);
        ui.setSurfaceAngleDiagnosisStatus(staleStatus, false);
        ui.setSurfaceAngleDiagnosisRunning(false);
        refreshDryWebActions(staleStatus);
        render();
        return;
      }
    }
    if (message.type === "progress") {
      const detail = dryWebProgressDetail(message);
      heavy!.updateActual(detail, dryWebProgressPercent(message));
      phaseASupportStatus.textContent = reason + " · " + detail;
      phaseASupportStatus.dataset.stale = "true";
      ui.setSurfaceAngleDiagnosisStatus(reason + " · " + detail + " · 画面は操作できます");
      refreshSurfaceStartupStatus(detail);
      refreshDryWebActions(detail, { artworkGraphBoundary, canGenerate: false });
      return;
    }
    if (message.type === "error") {
      settleDryWebPreviewWorkerTerminal(worker, "message-error", heavy!);
      phaseASupportStatus.textContent = "Dry Web preview Worker失敗: " + message.message;
      phaseASupportStatus.dataset.ok = "false";
      phaseASupportStatus.dataset.stale = "true";
      ui.setInternalStructureStatus("Dry Web preview Worker失敗: " + message.message, false);
      ui.setSurfaceAngleDiagnosisStatus("Dry Web preview Worker失敗: " + message.message, false);
      ui.setSurfaceAngleDiagnosisRunning(false);
      refreshDryWebActions("Dry Web生成に失敗しました。プレビューを破棄しました。Paint分類は保持されています");
      render();
      return;
    }
    settleDryWebPreviewWorkerTerminal(worker, "success", heavy!);
    phaseADryWebPreview = {
      surfaceFingerprint: message.surfaceFingerprint,
      resolution: message.resolution,
      paintRevision: message.paintRevision,
      artworkGraphSnapshot: artworkGraphForRun,
      artworkGraphSourceKey: artworkGraphSourceKeyForRun,
      graph: message.graph,
      targetConnectionFacts: message.targetConnectionFacts ?? null,
      contactFloorFacts: message.contactFloorFacts ?? null,
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
    skinRenderer.setInternalStructure(message.graph);
    refreshInternalAngleScreening(message.graph);
    syncPhaseASupportPreviewAvailability(message.graph);
    keepInternalGraphVisibleInMesh(message.graph);
    heavy!.updateActual("Dry Web graph構築完了", 100);
    heavy!.finish();
    if (ownsHeavy && dryWebPreviewHeavyComputation?.id === heavy!.id) dryWebPreviewHeavyComputation = null;
    if (surfaceHeavyComputation?.id === heavy!.id) surfaceHeavyComputation = null;
    ui.setSurfaceAngleDiagnosisRunning(false);
    phaseASupportStatus.textContent = `${reason} · Dry Web graph構築完了 / Worker ${message.computeMs.toFixed(1)}ms · 付加後exact再診断は未実行`;
    delete phaseASupportStatus.dataset.stale;
    refreshDryWebActions("Dry Web生成が完了しました。generator facts only / mesh / printability未判定。付加後exact診断は未実行です。Stage 7の「Dry Web付加後を再診断」で実行できます");
    render();
  };
  worker.onerror = (event) => {
    if (worker !== activeDryWebPreviewWorker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      return;
    }
    settleDryWebPreviewWorkerTerminal(worker, "onerror", heavy!);
    phaseASupportStatus.textContent = "Dry Web preview Worker失敗: " + event.message;
    phaseASupportStatus.dataset.ok = "false";
    phaseASupportStatus.dataset.stale = "true";
    ui.setInternalStructureStatus("Dry Web preview Worker失敗: " + event.message, false);
    ui.setSurfaceAngleDiagnosisStatus("Dry Web preview Worker失敗: " + event.message, false);
    ui.setSurfaceAngleDiagnosisRunning(false);
    refreshDryWebActions("Dry Web Workerに失敗しました。プレビューを破棄しました。Paint分類は保持されています");
    render();
  };
  const request: DryWebPreviewWorkerRequest = {
    type: "build",
    generation,
    requestId,
    paintRevision,
    surfaceFingerprint,
    resolution: resolutionForRun,
    entries: result.entries.map((entry) => ({
      ...entry,
      ...(entry.positionMm ? { positionMm: { ...entry.positionMm } } : {}),
      ...(entry.normal ? { normal: { ...entry.normal } } : {}),
    })),
    scaleMmPerUnit: context.scaleMmPerUnit,
    host: state.host.map((ball) => ({ ...ball })),
    hostK: state.hostParams.k,
    patches: snapshotPatches,
    internalDensity: state.skinParams.internalDensity,
    internalRadius: state.skinParams.internalRadius,
    dryWebRequiredContacts: normalizeDryWebRequiredContacts(state.skinParams.dryWebRequiredContacts),
  };
  worker.postMessage(request);
}

function refreshPhaseASupportPreview(): void {
  const result = overhangSupportResult;
  const context = supportPaintEditingContext();
  const internalGraph = getInternalStructureGraph();
  syncPhaseAVerticalControl();
  syncPhaseASupportPreviewAvailability(internalGraph);
  const separationBlockReason = dryWebSupportSeparationOutputBlockReason(
    state.skinParams.internalStructure,
    dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null,
  );
  if (separationBlockReason) {
    phaseASupportPreviewRequested = false;
    skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
    phaseASupportStatus.textContent = separationBlockReason;
    phaseASupportStatus.dataset.stale = "true";
    delete phaseASupportStatus.dataset.ok;
    return;
  }
  if (!surfaceAngleCache || !result || !context || !internalGraph?.edges.length) {
    skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
    phaseASupportStatus.textContent = "先に工程7でInternal Structureを生成・確認してください";
    delete phaseASupportStatus.dataset.ok;
    return;
  }
  if (!phaseASupportPreviewRequested) {
    skinRenderer.setPhaseASupportPreview(null, [], context.scaleMmPerUnit, 0);
    phaseASupportStatus.textContent = "Internal Structure生成済み · 確認後にボタンを押して工程9へ進みます";
    delete phaseASupportStatus.dataset.ok;
    return;
  }
  try {
    let plateZMm = Infinity;
    for (let offset = 2; offset < context.positionsMm.length; offset += 3) {
      plateZMm = Math.min(plateZMm, context.positionsMm[offset]);
    }
    if (!Number.isFinite(plateZMm)) throw new Error("BODYの最下面を求められません");
    const targetedGrid = state.skinParams.internalStructure === "targetedGrid";
    const stage8Selection = targetedGrid
      ? selectStage8RemovableSupportPreviewLeaves({
        entries: result.entries,
        separation: dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null,
        maximumLeaves: PHASE_A_SUPPORT_PREVIEW_MAX_LEAVES,
      })
      : null;
    const outsidePreview = stage8Selection ?? selectSupportForestPreviewLeaves(
      result.entries,
      PHASE_A_SUPPORT_PREVIEW_MAX_LEAVES,
    );
    const outsideLeaves = outsidePreview.leaves;
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
    const retained = !targetedGrid && phaseASupportSettings.baseVolumeVerticalSupports
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
    skinRenderer.setPhaseASupportPreview(
      forest,
      retained,
      context.scaleMmPerUnit,
      phaseASupportSettings.objectLiftMm,
    );
    const stats = forest.stats;
    const dryWebText = reinforcedDryWeb && dryWebPreview
      ? `Dry Web ${reinforcedDryWeb.edges.length.toLocaleString()} edge / 最小径${phaseASupportSettings.dryWebMinimumDiameterMm.toFixed(1)}mm / `
        + (dryWebPreview.facts
          ? dryWebRoutingFactsText(dryWebPreview.facts)
          : "Stage 7作品候補を採用済み · 旧generator factsは無効 · exact再診断が必要")
        + ` / Worker ${dryWebPreview.computeMs.toFixed(1)}ms`
      : dryWebPreviewPending
        ? "Dry Web Worker更新中"
        : "Dry Web未生成";
    const outsidePreviewText = stage8Selection
      ? `exact orange faces ${stage8Selection.exactOrangeFaceCount.toLocaleString()} / diagnosed sites used ${stage8Selection.diagnosedEligibleSiteCount.toLocaleString()} / old pre-attachment outside sites excluded ${stage8Selection.excludedPreAttachmentDiagnosedOutsideSiteCount.toLocaleString()} / explicit profile sites retained ${stage8Selection.explicitEligibleSiteCount.toLocaleString()} / sampled ${stage8Selection.sampledCount.toLocaleString()}${stage8Selection.limited ? " / limited" : ""}${stage8Selection.failClosedReason ? ` / fail-closed: ${stage8Selection.failClosedReason}` : ""}`
      : outsidePreview.limited
        ? `outside葉 preview ${outsideLeaves.length.toLocaleString()} / 全体 ${outsidePreview.eligibleOutsideLeafCount.toLocaleString()}（表示用sample）`
        : `outside葉 ${outsideLeaves.length.toLocaleString()} / 全体 ${outsidePreview.eligibleOutsideLeafCount.toLocaleString()}`;
    phaseASupportStatus.textContent =
      `${phaseASupportSettings.supportMode === "branching" ? "Branching" : "Vertical"} · ${outsidePreviewText} / `
      + `最下面cradle ${cradleLeaves.length.toLocaleString()} / branch ${stats.branchCount.toLocaleString()} / `
      + `brace ${stats.braceCount.toLocaleString()} / foot ${stats.rootCount.toLocaleString()} / `
      + `最大部材 ${stats.maximumMemberLengthMm.toFixed(1)}mm / 最大角 ${stats.maximumBranchAngleDeg.toFixed(1)}° / `
      + (targetedGrid
        ? `base内 retained ${retained.length.toLocaleString()}（Dry Webでは生成しない） / ${dryWebText}`
        : `base内 retained ${retained.length.toLocaleString()} / ${dryWebText}`);
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
  if (state.skinParams.internalStructure === "targetedGrid" && supportPaintMode === "outside") supportPaintMode = "inside";
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
    invalidateDryWebPreviewForInputChange("Support Paintを復元しました。Dry Web生成を押して反映してください");
    reapplySupportPaint(source === "autosave" ? "autosaveからSupport Paintを復元しました" : "draftからSupport Paintを復元しました", supportPaintSession.history.present);
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
    allowOutside: state.skinParams.internalStructure !== "targetedGrid",
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
  refreshDryWebActions();
  refreshBottomStatusPane();
  syncProjectBar();
}

function invalidateSupportPaintEditingResources(): void {
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
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
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
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
  clearStage7CanonicalCandidateAdoption();
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  if (!surfaceAngleCache || !overhangSupportResult || state.skinParams.internalStructure !== "targetedGrid") return;
  const sourceLongest = triangleSoupLongestExtent(surfaceAngleCache.basePositions);
  const scaleMmPerUnit = ui.getMeshOptions().targetLongestMm / sourceLongest;
  if (!(scaleMmPerUnit > 0)) return;
  targetedSupportSource = {
    surfaceFingerprint: currentTargetSurfaceFingerprint(),
    resolution: surfaceAngleCache.resolution,
    targets: sourceDryWebTargets(overhangSupportResult, scaleMmPerUnit),
  };
  clearStage7RedFaceReinforcementPlan();
  phaseADryWebPreview = null;
  internalStructureFingerprint = "";
  internalStructureGraph = null;
  skinRenderer.setInternalStructure(null);
  refreshInternalAngleScreening(null);
  ui.setInternalStructureStatus("Support Paint routing更新済み · Dry Web生成ボタンで適用します");
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
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
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
    invalidateDryWebPreviewForInputChange("Support Paint分類が更新されました。Dry Web生成を押して反映してください");
  }
}

function terminateSupportPaintApplyWorker(): void {
  if (activeSupportPaintWorker) activeSupportPaintWorker.terminate();
  activeSupportPaintWorker = null;
  supportPaintApplyWorkerReady = false;
  supportPaintApplyReplacePending = 0;
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
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
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
        refreshSupportPaintUi(
          status + " · Paint差分Worker ready " + message.computeMs.toFixed(1)
          + "ms / round-trip " + (performance.now() - initializedAt).toFixed(1) + "ms",
        );
        return;
      }
      if (message.type === "replace" || message.type === "restore") {
        supportPaintApplyReplacePending = Math.max(0, supportPaintApplyReplacePending - 1);
        if (message.revision !== supportPaintSession.revision) return;
        applySupportPaintLiveSnapshot(message.changes, message.facts, false);
        refreshLiveSupportPaintCounts();
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
  invalidateDryWebPreviewForInputChange("Support Paintを戻しました。Dry Web生成を押して反映してください");
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
    reapplySupportPaint("Support Paintの直前1操作を戻しました", supportPaintSession.history.present);
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
  invalidateDryWebPreviewForInputChange("Support Paintを進めました。Dry Web生成を押して反映してください");
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
    reapplySupportPaint("Support Paintの直前1操作を進めました", supportPaintSession.history.present);
  }
}

function targetedSupportSourceIsCurrent(): boolean {
  if (!targetedSupportSource) return false;
  return targetedSupportSource.surfaceFingerprint === currentTargetSurfaceFingerprint()
    && targetedSupportSource.resolution === Math.max(16, Math.round(ui.getMeshOptions().resolution));
}

function dryWebInsideTargetRunActive(): boolean {
  return Boolean(
    activeDryWebPreviewWorker
    || activeDryWebExactRecheckWorker
    || dryWebPreviewHeavyComputation
    || activeSurfaceAngleWorker
    || activeSurfaceSupportClassificationWorker
    || surfaceHeavyComputation
    || supportPaintDrag
    || supportPaintApplyReplacePending > 0
    || (activeSupportPaintWorker && !supportPaintApplyWorkerReady)
    || activeStage7ProvisionalRecheckWorker
    || stage7ProvisionalRecheckHeavyComputation
    || stage7ProvisionalRecheckRunBinding,
  );
}

function currentDryWebInsideTargetPresentationState(): DryWebInsideTargetPresentationState {
  if (dryWebInsideTargetRunActive()) return "running";
  if (state.skinParams.internalStructure !== "targetedGrid") return "missing";
  const artworkGraphBoundary = currentDryWebArtworkGraphBoundary();
  if (artworkGraphBoundary.status === "stale") return "stale";
  if (artworkGraphBoundary.status !== "current") return "missing";
  if (!dryWebPreviewIsCurrent() || !targetedSupportSourceIsCurrent()) {
    return phaseADryWebPreview || targetedSupportSource ? "stale" : "missing";
  }
  return "current";
}

function refreshDryWebInsideTargetPresentation(): void {
  const state = currentDryWebInsideTargetPresentationState();
  let presentation = createDryWebInsideTargetPresentation({
    state,
    targets: state === "current" ? targetedSupportSource?.targets ?? null : null,
    visible: dryWebInsideTargetOverlayVisible,
  });
  if (!presentation.available && dryWebInsideTargetOverlayVisible) {
    dryWebInsideTargetOverlayVisible = false;
    skinRenderer.clearOverhangSupportSiteOverlay();
    presentation = createDryWebInsideTargetPresentation({
      state,
      targets: state === "current" ? targetedSupportSource?.targets ?? null : null,
      visible: false,
    });
  }
  ui.setDryWebInsideTargetPresentation(presentation);
}

function releaseDryWebInsideTargetOverlayForCompetingView(): void {
  const hadInsideOverlay = dryWebInsideTargetOverlayVisible;
  const hadContactFloorOverlay = dryWebContactFloorOverlayVisible !== null;
  if (hadInsideOverlay) {
    dryWebInsideTargetOverlayVisible = false;
    skinRenderer.clearOverhangSupportSiteOverlay();
    refreshDryWebInsideTargetPresentation();
  }
  if (hadContactFloorOverlay) {
    clearDryWebContactFloorOverlayState();
  }
  if (hadContactFloorOverlay) refreshDryWebActions();
}

function setDryWebInsideTargetOverlayVisible(visible: boolean): void {
  if (!visible) {
    if (!dryWebInsideTargetOverlayVisible) {
      refreshDryWebInsideTargetPresentation();
      return;
    }
    dryWebInsideTargetOverlayVisible = false;
    skinRenderer.clearOverhangSupportSiteOverlay();
    refreshOverhangSupportSiteOverlay();
    refreshDryWebInsideTargetPresentation();
    render();
    return;
  }

  const state = currentDryWebInsideTargetPresentationState();
  const presentation = createDryWebInsideTargetPresentation({
    state,
    targets: state === "current" ? targetedSupportSource?.targets ?? null : null,
    visible: true,
  });
  if (!presentation.available) {
    refreshDryWebInsideTargetPresentation();
    return;
  }
  releaseDryWebContactFloorOverlayForCompetingView();
  releaseDryWebSupportSeparationPresentationForCompetingView();
  dryWebInsideTargetOverlayVisible = true;
  skinRenderer.setOverhangSupportSiteOverlay(
    presentation.markers,
    new Float32Array(),
    new Float32Array(),
    supportSiteDepthMode,
    "dryWebInside",
  );
  ui.setDryWebInsideTargetPresentation(presentation);
  render();
}

function clearDryWebContactFloorOverlayState(): void {
  dryWebContactFloorOverlayVisible = null;
  skinRenderer.clearDryWebContactFloorOverlay();
}

function releaseDryWebContactFloorOverlayForCompetingView(): void {
  if (dryWebContactFloorOverlayVisible === null) return;
  clearDryWebContactFloorOverlayState();
  refreshDryWebActions();
}

function setDryWebContactFloorOverlay(category: DryWebContactFloorResidualCategory | null): void {
  if (category === null) {
    clearDryWebContactFloorOverlayState();
    refreshDryWebActions();
    render();
    return;
  }
  const presentation = createDryWebContactFloorOverlayPresentation({
    current: state.skinParams.internalStructure === "targetedGrid" && dryWebPreviewIsCurrent(),
    running: state.skinParams.internalStructure === "targetedGrid" && dryWebInsideTargetRunActive(),
    stale: state.skinParams.internalStructure === "targetedGrid"
      && Boolean(phaseADryWebPreview)
      && !dryWebPreviewIsCurrent(),
    surfaceContextVisible: internalObservationMode !== "internalOnly",
    snapshot: dryWebPreviewIsCurrent() ? artworkGraphSnapshot : null,
    contactFloor: dryWebPreviewIsCurrent() ? currentDryWebContactFloorPresentation() : null,
    category,
    enabled: true,
  });
  if (!presentation.available) {
    clearDryWebContactFloorOverlayState();
    refreshDryWebActions();
    return;
  }
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebSupportSeparationPresentationForCompetingView();
  dryWebContactFloorOverlayVisible = category;
  skinRenderer.setDryWebContactFloorOverlay(presentation.markers, category);
  refreshDryWebActions();
  render();
}

function clearDryWebInsufficientEdgeOverlayState(): void {
  dryWebInsufficientEdgeOverlayVisible = false;
  skinRenderer.clearDryWebInsufficientEdgeOverlay();
}

function releaseDryWebInsufficientEdgeOverlayForCompetingView(): void {
  const hadInsufficientEdgeOverlay = dryWebInsufficientEdgeOverlayVisible;
  const hadContactFloorOverlay = dryWebContactFloorOverlayVisible !== null;
  if (hadInsufficientEdgeOverlay) clearDryWebInsufficientEdgeOverlayState();
  if (hadContactFloorOverlay) clearDryWebContactFloorOverlayState();
  if (hadInsufficientEdgeOverlay || hadContactFloorOverlay) refreshDryWebActions();
}

function setDryWebInsufficientEdgeOverlayVisible(visible: boolean): void {
  if (!visible) {
    if (!dryWebInsufficientEdgeOverlayVisible) {
      skinRenderer.clearDryWebInsufficientEdgeOverlay();
      refreshDryWebActions();
      return;
    }
    dryWebInsufficientEdgeOverlayVisible = false;
    skinRenderer.clearDryWebInsufficientEdgeOverlay();
    refreshDryWebActions();
    render();
    return;
  }

  const presentation = currentDryWebInsufficientEdgePresentation();
  if (!presentation.available) {
    refreshDryWebActions();
    return;
  }
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebSupportSeparationPresentationForCompetingView();
  dryWebInsufficientEdgeOverlayVisible = true;
  skinRenderer.setDryWebInsufficientEdgeOverlay(presentation.edges);
  refreshDryWebActions();
  render();
}

function currentSkinRebuildPipelineSettings(): SkinRebuildSettings {
  const radii = state.patches.flatMap((patch) => patch.points.map((point) => point.r)).filter(Number.isFinite);
  const averageRadius = radii.length > 0 ? radii.reduce((sum, value) => sum + value, 0) / radii.length : DEFAULT_SKIN_REBUILD_SETTINGS.patternRadius;
  return {
    ...DEFAULT_SKIN_REBUILD_SETTINGS,
    patternCount: Math.max(1, state.patches.length),
    strutDiameterMm: Number(skinRebuildDiameterInput?.value ?? DEFAULT_SKIN_REBUILD_SETTINGS.strutDiameterMm),
    supportDiameterMm: Number(skinRebuildSupportDiameterInput?.value ?? DEFAULT_SKIN_REBUILD_SETTINGS.supportDiameterMm),
    targetLongestMm: 80,
    surfaceThickness: state.skinParams.thickness,
    patternRadius: Math.max(0.18, Math.min(0.38, averageRadius)),
    roundK: state.skinParams.roundK,
    overhangThresholdDeg: Number(skinRebuildThresholdInput?.value ?? DEFAULT_SKIN_REBUILD_SETTINGS.overhangThresholdDeg),
    analysisResolution: 48,
    exportResolution: 128,
  };
}

function refreshSkinRebuildViewportSelectionStatus(edgeId: number | null = null): void {
  const status = skinRebuildViewportSelectionStatus;
  if (!status) return;
  const overhang = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.overhang : null;
  const selectedRegions = overhang?.regions.filter((candidate) => skinRebuildSelectedOverhangRegionIds.has(candidate.id)) ?? [];
  if (selectedRegions.length > 0) {
    const faceCount = selectedRegions.reduce((sum, region) => sum + region.faceCount, 0);
    const reinforcedCount = selectedRegions.filter((region) => skinRebuildReinforcedOverhangRegionIds.has(region.id)).length;
    status.textContent = `赤面エリア ${selectedRegions.length}領域（${faceCount.toLocaleString()}面）を黄色で選択中 · 補強済み${reinforcedCount} · Shift追加 / Ctrl除外${skinRebuildRegionDragSelectEnabled ? " / ドラッグ選択ON" : ""}`;
    status.dataset.mode = "overhang-region";
    return;
  }
  if (skinRebuildViewportSelectionMode === "pattern") {
    status.textContent = skinRebuildRegionDragSelectEnabled
      ? "黄色い四角形で赤面を囲んで複数選択します。Shiftで追加、Ctrlで四角形内の領域を除外します。"
      : "表面パターンまたは赤い危険面エリアをクリックします。Shiftで赤面を追加、Ctrlで除外できます。";
    status.dataset.mode = "pattern";
    return;
  }
  const graph = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project?.lattice ?? null : null;
  status.dataset.mode = "lattice-edge";
  status.textContent = edgeId !== null
    ? `蜘蛛ラティス線 #${edgeId + 1}を黄色で選択中です。右の工程5Aから削除できます。`
    : graph?.edges.length
      ? "水色の蜘蛛ラティス線、または赤い危険面エリアをクリックしてください。"
      : "赤い危険面エリアを選択できます。線は工程5Aで蜘蛛ラティスを生成すると選べます。";
}

function refreshSkinRebuildSelectedRegion(): void {
  const overhang = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.overhang : null;
  const project = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project : null;
  const validIds = new Set(overhang?.regions.map((region) => region.id) ?? []);
  skinRebuildSelectedOverhangRegionIds = new Set(
    [...skinRebuildSelectedOverhangRegionIds].filter((regionId) => validIds.has(regionId)),
  );
  const selectedRegions = overhang?.regions.filter((region) => skinRebuildSelectedOverhangRegionIds.has(region.id)) ?? [];
  skinRenderer.setReinforcedSkinRebuildOverhangRegions([...skinRebuildReinforcedOverhangRegionIds]);
  skinRenderer.setSelectedSkinRebuildOverhangRegions([...skinRebuildSelectedOverhangRegionIds]);
  if (!skinRebuildSelectedRegionStatus || !skinRebuildSelectedRegionReinforceButton) {
    refreshSkinRebuildViewportSelectionStatus();
    return;
  }
  if (!overhang || selectedRegions.length === 0) {
    skinRebuildSelectedRegionStatus.textContent = overhang
      ? "赤面エリアをクリック、Shift+クリック、またはドラッグで選択してください"
      : "工程4を実行すると連続する赤面をエリア単位で選べます";
    skinRebuildSelectedRegionReinforceButton.disabled = true;
    refreshSkinRebuildViewportSelectionStatus();
    return;
  }
  const totalSourceArea = overhang.regions.reduce((sum, candidate) => sum + candidate.areaSourceSquared, 0);
  const selectedAreaSource = selectedRegions.reduce((sum, region) => sum + region.areaSourceSquared, 0);
  const areaMm2 = totalSourceArea > 0 ? overhang.areaMm2 * selectedAreaSource / totalSourceArea : 0;
  const reinforcedCount = selectedRegions.filter((region) => skinRebuildReinforcedOverhangRegionIds.has(region.id)).length;
  const pendingCount = selectedRegions.length - reinforcedCount;
  skinRebuildSelectedRegionStatus.textContent = `選択 ${selectedRegions.length}領域 · ${selectedRegions.reduce((sum, region) => sum + region.faceCount, 0).toLocaleString()}面 · 約${areaMm2.toFixed(1)} mm² · 未補強${pendingCount} / 緑表示${reinforcedCount}`;
  skinRebuildSelectedRegionReinforceButton.disabled = pendingCount === 0 || !project?.lattice.edges.length;
  refreshSkinRebuildViewportSelectionStatus();
}

function setSkinRebuildOverhangRegionSelection(
  regionId: number | null,
  operation: "replace" | "add" | "remove" = "replace",
): boolean {
  return setSkinRebuildOverhangRegionSelections(
    regionId === null ? [] : [regionId],
    operation,
  ) > 0;
}

function setSkinRebuildOverhangRegionSelections(
  regionIds: readonly number[],
  operation: "replace" | "add" | "remove" = "replace",
): number {
  const overhang = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.overhang : null;
  const validIds = new Set(overhang?.regions.map((region) => region.id) ?? []);
  const selectedIds = [...new Set(regionIds)].filter((regionId) => validIds.has(regionId));
  if (operation === "replace") skinRebuildSelectedOverhangRegionIds.clear();
  for (const regionId of selectedIds) {
    if (operation === "remove") skinRebuildSelectedOverhangRegionIds.delete(regionId);
    else skinRebuildSelectedOverhangRegionIds.add(regionId);
  }
  if (selectedIds.length > 0 && operation !== "remove") {
    setSkinRebuildLatticeEdgeSelection(null);
    skinRebuildSelectedTargetPatchId = null;
    refreshSkinRebuildSelectedTarget();
  }
  refreshSkinRebuildSelectedRegion();
  return selectedIds.length;
}

function setSkinRebuildLatticeEdgeSelection(edgeId: number | null): boolean {
  const graph = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project?.lattice ?? null : null;
  const validEdgeId = edgeId !== null && graph?.edges.some((edge) => edge.id === edgeId) ? edgeId : null;
  if (skinRebuildLatticeEdgeSelect) skinRebuildLatticeEdgeSelect.value = validEdgeId === null ? "" : String(validEdgeId);
  if (skinRebuildLatticeDeleteButton) skinRebuildLatticeDeleteButton.disabled = validEdgeId === null;
  if (validEdgeId !== null && skinRebuildSelectedOverhangRegionIds.size > 0) {
    skinRebuildSelectedOverhangRegionIds.clear();
    skinRenderer.setSelectedSkinRebuildOverhangRegions([]);
    refreshSkinRebuildSelectedRegion();
  }
  skinRenderer.setSelectedInternalStructureEdge(graph, validEdgeId);
  refreshSkinRebuildViewportSelectionStatus(validEdgeId);
  return validEdgeId !== null;
}

function setSkinRebuildViewportSelectionMode(mode: SkinRebuildViewportSelectionMode): void {
  skinRebuildViewportSelectionMode = mode;
  viewport.classList.toggle("skin-rebuild-lattice-pick-mode", mode === "lattice-edge");
  if (mode === "lattice-edge") {
    // The combined mode owns cyan lines and red face regions. Leave ordinary
    // Pattern/marker highlights, then make sure the cyan graph is visible.
    selectedPatchId = null;
    skinRebuildSelectedTargetPatchId = null;
    skinRenderer.updateBeadSelection(null);
    skinRenderer.setElementNames(state.patches, null, showElementNames, hoveredPatchId);
    refreshSkinRebuildSelectedTarget();
    if (skinRebuildSpiderLatticeToggle) skinRebuildSpiderLatticeToggle.checked = true;
    skinRenderer.setInternalStructureVisible(true);
    setSkinRebuildLatticeEdgeSelection(null);
    updateSelectionLabel();
  } else {
    setSkinRebuildLatticeEdgeSelection(null);
  }
  refreshSkinRebuildViewportSelectionStatus();
  render();
}

function refreshSkinRebuildLatticeEdgeEditor(preferredEdgeId: number | null = null): void {
  const select = skinRebuildLatticeEdgeSelect;
  const deleteButton = skinRebuildLatticeDeleteButton;
  if (!select || !deleteButton) return;
  const graph = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project?.lattice ?? null : null;
  const previous = preferredEdgeId ?? (select.value === "" ? Number.NaN : Number(select.value));
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = graph?.edges.length ? "削除する線を選択" : "ラティス線なし";
  select.replaceChildren(placeholder);
  for (const edge of graph?.edges ?? []) {
    const start = graph!.nodes[edge.start]?.position;
    const end = graph!.nodes[edge.end]?.position;
    const edgeLength = start && end
      ? Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z)
      : 0;
    const option = document.createElement("option");
    option.value = String(edge.id);
    option.textContent = `線 #${edge.id + 1} · node ${edge.start + 1}–${edge.end + 1} · 長さ ${edgeLength.toFixed(3)}`;
    select.append(option);
  }
  const canRestoreSelection = graph?.edges.some((edge) => edge.id === previous) ?? false;
  select.value = canRestoreSelection ? String(previous) : "";
  select.disabled = !graph?.edges.length;
  setSkinRebuildLatticeEdgeSelection(canRestoreSelection ? previous : null);
}

function refreshSkinRebuildSelectedTarget(): void {
  const project = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project : null;
  if (skinRebuildUnsupportedFocusButton) {
    skinRebuildUnsupportedFocusButton.disabled = !project || project.audit.unsupportedTargetCount === 0;
    skinRebuildUnsupportedFocusButton.textContent = project?.audit.unsupportedTargetCount
      ? `未支持${project.audit.unsupportedTargetCount}点を黄色で強調`
      : "未支持点を黄色で強調";
  }
  const point = project?.lowestPoints.find((candidate) => candidate.patchId === skinRebuildSelectedTargetPatchId);
  if (!project || !point?.needsSupport) skinRebuildSelectedTargetPatchId = null;
  skinRenderer.setSelectedMotifLowestPointMarker(skinRebuildSelectedTargetPatchId);
  if (!skinRebuildSelectedTargetStatus || !skinRebuildSelectedTargetButton) return;
  if (!project || skinRebuildSelectedTargetPatchId === null) {
    skinRebuildSelectedTargetStatus.textContent = "赤面をメイン画面でクリックしてください";
    skinRebuildSelectedTargetButton.disabled = true;
    return;
  }
  const selectedPoint = project.lowestPoints.find((candidate) => candidate.patchId === skinRebuildSelectedTargetPatchId)!;
  const side = project.patternSides.find((candidate) => candidate.patchId === skinRebuildSelectedTargetPatchId);
  const requiresSpider = skinRebuildRequiresSpiderSupport(selectedPoint, side);
  const spiderSupported = project.latticeConnections.some((connection) => connection.targetPatchId === skinRebuildSelectedTargetPatchId);
  const disconnected = skinRebuildDisconnectedPatternIds(project.patternSides, project.finalGraph)
    .includes(skinRebuildSelectedTargetPatchId);
  skinRebuildSelectedTargetStatus.textContent = requiresSpider
    ? `Pattern #${skinRebuildSelectedTargetPatchId} · 内向き法線はPlate方向 · 蜘蛛支持 ${spiderSupported ? "済み" : "必要"}`
    : `Pattern #${skinRebuildSelectedTargetPatchId} · 蜘蛛支持は不要 · 接続 ${disconnected ? "必要" : "済み"} · 工程8印刷サポート対象`;
  skinRebuildSelectedTargetButton.disabled = requiresSpider ? spiderSupported : !disconnected;
}

function skinRebuildUnsupportedSpiderTargetIds(project: SkinRebuildProject): number[] {
  const supported = new Set(project.latticeConnections.map((connection) => connection.targetPatchId));
  return skinRebuildSpiderSupportTargetIds(project.patternSides, project.lowestPoints)
    .filter((patchId) => !supported.has(patchId));
}

function focusSkinRebuildUnsupportedTarget(): number | null {
  const project = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project ?? null : null;
  if (!project) return null;
  const unsupported = skinRebuildUnsupportedSpiderTargetIds(project);
  const patchId = unsupported[0] ?? null;
  if (patchId === null) return null;
  setSkinRebuildViewportSelectionMode("pattern");
  selectSkinRebuildTarget(patchId);
  if (skinRebuildSelectedTargetStatus) {
    skinRebuildSelectedTargetStatus.textContent = `書き出しを止めている未支持点 · Pattern #${patchId} · 画面の大きい黄色＋白枠マーカー`;
    skinRebuildSelectedTargetStatus.dataset.ok = "false";
  }
  setSkinRebuildMeshBottomProgress(
    "未支持点を強調",
    `Pattern #${patchId} · 大きい黄色＋白枠マーカー · 残り${unsupported.length}点`,
    "この点へ蜘蛛支持が必要です",
  );
  projectMeta.textContent = `書き出し停止の原因を強調 · Pattern #${patchId}`;
  render();
  return patchId;
}

function selectSkinRebuildTarget(patchId: number | null): boolean {
  const project = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project : null;
  if (!project || patchId === null) return false;
  const point = project.lowestPoints.find((candidate) => candidate.patchId === patchId);
  if (!point?.needsSupport) return false;
  skinRebuildSelectedOverhangRegionIds.clear();
  skinRenderer.setSelectedSkinRebuildOverhangRegions([]);
  skinRebuildSelectedTargetPatchId = patchId;
  refreshSkinRebuildSelectedTarget();
  refreshSkinRebuildSelectedRegion();
  render();
  return true;
}

function refreshSkinRebuildLowestPointMarkers(project: SkinRebuildProject): void {
  const sideByPatch = new Map(project.patternSides.map((side) => [side.patchId, side]));
  const spiderSupported = new Set(project.latticeConnections.map((connection) => connection.targetPatchId));
  const removableSupported = (point: SkinRebuildLowestPoint): boolean => project.printSupport.nodes.some((node) =>
    Math.hypot(
      node.position.x - point.position.x,
      node.position.y - point.position.y,
      node.position.z - point.position.z,
    ) <= 1e-6);
  const markers: MotifLowestPoint[] = project.lowestPoints.map((point) => {
    const requiresSpider = skinRebuildRequiresSpiderSupport(point, sideByPatch.get(point.patchId));
    return {
      patchId: point.patchId,
      shape: state.patches.find((patch) => patch.id === point.patchId)?.shape ?? "coin",
      position: { ...point.position },
      normal: { ...point.normal },
      markerRadius: point.needsSupport ? 0.055 : 0.025,
      reachedByInternal: !point.needsSupport
        || (requiresSpider ? spiderSupported.has(point.patchId) : removableSupported(point)),
      basis: point.basis,
    };
  });
  skinRenderer.setMotifLowestPointMarkers(markers, skinRebuildSelectedTargetPatchId);
}

function skinRebuildPipelineIsCurrent(): boolean {
  return skinRebuildPipeline !== null && skinRebuildPipeline.shapeFingerprint === fkeiShapeFingerprint(state);
}

function currentOriginalDryWebForSkinRebuild(): InternalStructureGraph | null {
  if (skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.dryWeb) return skinRebuildPipeline.dryWeb;
  return state.skinParams.internalStructure === "targetedGrid"
    && phaseADryWebPreview
    && dryWebPreviewIsCurrent()
    ? phaseADryWebPreview.graph
    : null;
}

function setSkinRebuildPipelineBusy(button: HTMLButtonElement, busy: boolean, idleText: string, busyText: string): void {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function revealBottomStatusPaneForSkinRebuild(): void {
  if (!editorLayoutState.bottomCollapsed) return;
  editorLayoutState = { ...editorLayoutState, bottomCollapsed: false };
  applyEditorLayoutDom();
  skinRenderer.resize();
}

function setSkinRebuildLowestBottomProgress(current: string, generation: string, error?: string): void {
  bottomWorkflowCurrent.textContent = `Current | ${current}`;
  bottomWorkflowCurrent.classList.remove("is-placeholder");
  bottomWorkflowGeneration.textContent = `Generation | ${generation}`;
  bottomWorkflowGeneration.classList.remove("is-placeholder");
  if (error) {
    bottomWorkflowError.textContent = `Error | ${error}`;
    bottomWorkflowError.classList.remove("is-placeholder");
  } else {
    bottomWorkflowError.textContent = "Error | なし";
    bottomWorkflowError.classList.add("is-placeholder");
  }
}

function setSkinRebuildMeshBottomProgress(current: string, generation: string, error?: string): void {
  if (!isSkinRebuildApp) return;
  revealBottomStatusPaneForSkinRebuild();
  setSkinRebuildLowestBottomProgress(current, generation, error);
}

function clearSkinRebuildLowestStatusTimer(): void {
  if (skinRebuildLowestStatusTimer !== null) window.clearInterval(skinRebuildLowestStatusTimer);
  skinRebuildLowestStatusTimer = null;
}

function cancelSkinRebuildLowestExtraction(reason = "工程4をキャンセルしました"): void {
  if (!activeSkinRebuildLowestWorker && !skinRebuildLowestHeavyComputation) return;
  skinRebuildLowestRequestId++;
  activeSkinRebuildLowestWorker?.terminate();
  activeSkinRebuildLowestWorker = null;
  clearSkinRebuildLowestStatusTimer();
  skinRebuildLowestHeavyComputation?.finish();
  skinRebuildLowestHeavyComputation = null;
  if (skinRebuildLowestButton) {
    setSkinRebuildPipelineBusy(skinRebuildLowestButton, false, "4. オーバーハング部を検出", "複数コアで解析中…");
  }
  if (skinRebuildLowestStatus) {
    skinRebuildLowestStatus.textContent = reason;
    skinRebuildLowestStatus.dataset.ok = "false";
  }
  setSkinRebuildLowestBottomProgress("工程4 中断", reason);
}

function cancelSkinRebuildPrintSupportDiagnosis(): void {
  skinRebuildPrintSupportRequestId++;
  activeSkinRebuildPrintSupportWorker?.terminate();
  activeSkinRebuildPrintSupportWorker = null;
}

async function diagnoseSkinRebuildArtworkForPrintSupport(
  project: SkinRebuildProject,
  settings: SkinRebuildSettings,
  onProgress: (message: Extract<SkinRebuildLowestPointWorkerMessage, { type: "progress" }>) => void,
): Promise<{
  lowestPoints: SkinRebuildLowestPoint[];
  meshPositions: Float32Array;
  meshNormals: Float32Array;
  overhangFacePositions: Float32Array;
  overhangFaceRegionIds: Int32Array;
  overhangRegions: SkinRebuildOverhangRegion[];
  overhangFaceCount: number;
  overhangRegionCount: number;
  overhangAreaMm2: number;
  overhangAreaPercent: number;
  faceCount: number;
  workerCount: number;
  elapsedMs: number;
}> {
  cancelSkinRebuildPrintSupportDiagnosis();
  const requestId = ++skinRebuildPrintSupportRequestId;
  const workerCount = chooseSkinRebuildLowestWorkerCount(navigator.hardwareConcurrency);
  const worker = new Worker(new URL("./rebuild/lowestPoint.worker.ts", import.meta.url), { type: "module" });
  activeSkinRebuildPrintSupportWorker = worker;
  return await new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<SkinRebuildLowestPointWorkerMessage>) => {
      const message = event.data;
      if (message.requestId !== requestId || activeSkinRebuildPrintSupportWorker !== worker) return;
      if (message.type === "progress") {
        onProgress(message);
        return;
      }
      worker.terminate();
      activeSkinRebuildPrintSupportWorker = null;
      if (message.type === "error") {
        reject(new Error(message.message));
        return;
      }
      resolve({
        lowestPoints: message.lowestPoints,
        meshPositions: message.meshPositions,
        meshNormals: message.meshNormals,
        overhangFacePositions: message.overhangFacePositions,
        overhangFaceRegionIds: message.overhangFaceRegionIds,
        overhangRegions: message.overhangRegions,
        overhangFaceCount: message.overhangFaceCount,
        overhangRegionCount: message.overhangRegionCount,
        overhangAreaMm2: message.overhangAreaMm2,
        overhangAreaPercent: message.overhangAreaPercent,
        faceCount: message.faceCount,
        workerCount: message.workerCount,
        elapsedMs: message.elapsedMs,
      });
    };
    worker.onerror = (event) => {
      if (activeSkinRebuildPrintSupportWorker !== worker) return;
      worker.terminate();
      activeSkinRebuildPrintSupportWorker = null;
      reject(new Error(event.message || "作品mesh解析Workerでエラーが発生しました"));
    };
    const request: SkinRebuildLowestPointRequest = {
      type: "build",
      requestId,
      base: { ...project.base, host: project.base.host.map((ball) => ({ ...ball })) },
      patterns: state.patches.map((patch) => ({
        ...patch,
        motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
        points: patch.points.map((point) => ({ ...point })),
      })),
      patternSides: project.patternSides.map((side) => ({
        ...side,
        surfacePosition: { ...side.surfacePosition },
        outwardNormal: { ...side.outwardNormal },
        insidePosition: { ...side.insidePosition },
        outsidePosition: { ...side.outsidePosition },
      })),
      // finalGraph is exactly the artwork: Surface Pattern + permanent
      // spider (and optional retained DryWeb). Removable support is absent.
      dryWeb: {
        ...project.finalGraph,
        nodes: project.finalGraph.nodes.map((node) => ({ ...node, position: { ...node.position } })),
        edges: project.finalGraph.edges.map((edge) => ({ ...edge })),
        stats: { ...project.finalGraph.stats },
      },
      settings,
      workerCount,
    };
    worker.postMessage(request);
  });
}

function skinRebuildFinalDiagnosisIsCurrent(): boolean {
  return skinRebuildPipelineIsCurrent()
    && skinRebuildPipeline?.project !== null
    && skinRebuildFinalArtworkDiagnosis?.project === skinRebuildPipeline?.project;
}

function refreshSkinRebuildFinalStageButtons(): void {
  const project = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project ?? null : null;
  if (skinRebuildFinalDiagnosisButton) {
    skinRebuildFinalDiagnosisButton.disabled = project === null || skinRebuildFinalizedArtworkProject !== project;
  }
  if (skinRebuildPrintSupportButton) {
    skinRebuildPrintSupportButton.disabled = !skinRebuildFinalDiagnosisIsCurrent();
  }
  refreshSkinRebuildStage8ExportButton();
}

function refreshSkinRebuildStage8ExportButton(): void {
  if (!skinRebuildStage8ExportButton) return;
  const reason = skinRebuildPipelineOutputBlockReason();
  const running = activeMeshExportWorker !== null || pendingMeshExportAfterGate !== null;
  skinRebuildStage8ExportButton.disabled = reason !== null || running;
  if (!skinRebuildStage8ExportStatus) return;
  if (reason && skinRebuildStage8ExportStatus.textContent === "未実行") {
    skinRebuildStage8ExportStatus.textContent = `準備待ち · ${reason}`;
    skinRebuildStage8ExportStatus.dataset.ok = "false";
  } else if (!reason && !running && (skinRebuildStage8ExportStatus.textContent === "未実行"
    || skinRebuildStage8ExportStatus.textContent?.startsWith("準備待ち"))) {
    skinRebuildStage8ExportStatus.textContent = "準備完了 · 必要な形式を選んで書き出せます";
    skinRebuildStage8ExportStatus.dataset.ok = "true";
  }
}

function invalidateSkinRebuildFinalStages(reason: string): void {
  skinRebuildFinalizedArtworkProject = null;
  skinRebuildFinalArtworkDiagnosis = null;
  skinRebuildStage8CompletedProject = null;
  if (skinRebuildFinalDiagnosisStatus) {
    skinRebuildFinalDiagnosisStatus.textContent = reason;
    skinRebuildFinalDiagnosisStatus.dataset.ok = "false";
  }
  if (skinRebuildPrintSupportStatus) {
    skinRebuildPrintSupportStatus.textContent = "工程7の最終診断待ち";
    skinRebuildPrintSupportStatus.dataset.ok = "false";
  }
  refreshSkinRebuildFinalStageButtons();
}

function markSkinRebuildArtworkFinalized(project: SkinRebuildProject, summary: string): void {
  if (skinRebuildFinalizedArtworkProject !== project) skinRebuildFinalArtworkDiagnosis = null;
  skinRebuildFinalizedArtworkProject = project;
  if (skinRebuildFinalDiagnosisStatus && !skinRebuildFinalArtworkDiagnosis) {
    skinRebuildFinalDiagnosisStatus.textContent = `${summary} · 工程7を実行してください`;
    delete skinRebuildFinalDiagnosisStatus.dataset.ok;
  }
  refreshSkinRebuildFinalStageButtons();
}

function setSkinRebuildReinforcementPreview(
  graph: InternalStructureGraph | null,
  edgeIds: readonly number[],
): void {
  skinRebuildReinforcementPreview = graph && edgeIds.length > 0
    ? { graph, edgeIds: [...edgeIds] }
    : null;
  skinRenderer.setReinforcedInternalStructureEdges(
    skinRebuildReinforcementPreview?.graph ?? null,
    skinRebuildReinforcementPreview?.edgeIds ?? [],
  );
}

/** Replace the stale Stage 4 surface-only preview with the exact Stage 6
 * triangle soup. In normal mesh observation the ordinary line overlay is
 * hidden, so turning the left-pane lattice display off still leaves every
 * genuinely meshed 5A/5B member visible as part of the artwork. */
function showSkinRebuildStage6ArtworkMesh(
  positions: Float32Array,
  normals: Float32Array,
): void {
  if (!isSkinRebuildApp || positions.length === 0 || normals.length !== positions.length) return;
  // The bright cyan Stage 5B layer is only an authoring confirmation. Once
  // the exact Stage 6 artwork mesh is visible, remove that duplicate overlay;
  // the reinforcement remains physically present in the fused mesh.
  setSkinRebuildReinforcementPreview(null, []);
  skinRenderer.setSkinRebuildOverhangOverlay(null);
  skinRenderer.setMeshOverlayBuffers(positions, normals);
  viewMode = "mesh";
  setInternalObservationMode("normal");
  skinRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
  render();
}

function installSkinRebuildPipelinePanel(): void {
  const stage3Body = ui.root.querySelector<HTMLElement>("#skin-stage-3-body");
  const stage4Body = ui.root.querySelector<HTMLElement>("#skin-stage-4-body");
  const stage5Body = ui.root.querySelector<HTMLElement>("#skin-stage-5-body");
  const stage6Body = ui.root.querySelector<HTMLElement>("#skin-stage-6-body");
  const stage7Body = ui.root.querySelector<HTMLElement>("#skin-stage-7-body");
  const stage8Body = ui.root.querySelector<HTMLElement>("#skin-stage-8-body");
  if (!stage3Body || !stage4Body || !stage5Body || !stage6Body || !stage7Body || !stage8Body) return;
  const stageSummaries: Array<[HTMLElement, string, string]> = [
    [stage3Body, "Surface Patternの内外を決める", "Base Shape側をinsideとして確定"],
    [stage4Body, "オーバーハング部を検出", "最初の危険面を赤表示"],
    [stage5Body, "蜘蛛ラティスと赤面エリア補強", "5A spider web → 5B red-area reinforcement"],
    [stage6Body, "作品形状の確定", "Surface Pattern＋蜘蛛＋補強をmesh化"],
    [stage7Body, "作品の最終診断", "確定meshに残る危険面を赤表示"],
    [stage8Body, "残っている赤へ印刷サポート", "別体supportを生成して出力"],
  ];
  for (const [body, title, description] of stageSummaries) {
    const details = body.closest("details");
    const summary = details?.querySelector<HTMLElement>(".skin-author-stage-copy");
    const stateLabel = details?.querySelector<HTMLElement>(".skin-author-stage-state");
    const summaryTitle = summary?.querySelector<HTMLElement>("strong");
    const summaryDescription = summary?.querySelector<HTMLElement>("small");
    if (summaryTitle) summaryTitle.textContent = title;
    if (summaryDescription) summaryDescription.textContent = description;
    if (stateLabel) stateLabel.textContent = "current";
  }
  stage5Body.querySelector<HTMLElement>(".skin-stage-placeholder")?.remove();

  const makeStep = (heading: string, copy: string) => {
    const section = document.createElement("section");
    section.className = "skin-rebuild-pipeline-step";
    const stepTitle = document.createElement("strong");
    stepTitle.textContent = heading;
    const stepCopy = document.createElement("p");
    stepCopy.className = "hint";
    stepCopy.textContent = copy;
    const status = document.createElement("div");
    status.className = "mesh-status skin-rebuild-pipeline-status";
    status.textContent = "未実行";
    section.append(stepTitle, stepCopy);
    return { section, status };
  };

  const inside = makeStep(
    "3. Surface Patternの内外を決める",
    "各Patternの代表点をBase Shapeへ再投影し、法線の両側をSDFで測ります。Base Shapeが存在する側だけをinsideとして採用します。",
  );
  const insideButton = document.createElement("button");
  insideButton.type = "button";
  insideButton.className = "primary-action";
  insideButton.textContent = "3. Base Shape側をinsideとして判定";
  insideButton.onclick = async () => {
    cancelSkinRebuildLowestExtraction("工程3を再実行したため、工程4を停止しました");
    if (state.host.length === 0 || state.patches.length === 0) {
      inside.status.textContent = "先にStage 1/2でBase ShapeとSurface Patternを作成またはOpenしてください";
      inside.status.dataset.ok = "false";
      return;
    }
    const workflowBefore = captureSkinRebuildWorkflowSnapshot();
    setSkinRebuildPipelineBusy(insideButton, true, "3. Base Shape側をinsideとして判定", "内外を判定中…");
    inside.status.textContent = "各PatternをBase Shapeへ再投影中…";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const settings = currentSkinRebuildPipelineSettings();
      const base: SkinRebuildBase = {
        kind: "metaball-capsule",
        host: state.host.map((ball) => ({ ...ball })),
        hostK: state.hostParams.k,
      };
      const patternSides = classifySkinRebuildPatternSides(base, state.patches, settings);
      skinRebuildPipeline = {
        shapeFingerprint: fkeiShapeFingerprint(state),
        settings,
        base,
        patternSides,
        dryWeb: currentOriginalDryWebForSkinRebuild() ?? createEmptySkinRebuildGraph(),
        lowestPoints: null,
        overhang: null,
        project: null,
      };
      skinRebuildSelectedTargetPatchId = null;
      skinRebuildSelectedOverhangRegionIds.clear();
      skinRebuildReinforcedOverhangRegionIds.clear();
      setSkinRebuildReinforcementPreview(null, []);
      invalidateSkinRebuildFinalStages("工程3を更新したため、工程6〜8は未実行です");
      skinRenderer.setMotifLowestPointMarkers(null, null);
      skinRenderer.setSkinRebuildOverhangOverlay(null);
      refreshSkinRebuildSelectedTarget();
      refreshSkinRebuildSelectedRegion();
      inside.status.textContent = `inside確定 ${patternSides.length}/${state.patches.length} · 全Patternで内側SDF < 0 / 外側SDF > 0`;
      inside.status.dataset.ok = "true";
      if (skinRebuildLowestButton) skinRebuildLowestButton.disabled = false;
      if (skinRebuildLatticeButton) skinRebuildLatticeButton.disabled = true;
      if (skinRebuildBulkSupportButton) skinRebuildBulkSupportButton.disabled = true;
      if (skinRebuildCompleteSupportButton) skinRebuildCompleteSupportButton.disabled = true;
      if (skinRebuildConnectAllButton) skinRebuildConnectAllButton.disabled = true;
      if (skinRebuildPrintSupportButton) skinRebuildPrintSupportButton.disabled = true;
      if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = true;
      if (skinRebuildLowestStatus) skinRebuildLowestStatus.textContent = "内外判定済み · 次にオーバーハング部を検出してください";
      if (skinRebuildLatticeStatus) skinRebuildLatticeStatus.textContent = "オーバーハング検出後に実行できます";
      if (skinRebuildPrintSupportStatus) skinRebuildPrintSupportStatus.textContent = "工程6の作品確定と工程7の最終診断待ち";
      if (skinRebuildSaveStatus) skinRebuildSaveStatus.textContent = "工程4と5の実行待ち";
      commitSkinRebuildWorkflowHistory("工程3 内外判定", workflowBefore);
    } catch (error) {
      restoreSkinRebuildWorkflowSnapshot(workflowBefore);
      inside.status.textContent = `内外判定失敗: ${error instanceof Error ? error.message : String(error)}`;
      inside.status.dataset.ok = "false";
    } finally {
      setSkinRebuildPipelineBusy(insideButton, false, "3. Base Shape側をinsideとして判定", "内外を判定中…");
    }
  };
  inside.section.append(insideButton, inside.status);

  const lowest = makeStep(
    "4. オーバーハング部を検出",
    "最終Surface meshの全三角面を造形方向から判定し、閾値以上の下面を隣接する危険領域にまとめて赤く表示します。同時に各Patternの最下端点も蜘蛛ラティス用に抽出します。",
  );
  const thresholdRow = document.createElement("label");
  thresholdRow.className = "row skin-rebuild-pipeline-setting";
  thresholdRow.append(document.createTextNode("危険角度 "));
  const threshold = document.createElement("input");
  threshold.type = "number";
  threshold.min = "30";
  threshold.max = "65";
  threshold.step = "1";
  threshold.value = "45";
  thresholdRow.append(threshold, document.createTextNode("°"));
  const lowestButton = document.createElement("button");
  lowestButton.type = "button";
  lowestButton.className = "primary-action";
  lowestButton.textContent = "4. オーバーハング部を検出";
  lowestButton.disabled = true;
  lowestButton.onclick = () => {
    if (!skinRebuildPipelineIsCurrent() || !skinRebuildPipeline) {
      lowest.status.textContent = "先に工程3の内外判定を実行してください";
      lowest.status.dataset.ok = "false";
      return;
    }
    const workflowBefore = captureSkinRebuildWorkflowSnapshot();
    const dryWeb = skinRebuildPipeline.dryWeb ?? createEmptySkinRebuildGraph();
    cancelSkinRebuildLowestExtraction("新しい工程4を開始します");
    const pipeline = skinRebuildPipeline;
    const settings = currentSkinRebuildPipelineSettings();
    pipeline.settings = settings;
    pipeline.lowestPoints = null;
    pipeline.overhang = null;
    pipeline.project = null;
    skinRenderer.setSkinRebuildOverhangOverlay(null);
    skinRebuildSelectedTargetPatchId = null;
    skinRebuildSelectedOverhangRegionIds.clear();
    skinRebuildReinforcedOverhangRegionIds.clear();
    setSkinRebuildReinforcementPreview(null, []);
    invalidateSkinRebuildFinalStages("工程4を再計算しているため、工程6〜8は未実行です");
    refreshSkinRebuildSelectedTarget();
    refreshSkinRebuildSelectedRegion();
    if (skinRebuildLatticeButton) skinRebuildLatticeButton.disabled = true;
    if (skinRebuildBulkSupportButton) skinRebuildBulkSupportButton.disabled = true;
    if (skinRebuildCompleteSupportButton) skinRebuildCompleteSupportButton.disabled = true;
    if (skinRebuildConnectAllButton) skinRebuildConnectAllButton.disabled = true;
    if (skinRebuildLatticeStatus) skinRebuildLatticeStatus.textContent = "工程4を複数コアで再計算中…";
    if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = true;
    if (skinRebuildSaveStatus) skinRebuildSaveStatus.textContent = "工程4と5の再実行待ち";
    const requestId = ++skinRebuildLowestRequestId;
    const workerCount = chooseSkinRebuildLowestWorkerCount(navigator.hardwareConcurrency);
    const worker = new Worker(new URL("./rebuild/lowestPoint.worker.ts", import.meta.url), { type: "module" });
    const started = performance.now();
    let lastDetail = `最終メッシュを${workerCount > 1 ? `${workerCount}コアへ分割` : "背景Workerで生成"}`;
    activeSkinRebuildLowestWorker = worker;
    setSkinRebuildPipelineBusy(lowestButton, true, "4. オーバーハング部を検出", "複数コアで解析中…");
    lowest.status.textContent = `${lastDetail} · 下部STATUSに進捗を表示します`;
    delete lowest.status.dataset.ok;
    revealBottomStatusPaneForSkinRebuild();
    setSkinRebuildLowestBottomProgress("工程4 オーバーハング検出", `${lastDetail} · 0.0秒`);
    const cancel = (): void => {
      if (activeSkinRebuildLowestWorker !== worker || skinRebuildLowestRequestId !== requestId) return;
      cancelSkinRebuildLowestExtraction("工程4をキャンセルしました");
      restoreSkinRebuildWorkflowSnapshot(workflowBefore);
      lowest.status.textContent = "工程4をキャンセルしました。開始前の状態を復元しました";
    };
    const heavy = beginHeavyComputation(`工程4 オーバーハング検出 · ${workerCount}コア`, cancel);
    skinRebuildLowestHeavyComputation = heavy;
    heavy.updateActual(`${lastDetail} · 解像度${settings.analysisResolution}`, 0);
    clearSkinRebuildLowestStatusTimer();
    skinRebuildLowestStatusTimer = window.setInterval(() => {
      if (activeSkinRebuildLowestWorker !== worker) return;
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);
      heavy.update(`${lastDetail} · ${elapsed}秒`);
      setSkinRebuildLowestBottomProgress("工程4 オーバーハング検出", `${lastDetail} · ${elapsed}秒`);
    }, 500);

    const finishWorker = (): void => {
      if (activeSkinRebuildLowestWorker === worker) activeSkinRebuildLowestWorker = null;
      worker.terminate();
      clearSkinRebuildLowestStatusTimer();
      if (skinRebuildLowestHeavyComputation?.id === heavy.id) {
        skinRebuildLowestHeavyComputation = null;
        heavy.finish();
      }
      setSkinRebuildPipelineBusy(lowestButton, false, "4. オーバーハング部を検出", "複数コアで解析中…");
    };

    worker.onmessage = (event: MessageEvent<SkinRebuildLowestPointWorkerMessage>) => {
      const message = event.data;
      if (activeSkinRebuildLowestWorker !== worker
        || message.requestId !== requestId
        || skinRebuildLowestRequestId !== requestId) {
        worker.terminate();
        return;
      }
      if (message.type === "progress") {
        const elapsed = (message.elapsedMs / 1000).toFixed(1);
        if (message.phase === "mesh") {
          lastDetail = `メッシュ分割 ${message.completed}/${message.total} · ${message.workerCount}コア · ${message.faceCount.toLocaleString()}面`;
        } else if (message.phase === "fallback") {
          lastDetail = "分割Workerを使えないため背景Worker 1本へ切替";
          heavy.smoothTo(70, 90_000);
        } else if (message.phase === "orientation") {
          lastDetail = `メッシュ統合・面方向を整理中 · ${message.faceCount.toLocaleString()}面`;
        } else if (message.phase === "attribution") {
          lastDetail = `Pattern帰属 ${message.completed.toLocaleString()}/${message.total.toLocaleString()}頂点`;
        } else if (message.phase === "reachability") {
          lastDetail = `Pattern最下端確認 ${message.completed.toLocaleString()}/${message.total.toLocaleString()}`;
        } else if (message.phase === "overhang") {
          lastDetail = `危険面を領域化中 · ${message.faceCount.toLocaleString()}面を検査`;
        } else {
          lastDetail = "最下端と支持対象を確定中";
        }
        const progress = skinRebuildLowestProgressPercent(message.phase, message.completed, message.total);
        heavy.updateActual(`${lastDetail} · ${elapsed}秒`, progress);
        lowest.status.textContent = `${lastDetail} · ${elapsed}秒 · 画面は操作できます`;
        setSkinRebuildLowestBottomProgress("工程4 オーバーハング検出", `${Math.round(progress)}% · ${lastDetail} · ${elapsed}秒`);
        return;
      }

      finishWorker();
      if (message.type === "error") {
        restoreSkinRebuildWorkflowSnapshot(workflowBefore);
        const errorText = `オーバーハング検出失敗: ${message.message}`;
        lowest.status.textContent = errorText;
        lowest.status.dataset.ok = "false";
        setSkinRebuildLowestBottomProgress("工程4 失敗", `${(message.elapsedMs / 1000).toFixed(1)}秒`, message.message);
        return;
      }
      if (!skinRebuildPipelineIsCurrent() || skinRebuildPipeline !== pipeline
        || currentOriginalDryWebForSkinRebuild() !== dryWeb) {
        lowest.status.textContent = "工程4の計算中に形状またはDry Webが変わったため、結果を採用しませんでした";
        lowest.status.dataset.ok = "false";
        setSkinRebuildLowestBottomProgress("工程4 結果破棄", "入力が変更されました");
        return;
      }

      pipeline.settings = settings;
      pipeline.dryWeb = dryWeb;
      pipeline.lowestPoints = message.lowestPoints;
      pipeline.overhang = {
        faceCount: message.overhangFaceCount,
        regionCount: message.overhangRegionCount,
        areaMm2: message.overhangAreaMm2,
        areaPercent: message.overhangAreaPercent,
        meshPositions: message.meshPositions,
        meshNormals: message.meshNormals,
        positions: message.overhangFacePositions,
        faceRegionIds: message.overhangFaceRegionIds,
        regions: message.overhangRegions,
      };
      pipeline.project = assembleSkinRebuildProject(
        settings,
        pipeline.base,
        state.patches,
        pipeline.patternSides,
        dryWeb,
        message.lowestPoints,
        createEmptySkinRebuildGraph(),
        [],
      );
      installSkinRebuildPermanentLatticePreview(pipeline.project, false);
      if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = true;
      if (skinRebuildSaveStatus) skinRebuildSaveStatus.textContent = "工程5の実行待ち";
      const targets = message.lowestPoints.filter((point) => point.needsSupport);
      const spiderTargets = skinRebuildSpiderSupportTargetIds(pipeline.patternSides, message.lowestPoints);
      const removableSupportTargets = targets.length - spiderTargets.length;
      refreshSkinRebuildLowestPointMarkers(pipeline.project);
      skinRenderer.setMeshOverlayBuffers(message.meshPositions, message.meshNormals);
      skinRenderer.setSkinRebuildOverhangOverlay(
        message.overhangFacePositions,
        message.overhangFaceRegionIds,
      );
      viewMode = "mesh";
      skinRenderer.setViewMode(viewMode);
      ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
      keepInternalGraphVisibleInMesh(getInternalStructureGraph());
      const elapsed = (message.elapsedMs / 1000).toFixed(1);
      const execution = message.parallel ? `${message.workerCount}コア` : "背景Worker 1本";
      lowest.status.textContent = `危険領域 ${message.overhangRegionCount} · 赤mesh ${message.overhangFaceCount.toLocaleString()}面 / ${message.overhangAreaMm2.toFixed(1)} mm² (${message.overhangAreaPercent.toFixed(1)}%) · Pattern最下端 ${message.lowestPoints.length}点 · 蜘蛛支持 ${spiderTargets.length}点 · ${execution} · ${elapsed}秒`;
      lowest.status.dataset.ok = "true";
      setSkinRebuildLowestBottomProgress(
        "工程4 完了",
        `${execution} · 全${message.faceCount.toLocaleString()}面 / 危険${message.overhangFaceCount.toLocaleString()}面・${message.overhangRegionCount}領域・${message.overhangAreaPercent.toFixed(1)}% · ${elapsed}秒 · 蜘蛛支持${spiderTargets.length}点 · 非蜘蛛候補${removableSupportTargets}点`,
      );
      if (skinRebuildLatticeButton) skinRebuildLatticeButton.disabled = false;
      if (skinRebuildBulkSupportButton) skinRebuildBulkSupportButton.disabled = false;
      if (skinRebuildCompleteSupportButton) skinRebuildCompleteSupportButton.disabled = spiderTargets.length === 0;
      if (skinRebuildConnectAllButton) skinRebuildConnectAllButton.disabled = false;
      if (skinRebuildPrintSupportButton) skinRebuildPrintSupportButton.disabled = true;
      if (skinRebuildLatticeStatus) skinRebuildLatticeStatus.textContent = targets.length > 0
        ? `蜘蛛支持${spiderTargets.length}点と全Pattern接続を作る準備ができました · 赤面エリアは5Bで個別補強できます`
        : "支持対象はありません。工程5で全Patternの一体化ラティスを作ります";
      if (skinRebuildPrintSupportStatus) skinRebuildPrintSupportStatus.textContent = "工程6の作品確定と工程7の最終診断待ち";
      refreshSkinRebuildSelectedTarget();
      refreshSkinRebuildSelectedRegion();
      commitSkinRebuildWorkflowHistory("工程4 オーバーハング検出", workflowBefore);
      render();
    };
    worker.onerror = (event) => {
      if (activeSkinRebuildLowestWorker !== worker || skinRebuildLowestRequestId !== requestId) {
        worker.terminate();
        return;
      }
      finishWorker();
      restoreSkinRebuildWorkflowSnapshot(workflowBefore);
      const message = event.message || "工程4 Workerを起動できませんでした";
      lowest.status.textContent = `オーバーハング検出失敗: ${message}`;
      lowest.status.dataset.ok = "false";
      setSkinRebuildLowestBottomProgress("工程4 失敗", `${((performance.now() - started) / 1000).toFixed(1)}秒`, message);
    };

    const request: SkinRebuildLowestPointRequest = {
      type: "build",
      requestId,
      base: { ...pipeline.base, host: pipeline.base.host.map((ball) => ({ ...ball })) },
      patterns: state.patches.map((patch) => ({
        ...patch,
        motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
        points: patch.points.map((point) => ({ ...point })),
      })),
      patternSides: pipeline.patternSides.map((side) => ({
        ...side,
        surfacePosition: { ...side.surfacePosition },
        outwardNormal: { ...side.outwardNormal },
        insidePosition: { ...side.insidePosition },
        outsidePosition: { ...side.outsidePosition },
      })),
      dryWeb: {
        ...dryWeb,
        nodes: dryWeb.nodes.map((node) => ({ ...node, position: { ...node.position } })),
        edges: dryWeb.edges.map((edge) => ({ ...edge })),
        stats: { ...dryWeb.stats },
      },
      settings,
      workerCount,
    };
    worker.postMessage(request);
  };
  lowest.section.append(thresholdRow, lowestButton, lowest.status);

  const lattice = makeStep(
    "5A. 向かい合うPattern裏中央から蜘蛛の巣ラティスを作る",
    "Pattern裏中央どうしをBase内の水色線で結び、作品を一体化します。Plate方向を向く最下端は蜘蛛支持、それ以外はPattern接続だけを行います。1パス・指定数・未支持一括・未接続一括を使い分けられます。",
  );
  const diameterRow = document.createElement("label");
  diameterRow.className = "row skin-rebuild-pipeline-setting";
  diameterRow.append(document.createTextNode("ラティス直径 "));
  const diameter = document.createElement("input");
  diameter.type = "number";
  diameter.min = "1.6";
  diameter.max = "4";
  diameter.step = "0.1";
  diameter.value = "2.6";
  diameterRow.append(diameter, document.createTextNode(" mm"));
  const targetSelectionHint = document.createElement("p");
  targetSelectionHint.className = "hint skin-rebuild-target-selection-hint";
  targetSelectionHint.textContent = "赤い最下端マーカーはPattern単位で黄色選択できます。面エリアそのものの補強は次の工程5Bで行います。";
  const targetSelectionStatus = document.createElement("div");
  targetSelectionStatus.className = "mesh-status skin-rebuild-target-selection-status";
  targetSelectionStatus.textContent = "赤面をメイン画面でクリックしてください";
  const selectedTargetButton = document.createElement("button");
  selectedTargetButton.type = "button";
  selectedTargetButton.className = "secondary-action";
  selectedTargetButton.textContent = "選択した赤面を処理";
  selectedTargetButton.disabled = true;
  const unsupportedFocusButton = document.createElement("button");
  unsupportedFocusButton.type = "button";
  unsupportedFocusButton.className = "secondary-action skin-rebuild-unsupported-focus";
  unsupportedFocusButton.textContent = "未支持点を黄色で強調";
  unsupportedFocusButton.disabled = true;
  unsupportedFocusButton.onclick = () => focusSkinRebuildUnsupportedTarget();
  const reinforcement = makeStep(
    "5B. 赤面エリアの補強",
    "選んだ連続赤面を複数の実接点で覆い、最寄りの蜘蛛ラティス上の点へ45°以内の立体として絞ります。色だけを除外せず、工程7で再診断される恒久形状を作ります。補強前は緑、追加部材は明るい水色で確認できます。",
  );
  const regionSelectionStatus = document.createElement("div");
  regionSelectionStatus.className = "mesh-status skin-rebuild-region-selection-status";
  regionSelectionStatus.textContent = "工程4を実行すると連続する赤面をエリア単位で選べます";
  const regionReinforceButton = document.createElement("button");
  regionReinforceButton.type = "button";
  regionReinforceButton.className = "secondary-action skin-rebuild-region-reinforce";
  regionReinforceButton.textContent = "5B. 選択赤面を面→点の水色立体で補強";
  regionReinforceButton.disabled = true;
  const bulkSupportRow = document.createElement("label");
  bulkSupportRow.className = "row skin-rebuild-pipeline-setting skin-rebuild-bulk-support-row";
  bulkSupportRow.append(document.createTextNode("一括で蜘蛛支持する数 "));
  const bulkSupportCount = document.createElement("input");
  bulkSupportCount.type = "number";
  bulkSupportCount.min = "1";
  bulkSupportCount.max = "999";
  bulkSupportCount.step = "1";
  bulkSupportCount.value = "5";
  bulkSupportRow.append(bulkSupportCount, document.createTextNode(" 点"));
  const bulkSupportButton = document.createElement("button");
  bulkSupportButton.type = "button";
  bulkSupportButton.className = "secondary-action";
  bulkSupportButton.textContent = "指定数をワンクリックで蜘蛛支持";
  bulkSupportButton.disabled = true;
  const completeSupportButton = document.createElement("button");
  completeSupportButton.type = "button";
  completeSupportButton.className = "secondary-action skin-rebuild-complete-support";
  completeSupportButton.textContent = "蜘蛛支持の未支持をワンクリックで0にする";
  completeSupportButton.disabled = true;
  const connectAllButton = document.createElement("button");
  connectAllButton.type = "button";
  connectAllButton.className = "secondary-action";
  connectAllButton.textContent = "未接続Patternをワンクリックで0にする";
  connectAllButton.disabled = true;
  const latticeEditLabel = document.createElement("label");
  latticeEditLabel.className = "skin-rebuild-lattice-edit-label";
  latticeEditLabel.textContent = "不要な蜘蛛ラティス線";
  const latticeEdgeSelect = document.createElement("select");
  latticeEdgeSelect.className = "skin-rebuild-lattice-edge-select";
  latticeEdgeSelect.disabled = true;
  latticeEdgeSelect.append(new Option("ラティス線なし", ""));
  latticeEdgeSelect.onchange = () => {
    const edgeId = latticeEdgeSelect.value === "" ? null : Number(latticeEdgeSelect.value);
    setSkinRebuildLatticeEdgeSelection(edgeId);
    render();
  };
  const latticeDeleteButton = document.createElement("button");
  latticeDeleteButton.type = "button";
  latticeDeleteButton.className = "secondary-action skin-rebuild-lattice-delete";
  latticeDeleteButton.textContent = "選択した黄色の線を削除";
  latticeDeleteButton.disabled = true;
  latticeDeleteButton.onclick = () => {
    const current = skinRebuildPipeline?.project;
    const edgeId = latticeEdgeSelect.value === "" ? Number.NaN : Number(latticeEdgeSelect.value);
    if (!skinRebuildPipelineIsCurrent() || !current || !Number.isInteger(edgeId)) return;
    const workflowBefore = captureSkinRebuildWorkflowSnapshot();
    const editedLattice = removeSkinRebuildLatticeEdge(current.lattice, edgeId);
    if (editedLattice === current.lattice) return;
    const settings = currentSkinRebuildPipelineSettings();
    const retainedConnections = retainConnectedSkinRebuildLatticeConnections(
      current.base,
      state.patches,
      current.patternSides,
      current.lowestPoints,
      editedLattice,
      current.latticeConnections,
      settings,
    );
    const project = assembleSkinRebuildProject(
      settings,
      current.base,
      state.patches,
      current.patternSides,
      current.dryWeb,
      current.lowestPoints,
      editedLattice,
      retainedConnections,
    );
    skinRebuildPipeline!.settings = settings;
    skinRebuildPipeline!.project = project;
    stage6BodyMeshCache = null;
    invalidateSkinRebuildFinalStages("工程5Aの蜘蛛ラティスを編集したため、工程6〜8を再実行してください");
    setSkinRebuildReinforcementPreview(null, []);
    installSkinRebuildPermanentLatticePreview(project, true);
    invalidateInternalPrintGate("蜘蛛の巣ラティスを編集しました。工程5B〜8を再実行してください");
    refreshSkinRebuildLatticeEdgeEditor();
    // Edge ids are compacted when the graph is rebuilt. Do not let the old
    // numeric id silently select a different edge after deletion.
    setSkinRebuildLatticeEdgeSelection(null);
    refreshSkinRebuildLowestPointMarkers(project);
    refreshSkinRebuildSelectedTarget();
    refreshSkinRebuildSelectedRegion();
    if (skinRebuildCompleteSupportButton) {
      skinRebuildCompleteSupportButton.disabled = project.audit.unsupportedTargetCount === 0;
    }
    const invalidated = current.latticeConnections.length - retainedConnections.length;
    const disconnected = skinRebuildDisconnectedPatternIds(project.patternSides, project.finalGraph).length;
    lattice.status.textContent = `線 #${edgeId + 1}を削除 · edge ${project.lattice.edges.length} · 切れた支持経路 ${invalidated} · 未支持 ${project.audit.unsupportedTargetCount} · 未接続Pattern ${disconnected}`;
    lattice.status.dataset.ok = String(project.audit.unsupportedTargetCount === 0 && disconnected === 0);
    printSupport.status.textContent = "作品を編集したため、印刷サポートを再生成してください";
    printSupport.status.dataset.ok = "false";
    setSkinRebuildMeshBottomProgress(
      "工程5A ラティス編集",
      `1本削除 · 残り${project.lattice.edges.length}本 · 未支持${project.audit.unsupportedTargetCount}点`,
    );
    commitSkinRebuildWorkflowHistory(`工程5A 線 #${edgeId + 1}を削除`, workflowBefore);
    render();
  };
  const latticeButton = document.createElement("button");
  latticeButton.type = "button";
  latticeButton.className = "primary-action";
  latticeButton.textContent = "5A. ラティスを1パス追加";
  latticeButton.disabled = true;
  const runLatticeBuild = async (
    button: HTMLButtonElement,
    idleText: string,
    busyText: string,
    options: Parameters<typeof buildSkinRebuildLattice>[5],
    actionLabel: string,
  ): Promise<void> => {
    if (!skinRebuildPipelineIsCurrent() || !skinRebuildPipeline?.lowestPoints || !skinRebuildPipeline.dryWeb) {
      lattice.status.textContent = "先に工程3と4を実行してください";
      lattice.status.dataset.ok = "false";
      return;
    }
    const workflowBefore = captureSkinRebuildWorkflowSnapshot();
    setSkinRebuildPipelineBusy(button, true, idleText, busyText);
    lattice.status.textContent = `${actionLabel}を計算中…`;
    setSkinRebuildMeshBottomProgress("工程5A 蜘蛛の巣ラティス", `${actionLabel}を計算中`);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const settings = currentSkinRebuildPipelineSettings();
      const built = buildSkinRebuildLattice(
        skinRebuildPipeline.base,
        state.patches,
        skinRebuildPipeline.patternSides,
        skinRebuildPipeline.lowestPoints,
        settings,
        {
          existingLattice: skinRebuildPipeline.project?.lattice,
          existingConnections: skinRebuildPipeline.project?.latticeConnections,
          ...options,
        },
      );
      const project = assembleSkinRebuildProject(
        settings,
        skinRebuildPipeline.base,
        state.patches,
        skinRebuildPipeline.patternSides,
        skinRebuildPipeline.dryWeb,
        skinRebuildPipeline.lowestPoints,
        built.lattice,
        built.connections,
      );
      skinRebuildPipeline.settings = settings;
      skinRebuildPipeline.project = project;
      stage6BodyMeshCache = null;
      invalidateSkinRebuildFinalStages("工程5Aの蜘蛛ラティスを更新したため、工程6〜8を再実行してください");
      setSkinRebuildReinforcementPreview(null, []);
      installSkinRebuildPermanentLatticePreview(project, true);
      invalidateInternalPrintGate("蜘蛛の巣ラティスを生成しました。次に工程5Bの赤面補強と工程6〜8を実行してください");
      refreshSkinRebuildLowestPointMarkers(project);
      ui.setInternalStructureStatus(
        `SKIN REBUILD蜘蛛の巣 · node ${project.finalGraph.nodes.length} / edge ${project.finalGraph.edges.length}`,
        project.audit.unsupportedTargetCount === 0,
      );
      const disconnected = built.disconnectedPatternIds.length;
      const spiderTargetIds = new Set(skinRebuildSpiderSupportTargetIds(project.patternSides, project.lowestPoints));
      const printSupportTargetCount = project.lowestPoints.filter((point) => point.needsSupport
        && !spiderTargetIds.has(point.patchId)).length;
      const fallbackSupportText = built.fallbackSupportCount > 0 ? `（既存蜘蛛へ迂回 ${built.fallbackSupportCount}）` : "";
      lattice.status.textContent = `${actionLabel}完了 · 水色ラティス表示中 / 橙サポートなし · Base内包OK ${built.containment.checkedEdgeCount}線 / ${built.containment.checkedSampleCount.toLocaleString()}点 · 今回 蜘蛛支持 ${built.addedSupportCount}${fallbackSupportText} / 接続 ${built.addedConnectivityCount} · 未接続 ${disconnected} · 蜘蛛支持 ${project.audit.supportedTargetCount}/${project.audit.overhangTargetCount} · 工程8印刷サポート候補 ${printSupportTargetCount}点 · edge ${project.lattice.edges.length}`;
      lattice.status.dataset.ok = String(project.audit.unsupportedTargetCount === 0 && disconnected === 0);
      setSkinRebuildMeshBottomProgress(
        "工程5A 完了",
        `${actionLabel} · 水色ラティス表示中 / 橙サポートなし · Base内包${built.containment.checkedEdgeCount}線/${built.containment.checkedSampleCount.toLocaleString()}点 · 直径${settings.strutDiameterMm.toFixed(1)}mm · 今回支持${built.addedSupportCount}${fallbackSupportText}/接続${built.addedConnectivityCount} · 未接続${disconnected} · 蜘蛛支持${project.audit.supportedTargetCount}/${project.audit.overhangTargetCount} · edge ${project.lattice.edges.length}`,
      );
      if (skinRebuildPrintSupportStatus) {
        skinRebuildPrintSupportStatus.textContent = "工程6で作品を確定し、工程7で残る赤を診断してください";
        delete skinRebuildPrintSupportStatus.dataset.ok;
      }
      if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = false;
      if (skinRebuildSaveStatus) {
        skinRebuildSaveStatus.textContent = project.audit.unsupportedTargetCount === 0
          ? "保存可能 · 元の編集履歴と工程3〜5を1ファイルへ入れます"
          : `未支持${project.audit.unsupportedTargetCount}点を事実として残したまま.fkei保存できます`;
        skinRebuildSaveStatus.dataset.ok = "true";
      }
      refreshSkinRebuildLatticeEdgeEditor();
      refreshSkinRebuildSelectedTarget();
      refreshSkinRebuildSelectedRegion();
      commitSkinRebuildWorkflowHistory(`工程5A ${actionLabel}`, workflowBefore);
      render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lattice.status.textContent = `ラティス生成失敗: ${message}`;
      lattice.status.dataset.ok = "false";
      setSkinRebuildMeshBottomProgress("工程5A 失敗", "ラティスを生成できませんでした", message);
    } finally {
      setSkinRebuildPipelineBusy(button, false, idleText, busyText);
      if (skinRebuildCompleteSupportButton) {
        skinRebuildCompleteSupportButton.disabled = !skinRebuildPipelineIsCurrent()
          || !skinRebuildPipeline?.project
          || skinRebuildPipeline.project.audit.unsupportedTargetCount === 0;
      }
      refreshSkinRebuildSelectedTarget();
      refreshSkinRebuildSelectedRegion();
    }
  };
  latticeButton.onclick = () => runLatticeBuild(
    latticeButton,
    "5A. ラティスを1パス追加",
    "1パス追加中…",
    { incremental: true, maximumRoutes: 1, mode: "auto" },
    "1パス追加",
  );
  selectedTargetButton.onclick = () => {
    const project = skinRebuildPipeline?.project;
    const patchId = skinRebuildSelectedTargetPatchId;
    if (!project || patchId === null) return;
    const point = project.lowestPoints.find((candidate) => candidate.patchId === patchId);
    const side = project.patternSides.find((candidate) => candidate.patchId === patchId);
    const requiresSpider = point ? skinRebuildRequiresSpiderSupport(point, side) : false;
    void runLatticeBuild(
      selectedTargetButton,
      "選択した赤面を処理",
      "選択赤面を処理中…",
      requiresSpider
        ? { maximumRoutes: 1, targetPatchIds: [patchId], mode: "support-only" }
        : { maximumRoutes: 1, preferredConnectivityPatchIds: [patchId], mode: "connectivity-only" },
      `Pattern #${patchId}`,
    );
  };
  regionReinforceButton.onclick = () => {
    const current = skinRebuildPipeline?.project;
    const overhang = skinRebuildPipeline?.overhang;
    const selectedRegions = overhang?.regions.filter((region) =>
      skinRebuildSelectedOverhangRegionIds.has(region.id)
      && !skinRebuildReinforcedOverhangRegionIds.has(region.id)) ?? [];
    if (!skinRebuildPipelineIsCurrent() || !current || selectedRegions.length === 0) return;
    const workflowBefore = captureSkinRebuildWorkflowSnapshot();
    activeSkinRebuildStage5BWorker?.terminate();
    activeSkinRebuildStage5BWorker = null;
    skinRebuildStage5BHeavyComputation?.finish();
    skinRebuildStage5BHeavyComputation = null;
    const requestId = ++skinRebuildStage5BRequestId;
    const settings = currentSkinRebuildPipelineSettings();
    const strutRadius = current.lattice.edges[0]?.radius
      ?? current.lattice.nodes[0]?.radius
      ?? 0.05;
    const regionTasks = selectedRegions.map((region) => {
      const surfaceSamples = sampleSkinRebuildOverhangRegionSurface(
        overhang!,
        region.id,
        // A capsule covers a two-radius band.  Slightly-over-one-radius
        // spacing preserves overlap while avoiding redundant face contacts.
        Math.max(strutRadius * 1.05, 1e-4),
      );
      const hubSample = surfaceSamples[0];
      return {
        regionId: region.id,
        surfacePoint: hubSample?.point ?? region.supportPoint,
        surfaceNormal: hubSample?.normal ?? region.supportNormal,
        surfaceSamples,
      };
    });
    const worker = new Worker(
      new URL("./rebuild/stage5bReinforcement.worker.ts", import.meta.url),
      { type: "module" },
    );
    activeSkinRebuildStage5BWorker = worker;
    let heavy: HeavyComputationHandle;
    const finishWorker = (): void => {
      if (activeSkinRebuildStage5BWorker === worker) activeSkinRebuildStage5BWorker = null;
      worker.terminate();
      heavy.finish();
      if (skinRebuildStage5BHeavyComputation === heavy) skinRebuildStage5BHeavyComputation = null;
      setSkinRebuildPipelineBusy(
        regionReinforceButton,
        false,
        "5B. 選択赤面を面→点の水色立体で補強",
        "5B. 面→点補強を計算中…",
      );
    };
    const cancelWorker = (): void => {
      if (activeSkinRebuildStage5BWorker !== worker) return;
      skinRebuildStage5BRequestId++;
      finishWorker();
      reinforcement.status.textContent = "工程5Bをキャンセルしました。選択赤面と元の蜘蛛ラティスは保持されています";
      reinforcement.status.dataset.ok = "false";
      setSkinRebuildMeshBottomProgress("工程5B 中断", "選択と既存形状を保持");
      refreshSkinRebuildSelectedRegion();
    };
    heavy = beginHeavyComputation("工程5B 赤面エリア補強", cancelWorker);
    skinRebuildStage5BHeavyComputation = heavy;
    setSkinRebuildPipelineBusy(
      regionReinforceButton,
      true,
      "5B. 選択赤面を面→点の水色立体で補強",
      "5B. 面→点補強を計算中…",
    );
    reinforcement.status.textContent = `計算開始 · ${regionTasks.length}領域 · 面接点ごとに最寄りの到達可能な蜘蛛ラティスを探索中`;
    reinforcement.status.dataset.ok = "true";
    setSkinRebuildMeshBottomProgress("工程5B 赤面エリア補強", `${regionTasks.length}領域 · 背景計算を開始 · 0.0秒`);
    heavy.updateActual(`${regionTasks.length}領域 · 準備中`, 1);
    worker.onmessage = (event: MessageEvent<SkinRebuildStage5BWorkerMessage>) => {
      const message = event.data;
      if (message.requestId !== requestId || activeSkinRebuildStage5BWorker !== worker) return;
      if (message.type === "progress") {
        const progress = skinRebuildStage5BProgressPercent(
          message.regionIndex,
          message.regionCount,
          message.progress,
        );
        const phase = message.progress.phase === "routing"
          ? `面接点 ${message.progress.completedContactCount + 1}/${message.progress.contactCount}${message.progress.candidateCount > 0 ? ` · 経路候補 ${message.progress.candidateIndex}/${message.progress.candidateCount}` : ""}`
          : message.progress.phase === "containment" ? "補強全体のBase内包を最終確認中" : "領域完了";
        const detail = `領域 ${message.regionIndex + 1}/${message.regionCount} (#${message.regionId}) · ${phase} · ${(message.elapsedMs / 1000).toFixed(1)}秒`;
        reinforcement.status.textContent = detail;
        heavy.updateActual(detail, progress);
        setSkinRebuildMeshBottomProgress("工程5B 赤面エリア補強", `${Math.round(progress)}% · ${detail}`);
        return;
      }
      finishWorker();
      if (message.type === "error") {
        reinforcement.status.textContent = `赤面エリア補強失敗: ${message.message}`;
        reinforcement.status.dataset.ok = "false";
        setSkinRebuildMeshBottomProgress("工程5B 失敗", `${(message.elapsedMs / 1000).toFixed(1)}秒`, message.message);
        refreshSkinRebuildSelectedRegion();
        return;
      }
      if (!skinRebuildPipelineIsCurrent() || skinRebuildPipeline?.project !== current) {
        reinforcement.status.textContent = "工程5Bの計算中に形状が変わったため、結果を適用しませんでした";
        reinforcement.status.dataset.ok = "false";
        setSkinRebuildMeshBottomProgress("工程5B 破棄", "形状変更後の古い結果");
        refreshSkinRebuildSelectedRegion();
        return;
      }
      if (message.regions.length === 0) {
        const reason = message.failures[0]?.message ?? "選択した赤面エリアを補強できませんでした";
        reinforcement.status.textContent = `赤面エリア補強失敗: ${reason}`;
        reinforcement.status.dataset.ok = "false";
        setSkinRebuildMeshBottomProgress("工程5B 失敗", `${(message.elapsedMs / 1000).toFixed(1)}秒`, reason);
        refreshSkinRebuildSelectedRegion();
        return;
      }
      const completedRegions = message.regions.filter((region) => region.complete);
      const partialRegions = message.regions.filter((region) => !region.complete);
      const reinforcedRegionIds = completedRegions.map((region) => region.regionId);
      const segmentCount = message.regions.reduce((sum, region) => sum + region.segmentCount, 0);
      const surfaceContactCount = message.regions.reduce((sum, region) => sum + region.surfaceContactCount, 0);
      const uncoveredSurfaceContactCount = partialRegions.reduce(
        (sum, region) => sum + region.uncoveredSurfaceContactCount,
        0,
      );
      const maximumEdgeAngleDeg = message.regions.reduce(
        (maximum, region) => Math.max(maximum, region.maximumEdgeAngleDeg),
        0,
      );
      const emptyPrintSupport = createEmptySkinRebuildGraph();
      const project = assembleSkinRebuildProject(
        settings,
        current.base,
        state.patches,
        current.patternSides,
        current.dryWeb,
        current.lowestPoints,
        message.lattice,
        current.latticeConnections,
        emptyPrintSupport,
      );
      skinRebuildPipeline!.settings = settings;
      skinRebuildPipeline!.project = project;
      stage6BodyMeshCache = null;
      invalidateSkinRebuildFinalStages("工程5Bで作品を補強したため、工程6のmesh確定から再実行してください");
      for (const regionId of reinforcedRegionIds) {
        skinRebuildReinforcedOverhangRegionIds.add(regionId);
        skinRebuildSelectedOverhangRegionIds.delete(regionId);
      }
      installSkinRebuildPermanentLatticePreview(project, true);
      setSkinRebuildReinforcementPreview(
        message.reinforcement,
        message.reinforcement.edges.map((edge) => edge.id),
      );
      skinRenderer.setPrintSupport(emptyPrintSupport);
      invalidateInternalPrintGate("赤面エリアを蜘蛛ラティスへ補強しました。工程6〜8を再実行してください");
      refreshSkinRebuildLatticeEdgeEditor();
      setSkinRebuildLatticeEdgeSelection(null);
      refreshSkinRebuildLowestPointMarkers(project);
      refreshSkinRebuildSelectedTarget();
      refreshSkinRebuildSelectedRegion();
      if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = false;
      reinforcement.status.textContent = `緑面 ${reinforcedRegionIds.length}領域 · 面接点${surfaceContactCount}点 → 明るい水色の面→点補強 ${segmentCount}本 · 最大${maximumEdgeAngleDeg.toFixed(1)}° · 全edge ${project.lattice.edges.length} · ${(message.elapsedMs / 1000).toFixed(1)}秒${partialRegions.length > 0 ? ` · 部分補強${partialRegions.length}領域（残り面接点${uncoveredSurfaceContactCount}）は追加形状と黄色選択を保持` : ""}${message.failures.length > 0 ? ` · 経路未作成${message.failures.length}領域` : ""}`;
      reinforcement.status.dataset.ok = "true";
      if (skinRebuildPrintSupportStatus) {
        skinRebuildPrintSupportStatus.textContent = "補強後の工程6確定と工程7最終診断を待っています";
        skinRebuildPrintSupportStatus.dataset.ok = "false";
      }
      if (skinRebuildSaveStatus) {
        skinRebuildSaveStatus.textContent = "保存可能 · 赤面エリア補強を恒久ラティスGraphへ保持します";
        skinRebuildSaveStatus.dataset.ok = "true";
      }
      setSkinRebuildMeshBottomProgress(
        "工程5B 赤面エリア補強",
        `100% · 緑${reinforcedRegionIds.length}領域 · 面接点${surfaceContactCount}点 → 明るい水色${segmentCount}本 · 最大${maximumEdgeAngleDeg.toFixed(1)}° · Base内包OK · ${(message.elapsedMs / 1000).toFixed(1)}秒${partialRegions.length > 0 ? ` · 部分補強${partialRegions.length}/残り接点${uncoveredSurfaceContactCount}` : ""}${message.failures.length > 0 ? ` · 経路未作成${message.failures.length}` : ""}`,
      );
      commitSkinRebuildWorkflowHistory("工程5B 赤面エリア補強", workflowBefore);
      render();
    };
    worker.onerror = (event) => {
      if (requestId !== skinRebuildStage5BRequestId || activeSkinRebuildStage5BWorker !== worker) return;
      finishWorker();
      reinforcement.status.textContent = `赤面エリア補強失敗: ${event.message}`;
      reinforcement.status.dataset.ok = "false";
      setSkinRebuildMeshBottomProgress("工程5B 失敗", "Worker error", event.message);
      refreshSkinRebuildSelectedRegion();
    };
    const request: SkinRebuildStage5BRequest = {
      type: "build",
      requestId,
      base: current.base,
      patterns: state.patches,
      patternSides: current.patternSides,
      lattice: current.lattice,
      settings,
      regions: regionTasks,
    };
    worker.postMessage(request);
  };
  bulkSupportButton.onclick = () => {
    const count = Math.max(1, Math.min(999, Math.floor(Number(bulkSupportCount.value) || 1)));
    bulkSupportCount.value = String(count);
    void runLatticeBuild(
      bulkSupportButton,
      "指定数をワンクリックで蜘蛛支持",
      `${count}点を支持中…`,
      { maximumRoutes: count, mode: "support-only" },
      `指定${count}点支持`,
    );
  };
  completeSupportButton.onclick = () => {
    const remaining = skinRebuildPipeline?.project?.audit.unsupportedTargetCount ?? 0;
    if (remaining <= 0) {
      completeSupportButton.disabled = true;
      lattice.status.textContent = "蜘蛛支持の未支持は0点です";
      lattice.status.dataset.ok = String(
        (skinRebuildPipeline?.project
          ? skinRebuildDisconnectedPatternIds(
            skinRebuildPipeline.project.patternSides,
            skinRebuildPipeline.project.finalGraph,
          ).length
          : 1) === 0,
      );
      return;
    }
    void runLatticeBuild(
      completeSupportButton,
      "蜘蛛支持の未支持をワンクリックで0にする",
      `残り${remaining}点をすべて支持中…`,
      { maximumRoutes: Number.MAX_SAFE_INTEGER, mode: "support-only" },
      `蜘蛛未支持${remaining}点を一括支持`,
    );
  };
  connectAllButton.onclick = () => runLatticeBuild(
    connectAllButton,
    "未接続Patternをワンクリックで0にする",
    "全Patternを接続中…",
    { maximumRoutes: Number.MAX_SAFE_INTEGER, mode: "connectivity-only" },
    "未接続一括接続",
  );
  lattice.section.append(
    diameterRow,
    latticeButton,
    targetSelectionHint,
    targetSelectionStatus,
    unsupportedFocusButton,
    selectedTargetButton,
    bulkSupportRow,
    bulkSupportButton,
    completeSupportButton,
    connectAllButton,
    latticeEditLabel,
    latticeEdgeSelect,
    latticeDeleteButton,
    lattice.status,
  );
  reinforcement.section.append(regionSelectionStatus, regionReinforceButton, reinforcement.status);

  const finalDiagnosis = makeStep(
    "7. 作品の最終診断",
    "工程6で確定したSurface Pattern＋蜘蛛ラティス＋赤面補強の作品meshを再解析し、まだ残っている危険面だけを赤く表示します。",
  );
  const finalDiagnosisButton = document.createElement("button");
  finalDiagnosisButton.type = "button";
  finalDiagnosisButton.className = "primary-action";
  finalDiagnosisButton.textContent = "7. 確定作品を診断して残る赤を表示";
  finalDiagnosisButton.disabled = true;
  finalDiagnosisButton.onclick = async () => {
    const current = skinRebuildPipeline?.project;
    if (!skinRebuildPipelineIsCurrent() || !current || skinRebuildFinalizedArtworkProject !== current) {
      finalDiagnosis.status.textContent = "先に工程6で作品をメッシュ化して確定してください";
      finalDiagnosis.status.dataset.ok = "false";
      return;
    }
    const workflowBefore = captureSkinRebuildWorkflowSnapshot();
    setSkinRebuildPipelineBusy(
      finalDiagnosisButton,
      true,
      "7. 確定作品を診断して残る赤を表示",
      "最終作品を診断中…",
    );
    finalDiagnosis.status.textContent = "確定作品meshを複数コアで解析中…";
    setSkinRebuildMeshBottomProgress("工程7 作品の最終診断", "複数コア解析を開始");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const currentSettings = currentSkinRebuildPipelineSettings();
      const settings = {
        ...currentSettings,
        analysisResolution: currentSettings.exportResolution,
      };
      const diagnosedArtwork = await diagnoseSkinRebuildArtworkForPrintSupport(
        current,
        settings,
        (progress) => {
          const percent = skinRebuildLowestProgressPercent(progress.phase, progress.completed, progress.total);
          const elapsed = (progress.elapsedMs / 1000).toFixed(1);
          finalDiagnosis.status.textContent = `最終診断 ${Math.round(percent)}% · ${progress.workerCount}コア · ${progress.faceCount.toLocaleString()} faces · ${elapsed}秒`;
          setSkinRebuildMeshBottomProgress(
            "工程7 作品の最終診断",
            `${Math.round(percent)}% · ${progress.workerCount}コア · ${progress.faceCount.toLocaleString()} faces · ${elapsed}秒`,
          );
        },
      );
      if (!skinRebuildPipelineIsCurrent()
        || skinRebuildPipeline?.project !== current
        || skinRebuildFinalizedArtworkProject !== current) {
        throw new Error("作品が変更されたため、最終診断結果を破棄しました");
      }
      const emptyPrintSupport = createEmptySkinRebuildGraph();
      const project = assembleSkinRebuildProject(
        settings,
        skinRebuildPipeline.base,
        state.patches,
        skinRebuildPipeline.patternSides,
        skinRebuildPipeline.dryWeb ?? createEmptySkinRebuildGraph(),
        skinRebuildPipeline.lowestPoints!,
        current.lattice,
        current.latticeConnections,
        emptyPrintSupport,
      );
      skinRebuildPipeline.settings = settings;
      skinRebuildPipeline.project = project;
      skinRebuildPipeline.overhang = {
        faceCount: diagnosedArtwork.overhangFaceCount,
        regionCount: diagnosedArtwork.overhangRegionCount,
        areaMm2: diagnosedArtwork.overhangAreaMm2,
        areaPercent: diagnosedArtwork.overhangAreaPercent,
        meshPositions: diagnosedArtwork.meshPositions,
        meshNormals: diagnosedArtwork.meshNormals,
        positions: diagnosedArtwork.overhangFacePositions,
        faceRegionIds: diagnosedArtwork.overhangFaceRegionIds,
        regions: diagnosedArtwork.overhangRegions,
      };
      skinRebuildFinalizedArtworkProject = project;
      skinRebuildFinalArtworkDiagnosis = { ...diagnosedArtwork, project };
      skinRebuildStage8CompletedProject = null;
      skinRenderer.setMeshOverlayBuffers(diagnosedArtwork.meshPositions, diagnosedArtwork.meshNormals);
      skinRenderer.setSkinRebuildOverhangOverlay(
        diagnosedArtwork.overhangFacePositions,
        diagnosedArtwork.overhangFaceRegionIds,
      );
      skinRebuildSelectedOverhangRegionIds.clear();
      skinRebuildReinforcedOverhangRegionIds.clear();
      viewMode = "mesh";
      skinRenderer.setViewMode(viewMode);
      ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
      skinRenderer.setPrintSupport(emptyPrintSupport);
      refreshSkinRebuildSelectedRegion();
      refreshSkinRebuildFinalStageButtons();
      invalidateInternalPrintGate("工程7で確定作品を再診断しました。工程8の印刷サポート生成後に最終判定します");
      finalDiagnosis.status.textContent = diagnosedArtwork.overhangFaceCount > 0
        ? `最終作品 ${diagnosedArtwork.faceCount.toLocaleString()} faces · 残る赤 ${diagnosedArtwork.overhangRegionCount}領域 / ${diagnosedArtwork.overhangFaceCount.toLocaleString()}面 / ${diagnosedArtwork.overhangAreaPercent.toFixed(1)}% · ${(diagnosedArtwork.elapsedMs / 1000).toFixed(1)}秒`
        : `最終作品 ${diagnosedArtwork.faceCount.toLocaleString()} faces · 残る赤0面 · 印刷サポート不要 · ${(diagnosedArtwork.elapsedMs / 1000).toFixed(1)}秒`;
      finalDiagnosis.status.dataset.ok = "true";
      setSkinRebuildMeshBottomProgress(
        "工程7 完了",
        `残る赤 ${diagnosedArtwork.overhangRegionCount}領域 / ${diagnosedArtwork.overhangFaceCount.toLocaleString()}面 / ${diagnosedArtwork.overhangAreaPercent.toFixed(1)}% · ${diagnosedArtwork.workerCount}コア · ${(diagnosedArtwork.elapsedMs / 1000).toFixed(1)}秒`,
      );
      if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = false;
      commitSkinRebuildWorkflowHistory("工程7 作品の最終診断", workflowBefore);
      render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skinRebuildFinalArtworkDiagnosis = null;
      finalDiagnosis.status.textContent = `最終診断失敗: ${message}`;
      finalDiagnosis.status.dataset.ok = "false";
      setSkinRebuildMeshBottomProgress("工程7 失敗", "最終作品を診断できませんでした", message);
      refreshSkinRebuildFinalStageButtons();
    } finally {
      setSkinRebuildPipelineBusy(
        finalDiagnosisButton,
        false,
        "7. 確定作品を診断して残る赤を表示",
        "最終作品を診断中…",
      );
      refreshSkinRebuildFinalStageButtons();
    }
  };
  finalDiagnosis.section.append(finalDiagnosisButton, finalDiagnosis.status);

  const printSupport = makeStep(
    "8. 残っている赤に印刷サポートを生成",
    "工程7で残った赤面の最下側へ、造形プレートから取り外し可能な橙色支柱を生成します。作品とは結合せず、別STL / OBJ / 同梱3MFとして保存します。",
  );
  const supportDiameterRow = document.createElement("label");
  supportDiameterRow.className = "row skin-rebuild-pipeline-setting";
  supportDiameterRow.append(document.createTextNode("印刷サポート直径 "));
  const supportDiameter = document.createElement("input");
  supportDiameter.type = "number";
  supportDiameter.min = "0.8";
  supportDiameter.max = "4";
  supportDiameter.step = "0.1";
  supportDiameter.value = String(DEFAULT_SKIN_REBUILD_SETTINGS.supportDiameterMm);
  supportDiameterRow.append(supportDiameter, document.createTextNode(" mm"));
  const printSupportButton = document.createElement("button");
  printSupportButton.type = "button";
  printSupportButton.className = "primary-action";
  printSupportButton.textContent = "8. 残っている赤に印刷サポートを生成";
  printSupportButton.disabled = true;
  printSupportButton.onclick = async () => {
    const pipeline = skinRebuildPipeline;
    const current = pipeline?.project;
    const lowestPoints = pipeline?.lowestPoints;
    const diagnosis = skinRebuildFinalArtworkDiagnosis;
    if (!skinRebuildPipelineIsCurrent() || !pipeline || !current || !lowestPoints
      || !diagnosis || diagnosis.project !== current) {
      printSupport.status.textContent = "先に工程7で確定作品を診断してください";
      printSupport.status.dataset.ok = "false";
      return;
    }
    const workflowBefore = captureSkinRebuildWorkflowSnapshot();
    setSkinRebuildPipelineBusy(
      printSupportButton,
      true,
      "8. 残っている赤に印刷サポートを生成",
      "印刷サポートを生成中…",
    );
    printSupport.status.textContent = `工程7の残る赤 ${diagnosis.overhangRegionCount}領域 / ${diagnosis.overhangFaceCount.toLocaleString()}面から支柱を生成中…`;
    setSkinRebuildMeshBottomProgress("工程8 印刷サポート", "残る赤面から別体支柱を生成");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const settings = currentSkinRebuildPipelineSettings();
      const supportGraph = buildSkinRebuildPrintSupport(
        current.base,
        state.patches,
        current.patternSides,
        diagnosis.lowestPoints,
        current.finalGraph,
        settings,
      );
      const project = assembleSkinRebuildProject(
        settings,
        pipeline.base,
        state.patches,
        pipeline.patternSides,
        pipeline.dryWeb ?? createEmptySkinRebuildGraph(),
        lowestPoints,
        current.lattice,
        current.latticeConnections,
        supportGraph,
      );
      pipeline.settings = settings;
      pipeline.project = project;
      skinRebuildFinalizedArtworkProject = project;
      skinRebuildFinalArtworkDiagnosis = { ...diagnosis, project };
      skinRebuildStage8CompletedProject = project;
      skinRenderer.setPrintSupport(project.printSupport);
      refreshSkinRebuildLowestPointMarkers(project);
      refreshSkinRebuildFinalStageButtons();
      invalidateInternalPrintGate("工程8で別体印刷サポートを更新しました。3D書き出し時に自動判定します");
      const count = project.printSupport.edges.length;
      printSupport.status.textContent = count > 0
        ? `残る赤 ${diagnosis.overhangRegionCount}領域 / ${diagnosis.overhangFaceCount.toLocaleString()}面へ、橙の別Graph ${settings.supportDiameterMm.toFixed(1)} mm × ${count}本を生成`
        : `残る赤 ${diagnosis.overhangRegionCount}領域 / ${diagnosis.overhangFaceCount.toLocaleString()}面を確認 · 追加支柱は0本でした`;
      printSupport.status.dataset.ok = "true";
      setSkinRebuildMeshBottomProgress(
        "工程8 完了",
        `残る赤 ${diagnosis.overhangRegionCount}領域 / ${diagnosis.overhangFaceCount.toLocaleString()}面 · 印刷サポート直径${settings.supportDiameterMm.toFixed(1)}mm · ${count}本 · 本体と別出力`,
      );
      if (skinRebuildSaveStatus) skinRebuildSaveStatus.textContent = "保存可能 · 恒久ラティスと印刷サポートを別Graphで保持します";
      refreshSkinRebuildStage8ExportButton();
      commitSkinRebuildWorkflowHistory("工程8 印刷サポート生成", workflowBefore);
      render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printSupport.status.textContent = `印刷サポート生成失敗: ${message}`;
      printSupport.status.dataset.ok = "false";
      setSkinRebuildMeshBottomProgress("工程8 失敗", "印刷サポートを生成できませんでした", message);
    } finally {
      setSkinRebuildPipelineBusy(
        printSupportButton,
        false,
        "8. 残っている赤に印刷サポートを生成",
        "印刷サポートを生成中…",
      );
      refreshSkinRebuildFinalStageButtons();
    }
  };
  printSupport.section.append(supportDiameterRow, printSupportButton, printSupport.status);

  const stage8Export = makeStep(
    "サポート確定後の3Dデータ書き出し",
    "必要な形式だけを選びます。3MFは作品と橙色サポートを同じ座標の別パーツで1ファイルへ入れます。STL / OBJは作品とサポートを別ファイルで保存します。",
  );
  const exportFormats = document.createElement("div");
  exportFormats.className = "skin-rebuild-export-formats";
  const makeExportFormat = (labelText: string, checked: boolean) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    label.append(input, document.createTextNode(` ${labelText}`));
    return { label, input };
  };
  const export3mf = makeExportFormat("3MF", true);
  const exportStl = makeExportFormat("STL", false);
  const exportObj = makeExportFormat("OBJ", false);
  exportFormats.append(export3mf.label, exportStl.label, exportObj.label);
  const stage8ExportButton = document.createElement("button");
  stage8ExportButton.type = "button";
  stage8ExportButton.className = "primary-action skin-rebuild-stage8-export";
  stage8ExportButton.textContent = "サポート確定後の3Dデータを書き出す";
  stage8ExportButton.disabled = true;
  stage8ExportButton.onclick = () => {
    const formats: SkinRebuildExportFormatSelection = {
      threeMf: export3mf.input.checked,
      stl: exportStl.input.checked,
      obj: exportObj.input.checked,
      recipe: false,
    };
    if (!formats.threeMf && !formats.stl && !formats.obj) {
      stage8Export.status.textContent = "3MF / STL / OBJのうち、少なくとも1形式を選んでください";
      stage8Export.status.dataset.ok = "false";
      return;
    }
    const names = [formats.threeMf ? "3MF" : "", formats.stl ? "STL" : "", formats.obj ? "OBJ" : ""]
      .filter(Boolean)
      .join(" + ");
    stage8Export.status.textContent = `${names}を書き出し中 · 進捗は下部STATUSにも表示します`;
    delete stage8Export.status.dataset.ok;
    exportMesh(ui.getMeshOptions(), formats);
  };
  stage8Export.section.append(exportFormats, stage8ExportButton, stage8Export.status);

  const save = makeStep(
    "編集可能な完成.fkeiを保存",
    "Base Shape / Surface Pattern履歴と、工程3〜8の事実を1ファイルへ保存します。未完了でも現在の事実を保持して保存できます。",
  );
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "primary-action";
  saveButton.textContent = "SKIN REBUILD完成.fkeiを保存";
  saveButton.disabled = true;
  saveButton.onclick = () => {
    try {
      const filename = saveCurrentSkinRebuildFkei();
      save.status.textContent = `${filename} を保存しました · printApproval=false`;
      save.status.dataset.ok = "true";
    } catch (error) {
      save.status.textContent = `保存失敗: ${error instanceof Error ? error.message : String(error)}`;
      save.status.dataset.ok = "false";
    }
  };
  save.section.append(saveButton, save.status);

  const makePipelinePanel = (label: string, description: string, ...steps: HTMLElement[]): HTMLElement => {
    const panel = document.createElement("section");
    panel.className = "skin-rebuild-pipeline-panel";
    panel.setAttribute("aria-label", label);
    const title = document.createElement("strong");
    title.textContent = label;
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = description;
    panel.append(title, hint, ...steps);
    return panel;
  };
  stage3Body.prepend(makePipelinePanel(
    "工程3 · Surface Patternの内外を決める",
    "Base Shapeがある側をinsideとして固定します。",
    inside.section,
  ));
  stage4Body.prepend(makePipelinePanel(
    "工程4 · オーバーハング部を検出",
    "Surface Patternの危険面を赤く表示し、蜘蛛ラティス用の最下端も抽出します。",
    lowest.section,
  ));
  stage5Body.prepend(makePipelinePanel(
    "工程5 · 作品内部を接続・補強",
    "5Aで蜘蛛の巣を作り、5Bで選択した赤面を面→点の明るい水色立体へ作り替えます。工程7では色の履歴ではなく完成形状を通常どおり再診断します。",
    lattice.section,
    reinforcement.section,
  ));
  const meshTitle = stage6Body.querySelector<HTMLElement>(".mesh-export-title");
  if (meshTitle) meshTitle.textContent = "6. 作品形状の確定 / Mesh化";
  const inspectButton = Array.from(stage6Body.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent === "メッシュを検査");
  if (inspectButton) inspectButton.textContent = "6. 作品をメッシュ化して確定";
  stage7Body.prepend(makePipelinePanel(
    "工程7 · 作品の最終診断",
    "工程6の確定meshにまだ残る危険面だけを赤表示します。",
    finalDiagnosis.section,
  ));
  stage8Body.prepend(makePipelinePanel(
    "工程8 · 残っている赤へ印刷サポート",
    "最終診断の赤面へ、作品と分離した橙色サポートを生成します。",
    printSupport.section,
    stage8Export.section,
    save.section,
  ));
  skinRebuildInsideStatus = inside.status;
  skinRebuildLowestStatus = lowest.status;
  skinRebuildLatticeStatus = lattice.status;
  skinRebuildReinforcementStatus = reinforcement.status;
  skinRebuildFinalDiagnosisStatus = finalDiagnosis.status;
  skinRebuildPrintSupportStatus = printSupport.status;
  skinRebuildStage8ExportStatus = stage8Export.status;
  skinRebuildSaveStatus = save.status;
  skinRebuildLowestButton = lowestButton;
  skinRebuildLatticeButton = latticeButton;
  skinRebuildFinalDiagnosisButton = finalDiagnosisButton;
  skinRebuildPrintSupportButton = printSupportButton;
  skinRebuildStage8ExportButton = stage8ExportButton;
  skinRebuildSaveButton = saveButton;
  skinRebuildThresholdInput = threshold;
  skinRebuildDiameterInput = diameter;
  skinRebuildSupportDiameterInput = supportDiameter;
  skinRebuildLatticeEdgeSelect = latticeEdgeSelect;
  skinRebuildLatticeDeleteButton = latticeDeleteButton;
  skinRebuildSelectedTargetStatus = targetSelectionStatus;
  skinRebuildSelectedTargetButton = selectedTargetButton;
  skinRebuildSelectedRegionStatus = regionSelectionStatus;
  skinRebuildSelectedRegionReinforceButton = regionReinforceButton;
  skinRebuildBulkSupportButton = bulkSupportButton;
  skinRebuildCompleteSupportButton = completeSupportButton;
  skinRebuildUnsupportedFocusButton = unsupportedFocusButton;
  skinRebuildConnectAllButton = connectAllButton;
  refreshSkinRebuildLatticeEdgeEditor();
  refreshSkinRebuildSelectedTarget();
  refreshSkinRebuildSelectedRegion();
  refreshSkinRebuildFinalStageButtons();
  refreshSkinRebuildStage8ExportButton();
}

function invalidateSkinRebuildPipeline(reason = "形状が変わったため、工程3から再実行してください"): void {
  cancelSkinRebuildLowestExtraction("形状が変わったため、工程4を停止しました");
  cancelSkinRebuildPrintSupportDiagnosis();
  stage6BodyMeshCache = null;
  setSkinRebuildReinforcementPreview(null, []);
  if (skinRebuildWorkflowHistoryPast.length > 0 || skinRebuildWorkflowHistoryFuture.length > 0) {
    resetSkinRebuildWorkflowHistory();
  }
  if (!skinRebuildPipeline) return;
  skinRebuildPipeline = null;
  skinRebuildSelectedTargetPatchId = null;
  skinRebuildSelectedOverhangRegionIds.clear();
  skinRebuildReinforcedOverhangRegionIds.clear();
  invalidateSkinRebuildFinalStages("形状が変わったため、工程6〜8は未実行です");
  skinRenderer.setMotifLowestPointMarkers(null, null);
  skinRenderer.setSkinRebuildOverhangOverlay(null);
  refreshSkinRebuildLatticeEdgeEditor();
  refreshSkinRebuildSelectedTarget();
  refreshSkinRebuildSelectedRegion();
  if (skinRebuildInsideStatus) {
    skinRebuildInsideStatus.textContent = reason;
    skinRebuildInsideStatus.dataset.ok = "false";
  }
  if (skinRebuildLowestStatus) skinRebuildLowestStatus.textContent = "工程3の再実行待ち";
  if (skinRebuildLatticeStatus) skinRebuildLatticeStatus.textContent = "工程3と4の再実行待ち";
  if (skinRebuildPrintSupportStatus) skinRebuildPrintSupportStatus.textContent = "工程7の最終診断待ち";
  if (skinRebuildSaveStatus) {
    skinRebuildSaveStatus.textContent = "工程3〜5の再実行待ち";
    skinRebuildSaveStatus.dataset.ok = "false";
  }
  if (skinRebuildLowestButton) skinRebuildLowestButton.disabled = true;
  if (skinRebuildLatticeButton) skinRebuildLatticeButton.disabled = true;
  if (skinRebuildBulkSupportButton) skinRebuildBulkSupportButton.disabled = true;
  if (skinRebuildCompleteSupportButton) skinRebuildCompleteSupportButton.disabled = true;
  if (skinRebuildConnectAllButton) skinRebuildConnectAllButton.disabled = true;
  if (skinRebuildPrintSupportButton) skinRebuildPrintSupportButton.disabled = true;
  if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = true;
  skinRenderer.setPrintSupport(null);
}

function skinRebuildPipelineOutputBlockReason(): string | null {
  if (!isSkinRebuildApp) return null;
  if (!skinRebuildPipelineIsCurrent() || !skinRebuildPipeline?.project) {
    return "SKIN REBUILD工程3〜5（内外判定・最下端抽出・ラティス生成）を完了してください";
  }
  if (skinRebuildPipeline.project.audit.unsupportedTargetCount > 0) {
    const unsupportedIds = skinRebuildUnsupportedSpiderTargetIds(skinRebuildPipeline.project);
    return `SKIN REBUILD蜘蛛支持が必要な赤面に未支持が${skinRebuildPipeline.project.audit.unsupportedTargetCount}点あります（Pattern #${unsupportedIds.join(", #")}）。黄色＋白枠で強調しました。「蜘蛛支持の未支持をワンクリックで0にする」を実行してください`;
  }
  const disconnected = skinRebuildDisconnectedPatternIds(
    skinRebuildPipeline.project.patternSides,
    skinRebuildPipeline.project.finalGraph,
  );
  if (disconnected.length > 0) {
    return `SKIN REBUILD作品に未接続Patternが${disconnected.length}個あります。「未接続Patternをワンクリックで0にする」を実行してください`;
  }
  if (!skinRebuildFinalDiagnosisIsCurrent()) {
    return "工程6で作品形状を確定し、工程7で残っている赤面を最終診断してください";
  }
  if ((skinRebuildFinalArtworkDiagnosis?.overhangFaceCount ?? 0) > 0
    && skinRebuildStage8CompletedProject !== skinRebuildPipeline.project) {
    return "工程7で残った赤面があります。工程8で別体印刷サポートを生成してください";
  }
  return null;
}

function saveCurrentSkinRebuildFkei(): string {
  if (!skinRebuildPipelineIsCurrent() || !skinRebuildPipeline?.project) {
    throw new Error("工程3〜5を完了してから保存してください");
  }
  const document = captureSkinRebuildFkei(skinRebuildPipeline.project, {
    savedAt: new Date().toISOString(),
    appVersion: manifest.version,
    generatorCommit: RUNNING_APP_COMMIT,
    shapeRecipe: serializeRecipe(history),
  });
  const text = serializeSkinRebuildFkei(document);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `skin-rebuild-complete-${stamp}.fkei`;
  downloadBlob(new Blob([text], { type: "application/json" }), filename);
  const unsupported = skinRebuildPipeline.project.audit.unsupportedTargetCount;
  projectMeta.textContent = `.fkei 保存済み · SKIN REBUILD工程3〜8 · 未支持${unsupported}点を記録 · ${filename}`;
  return filename;
}

function getInternalStructureGraph(): InternalStructureGraph | null {
  if (isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.project) {
    return skinRebuildPipeline.project.finalGraph;
  }
  if (state.skinParams.internalStructure === "none" || state.host.length === 0) {
    internalStructureFingerprint = "";
    internalStructureGraph = null;
    return null;
  }
  // A targeted graph is authoritative once produced by the Dry Web Worker.
  // Do not re-enter the synchronous builder from a later UI/readiness path.
  if (state.skinParams.internalStructure === "targetedGrid" && dryWebPreviewPending) {
    internalStructureFingerprint = "";
    internalStructureGraph = null;
    return null;
  }
  if (state.skinParams.internalStructure === "targetedGrid"
    && internalStructureGraph
    && dryWebPreviewIsCurrent()) return internalStructureGraph;
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
  if (state.skinParams.internalStructure === "targetedGrid") {
    // Targeted Dry Web is deliberately worker-owned.  There must be no
    // synchronous fallback here: reading a stale/partial target ledger from
    // a render path would recreate the 99% main-thread freeze.
    internalStructureFingerprint = "";
    internalStructureGraph = null;
    return null;
  }
  internalStructureGraph = buildVoronoiInternalStructure(
      state.host, state.hostParams.k, state.skinParams.internalDensity,
      state.skinParams.internalRadius, state.skinParams.internalRandomness, state.skinParams.seed,
    );
  internalStructureFingerprint = fingerprint;
  return internalStructureGraph;
}

function refreshInternalAngleScreening(graph: InternalStructureGraph | null): void {
  internalAngleScreeningGraph = graph && graph.edges.length > 0 ? graph : null;
  const available = internalAngleScreeningGraph !== null;
  if (!available) {
    internalAngleScreeningEnabled = false;
    internalAngleScreening = null;
  } else {
    internalAngleScreening = internalAngleScreeningEnabled
      ? screenInternalStructureAngles(internalAngleScreeningGraph)
      : null;
  }
  skinRenderer.setInternalAngleScreening(internalAngleScreening);
  ui.setInternalAngleScreening(available, internalAngleScreeningEnabled, internalAngleScreening);
}

function setInternalAngleScreeningEnabled(enabled: boolean): void {
  internalAngleScreeningEnabled = enabled && internalAngleScreeningGraph !== null;
  refreshInternalAngleScreening(internalAngleScreeningGraph);
  render();
}

function refreshInternalStructure(): void {
  if (dryWebInsufficientEdgeOverlayVisible) clearDryWebInsufficientEdgeOverlayState();
  try {
    const graph = getInternalStructureGraph();
    skinRenderer.setInternalStructure(graph);
    refreshInternalAngleScreening(graph);
    syncPhaseASupportPreviewAvailability(graph);
    if (!graph) {
      ui.setInternalStructureStatus(state.skinParams.internalStructure === "targetedGrid"
        ? state.mode === "window"
          ? "Dry Webは「プレートが実」で使います"
          : activeSurfaceAngleWorker
            ? "最終精度診断から赤点を取得しています…"
            : "Stage 4のSurface診断後、生成ボタンでDry Webを作ります"
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
    refreshInternalAngleScreening(null);
    syncPhaseASupportPreviewAvailability(null);
    ui.setInternalStructureStatus(`生成失敗: ${(error as Error).message}`, false);
  }
}

function syncPhaseASupportPreviewAvailability(graph: InternalStructureGraph | null): void {
  const separationBlockReason = dryWebSupportSeparationOutputBlockReason(
    state.skinParams.internalStructure,
    dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null,
  );
  const available = Boolean(graph?.edges.length && surfaceAngleCache && overhangSupportResult && !separationBlockReason);
  phaseARefreshButton.disabled = !available;
  phaseARefreshButton.title = available
    ? "Internal Structureの見た目を確認した後、印刷後に外すサポートのpreviewを生成します"
    : separationBlockReason ?? "工程7のInternal Structure生成とSurface診断が必要です";
  if (!available) {
    phaseASupportPreviewRequested = false;
    skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
    if (separationBlockReason) {
      phaseASupportStatus.textContent = separationBlockReason;
      phaseASupportStatus.dataset.stale = "true";
      delete phaseASupportStatus.dataset.ok;
    }
  } else if (!phaseASupportPreviewRequested) {
    phaseASupportStatus.textContent = "Internal Structure生成済み · 確認後にボタンを押して工程9へ進みます";
    delete phaseASupportStatus.dataset.ok;
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
  requestProjectUndo();
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

function updateSkinRebuildRegionSelectionMarquee(
  drag: NonNullable<typeof skinRebuildRegionDragSelection>,
  clientX: number,
  clientY: number,
): void {
  const viewportRect = viewport.getBoundingClientRect();
  const left = Math.min(drag.startX, clientX) - viewportRect.left;
  const top = Math.min(drag.startY, clientY) - viewportRect.top;
  const width = Math.abs(clientX - drag.startX);
  const height = Math.abs(clientY - drag.startY);
  Object.assign(skinRebuildRegionMarquee.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  skinRebuildRegionMarquee.dataset.operation = drag.operation;
  skinRebuildRegionMarquee.hidden = false;
}

function finishSkinRebuildRegionSelectionMarquee(
  drag: NonNullable<typeof skinRebuildRegionDragSelection>,
  clientX: number,
  clientY: number,
): void {
  skinRebuildRegionMarquee.hidden = true;
  const dragDistance = Math.hypot(clientX - drag.startX, clientY - drag.startY);
  const regionIds = dragDistance <= DRAG_THRESHOLD
    ? [skinRenderer.pickSkinRebuildOverhangRegion(clientX, clientY)].filter((id): id is number => id !== null)
    : skinRenderer.pickSkinRebuildOverhangRegionsInClientRect(
      drag.startX,
      drag.startY,
      clientX,
      clientY,
    );
  setSkinRebuildOverhangRegionSelections(regionIds, drag.operation);
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
    invalidateDryWebPreviewForInputChange("Support Paintを確定しました。Dry Web生成を押して反映してください");
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
    reapplySupportPaint("塗布対象は変わりませんでした", supportPaintSession.history.present);
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
  const skinRebuildRegionInteraction = isSkinRebuildApp
    && skinRebuildPipelineIsCurrent()
    && Boolean(skinRebuildPipeline?.overhang);
  const shiftedRegionHit = skinRebuildRegionInteraction && e.shiftKey
    ? skinRenderer.pickSkinRebuildOverhangRegion(e.clientX, e.clientY)
    : null;
  if (e.button === 0 && e.shiftKey && !skinRebuildRegionDragSelectEnabled && shiftedRegionHit === null) {
    // Shift + left drag belongs to the viewport camera even while paint is enabled.
    pointerDownPos = null;
    return;
  }
  if (e.button === 0 && e.shiftKey && !skinRebuildRegionDragSelectEnabled && shiftedRegionHit !== null) {
    // A Shift-click directly on red belongs to multi-selection, not camera pan.
    // The matching pointerup still reaches handleClick through pointerDownPos.
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    pointerDownPos = { x: e.clientX, y: e.clientY };
    return;
  }
  if (!supportPaintEnabled && e.button === 0 && skinRebuildRegionInteraction && skinRebuildRegionDragSelectEnabled) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const operation = e.ctrlKey || e.metaKey ? "remove" : e.shiftKey ? "add" : "replace";
    skinRebuildRegionDragSelection = {
      pointerId: e.pointerId,
      operation,
      startX: e.clientX,
      startY: e.clientY,
    };
    pointerDownPos = null;
    skinRenderer.setOrbitEnabled(false);
    skinRenderer.renderer.domElement.setPointerCapture?.(e.pointerId);
    updateSkinRebuildRegionSelectionMarquee(skinRebuildRegionDragSelection, e.clientX, e.clientY);
    viewport.classList.add("skin-rebuild-region-dragging");
    requestRenderFrame();
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
      phaseASupportStatus.textContent = "Paint drag中 · Dry Webはドラッグ確定後に生成ボタンを押します";
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
  if (isSkinRebuildApp && skinRebuildViewportSelectionMode === "lattice-edge") return;
  if (isSkinRebuildApp && skinRebuildPipeline?.overhang
    && skinRenderer.pickSkinRebuildOverhangRegion(e.clientX, e.clientY) !== null) return;
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
  if (skinRebuildRegionDragSelection && e.pointerId === skinRebuildRegionDragSelection.pointerId) {
    e.preventDefault();
    updateSkinRebuildRegionSelectionMarquee(skinRebuildRegionDragSelection, e.clientX, e.clientY);
    return;
  }
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
  if (skinRebuildRegionDragSelection && e.pointerId === skinRebuildRegionDragSelection.pointerId) {
    finishSkinRebuildRegionSelectionMarquee(skinRebuildRegionDragSelection, e.clientX, e.clientY);
    skinRebuildRegionDragSelection = null;
    skinRenderer.setOrbitEnabled(true);
    viewport.classList.remove("skin-rebuild-region-dragging");
    refreshSkinRebuildSelectedRegion();
    render();
    return;
  }
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
  if (skinRebuildRegionDragSelection) {
    skinRebuildRegionDragSelection = null;
    skinRebuildRegionMarquee.hidden = true;
    skinRenderer.setOrbitEnabled(true);
    viewport.classList.remove("skin-rebuild-region-dragging");
    refreshSkinRebuildSelectedRegion();
  }
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

  if (isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.overhang) {
    const regionId = skinRenderer.pickSkinRebuildOverhangRegion(e.clientX, e.clientY);
    if (regionId !== null) {
      const operation = e.ctrlKey || e.metaKey ? "remove" : e.shiftKey ? "add" : "replace";
      setSkinRebuildOverhangRegionSelection(regionId, operation);
      render();
      return;
    }
  }

  if (isSkinRebuildApp && skinRebuildViewportSelectionMode === "lattice-edge") {
    const graph = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project?.lattice ?? null : null;
    const edgeId = skinRenderer.pickInternalStructureEdge(e.clientX, e.clientY, graph);
    setSkinRebuildLatticeEdgeSelection(edgeId);
    render();
    return;
  }

  if (isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.project) {
    const selectableIds = skinRebuildPipeline.project.lowestPoints
      .filter((point) => point.needsSupport)
      .map((point) => point.patchId);
    const markerPatchId = skinRenderer.pickMotifLowestPointMarker(
      e.clientX,
      e.clientY,
      selectableIds,
    );
    const surfacePatchId = markerPatchId ?? fastPatchId(ray);
    if (selectableIds.includes(surfacePatchId ?? -1) && selectSkinRebuildTarget(surfacePatchId)) return;
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
  releaseCompetingDryWebPresentation("contactStrength");
  skinRenderer.updateContactStrength(null, state.skinParams.contactTarget);
  if (message && hadReport) ui.setContactStatus(message);
}

function showContactReport(report: ContactReport, updateStatus = true): void {
  releaseDryWebSupportSeparationPresentationForCompetingView();
  lastContactReport = report;
  if (viewMode !== "beads") setViewMode("beads");
  claimCompetingDryWebPresentation("contactStrength");
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
  if (groups.length > 0) {
    releaseDryWebSupportSeparationPresentationForCompetingView();
    claimCompetingDryWebPresentation("nPartition");
  } else releaseCompetingDryWebPresentation("nPartition");
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
  if (a + b > 0) claimCompetingDryWebPresentation("partition");
  else releaseCompetingDryWebPresentation("partition");
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
    if (state.partition) {
      claimCompetingDryWebPresentation("partition");
      skinRenderer.updateBeadGroups({ A: new Set(state.partition.groupA), B: new Set(state.partition.groupB) });
    }
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

function applyHistoryEntries(entries: SkinHistoryEntry[], replayedState = replay(entries)): void {
  const previousState = state;
  const restoreDryWebContactPresentation = dryWebContactPresentationCanReapply(dryWebContactPresentationOwner);
  const preserveDryWebPreview = isDryWebRequiredContactsOnlyChange(previousState, replayedState)
    && previousState.skinParams.internalStructure === "targetedGrid"
    && phaseADryWebPreview !== null
    && internalStructureGraph === phaseADryWebPreview.graph
    && dryWebPreviewIsCurrent()
    && !activeDryWebPreviewWorker
    && !activeDryWebExactRecheckWorker
    && !dryWebPreviewHeavyComputation
    && !activeSurfaceAngleWorker
    && !activeSurfaceSupportClassificationWorker
    && !surfaceHeavyComputation;
  cancelPartitionBuild();
  cancelNPartitionBuild();
  history = entries;
  state = replayedState;
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
  if (preserveDryWebPreview) {
    // Contact threshold is an interpretation-only history change. Keep the
    // generated graph/facts and re-screen them under the replayed threshold.
    syncUndoHistory();
    syncArtworkGraphStatus();
    refreshBottomStatusPane();
    render();
  } else {
    afterMutation();
  }
  refreshPartitionDraft();
  if (state.nPartition) showNPartitionGroups(state.nPartition.groups);
  refreshPrintProfileSummary();
  if (preserveDryWebPreview) {
    // refreshPartitionDraft/showNPartitionGroups can legitimately rebuild a
    // competing bead palette. Reapply Dry Web exactly once, after those
    // refreshes, only when Dry Web owned the author presentation before the
    // replay; otherwise leave the competing owner and hide its legend.
    if (restoreDryWebContactPresentation) dryWebContactPresentationOwner = "dryWeb";
    refreshDryWebActions();
    refreshBottomStatusPane();
    render();
  }
}

function prepareRecipeText(text: string): { entries: SkinHistoryEntry[]; state: ReturnType<typeof replay> } {
  // Parse and replay completely before any imported-recipe or Support Paint
  // state is changed. This is the validation boundary for atomic imports.
  const entries = parseRecipe(text);
  return { entries, state: replay(entries) };
}

function applyRecipeText(
  text: string,
  prepared = prepareRecipeText(text),
): void {
  applyHistoryEntries(prepared.entries, prepared.state);
  importedRecipeText = text;
}

function captureSkinRebuildWorkflowStatus(element: HTMLElement | null): SkinRebuildWorkflowStatusSnapshot | null {
  return element ? { text: element.textContent ?? "", ok: element.dataset.ok ?? null } : null;
}

function restoreSkinRebuildWorkflowStatus(
  element: HTMLElement | null,
  snapshot: SkinRebuildWorkflowStatusSnapshot | null,
): void {
  if (!element || !snapshot) return;
  element.textContent = snapshot.text;
  if (snapshot.ok === null) delete element.dataset.ok;
  else element.dataset.ok = snapshot.ok;
}

function captureSkinRebuildWorkflowSnapshot(): SkinRebuildWorkflowSnapshot {
  const pipeline = skinRebuildPipeline
    ? {
        ...skinRebuildPipeline,
      }
    : null;
  return {
    pipeline,
    finalizedArtworkProject: skinRebuildFinalizedArtworkProject,
    finalArtworkDiagnosis: skinRebuildFinalArtworkDiagnosis,
    stage8CompletedProject: skinRebuildStage8CompletedProject,
    stage6BodyMeshCache,
    reinforcementPreview: skinRebuildReinforcementPreview
      ? { graph: skinRebuildReinforcementPreview.graph, edgeIds: [...skinRebuildReinforcementPreview.edgeIds] }
      : null,
    selectedTargetPatchId: skinRebuildSelectedTargetPatchId,
    selectedOverhangRegionIds: new Set(skinRebuildSelectedOverhangRegionIds),
    reinforcedOverhangRegionIds: new Set(skinRebuildReinforcedOverhangRegionIds),
    statuses: {
      inside: captureSkinRebuildWorkflowStatus(skinRebuildInsideStatus),
      lowest: captureSkinRebuildWorkflowStatus(skinRebuildLowestStatus),
      lattice: captureSkinRebuildWorkflowStatus(skinRebuildLatticeStatus),
      reinforcement: captureSkinRebuildWorkflowStatus(skinRebuildReinforcementStatus),
      finalDiagnosis: captureSkinRebuildWorkflowStatus(skinRebuildFinalDiagnosisStatus),
      printSupport: captureSkinRebuildWorkflowStatus(skinRebuildPrintSupportStatus),
      save: captureSkinRebuildWorkflowStatus(skinRebuildSaveStatus),
      stage8Export: captureSkinRebuildWorkflowStatus(skinRebuildStage8ExportStatus),
    },
  };
}

function skinRebuildWorkflowSnapshotChanged(
  before: SkinRebuildWorkflowSnapshot,
  after: SkinRebuildWorkflowSnapshot,
): boolean {
  return before.pipeline?.patternSides !== after.pipeline?.patternSides
    || before.pipeline?.lowestPoints !== after.pipeline?.lowestPoints
    || before.pipeline?.overhang !== after.pipeline?.overhang
    || before.pipeline?.project !== after.pipeline?.project
    || before.finalizedArtworkProject !== after.finalizedArtworkProject
    || before.finalArtworkDiagnosis !== after.finalArtworkDiagnosis
    || before.stage8CompletedProject !== after.stage8CompletedProject
    || before.stage6BodyMeshCache !== after.stage6BodyMeshCache
    || before.reinforcementPreview?.graph !== after.reinforcementPreview?.graph;
}

function commitSkinRebuildWorkflowHistory(label: string, before: SkinRebuildWorkflowSnapshot): void {
  if (!isSkinRebuildApp) return;
  const after = captureSkinRebuildWorkflowSnapshot();
  if (!skinRebuildWorkflowSnapshotChanged(before, after)) return;
  skinRebuildWorkflowHistoryPast.push({ label, before, after });
  skinRebuildWorkflowHistoryFuture = [];
  syncProjectBar();
}

function resetSkinRebuildWorkflowHistory(): void {
  skinRebuildWorkflowHistoryPast = [];
  skinRebuildWorkflowHistoryFuture = [];
  syncProjectBar();
}

function restoreSkinRebuildWorkflowSnapshot(snapshot: SkinRebuildWorkflowSnapshot): void {
  cancelSkinRebuildLowestExtraction("工程履歴を復元しました");
  activeSkinRebuildStage5BWorker?.terminate();
  activeSkinRebuildStage5BWorker = null;
  skinRebuildStage5BRequestId += 1;
  skinRebuildStage5BHeavyComputation?.finish();
  skinRebuildStage5BHeavyComputation = null;
  cancelSkinRebuildPrintSupportDiagnosis();
  cancelMeshExport(false);

  skinRebuildPipeline = snapshot.pipeline
    ? {
        ...snapshot.pipeline,
      }
    : null;
  skinRebuildFinalizedArtworkProject = snapshot.finalizedArtworkProject;
  skinRebuildFinalArtworkDiagnosis = snapshot.finalArtworkDiagnosis;
  skinRebuildStage8CompletedProject = snapshot.stage8CompletedProject;
  stage6BodyMeshCache = snapshot.stage6BodyMeshCache;
  skinRebuildSelectedTargetPatchId = snapshot.selectedTargetPatchId;
  skinRebuildSelectedOverhangRegionIds = new Set(snapshot.selectedOverhangRegionIds);
  skinRebuildReinforcedOverhangRegionIds = new Set(snapshot.reinforcedOverhangRegionIds);

  const project = skinRebuildPipeline?.project ?? null;
  internalStructureGraph = project?.finalGraph ?? null;
  internalStructureFingerprint = "";
  skinRenderer.setInternalStructure(internalStructureGraph);
  skinRenderer.setPrintSupport(project?.printSupport ?? null);
  if (project) refreshSkinRebuildLowestPointMarkers(project);
  else skinRenderer.setMotifLowestPointMarkers(null, null);

  if (snapshot.finalArtworkDiagnosis) {
    showSkinRebuildStage6ArtworkMesh(
      snapshot.finalArtworkDiagnosis.meshPositions,
      snapshot.finalArtworkDiagnosis.meshNormals,
    );
    skinRenderer.setSkinRebuildOverhangOverlay(
      snapshot.finalArtworkDiagnosis.overhangFacePositions,
      snapshot.finalArtworkDiagnosis.overhangFaceRegionIds,
    );
  } else if (snapshot.stage6BodyMeshCache && snapshot.finalizedArtworkProject === project) {
    showSkinRebuildStage6ArtworkMesh(
      snapshot.stage6BodyMeshCache.positions,
      snapshot.stage6BodyMeshCache.normals,
    );
  } else if (skinRebuildPipeline?.overhang) {
    skinRenderer.setMeshOverlayBuffers(
      skinRebuildPipeline.overhang.meshPositions,
      skinRebuildPipeline.overhang.meshNormals,
    );
    skinRenderer.setSkinRebuildOverhangOverlay(
      skinRebuildPipeline.overhang.positions,
      skinRebuildPipeline.overhang.faceRegionIds,
    );
    viewMode = "mesh";
    skinRenderer.setViewMode(viewMode);
    ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
    if (project?.finalGraph.edges.length) setInternalObservationMode("ghostSkin");
  } else {
    skinRenderer.setSkinRebuildOverhangOverlay(null);
  }
  setSkinRebuildReinforcementPreview(
    snapshot.reinforcementPreview?.graph ?? null,
    snapshot.reinforcementPreview?.edgeIds ?? [],
  );

  refreshSkinRebuildLatticeEdgeEditor();
  refreshSkinRebuildSelectedTarget();
  refreshSkinRebuildSelectedRegion();
  refreshSkinRebuildFinalStageButtons();
  refreshSkinRebuildStage8ExportButton();
  if (skinRebuildLowestButton) skinRebuildLowestButton.disabled = skinRebuildPipeline === null;
  if (skinRebuildLatticeButton) skinRebuildLatticeButton.disabled = !skinRebuildPipeline?.lowestPoints;
  if (skinRebuildBulkSupportButton) skinRebuildBulkSupportButton.disabled = project === null;
  if (skinRebuildCompleteSupportButton) {
    skinRebuildCompleteSupportButton.disabled = project === null || project.audit.unsupportedTargetCount === 0;
  }
  if (skinRebuildUnsupportedFocusButton) {
    skinRebuildUnsupportedFocusButton.disabled = project === null || project.audit.unsupportedTargetCount === 0;
  }
  if (skinRebuildConnectAllButton) skinRebuildConnectAllButton.disabled = project === null;
  if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = project === null;

  restoreSkinRebuildWorkflowStatus(skinRebuildInsideStatus, snapshot.statuses.inside);
  restoreSkinRebuildWorkflowStatus(skinRebuildLowestStatus, snapshot.statuses.lowest);
  restoreSkinRebuildWorkflowStatus(skinRebuildLatticeStatus, snapshot.statuses.lattice);
  restoreSkinRebuildWorkflowStatus(skinRebuildReinforcementStatus, snapshot.statuses.reinforcement);
  restoreSkinRebuildWorkflowStatus(skinRebuildFinalDiagnosisStatus, snapshot.statuses.finalDiagnosis);
  restoreSkinRebuildWorkflowStatus(skinRebuildPrintSupportStatus, snapshot.statuses.printSupport);
  restoreSkinRebuildWorkflowStatus(skinRebuildSaveStatus, snapshot.statuses.save);
  restoreSkinRebuildWorkflowStatus(skinRebuildStage8ExportStatus, snapshot.statuses.stage8Export);
  invalidateInternalPrintGate("工程履歴を戻したため、書き出し時に最終判定を再実行します");
  render();
}

function undoSkinRebuildWorkflowOperation(): void {
  const entry = skinRebuildWorkflowHistoryPast.pop();
  if (!entry) return;
  skinRebuildWorkflowHistoryFuture.push(entry);
  restoreSkinRebuildWorkflowSnapshot(entry.before);
  ui.setUndoStatus(`工程を戻しました: ${entry.label}`);
  projectMeta.textContent = `UNDO · ${entry.label}`;
  syncProjectBar();
}

function redoSkinRebuildWorkflowOperation(): void {
  const entry = skinRebuildWorkflowHistoryFuture.pop();
  if (!entry) return;
  skinRebuildWorkflowHistoryPast.push(entry);
  restoreSkinRebuildWorkflowSnapshot(entry.after);
  ui.setUndoStatus(`工程をやり直しました: ${entry.label}`);
  projectMeta.textContent = `REDO · ${entry.label}`;
  syncProjectBar();
}

function requestProjectUndo(): void {
  if (supportPaintEnabled) {
    undoOneSupportPaintOperation();
    return;
  }
  if (skinRebuildWorkflowHistoryPast.length > 0) {
    undoSkinRebuildWorkflowOperation();
    return;
  }
  requestShapeUndo();
}

function requestProjectRedo(): void {
  if (supportPaintEnabled) {
    redoOneSupportPaintOperation();
    return;
  }
  if (skinRebuildWorkflowHistoryFuture.length > 0) redoSkinRebuildWorkflowOperation();
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
  const workflowUndo = !supportPaintEnabled
    ? skinRebuildWorkflowHistoryPast[skinRebuildWorkflowHistoryPast.length - 1] ?? null
    : null;
  const workflowRedo = !supportPaintEnabled
    ? skinRebuildWorkflowHistoryFuture[skinRebuildWorkflowHistoryFuture.length - 1] ?? null
    : null;

  projectUndoButton.disabled = !(canPaintUndo || workflowUndo || canShapeUndo);
  projectUndoButton.textContent = supportPaintEnabled
    ? "Undo · Paint"
    : workflowUndo ? `Undo · ${workflowUndo.label}` : "Undo · Shape";
  projectUndoButton.title = supportPaintEnabled
    ? "Support Paint Undo（右のPaint履歴と同じ）"
    : workflowUndo ? `SKIN REBUILD工程履歴を戻す: ${workflowUndo.label}` : "Shape history Undo（既存の形状履歴）";
  projectRedoButton.disabled = !(canPaintRedo || workflowRedo);
  projectRedoButton.textContent = supportPaintEnabled
    ? "Redo · Paint"
    : workflowRedo ? `Redo · ${workflowRedo.label}` : "Redo";
  projectRedoButton.title = supportPaintEnabled
    ? "Support Paint Redo（右のPaint履歴と同じ）"
    : workflowRedo ? `SKIN REBUILD工程履歴をやり直す: ${workflowRedo.label}` : "Shape Redoは未実装です";
}

async function importHistory(file: File): Promise<void> {
  ui.setHistoryImportStatus("読込中…");
  const previous = {
    history,
    state,
    supportPaintSession,
    supportPaintDraftSavedAt,
    supportPaintDraftDirty,
    importedRecipeSha256,
    importedRecipeFilename,
    importedRecipeText,
  };
  try {
    const text = await file.text();
    const prepared = prepareRecipeText(text);
    // Keep the hash local until parse + replay validation and the visible
    // state apply have succeeded. It is the exact text cited in partition
    // provenance as `inputRecipe` (instruction: "入力recipe SHA-256").
    const importedSha256 = await sha256Hex(text);
    supportPaintSession = createSupportPaintSession();
    resetSupportPaintUndoJournal();
    supportPaintDraftSavedAt = null;
    supportPaintDraftDirty = false;
    applyRecipeText(text, prepared);
    importedRecipeSha256 = importedSha256;
    importedRecipeFilename = file.name;
    importedRecipeText = text;
    restoreAutosavedSupportPaintDraft();
    ui.setHistoryImportStatus(`読込完了・履歴${prepared.entries.length}件`, true);
  } catch (err) {
    // A malformed/unsupported recipe must leave both the visible shape and
    // import-associated sessions untouched. The candidate replay above is
    // never assigned until parsing and replay have succeeded.
    history = previous.history;
    state = previous.state;
    supportPaintSession = previous.supportPaintSession;
    supportPaintDraftSavedAt = previous.supportPaintDraftSavedAt;
    supportPaintDraftDirty = previous.supportPaintDraftDirty;
    importedRecipeSha256 = previous.importedRecipeSha256;
    importedRecipeFilename = previous.importedRecipeFilename;
    importedRecipeText = previous.importedRecipeText;
    const reason = err instanceof Error ? err.message : String(err);
    ui.setHistoryImportStatus(`読込失敗: ${reason}`, false);
    alert(`履歴の読み込みに失敗しました: ${reason}`);
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

function fkeiDryWebTargetList(
  targets: Array<MotifLowestPoint | OverhangDryWebTarget>,
): OverhangDryWebTarget[] | null {
  if (!targets.every((target) => (
    "assignmentId" in target
    && typeof target.assignmentId === "string"
    && target.basis === "finalMesh"
    && Number.isFinite(target.markerRadius)
    && typeof target.reachedByInternal === "boolean"
    && target.position !== null
    && typeof target.position === "object"
    && [target.position.x, target.position.y, target.position.z].every(Number.isFinite)
  ))) return null;
  return targets as OverhangDryWebTarget[];
}

function currentFkeiSurfaceBinding(): FkeiSurfaceArtifact["binding"] | null {
  if (!surfaceAngleCache) return null;
  const options = ui.getMeshOptions();
  return {
    surfaceFingerprint: currentTargetSurfaceFingerprint(),
    resolution: Math.max(16, Math.round(options.resolution)),
    targetLongestMm: options.targetLongestMm,
    angleThresholdDeg: ui.getSurfaceAngleThreshold(),
    cacheKeys: activeSurfacePersistentCacheKeys,
  };
}

function restoredRiskDrivenCheckpointIsCurrent(
  canonical: NonNullable<FkeiRestorePlan["canonicalDryWeb"]>,
  lattice: NonNullable<FkeiRestorePlan["riskDrivenLattice"]>,
): boolean {
  const binding = canonical.inputBinding;
  const currentSurface = currentFkeiSurfaceBinding();
  const acceptedSurface = acceptedSurfaceSaveBinding;
  return restoredCanonicalDryWeb === canonical
    && restoredRiskDrivenLattice === lattice
    && fkeiRestoredRiskDrivenCheckpointGraphIsCurrent(canonical, lattice, internalStructureGraph)
    && fkeiShapeFingerprint(state) === binding.shapeFingerprint
    && state.patchSetRevision === binding.patchSetRevision
    && supportPaintSession.revision === binding.paintRevision
    && artworkGraphSourceKey === binding.artworkGraphSourceKey
    && currentSurface !== null
    && currentSurface.surfaceFingerprint === binding.shapeFingerprint
    && currentSurface.resolution === binding.surfaceResolution
    && currentSurface.targetLongestMm === binding.surfaceTargetLongestMm
    && currentSurface.angleThresholdDeg === binding.surfaceAngleThresholdDeg
    && acceptedSurface?.surfaceFingerprint === currentSurface.surfaceFingerprint
    && acceptedSurface.resolution === currentSurface.resolution
    && acceptedSurface.targetLongestMm === currentSurface.targetLongestMm
    && acceptedSurface.angleThresholdDeg === currentSurface.angleThresholdDeg
    && canonical.exactDiagnosisSummary.provenanceSha256 === binding.exactDiagnosisProvenanceSha256
    && lattice.inputBinding.canonicalRequestSha256 === binding.canonicalRequestSha256;
}

/** The restored lattice is a reviewed observation, never a stale overlay.
 * This single predicate is used by toggle, BODY and every render transition. */
function refreshRestoredRiskDrivenLatticeCurrentness(): void {
  if (!restoredCanonicalDryWeb || !restoredRiskDrivenLattice) return;
  if (restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice)) return;
  if (riskDrivenPermanentLatticeOverlayEnabled) {
    riskDrivenPermanentLatticeOverlayEnabled = false;
    skinRenderer.clearRiskDrivenPermanentLatticeOverlay();
  }
  ui.setRiskDrivenPermanentLattice({
    available: false,
    enabled: false,
    status: "saved latticeは現在のShape/Paint/Surface bindingと一致しません",
    onBody: "再Openまたは現在状態の確認が必要",
  });
}

function currentFkeiRuntimeSaveSnapshot(): FkeiRuntimeSaveFacts {
  const artworkBoundary = currentDryWebArtworkGraphBoundary();
  const artworkCurrent = artworkBoundary.status === "current"
    && artworkGraphSnapshot !== null
    && artworkGraphSourceKey !== null;
  const surfaceBusy = Boolean(
    activeSurfaceAngleWorker
    || activeSurfaceSupportClassificationWorker
    || surfaceHeavyComputation
    || supportPaintDrag
    || supportPaintApplyReplacePending > 0
    || (activeSupportPaintWorker && !supportPaintApplyWorkerReady),
  );
  const currentSurfaceBinding = currentFkeiSurfaceBinding();
  const acceptedSurfaceBinding = acceptedSurfaceSaveBinding;
  const surfaceCurrent = Boolean(
    currentSurfaceBinding
    && surfaceAngleCache
    && automaticOverhangSupportResult
    && overhangSupportResult
    && surfaceAnglePersistentCacheStatus !== "error"
    && !surfaceBusy,
  );
  const supportPaintExists = supportPaintSession.history.present.strokes.length > 0
    || supportPaintSession.history.past.length > 0
    || supportPaintSession.history.future.length > 0
    || supportPaintSession.revision > 0;
  const supportPaintCurrent = Boolean(surfaceCurrent && supportPaintExists && !supportPaintSession.activeStroke);
  const dryBaseCurrent = Boolean(
    phaseADryWebPreview
    && dryWebPreviewIsCurrent()
    && targetedSupportSourceIsCurrent()
    && !dryWebInsideTargetRunActive(),
  );
  const dryTargets = targetedSupportSource ? fkeiDryWebTargetList(targetedSupportSource.targets) : null;
  const canonicalCurrent = Boolean(
    dryBaseCurrent
    && stage7CanonicalCandidateAdoption
    && stage7CanonicalCandidateAdoptionIsCurrent({ clearStale: false }),
  );
  const retainedCanonicalFacts = canonicalCurrent
    ? stage7CanonicalCandidateAdoptionUndo?.phaseADryWebPreview.targetConnectionFacts
    : undefined;
  if (canonicalCurrent && !retainedCanonicalFacts) {
    throw new Error("Stage 7 canonical adoption の targetConnectionFacts がありません");
  }
  const dryWebCurrent = Boolean(
    dryBaseCurrent
    && dryTargets
    && phaseADryWebPreview
    && (!canonicalCurrent || retainedCanonicalFacts),
  );

  let surface: FkeiSurfaceArtifact | undefined;
  const surfaceArtifactBinding = acceptedSurfaceBinding ?? currentSurfaceBinding;
  if (surfaceArtifactBinding && surfaceAngleCache && automaticOverhangSupportResult && overhangSupportResult) {
    surface = {
      diagnosis: surfaceAngleCache,
      automaticSupportResult: automaticOverhangSupportResult,
      effectiveSupportResult: overhangSupportResult,
      binding: surfaceArtifactBinding,
    };
  }

  let supportPaint: FkeiSupportPaintArtifact | undefined;
  if (supportPaintCurrent) {
    supportPaint = {
      revision: supportPaintSession.revision,
      history: supportPaintSession.history,
      mode: supportPaintMode,
      radiusMm: supportPaintRadiusMm,
      paintBackfaces: supportPaintBackfaces,
      enabled: supportPaintEnabled,
      editorView: skinRenderer.captureEditorViewDraft(editorLayoutState),
    };
  }

  let artworkGraph: NonNullable<FkeiRuntimeSaveFacts["artworkGraph"]> | undefined;
  if (artworkGraphSnapshot && artworkGraphSourceKey) {
    artworkGraph = {
      current: artworkCurrent,
      value: { snapshot: artworkGraphSnapshot, sourceKey: artworkGraphSourceKey },
    };
  }

  let dryWeb: FkeiDryWebArtifact | undefined;
  if (dryWebCurrent && phaseADryWebPreview && targetedSupportSource && dryTargets) {
    const preview = phaseADryWebPreview;
    const adoption = stage7CanonicalCandidateAdoption;
    const exactCurrent = dryWebSupportSeparationIsCurrent() && dryWebSupportSeparationSource !== null && surfaceArtifactBinding !== null;
    dryWeb = {
      preview: {
        surfaceFingerprint: preview.surfaceFingerprint,
        resolution: preview.resolution,
        paintRevision: preview.paintRevision,
        artworkGraphSnapshot: preview.artworkGraphSnapshot,
        artworkGraphSourceKey: preview.artworkGraphSourceKey,
        graph: preview.graph,
        targetConnectionFacts: canonicalCurrent ? null : preview.targetConnectionFacts,
        contactFloorFacts: canonicalCurrent ? null : preview.contactFloorFacts,
        facts: canonicalCurrent ? null : preview.facts,
        ...(canonicalCurrent && adoption && retainedCanonicalFacts ? {
          canonicalAdoption: {
            surfaceFingerprint: adoption.surfaceFingerprint,
            resolution: adoption.resolution,
            paintRevision: adoption.paintRevision,
            artworkGraphSourceKey: adoption.artworkGraphSourceKey ?? "",
            mode: adoption.mode,
            supportSettingsKey: adoption.supportSettingsKey,
            targetConnectionFacts: retainedCanonicalFacts,
            exactValidated: adoption.exactValidated,
          },
        } : {}),
        computeMs: preview.computeMs,
      },
      targetSource: {
        surfaceFingerprint: targetedSupportSource.surfaceFingerprint,
        resolution: targetedSupportSource.resolution,
        targets: dryTargets,
      },
      ...(exactCurrent ? {
        exactDiagnosis: dryWebSupportSeparationSource!,
        exactBinding: surfaceArtifactBinding!,
      } : {}),
    };
  }

  let printProfile: FkeiPrintProfileArtifact | undefined;
  if (activePrintProfile && activePrintProfileText && activePrintProfileSha256) {
    try {
      const profile = validateSkinPrintProfile(activePrintProfile);
      if (matchPrintProfile(profile, currentPrintProfileBinding(profile)).matches) {
        printProfile = {
          profile,
          text: activePrintProfileText,
          ...(activePrintProfileFilename ? { filename: activePrintProfileFilename } : {}),
          sha256: activePrintProfileSha256,
        };
      }
    } catch {
      // A stale or malformed profile is intentionally omitted from a save.
    }
  }

  return {
    shape: { formatVersion: 1, entries: history },
    bindings: {
      shapeFingerprint: currentTargetSurfaceFingerprint(),
      patchSetRevision: state.patchSetRevision,
      paintRevision: supportPaintSession.revision,
    },
    stageCurrent: {
      1: history.length > 0 && state.host.length > 0,
      2: state.patches.length > 0,
      3: artworkCurrent,
      4: dryWebCurrent || Boolean(
        restoredCanonicalDryWeb
        && restoredRiskDrivenLattice
        && restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice),
      ),
      5: dryWebCurrent || supportPaintCurrent,
      6: surfaceCurrent,
      7: dryWebCurrent && Boolean(
        (dryWebSupportSeparationIsCurrent() && dryWebSupportSeparationSource)
        || (canonicalCurrent && stage7CanonicalCandidateAdoption?.exactValidated),
      ),
    },
    ...(supportPaint ? { supportPaint: { current: true, value: supportPaint } } : {}),
    ...(artworkGraph ? { artworkGraph } : {}),
    ...(surface && currentSurfaceBinding ? {
      surface: {
        value: surface,
        current: surfaceCurrent,
        acceptedBinding: acceptedSurfaceBinding,
        currentBinding: currentSurfaceBinding,
        ...(supportPaintSurfaceCache?.diagnosis === surfaceAngleCache
          ? { supportPaintSurfaceTargetLongestMm: supportPaintSurfaceCache.targetLongestMm }
          : {}),
      },
    } : {}),
    ...(dryWeb ? { dryWeb: { current: dryWebCurrent, value: dryWeb } } : dryBaseCurrent && phaseADryWebPreview && targetedSupportSource && dryTargets ? {
      dryWeb: { current: false, value: {
        preview: {
          surfaceFingerprint: phaseADryWebPreview.surfaceFingerprint,
          resolution: phaseADryWebPreview.resolution,
          paintRevision: phaseADryWebPreview.paintRevision,
          artworkGraphSnapshot: phaseADryWebPreview.artworkGraphSnapshot,
          artworkGraphSourceKey: phaseADryWebPreview.artworkGraphSourceKey,
          graph: phaseADryWebPreview.graph,
          targetConnectionFacts: phaseADryWebPreview.targetConnectionFacts,
          contactFloorFacts: phaseADryWebPreview.contactFloorFacts,
          facts: phaseADryWebPreview.facts,
          computeMs: phaseADryWebPreview.computeMs,
        },
        targetSource: { surfaceFingerprint: targetedSupportSource.surfaceFingerprint, resolution: targetedSupportSource.resolution, targets: dryTargets },
      } },
    } : {}),
    ...(restoredCanonicalDryWeb && restoredRiskDrivenLattice
      && restoredRiskDrivenCheckpointIsCurrent(restoredCanonicalDryWeb, restoredRiskDrivenLattice) ? {
      canonicalDryWeb: { current: true, value: restoredCanonicalDryWeb },
      riskDrivenLattice: { current: true, value: restoredRiskDrivenLattice },
    } : {}),
    ...(printProfile ? { printProfile: { current: true, value: printProfile } } : {}),
    compatibility: { appVersion: manifest.version, generatorCommit: RUNNING_APP_COMMIT },
  };
}

function saveCurrentFkeiProject(): void {
  try {
    if (isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.project) {
      saveCurrentSkinRebuildFkei();
      return;
    }
    const result = saveFkeiRuntime(buildFkeiRuntimeSaveSnapshot(currentFkeiRuntimeSaveSnapshot()), {
      savedAt: new Date(),
      download: (text, filename) => downloadBlob(new Blob([text], { type: "application/json" }), filename),
    });
    projectMeta.textContent = `.fkei 保存済み · Stage ${result.completedStage ?? "--"} · ${result.filename}`;
  } catch (error) {
    console.error("[SKIN .fkei Save] failed", error);
    projectMeta.textContent = ".fkeiを保存できませんでした。現在の工程データを確認してください。";
  }
}

type FkeiOpenStage =
  | "picker-opened"
  | "file-selected"
  | "file-read-started"
  | "file-read-complete"
  | "document-parsed"
  | "restore-plan-created"
  | "restore-plan-validated"
  | "runtime-applied"
  | "ui-synchronized"
  | "failed";

const FKEI_OPEN_STAGE_MESSAGE: Readonly<Record<FkeiOpenStage, string>> = {
  "picker-opened": ".fkeiを選択してください",
  "file-selected": ".fkeiを読み込んでいます",
  "file-read-started": ".fkeiを読み込んでいます",
  "file-read-complete": ".fkeiを検証しています",
  "document-parsed": ".fkeiを検証しています",
  "restore-plan-created": ".fkeiを検証しています",
  "restore-plan-validated": ".fkeiを反映しています",
  "runtime-applied": ".fkeiを画面へ反映しています",
  "ui-synchronized": ".fkei Open完了",
  "failed": ".fkeiを開けませんでした。現在の工程データを確認してください。",
};

let activeFkeiOpenAttempt = 0;

function reportFkeiOpenStage(
  attempt: number,
  stage: FkeiOpenStage,
  detail: Readonly<Record<string, unknown>> = {},
  statusText = FKEI_OPEN_STAGE_MESSAGE[stage],
): void {
  console.info("[SKIN .fkei Open stage] " + JSON.stringify({ attempt, stage, ...detail }));
  projectMeta.textContent = statusText;
}

projectOpenButton.onclick = () => {
  activeFkeiOpenAttempt += 1;
  // Reset immediately before opening the picker so selecting the same file
  // again always produces a change event. This is a dedicated .fkei input;
  // the legacy Shape History import input is not involved.
  projectOpenInput.value = "";
  reportFkeiOpenStage(activeFkeiOpenAttempt, "picker-opened");
  projectOpenInput.click();
};

type FkeiOpenRuntimeSnapshot = {
  readonly history: SkinHistoryEntry[];
  readonly state: typeof state;
  readonly artworkGraphSnapshot: ArtworkGraph | null;
  readonly artworkGraphSourceKey: string | null;
  readonly artworkGraphLastError: string | null;
  readonly artworkGraphOverlayEnabled: boolean;
  readonly viewMode: SkinViewMode;
  readonly installedSurfaceAngleDiagnosisView: SurfaceAngleDiagnosisView | null;
  readonly meshOptions: ReturnType<typeof ui.getMeshOptions>;
  readonly surfaceAngleThresholdDeg: number;
  readonly surfaceDiagnosis: Extract<SurfaceAngleWorkerMessage, { type: "result" }> | null;
  readonly riskDrivenInternalLatticeOverlayEnabled: boolean;
  readonly acceptedSurfaceSaveBinding: FkeiSurfaceBinding | null;
  readonly activeSurfacePersistentCacheKeys: SurfacePersistentCacheKeys | null;
  readonly automaticOverhangSupportResult: OverhangSupportPolicyResult | null;
  readonly overhangSupportResult: OverhangSupportPolicyResult | null;
  readonly supportPaintSession: typeof supportPaintSession;
  readonly supportPaintMode: SupportPaintMode;
  readonly supportPaintRadiusMm: number;
  readonly supportPaintBackfaces: boolean;
  readonly supportPaintEnabled: boolean;
  readonly phaseADryWebPreview: PhaseADryWebPreviewState | null;
  readonly targetedSupportSource: TargetedSupportSourceState | null;
  readonly internalStructureGraph: InternalStructureGraph | null;
  readonly internalStructureFingerprint: string;
  readonly internalAngleScreeningEnabled: boolean;
  readonly internalAngleScreeningGraph: InternalStructureGraph | null;
  readonly internalAngleScreening: InternalAngleScreeningReport | null;
  readonly riskDrivenInternalLatticeFacts: RiskDrivenInternalLatticeFacts | null;
  readonly restoredRiskDrivenLattice: FkeiRestorePlan["riskDrivenLattice"];
  readonly restoredCanonicalDryWeb: FkeiRestorePlan["canonicalDryWeb"];
  readonly riskDrivenPermanentLatticeOverlayEnabled: boolean;
  readonly supportPaintDraftSavedAt: string | null;
  readonly supportPaintDraftDirty: boolean;
  readonly supportPaintSurfaceCache: SupportPaintSurfaceCacheState | null;
  readonly surfaceAnglePersistentCacheStatus: "idle" | "miss" | "mesh-hit" | "hit" | "migrated" | "ledger-upgrade" | "stored" | "unavailable" | "error";
  readonly stage7CanonicalCandidateAdoption: Stage7CanonicalCandidateAdoptionRecord | null;
  readonly stage7CanonicalCandidateAdoptionUndo: Stage7CanonicalCandidateAdoptionUndo | null;
  readonly stage7RedFaceReinforcementPlan: Stage7RedFaceReinforcementPlanBinding | null;
  readonly stage7RedFaceReinforcementPlanMessage: string | null;
  readonly stage7ProvisionalRecheckResult: Stage7ProvisionalRecheckResult | null;
  readonly stage7ProvisionalRecheckElapsedMs: number | null;
  readonly stage7ProvisionalRecheckTerminal: "missing" | "stale" | "error";
  readonly stage7ProvisionalRecheckMessage: string | null;
  readonly stage7ProvisionalAdoptionGateApproval: Stage7ProvisionalAdoptionGateApproval | null;
};

let restoringFkeiOpenRuntime = false;

function captureFkeiOpenRuntimeSnapshot(): FkeiOpenRuntimeSnapshot {
  return {
    history,
    state,
    artworkGraphSnapshot,
    artworkGraphSourceKey,
    artworkGraphLastError,
    artworkGraphOverlayEnabled,
    viewMode,
    installedSurfaceAngleDiagnosisView,
    meshOptions: ui.getMeshOptions(),
    surfaceAngleThresholdDeg: ui.getSurfaceAngleThreshold(),
    surfaceDiagnosis: surfaceAngleCache,
    riskDrivenInternalLatticeOverlayEnabled,
    acceptedSurfaceSaveBinding,
    activeSurfacePersistentCacheKeys,
    automaticOverhangSupportResult,
    overhangSupportResult,
    supportPaintSession,
    supportPaintMode,
    supportPaintRadiusMm,
    supportPaintBackfaces,
    supportPaintEnabled,
    phaseADryWebPreview,
    targetedSupportSource,
    internalStructureGraph,
    internalStructureFingerprint,
    internalAngleScreeningEnabled,
    internalAngleScreeningGraph,
    internalAngleScreening,
    riskDrivenInternalLatticeFacts,
    restoredRiskDrivenLattice,
    restoredCanonicalDryWeb,
    riskDrivenPermanentLatticeOverlayEnabled,
    supportPaintDraftSavedAt,
    supportPaintDraftDirty,
    supportPaintSurfaceCache,
    surfaceAnglePersistentCacheStatus,
    stage7CanonicalCandidateAdoption,
    stage7CanonicalCandidateAdoptionUndo,
    stage7RedFaceReinforcementPlan,
    stage7RedFaceReinforcementPlanMessage,
    stage7ProvisionalRecheckResult,
    stage7ProvisionalRecheckElapsedMs,
    stage7ProvisionalRecheckTerminal,
    stage7ProvisionalRecheckMessage,
    stage7ProvisionalAdoptionGateApproval,
  };
}

function cancelWorkersForFkeiOpen(): void {
  cancelSkinRebuildLowestExtraction(".fkeiを開くため、工程4を停止しました");
  restoredRiskDrivenLatticeBodyGeneration++;
  restoredRiskDrivenLatticeBodyWorker?.terminate();
  restoredRiskDrivenLatticeBodyWorker = null;
  cancelPartitionBuild();
  cancelNPartitionBuild();
  cancelPreviewMeshBuild(false);
  cancelMeshExport(false);
  cancelOpeningMap(false);
  cancelBambu3mfExport(false);
  invalidateInternalPrintGate(".fkeiを開いたため再判定が必要です");
  invalidateSurfaceAngleDiagnosis(".fkeiを開いています");
  if (activeGaugeWorker) {
    activeGaugeWorker.terminate();
    activeGaugeWorker = null;
    gaugeGeneration++;
  }
}

function replaceRuntimeWithFkeiPlan(plan: FkeiRestorePlan): void {
  applyHistoryEntries([...plan.history], plan.shapeState);
  syncReplayIdCounters(plan.shapeState);
  importedRecipeText = serializeRecipe([...plan.history]);
  importedRecipeFilename = null;
  importedRecipeSha256 = null;

  artworkGraphSnapshot = plan.artworkGraph?.snapshot ?? null;
  artworkGraphSourceKey = plan.artworkGraph?.sourceKey ?? null;
  artworkGraphLastError = null;
  artworkGraphOverlayEnabled = false;

  supportPaintSession = plan.supportPaint
    ? { revision: plan.supportPaint.revision, history: plan.supportPaint.history, activeStroke: null }
    : createSupportPaintSession();
  supportPaintMode = plan.supportPaint?.mode ?? "inside";
  supportPaintRadiusMm = plan.supportPaint?.radiusMm ?? 6;
  supportPaintBackfaces = plan.supportPaint?.paintBackfaces ?? false;
  supportPaintEnabled = Boolean(plan.supportPaint?.enabled && plan.surface);
  supportPaintDraftSavedAt = null;
  supportPaintDraftDirty = false;
  supportPaintSurfaceCache = null;
  resetSupportPaintUndoJournal();

  surfaceAngleCache = plan.surface?.diagnosis ?? null;
  automaticOverhangSupportResult = plan.surface?.automaticSupportResult ?? null;
  overhangSupportResult = plan.surface?.effectiveSupportResult ?? null;
  acceptedSurfaceSaveBinding = plan.surface?.binding ?? null;
  activeSurfacePersistentCacheKeys = plan.surface?.binding.cacheKeys ?? null;
  surfaceAnglePersistentCacheStatus = "idle";
  if (plan.surface) {
    ui.setMeshOptions({
      resolution: plan.surface.binding.resolution,
      targetLongestMm: plan.surface.binding.targetLongestMm,
    });
    ui.setSurfaceAngleThreshold(plan.surface.binding.angleThresholdDeg);
  }

  // No old cache/runtime object can survive. The versioned checkpoint may
  // install only its already validated, detached Stage-4 graph; it does not
  // derive Dry Web, start a Worker, or create a Stage 7/8 result.
  phaseADryWebPreview = null;
  targetedSupportSource = null;
  const hydratedLattice = plan.canonicalDryWeb && plan.riskDrivenLattice
    ? hydrateFkeiRiskDrivenLatticeArtifact(plan.canonicalDryWeb, plan.riskDrivenLattice)
    : null;
  // The canonical runtime remains the reviewed Dry Web 2475/2404. The
  // lattice is a separate saved observation artifact and is augmented only
  // transiently inside the explicit BODY rebuild Worker.
  internalStructureGraph = hydratedLattice?.canonicalGraph ?? null;
  restoredCanonicalDryWeb = plan.canonicalDryWeb;
  restoredRiskDrivenLattice = plan.riskDrivenLattice;
  riskDrivenPermanentLatticeOverlayEnabled = false;
  internalStructureFingerprint = "";
  clearStage7CanonicalCandidateAdoption();
  clearStage7ProvisionalRecheck(".fkei OpenではStage 7を復元しません", "missing");
  stage7RedFaceReinforcementPlan = null;
  stage7RedFaceReinforcementPlanMessage = null;
  stage7CanonicalCandidateAdoptionUndo = null;
  skinRenderer.setInternalStructure(internalStructureGraph);
  skinRenderer.clearRiskDrivenPermanentLatticeOverlay();
  refreshInternalAngleScreening(null);
  syncPhaseASupportPreviewAvailability(null);
}

function restoreFkeiOpenRuntimeSnapshot(snapshot: FkeiOpenRuntimeSnapshot): void {
  history = snapshot.history;
  state = snapshot.state;
  syncReplayIdCounters(state);
  artworkGraphSnapshot = snapshot.artworkGraphSnapshot;
  artworkGraphSourceKey = snapshot.artworkGraphSourceKey;
  artworkGraphLastError = snapshot.artworkGraphLastError;
  artworkGraphOverlayEnabled = snapshot.artworkGraphOverlayEnabled;
  viewMode = snapshot.viewMode;
  installedSurfaceAngleDiagnosisView = snapshot.installedSurfaceAngleDiagnosisView;
  ui.setMeshOptions(snapshot.meshOptions);
  ui.setSurfaceAngleThreshold(snapshot.surfaceAngleThresholdDeg);
  surfaceAngleCache = snapshot.surfaceDiagnosis;
  riskDrivenInternalLatticeOverlayEnabled = snapshot.riskDrivenInternalLatticeOverlayEnabled;
  acceptedSurfaceSaveBinding = snapshot.acceptedSurfaceSaveBinding;
  activeSurfacePersistentCacheKeys = snapshot.activeSurfacePersistentCacheKeys;
  automaticOverhangSupportResult = snapshot.automaticOverhangSupportResult;
  overhangSupportResult = snapshot.overhangSupportResult;
  supportPaintSession = snapshot.supportPaintSession;
  supportPaintMode = snapshot.supportPaintMode;
  supportPaintRadiusMm = snapshot.supportPaintRadiusMm;
  supportPaintBackfaces = snapshot.supportPaintBackfaces;
  supportPaintEnabled = snapshot.supportPaintEnabled;
  phaseADryWebPreview = snapshot.phaseADryWebPreview;
  targetedSupportSource = snapshot.targetedSupportSource;
  internalStructureGraph = snapshot.internalStructureGraph;
  internalStructureFingerprint = snapshot.internalStructureFingerprint;
  internalAngleScreeningEnabled = snapshot.internalAngleScreeningEnabled;
  internalAngleScreeningGraph = snapshot.internalAngleScreeningGraph;
  internalAngleScreening = snapshot.internalAngleScreening;
  riskDrivenInternalLatticeFacts = snapshot.riskDrivenInternalLatticeFacts;
  restoredRiskDrivenLattice = snapshot.restoredRiskDrivenLattice;
  restoredCanonicalDryWeb = snapshot.restoredCanonicalDryWeb;
  riskDrivenPermanentLatticeOverlayEnabled = snapshot.riskDrivenPermanentLatticeOverlayEnabled;
  supportPaintDraftSavedAt = snapshot.supportPaintDraftSavedAt;
  supportPaintDraftDirty = snapshot.supportPaintDraftDirty;
  supportPaintSurfaceCache = snapshot.supportPaintSurfaceCache;
  surfaceAnglePersistentCacheStatus = snapshot.surfaceAnglePersistentCacheStatus;
  stage7CanonicalCandidateAdoption = snapshot.stage7CanonicalCandidateAdoption;
  stage7CanonicalCandidateAdoptionUndo = snapshot.stage7CanonicalCandidateAdoptionUndo;
  stage7RedFaceReinforcementPlan = snapshot.stage7RedFaceReinforcementPlan;
  stage7RedFaceReinforcementPlanMessage = snapshot.stage7RedFaceReinforcementPlanMessage;
  stage7ProvisionalRecheckResult = snapshot.stage7ProvisionalRecheckResult;
  stage7ProvisionalRecheckElapsedMs = snapshot.stage7ProvisionalRecheckElapsedMs;
  stage7ProvisionalRecheckTerminal = snapshot.stage7ProvisionalRecheckTerminal;
  stage7ProvisionalRecheckMessage = snapshot.stage7ProvisionalRecheckMessage;
  stage7ProvisionalAdoptionGateApproval = snapshot.stage7ProvisionalAdoptionGateApproval;
  // Restore renderer-owned graph/overlay resources immediately as well as
  // restoring their variables.  The following redraw may throw; without this
  // explicit repair a failed Open could leave checkpoint geometry paired with
  // the old runtime state until some later render happens.
  skinRenderer.setInternalStructure(snapshot.internalStructureGraph);
  skinRenderer.setInternalAngleScreening(snapshot.internalAngleScreening);
  if (snapshot.restoredRiskDrivenLattice && snapshot.riskDrivenPermanentLatticeOverlayEnabled) {
    skinRenderer.setRiskDrivenPermanentLatticeOverlay(snapshot.restoredRiskDrivenLattice, true);
  } else {
    skinRenderer.clearRiskDrivenPermanentLatticeOverlay();
  }
  restoringFkeiOpenRuntime = true;
}

function redrawFkeiOpenRuntime(): void {
  ui.syncHostParams(state.hostParams);
  ui.syncSkinParams(state.skinParams);
  ui.setMode(state.mode);
  syncUndoHistory();
  if (surfaceAngleCache) {
    skinRenderer.setMeshOverlayBuffers(surfaceAngleCache.basePositions, surfaceAngleCache.baseNormals);
    refreshRiskDrivenInternalLatticePresentation();
    if (!restoringFkeiOpenRuntime) viewMode = "mesh";
    skinRenderer.setViewMode(viewMode);
    ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
    showSurfaceAngleDiagnosisView(restoringFkeiOpenRuntime && installedSurfaceAngleDiagnosisView
      ? installedSurfaceAngleDiagnosisView
      : "before");
    refreshOverhangSupportSiteOverlay();
    ui.setSurfaceAngleDiagnosisRunning(false);
    ui.setSurfaceAngleDiagnosisStatus(
      `.fkeiからSurfaceを復元 · 解像度${surfaceAngleCache.resolution} · 閾値${surfaceAngleCache.metrics.thresholdDeg.toFixed(0)}° · Worker未起動`,
      true,
    );
  } else {
    skinRenderer.setMeshOverlay(null);
    skinRenderer.clearSurfaceAngleOverlay();
    clearRiskDrivenInternalLatticePresentation("missing", "現在のSurface診断がありません。Surface診断完了後に表示できます。");
    skinRenderer.clearOverhangSupportSiteOverlay();
    ui.setSurfaceAngleDiagnosisRunning(false);
    ui.setSurfaceAngleDiagnosisStatus(".fkei Stage 1からShapeだけを復元しました");
  }
  if (supportPaintSession.history.present.strokes.length > 0 || supportPaintSession.revision > 0) {
    refreshSupportPaintUi(`.fkeiからSupport Paint revision ${supportPaintSession.revision}を復元しました`);
  } else {
    refreshSupportPaintUi(".fkeiのSupport Paint事実を復元しました");
  }
  syncArtworkGraphStatus();
  refreshDryWebActions(internalStructureGraph
    ? ".fkei Open完了 · canonical Dry Web / Risk-driven Latticeを復元（BODYは未生成）"
    : ".fkei Open完了 · Dry Webは未生成です");
  if (restoredRiskDrivenLattice && riskDrivenPermanentLatticeOverlayEnabled) {
    skinRenderer.setRiskDrivenPermanentLatticeOverlay(restoredRiskDrivenLattice, true);
  } else {
    skinRenderer.clearRiskDrivenPermanentLatticeOverlay();
  }
  ui.setRiskDrivenPermanentLattice(restoredRiskDrivenLattice
    ? { available: true, enabled: riskDrivenPermanentLatticeOverlayEnabled, status: "saved 56 nodes / 48 edges · 8 spines · 2 shared", onBody: "BODY未生成" }
    : { available: false, enabled: false, status: "restored latticeなし", onBody: "" });
  refreshBottomStatusPane();
  render();
  restoringFkeiOpenRuntime = false;
}

function getSkinRebuildPrintSupportGraph(): InternalStructureGraph | null {
  return isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.project
    ? skinRebuildPipeline.project.printSupport
    : null;
}

function getInternalPrintReachabilityGraph(bodyGraph: InternalStructureGraph | null): InternalStructureGraph | null {
  if (!bodyGraph) return null;
  const printSupport = getSkinRebuildPrintSupportGraph();
  return printSupport?.edges.length ? mergeSkinRebuildGraphsAtSupportContacts(bodyGraph, printSupport) : bodyGraph;
}

function skinRebuildGateSafeMeshOptions(options: MeshUiOptions): MeshUiOptions {
  const project = skinRebuildPipelineIsCurrent() ? skinRebuildPipeline?.project : null;
  if (!isSkinRebuildApp || !project) return options;
  const minimumDiameterMm = Math.min(
    project.settings.strutDiameterMm,
    project.printSupport.edges.length > 0 ? project.settings.supportDiameterMm : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(minimumDiameterMm) || minimumDiameterMm <= 0) return options;
  const requiredResolution = Math.min(256, Math.max(16,
    Math.ceil((A1_MINI_PLA_04_02.minVoxelsAcrossDiameter * options.targetLongestMm / minimumDiameterMm) / 8) * 8,
  ));
  if (options.resolution >= requiredResolution) return options;
  const repaired = { ...options, resolution: requiredResolution };
  ui.setMeshOptions(repaired);
  setSkinRebuildMeshBottomProgress(
    "工程6 自動調整",
    `線径${minimumDiameterMm.toFixed(1)}mmを表現するため最終精度を${options.resolution}→${requiredResolution}へ変更`,
  );
  return repaired;
}

function assertSkinRebuildRecipeMatchesProject(
  recipeState: ReturnType<typeof replay>,
  document: SkinRebuildFkeiDocument,
): void {
  const project = document.project;
  if (recipeState.host.length !== project.base.host.length || recipeState.patches.length !== project.patterns.length) {
    throw new Error("shapeRecipeとSKIN REBUILD形状の要素数が一致しません");
  }
  const close = (left: number, right: number) => Math.abs(left - right) <= 1e-9;
  for (const saved of project.base.host) {
    const restored = recipeState.host.find((ball) => ball.id === saved.id);
    if (!restored || !close(restored.x, saved.x) || !close(restored.y, saved.y)
      || !close(restored.z, saved.z) || !close(restored.r, saved.r)) {
      throw new Error(`shapeRecipeのBase Shape #${saved.id}が保存証拠と一致しません`);
    }
  }
  if (!close(recipeState.hostParams.k, project.base.hostK)) throw new Error("shapeRecipeのBase Shape kが一致しません");
  for (const saved of project.patterns) {
    const restored = recipeState.patches.find((patch) => patch.id === saved.id);
    if (!restored || restored.shape !== saved.shape
      || (restored.motifPlacement ?? "surface") !== (saved.motifPlacement ?? "surface")
      || restored.points.length !== saved.points.length) {
      throw new Error(`shapeRecipeのSurface Pattern #${saved.id}が保存証拠と一致しません`);
    }
    for (let index = 0; index < saved.points.length; index++) {
      const left = restored.points[index];
      const right = saved.points[index];
      if (!close(left.x, right.x) || !close(left.y, right.y) || !close(left.z, right.z)
        || !close(left.r, right.r) || left.role !== right.role) {
        throw new Error(`shapeRecipeのSurface Pattern #${saved.id} point ${index}が一致しません`);
      }
    }
  }
}

function fallbackHistoryForSkinRebuildProject(document: SkinRebuildFkeiDocument): SkinHistoryEntry[] {
  const project = document.project;
  const timestamp = Date.now();
  return [
    {
      t: timestamp,
      op: "loadHostFromS1Recipe",
      args: {
        balls: project.base.host.map((ball) => ({ ...ball })),
        params: { ...DEFAULT_SKIN_HOST_PARAMS, count: project.base.host.length, k: project.base.hostK },
        source: "SKIN REBUILD .fkei",
      },
    },
    { t: timestamp + 1, op: "setSkinParam", args: { key: "thickness", value: project.settings.surfaceThickness } },
    { t: timestamp + 2, op: "setSkinParam", args: { key: "roundK", value: project.settings.roundK } },
    { t: timestamp + 3, op: "setSkinParam", args: { key: "internalStructure", value: "targetedGrid" } },
    {
      t: timestamp + 4,
      op: "packPatches",
      args: {
        patches: project.patterns.map((patch) => ({
          ...patch,
          points: patch.points.map((point) => ({ ...point })),
        })),
        identity: "replace",
      },
    },
  ];
}

function restoreSkinRebuildFkei(document: SkinRebuildFkeiDocument): void {
  const project = projectFromSkinRebuildFkei(document);
  const prepared = document.shapeRecipe
    ? prepareRecipeText(document.shapeRecipe)
    : (() => {
      const entries = fallbackHistoryForSkinRebuildProject(document);
      return { entries, state: replay(entries) };
    })();
  assertSkinRebuildRecipeMatchesProject(prepared.state, document);

  const previousRuntime = captureFkeiOpenRuntimeSnapshot();
  const previousPipeline = skinRebuildPipeline;
  cancelWorkersForFkeiOpen();
  try {
    applyHistoryEntries(prepared.entries, prepared.state);
    importedRecipeText = serializeRecipe(prepared.entries);
    importedRecipeFilename = null;
    importedRecipeSha256 = null;
    skinRebuildPipeline = {
      shapeFingerprint: fkeiShapeFingerprint(state),
      settings: { ...project.settings },
      base: { ...project.base, host: project.base.host.map((ball) => ({ ...ball })) },
      patternSides: project.patternSides.map((side) => ({
        ...side,
        surfacePosition: { ...side.surfacePosition },
        outwardNormal: { ...side.outwardNormal },
        insidePosition: { ...side.insidePosition },
        outsidePosition: { ...side.outsidePosition },
      })),
      dryWeb: project.dryWeb,
      lowestPoints: project.lowestPoints,
      // Face-region buffers are runtime diagnostics. Stage 4 recreates them
      // from the restored final mesh and the current angle threshold.
      overhang: null,
      project,
    };
    internalStructureGraph = project.finalGraph;
    internalStructureFingerprint = "";
    stage6BodyMeshCache = null;
    skinRenderer.setInternalStructure(project.finalGraph);
    skinRenderer.setPrintSupport(project.printSupport);
    setSkinRebuildReinforcementPreview(null, []);
    skinRenderer.setSkinRebuildOverhangOverlay(null);
    skinRebuildSelectedTargetPatchId = null;
    skinRebuildSelectedOverhangRegionIds.clear();
    skinRebuildReinforcedOverhangRegionIds.clear();
    invalidateSkinRebuildFinalStages(".fkeiを開いたため、工程6〜8を再実行してください");
    refreshInternalAngleScreening(project.finalGraph);
    invalidateInternalPrintGate("SKIN REBUILD .fkeiを開いたため、最終判定を再実行してください");
    setInternalObservationMode("ghostSkin");
    refreshSkinRebuildLowestPointMarkers(project);
    if (skinRebuildThresholdInput) skinRebuildThresholdInput.value = String(project.settings.overhangThresholdDeg);
    if (skinRebuildDiameterInput) skinRebuildDiameterInput.value = String(project.settings.strutDiameterMm);
    if (skinRebuildSupportDiameterInput) skinRebuildSupportDiameterInput.value = String(project.settings.supportDiameterMm);
    refreshSkinRebuildLatticeEdgeEditor();
    refreshSkinRebuildSelectedTarget();
    refreshSkinRebuildSelectedRegion();
    if (skinRebuildInsideStatus) {
      skinRebuildInsideStatus.textContent = `復元済み · inside ${project.audit.classifiedInsideCount}/${project.audit.realizedPatternCount}`;
      skinRebuildInsideStatus.dataset.ok = "true";
    }
    if (skinRebuildLowestStatus) {
      const totalRed = project.lowestPoints.filter((point) => point.needsSupport).length;
      skinRebuildLowestStatus.textContent = `復元済み · Pattern最下端 ${project.audit.lowestPointCount}点 / 旧支持候補 ${totalRed}点 / 蜘蛛支持 ${project.audit.overhangTargetCount}点 · 赤い面領域は工程4で再検出`;
      skinRebuildLowestStatus.dataset.ok = "true";
    }
    if (skinRebuildLatticeStatus) {
      const unsupportedIds = skinRebuildUnsupportedSpiderTargetIds(project);
      skinRebuildLatticeStatus.textContent = `復元済み · 支持 ${project.audit.supportedTargetCount}/${project.audit.overhangTargetCount} · 未支持 ${project.audit.unsupportedTargetCount}${unsupportedIds.length > 0 ? `（Pattern #${unsupportedIds.join(", #")}）` : ""} · 最大線分角 ${project.audit.maximumLatticeAngleDeg.toFixed(1)}°`;
      skinRebuildLatticeStatus.dataset.ok = String(project.audit.unsupportedTargetCount === 0);
    }
    if (skinRebuildPrintSupportStatus) {
      skinRebuildPrintSupportStatus.textContent = project.printSupport.edges.length > 0
        ? `復元済み · 橙の別Graph ${project.settings.supportDiameterMm.toFixed(1)} mm × ${project.printSupport.edges.length}本 · 再生成は工程6→7→8`
        : "復元済み · 印刷サポート0本 · 工程6→7→8で生成できます";
      delete skinRebuildPrintSupportStatus.dataset.ok;
    }
    if (skinRebuildSaveStatus) {
      skinRebuildSaveStatus.textContent = project.audit.unsupportedTargetCount === 0
        ? "復元済み · 完成.fkeiを再保存できます"
        : `復元済み · 未支持${project.audit.unsupportedTargetCount}点を保持して再保存できます`;
      skinRebuildSaveStatus.dataset.ok = "true";
    }
    if (skinRebuildLowestButton) skinRebuildLowestButton.disabled = false;
    if (skinRebuildLatticeButton) skinRebuildLatticeButton.disabled = false;
    if (skinRebuildBulkSupportButton) skinRebuildBulkSupportButton.disabled = false;
    if (skinRebuildCompleteSupportButton) {
      skinRebuildCompleteSupportButton.disabled = project.audit.unsupportedTargetCount === 0;
    }
    if (skinRebuildConnectAllButton) skinRebuildConnectAllButton.disabled = false;
    if (skinRebuildSaveButton) skinRebuildSaveButton.disabled = false;
    refreshSkinRebuildFinalStageButtons();
    refreshSkinRebuildStage8ExportButton();
    ui.setInternalStructureStatus(
      `SKIN REBUILD復元 · node ${project.finalGraph.nodes.length} / edge ${project.finalGraph.edges.length}`,
      project.audit.unsupportedTargetCount === 0,
    );
    resetSkinRebuildWorkflowHistory();
    if (project.audit.unsupportedTargetCount > 0) focusSkinRebuildUnsupportedTarget();
    render();
  } catch (error) {
    skinRebuildPipeline = previousPipeline;
    restoreFkeiOpenRuntimeSnapshot(previousRuntime);
    redrawFkeiOpenRuntime();
    throw error;
  }
}

async function openFkeiProject(file: File): Promise<void> {
  const attempt = activeFkeiOpenAttempt;
  let lastCompletedStage: FkeiOpenStage = "file-selected";
  projectOpenButton.disabled = true;
  try {
    reportFkeiOpenStage(attempt, "file-read-started", { name: file.name, size: file.size, type: file.type });
    const text = await file.text();
    lastCompletedStage = "file-read-complete";
    reportFkeiOpenStage(attempt, lastCompletedStage, { name: file.name, size: file.size, textLength: text.length });

    let schema: unknown;
    try {
      schema = (JSON.parse(text) as { schema?: unknown } | null)?.schema;
    } catch {
      schema = undefined;
    }
    if (isSkinRebuildApp && schema === SKIN_REBUILD_FKEI_SCHEMA) {
      const document = parseSkinRebuildFkei(text);
      lastCompletedStage = "document-parsed";
      reportFkeiOpenStage(attempt, lastCompletedStage, {
        schema,
        patternCount: document.project.patterns.length,
        overhangTargetCount: document.project.audit.overhangTargetCount,
      });
      restoreSkinRebuildFkei(document);
      lastCompletedStage = "runtime-applied";
      reportFkeiOpenStage(attempt, lastCompletedStage);
      lastCompletedStage = "ui-synchronized";
      reportFkeiOpenStage(
        attempt,
        lastCompletedStage,
        { fileName: file.name, schema },
        `.fkei Open完了 · SKIN REBUILD工程3〜6を復元 · ${file.name}`,
      );
      return;
    }

    const document: FkeiDocument = parseFkeiDocument(text);
    lastCompletedStage = "document-parsed";
    reportFkeiOpenStage(attempt, lastCompletedStage, {
      completedStage: document.completedStage,
      historyCount: document.shape.entries.length,
    });

    const plan = createFkeiRestorePlan(document);
    lastCompletedStage = "restore-plan-created";
    reportFkeiOpenStage(attempt, lastCompletedStage, {
      completedStage: plan.completedStage,
      historyCount: plan.history.length,
      hostCount: plan.shapeState.host.length,
      patchCount: plan.shapeState.patches.length,
      patchSetRevision: plan.bindings.patchSetRevision,
      paintRevision: plan.bindings.paintRevision,
      supportPaintMode: plan.supportPaint?.mode ?? null,
      artworkGraphNodeCount: plan.artworkGraph?.snapshot.surfaceDraft.nodes.length ?? null,
      insideTargetCount: plan.surface?.effectiveSupportResult.counts.inside ?? null,
      surface: plan.surface ? {
        resolution: plan.surface.binding.resolution,
        targetLongestMm: plan.surface.binding.targetLongestMm,
        angleThresholdDeg: plan.surface.binding.angleThresholdDeg,
      } : null,
    });
    lastCompletedStage = "restore-plan-validated";
    reportFkeiOpenStage(attempt, lastCompletedStage);

    applyFkeiRestorePlanAtomically(plan, {
      capture: captureFkeiOpenRuntimeSnapshot,
      cancelWorkers: cancelWorkersForFkeiOpen,
      replace: replaceRuntimeWithFkeiPlan,
      restore: restoreFkeiOpenRuntimeSnapshot,
      redraw: redrawFkeiOpenRuntime,
    });
    lastCompletedStage = "runtime-applied";
    reportFkeiOpenStage(attempt, lastCompletedStage);
    lastCompletedStage = "ui-synchronized";
    reportFkeiOpenStage(
      attempt,
      lastCompletedStage,
      { completedStage: plan.completedStage, fileName: file.name },
      `.fkei Open完了 · Stage ${plan.completedStage} · ${plan.canonicalDryWeb ? "canonical Dry Web / Risk-driven Lattice復元・BODY未生成" : "Dry Web未生成"} · ${file.name}`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SKIN .fkei Open] failed after ${lastCompletedStage}: ${errorMessage}`, { attempt, error });
    reportFkeiOpenStage(
      attempt,
      "failed",
      { lastCompletedStage, errorName: error instanceof Error ? error.name : typeof error },
      `.fkeiを開けませんでした: ${errorMessage}`,
    );
  } finally {
    projectOpenInput.value = "";
    projectOpenButton.disabled = false;
  }
}

projectOpenInput.onchange = () => {
  const file = projectOpenInput.files?.[0];
  if (!file) {
    console.info("[SKIN .fkei Open stage] " + JSON.stringify({
      attempt: activeFkeiOpenAttempt,
      stage: "file-selected",
      file: null,
    }));
    projectMeta.textContent = ".fkei Openをキャンセルしました";
    return;
  }
  reportFkeiOpenStage(activeFkeiOpenAttempt, "file-selected", {
    name: file.name,
    size: file.size,
    type: file.type,
  });
  void openFkeiProject(file);
};

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

function internalPrintGateIsRequiredForCurrentOutput(): boolean {
  if (isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.project) {
    return skinRebuildPipeline.project.finalGraph.edges.length > 0;
  }
  return state.skinParams.internalStructure !== "none";
}

function invalidateInternalPrintGate(message = "未判定 · Internal付き3Dデータは書き出せません"): void {
  clearInternalPrintGateStatusTimer();
  internalPrintGateGeneration++;
  internalPrintGateHeavyComputation?.finish();
  internalPrintGateHeavyComputation = null;
  activeInternalPrintGateWorker?.terminate();
  activeInternalPrintGateWorker = null;
  pendingInternalPrintGateFingerprint = "";
  pendingMeshExportAfterGate = null;
  internalPrintGateCache = null;
  ui.setMeshExportRunning(false);
  ui.setInternalPrintGateRunning(false);
  ui.setInternalPrintGateReport(null);
  const required = internalPrintGateIsRequiredForCurrentOutput();
  ui.setInternalPrintGateExportAllowed(
    !required,
    required,
  );
  ui.setInternalPrintGateStatus(
    required ? message : "Internalなし · このゲートは対象外です",
    required ? false : undefined,
  );
}

function cancelInternalPrintGate(): void {
  if (!activeInternalPrintGateWorker && !internalPrintGateHeavyComputation) return;
  invalidateInternalPrintGate("内部構造判定をキャンセルしました");
}

function failPendingMeshExportAfterGate(message: string): void {
  if (!pendingMeshExportAfterGate) return;
  pendingMeshExportAfterGate = null;
  ui.setMeshExportRunning(false);
  ui.setMeshStatus(`書き出し停止: ${message}`, false);
  if (skinRebuildStage8ExportStatus) {
    skinRebuildStage8ExportStatus.textContent = `書き出し停止: ${message}`;
    skinRebuildStage8ExportStatus.dataset.ok = "false";
  }
  refreshSkinRebuildStage8ExportButton();
  setSkinRebuildMeshBottomProgress("工程6 停止", "ラティス込みmeshを書き出せませんでした", message);
}

function startInternalPrintGate(options: MeshUiOptions): void {
  options = skinRebuildGateSafeMeshOptions(options);
  const graph = getInternalStructureGraph();
  const reachabilityGraph = getInternalPrintReachabilityGraph(graph);
  const required = internalPrintGateIsRequiredForCurrentOutput();
  const rebuildBlockReason = skinRebuildPipelineOutputBlockReason();
  if (rebuildBlockReason) {
    ui.setInternalPrintGateReport(null);
    ui.setInternalPrintGateExportAllowed(false, true);
    ui.setInternalPrintGateStatus(`NG · ${rebuildBlockReason}`, false);
    return;
  }
  const readinessBlockReason = internalStructureOutputBlockReason(state.skinParams.internalStructure, graph);
  if (!required || readinessBlockReason || !graph || graph.edges.length === 0) {
    ui.setInternalPrintGateReport(null);
    ui.setInternalPrintGateExportAllowed(!required, required);
    ui.setInternalPrintGateStatus(
      !required
        ? "Internalなし · このゲートは対象外です"
        : `NG · ${readinessBlockReason ?? "Internal Structureが未生成または空です"}`,
      required ? false : undefined,
    );
    return;
  }
  activeInternalPrintGateWorker?.terminate();
  internalPrintGateHeavyComputation?.finish();
  internalPrintGateHeavyComputation = null;
  const generation = ++internalPrintGateGeneration;
  const requestId = ++internalPrintGateRequestId;
  const fingerprint = internalPrintGateFingerprint(options, reachabilityGraph ?? graph);
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
  const bodyFingerprint = internalPrintGateFingerprint(options, graph);
  const reusableStage6Body = stage6BodyMeshCache?.fingerprint === bodyFingerprint
    ? stage6BodyMeshCache.positions.slice()
    : undefined;
  const reusablePreview = reusableStage6Body ?? (
    previewMeshCache?.fingerprint === bodyFingerprint && previewMeshCache.resolution === Math.max(16, Math.round(options.resolution))
      ? previewMeshCache.positions.slice()
      : undefined
  );
  pendingInternalPrintGateFingerprint = fingerprint;
  internalPrintGateCache = null;
  ui.setInternalPrintGateExportAllowed(false, true);
  ui.setInternalPrintGateReport(null);
  ui.setInternalPrintGateRunning(true);
  const gateStarted = performance.now();
  const workerCount = chooseSkinRebuildLowestWorkerCount(navigator.hardwareConcurrency);
  const gateStage = reusablePreview
    ? reusableStage6Body
      ? "工程6で検査済みの最終meshを再利用して判定中"
      : "表示済みの最終meshを再利用して判定中"
    : `最終meshを${workerCount}コアで並列生成して判定中`;
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
  let lastGateProgress = 0;
  let lastGateDetail = gateStage;
  heavy.updateActual(`${lastGateDetail} · 0.0秒`, lastGateProgress);
  clearInternalPrintGateStatusTimer();
  internalPrintGateStatusTimer = window.setInterval(() => {
    const elapsed = ((performance.now() - gateStarted) / 1000).toFixed(1);
    heavy.updateActual(`${lastGateDetail} · ${elapsed}秒`, lastGateProgress);
    ui.setInternalPrintGateStatus(`${lastGateDetail} · ${elapsed}秒 · 画面は操作できます`);
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
    printSupportGraph: getSkinRebuildPrintSupportGraph(),
    roundK: state.skinParams.roundK,
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    mode: state.mode,
    resolution: Math.max(16, Math.round(options.resolution)),
    targetLongestMm: options.targetLongestMm,
    workerCount,
    prebuiltPositions: reusablePreview,
    skinRebuildRepair: isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.project !== null,
    buildPlateZSource: isSkinRebuildApp && skinRebuildPipelineIsCurrent() && skinRebuildPipeline?.project
      ? Math.min(...skinRebuildPipeline.project.lowestPoints.map((point) => point.position.z))
      : undefined,
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
    if (message.type === "progress") {
      lastGateProgress = stage6MeshProgressPercent(message.phase, message.completedSlices, message.totalSlices);
      lastGateDetail = message.detail;
      const elapsed = (message.elapsedMs / 1000).toFixed(1);
      heavy.updateActual(`${message.detail} · ${elapsed}秒`, lastGateProgress);
      ui.setInternalPrintGateStatus(`${message.detail} · ${Math.round(lastGateProgress)}% · ${elapsed}秒 · 画面は操作できます`);
      setSkinRebuildMeshBottomProgress(
        "工程6 Internal判定",
        `${Math.round(lastGateProgress)}% · ${workerCount}コア · ${message.detail} · ${elapsed}秒`,
      );
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
      failPendingMeshExportAfterGate(`内部構造の自動判定に失敗しました: ${message.message}`);
      return;
    }
    heavy.updateActual("Internal判定完了", 100);
    heavy.finish();
    if (internalPrintGateHeavyComputation?.id === heavy.id) internalPrintGateHeavyComputation = null;
    const currentGraph = getInternalPrintReachabilityGraph(getInternalStructureGraph());
    if (!currentGraph || internalPrintGateFingerprint(options, currentGraph) !== fingerprint) {
      pendingInternalPrintGateFingerprint = "";
      ui.setInternalPrintGateStatus("形が変わったため、古い判定結果を破棄しました", false);
      failPendingMeshExportAfterGate("自動判定中に形が変わりました");
      return;
    }
    internalPrintGateCache = {
      fingerprint,
      report: message.report,
      stl: message.stl,
      summary: message.summary,
      scaleMmPerUnit: message.scaleMmPerUnit,
      plateShiftSourceZ: message.plateShiftSourceZ,
    };
    pendingInternalPrintGateFingerprint = "";
    ui.setInternalPrintGateReport(message.report);
    ui.setInternalPrintGateExportAllowed(message.report.ok, true);
    ui.setInternalPrintGateStatus(
      message.report.ok
        ? `内部構造：OK${message.repairedSavedTriangleHoleCount > 0 ? ` · 微小三角穴 ${message.repairedSavedTriangleHoleCount}面を自動修復済み` : ""} · 通常の3D書き出しを許可 · ${(message.elapsedMs / 1000).toFixed(1)}秒`
        : `内部構造：NG · ${message.report.reasons.length}項目を直してください · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
      message.report.ok,
    );
    const pendingExport = pendingMeshExportAfterGate;
    if (pendingExport?.fingerprint === fingerprint) {
      pendingMeshExportAfterGate = null;
      ui.setMeshExportRunning(false);
      if (message.report.ok) {
        setSkinRebuildMeshBottomProgress(
          "工程6 自動判定完了",
          `水密 · 1部品${message.repairedSavedTriangleHoleCount > 0 ? ` · 微小三角穴 ${message.repairedSavedTriangleHoleCount}面を自動修復` : ""} · 判定済みSTLを再利用して保存準備 · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
        );
        window.setTimeout(() => exportMesh(pendingExport.options, pendingExport.formats), 0);
      } else {
        const stopReason = message.report.reasons[0] ?? `内部構造がNGです（${message.report.reasons.length}項目）`;
        ui.setMeshStatus(`書き出し停止: ${stopReason}`, false);
        if (skinRebuildStage8ExportStatus) {
          skinRebuildStage8ExportStatus.textContent = `書き出し停止: ${stopReason}`;
          skinRebuildStage8ExportStatus.dataset.ok = "false";
        }
        refreshSkinRebuildStage8ExportButton();
        setSkinRebuildMeshBottomProgress(
          "工程6 停止",
          `内部構造NG · ${message.report.reasons.length}項目`,
          stopReason,
        );
      }
    }
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
    failPendingMeshExportAfterGate(`内部構造判定Workerに失敗しました: ${event.message}`);
  };
  if (request.prebuiltPositions) worker.postMessage(request, [request.prebuiltPositions.buffer]);
  else worker.postMessage(request);
}

function inspectMesh(options: MeshUiOptions): void {
  options = skinRebuildGateSafeMeshOptions(options);
  cancelMeshExport(false);
  const workflowBefore = isSkinRebuildApp ? captureSkinRebuildWorkflowSnapshot() : null;
  const rebuildProjectAtStart = isSkinRebuildApp && skinRebuildPipelineIsCurrent()
    ? skinRebuildPipeline?.project ?? null
    : null;
  const internalGraph = getInternalStructureGraph();
  const reachabilityGraph = getInternalPrintReachabilityGraph(internalGraph);
  const readinessBlockReason = internalStructureOutputBlockReason(state.skinParams.internalStructure, internalGraph);
  if (readinessBlockReason) {
    ui.setMeshStatus(`検査停止: ${readinessBlockReason}`, false);
    return;
  }
  const bodyFingerprint = internalGraph?.edges.length ? internalPrintGateFingerprint(options, internalGraph) : "";
  if (internalGraph?.edges.length) {
    const fingerprint = internalPrintGateFingerprint(options, reachabilityGraph ?? internalGraph);
    if (internalPrintGateCache?.fingerprint === fingerprint) {
      const ok = internalPrintGateCache.report.ok;
      if (bodyFingerprint && stage6BodyMeshCache?.fingerprint === bodyFingerprint) {
        showSkinRebuildStage6ArtworkMesh(stage6BodyMeshCache.positions, stage6BodyMeshCache.normals);
      } else if (bodyFingerprint
        && previewMeshCache?.fingerprint === bodyFingerprint
        && previewMeshCache.resolution === Math.max(16, Math.round(options.resolution))) {
        showSkinRebuildStage6ArtworkMesh(previewMeshCache.positions, previewMeshCache.normals);
      }
      ui.setMeshStatus(`${internalPrintGateCache.summary} / 内部判定済みmeshを再利用`, ok);
      setSkinRebuildMeshBottomProgress(
        "工程6 検査完了",
        `判定済みmesh再利用 · 水密${internalPrintGateCache.report.watertight ? "OK" : "NG"} · 部品数${internalPrintGateCache.report.meshComponents} · 0.0秒`,
        ok ? undefined : internalPrintGateCache.report.reasons[0],
      );
      if (ok && rebuildProjectAtStart && skinRebuildPipeline?.project === rebuildProjectAtStart) {
        markSkinRebuildArtworkFinalized(rebuildProjectAtStart, "工程6 mesh確定済み（判定cache再利用）");
        if (workflowBefore) commitSkinRebuildWorkflowHistory("工程6 作品mesh確定", workflowBefore);
      }
      return;
    }
  }
  if (bodyFingerprint && stage6BodyMeshCache?.fingerprint === bodyFingerprint) {
    showSkinRebuildStage6ArtworkMesh(stage6BodyMeshCache.positions, stage6BodyMeshCache.normals);
    ui.setMeshStatus(`${stage6BodyMeshCache.summary} / 工程6検査済みmeshを再利用`, stage6BodyMeshCache.watertightOk);
    setSkinRebuildMeshBottomProgress(
      "工程6 検査完了",
      `検査済みBODY再利用 · ${stage6BodyMeshCache.summary} · 0.0秒`,
      stage6BodyMeshCache.watertightOk ? undefined : "水密検査NG",
    );
    if (stage6BodyMeshCache.watertightOk
      && rebuildProjectAtStart
      && skinRebuildPipeline?.project === rebuildProjectAtStart) {
      markSkinRebuildArtworkFinalized(rebuildProjectAtStart, "工程6 mesh確定済み（検査cache再利用）");
      if (workflowBefore) commitSkinRebuildWorkflowHistory("工程6 作品mesh確定", workflowBefore);
    }
    return;
  }
  const reusablePreview = bodyFingerprint && previewMeshCache?.fingerprint === bodyFingerprint &&
    previewMeshCache.resolution === Math.max(16, Math.round(options.resolution))
    ? previewMeshCache.positions.slice()
    : undefined;
  const requestId = ++meshExportRequestId;
  const generation = meshExportGeneration;
  const workerCount = chooseSkinRebuildLowestWorkerCount(navigator.hardwareConcurrency);
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
    workerCount,
    baseName: makeSkinExportBaseName(state.mode, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance),
    prebuiltPositions: reusablePreview,
  };
  const worker = new Worker(new URL("./meshExport.worker.ts", import.meta.url), { type: "module" });
  activeMeshExportWorker = worker;
  const started = performance.now();
  ui.setMeshExportRunning(true);
  const inspectionStartDetail = reusablePreview
    ? `表示済みmesh ${Math.floor(reusablePreview.length / 9).toLocaleString()}面を再利用`
    : `SDFを${workerCount}コアで並列sampling`;
  ui.setMeshStatus(`${inspectionStartDetail} · 0.0秒 · 画面は操作できます`);
  setSkinRebuildMeshBottomProgress("工程6 mesh検査", `${workerCount}コア · 開始 · 0.0秒`);
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (activeMeshExportWorker !== worker || meshExportHeavyComputation?.id !== heavy.id) return;
    cancelMeshExport(true);
  };
  heavy = beginHeavyComputation(`工程6 mesh検査 · ${workerCount}コア`, cancel);
  meshExportHeavyComputation = heavy;
  let lastInspectionProgress = 0;
  let lastInspectionDetail = inspectionStartDetail;
  heavy.updateActual(`${lastInspectionDetail} · 0.0秒`, lastInspectionProgress);
  meshExportStatusTimer = window.setInterval(() => {
    if (activeMeshExportWorker === worker) {
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);
      heavy.updateActual(`${lastInspectionDetail} · ${elapsed}秒`, lastInspectionProgress);
      ui.setMeshStatus(`${lastInspectionDetail} · ${elapsed}秒 · 画面は操作できます`);
      setSkinRebuildMeshBottomProgress("工程6 mesh検査", `${Math.round(lastInspectionProgress)}% · ${workerCount}コア · ${lastInspectionDetail} · ${elapsed}秒`);
    }
  }, 500);
  worker.onmessage = (event: MessageEvent<MeshExportWorkerMessage>) => {
    const message = event.data;
    if (activeMeshExportWorker !== worker || message.requestId !== requestId || message.generation !== meshExportGeneration) return;
    if (message.type === "progress") {
      lastInspectionProgress = stage6MeshProgressPercent(message.phase, message.completedSlices, message.totalSlices);
      lastInspectionDetail = message.detail;
      const elapsed = (message.elapsedMs / 1000).toFixed(1);
      heavy.updateActual(`${message.detail} · ${elapsed}秒`, lastInspectionProgress);
      ui.setMeshStatus(`${message.detail} · ${Math.round(lastInspectionProgress)}% · ${elapsed}秒 · 画面は操作できます`);
      setSkinRebuildMeshBottomProgress("工程6 mesh検査", `${Math.round(lastInspectionProgress)}% · ${workerCount}コア · ${message.detail} · ${elapsed}秒`);
      return;
    }
    heavy.updateActual("mesh検査完了", 100);
    clearMeshExportWorker();
    if (message.type === "error") {
      ui.setMeshStatus("検査失敗: " + message.message, false);
      setSkinRebuildMeshBottomProgress("工程6 検査失敗", `${(message.elapsedMs / 1000).toFixed(1)}秒`, message.message);
      return;
    }
    if (bodyFingerprint
      && message.positions?.length
      && message.normals?.length === message.positions.length) {
      stage6BodyMeshCache = {
        fingerprint: bodyFingerprint,
        positions: message.positions,
        normals: message.normals,
        summary: message.summary,
        watertightOk: message.watertightOk,
      };
      showSkinRebuildStage6ArtworkMesh(message.positions, message.normals);
    }
    const rebuildMeshSummary = rebuildProjectAtStart
      ? ` / 工程5A＋5Bの恒久Graph ${rebuildProjectAtStart.finalGraph.edges.length}辺を作品meshへ統合・表示`
      : "";
    ui.setMeshStatus(
      message.summary + rebuildMeshSummary + " / 並列検査 " + (message.elapsedMs / 1000).toFixed(1) + "秒",
      message.watertightOk,
    );
    setSkinRebuildMeshBottomProgress(
      "工程6 検査完了",
      `${workerCount}コア · ${message.summary}${rebuildProjectAtStart ? ` · 5B補強込み${rebuildProjectAtStart.finalGraph.edges.length}辺をmesh表示` : ""} · ${(message.elapsedMs / 1000).toFixed(1)}秒`,
      message.watertightOk ? undefined : "水密検査NG",
    );
    if (message.watertightOk
      && rebuildProjectAtStart
      && skinRebuildPipelineIsCurrent()
      && skinRebuildPipeline?.project === rebuildProjectAtStart) {
      markSkinRebuildArtworkFinalized(rebuildProjectAtStart, "工程6 mesh確定済み");
      if (workflowBefore) commitSkinRebuildWorkflowHistory("工程6 作品mesh確定", workflowBefore);
    }
  };
  worker.onerror = (event) => {
    if (activeMeshExportWorker !== worker) return;
    clearMeshExportWorker();
    ui.setMeshStatus("検査Workerに失敗しました: " + event.message, false);
    setSkinRebuildMeshBottomProgress("工程6 検査失敗", "Worker error", event.message);
  };
  if (request.prebuiltPositions) worker.postMessage(request, [request.prebuiltPositions.buffer]);
  else worker.postMessage(request);
}

let pendingMeshExport: {
  requestId: number;
  generation: number;
  baseName: string;
  recipe: string;
  formats: SkinRebuildExportFormatSelection;
} | null = null;

function clearMeshExportWorker(): void {
  if (activeMeshExportWorker) {
    activeMeshExportWorker.terminate();
    activeMeshExportWorker = null;
  }
  if (meshExportStatusTimer !== null) {
    window.clearInterval(meshExportStatusTimer);
    meshExportStatusTimer = null;
  }
  meshExportHeavyComputation?.finish();
  meshExportHeavyComputation = null;
  ui.setMeshExportRunning(false);
}

function cancelMeshExport(notify = false): void {
  const wasRunning = activeMeshExportWorker !== null || pendingMeshExportAfterGate !== null;
  if (pendingMeshExportAfterGate) {
    pendingMeshExportAfterGate = null;
    cancelInternalPrintGate();
  }
  clearMeshExportWorker();
  pendingMeshExport = null;
  if (notify && wasRunning) {
    ui.setMeshStatus("書き出しをキャンセルしました。形状は変更していません");
    setSkinRebuildMeshBottomProgress("工程6 中断", "書き出しをキャンセルしました");
  }
  refreshSkinRebuildStage8ExportButton();
}

function exportMesh(
  options: MeshUiOptions,
  formats: SkinRebuildExportFormatSelection = DEFAULT_SKIN_REBUILD_EXPORT_FORMATS,
): void {
  options = skinRebuildGateSafeMeshOptions(options);
  cancelMeshExport(false);
  const internalGraph = getInternalStructureGraph();
  const printSupportGraph = getSkinRebuildPrintSupportGraph();
  const reachabilityGraph = getInternalPrintReachabilityGraph(internalGraph);
  const rebuildBlockReason = skinRebuildPipelineOutputBlockReason();
  if (rebuildBlockReason) {
    if ((skinRebuildPipeline?.project?.audit.unsupportedTargetCount ?? 0) > 0) {
      const patchId = focusSkinRebuildUnsupportedTarget();
      if (patchId !== null) {
        if (skinRebuildStage8ExportStatus) {
          skinRebuildStage8ExportStatus.textContent = `書き出し停止 · Pattern #${patchId}を大きい黄色＋白枠で強調しました`;
          skinRebuildStage8ExportStatus.dataset.ok = "false";
        }
      }
    }
    ui.setMeshStatus(`書き出し停止: ${rebuildBlockReason}`, false);
    return;
  }
  const readinessBlockReason = internalStructureOutputBlockReason(state.skinParams.internalStructure, internalGraph);
  if (readinessBlockReason) {
    ui.setMeshStatus(`書き出し停止: ${readinessBlockReason}`, false);
    return;
  }
  if (internalGraph?.edges.length) {
    const fingerprint = internalPrintGateFingerprint(options, reachabilityGraph ?? internalGraph);
    if (!internalPrintGateCache || internalPrintGateCache.fingerprint !== fingerprint) {
      pendingMeshExportAfterGate = {
        options: { ...options },
        fingerprint,
        formats: { ...formats },
      };
      ui.setMeshExportRunning(true);
      refreshSkinRebuildStage8ExportButton();
      ui.setMeshStatus("ラティス込みmeshを自動判定中… 合格後、同じSTLをそのまま保存します");
      setSkinRebuildMeshBottomProgress(
        "工程6 自動判定",
        `ラティス${internalGraph.edges.length}辺込み · 最終meshを並列生成中`,
      );
      startInternalPrintGate(options);
      return;
    }
    if (!internalPrintGateCache.report.ok) {
      ui.setMeshStatus(`書き出し停止: ${internalPrintGateCache.report.reasons[0] ?? `内部構造がNGです（${internalPrintGateCache.report.reasons.length}項目）`}`, false);
      return;
    }
  }
  const requestId = ++meshExportRequestId;
  const generation = meshExportGeneration;
  const baseName = makeSkinExportBaseName(state.mode, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance);
  const recipe = serializeRecipe(history);
  const workerCount = chooseSkinRebuildLowestWorkerCount(navigator.hardwareConcurrency);
  const reusableGate = internalGraph?.edges.length && internalPrintGateCache?.report.ok
    ? internalPrintGateCache
    : null;
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
    workerCount,
    baseName,
    cachedStl: reusableGate?.stl.slice(0),
    cachedSummary: reusableGate?.summary,
    cachedScaleMmPerUnit: reusableGate?.scaleMmPerUnit,
    cachedPlateShiftSourceZ: reusableGate?.plateShiftSourceZ,
    printSupportGraph,
  };
  pendingMeshExport = { requestId, generation, baseName, recipe, formats: { ...formats } };
  const worker = new Worker(new URL("./meshExport.worker.ts", import.meta.url), { type: "module" });
  activeMeshExportWorker = worker;
  refreshSkinRebuildStage8ExportButton();
  const started = performance.now();
  ui.setMeshExportRunning(true);
  const exportStartDetail = reusableGate
    ? "判定済みSTLを再利用し、OBJとrecipeを作成中"
    : `最終meshを${workerCount}コアで作成中`;
  ui.setMeshStatus(`${exportStartDetail}… 画面はそのまま操作できます`);
  setSkinRebuildMeshBottomProgress("工程6 ラティス込み書き出し", `${exportStartDetail} · 0.0秒`);
  let heavy: HeavyComputationHandle;
  const cancel = (): void => {
    if (activeMeshExportWorker !== worker || meshExportHeavyComputation?.id !== heavy.id) return;
    cancelMeshExport(true);
  };
  heavy = beginHeavyComputation(
    reusableGate ? "工程6 保存準備 · 判定済みmesh再利用" : `工程6 mesh書き出し · ${workerCount}コア`,
    cancel,
  );
  meshExportHeavyComputation = heavy;
  let lastExportProgress = reusableGate ? 90 : 0;
  let lastExportDetail = exportStartDetail;
  heavy.updateActual(`${lastExportDetail} · 0.0秒`, lastExportProgress);
  meshExportStatusTimer = window.setInterval(() => {
    if (activeMeshExportWorker !== worker) return;
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    heavy.updateActual(`${lastExportDetail} · ${elapsed}秒`, lastExportProgress);
    ui.setMeshStatus(`${lastExportDetail} · ${elapsed}秒（画面は操作できます）`);
    setSkinRebuildMeshBottomProgress("工程6 ラティス込み書き出し", `${Math.round(lastExportProgress)}% · ${lastExportDetail} · ${elapsed}秒`);
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
      lastExportProgress = stage6MeshProgressPercent(message.phase, message.completedSlices, message.totalSlices);
      lastExportDetail = message.detail;
      const elapsed = (message.elapsedMs / 1000).toFixed(1);
      heavy.updateActual(`${message.detail} · ${elapsed}秒`, lastExportProgress);
      ui.setMeshStatus(`別処理で3Dデータを作成中 · ${message.detail} · ${Math.round(lastExportProgress)}% · ${elapsed}秒（画面は操作できます）`);
      setSkinRebuildMeshBottomProgress("工程6 ラティス込み書き出し", `${Math.round(lastExportProgress)}% · ${workerCount}コア · ${message.detail} · ${elapsed}秒`);
      return;
    }
    heavy.updateActual("保存ファイルを準備中", 100);
    clearMeshExportWorker();
    pendingMeshExport = null;
    if (message.type === "error") {
      ui.setMeshStatus(`書き出し失敗: ${message.message}`, false);
      if (skinRebuildStage8ExportStatus) {
        skinRebuildStage8ExportStatus.textContent = `書き出し失敗: ${message.message}`;
        skinRebuildStage8ExportStatus.dataset.ok = "false";
      }
      refreshSkinRebuildStage8ExportButton();
      setSkinRebuildMeshBottomProgress("工程6 書き出し失敗", `${(message.elapsedMs / 1000).toFixed(1)}秒`, message.message);
      return;
    }
    downloadSkinMeshArtifacts(
      message.stl,
      message.obj,
      pending.recipe,
      pending.baseName,
      message.supportStl && message.supportObj
        ? { stl: message.supportStl, obj: message.supportObj }
        : undefined,
      { stl: pending.formats.stl, obj: pending.formats.obj, recipe: pending.formats.recipe },
    );
    const cacheLabel = message.cacheHit ? " · 判定済みmesh再利用" : ` · ${workerCount}コア`;
    const savedSummary = `${message.summary}${message.supportSummary ? ` / ${message.supportSummary}` : ""}`;
    const directFormats = [pending.formats.stl ? "STL" : "", pending.formats.obj ? "OBJ" : "", pending.formats.recipe ? "recipe" : ""]
      .filter(Boolean);
    const directSummary = directFormats.length > 0 ? `${directFormats.join("・")}保存済み` : "個別ファイルなし";
    if (isSkinRebuildApp && pending.formats.threeMf) {
      ui.setMeshStatus(`${savedSummary} / ${directSummary} / 分離3MFを梱包中…${cacheLabel}`, message.watertightOk);
      if (skinRebuildStage8ExportStatus) skinRebuildStage8ExportStatus.textContent = `${directSummary} · 3MFを梱包中…`;
      setSkinRebuildMeshBottomProgress("工程6 分離3MF", "作品＋印刷サポートを別パーツのまま梱包中");
      const bodyPositions = parseBinaryStlPositions(message.stl);
      const supportPositions = message.supportStl ? parseBinaryStlPositions(message.supportStl) : null;
      void buildBambu3mf([
        { name: "SKIN_REBUILD_ARTWORK", role: "body", positions: bodyPositions },
        ...(supportPositions && supportPositions.length > 0
          ? [{ name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support" as const, positions: supportPositions }]
          : []),
      ], {
        title: pending.baseName,
        generatorVersion: manifest.version,
        supportType: "normal(manual)",
        mergePrintableSupportIntoBody: false,
      }).then((result) => {
        downloadBlob(new Blob([result.archive], { type: "model/3mf" }), `${pending.baseName}.3mf`);
        const partSummary = supportPositions?.length
          ? `作品＋印刷サポートを共通Z座標の別パーツで保存 · Plate 0 · support ${result.stats.scaffoldFaces.toLocaleString()} faces`
          : "作品を1パーツで保存 · 印刷サポート0";
        ui.setMeshStatus(`${savedSummary} / 3MF保存完了 · ${partSummary} / ${(message.elapsedMs / 1000).toFixed(1)}秒${cacheLabel}`, message.watertightOk);
        if (skinRebuildStage8ExportStatus) {
          skinRebuildStage8ExportStatus.textContent = `保存完了 · 3MF${directFormats.length > 0 ? ` + ${directFormats.join(" + ")}` : ""} · ${partSummary}`;
          skinRebuildStage8ExportStatus.dataset.ok = String(message.watertightOk);
        }
        refreshSkinRebuildStage8ExportButton();
        setSkinRebuildMeshBottomProgress(
          "工程6 保存完了",
          `${partSummary} · BODY ${result.stats.bodyFaces.toLocaleString()} faces · ${(message.elapsedMs / 1000).toFixed(1)}秒${cacheLabel}`,
          message.watertightOk ? undefined : "水密検査NG",
        );
      }).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        ui.setMeshStatus(`${savedSummary} / ${directSummary} / 3MF梱包失敗: ${detail}`, false);
        if (skinRebuildStage8ExportStatus) {
          skinRebuildStage8ExportStatus.textContent = `3MF梱包失敗: ${detail}${directFormats.length > 0 ? ` · ${directSummary}` : ""}`;
          skinRebuildStage8ExportStatus.dataset.ok = "false";
        }
        refreshSkinRebuildStage8ExportButton();
        setSkinRebuildMeshBottomProgress("工程6 3MF失敗", directSummary, detail);
      });
    } else {
      const selectedSummary = directFormats.join("・") || "選択ファイルなし";
      ui.setMeshStatus(`${savedSummary} / ${selectedSummary}保存完了 ${(message.elapsedMs / 1000).toFixed(1)}秒${cacheLabel}`, message.watertightOk);
      if (skinRebuildStage8ExportStatus) {
        skinRebuildStage8ExportStatus.textContent = `保存完了 · ${selectedSummary}`;
        skinRebuildStage8ExportStatus.dataset.ok = String(message.watertightOk);
      }
      refreshSkinRebuildStage8ExportButton();
      setSkinRebuildMeshBottomProgress(
        "工程6 保存完了",
        `${selectedSummary} · ${savedSummary} · ${(message.elapsedMs / 1000).toFixed(1)}秒${cacheLabel}`,
        message.watertightOk ? undefined : "水密検査NG",
      );
    }
  };
  worker.onerror = (event) => {
    if (activeMeshExportWorker !== worker) return;
    clearMeshExportWorker();
    pendingMeshExport = null;
    ui.setMeshStatus(`書き出し失敗: ${event.message}`, false);
    if (skinRebuildStage8ExportStatus) {
      skinRebuildStage8ExportStatus.textContent = `書き出し失敗: ${event.message}`;
      skinRebuildStage8ExportStatus.dataset.ok = "false";
    }
    refreshSkinRebuildStage8ExportButton();
    setSkinRebuildMeshBottomProgress("工程6 書き出し失敗", "Worker error", event.message);
  };
  if (request.cachedStl) worker.postMessage(request, [request.cachedStl]);
  else worker.postMessage(request);
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
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  releaseDryWebSupportSeparationPresentationForCompetingView();
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
    releaseDryWebSupportSeparationPresentationForCompetingView();
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
  clearStage7CanonicalCandidateAdoption();
  if (stage7ProvisionalRecheckIsActive() || stage7ProvisionalRecheckResult) {
    clearStage7ProvisionalRecheck(`仮Graph exact比較を停止しました: ${message}`, "stale");
  }
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  dryWebAuthorIntegrationPresentation = false;
  const hadDiagnosis = activeSurfaceAngleWorker !== null || activeSurfaceSupportClassificationWorker !== null || surfaceAngleCache !== null;
  surfaceHeavyComputation?.finish();
  surfaceHeavyComputation = null;
  surfaceAngleGeneration++;
  if (activeSurfaceAngleWorker) {
    activeSurfaceAngleWorker.onmessage = null;
    activeSurfaceAngleWorker.onerror = null;
    activeSurfaceAngleWorker.terminate();
    activeSurfaceAngleWorker = null;
  }
  if (activeSurfaceSupportClassificationWorker) {
    activeSurfaceSupportClassificationWorker.onmessage = null;
    activeSurfaceSupportClassificationWorker.onerror = null;
    activeSurfaceSupportClassificationWorker.terminate();
    activeSurfaceSupportClassificationWorker = null;
  }
  activeSurfacePersistentCacheKeys = null;
  activeSurfaceCacheMissReport = null;
  activeLegacySurfaceCacheKey = null;
  acceptedSurfaceSaveBinding = null;
  invalidateSupportPaintEditingResources();
  surfaceAngleCache = null;
  clearRiskDrivenInternalLatticePresentation(
    hadDiagnosis ? "stale" : "missing",
    hadDiagnosis
      ? `${message} · Risk Cluster / Support Candidateも古くなりました`
      : "現在のSurface診断がありません。Surface診断完了後に表示できます。",
  );
  automaticOverhangSupportResult = null;
  overhangSupportResult = null;
  supportPaintEnabled = false;
  ui.setShapeUndoLocked(false);
  viewport.classList.remove("support-paint-active");
  skinRenderer.setOrbitEnabled(true);
  setSelectedOverhangSupportSite(null);
  refreshSupportPaintUi("支持点の診断後に使えます");
  skinRenderer.clearSurfaceAngleOverlay();
  installedSurfaceAngleDiagnosisView = null;
  skinRenderer.clearOverhangSupportSiteOverlay();
  terminateDryWebPreviewWorker(true);
  skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
  phaseASupportPreviewRequested = false;
  phaseARefreshButton.disabled = true;
  phaseASupportStatus.textContent = "工程7でInternal Structureを生成・確認した後に使います";
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
  const dryWebPreviewWasCurrent = dryWebPreviewIsCurrent();
  if (!dryWebPreviewWasCurrent) refreshPaintedDryWebTargets();
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
  const separationBlockReason = dryWebSupportSeparationOutputBlockReason(
    state.skinParams.internalStructure,
    dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null,
  );
  if (separationBlockReason) {
    ui.setBambu3mfExportStatus(`3MF停止: ${separationBlockReason}`, false);
    return;
  }
  const internalGraph = getInternalStructureGraph();
  const readinessBlockReason = internalStructureOutputBlockReason(state.skinParams.internalStructure, internalGraph);
  if (readinessBlockReason) {
    ui.setBambu3mfExportStatus(`3MF停止: ${readinessBlockReason}`, false);
    return;
  }
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
  const diagnosedPositionsMm = diagnosedPositionsForPolicy(assignments);
  const legacyDangerousPositions = new Float32Array(diagnosedPositionsMm.map((value) => value / scaleMmPerUnit));
  const outputSelection = buildBambu3mfOutputSelection({
    internalStructure: state.skinParams.internalStructure,
    legacyDangerousPositions,
    separation: dryWebSupportSeparation,
    separationIsCurrent: dryWebSupportSeparationIsCurrent(),
    sourceFaceCount: diagnosedPositionsMm.length / 9,
    generation: surfaceAngleGeneration,
    originalEntries: assignments.entries,
    originalClassificationCounts: assignments.counts,
    originalSupportRayFacts: assignments.rayFacts,
    originalSupportPaintFacts: assignments.paintFacts,
    explicitTargetCount: printPlan.explicitScaffoldTargets.length,
  });
  if (!outputSelection.ok) {
    ui.setBambu3mfExportStatus(`3MF停止: ${outputSelection.reason}`, false);
    return;
  }
  const dangerousPositions = outputSelection.dangerousPositions;
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
    supportSelection: outputSelection.evidence,
    supportSelectionIdentity: outputSelection.evidence.selectionIdentity,
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
    ...(bodyStl ? { bodyStl } : {}),
    ...(bodyPositions ? { bodyPositions } : {}),
    finalSurfacePositions,
    dangerousPositions,
    supportSelection: outputSelection.evidence,
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

function showSurfaceAngleDiagnosisView(
  nextView: SurfaceAngleDiagnosisView,
  restoreStage7Diagnosis = false,
): void {
  const result = surfaceAngleCache;
  if (!result) return;
  const hasInternal = result.internalEdgeCount > 0;
  if (nextView === "after" && !hasInternal) return;
  if (state.skinParams.internalStructure === "targetedGrid"
    && dryWebAuthorIntegrationPresentation
    && !restoreStage7Diagnosis) {
    // Stage 4 is an artwork-integration checkpoint, not a removable-support
    // or red-face presentation. Keep the selected before/after label honest,
    // but do not re-install either overlay after the author checkpoint hides
    // them.
    hideRemovableSupportOverlayForDryWeb();
    skinRenderer.clearSurfaceAngleOverlay();
    installedSurfaceAngleDiagnosisView = null;
    ui.setSurfaceAngleDiagnosisView(nextView, true, hasInternal);
    ui.setMeshPreviewStatus("Dry Web統合表示 · Surface angle / outside / scaffold表示は非表示（未計算 / gray）");
    render();
    return;
  }
  if (nextView === "before") {
    skinRenderer.setSurfaceAngleOverlay(result.beforeDangerPositions, new Float32Array(0), false);
  } else {
    skinRenderer.setSurfaceAngleOverlay(result.afterDangerPositions, result.mitigatedPositions, true);
  }
  installedSurfaceAngleDiagnosisView = nextView;
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
  diagnosisView: SurfaceAngleDiagnosisView = "before",
  preserveViewState?: DryWebGraphViewViewportState,
  acceptedBinding?: FkeiSurfaceBinding | null,
): void {
  heavy.updateActual("Surface診断完了", 100);
  heavy.finish();
  if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
  persistFinishedSurfaceAngleDiagnosis(message);
  surfaceAngleCache = message;
  // Retain the exact request inputs accepted for this diagnosis, including
  // the cache-unavailable (null cacheKeys) case. The caller supplies the
  // run-captured binding; completion must never re-read current UI settings
  // and accidentally stamp new values onto an old result.
  if (acceptedBinding !== undefined) acceptedSurfaceSaveBinding = acceptedBinding;
  skinRenderer.setMeshOverlayBuffers(message.basePositions, message.baseNormals);
  refreshRiskDrivenInternalLatticePresentation();
  const completedViewState = preserveViewState
    ? preserveDryWebGraphViewForCompletion(preserveViewState)
    : null;
  if (completedViewState) {
    if (completedViewState.internalObservationMode !== internalObservationMode) {
      setInternalObservationMode(completedViewState.internalObservationMode);
    }
    if (completedViewState.viewMode !== viewMode) setViewMode(completedViewState.viewMode);
  } else {
    viewMode = "mesh";
    skinRenderer.setViewMode(viewMode);
    ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
  }
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
  if (state.skinParams.internalStructure === "targetedGrid") {
    hideRemovableSupportOverlayForDryWeb();
  } else {
    refreshOverhangSupportSiteOverlay();
  }
  setSelectedOverhangSupportSite(null);
  refreshSupportPaintUi("自動分類を下書きとしてSupport Paintを使えます");
  showSurfaceAngleDiagnosisView(diagnosisView);
  applyLocalReviewCamera(message.basePositions);
  ui.setSurfaceAngleDiagnosisView(diagnosisView, true, hasInternal);
  refreshPrintProfileSummary();
  refreshMotifLowestPointMarkers();
  phaseASupportPreviewRequested = false;
  skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
  phaseASupportStatus.textContent = "Surface診断完了 · 次は工程6のPaint表示と工程7のInternal Structureを確認します";
  phaseASupportStatus.dataset.stale = "true";
  clearDryWebPreviewStartTimer();
  refreshDryWebActions(
    state.skinParams.internalStructure === "targetedGrid"
      ? "Surface診断が完了しました。自動inside ledgerを確認し、必要ならPaint後にDry Webを生成してください"
      : undefined,
  );
  refreshSurfaceStartupStatus("ready");
}

function recheckTargetedGridFromExactMesh(
  base: Extract<SurfaceAngleWorkerMessage, { type: "result" }>,
  graph: InternalStructureGraph,
  heavy: HeavyComputationHandle,
  expectedCanonicalCandidate: Stage7CanonicalCandidateAdoptionRecord | null = null,
): void {
  const generation = surfaceAngleGeneration;
  const expectedPreview = phaseADryWebPreview;
  const expectedArtworkGraphSnapshot = artworkGraphSnapshot;
  const expectedArtworkGraphSourceKey = artworkGraphSourceKey;
  const expectedTargetedSupportSource = targetedSupportSource;
  const expectedPaintRevision = supportPaintSession.revision;
  // Exact recheck must keep the Surface binding accepted by the diagnosis it
  // started from. In particular, do not replace its targetLongest/cache
  // identity with values read from the UI when this worker completes.
  const exactRecheckAcceptedSurfaceBinding = acceptedSurfaceSaveBinding;
  const expectedSurfaceFingerprint = currentTargetSurfaceFingerprint();
  const expectedResolution = base.resolution;
  const expectedMode = state.mode;
  const expectedThresholdDeg = base.metrics.thresholdDeg;
  const expectedRequiredContacts = state.skinParams.dryWebRequiredContacts;
  const expectedSupportSettingsKey = JSON.stringify(phaseASupportSettings);
  const exactRecheckViewState = preserveDryWebGraphViewForCompletion({ viewMode, internalObservationMode });
  ui.setSurfaceAngleDiagnosisRunning(true);
  ui.setSurfaceAngleDiagnosisStatus("Dry Web付加後Surfaceを再診断中 · 接触索引を準備しています…");
  const reinforced = reinforceQuadConnectionsForMesh(state.patches, state.skinParams.quadMeshJoinWidth);
  const bounds = computeSkinSamplingBounds(state.host, state.hostParams.k, state.skinParams.thickness, reinforced.patches);
  const meshStep = bounds.longest > 0 ? bounds.longest / base.resolution : 1 / base.resolution;
  const worker = createSurfaceWorkerOnCacheMiss(null, () => {
    surfaceWorkerLaunchCount++;
    automaticFaceDiagnosisWorkerLaunchCount++;
    return new Worker(new URL("./surfaceAngle.worker.ts", import.meta.url), { type: "module" });
  })!;
  const exactRecheckGeneration = ++dryWebExactRecheckGeneration;
  activeDryWebExactRecheckWorker = worker;
  activeSurfaceAngleWorker = worker;
  const savedMotifLowestPoints = Array.isArray(base.motifLowestPoints)
    ? base.motifLowestPoints.map((marker) => {
      const clone = { ...marker, position: { ...marker.position } };
      if (marker.normal !== undefined) clone.normal = { ...marker.normal };
      return clone;
    })
    : undefined;
  const reusesMotifLowestPoints = savedMotifLowestPoints !== undefined;
  // These ranges are phase allocations for a readable monotonic 0–100 shelf,
  // not a claim that a phase's wall time is proportional to its weight.  The
  // numerator/denominator shown below is the phase's actual completed work.
  const phaseRanges: Record<string, [number, number]> = reusesMotifLowestPoints
    ? {
      "reachability-index": [0, 18],
      "dangerous-face-contact": [18, 68],
      "motif-reachability": [68, 99],
      complete: [100, 100],
    }
    : {
      "reachability-index": [0, 15],
      "dangerous-face-contact": [15, 58],
      "motif-attribution": [58, 79],
      "motif-reachability": [79, 99],
      complete: [100, 100],
  };
  let currentPhase: string | null = null;
  let phaseStartedElapsedMs = 0;
  heavy.updateActual("接触索引を準備しています…", 0);
  const failCurrentExactRecheck = (status: string): void => {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    if (activeDryWebExactRecheckWorker === worker) activeDryWebExactRecheckWorker = null;
    if (activeSurfaceAngleWorker === worker) activeSurfaceAngleWorker = null;
    dryWebExactRecheckGeneration++;
    ui.setSurfaceAngleDiagnosisRunning(false);
    failClosedDryWebExactRecheck(status);
    heavy.finish();
    if (dryWebPreviewHeavyComputation?.id === heavy.id) dryWebPreviewHeavyComputation = null;
    if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
    ui.setSurfaceAngleDiagnosisStatus(status, false);
    refreshDryWebActions("Dry Web付加後Surface再診断を破棄しました");
  };
  const request: SurfaceAngleDiagnosisRequest = {
    type: "recheck", generation,
    basePositions: base.basePositions.slice(), baseNormals: base.baseNormals.slice(), baseFaceCount: base.baseFaceCount,
    resolution: base.resolution, internalGraph: graph, thresholdDeg: base.metrics.thresholdDeg, meshStep,
    mode: state.mode,
    patches: state.patches.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })),
    roundK: state.skinParams.roundK, previousElapsedMs: base.elapsedMs,
    ...(savedMotifLowestPoints !== undefined ? { motifLowestPoints: savedMotifLowestPoints } : {}),
  };
  worker.onmessage = (event: MessageEvent<SurfaceAngleWorkerMessage>) => {
    const message = event.data;
    const workerGate = decideStage7CanonicalCandidateExactRecheck({
      workerIdentityCurrent: worker === activeDryWebExactRecheckWorker
        && worker === activeSurfaceAngleWorker,
      runGenerationCurrent: exactRecheckGeneration === dryWebExactRecheckGeneration,
      messageGenerationCurrent: message.generation === generation
        && generation === surfaceAngleGeneration,
      candidateBindingCurrent: true,
      graphBindingCurrent: true,
      stage3BoundaryCurrent: true,
      settingsCurrent: true,
    });
    if (workerGate === "ignore-stale-worker") {
      worker.terminate();
      return;
    }
    if (workerGate === "fail-closed") {
      failCurrentExactRecheck("Dry Web付加後Surface再診断のWorker generationがcurrent runと一致しないため、候補と診断を破棄しました");
      return;
    }
    if (message.type === "progress") {
      const stageLabels: Record<string, [string, string]> = {
        "reachability-index": ["接触索引", "edge"],
        "dangerous-face-contact": ["危険面接触", "面"],
        "motif-attribution": ["最下点帰属（legacy全走査）", "頂点"],
        "motif-reachability": [reusesMotifLowestPoints ? "最下点再利用/到達確認" : "最下点到達確認", "patch"],
        complete: ["完了", ""],
      };
      const stage = message.stage ? stageLabels[message.stage] : undefined;
      const completed = message.completed ?? message.completedSlices;
      const total = message.total ?? message.totalSlices;
      const phase = message.stage ?? "worker";
      if (phase !== currentPhase) {
        currentPhase = phase;
        phaseStartedElapsedMs = message.elapsedMs;
      }
      const fraction = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
      const phaseElapsedMs = Math.max(0, message.elapsedMs - phaseStartedElapsedMs);
      const [phaseStart, phaseEnd] = phaseRanges[phase] ?? [0, 0];
      const progress = phase === "complete"
        ? 100
        : phaseStart + (phaseEnd - phaseStart) * fraction;
      const detail = stage
        ? `${stage[0]}${stage[1] ? ` ${completed.toLocaleString()}/${total.toLocaleString()} ${stage[1]}` : ""} · 工程内進捗${(fraction * 100).toFixed(0)}% · 工程内経過 ${(phaseElapsedMs / 1000).toFixed(1)}秒 · 合計 ${(message.elapsedMs / 1000).toFixed(1)}秒`
        : `Dry Web付加後Surface再診断Worker · ${completed}/${total} slice · ${message.faceCount.toLocaleString()}面 · 工程内経過 ${(phaseElapsedMs / 1000).toFixed(1)}秒 · 合計 ${(message.elapsedMs / 1000).toFixed(1)}秒`;
      heavy.updateActual(detail, progress);
      ui.setSurfaceAngleDiagnosisStatus(detail + " · 画面は操作できます");
      phaseASupportStatus.textContent = detail;
      phaseASupportStatus.dataset.stale = "true";
      delete phaseASupportStatus.dataset.ok;
      refreshDryWebActions(detail);
      return;
    }
    const candidateBindingCurrent = expectedCanonicalCandidate === null
      ? stage7CanonicalCandidateAdoption === null
      : stage7CanonicalCandidateAdoption === expectedCanonicalCandidate
        && expectedCanonicalCandidate.graph === graph
        && expectedCanonicalCandidate.surfaceAngleCache === base
        && expectedCanonicalCandidate.artworkGraphSnapshot === expectedArtworkGraphSnapshot
        && expectedCanonicalCandidate.artworkGraphSourceKey === expectedArtworkGraphSourceKey
        && expectedCanonicalCandidate.targetedSupportSource === expectedTargetedSupportSource
        && expectedCanonicalCandidate.paintRevision === expectedPaintRevision
        && expectedCanonicalCandidate.surfaceFingerprint === expectedSurfaceFingerprint
        && expectedCanonicalCandidate.resolution === expectedResolution
        && expectedCanonicalCandidate.mode === expectedMode
        && expectedCanonicalCandidate.supportSettingsKey === expectedSupportSettingsKey;
    const graphBindingCurrent = phaseADryWebPreview === expectedPreview
      && phaseADryWebPreview?.graph === graph
      && internalStructureGraph === graph
      && !dryWebPreviewPending
      && surfaceAngleCache === base
      && phaseADryWebPreview.surfaceFingerprint === expectedSurfaceFingerprint
      && phaseADryWebPreview.resolution === expectedResolution
      && phaseADryWebPreview.paintRevision === expectedPaintRevision
      && phaseADryWebPreview.artworkGraphSnapshot === expectedArtworkGraphSnapshot
      && phaseADryWebPreview.artworkGraphSourceKey === expectedArtworkGraphSourceKey;
    const stage3BoundaryCurrent = currentDryWebArtworkGraphBoundary().status === "current"
      && artworkGraphSnapshot === expectedArtworkGraphSnapshot
      && artworkGraphSourceKey === expectedArtworkGraphSourceKey;
    const settingsCurrent = state.skinParams.internalStructure === "targetedGrid"
      && state.mode === expectedMode
      && JSON.stringify(phaseASupportSettings) === expectedSupportSettingsKey
      && currentTargetSurfaceFingerprint() === expectedSurfaceFingerprint
      && supportPaintSession.revision === expectedPaintRevision
      && Math.max(16, Math.round(ui.getMeshOptions().resolution)) === expectedResolution
      && ui.getSurfaceAngleThreshold() === expectedThresholdDeg
      && state.skinParams.dryWebRequiredContacts === expectedRequiredContacts;
    const resultDecision = decideStage7CanonicalCandidateExactRecheck({
      workerIdentityCurrent: true,
      runGenerationCurrent: true,
      messageGenerationCurrent: true,
      candidateBindingCurrent,
      graphBindingCurrent,
      stage3BoundaryCurrent,
      settingsCurrent,
    });
    if (resultDecision !== "commit") {
      failCurrentExactRecheck("Dry Web付加後Surface再診断の開始時candidate・Graph・Stage 3/4境界が変わったため、exact結果を採用せず破棄しました");
      return;
    }
    worker.terminate();
    activeDryWebExactRecheckWorker = null;
    dryWebExactRecheckGeneration++;
    activeSurfaceAngleWorker = null;
    ui.setSurfaceAngleDiagnosisRunning(false);
    if (message.type === "error") {
      const status = `Dry Webの付加後診断に失敗しました: ${message.message}`;
      failClosedDryWebExactRecheck(status);
      ui.setSurfaceAngleDiagnosisStatus(status, false);
      heavy.finish();
      if (dryWebPreviewHeavyComputation?.id === heavy.id) dryWebPreviewHeavyComputation = null;
      if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
      refreshDryWebActions("Dry Webの付加後Surface再診断に失敗しました");
      return;
    }
    if (dryWebPreviewHeavyComputation?.id === heavy.id) dryWebPreviewHeavyComputation = null;
    // The exact recheck result is the first completed Dry Web presentation.
    // Keep the measured post-attachment diagnosis without adopting a
    // diagnosis-specific viewport mode.
    finishSurfaceAngleDiagnosis(
      message,
      heavy,
      "after",
      exactRecheckViewState,
      exactRecheckAcceptedSurfaceBinding,
    );
    adoptDryWebSupportSeparation(message);
    if (expectedCanonicalCandidate
      && stage7CanonicalCandidateAdoption?.graph === expectedCanonicalCandidate.graph
      && phaseADryWebPreview?.graph === expectedCanonicalCandidate.graph) {
      stage7CanonicalCandidateAdoption = {
        ...expectedCanonicalCandidate,
        surfaceAngleCache: message,
        exactValidated: true,
      };
      stage7CanonicalCandidateAdoptionUndo = null;
    }
    refreshDryWebActions("Dry Webの付加後Surface再診断が完了しました");
  };
  worker.onerror = (event) => {
    const workerGate = decideStage7CanonicalCandidateExactRecheck({
      workerIdentityCurrent: worker === activeDryWebExactRecheckWorker
        && worker === activeSurfaceAngleWorker,
      runGenerationCurrent: exactRecheckGeneration === dryWebExactRecheckGeneration,
      messageGenerationCurrent: generation === surfaceAngleGeneration,
      candidateBindingCurrent: true,
      graphBindingCurrent: true,
      stage3BoundaryCurrent: true,
      settingsCurrent: true,
    });
    if (workerGate === "ignore-stale-worker") {
      worker.terminate();
      return;
    }
    if (workerGate === "fail-closed") {
      failCurrentExactRecheck("Dry Web付加後Surface再診断のWorker generationがcurrent runと一致しないため、候補と診断を破棄しました");
      return;
    }
    activeDryWebExactRecheckWorker = null;
    dryWebExactRecheckGeneration++;
    activeSurfaceAngleWorker = null;
    worker.terminate();
    ui.setSurfaceAngleDiagnosisRunning(false);
    const status = `Dry Webの付加後診断Workerに失敗しました: ${event.message}`;
    failClosedDryWebExactRecheck(status);
    heavy.finish();
    if (dryWebPreviewHeavyComputation?.id === heavy.id) dryWebPreviewHeavyComputation = null;
    if (surfaceHeavyComputation?.id === heavy.id) surfaceHeavyComputation = null;
    ui.setSurfaceAngleDiagnosisStatus(status, false);
    refreshDryWebActions("Dry Webの付加後Surface再診断に失敗しました");
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
  if (stage7ProvisionalRecheckIsActive()) {
    ui.setSurfaceAngleDiagnosisStatus("仮Graph exact比較を実行中のため、canonical Surface診断は開始しません", false);
    refreshDryWebSupportSeparationUi();
    return;
  }
  if (state.host.length === 0) {
    ui.setSurfaceAngleDiagnosisStatus("まずベース形状を作ってください", false);
    return;
  }
  releaseDryWebInsideTargetOverlayForCompetingView();
  releaseDryWebInsufficientEdgeOverlayForCompetingView();
  releaseDryWebSupportSeparationPresentationForCompetingView();
  dryWebAuthorIntegrationPresentation = false;
  // A fresh Surface diagnosis changes the graph's source context. Do not let
  // a prior Dry Web graph's contact facts survive while this run is pending.
  terminateDryWebPreviewWorker(true);
  if (activeSurfaceAngleWorker) activeSurfaceAngleWorker.terminate();
  activeSurfaceAngleWorker = null;
  if (activeSurfaceSupportClassificationWorker) activeSurfaceSupportClassificationWorker.terminate();
  activeSurfaceSupportClassificationWorker = null;
  cancelPreviewMeshBuild();
  clearOpeningMapDisplay();
  phaseASupportPreviewRequested = false;
  phaseARefreshButton.disabled = true;
  skinRenderer.setPhaseASupportPreview(null, [], 1, 0);
  phaseASupportStatus.textContent = "Surface診断中 · 印刷用サポートpreviewは生成しません";
  delete phaseASupportStatus.dataset.ok;
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
  acceptedSurfaceSaveBinding = null;
  surfaceAnglePersistentCacheStatus = "idle";
  surfaceWorkerLaunchCount = 0;
  invalidateSupportPaintEditingResources();
  surfaceAngleCache = null;
  clearRiskDrivenInternalLatticePresentation(
    "running",
    "Surface診断を実行中です。完了までRisk Clusterの件数とoverlayを隠します。",
  );
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
  installedSurfaceAngleDiagnosisView = null;
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
  // Capture the accepted diagnosis inputs at request creation. Cache keys are
  // attached only when this run's existing lookup has settled; unavailable
  // cache remains null. Do not reconstruct the binding from UI state at finish.
  const surfaceRunBinding = {
    surfaceFingerprint: currentTargetSurfaceFingerprint(),
    resolution,
    targetLongestMm: options.targetLongestMm,
    angleThresholdDeg: thresholdDeg,
  };
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
        "自動支持点分類Worker · 分類を準備中…",
        SURFACE_PROGRESS_CLASSIFICATION,
      );
      refreshSurfaceStartupStatus("classification Worker");
      worker.onmessage = (event: MessageEvent<SurfaceSupportClassificationMessage>) => {
        const classified = event.data;
        if (!isCurrentWorkerRun(worker, activeSurfaceSupportClassificationWorker, null, undefined, generation, surfaceAngleGeneration, classified.generation)) {
          worker.terminate();
          return;
        }
        if (classified.type === "progress") {
          const fraction = classified.totalFaceCount > 0
            ? Math.max(0, Math.min(1, classified.classifiedFaceCount / classified.totalFaceCount))
            : 0;
          const overallProgress = SURFACE_PROGRESS_CLASSIFICATION + fraction * 19;
          const detail = `自動支持点分類Worker · ${classified.classifiedFaceCount}/${classified.totalFaceCount}面 · Worker ${classified.workerCount} · ${(classified.elapsedMs / 1000).toFixed(1)}秒`;
          heavy.updateActual(detail, overallProgress);
          ui.setSurfaceAngleDiagnosisStatus(detail + " · 画面は操作できます");
          refreshSurfaceStartupStatus("classification Worker");
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
        workerCount: deriveSurfaceSupportClassificationWorkerCount(navigator.hardwareConcurrency),
      };
      worker.postMessage(classifyRequest, [
        message.basePositions.buffer, message.baseNormals.buffer, message.beforeDangerPositions.buffer,
        message.afterDangerPositions.buffer, message.mitigatedPositions.buffer,
      ]);
      return;
    }

    const restoreStarted = performance.now();
    try {
      validateOverhangAssignmentLedger(cachedAutomaticResult);
      automaticOverhangSupportResult = cachedAutomaticResult;
      overhangSupportResult = cachedAutomaticResult;
      surfaceClassificationRestoreMs = performance.now() - restoreStarted;
      const targetedGrid = state.skinParams.internalStructure === "targetedGrid";
      if (targetedGrid) {
        // Classification only prepares the ledger. Dry Web is an explicit
        // author action in Stage 4; never launch it from diagnosis completion.
        internalStructureGraph = null;
        internalStructureFingerprint = "";
        targetedSupportSource = null;
        skinRenderer.setInternalStructure(null);
        refreshInternalAngleScreening(null);
        ui.setInternalStructureStatus("Surface分類完了 · 自動inside ledgerを確認してDry Web生成を押してください");
      }
      finishSurfaceAngleDiagnosis(message, heavy, "before", undefined, {
        ...surfaceRunBinding,
        cacheKeys: activeSurfacePersistentCacheKeys,
      });
      if (supportPaintSession.history.present.strokes.length > 0) reapplySupportPaint("保存済みSupport PaintをWorkerで復元しました", supportPaintSession.history.present);
    } catch (error) {
      const failure = error as Error;
      surfaceAngleCache = message;
      skinRenderer.setMeshOverlayBuffers(message.basePositions, message.baseNormals);
      refreshRiskDrivenInternalLatticePresentation();
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
  const separationBlockReason = dryWebSupportSeparationOutputBlockReason(
    state.skinParams.internalStructure,
    dryWebSupportSeparationIsCurrent() ? dryWebSupportSeparation : null,
  );
  if (separationBlockReason) {
    ui.setPrintCheckStatus(`確認停止: ${separationBlockReason}`, false);
    return;
  }
  const internalGraph = getInternalStructureGraph();
  const readinessBlockReason = internalStructureOutputBlockReason(state.skinParams.internalStructure, internalGraph);
  if (readinessBlockReason) {
    ui.setPrintCheckStatus(`確認停止: ${readinessBlockReason}`, false);
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
  keepInternalGraphVisibleInMesh(getInternalStructureGraph());
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
  const rebuildGraphIsObservable = isSkinRebuildApp
    && skinRebuildPipelineIsCurrent()
    && (skinRebuildPipeline?.project?.finalGraph.edges.length ?? 0) > 0;
  if (mode !== "normal" && state.skinParams.internalStructure === "none" && !rebuildGraphIsObservable) {
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

/** Mesh preview uses an opaque fused surface in normal mode. When a Dry Web
 * is present, retain it as the cyan inspection layer by selecting the
 * existing translucent-SKIN observation mode. The author can still choose
 * normal or internal-only afterwards. */
function keepInternalGraphVisibleInMesh(graph: InternalStructureGraph | null): boolean {
  const nextMode = observationModeKeepingInternalGraphVisible(
    viewMode,
    internalObservationMode,
    graph?.edges.length ?? 0,
  );
  if (nextMode === internalObservationMode) return false;
  setInternalObservationMode(nextMode);
  return true;
}

/** Keep the permanent cyan REBUILD graph synchronized with the original
 * editor preview. Stage 5A deliberately clears the removable orange support:
 * authors must be able to inspect the lattice before running Stage 5B. */
function installSkinRebuildPermanentLatticePreview(
  project: SkinRebuildProject,
  reveal: boolean,
): void {
  internalStructureGraph = project.finalGraph;
  internalStructureFingerprint = "";
  skinRenderer.setInternalStructure(project.finalGraph);
  skinRenderer.setPrintSupport(null);
  refreshInternalAngleScreening(project.finalGraph);
  if (reveal) keepInternalGraphVisibleInMesh(project.finalGraph);
}

function afterMutation(opts: { skipGauges?: boolean; patchOnlyId?: number } = {}): void {
  // Every field/host/patch mutation reaches this common path.  The display
  // count control bypasses it, so it can redraw without recomputing.
  if (isSkinRebuildApp) invalidateSkinRebuildPipeline();
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
  stage6BodyMeshCache = null;
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
  artworkGraphLastError = null;
  syncArtworkGraphStatus();
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
  refreshRestoredRiskDrivenLatticeCurrentness();
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
  refreshSkinRebuildAxomeRollControl();
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

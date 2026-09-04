import {
  DEFAULT_SKIN_VIEW_DIRECTIONS,
  skinViewAxisLegend,
  skinViewDirectionLabel,
  skinViewportAtPoint,
  skinViewportRects,
  type SkinViewportRect,
} from "../skin/multiViewport.ts";
import { resolveRhinoViewportGesture, type RhinoViewportGesture } from "../skin/rhinoViewportControls.ts";
import manifest from "./manifest.json";
import {
  HANA_VIEW_DIRECTIONS,
  pointerTypeFromBrowser,
  pressureStats,
  type HanaEditorState,
  type HanaInteractionMode,
  type HanaPointerType,
  type HanaSoftEditStrength,
  type HanaStrokePoint,
  type HanaViewDirection,
  type HanaViewportMode,
  type HanaViewportStroke,
} from "./gesture.ts";
import {
  deriveStroke3DFromSamples,
  deriveStroke3DFromRawIndices,
  type HanaStroke3D,
} from "./stroke3d.ts";
import type { HanaVector3 } from "./stroke3d.ts";
import {
  fitAdaptiveControlIndices,
  HANA_ADAPTIVE_CONTROL_MAX_POINTS,
  HANA_ADAPTIVE_CONTROL_TOLERANCE,
  type HanaAdaptiveControlFitResult,
} from "./adaptiveControl.ts";
import {
  applySoftViewportEdit,
  editorStrokeColor,
  sampleSmoothCenterline,
  strokeBounds,
  type HanaStrokeBounds,
} from "./smoothCenterline.ts";
import {
  HANA_SURFACE_RESOLUTION,
  HANA_THICKNESS_DEFAULT,
  HANA_THICKNESS_MAX,
  HANA_THICKNESS_MIN,
  HanaPointFieldMeshCancelledError,
  buildPointField,
  buildPointFieldMesh,
  buildPointFieldMeshCooperative,
  createPointFieldEvaluationStats,
  diagnosePointField,
  pointFieldEffectiveResolution,
  sampleMaterialSamples,
  sampleMaterialSamplesForPreview,
  type HanaMaterialSample,
  type HanaPointFieldEvaluationStats,
  type HanaPointFieldDiagnostics,
  type HanaPreviewSurface,
} from "./materialField.ts";
import {
  HANA_LIVE_PROXY_MAX_SEGMENTS,
  sampleLiveProxySegments,
  type HanaLiveProxySegment,
} from "./liveProxy.ts";
import {
  appendLiveWorkingPoint,
  createLiveWorkingPath,
  HANA_LIVE_WORKING_INITIAL_SPACING,
  liveWorkingStrokeSamples,
  type HanaLiveWorkingPath,
} from "./liveWorkingPath.ts";
import {
  collectPointerEventSamples,
  dedupeExactPointerSamples,
  summarizeRawGestureCapture,
  type HanaPointerSampleLike,
  type HanaRawGestureCaptureDiagnostics,
  type HanaRawCaptureSourceCounts,
} from "./rawGestureCapture.ts";
import {
  createBoundedStrokePreview,
  HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS,
} from "./editPreview.ts";
import {
  createHanaFinalizationTrace,
  transitionHanaFinalization,
  type HanaFinalizationState,
  type HanaFinalizationTrace,
} from "./finalization.ts";
import {
  HanaViewportRenderer,
  type HanaRendererPresentationStats,
  type HanaRendererRenderStats,
  type HanaRendererResourceStats,
  type HanaRendererSurfaceUpdateStats,
} from "./viewportRenderer.ts";
import {
  createHanaComputeBackend,
  type HanaComputeBackend,
  type HanaComputeMode,
} from "./computeBackend.ts";
import {
  createHanaFinalizationSnapshot,
  finalizationResultToTriangles,
  type HanaFinalizationResultV0,
  type HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";
import { buildMeshResultFromTriangles } from "../cloud-sculpt/meshExport.ts";
import { initializeHanaAuthoringStackUi } from "./authoringStackUi.ts";
import {
  createHanaAuthoringDocument,
  defaultHanaMaterialSettings,
  migrateHanaDocument,
  stroke3DFromHanaStroke,
} from "./authoringDocument.ts";
import {
  createHanaRecoveryCheckpoint,
  createIndexedDbHanaRecoveryStore,
  isNewerHanaRecoveryCheckpoint,
} from "./recoveryCheckpoint.ts";
import { HanaLivePathProfiler, formatHanaLivePathSummary } from "./livePathProfiler.ts";
import {
  HANA_VIEW_PRESETS,
  touchGestureDelta,
  type HanaTouchPoint,
  type HanaViewPreset,
} from "./viewNavigation.ts";
import "./style.css";

const app = document.getElementById("app");
if (!app) throw new Error("#app was not found");

let longTaskDurations: number[] = [];
if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
  try {
    new PerformanceObserver((list) => {
      longTaskDurations = [
        ...longTaskDurations,
        ...list.getEntries().map((entry) => entry.duration),
      ].slice(-256);
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // Some browser builds expose the type but do not allow observing it.
  }
}

app.innerHTML = `
  <main class="hana-shell">
    <header class="hana-header">
      <div class="hana-heading">
        <h1>HANA — Point Field Stem Preview</h1>
        <p>HANA Authoring Stack v0 · v${manifest.version} · updated ${manifest.updatedAt}</p>
      </div>
      <div class="hana-toolbar" aria-label="Viewport layout and document actions">
        <div class="hana-segmented" aria-label="Viewport layout">
          <button id="layout-four" type="button" aria-pressed="true">Four</button>
          <button id="layout-one" type="button" aria-pressed="false">One</button>
        </div>
        <div class="hana-soft-control" aria-label="Soft Edit strength">
          <span>Soft</span>
          <div class="hana-segmented">
            <button type="button" data-soft-edit="off" aria-pressed="false">OFF</button>
            <button type="button" data-soft-edit="low" aria-pressed="false">LOW</button>
            <button type="button" data-soft-edit="medium" aria-pressed="true">MEDIUM</button>
          </div>
        </div>
        <label class="hana-smooth-control" for="smoothness-control">
          <span>Smoothness</span>
          <span class="hana-smooth-bound">0.00</span>
          <input id="smoothness-control" type="range" min="0" max="1" step="0.01" value="0" aria-label="Smoothness" />
          <span class="hana-smooth-bound">1.00</span>
          <output id="smoothness-value" for="smoothness-control">0.00</output>
        </label>
        <div class="hana-display-control" aria-label="HANA display layers">
          <button id="show-centerline" type="button" aria-pressed="true">Centerline ON</button>
          <button id="show-samples" type="button" aria-pressed="false">Samples OFF</button>
          <button id="show-surface" type="button" aria-pressed="true">Surface ON</button>
        </div>
        <label class="hana-smooth-control" for="thickness-control">
          <span>Thickness</span>
          <span class="hana-smooth-bound">${HANA_THICKNESS_MIN.toFixed(2)}</span>
          <input id="thickness-control" type="range" min="${HANA_THICKNESS_MIN}" max="${HANA_THICKNESS_MAX}" step="0.01" value="${HANA_THICKNESS_DEFAULT}" aria-label="Thickness" />
          <span class="hana-smooth-bound">${HANA_THICKNESS_MAX.toFixed(2)}</span>
          <output id="thickness-value" for="thickness-control">${HANA_THICKNESS_DEFAULT.toFixed(2)}</output>
        </label>
        <div class="hana-compute-control" aria-label="Finalization compute backend">
          <span>Compute</span>
          <div class="hana-segmented">
            <button type="button" data-compute-mode="local" aria-pressed="true">LOCAL</button>
            <button type="button" data-compute-mode="windows" aria-pressed="false">WINDOWS</button>
            <button type="button" data-compute-mode="auto" aria-pressed="false">AUTO</button>
          </div>
          <span id="compute-status" class="hana-compute-status" role="status">LOCAL · READY</span>
        </div>
        <div class="hana-view-control" aria-label="View navigation">
          <span>View</span>
          <div class="hana-view-presets">
            <button type="button" data-view-preset="front">Front</button>
            <button type="button" data-view-preset="side">Side</button>
            <button type="button" data-view-preset="top">Top</button>
            <button type="button" data-view-preset="iso">Iso</button>
            <button type="button" data-view-preset="fit">Fit</button>
          </div>
          <button id="auto-rotate" type="button" aria-pressed="false">Auto Rotate OFF</button>
        </div>
        <div class="hana-authoring-context" aria-label="Authoring context">
          <span class="hana-context-label">Document</span><strong>HANA local</strong>
          <span class="hana-context-label">Tool</span><strong>Stroke</strong>
          <span class="hana-context-label">Selection</span><strong id="selection-status">Stroke</strong>
          <span class="hana-context-label">Mapping</span><strong>Uniform</strong>
        </div>
        <span id="recovery-status" class="hana-recovery-status" role="status">Local recovery: ready</span>
        <button id="rebuild-surface" class="hana-secondary" type="button">Rebuild Surface</button>
        <span id="surface-state" class="hana-surface-state" role="status">NOT BUILT</span>
        <button id="clear-document" type="button">Clear</button>
        <button id="save-document" type="button" class="hana-primary">Save JSON</button>
      </div>
    </header>

    <section class="hana-workspace" aria-label="HANA smooth 3D stroke editor">
      <canvas id="scene-canvas" aria-hidden="true"></canvas>
      <canvas id="gesture-canvas" aria-label="HANA shared 3D stroke input"></canvas>
      <div id="viewport-chrome" aria-live="polite"></div>
      <div id="edit-diagnostic-markers" aria-hidden="true">
        <span id="edit-diagnostic-pointer" class="hana-edit-diagnostic-marker hana-edit-diagnostic-pointer"></span>
        <span id="edit-diagnostic-target" class="hana-edit-diagnostic-marker hana-edit-diagnostic-target"></span>
        <span id="edit-diagnostic-proxy-tip" class="hana-edit-diagnostic-marker hana-edit-diagnostic-proxy-tip"></span>
      </div>
      <div id="splitter-x" class="hana-splitter hana-splitter-x" role="separator" aria-label="Resize viewport columns" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="80" aria-valuenow="50"></div>
      <div id="splitter-y" class="hana-splitter hana-splitter-y" role="separator" aria-label="Resize viewport rows" aria-orientation="horizontal" aria-valuemin="20" aria-valuemax="80" aria-valuenow="50"></div>
    </section>

    <details class="hana-debug">
      <summary>Diagnostics</summary>
      <div class="hana-debug-content">
      <dl>
        <div><dt>pointerType</dt><dd id="debug-pointer">—</dd></div>
        <div><dt>pressure</dt><dd id="debug-pressure">0.0000</dd></div>
        <div><dt>x / y</dt><dd id="debug-position">— / —</dd></div>
        <div><dt>viewport</dt><dd id="debug-viewport">Front</dd></div>
        <div><dt>raw points</dt><dd id="debug-points">0</dd></div>
        <div><dt>raw capture</dt><dd id="debug-raw-capture">—</dd></div>
        <div><dt>3D controls</dt><dd id="debug-controls">0</dd></div>
        <div><dt>control fit</dt><dd id="debug-control-fit">—</dd></div>
        <div><dt>smooth samples</dt><dd id="debug-smooth">0</dd></div>
        <div><dt>material samples</dt><dd id="debug-material">0</dd></div>
        <div><dt>proxy segments</dt><dd id="debug-proxy-segments">0</dd></div>
        <div><dt>proxy update/render ms</dt><dd id="debug-proxy-timing">—</dd></div>
        <div><dt>surface triangles</dt><dd id="debug-surface">—</dd></div>
        <div><dt>surface build ms</dt><dd id="debug-surface-ms">—</dd></div>
        <div><dt>preview build min/med/max</dt><dd id="debug-preview-build-stats">—</dd></div>
        <div><dt>surface diagnostics</dt><dd id="debug-surface-diagnostics">—</dd></div>
        <div><dt>pointerup stages</dt><dd id="debug-pointerup-stages">—</dd></div>
         <div><dt>mouse edit stages</dt><dd id="debug-mouse-edit-stages">—</dd></div>
         <div><dt>mouse edit e2e</dt><dd id="debug-mouse-edit-e2e">—</dd></div>
         <div><dt>mouse edit resources</dt><dd id="debug-mouse-edit-resources">—</dd></div>
         <div><dt>mouse edit caches</dt><dd id="debug-mouse-edit-caches">—</dd></div>
         <div><dt>mouse edit sessions</dt><dd id="debug-mouse-edit-sessions">—</dd></div>
         <div><dt>mouse edit hit test</dt><dd id="debug-mouse-edit-hit-test">—</dd></div>
         <div><dt>mouse edit frame</dt><dd id="debug-mouse-edit-frame">—</dd></div>
         <div><dt>mouse edit presentation</dt><dd id="debug-mouse-edit-presentation">—</dd></div>
        <div><dt>mouse edit markers</dt><dd id="debug-mouse-edit-markers">—</dd></div>
        <div><dt>mouse edit pipeline</dt><dd id="debug-mouse-edit-pipeline">—</dd></div>
        <div><dt>finalization</dt><dd id="debug-finalization">—</dd></div>
        <div><dt>thickness</dt><dd id="debug-thickness">0.18</dd></div>
        <div><dt>soft / affected</dt><dd id="debug-soft">MEDIUM / 0</dd></div>
        <div><dt>selected XYZ</dt><dd id="debug-xyz">—</dd></div>
        <div><dt>raw pressure</dt><dd id="debug-range">—</dd></div>
        <div><dt>compute</dt><dd id="debug-compute">LOCAL · READY</dd></div>
        <div><dt>live profile</dt><dd id="debug-live-profile">—</dd></div>
        <div><dt>lifecycle</dt><dd id="debug-lifecycle">—</dd></div>
        <div><dt>recovery</dt><dd id="debug-recovery">—</dd></div>
        <div><dt>view</dt><dd id="debug-view">—</dd></div>
      </dl>
      <p id="input-state">READY · Draw one Stroke in Front, Right, or Top</p>
      </div>
    </details>
  </main>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required HANA element was not found: ${selector}`);
  return element;
}

const workspace = requiredElement<HTMLElement>(".hana-workspace");
const sceneCanvas = requiredElement<HTMLCanvasElement>("#scene-canvas");
const gestureCanvas = requiredElement<HTMLCanvasElement>("#gesture-canvas");
const chrome = requiredElement<HTMLElement>("#viewport-chrome");
const editDiagnosticMarkerLayer = requiredElement<HTMLElement>("#edit-diagnostic-markers");
const editDiagnosticPointerMarker = requiredElement<HTMLElement>("#edit-diagnostic-pointer");
const editDiagnosticTargetMarker = requiredElement<HTMLElement>("#edit-diagnostic-target");
const editDiagnosticProxyTipMarker = requiredElement<HTMLElement>("#edit-diagnostic-proxy-tip");
const splitterX = requiredElement<HTMLElement>("#splitter-x");
const splitterY = requiredElement<HTMLElement>("#splitter-y");
const layoutFourButton = requiredElement<HTMLButtonElement>("#layout-four");
const layoutOneButton = requiredElement<HTMLButtonElement>("#layout-one");
const clearButton = requiredElement<HTMLButtonElement>("#clear-document");
const saveButton = requiredElement<HTMLButtonElement>("#save-document");
const softEditButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-soft-edit]"));
const smoothnessSlider = requiredElement<HTMLInputElement>("#smoothness-control");
const smoothnessValue = requiredElement<HTMLOutputElement>("#smoothness-value");
const centerlineToggle = requiredElement<HTMLButtonElement>("#show-centerline");
const samplesToggle = requiredElement<HTMLButtonElement>("#show-samples");
const surfaceToggle = requiredElement<HTMLButtonElement>("#show-surface");
const thicknessSlider = requiredElement<HTMLInputElement>("#thickness-control");
const thicknessValue = requiredElement<HTMLOutputElement>("#thickness-value");
const rebuildSurfaceButton = requiredElement<HTMLButtonElement>("#rebuild-surface");
const surfaceState = requiredElement<HTMLElement>("#surface-state");
const computeModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-compute-mode]"));
const computeStatus = requiredElement<HTMLElement>("#compute-status");
const viewPresetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-view-preset]"));
const autoRotateButton = requiredElement<HTMLButtonElement>("#auto-rotate");
const recoveryStatusElement = requiredElement<HTMLElement>("#recovery-status");
const selectionStatusElement = requiredElement<HTMLElement>("#selection-status");

const renderer = new HanaViewportRenderer(sceneCanvas, HANA_VIEW_DIRECTIONS);
const gestureContext = gestureCanvas.getContext("2d") ?? (() => {
  throw new Error("HANA gesture canvas 2D context is unavailable");
})();
let activeRawPath: Path2D | null = null;
let activeRawPathStroke: HanaViewportStroke | null = null;
let activeRawPathRect: SkinViewportRect | null = null;

const directions = DEFAULT_SKIN_VIEW_DIRECTIONS as readonly HanaViewDirection[];
let viewportMode: HanaViewportMode = "four";
let selectedViewport = 2;
let split = { x: 0.5, y: 0.5 };
const interactionModes: HanaInteractionMode[] = ["edit", "view", "draw", "edit"];
const rawGestures: HanaViewportStroke[] = [];
let rawPressureTotal = 0;
let rawTimeTotal = 0;
let lastRawCaptureDiagnostics: HanaRawGestureCaptureDiagnostics | null = null;
let stroke3D: HanaStroke3D | null = null;
let provisionalStroke3D: HanaStroke3D | null = null;
let editPreviewStroke3D: HanaStroke3D | null = null;
let authoritativeCenterline: ReturnType<typeof sampleSmoothCenterline> = [];
let provisionalCenterline: ReturnType<typeof sampleSmoothCenterline> = [];
let editPreviewCenterline: ReturnType<typeof sampleSmoothCenterline> = [];
let editPreviewMaterialSamples: HanaMaterialSample[] = [];
let selectedControlPoint: number | null = null;
let softEditStrength: HanaSoftEditStrength = "medium";
let smoothness = 0;
let thickness = HANA_THICKNESS_DEFAULT;
let showCenterline = true;
let showSamples = false;
let showSurface = true;
let materialSamples: HanaMaterialSample[] = [];
let previewSurface: HanaPreviewSurface | null = null;
let surfaceBuildSignature: string | null = null;
let surfaceBuildMilliseconds: number | null = null;
let surfacePreviewTimer: number | null = null;
let surfaceBuildSource: "authoritative" | "provisional" | null = null;
const SURFACE_PREVIEW_THROTTLE_MS = 100;
const SURFACE_PREVIEW_RESOLUTION = 24;
const SURFACE_PREVIEW_MAX_SAMPLES = 256;
const HANA_EDIT_TRACE_CAPACITY = 120;
const editPresentationMode: "hide-final" | "final-visible" = new URLSearchParams(window.location.search).get("editPresentation") === "final-visible"
  ? "final-visible"
  : "hide-final";
const editMarkersEnabled = new URLSearchParams(window.location.search).get("editMarkers") === "1";
const editProxyMode: "bounded" | "direct" = new URLSearchParams(window.location.search).get("editProxy") === "direct"
  ? "direct"
  : "bounded";
const finalProfile: HanaFinalizationTrace["finalProfile"] = (() => {
  const value = new URLSearchParams(window.location.search).get("finalProfile");
  return value === "skip" || value === "cpu-only" || value === "upload-only" || value === "normal"
    ? value
    : "normal";
})();
const hideFinalSurfaceDuringEdit = editPresentationMode === "hide-final";
let surfacePreviewBuildCount = 0;
let surfacePreviewLastStartMilliseconds: number | null = null;
let surfacePreviewLastEndMilliseconds: number | null = null;
let surfacePointerEndMilliseconds: number | null = null;
let surfacePreviewBuildDurations: number[] = [];
let surfaceDiagnostics: HanaPointFieldDiagnostics | null = null;
let surfaceFieldEvaluationStats: HanaPointFieldEvaluationStats | null = null;
let materialProxyFrame: number | null = null;
let editPreviewMaterialProxyFrame: number | null = null;
let materialProxyFrameCount = 0;
let materialProxyUpdateDurations: number[] = [];
let materialProxyRenderDurations: number[] = [];
let mouseEditNearestDurations: number[] = [];
let mouseEditHandlerDurations: number[] = [];
let mouseEditControlUpdateDurations: number[] = [];
let mouseEditSoftEditDurations: number[] = [];
let mouseEditSmoothRebuildDurations: number[] = [];
let mouseEditPreviewUpdateDurations: number[] = [];
let mouseEditPreviewProcessDurations: number[] = [];
let mouseEditInputQueueLatencies: number[] = [];
let mouseEditEndToEndLatencies: number[] = [];
let mouseEditRenderSubmissionDurations: number[] = [];
let mouseEditPointerMoveCount = 0;
let mouseEditPreviewFrameCount = 0;
let mouseEditDroppedPointerMoves = 0;
let mouseEditFirstPointerTimestamp: number | null = null;
let mouseEditLastPointerTimestamp: number | null = null;
let mouseEditFirstPreviewTimestamp: number | null = null;
let mouseEditLastPreviewTimestamp: number | null = null;
let mouseEditOldestPointerAge = 0;
let mouseEditMaxPendingRaf = 0;
let mouseEditLastEventTimestamp: number | null = null;
let mouseEditLastHandlerStart: number | null = null;
let mouseEditLastHandlerEnd: number | null = null;
let mouseEditLastLatestStateUpdated: number | null = null;
let mouseEditLastRafStart: number | null = null;
let mouseEditLastPreviewUpdateEnd: number | null = null;
let mouseEditLastRenderSubmission: number | null = null;
let mouseEditFinalMaterialMilliseconds: number | null = null;
let mouseEditFinalSurfaceMilliseconds: number | null = null;
let mouseEditSessionNumber = 0;
let mouseEditSessionResourceBefore: HanaRendererResourceStats | null = null;
let mouseEditSessionHistory: MouseEditSessionReport[] = [];
let mouseEditSessionGeometryBefore: HanaEditGeometrySnapshot | null = null;
let mouseEditSessionRenderBefore: HanaRendererRenderStats | null = null;
let mouseEditSessionReadyToEditMilliseconds: number | null = null;
let lastFinalReadyTimestamp: number | null = null;
let mouseEditRaycastDurations: number[] = [];
let mouseEditRafAgeDurations: number[] = [];
let mouseEditFrameIntervals: number[] = [];
let mouseEditIntersectMeshCount = 0;
let mouseEditPreviewRejectCount = 0;
let mouseEditLastPreviewRejectReason = "";
let lastAffectedControlIndices: number[] = [];
let lastEditBoundsBefore: HanaStrokeBounds | null = null;
let lastEditBoundsAfter: HanaStrokeBounds | null = null;
let gesturePixelRatio = 1;
let stateMessage = "READY · Draw one Stroke in Front, Right, or Top";

interface ActiveStroke {
  pointerId: number;
  startTime: number;
  stroke: HanaViewportStroke;
  rect: SkinViewportRect;
  pressureMin: number;
  pressureMax: number;
  pressures: Set<number>;
  lastCapturedInputSample: HanaPointerSampleLike | null;
  captureSourceCounts: HanaRawCaptureSourceCounts;
  suppressedExactDuplicateCount: number;
}

interface CameraDrag {
  pointerId: number;
  viewportIndex: number;
  gesture: RhinoViewportGesture;
  previousX: number;
  previousY: number;
  rect: SkinViewportRect;
}

interface ControlDrag {
  pointerId: number;
  viewportIndex: number;
  direction: Exclude<HanaViewDirection, "axome">;
  controlIndex: number;
  rect: SkinViewportRect;
  boundsBefore: HanaStrokeBounds | null;
  rawSignatureBefore: string;
  controlPositionsBefore: HanaVector3[];
}

interface PendingControlPointer {
  pointerId: number;
  pointerRevision: number;
  clientX: number;
  clientY: number;
  eventTimestamp: number;
  handlerStart: number;
  handlerEnd: number;
  latestStateUpdated: number;
}

interface ControlPreviewTiming {
  pointerRevision: number;
  previewUpdateEnd: number;
  controlUpdate: HanaEditStageTiming;
  targetUpdatedAt: number;
  targetPosition: HanaVector3;
  targetScreen: EditDiagnosticPoint | null;
  preview: EditPreviewPipelineTiming | null;
}

interface HanaEditStageTiming {
  start: number | null;
  end: number | null;
}

interface EditPreviewPipelineTiming {
  boundedControl: HanaEditStageTiming;
  smoothCenterline: HanaEditStageTiming;
  materialSamples: HanaEditStageTiming;
}

interface MouseEditPipelineFrame {
  session: number;
  frameNumber: number;
  pointerRevision: number | null;
  targetRevision: number | null;
  previewControlRevision: number | null;
  previewSmoothRevision: number | null;
  previewMaterialRevision: number | null;
  proxyRevision: number | null;
  renderRevision: number | null;
  sameRafRevision: boolean;
  rafTimestamp: number;
  inputTimestamp: number | null;
  proxyMode: "bounded" | "direct";
  targetPosition: HanaVector3 | null;
  targetScreen: EditDiagnosticPoint | null;
  targetUpdatedAt: number | null;
  controlUpdate: HanaEditStageTiming;
  boundedControl: HanaEditStageTiming;
  smoothCenterline: HanaEditStageTiming;
  materialSamples: HanaEditStageTiming;
  proxySegments: HanaEditStageTiming;
  proxyTransforms: HanaEditStageTiming;
  proxyTip: HanaEditStageTiming;
  renderSubmission: HanaEditStageTiming;
  targetToProxyTipMilliseconds: number | null;
}

interface EditDiagnosticPoint {
  x: number;
  y: number;
}

interface EditDiagnosticMarkerSnapshot {
  enabled: boolean;
  frameNumber: number;
  latestPointerEventCount: number;
  domPointerMarkerFrameCount: number;
  editTargetMarkerFrameCount: number;
  webglPreviewFrameCount: number;
  latestPointer: EditDiagnosticPoint | null;
  editTarget: EditDiagnosticPoint | null;
  proxyTip: EditDiagnosticPoint | null;
  latestPointerRafTimestamp: number | null;
  editTargetRafTimestamp: number | null;
  proxyTipRafTimestamp: number | null;
  webglPreviewRafTimestamp: number | null;
}

interface MouseEditSessionReport {
  session: number;
  pointerMoveCount: number;
  previewFrameCount: number;
  droppedPointerMoves: number;
  inputQueue: ReturnType<typeof durationStats>;
  endToEnd: ReturnType<typeof durationStats>;
  renderSubmission: ReturnType<typeof durationStats>;
  rafAge: ReturnType<typeof durationStats>;
  frameInterval: ReturnType<typeof durationStats>;
  raycast: ReturnType<typeof durationStats>;
  readyToEditMilliseconds: number | null;
  finalSurfaceMilliseconds: number | null;
  resourcesBefore: HanaRendererResourceStats;
  resourcesAfter: HanaRendererResourceStats;
  geometryBefore: HanaEditGeometrySnapshot;
  geometryAfter: HanaEditGeometrySnapshot;
  renderBefore: HanaRendererRenderStats;
  renderAfter: HanaRendererRenderStats;
  previewRejectCount: number;
  lastPreviewRejectReason: string;
  diagnosticMarkers: EditDiagnosticMarkerSnapshot;
  pipelineFrames: MouseEditPipelineFrame[];
  finalization: HanaFinalizationTrace | null;
}

interface HanaEditGeometrySnapshot {
  rawCount: number;
  controlCount: number;
  smoothCount: number;
  materialCount: number;
  effectiveResolution: number;
  triangleCount: number;
  componentCount: number;
  fieldQueryCount: number;
  fieldCandidateEvaluationCount: number;
  fieldMaxCandidateCount: number;
  bounds: string;
}

let activeStroke: ActiveStroke | null = null;
let liveWorkingPath: HanaLiveWorkingPath | null = null;
let cameraDrag: CameraDrag | null = null;
let controlDrag: ControlDrag | null = null;
const touchPointers = new Map<number, HanaTouchPoint>();
let previousTouchPoints: HanaTouchPoint[] = [];
let autoRotateEnabled = false;
let autoRotateFrame: number | null = null;
let lifecycleVisibility = document.visibilityState;
let lifecyclePagehideCount = 0;
let lifecycleResumeCount = 0;
let lifecycleContextLost = false;
let lifecycleLastEvent = "—";
let recoveryStatusText = "Local recovery: ready";
let recoveryRestoreAttempted = false;
let recoveryWriteChain: Promise<void> = Promise.resolve();
const recoveryStore = createIndexedDbHanaRecoveryStore();
const recoveryDocumentId = "hana-document-1";
const livePathProfiler = new HanaLivePathProfiler();
let liveLastEventTimestamp: number | null = null;
let pendingControlPointer: PendingControlPointer | null = null;
let mouseEditPointerRevision = 0;
let lastAdaptiveControlFit: HanaAdaptiveControlFitResult | null = null;
let editDiagnosticFrameNumber = 0;
let editDiagnosticLatestPointerEventCount = 0;
let editDiagnosticDomPointerMarkerFrameCount = 0;
let editDiagnosticTargetMarkerFrameCount = 0;
let editDiagnosticWebglPreviewFrameCount = 0;
let editDiagnosticLatestPointer: EditDiagnosticPoint | null = null;
let editDiagnosticTarget: EditDiagnosticPoint | null = null;
let editDiagnosticProxyTip: EditDiagnosticPoint | null = null;
let editDiagnosticLatestPointerRafTimestamp: number | null = null;
let editDiagnosticTargetRafTimestamp: number | null = null;
let editDiagnosticProxyTipRafTimestamp: number | null = null;
let editDiagnosticWebglPreviewRafTimestamp: number | null = null;
let mouseEditPipelineFrames: MouseEditPipelineFrame[] = [];

const HANA_FINALIZATION_HISTORY_CAPACITY = 10;
let documentRevision = 0;
let finalRequestId = 0;
let finalGenerationId = 0;
let lastCompletedGenerationId = 0;
let lastAppliedGenerationId = 0;
let finalizationState: HanaFinalizationState = "IDLE";
let finalizeReason = "—";
let activeFinalization: HanaFinalizationTrace | null = null;
let finalizationHistory: HanaFinalizationTrace[] = [];
let uploadOnlyMeshCache: HanaPreviewSurface | null = null;
const computeStrictRemote = new URLSearchParams(window.location.search).get("computeStrict") === "1";
const computeDocumentId = "hana-browser-document-v0";

function initialComputeMode(): HanaComputeMode {
  const query = new URLSearchParams(window.location.search).get("compute");
  if (query === "local" || query === "windows" || query === "auto") return query;
  try {
    const stored = window.localStorage.getItem("hana-compute-mode-v0");
    if (stored === "local" || stored === "windows" || stored === "auto") return stored;
  } catch {
    // Storage is optional; Local is always the safe default.
  }
  return "local";
}

let computeMode: HanaComputeMode = initialComputeMode();
let computeBackend: HanaComputeBackend = createHanaComputeBackend(computeMode, { strict: computeStrictRemote });
let computeStatusText = computeMode === "local" ? "LOCAL · READY" : `${computeMode.toUpperCase()} · CHECKING`;
let computeAbortController: AbortController | null = null;
let computeSnapshot: HanaFinalizationSnapshotV0 | null = null;

interface HanaPointerupStageTimings {
  rawFinalization: number;
  adaptiveControlFitting: number;
  overshootSubdivision: number;
  smoothCenterline: number;
  materialSamples: number;
  effectiveResolution: number;
  fieldPreparation: number;
  meshGeneration: number;
  componentValidation: number;
  gpuUpload: number;
  total: number;
  rawCount: number;
  controlCount: number;
  initialControlCount: number;
  overshootControlCount: number;
  smoothCount: number;
  materialCount: number;
  effectiveResolutionValue: number;
  triangleCount: number;
  componentCount: number;
  fieldQueryCount: number;
  fieldCandidateEvaluationCount: number;
  fieldMaxCandidateCount: number;
}

let pendingPointerupStageTimings: HanaPointerupStageTimings | null = null;
let lastPointerupStageTimings: HanaPointerupStageTimings | null = null;

function viewportId(index: number): string {
  const direction = directions[index];
  if (!direction) throw new Error(`Unknown HANA viewport index: ${index}`);
  return `viewport-${direction}`;
}

function currentRects(): SkinViewportRect[] {
  return skinViewportRects(workspace.clientWidth, workspace.clientHeight, viewportMode, selectedViewport, split);
}

function canvasPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const bounds = gestureCanvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function setDebugText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateRecoveryUI(): void {
  recoveryStatusElement.textContent = recoveryStatusText;
  workspace.dataset.recoveryStatus = recoveryStatusText;
  setDebugText("debug-recovery", recoveryStatusText);
}

function lifecycleText(): string {
  return [
    lifecycleVisibility,
    `pagehide ${lifecyclePagehideCount}`,
    `resume ${lifecycleResumeCount}`,
    `context ${lifecycleContextLost ? "lost" : "ready"}`,
    lifecycleLastEvent,
  ].join(" · ");
}

function updateLifecycleUI(): void {
  const value = lifecycleText();
  setDebugText("debug-lifecycle", value);
  workspace.dataset.lifecycle = value;
}

function scheduleRecoveryCheckpoint(reason: string): void {
  if (activeStroke) return;
  const checkpoint = createHanaRecoveryCheckpoint(snapshot());
  recoveryStatusText = `Local recovery: saving · rev ${checkpoint.documentRevision}`;
  updateRecoveryUI();
  recoveryWriteChain = recoveryWriteChain
    .then(() => recoveryStore.save(checkpoint))
    .then(() => {
      recoveryStatusText = `Local recovery: saved · rev ${checkpoint.documentRevision} · ${reason}`;
      updateRecoveryUI();
    })
    .catch(() => {
      recoveryStatusText = "Local recovery: unavailable";
      updateRecoveryUI();
    });
}

function clearRecoveryCheckpoint(): void {
  recoveryWriteChain = recoveryWriteChain
    .then(() => recoveryStore.clear(recoveryDocumentId))
    .then(() => {
      recoveryStatusText = "Local recovery: cleared";
      updateRecoveryUI();
    })
    .catch(() => {
      recoveryStatusText = "Local recovery: unavailable";
      updateRecoveryUI();
    });
}

function updateComputeUI(): void {
  for (const button of computeModeButtons) {
    const active = button.dataset.computeMode === computeMode;
    button.setAttribute("aria-pressed", String(active));
  }
  computeStatus.textContent = computeStatusText;
  setDebugText("debug-compute", computeStatusText);
  workspace.dataset.computeMode = computeMode;
  workspace.dataset.computeStatus = computeStatusText;
}

function setComputeStatus(status: string): void {
  computeStatusText = status;
  updateComputeUI();
}

async function refreshComputeHealth(): Promise<void> {
  const backendAtRequest = computeBackend;
  if (computeMode === "local") {
    setComputeStatus("LOCAL · READY");
    return;
  }
  setComputeStatus(`${computeMode.toUpperCase()} · CHECKING`);
  const health = await backendAtRequest.healthCheck();
  if (backendAtRequest !== computeBackend) return;
  if (health.status === "ready") {
    setComputeStatus(`${computeMode.toUpperCase()} · READY · W${health.workerCount}`);
  } else if (computeMode === "auto") {
    setComputeStatus(`AUTO · LOCAL FALLBACK · ${health.status.toUpperCase()}`);
  } else {
    setComputeStatus(`WINDOWS · ${health.status.toUpperCase()}`);
  }
}

function rawSignature(): string {
  const stroke = rawGestures[0];
  if (!stroke) return "empty";
  return `${stroke.id}:${stroke.points.length}:${rawPressureTotal.toFixed(8)}:${rawTimeTotal.toFixed(3)}`;
}

function appendRawSignaturePoint(point: HanaStrokePoint): void {
  rawPressureTotal += point.pressure;
  rawTimeTotal += point.time;
}

function rawCaptureText(): string {
  const diagnostics = lastRawCaptureDiagnostics;
  if (!diagnostics) {
    if (!activeStroke) return "—";
    const sources = activeStroke.captureSourceCounts;
    return `recording ${activeStroke.stroke.points.length} · source parent/coalesced ${sources.parentPointerEvent}/${sources.coalescedEvent}`;
  }
  const gap = diagnostics.largestGap;
  const gapStatus = diagnostics.intervalOver100Milliseconds > 0
    ? "INPUT GAP"
    : "no >100ms gap";
  return [
    `RAW ${diagnostics.sampleCount} · unique ${diagnostics.uniqueSampleCount} · dup ${diagnostics.exactDuplicateCount}`,
    `suppressed ${diagnostics.suppressedExactDuplicateCount}`,
    `dt ${diagnostics.medianSampleInterval.toFixed(1)}/${diagnostics.p95SampleInterval.toFixed(1)}/${diagnostics.maxSampleInterval.toFixed(1)}ms`,
    `>50/>100 ${diagnostics.intervalOver50Milliseconds}/${diagnostics.intervalOver100Milliseconds}`,
    gapStatus,
    `jump ${diagnostics.maxSpatialJump.toFixed(1)} · source ${diagnostics.parentPointerSamples}/${diagnostics.coalescedSamples}`,
    gap ? `largest ${gap.fromTime.toFixed(0)}→${gap.toTime.toFixed(0)}ms Δ${gap.deltaTime.toFixed(0)} (${gap.fromX.toFixed(1)},${gap.fromY.toFixed(1)})→(${gap.toX.toFixed(1)},${gap.toY.toFixed(1)})` : "largest —",
    `time ${diagnostics.monotonicTime ? "monotonic" : "NON-MONOTONIC"}`,
  ].join(" · ");
}

function boundsSignature(bounds: HanaStrokeBounds | null): string {
  if (!bounds) return "";
  return [
    bounds.min.x, bounds.min.y, bounds.min.z,
    bounds.max.x, bounds.max.y, bounds.max.z,
  ].join(",");
}

function materializationSignature(): string {
  return `${thickness.toFixed(4)}|${materialSamples.map((sample) => (
    `${sample.position.x.toFixed(10)},${sample.position.y.toFixed(10)},${sample.position.z.toFixed(10)}`
  )).join(";")}`;
}

function durationStats(values: readonly number[]): { min: number; median: number; p95: number; max: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return { min: sorted[0], median, p95: sorted[p95Index], max: sorted[sorted.length - 1] };
}

function transitionFinalization(
  trace: HanaFinalizationTrace,
  state: HanaFinalizationState,
  timestamp = performance.now(),
): void {
  Object.assign(trace, transitionHanaFinalization(trace, state, timestamp));
  finalizationState = state;
}

function setFinalizationStage(trace: HanaFinalizationTrace, name: string, milliseconds: number | null): void {
  trace.stages[name] = milliseconds;
}

function elapsedMilliseconds(start: number | null, end: number | null): number | null {
  return start === null || end === null ? null : Math.max(0, end - start);
}

function heapUsedBytes(): number | null {
  const performanceWithMemory = performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  };
  const value = performanceWithMemory.memory?.usedJSHeapSize;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finalizationStageSummary(trace: HanaFinalizationTrace): string {
  const timestamps = trace.timestamps;
  const pointerupToReady = elapsedMilliseconds(timestamps.tPointerUp, timestamps.tReady);
  const buildToMesh = elapsedMilliseconds(timestamps.tFinalBuildStart, timestamps.tMeshReady);
  const meshToUpload = elapsedMilliseconds(timestamps.tMeshReady, timestamps.tUploadSubmitted);
  const uploadToRender = elapsedMilliseconds(timestamps.tUploadSubmitted, timestamps.tFirstRender);
  const renderToPresented = elapsedMilliseconds(timestamps.tFirstRender, timestamps.tFinalPresented);
  return [
    `#${trace.editSessionId || "draw"} g${trace.finalGenerationId}`,
    `${trace.finalProfile}/${trace.status}/${trace.state}`,
    `req ${trace.finalRequestId} rev ${trace.documentRevision}`,
    `reason ${trace.finalizeReason}`,
    `build ${buildToMesh === null ? "—" : buildToMesh.toFixed(1)}`,
    `mesh→upload ${meshToUpload === null ? "—" : meshToUpload.toFixed(1)}`,
    `upload→render ${uploadToRender === null ? "—" : uploadToRender.toFixed(1)}`,
    `render→present ${renderToPresented === null ? "—" : renderToPresented.toFixed(1)}`,
    `pointerup→READY ${pointerupToReady === null ? "—" : pointerupToReady.toFixed(1)}`,
  ].join(" · ");
}

function finalizationText(): string {
  const latest = finalizationHistory[finalizationHistory.length - 1] ?? activeFinalization;
  if (!latest) return `state ${finalizationState} · profile ${finalProfile}`;
  return `state ${finalizationState} · profile ${finalProfile} · ${finalizationStageSummary(latest)}`;
}

function updateFinalizationCounts(
  trace: HanaFinalizationTrace,
  fieldStats: HanaPointFieldEvaluationStats | null,
  effectiveResolution: number,
  rendererSurface: HanaRendererSurfaceUpdateStats | null,
  mesh: HanaPreviewSurface | null = null,
): void {
  const previous = trace.counts;
  const grid = fieldStats?.gridShape;
  const gridX = grid?.nx ?? 0;
  const gridY = grid?.ny ?? 0;
  const gridZ = grid?.nz ?? 0;
  const voxelCount = grid ? (gridX + 1) * (gridY + 1) * (gridZ + 1) : 0;
  const queryCount = fieldStats?.queryCount ?? 0;
  const candidateCount = fieldStats?.candidateEvaluationCount ?? 0;
  const geometry = rendererSurface;
  trace.counts = {
    rawCount: rawGestures[0]?.points.length ?? 0,
    controlCount: stroke3D?.controlPoints.length ?? 0,
    refinementAddedControls: lastAdaptiveControlFit?.refinementIterations ?? 0,
    smoothCount: authoritativeCenterline.length,
    materialSampleCount: materialSamples.length,
    fieldBounds: fieldStats?.bounds ? boundsSignature(fieldStats.bounds) : null,
    gridX,
    gridY,
    gridZ,
    voxelCount,
    effectiveResolution,
    kdTreeCandidateCount: candidateCount,
    averageCandidatesPerVoxel: queryCount > 0 ? candidateCount / queryCount : 0,
    maxCandidatesPerVoxel: fieldStats?.maxCandidateCount ?? 0,
    triangleCount: mesh?.triangles.length ?? previewSurface?.triangles.length ?? 0,
    componentCount: surfaceDiagnostics?.componentCount ?? 0,
    positionBufferBytes: geometry?.positionBufferBytes ?? 0,
    indexBufferBytes: geometry?.indexBufferBytes ?? 0,
    normalBufferBytes: geometry?.normalBufferBytes ?? 0,
    fieldBufferBytes: materialSamples.length * 40,
    candidateScratchBytes: 0,
    kdTreeNodeBytes: materialSamples.length * 32,
    finalRequests: previous.finalRequests ?? 1,
    finalStarts: previous.finalStarts ?? 1,
    finalCpuCompletions: previous.finalCpuCompletions ?? 1,
    finalUploadSubmissions: previous.finalUploadSubmissions ?? 0,
    finalSurfaceApplies: previous.finalSurfaceApplies ?? 0,
    staleResultDiscards: previous.staleResultDiscards ?? 0,
    heapBeforeBytes: previous.heapBeforeBytes ?? heapUsedBytes(),
    heapAfterCpuBuildBytes: previous.heapAfterCpuBuildBytes ?? null,
    heapAfterUploadBytes: previous.heapAfterUploadBytes ?? null,
    heapReady500msBytes: previous.heapReady500msBytes ?? null,
    heapReady2000msBytes: previous.heapReady2000msBytes ?? null,
  };
}

function scheduleFinalizationHeapSamples(trace: HanaFinalizationTrace): void {
  window.setTimeout(() => {
    trace.counts.heapReady500msBytes = heapUsedBytes();
    updateDebug();
  }, 500);
  window.setTimeout(() => {
    trace.counts.heapReady2000msBytes = heapUsedBytes();
    updateDebug();
  }, 2000);
}

function recordFinalization(trace: HanaFinalizationTrace): void {
  const timestamps = trace.timestamps;
  setFinalizationStage(trace, "pointerupToBuildStart", elapsedMilliseconds(timestamps.tPointerUp, timestamps.tFinalBuildStart));
  setFinalizationStage(trace, "buildStartToCpuMeshReady", elapsedMilliseconds(timestamps.tFinalBuildStart, timestamps.tMeshReady));
  setFinalizationStage(trace, "cpuMeshReadyToUpload", elapsedMilliseconds(timestamps.tMeshReady, timestamps.tUploadSubmitted));
  setFinalizationStage(trace, "uploadToFirstRender", elapsedMilliseconds(timestamps.tUploadSubmitted, timestamps.tFirstRender));
  setFinalizationStage(trace, "firstRenderToPresented", elapsedMilliseconds(timestamps.tFirstRender, timestamps.tFinalPresented));
  setFinalizationStage(trace, "pointerupToReady", elapsedMilliseconds(timestamps.tPointerUp, timestamps.tReady));
  setFinalizationStage(trace, "finalBuildTotal", elapsedMilliseconds(timestamps.tFinalBuildStart, timestamps.tReady));
  setFinalizationStage(trace, "longTaskOver16Count", longTaskDurations.filter((duration) => duration > 16).length);
  setFinalizationStage(trace, "longTaskOver33Count", longTaskDurations.filter((duration) => duration > 33).length);
  setFinalizationStage(trace, "longTaskOver50Count", longTaskDurations.filter((duration) => duration > 50).length);
  finalizationHistory = [...finalizationHistory, trace].slice(-HANA_FINALIZATION_HISTORY_CAPACITY);
  activeFinalization = trace;
  updateDebug();
}

function isCurrentFinalization(trace: HanaFinalizationTrace): boolean {
  return activeFinalization === trace && trace.status === "pending";
}

function recordStaleFinalization(trace: HanaFinalizationTrace, reason: string): void {
  const wasActive = activeFinalization === trace;
  trace.status = "failed";
  trace.skipReason = reason;
  trace.timestamps.tReady ??= performance.now();
  trace.counts.staleResultDiscards = Math.max(
    1,
    Number(trace.counts.staleResultDiscards ?? 0),
  );
  if (!finalizationHistory.includes(trace)) {
    finalizationHistory = [...finalizationHistory, trace].slice(-HANA_FINALIZATION_HISTORY_CAPACITY);
  }
  if (wasActive) {
    activeFinalization = null;
    finalizationState = "IDLE";
  }
  updateDebug();
}

function cancelPendingFinalizationForEdit(): void {
  const pending = activeFinalization;
  if (!pending || pending.status !== "pending") return;
  const snapshot = computeSnapshot;
  computeAbortController?.abort();
  if (snapshot && computeBackend.cancel) void computeBackend.cancel(snapshot);
  recordStaleFinalization(pending, "cancelled-by-new-edit");
  finalizationState = "EDITING";
}

function beginAuthoritativeFinalization(
  reason: string,
  pointerUpTimestamp: number | null,
  documentChanged = true,
): HanaFinalizationTrace {
  if (documentChanged || documentRevision === 0) documentRevision += 1;
  const trace = createHanaFinalizationTrace({
    documentRevision,
    editSessionId: mouseEditSessionNumber,
    finalRequestId: finalRequestId + 1,
    finalGenerationId: finalGenerationId + 1,
    finalizeReason: reason,
    finalProfile,
    pointerUpTimestamp,
  });
  finalRequestId = trace.finalRequestId;
  finalGenerationId = trace.finalGenerationId;
  trace.counts.heapBeforeBytes = heapUsedBytes();
  activeFinalization = trace;
  finalizeReason = reason;
  transitionFinalization(trace, "FINAL_REQUESTED");
  return trace;
}

function markFinalizationEditing(reason: string): void {
  finalizeReason = reason;
  finalizationState = "EDITING";
}

function surfaceDiagnosticsText(diagnostics: HanaPointFieldDiagnostics | null): string {
  if (!diagnostics) return "—";
  const { bounds, gridShape, gridSpacing } = diagnostics;
  return [
    `bounds ${bounds.longest.toFixed(2)}`,
    `samples ${diagnostics.sampleCount}`,
    `spacing ${diagnostics.maxAdjacentSpacing.toFixed(3)} / ${diagnostics.medianAdjacentSpacing.toFixed(3)}`,
    `r ${diagnostics.radius.toFixed(2)}`,
    `grid ${gridShape.nx}×${gridShape.ny}×${gridShape.nz}`,
    `step ${gridSpacing.x.toFixed(3)}/${gridSpacing.y.toFixed(3)}/${gridSpacing.z.toFixed(3)}`,
    `negative ${diagnostics.gridScanSkipped ? "skipped" : diagnostics.negativeGridNodeCount}`,
    `triangles ${diagnostics.triangleCount}`,
    `components ${diagnostics.componentCount}`,
  ].join(" · ");
}

function pointerupStagesText(timings: HanaPointerupStageTimings | null): string {
  if (!timings) return "—";
  return [
    `total ${timings.total.toFixed(1)} ms`,
    `raw ${timings.rawCount}`,
    `controls ${timings.initialControlCount}+${timings.overshootControlCount}=${timings.controlCount}`,
    `smooth ${timings.smoothCount}`,
    `material ${timings.materialCount}`,
    `res ${timings.effectiveResolutionValue}`,
    `tri ${timings.triangleCount}`,
    `comp ${timings.componentCount}`,
    `field ${timings.fieldCandidateEvaluationCount}/${timings.fieldQueryCount} max ${timings.fieldMaxCandidateCount}`,
    `ms raw ${timings.rawFinalization.toFixed(1)} · fit ${timings.adaptiveControlFitting.toFixed(1)} · refine ${timings.overshootSubdivision.toFixed(1)} · smooth ${timings.smoothCenterline.toFixed(1)} · material ${timings.materialSamples.toFixed(1)} · res ${timings.effectiveResolution.toFixed(1)} · field ${timings.fieldPreparation.toFixed(1)} · mesh ${timings.meshGeneration.toFixed(1)} · validate ${timings.componentValidation.toFixed(1)} · gpu ${timings.gpuUpload.toFixed(1)}`,
  ].join(" · ");
}

function sampledDurationText(values: readonly number[]): string {
  const stats = durationStats(values);
  return stats
    ? `${stats.median.toFixed(2)} / ${stats.p95.toFixed(2)} / ${stats.max.toFixed(2)}`
    : "—";
}

function eventTimestampForPerformance(timestamp: number, now: number): number {
  if (!Number.isFinite(timestamp)) return now;
  if (timestamp > 1_000_000_000_000 && Number.isFinite(performance.timeOrigin)) {
    return timestamp - performance.timeOrigin;
  }
  return timestamp;
}

function ratePerSecond(first: number | null, last: number | null, count: number): string {
  if (first === null || last === null || last <= first || count < 2) return "—";
  return (count * 1000 / (last - first)).toFixed(1);
}

function mouseEditStagesText(): string {
  if (mouseEditHandlerDurations.length === 0 && mouseEditNearestDurations.length === 0) return "—";
  return [
    `nearest ${sampledDurationText(mouseEditNearestDurations)}`,
    `handler ${sampledDurationText(mouseEditHandlerDurations)}`,
    `control ${sampledDurationText(mouseEditControlUpdateDurations)}`,
    `soft ${sampledDurationText(mouseEditSoftEditDurations)}`,
    `smooth ${sampledDurationText(mouseEditSmoothRebuildDurations)}`,
    `preview ${sampledDurationText(mouseEditPreviewUpdateDurations)}`,
    `process ${sampledDurationText(mouseEditPreviewProcessDurations)}`,
    `final material ${mouseEditFinalMaterialMilliseconds === null ? "—" : mouseEditFinalMaterialMilliseconds.toFixed(1)}`,
    `final surface ${mouseEditFinalSurfaceMilliseconds === null ? "—" : mouseEditFinalSurfaceMilliseconds.toFixed(1)}`,
  ].join(" · ");
}

function mouseEditLatencyText(): string {
  if (mouseEditPointerMoveCount === 0 && mouseEditPreviewFrameCount === 0) return "—";
  const queue = durationStats(mouseEditInputQueueLatencies);
  const endToEnd = durationStats(mouseEditEndToEndLatencies);
  const render = durationStats(mouseEditRenderSubmissionDurations);
  return [
    `events ${mouseEditPointerMoveCount} @ ${ratePerSecond(mouseEditFirstPointerTimestamp, mouseEditLastPointerTimestamp, mouseEditPointerMoveCount)}/s`,
    `preview ${mouseEditPreviewFrameCount} @ ${ratePerSecond(mouseEditFirstPreviewTimestamp, mouseEditLastPreviewTimestamp, mouseEditPreviewFrameCount)}/s`,
    `queue ${queue ? `${queue.median.toFixed(1)}/${queue.max.toFixed(1)}` : "—"}`,
    `e2e ${endToEnd ? `${endToEnd.median.toFixed(1)}/${endToEnd.max.toFixed(1)}` : "—"}`,
    `render ${render ? `${render.median.toFixed(1)}/${render.max.toFixed(1)}` : "—"}`,
    `coalesced ${mouseEditDroppedPointerMoves}`,
    `pending ${mouseEditMaxPendingRaf}`,
    `oldest ${mouseEditOldestPointerAge.toFixed(1)}`,
    `long ${longTaskDurations.filter((duration) => duration > 16).length}/${longTaskDurations.filter((duration) => duration > 33).length}/${longTaskDurations.filter((duration) => duration > 50).length}`,
  ].join(" · ");
}

function mouseEditResourceText(stats: HanaRendererResourceStats): string {
  return [
    `scene ${stats.sceneObjectCount}`,
    `surface ${stats.surfaceMeshCount}`,
    `proxy ${stats.proxyObjectCount} (${stats.proxyInstanceCount}/${stats.proxyCapacity})`,
    `geometry ${stats.bufferGeometryCount}`,
    `material ${stats.materialCount}`,
    `gpu ${stats.gpuGeometryCount}/${stats.gpuTextureCount}`,
  ].join(" · ");
}

function mouseEditCacheText(): string {
  return [
    `raw ${rawGestures.length}`,
    `stroke ${stroke3D ? 1 : 0}`,
    `smooth ${authoritativeCenterline.length > 0 ? 1 : 0}`,
    `material ${materialSamples.length > 0 ? 1 : 0}`,
    `surface ${previewSurface ? 1 : 0}`,
    `preview ${controlDrag ? 1 : 0}`,
    `spatial-index 0`,
    `active-pointer ${controlDrag ? 1 : 0}`,
    `session-listeners 0`,
  ].join(" · ");
}

function mouseEditSessionText(): string {
  if (mouseEditSessionHistory.length === 0) return "—";
  return mouseEditSessionHistory.map((report) => {
    const e2e = report.endToEnd
      ? `${report.endToEnd.median.toFixed(1)}/${report.endToEnd.p95.toFixed(1)}/${report.endToEnd.max.toFixed(1)}`
      : "—";
    const before = report.resourcesBefore;
    const after = report.resourcesAfter;
    const geometry = report.geometryBefore;
    const geometryAfter = report.geometryAfter;
    const rafAge = report.rafAge
      ? `${report.rafAge.median.toFixed(1)}/${report.rafAge.p95.toFixed(1)}/${report.rafAge.max.toFixed(1)}`
      : "—";
    const frame = report.frameInterval
      ? `${report.frameInterval.median.toFixed(1)}/${report.frameInterval.p95.toFixed(1)}/${report.frameInterval.max.toFixed(1)}`
      : "—";
    const markers = report.diagnosticMarkers;
    const latestPipeline = report.pipelineFrames[report.pipelineFrames.length - 1];
    const final = report.finalization;
    const targetToProxy = latestPipeline?.targetToProxyTipMilliseconds === null || latestPipeline?.targetToProxyTipMilliseconds === undefined
      ? "—"
      : latestPipeline.targetToProxyTipMilliseconds.toFixed(2);
    return `#${report.session} ready ${report.readyToEditMilliseconds === null ? "—" : report.readyToEditMilliseconds.toFixed(0)}ms · moves ${report.pointerMoveCount} · preview ${report.previewFrameCount} · markers ${markers.latestPointerEventCount}/${markers.domPointerMarkerFrameCount}/${markers.editTargetMarkerFrameCount}/${markers.webglPreviewFrameCount} · ${latestPipeline?.proxyMode ?? editProxyMode} T→X ${targetToProxy}ms · e2e ${e2e} · rAF ${rafAge} · frame ${frame} · tri ${geometry.triangleCount}→${geometryAfter.triangleCount} · res ${geometry.effectiveResolution}→${geometryAfter.effectiveResolution} · obj ${before.sceneObjectCount}→${after.sceneObjectCount} · geo ${before.bufferGeometryCount}→${after.bufferGeometryCount} · mat ${before.materialCount}→${after.materialCount} · surface ${before.surfaceMeshCount}→${after.surfaceMeshCount} · proxy ${before.proxyObjectCount}→${after.proxyObjectCount} · final ${final ? `req${final.finalRequestId}/g${final.finalGenerationId}/${final.status}` : "—"} · render ${report.renderAfter.calls}/${report.renderAfter.triangles}`;
  }).join(" | ");
}

function editGeometrySnapshot(): HanaEditGeometrySnapshot {
  const bounds = surfaceDiagnostics?.bounds;
  const fallbackBounds = stroke3D ? strokeBounds(stroke3D) : null;
  return {
    rawCount: rawGestures[0]?.points.length ?? 0,
    controlCount: stroke3D?.controlPoints.length ?? 0,
    smoothCount: authoritativeCenterline.length,
    materialCount: materialSamples.length,
    effectiveResolution: lastPointerupStageTimings?.effectiveResolutionValue
      ?? surfaceDiagnostics?.effectiveResolution
      ?? 0,
    triangleCount: previewSurface?.triangles.length ?? 0,
    componentCount: surfaceDiagnostics?.componentCount ?? 0,
    fieldQueryCount: surfaceFieldEvaluationStats?.queryCount ?? 0,
    fieldCandidateEvaluationCount: surfaceFieldEvaluationStats?.candidateEvaluationCount ?? 0,
    fieldMaxCandidateCount: surfaceFieldEvaluationStats?.maxCandidateCount ?? 0,
    bounds: bounds
      ? boundsSignature({
        min: bounds.min,
        max: bounds.max,
      })
      : boundsSignature(fallbackBounds),
  };
}

function mouseEditHitTestText(): string {
  const raycast = durationStats(mouseEditRaycastDurations);
  const nearest = durationStats(mouseEditNearestDurations);
  return [
    `raycast ${raycast ? `${raycast.median.toFixed(2)}/${raycast.p95.toFixed(2)}/${raycast.max.toFixed(2)}` : "0.00/0.00/0.00"}`,
    `meshes ${mouseEditIntersectMeshCount}`,
    `nearest ${nearest ? `${nearest.median.toFixed(2)}/${nearest.p95.toFixed(2)}/${nearest.max.toFixed(2)}` : "—"}`,
    `reject ${mouseEditPreviewRejectCount}${mouseEditLastPreviewRejectReason ? `:${mouseEditLastPreviewRejectReason}` : ""}`,
  ].join(" · ");
}

function mouseEditFrameText(): string {
  const rafAge = durationStats(mouseEditRafAgeDurations);
  const intervals = durationStats(mouseEditFrameIntervals);
  return [
    `rAF age ${rafAge ? `${rafAge.median.toFixed(1)}/${rafAge.p95.toFixed(1)}/${rafAge.max.toFixed(1)}` : "—"}`,
    `interval ${intervals ? `${intervals.median.toFixed(1)}/${intervals.p95.toFixed(1)}/${intervals.max.toFixed(1)}` : "—"}`,
    `fps ${ratePerSecond(mouseEditFirstPreviewTimestamp, mouseEditLastPreviewTimestamp, mouseEditPreviewFrameCount)}`,
  ].join(" · ");
}

function mouseEditPresentationText(presentation: HanaRendererPresentationStats): string {
  return [
    `${editPresentationMode}`,
    `final ${presentation.finalSurface.visible ? "visible" : "hidden"}`,
    `preview ${presentation.editPreview.visible ? "visible" : "hidden"}`,
    `draw ${presentation.finalSurface.drawCalls}/${presentation.editPreview.drawCalls}`,
    `order ${presentation.finalSurface.renderOrder ?? "—"}/${presentation.editPreview.renderOrder ?? "—"}`,
    `depth ${presentation.finalSurface.depthTest === null ? "—" : `${presentation.finalSurface.depthTest}/${presentation.finalSurface.depthWrite}`}/${presentation.editPreview.depthTest === null ? "—" : `${presentation.editPreview.depthTest}/${presentation.editPreview.depthWrite}`}`,
    `opacity ${presentation.finalSurface.opacity?.toFixed(2) ?? "—"}/${presentation.editPreview.opacity?.toFixed(2) ?? "—"}`,
    `proxy ${presentation.editPreview.instanceCount}/${presentation.editPreview.capacity}`,
  ].join(" · ");
}

function editDiagnosticMarkerText(): string {
  if (!editMarkersEnabled) return "off · add ?editMarkers=1";
  const pointText = (point: EditDiagnosticPoint | null): string => point
    ? `${point.x.toFixed(0)}/${point.y.toFixed(0)}`
    : "—";
  const timestampText = (timestamp: number | null): string => timestamp === null
    ? "—"
    : timestamp.toFixed(1);
  return [
    `frame ${editDiagnosticFrameNumber}`,
    `events/dom/target/webgl ${editDiagnosticLatestPointerEventCount}/${editDiagnosticDomPointerMarkerFrameCount}/${editDiagnosticTargetMarkerFrameCount}/${editDiagnosticWebglPreviewFrameCount}`,
    `pointer ${pointText(editDiagnosticLatestPointer)}`,
    `target ${pointText(editDiagnosticTarget)}`,
    `proxy-tip ${pointText(editDiagnosticProxyTip)}`,
    `rAF ${timestampText(editDiagnosticLatestPointerRafTimestamp)}/${timestampText(editDiagnosticTargetRafTimestamp)}/${timestampText(editDiagnosticProxyTipRafTimestamp)}/${timestampText(editDiagnosticWebglPreviewRafTimestamp)}`,
  ].join(" · ");
}

function editDiagnosticSnapshot(): EditDiagnosticMarkerSnapshot {
  return {
    enabled: editMarkersEnabled,
    frameNumber: editDiagnosticFrameNumber,
    latestPointerEventCount: editDiagnosticLatestPointerEventCount,
    domPointerMarkerFrameCount: editDiagnosticDomPointerMarkerFrameCount,
    editTargetMarkerFrameCount: editDiagnosticTargetMarkerFrameCount,
    webglPreviewFrameCount: editDiagnosticWebglPreviewFrameCount,
    latestPointer: editDiagnosticLatestPointer ? { ...editDiagnosticLatestPointer } : null,
    editTarget: editDiagnosticTarget ? { ...editDiagnosticTarget } : null,
    proxyTip: editDiagnosticProxyTip ? { ...editDiagnosticProxyTip } : null,
    latestPointerRafTimestamp: editDiagnosticLatestPointerRafTimestamp,
    editTargetRafTimestamp: editDiagnosticTargetRafTimestamp,
    proxyTipRafTimestamp: editDiagnosticProxyTipRafTimestamp,
    webglPreviewRafTimestamp: editDiagnosticWebglPreviewRafTimestamp,
  };
}

function stageMilliseconds(stage: HanaEditStageTiming): string {
  return stage.start === null || stage.end === null
    ? "—"
    : `${(stage.end - stage.start).toFixed(2)}`;
}

function pipelineStageEnd(frame: MouseEditPipelineFrame): number | null {
  return frame.proxyTip.end
    ?? frame.proxyTransforms.end
    ?? frame.proxySegments.end
    ?? frame.materialSamples.end
    ?? frame.smoothCenterline.end
    ?? frame.boundedControl.end
    ?? frame.controlUpdate.end;
}

function mouseEditPipelineText(): string {
  const frame = mouseEditPipelineFrames[mouseEditPipelineFrames.length - 1];
  if (!frame) return `— · mode ${editProxyMode}`;
  const targetText = frame.targetScreen
    ? `${frame.targetScreen.x.toFixed(0)}/${frame.targetScreen.y.toFixed(0)}`
    : "—";
  const end = pipelineStageEnd(frame);
  const targetToProxy = frame.targetToProxyTipMilliseconds === null
    ? "—"
    : frame.targetToProxyTipMilliseconds.toFixed(2);
  return [
    `S${frame.session} f${frame.frameNumber} rAF ${frame.rafTimestamp.toFixed(1)}`,
    `rev ptr/${frame.pointerRevision ?? "—"} T/${frame.targetRevision ?? "—"} C/${frame.previewControlRevision ?? "—"} S/${frame.previewSmoothRevision ?? "—"} M/${frame.previewMaterialRevision ?? "—"} X/${frame.proxyRevision ?? "—"} R/${frame.renderRevision ?? "—"}`,
    `same-rAF ${frame.sameRafRevision ? "yes" : "NO"}`,
    `input ${frame.inputTimestamp === null ? "—" : frame.inputTimestamp.toFixed(1)}`,
    `T ${targetText}`,
    `control ${stageMilliseconds(frame.controlUpdate)}`,
    `bounded ${stageMilliseconds(frame.boundedControl)}`,
    `smooth ${stageMilliseconds(frame.smoothCenterline)}`,
    `material ${stageMilliseconds(frame.materialSamples)}`,
    `segments ${stageMilliseconds(frame.proxySegments)}`,
    `matrix ${stageMilliseconds(frame.proxyTransforms)}`,
    `X ${stageMilliseconds(frame.proxyTip)}`,
    `render ${stageMilliseconds(frame.renderSubmission)}`,
    `T→X ${targetToProxy}`,
    `end ${end === null ? "—" : end.toFixed(1)}`,
  ].join(" · ");
}

function editDiagnosticWorkspacePoint(clientX: number, clientY: number): EditDiagnosticPoint {
  const bounds = workspace.getBoundingClientRect();
  return {
    x: clientX - bounds.left,
    y: clientY - bounds.top,
  };
}

function setEditDiagnosticMarker(element: HTMLElement, point: EditDiagnosticPoint | null): void {
  element.classList.toggle("is-visible", point !== null);
  if (!point) return;
  const pointerOffset = element === editDiagnosticPointerMarker ? 25 : 0;
  element.style.transform = `translate(${(point.x + pointerOffset).toFixed(2)}px, ${point.y.toFixed(2)}px) translate(-50%, -50%)`;
}

function refreshEditDiagnosticMarkers(): void {
  const visible = editMarkersEnabled && controlDrag !== null;
  editDiagnosticMarkerLayer.classList.toggle("is-active", visible);
  if (!visible) {
    setEditDiagnosticMarker(editDiagnosticPointerMarker, null);
    setEditDiagnosticMarker(editDiagnosticTargetMarker, null);
    setEditDiagnosticMarker(editDiagnosticProxyTipMarker, null);
    return;
  }
  setEditDiagnosticMarker(editDiagnosticPointerMarker, editDiagnosticLatestPointer);
  setEditDiagnosticMarker(editDiagnosticTargetMarker, editDiagnosticTarget);
  setEditDiagnosticMarker(editDiagnosticProxyTipMarker, editDiagnosticProxyTip);
}

function resetEditDiagnosticMarkers(): void {
  editDiagnosticFrameNumber = 0;
  editDiagnosticLatestPointerEventCount = 0;
  editDiagnosticDomPointerMarkerFrameCount = 0;
  editDiagnosticTargetMarkerFrameCount = 0;
  editDiagnosticWebglPreviewFrameCount = 0;
  editDiagnosticLatestPointer = null;
  editDiagnosticTarget = null;
  editDiagnosticProxyTip = null;
  editDiagnosticLatestPointerRafTimestamp = null;
  editDiagnosticTargetRafTimestamp = null;
  editDiagnosticProxyTipRafTimestamp = null;
  editDiagnosticWebglPreviewRafTimestamp = null;
  refreshEditDiagnosticMarkers();
}

function updateEditDiagnosticFrame(
  rafTimestamp: number,
  proxySegments: readonly HanaLiveProxySegment[],
): void {
  if (!editMarkersEnabled || !controlDrag) return;
  editDiagnosticFrameNumber += 1;
  editDiagnosticDomPointerMarkerFrameCount += 1;
  editDiagnosticLatestPointerRafTimestamp = rafTimestamp;

  const control = stroke3D?.controlPoints[controlDrag.controlIndex];
  const target = control
    ? renderer.projectPoint(controlDrag.viewportIndex, control.position, controlDrag.rect)
    : null;
  editDiagnosticTarget = target?.visible ? { x: target.x, y: target.y } : null;
  if (editDiagnosticTarget) {
    editDiagnosticTargetMarkerFrameCount += 1;
    editDiagnosticTargetRafTimestamp = rafTimestamp;
  }

  const proxyTip = proxySegments.length > 0
    ? proxySegments[proxySegments.length - 1]?.end
    : editPreviewCenterline[editPreviewCenterline.length - 1]?.position;
  const projectedProxyTip = proxyTip
    ? renderer.projectPoint(controlDrag.viewportIndex, proxyTip, controlDrag.rect)
    : null;
  editDiagnosticProxyTip = projectedProxyTip?.visible
    ? { x: projectedProxyTip.x, y: projectedProxyTip.y }
    : null;
  if (editDiagnosticProxyTip) editDiagnosticProxyTipRafTimestamp = rafTimestamp;

  refreshEditDiagnosticMarkers();
}

function recordEditDiagnosticWebglFrame(
  rafTimestamp: number,
  presentation: HanaRendererPresentationStats,
): void {
  if (!editMarkersEnabled || !controlDrag) return;
  if (presentation.editPreview.visible && presentation.editPreview.drawCalls > 0) {
    editDiagnosticWebglPreviewFrameCount += 1;
    editDiagnosticWebglPreviewRafTimestamp = rafTimestamp;
  }
}

function displayedStroke(): HanaStroke3D | null {
  return activeStroke
    ? provisionalStroke3D
    : controlDrag
      ? editPreviewStroke3D
      : stroke3D;
}

function displayedCenterline(): ReturnType<typeof sampleSmoothCenterline> {
  return activeStroke
    ? provisionalCenterline
    : controlDrag
      ? editPreviewCenterline
      : authoritativeCenterline;
}

function displayedMaterialSamples(): readonly HanaMaterialSample[] {
  return controlDrag ? editPreviewMaterialSamples : materialSamples;
}

function currentSurfaceState(): string {
  if (!previewSurface) return "NOT BUILT";
  if (controlDrag) return "PREVIEW";
  if (activeStroke && surfaceBuildSource === "provisional") return "PREVIEW";
  return surfaceBuildSignature === materializationSignature() ? "READY" : "STALE";
}

function updateSurfaceUI(): void {
  const state = currentSurfaceState();
  const resources = renderer.resourceStats();
  const geometry = editGeometrySnapshot();
  const renderStats = renderer.renderStats();
  const presentation = renderer.presentationStats();
  updateComputeUI();
  surfaceState.textContent = state;
  surfaceState.dataset.state = state.toLowerCase().replace(" ", "-");
  rebuildSurfaceButton.disabled = !stroke3D || materialSamples.length === 0;
  setDebugText("debug-material", String(displayedMaterialSamples().length));
  setDebugText("debug-proxy-segments", workspace.dataset.materialProxySegmentCount ?? "0");
  setDebugText("debug-surface", previewSurface ? String(previewSurface.triangles.length) : "—");
  setDebugText("debug-surface-ms", surfaceBuildMilliseconds === null ? "—" : surfaceBuildMilliseconds.toFixed(1));
  const previewStats = previewBuildDurationStats();
  setDebugText("debug-preview-build-stats", previewStats
    ? `${previewStats.min.toFixed(1)} / ${previewStats.median.toFixed(1)} / ${previewStats.max.toFixed(1)}`
    : "—");
  const proxyUpdateStats = durationStats(materialProxyUpdateDurations);
  const proxyRenderStats = durationStats(materialProxyRenderDurations);
  setDebugText("debug-proxy-timing", proxyUpdateStats && proxyRenderStats
    ? `${proxyUpdateStats.median.toFixed(1)} / ${proxyRenderStats.median.toFixed(1)}`
    : "—");
  setDebugText("debug-surface-diagnostics", surfaceDiagnosticsText(surfaceDiagnostics));
  setDebugText("debug-pointerup-stages", pointerupStagesText(lastPointerupStageTimings));
  setDebugText("debug-mouse-edit-stages", mouseEditStagesText());
  setDebugText("debug-mouse-edit-e2e", mouseEditLatencyText());
  setDebugText("debug-mouse-edit-resources", mouseEditResourceText(resources));
  setDebugText("debug-mouse-edit-caches", mouseEditCacheText());
  setDebugText("debug-mouse-edit-sessions", mouseEditSessionText());
  setDebugText("debug-mouse-edit-hit-test", mouseEditHitTestText());
  setDebugText("debug-mouse-edit-frame", mouseEditFrameText());
  setDebugText("debug-mouse-edit-presentation", mouseEditPresentationText(presentation));
  setDebugText("debug-mouse-edit-markers", editDiagnosticMarkerText());
  setDebugText("debug-mouse-edit-pipeline", mouseEditPipelineText());
  setDebugText("debug-live-profile", formatHanaLivePathSummary(livePathProfiler.summarize()));
  setDebugText("debug-lifecycle", lifecycleText());
  setDebugText("debug-recovery", recoveryStatusText);
  setDebugText("debug-view", `${viewportMode} · ${directions[selectedViewport]} · auto ${autoRotateEnabled ? "on" : "off"}`);
  setDebugText("debug-finalization", finalizationText());
  setDebugText("debug-thickness", thickness.toFixed(2));
  workspace.dataset.materialSampleCount = String(displayedMaterialSamples().length);
  workspace.dataset.surfaceState = state;
  workspace.dataset.surfaceTriangleCount = String(previewSurface?.triangles.length ?? 0);
  workspace.dataset.surfaceBuildMilliseconds = surfaceBuildMilliseconds === null ? "" : String(surfaceBuildMilliseconds);
  workspace.dataset.surfacePreviewBuildCount = String(surfacePreviewBuildCount);
  workspace.dataset.surfacePreviewLastStart = surfacePreviewLastStartMilliseconds === null ? "" : String(surfacePreviewLastStartMilliseconds);
  workspace.dataset.surfacePreviewLastEnd = surfacePreviewLastEndMilliseconds === null ? "" : String(surfacePreviewLastEndMilliseconds);
  workspace.dataset.surfacePointerEnd = surfacePointerEndMilliseconds === null ? "" : String(surfacePointerEndMilliseconds);
  workspace.dataset.surfacePreviewBuildMin = previewStats === null ? "" : String(previewStats.min);
  workspace.dataset.surfacePreviewBuildMedian = previewStats === null ? "" : String(previewStats.median);
  workspace.dataset.surfacePreviewBuildMax = previewStats === null ? "" : String(previewStats.max);
  workspace.dataset.materialProxyFrameCount = String(materialProxyFrameCount);
  workspace.dataset.materialProxySegmentCount = workspace.dataset.materialProxySegmentCount ?? "0";
  workspace.dataset.materialProxyUpdateMedian = proxyUpdateStats === null ? "" : String(proxyUpdateStats.median);
  workspace.dataset.materialProxyRenderMedian = proxyRenderStats === null ? "" : String(proxyRenderStats.median);
  workspace.dataset.surfaceDiagnostics = surfaceDiagnosticsText(surfaceDiagnostics);
  workspace.dataset.pointerupStages = pointerupStagesText(lastPointerupStageTimings);
  workspace.dataset.mouseEditStages = mouseEditStagesText();
  workspace.dataset.mouseEditE2e = mouseEditLatencyText();
  workspace.dataset.mouseEditPointerMoveCount = String(mouseEditPointerMoveCount);
  workspace.dataset.mouseEditPreviewFrameCount = String(mouseEditPreviewFrameCount);
  workspace.dataset.mouseEditDroppedPointerMoves = String(mouseEditDroppedPointerMoves);
  workspace.dataset.mouseEditPendingRaf = String(editPreviewMaterialProxyFrame === null ? 0 : 1);
  workspace.dataset.mouseEditOldestPointerAge = String(mouseEditOldestPointerAge);
  workspace.dataset.mouseEditLastEventTimestamp = mouseEditLastEventTimestamp === null ? "" : String(mouseEditLastEventTimestamp);
  workspace.dataset.mouseEditLastHandlerStart = mouseEditLastHandlerStart === null ? "" : String(mouseEditLastHandlerStart);
  workspace.dataset.mouseEditLastHandlerEnd = mouseEditLastHandlerEnd === null ? "" : String(mouseEditLastHandlerEnd);
  workspace.dataset.mouseEditLastLatestStateUpdated = mouseEditLastLatestStateUpdated === null ? "" : String(mouseEditLastLatestStateUpdated);
  workspace.dataset.mouseEditLastRafStart = mouseEditLastRafStart === null ? "" : String(mouseEditLastRafStart);
  workspace.dataset.mouseEditLastPreviewUpdateEnd = mouseEditLastPreviewUpdateEnd === null ? "" : String(mouseEditLastPreviewUpdateEnd);
  workspace.dataset.mouseEditLastRenderSubmission = mouseEditLastRenderSubmission === null ? "" : String(mouseEditLastRenderSubmission);
  workspace.dataset.mouseEditResourceStats = JSON.stringify(resources);
  workspace.dataset.mouseEditCacheStats = mouseEditCacheText();
  workspace.dataset.mouseEditSessionCount = String(mouseEditSessionNumber);
  workspace.dataset.mouseEditSessionHistory = JSON.stringify(mouseEditSessionHistory);
  workspace.dataset.mouseEditPreviewRejectCount = String(mouseEditPreviewRejectCount);
  workspace.dataset.mouseEditPreviewRejectReason = mouseEditLastPreviewRejectReason;
  workspace.dataset.mouseEditGeometry = JSON.stringify(geometry);
  workspace.dataset.mouseEditRenderStats = JSON.stringify(renderStats);
  workspace.dataset.mouseEditPresentationMode = editPresentationMode;
  workspace.dataset.mouseEditPresentation = JSON.stringify(presentation);
  workspace.dataset.mouseEditDiagnosticMarkersEnabled = String(editMarkersEnabled);
  workspace.dataset.mouseEditDiagnosticMarkers = JSON.stringify(editDiagnosticSnapshot());
  workspace.dataset.mouseEditProxyMode = editProxyMode;
  workspace.dataset.mouseEditPipeline = JSON.stringify(mouseEditPipelineFrames[mouseEditPipelineFrames.length - 1] ?? null);
  workspace.dataset.finalProfile = finalProfile;
  workspace.dataset.documentRevision = String(documentRevision);
  workspace.dataset.finalRequestId = String(finalRequestId);
  workspace.dataset.finalGenerationId = String(finalGenerationId);
  workspace.dataset.lastCompletedGenerationId = String(lastCompletedGenerationId);
  workspace.dataset.lastAppliedGenerationId = String(lastAppliedGenerationId);
  workspace.dataset.finalizationState = finalizationState;
  workspace.dataset.finalizeReason = finalizeReason;
  workspace.dataset.finalization = JSON.stringify({
    state: finalizationState,
    active: activeFinalization,
    history: finalizationHistory,
  });
  workspace.dataset.fieldQueryCount = surfaceFieldEvaluationStats === null ? "" : String(surfaceFieldEvaluationStats.queryCount);
  workspace.dataset.fieldCandidateEvaluationCount = surfaceFieldEvaluationStats === null ? "" : String(surfaceFieldEvaluationStats.candidateEvaluationCount);
  workspace.dataset.fieldMaxCandidateCount = surfaceFieldEvaluationStats === null ? "" : String(surfaceFieldEvaluationStats.maxCandidateCount);
  workspace.dataset.longTaskOver16Count = String(longTaskDurations.filter((duration) => duration > 16).length);
  workspace.dataset.longTaskOver33Count = String(longTaskDurations.filter((duration) => duration > 33).length);
  workspace.dataset.longTaskOver50Count = String(longTaskDurations.filter((duration) => duration > 50).length);
  workspace.dataset.livePathProfile = JSON.stringify(livePathProfiler.summarize());
  workspace.dataset.lifecycle = lifecycleText();
  workspace.dataset.recoveryStatus = recoveryStatusText;
  workspace.dataset.autoRotate = String(autoRotateEnabled);
}

function refreshMaterialSamples(
  source = activeStroke ? provisionalStroke3D : stroke3D,
  timings: HanaPointerupStageTimings | null = null,
  finalization: HanaFinalizationTrace | null = null,
): { smoothMilliseconds: number; materialMilliseconds: number } {
  const smoothStarted = performance.now();
  const centerline = source ? sampleSmoothCenterline(source) : [];
  const smoothReady = performance.now();
  if (timings) timings.smoothCenterline = smoothReady - smoothStarted;
  if (finalization) {
    finalization.timestamps.tSmoothReady = smoothReady;
    setFinalizationStage(finalization, "smoothCenterline", smoothReady - smoothStarted);
  }
  if (source === stroke3D) authoritativeCenterline = centerline;
  if (source === provisionalStroke3D) provisionalCenterline = centerline;
  if (!source) provisionalCenterline = [];
  const materialStarted = performance.now();
  materialSamples = source
    ? source === provisionalStroke3D && activeStroke
      ? sampleMaterialSamplesForPreview(centerline, thickness, SURFACE_PREVIEW_MAX_SAMPLES)
      : sampleMaterialSamples(centerline, thickness)
    : [];
  const materialEnded = performance.now();
  if (timings) {
    timings.materialSamples = materialEnded - materialStarted;
    timings.smoothCount = centerline.length;
    timings.materialCount = materialSamples.length;
  }
  if (finalization) {
    const materialReady = materialEnded;
    finalization.timestamps.tMaterialReady = materialReady;
    setFinalizationStage(finalization, "materialSamples", materialReady - materialStarted);
  }
  updateSurfaceUI();
  return {
    smoothMilliseconds: smoothReady - smoothStarted,
    materialMilliseconds: materialEnded - materialStarted,
  };
}

function projectGesturePointToWorld(active: ActiveStroke, point: HanaStrokePoint) {
  if (active.stroke.viewDirection === "axome") throw new Error("Axome Draw is outside HANA-1C");
  const world = renderer.pointOnViewPlane(
    active.rect.index,
    active.rect.x + point.x,
    active.rect.y + point.y,
    active.rect,
    active.stroke.viewDirection,
    0,
  );
  if (!world) throw new Error(`Could not project ${active.stroke.viewDirection} gesture onto its initial plane`);
  return world;
}

function updateProvisionalStroke(): { controlMilliseconds: number; smoothMilliseconds: number; materialMilliseconds: number } {
  const active = activeStroke;
  if (!active || !liveWorkingPath || active.stroke.points.length < 2) {
    provisionalStroke3D = null;
    const refresh = refreshMaterialSamples(null);
    return { controlMilliseconds: 0, ...refresh };
  }
  const controlStarted = performance.now();
  provisionalStroke3D = deriveStroke3DFromSamples(
    active.stroke,
    liveWorkingStrokeSamples(liveWorkingPath),
    (point) => projectGesturePointToWorld(active, point),
  );
  provisionalStroke3D.curve.smoothness = smoothness;
  const controlMilliseconds = performance.now() - controlStarted;
  const refresh = refreshMaterialSamples(provisionalStroke3D);
  return { controlMilliseconds, ...refresh };
}

function updateDebug(
  point: HanaStrokePoint | null = null,
  pointerType: HanaPointerType | null = null,
  stroke: HanaViewportStroke | null = null,
): void {
  const selected = selectedControlPoint === null ? null : stroke3D?.controlPoints[selectedControlPoint] ?? null;
  selectionStatusElement.textContent = selected
    ? `Control ${selectedControlPoint! + 1}`
    : stroke3D ? "Stroke" : "None";
  const visibleStroke = displayedStroke();
  const visibleCenterline = displayedCenterline();
  setDebugText("debug-pointer", pointerType ?? rawGestures[0]?.pointerType ?? "—");
  setDebugText("debug-pressure", point ? point.pressure.toFixed(4) : "0.0000");
  setDebugText("debug-position", point ? `${point.x.toFixed(1)} / ${point.y.toFixed(1)}` : "— / —");
  setDebugText("debug-viewport", skinViewDirectionLabel(directions[selectedViewport]));
  setDebugText("debug-points", String(stroke?.points.length ?? rawGestures[0]?.points.length ?? 0));
  setDebugText("debug-raw-capture", rawCaptureText());
  setDebugText("debug-controls", String(visibleStroke?.controlPoints.length ?? 0));
  setDebugText("debug-control-fit", lastAdaptiveControlFit
    ? `${lastAdaptiveControlFit.indices.length} · tol ${lastAdaptiveControlFit.tolerance.toFixed(3)} · max C/S ${lastAdaptiveControlFit.maxControlDeviation.toFixed(3)}/${lastAdaptiveControlFit.maxSmoothDeviation.toFixed(3)}`
    : "—");
  setDebugText("debug-smooth", String(visibleCenterline.length));
  setDebugText("debug-soft", `${softEditStrength.toUpperCase()} / ${lastAffectedControlIndices.length}`);
  setDebugText("debug-xyz", selected
    ? `${selected.position.x.toFixed(3)}, ${selected.position.y.toFixed(3)}, ${selected.position.z.toFixed(3)}`
    : "—");
  const activePressure = activeStroke && stroke === activeStroke.stroke
    ? {
      min: activeStroke.pressureMin,
      max: activeStroke.pressureMax,
      distinct: activeStroke.pressures.size,
    }
    : null;
  const stats = activePressure ?? pressureStats(stroke ?? rawGestures[0] ?? null);
  setDebugText("debug-range", stats ? `${stats.min.toFixed(4)}–${stats.max.toFixed(4)} · ${stats.distinct}` : "—");
  setDebugText("input-state", activeStroke
    ? "RECORDING · camera input is disabled"
    : controlDrag ? `EDITING · control ${controlDrag.controlIndex + 1} · Raw Gesture locked`
      : stateMessage);
  workspace.dataset.rawGestureCount = String(rawGestures.length);
  workspace.dataset.rawPointCount = String(rawGestures[0]?.points.length ?? 0);
  workspace.dataset.stroke3dCount = String(stroke3D ? 1 : 0);
  workspace.dataset.controlPointCount = String(visibleStroke?.controlPoints.length ?? 0);
  workspace.dataset.smoothPointCount = String(visibleCenterline.length);
  workspace.dataset.softEditStrength = softEditStrength;
  workspace.dataset.lastAffectedCount = String(lastAffectedControlIndices.length);
  workspace.dataset.lastAffectedIndices = lastAffectedControlIndices.join(",");
  workspace.dataset.lastEditBoundsBefore = boundsSignature(lastEditBoundsBefore);
  workspace.dataset.lastEditBoundsAfter = boundsSignature(lastEditBoundsAfter);
  workspace.dataset.selectedControlPoint = selectedControlPoint === null ? "" : String(selectedControlPoint);
  workspace.dataset.selectedXyz = selected
    ? `${selected.position.x},${selected.position.y},${selected.position.z}`
    : "";
  workspace.dataset.rawSignature = rawSignature();
  workspace.dataset.adaptiveControlCount = lastAdaptiveControlFit === null
    ? ""
    : String(lastAdaptiveControlFit.indices.length);
  workspace.dataset.adaptiveControlTolerance = lastAdaptiveControlFit === null
    ? ""
    : String(lastAdaptiveControlFit.tolerance);
  workspace.dataset.adaptiveControlInitialCount = lastAdaptiveControlFit === null
    ? ""
    : String(lastAdaptiveControlFit.initialControlCount);
  workspace.dataset.adaptiveControlRefinementIterations = lastAdaptiveControlFit === null
    ? ""
    : String(lastAdaptiveControlFit.refinementIterations);
  workspace.dataset.adaptiveControlMaxDeviation = lastAdaptiveControlFit === null
    ? ""
    : String(lastAdaptiveControlFit.maxControlDeviation);
  workspace.dataset.adaptiveSmoothMaxDeviation = lastAdaptiveControlFit === null
    ? ""
    : String(lastAdaptiveControlFit.maxSmoothDeviation);
  workspace.dataset.adaptiveSmoothToleranceMet = lastAdaptiveControlFit === null
    ? ""
    : String(lastAdaptiveControlFit.smoothToleranceMet);
  updateSurfaceUI();
}

function drawRawGesture(stroke: HanaViewportStroke, rect: SkinViewportRect): void {
  if (stroke.points.length === 0) return;
  const scaleX = rect.width / Math.max(1, stroke.viewportSize.width);
  const scaleY = rect.height / Math.max(1, stroke.viewportSize.height);
  const position = (point: HanaStrokePoint) => ({ x: rect.x + point.x * scaleX, y: rect.y + point.y * scaleY });
  gestureContext.strokeStyle = "rgba(17, 24, 39, 0.18)";
  gestureContext.fillStyle = "rgba(17, 24, 39, 0.18)";
  const first = stroke.points[0];
  const firstPosition = position(first);
  gestureContext.beginPath();
  gestureContext.arc(firstPosition.x, firstPosition.y, 1, 0, Math.PI * 2);
  gestureContext.fill();
  const sameRect = activeRawPathRect
    && activeRawPathRect.index === rect.index
    && activeRawPathRect.x === rect.x
    && activeRawPathRect.y === rect.y
    && activeRawPathRect.width === rect.width
    && activeRawPathRect.height === rect.height;
  if (activeRawPathStroke !== stroke || !sameRect || !activeRawPath) {
    activeRawPath = new Path2D();
    activeRawPath.moveTo(firstPosition.x, firstPosition.y);
    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = position(stroke.points[index]);
      activeRawPath.lineTo(point.x, point.y);
    }
    activeRawPathStroke = stroke;
    activeRawPathRect = { ...rect };
  }
  gestureContext.lineWidth = 1.5;
  gestureContext.stroke(activeRawPath);
}

function drawSharedStroke(rect: SkinViewportRect): void {
  const visibleStroke = displayedStroke();
  if (!visibleStroke || visibleStroke.controlPoints.length === 0) return;
  const color = editorStrokeColor(visibleStroke.id);
  const smooth = displayedCenterline();
  const smoothProjected = smooth.map((point) => renderer.projectPoint(rect.index, point.position, rect));
  const controlProjected = visibleStroke.controlPoints.map((point) => renderer.projectPoint(rect.index, point.position, rect));
  if (showCenterline) {
    gestureContext.strokeStyle = color;
    gestureContext.lineWidth = 2.5;
    gestureContext.beginPath();
    gestureContext.moveTo(smoothProjected[0].x, smoothProjected[0].y);
    for (let index = 1; index < smoothProjected.length; index += 1) {
      gestureContext.lineTo(smoothProjected[index].x, smoothProjected[index].y);
    }
    gestureContext.stroke();
  }
  if (showSamples) {
    gestureContext.fillStyle = "#f59e0b";
    gestureContext.strokeStyle = "#ffffff";
    gestureContext.lineWidth = 1;
    for (const sample of displayedMaterialSamples()) {
      const point = renderer.projectPoint(rect.index, sample.position, rect);
      gestureContext.beginPath();
      gestureContext.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
      gestureContext.fill();
      gestureContext.stroke();
    }
  }
  if (directions[rect.index] === "axome" || interactionModes[rect.index] !== "edit") return;

  gestureContext.strokeStyle = `${color}38`;
  gestureContext.lineWidth = 1;
  gestureContext.beginPath();
  gestureContext.moveTo(controlProjected[0].x, controlProjected[0].y);
  for (let index = 1; index < controlProjected.length; index += 1) {
    gestureContext.lineTo(controlProjected[index].x, controlProjected[index].y);
  }
  gestureContext.stroke();

  for (let index = 0; index < controlProjected.length; index += 1) {
    const point = controlProjected[index];
    const selected = index === selectedControlPoint;
    gestureContext.beginPath();
    gestureContext.arc(point.x, point.y, selected ? 5.5 : 3.5, 0, Math.PI * 2);
    gestureContext.fillStyle = selected ? color : "#ffffff";
    gestureContext.fill();
    gestureContext.strokeStyle = selected ? "#ffffff" : color;
    gestureContext.lineWidth = selected ? 2 : 1.25;
    gestureContext.stroke();
  }
}

function redrawOverlay(): void {
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  gestureContext.setTransform(gesturePixelRatio, 0, 0, gesturePixelRatio, 0, 0);
  gestureContext.clearRect(0, 0, width, height);
  gestureContext.lineCap = "round";
  gestureContext.lineJoin = "round";
  for (const rect of currentRects()) {
    gestureContext.save();
    gestureContext.beginPath();
    gestureContext.rect(rect.x, rect.y, rect.width, rect.height);
    gestureContext.clip();
    const source = rawGestures[0];
    if (source?.viewportId === viewportId(rect.index)) drawRawGesture(source, rect);
    drawSharedStroke(rect);
    gestureContext.restore();
  }
}

function modeOptions(index: number): readonly HanaInteractionMode[] {
  return directions[index] === "axome" ? ["view"] : ["draw", "edit"];
}

function renderViewportChrome(): void {
  chrome.textContent = "";
  for (const rect of currentRects()) {
    const direction = directions[rect.index];
    const pane = document.createElement("section");
    pane.className = `hana-viewport-pane${rect.index === selectedViewport ? " is-selected" : ""}`;
    pane.style.left = `${rect.x}px`;
    pane.style.top = `${rect.y}px`;
    pane.style.width = `${rect.width}px`;
    pane.style.height = `${rect.height}px`;
    pane.dataset.viewportId = viewportId(rect.index);
    const identity = document.createElement("div");
    identity.className = "hana-view-identity";
    identity.innerHTML = `<strong>${skinViewDirectionLabel(direction)}</strong><span>${skinViewAxisLegend(direction)}</span>`;
    pane.appendChild(identity);
    const modes = document.createElement("div");
    modes.className = "hana-mode-switch";
    modes.setAttribute("aria-label", `${skinViewDirectionLabel(direction)} interaction mode`);
    for (const mode of modeOptions(rect.index)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = mode[0].toUpperCase() + mode.slice(1);
      button.dataset.viewportIndex = String(rect.index);
      button.dataset.interactionMode = mode;
      button.setAttribute("aria-pressed", String(interactionModes[rect.index] === mode));
      button.disabled = mode === "draw" && stroke3D !== null;
      if (button.disabled) button.title = "HANA-1C supports one Stroke. Clear before drawing another.";
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", () => {
        interactionModes[rect.index] = mode;
        selectedViewport = rect.index;
        selectedControlPoint = null;
        stateMessage = mode === "draw"
          ? `DRAW · ${skinViewDirectionLabel(direction)} creates a new Stroke3D`
          : `EDIT · Soft ${softEditStrength.toUpperCase()} · drag a control point`;
        refreshLayout();
        updateDebug();
      });
      modes.appendChild(button);
    }
    pane.appendChild(modes);
    if (interactionModes[rect.index] === "draw" && !stroke3D) {
      const hint = document.createElement("span");
      hint.className = "hana-draw-hint";
      hint.textContent = "DRAW ONE STROKE";
      pane.appendChild(hint);
    }
    chrome.appendChild(pane);
  }
}

function updateSplitters(): void {
  const visible = viewportMode === "four";
  splitterX.hidden = !visible;
  splitterY.hidden = !visible;
  if (!visible) return;
  splitterX.style.left = `${workspace.clientWidth * split.x}px`;
  splitterY.style.top = `${workspace.clientHeight * split.y}px`;
  splitterX.setAttribute("aria-valuenow", String(Math.round(split.x * 100)));
  splitterY.setAttribute("aria-valuenow", String(Math.round(split.y * 100)));
}

function updateLayoutButtons(): void {
  layoutFourButton.setAttribute("aria-pressed", String(viewportMode === "four"));
  layoutOneButton.setAttribute("aria-pressed", String(viewportMode === "one"));
}

function updateSoftEditButtons(): void {
  for (const button of softEditButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.softEdit === softEditStrength));
  }
}

function renderScene(): void {
  const diagnosticFinalProxy = (finalProfile === "skip" || finalProfile === "cpu-only")
    && activeFinalization?.status === (finalProfile === "skip" ? "skipped" : "completed");
  const finalizationPending = activeFinalization?.status === "pending"
    && activeFinalization.finalProfile === "normal";
  renderer.setPreviewSurfaceVisible(showSurface && !diagnosticFinalProxy && !finalizationPending && (controlDrag === null || !hideFinalSurfaceDuringEdit));
  renderer.setMaterialProxyVisible(showSurface && (activeStroke !== null || controlDrag !== null || finalizationPending || diagnosticFinalProxy));
  renderer.render(currentRects(), selectedViewport);
}

function refreshLayout(): void {
  renderScene();
  redrawOverlay();
  renderViewportChrome();
  updateSplitters();
  updateLayoutButtons();
  updateSoftEditButtons();
  updateSurfaceUI();
}

function resize(): void {
  const width = Math.max(1, workspace.clientWidth);
  const height = Math.max(1, workspace.clientHeight);
  gesturePixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  gestureCanvas.width = Math.round(width * gesturePixelRatio);
  gestureCanvas.height = Math.round(height * gesturePixelRatio);
  renderer.resize(width, height);
  refreshLayout();
}

function pointFromSample(sample: HanaPointerSampleLike, active: ActiveStroke): HanaStrokePoint {
  const bounds = gestureCanvas.getBoundingClientRect();
  return {
    x: sample.clientX - bounds.left - active.rect.x,
    y: sample.clientY - bounds.top - active.rect.y,
    pressure: sample.pressure,
    time: Math.max(0, sample.timeStamp - active.startTime),
  };
}

function previewBuildDurationStats(): { min: number; median: number; max: number } | null {
  return durationStats(surfacePreviewBuildDurations);
}

function appendSamples(event: PointerEvent): void {
  if (!activeStroke || event.pointerId !== activeStroke.pointerId) return;
  const rawStarted = performance.now();
  const coalesced = event.getCoalescedEvents?.() ?? [];
  const candidates = collectPointerEventSamples(event, coalesced);
  const deduplicated = dedupeExactPointerSamples(candidates, activeStroke.lastCapturedInputSample);
  activeStroke.lastCapturedInputSample = deduplicated.lastCaptured;
  activeStroke.suppressedExactDuplicateCount += deduplicated.suppressedExactDuplicateCount;
  let latest: HanaStrokePoint | null = null;
  for (const candidate of deduplicated.accepted) {
    const sample = candidate.event;
    latest = pointFromSample(sample, activeStroke);
    activeStroke.stroke.points.push(latest);
    appendRawSignaturePoint(latest);
    activeStroke.pressureMin = Math.min(activeStroke.pressureMin, latest.pressure);
    activeStroke.pressureMax = Math.max(activeStroke.pressureMax, latest.pressure);
    activeStroke.pressures.add(latest.pressure);
    if (candidate.source === "parent-pointer-event") activeStroke.captureSourceCounts.parentPointerEvent += 1;
    else activeStroke.captureSourceCounts.coalescedEvent += 1;
    if (activeRawPath) {
      const scaleX = activeStroke.rect.width / Math.max(1, activeStroke.stroke.viewportSize.width);
      const scaleY = activeStroke.rect.height / Math.max(1, activeStroke.stroke.viewportSize.height);
      activeRawPath.lineTo(
        activeStroke.rect.x + latest.x * scaleX,
        activeStroke.rect.y + latest.y * scaleY,
      );
    }
    if (!liveWorkingPath) {
      liveWorkingPath = createLiveWorkingPath(
        latest,
        projectGesturePointToWorld(activeStroke, latest),
        activeStroke.stroke.points.length - 1,
      );
    } else {
      appendLiveWorkingPoint(
        liveWorkingPath,
        latest,
        projectGesturePointToWorld(activeStroke, latest),
        activeStroke.stroke.points.length - 1,
      );
    }
  }
  const rawEnded = performance.now();
  liveLastEventTimestamp = eventTimestampForPerformance(event.timeStamp, rawEnded);
  livePathProfiler.record({
    kind: "event",
    eventTimestamp: liveLastEventTimestamp,
    stages: { rawAppend: rawEnded - rawStarted },
  });
  scheduleMaterialProxyFrame();
  redrawOverlay();
  if (latest) updateDebug(latest, activeStroke.stroke.pointerType, activeStroke.stroke);
}

function startStroke(event: PointerEvent, rect: SkinViewportRect): void {
  if (!event.isPrimary || activeStroke || cameraDrag || controlDrag || stroke3D) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const direction = directions[rect.index];
  if (direction === "axome") return;
  event.preventDefault();
  stopAutoRotate();
  markFinalizationEditing("draw");
  gestureCanvas.setPointerCapture(event.pointerId);
  const stroke: HanaViewportStroke = {
    id: "gesture-1",
    viewportId: viewportId(rect.index),
    viewDirection: direction,
    pointerType: pointerTypeFromBrowser(event.pointerType),
    viewportSize: { width: rect.width, height: rect.height },
    points: [],
  };
  rawGestures.push(stroke);
  rawPressureTotal = 0;
  rawTimeTotal = 0;
  activeStroke = {
    pointerId: event.pointerId,
    startTime: event.timeStamp,
    stroke,
    rect: { ...rect },
    pressureMin: event.pressure,
    pressureMax: event.pressure,
    pressures: new Set([event.pressure]),
    lastCapturedInputSample: event,
    captureSourceCounts: { parentPointerEvent: 1, coalescedEvent: 0 },
    suppressedExactDuplicateCount: 0,
  };
  lastRawCaptureDiagnostics = null;
  provisionalStroke3D = null;
  provisionalCenterline = [];
  materialSamples = [];
  workspace.dataset.materialProxySegmentCount = "0";
  surfacePointerEndMilliseconds = null;
  livePathProfiler.reset();
  liveLastEventTimestamp = null;
  renderer.setMaterialProxy(null);
  const point = pointFromSample(event, activeStroke);
  stroke.points.push(point);
  appendRawSignaturePoint(point);
  const scaleX = rect.width / Math.max(1, stroke.viewportSize.width);
  const scaleY = rect.height / Math.max(1, stroke.viewportSize.height);
  activeRawPath = new Path2D();
  activeRawPath.moveTo(rect.x + point.x * scaleX, rect.y + point.y * scaleY);
  activeRawPathStroke = stroke;
  activeRawPathRect = { ...rect };
  liveWorkingPath = createLiveWorkingPath(
    point,
    projectGesturePointToWorld(activeStroke, point),
    0,
  );
  redrawOverlay();
  renderViewportChrome();
  updateDebug(point, stroke.pointerType, stroke);
}

function finishStroke(): void {
  if (!activeStroke) return;
  const pointerupStarted = performance.now();
  cancelSurfacePreviewTimer();
  cancelMaterialProxyFrame();
  const finished = activeStroke;
  lastRawCaptureDiagnostics = summarizeRawGestureCapture(
    finished.stroke.points,
    finished.captureSourceCounts,
    finished.suppressedExactDuplicateCount,
  );
  const direction = finished.stroke.viewDirection;
  if (direction === "axome") throw new Error("Axome Draw is outside HANA-1C");
  const pointToWorld = (point: HanaStrokePoint) => projectGesturePointToWorld(finished, point);
  const timings: HanaPointerupStageTimings = {
    rawFinalization: 0,
    adaptiveControlFitting: 0,
    overshootSubdivision: 0,
    smoothCenterline: 0,
    materialSamples: 0,
    effectiveResolution: 0,
    fieldPreparation: 0,
    meshGeneration: 0,
    componentValidation: 0,
    gpuUpload: 0,
    total: 0,
    rawCount: finished.stroke.points.length,
    controlCount: 0,
    initialControlCount: 0,
    overshootControlCount: 0,
    smoothCount: 0,
    materialCount: 0,
    effectiveResolutionValue: 0,
    triangleCount: 0,
    componentCount: 0,
    fieldQueryCount: 0,
    fieldCandidateEvaluationCount: 0,
    fieldMaxCandidateCount: 0,
  };
  const fitStarted = performance.now();
  lastAdaptiveControlFit = fitAdaptiveControlIndices(finished.stroke, pointToWorld, {
    tolerance: HANA_ADAPTIVE_CONTROL_TOLERANCE,
    smoothness,
    maxControlPoints: HANA_ADAPTIVE_CONTROL_MAX_POINTS,
  });
  timings.adaptiveControlFitting = performance.now() - fitStarted;
  timings.overshootSubdivision = lastAdaptiveControlFit.refinementMilliseconds;
  timings.initialControlCount = lastAdaptiveControlFit.initialControlCount;
  timings.overshootControlCount = lastAdaptiveControlFit.refinementIterations;
  const rawFinalizationStarted = performance.now();
  stroke3D = deriveStroke3DFromRawIndices(finished.stroke, pointToWorld, lastAdaptiveControlFit.indices);
  timings.rawFinalization = performance.now() - rawFinalizationStarted;
  stroke3D.curve.smoothness = smoothness;
  timings.controlCount = stroke3D.controlPoints.length;
  provisionalStroke3D = null;
  activeStroke = null;
  liveWorkingPath = null;
  pendingPointerupStageTimings = timings;
  const finalization = showSurface && materialSamples.length > 0
    ? beginAuthoritativeFinalization("draw-pointerup", pointerupStarted)
    : null;
  if (finalization) finalization.timestamps.tProxyFrozen = performance.now();
  if (!finalization) renderer.setMaterialProxy(null);
  refreshMaterialSamples(stroke3D, timings, finalization);
  interactionModes[0] = "edit";
  interactionModes[2] = "edit";
  interactionModes[3] = "edit";
  selectedControlPoint = Math.floor(stroke3D.controlPoints.length / 2);
  lastAffectedControlIndices = [];
  lastEditBoundsBefore = null;
  lastEditBoundsAfter = null;
  stateMessage = `SMOOTH CENTERLINE READY · ${stroke3D.controlPoints.length} controls · ${sampleSmoothCenterline(stroke3D).length} samples`;
  refreshLayout();
  if (finalization) {
    runAuthoritativeFinalization(finalization);
  } else finalizationState = "IDLE";
  timings.total = performance.now() - pointerupStarted;
  lastPointerupStageTimings = timings;
  pendingPointerupStageTimings = null;
  updateDebug(
    finished.stroke.points[finished.stroke.points.length - 1] ?? null,
    finished.stroke.pointerType,
    finished.stroke,
  );
  scheduleRecoveryCheckpoint("draw");
}

function nearestControlIndex(rect: SkinViewportRect, x: number, y: number): number | null {
  if (!stroke3D) return null;
  let bestIndex: number | null = null;
  let bestDistance = 12;
  stroke3D.controlPoints.forEach((point, index) => {
    const projected = renderer.projectPoint(rect.index, point.position, rect);
    if (!projected.visible) return;
    const distance = Math.hypot(projected.x - x, projected.y - y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function nearestEditableControlIndex(rect: SkinViewportRect, x: number, y: number): number | null {
  const direct = nearestControlIndex(rect, x, y);
  if (direct !== null || !stroke3D || (!showCenterline && !showSamples && !showSurface)) return direct;
  const centerline = authoritativeCenterline.length > 1
    ? authoritativeCenterline
    : sampleSmoothCenterline(stroke3D);
  if (centerline.length < 2) return direct;
  let bestIndex = 0;
  let bestDistance = Infinity;
  centerline.forEach((sample, index) => {
    const projected = renderer.projectPoint(rect.index, sample.position, rect);
    if (!projected.visible) return;
    const distance = Math.hypot(projected.x - x, projected.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  const direction = directions[rect.index];
  const nearest = centerline[bestIndex].position;
  const thicknessOffset = { ...nearest };
  if (direction === "front") thicknessOffset.x += thickness;
  else if (direction === "right") thicknessOffset.y += thickness;
  else if (direction === "top") thicknessOffset.x += thickness;
  const projectedThickness = renderer.projectPoint(rect.index, thicknessOffset, rect);
  const projectedNearest = renderer.projectPoint(rect.index, nearest, rect);
  const surfaceRadiusPixels = showSurface && previewSurface
    ? Math.hypot(projectedThickness.x - projectedNearest.x, projectedThickness.y - projectedNearest.y) + 8
    : 12;
  if (bestDistance > Math.max(12, surfaceRadiusPixels)) return direct;
  const targetSourceT = centerline[bestIndex].sourceT;
  let nearestControl = 0;
  let nearestSourceDistance = Number.POSITIVE_INFINITY;
  stroke3D.controlPoints.forEach((control, index) => {
    const sourceDistance = Math.abs(control.provenance.sourceT - targetSourceT);
    if (sourceDistance < nearestSourceDistance) {
      nearestSourceDistance = sourceDistance;
      nearestControl = index;
    }
  });
  return nearestControl;
}

function updateEditPreview(): EditPreviewPipelineTiming & { smoothMilliseconds: number; previewMilliseconds: number } {
  if (!stroke3D) {
    editPreviewStroke3D = null;
    editPreviewCenterline = [];
    editPreviewMaterialSamples = [];
    return {
      boundedControl: { start: null, end: null },
      smoothCenterline: { start: null, end: null },
      materialSamples: { start: null, end: null },
      smoothMilliseconds: 0,
      previewMilliseconds: 0,
    };
  }
  const boundedStarted = performance.now();
  const previewStroke = createBoundedStrokePreview(
    stroke3D,
    HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS,
  );
  const boundedEnded = performance.now();
  const smoothStarted = performance.now();
  const centerline = sampleSmoothCenterline(previewStroke);
  const smoothEnded = performance.now();
  const previewStarted = performance.now();
  const samples = sampleMaterialSamplesForPreview(
    centerline,
    thickness,
    SURFACE_PREVIEW_MAX_SAMPLES,
  );
  const previewEnded = performance.now();
  editPreviewStroke3D = previewStroke;
  editPreviewCenterline = centerline;
  editPreviewMaterialSamples = samples;
  return {
    boundedControl: { start: boundedStarted, end: boundedEnded },
    smoothCenterline: { start: smoothStarted, end: smoothEnded },
    materialSamples: { start: previewStarted, end: previewEnded },
    smoothMilliseconds: smoothEnded - smoothStarted,
    previewMilliseconds: previewEnded - previewStarted,
  };
}

function cancelSurfacePreviewTimer(): void {
  if (surfacePreviewTimer === null) return;
  window.clearTimeout(surfacePreviewTimer);
  surfacePreviewTimer = null;
}

function cancelMaterialProxyFrame(): void {
  if (materialProxyFrame === null) return;
  window.cancelAnimationFrame(materialProxyFrame);
  materialProxyFrame = null;
}

function cancelEditPreviewFrame(): void {
  if (editPreviewMaterialProxyFrame === null) return;
  window.cancelAnimationFrame(editPreviewMaterialProxyFrame);
  editPreviewMaterialProxyFrame = null;
}

function scheduleMaterialProxyFrame(): void {
  const centerline = activeStroke ? provisionalCenterline : editPreviewCenterline;
  const isPreviewActive = activeStroke !== null || controlDrag !== null;
  const isEditPreviewOnly = !showSurface && controlDrag !== null;
  const directEditPreview = editProxyMode === "direct" && controlDrag !== null;
  const livePathPending = activeStroke !== null && liveWorkingPath !== null;
  if ((!showSurface && !isEditPreviewOnly) || !isPreviewActive || (!directEditPreview && centerline.length < 2 && !livePathPending)) {
    cancelMaterialProxyFrame();
    cancelEditPreviewFrame();
    renderer.setMaterialProxy(null);
    return;
  }
  const frameRef = activeStroke ? "live" : "edit";
  if (frameRef === "live" && materialProxyFrame !== null) return;
  if (frameRef === "edit" && editPreviewMaterialProxyFrame !== null) return;
  const frame = window.requestAnimationFrame(() => {
    if (frameRef === "live") materialProxyFrame = null;
    else editPreviewMaterialProxyFrame = null;
    const rafStarted = performance.now();
    let pendingForFrame: PendingControlPointer | null = null;
    let controlPreviewTiming: ControlPreviewTiming | null = null;
    let liveProcessing: { controlMilliseconds: number; smoothMilliseconds: number; materialMilliseconds: number } | null = null;
    if (frameRef === "live" && activeStroke) {
      liveProcessing = updateProvisionalStroke();
      scheduleSurfacePreview();
    }
    if (frameRef === "edit") {
      pendingForFrame = pendingControlPointer;
      pendingControlPointer = null;
      mouseEditLastRafStart = rafStarted;
      mouseEditPreviewFrameCount += 1;
      mouseEditFirstPreviewTimestamp ??= rafStarted;
      if (mouseEditLastPreviewTimestamp !== null) {
        mouseEditFrameIntervals = [
          ...mouseEditFrameIntervals,
          Math.max(0, rafStarted - mouseEditLastPreviewTimestamp),
        ].slice(-128);
      }
      mouseEditLastPreviewTimestamp = rafStarted;
      if (pendingForFrame) {
        mouseEditRafAgeDurations = [
          ...mouseEditRafAgeDurations,
          Math.max(0, rafStarted - pendingForFrame.eventTimestamp),
        ].slice(-128);
        controlPreviewTiming = processControlDragPointer(pendingForFrame);
      }
    }
    const currentCenterline = activeStroke ? provisionalCenterline : editPreviewCenterline;
    const directEditTarget = frameRef === "edit"
      && editProxyMode === "direct"
      && stroke3D !== null
      && controlDrag !== null;
    if ((!showSurface && !controlDrag) || (!activeStroke && !controlDrag) || (!directEditTarget && currentCenterline.length < 2)) {
      renderer.setMaterialProxy(null);
      renderScene();
      return;
    }
    const proxyUpdateStarted = performance.now();
    const proxySegments: HanaLiveProxySegment[] = showSurface
      ? directEditTarget && stroke3D && controlDrag
        ? [{
          start: { ...stroke3D.controlPoints[controlDrag.controlIndex].position },
          end: { ...stroke3D.controlPoints[controlDrag.controlIndex].position },
          radius: thickness,
        }]
        : sampleLiveProxySegments(
        currentCenterline,
        thickness,
        HANA_LIVE_PROXY_MAX_SEGMENTS,
        )
      : [];
    const proxySegmentsEnded = performance.now();
    const pointerRevision = pendingForFrame?.pointerRevision ?? null;
    const targetRevision = controlPreviewTiming?.pointerRevision ?? null;
    const previewControlRevision = editProxyMode === "direct"
      ? null
      : controlPreviewTiming?.pointerRevision ?? null;
    const previewSmoothRevision = editProxyMode === "direct"
      ? null
      : controlPreviewTiming?.pointerRevision ?? null;
    const previewMaterialRevision = editProxyMode === "direct"
      ? null
      : controlPreviewTiming?.pointerRevision ?? null;
    const proxyRevision = frameRef === "edit"
      ? (controlPreviewTiming?.pointerRevision ?? null)
      : null;
    const renderRevision = proxyRevision;
    const revisionStages = [
      pointerRevision,
      targetRevision,
      previewControlRevision,
      previewSmoothRevision,
      previewMaterialRevision,
      proxyRevision,
      renderRevision,
    ].filter((revision): revision is number => revision !== null);
    const sameRafRevision = revisionStages.length <= 1
      || revisionStages.every((revision) => revision === revisionStages[0]);
    const proxyTransformsStarted = performance.now();
    renderer.setMaterialProxy(proxySegments);
    const proxyTransformsEnded = performance.now();
    if (frameRef === "edit") updateEditDiagnosticFrame(rafStarted, proxySegments);
    const proxyTipEnded = performance.now();
    if (showSurface) {
      materialProxyUpdateDurations = [
        ...materialProxyUpdateDurations,
        performance.now() - proxyUpdateStarted,
      ].slice(-128);
      materialProxyFrameCount += 1;
      workspace.dataset.materialProxyFrameCount = String(materialProxyFrameCount);
      workspace.dataset.materialProxySegmentCount = String(proxySegments.length);
      setDebugText("debug-proxy-segments", String(proxySegments.length));
    }
    const proxyRenderStarted = performance.now();
    renderScene();
    const renderSubmissionEnded = performance.now();
    const renderSubmissionMilliseconds = renderSubmissionEnded - proxyRenderStarted;
    const presentation = renderer.presentationStats();
    if (frameRef === "edit") {
      recordEditDiagnosticWebglFrame(rafStarted, presentation);
      const targetPosition = controlPreviewTiming?.targetPosition
        ?? (stroke3D && controlDrag
          ? { ...stroke3D.controlPoints[controlDrag.controlIndex].position }
          : null);
      const targetScreen = controlPreviewTiming?.targetScreen
        ?? (targetPosition && controlDrag
          ? (() => {
            const projected = renderer.projectPoint(controlDrag.viewportIndex, targetPosition, controlDrag.rect);
            return projected.visible ? { x: projected.x, y: projected.y } : null;
          })()
          : null);
      const pipelineFrame: MouseEditPipelineFrame = {
        session: mouseEditSessionNumber,
        frameNumber: mouseEditPreviewFrameCount,
        pointerRevision,
        targetRevision,
        previewControlRevision,
        previewSmoothRevision,
        previewMaterialRevision,
        proxyRevision,
        renderRevision,
        sameRafRevision,
        rafTimestamp: rafStarted,
        inputTimestamp: pendingForFrame?.eventTimestamp ?? null,
        proxyMode: editProxyMode,
        targetPosition,
        targetScreen,
        targetUpdatedAt: controlPreviewTiming?.targetUpdatedAt ?? null,
        controlUpdate: controlPreviewTiming?.controlUpdate ?? { start: null, end: null },
        boundedControl: controlPreviewTiming?.preview?.boundedControl ?? { start: null, end: null },
        smoothCenterline: controlPreviewTiming?.preview?.smoothCenterline ?? { start: null, end: null },
        materialSamples: controlPreviewTiming?.preview?.materialSamples ?? { start: null, end: null },
        proxySegments: { start: proxyUpdateStarted, end: proxySegmentsEnded },
        proxyTransforms: { start: proxyTransformsStarted, end: proxyTransformsEnded },
        proxyTip: { start: proxyTransformsEnded, end: proxyTipEnded },
        renderSubmission: { start: proxyRenderStarted, end: renderSubmissionEnded },
        targetToProxyTipMilliseconds: controlPreviewTiming?.targetUpdatedAt === undefined
          ? null
          : proxyTipEnded - controlPreviewTiming.targetUpdatedAt,
      };
      mouseEditPipelineFrames = [...mouseEditPipelineFrames, pipelineFrame].slice(-HANA_EDIT_TRACE_CAPACITY);
    }
    if (showSurface) {
      materialProxyRenderDurations = [
        ...materialProxyRenderDurations,
        renderSubmissionMilliseconds,
      ].slice(-128);
    }
    if (frameRef === "edit" && pendingForFrame && controlPreviewTiming) {
      mouseEditOldestPointerAge = Math.max(
        mouseEditOldestPointerAge,
        Math.max(0, rafStarted - pendingForFrame.eventTimestamp),
      );
      mouseEditLastPreviewUpdateEnd = controlPreviewTiming.previewUpdateEnd;
      mouseEditEndToEndLatencies = [
        ...mouseEditEndToEndLatencies,
        Math.max(0, performance.now() - pendingForFrame.eventTimestamp),
      ].slice(-128);
      mouseEditRenderSubmissionDurations = [
        ...mouseEditRenderSubmissionDurations,
        renderSubmissionMilliseconds,
      ].slice(-128);
    }
    if (frameRef === "live") {
      livePathProfiler.record({
        kind: "frame",
        eventTimestamp: liveLastEventTimestamp ?? rafStarted,
        frameTimestamp: rafStarted,
        stages: {
          controlUpdate: liveProcessing?.controlMilliseconds ?? 0,
          smoothUpdate: liveProcessing?.smoothMilliseconds ?? 0,
          materialUpdate: liveProcessing?.materialMilliseconds ?? 0,
          proxyUpdate: proxySegmentsEnded - proxyUpdateStarted,
          gpuUpload: proxyTransformsEnded - proxyTransformsStarted,
          render: renderSubmissionMilliseconds,
          totalUpdate: performance.now() - rafStarted,
        },
      });
    }
    if (frameRef === "edit") mouseEditLastRenderSubmission = performance.now();
    updateSurfaceUI();
    scheduleMaterialProxyFrame();
  });
  if (frameRef === "live") materialProxyFrame = frame;
  else editPreviewMaterialProxyFrame = frame;
}

function scheduleSurfacePreview(): void {
  const livePathWasCompacted = Boolean(
    activeStroke
    && liveWorkingPath
    && liveWorkingPath.spacing > HANA_LIVE_WORKING_INITIAL_SPACING,
  );
  if (
    !showSurface
    || materialSamples.length === 0
    || (activeStroke && materialSamples.length > SURFACE_PREVIEW_MAX_SAMPLES)
    || livePathWasCompacted
    || surfacePreviewTimer !== null
  ) return;
  surfacePreviewTimer = window.setTimeout(() => {
    surfacePreviewTimer = null;
    const previewCompacted = Boolean(
      activeStroke
      && liveWorkingPath
      && liveWorkingPath.spacing > HANA_LIVE_WORKING_INITIAL_SPACING,
    );
    if (activeStroke && !previewCompacted && materialSamples.length <= SURFACE_PREVIEW_MAX_SAMPLES) {
      rebuildSurface(SURFACE_PREVIEW_RESOLUTION, "provisional");
    }
    else if (stroke3D) requestAuthoritativeSurfaceRebuild("preview-fallback", false);
  }, SURFACE_PREVIEW_THROTTLE_MS);
}

function processControlDragPointer(pointer: PendingControlPointer): ControlPreviewTiming | null {
  if (!controlDrag) {
    mouseEditPreviewRejectCount += 1;
    mouseEditLastPreviewRejectReason = "no-control-drag";
    return null;
  }
  if (!stroke3D) {
    mouseEditPreviewRejectCount += 1;
    mouseEditLastPreviewRejectReason = "no-stroke";
    return null;
  }
  if (controlDrag.pointerId !== pointer.pointerId) {
    mouseEditPreviewRejectCount += 1;
    mouseEditLastPreviewRejectReason = "pointer-id";
    return null;
  }
  const processStarted = performance.now();
  const controlUpdateStarted = performance.now();
  const point = controlDrag.controlPositionsBefore[controlDrag.controlIndex];
  const planeValue = controlDrag.direction === "front"
    ? point.y
    : controlDrag.direction === "right" ? point.x : point.z;
  const canvas = canvasPoint(pointer);
  const world = renderer.pointOnViewPlane(
    controlDrag.viewportIndex,
    canvas.x,
    canvas.y,
    controlDrag.rect,
    controlDrag.direction,
    planeValue,
  );
  if (!world) {
    mouseEditPreviewRejectCount += 1;
    mouseEditLastPreviewRejectReason = [
      "view-plane-miss",
      controlDrag.direction,
      `plane=${planeValue.toFixed(3)}`,
      `canvas=${canvas.x.toFixed(1)}/${canvas.y.toFixed(1)}`,
      `rect=${controlDrag.rect.index}:${controlDrag.rect.x.toFixed(1)},${controlDrag.rect.y.toFixed(1)},${controlDrag.rect.width.toFixed(1)},${controlDrag.rect.height.toFixed(1)}`,
    ].join(":");
    return null;
  }
  for (const index of lastAffectedControlIndices) {
    stroke3D.controlPoints[index].position = { ...controlDrag.controlPositionsBefore[index] };
  }
  const controlUpdateMilliseconds = performance.now() - controlUpdateStarted;
  const controlUpdateEnded = performance.now();
  const softEditStarted = performance.now();
  const edit = applySoftViewportEdit(
    stroke3D,
    controlDrag.controlIndex,
    controlDrag.direction,
    world,
    softEditStrength,
  );
  const softEditMilliseconds = performance.now() - softEditStarted;
  if (rawSignature() !== controlDrag.rawSignatureBefore) {
    throw new Error("Soft Edit changed the immutable Raw Gesture");
  }
  lastAffectedControlIndices = edit.affectedControlIndices;
  lastEditBoundsBefore = controlDrag.boundsBefore;
  lastEditBoundsAfter = strokeBounds(stroke3D);
  lastAdaptiveControlFit = null;
  const targetUpdatedAt = performance.now();
  const targetPosition = { ...stroke3D.controlPoints[controlDrag.controlIndex].position };
  const projectedTarget = renderer.projectPoint(
    controlDrag.viewportIndex,
    targetPosition,
    controlDrag.rect,
  );
  const targetScreen = projectedTarget.visible
    ? { x: projectedTarget.x, y: projectedTarget.y }
    : null;
  const previewTimings = editProxyMode === "direct"
    ? {
      boundedControl: { start: null, end: null },
      smoothCenterline: { start: null, end: null },
      materialSamples: { start: null, end: null },
      smoothMilliseconds: 0,
      previewMilliseconds: 0,
    }
    : updateEditPreview();
  const previewUpdateEnd = performance.now();
  mouseEditControlUpdateDurations = [...mouseEditControlUpdateDurations, controlUpdateMilliseconds].slice(-128);
  mouseEditSoftEditDurations = [...mouseEditSoftEditDurations, softEditMilliseconds].slice(-128);
  mouseEditSmoothRebuildDurations = [...mouseEditSmoothRebuildDurations, previewTimings.smoothMilliseconds].slice(-128);
  mouseEditPreviewUpdateDurations = [...mouseEditPreviewUpdateDurations, previewTimings.previewMilliseconds].slice(-128);
  mouseEditPreviewProcessDurations = [
    ...mouseEditPreviewProcessDurations,
    performance.now() - processStarted,
  ].slice(-128);
  stateMessage = `EDITED · ${softEditStrength.toUpperCase()} affected ${edit.affectedControlIndices.length} controls`;
  redrawOverlay();
  updateDebug();
  return {
    pointerRevision: pointer.pointerRevision,
    previewUpdateEnd,
    controlUpdate: { start: controlUpdateStarted, end: controlUpdateEnded },
    targetUpdatedAt,
    targetPosition,
    targetScreen,
    preview: previewTimings,
  };
}

function queueControlDragPointer(event: PointerEvent): void {
  if (!controlDrag || controlDrag.pointerId !== event.pointerId) return;
  const handlerStarted = performance.now();
  const eventTimestamp = eventTimestampForPerformance(event.timeStamp, handlerStarted);
  if (pendingControlPointer) mouseEditDroppedPointerMoves += 1;
  const pending: PendingControlPointer = {
    pointerId: event.pointerId,
    pointerRevision: mouseEditPointerRevision + 1,
    clientX: event.clientX,
    clientY: event.clientY,
    eventTimestamp,
    handlerStart: handlerStarted,
    handlerEnd: handlerStarted,
    latestStateUpdated: handlerStarted,
  };
  mouseEditPointerRevision = pending.pointerRevision;
  pendingControlPointer = pending;
  const handlerEnded = performance.now();
  pending.handlerEnd = handlerEnded;
  pending.latestStateUpdated = handlerEnded;
  mouseEditLastEventTimestamp = eventTimestamp;
  mouseEditLastHandlerStart = handlerStarted;
  mouseEditLastHandlerEnd = handlerEnded;
  mouseEditLastLatestStateUpdated = handlerEnded;
  mouseEditPointerMoveCount += 1;
  editDiagnosticLatestPointerEventCount += editMarkersEnabled ? 1 : 0;
  if (editMarkersEnabled) editDiagnosticLatestPointer = editDiagnosticWorkspacePoint(event.clientX, event.clientY);
  mouseEditFirstPointerTimestamp ??= eventTimestamp;
  mouseEditLastPointerTimestamp = eventTimestamp;
  mouseEditInputQueueLatencies = [
    ...mouseEditInputQueueLatencies,
    Math.max(0, handlerStarted - eventTimestamp),
  ].slice(-128);
  mouseEditHandlerDurations = [
    ...mouseEditHandlerDurations,
    handlerEnded - handlerStarted,
  ].slice(-128);
  if (editPreviewMaterialProxyFrame === null) scheduleMaterialProxyFrame();
  mouseEditMaxPendingRaf = Math.max(mouseEditMaxPendingRaf, editPreviewMaterialProxyFrame === null ? 0 : 1);
}

function finishControlDrag(pointerId: number): void {
  if (!controlDrag || controlDrag.pointerId !== pointerId) return;
  const pointerupStarted = performance.now();
  cancelSurfacePreviewTimer();
  cancelMaterialProxyFrame();
  cancelEditPreviewFrame();
  const finalization = stroke3D && showSurface
    ? beginAuthoritativeFinalization("mouse-edit-pointerup", pointerupStarted)
    : null;
  if (!finalization) renderer.setMaterialProxy(null);
  if (finalization) finalization.timestamps.tProxyFrozen = performance.now();
  const pending = pendingControlPointer;
  pendingControlPointer = null;
  if (pending?.pointerId === pointerId) processControlDragPointer(pending);
  const diagnosticMarkers = editDiagnosticSnapshot();
  const editMessage = stateMessage;
  if (stroke3D) {
    const finalMaterialStarted = performance.now();
    refreshMaterialSamples(stroke3D, null, finalization);
    mouseEditFinalMaterialMilliseconds = performance.now() - finalMaterialStarted;
  }
  const shouldRebuild = Boolean(finalization);
  if (finalization) {
    const finalSurfaceStarted = performance.now();
    runAuthoritativeFinalization(finalization);
    mouseEditFinalSurfaceMilliseconds = performance.now() - finalSurfaceStarted;
  }
  editPreviewStroke3D = null;
  editPreviewCenterline = [];
  editPreviewMaterialSamples = [];
  controlDrag = null;
  refreshEditDiagnosticMarkers();
  if (shouldRebuild && currentSurfaceState() === "READY") stateMessage = editMessage;
  renderScene();
  const resourcesAfter = renderer.resourceStats();
  const resourcesBefore = mouseEditSessionResourceBefore ?? resourcesAfter;
  const geometryAfter = editGeometrySnapshot();
  const renderAfter = renderer.renderStats();
  mouseEditSessionHistory = [
    ...mouseEditSessionHistory,
    {
      session: mouseEditSessionNumber,
      pointerMoveCount: mouseEditPointerMoveCount,
      previewFrameCount: mouseEditPreviewFrameCount,
      droppedPointerMoves: mouseEditDroppedPointerMoves,
      inputQueue: durationStats(mouseEditInputQueueLatencies),
      endToEnd: durationStats(mouseEditEndToEndLatencies),
      renderSubmission: durationStats(mouseEditRenderSubmissionDurations),
      rafAge: durationStats(mouseEditRafAgeDurations),
      frameInterval: durationStats(mouseEditFrameIntervals),
      raycast: durationStats(mouseEditRaycastDurations),
      readyToEditMilliseconds: mouseEditSessionReadyToEditMilliseconds,
      finalSurfaceMilliseconds: mouseEditFinalSurfaceMilliseconds,
      resourcesBefore,
      resourcesAfter,
      geometryBefore: mouseEditSessionGeometryBefore ?? geometryAfter,
      geometryAfter,
      renderBefore: mouseEditSessionRenderBefore ?? renderAfter,
      renderAfter,
      previewRejectCount: mouseEditPreviewRejectCount,
      lastPreviewRejectReason: mouseEditLastPreviewRejectReason,
      diagnosticMarkers,
      pipelineFrames: [...mouseEditPipelineFrames],
      finalization,
    },
  ].slice(-10);
  mouseEditSessionResourceBefore = null;
  mouseEditSessionGeometryBefore = null;
  mouseEditSessionRenderBefore = null;
  mouseEditSessionReadyToEditMilliseconds = null;
  redrawOverlay();
  updateDebug();
  scheduleRecoveryCheckpoint("edit");
}

function startControlDrag(event: PointerEvent, rect: SkinViewportRect, controlIndex: number): void {
  const direction = directions[rect.index];
  if (direction === "axome" || !stroke3D) return;
  event.preventDefault();
  stopAutoRotate();
  cancelPendingFinalizationForEdit();
  markFinalizationEditing("mouse-edit");
  gestureCanvas.setPointerCapture(event.pointerId);
  mouseEditSessionNumber += 1;
  mouseEditSessionResourceBefore = renderer.resourceStats();
  mouseEditSessionGeometryBefore = editGeometrySnapshot();
  mouseEditSessionRenderBefore = renderer.renderStats();
  mouseEditSessionReadyToEditMilliseconds = lastFinalReadyTimestamp === null
    ? null
    : Math.max(0, performance.now() - lastFinalReadyTimestamp);
  selectedControlPoint = controlIndex;
  lastAffectedControlIndices = [];
  longTaskDurations = [];
  pendingControlPointer = null;
  mouseEditPointerMoveCount = 0;
  mouseEditPreviewFrameCount = 0;
  mouseEditDroppedPointerMoves = 0;
  mouseEditFirstPointerTimestamp = null;
  mouseEditLastPointerTimestamp = null;
  mouseEditFirstPreviewTimestamp = null;
  mouseEditLastPreviewTimestamp = null;
  mouseEditOldestPointerAge = 0;
  mouseEditMaxPendingRaf = 0;
  mouseEditLastEventTimestamp = null;
  mouseEditLastHandlerStart = null;
  mouseEditLastHandlerEnd = null;
  mouseEditLastLatestStateUpdated = null;
  mouseEditLastRafStart = null;
  mouseEditLastPreviewUpdateEnd = null;
  mouseEditLastRenderSubmission = null;
  mouseEditHandlerDurations = [];
  mouseEditControlUpdateDurations = [];
  mouseEditSoftEditDurations = [];
  mouseEditSmoothRebuildDurations = [];
  mouseEditPreviewUpdateDurations = [];
  mouseEditPreviewProcessDurations = [];
  mouseEditInputQueueLatencies = [];
  mouseEditEndToEndLatencies = [];
  mouseEditRenderSubmissionDurations = [];
  mouseEditRafAgeDurations = [];
  mouseEditFrameIntervals = [];
  // Surface picking remains projection-based; the measured mesh-raycast path is zero work.
  mouseEditRaycastDurations = [0];
  mouseEditIntersectMeshCount = 0;
  mouseEditPreviewRejectCount = 0;
  mouseEditLastPreviewRejectReason = "";
  mouseEditFinalMaterialMilliseconds = null;
  mouseEditFinalSurfaceMilliseconds = null;
  mouseEditPipelineFrames = [];
  mouseEditPointerRevision = 0;
  resetEditDiagnosticMarkers();
  if (editProxyMode === "direct") {
    editPreviewStroke3D = null;
    editPreviewCenterline = [];
    editPreviewMaterialSamples = [];
  } else {
    editPreviewStroke3D = createBoundedStrokePreview(
      stroke3D,
      HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS,
    );
    editPreviewCenterline = sampleSmoothCenterline(editPreviewStroke3D);
    editPreviewMaterialSamples = sampleMaterialSamplesForPreview(
      editPreviewCenterline,
      thickness,
      SURFACE_PREVIEW_MAX_SAMPLES,
    );
  }
  lastEditBoundsBefore = strokeBounds(stroke3D);
  lastEditBoundsAfter = lastEditBoundsBefore;
  controlDrag = {
    pointerId: event.pointerId,
    viewportIndex: rect.index,
    direction,
    controlIndex,
    rect: { ...rect },
    boundsBefore: lastEditBoundsBefore,
    rawSignatureBefore: rawSignature(),
    controlPositionsBefore: stroke3D.controlPoints.map((control) => ({ ...control.position })),
  };
  editDiagnosticLatestPointer = editDiagnosticWorkspacePoint(event.clientX, event.clientY);
  const initialTarget = stroke3D.controlPoints[controlIndex]
    ? renderer.projectPoint(rect.index, stroke3D.controlPoints[controlIndex].position, rect)
    : null;
  editDiagnosticTarget = initialTarget?.visible
    ? { x: initialTarget.x, y: initialTarget.y }
    : null;
  refreshEditDiagnosticMarkers();
  renderer.setPreviewSurfaceVisible(showSurface && !hideFinalSurfaceDuringEdit);
  scheduleMaterialProxyFrame();
  renderScene();
  updateDebug();
  redrawOverlay();
}

function startCameraDrag(event: PointerEvent, rect: SkinViewportRect): void {
  if (!event.isPrimary || activeStroke || cameraDrag || controlDrag) return;
  if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  stopAutoRotate();
  gestureCanvas.setPointerCapture(event.pointerId);
  cameraDrag = {
    pointerId: event.pointerId,
    viewportIndex: rect.index,
    gesture: resolveRhinoViewportGesture(directions[rect.index], {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey || event.ctrlKey,
    }),
    previousX: event.clientX,
    previousY: event.clientY,
    rect: { ...rect },
  };
}

function currentTouchPoints(): HanaTouchPoint[] {
  return [...touchPointers.values()].sort((a, b) => a.id - b.id);
}

function startTouchNavigation(event: PointerEvent, rect: SkinViewportRect): void {
  if (activeStroke || controlDrag) return;
  event.preventDefault();
  stopAutoRotate();
  gestureCanvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  touchPointers.set(event.pointerId, { id: event.pointerId, x: point.x, y: point.y });
  previousTouchPoints = currentTouchPoints();
  cameraDrag = touchPointers.size === 1
    ? {
      pointerId: event.pointerId,
      viewportIndex: rect.index,
      gesture: resolveRhinoViewportGesture(directions[rect.index], { shiftKey: false, metaKey: false }),
      previousX: event.clientX,
      previousY: event.clientY,
      rect: { ...rect },
    }
    : null;
}

function updateTouchNavigation(event: PointerEvent): void {
  const current = touchPointers.get(event.pointerId);
  if (!current) return;
  event.preventDefault();
  stopAutoRotate();
  const point = canvasPoint(event);
  current.x = point.x;
  current.y = point.y;
  const nextPoints = currentTouchPoints();
  const rect = currentRects().find((item) => item.index === (cameraDrag?.viewportIndex ?? selectedViewport));
  if (!rect) {
    previousTouchPoints = nextPoints;
    return;
  }
  if (nextPoints.length >= 2 && previousTouchPoints.length >= 2) {
    const delta = touchGestureDelta(previousTouchPoints, nextPoints);
    if (delta) {
      renderer.applyDrag(rect.index, "pan", delta.deltaX, delta.deltaY, rect.width, rect.height);
      renderer.applyDrag(rect.index, "zoom", 0, delta.zoomDelta, rect.width, rect.height);
    }
  } else if (cameraDrag && cameraDrag.pointerId === event.pointerId) {
    renderer.applyDrag(
      cameraDrag.viewportIndex,
      cameraDrag.gesture,
      event.clientX - cameraDrag.previousX,
      event.clientY - cameraDrag.previousY,
      cameraDrag.rect.width,
      cameraDrag.rect.height,
    );
    cameraDrag.previousX = event.clientX;
    cameraDrag.previousY = event.clientY;
  }
  previousTouchPoints = nextPoints;
  renderScene();
  redrawOverlay();
}

function endTouchNavigation(pointerId: number): void {
  if (!touchPointers.has(pointerId)) return;
  touchPointers.delete(pointerId);
  previousTouchPoints = currentTouchPoints();
  if (cameraDrag?.pointerId === pointerId) cameraDrag = null;
  if (gestureCanvas.hasPointerCapture(pointerId)) gestureCanvas.releasePointerCapture(pointerId);
}

function endPointer(pointerId: number, releaseCapture: boolean, finalEvent: PointerEvent | null = null): void {
  if (touchPointers.has(pointerId)) {
    endTouchNavigation(pointerId);
    return;
  }
  if (activeStroke?.pointerId === pointerId) {
    if (finalEvent) appendSamples(finalEvent);
    surfacePointerEndMilliseconds = performance.now();
    finishStroke();
  }
  if (cameraDrag?.pointerId === pointerId) cameraDrag = null;
  finishControlDrag(pointerId);
  if (releaseCapture && gestureCanvas.hasPointerCapture(pointerId)) gestureCanvas.releasePointerCapture(pointerId);
}

gestureCanvas.addEventListener("pointerdown", (event) => {
  const point = canvasPoint(event);
  const rect = skinViewportAtPoint(point.x, point.y, workspace.clientWidth, workspace.clientHeight, viewportMode, selectedViewport, split);
  if (!rect) return;
  selectedViewport = rect.index;
  renderViewportChrome();
  renderScene();
  redrawOverlay();
  updateDebug();
  const pencilDraw = event.pointerType === "pen"
    && directions[rect.index] !== "axome"
    && stroke3D === null;
  if (event.pointerType === "touch") {
    startTouchNavigation(event, rect);
    return;
  }
  if (interactionModes[rect.index] === "draw" || pencilDraw) {
    startStroke(event, rect);
    return;
  }
  if (event.pointerType !== "mouse") return;
  if (interactionModes[rect.index] === "edit" && directions[rect.index] !== "axome") {
    mouseEditNearestDurations = [];
    // HANA Surface picking is projection-based; no Surface mesh raycast is used.
    mouseEditRaycastDurations = [0];
    mouseEditIntersectMeshCount = 0;
    const nearestStarted = performance.now();
    const controlIndex = nearestEditableControlIndex(rect, point.x, point.y);
    mouseEditNearestDurations = [
      ...mouseEditNearestDurations,
      performance.now() - nearestStarted,
    ].slice(-128);
    if (controlIndex !== null) {
      startControlDrag(event, rect, controlIndex);
      return;
    }
  }
  startCameraDrag(event, rect);
});

gestureCanvas.addEventListener("pointermove", (event) => {
  if (activeStroke?.pointerId === event.pointerId) {
    event.preventDefault();
    appendSamples(event);
    return;
  }
  if (controlDrag?.pointerId === event.pointerId) {
    event.preventDefault();
    queueControlDragPointer(event);
    return;
  }
  if (touchPointers.has(event.pointerId)) {
    updateTouchNavigation(event);
    return;
  }
  if (!cameraDrag || cameraDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  renderer.applyDrag(
    cameraDrag.viewportIndex,
    cameraDrag.gesture,
    event.clientX - cameraDrag.previousX,
    event.clientY - cameraDrag.previousY,
    cameraDrag.rect.width,
    cameraDrag.rect.height,
  );
  cameraDrag.previousX = event.clientX;
  cameraDrag.previousY = event.clientY;
  renderScene();
  redrawOverlay();
});

gestureCanvas.addEventListener("pointerup", (event) => endPointer(event.pointerId, true, event));
gestureCanvas.addEventListener("pointercancel", (event) => endPointer(event.pointerId, true, event));
gestureCanvas.addEventListener("lostpointercapture", (event) => endPointer(event.pointerId, false));
gestureCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
gestureCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  stopAutoRotate();
  const point = canvasPoint(event);
  const rect = skinViewportAtPoint(point.x, point.y, workspace.clientWidth, workspace.clientHeight, viewportMode, selectedViewport, split);
  if (!rect || interactionModes[rect.index] === "draw") return;
  selectedViewport = rect.index;
  renderer.applyDrag(rect.index, "zoom", 0, event.deltaY * 0.12, rect.width, rect.height);
  renderScene();
  redrawOverlay();
  renderViewportChrome();
  updateDebug();
}, { passive: false });

function beginSplitterDrag(event: PointerEvent, axis: "x" | "y"): void {
  event.preventDefault();
  const splitter = axis === "x" ? splitterX : splitterY;
  splitter.classList.add("is-dragging");
  splitter.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const bounds = workspace.getBoundingClientRect();
    if (axis === "x") split = { ...split, x: (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width) };
    else split = { ...split, y: (moveEvent.clientY - bounds.top) / Math.max(1, bounds.height) };
    split.x = Math.max(0.2, Math.min(0.8, split.x));
    split.y = Math.max(0.2, Math.min(0.8, split.y));
    refreshLayout();
  };
  const end = (endEvent: PointerEvent) => {
    if (endEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    splitter.classList.remove("is-dragging");
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

splitterX.addEventListener("pointerdown", (event) => beginSplitterDrag(event, "x"));
splitterY.addEventListener("pointerdown", (event) => beginSplitterDrag(event, "y"));

layoutFourButton.addEventListener("click", () => { viewportMode = "four"; refreshLayout(); });
layoutOneButton.addEventListener("click", () => { viewportMode = "one"; refreshLayout(); });

function updateAutoRotateUI(): void {
  autoRotateButton.setAttribute("aria-pressed", String(autoRotateEnabled));
  autoRotateButton.textContent = `Auto Rotate ${autoRotateEnabled ? "ON" : "OFF"}`;
  workspace.dataset.autoRotate = String(autoRotateEnabled);
}

function stopAutoRotate(): void {
  autoRotateEnabled = false;
  if (autoRotateFrame !== null) {
    window.cancelAnimationFrame(autoRotateFrame);
    autoRotateFrame = null;
  }
  updateAutoRotateUI();
}

function autoRotateTick(_timestamp: number): void {
  autoRotateFrame = null;
  if (!autoRotateEnabled) return;
  if (!activeStroke && !controlDrag && !cameraDrag) {
    renderer.applyAutoRotate(selectedViewport, 16);
    renderScene();
    redrawOverlay();
  }
  autoRotateFrame = window.requestAnimationFrame(autoRotateTick);
}

function startAutoRotate(): void {
  if (autoRotateFrame !== null) return;
  autoRotateFrame = window.requestAnimationFrame(autoRotateTick);
}

autoRotateButton.addEventListener("click", () => {
  autoRotateEnabled = !autoRotateEnabled;
  updateAutoRotateUI();
  if (autoRotateEnabled) startAutoRotate();
  else if (autoRotateFrame !== null) {
    window.cancelAnimationFrame(autoRotateFrame);
    autoRotateFrame = null;
  }
  updateDebug();
});

for (const button of viewPresetButtons) {
  button.addEventListener("click", () => {
    stopAutoRotate();
    const preset = button.dataset.viewPreset;
    if (!preset) return;
    if (preset === "fit") {
      renderer.fitView(selectedViewport, displayedCenterline().map((point) => point.position));
    } else if ((HANA_VIEW_PRESETS as readonly string[]).includes(preset)) {
      renderer.setViewPreset(selectedViewport, preset as HanaViewPreset);
    }
    refreshLayout();
    updateDebug();
  });
}

for (const button of softEditButtons) {
  button.addEventListener("click", () => {
    const strength = button.dataset.softEdit;
    if (strength !== "off" && strength !== "low" && strength !== "medium") return;
    softEditStrength = strength;
    lastAffectedControlIndices = [];
    stateMessage = `SOFT EDIT · ${strength.toUpperCase()}`;
    updateSoftEditButtons();
    updateDebug();
  });
}

function updateSmoothnessUI(): void {
  const value = smoothness.toFixed(2);
  smoothnessSlider.value = value;
  smoothnessValue.value = value;
  smoothnessValue.textContent = value;
}

function setSmoothness(value: number): void {
  smoothness = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  if (stroke3D) {
    stroke3D.curve.smoothness = smoothness;
    stateMessage = `SMOOTHNESS · ${smoothness.toFixed(2)}`;
  }
  if (provisionalStroke3D) provisionalStroke3D.curve.smoothness = smoothness;
  if (stroke3D || provisionalStroke3D) refreshMaterialSamples();
  if (showSurface) {
    scheduleSurfacePreview();
    scheduleMaterialProxyFrame();
  }
  redrawOverlay();
  updateSmoothnessUI();
  updateDebug();
}

smoothnessSlider.addEventListener("input", () => {
  stopAutoRotate();
  setSmoothness(Number(smoothnessSlider.value));
});

function setComputeMode(mode: HanaComputeMode): void {
  if (mode === computeMode) {
    void refreshComputeHealth();
    return;
  }
  cancelPendingFinalizationForEdit();
  computeMode = mode;
  computeBackend = createHanaComputeBackend(computeMode, { strict: computeStrictRemote });
  try {
    window.localStorage.setItem("hana-compute-mode-v0", computeMode);
  } catch {
    // Persisting the preference is optional.
  }
  setComputeStatus(computeMode === "local" ? "LOCAL · READY" : `${computeMode.toUpperCase()} · CHECKING`);
  if (stroke3D && showSurface && materialSamples.length > 0) {
    requestAuthoritativeSurfaceRebuild("compute-mode-change", false);
  }
  void refreshComputeHealth();
}

for (const button of computeModeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.computeMode;
    if (mode === "local" || mode === "windows" || mode === "auto") setComputeMode(mode);
  });
}

function updateDisplayUI(): void {
  const updateToggle = (button: HTMLButtonElement, label: string, enabled: boolean) => {
    button.setAttribute("aria-pressed", String(enabled));
    button.dataset.state = enabled ? "on" : "off";
    button.textContent = `${label} ${enabled ? "ON" : "OFF"}`;
  };
  updateToggle(centerlineToggle, "Centerline", showCenterline);
  updateToggle(samplesToggle, "Samples", showSamples);
  updateToggle(surfaceToggle, "Surface", showSurface);
}

function updateThicknessUI(): void {
  const value = thickness.toFixed(2);
  thicknessSlider.value = value;
  thicknessValue.value = value;
  thicknessValue.textContent = value;
}

function setThickness(value: number): void {
  thickness = Number.isFinite(value)
    ? Math.min(HANA_THICKNESS_MAX, Math.max(HANA_THICKNESS_MIN, value))
    : HANA_THICKNESS_DEFAULT;
  if (stroke3D || provisionalStroke3D) refreshMaterialSamples();
  if (stroke3D) stateMessage = `THICKNESS · ${thickness.toFixed(2)} · REBUILD SURFACE`;
  updateThicknessUI();
  if (showSurface) {
    scheduleSurfacePreview();
    scheduleMaterialProxyFrame();
  }
  updateDebug();
}

function restoreDiagnosticFinalProxy(): void {
  if ((finalProfile !== "skip" && finalProfile !== "cpu-only") || !showSurface || authoritativeCenterline.length < 2) return;
  const segments = sampleLiveProxySegments(
    authoritativeCenterline,
    thickness,
    HANA_LIVE_PROXY_MAX_SEGMENTS,
  );
  renderer.setMaterialProxy(segments);
  workspace.dataset.materialProxySegmentCount = String(segments.length);
  renderScene();
}

function updateRemotePointerupTimings(result: HanaFinalizationResultV0): void {
  const timings = pendingPointerupStageTimings ?? lastPointerupStageTimings;
  if (!timings) return;
  timings.smoothCenterline = result.timings.smoothCenterline;
  timings.materialSamples = result.timings.materialSamples;
  timings.fieldPreparation = result.timings.fieldPreparation;
  timings.effectiveResolution = result.timings.effectiveResolution;
  timings.meshGeneration = result.timings.meshGeneration;
  timings.componentValidation = result.timings.validation;
  timings.smoothCount = result.counts.smooth;
  timings.materialCount = result.counts.materialSamples;
  timings.effectiveResolutionValue = result.counts.effectiveResolution;
  timings.triangleCount = result.counts.triangles;
  timings.componentCount = result.counts.components;
  timings.fieldCandidateEvaluationCount = result.counts.candidates;
  timings.fieldQueryCount = result.counts.voxels;
}

function remoteResultToSurface(result: HanaFinalizationResultV0): HanaPreviewSurface {
  return buildMeshResultFromTriangles(finalizationResultToTriangles(result), 1);
}

function updateRemoteFinalizationTrace(
  trace: HanaFinalizationTrace,
  result: HanaFinalizationResultV0,
  rendererSurface: HanaRendererSurfaceUpdateStats | null,
): void {
  const previous = trace.counts;
  trace.counts = {
    ...previous,
    rawCount: rawGestures[0]?.points.length ?? 0,
    controlCount: result.counts.controls,
    smoothCount: result.counts.smooth,
    materialSampleCount: result.counts.materialSamples,
    voxelCount: result.counts.voxels,
    kdTreeCandidateCount: result.counts.candidates,
    effectiveResolution: result.counts.effectiveResolution,
    triangleCount: result.counts.triangles,
    componentCount: result.counts.components,
    positionBufferBytes: rendererSurface?.positionBufferBytes ?? 0,
    normalBufferBytes: rendererSurface?.normalBufferBytes ?? 0,
    indexBufferBytes: rendererSurface?.indexBufferBytes ?? 0,
    fieldBufferBytes: result.counts.materialSamples * 40,
    kdTreeNodeBytes: result.counts.materialSamples * 32,
    remoteFinalization: 1,
    remoteVoxelCount: result.counts.voxels,
    remoteCandidateCount: result.counts.candidates,
  };
}

async function runRemoteFinalization(trace: HanaFinalizationTrace): Promise<void> {
  if (!stroke3D) return;
  const started = performance.now();
  const snapshot = createHanaFinalizationSnapshot({
    requestId: `hana-${trace.finalRequestId}-${trace.finalGenerationId}`,
    documentId: computeDocumentId,
    documentRevision: trace.documentRevision,
    objectRevision: trace.finalGenerationId,
    generationId: trace.finalGenerationId,
    stroke: stroke3D,
    materialSettings: defaultHanaMaterialSettings(thickness),
  });
  const abortController = new AbortController();
  computeAbortController = abortController;
  computeSnapshot = snapshot;
  transitionFinalization(trace, "FINAL_BUILDING", started);
  setFinalizationStage(trace, "requestToBuildStart", Math.max(0, started - (trace.timestamps.tPointerUp ?? started)));
  setComputeStatus(`${computeMode.toUpperCase()} · COMPUTING`);
  stateMessage = `${computeMode.toUpperCase()} FINALIZING · preview active`;
  updateSurfaceUI();
  updateDebug();
  try {
    const result = await computeBackend.finalize(snapshot, {
      signal: abortController.signal,
      onProgress: (progress) => {
        if (isCurrentFinalization(trace)) {
          setComputeStatus(`${computeMode.toUpperCase()} · ${progress.stage.toUpperCase()}`);
        }
      },
    });
    if (!isCurrentFinalization(trace)) {
      recordStaleFinalization(trace, "stale-remote-generation");
      return;
    }
    if (!result.validation.finite || !result.validation.nonEmpty) {
      throw new Error(`Remote Finalization validation failed: ${result.validation.errors.join(", ") || "invalid result"}`);
    }
    const built = remoteResultToSurface(result);
    const cpuReady = performance.now();
    transitionFinalization(trace, "FINAL_CPU_READY", cpuReady);
    trace.timestamps.tMeshReady = cpuReady;
    trace.counts.heapAfterCpuBuildBytes = heapUsedBytes();
    setFinalizationStage(trace, "smoothCenterline", result.timings.smoothCenterline);
    setFinalizationStage(trace, "materialSamples", result.timings.materialSamples);
    setFinalizationStage(trace, "fieldPreparation", result.timings.fieldPreparation);
    setFinalizationStage(trace, "effectiveResolution", result.timings.effectiveResolution);
    setFinalizationStage(trace, "fieldEvaluationAndMeshing", result.timings.meshGeneration);
    setFinalizationStage(trace, "meshing", result.timings.meshGeneration);
    setFinalizationStage(trace, "componentValidation", result.timings.validation);
    updateRemotePointerupTimings(result);
    lastCompletedGenerationId = trace.finalGenerationId;
    const geometryStarted = performance.now();
    const triangles = built.triangles;
    renderer.setPreviewSurface(triangles);
    const rendererSurface = renderer.surfaceUpdateStats();
    const geometryReady = performance.now();
    trace.timestamps.tGeometryReady = geometryReady;
    setFinalizationStage(trace, "bufferGeometry", rendererSurface.bufferGeometryMilliseconds);
    setFinalizationStage(trace, "bufferAttributes", rendererSurface.bufferAttributeMilliseconds);
    setFinalizationStage(trace, "geometryPreparation", geometryReady - geometryStarted);
    updateRemoteFinalizationTrace(trace, result, rendererSurface);
    trace.counts.heapAfterCpuBuildBytes ??= heapUsedBytes();
    trace.counts.meshPositionBytes = rendererSurface.positionBufferBytes;
    trace.counts.meshNormalBytes = rendererSurface.normalBufferBytes;
    trace.counts.meshIndexBytes = rendererSurface.indexBufferBytes;
    previewSurface = built;
    surfaceBuildSource = "authoritative";
    surfaceBuildSignature = materializationSignature();
    surfaceBuildMilliseconds = performance.now() - started;
    surfaceDiagnostics = null;
    surfaceFieldEvaluationStats = null;
    const uploadSubmitted = performance.now();
    transitionFinalization(trace, "FINAL_UPLOAD_SUBMITTED", uploadSubmitted);
    trace.timestamps.tUploadSubmitted = uploadSubmitted;
    trace.counts.finalRequests = 1;
    trace.counts.finalStarts = 1;
    trace.counts.finalCpuCompletions = 1;
    trace.counts.finalUploadSubmissions = 1;
    trace.counts.finalSurfaceApplies = 0;
    trace.counts.staleResultDiscards = 0;
    trace.counts.heapAfterUploadBytes = heapUsedBytes();
    setFinalizationStage(trace, "uploadSubmission", uploadSubmitted - geometryReady);
    updateSurfaceUI();
    const renderStarted = performance.now();
    renderScene();
    const firstRender = performance.now();
    trace.timestamps.tFirstRender = firstRender;
    setFinalizationStage(trace, "renderSubmission", firstRender - renderStarted);
    setFinalizationStage(trace, "geometryReadyToFirstRender", firstRender - geometryReady);
    window.requestAnimationFrame(() => {
      if (!isCurrentFinalization(trace)) {
        recordStaleFinalization(trace, "stale-remote-generation");
        return;
      }
      renderer.setMaterialProxy(null);
      workspace.dataset.materialProxySegmentCount = "0";
      trace.timestamps.tNextRAF = performance.now();
      transitionFinalization(trace, "FINAL_PRESENTED", performance.now());
      trace.timestamps.tReady = performance.now();
      trace.status = "completed";
      lastAppliedGenerationId = trace.finalGenerationId;
      trace.counts.finalSurfaceApplies = 1;
      trace.counts.heapAfterUploadBytes ??= heapUsedBytes();
      lastFinalReadyTimestamp = trace.timestamps.tReady;
      stateMessage = `SURFACE READY · ${result.counts.triangles} triangles · ${surfaceBuildMilliseconds?.toFixed(1) ?? "—"} ms`;
      setComputeStatus(`${computeMode.toUpperCase()} · READY`);
      renderScene();
      recordFinalization(trace);
      scheduleFinalizationHeapSamples(trace);
      updateSurfaceUI();
      redrawOverlay();
      updateDebug();
    });
  } catch (error) {
    if (!isCurrentFinalization(trace)) return;
    if (error instanceof DOMException && error.name === "AbortError") {
      recordStaleFinalization(trace, "cancelled-remote-generation");
      return;
    }
    trace.status = "failed";
    trace.error = error instanceof Error ? error.message : "Remote Finalization failed";
    trace.timestamps.tReady = performance.now();
    finalizationState = "IDLE";
    setComputeStatus(`${computeMode.toUpperCase()} · ERROR`);
    stateMessage = `SURFACE ERROR · ${trace.error}`;
    recordFinalization(trace);
    updateSurfaceUI();
    updateDebug();
  } finally {
    if (computeAbortController === abortController) computeAbortController = null;
    if (computeSnapshot === snapshot) computeSnapshot = null;
  }
}

function runAuthoritativeFinalization(trace: HanaFinalizationTrace): void {
  if (computeMode !== "local" && trace.finalProfile === "normal") {
    void runRemoteFinalization(trace);
    return;
  }
  stateMessage = "FINALIZING SURFACE · preview active";
  renderScene();
  updateSurfaceUI();
  updateDebug();
  void rebuildSurface(HANA_SURFACE_RESOLUTION, "authoritative", trace).then(() => {
    if ((trace.finalProfile === "skip" || trace.finalProfile === "cpu-only")
      && activeFinalization?.finalGenerationId === trace.finalGenerationId) {
      restoreDiagnosticFinalProxy();
    }
  });
}

async function rebuildSurface(
  resolution = HANA_SURFACE_RESOLUTION,
  source: "authoritative" | "provisional" = "authoritative",
  finalization: HanaFinalizationTrace | null = null,
): Promise<void> {
  const sourceStroke = source === "provisional" ? provisionalStroke3D : stroke3D;
  if (!sourceStroke || materialSamples.length === 0) {
    stateMessage = "SURFACE · Draw one Stroke first";
    if (finalization) {
      finalization.status = "failed";
      finalization.error = "missing stroke or material samples";
      finalization.timestamps.tReady = performance.now();
      finalizationState = "IDLE";
      recordFinalization(finalization);
    }
    updateDebug();
    return;
  }
  rebuildSurfaceButton.disabled = true;
  surfaceState.textContent = source === "provisional" ? "PREVIEWING..." : "REBUILDING...";
  const started = performance.now();
  if (finalization) {
    transitionFinalization(finalization, "FINAL_BUILDING", started);
    setFinalizationStage(finalization, "requestToBuildStart", Math.max(0, started - (finalization.timestamps.tPointerUp ?? started)));
  }
  if (source === "provisional") {
    surfacePreviewBuildCount += 1;
    surfacePreviewLastStartMilliseconds = started;
  }

  if (finalization?.finalProfile === "skip") {
    const cpuReady = performance.now();
    transitionFinalization(finalization, "FINAL_CPU_READY", cpuReady);
    finalization.status = "skipped";
    finalization.skipReason = "final-profile-skip";
    finalization.timestamps.tReady = cpuReady;
    finalization.counts = {
      rawCount: rawGestures[0]?.points.length ?? 0,
      controlCount: stroke3D?.controlPoints.length ?? 0,
      smoothCount: authoritativeCenterline.length,
      materialSampleCount: materialSamples.length,
      finalRequests: 1,
      finalStarts: 0,
      finalCpuCompletions: 0,
      finalUploadSubmissions: 0,
      finalSurfaceApplies: 0,
      staleResultDiscards: 0,
      heapBeforeBytes: finalization.counts.heapBeforeBytes ?? heapUsedBytes(),
    };
    finalizationState = "FINAL_CPU_READY";
    recordFinalization(finalization);
    updateSurfaceUI();
    updateDebug();
    return;
  }

  try {
    let field: ReturnType<typeof buildPointField> | null = null;
    let evaluationStats: HanaPointFieldEvaluationStats | null = null;
    let effectiveResolution = 0;
    let built: HanaPreviewSurface | null = null;
    let fieldPreparationMilliseconds = 0;
    let effectiveResolutionMilliseconds = 0;
    let meshGenerationMilliseconds = 0;
    let componentValidationMilliseconds = 0;

    if (finalization?.finalProfile === "upload-only") {
      built = uploadOnlyMeshCache;
      if (!built) {
        finalization.status = "skipped";
        finalization.skipReason = "upload-only-cache-missing";
        finalization.timestamps.tReady = performance.now();
        finalizationState = "FINAL_CPU_READY";
        recordFinalization(finalization);
        updateDebug();
        return;
      }
      effectiveResolution = resolution;
    } else {
      const fieldStarted = performance.now();
      field = buildPointField(materialSamples, thickness);
      const fieldReady = performance.now();
      fieldPreparationMilliseconds = fieldReady - fieldStarted;
      evaluationStats = createPointFieldEvaluationStats();
      if (finalization) {
        finalization.timestamps.tKDTreeReady = fieldReady;
        finalization.timestamps.tFieldReady = fieldReady;
        setFinalizationStage(finalization, "fieldPreparation", fieldPreparationMilliseconds);
        setFinalizationStage(finalization, "kdTreeBuild", fieldPreparationMilliseconds);
      }
      const effectiveResolutionStarted = performance.now();
      effectiveResolution = pointFieldEffectiveResolution(field, resolution);
      effectiveResolutionMilliseconds = performance.now() - effectiveResolutionStarted;
      if (finalization) setFinalizationStage(finalization, "effectiveResolution", effectiveResolutionMilliseconds);
      const meshStarted = performance.now();
      built = finalization?.finalProfile === "normal" || finalization?.finalProfile === "cpu-only"
        ? await buildPointFieldMeshCooperative(field, effectiveResolution, evaluationStats, {
          shouldContinue: finalization
            ? () => isCurrentFinalization(finalization)
            : undefined,
        })
        : buildPointFieldMesh(field, effectiveResolution, evaluationStats);
      const meshReady = performance.now();
      meshGenerationMilliseconds = meshReady - meshStarted;
      if (finalization) {
        finalization.timestamps.tMeshReady = meshReady;
        setFinalizationStage(finalization, "fieldEvaluationAndMeshing", meshGenerationMilliseconds);
        setFinalizationStage(finalization, "meshing", meshGenerationMilliseconds);
      }
      if (built.triangles.length === 0) throw new Error("Point FieldからSurfaceを抽出できませんでした");
      if (finalization && !isCurrentFinalization(finalization)) {
        recordStaleFinalization(finalization, "stale-generation-discard");
        return;
      }
      surfaceFieldEvaluationStats = evaluationStats;
      const validationStarted = performance.now();
      surfaceDiagnostics = source === "authoritative" && (materialSamples.length > SURFACE_PREVIEW_MAX_SAMPLES || finalization !== null)
        ? diagnosePointField(field, resolution, built, { scanGrid: false })
        : null;
      componentValidationMilliseconds = performance.now() - validationStarted;
      if (finalization) setFinalizationStage(finalization, "componentValidation", componentValidationMilliseconds);
    }

    if (!built) throw new Error("Final Surface mesh is unavailable");
    const cpuReady = performance.now();
    if (finalization) {
      const measuredMeshReady = finalization.timestamps.tMeshReady;
      transitionFinalization(finalization, "FINAL_CPU_READY", cpuReady);
      finalization.timestamps.tMeshReady = measuredMeshReady ?? cpuReady;
      finalization.counts.heapAfterCpuBuildBytes = heapUsedBytes();
      lastCompletedGenerationId = finalization.finalGenerationId;
      finalization.counts.finalRequests = 1;
      finalization.counts.finalStarts = 1;
      finalization.counts.finalCpuCompletions = 1;
      finalization.counts.finalUploadSubmissions = 0;
      finalization.counts.finalSurfaceApplies = 0;
      finalization.counts.staleResultDiscards = 0;
    }

    if (finalization?.finalProfile === "cpu-only") {
      updateFinalizationCounts(finalization, evaluationStats, effectiveResolution, null, built);
      finalization.status = "completed";
      finalization.timestamps.tReady = cpuReady;
      finalizationState = "FINAL_CPU_READY";
      stateMessage = `FINAL CPU READY · ${built.triangles.length} triangles`;
      recordFinalization(finalization);
      updateSurfaceUI();
      updateDebug();
      return;
    }

    const geometryStarted = performance.now();
    renderer.setPreviewSurface(built.triangles);
    const rendererSurface = renderer.surfaceUpdateStats();
    const geometryReady = performance.now();
    if (finalization) {
      finalization.timestamps.tGeometryReady = geometryReady;
      setFinalizationStage(finalization, "bufferGeometry", rendererSurface.bufferGeometryMilliseconds);
      setFinalizationStage(finalization, "bufferAttributes", rendererSurface.bufferAttributeMilliseconds);
      setFinalizationStage(finalization, "geometryPreparation", geometryReady - geometryStarted);
      updateFinalizationCounts(finalization, evaluationStats, effectiveResolution, rendererSurface, built);
      finalization.counts.heapAfterCpuBuildBytes ??= heapUsedBytes();
      finalization.counts.meshPositionBytes = rendererSurface.positionBufferBytes;
      finalization.counts.meshNormalBytes = rendererSurface.normalBufferBytes;
      finalization.counts.meshIndexBytes = rendererSurface.indexBufferBytes;
    }
    previewSurface = built;
    surfaceBuildSource = source;
    surfaceBuildSignature = materializationSignature();
    surfaceBuildMilliseconds = performance.now() - started;
    if (source === "provisional") {
      surfacePreviewBuildDurations = [...surfacePreviewBuildDurations, surfaceBuildMilliseconds].slice(-128);
      if (!uploadOnlyMeshCache) uploadOnlyMeshCache = built;
    }
    if (finalization?.finalProfile === "normal") uploadOnlyMeshCache = built;
    if (source === "provisional" && finalization === null) {
      stateMessage = `SURFACE PREVIEW · ${built.triangles.length} triangles · ${surfaceBuildMilliseconds.toFixed(1)} ms`;
    } else {
      stateMessage = `SURFACE READY · ${built.triangles.length} triangles · ${surfaceBuildMilliseconds.toFixed(1)} ms`;
    }
    if (pendingPointerupStageTimings && source === "authoritative") {
      pendingPointerupStageTimings.fieldPreparation = fieldPreparationMilliseconds;
      pendingPointerupStageTimings.effectiveResolution = effectiveResolutionMilliseconds;
      pendingPointerupStageTimings.meshGeneration = meshGenerationMilliseconds;
      pendingPointerupStageTimings.componentValidation = componentValidationMilliseconds;
      pendingPointerupStageTimings.effectiveResolutionValue = effectiveResolution;
      pendingPointerupStageTimings.triangleCount = built.triangles.length;
      pendingPointerupStageTimings.componentCount = surfaceDiagnostics?.componentCount ?? 0;
      pendingPointerupStageTimings.fieldQueryCount = evaluationStats?.queryCount ?? 0;
      pendingPointerupStageTimings.fieldCandidateEvaluationCount = evaluationStats?.candidateEvaluationCount ?? 0;
      pendingPointerupStageTimings.fieldMaxCandidateCount = evaluationStats?.maxCandidateCount ?? 0;
    }
    if (finalization) {
      const uploadSubmitted = performance.now();
      transitionFinalization(finalization, "FINAL_UPLOAD_SUBMITTED", uploadSubmitted);
      finalization.timestamps.tUploadSubmitted = uploadSubmitted;
      finalization.counts.finalUploadSubmissions = 1;
      finalization.counts.heapAfterUploadBytes = heapUsedBytes();
      setFinalizationStage(finalization, "uploadSubmission", uploadSubmitted - geometryReady);
    }
    updateSurfaceUI();
    const gpuUploadStarted = performance.now();
    renderScene();
    const firstRender = performance.now();
    if (pendingPointerupStageTimings && source === "authoritative") {
      pendingPointerupStageTimings.gpuUpload = firstRender - gpuUploadStarted;
    }
    if (finalization) {
      finalization.timestamps.tFirstRender = firstRender;
      finalization.timestamps.tProxyFrozenPresented = firstRender;
      setFinalizationStage(finalization, "renderSubmission", firstRender - gpuUploadStarted);
      setFinalizationStage(finalization, "geometryReadyToFirstRender", firstRender - (finalization.timestamps.tGeometryReady ?? firstRender));
      window.requestAnimationFrame(() => {
        if (!isCurrentFinalization(finalization)) {
          recordStaleFinalization(finalization, "stale-generation-discard");
          return;
        }
        renderer.setMaterialProxy(null);
        workspace.dataset.materialProxySegmentCount = "0";
        finalization.timestamps.tNextRAF = performance.now();
        transitionFinalization(finalization, "FINAL_PRESENTED", performance.now());
        finalization.timestamps.tReady = performance.now();
        finalization.status = "completed";
        lastAppliedGenerationId = finalization.finalGenerationId;
        finalization.counts.finalSurfaceApplies = 1;
        finalization.counts.heapAfterUploadBytes ??= heapUsedBytes();
        lastFinalReadyTimestamp = finalization.timestamps.tReady;
        recordFinalization(finalization);
        scheduleFinalizationHeapSamples(finalization);
        updateSurfaceUI();
        redrawOverlay();
        updateDebug();
      });
    } else if (source === "authoritative" && currentSurfaceState() === "READY") {
      lastFinalReadyTimestamp = performance.now();
    }
  } catch (error) {
    if (finalization && error instanceof HanaPointFieldMeshCancelledError) {
      recordStaleFinalization(finalization, "cancelled-by-newer-generation");
      return;
    }
    previewSurface = null;
    surfaceBuildSource = null;
    surfaceBuildSignature = null;
    surfaceBuildMilliseconds = null;
    surfaceFieldEvaluationStats = null;
    renderer.setPreviewSurface(null);
    const message = error instanceof Error ? error.message : "unknown error";
    stateMessage = `SURFACE ERROR · ${message}`;
    if (finalization) {
      finalization.status = "failed";
      finalization.error = message;
      finalization.timestamps.tReady = performance.now();
      finalizationState = "IDLE";
      recordFinalization(finalization);
    }
  }
  if (source === "provisional") surfacePreviewLastEndMilliseconds = performance.now();
  updateSurfaceUI();
  redrawOverlay();
  updateDebug();
}

function requestAuthoritativeSurfaceRebuild(reason: string, documentChanged = true): void {
  if (!stroke3D || materialSamples.length === 0) {
    stateMessage = "SURFACE · Draw one Stroke first";
    updateDebug();
    return;
  }
  const trace = beginAuthoritativeFinalization(reason, null, documentChanged);
  refreshMaterialSamples(stroke3D, null, trace);
  runAuthoritativeFinalization(trace);
}

function finalizeSurfaceParameterChange(): void {
  cancelSurfacePreviewTimer();
  if (!showSurface || materialSamples.length === 0) return;
  if (activeStroke && provisionalStroke3D && materialSamples.length <= SURFACE_PREVIEW_MAX_SAMPLES) {
    rebuildSurface(SURFACE_PREVIEW_RESOLUTION, "provisional");
  } else if (stroke3D) {
    requestAuthoritativeSurfaceRebuild("parameter-change");
  }
}

centerlineToggle.addEventListener("click", () => {
  showCenterline = !showCenterline;
  updateDisplayUI();
  redrawOverlay();
  updateDebug();
});
samplesToggle.addEventListener("click", () => {
  showSamples = !showSamples;
  updateDisplayUI();
  redrawOverlay();
  updateDebug();
});
surfaceToggle.addEventListener("click", () => {
  showSurface = !showSurface;
  updateDisplayUI();
  if (!showSurface) {
    cancelSurfacePreviewTimer();
    cancelMaterialProxyFrame();
    cancelEditPreviewFrame();
    renderer.setMaterialProxy(null);
  }
  else if (activeStroke) {
    updateProvisionalStroke();
    scheduleSurfacePreview();
    scheduleMaterialProxyFrame();
  } else if (stroke3D && materialSamples.length > 0) {
    requestAuthoritativeSurfaceRebuild("surface-toggle-on", false);
  }
  renderScene();
  redrawOverlay();
  updateDebug();
});
thicknessSlider.addEventListener("input", () => {
  stopAutoRotate();
  setThickness(Number(thicknessSlider.value));
});
smoothnessSlider.addEventListener("change", () => {
  finalizeSurfaceParameterChange();
  scheduleRecoveryCheckpoint("smoothness");
});
thicknessSlider.addEventListener("change", () => {
  finalizeSurfaceParameterChange();
  scheduleRecoveryCheckpoint("thickness");
});
rebuildSurfaceButton.addEventListener("click", () => requestAuthoritativeSurfaceRebuild("manual-rebuild", false));

clearButton.addEventListener("click", () => {
  cancelPendingFinalizationForEdit();
  cancelSurfacePreviewTimer();
  cancelMaterialProxyFrame();
  cancelEditPreviewFrame();
  rawGestures.length = 0;
  rawPressureTotal = 0;
  rawTimeTotal = 0;
  lastRawCaptureDiagnostics = null;
  stroke3D = null;
  provisionalStroke3D = null;
  editPreviewStroke3D = null;
  lastAdaptiveControlFit = null;
  authoritativeCenterline = [];
  provisionalCenterline = [];
  editPreviewCenterline = [];
  editPreviewMaterialSamples = [];
  activeStroke = null;
  liveWorkingPath = null;
  activeRawPath = null;
  activeRawPathStroke = null;
  activeRawPathRect = null;
  cameraDrag = null;
  controlDrag = null;
  previewSurface = null;
  surfaceBuildSource = null;
  surfaceBuildSignature = null;
  surfaceBuildMilliseconds = null;
  surfacePreviewBuildCount = 0;
  surfacePreviewLastStartMilliseconds = null;
  surfacePreviewLastEndMilliseconds = null;
  surfacePointerEndMilliseconds = null;
  surfacePreviewBuildDurations = [];
  surfaceDiagnostics = null;
  surfaceFieldEvaluationStats = null;
  longTaskDurations = [];
  pendingPointerupStageTimings = null;
  lastPointerupStageTimings = null;
  materialProxyFrameCount = 0;
  materialProxyUpdateDurations = [];
  materialProxyRenderDurations = [];
  pendingControlPointer = null;
  mouseEditNearestDurations = [];
  mouseEditHandlerDurations = [];
  mouseEditControlUpdateDurations = [];
  mouseEditSoftEditDurations = [];
  mouseEditSmoothRebuildDurations = [];
  mouseEditPreviewUpdateDurations = [];
  mouseEditPreviewProcessDurations = [];
  mouseEditInputQueueLatencies = [];
  mouseEditEndToEndLatencies = [];
  mouseEditRenderSubmissionDurations = [];
  mouseEditRafAgeDurations = [];
  mouseEditFrameIntervals = [];
  mouseEditRaycastDurations = [];
  mouseEditIntersectMeshCount = 0;
  mouseEditPointerMoveCount = 0;
  mouseEditPreviewFrameCount = 0;
  mouseEditDroppedPointerMoves = 0;
  mouseEditFirstPointerTimestamp = null;
  mouseEditLastPointerTimestamp = null;
  mouseEditFirstPreviewTimestamp = null;
  mouseEditLastPreviewTimestamp = null;
  mouseEditOldestPointerAge = 0;
  mouseEditMaxPendingRaf = 0;
  mouseEditLastEventTimestamp = null;
  mouseEditLastHandlerStart = null;
  mouseEditLastHandlerEnd = null;
  mouseEditLastLatestStateUpdated = null;
  mouseEditLastRafStart = null;
  mouseEditLastPreviewUpdateEnd = null;
  mouseEditLastRenderSubmission = null;
  mouseEditFinalMaterialMilliseconds = null;
  mouseEditFinalSurfaceMilliseconds = null;
  mouseEditSessionNumber = 0;
  mouseEditSessionResourceBefore = null;
  mouseEditSessionHistory = [];
  mouseEditSessionGeometryBefore = null;
  mouseEditSessionRenderBefore = null;
  mouseEditSessionReadyToEditMilliseconds = null;
  lastFinalReadyTimestamp = null;
  mouseEditPreviewRejectCount = 0;
  mouseEditLastPreviewRejectReason = "";
  mouseEditPipelineFrames = [];
  mouseEditPointerRevision = 0;
  documentRevision = 0;
  finalRequestId = 0;
  finalGenerationId = 0;
  lastCompletedGenerationId = 0;
  lastAppliedGenerationId = 0;
  finalizationState = "IDLE";
  finalizeReason = "—";
  activeFinalization = null;
  finalizationHistory = [];
  uploadOnlyMeshCache = null;
  resetEditDiagnosticMarkers();
  livePathProfiler.reset();
  liveLastEventTimestamp = null;
  workspace.dataset.materialProxySegmentCount = "0";
  renderer.setPreviewSurface(null);
  renderer.setMaterialProxy(null);
  selectedControlPoint = null;
  lastAffectedControlIndices = [];
  lastEditBoundsBefore = null;
  lastEditBoundsAfter = null;
  showSurface = true;
  showCenterline = true;
  showSamples = false;
  setSmoothness(0);
  interactionModes[0] = "edit";
  interactionModes[1] = "view";
  interactionModes[2] = "draw";
  interactionModes[3] = "edit";
  stateMessage = "READY · Draw one Stroke in Front, Right, or Top";
  clearRecoveryCheckpoint();
  updateDisplayUI();
  refreshLayout();
  updateDebug();
});

function captureEditorState(): HanaEditorState {
  return {
    viewportMode,
    selectedViewportId: viewportId(selectedViewport),
    split: { ...split },
    softEditStrength,
    viewports: directions.map((direction, index) => ({
      id: viewportId(index),
      viewDirection: direction,
      interactionMode: interactionModes[index],
      camera: renderer.cameraState(index),
    })),
  };
}

function snapshot() {
  const document = createHanaAuthoringDocument(
    rawGestures,
    stroke3D ? [stroke3D] : [],
    { documentId: recoveryDocumentId, editorState: captureEditorState() },
  );
  document.revision = documentRevision;
  if (document.strokes[0]) {
    document.strokes[0].materialSettings = defaultHanaMaterialSettings(thickness);
    document.strokes[0].curveSettings.smoothness = smoothness;
  }
  return document;
}

async function restoreRecoveryCheckpoint(): Promise<void> {
  if (recoveryRestoreAttempted) return;
  recoveryRestoreAttempted = true;
  let checkpoint: Awaited<ReturnType<typeof recoveryStore.load>>;
  try {
    checkpoint = await recoveryStore.load(recoveryDocumentId);
  } catch {
    recoveryStatusText = "Local recovery: unavailable";
    updateRecoveryUI();
    return;
  }
  if (!checkpoint || !isNewerHanaRecoveryCheckpoint(checkpoint, recoveryDocumentId, documentRevision)) return;
  if (rawGestures.length > 0 || stroke3D || activeStroke) return;
  const document = migrateHanaDocument(checkpoint.document);
  rawGestures.push(...document.rawGestures.strokes);
  lastRawCaptureDiagnostics = summarizeRawGestureCapture(rawGestures[0]?.points ?? []);
  rawPressureTotal = rawGestures[0]?.points.reduce((total, point) => total + point.pressure, 0) ?? 0;
  rawTimeTotal = rawGestures[0]?.points.reduce((total, point) => total + point.time, 0) ?? 0;
  documentRevision = document.revision;
  viewportMode = document.editorState.viewportMode;
  const selected = directions.findIndex((direction) => `viewport-${direction}` === document.editorState.selectedViewportId);
  selectedViewport = selected >= 0 ? selected : 2;
  split = { ...document.editorState.split };
  if (document.editorState.softEditStrength === "off"
    || document.editorState.softEditStrength === "low"
    || document.editorState.softEditStrength === "medium") {
    softEditStrength = document.editorState.softEditStrength;
  }
  document.editorState.viewports.forEach((viewport, index) => {
    if (index < interactionModes.length && modeOptions(index).includes(viewport.interactionMode)) {
      interactionModes[index] = viewport.interactionMode;
    }
  });
  const savedStroke = document.strokes[0];
  if (!savedStroke) {
    recoveryStatusText = `Local recovery: empty checkpoint · rev ${document.revision}`;
    updateRecoveryUI();
    refreshLayout();
    updateDebug();
    return;
  }
  const restoredStroke3D = stroke3DFromHanaStroke(savedStroke);
  stroke3D = restoredStroke3D;
  const restoredSmoothness = Number(restoredStroke3D.curve.smoothness);
  smoothness = Number.isFinite(restoredSmoothness) ? Math.max(0, Math.min(1, restoredSmoothness)) : 0;
  const restoredThickness = Number(savedStroke.materialSettings.baseRadius);
  thickness = Number.isFinite(restoredThickness)
    ? restoredThickness
    : HANA_THICKNESS_DEFAULT;
  authoritativeCenterline = sampleSmoothCenterline(restoredStroke3D);
  refreshMaterialSamples(stroke3D);
  interactionModes[0] = "edit";
  interactionModes[2] = "edit";
  selectedControlPoint = Math.floor(stroke3D.controlPoints.length / 2);
  stateMessage = `RECOVERED · ${stroke3D.controlPoints.length} controls · revision ${document.revision}`;
  recoveryStatusText = `Local recovery: restored · rev ${document.revision}`;
  updateSmoothnessUI();
  updateThicknessUI();
  updateSoftEditButtons();
  updateRecoveryUI();
  refreshLayout();
  updateDebug();
  if (showSurface && materialSamples.length > 0) {
    requestAuthoritativeSurfaceRebuild("recovery-restore", false);
  }
}

saveButton.addEventListener("click", () => {
  const savedDocument = snapshot();
  scheduleRecoveryCheckpoint("manual save");
  const blob = new Blob([JSON.stringify(savedDocument, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `hana-1c-document-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

document.addEventListener("visibilitychange", () => {
  lifecycleVisibility = document.visibilityState;
  lifecycleLastEvent = `visibility:${document.visibilityState}`;
  if (document.visibilityState === "hidden") {
    stopAutoRotate();
    scheduleRecoveryCheckpoint("visibility");
  } else {
    lifecycleResumeCount += 1;
  }
  updateLifecycleUI();
  updateDebug();
});

window.addEventListener("pagehide", () => {
  lifecyclePagehideCount += 1;
  lifecycleLastEvent = "pagehide";
  scheduleRecoveryCheckpoint("pagehide");
  updateLifecycleUI();
});

window.addEventListener("pageshow", () => {
  lifecycleResumeCount += 1;
  lifecycleLastEvent = "pageshow";
  updateLifecycleUI();
  updateDebug();
  void restoreRecoveryCheckpoint();
});

window.addEventListener("freeze", () => {
  lifecycleLastEvent = "freeze";
  scheduleRecoveryCheckpoint("freeze");
  updateLifecycleUI();
});

window.addEventListener("resume", () => {
  lifecycleResumeCount += 1;
  lifecycleLastEvent = "resume";
  updateLifecycleUI();
  updateDebug();
  void restoreRecoveryCheckpoint();
});

sceneCanvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  lifecycleContextLost = true;
  lifecycleLastEvent = "webglcontextlost";
  stateMessage = "RENDERER PAUSED · authoring document retained";
  updateLifecycleUI();
  updateDebug();
});

sceneCanvas.addEventListener("webglcontextrestored", () => {
  lifecycleContextLost = false;
  lifecycleLastEvent = "webglcontextrestored";
  renderer.setPreviewSurface(previewSurface?.triangles ?? null);
  renderer.setMaterialProxy(null);
  renderScene();
  redrawOverlay();
  updateLifecycleUI();
  updateDebug();
});

type HanaProbeWindow = Window & { __HANA_1C__?: { snapshot: typeof snapshot } };
(window as HanaProbeWindow).__HANA_1C__ = { snapshot };

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(workspace);
window.addEventListener("beforeunload", () => {
  resizeObserver.disconnect();
  renderer.dispose();
});

resize();
updateSmoothnessUI();
updateDisplayUI();
updateThicknessUI();
updateAutoRotateUI();
updateRecoveryUI();
updateLifecycleUI();
updateDebug();
initializeHanaAuthoringStackUi();
void refreshComputeHealth();
void restoreRecoveryCheckpoint();

// ---------------------------------------------------------------------------
// Three.js wiring: a fullscreen raymarch quad + pole-free TrackballControls. Structurally
// identical to pack/renderer.ts, but update() pushes host balls + a flat
// patch-point array (with owner indices) + thickness + roundK + mode into
// the shader.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { deriveSkinLayerVisibility, selectedBeadWireScale, type InternalObservationMode } from "./previewMeshBuffers.ts";
import { HOST_MAX_BALLS, PATCH_MAX_POINTS, fragmentShader, vertexShader } from "./shaders.ts";
import type { Ball, Patch, SkinMode } from "./field.ts";
import type { QuadFlowGrid } from "./quadFlow.ts";
import type { OpeningMeasurement } from "./openingMapWorkerProtocol.ts";
import type { DenseFlowerSample } from "./denseFlowerSample.ts";
import type { InternalStructureGraph, Vector3Value } from "./voronoi.ts";
import type { InternalAngleScreeningReport } from "./internalPrintGate.ts";
import type { SupportForest, SupportMember } from "./branchingSupport.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
import { dryWebContactBinKey, normalizeDryWebRequiredContacts } from "./dryWebAuthorPresentation.ts";
import type { TargetedGridContactFacts } from "./targetedGrid.ts";
import type { DryWebContactBinKey } from "./dryWebAuthorPresentation.ts";
import type { DryWebInsufficientEdge } from "./dryWebInsufficientEdgePresentation.ts";
import {
  ARTWORK_GRAPH_CURRENT_MARKER_COLOR,
  ARTWORK_GRAPH_STALE_MARKER_COLOR,
  type ArtworkGraphOverlayMarker,
} from "./artworkGraphOverlayPresentation.ts";
import type { DryWebContactFloorCategory } from "./dryWebContactFloorPresentation.ts";
import { elementDisplayName, elementLabelDepthOpacity, representativeElements } from "../../lib/elementLabels.ts";
import { layoutOpeningLabelsOutside, type ScreenRect } from "./openingLabelLayout.ts";
import {
  SUPPORT_SITE_PRESENTATION,
  buildSupportOverlayBatch,
  supportGlyphIndex,
  supportOverlayPasses,
  type SupportOverlayMarkerInput,
  type SupportSiteDepthMode,
} from "./supportOverlayPresentation.ts";
import { supportPaintVisibilityAllows } from "./supportPaint.ts";
import {
  VIEWPORT_CLIP_AXES,
  viewportPointVisible,
  type ViewportClippingBounds,
  type ViewportClippingState,
} from "./viewportClipping.ts";
import {
  buildUniformSpatialGrid3,
  queryUniformSpatialGridRayNeighborhood,
  queryUniformSpatialGridSphere,
  type UniformSpatialGrid3,
} from "./uniformSpatialGrid.ts";
import {
  DEFAULT_SKIN_VIEW_DIRECTIONS,
  SKIN_EDITOR_VIEW_SCHEMA,
  SKIN_VIEW_DIRECTIONS,
  skinAxomeRollDegrees,
  skinAxomeUpForRoll,
  skinViewAxisLegend,
  skinViewDirectionLabel,
  skinViewportAtPoint,
  skinViewportRects,
  toggleSkinViewportMode,
  validateSkinEditorViewDraft,
  type SkinEditorViewDraftV1,
  type SkinViewDirection,
  type SkinViewportMode,
  type SkinViewportRect,
} from "./multiViewport.ts";
import type { SkinEditorLayoutDraftV1 } from "./editorLayout.ts";
import {
  applyRhinoOrthographicDrag,
  isAxomeLeftRotateCandidate,
  RHINO_DRAG_THRESHOLD_PX,
  resolveRhinoViewportGesture,
  shouldStartRhinoCameraGesture,
  type RhinoViewportGesture,
} from "./rhinoViewportControls.ts";
import {
  overhangSupportSiteGroupVisible,
  type OverhangSupportSiteVisibilityPolicy,
} from "./dryWebInsideTargetVisibility.ts";
import {
  stage7RedFaceLocatorFaceCentroids,
  stage7RedFaceLocatorMarkerRadius,
} from "./stage7RedFaceLocatorPresentation.ts";
import type {
  RiskCluster,
  RiskDrivenInternalLatticeFacts,
  RiskSeverity,
  SupportCandidate,
} from "./riskDrivenInternalLattice.ts";
import type { FkeiRiskDrivenLatticeArtifact } from "./fkeiRiskDrivenLattice.ts";
import { normalizedScreenRect, screenTriangleIntersectsRect } from "./rebuild/screenRectSelection.ts";

// Note: the raymarch shader path's selection highlight color
// (uSelectedPatchOwner) is hardcoded inside shaders.ts's GLSL fragment
// shader (see AGENTS §5 "余白の色は全 Study 共通のスケールにする") and is
// untouched by this file -- only the bead view's selection cues (below) are
// T14's concern.
const PATCH_BEAD_COLOR = new THREE.Color(0.9, 0.72, 0.5); // matches shaders.ts's onPatch base color
const HOST_BEAD_COLOR = new THREE.Color(0.86, 0.87, 0.9); // matches shaders.ts's non-patch base color
// T13 A/B partition preview colors. Distinct from SELECTED_COLOR (single-
// patch pick) and from each other; UNASSIGNED_GROUP_COLOR is a warning red
// so a patch the author has neither seeded nor overridden stands out rather
// than silently defaulting into either side (instruction §2 "どちらを残すか
// の既定値や推奨ラベルを付けない" -- unassigned must never look like a
// quiet default, so it gets the warning treatment, same red family
// linking.ts's overlap warnings use elsewhere in this Study).
const GROUP_A_COLOR = new THREE.Color(0.35, 0.62, 0.95);
const GROUP_B_COLOR = new THREE.Color(0.95, 0.55, 0.25);
const UNASSIGNED_GROUP_COLOR = new THREE.Color(0.9, 0.15, 0.15);
const N_GROUP_COLORS = [
  new THREE.Color(0.35, 0.62, 0.95),
  new THREE.Color(0.95, 0.55, 0.25),
  new THREE.Color(0.34, 0.78, 0.5),
  new THREE.Color(0.72, 0.5, 0.92),
  new THREE.Color(0.25, 0.78, 0.82),
  new THREE.Color(0.94, 0.42, 0.67),
];
const CONTACT_WEAK_COLOR = new THREE.Color(0.92, 0.22, 0.2);
const CONTACT_TWO_COLOR = new THREE.Color(1.0, 0.58, 0.12);
const CONTACT_GOOD_COLOR = new THREE.Color(0.25, 0.76, 0.42);
// Dry Web author-preview bins. These colors are stable across threshold
// changes so the same Surface Pattern element remains visually identifiable;
// an insufficient bin is dimmed below its selected pass boundary.
const DRY_WEB_CONTACT_ZERO_COLOR = new THREE.Color(0.84, 0.18, 0.16);
const DRY_WEB_CONTACT_ONE_COLOR = new THREE.Color(0.90, 0.52, 0.14);
const DRY_WEB_CONTACT_TWO_COLOR = new THREE.Color(0.86, 0.72, 0.16);
const DRY_WEB_CONTACT_THREE_PLUS_COLOR = new THREE.Color(0.20, 0.66, 0.42);
// T14 selection visibility (作者Observation 2026-07-20 "選択できているのか
// わからない"): SELECTED_COLOR (orange-ish) reads too close to
// GROUP_B_COLOR to work as a bead recolor -- and recoloring the bead at all
// would erase the very A/B membership color the author needs to keep
// reading during a fix. So selection is now TWO independent, non-color
// cues instead: an oversized wireframe shell in a color that isn't
// confusable with A (blue) or B (orange) or the unassigned warning (red),
// plus dimming every OTHER bead so the selected one reads as "the bright
// one" even at a glance.
const SELECTION_OUTLINE_COLOR = new THREE.Color(1.0, 1.0, 0.65);
const SELECTION_DIM_FACTOR = 0.5; // instruction: 45-60%
const SEED_A_BADGE_COLOR = "#59c8ff";
const SEED_B_BADGE_COLOR = "#ff9b45";
// Checkpoint 1 risk overlay colors encode only the ranking heuristic. They
// intentionally do not reuse Surface/Dry Web/support colors.
const RISK_CLUSTER_COLORS: Record<RiskCluster["severity"], number> = {
  low: 0x5f9c99,
  medium: 0xe0bd39,
  high: 0xe88932,
  critical: 0xd9483b,
};
const RISK_CANDIDATE_COLOR = 0x72e7e2;
const RISK_TOP_CANDIDATE_COLOR = 0xffffff;

export type SkinViewMode = "raymarch" | "beads" | "mesh";
export type SkinDisplayStyle = "solid" | "ghost";
export type DenseSampleView = "3d" | "sixViews";

interface OpeningLabelDatum {
  id: string;
  color: string;
  areaMm2: number;
  perimeterMm: number;
  anchor: THREE.Vector3;
  normal: THREE.Vector3;
}

interface OpeningDomLabel {
  data: OpeningLabelDatum;
  element: HTMLDivElement;
  line: SVGLineElement;
  dx: number;
  dy: number;
  moved: boolean;
}

interface ElementDomLabel {
  element: HTMLDivElement;
  anchor: THREE.Vector3;
}

export type OverhangSupportSiteOverlayMarker = SupportOverlayMarkerInput;
export interface OverhangSupportSitePick {
  id: string;
  classification: string;
  back: boolean;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}
export interface OverhangSupportBrushCandidate extends Omit<OverhangSupportSitePick, "back"> {}
export interface SupportPaintPointerFrame {
  viewportIndex: number;
  ray: {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
  };
  pixelsPerObjectUnit: number;
}

interface SkinViewportSlot {
  camera: THREE.OrthographicCamera;
  controls: TrackballControls;
  direction: SkinViewDirection;
  frame: HTMLDivElement;
  directionButton: HTMLButtonElement;
  directionMenu: HTMLDivElement;
  axis: HTMLSpanElement;
}

const SUPPORT_MARKER_VERTEX_SHADER = /* glsl */ `
  uniform float uPointSize;
  uniform float uShowBrushEmphasis;
  attribute vec3 aMarkerColor;
  attribute float aMarkerShape;
  attribute float aMarkerEmphasis;
  varying vec3 vMarkerColor;
  varying float vMarkerShape;
  #include <clipping_planes_pars_vertex>

  void main() {
    vMarkerColor = aMarkerColor;
    vMarkerShape = aMarkerShape;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
    // Pull only enough to prevent surface z-fighting. A far-side site stays
    // behind the body and therefore fails the opaque front pass depth test.
    gl_Position.z -= 0.0008 * gl_Position.w;
    gl_PointSize = uPointSize * (1.0 + aMarkerEmphasis * 0.65 * uShowBrushEmphasis);
  }
`;

const SUPPORT_MARKER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uScreenDoorCoverage;
  varying vec3 vMarkerColor;
  varying float vMarkerShape;
  #include <clipping_planes_pars_fragment>

  float shapeField(vec2 point, float shape, float scale) {
    vec2 p = point / scale;
    if (shape < 0.5) return 1.0 - length(p);
    if (shape < 1.5) {
      float aboveBase = p.y + 0.75;
      float belowSides = (0.90 - p.y) * 0.55 - abs(p.x);
      return min(aboveBase, belowSides);
    }
    float diagonal = 0.22 - abs(abs(p.x) - abs(p.y));
    float extent = 0.82 - max(abs(p.x), abs(p.y));
    return min(diagonal, extent);
  }

  float bayer4(vec2 coordinate) {
    float x = mod(floor(coordinate.x), 4.0);
    float y = mod(floor(coordinate.y), 4.0);
    if (y < 1.0) {
      if (x < 1.0) return 0.0;
      if (x < 2.0) return 8.0;
      if (x < 3.0) return 2.0;
      return 10.0;
    }
    if (y < 2.0) {
      if (x < 1.0) return 12.0;
      if (x < 2.0) return 4.0;
      if (x < 3.0) return 14.0;
      return 6.0;
    }
    if (y < 3.0) {
      if (x < 1.0) return 3.0;
      if (x < 2.0) return 11.0;
      if (x < 3.0) return 1.0;
      return 9.0;
    }
    if (x < 1.0) return 15.0;
    if (x < 2.0) return 7.0;
    if (x < 3.0) return 13.0;
    return 5.0;
  }

  void main() {
    #include <clipping_planes_fragment>
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float outer = shapeField(point, vMarkerShape, 0.92);
    if (outer < 0.0) discard;
    if (uScreenDoorCoverage < 0.999) {
      // Circle, triangle and cross own disjoint 3/16 Bayer ranks. Back-marker
      // colors therefore never overwrite one another, regardless of draw order.
      float classStart = floor(vMarkerShape + 0.5) * 3.0;
      float relativeRank = mod(bayer4(gl_FragCoord.xy) - classStart + 16.0, 16.0);
      if (relativeRank >= uScreenDoorCoverage * 16.0) discard;
    }
    float inner = shapeField(point, vMarkerShape, 0.68);
    vec3 markerColor = inner >= 0.0 ? vMarkerColor : vec3(0.025);
    gl_FragColor = vec4(markerColor, 1.0);
    #include <colorspace_fragment>
  }
`;


export class SkinRenderer {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  private readonly viewportSlots: SkinViewportSlot[] = [];
  private viewportMode: SkinViewportMode = "one";
  private fourViewInitialized = false;
  private selectedViewport = 1;
  private viewportHalfHeight = 3.2;
  private viewportCenter = new THREE.Vector3();
  private viewportDistance = 8;
  private readonly viewportHud: HTMLDivElement;
  private readonly oneViewButton: HTMLButtonElement;
  private readonly fourViewsButton: HTMLButtonElement;
  private readonly verticalViewportDivider: HTMLDivElement;
  private readonly horizontalViewportDivider: HTMLDivElement;
  private fourSplitX = 0.5;
  private fourSplitY = 0.5;
  private rhinoCameraDrag: {
    pointerId: number;
    viewportIndex: number;
    gesture: RhinoViewportGesture;
    lastX: number;
    lastY: number;
    moved: boolean;
    plainLeftAxome: boolean;
  } | null = null;
  private axomeLeftRotateEnabled = true;
  private axomeLeftRotateCandidate: {
    pointerId: number;
    viewportIndex: number;
    startX: number;
    startY: number;
  } | null = null;
  private suppressContextMenuUntil = 0;
  private splitDrag: {
    axis: "x" | "y";
    pointerId: number;
    pendingClientCoordinate: number;
    frameId: number;
    restoreOrbit: boolean;
    handle: HTMLDivElement;
  } | null = null;
  private renderRequestCallback: (() => void) | null = null;
  private editorViewChangeCallback: (() => void) | null = null;
  private orbitEnabled = true;
  private restoredEditorViewPendingBounds = false;
  private material: THREE.ShaderMaterial;
  private container: HTMLElement;
  private raymarchQuad!: THREE.Mesh;
  private overlayMaterial!: THREE.MeshStandardMaterial;
  private overlayMesh: THREE.Mesh | null = null;
  private artworkGraphOverlayGroup: THREE.Group | null = null;
  private artworkGraphOverlayEnabled = false;
  private readonly artworkGraphMarkerGeometry = new THREE.OctahedronGeometry(1, 0);
  private dryWebContactFloorOverlayGroup: THREE.Group | null = null;
  private dryWebContactFloorOverlayEnabled = false;
  private dryWebInsufficientEdgeGroup: THREE.Group | null = null;
  private dryWebInsufficientEdgeOverlayEnabled = false;
  /** Display-only face-angle diagnosis. Red is still above the selected
   * angle threshold; teal means an internal strut reaches the finite mesh
   * contact band. It never changes the generated field or export mesh. */
  private surfaceAngleGroup: THREE.Group | null = null;
  private surfaceAngleShowInternal = false;
  /** Stage 7 presentation-only red-face locator. Its dimmed context and
   * bright red triangles are independent of the established three-color
   * surface-angle group and never alter the source mesh. */
  private dryWebRedFaceLocatorGroup: THREE.Group | null = null;
  private dryWebRedFaceLocatorEnabled = false;
  /** Stage 7 presentation-only nearest-edge paths. This is deliberately a
   * separate group from the red-face locator and is never exported/persisted. */
  private dryWebRedFaceDryWebCandidateGroup: THREE.Group | null = null;
  private dryWebRedFaceDryWebCandidateEnabled = false;
  /** Checkpoint 1 read-only risk clusters/candidates. This group never feeds
   * the mesh, graph, history, or export paths. */
  private riskDrivenInternalLatticeGroup: THREE.Group | null = null;
  private riskDrivenInternalLatticeFacts: RiskDrivenInternalLatticeFacts | null = null;
  private riskDrivenInternalLatticeOverlayEnabled = false;
  private riskDrivenPermanentLatticeGroup: THREE.Group | null = null;
  private overhangSupportSiteGroup: THREE.Group | null = null;
  private overhangSupportSiteVisibilityPolicy: OverhangSupportSiteVisibilityPolicy = "standard";
  private overhangSupportSiteGrid: UniformSpatialGrid3 | null = null;
  private overhangSupportSiteGeometry: THREE.BufferGeometry | null = null;
  private overhangSupportSiteIds: Array<string | null> = [];
  private overhangSupportSiteNormals: Float32Array<ArrayBufferLike> = new Float32Array();
  private overhangSupportSiteCommittedClassifications: string[] = [];
  private overhangSupportSiteCurrentClassifications: string[] = [];
  private readonly overhangSupportSiteIndexById = new Map<string, number>();
  private readonly overhangSupportSitePreviewIndices = new Set<number>();
  private readonly mixedFaceMaterial = new THREE.LineBasicMaterial({
    color: 0xb35cff, depthTest: false, depthWrite: false, toneMapped: false,
  });
  private readonly baseFootprintMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.82, depthTest: false, depthWrite: false, toneMapped: false,
  });
  private viewportClippingState: ViewportClippingState | null = null;
  private readonly viewportClippingPlanes: THREE.Plane[] = [];
  private appliedViewportClipPlaneCount = -1;
  private meshBoundsRevision = 0;
  private motifLowestPointGroup: THREE.Group | null = null;
  private motifLowestPointMarkers: MotifLowestPoint[] = [];
  private selectedMotifLowestPointPatchId: number | null = null;
  private readonly motifLowestPointGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly motifLowestUnreachedMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4c3f,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly motifLowestReachedMaterial = new THREE.MeshBasicMaterial({
    color: 0x19c7b6,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private quadFlowGridLines: THREE.LineSegments | null = null;
  /** Categorical opening regions and their labels. They deliberately use
   * normal scene depth testing: a far-side label must not show through mesh. */
  private openingGroup: THREE.Group | null = null;
  private denseSampleActive = false;
  private denseSampleView: DenseSampleView = "3d";
  private readonly openingLineLayer: SVGSVGElement;
  private readonly openingLabelLayer: HTMLDivElement;
  private readonly openingLabels: OpeningDomLabel[] = [];
  private readonly elementLabelLayer: HTMLDivElement;
  private readonly elementLabels: ElementDomLabel[] = [];
  private activeOpeningDrag: {
    pointerId: number;
    label: OpeningDomLabel;
    startX: number;
    startY: number;
    startDx: number;
    startDy: number;
  } | null = null;
  private readonly denseSampleAtlas: HTMLImageElement;
  private viewMode: SkinViewMode = "raymarch";
  private displayStyle: SkinDisplayStyle = "solid";
  private internalObservationMode: InternalObservationMode = "normal";
  private readonly internalNodeGeometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly internalEdgeGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  private readonly internalMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f8f88,
    roughness: 0.82,
    metalness: 0,
  });
  private readonly printSupportMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9823f,
    roughness: 0.86,
    metalness: 0,
  });
  /** Display-only angle screening colors. The ordinary Internal material is
   * left untouched so the overlay-off preview remains the established cyan.
   * Keep vertex colors off: this cylinder geometry has no `color` attribute,
   * while InstancedMesh supplies the per-edge color through `instanceColor`.
   * Enabling the geometry-color branch would multiply that instance color by
   * a missing/default vertex color and can render the rods black. */
  private readonly internalAngleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly internalAngleSelfSupportingColor = new THREE.Color(0x28a66f);
  private readonly internalAngleRiskColor = new THREE.Color(0xd64b42);
  private readonly selectedInternalEdgeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd23f,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly reinforcedInternalEdgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x32e6ff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly motifLowestSelectedMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd23f,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly motifLowestSelectedOutlineMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private internalNodeMesh: THREE.InstancedMesh | null = null;
  private internalEdgeMesh: THREE.InstancedMesh | null = null;
  private selectedInternalEdgeMesh: THREE.Mesh | null = null;
  private reinforcedInternalEdgeMesh: THREE.InstancedMesh | null = null;
  private internalStructureVisible = true;
  private printSupportNodeMesh: THREE.InstancedMesh | null = null;
  private printSupportEdgeMesh: THREE.InstancedMesh | null = null;
  private printSupportVisible = true;
  /** SKIN REBUILD final-mesh overhang candidates. This diagnostic overlay
   * is display-only and never changes BODY, support, history, or export. */
  private skinRebuildOverhangGroup: THREE.Group | null = null;
  private skinRebuildOverhangMesh: THREE.Mesh | null = null;
  private skinRebuildOverhangPositions: Float32Array | null = null;
  private skinRebuildOverhangFaceRegionIds: Int32Array | null = null;
  private reinforcedSkinRebuildOverhangRegionMesh: THREE.Mesh | null = null;
  private reinforcedSkinRebuildOverhangRegionIds = new Set<number>();
  private selectedSkinRebuildOverhangRegionMesh: THREE.Mesh | null = null;
  private skinRebuildOverhangVisible = true;
  private internalAngleScreening: InternalAngleScreeningReport | null = null;
  /** Phase A display geometry only. The same millimetre-space forest is
   * consumed here without regenerating or reclassifying Support Paint sites. */
  private phaseASupportGroup: THREE.Group | null = null;
  private phaseAObjectLiftSource = 0;
  private phaseADryWebVisible = false;
  /** Display-only XY build surface shared by 1 View and 4 Views.  It is not
   * part of the field, history, .fkei geometry, or exported STL. */
  private readonly printPlateGroup = new THREE.Group();
  private printPlateVisible = false;

  // --- Bead approximation view (T12) --------------------------------------
  // InstancedMesh spheres for every host ball and every patch point, with NO
  // uniform-array cap (unlike the raymarch quad's PATCH_MAX_POINTS budget --
  // see shaders.ts). This is a deliberate approximation, not a replacement:
  // the raymarch's smooth-min blending between neighboring points is
  // skipped entirely (each point is drawn as its own separate sphere), so
  // patches that rely on blending to read as one coherent blob (coins
  // especially) will look like a cluster of separate balls here rather than
  // a fused shape. Rings are largely unaffected by this (T12 spec: "リングは
  // 元々数珠なので見た目の乖離は小さいはず") since their nodes were never
  // meant to fully fuse into a solid anyway. Placement and density ARE exact
  // (every point, at its real position and radius) -- only the blending is
  // dropped. The on-screen caption in main.ts states this honestly.
  private readonly beadSphereGeo = new THREE.SphereGeometry(1, 10, 7);
  private readonly hostBeadMaterial = new THREE.MeshStandardMaterial({
    color: HOST_BEAD_COLOR,
    roughness: 0.9,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  private readonly patchBeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
  });
  private hostBeadMesh: THREE.InstancedMesh | null = null;
  private patchBeadMesh: THREE.InstancedMesh | null = null;
  private patchBeadOwner: number[] = []; // instance index -> patch id, for cheap re-color on selection change
  // T13: when set, bead colors follow A/B/unassigned instead of the plain
  // selection highlight (see recolorBeads). null = ordinary selection mode.
  private activeGroups: { A: Set<number>; B: Set<number> } | null = null;
  private activeNGroupByPatch: Map<number, number> | null = null;
  private activeContactCountByPatch: Map<number, number> | null = null;
  private activeDryWebContactCountByPatch: Map<number, number> | null = null;
  private dryWebContactTarget = 3;
  private contactTarget = 3;
  private beadGroupFilter: "both" | "A" | "B" = "both";
  private lastSelectedPatchId: number | null = null;

  // --- T14 selected-patch outline (instruction §2.1) -----------------------
  // A separate, small InstancedMesh sized to only the selected patch's own
  // points -- rebuilt on every selection change (cheap: at most a few dozen
  // instances) without touching patchBeadMesh's geometry at all.
  private readonly highlightMaterial = new THREE.MeshBasicMaterial({
    color: SELECTION_OUTLINE_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
    // In mesh view this is a source-construction cue, not an x-ray overlay:
    // front mesh surfaces continue to occlude the selected motif's far-side
    // beads. Keep this explicit rather than relying on Three's default.
    depthTest: true,
    depthWrite: false,
  });
  private highlightMesh: THREE.InstancedMesh | null = null;
  // Direct manipulation preview. Raymarch has no movable source geometry,
  // so a small wire bead set follows the pointer while the expensive fused
  // field remains untouched. Bead and mesh views reuse their existing
  // instance/highlight paths instead.
  private readonly dragPreviewMaterial = new THREE.MeshBasicMaterial({
    color: SELECTION_OUTLINE_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
  });
  private dragPreviewMesh: THREE.InstancedMesh | null = null;

  // --- T14 A/B endpoint badges (instruction §2.4) --------------------------
  // Camera-facing Sprites (always face the camera with no extra code, unlike
  // a marker mesh) with a canvas-drawn ring + letter, one each for the A/B
  // endpoint seed patches. Textures are cached by letter since there are
  // only ever two.
  private readonly badgeTextureCache = new Map<string, THREE.Texture>();
  private endpointBadges: { A: THREE.Sprite | null; B: THREE.Sprite | null } = { A: null, B: null };
  private patchBeadOriginalScale: number[] = []; // instance index -> radius, for the hide/show scale trick

  /** T13: color every patch bead by A/B/unassigned membership instead of the
   * plain single-selection highlight, and remember the grouping so a later
   * updateBeads() rebuild (e.g. after an unrelated pack/add/remove) can
   * re-apply it. Pass null to go back to plain selection coloring. */
  updateBeadGroups(groups: { A: Set<number>; B: Set<number> } | null): void {
    this.activeGroups = groups;
    if (groups) {
      this.activeDryWebContactCountByPatch = null;
      this.activeNGroupByPatch = null;
      this.activeContactCountByPatch = null;
    }
    this.recolorBeads();
    this.updateSelectionHighlight();
  }

  /** Generation-native N-way preview. Each patch retains its real position;
   * only its color changes to show graph ownership. */
  updateNBeadGroups(groups: Set<number>[] | null): void {
    this.activeNGroupByPatch = groups
      ? new Map(groups.flatMap((group, groupIndex) => [...group].map((patchId) => [patchId, groupIndex] as const)))
      : null;
    if (groups) {
      this.activeDryWebContactCountByPatch = null;
      this.activeGroups = null;
      this.activeContactCountByPatch = null;
    }
    this.beadGroupFilter = "both";
    this.recolorBeads();
    this.setBeadGroupFilter("both");
    this.updateSelectionHighlight();
  }

  /** Color the realized motifs by distinct touching neighbours. Red means
   * 0–1, orange means 2, and green means the requested target or more. */
  updateContactStrength(rows: Array<{ id: number; count: number }> | null, target = 3): void {
    this.activeContactCountByPatch = rows ? new Map(rows.map((row) => [row.id, row.count])) : null;
    this.contactTarget = Math.max(1, Math.round(target));
    if (rows) {
      this.activeDryWebContactCountByPatch = null;
      this.activeGroups = null;
      this.activeNGroupByPatch = null;
      this.beadGroupFilter = "both";
    }
    this.recolorBeads();
    this.updateSelectionHighlight();
  }

  /**
   * Stage 4 display-only contact preview. The graph has already supplied the
   * per-patch unique artwork contact facts; this method only recolors the
   * uncapped bead instances and never rebuilds the graph or exported mesh.
   * Passing null removes the Dry Web palette so stale colors cannot survive
   * cancellation, invalidation, or switching away from the stage.
   */
  updateDryWebContactPresentation(
    facts: TargetedGridContactFacts | null,
    requiredContacts = 3,
  ): void {
    this.activeDryWebContactCountByPatch = facts
      ? new Map(facts.patches.map((patch) => [patch.patchId, patch.contactCount]))
      : null;
    this.dryWebContactTarget = normalizeDryWebRequiredContacts(requiredContacts);
    if (facts) {
      // Dry Web is the active interpretation of the same beads. Do not let a
      // previous A/B/N/contact-strength palette obscure its four bins.
      this.activeGroups = null;
      this.activeNGroupByPatch = null;
      this.activeContactCountByPatch = null;
      this.beadGroupFilter = "both";
    }
    this.recolorBeads();
    this.updateSelectionHighlight();
  }

  /** T13 "Aのみ/Bのみ/A+B" one-touch toggle: hides the other group's beads by
   * zero-scaling their instance matrices (InstancedMesh has no per-instance
   * visibility flag, so this is the standard workaround) rather than
   * rebuilding geometry. */
  setBeadGroupFilter(filter: "both" | "A" | "B"): void {
    this.beadGroupFilter = filter;
    const mesh = this.patchBeadMesh;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const groups = this.activeGroups;
    for (let i = 0; i < this.patchBeadOwner.length; i++) {
      const id = this.patchBeadOwner[i];
      const r = this.patchBeadOriginalScale[i] ?? 0;
      const inA = groups?.A.has(id) ?? false;
      const inB = groups?.B.has(id) ?? false;
      const hidden =
        (filter === "A" && !inA) || (filter === "B" && !inB);
      mesh.getMatrixAt(i, m);
      const pos = new THREE.Vector3().setFromMatrixPosition(m);
      m.makeScale(hidden ? 0 : r, hidden ? 0 : r, hidden ? 0 : r).setPosition(pos);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // T14 §2.1: if the selected patch's own group just got filtered out,
    // its outline must disappear along with it (and reappear if the filter
    // is switched back).
    this.updateSelectionHighlight();
  }

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.localClippingEnabled = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.viewportHud = document.createElement("div");
    this.viewportHud.className = "multi-viewport-hud";
    this.viewportHud.setAttribute("aria-label", "3D viewport layout");
    this.oneViewButton = document.createElement("button");
    this.oneViewButton.type = "button";
    this.oneViewButton.textContent = "1";
    this.oneViewButton.title = "1 View";
    this.oneViewButton.setAttribute("aria-label", "1 View");
    this.oneViewButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setViewportMode("one", true);
    };
    this.fourViewsButton = document.createElement("button");
    this.fourViewsButton.type = "button";
    this.fourViewsButton.textContent = "4";
    this.fourViewsButton.title = "4 Views";
    this.fourViewsButton.setAttribute("aria-label", "4 Views");
    this.fourViewsButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setViewportMode("four", true);
    };
    const layoutToggle = document.createElement("div");
    layoutToggle.className = "multi-viewport-layout-toggle";
    layoutToggle.setAttribute("aria-label", "viewport layout");
    layoutToggle.append(this.oneViewButton, this.fourViewsButton);
    this.verticalViewportDivider = document.createElement("div");
    this.verticalViewportDivider.className = "multi-viewport-splitter is-vertical";
    this.horizontalViewportDivider = document.createElement("div");
    this.horizontalViewportDivider.className = "multi-viewport-splitter is-horizontal";
    this.configureViewportDivider(this.verticalViewportDivider, "x");
    this.configureViewportDivider(this.horizontalViewportDivider, "y");
    this.viewportHud.append(layoutToggle, this.verticalViewportDivider, this.horizontalViewportDivider);
    container.appendChild(this.viewportHud);

    this.openingLineLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.openingLineLayer.classList.add("opening-leader-layer");
    container.appendChild(this.openingLineLayer);
    this.openingLabelLayer = document.createElement("div");
    this.openingLabelLayer.className = "opening-label-layer";
    container.appendChild(this.openingLabelLayer);
    this.elementLabelLayer = document.createElement("div");
    this.elementLabelLayer.className = "element-label-layer";
    container.appendChild(this.elementLabelLayer);
    this.denseSampleAtlas = document.createElement("img");
    this.denseSampleAtlas.className = "dense-sample-atlas";
    this.denseSampleAtlas.src = "./samples/dense-flower-v6/six-views.png";
    this.denseSampleAtlas.alt = "高密度花モデル v6 の空隙マップ6方向一覧";
    this.denseSampleAtlas.hidden = true;
    container.appendChild(this.denseSampleAtlas);
    window.addEventListener("pointermove", (event) => {
      const drag = this.activeOpeningDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.label.dx = drag.startDx + event.clientX - drag.startX;
      drag.label.dy = drag.startDy + event.clientY - drag.startY;
      drag.label.moved = true;
      this.updateOpeningLabels();
    });
    const endOpeningDrag = (event: PointerEvent) => {
      const drag = this.activeOpeningDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.label.element.classList.remove("is-dragging");
      this.activeOpeningDrag = null;
    };
    window.addEventListener("pointerup", endOpeningDrag);
    window.addEventListener("pointercancel", endOpeningDrag);

    for (const [index, direction] of DEFAULT_SKIN_VIEW_DIRECTIONS.entries()) {
      const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.001, 200);
      const controls = new TrackballControls(camera, this.renderer.domElement);
      controls.rotateSpeed = 1.0;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.3;
      controls.staticMoving = true;
      controls.keys = ["", "", ""];
      controls.mouseButtons.LEFT = null;
      controls.mouseButtons.RIGHT = null;
      controls.noRotate = direction !== "axome";
      controls.enabled = index === this.selectedViewport;
      controls.addEventListener("change", () => this.renderRequestCallback?.());
      controls.addEventListener("end", () => this.editorViewChangeCallback?.());

      const frame = document.createElement("div");
      frame.className = "multi-viewport-frame";
      frame.dataset.viewport = String(index);
      const header = document.createElement("div");
      header.className = "multi-viewport-frame-header";
      const directionButton = document.createElement("button");
      directionButton.type = "button";
      directionButton.className = "multi-viewport-title-button";
      directionButton.textContent = `${skinViewDirectionLabel(direction)} ▼`;
      directionButton.setAttribute("aria-haspopup", "menu");
      directionButton.setAttribute("aria-expanded", "false");
      directionButton.setAttribute("aria-label", `viewport ${index + 1}: ${skinViewDirectionLabel(direction)}`);
      const axis = document.createElement("span");
      axis.className = "multi-viewport-axis";
      axis.textContent = skinViewAxisLegend(direction);
      const directionMenu = document.createElement("div");
      directionMenu.className = "multi-viewport-direction-menu";
      directionMenu.setAttribute("role", "menu");
      directionMenu.hidden = true;
      for (const optionDirection of SKIN_VIEW_DIRECTIONS) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "menuitem");
        option.textContent = skinViewDirectionLabel(optionDirection);
        option.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.selectViewport(index);
          this.setViewportDirection(index, optionDirection, true);
          this.closeViewportDirectionMenus();
        };
        directionMenu.appendChild(option);
      }
      const reset = document.createElement("button");
      reset.type = "button";
      reset.setAttribute("role", "menuitem");
      reset.textContent = "Reset View";
      reset.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectViewport(index);
        this.resetViewportCamera(index, true);
        this.closeViewportDirectionMenus();
      };
      directionMenu.appendChild(reset);
      directionButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = directionMenu.hidden;
        this.selectViewport(index);
        this.closeViewportDirectionMenus();
        directionMenu.hidden = !open;
        directionButton.setAttribute("aria-expanded", String(open));
      };
      directionButton.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.closeViewportDirectionMenus();
        this.selectViewport(index);
        this.setViewportMode(toggleSkinViewportMode(this.viewportMode), true);
      };
      header.append(directionButton, axis, directionMenu);
      frame.appendChild(header);
      this.viewportHud.appendChild(frame);
      this.viewportSlots.push({ camera, controls, direction, frame, directionButton, directionMenu, axis });
    }
    for (let index = 0; index < this.viewportSlots.length; index++) this.resetViewportCamera(index, false);
    this.configureRhinoCameraInput();

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uHostPos: { value: Array.from({ length: HOST_MAX_BALLS }, () => new THREE.Vector3()) },
        uHostRadius: { value: new Float32Array(HOST_MAX_BALLS) },
        uHostCount: { value: 0 },
        uHostK: { value: 0.6 },
        uThickness: { value: 0.12 },
        uPatchPos: { value: Array.from({ length: PATCH_MAX_POINTS }, () => new THREE.Vector3()) },
        // x = radius, y = owner index (see shaders.ts's uPatchData comment).
        uPatchData: { value: Array.from({ length: PATCH_MAX_POINTS }, () => new THREE.Vector2()) },
        uPatchPointCount: { value: 0 },
        uRoundK: { value: 0.05 },
        uMode: { value: 0 },
        uSelectedPatchOwner: { value: -1 },
        uCoinBulge: { value: 0 },
        uCoinBulgeBalance: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uCamInverseProjection: { value: new THREE.Matrix4() },
        uCamInverseView: { value: new THREE.Matrix4() },
        uCameraOrthographic: { value: 1 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4) },
        uClipEnabled: { value: new THREE.Vector3() },
        uClipPosition: { value: new THREE.Vector3() },
        uClipDirection: { value: new THREE.Vector3(1, 1, 1) },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.raymarchQuad = quad;

    // Full-mesh overlay: the raymarch view is capped by the shader's uniform
    // budget (first ~160 patches / 256 points) and silently under-draws dense
    // packings — the author read a fully packed skin as "隙間だらけ"
    // (2026-07-13). This overlay renders the ACTUAL marching-tets mesh
    // (everything the STL will contain), bypassing the raymarch entirely.
    this.overlayMaterial = new THREE.MeshStandardMaterial({ color: 0xd9c49a, roughness: 0.85, metalness: 0 });
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);

    const plateSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x8ba6ad,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    plateSurface.name = "skin-print-plate-surface";
    const plateGrid = new THREE.GridHelper(1, 20, 0xbfe4e8, 0x66848b);
    plateGrid.name = "skin-print-plate-grid";
    plateGrid.rotation.x = Math.PI * 0.5;
    const gridMaterial = plateGrid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.62;
    gridMaterial.depthWrite = false;
    this.printPlateGroup.name = "skin-print-plate";
    this.printPlateGroup.visible = false;
    this.printPlateGroup.add(plateSurface, plateGrid);
    this.scene.add(this.printPlateGroup);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  get camera(): THREE.OrthographicCamera {
    return this.viewportSlots[this.selectedViewport].camera;
  }

  get controls(): TrackballControls {
    return this.viewportSlots[this.selectedViewport].controls;
  }

  private closeViewportDirectionMenus(): void {
    for (const slot of this.viewportSlots) {
      slot.directionMenu.hidden = true;
      slot.directionButton.setAttribute("aria-expanded", "false");
    }
  }

  private configureRhinoCameraInput(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => {
      const viewportRect = this.viewportRectFromClient(event.clientX, event.clientY);
      if (!viewportRect) return;
      const slot = this.viewportSlots[viewportRect.index];
      const shiftLeftPan = event.button === 0 && event.shiftKey;
      const plainLeftAxome = isAxomeLeftRotateCandidate(
        event.button,
        slot.direction,
        { shiftKey: event.shiftKey, metaKey: event.metaKey },
        this.axomeLeftRotateEnabled,
      );
      if (event.button === 0 && !shiftLeftPan && !plainLeftAxome) {
        // Selection, direct manipulation and Support Paint own plain left
        // input outside Axome, and while paint explicitly disables Axome-left rotate.
        event.stopImmediatePropagation();
        return;
      }
      if (!this.orbitEnabled || this.rhinoCameraDrag || this.axomeLeftRotateCandidate) return;
      this.selectViewport(viewportRect.index);
      if (plainLeftAxome) {
        // Keep a click available to selection. Rotation starts only after the
        // same 4 px threshold main.ts uses to reject a click as a drag.
        this.axomeLeftRotateCandidate = {
          pointerId: event.pointerId,
          viewportIndex: viewportRect.index,
          startX: event.clientX,
          startY: event.clientY,
        };
        canvas.setPointerCapture(event.pointerId);
        event.stopImmediatePropagation();
        return;
      }
      if (!shouldStartRhinoCameraGesture(event.button, event.shiftKey)) return;
      this.rhinoCameraDrag = {
        pointerId: event.pointerId,
        viewportIndex: viewportRect.index,
        gesture: shiftLeftPan ? "pan" : resolveRhinoViewportGesture(slot.direction, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
        }),
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        plainLeftAxome: false,
      };
      canvas.setPointerCapture(event.pointerId);
      this.container.classList.add("rhino-camera-dragging");
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });

    canvas.addEventListener("pointermove", (event) => {
      const candidate = this.axomeLeftRotateCandidate;
      if (candidate && candidate.pointerId === event.pointerId && !this.rhinoCameraDrag) {
        if (Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) <= RHINO_DRAG_THRESHOLD_PX) return;
        this.rhinoCameraDrag = {
          pointerId: candidate.pointerId,
          viewportIndex: candidate.viewportIndex,
          gesture: "rotate",
          lastX: candidate.startX,
          lastY: candidate.startY,
          moved: true,
          plainLeftAxome: true,
        };
        this.axomeLeftRotateCandidate = null;
        this.container.classList.add("rhino-camera-dragging");
      }
      const drag = this.rhinoCameraDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      if (dx === 0 && dy === 0) return;
      drag.moved = drag.moved || Math.hypot(dx, dy) > 1;
      const rect = this.viewportRects().find((candidateRect) => candidateRect.index === drag.viewportIndex);
      if (!rect) return;
      const dragSlot = this.viewportSlots[drag.viewportIndex];
      applyRhinoOrthographicDrag(
        dragSlot.camera,
        dragSlot.controls.target,
        drag.gesture,
        dx,
        dy,
        rect.width,
        rect.height,
      );
      dragSlot.controls.update();
      this.requestViewportRender();
    }, { capture: true });

    const finish = (event: PointerEvent) => {
      const candidate = this.axomeLeftRotateCandidate;
      if (candidate && candidate.pointerId === event.pointerId) {
        this.axomeLeftRotateCandidate = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        return;
      }
      const drag = this.rhinoCameraDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (!drag.plainLeftAxome) event.stopImmediatePropagation();
      this.rhinoCameraDrag = null;
      this.suppressContextMenuUntil = performance.now() + 500;
      this.container.classList.remove("rhino-camera-dragging");
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this.editorViewChangeCallback?.();
      this.requestViewportRender();
    };
    canvas.addEventListener("pointerup", finish, { capture: true });
    canvas.addEventListener("pointercancel", finish, { capture: true });
    canvas.addEventListener("contextmenu", (event) => {
      if (performance.now() <= this.suppressContextMenuUntil || event.target === canvas) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true });
  }

  isRhinoCameraGestureActive(): boolean {
    return this.rhinoCameraDrag !== null;
  }

  isAxomeViewportAt(clientX: number, clientY: number): boolean {
    const rect = this.viewportRectFromClient(clientX, clientY);
    return Boolean(rect && this.viewportSlots[rect.index]?.direction === "axome");
  }

  setAxomeLeftRotateEnabled(enabled: boolean): void {
    this.axomeLeftRotateEnabled = enabled;
    if (enabled || !this.axomeLeftRotateCandidate) return;
    const pointerId = this.axomeLeftRotateCandidate.pointerId;
    this.axomeLeftRotateCandidate = null;
    if (this.renderer.domElement.hasPointerCapture(pointerId)) this.renderer.domElement.releasePointerCapture(pointerId);
  }

  getFourViewSplit(): { x: number; y: number } {
    return { x: this.fourSplitX, y: this.fourSplitY };
  }

  setFourViewSplit(x: number, y: number, notify = false): void {
    this.fourSplitX = Math.max(0.2, Math.min(0.8, x));
    this.fourSplitY = Math.max(0.2, Math.min(0.8, y));
    this.syncViewportHud();
    this.requestViewportRender();
    if (notify) this.editorViewChangeCallback?.();
  }

  private viewportRects(): SkinViewportRect[] {
    return skinViewportRects(
      this.container.clientWidth,
      this.container.clientHeight,
      this.viewportMode,
      this.selectedViewport,
      { x: this.fourSplitX, y: this.fourSplitY },
    );
  }

  private configureViewportDivider(handle: HTMLDivElement, axis: "x" | "y"): void {
    handle.setAttribute("role", "separator");
    handle.tabIndex = 0;
    handle.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
    handle.addEventListener("pointerdown", (event) => {
      if (this.viewportMode !== "four" || this.splitDrag) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const restoreOrbit = this.orbitEnabled;
      this.setOrbitEnabled(false);
      this.splitDrag = {
        axis,
        pointerId: event.pointerId,
        pendingClientCoordinate: axis === "x" ? event.clientX : event.clientY,
        frameId: 0,
        restoreOrbit,
        handle,
      };
      handle.classList.add("is-dragging");
    });
    handle.addEventListener("pointermove", (event) => {
      const drag = this.splitDrag;
      if (!drag || drag.handle !== handle || drag.pointerId !== event.pointerId) return;
      drag.pendingClientCoordinate = axis === "x" ? event.clientX : event.clientY;
      if (drag.frameId === 0) drag.frameId = requestAnimationFrame(() => this.applyViewportDividerDrag());
    });
    const finish = (event: PointerEvent) => {
      const drag = this.splitDrag;
      if (!drag || drag.handle !== handle || drag.pointerId !== event.pointerId) return;
      if (drag.frameId !== 0) {
        cancelAnimationFrame(drag.frameId);
        drag.frameId = 0;
        this.applyViewportDividerDrag();
      }
      handle.classList.remove("is-dragging");
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      this.splitDrag = null;
      this.setOrbitEnabled(drag.restoreOrbit);
      this.editorViewChangeCallback?.();
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setFourViewSplit(axis === "x" ? 0.5 : this.fourSplitX, axis === "y" ? 0.5 : this.fourSplitY, true);
    });
  }

  private applyViewportDividerDrag(): void {
    const drag = this.splitDrag;
    if (!drag) return;
    drag.frameId = 0;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (drag.axis === "x") this.fourSplitX = Math.max(0.2, Math.min(0.8, (drag.pendingClientCoordinate - rect.left) / Math.max(1, rect.width)));
    else this.fourSplitY = Math.max(0.2, Math.min(0.8, (drag.pendingClientCoordinate - rect.top) / Math.max(1, rect.height)));
    this.syncViewportHud();
    this.requestViewportRender();
  }

  setRenderRequestCallback(callback: (() => void) | null): void {
    this.renderRequestCallback = callback;
  }

  setEditorViewChangeCallback(callback: (() => void) | null): void {
    this.editorViewChangeCallback = callback;
  }

  private requestViewportRender(): void {
    this.renderRequestCallback?.();
  }

  private cameraPose(direction: SkinViewDirection): { offset: THREE.Vector3; up: THREE.Vector3 } {
    switch (direction) {
      case "top": return { offset: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) };
      case "bottom": return { offset: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) };
      case "front": return { offset: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) };
      case "back": return { offset: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) };
      case "right": return { offset: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) };
      case "left": return { offset: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) };
      case "axome": return {
        offset: new THREE.Vector3(1, -1, 1).normalize(),
        up: new THREE.Vector3(-1, 1, 2).normalize(),
      };
    }
  }

  private updateViewportCameraProjection(index: number, rect?: SkinViewportRect): void {
    const slot = this.viewportSlots[index];
    if (!slot) return;
    const viewportRect = rect ?? this.viewportRects().find((candidate) => candidate.index === index);
    const aspect = viewportRect ? viewportRect.width / Math.max(1, viewportRect.height) : 1;
    slot.camera.left = -this.viewportHalfHeight * aspect;
    slot.camera.right = this.viewportHalfHeight * aspect;
    slot.camera.top = this.viewportHalfHeight;
    slot.camera.bottom = -this.viewportHalfHeight;
    slot.camera.near = Math.max(this.viewportDistance / 10000, 0.0001);
    slot.camera.far = Math.max(this.viewportDistance * 8, 100);
    slot.camera.updateProjectionMatrix();
    slot.controls.handleResize();
    if (viewportRect) {
      const canvasBox = this.renderer.domElement.getBoundingClientRect();
      slot.controls.screen.left = canvasBox.left + window.pageXOffset + viewportRect.x;
      slot.controls.screen.top = canvasBox.top + window.pageYOffset + viewportRect.y;
      slot.controls.screen.width = viewportRect.width;
      slot.controls.screen.height = viewportRect.height;
    }
  }

  resetViewportCamera(index: number, notify = false): void {
    const slot = this.viewportSlots[index];
    if (!slot) return;
    const pose = this.cameraPose(slot.direction);
    slot.controls.target.copy(this.viewportCenter);
    slot.camera.position.copy(this.viewportCenter).addScaledVector(pose.offset, this.viewportDistance);
    slot.camera.up.copy(pose.up);
    slot.camera.zoom = 1;
    slot.camera.lookAt(this.viewportCenter);
    this.updateViewportCameraProjection(index);
    slot.controls.noRotate = slot.direction !== "axome";
    slot.controls.update();
    if (notify) this.editorViewChangeCallback?.();
    this.requestViewportRender();
  }

  selectedAxomeRollDegrees(): number | null {
    const slot = this.viewportSlots[this.selectedViewport];
    if (!slot || slot.direction !== "axome") return null;
    return skinAxomeRollDegrees(
      [slot.camera.position.x, slot.camera.position.y, slot.camera.position.z],
      [slot.camera.up.x, slot.camera.up.y, slot.camera.up.z],
      [slot.controls.target.x, slot.controls.target.y, slot.controls.target.z],
    );
  }

  setSelectedAxomeRollDegrees(rollDegrees: number, notify = false): boolean {
    const slot = this.viewportSlots[this.selectedViewport];
    if (!slot || slot.direction !== "axome") return false;
    const up = skinAxomeUpForRoll(
      [slot.camera.position.x, slot.camera.position.y, slot.camera.position.z],
      [slot.controls.target.x, slot.controls.target.y, slot.controls.target.z],
      rollDegrees,
    );
    if (!up) return false;
    slot.camera.up.fromArray(up);
    slot.camera.lookAt(slot.controls.target);
    slot.controls.update();
    if (notify) this.editorViewChangeCallback?.();
    this.requestViewportRender();
    return true;
  }

  setViewportDirection(index: number, direction: SkinViewDirection, notify = false): void {
    const slot = this.viewportSlots[index];
    if (!slot || !SKIN_VIEW_DIRECTIONS.includes(direction)) return;
    slot.direction = direction;
    slot.directionButton.textContent = `${skinViewDirectionLabel(direction)} ▼`;
    slot.directionButton.setAttribute("aria-label", `viewport ${index + 1}: ${skinViewDirectionLabel(direction)}`);
    slot.axis.textContent = skinViewAxisLegend(direction);
    this.resetViewportCamera(index, false);
    this.syncViewportHud();
    if (notify) this.editorViewChangeCallback?.();
  }

  setViewportMode(mode: SkinViewportMode, notify = false): void {
    if (mode === "four" && !this.fourViewInitialized) {
      this.fourViewInitialized = true;
      for (const [index, direction] of DEFAULT_SKIN_VIEW_DIRECTIONS.entries()) {
        if (this.viewportSlots[index]?.direction !== direction) this.setViewportDirection(index, direction, false);
      }
    }
    this.closeViewportDirectionMenus();
    this.viewportMode = mode;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mode === "four" ? 1.5 : 2));
    this.resize();
    this.syncViewportHud();
    if (notify) this.editorViewChangeCallback?.();
    this.requestViewportRender();
  }

  selectViewport(index: number): void {
    if (!this.viewportSlots[index] || index === this.selectedViewport) return;
    this.selectedViewport = index;
    for (const [slotIndex, slot] of this.viewportSlots.entries()) {
      slot.controls.enabled = this.orbitEnabled && slotIndex === this.selectedViewport;
    }
    this.syncViewportHud();
    this.editorViewChangeCallback?.();
    this.requestViewportRender();
  }

  viewportRectFromClient(clientX: number, clientY: number): SkinViewportRect | null {
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - canvasRect.left;
    const y = clientY - canvasRect.top;
    if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) return null;
    return skinViewportAtPoint(
      x, y, canvasRect.width, canvasRect.height, this.viewportMode, this.selectedViewport,
      { x: this.fourSplitX, y: this.fourSplitY },
    );
  }

  /** Camera-only Paint input. It never selects a viewport, raycasts geometry,
   * changes a Buffer, or requests a WebGL render. */
  supportPaintPointerFrame(clientX: number, clientY: number): SupportPaintPointerFrame | null {
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const rect = this.viewportRectFromClient(clientX, clientY);
    if (!rect) return null;
    const slot = this.viewportSlots[rect.index];
    const camera = slot?.camera;
    if (!camera) return null;
    camera.updateMatrixWorld();
    const localX = clientX - canvasRect.left - rect.x;
    const localY = clientY - canvasRect.top - rect.y;
    const ndcX = localX / Math.max(1, rect.width) * 2 - 1;
    const ndcY = 1 - localY / Math.max(1, rect.height) * 2;
    const origin = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
    const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
    const direction = far.sub(origin).normalize();
    const verticalObjectSpan = (camera.top - camera.bottom) / Math.max(1e-9, camera.zoom);
    return {
      viewportIndex: rect.index,
      ray: {
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      },
      pixelsPerObjectUnit: rect.height / Math.max(1e-9, verticalObjectSpan),
    };
  }

  supportPaintBrushScreenScale(clientX: number, clientY: number): { viewportIndex: number; pixelsPerObjectUnit: number } | null {
    const rect = this.viewportRectFromClient(clientX, clientY);
    if (!rect) return null;
    const camera = this.viewportSlots[rect.index]?.camera;
    if (!camera) return null;
    const verticalObjectSpan = (camera.top - camera.bottom) / Math.max(1e-9, camera.zoom);
    return { viewportIndex: rect.index, pixelsPerObjectUnit: rect.height / Math.max(1e-9, verticalObjectSpan) };
  }

  activateViewportAt(clientX: number, clientY: number): boolean {
    const rect = this.viewportRectFromClient(clientX, clientY);
    if (!rect) return false;
    this.selectViewport(rect.index);
    return true;
  }

  private syncViewportHud(): void {
    const rects = this.viewportRects();
    const rectByIndex = new Map(rects.map((rect) => [rect.index, rect]));
    this.container.classList.toggle("multi-view-four", this.viewportMode === "four");
    this.openingLineLayer.style.display = this.viewportMode === "four" ? "none" : "";
    this.openingLabelLayer.style.display = this.viewportMode === "four" ? "none" : "";
    this.elementLabelLayer.style.display = this.viewportMode === "four" ? "none" : "";
    for (const [index, slot] of this.viewportSlots.entries()) {
      const rect = rectByIndex.get(index);
      slot.frame.hidden = !rect;
      slot.frame.classList.toggle("is-selected", index === this.selectedViewport);
      slot.directionButton.classList.toggle("is-active", index === this.selectedViewport);
      if (!rect) continue;
      Object.assign(slot.frame.style, {
        left: rect.x + "px",
        top: rect.y + "px",
        width: rect.width + "px",
        height: rect.height + "px",
      });
      this.updateViewportCameraProjection(index, rect);
    }
    this.oneViewButton.classList.toggle("is-active", this.viewportMode === "one");
    this.fourViewsButton.classList.toggle("is-active", this.viewportMode === "four");
    const showSplitters = this.viewportMode === "four";
    this.verticalViewportDivider.hidden = !showSplitters;
    this.horizontalViewportDivider.hidden = !showSplitters;
    this.verticalViewportDivider.style.left = `${this.fourSplitX * 100}%`;
    this.horizontalViewportDivider.style.top = `${this.fourSplitY * 100}%`;
  }

  setViewportBoundsFromPositions(positions: Float32Array): void {
    if (positions.length < 3) return;
    const box = new THREE.Box3();
    for (let index = 0; index + 2 < positions.length; index += 3) {
      box.expandByPoint(new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2]));
    }
    if (box.isEmpty()) return;
    box.getCenter(this.viewportCenter);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 0.01);
    this.viewportHalfHeight = span * 0.62;
    this.viewportDistance = span * 2.2;
    if (this.restoredEditorViewPendingBounds) {
      this.restoredEditorViewPendingBounds = false;
      for (let index = 0; index < this.viewportSlots.length; index++) this.updateViewportCameraProjection(index);
    } else {
      for (let index = 0; index < this.viewportSlots.length; index++) this.resetViewportCamera(index, false);
    }
    this.syncViewportHud();
    this.requestViewportRender();
  }

  captureEditorViewDraft(layout?: SkinEditorLayoutDraftV1): SkinEditorViewDraftV1 {
    const editorLayout = layout ? {
      ...layout,
      fourSplitX: this.fourSplitX,
      fourSplitY: this.fourSplitY,
    } : undefined;
    return validateSkinEditorViewDraft({
      schema: SKIN_EDITOR_VIEW_SCHEMA,
      mode: this.viewportMode,
      selectedViewport: this.selectedViewport,
      viewports: this.viewportSlots.map((slot) => ({
        direction: slot.direction,
        camera: {
          position: slot.camera.position.toArray(),
          up: slot.camera.up.toArray(),
          target: slot.controls.target.toArray(),
          zoom: slot.camera.zoom,
        },
      })),
      ...(editorLayout ? { layout: editorLayout } : {}),
    });
  }

  restoreEditorViewDraft(value: SkinEditorViewDraftV1): void {
    const draft = validateSkinEditorViewDraft(value);
    this.viewportMode = draft.mode;
    this.fourViewInitialized = true;
    this.selectedViewport = draft.selectedViewport;
    if (draft.layout) {
      this.fourSplitX = draft.layout.fourSplitX;
      this.fourSplitY = draft.layout.fourSplitY;
    }
    for (const [index, saved] of draft.viewports.entries()) {
      const slot = this.viewportSlots[index];
      slot.direction = saved.direction;
      slot.directionButton.textContent = `${skinViewDirectionLabel(saved.direction)} ▼`;
      slot.directionButton.setAttribute("aria-label", `viewport ${index + 1}: ${skinViewDirectionLabel(saved.direction)}`);
      slot.axis.textContent = skinViewAxisLegend(saved.direction);
      slot.controls.noRotate = saved.direction !== "axome";
      slot.camera.position.fromArray(saved.camera.position);
      slot.camera.up.fromArray(saved.camera.up);
      slot.controls.target.fromArray(saved.camera.target);
      slot.camera.zoom = saved.camera.zoom;
      slot.camera.updateProjectionMatrix();
      slot.controls.enabled = this.orbitEnabled && index === this.selectedViewport;
      slot.controls.update();
    }
    this.restoredEditorViewPendingBounds = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.viewportMode === "four" ? 1.5 : 2));
    this.resize();
    this.syncViewportHud();
    this.requestViewportRender();
  }

  setViewportClippingState(state: ViewportClippingState | null): void {
    this.viewportClippingState = state
      ? Object.fromEntries(VIEWPORT_CLIP_AXES.map((axis) => [axis, { ...state[axis] }])) as ViewportClippingState
      : null;
    this.viewportClippingPlanes.length = 0;
    if (this.viewportClippingState) {
      for (const axis of VIEWPORT_CLIP_AXES) {
        const clip = this.viewportClippingState[axis];
        if (!clip.enabled) continue;
        const normal = new THREE.Vector3(
          axis === "x" ? clip.direction : 0,
          axis === "y" ? clip.direction : 0,
          axis === "z" ? clip.direction : 0,
        );
        this.viewportClippingPlanes.push(new THREE.Plane(normal, -clip.direction * clip.position));
      }
    }
    const enabled = this.material.uniforms.uClipEnabled.value as THREE.Vector3;
    const position = this.material.uniforms.uClipPosition.value as THREE.Vector3;
    const direction = this.material.uniforms.uClipDirection.value as THREE.Vector3;
    for (const [index, axis] of VIEWPORT_CLIP_AXES.entries()) {
      const clip = this.viewportClippingState?.[axis];
      enabled.setComponent(index, clip?.enabled ? 1 : 0);
      position.setComponent(index, clip?.position ?? 0);
      direction.setComponent(index, clip?.direction ?? 1);
    }
  }

  getViewportClippingState(): ViewportClippingState | null {
    return this.viewportClippingState
      ? Object.fromEntries(VIEWPORT_CLIP_AXES.map((axis) => [axis, { ...this.viewportClippingState![axis] }])) as ViewportClippingState
      : null;
  }

  getMeshBoundsObject(): ViewportClippingBounds | null {
    if (!this.overlayMesh) return null;
    const geometry = this.overlayMesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return null;
    return {
      x: { min: box.min.x, max: box.max.x },
      y: { min: box.min.y, max: box.max.y },
      z: { min: box.min.z, max: box.max.z },
    };
  }

  getMeshBoundsRevision(): number {
    return this.meshBoundsRevision;
  }

  private applyViewportClippingToScene(): void {
    const planes = this.viewportClippingPlanes.length > 0 ? this.viewportClippingPlanes : null;
    const planeCountChanged = this.appliedViewportClipPlaneCount !== this.viewportClippingPlanes.length;
    this.renderer.localClippingEnabled = this.viewportClippingPlanes.length > 0;
    this.scene.traverse((object) => {
      if (object === this.raymarchQuad) return;
      const candidate = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
      if (!candidate.material) return;
      const materials = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
      for (const material of materials) {
        const referenceChanged = material.clippingPlanes !== planes;
        material.clippingPlanes = planes;
        material.clipIntersection = false;
        material.clipShadows = true;
        if (material instanceof THREE.ShaderMaterial) material.clipping = true;
        if (referenceChanged || planeCountChanged) material.needsUpdate = true;
      }
    });
    this.appliedViewportClipPlaneCount = this.viewportClippingPlanes.length;
  }

  /** Switch which of the three views is visible. Does not itself supply new
   * data -- call setMeshOverlay/updateBeads first (or they were already
   * populated from a previous call) to have something to show. */
  setViewMode(mode: SkinViewMode): void {
    this.viewMode = mode;
    this.applyLayerVisibility();
  }

  getViewMode(): SkinViewMode {
    return this.viewMode;
  }

  private disposeArtworkGraphOverlay(): void {
    if (!this.artworkGraphOverlayGroup) return;
    this.scene.remove(this.artworkGraphOverlayGroup);
    this.artworkGraphOverlayGroup.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      object.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    });
    this.artworkGraphOverlayGroup = null;
  }

  /**
   * Show one fixed-size wire marker for every frozen Surface node. This group
   * is deliberately separate from patch beads, Dry Web colors, selection,
   * mesh geometry, and every persisted state; marker size has no data meaning.
   */
  setArtworkGraphOverlay(markers: readonly ArtworkGraphOverlayMarker[], enabled: boolean): void {
    this.artworkGraphOverlayEnabled = enabled;
    this.disposeArtworkGraphOverlay();
    if (!enabled || markers.length === 0) {
      this.applyLayerVisibility();
      this.requestViewportRender();
      return;
    }

    const status = markers[0].status;
    const material = new THREE.MeshBasicMaterial({
      color: status === "current" ? ARTWORK_GRAPH_CURRENT_MARKER_COLOR : ARTWORK_GRAPH_STALE_MARKER_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(this.artworkGraphMarkerGeometry, material, markers.length);
    const matrix = new THREE.Matrix4();
    const markerScale = 0.12;
    for (const [index, marker] of markers.entries()) {
      matrix.makeScale(markerScale, markerScale, markerScale).setPosition(
        marker.position.x,
        marker.position.y,
        marker.position.z,
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 50;
    mesh.frustumCulled = false;
    mesh.userData.artworkGraphOverlay = true;
    mesh.userData.artworkGraphOverlayStatus = status;
    mesh.userData.artworkGraphOverlayNodeCount = markers.length;
    const group = new THREE.Group();
    group.name = "artwork-graph-node-overlay";
    group.position.z = this.phaseAObjectLiftSource;
    group.userData.artworkGraphOverlay = true;
    group.add(mesh);
    this.scene.add(group);
    this.artworkGraphOverlayGroup = group;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  clearArtworkGraphOverlay(): void {
    this.artworkGraphOverlayEnabled = false;
    this.disposeArtworkGraphOverlay();
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  private disposeRiskDrivenInternalLatticeOverlay(): void {
    const group = this.riskDrivenInternalLatticeGroup;
    if (!group) return;
    this.scene.remove(group);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      const candidate = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      if (candidate.geometry) geometries.add(candidate.geometry);
      if (candidate.material) {
        const entries = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
        entries.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.riskDrivenInternalLatticeGroup = null;
  }

  /** Rebuild independent Checkpoint 1 objects after a mesh replacement. */
  private rebuildRiskDrivenInternalLatticeOverlay(): void {
    this.disposeRiskDrivenInternalLatticeOverlay();
    const facts = this.riskDrivenInternalLatticeFacts;
    if (!this.riskDrivenInternalLatticeOverlayEnabled || !facts || facts.clusters.length === 0) {
      this.applyLayerVisibility();
      this.requestViewportRender();
      return;
    }

    const group = new THREE.Group();
    group.name = "risk-driven-internal-lattice-checkpoint-1";
    group.position.z = this.phaseAObjectLiftSource;
    group.userData.riskDrivenInternalLattice = true;
    group.userData.riskDrivenInternalLatticeAlgorithm = "checkpoint-1-v0";

    // One unit box geometry is instanced per severity. This keeps the
    // presentation to at most four cluster draw groups regardless of cluster
    // count while retaining a clear bounds-box reading.
    const clustersBySeverity: Record<RiskSeverity, RiskCluster[]> = {
      low: [],
      medium: [],
      high: [],
      critical: [],
    };
    for (const cluster of facts.clusters) clustersBySeverity[cluster.severity].push(cluster);
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const severities: readonly RiskSeverity[] = ["low", "medium", "high", "critical"];
    for (const severity of severities) {
      const clusters = clustersBySeverity[severity];
      if (clusters.length === 0) continue;
      const material = new THREE.MeshBasicMaterial({
        color: RISK_CLUSTER_COLORS[severity],
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        wireframe: true,
      });
      const mesh = new THREE.InstancedMesh(boxGeometry, material, clusters.length);
      const matrix = new THREE.Matrix4();
      for (const [index, cluster] of clusters.entries()) {
        const width = Math.max(facts.meshStep * 0.18, cluster.bounds.max.x - cluster.bounds.min.x);
        const height = Math.max(facts.meshStep * 0.18, cluster.bounds.max.y - cluster.bounds.min.y);
        const depth = Math.max(facts.meshStep * 0.18, cluster.bounds.max.z - cluster.bounds.min.z);
        matrix.makeScale(width, height, depth).setPosition(
          (cluster.bounds.min.x + cluster.bounds.max.x) / 2,
          (cluster.bounds.min.y + cluster.bounds.max.y) / 2,
          (cluster.bounds.min.z + cluster.bounds.max.z) / 2,
        );
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 48;
      mesh.frustumCulled = false;
      mesh.name = `risk-clusters-${severity}`;
      mesh.userData.riskClusterSeverity = severity;
      mesh.userData.riskClusterCount = clusters.length;
      group.add(mesh);
    }

    const markerSize = Math.max(facts.meshStep * 0.32, 0.012);
    const topCandidate = facts.candidates[0];
    const otherCandidates = topCandidate ? facts.candidates.slice(1) : [];
    let markerGeometry: THREE.OctahedronGeometry | null = null;
    const addMarkers = (
      candidates: readonly SupportCandidate[],
      color: number,
      name: string,
    ): void => {
      if (candidates.length === 0) return;
      markerGeometry ??= new THREE.OctahedronGeometry(markerSize, 0);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.InstancedMesh(markerGeometry, material, candidates.length);
      const matrix = new THREE.Matrix4();
      for (const [index, candidate] of candidates.entries()) {
        matrix.makeTranslation(candidate.position.x, candidate.position.y, candidate.position.z);
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = color === RISK_TOP_CANDIDATE_COLOR ? 51 : 50;
      mesh.frustumCulled = false;
      mesh.name = name;
      mesh.userData.riskCandidateCount = candidates.length;
      group.add(mesh);
    };
    addMarkers(otherCandidates, RISK_CANDIDATE_COLOR, "risk-candidates");
    addMarkers(topCandidate ? [topCandidate] : [], RISK_TOP_CANDIDATE_COLOR, "risk-top-candidate");

    // The box and marker geometries are shared by their InstancedMeshes;
    // disposal is deduplicated by disposeRiskDrivenInternalLatticeOverlay().
    this.scene.add(group);
    this.riskDrivenInternalLatticeGroup = group;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /**
   * Show Checkpoint 1 boxes and lower-side candidate markers. Every object is
   * an independent presentation object; the facts are never converted into
   * Internal Structure geometry or sent to an export Worker.
   */
  setRiskDrivenInternalLatticeOverlay(
    facts: RiskDrivenInternalLatticeFacts,
    enabled: boolean,
  ): void {
    this.riskDrivenInternalLatticeFacts = facts;
    this.riskDrivenInternalLatticeOverlayEnabled = enabled;
    this.rebuildRiskDrivenInternalLatticeOverlay();
  }

  clearRiskDrivenInternalLatticeOverlay(): void {
    this.riskDrivenInternalLatticeFacts = null;
    this.riskDrivenInternalLatticeOverlayEnabled = false;
    this.disposeRiskDrivenInternalLatticeOverlay();
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  private disposeRiskDrivenPermanentLatticeOverlay(): void {
    if (!this.riskDrivenPermanentLatticeGroup) return;
    this.scene.remove(this.riskDrivenPermanentLatticeGroup);
    this.riskDrivenPermanentLatticeGroup.traverse((object) => {
      const item = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      item.geometry?.dispose();
      for (const material of item.material ? (Array.isArray(item.material) ? item.material : [item.material]) : []) material.dispose();
    });
    this.riskDrivenPermanentLatticeGroup = null;
  }

  /** Restored checkpoint geometry only. It is deliberately distinct from
   * Checkpoint 1 ranking overlay and never changes the field/history. */
  setRiskDrivenPermanentLatticeOverlay(artifact: FkeiRiskDrivenLatticeArtifact, enabled: boolean): void {
    this.disposeRiskDrivenPermanentLatticeOverlay();
    if (!enabled) { this.requestViewportRender(); return; }
    const group = new THREE.Group(); group.name = "risk-driven-permanent-lattice-v0";
    const linePositions: number[] = [];
    for (const edge of artifact.graph.edges) {
      const a = artifact.graph.nodes[edge.start]!.position; const b = artifact.graph.nodes[edge.end]!.position;
      linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x83f5e5, depthTest: false, transparent: true, opacity: 0.95 }));
    lines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3)); lines.renderOrder = 55; group.add(lines);
    const points = new THREE.BufferGeometry(); const colors: number[] = []; const positions: number[] = [];
    const roleColor: Record<string, THREE.Color> = { "surface-anchor": new THREE.Color(0x77aaff), spine: new THREE.Color(0x83f5e5), junction: new THREE.Color(0xffffff), branch: new THREE.Color(0xffbd5c), "risk-target": new THREE.Color(0xff665c) };
    for (const node of artifact.graph.nodes) { positions.push(node.position.x, node.position.y, node.position.z); const color = roleColor[node.role]; colors.push(color.r, color.g, color.b); }
    points.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); points.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    group.add(new THREE.Points(points, new THREE.PointsMaterial({ size: Math.max(0.016, artifact.graph.nodes[0]?.radius ?? 0.02), vertexColors: true, depthTest: false, sizeAttenuation: true })));
    group.position.z = this.phaseAObjectLiftSource; this.scene.add(group); this.riskDrivenPermanentLatticeGroup = group; this.requestViewportRender();
  }

  clearRiskDrivenPermanentLatticeOverlay(): void {
    this.disposeRiskDrivenPermanentLatticeOverlay(); this.requestViewportRender();
  }

  private disposeDryWebContactFloorOverlay(): void {
    if (!this.dryWebContactFloorOverlayGroup) return;
    this.scene.remove(this.dryWebContactFloorOverlayGroup);
    this.dryWebContactFloorOverlayGroup.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      object.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    });
    this.dryWebContactFloorOverlayGroup = null;
  }

  /** Show one neutral wire marker per current contact-floor residual patch. */
  setDryWebContactFloorOverlay(
    markers: readonly { patchId: number; position: { x: number; y: number; z: number }; category: DryWebContactFloorCategory }[],
    category: DryWebContactFloorCategory,
  ): void {
    this.dryWebContactFloorOverlayEnabled = true;
    this.disposeDryWebContactFloorOverlay();
    if (markers.length === 0) {
      this.applyLayerVisibility();
      this.requestViewportRender();
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      color: "#e7e2d8",
      wireframe: true,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(this.artworkGraphMarkerGeometry, material, markers.length);
    const matrix = new THREE.Matrix4();
    const markerScale = 0.16;
    for (const [index, marker] of markers.entries()) {
      matrix.makeScale(markerScale, markerScale, markerScale).setPosition(
        marker.position.x,
        marker.position.y,
        marker.position.z,
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 51;
    mesh.frustumCulled = false;
    mesh.userData.dryWebContactFloorOverlay = true;
    mesh.userData.dryWebContactFloorCategory = category;
    mesh.userData.dryWebContactFloorPatchIds = markers.map((marker) => marker.patchId);
    const group = new THREE.Group();
    group.name = "dry-web-contact-floor-overlay";
    group.position.z = this.phaseAObjectLiftSource;
    group.userData.dryWebContactFloorOverlay = true;
    group.userData.dryWebContactFloorCategory = category;
    group.add(mesh);
    this.scene.add(group);
    this.dryWebContactFloorOverlayGroup = group;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  clearDryWebContactFloorOverlay(): void {
    this.dryWebContactFloorOverlayEnabled = false;
    this.disposeDryWebContactFloorOverlay();
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  private disposeDryWebInsufficientEdgeOverlay(): void {
    if (!this.dryWebInsufficientEdgeGroup) return;
    this.scene.remove(this.dryWebInsufficientEdgeGroup);
    this.dryWebInsufficientEdgeGroup.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      object.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    });
    this.dryWebInsufficientEdgeGroup = null;
  }

  /** Show exact generator-selected explanation edges without taking ownership
   * of the normal internal graph or the full-face contact palette. */
  setDryWebInsufficientEdgeOverlay(edges: readonly DryWebInsufficientEdge[]): void {
    this.dryWebInsufficientEdgeOverlayEnabled = true;
    this.disposeDryWebInsufficientEdgeOverlay();
    const group = new THREE.Group();
    group.name = "dry-web-insufficient-edge-overlay";
    group.position.z = this.phaseAObjectLiftSource;
    group.userData.dryWebInsufficientEdgeOverlay = true;
    const byBin = new Map<DryWebContactBinKey, DryWebInsufficientEdge[]>();
    for (const edge of edges) {
      const subset = byBin.get(edge.binKey);
      if (subset) subset.push(edge);
      else byBin.set(edge.binKey, [edge]);
    }
    const binColor = (key: DryWebContactBinKey): THREE.Color => {
      switch (key) {
        case "zero": return DRY_WEB_CONTACT_ZERO_COLOR;
        case "one": return DRY_WEB_CONTACT_ONE_COLOR;
        case "two": return DRY_WEB_CONTACT_TWO_COLOR;
        case "threeOrMore": return DRY_WEB_CONTACT_THREE_PLUS_COLOR;
      }
    };
    for (const [binKey, subset] of byBin) {
      const material = new THREE.MeshBasicMaterial({
        color: binColor(binKey),
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.InstancedMesh(this.internalEdgeGeometry, material, subset.length);
      const matrix = new THREE.Matrix4();
      const midpoint = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const scale = new THREE.Vector3();
      for (const [index, edge] of subset.entries()) {
        direction.set(
          edge.endPosition.x - edge.startPosition.x,
          edge.endPosition.y - edge.startPosition.y,
          edge.endPosition.z - edge.startPosition.z,
        );
        const length = direction.length();
        midpoint.set(
          (edge.startPosition.x + edge.endPosition.x) / 2,
          (edge.startPosition.y + edge.endPosition.y) / 2,
          (edge.startPosition.z + edge.endPosition.z) / 2,
        );
        rotation.setFromUnitVectors(yAxis, direction.normalize());
        scale.set(edge.radius, length, edge.radius);
        matrix.compose(midpoint, rotation, scale);
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 52;
      mesh.frustumCulled = false;
      mesh.userData.dryWebInsufficientEdgeBin = binKey;
      mesh.userData.dryWebInsufficientEdgeIds = subset.map((edge) => edge.edgeId);
      group.add(mesh);
    }
    this.scene.add(group);
    this.dryWebInsufficientEdgeGroup = group;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  clearDryWebInsufficientEdgeOverlay(): void {
    this.dryWebInsufficientEdgeOverlayEnabled = false;
    this.disposeDryWebInsufficientEdgeOverlay();
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Rhino's Ghosted display is a translucent shaded surface. This local
   * equivalent changes only GPU materials: geometry, opening measurements,
   * recipes and export remain untouched. Double-sided low-shadow shading
   * lets the far side contribute without making the form disappear. */
  setDisplayStyle(style: SkinDisplayStyle): void {
    this.displayStyle = style;
    this.applySurfaceMaterialStyle();
  }

  setInternalObservationMode(mode: InternalObservationMode): void {
    this.internalObservationMode = mode;
    this.applySurfaceMaterialStyle();
    this.applyLayerVisibility();
  }

  getInternalObservationMode(): InternalObservationMode {
    return this.internalObservationMode;
  }

  getLayerVisibility() {
    return deriveSkinLayerVisibility(
      this.viewMode, this.internalObservationMode, this.denseSampleActive,
    );
  }

  private applySurfaceMaterialStyle(): void {
    const ghost = this.displayStyle === "ghost" || this.internalObservationMode === "ghostSkin";
    this.overlayMaterial.transparent = ghost;
    this.overlayMaterial.opacity = ghost ? 0.18 : 1;
    this.overlayMaterial.depthWrite = !ghost;
    this.overlayMaterial.side = ghost ? THREE.DoubleSide : THREE.FrontSide;
    this.overlayMaterial.roughness = ghost ? 1 : 0.85;
    this.overlayMaterial.emissive.setHex(ghost ? 0x514b40 : 0x000000);
    this.overlayMaterial.emissiveIntensity = ghost ? 0.3 : 0;
    this.overlayMaterial.needsUpdate = true;

    this.patchBeadMaterial.transparent = ghost;
    this.patchBeadMaterial.opacity = ghost ? 0.12 : 1;
    this.patchBeadMaterial.depthWrite = !ghost;
    this.patchBeadMaterial.side = ghost ? THREE.DoubleSide : THREE.FrontSide;
    this.patchBeadMaterial.emissive.setHex(ghost ? 0x3d3931 : 0x000000);
    this.patchBeadMaterial.emissiveIntensity = ghost ? 0.24 : 0;
    this.patchBeadMaterial.needsUpdate = true;
    if (this.overlayMesh) this.overlayMesh.renderOrder = ghost ? 1 : 0;
  }

  private applyLayerVisibility(): void {
    const visibility = deriveSkinLayerVisibility(
      this.viewMode, this.internalObservationMode, this.denseSampleActive,
    );
    this.raymarchQuad.visible = visibility.raymarch;
    if (this.overlayMesh) this.overlayMesh.visible = visibility.overlay;
    if (this.hostBeadMesh) this.hostBeadMesh.visible = visibility.hostBeads;
    if (this.patchBeadMesh) this.patchBeadMesh.visible = visibility.patchBeads;
    const diagnosticInternal = this.surfaceAngleGroup !== null && this.surfaceAngleShowInternal && this.viewMode === "mesh";
    const phaseAInternal = this.phaseADryWebVisible && this.viewMode === "mesh";
    const angleScreeningInternal = this.internalAngleScreening !== null && !this.denseSampleActive;
    if (this.internalNodeMesh) this.internalNodeMesh.visible = this.internalStructureVisible && (visibility.internalGraph || diagnosticInternal || phaseAInternal || angleScreeningInternal);
    if (this.internalEdgeMesh) this.internalEdgeMesh.visible = this.internalStructureVisible && (visibility.internalGraph || diagnosticInternal || phaseAInternal || angleScreeningInternal);
    if (this.selectedInternalEdgeMesh) this.selectedInternalEdgeMesh.visible = this.internalStructureVisible && !this.denseSampleActive;
    if (this.reinforcedInternalEdgeMesh) this.reinforcedInternalEdgeMesh.visible = this.internalStructureVisible && !this.denseSampleActive;
    if (this.printSupportNodeMesh) this.printSupportNodeMesh.visible = this.printSupportVisible && !this.denseSampleActive;
    if (this.printSupportEdgeMesh) this.printSupportEdgeMesh.visible = this.printSupportVisible && !this.denseSampleActive;
    if (this.skinRebuildOverhangGroup) {
      this.skinRebuildOverhangGroup.visible = this.skinRebuildOverhangVisible
        && visibility.surfaceDecorations
        && this.viewMode === "mesh";
    }
    if (this.quadFlowGridLines) this.quadFlowGridLines.visible = visibility.surfaceDecorations;
    if (this.surfaceAngleGroup) {
      this.surfaceAngleGroup.visible = visibility.surfaceDecorations && this.viewMode === "mesh";
    }
    if (this.overhangSupportSiteGroup) {
      this.overhangSupportSiteGroup.visible = overhangSupportSiteGroupVisible(
        this.overhangSupportSiteVisibilityPolicy,
        visibility,
        this.viewMode,
      );
    }
    if (this.phaseASupportGroup) {
      this.phaseASupportGroup.visible = visibility.surfaceDecorations && this.viewMode === "mesh";
    }
    if (this.motifLowestPointGroup) {
      this.motifLowestPointGroup.visible = visibility.surfaceDecorations;
    }
    if (this.artworkGraphOverlayGroup) {
      this.artworkGraphOverlayGroup.visible = this.artworkGraphOverlayEnabled && !this.denseSampleActive;
    }
    if (this.dryWebInsufficientEdgeGroup) {
      this.dryWebInsufficientEdgeGroup.visible = this.dryWebInsufficientEdgeOverlayEnabled
        && visibility.surfaceDecorations;
    }
    if (this.dryWebContactFloorOverlayGroup) {
      this.dryWebContactFloorOverlayGroup.visible = this.dryWebContactFloorOverlayEnabled
        && visibility.surfaceDecorations;
    }
    if (this.dryWebRedFaceLocatorGroup) {
      this.dryWebRedFaceLocatorGroup.visible = this.dryWebRedFaceLocatorEnabled
        && visibility.surfaceDecorations
        && this.viewMode === "mesh";
    }
    if (this.dryWebRedFaceDryWebCandidateGroup) {
      this.dryWebRedFaceDryWebCandidateGroup.visible = this.dryWebRedFaceDryWebCandidateEnabled
        && visibility.surfaceDecorations
        && this.viewMode === "mesh";
    }
    if (this.riskDrivenInternalLatticeGroup) {
      this.riskDrivenInternalLatticeGroup.visible = this.riskDrivenInternalLatticeOverlayEnabled
        && visibility.surfaceDecorations
        && this.viewMode === "mesh";
    }
    if (this.endpointBadges.A) this.endpointBadges.A.visible = visibility.patchBeads;
    if (this.endpointBadges.B) this.endpointBadges.B.visible = visibility.patchBeads;
    if (this.dragPreviewMesh && !visibility.surfaceDecorations) this.dragPreviewMesh.visible = false;
    this.elementLabelLayer.style.display = visibility.surfaceDecorations ? "" : "none";

    const showOpeningLabels = this.openingGroup !== null && visibility.surfaceDecorations && (
      this.denseSampleActive ? this.denseSampleView === "3d" : this.viewMode === "mesh"
    );
    if (this.openingGroup) this.openingGroup.visible = showOpeningLabels;
    this.openingLabelLayer.hidden = !showOpeningLabels;
    this.openingLineLayer.style.display = showOpeningLabels ? "" : "none";
    this.updateSelectionHighlight();
  }

  getDisplayStyle(): SkinDisplayStyle {
    return this.displayStyle;
  }

  /** Overlay the authored all-quad topology independently of raymarch/bead/
   * mesh view. Ordinary edges are cyan; cells touching an extraordinary
   * vertex are warning orange until a dedicated fitting is designed. */
  setQuadFlowGrid(grid: QuadFlowGrid | null): void {
    if (this.quadFlowGridLines) {
      this.scene.remove(this.quadFlowGridLines);
      this.quadFlowGridLines.geometry.dispose();
      (this.quadFlowGridLines.material as THREE.Material).dispose();
      this.quadFlowGridLines = null;
    }
    if (!grid || grid.cells.length === 0) return;
    const positions: number[] = [];
    const colors: number[] = [];
    const ordinary = new THREE.Color(0x63d7dc);
    const special = new THREE.Color(0xff754f);
    for (const cell of grid.cells) {
      const color = cell.special ? special : ordinary;
      for (let edge = 0; edge < 4; edge++) {
        const a = grid.vertices[cell.vertexIds[edge]];
        const b = grid.vertices[cell.vertexIds[(edge + 1) % 4]];
        const lift = 0.004;
        positions.push(
          a.x + a.nx * lift, a.y + a.ny * lift, a.z + a.nz * lift,
          b.x + b.nx * lift, b.y + b.ny * lift, b.z + b.nz * lift,
        );
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    this.quadFlowGridLines = new THREE.LineSegments(geometry, material);
    this.quadFlowGridLines.renderOrder = 20;
    this.scene.add(this.quadFlowGridLines);
    this.applyLayerVisibility();
  }

  /** Preview the independent internal graph with radius-accurate cylinders
   * and nodes. Ordinary mesh view avoids duplication; observation modes show the graph separately. */
  setInternalStructure(graph: InternalStructureGraph | null): void {
    this.dryWebInsufficientEdgeOverlayEnabled = false;
    this.disposeDryWebInsufficientEdgeOverlay();
    this.dryWebContactFloorOverlayEnabled = false;
    this.disposeDryWebContactFloorOverlay();
    if (this.internalNodeMesh) {
      this.scene.remove(this.internalNodeMesh);
      this.internalNodeMesh.dispose();
      this.internalNodeMesh = null;
    }
    if (this.internalEdgeMesh) {
      this.scene.remove(this.internalEdgeMesh);
      this.internalEdgeMesh.dispose();
      this.internalEdgeMesh = null;
    }
    this.setSelectedInternalStructureEdge(null, null);
    this.setReinforcedInternalStructureEdges(null, []);
    if (!graph || graph.edges.length === 0) {
      this.applyLayerVisibility();
      return;
    }

    if (graph.nodes.length > 0) {
      const nodeMesh = new THREE.InstancedMesh(
        this.internalNodeGeometry, this.internalMaterial, graph.nodes.length,
      );
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < graph.nodes.length; index++) {
        const node = graph.nodes[index];
        matrix.makeScale(node.radius, node.radius, node.radius)
          .setPosition(node.position.x, node.position.y, node.position.z);
        nodeMesh.setMatrixAt(index, matrix);
      }
      nodeMesh.instanceMatrix.needsUpdate = true;
      nodeMesh.visible = !this.denseSampleActive && this.viewMode !== "mesh";
      nodeMesh.renderOrder = 8;
      this.scene.add(nodeMesh);
      this.internalNodeMesh = nodeMesh;
    }

    const edgeMesh = new THREE.InstancedMesh(
      this.internalEdgeGeometry, this.internalMaterial, graph.edges.length,
    );
    const matrix = new THREE.Matrix4();
    const midpoint = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    for (let index = 0; index < graph.edges.length; index++) {
      const edge = graph.edges[index];
      const start = graph.nodes[edge.start].position;
      const end = graph.nodes[edge.end].position;
      direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
      const length = direction.length();
      midpoint.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
      rotation.setFromUnitVectors(yAxis, direction.normalize());
      scale.set(edge.radius, length, edge.radius);
      matrix.compose(midpoint, rotation, scale);
      edgeMesh.setMatrixAt(index, matrix);
    }
    edgeMesh.instanceMatrix.needsUpdate = true;
    edgeMesh.visible = !this.denseSampleActive && this.viewMode !== "mesh";
    edgeMesh.renderOrder = 7;
    this.scene.add(edgeMesh);
    this.internalEdgeMesh = edgeMesh;
    this.applyLayerVisibility();
  }

  /** Highlight one author-selected permanent member without changing the
   * graph or the ordinary internal-angle colors. */
  setSelectedInternalStructureEdge(graph: InternalStructureGraph | null, edgeId: number | null): void {
    if (this.selectedInternalEdgeMesh) {
      this.scene.remove(this.selectedInternalEdgeMesh);
      this.selectedInternalEdgeMesh = null;
    }
    if (!graph || edgeId === null) {
      this.requestViewportRender();
      return;
    }
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) return;
    const start = graph.nodes[edge.start]?.position;
    const end = graph.nodes[edge.end]?.position;
    if (!start || !end) return;
    const midpoint = new THREE.Vector3(
      (start.x + end.x) * 0.5,
      (start.y + end.y) * 0.5,
      (start.z + end.z) * 0.5,
    );
    const direction = new THREE.Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
    const edgeLength = direction.length();
    if (!(edgeLength > 0)) return;
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    const matrix = new THREE.Matrix4().compose(
      midpoint,
      rotation,
      new THREE.Vector3(edge.radius * 1.45, edgeLength * 1.01, edge.radius * 1.45),
    );
    const selected = new THREE.Mesh(this.internalEdgeGeometry, this.selectedInternalEdgeMaterial);
    selected.matrixAutoUpdate = false;
    selected.matrix.copy(matrix);
    selected.position.z = this.phaseAObjectLiftSource;
    selected.renderOrder = 15;
    this.scene.add(selected);
    this.selectedInternalEdgeMesh = selected;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Keep the just-added red-area reinforcement unmistakable in mesh view.
   * This is a bright-cyan display overlay; the actual printable cylinders are
   * already part of the permanent graph passed to setInternalStructure. */
  setReinforcedInternalStructureEdges(
    graph: InternalStructureGraph | null,
    edgeIds: readonly number[],
  ): void {
    if (this.reinforcedInternalEdgeMesh) {
      this.scene.remove(this.reinforcedInternalEdgeMesh);
      this.reinforcedInternalEdgeMesh.dispose();
      this.reinforcedInternalEdgeMesh = null;
    }
    if (!graph || edgeIds.length === 0) {
      this.requestViewportRender();
      return;
    }
    const wanted = new Set(edgeIds);
    const edges = graph.edges.filter((edge) => wanted.has(edge.id));
    if (edges.length === 0) {
      this.requestViewportRender();
      return;
    }
    const mesh = new THREE.InstancedMesh(
      this.internalEdgeGeometry,
      this.reinforcedInternalEdgeMaterial,
      edges.length,
    );
    const matrix = new THREE.Matrix4();
    const midpoint = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const [index, edge] of edges.entries()) {
      const start = graph.nodes[edge.start]?.position;
      const end = graph.nodes[edge.end]?.position;
      if (!start || !end) continue;
      direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
      const length = direction.length();
      midpoint.set((start.x + end.x) * 0.5, (start.y + end.y) * 0.5, (start.z + end.z) * 0.5);
      rotation.setFromUnitVectors(yAxis, direction.normalize());
      matrix.compose(
        midpoint,
        rotation,
        new THREE.Vector3(edge.radius * 1.28, length * 1.02, edge.radius * 1.28),
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.position.z = this.phaseAObjectLiftSource;
    mesh.renderOrder = 18;
    mesh.frustumCulled = false;
    mesh.name = "skin-rebuild-red-area-reinforcement-cyan";
    this.scene.add(mesh);
    this.reinforcedInternalEdgeMesh = mesh;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Pick one visible permanent lattice cylinder in the active 1/4 viewport.
   * The InstancedMesh instance order is the graph edge order established by
   * setInternalStructure, so the hit can be mapped back to its stable edge id
   * without rebuilding geometry or changing the graph. */
  pickInternalStructureEdge(
    clientX: number,
    clientY: number,
    graph: InternalStructureGraph | null,
  ): number | null {
    const edgeMesh = this.internalEdgeMesh;
    if (!this.internalStructureVisible || !edgeMesh || !graph || graph.edges.length === 0) return null;
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const viewportRect = this.viewportRectFromClient(clientX, clientY);
    if (!viewportRect) return null;
    this.selectViewport(viewportRect.index);
    this.camera.updateMatrixWorld();
    const project = (position: Vector3Value): { x: number; y: number; depth: number } => {
      const point = new THREE.Vector3(
        position.x,
        position.y,
        position.z + this.phaseAObjectLiftSource,
      ).project(this.camera);
      return {
        x: canvasRect.left + viewportRect.x + (point.x * 0.5 + 0.5) * viewportRect.width,
        y: canvasRect.top + viewportRect.y + (-point.y * 0.5 + 0.5) * viewportRect.height,
        depth: point.z,
      };
    };
    const pointSegmentDistanceSq = (
      px: number, py: number,
      ax: number, ay: number,
      bx: number, by: number,
    ): number => {
      const dx = bx - ax;
      const dy = by - ay;
      const denominator = dx * dx + dy * dy;
      const t = denominator > 1e-9
        ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator))
        : 0;
      const ex = px - (ax + dx * t);
      const ey = py - (ay + dy * t);
      return ex * ex + ey * ey;
    };
    const verticalObjectSpan = (this.camera.top - this.camera.bottom) / Math.max(1e-9, this.camera.zoom);
    const pixelsPerObjectUnit = viewportRect.height / Math.max(1e-9, verticalObjectSpan);
    let best: { edgeId: number; distanceSq: number; depth: number } | null = null;
    for (const edge of graph.edges) {
      const start = graph.nodes[edge.start]?.position;
      const end = graph.nodes[edge.end]?.position;
      if (!start || !end) continue;
      const a = project(start);
      const b = project(end);
      if (a.depth < -1.02 || a.depth > 1.02 || b.depth < -1.02 || b.depth > 1.02) continue;
      const distanceSq = pointSegmentDistanceSq(clientX, clientY, a.x, a.y, b.x, b.y);
      const tolerancePx = Math.max(6, edge.radius * pixelsPerObjectUnit + 4);
      if (distanceSq > tolerancePx * tolerancePx) continue;
      const depth = (a.depth + b.depth) * 0.5;
      if (!best || distanceSq < best.distanceSq - 0.25
        || (Math.abs(distanceSq - best.distanceSq) <= 0.25 && depth < best.depth)) {
        best = { edgeId: edge.id, distanceSq, depth };
      }
    }
    if (best) return best.edgeId;
    // Retain exact cylinder raycasting as a fallback for a clipped endpoint
    // whose projected centreline falls outside the ordinary segment test.
    const ray = this.screenToRayFromClient(clientX, clientY);
    const raycaster = new THREE.Raycaster(ray.origin, ray.dir, 0, Number.POSITIVE_INFINITY);
    edgeMesh.updateMatrixWorld(true);
    const hit = raycaster.intersectObject(edgeMesh, false)[0];
    const edgeIndex = hit?.instanceId;
    return edgeIndex === undefined ? null : graph.edges[edgeIndex]?.id ?? null;
  }

  /** Orange, removable SKIN REBUILD print support. It deliberately owns a
   * separate pair of meshes from the permanent cyan Internal Graph. */
  setPrintSupport(graph: InternalStructureGraph | null): void {
    if (this.printSupportNodeMesh) {
      this.scene.remove(this.printSupportNodeMesh);
      this.printSupportNodeMesh.dispose();
      this.printSupportNodeMesh = null;
    }
    if (this.printSupportEdgeMesh) {
      this.scene.remove(this.printSupportEdgeMesh);
      this.printSupportEdgeMesh.dispose();
      this.printSupportEdgeMesh = null;
    }
    if (!graph?.edges.length) {
      this.applyLayerVisibility();
      return;
    }
    if (graph.nodes.length > 0) {
      const nodes = new THREE.InstancedMesh(this.internalNodeGeometry, this.printSupportMaterial, graph.nodes.length);
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < graph.nodes.length; index++) {
        const node = graph.nodes[index];
        matrix.makeScale(node.radius, node.radius, node.radius)
          .setPosition(node.position.x, node.position.y, node.position.z);
        nodes.setMatrixAt(index, matrix);
      }
      nodes.instanceMatrix.needsUpdate = true;
      nodes.renderOrder = 10;
      this.scene.add(nodes);
      this.printSupportNodeMesh = nodes;
    }
    const edges = new THREE.InstancedMesh(this.internalEdgeGeometry, this.printSupportMaterial, graph.edges.length);
    const matrix = new THREE.Matrix4();
    const midpoint = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    for (let index = 0; index < graph.edges.length; index++) {
      const edge = graph.edges[index];
      const start = graph.nodes[edge.start].position;
      const end = graph.nodes[edge.end].position;
      direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
      const edgeLength = direction.length();
      midpoint.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
      rotation.setFromUnitVectors(yAxis, direction.normalize());
      scale.set(edge.radius, edgeLength, edge.radius);
      matrix.compose(midpoint, rotation, scale);
      edges.setMatrixAt(index, matrix);
    }
    edges.instanceMatrix.needsUpdate = true;
    edges.renderOrder = 9;
    this.scene.add(edges);
    this.printSupportEdgeMesh = edges;
    this.applyLayerVisibility();
  }

  setPrintSupportVisible(visible: boolean): void {
    this.printSupportVisible = visible;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Red face overlay from the REBUILD final-mesh build-direction diagnosis. */
  setSkinRebuildOverhangOverlay(
    positions: Float32Array | null,
    faceRegionIds: Int32Array | null = null,
  ): void {
    if (this.skinRebuildOverhangGroup) {
      this.scene.remove(this.skinRebuildOverhangGroup);
      this.skinRebuildOverhangGroup.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.dispose();
        }
      });
      this.skinRebuildOverhangGroup = null;
    }
    this.skinRebuildOverhangMesh = null;
    this.skinRebuildOverhangPositions = null;
    this.skinRebuildOverhangFaceRegionIds = null;
    this.reinforcedSkinRebuildOverhangRegionMesh = null;
    this.reinforcedSkinRebuildOverhangRegionIds.clear();
    this.selectedSkinRebuildOverhangRegionMesh = null;
    if (!positions || positions.length === 0) {
      this.applyLayerVisibility();
      this.requestViewportRender();
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      color: 0xff304d,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 12;
    mesh.userData.skinRebuildOverhangFaceCount = positions.length / 9;
    const group = new THREE.Group();
    group.name = "skin-rebuild-overhang-regions";
    group.position.z = this.phaseAObjectLiftSource;
    group.add(mesh);
    this.scene.add(group);
    this.skinRebuildOverhangGroup = group;
    this.skinRebuildOverhangMesh = mesh;
    this.skinRebuildOverhangPositions = positions;
    this.skinRebuildOverhangFaceRegionIds = faceRegionIds?.length === positions.length / 9
      ? faceRegionIds
      : null;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Paint reinforced red-face regions green without changing diagnosis geometry. */
  setReinforcedSkinRebuildOverhangRegions(regionIds: readonly number[]): void {
    if (this.reinforcedSkinRebuildOverhangRegionMesh && this.skinRebuildOverhangGroup) {
      this.skinRebuildOverhangGroup.remove(this.reinforcedSkinRebuildOverhangRegionMesh);
      this.reinforcedSkinRebuildOverhangRegionMesh.geometry.dispose();
      for (const material of Array.isArray(this.reinforcedSkinRebuildOverhangRegionMesh.material)
        ? this.reinforcedSkinRebuildOverhangRegionMesh.material
        : [this.reinforcedSkinRebuildOverhangRegionMesh.material]) material.dispose();
    }
    this.reinforcedSkinRebuildOverhangRegionMesh = null;
    this.reinforcedSkinRebuildOverhangRegionIds = new Set(regionIds);
    const positions = this.skinRebuildOverhangPositions;
    const faceRegionIds = this.skinRebuildOverhangFaceRegionIds;
    const group = this.skinRebuildOverhangGroup;
    if (this.reinforcedSkinRebuildOverhangRegionIds.size === 0 || !positions || !faceRegionIds || !group) {
      this.requestViewportRender();
      return;
    }
    const reinforcedPositions: number[] = [];
    for (let faceIndex = 0; faceIndex < faceRegionIds.length; faceIndex++) {
      if (!this.reinforcedSkinRebuildOverhangRegionIds.has(faceRegionIds[faceIndex])) continue;
      const offset = faceIndex * 9;
      for (let index = 0; index < 9; index++) reinforcedPositions.push(positions[offset + index]);
    }
    if (reinforcedPositions.length === 0) {
      this.requestViewportRender();
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(reinforcedPositions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      color: 0x34e39a,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    const reinforced = new THREE.Mesh(geometry, material);
    reinforced.name = "skin-rebuild-reinforced-overhang-regions";
    reinforced.renderOrder = 14;
    group.add(reinforced);
    this.reinforcedSkinRebuildOverhangRegionMesh = reinforced;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Pick the actual red triangle and return its connected-region id. */
  pickSkinRebuildOverhangRegion(clientX: number, clientY: number): number | null {
    const mesh = this.skinRebuildOverhangMesh;
    const regionIds = this.skinRebuildOverhangFaceRegionIds;
    if (!this.skinRebuildOverhangVisible || !mesh || !regionIds) return null;
    const ray = this.screenToRayFromClient(clientX, clientY);
    const raycaster = new THREE.Raycaster(ray.origin, ray.dir, 0, Number.POSITIVE_INFINITY);
    mesh.updateMatrixWorld(true);
    const faceIndex = raycaster.intersectObject(mesh, false)[0]?.faceIndex;
    return faceIndex === undefined || faceIndex === null ? null : regionIds[faceIndex] ?? null;
  }

  /** Return every connected red region whose projected triangles overlap the
   * drag rectangle. The drag-start viewport is authoritative in four-view
   * mode, and the rectangle is clipped to that viewport before testing. */
  pickSkinRebuildOverhangRegionsInClientRect(
    startClientX: number,
    startClientY: number,
    endClientX: number,
    endClientY: number,
  ): number[] {
    const mesh = this.skinRebuildOverhangMesh;
    const positions = this.skinRebuildOverhangPositions;
    const regionIds = this.skinRebuildOverhangFaceRegionIds;
    if (!this.skinRebuildOverhangVisible || !mesh || !positions || !regionIds) return [];
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const viewportRect = this.viewportRectFromClient(startClientX, startClientY);
    const camera = viewportRect ? this.viewportSlots[viewportRect.index]?.camera : null;
    if (!viewportRect || !camera) return [];
    const raw = normalizedScreenRect(startClientX, startClientY, endClientX, endClientY);
    const selection = {
      left: Math.max(raw.left, canvasRect.left + viewportRect.x),
      top: Math.max(raw.top, canvasRect.top + viewportRect.y),
      right: Math.min(raw.right, canvasRect.left + viewportRect.x + viewportRect.width),
      bottom: Math.min(raw.bottom, canvasRect.top + viewportRect.y + viewportRect.height),
    };
    if (selection.right < selection.left || selection.bottom < selection.top) return [];
    camera.updateMatrixWorld(true);
    mesh.updateWorldMatrix(true, false);
    const selected = new Set<number>();
    const projectPoint = (offset: number): { point: { x: number; y: number }; z: number } => {
      const projected = new THREE.Vector3(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2],
      ).applyMatrix4(mesh.matrixWorld).project(camera);
      return {
        point: {
          x: canvasRect.left + viewportRect.x + (projected.x + 1) * 0.5 * viewportRect.width,
          y: canvasRect.top + viewportRect.y + (1 - projected.y) * 0.5 * viewportRect.height,
        },
        z: projected.z,
      };
    };
    for (let faceIndex = 0; faceIndex < regionIds.length; faceIndex++) {
      const offset = faceIndex * 9;
      const first = projectPoint(offset);
      const second = projectPoint(offset + 3);
      const third = projectPoint(offset + 6);
      if ((first.z < -1 && second.z < -1 && third.z < -1)
        || (first.z > 1 && second.z > 1 && third.z > 1)) continue;
      if (screenTriangleIntersectsRect([first.point, second.point, third.point], selection)) {
        selected.add(regionIds[faceIndex]);
      }
    }
    return [...selected].sort((first, second) => first - second);
  }

  /** Highlight every triangle in the selected connected red regions. */
  setSelectedSkinRebuildOverhangRegions(selectedRegionIds: readonly number[]): void {
    if (this.selectedSkinRebuildOverhangRegionMesh && this.skinRebuildOverhangGroup) {
      this.skinRebuildOverhangGroup.remove(this.selectedSkinRebuildOverhangRegionMesh);
      this.selectedSkinRebuildOverhangRegionMesh.geometry.dispose();
      for (const material of Array.isArray(this.selectedSkinRebuildOverhangRegionMesh.material)
        ? this.selectedSkinRebuildOverhangRegionMesh.material
        : [this.selectedSkinRebuildOverhangRegionMesh.material]) material.dispose();
    }
    this.selectedSkinRebuildOverhangRegionMesh = null;
    const positions = this.skinRebuildOverhangPositions;
    const regionIds = this.skinRebuildOverhangFaceRegionIds;
    const group = this.skinRebuildOverhangGroup;
    const selectedIds = new Set(selectedRegionIds);
    if (selectedIds.size === 0 || !positions || !regionIds || !group) {
      this.requestViewportRender();
      return;
    }
    const selectedPositions: number[] = [];
    for (let faceIndex = 0; faceIndex < regionIds.length; faceIndex++) {
      if (!selectedIds.has(regionIds[faceIndex])) continue;
      const offset = faceIndex * 9;
      for (let index = 0; index < 9; index++) selectedPositions.push(positions[offset + index]);
    }
    if (selectedPositions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(selectedPositions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd23f,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
      toneMapped: false,
    });
    const selected = new THREE.Mesh(geometry, material);
    selected.name = "skin-rebuild-selected-overhang-regions";
    selected.renderOrder = 16;
    group.add(selected);
    this.selectedSkinRebuildOverhangRegionMesh = selected;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  setSelectedSkinRebuildOverhangRegion(regionId: number | null): void {
    this.setSelectedSkinRebuildOverhangRegions(regionId === null ? [] : [regionId]);
  }

  setSkinRebuildOverhangVisible(visible: boolean): void {
    this.skinRebuildOverhangVisible = visible;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  setInternalStructureVisible(visible: boolean): void {
    this.internalStructureVisible = visible;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Apply a derived angle-only color screen without changing graph geometry. */
  setInternalAngleScreening(screening: InternalAngleScreeningReport | null): void {
    this.internalAngleScreening = screening;
    const edgeMesh = this.internalEdgeMesh;
    if (edgeMesh) {
      if (!screening) {
        // The established cyan material is used verbatim when the toggle is
        // off; any stale instance colors are ignored by vertexColors=false.
        edgeMesh.material = this.internalMaterial;
        edgeMesh.instanceColor = null;
      } else {
        edgeMesh.material = this.internalAngleMaterial;
        for (let index = 0; index < edgeMesh.count; index++) {
          const classification = screening.edges[index]?.classification;
          edgeMesh.setColorAt(
            index,
            classification === "selfSupportingAngle"
              ? this.internalAngleSelfSupportingColor
              : this.internalAngleRiskColor,
          );
        }
        if (edgeMesh.instanceColor) edgeMesh.instanceColor.needsUpdate = true;
      }
    }
    this.applyLayerVisibility();
  }

  /** Render the Katachi-native branching support plan as radius-scaled
   * instanced cylinders and junction/contact spheres. BODY-owned layers are
   * lifted here; the forest coordinates already include that same lift. */
  setPhaseASupportPreview(
    forest: SupportForest | null,
    retainedVerticals: readonly SupportMember[],
    scaleMmPerUnit: number,
    objectLiftMm: number,
  ): void {
    if (this.phaseASupportGroup) {
      this.scene.remove(this.phaseASupportGroup);
      this.phaseASupportGroup.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        const candidate = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        candidate.geometry?.dispose();
        if (candidate.material) {
          for (const material of Array.isArray(candidate.material) ? candidate.material : [candidate.material]) material.dispose();
        }
      });
      this.phaseASupportGroup = null;
    }
    this.phaseADryWebVisible = forest !== null;
    this.phaseAObjectLiftSource = scaleMmPerUnit > 0 ? objectLiftMm / scaleMmPerUnit : 0;
    const bodyZ = this.phaseAObjectLiftSource;
    if (this.overlayMesh) this.overlayMesh.position.z = bodyZ;
    if (this.surfaceAngleGroup) this.surfaceAngleGroup.position.z = bodyZ;
    if (this.overhangSupportSiteGroup) this.overhangSupportSiteGroup.position.z = bodyZ;
    if (this.motifLowestPointGroup) this.motifLowestPointGroup.position.z = bodyZ;
    if (this.artworkGraphOverlayGroup) this.artworkGraphOverlayGroup.position.z = bodyZ;
    if (this.dryWebInsufficientEdgeGroup) this.dryWebInsufficientEdgeGroup.position.z = bodyZ;
    if (this.dryWebRedFaceLocatorGroup) this.dryWebRedFaceLocatorGroup.position.z = bodyZ;
    if (this.dryWebRedFaceDryWebCandidateGroup) this.dryWebRedFaceDryWebCandidateGroup.position.z = bodyZ;
    if (this.riskDrivenInternalLatticeGroup) this.riskDrivenInternalLatticeGroup.position.z = bodyZ;
    if (this.internalNodeMesh) this.internalNodeMesh.position.z = bodyZ;
    if (this.internalEdgeMesh) this.internalEdgeMesh.position.z = bodyZ;
    if (this.printSupportNodeMesh) this.printSupportNodeMesh.position.z = bodyZ;
    if (this.printSupportEdgeMesh) this.printSupportEdgeMesh.position.z = bodyZ;
    if (this.skinRebuildOverhangGroup) this.skinRebuildOverhangGroup.position.z = bodyZ;
    if (!forest || !(scaleMmPerUnit > 0) || forest.members.length + retainedVerticals.length === 0) {
      this.applyLayerVisibility();
      return;
    }

    const group = new THREE.Group();
    group.name = "phase-a-support-forest";
    const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
    const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
    const exteriorMaterial = new THREE.MeshStandardMaterial({ color: 0xe28a2b, roughness: 0.78, metalness: 0 });
    const raftMaterial = new THREE.MeshStandardMaterial({ color: 0xb9681d, roughness: 0.86, metalness: 0 });
    const retainedMaterial = new THREE.MeshStandardMaterial({ color: 0x42a88b, roughness: 0.8, metalness: 0 });
    const toSource = (valueMm: number) => valueMm / scaleMmPerUnit;
    const addMembers = (items: readonly SupportMember[], material: THREE.MeshStandardMaterial) => {
      if (items.length === 0) return;
      const mesh = new THREE.InstancedMesh(cylinderGeometry.clone(), material.clone(), items.length);
      const matrix = new THREE.Matrix4();
      const midpoint = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const scale = new THREE.Vector3();
      for (const [index, item] of items.entries()) {
        const start = new THREE.Vector3(toSource(item.start.xMm), toSource(item.start.yMm), toSource(item.start.zMm));
        const end = new THREE.Vector3(toSource(item.end.xMm), toSource(item.end.yMm), toSource(item.end.zMm));
        direction.subVectors(end, start);
        const length = direction.length();
        midpoint.addVectors(start, end).multiplyScalar(0.5);
        const radius = toSource((item.startRadiusMm + item.endRadiusMm) * 0.5);
        if (length <= 1e-9) {
          matrix.makeScale(0, 0, 0).setPosition(midpoint);
        } else {
          rotation.setFromUnitVectors(yAxis, direction.normalize());
          scale.set(radius, length, radius);
          matrix.compose(midpoint, rotation, scale);
        }
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 12;
      mesh.frustumCulled = false;
      group.add(mesh);
    };
    addMembers(forest.members.filter((member) => member.kind !== "raft"), exteriorMaterial);
    addMembers(forest.members.filter((member) => member.kind === "raft"), raftMaterial);
    addMembers(retainedVerticals, retainedMaterial);

    const contactNodes = forest.members
      .filter((member) => member.kind === "tip")
      .map((member) => ({ ...member.end, radiusMm: member.endRadiusMm }));
    const nodes = [
      ...forest.junctions.map((node) => ({ xMm: node.xMm, yMm: node.yMm, zMm: node.zMm, radiusMm: node.radiusMm })),
      ...contactNodes,
    ];
    if (nodes.length > 0) {
      const mesh = new THREE.InstancedMesh(sphereGeometry, exteriorMaterial, nodes.length);
      const matrix = new THREE.Matrix4();
      for (const [index, node] of nodes.entries()) {
        const radius = toSource(node.radiusMm);
        matrix.makeScale(radius, radius, radius).setPosition(
          toSource(node.xMm), toSource(node.yMm), toSource(node.zMm),
        );
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 13;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    cylinderGeometry.dispose();
    raftMaterial.dispose();
    retainedMaterial.dispose();
    if (nodes.length === 0) {
      sphereGeometry.dispose();
      exteriorMaterial.dispose();
    }
    this.scene.add(group);
    this.phaseASupportGroup = group;
    this.applyLayerVisibility();
  }

  /** Build (or replace) the true (uncapped) marching-tets geometry as a lit
   * mesh. Visibility is controlled separately via setViewMode. */
  setMeshOverlay(triangles: { a: {x:number;y:number;z:number}; b: {x:number;y:number;z:number}; c: {x:number;y:number;z:number} }[] | null): void {
    this.clearDryWebRedFaceLocator();
    this.clearDryWebRedFaceDryWebCandidateOverlay();
    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh);
      this.overlayMesh.geometry.dispose();
      this.overlayMesh = null;
    }
    this.meshBoundsRevision++;
    if (!triangles) {
      this.rebuildRiskDrivenInternalLatticeOverlay();
      return;
    }
    const pos = new Float32Array(triangles.length * 9);
    let o = 0;
    for (const t of triangles) {
      for (const p of [t.a, t.b, t.c]) {
        pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
        o += 3;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    this.overlayMesh = new THREE.Mesh(geo, this.overlayMaterial);
    this.overlayMesh.position.z = this.phaseAObjectLiftSource;
    this.overlayMesh.renderOrder = this.displayStyle === "ghost" || this.internalObservationMode === "ghostSkin" ? 1 : 0;
    this.overlayMesh.visible = this.viewMode === "mesh";
    this.scene.add(this.overlayMesh);
    this.applyLayerVisibility();
    this.rebuildRiskDrivenInternalLatticeOverlay();
  }

  /** Worker-produced preview mesh. Positions and flat normals arrive ready
   * for the GPU so the main page never loops over the full triangle set or
   * computes normals while the author is trying to orbit the form. */
  setMeshOverlayBuffers(positions: Float32Array, normals: Float32Array): void {
    this.clearDryWebRedFaceLocator();
    this.clearDryWebRedFaceDryWebCandidateOverlay();
    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh);
      this.overlayMesh.geometry.dispose();
      this.overlayMesh = null;
    }
    this.meshBoundsRevision++;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    this.overlayMesh = new THREE.Mesh(geometry, this.overlayMaterial);
    this.overlayMesh.position.z = this.phaseAObjectLiftSource;
    this.overlayMesh.renderOrder = this.displayStyle === "ghost" || this.internalObservationMode === "ghostSkin" ? 1 : 0;
    this.overlayMesh.visible = this.viewMode === "mesh";
    this.scene.add(this.overlayMesh);
    this.applyLayerVisibility();
    this.rebuildRiskDrivenInternalLatticeOverlay();
  }

  clearSurfaceAngleOverlay(): void {
    this.clearDryWebRedFaceLocator();
    this.clearDryWebRedFaceDryWebCandidateOverlay();
    if (this.surfaceAngleGroup) {
      this.scene.remove(this.surfaceAngleGroup);
      this.surfaceAngleGroup.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      this.surfaceAngleGroup = null;
    }
    this.surfaceAngleShowInternal = false;
    this.applyLayerVisibility();
  }

  /** Color only the diagnosed outer-SKIN triangles. Passing an empty teal
   * buffer produces the "before Internal" view; passing red+teal produces
   * the simple contact-aware "after" comparison. */
  setSurfaceAngleOverlay(
    redPositions: Float32Array,
    mitigatedPositions: Float32Array,
    showInternal = false,
    outsidePositions: Float32Array = new Float32Array(0),
  ): void {
    this.clearSurfaceAngleOverlay();
    const group = new THREE.Group();
    const add = (positions: Float32Array, color: number, opacity: number) => {
      if (positions.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 8;
      group.add(mesh);
    };
    add(redPositions, 0xd9483b, 0.9);
    add(outsidePositions, 0xff922e, 0.88);
    add(mitigatedPositions, 0x3bb7aa, 0.78);
    group.visible = this.viewMode === "mesh" && this.internalObservationMode !== "internalOnly";
    this.scene.add(group);
    this.surfaceAngleGroup = group;
    this.surfaceAngleShowInternal = showInternal;
    this.applyLayerVisibility();
  }

  /**
   * Highlight only the exact Stage 7 red-face positions while keeping the
   * current mesh as subdued spatial context. The dim mesh shares the current
   * overlay geometry when available; the red triangle geometry is owned by
   * this independent presentation group and is never exported or persisted.
   */
  setDryWebRedFaceLocator(
    basePositions: Float32Array,
    redPositions: Float32Array,
    enabled: boolean,
  ): void {
    this.clearDryWebRedFaceLocator();
    this.clearDryWebRedFaceDryWebCandidateOverlay();
    this.dryWebRedFaceLocatorEnabled = enabled;
    if (!enabled || redPositions.length === 0 || redPositions.length % 9 !== 0) {
      this.applyLayerVisibility();
      return;
    }
    const group = new THREE.Group();
    group.name = "dry-web-red-face-locator";
    group.position.z = this.phaseAObjectLiftSource;
    group.userData.dryWebRedFaceLocator = true;

    const dimMaterial = new THREE.MeshBasicMaterial({
      color: 0x101217,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
      toneMapped: false,
    });
    if (this.overlayMesh) {
      const dimMesh = new THREE.Mesh(this.overlayMesh.geometry, dimMaterial);
      dimMesh.renderOrder = 9;
      dimMesh.userData.dryWebRedFaceLocatorSharedGeometry = true;
      group.add(dimMesh);
    } else if (basePositions.length > 0 && basePositions.length % 3 === 0) {
      const dimGeometry = new THREE.BufferGeometry();
      dimGeometry.setAttribute("position", new THREE.BufferAttribute(basePositions.slice(), 3));
      const dimMesh = new THREE.Mesh(dimGeometry, dimMaterial);
      dimMesh.renderOrder = 9;
      group.add(dimMesh);
    } else {
      dimMaterial.dispose();
    }

    const redGeometry = new THREE.BufferGeometry();
    redGeometry.setAttribute("position", new THREE.BufferAttribute(redPositions.slice(), 3));
    redGeometry.computeVertexNormals();
    const redMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2144,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    const redMesh = new THREE.Mesh(redGeometry, redMaterial);
    redMesh.renderOrder = 10;
    redMesh.userData.dryWebRedFaceLocatorRedFaces = true;
    group.add(redMesh);
    const markerCentroids = stage7RedFaceLocatorFaceCentroids(redPositions);
    const markerRadius = stage7RedFaceLocatorMarkerRadius(basePositions);
    if (markerCentroids.length > 0 && markerRadius > 0) {
      const markerGeometry = new THREE.SphereGeometry(1, 12, 8);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd34f,
        transparent: true,
        opacity: 0.96,
        wireframe: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const markerMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, markerCentroids.length / 3);
      const matrix = new THREE.Matrix4();
      for (let offset = 0, markerIndex = 0; offset < markerCentroids.length; offset += 3, markerIndex++) {
        matrix.makeScale(markerRadius, markerRadius, markerRadius).setPosition(
          markerCentroids[offset],
          markerCentroids[offset + 1],
          markerCentroids[offset + 2],
        );
        markerMesh.setMatrixAt(markerIndex, matrix);
      }
      markerMesh.instanceMatrix.needsUpdate = true;
      markerMesh.renderOrder = 20;
      markerMesh.userData.dryWebRedFaceLocatorMarkers = markerCentroids.length / 3;
      group.add(markerMesh);
    }
    this.scene.add(group);
    this.dryWebRedFaceLocatorGroup = group;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  clearDryWebRedFaceLocator(): void {
    this.dryWebRedFaceLocatorEnabled = false;
    const group = this.dryWebRedFaceLocatorGroup;
    if (!group) return;
    this.scene.remove(group);
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (!object.userData.dryWebRedFaceLocatorSharedGeometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.dryWebRedFaceLocatorGroup = null;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  /** Install independent cyan/light-blue nearest-edge preview paths. The
   * buffer is copied so the renderer cannot mutate the pure presentation
   * result, and the group follows the same object lift as the mesh/locator. */
  setDryWebRedFaceDryWebCandidateOverlay(
    linePositions: Float32Array,
    enabled: boolean,
  ): void {
    this.clearDryWebRedFaceDryWebCandidateOverlay();
    this.dryWebRedFaceDryWebCandidateEnabled = enabled;
    if (!enabled || linePositions.length === 0 || linePositions.length % 6 !== 0) {
      this.applyLayerVisibility();
      return;
    }
    const group = new THREE.Group();
    group.name = "dry-web-red-face-dry-web-candidate";
    group.position.z = this.phaseAObjectLiftSource;
    group.userData.dryWebRedFaceDryWebCandidate = true;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(linePositions.slice(), 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x78dce8,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 30;
    lines.frustumCulled = false;
    lines.userData.dryWebRedFaceDryWebCandidateLines = linePositions.length / 6;
    group.add(lines);
    this.scene.add(group);
    this.dryWebRedFaceDryWebCandidateGroup = group;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  clearDryWebRedFaceDryWebCandidateOverlay(): void {
    this.dryWebRedFaceDryWebCandidateEnabled = false;
    const group = this.dryWebRedFaceDryWebCandidateGroup;
    if (!group) return;
    this.scene.remove(group);
    group.traverse((object) => {
      if (!(object instanceof THREE.LineSegments) && !(object instanceof THREE.Line) && !(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.dryWebRedFaceDryWebCandidateGroup = null;
    this.applyLayerVisibility();
    this.requestViewportRender();
  }

  clearOverhangSupportSiteOverlay(): void {
    this.overhangSupportSiteVisibilityPolicy = "standard";
    this.overhangSupportSiteGrid = null;
    this.overhangSupportSiteGeometry = null;
    this.overhangSupportSiteIds = [];
    this.overhangSupportSiteNormals = new Float32Array();
    this.overhangSupportSiteCommittedClassifications = [];
    this.overhangSupportSiteCurrentClassifications = [];
    this.overhangSupportSiteIndexById.clear();
    this.overhangSupportSitePreviewIndices.clear();
    if (!this.overhangSupportSiteGroup) return;
    this.scene.remove(this.overhangSupportSiteGroup);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.overhangSupportSiteGroup.traverse((object) => {
      if (!(object instanceof THREE.Points || object instanceof THREE.LineSegments || object instanceof THREE.LineLoop)) return;
      geometries.add(object.geometry);
      if (object instanceof THREE.Points) {
        const material = object.material;
        if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
        else materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.overhangSupportSiteGroup = null;
    this.applyLayerVisibility();
  }

  getOverhangSupportSiteOverlayDebug(): Array<{
    classification: string;
    glyph: string;
    pass: string;
    screenDoorCoverage: number;
    pointCount: number;
    classificationCounts: Record<string, number>;
  }> {
    if (!this.overhangSupportSiteGroup) return [];
    return this.overhangSupportSiteGroup.children.flatMap((object) => {
      if (!(object instanceof THREE.Points)) return [];
      const position = object.geometry.getAttribute("position");
      return [{
        classification: String(object.userData.supportClassification),
        glyph: String(object.userData.supportGlyph),
        pass: String(object.userData.supportPass),
        screenDoorCoverage: Number(object.userData.screenDoorCoverage),
        pointCount: position?.count ?? 0,
        classificationCounts: { ...(object.userData.supportClassificationCounts as Record<string, number>) },
      }];
    });
  }

  private overhangSupportSiteBack(
    index: number,
    cameraPosition: THREE.Vector3,
    raycaster: THREE.Raycaster,
  ): boolean {
    if (!this.overhangSupportSiteGrid || !this.overlayMesh) return false;
    const offset = index * 3;
    const point = new THREE.Vector3(
      this.overhangSupportSiteGrid.points[offset],
      this.overhangSupportSiteGrid.points[offset + 1],
      this.overhangSupportSiteGrid.points[offset + 2],
    );
    const direction = point.clone().sub(cameraPosition);
    const siteDistance = direction.length();
    if (!(siteDistance > 0)) return false;
    raycaster.set(cameraPosition, direction.normalize());
    raycaster.far = siteDistance;
    const hit = raycaster.intersectObject(this.overlayMesh, false)[0];
    const tolerance = Math.max(1e-4, siteDistance * 1e-4);
    return Boolean(hit && hit.distance < siteDistance - tolerance);
  }

  pickOverhangSupportSite(clientX: number, clientY: number, maxDistanceCssPx = 10, includeBack = false): OverhangSupportSitePick | null {
    const grid = this.overhangSupportSiteGrid;
    if (!grid) return null;
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const viewportRect = this.viewportRectFromClient(clientX, clientY);
    if (!viewportRect) return null;
    this.selectViewport(viewportRect.index);
    this.camera.updateMatrixWorld();
    const cameraPosition = this.camera.getWorldPosition(new THREE.Vector3());
    const localX = clientX - canvasRect.left - viewportRect.x;
    const localY = clientY - canvasRect.top - viewportRect.y;
    const pickRay = new THREE.Raycaster();
    pickRay.setFromCamera(new THREE.Vector2(
      localX / Math.max(1, viewportRect.width) * 2 - 1,
      1 - localY / Math.max(1, viewportRect.height) * 2,
    ), this.camera);
    const candidateIndices = queryUniformSpatialGridRayNeighborhood(
      grid,
      pickRay.ray.origin,
      pickRay.ray.direction,
    );
    const projected = new THREE.Vector3();
    const candidates: Array<{ distanceSq: number; siteDistance: number; index: number }> = [];
    for (const index of candidateIndices) {
      const id = this.overhangSupportSiteIds[index];
      if (!id) continue;
      const offset = index * 3;
      const world = new THREE.Vector3(grid.points[offset], grid.points[offset + 1], grid.points[offset + 2]);
      if (!viewportPointVisible(world, this.viewportClippingState)) continue;
      projected.copy(world).project(this.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const x = canvasRect.left + viewportRect.x + (projected.x + 1) * viewportRect.width * 0.5;
      const y = canvasRect.top + viewportRect.y + (1 - projected.y) * viewportRect.height * 0.5;
      const distanceSq = (clientX - x) ** 2 + (clientY - y) ** 2;
      if (distanceSq <= maxDistanceCssPx ** 2) {
        candidates.push({ distanceSq, siteDistance: world.distanceTo(cameraPosition), index });
      }
    }
    candidates.sort((left, right) => left.distanceSq - right.distanceSq || left.siteDistance - right.siteDistance);
    const occlusionRay = new THREE.Raycaster();
    for (const candidate of candidates) {
      const back = this.overhangSupportSiteBack(candidate.index, cameraPosition, occlusionRay);
      if (!supportPaintVisibilityAllows(back, includeBack)) continue;
      const offset = candidate.index * 3;
      return {
        id: this.overhangSupportSiteIds[candidate.index]!,
        classification: this.overhangSupportSiteCurrentClassifications[candidate.index],
        back,
        position: { x: grid.points[offset], y: grid.points[offset + 1], z: grid.points[offset + 2] },
        normal: {
          x: this.overhangSupportSiteNormals[offset],
          y: this.overhangSupportSiteNormals[offset + 1],
          z: this.overhangSupportSiteNormals[offset + 2],
        },
      };
    }
    return null;
  }

  queryOverhangSupportBrushCandidates(
    center: { x: number; y: number; z: number },
    radius: number,
    includeBack: boolean,
    referenceNormal: { x: number; y: number; z: number },
  ): OverhangSupportBrushCandidate[] {
    const grid = this.overhangSupportSiteGrid;
    if (!grid || !(radius > 0)) return [];
    this.camera.updateMatrixWorld();
    const projected = new THREE.Vector3();
    const candidates: OverhangSupportBrushCandidate[] = [];
    for (const index of queryUniformSpatialGridSphere(grid, center, radius)) {
      const id = this.overhangSupportSiteIds[index];
      if (!id) continue;
      const offset = index * 3;
      const position = { x: grid.points[offset], y: grid.points[offset + 1], z: grid.points[offset + 2] };
      if (!viewportPointVisible(position, this.viewportClippingState)) continue;
      projected.set(position.x, position.y, position.z).project(this.camera);
      if (projected.x < -1 || projected.x > 1 || projected.y < -1 || projected.y > 1 || projected.z < -1 || projected.z > 1) continue;
      const normal = {
        x: this.overhangSupportSiteNormals[offset],
        y: this.overhangSupportSiteNormals[offset + 1],
        z: this.overhangSupportSiteNormals[offset + 2],
      };
      if (!includeBack) {
        const normalLength = Math.hypot(normal.x, normal.y, normal.z);
        const referenceLength = Math.hypot(referenceNormal.x, referenceNormal.y, referenceNormal.z);
        if (!(normalLength > 1e-9 && referenceLength > 1e-9)) continue;
        const normalDot = (normal.x * referenceNormal.x + normal.y * referenceNormal.y + normal.z * referenceNormal.z)
          / (normalLength * referenceLength);
        if (normalDot < 0.5) continue;
      }
      candidates.push({
        id,
        classification: this.overhangSupportSiteCurrentClassifications[index],
        position,
        normal,
      });
    }
    return candidates;
  }

  private updateOverhangSupportSiteClassifications(
    changes: readonly { id: string; classification: SupportOverlayMarkerInput["classification"] }[],
    trackPreview: boolean,
  ): number {
    const geometry = this.overhangSupportSiteGeometry;
    if (!geometry || changes.length === 0) return 0;
    const colors = geometry.getAttribute("aMarkerColor") as THREE.BufferAttribute;
    const glyphs = geometry.getAttribute("aMarkerShape") as THREE.BufferAttribute;
    let changed = 0;
    const changedIndices: number[] = [];
    for (const change of changes) {
      const index = this.overhangSupportSiteIndexById.get(change.id);
      if (index === undefined || this.overhangSupportSiteCurrentClassifications[index] === change.classification) continue;
      const presentation = SUPPORT_SITE_PRESENTATION[change.classification];
      const hex = presentation.colorHex;
      colors.setXYZ(index, ((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255);
      glyphs.setX(index, supportGlyphIndex(presentation.glyph));
      this.overhangSupportSiteCurrentClassifications[index] = change.classification;
      if (trackPreview) this.overhangSupportSitePreviewIndices.add(index);
      changedIndices.push(index);
      changed++;
    }
    if (changed > 0) {
      colors.clearUpdateRanges();
      glyphs.clearUpdateRanges();
      changedIndices.sort((left, right) => left - right);
      let rangeStart = changedIndices[0];
      let rangeEnd = rangeStart;
      const flushRange = () => {
        colors.addUpdateRange(rangeStart * 3, (rangeEnd - rangeStart + 1) * 3);
        glyphs.addUpdateRange(rangeStart, rangeEnd - rangeStart + 1);
      };
      for (let cursor = 1; cursor < changedIndices.length; cursor++) {
        const index = changedIndices[cursor];
        if (index === rangeEnd + 1) { rangeEnd = index; continue; }
        flushRange();
        rangeStart = index;
        rangeEnd = index;
      }
      flushRange();
      colors.needsUpdate = true;
      glyphs.needsUpdate = true;
    }
    return changed;
  }

  previewOverhangSupportSiteClassifications(
    changes: readonly { id: string; classification: SupportOverlayMarkerInput["classification"] }[],
  ): number {
    return this.updateOverhangSupportSiteClassifications(changes, true);
  }

  commitOverhangSupportSiteClassifications(
    changes: readonly { id: string; classification: SupportOverlayMarkerInput["classification"] }[],
  ): number {
    const changed = this.updateOverhangSupportSiteClassifications(changes, false);
    for (const change of changes) {
      const index = this.overhangSupportSiteIndexById.get(change.id);
      if (index === undefined) continue;
      this.overhangSupportSiteCommittedClassifications[index] = change.classification;
      this.overhangSupportSitePreviewIndices.delete(index);
    }
    return changed;
  }

  clearOverhangSupportSitePreview(): void {
    if (this.overhangSupportSitePreviewIndices.size === 0) return;
    const changes = [...this.overhangSupportSitePreviewIndices].flatMap((index) => {
      const id = this.overhangSupportSiteIds[index];
      const classification = this.overhangSupportSiteCommittedClassifications[index] as SupportOverlayMarkerInput["classification"] | undefined;
      return id && classification ? [{ id, classification }] : [];
    });
    this.updateOverhangSupportSiteClassifications(changes, false);
    this.overhangSupportSitePreviewIndices.clear();
  }

  /** Display-only routing evidence. Sites are classified by the shared
   * production policy; this overlay does not change assignment or validation. */
  setOverhangSupportSiteOverlay(
    markers: readonly OverhangSupportSiteOverlayMarker[],
    mixedFacePositions: Float32Array,
    baseFootprintPositions: Float32Array,
    depthMode: SupportSiteDepthMode,
    visibilityPolicy: OverhangSupportSiteVisibilityPolicy = "standard",
  ): void {
    this.clearOverhangSupportSiteOverlay();
    if (markers.length === 0 && mixedFacePositions.length === 0 && baseFootprintPositions.length === 0) return;
    this.overhangSupportSiteVisibilityPolicy = visibilityPolicy;
    const group = new THREE.Group();
    const batch = buildSupportOverlayBatch(markers);
    if (batch) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(batch.positions, 3));
      geometry.setAttribute("aMarkerColor", new THREE.BufferAttribute(batch.colors, 3));
      geometry.setAttribute("aMarkerShape", new THREE.BufferAttribute(batch.glyphIndices, 1));
      geometry.setAttribute("aMarkerEmphasis", new THREE.BufferAttribute(new Float32Array(batch.classifications.length), 1));
      this.overhangSupportSiteGeometry = geometry;
      this.overhangSupportSiteGrid = buildUniformSpatialGrid3(batch.positions);
      this.overhangSupportSiteIds = batch.ids;
      this.overhangSupportSiteNormals = batch.normals;
      this.overhangSupportSiteCommittedClassifications = [...batch.classifications];
      this.overhangSupportSiteCurrentClassifications = batch.classifications;
      batch.ids.forEach((id, index) => { if (id) this.overhangSupportSiteIndexById.set(id, index); });
      for (const pass of supportOverlayPasses(depthMode)) {
        const material = new THREE.ShaderMaterial({
          vertexShader: SUPPORT_MARKER_VERTEX_SHADER,
          fragmentShader: SUPPORT_MARKER_FRAGMENT_SHADER,
          uniforms: {
            uPointSize: { value: 13 * this.renderer.getPixelRatio() },
            uScreenDoorCoverage: { value: pass.screenDoorCoverage },
            uShowBrushEmphasis: { value: 1 },
          },
          depthTest: pass.depthTest,
          depthWrite: pass.depthWrite,
          clipping: true,
          // No alpha blending: the back pass is thinned by a deterministic
          // screen-door mask and every visible pixel keeps its exact hue.
          transparent: true,
          blending: THREE.NoBlending,
          toneMapped: false,
        });
        const points = new THREE.Points(geometry, material);
        points.renderOrder = pass.kind === "back" ? 40 : 41;
        points.frustumCulled = false;
        points.userData.supportClassification = "combined";
        points.userData.supportGlyph = "per-site";
        points.userData.supportPass = pass.kind;
        points.userData.screenDoorCoverage = pass.screenDoorCoverage;
        points.userData.supportEntryIds = batch.ids;
        points.userData.supportClassifications = batch.classifications;
        points.userData.supportClassificationCounts = batch.classificationCounts;
        group.add(points);
      }
    }
    if (mixedFacePositions.length > 0) {
      const linePositions = new Float32Array(mixedFacePositions.length * 2);
      let cursor = 0;
      for (let offset = 0; offset < mixedFacePositions.length; offset += 9) {
        const a = mixedFacePositions.subarray(offset, offset + 3);
        const b = mixedFacePositions.subarray(offset + 3, offset + 6);
        const c = mixedFacePositions.subarray(offset + 6, offset + 9);
        for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
          linePositions.set(from, cursor);
          linePositions.set(to, cursor + 3);
          cursor += 6;
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
      const lines = new THREE.LineSegments(geometry, this.mixedFaceMaterial);
      lines.renderOrder = 42;
      lines.frustumCulled = false;
      group.add(lines);
    }
    if (baseFootprintPositions.length >= 9 && baseFootprintPositions.length % 3 === 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(baseFootprintPositions, 3));
      const outline = new THREE.LineLoop(geometry, this.baseFootprintMaterial);
      outline.renderOrder = 43;
      outline.frustumCulled = false;
      group.add(outline);
    }
    this.scene.add(group);
    this.overhangSupportSiteGroup = group;
    this.applyLayerVisibility();
  }

  /** One display-only final-mesh vertex marker for every attributed motif.
   * Markers ignore scene depth so a low point on the far side remains
   * discoverable; rotating the form is still needed to read its actual
   * spatial relation. */
  setMotifLowestPointMarkers(markers: MotifLowestPoint[] | null, selectedPatchId?: number | null): void {
    if (this.motifLowestPointGroup) {
      this.scene.remove(this.motifLowestPointGroup);
      this.motifLowestPointGroup.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      this.motifLowestPointGroup = null;
    }
    this.motifLowestPointMarkers = markers?.map((marker) => ({
      ...marker,
      position: { ...marker.position },
      ...(marker.normal ? { normal: { ...marker.normal } } : {}),
    })) ?? [];
    if (selectedPatchId !== undefined) this.selectedMotifLowestPointPatchId = selectedPatchId;
    if (!this.motifLowestPointMarkers.some((marker) => marker.patchId === this.selectedMotifLowestPointPatchId)) {
      this.selectedMotifLowestPointPatchId = null;
    }
    if (this.motifLowestPointMarkers.length === 0) return;
    const group = new THREE.Group();
    const add = (subset: MotifLowestPoint[], material: THREE.MeshBasicMaterial) => {
      if (subset.length === 0) return;
      const mesh = new THREE.InstancedMesh(this.motifLowestPointGeometry, material, subset.length);
      const matrix = new THREE.Matrix4();
      for (const [index, marker] of subset.entries()) {
        matrix.makeScale(marker.markerRadius, marker.markerRadius, marker.markerRadius)
          .setPosition(marker.position.x, marker.position.y, marker.position.z);
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 40;
      mesh.frustumCulled = false;
      group.add(mesh);
    };
    add(this.motifLowestPointMarkers.filter((marker) => !marker.reachedByInternal), this.motifLowestUnreachedMaterial);
    add(this.motifLowestPointMarkers.filter((marker) => marker.reachedByInternal), this.motifLowestReachedMaterial);
    const selected = this.motifLowestPointMarkers.find((marker) => marker.patchId === this.selectedMotifLowestPointPatchId);
    if (selected) {
      const highlight = new THREE.Mesh(this.motifLowestPointGeometry, this.motifLowestSelectedMaterial);
      const scale = selected.markerRadius * 2.6;
      highlight.scale.set(scale, scale, scale);
      highlight.position.set(selected.position.x, selected.position.y, selected.position.z);
      highlight.renderOrder = 41;
      highlight.frustumCulled = false;
      group.add(highlight);
      const outline = new THREE.Mesh(this.motifLowestPointGeometry, this.motifLowestSelectedOutlineMaterial);
      const outlineScale = selected.markerRadius * 4.2;
      outline.scale.set(outlineScale, outlineScale, outlineScale);
      outline.position.copy(highlight.position);
      outline.renderOrder = 42;
      outline.frustumCulled = false;
      outline.name = `skin-rebuild-unsupported-target-${selected.patchId}`;
      group.add(outline);
    }
    group.position.z = this.phaseAObjectLiftSource;
    this.scene.add(group);
    this.motifLowestPointGroup = group;
    this.applyLayerVisibility();
  }

  setSelectedMotifLowestPointMarker(patchId: number | null): void {
    this.setMotifLowestPointMarkers(this.motifLowestPointMarkers, patchId);
  }

  /** Pick the visible depth-independent lowest-point marker in the active
   * viewport.  The generous hit radius makes a red face target practical to
   * select without changing ordinary Pattern picking outside Stage 4/5. */
  pickMotifLowestPointMarker(
    clientX: number,
    clientY: number,
    allowedPatchIds?: readonly number[],
  ): number | null {
    const allowed = allowedPatchIds ? new Set(allowedPatchIds) : null;
    const ray = this.screenToRayFromClient(clientX, clientY);
    let best: { patchId: number; ratio: number; along: number } | null = null;
    for (const marker of this.motifLowestPointMarkers) {
      if (allowed && !allowed.has(marker.patchId)) continue;
      const dx = marker.position.x - ray.origin.x;
      const dy = marker.position.y - ray.origin.y;
      const dz = marker.position.z + this.phaseAObjectLiftSource - ray.origin.z;
      const along = dx * ray.dir.x + dy * ray.dir.y + dz * ray.dir.z;
      if (along <= 0) continue;
      const perpendicular = Math.hypot(
        dx - ray.dir.x * along,
        dy - ray.dir.y * along,
        dz - ray.dir.z * along,
      );
      const hitRadius = Math.max(0.04, marker.markerRadius * 2.75);
      const ratio = perpendicular / hitRadius;
      if (ratio > 1) continue;
      if (!best || ratio < best.ratio - 1e-6 || (Math.abs(ratio - best.ratio) <= 1e-6 && along < best.along)) {
        best = { patchId: marker.patchId, ratio, along };
      }
    }
    return best?.patchId ?? null;
  }

  /** Replace categorical opening overlays without rebuilding their analysed
   * mesh. This is used by the top-N filter and therefore does no field work. */
  setOpeningMap(openings: OpeningMeasurement[] | null): void {
    if (this.denseSampleActive) this.clearDenseFlowerSample();
    this.clearOpeningVisuals();
    if (!openings || openings.length === 0) return;
    const group = new THREE.Group();
    group.visible = this.viewMode === "mesh";
    const labels: OpeningLabelDatum[] = [];
    for (const opening of openings) {
      const positions = new Float32Array(opening.triangles.length * 9);
      let cursor = 0;
      for (const tri of opening.triangles) for (const point of [tri.a, tri.b, tri.c]) {
        positions[cursor++] = point.x; positions[cursor++] = point.y; positions[cursor++] = point.z;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({ color: opening.color, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthTest: true, depthWrite: false });
      group.add(new THREE.Mesh(geometry, material));
      const lift = 0.012;
      labels.push({
        id: opening.id,
        color: opening.color,
        areaMm2: opening.areaMm2,
        perimeterMm: opening.perimeterMm,
        anchor: new THREE.Vector3(
          opening.centroid.x + opening.averageNormal.x * lift,
          opening.centroid.y + opening.averageNormal.y * lift,
          opening.centroid.z + opening.averageNormal.z * lift,
        ),
        normal: new THREE.Vector3(opening.averageNormal.x, opening.averageNormal.y, opening.averageNormal.z).normalize(),
      });
    }
    this.openingGroup = group;
    this.scene.add(group);
    this.setOpeningLabels(labels);
    this.applyLayerVisibility();
  }

  /** Show the preserved v6 result STL with its independently measured top-40
   * opening surfaces. It is intentionally read-only: this STL predates the
   * new generalized lace recipe and must not be presented as replayable. */
  setDenseFlowerSample(sample: DenseFlowerSample): void {
    this.clearOpeningVisuals();
    this.denseSampleActive = true;
    this.denseSampleView = "3d";
    const group = new THREE.Group();
    sample.master.computeBoundingBox();
    const bounds = sample.master.boundingBox;
    if (!bounds) throw new Error("v6 STL の境界を求められませんでした");
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 4.6 / Math.max(size.x, size.y, size.z, 1e-9);
    group.scale.setScalar(scale);
    group.position.copy(center).multiplyScalar(-scale);

    sample.master.computeVertexNormals();
    group.add(new THREE.Mesh(sample.master, new THREE.MeshStandardMaterial({
      color: 0xd7d9dd,
      roughness: 0.88,
      metalness: 0,
    })));
    const labels: OpeningLabelDatum[] = [];
    for (const opening of sample.openings) {
      opening.geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({
        color: opening.color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(opening.geometry, material);
      mesh.renderOrder = 2;
      group.add(mesh);
      const anchor = new THREE.Vector3(opening.centroidMm.x, opening.centroidMm.y, opening.centroidMm.z)
        .multiplyScalar(scale)
        .add(group.position);
      const normal = new THREE.Vector3(opening.averageNormal.x, opening.averageNormal.y, opening.averageNormal.z).normalize();
      anchor.addScaledVector(normal, 0.018);
      labels.push({
        id: opening.id,
        color: opening.color,
        areaMm2: opening.areaMm2,
        perimeterMm: opening.perimeterMm,
        anchor,
        normal,
      });
    }
    this.openingGroup = group;
    this.scene.add(group);
    this.setOpeningLabels(labels);
    this.camera.position.set(4.7, 2.8, 5.4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.renderer.domElement.style.visibility = "visible";
    this.denseSampleAtlas.hidden = true;
    this.setViewMode("mesh");
  }

  setDenseFlowerSampleView(view: DenseSampleView): void {
    if (!this.denseSampleActive) return;
    this.denseSampleView = view;
    const atlas = view === "sixViews";
    this.renderer.domElement.style.visibility = atlas ? "hidden" : "visible";
    this.denseSampleAtlas.hidden = !atlas;
    if (this.openingGroup) this.openingGroup.visible = !atlas;
    this.openingLabelLayer.hidden = atlas;
    this.openingLineLayer.style.display = atlas ? "none" : "";
  }

  clearDenseFlowerSample(): void {
    if (!this.denseSampleActive) return;
    this.denseSampleActive = false;
    this.denseSampleView = "3d";
    this.renderer.domElement.style.visibility = "visible";
    this.denseSampleAtlas.hidden = true;
    this.clearOpeningVisuals();
    this.setViewMode(this.viewMode);
  }

  private clearOpeningVisuals(): void {
    if (this.openingGroup) {
      this.scene.remove(this.openingGroup);
      this.openingGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      this.openingGroup = null;
    }
    this.openingLabels.length = 0;
    this.openingLabelLayer.replaceChildren();
    this.openingLineLayer.replaceChildren();
  }

  private setOpeningLabels(data: OpeningLabelDatum[]): void {
    this.openingLabels.length = 0;
    this.openingLabelLayer.replaceChildren();
    this.openingLineLayer.replaceChildren();
    for (let index = 0; index < data.length; index++) {
      const item = data[index];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", item.color);
      this.openingLineLayer.appendChild(line);
      const element = document.createElement("div");
      element.className = "opening-drag-label";
      element.dataset.openingId = item.id;
      element.style.setProperty("--opening-color", item.color);
      element.innerHTML = `<strong>${item.id}</strong><span>面積 ${item.areaMm2.toFixed(1)} mm²</span><span>周長 ${item.perimeterMm.toFixed(1)} mm</span>`;
      element.title = "ドラッグして位置を動かせます";
      const label: OpeningDomLabel = {
        data: item,
        element,
        line,
        dx: 0,
        dy: 0,
        moved: false,
      };
      element.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        element.classList.add("is-dragging");
        this.activeOpeningDrag = {
          pointerId: event.pointerId,
          label,
          startX: event.clientX,
          startY: event.clientY,
          startDx: label.dx,
          startDy: label.dy,
        };
      });
      this.openingLabelLayer.appendChild(element);
      this.openingLabels.push(label);
    }
  }

  private projectedOpeningSubjectRect(width: number, height: number): ScreenRect | null {
    const subject = this.denseSampleActive ? this.openingGroup : this.overlayMesh ?? this.openingGroup;
    if (!subject) return null;
    const box = new THREE.Box3().setFromObject(subject);
    if (box.isEmpty()) return null;
    const projected: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(this.camera);
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) projected.push(point);
    }
    if (projected.length === 0) return null;
    const xs = projected.map((point) => (point.x * 0.5 + 0.5) * width);
    const ys = projected.map((point) => (-point.y * 0.5 + 0.5) * height);
    return {
      left: Math.max(0, Math.min(...xs)),
      top: Math.max(0, Math.min(...ys)),
      right: Math.min(width, Math.max(...xs)),
      bottom: Math.min(height, Math.max(...ys)),
    };
  }

  private updateOpeningLabels(): void {
    if (this.openingLabelLayer.hidden || this.viewMode !== "mesh") return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.openingLineLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const visibleLabels: Array<{ label: OpeningDomLabel; anchorX: number; anchorY: number }> = [];
    for (const label of this.openingLabels) {
      const projected = label.data.anchor.clone().project(this.camera);
      const toCamera = this.camera.position.clone().sub(label.data.anchor).normalize();
      const frontFacing = label.data.normal.dot(toCamera) > -0.12;
      const visible = projected.z > -1 && projected.z < 1 && frontFacing && this.denseSampleAtlas.hidden;
      label.element.hidden = !visible;
      label.line.style.display = visible ? "" : "none";
      if (!visible) continue;
      const anchorX = (projected.x * 0.5 + 0.5) * width;
      const anchorY = (-projected.y * 0.5 + 0.5) * height;
      visibleLabels.push({ label, anchorX, anchorY });
    }
    const automatic = visibleLabels.filter(({ label }) => !label.moved);
    const automaticPositions = layoutOpeningLabelsOutside(
      automatic.map(({ anchorX, anchorY }) => ({ x: anchorX, y: anchorY })),
      {
        viewportWidth: width,
        viewportHeight: height,
        subjectRect: this.projectedOpeningSubjectRect(width, height),
        obstacleRects: [...this.container.querySelectorAll<HTMLElement>(
          ".viewport-view-dock, .history-undo-dock, .selected-element-dock, .viewport-task-status, .quick-edit-toolbar",
        )]
          .filter((element) => !element.hidden)
          .map((element) => {
            const containerRect = this.container.getBoundingClientRect();
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left - containerRect.left,
              top: rect.top - containerRect.top,
              right: rect.right - containerRect.left,
              bottom: rect.bottom - containerRect.top,
            };
          }),
      },
    );
    const automaticPositionByLabel = new Map(automatic.map(({ label }, index) => [label, automaticPositions[index]]));
    for (const { label, anchorX, anchorY } of visibleLabels) {
      const automaticPosition = automaticPositionByLabel.get(label);
      if (automaticPosition) {
        label.dx = automaticPosition.x - anchorX;
        label.dy = automaticPosition.y - anchorY;
      }
      const labelX = Math.max(71, Math.min(width - 71, anchorX + label.dx));
      const labelY = Math.max(35, Math.min(height - 35, anchorY + label.dy));
      label.element.style.left = `${labelX}px`;
      label.element.style.top = `${labelY}px`;
      label.line.setAttribute("x1", anchorX.toFixed(1));
      label.line.setAttribute("y1", anchorY.toFixed(1));
      label.line.setAttribute("x2", labelX.toFixed(1));
      label.line.setAttribute("y2", labelY.toFixed(1));
    }
  }

  /** Small stable names for discussing individual motifs. Dense fields are
   * sampled, while the selected patch is always included. */
  setElementNames(
    patches: Patch[],
    selectedPatchId: number | null,
    alwaysVisible: boolean,
    hoveredPatchId: number | null = null,
  ): void {
    this.elementLabels.length = 0;
    this.elementLabelLayer.replaceChildren();
    const chosen = alwaysVisible
      ? representativeElements(patches, 24, selectedPatchId)
      : patches.filter((patch) => patch.id === selectedPatchId || patch.id === hoveredPatchId);
    this.elementLabelLayer.hidden = chosen.length === 0;
    for (const patch of chosen) {
      if (patch.points.length === 0) continue;
      const inv = 1 / patch.points.length;
      const anchor = new THREE.Vector3(
        patch.points.reduce((sum, point) => sum + point.x, 0) * inv,
        patch.points.reduce((sum, point) => sum + point.y, 0) * inv,
        patch.points.reduce((sum, point) => sum + point.z, 0) * inv,
      );
      const element = document.createElement("div");
      element.className = "element-name-tag";
      element.classList.toggle("is-selected", patch.id === selectedPatchId);
      element.classList.toggle("is-hovered", patch.id === hoveredPatchId);
      element.textContent = elementDisplayName("surface", patch.shape, patch.id);
      element.title = `表面充填要素 / Patch ID ${patch.id}`;
      this.elementLabelLayer.appendChild(element);
      this.elementLabels.push({ element, anchor });
    }
  }

  private updateElementNames(): void {
    if (this.elementLabelLayer.hidden) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const distances = this.elementLabels.map((label) => this.camera.position.distanceTo(label.anchor));
    const nearest = distances.length > 0 ? Math.min(...distances) : 0;
    const farthest = distances.length > 0 ? Math.max(...distances) : 0;
    for (const [index, label] of this.elementLabels.entries()) {
      const projected = label.anchor.clone().project(this.camera);
      const visible = projected.z > -1 && projected.z < 1 && !this.denseSampleActive;
      label.element.hidden = !visible;
      if (!visible) continue;
      label.element.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
      label.element.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
      const selected = label.element.classList.contains("is-selected");
      const opacity = elementLabelDepthOpacity(distances[index], nearest, farthest, selected);
      label.element.style.opacity = opacity.toFixed(3);
      label.element.style.zIndex = selected ? "2" : opacity > 0.65 ? "1" : "0";
    }
  }

  /** Rebuild the bead approximation's InstancedMeshes from scratch (host
   * balls + every patch point, no cap). Called on structural changes (pack,
   * add/remove patch, regrow host) -- NOT every frame. Visibility is
   * controlled separately via setViewMode so a rebuild doesn't need to know
   * whether beads are currently the active view. */
  updateBeads(host: Ball[], patches: Patch[], selectedPatchId: number | null): void {
    if (this.hostBeadMesh) {
      this.scene.remove(this.hostBeadMesh);
      this.hostBeadMesh.dispose();
      this.hostBeadMesh = null;
    }
    if (this.patchBeadMesh) {
      this.scene.remove(this.patchBeadMesh);
      this.patchBeadMesh.dispose();
      this.patchBeadMesh = null;
    }
    this.patchBeadOwner = [];
    this.patchBeadOriginalScale = [];

    if (host.length > 0) {
      const hostMesh = new THREE.InstancedMesh(this.beadSphereGeo, this.hostBeadMaterial, host.length);
      const m = new THREE.Matrix4();
      for (let i = 0; i < host.length; i++) {
        const b = host[i];
        m.makeScale(b.r, b.r, b.r).setPosition(b.x, b.y, b.z);
        hostMesh.setMatrixAt(i, m);
      }
      hostMesh.instanceMatrix.needsUpdate = true;
      hostMesh.visible = this.viewMode === "beads";
      this.scene.add(hostMesh);
      this.hostBeadMesh = hostMesh;
    }

    const totalPoints = patches.reduce((s, p) => s + p.points.length, 0);
    if (totalPoints > 0) {
      const patchMesh = new THREE.InstancedMesh(this.beadSphereGeo, this.patchBeadMaterial, totalPoints);
      const m = new THREE.Matrix4();
      let n = 0;
      for (const patch of patches) {
        for (const pt of patch.points) {
          m.makeScale(pt.r, pt.r, pt.r).setPosition(pt.x, pt.y, pt.z);
          patchMesh.setMatrixAt(n, m);
          this.patchBeadOwner.push(patch.id);
          this.patchBeadOriginalScale.push(pt.r);
          n++;
        }
      }
      patchMesh.instanceMatrix.needsUpdate = true;
      patchMesh.visible = this.viewMode === "beads";
      this.scene.add(patchMesh);
      this.patchBeadMesh = patchMesh;
      this.updateBeadSelection(selectedPatchId);
      if (this.activeGroups || this.activeNGroupByPatch) this.setBeadGroupFilter(this.beadGroupFilter);
    } else {
      this.lastSelectedPatchId = selectedPatchId;
      this.updateSelectionHighlight(); // no patches left -- drop any stale outline
    }
    this.applyLayerVisibility();
  }

  /** Update one realized motif in-place when its point count is unchanged.
   * Position/rotation/scale edits therefore touch only that motif's instance
   * matrices instead of rebuilding every bead in the scene. Returns false
   * for structural reshapes so the caller can safely fall back to updateBeads. */
  updatePatchBeads(patch: Patch, selectedPatchId: number | null): boolean {
    const mesh = this.patchBeadMesh;
    if (!mesh) return false;
    const indices: number[] = [];
    for (let index = 0; index < this.patchBeadOwner.length; index++) {
      if (this.patchBeadOwner[index] === patch.id) indices.push(index);
    }
    if (indices.length !== patch.points.length) return false;
    const hidden = this.activeGroups && this.beadGroupFilter !== "both"
      ? (this.beadGroupFilter === "A" && !this.activeGroups.A.has(patch.id)) ||
        (this.beadGroupFilter === "B" && !this.activeGroups.B.has(patch.id))
      : false;
    const matrix = new THREE.Matrix4();
    for (let pointIndex = 0; pointIndex < patch.points.length; pointIndex++) {
      const point = patch.points[pointIndex];
      const scale = hidden ? 0 : point.r;
      matrix.makeScale(scale, scale, scale).setPosition(point.x, point.y, point.z);
      mesh.setMatrixAt(indices[pointIndex], matrix);
      this.patchBeadOriginalScale[indices[pointIndex]] = point.r;
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.updateBeadSelection(selectedPatchId);
    return true;
  }

  /** Move only the selected motif's lightweight bead representation during
   * a pointer drag. No field, mesh overlay, history, or other patch is
   * rebuilt here. Raymarch gets an explicit wire proxy because its surface
   * is a fullscreen shader and cannot be edited incrementally. */
  updatePatchDragPreview(patch: Patch, selectedPatchId: number | null): void {
    const updatedExisting = this.updatePatchBeads(patch, selectedPatchId);
    const needsProxy = this.viewMode === "raymarch" || !updatedExisting;
    if (!needsProxy) {
      if (this.dragPreviewMesh) this.dragPreviewMesh.visible = false;
      return;
    }
    if (!this.dragPreviewMesh || this.dragPreviewMesh.count < patch.points.length) {
      if (this.dragPreviewMesh) {
        this.scene.remove(this.dragPreviewMesh);
        this.dragPreviewMesh.dispose();
      }
      this.dragPreviewMesh = new THREE.InstancedMesh(this.beadSphereGeo, this.dragPreviewMaterial, patch.points.length);
      this.dragPreviewMesh.renderOrder = 20;
      this.scene.add(this.dragPreviewMesh);
    }
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < patch.points.length; index++) {
      const point = patch.points[index];
      const radius = point.r * 1.025;
      matrix.makeScale(radius, radius, radius).setPosition(point.x, point.y, point.z);
      this.dragPreviewMesh.setMatrixAt(index, matrix);
    }
    for (let index = patch.points.length; index < this.dragPreviewMesh.count; index++) {
      matrix.makeScale(0, 0, 0);
      this.dragPreviewMesh.setMatrixAt(index, matrix);
    }
    this.dragPreviewMesh.instanceMatrix.needsUpdate = true;
    this.dragPreviewMesh.visible = !this.denseSampleActive && this.internalObservationMode !== "internalOnly";
  }

  clearPatchDragPreview(): void {
    if (this.dragPreviewMesh) this.dragPreviewMesh.visible = false;
  }

  /** Cheap re-color of the existing patch beads for a new selection --
   * no geometry rebuild (matrices unchanged), just instanceColor plus the
   * separate outline InstancedMesh (see updateSelectionHighlight). T14: A/B
   * membership color is now ALWAYS kept (previously a T13 grouping silently
   * dropped the selection highlight entirely, per 作者Observation
   * 2026-07-20 "選択できているのかわからない" -- see recolorBeads). */
  updateBeadSelection(selectedPatchId: number | null): void {
    this.lastSelectedPatchId = selectedPatchId;
    this.recolorBeads();
    this.updateSelectionHighlight();
  }

  /** Rebuild the small wire InstancedMesh over just the selected patch's own
   * source bead instances. Bead view uses an oversized selection shell;
   * generated-mesh view shows the underlying bead construction almost at
   * source scale so the authored motif remains legible after conversion. It
   * hides itself if nothing is selected or the selected patch's group is
   * currently filtered out of view (setBeadGroupFilter's Aのみ/Bのみ). No
   * full patchBeadMesh rebuild -- matrices are copied from the existing
   * instances, so this stays cheap even at CoinSRF scale. */
  private updateSelectionHighlight(): void {
    const mesh = this.patchBeadMesh;
    const selId = this.lastSelectedPatchId;
    const wireScale = selectedBeadWireScale(this.viewMode);
    let hiddenByFilter = false;
    if (selId !== null && this.activeGroups && this.beadGroupFilter !== "both") {
      const inA = this.activeGroups.A.has(selId);
      const inB = this.activeGroups.B.has(selId);
      hiddenByFilter = (this.beadGroupFilter === "A" && !inA) || (this.beadGroupFilter === "B" && !inB);
    }
    if (!mesh || selId === null || hiddenByFilter || wireScale === null || this.denseSampleActive ||
      this.internalObservationMode === "internalOnly") {
      if (this.highlightMesh) this.highlightMesh.visible = false;
      return;
    }
    const indices: number[] = [];
    for (let i = 0; i < this.patchBeadOwner.length; i++) {
      if (this.patchBeadOwner[i] === selId) indices.push(i);
    }
    if (indices.length === 0) {
      if (this.highlightMesh) this.highlightMesh.visible = false;
      return;
    }
    if (!this.highlightMesh || this.highlightMesh.count < indices.length) {
      if (this.highlightMesh) {
        this.scene.remove(this.highlightMesh);
        this.highlightMesh.dispose();
      }
      this.highlightMesh = new THREE.InstancedMesh(this.beadSphereGeo, this.highlightMaterial, indices.length);
      this.scene.add(this.highlightMesh);
    }
    const src = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const out = new THREE.Matrix4();
    for (let k = 0; k < indices.length; k++) {
      mesh.getMatrixAt(indices[k], src);
      pos.setFromMatrixPosition(src);
      const r = (this.patchBeadOriginalScale[indices[k]] ?? 0) * wireScale;
      out.makeScale(r, r, r).setPosition(pos);
      this.highlightMesh.setMatrixAt(k, out);
    }
    // Zero-scale any leftover instances from a previously larger selection
    // (e.g. switching from a many-point ring patch to a smaller coin) so
    // stale shells don't linger at old positions.
    for (let k = indices.length; k < this.highlightMesh.count; k++) {
      out.makeScale(0, 0, 0);
      this.highlightMesh.setMatrixAt(k, out);
    }
    this.highlightMesh.instanceMatrix.needsUpdate = true;
    this.highlightMesh.visible = true;
  }

  private recolorBeads(): void {
    const mesh = this.patchBeadMesh;
    if (!mesh) return;
    const groups = this.activeGroups;
    const nGroups = this.activeNGroupByPatch;
    const contactCounts = this.activeContactCountByPatch;
    const dryWebContactCounts = this.activeDryWebContactCountByPatch;
    const selId = this.lastSelectedPatchId;
    for (let i = 0; i < this.patchBeadOwner.length; i++) {
      const id = this.patchBeadOwner[i];
      // T14: A/B membership color is the base color unconditionally -- it
      // used to be replaced by SELECTED_COLOR (or silently ignored
      // entirely once a T13 grouping was active, the root cause of the
      // "can't tell what's selected" report). Selection is now conveyed by
      // dimming everything ELSE instead, so the selected bead's own A/B/
      // unassigned color is never lost.
      const nGroupIndex = nGroups?.get(id);
      const contactCount = contactCounts?.get(id);
      const dryWebContactCount = dryWebContactCounts?.get(id);
      let c: THREE.Color = dryWebContactCount !== undefined
        ? (() => {
          const normalized = Number.isFinite(dryWebContactCount)
            ? Math.max(0, Math.round(dryWebContactCount))
            : 0;
          const key = dryWebContactBinKey(normalized);
          const base = key === "zero"
            ? DRY_WEB_CONTACT_ZERO_COLOR
            : key === "one"
              ? DRY_WEB_CONTACT_ONE_COLOR
              : key === "two"
                ? DRY_WEB_CONTACT_TWO_COLOR
                : DRY_WEB_CONTACT_THREE_PLUS_COLOR;
          // Keep the four bin hues stable while making the selected numeric
          // boundary legible directly in the viewport: below-target bins are
          // dimmed, threshold-meeting bins keep their saturated color.
          return normalized < this.dryWebContactTarget ? base.clone().multiplyScalar(0.58) : base;
        })()
        : nGroupIndex !== undefined
          ? (N_GROUP_COLORS[nGroupIndex] ?? UNASSIGNED_GROUP_COLOR)
        : groups
          ? (groups.A.has(id) ? GROUP_A_COLOR : groups.B.has(id) ? GROUP_B_COLOR : UNASSIGNED_GROUP_COLOR)
          : contactCount !== undefined
            ? (contactCount <= 1 ? CONTACT_WEAK_COLOR : contactCount < this.contactTarget ? CONTACT_TWO_COLOR : CONTACT_GOOD_COLOR)
            : PATCH_BEAD_COLOR;
      if (selId !== null && id !== selId) {
        c = c.clone().multiplyScalar(SELECTION_DIM_FACTOR);
      }
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** T14 §2.4: A/B endpoint markers -- camera-facing badges with a big
   * letter, positioned at each seed patch's representative point
   * (points[0], the same stable display representative used by main.ts;
   * an annular coin intentionally places it on its rim). Passing null for a side
   * removes its badge (endpoint cleared / reselecting). */
  setEndpointBadges(markers: { A: { x: number; y: number; z: number } | null; B: { x: number; y: number; z: number } | null }): void {
    this.updateEndpointBadge("A", markers.A, SEED_A_BADGE_COLOR);
    this.updateEndpointBadge("B", markers.B, SEED_B_BADGE_COLOR);
  }

  private makeBadgeTexture(letter: "A" | "B", ringColor: string): THREE.Texture {
    const cached = this.badgeTextureCache.get(letter);
    if (cached) return cached;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(12, 12, 16, 0.88)";
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = ringColor;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, size / 2, size / 2 + 4);
    const tex = new THREE.CanvasTexture(canvas);
    this.badgeTextureCache.set(letter, tex);
    return tex;
  }

  private updateEndpointBadge(key: "A" | "B", pos: { x: number; y: number; z: number } | null, ringColor: string): void {
    const existing = this.endpointBadges[key];
    if (!pos) {
      if (existing) {
        this.scene.remove(existing);
        existing.material.dispose();
      }
      this.endpointBadges[key] = null;
      return;
    }
    let sprite = existing;
    if (!sprite) {
      // depthTest:false -- the badge sits at the seed patch's own anchor
      // point, i.e. the CENTER of an opaque bead sphere. With normal depth
      // testing the sphere's own front face would occlude the badge
      // entirely (unlike the selection outline, which is deliberately
      // oversized to sit OUTSIDE its bead and so keeps normal depth
      // behavior). A badge that can't be seen isn't a badge.
      const material = new THREE.SpriteMaterial({
        map: this.makeBadgeTexture(key, ringColor),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      sprite = new THREE.Sprite(material);
      sprite.scale.set(0.28, 0.28, 1);
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      this.endpointBadges[key] = sprite;
    }
    sprite.position.set(pos.x, pos.y, pos.z);
    sprite.visible = deriveSkinLayerVisibility(
      this.viewMode, this.internalObservationMode, this.denseSampleActive,
    ).patchBeads;
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
    const pixelRatio = this.renderer.getPixelRatio();
    this.overhangSupportSiteGroup?.traverse((object) => {
      const material = (object as THREE.Points).material as THREE.ShaderMaterial | undefined;
      if (material?.uniforms?.uPointSize) material.uniforms.uPointSize.value = 13 * pixelRatio;
    });
    this.syncViewportHud();
    this.requestViewportRender();
  }

  update(
    host: Ball[],
    hostK: number,
    thickness: number,
    patches: Patch[],
    roundK: number,
    mode: SkinMode,
    selectedPatchId: number | null,
    coinBulge: number,
    coinBulgeBalance: number,
  ): void {
    const hostPos = this.material.uniforms.uHostPos.value as THREE.Vector3[];
    const hostRad = this.material.uniforms.uHostRadius.value as Float32Array;
    const nh = Math.min(host.length, HOST_MAX_BALLS);
    for (let i = 0; i < nh; i++) {
      hostPos[i].set(host[i].x, host[i].y, host[i].z);
      hostRad[i] = host[i].r;
    }
    this.material.uniforms.uHostCount.value = nh;
    this.material.uniforms.uHostK.value = hostK;
    this.material.uniforms.uThickness.value = thickness;

    const patchPos = this.material.uniforms.uPatchPos.value as THREE.Vector3[];
    const patchData = this.material.uniforms.uPatchData.value as THREE.Vector2[];
    let selectedOwner = -1;
    let n = 0;
    for (let pi = 0; pi < patches.length; pi++) {
      const patch = patches[pi];
      if (patch.id === selectedPatchId) selectedOwner = pi;
      // y encodes owner index AND shape -- coin +0.00, flatRing +0.25,
      // ring3d +0.50, flower motif +0.75 -- see
      // shaders.ts's isCoinPoint/isFlatRingPoint/isRingPoint decode.
      const ownerEncoded = patch.shape === "flower"
        ? pi + 0.75
        : patch.shape === "ring3d"
          ? pi + 0.5
          : patch.shape === "flatRing"
            ? pi + 0.25
            : pi;
      for (const pt of patch.points) {
        if (n >= PATCH_MAX_POINTS) break;
        patchPos[n].set(pt.x, pt.y, pt.z);
        patchData[n].set(pt.r, ownerEncoded);
        n++;
      }
    }
    this.material.uniforms.uPatchPointCount.value = n;
    this.material.uniforms.uRoundK.value = roundK;
    this.material.uniforms.uMode.value = mode === "plate" ? 0 : 1;
    this.material.uniforms.uSelectedPatchOwner.value = selectedOwner;
    this.material.uniforms.uCoinBulge.value = coinBulge;
    this.material.uniforms.uCoinBulgeBalance.value = coinBulgeBalance;
    if (this.printPlateVisible) this.updatePrintPlatePlacement(host, patches);
  }

  setPrintPlateVisible(visible: boolean): void {
    this.printPlateVisible = visible;
    this.printPlateGroup.visible = visible;
    this.requestViewportRender();
  }

  private updatePrintPlatePlacement(host: Ball[], patches: Patch[]): void {
    const points = patches.flatMap((patch) => patch.points);
    const source = points.length > 0
      ? points.map((point) => ({ x: point.x, y: point.y, z: point.z, r: point.r }))
      : host;
    if (source.length === 0) {
      this.printPlateGroup.visible = false;
      return;
    }
    const minX = Math.min(...source.map((point) => point.x - point.r));
    const maxX = Math.max(...source.map((point) => point.x + point.r));
    const minY = Math.min(...source.map((point) => point.y - point.r));
    const maxY = Math.max(...source.map((point) => point.y + point.r));
    const minZ = Math.min(...source.map((point) => point.z - point.r));
    const span = Math.max(maxX - minX, maxY - minY, 0.01);
    const plateSize = Math.max(4, span * 2.25);
    this.printPlateGroup.position.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, minZ - 0.012);
    this.printPlateGroup.scale.set(plateSize, plateSize, 1);
    this.printPlateGroup.visible = this.printPlateVisible;
  }

  render(activeViewportOnly = false): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const allRects = skinViewportRects(
      width, height, this.viewportMode, this.selectedViewport,
      { x: this.fourSplitX, y: this.fourSplitY },
    );
    const rects = activeViewportOnly && this.viewportMode === "four"
      ? allRects.filter((rect) => rect.index === this.selectedViewport)
      : allRects;
    this.applyViewportClippingToScene();
    this.renderer.setScissorTest(true);
    this.renderer.autoClear = false;
    for (const rect of rects) {
      const slot = this.viewportSlots[rect.index];
      slot.controls.update();
      slot.camera.updateMatrixWorld();
      this.material.uniforms.uCamPos.value.copy(slot.camera.position);
      this.material.uniforms.uCamInverseProjection.value.copy(slot.camera.projectionMatrixInverse);
      this.material.uniforms.uCamInverseView.value.copy(slot.camera.matrixWorld);
      this.material.uniforms.uCameraOrthographic.value = 1;
      this.material.uniforms.uResolution.value.set(rect.width, rect.height);
      const glY = height - rect.y - rect.height;
      this.renderer.setViewport(rect.x, glY, rect.width, rect.height);
      this.renderer.setScissor(rect.x, glY, rect.width, rect.height);
      this.renderer.clear(true, true, true);
      const showBrush = rect.index === this.selectedViewport;
      this.overhangSupportSiteGroup?.traverse((object) => {
        const material = (object as THREE.Points).material as THREE.ShaderMaterial | undefined;
        const uniform = material?.uniforms?.uShowBrushEmphasis;
        if (uniform) uniform.value = showBrush ? 1 : 0;
      });
      this.renderer.render(this.scene, slot.camera);
    }
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.autoClear = true;
    if (!activeViewportOnly) {
      this.updateOpeningLabels();
      this.updateElementNames();
    }
  }

  /** Build a world-space ray from the selected viewport's normalized device position. */
  screenToRay(ndcX: number, ndcY: number): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return { origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone() };
  }

  screenToRayFromClient(clientX: number, clientY: number): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const viewportRect = this.viewportRectFromClient(clientX, clientY);
    if (!viewportRect) return this.screenToRay(0, 0);
    this.selectViewport(viewportRect.index);
    const localX = clientX - canvasRect.left - viewportRect.x;
    const localY = clientY - canvasRect.top - viewportRect.y;
    return this.screenToRay(
      localX / Math.max(1, viewportRect.width) * 2 - 1,
      1 - localY / Math.max(1, viewportRect.height) * 2,
    );
  }

  setOrbitEnabled(enabled: boolean): void {
    this.orbitEnabled = enabled;
    if (!enabled && this.axomeLeftRotateCandidate) {
      const pointerId = this.axomeLeftRotateCandidate.pointerId;
      this.axomeLeftRotateCandidate = null;
      if (this.renderer.domElement.hasPointerCapture(pointerId)) this.renderer.domElement.releasePointerCapture(pointerId);
    }
    for (const [index, slot] of this.viewportSlots.entries()) {
      slot.controls.enabled = enabled && index === this.selectedViewport;
    }
  }

  /** Screen-local anchor for a DOM affordance associated with one realized
   * motif. It deliberately uses the same point centroid as element labels,
   * and refuses clipped/behind-camera anchors so callers never leave a
   * viewport control floating after its target has gone out of view. */
  projectPatchAnchor(patch: Patch): { x: number; y: number } | null {
    if (this.denseSampleActive || patch.points.length === 0) return null;
    const inv = 1 / patch.points.length;
    const projected = new THREE.Vector3(
      patch.points.reduce((sum, point) => sum + point.x, 0) * inv,
      patch.points.reduce((sum, point) => sum + point.y, 0) * inv,
      patch.points.reduce((sum, point) => sum + point.z, 0) * inv,
    ).project(this.camera);
    if (
      projected.x < -1 || projected.x > 1 ||
      projected.y < -1 || projected.y > 1 ||
      projected.z < -1 || projected.z > 1
    ) return null;
    return {
      x: (projected.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-projected.y * 0.5 + 0.5) * this.container.clientHeight,
    };
  }

  /** Compact registry navigation: move the existing camera to the selected
   * patch without changing the generated field. */
  focusPatch(patch: Patch): void {
    if (patch.points.length === 0) return;
    const center = patch.points.reduce((sum, point) => sum.add(new THREE.Vector3(point.x, point.y, point.z)), new THREE.Vector3())
      .multiplyScalar(1 / patch.points.length);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center.clone().add(direction.multiplyScalar(3.2)));
    this.controls.update();
  }
}

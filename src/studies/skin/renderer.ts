// ---------------------------------------------------------------------------
// Three.js wiring: a fullscreen raymarch quad + OrbitControls. Structurally
// identical to pack/renderer.ts, but update() pushes host balls + a flat
// patch-point array (with owner indices) + thickness + roundK + mode into
// the shader.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { deriveSkinLayerVisibility, selectedBeadWireScale, type InternalObservationMode } from "./previewMeshBuffers.ts";
import { HOST_MAX_BALLS, PATCH_MAX_POINTS, fragmentShader, vertexShader } from "./shaders.ts";
import type { Ball, Patch, SkinMode } from "./field.ts";
import type { QuadFlowGrid } from "./quadFlow.ts";
import type { OpeningMeasurement } from "./openingMapWorkerProtocol.ts";
import type { DenseFlowerSample } from "./denseFlowerSample.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
import { elementDisplayName, elementLabelDepthOpacity, representativeElements } from "../../lib/elementLabels.ts";
import { layoutOpeningLabelsOutside, type ScreenRect } from "./openingLabelLayout.ts";

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

export class SkinRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private material: THREE.ShaderMaterial;
  private container: HTMLElement;
  private raymarchQuad!: THREE.Mesh;
  private overlayMaterial!: THREE.MeshStandardMaterial;
  private overlayMesh: THREE.Mesh | null = null;
  /** Display-only face-angle diagnosis. Red is still above the selected
   * angle threshold; teal means an internal strut reaches the finite mesh
   * contact band. It never changes the generated field or export mesh. */
  private surfaceAngleGroup: THREE.Group | null = null;
  private surfaceAngleShowInternal = false;
  private motifLowestPointGroup: THREE.Group | null = null;
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
  private internalNodeMesh: THREE.InstancedMesh | null = null;
  private internalEdgeMesh: THREE.InstancedMesh | null = null;

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
      this.activeGroups = null;
      this.activeNGroupByPatch = null;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

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

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(4, 2.5, 5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

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
        uResolution: { value: new THREE.Vector2(1, 1) },
        uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4) },
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

    this.resize();
    window.addEventListener("resize", () => this.resize());
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
    if (this.internalNodeMesh) this.internalNodeMesh.visible = visibility.internalGraph || diagnosticInternal;
    if (this.internalEdgeMesh) this.internalEdgeMesh.visible = visibility.internalGraph || diagnosticInternal;
    if (this.quadFlowGridLines) this.quadFlowGridLines.visible = visibility.surfaceDecorations;
    if (this.surfaceAngleGroup) {
      this.surfaceAngleGroup.visible = visibility.surfaceDecorations && this.viewMode === "mesh";
    }
    if (this.motifLowestPointGroup) {
      this.motifLowestPointGroup.visible = visibility.surfaceDecorations;
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

  /** Build (or replace) the true (uncapped) marching-tets geometry as a lit
   * mesh. Visibility is controlled separately via setViewMode. */
  setMeshOverlay(triangles: { a: {x:number;y:number;z:number}; b: {x:number;y:number;z:number}; c: {x:number;y:number;z:number} }[] | null): void {
    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh);
      this.overlayMesh.geometry.dispose();
      this.overlayMesh = null;
    }
    if (!triangles) return;
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
    this.overlayMesh.renderOrder = this.displayStyle === "ghost" || this.internalObservationMode === "ghostSkin" ? 1 : 0;
    this.overlayMesh.visible = this.viewMode === "mesh";
    this.scene.add(this.overlayMesh);
    this.applyLayerVisibility();
  }

  /** Worker-produced preview mesh. Positions and flat normals arrive ready
   * for the GPU so the main page never loops over the full triangle set or
   * computes normals while the author is trying to orbit the form. */
  setMeshOverlayBuffers(positions: Float32Array, normals: Float32Array): void {
    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh);
      this.overlayMesh.geometry.dispose();
      this.overlayMesh = null;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    this.overlayMesh = new THREE.Mesh(geometry, this.overlayMaterial);
    this.overlayMesh.renderOrder = this.displayStyle === "ghost" || this.internalObservationMode === "ghostSkin" ? 1 : 0;
    this.overlayMesh.visible = this.viewMode === "mesh";
    this.scene.add(this.overlayMesh);
    this.applyLayerVisibility();
  }

  clearSurfaceAngleOverlay(): void {
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
    add(mitigatedPositions, 0x3bb7aa, 0.78);
    group.visible = this.viewMode === "mesh" && this.internalObservationMode !== "internalOnly";
    this.scene.add(group);
    this.surfaceAngleGroup = group;
    this.surfaceAngleShowInternal = showInternal;
    this.applyLayerVisibility();
  }

  /** One display-only final-mesh vertex marker for every attributed motif.
   * Markers ignore scene depth so a low point on the far side remains
   * discoverable; rotating the form is still needed to read its actual
   * spatial relation. */
  setMotifLowestPointMarkers(markers: MotifLowestPoint[] | null): void {
    if (this.motifLowestPointGroup) {
      this.scene.remove(this.motifLowestPointGroup);
      this.motifLowestPointGroup.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      this.motifLowestPointGroup = null;
    }
    if (!markers || markers.length === 0) return;
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
    add(markers.filter((marker) => !marker.reachedByInternal), this.motifLowestUnreachedMaterial);
    add(markers.filter((marker) => marker.reachedByInternal), this.motifLowestReachedMaterial);
    this.scene.add(group);
    this.motifLowestPointGroup = group;
    this.applyLayerVisibility();
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
      let c: THREE.Color = nGroupIndex !== undefined
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
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uResolution.value.set(w, h);
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
  }

  render(): void {
    this.controls.update();
    this.camera.updateMatrixWorld();
    this.material.uniforms.uCamPos.value.copy(this.camera.position);
    this.material.uniforms.uCamInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    this.material.uniforms.uCamInverseView.value.copy(this.camera.matrixWorld);
    this.updateOpeningLabels();
    this.updateElementNames();
    this.renderer.render(this.scene, this.camera);
  }

  /** Build a world-space ray (origin, direction) from a normalized device (-1..1) pointer position. */
  screenToRay(ndcX: number, ndcY: number): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return { origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone() };
  }

  setOrbitEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
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

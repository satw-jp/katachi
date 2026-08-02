// ---------------------------------------------------------------------------
// Three.js wiring: a fullscreen raymarch quad + OrbitControls. Structurally
// identical to pack/renderer.ts, but update() pushes host balls + a flat
// patch-point array (with owner indices) + thickness + roundK + mode into
// the shader.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HOST_MAX_BALLS, PATCH_MAX_POINTS, fragmentShader, vertexShader } from "./shaders.ts";
import type { Ball, Patch, SkinMode } from "./field.ts";

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
const SELECTION_OUTLINE_SCALE = 1.2; // instruction: 1.15-1.25x, 1.06x was rejected as too subtle
const SELECTION_DIM_FACTOR = 0.5; // instruction: 45-60%
const SEED_A_BADGE_COLOR = "#59c8ff";
const SEED_B_BADGE_COLOR = "#ff9b45";

export type SkinViewMode = "raymarch" | "beads" | "mesh";

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
  private viewMode: SkinViewMode = "raymarch";

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
    depthWrite: false,
  });
  private highlightMesh: THREE.InstancedMesh | null = null;

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
    this.raymarchQuad.visible = mode === "raymarch";
    if (this.overlayMesh) this.overlayMesh.visible = mode === "mesh";
    if (this.hostBeadMesh) this.hostBeadMesh.visible = mode === "beads";
    if (this.patchBeadMesh) this.patchBeadMesh.visible = mode === "beads";
    if (this.endpointBadges.A) this.endpointBadges.A.visible = mode === "beads";
    if (this.endpointBadges.B) this.endpointBadges.B.visible = mode === "beads";
    // Re-derive visibility (not just a flat true/false) since the highlight
    // mesh must also stay hidden when nothing is selected or the selection
    // is filtered out, even while beads is the active view.
    this.updateSelectionHighlight();
  }

  getViewMode(): SkinViewMode {
    return this.viewMode;
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
    this.overlayMesh.visible = this.viewMode === "mesh";
    this.scene.add(this.overlayMesh);
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
      if (this.activeGroups) this.setBeadGroupFilter(this.beadGroupFilter);
    } else {
      this.lastSelectedPatchId = selectedPatchId;
      this.updateSelectionHighlight(); // no patches left -- drop any stale outline
    }
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

  /** T14 §2.1: rebuild the small outline InstancedMesh over just the
   * selected patch's own bead instances (oversized wireframe shell), and
   * hide it if nothing is selected or the selected patch's group is
   * currently filtered out of view (setBeadGroupFilter's Aのみ/Bのみ). No
   * full patchBeadMesh rebuild -- matrices are copied from the existing
   * instances, so this stays cheap even at CoinSRF scale. */
  private updateSelectionHighlight(): void {
    const mesh = this.patchBeadMesh;
    const selId = this.lastSelectedPatchId;
    let hiddenByFilter = false;
    if (selId !== null && this.activeGroups && this.beadGroupFilter !== "both") {
      const inA = this.activeGroups.A.has(selId);
      const inB = this.activeGroups.B.has(selId);
      hiddenByFilter = (this.beadGroupFilter === "A" && !inA) || (this.beadGroupFilter === "B" && !inB);
    }
    if (!mesh || selId === null || hiddenByFilter) {
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
      const r = (this.patchBeadOriginalScale[indices[k]] ?? 0) * SELECTION_OUTLINE_SCALE;
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
    this.highlightMesh.visible = this.viewMode === "beads";
  }

  private recolorBeads(): void {
    const mesh = this.patchBeadMesh;
    if (!mesh) return;
    const groups = this.activeGroups;
    const selId = this.lastSelectedPatchId;
    for (let i = 0; i < this.patchBeadOwner.length; i++) {
      const id = this.patchBeadOwner[i];
      // T14: A/B membership color is the base color unconditionally -- it
      // used to be replaced by SELECTED_COLOR (or silently ignored
      // entirely once a T13 grouping was active, the root cause of the
      // "can't tell what's selected" report). Selection is now conveyed by
      // dimming everything ELSE instead, so the selected bead's own A/B/
      // unassigned color is never lost.
      let c: THREE.Color = groups
        ? (groups.A.has(id) ? GROUP_A_COLOR : groups.B.has(id) ? GROUP_B_COLOR : UNASSIGNED_GROUP_COLOR)
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
   * (points[0], the same "stable representative" field.ts's Patch doc
   * already establishes for non-coin shapes). Passing null for a side
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
    sprite.visible = this.viewMode === "beads";
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
      // ring3d +0.50 (T14 extended this from a single ring3d bit) -- see
      // shaders.ts's isCoinPoint/isFlatRingPoint/isRingPoint decode.
      const ownerEncoded = patch.shape === "ring3d" ? pi + 0.5 : patch.shape === "flatRing" ? pi + 0.25 : pi;
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
  }

  render(): void {
    this.controls.update();
    this.camera.updateMatrixWorld();
    this.material.uniforms.uCamPos.value.copy(this.camera.position);
    this.material.uniforms.uCamInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    this.material.uniforms.uCamInverseView.value.copy(this.camera.matrixWorld);
    this.renderer.render(this.scene, this.camera);
  }

  /** Build a world-space ray (origin, direction) from a normalized device (-1..1) pointer position. */
  screenToRay(ndcX: number, ndcY: number): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return { origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone() };
  }
}

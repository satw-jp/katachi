// ---------------------------------------------------------------------------
// Three.js wiring: a fullscreen raymarch quad + OrbitControls. Structurally
// identical to cloud-sculpt/renderer.ts, but update() pushes host + unit
// data (T14: PackUnit[] instead of a flat void Ball[]) plus the roundness
// knob and mode into the shader instead of one list.
//
// T13 v0.2 ports skin/renderer.ts's T12 additions verbatim (bead
// approximation view + full-mesh overlay + three-way viewMode), mirroring
// the SAME reasoning: the raymarch quad's uniform-array budget (VOID_MAX_
// BALLS / T14: VOID_MAX_UNITS) silently under-draws dense packings, and
// skin's fix (an uncapped InstancedMesh bead view + an actual-triangle-soup
// mesh overlay, both escaping the shader entirely) applies here unchanged.
//
// T14: the bead view now draws every BALL of every unit (not one sphere per
// void) — "ビーズ表示の点数が跳ね上がる（単位あたり3〜10球）" per the task
// doc, expected and honest (this IS the shape, drawn without the smooth-min
// blend). Selection highlights ALL balls belonging to the selected unit.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HOST_MAX_BALLS, VOID_MAX_BALLS, VOID_MAX_UNITS, fragmentShader, vertexShader } from "./shaders.ts";
import type { Ball } from "../cloud-sculpt/field.ts";
import type { PackMode, PackUnit } from "./field.ts";

// Selection highlight color, shared verbatim with every other Study's
// shaders.ts (AGENTS §5 "余白の色は全 Study 共通のスケールにする…一度決めた
// ら変えない") — same color skin/renderer.ts's bead view reuses.
const SELECTED_COLOR = new THREE.Color(1.0, 0.75, 0.2);
// T13 §3 "現行モードでは虚を暗色区別、反転モードでは実を本体色で": the void
// beads' base color depends on mode -- carve mode voids are cavities (dark/
// cool, distinguishing them from solid host material), fill mode voids ARE
// the printed material (same body tone as the raymarch's outer-skin color).
const VOID_BEAD_COLOR_CARVE = new THREE.Color(0.3, 0.32, 0.4); // dark/cool -- reads as "cavity", not material
const VOID_BEAD_COLOR_FILL = new THREE.Color(0.86, 0.87, 0.9); // body color -- matches host/outer-skin tone
const HOST_BEAD_COLOR = new THREE.Color(0.86, 0.87, 0.9);

export type PackViewMode = "raymarch" | "beads" | "mesh";

export class PackRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private material: THREE.ShaderMaterial;
  private container: HTMLElement;
  private raymarchQuad!: THREE.Mesh;
  private overlayMaterial!: THREE.MeshStandardMaterial;
  private overlayMesh: THREE.Mesh | null = null;
  private viewMode: PackViewMode = "raymarch";

  // --- Bead approximation view (T13, ported from skin/renderer.ts's T12) ---
  // InstancedMesh spheres for every host ball (translucent backdrop, always
  // drawn regardless of mode — in "fill" mode this IS the "ホストは半透明の
  // 下敷きとして表示" requirement, since the raymarch itself never draws the
  // host in fill mode) and every void BALL (T14: every unit's every ball,
  // full count, no VOID_MAX_BALLS cap). Deliberate approximation, same
  // disclosure as skin's: smooth-min blending (both within-unit and
  // across-unit) is skipped entirely, each ball is its own sphere.
  private readonly beadSphereGeo = new THREE.SphereGeometry(1, 10, 7);
  private readonly hostBeadMaterial = new THREE.MeshStandardMaterial({
    color: HOST_BEAD_COLOR,
    roughness: 0.9,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  private readonly voidBeadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  private hostBeadMesh: THREE.InstancedMesh | null = null;
  private voidBeadMesh: THREE.InstancedMesh | null = null;
  private voidBeadOwnerUnitId: number[] = []; // instance index -> owning unit id, for cheap re-color on selection change
  private lastBeadMode: PackMode = "carve"; // for updateBeadSelection's base color, between full updateBeads() rebuilds

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
        uVoidPos: { value: Array.from({ length: VOID_MAX_BALLS }, () => new THREE.Vector3()) },
        uVoidRadius: { value: new Float32Array(VOID_MAX_BALLS) },
        uVoidCount: { value: 0 },
        uUnitStart: { value: new Int32Array(VOID_MAX_UNITS) },
        uUnitCount: { value: new Int32Array(VOID_MAX_UNITS) },
        uUnitLocalK: { value: new Float32Array(VOID_MAX_UNITS) },
        uUnitTotal: { value: 0 },
        uRoundK: { value: 0.15 },
        uMode: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uCamInverseProjection: { value: new THREE.Matrix4() },
        uCamInverseView: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uSelectedUnitIndex: { value: -1 },
        uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4) },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.raymarchQuad = quad;

    // Full-mesh overlay (T13, ported from skin's T11/T12 identical fix): the
    // raymarch view is capped by the shader's uniform budget (VOID_MAX_BALLS
    // / VOID_MAX_UNITS) and silently under-draws dense packings. This
    // overlay renders the ACTUAL marching-tets mesh (everything the STL will
    // contain).
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
  setViewMode(mode: PackViewMode): void {
    this.viewMode = mode;
    this.raymarchQuad.visible = mode === "raymarch";
    if (this.overlayMesh) this.overlayMesh.visible = mode === "mesh";
    if (this.hostBeadMesh) this.hostBeadMesh.visible = mode === "beads";
    if (this.voidBeadMesh) this.voidBeadMesh.visible = mode === "beads";
  }

  getViewMode(): PackViewMode {
    return this.viewMode;
  }

  /** Build (or replace) the true (uncapped) marching-tets geometry as a lit
   * mesh. Visibility is controlled separately via setViewMode. */
  setMeshOverlay(
    triangles: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; c: { x: number; y: number; z: number } }[] | null,
  ): void {
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
        pos[o] = p.x;
        pos[o + 1] = p.y;
        pos[o + 2] = p.z;
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
   * balls, always translucent backdrop regardless of mode -- T13 §1 "ホスト
   * は半透明の下敷きとして表示" -- + T14: every unit's every ball, no
   * VOID_MAX_BALLS cap). Called on structural changes, not every frame.
   * Visibility is controlled separately via setViewMode. */
  updateBeads(host: Ball[], units: PackUnit[], mode: PackMode, selectedUnitId: number | null): void {
    if (this.hostBeadMesh) {
      this.scene.remove(this.hostBeadMesh);
      this.hostBeadMesh.dispose();
      this.hostBeadMesh = null;
    }
    if (this.voidBeadMesh) {
      this.scene.remove(this.voidBeadMesh);
      this.voidBeadMesh.dispose();
      this.voidBeadMesh = null;
    }
    this.voidBeadOwnerUnitId = [];

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

    const totalBalls = units.reduce((sum, u) => sum + u.balls.length, 0);
    if (totalBalls > 0) {
      const voidMesh = new THREE.InstancedMesh(this.beadSphereGeo, this.voidBeadMaterial, totalBalls);
      const m = new THREE.Matrix4();
      const baseColor = mode === "fill" ? VOID_BEAD_COLOR_FILL : VOID_BEAD_COLOR_CARVE;
      let idx = 0;
      for (const u of units) {
        const isSelected = u.id === selectedUnitId;
        for (const v of u.balls) {
          m.makeScale(v.r, v.r, v.r).setPosition(v.x, v.y, v.z);
          voidMesh.setMatrixAt(idx, m);
          voidMesh.setColorAt(idx, isSelected ? SELECTED_COLOR : baseColor);
          this.voidBeadOwnerUnitId.push(u.id);
          idx++;
        }
      }
      voidMesh.instanceMatrix.needsUpdate = true;
      if (voidMesh.instanceColor) voidMesh.instanceColor.needsUpdate = true;
      voidMesh.visible = this.viewMode === "beads";
      this.scene.add(voidMesh);
      this.voidBeadMesh = voidMesh;
      this.lastBeadMode = mode;
    }
  }

  /** Cheap re-color of the existing void beads for a new selection -- no
   * geometry rebuild (matrices unchanged), just instanceColor. T14: colors
   * every ball belonging to the selected UNIT, not a single ball. */
  updateBeadSelection(selectedUnitId: number | null): void {
    const mesh = this.voidBeadMesh;
    if (!mesh) return;
    const baseColor = this.lastBeadMode === "fill" ? VOID_BEAD_COLOR_FILL : VOID_BEAD_COLOR_CARVE;
    for (let i = 0; i < this.voidBeadOwnerUnitId.length; i++) {
      const c = this.voidBeadOwnerUnitId[i] === selectedUnitId ? SELECTED_COLOR : baseColor;
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uResolution.value.set(w, h);
  }

  update(host: Ball[], hostK: number, units: PackUnit[], roundK: number, mode: PackMode, selectedUnitId: number | null): void {
    const hostPos = this.material.uniforms.uHostPos.value as THREE.Vector3[];
    const hostRad = this.material.uniforms.uHostRadius.value as Float32Array;
    const nh = Math.min(host.length, HOST_MAX_BALLS);
    for (let i = 0; i < nh; i++) {
      hostPos[i].set(host[i].x, host[i].y, host[i].z);
      hostRad[i] = host[i].r;
    }
    this.material.uniforms.uHostCount.value = nh;
    this.material.uniforms.uHostK.value = hostK;

    // T14: flatten units into the shared ball arrays while recording each
    // unit's [start, count) slice + its own local blend k, capped
    // independently by VOID_MAX_BALLS (ball budget) and VOID_MAX_UNITS (unit
    // budget) -- whichever is hit first stops the loop, same documented cap
    // style as HOST_MAX_BALLS.
    const voidPos = this.material.uniforms.uVoidPos.value as THREE.Vector3[];
    const voidRad = this.material.uniforms.uVoidRadius.value as Float32Array;
    const unitStart = this.material.uniforms.uUnitStart.value as Int32Array;
    const unitCount = this.material.uniforms.uUnitCount.value as Int32Array;
    const unitLocalK = this.material.uniforms.uUnitLocalK.value as Float32Array;
    let ballIdx = 0;
    let unitIdx = 0;
    let selectedUnitShaderIndex = -1;
    for (const u of units) {
      if (unitIdx >= VOID_MAX_UNITS || ballIdx >= VOID_MAX_BALLS) break;
      const start = ballIdx;
      let count = 0;
      for (const b of u.balls) {
        if (ballIdx >= VOID_MAX_BALLS) break;
        voidPos[ballIdx].set(b.x, b.y, b.z);
        voidRad[ballIdx] = b.r;
        ballIdx++;
        count++;
      }
      if (count === 0) break; // ran out of ball budget mid-unit; don't record a 0-length unit
      unitStart[unitIdx] = start;
      unitCount[unitIdx] = count;
      unitLocalK[unitIdx] = u.localK;
      if (u.id === selectedUnitId) selectedUnitShaderIndex = unitIdx;
      unitIdx++;
    }
    this.material.uniforms.uVoidCount.value = ballIdx;
    this.material.uniforms.uUnitTotal.value = unitIdx;
    this.material.uniforms.uRoundK.value = roundK;
    this.material.uniforms.uMode.value = mode === "fill" ? 1 : 0;
    this.material.uniforms.uSelectedUnitIndex.value = selectedUnitShaderIndex;
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

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

// Selection highlight color, shared verbatim with every other Study's
// shaders.ts (cloud-sculpt/pack/rings/skin's own raymarch fragment shader
// all use this exact vec3) -- AGENTS §5 "余白の色は全 Study 共通のスケール
// にする...一度決めたら変えない". T12's author-facing wording ("青くなる")
// is read as "gets highlighted", not a request for a literal new blue, so
// the bead view reuses this established color instead of inventing one.
const SELECTED_COLOR = new THREE.Color(1.0, 0.75, 0.2);
const PATCH_BEAD_COLOR = new THREE.Color(0.9, 0.72, 0.5); // matches shaders.ts's onPatch base color
const HOST_BEAD_COLOR = new THREE.Color(0.86, 0.87, 0.9); // matches shaders.ts's non-patch base color

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
          n++;
        }
      }
      patchMesh.instanceMatrix.needsUpdate = true;
      patchMesh.visible = this.viewMode === "beads";
      this.scene.add(patchMesh);
      this.patchBeadMesh = patchMesh;
      this.updateBeadSelection(selectedPatchId);
    }
  }

  /** Cheap re-color of the existing patch beads for a new selection --
   * no geometry rebuild (matrices unchanged), just instanceColor. */
  updateBeadSelection(selectedPatchId: number | null): void {
    const mesh = this.patchBeadMesh;
    if (!mesh) return;
    for (let i = 0; i < this.patchBeadOwner.length; i++) {
      const c = this.patchBeadOwner[i] === selectedPatchId ? SELECTED_COLOR : PATCH_BEAD_COLOR;
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

  update(
    host: Ball[],
    hostK: number,
    thickness: number,
    patches: Patch[],
    roundK: number,
    mode: SkinMode,
    selectedPatchId: number | null,
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
      // y encodes owner index AND shape (ring3d gets a +0.5 fractional
      // offset) -- see shaders.ts's isRingPoint() decode.
      const ownerEncoded = patch.shape === "ring3d" ? pi + 0.5 : pi;
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

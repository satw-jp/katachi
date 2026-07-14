// ---------------------------------------------------------------------------
// Three.js wiring for S2b. Two raymarch quads, two scenes:
//   - main scene: the deformed (sagged) cloud + ground, strain-colored.
//   - ghost scene: the rest-shape cloud, translucent, rendered after the
//     main pass without clearing (autoClear=false) so it overlays as a
//     silhouette (T2b-sag.md §3, toggle-able).
// Picking (picking.ts, shared with S1/S2) is run by main.ts against
// whichever ball list it's given — for S2b that's the DEFORMED balls, per
// spec ("ピッキングはたわんだ表示に対して行い").
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MAX_BALLS, fragmentShader, ghostFragmentShader, vertexShader } from "./shaders.ts";
import type { Ball } from "../cloud-sculpt/field.ts";

export class SagRenderer {
  readonly mainScene = new THREE.Scene();
  readonly ghostScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private mainMaterial: THREE.ShaderMaterial;
  private ghostMaterial: THREE.ShaderMaterial;
  private container: HTMLElement;
  ghostEnabled = true;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(4, 2.8, 5.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.6, 0);
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.mainMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uBallPos: { value: Array.from({ length: MAX_BALLS }, () => new THREE.Vector3()) },
        uBallRadius: { value: new Float32Array(MAX_BALLS) },
        uBallStrain: { value: new Float32Array(MAX_BALLS) },
        uBallCount: { value: 0 },
        uK: { value: 0.6 },
        uCamPos: { value: new THREE.Vector3() },
        uCamInverseProjection: { value: new THREE.Matrix4() },
        uCamInverseView: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uSelectedIndex: { value: -1 },
        uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4) },
      },
    });
    const mainQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mainMaterial);
    mainQuad.frustumCulled = false;
    this.mainScene.add(mainQuad);

    this.ghostMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: ghostFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uBallPos: { value: Array.from({ length: MAX_BALLS }, () => new THREE.Vector3()) },
        uBallRadius: { value: new Float32Array(MAX_BALLS) },
        uBallCount: { value: 0 },
        uK: { value: 0.6 },
        uCamPos: { value: new THREE.Vector3() },
        uCamInverseProjection: { value: new THREE.Matrix4() },
        uCamInverseView: { value: new THREE.Matrix4() },
      },
    });
    const ghostQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ghostMaterial);
    ghostQuad.frustumCulled = false;
    this.ghostScene.add(ghostQuad);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.mainMaterial.uniforms.uResolution.value.set(w, h);
  }

  /** Deformed (sagged) cloud — the main body. `strain` should already have broken balls forced to 1. */
  updateMain(balls: Ball[], k: number, strain: number[], selectedId: number | null): void {
    const posArr = this.mainMaterial.uniforms.uBallPos.value as THREE.Vector3[];
    const radArr = this.mainMaterial.uniforms.uBallRadius.value as Float32Array;
    const strainArr = this.mainMaterial.uniforms.uBallStrain.value as Float32Array;
    const n = Math.min(balls.length, MAX_BALLS);
    for (let i = 0; i < n; i++) {
      posArr[i].set(balls[i].x, balls[i].y, balls[i].z);
      radArr[i] = balls[i].r;
      strainArr[i] = strain[i] ?? 0;
    }
    this.mainMaterial.uniforms.uBallCount.value = n;
    this.mainMaterial.uniforms.uK.value = k;
    this.mainMaterial.uniforms.uSelectedIndex.value =
      selectedId === null ? -1 : balls.findIndex((b) => b.id === selectedId);
  }

  /** Rest (休んでいる) cloud — the ghost overlay. */
  updateGhost(balls: Ball[], k: number): void {
    const posArr = this.ghostMaterial.uniforms.uBallPos.value as THREE.Vector3[];
    const radArr = this.ghostMaterial.uniforms.uBallRadius.value as Float32Array;
    const n = Math.min(balls.length, MAX_BALLS);
    for (let i = 0; i < n; i++) {
      posArr[i].set(balls[i].x, balls[i].y, balls[i].z);
      radArr[i] = balls[i].r;
    }
    this.ghostMaterial.uniforms.uBallCount.value = n;
    this.ghostMaterial.uniforms.uK.value = k;
  }

  render(): void {
    this.controls.update();
    this.camera.updateMatrixWorld();
    const camPos = this.camera.position;
    const invProj = this.camera.projectionMatrixInverse;
    const invView = this.camera.matrixWorld;

    this.mainMaterial.uniforms.uCamPos.value.copy(camPos);
    this.mainMaterial.uniforms.uCamInverseProjection.value.copy(invProj);
    this.mainMaterial.uniforms.uCamInverseView.value.copy(invView);

    this.renderer.autoClear = true;
    this.renderer.render(this.mainScene, this.camera);

    if (this.ghostEnabled) {
      this.ghostMaterial.uniforms.uCamPos.value.copy(camPos);
      this.ghostMaterial.uniforms.uCamInverseProjection.value.copy(invProj);
      this.ghostMaterial.uniforms.uCamInverseView.value.copy(invView);
      this.renderer.autoClear = false;
      this.renderer.render(this.ghostScene, this.camera);
    }
  }

  screenToRay(ndcX: number, ndcY: number): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return { origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone() };
  }
}

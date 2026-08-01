// ---------------------------------------------------------------------------
// Three.js wiring: a fullscreen raymarch quad + OrbitControls for the camera.
// Picking (click-to-add / click-to-select / drag-to-move) is done on the CPU
// against the same field.ts SDF the shader renders, so hand and eye agree.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MAX_BALLS, fragmentShader, vertexShader } from "./shaders.ts";
import type { Ball } from "./field.ts";
import type { CausticField, OpticalSettings } from "./optics.ts";
import type { CloudOpticalSceneAdapter } from "./opticalSceneAdapter.ts";

export interface CameraSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export class CloudRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private container: HTMLElement;
  private causticTexture: THREE.DataTexture;
  private causticTextureHasData = false;
  private suppressCausticForInclusion = false;

  constructor(
    container: HTMLElement,
    options: { compatibilityMode?: boolean } = {},
  ) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const compatibilityMode = options.compatibilityMode === true;
    this.renderer.setPixelRatio(
      compatibilityMode ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(4, 2.5, 5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    this.causticTexture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.causticTexture.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uBallPos: { value: Array.from({ length: MAX_BALLS }, () => new THREE.Vector3()) },
        uBallRadius: { value: new Float32Array(MAX_BALLS) },
        uBallCount: { value: 0 },
        uK: { value: 0.6 },
        uCamPos: { value: new THREE.Vector3() },
        uCamInverseProjection: { value: new THREE.Matrix4() },
        uCamInverseView: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uSelectedIndex: { value: -1 },
        uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4) },
        uRenderMode: { value: 0 },
        uIor: { value: 1.5 },
        uHostAbsorptionRgb: { value: new THREE.Vector3(0.0275, 0.209, 0.506) },
        uOpticalTint: { value: new THREE.Color(0.34, 0.78, 0.92) },
        uInclusionEnabled: { value: 0 },
        uInclusionStatus: { value: 0 },
        uInclusionCenter: { value: new THREE.Vector3() },
        uInclusionRadius: { value: 0.48 },
        uInclusionIor: { value: 1.5 },
        uInclusionAbsorptionRgb: { value: new THREE.Vector3(0.02, 0.02, 0.02) },
        uNaturalView: { value: 1 },
        uSkyIntensity: { value: 0.85 },
        uSunIntensity: { value: 1.25 },
        uSunSize: { value: 0.53 },
        uGroundReflectance: { value: 0.7 },
        uOpticalExposure: { value: 1 },
        uSurfaceRoughness: { value: 0.08 },
        uSurfaceVariation: { value: 0.04 },
        uMaterialVariation: { value: 0.18 },
        uMaterialScale: { value: 1 },
        uEnvironmentContrast: { value: 1 },
        uEnvironmentRotation: { value: 0 },
        uEnvironmentMist: { value: 0.72 },
        uMonochrome: { value: 0 },
        uDispersion: { value: 0.32 },
        uDispersionMode: { value: 1 },
        uRainbowModel: { value: 0 },
        uStressAmount: { value: 0.55 },
        uPolarization: { value: 0.45 },
        uCausticMap: { value: this.causticTexture },
        uCausticBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
        uCausticAvailable: { value: 0 },
        uCausticStrength: { value: 1.2 },
        uCompatibilityMode: { value: compatibilityMode ? 1 : 0 },
      },
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -100;
    this.scene.add(this.quad);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setVisualMode(mode: "katachi" | "flow" | "optics"): void {
    this.quad.visible = mode !== "flow";
    this.material.uniforms.uRenderMode.value = mode === "optics" ? 1 : 0;
    this.renderer.setClearColor(mode === "katachi" ? 0x101114 : 0x071014, 1);
  }

  setOptics(settings: OpticalSettings): void {
    this.material.uniforms.uIor.value = settings.ior;
    this.material.uniforms.uNaturalView.value = settings.opticalView === "natural" ? 1 : 0;
    this.material.uniforms.uSkyIntensity.value = settings.skyIntensity;
    this.material.uniforms.uSunIntensity.value = settings.sunIntensity;
    this.material.uniforms.uSunSize.value = settings.sunSize;
    this.material.uniforms.uGroundReflectance.value = settings.groundReflectance;
    this.material.uniforms.uOpticalExposure.value = settings.opticalExposure;
    this.material.uniforms.uSurfaceRoughness.value = settings.surfaceRoughness;
    this.material.uniforms.uSurfaceVariation.value = settings.surfaceVariation;
    this.material.uniforms.uMaterialVariation.value = settings.materialVariation;
    this.material.uniforms.uMaterialScale.value = settings.materialScale;
    this.material.uniforms.uEnvironmentContrast.value = settings.environmentContrast;
    this.material.uniforms.uEnvironmentRotation.value = THREE.MathUtils.degToRad(
      settings.environmentRotation,
    );
    this.material.uniforms.uEnvironmentMist.value = settings.environmentMist;
    this.material.uniforms.uMonochrome.value =
      settings.opticalColorMode === "mono" ? 1 : 0;
    this.material.uniforms.uDispersion.value = settings.dispersion;
    this.material.uniforms.uDispersionMode.value =
      settings.dispersionMode === "local" ? 1 : 0;
    this.material.uniforms.uRainbowModel.value =
      settings.rainbowModel === "stress"
        ? 1
        : settings.rainbowModel === "both"
          ? 2
          : 0;
    this.material.uniforms.uStressAmount.value = settings.stressAmount;
    this.material.uniforms.uPolarization.value = settings.polarization;
    this.material.uniforms.uCausticStrength.value = settings.causticStrength;
    this.material.uniforms.uOpticalTint.value.set(
      settings.hostPreset === "amber"
        ? 0xf0a85b
        : settings.hostPreset === "dark"
          ? 0x6a3157
          : settings.opticalMaterial === "water"
            ? 0x2396ad
            : 0x5fc8e3,
    );
    const angle = THREE.MathUtils.degToRad(settings.lightAngle);
    this.material.uniforms.uLightDir.value
      .set(-Math.sin(angle) * 0.72, 1, -Math.cos(angle) * 0.28)
      .normalize();
  }

  setOpticalScene(adapter: CloudOpticalSceneAdapter): void {
    const inclusion = adapter.scene.inclusions[0];
    const requested = inclusion !== undefined;
    this.material.uniforms.uHostAbsorptionRgb.value.set(
      adapter.hostAbsorptionPerShapeUnit.r,
      adapter.hostAbsorptionPerShapeUnit.g,
      adapter.hostAbsorptionPerShapeUnit.b,
    );
    this.material.uniforms.uInclusionStatus.value = requested
      ? adapter.inclusionValid ? 1 : 2
      : 0;
    this.material.uniforms.uInclusionEnabled.value = requested && adapter.inclusionValid ? 1 : 0;
    if (inclusion) {
      this.material.uniforms.uInclusionCenter.value.set(
        inclusion.pose.position.x,
        inclusion.pose.position.y,
        inclusion.pose.position.z,
      );
      this.material.uniforms.uInclusionRadius.value = inclusion.pose.uniformScale;
      this.material.uniforms.uInclusionIor.value = inclusion.material.ior;
      this.material.uniforms.uInclusionAbsorptionRgb.value.set(
        adapter.inclusionAbsorptionPerShapeUnit.r,
        adapter.inclusionAbsorptionPerShapeUnit.g,
        adapter.inclusionAbsorptionPerShapeUnit.b,
      );
    }
    // The current CPU/WebGPU caustic layer still traces the host only. Hide it
    // while a valid inclusion is active instead of presenting a mismatched field.
    this.suppressCausticForInclusion = requested && adapter.inclusionValid;
    this.material.uniforms.uCausticAvailable.value =
      this.causticTextureHasData && !this.suppressCausticForInclusion ? 1 : 0;
  }

  setCausticField(field: CausticField): void {
    this.causticTexture.dispose();
    this.causticTexture = new THREE.DataTexture(
      field.data,
      field.width,
      field.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.causticTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.causticTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.causticTexture.minFilter = THREE.LinearFilter;
    this.causticTexture.magFilter = THREE.LinearFilter;
    this.causticTexture.generateMipmaps = false;
    this.causticTexture.needsUpdate = true;
    this.material.uniforms.uCausticMap.value = this.causticTexture;
    this.material.uniforms.uCausticBounds.value.set(
      field.minX,
      field.minZ,
      Math.max(0.001, field.sizeX),
      Math.max(0.001, field.sizeZ),
    );
    this.causticTextureHasData = field.data.some(
      (value, index) => index % 4 !== 3 && value > 0,
    );
    this.material.uniforms.uCausticAvailable.value =
      this.causticTextureHasData && !this.suppressCausticForInclusion ? 1 : 0;
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uResolution.value.set(w, h);
  }

  update(balls: Ball[], k: number, selectedId: number | null): void {
    const posArr = this.material.uniforms.uBallPos.value as THREE.Vector3[];
    const radArr = this.material.uniforms.uBallRadius.value as Float32Array;
    const n = Math.min(balls.length, MAX_BALLS);
    for (let i = 0; i < n; i++) {
      posArr[i].set(balls[i].x, balls[i].y, balls[i].z);
      radArr[i] = balls[i].r;
    }
    this.material.uniforms.uBallCount.value = n;
    this.material.uniforms.uK.value = k;
    this.material.uniforms.uSelectedIndex.value =
      selectedId === null ? -1 : balls.findIndex((b) => b.id === selectedId);
  }

  render(): void {
    this.controls.update();
    this.camera.updateMatrixWorld();
    this.material.uniforms.uCamPos.value.copy(this.camera.position);
    this.material.uniforms.uCamInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    this.material.uniforms.uCamInverseView.value.copy(this.camera.matrixWorld);
    this.renderer.render(this.scene, this.camera);
  }

  captureCamera(): CameraSnapshot {
    this.controls.update();
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      fov: this.camera.fov,
    };
  }

  restoreCamera(snapshot: CameraSnapshot): void {
    this.camera.position.set(...snapshot.position);
    this.controls.target.set(...snapshot.target);
    this.camera.fov = snapshot.fov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Build a world-space ray (origin, direction) from a normalized device (-1..1) pointer position. */
  screenToRay(ndcX: number, ndcY: number): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    // Ensure the camera matrix is current even if no frame has rendered yet
    // (picking must not depend on the render loop having run).
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return { origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone() };
  }
}

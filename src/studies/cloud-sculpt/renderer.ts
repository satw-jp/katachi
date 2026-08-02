// ---------------------------------------------------------------------------
// Three.js wiring: a fullscreen raymarch quad + OrbitControls for the camera.
// Picking (click-to-add / click-to-select / drag-to-move) is done on the CPU
// against the same field.ts SDF the shader renders, so hand and eye agree.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MAX_BALLS, MAX_INCLUSION_BALLS, fragmentShader, vertexShader } from "./shaders.ts";
import type { Ball } from "./field.ts";
import type { CausticField, OpticalSettings } from "./optics.ts";
import type { CloudOpticalSceneAdapter } from "./opticalSceneAdapter.ts";
import { resolveDaylight } from "./daylight.ts";
import {
  advanceProgressiveRender,
  beginProgressiveRender,
  createRealtimeRenderState,
  fitProgressiveRenderSize,
  progressivePixelJitter,
  progressiveSampleWeight,
  stopProgressiveRender,
  type ProgressiveRenderState,
} from "./progressiveRender.ts";
import { ViewObservationPass } from "./viewObservationPass.ts";

const accumulationFragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrevious;
  uniform sampler2D uCurrent;
  uniform float uWeight;
  varying vec2 vUv;
  void main() {
    vec3 previous = texture2D(uPrevious, vUv).rgb;
    vec3 current = texture2D(uCurrent, vUv).rgb;
    gl_FragColor = vec4(mix(previous, current, uWeight), 1.0);
  }
`;

export const presentFragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uImage;
  uniform float uExposure;
  uniform int uMonochrome;
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(uImage, vUv).rgb;
    color = vec3(1.0) - exp(-max(color, vec3(0.0)) * uExposure);
    if (uMonochrome == 1) {
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = vec3(luminance);
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface CameraSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Aspect at capture time; restore keeps the live viewport but exports this framing contract. */
  aspect?: number;
}

export interface ViewportPng {
  blob: Blob;
  width: number;
  height: number;
  source: "realtime" | "progressive";
  samples: number;
}

export type BackgroundMediaMode = "backdrop" | "environment";
export interface BackgroundMediaInfo {
  kind: "image" | "video";
  name: string;
  width: number;
  height: number;
}

export class CloudRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private material: THREE.ShaderMaterial;
  /** Optional R1c diagnostic pass; absent means zero observation allocation. */
  readonly viewObservationPass: ViewObservationPass | null;
  private quad: THREE.Mesh;
  private progressiveScene = new THREE.Scene();
  private progressiveQuad: THREE.Mesh;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postQuad: THREE.Mesh;
  private accumulationMaterial: THREE.ShaderMaterial;
  private presentMaterial: THREE.ShaderMaterial;
  private sampleTarget: THREE.WebGLRenderTarget;
  private accumulationTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private accumulationReadIndex = 0;
  private progressiveState: ProgressiveRenderState = createRealtimeRenderState();
  private progressiveSupported = false;
  private drawingBufferSize = new THREE.Vector2(1, 1);
  private progressiveTargetSize = new THREE.Vector2(1, 1);
  private container: HTMLElement;
  private causticTexture: THREE.DataTexture;
  private receiverLossTexture: THREE.DataTexture;
  private backgroundMediaTexture: THREE.Texture;
  private backgroundMediaUrl: string | null = null;
  private backgroundMediaVideo: HTMLVideoElement | null = null;
  private causticTextureHasData = false;
  private causticTransportPending = false;
  private suppressCausticForInclusion = false;
  private inclusionActive = false;
  private inclusionCausticTrustworthy = false;
  private basePixelRatio = 1;
  private realtimeMotionMode = false;
  private viewCameraSignature = "";

  private markViewObservationDirty(): void {
    this.viewObservationPass?.markDirty();
  }

  get viewObservation(): ViewObservationPass | null {
    return this.viewObservationPass;
  }

  getViewObservationStatus() {
    return this.viewObservationPass?.getStatus() ?? null;
  }

  getViewObservationTextures() {
    return this.viewObservationPass?.getTextures() ?? [];
  }

  constructor(
    container: HTMLElement,
    options: {
      compatibilityMode?: boolean;
      /** Internal R1c seam; main.ts intentionally does not wire a query flag yet. */
      viewObservation?: boolean;
    } = {},
  ) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const compatibilityMode = options.compatibilityMode === true;
    this.basePixelRatio = compatibilityMode ? 1 : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.basePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(4, 2.5, 5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    this.causticTexture = new THREE.DataTexture(
      new Float32Array([0, 0, 0, 0]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.causticTexture.minFilter = THREE.NearestFilter;
    this.causticTexture.magFilter = THREE.NearestFilter;
    this.causticTexture.needsUpdate = true;
    this.receiverLossTexture = new THREE.DataTexture(
      new Float32Array([0, 0, 0, 0]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.receiverLossTexture.minFilter = THREE.NearestFilter;
    this.receiverLossTexture.magFilter = THREE.NearestFilter;
    this.receiverLossTexture.needsUpdate = true;
    this.backgroundMediaTexture = new THREE.DataTexture(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.backgroundMediaTexture.needsUpdate = true;

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
        uPixelJitter: { value: new THREE.Vector2(0, 0) },
        uProgressiveLinearOutput: { value: 0 },
        uProgressiveSampleIndex: { value: 0 },
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
        uInclusionBallPos: {
          value: Array.from({ length: MAX_INCLUSION_BALLS }, () => new THREE.Vector3()),
        },
        uInclusionBallRadius: { value: new Float32Array(MAX_INCLUSION_BALLS) },
        uInclusionBallCount: { value: 0 },
        uNaturalView: { value: 1 },
        uSkyIntensity: { value: 0.85 },
        uSunIntensity: { value: 1.25 },
        uSunSize: { value: 0.53 },
        uBacklightEnabled: { value: 0 },
        uBacklightIntensity: { value: 3 },
        uBacklightWidth: { value: 3 },
        uBacklightHeight: { value: 3 },
        uBacklightDistance: { value: 5 },
        uShapeCenter: { value: new THREE.Vector3() },
        uGroundReflectance: { value: 0.7 },
        uOpticalExposure: { value: 1 },
        uSurfaceRoughness: { value: 0.08 },
        uSurfaceVariation: { value: 0.04 },
        uMaterialVariation: { value: 0.18 },
        uMaterialScale: { value: 1 },
        uEnvironmentContrast: { value: 1 },
        uEnvironmentRotation: { value: 0 },
        uEnvironmentMist: { value: 0.72 },
        uBackgroundMedia: { value: this.backgroundMediaTexture },
        uBackgroundMediaEnabled: { value: 0 },
        uBackgroundMediaEnvironment: { value: 0 },
        uBackgroundMediaAspect: { value: 1 },
        uMonochrome: { value: 0 },
        uDispersion: { value: 0.32 },
        uDispersionMode: { value: 1 },
        uRainbowModel: { value: 0 },
        uStressAmount: { value: 0.55 },
        uPolarization: { value: 0.45 },
        uCausticMap: { value: this.causticTexture },
        uReceiverLossMap: { value: this.receiverLossTexture },
        uCausticBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
        uCausticResolution: { value: new THREE.Vector2(1, 1) },
        uCausticAvailable: { value: 0 },
        uCausticStrength: { value: 1.2 },
        uReceiverDisplayMode: { value: 0 },
        uReceiverY: { value: -2.35 },
        uCompatibilityMode: { value: compatibilityMode ? 1 : 0 },
      },
    });

    const viewObservationEnabled = options.viewObservation === true;
    this.viewObservationPass = viewObservationEnabled
      ? new ViewObservationPass(this.renderer, this.material.uniforms, {
          enabled: true,
          initialWidth: 1,
          initialHeight: 1,
        })
      : null;

    const fullscreenGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(fullscreenGeometry, this.material);
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -100;
    this.scene.add(this.quad);

    this.progressiveQuad = new THREE.Mesh(fullscreenGeometry, this.material);
    this.progressiveQuad.frustumCulled = false;
    this.progressiveScene.add(this.progressiveQuad);

    this.accumulationMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: accumulationFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrevious: { value: null },
        uCurrent: { value: null },
        uWeight: { value: 1 },
      },
    });
    this.presentMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: presentFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uImage: { value: null },
        uExposure: { value: 1 },
        uMonochrome: { value: 0 },
      },
    });
    this.postQuad = new THREE.Mesh(fullscreenGeometry, this.presentMaterial);
    this.postQuad.frustumCulled = false;
    this.postScene.add(this.postQuad);

    this.progressiveSupported = this.renderer.capabilities.isWebGL2
      && this.renderer.extensions.has("EXT_color_buffer_float");
    const targetOptions: THREE.RenderTargetOptions = {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.sampleTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions);
    this.accumulationTargets = [
      new THREE.WebGLRenderTarget(1, 1, targetOptions),
      new THREE.WebGLRenderTarget(1, 1, targetOptions),
    ];

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setVisualMode(mode: "katachi" | "flow" | "optics"): void {
    this.quad.visible = mode !== "flow";
    this.material.uniforms.uRenderMode.value = mode === "optics" ? 1 : 0;
    this.renderer.setClearColor(mode === "katachi" ? 0x101114 : 0x071014, 1);
    this.markViewObservationDirty();
  }

  async setBackgroundMedia(file: File): Promise<BackgroundMediaInfo> {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) throw new Error("画像または動画を選んでください");
    this.material.uniforms.uBackgroundMediaEnabled.value = 0;
    this.releaseBackgroundMedia();
    const url = URL.createObjectURL(file);
    this.backgroundMediaUrl = url;
    let texture: THREE.Texture;
    let width = 1;
    let height = 1;
    if (isVideo) {
      const video = document.createElement("video");
      video.src = url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("動画を読み込めませんでした"));
      });
      width = video.videoWidth;
      height = video.videoHeight;
      await video.play();
      this.backgroundMediaVideo = video;
      texture = new THREE.VideoTexture(video);
    } else {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("画像を読み込めませんでした"));
      });
      width = image.naturalWidth;
      height = image.naturalHeight;
      texture = new THREE.Texture(image);
      texture.needsUpdate = true;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.backgroundMediaTexture.dispose();
    this.backgroundMediaTexture = texture;
    this.material.uniforms.uBackgroundMedia.value = texture;
    this.material.uniforms.uBackgroundMediaAspect.value = width / Math.max(1, height);
    this.material.uniforms.uBackgroundMediaEnabled.value = 1;
    this.markViewObservationDirty();
    this.invalidateProgressiveRender("背景メディアが変わったためリアルタイムへ戻りました");
    return { kind: isVideo ? "video" : "image", name: file.name, width, height };
  }

  setBackgroundMediaMode(mode: BackgroundMediaMode): void {
    this.material.uniforms.uBackgroundMediaEnvironment.value = mode === "environment" ? 1 : 0;
    this.invalidateProgressiveRender("背景の映り込みが変わったためリアルタイムへ戻りました");
    this.markViewObservationDirty();
  }

  clearBackgroundMedia(): void {
    this.releaseBackgroundMedia();
    this.material.uniforms.uBackgroundMediaEnabled.value = 0;
    this.invalidateProgressiveRender("背景メディアを外したためリアルタイムへ戻りました");
    this.markViewObservationDirty();
  }

  hasMovingBackgroundMedia(): boolean {
    return this.backgroundMediaVideo !== null;
  }

  private releaseBackgroundMedia(): void {
    this.backgroundMediaVideo?.pause();
    this.backgroundMediaVideo = null;
    this.backgroundMediaTexture.dispose();
    if (this.backgroundMediaUrl) URL.revokeObjectURL(this.backgroundMediaUrl);
    this.backgroundMediaUrl = null;
    this.backgroundMediaTexture = new THREE.DataTexture(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.backgroundMediaTexture.needsUpdate = true;
    this.material.uniforms.uBackgroundMedia.value = this.backgroundMediaTexture;
  }

  setOptics(settings: OpticalSettings): void {
    const daylight = resolveDaylight(settings);
    this.material.uniforms.uIor.value = settings.ior;
    this.material.uniforms.uNaturalView.value = settings.opticalView === "natural" ? 1 : 0;
    this.material.uniforms.uSkyIntensity.value = settings.skyIntensity;
    this.material.uniforms.uSunIntensity.value = daylight.aboveHorizon ? settings.sunIntensity : 0;
    this.material.uniforms.uSunSize.value = settings.sunSize;
    this.material.uniforms.uBacklightEnabled.value = settings.backlightEnabled ? 1 : 0;
    this.material.uniforms.uBacklightIntensity.value = settings.backlightIntensity;
    this.material.uniforms.uBacklightWidth.value = settings.backlightWidth;
    this.material.uniforms.uBacklightHeight.value = settings.backlightHeight;
    this.material.uniforms.uBacklightDistance.value = settings.backlightDistance;
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
    this.presentMaterial.uniforms.uExposure.value = settings.opticalExposure;
    this.presentMaterial.uniforms.uMonochrome.value =
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
    this.material.uniforms.uReceiverDisplayMode.value =
      settings.receiverDisplayMode === "stroke"
        ? 1
        : settings.receiverDisplayMode === "coverage"
          ? 2
          : settings.receiverDisplayMode === "deposit"
            ? 3
            : settings.receiverDisplayMode === "loss"
              ? 4
              : 0;
    // Appearance-only edge/haze tint. OpticalScene RGB absorption remains the
    // authority for body thickness, shadow, receiver transport, and Blender.
    this.material.uniforms.uOpticalTint.value.set(
      settings.hostPreset === "custom"
        ? settings.hostTransmissionColor
        : settings.hostPreset === "amber"
          ? 0xf0a85b
          : settings.hostPreset === "dark"
            ? 0x6a3157
            : settings.opticalMaterial === "water"
              ? 0x2396ad
              : 0x5fc8e3,
    );
    this.material.uniforms.uLightDir.value
      .set(daylight.directionToSun.x, daylight.directionToSun.y, daylight.directionToSun.z)
      .normalize();
    this.markViewObservationDirty();
  }

  setOpticalScene(adapter: CloudOpticalSceneAdapter): void {
    const inclusion = adapter.scene.inclusions[0];
    const requested = inclusion !== undefined;
    this.material.uniforms.uReceiverY.value = adapter.scene.receiver.pose.position.y;
    this.material.uniforms.uHostAbsorptionRgb.value.set(
      adapter.hostAbsorptionPerShapeUnit.r,
      adapter.hostAbsorptionPerShapeUnit.g,
      adapter.hostAbsorptionPerShapeUnit.b,
    );
    this.material.uniforms.uInclusionStatus.value = requested
      ? adapter.inclusionValid ? 1 : 2
      : 0;
    this.material.uniforms.uInclusionEnabled.value = requested && adapter.inclusionValid ? 1 : 0;
    const packedPositions = this.material.uniforms.uInclusionBallPos.value as THREE.Vector3[];
    const packedRadii = this.material.uniforms.uInclusionBallRadius.value as Float32Array;
    let packedBallCount = 0;
    for (const medium of adapter.scene.inclusions) {
      const rotation = new THREE.Quaternion(
        medium.pose.rotation.x,
        medium.pose.rotation.y,
        medium.pose.rotation.z,
        medium.pose.rotation.w,
      ).normalize();
      for (const ball of medium.shape.balls) {
        if (packedBallCount >= MAX_INCLUSION_BALLS) break;
        packedPositions[packedBallCount]
          .set(ball.center.x, ball.center.y, ball.center.z)
          .multiplyScalar(medium.pose.uniformScale)
          .applyQuaternion(rotation)
          .add(new THREE.Vector3(
            medium.pose.position.x,
            medium.pose.position.y,
            medium.pose.position.z,
          ));
        packedRadii[packedBallCount] = ball.radius * medium.pose.uniformScale;
        packedBallCount++;
      }
    }
    this.material.uniforms.uInclusionBallCount.value = adapter.inclusionValid
      ? packedBallCount
      : 0;
    if (inclusion) {
      const firstBall = inclusion.shape.balls[0];
      const firstCenter = firstBall
        ? new THREE.Vector3(firstBall.center.x, firstBall.center.y, firstBall.center.z)
            .multiplyScalar(inclusion.pose.uniformScale)
            .applyQuaternion(new THREE.Quaternion(
              inclusion.pose.rotation.x,
              inclusion.pose.rotation.y,
              inclusion.pose.rotation.z,
              inclusion.pose.rotation.w,
            ).normalize())
            .add(new THREE.Vector3(
              inclusion.pose.position.x,
              inclusion.pose.position.y,
              inclusion.pose.position.z,
            ))
        : new THREE.Vector3(
            inclusion.pose.position.x,
            inclusion.pose.position.y,
            inclusion.pose.position.z,
          );
      this.material.uniforms.uInclusionCenter.value.set(
        firstCenter.x,
        firstCenter.y,
        firstCenter.z,
      );
      this.material.uniforms.uInclusionRadius.value = firstBall
        ? firstBall.radius * inclusion.pose.uniformScale
        : inclusion.pose.uniformScale;
      this.material.uniforms.uInclusionIor.value = inclusion.material.ior;
      this.material.uniforms.uInclusionAbsorptionRgb.value.set(
        adapter.inclusionAbsorptionPerShapeUnit.r,
        adapter.inclusionAbsorptionPerShapeUnit.g,
        adapter.inclusionAbsorptionPerShapeUnit.b,
      );
    }
    // The CPU layer can trace the first inclusion; WebGPU cannot yet. The
    // compute-status handoff decides whether the current texture is trustworthy.
    this.inclusionActive = requested && adapter.inclusionValid;
    this.applyCausticAvailability();
    this.markViewObservationDirty();
  }

  setInclusionCausticTrustworthy(trustworthy: boolean): void {
    const changed = this.inclusionCausticTrustworthy !== trustworthy;
    this.inclusionCausticTrustworthy = trustworthy;
    this.applyCausticAvailability();
    if (changed && this.inclusionActive) {
      this.invalidateProgressiveRender(
        "内包の受光状態が変わったためリアルタイムへ戻りました",
      );
    }
    this.markViewObservationDirty();
  }

  setCausticTransportPending(pending: boolean): void {
    this.causticTransportPending = pending;
    this.applyCausticAvailability();
  }

  setCausticField(field: CausticField): void {
    const textureData = new Float32Array(field.width * field.height * 4);
    const lossTextureData = new Float32Array(field.width * field.height * 4);
    const inverseTexelArea = 1 / Math.max(1e-9, field.texelArea);
    for (let index = 0; index < field.width * field.height; index++) {
      const sourceOffset = index * 3;
      const targetOffset = index * 4;
      textureData[targetOffset] = field.depositedFluxRgb[sourceOffset] * inverseTexelArea;
      textureData[targetOffset + 1] = field.depositedFluxRgb[sourceOffset + 1] * inverseTexelArea;
      textureData[targetOffset + 2] = field.depositedFluxRgb[sourceOffset + 2] * inverseTexelArea;
      textureData[targetOffset + 3] = field.geometricCoverage[index] * inverseTexelArea;
      lossTextureData[targetOffset] = field.lossFluxRgb[sourceOffset] * inverseTexelArea;
      lossTextureData[targetOffset + 1] = field.lossFluxRgb[sourceOffset + 1] * inverseTexelArea;
      lossTextureData[targetOffset + 2] = field.lossFluxRgb[sourceOffset + 2] * inverseTexelArea;
      lossTextureData[targetOffset + 3] = 1;
    }
    this.causticTexture.dispose();
    this.causticTexture = new THREE.DataTexture(
      textureData,
      field.width,
      field.height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.causticTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.causticTexture.wrapT = THREE.ClampToEdgeWrapping;
    // Float linear filtering is extension-dependent. The shader performs the
    // same four-tap interpolation explicitly so the Windows-safe path stays
    // on a sampling capability available in WebGL2.
    this.causticTexture.minFilter = THREE.NearestFilter;
    this.causticTexture.magFilter = THREE.NearestFilter;
    this.causticTexture.generateMipmaps = false;
    this.causticTexture.needsUpdate = true;
    this.receiverLossTexture.dispose();
    this.receiverLossTexture = new THREE.DataTexture(
      lossTextureData,
      field.width,
      field.height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.receiverLossTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.receiverLossTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.receiverLossTexture.minFilter = THREE.NearestFilter;
    this.receiverLossTexture.magFilter = THREE.NearestFilter;
    this.receiverLossTexture.generateMipmaps = false;
    this.receiverLossTexture.needsUpdate = true;
    this.material.uniforms.uCausticMap.value = this.causticTexture;
    this.material.uniforms.uReceiverLossMap.value = this.receiverLossTexture;
    this.material.uniforms.uCausticBounds.value.set(
      field.minU,
      field.minV,
      Math.max(0.001, field.sizeU),
      Math.max(0.001, field.sizeV),
    );
    this.material.uniforms.uCausticResolution.value.set(field.width, field.height);
    this.causticTextureHasData =
      field.geometricCoverage.some((value) => value > 0)
      || field.depositedFluxRgb.some((value) => value > 0);
    this.applyCausticAvailability();
  }

  private applyCausticAvailability(): void {
    this.suppressCausticForInclusion =
      this.inclusionActive && !this.inclusionCausticTrustworthy;
    this.material.uniforms.uCausticAvailable.value =
      this.causticTextureHasData
      && !this.suppressCausticForInclusion
      && !this.causticTransportPending
        ? 1
        : 0;
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.material.uniforms.uResolution.value.copy(this.drawingBufferSize);
    this.viewObservationPass?.resize(this.drawingBufferSize.x, this.drawingBufferSize.y);
    const progressiveSize = fitProgressiveRenderSize(
      this.drawingBufferSize.x,
      this.drawingBufferSize.y,
    );
    this.progressiveTargetSize.set(progressiveSize.width, progressiveSize.height);
    this.sampleTarget.setSize(progressiveSize.width, progressiveSize.height);
    this.accumulationTargets[0].setSize(progressiveSize.width, progressiveSize.height);
    this.accumulationTargets[1].setSize(progressiveSize.width, progressiveSize.height);
    this.progressiveSupported = this.progressiveSupported
      && this.validateProgressiveFramebuffer();
    this.invalidateProgressiveRender("画面サイズが変わったためリアルタイムへ戻りました");
  }

  setRealtimeMotionMode(active: boolean): void {
    if (this.realtimeMotionMode === active) return;
    this.realtimeMotionMode = active;
    const nextPixelRatio = active ? Math.min(this.basePixelRatio, 1) : this.basePixelRatio;
    if (Math.abs(this.renderer.getPixelRatio() - nextPixelRatio) < 1e-6) return;
    this.renderer.setPixelRatio(nextPixelRatio);
    this.resize();
  }

  getRealtimePixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  update(balls: Ball[], k: number, selectedId: number | null): void {
    const posArr = this.material.uniforms.uBallPos.value as THREE.Vector3[];
    const radArr = this.material.uniforms.uBallRadius.value as Float32Array;
    const n = Math.min(balls.length, MAX_BALLS);
    for (let i = 0; i < n; i++) {
      posArr[i].set(balls[i].x, balls[i].y, balls[i].z);
      radArr[i] = balls[i].r;
    }
    const shapeCenter = this.material.uniforms.uShapeCenter.value as THREE.Vector3;
    if (n === 0) {
      shapeCenter.set(0, 0, 0);
    } else {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (let i = 0; i < n; i++) {
        const ball = balls[i];
        min.min(new THREE.Vector3(ball.x - ball.r, ball.y - ball.r, ball.z - ball.r));
        max.max(new THREE.Vector3(ball.x + ball.r, ball.y + ball.r, ball.z + ball.r));
      }
      shapeCenter.addVectors(min, max).multiplyScalar(0.5);
    }
    this.material.uniforms.uBallCount.value = n;
    this.material.uniforms.uK.value = k;
    this.material.uniforms.uSelectedIndex.value =
      selectedId === null ? -1 : balls.findIndex((b) => b.id === selectedId);
    this.markViewObservationDirty();
  }

  isProgressiveRenderSupported(): boolean {
    return this.progressiveSupported;
  }

  getProgressiveRenderState(): ProgressiveRenderState {
    return { ...this.progressiveState };
  }

  getProgressiveRenderResolution(): { width: number; height: number } {
    return {
      width: this.progressiveTargetSize.x,
      height: this.progressiveTargetSize.y,
    };
  }

  startProgressiveRender(targetSamples: number, now = performance.now()): ProgressiveRenderState {
    if (!this.progressiveSupported) {
      this.progressiveState = createRealtimeRenderState(
        "この端末ではHDR蓄積レンダーを利用できません",
      );
      return this.getProgressiveRenderState();
    }
    this.controls.update();
    this.syncCameraUniforms();
    this.clearProgressiveTargets();
    this.accumulationReadIndex = 0;
    this.progressiveState = beginProgressiveRender(targetSamples, now);
    return this.getProgressiveRenderState();
  }

  stopProgressiveRender(now = performance.now()): ProgressiveRenderState {
    this.progressiveState = stopProgressiveRender(this.progressiveState, now);
    this.material.uniforms.uPixelJitter.value.set(0, 0);
    this.material.uniforms.uProgressiveLinearOutput.value = 0;
    return this.getProgressiveRenderState();
  }

  invalidateProgressiveRender(message = "リアルタイム表示"): ProgressiveRenderState {
    const hadProgressiveImage = this.progressiveState.completedSamples > 0;
    this.progressiveState = createRealtimeRenderState(
      hadProgressiveImage ? message : "リアルタイム表示",
    );
    this.material.uniforms.uPixelJitter.value.set(0, 0);
    this.material.uniforms.uProgressiveLinearOutput.value = 0;
    return this.getProgressiveRenderState();
  }

  render(now = performance.now()): void {
    this.controls.update();
    this.syncCameraUniforms();
    this.renderViewObservation(now);
    if (this.progressiveState.kind === "rendering") {
      this.renderProgressiveSample(now);
      return;
    }
    if (this.progressiveState.kind === "complete" && this.progressiveState.completedSamples > 0) {
      this.presentProgressiveImage();
      return;
    }
    this.material.uniforms.uPixelJitter.value.set(0, 0);
    this.material.uniforms.uProgressiveLinearOutput.value = 0;
    this.material.uniforms.uResolution.value.copy(this.drawingBufferSize);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  private renderViewObservation(now: number): void {
    const pass = this.viewObservationPass;
    if (!pass) return;
    const position = this.camera.position;
    const quaternion = this.camera.quaternion;
    const signature = [
      position.x,
      position.y,
      position.z,
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
      this.camera.fov,
      this.camera.aspect,
    ].join(",");
    const cameraChanged = signature !== this.viewCameraSignature;
    if (cameraChanged) {
      this.viewCameraSignature = signature;
      pass.markDirty();
    }
    // OrbitControls damping can keep changing the camera for several frames
    // after input ends. Treat that ordinary camera motion as dynamic so the
    // diagnostic pass observes the same 10 Hz cap as realtime/video motion.
    // On the first unchanged frame we return to static mode; the dirty result
    // queued during motion is then rendered promptly as the final settled view.
    pass.setDynamic(
      cameraChanged
      || this.realtimeMotionMode
      || this.backgroundMediaVideo !== null,
    );
    try {
      pass.render(this.camera, now);
    } catch {
      // Observation is diagnostic-only: a driver/FBO failure must never block
      // the existing Natural Beauty path that follows this call.
    }
  }

  private syncCameraUniforms(): void {
    this.camera.updateMatrixWorld();
    this.material.uniforms.uCamPos.value.copy(this.camera.position);
    this.material.uniforms.uCamInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    this.material.uniforms.uCamInverseView.value.copy(this.camera.matrixWorld);
  }

  private renderProgressiveSample(now: number): void {
    const completedBefore = this.progressiveState.completedSamples;
    const [jitterX, jitterY] = progressivePixelJitter(completedBefore);
    this.material.uniforms.uPixelJitter.value.set(jitterX, jitterY);
    this.material.uniforms.uProgressiveLinearOutput.value = 1;
    this.material.uniforms.uProgressiveSampleIndex.value = completedBefore;
    this.material.uniforms.uResolution.value.copy(this.progressiveTargetSize);

    this.renderer.setRenderTarget(this.sampleTarget);
    this.renderer.clear();
    this.renderer.render(this.progressiveScene, this.camera);

    const writeIndex = 1 - this.accumulationReadIndex;
    this.postQuad.material = this.accumulationMaterial;
    this.accumulationMaterial.uniforms.uPrevious.value =
      this.accumulationTargets[this.accumulationReadIndex].texture;
    this.accumulationMaterial.uniforms.uCurrent.value = this.sampleTarget.texture;
    this.accumulationMaterial.uniforms.uWeight.value =
      progressiveSampleWeight(completedBefore);
    this.renderer.setRenderTarget(this.accumulationTargets[writeIndex]);
    this.renderer.clear();
    this.renderer.render(this.postScene, this.postCamera);
    this.accumulationReadIndex = writeIndex;
    this.progressiveState = advanceProgressiveRender(this.progressiveState, now);

    this.material.uniforms.uPixelJitter.value.set(0, 0);
    this.material.uniforms.uProgressiveLinearOutput.value = 0;
    this.presentProgressiveImage();
  }

  private presentProgressiveImage(): void {
    this.postQuad.material = this.presentMaterial;
    this.presentMaterial.uniforms.uImage.value =
      this.accumulationTargets[this.accumulationReadIndex].texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
    // Natural-view ray guides remain a crisp, non-accumulated overlay.
    const quadWasVisible = this.quad.visible;
    const autoClear = this.renderer.autoClear;
    this.quad.visible = false;
    this.renderer.autoClear = false;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = autoClear;
    this.quad.visible = quadWasVisible;
  }

  private clearProgressiveTargets(): void {
    const previousTarget = this.renderer.getRenderTarget();
    const previousColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 1);
    for (const target of [this.sampleTarget, ...this.accumulationTargets]) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setClearColor(previousColor, previousAlpha);
    this.renderer.setRenderTarget(previousTarget);
  }

  private validateProgressiveFramebuffer(): boolean {
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.sampleTarget);
    const gl = this.renderer.getContext();
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    this.renderer.setRenderTarget(previousTarget);
    return complete;
  }

  captureCamera(): CameraSnapshot {
    this.controls.update();
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      fov: this.camera.fov,
      aspect: this.camera.aspect,
    };
  }

  /** Capture only the rendered study viewport at its current device-pixel resolution. */
  capturePng(): Promise<ViewportPng> {
    const progressiveSamples = this.progressiveState.completedSamples;
    if (progressiveSamples > 0) {
      this.presentProgressiveImage();
    } else {
      this.controls.update();
      this.syncCameraUniforms();
      this.material.uniforms.uPixelJitter.value.set(0, 0);
      this.material.uniforms.uProgressiveLinearOutput.value = 0;
      this.material.uniforms.uResolution.value.copy(this.drawingBufferSize);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
    const canvas = this.renderer.domElement;
    const width = canvas.width;
    const height = canvas.height;
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG画像を生成できませんでした"));
          return;
        }
        resolve({
          blob,
          width,
          height,
          source: progressiveSamples > 0 ? "progressive" : "realtime",
          samples: progressiveSamples,
        });
      }, "image/png");
    });
  }

  restoreCamera(snapshot: CameraSnapshot): void {
    this.camera.position.set(...snapshot.position);
    this.controls.target.set(...snapshot.target);
    this.camera.fov = snapshot.fov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  dispose(): void {
    this.viewObservationPass?.dispose();
    this.sampleTarget.dispose();
    this.accumulationTargets[0].dispose();
    this.accumulationTargets[1].dispose();
    this.material.dispose();
    this.accumulationMaterial.dispose();
    this.presentMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
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

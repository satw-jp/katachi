// ---------------------------------------------------------------------------
// Three.js wiring: a fullscreen raymarch quad + OrbitControls for the camera.
// Picking (click-to-add / click-to-select / drag-to-move) is done on the CPU
// against the same field.ts SDF the shader renders, so hand and eye agree.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MAX_BALLS, MAX_INCLUSION_BALLS, fragmentShader, vertexShader } from "./shaders.ts";
import {
  normalizeOpticalDissolveSettings,
  opticalImprintViewRelation,
  type OpticalDissolvePresetId,
  type OpticalDissolveSettings,
  type OpticalImprintTextureData,
} from "./opticalImprint.ts";
import {
  DEFAULT_OPTICAL_FORM_MOTION,
  normalizeOpticalFormMotion,
  type OpticalFormMotionMode,
  type OpticalFormMotionSettings,
} from "./formObservation/opticalMotion.ts";
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

const opticalFormPointVertexShader = /* glsl */ `
  attribute float aPhase;
  attribute float aShapeReach;
  uniform sampler2D uStructure;
  uniform sampler2D uLight;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uPointMotion;
  uniform float uOpticalMapping;
  uniform vec3 uShapeCenter;
  uniform float uPointSize;
  uniform int uMotionMode;
  uniform int uHasOptics;
  varying vec3 vPointColor;
  varying float vPointOpacity;

  vec3 opticalRainbow(float hue) {
    return pow(0.5 + 0.5 * cos(6.2831853 * (hue + vec3(0.0, 0.667, 0.333))), vec3(1.35));
  }

  void opticalSignals(vec2 uv, out vec2 direction, out float shadow,
    out float caustic, out float redistribution, out vec3 delivered) {
    vec4 structure = texture2D(uStructure, clamp(uv, 0.0, 1.0));
    vec4 light = texture2D(uLight, clamp(uv, 0.0, 1.0));
    direction = structure.rg * 2.0 - 1.0;
    if (dot(direction, direction) < 0.0001) {
      direction = normalize(vec2(cos(aPhase * 6.2831853), sin(aPhase * 6.2831853)));
    } else {
      direction = normalize(direction);
    }
    shadow = uHasOptics == 1 ? structure.b : 0.0;
    caustic = uHasOptics == 1 ? structure.a : 0.0;
    redistribution = uHasOptics == 1 ? light.a : 0.0;
    delivered = uHasOptics == 1 ? light.rgb : vec3(0.09, 0.24, 0.29);
  }

  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 uv = clip.xy / max(0.0001, clip.w) * 0.5 + 0.5;
    vec2 direction;
    float shadow;
    float caustic;
    float redistribution;
    vec3 delivered;
    opticalSignals(uv, direction, shadow, caustic, redistribution, delivered);
    float optical = clamp(max(redistribution, caustic) * uOpticalMapping, 0.0, 1.0);
    float localSpeed = uSpeed * (0.5 + 1.25 * optical) * (1.0 - 0.35 * shadow);
    float shapePhase = dot(position, vec3(1.7, 1.15, 0.8)) + uTime * uSpeed * 0.52;
    float phase = shapePhase + aPhase * 1.35 + uTime * localSpeed * 0.48;
    float amplitude = uPointMotion * (0.6 + 0.4 * optical)
      * mix(0.75, 1.0, aShapeReach);
    if (uMotionMode == 2) {
      vec3 radial3 = normalize(position - uShapeCenter + vec3(0.0001));
      vec3 tangent3 = normalize(cross(vec3(0.0, 1.0, 0.0), radial3) + vec3(0.12, 0.03, 0.08));
      vec3 binormal3 = normalize(cross(radial3, tangent3));
      vec3 orbitMotion = tangent3 * sin(phase)
        + binormal3 * cos(phase * 0.73) * 0.46
        + radial3 * sin(phase * 0.41) * 0.18;
      clip = projectionMatrix * modelViewMatrix
        * vec4(position + orbitMotion * amplitude * 3.2, 1.0);
    } else if (uMotionMode == 3) {
      vec3 radial3 = normalize(position - uShapeCenter + vec3(0.0001));
      vec3 tangent3 = normalize(cross(vec3(0.0, 1.0, 0.0), radial3) + vec3(0.12, 0.03, 0.08));
      float originalFlowPhase = aPhase + uTime * localSpeed;
      float flowWave = sin(originalFlowPhase * 6.2831853 + position.y * 2.1 + position.x * 1.3);
      vec3 flowMotion = tangent3 * flowWave
        + radial3 * cos(originalFlowPhase * 4.7 + position.z) * 0.20454545;
      clip = projectionMatrix * modelViewMatrix
        * vec4(position + flowMotion * amplitude * 3.2, 1.0);
    } else {
      vec2 shapeDirection = normalize(
        vec2(position.x + position.z * 0.35, position.y - position.z * 0.2)
          + vec2(0.0001)
      );
      vec2 shapePerpendicular = vec2(-shapeDirection.y, shapeDirection.x);
      vec2 perpendicular = vec2(-direction.y, direction.x);
      vec2 shapeWave = shapeDirection * sin(shapePhase)
        + shapePerpendicular * cos(shapePhase * 0.61) * 0.28;
      vec2 opticalWave = uMotionMode == 0
        ? direction * sin(phase) + perpendicular * cos(phase * 0.73) * 0.35
        : direction * sin(phase) * 0.55 + perpendicular * sin(phase * 2.0) * 0.22;
      vec2 motion = mix(shapeWave, opticalWave, 0.22 + 0.68 * optical);
      clip.xy += motion * amplitude * clip.w;
    }
    gl_Position = clip;
    float cameraDisplayScale = clamp(5.0 / max(0.001, abs(clip.w)), 0.65, 4.0);
    gl_PointSize = uPointSize * (1.0 + 1.1 * caustic + 0.35 * redistribution)
      * cameraDisplayScale;
    float screenRadius = length(uv - 0.5) * 2.0;
    float centreWhite = 1.0 - smoothstep(0.12, 0.62, screenRadius);
    vec3 rainbow = opticalRainbow(aPhase + screenRadius * 0.18);
    vec3 opticalColor = max(delivered, rainbow * (0.38 + 0.42 * optical));
    vPointColor = mix(opticalColor, vec3(1.0), centreWhite * (0.55 + 0.45 * optical));
    vPointColor += vec3(1.0) * caustic * 0.32;
    vPointOpacity = clamp(0.42 + 0.48 * optical + 0.28 * caustic - 0.18 * shadow, 0.12, 1.0);
  }
`;

const opticalFormPointFragmentShader = /* glsl */ `
  varying vec3 vPointColor;
  varying float vPointOpacity;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float alpha = 1.0 - smoothstep(0.55, 1.0, radius);
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(vPointColor, alpha * vPointOpacity);
  }
`;

const opticalFormTrailVertexShader = /* glsl */ `
  attribute float aPhase;
  attribute float aTrail;
  attribute float aShapeReach;
  attribute float aTrailStart;
  attribute float aTrailEnd;
  attribute float aRibbonSide;
  uniform sampler2D uStructure;
  uniform sampler2D uLight;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uPointMotion;
  uniform float uTrailLength;
  uniform float uOpticalMapping;
  uniform vec3 uShapeCenter;
  uniform vec2 uViewport;
  uniform float uLineWidth;
  uniform int uMotionMode;
  uniform int uHasOptics;
  uniform int uRenderAsRibbon;
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  varying float vRibbonEdge;

  vec3 opticalRainbow(float hue) {
    return pow(0.5 + 0.5 * cos(6.2831853 * (hue + vec3(0.0, 0.667, 0.333))), vec3(1.35));
  }

  float cameraDisplayScale(float clipW) {
    return clamp(5.0 / max(0.001, abs(clipW)), 0.65, 4.0);
  }

  vec4 evaluateTrailClip(
    float trail,
    vec4 baseClip,
    float optical,
    float opticalBend,
    float localSpeed,
    float phase,
    float trailExtent,
    float pointAmplitude,
    float detachment
  ) {
    vec4 clip = baseClip;
    vec2 originNdc = baseClip.xy / max(0.0001, baseClip.w);
    vec2 rootDirection = normalize(originNdc + vec2(0.0001));
    vec2 perpendicular = vec2(-rootDirection.y, rootDirection.x);
    float arc = sin(trail * 3.1415927);
    if (uMotionMode == 2) {
      // True 3D wrapping: construct a local tangent frame on the sampled SDF
      // surface, then curve around it before projecting through the live camera.
      vec3 radial3 = normalize(position - uShapeCenter + vec3(0.0001));
      vec3 tangent3 = normalize(cross(vec3(0.0, 1.0, 0.0), radial3) + vec3(0.12, 0.03, 0.08));
      vec3 binormal3 = normalize(cross(radial3, tangent3));
      float orbitAngle = trail * (1.45 + 1.55 * optical)
        + sin(phase * 0.38) * 0.16;
      float orbitExtent = trailExtent * (0.82 + 0.18 * sin(phase * 0.31));
      vec3 orbitCurve = tangent3 * sin(orbitAngle) * orbitExtent
        + binormal3 * (1.0 - cos(orbitAngle)) * orbitExtent * 0.62
        + radial3 * arc * orbitExtent * (0.12 + 0.2 * optical);
      vec3 orbitEscape = (tangent3 * 0.68 + radial3 * 0.32)
        * detachment * (0.3 + 0.78 * aShapeReach);
      clip = projectionMatrix * modelViewMatrix
        * vec4(position + orbitCurve + orbitEscape, 1.0);
    } else if (uMotionMode == 3) {
      // Original Hikari FLOW TRAILS equation: preserve its 2pi tangent wave,
      // 4.7 radial counter-wave and -aTrail * 0.65 history phase. Optical
      // signals scale the same vocabulary rather than inventing a direction.
      vec3 radial3 = normalize(position - uShapeCenter + vec3(0.0001));
      vec3 tangent3 = normalize(cross(vec3(0.0, 1.0, 0.0), radial3) + vec3(0.12, 0.03, 0.08));
      float flowPhase = aPhase + uTime * localSpeed - trail * 0.65;
      float flowWave = sin(flowPhase * 6.2831853 + position.y * 2.1 + position.x * 1.3);
      vec3 flowCurve = tangent3
          * (flowWave * pointAmplitude * 3.2 - trail * trailExtent)
        + radial3 * cos(flowPhase * 4.7 + position.z) * pointAmplitude * 0.65454545;
      clip = projectionMatrix * modelViewMatrix * vec4(position + flowCurve, 1.0);
    } else {
      vec2 offset;
      if (uMotionMode == 0) {
        vec2 head = rootDirection * sin(phase) * pointAmplitude
          + perpendicular * cos(phase * 0.73) * pointAmplitude * 0.35;
        offset = head + rootDirection * trail * trailExtent
          + perpendicular * arc * trailExtent
            * (0.18 + 0.24 * opticalBend + 0.16 * sin(phase * 0.41 + aPhase * 6.2831853));
      } else {
        float extension = (0.28 + 0.72 * (0.5 + 0.5 * sin(phase))) * trailExtent;
        offset = rootDirection * trail * extension
          + perpendicular * arc * extension
            * (0.2 + 0.2 * opticalBend + 0.14 * sin(phase * 0.55 + aPhase * 6.2831853));
      }
      // Current screen-radial STREAM/PULSE remains available unchanged.
      offset += rootDirection * detachment * (0.34 + 0.92 * aShapeReach);
      clip.xy += offset * clip.w;
    }
    return clip;
  }

  void main() {
    vec4 baseClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 uv = baseClip.xy / max(0.0001, baseClip.w) * 0.5 + 0.5;
    vec4 structure = texture2D(uStructure, clamp(uv, 0.0, 1.0));
    vec4 light = texture2D(uLight, clamp(uv, 0.0, 1.0));
    vec2 direction = structure.rg * 2.0 - 1.0;
    if (dot(direction, direction) < 0.0001) {
      direction = normalize(vec2(cos(aPhase * 6.2831853), sin(aPhase * 6.2831853)));
    } else {
      direction = normalize(direction);
    }
    float shadow = uHasOptics == 1 ? structure.b : 0.0;
    float caustic = uHasOptics == 1 ? structure.a : 0.0;
    float redistribution = uHasOptics == 1 ? light.a : 0.0;
    vec3 delivered = uHasOptics == 1 ? light.rgb : vec3(0.09, 0.24, 0.29);
    float optical = clamp(max(redistribution, caustic) * uOpticalMapping, 0.0, 1.0);
    float localSpeed = uSpeed * (0.5 + 1.25 * optical) * (1.0 - 0.35 * shadow);
    float shapePhase = dot(position, vec3(1.7, 1.15, 0.8)) + uTime * uSpeed * 0.52;
    float phase = shapePhase + aPhase * 1.35 + uTime * localSpeed * 0.48;
    float trailExtent = uTrailLength
      * (0.38 + 0.62 * redistribution + 0.85 * caustic)
      * mix(0.7, 1.25, aShapeReach)
      * (0.55 + 0.45 * optical);
    float pointAmplitude = uPointMotion * (0.6 + 0.4 * optical)
      * mix(0.75, 1.0, aShapeReach);
    vec2 originNdc = baseClip.xy / max(0.0001, baseClip.w);
    vec2 rootDirection = normalize(originNdc + vec2(0.0001));
    vec2 perpendicular = vec2(-rootDirection.y, rootDirection.x);
    float opticalBend = dot(direction, perpendicular);
    float lifeRate = 0.035 + 0.025 * min(uSpeed, 4.0);
    float life = fract(uTime * lifeRate + aPhase);
    float detachment = pow(smoothstep(0.18, 0.92, life), 2.0);
    vec4 clip = evaluateTrailClip(
      aTrail,
      baseClip,
      optical,
      opticalBend,
      localSpeed,
      phase,
      trailExtent,
      pointAmplitude,
      detachment
    );
    vRibbonEdge = 0.0;
    if (uRenderAsRibbon == 1) {
      vec4 startClip = evaluateTrailClip(
        aTrailStart, baseClip, optical, opticalBend, localSpeed, phase,
        trailExtent, pointAmplitude, detachment
      );
      vec4 endClip = evaluateTrailClip(
        aTrailEnd, baseClip, optical, opticalBend, localSpeed, phase,
        trailExtent, pointAmplitude, detachment
      );
      vec2 startNdc = startClip.xy / max(0.0001, startClip.w);
      vec2 endNdc = endClip.xy / max(0.0001, endClip.w);
      vec2 segmentPixels = (endNdc - startNdc) * uViewport * 0.5;
      vec2 segmentDirection = normalize(segmentPixels + vec2(0.0001));
      vec2 ribbonNormal = vec2(-segmentDirection.y, segmentDirection.x);
      float halfWidthPixels = 0.5 * uLineWidth * cameraDisplayScale(clip.w);
      vec2 ribbonOffsetNdc = ribbonNormal * aRibbonSide * halfWidthPixels
        * 2.0 / max(uViewport, vec2(1.0));
      clip.xy += ribbonOffsetNdc * clip.w;
      vRibbonEdge = aRibbonSide;
    }
    gl_Position = clip;
    float separation = clamp(aTrail * 0.78 + detachment * 0.72, 0.0, 1.0);
    vec3 rainbow = opticalRainbow(aPhase + aTrail * 0.22 + detachment * 0.18);
    vec3 spectral = mix(rainbow, max(delivered, rainbow * 0.45), 0.38 + 0.32 * optical);
    float centreWhite = 1.0 - smoothstep(0.08, 0.58, separation);
    vTrailColor = mix(spectral, vec3(1.0), centreWhite);
    vTrailColor += vec3(1.0) * caustic * (0.18 + 0.22 * centreWhite);
    gl_PointSize = mix(1.4, 10.5, pow(separation, 0.72))
      * (1.0 + 0.35 * caustic) * cameraDisplayScale(clip.w);
    float birth = smoothstep(0.0, 0.08, life);
    float death = 1.0 - smoothstep(0.72, 1.0, life);
    float screenRadius = length(clip.xy / max(0.0001, clip.w));
    float edgeFade = 1.0 - smoothstep(0.78, 1.25, screenRadius);
    vTrailOpacity = (0.5 + 0.38 * optical + 0.24 * caustic)
      * (0.9 - 0.38 * aTrail) * (1.0 - 0.3 * shadow)
      * birth * death * edgeFade;
  }
`;

const opticalFormTrailFragmentShader = /* glsl */ `
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float soft = 1.0 - smoothstep(0.18, 1.0, radius);
    if (soft <= 0.001) discard;
    gl_FragColor = vec4(vTrailColor, soft * clamp(vTrailOpacity, 0.0, 0.86));
  }
`;

const opticalFormOrbitFragmentShader = /* glsl */ `
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  varying float vRibbonEdge;
  void main() {
    float softEdge = 1.0 - smoothstep(0.58, 1.0, abs(vRibbonEdge));
    if (softEdge <= 0.001) discard;
    gl_FragColor = vec4(vTrailColor, softEdge * clamp(vTrailOpacity, 0.0, 0.8));
  }
`;

const OPTICAL_FORM_BASE_TRAIL_COUNT = 420;
const OPTICAL_FORM_MAX_TRAIL_DENSITY = 4;
const OPTICAL_FORM_TRAIL_STEPS = 48;
const OPTICAL_FORM_GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;
const OPTICAL_FORM_RIBBON_ENDPOINT = [0, 0, 1, 1, 0, 1] as const;
const OPTICAL_FORM_RIBBON_SIDE = [-1, 1, -1, -1, 1, 1] as const;

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
  private opticalImprintStructureTexture: THREE.DataTexture | null = null;
  private opticalImprintLightTexture: THREE.DataTexture | null = null;
  private opticalImprintRequested = false;
  private opticalImprintAnchorForward: THREE.Vector3 | null = null;
  private opticalImprintAnchorRight: THREE.Vector3 | null = null;
  private opticalImprintAnchorUp: THREE.Vector3 | null = null;
  private opticalFormBodyScene: THREE.Scene | null = null;
  private opticalFormBodyGeometry: THREE.BufferGeometry | null = null;
  private opticalFormBodyTrailGeometry: THREE.BufferGeometry | null = null;
  private opticalFormOrbitTrailGeometry: THREE.BufferGeometry | null = null;
  private opticalFormBodyMaterial: THREE.ShaderMaterial | null = null;
  private opticalFormBodyTrailMaterial: THREE.ShaderMaterial | null = null;
  private opticalFormOrbitTrailMaterial: THREE.ShaderMaterial | null = null;
  private opticalFormBodyTrails: THREE.Points | null = null;
  private opticalFormOrbitTrails: THREE.Mesh | null = null;
  private opticalFormTrailCapacity = 0;
  private opticalFormMotion = { ...DEFAULT_OPTICAL_FORM_MOTION };
  private opticalFormBlackBackground = false;
  private opticalFormBodyRequested = false;
  private opticalFormBodyHasData = false;
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
  private progressiveInvalidationSuppressed = false;

  constructor(
    container: HTMLElement,
    options: { compatibilityMode?: boolean; suppressProgressiveInvalidation?: boolean } = {},
  ) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const compatibilityMode = options.compatibilityMode === true;
    this.progressiveInvalidationSuppressed = options.suppressProgressiveInvalidation === true;
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
        uOpticalImprintStructure: { value: null },
        uOpticalImprintLight: { value: null },
        uOpticalImprintEnabled: { value: 0 },
        uOpticalImprintOpacity: { value: 0.82 },
        uOpticalImprintSeparation: { value: 1 },
        uOpticalImprintCausticBoost: { value: 3.2 },
        uOpticalImprintFullFrame: { value: 1 },
        uOpticalImprintPlacement: { value: 1 },
        uOpticalImprintScale: { value: 1.15 },
        uOpticalImprintOffset: { value: new THREE.Vector2() },
        uOpticalImprintCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
        uOpticalImprintResolution: { value: new THREE.Vector2(1, 1) },
        uOpticalImprintViewOffset: { value: new THREE.Vector2() },
        uOpticalImprintViewAlignment: { value: 1 },
        uOpticalFormBlackBackground: { value: 0 },
        // Display-only BODY cutout controls. Mode 0 is an exact v0.32.5
        // bypass, so it must never be approximated by shader thresholds.
        uOpticalDissolveMode: { value: 0 },
        uOpticalDissolveRetention: { value: 0.52 },
        uOpticalDissolveStrokeHalfWidth: { value: 1.6 },
        uOpticalDissolveCausticErosion: { value: 0.45 },
        uOpticalDissolveTrailReach: { value: 5 },
        uOpticalFormBodyEnabled: { value: 0 },
        uCompatibilityMode: { value: compatibilityMode ? 1 : 0 },
      },
    });

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
    this.invalidateProgressiveRender("背景メディアが変わったためリアルタイムへ戻りました");
    return { kind: isVideo ? "video" : "image", name: file.name, width, height };
  }

  setBackgroundMediaMode(mode: BackgroundMediaMode): void {
    this.material.uniforms.uBackgroundMediaEnvironment.value = mode === "environment" ? 1 : 0;
    this.invalidateProgressiveRender("背景の映り込みが変わったためリアルタイムへ戻りました");
  }

  clearBackgroundMedia(): void {
    this.releaseBackgroundMedia();
    this.material.uniforms.uBackgroundMediaEnabled.value = 0;
    this.invalidateProgressiveRender("背景メディアを外したためリアルタイムへ戻りました");
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

  setOpticalImprintData(data: OpticalImprintTextureData): void {
    this.opticalImprintStructureTexture?.dispose();
    this.opticalImprintLightTexture?.dispose();
    this.opticalImprintStructureTexture = makeOpticalImprintTexture(
      data.structure,
      data.width,
      data.height,
    );
    this.opticalImprintLightTexture = makeOpticalImprintTexture(
      data.light,
      data.width,
      data.height,
    );
    this.material.uniforms.uOpticalImprintStructure.value = this.opticalImprintStructureTexture;
    this.material.uniforms.uOpticalImprintLight.value = this.opticalImprintLightTexture;
    for (const material of [
      this.opticalFormBodyMaterial,
      this.opticalFormBodyTrailMaterial,
      this.opticalFormOrbitTrailMaterial,
    ]) {
      if (!material) continue;
      material.uniforms.uStructure.value = this.opticalImprintStructureTexture;
      material.uniforms.uLight.value = this.opticalImprintLightTexture;
      material.uniforms.uHasOptics.value = 1;
    }
    this.material.uniforms.uOpticalImprintCrop.value.set(...data.supportUv);
    this.material.uniforms.uOpticalImprintResolution.value.set(data.width, data.height);
    if (!this.opticalImprintAnchorForward) this.captureOpticalImprintView();
    this.applyOpticalImprintAvailability();
    this.invalidateProgressiveRender("角度固有の背景が更新されたためリアルタイムへ戻りました");
  }

  setOpticalImprintEnabled(enabled: boolean): void {
    this.opticalImprintRequested = enabled;
    this.applyOpticalImprintAvailability();
    this.invalidateProgressiveRender("角度固有の背景表示が変わったためリアルタイムへ戻りました");
  }

  setOpticalImprintPresentation(options: {
    opacity: number;
    separation: number;
    causticBoost: number;
    fullFrame: boolean;
    placement: "background" | "integrated" | "foreground";
    scale: number;
    offsetX: number;
    offsetY: number;
    dissolve?: {
      preset: OpticalDissolvePresetId;
      settings: OpticalDissolveSettings;
    };
  }): void {
    this.material.uniforms.uOpticalImprintOpacity.value = THREE.MathUtils.clamp(
      options.opacity,
      0,
      1,
    );
    this.material.uniforms.uOpticalImprintSeparation.value = THREE.MathUtils.clamp(
      options.separation,
      0,
      2,
    );
    this.material.uniforms.uOpticalImprintCausticBoost.value = THREE.MathUtils.clamp(
      options.causticBoost,
      0,
      8,
    );
    this.material.uniforms.uOpticalImprintFullFrame.value = options.fullFrame ? 1 : 0;
    this.material.uniforms.uOpticalImprintPlacement.value =
      options.placement === "background" ? 0 : options.placement === "integrated" ? 1 : 2;
    this.material.uniforms.uOpticalImprintScale.value = THREE.MathUtils.clamp(
      options.scale,
      0.5,
      2.5,
    );
    this.material.uniforms.uOpticalImprintOffset.value.set(
      THREE.MathUtils.clamp(options.offsetX, -0.5, 0.5),
      THREE.MathUtils.clamp(options.offsetY, -0.5, 0.5),
    );
    if (options.dissolve) {
      const settings = normalizeOpticalDissolveSettings(options.dissolve.settings);
      this.material.uniforms.uOpticalDissolveMode.value = options.dissolve.preset === "solid" ? 0 : 1;
      this.material.uniforms.uOpticalDissolveRetention.value = settings.retention;
      this.material.uniforms.uOpticalDissolveStrokeHalfWidth.value = settings.strokeHalfWidth;
      this.material.uniforms.uOpticalDissolveCausticErosion.value = settings.causticErosion;
      this.material.uniforms.uOpticalDissolveTrailReach.value = settings.trailReach;
    } else {
      // Existing callers retain their prior Optical Imprint presentation.
      this.material.uniforms.uOpticalDissolveMode.value = 0;
    }
    this.invalidateProgressiveRender("角度固有の背景表現が変わったためリアルタイムへ戻りました");
  }

  captureOpticalImprintView(): void {
    this.controls.update();
    this.camera.updateMatrixWorld();
    this.opticalImprintAnchorForward = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    this.opticalImprintAnchorRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
    this.opticalImprintAnchorUp = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
    this.syncOpticalImprintView();
    this.invalidateProgressiveRender("角度固有の背景の基準角度を記録しました");
  }

  clearOpticalImprint(): void {
    this.opticalImprintStructureTexture?.dispose();
    this.opticalImprintLightTexture?.dispose();
    this.opticalImprintStructureTexture = null;
    this.opticalImprintLightTexture = null;
    this.opticalImprintAnchorForward = null;
    this.opticalImprintAnchorRight = null;
    this.opticalImprintAnchorUp = null;
    this.material.uniforms.uOpticalImprintStructure.value = null;
    this.material.uniforms.uOpticalImprintLight.value = null;
    this.material.uniforms.uOpticalImprintEnabled.value = 0;
    for (const material of [
      this.opticalFormBodyMaterial,
      this.opticalFormBodyTrailMaterial,
      this.opticalFormOrbitTrailMaterial,
    ]) {
      if (!material) continue;
      material.uniforms.uStructure.value = this.causticTexture;
      material.uniforms.uLight.value = this.causticTexture;
      material.uniforms.uHasOptics.value = 0;
    }
  }

  setOpticalFormBodyEnabled(enabled: boolean): void {
    this.opticalFormBodyRequested = enabled;
    this.applyOpticalFormBodyAvailability();
    this.invalidateProgressiveRender(
      enabled
        ? "本体表示をFORM点描へ切り替えました"
        : "本体表示をOPTICS透明体へ戻しました",
    );
  }

  setOpticalFormBodyData(positions: Float32Array): void {
    if (positions.length === 0 || positions.length % 3 !== 0) {
      throw new RangeError("Optical FORM body requires finite XYZ point positions");
    }
    if (!positions.every(Number.isFinite)) {
      throw new RangeError("Optical FORM body positions must be finite");
    }
    this.ensureOpticalFormMaterials();
    this.opticalFormBodyGeometry?.dispose();
    this.opticalFormBodyTrailGeometry?.dispose();
    this.opticalFormOrbitTrailGeometry?.dispose();
    this.opticalFormBodyScene!.clear();
    this.opticalFormBodyTrails = null;
    this.opticalFormOrbitTrails = null;

    const pointCount = positions.length / 3;
    const phases = new Float32Array(pointCount);
    const shapeReach = new Float32Array(pointCount);
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    for (let index = 0; index < pointCount; index++) {
      centerX += positions[index * 3];
      centerY += positions[index * 3 + 1];
      centerZ += positions[index * 3 + 2];
    }
    centerX /= pointCount;
    centerY /= pointCount;
    centerZ /= pointCount;
    for (const material of [
      this.opticalFormBodyMaterial,
      this.opticalFormBodyTrailMaterial,
      this.opticalFormOrbitTrailMaterial,
    ]) {
      material?.uniforms.uShapeCenter.value.set(centerX, centerY, centerZ);
    }
    let maxRadius = 1e-6;
    for (let index = 0; index < pointCount; index++) {
      const offset = index * 3;
      const radius = Math.hypot(
        positions[offset] - centerX,
        positions[offset + 1] - centerY,
        positions[offset + 2] - centerZ,
      );
      shapeReach[index] = radius;
      maxRadius = Math.max(maxRadius, radius);
      phases[index] = deterministicPointPhase(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2],
        index,
      );
    }
    for (let index = 0; index < pointCount; index++) shapeReach[index] /= maxRadius;

    this.opticalFormBodyGeometry = new THREE.BufferGeometry();
    this.opticalFormBodyGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.opticalFormBodyGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.opticalFormBodyGeometry.setAttribute("aShapeReach", new THREE.BufferAttribute(shapeReach, 1));
    this.opticalFormBodyGeometry.computeBoundingSphere();
    const points = new THREE.Points(this.opticalFormBodyGeometry, this.opticalFormBodyMaterial!);
    points.frustumCulled = false;
    this.opticalFormBodyScene!.add(points);

    // Allocate once for the full 4x author range. A low-discrepancy source
    // order keeps every density prefix distributed across the whole form.
    const trailCount = Math.min(
      pointCount,
      OPTICAL_FORM_BASE_TRAIL_COUNT * OPTICAL_FORM_MAX_TRAIL_DENSITY,
    );
    const steps = OPTICAL_FORM_TRAIL_STEPS;
    const trailVertexCount = trailCount * steps;
    const trailPositions = new Float32Array(trailVertexCount * 3);
    const trailPhases = new Float32Array(trailVertexCount);
    const trailProgress = new Float32Array(trailVertexCount);
    const trailShapeReach = new Float32Array(trailVertexCount);
    const orbitVertexCount = trailCount * Math.max(0, steps - 1) * 6;
    const orbitPositions = new Float32Array(orbitVertexCount * 3);
    const orbitPhases = new Float32Array(orbitVertexCount);
    const orbitProgress = new Float32Array(orbitVertexCount);
    const orbitShapeReach = new Float32Array(orbitVertexCount);
    const orbitTrailStart = new Float32Array(orbitVertexCount);
    const orbitTrailEnd = new Float32Array(orbitVertexCount);
    const orbitRibbonSide = new Float32Array(orbitVertexCount);
    let vertex = 0;
    let orbitVertex = 0;
    for (let trail = 0; trail < trailCount; trail++) {
      const source = Math.min(
        pointCount - 1,
        Math.floor(
          ((trail + 0.5) * OPTICAL_FORM_GOLDEN_RATIO_CONJUGATE % 1) * pointCount,
        ),
      );
      const sourceOffset = source * 3;
      for (let step = 0; step < steps; step++) {
        const target = vertex * 3;
        trailPositions[target] = positions[sourceOffset];
        trailPositions[target + 1] = positions[sourceOffset + 1];
        trailPositions[target + 2] = positions[sourceOffset + 2];
        trailPhases[vertex] = phases[source];
        trailProgress[vertex] = step / Math.max(1, steps - 1);
        trailShapeReach[vertex] = shapeReach[source];
        vertex++;
      }
      for (let step = 0; step < steps - 1; step++) {
        const start = step / (steps - 1);
        const end = (step + 1) / (steps - 1);
        for (let ribbonVertex = 0; ribbonVertex < 6; ribbonVertex++) {
          const progress = OPTICAL_FORM_RIBBON_ENDPOINT[ribbonVertex] === 0 ? start : end;
          const target = orbitVertex * 3;
          orbitPositions[target] = positions[sourceOffset];
          orbitPositions[target + 1] = positions[sourceOffset + 1];
          orbitPositions[target + 2] = positions[sourceOffset + 2];
          orbitPhases[orbitVertex] = phases[source];
          orbitProgress[orbitVertex] = progress;
          orbitShapeReach[orbitVertex] = shapeReach[source];
          orbitTrailStart[orbitVertex] = start;
          orbitTrailEnd[orbitVertex] = end;
          orbitRibbonSide[orbitVertex] = OPTICAL_FORM_RIBBON_SIDE[ribbonVertex];
          orbitVertex++;
        }
      }
    }
    this.opticalFormBodyTrailGeometry = new THREE.BufferGeometry();
    this.opticalFormBodyTrailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(trailPositions, 3),
    );
    this.opticalFormBodyTrailGeometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(trailPhases, 1),
    );
    this.opticalFormBodyTrailGeometry.setAttribute(
      "aTrail",
      new THREE.BufferAttribute(trailProgress, 1),
    );
    this.opticalFormBodyTrailGeometry.setAttribute(
      "aShapeReach",
      new THREE.BufferAttribute(trailShapeReach, 1),
    );
    this.opticalFormOrbitTrailGeometry = new THREE.BufferGeometry();
    this.opticalFormOrbitTrailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(orbitPositions, 3),
    );
    this.opticalFormOrbitTrailGeometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(orbitPhases, 1),
    );
    this.opticalFormOrbitTrailGeometry.setAttribute(
      "aTrail",
      new THREE.BufferAttribute(orbitProgress, 1),
    );
    this.opticalFormOrbitTrailGeometry.setAttribute(
      "aShapeReach",
      new THREE.BufferAttribute(orbitShapeReach, 1),
    );
    this.opticalFormOrbitTrailGeometry.setAttribute(
      "aTrailStart",
      new THREE.BufferAttribute(orbitTrailStart, 1),
    );
    this.opticalFormOrbitTrailGeometry.setAttribute(
      "aTrailEnd",
      new THREE.BufferAttribute(orbitTrailEnd, 1),
    );
    this.opticalFormOrbitTrailGeometry.setAttribute(
      "aRibbonSide",
      new THREE.BufferAttribute(orbitRibbonSide, 1),
    );
    this.opticalFormBodyTrails = new THREE.Points(
      this.opticalFormBodyTrailGeometry,
      this.opticalFormBodyTrailMaterial!,
    );
    this.opticalFormBodyTrails.frustumCulled = false;
    this.opticalFormOrbitTrails = new THREE.Mesh(
      this.opticalFormOrbitTrailGeometry,
      this.opticalFormOrbitTrailMaterial!,
    );
    this.opticalFormOrbitTrails.frustumCulled = false;
    this.opticalFormTrailCapacity = trailCount;
    this.opticalFormBodyScene!.add(this.opticalFormBodyTrails, this.opticalFormOrbitTrails);
    this.syncOpticalFormMotionUniforms();
    this.opticalFormBodyHasData = true;
    this.applyOpticalFormBodyAvailability();
    this.invalidateProgressiveRender("FORM点描の本体表示を更新しました");
  }

  setOpticalFormMotion(value: Partial<OpticalFormMotionSettings>): void {
    this.opticalFormMotion = normalizeOpticalFormMotion(value);
    this.syncOpticalFormMotionUniforms();
    this.invalidateProgressiveRender("FORMの点と光跡の動きを更新しました");
  }

  setOpticalFormBlackBackground(enabled: boolean): void {
    this.opticalFormBlackBackground = enabled;
    this.material.uniforms.uOpticalFormBlackBackground.value = enabled ? 1 : 0;
    const blending = enabled ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const material of [
      this.opticalFormBodyMaterial,
      this.opticalFormBodyTrailMaterial,
      this.opticalFormOrbitTrailMaterial,
    ]) {
      if (!material || material.blending === blending) continue;
      material.blending = blending;
      material.needsUpdate = true;
    }
    this.invalidateProgressiveRender(
      enabled ? "FORM背景を黒へ切り替えました" : "FORM背景を光学環境へ戻しました",
    );
  }

  clearOpticalFormBody(): void {
    this.opticalFormBodyGeometry?.dispose();
    this.opticalFormBodyTrailGeometry?.dispose();
    this.opticalFormOrbitTrailGeometry?.dispose();
    this.opticalFormBodyMaterial?.dispose();
    this.opticalFormBodyTrailMaterial?.dispose();
    this.opticalFormOrbitTrailMaterial?.dispose();
    this.opticalFormBodyScene = null;
    this.opticalFormBodyGeometry = null;
    this.opticalFormBodyTrailGeometry = null;
    this.opticalFormOrbitTrailGeometry = null;
    this.opticalFormBodyMaterial = null;
    this.opticalFormBodyTrailMaterial = null;
    this.opticalFormOrbitTrailMaterial = null;
    this.opticalFormBodyTrails = null;
    this.opticalFormOrbitTrails = null;
    this.opticalFormTrailCapacity = 0;
    this.opticalFormBodyHasData = false;
    this.material.uniforms.uOpticalFormBodyEnabled.value = 0;
  }

  private ensureOpticalFormMaterials(): void {
    if (this.opticalFormBodyScene) return;
    this.opticalFormBodyScene = new THREE.Scene();
    const sharedUniforms = () => ({
      uStructure: { value: this.opticalImprintStructureTexture ?? this.causticTexture },
      uLight: { value: this.opticalImprintLightTexture ?? this.causticTexture },
      uTime: { value: 0 },
      uSpeed: { value: this.opticalFormMotion.speed },
      uPointMotion: { value: this.opticalFormMotion.pointMotion },
      uOpticalMapping: { value: this.opticalFormMotion.opticalMapping },
      uShapeCenter: { value: new THREE.Vector3() },
      uViewport: { value: this.drawingBufferSize },
      uMotionMode: { value: opticalFormMotionModeIndex(this.opticalFormMotion.mode) },
      uHasOptics: { value: this.opticalImprintStructureTexture && this.opticalImprintLightTexture ? 1 : 0 },
    });
    this.opticalFormBodyMaterial = new THREE.ShaderMaterial({
      vertexShader: opticalFormPointVertexShader,
      fragmentShader: opticalFormPointFragmentShader,
      uniforms: { ...sharedUniforms(), uPointSize: { value: 1.45 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: this.opticalFormBlackBackground
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
    });
    this.opticalFormBodyTrailMaterial = new THREE.ShaderMaterial({
      vertexShader: opticalFormTrailVertexShader,
      fragmentShader: opticalFormTrailFragmentShader,
      uniforms: {
        ...sharedUniforms(),
        uTrailLength: { value: this.opticalFormMotion.trailLength },
        uLineWidth: { value: 1.25 },
        uRenderAsRibbon: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: this.opticalFormBlackBackground
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
    });
    this.opticalFormOrbitTrailMaterial = new THREE.ShaderMaterial({
      vertexShader: opticalFormTrailVertexShader,
      fragmentShader: opticalFormOrbitFragmentShader,
      uniforms: {
        ...sharedUniforms(),
        uTrailLength: { value: this.opticalFormMotion.trailLength },
        uLineWidth: { value: 1.6 },
        uRenderAsRibbon: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: this.opticalFormBlackBackground
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
    });
  }

  private syncOpticalFormMotionUniforms(): void {
    for (const material of [
      this.opticalFormBodyMaterial,
      this.opticalFormBodyTrailMaterial,
      this.opticalFormOrbitTrailMaterial,
    ]) {
      if (!material) continue;
      material.uniforms.uSpeed.value = this.opticalFormMotion.speed;
      material.uniforms.uPointMotion.value = this.opticalFormMotion.pointMotion;
      material.uniforms.uOpticalMapping.value = this.opticalFormMotion.opticalMapping;
      material.uniforms.uMotionMode.value = opticalFormMotionModeIndex(this.opticalFormMotion.mode);
    }
    for (const material of [this.opticalFormBodyTrailMaterial, this.opticalFormOrbitTrailMaterial]) {
      if (material) material.uniforms.uTrailLength.value = this.opticalFormMotion.trailLength;
    }
    const usesContinuousLines = this.opticalFormMotion.mode === "orbit"
      || this.opticalFormMotion.mode === "flowTrails";
    if (this.opticalFormBodyTrails) this.opticalFormBodyTrails.visible = !usesContinuousLines;
    if (this.opticalFormOrbitTrails) this.opticalFormOrbitTrails.visible = usesContinuousLines;
    const visibleTrails = Math.min(
      this.opticalFormTrailCapacity,
      Math.max(
        1,
        Math.round(OPTICAL_FORM_BASE_TRAIL_COUNT * this.opticalFormMotion.trailDensity),
      ),
    );
    this.opticalFormBodyTrailGeometry?.setDrawRange(
      0,
      visibleTrails * OPTICAL_FORM_TRAIL_STEPS,
    );
    this.opticalFormOrbitTrailGeometry?.setDrawRange(
      0,
      visibleTrails * (OPTICAL_FORM_TRAIL_STEPS - 1) * 6,
    );
  }

  private applyOpticalImprintAvailability(): void {
    this.material.uniforms.uOpticalImprintEnabled.value =
      this.opticalImprintRequested
      && this.opticalImprintStructureTexture
      && this.opticalImprintLightTexture
        ? 1
        : 0;
    this.applyOpticalFormBodyAvailability();
  }

  private applyOpticalFormBodyAvailability(): void {
    this.material.uniforms.uOpticalFormBodyEnabled.value =
      this.opticalFormBodyRequested
      && this.opticalFormBodyHasData
        ? 1
        : 0;
  }

  private syncOpticalImprintView(): void {
    if (!this.opticalImprintAnchorForward
      || !this.opticalImprintAnchorRight
      || !this.opticalImprintAnchorUp) return;
    const current = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const relation = opticalImprintViewRelation(
      {
        forward: this.opticalImprintAnchorForward.toArray(),
        right: this.opticalImprintAnchorRight.toArray(),
        up: this.opticalImprintAnchorUp.toArray(),
      },
      current.toArray(),
    );
    this.material.uniforms.uOpticalImprintViewOffset.value.set(...relation.offset);
    this.material.uniforms.uOpticalImprintViewAlignment.value = relation.alignment;
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
    if (!this.progressiveInvalidationSuppressed) {
      this.invalidateProgressiveRender("画面サイズが変わったためリアルタイムへ戻りました");
    }
  }

  /** FORM owns the shared context but must not disturb progressive optics while active. */
  setProgressiveInvalidationSuppressed(suppressed: boolean): void {
    this.progressiveInvalidationSuppressed = suppressed;
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
    this.renderOpticalFormBody(now);
  }

  private syncCameraUniforms(): void {
    this.camera.updateMatrixWorld();
    this.material.uniforms.uCamPos.value.copy(this.camera.position);
    this.material.uniforms.uCamInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    this.material.uniforms.uCamInverseView.value.copy(this.camera.matrixWorld);
    this.syncOpticalImprintView();
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
    this.renderOpticalFormBody();
  }

  private renderOpticalFormBody(now = performance.now()): void {
    if (this.material.uniforms.uOpticalFormBodyEnabled.value !== 1
      || !this.opticalFormBodyScene) return;
    const time = now * 0.001;
    if (this.opticalFormBodyMaterial) this.opticalFormBodyMaterial.uniforms.uTime.value = time;
    if (this.opticalFormBodyTrailMaterial) {
      this.opticalFormBodyTrailMaterial.uniforms.uTime.value = time;
    }
    if (this.opticalFormOrbitTrailMaterial) {
      this.opticalFormOrbitTrailMaterial.uniforms.uTime.value = time;
    }
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.opticalFormBodyScene, this.camera);
    this.renderer.autoClear = autoClear;
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
      this.renderOpticalFormBody();
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

function makeOpticalImprintTexture(
  data: Uint8Array,
  width: number,
  height: number,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array(data),
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function deterministicPointPhase(x: number, y: number, z: number, index: number): number {
  const value = Math.sin(
    x * 12.9898 + y * 78.233 + z * 37.719 + index * 0.00137,
  ) * 43_758.5453;
  return value - Math.floor(value);
}

function opticalFormMotionModeIndex(mode: OpticalFormMotionMode): number {
  return mode === "stream" ? 0 : mode === "pulse" ? 1 : mode === "orbit" ? 2 : 3;
}

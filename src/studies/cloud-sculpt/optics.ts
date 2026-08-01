import * as THREE from "three";
import { fieldSdf, type Ball } from "./field.ts";
import { buildCloudOpticalScene } from "./opticalSceneAdapter.ts";
import { resolveDaylight, type DaylightMode } from "./daylight.ts";
import {
  applyShadowContainedSupport,
  blurCoverageEnergyNormalized,
  blurFluxRgbEnergyNormalized,
  blurLossFluxRgbEnergyNormalized,
  createReceiverTransportField,
  finalizeEnergyLedger,
  integrateFluxRgb,
  summarizeReceiverField,
  splatBilinearCoverageFlux,
  splatBilinearFluxRgb,
  splatBilinearLossFluxRgb,
  splatBilinearStraightFluxRgb,
  type EnergyLedger,
  type ReceiverFieldSpec,
  type ReceiverTransportField,
  type ReceiverFieldSummary,
  type FluxRgb,
} from "./receiverTransport.ts";
import {
  compareReceiverFields,
  type ReceiverFieldParityMetrics,
} from "./receiverParity.ts";
import {
  FINITE_LIGHT_SAMPLE_STRIDE,
  generateFiniteLightSamples,
} from "./finiteLightSamples.ts";
import {
  GPU_OPTICS_RESULT_OFFSETS,
  MAX_GPU_OPTICS_BALLS,
  WebGpuOpticsEngine,
  gpuOpticsResultOffset,
  type GpuOpticsResult,
  type OpticsComputeKind,
} from "./opticsGpu.ts";

export type HikariPhenomenon = "flow" | "optics";
export type OpticalMaterial = "water" | "glass";
export type OpticalHostPreset = "clear" | "amber" | "dark" | "custom";
export type OpticalDisplay = "density" | "both";
export type OpticalView = "natural" | "analysis";
export type ReceiverDisplayMode = "composite" | "coverage" | "deposit" | "loss";
export type OpticalColorMode = "color" | "mono";
export type OpticalDispersionMode = "global" | "local";
export type OpticalRainbowModel = "prism" | "stress" | "both";

export interface CausticFieldDiagnostics {
  source: "cpu" | "webgpu" | "empty";
  emittedSampleCount: number;
  spectralDepositCount: number;
  inDomainDepositCount: number;
  outOfDomainDepositCount: number;
  sampleFlux: number;
  escapedDomainFluxRgb: FluxRgb;
  affectedSampleCount: number;
  baselineDomainMissCount: number;
  incidentAffectedFluxRgb: FluxRgb;
  materialInterfaceLossRgb: FluxRgb;
  reflectedFluxRgb: FluxRgb;
  escapedReceiverFluxRgb: FluxRgb;
  supportRejectedFluxRgb: FluxRgb;
  unresolvedLossRgb: FluxRgb;
  energyLedger: EnergyLedger;
}

export type CausticField = ReceiverTransportField & {
  diagnostics: CausticFieldDiagnostics;
};

interface ReceiverFluxAccumulator {
  field: ReceiverTransportField;
  diagnostics: CausticFieldDiagnostics;
}

interface ReceiverBuildOptions {
  sampleCountOverride?: number;
  publish?: boolean;
}

interface ReceiverBuildResult {
  field: CausticField;
  sampleCount: number;
}

export interface ReceiverParityReport {
  status: "passed" | "failed" | "unavailable" | "stale" | "busy";
  caseId: string;
  sampleCount: number;
  pass: boolean;
  unavailableReason?: string;
  cpu?: { summary: ReceiverFieldSummary; diagnostics: CausticFieldDiagnostics };
  webgpu?: { summary: ReceiverFieldSummary; diagnostics: CausticFieldDiagnostics };
  metrics?: ReceiverFieldParityMetrics;
}

// A stable 32 × 32 bounded receiver study area captures most morning/evening
// projections without reframing the image. Escaped-domain diagnostics expose
// remaining truncation. 512² retains the previous 1/16 shape-unit texel size.
const RECEIVER_FIELD_RESOLUTION = 512;
const RECEIVER_FIELD_HALF_EXTENT = 16;
const RECEIVER_FIELD_BLUR_RADIUS = 3;
const RECEIVER_RECONSTRUCTION_REFERENCE_SAMPLES = 16384;
const RECEIVER_RECONSTRUCTION_MAX_RADIUS = 12;

/**
 * Keep low-sample CPU fields from exposing the finite-light point pattern as
 * disconnected shadow islands. KDE bandwidth grows with mean sample spacing
 * while the scatter blur preserves integrated flux at every radius.
 */
export function receiverReconstructionRadius(sampleCount: number): number {
  const safeCount = Number.isFinite(sampleCount) && sampleCount > 0
    ? sampleCount
    : 1;
  return Math.max(
    RECEIVER_FIELD_BLUR_RADIUS,
    Math.min(
      RECEIVER_RECONSTRUCTION_MAX_RADIUS,
      Math.round(
        RECEIVER_FIELD_BLUR_RADIUS
        * Math.sqrt(RECEIVER_RECONSTRUCTION_REFERENCE_SAMPLES / safeCount),
      ),
    ),
  );
}

export const SPECTRAL_CAUSTIC_COLORS = [
  [1 / 2.13, 0.04 / 2.12, 0],
  [1 / 2.13, 0.5 / 2.12, 0.01 / 2.06],
  [0.08 / 2.13, 1 / 2.12, 0.05 / 2.06],
  [0, 0.55 / 2.12, 1 / 2.06],
  [0.05 / 2.13, 0.03 / 2.12, 1 / 2.06],
] as const;

export interface OpticalSettings {
  phenomenon: HikariPhenomenon;
  opticalMaterial: OpticalMaterial;
  hostPreset: OpticalHostPreset;
  /** Author-facing transmitted swatch; converted to complementary absorption in OpticalScene. */
  hostTransmissionColor: string;
  inclusionEnabled: boolean;
  inclusionIor: number;
  /** Author-facing transmitted swatch for the inclusion. */
  inclusionTransmissionColor: string;
  inclusionAbsorption: number;
  inclusionOffsetX: number;
  inclusionOffsetY: number;
  inclusionOffsetZ: number;
  inclusionRadius: number;
  opticalDisplay: OpticalDisplay;
  opticalView: OpticalView;
  receiverDisplayMode: ReceiverDisplayMode;
  ior: number;
  daylightMode: DaylightMode;
  daylightDate: string;
  daylightMinutes: number;
  lightAngle: number;
  lightWidth: number;
  opticalRayCount: number;
  opticalSampleCount: number;
  opticalSeed: string;
  absorption: number;
  causticStrength: number;
  skyIntensity: number;
  sunIntensity: number;
  sunSize: number;
  /**
   * A finite emitter used to compare a Blender world + emissive-plane
   * setup. This is BODY/view transport only; it is not yet an input to
   * receiver transport or the caustic solver.
   */
  backlightEnabled: boolean;
  backlightIntensity: number;
  backlightWidth: number;
  backlightHeight: number;
  backlightDistance: number;
  groundReflectance: number;
  opticalExposure: number;
  surfaceRoughness: number;
  surfaceVariation: number;
  materialVariation: number;
  materialScale: number;
  environmentContrast: number;
  environmentRotation: number;
  environmentMist: number;
  opticalColorMode: OpticalColorMode;
  rainbowModel: OpticalRainbowModel;
  dispersionMode: OpticalDispersionMode;
  dispersion: number;
  stressAmount: number;
  polarization: number;
}

const causticVertexShader = `
attribute float aEnergy;
attribute float aStretch;
attribute float aAngle;
varying float vEnergy;
varying float vStretch;
varying float vAngle;
uniform float uStrength;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(
    5.0,
    (13.0 + aEnergy * 14.0)
      * sqrt(max(1.0, aStretch))
      * uStrength
      * (18.0 / max(1.0, -mvPosition.z))
  );
  vEnergy = aEnergy;
  vStretch = aStretch;
  vAngle = aAngle;
}
`;

const causticFragmentShader = `
varying float vEnergy;
varying float vStretch;
varying float vAngle;
uniform float uNatural;
uniform float uSampleScale;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float cosine = cos(vAngle);
  float sine = sin(vAngle);
  p = mat2(cosine, -sine, sine, cosine) * p;
  float stretch = sqrt(max(1.0, vStretch));
  p = vec2(p.x / stretch, p.y * stretch);
  float d = length(p) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.38, d);
  float halo = 1.0 - smoothstep(0.15, 1.0, d);
  float ripple = 0.82 + 0.18 * sin((p.x + p.y) * 24.0 + vAngle * 3.0);
  float alpha = (core * 0.42 + halo * 0.15) * (0.28 + vEnergy * 0.72) * ripple;
  alpha *= mix(1.0, 0.40, uNatural);
  alpha *= uSampleScale;
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(mix(vec3(0.22, 0.78, 1.0), vec3(1.0, 0.92, 0.58), vEnergy), alpha);
}
`;

const densityVertexShader = `
attribute float aEnergy;
attribute float aPhase;
varying float vEnergy;
varying vec3 vColor;
uniform float uTime;

void main() {
  vec3 drift = vec3(
    sin(aPhase * 19.1 + uTime * 0.7),
    cos(aPhase * 13.7 + uTime * 0.5),
    sin(aPhase * 17.3 - uTime * 0.6)
  ) * 0.008;
  vec4 mvPosition = modelViewMatrix * vec4(position + drift, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(4.0, (7.0 + aEnergy * 11.0) * (18.0 / max(1.0, -mvPosition.z)));
  vEnergy = aEnergy;
  vColor = color;
}
`;

const densityFragmentShader = `
varying float vEnergy;
varying vec3 vColor;
uniform float uSampleScale;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float radius = length(p) * 2.0;
  float halo = exp(-4.8 * radius * radius);
  float core = 1.0 - smoothstep(0.0, 0.32, radius);
  float alpha = (halo * 0.042 + core * 0.016) * (0.22 + vEnergy * 0.78);
  alpha *= uSampleScale;
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(vColor, alpha);
}
`;

export class OpticsLayer {
  readonly group = new THREE.Group();
  private rays: THREE.LineSegments | null = null;
  private density: THREE.Points | null = null;
  private caustics: THREE.Points | null = null;
  private signature = "";
  private requestId = 0;
  private latestBalls: Ball[] = [];
  private latestK = 0;
  private latestSettings: OpticalSettings | null = null;
  private sunBelowHorizon = false;
  private gpu: WebGpuOpticsEngine;
  private parityGpu: WebGpuOpticsEngine | null = null;
  private parityRunActive = false;
  private parityGpuEnabled: boolean;
  private onCausticField: ((field: CausticField) => void) | null;
  private onTransportPending: ((pending: boolean) => void) | null;
  private rayMaterial = new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0.38,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  private causticMaterial = new THREE.ShaderMaterial({
    vertexShader: causticVertexShader,
    fragmentShader: causticFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uStrength: { value: 1 },
      uNatural: { value: 0 },
      uSampleScale: { value: 1 },
    },
  });
  private densityMaterial = new THREE.ShaderMaterial({
    vertexShader: densityVertexShader,
    fragmentShader: densityFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSampleScale: { value: 1 },
    },
  });

  constructor(
    scene: THREE.Scene,
    options: {
      disableWebGpu?: boolean;
      onCausticField?: (field: CausticField) => void;
      onTransportPending?: (pending: boolean) => void;
    } = {},
  ) {
    this.parityGpuEnabled = options.disableWebGpu !== true;
    this.gpu = new WebGpuOpticsEngine(this.parityGpuEnabled);
    this.onCausticField = options.onCausticField ?? null;
    this.onTransportPending = options.onTransportPending ?? null;
    this.group.visible = false;
    this.group.renderOrder = 20;
    scene.add(this.group);
    this.gpu.ready().then((available) => {
      if (available
        && this.latestSettings
        && this.latestBalls.length > 0
        && resolveDaylight(this.latestSettings).aboveHorizon) {
        this.startGpuRebuild(this.latestBalls, this.latestK, this.latestSettings);
      }
    });
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  invalidateTransport(): void {
    this.signature = "";
  }

  update(balls: Ball[], k: number, settings: OpticalSettings): void {
    this.latestBalls = balls;
    this.latestK = k;
    this.latestSettings = { ...settings };
    this.causticMaterial.uniforms.uStrength.value = settings.causticStrength;
    this.causticMaterial.uniforms.uNatural.value = settings.opticalView === "natural" ? 1 : 0;
    const daylight = resolveDaylight(settings);
    this.sunBelowHorizon = !daylight.aboveHorizon;
    const signature = `${opticalSceneRevision(balls, k, settings)}:${settings.rainbowModel}:${settings.dispersion.toFixed(3)}:${settings.dispersionMode}:${settings.stressAmount.toFixed(3)}:${settings.polarization.toFixed(3)}:${settings.daylightMode}:${settings.daylightDate}:${settings.daylightMinutes}:${settings.lightAngle.toFixed(2)}:${settings.lightWidth.toFixed(2)}:${settings.sunSize.toFixed(2)}:${settings.opticalRayCount}:${settings.opticalSampleCount}:${settings.opticalSeed}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.onTransportPending?.(true);
      if (this.sunBelowHorizon || balls.length === 0) {
        this.requestId++;
        this.clearGeometry();
        this.publishEmptyCausticField(balls, k, settings);
      } else {
        const status = this.gpu.getStatus();
        if (status.kind === "webgpu" || status.kind === "computing") {
          this.startGpuRebuild(balls, k, settings);
        } else {
          const cpuResult = this.rebuildCpu(balls, k, settings);
          this.gpu.setCpuFallback(cpuResult.sampleCount);
        }
      }
    }
    this.applyDisplay(settings.opticalDisplay, settings.opticalView);
  }

  animate(now: number): void {
    this.densityMaterial.uniforms.uTime.value = now * 0.001;
  }

  getComputeStatus(): { text: string; kind: OpticsComputeKind } {
    if (this.sunBelowHorizon && this.latestSettings) {
      return { kind: "cpu", text: `${resolveDaylight(this.latestSettings).label} · 太陽は地平線下` };
    }
    const status = this.gpu.getStatus();
    if (status.kind === "webgpu" && status.sampleCount > 0 && status.elapsedMs !== null) {
      const megaRaysPerSecond = status.sampleCount / Math.max(0.001, status.elapsedMs) / 1000;
      return {
        kind: status.kind,
        text: `WebGPU — ${status.device} · ${status.sampleCount.toLocaleString()} 光線 / ${status.hitCount.toLocaleString()} 通過 · ${status.elapsedMs.toFixed(1)} ms · ${megaRaysPerSecond.toFixed(2)} M光線/秒${status.hitCount === 0 ? ` · ${status.message}` : ""}`,
      };
    }
    if (status.kind === "computing") {
      return {
        kind: status.kind,
        text: `WebGPU — ${status.device} · ${status.sampleCount.toLocaleString()} 光線を計算中`,
      };
    }
    if (status.kind === "cpu") {
      return {
        kind: status.kind,
        text: `${status.message} · ${status.sampleCount.toLocaleString()} 光線`,
      };
    }
    return {
      kind: status.kind,
      text: status.device ? `${status.message} · ${status.device}` : status.message,
    };
  }

  async runReceiverParityCase(
    balls: Ball[],
    k: number,
    settings: OpticalSettings,
    options: { caseId?: string; sampleCount?: number } = {},
  ): Promise<ReceiverParityReport> {
    const caseId = options.caseId?.trim() || "current-scene";
    const requestedSampleCount = Number.isFinite(options.sampleCount)
      ? Number(options.sampleCount)
      : 2048;
    const sampleCount = Math.max(256, Math.min(4096, Math.round(requestedSampleCount)));
    if (this.parityRunActive) {
      return { status: "busy", caseId, sampleCount, pass: false, unavailableReason: "比較計算中です" };
    }
    if (balls.length === 0) {
      return { status: "unavailable", caseId, sampleCount, pass: false, unavailableReason: "形状がありません" };
    }
    if (balls.length > MAX_GPU_OPTICS_BALLS) {
      return {
        status: "unavailable",
        caseId,
        sampleCount,
        pass: false,
        unavailableReason: `形状がGPU上限${MAX_GPU_OPTICS_BALLS}球を超えています`,
      };
    }
    if (!resolveDaylight(settings).aboveHorizon) {
      return { status: "unavailable", caseId, sampleCount, pass: false, unavailableReason: "太陽が地平線下です" };
    }
    if (this.gpu.getStatus().kind === "computing") {
      return { status: "busy", caseId, sampleCount, pass: false, unavailableReason: "通常のGPU計算中です" };
    }
    if (!this.parityGpuEnabled) {
      return { status: "unavailable", caseId, sampleCount, pass: false, unavailableReason: "WebGPUを利用できません" };
    }

    const startingSignature = this.signature;
    const parityBalls = balls.map((ball) => ({ ...ball }));
    const paritySettings = {
      ...settings,
      opticalSampleCount: sampleCount,
      opticalRayCount: Math.min(8, settings.opticalRayCount),
    };
    this.parityRunActive = true;
    try {
      this.parityGpu ??= new WebGpuOpticsEngine(true);
      if (!(await this.parityGpu.ready())) {
        return { status: "unavailable", caseId, sampleCount, pass: false, unavailableReason: "比較用WebGPUを利用できません" };
      }
      const cpuResult = this.rebuildCpu(parityBalls, k, paritySettings, {
        sampleCountOverride: sampleCount,
        publish: false,
      });
      if (this.signature !== startingSignature) {
        return { status: "stale", caseId, sampleCount, pass: false, unavailableReason: "比較中にシーンが変わりました" };
      }
      const gpuPayload = await this.parityGpu.compute(
        parityBalls,
        k,
        paritySettings,
        { updateStatus: false },
      );
      if (!gpuPayload) {
        return { status: "unavailable", caseId, sampleCount, pass: false, unavailableReason: "WebGPU比較計算に失敗しました" };
      }
      if (this.signature !== startingSignature) {
        return { status: "stale", caseId, sampleCount, pass: false, unavailableReason: "比較中にシーンが変わりました" };
      }
      const gpuResult = this.rebuildGpu(gpuPayload, parityBalls, k, paritySettings, { publish: false });
      const metrics = compareReceiverFields(cpuResult.field, gpuResult.field);
      return {
        status: metrics.pass ? "passed" : "failed",
        caseId,
        sampleCount,
        pass: metrics.pass,
        cpu: {
          summary: summarizeReceiverField(cpuResult.field),
          diagnostics: structuredClone(cpuResult.field.diagnostics),
        },
        webgpu: {
          summary: summarizeReceiverField(gpuResult.field),
          diagnostics: structuredClone(gpuResult.field.diagnostics),
        },
        metrics,
      };
    } finally {
      this.parityRunActive = false;
    }
  }

  private startGpuRebuild(balls: Ball[], k: number, settings: OpticalSettings): void {
    this.onTransportPending?.(true);
    this.clearGeometry();
    const requestId = ++this.requestId;
    void this.gpu.compute(balls, k, settings).then((result) => {
      if (requestId !== this.requestId) return;
      if (!result) {
        const cpuResult = this.rebuildCpu(balls, k, settings);
        this.gpu.setCpuFallback(cpuResult.sampleCount, "CPUプレビュー（GPU失敗後）");
        return;
      }
      this.rebuildGpu(result, balls, k, settings);
    });
  }

  private clearGeometry(): void {
    if (this.rays) {
      this.rays.geometry.dispose();
      this.group.remove(this.rays);
      this.rays = null;
    }
    if (this.caustics) {
      this.caustics.geometry.dispose();
      this.group.remove(this.caustics);
      this.caustics = null;
    }
    if (this.density) {
      this.density.geometry.dispose();
      this.group.remove(this.density);
      this.density = null;
    }
  }

  private rebuildCpu(
    balls: Ball[],
    k: number,
    settings: OpticalSettings,
    options: ReceiverBuildOptions = {},
  ): ReceiverBuildResult {
    const publish = options.publish !== false;
    if (publish) {
      this.clearGeometry();
      this.causticMaterial.uniforms.uSampleScale.value = 1;
      this.densityMaterial.uniforms.uSampleScale.value = 1;
    }

    if (balls.length === 0) {
      this.rays = null;
      this.density = null;
      this.caustics = null;
      const field = this.createEmptyCausticField(balls, k, settings);
      if (publish) this.publishCausticField(field, settings);
      return { field, sampleCount: 0 };
    }

    const bounds = fieldBounds(balls);
    // The adapter is the common validation boundary for the rendered host and
    // the analytic CPU inclusion. Invalid/disabled inclusions intentionally
    // leave the established host-only trace untouched.
    const opticalScene = buildCloudOpticalScene(balls, k, settings);
    const inclusion = opticalScene.inclusionValid
      ? {
          center: new THREE.Vector3(
            settings.inclusionOffsetX,
            settings.inclusionOffsetY,
            settings.inclusionOffsetZ,
          ),
          radius: settings.inclusionRadius,
        }
      : null;
    const daylight = resolveDaylight(settings);
    const lightDirection = new THREE.Vector3(
      daylight.propagationDirection.x,
      daylight.propagationDirection.y,
      daylight.propagationDirection.z,
    );
    const basisU = new THREE.Vector3().crossVectors(lightDirection, new THREE.Vector3(0, 1, 0));
    if (basisU.lengthSq() < 0.001) basisU.set(1, 0, 0);
    basisU.normalize();
    const basisV = new THREE.Vector3().crossVectors(basisU, lightDirection).normalize();
    const originCenter = bounds.center.clone().addScaledVector(lightDirection, -bounds.radius * 2.6);
    const floorY = opticalScene.scene.receiver.pose.position.y;
    const rayPositions: number[] = [];
    const rayColors: number[] = [];
    const densityPositions: number[] = [];
    const densityColors: number[] = [];
    const densityEnergy: number[] = [];
    const densityPhases: number[] = [];
    const causticPositions: number[] = [];
    const causticEnergy: number[] = [];
    const causticStretch: number[] = [];
    const causticAngle: number[] = [];
    const visibleRayCount = Math.max(8, Math.round(settings.opticalRayCount));
    // Safe/CPU mode needs enough transport samples to form a stable field,
    // while visible Analysis geometry remains bounded by opticalRayCount.
    const sampleCount = options.sampleCountOverride === undefined
      ? Math.min(2048, Math.max(visibleRayCount, Math.round(settings.opticalSampleCount / 16)))
      : Math.max(1, Math.round(options.sampleCountOverride));
    const sourceSamples = generateFiniteLightSamples(sampleCount, settings.opticalSeed);
    const angularRadius = Math.tan(
      THREE.MathUtils.degToRad(Math.max(0.1, settings.sunSize) * 0.5),
    );
    const receiverAccumulator = createReceiverFluxAccumulator(
      receiverFieldSpec(
        opticalScene.scene.receiver.id,
        opticalScene.scene.receiver.pose.position.x,
        opticalScene.scene.receiver.pose.position.z,
        opticalSceneRevision(balls, k, settings),
        daylightRevision(settings),
      ),
      sampleCount,
      apertureArea(bounds.radius, settings.lightWidth),
      "cpu",
    );

    for (let emitted = 0; emitted < sampleCount; emitted++) {
        const sequenceIndex = emitted + 1;
        const sourceOffset = emitted * FINITE_LIGHT_SAMPLE_STRIDE;
        const u = sourceSamples[sourceOffset];
        const v = sourceSamples[sourceOffset + 1];
        const sampleLightDirection = lightDirection
          .clone()
          .addScaledVector(basisU, sourceSamples[sourceOffset + 2] * angularRadius)
          .addScaledVector(basisV, sourceSamples[sourceOffset + 3] * angularRadius)
          .normalize();
        const showRay = publish && emitted < visibleRayCount;
        const origin = originCenter
          .clone()
          .addScaledVector(basisU, u * bounds.radius * 1.15 * settings.lightWidth)
          .addScaledVector(basisV, v * bounds.radius * 1.05 * settings.lightWidth);
        const baselineHit = intersectFloor(origin, sampleLightDirection, floorY);
        const entry = marchToSurface(balls, k, origin, sampleLightDirection, bounds.radius * 5);

        if (!entry) {
          const floorHit = intersectFloor(origin, sampleLightDirection, floorY);
          if (floorHit) {
            if (showRay) {
              appendSegment(rayPositions, rayColors, origin, floorHit, 0x153f50, 0x18343f);
            }
            if (showRay) {
              appendDensitySegment(
                densityPositions,
                densityColors,
                densityEnergy,
                densityPhases,
                origin,
                floorHit,
                0x174b5c,
                0x1f6676,
                24,
                0.1,
              );
            }
          }
          continue;
        }

        const baselineTracked = depositAffectedBaseline(receiverAccumulator, baselineHit);

        const entryNormal = fieldNormal(balls, k, entry);
        const refractedInside = refract(sampleLightDirection, entryNormal, 1 / settings.ior);
        // Air-to-host should not produce TIR. If numerical/invalid geometry
        // does, do not turn the reflected fallback into receiver energy.
        if (!refractedInside) {
          if (baselineTracked && baselineHit) recordUnresolvedPath(receiverAccumulator, baselineHit);
          if (showRay) {
            appendSegment(rayPositions, rayColors, origin, entry, 0x1c5368, 0x62e6ff);
          }
          continue;
        }
        const insideDirection = refractedInside;
        let exit = marchInside(balls, k, entry, insideDirection, bounds.radius * 5);
        let traversedInclusion = false;
        let inclusionEntry: THREE.Vector3 | null = null;
        let inclusionExit: THREE.Vector3 | null = null;
        let finalHostDirection = insideDirection;
        let hostDistance = exit?.distance ?? 0;
        let inclusionDistance = 0;
        let inclusionPathUnresolved = false;

        // This deliberately traces only the first supported analytic sphere.
        // A complete nested path replaces the host-only exit. Any TIR or
        // incomplete nested path is classified below instead of pretending
        // that the inclusion was absent.
        if (inclusion && refractedInside && exit) {
          const interval = raySphereInterval(entry, insideDirection, inclusion.center, inclusion.radius);
          if (interval && interval.near > 0.012 && interval.far < exit.distance - 0.012) {
            const candidateEntry = entry.clone().addScaledVector(insideDirection, interval.near);
            const candidateEntryNormal = candidateEntry.clone().sub(inclusion.center).normalize();
            const inclusionDirection = refract(
              insideDirection,
              candidateEntryNormal,
              settings.ior / settings.inclusionIor,
            );
            if (inclusionDirection) {
              const insideStart = candidateEntry.clone().addScaledVector(inclusionDirection, 0.006);
              const innerInterval = raySphereInterval(
                insideStart,
                inclusionDirection,
                inclusion.center,
                inclusion.radius,
              );
              if (innerInterval && innerInterval.far > 0.006) {
                const candidateExit = insideStart.clone().addScaledVector(inclusionDirection, innerInterval.far);
                const candidateExitNormal = candidateExit.clone().sub(inclusion.center).normalize();
                const returnedHostDirection = refract(
                  inclusionDirection,
                  candidateExitNormal.clone().negate(),
                  settings.inclusionIor / settings.ior,
                );
                if (returnedHostDirection) {
                  const returnedStart = candidateExit.clone().addScaledVector(returnedHostDirection, 0.008);
                  const nestedExit = marchInside(
                    balls,
                    k,
                    returnedStart,
                    returnedHostDirection,
                    bounds.radius * 5,
                  );
                  if (nestedExit) {
                    traversedInclusion = true;
                    inclusionEntry = candidateEntry;
                    inclusionExit = candidateExit;
                    exit = nestedExit;
                    finalHostDirection = returnedHostDirection;
                    hostDistance = interval.near + nestedExit.distance + 0.008;
                    inclusionDistance = candidateEntry.distanceTo(candidateExit);
                  } else {
                    inclusionPathUnresolved = true;
                  }
                } else {
                  inclusionPathUnresolved = true;
                }
              } else {
                inclusionPathUnresolved = true;
              }
            } else {
              inclusionPathUnresolved = true;
            }
          }
        }
        // Never let a ray silently pass through an inclusion whose boundary
        // path could not be resolved. Until nested reflections are traced,
        // classify the whole affected baseline as unresolved non-arrival.
        if (inclusionPathUnresolved) {
          if (baselineTracked && baselineHit) {
            recordUnresolvedPath(receiverAccumulator, baselineHit);
          }
          continue;
        }
        if (showRay) {
          appendSegment(rayPositions, rayColors, origin, entry, 0x1c5368, 0x62e6ff);
        }
        if (showRay) {
          appendDensitySegment(
            densityPositions,
            densityColors,
            densityEnergy,
            densityPhases,
            origin,
            entry,
            0x164858,
            0x55cfe6,
            36,
            0.32,
          );
        }

        if (!exit) {
          if (baselineTracked && baselineHit) recordUnresolvedPath(receiverAccumulator, baselineHit);
          const end = entry.clone().addScaledVector(insideDirection, bounds.radius * 1.6);
          if (showRay) {
            appendSegment(rayPositions, rayColors, entry, end, 0x8cf4ff, 0xd5ffff);
          }
          if (showRay) {
            appendDensitySegment(
              densityPositions,
              densityColors,
              densityEnergy,
              densityPhases,
              entry,
              end,
              0x65d9ed,
              0xcaffff,
              46,
              0.85,
            );
          }
          continue;
        }

        if (traversedInclusion && inclusionEntry && inclusionExit) {
          if (showRay) {
            appendSegment(rayPositions, rayColors, entry, inclusionEntry, 0x6beaff, 0xa9f7ff);
            appendSegment(rayPositions, rayColors, inclusionEntry, inclusionExit, 0xff70d1, 0xffd0f0);
            appendSegment(rayPositions, rayColors, inclusionExit, exit.point, 0x9a7cff, 0xf6ffff);
          }
          if (showRay) {
            appendDensitySegment(densityPositions, densityColors, densityEnergy, densityPhases, entry, inclusionEntry, 0x5bd3e8, 0xa9f7ff, 28, 0.92);
            appendDensitySegment(densityPositions, densityColors, densityEnergy, densityPhases, inclusionEntry, inclusionExit, 0xff59c7, 0xffd0f0, 30, 0.82);
            appendDensitySegment(densityPositions, densityColors, densityEnergy, densityPhases, inclusionExit, exit.point, 0x9a7cff, 0xf4ffff, 28, 0.9);
          }
        } else {
          if (showRay) {
            appendSegment(rayPositions, rayColors, entry, exit.point, 0x6beaff, 0xf6ffff);
          }
          if (showRay) {
            appendDensitySegment(
              densityPositions, densityColors, densityEnergy, densityPhases, entry, exit.point,
              0x5bd3e8, 0xf4ffff, 52, 1,
            );
          }
        }
        const outwardNormal = fieldNormal(balls, k, exit.point);
        const outgoing = refract(
          finalHostDirection,
          outwardNormal.clone().negate(),
          settings.ior,
        );
        const unresolvedInternalDirection = finalHostDirection
          .clone()
          .reflect(outwardNormal.clone().negate());
        const pathThroughput = approximateOpticalPathThroughput(
          opticalScene.hostAbsorptionPerShapeUnit,
          opticalScene.inclusionAbsorptionPerShapeUnit,
          settings.ior,
          settings.inclusionIor,
          hostDistance,
          inclusionDistance,
          traversedInclusion,
        );
        const throughputRgb = outgoing
          ? pathThroughput.transmittedRgb
          : pathThroughput.exitIncidentRgb;
        const energy = (throughputRgb.r + throughputRgb.g + throughputRgb.b) / 3;
        if (baselineTracked && baselineHit) {
          recordMaterialInterfaceLoss(receiverAccumulator, throughputRgb, baselineHit);
        }
        const floorHit = outgoing ? intersectFloor(exit.point, outgoing, floorY) : null;
        const end = floorHit ?? exit.point.clone().addScaledVector(
          outgoing ?? unresolvedInternalDirection,
          bounds.radius * 2.2,
        );
        if (showRay) {
          appendSegment(rayPositions, rayColors, exit.point, end, 0xf2ffff, 0xffd779);
        }
        if (showRay) {
          appendDensitySegment(
            densityPositions,
            densityColors,
            densityEnergy,
            densityPhases,
            exit.point,
            end,
            0xd8ffff,
            0xffcf67,
            36,
            0.62 * energy,
          );
        }

        if (floorHit && outgoing) {
          const deviation = Math.min(1, outgoing.distanceTo(sampleLightDirection) / 1.2);
          if (baselineTracked) {
            depositReceiverFluxRgb(receiverAccumulator, floorHit, throughputRgb, baselineHit);
          }
          if (showRay) {
            appendCausticDeposit(
              causticPositions,
              causticEnergy,
              causticStretch,
              causticAngle,
              floorHit,
              (0.55 + (1 - deviation) * 0.45) * energy,
              deviation,
              Math.atan2(
                outgoing.z - sampleLightDirection.z,
                outgoing.x - sampleLightDirection.x,
              ),
              sequenceIndex,
            );
          }
        } else if (baselineTracked) {
          if (outgoing && baselineHit) {
            recordEscapedReceiverFlux(receiverAccumulator, throughputRgb, baselineHit);
          }
          else if (baselineHit) recordReflectedFlux(receiverAccumulator, throughputRgb, baselineHit);
        }
    }

    const field = finishReceiverFluxAccumulator(receiverAccumulator);
    if (publish) {
      const rayGeometry = new THREE.BufferGeometry();
      rayGeometry.setAttribute("position", new THREE.Float32BufferAttribute(rayPositions, 3));
      rayGeometry.setAttribute("color", new THREE.Float32BufferAttribute(rayColors, 3));
      this.rays = new THREE.LineSegments(rayGeometry, this.rayMaterial);
      this.rays.renderOrder = 20;
      this.group.add(this.rays);

      const densityGeometry = new THREE.BufferGeometry();
      densityGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(densityPositions, 3),
      );
      densityGeometry.setAttribute("color", new THREE.Float32BufferAttribute(densityColors, 3));
      densityGeometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(densityEnergy, 1));
      densityGeometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(densityPhases, 1));
      this.density = new THREE.Points(densityGeometry, this.densityMaterial);
      this.density.renderOrder = 19;
      this.group.add(this.density);

      const causticGeometry = new THREE.BufferGeometry();
      causticGeometry.setAttribute("position", new THREE.Float32BufferAttribute(causticPositions, 3));
      causticGeometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(causticEnergy, 1));
      causticGeometry.setAttribute("aStretch", new THREE.Float32BufferAttribute(causticStretch, 1));
      causticGeometry.setAttribute("aAngle", new THREE.Float32BufferAttribute(causticAngle, 1));
      this.caustics = new THREE.Points(causticGeometry, this.causticMaterial);
      this.caustics.renderOrder = 21;
      this.group.add(this.caustics);
      this.onCausticField?.(field);
      this.onTransportPending?.(false);
      this.applyDisplay(settings.opticalDisplay, settings.opticalView);
    }
    return { field, sampleCount };
  }

  private rebuildGpu(
    result: GpuOpticsResult,
    balls: Ball[],
    k: number,
    settings: OpticalSettings,
    options: ReceiverBuildOptions = {},
  ): ReceiverBuildResult {
    const publish = options.publish !== false;
    if (publish) this.clearGeometry();
    const rayPositions: number[] = [];
    const rayColors: number[] = [];
    const densityPositions: number[] = [];
    const densityColors: number[] = [];
    const densityEnergy: number[] = [];
    const densityPhases: number[] = [];
    const causticPositions: number[] = [];
    const causticEnergy: number[] = [];
    const causticStretch: number[] = [];
    const causticAngle: number[] = [];
    const daylight = resolveDaylight(settings);
    const lightDirection = new THREE.Vector3(
      daylight.propagationDirection.x,
      daylight.propagationDirection.y,
      daylight.propagationDirection.z,
    );
    const visualStride = Math.max(1, Math.ceil(result.sampleCount / 32768));
    const opticalScene = buildCloudOpticalScene(balls, k, settings);
    const bounds = fieldBounds(balls);
    const receiverAccumulator = createReceiverFluxAccumulator(
      receiverFieldSpec(
        opticalScene.scene.receiver.id,
        opticalScene.scene.receiver.pose.position.x,
        opticalScene.scene.receiver.pose.position.z,
        opticalSceneRevision(balls, k, settings),
        daylightRevision(settings),
      ),
      result.sampleCount,
      apertureArea(bounds.radius, settings.lightWidth),
      "webgpu",
    );
    let shownRays = 0;
    let visualHitCount = 0;
    let causticHitCount = 0;

    for (let sample = 0; sample < result.sampleCount; sample++) {
      const offset = gpuOpticsResultOffset(sample);
      const flagsOffset = offset + GPU_OPTICS_RESULT_OFFSETS.flags;
      const entryValid = result.values[flagsOffset] > 0.5;
      const exitValid = result.values[flagsOffset + 1] > 0.5;
      const floorValid = result.values[flagsOffset + 2] > 0.5;
      const energy = Math.max(0, Math.min(1, result.values[flagsOffset + 3]));
      const baselineOffset = offset + GPU_OPTICS_RESULT_OFFSETS.baseline;
      const baseline = result.values[baselineOffset + 3] > 0.5
        ? vectorFromResult(result.values, baselineOffset)
        : null;
      const throughputOffset = offset + GPU_OPTICS_RESULT_OFFSETS.throughputRgb;
      const throughputRgb: FluxRgb = {
        r: Math.max(0, Math.min(1, result.values[throughputOffset])),
        g: Math.max(0, Math.min(1, result.values[throughputOffset + 1])),
        b: Math.max(0, Math.min(1, result.values[throughputOffset + 2])),
      };
      const exit = exitValid
        ? vectorFromResult(result.values, offset + GPU_OPTICS_RESULT_OFFSETS.exit)
        : null;
      const floor = floorValid
        ? vectorFromResult(result.values, offset + GPU_OPTICS_RESULT_OFFSETS.floor)
        : null;
      const outgoing = exit && floor ? floor.clone().sub(exit).normalize() : null;

      const baselineTracked = entryValid
        ? depositAffectedBaseline(receiverAccumulator, baseline)
        : false;
      const outgoingValid = result.values[throughputOffset + 3] > 0.5;
      if (baselineTracked) {
        if (!exitValid) {
          if (baseline) recordUnresolvedPath(receiverAccumulator, baseline);
        } else {
          if (baseline) recordMaterialInterfaceLoss(receiverAccumulator, throughputRgb, baseline);
          if (!floorValid) {
            if (outgoingValid && baseline) {
              recordEscapedReceiverFlux(receiverAccumulator, throughputRgb, baseline);
            }
            else if (baseline) recordReflectedFlux(receiverAccumulator, throughputRgb, baseline);
          }
        }
      }

      // Every computed receiver hit contributes to the transport field.
      // visualStride only limits Analysis lines/points and never changes flux.
      if (floor && outgoing && baselineTracked) {
        depositReceiverFluxRgb(
          receiverAccumulator,
          floor,
          throughputRgb,
          baseline,
        );
      }

      if (!publish || sample % visualStride !== 0 || !entryValid) continue;
      visualHitCount++;
      const origin = vectorFromResult(
        result.values,
        offset + GPU_OPTICS_RESULT_OFFSETS.origin,
      );
      const entry = vectorFromResult(
        result.values,
        offset + GPU_OPTICS_RESULT_OFFSETS.entry,
      );

      if (shownRays < settings.opticalRayCount) {
        appendSegment(rayPositions, rayColors, origin, entry, 0x1c5368, 0x62e6ff);
        if (exit) {
          appendSegment(rayPositions, rayColors, entry, exit, 0x6beaff, 0xf6ffff);
          if (floor) {
            appendSegment(rayPositions, rayColors, exit, floor, 0xf2ffff, 0xffd779);
          }
        }
        shownRays++;
      }

      appendDensitySegment(
        densityPositions,
        densityColors,
        densityEnergy,
        densityPhases,
        origin,
        entry,
        0x164858,
        0x55cfe6,
        2,
        0.24,
      );
      if (exit) {
        appendDensitySegment(
          densityPositions,
          densityColors,
          densityEnergy,
          densityPhases,
          entry,
          exit,
          0x5bd3e8,
          0xf4ffff,
          4,
          1,
        );
        if (floor && outgoing) {
          causticHitCount++;
          appendDensitySegment(
            densityPositions,
            densityColors,
            densityEnergy,
            densityPhases,
            exit,
            floor,
            0xd8ffff,
            0xffcf67,
            3,
            0.62,
          );
          const deviation = Math.min(1, outgoing.distanceTo(lightDirection) / 1.2);
          appendCausticDeposit(
            causticPositions,
            causticEnergy,
            causticStretch,
            causticAngle,
            floor,
            energy,
            deviation,
            Math.atan2(
              outgoing.z - lightDirection.z,
              outgoing.x - lightDirection.x,
            ),
            sample + 1,
          );
        }
      }
    }

    const field = finishReceiverFluxAccumulator(receiverAccumulator);
    if (publish) {
      const rayGeometry = new THREE.BufferGeometry();
      rayGeometry.setAttribute("position", new THREE.Float32BufferAttribute(rayPositions, 3));
      rayGeometry.setAttribute("color", new THREE.Float32BufferAttribute(rayColors, 3));
      this.rays = new THREE.LineSegments(rayGeometry, this.rayMaterial);
      this.rays.renderOrder = 20;
      this.group.add(this.rays);

      const densityGeometry = new THREE.BufferGeometry();
      densityGeometry.setAttribute("position", new THREE.Float32BufferAttribute(densityPositions, 3));
      densityGeometry.setAttribute("color", new THREE.Float32BufferAttribute(densityColors, 3));
      densityGeometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(densityEnergy, 1));
      densityGeometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(densityPhases, 1));
      this.density = new THREE.Points(densityGeometry, this.densityMaterial);
      this.density.renderOrder = 19;
      this.group.add(this.density);

      const causticGeometry = new THREE.BufferGeometry();
      causticGeometry.setAttribute("position", new THREE.Float32BufferAttribute(causticPositions, 3));
      causticGeometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(causticEnergy, 1));
      causticGeometry.setAttribute("aStretch", new THREE.Float32BufferAttribute(causticStretch, 1));
      causticGeometry.setAttribute("aAngle", new THREE.Float32BufferAttribute(causticAngle, 1));
      this.caustics = new THREE.Points(causticGeometry, this.causticMaterial);
      this.caustics.renderOrder = 21;
      this.group.add(this.caustics);
      this.densityMaterial.uniforms.uSampleScale.value = Math.min(
        1,
        2048 / Math.max(1, visualHitCount),
      );
      this.causticMaterial.uniforms.uSampleScale.value = Math.min(
        1,
        64 / Math.max(1, causticHitCount),
      );
      this.onCausticField?.(field);
      this.onTransportPending?.(false);
      this.applyDisplay(settings.opticalDisplay, settings.opticalView);
    }
    return { field, sampleCount: result.sampleCount };
  }

  private applyDisplay(display: OpticalDisplay, view: OpticalView): void {
    if (this.rays) this.rays.visible = display === "both";
    if (this.density) this.density.visible = view === "analysis";
    if (this.caustics) this.caustics.visible = view === "analysis";
  }

  private publishEmptyCausticField(
    balls: Ball[],
    k: number,
    settings: OpticalSettings,
  ): void {
    this.publishCausticField(this.createEmptyCausticField(balls, k, settings), settings);
  }

  private createEmptyCausticField(
    balls: Ball[],
    k: number,
    settings: OpticalSettings,
  ): CausticField {
    const opticalScene = buildCloudOpticalScene(balls, k, settings);
    const accumulator = createReceiverFluxAccumulator(
      receiverFieldSpec(
        opticalScene.scene.receiver.id,
        opticalScene.scene.receiver.pose.position.x,
        opticalScene.scene.receiver.pose.position.z,
        opticalSceneRevision(balls, k, settings),
        daylightRevision(settings),
      ),
      0,
      0,
      "empty",
    );
    return finishReceiverFluxAccumulator(accumulator);
  }

  private publishCausticField(field: CausticField, settings: OpticalSettings): void {
    this.onCausticField?.(field);
    this.onTransportPending?.(false);
    this.applyDisplay(settings.opticalDisplay, settings.opticalView);
  }
}

function appendCausticDeposit(
  positions: number[],
  energies: number[],
  stretches: number[],
  angles: number[],
  center: THREE.Vector3,
  energy: number,
  deviation: number,
  angle: number,
  seed: number,
): void {
  const stretch = 1 + deviation * 2.4;
  const radius = 0.012 + deviation * 0.055;
  const count = 5;
  for (let index = 0; index < count; index++) {
    const phase = seed * 2.39996323 + index * 2.39996323;
    const distance = Math.sqrt((index + 0.35) / count) * radius;
    const localX = Math.cos(phase) * distance * stretch;
    const localZ = Math.sin(phase) * distance / Math.sqrt(stretch);
    positions.push(center.x + localX, center.y + 0.008, center.z + localZ);
    energies.push(energy * (0.72 + 0.28 * ((index + seed) % 3) / 2));
    stretches.push(stretch * (0.86 + index * 0.045));
    angles.push(angle + (index - 2) * 0.08);
  }
}

function receiverFieldSpec(
  receiverId: string,
  centerU: number,
  centerV: number,
  sceneRevision: string,
  lightRevision: string,
): ReceiverFieldSpec {
  return {
    receiverId,
    sceneRevision,
    lightRevision,
    width: RECEIVER_FIELD_RESOLUTION,
    height: RECEIVER_FIELD_RESOLUTION,
    minU: centerU - RECEIVER_FIELD_HALF_EXTENT,
    minV: centerV - RECEIVER_FIELD_HALF_EXTENT,
    sizeU: RECEIVER_FIELD_HALF_EXTENT * 2,
    sizeV: RECEIVER_FIELD_HALF_EXTENT * 2,
  };
}

function createReceiverFluxAccumulator(
  spec: ReceiverFieldSpec,
  emittedCount: number,
  emittedArea: number,
  source: CausticFieldDiagnostics["source"],
): ReceiverFluxAccumulator {
  const sampleFlux = emittedCount > 0 && emittedArea > 0
    ? emittedArea / emittedCount
    : 0;
  return {
    field: createReceiverTransportField(spec),
    diagnostics: {
      source,
      emittedSampleCount: emittedCount,
      spectralDepositCount: 0,
      inDomainDepositCount: 0,
      outOfDomainDepositCount: 0,
      sampleFlux,
      escapedDomainFluxRgb: { r: 0, g: 0, b: 0 },
      affectedSampleCount: 0,
      baselineDomainMissCount: 0,
      incidentAffectedFluxRgb: { r: 0, g: 0, b: 0 },
      materialInterfaceLossRgb: { r: 0, g: 0, b: 0 },
      reflectedFluxRgb: { r: 0, g: 0, b: 0 },
      escapedReceiverFluxRgb: { r: 0, g: 0, b: 0 },
      supportRejectedFluxRgb: { r: 0, g: 0, b: 0 },
      unresolvedLossRgb: { r: 0, g: 0, b: 0 },
      energyLedger: finalizeEnergyLedger({ incidentRgb: { r: 0, g: 0, b: 0 } }),
    },
  };
}

function depositAffectedBaseline(
  accumulator: ReceiverFluxAccumulator,
  baseline: THREE.Vector3 | null,
): boolean {
  accumulator.diagnostics.affectedSampleCount++;
  if (!baseline) {
    accumulator.diagnostics.baselineDomainMissCount++;
    return false;
  }
  const sampleFlux = accumulator.diagnostics.sampleFlux;
  const coverageResult = splatBilinearCoverageFlux(
    accumulator.field,
    baseline.x,
    baseline.z,
    sampleFlux,
  );
  if (coverageResult.escaped > 0) {
    accumulator.diagnostics.baselineDomainMissCount++;
    return false;
  }
  accumulator.diagnostics.incidentAffectedFluxRgb.r += sampleFlux;
  accumulator.diagnostics.incidentAffectedFluxRgb.g += sampleFlux;
  accumulator.diagnostics.incidentAffectedFluxRgb.b += sampleFlux;
  splatBilinearStraightFluxRgb(
    accumulator.field,
    baseline.x,
    baseline.z,
    { r: 1, g: 1, b: 1 },
    sampleFlux,
  );
  return true;
}

function addWeightedFlux(target: FluxRgb, throughput: FluxRgb, sampleFlux: number): void {
  target.r += throughput.r * sampleFlux;
  target.g += throughput.g * sampleFlux;
  target.b += throughput.b * sampleFlux;
}

function recordMaterialInterfaceLoss(
  accumulator: ReceiverFluxAccumulator,
  throughput: FluxRgb,
  baseline: THREE.Vector3,
): void {
  const loss = {
    r: Math.max(0, 1 - throughput.r),
    g: Math.max(0, 1 - throughput.g),
    b: Math.max(0, 1 - throughput.b),
  };
  addWeightedFlux(
    accumulator.diagnostics.materialInterfaceLossRgb,
    loss,
    accumulator.diagnostics.sampleFlux,
  );
  splatBilinearLossFluxRgb(
    accumulator.field,
    baseline.x,
    baseline.z,
    loss,
    accumulator.diagnostics.sampleFlux,
  );
}

function recordReflectedFlux(
  accumulator: ReceiverFluxAccumulator,
  throughput: FluxRgb,
  baseline: THREE.Vector3,
): void {
  addWeightedFlux(
    accumulator.diagnostics.reflectedFluxRgb,
    throughput,
    accumulator.diagnostics.sampleFlux,
  );
  splatBilinearLossFluxRgb(
    accumulator.field,
    baseline.x,
    baseline.z,
    throughput,
    accumulator.diagnostics.sampleFlux,
  );
}

function recordEscapedReceiverFlux(
  accumulator: ReceiverFluxAccumulator,
  throughput: FluxRgb,
  baseline: THREE.Vector3,
): void {
  addWeightedFlux(
    accumulator.diagnostics.escapedReceiverFluxRgb,
    throughput,
    accumulator.diagnostics.sampleFlux,
  );
  splatBilinearLossFluxRgb(
    accumulator.field,
    baseline.x,
    baseline.z,
    throughput,
    accumulator.diagnostics.sampleFlux,
  );
}

function recordUnresolvedPath(
  accumulator: ReceiverFluxAccumulator,
  baseline: THREE.Vector3,
): void {
  const sampleFlux = accumulator.diagnostics.sampleFlux;
  accumulator.diagnostics.unresolvedLossRgb.r += sampleFlux;
  accumulator.diagnostics.unresolvedLossRgb.g += sampleFlux;
  accumulator.diagnostics.unresolvedLossRgb.b += sampleFlux;
  splatBilinearLossFluxRgb(
    accumulator.field,
    baseline.x,
    baseline.z,
    { r: 1, g: 1, b: 1 },
    sampleFlux,
  );
}

function depositReceiverFluxRgb(
  accumulator: ReceiverFluxAccumulator,
  point: THREE.Vector3,
  throughputRgb: FluxRgb,
  baseline: THREE.Vector3 | null,
): void {
  accumulator.diagnostics.spectralDepositCount++;
  const result = splatBilinearFluxRgb(
    accumulator.field,
    point.x,
    point.z,
    throughputRgb,
    accumulator.diagnostics.sampleFlux,
  );
  if (result.escapedRgb.r + result.escapedRgb.g + result.escapedRgb.b > 0) {
    accumulator.diagnostics.outOfDomainDepositCount++;
    accumulator.diagnostics.escapedDomainFluxRgb.r += result.escapedRgb.r;
    accumulator.diagnostics.escapedDomainFluxRgb.g += result.escapedRgb.g;
    accumulator.diagnostics.escapedDomainFluxRgb.b += result.escapedRgb.b;
    if (baseline) {
      splatBilinearLossFluxRgb(
        accumulator.field,
        baseline.x,
        baseline.z,
        throughputRgb,
        accumulator.diagnostics.sampleFlux,
      );
    }
  } else if (result.depositedRgb.r + result.depositedRgb.g + result.depositedRgb.b > 0) {
    accumulator.diagnostics.inDomainDepositCount++;
  }
}

function finishReceiverFluxAccumulator(
  accumulator: ReceiverFluxAccumulator,
): CausticField {
  const reconstructionRadius = receiverReconstructionRadius(
    accumulator.diagnostics.emittedSampleCount,
  );
  const rawSupport = accumulator.field.geometricCoverage.slice();
  const blurredDeposits = blurFluxRgbEnergyNormalized(
    accumulator.field,
    reconstructionRadius,
  );
  const contained = applyShadowContainedSupport(
    blurredDeposits,
    rawSupport,
    reconstructionRadius + 1,
  );
  contained.field.geometricCoverage = blurCoverageEnergyNormalized(
    accumulator.field,
    reconstructionRadius,
  ).geometricCoverage;
  contained.field.lossFluxRgb = blurLossFluxRgbEnergyNormalized(
    accumulator.field,
    reconstructionRadius,
  ).lossFluxRgb;
  const depositedRgb = integrateFluxRgb(contained.field);
  const incidentRgb = accumulator.diagnostics.incidentAffectedFluxRgb;
  const escapedRgb = {
    r: accumulator.diagnostics.escapedDomainFluxRgb.r
      + accumulator.diagnostics.escapedReceiverFluxRgb.r,
    g: accumulator.diagnostics.escapedDomainFluxRgb.g
      + accumulator.diagnostics.escapedReceiverFluxRgb.g,
    b: accumulator.diagnostics.escapedDomainFluxRgb.b
      + accumulator.diagnostics.escapedReceiverFluxRgb.b,
  };
  const rejectedRgb = contained.rejectedFluxRgb;
  accumulator.diagnostics.supportRejectedFluxRgb = rejectedRgb;
  accumulator.diagnostics.energyLedger = finalizeEnergyLedger({
    incidentRgb,
    depositedRgb,
    absorbedRgb: accumulator.diagnostics.materialInterfaceLossRgb,
    reflectedRgb: accumulator.diagnostics.reflectedFluxRgb,
    escapedRgb,
    supportRejectedRgb: rejectedRgb,
    unresolvedLossRgb: accumulator.diagnostics.unresolvedLossRgb,
  });
  return Object.assign(contained.field, { diagnostics: accumulator.diagnostics });
}

function apertureArea(radius: number, width: number): number {
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  return 4 * 1.15 * 1.05 * safeRadius * safeRadius * safeWidth * safeWidth;
}

function daylightRevision(settings: OpticalSettings): string {
  const daylight = resolveDaylight(settings);
  return `${settings.daylightMode}:${settings.daylightDate}:${settings.daylightMinutes}:${settings.sunSize.toFixed(3)}:${settings.lightWidth.toFixed(3)}:${settings.opticalSeed}:${daylight.propagationDirection.x.toFixed(6)},${daylight.propagationDirection.y.toFixed(6)},${daylight.propagationDirection.z.toFixed(6)}`;
}

function vectorFromResult(values: Float32Array, offset: number): THREE.Vector3 {
  return new THREE.Vector3(values[offset], values[offset + 1], values[offset + 2]);
}

function fieldBounds(balls: Ball[]): { center: THREE.Vector3; radius: number; minY: number } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const ball of balls) {
    min.min(new THREE.Vector3(ball.x - ball.r, ball.y - ball.r, ball.z - ball.r));
    max.max(new THREE.Vector3(ball.x + ball.r, ball.y + ball.r, ball.z + ball.r));
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  return {
    center,
    radius: Math.max(0.1, center.distanceTo(max)),
    minY: min.y,
  };
}

function marchToSurface(
  balls: Ball[],
  k: number,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): THREE.Vector3 | null {
  let distanceAlongRay = 0;
  for (let iteration = 0; iteration < 128 && distanceAlongRay < maxDistance; iteration++) {
    const point = origin.clone().addScaledVector(direction, distanceAlongRay);
    const distance = fieldSdf(balls, k, point.x, point.y, point.z);
    if (distance < 0.002) return point;
    distanceAlongRay += Math.max(0.004, distance * 0.8);
  }
  return null;
}

function marchInside(
  balls: Ball[],
  k: number,
  entry: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): { point: THREE.Vector3; distance: number } | null {
  let distanceAlongRay = 0.018;
  let previous = entry.clone();
  for (let iteration = 0; iteration < 160 && distanceAlongRay < maxDistance; iteration++) {
    const point = entry.clone().addScaledVector(direction, distanceAlongRay);
    const distance = fieldSdf(balls, k, point.x, point.y, point.z);
    if (distance >= -0.002 && distanceAlongRay > 0.04) {
      return { point: refineExit(balls, k, previous, point), distance: distanceAlongRay };
    }
    previous = point;
    distanceAlongRay += Math.max(0.012, Math.abs(distance) * 0.72);
  }
  return null;
}

function refineExit(
  balls: Ball[],
  k: number,
  inside: THREE.Vector3,
  outside: THREE.Vector3,
): THREE.Vector3 {
  let a = inside.clone();
  let b = outside.clone();
  for (let iteration = 0; iteration < 7; iteration++) {
    const middle = a.clone().lerp(b, 0.5);
    const d = fieldSdf(balls, k, middle.x, middle.y, middle.z);
    if (d < 0) a = middle;
    else b = middle;
  }
  return a.lerp(b, 0.5);
}

function fieldNormal(balls: Ball[], k: number, point: THREE.Vector3): THREE.Vector3 {
  const epsilon = 0.006;
  return new THREE.Vector3(
    fieldSdf(balls, k, point.x + epsilon, point.y, point.z) -
      fieldSdf(balls, k, point.x - epsilon, point.y, point.z),
    fieldSdf(balls, k, point.x, point.y + epsilon, point.z) -
      fieldSdf(balls, k, point.x, point.y - epsilon, point.z),
    fieldSdf(balls, k, point.x, point.y, point.z + epsilon) -
      fieldSdf(balls, k, point.x, point.y, point.z - epsilon),
  ).normalize();
}

function refract(incident: THREE.Vector3, normal: THREE.Vector3, eta: number): THREE.Vector3 | null {
  const cosine = -Math.max(-1, Math.min(1, incident.dot(normal)));
  const discriminant = 1 - eta * eta * (1 - cosine * cosine);
  if (discriminant < 0) return null;
  return incident
    .clone()
    .multiplyScalar(eta)
    .addScaledVector(normal, eta * cosine - Math.sqrt(discriminant))
    .normalize();
}

function raySphereInterval(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): { near: number; far: number } | null {
  const offset = origin.clone().sub(center);
  const halfB = offset.dot(direction);
  const c = offset.lengthSq() - radius * radius;
  const discriminant = halfB * halfB - c;
  if (!Number.isFinite(discriminant) || discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -halfB - root;
  const far = -halfB + root;
  return far > 0 ? { near, far } : null;
}

export function approximateOpticalPathThroughput(
  hostAbsorption: FluxRgb,
  inclusionAbsorption: FluxRgb,
  hostIor: number,
  inclusionIor: number,
  hostDistance: number,
  inclusionDistance: number,
  traversedInclusion: boolean,
): { exitIncidentRgb: FluxRgb; transmittedRgb: FluxRgb } {
  const hostInterface = normalInterfaceTransmission(1, hostIor);
  const inclusionInterface = traversedInclusion
    ? normalInterfaceTransmission(hostIor, inclusionIor)
    : 1;
  const entryFactor = hostInterface * inclusionInterface * inclusionInterface;
  const safeHostDistance = Math.max(0, hostDistance);
  const safeInclusionDistance = traversedInclusion ? Math.max(0, inclusionDistance) : 0;
  const exitIncidentRgb = {
    r: Math.max(0, Math.min(1, Math.exp(
      -Math.max(0, hostAbsorption.r) * safeHostDistance
      - Math.max(0, inclusionAbsorption.r) * safeInclusionDistance,
    ) * entryFactor)),
    g: Math.max(0, Math.min(1, Math.exp(
      -Math.max(0, hostAbsorption.g) * safeHostDistance
      - Math.max(0, inclusionAbsorption.g) * safeInclusionDistance,
    ) * entryFactor)),
    b: Math.max(0, Math.min(1, Math.exp(
      -Math.max(0, hostAbsorption.b) * safeHostDistance
      - Math.max(0, inclusionAbsorption.b) * safeInclusionDistance,
    ) * entryFactor)),
  };
  return {
    exitIncidentRgb,
    transmittedRgb: {
      r: exitIncidentRgb.r * hostInterface,
      g: exitIncidentRgb.g * hostInterface,
      b: exitIncidentRgb.b * hostInterface,
    },
  };
}

function normalInterfaceTransmission(iorA: number, iorB: number): number {
  if (!Number.isFinite(iorA) || !Number.isFinite(iorB) || iorA <= 0 || iorB <= 0) return 1;
  const reflection = Math.pow((iorA - iorB) / (iorA + iorB), 2);
  return 1 - reflection;
}

function intersectFloor(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  floorY: number,
): THREE.Vector3 | null {
  if (direction.y >= -0.001) return null;
  const distance = (floorY - origin.y) / direction.y;
  return distance > 0 ? origin.clone().addScaledVector(direction, distance) : null;
}

function appendSegment(
  positions: number[],
  colors: number[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  startColor: number,
  endColor: number,
): void {
  positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
  const a = new THREE.Color(startColor);
  const b = new THREE.Color(endColor);
  colors.push(a.r, a.g, a.b, b.r, b.g, b.b);
}

function appendDensitySegment(
  positions: number[],
  colors: number[],
  energies: number[],
  phases: number[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  startColor: number,
  endColor: number,
  samples: number,
  energy: number,
): void {
  const a = new THREE.Color(startColor);
  const b = new THREE.Color(endColor);
  const direction = end.clone().sub(start);
  for (let index = 0; index < samples; index++) {
    const t = (index + 0.5) / samples;
    const point = start.clone().addScaledVector(direction, t);
    const seed = positions.length / 3 + index * 17;
    const jitter = 0.045 + energy * 0.025;
    point.x += signedHash(seed * 1.13) * jitter;
    point.y += signedHash(seed * 1.71) * jitter;
    point.z += signedHash(seed * 2.07) * jitter;
    positions.push(point.x, point.y, point.z);
    const color = a.clone().lerp(b, t);
    colors.push(color.r, color.g, color.b);
    energies.push(energy * (0.82 + 0.18 * Math.sin(t * Math.PI)));
    phases.push(hash(seed * 3.19));
  }
}

function hash(value: number): number {
  return Math.abs(Math.sin(value * 12.9898 + 78.233) * 43758.5453) % 1;
}

function signedHash(value: number): number {
  return hash(value) * 2 - 1;
}

function shapeSignature(balls: Ball[], k: number): string {
  return `${k.toFixed(4)}|${balls
    .map((ball) => `${ball.id}:${ball.x.toFixed(3)},${ball.y.toFixed(3)},${ball.z.toFixed(3)},${ball.r.toFixed(3)}`)
    .join("|")}`;
}

function opticalSceneRevision(
  balls: Ball[],
  k: number,
  settings: OpticalSettings,
): string {
  return `${shapeSignature(balls, k)}:${settings.hostPreset}:${settings.hostTransmissionColor}:${settings.absorption.toFixed(4)}:${settings.ior.toFixed(4)}:${settings.inclusionEnabled ? 1 : 0}:${settings.inclusionIor.toFixed(4)}:${settings.inclusionTransmissionColor}:${settings.inclusionAbsorption.toFixed(4)}:${settings.inclusionOffsetX.toFixed(4)},${settings.inclusionOffsetY.toFixed(4)},${settings.inclusionOffsetZ.toFixed(4)}:${settings.inclusionRadius.toFixed(4)}`;
}

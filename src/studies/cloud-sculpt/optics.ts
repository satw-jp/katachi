import * as THREE from "three";
import { fieldSdf, type Ball } from "./field.ts";
import { buildCloudOpticalScene } from "./opticalSceneAdapter.ts";
import { resolveDaylight, type DaylightMode } from "./daylight.ts";
import {
  blurFluxRgbEnergyNormalized,
  createReceiverTransportField,
  splatBilinearFluxRgb,
  type ReceiverFieldSpec,
  type ReceiverTransportField,
  type FluxRgb,
} from "./receiverTransport.ts";
import {
  WebGpuOpticsEngine,
  type GpuOpticsResult,
  type OpticsComputeKind,
} from "./opticsGpu.ts";

export type HikariPhenomenon = "flow" | "optics";
export type OpticalMaterial = "water" | "glass";
export type OpticalHostPreset = "clear" | "amber" | "dark";
export type OpticalDisplay = "density" | "both";
export type OpticalView = "natural" | "analysis";
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
}

export type CausticField = ReceiverTransportField & {
  diagnostics: CausticFieldDiagnostics;
};

interface CausticSample {
  x: number;
  z: number;
  energy: number;
  color: [number, number, number];
}

interface ReceiverFluxAccumulator {
  field: ReceiverTransportField;
  diagnostics: CausticFieldDiagnostics;
}

// A stable 32 × 32 bounded receiver study area captures most morning/evening
// projections without reframing the image. Escaped-domain diagnostics expose
// remaining truncation. 512² retains the previous 1/16 shape-unit texel size.
const RECEIVER_FIELD_RESOLUTION = 512;
const RECEIVER_FIELD_HALF_EXTENT = 16;
const RECEIVER_FIELD_BLUR_RADIUS = 3;

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
  inclusionEnabled: boolean;
  inclusionIor: number;
  inclusionAbsorption: number;
  inclusionOffsetX: number;
  inclusionOffsetY: number;
  inclusionOffsetZ: number;
  inclusionRadius: number;
  opticalDisplay: OpticalDisplay;
  opticalView: OpticalView;
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
  private onCausticField: ((field: CausticField) => void) | null;
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
    } = {},
  ) {
    this.gpu = new WebGpuOpticsEngine(options.disableWebGpu !== true);
    this.onCausticField = options.onCausticField ?? null;
    this.group.visible = false;
    this.group.renderOrder = 20;
    scene.add(this.group);
    this.gpu.ready().then((available) => {
      if (available && this.latestSettings && resolveDaylight(this.latestSettings).aboveHorizon) {
        this.startGpuRebuild(this.latestBalls, this.latestK, this.latestSettings);
      }
    });
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(balls: Ball[], k: number, settings: OpticalSettings): void {
    this.latestBalls = balls;
    this.latestK = k;
    this.latestSettings = { ...settings };
    this.causticMaterial.uniforms.uStrength.value = settings.causticStrength;
    this.causticMaterial.uniforms.uNatural.value = settings.opticalView === "natural" ? 1 : 0;
    const daylight = resolveDaylight(settings);
    this.sunBelowHorizon = !daylight.aboveHorizon;
    const signature = `${shapeSignature(balls, k)}:${settings.hostPreset}:${settings.absorption.toFixed(3)}:${settings.ior.toFixed(3)}:${settings.inclusionEnabled ? 1 : 0}:${settings.inclusionIor.toFixed(3)}:${settings.inclusionAbsorption.toFixed(3)}:${settings.inclusionOffsetX.toFixed(3)},${settings.inclusionOffsetY.toFixed(3)},${settings.inclusionOffsetZ.toFixed(3)}:${settings.inclusionRadius.toFixed(3)}:${settings.rainbowModel}:${settings.dispersion.toFixed(3)}:${settings.dispersionMode}:${settings.stressAmount.toFixed(3)}:${settings.polarization.toFixed(3)}:${settings.daylightMode}:${settings.daylightDate}:${settings.daylightMinutes}:${settings.lightAngle.toFixed(2)}:${settings.lightWidth.toFixed(2)}:${settings.opticalRayCount}:${settings.opticalSampleCount}:${settings.opticalSeed}`;
    if (signature !== this.signature) {
      this.signature = signature;
      if (this.sunBelowHorizon) {
        this.requestId++;
        this.clearGeometry();
        this.publishEmptyCausticField();
      } else {
        const status = this.gpu.getStatus();
        if (status.kind === "webgpu" || status.kind === "computing") {
          this.startGpuRebuild(balls, k, settings);
        } else {
          const cpuSampleCount = this.rebuildCpu(balls, k, settings);
          this.gpu.setCpuFallback(cpuSampleCount);
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

  private startGpuRebuild(balls: Ball[], k: number, settings: OpticalSettings): void {
    const requestId = ++this.requestId;
    void this.gpu.compute(balls, k, settings).then((result) => {
      if (requestId !== this.requestId) return;
      if (!result) {
        this.rebuildCpu(balls, k, settings);
        return;
      }
      this.rebuildGpu(result, balls, k, settings);
    });
  }

  private clearGeometry(): void {
    if (this.rays) {
      this.rays.geometry.dispose();
      this.group.remove(this.rays);
    }
    if (this.caustics) {
      this.caustics.geometry.dispose();
      this.group.remove(this.caustics);
    }
    if (this.density) {
      this.density.geometry.dispose();
      this.group.remove(this.density);
    }
  }

  private rebuildCpu(balls: Ball[], k: number, settings: OpticalSettings): number {
    this.clearGeometry();
    this.causticMaterial.uniforms.uSampleScale.value = 1;
    this.densityMaterial.uniforms.uSampleScale.value = 1;

    if (balls.length === 0) {
      this.rays = null;
      this.density = null;
      this.caustics = null;
      this.publishEmptyCausticField();
      return 0;
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
    const causticFieldSamples: CausticSample[] = [];
    const visibleRayCount = Math.max(8, Math.round(settings.opticalRayCount));
    // Safe/CPU mode needs enough transport samples to form a stable field,
    // while visible Analysis geometry remains bounded by opticalRayCount.
    const sampleCount = Math.min(
      2048,
      Math.max(visibleRayCount, Math.round(settings.opticalSampleCount / 16)),
    );

    for (let emitted = 0; emitted < sampleCount; emitted++) {
        const sequenceIndex = emitted + 1;
        const u = ((0.5 + sequenceIndex * 0.754877666) % 1) * 2 - 1;
        const v = ((0.5 + sequenceIndex * 0.569840296) % 1) * 2 - 1;
        const showRay = emitted < visibleRayCount;
        const origin = originCenter
          .clone()
          .addScaledVector(basisU, u * bounds.radius * 1.15 * settings.lightWidth)
          .addScaledVector(basisV, v * bounds.radius * 1.05 * settings.lightWidth);
        const entry = marchToSurface(balls, k, origin, lightDirection, bounds.radius * 5);

        if (!entry) {
          const floorHit = intersectFloor(origin, lightDirection, floorY);
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

        const entryNormal = fieldNormal(balls, k, entry);
        const refractedInside = refract(lightDirection, entryNormal, 1 / settings.ior);
        // Air-to-host should not produce TIR. If numerical/invalid geometry
        // does, do not turn the reflected fallback into receiver energy.
        if (!refractedInside) {
          if (showRay) {
            appendSegment(rayPositions, rayColors, origin, entry, 0x1c5368, 0x62e6ff);
          }
          continue;
        }
        const insideDirection = refractedInside;
        let exit = marchInside(balls, k, entry, insideDirection, bounds.radius * 4);
        let traversedInclusion = false;
        let inclusionEntry: THREE.Vector3 | null = null;
        let inclusionExit: THREE.Vector3 | null = null;
        let finalHostDirection = insideDirection;
        let hostDistance = exit?.distance ?? 0;
        let inclusionDistance = 0;

        // This deliberately traces only the first supported analytic sphere.
        // Any TIR or incomplete nested path discards this attempt and retains
        // the exact host-only exit/direction above.
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
                    bounds.radius * 4,
                  );
                  if (nestedExit) {
                    traversedInclusion = true;
                    inclusionEntry = candidateEntry;
                    inclusionExit = candidateExit;
                    exit = nestedExit;
                    finalHostDirection = returnedHostDirection;
                    hostDistance = interval.near + nestedExit.distance + 0.008;
                    inclusionDistance = candidateEntry.distanceTo(candidateExit);
                  }
                }
              }
            }
          }
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
        const energy = approximateOpticalEnergy(
          settings,
          hostDistance,
          inclusionDistance,
          traversedInclusion,
        );
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
          const deviation = Math.min(1, outgoing.distanceTo(lightDirection) / 1.2);
          appendSpectralCausticSamples(
            causticFieldSamples,
            floorHit,
            energy,
            outgoing,
            lightDirection,
            settings.dispersion,
            settings.dispersionMode,
            settings.rainbowModel,
          );
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
                outgoing.z - lightDirection.z,
                outgoing.x - lightDirection.x,
              ),
              sequenceIndex,
            );
          }
        }
    }

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
    this.publishCausticField(
      causticFieldSamples,
      receiverFieldSpec(
        opticalScene.scene.receiver.id,
        opticalScene.scene.receiver.pose.position.x,
        opticalScene.scene.receiver.pose.position.z,
        shapeSignature(balls, k),
        daylightRevision(settings),
      ),
      sampleCount,
      apertureArea(bounds.radius, settings.lightWidth),
      "cpu",
    );
    this.applyDisplay(settings.opticalDisplay, settings.opticalView);
    return sampleCount;
  }

  private rebuildGpu(
    result: GpuOpticsResult,
    balls: Ball[],
    k: number,
    settings: OpticalSettings,
  ): void {
    this.clearGeometry();
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
        shapeSignature(balls, k),
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
      const offset = sample * 20;
      const entryValid = result.values[offset + 16] > 0.5;
      const exitValid = result.values[offset + 17] > 0.5;
      const floorValid = result.values[offset + 18] > 0.5;
      const energy = Math.max(0, Math.min(1, result.values[offset + 19]));
      const exit = exitValid ? vectorFromResult(result.values, offset + 8) : null;
      const floor = floorValid ? vectorFromResult(result.values, offset + 12) : null;
      const outgoing = exit && floor ? floor.clone().sub(exit).normalize() : null;

      // Every computed receiver hit contributes to the transport field.
      // visualStride only limits Analysis lines/points and never changes flux.
      if (floor && outgoing) {
        splatSpectralCausticSamples(
          receiverAccumulator,
          floor,
          energy,
          outgoing,
          lightDirection,
          settings.dispersion,
          settings.dispersionMode,
          settings.rainbowModel,
        );
      }

      if (sample % visualStride !== 0 || !entryValid) continue;
      visualHitCount++;
      const origin = vectorFromResult(result.values, offset);
      const entry = vectorFromResult(result.values, offset + 4);

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
    this.onCausticField?.(finishReceiverFluxAccumulator(receiverAccumulator));
    this.applyDisplay(settings.opticalDisplay, settings.opticalView);
  }

  private applyDisplay(display: OpticalDisplay, view: OpticalView): void {
    if (this.rays) this.rays.visible = display === "both";
    if (this.density) this.density.visible = view === "analysis";
    if (this.caustics) this.caustics.visible = view === "analysis";
  }

  private publishCausticField(
    samples: CausticSample[],
    spec: ReceiverFieldSpec,
    emittedCount: number,
    emittedArea: number,
    source: CausticFieldDiagnostics["source"],
  ): void {
    this.onCausticField?.(
      buildReceiverFluxField(samples, spec, emittedCount, emittedArea, source),
    );
  }

  private publishEmptyCausticField(): void {
    this.onCausticField?.(
      buildReceiverFluxField(
        [],
        receiverFieldSpec("legacy-floor", 0, 0, "empty-scene", "no-direct-light"),
        0,
        0,
        "empty",
      ),
    );
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

function appendSpectralCausticSamples(
  samples: CausticSample[],
  floor: THREE.Vector3,
  energy: number,
  outgoing: THREE.Vector3,
  lightDirection: THREE.Vector3,
  dispersion: number,
  mode: OpticalDispersionMode,
  rainbowModel: OpticalRainbowModel,
): void {
  const deltaX = outgoing.x - lightDirection.x;
  const deltaZ = outgoing.z - lightDirection.z;
  const length = Math.hypot(deltaX, deltaZ);
  const directionX = length > 1e-5 ? deltaX / length : 1;
  const directionZ = length > 1e-5 ? deltaZ / length : 0;
  const deviation = Math.min(1, outgoing.distanceTo(lightDirection) / 1.2);
  // Global preserves the expressive visualizer. Local separates wavelengths
  // only where the path has bent strongly enough to reveal a spectral fringe.
  const localFactor =
    mode === "local"
      ? smoothstepNumber(0.18, 0.56, deviation)
      : 1;
  const globalShift = dispersion * (0.06 + deviation * 0.5);
  const localShift = dispersion * (0.024 + deviation * 0.26) * localFactor;
  const shift =
    rainbowModel === "stress"
      ? 0
      : mode === "local"
        ? localShift
        : globalShift;

  // Each wavelength band redistributes one ray's RGB flux. Per-channel
  // weights sum to one, so enabling dispersion cannot create energy.
  samples.push(
    {
      x: floor.x - directionX * shift,
      z: floor.z - directionZ * shift,
      energy,
      color: [...SPECTRAL_CAUSTIC_COLORS[0]],
    },
    {
      x: floor.x - directionX * shift * 0.5,
      z: floor.z - directionZ * shift * 0.5,
      energy,
      color: [...SPECTRAL_CAUSTIC_COLORS[1]],
    },
    {
      x: floor.x,
      z: floor.z,
      energy,
      color: [...SPECTRAL_CAUSTIC_COLORS[2]],
    },
    {
      x: floor.x + directionX * shift * 0.5,
      z: floor.z + directionZ * shift * 0.5,
      energy,
      color: [...SPECTRAL_CAUSTIC_COLORS[3]],
    },
    {
      x: floor.x + directionX * shift,
      z: floor.z + directionZ * shift,
      energy,
      color: [...SPECTRAL_CAUSTIC_COLORS[4]],
    },
  );
}

function splatSpectralCausticSamples(
  accumulator: ReceiverFluxAccumulator,
  floor: THREE.Vector3,
  energy: number,
  outgoing: THREE.Vector3,
  lightDirection: THREE.Vector3,
  dispersion: number,
  mode: OpticalDispersionMode,
  rainbowModel: OpticalRainbowModel,
): void {
  const deltaX = outgoing.x - lightDirection.x;
  const deltaZ = outgoing.z - lightDirection.z;
  const length = Math.hypot(deltaX, deltaZ);
  const directionX = length > 1e-5 ? deltaX / length : 1;
  const directionZ = length > 1e-5 ? deltaZ / length : 0;
  const deviation = Math.min(1, outgoing.distanceTo(lightDirection) / 1.2);
  const localFactor = mode === "local"
    ? smoothstepNumber(0.18, 0.56, deviation)
    : 1;
  const globalShift = dispersion * (0.06 + deviation * 0.5);
  const localShift = dispersion * (0.024 + deviation * 0.26) * localFactor;
  const shift = rainbowModel === "stress"
    ? 0
    : mode === "local"
      ? localShift
      : globalShift;
  const offsets = [-1, -0.5, 0, 0.5, 1] as const;
  for (let index = 0; index < SPECTRAL_CAUSTIC_COLORS.length; index++) {
    depositReceiverFlux(
      accumulator,
      floor.x + directionX * shift * offsets[index],
      floor.z + directionZ * shift * offsets[index],
      energy,
      SPECTRAL_CAUSTIC_COLORS[index],
    );
  }
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
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

function buildReceiverFluxField(
  samples: CausticSample[],
  spec: ReceiverFieldSpec,
  emittedCount: number,
  emittedArea: number,
  source: CausticFieldDiagnostics["source"],
): CausticField {
  const accumulator = createReceiverFluxAccumulator(spec, emittedCount, emittedArea, source);
  for (const sample of samples) {
    depositReceiverFlux(
      accumulator,
      sample.x,
      sample.z,
      sample.energy,
      sample.color,
    );
  }
  return finishReceiverFluxAccumulator(accumulator);
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
    },
  };
}

function depositReceiverFlux(
  accumulator: ReceiverFluxAccumulator,
  x: number,
  z: number,
  energy: number,
  color: readonly [number, number, number],
): void {
  accumulator.diagnostics.spectralDepositCount++;
  const result = splatBilinearFluxRgb(
    accumulator.field,
    x,
    z,
    { r: energy * color[0], g: energy * color[1], b: energy * color[2] },
    accumulator.diagnostics.sampleFlux,
  );
  if (result.escapedRgb.r + result.escapedRgb.g + result.escapedRgb.b > 0) {
    accumulator.diagnostics.outOfDomainDepositCount++;
    accumulator.diagnostics.escapedDomainFluxRgb.r += result.escapedRgb.r;
    accumulator.diagnostics.escapedDomainFluxRgb.g += result.escapedRgb.g;
    accumulator.diagnostics.escapedDomainFluxRgb.b += result.escapedRgb.b;
  } else if (result.depositedRgb.r + result.depositedRgb.g + result.depositedRgb.b > 0) {
    accumulator.diagnostics.inDomainDepositCount++;
  }
}

function finishReceiverFluxAccumulator(
  accumulator: ReceiverFluxAccumulator,
): CausticField {
  return Object.assign(
    blurFluxRgbEnergyNormalized(accumulator.field, RECEIVER_FIELD_BLUR_RADIUS),
    { diagnostics: accumulator.diagnostics },
  );
}

function apertureArea(radius: number, width: number): number {
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  return 4 * 1.15 * 1.05 * safeRadius * safeRadius * safeWidth * safeWidth;
}

function daylightRevision(settings: OpticalSettings): string {
  const daylight = resolveDaylight(settings);
  return `${settings.daylightMode}:${settings.daylightDate}:${settings.daylightMinutes}:${daylight.propagationDirection.x.toFixed(6)},${daylight.propagationDirection.y.toFixed(6)},${daylight.propagationDirection.z.toFixed(6)}`;
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

function approximateOpticalEnergy(
  settings: OpticalSettings,
  hostDistance: number,
  inclusionDistance: number,
  traversedInclusion: boolean,
): number {
  const baseHostAbsorption = Math.max(0, settings.absorption);
  const hostAbsorption = settings.hostPreset === "amber"
    ? baseHostAbsorption * (0.05 + 0.38 + 0.92) / 3
    : settings.hostPreset === "dark"
      ? baseHostAbsorption * (0.72 + 1.45 + 0.42) / 3
      : baseHostAbsorption * (0.06 + 0.04 + 0.025) / 3;
  const hostInterface = normalInterfaceTransmission(1, settings.ior);
  const inclusionInterface = traversedInclusion
    ? normalInterfaceTransmission(settings.ior, settings.inclusionIor)
    : 1;
  // A scalar preview approximation: averaged preset absorption and normal
  // incidence interface losses. It is intentionally not a calibrated energy model.
  return Math.max(
    0,
    Math.min(
      1,
      Math.exp(-hostAbsorption * Math.max(0, hostDistance) - Math.max(0, settings.inclusionAbsorption) * Math.max(0, inclusionDistance))
        * hostInterface * hostInterface
        * inclusionInterface * inclusionInterface,
    ),
  );
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

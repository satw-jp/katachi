import * as THREE from "three";
import type { RuntimeShape } from "../../lib/hikari/index.ts";
import type { Ball } from "./field.ts";
import {
  buildLightDrawingField,
  type LightDrawingDomain,
  type LightDrawingField,
  type LightDrawingSample,
} from "./lightDrawingField.ts";
import {
  WebGpuOpticsEngine,
  type GpuOpticsResult,
  type OpticsComputeKind,
} from "./opticsGpu.ts";

export type HikariPhenomenon = "flow" | "optics";
export type OpticalMaterial = "water" | "glass";
export type OpticalDisplay = "density" | "both";
export type OpticalView = "natural" | "analysis";
export type OpticalColorMode = "color" | "mono";
export type OpticalDispersionMode = "global" | "local";
export type OpticalRainbowModel = "prism" | "stress" | "both";

export type CausticField = LightDrawingField;
type CausticSample = LightDrawingSample;

export interface FocusedRayTrace {
  entry: THREE.Vector3 | null;
  insideDirection: THREE.Vector3 | null;
  exit: { point: THREE.Vector3; distance: number } | null;
  outgoing: THREE.Vector3 | null;
  floorHit: THREE.Vector3 | null;
}

export interface OpticalSettings {
  phenomenon: HikariPhenomenon;
  opticalMaterial: OpticalMaterial;
  opticalDisplay: OpticalDisplay;
  opticalView: OpticalView;
  ior: number;
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

export interface OpticsShapeSource {
  runtime: RuntimeShape;
  /** Present only while a backend still requires the original metaball uniforms. */
  gpuMetaballs?: {
    balls: Ball[];
    smoothK: number;
  };
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
  private latestSource: OpticsShapeSource | null = null;
  private latestSettings: OpticalSettings | null = null;
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
      if (available && this.latestSource?.gpuMetaballs && this.latestSettings) {
        this.startGpuRebuild(this.latestSource, this.latestSettings);
      }
    });
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(source: OpticsShapeSource | null, settings: OpticalSettings): void {
    this.latestSource = source;
    this.latestSettings = { ...settings };
    this.causticMaterial.uniforms.uStrength.value = settings.causticStrength;
    this.causticMaterial.uniforms.uNatural.value = settings.opticalView === "natural" ? 1 : 0;
    const shapeRevision = source?.runtime.asset.revision ?? "empty";
    const signature = `${shapeRevision}:${settings.ior.toFixed(3)}:${settings.rainbowModel}:${settings.dispersion.toFixed(3)}:${settings.dispersionMode}:${settings.stressAmount.toFixed(3)}:${settings.polarization.toFixed(3)}:${settings.lightAngle.toFixed(2)}:${settings.lightWidth.toFixed(2)}:${settings.opticalRayCount}:${settings.opticalSampleCount}:${settings.opticalSeed}`;
    if (signature !== this.signature) {
      this.signature = signature;
      const status = this.gpu.getStatus();
      if (
        source?.gpuMetaballs
        && (status.kind === "webgpu" || status.kind === "computing" || this.gpu.isAvailable())
      ) {
        this.startGpuRebuild(source, settings);
      } else {
        this.requestId++;
        const cpuSampleCount = this.rebuildCpu(source?.runtime ?? null, settings);
        this.gpu.setCpuFallback(
          cpuSampleCount,
          source && !source.gpuMetaballs ? "汎用形状 — CPUプレビュー" : "CPUプレビュー",
          source !== null && !source.gpuMetaballs,
        );
      }
    }
    this.applyDisplay(settings.opticalDisplay, settings.opticalView);
  }

  animate(now: number): void {
    this.densityMaterial.uniforms.uTime.value = now * 0.001;
  }

  getComputeStatus(): { text: string; kind: OpticsComputeKind } {
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

  private startGpuRebuild(source: OpticsShapeSource, settings: OpticalSettings): void {
    const gpuSource = source.gpuMetaballs;
    if (!gpuSource) {
      const cpuSampleCount = this.rebuildCpu(source.runtime, settings);
      this.gpu.setCpuFallback(cpuSampleCount, "汎用形状 — CPUプレビュー", true);
      return;
    }
    const requestId = ++this.requestId;
    void this.gpu.compute(gpuSource.balls, gpuSource.smoothK, settings).then((result) => {
      if (requestId !== this.requestId) return;
      if (!result) {
        this.rebuildCpu(source.runtime, settings);
        return;
      }
      this.rebuildGpu(result, settings, fieldBounds(source.runtime));
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

  private rebuildCpu(shape: RuntimeShape | null, settings: OpticalSettings): number {
    this.clearGeometry();
    this.causticMaterial.uniforms.uSampleScale.value = 1;
    this.densityMaterial.uniforms.uSampleScale.value = 1;

    if (!shape) {
      this.rays = null;
      this.density = null;
      this.caustics = null;
      this.publishCausticField([], { minX: -1, minZ: -1, sizeX: 2, sizeZ: 2 }, 1);
      return 0;
    }

    const bounds = fieldBounds(shape);
    const lightDirection = directionFromAngle(settings.lightAngle);
    const basisU = new THREE.Vector3().crossVectors(lightDirection, new THREE.Vector3(0, 1, 0));
    if (basisU.lengthSq() < 0.001) basisU.set(1, 0, 0);
    basisU.normalize();
    const basisV = new THREE.Vector3().crossVectors(basisU, lightDirection).normalize();
    const originCenter = bounds.center.clone().addScaledVector(lightDirection, -bounds.radius * 2.6);
    const floorY = bounds.minY - Math.max(0.45, bounds.radius * 0.28);
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
    // Diagnostic ray lines and receiver-field convergence are separate. The
    // previous CPU fallback silently traced only the visible rays, so its
    // light drawing could never approach the requested 16k+ sample field.
    const sampleCount = Math.max(visibleRayCount, Math.round(settings.opticalSampleCount));

    for (let emitted = 0; emitted < sampleCount; emitted++) {
        const sequenceIndex = emitted + 1;
        const u = ((0.5 + sequenceIndex * 0.754877666) % 1) * 2 - 1;
        const v = ((0.5 + sequenceIndex * 0.569840296) % 1) * 2 - 1;
        const showRay = emitted < visibleRayCount;
        const origin = originCenter
          .clone()
          .addScaledVector(basisU, u * bounds.radius * 1.15 * settings.lightWidth)
          .addScaledVector(basisV, v * bounds.radius * 1.05 * settings.lightWidth);
        const entry = marchToSurface(shape, origin, lightDirection, bounds.radius * 5);

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

        const entryNormal = fieldNormal(shape, entry);
        const insideDirection =
          refract(lightDirection, entryNormal, 1 / settings.ior) ??
          lightDirection.clone().reflect(entryNormal);
        const exit = marchInside(shape, entry, insideDirection, bounds.radius * 4);
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

        if (showRay) {
          appendSegment(rayPositions, rayColors, entry, exit.point, 0x6beaff, 0xf6ffff);
        }
        if (showRay) {
          appendDensitySegment(
            densityPositions,
            densityColors,
            densityEnergy,
            densityPhases,
            entry,
            exit.point,
            0x5bd3e8,
            0xf4ffff,
            52,
            1,
          );
        }
        const outwardNormal = fieldNormal(shape, exit.point);
        const outgoing =
          refract(insideDirection, outwardNormal.clone().negate(), settings.ior) ??
          insideDirection.clone().reflect(outwardNormal.clone().negate());
        const floorHit = intersectFloor(exit.point, outgoing, floorY);
        const end = floorHit ?? exit.point.clone().addScaledVector(outgoing, bounds.radius * 2.2);
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
            0.62,
          );
        }

        if (floorHit) {
          const deviation = Math.min(1, outgoing.distanceTo(lightDirection) / 1.2);
          appendSpectralCausticSamples(
            causticFieldSamples,
            floorHit,
            0.55 + (1 - deviation) * 0.45,
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
              0.55 + (1 - deviation) * 0.45,
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
    this.publishCausticField(causticFieldSamples, receiverDomain(bounds), sampleCount);
    this.applyDisplay(settings.opticalDisplay, settings.opticalView);
    return sampleCount;
  }

  private rebuildGpu(
    result: GpuOpticsResult,
    settings: OpticalSettings,
    bounds: ReturnType<typeof fieldBounds>,
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
    const lightDirection = directionFromAngle(settings.lightAngle);
    const causticFieldSamples: CausticSample[] = [];
    const visualStride = Math.max(1, Math.ceil(result.sampleCount / 32768));
    let shownRays = 0;
    let visualHitCount = 0;
    let causticHitCount = 0;

    for (let sample = 0; sample < result.sampleCount; sample += visualStride) {
      const offset = sample * 20;
      const entryValid = result.values[offset + 16] > 0.5;
      if (!entryValid) continue;
      visualHitCount++;
      const exitValid = result.values[offset + 17] > 0.5;
      const floorValid = result.values[offset + 18] > 0.5;
      const energy = result.values[offset + 19];
      const origin = vectorFromResult(result.values, offset);
      const entry = vectorFromResult(result.values, offset + 4);
      const exit = vectorFromResult(result.values, offset + 8);
      const floor = vectorFromResult(result.values, offset + 12);

      if (shownRays < settings.opticalRayCount) {
        appendSegment(rayPositions, rayColors, origin, entry, 0x1c5368, 0x62e6ff);
        if (exitValid) {
          appendSegment(rayPositions, rayColors, entry, exit, 0x6beaff, 0xf6ffff);
          if (floorValid) {
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
      if (exitValid) {
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
        if (floorValid) {
          causticHitCount++;
          const outgoing = floor.clone().sub(exit).normalize();
          appendSpectralCausticSamples(
            causticFieldSamples,
            floor,
            Math.max(0.5, Math.min(1, energy)),
            outgoing,
            lightDirection,
            settings.dispersion,
            settings.dispersionMode,
            settings.rainbowModel,
          );
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
            Math.max(0.5, Math.min(1, energy)),
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
    const accumulatedRayCount = Math.ceil(result.sampleCount / visualStride);
    this.publishCausticField(
      causticFieldSamples,
      receiverDomain(bounds),
      accumulatedRayCount,
    );
    this.applyDisplay(settings.opticalDisplay, settings.opticalView);
  }

  private applyDisplay(display: OpticalDisplay, view: OpticalView): void {
    if (this.rays) this.rays.visible = display === "both";
    if (this.density) this.density.visible = view === "analysis";
    if (this.caustics) this.caustics.visible = view === "analysis";
  }

  private publishCausticField(
    samples: CausticSample[],
    domain: LightDrawingDomain,
    emittedRayCount: number,
  ): void {
    this.onCausticField?.(buildLightDrawingField(samples, {
      domain,
      emittedRayCount,
      width: 256,
      height: 256,
      // At 16,384 samples the source lattice is roughly 128×128 while the
      // receiver is 256×256. A two-texel one-pass reconstruction footprint
      // closes sampling gaps without the old repeated beauty blur.
      reconstructionRadius: 2,
      // The old value saturated the focal core and hid the trace-directed
      // diagonal. Keep this fixed; author-facing causticStrength remains the
      // deliberate display control.
      exposure: 0.22,
    }));
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

  samples.push(
    {
      x: floor.x - directionX * shift,
      z: floor.z - directionZ * shift,
      energy,
      color: [1, 0.04, 0],
    },
    {
      x: floor.x - directionX * shift * 0.5,
      z: floor.z - directionZ * shift * 0.5,
      energy,
      color: [1, 0.5, 0.01],
    },
    {
      x: floor.x,
      z: floor.z,
      energy,
      color: [0.08, 1, 0.05],
    },
    {
      x: floor.x + directionX * shift * 0.5,
      z: floor.z + directionZ * shift * 0.5,
      energy,
      color: [0, 0.55, 1],
    },
    {
      x: floor.x + directionX * shift,
      z: floor.z + directionZ * shift,
      energy,
      color: [0.05, 0.03, 1],
    },
  );
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function vectorFromResult(values: Float32Array, offset: number): THREE.Vector3 {
  return new THREE.Vector3(values[offset], values[offset + 1], values[offset + 2]);
}

function fieldBounds(shape: RuntimeShape): { center: THREE.Vector3; radius: number; minY: number } {
  const min = new THREE.Vector3(
    shape.asset.bounds.min.x,
    shape.asset.bounds.min.y,
    shape.asset.bounds.min.z,
  );
  const max = new THREE.Vector3(
    shape.asset.bounds.max.x,
    shape.asset.bounds.max.y,
    shape.asset.bounds.max.z,
  );
  const center = min.clone().add(max).multiplyScalar(0.5);
  return {
    center,
    radius: Math.max(0.1, center.distanceTo(max)),
    minY: min.y,
  };
}

function receiverDomain(bounds: ReturnType<typeof fieldBounds>): LightDrawingDomain {
  const size = bounds.radius * 5;
  return {
    minX: bounds.center.x - size * 0.5,
    minZ: bounds.center.z - size * 0.5,
    sizeX: size,
    sizeZ: size,
  };
}

/**
 * Deterministic single-ray reference used by both LD1 verification and the
 * same RuntimeShape boundary queries as the live CPU receiver path.
 */
export function traceFocusedRay(
  shape: RuntimeShape,
  origin: THREE.Vector3,
  incidentDirection: THREE.Vector3,
  ior: number,
  floorY: number,
  maxDistance: number,
): FocusedRayTrace {
  const direction = incidentDirection.clone().normalize();
  const entry = marchToSurface(shape, origin, direction, maxDistance);
  if (!entry) {
    return {
      entry: null,
      insideDirection: null,
      exit: null,
      outgoing: null,
      floorHit: intersectFloor(origin, direction, floorY),
    };
  }
  const entryNormal = fieldNormal(shape, entry);
  const insideDirection =
    refract(direction, entryNormal, 1 / ior) ?? direction.clone().reflect(entryNormal);
  const exit = marchInside(shape, entry, insideDirection, maxDistance);
  if (!exit) {
    return { entry, insideDirection, exit: null, outgoing: null, floorHit: null };
  }
  const outwardNormal = fieldNormal(shape, exit.point);
  const exitInterfaceNormal = outwardNormal.clone().negate();
  const outgoing =
    refract(insideDirection, exitInterfaceNormal, ior)
    ?? insideDirection.clone().reflect(exitInterfaceNormal);
  return {
    entry,
    insideDirection,
    exit,
    outgoing,
    floorHit: intersectFloor(exit.point, outgoing, floorY),
  };
}

function directionFromAngle(angleDegrees: number): THREE.Vector3 {
  const angle = THREE.MathUtils.degToRad(angleDegrees);
  return new THREE.Vector3(Math.sin(angle) * 0.72, -1, Math.cos(angle) * 0.28).normalize();
}

function marchToSurface(
  shape: RuntimeShape,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): THREE.Vector3 | null {
  let distanceAlongRay = 0;
  const sampledField = shape.asset.representation.kind === "sampled-field-v1";
  const maxIterations = sampledField ? 512 : 128;
  for (let iteration = 0; iteration < maxIterations && distanceAlongRay < maxDistance; iteration++) {
    const point = origin.clone().addScaledVector(direction, distanceAlongRay);
    const distance = shape.distance(point);
    if (distance < 0.002) return point;
    distanceAlongRay += opticalStep(shape, distance, 0.8);
  }
  return null;
}

function marchInside(
  shape: RuntimeShape,
  entry: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): { point: THREE.Vector3; distance: number } | null {
  let distanceAlongRay = 0.018;
  let previous = entry.clone();
  const sampledField = shape.asset.representation.kind === "sampled-field-v1";
  const maxIterations = sampledField ? 512 : 160;
  for (let iteration = 0; iteration < maxIterations && distanceAlongRay < maxDistance; iteration++) {
    const point = entry.clone().addScaledVector(direction, distanceAlongRay);
    const distance = shape.distance(point);
    if (distance >= -0.002 && distanceAlongRay > 0.04) {
      return { point: refineExit(shape, previous, point), distance: distanceAlongRay };
    }
    previous = point;
    distanceAlongRay += opticalStep(shape, Math.abs(distance), 0.72);
  }
  return null;
}

function opticalStep(shape: RuntimeShape, distance: number, metaballScale: number): number {
  const representation = shape.asset.representation;
  if (representation.kind === "metaballs-v1") {
    return Math.max(metaballScale === 0.8 ? 0.004 : 0.012, Math.abs(distance) * metaballScale);
  }
  const size = {
    x: shape.asset.bounds.max.x - shape.asset.bounds.min.x,
    y: shape.asset.bounds.max.y - shape.asset.bounds.min.y,
    z: shape.asset.bounds.max.z - shape.asset.bounds.min.z,
  };
  const [nx, ny, nz] = representation.dimensions;
  const voxel = Math.min(size.x / (nx - 1), size.y / (ny - 1), size.z / (nz - 1));
  const scale = representation.recommendedStepScale;
  return Math.max(voxel * 0.05, Math.min(Math.abs(distance) * scale, voxel * scale));
}

function refineExit(
  shape: RuntimeShape,
  inside: THREE.Vector3,
  outside: THREE.Vector3,
): THREE.Vector3 {
  let a = inside.clone();
  let b = outside.clone();
  for (let iteration = 0; iteration < 7; iteration++) {
    const middle = a.clone().lerp(b, 0.5);
    const d = shape.distance(middle);
    if (d < 0) a = middle;
    else b = middle;
  }
  return a.lerp(b, 0.5);
}

function fieldNormal(shape: RuntimeShape, point: THREE.Vector3): THREE.Vector3 {
  const epsilon = 0.006;
  const normal = shape.normal(point, epsilon);
  return normal
    ? new THREE.Vector3(normal.x, normal.y, normal.z)
    : new THREE.Vector3(0, 1, 0);
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

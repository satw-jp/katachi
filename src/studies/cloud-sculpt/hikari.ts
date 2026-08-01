import * as THREE from "three";
import { fieldSdf, type Ball } from "./field.ts";
import {
  OpticsLayer,
  type HikariPhenomenon,
  type CausticField,
  type OpticalColorMode,
  type OpticalDispersionMode,
  type OpticalDisplay,
  type OpticalHostPreset,
  type OpticalMaterial,
  type OpticalRainbowModel,
  type ReceiverDisplayMode,
  type OpticalSettings,
  type OpticalView,
} from "./optics.ts";
import { hashSeed, makeRng } from "./random.ts";
import type { DaylightMode } from "./daylight.ts";

export type WorkspaceView = "katachi" | "hikari";
export type HikariMode = "points" | "trails" | "density";
export type HikariSpawn = "surface" | "inside";
export type {
  HikariPhenomenon,
  OpticalColorMode,
  OpticalDispersionMode,
  OpticalDisplay,
  OpticalHostPreset,
  OpticalMaterial,
  OpticalRainbowModel,
  ReceiverDisplayMode,
  OpticalView,
};
export type { DaylightMode };

export interface HikariSettings extends OpticalSettings {
  seed: string;
  particleCount: number;
  speed: number;
  curl: number;
  trailLength: number;
  particleSize: number;
  exposure: number;
  blur: number;
  mode: HikariMode;
  spawn: HikariSpawn;
}

export const DEFAULT_HIKARI_SETTINGS: HikariSettings = {
  phenomenon: "flow",
  opticalMaterial: "glass",
  hostPreset: "amber",
  inclusionEnabled: true,
  inclusionIor: 1.5,
  inclusionAbsorption: 0.02,
  inclusionOffsetX: 0,
  inclusionOffsetY: 0,
  inclusionOffsetZ: 0,
  inclusionRadius: 0.48,
  opticalDisplay: "density",
  opticalView: "natural",
  receiverDisplayMode: "composite",
  ior: 1.5,
  daylightMode: "tokyo",
  daylightDate: "2026-08-01",
  daylightMinutes: 17 * 60,
  lightAngle: -24,
  lightWidth: 1,
  opticalRayCount: 56,
  opticalSampleCount: 16384,
  opticalSeed: "sun-01",
  absorption: 0.55,
  causticStrength: 1.2,
  skyIntensity: 0.85,
  sunIntensity: 1.25,
  sunSize: 0.53,
  groundReflectance: 0.7,
  opticalExposure: 1,
  surfaceRoughness: 0.08,
  surfaceVariation: 0.04,
  materialVariation: 0.18,
  materialScale: 1,
  environmentContrast: 1,
  environmentRotation: 0,
  environmentMist: 0.72,
  opticalColorMode: "color",
  rainbowModel: "prism",
  dispersionMode: "local",
  dispersion: 0.32,
  stressAmount: 0.55,
  polarization: 0.45,
  seed: "hikari-01",
  particleCount: 5000,
  speed: 0.8,
  curl: 0.7,
  trailLength: 12,
  particleSize: 2,
  exposure: 1,
  blur: 1.5,
  mode: "points",
  spawn: "surface",
};

const pointVertexShader = `
attribute float aPhase;
uniform float uTime;
uniform float uSpeed;
uniform float uCurl;
uniform float uPointSize;
varying vec3 vColor;

vec3 flow(vec3 p, float phase) {
  vec3 radial = normalize(p + vec3(0.0001));
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), radial) + vec3(0.12, 0.03, 0.08));
  float wave = sin(phase * 6.2831853 + p.y * 2.1 + p.x * 1.3);
  return tangent * wave * uCurl * 0.22 + radial * cos(phase * 4.7 + p.z) * uCurl * 0.045;
}

void main() {
  float phase = aPhase + uTime * uSpeed;
  vec3 animated = position + flow(position, phase);
  vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(1.0, uPointSize * (18.0 / max(1.0, -mvPosition.z)));
  vColor = color;
}
`;

const pointFragmentShader = `
uniform float uOpacity;
uniform float uSoftness;
varying vec3 vColor;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float radius = length(p) * 2.0;
  float alpha = 1.0 - smoothstep(max(0.0, 1.0 - uSoftness), 1.0, radius);
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(vColor, alpha * uOpacity);
}
`;

const trailVertexShader = `
attribute float aPhase;
attribute float aTrail;
uniform float uTime;
uniform float uSpeed;
uniform float uCurl;
uniform float uTrailScale;
varying vec3 vColor;

vec3 flow(vec3 p, float phase) {
  vec3 radial = normalize(p + vec3(0.0001));
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), radial) + vec3(0.12, 0.03, 0.08));
  float wave = sin(phase * 6.2831853 + p.y * 2.1 + p.x * 1.3);
  return tangent * (wave * uCurl * 0.22 - aTrail * uTrailScale)
    + radial * cos(phase * 4.7 + p.z) * uCurl * 0.045;
}

void main() {
  float phase = aPhase + uTime * uSpeed - aTrail * 0.65;
  vec3 animated = position + flow(position, phase);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(animated, 1.0);
  vColor = color;
}
`;

const trailFragmentShader = `
uniform float uOpacity;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, uOpacity);
}
`;

export class HikariLayer {
  readonly group = new THREE.Group();
  readonly optics: OpticsLayer;
  private points: THREE.Points | null = null;
  private trails: THREE.LineSegments | null = null;
  private pointMaterial: THREE.ShaderMaterial;
  private trailMaterial: THREE.ShaderMaterial;
  private signature = "";
  private settings = { ...DEFAULT_HIKARI_SETTINGS };
  private enabled = false;

  constructor(
    scene: THREE.Scene,
    options: {
      disableWebGpu?: boolean;
      onCausticField?: (field: CausticField) => void;
      onTransportPending?: (pending: boolean) => void;
    } = {},
  ) {
    this.optics = new OpticsLayer(scene, options);
    this.pointMaterial = new THREE.ShaderMaterial({
      vertexShader: pointVertexShader,
      fragmentShader: pointFragmentShader,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 1 },
        uCurl: { value: 0.7 },
        uPointSize: { value: 2 },
        uOpacity: { value: 0.6 },
        uSoftness: { value: 0.35 },
      },
    });
    this.trailMaterial = new THREE.ShaderMaterial({
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 1 },
        uCurl: { value: 0.7 },
        uTrailScale: { value: 0.5 },
        uOpacity: { value: 0.12 },
      },
    });
    this.group.visible = false;
    scene.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.enabled = visible;
    this.applyVisibility();
  }

  update(balls: Ball[], k: number, settings: HikariSettings): void {
    this.settings = { ...settings };
    const signature = `${shapeSignature(balls, k)}:${settings.seed}:${settings.particleCount}:${settings.spawn}:${settings.trailLength}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.rebuild(balls, k, settings);
    }
    this.applyAppearance();
    this.optics.update(balls, k, settings);
    this.applyVisibility();
  }

  animate(now: number): void {
    const time = now * 0.00018;
    this.pointMaterial.uniforms.uTime.value = time;
    this.trailMaterial.uniforms.uTime.value = time;
    this.optics.animate(now);
  }

  getOpticsComputeStatus(): ReturnType<OpticsLayer["getComputeStatus"]> {
    return this.optics.getComputeStatus();
  }

  runReceiverParityCase(
    balls: Ball[],
    k: number,
    settings: HikariSettings,
    options: { caseId?: string; sampleCount?: number } = {},
  ): ReturnType<OpticsLayer["runReceiverParityCase"]> {
    return this.optics.runReceiverParityCase(balls, k, settings, options);
  }

  private rebuild(balls: Ball[], k: number, settings: HikariSettings): void {
    if (this.points) {
      this.points.geometry.dispose();
      this.group.remove(this.points);
    }
    if (this.trails) {
      this.trails.geometry.dispose();
      this.group.remove(this.trails);
    }

    const cloud = sampleParticles(balls, k, settings);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(cloud.positions, 3));
    pointGeometry.setAttribute("color", new THREE.Float32BufferAttribute(cloud.colors, 3));
    pointGeometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(cloud.phases, 1));
    this.points = new THREE.Points(pointGeometry, this.pointMaterial);
    this.group.add(this.points);

    const trailParticleCount = Math.min(cloud.phases.length, 2200);
    const steps = Math.max(2, Math.round(settings.trailLength));
    const trailPositions = new Float32Array(trailParticleCount * steps * 2 * 3);
    const trailColors = new Float32Array(trailPositions.length);
    const trailPhases = new Float32Array(trailParticleCount * steps * 2);
    const trailProgress = new Float32Array(trailPhases.length);
    let vertex = 0;

    for (let particle = 0; particle < trailParticleCount; particle++) {
      const source = particle * 3;
      for (let step = 0; step < steps; step++) {
        for (const offset of [step / steps, (step + 1) / steps]) {
          const target = vertex * 3;
          trailPositions[target] = cloud.positions[source];
          trailPositions[target + 1] = cloud.positions[source + 1];
          trailPositions[target + 2] = cloud.positions[source + 2];
          trailColors[target] = cloud.colors[source];
          trailColors[target + 1] = cloud.colors[source + 1];
          trailColors[target + 2] = cloud.colors[source + 2];
          trailPhases[vertex] = cloud.phases[particle];
          trailProgress[vertex] = offset;
          vertex++;
        }
      }
    }

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
    trailGeometry.setAttribute("aPhase", new THREE.BufferAttribute(trailPhases, 1));
    trailGeometry.setAttribute("aTrail", new THREE.BufferAttribute(trailProgress, 1));
    this.trails = new THREE.LineSegments(trailGeometry, this.trailMaterial);
    this.group.add(this.trails);
  }

  private applyAppearance(): void {
    const settings = this.settings;
    const density = settings.mode === "density";
    if (this.points) this.points.visible = settings.mode !== "trails";
    if (this.trails) this.trails.visible = settings.mode === "trails";

    this.pointMaterial.blending = density ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.pointMaterial.uniforms.uSpeed.value = settings.speed;
    this.pointMaterial.uniforms.uCurl.value = settings.curl;
    this.pointMaterial.uniforms.uPointSize.value =
      settings.particleSize * (density ? 3.2 + settings.blur * 0.35 : 1);
    this.pointMaterial.uniforms.uOpacity.value = Math.min(
      density ? 0.22 : 0.92,
      (density ? 0.025 : 0.34) * settings.exposure,
    );
    this.pointMaterial.uniforms.uSoftness.value = Math.min(
      0.94,
      (density ? 0.72 : 0.2) + settings.blur * 0.055,
    );

    this.trailMaterial.uniforms.uSpeed.value = settings.speed;
    this.trailMaterial.uniforms.uCurl.value = settings.curl;
    this.trailMaterial.uniforms.uTrailScale.value = 0.16 + settings.trailLength * 0.035;
    this.trailMaterial.uniforms.uOpacity.value = Math.min(0.42, 0.075 * settings.exposure);
  }

  private applyVisibility(): void {
    this.group.visible = this.enabled && this.settings.phenomenon === "flow";
    this.optics.setVisible(this.enabled && this.settings.phenomenon === "optics");
  }
}

export function normalizeHikariSettings(value: Partial<HikariSettings>): HikariSettings {
  return {
    phenomenon: value.phenomenon === "optics" ? "optics" : "flow",
    opticalMaterial: value.opticalMaterial === "water" ? "water" : "glass",
    hostPreset:
      value.hostPreset === "clear" || value.hostPreset === "amber" || value.hostPreset === "dark"
        ? value.hostPreset
        : DEFAULT_HIKARI_SETTINGS.hostPreset,
    inclusionEnabled:
      typeof value.inclusionEnabled === "boolean"
        ? value.inclusionEnabled
        : DEFAULT_HIKARI_SETTINGS.inclusionEnabled,
    inclusionIor: clampNumber(value.inclusionIor, 1, 1.8, DEFAULT_HIKARI_SETTINGS.inclusionIor),
    inclusionAbsorption: clampNumber(
      value.inclusionAbsorption,
      0,
      2.5,
      DEFAULT_HIKARI_SETTINGS.inclusionAbsorption,
    ),
    inclusionOffsetX: clampNumber(
      value.inclusionOffsetX,
      -1.5,
      1.5,
      DEFAULT_HIKARI_SETTINGS.inclusionOffsetX,
    ),
    inclusionOffsetY: clampNumber(
      value.inclusionOffsetY,
      -1.5,
      1.5,
      DEFAULT_HIKARI_SETTINGS.inclusionOffsetY,
    ),
    inclusionOffsetZ: clampNumber(
      value.inclusionOffsetZ,
      -1.5,
      1.5,
      DEFAULT_HIKARI_SETTINGS.inclusionOffsetZ,
    ),
    inclusionRadius: clampNumber(
      value.inclusionRadius,
      0.12,
      1.2,
      DEFAULT_HIKARI_SETTINGS.inclusionRadius,
    ),
    opticalDisplay:
      value.opticalDisplay === "both" ||
      (value.opticalDisplay as unknown as string) === "rays"
        ? "both"
        : "density",
    opticalView: value.opticalView === "analysis" ? "analysis" : "natural",
    receiverDisplayMode:
      value.receiverDisplayMode === "coverage"
      || value.receiverDisplayMode === "deposit"
      || value.receiverDisplayMode === "loss"
        ? value.receiverDisplayMode
        : "composite",
    ior: clampNumber(value.ior, 1.01, 1.8, DEFAULT_HIKARI_SETTINGS.ior),
    daylightMode: value.daylightMode === "manual" ? "manual" : "tokyo",
    daylightDate: normalizeDaylightDate(value.daylightDate),
    daylightMinutes: clampNumber(
      value.daylightMinutes,
      0,
      1439,
      DEFAULT_HIKARI_SETTINGS.daylightMinutes,
    ),
    lightAngle: clampNumber(value.lightAngle, -70, 70, DEFAULT_HIKARI_SETTINGS.lightAngle),
    lightWidth: clampNumber(value.lightWidth, 0.45, 1.8, DEFAULT_HIKARI_SETTINGS.lightWidth),
    opticalRayCount: clampNumber(
      value.opticalRayCount,
      8,
      120,
      DEFAULT_HIKARI_SETTINGS.opticalRayCount,
    ),
    opticalSampleCount: clampNumber(
      value.opticalSampleCount,
      4096,
      131072,
      DEFAULT_HIKARI_SETTINGS.opticalSampleCount,
    ),
    opticalSeed:
      typeof value.opticalSeed === "string"
        ? value.opticalSeed
        : DEFAULT_HIKARI_SETTINGS.opticalSeed,
    absorption: clampNumber(value.absorption, 0, 2.5, DEFAULT_HIKARI_SETTINGS.absorption),
    causticStrength: clampNumber(
      value.causticStrength,
      0.2,
      2.5,
      DEFAULT_HIKARI_SETTINGS.causticStrength,
    ),
    skyIntensity: clampNumber(
      value.skyIntensity,
      0.1,
      2.5,
      DEFAULT_HIKARI_SETTINGS.skyIntensity,
    ),
    sunIntensity: clampNumber(
      value.sunIntensity,
      0,
      3,
      DEFAULT_HIKARI_SETTINGS.sunIntensity,
    ),
    sunSize: clampNumber(value.sunSize, 0.1, 30, DEFAULT_HIKARI_SETTINGS.sunSize),
    groundReflectance: clampNumber(
      value.groundReflectance,
      0.05,
      1.5,
      DEFAULT_HIKARI_SETTINGS.groundReflectance,
    ),
    opticalExposure: clampNumber(
      value.opticalExposure,
      0.25,
      2.5,
      DEFAULT_HIKARI_SETTINGS.opticalExposure,
    ),
    surfaceRoughness: clampNumber(
      value.surfaceRoughness,
      0,
      0.65,
      DEFAULT_HIKARI_SETTINGS.surfaceRoughness,
    ),
    surfaceVariation: clampNumber(
      value.surfaceVariation,
      0,
      0.4,
      DEFAULT_HIKARI_SETTINGS.surfaceVariation,
    ),
    materialVariation: clampNumber(
      value.materialVariation,
      0,
      1,
      DEFAULT_HIKARI_SETTINGS.materialVariation,
    ),
    materialScale: clampNumber(
      value.materialScale,
      0.25,
      3,
      DEFAULT_HIKARI_SETTINGS.materialScale,
    ),
    environmentContrast: clampNumber(
      value.environmentContrast,
      0,
      2,
      DEFAULT_HIKARI_SETTINGS.environmentContrast,
    ),
    environmentRotation: clampNumber(
      value.environmentRotation,
      -180,
      180,
      DEFAULT_HIKARI_SETTINGS.environmentRotation,
    ),
    environmentMist: clampNumber(
      value.environmentMist,
      0,
      1,
      DEFAULT_HIKARI_SETTINGS.environmentMist,
    ),
    opticalColorMode: value.opticalColorMode === "mono" ? "mono" : "color",
    rainbowModel:
      value.rainbowModel === "stress" || value.rainbowModel === "both"
        ? value.rainbowModel
        : "prism",
    dispersionMode: value.dispersionMode === "global" ? "global" : "local",
    dispersion: clampNumber(
      value.dispersion,
      0,
      1,
      DEFAULT_HIKARI_SETTINGS.dispersion,
    ),
    stressAmount: clampNumber(
      value.stressAmount,
      0,
      1,
      DEFAULT_HIKARI_SETTINGS.stressAmount,
    ),
    polarization: clampNumber(
      value.polarization,
      0,
      1,
      DEFAULT_HIKARI_SETTINGS.polarization,
    ),
    seed: typeof value.seed === "string" ? value.seed : DEFAULT_HIKARI_SETTINGS.seed,
    particleCount: clampNumber(value.particleCount, 500, 12000, DEFAULT_HIKARI_SETTINGS.particleCount),
    speed: clampNumber(value.speed, 0, 3, DEFAULT_HIKARI_SETTINGS.speed),
    curl: clampNumber(value.curl, 0, 2.5, DEFAULT_HIKARI_SETTINGS.curl),
    trailLength: clampNumber(value.trailLength, 2, 24, DEFAULT_HIKARI_SETTINGS.trailLength),
    particleSize: clampNumber(value.particleSize, 0.5, 6, DEFAULT_HIKARI_SETTINGS.particleSize),
    exposure: clampNumber(value.exposure, 0.1, 3, DEFAULT_HIKARI_SETTINGS.exposure),
    blur: clampNumber(value.blur, 0, 12, DEFAULT_HIKARI_SETTINGS.blur),
    mode: value.mode === "trails" || value.mode === "density" ? value.mode : "points",
    spawn: value.spawn === "inside" ? "inside" : "surface",
  };
}

function normalizeDaylightDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return DEFAULT_HIKARI_SETTINGS.daylightDate;
  }
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day
    ? value
    : DEFAULT_HIKARI_SETTINGS.daylightDate;
}

function sampleParticles(
  balls: Ball[],
  k: number,
  settings: HikariSettings,
): { positions: Float32Array; colors: Float32Array; phases: Float32Array } {
  if (balls.length === 0) {
    return {
      positions: new Float32Array(),
      colors: new Float32Array(),
      phases: new Float32Array(),
    };
  }

  const count = Math.round(settings.particleCount);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const random = makeRng(hashSeed(`${settings.seed}:${shapeSignature(balls, k)}`));
  const weights = balls.map((ball) => Math.max(0.001, ball.r ** (settings.spawn === "surface" ? 2 : 3)));
  const cumulative: number[] = [];
  let total = 0;
  for (const weight of weights) {
    total += weight;
    cumulative.push(total);
  }

  for (let index = 0; index < count; index++) {
    const ball = pickWeightedBall(balls, cumulative, total, random);
    const direction = randomUnitVector(random);
    let radius = ball.r;
    if (settings.spawn === "inside") radius *= Math.cbrt(random()) * 0.96;
    let x = ball.x + direction.x * radius;
    let y = ball.y + direction.y * radius;
    let z = ball.z + direction.z * radius;

    if (settings.spawn === "surface") {
      for (let iteration = 0; iteration < 4; iteration++) {
        const distance = fieldSdf(balls, k, x, y, z);
        const normal = fieldNormal(balls, k, x, y, z);
        x -= normal.x * distance;
        y -= normal.y * distance;
        z -= normal.z * distance;
      }
    }

    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    const accent = random() > 0.86;
    colors[offset] = accent ? 1 : 0.12;
    colors[offset + 1] = accent ? 0.38 : 0.72;
    colors[offset + 2] = accent ? 0.16 : 0.86;
    phases[index] = random();
  }

  return { positions, colors, phases };
}

function pickWeightedBall(
  balls: Ball[],
  cumulative: number[],
  total: number,
  random: () => number,
): Ball {
  if (balls.length === 0) return { id: 0, x: 0, y: 0, z: 0, r: 0 };
  const target = random() * total;
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] < target) low = middle + 1;
    else high = middle;
  }
  return balls[low];
}

function randomUnitVector(random: () => number): THREE.Vector3 {
  const z = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(radius * Math.cos(angle), z, radius * Math.sin(angle));
}

function fieldNormal(
  balls: Ball[],
  k: number,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const epsilon = 0.012;
  const nx = fieldSdf(balls, k, x + epsilon, y, z) - fieldSdf(balls, k, x - epsilon, y, z);
  const ny = fieldSdf(balls, k, x, y + epsilon, z) - fieldSdf(balls, k, x, y - epsilon, z);
  const nz = fieldSdf(balls, k, x, y, z + epsilon) - fieldSdf(balls, k, x, y, z - epsilon);
  const length = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / length, y: ny / length, z: nz / length };
}

function shapeSignature(balls: Ball[], k: number): string {
  return `${k.toFixed(4)}|${balls
    .map((ball) => `${ball.id}:${ball.x.toFixed(4)},${ball.y.toFixed(4)},${ball.z.toFixed(4)},${ball.r.toFixed(4)}`)
    .join("|")}`;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

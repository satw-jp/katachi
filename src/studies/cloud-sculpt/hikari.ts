import * as THREE from "three";
import type { MetaballRecord, RuntimeShape, Vec3 } from "../../lib/hikari/index.ts";
import {
  OpticsLayer,
  type HikariPhenomenon,
  type CausticField,
  type OpticalColorMode,
  type OpticalDispersionMode,
  type OpticalDisplay,
  type OpticalMaterial,
  type OpticalRainbowModel,
  type OpticalSettings,
  type OpticalView,
  type OpticsShapeSource,
} from "./optics.ts";
import { hashSeed, makeRng } from "./random.ts";

export type WorkspaceView = "katachi" | "hikari";
export type HikariMode = "points" | "trails" | "density";
export type HikariSpawn = "surface" | "inside";
export type {
  HikariPhenomenon,
  OpticalColorMode,
  OpticalDispersionMode,
  OpticalDisplay,
  OpticalMaterial,
  OpticalRainbowModel,
  OpticalView,
};

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
  opticalDisplay: "density",
  opticalView: "natural",
  ior: 1.5,
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
  surfaceVariation: 0.14,
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

  update(source: OpticsShapeSource | null, settings: HikariSettings): void {
    this.settings = { ...settings };
    const signature = `${source?.runtime.asset.revision ?? "empty"}:${settings.seed}:${settings.particleCount}:${settings.spawn}:${settings.trailLength}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.rebuild(source?.runtime ?? null, settings);
    }
    this.applyAppearance();
    this.optics.update(source, settings);
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

  private rebuild(shape: RuntimeShape | null, settings: HikariSettings): void {
    if (this.points) {
      this.points.geometry.dispose();
      this.group.remove(this.points);
    }
    if (this.trails) {
      this.trails.geometry.dispose();
      this.group.remove(this.trails);
    }

    const cloud = sampleParticles(shape, settings);
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
    opticalDisplay:
      value.opticalDisplay === "both" ||
      (value.opticalDisplay as unknown as string) === "rays"
        ? "both"
        : "density",
    opticalView: value.opticalView === "analysis" ? "analysis" : "natural",
    ior: clampNumber(value.ior, 1.01, 1.8, DEFAULT_HIKARI_SETTINGS.ior),
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
      0.25,
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

function sampleParticles(
  shape: RuntimeShape | null,
  settings: HikariSettings,
): { positions: Float32Array; colors: Float32Array; phases: Float32Array } {
  if (!shape) {
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
  const random = makeRng(hashSeed(`${settings.seed}:${shapeSeedSignature(shape)}`));
  const metaballs = shape.asset.representation.kind === "metaballs-v1"
    ? shape.asset.representation.balls
    : null;
  const weighted = metaballs ? createMetaballWeights(metaballs, settings.spawn) : null;

  for (let index = 0; index < count; index++) {
    const point = metaballs && weighted
      ? sampleMetaballPoint(shape, metaballs, weighted, settings.spawn, random)
      : sampleGenericPoint(shape, settings.spawn, random);

    const offset = index * 3;
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = point.z;
    const accent = random() > 0.86;
    colors[offset] = accent ? 1 : 0.12;
    colors[offset + 1] = accent ? 0.38 : 0.72;
    colors[offset + 2] = accent ? 0.16 : 0.86;
    phases[index] = random();
  }

  return { positions, colors, phases };
}

function createMetaballWeights(
  balls: readonly MetaballRecord[],
  spawn: HikariSpawn,
): { cumulative: number[]; total: number } {
  const cumulative: number[] = [];
  let total = 0;
  for (const ball of balls) {
    total += Math.max(0.001, ball.radius ** (spawn === "surface" ? 2 : 3));
    cumulative.push(total);
  }
  return { cumulative, total };
}

function sampleMetaballPoint(
  shape: RuntimeShape,
  balls: readonly MetaballRecord[],
  weighted: { cumulative: number[]; total: number },
  spawn: HikariSpawn,
  random: () => number,
): Vec3 {
  const ball = pickWeightedBall(balls, weighted.cumulative, weighted.total, random);
  const direction = randomUnitVector(random);
  let radius = ball.radius;
  if (spawn === "inside") radius *= Math.cbrt(random()) * 0.96;
  const point = {
    x: ball.x + direction.x * radius,
    y: ball.y + direction.y * radius,
    z: ball.z + direction.z * radius,
  };

  if (spawn === "surface") {
    for (let iteration = 0; iteration < 4; iteration++) {
      const distance = shape.distance(point);
      const normal = shape.normal(point, 0.012);
      if (!normal) break;
      point.x -= normal.x * distance;
      point.y -= normal.y * distance;
      point.z -= normal.z * distance;
    }
  }
  return point;
}

function sampleGenericPoint(
  shape: RuntimeShape,
  spawn: HikariSpawn,
  random: () => number,
): Vec3 {
  const bounds = shape.asset.bounds;
  const randomPoint = (): Vec3 => ({
    x: mix(bounds.min.x, bounds.max.x, random()),
    y: mix(bounds.min.y, bounds.max.y, random()),
    z: mix(bounds.min.z, bounds.max.z, random()),
  });

  if (spawn === "inside") {
    let nearest = randomPoint();
    let nearestDistance = shape.distance(nearest);
    for (let attempt = 0; attempt < 32; attempt++) {
      const candidate = randomPoint();
      const distance = shape.distance(candidate);
      if (distance <= 0) return candidate;
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const axis = Math.floor(random() * 3) as 0 | 1 | 2;
    const axisName = (["x", "y", "z"] as const)[axis];
    const start = randomPoint();
    start[axisName] = bounds.min[axisName];
    let previous = start;
    let previousDistance = shape.distance(previous);
    for (let step = 1; step <= 16; step++) {
      const current = { ...start };
      current[axisName] = mix(bounds.min[axisName], bounds.max[axisName], step / 16);
      const currentDistance = shape.distance(current);
      if ((previousDistance <= 0) !== (currentDistance <= 0)) {
        return bisectSurface(shape, previous, current);
      }
      previous = current;
      previousDistance = currentDistance;
    }
  }

  let nearest = randomPoint();
  let nearestDistance = Math.abs(shape.distance(nearest));
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = randomPoint();
    const distance = Math.abs(shape.distance(candidate));
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function bisectSurface(shape: RuntimeShape, a: Vec3, b: Vec3): Vec3 {
  let inside = shape.distance(a) <= 0 ? { ...a } : { ...b };
  let outside = shape.distance(a) <= 0 ? { ...b } : { ...a };
  for (let iteration = 0; iteration < 10; iteration++) {
    const middle = {
      x: (inside.x + outside.x) * 0.5,
      y: (inside.y + outside.y) * 0.5,
      z: (inside.z + outside.z) * 0.5,
    };
    if (shape.distance(middle) <= 0) inside = middle;
    else outside = middle;
  }
  return {
    x: (inside.x + outside.x) * 0.5,
    y: (inside.y + outside.y) * 0.5,
    z: (inside.z + outside.z) * 0.5,
  };
}

function pickWeightedBall(
  balls: readonly MetaballRecord[],
  cumulative: number[],
  total: number,
  random: () => number,
): MetaballRecord {
  if (balls.length === 0) return { id: "empty", x: 0, y: 0, z: 0, radius: 0 };
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

function shapeSeedSignature(shape: RuntimeShape): string {
  const representation = shape.asset.representation;
  if (representation.kind !== "metaballs-v1") return shape.asset.sourceHash;
  return `${representation.smoothK.toFixed(4)}|${representation.balls
    .map((ball) => `${ball.id}:${ball.x.toFixed(4)},${ball.y.toFixed(4)},${ball.z.toFixed(4)},${ball.radius.toFixed(4)}`)
    .join("|")}`;
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

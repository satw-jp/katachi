export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type DomainKind = "plane" | "sphere-surface";
export type PackingResponse = "rigid" | "soft";
export type CollisionProxyMode = "single" | "multi";
export type ComparisonMode = "response" | "proxy" | "motif";
export type PackingBasis = "count" | "coverage";

export interface PackingFlowerDefinition extends FlowerFormParams {
  petalCount: FlowerPetalCount;
  showCore: boolean;
}

export interface PackingMotifPreset {
  id: "four-core" | "six-core" | "ten-ring" | "twelve-core";
  label: string;
  definition: PackingFlowerDefinition;
}

export interface PackingParams {
  seed: number;
  count: number;
  flowerSize: number;
  clearance: number;
  softness: number;
  iterations: number;
  domain: DomainKind;
  packingBasis: PackingBasis;
  targetCoverage: number;
  motif: PackingFlowerDefinition;
}

export interface FlowerInstance {
  id: number;
  anchor: Vec3;
  angle: number;
  petals: Vec2[];
}

export interface FlowerComponent {
  instanceId: number;
  componentIndex: number;
  kind: "core" | "petal";
  position: Vec3;
  radius: number;
}

export interface CollisionProxySphere {
  instanceId: number;
  componentIndex: number;
  position: Vec3;
  radius: number;
}

export interface PackingDiagnostics {
  convergence: "converged" | "partial" | "failed";
  iterations: number;
  collisionCount: number;
  maxPenetration: number;
  outsideCount: number;
  meanDeformation: number;
  maxDeformation: number;
  materialCoverage: number;
  territoryCoverage: number;
  coverageSamples: number;
}

export interface PackingResult {
  response: PackingResponse;
  proxyMode: CollisionProxyMode;
  instances: FlowerInstance[];
  diagnostics: PackingDiagnostics;
}

export interface ComparisonPanel {
  label: string;
  params: PackingParams;
  result: PackingResult;
}

export interface PackingComparison {
  mode: ComparisonMode;
  params: PackingParams;
  left: ComparisonPanel;
  right: ComparisonPanel;
}

export interface FlowerPackingRecord {
  formatVersion: 1;
  studyId: "flower-packing-spike";
  savedAt: string;
  comparison: PackingComparison;
}

export const DOMAIN_RADIUS = 1.72;
export const PLANE_RADIUS = 2.15;
const EPS = 1e-8;

const baselineForm: FlowerFormParams = {
  opening: 1.06,
  neck: 0.36,
  coreSize: 0.57,
  cupping: 0,
  coreLift: 0,
  growthDifference: 0,
};

function motifDefinition(
  petalCount: FlowerPetalCount,
  showCore: boolean,
  form: FlowerFormParams,
): PackingFlowerDefinition {
  return { petalCount, showCore, ...form };
}

export const PACKING_MOTIF_PRESETS: readonly PackingMotifPreset[] = [
  { id: "four-core", label: "4枚 · 現在の花", definition: motifDefinition(4, true, baselineForm) },
  { id: "six-core", label: "6枚 · 花芯あり", definition: motifDefinition(6, true, paramsForFlowerVariant("cupped")) },
  { id: "ten-ring", label: "10枚 · 花芯なし", definition: motifDefinition(10, false, paramsForFlowerVariant("cupped")) },
  { id: "twelve-core", label: "12枚 · 花芯あり", definition: motifDefinition(12, true, paramsForFlowerVariant("cupped")) },
] as const;

export const DEFAULT_PACKING_MOTIF: PackingFlowerDefinition = { ...PACKING_MOTIF_PRESETS[0].definition };

export const DEFAULT_PACKING_PARAMS: PackingParams = {
  seed: 304,
  count: 34,
  flowerSize: 0.25,
  clearance: 0.055,
  softness: 0.72,
  iterations: 120,
  domain: "sphere-surface",
  packingBasis: "coverage",
  targetCoverage: 0.2,
  motif: { ...DEFAULT_PACKING_MOTIF },
};

/**
 * A readable starting density, not a hard capacity limit. Dense, coreless
 * corollas become nearly continuous surfaces, so fewer are shown initially;
 * the count control can still raise this after the first comparison.
 */
export function recommendedPackingCount(motif: PackingFlowerDefinition): number {
  const normalized = normalizePackingMotif(motif);
  if (normalized.petalCount >= 10) return normalized.showCore ? 20 : 18;
  return DEFAULT_PACKING_PARAMS.count;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3, fallback: Vec3 = { x: 1, y: 0, z: 0 }): Vec3 {
  const n = length(a);
  return n > EPS ? scale(a, 1 / n) : { ...fallback };
}

function rotate2(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizePackingMotif(value: Partial<PackingFlowerDefinition> | undefined): PackingFlowerDefinition {
  const fallback = DEFAULT_PACKING_MOTIF;
  const requestedCount = Math.trunc(finite(Number(value?.petalCount), fallback.petalCount));
  const petalCount = FLOWER_PETAL_COUNTS.reduce((closest, count) =>
    Math.abs(count - requestedCount) < Math.abs(closest - requestedCount) ? count : closest,
  );
  return {
    petalCount,
    showCore: value?.showCore !== false,
    opening: clamp(finite(Number(value?.opening), fallback.opening), 0.72, 1.22),
    neck: clamp(finite(Number(value?.neck), fallback.neck), 0.14, 0.62),
    coreSize: clamp(finite(Number(value?.coreSize), fallback.coreSize), 0.42, 0.78),
    cupping: clamp(finite(Number(value?.cupping), fallback.cupping), -0.18, 0.5),
    coreLift: clamp(finite(Number(value?.coreLift), fallback.coreLift), -0.12, 0.5),
    growthDifference: clamp(finite(Number(value?.growthDifference), fallback.growthDifference), 0, 0.34),
  };
}

export function packingMotifLabel(motif: PackingFlowerDefinition): string {
  return `${motif.petalCount}枚 · 花芯${motif.showCore ? "あり" : "なし"}`;
}

export function packingMotifPresetId(motif: PackingFlowerDefinition): PackingMotifPreset["id"] | "custom" {
  const keys: readonly (keyof PackingFlowerDefinition)[] = [
    "petalCount", "showCore", "opening", "neck", "coreSize", "cupping", "coreLift", "growthDifference",
  ];
  const match = PACKING_MOTIF_PRESETS.find((preset) => keys.every((key) => preset.definition[key] === motif[key]));
  return match?.id ?? "custom";
}

export function packingMotifToSearch(motif: PackingFlowerDefinition): string {
  const search = new URLSearchParams({
    petals: String(motif.petalCount),
    core: motif.showCore ? "1" : "0",
    opening: String(motif.opening),
    neck: String(motif.neck),
    coreSize: String(motif.coreSize),
    cupping: String(motif.cupping),
    coreLift: String(motif.coreLift),
    growth: String(motif.growthDifference),
  });
  return search.toString();
}

export function packingMotifFromSearch(searchText: string): PackingFlowerDefinition | null {
  const search = new URLSearchParams(searchText.startsWith("?") ? searchText.slice(1) : searchText);
  if (!search.has("petals")) return null;
  const numberValue = (key: string): number | undefined => {
    const raw = search.get(key);
    return raw === null ? undefined : Number(raw);
  };
  return normalizePackingMotif({
    petalCount: numberValue("petals") as FlowerPetalCount,
    showCore: search.get("core") !== "0",
    opening: numberValue("opening"),
    neck: numberValue("neck"),
    coreSize: numberValue("coreSize"),
    cupping: numberValue("cupping"),
    coreLift: numberValue("coreLift"),
    growthDifference: numberValue("growth"),
  });
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frameAt(anchor: Vec3, domain: DomainKind): { normal: Vec3; tangentX: Vec3; tangentY: Vec3 } {
  if (domain === "plane") {
    return {
      normal: { x: 0, y: 1, z: 0 },
      tangentX: { x: 1, y: 0, z: 0 },
      tangentY: { x: 0, y: 0, z: 1 },
    };
  }

  const normal = normalize(anchor, { x: 0, y: 1, z: 0 });
  const guide = Math.abs(normal.y) > 0.88 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const tangentX = normalize(cross(guide, normal));
  const tangentY = normalize(cross(normal, tangentX));
  return { normal, tangentX, tangentY };
}

function motifScale(params: PackingParams): number {
  return params.flowerSize / FLOWER_FORM_SCALE;
}

function motifTemplate(params: PackingParams): FlowerComponent[] {
  const motif = normalizePackingMotif(params.motif);
  return createFlowerFormComponents(motif.petalCount, motif, motif.showCore);
}

function restPetals(params: PackingParams): Vec2[] {
  const scaleFactor = motifScale(params);
  return motifTemplate(params)
    .filter((component) => component.kind === "petal")
    .map((component) => ({ x: component.position.x * scaleFactor, y: component.position.y * scaleFactor }));
}

function motifPlanarBound(params: PackingParams): number {
  const scaleFactor = motifScale(params);
  return motifTemplate(params).reduce((maximum, component) => Math.max(
    maximum,
    Math.hypot(component.position.x, component.position.y) * scaleFactor + component.radius * scaleFactor,
  ), params.flowerSize * 0.2);
}

function packingBase(instance: FlowerInstance, params: PackingParams): Vec3 {
  const frame = frameAt(instance.anchor, params.domain);
  return add(instance.anchor, scale(frame.normal, params.flowerSize * 0.34));
}

function cloneInstance(instance: FlowerInstance): FlowerInstance {
  return {
    id: instance.id,
    anchor: { ...instance.anchor },
    angle: instance.angle,
    petals: instance.petals.map((petal) => ({ ...petal })),
  };
}

export function createInitialInstances(params: PackingParams): FlowerInstance[] {
  const random = mulberry32(params.seed);
  const petals = restPetals(params);
  const result: FlowerInstance[] = [];
  const planeRotation = random() * Math.PI * 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let id = 0; id < params.count; id++) {
    let anchor: Vec3;
    if (params.domain === "sphere-surface") {
      const y = random() * 2 - 1;
      const azimuth = random() * Math.PI * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      anchor = {
        x: Math.cos(azimuth) * radial * DOMAIN_RADIUS,
        y: y * DOMAIN_RADIUS,
        z: Math.sin(azimuth) * radial * DOMAIN_RADIUS,
      };
    } else {
      // A seeded sunflower start avoids mistaking one accidental random pile
      // for a solver failure. The angular jitter keeps the arrangement from
      // becoming a designed grid while preserving an even control group.
      const radial = Math.sqrt((id + 0.5) / params.count) * (PLANE_RADIUS - params.flowerSize * 1.7);
      const azimuth = planeRotation + id * goldenAngle + (random() - 0.5) * 0.3;
      anchor = { x: Math.cos(azimuth) * radial, y: 0, z: Math.sin(azimuth) * radial };
    }

    result.push({
      id,
      anchor,
      angle: random() * Math.PI * 2,
      petals: petals.map((petal) => ({ ...petal })),
    });
  }

  return result;
}

export function flowerComponents(instance: FlowerInstance, params: PackingParams): FlowerComponent[] {
  const frame = frameAt(instance.anchor, params.domain);
  const base = packingBase(instance, params);
  const scaleFactor = motifScale(params);
  const template = motifTemplate(params);
  const components: FlowerComponent[] = [];

  const core = template.find((component) => component.kind === "core");
  if (core) {
    components.push({
      instanceId: instance.id,
      componentIndex: -1,
      kind: "core",
      position: add(base, scale(frame.normal, core.position.z * scaleFactor)),
      radius: core.radius * scaleFactor,
    });
  }

  const templatePetals = template.filter((component) => component.kind === "petal");
  for (let index = 0; index < instance.petals.length; index++) {
    const templatePetal = templatePetals[index];
    if (!templatePetal) continue;
    const rotated = rotate2(instance.petals[index], instance.angle);
    const position = add(
      add(base, add(scale(frame.tangentX, rotated.x), scale(frame.tangentY, rotated.y))),
      scale(frame.normal, templatePetal.position.z * scaleFactor),
    );
    components.push({
      instanceId: instance.id,
      componentIndex: index,
      kind: "petal",
      position,
      radius: templatePetal.radius * scaleFactor,
    });
  }

  return components;
}

function componentConnections(
  components: readonly FlowerComponent[],
): Array<readonly [FlowerComponent, FlowerComponent]> {
  const core = components.find((component) => component.kind === "core");
  const petals = components.filter((component) => component.kind === "petal");
  if (core) return petals.map((petal) => [core, petal] as const);
  return petals.map((petal, index) => [petal, petals[(index + 1) % petals.length]] as const);
}

interface FootprintDisc {
  componentIndex: number;
  x: number;
  y: number;
  radius: number;
}

interface FootprintNeck {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number;
}

interface LocalFlowerFootprint {
  discs: FootprintDisc[];
  necks: FootprintNeck[];
  territoryRadius: number;
}

export interface SurfaceCoverage {
  material: number;
  territory: number;
  samples: number;
}

function pointSegmentDistance2(x: number, y: number, segment: FootprintNeck): number {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator > EPS
    ? clamp(((x - segment.ax) * dx + (y - segment.ay) * dy) / denominator, 0, 1)
    : 0;
  return Math.hypot(x - (segment.ax + dx * t), y - (segment.ay + dy * t));
}

function localFlowerFootprint(instance: FlowerInstance, params: PackingParams): LocalFlowerFootprint {
  const template = motifTemplate(params);
  const scaleFactor = motifScale(params);
  const blend = params.flowerSize * 0.24;
  const surfaceExpansion = blend * 0.18;
  const discs: FootprintDisc[] = [];
  const core = template.find((component) => component.kind === "core");
  if (core) {
    discs.push({
      componentIndex: -1,
      x: 0,
      y: 0,
      radius: core.radius * scaleFactor + surfaceExpansion,
    });
  }

  const templatePetals = template.filter((component) => component.kind === "petal");
  for (let index = 0; index < instance.petals.length; index++) {
    const templatePetal = templatePetals[index];
    if (!templatePetal) continue;
    const position = rotate2(instance.petals[index], instance.angle);
    discs.push({
      componentIndex: index,
      x: position.x,
      y: position.y,
      radius: templatePetal.radius * scaleFactor + surfaceExpansion,
    });
  }

  const petals = discs.filter((disc) => disc.componentIndex >= 0);
  const coreDisc = discs.find((disc) => disc.componentIndex === -1);
  const pairs: Array<readonly [FootprintDisc, FootprintDisc]> = coreDisc
    ? petals.map((petal) => [coreDisc, petal] as const)
    : petals.map((petal, index) => [petal, petals[(index + 1) % petals.length]] as const);
  const motif = normalizePackingMotif(params.motif);
  const necks = pairs.map(([start, end]) => ({
    ax: start.x,
    ay: start.y,
    bx: end.x,
    by: end.y,
    radius: Math.min(start.radius, end.radius) * motif.neck + surfaceExpansion * 0.65,
  }));

  return {
    discs,
    necks,
    territoryRadius: motifPlanarBound(params) + surfaceExpansion,
  };
}

function footprintContains(footprint: LocalFlowerFootprint, x: number, y: number): boolean {
  for (const disc of footprint.discs) {
    if (Math.hypot(x - disc.x, y - disc.y) <= disc.radius) return true;
  }
  for (const neck of footprint.necks) {
    if (pointSegmentDistance2(x, y, neck) <= neck.radius) return true;
  }
  return false;
}

function surfaceSample(index: number, sampleCount: number, domain: DomainKind): Vec3 {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  if (domain === "plane") {
    const radius = Math.sqrt((index + 0.5) / sampleCount) * PLANE_RADIUS;
    const angle = index * goldenAngle;
    return { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius };
  }
  const y = 1 - ((index + 0.5) / sampleCount) * 2;
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * goldenAngle;
  return {
    x: Math.cos(angle) * radial * DOMAIN_RADIUS,
    y: y * DOMAIN_RADIUS,
    z: Math.sin(angle) * radial * DOMAIN_RADIUS,
  };
}

function sampleInInstanceFrame(
  point: Vec3,
  instance: FlowerInstance,
  params: PackingParams,
): Vec2 {
  if (params.domain === "plane") {
    return { x: point.x - instance.anchor.x, y: point.z - instance.anchor.z };
  }
  const frame = frameAt(instance.anchor, params.domain);
  const anchorNormal = normalize(instance.anchor);
  const pointNormal = normalize(point);
  const cosine = clamp(dot(anchorNormal, pointNormal), -1, 1);
  const angle = Math.acos(cosine);
  if (angle <= EPS) return { x: 0, y: 0 };
  const direction = normalize(sub(pointNormal, scale(anchorNormal, cosine)), frame.tangentX);
  const distance = angle * DOMAIN_RADIUS;
  return {
    x: dot(direction, frame.tangentX) * distance,
    y: dot(direction, frame.tangentY) * distance,
  };
}

/**
 * Measures rotation-independent coverage on the placement surface. Material
 * follows projected flower components and necks; territory uses the outer
 * envelope and therefore includes a coreless flower's central opening.
 */
export function measureSurfaceCoverage(
  instances: readonly FlowerInstance[],
  params: PackingParams,
  sampleCount = 3072,
): SurfaceCoverage {
  const safeSampleCount = Math.max(256, Math.trunc(sampleCount));
  const footprints = instances.map((instance) => localFlowerFootprint(instance, params));
  let materialHits = 0;
  let territoryHits = 0;

  for (let index = 0; index < safeSampleCount; index++) {
    const point = surfaceSample(index, safeSampleCount, params.domain);
    let material = false;
    let territory = false;
    for (let instanceIndex = 0; instanceIndex < instances.length; instanceIndex++) {
      const local = sampleInInstanceFrame(point, instances[instanceIndex], params);
      const footprint = footprints[instanceIndex];
      const radial = Math.hypot(local.x, local.y);
      if (radial <= footprint.territoryRadius) {
        territory = true;
        if (!material && footprintContains(footprint, local.x, local.y)) material = true;
      }
      if (material && territory) break;
    }
    if (material) materialHits++;
    if (territory) territoryHits++;
  }

  return {
    material: materialHits / safeSampleCount,
    territory: territoryHits / safeSampleCount,
    samples: safeSampleCount,
  };
}

function singleMotifMaterialArea(params: PackingParams): number {
  const instance: FlowerInstance = {
    id: 0,
    anchor: { x: 0, y: 0, z: 0 },
    angle: 0,
    petals: restPetals(params),
  };
  const footprint = localFlowerFootprint(instance, params);
  const halfExtent = footprint.territoryRadius;
  const resolution = 112;
  let hits = 0;
  for (let y = 0; y < resolution; y++) {
    const py = ((y + 0.5) / resolution * 2 - 1) * halfExtent;
    for (let x = 0; x < resolution; x++) {
      const px = ((x + 0.5) / resolution * 2 - 1) * halfExtent;
      if (footprintContains(footprint, px, py)) hits++;
    }
  }
  return (hits / (resolution * resolution)) * (halfExtent * 2) ** 2;
}

function estimatedCountForCoverage(params: PackingParams): number {
  const domainArea = params.domain === "sphere-surface"
    ? 4 * Math.PI * DOMAIN_RADIUS * DOMAIN_RADIUS
    : Math.PI * PLANE_RADIUS * PLANE_RADIUS;
  const motifArea = Math.max(singleMotifMaterialArea(params), EPS);
  return Math.max(4, Math.min(96, Math.round(params.targetCoverage * domainArea / motifArea)));
}

export function collisionProxies(
  instances: readonly FlowerInstance[],
  params: PackingParams,
  mode: CollisionProxyMode,
): CollisionProxySphere[] {
  const inflation = params.clearance * 0.5;
  if (mode === "multi") {
    const blend = params.flowerSize * 0.24;
    const surfaceGuard = blend * 0.3;
    return instances.flatMap((instance) => {
      const components = flowerComponents(instance, params);
      const proxies: CollisionProxySphere[] = components.map((component) => ({
        instanceId: component.instanceId,
        componentIndex: component.componentIndex,
        position: component.position,
        radius: component.radius + inflation + surfaceGuard,
      }));

      for (const [start, end] of componentConnections(components)) {
        const neckRadius = Math.min(start.radius, end.radius) * normalizePackingMotif(params.motif).neck
          + inflation + surfaceGuard;
        for (const t of [0.34, 0.67]) {
          proxies.push({
            instanceId: instance.id,
            componentIndex: end.componentIndex,
            position: {
              x: start.position.x + (end.position.x - start.position.x) * t,
              y: start.position.y + (end.position.y - start.position.y) * t,
              z: start.position.z + (end.position.z - start.position.z) * t,
            },
            radius: neckRadius,
          });
        }
      }
      return proxies;
    });
  }

  return instances.map((instance) => {
    const center = packingBase(instance, params);
    const components = flowerComponents(instance, params);
    const boundRadius = components.reduce((maximum, component) => Math.max(
      maximum,
      length(sub(component.position, center)) + component.radius,
    ), params.flowerSize * 0.2) + inflation;
    return {
      instanceId: instance.id,
      componentIndex: -2,
      position: center,
      radius: boundRadius,
    };
  });
}

function moveAnchor(instance: FlowerInstance, displacement: Vec3, params: PackingParams): void {
  if (params.domain === "plane") {
    const limit = Math.max(0.05, PLANE_RADIUS - motifPlanarBound(params));
    const next = {
      x: finite(instance.anchor.x + displacement.x),
      y: 0,
      z: finite(instance.anchor.z + displacement.z),
    };
    const radial = Math.hypot(next.x, next.z);
    if (radial > limit) {
      next.x *= limit / radial;
      next.z *= limit / radial;
    }
    instance.anchor = next;
    return;
  }

  const normal = normalize(instance.anchor, { x: 0, y: 1, z: 0 });
  const tangent = sub(displacement, scale(normal, dot(displacement, normal)));
  instance.anchor = scale(normalize(add(normal, scale(tangent, 1 / DOMAIN_RADIUS)), normal), DOMAIN_RADIUS);
}

function applyDisplacement(
  instance: FlowerInstance,
  componentIndex: number,
  displacement: Vec3,
  params: PackingParams,
  response: PackingResponse,
): void {
  const softness = response === "soft" ? params.softness : 0;
  const petalCanMove = componentIndex >= 0 && softness > 0;
  const anchorShare = petalCanMove ? 1 - softness * 0.92 : 1;
  moveAnchor(instance, scale(displacement, anchorShare), params);

  if (!petalCanMove) return;
  const frame = frameAt(instance.anchor, params.domain);
  const local = rotate2(
    {
      x: dot(displacement, frame.tangentX) * (1 - anchorShare),
      y: dot(displacement, frame.tangentY) * (1 - anchorShare),
    },
    -instance.angle,
  );
  instance.petals[componentIndex].x += local.x;
  instance.petals[componentIndex].y += local.y;
}

function restoreSoftPetals(instance: FlowerInstance, params: PackingParams): void {
  const rest = restPetals(params);
  const spring = 0.012 + (1 - params.softness) * 0.06;

  for (let index = 0; index < instance.petals.length; index++) {
    const petal = instance.petals[index];
    petal.x += (rest[index].x - petal.x) * spring;
    petal.y += (rest[index].y - petal.y) * spring;
  }
  constrainSoftPetals(instance, params);
}

export function softPetalDisplacementLimit(params: PackingParams): number {
  const restRadius = Math.max(...restPetals(params).map((petal) => Math.hypot(petal.x, petal.y)), EPS);
  return restRadius * (0.1 + params.softness * 0.16);
}

function constrainSoftPetals(instance: FlowerInstance, params: PackingParams): void {
  const rest = restPetals(params);
  const maxDelta = softPetalDisplacementLimit(params);
  for (let index = 0; index < instance.petals.length; index++) {
    const petal = instance.petals[index];
    const dx = petal.x - rest[index].x;
    const dy = petal.y - rest[index].y;
    const distance = Math.hypot(dx, dy);
    if (distance <= maxDelta) continue;
    const scaleToLimit = maxDelta / Math.max(distance, EPS);
    petal.x = rest[index].x + dx * scaleToLimit;
    petal.y = rest[index].y + dy * scaleToLimit;
  }
}

function fallbackDirection(aId: number, bId: number): Vec3 {
  const angle = (((aId + 1) * 0.754877666 + (bId + 1) * 0.569840291) % 1) * Math.PI * 2;
  return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
}

function nearbyProxyPairs(proxies: readonly CollisionProxySphere[]): Array<readonly [number, number]> {
  if (proxies.length < 2) return [];
  const maxRadius = proxies.reduce((maximum, proxy) => Math.max(maximum, proxy.radius), EPS);
  const cellSize = maxRadius * 2;
  const buckets = new Map<string, number[]>();
  const cells = proxies.map((proxy) => ({
    x: Math.floor(proxy.position.x / cellSize),
    y: Math.floor(proxy.position.y / cellSize),
    z: Math.floor(proxy.position.z / cellSize),
  }));
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  for (let index = 0; index < proxies.length; index++) {
    const cell = cells[index];
    const bucketKey = key(cell.x, cell.y, cell.z);
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(index);
    else buckets.set(bucketKey, [index]);
  }

  const pairs: Array<readonly [number, number]> = [];
  for (let aIndex = 0; aIndex < proxies.length; aIndex++) {
    const cell = cells[aIndex];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = buckets.get(key(cell.x + dx, cell.y + dy, cell.z + dz));
          if (!bucket) continue;
          for (const bIndex of bucket) {
            if (bIndex > aIndex) pairs.push([aIndex, bIndex]);
          }
        }
      }
    }
  }
  return pairs;
}

function resolveIteration(
  instances: FlowerInstance[],
  params: PackingParams,
  response: PackingResponse,
  proxyMode: CollisionProxyMode,
  restorePetals = true,
): number {
  const proxies = collisionProxies(instances, params, proxyMode);
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  let collisionCount = 0;

  for (const [aIndex, bIndex] of nearbyProxyPairs(proxies)) {
      const a = proxies[aIndex];
      const b = proxies[bIndex];
      if (a.instanceId === b.instanceId) continue;
      const delta = sub(a.position, b.position);
      const distance = length(delta);
      const overlap = a.radius + b.radius - distance;
      if (overlap <= 0) continue;

      collisionCount++;
      const direction = distance > EPS ? scale(delta, 1 / distance) : fallbackDirection(a.instanceId, b.instanceId);
      const correction = scale(direction, Math.min(overlap * 0.32, params.flowerSize * 0.16));
      const aInstance = byId.get(a.instanceId);
      const bInstance = byId.get(b.instanceId);
      if (!aInstance || !bInstance) continue;
      applyDisplacement(aInstance, a.componentIndex, correction, params, response);
      applyDisplacement(bInstance, b.componentIndex, scale(correction, -1), params, response);
  }

  if (response === "soft") {
    for (const instance of instances) {
      if (restorePetals) restoreSoftPetals(instance, params);
      else constrainSoftPetals(instance, params);
    }
  }
  return collisionCount;
}

function collisionMetrics(
  instances: readonly FlowerInstance[],
  params: PackingParams,
  proxyMode: CollisionProxyMode,
): { collisionCount: number; maxPenetration: number } {
  const proxies = collisionProxies(instances, params, proxyMode);
  let collisionCount = 0;
  let maxPenetration = 0;

  for (const [aIndex, bIndex] of nearbyProxyPairs(proxies)) {
      const a = proxies[aIndex];
      const b = proxies[bIndex];
      if (a.instanceId === b.instanceId) continue;
      const overlap = a.radius + b.radius - length(sub(a.position, b.position));
      if (overlap > 1e-4) {
        collisionCount++;
        maxPenetration = Math.max(maxPenetration, overlap);
      }
  }
  return { collisionCount, maxPenetration };
}

function deformationMetrics(instances: readonly FlowerInstance[], params: PackingParams): { mean: number; max: number } {
  const rest = restPetals(params);
  const denominator = Math.max(...rest.map((petal) => Math.hypot(petal.x, petal.y)), EPS);
  let total = 0;
  let maximum = 0;
  let count = 0;

  for (const instance of instances) {
    for (let index = 0; index < instance.petals.length; index++) {
      const delta = Math.hypot(instance.petals[index].x - rest[index].x, instance.petals[index].y - rest[index].y) / denominator;
      total += delta;
      maximum = Math.max(maximum, delta);
      count++;
    }
  }
  return { mean: count > 0 ? total / count : 0, max: maximum };
}

function outsideCount(instances: readonly FlowerInstance[], params: PackingParams): number {
  if (params.domain === "sphere-surface") {
    return instances.filter((instance) => Math.abs(length(instance.anchor) - DOMAIN_RADIUS) > 1e-5).length;
  }
  const limit = PLANE_RADIUS - motifPlanarBound(params) + 1e-5;
  return instances.filter((instance) => Math.hypot(instance.anchor.x, instance.anchor.z) > limit).length;
}

export function solvePacking(
  initial: readonly FlowerInstance[],
  params: PackingParams,
  response: PackingResponse,
  proxyMode: CollisionProxyMode,
): PackingResult {
  const instances = initial.map(cloneInstance);
  let iterationsUsed = 0;

  for (let iteration = 0; iteration < params.iterations; iteration++) {
    iterationsUsed = iteration + 1;
    const collisions = resolveIteration(instances, params, response, proxyMode);
    if (collisions === 0) break;
  }

  // The spring phase shows how the motif yields, but it can pull a petal back
  // into a neighbour on the final step. Finish with a bounded contact-only
  // projection so the saved state does not hide that residual as deformation.
  if (response === "soft") {
    for (let polish = 0; polish < 64; polish++) {
      const collisions = resolveIteration(instances, params, response, proxyMode, false);
      iterationsUsed++;
      if (collisions === 0) break;
    }
  }

  const collision = collisionMetrics(instances, params, proxyMode);
  const outside = outsideCount(instances, params);
  const deformation = deformationMetrics(instances, params);
  const coverage = measureSurfaceCoverage(instances, params);
  const convergence = collision.collisionCount === 0 && outside === 0
    ? "converged"
    : Number.isFinite(collision.maxPenetration)
      ? "partial"
      : "failed";

  return {
    response,
    proxyMode,
    instances,
    diagnostics: {
      convergence,
      iterations: iterationsUsed,
      collisionCount: collision.collisionCount,
      maxPenetration: collision.maxPenetration,
      outsideCount: outside,
      meanDeformation: deformation.mean,
      maxDeformation: deformation.max,
      materialCoverage: coverage.material,
      territoryCoverage: coverage.territory,
      coverageSamples: coverage.samples,
    },
  };
}

function solveForTargetCoverage(
  params: PackingParams,
  response: PackingResponse,
  proxyMode: CollisionProxyMode,
): ComparisonPanel {
  let count = estimatedCountForCoverage(params);
  let countedParams = { ...params, count };
  let result = solvePacking(createInitialInstances(countedParams), countedParams, response, proxyMode);
  const measured = result.diagnostics.materialCoverage;
  if (measured > EPS && Math.abs(measured - params.targetCoverage) > 0.015) {
    const adjusted = Math.max(4, Math.min(96, Math.round(count * params.targetCoverage / measured)));
    if (adjusted !== count) {
      count = adjusted;
      countedParams = { ...params, count };
      result = solvePacking(createInitialInstances(countedParams), countedParams, response, proxyMode);
    }
  }
  return { label: "", params: countedParams, result };
}

export function createComparison(params: PackingParams, mode: ComparisonMode): PackingComparison {
  const safeParams: PackingParams = {
    seed: Math.trunc(finite(params.seed, DEFAULT_PACKING_PARAMS.seed)),
    count: Math.max(4, Math.min(96, Math.trunc(finite(params.count, DEFAULT_PACKING_PARAMS.count)))),
    flowerSize: Math.max(0.12, Math.min(0.38, finite(params.flowerSize, DEFAULT_PACKING_PARAMS.flowerSize))),
    clearance: Math.max(0, Math.min(0.14, finite(params.clearance, DEFAULT_PACKING_PARAMS.clearance))),
    softness: Math.max(0, Math.min(1, finite(params.softness, DEFAULT_PACKING_PARAMS.softness))),
    iterations: Math.max(10, Math.min(240, Math.trunc(finite(params.iterations, DEFAULT_PACKING_PARAMS.iterations)))),
    domain: params.domain === "plane" ? "plane" : "sphere-surface",
    packingBasis: params.packingBasis === "count" ? "count" : "coverage",
    targetCoverage: Math.max(0.08, Math.min(0.9, finite(params.targetCoverage, DEFAULT_PACKING_PARAMS.targetCoverage))),
    motif: normalizePackingMotif(params.motif),
  };
  const initial = createInitialInstances(safeParams);

  if (mode === "motif") {
    const baselineParams: PackingParams = { ...safeParams, motif: { ...DEFAULT_PACKING_MOTIF } };
    if (safeParams.packingBasis === "coverage") {
      const left = solveForTargetCoverage(baselineParams, "rigid", "multi");
      const right = solveForTargetCoverage(safeParams, "rigid", "multi");
      left.label = "4枚 · 現在の花";
      right.label = packingMotifLabel(safeParams.motif);
      return {
        mode,
        params: { ...safeParams, count: right.params.count },
        left,
        right,
      };
    }
    const baselineInitial = createInitialInstances(baselineParams);
    return {
      mode,
      params: safeParams,
      left: {
        label: "4枚 · 現在の花",
        params: baselineParams,
        result: solvePacking(baselineInitial, baselineParams, "rigid", "multi"),
      },
      right: {
        label: packingMotifLabel(safeParams.motif),
        params: safeParams,
        result: solvePacking(initial, safeParams, "rigid", "multi"),
      },
    };
  }

  if (mode === "proxy") {
    if (safeParams.packingBasis === "coverage") {
      const right = solveForTargetCoverage(safeParams, "rigid", "multi");
      const sharedParams = right.params;
      return {
        mode,
        params: sharedParams,
        left: {
          label: "Rigid · L0 外接球",
          params: sharedParams,
          result: solvePacking(createInitialInstances(sharedParams), sharedParams, "rigid", "single"),
        },
        right: { ...right, label: "Rigid · L1 複数球" },
      };
    }
    return {
      mode,
      params: safeParams,
      left: {
        label: "Rigid · L0 外接球",
        params: safeParams,
        result: solvePacking(initial, safeParams, "rigid", "single"),
      },
      right: {
        label: "Rigid · L1 複数球",
        params: safeParams,
        result: solvePacking(initial, safeParams, "rigid", "multi"),
      },
    };
  }

  if (safeParams.packingBasis === "coverage") {
    const left = solveForTargetCoverage(safeParams, "rigid", "multi");
    const sharedParams = left.params;
    return {
      mode,
      params: sharedParams,
      left: { ...left, label: "Rigid · 花を保つ" },
      right: {
        label: "Soft · 花が応答する",
        params: sharedParams,
        result: solvePacking(createInitialInstances(sharedParams), sharedParams, "soft", "multi"),
      },
    };
  }

  return {
    mode,
    params: safeParams,
    left: {
      label: "Rigid · 花を保つ",
      params: safeParams,
      result: solvePacking(initial, safeParams, "rigid", "multi"),
    },
    right: {
      label: "Soft · 花が応答する",
      params: safeParams,
      result: solvePacking(initial, safeParams, "soft", "multi"),
    },
  };
}

export function serializeComparison(comparison: PackingComparison): string {
  const record: FlowerPackingRecord = {
    formatVersion: 1,
    studyId: "flower-packing-spike",
    savedAt: new Date().toISOString(),
    comparison,
  };
  return JSON.stringify(record, null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function parseComparison(text: string): PackingComparison {
  const value = JSON.parse(text) as unknown;
  if (!isObject(value) || value.formatVersion !== 1 || value.studyId !== "flower-packing-spike") {
    throw new Error("Flower Packing Spike v1 の記録ではありません。");
  }
  const comparison = value.comparison;
  if (
    !isObject(comparison) ||
    (comparison.mode !== "response" && comparison.mode !== "proxy" && comparison.mode !== "motif")
  ) {
    throw new Error("比較モードを読み取れません。");
  }
  if (!isObject(comparison.params) || !isObject(comparison.left) || !isObject(comparison.right)) {
    throw new Error("比較条件または左右の結果がありません。");
  }
  const parsed = comparison as unknown as PackingComparison;
  const normalizedParams = {
    ...DEFAULT_PACKING_PARAMS,
    ...parsed.params,
    packingBasis: parsed.params.packingBasis === "coverage" ? "coverage" as const : "count" as const,
    targetCoverage: Math.max(
      0.08,
      Math.min(0.9, finite(parsed.params.targetCoverage, DEFAULT_PACKING_PARAMS.targetCoverage)),
    ),
    motif: normalizePackingMotif(parsed.params.motif),
  };
  const normalizePanel = (panel: ComparisonPanel): ComparisonPanel => {
    const panelParams: PackingParams = {
      ...normalizedParams,
      ...(panel.params ?? {}),
      motif: normalizePackingMotif(panel.params?.motif ?? normalizedParams.motif),
    };
    const diagnostics = panel.result.diagnostics;
    const coverage = typeof diagnostics.materialCoverage === "number"
      ? null
      : measureSurfaceCoverage(panel.result.instances, panelParams);
    return {
      ...panel,
      params: panelParams,
      result: {
        ...panel.result,
        diagnostics: {
          ...diagnostics,
          materialCoverage: diagnostics.materialCoverage ?? coverage!.material,
          territoryCoverage: diagnostics.territoryCoverage ?? coverage!.territory,
          coverageSamples: diagnostics.coverageSamples ?? coverage!.samples,
        },
      },
    };
  };
  return {
    ...parsed,
    params: normalizedParams,
    left: normalizePanel(parsed.left),
    right: normalizePanel(parsed.right),
  };
}

export function stableContentHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
import {
  FLOWER_FORM_SCALE,
  FLOWER_PETAL_COUNTS,
  createFlowerFormComponents,
  paramsForFlowerVariant,
  type FlowerFormParams,
  type FlowerPetalCount,
} from "./flowerForm.ts";

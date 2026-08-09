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
export type ComparisonMode = "response" | "proxy";

export interface PackingParams {
  seed: number;
  count: number;
  flowerSize: number;
  clearance: number;
  softness: number;
  iterations: number;
  domain: DomainKind;
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
}

export interface PackingResult {
  response: PackingResponse;
  proxyMode: CollisionProxyMode;
  instances: FlowerInstance[];
  diagnostics: PackingDiagnostics;
}

export interface ComparisonPanel {
  label: string;
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
const PETAL_COUNT = 4;
const EPS = 1e-8;

export const DEFAULT_PACKING_PARAMS: PackingParams = {
  seed: 304,
  count: 34,
  flowerSize: 0.25,
  clearance: 0.025,
  softness: 0.72,
  iterations: 120,
  domain: "sphere-surface",
};

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

function restPetals(flowerSize: number): Vec2[] {
  const spread = flowerSize * 1.06;
  return Array.from({ length: PETAL_COUNT }, (_, index) => {
    const a = (index / PETAL_COUNT) * Math.PI * 2;
    return { x: Math.cos(a) * spread, y: Math.sin(a) * spread };
  });
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
  const petals = restPetals(params.flowerSize);
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
  const coreRadius = params.flowerSize * 0.57;
  const petalRadius = params.flowerSize * 0.51;
  const lift = params.flowerSize * 0.34;
  const base = add(instance.anchor, scale(frame.normal, lift));

  const components: FlowerComponent[] = [
    {
      instanceId: instance.id,
      componentIndex: -1,
      kind: "core",
      position: base,
      radius: coreRadius,
    },
  ];

  for (let index = 0; index < instance.petals.length; index++) {
    const rotated = rotate2(instance.petals[index], instance.angle);
    const position = add(base, add(scale(frame.tangentX, rotated.x), scale(frame.tangentY, rotated.y)));
    components.push({
      instanceId: instance.id,
      componentIndex: index,
      kind: "petal",
      position,
      radius: petalRadius,
    });
  }

  return components;
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
      const core = components[0];
      const proxies: CollisionProxySphere[] = components.map((component) => ({
        instanceId: component.instanceId,
        componentIndex: component.componentIndex,
        position: component.position,
        radius: component.radius + inflation + surfaceGuard,
      }));

      for (const petal of components.slice(1)) {
        const neckRadius = Math.min(core.radius, petal.radius) * 0.36 + inflation + surfaceGuard;
        for (const t of [0.34, 0.67]) {
          proxies.push({
            instanceId: instance.id,
            componentIndex: petal.componentIndex,
            position: {
              x: core.position.x + (petal.position.x - core.position.x) * t,
              y: core.position.y + (petal.position.y - core.position.y) * t,
              z: core.position.z + (petal.position.z - core.position.z) * t,
            },
            radius: neckRadius,
          });
        }
      }
      return proxies;
    });
  }

  const petalRadius = params.flowerSize * 0.51;
  const boundRadius = params.flowerSize * 1.06 + petalRadius + inflation;
  return instances.map((instance) => {
    const frame = frameAt(instance.anchor, params.domain);
    return {
      instanceId: instance.id,
      componentIndex: -2,
      position: add(instance.anchor, scale(frame.normal, params.flowerSize * 0.34)),
      radius: boundRadius,
    };
  });
}

function moveAnchor(instance: FlowerInstance, displacement: Vec3, params: PackingParams): void {
  if (params.domain === "plane") {
    const limit = Math.max(0.05, PLANE_RADIUS - params.flowerSize * 1.65);
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
  const rest = restPetals(params.flowerSize);
  const spring = 0.012 + (1 - params.softness) * 0.06;

  for (let index = 0; index < instance.petals.length; index++) {
    const petal = instance.petals[index];
    petal.x += (rest[index].x - petal.x) * spring;
    petal.y += (rest[index].y - petal.y) * spring;
  }
  constrainSoftPetals(instance, params);
}

export function softPetalDisplacementLimit(params: PackingParams): number {
  const restRadius = params.flowerSize * 1.06;
  return restRadius * (0.1 + params.softness * 0.16);
}

function constrainSoftPetals(instance: FlowerInstance, params: PackingParams): void {
  const rest = restPetals(params.flowerSize);
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

  for (let aIndex = 0; aIndex < proxies.length; aIndex++) {
    const a = proxies[aIndex];
    for (let bIndex = aIndex + 1; bIndex < proxies.length; bIndex++) {
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

  for (let aIndex = 0; aIndex < proxies.length; aIndex++) {
    const a = proxies[aIndex];
    for (let bIndex = aIndex + 1; bIndex < proxies.length; bIndex++) {
      const b = proxies[bIndex];
      if (a.instanceId === b.instanceId) continue;
      const overlap = a.radius + b.radius - length(sub(a.position, b.position));
      if (overlap > 1e-4) {
        collisionCount++;
        maxPenetration = Math.max(maxPenetration, overlap);
      }
    }
  }
  return { collisionCount, maxPenetration };
}

function deformationMetrics(instances: readonly FlowerInstance[], params: PackingParams): { mean: number; max: number } {
  const rest = restPetals(params.flowerSize);
  const denominator = Math.max(params.flowerSize * 1.06, EPS);
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
  const limit = PLANE_RADIUS - params.flowerSize * 1.65 + 1e-5;
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
    },
  };
}

export function createComparison(params: PackingParams, mode: ComparisonMode): PackingComparison {
  const safeParams: PackingParams = {
    seed: Math.trunc(finite(params.seed, DEFAULT_PACKING_PARAMS.seed)),
    count: Math.max(4, Math.min(80, Math.trunc(finite(params.count, DEFAULT_PACKING_PARAMS.count)))),
    flowerSize: Math.max(0.12, Math.min(0.38, finite(params.flowerSize, DEFAULT_PACKING_PARAMS.flowerSize))),
    clearance: Math.max(0, Math.min(0.14, finite(params.clearance, DEFAULT_PACKING_PARAMS.clearance))),
    softness: Math.max(0, Math.min(1, finite(params.softness, DEFAULT_PACKING_PARAMS.softness))),
    iterations: Math.max(10, Math.min(240, Math.trunc(finite(params.iterations, DEFAULT_PACKING_PARAMS.iterations)))),
    domain: params.domain === "plane" ? "plane" : "sphere-surface",
  };
  const initial = createInitialInstances(safeParams);

  if (mode === "proxy") {
    return {
      mode,
      params: safeParams,
      left: { label: "Rigid · L0 外接球", result: solvePacking(initial, safeParams, "rigid", "single") },
      right: { label: "Rigid · L1 複数球", result: solvePacking(initial, safeParams, "rigid", "multi") },
    };
  }

  return {
    mode,
    params: safeParams,
    left: { label: "Rigid · 花を保つ", result: solvePacking(initial, safeParams, "rigid", "multi") },
    right: { label: "Soft · 花が応答する", result: solvePacking(initial, safeParams, "soft", "multi") },
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
  if (!isObject(comparison) || (comparison.mode !== "response" && comparison.mode !== "proxy")) {
    throw new Error("比較モードを読み取れません。");
  }
  if (!isObject(comparison.params) || !isObject(comparison.left) || !isObject(comparison.right)) {
    throw new Error("比較条件または左右の結果がありません。");
  }
  return comparison as unknown as PackingComparison;
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

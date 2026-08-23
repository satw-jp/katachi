import {
  DEFAULT_PACKING_PARAMS,
  PACKING_MOTIF_PRESETS,
  createComparison,
  flowerComponents,
  type FlowerInstance,
  type PackingParams,
  type PackingResult,
  type Vec3,
} from "../flower-packing-spike/packing.ts";

export type RouteStrategy = "center-stem" | "shortest-chord" | "surface-vein" | "build-arch";
export type ConnectorCrossSection = "round" | "diamond";
export type PatchLocation = "top" | "side" | "bottom";

export interface CoreNetworkParams {
  seed: number;
  targetCoverage: number;
  targetLongestMm: number;
  buildDirection: Vec3;
  neighbourCount: number;
  loopAmount: number;
  rootInset: number;
  innerDepthMax: number;
  archRise: number;
  middleDiameterMm: number;
  rootDiameterMm: number;
  crossSection: ConnectorCrossSection;
  meshResolution: number;
  layerHeightMm: number;
  overhangLimitDeg: number;
  bridgeLimitMm: number;
}

export interface FlowerCoreNode {
  id: number;
  instance: FlowerInstance;
  coreCenter: Vec3;
  coreRadius: number;
  normal: Vec3;
}

export interface CoreEdge {
  a: number;
  b: number;
  length: number;
}

export interface RouteSample {
  position: Vec3;
  radius: number;
  normalHint: Vec3;
}

export interface CoreRoute {
  edge: CoreEdge;
  strategy: RouteStrategy;
  samples: RouteSample[];
}

export interface NetworkFixture {
  result: PackingResult;
  packingParams: PackingParams;
  nodes: FlowerCoreNode[];
}

export const ROUTE_STRATEGIES: readonly RouteStrategy[] = [
  "shortest-chord",
  "surface-vein",
  "build-arch",
];

export const ROUTE_LABELS: Record<RouteStrategy, string> = {
  "center-stem": "中心へ集まる茎",
  "shortest-chord": "最短直線",
  "surface-vein": "表面葉脈",
  "build-arch": "造形アーチ",
};

export const GLOBAL_ROUTE_STRATEGIES: readonly RouteStrategy[] = [
  "center-stem",
  ...ROUTE_STRATEGIES,
];

export const DEFAULT_CORE_NETWORK_PARAMS: CoreNetworkParams = {
  seed: 304,
  targetCoverage: 0.5,
  targetLongestMm: 100,
  buildDirection: { x: 0, y: 1, z: 0 },
  neighbourCount: 5,
  loopAmount: 0.55,
  rootInset: 0.1,
  innerDepthMax: 0.24,
  archRise: 0.12,
  middleDiameterMm: 1.6,
  rootDiameterMm: 2.4,
  crossSection: "diamond",
  meshResolution: 144,
  layerHeightMm: 0.2,
  overhangLimitDeg: 45,
  bridgeLimitMm: 8,
};

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(value: Vec3, amount: number): Vec3 {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

export function normalize(value: Vec3, fallback: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 {
  const magnitude = length(value);
  return magnitude > 1e-9 ? scale(value, 1 / magnitude) : { ...fallback };
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(scale(a, 1 - t), scale(b, t));
}

export function createNetworkFixture(params: CoreNetworkParams): NetworkFixture {
  const motif = { ...PACKING_MOTIF_PRESETS[1].definition };
  const comparison = createComparison({
    ...DEFAULT_PACKING_PARAMS,
    seed: params.seed,
    packingBasis: "coverage",
    targetCoverage: params.targetCoverage,
    motif,
  }, "motif");
  const chosen = comparison.right;
  const nodes: FlowerCoreNode[] = chosen.result.instances.map((instance) => {
    const core = flowerComponents(instance, chosen.params).find((component) => component.kind === "core");
    if (!core) throw new Error(`花 ${instance.id} に花芯がありません。`);
    return {
      id: instance.id,
      instance,
      coreCenter: { ...core.position },
      coreRadius: core.radius,
      normal: normalize(instance.anchor),
    };
  });
  return { result: chosen.result, packingParams: chosen.params, nodes };
}

const LOCATION_DIRECTIONS: Record<PatchLocation, Vec3> = {
  top: { x: 0, y: 1, z: 0 },
  side: { x: 1, y: 0, z: 0 },
  bottom: { x: 0, y: -1, z: 0 },
};

export function selectPatch(nodes: readonly FlowerCoreNode[], location: PatchLocation): FlowerCoreNode[] {
  const direction = LOCATION_DIRECTIONS[location];
  const center = [...nodes].sort((a, b) => {
    const alignment = dot(b.normal, direction) - dot(a.normal, direction);
    return Math.abs(alignment) > 1e-9 ? alignment : a.id - b.id;
  })[0];
  const neighbours = nodes
    .filter((node) => node.id !== center.id)
    .sort((a, b) => {
      const separation = dot(center.normal, b.normal) - dot(center.normal, a.normal);
      return Math.abs(separation) > 1e-9 ? separation : a.id - b.id;
    })
    .slice(0, 6);
  return [center, ...neighbours].sort((a, b) => a.id - b.id);
}

interface CandidateEdge extends CoreEdge {
  key: string;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function buildCoreGraph(nodes: readonly FlowerCoreNode[], params: CoreNetworkParams): CoreEdge[] {
  if (nodes.length < 2) return [];
  const candidates = new Map<string, CandidateEdge>();
  const k = Math.max(1, Math.min(nodes.length - 1, Math.round(params.neighbourCount)));
  for (const node of nodes) {
    const nearest = nodes
      .filter((other) => other.id !== node.id)
      .sort((a, b) => {
        const delta = distance(node.coreCenter, a.coreCenter) - distance(node.coreCenter, b.coreCenter);
        return Math.abs(delta) > 1e-9 ? delta : a.id - b.id;
      })
      .slice(0, k);
    for (const other of nearest) {
      const key = edgeKey(node.id, other.id);
      const a = Math.min(node.id, other.id);
      const b = Math.max(node.id, other.id);
      candidates.set(key, { key, a, b, length: distance(node.coreCenter, other.coreCenter) });
    }
  }
  const ordered = [...candidates.values()].sort((a, b) =>
    a.length - b.length || a.a - b.a || a.b - b.b,
  );
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const parent = nodes.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const chosen: CandidateEdge[] = [];
  const used = new Set<string>();
  for (const edge of ordered) {
    const ia = indexById.get(edge.a)!;
    const ib = indexById.get(edge.b)!;
    const ra = find(ia);
    const rb = find(ib);
    if (ra === rb) continue;
    parent[ra] = rb;
    chosen.push(edge);
    used.add(edge.key);
  }
  const desiredExtra = Math.round(nodes.length * Math.max(0, Math.min(1, params.loopAmount)) * 0.55);
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of chosen) {
    degree.set(edge.a, degree.get(edge.a)! + 1);
    degree.set(edge.b, degree.get(edge.b)! + 1);
  }
  const extras = ordered
    .filter((edge) => !used.has(edge.key))
    .sort((a, b) => {
      const aNeed = Number(degree.get(a.a) === 1) + Number(degree.get(a.b) === 1);
      const bNeed = Number(degree.get(b.a) === 1) + Number(degree.get(b.b) === 1);
      return bNeed - aNeed || a.length - b.length || a.a - b.a || a.b - b.b;
    });
  for (const edge of extras.slice(0, desiredExtra)) {
    chosen.push(edge);
    degree.set(edge.a, degree.get(edge.a)! + 1);
    degree.set(edge.b, degree.get(edge.b)! + 1);
  }
  return chosen.map(({ a, b, length: edgeLength }) => ({ a, b, length: edgeLength }));
}

function slerpDirection(a: Vec3, b: Vec3, t: number): Vec3 {
  const na = normalize(a);
  const nb = normalize(b);
  const cosine = Math.max(-1, Math.min(1, dot(na, nb)));
  const angle = Math.acos(cosine);
  if (angle < 1e-5) return normalize(lerp(na, nb, t), na);
  const sine = Math.sin(angle);
  return add(scale(na, Math.sin((1 - t) * angle) / sine), scale(nb, Math.sin(t * angle) / sine));
}

export function realizeRoutes(
  nodes: readonly FlowerCoreNode[],
  edges: readonly CoreEdge[],
  strategy: RouteStrategy,
  params: CoreNetworkParams,
): CoreRoute[] {
  if (strategy === "center-stem") return realizeCenterStemRoutes(nodes, params);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const mmPerUnit = params.targetLongestMm / 4.1;
  const middleRadius = (params.middleDiameterMm * 0.5) / mmPerUnit;
  const rootRadius = (params.rootDiameterMm * 0.5) / mmPerUnit;
  const buildUp = normalize(params.buildDirection);
  return edges.map((edge) => {
    const a = nodeById.get(edge.a)!;
    const b = nodeById.get(edge.b)!;
    const start = sub(a.coreCenter, scale(a.normal, params.rootInset));
    const end = sub(b.coreCenter, scale(b.normal, params.rootInset));
    const startRadius = length(start);
    const endRadius = length(end);
    const sampleCount = 14;
    const samples: RouteSample[] = [];
    for (let index = 0; index <= sampleCount; index++) {
      const t = index / sampleCount;
      let position: Vec3;
      let normalHint: Vec3;
      if (strategy === "shortest-chord") {
        position = lerp(start, end, t);
        normalHint = normalize(lerp(a.normal, b.normal, t));
      } else {
        const direction = slerpDirection(start, end, t);
        const radial = startRadius * (1 - t) + endRadius * t;
        position = scale(direction, radial);
        if (strategy === "build-arch") {
          position = add(position, scale(buildUp, Math.sin(Math.PI * t) * params.archRise));
          const magnitude = length(position);
          const minimum = 1.72 - params.innerDepthMax;
          const maximum = 1.72 - 0.015;
          position = scale(normalize(position), Math.max(minimum, Math.min(maximum, magnitude)));
        }
        normalHint = direction;
      }
      const endWeight = Math.pow(Math.abs(t * 2 - 1), 3.2);
      const radius = middleRadius + (rootRadius - middleRadius) * endWeight;
      samples.push({ position, radius, normalHint });
    }
    return { edge, strategy, samples };
  });
}

export function buildCenterStemGraph(nodes: readonly FlowerCoreNode[]): CoreEdge[] {
  return nodes.map((node) => ({
    a: node.id,
    b: -1,
    length: length(sub(node.coreCenter, { x: 0, y: 0, z: 0 })),
  }));
}

export function realizeCenterStemRoutes(
  nodes: readonly FlowerCoreNode[],
  params: CoreNetworkParams,
): CoreRoute[] {
  const mmPerUnit = params.targetLongestMm / 4.1;
  const middleRadius = (params.middleDiameterMm * 0.5) / mmPerUnit;
  const rootRadius = (params.rootDiameterMm * 0.5) / mmPerUnit;
  const center = { x: 0, y: 0, z: 0 };
  return nodes.map((node) => {
    const start = sub(node.coreCenter, scale(node.normal, params.rootInset));
    const edge: CoreEdge = { a: node.id, b: -1, length: distance(start, center) };
    const samples: RouteSample[] = [];
    const sampleCount = 24;
    for (let index = 0; index <= sampleCount; index++) {
      const t = index / sampleCount;
      // 少し内側へ真っ直ぐ育ち、中心へ近づくほど穏やかに集まる。
      // 全球では全ての終点が同じ中心を共有するため、交差ではなく意図した接合になる。
      const eased = t * t * (3 - 2 * t);
      const position = lerp(start, center, eased);
      const rootWeight = Math.pow(1 - t, 3.2);
      const radius = middleRadius + (rootRadius - middleRadius) * rootWeight;
      samples.push({ position, radius, normalHint: normalize(position, node.normal) });
    }
    return { edge, strategy: "center-stem", samples };
  });
}

export function instancesForNodes(result: PackingResult, nodes: readonly FlowerCoreNode[]): FlowerInstance[] {
  const ids = new Set(nodes.map((node) => node.id));
  return result.instances.filter((instance) => ids.has(instance.id));
}

import {
  buildMeshFromField,
  encodeBinaryStl,
  inspectWatertight,
  orientMeshForSavedStl,
  type Bounds,
  type MeshBuildResult,
} from "../cloud-sculpt/meshExport.ts";
import {
  flowerComponents,
  type FlowerComponent,
  type PackingParams,
  type PackingResult,
  type Vec3,
} from "./packing.ts";
import { flowerFieldSdf } from "./unifiedField.ts";

export interface LaceMeshOptions {
  fusionRadius: number;
  resolution: number;
  targetLongestMm: number;
  minimumThicknessMm: number;
}

export interface LaceMeshInspection {
  mesh: MeshBuildResult;
  instanceGroups: number;
  meshComponents: number;
  minimumBridgeMm: number;
  removedFragmentTriangles: number;
  printReady: boolean;
  reasons: string[];
  options: LaceMeshOptions;
}

export const DEFAULT_LACE_MESH_OPTIONS: LaceMeshOptions = {
  fusionRadius: 0.1,
  resolution: 48,
  targetLongestMm: 100,
  minimumThicknessMm: 1.2,
};

interface PreparedFlower {
  instanceId: number;
  components: FlowerComponent[];
  center: Vec3;
  boundRadius: number;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function preparedFlowers(result: PackingResult, params: PackingParams, fusionRadius: number): PreparedFlower[] {
  return result.instances.map((instance) => {
    const components = flowerComponents(instance, params).map((component) => ({
      ...component,
      radius: component.radius + fusionRadius,
    }));
    const center = components.reduce(
      (sum, component) => ({
        x: sum.x + component.position.x / components.length,
        y: sum.y + component.position.y / components.length,
        z: sum.z + component.position.z / components.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
    const boundRadius = components.reduce(
      (maximum, component) => Math.max(maximum, distance(component.position, center) + component.radius),
      0,
    );
    return { instanceId: instance.id, components, center, boundRadius };
  });
}

function samplingBounds(flowers: readonly PreparedFlower[], margin: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const flower of flowers) {
    for (const component of flower.components) {
      const extent = component.radius + margin;
      minX = Math.min(minX, component.position.x - extent);
      minY = Math.min(minY, component.position.y - extent);
      minZ = Math.min(minZ, component.position.z - extent);
      maxX = Math.max(maxX, component.position.x + extent);
      maxY = Math.max(maxY, component.position.y + extent);
      maxZ = Math.max(maxZ, component.position.z + extent);
    }
  }
  if (!Number.isFinite(minX)) throw new Error("レース殻にする花がありません。");
  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

function fieldSampler(flowers: readonly PreparedFlower[], params: PackingParams): (x: number, y: number, z: number) => number {
  const blend = params.flowerSize * 0.24;
  return (x, y, z) => {
    const point = { x, y, z };
    let nearestIndex = 0;
    let nearestLowerBound = Infinity;
    for (let index = 0; index < flowers.length; index++) {
      const flower = flowers[index];
      const lowerBound = distance(point, flower.center) - flower.boundRadius;
      if (lowerBound < nearestLowerBound) {
        nearestLowerBound = lowerBound;
        nearestIndex = index;
      }
    }
    let value = flowerFieldSdf(flowers[nearestIndex].components, point, blend, params.motif.neck);
    for (let index = 0; index < flowers.length; index++) {
      if (index === nearestIndex) continue;
      const flower = flowers[index];
      if (distance(point, flower.center) - flower.boundRadius >= value) continue;
      value = Math.min(value, flowerFieldSdf(flower.components, point, blend, params.motif.neck));
    }
    return value;
  };
}

function sphereBridgeDiameter(a: FlowerComponent, b: FlowerComponent): number {
  const d = distance(a.position, b.position);
  if (d >= a.radius + b.radius) return 0;
  if (d <= Math.abs(a.radius - b.radius)) return Math.min(a.radius, b.radius) * 2;
  const alongA = (d * d + a.radius * a.radius - b.radius * b.radius) / (2 * d);
  return Math.sqrt(Math.max(0, a.radius * a.radius - alongA * alongA)) * 2;
}

function connectivity(flowers: readonly PreparedFlower[]): { groups: number; bottleneck: number } {
  if (flowers.length === 0) return { groups: 0, bottleneck: 0 };
  const edges: Array<{ a: number; b: number; diameter: number }> = [];
  for (let a = 0; a < flowers.length; a++) {
    for (let b = a + 1; b < flowers.length; b++) {
      let diameter = 0;
      for (const aComponent of flowers[a].components) {
        for (const bComponent of flowers[b].components) {
          diameter = Math.max(diameter, sphereBridgeDiameter(aComponent, bComponent));
        }
      }
      if (diameter > 0) edges.push({ a, b, diameter });
    }
  }
  edges.sort((a, b) => b.diameter - a.diameter);
  const parent = flowers.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  let bottleneck = Infinity;
  for (const edge of edges) {
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    bottleneck = Math.min(bottleneck, edge.diameter);
  }
  const groups = new Set(parent.map((_, index) => find(index))).size;
  return { groups, bottleneck: groups === 1 ? bottleneck : 0 };
}

function meshTriangleComponents(triangles: MeshBuildResult["triangles"]): number[][] {
  const parent = triangles.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const owner = new Map<string, number>();
  for (let index = 0; index < triangles.length; index++) {
    const triangle = triangles[index];
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      const key = `${Math.round(vertex.x * 1e5)},${Math.round(vertex.y * 1e5)},${Math.round(vertex.z * 1e5)}`;
      const previous = owner.get(key);
      if (previous === undefined) owner.set(key, index);
      else union(index, previous);
    }
  }
  const groups = new Map<number, number[]>();
  for (let index = 0; index < triangles.length; index++) {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(index);
    groups.set(root, group);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function removeMeshingFragments(mesh: MeshBuildResult): { mesh: MeshBuildResult; removed: number } {
  const components = meshTriangleComponents(mesh.triangles);
  if (components.length <= 1) return { mesh, removed: 0 };
  const largest = components[0].length;
  const fragmentLimit = Math.max(40, Math.floor(largest * 0.001));
  const keep = components.filter((component, index) => index === 0 || component.length > fragmentLimit);
  const removed = components
    .filter((component, index) => index > 0 && component.length <= fragmentLimit)
    .reduce((sum, component) => sum + component.length, 0);
  if (removed === 0) return { mesh, removed: 0 };
  const triangles = keep.flatMap((component) => component.map((index) => mesh.triangles[index]));
  return {
    mesh: { ...mesh, triangles, watertight: inspectWatertight(triangles, mesh.scaleMmPerUnit) },
    removed,
  };
}

export function inspectLaceConnectivity(
  result: PackingResult,
  params: PackingParams,
  fusionRadius: number,
): { groups: number; minimumBridge: number } {
  const graph = connectivity(preparedFlowers(result, params, Math.max(0, Math.min(0.12, fusionRadius))));
  return { groups: graph.groups, minimumBridge: graph.bottleneck };
}

export function buildLaceMesh(
  result: PackingResult,
  params: PackingParams,
  options: LaceMeshOptions,
): LaceMeshInspection {
  const safeOptions: LaceMeshOptions = {
    fusionRadius: Math.max(0, Math.min(0.12, options.fusionRadius)),
    resolution: Math.max(32, Math.min(96, Math.round(options.resolution))),
    targetLongestMm: Math.max(40, Math.min(240, options.targetLongestMm)),
    minimumThicknessMm: Math.max(0.4, Math.min(4, options.minimumThicknessMm)),
  };
  const flowers = preparedFlowers(result, params, safeOptions.fusionRadius);
  const blend = params.flowerSize * 0.24;
  const built = buildMeshFromField(
    samplingBounds(flowers, blend * 0.8),
    fieldSampler(flowers, params),
    { resolution: safeOptions.resolution, targetLongestMm: safeOptions.targetLongestMm },
  );
  const cleaned = removeMeshingFragments(built);
  const mesh = orientMeshForSavedStl(cleaned.mesh);
  const graph = connectivity(flowers);
  const meshComponents = meshTriangleComponents(mesh.triangles).length;
  const minimumBridgeMm = graph.bottleneck * mesh.scaleMmPerUnit;
  const reasons: string[] = [];
  if (graph.groups !== 1) reasons.push(`花のつながりが${graph.groups}群に分かれています`);
  if (meshComponents !== 1) reasons.push(`保存meshが${meshComponents}成分に分かれています`);
  if (!mesh.watertight.ok) reasons.push(`閉じていない辺が${mesh.watertight.openEdges}あります`);
  if (minimumBridgeMm < safeOptions.minimumThicknessMm) {
    reasons.push(`接続厚${minimumBridgeMm.toFixed(2)}mmが基準${safeOptions.minimumThicknessMm.toFixed(2)}mm未満です`);
  }
  return {
    mesh,
    instanceGroups: graph.groups,
    meshComponents,
    minimumBridgeMm,
    removedFragmentTriangles: cleaned.removed,
    printReady: reasons.length === 0,
    reasons,
    options: safeOptions,
  };
}

export function encodeLaceStl(inspection: LaceMeshInspection, name: string): ArrayBuffer {
  if (!inspection.printReady) throw new Error(inspection.reasons.join(" / "));
  return encodeBinaryStl(inspection.mesh, name);
}

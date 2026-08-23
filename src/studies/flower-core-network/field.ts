import {
  buildMeshFromField,
  inspectWatertight,
  orientMeshForSavedStl,
  type Bounds,
  type MeshBuildResult,
} from "../cloud-sculpt/meshExport.ts";
import { flowerComponents, type FlowerComponent, type FlowerInstance, type PackingParams, type Vec3 } from "../flower-packing-spike/packing.ts";
import { flowerFieldSdf } from "../flower-packing-spike/unifiedField.ts";
import {
  add,
  cross,
  distance,
  dot,
  length,
  normalize,
  scale,
  sub,
  type ConnectorCrossSection,
  type CoreNetworkParams,
  type CoreRoute,
} from "./model.ts";

interface PreparedFlower {
  components: FlowerComponent[];
  center: Vec3;
  boundRadius: number;
}

interface PreparedSegment {
  midpoint: Vec3;
  tangent: Vec3;
  up: Vec3;
  side: Vec3;
  halfLength: number;
  startRadius: number;
  endRadius: number;
}

export interface NetworkField {
  bounds: Bounds;
  sample: (x: number, y: number, z: number) => number;
}

interface SpatialIndex {
  flowerBuckets: Map<string, number[]>;
  segmentBuckets: Map<string, number[]>;
  origin: Vec3;
  cellSize: number;
}

function bucketKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function insertObject(
  buckets: Map<string, number[]>,
  index: number,
  center: Vec3,
  radius: number,
  origin: Vec3,
  cellSize: number,
): void {
  const minX = Math.floor((center.x - radius - origin.x) / cellSize);
  const minY = Math.floor((center.y - radius - origin.y) / cellSize);
  const minZ = Math.floor((center.z - radius - origin.z) / cellSize);
  const maxX = Math.floor((center.x + radius - origin.x) / cellSize);
  const maxY = Math.floor((center.y + radius - origin.y) / cellSize);
  const maxZ = Math.floor((center.z + radius - origin.z) / cellSize);
  for (let z = minZ; z <= maxZ; z++) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = bucketKey(x, y, z);
        const entries = buckets.get(key) ?? [];
        entries.push(index);
        buckets.set(key, entries);
      }
    }
  }
}

function buildSpatialIndex(
  flowers: readonly PreparedFlower[],
  segments: readonly PreparedSegment[],
  bounds: Bounds,
  flowerSize: number,
): SpatialIndex {
  const cellSize = Math.max(0.12, flowerSize * 0.55);
  const origin = bounds.min;
  const flowerBuckets = new Map<string, number[]>();
  const segmentBuckets = new Map<string, number[]>();
  flowers.forEach((flower, index) => insertObject(
    flowerBuckets, index, flower.center, flower.boundRadius + flowerSize * 0.08, origin, cellSize,
  ));
  segments.forEach((segment, index) => insertObject(
    segmentBuckets,
    index,
    segment.midpoint,
    segment.halfLength + Math.max(segment.startRadius, segment.endRadius) * 1.8,
    origin,
    cellSize,
  ));
  return { flowerBuckets, segmentBuckets, origin, cellSize };
}

function removeMeshingFragments(mesh: MeshBuildResult): MeshBuildResult {
  if (mesh.triangles.length === 0) return mesh;
  const parent = mesh.triangles.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const owner = new Map<string, number>();
  for (let index = 0; index < mesh.triangles.length; index++) {
    for (const vertex of [mesh.triangles[index].a, mesh.triangles[index].b, mesh.triangles[index].c]) {
      const key = `${Math.round(vertex.x * 1e5)},${Math.round(vertex.y * 1e5)},${Math.round(vertex.z * 1e5)}`;
      const previous = owner.get(key);
      if (previous === undefined) owner.set(key, index);
      else {
        const a = find(index);
        const b = find(previous);
        if (a !== b) parent[b] = a;
      }
    }
  }
  const components = new Map<number, number[]>();
  for (let index = 0; index < mesh.triangles.length; index++) {
    const root = find(index);
    const group = components.get(root) ?? [];
    group.push(index);
    components.set(root, group);
  }
  const sorted = [...components.values()].sort((a, b) => b.length - a.length);
  if (sorted.length <= 1) return mesh;
  const largest = sorted[0].length;
  const fragmentLimit = Math.max(40, Math.floor(largest * 0.001));
  const kept = sorted.filter((group, index) => index === 0 || group.length > fragmentLimit);
  const triangles = kept.flatMap((group) => group.map((index) => mesh.triangles[index]));
  return triangles.length === mesh.triangles.length
    ? mesh
    : { ...mesh, triangles, watertight: inspectWatertight(triangles, mesh.scaleMmPerUnit) };
}

function prepareFlowers(instances: readonly FlowerInstance[], packingParams: PackingParams): PreparedFlower[] {
  return instances.map((instance) => {
    const components = flowerComponents(instance, packingParams);
    const center = components.reduce((sum, component) => add(sum, scale(component.position, 1 / components.length)), { x: 0, y: 0, z: 0 });
    const boundRadius = components.reduce(
      (maximum, component) => Math.max(maximum, distance(component.position, center) + component.radius),
      0,
    );
    return { components, center, boundRadius };
  });
}

function perpendicularUp(tangent: Vec3, buildDirection: Vec3, hint: Vec3): Vec3 {
  let projected = sub(buildDirection, scale(tangent, dot(buildDirection, tangent)));
  if (length(projected) < 1e-5) projected = sub(hint, scale(tangent, dot(hint, tangent)));
  if (length(projected) < 1e-5) {
    const fallback = Math.abs(tangent.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    projected = sub(fallback, scale(tangent, dot(fallback, tangent)));
  }
  return normalize(projected);
}

function prepareSegments(routes: readonly CoreRoute[], params: CoreNetworkParams): PreparedSegment[] {
  const buildDirection = normalize(params.buildDirection);
  const segments: PreparedSegment[] = [];
  for (const route of routes) {
    for (let index = 0; index < route.samples.length - 1; index++) {
      const start = route.samples[index];
      const end = route.samples[index + 1];
      const delta = sub(end.position, start.position);
      const segmentLength = length(delta);
      if (segmentLength < 1e-7) continue;
      const tangent = scale(delta, 1 / segmentLength);
      const hint = normalize(add(start.normalHint, end.normalHint));
      const up = perpendicularUp(tangent, buildDirection, hint);
      const side = normalize(cross(tangent, up));
      segments.push({
        midpoint: scale(add(start.position, end.position), 0.5),
        tangent,
        up,
        side,
        halfLength: segmentLength * 0.5,
        startRadius: start.radius,
        endRadius: end.radius,
      });
    }
  }
  return segments;
}

function segmentField(point: Vec3, segment: PreparedSegment, crossSection: ConnectorCrossSection): number {
  const delta = sub(point, segment.midpoint);
  const signedAlong = dot(delta, segment.tangent);
  const localT = Math.max(0, Math.min(1, signedAlong / (segment.halfLength * 2) + 0.5));
  const radius = segment.startRadius * (1 - localT) + segment.endRadius * localT;
  const capExtension = radius * 0.35;
  const along = Math.abs(signedAlong) - segment.halfLength - capExtension;
  if (crossSection === "round") {
    const radial = sub(delta, scale(segment.tangent, signedAlong));
    return Math.max(along, length(radial) - radius);
  }
  const halfWidth = radius;
  const halfHeight = radius * 1.16;
  const diamond = (
    Math.abs(dot(delta, segment.side)) / halfWidth
    + Math.abs(dot(delta, segment.up)) / halfHeight
    - 1
  ) * Math.min(halfWidth, halfHeight);
  return Math.max(along, diamond);
}

function makeBounds(points: readonly Vec3[], margin: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x - margin);
    minY = Math.min(minY, point.y - margin);
    minZ = Math.min(minZ, point.z - margin);
    maxX = Math.max(maxX, point.x + margin);
    maxY = Math.max(maxY, point.y + margin);
    maxZ = Math.max(maxZ, point.z + margin);
  }
  if (!Number.isFinite(minX)) throw new Error("花芯ネットワークが空です。");
  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

export function createNetworkField(
  instances: readonly FlowerInstance[],
  packingParams: PackingParams,
  routes: readonly CoreRoute[],
  params: CoreNetworkParams,
): NetworkField {
  const flowers = prepareFlowers(instances, packingParams);
  const segments = prepareSegments(routes, params);
  const points: Vec3[] = [];
  let maximumRadius = 0;
  for (const flower of flowers) {
    for (const component of flower.components) {
      points.push(component.position);
      maximumRadius = Math.max(maximumRadius, component.radius);
    }
  }
  for (const route of routes) {
    for (const sample of route.samples) {
      points.push(sample.position);
      maximumRadius = Math.max(maximumRadius, sample.radius);
    }
  }
  const blend = packingParams.flowerSize * 0.24;
  const bounds = makeBounds(points, maximumRadius + blend * 0.8);
  const spatial = buildSpatialIndex(flowers, segments, bounds, packingParams.flowerSize);
  const sample = (x: number, y: number, z: number): number => {
    const point = { x, y, z };
    let value = Infinity;
    const cellKey = bucketKey(
      Math.floor((x - spatial.origin.x) / spatial.cellSize),
      Math.floor((y - spatial.origin.y) / spatial.cellSize),
      Math.floor((z - spatial.origin.z) / spatial.cellSize),
    );
    for (const index of spatial.flowerBuckets.get(cellKey) ?? []) {
      const flower = flowers[index];
      const lowerBound = distance(point, flower.center) - flower.boundRadius;
      if (lowerBound >= value) continue;
      value = Math.min(value, flowerFieldSdf(flower.components, point, blend, packingParams.motif.neck));
    }
    for (const index of spatial.segmentBuckets.get(cellKey) ?? []) {
      const segment = segments[index];
      const lowerBound = distance(point, segment.midpoint) - segment.halfLength - Math.max(segment.startRadius, segment.endRadius) * 1.7;
      if (lowerBound >= value) continue;
      value = Math.min(value, segmentField(point, segment, params.crossSection));
    }
    return Number.isFinite(value) ? value : spatial.cellSize;
  };
  return { bounds, sample };
}

export function buildNetworkMesh(field: NetworkField, params: CoreNetworkParams, resolution: number): MeshBuildResult {
  return orientMeshForSavedStl(removeMeshingFragments(buildMeshFromField(field.bounds, field.sample, {
    resolution,
    targetLongestMm: params.targetLongestMm,
  })));
}

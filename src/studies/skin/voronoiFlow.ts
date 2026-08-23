import type { Ball } from "../cloud-sculpt/field.ts";
import { fieldSdf } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import {
  captureMotifShapeParams,
  freshPatchId,
  generateShapePoints,
  projectToSurface,
  resetPatchIdCounter,
  type PackPatchesResult,
  type Patch,
  type Projected,
  type SkinParams,
} from "./field.ts";
import { connectSurfaceNeighboursWithLugs } from "./surfaceConnection.ts";

type Vec3 = { x: number; y: number; z: number };

export interface VoronoiPackResult extends PackPatchesResult {
  voronoiSeedCount: number;
  voronoiNeighbourEdges: number;
  voronoiProjectionFailures: number;
  voronoiRelaxationSteps: number;
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function fibonacciDirections(count: number, phase: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index + phase * Math.PI * 2;
    return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
  });
}

/** Deterministic approximate spherical CVT. Samples are assigned to the
 * nearest seed by maximum dot product, then each seed moves to its normalized
 * sample centroid. This is a visible prototype, not an exact geodesic CVT. */
function relaxDirections(seeds: Vec3[], steps: number, phase: number): Vec3[] {
  let relaxed = seeds;
  const samples = fibonacciDirections(Math.max(256, seeds.length * 8), phase + 0.173);
  for (let step = 0; step < steps; step++) {
    const sums = relaxed.map(() => ({ x: 0, y: 0, z: 0, count: 0 }));
    for (const sample of samples) {
      let owner = 0;
      let best = -Infinity;
      for (let index = 0; index < relaxed.length; index++) {
        const dot = sample.x * relaxed[index].x + sample.y * relaxed[index].y + sample.z * relaxed[index].z;
        if (dot > best) { best = dot; owner = index; }
      }
      sums[owner].x += sample.x;
      sums[owner].y += sample.y;
      sums[owner].z += sample.z;
      sums[owner].count++;
    }
    relaxed = relaxed.map((seed, index) => sums[index].count > 0 ? normalize(sums[index]) : seed);
  }
  return relaxed;
}

function projectOuterRay(
  host: Ball[], hostK: number, center: Vec3, direction: Vec3, outerRadius: number,
): Projected | null {
  let outsideRadius = outerRadius;
  let outsideValue = fieldSdf(host, hostK,
    center.x + direction.x * outsideRadius,
    center.y + direction.y * outsideRadius,
    center.z + direction.z * outsideRadius);
  for (let index = 95; index >= 0; index--) {
    const radius = (outerRadius * index) / 96;
    const x = center.x + direction.x * radius;
    const y = center.y + direction.y * radius;
    const z = center.z + direction.z * radius;
    const value = fieldSdf(host, hostK, x, y, z);
    if (outsideValue >= 0 && value <= 0) {
      return projectToSurface(host, hostK, x, y, z, 32);
    }
    outsideRadius = radius;
    outsideValue = value;
  }
  return null;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function packPatchesOnVoronoi(
  host: Ball[], hostK: number, params: SkinParams,
): VoronoiPackResult {
  resetPatchIdCounter(1);
  const requested = Math.max(24, Math.min(400, Math.round(params.voronoiSeedCount)));
  const steps = Math.max(0, Math.min(5, Math.round(params.voronoiRelaxationSteps)));
  const rng = makeRng(hashSeed(`${params.seed}#voronoi-cvt`));
  const directions = relaxDirections(fibonacciDirections(requested, rng()), steps, rng());
  const bounds = computeSamplingBounds(host, hostK);
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const projected = directions.map((direction) => projectOuterRay(host, hostK, center, direction, bounds.longest * 1.2));
  const valid = projected
    .map((surface, id) => surface ? { id, surface } : null)
    .filter((entry): entry is { id: number; surface: Projected } => entry !== null);
  const patches: Patch[] = [];
  const patchAnchors: Projected[] = [];
  for (let index = 0; index < valid.length; index++) {
    const nearest = valid
      .filter((_, other) => other !== index)
      .reduce((minimum, entry) => Math.min(minimum, distance(valid[index].surface, entry.surface)), Infinity);
    const patchId = freshPatchId();
    const authored = generateShapePoints(
      params.patchShape, host, hostK, valid[index].surface, Math.max(0.025, nearest * 0.56), params,
      makeRng(hashSeed(`${params.seed}#voronoi-${valid[index].id}`)), patchId, patches,
    );
    if (authored.length > 0) {
      patches.push({
        id: patchId,
        shape: params.patchShape,
        motifPlacement: params.motifPlacement ?? "surface",
        surfaceCellId: valid[index].id,
        surfaceCellKind: "voronoi",
        motifParams: captureMotifShapeParams(params),
        points: authored,
      });
      patchAnchors.push(valid[index].surface);
    }
  }

  const edges = new Map<string, { a: number; b: number; length: number }>();
  const nearestByPatch = patchAnchors.map((anchor, a) => patchAnchors
    .map((other, b) => ({ b, length: b === a ? Infinity : distance(anchor, other) }))
    .sort((left, right) => left.length - right.length).slice(0, 6));
  const nearestSets = nearestByPatch.map((entries) => new Set(entries.map((entry) => entry.b)));
  for (let a = 0; a < patches.length; a++) {
    for (const neighbour of nearestByPatch[a]) {
      if (!nearestSets[neighbour.b].has(a)) continue;
      const low = Math.min(a, neighbour.b);
      const high = Math.max(a, neighbour.b);
      edges.set(`${low}:${high}`, { a: low, b: high, length: neighbour.length });
    }
  }
  // Mutual-neighbour edges closely approximate local spherical Delaunay
  // adjacency. Add only the missing edges of a shortest spanning tree if a
  // very irregular host leaves that graph disconnected.
  const parent = patches.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (a: number, b: number): boolean => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return false;
    parent[rootA] = rootB;
    return true;
  };
  for (const edge of edges.values()) join(edge.a, edge.b);
  const allPairs: Array<{ a: number; b: number; length: number }> = [];
  for (let a = 0; a < patches.length; a++) for (let b = a + 1; b < patches.length; b++) {
    allPairs.push({ a, b, length: distance(patchAnchors[a], patchAnchors[b]) });
  }
  allPairs.sort((left, right) => left.length - right.length || left.a - right.a || left.b - right.b);
  for (const edge of allPairs) if (join(edge.a, edge.b)) edges.set(`${edge.a}:${edge.b}`, edge);

  const connected = params.quadConnectionMode === "local"
    ? connectSurfaceNeighboursWithLugs(
        host,
        hostK,
        [...edges.values()].map((edge) => ({ a: patches[edge.a], b: patches[edge.b], span: edge.length })),
        params.quadConnectionDepth,
        params.quadMeshJoinWidth,
      )
    : { connectorPointCount: 0, edgeCount: 0, openEdgeCount: 0, maximumConnectorRadius: 0 };
  return {
    patches,
    placed: patches.length,
    triedAndRejected: requested - patches.length,
    stoppedEarly: patches.length !== requested,
    flowerConnections: 0,
    flowerBridgePoints: 0,
    flowerFusedPatches: 0,
    flowerFusionRadius: 0,
    flowerFusionLocalized: false,
    flowerFusionAdjustedPoints: 0,
    flowerFusionEdgeCount: 0,
    flowerFusionOpenEdges: 0,
    quadConnectionShape: params.quadConnectionMode === "local" ? params.patchShape : null,
    quadConnectionLocalized: params.quadConnectionMode === "local",
    quadConnectionAdjustedPoints: connected.connectorPointCount,
    quadConnectionEdgeCount: edges.size,
    quadConnectionOpenEdges: connected.openEdgeCount,
    quadConnectionMaxRadius: connected.maximumConnectorRadius,
    voronoiSeedCount: patches.length,
    voronoiNeighbourEdges: edges.size,
    voronoiProjectionFailures: requested - patches.length,
    voronoiRelaxationSteps: steps,
  };
}

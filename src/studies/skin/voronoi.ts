// ---------------------------------------------------------------------------
// SKIN internal structure: a deterministic 3D Voronoi-edge graph.
//
// The generator is deliberately split in two:
//   1. generateInteriorPointCloud() chooses sites inside the current host.
//   2. generateVoronoiEdgeGraph() turns any supplied point cloud into the
//      graph contract consumed by the viewer and existing SKIN mesh pipeline.
//
// A 3D Voronoi edge is dual to a triangular face shared by two Delaunay
// tetrahedra. Bowyer-Watson supplies those tetrahedra; their circumcentres are
// the Voronoi vertices. Edges crossing the host boundary are clipped to a
// radius-aware inner isosurface, so the resulting struts meet (but do not
// protrude through) the outer SKIN shell when meshed.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { fieldSdf } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import type { PatchPoint } from "./field.ts";

export interface Vector3Value {
  x: number;
  y: number;
  z: number;
}

export interface InternalStructureNode {
  id: number;
  position: Vector3Value;
  radius: number;
}

export interface InternalStructureEdge {
  id: number;
  start: number;
  end: number;
  radius: number;
}

export interface InternalStructureStats {
  inputPoints: number;
  delaunayTetrahedra: number;
  candidateEdges: number;
  clippedEdges: number;
  removedShortEdges: number;
  removedOutsideEdges: number;
  removedIsolatedEdges: number;
  requestedTargets?: number;
  connectedTargets?: number;
  gridNodeCount?: number;
  gridEdgeCount?: number;
}

export interface InternalStructureGraph {
  kind: "voronoiEdge" | "targetedGrid";
  nodes: InternalStructureNode[];
  edges: InternalStructureEdge[];
  stats: InternalStructureStats;
}

interface Circumsphere {
  center: Vector3Value;
  radiusSq: number;
}

interface Tetrahedron {
  vertices: [number, number, number, number];
  sphere: Circumsphere;
}

interface FaceRecord {
  face: [number, number, number];
  count: number;
}

export interface VoronoiEdgeOptions {
  radius: number;
  signedDistance?: (point: Vector3Value) => number;
  minEdgeLength?: number;
  maxEdgeLength?: number;
}

const EPSILON = 1e-10;

function distanceSq(a: Vector3Value, b: Vector3Value): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.sqrt(distanceSq(a, b));
}

function lerp(a: Vector3Value, b: Vector3Value, t: number): Vector3Value {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function determinant3(
  a00: number, a01: number, a02: number,
  a10: number, a11: number, a12: number,
  a20: number, a21: number, a22: number,
): number {
  return a00 * (a11 * a22 - a12 * a21)
    - a01 * (a10 * a22 - a12 * a20)
    + a02 * (a10 * a21 - a11 * a20);
}

function solve3(
  rows: [[number, number, number], [number, number, number], [number, number, number]],
  rhs: [number, number, number],
): Vector3Value | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = rows;
  const det = determinant3(a, b, c, d, e, f, g, h, i);
  if (!Number.isFinite(det) || Math.abs(det) < EPSILON) return null;
  const x = determinant3(rhs[0], b, c, rhs[1], e, f, rhs[2], h, i) / det;
  const y = determinant3(a, rhs[0], c, d, rhs[1], f, g, rhs[2], i) / det;
  const z = determinant3(a, b, rhs[0], d, e, rhs[1], g, h, rhs[2]) / det;
  return Number.isFinite(x + y + z) ? { x, y, z } : null;
}

function circumSphere(
  a: Vector3Value,
  b: Vector3Value,
  c: Vector3Value,
  d: Vector3Value,
): Circumsphere | null {
  const sq = (p: Vector3Value) => p.x * p.x + p.y * p.y + p.z * p.z;
  const center = solve3(
    [
      [2 * (b.x - a.x), 2 * (b.y - a.y), 2 * (b.z - a.z)],
      [2 * (c.x - a.x), 2 * (c.y - a.y), 2 * (c.z - a.z)],
      [2 * (d.x - a.x), 2 * (d.y - a.y), 2 * (d.z - a.z)],
    ],
    [sq(b) - sq(a), sq(c) - sq(a), sq(d) - sq(a)],
  );
  if (!center) return null;
  const radiusSq = distanceSq(center, a);
  if (!Number.isFinite(radiusSq)) return null;
  return { center, radiusSq };
}

function makeTetrahedron(points: Vector3Value[], vertices: [number, number, number, number]): Tetrahedron | null {
  const sphere = circumSphere(
    points[vertices[0]],
    points[vertices[1]],
    points[vertices[2]],
    points[vertices[3]],
  );
  return sphere ? { vertices, sphere } : null;
}

function tetraFaces([a, b, c, d]: [number, number, number, number]): [number, number, number][] {
  return [[a, b, c], [a, d, b], [a, c, d], [b, d, c]];
}

function faceKey(face: [number, number, number]): string {
  return [...face].sort((a, b) => a - b).join(":");
}

function pointBounds(points: Vector3Value[]): { min: Vector3Value; max: Vector3Value; longest: number } {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
  }
  return {
    min,
    max,
    longest: Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1),
  };
}

function delaunayTetrahedralize(sourcePoints: Vector3Value[]): { points: Vector3Value[]; tetrahedra: Tetrahedron[] } {
  if (sourcePoints.length < 5) return { points: sourcePoints.map((point) => ({ ...point })), tetrahedra: [] };
  const bounds = pointBounds(sourcePoints);
  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };

  // A minute deterministic perturbation resolves co-spherical lattice sites
  // without turning Randomness=0 into a visibly random placement.
  const numericalScale = bounds.longest * 1e-7;
  const points = sourcePoints.map((point, index) => {
    const rng = makeRng(hashSeed(`voronoi-numerical-${index}`));
    return {
      x: point.x + (rng() - 0.5) * numericalScale,
      y: point.y + (rng() - 0.5) * numericalScale,
      z: point.z + (rng() - 0.5) * numericalScale,
    };
  });

  const s = bounds.longest * 32;
  const superStart = points.length;
  points.push(
    { x: center.x, y: center.y + 3 * s, z: center.z },
    { x: center.x + 2.828 * s, y: center.y - s, z: center.z },
    { x: center.x - 1.414 * s, y: center.y - s, z: center.z + 2.449 * s },
    { x: center.x - 1.414 * s, y: center.y - s, z: center.z - 2.449 * s },
  );
  const initial = makeTetrahedron(points, [superStart, superStart + 1, superStart + 2, superStart + 3]);
  let tetrahedra: Tetrahedron[] = initial ? [initial] : [];

  for (let pointIndex = 0; pointIndex < sourcePoints.length; pointIndex++) {
    const point = points[pointIndex];
    const bad = new Set<number>();
    const boundary = new Map<string, FaceRecord>();
    for (let tetraIndex = 0; tetraIndex < tetrahedra.length; tetraIndex++) {
      const tetra = tetrahedra[tetraIndex];
      const tolerance = Math.max(1, tetra.sphere.radiusSq) * 1e-9;
      if (distanceSq(point, tetra.sphere.center) <= tetra.sphere.radiusSq + tolerance) {
        bad.add(tetraIndex);
        for (const face of tetraFaces(tetra.vertices)) {
          const key = faceKey(face);
          const previous = boundary.get(key);
          if (previous) previous.count++;
          else boundary.set(key, { face, count: 1 });
        }
      }
    }
    if (bad.size === 0) continue;
    tetrahedra = tetrahedra.filter((_, tetraIndex) => !bad.has(tetraIndex));
    for (const record of boundary.values()) {
      if (record.count !== 1) continue;
      const next = makeTetrahedron(points, [record.face[0], record.face[1], record.face[2], pointIndex]);
      if (next) tetrahedra.push(next);
    }
  }

  tetrahedra = tetrahedra.filter((tetra) => tetra.vertices.every((vertex) => vertex < superStart));
  return { points, tetrahedra };
}

/**
 * Deterministic, approximately even sites inside the host. Density is the
 * requested site count; Randomness only jitters the candidate lattice, while
 * farthest-point selection keeps the overall distribution spatially broad.
 */
export function generateInteriorPointCloud(
  host: Ball[],
  hostK: number,
  density: number,
  randomness: number,
  seed: string,
  radius: number,
): Vector3Value[] {
  if (host.length === 0) return [];
  const target = Math.max(5, Math.round(density));
  const jitter = Math.max(0, Math.min(1, randomness));
  const bounds = computeSamplingBounds(host, hostK);
  const size = bounds.size;
  const geometricMean = Math.cbrt(Math.max(EPSILON, size.x * size.y * size.z));
  const base = Math.cbrt(target * 5);
  const nx = Math.max(2, Math.ceil(base * size.x / geometricMean));
  const ny = Math.max(2, Math.ceil(base * size.y / geometricMean));
  const nz = Math.max(2, Math.ceil(base * size.z / geometricMean));
  const dx = size.x / nx;
  const dy = size.y / ny;
  const dz = size.z / nz;
  const rng = makeRng(hashSeed(`${seed}:skin-internal-voronoi`));
  const margin = Math.max(0, radius);
  const candidates: Vector3Value[] = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const point = {
          x: bounds.min.x + (ix + 0.5 + (rng() - 0.5) * jitter * 0.86) * dx,
          y: bounds.min.y + (iy + 0.5 + (rng() - 0.5) * jitter * 0.86) * dy,
          z: bounds.min.z + (iz + 0.5 + (rng() - 0.5) * jitter * 0.86) * dz,
        };
        if (fieldSdf(host, hostK, point.x, point.y, point.z) <= -margin) candidates.push(point);
      }
    }
  }
  if (candidates.length <= target) return candidates;

  const selected: Vector3Value[] = [];
  const centre = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  let first = 0;
  for (let i = 1; i < candidates.length; i++) {
    if (distanceSq(candidates[i], centre) < distanceSq(candidates[first], centre)) first = i;
  }
  const available = candidates.map((_, index) => index);
  available.splice(available.indexOf(first), 1);
  selected.push(candidates[first]);
  while (selected.length < target && available.length > 0) {
    let bestAvailableIndex = 0;
    let bestDistance = -Infinity;
    for (let ai = 0; ai < available.length; ai++) {
      const candidate = candidates[available[ai]];
      let nearest = Infinity;
      for (const chosen of selected) nearest = Math.min(nearest, distanceSq(candidate, chosen));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestAvailableIndex = ai;
      }
    }
    selected.push(candidates[available[bestAvailableIndex]]);
    available.splice(bestAvailableIndex, 1);
  }
  return selected;
}

function clipToSignedDistance(
  inside: Vector3Value,
  outside: Vector3Value,
  signedDistance: (point: Vector3Value) => number,
  threshold: number,
): Vector3Value {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 28; i++) {
    const middle = (low + high) / 2;
    if (signedDistance(lerp(inside, outside, middle)) <= threshold) low = middle;
    else high = middle;
  }
  return lerp(inside, outside, low);
}

function segmentStaysInside(
  a: Vector3Value,
  b: Vector3Value,
  signedDistance: ((point: Vector3Value) => number) | undefined,
  threshold: number,
): boolean {
  if (!signedDistance) return true;
  for (let i = 1; i < 8; i++) {
    if (signedDistance(lerp(a, b, i / 8)) > threshold + 1e-7) return false;
  }
  return true;
}

/** Turn a supplied 3D point cloud into the bounded Voronoi edge graph. */
export function generateVoronoiEdgeGraph(
  sourcePoints: Vector3Value[],
  options: VoronoiEdgeOptions,
): InternalStructureGraph {
  const radius = Math.max(0.001, options.radius);
  const stats: InternalStructureStats = {
    inputPoints: sourcePoints.length,
    delaunayTetrahedra: 0,
    candidateEdges: 0,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  };
  const empty = (): InternalStructureGraph => ({ kind: "voronoiEdge", nodes: [], edges: [], stats });
  if (sourcePoints.length < 5) return empty();
  const { tetrahedra } = delaunayTetrahedralize(sourcePoints);
  stats.delaunayTetrahedra = tetrahedra.length;
  if (tetrahedra.length < 2) return empty();

  const extent = pointBounds(sourcePoints).longest;
  const minLength = options.minEdgeLength ?? Math.max(radius * 1.5, extent * 0.004);
  const maxLength = options.maxEdgeLength ?? extent * 0.9;
  const threshold = -radius;
  const faceOwners = new Map<string, number[]>();
  for (let tetraIndex = 0; tetraIndex < tetrahedra.length; tetraIndex++) {
    for (const face of tetraFaces(tetrahedra[tetraIndex].vertices)) {
      const key = faceKey(face);
      const owners = faceOwners.get(key);
      if (owners) owners.push(tetraIndex);
      else faceOwners.set(key, [tetraIndex]);
    }
  }

  const tolerance = Math.max(radius * 0.2, extent * 1e-6);
  const nodes: InternalStructureNode[] = [];
  const nodeByPosition = new Map<string, number>();
  const rawEdges: InternalStructureEdge[] = [];
  const edgeKeys = new Set<string>();
  const addNode = (position: Vector3Value): number => {
    const key = `${Math.round(position.x / tolerance)},${Math.round(position.y / tolerance)},${Math.round(position.z / tolerance)}`;
    const previous = nodeByPosition.get(key);
    if (previous !== undefined) return previous;
    const id = nodes.length;
    nodes.push({ id, position: { ...position }, radius });
    nodeByPosition.set(key, id);
    return id;
  };

  for (const owners of faceOwners.values()) {
    if (owners.length !== 2) continue; // unbounded Voronoi ray
    stats.candidateEdges++;
    let a = tetrahedra[owners[0]].sphere.center;
    let b = tetrahedra[owners[1]].sphere.center;
    const da = options.signedDistance?.(a) ?? -Infinity;
    const db = options.signedDistance?.(b) ?? -Infinity;
    const aInside = da <= threshold;
    const bInside = db <= threshold;
    if (!aInside && !bInside) {
      stats.removedOutsideEdges++;
      continue;
    }
    if (options.signedDistance && aInside !== bInside) {
      if (aInside) b = clipToSignedDistance(a, b, options.signedDistance, threshold);
      else a = clipToSignedDistance(b, a, options.signedDistance, threshold);
      stats.clippedEdges++;
    }
    const length = distance(a, b);
    if (length < minLength || length > maxLength) {
      stats.removedShortEdges++;
      continue;
    }
    if (!segmentStaysInside(a, b, options.signedDistance, threshold)) {
      stats.removedOutsideEdges++;
      continue;
    }
    const start = addNode(a);
    const end = addNode(b);
    if (start === end) {
      stats.removedShortEdges++;
      continue;
    }
    const key = start < end ? `${start}:${end}` : `${end}:${start}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    rawEdges.push({ id: rawEdges.length, start, end, radius });
  }

  // Remove a disconnected one-edge island when a larger graph exists.
  const adjacency = new Map<number, number[]>();
  for (let edgeIndex = 0; edgeIndex < rawEdges.length; edgeIndex++) {
    const edge = rawEdges[edgeIndex];
    for (const nodeId of [edge.start, edge.end]) {
      const incident = adjacency.get(nodeId);
      if (incident) incident.push(edgeIndex);
      else adjacency.set(nodeId, [edgeIndex]);
    }
  }
  const componentByEdge = new Array(rawEdges.length).fill(-1);
  const componentSizes: number[] = [];
  for (let startEdge = 0; startEdge < rawEdges.length; startEdge++) {
    if (componentByEdge[startEdge] >= 0) continue;
    const component = componentSizes.length;
    const queue = [startEdge];
    componentByEdge[startEdge] = component;
    let size = 0;
    while (queue.length > 0) {
      const edgeIndex = queue.pop()!;
      size++;
      const edge = rawEdges[edgeIndex];
      for (const nodeId of [edge.start, edge.end]) {
        for (const neighbour of adjacency.get(nodeId) ?? []) {
          if (componentByEdge[neighbour] >= 0) continue;
          componentByEdge[neighbour] = component;
          queue.push(neighbour);
        }
      }
    }
    componentSizes.push(size);
  }
  const keptEdges = rawEdges.filter((_, index) => {
    const isolated = rawEdges.length > 1 && componentSizes[componentByEdge[index]] === 1;
    if (isolated) stats.removedIsolatedEdges++;
    return !isolated;
  });
  const usedNodeIds = new Set(keptEdges.flatMap((edge) => [edge.start, edge.end]));
  const nodeRemap = new Map<number, number>();
  const compactNodes = nodes.filter((node) => usedNodeIds.has(node.id)).map((node, id) => {
    nodeRemap.set(node.id, id);
    return { ...node, id };
  });
  const edges = keptEdges.map((edge, id) => ({
    ...edge,
    id,
    start: nodeRemap.get(edge.start)!,
    end: nodeRemap.get(edge.end)!,
  }));
  return { kind: "voronoiEdge", nodes: compactNodes, edges, stats };
}

/**
 * Convert graph edges to the same overlapping-sphere vocabulary already used
 * by SKIN patches. The existing smooth-union + marching-tetrahedra export can
 * therefore mesh the internal graph without a second mesh generator.
 */
export function internalGraphToPatchPoints(graph: InternalStructureGraph): PatchPoint[] {
  const points: PatchPoint[] = [];
  const seen = new Set<string>();
  const add = (position: Vector3Value, radius: number): void => {
    const quantum = Math.max(radius * 0.2, 1e-6);
    const key = `${Math.round(position.x / quantum)},${Math.round(position.y / quantum)},${Math.round(position.z / quantum)}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push({ ...position, r: radius });
  };
  for (const node of graph.nodes) add(node.position, node.radius);
  for (const edge of graph.edges) {
    const start = graph.nodes[edge.start]?.position;
    const end = graph.nodes[edge.end]?.position;
    if (!start || !end) continue;
    const steps = Math.max(1, Math.ceil(distance(start, end) / Math.max(edge.radius * 1.25, 1e-4)));
    for (let i = 0; i <= steps; i++) add(lerp(start, end, i / steps), edge.radius);
  }
  return points;
}

export function buildVoronoiInternalStructure(
  host: Ball[],
  hostK: number,
  density: number,
  radius: number,
  randomness: number,
  seed: string,
): InternalStructureGraph {
  const points = generateInteriorPointCloud(host, hostK, density, randomness, seed, radius);
  return generateVoronoiEdgeGraph(points, {
    radius,
    signedDistance: (point) => fieldSdf(host, hostK, point.x, point.y, point.z),
  });
}

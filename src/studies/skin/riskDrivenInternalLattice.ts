// ---------------------------------------------------------------------------
// SKIN Risk-Driven Internal Lattice v0 — Checkpoint 1.
//
// This module turns one accepted Surface diagnosis triangle soup into a
// deterministic, read-only ranking.  It does not construct a lattice, alter
// the surface, or claim printability.  The input is deliberately limited to
// the current Surface mesh buffers and the existing +Z angle threshold.
// ---------------------------------------------------------------------------

import { surfaceOverhangAngleDeg } from "./surfaceAngleDiagnosis.ts";
import type { Vector3Value } from "./voronoi.ts";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export interface RiskBounds {
  readonly min: Vector3Value;
  readonly max: Vector3Value;
}

export interface RiskSeverityComponents {
  /** Downward overhang angle normalized to 0..1. */
  readonly overhangProxy: number;
  /** Risk area relative to the complete risky area. */
  readonly areaProxy: number;
  /** XY/Z span relative to the whole current Surface soup. */
  readonly spanProxy: number;
  /** Lowest point height normalized within the current Surface soup. */
  readonly heightProxy: number;
  /** Fraction of cluster faces with a nearby continuation above them. */
  readonly upwardContinuationProxy: number;
  /** Weighted v0 ranking score, not a physical quantity. */
  readonly score: number;
}

export interface RiskCluster {
  readonly id: number;
  /** Ordinals in the selected diagnosis triangle soup, never patch IDs. */
  readonly faceIds: readonly number[];
  readonly bounds: RiskBounds;
  readonly area: number;
  readonly lowestPoint: Vector3Value;
  readonly severity: RiskSeverity;
  readonly severityComponents: RiskSeverityComponents;
}

export interface SupportCandidate {
  readonly position: Vector3Value;
  readonly riskClusterId: number;
  /** A finite local risk-area proxy, not area removed by support. */
  readonly affectedRiskArea: number;
  /** Cluster area minus the local affected proxy. */
  readonly remainingRiskArea: number;
  /** Estimated lower-side run length in Surface source units. */
  readonly requiredLatticeLength: number;
  /** affectedRiskArea / requiredLatticeLength; ranking evidence only. */
  readonly supportGain: number;
}

export interface RiskDrivenInternalLatticeInput {
  /** The accepted current Surface triangle soup, 9 values per face. */
  readonly surfacePositions: Float32Array;
  /** Existing worker normals. They are validated for identity safety. */
  readonly surfaceNormals?: Float32Array;
  /** Existing Surface diagnosis threshold; build direction is fixed to +Z. */
  readonly thresholdDeg: number;
  /** Existing Surface sampling step (bounds.longest / resolution). */
  readonly meshStep: number;
  /** Optional accepted Surface resolution, shown as provenance only. */
  readonly resolution?: number;
}

export interface RiskDrivenInternalLatticeFacts {
  readonly status: "current";
  readonly enabled: true;
  readonly resolution: number | null;
  readonly thresholdDeg: number;
  readonly meshStep: number;
  /** Cell edge used by the finite-resolution centroid adjacency rule. */
  readonly adjacencyCellSize: number;
  readonly totalSurfaceArea: number;
  readonly riskyArea: number;
  readonly riskyFaceCount: number;
  readonly clusters: readonly RiskCluster[];
  /** Globally ranked, at most three candidates per cluster. */
  readonly candidates: readonly SupportCandidate[];
  readonly severityDistribution: Readonly<Record<RiskSeverity, number>>;
  /** Pure derivation diagnostics; not production telemetry or a print metric. */
  readonly diagnostics: {
    readonly faceCount: number;
    readonly clusterAdjacencyCandidateComparisons: number;
    readonly upwardContinuationCandidateComparisons: number;
  };
  readonly heuristicNote: string;
}

export interface RiskDrivenInternalLatticeDisabled {
  readonly status: "disabled";
  readonly enabled: false;
  readonly reason: string;
  readonly clusters: readonly [];
  readonly candidates: readonly [];
}

export type RiskDrivenInternalLatticeResult =
  | RiskDrivenInternalLatticeFacts
  | RiskDrivenInternalLatticeDisabled;

export interface RiskDrivenInternalLatticeOverlayState {
  readonly factsCurrent: boolean;
  readonly enabled: boolean;
}

export type RiskDrivenInternalLatticeOverlayAction =
  | "mesh-replaced"
  | "toggle-on"
  | "toggle-off"
  | "diagnosis-invalidated";

/**
 * Presentation ownership policy: replacing a mesh does not invalidate current
 * facts or an explicitly enabled overlay; only diagnosis invalidation does.
 * The renderer uses the same distinction by rebuilding, versus clearing, its
 * independent objects.
 */
export function reduceRiskDrivenInternalLatticeOverlayState(
  state: RiskDrivenInternalLatticeOverlayState,
  action: RiskDrivenInternalLatticeOverlayAction,
): RiskDrivenInternalLatticeOverlayState {
  switch (action) {
    case "mesh-replaced":
      return Object.freeze({ ...state });
    case "toggle-on":
      return Object.freeze({ factsCurrent: state.factsCurrent, enabled: state.factsCurrent });
    case "toggle-off":
      return Object.freeze({ factsCurrent: state.factsCurrent, enabled: false });
    case "diagnosis-invalidated":
      return Object.freeze({ factsCurrent: false, enabled: false });
  }
}

export const RISK_DRIVEN_INTERNAL_LATTICE_ALGORITHM_VERSION = "checkpoint-1-v0";
export const RISK_DRIVEN_MAX_CANDIDATES_PER_CLUSTER = 3;
export const RISK_DRIVEN_ADJACENCY_STEP_MULTIPLIER = 2.5;

const EPSILON = 1e-12;
const DEGENERATE_AREA_EPSILON = 1e-14;
const MAX_SAFE_GRID_INDEX = 1e9;
const RISK_SEVERITIES: readonly RiskSeverity[] = ["low", "medium", "high", "critical"];

interface FaceFact {
  readonly id: number;
  readonly vertices: readonly [Vector3Value, Vector3Value, Vector3Value];
  readonly centroid: Vector3Value;
  readonly bounds: RiskBounds;
  readonly area: number;
  readonly angleDeg: number;
}

interface MutableCluster {
  faceIds: number[];
  faces: FaceFact[];
}

interface CentroidSpatialTreeNode {
  readonly faceIndex: number;
  readonly left: CentroidSpatialTreeNode | null;
  readonly right: CentroidSpatialTreeNode | null;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly maxZ: number;
}

interface CentroidSpatialIndex2d {
  readonly root: CentroidSpatialTreeNode | null;
  readonly faces: readonly FaceFact[];
}

function freezeVector(value: Vector3Value): Vector3Value {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function freezeBounds(min: Vector3Value, max: Vector3Value): RiskBounds {
  return Object.freeze({ min: freezeVector(min), max: freezeVector(max) });
}

function disabled(reason: string): RiskDrivenInternalLatticeDisabled {
  return Object.freeze({
    status: "disabled",
    enabled: false,
    reason,
    clusters: Object.freeze([]) as readonly [],
    candidates: Object.freeze([]) as readonly [],
  });
}

function finiteBuffer(buffer: Float32Array): boolean {
  for (const value of buffer) if (!Number.isFinite(value)) return false;
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceSq(a: Vector3Value, b: Vector3Value): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function distance2dSq(a: Vector3Value, b: Vector3Value): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function unionFind(count: number): { find: (value: number) => number; union: (a: number, b: number) => void } {
  const parent = Array.from({ length: count }, (_, index) => index);
  const rank = new Uint8Array(count);
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    if (rank[rootA] < rank[rootB]) parent[rootA] = rootB;
    else if (rank[rootA] > rank[rootB]) parent[rootB] = rootA;
    else {
      parent[rootB] = rootA;
      rank[rootA]++;
    }
  };
  return { find, union };
}

function cellCoordinate(value: number, cellSize: number): number | null {
  const coordinate = Math.floor(value / cellSize);
  return Number.isSafeInteger(coordinate) && Math.abs(coordinate) <= MAX_SAFE_GRID_INDEX
    ? coordinate
    : null;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function buildCentroidSpatialTree(
  faces: readonly FaceFact[],
  indices: readonly number[],
  depth: number,
): CentroidSpatialTreeNode | null {
  if (indices.length === 0) return null;
  const axis = depth % 2;
  const sorted = indices.slice().sort((leftIndex, rightIndex) => {
    const left = faces[leftIndex];
    const right = faces[rightIndex];
    if (!left || !right) return left ? -1 : right ? 1 : leftIndex - rightIndex;
    const primary = axis === 0
      ? left.centroid.x - right.centroid.x
      : left.centroid.y - right.centroid.y;
    const secondary = axis === 0
      ? left.centroid.y - right.centroid.y
      : left.centroid.x - right.centroid.x;
    return primary || secondary || left.id - right.id;
  });
  const middle = Math.floor(sorted.length / 2);
  const faceIndex = sorted[middle];
  const face = faces[faceIndex];
  if (!face) return null;
  const left = buildCentroidSpatialTree(faces, sorted.slice(0, middle), depth + 1);
  const right = buildCentroidSpatialTree(faces, sorted.slice(middle + 1), depth + 1);
  let minX = face.centroid.x;
  let maxX = face.centroid.x;
  let minY = face.centroid.y;
  let maxY = face.centroid.y;
  let maxZ = face.centroid.z;
  for (const child of [left, right]) {
    if (!child) continue;
    if (child.minX < minX) minX = child.minX;
    if (child.maxX > maxX) maxX = child.maxX;
    if (child.minY < minY) minY = child.minY;
    if (child.maxY > maxY) maxY = child.maxY;
    if (child.maxZ > maxZ) maxZ = child.maxZ;
  }
  return { faceIndex, left, right, minX, maxX, minY, maxY, maxZ };
}

function buildCentroidSpatialIndex2d(
  faces: readonly FaceFact[],
): CentroidSpatialIndex2d | null {
  const indices = Array.from({ length: faces.length }, (_, index) => index);
  return { root: buildCentroidSpatialTree(faces, indices, 0), faces };
}

function distanceToBoundsSq2d(
  x: number,
  y: number,
  bounds: Pick<CentroidSpatialTreeNode, "minX" | "maxX" | "minY" | "maxY">,
): number {
  const dx = x < bounds.minX ? bounds.minX - x : x > bounds.maxX ? x - bounds.maxX : 0;
  const dy = y < bounds.minY ? bounds.minY - y : y > bounds.maxY ? y - bounds.maxY : 0;
  return dx * dx + dy * dy;
}

function hasNearbyAboveFace(
  index: CentroidSpatialIndex2d,
  faceIndex: number,
  face: FaceFact,
  radiusSq: number,
): { matched: boolean; comparisons: number } {
  if (!index.root) return { matched: false, comparisons: 0 };
  const thresholdZ = face.centroid.z + EPSILON;
  const stack: CentroidSpatialTreeNode[] = [index.root];
  let comparisons = 0;
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.maxZ <= thresholdZ || distanceToBoundsSq2d(face.centroid.x, face.centroid.y, node) > radiusSq) continue;
    const otherIndex = node.faceIndex;
    const other = index.faces[otherIndex];
    if (other && otherIndex !== faceIndex) {
      comparisons++;
      if (other.centroid.z > thresholdZ && distance2dSq(other.centroid, face.centroid) <= radiusSq) {
        return { matched: true, comparisons };
      }
    }
    // Visit the nearer subtree first for a stable, early exact witness. A
    // tie falls back to left-before-right, so repeated runs stay identical.
    const children: Array<{ node: CentroidSpatialTreeNode; distanceSq: number; order: number }> = [];
    if (node.left) children.push({
      node: node.left,
      distanceSq: distanceToBoundsSq2d(face.centroid.x, face.centroid.y, node.left),
      order: 0,
    });
    if (node.right) children.push({
      node: node.right,
      distanceSq: distanceToBoundsSq2d(face.centroid.x, face.centroid.y, node.right),
      order: 1,
    });
    children.sort((left, right) => left.distanceSq - right.distanceSq || left.order - right.order);
    for (let childIndex = children.length - 1; childIndex >= 0; childIndex--) {
      stack.push(children[childIndex].node);
    }
  }
  return { matched: false, comparisons };
}

function vectorMin(values: readonly Vector3Value[]): Vector3Value {
  let x = Infinity;
  let y = Infinity;
  let z = Infinity;
  for (const value of values) {
    if (value.x < x) x = value.x;
    if (value.y < y) y = value.y;
    if (value.z < z) z = value.z;
  }
  return { x, y, z };
}

function vectorMax(values: readonly Vector3Value[]): Vector3Value {
  let x = -Infinity;
  let y = -Infinity;
  let z = -Infinity;
  for (const value of values) {
    if (value.x > x) x = value.x;
    if (value.y > y) y = value.y;
    if (value.z > z) z = value.z;
  }
  return { x, y, z };
}

function boundsForFaces(faces: readonly FaceFact[]): RiskBounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const face of faces) {
    for (const point of face.vertices) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.z < minZ) minZ = point.z;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
      if (point.z > maxZ) maxZ = point.z;
    }
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function lowestPointForFaces(faces: readonly FaceFact[]): Vector3Value {
  let lowest: Vector3Value | null = null;
  for (const face of faces) {
    for (const point of face.vertices) {
      if (lowest === null || compareVector(point, lowest) < 0) lowest = point;
    }
  }
  return lowest ?? { x: 0, y: 0, z: 0 };
}

function compareVector(a: Vector3Value, b: Vector3Value): number {
  return a.z - b.z || a.y - b.y || a.x - b.x;
}

function measureFace(
  positions: Float32Array,
  faceId: number,
): FaceFact | null {
  const offset = faceId * 9;
  const a = { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
  const b = { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] };
  const c = { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] };
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const cross = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const crossLength = Math.hypot(cross.x, cross.y, cross.z);
  if (!Number.isFinite(crossLength) || crossLength <= DEGENERATE_AREA_EPSILON) return null;
  const normalZ = cross.z / crossLength;
  const vertices = [a, b, c] as const;
  const min = vectorMin(vertices);
  const max = vectorMax(vertices);
  return {
    id: faceId,
    vertices,
    centroid: {
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
      z: (a.z + b.z + c.z) / 3,
    },
    bounds: { min, max },
    area: crossLength * 0.5,
    angleDeg: normalZ < -1e-8 ? surfaceOverhangAngleDeg({ x: 0, y: 0, z: normalZ }) : 0,
  };
}

function aabbGapSq(a: RiskBounds, b: RiskBounds): number {
  const gap = (aMin: number, aMax: number, bMin: number, bMax: number): number => {
    if (aMax < bMin) return bMin - aMax;
    if (bMax < aMin) return aMin - bMax;
    return 0;
  };
  const x = gap(a.min.x, a.max.x, b.min.x, b.max.x);
  const y = gap(a.min.y, a.max.y, b.min.y, b.max.y);
  const z = gap(a.min.z, a.max.z, b.min.z, b.max.z);
  return x * x + y * y + z * z;
}

function severityFor(
  cluster: MutableCluster,
  totalRiskArea: number,
  globalBounds: RiskBounds,
  upwardContinuationProxy: number,
): { severity: RiskSeverity; components: RiskSeverityComponents } {
  let area = 0;
  let weightedAngle = 0;
  for (const face of cluster.faces) {
    area += face.area;
    weightedAngle += face.angleDeg * face.area;
  }
  const bounds = boundsForFaces(cluster.faces);
  const min = bounds.min;
  const max = bounds.max;
  const faceAngle = weightedAngle / Math.max(EPSILON, area);
  const globalSpan = Math.max(
    globalBounds.max.x - globalBounds.min.x,
    globalBounds.max.y - globalBounds.min.y,
    globalBounds.max.z - globalBounds.min.z,
    EPSILON,
  );
  const clusterSpan = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  const zSpan = Math.max(globalBounds.max.z - globalBounds.min.z, EPSILON);
  const overhangProxy = clamp(faceAngle / 90, 0, 1);
  const areaProxy = clamp(area / Math.max(totalRiskArea, EPSILON), 0, 1);
  const spanProxy = clamp(clusterSpan / globalSpan, 0, 1);
  const heightProxy = clamp((min.z - globalBounds.min.z) / zSpan, 0, 1);
  const score = clamp(
    overhangProxy * 0.45
      + areaProxy * 0.2
      + spanProxy * 0.15
      + heightProxy * 0.1
      + upwardContinuationProxy * 0.1,
    0,
    1,
  );
  const severity: RiskSeverity = score >= 0.75
    ? "critical"
    : score >= 0.5
      ? "high"
      : score >= 0.25
        ? "medium"
        : "low";
  return {
    severity,
    components: Object.freeze({
      overhangProxy,
      areaProxy,
      spanProxy,
      heightProxy,
      upwardContinuationProxy,
      score,
    }),
  };
}

function chooseCandidateSeeds(
  cluster: MutableCluster,
  meshStep: number,
): Vector3Value[] {
  const points: Vector3Value[] = [];
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const face of cluster.faces) {
    for (const point of face.vertices) {
      points.push(point);
      if (point.z < minZ) minZ = point.z;
      if (point.z > maxZ) maxZ = point.z;
    }
    points.push(face.centroid);
    if (face.centroid.z < minZ) minZ = face.centroid.z;
    if (face.centroid.z > maxZ) maxZ = face.centroid.z;
  }
  const lowerCutoff = minZ + Math.max(meshStep * 0.5, (maxZ - minZ) * 0.5);
  const quantization = Math.max(meshStep * 0.25, EPSILON);
  const seen = new Set<string>();
  points.sort(compareVector);
  const unique: Vector3Value[] = [];
  for (const point of points) {
    if (point.z > lowerCutoff + EPSILON) continue;
    const key = `${Math.round(point.x / quantization)},${Math.round(point.y / quantization)},${Math.round(point.z / quantization)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  if (unique.length <= RISK_DRIVEN_MAX_CANDIDATES_PER_CLUSTER) return unique;
  // Keep three points from the lower half, not only the centroid. The first,
  // quarter and halfway entries preserve deterministic vertical variation.
  const indices = [
    0,
    Math.floor((unique.length - 1) * 0.25),
    Math.floor((unique.length - 1) * 0.5),
  ];
  return indices.filter((index, position) => indices.indexOf(index) === position).map((index) => unique[index]);
}

function buildCandidates(
  clusters: readonly RiskCluster[],
  mutableClusters: readonly MutableCluster[],
  globalBounds: RiskBounds,
  meshStep: number,
): readonly SupportCandidate[] {
  const candidates: SupportCandidate[] = [];
  for (const [clusterIndex, cluster] of mutableClusters.entries()) {
    const riskCluster = clusters[clusterIndex];
    if (!riskCluster) continue;
    const seeds = chooseCandidateSeeds(cluster, meshStep);
    const influenceRadius = Math.max(meshStep * 2, EPSILON);
    const influenceRadiusSq = influenceRadius * influenceRadius;
    const clusterArea = riskCluster.area;
    for (const seed of seeds) {
      let affectedRiskArea = 0;
      let nearestDistanceSq = Infinity;
      let nearestArea = 0;
      for (const face of cluster.faces) {
        const distance = distanceSq(seed, face.centroid);
        if (distance < nearestDistanceSq) {
          nearestDistanceSq = distance;
          nearestArea = face.area;
        }
        // A point only ranks faces at or above its lower-side position. This
        // is a support-direction heuristic, not a load-path test.
        if (face.centroid.z + influenceRadius >= seed.z && distance <= influenceRadiusSq) {
          affectedRiskArea += face.area;
        }
      }
      if (!(affectedRiskArea > 0) && nearestArea > 0) affectedRiskArea = nearestArea;
      affectedRiskArea = clamp(affectedRiskArea, 0, clusterArea);
      const requiredLatticeLength = Math.max(meshStep, seed.z - globalBounds.min.z + meshStep * 0.25);
      const supportGain = affectedRiskArea / requiredLatticeLength;
      candidates.push(Object.freeze({
        position: freezeVector(seed),
        riskClusterId: riskCluster.id,
        affectedRiskArea,
        remainingRiskArea: Math.max(0, clusterArea - affectedRiskArea),
        requiredLatticeLength,
        supportGain,
      }));
    }
  }
  candidates.sort((a, b) => b.supportGain - a.supportGain
    || a.requiredLatticeLength - b.requiredLatticeLength
    || compareVector(a.position, b.position)
    || a.riskClusterId - b.riskClusterId);
  return Object.freeze(candidates);
}

/**
 * Derive the Checkpoint 1 facts. The output is a detached, deeply frozen
 * snapshot. Malformed/non-finite buffers fail closed with no partial facts.
 *
 * Spatial adjacency is intentionally finite: risky face centroids are placed
 * in cells of `2.5 × meshStep`; faces in neighboring cells join when their
 * AABBs are no farther apart than that same radius. This is a display/ranking
 * scale derived from the existing Surface sampling step, not a printability
 * or physical-connectivity claim.
 */
export function deriveRiskDrivenInternalLattice(
  input: RiskDrivenInternalLatticeInput,
): RiskDrivenInternalLatticeResult {
  const positions = input?.surfacePositions;
  const normals = input?.surfaceNormals;
  if (!(positions instanceof Float32Array) || positions.length === 0 || positions.length % 9 !== 0) {
    return disabled("Surface diagnosis triangle buffer is missing or malformed");
  }
  if (normals !== undefined && (!(normals instanceof Float32Array) || normals.length !== positions.length)) {
    return disabled("Surface diagnosis normal buffer is missing or mismatched");
  }
  if (!finiteBuffer(positions) || (normals !== undefined && !finiteBuffer(normals))) {
    return disabled("Surface diagnosis contains non-finite mesh values");
  }
  if (!Number.isFinite(input.thresholdDeg)) return disabled("Surface diagnosis threshold is non-finite");
  if (!Number.isFinite(input.meshStep) || input.meshStep <= 0) {
    return disabled("Surface sampling step is missing or non-positive");
  }
  if (input.resolution !== undefined
    && (!Number.isSafeInteger(input.resolution) || input.resolution <= 0)) {
    return disabled("Surface diagnosis resolution is malformed");
  }
  const thresholdDeg = clamp(input.thresholdDeg, 0, 90);
  const adjacencyCellSize = input.meshStep * RISK_DRIVEN_ADJACENCY_STEP_MULTIPLIER;
  if (!Number.isFinite(adjacencyCellSize) || adjacencyCellSize <= 0) {
    return disabled("Surface adjacency scale is non-finite");
  }

  const faceCount = positions.length / 9;
  const faces: FaceFact[] = [];
  let globalMinX = Infinity;
  let globalMinY = Infinity;
  let globalMinZ = Infinity;
  let globalMaxX = -Infinity;
  let globalMaxY = -Infinity;
  let globalMaxZ = -Infinity;
  let totalSurfaceArea = 0;
  for (let faceId = 0; faceId < faceCount; faceId++) {
    const measured = measureFace(positions, faceId);
    if (!measured) continue;
    faces.push(measured);
    for (const point of measured.vertices) {
      if (point.x < globalMinX) globalMinX = point.x;
      if (point.y < globalMinY) globalMinY = point.y;
      if (point.z < globalMinZ) globalMinZ = point.z;
      if (point.x > globalMaxX) globalMaxX = point.x;
      if (point.y > globalMaxY) globalMaxY = point.y;
      if (point.z > globalMaxZ) globalMaxZ = point.z;
    }
    totalSurfaceArea += measured.area;
  }
  if (faces.length === 0 || !Number.isFinite(totalSurfaceArea) || totalSurfaceArea <= 0) {
    return disabled("Surface diagnosis has no finite non-degenerate faces");
  }
  const globalBounds = freezeBounds(
    { x: globalMinX, y: globalMinY, z: globalMinZ },
    { x: globalMaxX, y: globalMaxY, z: globalMaxZ },
  );
  const riskyFaces = faces.filter((face) => face.angleDeg >= thresholdDeg && face.angleDeg > 0);
  const riskyArea = riskyFaces.reduce((sum, face) => sum + face.area, 0);

  const severityDistribution: Record<RiskSeverity, number> = {
    low: 0, medium: 0, high: 0, critical: 0,
  };
  if (riskyFaces.length === 0) {
    return Object.freeze({
      status: "current",
      enabled: true,
      resolution: input.resolution ?? null,
      thresholdDeg,
      meshStep: input.meshStep,
      adjacencyCellSize,
      totalSurfaceArea,
      riskyArea: 0,
      riskyFaceCount: 0,
      clusters: Object.freeze([]),
      candidates: Object.freeze([]),
      severityDistribution: Object.freeze(severityDistribution),
      diagnostics: Object.freeze({
        faceCount: faces.length,
        clusterAdjacencyCandidateComparisons: 0,
        upwardContinuationCandidateComparisons: 0,
      }),
      heuristicNote: "severity/supportGain は v0 の空間ランキングヒューリスティックです。危険の除去・荷重経路・印刷可能性は判定しません。",
    });
  }

  const upwardContinuationIndex = buildCentroidSpatialIndex2d(faces);
  if (!upwardContinuationIndex) return disabled("Surface upward-continuation grid index is out of range");
  let upwardContinuationCandidateComparisons = 0;
  const faceIndexById = new Map<number, number>();
  for (const [index, face] of faces.entries()) faceIndexById.set(face.id, index);

  const grid = new Map<string, number[]>();
  const faceCellCoordinates: Array<[number, number, number]> = [];
  for (const [index, face] of riskyFaces.entries()) {
    const x = cellCoordinate(face.centroid.x, adjacencyCellSize);
    const y = cellCoordinate(face.centroid.y, adjacencyCellSize);
    const z = cellCoordinate(face.centroid.z, adjacencyCellSize);
    if (x === null || y === null || z === null) return disabled("Surface adjacency grid index is out of range");
    faceCellCoordinates.push([x, y, z]);
    const key = cellKey(x, y, z);
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  }
  const disjoint = unionFind(riskyFaces.length);
  const adjacencyRadiusSq = adjacencyCellSize * adjacencyCellSize;
  let clusterAdjacencyCandidateComparisons = 0;
  for (let index = 0; index < riskyFaces.length; index++) {
    const [x, y, z] = faceCellCoordinates[index];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(cellKey(x + dx, y + dy, z + dz));
          if (!bucket) continue;
          for (const other of bucket) {
            if (other <= index) continue;
            clusterAdjacencyCandidateComparisons++;
            const first = riskyFaces[index];
            const second = riskyFaces[other];
            if (distanceSq(first.centroid, second.centroid) > adjacencyRadiusSq) continue;
            if (aabbGapSq(first.bounds, second.bounds) > adjacencyRadiusSq) continue;
            disjoint.union(index, other);
          }
        }
      }
    }
  }

  const clusterByRoot = new Map<number, MutableCluster>();
  for (const [index, face] of riskyFaces.entries()) {
    const root = disjoint.find(index);
    const cluster = clusterByRoot.get(root);
    if (cluster) {
      cluster.faceIds.push(face.id);
      cluster.faces.push(face);
    } else {
      clusterByRoot.set(root, { faceIds: [face.id], faces: [face] });
    }
  }
  const mutableClusters = Array.from(clusterByRoot.values()).sort((a, b) => a.faceIds[0] - b.faceIds[0]);
  const clusters: RiskCluster[] = [];
  for (const [clusterIndex, cluster] of mutableClusters.entries()) {
    cluster.faceIds.sort((a, b) => a - b);
    const clusterBounds = boundsForFaces(cluster.faces);
    const min = clusterBounds.min;
    const max = clusterBounds.max;
    let area = 0;
    for (const face of cluster.faces) area += face.area;
    const lowestPoint = lowestPointForFaces(cluster.faces);
    const aboveContinuationCount = cluster.faces.filter((face) => {
      const faceIndex = faceIndexById.get(face.id);
      if (faceIndex === undefined) return false;
      const query = hasNearbyAboveFace(upwardContinuationIndex, faceIndex, face, adjacencyRadiusSq);
      upwardContinuationCandidateComparisons += query.comparisons;
      return query.matched;
    }).length;
    const continuation = aboveContinuationCount / Math.max(1, cluster.faces.length);
    const { severity, components } = severityFor(cluster, riskyArea, globalBounds, continuation);
    severityDistribution[severity]++;
    clusters.push(Object.freeze({
      id: clusterIndex,
      faceIds: Object.freeze(cluster.faceIds.slice()),
      bounds: freezeBounds(min, max),
      area,
      lowestPoint: freezeVector(lowestPoint),
      severity,
      severityComponents: components,
    }));
  }
  const frozenClusters = Object.freeze(clusters);
  const candidates = buildCandidates(frozenClusters, mutableClusters, globalBounds, input.meshStep);
  return Object.freeze({
    status: "current",
    enabled: true,
    resolution: input.resolution ?? null,
    thresholdDeg,
    meshStep: input.meshStep,
    adjacencyCellSize,
    totalSurfaceArea,
    riskyArea,
    riskyFaceCount: riskyFaces.length,
    clusters: frozenClusters,
    candidates,
    severityDistribution: Object.freeze(severityDistribution),
    diagnostics: Object.freeze({
      faceCount: faces.length,
      clusterAdjacencyCandidateComparisons,
      upwardContinuationCandidateComparisons,
    }),
    heuristicNote: "severity/supportGain は v0 の空間ランキングヒューリスティックです。危険の除去・荷重経路・印刷可能性は判定しません。",
  });
}

/** Short alias for call sites that describe the output as a diagnosis. */
export const analyzeRiskDrivenInternalLattice = deriveRiskDrivenInternalLattice;

/** Extract clusters only; malformed input fails closed to an empty snapshot. */
export function deriveRiskClusters(input: RiskDrivenInternalLatticeInput): readonly RiskCluster[] {
  const result = deriveRiskDrivenInternalLattice(input);
  return result.status === "current" ? result.clusters : Object.freeze([]);
}

/** Keep the public severity order stable for UI/count presentation. */
export const riskSeverityOrder = RISK_SEVERITIES;

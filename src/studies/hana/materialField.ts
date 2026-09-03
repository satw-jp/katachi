import { smoothMin, type Ball } from "../cloud-sculpt/field.ts";
import {
  buildMeshFromField,
  buildMeshResultFromTriangles,
  buildMeshTrianglesFromFieldSlice,
  computeSamplingBounds,
  meshGridShape,
  type Bounds,
  type MeshBuildResult,
} from "../cloud-sculpt/meshExport.ts";
import type { HanaSmoothCenterlinePoint } from "./smoothCenterline.ts";
import type { HanaVector3 } from "./stroke3d.ts";

export const HANA_SURFACE_RESOLUTION = 48;
export const HANA_THICKNESS_MIN = 0.05;
export const HANA_THICKNESS_MAX = 0.5;
export const HANA_THICKNESS_DEFAULT = 0.18;
/** Conservative spatial influence radius for the smooth-union evaluator. */
const HANA_FIELD_INFLUENCE_K_MULTIPLIER = 4;

export interface HanaMaterialSample {
  position: HanaVector3;
  sourceT: number;
  pressure: number;
  time: number;
}

export interface HanaPointField {
  samples: HanaMaterialSample[];
  radius: number;
  blendK: number;
}

export interface HanaPointFieldEvaluationStats {
  queryCount: number;
  candidateEvaluationCount: number;
  maxCandidateCount: number;
  effectiveResolution?: number;
  bounds?: Bounds;
  gridShape?: { nx: number; ny: number; nz: number };
  gridSpacing?: { x: number; y: number; z: number };
}

export type HanaPreviewSurface = MeshBuildResult;

export interface HanaPointFieldMeshCooperativeOptions {
  /** Number of Z cells processed before yielding back to the browser. */
  zSlicesPerYield?: number;
  /** Test hook; production uses requestAnimationFrame/setTimeout. */
  yieldToBrowser?: () => Promise<void>;
  /** Stop before doing more work when a newer final generation supersedes this one. */
  shouldContinue?: () => boolean;
}

export class HanaPointFieldMeshCancelledError extends Error {
  constructor() {
    super("Point Field mesh generation was superseded by a newer generation.");
    this.name = "HanaPointFieldMeshCancelledError";
  }
}

export interface HanaPointFieldDiagnostics {
  bounds: Bounds;
  sampleCount: number;
  radius: number;
  requestedResolution: number;
  effectiveResolution: number;
  maxAdjacentSpacing: number;
  medianAdjacentSpacing: number;
  gridShape: { nx: number; ny: number; nz: number };
  gridSpacing: { x: number; y: number; z: number };
  negativeGridNodeCount: number;
  gridScanSkipped: boolean;
  triangleCount: number;
  componentCount: number;
}

interface HanaSpatialNode {
  index: number;
  axis: 0 | 1 | 2;
  left: HanaSpatialNode | null;
  right: HanaSpatialNode | null;
  min: HanaVector3;
  max: HanaVector3;
}

interface HanaSpatialIndex {
  root: HanaSpatialNode | null;
}

const spatialIndexes = new WeakMap<HanaPointField, HanaSpatialIndex>();

function coordinate(position: HanaVector3, axis: 0 | 1 | 2): number {
  return axis === 0 ? position.x : axis === 1 ? position.y : position.z;
}

function buildSpatialNode(
  samples: readonly HanaMaterialSample[],
  indices: readonly number[],
  depth: number,
): HanaSpatialNode | null {
  if (indices.length === 0) return null;
  const axis = (depth % 3) as 0 | 1 | 2;
  const sorted = [...indices].sort((a, b) => coordinate(samples[a].position, axis) - coordinate(samples[b].position, axis));
  const middle = Math.floor(sorted.length / 2);
  const index = sorted[middle];
  const left = buildSpatialNode(samples, sorted.slice(0, middle), depth + 1);
  const right = buildSpatialNode(samples, sorted.slice(middle + 1), depth + 1);
  const position = samples[index].position;
  const min = cloneVector(position);
  const max = cloneVector(position);
  for (const child of [left, right]) {
    if (!child) continue;
    min.x = Math.min(min.x, child.min.x);
    min.y = Math.min(min.y, child.min.y);
    min.z = Math.min(min.z, child.min.z);
    max.x = Math.max(max.x, child.max.x);
    max.y = Math.max(max.y, child.max.y);
    max.z = Math.max(max.z, child.max.z);
  }
  return { index, axis, left, right, min, max };
}

function buildSpatialIndex(samples: readonly HanaMaterialSample[]): HanaSpatialIndex {
  return {
    root: buildSpatialNode(samples, samples.map((_, index) => index), 0),
  };
}

function distanceSquaredToPoint(position: HanaVector3, x: number, y: number, z: number): number {
  return (position.x - x) ** 2 + (position.y - y) ** 2 + (position.z - z) ** 2;
}

function nearestSpatialSampleSquared(
  node: HanaSpatialNode | null,
  samples: readonly HanaMaterialSample[],
  x: number,
  y: number,
  z: number,
  best = Number.POSITIVE_INFINITY,
): number {
  if (!node) return best;
  const distance = distanceSquaredToPoint(samples[node.index].position, x, y, z);
  let nearest = Math.min(best, distance);
  const delta = coordinate({ x, y, z }, node.axis) - coordinate(samples[node.index].position, node.axis);
  const near = delta < 0 ? node.left : node.right;
  const far = delta < 0 ? node.right : node.left;
  nearest = nearestSpatialSampleSquared(near, samples, x, y, z, nearest);
  if (delta * delta < nearest) {
    nearest = nearestSpatialSampleSquared(far, samples, x, y, z, nearest);
  }
  return nearest;
}

function distanceSquaredToBounds(node: HanaSpatialNode, x: number, y: number, z: number): number {
  const dx = x < node.min.x ? node.min.x - x : x > node.max.x ? x - node.max.x : 0;
  const dy = y < node.min.y ? node.min.y - y : y > node.max.y ? y - node.max.y : 0;
  const dz = z < node.min.z ? node.min.z - z : z > node.max.z ? z - node.max.z : 0;
  return dx * dx + dy * dy + dz * dz;
}

function collectSpatialSamplesWithin(
  node: HanaSpatialNode | null,
  samples: readonly HanaMaterialSample[],
  x: number,
  y: number,
  z: number,
  radiusSquared: number,
  output: number[],
): void {
  if (!node || distanceSquaredToBounds(node, x, y, z) > radiusSquared) return;
  if (distanceSquaredToPoint(samples[node.index].position, x, y, z) <= radiusSquared) {
    output.push(node.index);
  }
  collectSpatialSamplesWithin(node.left, samples, x, y, z, radiusSquared, output);
  collectSpatialSamplesWithin(node.right, samples, x, y, z, radiusSquared, output);
}

function candidateSampleIndices(field: HanaPointField, x: number, y: number, z: number): number[] {
  const index = spatialIndexes.get(field);
  if (!index?.root) return field.samples.map((_, sampleIndex) => sampleIndex);
  const nearestSquared = nearestSpatialSampleSquared(index.root, field.samples, x, y, z);
  const candidateRadius = Math.sqrt(nearestSquared)
    + field.blendK * HANA_FIELD_INFLUENCE_K_MULTIPLIER
    + Number.EPSILON;
  const candidates: number[] = [];
  collectSpatialSamplesWithin(index.root, field.samples, x, y, z, candidateRadius ** 2, candidates);
  candidates.sort((a, b) => a - b);
  return candidates;
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function cloneVector(position: HanaVector3): HanaVector3 {
  return { x: position.x, y: position.y, z: position.z };
}

function cloneMaterialSample(sample: HanaMaterialSample): HanaMaterialSample {
  return {
    position: cloneVector(sample.position),
    sourceT: sample.sourceT,
    pressure: sample.pressure,
    time: sample.time,
  };
}

function interpolateMaterialSample(
  from: HanaSmoothCenterlinePoint,
  to: HanaSmoothCenterlinePoint,
  amount: number,
): HanaMaterialSample {
  return {
    position: {
      x: lerp(from.position.x, to.position.x, amount),
      y: lerp(from.position.y, to.position.y, amount),
      z: lerp(from.position.z, to.position.z, amount),
    },
    sourceT: lerp(from.sourceT, to.sourceT, amount),
    pressure: lerp(from.pressure, to.pressure, amount),
    time: lerp(from.time, to.time, amount),
  };
}

function centerlineArcLengths(centerline: readonly HanaSmoothCenterlinePoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < centerline.length; index += 1) {
    const from = centerline[index - 1].position;
    const to = centerline[index].position;
    cumulative.push(cumulative[index - 1] + Math.hypot(
      to.x - from.x,
      to.y - from.y,
      to.z - from.z,
    ));
  }
  return cumulative;
}

function normalizedRadius(radius: number): number {
  return Number.isFinite(radius) && radius > 0 ? radius : HANA_THICKNESS_DEFAULT;
}

export function materialSampleCount(
  centerline: readonly HanaSmoothCenterlinePoint[],
  radius: number,
): number {
  if (centerline.length === 0) return 0;
  if (centerline.length === 1) return 1;
  const cumulative = centerlineArcLengths(centerline);
  const totalLength = cumulative[cumulative.length - 1];
  return Math.max(2, Math.ceil(totalLength / normalizedRadius(radius)) + 1);
}

function sampleMaterialSamplesAtCount(
  centerline: readonly HanaSmoothCenterlinePoint[],
  count: number,
): HanaMaterialSample[] {
  if (centerline.length === 0) return [];
  if (centerline.length === 1) {
    return [interpolateMaterialSample(centerline[0], centerline[0], 0)];
  }

  const cumulative = centerlineArcLengths(centerline);
  const totalLength = cumulative[cumulative.length - 1];

  return Array.from({ length: count }, (_, outputIndex) => {
    if (outputIndex === 0) {
      return interpolateMaterialSample(centerline[0], centerline[0], 0);
    }
    if (outputIndex === count - 1) {
      const last = centerline[centerline.length - 1];
      return interpolateMaterialSample(last, last, 0);
    }
    const targetDistance = totalLength * outputIndex / (count - 1);
    let end = 1;
    while (end < centerline.length - 1 && cumulative[end] < targetDistance) end += 1;
    let start = end - 1;
    while (
      end < centerline.length - 1
      && cumulative[end] <= targetDistance
      && cumulative[end] - cumulative[start] <= Number.EPSILON
    ) {
      end += 1;
      start = end - 1;
    }
    const segmentLength = cumulative[end] - cumulative[start];
    const amount = segmentLength > Number.EPSILON
      ? Math.max(0, Math.min(1, (targetDistance - cumulative[start]) / segmentLength))
      : 0;
    return interpolateMaterialSample(centerline[start], centerline[end], amount);
  });
}

/** Thickness-driven arc-length resample of the derived Smooth Centerline only. */
export function sampleMaterialSamples(
  centerline: readonly HanaSmoothCenterlinePoint[],
  radius = HANA_THICKNESS_DEFAULT,
): HanaMaterialSample[] {
  return sampleMaterialSamplesAtCount(centerline, materialSampleCount(centerline, radius));
}

/**
 * Presentation-only bounded resample for the live path. Final authoritative
 * Material Samples must continue to use sampleMaterialSamples without a cap.
 */
export function sampleMaterialSamplesForPreview(
  centerline: readonly HanaSmoothCenterlinePoint[],
  radius = HANA_THICKNESS_DEFAULT,
  maxSamples = 256,
): HanaMaterialSample[] {
  const count = Math.min(
    materialSampleCount(centerline, radius),
    Math.max(2, Math.trunc(maxSamples)),
  );
  return sampleMaterialSamplesAtCount(centerline, count);
}

export function buildPointField(
  samples: readonly HanaMaterialSample[],
  radius: number,
): HanaPointField {
  const normalized = normalizedRadius(radius);
  const field: HanaPointField = {
    samples: samples.map(cloneMaterialSample),
    radius: normalized,
    blendK: normalized * 0.5,
  };
  spatialIndexes.set(field, buildSpatialIndex(field.samples));
  return field;
}

function sphereSdf(
  field: HanaPointField,
  sampleIndex: number,
  x: number,
  y: number,
  z: number,
): number {
  const sample = field.samples[sampleIndex];
  return Math.hypot(
    x - sample.position.x,
    y - sample.position.y,
    z - sample.position.z,
  ) - field.radius;
}

function pointFieldSdfForIndices(
  field: HanaPointField,
  x: number,
  y: number,
  z: number,
  indices: readonly number[],
  stats?: HanaPointFieldEvaluationStats,
): number {
  if (indices.length === 0) return 1e3;
  if (stats) {
    stats.candidateEvaluationCount += indices.length;
    stats.maxCandidateCount = Math.max(stats.maxCandidateCount, indices.length);
  }
  let distance = sphereSdf(field, indices[0], x, y, z);
  for (let index = 1; index < indices.length; index += 1) {
    distance = smoothMin(
      distance,
      sphereSdf(field, indices[index], x, y, z),
      field.blendK,
    );
  }
  return distance;
}

export function createPointFieldEvaluationStats(): HanaPointFieldEvaluationStats {
  return { queryCount: 0, candidateEvaluationCount: 0, maxCandidateCount: 0 };
}

/** Smooth union of equal-radius sphere SDF primitives. */
export function pointFieldSdf(
  field: HanaPointField,
  x: number,
  y: number,
  z: number,
  stats?: HanaPointFieldEvaluationStats,
): number {
  if (field.samples.length === 0) return 1e3;
  const indices = candidateSampleIndices(field, x, y, z);
  if (stats) stats.queryCount += 1;
  return pointFieldSdfForIndices(field, x, y, z, indices, stats);
}

/** Reference implementation retained for acceleration equivalence tests. */
export function pointFieldSdfBruteForce(
  field: HanaPointField,
  x: number,
  y: number,
  z: number,
): number {
  return pointFieldSdfForIndices(
    field,
    x,
    y,
    z,
    field.samples.map((_, index) => index),
  );
}

function pointFieldBounds(field: HanaPointField): Bounds {
  const balls: Ball[] = field.samples.map((sample, index) => ({
    id: index + 1,
    x: sample.position.x,
    y: sample.position.y,
    z: sample.position.z,
    r: field.radius,
  }));
  return computeSamplingBounds(balls, field.blendK);
}

export function pointFieldEffectiveResolution(
  field: HanaPointField,
  resolution = HANA_SURFACE_RESOLUTION,
): number {
  const bounds = pointFieldBounds(field);
  return Math.max(
    Math.round(resolution),
    Math.ceil(bounds.longest / Math.max(field.radius * 0.9, Number.EPSILON)),
  );
}

/** CPU preview extraction reusing Katachi's existing field-to-mesh core. */
export function buildPointFieldMesh(
  field: HanaPointField,
  resolution = HANA_SURFACE_RESOLUTION,
  evaluationStats?: HanaPointFieldEvaluationStats,
): HanaPreviewSurface {
  if (field.samples.length === 0) {
    throw new Error("Material Samplesが空のためSurfaceを生成できません。");
  }
  const bounds = pointFieldBounds(field);
  const effectiveResolution = pointFieldEffectiveResolution(field, resolution);
  if (evaluationStats) {
    const grid = meshGridShape(bounds, effectiveResolution);
    evaluationStats.effectiveResolution = effectiveResolution;
    evaluationStats.bounds = bounds;
    evaluationStats.gridShape = { nx: grid.nx, ny: grid.ny, nz: grid.nz };
    evaluationStats.gridSpacing = { x: grid.step, y: grid.step, z: grid.step };
  }
  return buildMeshFromField(bounds, (x, y, z) => pointFieldSdf(field, x, y, z, evaluationStats), {
    resolution: effectiveResolution,
    targetLongestMm: 1,
  });
}

function yieldToBrowser(): Promise<void> {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Final-only cooperative extraction. It evaluates the same field at the same
 * grid points and polygonizes the same contiguous Z-cell ranges as
 * buildPointFieldMesh, but yields between slices so pointerup does not own one
 * long main-thread task. The returned mesh remains authoritative; this is not
 * a lower-resolution or lower-density path.
 */
export async function buildPointFieldMeshCooperative(
  field: HanaPointField,
  resolution = HANA_SURFACE_RESOLUTION,
  evaluationStats?: HanaPointFieldEvaluationStats,
  options: HanaPointFieldMeshCooperativeOptions = {},
): Promise<HanaPreviewSurface> {
  if (field.samples.length === 0) {
    throw new Error("Material Samplesが空のためSurfaceを生成できません。");
  }
  const bounds = pointFieldBounds(field);
  const effectiveResolution = pointFieldEffectiveResolution(field, resolution);
  const grid = meshGridShape(bounds, effectiveResolution);
  if (evaluationStats) {
    evaluationStats.effectiveResolution = effectiveResolution;
    evaluationStats.bounds = bounds;
    evaluationStats.gridShape = { nx: grid.nx, ny: grid.ny, nz: grid.nz };
    evaluationStats.gridSpacing = { x: grid.step, y: grid.step, z: grid.step };
  }

  const zSlicesPerYield = Math.max(1, Math.trunc(options.zSlicesPerYield ?? 1));
  const yieldFunction = options.yieldToBrowser ?? yieldToBrowser;
  const shouldContinue = options.shouldContinue ?? (() => true);
  await yieldFunction();
  if (!shouldContinue()) throw new HanaPointFieldMeshCancelledError();
  const triangles = [] as ReturnType<typeof buildMeshTrianglesFromFieldSlice>;
  for (let zStart = 0; zStart < grid.nz; zStart += zSlicesPerYield) {
    if (!shouldContinue()) throw new HanaPointFieldMeshCancelledError();
    const zEnd = Math.min(grid.nz, zStart + zSlicesPerYield);
    triangles.push(...buildMeshTrianglesFromFieldSlice(
      bounds,
      (x, y, z) => pointFieldSdf(field, x, y, z, evaluationStats),
      effectiveResolution,
      zStart,
      zEnd,
    ));
    if (zEnd < grid.nz) {
      await yieldFunction();
      if (!shouldContinue()) throw new HanaPointFieldMeshCancelledError();
    }
  }
  return buildMeshResultFromTriangles(triangles, 1);
}

function triangleVertexKey(point: HanaVector3): string {
  return `${point.x.toFixed(9)},${point.y.toFixed(9)},${point.z.toFixed(9)}`;
}

function triangleComponentCount(mesh: HanaPreviewSurface): number {
  if (mesh.triangles.length === 0) return 0;
  const parents = new Int32Array(mesh.triangles.length);
  parents.forEach((_, index) => { parents[index] = index; });
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const firstTriangleByVertex = new Map<string, number>();
  mesh.triangles.forEach((triangle, index) => {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      const key = triangleVertexKey(point);
      const first = firstTriangleByVertex.get(key);
      if (first === undefined) firstTriangleByVertex.set(key, index);
      else union(index, first);
    }
  });
  const roots = new Set<number>();
  for (let index = 0; index < parents.length; index += 1) roots.add(find(index));
  return roots.size;
}

function sampleSpacingStats(samples: readonly HanaMaterialSample[]): { max: number; median: number } {
  const distances: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1].position;
    const to = samples[index].position;
    distances.push(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
  }
  if (distances.length === 0) return { max: 0, median: 0 };
  distances.sort((a, b) => a - b);
  const middle = Math.floor(distances.length / 2);
  return {
    max: distances[distances.length - 1],
    median: distances.length % 2 === 0
      ? (distances[middle - 1] + distances[middle]) / 2
      : distances[middle],
  };
}

export function diagnosePointField(
  field: HanaPointField,
  resolution = HANA_SURFACE_RESOLUTION,
  mesh: HanaPreviewSurface | null = null,
  options: { scanGrid?: boolean } = {},
): HanaPointFieldDiagnostics {
  const bounds = pointFieldBounds(field);
  const effectiveResolution = pointFieldEffectiveResolution(field, resolution);
  const shape = meshGridShape(bounds, effectiveResolution);
  let negativeGridNodeCount = 0;
  if (options.scanGrid !== false) {
    for (let z = 0; z <= shape.nz; z += 1) {
      for (let y = 0; y <= shape.ny; y += 1) {
        for (let x = 0; x <= shape.nx; x += 1) {
          if (pointFieldSdf(field, bounds.min.x + x * shape.step, bounds.min.y + y * shape.step, bounds.min.z + z * shape.step) < 0) {
            negativeGridNodeCount += 1;
          }
        }
      }
    }
  }
  const spacing = sampleSpacingStats(field.samples);
  return {
    bounds,
    sampleCount: field.samples.length,
    radius: field.radius,
    requestedResolution: resolution,
    effectiveResolution,
    maxAdjacentSpacing: spacing.max,
    medianAdjacentSpacing: spacing.median,
    gridShape: { nx: shape.nx, ny: shape.ny, nz: shape.nz },
    gridSpacing: { x: shape.step, y: shape.step, z: shape.step },
    negativeGridNodeCount,
    gridScanSkipped: options.scanGrid === false,
    triangleCount: mesh?.triangles.length ?? 0,
    componentCount: mesh ? triangleComponentCount(mesh) : 0,
  };
}

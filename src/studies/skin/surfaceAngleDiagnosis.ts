import type { Triangle } from "../cloud-sculpt/meshExport.ts";
import type { InternalStructureGraph, Vector3Value } from "./voronoi.ts";

export interface SurfaceAngleDiagnosisMetrics {
  thresholdDeg: number;
  surfaceArea: number;
  dangerousAreaBefore: number;
  dangerousAreaAfter: number;
  mitigatedArea: number;
  dangerousFaceCountBefore: number;
  dangerousFaceCountAfter: number;
  mitigatedFaceCount: number;
  contactTolerance: number;
}

export interface SurfaceAngleDiagnosisResult extends SurfaceAngleDiagnosisMetrics {
  beforeDangerPositions: Float32Array;
  afterDangerPositions: Float32Array;
  mitigatedPositions: Float32Array;
}

export type SurfaceAngleDiagnosisProgressStage =
  | "reachability-index"
  | "dangerous-face-contact"
  | "motif-attribution"
  | "motif-reachability"
  | "complete";

export interface SurfaceAngleDiagnosisProgress {
  stage: SurfaceAngleDiagnosisProgressStage;
  completed: number;
  total: number;
}

export interface InternalGraphReachabilityStats {
  /** Exact point-to-segment predicate evaluations (including safe fallbacks). */
  distanceChecks: number;
  /** Unique indexed candidates visited before exact AABB filtering. */
  indexedCandidates: number;
  /** Valid/uncertain segments kept in the bounded global fallback. */
  fallbackEdges: number;
  indexedEdges: number;
}

export interface InternalGraphReachabilityQuery {
  readonly stats: InternalGraphReachabilityStats;
  reachesPoint(point: Vector3Value, contactTolerance: number, pointRadius?: number): boolean;
}

export interface InternalGraphReachabilityCompileOptions {
  onProgress?: (progress: SurfaceAngleDiagnosisProgress) => void;
  /** Test/diagnostic override; production chooses a deterministic graph-size cell. */
  cellSize?: number;
}

export interface SurfaceAngleDiagnosisOptions {
  onProgress?: (progress: SurfaceAngleDiagnosisProgress) => void;
  reachabilityQuery?: InternalGraphReachabilityQuery;
  /** Test-only reference switch. Existing callers should leave this unset. */
  useLegacyReachability?: boolean;
}

interface FaceMeasurement {
  area: number;
  centroid: Vector3Value;
  normal: Vector3Value;
}

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function measureFace(triangle: Triangle): FaceMeasurement {
  const abx = triangle.b.x - triangle.a.x;
  const aby = triangle.b.y - triangle.a.y;
  const abz = triangle.b.z - triangle.a.z;
  const acx = triangle.c.x - triangle.a.x;
  const acy = triangle.c.y - triangle.a.y;
  const acz = triangle.c.z - triangle.a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const crossLength = Math.hypot(nx, ny, nz);
  const length = crossLength || 1;
  return {
    area: crossLength * 0.5,
    centroid: {
      x: (triangle.a.x + triangle.b.x + triangle.c.x) / 3,
      y: (triangle.a.y + triangle.b.y + triangle.c.y) / 3,
      z: (triangle.a.z + triangle.b.z + triangle.c.z) / 3,
    },
    normal: { x: nx / length, y: ny / length, z: nz / length },
  };
}

/**
 * Simple FDM-style convention used only by this first diagnostic:
 * 0deg = vertical wall, 90deg = downward horizontal ceiling. Upward-facing
 * faces are not overhang candidates. Build direction is fixed to +Z.
 */
export function surfaceOverhangAngleDeg(normal: Vector3Value): number {
  if (normal.z >= 0) return 0;
  return Math.asin(clamp(-normal.z, 0, 1)) * RAD_TO_DEG;
}

function pointSegmentDistance(point: Vector3Value, start: Vector3Value, end: Vector3Value): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq <= 1e-16 ? 0 : clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSq,
    0,
    1,
  );
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.y - (start.y + dy * t),
    point.z - (start.z + dz * t),
  );
}

interface ReachabilitySegment {
  edgeOrder: number;
  start: Vector3Value;
  end: Vector3Value;
  radius: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** False only for malformed radii whose legacy arithmetic must not prune. */
  aabbSafe: boolean;
}

const MAX_INDEX_BUCKETS_PER_EDGE = 2048;
const MAX_INDEX_BUCKET_REFERENCES = 2_000_000;

function finiteVector(value: Vector3Value | null | undefined): boolean {
  return Boolean(value)
    && Number.isFinite(value!.x) && Number.isFinite(value!.y) && Number.isFinite(value!.z);
}

function throttledProgress(
  onProgress: ((progress: SurfaceAngleDiagnosisProgress) => void) | undefined,
): ((progress: SurfaceAngleDiagnosisProgress) => void) | undefined {
  if (!onProgress) return undefined;
  const last = new Map<SurfaceAngleDiagnosisProgressStage, number>();
  return (progress) => {
    const previous = last.get(progress.stage);
    const step = progress.total > 0 ? Math.max(1, Math.ceil(progress.total / 100)) : 1;
    if (progress.completed !== 0 && progress.completed !== progress.total
      && previous !== undefined && progress.completed - previous < step) return;
    last.set(progress.stage, progress.completed);
    onProgress(progress);
  };
}

function cellIndex(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function legacyReachabilityWithNodes(
  point: Vector3Value,
  graph: InternalStructureGraph | null,
  nodeById: Map<number, { id: number; position: Vector3Value; radius: number }>,
  contactTolerance: number,
  pointRadius: number,
  stats?: InternalGraphReachabilityStats,
): boolean {
  if (!graph || graph.edges.length === 0) return false;
  for (const edge of graph.edges) {
    const start = nodeById.get(edge.start);
    const end = nodeById.get(edge.end);
    if (!start || !end) continue;
    if (stats) stats.distanceChecks++;
    if (pointSegmentDistance(point, start.position, end.position) <= edge.radius + pointRadius + contactTolerance) return true;
  }
  return false;
}

/**
 * Compile one graph into a deterministic exact broad phase. The broad phase
 * only rejects segments whose endpoint AABB cannot intersect the query's
 * radius/tolerance-expanded box; every retained candidate uses the original
 * pointSegmentDistance predicate. Long or malformed segments stay in a global
 * fallback so this optimization cannot introduce a false negative.
 */
export function compileInternalGraphReachability(
  graph: InternalStructureGraph | null,
  options: InternalGraphReachabilityCompileOptions = {},
): InternalGraphReachabilityQuery {
  const stats: InternalGraphReachabilityStats = {
    distanceChecks: 0,
    indexedCandidates: 0,
    fallbackEdges: 0,
    indexedEdges: 0,
  };
  const nodeById = new Map<number, { id: number; position: Vector3Value; radius: number }>();
  if (graph) {
    for (const node of graph.nodes) nodeById.set(node.id, node);
  }
  const indexed: ReachabilitySegment[] = [];
  const fallback: ReachabilitySegment[] = [];
  const totalEdges = graph?.edges.length ?? 0;
  const totalWork = totalEdges * 2;
  const reportProgress = throttledProgress(options.onProgress);
  const report = (completed: number): void => {
    reportProgress?.({ stage: "reachability-index", completed, total: totalWork });
  };
  if (!graph || totalEdges === 0) {
    report(0);
    return { stats, reachesPoint: () => false };
  }

  const validSegments: ReachabilitySegment[] = [];
  let useReferenceFallback = false;
  let uncertainEdgeCount = 0;
  report(0);
  for (let edgeOrder = 0; edgeOrder < graph.edges.length; edgeOrder++) {
    const edge = graph.edges[edgeOrder];
    const start = nodeById.get(edge.start);
    const end = nodeById.get(edge.end);
    if (start && end && finiteVector(start.position) && finiteVector(end.position)) {
      const radius = edge.radius;
      const minX = Math.min(start.position.x, end.position.x);
      const minY = Math.min(start.position.y, end.position.y);
      const minZ = Math.min(start.position.z, end.position.z);
      const maxX = Math.max(start.position.x, end.position.x);
      const maxY = Math.max(start.position.y, end.position.y);
      const maxZ = Math.max(start.position.z, end.position.z);
      const aabbSafe = Number.isFinite(radius) && radius >= 0;
      const segment: ReachabilitySegment = {
        edgeOrder,
        start: start.position,
        end: end.position,
        radius,
        minX: minX - (aabbSafe ? radius : 0),
        minY: minY - (aabbSafe ? radius : 0),
        minZ: minZ - (aabbSafe ? radius : 0),
        maxX: maxX + (aabbSafe ? radius : 0),
        maxY: maxY + (aabbSafe ? radius : 0),
        maxZ: maxZ + (aabbSafe ? radius : 0),
        aabbSafe,
      };
      if (aabbSafe) validSegments.push(segment);
      else {
        fallback.push(segment);
      }
    } else if (start && end) {
      // Keep malformed node positions on the literal all-edge path. The
      // legacy predicate may return false (NaN) or throw for truly malformed
      // objects; either outcome is more compatible than dropping the edge.
      useReferenceFallback = true;
      uncertainEdgeCount++;
    }
    report(edgeOrder + 1);
  }

  const globalBounds = validSegments.reduce((bounds, segment) => ({
    minX: Math.min(bounds.minX, segment.minX),
    minY: Math.min(bounds.minY, segment.minY),
    minZ: Math.min(bounds.minZ, segment.minZ),
    maxX: Math.max(bounds.maxX, segment.maxX),
    maxY: Math.max(bounds.maxY, segment.maxY),
    maxZ: Math.max(bounds.maxZ, segment.maxZ),
  }), {
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
  });
  // Size from the graph's global extent, rather than one short segment. A
  // target graph can contain 100k tiny diagonal edges spread over a large
  // volume; using one edge's span would put every edge into the long-edge
  // fallback even though the broad phase is perfectly safe.
  const globalExtent = Math.max(
    globalBounds.maxX - globalBounds.minX,
    globalBounds.maxY - globalBounds.minY,
    globalBounds.maxZ - globalBounds.minZ,
  );
  const expandedSpans = validSegments
    .map((segment) => Math.max(
      segment.maxX - segment.minX,
      segment.maxY - segment.minY,
      segment.maxZ - segment.minZ,
    ))
    .sort((a, b) => a - b);
  const typicalExpandedSpan = expandedSpans[Math.floor(expandedSpans.length / 2)] || 0;
  const globalGridCell = Number.isFinite(globalExtent) && globalExtent > 0
    ? globalExtent / Math.max(1, Math.ceil(Math.cbrt(Math.max(1, validSegments.length))))
    : 0;
  // Include the typical expanded tube span so short target edges do not cross
  // dozens of cells merely because the graph is dense. The multiplier leaves
  // a conservative margin for boundary alignment; exact distance checks still
  // decide every retained candidate.
  const autoCellSize = Math.max(globalGridCell, typicalExpandedSpan * 1.25, 1e-9);
  const cellSize = Number.isFinite(options.cellSize) && (options.cellSize ?? 0) > 0
    ? options.cellSize!
    : Math.max(1e-9, autoCellSize);
  const buckets = new Map<string, number[]>();
  let bucketReferences = 0;
  for (let validIndex = 0; validIndex < validSegments.length; validIndex++) {
    const segment = validSegments[validIndex];
    const minX = cellIndex(segment.minX, cellSize);
    const minY = cellIndex(segment.minY, cellSize);
    const minZ = cellIndex(segment.minZ, cellSize);
    const maxX = cellIndex(segment.maxX, cellSize);
    const maxY = cellIndex(segment.maxY, cellSize);
    const maxZ = cellIndex(segment.maxZ, cellSize);
    const count = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    if (!Number.isSafeInteger(count) || count > MAX_INDEX_BUCKETS_PER_EDGE
      || bucketReferences + count > MAX_INDEX_BUCKET_REFERENCES) {
      fallback.push(segment);
      report(totalEdges + validIndex + 1);
      continue;
    }
    bucketReferences += count;
    const indexedIndex = indexed.length;
    indexed.push(segment);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = cellKey(x, y, z);
          const list = buckets.get(key);
          if (list) list.push(indexedIndex);
          else buckets.set(key, [indexedIndex]);
        }
      }
    }
    report(totalEdges + validIndex + 1);
  }
  report(totalWork);
  stats.indexedEdges = indexed.length;
  stats.fallbackEdges = fallback.length + uncertainEdgeCount;

  // Candidate lists intentionally retain one entry per bucket reference, so
  // a long segment can occur many times in the same query's traversal. These
  // compile-owned stamps suppress duplicates without allocating or sorting a
  // per-query Set/array. A wrap clears the whole stamp table before reusing 1.
  const seenGeneration = new Uint32Array(indexed.length);
  let queryGeneration = 0;
  const nextQueryGeneration = (): number => {
    if (queryGeneration >= 0xffffffff) {
      seenGeneration.fill(0);
      queryGeneration = 1;
    } else {
      queryGeneration++;
    }
    return queryGeneration;
  };

  const query = (point: Vector3Value, contactTolerance: number, pointRadius = 0): boolean => {
    const safeQuery = finiteVector(point)
      && Number.isFinite(contactTolerance) && contactTolerance >= 0
      && Number.isFinite(pointRadius) && pointRadius >= 0
      && Number.isFinite(pointRadius + contactTolerance);
    if (!safeQuery || useReferenceFallback) {
      return legacyReachabilityWithNodes(point, graph, nodeById, contactTolerance, pointRadius, stats);
    }
    // A few ulps of outward slack make the broad phase conservative at exact
    // boundary/tolerance values despite IEEE-754 addition rounding.
    const expansion = pointRadius + contactTolerance;
    const broadExpansion = expansion + Number.EPSILON * Math.max(1, Math.abs(expansion)) * 4;
    const minX = cellIndex(point.x - broadExpansion, cellSize);
    const minY = cellIndex(point.y - broadExpansion, cellSize);
    const minZ = cellIndex(point.z - broadExpansion, cellSize);
    const maxX = cellIndex(point.x + broadExpansion, cellSize);
    const maxY = cellIndex(point.y + broadExpansion, cellSize);
    const maxZ = cellIndex(point.z + broadExpansion, cellSize);
    const queryBucketCount = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    if (!Number.isSafeInteger(queryBucketCount) || queryBucketCount > MAX_INDEX_BUCKETS_PER_EDGE * 32) {
      return legacyReachabilityWithNodes(point, graph, nodeById, contactTolerance, pointRadius, stats);
    }
    const generation = nextQueryGeneration();
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const list = buckets.get(cellKey(x, y, z));
          if (list) {
            for (const indexedIndex of list) {
              if (seenGeneration[indexedIndex] === generation) continue;
              seenGeneration[indexedIndex] = generation;
              const segment = indexed[indexedIndex];
              stats.indexedCandidates++;
              if (point.x < segment.minX - broadExpansion || point.x > segment.maxX + broadExpansion
                || point.y < segment.minY - broadExpansion || point.y > segment.maxY + broadExpansion
                || point.z < segment.minZ - broadExpansion || point.z > segment.maxZ + broadExpansion) continue;
              stats.distanceChecks++;
              if (pointSegmentDistance(point, segment.start, segment.end)
                <= segment.radius + pointRadius + contactTolerance) return true;
            }
          }
        }
      }
    }
    for (const segment of fallback) {
      if (segment.aabbSafe && (point.x < segment.minX - broadExpansion || point.x > segment.maxX + broadExpansion
        || point.y < segment.minY - broadExpansion || point.y > segment.maxY + broadExpansion
        || point.z < segment.minZ - broadExpansion || point.z > segment.maxZ + broadExpansion)) continue;
      stats.distanceChecks++;
      if (pointSegmentDistance(point, segment.start, segment.end)
        <= segment.radius + pointRadius + contactTolerance) return true;
    }
    return false;
  };

  return { stats, reachesPoint: query };
}

export function internalGraphReachesPoint(
  point: Vector3Value,
  graph: InternalStructureGraph | null,
  contactTolerance: number,
  pointRadius = 0,
): boolean {
  if (!graph || graph.edges.length === 0) return false;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    const start = nodeById.get(edge.start);
    const end = nodeById.get(edge.end);
    if (!start || !end) continue;
    if (pointSegmentDistance(point, start.position, end.position) <= edge.radius + pointRadius + contactTolerance) return true;
  }
  return false;
}

function appendPositionTriangle(target: number[], positions: Float32Array, offset: number): void {
  for (let index = 0; index < 9; index++) target.push(positions[offset + index]);
}

/**
 * Diagnose the outer SKIN only. Adding an internal graph does not change the
 * face angle itself; it can only move an over-threshold face from red
 * "unreached" to teal "internal member reaches this finite-resolution
 * contact band". This is deliberately a screening heuristic, not a slicer,
 * bridge simulation, load path, or printability claim.
 */
export function diagnoseSurfaceAngles(
  surfaceTriangles: Triangle[],
  internalGraph: InternalStructureGraph | null,
  thresholdDeg: number,
  meshStep: number,
  options: SurfaceAngleDiagnosisOptions = {},
): SurfaceAngleDiagnosisResult {
  const positions = new Float32Array(surfaceTriangles.length * 9);
  let cursor = 0;
  for (const triangle of surfaceTriangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[cursor++] = point.x;
      positions[cursor++] = point.y;
      positions[cursor++] = point.z;
    }
  }
  return diagnoseSurfaceAnglePositions(positions, internalGraph, thresholdDeg, meshStep, options);
}

/** Buffer form used by the final-precision parallel mesh Worker. */
export function diagnoseSurfaceAnglePositions(
  positions: Float32Array,
  internalGraph: InternalStructureGraph | null,
  thresholdDeg: number,
  meshStep: number,
  options: SurfaceAngleDiagnosisOptions = {},
): SurfaceAngleDiagnosisResult {
  const threshold = clamp(Number.isFinite(thresholdDeg) ? thresholdDeg : 45, 0, 90);
  const contactTolerance = Math.max(1e-6, Math.abs(meshStep) * 1.75);
  const reportProgress = throttledProgress(options.onProgress);
  const reachability = options.useLegacyReachability
    ? null
    : options.reachabilityQuery ?? compileInternalGraphReachability(internalGraph, { onProgress: reportProgress });
  const before: number[] = [];
  const after: number[] = [];
  const mitigated: number[] = [];
  let surfaceArea = 0;
  let dangerousAreaBefore = 0;
  let dangerousAreaAfter = 0;
  let mitigatedArea = 0;
  let dangerousFaceCountBefore = 0;
  let dangerousFaceCountAfter = 0;
  let mitigatedFaceCount = 0;
  const totalFaces = Math.floor(positions.length / 9);
  reportProgress?.({ stage: "dangerous-face-contact", completed: 0, total: totalFaces });

  for (let offset = 0, faceIndex = 0; offset + 8 < positions.length; offset += 9, faceIndex++) {
    const triangle: Triangle = {
      a: { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] },
      b: { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] },
      c: { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] },
    };
    const face = measureFace(triangle);
    if (face.area <= 1e-14) {
      reportProgress?.({ stage: "dangerous-face-contact", completed: faceIndex + 1, total: totalFaces });
      continue;
    }
    surfaceArea += face.area;
    if (face.normal.z >= -1e-8 || surfaceOverhangAngleDeg(face.normal) < threshold) {
      reportProgress?.({ stage: "dangerous-face-contact", completed: faceIndex + 1, total: totalFaces });
      continue;
    }
    appendPositionTriangle(before, positions, offset);
    dangerousAreaBefore += face.area;
    dangerousFaceCountBefore++;
    const reached = reachability
      ? reachability.reachesPoint(face.centroid, contactTolerance)
      : internalGraphReachesPoint(face.centroid, internalGraph, contactTolerance);
    if (reached) {
      appendPositionTriangle(mitigated, positions, offset);
      mitigatedArea += face.area;
      mitigatedFaceCount++;
    } else {
      appendPositionTriangle(after, positions, offset);
      dangerousAreaAfter += face.area;
      dangerousFaceCountAfter++;
    }
    reportProgress?.({ stage: "dangerous-face-contact", completed: faceIndex + 1, total: totalFaces });
  }

  reportProgress?.({ stage: "complete", completed: 1, total: 1 });

  return {
    thresholdDeg: threshold,
    surfaceArea,
    dangerousAreaBefore,
    dangerousAreaAfter,
    mitigatedArea,
    dangerousFaceCountBefore,
    dangerousFaceCountAfter,
    mitigatedFaceCount,
    contactTolerance,
    beforeDangerPositions: new Float32Array(before),
    afterDangerPositions: new Float32Array(after),
    mitigatedPositions: new Float32Array(mitigated),
  };
}

import type {
  InternalStructureEdge,
  InternalStructureGraph,
  Vector3Value,
} from "../voronoi.ts";
import {
  auditSparseRemovableSupportCapsule,
  type SparseRemovableSupportRequest,
  type SparseRemovableSupportResult,
  type SparseRemovableSupportRoute,
  type SparseRemovableSupportTarget,
  type SparseSupportRouteSegment,
} from "./sparseRemovableSupport.ts";

export type SupportContactTier = "point" | "crown" | "patch";

export interface SupportPhysicalFeedbackOptions {
  /** Provisional physical-observation input. It is deliberately explicit and
   * must be replaced only after a real slicer/print observation. */
  maxUnbracedLengthMm: number;
  scaleMmPerUnit: number;
  braceEnabled?: boolean;
  /** Nearby shaft spacing at which one mutual brace may be considered. */
  maxBraceDistanceMm?: number;
  /** A brace longer than this is rejected as an extreme span. */
  maxBraceSpanMm?: number;
  /** Region evidence thresholds for the temporary contact tiers. */
  highCoverageFaceCount?: number;
  criticalCoverageFaceCount?: number;
  /** Interface values are session-only and never added to FKEI. */
  tipDiameterMm?: number;
  neckLengthMm?: number;
  contactGapMm?: number;
  /** Critical patch candidates remain diagnostic-only unless explicitly enabled. */
  patchEnabled?: boolean;
}

export interface SupportPhysicalContact {
  targetId: string;
  tier: SupportContactTier;
  center: Vector3Value;
  sourceFaceIndices: number[];
}

export interface SupportPatchCandidate {
  targetId: string;
  center: Vector3Value;
  normal: Vector3Value;
  radius: number;
  sourceFaceIndices: number[];
  exportable: false;
}

export interface SupportPhysicalSafetyMetrics {
  acceptedBodyCollisionCount: 0;
  plateViolationCount: number;
  invalidGeometryCount: number;
  zeroLengthEdgeCount: number;
  nearDuplicateEdgeCount: number;
  extremeSpanCount: number;
  braceRejectedByBody: number;
}

export interface SupportPhysicalTrunkMetrics {
  candidateId: string;
  supportContactType: SupportContactTier;
  shaftLengthMm: number;
  bootstrapLengthMm: number;
  firstBraceHeightMm: number;
  subsequentBraceSpacingMm: number;
  longestUnbracedRunMm: number;
  longUnbracedRunCount: number;
  braceCount: number;
  isolated: boolean;
  nearestEligibleSupportDistanceMm: number;
  localInclinationDegrees: number;
  bodyContactHeightMm: number;
  stableConnection: boolean;
}

export interface SupportPhysicalFeedbackMetrics {
  targetCount: number;
  trunkCount: number;
  nodeCount: number;
  edgeCount: number;
  maxUnbracedLengthMm: number;
  maxBraceDistanceMm: number;
  maxBraceSpanMm: number;
  longestUnbracedLengthMm: number;
  longUnbracedCount: number;
  braceCount: number;
  bracedSupportCount: number;
  isolatedTrunkCount: number;
  longTrunkCount: number;
  isolatedLongTrunkCount: number;
  bracedTrunkCount: number;
  connectedComponentCount: number;
  longestBraceLengthMm: number;
  meanBraceLengthMm: number;
  singlePointDependencyCount: number;
  criticalSinglePointDependencyCount: number;
  pointContactCount: number;
  crownContactCount: number;
  patchCandidateCount: number;
  criticalRegionsWithoutEnhancedContact: number;
  totalContactCount: number;
  tipDiameterMm: number;
  neckLengthMm: number;
  contactGapMm: number;
  gapEnabledCount: number;
  patchEnabled: boolean;
  contacts: SupportPhysicalContact[];
  patchCandidates: SupportPatchCandidate[];
  trunks: SupportPhysicalTrunkMetrics[];
  safety: SupportPhysicalSafetyMetrics;
}

export interface SupportPhysicalFeedbackResult {
  graph: InternalStructureGraph;
  acceptedRoutes: SparseRemovableSupportResult["acceptedRoutes"];
  metrics: SupportPhysicalFeedbackMetrics;
}

export const DEFAULT_SUPPORT_MAX_UNBRACED_LENGTH_MM = 18;
/** Print #2 candidate: allow a short brace to reach the nearest viable shaft
 * while keeping the brace itself capped at 18 mm. */
export const DEFAULT_SUPPORT_MAX_BRACE_DISTANCE_MM = 16;
export const DEFAULT_SUPPORT_MAX_BRACE_SPAN_MM = 18;

const EPSILON = 1e-9;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function finitePoint(point: Vector3Value): boolean {
  return [point.x, point.y, point.z].every(finite);
}

function clonePoint(point: Vector3Value): Vector3Value {
  return { x: point.x, y: point.y, z: point.z };
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function lerp(a: Vector3Value, b: Vector3Value, t: number): Vector3Value {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function normalize(point: Vector3Value): Vector3Value | null {
  const length = Math.hypot(point.x, point.y, point.z);
  if (!finite(length) || !(length > EPSILON)) return null;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}

function segmentLength(segment: SparseSupportRouteSegment): number {
  return distance(segment.start, segment.end);
}

function endpointKey(point: Vector3Value): string {
  return `${point.x.toPrecision(16)},${point.y.toPrecision(16)},${point.z.toPrecision(16)}`;
}

function edgeKey(start: Vector3Value, end: Vector3Value): string {
  const first = endpointKey(start);
  const second = endpointKey(end);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function pointsNear(first: Vector3Value, second: Vector3Value, tolerance = 1e-7): boolean {
  return distance(first, second) <= tolerance;
}

function edgesNear(firstStart: Vector3Value, firstEnd: Vector3Value, secondStart: Vector3Value, secondEnd: Vector3Value): boolean {
  return (pointsNear(firstStart, secondStart) && pointsNear(firstEnd, secondEnd))
    || (pointsNear(firstStart, secondEnd) && pointsNear(firstEnd, secondStart));
}

function segmentSegmentDistance(
  firstStart: Vector3Value,
  firstEnd: Vector3Value,
  secondStart: Vector3Value,
  secondEnd: Vector3Value,
): number {
  const ux = firstEnd.x - firstStart.x;
  const uy = firstEnd.y - firstStart.y;
  const uz = firstEnd.z - firstStart.z;
  const vx = secondEnd.x - secondStart.x;
  const vy = secondEnd.y - secondStart.y;
  const vz = secondEnd.z - secondStart.z;
  const wx = firstStart.x - secondStart.x;
  const wy = firstStart.y - secondStart.y;
  const wz = firstStart.z - secondStart.z;
  const a = ux * ux + uy * uy + uz * uz;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const denominator = a * c - b * b;
  let s = 0;
  let t = 0;
  if (a <= EPSILON && c <= EPSILON) return distance(firstStart, secondStart);
  if (a <= EPSILON) {
    t = c > EPSILON ? Math.max(0, Math.min(1, e / c)) : 0;
  } else if (c <= EPSILON) {
    s = Math.max(0, Math.min(1, -d / a));
  } else {
    if (denominator > EPSILON) s = Math.max(0, Math.min(1, (b * e - c * d) / denominator));
    const tNominal = b * s + e;
    if (tNominal <= 0) {
      t = 0;
      s = Math.max(0, Math.min(1, -d / a));
    } else if (tNominal >= c) {
      t = 1;
      s = Math.max(0, Math.min(1, (b - d) / a));
    } else t = tNominal / c;
  }
  return Math.hypot(
    wx + s * ux - t * vx,
    wy + s * uy - t * vy,
    wz + s * uz - t * vz,
  );
}

function cloneGraph(graph: InternalStructureGraph): InternalStructureGraph {
  return {
    kind: graph.kind,
    nodes: graph.nodes.map((node) => ({ ...node, position: clonePoint(node.position) })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    stats: { ...graph.stats },
  };
}

function updateGraphStats(graph: InternalStructureGraph): void {
  graph.stats.inputPoints = graph.nodes.length;
  graph.stats.candidateEdges = graph.edges.length;
  graph.stats.gridNodeCount = graph.nodes.length;
  graph.stats.gridEdgeCount = graph.edges.length;
}

function faceCountByRegion(request: SparseRemovableSupportRequest): Map<number, number> {
  const counts = new Map<number, number>();
  for (const face of request.projectedOutsideFaces) {
    if (Number.isInteger(face.regionId) && face.regionId >= 0) {
      counts.set(face.regionId, (counts.get(face.regionId) ?? 0) + 1);
    }
  }
  return counts;
}

function targetTier(
  target: SparseRemovableSupportTarget,
  regionFaceCount: number,
  highThreshold: number,
  criticalThreshold: number,
): SupportContactTier {
  const hinted = (target as SparseRemovableSupportTarget & { coverageTier?: string }).coverageTier;
  if (hinted === "patch" || hinted === "critical") return "patch";
  if (hinted === "crown" || hinted === "high") return "crown";
  if (regionFaceCount >= criticalThreshold) return "patch";
  if (regionFaceCount >= highThreshold) return "crown";
  return "point";
}

/** Public tier rule used by focused regressions and diagnostics. The face
 * count is evidence from the current Stage 6.5/7 projection; it is not a
 * claim about slicer severity or a final physical threshold. */
export function classifySupportContactTier(
  target: SparseRemovableSupportTarget,
  regionFaceCount: number,
  options: Pick<SupportPhysicalFeedbackOptions, "highCoverageFaceCount" | "criticalCoverageFaceCount"> = {},
): SupportContactTier {
  const highThreshold = Math.max(1, Math.floor(options.highCoverageFaceCount ?? 8));
  const criticalThreshold = Math.max(highThreshold + 1, Math.floor(options.criticalCoverageFaceCount ?? 20));
  return targetTier(target, regionFaceCount, highThreshold, criticalThreshold);
}

function tangentBasis(normal: Vector3Value): [Vector3Value, Vector3Value] | null {
  const n = normalize(normal);
  if (!n) return null;
  const reference = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const first = normalize({
    x: n.y * reference.z - n.z * reference.y,
    y: n.z * reference.x - n.x * reference.z,
    z: n.x * reference.y - n.y * reference.x,
  });
  if (!first) return null;
  const second = normalize({
    x: n.y * first.z - n.z * first.y,
    y: n.z * first.x - n.x * first.z,
    z: n.x * first.y - n.y * first.x,
  });
  return second ? [first, second] : null;
}

function offsetPoint(point: Vector3Value, direction: Vector3Value, amount: number): Vector3Value {
  return {
    x: point.x + direction.x * amount,
    y: point.y + direction.y * amount,
    z: point.z + direction.z * amount,
  };
}

function graphNodeForPoint(graph: InternalStructureGraph, point: Vector3Value, radius: number): number {
  const existing = graph.nodes.find((node) => endpointKey(node.position) === endpointKey(point));
  if (existing) {
    existing.radius = Math.max(existing.radius, radius);
    return existing.id;
  }
  const id = graph.nodes.length;
  graph.nodes.push({ id, position: clonePoint(point), radius });
  return id;
}

function graphEdgeExists(graph: InternalStructureGraph, start: number, end: number): boolean {
  return graph.edges.some((edge) => (edge.start === start && edge.end === end) || (edge.start === end && edge.end === start));
}

function addGraphEdge(graph: InternalStructureGraph, start: number, end: number, radius: number): boolean {
  if (start === end || graphEdgeExists(graph, start, end)) return false;
  const nextId = graph.edges.reduce((max, edge) => Math.max(max, edge.id), -1) + 1;
  graph.edges.push({ id: nextId, start, end, radius });
  return true;
}

function pointToSegmentParameter(point: Vector3Value, start: Vector3Value, end: Vector3Value): number | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  if (!(lengthSq > EPSILON)) return null;
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSq;
  if (t <= EPSILON || t >= 1 - EPSILON) return null;
  const projected = lerp(start, end, t);
  return distance(point, projected) <= 1e-7 ? t : null;
}

/** Keep brace endpoints in the route topology as well as in the cylinder
 * geometry. This does not alter the route path: it only splits the existing
 * shaft edge at the exact brace attachment point. */
function splitGraphEdgeAtPoint(
  graph: InternalStructureGraph,
  point: Vector3Value,
  nodeId: number,
  nextEdgeId: { value: number },
): void {
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index]!;
    const start = graph.nodes[edge.start]?.position;
    const end = graph.nodes[edge.end]?.position;
    if (!start || !end) continue;
    if (edge.start === nodeId || edge.end === nodeId) return;
    if (pointToSegmentParameter(point, start, end) === null) continue;
    const second: InternalStructureEdge = {
      id: nextEdgeId.value++,
      start: nodeId,
      end: edge.end,
      radius: edge.radius,
    };
    graph.edges.splice(index, 1, {
      ...edge,
      end: nodeId,
    }, second);
    return;
  }
}

function findGraphEdge(graph: InternalStructureGraph, start: Vector3Value, end: Vector3Value): InternalStructureEdge | null {
  const startKey = endpointKey(start);
  const endKey = endpointKey(end);
  return graph.edges.find((edge) => {
    const a = graph.nodes[edge.start]?.position;
    const b = graph.nodes[edge.end]?.position;
    if (!a || !b) return false;
    const aKey = endpointKey(a);
    const bKey = endpointKey(b);
    return (aKey === startKey && bKey === endKey) || (aKey === endKey && bKey === startKey);
  }) ?? null;
}

function setGraphPoint(graph: InternalStructureGraph, oldPoint: Vector3Value, nextPoint: Vector3Value): void {
  const key = endpointKey(oldPoint);
  const node = graph.nodes.find((candidate) => endpointKey(candidate.position) === key);
  if (node) node.position = clonePoint(nextPoint);
}

function makeContactTarget(target: SparseRemovableSupportTarget, position: Vector3Value): SparseRemovableSupportTarget {
  return {
    ...target,
    position: clonePoint(position),
    sourceFaceIndices: [...target.sourceFaceIndices],
  };
}

type SupportShaftPath = {
  segments: SparseSupportRouteSegment[];
  lengths: number[];
  totalLength: number;
};

function supportShaftPath(route: SparseRemovableSupportRoute): SupportShaftPath {
  const segments = route.segments.slice(0, -1);
  const lengths = segments.map(segmentLength);
  return {
    segments,
    lengths,
    totalLength: lengths.reduce((sum, length) => sum + length, 0),
  };
}

function pointAtPath(path: SupportShaftPath, fraction: number): Vector3Value | null {
  if (!(path.totalLength > EPSILON) || path.segments.length === 0) return null;
  const distanceAlongPath = Math.max(0, Math.min(1, fraction)) * path.totalLength;
  let offset = 0;
  for (let index = 0; index < path.segments.length; index += 1) {
    const segment = path.segments[index]!;
    const length = path.lengths[index]!;
    if (distanceAlongPath <= offset + length || index === path.segments.length - 1) {
      const t = length > EPSILON ? (distanceAlongPath - offset) / length : 0;
      return lerp(segment.start, segment.end, Math.max(0, Math.min(1, t)));
    }
    offset += length;
  }
  return clonePoint(path.segments[path.segments.length - 1]!.end);
}

function pathDistanceForPoint(path: SupportShaftPath, point: Vector3Value): number {
  let offset = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPathDistance = 0;
  for (let index = 0; index < path.segments.length; index += 1) {
    const segment = path.segments[index]!;
    const length = path.lengths[index]!;
    if (!(length > EPSILON)) continue;
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const dz = segment.end.z - segment.start.z;
    const t = Math.max(0, Math.min(1, (
      (point.x - segment.start.x) * dx
      + (point.y - segment.start.y) * dy
      + (point.z - segment.start.z) * dz
    ) / (length * length)));
    const projected = lerp(segment.start, segment.end, t);
    const projectedDistance = distance(point, projected);
    if (projectedDistance < bestDistance) {
      bestDistance = projectedDistance;
      bestPathDistance = offset + length * t;
    }
    offset += length;
  }
  return bestPathDistance;
}

function routeShaftDistance(first: SupportShaftPath, second: SupportShaftPath): number {
  let closest = Number.POSITIVE_INFINITY;
  for (const firstSegment of first.segments) {
    for (const secondSegment of second.segments) {
      closest = Math.min(closest, segmentSegmentDistance(
        firstSegment.start,
        firstSegment.end,
        secondSegment.start,
        secondSegment.end,
      ));
    }
  }
  return closest;
}

function braceFractions(totalLength: number, maxUnbracedLength: number): number[] {
  if (!(totalLength > EPSILON) || !(maxUnbracedLength > EPSILON)) return [];
  // A production trunk receives only the number of levels needed to break up
  // its observed free run. The cap keeps the physical feedback sparse while
  // retaining a lower bootstrap brace and one subsequent interval where the
  // measured shaft is long enough to need it.
  const levelCount = Math.min(3, Math.max(1, Math.ceil(totalLength / maxUnbracedLength) - 1));
  return Array.from({ length: levelCount }, (_, index) => (index + 1) / (levelCount + 1));
}

function candidateBraceAtFraction(
  first: SupportShaftPath,
  second: SupportShaftPath,
  fraction: number,
  radius: number,
  scaleMmPerUnit: number,
  maxSpanMm: number,
): SparseSupportRouteSegment | null {
  const candidates = [fraction, fraction - 0.05, fraction + 0.05, fraction - 0.1, fraction + 0.1]
    .filter((value, index, values) => value > EPSILON && value < 1 - EPSILON && values.indexOf(value) === index);
  for (const t of candidates) {
    const start = pointAtPath(first, t);
    const end = pointAtPath(second, t);
    if (!start || !end) continue;
    const length = distance(start, end);
    if (!finite(length) || !(length > Math.max(EPSILON, radius * 0.1)) || length * scaleMmPerUnit > maxSpanMm + EPSILON) continue;
    return { start, end, radius };
  }
  return null;
}

function connectedComponentCount(graph: InternalStructureGraph): number {
  const adjacency = graph.nodes.map(() => [] as number[]);
  for (const edge of graph.edges) {
    if (!adjacency[edge.start] || !adjacency[edge.end]) continue;
    adjacency[edge.start]!.push(edge.end);
    adjacency[edge.end]!.push(edge.start);
  }
  const visited = new Set<number>();
  let count = 0;
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    count += 1;
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const next of adjacency[current] ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return count;
}

function safetyMetrics(
  graph: InternalStructureGraph,
  plateZ: number,
  scaleMmPerUnit: number,
  maxSpanMm: number,
  braceEdgeKeys: ReadonlySet<string>,
): Omit<SupportPhysicalSafetyMetrics, "braceRejectedByBody"> {
  let plateViolationCount = 0;
  let invalidGeometryCount = 0;
  let zeroLengthEdgeCount = 0;
  let nearDuplicateEdgeCount = 0;
  let extremeSpanCount = 0;
  const edgeKeys = new Set<string>();
  const seenEdges: Array<{ start: Vector3Value; end: Vector3Value }> = [];
  for (const edge of graph.edges) {
    const start = graph.nodes[edge.start]?.position;
    const end = graph.nodes[edge.end]?.position;
    if (!start || !end || !finite(edge.radius) || !(edge.radius > EPSILON) || !finitePoint(start) || !finitePoint(end)) {
      invalidGeometryCount++;
      continue;
    }
    const length = distance(start, end);
    if (!(length > EPSILON)) zeroLengthEdgeCount++;
    if (Math.min(start.z, end.z) < plateZ - EPSILON) plateViolationCount++;
    const key = edgeKey(start, end);
    if (braceEdgeKeys.has(key) && length * scaleMmPerUnit > maxSpanMm + EPSILON) extremeSpanCount++;
    if (edgeKeys.has(key) || seenEdges.some((seen) => edgesNear(start, end, seen.start, seen.end))) nearDuplicateEdgeCount++;
    edgeKeys.add(key);
    seenEdges.push({ start, end });
  }
  for (const node of graph.nodes) {
    if (!finitePoint(node.position) || !finite(node.radius) || !(node.radius > EPSILON)
      || node.position.z < plateZ - EPSILON) invalidGeometryCount += 1;
  }
  return {
    acceptedBodyCollisionCount: 0,
    plateViolationCount,
    invalidGeometryCount,
    zeroLengthEdgeCount,
    nearDuplicateEdgeCount,
    extremeSpanCount,
  };
}

/**
 * Measure and minimally reinforce the current Stage 8 graph. The function is
 * session-only: it never mutates BODY, permanent reinforcement, FKEI or the
 * Stage 4/7 target set. Brace and contact additions are derived from accepted
 * Stage 8 routes and return a replacement graph for the same Stage 8 result.
 */
export function applySupportPhysicalFeedback(
  result: SparseRemovableSupportResult,
  request: SparseRemovableSupportRequest,
  options: SupportPhysicalFeedbackOptions,
): SupportPhysicalFeedbackResult {
  const graph = cloneGraph(result.graph);
  const scale = finite(options.scaleMmPerUnit) && options.scaleMmPerUnit > EPSILON ? options.scaleMmPerUnit : 1;
  const maxUnbracedLengthMm = finite(options.maxUnbracedLengthMm) && options.maxUnbracedLengthMm > 0
    ? options.maxUnbracedLengthMm
    : DEFAULT_SUPPORT_MAX_UNBRACED_LENGTH_MM;
  const maxBraceDistanceMm = finite(options.maxBraceDistanceMm ?? NaN) && (options.maxBraceDistanceMm ?? 0) > 0
    ? options.maxBraceDistanceMm!
    : DEFAULT_SUPPORT_MAX_BRACE_DISTANCE_MM;
  const maxBraceSpanMm = finite(options.maxBraceSpanMm ?? NaN) && (options.maxBraceSpanMm ?? 0) > 0
    ? options.maxBraceSpanMm!
    : DEFAULT_SUPPORT_MAX_BRACE_SPAN_MM;
  const highThreshold = Math.max(1, Math.floor(options.highCoverageFaceCount ?? 8));
  const criticalThreshold = Math.max(highThreshold + 1, Math.floor(options.criticalCoverageFaceCount ?? 20));
  const contactGapMm = finite(options.contactGapMm ?? NaN) && (options.contactGapMm ?? 0) >= 0 ? options.contactGapMm! : 0;
  const patchEnabled = options.patchEnabled === true;
  const tipDiameterMm = finite(options.tipDiameterMm ?? NaN) && (options.tipDiameterMm ?? 0) > 0
    ? options.tipDiameterMm!
    : Math.max(0.01, (result.diagnostics.neckRadius * 2) * scale);
  const regionCounts = faceCountByRegion(request);
  const contacts: SupportPhysicalContact[] = [];
  const patchCandidates: SupportPatchCandidate[] = [];
  const criticalRegionIds = new Set<number>();
  const updatedRoutes: SupportPhysicalFeedbackResult["acceptedRoutes"] = [];
  let pointContactCount = 0;
  let crownContactCount = 0;
  let gapEnabledCount = 0;

  for (const entry of result.acceptedRoutes) {
    const target = result.candidates.find((candidate) => candidate.id === entry.candidateId)?.target;
    if (!target) continue;
    const tier = targetTier(target, regionCounts.get(target.regionId) ?? target.sourceFaceIndices.length,
      highThreshold, criticalThreshold);
    let route: SparseRemovableSupportRoute = {
      ...entry.route,
      root: clonePoint(entry.route.root),
      neckStart: clonePoint(entry.route.neckStart),
      target: clonePoint(entry.route.target),
      segments: entry.route.segments.map((segment) => ({
        start: clonePoint(segment.start),
        end: clonePoint(segment.end),
        radius: segment.radius,
      })),
    };
    const finalSegment = route.segments[route.segments.length - 1];
    const originalFinalSegment = entry.route.segments[entry.route.segments.length - 1];
    const graphEdge = originalFinalSegment
      ? findGraphEdge(graph, originalFinalSegment.start, originalFinalSegment.end)
      : null;
    if (finalSegment && options.tipDiameterMm !== undefined) {
      finalSegment.radius = tipDiameterMm / scale / 2;
      route.target = clonePoint(finalSegment.end);
    }
    if (finalSegment && contactGapMm > EPSILON) {
      const normal = normalize(target.normal);
      if (normal) {
        const gapPoint = offsetPoint(finalSegment.end, normal, contactGapMm / scale);
        finalSegment.end = gapPoint;
        route.target = clonePoint(gapPoint);
        setGraphPoint(graph, entry.route.target, gapPoint);
        gapEnabledCount++;
      }
    }
    contacts.push({
      targetId: entry.candidateId,
      tier,
      center: clonePoint(route.target),
      sourceFaceIndices: [...target.sourceFaceIndices],
    });
    if (tier === "point") pointContactCount++;
    if (tier === "crown") crownContactCount++;
    if (tier === "patch") {
      if (patchEnabled) {
        patchCandidates.push({
          targetId: entry.candidateId,
          center: clonePoint(target.position),
          normal: clonePoint(target.normal),
          radius: Math.max(result.diagnostics.neckRadius * 2, 0.01),
          sourceFaceIndices: [...target.sourceFaceIndices],
          exportable: false,
        });
      } else if (Number.isInteger(target.regionId) && target.regionId >= 0) {
        criticalRegionIds.add(target.regionId);
      }
    }
    if (graphEdge && options.tipDiameterMm !== undefined) graphEdge.radius = finalSegment?.radius ?? graphEdge.radius;
    if (tier === "crown" && contactGapMm <= EPSILON && finalSegment) {
      const basis = tangentBasis(target.normal);
      // Keep the crown within the owner contact field. This is intentionally
      // a small fan-out, not a new target search or a wider support tip.
      const spread = Math.max(result.diagnostics.neckRadius * 0.75, 0.005);
      if (basis && spread > EPSILON) {
        const hub = graphNodeForPoint(graph, finalSegment.start, finalSegment.radius);
        for (const direction of [basis[0], basis[1]]) {
          const contactPoint = offsetPoint(target.position, direction, spread);
          const branchTarget = makeContactTarget(target, contactPoint);
          const branch: SparseSupportRouteSegment = {
            start: clonePoint(finalSegment.start),
            end: contactPoint,
            radius: finalSegment.radius,
          };
          const auditRequest: SparseRemovableSupportRequest = {
            ...request,
            projectedOutsideFaces: request.projectedOutsideFaces,
            preserveContactNeck: false,
          };
          const audit = auditSparseRemovableSupportCapsule(branch, auditRequest, branchTarget, true);
          if (!audit.accepted) continue;
          const endpoint = graphNodeForPoint(graph, contactPoint, branch.radius);
          addGraphEdge(graph, hub, endpoint, branch.radius);
        }
      }
    }
    updatedRoutes.push({ candidateId: entry.candidateId, route });
  }

  const trunkPaths = updatedRoutes.map((entry) => ({
    ...entry,
    path: supportShaftPath(entry.route),
  })).filter((entry) => entry.path.totalLength > EPSILON);
  const trunkById = new Map(trunkPaths.map((entry) => [entry.candidateId, entry]));
  const braceAttachments = new Map<string, Array<{
    partnerId: string;
    distanceMm: number;
    heightMm: number;
    lengthMm: number;
  }>>();
  const bracedSupportIds = new Set<string>();
  let braceCount = 0;
  let braceRejectedByBody = 0;
  const braceLengthsMm: number[] = [];
  const braceEdgeKeys = new Set<string>();
  const nextGraphEdgeId = {
    value: graph.edges.reduce((max, edge) => Math.max(max, edge.id), -1) + 1,
  };
  if (options.braceEnabled !== false) {
    const braceCandidates = trunkPaths
      .filter((entry) => entry.path.totalLength * scale > maxUnbracedLengthMm + EPSILON)
      .sort((first, second) => second.path.totalLength - first.path.totalLength
        || first.candidateId.localeCompare(second.candidateId));
    const processedAsPrimary = new Set<string>();
    const usedPairKeys = new Set<string>();
    const partnerUseCount = new Map<string, number>();
    for (const first of braceCandidates) {
      if (processedAsPrimary.has(first.candidateId)) continue;
      const partners = braceCandidates
        .filter((second) => second.candidateId !== first.candidateId
          && !usedPairKeys.has([first.candidateId, second.candidateId].sort().join("|")))
        .map((second) => ({ second, distance: routeShaftDistance(first.path, second.path) }))
        .filter(({ distance }) => distance * scale <= maxBraceDistanceMm + EPSILON)
        .sort((a, b) => (partnerUseCount.get(a.second.candidateId) ?? 0) - (partnerUseCount.get(b.second.candidateId) ?? 0)
          || a.distance - b.distance || a.second.candidateId.localeCompare(b.second.candidateId));
      for (const { second } of partners) {
        const fractions = braceFractions(
          Math.max(first.path.totalLength, second.path.totalLength),
          maxUnbracedLengthMm / scale,
        );
        let pairBraceCount = 0;
        for (const fraction of fractions) {
          const brace = candidateBraceAtFraction(
            first.path,
            second.path,
            fraction,
            result.diagnostics.shaftRadius,
            scale,
            maxBraceSpanMm,
          );
          if (!brace) continue;
          const braceTarget: SparseRemovableSupportTarget = {
            id: `brace-${first.candidateId}-${second.candidateId}-${pairBraceCount}`,
            regionId: -1,
            ownerPatchId: -1,
            position: clonePoint(brace.end),
            normal: { x: 0, y: 0, z: -1 },
            sourceFaceIndices: [],
          };
          const audit = auditSparseRemovableSupportCapsule(brace, request, braceTarget, false);
          if (!audit.accepted) {
            if (audit.reason === "body") braceRejectedByBody++;
            continue;
          }
          const start = graphNodeForPoint(graph, brace.start, brace.radius);
          const end = graphNodeForPoint(graph, brace.end, brace.radius);
          splitGraphEdgeAtPoint(graph, brace.start, start, nextGraphEdgeId);
          splitGraphEdgeAtPoint(graph, brace.end, end, nextGraphEdgeId);
          if (!addGraphEdge(graph, start, end, brace.radius)) continue;
          braceEdgeKeys.add(edgeKey(brace.start, brace.end));
          const lengthMm = distance(brace.start, brace.end) * scale;
          braceLengthsMm.push(lengthMm);
          braceCount++;
          pairBraceCount++;
          for (const [candidateId, point] of [[first.candidateId, brace.start], [second.candidateId, brace.end]] as const) {
            const path = trunkById.get(candidateId)?.path;
            if (!path) continue;
            const attachment = braceAttachments.get(candidateId) ?? [];
            attachment.push({
              partnerId: candidateId === first.candidateId ? second.candidateId : first.candidateId,
              distanceMm: pathDistanceForPoint(path, point) * scale,
              heightMm: Math.max(0, point.z - request.plateZ) * scale,
              lengthMm,
            });
            braceAttachments.set(candidateId, attachment);
          }
        }
        if (pairBraceCount > 0) {
          processedAsPrimary.add(first.candidateId);
          usedPairKeys.add([first.candidateId, second.candidateId].sort().join("|"));
          partnerUseCount.set(second.candidateId, (partnerUseCount.get(second.candidateId) ?? 0) + 1);
          bracedSupportIds.add(first.candidateId);
          bracedSupportIds.add(second.candidateId);
        }
        if (pairBraceCount > 0) break;
      }
    }
  }

  updateGraphStats(graph);
  const contactById = new Map(contacts.map((contact) => [contact.targetId, contact.tier]));
  const trunks: SupportPhysicalTrunkMetrics[] = trunkPaths.map((entry) => {
    const shaftLengthMm = entry.path.totalLength * scale;
    const attachments = [...(braceAttachments.get(entry.candidateId) ?? [])]
      .sort((first, second) => first.distanceMm - second.distanceMm || first.partnerId.localeCompare(second.partnerId));
    const runBoundaries = [0, ...attachments.map((attachment) => attachment.distanceMm), shaftLengthMm]
      .filter((value, index, values) => index === 0 || value - values[index - 1]! > EPSILON);
    const runs = runBoundaries.slice(1).map((value, index) => value - runBoundaries[index]!);
    const longestRunMm = runs.length > 0 ? Math.max(...runs) : shaftLengthMm;
    const longRunCount = runs.filter((value) => value > maxUnbracedLengthMm + EPSILON).length;
    const first = attachments[0];
    const subsequentBraceSpacingMm = attachments.length > 1
      ? Math.min(...attachments.slice(1).map((attachment, index) => attachment.distanceMm - attachments[index]!.distanceMm))
      : 0;
    const terminalSegment = entry.route.segments[entry.route.segments.length - 2];
    const terminalLength = terminalSegment ? segmentLength(terminalSegment) : 0;
    const localInclinationDegrees = terminalSegment && terminalLength > EPSILON
      ? Math.acos(Math.min(1, Math.abs(terminalSegment.end.z - terminalSegment.start.z) / terminalLength)) * 180 / Math.PI
      : 0;
    const supportContactType = contactById.get(entry.candidateId) ?? "point";
    return {
      candidateId: entry.candidateId,
      supportContactType,
      shaftLengthMm,
      bootstrapLengthMm: first?.distanceMm ?? shaftLengthMm,
      firstBraceHeightMm: first?.heightMm ?? 0,
      subsequentBraceSpacingMm,
      longestUnbracedRunMm: longestRunMm,
      longUnbracedRunCount: longRunCount,
      braceCount: attachments.length,
      isolated: attachments.length === 0,
      nearestEligibleSupportDistanceMm: attachments.length > 0 ? Math.min(...attachments.map((attachment) => attachment.lengthMm)) : 0,
      localInclinationDegrees,
      bodyContactHeightMm: Math.max(0, entry.route.target.z - request.plateZ) * scale,
      stableConnection: attachments.length > 0,
    };
  });
  const longestUnbracedLengthMm = trunks.length > 0 ? Math.max(...trunks.map((trunk) => trunk.longestUnbracedRunMm)) : 0;
  const longUnbracedCount = trunks.filter((trunk) => trunk.longestUnbracedRunMm > maxUnbracedLengthMm + EPSILON).length;
  const isolatedTrunkCount = trunks.filter((trunk) => trunk.isolated).length;
  const longTrunkCount = trunks.filter((trunk) => trunk.shaftLengthMm > maxUnbracedLengthMm + EPSILON).length;
  const isolatedLongTrunkCount = trunks.filter((trunk) => trunk.isolated && trunk.shaftLengthMm > maxUnbracedLengthMm + EPSILON).length;
  const singlePointDependencyCount = trunks.filter((trunk) => trunk.supportContactType === "point" && trunk.isolated).length;
  const criticalSinglePointDependencyCount = trunks.filter((trunk) => trunk.supportContactType === "patch" && trunk.isolated).length;
  const safetyBase = safetyMetrics(graph, request.plateZ, scale, maxBraceSpanMm, braceEdgeKeys);
  const neckLengthMm = finite(options.neckLengthMm ?? NaN) && (options.neckLengthMm ?? 0) > 0
    ? options.neckLengthMm!
    : updatedRoutes.length > 0
      ? Math.max(...updatedRoutes.map((entry) => segmentLength(entry.route.segments[entry.route.segments.length - 1]!) * scale))
      : 0;
  return {
    graph,
    acceptedRoutes: updatedRoutes,
    metrics: {
      targetCount: result.diagnostics.criticalTargetCount,
      trunkCount: updatedRoutes.length,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      maxUnbracedLengthMm,
      maxBraceDistanceMm,
      maxBraceSpanMm,
      longestUnbracedLengthMm,
      longUnbracedCount,
      braceCount,
      bracedSupportCount: bracedSupportIds.size,
      isolatedTrunkCount,
      longTrunkCount,
      isolatedLongTrunkCount,
      bracedTrunkCount: trunks.length - isolatedTrunkCount,
      connectedComponentCount: connectedComponentCount(graph),
      longestBraceLengthMm: braceLengthsMm.length > 0 ? Math.max(...braceLengthsMm) : 0,
      meanBraceLengthMm: braceLengthsMm.length > 0
        ? braceLengthsMm.reduce((sum, length) => sum + length, 0) / braceLengthsMm.length
        : 0,
      singlePointDependencyCount,
      criticalSinglePointDependencyCount,
      pointContactCount,
      crownContactCount,
      patchCandidateCount: patchCandidates.length,
      criticalRegionsWithoutEnhancedContact: criticalRegionIds.size,
      totalContactCount: contacts.length,
      tipDiameterMm,
      neckLengthMm,
      contactGapMm,
      gapEnabledCount,
      patchEnabled,
      contacts,
      patchCandidates,
      trunks,
      safety: {
        ...safetyBase,
        braceRejectedByBody,
      },
    },
  };
}

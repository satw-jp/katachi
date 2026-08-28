import type {
  SurfaceAngleDiagnosisMetrics,
  SurfaceAngleDiagnosisResult,
} from "./surfaceAngleDiagnosis.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "./voronoi.ts";

/** The two execution paths are runtime-only; neither is persisted. */
export type Stage7ProvisionalRecheckMode = "full" | "delta";

export type Stage7ProvisionalReachabilityProof = "passed" | "failed";

export interface Stage7ProvisionalReachabilityValidation {
  readonly eligible: boolean;
  readonly reason: string;
  readonly baseEdgeCount: number;
  readonly coveredBaseEdgeCount: number;
}

export interface Stage7ProvisionalDeltaBaseline {
  readonly beforeDangerPositions: Float32Array;
  readonly afterDangerPositions: Float32Array;
  readonly mitigatedPositions: Float32Array;
  readonly metrics: SurfaceAngleDiagnosisMetrics;
}

const MAX_NUMERICAL_TOLERANCE_ULPS = 256;
/** Match the planner's endpoint projection tolerance without accepting a
 * visibly displaced segment as collinear. The interval union below remains
 * gap-free, so this only absorbs the planner's finite arithmetic residue. */
const PLANNER_ENDPOINT_TOLERANCE = 1e-7;
/** A provisional planner is capped at the Stage 7 candidate preview limit. */
const MAX_UNMATCHED_BASE_EDGES = 128;

function finitePoint(value: unknown): value is Vector3Value {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<Vector3Value>;
  return typeof point.x === "number" && Number.isFinite(point.x)
    && typeof point.y === "number" && Number.isFinite(point.y)
    && typeof point.z === "number" && Number.isFinite(point.z);
}

function validNode(value: unknown): value is InternalStructureNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<InternalStructureNode>;
  return Number.isSafeInteger(node.id)
    && finitePoint(node.position)
    && typeof node.radius === "number"
    && Number.isFinite(node.radius)
    && node.radius >= 0;
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function validEdge(value: unknown, nodeIds: ReadonlySet<number>): value is InternalStructureEdge {
  if (!value || typeof value !== "object") return false;
  const edge = value as Partial<InternalStructureEdge>;
  const start = edge.start;
  const end = edge.end;
  return safeInteger(edge.id)
    && safeInteger(start)
    && safeInteger(end)
    && start !== end
    && nodeIds.has(start)
    && nodeIds.has(end)
    && typeof edge.radius === "number"
    && Number.isFinite(edge.radius)
    && edge.radius >= 0;
}

function validGraph(
  value: InternalStructureGraph | null,
  expectedKind: InternalStructureGraph["kind"] | null = null,
): value is InternalStructureGraph {
  if (!value || (expectedKind !== null && value.kind !== expectedKind)
    || !Array.isArray(value.nodes) || !Array.isArray(value.edges)
    || !value.stats || typeof value.stats !== "object") return false;
  const nodeIds = new Set<number>();
  for (const node of value.nodes) {
    if (!validNode(node) || nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<number>();
  for (const edge of value.edges) {
    if (!validEdge(edge, nodeIds) || edgeIds.has(edge.id)) return false;
    edgeIds.add(edge.id);
  }
  return true;
}

function vectorScale(...points: readonly Vector3Value[]): number {
  return Math.max(1, ...points.flatMap((point) => [
    Math.abs(point.x), Math.abs(point.y), Math.abs(point.z),
  ]));
}

function lengthSquared(vector: Vector3Value): number {
  return vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
}

function subtract(a: Vector3Value, b: Vector3Value): Vector3Value {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vector3Value, b: Vector3Value): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3Value, b: Vector3Value): Vector3Value {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Return a base-segment parameter only when a point is on that segment's
 * supporting line. The tiny tolerance is solely for arithmetic noise from a
 * planner projection; interval coverage itself remains gap-free and exact.
 */
function baseParameter(
  point: Vector3Value,
  start: Vector3Value,
  direction: Vector3Value,
  baseLengthSquared: number,
  baseLength: number,
): { parameter: number; perpendicularDistance: number } | null {
  const offset = subtract(point, start);
  const parameter = dot(offset, direction) / baseLengthSquared;
  if (!Number.isFinite(parameter)) return null;
  const parameterTolerance = Number.EPSILON * MAX_NUMERICAL_TOLERANCE_ULPS;
  if (parameter < -parameterTolerance || parameter > 1 + parameterTolerance) return null;
  const perpendicular = cross(offset, direction);
  const perpendicularDistance = Math.hypot(perpendicular.x, perpendicular.y, perpendicular.z) / baseLength;
  const plannerTolerance = PLANNER_ENDPOINT_TOLERANCE * Math.max(1, baseLength)
    + Number.EPSILON * vectorScale(start, point, {
      x: start.x + direction.x,
      y: start.y + direction.y,
      z: start.z + direction.z,
    }) * 16;
  if (!Number.isFinite(perpendicularDistance) || perpendicularDistance > plannerTolerance) return null;
  return {
    parameter: Math.max(0, Math.min(1, parameter)),
    perpendicularDistance,
  };
}

function nodesById(graph: InternalStructureGraph): Map<number, InternalStructureNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

/**
 * Prove that adding the provisional graph cannot remove any reachability
 * supplied by the base graph. Every base edge is represented by one or more
 * collinear provisional segments whose closed parameter intervals cover [0,1]
 * without a gap and whose tube radius is no smaller than the base radius.
 * Added non-collinear edges are allowed. This is deliberately conservative:
 * uncertain geometry rejects the delta path rather than being approximated.
 */
export function validateStage7ProvisionalReachabilityMonotonic(
  baseGraph: InternalStructureGraph | null,
  provisionalGraph: InternalStructureGraph | null,
): Stage7ProvisionalReachabilityValidation {
  const baseEdgeCount = Array.isArray(baseGraph?.edges) ? baseGraph.edges.length : 0;
  if (!validGraph(baseGraph)) {
    return { eligible: false, reason: "baseGraphが不正です", baseEdgeCount, coveredBaseEdgeCount: 0 };
  }
  if (!validGraph(provisionalGraph, baseGraph.kind)) {
    return { eligible: false, reason: "provisionalGraphが不正またはbaseGraphとkindが異なります", baseEdgeCount, coveredBaseEdgeCount: 0 };
  }

  const baseNodes = nodesById(baseGraph);
  const provisionalNodes = nodesById(provisionalGraph);
  const provisionalSegments = provisionalGraph.edges.map((edge) => {
    const start = provisionalNodes.get(edge.start);
    const end = provisionalNodes.get(edge.end);
    return { edge, start, end };
  });
  const provisionalById = new Map<number, (typeof provisionalSegments)[number]>();
  for (const segment of provisionalSegments) provisionalById.set(segment.edge.id, segment);
  const baseRecords: Array<{
    baseEdge: InternalStructureEdge;
    baseEdgeIndex: number;
    baseStart: Vector3Value;
    baseEnd: Vector3Value;
    direction: Vector3Value;
    baseLengthSquared: number;
    baseLength: number;
  }> = [];
  let coveredBaseEdgeCount = 0;

  for (const [baseEdgeIndex, baseEdge] of baseGraph.edges.entries()) {
    const baseStart = baseNodes.get(baseEdge.start)?.position;
    const baseEnd = baseNodes.get(baseEdge.end)?.position;
    if (!baseStart || !baseEnd) {
      return {
        eligible: false,
        reason: `base edge ${baseEdgeIndex}のnodeがありません`,
        baseEdgeCount,
        coveredBaseEdgeCount,
      };
    }
    const direction = subtract(baseEnd, baseStart);
    const baseLengthSquared = lengthSquared(direction);
    const baseLength = Math.sqrt(baseLengthSquared);
    if (!(baseLengthSquared > 0) || !Number.isFinite(baseLengthSquared) || !Number.isFinite(baseLength)) {
      return {
        eligible: false,
        reason: `base edge ${baseEdgeIndex}がzero-lengthまたは非有限です`,
        baseEdgeCount,
        coveredBaseEdgeCount,
      };
    }
    baseRecords.push({ baseEdge, baseEdgeIndex, baseStart, baseEnd, direction, baseLengthSquared, baseLength });
  }

  // The planner leaves untouched edges under the same ID and endpoint node
  // IDs. Resolve those in O(1) before considering split edges; on the normal
  // 60k-edge graph this keeps proof work linear rather than quadratic.
  const unmatched: typeof baseRecords = [];
  for (const record of baseRecords) {
    const sameId = provisionalById.get(record.baseEdge.id);
    const sameSegment = sameId
      && sameId.edge.start === record.baseEdge.start
      && sameId.edge.end === record.baseEdge.end
      && sameId.start !== undefined
      && sameId.end !== undefined
      && sameId.start.position.x === record.baseStart.x
      && sameId.start.position.y === record.baseStart.y
      && sameId.start.position.z === record.baseStart.z
      && sameId.end.position.x === record.baseEnd.x
      && sameId.end.position.y === record.baseEnd.y
      && sameId.end.position.z === record.baseEnd.z
      && sameId.edge.radius >= record.baseEdge.radius;
    if (sameSegment) {
      coveredBaseEdgeCount++;
    } else {
      unmatched.push(record);
    }
  }
  // A large number of removed base IDs is not a Stage 7 planner result. Do
  // not turn an adversarial graph into an accidental quadratic validator.
  if (unmatched.length > MAX_UNMATCHED_BASE_EDGES) {
    return {
      eligible: false,
      reason: `未一致base edgeが${unmatched.length}件あり、bounded planner split上限を超えました`,
      baseEdgeCount,
      coveredBaseEdgeCount,
    };
  }

  for (const record of unmatched) {
    const {
      baseEdge, baseEdgeIndex, baseStart, direction, baseLengthSquared, baseLength,
    } = record;

    const intervals: Array<[number, number]> = [];
    for (const segment of provisionalSegments) {
      if (!segment.start || !segment.end) continue;
      if (segment.edge.radius < baseEdge.radius) continue;
      const startProjection = baseParameter(
        segment.start.position, baseStart, direction, baseLengthSquared, baseLength,
      );
      const endProjection = baseParameter(
        segment.end.position, baseStart, direction, baseLengthSquared, baseLength,
      );
      if (startProjection === null || endProjection === null) continue;
      // A parallel offset with the same radius does not contain the original
      // tube. Require enough extra radius to cover the largest endpoint
      // displacement (the distance along the segment is convex), retaining
      // the planner's tiny projection tolerance without a false positive.
      const requiredRadius = baseEdge.radius + Math.max(
        startProjection.perpendicularDistance,
        endProjection.perpendicularDistance,
      );
      if (segment.edge.radius < requiredRadius) continue;
      const lo = Math.min(startProjection.parameter, endProjection.parameter);
      const hi = Math.max(startProjection.parameter, endProjection.parameter);
      if (hi > lo) intervals.push([lo, hi]);
    }
    intervals.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    let coveredUntil = 0;
    for (const [start, end] of intervals) {
      // Deliberately no epsilon here: a real uncovered gap must force the
      // unchanged full recheck. Planner-created splits share exact node data.
      if (start > coveredUntil) break;
      coveredUntil = Math.max(coveredUntil, end);
      if (coveredUntil >= 1) break;
    }
    if (coveredUntil < 1) {
      return {
        eligible: false,
        reason: `base edge ${baseEdgeIndex}のtube coverageにgapがあります`,
        baseEdgeCount,
        coveredBaseEdgeCount,
      };
    }
    coveredBaseEdgeCount++;
  }

  return {
    eligible: true,
    reason: `base edge ${coveredBaseEdgeCount}/${baseEdgeCount}がprovisionalで連続被覆されています`,
    baseEdgeCount,
    coveredBaseEdgeCount,
  };
}

/** Boolean convenience for callers that only need the eligibility gate. */
export function stage7ProvisionalReachabilityIsMonotonic(
  baseGraph: InternalStructureGraph | null,
  provisionalGraph: InternalStructureGraph | null,
): boolean {
  return validateStage7ProvisionalReachabilityMonotonic(baseGraph, provisionalGraph).eligible;
}

function validPositions(value: unknown): value is Float32Array {
  if (!(value instanceof Float32Array) || value.length % 9 !== 0) return false;
  for (const item of value) if (!Number.isFinite(item)) return false;
  return true;
}

function validMetricNumber(value: number, minimum = 0): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function validMetrics(metrics: SurfaceAngleDiagnosisMetrics): boolean {
  return Boolean(metrics)
    && validMetricNumber(metrics.thresholdDeg)
    && metrics.thresholdDeg <= 90
    && validMetricNumber(metrics.surfaceArea)
    && validMetricNumber(metrics.dangerousAreaBefore)
    && validMetricNumber(metrics.dangerousAreaAfter)
    && validMetricNumber(metrics.mitigatedArea)
    && Number.isSafeInteger(metrics.dangerousFaceCountBefore) && metrics.dangerousFaceCountBefore >= 0
    && Number.isSafeInteger(metrics.dangerousFaceCountAfter) && metrics.dangerousFaceCountAfter >= 0
    && Number.isSafeInteger(metrics.mitigatedFaceCount) && metrics.mitigatedFaceCount >= 0
    && validMetricNumber(metrics.contactTolerance);
}

function countMatches(value: Float32Array, count: number): boolean {
  return value.length / 9 === count;
}

function sameFloat32Bits(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  const left = new Uint32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const right = new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
  return true;
}

/** Runtime input guard for the delta request. */
export function isValidStage7ProvisionalDeltaBaseline(
  baseline: Stage7ProvisionalDeltaBaseline | null | undefined,
): baseline is Stage7ProvisionalDeltaBaseline {
  if (!baseline || !validPositions(baseline.beforeDangerPositions)
    || !validPositions(baseline.afterDangerPositions)
    || !validPositions(baseline.mitigatedPositions)
    || !validMetrics(baseline.metrics)) return false;
  const { metrics } = baseline;
  return countMatches(baseline.beforeDangerPositions, metrics.dangerousFaceCountBefore)
    && countMatches(baseline.afterDangerPositions, metrics.dangerousFaceCountAfter)
    && countMatches(baseline.mitigatedPositions, metrics.mitigatedFaceCount)
    && metrics.dangerousFaceCountAfter + metrics.mitigatedFaceCount === metrics.dangerousFaceCountBefore;
}

function triangleKey(positions: Float32Array, offset: number): string {
  const bits = new Uint32Array(positions.buffer, positions.byteOffset + offset * 4, 9);
  let key = "";
  for (const bit of bits) key += bit.toString(16).padStart(8, "0");
  return key;
}

function countTriangleKeys(positions: Float32Array): Map<string, number> {
  const counts = new Map<string, number>();
  for (let offset = 0; offset < positions.length; offset += 9) {
    const key = triangleKey(positions, offset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Keep the original face order of the full diagnosis. A simple concatenation
 * would move a newly-teal face ahead of an older teal face when the baseline
 * colors were interleaved, which would weaken byte-for-byte equivalence.
 */
function mergeMitigatedInBaselineOrder(
  baselineBefore: Float32Array,
  baselineAfter: Float32Array,
  baselineMitigated: Float32Array,
  deltaAfter: Float32Array,
  deltaMitigated: Float32Array,
): Float32Array | null {
  const baselineAfterKeys = countTriangleKeys(baselineAfter);
  const baselineMitigatedKeys = countTriangleKeys(baselineMitigated);
  const deltaAfterKeys = countTriangleKeys(deltaAfter);
  const deltaMitigatedKeys = countTriangleKeys(deltaMitigated);
  // If one exact triangle occurs in both sides of a classification split, its
  // occurrence cannot be identified from the captured soup alone. Refuse the
  // delta merge instead of guessing, even though the bytes may happen to be
  // identical for that fixture.
  if ([...baselineAfterKeys.keys()].some((key) => baselineMitigatedKeys.has(key))
    || [...deltaAfterKeys.keys()].some((key) => deltaMitigatedKeys.has(key))) return null;
  const merged: number[] = [];
  for (let offset = 0; offset < baselineBefore.length; offset += 9) {
    const key = triangleKey(baselineBefore, offset);
    const oldTeal = baselineMitigatedKeys.get(key) ?? 0;
    if (oldTeal > 0) {
      baselineMitigatedKeys.set(key, oldTeal - 1);
      for (let index = 0; index < 9; index++) merged.push(baselineBefore[offset + index]);
      continue;
    }
    const oldAfter = baselineAfterKeys.get(key) ?? 0;
    if (oldAfter <= 0) return null;
    baselineAfterKeys.set(key, oldAfter - 1);
    const newTeal = deltaMitigatedKeys.get(key) ?? 0;
    if (newTeal > 0) {
      deltaMitigatedKeys.set(key, newTeal - 1);
      for (let index = 0; index < 9; index++) merged.push(baselineBefore[offset + index]);
    } else {
      const stillAfter = deltaAfterKeys.get(key) ?? 0;
      if (stillAfter <= 0) return null;
      deltaAfterKeys.set(key, stillAfter - 1);
    }
  }
  if ([...baselineAfterKeys.values()].some((count) => count !== 0)
    || [...baselineMitigatedKeys.values()].some((count) => count !== 0)
    || [...deltaAfterKeys.values()].some((count) => count !== 0)
    || [...deltaMitigatedKeys.values()].some((count) => count !== 0)) return null;
  return new Float32Array(merged);
}

function triangleSoupArea(positions: Float32Array): number {
  let area = 0;
  for (let offset = 0; offset + 8 < positions.length; offset += 9) {
    const abx = positions[offset + 3] - positions[offset];
    const aby = positions[offset + 4] - positions[offset + 1];
    const abz = positions[offset + 5] - positions[offset + 2];
    const acx = positions[offset + 6] - positions[offset];
    const acy = positions[offset + 7] - positions[offset + 1];
    const acz = positions[offset + 8] - positions[offset + 2];
    area += 0.5 * Math.hypot(
      aby * acz - abz * acy,
      abz * acx - abx * acz,
      abx * acy - aby * acx,
    );
  }
  return area;
}

/**
 * Merge a diagnosis of baseline after-danger faces into the untouched
 * baseline result. Returning null is a fail-closed signal for the Worker to
 * repeat the unchanged full diagnosis with the already-compiled query.
 */
export function composeStage7ProvisionalDeltaDiagnosis(
  baseline: Stage7ProvisionalDeltaBaseline | null | undefined,
  delta: SurfaceAngleDiagnosisResult | null,
): SurfaceAngleDiagnosisResult | null {
  if (!isValidStage7ProvisionalDeltaBaseline(baseline) || !delta
    || !validPositions(delta.beforeDangerPositions)
    || !validPositions(delta.afterDangerPositions)
    || !validPositions(delta.mitigatedPositions)
    || !validMetrics(delta)) return null;
  if (!sameFloat32Bits(delta.beforeDangerPositions, baseline.afterDangerPositions)
    || delta.thresholdDeg !== baseline.metrics.thresholdDeg
    || delta.contactTolerance !== baseline.metrics.contactTolerance
    || delta.dangerousFaceCountBefore !== baseline.metrics.dangerousFaceCountAfter
    || delta.dangerousAreaBefore !== baseline.metrics.dangerousAreaAfter
    || !countMatches(delta.beforeDangerPositions, delta.dangerousFaceCountBefore)
    || !countMatches(delta.afterDangerPositions, delta.dangerousFaceCountAfter)
    || !countMatches(delta.mitigatedPositions, delta.mitigatedFaceCount)
    || delta.dangerousFaceCountAfter + delta.mitigatedFaceCount
      !== delta.dangerousFaceCountBefore) return null;

  const mergedMitigated = mergeMitigatedInBaselineOrder(
    baseline.beforeDangerPositions,
    baseline.afterDangerPositions,
    baseline.mitigatedPositions,
    delta.afterDangerPositions,
    delta.mitigatedPositions,
  );
  if (!mergedMitigated) return null;

  return {
    thresholdDeg: baseline.metrics.thresholdDeg,
    surfaceArea: baseline.metrics.surfaceArea,
    dangerousAreaBefore: baseline.metrics.dangerousAreaBefore,
    dangerousAreaAfter: delta.dangerousAreaAfter,
    // Sum in the same face order as the full diagnosis. This avoids a
    // floating-point ordering difference when old and newly-teal faces are
    // interleaved in the baseline.
    mitigatedArea: triangleSoupArea(mergedMitigated),
    dangerousFaceCountBefore: baseline.metrics.dangerousFaceCountBefore,
    dangerousFaceCountAfter: delta.dangerousFaceCountAfter,
    mitigatedFaceCount: baseline.metrics.mitigatedFaceCount + delta.mitigatedFaceCount,
    contactTolerance: baseline.metrics.contactTolerance,
    beforeDangerPositions: baseline.beforeDangerPositions.slice(),
    afterDangerPositions: delta.afterDangerPositions.slice(),
    mitigatedPositions: mergedMitigated,
  };
}

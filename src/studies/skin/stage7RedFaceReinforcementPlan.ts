import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "./voronoi.ts";
import type { Stage7RedFaceDryWebCandidate } from "./stage7RedFaceDryWebCandidatePresentation.ts";

/**
 * Stage 7's next checkpoint is deliberately a plan, not a graph mutation.
 * The returned graph is an independent augmented copy for author inspection;
 * callers must not publish it as the current Artwork/Internal graph.
 */
export type Stage7RedFaceReinforcementPlanState = "invalid" | "current";

export interface Stage7RedFaceReinforcementPlanInput {
  /** The current targeted-grid graph, never a partially built worker graph. */
  readonly graph: InternalStructureGraph | null;
  /** The exact, ordered, capped candidate presentation from Stage 7. */
  readonly candidates: readonly Stage7RedFaceDryWebCandidate[];
  /** Stage 4's author-controlled physical target, in millimetres. */
  readonly targetDiameterMm: number;
  /** targetDiameterMm / 2 / currentPrintScaleMmPerUnit(). */
  readonly reinforcementRadius: number;
}

export interface Stage7RedFaceReinforcementPlanFacts {
  readonly planSource: "red-face-reinforcement" | "explicit-topology-repair";
  readonly topologyEvidence?: {
    readonly resolution: number;
    readonly baselineComponents: number;
    readonly provisionalComponents: number;
    readonly closed: boolean;
    readonly openEdges: number;
    readonly nonManifoldEdges: number;
    readonly degenerateTriangles: number;
    readonly nonFiniteTriangles: number;
    readonly windingAfterRepair: number;
    readonly baselineUnsupportedNodes: number;
    readonly provisionalUnsupportedNodes: number;
    readonly baselineUnsupportedEdges: number;
    readonly provisionalUnsupportedEdges: number;
    readonly baselineOverlongBridges: number;
    readonly provisionalOverlongBridges: number;
    readonly baselineMaxObservedBridgeMm: number;
    readonly provisionalMaxObservedBridgeMm: number;
  };
  readonly baseNodeCount: number;
  readonly provisionalNodeCount: number;
  readonly baseEdgeCount: number;
  readonly provisionalEdgeCount: number;
  readonly sourceEdgesSplit: number;
  readonly junctionNodesAdded: number;
  readonly redEndpointNodesAdded: number;
  readonly reinforcementEdgesAdded: number;
  readonly targetDiameterMm: number;
  readonly reinforcementRadius: number;
  readonly candidateFaceIds: readonly number[];
}

export interface Stage7RedFaceReinforcementPlan {
  readonly state: Stage7RedFaceReinforcementPlanState;
  readonly reason: string;
  /** Independent provisional graph; null means the plan was rejected. */
  readonly graph: InternalStructureGraph | null;
  readonly facts: Stage7RedFaceReinforcementPlanFacts;
}

interface CandidateResolution {
  readonly candidate: Stage7RedFaceDryWebCandidate;
  readonly sourceEdge: InternalStructureEdge;
  readonly edgeOrder: number;
  readonly t: number;
  readonly targetNodeId: number;
  readonly redNodeId: number;
}

interface JunctionRecord {
  readonly nodeId: number;
  readonly t: number;
  readonly position: Vector3Value;
  readonly candidateOrder: number;
}

const EMPTY_FACTS = (targetDiameterMm: number, reinforcementRadius: number): Stage7RedFaceReinforcementPlanFacts => Object.freeze({
  planSource: "red-face-reinforcement",
  baseNodeCount: 0,
  provisionalNodeCount: 0,
  baseEdgeCount: 0,
  provisionalEdgeCount: 0,
  sourceEdgesSplit: 0,
  junctionNodesAdded: 0,
  redEndpointNodesAdded: 0,
  reinforcementEdgesAdded: 0,
  targetDiameterMm,
  reinforcementRadius,
  candidateFaceIds: Object.freeze([]),
});

/** Relative tolerance is intentionally conservative: accepted endpoint drift
 * is only numerical noise, never a new target chosen by this planner. */
const NUMERICAL_TOLERANCE = 1e-7;

function finitePoint(value: unknown): value is Vector3Value {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<Vector3Value>;
  return typeof point.x === "number" && Number.isFinite(point.x)
    && typeof point.y === "number" && Number.isFinite(point.y)
    && typeof point.z === "number" && Number.isFinite(point.z);
}

function pointDistanceSq(a: Vector3Value, b: Vector3Value): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function pointDistance(a: Vector3Value, b: Vector3Value): number {
  return Math.sqrt(pointDistanceSq(a, b));
}

function pointScale(...points: Vector3Value[]): number {
  return Math.max(1, ...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)]));
}

function toleranceFor(...points: Vector3Value[]): number {
  let span = 1;
  for (let first = 0; first < points.length; first++) {
    for (let second = first + 1; second < points.length; second++) {
      span = Math.max(span, pointDistance(points[first], points[second]));
    }
  }
  // Keep the tolerance tied to the local segment, with only a small IEEE-754
  // coordinate-scale term. Scaling the full tolerance by absolute coordinates
  // would merge visibly distinct junctions when coordinates are large.
  return NUMERICAL_TOLERANCE * span + Number.EPSILON * pointScale(...points) * 16;
}

function cloneValue<T>(value: T): T {
  if (value instanceof Float32Array) return new Float32Array(value) as T;
  if (value instanceof Float64Array) return new Float64Array(value) as T;
  if (value instanceof Uint32Array) return new Uint32Array(value) as T;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      clone[key] = cloneValue(item);
    }
    return clone as T;
  }
  return value;
}

function cloneGraph(graph: InternalStructureGraph): InternalStructureGraph {
  return cloneValue(graph);
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

function validEdge(value: unknown): value is InternalStructureEdge {
  if (!value || typeof value !== "object") return false;
  const edge = value as Partial<InternalStructureEdge>;
  return Number.isSafeInteger(edge.id)
    && Number.isSafeInteger(edge.start)
    && Number.isSafeInteger(edge.end)
    && typeof edge.radius === "number"
    && Number.isFinite(edge.radius)
    && edge.radius >= 0;
}

function validGraph(graph: InternalStructureGraph | null): graph is InternalStructureGraph {
  if (!graph || graph.kind !== "targetedGrid" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)
    || !graph.stats || typeof graph.stats !== "object") return false;
  const nodeIds = new Set<number>();
  for (const node of graph.nodes) {
    if (!validNode(node) || nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<number>();
  for (const edge of graph.edges) {
    if (!validEdge(edge) || edgeIds.has(edge.id) || !nodeIds.has(edge.start) || !nodeIds.has(edge.end)) return false;
    edgeIds.add(edge.id);
  }
  return true;
}

function nextSafeId(values: readonly number[]): number | null {
  const max = values.length > 0 ? Math.max(...values) : -1;
  return max < Number.MAX_SAFE_INTEGER ? max + 1 : null;
}

function immutableFacts(facts: Stage7RedFaceReinforcementPlanFacts): Stage7RedFaceReinforcementPlanFacts {
  return Object.freeze({ ...facts, candidateFaceIds: Object.freeze([...facts.candidateFaceIds]) });
}

function invalidPlan(
  reason: string,
  targetDiameterMm: number,
  reinforcementRadius: number,
  candidateFaceIds: readonly number[] = [],
): Stage7RedFaceReinforcementPlan {
  return {
    state: "invalid",
    reason,
    graph: null,
    facts: immutableFacts({ ...EMPTY_FACTS(targetDiameterMm, reinforcementRadius), candidateFaceIds }),
  };
}

function endpointResolution(
  candidate: Stage7RedFaceDryWebCandidate,
  sourceEdge: InternalStructureEdge,
  edgeOrder: number,
  nodesById: ReadonlyMap<number, InternalStructureNode>,
): { t: number; start: Vector3Value; end: Vector3Value } | null {
  const sourceStart = nodesById.get(sourceEdge.start)?.position;
  const sourceEnd = nodesById.get(sourceEdge.end)?.position;
  if (!sourceStart || !sourceEnd || !finitePoint(candidate.start) || !finitePoint(candidate.end)
    || !Number.isFinite(candidate.length) || candidate.length <= 0
    || !Number.isSafeInteger(candidate.edgeId) || !Number.isSafeInteger(candidate.edgeOrder)
    || candidate.edgeId !== sourceEdge.id || candidate.edgeOrder !== edgeOrder) return null;
  const dx = sourceEnd.x - sourceStart.x;
  const dy = sourceEnd.y - sourceStart.y;
  const dz = sourceEnd.z - sourceStart.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  if (!(lengthSq > 0) || !Number.isFinite(lengthSq)) return null;
  const offsetX = candidate.end.x - sourceStart.x;
  const offsetY = candidate.end.y - sourceStart.y;
  const offsetZ = candidate.end.z - sourceStart.z;
  const dot = offsetX * dx + offsetY * dy + offsetZ * dz;
  if (!Number.isFinite(dot)) return null;
  const tRaw = dot / lengthSq;
  const tTolerance = NUMERICAL_TOLERANCE;
  if (!Number.isFinite(tRaw) || tRaw < -tTolerance || tRaw > 1 + tTolerance) return null;
  const t = Math.max(0, Math.min(1, tRaw));
  const projected = {
    x: sourceStart.x + dx * t,
    y: sourceStart.y + dy * t,
    z: sourceStart.z + dz * t,
  };
  const positionTolerance = toleranceFor(sourceStart, sourceEnd, candidate.end);
  if (!finitePoint(projected) || pointDistance(candidate.end, projected) > positionTolerance) return null;
  const candidateLength = pointDistance(candidate.start, candidate.end);
  const lengthTolerance = NUMERICAL_TOLERANCE * Math.max(1, candidateLength, candidate.length);
  if (!Number.isFinite(candidateLength) || Math.abs(candidateLength - candidate.length) > lengthTolerance) return null;
  return { t, start: sourceStart, end: sourceEnd };
}

/**
 * Build a deterministic, independent provisional topology plan. Any malformed
 * or mismatched candidate rejects the whole plan so a stale preview cannot be
 * silently attached to a different graph edge.
 */
export function createStage7RedFaceReinforcementPlan(
  input: Stage7RedFaceReinforcementPlanInput | null,
): Stage7RedFaceReinforcementPlan {
  const targetDiameterMm = input?.targetDiameterMm ?? Number.NaN;
  const reinforcementRadius = input?.reinforcementRadius ?? Number.NaN;
  if (!input || !validGraph(input.graph)) {
    return invalidPlan("current targetedGrid graphが不正です。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius);
  }
  if (!Number.isFinite(targetDiameterMm) || !(targetDiameterMm > 0)
    || !Number.isFinite(reinforcementRadius) || !(reinforcementRadius > 0)) {
    return invalidPlan("Stage 4の補強径またはnormalized radiusが不正です。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius);
  }
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    return invalidPlan("current赤面→Dry Web候補がありません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius);
  }

  const nodesById = new Map<number, InternalStructureNode>();
  for (const node of input.graph.nodes) nodesById.set(node.id, node);
  const nodeIds = input.graph.nodes.map((node) => node.id);
  const edgeIds = input.graph.edges.map((edge) => edge.id);
  let nextNodeId = nextSafeId(nodeIds);
  let nextEdgeId = nextSafeId(edgeIds);
  if (nextNodeId === null || nextEdgeId === null) {
    return invalidPlan("既存GraphのID上限に達しています。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius);
  }

  const candidateFaceIds: number[] = [];
  const faceIds = new Set<number>();
  const resolutions: CandidateResolution[] = [];
  const junctionsByEdgeId = new Map<number, JunctionRecord[]>();
  const provisionalNodes: InternalStructureNode[] = input.graph.nodes.map((node) => ({ ...node, position: { ...node.position } }));

  for (const [candidateOrder, candidate] of input.candidates.entries()) {
    if (!candidate || !Number.isSafeInteger(candidate.faceId) || faceIds.has(candidate.faceId)) {
      return invalidPlan("候補face IDが不正または重複しています。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
    }
    if (!Number.isSafeInteger(candidate.edgeOrder) || candidate.edgeOrder < 0 || candidate.edgeOrder >= input.graph.edges.length) {
      return invalidPlan("候補edgeOrderがcurrent Graphと一致しません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
    }
    const sourceEdge = input.graph.edges[candidate.edgeOrder];
    if (!sourceEdge || !validEdge(sourceEdge)) {
      return invalidPlan("候補のsource edgeが不正です。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
    }
    const resolved = endpointResolution(candidate, sourceEdge, candidate.edgeOrder, nodesById);
    if (!resolved) {
      return invalidPlan("候補endpointが指定されたsource edge segmentと一致しません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
    }
    const endpointTolerance = NUMERICAL_TOLERANCE;
    let targetNodeId: number;
    if (resolved.t <= endpointTolerance) {
      targetNodeId = sourceEdge.start;
    } else if (1 - resolved.t <= endpointTolerance) {
      targetNodeId = sourceEdge.end;
    } else {
      const edgeJunctions = junctionsByEdgeId.get(sourceEdge.id) ?? [];
      const positionTolerance = toleranceFor(candidate.end, resolved.start, resolved.end);
      const existing = edgeJunctions.find((junction) =>
        Math.abs(junction.t - resolved.t) <= endpointTolerance
        && pointDistance(junction.position, candidate.end) <= positionTolerance);
      if (existing) {
        targetNodeId = existing.nodeId;
      } else {
        if (nextNodeId > Number.MAX_SAFE_INTEGER) {
          return invalidPlan("junction node IDを安全に割り当てられません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
        }
        targetNodeId = nextNodeId++;
        const junction: JunctionRecord = {
          nodeId: targetNodeId,
          t: resolved.t,
          position: { x: candidate.end.x, y: candidate.end.y, z: candidate.end.z },
          candidateOrder,
        };
        edgeJunctions.push(junction);
        junctionsByEdgeId.set(sourceEdge.id, edgeJunctions);
        provisionalNodes.push({
          id: targetNodeId,
          position: { ...junction.position },
          radius: Math.max(sourceEdge.radius, reinforcementRadius),
        });
      }
    }
    if (nextNodeId > Number.MAX_SAFE_INTEGER) {
      return invalidPlan("red endpoint node IDを安全に割り当てられません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
    }
    const redNodeId = nextNodeId++;
    provisionalNodes.push({
      id: redNodeId,
      position: { x: candidate.start.x, y: candidate.start.y, z: candidate.start.z },
      radius: reinforcementRadius,
    });
    faceIds.add(candidate.faceId);
    candidateFaceIds.push(candidate.faceId);
    resolutions.push({ candidate, sourceEdge, edgeOrder: candidate.edgeOrder, t: resolved.t, targetNodeId, redNodeId });
  }

  const provisionalEdges: InternalStructureEdge[] = [];
  let sourceEdgesSplit = 0;
  for (const [edgeOrder, sourceEdge] of input.graph.edges.entries()) {
    const edgeJunctions = junctionsByEdgeId.get(sourceEdge.id);
    if (!edgeJunctions || edgeJunctions.length === 0) {
      provisionalEdges.push(cloneValue(sourceEdge));
      continue;
    }
    sourceEdgesSplit++;
    const sorted = [...edgeJunctions].sort((a, b) => a.t - b.t || a.candidateOrder - b.candidateOrder);
    const pointIds = [sourceEdge.start, ...sorted.map((junction) => junction.nodeId), sourceEdge.end];
    const pointPositions = pointIds.map((id) => provisionalNodes.find((node) => node.id === id)?.position ?? nodesById.get(id)?.position);
    if (pointPositions.some((position) => !position)) {
      return invalidPlan("junction nodeがsource edgeへ解決できません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
    }
    for (let index = 0; index < pointIds.length - 1; index++) {
      const start = pointPositions[index]!;
      const end = pointPositions[index + 1]!;
      const tolerance = toleranceFor(start, end);
      if (pointDistance(start, end) <= tolerance) {
        return invalidPlan("source edgeのsplitにzero-length pieceがあります。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
      }
      if (nextEdgeId > Number.MAX_SAFE_INTEGER) {
        return invalidPlan("split edge IDを安全に割り当てられません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
      }
      provisionalEdges.push({ ...cloneValue(sourceEdge), id: nextEdgeId++, start: pointIds[index], end: pointIds[index + 1] });
    }
    // edgeOrder is intentionally consumed above; retaining this assertion in
    // code makes it harder to accidentally switch to array-index IDs later.
    void edgeOrder;
  }

  const reinforcementEdgesAdded = resolutions.length;
  for (const resolution of resolutions) {
    if (nextEdgeId > Number.MAX_SAFE_INTEGER) {
      return invalidPlan("reinforcement edge IDを安全に割り当てられません。仮Graph計画は作成しません。", targetDiameterMm, reinforcementRadius, candidateFaceIds);
    }
    provisionalEdges.push({
      id: nextEdgeId++,
      start: resolution.redNodeId,
      end: resolution.targetNodeId,
      radius: reinforcementRadius,
    });
  }

  const provisionalGraph = cloneGraph(input.graph);
  provisionalGraph.nodes = provisionalNodes;
  provisionalGraph.edges = provisionalEdges;
  provisionalGraph.stats = {
    ...cloneValue(input.graph.stats),
    gridNodeCount: provisionalNodes.length,
    gridEdgeCount: provisionalEdges.length,
  };
  const facts = immutableFacts({
    planSource: "red-face-reinforcement",
    baseNodeCount: input.graph.nodes.length,
    provisionalNodeCount: provisionalNodes.length,
    baseEdgeCount: input.graph.edges.length,
    provisionalEdgeCount: provisionalEdges.length,
    sourceEdgesSplit,
    junctionNodesAdded: [...junctionsByEdgeId.values()].reduce((total, junctions) => total + junctions.length, 0),
    redEndpointNodesAdded: resolutions.length,
    reinforcementEdgesAdded,
    targetDiameterMm,
    reinforcementRadius,
    candidateFaceIds,
  });
  return {
    state: "current",
    reason: `仮Graph topology plan · candidate ${resolutions.length}件 · ${sourceEdgesSplit} source edge(s) split`,
    graph: provisionalGraph,
    facts,
  };
}

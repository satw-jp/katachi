import type { Stage7RedFaceReinforcementPlan } from "./stage7RedFaceReinforcementPlan.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "./voronoi.ts";

export interface ExplicitTopologyRepairNode {
  readonly id: number;
  readonly positionMm: Vector3Value;
  readonly radius: number;
}

export interface ExplicitTopologyRepairEdge {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly radius: number;
}

/** Existing runtime identities captured when the explicit candidate is registered. */
export interface ExplicitTopologyRepairIdentity {
  readonly canonicalGraphIdentity: InternalStructureGraph;
  readonly surfaceIdentity: object;
  readonly dryWebIdentity: object;
  readonly artworkGraphIdentity: object;
  readonly targetedSupportSourceIdentity: object;
  readonly paintRevision: number;
  readonly surfaceFingerprint: string;
  readonly resolution: number;
  readonly mode: string;
  readonly supportSettingsKey: string;
}

export interface ExplicitTopologyRepairCurrentness {
  readonly canonicalGraphIdentity: InternalStructureGraph | null;
  readonly surfaceIdentity: object | null;
  readonly dryWebIdentity: object | null;
  readonly artworkGraphIdentity: object | null;
  readonly targetedSupportSourceIdentity: object | null;
  readonly paintRevision: number;
  readonly surfaceFingerprint: string;
  readonly resolution: number;
  readonly mode: string;
  readonly supportSettingsKey: string;
}

export interface ExplicitTopologyRepairPlanInput {
  readonly baselineGraph: InternalStructureGraph | null;
  readonly nodes: readonly ExplicitTopologyRepairNode[];
  readonly edges: readonly ExplicitTopologyRepairEdge[];
  readonly scaleMmPerUnit: number;
  readonly targetDiameterMm: number;
  readonly reason: string;
  readonly topologyEvidence: NonNullable<Stage7RedFaceReinforcementPlan["facts"]["topologyEvidence"]>;
  readonly identity: ExplicitTopologyRepairIdentity;
}

export interface ExplicitTopologyRepairPlanResult {
  readonly plan: Stage7RedFaceReinforcementPlan;
  readonly identity: ExplicitTopologyRepairIdentity;
}

function cloneValue<T>(value: T): T {
  if (value instanceof Float32Array) return new Float32Array(value) as T;
  if (value instanceof Float64Array) return new Float64Array(value) as T;
  if (value instanceof Uint32Array) return new Uint32Array(value) as T;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) clone[key] = cloneValue(item);
    return clone as T;
  }
  return value;
}

function invalidPlan(reason: string, targetDiameterMm: number, radius: number): Stage7RedFaceReinforcementPlan {
  return {
    state: "invalid",
    reason,
    graph: null,
    facts: Object.freeze({
      planSource: "explicit-topology-repair",
      baseNodeCount: 0,
      provisionalNodeCount: 0,
      baseEdgeCount: 0,
      provisionalEdgeCount: 0,
      sourceEdgesSplit: 0,
      junctionNodesAdded: 0,
      redEndpointNodesAdded: 0,
      reinforcementEdgesAdded: 0,
      targetDiameterMm,
      reinforcementRadius: radius,
      candidateFaceIds: Object.freeze([]),
    }),
  };
}

function finitePoint(point: Vector3Value): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function validBaselineGraph(graph: InternalStructureGraph): boolean {
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.stats || typeof graph.stats !== "object") return false;
  const nodeIds = new Set<number>();
  for (const node of graph.nodes) {
    if (!Number.isSafeInteger(node.id) || nodeIds.has(node.id) || !finitePoint(node.position)
      || !Number.isFinite(node.radius) || node.radius < 0) return false;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<number>();
  for (const edge of graph.edges) {
    if (!Number.isSafeInteger(edge.id) || edgeIds.has(edge.id)
      || !Number.isSafeInteger(edge.start) || !Number.isSafeInteger(edge.end)
      || !nodeIds.has(edge.start) || !nodeIds.has(edge.end)
      || !Number.isFinite(edge.radius) || edge.radius < 0) return false;
    edgeIds.add(edge.id);
  }
  return true;
}

function nextId(ids: readonly number[]): number | null {
  if (ids.some((id) => !Number.isSafeInteger(id))) return null;
  const max = ids.length > 0 ? Math.max(...ids) : -1;
  return max < Number.MAX_SAFE_INTEGER ? max + 1 : null;
}

/**
 * Convert one already-reviewed, fixed topology repair into the existing Stage
 * 7 provisional-plan meaning. The baseline graph is cloned; this function has
 * no canonical mutation capability.
 */
export function createExplicitTopologyRepairPlan(
  input: ExplicitTopologyRepairPlanInput,
): ExplicitTopologyRepairPlanResult {
  const baseline = input.baselineGraph;
  const radius = input.nodes[0]?.radius ?? input.edges[0]?.radius ?? Number.NaN;
  const invalid = (reason: string): ExplicitTopologyRepairPlanResult => ({
    plan: invalidPlan(reason, input.targetDiameterMm, radius),
    identity: input.identity,
  });
  if (!baseline || baseline.kind !== "targetedGrid" || !validBaselineGraph(baseline)
    || input.identity.canonicalGraphIdentity !== baseline) {
    return invalid("current targetedGrid Graph identityが候補生成時点と一致しません。");
  }
  if (!Number.isFinite(input.scaleMmPerUnit) || !(input.scaleMmPerUnit > 0)
    || !Number.isFinite(input.targetDiameterMm) || !(input.targetDiameterMm > 0)
    || input.nodes.length === 0 || input.edges.length === 0 || input.reason.trim() === ""
    || !Number.isSafeInteger(input.identity.paintRevision) || input.identity.paintRevision < 0
    || !Number.isSafeInteger(input.identity.resolution) || input.identity.resolution <= 0
    || input.identity.surfaceFingerprint.length === 0 || input.identity.mode.length === 0
    || input.identity.supportSettingsKey.length === 0
    || !Number.isSafeInteger(input.topologyEvidence.resolution) || input.topologyEvidence.resolution <= 0
    || !Number.isSafeInteger(input.topologyEvidence.baselineComponents) || input.topologyEvidence.baselineComponents <= 0
    || !Number.isSafeInteger(input.topologyEvidence.provisionalComponents) || input.topologyEvidence.provisionalComponents <= 0) {
    return invalid("明示topology repair candidateの入力が不正です。");
  }
  const baselineNodeIds = new Set(baseline.nodes.map((node) => node.id));
  const baselineEdgeIds = new Set(baseline.edges.map((edge) => edge.id));
  const expectedNodeId = nextId([...baselineNodeIds]);
  const expectedEdgeId = nextId([...baselineEdgeIds]);
  if (expectedNodeId === null || expectedEdgeId === null) return invalid("Graph IDを安全に割り当てられません。");

  const newNodeIds = new Set<number>();
  const provisionalNodes: InternalStructureNode[] = baseline.nodes.map((node) => cloneValue(node));
  for (const [index, node] of input.nodes.entries()) {
    if (node.id !== expectedNodeId + index || baselineNodeIds.has(node.id) || newNodeIds.has(node.id)
      || !finitePoint(node.positionMm) || !Number.isFinite(node.radius) || !(node.radius > 0)) {
      return invalid("明示node ID・座標・radiusがcanonical Graphの決定的な追番契約と一致しません。");
    }
    newNodeIds.add(node.id);
    provisionalNodes.push({
      id: node.id,
      position: {
        x: node.positionMm.x / input.scaleMmPerUnit,
        y: node.positionMm.y / input.scaleMmPerUnit,
        z: node.positionMm.z / input.scaleMmPerUnit,
      },
      radius: node.radius,
    });
  }

  const newEdgeIds = new Set<number>();
  const provisionalEdges: InternalStructureEdge[] = baseline.edges.map((edge) => cloneValue(edge));
  const availableNodeIds = new Set([...baselineNodeIds, ...newNodeIds]);
  for (const [index, edge] of input.edges.entries()) {
    if (edge.id !== expectedEdgeId + index || baselineEdgeIds.has(edge.id) || newEdgeIds.has(edge.id)
      || !availableNodeIds.has(edge.start) || !availableNodeIds.has(edge.end) || edge.start === edge.end
      || !Number.isFinite(edge.radius) || !(edge.radius > 0)) {
      return invalid("明示edge ID・endpoint・radiusがcanonical Graphの決定的な追番契約と一致しません。");
    }
    newEdgeIds.add(edge.id);
    provisionalEdges.push({ id: edge.id, start: edge.start, end: edge.end, radius: edge.radius });
  }

  const graph = cloneValue(baseline);
  graph.nodes = provisionalNodes;
  graph.edges = provisionalEdges;
  graph.stats = {
    ...cloneValue(baseline.stats),
    gridNodeCount: provisionalNodes.length,
    gridEdgeCount: provisionalEdges.length,
  };
  return {
    identity: input.identity,
    plan: {
      state: "current",
      reason: input.reason,
      graph,
      facts: Object.freeze({
        planSource: "explicit-topology-repair",
        topologyEvidence: Object.freeze({ ...input.topologyEvidence }),
        baseNodeCount: baseline.nodes.length,
        provisionalNodeCount: graph.nodes.length,
        baseEdgeCount: baseline.edges.length,
        provisionalEdgeCount: graph.edges.length,
        sourceEdgesSplit: 0,
        junctionNodesAdded: 0,
        redEndpointNodesAdded: 0,
        reinforcementEdgesAdded: input.edges.length,
        targetDiameterMm: input.targetDiameterMm,
        reinforcementRadius: radius,
        candidateFaceIds: Object.freeze([]),
      }),
    },
  };
}

/** Strict reference/scalar check; coordinate equality is deliberately irrelevant. */
export function explicitTopologyRepairPlanIsCurrent(
  identity: ExplicitTopologyRepairIdentity,
  current: ExplicitTopologyRepairCurrentness,
): boolean {
  return identity.canonicalGraphIdentity === current.canonicalGraphIdentity
    && identity.surfaceIdentity === current.surfaceIdentity
    && identity.dryWebIdentity === current.dryWebIdentity
    && identity.artworkGraphIdentity === current.artworkGraphIdentity
    && identity.targetedSupportSourceIdentity === current.targetedSupportSourceIdentity
    && identity.paintRevision === current.paintRevision
    && identity.surfaceFingerprint === current.surfaceFingerprint
    && identity.resolution === current.resolution
    && identity.mode === current.mode
    && identity.supportSettingsKey === current.supportSettingsKey;
}

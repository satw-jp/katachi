import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "../voronoi.ts";

/**
 * Laboratory-only topology analysis for an already-generated Spider graph.
 * Nothing in the production lattice builder imports this module. Raw input is
 * cloned, findings are observational, and the candidate is a separate graph.
 */

export type SpiderGraphTerminalRole = "motif" | "support-target";

export interface SpiderGraphTerminal {
  id: string;
  role: SpiderGraphTerminalRole;
  position: Vector3Value;
}

export interface SpiderGraphCleanupPolicy {
  nodeCoincidenceTolerance: number;
  radiusTolerance: number;
  collinearDistanceTolerance: number;
  cleanupCollinearAngleToleranceDeg: number;
  simplificationCollinearAngleToleranceDeg: number;
  intersectionTolerance: number;
  intersectionEndpointTolerance: number;
  microEdgeRadiusFactor: number;
  totalLengthTolerance: number;
}

export const DEFAULT_SPIDER_GRAPH_CLEANUP_POLICY: SpiderGraphCleanupPolicy = {
  // Matches the current motif-anchor lookup tolerance in model.ts.
  nodeCoincidenceTolerance: 1e-6,
  radiusTolerance: 1e-9,
  collinearDistanceTolerance: 1e-6,
  cleanupCollinearAngleToleranceDeg: 1e-5,
  simplificationCollinearAngleToleranceDeg: 2,
  intersectionTolerance: 1e-6,
  intersectionEndpointTolerance: 1e-6,
  // Diagnostic only. Automatic contraction is limited to a near-node merge.
  microEdgeRadiusFactor: 0.1,
  totalLengthTolerance: 1e-8,
};

export interface EdgeClosestApproach {
  distance: number;
  firstParameter: number;
  secondParameter: number;
  firstPoint: Vector3Value;
  secondPoint: Vector3Value;
}

/**
 * Geometry is an adapter around topology. A future curve realization can
 * implement this contract without changing terminal/connectivity auditing.
 * This laboratory ships only the straight adapter.
 */
export interface SpiderEdgeGeometryAdapter {
  kind: "straight" | "curved";
  length(graph: InternalStructureGraph, edge: InternalStructureEdge): number;
  pointAt(graph: InternalStructureGraph, edge: InternalStructureEdge, parameter: number): Vector3Value;
  tangentAt(
    graph: InternalStructureGraph,
    edge: InternalStructureEdge,
    endpoint: "start" | "end",
  ): Vector3Value;
  closestApproach(
    graph: InternalStructureGraph,
    first: InternalStructureEdge,
    second: InternalStructureEdge,
  ): EdgeClosestApproach;
}

export interface NearlyCoincidentNodeFinding {
  firstNodeId: number;
  secondNodeId: number;
  distance: number;
  protected: boolean;
  sameComponent: boolean;
  candidateAction: "merge" | "review-only";
}

export interface DuplicateEdgeFinding {
  edgeIds: number[];
  startNodeId: number;
  endNodeId: number;
  compatibleRadius: boolean;
  candidateAction: "remove-duplicates" | "review-only";
}

export interface CollinearOverlapFinding {
  firstEdgeId: number;
  secondEdgeId: number;
  overlapLength: number;
  compatibleRadius: boolean;
  candidateAction: "review-only";
}

export interface EdgeIntersectionFinding {
  firstEdgeId: number;
  secondEdgeId: number;
  kind: "interior-interior" | "endpoint-interior" | "endpoint-endpoint-unshared";
  position: Vector3Value;
  separation: number;
  candidateAction: "review-only";
}

export interface MicroEdgeFinding {
  edgeId: number;
  length: number;
  threshold: number;
  protectedEndpoint: boolean;
  candidateAction: "near-node-merge" | "simplification-review";
}

export interface Degree2CollinearFinding {
  nodeId: number;
  edgeIds: [number, number];
  deviationFromStraightDeg: number;
  compatibleRadius: boolean;
  protected: boolean;
  candidateAction: "collapse" | "simplification-review" | "keep";
}

export interface SpiderGraphCleanupFindings {
  nearlyCoincidentNodes: NearlyCoincidentNodeFinding[];
  duplicateEdges: DuplicateEdgeFinding[];
  collinearOverlaps: CollinearOverlapFinding[];
  edgeIntersections: EdgeIntersectionFinding[];
  microEdges: MicroEdgeFinding[];
  degree2CollinearNodes: Degree2CollinearFinding[];
}

export interface TerminalConnectivityStats {
  terminalCount: number;
  resolvedCount: number;
  connectedCount: number;
  missingTerminalIds: string[];
  componentSignature: string[];
}

export interface SpiderGraphStats {
  nodeCount: number;
  edgeCount: number;
  connectedComponents: number;
  totalEdgeLength: number;
  motifConnectivity: TerminalConnectivityStats;
  supportTargetConnectivity: TerminalConnectivityStats;
}

export interface SpiderGraphCleanupOperation {
  kind: "merge-near-nodes" | "remove-duplicate-edge" | "collapse-degree2-collinear";
  sourceNodeIds: number[];
  sourceEdgeIds: number[];
  detail: string;
}

export interface SpiderGraphTopologyPreservation {
  ok: boolean;
  connectedComponentsPreserved: boolean;
  motifConnectivityPreserved: boolean;
  supportTargetConnectivityPreserved: boolean;
  totalEdgeLengthPreserved: boolean;
  totalEdgeLengthDelta: number;
  differences: string[];
}

export interface SpiderGraphCleanupLabReport {
  policy: SpiderGraphCleanupPolicy;
  geometryKind: SpiderEdgeGeometryAdapter["kind"];
  rawGraph: InternalStructureGraph;
  cleanupCandidate: InternalStructureGraph;
  rawStats: SpiderGraphStats;
  candidateStats: SpiderGraphStats;
  findings: SpiderGraphCleanupFindings;
  appliedOperations: SpiderGraphCleanupOperation[];
  topologyPreservation: SpiderGraphTopologyPreservation;
}

interface MutableEdge extends InternalStructureEdge {
  sourceEdgeIds: number[];
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function subtract(first: Vector3Value, second: Vector3Value): Vector3Value {
  return { x: first.x - second.x, y: first.y - second.y, z: first.z - second.z };
}

function addScaled(start: Vector3Value, direction: Vector3Value, scale: number): Vector3Value {
  return {
    x: start.x + direction.x * scale,
    y: start.y + direction.y * scale,
    z: start.z + direction.z * scale,
  };
}

function dot(first: Vector3Value, second: Vector3Value): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross(first: Vector3Value, second: Vector3Value): Vector3Value {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
}

function magnitude(value: Vector3Value): number {
  return Math.hypot(value.x, value.y, value.z);
}

function distance(first: Vector3Value, second: Vector3Value): number {
  return magnitude(subtract(first, second));
}

function normalize(value: Vector3Value): Vector3Value {
  const length = magnitude(value);
  return length > 0
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : { x: 0, y: 0, z: 0 };
}

function nodeMap(graph: Pick<InternalStructureGraph, "nodes">): Map<number, InternalStructureNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function edgeEndpoints(
  graph: Pick<InternalStructureGraph, "nodes">,
  edge: Pick<InternalStructureEdge, "start" | "end">,
): [Vector3Value, Vector3Value] {
  const nodes = nodeMap(graph);
  const start = nodes.get(edge.start);
  const end = nodes.get(edge.end);
  if (!start || !end) throw new Error(`edge ${edge.start}:${edge.end} references a missing node`);
  return [start.position, end.position];
}

function closestPointsOnSegments(
  firstStart: Vector3Value,
  firstEnd: Vector3Value,
  secondStart: Vector3Value,
  secondEnd: Vector3Value,
): EdgeClosestApproach {
  // Real-Time Collision Detection, segment/segment closest points. The
  // degenerate branches matter for laboratory diagnostics, even though the
  // current Spider generator normally rejects zero-length edges.
  const firstDirection = subtract(firstEnd, firstStart);
  const secondDirection = subtract(secondEnd, secondStart);
  const betweenStarts = subtract(firstStart, secondStart);
  const a = dot(firstDirection, firstDirection);
  const e = dot(secondDirection, secondDirection);
  const f = dot(secondDirection, betweenStarts);
  const epsilon = 1e-20;
  let firstParameter = 0;
  let secondParameter = 0;

  if (a <= epsilon && e <= epsilon) {
    const firstPoint = { ...firstStart };
    const secondPoint = { ...secondStart };
    return {
      distance: distance(firstPoint, secondPoint),
      firstParameter,
      secondParameter,
      firstPoint,
      secondPoint,
    };
  }
  if (a <= epsilon) {
    secondParameter = clamp01(f / e);
  } else {
    const c = dot(firstDirection, betweenStarts);
    if (e <= epsilon) {
      firstParameter = clamp01(-c / a);
    } else {
      const b = dot(firstDirection, secondDirection);
      const denominator = a * e - b * b;
      firstParameter = denominator !== 0 ? clamp01((b * f - c * e) / denominator) : 0;
      secondParameter = (b * firstParameter + f) / e;
      if (secondParameter < 0) {
        secondParameter = 0;
        firstParameter = clamp01(-c / a);
      } else if (secondParameter > 1) {
        secondParameter = 1;
        firstParameter = clamp01((b - c) / a);
      }
    }
  }

  const firstPoint = addScaled(firstStart, firstDirection, firstParameter);
  const secondPoint = addScaled(secondStart, secondDirection, secondParameter);
  return {
    distance: distance(firstPoint, secondPoint),
    firstParameter,
    secondParameter,
    firstPoint,
    secondPoint,
  };
}

export const STRAIGHT_SPIDER_EDGE_GEOMETRY: SpiderEdgeGeometryAdapter = {
  kind: "straight",
  length(graph, edge) {
    const [start, end] = edgeEndpoints(graph, edge);
    return distance(start, end);
  },
  pointAt(graph, edge, parameter) {
    const [start, end] = edgeEndpoints(graph, edge);
    return addScaled(start, subtract(end, start), clamp01(parameter));
  },
  tangentAt(graph, edge, endpoint) {
    const [start, end] = edgeEndpoints(graph, edge);
    return endpoint === "start" ? normalize(subtract(end, start)) : normalize(subtract(start, end));
  },
  closestApproach(graph, first, second) {
    const [firstStart, firstEnd] = edgeEndpoints(graph, first);
    const [secondStart, secondEnd] = edgeEndpoints(graph, second);
    return closestPointsOnSegments(firstStart, firstEnd, secondStart, secondEnd);
  },
};

function cloneGraph(graph: InternalStructureGraph): InternalStructureGraph {
  return {
    kind: graph.kind,
    nodes: graph.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    stats: { ...graph.stats },
  };
}

function adjacency(graph: Pick<InternalStructureGraph, "nodes" | "edges">): Map<number, number[]> {
  const result = new Map(graph.nodes.map((node) => [node.id, [] as number[]]));
  for (const edge of graph.edges) {
    if (!result.has(edge.start) || !result.has(edge.end)) continue;
    result.get(edge.start)!.push(edge.end);
    result.get(edge.end)!.push(edge.start);
  }
  for (const neighbours of result.values()) neighbours.sort((a, b) => a - b);
  return result;
}

function componentIds(graph: Pick<InternalStructureGraph, "nodes" | "edges">): Map<number, number> {
  const neighbours = adjacency(graph);
  const result = new Map<number, number>();
  let component = 0;
  for (const node of [...graph.nodes].sort((a, b) => a.id - b.id)) {
    if (result.has(node.id)) continue;
    result.set(node.id, component);
    const queue = [node.id];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      for (const next of neighbours.get(current) ?? []) {
        if (result.has(next)) continue;
        result.set(next, component);
        queue.push(next);
      }
    }
    component++;
  }
  return result;
}

function resolveTerminals(
  graph: Pick<InternalStructureGraph, "nodes">,
  terminals: readonly SpiderGraphTerminal[],
  tolerance: number,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const terminal of terminals) {
    const candidate = graph.nodes
      .map((node) => ({ node, distance: distance(node.position, terminal.position) }))
      .filter((entry) => entry.distance <= tolerance)
      .sort((first, second) => first.distance - second.distance || first.node.id - second.node.id)[0];
    if (candidate) result.set(terminal.id, candidate.node.id);
  }
  return result;
}

function terminalConnectivity(
  graph: Pick<InternalStructureGraph, "nodes" | "edges">,
  terminals: readonly SpiderGraphTerminal[],
  role: SpiderGraphTerminalRole,
  tolerance: number,
): TerminalConnectivityStats {
  const selected = terminals.filter((terminal) => terminal.role === role);
  const resolved = resolveTerminals(graph, selected, tolerance);
  const components = componentIds(graph);
  const groups = new Map<number, string[]>();
  for (const terminal of selected) {
    const nodeId = resolved.get(terminal.id);
    if (nodeId === undefined) continue;
    const component = components.get(nodeId);
    if (component === undefined) continue;
    const group = groups.get(component) ?? [];
    group.push(terminal.id);
    groups.set(component, group);
  }
  const componentSignature = [...groups.values()]
    .map((group) => group.sort().join("|"))
    .sort();
  const connectedCount = Math.max(0, ...[...groups.values()].map((group) => group.length));
  return {
    terminalCount: selected.length,
    resolvedCount: resolved.size,
    connectedCount,
    missingTerminalIds: selected.filter((terminal) => !resolved.has(terminal.id)).map((terminal) => terminal.id).sort(),
    componentSignature,
  };
}

export function captureSpiderGraphStats(
  graph: InternalStructureGraph,
  terminals: readonly SpiderGraphTerminal[],
  policy: SpiderGraphCleanupPolicy = DEFAULT_SPIDER_GRAPH_CLEANUP_POLICY,
  geometry: SpiderEdgeGeometryAdapter = STRAIGHT_SPIDER_EDGE_GEOMETRY,
): SpiderGraphStats {
  const totalEdgeLength = graph.edges.reduce((sum, edge) => sum + geometry.length(graph, edge), 0);
  const components = new Set(componentIds(graph).values());
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    connectedComponents: components.size,
    totalEdgeLength,
    motifConnectivity: terminalConnectivity(graph, terminals, "motif", policy.nodeCoincidenceTolerance),
    supportTargetConnectivity: terminalConnectivity(
      graph,
      terminals,
      "support-target",
      policy.nodeCoincidenceTolerance,
    ),
  };
}

function protectedNodes(
  graph: Pick<InternalStructureGraph, "nodes">,
  terminals: readonly SpiderGraphTerminal[],
  tolerance: number,
): Set<number> {
  // Protection is deliberately conservative: if multiple Raw nodes occupy a
  // terminal's tolerance envelope, none may be silently treated as disposable
  // just because terminal resolution selected the nearest/tie-broken one.
  return new Set(graph.nodes
    .filter((node) => terminals.some((terminal) => distance(node.position, terminal.position) <= tolerance))
    .map((node) => node.id));
}

function canonicalEdgeKey(start: number, end: number): string {
  return start < end ? `${start}:${end}` : `${end}:${start}`;
}

function compatibleRadius(first: number, second: number, tolerance: number): boolean {
  return Math.abs(first - second) <= tolerance;
}

function edgeIncidence(graph: Pick<InternalStructureGraph, "nodes" | "edges">): Map<number, InternalStructureEdge[]> {
  const result = new Map(graph.nodes.map((node) => [node.id, [] as InternalStructureEdge[]]));
  for (const edge of graph.edges) {
    result.get(edge.start)?.push(edge);
    result.get(edge.end)?.push(edge);
  }
  for (const edges of result.values()) edges.sort((a, b) => a.id - b.id);
  return result;
}

function degree2Finding(
  graph: InternalStructureGraph,
  node: InternalStructureNode,
  incident: [InternalStructureEdge, InternalStructureEdge],
  isProtected: boolean,
  policy: SpiderGraphCleanupPolicy,
  geometry: SpiderEdgeGeometryAdapter,
): Degree2CollinearFinding | null {
  const firstTangent = incident[0].start === node.id
    ? geometry.tangentAt(graph, incident[0], "start")
    : geometry.tangentAt(graph, incident[0], "end");
  const secondTangent = incident[1].start === node.id
    ? geometry.tangentAt(graph, incident[1], "start")
    : geometry.tangentAt(graph, incident[1], "end");
  if (magnitude(firstTangent) === 0 || magnitude(secondTangent) === 0) return null;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot(firstTangent, secondTangent)))) * 180 / Math.PI;
  const deviationFromStraightDeg = Math.abs(180 - angleDeg);
  if (deviationFromStraightDeg > policy.simplificationCollinearAngleToleranceDeg) return null;
  const radiusCompatible = compatibleRadius(incident[0].radius, incident[1].radius, policy.radiusTolerance);
  const candidateAction = geometry.kind === "straight" && !isProtected && radiusCompatible
    && deviationFromStraightDeg <= policy.cleanupCollinearAngleToleranceDeg
    ? "collapse"
    : !isProtected && radiusCompatible
      ? "simplification-review"
      : "keep";
  return {
    nodeId: node.id,
    edgeIds: [incident[0].id, incident[1].id],
    deviationFromStraightDeg,
    compatibleRadius: radiusCompatible,
    protected: isProtected,
    candidateAction,
  };
}

function collinearOverlapLength(
  graph: InternalStructureGraph,
  first: InternalStructureEdge,
  second: InternalStructureEdge,
  policy: SpiderGraphCleanupPolicy,
): number {
  const [firstStart, firstEnd] = edgeEndpoints(graph, first);
  const [secondStart, secondEnd] = edgeEndpoints(graph, second);
  const firstDirection = subtract(firstEnd, firstStart);
  const secondDirection = subtract(secondEnd, secondStart);
  const firstLength = magnitude(firstDirection);
  const secondLength = magnitude(secondDirection);
  if (firstLength <= policy.collinearDistanceTolerance || secondLength <= policy.collinearDistanceTolerance) return 0;
  const angularSine = magnitude(cross(firstDirection, secondDirection)) / (firstLength * secondLength);
  const angleTolerance = Math.sin(policy.simplificationCollinearAngleToleranceDeg * Math.PI / 180);
  if (angularSine > angleTolerance) return 0;
  const axis = normalize(firstDirection);
  const lineDistance = (point: Vector3Value): number => magnitude(cross(subtract(point, firstStart), axis));
  if (lineDistance(secondStart) > policy.collinearDistanceTolerance
    || lineDistance(secondEnd) > policy.collinearDistanceTolerance) return 0;
  const secondA = dot(subtract(secondStart, firstStart), axis);
  const secondB = dot(subtract(secondEnd, firstStart), axis);
  const overlapStart = Math.max(0, Math.min(secondA, secondB));
  const overlapEnd = Math.min(firstLength, Math.max(secondA, secondB));
  return Math.max(0, overlapEnd - overlapStart);
}

function classifyIntersection(
  approach: EdgeClosestApproach,
  endpointTolerance: number,
): EdgeIntersectionFinding["kind"] {
  const firstEndpoint = approach.firstParameter <= endpointTolerance
    || approach.firstParameter >= 1 - endpointTolerance;
  const secondEndpoint = approach.secondParameter <= endpointTolerance
    || approach.secondParameter >= 1 - endpointTolerance;
  if (firstEndpoint && secondEndpoint) return "endpoint-endpoint-unshared";
  if (firstEndpoint || secondEndpoint) return "endpoint-interior";
  return "interior-interior";
}

export function findSpiderGraphCleanupCandidates(
  graph: InternalStructureGraph,
  terminals: readonly SpiderGraphTerminal[],
  policy: SpiderGraphCleanupPolicy = DEFAULT_SPIDER_GRAPH_CLEANUP_POLICY,
  geometry: SpiderEdgeGeometryAdapter = STRAIGHT_SPIDER_EDGE_GEOMETRY,
): SpiderGraphCleanupFindings {
  const protectedNodeIds = protectedNodes(graph, terminals, policy.nodeCoincidenceTolerance);
  const components = componentIds(graph);
  const nearlyCoincidentNodes: NearlyCoincidentNodeFinding[] = [];
  for (let firstIndex = 0; firstIndex < graph.nodes.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < graph.nodes.length; secondIndex++) {
      const first = graph.nodes[firstIndex];
      const second = graph.nodes[secondIndex];
      const separation = distance(first.position, second.position);
      if (separation > policy.nodeCoincidenceTolerance) continue;
      const isProtected = protectedNodeIds.has(first.id) || protectedNodeIds.has(second.id);
      const sameComponent = components.get(first.id) === components.get(second.id);
      const bothProtected = protectedNodeIds.has(first.id) && protectedNodeIds.has(second.id);
      const radiusCompatible = compatibleRadius(first.radius, second.radius, policy.radiusTolerance);
      nearlyCoincidentNodes.push({
        firstNodeId: first.id,
        secondNodeId: second.id,
        distance: separation,
        protected: isProtected,
        sameComponent,
        candidateAction: sameComponent && !bothProtected && radiusCompatible ? "merge" : "review-only",
      });
    }
  }

  const duplicateGroups = new Map<string, InternalStructureEdge[]>();
  for (const edge of graph.edges) {
    const key = canonicalEdgeKey(edge.start, edge.end);
    const group = duplicateGroups.get(key) ?? [];
    group.push(edge);
    duplicateGroups.set(key, group);
  }
  const duplicateEdges = [...duplicateGroups.values()]
    .filter((group) => group.length > 1)
    .map((group): DuplicateEdgeFinding => {
      const sorted = [...group].sort((a, b) => a.id - b.id);
      const radiusCompatible = sorted.every((edge) => compatibleRadius(edge.radius, sorted[0].radius, policy.radiusTolerance));
      return {
        edgeIds: sorted.map((edge) => edge.id),
        startNodeId: Math.min(sorted[0].start, sorted[0].end),
        endNodeId: Math.max(sorted[0].start, sorted[0].end),
        compatibleRadius: radiusCompatible,
        candidateAction: radiusCompatible ? "remove-duplicates" : "review-only",
      };
    });

  const minimumRadius = Math.min(...graph.edges.map((edge) => edge.radius).filter((radius) => radius > 0));
  const microThreshold = Math.max(
    policy.nodeCoincidenceTolerance * 4,
    (Number.isFinite(minimumRadius) ? minimumRadius : 0) * policy.microEdgeRadiusFactor,
  );
  const microEdges = graph.edges
    .map((edge): MicroEdgeFinding | null => {
      const edgeLength = geometry.length(graph, edge);
      if (edgeLength > microThreshold) return null;
      const nearMerge = edgeLength <= policy.nodeCoincidenceTolerance
        && nearlyCoincidentNodes.some((finding) =>
          canonicalEdgeKey(finding.firstNodeId, finding.secondNodeId) === canonicalEdgeKey(edge.start, edge.end)
          && finding.candidateAction === "merge");
      return {
        edgeId: edge.id,
        length: edgeLength,
        threshold: microThreshold,
        protectedEndpoint: protectedNodeIds.has(edge.start) || protectedNodeIds.has(edge.end),
        candidateAction: nearMerge ? "near-node-merge" : "simplification-review",
      };
    })
    .filter((finding): finding is MicroEdgeFinding => finding !== null);

  const incidence = edgeIncidence(graph);
  const degree2CollinearNodes = graph.nodes
    .map((node): Degree2CollinearFinding | null => {
      const incident = incidence.get(node.id) ?? [];
      if (incident.length !== 2) return null;
      return degree2Finding(
        graph,
        node,
        incident as [InternalStructureEdge, InternalStructureEdge],
        protectedNodeIds.has(node.id),
        policy,
        geometry,
      );
    })
    .filter((finding): finding is Degree2CollinearFinding => finding !== null)
    .sort((a, b) => a.nodeId - b.nodeId);

  const duplicatePairKeys = new Set(duplicateEdges.flatMap((group) => {
    const pairs: string[] = [];
    for (let first = 0; first < group.edgeIds.length; first++) {
      for (let second = first + 1; second < group.edgeIds.length; second++) {
        pairs.push(`${group.edgeIds[first]}:${group.edgeIds[second]}`);
      }
    }
    return pairs;
  }));
  const collinearOverlaps: CollinearOverlapFinding[] = [];
  const edgeIntersections: EdgeIntersectionFinding[] = [];
  const edges = [...graph.edges].sort((a, b) => a.id - b.id);
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex++) {
      const first = edges[firstIndex];
      const second = edges[secondIndex];
      if (duplicatePairKeys.has(`${first.id}:${second.id}`)) continue;
      const overlapLength = geometry.kind === "straight"
        ? collinearOverlapLength(graph, first, second, policy)
        : 0;
      if (overlapLength > policy.collinearDistanceTolerance) {
        collinearOverlaps.push({
          firstEdgeId: first.id,
          secondEdgeId: second.id,
          overlapLength,
          compatibleRadius: compatibleRadius(first.radius, second.radius, policy.radiusTolerance),
          candidateAction: "review-only",
        });
        continue;
      }
      const approach = geometry.closestApproach(graph, first, second);
      if (approach.distance > policy.intersectionTolerance) continue;
      const sharedNode = first.start === second.start || first.start === second.end
        || first.end === second.start || first.end === second.end;
      const atFirstEndpoint = approach.firstParameter <= policy.intersectionEndpointTolerance
        || approach.firstParameter >= 1 - policy.intersectionEndpointTolerance;
      const atSecondEndpoint = approach.secondParameter <= policy.intersectionEndpointTolerance
        || approach.secondParameter >= 1 - policy.intersectionEndpointTolerance;
      if (sharedNode && atFirstEndpoint && atSecondEndpoint) continue;
      edgeIntersections.push({
        firstEdgeId: first.id,
        secondEdgeId: second.id,
        kind: classifyIntersection(approach, policy.intersectionEndpointTolerance),
        position: {
          x: (approach.firstPoint.x + approach.secondPoint.x) * 0.5,
          y: (approach.firstPoint.y + approach.secondPoint.y) * 0.5,
          z: (approach.firstPoint.z + approach.secondPoint.z) * 0.5,
        },
        separation: approach.distance,
        candidateAction: "review-only",
      });
    }
  }

  return {
    nearlyCoincidentNodes: nearlyCoincidentNodes.sort((a, b) =>
      a.distance - b.distance || a.firstNodeId - b.firstNodeId || a.secondNodeId - b.secondNodeId),
    duplicateEdges,
    collinearOverlaps: collinearOverlaps.sort((a, b) =>
      a.firstEdgeId - b.firstEdgeId || a.secondEdgeId - b.secondEdgeId),
    edgeIntersections: edgeIntersections.sort((a, b) =>
      a.firstEdgeId - b.firstEdgeId || a.secondEdgeId - b.secondEdgeId),
    microEdges: microEdges.sort((a, b) => a.length - b.length || a.edgeId - b.edgeId),
    degree2CollinearNodes,
  };
}

class DisjointSet {
  private readonly parent = new Map<number, number>();

  constructor(ids: readonly number[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: number): number {
    const parent = this.parent.get(id);
    if (parent === undefined) throw new Error(`unknown node ${id}`);
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(retained: number, removed: number): void {
    const retainedRoot = this.find(retained);
    const removedRoot = this.find(removed);
    if (retainedRoot !== removedRoot) this.parent.set(removedRoot, retainedRoot);
  }
}

function mutableCandidate(
  raw: InternalStructureGraph,
  findings: SpiderGraphCleanupFindings,
  terminals: readonly SpiderGraphTerminal[],
  policy: SpiderGraphCleanupPolicy,
  geometry: SpiderEdgeGeometryAdapter,
): { graph: InternalStructureGraph; operations: SpiderGraphCleanupOperation[] } {
  const operations: SpiderGraphCleanupOperation[] = [];
  const protectedNodeIds = protectedNodes(raw, terminals, policy.nodeCoincidenceTolerance);
  const set = new DisjointSet(raw.nodes.map((node) => node.id));

  for (const finding of findings.nearlyCoincidentNodes.filter((entry) => entry.candidateAction === "merge")) {
    const firstProtected = protectedNodeIds.has(finding.firstNodeId);
    const secondProtected = protectedNodeIds.has(finding.secondNodeId);
    const retained = firstProtected ? finding.firstNodeId
      : secondProtected ? finding.secondNodeId
        : Math.min(finding.firstNodeId, finding.secondNodeId);
    const removed = retained === finding.firstNodeId ? finding.secondNodeId : finding.firstNodeId;
    if (set.find(retained) === set.find(removed)) continue;
    set.union(retained, removed);
    operations.push({
      kind: "merge-near-nodes",
      sourceNodeIds: [retained, removed],
      sourceEdgeIds: [],
      detail: `distance=${finding.distance}`,
    });
  }

  const nodesByRetained = new Map<number, InternalStructureNode>();
  for (const node of raw.nodes) {
    const retainedId = set.find(node.id);
    const existing = nodesByRetained.get(retainedId);
    if (!existing || node.id === retainedId) {
      nodesByRetained.set(retainedId, { ...node, id: retainedId, position: { ...node.position } });
    }
  }
  const mutableEdges: MutableEdge[] = raw.edges.map((edge) => ({
    ...edge,
    start: set.find(edge.start),
    end: set.find(edge.end),
    sourceEdgeIds: [edge.id],
  })).filter((edge) => edge.start !== edge.end);

  const deduplicated: MutableEdge[] = [];
  const byEndpoint = new Map<string, MutableEdge[]>();
  for (const edge of mutableEdges) {
    const key = canonicalEdgeKey(edge.start, edge.end);
    const group = byEndpoint.get(key) ?? [];
    group.push(edge);
    byEndpoint.set(key, group);
  }
  for (const group of byEndpoint.values()) {
    const sorted = group.sort((a, b) => a.id - b.id);
    const radiusCompatible = sorted.every((edge) => compatibleRadius(edge.radius, sorted[0].radius, policy.radiusTolerance));
    if (!radiusCompatible) {
      deduplicated.push(...sorted);
      continue;
    }
    const kept = { ...sorted[0], sourceEdgeIds: sorted.flatMap((edge) => edge.sourceEdgeIds).sort((a, b) => a - b) };
    deduplicated.push(kept);
    for (const removed of sorted.slice(1)) {
      operations.push({
        kind: "remove-duplicate-edge",
        sourceNodeIds: [removed.start, removed.end],
        sourceEdgeIds: [...removed.sourceEdgeIds],
        detail: `retained source edge ${kept.sourceEdgeIds[0]}`,
      });
    }
  }

  const nodeRecords = new Map(nodesByRetained);
  const edgeRecords = new Map(deduplicated.map((edge) => [edge.id, edge]));
  const protectedRetained = new Set([...protectedNodeIds].map((id) => set.find(id)));
  let nextEdgeId = Math.max(-1, ...raw.edges.map((edge) => edge.id)) + 1;

  const currentGraph = (): InternalStructureGraph => ({
    kind: raw.kind,
    nodes: [...nodeRecords.values()],
    edges: [...edgeRecords.values()],
    stats: { ...raw.stats },
  });

  // Creating a replacement edge here is a straight-segment realization.
  // Curve-aware cleanup can still reuse every finding/connectivity audit, but
  // it must supply an explicit curve-join operation before automatic collapse
  // is allowed.
  let changed = geometry.kind === "straight";
  while (changed) {
    changed = false;
    const graph = currentGraph();
    const incidence = edgeIncidence(graph);
    const endpointKeys = new Set(graph.edges.map((edge) => canonicalEdgeKey(edge.start, edge.end)));
    for (const node of [...graph.nodes].sort((a, b) => a.id - b.id)) {
      if (protectedRetained.has(node.id)) continue;
      const incident = incidence.get(node.id) ?? [];
      if (incident.length !== 2) continue;
      const finding = degree2Finding(
        graph,
        node,
        incident as [InternalStructureEdge, InternalStructureEdge],
        false,
        policy,
        geometry,
      );
      if (!finding || finding.candidateAction !== "collapse") continue;
      const first = edgeRecords.get(incident[0].id)!;
      const second = edgeRecords.get(incident[1].id)!;
      const firstOther = first.start === node.id ? first.end : first.start;
      const secondOther = second.start === node.id ? second.end : second.start;
      if (firstOther === secondOther || endpointKeys.has(canonicalEdgeKey(firstOther, secondOther))) continue;
      edgeRecords.delete(first.id);
      edgeRecords.delete(second.id);
      nodeRecords.delete(node.id);
      const sourceEdgeIds = [...first.sourceEdgeIds, ...second.sourceEdgeIds].sort((a, b) => a - b);
      edgeRecords.set(nextEdgeId, {
        id: nextEdgeId,
        start: firstOther,
        end: secondOther,
        radius: first.radius,
        sourceEdgeIds,
      });
      operations.push({
        kind: "collapse-degree2-collinear",
        sourceNodeIds: [node.id],
        sourceEdgeIds,
        detail: `deviation=${finding.deviationFromStraightDeg}deg`,
      });
      nextEdgeId++;
      changed = true;
      break;
    }
  }

  const sortedNodes = [...nodeRecords.values()].sort((a, b) => a.id - b.id);
  const reindex = new Map(sortedNodes.map((node, index) => [node.id, index]));
  const nodes = sortedNodes.map((node, id) => ({ ...node, id, position: { ...node.position } }));
  const edges = [...edgeRecords.values()]
    .sort((a, b) => a.id - b.id)
    .map((edge, id) => ({
      id,
      start: reindex.get(edge.start)!,
      end: reindex.get(edge.end)!,
      radius: edge.radius,
    }));
  return {
    graph: {
      kind: raw.kind,
      nodes,
      edges,
      stats: {
        ...raw.stats,
        inputPoints: nodes.length,
        candidateEdges: edges.length,
        gridNodeCount: nodes.length,
        gridEdgeCount: edges.length,
      },
    },
    operations,
  };
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sameTerminalConnectivity(first: TerminalConnectivityStats, second: TerminalConnectivityStats): boolean {
  return first.terminalCount === second.terminalCount
    && first.resolvedCount === second.resolvedCount
    && first.connectedCount === second.connectedCount
    && sameStrings(first.missingTerminalIds, second.missingTerminalIds)
    && sameStrings(first.componentSignature, second.componentSignature);
}

function auditTopologyPreservation(
  raw: SpiderGraphStats,
  candidate: SpiderGraphStats,
  policy: SpiderGraphCleanupPolicy,
): SpiderGraphTopologyPreservation {
  const differences: string[] = [];
  const connectedComponentsPreserved = raw.connectedComponents === candidate.connectedComponents;
  const motifConnectivityPreserved = sameTerminalConnectivity(raw.motifConnectivity, candidate.motifConnectivity);
  const supportTargetConnectivityPreserved = sameTerminalConnectivity(
    raw.supportTargetConnectivity,
    candidate.supportTargetConnectivity,
  );
  const totalEdgeLengthDelta = candidate.totalEdgeLength - raw.totalEdgeLength;
  const totalEdgeLengthPreserved = Math.abs(totalEdgeLengthDelta) <= policy.totalLengthTolerance;
  if (!connectedComponentsPreserved) {
    differences.push(`components ${raw.connectedComponents} -> ${candidate.connectedComponents}`);
  }
  if (!motifConnectivityPreserved) differences.push("motif terminal component partition changed");
  if (!supportTargetConnectivityPreserved) differences.push("support target component partition changed");
  return {
    // Edge length is a geometric quantity, not topology: removing a truly
    // duplicated segment intentionally changes the raw summed length. Keep the
    // delta visible, but gate `ok` only on component/terminal preservation.
    ok: differences.length === 0,
    connectedComponentsPreserved,
    motifConnectivityPreserved,
    supportTargetConnectivityPreserved,
    totalEdgeLengthPreserved,
    totalEdgeLengthDelta,
    differences,
  };
}

export function analyzeSpiderGraphCleanupLab(
  inputGraph: InternalStructureGraph,
  terminals: readonly SpiderGraphTerminal[],
  policy: SpiderGraphCleanupPolicy = DEFAULT_SPIDER_GRAPH_CLEANUP_POLICY,
  geometry: SpiderEdgeGeometryAdapter = STRAIGHT_SPIDER_EDGE_GEOMETRY,
): SpiderGraphCleanupLabReport {
  const rawGraph = cloneGraph(inputGraph);
  const findings = findSpiderGraphCleanupCandidates(rawGraph, terminals, policy, geometry);
  const { graph: cleanupCandidate, operations } = mutableCandidate(
    rawGraph,
    findings,
    terminals,
    policy,
    geometry,
  );
  const rawStats = captureSpiderGraphStats(rawGraph, terminals, policy, geometry);
  const candidateStats = captureSpiderGraphStats(cleanupCandidate, terminals, policy, geometry);
  return {
    policy: { ...policy },
    geometryKind: geometry.kind,
    rawGraph,
    cleanupCandidate,
    rawStats,
    candidateStats,
    findings,
    appliedOperations: operations,
    topologyPreservation: auditTopologyPreservation(rawStats, candidateStats, policy),
  };
}

import type { InternalStructureEdge, InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import {
  captureSpiderGraphStats,
  type SpiderGraphCleanupLabReport,
  type SpiderGraphStats,
  type SpiderGraphTerminal,
  type TerminalConnectivityStats,
} from "./spiderGraphCleanupLab.ts";

/**
 * Development-only terminal-preserving topology study. This module consumes
 * the immutable Clean result and never feeds a result to production geometry,
 * FKEI or export. Intermediate Clean Nodes can become polyline control points;
 * terminal and branch identities remain first-class topology Nodes.
 */

export type SpiderTopologyLevel = "none" | "low" | "medium" | "high";
export type SpiderTerminalRole = "motif" | "support-target";

export interface SpiderTopologyLevelCriteria {
  enabled: boolean;
  maxLocalBendDeg: number;
  maxResultDetourRatio: number;
  maxContractedNodesPerEdge: number;
}

export interface SpiderTerminalTopologyPolicy {
  levelCriteria: Record<SpiderTopologyLevel, SpiderTopologyLevelCriteria>;
  terminalTolerance: number;
  nearbyJunctionDistanceFactor: number;
}

export const DEFAULT_SPIDER_TERMINAL_TOPOLOGY_POLICY: SpiderTerminalTopologyPolicy = {
  // These are geometric-intent thresholds, not target Node counts. The count
  // at each level is an observed result of eligible contractions.
  levelCriteria: {
    none: { enabled: false, maxLocalBendDeg: 0, maxResultDetourRatio: 1, maxContractedNodesPerEdge: 0 },
    low: { enabled: true, maxLocalBendDeg: 105, maxResultDetourRatio: 1.65, maxContractedNodesPerEdge: 1 },
    medium: { enabled: true, maxLocalBendDeg: 115, maxResultDetourRatio: 2.5, maxContractedNodesPerEdge: 3 },
    high: {
      enabled: true,
      maxLocalBendDeg: 180,
      maxResultDetourRatio: Number.POSITIVE_INFINITY,
      maxContractedNodesPerEdge: Number.POSITIVE_INFINITY,
    },
  },
  terminalTolerance: 1e-6,
  nearbyJunctionDistanceFactor: 0.75,
};

export type SpiderTopologyNodeKind = "terminal" | "branch-junction" | "critical-endpoint" | "intermediate";

export interface SpiderTopologyNodeClassification {
  cleanNodeId: number;
  rawNodeIds: number[];
  degree: number;
  kind: SpiderTopologyNodeKind;
  terminalRoles: SpiderTerminalRole[];
  terminalIds: string[];
  articulation: boolean;
  protectedReasons: string[];
}

export interface SpiderTerminalSummary {
  uniqueTerminalNodeCount: number;
  motifTerminalNodeCount: number;
  supportTerminalNodeCount: number;
  multiRoleTerminalNodeCount: number;
  inferredBranchJunctionCount: number;
  explicitJunctionCount: number;
  criticalEndpointCount: number;
  intermediateNodeCount: number;
}

export interface SpiderTopologyContractionMetrics {
  localBendDeg: number;
  resultMaximumBendDeg: number;
  resultDetourRatio: number;
  terminalHopDistance: number;
  branchHopDistance: number;
  intentCost: number;
}

export type SpiderTopologyNodeDecisionStatus =
  | "contracted"
  | "protected-terminal"
  | "protected-junction"
  | "protected-critical"
  | "retained-by-level"
  | "rejected-cycle";

export interface SpiderTopologyNodeDecision {
  cleanNodeId: number;
  rawNodeIds: number[];
  status: SpiderTopologyNodeDecisionStatus;
  contractionOrder: number | null;
  replacementEdgeId: string | null;
  metrics: SpiderTopologyContractionMetrics | null;
  reasons: string[];
}

export interface SpiderPortableTopologyNode {
  id: string;
  cleanNodeId: number;
  position: Vector3Value;
  terminalRoles: SpiderTerminalRole[];
  provenance: {
    cleanNodeIds: number[];
    rawNodeIds: number[];
  };
}

export interface SpiderPolylineRealizationIntent {
  kind: "straight" | "polyline";
  controlCleanNodeIds: number[];
  controlPoints: Vector3Value[];
  sourceRadii: number[];
}

export interface SpiderPortableTopologyEdge {
  id: string;
  startNodeId: string;
  endNodeId: string;
  provenance: {
    cleanEdgeIds: number[];
    rawEdgeIds: number[];
    contractedCleanNodeIds: number[];
    contractedRawNodeIds: number[];
  };
  realizationIntent: SpiderPolylineRealizationIntent;
}

export interface SpiderPortableTopology {
  nodes: SpiderPortableTopologyNode[];
  edges: SpiderPortableTopologyEdge[];
}

export interface SpiderTerminalReachabilityAudit {
  uniqueTerminalNodes: number;
  reachableTerminalPairs: number;
  requiredTerminalPairs: number;
  preserved: boolean;
}

export interface SpiderTerminalTopologyAudit {
  ok: boolean;
  connectedComponents: number;
  motifConnected: number;
  motifRequired: number;
  supportConnected: number;
  supportRequired: number;
  terminalReachability: SpiderTerminalReachabilityAudit;
  retainedTerminalIdentity: boolean;
  retainedMajorBranchIdentity: boolean;
  cleanNodeProvenanceComplete: boolean;
  cleanEdgeProvenanceComplete: boolean;
  cycleRankPreserved: boolean;
  reasons: string[];
}

export interface SpiderTopologyContractionOperation {
  order: number;
  contractedCleanNodeId: number;
  sourceEdgeIds: string[];
  replacementEdgeId: string;
  metrics: SpiderTopologyContractionMetrics;
}

export interface SpiderNearbyJunctionFinding {
  firstCleanNodeId: number;
  secondCleanNodeId: number;
  distance: number;
  threshold: number;
  candidateAction: "review-only-protected-junction";
}

export interface SpiderSmallCycleFinding {
  cleanNodeIds: [number, number, number];
  cleanEdgeIds: [number, number, number];
  candidateAction: "review-only-cycle-cluster";
}

export interface SpiderShortDetourNodeFinding {
  cleanNodeId: number;
  neighbourCleanNodeIds: [number, number];
  directCleanEdgeId: number;
  candidateAction: "review-only-cycle-reduction";
}

export interface SpiderTerminalTopologyFindings {
  nearbyJunctions: SpiderNearbyJunctionFinding[];
  smallCycleClusters: SpiderSmallCycleFinding[];
  shortDetourNodes: SpiderShortDetourNodeFinding[];
}

export interface SpiderTerminalTopologyLevelResult {
  level: SpiderTopologyLevel;
  criteria: SpiderTopologyLevelCriteria;
  graph: InternalStructureGraph;
  topology: SpiderPortableTopology;
  stats: SpiderGraphStats;
  cycleRank: number;
  contractedNodeIds: number[];
  retainedNodeIds: number[];
  rewiredEdgeIds: string[];
  operations: SpiderTopologyContractionOperation[];
  decisions: SpiderTopologyNodeDecision[];
  audit: SpiderTerminalTopologyAudit;
}

export interface SpiderTerminalTopologyStudy {
  cleanInputStats: SpiderGraphStats;
  classifications: SpiderTopologyNodeClassification[];
  terminalSummary: SpiderTerminalSummary;
  findings: SpiderTerminalTopologyFindings;
  initialCycleRank: number;
  majorBranchNodeIds: number[];
  levels: Record<SpiderTopologyLevel, SpiderTerminalTopologyLevelResult>;
}

interface MutableNode {
  id: number;
  position: Vector3Value;
  radius: number;
  rawNodeIds: number[];
}

interface MutableEdge {
  id: number;
  start: number;
  end: number;
  radius: number;
  pathCleanNodeIds: number[];
  pathPoints: Vector3Value[];
  cleanEdgeIds: number[];
  rawEdgeIds: number[];
  contractedCleanNodeIds: number[];
  contractedRawNodeIds: number[];
  sourceRadii: number[];
}

interface MutableTopology {
  nodes: Map<number, MutableNode>;
  edges: Map<number, MutableEdge>;
  nextEdgeId: number;
}

interface CandidateEvaluation {
  cleanNodeId: number;
  firstEdgeId: number;
  secondEdgeId: number;
  firstNeighbourId: number;
  secondNeighbourId: number;
  merged: MutableEdge;
  metrics: SpiderTopologyContractionMetrics;
  rejection: string | null;
}

const LEVELS: readonly SpiderTopologyLevel[] = ["none", "low", "medium", "high"];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distance(first: Vector3Value, second: Vector3Value): number {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function subtract(first: Vector3Value, second: Vector3Value): Vector3Value {
  return { x: first.x - second.x, y: first.y - second.y, z: first.z - second.z };
}

function dot(first: Vector3Value, second: Vector3Value): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function magnitude(value: Vector3Value): number {
  return Math.hypot(value.x, value.y, value.z);
}

function bendDeg(previous: Vector3Value, current: Vector3Value, next: Vector3Value): number {
  const incoming = subtract(previous, current);
  const outgoing = subtract(next, current);
  const incomingLength = magnitude(incoming);
  const outgoingLength = magnitude(outgoing);
  if (incomingLength <= 1e-12 || outgoingLength <= 1e-12) return 180;
  const cosine = Math.max(-1, Math.min(1, dot(incoming, outgoing) / (incomingLength * outgoingLength)));
  const interiorAngle = Math.acos(cosine) * 180 / Math.PI;
  return Math.abs(180 - interiorAngle);
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((first, second) => first - second);
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sameTerminalStats(first: TerminalConnectivityStats, second: TerminalConnectivityStats): boolean {
  return first.terminalCount === second.terminalCount
    && first.resolvedCount === second.resolvedCount
    && first.connectedCount === second.connectedCount
    && sameStrings(first.missingTerminalIds, second.missingTerminalIds)
    && sameStrings(first.componentSignature, second.componentSignature);
}

function graphIncidence(graph: Pick<InternalStructureGraph, "nodes" | "edges">): Map<number, InternalStructureEdge[]> {
  const result = new Map(graph.nodes.map((node) => [node.id, [] as InternalStructureEdge[]]));
  for (const edge of graph.edges) {
    result.get(edge.start)?.push(edge);
    result.get(edge.end)?.push(edge);
  }
  for (const edges of result.values()) edges.sort((first, second) => first.id - second.id);
  return result;
}

function mutableIncidence(state: MutableTopology): Map<number, MutableEdge[]> {
  const result = new Map([...state.nodes.keys()].map((id) => [id, [] as MutableEdge[]]));
  for (const edge of state.edges.values()) {
    result.get(edge.start)?.push(edge);
    result.get(edge.end)?.push(edge);
  }
  for (const edges of result.values()) edges.sort((first, second) => first.id - second.id);
  return result;
}

function components(graph: Pick<InternalStructureGraph, "nodes" | "edges">): Map<number, number> {
  const incidence = graphIncidence(graph);
  const result = new Map<number, number>();
  let component = 0;
  for (const node of [...graph.nodes].sort((first, second) => first.id - second.id)) {
    if (result.has(node.id)) continue;
    result.set(node.id, component);
    const queue = [node.id];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      for (const edge of incidence.get(current) ?? []) {
        const next = edge.start === current ? edge.end : edge.start;
        if (result.has(next)) continue;
        result.set(next, component);
        queue.push(next);
      }
    }
    component++;
  }
  return result;
}

function resolveTerminalNodes(
  graph: Pick<InternalStructureGraph, "nodes">,
  terminals: readonly SpiderGraphTerminal[],
  tolerance: number,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const terminal of terminals) {
    const match = graph.nodes
      .map((node) => ({ nodeId: node.id, distance: distance(node.position, terminal.position) }))
      .filter((entry) => entry.distance <= tolerance)
      .sort((first, second) => first.distance - second.distance || first.nodeId - second.nodeId)[0];
    if (match) result.set(terminal.id, match.nodeId);
  }
  return result;
}

function terminalRolesByNode(
  graph: Pick<InternalStructureGraph, "nodes">,
  terminals: readonly SpiderGraphTerminal[],
  tolerance: number,
): Map<number, { roles: Set<SpiderTerminalRole>; terminalIds: string[] }> {
  const resolved = resolveTerminalNodes(graph, terminals, tolerance);
  const result = new Map<number, { roles: Set<SpiderTerminalRole>; terminalIds: string[] }>();
  for (const terminal of terminals) {
    const nodeId = resolved.get(terminal.id);
    if (nodeId === undefined) continue;
    const entry = result.get(nodeId) ?? { roles: new Set<SpiderTerminalRole>(), terminalIds: [] };
    entry.roles.add(terminal.role);
    entry.terminalIds.push(terminal.id);
    result.set(nodeId, entry);
  }
  for (const entry of result.values()) entry.terminalIds.sort();
  return result;
}

function articulationNodeIds(graph: InternalStructureGraph): Set<number> {
  const incidence = graphIncidence(graph);
  const discovery = new Map<number, number>();
  const low = new Map<number, number>();
  const parent = new Map<number, number>();
  const articulation = new Set<number>();
  let time = 0;

  const visit = (nodeId: number): void => {
    discovery.set(nodeId, ++time);
    low.set(nodeId, discovery.get(nodeId)!);
    let children = 0;
    for (const edge of incidence.get(nodeId) ?? []) {
      const next = edge.start === nodeId ? edge.end : edge.start;
      if (!discovery.has(next)) {
        parent.set(next, nodeId);
        children++;
        visit(next);
        low.set(nodeId, Math.min(low.get(nodeId)!, low.get(next)!));
        if (!parent.has(nodeId) && children > 1) articulation.add(nodeId);
        if (parent.has(nodeId) && low.get(next)! >= discovery.get(nodeId)!) articulation.add(nodeId);
      } else if (parent.get(nodeId) !== next) {
        low.set(nodeId, Math.min(low.get(nodeId)!, discovery.get(next)!));
      }
    }
  };
  for (const node of graph.nodes) if (!discovery.has(node.id)) visit(node.id);
  return articulation;
}

function classifyNodes(
  cleanup: SpiderGraphCleanupLabReport,
  terminals: readonly SpiderGraphTerminal[],
  policy: SpiderTerminalTopologyPolicy,
): SpiderTopologyNodeClassification[] {
  const incidence = graphIncidence(cleanup.cleanupCandidate);
  const terminalRoles = terminalRolesByNode(cleanup.cleanupCandidate, terminals, policy.terminalTolerance);
  const articulation = articulationNodeIds(cleanup.cleanupCandidate);
  const rawIds = new Map(cleanup.provenance.nodes.map((node) => [node.cleanNodeId, node.rawNodeIds]));
  return cleanup.cleanupCandidate.nodes.map((node) => {
    const degree = incidence.get(node.id)?.length ?? 0;
    const terminal = terminalRoles.get(node.id);
    const roles = [...(terminal?.roles ?? [])].sort() as SpiderTerminalRole[];
    const kind: SpiderTopologyNodeKind = roles.length > 0
      ? "terminal"
      : degree >= 3
        ? "branch-junction"
        : degree <= 1
          ? "critical-endpoint"
          : "intermediate";
    const protectedReasons = kind === "terminal"
      ? [`terminal roles: ${roles.join("+")}`]
      : kind === "branch-junction"
        ? [`major branch identity: degree ${degree}`]
        : kind === "critical-endpoint"
          ? [`critical endpoint: degree ${degree}`]
          : articulation.has(node.id)
            ? ["series articulation is contractible only with explicit rewiring"]
            : [];
    return {
      cleanNodeId: node.id,
      rawNodeIds: [...(rawIds.get(node.id) ?? [])],
      degree,
      kind,
      terminalRoles: roles,
      terminalIds: [...(terminal?.terminalIds ?? [])],
      articulation: articulation.has(node.id),
      protectedReasons,
    };
  }).sort((first, second) => first.cleanNodeId - second.cleanNodeId);
}

function terminalSummary(classifications: readonly SpiderTopologyNodeClassification[]): SpiderTerminalSummary {
  const terminals = classifications.filter((node) => node.terminalRoles.length > 0);
  return {
    uniqueTerminalNodeCount: terminals.length,
    motifTerminalNodeCount: terminals.filter((node) => node.terminalRoles.includes("motif")).length,
    supportTerminalNodeCount: terminals.filter((node) => node.terminalRoles.includes("support-target")).length,
    multiRoleTerminalNodeCount: terminals.filter((node) => node.terminalRoles.length > 1).length,
    inferredBranchJunctionCount: classifications.filter((node) => node.degree >= 3).length,
    // Current InternalStructureGraph has no explicit Junction semantic field.
    explicitJunctionCount: 0,
    criticalEndpointCount: classifications.filter((node) => node.kind === "critical-endpoint").length,
    intermediateNodeCount: classifications.filter((node) => node.kind === "intermediate").length,
  };
}

function edgeLength(graph: InternalStructureGraph, edge: InternalStructureEdge): number {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return distance(nodes.get(edge.start)!, nodes.get(edge.end)!);
}

function topologyFindings(
  cleanup: SpiderGraphCleanupLabReport,
  classifications: readonly SpiderTopologyNodeClassification[],
  policy: SpiderTerminalTopologyPolicy,
): SpiderTerminalTopologyFindings {
  const graph = cleanup.cleanupCandidate;
  const incidence = graphIncidence(graph);
  const edgeByPair = new Map<string, InternalStructureEdge>();
  const key = (first: number, second: number): string => first < second ? `${first}:${second}` : `${second}:${first}`;
  for (const edge of graph.edges) edgeByPair.set(key(edge.start, edge.end), edge);
  const lengths = graph.edges.map((edge) => edgeLength(graph, edge)).sort((first, second) => first - second);
  const medianLength = lengths[Math.floor(lengths.length / 2)] ?? 0;
  const threshold = medianLength * policy.nearbyJunctionDistanceFactor;
  const branchIds = classifications.filter((node) => node.degree >= 3).map((node) => node.cleanNodeId);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
  const nearbyJunctions: SpiderNearbyJunctionFinding[] = [];
  for (let firstIndex = 0; firstIndex < branchIds.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < branchIds.length; secondIndex++) {
      const first = branchIds[firstIndex];
      const second = branchIds[secondIndex];
      const separation = distance(nodes.get(first)!, nodes.get(second)!);
      if (separation > threshold) continue;
      nearbyJunctions.push({
        firstCleanNodeId: first,
        secondCleanNodeId: second,
        distance: separation,
        threshold,
        candidateAction: "review-only-protected-junction",
      });
    }
  }

  const smallCycleClusters: SpiderSmallCycleFinding[] = [];
  for (const first of graph.nodes.map((node) => node.id)) {
    const neighbours = (incidence.get(first) ?? [])
      .map((edge) => edge.start === first ? edge.end : edge.start)
      .filter((nodeId) => nodeId > first)
      .sort((a, b) => a - b);
    for (let a = 0; a < neighbours.length; a++) {
      for (let b = a + 1; b < neighbours.length; b++) {
        const second = neighbours[a];
        const third = neighbours[b];
        const closing = edgeByPair.get(key(second, third));
        if (!closing) continue;
        const edgeIds = [
          edgeByPair.get(key(first, second))!.id,
          edgeByPair.get(key(first, third))!.id,
          closing.id,
        ].sort((x, y) => x - y) as [number, number, number];
        smallCycleClusters.push({
          cleanNodeIds: [first, second, third],
          cleanEdgeIds: edgeIds,
          candidateAction: "review-only-cycle-cluster",
        });
      }
    }
  }

  const shortDetourNodes = classifications.filter((node) => node.kind === "intermediate").flatMap((node) => {
    const incident = incidence.get(node.cleanNodeId) ?? [];
    if (incident.length !== 2) return [];
    const neighbours = incident.map((edge) => edge.start === node.cleanNodeId ? edge.end : edge.start)
      .sort((first, second) => first - second) as [number, number];
    const direct = edgeByPair.get(key(neighbours[0], neighbours[1]));
    return direct ? [{
      cleanNodeId: node.cleanNodeId,
      neighbourCleanNodeIds: neighbours,
      directCleanEdgeId: direct.id,
      candidateAction: "review-only-cycle-reduction" as const,
    }] : [];
  });
  return { nearbyJunctions, smallCycleClusters, shortDetourNodes };
}

function initialMutableTopology(cleanup: SpiderGraphCleanupLabReport): MutableTopology {
  const rawNodes = new Map(cleanup.provenance.nodes.map((node) => [node.cleanNodeId, node.rawNodeIds]));
  const cleanEdges = new Map(cleanup.provenance.edges.map((edge) => [edge.cleanEdgeId, edge.rawEdgeIds]));
  const radii = new Map(cleanup.cleanEdgeRealizations.map((entry) => [entry.edgeId, entry.radius]));
  const nodePositions = new Map(cleanup.cleanTopology.nodes.map((node) => [node.id, node.position]));
  return {
    nodes: new Map(cleanup.cleanupCandidate.nodes.map((node) => [node.id, {
      id: node.id,
      position: { ...node.position },
      radius: node.radius,
      rawNodeIds: [...(rawNodes.get(node.id) ?? [])],
    }])),
    edges: new Map(cleanup.cleanupCandidate.edges.map((edge) => [edge.id, {
      id: edge.id,
      start: edge.start,
      end: edge.end,
      radius: edge.radius,
      pathCleanNodeIds: [edge.start, edge.end],
      pathPoints: [{ ...nodePositions.get(edge.start)! }, { ...nodePositions.get(edge.end)! }],
      cleanEdgeIds: [edge.id],
      rawEdgeIds: [...(cleanEdges.get(edge.id) ?? [])],
      contractedCleanNodeIds: [],
      contractedRawNodeIds: [],
      sourceRadii: [radii.get(edge.id) ?? edge.radius],
    }])),
    nextEdgeId: Math.max(-1, ...cleanup.cleanupCandidate.edges.map((edge) => edge.id)) + 1,
  };
}

function cloneMutableTopology(source: MutableTopology): MutableTopology {
  return {
    nodes: new Map([...source.nodes].map(([id, node]) => [id, {
      ...node,
      position: { ...node.position },
      rawNodeIds: [...node.rawNodeIds],
    }])),
    edges: new Map([...source.edges].map(([id, edge]) => [id, {
      ...edge,
      pathCleanNodeIds: [...edge.pathCleanNodeIds],
      pathPoints: edge.pathPoints.map((point) => ({ ...point })),
      cleanEdgeIds: [...edge.cleanEdgeIds],
      rawEdgeIds: [...edge.rawEdgeIds],
      contractedCleanNodeIds: [...edge.contractedCleanNodeIds],
      contractedRawNodeIds: [...edge.contractedRawNodeIds],
      sourceRadii: [...edge.sourceRadii],
    }])),
    nextEdgeId: source.nextEdgeId,
  };
}

function orientedEdge(edge: MutableEdge, from: number, to: number): {
  nodeIds: number[];
  points: Vector3Value[];
  radii: number[];
} {
  if (edge.start === from && edge.end === to) {
    return {
      nodeIds: [...edge.pathCleanNodeIds],
      points: edge.pathPoints.map((point) => ({ ...point })),
      radii: [...edge.sourceRadii],
    };
  }
  if (edge.start === to && edge.end === from) {
    return {
      nodeIds: [...edge.pathCleanNodeIds].reverse(),
      points: [...edge.pathPoints].reverse().map((point) => ({ ...point })),
      radii: [...edge.sourceRadii].reverse(),
    };
  }
  throw new Error(`edge ${edge.id} does not connect ${from} -> ${to}`);
}

function polylineLength(points: readonly Vector3Value[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += distance(points[index - 1], points[index]);
  return total;
}

function maximumBend(points: readonly Vector3Value[]): number {
  let maximum = 0;
  for (let index = 1; index < points.length - 1; index++) {
    maximum = Math.max(maximum, bendDeg(points[index - 1], points[index], points[index + 1]));
  }
  return maximum;
}

function hopDistances(state: MutableTopology, sources: ReadonlySet<number>): Map<number, number> {
  const result = new Map([...state.nodes.keys()].map((id) => [id, Number.POSITIVE_INFINITY]));
  const incidence = mutableIncidence(state);
  const queue = [...sources].filter((id) => state.nodes.has(id)).sort((first, second) => first - second);
  for (const id of queue) result.set(id, 0);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const edge of incidence.get(current) ?? []) {
      const next = edge.start === current ? edge.end : edge.start;
      if (result.get(next)! <= result.get(current)! + 1) continue;
      result.set(next, result.get(current)! + 1);
      queue.push(next);
    }
  }
  return result;
}

function evaluateCandidate(
  state: MutableTopology,
  nodeId: number,
  terminalIds: ReadonlySet<number>,
  branchIds: ReadonlySet<number>,
): CandidateEvaluation | null {
  const incidence = mutableIncidence(state);
  const incident = incidence.get(nodeId) ?? [];
  if (incident.length !== 2) return null;
  const first = incident[0];
  const second = incident[1];
  const firstNeighbour = first.start === nodeId ? first.end : first.start;
  const secondNeighbour = second.start === nodeId ? second.end : second.start;
  if (firstNeighbour === secondNeighbour) return null;
  const firstPath = orientedEdge(first, firstNeighbour, nodeId);
  const secondPath = orientedEdge(second, nodeId, secondNeighbour);
  const pathCleanNodeIds = [...firstPath.nodeIds, ...secondPath.nodeIds.slice(1)];
  const pathPoints = [...firstPath.points, ...secondPath.points.slice(1)];
  const sourceRadii = [...firstPath.radii, ...secondPath.radii];
  const contractedCleanNodeIds = uniqueSorted([
    ...first.contractedCleanNodeIds,
    nodeId,
    ...second.contractedCleanNodeIds,
  ]);
  const contractedRawNodeIds = uniqueSorted([
    ...first.contractedRawNodeIds,
    ...(state.nodes.get(nodeId)?.rawNodeIds ?? []),
    ...second.contractedRawNodeIds,
  ]);
  const chordLength = distance(pathPoints[0], pathPoints[pathPoints.length - 1]);
  const resultDetourRatio = polylineLength(pathPoints) / Math.max(chordLength, 1e-12);
  const localIndex = firstPath.points.length - 1;
  const localBendDeg = bendDeg(pathPoints[localIndex - 1], pathPoints[localIndex], pathPoints[localIndex + 1]);
  const terminalDistance = hopDistances(state, terminalIds).get(nodeId) ?? Number.POSITIVE_INFINITY;
  const branchDistance = hopDistances(state, branchIds).get(nodeId) ?? Number.POSITIVE_INFINITY;
  const intentCost = clamp01(
    0.5 * (maximumBend(pathPoints) / 180)
      + 0.35 * clamp01((resultDetourRatio - 1) / 1.5)
      + 0.1 * (1 / (1 + terminalDistance))
      + 0.05 * (1 / (1 + branchDistance)),
  );
  const existingParallel = [...state.edges.values()].find((edge) =>
    edge.id !== first.id && edge.id !== second.id
      && ((edge.start === firstNeighbour && edge.end === secondNeighbour)
        || (edge.start === secondNeighbour && edge.end === firstNeighbour)));
  const rejection = existingParallel
    ? `neighbours already have Edge ${existingParallel.id}; contraction would reduce a cycle`
    : null;
  return {
    cleanNodeId: nodeId,
    firstEdgeId: first.id,
    secondEdgeId: second.id,
    firstNeighbourId: firstNeighbour,
    secondNeighbourId: secondNeighbour,
    merged: {
      id: state.nextEdgeId,
      start: firstNeighbour,
      end: secondNeighbour,
      radius: Math.min(first.radius, second.radius),
      pathCleanNodeIds,
      pathPoints,
      cleanEdgeIds: uniqueSorted([...first.cleanEdgeIds, ...second.cleanEdgeIds]),
      rawEdgeIds: uniqueSorted([...first.rawEdgeIds, ...second.rawEdgeIds]),
      contractedCleanNodeIds,
      contractedRawNodeIds,
      sourceRadii,
    },
    metrics: {
      localBendDeg,
      resultMaximumBendDeg: maximumBend(pathPoints),
      resultDetourRatio,
      terminalHopDistance: terminalDistance,
      branchHopDistance: branchDistance,
      intentCost,
    },
    rejection,
  };
}

function candidateFitsLevel(
  candidate: CandidateEvaluation,
  criteria: SpiderTopologyLevelCriteria,
): boolean {
  return criteria.enabled
    && !candidate.rejection
    && candidate.metrics.localBendDeg <= criteria.maxLocalBendDeg
    && candidate.metrics.resultMaximumBendDeg <= criteria.maxLocalBendDeg
    && candidate.metrics.resultDetourRatio <= criteria.maxResultDetourRatio
    && candidate.merged.contractedCleanNodeIds.length <= criteria.maxContractedNodesPerEdge;
}

function applyContraction(state: MutableTopology, candidate: CandidateEvaluation): void {
  state.edges.delete(candidate.firstEdgeId);
  state.edges.delete(candidate.secondEdgeId);
  state.nodes.delete(candidate.cleanNodeId);
  state.edges.set(candidate.merged.id, candidate.merged);
  state.nextEdgeId++;
}

function internalGraph(cleanup: SpiderGraphCleanupLabReport, state: MutableTopology): InternalStructureGraph {
  const nodes = [...state.nodes.values()].sort((first, second) => first.id - second.id).map((node) => ({
    id: node.id,
    position: { ...node.position },
    radius: node.radius,
  }));
  const edges = [...state.edges.values()].sort((first, second) => first.id - second.id).map((edge, id) => ({
    id,
    start: edge.start,
    end: edge.end,
    radius: edge.radius,
  }));
  return {
    kind: cleanup.cleanupCandidate.kind,
    nodes,
    edges,
    stats: {
      ...cleanup.cleanupCandidate.stats,
      inputPoints: nodes.length,
      candidateEdges: edges.length,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
    },
  };
}

function portableTopology(
  state: MutableTopology,
  classifications: readonly SpiderTopologyNodeClassification[],
): SpiderPortableTopology {
  const classification = new Map(classifications.map((entry) => [entry.cleanNodeId, entry]));
  return {
    nodes: [...state.nodes.values()].sort((first, second) => first.id - second.id).map((node) => ({
      id: `clean-node:${node.id}`,
      cleanNodeId: node.id,
      position: { ...node.position },
      terminalRoles: [...(classification.get(node.id)?.terminalRoles ?? [])],
      provenance: {
        cleanNodeIds: [node.id],
        rawNodeIds: [...node.rawNodeIds],
      },
    })),
    edges: [...state.edges.values()].sort((first, second) => first.id - second.id).map((edge) => ({
      id: `topology-edge:${edge.id}`,
      startNodeId: `clean-node:${edge.start}`,
      endNodeId: `clean-node:${edge.end}`,
      provenance: {
        cleanEdgeIds: [...edge.cleanEdgeIds],
        rawEdgeIds: [...edge.rawEdgeIds],
        contractedCleanNodeIds: [...edge.contractedCleanNodeIds],
        contractedRawNodeIds: [...edge.contractedRawNodeIds],
      },
      realizationIntent: {
        kind: edge.pathCleanNodeIds.length > 2 ? "polyline" : "straight",
        controlCleanNodeIds: [...edge.pathCleanNodeIds],
        controlPoints: edge.pathPoints.map((point) => ({ ...point })),
        sourceRadii: [...edge.sourceRadii],
      },
    })),
  };
}

function terminalReachability(
  graph: InternalStructureGraph,
  terminalNodeIds: ReadonlySet<number>,
): SpiderTerminalReachabilityAudit {
  const component = components(graph);
  const ids = [...terminalNodeIds].sort((first, second) => first - second);
  let reachable = 0;
  for (let first = 0; first < ids.length; first++) {
    for (let second = first + 1; second < ids.length; second++) {
      if (component.get(ids[first]) === component.get(ids[second])) reachable++;
    }
  }
  const required = ids.length * (ids.length - 1) / 2;
  return {
    uniqueTerminalNodes: ids.length,
    reachableTerminalPairs: reachable,
    requiredTerminalPairs: required,
    preserved: reachable === required,
  };
}

function auditLevel(
  cleanup: SpiderGraphCleanupLabReport,
  graph: InternalStructureGraph,
  topology: SpiderPortableTopology,
  stats: SpiderGraphStats,
  terminalNodeIds: ReadonlySet<number>,
  majorBranchNodeIds: ReadonlySet<number>,
  initialBranchDegrees: ReadonlyMap<number, number>,
  initialCycleRank: number,
): SpiderTerminalTopologyAudit {
  const reasons: string[] = [];
  const retainedIds = new Set(graph.nodes.map((node) => node.id));
  const retainedTerminalIdentity = [...terminalNodeIds].every((id) => retainedIds.has(id));
  if (!retainedTerminalIdentity) reasons.push("terminal Node identity changed");
  const incidence = graphIncidence(graph);
  const retainedMajorBranchIdentity = [...majorBranchNodeIds].every((id) =>
    retainedIds.has(id) && (incidence.get(id)?.length ?? 0) === initialBranchDegrees.get(id));
  if (!retainedMajorBranchIdentity) reasons.push("major branch Node identity/degree changed");
  if (stats.connectedComponents !== 1) reasons.push(`components=${stats.connectedComponents}`);
  if (!sameTerminalStats(stats.motifConnectivity, cleanup.candidateStats.motifConnectivity)) {
    reasons.push("Motif terminal component partition changed");
  }
  if (!sameTerminalStats(stats.supportTargetConnectivity, cleanup.candidateStats.supportTargetConnectivity)) {
    reasons.push("support terminal component partition changed");
  }
  const reachability = terminalReachability(graph, terminalNodeIds);
  if (!reachability.preserved) reasons.push("terminal-to-terminal reachability changed");
  const cleanNodeCoverage = uniqueSorted([
    ...topology.nodes.flatMap((node) => node.provenance.cleanNodeIds),
    ...topology.edges.flatMap((edge) => edge.provenance.contractedCleanNodeIds),
  ]);
  const expectedCleanNodes = cleanup.cleanTopology.nodes.map((node) => node.id).sort((a, b) => a - b);
  const cleanNodeProvenanceComplete = cleanNodeCoverage.length === expectedCleanNodes.length
    && cleanNodeCoverage.every((id, index) => id === expectedCleanNodes[index]);
  if (!cleanNodeProvenanceComplete) reasons.push("Clean Node provenance is incomplete");
  const cleanEdgeCoverage = topology.edges.flatMap((edge) => edge.provenance.cleanEdgeIds).sort((a, b) => a - b);
  const expectedCleanEdges = cleanup.cleanTopology.edges.map((edge) => edge.id).sort((a, b) => a - b);
  const cleanEdgeProvenanceComplete = cleanEdgeCoverage.length === expectedCleanEdges.length
    && cleanEdgeCoverage.every((id, index) => id === expectedCleanEdges[index]);
  if (!cleanEdgeProvenanceComplete) reasons.push("Clean Edge provenance is incomplete");
  const cycleRank = graph.edges.length - graph.nodes.length + stats.connectedComponents;
  const cycleRankPreserved = cycleRank === initialCycleRank;
  if (!cycleRankPreserved) reasons.push(`cycle rank ${initialCycleRank}→${cycleRank}`);
  return {
    ok: reasons.length === 0,
    connectedComponents: stats.connectedComponents,
    motifConnected: stats.motifConnectivity.connectedCount,
    motifRequired: cleanup.candidateStats.motifConnectivity.connectedCount,
    supportConnected: stats.supportTargetConnectivity.connectedCount,
    supportRequired: cleanup.candidateStats.supportTargetConnectivity.connectedCount,
    terminalReachability: reachability,
    retainedTerminalIdentity,
    retainedMajorBranchIdentity,
    cleanNodeProvenanceComplete,
    cleanEdgeProvenanceComplete,
    cycleRankPreserved,
    reasons,
  };
}

function protectedDecision(
  classification: SpiderTopologyNodeClassification,
): SpiderTopologyNodeDecision {
  const status: SpiderTopologyNodeDecisionStatus = classification.kind === "terminal"
    ? "protected-terminal"
    : classification.kind === "branch-junction"
      ? "protected-junction"
      : "protected-critical";
  return {
    cleanNodeId: classification.cleanNodeId,
    rawNodeIds: [...classification.rawNodeIds],
    status,
    contractionOrder: null,
    replacementEdgeId: null,
    metrics: null,
    reasons: [...classification.protectedReasons],
  };
}

function buildLevel(
  cleanup: SpiderGraphCleanupLabReport,
  terminals: readonly SpiderGraphTerminal[],
  classifications: readonly SpiderTopologyNodeClassification[],
  level: SpiderTopologyLevel,
  policy: SpiderTerminalTopologyPolicy,
  terminalNodeIds: ReadonlySet<number>,
  majorBranchNodeIds: ReadonlySet<number>,
  initialBranchDegrees: ReadonlyMap<number, number>,
  initialCycleRank: number,
): SpiderTerminalTopologyLevelResult {
  const criteria = policy.levelCriteria[level];
  const state = cloneMutableTopology(initialMutableTopology(cleanup));
  const operations: SpiderTopologyContractionOperation[] = [];
  const contracted = new Map<number, SpiderTopologyNodeDecision>();

  while (criteria.enabled) {
    const eligible = classifications
      .filter((classification) => classification.kind === "intermediate" && state.nodes.has(classification.cleanNodeId))
      .map((classification) => evaluateCandidate(
        state,
        classification.cleanNodeId,
        terminalNodeIds,
        majorBranchNodeIds,
      ))
      .filter((candidate): candidate is CandidateEvaluation => candidate !== null && candidateFitsLevel(candidate, criteria))
      .sort((first, second) => first.metrics.intentCost - second.metrics.intentCost
        || first.cleanNodeId - second.cleanNodeId);
    const selected = eligible[0];
    if (!selected) break;
    const before = cloneMutableTopology(state);
    applyContraction(state, selected);
    const trialGraph = internalGraph(cleanup, state);
    const trialTopology = portableTopology(state, classifications);
    const trialStats = captureSpiderGraphStats(trialGraph, terminals);
    const trialAudit = auditLevel(
      cleanup,
      trialGraph,
      trialTopology,
      trialStats,
      terminalNodeIds,
      majorBranchNodeIds,
      initialBranchDegrees,
      initialCycleRank,
    );
    if (!trialAudit.ok) {
      state.nodes = before.nodes;
      state.edges = before.edges;
      state.nextEdgeId = before.nextEdgeId;
      break;
    }
    const replacementEdgeId = `topology-edge:${selected.merged.id}`;
    const operation: SpiderTopologyContractionOperation = {
      order: operations.length + 1,
      contractedCleanNodeId: selected.cleanNodeId,
      sourceEdgeIds: [
        `topology-edge:${selected.firstEdgeId}`,
        `topology-edge:${selected.secondEdgeId}`,
      ],
      replacementEdgeId,
      metrics: selected.metrics,
    };
    operations.push(operation);
    contracted.set(selected.cleanNodeId, {
      cleanNodeId: selected.cleanNodeId,
      rawNodeIds: [...(classifications.find((entry) => entry.cleanNodeId === selected.cleanNodeId)?.rawNodeIds ?? [])],
      status: "contracted",
      contractionOrder: operation.order,
      replacementEdgeId,
      metrics: selected.metrics,
      reasons: [
        `accepted at ${level} order ${operation.order}`,
        `degree-2 series rewiring; bend ${selected.metrics.localBendDeg.toFixed(2)}°`,
        `polyline control point retained on ${replacementEdgeId}`,
      ],
    });
  }

  const graph = internalGraph(cleanup, state);
  const topology = portableTopology(state, classifications);
  const stats = captureSpiderGraphStats(graph, terminals);
  const audit = auditLevel(
    cleanup,
    graph,
    topology,
    stats,
    terminalNodeIds,
    majorBranchNodeIds,
    initialBranchDegrees,
    initialCycleRank,
  );
  const decisions = classifications.map((classification) => {
    const contraction = contracted.get(classification.cleanNodeId);
    if (contraction) return contraction;
    if (classification.kind !== "intermediate") return protectedDecision(classification);
    const candidate = evaluateCandidate(state, classification.cleanNodeId, terminalNodeIds, majorBranchNodeIds);
    if (candidate?.rejection) {
      return {
        cleanNodeId: classification.cleanNodeId,
        rawNodeIds: [...classification.rawNodeIds],
        status: "rejected-cycle" as const,
        contractionOrder: null,
        replacementEdgeId: null,
        metrics: candidate.metrics,
        reasons: [`reject: ${candidate.rejection}`, "cycle identity is not changed by terminal-preserving contraction"],
      };
    }
    return {
      cleanNodeId: classification.cleanNodeId,
      rawNodeIds: [...classification.rawNodeIds],
      status: "retained-by-level" as const,
      contractionOrder: null,
      replacementEdgeId: null,
      metrics: candidate?.metrics ?? null,
      reasons: level === "none"
        ? ["retained: None disables topology contraction"]
        : [
            `retained: ${level} intent thresholds exceeded`,
            candidate
              ? `bend ${candidate.metrics.resultMaximumBendDeg.toFixed(2)}° / detour ${candidate.metrics.resultDetourRatio.toFixed(3)}x`
              : "no longer a degree-2 candidate",
          ],
    };
  }).sort((first, second) => first.cleanNodeId - second.cleanNodeId);
  return {
    level,
    criteria: { ...criteria },
    graph,
    topology,
    stats,
    cycleRank: graph.edges.length - graph.nodes.length + stats.connectedComponents,
    contractedNodeIds: [...contracted.keys()].sort((first, second) => first - second),
    retainedNodeIds: graph.nodes.map((node) => node.id).sort((first, second) => first - second),
    rewiredEdgeIds: topology.edges.filter((edge) => edge.provenance.contractedCleanNodeIds.length > 0)
      .map((edge) => edge.id),
    operations,
    decisions,
    audit,
  };
}

export function studyTerminalPreservingNetworkTopology(
  cleanup: SpiderGraphCleanupLabReport,
  terminals: readonly SpiderGraphTerminal[],
  policy: SpiderTerminalTopologyPolicy = DEFAULT_SPIDER_TERMINAL_TOPOLOGY_POLICY,
): SpiderTerminalTopologyStudy {
  if (!cleanup.topologyPreservation.ok) {
    throw new Error(`Cleanup input failed topology preservation: ${cleanup.topologyPreservation.differences.join(", ")}`);
  }
  const classifications = classifyNodes(cleanup, terminals, policy);
  const summary = terminalSummary(classifications);
  const findings = topologyFindings(cleanup, classifications, policy);
  const terminalNodeIds = new Set(classifications.filter((node) => node.terminalRoles.length > 0)
    .map((node) => node.cleanNodeId));
  const majorBranchNodeIds = new Set(classifications.filter((node) => node.degree >= 3)
    .map((node) => node.cleanNodeId));
  const initialBranchDegrees = new Map(classifications
    .filter((node) => majorBranchNodeIds.has(node.cleanNodeId))
    .map((node) => [node.cleanNodeId, node.degree]));
  const initialCycleRank = cleanup.candidateStats.edgeCount
    - cleanup.candidateStats.nodeCount
    + cleanup.candidateStats.connectedComponents;
  const levelResults = LEVELS.map((level) => [
    level,
    buildLevel(
      cleanup,
      terminals,
      classifications,
      level,
      policy,
      terminalNodeIds,
      majorBranchNodeIds,
      initialBranchDegrees,
      initialCycleRank,
    ),
  ] as const);
  return {
    cleanInputStats: cleanup.candidateStats,
    classifications,
    terminalSummary: summary,
    findings,
    initialCycleRank,
    majorBranchNodeIds: [...majorBranchNodeIds].sort((first, second) => first - second),
    levels: Object.fromEntries(levelResults) as Record<SpiderTopologyLevel, SpiderTerminalTopologyLevelResult>,
  };
}

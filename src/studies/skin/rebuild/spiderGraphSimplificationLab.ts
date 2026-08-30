import type { InternalStructureEdge, InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import {
  captureSpiderGraphStats,
  type SpiderCleanTopology,
  type SpiderGraphCleanupLabReport,
  type SpiderGraphStats,
  type SpiderGraphTerminal,
} from "./spiderGraphCleanupLab.ts";

/**
 * Laboratory-only author simplification. Cleanup is a completed, immutable
 * input to this module; every removal below intentionally changes graph
 * redundancy and is never fed back to the production Spider generator.
 */

export type SpiderSimplificationLevel = "none" | "low" | "medium" | "high";

export interface SpiderGraphSimplificationPolicy {
  removalFractions: Record<SpiderSimplificationLevel, number>;
  detourRatioScale: number;
  terminalProximityDepth: number;
}

export const DEFAULT_SPIDER_GRAPH_SIMPLIFICATION_POLICY: SpiderGraphSimplificationPolicy = {
  // Fractions are applied to cycle rank (E - V + components), not all edges.
  // A 100% setting therefore reaches a spanning tree, never a disconnected graph.
  removalFractions: { none: 0, low: 0.25, medium: 0.5, high: 1 },
  detourRatioScale: 4,
  terminalProximityDepth: 4,
};

export interface SpiderAlternativePath {
  nodeIds: number[];
  edgeIds: number[];
  length: number;
  hopCount: number;
  detourRatio: number;
}

export interface SpiderEdgeRemovalMetrics {
  edgeLength: number;
  localDensity: number;
  cycleRedundancy: number;
  shortCycle: number;
  parallelism: number;
  terminalProximity: number;
}

export type SpiderEdgeSimplificationStatus = "removed" | "retained-by-level" | "rejected";

export interface SpiderEdgeSimplificationDecision {
  edgeId: number;
  rawEdgeIds: number[];
  status: SpiderEdgeSimplificationStatus;
  removalOrder: number | null;
  removalScore: number;
  /** Graph-theoretic proxy only; this is not a physical strength result. */
  criticality: number;
  alternativePath: SpiderAlternativePath | null;
  metrics: SpiderEdgeRemovalMetrics;
  reasons: string[];
}

export interface SpiderSimplificationConstraintAudit {
  accepted: boolean;
  connectedComponents: number;
  motifConnected: number;
  motifRequired: number;
  supportConnected: number;
  supportRequired: number;
  reasons: string[];
}

export interface SpiderSimplificationLevelResult {
  level: SpiderSimplificationLevel;
  requestedFraction: number;
  cycleBudget: number;
  targetRemovalCount: number;
  removedEdgeIds: number[];
  retainedEdgeIds: number[];
  topology: SpiderCleanTopology;
  graph: InternalStructureGraph;
  stats: SpiderGraphStats;
  cycleRank: number;
  constraintAudit: SpiderSimplificationConstraintAudit;
  decisions: SpiderEdgeSimplificationDecision[];
  provenance: Array<{
    cleanEdgeId: number;
    rawEdgeIds: number[];
    disposition: "retained" | "removed";
  }>;
}

export interface SpiderGraphSimplificationStudy {
  cleanInputStats: SpiderGraphStats;
  cleanInputTopology: SpiderCleanTopology;
  cycleBudget: number;
  levels: Record<SpiderSimplificationLevel, SpiderSimplificationLevelResult>;
}

interface PathResult {
  nodeIds: number[];
  edgeIds: number[];
  length: number;
}

interface EvaluatedRemoval {
  decision: SpiderEdgeSimplificationDecision;
  audit: SpiderSimplificationConstraintAudit;
}

const LEVELS: readonly SpiderSimplificationLevel[] = ["none", "low", "medium", "high"];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distance(first: Vector3Value, second: Vector3Value): number {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function edgeLength(graph: InternalStructureGraph, edge: InternalStructureEdge): number {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
  const start = nodes.get(edge.start);
  const end = nodes.get(edge.end);
  if (!start || !end) throw new Error(`edge ${edge.id} references a missing node`);
  return distance(start, end);
}

function cloneGraph(graph: InternalStructureGraph): InternalStructureGraph {
  return {
    kind: graph.kind,
    nodes: graph.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    stats: { ...graph.stats },
  };
}

function graphWithEdges(graph: InternalStructureGraph, edgeIds: ReadonlySet<number>): InternalStructureGraph {
  const result = cloneGraph(graph);
  result.edges = result.edges.filter((edge) => edgeIds.has(edge.id));
  result.stats = {
    ...result.stats,
    candidateEdges: result.edges.length,
    gridEdgeCount: result.edges.length,
  };
  return result;
}

function incidence(graph: InternalStructureGraph): Map<number, InternalStructureEdge[]> {
  const result = new Map(graph.nodes.map((node) => [node.id, [] as InternalStructureEdge[]]));
  for (const edge of graph.edges) {
    result.get(edge.start)?.push(edge);
    result.get(edge.end)?.push(edge);
  }
  for (const edges of result.values()) edges.sort((first, second) => first.id - second.id);
  return result;
}

function shortestAlternativePath(
  graph: InternalStructureGraph,
  startNodeId: number,
  endNodeId: number,
  excludedEdgeId: number,
): PathResult | null {
  const byNode = incidence(graph);
  const distances = new Map(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map<number, { nodeId: number; edgeId: number }>();
  const unsettled = new Set(graph.nodes.map((node) => node.id));
  distances.set(startNodeId, 0);

  while (unsettled.size > 0) {
    let current: number | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const nodeId of unsettled) {
      const candidateDistance = distances.get(nodeId)!;
      if (candidateDistance < currentDistance || (candidateDistance === currentDistance && nodeId < (current ?? Infinity))) {
        current = nodeId;
        currentDistance = candidateDistance;
      }
    }
    if (current === null || !Number.isFinite(currentDistance)) break;
    unsettled.delete(current);
    if (current === endNodeId) break;
    for (const edge of byNode.get(current) ?? []) {
      if (edge.id === excludedEdgeId) continue;
      const next = edge.start === current ? edge.end : edge.start;
      if (!unsettled.has(next)) continue;
      const nextDistance = currentDistance + edgeLength(graph, edge);
      const known = distances.get(next)!;
      const tieBreak = previous.get(next);
      if (nextDistance < known - 1e-12
        || (Math.abs(nextDistance - known) <= 1e-12 && edge.id < (tieBreak?.edgeId ?? Infinity))) {
        distances.set(next, nextDistance);
        previous.set(next, { nodeId: current, edgeId: edge.id });
      }
    }
  }

  const length = distances.get(endNodeId)!;
  if (!Number.isFinite(length)) return null;
  const nodeIds = [endNodeId];
  const edgeIds: number[] = [];
  let current = endNodeId;
  while (current !== startNodeId) {
    const step = previous.get(current);
    if (!step) return null;
    edgeIds.push(step.edgeId);
    nodeIds.push(step.nodeId);
    current = step.nodeId;
  }
  nodeIds.reverse();
  edgeIds.reverse();
  return { nodeIds, edgeIds, length };
}

function terminalNodeIds(graph: InternalStructureGraph, terminals: readonly SpiderGraphTerminal[]): Set<number> {
  const result = new Set<number>();
  for (const terminal of terminals) {
    const match = graph.nodes
      .map((node) => ({ id: node.id, distance: distance(node.position, terminal.position) }))
      .filter((entry) => entry.distance <= 1e-6)
      .sort((first, second) => first.distance - second.distance || first.id - second.id)[0];
    if (match) result.add(match.id);
  }
  return result;
}

function distancesFromTerminals(graph: InternalStructureGraph, terminalIds: ReadonlySet<number>): Map<number, number> {
  const result = new Map(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const byNode = incidence(graph);
  const queue = [...terminalIds].sort((first, second) => first - second);
  for (const nodeId of queue) result.set(nodeId, 0);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const nextDistance = result.get(current)! + 1;
    for (const edge of byNode.get(current) ?? []) {
      const next = edge.start === current ? edge.end : edge.start;
      if (result.get(next)! <= nextDistance) continue;
      result.set(next, nextDistance);
      queue.push(next);
    }
  }
  return result;
}

function pathParallelism(graph: InternalStructureGraph, edge: InternalStructureEdge, path: PathResult): number {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
  const start = nodes.get(edge.start)!;
  const end = nodes.get(edge.end)!;
  const targetLength = Math.max(distance(start, end), 1e-12);
  const target = {
    x: (end.x - start.x) / targetLength,
    y: (end.y - start.y) / targetLength,
    z: (end.z - start.z) / targetLength,
  };
  let weighted = 0;
  let total = 0;
  for (const edgeId of path.edgeIds) {
    const alternate = graph.edges.find((candidate) => candidate.id === edgeId)!;
    const alternateStart = nodes.get(alternate.start)!;
    const alternateEnd = nodes.get(alternate.end)!;
    const length = Math.max(distance(alternateStart, alternateEnd), 1e-12);
    const direction = {
      x: (alternateEnd.x - alternateStart.x) / length,
      y: (alternateEnd.y - alternateStart.y) / length,
      z: (alternateEnd.z - alternateStart.z) / length,
    };
    weighted += Math.abs(target.x * direction.x + target.y * direction.y + target.z * direction.z) * length;
    total += length;
  }
  return total > 0 ? weighted / total : 0;
}

function auditConstraints(
  stats: SpiderGraphStats,
  cleanStats: SpiderGraphStats,
): SpiderSimplificationConstraintAudit {
  const reasons: string[] = [];
  if (stats.connectedComponents !== cleanStats.connectedComponents) {
    reasons.push(`components ${cleanStats.connectedComponents}→${stats.connectedComponents}`);
  }
  if (stats.motifConnectivity.connectedCount !== cleanStats.motifConnectivity.connectedCount
    || stats.motifConnectivity.resolvedCount !== cleanStats.motifConnectivity.resolvedCount) {
    reasons.push(`Motif ${cleanStats.motifConnectivity.connectedCount}→${stats.motifConnectivity.connectedCount}`);
  }
  if (stats.supportTargetConnectivity.connectedCount !== cleanStats.supportTargetConnectivity.connectedCount
    || stats.supportTargetConnectivity.resolvedCount !== cleanStats.supportTargetConnectivity.resolvedCount) {
    reasons.push(
      `support ${cleanStats.supportTargetConnectivity.connectedCount}→${stats.supportTargetConnectivity.connectedCount}`,
    );
  }
  return {
    accepted: reasons.length === 0,
    connectedComponents: stats.connectedComponents,
    motifConnected: stats.motifConnectivity.connectedCount,
    motifRequired: cleanStats.motifConnectivity.connectedCount,
    supportConnected: stats.supportTargetConnectivity.connectedCount,
    supportRequired: cleanStats.supportTargetConnectivity.connectedCount,
    reasons,
  };
}

function evaluateRemoval(
  graph: InternalStructureGraph,
  edge: InternalStructureEdge,
  terminals: readonly SpiderGraphTerminal[],
  cleanStats: SpiderGraphStats,
  rawEdgeIds: readonly number[],
  policy: SpiderGraphSimplificationPolicy,
): EvaluatedRemoval {
  const path = shortestAlternativePath(graph, edge.start, edge.end, edge.id);
  const byNode = incidence(graph);
  const terminalDistances = distancesFromTerminals(graph, terminalNodeIds(graph, terminals));
  const length = edgeLength(graph, edge);
  const localDensity = clamp01(((byNode.get(edge.start)?.length ?? 0) + (byNode.get(edge.end)?.length ?? 0) - 4) / 6);
  const terminalHopDistance = Math.min(terminalDistances.get(edge.start)!, terminalDistances.get(edge.end)!);
  const terminalProximity = Number.isFinite(terminalHopDistance)
    ? clamp01((policy.terminalProximityDepth - terminalHopDistance) / policy.terminalProximityDepth)
    : 0;

  if (!path) {
    return {
      audit: {
        accepted: false,
        connectedComponents: cleanStats.connectedComponents + 1,
        motifConnected: cleanStats.motifConnectivity.connectedCount,
        motifRequired: cleanStats.motifConnectivity.connectedCount,
        supportConnected: cleanStats.supportTargetConnectivity.connectedCount,
        supportRequired: cleanStats.supportTargetConnectivity.connectedCount,
        reasons: ["bridge: alternative pathなし。削除するとcomponentが増える"],
      },
      decision: {
        edgeId: edge.id,
        rawEdgeIds: [...rawEdgeIds],
        status: "rejected",
        removalOrder: null,
        removalScore: 0,
        criticality: 1,
        alternativePath: null,
        metrics: {
          edgeLength: length,
          localDensity,
          cycleRedundancy: 0,
          shortCycle: 0,
          parallelism: 0,
          terminalProximity,
        },
        reasons: ["reject: alternative pathなし", "reject: components=1 constraintを維持できない"],
      },
    };
  }

  const trialIds = new Set(graph.edges.filter((candidate) => candidate.id !== edge.id).map((candidate) => candidate.id));
  const trial = graphWithEdges(graph, trialIds);
  const stats = captureSpiderGraphStats(trial, terminals);
  const audit = auditConstraints(stats, cleanStats);
  const detourRatio = path.length / Math.max(length, 1e-12);
  const shortCycle = 1 / Math.max(1, detourRatio);
  const cycleRedundancy = 1 / Math.max(1, path.edgeIds.length);
  const parallelism = pathParallelism(graph, edge, path);
  const criticality = clamp01(
    0.55 * clamp01((detourRatio - 1) / policy.detourRatioScale)
      + 0.3 * terminalProximity
      + 0.15 * (1 - localDensity),
  );
  const removalScore = 100 * clamp01(
    0.35 * shortCycle
      + 0.2 * localDensity
      + 0.15 * cycleRedundancy
      + 0.15 * parallelism
      + 0.15 * (1 - criticality),
  );
  const reasons = audit.accepted
    ? [
        `alternative path ${path.edgeIds.length} edges / detour ${detourRatio.toFixed(2)}x`,
        "components・Motif・support constraintsを維持",
        "作者の冗長度変更候補（強度保証ではない）",
      ]
    : audit.reasons.map((reason) => `reject: ${reason}`);
  return {
    audit,
    decision: {
      edgeId: edge.id,
      rawEdgeIds: [...rawEdgeIds],
      status: audit.accepted ? "retained-by-level" : "rejected",
      removalOrder: null,
      removalScore,
      criticality,
      alternativePath: {
        nodeIds: path.nodeIds,
        edgeIds: path.edgeIds,
        length: path.length,
        hopCount: path.edgeIds.length,
        detourRatio,
      },
      metrics: {
        edgeLength: length,
        localDensity,
        cycleRedundancy,
        shortCycle,
        parallelism,
        terminalProximity,
      },
      reasons,
    },
  };
}

function buildLevel(
  cleanup: SpiderGraphCleanupLabReport,
  terminals: readonly SpiderGraphTerminal[],
  level: SpiderSimplificationLevel,
  cycleBudget: number,
  policy: SpiderGraphSimplificationPolicy,
): SpiderSimplificationLevelResult {
  const fraction = clamp01(policy.removalFractions[level]);
  const targetRemovalCount = level === "high"
    ? cycleBudget
    : Math.floor(cycleBudget * fraction);
  const rawIdsByClean = new Map(cleanup.provenance.edges.map((edge) => [edge.cleanEdgeId, edge.rawEdgeIds]));
  const retained = new Set(cleanup.cleanupCandidate.edges.map((edge) => edge.id));
  const removedDecisions: SpiderEdgeSimplificationDecision[] = [];

  while (removedDecisions.length < targetRemovalCount) {
    const current = graphWithEdges(cleanup.cleanupCandidate, retained);
    const candidates = current.edges
      .map((edge) => evaluateRemoval(
        current,
        edge,
        terminals,
        cleanup.candidateStats,
        rawIdsByClean.get(edge.id) ?? [],
        policy,
      ))
      .filter((entry) => entry.audit.accepted)
      .sort((first, second) =>
        second.decision.removalScore - first.decision.removalScore
          || first.decision.criticality - second.decision.criticality
          || first.decision.edgeId - second.decision.edgeId);
    const selected = candidates[0];
    if (!selected) break;
    retained.delete(selected.decision.edgeId);
    removedDecisions.push({
      ...selected.decision,
      status: "removed",
      removalOrder: removedDecisions.length + 1,
      reasons: [`accepted at ${level} order ${removedDecisions.length + 1}`, ...selected.decision.reasons],
    });
  }

  const graph = graphWithEdges(cleanup.cleanupCandidate, retained);
  const stats = captureSpiderGraphStats(graph, terminals);
  const constraintAudit = auditConstraints(stats, cleanup.candidateStats);
  const finalDecisions = graph.edges.map((edge) => {
    const evaluated = evaluateRemoval(
      graph,
      edge,
      terminals,
      cleanup.candidateStats,
      rawIdsByClean.get(edge.id) ?? [],
      policy,
    ).decision;
    if (evaluated.status === "retained-by-level") {
      evaluated.reasons = [
        `retained: ${level}のcycle budget ${targetRemovalCount}/${cycleBudget}に到達`,
        ...evaluated.reasons,
      ];
    }
    return evaluated;
  });
  const decisions = [...removedDecisions, ...finalDecisions].sort((first, second) => first.edgeId - second.edgeId);
  const removed = new Set(removedDecisions.map((decision) => decision.edgeId));
  const topology: SpiderCleanTopology = {
    nodes: cleanup.cleanTopology.nodes.map((node) => ({ id: node.id, position: { ...node.position } })),
    edges: cleanup.cleanTopology.edges
      .filter((edge) => retained.has(edge.id))
      .map((edge) => ({ ...edge })),
  };
  return {
    level,
    requestedFraction: fraction,
    cycleBudget,
    targetRemovalCount,
    removedEdgeIds: [...removed].sort((first, second) => first - second),
    retainedEdgeIds: [...retained].sort((first, second) => first - second),
    topology,
    graph,
    stats,
    cycleRank: Math.max(0, stats.edgeCount - stats.nodeCount + stats.connectedComponents),
    constraintAudit,
    decisions,
    provenance: cleanup.provenance.edges.map((edge) => ({
      cleanEdgeId: edge.cleanEdgeId,
      rawEdgeIds: [...edge.rawEdgeIds],
      disposition: removed.has(edge.cleanEdgeId) ? "removed" : "retained",
    })),
  };
}

export function studySpiderGraphSimplification(
  cleanup: SpiderGraphCleanupLabReport,
  terminals: readonly SpiderGraphTerminal[],
  policy: SpiderGraphSimplificationPolicy = DEFAULT_SPIDER_GRAPH_SIMPLIFICATION_POLICY,
): SpiderGraphSimplificationStudy {
  if (!cleanup.topologyPreservation.ok) {
    throw new Error(`Cleanup input failed topology preservation: ${cleanup.topologyPreservation.differences.join(", ")}`);
  }
  const cleanInputTopology: SpiderCleanTopology = {
    nodes: cleanup.cleanTopology.nodes.map((node) => ({ id: node.id, position: { ...node.position } })),
    edges: cleanup.cleanTopology.edges.map((edge) => ({ ...edge })),
  };
  const cycleBudget = Math.max(
    0,
    cleanup.candidateStats.edgeCount
      - cleanup.candidateStats.nodeCount
      + cleanup.candidateStats.connectedComponents,
  );
  const results = LEVELS.map((level) => [
    level,
    buildLevel(cleanup, terminals, level, cycleBudget, policy),
  ] as const);
  return {
    cleanInputStats: cleanup.candidateStats,
    cleanInputTopology,
    cycleBudget,
    levels: Object.fromEntries(results) as Record<SpiderSimplificationLevel, SpiderSimplificationLevelResult>,
  };
}

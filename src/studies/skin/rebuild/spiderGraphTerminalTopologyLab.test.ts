import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "./fkei.ts";
import { analyzeSpiderGraphCleanupLab, type SpiderGraphTerminal } from "./spiderGraphCleanupLab.ts";
import { studyTerminalPreservingNetworkTopology } from "./spiderGraphTerminalTopologyLab.ts";

const BASELINE_SHA256 = "4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf";

function graph(
  positions: readonly Vector3Value[],
  edgePairs: readonly (readonly [number, number])[],
): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: positions.map((position, id) => ({ id, position: { ...position }, radius: 0.2 })),
    edges: edgePairs.map(([start, end], id) => ({ id, start, end, radius: 0.2 })),
    stats: {
      inputPoints: positions.length,
      delaunayTetrahedra: 0,
      candidateEdges: edgePairs.length,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
      gridNodeCount: positions.length,
      gridEdgeCount: edgePairs.length,
    },
  };
}

// High contracts a non-terminal bend as topology while retaining that Clean
// Node as a polyline control point and keeping both terminal identities.
const angledChain = graph(
  [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }],
  [[0, 1], [1, 2]],
);
const angledTerminals: SpiderGraphTerminal[] = [
  { id: "motif:a", role: "motif", position: { x: 0, y: 0, z: 0 } },
  { id: "motif:b", role: "motif", position: { x: 2, y: 0, z: 0 } },
  { id: "support:a", role: "support-target", position: { x: 0, y: 0, z: 0 } },
];
const angledCleanup = analyzeSpiderGraphCleanupLab(angledChain, angledTerminals);
const angledStudy = studyTerminalPreservingNetworkTopology(angledCleanup, angledTerminals);
assert.equal(angledStudy.levels.none.stats.nodeCount, 3);
assert.equal(angledStudy.levels.high.stats.nodeCount, 2);
assert.equal(angledStudy.levels.high.stats.edgeCount, 1);
assert.equal(angledStudy.levels.high.audit.ok, true, angledStudy.levels.high.audit.reasons.join("\n"));
assert.deepEqual(angledStudy.levels.high.topology.edges[0].realizationIntent.controlCleanNodeIds, [0, 1, 2]);
assert.equal(angledStudy.levels.high.topology.edges[0].realizationIntent.kind, "polyline");
assert.deepEqual(angledStudy.levels.high.topology.edges[0].provenance.cleanEdgeIds, [0, 1]);
assert.deepEqual(angledStudy.levels.high.topology.edges[0].provenance.contractedCleanNodeIds, [1]);

const baselineBytes = readFileSync(new URL(
  "../../../../public/samples/skin-rebuild-first-print.fkei",
  import.meta.url,
));
assert.equal(createHash("sha256").update(baselineBytes).digest("hex"), BASELINE_SHA256);
const project = projectFromSkinRebuildFkei(parseSkinRebuildFkei(baselineBytes.toString("utf8")));
const supportTargetIds = new Set(project.latticeConnections.map((connection) => connection.targetPatchId));
const terminals: SpiderGraphTerminal[] = [
  ...project.patternSides.map((side) => ({
    id: `motif:${side.patchId}`,
    role: "motif" as const,
    position: { ...side.insidePosition },
  })),
  ...project.patternSides.filter((side) => supportTargetIds.has(side.patchId)).map((side) => ({
    id: `support-target:${side.patchId}`,
    role: "support-target" as const,
    position: { ...side.insidePosition },
  })),
];
const cleanup = analyzeSpiderGraphCleanupLab(project.lattice, terminals);
const cleanupBefore = structuredClone(cleanup);
const study = studyTerminalPreservingNetworkTopology(cleanup, terminals);
assert.deepEqual(cleanup, cleanupBefore, "terminal topology study must not mutate Cleanup");
assert.deepEqual(study.levels.none.stats, cleanup.candidateStats);
assert.equal(study.terminalSummary.uniqueTerminalNodeCount, 38);
assert.equal(study.terminalSummary.motifTerminalNodeCount, 38);
assert.equal(study.terminalSummary.supportTerminalNodeCount, 20);
assert.equal(study.terminalSummary.multiRoleTerminalNodeCount, 20);
assert.equal(study.terminalSummary.inferredBranchJunctionCount, 28);
assert.equal(study.terminalSummary.explicitJunctionCount, 0);
assert.equal(study.terminalSummary.criticalEndpointCount, 20);
assert.equal(study.terminalSummary.intermediateNodeCount, 43);
assert.equal(study.initialCycleRank, 18);
assert.equal(study.findings.nearbyJunctions.length, 28);
assert.equal(study.findings.smallCycleClusters.length, 0);
assert.equal(study.findings.shortDetourNodes.length, 0);

const expected = {
  none: { nodes: 101, edges: 118, contracted: 0, rewired: 0 },
  low: { nodes: 85, edges: 102, contracted: 16, rewired: 16 },
  medium: { nodes: 66, edges: 83, contracted: 35, rewired: 35 },
  high: { nodes: 58, edges: 75, contracted: 43, rewired: 43 },
} as const;
for (const level of ["none", "low", "medium", "high"] as const) {
  const result = study.levels[level];
  assert.equal(result.stats.nodeCount, expected[level].nodes, `${level} nodes`);
  assert.equal(result.stats.edgeCount, expected[level].edges, `${level} edges`);
  assert.equal(result.contractedNodeIds.length, expected[level].contracted, `${level} contractions`);
  assert.equal(result.rewiredEdgeIds.length, expected[level].rewired, `${level} rewired edges`);
  assert.equal(result.stats.connectedComponents, 1, `${level} components`);
  assert.equal(result.stats.motifConnectivity.connectedCount, 38, `${level} Motif`);
  assert.equal(result.stats.supportTargetConnectivity.connectedCount, 20, `${level} support`);
  assert.equal(result.audit.terminalReachability.reachableTerminalPairs, 703, `${level} terminal pairs`);
  assert.equal(result.audit.terminalReachability.requiredTerminalPairs, 703, `${level} required pairs`);
  assert.equal(result.audit.retainedTerminalIdentity, true, `${level} terminal identity`);
  assert.equal(result.audit.retainedMajorBranchIdentity, true, `${level} branch identity`);
  assert.equal(result.audit.cleanNodeProvenanceComplete, true, `${level} node provenance`);
  assert.equal(result.audit.cleanEdgeProvenanceComplete, true, `${level} edge provenance`);
  assert.equal(result.audit.cycleRankPreserved, true, `${level} cycle rank`);
  assert.equal(result.audit.ok, true, `${level}: ${result.audit.reasons.join("; ")}`);
  assert.equal(result.cycleRank, 18);
  assert.equal(result.stats.edgeCount - result.stats.nodeCount + 1, 18);
  assert.equal(result.decisions.length, 101);
  assert.equal(result.topology.nodes.filter((node) => node.terminalRoles.includes("motif")).length, 38);
  assert.equal(result.topology.nodes.filter((node) => node.terminalRoles.includes("support-target")).length, 20);
}

assert.equal(study.levels.none.contractedNodeIds.length, 0);
assert.ok(study.levels.low.contractedNodeIds.every((id) => study.levels.medium.contractedNodeIds.includes(id)));
assert.ok(study.levels.medium.contractedNodeIds.every((id) => study.levels.high.contractedNodeIds.includes(id)));
assert.ok(study.levels.high.stats.nodeCount < study.levels.medium.stats.nodeCount);
assert.ok(study.levels.high.rewiredEdgeIds.length > 0);
assert.ok(study.levels.high.topology.edges.some((edge) =>
  edge.realizationIntent.kind === "polyline" && edge.provenance.contractedCleanNodeIds.length > 0));
assert.ok(study.levels.high.decisions.filter((decision) => decision.status === "contracted")
  .every((decision) => decision.replacementEdgeId && decision.metrics));
assert.ok(study.levels.high.decisions.filter((decision) => decision.status === "protected-terminal").length === 38);
assert.deepEqual(
  study.levels.high.contractedNodeIds,
  study.classifications.filter((node) => node.kind === "intermediate")
    .map((node) => node.cleanNodeId).sort((first, second) => first - second),
  "High may contract every intermediate, but no terminal, branch identity or critical endpoint",
);
assert.ok(study.findings.nearbyJunctions.every((finding) =>
  finding.candidateAction === "review-only-protected-junction"));

const repeat = studyTerminalPreservingNetworkTopology(cleanup, terminals);
assert.deepEqual(repeat.levels.high.contractedNodeIds, study.levels.high.contractedNodeIds);

const initialIntermediateMetrics = study.levels.none.decisions
  .filter((decision) => decision.status === "retained-by-level" && decision.metrics)
  .map((decision) => ({
    id: decision.cleanNodeId,
    bend: decision.metrics!.resultMaximumBendDeg,
    detour: decision.metrics!.resultDetourRatio,
  }))
  .sort((first, second) => first.bend - second.bend || first.id - second.id);
assert.equal(initialIntermediateMetrics.length, 43);
assert.ok(initialIntermediateMetrics[0].bend > 98 && initialIntermediateMetrics[0].bend < 99);
assert.ok(initialIntermediateMetrics.at(-1)!.bend > 120 && initialIntermediateMetrics.at(-1)!.bend < 121);

console.log("SKIN REBUILD Terminal-preserving Network Topology Study passed", JSON.stringify({
  terminals: study.terminalSummary,
  findings: {
    nearbyJunctions: study.findings.nearbyJunctions.length,
    smallCycleClusters: study.findings.smallCycleClusters.length,
    shortDetourNodes: study.findings.shortDetourNodes.length,
  },
  levels: Object.fromEntries((["none", "low", "medium", "high"] as const).map((level) => {
    const result = study.levels[level];
    return [level, {
      nodes: result.stats.nodeCount,
      edges: result.stats.edgeCount,
      contracted: result.contractedNodeIds.length,
      rewiredEdges: result.rewiredEdgeIds.length,
      components: result.stats.connectedComponents,
      motif: `${result.stats.motifConnectivity.connectedCount}/${result.stats.motifConnectivity.terminalCount}`,
      support: `${result.stats.supportTargetConnectivity.connectedCount}/${result.stats.supportTargetConnectivity.terminalCount}`,
      terminalPairs: `${result.audit.terminalReachability.reachableTerminalPairs}/${result.audit.terminalReachability.requiredTerminalPairs}`,
    }];
  })),
}));

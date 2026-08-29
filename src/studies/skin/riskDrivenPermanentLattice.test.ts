import assert from "node:assert/strict";
import { buildRiskDrivenPermanentLatticePlan } from "./riskDrivenPermanentLattice.ts";
import type { RiskDrivenInternalLatticeFacts } from "./riskDrivenInternalLattice.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

const graph: InternalStructureGraph = {
  kind: "targetedGrid",
  nodes: [
    { id: 0, position: { x: 0, y: 0, z: 0 }, radius: 0.04 },
    { id: 1, position: { x: 0, y: 0, z: 0.1 }, radius: 0.04 },
  ],
  edges: [{ id: 0, start: 0, end: 1, radius: 0.04 }],
  stats: { inputPoints: 2, delaunayTetrahedra: 0, candidateEdges: 1, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
};

const positions = new Float32Array([
  -0.08, -0.08, 0, 0.08, -0.08, 0, 0, 0.08, 0,
  0.08, -0.08, 0, -0.08, -0.08, 0, 0, 0.08, 0,
  0.1, 0, 0.5, 0.12, 0, 0.5, 0.1, 0.02, 0.5,
  -0.1, 0, 0.5, -0.1, 0.02, 0.5, -0.12, 0, 0.5,
]);

const facts: RiskDrivenInternalLatticeFacts = {
  status: "current", enabled: true, resolution: 48, thresholdDeg: 45, meshStep: 0.02,
  adjacencyCellSize: 0.05, totalSurfaceArea: 2, riskyArea: 1, riskyFaceCount: 2,
  clusters: [
    { id: 0, faceIds: [2], bounds: { min: { x: 0.1, y: 0, z: 0.5 }, max: { x: 0.12, y: 0.02, z: 0.5 } }, area: 0.5, lowestPoint: { x: 0.1, y: 0, z: 0.5 }, severity: "high", severityComponents: { overhangProxy: 1, areaProxy: 0.5, spanProxy: 0, heightProxy: 0.5, upwardContinuationProxy: 0, score: 0.6 } },
    { id: 1, faceIds: [3], bounds: { min: { x: -0.12, y: 0, z: 0.5 }, max: { x: -0.1, y: 0.02, z: 0.5 } }, area: 0.5, lowestPoint: { x: -0.1, y: 0, z: 0.5 }, severity: "high", severityComponents: { overhangProxy: 1, areaProxy: 0.5, spanProxy: 0, heightProxy: 0.5, upwardContinuationProxy: 0, score: 0.6 } },
  ],
  candidates: [
    { position: { x: 0.1, y: 0, z: 0.5 }, riskClusterId: 0, affectedRiskArea: 0.4, remainingRiskArea: 0.1, requiredLatticeLength: 0.5, supportGain: 0.8 },
    { position: { x: -0.1, y: 0, z: 0.5 }, riskClusterId: 1, affectedRiskArea: 0.4, remainingRiskArea: 0.1, requiredLatticeLength: 0.5, supportGain: 0.8 },
    { position: { x: 0.11, y: 0, z: 0.51 }, riskClusterId: 0, affectedRiskArea: 0.2, remainingRiskArea: 0.3, requiredLatticeLength: 0.5, supportGain: 0.4 },
  ],
  severityDistribution: { low: 0, medium: 0, high: 2, critical: 0 },
  diagnostics: { faceCount: 4, clusterAdjacencyCandidateComparisons: 0, upwardContinuationCandidateComparisons: 0 },
  heuristicNote: "test",
};

const snapshot = JSON.stringify({ graph, positions: Array.from(positions), facts });
const first = buildRiskDrivenPermanentLatticePlan({ riskFacts: facts, surfacePositions: positions, canonicalGraph: graph, scaleMmPerUnit: 20 });
const second = buildRiskDrivenPermanentLatticePlan({ riskFacts: facts, surfacePositions: positions, canonicalGraph: graph, scaleMmPerUnit: 20 });
assert.equal(first.status, "current");
assert.deepEqual(first, second, "planner is deterministic");
assert.equal(JSON.stringify({ graph, positions: Array.from(positions), facts }), snapshot, "inputs are immutable");
if (first.status !== "current") throw new Error(first.reason);
assert.equal(first.selectedCandidates.length, 2, "covered cluster receives one branch only");
assert.ok(first.diagnostics.sharedSpineCount >= 1);
assert.ok(first.anchors.every((anchor) => anchor.angleDeg < facts.thresholdDeg));
assert.ok(first.graph.edges.every((edge) => edge.physicalLengthMm <= 5 && edge.angleFromVerticalDeg <= 45 + 1e-6));
assert.ok(first.graph.edges.every((edge) => edge.diameterMm >= 2 && edge.diameterMm <= 2.5));
const adjacency = Array.from({ length: first.graph.nodes.length }, () => [] as number[]);
for (const edge of first.graph.edges) {
  adjacency[edge.start].push(edge.end);
  adjacency[edge.end].push(edge.start);
}
for (const target of first.graph.nodes.filter((node) => node.role === "risk-target")) {
  const visited = new Set<number>([target.id]);
  const queue = [target.id];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const next of adjacency[queue[cursor]]) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  assert.ok([...visited].some((id) => first.graph.nodes[id].role === "surface-anchor"), "every Risk target reaches a Safe anchor in Graph topology");
}
assert.equal(graph.nodes.length, 2);
assert.equal(graph.edges.length, 1);
assert.equal(first.augmentedGraph.nodes.length, graph.nodes.length + first.graph.nodes.length);
assert.equal(first.augmentedGraph.edges.length, graph.edges.length + first.graph.edges.length);

const noAnchor = buildRiskDrivenPermanentLatticePlan({
  riskFacts: { ...facts, clusters: facts.clusters.map((cluster) => ({ ...cluster, faceIds: [0, 1, 2, 3] })) },
  surfacePositions: positions,
  canonicalGraph: graph,
  scaleMmPerUnit: 20,
});
assert.equal(noAnchor.status, "disabled");

const missingFacts = buildRiskDrivenPermanentLatticePlan({
  riskFacts: undefined,
  surfacePositions: positions,
  canonicalGraph: graph,
  scaleMmPerUnit: 20,
} as never);
assert.equal(missingFacts.status, "disabled");
const malformedFacts = buildRiskDrivenPermanentLatticePlan({
  riskFacts: { ...facts, clusters: [{ ...facts.clusters[0], faceIds: [Number.NaN] }] },
  surfacePositions: positions,
  canonicalGraph: graph,
  scaleMmPerUnit: 20,
} as never);
assert.equal(malformedFacts.status, "disabled");
const duplicateCluster = buildRiskDrivenPermanentLatticePlan({
  riskFacts: { ...facts, clusters: [facts.clusters[0], { ...facts.clusters[1], id: facts.clusters[0].id }] },
  surfacePositions: positions,
  canonicalGraph: graph,
  scaleMmPerUnit: 20,
});
assert.equal(duplicateCluster.status, "disabled");
const negativeCluster = buildRiskDrivenPermanentLatticePlan({
  riskFacts: { ...facts, clusters: [{ ...facts.clusters[0], id: -1 }, facts.clusters[1]] },
  surfacePositions: positions,
  canonicalGraph: graph,
  scaleMmPerUnit: 20,
});
assert.equal(negativeCluster.status, "disabled");
const phantomCandidate = buildRiskDrivenPermanentLatticePlan({
  riskFacts: { ...facts, candidates: [{ ...facts.candidates[0], riskClusterId: 999 }] },
  surfacePositions: positions,
  canonicalGraph: graph,
  scaleMmPerUnit: 20,
});
assert.equal(phantomCandidate.status, "disabled");

console.log("riskDrivenPermanentLattice.test.ts passed");

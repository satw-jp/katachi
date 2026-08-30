import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "./fkei.ts";
import {
  analyzeSpiderGraphCleanupLab,
  findSpiderGraphCleanupCandidates,
  type SpiderGraphTerminal,
} from "./spiderGraphCleanupLab.ts";

const BASELINE_SHA256 = "4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf";

function graph(
  positions: readonly Vector3Value[],
  edgePairs: readonly (readonly [number, number])[],
  radius = 0.2,
): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: positions.map((position, id) => ({ id, position: { ...position }, radius })),
    edges: edgePairs.map(([start, end], id) => ({ id, start, end, radius })),
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

// Category smoke test: observations remain available even when they are not
// safe automatic cleanup operations.
const diagnosticFixture = graph(
  [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 0.5, y: -1, z: 0 },
    { x: 0.5, y: 1, z: 0 },
    { x: 0.25, y: 0, z: 0 },
    { x: 0.75, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
    { x: 3.0000005, y: 0, z: 0 },
  ],
  [
    [0, 1],
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 0],
  ],
);
const diagnosticFindings = findSpiderGraphCleanupCandidates(diagnosticFixture, []);
assert.equal(diagnosticFindings.nearlyCoincidentNodes.length, 1);
assert.equal(diagnosticFindings.duplicateEdges.length, 1);
assert.ok(diagnosticFindings.collinearOverlaps.length >= 1);
assert.ok(diagnosticFindings.edgeIntersections.some((finding) => finding.kind === "interior-interior"));
assert.equal(diagnosticFindings.microEdges.length, 1);

// An exact, unprotected, equal-radius degree-2 subdivision is cleanup. It is
// not the same as an author-controlled near-collinear simplification.
const subdivisionFixture = graph(
  [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
  ],
  [[0, 1], [1, 2]],
);
const subdivisionReport = analyzeSpiderGraphCleanupLab(subdivisionFixture, []);
assert.deepEqual(subdivisionReport.findings.degree2CollinearNodes.map((finding) => finding.candidateAction), ["collapse"]);
assert.equal(subdivisionReport.cleanupCandidate.nodes.length, 2);
assert.equal(subdivisionReport.cleanupCandidate.edges.length, 1);
assert.equal(subdivisionReport.topologyPreservation.ok, true);

// A terminal at the same subdivision is deliberately retained, even though
// the geometry is collinear, because deleting an authored attachment identity
// is not topology-preserving cleanup.
const protectedTerminal: SpiderGraphTerminal = {
  id: "motif:protected",
  role: "motif",
  position: { x: 1, y: 0, z: 0 },
};
const protectedReport = analyzeSpiderGraphCleanupLab(subdivisionFixture, [protectedTerminal]);
assert.equal(protectedReport.findings.degree2CollinearNodes[0].candidateAction, "keep");
assert.equal(protectedReport.cleanupCandidate.nodes.length, 3);
assert.equal(protectedReport.topologyPreservation.ok, true);

const baselineBytes = readFileSync(new URL(
  "../../../../public/samples/skin-rebuild-first-print.fkei",
  import.meta.url,
));
assert.equal(
  createHash("sha256").update(baselineBytes).digest("hex"),
  BASELINE_SHA256,
  "the laboratory must never change its input FKEI",
);
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

const inputBefore = structuredClone(project.lattice);
const report = analyzeSpiderGraphCleanupLab(project.lattice, terminals);
assert.deepEqual(project.lattice, inputBefore, "analysis must not mutate the production Spider graph");
assert.notEqual(report.rawGraph, project.lattice);
assert.notEqual(report.cleanupCandidate, report.rawGraph);
assert.deepEqual(report.rawGraph, inputBefore);
assert.equal(report.rawStats.nodeCount, 251);
assert.equal(report.rawStats.edgeCount, 270);
assert.equal(report.rawStats.motifConnectivity.terminalCount, 38);
assert.equal(report.rawStats.motifConnectivity.connectedCount, 38);
assert.equal(report.rawStats.supportTargetConnectivity.terminalCount, 20);
assert.equal(report.rawStats.supportTargetConnectivity.connectedCount, 20);
assert.equal(report.rawStats.connectedComponents, 1);
assert.ok(Math.abs(report.rawStats.totalEdgeLength - 125.72856977474008) <= 1e-12);
assert.equal(report.candidateStats.nodeCount, 101);
assert.equal(report.candidateStats.edgeCount, 118);
assert.equal(report.candidateStats.connectedComponents, 1);
assert.ok(Math.abs(report.candidateStats.totalEdgeLength - 123.79283631872248) <= 1e-12);
assert.deepEqual({
  nearlyCoincidentNodes: report.findings.nearlyCoincidentNodes.length,
  duplicateEdges: report.findings.duplicateEdges.length,
  collinearOverlaps: report.findings.collinearOverlaps.length,
  edgeIntersections: report.findings.edgeIntersections.length,
  microEdges: report.findings.microEdges.length,
  degree2CollinearNodes: report.findings.degree2CollinearNodes.length,
}, {
  nearlyCoincidentNodes: 2,
  duplicateEdges: 0,
  collinearOverlaps: 4,
  edgeIntersections: 4,
  microEdges: 0,
  degree2CollinearNodes: 150,
});
const operationCounts = Object.fromEntries(
  ["merge-near-nodes", "remove-duplicate-edge", "collapse-degree2-collinear"].map((kind) => [
    kind,
    report.appliedOperations.filter((operation) => operation.kind === kind).length,
  ]),
);
assert.deepEqual(operationCounts, {
  "merge-near-nodes": 2,
  "remove-duplicate-edge": 4,
  "collapse-degree2-collinear": 148,
});
assert.equal(report.topologyPreservation.ok, true, report.topologyPreservation.differences.join("\n"));
assert.equal(report.topologyPreservation.connectedComponentsPreserved, true);
assert.equal(report.topologyPreservation.motifConnectivityPreserved, true);
assert.equal(report.topologyPreservation.supportTargetConnectivityPreserved, true);
assert.equal(report.topologyPreservation.totalEdgeLengthPreserved, false);
assert.ok(Math.abs(report.topologyPreservation.totalEdgeLengthDelta - (-1.9357334560176014)) <= 1e-12);

console.log("SKIN REBUILD Spider Graph Cleanup laboratory passed", JSON.stringify({
  raw: report.rawStats,
  candidate: report.candidateStats,
  findings: {
    nearlyCoincidentNodes: report.findings.nearlyCoincidentNodes.length,
    duplicateEdges: report.findings.duplicateEdges.length,
    collinearOverlaps: report.findings.collinearOverlaps.length,
    edgeIntersections: report.findings.edgeIntersections.length,
    microEdges: report.findings.microEdges.length,
    degree2CollinearNodes: report.findings.degree2CollinearNodes.length,
  },
  findingDetails: {
    nearlyCoincidentNodes: report.findings.nearlyCoincidentNodes,
    collinearOverlaps: report.findings.collinearOverlaps,
    edgeIntersections: report.findings.edgeIntersections,
    degree2Actions: Object.fromEntries(
      ["collapse", "simplification-review", "keep"].map((action) => [
        action,
        report.findings.degree2CollinearNodes.filter((finding) => finding.candidateAction === action).length,
      ]),
    ),
  },
  operationCounts,
  topologyPreservation: report.topologyPreservation,
}));

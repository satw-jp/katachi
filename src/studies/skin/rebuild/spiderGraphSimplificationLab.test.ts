import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "./fkei.ts";
import { analyzeSpiderGraphCleanupLab, type SpiderGraphTerminal } from "./spiderGraphCleanupLab.ts";
import { studySpiderGraphSimplification } from "./spiderGraphSimplificationLab.ts";

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

const fixture = graph(
  [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
  ],
  [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]],
);
const fixtureTerminals: SpiderGraphTerminal[] = [
  { id: "motif:a", role: "motif", position: { x: 0, y: 0, z: 0 } },
  { id: "motif:b", role: "motif", position: { x: 1, y: 1, z: 0 } },
  { id: "support:a", role: "support-target", position: { x: 0, y: 0, z: 0 } },
];
const fixtureCleanup = analyzeSpiderGraphCleanupLab(fixture, fixtureTerminals);
const fixtureBefore = structuredClone(fixtureCleanup);
const fixtureStudy = studySpiderGraphSimplification(fixtureCleanup, fixtureTerminals);
assert.deepEqual(fixtureCleanup, fixtureBefore, "simplification must not mutate Cleanup input");
assert.equal(fixtureStudy.cycleBudget, 2);
assert.equal(fixtureStudy.levels.none.stats.edgeCount, 5);
assert.equal(fixtureStudy.levels.high.stats.edgeCount, 3);
assert.equal(fixtureStudy.levels.high.stats.connectedComponents, 1);
assert.equal(fixtureStudy.levels.high.stats.motifConnectivity.connectedCount, 2);
assert.equal(fixtureStudy.levels.high.stats.supportTargetConnectivity.connectedCount, 1);
assert.equal(fixtureStudy.levels.high.removedEdgeIds.length, 2);
assert.ok(fixtureStudy.levels.high.decisions.some((decision) =>
  decision.status === "rejected" && decision.reasons.some((reason) => reason.includes("alternative pathなし"))));

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
const study = studySpiderGraphSimplification(cleanup, terminals);
assert.deepEqual(cleanup, cleanupBefore, "author simplification must remain downstream of immutable Cleanup");
assert.equal(study.cycleBudget, 18);
assert.deepEqual(study.levels.none.topology, cleanup.cleanTopology);

const expectedEdgeCounts = { none: 118, low: 114, medium: 109, high: 100 } as const;
const expectedRemovedCounts = { none: 0, low: 4, medium: 9, high: 18 } as const;
for (const level of ["none", "low", "medium", "high"] as const) {
  const result = study.levels[level];
  assert.equal(result.stats.nodeCount, 101, `${level} nodes`);
  assert.equal(result.stats.edgeCount, expectedEdgeCounts[level], `${level} edges`);
  assert.equal(result.removedEdgeIds.length, expectedRemovedCounts[level], `${level} removals`);
  assert.equal(result.stats.connectedComponents, 1, `${level} components`);
  assert.equal(result.stats.motifConnectivity.connectedCount, 38, `${level} Motif connectivity`);
  assert.equal(result.stats.supportTargetConnectivity.connectedCount, 20, `${level} support connectivity`);
  assert.equal(result.constraintAudit.accepted, true, result.constraintAudit.reasons.join("\n"));
  assert.equal(result.provenance.length, 118);
  assert.equal(result.provenance.filter((entry) => entry.disposition === "removed").length, expectedRemovedCounts[level]);
  assert.equal(result.decisions.length, 118);
  assert.equal(result.cycleRank, 18 - expectedRemovedCounts[level]);
}

// Presets are nested author choices: increasing the amount never resurrects a
// previously removed edge, and repeated evaluation is deterministic.
assert.ok(study.levels.low.removedEdgeIds.every((id) => study.levels.medium.removedEdgeIds.includes(id)));
assert.ok(study.levels.medium.removedEdgeIds.every((id) => study.levels.high.removedEdgeIds.includes(id)));
assert.deepEqual(
  study.levels.high.removedEdgeIds,
  studySpiderGraphSimplification(cleanup, terminals).levels.high.removedEdgeIds,
);
assert.ok(study.levels.high.decisions.filter((decision) => decision.status === "removed")
  .every((decision) => decision.alternativePath && decision.removalScore > 0 && decision.criticality < 1));
assert.ok(study.levels.high.decisions.filter((decision) => decision.status === "rejected")
  .every((decision) => decision.criticality === 1));

console.log("SKIN REBUILD Spider Graph Simplification Study passed", JSON.stringify({
  cycleBudget: study.cycleBudget,
  levels: Object.fromEntries((["none", "low", "medium", "high"] as const).map((level) => {
    const result = study.levels[level];
    return [level, {
      nodes: result.stats.nodeCount,
      edges: result.stats.edgeCount,
      components: result.stats.connectedComponents,
      totalEdgeLength: result.stats.totalEdgeLength,
      motif: `${result.stats.motifConnectivity.connectedCount}/${result.stats.motifConnectivity.terminalCount}`,
      support: `${result.stats.supportTargetConnectivity.connectedCount}/${result.stats.supportTargetConnectivity.terminalCount}`,
      removedEdgeIds: result.removedEdgeIds,
    }];
  })),
}));

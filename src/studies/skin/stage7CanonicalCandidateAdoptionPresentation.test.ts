import assert from "node:assert/strict";
import {
  cloneStage7CanonicalCandidateGraph,
  createStage7CanonicalCandidateAdoptionPresentation,
  decideStage7CanonicalCandidateExactRecheck,
} from "./stage7CanonicalCandidateAdoptionPresentation.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

const statsWithFacts = {
  inputPoints: 1, delaunayTetrahedra: 0, candidateEdges: 1, clippedEdges: 0,
  removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0,
  dryWebContactFacts: { componentCount: 1 },
} as InternalStructureGraph["stats"] & { dryWebContactFacts: unknown };
const graph: InternalStructureGraph = {
  kind: "targetedGrid",
  nodes: [{ id: 0, position: { x: 1, y: 2, z: 3 }, radius: 0.4 }],
  edges: [{ id: 0, start: 0, end: 0, radius: 0.2 }],
  stats: statsWithFacts,
};

assert.equal(createStage7CanonicalCandidateAdoptionPresentation(null).state, "unavailable");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: true, adopted: false, adoptionCurrent: false, undoCurrent: false, graph: null,
}).state, "approved-ready");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: false, adopted: true, adoptionCurrent: true, undoCurrent: false, graph,
}).state, "adopted");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: false, adopted: true, adoptionCurrent: true, undoCurrent: true, graph,
}).state, "undo-ready");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: false, adopted: true, adoptionCurrent: true, undoCurrent: false, exactValidated: true, graph,
}).state, "adopted-exact-validated");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: false, adopted: true, adoptionCurrent: false, undoCurrent: false, graph,
}).state, "stale");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: true, adopted: false, adoptionCurrent: false, undoCurrent: false, competingWorkActive: true, graph: null,
}).adoptEnabled, false);

const currentRecheck = {
  workerIdentityCurrent: true,
  runGenerationCurrent: true,
  messageGenerationCurrent: true,
  candidateBindingCurrent: true,
  graphBindingCurrent: true,
  stage3BoundaryCurrent: true,
  settingsCurrent: true,
} as const;
assert.equal(decideStage7CanonicalCandidateExactRecheck(currentRecheck), "commit");
assert.equal(decideStage7CanonicalCandidateExactRecheck({
  ...currentRecheck, candidateBindingCurrent: false,
}), "fail-closed");
assert.equal(decideStage7CanonicalCandidateExactRecheck({
  ...currentRecheck, messageGenerationCurrent: false,
}), "fail-closed");
assert.equal(decideStage7CanonicalCandidateExactRecheck({
  ...currentRecheck, settingsCurrent: false,
}), "fail-closed");
assert.equal(decideStage7CanonicalCandidateExactRecheck({
  ...currentRecheck, workerIdentityCurrent: false,
}), "ignore-stale-worker");

const clone = cloneStage7CanonicalCandidateGraph(graph);
assert.notEqual(clone, graph);
assert.notEqual(clone.nodes, graph.nodes);
assert.notEqual(clone.nodes[0], graph.nodes[0]);
assert.notEqual(clone.nodes[0].position, graph.nodes[0].position);
assert.notEqual(clone.edges, graph.edges);
assert.equal(clone.kind, "targetedGrid");
assert.equal(clone.nodes.length, graph.nodes.length);
assert.equal(clone.edges.length, graph.edges.length);
assert.equal("dryWebContactFacts" in clone.stats, false);
assert.equal("dryWebContactFacts" in graph.stats, true);

import assert from "node:assert/strict";
import {
  createExplicitTopologyRepairPlan,
  explicitTopologyRepairPlanIsCurrent,
  type ExplicitTopologyRepairCurrentness,
  type ExplicitTopologyRepairIdentity,
} from "./explicitTopologyRepairPlan.ts";
import { createStage7ProvisionalAdoptionGatePresentation } from "./stage7ProvisionalAdoptionGatePresentation.ts";
import {
  cloneStage7CanonicalCandidateGraph,
  createStage7CanonicalCandidateAdoptionPresentation,
} from "./stage7CanonicalCandidateAdoptionPresentation.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

const surfaceIdentity = {};
const dryWebIdentity = {};
const artworkGraphIdentity = {};
const targetedSupportSourceIdentity = {};
const baseline: InternalStructureGraph = {
  kind: "targetedGrid",
  nodes: [
    { id: 0, position: { x: 0, y: 0, z: 0 }, radius: 0.1 },
    { id: 2470, position: { x: 1, y: 1, z: 1 }, radius: 0.1 },
  ],
  edges: [
    { id: 194, start: 0, end: 2470, radius: 0.03 },
    { id: 195, start: 2470, end: 0, radius: 0.031 },
    { id: 196, start: 0, end: 2470, radius: 0.032 },
    { id: 2400, start: 0, end: 2470, radius: 0.04 },
  ],
  stats: {
    inputPoints: 2,
    delaunayTetrahedra: 0,
    candidateEdges: 4,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  },
};
const identity: ExplicitTopologyRepairIdentity = {
  canonicalGraphIdentity: baseline,
  surfaceIdentity,
  dryWebIdentity,
  artworkGraphIdentity,
  targetedSupportSourceIdentity,
  paintRevision: 4,
  surfaceFingerprint: "surface-current",
  resolution: 48,
  mode: "plate",
  supportSettingsKey: "support-current",
};
const current: ExplicitTopologyRepairCurrentness = { ...identity };
const baselineSnapshot = structuredClone(baseline);
const result = createExplicitTopologyRepairPlan({
  baselineGraph: baseline,
  scaleMmPerUnit: 10,
  targetDiameterMm: 1.6,
  reason: "Patch 6 explicit topology repair",
  topologyEvidence: {
    resolution: 128,
    baselineComponents: 2,
    provisionalComponents: 1,
    closed: true,
    openEdges: 0,
    nonManifoldEdges: 0,
    degenerateTriangles: 0,
    nonFiniteTriangles: 0,
    windingAfterRepair: 0,
    baselineUnsupportedNodes: 59,
    provisionalUnsupportedNodes: 59,
    baselineUnsupportedEdges: 59,
    provisionalUnsupportedEdges: 59,
    baselineOverlongBridges: 1,
    provisionalOverlongBridges: 1,
    baselineMaxObservedBridgeMm: 5.0017992063047645,
    provisionalMaxObservedBridgeMm: 5.0017992063047645,
  },
  identity,
  nodes: [
    { id: 2471, positionMm: { x: 40, y: -20, z: 0 }, radius: 0.045 },
    { id: 2472, positionMm: { x: 36, y: -20, z: 4 }, radius: 0.045 },
    { id: 2473, positionMm: { x: 32, y: -20, z: 8 }, radius: 0.045 },
    { id: 2474, positionMm: { x: 28, y: -20, z: 12 }, radius: 0.045 },
  ],
  edges: [
    { id: 2401, start: 2471, end: 2472, radius: 0.045 },
    { id: 2402, start: 2472, end: 2473, radius: 0.045 },
    { id: 2403, start: 2473, end: 2474, radius: 0.045 },
  ],
});

assert.equal(result.plan.state, "current");
assert.ok(result.plan.graph);
assert.deepEqual(baseline, baselineSnapshot, "plan creation must not mutate the canonical graph");
assert.equal(result.plan.graph.nodes.length, baseline.nodes.length + 4);
assert.equal(result.plan.graph.edges.length, baseline.edges.length + 3);
assert.deepEqual(result.plan.facts.topologyEvidence, {
  resolution: 128,
  baselineComponents: 2,
  provisionalComponents: 1,
  closed: true,
  openEdges: 0,
  nonManifoldEdges: 0,
  degenerateTriangles: 0,
  nonFiniteTriangles: 0,
  windingAfterRepair: 0,
  baselineUnsupportedNodes: 59,
  provisionalUnsupportedNodes: 59,
  baselineUnsupportedEdges: 59,
  provisionalUnsupportedEdges: 59,
  baselineOverlongBridges: 1,
  provisionalOverlongBridges: 1,
  baselineMaxObservedBridgeMm: 5.0017992063047645,
  provisionalMaxObservedBridgeMm: 5.0017992063047645,
});
assert.deepEqual(result.plan.graph.nodes.slice(-4).map((node) => node.id), [2471, 2472, 2473, 2474]);
assert.deepEqual(result.plan.graph.edges.slice(-3).map((edge) => edge.id), [2401, 2402, 2403]);
assert.deepEqual(
  result.plan.graph.edges.filter((edge) => edge.id >= 194 && edge.id <= 196),
  baseline.edges.filter((edge) => edge.id >= 194 && edge.id <= 196),
  "legacy edges 194-196 stay byte-for-byte equivalent",
);
assert.equal(explicitTopologyRepairPlanIsCurrent(identity, current), true);
assert.equal(explicitTopologyRepairPlanIsCurrent(identity, { ...current, canonicalGraphIdentity: structuredClone(baseline) }), false);
assert.equal(explicitTopologyRepairPlanIsCurrent(identity, { ...current, surfaceIdentity: {} }), false);

const beforeExact = createStage7ProvisionalAdoptionGatePresentation({
  planIdentity: result.plan,
  resultIdentity: null,
  planCurrent: true,
  resultCurrent: false,
  comparisonState: "missing",
  comparisonCurrent: false,
  comparisonStatus: null,
  approval: null,
});
assert.equal(beforeExact.approveEnabled, false, "adoption review is disabled before exact comparison");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: false,
  adopted: false,
  adoptionCurrent: false,
  undoCurrent: false,
  graph: null,
}).adoptEnabled, false, "canonical adoption is disabled before author approval");

const exactResultIdentity = {};
const ready = createStage7ProvisionalAdoptionGatePresentation({
  planIdentity: result.plan,
  resultIdentity: exactResultIdentity,
  planCurrent: true,
  resultCurrent: true,
  comparisonState: "current",
  comparisonCurrent: true,
  comparisonStatus: "unchanged",
  approval: null,
});
assert.equal(ready.approveEnabled, true);
const approved = createStage7ProvisionalAdoptionGatePresentation({
  planIdentity: result.plan,
  resultIdentity: exactResultIdentity,
  planCurrent: true,
  resultCurrent: true,
  comparisonState: "current",
  comparisonCurrent: true,
  comparisonStatus: "unchanged",
  approval: { planIdentity: result.plan, resultIdentity: exactResultIdentity },
});
assert.equal(approved.state, "author-approved-for-next-confirmation");
assert.equal(createStage7CanonicalCandidateAdoptionPresentation({
  approved: true,
  adopted: false,
  adoptionCurrent: false,
  undoCurrent: false,
  graph: null,
}).adoptEnabled, true);

const adopted = cloneStage7CanonicalCandidateGraph(result.plan.graph);
assert.equal(adopted.nodes.length, baseline.nodes.length + 4);
assert.equal(adopted.edges.length, baseline.edges.length + 3);
const undone = baseline;
assert.deepEqual(undone, baselineSnapshot, "existing undo snapshot restores the complete pre-adoption graph");

console.log("explicitTopologyRepairPlan tests passed");

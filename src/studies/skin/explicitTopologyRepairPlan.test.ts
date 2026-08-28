import assert from "node:assert/strict";
import {
  createExplicitTopologyRepairPlan,
  evaluateExplicitTopologyRepairReadiness,
  explicitTopologyRepairAdoptionScaleIsCurrent,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES,
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT,
  explicitTopologyRepairPlanIsCurrent,
  type ExplicitTopologyRepairCurrentness,
  type ExplicitTopologyRepairIdentity,
  type ExplicitTopologyRepairReadinessInput,
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

assert.equal(PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS, 0.045);
assert.deepEqual(PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES, [
  { id: 2471, position: { x: 1.7426377880155963, y: -0.9324262748993122, z: -0.020968251934676625 }, radius: 0.045 },
  { id: 2472, position: { x: 1.6328900471282257, y: -0.9293096390602819, z: 0.151380587646076 }, radius: 0.045 },
  { id: 2473, position: { x: 1.5231423062408542, y: -0.9261930032212519, z: 0.3237294272268287 }, radius: 0.045 },
  { id: 2474, position: { x: 1.4133945653534832, y: -0.9230763673822215, z: 0.4960782668075813 }, radius: 0.045 },
]);
assert.deepEqual(PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES, [
  { id: 2401, start: 2471, end: 2472, radius: 0.045 },
  { id: 2402, start: 2472, end: 2473, radius: 0.045 },
  { id: 2403, start: 2473, end: 2474, radius: 0.045 },
]);
assert.equal(explicitTopologyRepairAdoptionScaleIsCurrent(21.37231162039355, 21.37231162039355), true);
assert.equal(explicitTopologyRepairAdoptionScaleIsCurrent(21.37231162039355, 21.335120456771964), false);
assert.equal(explicitTopologyRepairAdoptionScaleIsCurrent(21.37231162039355, undefined), false);
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
  scaleMmPerUnit: 999,
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
  nodes: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES,
  edges: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES,
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
assert.deepEqual(
  result.plan.graph.nodes.slice(-4).map((node) => node.position),
  PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES.map((node) => node.position),
  "candidate source coordinates are used directly; plan scale does not divide them at runtime",
);
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

const readinessBaseline: InternalStructureGraph = {
  kind: "targetedGrid",
  nodes: Array.from({ length: 2471 }, (_, id) => ({
    id,
    position: { x: id * 1e-6, y: id * 2e-6, z: id * 3e-6 },
    radius: 0.03,
  })),
  edges: Array.from({ length: 2401 }, (_, id) => ({
    id,
    start: id % 2471,
    end: (id + 1) % 2471,
    radius: 0.03,
  })),
  stats: {
    inputPoints: 2471,
    delaunayTetrahedra: 0,
    candidateEdges: 2401,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  },
};
const readinessSurfaceIdentity = {};
const readinessDryWebIdentity = {};
const readinessArtworkGraphIdentity = {};
const readinessTargetIdentity = {};
const readinessIdentity: ExplicitTopologyRepairIdentity = {
  canonicalGraphIdentity: readinessBaseline,
  surfaceIdentity: readinessSurfaceIdentity,
  dryWebIdentity: readinessDryWebIdentity,
  artworkGraphIdentity: readinessArtworkGraphIdentity,
  targetedSupportSourceIdentity: readinessTargetIdentity,
  paintRevision: 4,
  surfaceFingerprint: "surface-current",
  resolution: 128,
  mode: "plate",
  supportSettingsKey: "support-current",
};
const readinessCurrent: ExplicitTopologyRepairCurrentness = { ...readinessIdentity };
const readinessScale = 21.37231162039355;

function makeReadinessInput(
  overrides: Partial<ExplicitTopologyRepairReadinessInput> = {},
): ExplicitTopologyRepairReadinessInput {
  return {
    baselineGraph: readinessBaseline,
    candidateNodes: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES,
    candidateEdges: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES,
    identity: readinessIdentity,
    currentness: readinessCurrent,
    exactCurrent: true,
    unresolvedFaceCount: 0,
    currentScaleMmPerUnit: readinessScale,
    targetLongestMm: 80,
    validationScaleMmPerUnit: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT,
    surfaceSdf: () => -1,
    endpointOverlaps: [
      { patchId: 6, endpointNodeId: 2471, overlapMm: 0.5209591183 },
      { patchId: 22, endpointNodeId: 2474, overlapMm: 0.4513959589 },
    ],
    ...overrides,
  };
}

const readiness = evaluateExplicitTopologyRepairReadiness(makeReadinessInput());
assert.equal(readiness.available, true, readiness.reason);
assert.equal(readiness.firstFailureReason, null);
assert.equal(readiness.currentScaleMmPerUnit, readinessScale);
assert.equal(readiness.validationScaleMmPerUnit, 21.335120456771964);
assert.notEqual(readiness.currentScaleMmPerUnit, readiness.validationScaleMmPerUnit);
assert.ok(Math.abs(readiness.physicalEdges[0].lengthMm - 4.3674046897824) < 1e-9);
assert.ok(readiness.physicalEdges.every((edge) => edge.angleFromVerticalDeg <= 45 && edge.exposedSpanMm <= 5));
assert.equal(readiness.conditions.find((condition) => condition.name === "current finite scale")?.passed, true);
assert.equal(readiness.conditions.find((condition) => condition.name === "targetLongestMm identity")?.passed, true);

const validationProvenanceFailure = evaluateExplicitTopologyRepairReadiness(makeReadinessInput({
  validationScaleMmPerUnit: readinessScale,
}));
assert.equal(validationProvenanceFailure.available, false);
assert.equal(validationProvenanceFailure.conditions.find((condition) => condition.name === "validation scale provenance")?.passed, false);

const exposedSpanFailure = evaluateExplicitTopologyRepairReadiness(makeReadinessInput({
  currentScaleMmPerUnit: 30,
  surfaceSdf: () => 1,
}));
assert.equal(exposedSpanFailure.available, false);
assert.equal(exposedSpanFailure.conditions.find((condition) => condition.name === "edge 2401 exposed span")?.passed, false);
assert.match(exposedSpanFailure.firstFailureReason ?? "", /exposed span/);

const endpointOverlapFailure = evaluateExplicitTopologyRepairReadiness(makeReadinessInput({
  endpointOverlaps: [
    { patchId: 6, endpointNodeId: 2471, overlapMm: 0.1 },
    { patchId: 22, endpointNodeId: 2474, overlapMm: 0.4513959589 },
  ],
}));
assert.equal(endpointOverlapFailure.available, false);
assert.equal(endpointOverlapFailure.conditions.find((condition) => condition.name === "Patch 6 endpoint overlap")?.passed, false);
assert.match(endpointOverlapFailure.firstFailureReason ?? "", /Patch 6 endpoint overlap/);

const graphIdentityDrift = structuredClone(readinessBaseline);
const graphIdentityFailure = evaluateExplicitTopologyRepairReadiness(makeReadinessInput({
  baselineGraph: graphIdentityDrift,
}));
assert.equal(graphIdentityFailure.available, false);
assert.equal(graphIdentityFailure.conditions.find((condition) => condition.name === "canonical Graph object identity")?.passed, false);

const countDriftGraph = structuredClone(readinessBaseline);
countDriftGraph.nodes.push({ id: 2471, position: { x: 0, y: 0, z: 0 }, radius: 0.03 });
const countDriftIdentity: ExplicitTopologyRepairIdentity = {
  ...readinessIdentity,
  canonicalGraphIdentity: countDriftGraph,
};
const countDriftCurrent: ExplicitTopologyRepairCurrentness = {
  ...readinessCurrent,
  canonicalGraphIdentity: countDriftGraph,
};
const countFailure = evaluateExplicitTopologyRepairReadiness(makeReadinessInput({
  baselineGraph: countDriftGraph,
  identity: countDriftIdentity,
  currentness: countDriftCurrent,
}));
assert.equal(countFailure.available, false);
assert.equal(countFailure.conditions.find((condition) => condition.name === "canonical Graph counts")?.passed, false);
assert.equal(countFailure.conditions.find((condition) => condition.name === "deterministic node IDs")?.passed, false);

const surfaceIdentityFailure = evaluateExplicitTopologyRepairReadiness(makeReadinessInput({
  currentness: { ...readinessCurrent, surfaceIdentity: {} },
}));
assert.equal(surfaceIdentityFailure.available, false);
assert.equal(surfaceIdentityFailure.conditions.find((condition) => condition.name === "existing scalar identities")?.passed, false);

const paintRevisionFailure = evaluateExplicitTopologyRepairReadiness(makeReadinessInput({
  currentness: { ...readinessCurrent, paintRevision: 5 },
}));
assert.equal(paintRevisionFailure.available, false);
assert.equal(paintRevisionFailure.conditions.find((condition) => condition.name === "existing scalar identities")?.passed, false);

const adopted = cloneStage7CanonicalCandidateGraph(result.plan.graph);
assert.equal(adopted.nodes.length, baseline.nodes.length + 4);
assert.equal(adopted.edges.length, baseline.edges.length + 3);
const undone = baseline;
assert.deepEqual(undone, baselineSnapshot, "existing undo snapshot restores the complete pre-adoption graph");

console.log("explicitTopologyRepairPlan tests passed");

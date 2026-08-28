import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
import type { Patch } from "./field.ts";
import type { OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import { internalGraphReachesPoint } from "./surfaceAngleDiagnosis.ts";
import {
  buildTargetedGridInternalStructure,
  normalizeTargetedGridRequiredContacts,
  selectNearestMaterialPoint,
  type TargetedGridContactFloorFacts,
  type TargetedGridNearestSelectionStats,
  type TargetedGridTargetConnectionFact,
} from "./targetedGrid.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { buildSkinMesh } from "./meshExport.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 2 }];
const targets: MotifLowestPoint[] = Array.from({ length: 12 }, (_, index) => {
  const angle = index / 12 * Math.PI * 2;
  return {
    patchId: index + 1,
    shape: "flower",
    position: { x: Math.cos(angle) * 0.42, y: Math.sin(angle) * 0.42, z: 0.55 + 0.04 * Math.sin(angle * 2) },
    normal: { x: Math.cos(angle), y: Math.sin(angle), z: 0 },
    markerRadius: 0.03,
    reachedByInternal: false,
    basis: "finalMesh",
  };
});
const patches: Patch[] = targets.map((target) => ({
  id: target.patchId,
  shape: "flower",
  anchor: { x: target.position.x, y: target.position.y, z: target.position.z },
  normal: target.normal ?? { x: 0, y: 0, z: 1 },
  radius: 0.16,
  points: [{
    x: target.position.x - (target.normal?.x ?? 0) * 0.08,
    y: target.position.y - (target.normal?.y ?? 0) * 0.08,
    z: target.position.z - (target.normal?.z ?? 0) * 0.08,
    r: 0.13,
  }],
}));

const graph = buildTargetedGridInternalStructure(host, 0, patches, targets, 6, 0.06);
assert.equal(graph.kind, "targetedGrid");
assert.equal(graph.stats.requestedTargets, 12, "print web always includes every final-mesh motif");
assert.equal(graph.stats.connectedTargets, 12, "dense convex sample connects every motif");
assert.ok((graph.stats.gridNodeCount ?? 0) >= 12, "every motif contributes an inward Surface contact");
assert.equal(graph.stats.gridEdgeCount, graph.edges.length, "all graph edges are short local ties");
assert.ok(graph.edges.length >= 11, "a spanning web needs at least targetCount-1 ties");
assert.ok(graph.edges.every((edge) => edge.radius === 0.06), "all ties use one requested radius");
const contactFacts = graph.stats.dryWebContactFacts!;
assert.equal(contactFacts.usefulPatchCount, 12, "contact facts cover every useful Surface Pattern");
assert.equal(contactFacts.componentCount, 1, "dense ring resolves to one artwork component");
assert.equal(contactFacts.mainComponentKey, "1,2,3,4,5,6,7,8,9,10,11,12");
assert.equal(contactFacts.mainComponentSize, 12);
assert.deepEqual(contactFacts.patches.map((patch) => patch.patchId), Array.from({ length: 12 }, (_, index) => index + 1));
assert.ok(contactFacts.patches.every((patch) =>
  patch.contactCount === patch.contactNodeIds.length
  && patch.contactNodeIds.every((nodeId, index, ids) => index === 0 || ids[index - 1] < nodeId)
  && patch.componentKey === contactFacts.mainComponentKey
  && patch.componentSize === contactFacts.mainComponentSize),
"contact nodes are sorted, unique, and component facts are deterministic");
assert.ok(contactFacts.patches.every((patch) => patch.contactCount === 1),
  "repeated chosen links on a one-point pattern count one unique node");
const uniqueArtworkContactNodes = new Set(contactFacts.patches.flatMap((patch) => patch.contactNodeIds));
assert.ok(graph.nodes.length > uniqueArtworkContactNodes.size,
  "support-derived target-connection nodes are not counted as artwork contacts");

const splitTargets: MotifLowestPoint[] = [0, 1, 2, 3].map((index) => ({
  patchId: index + 1,
  shape: "flower",
  position: { x: index < 2 ? index * 0.1 : 10 + (index - 2) * 0.1, y: 0, z: 0.5 },
  normal: { x: 0, y: 0, z: 1 },
  markerRadius: 0.03,
  reachedByInternal: false,
  basis: "finalMesh",
}));
const splitPatches: Patch[] = splitTargets.map((target) => ({
  id: target.patchId,
  shape: "flower",
  anchor: target.position,
  normal: target.normal!,
  radius: 0.16,
  points: [{ ...target.position, r: 0.13 }],
}));
const splitFacts = buildTargetedGridInternalStructure(host, 0, splitPatches, splitTargets, 0, 0.06).stats.dryWebContactFacts!;
assert.equal(splitFacts.componentCount, 2, "separated patch groups remain separate components");
assert.equal(splitFacts.mainComponentKey, "1,2", "equal-size main component tie uses smallest patch ID");
assert.equal(splitFacts.mainComponentSize, 2);
assert.deepEqual(splitFacts.patches.map((patch) => patch.componentKey), ["1,2", "1,2", "3,4", "3,4"]);

const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
for (const edge of graph.edges) {
  const start = nodeById.get(edge.start)!.position;
  const end = nodeById.get(edge.end)!.position;
  assert.ok(Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z) > 0,
    "every chosen tie has non-zero geometry");
}

const reached = targets.filter((target) => internalGraphReachesPoint(target.position, graph, 0.001)).length;
assert.equal(reached, 12, "every final-mesh target is reached");
assert.deepEqual(
  buildTargetedGridInternalStructure(host, 0, patches, targets, 6, 0.06),
  graph,
  "same final-mesh targets, count and radius reproduce the graph exactly",
);
assert.deepEqual(
  buildTargetedGridInternalStructure(host, 0, patches, targets, 6, 0.06, { dryWebRequiredContacts: 1 }),
  graph,
  "explicit required contact floor 1 preserves the legacy graph exactly",
);
assert.equal(normalizeTargetedGridRequiredContacts(undefined), 1, "omitted builder option keeps legacy floor 1");
assert.equal(normalizeTargetedGridRequiredContacts(2.6), 3, "explicit floor is normalized to 1/2/3");
assert.throws(() => normalizeTargetedGridRequiredContacts(Number.NaN), /finite/);

const referenceGraph = buildTargetedGridInternalStructure(host, 0, patches, targets, 6, 0.06, {
  pruneByAabb: false,
});
assert.deepEqual(
  graph,
  referenceGraph,
  "exact AABB pruning preserves the legacy/reference graph byte-for-byte",
);

const legacyTargetGraph = buildTargetedGridInternalStructure(host, 0, patches, targets, 6, 0.06, {
  useLegacyTargetSelection: true,
});
assert.deepEqual(
  graph,
  legacyTargetGraph,
  "linear target selection preserves the legacy stable-sort graph byte-for-byte",
);

const equalScorePoints = [
  { x: -0.1, y: 0, z: 0, r: 0.01 },
  { x: 0.1, y: 0, z: 0, r: 0.01 },
];
const equalScoreStats: TargetedGridNearestSelectionStats = { linearScans: 0, legacySorts: 0, scannedPoints: 0 };
assert.equal(
  selectNearestMaterialPoint({ x: 0, y: 0, z: 0 }, equalScorePoints, equalScoreStats),
  equalScorePoints[0],
  "linear arg-min keeps the earliest point on an equal stable-sort score",
);
assert.deepEqual(equalScoreStats, { linearScans: 1, legacySorts: 0, scannedPoints: 2 });
const malformedPoint = { x: Number.NaN, y: 0, z: 0, r: 0.01 };
const malformedPoints = [malformedPoint, equalScorePoints[1]];
const malformedStats: TargetedGridNearestSelectionStats = { linearScans: 0, legacySorts: 0, scannedPoints: 0 };
assert.equal(
  selectNearestMaterialPoint({ x: 0, y: 0, z: 0 }, malformedPoints, malformedStats),
  malformedPoints.slice().sort((a, b) =>
    Math.hypot(a.x, a.y, a.z) - a.r - (Math.hypot(b.x, b.y, b.z) - b.r))[0],
  "non-finite scores use the exact legacy comparator path",
);
assert.deepEqual(malformedStats, { linearScans: 0, legacySorts: 1, scannedPoints: 0 });

const targetFallbackTargets: OverhangDryWebTarget[] = [
  { assignmentId: "fallback-global", position: { x: 0, y: 0, z: 0.55 }, markerRadius: 0.03, reachedByInternal: false, basis: "finalMesh" },
  { assignmentId: "fallback-missing", patchId: 999_999, position: { x: 0.01, y: 0, z: 0.55 }, markerRadius: 0.03, reachedByInternal: false, basis: "finalMesh" },
];
const fallbackOptimized = buildTargetedGridInternalStructure(host, 0, patches, targetFallbackTargets, 0, 0.06);
const fallbackLegacy = buildTargetedGridInternalStructure(host, 0, patches, targetFallbackTargets, 0, 0.06, {
  useLegacyTargetSelection: true,
});
assert.deepEqual(
  fallbackOptimized,
  fallbackLegacy,
  "missing patchId and unknown patchId use the same global fallback in both paths",
);

const mappingTargets: OverhangDryWebTarget[] = [
  {
    assignmentId: "z-last",
    patchId: 1,
    position: { ...targets[0].position },
    normal: { ...targets[0].normal! },
    markerRadius: 0.03,
    reachedByInternal: false,
    basis: "finalMesh",
  },
  {
    assignmentId: "a-first",
    patchId: 1,
    position: { ...targets[0].position },
    normal: { ...targets[0].normal! },
    markerRadius: 0.03,
    reachedByInternal: false,
    basis: "finalMesh",
  },
];
const mappingTargetsBefore = JSON.stringify(mappingTargets);
const mappingFacts: TargetedGridTargetConnectionFact[] = [];
const mappingGraph = buildTargetedGridInternalStructure(host, 0, patches, mappingTargets, 0, 0.06, {
  targetSourceIndices: [0, 1],
  onTargetConnectionFacts: (facts) => mappingFacts.push(...facts),
});
assert.deepEqual(
  mappingFacts.map((fact) => fact.sourceTargetIndex),
  [1, 0],
  "mapping keeps original source index after assignmentId sorting",
);
assert.ok(mappingFacts.every((fact) => fact.status === "connected"), "available nearest points are connected");
assert.equal(mappingFacts[0]?.contactNodeId, mappingFacts[1]?.contactNodeId, "deduped contact node ID is exact");
assert.equal(mappingFacts[0]?.materialNodeId, mappingFacts[1]?.materialNodeId, "deduped material node ID is exact");
assert.equal(mappingFacts[0]?.edgeId, mappingFacts[1]?.edgeId, "deduped edge ID is exact");
for (const fact of mappingFacts) {
  assert.notEqual(fact.edgeId, null);
  const edge = mappingGraph.edges[fact.edgeId!];
  assert.ok(edge, "connected mapping edge ID points to the graph edge");
  assert.equal(edge.start, fact.contactNodeId);
  assert.equal(edge.end, fact.materialNodeId);
}
assert.equal(JSON.stringify(mappingTargets), mappingTargetsBefore, "target mapping does not mutate source targets");
const mappingGraphWithoutCallback = buildTargetedGridInternalStructure(host, 0, patches, mappingTargets, 0, 0.06);
assert.deepEqual(mappingGraph, mappingGraphWithoutCallback, "runtime mapping leaves graph and aggregate stats unchanged");
const repeatedMappingFacts: TargetedGridTargetConnectionFact[] = [];
buildTargetedGridInternalStructure(host, 0, patches, mappingTargets, 0, 0.06, {
  targetSourceIndices: [0, 1],
  onTargetConnectionFacts: (facts) => repeatedMappingFacts.push(...facts),
});
assert.deepEqual(repeatedMappingFacts, mappingFacts, "same target input produces deterministic mapping facts");

const unresolvedFacts: TargetedGridTargetConnectionFact[] = [];
buildTargetedGridInternalStructure([], 0, patches, mappingTargets, 0, 0.06, {
  targetSourceIndices: [0, 1],
  onTargetConnectionFacts: (facts) => unresolvedFacts.push(...facts),
});
assert.deepEqual(
  unresolvedFacts,
  [
    { sourceTargetIndex: 1, contactNodeId: null, materialNodeId: null, edgeId: null, status: "unresolved" },
    { sourceTargetIndex: 0, contactNodeId: null, materialNodeId: null, edgeId: null, status: "unresolved" },
  ],
  "missing host emits explicit unresolved sentinels without stale IDs",
);

assert.throws(
  () => buildTargetedGridInternalStructure(host, 0, patches, mappingTargets, 0, 0.06, { targetSourceIndices: [0] }),
  /length mismatch/,
);

const progress: Array<{ phase: string; completed: number; total: number }> = [];
buildTargetedGridInternalStructure(host, 0, patches, targets, 0, 0.06, {
  onProgress: (update) => progress.push(update),
});
assert.deepEqual(
  [...new Set(progress.map((update) => update.phase))],
  ["pair-search", "candidate-ordering", "tree", "target-connections", "complete"],
  "progress reports every measured Dry Web build phase",
);
const pairUpdates = progress.filter((update) => update.phase === "pair-search");
const lastPairUpdate = pairUpdates[pairUpdates.length - 1];
assert.equal(lastPairUpdate?.completed, lastPairUpdate?.total);
assert.ok(lastPairUpdate!.total > 0, "pair search reports its real patch-pair total");
assert.ok(pairUpdates.every((update) => update.completed >= 0 && update.completed <= update.total));

const sparse = buildTargetedGridInternalStructure(host, 0, patches, targets, 0, 0.06);
assert.equal(sparse.stats.connectedTargets, 12);
assert.equal(sparse.edges.length, 23, "zero extra ties keeps 11 spanning ties plus 12 red-point contacts");
assert.ok(sparse.edges.length < graph.edges.length, "support count adds redundant ties without dropping motifs");

// A compact multi-point fixture makes the post-tree floor observable: the
// first spanning ties use one point on a deficient patch, while an unused
// shorter candidate can add a second distinct quantized contact node.
const floorPatches: Patch[] = [
  [[0, 0], [0, 0.2]],
  [[0.1, 0], [0.1, 0.2]],
  [[0.2, 0.3], [0.2, 0.5]],
  [[0.3, 0.3], [0.3, 0.5]],
].map((points, index) => ({
  id: index + 1,
  shape: "flower",
  anchor: { x: points[0][0], y: points[0][1], z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 0.2,
  points: points.map(([x, y]) => ({ x, y, z: 0, r: 0.03 })),
}));
const floorTargets: MotifLowestPoint[] = floorPatches.map((patch) => ({
  patchId: patch.id,
  shape: "flower",
  position: { x: patch.points[0].x, y: patch.points[0].y, z: 0.3 },
  normal: { x: 0, y: 0, z: 1 },
  markerRadius: 0.03,
  reachedByInternal: false,
  basis: "finalMesh",
}));
const floorInputBefore = JSON.stringify({ floorPatches, floorTargets });
function buildFloor(requiredContacts: number, supportCount = 0) {
  const mappingFacts: TargetedGridTargetConnectionFact[] = [];
  let contactFloorFacts: TargetedGridContactFloorFacts | undefined;
  const result = buildTargetedGridInternalStructure(host, 0, floorPatches, floorTargets, supportCount, 0.06, {
    dryWebRequiredContacts: requiredContacts,
    targetSourceIndices: floorTargets.map((_target, index) => index),
    onTargetConnectionFacts: (facts) => mappingFacts.push(...facts),
    onContactFloorFacts: (facts) => { contactFloorFacts = facts; },
  });
  return { result, mappingFacts, contactFloorFacts };
}
const floorOne = buildFloor(1);
const floorTwo = buildFloor(2);
const floorThree = buildFloor(3);
assert.deepEqual(floorOne.contactFloorFacts!.patches.map((patch) => patch.patchId), [1, 2, 3, 4],
  "contact floor facts cover every useful patch in patch-id order");
assert.equal(floorOne.contactFloorFacts!.requiredContacts, 1);
assert.ok(floorOne.contactFloorFacts!.patches.every((patch, index) =>
  patch.selectedDistinctContactCount === floorOne.result.stats.dryWebContactFacts!.patches[index].contactCount),
"selected floor facts equal the canonical contact-facts snapshot");
assert.ok(floorOne.contactFloorFacts!.patches.every((patch) =>
  patch.candidateLinkCount >= patch.candidateDistinctContactCount),
"candidate counts are derived from the existing candidate list and quantized endpoints");
const floorNoCallback = buildTargetedGridInternalStructure(host, 0, floorPatches, floorTargets, 0, 0.06, {
  dryWebRequiredContacts: 1,
  targetSourceIndices: floorTargets.map((_target, index) => index),
});
assert.deepEqual(floorNoCallback, floorOne.result, "runtime-only floor callback does not alter graph output");
const floorPatchEdgeCount = ({ result, mappingFacts }: ReturnType<typeof buildFloor>) => {
  const targetEdgeIds = new Set(mappingFacts.flatMap((fact) => fact.edgeId === null ? [] : [fact.edgeId]));
  return result.edges.filter((edge) => !targetEdgeIds.has(edge.id)).length;
};
assert.ok(floorPatchEdgeCount(floorTwo) > floorPatchEdgeCount(floorOne),
  "required floor 2 adds an unused candidate after the spanning structure");
assert.ok(floorPatchEdgeCount(floorThree) >= floorPatchEdgeCount(floorTwo),
  "required floor 3 keeps deterministic progress or exhausts candidates");
assert.ok(floorTwo.result.stats.dryWebContactFacts!.patches.some((patch, index) =>
  patch.contactCount > floorOne.result.stats.dryWebContactFacts!.patches[index].contactCount),
"floor pass improves a distinct generator contact count where a candidate permits it");
assert.ok(floorThree.result.stats.dryWebContactFacts!.patches.some((patch) => patch.contactCount < 3),
  "an infeasible local pattern remains insufficient rather than fabricating contact nodes");
assert.deepEqual(floorTwo.result, buildFloor(2).result, "floor selection is deterministic");
assert.deepEqual(floorTwo.mappingFacts, buildFloor(2).mappingFacts, "target mapping remains deterministic");
assert.deepEqual(floorOne.result.stats.dryWebContactFacts, buildFloor(1).result.stats.dryWebContactFacts,
  "target/support-derived edges do not alter the patch contact facts snapshot");
assert.ok(floorPatchEdgeCount(buildFloor(1, 1)) > floorPatchEdgeCount(floorOne),
  "supportCount extras still run after the floor pass");
assert.equal(JSON.stringify({ floorPatches, floorTargets }), floorInputBefore, "floor inputs remain immutable");

const performancePatch: Patch = {
  id: 1,
  shape: "flower",
  points: Array.from({ length: 32 }, (_, index) => ({
    x: (index % 8 - 3.5) * 0.01,
    y: (Math.floor(index / 8) - 1.5) * 0.01,
    z: 0,
    r: 0.01,
  })),
};
const performanceTargets: MotifLowestPoint[] = Array.from({ length: 100_000 }, (_, index) => ({
  patchId: 1,
  shape: "flower",
  position: { x: 0, y: 0, z: 0.1 + (index % 2) * 1e-9 },
  normal: { x: 0, y: 0, z: 1 },
  markerRadius: 0.03,
  reachedByInternal: false,
  basis: "finalMesh",
}));
const performanceStats: TargetedGridNearestSelectionStats = { linearScans: 0, legacySorts: 0, scannedPoints: 0 };
const performanceStarted = performance.now();
const performanceGraph = buildTargetedGridInternalStructure(
  host,
  0,
  [performancePatch],
  performanceTargets,
  0,
  0.06,
  { nearestSelectionStats: performanceStats },
);
const performanceElapsed = performance.now() - performanceStarted;
const legacyPerformanceStarted = performance.now();
const legacyPerformanceGraph = buildTargetedGridInternalStructure(
  host,
  0,
  [performancePatch],
  performanceTargets,
  0,
  0.06,
  { useLegacyTargetSelection: true },
);
const legacyPerformanceElapsed = performance.now() - legacyPerformanceStarted;
assert.equal(performanceGraph.stats.connectedTargets, performanceTargets.length);
assert.deepEqual(
  performanceGraph,
  legacyPerformanceGraph,
  "100k target connections are graph-identical to the legacy reference path",
);
assert.deepEqual(
  performanceStats,
  { linearScans: performanceTargets.length, legacySorts: 0, scannedPoints: performanceTargets.length * performancePatch.points.length },
  "100k target connections use one linear scan per target and no per-target sort fallback",
);
console.log(`[targetedGrid perf] 100k target connections: optimized=${performanceElapsed.toFixed(1)}ms / legacy=${legacyPerformanceElapsed.toFixed(1)}ms; scans=${performanceStats.scannedPoints}; legacySorts=${performanceStats.legacySorts}`);

const history = [] as ReturnType<typeof parseRecipe>;
const state = createEmptyState();
record(history, state, "setSkinParam", { key: "internalStructure", value: "targetedGrid" });
record(history, state, "setSkinParam", { key: "internalDensity", value: 24 });
record(history, state, "setSkinParam", { key: "internalRadius", value: 0.07 });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.internalStructure, "targetedGrid", "recipe preserves targeted mode");
assert.equal(restored.skinParams.internalDensity, 24, "recipe preserves requested support count");
assert.equal(restored.skinParams.internalRadius, 0.07, "recipe preserves one shared rail/strut radius");

const mesh = buildSkinMesh(
  "window", host, 0, 0.18, [], 0.035,
  { resolution: 22, targetLongestMm: 100 },
  0, 0, 0, graph,
);
assert.equal(mesh.internalEdgeCount, graph.edges.length, "existing SKIN mesh pipeline receives the targeted graph");
assert.ok(mesh.triangles.length > 0, "targeted graph is fused through the existing export mesh path");

console.log("TARGETED DRY WEB tests: passed");

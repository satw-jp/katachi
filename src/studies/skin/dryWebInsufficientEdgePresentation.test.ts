import assert from "node:assert/strict";
import {
  createDryWebInsufficientEdgePresentation,
  DRY_WEB_INSUFFICIENT_EDGE_COPY,
} from "./dryWebInsufficientEdgePresentation.ts";
import type { TargetedGridContactFacts, TargetedGridTargetConnectionFact } from "./targetedGrid.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

const graph: InternalStructureGraph = {
  kind: "targetedGrid",
  nodes: Array.from({ length: 8 }, (_, id) => ({
    id,
    position: { x: id, y: id * 0.1, z: 0 },
    radius: 0.05,
  })),
  edges: [
    { id: 10, start: 0, end: 1, radius: 0.04 },
    { id: 11, start: 0, end: 2, radius: 0.04 },
    { id: 12, start: 1, end: 2, radius: 0.04 },
    { id: 13, start: 3, end: 4, radius: 0.04 },
    { id: 99, start: 5, end: 7, radius: 0.04 },
  ],
  stats: {
    inputPoints: 0,
    delaunayTetrahedra: 0,
    candidateEdges: 5,
    clippedEdges: 5,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  },
};

const contactFacts: TargetedGridContactFacts = {
  usefulPatchCount: 4,
  componentCount: 2,
  mainComponentKey: "1,2,3,4",
  mainComponentSize: 3,
  patches: [
    { patchId: 1, contactNodeIds: [0], contactCount: 1, componentKey: "1", componentSize: 1 },
    { patchId: 2, contactNodeIds: [1], contactCount: 1, componentKey: "1,2,3,4", componentSize: 3 },
    { patchId: 3, contactNodeIds: [2, 3], contactCount: 2, componentKey: "1,2,3,4", componentSize: 3 },
    { patchId: 4, contactNodeIds: [4, 5, 6], contactCount: 3, componentKey: "1,2,3,4", componentSize: 3 },
  ],
};

const targetConnectionFacts: TargetedGridTargetConnectionFact[] = [
  { sourceTargetIndex: 0, contactNodeId: 5, materialNodeId: 7, edgeId: 99, status: "connected" },
  { sourceTargetIndex: 1, contactNodeId: null, materialNodeId: null, edgeId: null, status: "unresolved" },
];

const input = {
  current: true,
  running: false,
  stale: false,
  graph,
  contactFacts,
  requiredContacts: 1,
  targetConnectionFacts,
  targetSourceCount: 2,
  surfaceContextVisible: true,
};

for (const [state, expected] of [
  ["missing", "missing"],
  ["running", "running"],
  ["stale", "stale"],
] as const) {
  const result = createDryWebInsufficientEdgePresentation({
    ...input,
    current: state === "missing" || state === "stale" ? false : true,
    running: state === "running",
    stale: state === "stale",
    graph: null,
    contactFacts: null,
    targetConnectionFacts: null,
  });
  assert.equal(result.state, expected);
  assert.equal(result.insufficientPatchCount, null);
  assert.equal(result.highlightEdgeCount, null);
  assert.deepEqual(result.edges, []);
  assert.equal(result.available, false);
}

const graphBefore = JSON.stringify(graph);
const factsBefore = JSON.stringify(contactFacts);
const targetsBefore = JSON.stringify(targetConnectionFacts);
for (const [requiredContacts, expectedInsufficient, expectedEdges] of [
  [1, 1, [10, 11]],
  [2, 2, [10, 11, 12]],
  [3, 3, [10, 11, 12, 13]],
] as const) {
  const result = createDryWebInsufficientEdgePresentation({ ...input, requiredContacts });
  assert.equal(result.state, "current");
  assert.equal(result.available, true);
  assert.equal(result.insufficientPatchCount, expectedInsufficient);
  assert.equal(result.highlightEdgeCount, expectedEdges.length);
  assert.deepEqual(result.edges.map((edge) => edge.edgeId), expectedEdges);
  assert.equal(result.copy, DRY_WEB_INSUFFICIENT_EDGE_COPY);
  assert.equal(result.edges.some((edge) => edge.edgeId === 99), false, "target connection edge is excluded");
}

const weakestBin = createDryWebInsufficientEdgePresentation({ ...input, requiredContacts: 3 });
assert.deepEqual(weakestBin.edges.find((edge) => edge.edgeId === 11)?.patchIds, [1, 3]);
assert.equal(weakestBin.edges.find((edge) => edge.edgeId === 11)?.binKey, "one");
assert.deepEqual(weakestBin.edges, createDryWebInsufficientEdgePresentation({ ...input, requiredContacts: 3 }).edges);
assert.equal(JSON.stringify(graph), graphBefore, "graph is immutable");
assert.equal(JSON.stringify(contactFacts), factsBefore, "contact facts are immutable");
assert.equal(JSON.stringify(targetConnectionFacts), targetsBefore, "mapping facts are immutable");

const incompatible = createDryWebInsufficientEdgePresentation({ ...input, surfaceContextVisible: false });
assert.equal(incompatible.state, "missing");
assert.equal(incompatible.highlightEdgeCount, null);
assert.ok(incompatible.reason.includes("Surface"));

const malformedFacts = { ...contactFacts, patches: null } as unknown as TargetedGridContactFacts;
const malformed = createDryWebInsufficientEdgePresentation({ ...input, contactFacts: malformedFacts });
assert.equal(malformed.state, "missing");
assert.equal(malformed.insufficientPatchCount, null);

const malformedMapping = createDryWebInsufficientEdgePresentation({
  ...input,
  targetConnectionFacts: [targetConnectionFacts[0], targetConnectionFacts[0]],
});
assert.equal(malformedMapping.state, "missing");
assert.equal(malformedMapping.highlightEdgeCount, null);

console.log("dryWebInsufficientEdgePresentation: all assertions passed");

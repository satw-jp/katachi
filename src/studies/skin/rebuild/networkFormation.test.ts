import assert from "node:assert/strict";
import type { InternalStructureGraph } from "../voronoi.ts";
import {
  NETWORK_FORMATION_DURATION_MS,
  createNetworkFormationTimeline,
  networkFormationGraphAt,
} from "./networkFormation.ts";

function assertTimelineContract(candidate: InternalStructureGraph): void {
  const sourceJson = JSON.stringify(candidate);
  const candidateTimeline = createNetworkFormationTimeline(candidate);
  assert.equal(candidateTimeline.durationMs, NETWORK_FORMATION_DURATION_MS);
  assert.deepEqual(
    [...candidateTimeline.edgeOrder].sort((left, right) => left - right),
    candidate.edges.map((_, index) => index),
  );
  assert.equal(new Set(candidateTimeline.edgeOrder).size, candidate.edges.length);
  assert.ok(candidateTimeline.events.every((event, index) => (
    index === 0 || event.atMs >= candidateTimeline.events[index - 1].atMs
  )), "formation event time must be monotonic");
  assert.equal(candidateTimeline.events[0]?.kind, "reset");
  assert.equal(candidateTimeline.events.at(-1)?.kind, "stable");
  assert.equal(candidateTimeline.events.at(-1)?.visibleEdgeCount, candidate.edges.length);
  assert.ok(candidateTimeline.events.every((event) => (
    event.atMs >= 0 && event.atMs <= NETWORK_FORMATION_DURATION_MS
  )));

  const acceptedCounts = candidateTimeline.events
    .filter((event) => event.kind === "accept")
    .map((event) => event.visibleEdgeCount);
  assert.ok(acceptedCounts.length <= 52, "dense graphs must stay presentation-sized");
  assert.ok(acceptedCounts.every((count, index) => (
    count > 0 && (index === 0 || count > acceptedCounts[index - 1])
  )));
  if (candidate.edges.length > 0) assert.equal(acceptedCounts.at(-1), candidate.edges.length);

  assert.strictEqual(
    networkFormationGraphAt(candidate, candidateTimeline.edgeOrder, candidate.edges.length),
    candidate,
    "the stable frame must reuse the exact completed graph",
  );
  assert.equal(JSON.stringify(candidate), sourceJson, "formation planning must not mutate the completed graph");
}

const graph: InternalStructureGraph = {
  kind: "targetedGrid",
  nodes: Array.from({ length: 12 }, (_, id) => ({
    id: id + 10,
    position: { x: id % 4, y: Math.floor(id / 4), z: (id % 3) * 0.7 },
    radius: 0.12,
  })),
  edges: [
    [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [3, 7],
    [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 10], [7, 11],
    [8, 9], [9, 10], [10, 11], [0, 5], [5, 10], [6, 11],
  ].map(([start, end], id) => ({ id: 100 + id, start, end, radius: 0.08 })),
  stats: {
    inputPoints: 12,
    delaunayTetrahedra: 0,
    candidateEdges: 20,
    clippedEdges: 20,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  },
};

const originalJson = JSON.stringify(graph);
const timeline = createNetworkFormationTimeline(graph);
assertTimelineContract(graph);
assert.equal(timeline.durationMs, NETWORK_FORMATION_DURATION_MS);
assert.ok(timeline.durationMs >= 10_000 && timeline.durationMs <= 15_000);
assert.deepEqual([...timeline.edgeOrder].sort((a, b) => a - b), graph.edges.map((_, index) => index));
assert.equal(new Set(timeline.edgeOrder).size, graph.edges.length);
assert.equal(timeline.events[0].kind, "reset");
assert.equal(timeline.events[0].visibleEdgeCount, 0);
assert.equal(timeline.events.at(-1)?.kind, "stable");
assert.equal(timeline.events.at(-1)?.visibleEdgeCount, graph.edges.length);

const acceptedCounts = timeline.events
  .filter((event) => event.kind === "accept")
  .map((event) => event.visibleEdgeCount);
assert.ok(acceptedCounts.every((count, index) => index === 0 || count > acceptedCounts[index - 1]));
assert.equal(acceptedCounts.at(-1), graph.edges.length);

const permanentPairs = new Set(graph.edges.map((edge) => [edge.start, edge.end].sort((a, b) => a - b).join(":")));
const proposals = timeline.events.filter((event) => event.kind === "propose");
assert.ok(proposals.length >= 1, "formation should include a presentation-only rejected route");
for (const proposalEvent of proposals) {
  const proposal = proposalEvent.proposal!;
  assert.ok(!permanentPairs.has([proposal.startNodeIndex, proposal.endNodeIndex].sort((a, b) => a - b).join(":")));
  assert.ok(timeline.events.some((event) => event.kind === "reject" && event.proposal?.id === proposal.id));
}

const terminalText = timeline.events.flatMap((event) => event.terminalLines).join("\n");
assert.match(terminalText, /ACCEPT/);
assert.match(terminalText, /REJECT/);
assert.match(terminalText, /NETWORK STABLE/);

const emptyFrame = networkFormationGraphAt(graph, timeline.edgeOrder, 0);
assert.equal(emptyFrame.nodes.length, 0);
assert.equal(emptyFrame.edges.length, 0);
const partialFrame = networkFormationGraphAt(graph, timeline.edgeOrder, 7);
assert.notStrictEqual(partialFrame, graph);
assert.equal(partialFrame.edges.length, 7);
assert.ok(partialFrame.nodes.length > 0 && partialFrame.nodes.length < graph.nodes.length);
for (const edge of partialFrame.edges) {
  assert.ok(partialFrame.nodes[edge.start]);
  assert.ok(partialFrame.nodes[edge.end]);
}
const stableFrame = networkFormationGraphAt(graph, timeline.edgeOrder, graph.edges.length);
assert.strictEqual(stableFrame, graph, "the stable frame must reuse the exact completed graph");
assert.equal(JSON.stringify(graph), originalJson, "formation planning must not mutate the completed graph");

const sparseGraph: InternalStructureGraph = {
  ...graph,
  nodes: graph.nodes.slice(0, 2),
  edges: [{ id: 701, start: 0, end: 1, radius: 0.025 }],
};
assertTimelineContract(sparseGraph);
assert.equal(
  createNetworkFormationTimeline(sparseGraph).events.filter((event) => event.kind === "accept").length,
  1,
);

const disconnectedGraph: InternalStructureGraph = {
  ...graph,
  nodes: graph.nodes.slice(0, 8),
  edges: [
    { id: 801, start: 0, end: 1, radius: 0.035 },
    { id: 802, start: 1, end: 2, radius: 0.035 },
    { id: 803, start: 4, end: 5, radius: 0.035 },
    { id: 804, start: 6, end: 7, radius: 0.035 },
  ],
};
assertTimelineContract(disconnectedGraph);

const denseNodeCount = 180;
const denseGraph: InternalStructureGraph = {
  ...graph,
  nodes: Array.from({ length: denseNodeCount }, (_, id) => ({
    id: id + 1,
    position: { x: id % 18, y: Math.floor(id / 18), z: (id % 7) * 0.1 },
    radius: 0.06,
  })),
  edges: Array.from({ length: 1_000 }, (_, id) => ({
    id: 1_000 + id,
    start: id % denseNodeCount,
    end: (id * 17 + Math.floor(id / denseNodeCount) + 1) % denseNodeCount,
    radius: 0.018 + (id % 3) * 0.002,
  })).filter((edge) => edge.start !== edge.end),
};
assertTimelineContract(denseGraph);
const denseTimeline = createNetworkFormationTimeline(denseGraph);
const denseAcceptedCounts = denseTimeline.events
  .filter((event) => event.kind === "accept")
  .map((event) => event.visibleEdgeCount);
const denseBatchSizes = denseAcceptedCounts.map((count, index) => (
  count - (denseAcceptedCounts[index - 1] ?? 0)
));
assert.ok(Math.max(...denseBatchSizes) <= Math.ceil(denseGraph.edges.length / 52));

for (const proposalEvent of denseTimeline.events.filter((event) => event.kind === "propose")) {
  assert.ok(proposalEvent.proposal);
  assert.ok(proposalEvent.proposal.radius <= 0.022, "TEMP route must use real member scale, not node scale");
}

console.log("SKIN network formation presentation tests passed");

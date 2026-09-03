import assert from "node:assert/strict";
import test from "node:test";
import {
  addAuthoringNode,
  connectAuthoringNodes,
  createAuthoringGraph,
  createJunctionNode,
  disconnectAuthoringEdge,
  graphOverlaySegments,
  validateAuthoringGraph,
} from "./authoringGraph.ts";

const point = (x: number, y: number, z: number) => ({ x, y, z });

function baseGraph() {
  let graph = createAuthoringGraph();
  graph = addAuthoringNode(graph, {
    id: "stem-start",
    role: "anchor",
    sourceObjectId: "stem",
    position: point(0, 0, 0),
    protected: true,
    provenance: { sourceObjectIds: ["stem"], sourceGestureIds: ["gesture-stem"] },
  });
  graph = addAuthoringNode(graph, {
    id: "flower-center",
    role: "flower-center",
    sourceObjectId: "flower",
    position: point(0, 0, 1),
    protected: true,
    provenance: { sourceObjectIds: ["flower"], sourceGestureIds: ["gesture-core"] },
  });
  return graph;
}

test("Authoring Graph supports junctions and cycles without flattening semantic edges", () => {
  let graph = baseGraph();
  graph = createJunctionNode(graph, "junction", point(1, 0, 0.5), { sourceObjectIds: ["connector"] });
  graph = connectAuthoringNodes(graph, {
    id: "stem-to-junction",
    role: "stem",
    sourceObjectId: "stem",
    fromNodeId: "stem-start",
    toNodeId: "junction",
    protected: false,
  });
  graph = connectAuthoringNodes(graph, {
    id: "junction-to-flower",
    role: "connector",
    sourceObjectId: "connector",
    fromNodeId: "junction",
    toNodeId: "flower-center",
    protected: false,
  });
  graph = connectAuthoringNodes(graph, {
    id: "flower-to-stem",
    role: "surface-strand",
    sourceObjectId: "connector",
    fromNodeId: "flower-center",
    toNodeId: "stem-start",
    protected: false,
  });
  assert.equal(graph.edges.length, 3);
  assert.equal(graphOverlaySegments(graph).length, 3);
  assert.equal(validateAuthoringGraph(graph, ["stem", "flower", "connector"]).valid, true);
});

test("Graph validation reports stale references, missing nodes, duplicate connections, and zero length", () => {
  const graph = {
    ...baseGraph(),
    edges: [
      {
        id: "broken",
        role: "connector" as const,
        sourceObjectId: "missing",
        fromNodeId: "stem-start",
        toNodeId: "gone",
        provenance: { sourceObjectIds: [], sourceGestureIds: [] },
        revision: 0,
        protected: false,
      },
      {
        id: "zero",
        role: "stem" as const,
        sourceObjectId: "stem",
        fromNodeId: "stem-start",
        toNodeId: "stem-start",
        provenance: { sourceObjectIds: ["stem"], sourceGestureIds: [] },
        revision: 0,
        protected: false,
      },
    ],
  };
  const result = validateAuthoringGraph(graph, ["stem"]);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-edge-node"));
  assert.ok(result.issues.some((issue) => issue.code === "zero-length-edge"));
  assert.ok(result.issues.some((issue) => issue.code === "stale-source-reference"));
});

test("Disconnect is immutable and removes only the requested edge", () => {
  let graph = baseGraph();
  graph = connectAuthoringNodes(graph, {
    id: "stem-flower",
    role: "stem",
    sourceObjectId: "stem",
    fromNodeId: "stem-start",
    toNodeId: "flower-center",
    protected: false,
  });
  const disconnected = disconnectAuthoringEdge(graph, "stem-flower");
  assert.equal(graph.edges.length, 1);
  assert.equal(disconnected.edges.length, 0);
  assert.equal(disconnected.nodes.length, graph.nodes.length);
});

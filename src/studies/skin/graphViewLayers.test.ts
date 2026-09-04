import assert from "node:assert/strict";
import test from "node:test";
import {
  createGraphLayer,
  DEFAULT_GRAPH_VIEW_OPTIONS,
  graphLayerAvailability,
  graphViewLayerIds,
  SKIN_GRAPH_LAYER_IDS,
  type GraphViewGraph,
} from "./graphViewLayers.ts";

const graph: GraphViewGraph = {
  nodes: [
    { id: "a", position: { x: 0, y: 0, z: 0 }, radius: 0.1, role: "major" },
    { id: "b", position: { x: 0, y: 1, z: 0 }, radius: 0.08, role: "terminal" },
  ],
  edges: [{ id: "e", start: "a", end: "b", radius: 0.04, role: "edge" }],
};

test("GRAPH registry preserves independent layers and provenance", () => {
  assert.deepEqual([...graphViewLayerIds()], [...SKIN_GRAPH_LAYER_IDS]);
  const surface = createGraphLayer("surface", "Surface", "Stage 3 / Artwork", graph);
  const support = createGraphLayer(
    "removableSupport",
    "Removable Support",
    "current-stage8:sparseResult.graph",
    graph,
  );
  assert.equal(surface.editable, false);
  assert.equal(surface.graph, graph);
  assert.equal(support.graph, graph);
  assert.notEqual(surface, support);
  assert.equal(surface.provenance, "Stage 3 / Artwork");
  assert.equal(support.provenance, "current-stage8:sparseResult.graph");
});

test("missing Graph layers are explicit and default presentation is read-only", () => {
  const missing = createGraphLayer("dryWeb", "DryWeb", "Stage 4 / DryWeb", null);
  assert.equal(graphLayerAvailability(missing), "not-generated");
  assert.deepEqual(DEFAULT_GRAPH_VIEW_OPTIONS, {
    nodes: true,
    edges: true,
    contacts: true,
    provenance: false,
  });
  assert.equal(missing.visibility, true);
});

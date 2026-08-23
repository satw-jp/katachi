import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
import type { Patch } from "./field.ts";
import { internalGraphReachesPoint } from "./surfaceAngleDiagnosis.ts";
import { buildTargetedGridInternalStructure } from "./targetedGrid.ts";
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

const sparse = buildTargetedGridInternalStructure(host, 0, patches, targets, 0, 0.06);
assert.equal(sparse.stats.connectedTargets, 12);
assert.equal(sparse.edges.length, 23, "zero extra ties keeps 11 spanning ties plus 12 red-point contacts");
assert.ok(sparse.edges.length < graph.edges.length, "support count adds redundant ties without dropping motifs");

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

console.log("TARGETED DRY WEB tests: 20 passed");

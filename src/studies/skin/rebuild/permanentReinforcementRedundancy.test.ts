import assert from "node:assert/strict";
import {
  analyzeSkinRebuildPermanentReinforcementRedundancy,
  isSkinRebuildPermanentReinforcementGraphFinite,
  type SkinRebuildPermanentReinforcementRoute,
} from "./permanentReinforcementRedundancy.ts";
import type { InternalStructureGraph } from "../voronoi.ts";

function graph(
  nodePositions: Array<{ x: number; y: number; z: number }>,
  edgePairs: Array<[number, number]>,
): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: nodePositions.map((position, id) => ({ id, position, radius: 0.04 })),
    edges: edgePairs.map(([start, end], id) => ({ id, start, end, radius: 0.04 })),
    stats: {
      inputPoints: nodePositions.length,
      delaunayTetrahedra: 0,
      candidateEdges: edgePairs.length,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
      gridNodeCount: nodePositions.length,
      gridEdgeCount: edgePairs.length,
    },
  };
}

function route(
  motifPatchId: number,
  surfaceContact: { x: number; y: number; z: number },
  latticeContact: { x: number; y: number; z: number },
  latticeEdgeId: number,
  previewEdgeId: number,
  redundant = false,
): SkinRebuildPermanentReinforcementRoute {
  return {
    motifPatchId,
    surfaceContact,
    latticeContact,
    latticeEdgeIds: [latticeEdgeId],
    previewEdgeIds: [previewEdgeId],
    redundant,
  };
}

const positions = Array.from({ length: 10 }, (_, index) => ({
  x: index % 5,
  y: Math.floor(index / 5),
  z: 0,
}));
const after = graph(positions, [
  [0, 1], [1, 2], [2, 3],
  [0, 4], [1, 5], [2, 6], [2, 7], [2, 8], [2, 9],
]);
const before = graph(positions.slice(0, 4), [[0, 1], [1, 2], [2, 3]]);
const reinforcement = graph(
  [
    after.nodes[0].position, after.nodes[4].position,
    after.nodes[1].position, after.nodes[5].position,
    after.nodes[2].position, after.nodes[6].position,
    after.nodes[2].position, after.nodes[7].position,
    after.nodes[2].position, after.nodes[8].position,
    after.nodes[2].position, after.nodes[9].position,
  ],
  [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]],
);
// The preview graph is intentionally edge-disconnected: it is an overlay of
// accepted members, while the after graph is the authoritative permanent web.
const routes = [
  route(1, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, 3, 0),
  route(2, { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, 4, 1),
  route(2, { x: 1, y: 0.8, z: 1 }, { x: 1, y: 0.8, z: 0 }, 5, 2, true),
  route(3, { x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: 0 }, 6, 3),
  route(3, { x: 2, y: 0.8, z: 1 }, { x: 2, y: 0.8, z: 0 }, 7, 4),
  route(3, { x: 2, y: 1.6, z: 1 }, { x: 2, y: 1.6, z: 0 }, 8, 5, true),
];
const input = {
  beforeGraph: before,
  afterGraph: after,
  reinforcementGraph: reinforcement,
  motifPatchIds: [1, 2, 3, 4],
  routes,
  regions: [
    { complete: true, surfaceContactCount: 3, uncoveredSurfaceContactCount: 0 },
    { complete: false, surfaceContactCount: 3, uncoveredSurfaceContactCount: 1 },
  ],
  surfaceSampleCount: 7,
  minimumStrutDiameterMm: 0.8,
};

assert.equal(isSkinRebuildPermanentReinforcementGraphFinite(after), true);
const report = analyzeSkinRebuildPermanentReinforcementRedundancy(input);
assert.equal(report.before.reinforcedRegions, 2);
assert.equal(report.before.surfaceContacts, 4);
assert.equal(report.before.reinforcementMembers, 4);
assert.equal(report.before.noRoute, 3);
assert.equal(report.before.partial, 1);
assert.equal(report.before.oneContactDependencyCount, 2);
assert.equal(report.before.weakMotifCount, 4);
assert.equal(report.before.distributedContactMotifCount, 0);
assert.equal(report.after.reinforcedRegions, 2);
assert.equal(report.after.surfaceContacts, 6);
assert.equal(report.after.reinforcementMembers, 6);
assert.equal(report.after.partial, 1);
assert.equal(report.after.noRoute, 1);
assert.equal(report.after.oneContactDependencyCount, 1);
assert.equal(report.after.weakMotifCount, 3);
assert.equal(report.after.distributedContactMotifCount, 1);
assert.equal(report.after.disconnectedComponentCount, 1);
assert.equal(report.after.minimumStrutDiameterMm, 0.8);
assert.equal(report.redundantRouteCount, 2);
assert.deepEqual(report.redundantEdgeIds, [5, 8]);
assert.deepEqual(report.redundantPreviewEdgeIds, [2, 5]);
assert.deepEqual(report.singlePointDependencyPreviewEdgeIds, [0]);
assert.deepEqual(
  analyzeSkinRebuildPermanentReinforcementRedundancy(input),
  report,
  "redundancy analysis must be deterministic",
);

const invalid = {
  ...after,
  nodes: after.nodes.map((node, index) => index === 0
    ? { ...node, position: { ...node.position, x: Number.NaN } }
    : node),
};
assert.equal(isSkinRebuildPermanentReinforcementGraphFinite(invalid), false);
assert.throws(
  () => analyzeSkinRebuildPermanentReinforcementRedundancy({ ...input, afterGraph: invalid }),
  /invalid or non-finite/,
);

console.log("skin-rebuild permanent reinforcement redundancy tests passed");

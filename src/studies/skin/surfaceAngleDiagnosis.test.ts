import assert from "node:assert/strict";
import type { Triangle } from "../cloud-sculpt/meshExport.ts";
import {
  compileInternalGraphReachability,
  diagnoseSurfaceAnglePositions,
  diagnoseSurfaceAngles,
  internalGraphReachesPoint,
  surfaceOverhangAngleDeg,
} from "./surfaceAngleDiagnosis.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
}

const downward: Triangle = {
  a: { x: 0, y: 0, z: 0 },
  b: { x: 0, y: 1, z: 0 },
  c: { x: 1, y: 0, z: 0 },
};
const upward: Triangle = { a: downward.a, b: downward.c, c: downward.b };
const vertical: Triangle = {
  a: { x: 0, y: 0, z: 0 },
  b: { x: 0, y: 0, z: 1 },
  c: { x: 0, y: 1, z: 0 },
};

assert.equal(surfaceOverhangAngleDeg({ x: 0, y: 0, z: -1 }), 90);
assert.equal(surfaceOverhangAngleDeg({ x: 1, y: 0, z: 0 }), 0);
assert.equal(surfaceOverhangAngleDeg({ x: 0, y: 0, z: 1 }), 0);
assert.ok(Math.abs(surfaceOverhangAngleDeg({ x: 0.5, y: 0, z: -Math.sqrt(0.75) }) - 60) < 1e-9);

const before = diagnoseSurfaceAngles([downward, upward, vertical], null, 45, 0.05);
assert.equal(before.dangerousFaceCountBefore, 1);
assert.equal(before.dangerousFaceCountAfter, 1);
assert.equal(before.mitigatedFaceCount, 0);
assert.equal(before.beforeDangerPositions.length, 9);
assert.equal(before.afterDangerPositions.length, 9);
assert.equal(before.mitigatedPositions.length, 0);

const graph: InternalStructureGraph = {
  kind: "voronoiEdge",
  nodes: [
    { id: 0, position: { x: 1 / 3, y: 1 / 3, z: -0.1 }, radius: 0.04 },
    { id: 1, position: { x: 1 / 3, y: 1 / 3, z: -0.4 }, radius: 0.04 },
  ],
  edges: [{ id: 0, start: 0, end: 1, radius: 0.04 }],
  stats: {
    inputPoints: 0,
    delaunayTetrahedra: 0,
    candidateEdges: 1,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  },
};
const after = diagnoseSurfaceAngles([downward], graph, 45, 0.05);
assert.equal(after.dangerousFaceCountBefore, 1);
assert.equal(after.dangerousFaceCountAfter, 0);
assert.equal(after.mitigatedFaceCount, 1);
assert.equal(after.beforeDangerPositions.length, 9);
assert.equal(after.afterDangerPositions.length, 0);
assert.equal(after.mitigatedPositions.length, 9);
assert.ok(Math.abs(after.dangerousAreaBefore - after.mitigatedArea) < 1e-12);

const strict = diagnoseSurfaceAngles([downward], null, 91, 0.05);
assert.equal(strict.thresholdDeg, 90);
assert.equal(strict.dangerousFaceCountBefore, 1);

const bufferResult = diagnoseSurfaceAnglePositions(
  new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]), graph, 45, 0.05,
);
assert.equal(bufferResult.dangerousFaceCountBefore, after.dangerousFaceCountBefore);
assert.equal(bufferResult.mitigatedFaceCount, after.mitigatedFaceCount);

// The indexed broad phase must include the edge tube radius, not only the
// endpoint AABB. This point is outside the endpoint box by 0.3 but exactly at
// radius + tolerance.
const thickBoundaryGraph: InternalStructureGraph = {
  kind: "voronoiEdge",
  nodes: [
    { id: 1, position: { x: 0, y: 0, z: 0 }, radius: 0.2 },
    { id: 2, position: { x: 1, y: 0, z: 0 }, radius: 0.2 },
  ],
  edges: [{ id: 1, start: 1, end: 2, radius: 0.2 }],
  stats: graph.stats,
};
const thickBoundaryPoint = { x: 0.5, y: 0.3, z: 0 };
const thickBoundaryQuery = compileInternalGraphReachability(thickBoundaryGraph, { cellSize: 0.25 });
equal(
  thickBoundaryQuery.reachesPoint(thickBoundaryPoint, 0.1),
  internalGraphReachesPoint(thickBoundaryPoint, thickBoundaryGraph, 0.1),
  "indexed tube AABB preserves radius+tolerance boundary",
);
equal(thickBoundaryQuery.reachesPoint(thickBoundaryPoint, 0.1), true, "thick edge reaches exact boundary");

// Uncertain radii stay on the literal reference path. Legacy arithmetic can
// still accept a negative radius when tolerance compensates, and Infinity is
// an accepted legacy hit.
for (const radius of [-0.2, Infinity, NaN]) {
  const malformedRadiusGraph: InternalStructureGraph = {
    ...thickBoundaryGraph,
    edges: [{ id: 1, start: 1, end: 2, radius }],
  };
  const indexed = compileInternalGraphReachability(malformedRadiusGraph, { cellSize: 0.25 });
  equal(
    indexed.reachesPoint(thickBoundaryPoint, 0.3),
    internalGraphReachesPoint(thickBoundaryPoint, malformedRadiusGraph, 0.3),
    `malformed radius ${String(radius)} keeps legacy result`,
  );
}
const missingNodeGraph: InternalStructureGraph = {
  ...thickBoundaryGraph,
  edges: [{ id: 9, start: 1, end: 99, radius: 0.2 }],
};
equal(
  compileInternalGraphReachability(missingNodeGraph).reachesPoint(thickBoundaryPoint, 0.1),
  internalGraphReachesPoint(thickBoundaryPoint, missingNodeGraph, 0.1),
  "missing node remains skipped",
);
const nonFiniteNodeGraph: InternalStructureGraph = {
  ...thickBoundaryGraph,
  nodes: [
    { id: 1, position: { x: Number.NaN, y: 0, z: 0 }, radius: 0.2 },
    thickBoundaryGraph.nodes[1],
  ],
};
equal(
  compileInternalGraphReachability(nonFiniteNodeGraph).reachesPoint(thickBoundaryPoint, 0.1),
  internalGraphReachesPoint(thickBoundaryPoint, nonFiniteNodeGraph, 0.1),
  "non-finite node uses legacy fallback",
);

// Optimized and literal all-edge diagnosis are byte-for-byte equivalent on a
// deterministic multi-face fixture, including output ordering.
const equivalencePositions = new Float32Array([
  0, 0, 0, 0, 1, 0, 1, 0, 0,
  2, 0, 0, 2, 1, 0, 3, 0, 0,
  4, 0, 0, 4, 1, 0, 5, 0, 0,
]);
const equivalenceGraph: InternalStructureGraph = {
  ...thickBoundaryGraph,
  nodes: [
    { id: 1, position: { x: 0.33, y: 0.33, z: -0.2 }, radius: 0.2 },
    { id: 2, position: { x: 0.33, y: 0.33, z: -0.5 }, radius: 0.2 },
    { id: 3, position: { x: 4.33, y: 0.33, z: -0.2 }, radius: 0.2 },
    { id: 4, position: { x: 4.33, y: 0.33, z: -0.5 }, radius: 0.2 },
  ],
  edges: [
    { id: 1, start: 1, end: 2, radius: 0.1 },
    { id: 2, start: 3, end: 4, radius: 0.1 },
  ],
};
const optimizedDiagnosis = diagnoseSurfaceAnglePositions(equivalencePositions, equivalenceGraph, 45, 0.05);
const referenceDiagnosis = diagnoseSurfaceAnglePositions(equivalencePositions, equivalenceGraph, 45, 0.05, { useLegacyReachability: true });
assert.deepEqual(optimizedDiagnosis, referenceDiagnosis, "indexed diagnosis equals literal legacy diagnosis");

// Fixed spatial graph regression: exact checks drop substantially while the
// indexed booleans still match the literal reference for every query.
const syntheticNodes: InternalStructureGraph["nodes"] = [];
const syntheticEdges: InternalStructureGraph["edges"] = [];
for (let index = 0; index < 1200; index++) {
  syntheticNodes.push(
    { id: index * 2, position: { x: index * 10, y: 0, z: 0 }, radius: 0.01 },
    { id: index * 2 + 1, position: { x: index * 10 + 1, y: 0, z: 0 }, radius: 0.01 },
  );
  syntheticEdges.push({ id: index, start: index * 2, end: index * 2 + 1, radius: 0.01 });
}
const syntheticGraph: InternalStructureGraph = {
  kind: "voronoiEdge", nodes: syntheticNodes, edges: syntheticEdges, stats: graph.stats,
};
const syntheticQuery = compileInternalGraphReachability(syntheticGraph, { cellSize: 2 });
for (let index = 0; index < 1200; index++) {
  const point = { x: index * 10 + 0.5, y: 5, z: 0 };
  equal(
    syntheticQuery.reachesPoint(point, 0.1),
    internalGraphReachesPoint(point, syntheticGraph, 0.1),
    "synthetic indexed boolean matches reference",
  );
}
assert.ok(syntheticQuery.stats.distanceChecks < syntheticEdges.length * 120, "spatial index reduces exact checks by >10x");

// Every edge spans many buckets, so each query sees repeated references to the
// same indexed candidates. Stamps must preserve the literal booleans while
// keeping exact checks bounded by one visit per edge per query.
const overlappingEdgeCount = 256;
const overlappingGraph: InternalStructureGraph = {
  kind: "voronoiEdge",
  nodes: [
    { id: 1, position: { x: 0, y: 0, z: 0 }, radius: 0.1 },
    { id: 2, position: { x: 1, y: 1, z: 0 }, radius: 0.1 },
  ],
  edges: Array.from({ length: overlappingEdgeCount }, (_, id) => ({
    id, start: 1, end: 2, radius: 0.1,
  })),
  stats: graph.stats,
};
const overlappingQuery = compileInternalGraphReachability(overlappingGraph, { cellSize: 0.25 });
const overlappingRepeats = 80;
const overlappingMiss = { x: 0, y: 0.5, z: 0.5 };
const overlappingHit = { x: 0.5, y: 0.5, z: 0 };
for (let repeat = 0; repeat < overlappingRepeats; repeat++) {
  const candidatesBefore = overlappingQuery.stats.indexedCandidates;
  const checksBefore = overlappingQuery.stats.distanceChecks;
  const indexedMiss = overlappingQuery.reachesPoint(overlappingMiss, 0.4);
  const literalMiss = internalGraphReachesPoint(overlappingMiss, overlappingGraph, 0.4);
  equal(
    indexedMiss,
    literalMiss,
    "overlapping-bucket miss matches reference",
  );
  assert.equal(literalMiss, false, "overlapping-bucket query is a true miss");
  assert.ok(
    overlappingQuery.stats.indexedCandidates - candidatesBefore <= overlappingEdgeCount,
    "one miss visits each overlapping edge at most once",
  );
  assert.ok(
    overlappingQuery.stats.distanceChecks - checksBefore <= overlappingEdgeCount,
    "one miss performs each exact check at most once",
  );
  equal(
    overlappingQuery.reachesPoint(overlappingHit, 0),
    internalGraphReachesPoint(overlappingHit, overlappingGraph, 0),
    "overlapping-bucket hit matches reference",
  );
}
const overlappingQueryCount = overlappingRepeats * 2;
assert.ok(
  overlappingQuery.stats.indexedCandidates <= overlappingEdgeCount * overlappingQueryCount,
  "duplicate bucket references are suppressed before candidate accounting",
);
assert.ok(
  overlappingQuery.stats.distanceChecks <= overlappingEdgeCount * overlappingQueryCount,
  "duplicate bucket references do not multiply exact checks",
);

// Realistic Dry Web shape: 60k short edges distributed through a dense
// 3D grid. The automatic global-extent cell size must keep these edges in the
// index rather than treating their individual spans as long-edge fallbacks.
const largeEdgeCount = 60_000;
const largeGridWidth = 40;
const largeDiagonalDelta = 0.067 / Math.sqrt(3);
const largeNodes: InternalStructureGraph["nodes"] = [];
const largeEdges: InternalStructureGraph["edges"] = [];
for (let index = 0; index < largeEdgeCount; index++) {
  const gx = index % largeGridWidth;
  const gy = Math.floor(index / largeGridWidth) % largeGridWidth;
  const gz = Math.floor(index / (largeGridWidth * largeGridWidth));
  const nodeId = index * 2;
  const start = { x: gx * 0.05, y: gy * 0.05, z: gz * 0.05 };
  largeNodes.push(
    { id: nodeId, position: start, radius: 0.01 },
    { id: nodeId + 1, position: {
      x: start.x + largeDiagonalDelta, y: start.y + largeDiagonalDelta, z: start.z + largeDiagonalDelta,
    }, radius: 0.01 },
  );
  largeEdges.push({ id: index, start: nodeId, end: nodeId + 1, radius: 0.045 });
}
const largeGraph: InternalStructureGraph = {
  kind: "targetedGrid", nodes: largeNodes, edges: largeEdges, stats: graph.stats,
};
const largeQuery = compileInternalGraphReachability(largeGraph);
assert.ok(largeQuery.stats.indexedEdges / largeEdgeCount > 0.9, "global extent keeps >90% of short edges indexed");
assert.ok(largeQuery.stats.fallbackEdges < largeEdgeCount * 0.1, "large distributed graph has bounded fallback");
for (let index = 0; index < largeEdgeCount; index += 233) {
  const gx = index % largeGridWidth;
  const gy = Math.floor(index / largeGridWidth) % largeGridWidth;
  const gz = Math.floor(index / (largeGridWidth * largeGridWidth));
  const hit = { x: gx * 0.05 + 0.02, y: gy * 0.05 + 0.02, z: gz * 0.05 + 0.02 };
  const miss = { x: gx * 0.05, y: gy * 0.05, z: 2.5 };
  equal(largeQuery.reachesPoint(hit, 0.05), internalGraphReachesPoint(hit, largeGraph, 0.05), "large indexed hit matches reference");
  equal(largeQuery.reachesPoint(miss, 0.05), internalGraphReachesPoint(miss, largeGraph, 0.05), "large indexed miss matches reference");
}
assert.ok(largeQuery.stats.distanceChecks < largeEdgeCount * 100, "large graph reduces exact checks substantially");

const progress: Array<{ stage: string; completed: number; total: number }> = [];
diagnoseSurfaceAnglePositions(
  equivalencePositions,
  equivalenceGraph,
  45,
  0.05,
  { onProgress: (event) => progress.push(event) },
);
assert.deepEqual(
  [...new Set(progress.map((event) => event.stage))],
  ["reachability-index", "dangerous-face-contact", "complete"],
  "diagnosis progress has measured phase order",
);
for (const event of progress) {
  assert.ok(event.completed >= 0 && event.completed <= event.total, "progress stays within measured total");
}
const manyFaces = new Float32Array(1000 * 9);
for (let index = 0; index < 1000; index++) manyFaces.set(equivalencePositions.slice(0, 9), index * 9);
const manyFaceProgress: Array<{ stage: string; completed: number; total: number }> = [];
diagnoseSurfaceAnglePositions(manyFaces, null, 45, 0.05, {
  onProgress: (event) => manyFaceProgress.push(event),
});
const manyFaceEvents = manyFaceProgress.filter((event) => event.stage === "dangerous-face-contact");
assert.ok(manyFaceEvents.length <= 102, "face progress is throttled to about 100 updates");
assert.equal(manyFaceEvents[manyFaceEvents.length - 1]?.completed, 1000, "face progress ends after face work");

console.log(
  `surface angle diagnosis tests: indexed query/reference/progress cases passed `
  + `(large indexed=${largeQuery.stats.indexedEdges}/${largeEdgeCount}, fallback=${largeQuery.stats.fallbackEdges}, exactChecks=${largeQuery.stats.distanceChecks})`,
);

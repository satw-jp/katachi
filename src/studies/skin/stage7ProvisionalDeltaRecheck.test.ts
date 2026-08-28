import assert from "node:assert/strict";
import {
  composeStage7ProvisionalDeltaDiagnosis,
  stage7ProvisionalReachabilityIsMonotonic,
  validateStage7ProvisionalReachabilityMonotonic,
} from "./stage7ProvisionalDeltaRecheck.ts";
import { diagnoseSurfaceAnglePositions } from "./surfaceAngleDiagnosis.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

function graph(
  nodes: Array<[number, number, number, number]>,
  edges: Array<[number, number, number, number]>,
): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: nodes.map(([id, x, y, z]) => ({ id, position: { x, y, z }, radius: 0 })),
    edges: edges.map(([id, start, end, radius]) => ({ id, start, end, radius })),
    stats: {
      inputPoints: nodes.length,
      delaunayTetrahedra: 0,
      candidateEdges: edges.length,
      clippedEdges: edges.length,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
    },
  };
}

function translatedOverhangTriangle(x: number, width = 1, height = 1): number[] {
  // The winding gives a downward-facing normal, so threshold 45° includes it.
  return [x, 0, 0, x, height, 0, x + width, 0, 0];
}

function sameBits(left: Float32Array, right: Float32Array): boolean {
  assert.equal(left.length, right.length);
  const a = new Uint32Array(left.buffer, left.byteOffset, left.byteLength / 4);
  const b = new Uint32Array(right.buffer, right.byteOffset, right.byteLength / 4);
  return a.every((value, index) => value === b[index]);
}

const baseGraph = graph(
  [[1, 0, 0.3333333333, 0], [2, 0.5, 0.3333333333, 0]],
  [[10, 1, 2, 0.2]],
);

// Unchanged, split, and additive graphs pass the monotonic proof.
assert.equal(stage7ProvisionalReachabilityIsMonotonic(baseGraph, baseGraph), true, "unchanged graph passes");
const splitGraph = graph(
  [[1, 0, 0.3333333333, 0], [2, 0.5, 0.3333333333, 0], [3, 0.25, 0.3333333333, 0]],
  [[11, 1, 3, 0.2], [12, 3, 2, 0.2], [20, 1, 2, 0.4]],
);
assert.equal(stage7ProvisionalReachabilityIsMonotonic(baseGraph, splitGraph), true, "split and additive edges pass");

const removedGraph = graph(
  [[1, 0, 0.3333333333, 0], [2, 0.5, 0.3333333333, 0]],
  [],
);
const gapGraph = graph(
  [[1, 0, 0.3333333333, 0], [2, 0.5, 0.3333333333, 0], [3, 0.2, 0.3333333333, 0], [4, 0.4, 0.3333333333, 0]],
  [[11, 1, 3, 0.2], [12, 4, 2, 0.2]],
);
const offSegmentGraph = graph(
  [[1, 0, 0.3333333333, 0.001], [2, 0.5, 0.3333333333, 0.001]],
  [[11, 1, 2, 0.2]],
);
const shrunkenGraph = graph(
  [[1, 0, 0.3333333333, 0], [2, 0.5, 0.3333333333, 0]],
  [[11, 1, 2, 0.199]],
);
const nearParallelEqualRadiusGraph = graph(
  [[1, 0, 0.3333333833, 0], [2, 0.5, 0.3333333833, 0]],
  [[11, 1, 2, 0.2]],
);
const nearParallelCompensatedRadiusGraph = graph(
  [[1, 0, 0.3333333833, 0], [2, 0.5, 0.3333333833, 0]],
  [[11, 1, 2, 0.200001]],
);
for (const [label, candidate] of [
  ["removed", removedGraph],
  ["gap", gapGraph],
  ["off-segment", offSegmentGraph],
  ["radius shrink", shrunkenGraph],
] as const) {
  const proof = validateStage7ProvisionalReachabilityMonotonic(baseGraph, candidate);
  assert.equal(proof.eligible, false, `${label} rejects`);
}
assert.equal(
  validateStage7ProvisionalReachabilityMonotonic(baseGraph, nearParallelEqualRadiusGraph).eligible,
  false,
  "near-parallel equal-radius segment rejects",
);
assert.equal(
  validateStage7ProvisionalReachabilityMonotonic(baseGraph, nearParallelCompensatedRadiusGraph).eligible,
  true,
  "near-parallel segment passes only with radius compensation",
);

const malformedGraph = graph(
  [[1, 0, 0.3333333333, 0.6663333337], [2, 0.5, 0.3333333333, 0.6663333337]],
  [[11, 1, 99, 0.2]],
);
assert.equal(validateStage7ProvisionalReachabilityMonotonic(baseGraph, malformedGraph).eligible, false, "dangling edge rejects");
const malformedNodeGraph = graph(
  [[1, Number.NaN, 0.3333333333, 0], [2, 0.5, 0.3333333333, 0]],
  [[11, 1, 2, 0.2]],
);
assert.equal(validateStage7ProvisionalReachabilityMonotonic(baseGraph, malformedNodeGraph).eligible, false, "nonfinite node rejects");

// Baseline: faces 1 and 3 are teal, faces 0, 2 and 4 are orange+red. The
// provisional graph makes faces 0 and 2 teal; face 4 remains red and baseline
// teal is kept. Unequal areas and interleaving make partial-area summation
// observably different from recomputing the full-order mitigated soup.
const positions = new Float32Array([
  ...translatedOverhangTriangle(0, 0.7, 1.1),
  ...translatedOverhangTriangle(2, 1.3, 0.8),
  ...translatedOverhangTriangle(4, 0.9, 1.7),
  ...translatedOverhangTriangle(6, 1.1, 0.6),
  ...translatedOverhangTriangle(8, 0.8, 1.4),
]);
const exactBaseGraph = graph(
  [
    [1, 2, 0.3333333333, 0], [2, 3.3, 0.3333333333, 0],
    [5, 6, 0.3333333333, 0], [6, 7.1, 0.3333333333, 0],
  ],
  [[10, 1, 2, 0.2], [11, 5, 6, 0.2]],
);
const provisionalGraph = graph(
  [
    [1, 2, 0.3333333333, 0], [2, 3.3, 0.3333333333, 0],
    [5, 6, 0.3333333333, 0], [6, 7.1, 0.3333333333, 0],
    [3, 0, 0.3333333333, 0], [4, 0.7, 0.3333333333, 0],
    [7, 4, 0.3333333333, 0], [8, 4.9, 0.3333333333, 0],
  ],
  [[10, 1, 2, 0.2], [11, 5, 6, 0.2], [20, 3, 4, 0.2], [21, 7, 8, 0.3]],
);
const thresholdDeg = 45;
const meshStep = 0.01;
const baseline = diagnoseSurfaceAnglePositions(positions, exactBaseGraph, thresholdDeg, meshStep);
const full = diagnoseSurfaceAnglePositions(positions, provisionalGraph, thresholdDeg, meshStep);
const delta = diagnoseSurfaceAnglePositions(baseline.afterDangerPositions, provisionalGraph, thresholdDeg, meshStep);
const merged = composeStage7ProvisionalDeltaDiagnosis({
  beforeDangerPositions: baseline.beforeDangerPositions,
  afterDangerPositions: baseline.afterDangerPositions,
  mitigatedPositions: baseline.mitigatedPositions,
  metrics: baseline,
}, delta);
assert.ok(merged, "valid delta composes");
assert.ok(sameBits(merged.beforeDangerPositions, full.beforeDangerPositions), "before positions exact-equivalent");
assert.ok(sameBits(merged.afterDangerPositions, full.afterDangerPositions), "after positions exact-equivalent");
assert.ok(sameBits(merged.mitigatedPositions, full.mitigatedPositions), "mitigated positions exact-equivalent");
for (const key of [
  "thresholdDeg", "surfaceArea", "dangerousAreaBefore", "dangerousAreaAfter", "mitigatedArea",
  "dangerousFaceCountBefore", "dangerousFaceCountAfter", "mitigatedFaceCount", "contactTolerance",
] as const) assert.equal(merged[key], full[key], `${key} exact-equivalent`);
assert.equal(baseline.dangerousFaceCountBefore, 5, "baseline before count");
assert.equal(baseline.mitigatedFaceCount, 2, "baseline teal preserved");
assert.equal(delta.mitigatedFaceCount, 2, "orange becomes teal in delta");
assert.equal(merged.dangerousFaceCountAfter, 1, "red remains");
assert.equal(merged.mitigatedFaceCount, 4, "teal count merges");

// The composition and validator are pure and clone all returned buffers.
const baselineBefore = baseline.beforeDangerPositions.slice();
const baselineAfter = baseline.afterDangerPositions.slice();
const baselineMitigated = baseline.mitigatedPositions.slice();
const graphBefore = JSON.stringify(exactBaseGraph);
void composeStage7ProvisionalDeltaDiagnosis({
  beforeDangerPositions: baseline.beforeDangerPositions,
  afterDangerPositions: baseline.afterDangerPositions,
  mitigatedPositions: baseline.mitigatedPositions,
  metrics: baseline,
}, delta);
assert.ok(sameBits(baseline.beforeDangerPositions, baselineBefore), "baseline before immutable");
assert.ok(sameBits(baseline.afterDangerPositions, baselineAfter), "baseline after immutable");
assert.ok(sameBits(baseline.mitigatedPositions, baselineMitigated), "baseline mitigated immutable");
assert.equal(JSON.stringify(exactBaseGraph), graphBefore, "graph immutable");

// Unchanged production-scale topology must take the O(E) same-ID fast path;
// this deliberately exercises 60k edges without entering the bounded split
// scan (which is reserved for at most 128 unmatched planner edges).
const largeEdgeCount = 60_000;
const largeGraph = graph(
  Array.from({ length: largeEdgeCount + 1 }, (_, id) => [id, id, 0, 0] as [number, number, number, number]),
  Array.from({ length: largeEdgeCount }, (_, id) => [id, id, id + 1, 0.2] as [number, number, number, number]),
);
const largeProof = validateStage7ProvisionalReachabilityMonotonic(largeGraph, largeGraph);
assert.equal(largeProof.eligible, true, "60k unchanged graph passes bounded fast path");
assert.equal(largeProof.coveredBaseEdgeCount, largeEdgeCount, "60k edges covered without split scan");

console.log("stage7ProvisionalDeltaRecheck.test.ts: all assertions passed");

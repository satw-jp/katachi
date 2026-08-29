import assert from "node:assert/strict";
import {
  deriveRiskDrivenInternalLattice,
  RISK_DRIVEN_MAX_CANDIDATES_PER_CLUSTER,
  reduceRiskDrivenInternalLatticeOverlayState,
  type RiskDrivenInternalLatticeInput,
} from "./riskDrivenInternalLattice.ts";

function face(...points: [number, number, number][]): number[] {
  return points.flat();
}

// Two nearby downward faces form one spatial cluster. The other faces are
// deliberately far away, with different heights/angles, so cluster order,
// severity components, and candidate length/gain have observable variation.
const positions = new Float32Array([
  ...face([0, 0, 10], [0, 1, 10], [1, 0, 10]),
  ...face([1, 0, 10], [1, 1, 10], [2, 0, 10]),
  ...face([20, 0, 2], [20, 1, 3], [21, 0, 2]),
  ...face([40, 0, 5], [40, 1, 5.2], [41, 0, 5]),
]);
const normals = new Float32Array(positions.length).fill(0);
const sourcePositions = positions.slice();
const sourceNormals = normals.slice();
const input: RiskDrivenInternalLatticeInput = {
  surfacePositions: positions,
  surfaceNormals: normals,
  thresholdDeg: 40,
  meshStep: 1,
  resolution: 48,
};

const result = deriveRiskDrivenInternalLattice(input);
assert.equal(result.status, "current");
if (result.status !== "current") throw new Error(result.reason);
assert.deepEqual(result.clusters.map((cluster) => cluster.id), [0, 1, 2]);
assert.deepEqual(result.clusters.map((cluster) => cluster.faceIds), [[0, 1], [2], [3]]);
assert.equal(result.riskyFaceCount, 4);
assert.equal(result.clusters.length, 3, "nearby faces join while far faces stay separate");
assert.ok(result.candidates.length >= result.clusters.length);
assert.ok(result.candidates.length <= result.clusters.length * RISK_DRIVEN_MAX_CANDIDATES_PER_CLUSTER);
assert.ok(result.clusters.every((cluster) => cluster.faceIds.every((id) => Number.isInteger(id) && id >= 0)));
assert.ok(result.clusters.every((cluster) => cluster.severityComponents.score >= 0 && cluster.severityComponents.score <= 1));
assert.equal(
  Object.values(result.severityDistribution).reduce((sum, count) => sum + count, 0),
  result.clusters.length,
  "severity distribution counts clusters",
);
assert.ok(result.severityDistribution.high + result.severityDistribution.critical > 0);

// Candidate points are selected from the lower half of each cluster and each
// cluster is capped at the small fixed v0 budget.
for (const cluster of result.clusters) {
  const clusterCandidates = result.candidates.filter((candidate) => candidate.riskClusterId === cluster.id);
  assert.ok(clusterCandidates.length <= RISK_DRIVEN_MAX_CANDIDATES_PER_CLUSTER);
  const lowerHalf = cluster.bounds.min.z + (cluster.bounds.max.z - cluster.bounds.min.z) * 0.5 + 1e-6;
  assert.ok(clusterCandidates.every((candidate) => candidate.position.z <= lowerHalf));
  assert.ok(clusterCandidates.every((candidate) => candidate.affectedRiskArea >= 0));
  assert.ok(clusterCandidates.every((candidate) => candidate.remainingRiskArea >= 0));
  assert.ok(clusterCandidates.every((candidate) => candidate.requiredLatticeLength >= input.meshStep));
}

for (let index = 1; index < result.candidates.length; index++) {
  assert.ok(
    result.candidates[index - 1].supportGain >= result.candidates[index].supportGain,
    "candidates are deterministically ranked by supportGain",
  );
}
assert.ok(result.candidates[0].supportGain > 0);
assert.deepEqual([...positions], [...sourcePositions], "position input is not mutated");
assert.deepEqual([...normals], [...sourceNormals], "normal input is not mutated");

const repeat = deriveRiskDrivenInternalLattice(input);
assert.deepEqual(repeat, result, "same buffers and parameters produce byte-stable facts");

const malformed = deriveRiskDrivenInternalLattice({
  ...input,
  surfacePositions: new Float32Array([0, 0, Number.NaN, 0, 1, 0, 1, 0, 0]),
});
assert.equal(malformed.status, "disabled");
assert.deepEqual(malformed.clusters, []);
assert.deepEqual(malformed.candidates, []);

const mismatchedNormals = deriveRiskDrivenInternalLattice({
  ...input,
  surfaceNormals: new Float32Array(3),
});
assert.equal(mismatchedNormals.status, "disabled");
assert.deepEqual(mismatchedNormals.clusters, []);

const noRisk = deriveRiskDrivenInternalLattice({
  ...input,
  thresholdDeg: 90,
  surfacePositions: new Float32Array(face([0, 0, 0], [0, 1, 0], [1, 0, 0])),
  surfaceNormals: new Float32Array(9),
});
assert.equal(noRisk.status, "current");
if (noRisk.status === "current") {
  assert.equal(noRisk.riskyFaceCount, 1, "90 degree face is included at an inclusive threshold");
}

// The upward-continuation heuristic uses the same finite XY cell scale as the
// cluster rule. Widely separated faces therefore do not trigger an all-faces
// scan; this is a deterministic structural regression, not a timing test.
const spreadFaceCount = 256;
const spreadValues: number[] = [];
for (let index = 0; index < spreadFaceCount; index++) {
  const x = index * 10;
  const z = index % 7;
  spreadValues.push(...face([x, 0, z], [x, 1, z], [x + 1, 0, z]));
}
const spread = deriveRiskDrivenInternalLattice({
  surfacePositions: new Float32Array(spreadValues),
  thresholdDeg: 40,
  meshStep: 1,
  resolution: 48,
});
assert.equal(spread.status, "current");
if (spread.status === "current") {
  assert.equal(spread.diagnostics.faceCount, spreadFaceCount);
  assert.ok(
    spread.diagnostics.upwardContinuationCandidateComparisons < spreadFaceCount * 16,
    "finite spatial lookup avoids quadratic all-face upward-continuation comparisons",
  );
}

// Occupied buckets and a connected cluster exercise the non-empty adjacency
// path at a size large enough to catch argument-spread RangeErrors. Every
// square contributes two contiguous downward triangles, so the result is one
// large cluster with real candidate work and non-zero local comparisons.
const denseSide = 64;
const denseValues: number[] = [];
for (let y = 0; y < denseSide; y++) {
  for (let x = 0; x < denseSide; x++) {
    const x0 = x;
    const y0 = y;
    const x1 = x + 1;
    const y1 = y + 1;
    const z = (xx: number, yy: number) => 10 + (xx + yy) * 0.01;
    denseValues.push(
      ...face([x0, y0, z(x0, y0)], [x0, y1, z(x0, y1)], [x1, y0, z(x1, y0)]),
      ...face([x1, y0, z(x1, y0)], [x0, y1, z(x0, y1)], [x1, y1, z(x1, y1)]),
    );
  }
}
const dense = deriveRiskDrivenInternalLattice({
  surfacePositions: new Float32Array(denseValues),
  thresholdDeg: 40,
  meshStep: 1,
  resolution: 48,
});
assert.equal(dense.status, "current");
if (dense.status === "current") {
  assert.equal(dense.diagnostics.faceCount, denseSide * denseSide * 2);
  assert.equal(dense.clusters.length, 1);
  assert.ok(dense.candidates.length > 0 && dense.candidates.length <= RISK_DRIVEN_MAX_CANDIDATES_PER_CLUSTER);
  assert.ok(dense.diagnostics.clusterAdjacencyCandidateComparisons > 0);
  assert.ok(dense.diagnostics.upwardContinuationCandidateComparisons > 0);
  assert.ok(
    dense.diagnostics.upwardContinuationCandidateComparisons < dense.diagnostics.faceCount * 100,
    "occupied spatial buckets keep continuation comparisons finite at dense input size",
  );
}

// A narrow/tall stack is the adversarial shape for a flat XY bucket: every
// face shares the same XY location, but only higher faces satisfy the exact
// continuation predicate. The augmented range tree must prune by subtree
// maxZ instead of scanning all stacked faces for every query.
const stackedFaceCount = 2048;
const stackedValues: number[] = [];
for (let index = 0; index < stackedFaceCount; index++) {
  const z = index * 3;
  stackedValues.push(...face([0, 0, z], [0, 1, z], [1, 0, z]));
}
const stacked = deriveRiskDrivenInternalLattice({
  surfacePositions: new Float32Array(stackedValues),
  thresholdDeg: 40,
  meshStep: 1,
  resolution: 48,
});
assert.equal(stacked.status, "current");
if (stacked.status === "current") {
  assert.equal(stacked.clusters.length, stackedFaceCount, "stack spacing keeps clusters separate");
  assert.ok(stacked.clusters.slice(0, -1).every((cluster) => cluster.severityComponents.upwardContinuationProxy === 1));
  assert.equal(stacked.clusters.at(-1)?.severityComponents.upwardContinuationProxy, 0);
  assert.ok(
    stacked.diagnostics.upwardContinuationCandidateComparisons < stackedFaceCount * 64,
    "subtree maxZ pruning keeps vertically stacked continuation queries bounded",
  );
}

const overlayOn = { factsCurrent: true, enabled: true } as const;
assert.deepEqual(
  reduceRiskDrivenInternalLatticeOverlayState(overlayOn, "mesh-replaced"),
  overlayOn,
  "mesh replacement preserves current enabled presentation ownership",
);
assert.deepEqual(
  reduceRiskDrivenInternalLatticeOverlayState(overlayOn, "toggle-off"),
  { factsCurrent: true, enabled: false },
  "OFF fully clears the presentation without staling current facts",
);
assert.deepEqual(
  reduceRiskDrivenInternalLatticeOverlayState(overlayOn, "diagnosis-invalidated"),
  { factsCurrent: false, enabled: false },
  "diagnosis invalidation clears both facts ownership and overlay state",
);

console.log("SKIN Risk-Driven Internal Lattice v0 tests: deterministic clusters/candidates/fail-closed passed");

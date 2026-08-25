import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupportForest,
  reinforceDryWebGraph,
  retainedVerticalMembers,
  uniformLowestSurfaceLeaves,
  type SupportForestOptions,
} from "./branchingSupport.ts";

const OPTIONS: SupportForestOptions = {
  mode: "branching",
  plateZMm: 0,
  objectLiftMm: 1.2,
  tipRadiusMm: 0.35,
  trunkMinimumRadiusMm: 0.7,
  loadWidening: 0.08,
  maximumUnsupportedLengthMm: 12,
  branchAngleDeg: 40,
  footRadiusMm: 1.2,
  raftRadiusMm: 0.8,
};

test("branching forest merges leaves, preserves fine tips and bounds every unsupported member", () => {
  const forest = buildSupportForest([
    { id: "a", xMm: -3, yMm: 0, zMm: 34, kind: "outside" },
    { id: "b", xMm: 3, yMm: 0, zMm: 35, kind: "outside" },
    { id: "c", xMm: 5, yMm: 2, zMm: 31, kind: "outside" },
  ], OPTIONS);
  assert.ok(forest.stats.branchCount > 0);
  assert.ok(forest.stats.rootCount > 0);
  assert.equal(forest.stats.unsupportedLengthViolationCount, 0);
  assert.ok(forest.stats.maximumMemberLengthMm <= OPTIONS.maximumUnsupportedLengthMm + 1e-6);
  assert.ok(forest.stats.maximumBranchAngleDeg <= OPTIONS.branchAngleDeg + 1e-6);
  assert.ok(forest.members.filter((member) => member.kind === "tip")
    .every((member) => member.startRadiusMm === OPTIONS.tipRadiusMm && member.endRadiusMm === OPTIONS.tipRadiusMm));
  assert.ok(forest.members.filter((member) => member.kind === "branch" || member.kind === "trunk")
    .every((member) => Math.max(member.startRadiusMm, member.endRadiusMm) >= OPTIONS.trunkMinimumRadiusMm));
});

test("a lone leaf receives a braced bipod instead of a long isolated post", () => {
  const forest = buildSupportForest([
    { id: "solo", xMm: 0, yMm: 0, zMm: 42, kind: "outside" },
  ], OPTIONS);
  assert.equal(forest.stats.braceCount, 2);
  assert.equal(forest.stats.rootCount, 2);
  assert.equal(forest.stats.unsupportedLengthViolationCount, 0);
  assert.ok(forest.stats.maximumBranchAngleDeg <= OPTIONS.branchAngleDeg + 1e-6);
});

test("load widening makes a shared downstream trunk thicker than its contact tips", () => {
  const forest = buildSupportForest(Array.from({ length: 6 }, (_, index) => ({
    id: String(index), xMm: (index - 2.5) * 1.4, yMm: index % 2, zMm: 32 + index, kind: "outside" as const,
  })), OPTIONS);
  const thickest = Math.max(...forest.members.filter((member) => member.kind !== "raft")
    .flatMap((member) => [member.startRadiusMm, member.endRadiusMm]));
  assert.ok(thickest > OPTIONS.trunkMinimumRadiusMm);
  assert.ok(thickest > OPTIONS.tipRadiusMm * 2);
});

test("lowest-surface cradle sampling is uniform by XY cell and stays inside the Z band", () => {
  const triangles = new Float32Array([
    0, 0, 0, 1, 0, 0.2, 0, 1, 0.1,
    0.2, 0.2, 0.4, 1.2, 0.2, 0.4, 0.2, 1.2, 0.4,
    5, 5, 3, 6, 5, 3, 5, 6, 3,
  ]);
  const leaves = uniformLowestSurfaceLeaves(triangles, 2, 0.6);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].kind, "cradle");
  assert.ok(leaves[0].zMm <= 0.6);
});

test("retained base-volume verticals remain a separately typed system", () => {
  const members = retainedVerticalMembers([{
    id: "inside", source: "diagnosed-face", sourceIndex: 0, siteIndex: 0,
    classification: "inside", positionMm: { xMm: 2, yMm: 3, zMm: 8 }, nearestLowerSurfaceDistanceMm: 4,
  }], 0.75);
  assert.equal(members.length, 1);
  assert.equal(members[0].kind, "retained-vertical");
  assert.deepEqual(members[0].start, { xMm: 2, yMm: 3, zMm: 4 });
});

test("Dry Web enforces physical diameter, inserts intermediate nodes and thickens junctions", () => {
  const reinforced = reinforceDryWebGraph({
    kind: "targetedGrid",
    nodes: [
      { id: 0, position: { x: 0, y: 0, z: 0 }, radius: 0.1 },
      { id: 1, position: { x: 0, y: 0, z: 30 }, radius: 0.1 },
    ],
    edges: [{ id: 0, start: 0, end: 1, radius: 0.1 }],
    stats: { inputPoints: 2, delaunayTetrahedra: 0, candidateEdges: 1, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
  }, 1, 1.6, 10)!;
  assert.equal(reinforced.edges.length, 3);
  assert.equal(reinforced.nodes.length, 4);
  assert.ok(reinforced.edges.every((edge) => edge.radius >= 0.8));
  assert.ok(reinforced.nodes.every((node) => node.radius >= 1));
});

test("Vertical comparison mode retains independent columns without branching", () => {
  const forest = buildSupportForest([
    { id: "a", xMm: -2, yMm: 0, zMm: 20, kind: "outside" },
    { id: "b", xMm: 2, yMm: 0, zMm: 20, kind: "outside" },
  ], { ...OPTIONS, mode: "vertical", objectLiftMm: 0 });
  assert.equal(forest.stats.branchCount, 0);
  assert.equal(forest.stats.braceCount, 0);
  assert.equal(forest.stats.rootCount, 2);
  assert.equal(forest.stats.raftCount, 0);
  assert.ok(forest.stats.unsupportedLengthViolationCount > 0);
});

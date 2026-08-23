import assert from "node:assert/strict";
import type { Patch, PatchAdjacencyEdge } from "./field.ts";
import { proposeNGroups, validateNGroups } from "./nPartition.ts";

const patches: Patch[] = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  shape: "coin",
  points: [{ x: index, y: 0, z: 0, r: 0.6 }],
}));
const edges: PatchAdjacencyEdge[] = Array.from({ length: 8 }, (_, index) => ({
  aId: index + 1,
  bId: index + 2,
  distance: -0.1,
  reason: "touching",
}));

const three = proposeNGroups(patches, edges, 3);
assert.equal(three.groups.length, 3);
assert.deepEqual([...three.seedIds].sort((a, b) => a - b), [1, 5, 9]);
assert.deepEqual(three.groups.flat().sort((a, b) => a - b), patches.map((patch) => patch.id));
assert.ok(three.groups.every((group) => group.length > 0));
validateNGroups(patches, three.groups);

const six = proposeNGroups(patches, edges, 6);
assert.equal(six.groups.length, 6);
assert.equal(new Set(six.groups.flat()).size, 9);
assert.ok(six.groups.every((group) => group.length > 0));

const disconnected = proposeNGroups(patches, [], 3);
assert.equal(disconnected.groups.length, 3);
assert.deepEqual(disconnected.groups.flat().sort((a, b) => a - b), patches.map((patch) => patch.id));

assert.throws(() => validateNGroups(patches, [[1, 2], [2, 3]]), "duplicate groups must fail");
assert.throws(() => validateNGroups(patches, [[1], [2]]), "unassigned patches must fail");

console.log("N partition tests: 11 passed");

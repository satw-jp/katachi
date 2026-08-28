import assert from "node:assert/strict";
import { createArtworkGraph } from "./artworkGraph.ts";
import { createSurfaceGraph } from "./surfaceGraph.ts";
import type { Patch } from "./field.ts";
import {
  cloneDryWebArtworkGraphPatches,
  inspectDryWebArtworkGraphBoundary,
} from "./dryWebArtworkGraphBoundary.ts";

function makePatch(id: number): Patch {
  return {
    id,
    shape: "coin",
    points: [{ x: id, y: id + 0.25, z: id + 0.5, r: 0.35 }],
  };
}

const patchSetRevision = 7;
const source = createSurfaceGraph([makePatch(12), makePatch(3)], patchSetRevision);
const snapshot = createArtworkGraph(source, { revision: patchSetRevision });
const sourceKey = "canonical-patch-facts-plus-revision";

const missing = inspectDryWebArtworkGraphBoundary({
  snapshot: null,
  snapshotSourceKey: null,
  currentSourceKey: sourceKey,
  currentPatchSetRevision: patchSetRevision,
});
assert.equal(missing.status, "missing");
assert.equal(missing.canStart, false);
assert.match(missing.reason, /現在のSurfaceをArtwork Graph化/);

const missingKey = inspectDryWebArtworkGraphBoundary({
  snapshot,
  snapshotSourceKey: null,
  currentSourceKey: sourceKey,
  currentPatchSetRevision: patchSetRevision,
});
assert.equal(missingKey.status, "missing");
assert.equal(missingKey.canStart, false);

const current = inspectDryWebArtworkGraphBoundary({
  snapshot,
  snapshotSourceKey: sourceKey,
  currentSourceKey: sourceKey,
  currentPatchSetRevision: patchSetRevision,
});
assert.equal(current.status, "current");
assert.equal(current.canStart, true);

const sourceMismatch = inspectDryWebArtworkGraphBoundary({
  snapshot,
  snapshotSourceKey: sourceKey,
  currentSourceKey: sourceKey + "-changed",
  currentPatchSetRevision: patchSetRevision,
});
assert.equal(sourceMismatch.status, "stale");
assert.equal(sourceMismatch.canStart, false);

const revisionMismatch = inspectDryWebArtworkGraphBoundary({
  snapshot,
  snapshotSourceKey: sourceKey,
  currentSourceKey: sourceKey,
  currentPatchSetRevision: patchSetRevision + 1,
});
assert.equal(revisionMismatch.status, "stale");
assert.equal(revisionMismatch.canStart, false);

const extracted = cloneDryWebArtworkGraphPatches(snapshot);
assert.deepEqual(extracted.map((patch) => patch.id), snapshot.surfaceDraft.nodes.map((node) => node.patch.id));
assert.deepEqual(extracted, snapshot.surfaceDraft.nodes.map((node) => node.patch));
assert.notStrictEqual(extracted[0], snapshot.surfaceDraft.nodes[0].patch);
assert.notStrictEqual(extracted[0].points, snapshot.surfaceDraft.nodes[0].patch.points);
extracted[0].points[0].x += 100;
assert.notEqual(extracted[0].points[0].x, snapshot.surfaceDraft.nodes[0].patch.points[0].x);
assert.deepEqual(
  cloneDryWebArtworkGraphPatches(snapshot),
  snapshot.surfaceDraft.nodes.map((node) => node.patch),
);

console.log("dry Web Artwork Graph boundary tests: missing/current/stale/ordered clone passed");

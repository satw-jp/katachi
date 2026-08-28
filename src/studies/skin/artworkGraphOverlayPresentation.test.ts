import assert from "node:assert/strict";
import { createArtworkGraph } from "./artworkGraph.ts";
import {
  ARTWORK_GRAPH_CURRENT_MARKER_COLOR,
  ARTWORK_GRAPH_STALE_MARKER_COLOR,
  createArtworkGraphOverlayPresentation,
  representativePatchPoint,
} from "./artworkGraphOverlayPresentation.ts";
import type { Patch } from "./field.ts";
import { createSurfaceGraph } from "./surfaceGraph.ts";

function makePatch(id: number, points = [{ x: id, y: id + 0.25, z: id + 0.5, r: 0.35 }]): Patch {
  return { id, shape: "coin", points };
}

const source = createSurfaceGraph([makePatch(12), makePatch(3)], 7);
const snapshot = createArtworkGraph(source, { revision: 7 });
const snapshotBefore = JSON.stringify(snapshot);

const current = createArtworkGraphOverlayPresentation(snapshot, "current", true);
assert.equal(current.status, "current");
assert.equal(current.markers.length, snapshot.surfaceDraft.nodes.length);
assert.deepEqual(current.markers.map((marker) => marker.nodeId), snapshot.surfaceDraft.nodes.map((node) => node.id));
assert.ok(current.markers.every((marker) => marker.status === "current"));
assert.ok(current.markers.every((marker) => marker.color === ARTWORK_GRAPH_CURRENT_MARKER_COLOR));
assert.deepEqual(current.markers.map((marker) => marker.position), snapshot.surfaceDraft.nodes.map((node) => ({
  x: node.patch.points[0].x,
  y: node.patch.points[0].y,
  z: node.patch.points[0].z,
})));

const stale = createArtworkGraphOverlayPresentation(snapshot, "stale", true);
assert.equal(stale.status, "stale");
assert.equal(stale.markers.length, current.markers.length);
assert.ok(stale.markers.every((marker) => marker.status === "stale"));
assert.ok(stale.markers.every((marker) => marker.color === ARTWORK_GRAPH_STALE_MARKER_COLOR));

const anchored = makePatch(21, [
  { x: 9, y: 8, z: 7, r: 0.35 },
  { x: -9, y: -8, z: -7, r: 0.35 },
]);
// A solid coin keeps its authored points[0] anchor.
assert.deepEqual(representativePatchPoint(anchored), { x: 9, y: 8, z: 7 });

// An annular coin has no distinguished anchor: use every finite shape point.
const annularCoin = {
  ...makePatch(23, [
    { x: 10, y: 0, z: 0, r: 0.35 },
    { x: 0, y: 4, z: 2, r: 0.35 },
    { x: 2, y: 2, z: 4, r: 0.35 },
  ]),
  motifParams: { coinHoleRatio: 0.5 } as NonNullable<Patch["motifParams"]>,
};
assert.deepEqual(representativePatchPoint(annularCoin), { x: 4, y: 2, z: 2 });

// Rings likewise use their shape centroid rather than the first node.
const flatRing = {
  ...makePatch(24, [
    { x: 12, y: 0, z: 0, r: 0.35 },
    { x: 0, y: 6, z: 0, r: 0.35 },
  ]),
  shape: "flatRing" as const,
};
assert.deepEqual(representativePatchPoint(flatRing), { x: 6, y: 3, z: 0 });

// Flower bridge/connector points belong to relations, not the motif marker.
const flower = {
  ...makePatch(25, [
    { x: 2, y: 0, z: 2, r: 0.35, role: "motif" },
    { x: 0, y: 4, z: 4, r: 0.35, role: "motif" },
    { x: 100, y: 100, z: 100, r: 0.1, role: "bridge" },
    { x: -100, y: -100, z: -100, r: 0.1, role: "surfaceConnector" },
  ]),
  shape: "flower" as const,
};
assert.deepEqual(representativePatchPoint(flower), { x: 1, y: 2, z: 3 });
const legacyFlower = {
  ...makePatch(27, [
    { x: 10, y: 0, z: 0, r: 0.1, role: "bridge" },
    { x: 0, y: 10, z: 0, r: 0.1, role: "surfaceConnector" },
  ]),
  shape: "flower" as const,
};
assert.deepEqual(representativePatchPoint(legacyFlower), { x: 5, y: 5, z: 0 });

// ringPrimary metadata identifies authored ring nodes; false entries are
// continuity connectors and do not pull the marker toward the connector.
const ring3d = {
  ...makePatch(26, [
    { x: 2, y: 2, z: 2, r: 0.35, ringPrimary: true },
    { x: 4, y: 4, z: 4, r: 0.35, ringPrimary: true },
    { x: 100, y: 100, z: 100, r: 0.1, ringPrimary: false },
  ]),
  shape: "ring3d" as const,
};
assert.deepEqual(representativePatchPoint(ring3d), { x: 3, y: 3, z: 3 });
const legacyRing3d = {
  ...makePatch(28, [
    { x: 8, y: 0, z: 0, r: 0.35 },
    { x: 0, y: 8, z: 0, r: 0.35 },
  ]),
  shape: "ring3d" as const,
};
assert.deepEqual(representativePatchPoint(legacyRing3d), { x: 4, y: 4, z: 0 });

const malformed = {
  id: 22,
  shape: "coin",
  points: [
    { x: Number.NaN, y: 2, z: 3, r: 0.3 },
    { x: 4, y: 6, z: 8, r: 0.3 },
    { x: 6, y: 10, z: 12, r: 0.3 },
  ],
} as unknown as Patch;
assert.deepEqual(representativePatchPoint(malformed), { x: 5, y: 8, z: 10 });
assert.deepEqual(representativePatchPoint({ shape: "coin", motifParams: undefined, points: [] }), { x: 0, y: 0, z: 0 });

const returnedPosition = current.markers[0].position;
returnedPosition.x += 100;
assert.equal(JSON.stringify(snapshot), snapshotBefore);
const off = createArtworkGraphOverlayPresentation(snapshot, "stale", false);
assert.equal(off.enabled, false);
assert.equal(off.status, "stale");
assert.deepEqual(off.markers, []);
assert.equal(JSON.stringify(snapshot), snapshotBefore);

const missing = createArtworkGraphOverlayPresentation(null, "missing", true);
assert.equal(missing.status, "missing");
assert.deepEqual(missing.markers, []);

console.log("Artwork Graph overlay presentation tests: count/anchor/fallback/immutability/current-stale/OFF passed");

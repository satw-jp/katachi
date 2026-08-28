import assert from "node:assert/strict";
import { createArtworkGraph } from "./artworkGraph.ts";
import {
  createArtworkGraphOverlayPresentation,
  representativePatchPoint,
} from "./artworkGraphOverlayPresentation.ts";
import {
  createDryWebContactFloorPresentation,
  type DryWebContactFloorPresentation,
} from "./dryWebContactFloorPresentation.ts";
import {
  createDryWebContactFloorOverlayPresentation,
  disableDryWebContactFloorOverlay,
  type DryWebContactFloorOverlayPresentationInput,
} from "./dryWebContactFloorOverlayPresentation.ts";
import type { Patch } from "./field.ts";
import type { TargetedGridContactFacts, TargetedGridContactFloorFacts } from "./targetedGrid.ts";
import { createSurfaceGraph } from "./surfaceGraph.ts";

function makePatch(id: number, points = [{ x: id, y: id + 0.25, z: id + 0.5, r: 0.2 }]): Patch {
  return { id, shape: "coin", points };
}

const patches = [
  makePatch(1),
  makePatch(2),
  makePatch(3),
  makePatch(4),
];
const snapshot = createArtworkGraph(createSurfaceGraph(patches, 7), { revision: 7 });
const contactFacts: TargetedGridContactFacts = {
  usefulPatchCount: 4,
  componentCount: 2,
  mainComponentKey: "main",
  mainComponentSize: 3,
  patches: [
    { patchId: 1, contactNodeIds: [], contactCount: 0, componentKey: "main", componentSize: 3 },
    { patchId: 2, contactNodeIds: [], contactCount: 0, componentKey: "main", componentSize: 3 },
    { patchId: 3, contactNodeIds: [1, 2, 3], contactCount: 3, componentKey: "outside", componentSize: 1 },
    { patchId: 4, contactNodeIds: [4], contactCount: 1, componentKey: "main", componentSize: 3 },
  ],
};
const floorFacts: TargetedGridContactFloorFacts = {
  requiredContacts: 3,
  mainComponentKey: "main",
  patches: [
    { patchId: 1, selectedDistinctContactCount: 0, candidateLinkCount: 2, candidateDistinctContactCount: 2, componentKey: "main" },
    { patchId: 2, selectedDistinctContactCount: 0, candidateLinkCount: 3, candidateDistinctContactCount: 2, componentKey: "main" },
    { patchId: 3, selectedDistinctContactCount: 3, candidateLinkCount: 3, candidateDistinctContactCount: 3, componentKey: "outside" },
    { patchId: 4, selectedDistinctContactCount: 1, candidateLinkCount: 3, candidateDistinctContactCount: 3, componentKey: "main" },
  ],
};
const floorPresentation = createDryWebContactFloorPresentation({
  current: true,
  running: false,
  stale: false,
  facts: floorFacts,
  contactFacts,
  requiredContacts: 3,
});
assert.equal(floorPresentation.available, true);

function input(overrides: Partial<DryWebContactFloorOverlayPresentationInput> = {}): DryWebContactFloorOverlayPresentationInput {
  return {
    current: true,
    running: false,
    stale: false,
    surfaceContextVisible: true,
    snapshot,
    contactFloor: floorPresentation,
    category: "candidateShortage",
    enabled: true,
    ...overrides,
  };
}

const before = JSON.stringify({ snapshot, floorPresentation });
const shortage = createDryWebContactFloorOverlayPresentation(input());
assert.equal(shortage.state, "current");
assert.equal(shortage.available, true);
assert.equal(shortage.affectedCount, 1);
assert.equal(shortage.markers.length, 1);
assert.deepEqual(shortage.markers[0]?.position, representativePatchPoint(snapshot.surfaceDraft.nodes[0].patch));
assert.equal(shortage.markers[0]?.patchId, 1);
assert.equal(JSON.stringify({ snapshot, floorPresentation }), before, "overlay does not mutate snapshot or facts");

for (const category of ["duplicateContactPositions", "outsideMainComponent", "plannerUnresolved"] as const) {
  const presentation = createDryWebContactFloorOverlayPresentation(input({ category }));
  assert.equal(presentation.available, true);
  assert.equal(presentation.markers.length, 1);
  assert.equal(presentation.markers[0]?.category, category);
}
assert.equal(createDryWebContactFloorOverlayPresentation(input({ category: "satisfied" })).available, false);
assert.equal(createDryWebContactFloorOverlayPresentation(input({ category: null })).available, false);
assert.equal(createDryWebContactFloorOverlayPresentation(input({ enabled: false })).markers.length, 0, "OFF clears marker instances");
assert.equal(disableDryWebContactFloorOverlay(shortage).markers.length, 0, "explicit OFF clears selected category");

for (const flags of [
  { current: false, running: true, stale: false },
  { current: false, running: false, stale: true },
  { current: false, running: false, stale: false },
] as const) {
  const result = createDryWebContactFloorOverlayPresentation(input(flags));
  assert.equal(result.available, false);
  assert.equal(result.markers.length, 0);
}
assert.equal(createDryWebContactFloorOverlayPresentation(input({ surfaceContextVisible: false })).available, false);

const zeroCategory = {
  ...floorPresentation,
  categoryCounts: { ...floorPresentation.categoryCounts!, candidateShortage: 0 },
  allCategoryPatchIds: { ...floorPresentation.allCategoryPatchIds!, candidateShortage: [] },
};
assert.equal(createDryWebContactFloorOverlayPresentation(input({ contactFloor: zeroCategory })).available, false);
const missingPatch = {
  ...floorPresentation,
  allCategoryPatchIds: { ...floorPresentation.allCategoryPatchIds!, candidateShortage: [99] },
};
assert.equal(createDryWebContactFloorOverlayPresentation(input({ contactFloor: missingPatch })).available, false);
const duplicateSnapshot = {
  ...snapshot,
  surfaceDraft: {
    ...snapshot.surfaceDraft,
    nodes: [snapshot.surfaceDraft.nodes[0], snapshot.surfaceDraft.nodes[0]],
  },
} as typeof snapshot;
assert.equal(createDryWebContactFloorOverlayPresentation(input({ snapshot: duplicateSnapshot })).available, false);
assert.equal(createDryWebContactFloorOverlayPresentation(input({ contactFloor: null })).available, false);

const first = createDryWebContactFloorOverlayPresentation(input());
const second = createDryWebContactFloorOverlayPresentation(input());
assert.deepEqual(second, first, "same current snapshot/category produces deterministic markers");
const currentGraphOverlay = createArtworkGraphOverlayPresentation(snapshot, "current", true);
assert.deepEqual(first.markers[0]?.position, currentGraphOverlay.markers[0]?.position, "shape-aware anchor rule is shared");

console.log("dryWebContactFloorOverlayPresentation: exact category markers, canonical anchors, fail-closed states, deterministic output, and OFF cleanup passed");

import assert from "node:assert/strict";
import {
  createDryWebContactFloorPresentation,
} from "./dryWebContactFloorPresentation.ts";
import type { TargetedGridContactFacts, TargetedGridContactFloorFacts } from "./targetedGrid.ts";

const mainComponentKey = "main";
const contactFacts: TargetedGridContactFacts = {
  usefulPatchCount: 17,
  componentCount: 2,
  mainComponentKey,
  mainComponentSize: 16,
  patches: Array.from({ length: 17 }, (_value, index) => {
    const patchId = index + 1;
    const contactCount = patchId === 2 || patchId === 3 || patchId === 6 || patchId === 7
      || patchId === 8 || patchId === 9 || patchId === 10 || patchId === 11 || patchId === 12
      || patchId === 13 || patchId === 14 || patchId === 15 || patchId === 16 || patchId === 17
      ? 0
      : patchId === 5
        ? 1
        : 3;
    return {
      patchId,
      contactNodeIds: Array.from({ length: contactCount }, (_node, nodeIndex) => patchId * 100 + nodeIndex),
      contactCount,
      componentKey: patchId === 4 ? "outside" : mainComponentKey,
      componentSize: patchId === 4 ? 1 : 16,
    };
  }),
};

const floorFacts: DryWebContactFloorFacts = {
  requiredContacts: 3,
  mainComponentKey,
  patches: [
    { patchId: 1, selectedDistinctContactCount: 3, candidateLinkCount: 3, candidateDistinctContactCount: 3, componentKey: mainComponentKey },
    { patchId: 2, selectedDistinctContactCount: 0, candidateLinkCount: 2, candidateDistinctContactCount: 2, componentKey: mainComponentKey },
    { patchId: 3, selectedDistinctContactCount: 0, candidateLinkCount: 3, candidateDistinctContactCount: 2, componentKey: mainComponentKey },
    { patchId: 4, selectedDistinctContactCount: 3, candidateLinkCount: 4, candidateDistinctContactCount: 4, componentKey: "outside" },
    { patchId: 5, selectedDistinctContactCount: 1, candidateLinkCount: 3, candidateDistinctContactCount: 3, componentKey: mainComponentKey },
    ...Array.from({ length: 12 }, (_value, index) => ({
      patchId: index + 6,
      selectedDistinctContactCount: 0,
      candidateLinkCount: 2,
      candidateDistinctContactCount: 2,
      componentKey: mainComponentKey,
    })),
  ],
};

const input = {
  current: true,
  running: false,
  stale: false,
  facts: floorFacts,
  contactFacts,
  requiredContacts: 3,
};
const before = JSON.stringify(input);
const current = createDryWebContactFloorPresentation(input);
assert.equal(current.state, "current");
assert.equal(current.available, true);
assert.deepEqual(current.categoryCounts, {
  satisfied: 1,
  candidateShortage: 13,
  duplicateContactPositions: 1,
  outsideMainComponent: 1,
  plannerUnresolved: 1,
});
assert.deepEqual(current.categoryPatchIds!.candidateShortage, [2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
assert.equal(current.categoryPatchIdsTruncated!.candidateShortage, true);
assert.deepEqual(current.categoryPatchIds!.duplicateContactPositions, [3]);
assert.deepEqual(current.categoryPatchIds!.outsideMainComponent, [4]);
assert.deepEqual(current.categoryPatchIds!.plannerUnresolved, [5]);
assert.match(current.reason, /planner未達/);
assert.equal(JSON.stringify(input), before, "presentation does not mutate generator facts");

for (const [state, flags] of [
  ["running", { current: false, running: true, stale: false }],
  ["stale", { current: false, running: false, stale: true }],
  ["missing", { current: false, running: false, stale: false }],
] as const) {
  const result = createDryWebContactFloorPresentation({ ...input, ...flags });
  assert.equal(result.state, state);
  assert.equal(result.categoryCounts, null);
  assert.equal(result.categoryPatchIds, null);
}

assert.equal(
  createDryWebContactFloorPresentation({ ...input, requiredContacts: 2 }).state,
  "missing",
  "a slider/generation contact-floor mismatch fails closed",
);
assert.equal(
  createDryWebContactFloorPresentation({ ...input, facts: { ...floorFacts, patches: floorFacts.patches.slice(1) } }).state,
  "missing",
  "incomplete patch coverage fails closed",
);
assert.equal(
  createDryWebContactFloorPresentation({
    ...input,
    facts: {
      ...floorFacts,
      patches: floorFacts.patches.map((fact) => fact.patchId === 1
        ? { ...fact, selectedDistinctContactCount: 2 }
        : fact),
    },
  }).state,
  "missing",
  "selected count mismatch with canonical contact facts fails closed",
);

console.log("dryWebContactFloorPresentation: five-category precedence, capped IDs, current gating, planner warning, and immutability passed");

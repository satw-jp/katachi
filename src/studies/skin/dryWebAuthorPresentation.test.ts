import assert from "node:assert/strict";
import { DEFAULT_SKIN_PARAMS } from "./field.ts";
import { createEmptyState, record, replay, serializeRecipe, type SkinHistoryEntry } from "./history.ts";
import {
  dryWebAuthorPresentation,
  dryWebContactBinKey,
  dryWebContactBins,
  normalizeDryWebRequiredContacts,
} from "./dryWebAuthorPresentation.ts";
import type { TargetedGridContactFacts } from "./targetedGrid.ts";
import {
  dryWebContactPresentationCanReapply,
  dryWebPreviewTerminalDecision,
  isDryWebRequiredContactsOnlyChange,
} from "./dryWebLifecycle.ts";

assert.equal(DEFAULT_SKIN_PARAMS.dryWebRequiredContacts, 3);
assert.equal(normalizeDryWebRequiredContacts(undefined), 3);
assert.equal(normalizeDryWebRequiredContacts(0), 1);
assert.equal(normalizeDryWebRequiredContacts(99), 3);
assert.equal(dryWebContactBinKey(0), "zero");
assert.equal(dryWebContactBinKey(1), "one");
assert.equal(dryWebContactBinKey(2), "two");
assert.equal(dryWebContactBinKey(3), "threeOrMore");

// Legacy history has no new contact-count operation; replay starts from the
// default and therefore remains explicitly three.
const legacy = createEmptyState();
const legacyEntries: SkinHistoryEntry[] = [];
record(legacyEntries, legacy, "setMode", { mode: "plate" });
const replayed = replay(JSON.parse(serializeRecipe(legacyEntries)).entries as SkinHistoryEntry[]);
assert.equal(replayed.skinParams.dryWebRequiredContacts, 3);

const thresholdBefore = createEmptyState();
const thresholdAfter = createEmptyState();
thresholdBefore.skinParams.dryWebRequiredContacts = 3;
thresholdAfter.skinParams.dryWebRequiredContacts = 1;
assert.equal(isDryWebRequiredContactsOnlyChange(thresholdBefore, thresholdAfter), true);
thresholdAfter.skinParams.internalRadius += 0.01;
assert.equal(isDryWebRequiredContactsOnlyChange(thresholdBefore, thresholdAfter), false);
assert.equal(isDryWebRequiredContactsOnlyChange(thresholdBefore, thresholdBefore), false);
assert.equal(dryWebContactPresentationCanReapply("none"), true);
assert.equal(dryWebContactPresentationCanReapply("dryWeb"), true);
assert.equal(dryWebContactPresentationCanReapply("partition"), false);
assert.equal(dryWebContactPresentationCanReapply("nPartition"), false);
assert.equal(dryWebContactPresentationCanReapply("contactStrength"), false);

assert.equal(dryWebPreviewTerminalDecision("success").status, "current");
assert.equal(dryWebPreviewTerminalDecision("success").clearPreview, false);
assert.equal(dryWebPreviewTerminalDecision("stale").status, "stale");
assert.equal(dryWebPreviewTerminalDecision("stale").clearPreview, true);
assert.equal(dryWebPreviewTerminalDecision("message-error").status, "error");
assert.equal(dryWebPreviewTerminalDecision("message-error").clearPreview, true);
assert.equal(dryWebPreviewTerminalDecision("onerror").status, "error");
assert.equal(dryWebPreviewTerminalDecision("onerror").clearPreview, true);
assert.equal(dryWebPreviewTerminalDecision("cancel").status, "cancelled");
assert.equal(dryWebPreviewTerminalDecision("cancel").clearPreview, true);

const presentation = dryWebAuthorPresentation(undefined, 17);
assert.equal(presentation.status, "uncomputed");
assert.equal(presentation.hideRemovableSupportOverlay, true);
assert.equal(presentation.hideSurfaceAngleOverlay, true);
assert.equal(presentation.requiredContacts, 3);
assert.equal(presentation.patchCount, 17);
assert.match(presentation.text, /未計算 \/ gray/);
assert.match(presentation.text, /support-derived provisional/);
assert.match(presentation.text, /必要接触数 3/);
assert.match(presentation.text, /Surface Pattern 17要素/);

const passFacts: TargetedGridContactFacts = {
  usefulPatchCount: 3,
  componentCount: 1,
  mainComponentKey: "4,8,12",
  mainComponentSize: 3,
  patches: [
    { patchId: 4, contactNodeIds: [1, 2], contactCount: 2, componentKey: "4,8,12", componentSize: 3 },
    { patchId: 8, contactNodeIds: [3, 4], contactCount: 2, componentKey: "4,8,12", componentSize: 3 },
    { patchId: 12, contactNodeIds: [5, 6], contactCount: 2, componentKey: "4,8,12", componentSize: 3 },
  ],
};
const pass = dryWebAuthorPresentation(2, 99, passFacts);
assert.equal(pass.status, "pass");
assert.equal(pass.totalPatchCount, 3);
assert.equal(pass.passingPatchCount, 3);
assert.equal(pass.insufficientPatchCount, 0);
assert.equal(pass.mainComponentPatchCount, 3);
assert.deepEqual(pass.insufficientPatchIds, []);
assert.deepEqual(pass.contactBins?.map(({ key, count, passesThreshold }) => ({ key, count, passesThreshold })), [
  { key: "zero", count: 0, passesThreshold: false },
  { key: "one", count: 0, passesThreshold: false },
  { key: "two", count: 3, passesThreshold: true },
  { key: "threeOrMore", count: 0, passesThreshold: true },
]);
assert.match(pass.text, /Artwork Integration preview: pass/);
assert.match(pass.text, /generator facts only/);
assert.match(pass.text, /target source=support-derived provisional/);

const warningFacts: TargetedGridContactFacts = {
  usefulPatchCount: 5,
  componentCount: 2,
  mainComponentKey: "1,2,3",
  mainComponentSize: 3,
  patches: [
    { patchId: 1, contactNodeIds: [7, 8], contactCount: 2, componentKey: "1,2,3", componentSize: 3 },
    { patchId: 2, contactNodeIds: [9], contactCount: 1, componentKey: "1,2,3", componentSize: 3 },
    { patchId: 3, contactNodeIds: [10, 11], contactCount: 2, componentKey: "1,2,3", componentSize: 3 },
    { patchId: 4, contactNodeIds: [12, 13, 14], contactCount: 3, componentKey: "4,5", componentSize: 2 },
    { patchId: 5, contactNodeIds: [], contactCount: 0, componentKey: "4,5", componentSize: 2 },
  ],
};
const warning = dryWebAuthorPresentation(2, 5, warningFacts);
assert.equal(warning.status, "warning");
assert.equal(warning.totalPatchCount, 5);
assert.equal(warning.passingPatchCount, 2);
assert.equal(warning.insufficientPatchCount, 3);
assert.equal(warning.mainComponentPatchCount, 3);
assert.deepEqual(warning.insufficientPatchIds, [2, 4, 5]);
assert.deepEqual(warning.contactBins?.map(({ key, count, passesThreshold }) => ({ key, count, passesThreshold })), [
  { key: "zero", count: 1, passesThreshold: false },
  { key: "one", count: 1, passesThreshold: false },
  { key: "two", count: 2, passesThreshold: true },
  { key: "threeOrMore", count: 1, passesThreshold: true },
]);
assert.match(warning.text, /main component 3 \/ 5/);
assert.match(warning.text, /insufficient patch IDs 2, 4, 5/);

const bounded = dryWebAuthorPresentation(3, 15, {
  usefulPatchCount: 15,
  componentCount: 1,
  mainComponentKey: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15",
  mainComponentSize: 15,
  patches: Array.from({ length: 15 }, (_, index) => ({
    patchId: index + 1,
    contactNodeIds: [],
    contactCount: 0,
    componentKey: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15",
    componentSize: 15,
  })),
}, { maxInsufficientPatchIds: 3 });
assert.equal(bounded.status, "warning");
assert.deepEqual(bounded.insufficientPatchIds, [1, 2, 3]);
assert.equal(bounded.insufficientPatchIdsTruncated, true);
assert.match(bounded.text, /insufficient patch IDs 1, 2, 3 …/);

const defaultThreeFacts: TargetedGridContactFacts = {
  usefulPatchCount: 2,
  componentCount: 1,
  mainComponentKey: "1,2",
  mainComponentSize: 2,
  patches: [
    { patchId: 1, contactNodeIds: [1, 2], contactCount: 2, componentKey: "1,2", componentSize: 2 },
    { patchId: 2, contactNodeIds: [3, 4, 5], contactCount: 3, componentKey: "1,2", componentSize: 2 },
  ],
};
const defaultThree = dryWebAuthorPresentation(undefined, 2, defaultThreeFacts);
assert.equal(defaultThree.requiredContacts, 3);
assert.equal(defaultThree.status, "warning");
assert.equal(defaultThree.passingPatchCount, 1);
assert.deepEqual(defaultThree.insufficientPatchIds, [1]);
assert.deepEqual(dryWebContactBins(1, defaultThreeFacts)?.map(({ key, count, passesThreshold }) => ({ key, count, passesThreshold })), [
  { key: "zero", count: 0, passesThreshold: false },
  { key: "one", count: 0, passesThreshold: true },
  { key: "two", count: 1, passesThreshold: true },
  { key: "threeOrMore", count: 1, passesThreshold: true },
]);

console.log("dry Web author presentation tests: default3/replay/gray/pass/warning policy passed");

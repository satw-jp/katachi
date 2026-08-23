import assert from "node:assert/strict";
import { growBalls, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import { DEFAULT_SKIN_PARAMS, resetPatchIdCounter } from "./field.ts";
import { DENSE_FLOWER_V6_STYLE_PRESET_ID, buildDenseFlowerV6Style } from "./denseFlowerPreset.ts";
import { DEFAULT_SKIN_HOST_PARAMS, createEmptyState, record, replay, undoLastHistoryEntry, type SkinHistoryEntry } from "./history.ts";

resetBallIdCounter(1);
resetPatchIdCounter(1);
const host = growBalls(DEFAULT_SKIN_HOST_PARAMS);
const originalParams = { ...DEFAULT_SKIN_PARAMS };
const built = buildDenseFlowerV6Style(host, DEFAULT_SKIN_HOST_PARAMS.k, originalParams);

assert.deepEqual(originalParams, DEFAULT_SKIN_PARAMS, "preset generation does not mutate the caller's controls");
assert.equal(built.primary.patches.length, 54, "the default host has a frozen primary flower layer");
assert.equal(built.lace.laceAdded, 364, "the default host has frozen decreasing-size gap additions");
assert.equal(built.lace.patches.length, 418);
assert.ok(built.lace.patches.every((patch) => patch.shape === "flower"));
assert.ok(built.lace.laceSmallestRadius! < built.lace.laceLargestRadius!, "multiple flower size bands remain visible");

const history: SkinHistoryEntry[] = [];
const state = createEmptyState();
record(history, state, "growHost", { params: { ...DEFAULT_SKIN_HOST_PARAMS } });
record(history, state, "applySurfacePreset", {
  presetId: DENSE_FLOWER_V6_STYLE_PRESET_ID,
  params: built.params,
  patches: built.lace.patches,
});
assert.equal(state.patches.length, 418);
assert.deepEqual(replay(history).patches, state.patches, "replay uses the realized flowers without re-running either search");
assert.equal(undoLastHistoryEntry(history).state.patches.length, 0, "one Undo returns to the visible host baseline");

console.log("dense flower v6-style preset tests passed (9 assertions)");

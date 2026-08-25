import assert from "node:assert/strict";
import { DEFAULT_SKIN_EDITOR_LAYOUT, fitSkinEditorLayout, resizeSkinEditorPane, validateSkinEditorLayoutDraft } from "./editorLayout.ts";

const roundTrip = validateSkinEditorLayoutDraft(JSON.parse(JSON.stringify(DEFAULT_SKIN_EDITOR_LAYOUT)));
assert.deepEqual(roundTrip, DEFAULT_SKIN_EDITOR_LAYOUT);

const resizedLeft = resizeSkinEditorPane(DEFAULT_SKIN_EDITOR_LAYOUT, "left", 420, 20, 1400);
assert.equal(resizedLeft.leftWidthPx, 400);
assert.equal(resizedLeft.leftCollapsed, false);
const resizedRight = resizeSkinEditorPane(DEFAULT_SKIN_EDITOR_LAYOUT, "right", 930, 20, 1400);
assert.equal(resizedRight.rightWidthPx, 470);

const narrow = fitSkinEditorLayout({ ...DEFAULT_SKIN_EDITOR_LAYOUT, leftWidthPx: 500, rightWidthPx: 700 }, 760);
assert.ok(narrow.leftCollapsed || narrow.rightCollapsed, "narrow layouts preserve the center by collapsing a side");

const clamped = validateSkinEditorLayoutDraft({ ...DEFAULT_SKIN_EDITOR_LAYOUT, fourSplitX: 0.01, fourSplitY: 0.99 });
assert.equal(clamped.fourSplitX, 0.2);
assert.equal(clamped.fourSplitY, 0.8);

console.log("editor layout tests passed (8 assertions)");

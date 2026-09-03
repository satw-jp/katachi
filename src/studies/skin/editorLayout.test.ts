import assert from "node:assert/strict";
import { DEFAULT_SKIN_EDITOR_LAYOUT, fitSkinEditorLayout, resizeSkinEditorBottomPane, resizeSkinEditorPane, validateSkinEditorLayoutDraft } from "./editorLayout.ts";

const roundTrip = validateSkinEditorLayoutDraft(JSON.parse(JSON.stringify(DEFAULT_SKIN_EDITOR_LAYOUT)));
assert.deepEqual(roundTrip, DEFAULT_SKIN_EDITOR_LAYOUT);

const resizedLeft = resizeSkinEditorPane(DEFAULT_SKIN_EDITOR_LAYOUT, "left", 420, 20, 1400);
assert.equal(resizedLeft.leftWidthPx, 400);
assert.equal(resizedLeft.leftCollapsed, false);
const resizedRight = resizeSkinEditorPane(DEFAULT_SKIN_EDITOR_LAYOUT, "right", 930, 20, 1400);
assert.equal(resizedRight.rightWidthPx, 470);

const narrow = fitSkinEditorLayout({ ...DEFAULT_SKIN_EDITOR_LAYOUT, leftWidthPx: 500, rightWidthPx: 700 }, 760);
assert.ok(narrow.leftCollapsed || narrow.rightCollapsed, "narrow layouts preserve the center by collapsing a side");

const wide = fitSkinEditorLayout({ ...DEFAULT_SKIN_EDITOR_LAYOUT, rightWidthPx: 760 }, 1400);
assert.equal(wide.rightWidthPx, 700, "Workflow width is capped at half the editor width");

const clamped = validateSkinEditorLayoutDraft({ ...DEFAULT_SKIN_EDITOR_LAYOUT, fourSplitX: 0.01, fourSplitY: 0.99 });
assert.equal(clamped.fourSplitX, 0.2);
assert.equal(clamped.fourSplitY, 0.8);

const resizedBottom = resizeSkinEditorBottomPane(DEFAULT_SKIN_EDITOR_LAYOUT, 720, 900);
assert.equal(resizedBottom.bottomHeightPx, 180);
assert.equal(resizedBottom.bottomCollapsed, false);

const legacyBottom = validateSkinEditorLayoutDraft({
  schema: DEFAULT_SKIN_EDITOR_LAYOUT.schema,
  leftWidthPx: 292, rightWidthPx: 400, leftCollapsed: false, rightCollapsed: false,
  fourSplitX: 0.5, fourSplitY: 0.5,
});
assert.equal(legacyBottom.bottomHeightPx, DEFAULT_SKIN_EDITOR_LAYOUT.bottomHeightPx);
assert.equal(legacyBottom.bottomCollapsed, false);

console.log("editor layout tests passed (12 assertions)");

import assert from "node:assert/strict";
import {
  clampRightPaneRatio,
  RIGHT_PANE_DEFAULT_RATIO,
  RIGHT_PANE_MAX_RATIO,
  RIGHT_PANE_MIN_RATIO,
  rightPaneSplitHeights,
} from "./rightPaneSplit.ts";

assert.equal(clampRightPaneRatio(Number.NaN), RIGHT_PANE_DEFAULT_RATIO);
assert.equal(clampRightPaneRatio(0), RIGHT_PANE_MIN_RATIO);
assert.equal(clampRightPaneRatio(100), RIGHT_PANE_MAX_RATIO);

const at1280x720 = rightPaneSplitHeights(578, 8, 42);
assert.equal(at1280x720.availableHeightPx, 570);
assert.equal(at1280x720.upperHeightPx, 239.4);
assert.equal(at1280x720.lowerHeightPx, 330.6);
assert.ok(at1280x720.upperHeightPx > 0, "1280x720 lower/upper split is visible");

const at1920x1080 = rightPaneSplitHeights(938, 8, 42);
assert.equal(at1920x1080.upperHeightPx, 390.6);
assert.equal(at1920x1080.lowerHeightPx, 539.4);

for (const ratio of [RIGHT_PANE_MIN_RATIO, RIGHT_PANE_DEFAULT_RATIO, RIGHT_PANE_MAX_RATIO]) {
  const split = rightPaneSplitHeights(938, 8, ratio);
  assert.ok(split.upperHeightPx >= 0 && split.lowerHeightPx >= 0);
  assert.equal(split.upperHeightPx + split.lowerHeightPx, split.availableHeightPx);
}

assert.throws(() => rightPaneSplitHeights(Number.NaN, 8, 42), /finite/);
assert.throws(() => rightPaneSplitHeights(100, -1, 42), /non-negative/);

console.log("right pane split tests passed (14 assertions)");

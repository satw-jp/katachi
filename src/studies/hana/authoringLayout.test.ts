import assert from "node:assert/strict";
import test from "node:test";
import {
  HANA_LEFT_PANE_DEFAULT_RATIO,
  HANA_LEFT_PANE_MAX_RATIO,
  HANA_LEFT_PANE_MIN_RATIO,
  clampLeftPaneRatio,
  parseLeftPaneRatio,
} from "./authoringLayout.ts";

test("left pane ratio clamps to the documented minimum and maximum", () => {
  assert.equal(clampLeftPaneRatio(-1), HANA_LEFT_PANE_MIN_RATIO);
  assert.equal(clampLeftPaneRatio(2), HANA_LEFT_PANE_MAX_RATIO);
  assert.equal(clampLeftPaneRatio(Number.NaN), HANA_LEFT_PANE_DEFAULT_RATIO);
  assert.equal(parseLeftPaneRatio("0.7"), 0.7);
  assert.equal(parseLeftPaneRatio("not-a-ratio"), HANA_LEFT_PANE_DEFAULT_RATIO);
});

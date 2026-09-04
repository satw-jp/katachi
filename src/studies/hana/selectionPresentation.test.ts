import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowActiveStrokeControls } from "./selectionPresentation.ts";

test("active Stroke controls are projected in every orthographic view", () => {
  assert.equal(shouldShowActiveStrokeControls("stroke-2", "stroke-2", "right"), true);
  assert.equal(shouldShowActiveStrokeControls("stroke-2", "stroke-2", "front"), true);
  assert.equal(shouldShowActiveStrokeControls("stroke-2", "stroke-2", "top"), true);
  assert.equal(shouldShowActiveStrokeControls("stroke-2", "stroke-2", "axome"), false);
});

test("inactive Stroke and viewport changes do not move the global active Stroke", () => {
  assert.equal(shouldShowActiveStrokeControls("stroke-2", "stroke-1", "front"), false);
  assert.equal(shouldShowActiveStrokeControls("stroke-2", "stroke-2", "top"), true);
});

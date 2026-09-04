import assert from "node:assert/strict";
import test from "node:test";
import {
  isHanaViewportDoubleTap,
  nextHanaViewportMode,
} from "./viewportLayoutToggle.ts";

test("viewport title toggle alternates Four and One", () => {
  assert.equal(nextHanaViewportMode("four"), "one");
  assert.equal(nextHanaViewportMode("one"), "four");
});

test("touch double-tap is bounded to the same viewport", () => {
  assert.equal(isHanaViewportDoubleTap({ viewportIndex: 2, timestamp: 1000 }, { viewportIndex: 2, timestamp: 1300 }), true);
  assert.equal(isHanaViewportDoubleTap({ viewportIndex: 2, timestamp: 1000 }, { viewportIndex: 1, timestamp: 1300 }), false);
  assert.equal(isHanaViewportDoubleTap({ viewportIndex: 2, timestamp: 1000 }, { viewportIndex: 2, timestamp: 1450 }), false);
});

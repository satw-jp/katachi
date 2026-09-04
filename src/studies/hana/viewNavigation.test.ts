import assert from "node:assert/strict";
import test from "node:test";
import { HANA_VIEW_PRESETS, touchGestureDelta } from "./viewNavigation.ts";

test("touch navigation derives pan and pinch deltas without authoring state", () => {
  const delta = touchGestureDelta(
    [{ id: 1, x: 10, y: 10 }, { id: 2, x: 30, y: 10 }],
    [{ id: 1, x: 15, y: 12 }, { id: 2, x: 40, y: 12 }],
  );
  assert.deepEqual(delta, {
    centerX: 27.5,
    centerY: 12,
    deltaX: 7.5,
    deltaY: 2,
    previousDistance: 20,
    distance: 25,
    zoomDelta: -5,
  });
});

test("view preset contract is explicit and finite", () => {
  assert.deepEqual(HANA_VIEW_PRESETS, ["front", "side", "top", "iso"]);
});

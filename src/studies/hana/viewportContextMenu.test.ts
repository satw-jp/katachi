import assert from "node:assert/strict";
import test from "node:test";

import {
  HANA_CONTEXT_MENU_CANCEL_DISTANCE,
  HANA_CONTEXT_MENU_LONG_PRESS_MS,
  HANA_CONTEXT_MENU_VIEW_PRESETS,
  hanaContextMenuTouchMoved,
  isHanaContextMenuRightMouse,
  shouldStartHanaContextLongPress,
} from "./viewportContextMenu.ts";

test("viewport context menu exposes the six camera presets", () => {
  assert.deepEqual(HANA_CONTEXT_MENU_VIEW_PRESETS, ["front", "back", "left", "right", "top", "iso"]);
});

test("viewport context menu keeps Fit and per-viewport Auto Rotate actions", () => {
  assert.ok(HANA_CONTEXT_MENU_LONG_PRESS_MS > 0);
  assert.ok(HANA_CONTEXT_MENU_CANCEL_DISTANCE > 0);
});

test("right mouse opens the viewport menu while primary mouse does not", () => {
  assert.equal(isHanaContextMenuRightMouse("mouse", 2), true);
  assert.equal(isHanaContextMenuRightMouse("mouse", 0), false);
});

test("Apple Pencil never opens the viewport menu", () => {
  assert.equal(isHanaContextMenuRightMouse("pen", 2), false);
  assert.equal(shouldStartHanaContextLongPress({
    pointerType: "pen",
    activeStroke: false,
    controlDrag: false,
    rangeSelection: false,
  }), false);
});

test("idle touch starts long press, while active authoring does not", () => {
  assert.equal(shouldStartHanaContextLongPress({
    pointerType: "touch",
    activeStroke: false,
    controlDrag: false,
    rangeSelection: false,
  }), true);
  assert.equal(shouldStartHanaContextLongPress({
    pointerType: "touch",
    activeStroke: true,
    controlDrag: false,
    rangeSelection: false,
  }), false);
});

test("touch movement cancels long press before normal drag threshold", () => {
  assert.ok(HANA_CONTEXT_MENU_CANCEL_DISTANCE < 6);
  assert.equal(hanaContextMenuTouchMoved(10, 10, 14, 12), true);
  assert.equal(hanaContextMenuTouchMoved(10, 10, 11, 11), false);
});

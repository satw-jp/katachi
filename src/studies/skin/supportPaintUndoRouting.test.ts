import assert from "node:assert/strict";
import test from "node:test";
import {
  canInvokeShapeUndo,
  invokeExclusiveSupportPaintUndo,
  resolveSkinUndoOwner,
  supportPaintOperationLabel,
} from "./supportPaintUndoRouting.ts";

test("Ctrl/Cmd+Z belongs exclusively to Support Paint while Paint is ON", () => {
  assert.equal(resolveSkinUndoOwner({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, typing: false, supportPaintEnabled: true }), "support-paint");
  assert.equal(resolveSkinUndoOwner({ key: "z", ctrlKey: false, metaKey: true, shiftKey: false, typing: false, supportPaintEnabled: true }), "support-paint");
  assert.equal(resolveSkinUndoOwner({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, typing: false, supportPaintEnabled: false }), "shape");
  assert.equal(resolveSkinUndoOwner({ key: "z", ctrlKey: true, metaKey: false, shiftKey: true, typing: false, supportPaintEnabled: true }), null);
  assert.equal(resolveSkinUndoOwner({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, typing: true, supportPaintEnabled: true }), null);
});

test("Support Paint Undo click is claimed once and cannot bubble to shape Undo", () => {
  const calls: string[] = [];
  invokeExclusiveSupportPaintUndo({
    preventDefault: () => calls.push("preventDefault"),
    stopPropagation: () => calls.push("stopPropagation"),
    stopImmediatePropagation: () => calls.push("stopImmediatePropagation"),
  }, () => calls.push("paintUndo"));
  assert.deepEqual(calls, ["preventDefault", "stopPropagation", "stopImmediatePropagation", "paintUndo"]);
  assert.equal(calls.filter((call) => call === "paintUndo").length, 1);
});

test("Ctrl+Z dispatches one Paint Undo and stops the shape path", () => {
  const calls: string[] = [];
  const owner = resolveSkinUndoOwner({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, typing: false, supportPaintEnabled: true });
  if (owner === "support-paint") {
    invokeExclusiveSupportPaintUndo({
      preventDefault: () => calls.push("preventDefault"),
      stopPropagation: () => calls.push("stopPropagation"),
      stopImmediatePropagation: () => calls.push("stopImmediatePropagation"),
    }, () => calls.push("paintUndo"));
  } else if (owner === "shape") {
    calls.push("shapeUndo");
  }
  assert.deepEqual(calls, ["preventDefault", "stopPropagation", "stopImmediatePropagation", "paintUndo"]);
  assert.equal(calls.includes("shapeUndo"), false);
});

test("left shape Undo cannot mutate shape history while Support Paint is ON", () => {
  let shapeUndoCalls = 0;
  const requestShapeUndo = (supportPaintEnabled: boolean) => {
    if (canInvokeShapeUndo(supportPaintEnabled)) shapeUndoCalls++;
  };
  requestShapeUndo(true);
  assert.equal(shapeUndoCalls, 0);
  requestShapeUndo(false);
  assert.equal(shapeUndoCalls, 1);
});

test("UI distinguishes one Paint operation from its many saved samples", () => {
  assert.equal(supportPaintOperationLabel(1, 929), "Paint操作 1 / sample 929");
});

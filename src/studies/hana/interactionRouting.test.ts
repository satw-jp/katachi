import assert from "node:assert/strict";
import test from "node:test";
import {
  HANA_POINTER_DRAG_THRESHOLD,
  classifyHanaEmptyDrag,
  classifyHanaPointerIntent,
  pointerMovementExceedsThreshold,
  resolveHanaSelection,
  resolveHanaTapAdditive,
} from "./interactionRouting.ts";

test("pointer threshold separates tap from drag", () => {
  assert.equal(pointerMovementExceedsThreshold(10, 10, 10, 10), false);
  assert.equal(pointerMovementExceedsThreshold(10, 10, 10 + HANA_POINTER_DRAG_THRESHOLD, 10), true);
});

test("selected Stroke drag routes to Edit while empty drag pans", () => {
  assert.equal(classifyHanaPointerIntent({ candidateStrokeId: "stroke-1", candidateSelected: true, editEnabled: true, controlIndex: 3 }, false), "pending");
  assert.equal(classifyHanaPointerIntent({ candidateStrokeId: "stroke-1", candidateSelected: true, editEnabled: true, controlIndex: 3 }, true), "edit-drag");
  assert.equal(classifyHanaPointerIntent({ candidateStrokeId: "stroke-1", candidateSelected: true, editEnabled: false, controlIndex: 3 }, true), "camera-pan");
  assert.equal(classifyHanaPointerIntent({ candidateStrokeId: "stroke-2", candidateSelected: false, editEnabled: true, controlIndex: null }, true), "select-drag");
  assert.equal(classifyHanaPointerIntent({ candidateStrokeId: null, candidateSelected: false, editEnabled: true, controlIndex: null }, true), "camera-pan");
});

test("tap selection follows the Rhino modifier contract", () => {
  assert.deepEqual(
    resolveHanaSelection({ current: [], clicked: "stroke-a", additive: false }),
    ["stroke-a"],
  );
  assert.deepEqual(
    resolveHanaSelection({ current: ["stroke-a"], clicked: "stroke-b", additive: true }),
    ["stroke-a", "stroke-b"],
  );
  assert.deepEqual(
    resolveHanaSelection({ current: ["stroke-a", "stroke-b"], clicked: "stroke-a", additive: true }),
    ["stroke-b"],
  );
  assert.deepEqual(
    resolveHanaSelection({ current: ["stroke-a", "stroke-b"], clicked: "stroke-c", additive: false }),
    ["stroke-c"],
  );
});

test("Shift enables additive selection and the Multi Select toggle stays as touch fallback", () => {
  assert.equal(resolveHanaTapAdditive({ shiftKey: false, touchFallback: false }), false);
  assert.equal(resolveHanaTapAdditive({ shiftKey: true, touchFallback: false }), true);
  assert.equal(resolveHanaTapAdditive({ shiftKey: false, touchFallback: true }), true);
  assert.deepEqual(
    resolveHanaSelection({ current: ["stroke-a"], clicked: "stroke-b", additive: resolveHanaTapAdditive({ shiftKey: false, touchFallback: true }) }),
    ["stroke-a", "stroke-b"],
  );
});

test("empty-space drag routes mouse primary to range select and keeps camera elsewhere", () => {
  assert.equal(classifyHanaEmptyDrag({ pointerType: "mouse", mouseButton: 0, candidateStrokeId: null }), "range-select");
  assert.equal(classifyHanaEmptyDrag({ pointerType: "mouse", mouseButton: 2, candidateStrokeId: null }), "camera-pan");
  assert.equal(classifyHanaEmptyDrag({ pointerType: "mouse", mouseButton: 1, candidateStrokeId: null }), "camera-pan");
  assert.equal(classifyHanaEmptyDrag({ pointerType: "touch", mouseButton: 0, candidateStrokeId: null }), "camera-pan");
  assert.equal(classifyHanaEmptyDrag({ pointerType: "pen", mouseButton: 0, candidateStrokeId: null }), "none");
  assert.equal(classifyHanaEmptyDrag({ pointerType: "mouse", mouseButton: 0, candidateStrokeId: "stroke-1" }), "none");
});

test("tap stays tap below the drag threshold", () => {
  assert.equal(pointerMovementExceedsThreshold(100, 100, 100 + HANA_POINTER_DRAG_THRESHOLD - 1, 100), false);
  assert.equal(classifyHanaPointerIntent({ candidateStrokeId: null, candidateSelected: false, editEnabled: true, controlIndex: null }, false), "pending");
});

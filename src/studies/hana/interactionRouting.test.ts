import assert from "node:assert/strict";
import test from "node:test";
import {
  HANA_POINTER_DRAG_THRESHOLD,
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

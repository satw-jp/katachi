import assert from "node:assert/strict";
import test from "node:test";
import {
  HANA_POINTER_DRAG_THRESHOLD,
  classifyHanaPointerIntent,
  pointerMovementExceedsThreshold,
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

test("Select mode consumes element drags without entering Stroke Edit", () => {
  assert.equal(classifyHanaPointerIntent({
    candidateStrokeId: "stroke-1",
    candidateFlowerId: null,
    candidateSelected: true,
    editEnabled: true,
    selectionMode: true,
    controlIndex: 2,
  }, true), "select-drag");
  assert.equal(classifyHanaPointerIntent({
    candidateStrokeId: null,
    candidateFlowerId: "flower-1",
    candidateSelected: false,
    editEnabled: false,
    selectionMode: true,
    controlIndex: null,
  }, true), "select-drag");
  assert.equal(classifyHanaPointerIntent({
    candidateStrokeId: null,
    candidateFlowerId: null,
    candidateSelected: false,
    editEnabled: false,
    selectionMode: true,
    controlIndex: null,
  }, true), "camera-pan");
});

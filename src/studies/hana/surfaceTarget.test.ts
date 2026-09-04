import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveHanaRestoredSelection,
  resolveHanaSurfaceTarget,
} from "./surfaceTarget.ts";

test("empty restore has no Surface target and never triggers a build", () => {
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: true, strokeIds: [], activeStrokeId: null, materialSampleCount: 0 }),
    null,
  );
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: false, strokeIds: ["stroke-1"], activeStrokeId: "stroke-1", materialSampleCount: 8 }),
    null,
  );
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: true, strokeIds: ["stroke-1"], activeStrokeId: "stroke-1", materialSampleCount: 0 }),
    null,
  );
});

test("Redo restores the first Stroke as the current Surface target", () => {
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: true, strokeIds: ["stroke-1"], activeStrokeId: "stroke-1", materialSampleCount: 8 }),
    "stroke-1",
  );
});

test("Edit Undo targets the pre-edit Stroke and Edit Redo targets the edited Stroke", () => {
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: true, strokeIds: ["stroke-1"], activeStrokeId: "stroke-1", materialSampleCount: 8 }),
    "stroke-1",
  );
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: true, strokeIds: ["stroke-1", "stroke-2"], activeStrokeId: "stroke-2", materialSampleCount: 12 }),
    "stroke-2",
  );
});

test("missing active falls back to the most recent Stroke, never to an absent id", () => {
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: true, strokeIds: ["stroke-1", "stroke-2"], activeStrokeId: null, materialSampleCount: 6 }),
    "stroke-2",
  );
  assert.equal(
    resolveHanaSurfaceTarget({ showSurface: true, strokeIds: ["stroke-1"], activeStrokeId: "stroke-gone", materialSampleCount: 6 }),
    "stroke-1",
  );
});

test("restored selection keeps survivors and resolves empty restores to empty", () => {
  assert.deepEqual(
    resolveHanaRestoredSelection({ liveSelectedStrokeIds: ["stroke-1"], liveActiveStrokeId: "stroke-1", restoredStrokeIds: ["stroke-1"] }),
    { selectedStrokeIds: ["stroke-1"], activeStrokeId: "stroke-1" },
  );
  assert.deepEqual(
    resolveHanaRestoredSelection({ liveSelectedStrokeIds: [], liveActiveStrokeId: null, restoredStrokeIds: [] }),
    { selectedStrokeIds: [], activeStrokeId: null },
  );
});

test("Redo after empty Undo reselects the restored Stroke instead of leaving active null", () => {
  assert.deepEqual(
    resolveHanaRestoredSelection({ liveSelectedStrokeIds: [], liveActiveStrokeId: null, restoredStrokeIds: ["stroke-1"] }),
    { selectedStrokeIds: ["stroke-1"], activeStrokeId: "stroke-1" },
  );
});

test("Undo drops selection entries that no longer exist and reactivates the survivor", () => {
  assert.deepEqual(
    resolveHanaRestoredSelection({
      liveSelectedStrokeIds: ["stroke-1", "stroke-2"],
      liveActiveStrokeId: "stroke-2",
      restoredStrokeIds: ["stroke-1"],
    }),
    { selectedStrokeIds: ["stroke-1"], activeStrokeId: "stroke-1" },
  );
});

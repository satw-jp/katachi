import assert from "node:assert/strict";
import test from "node:test";
import {
  SKIN_EDITOR_VIEW_SCHEMA,
  skinViewAxisLegend,
  skinViewportAtPoint,
  skinViewportRects,
  validateSkinEditorViewDraft,
} from "./multiViewport.ts";

test("four-view layout is Top/Axome over Front/Right and shares one canvas", () => {
  assert.deepEqual(skinViewportRects(1001, 801, "four", 0), [
    { index: 0, x: 0, y: 0, width: 500, height: 400 },
    { index: 1, x: 500, y: 0, width: 501, height: 400 },
    { index: 2, x: 0, y: 400, width: 500, height: 401 },
    { index: 3, x: 500, y: 400, width: 501, height: 401 },
  ]);
  assert.equal(skinViewportAtPoint(750, 650, 1001, 801, "four", 0)?.index, 3);
  assert.deepEqual(skinViewportRects(1001, 801, "one", 2), [
    { index: 2, x: 0, y: 0, width: 1001, height: 801 },
  ]);
});

test("editor view draft round-trips four directions and independent camera poses", () => {
  const draft = validateSkinEditorViewDraft({
    schema: SKIN_EDITOR_VIEW_SCHEMA,
    mode: "four",
    selectedViewport: 1,
    viewports: ["top", "axome", "front", "left"].map((direction, index) => ({
      direction,
      camera: { position: [index, index + 1, index + 2], up: [0, 0, 1], target: [0, 0, 0], zoom: index + 1 },
    })),
  });
  assert.equal(draft.viewports[3].direction, "left");
  assert.equal(draft.viewports[3].camera.zoom, 4);
  assert.match(skinViewAxisLegend("back"), /−X/);
});

test("malformed editor camera state fails closed", () => {
  const base = {
    schema: SKIN_EDITOR_VIEW_SCHEMA,
    mode: "one",
    selectedViewport: 0,
    viewports: Array.from({ length: 4 }, () => ({
      direction: "top",
      camera: { position: [0, 0, 5], up: [0, 1, 0], target: [0, 0, 0], zoom: 1 },
    })),
  };
  assert.throws(() => validateSkinEditorViewDraft({ ...base, selectedViewport: 4 }), /selected viewport/);
  assert.throws(() => validateSkinEditorViewDraft({ ...base, viewports: base.viewports.map((view, i) => i === 0 ? { ...view, camera: { ...view.camera, zoom: 0 } } : view) }), /zoom/);
});

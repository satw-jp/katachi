import assert from "node:assert/strict";
import test from "node:test";
import {
  createSkinViewportSessionState,
  recommendSkinViewportOverlay,
  recommendSkinViewportView,
  selectSkinViewportOverlay,
  selectSkinViewportView,
  SKIN_VIEWPORT_OVERLAYS,
  viewportEvidenceCanRender,
} from "./viewportMode.ts";

test("viewport defaults to Field / SDF with no overlay", () => {
  assert.deepEqual(createSkinViewportSessionState(), {
    view: "field",
    overlay: "none",
    userHasSelectedViewportMode: false,
    userHasSelectedOverlay: false,
  });
});

test("explicit Mesh selection survives a stage view recommendation", () => {
  const selected = selectSkinViewportView(createSkinViewportSessionState(), "mesh");
  assert.equal(recommendSkinViewportView(selected, "beads").view, "mesh");
});

test("all v0 overlays are selectable and explicit Components survives recommendations", () => {
  assert.deepEqual(SKIN_VIEWPORT_OVERLAYS, [
    "none", "insideOutside", "printRisk", "components", "reinforcement", "support",
  ]);
  const selected = selectSkinViewportOverlay(createSkinViewportSessionState(), "components");
  assert.equal(recommendSkinViewportOverlay(selected, "printRisk").overlay, "components");
});

test("only current evidence is renderable", () => {
  assert.equal(viewportEvidenceCanRender("current"), true);
  assert.equal(viewportEvidenceCanRender("stale"), false);
  assert.equal(viewportEvidenceCanRender("unavailable"), false);
});

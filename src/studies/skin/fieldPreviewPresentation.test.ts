import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldInteractiveTargetSize,
  fieldPreviewPresentationVisibility,
  FIELD_INTERACTION_RENDER_SCALE,
} from "./fieldPreviewPresentation.ts";

test("FIELD legacy and vNext are mutually exclusive", () => {
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "legacy", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
  }), { legacy: true, vnext: false, interactionProxy: false, interactiveField: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
  }), { legacy: false, vnext: true, interactionProxy: false, interactiveField: false });
});

test("leaving FIELD hides both fullscreen quads and does not lose backend preference", () => {
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "beads", backend: "vnext", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
  }), { legacy: false, vnext: false, interactionProxy: false, interactiveField: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "mesh", backend: "vnext", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
  }), { legacy: false, vnext: false, interactionProxy: false, interactiveField: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
  }), { legacy: false, vnext: true, interactionProxy: false, interactiveField: false });
});

test("interaction keeps FIELD in a low-resolution target and restores exact preview", () => {
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: true, interactionProxyAvailable: true, interactiveFieldAvailable: true,
  }), { legacy: false, vnext: false, interactionProxy: false, interactiveField: true });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
  }), { legacy: false, vnext: true, interactionProxy: false, interactiveField: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: true, interactionProxyAvailable: false, interactiveFieldAvailable: false,
  }), { legacy: false, vnext: true, interactionProxy: false, interactiveField: false });
  assert.equal(fieldInteractiveTargetSize(1600, 900).width, Math.ceil(1600 * FIELD_INTERACTION_RENDER_SCALE));
  assert.deepEqual(fieldInteractiveTargetSize(320, 180), { width: 96, height: 64 });
});

test("five FIELD to BEADS transitions keep both FIELD presentations hidden", () => {
  for (let count = 0; count < 5; count++) {
    assert.deepEqual(fieldPreviewPresentationVisibility({
      layer: "beads", backend: "vnext", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
    }), { legacy: false, vnext: false, interactionProxy: false, interactiveField: false });
    assert.deepEqual(fieldPreviewPresentationVisibility({
      layer: "field", backend: "vnext", interactionActive: false, interactionProxyAvailable: true, interactiveFieldAvailable: true,
    }), { legacy: false, vnext: true, interactionProxy: false, interactiveField: false });
  }
});

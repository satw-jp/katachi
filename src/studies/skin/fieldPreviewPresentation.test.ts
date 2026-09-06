import assert from "node:assert/strict";
import test from "node:test";
import { fieldPreviewPresentationVisibility } from "./fieldPreviewPresentation.ts";

test("FIELD legacy and vNext are mutually exclusive", () => {
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "legacy", interactionActive: false, interactionProxyAvailable: true,
  }), { legacy: true, vnext: false, interactionProxy: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: false, interactionProxyAvailable: true,
  }), { legacy: false, vnext: true, interactionProxy: false });
});

test("leaving FIELD hides both fullscreen quads and does not lose backend preference", () => {
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "beads", backend: "vnext", interactionActive: false, interactionProxyAvailable: true,
  }), { legacy: false, vnext: false, interactionProxy: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "mesh", backend: "vnext", interactionActive: false, interactionProxyAvailable: true,
  }), { legacy: false, vnext: false, interactionProxy: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: false, interactionProxyAvailable: true,
  }), { legacy: false, vnext: true, interactionProxy: false });
});

test("vNext interaction uses the lightweight proxy and restores exact preview", () => {
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: true, interactionProxyAvailable: true,
  }), { legacy: false, vnext: false, interactionProxy: true });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: false, interactionProxyAvailable: true,
  }), { legacy: false, vnext: true, interactionProxy: false });
  assert.deepEqual(fieldPreviewPresentationVisibility({
    layer: "field", backend: "vnext", interactionActive: true, interactionProxyAvailable: false,
  }), { legacy: false, vnext: true, interactionProxy: false });
});

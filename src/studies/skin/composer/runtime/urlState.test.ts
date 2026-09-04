import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMPOSER_STATE } from "./state.ts";
import { parseComposerState, serializeComposerState } from "./urlState.ts";

test("composer state preserves fixed seed and mix parameters in a link", () => {
  const state = { ...DEFAULT_COMPOSER_STATE, seed: 77, visual: { ...DEFAULT_COMPOSER_STATE.visual, gaussian: 0.91 }, camera: { ...DEFAULT_COMPOSER_STATE.camera, mode: "EXPLORE" as const } };
  const serialized = serializeComposerState("https://example.test/skin-art/composer/", state);
  assert.deepEqual(parseComposerState(new URL(serialized).search), state);
});

test("composer state keeps the camera pose and maps the former STILL mode to MANUAL", () => {
  const state = { ...DEFAULT_COMPOSER_STATE, visual: { ...DEFAULT_COMPOSER_STATE.visual, light: 0.97 }, camera: { ...DEFAULT_COMPOSER_STATE.camera, mode: "MANUAL" as const, position: [1, 2, 3] as const, target: [0.1, 0.2, 0.3] as const, up: [0, 1, 0] as const } };
  const serialized = serializeComposerState("https://example.test/skin-art/composer/", state);
  assert.deepEqual(parseComposerState(new URL(serialized).search), state);
  const legacy = new URLSearchParams({ state: JSON.stringify({ camera: { mode: "STILL" } }) });
  assert.equal(parseComposerState(`?${legacy}`).camera.mode, "MANUAL");
});

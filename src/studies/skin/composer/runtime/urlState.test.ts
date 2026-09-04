import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMPOSER_STATE } from "./state.ts";
import { parseComposerState, serializeComposerState } from "./urlState.ts";

test("composer state preserves fixed seed and mix parameters in a link", () => {
  const state = { ...DEFAULT_COMPOSER_STATE, seed: 77, visual: { ...DEFAULT_COMPOSER_STATE.visual, gaussian: 0.91 }, camera: { ...DEFAULT_COMPOSER_STATE.camera, mode: "EXPLORE" as const } };
  const serialized = serializeComposerState("https://example.test/skin-art/composer/", state);
  assert.deepEqual(parseComposerState(new URL(serialized).search), state);
});

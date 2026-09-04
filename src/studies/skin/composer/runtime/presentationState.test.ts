import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMPOSER_STATE } from "./state.ts";
import { parseComposerState, serializeComposerState } from "./urlState.ts";

test("composer state round-trips curve, warp, micro, trail, and AUTO camera", () => {
  const state = {
    ...DEFAULT_COMPOSER_STATE,
    curve: { amount: 0.8, bend: 0.6, sag: 0.4, flow: 0.7 },
    warp: { bend: 0.5, twist: 0.3, wave: 0.2, local: 0.6, scale: 1.4, speed: 1.2 },
    micro: { amount: 0.9, size: 1.3, drift: 0.7, brightness: 1.4 },
    trail: { length: 0.8, fade: 0.6, persistence: 0.7, residue: 0.5 },
    visual: { ...DEFAULT_COMPOSER_STATE.visual, microPoints: 0.8, trails: 0.7 },
    camera: {
      ...DEFAULT_COMPOSER_STATE.camera,
      mode: "AUTO" as const,
      autoRotateAxisMix: 0.9,
      autoRotateVary: 0.8,
      autoRotatePause: 0.5,
      autoVary: 0.9,
    },
  };
  const serialized = serializeComposerState("https://example.test/skin-art/composer/", state);
  assert.deepEqual(parseComposerState(new URL(serialized).search), state);
});

test("legacy links without new groups fall back to defaults", () => {
  const legacy = new URLSearchParams({ state: JSON.stringify({ seed: 42, visual: { points: 0.9 } }) });
  const parsed = parseComposerState(`?${legacy}`);
  assert.equal(parsed.seed, 42);
  assert.equal(parsed.visual.points, 0.9);
  assert.deepEqual(parsed.curve, DEFAULT_COMPOSER_STATE.curve);
  assert.deepEqual(parsed.warp, DEFAULT_COMPOSER_STATE.warp);
  assert.deepEqual(parsed.micro, DEFAULT_COMPOSER_STATE.micro);
  assert.deepEqual(parsed.trail, DEFAULT_COMPOSER_STATE.trail);
  assert.equal(parsed.camera.mode, "DRIFT");
});

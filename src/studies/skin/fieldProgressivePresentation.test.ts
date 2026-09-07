import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceFieldProgression,
  beginFieldProgression,
  createFieldProgressiveState,
  endFieldInteraction,
  fieldProgressivePhase,
  leaveFieldProgression,
  FIELD_PREVIEW_MARCH_STEPS,
} from "./fieldProgressivePresentation.ts";

test("FIELD progression starts with a proxy and advances only for the current generation", () => {
  const started = beginFieldProgression(createFieldProgressiveState());
  assert.equal(fieldProgressivePhase(started), "proxy");
  const coarse = endFieldInteraction(started);
  assert.equal(fieldProgressivePhase(coarse), "coarse");
  assert.equal(fieldProgressivePhase(advanceFieldProgression(coarse, coarse.generation, "medium")), "refining");
  assert.equal(fieldProgressivePhase(advanceFieldProgression(coarse, coarse.generation - 1, "fine")), "coarse");
});

test("a new interaction invalidates pending refinement and leaving FIELD restores the settled state", () => {
  const started = beginFieldProgression(createFieldProgressiveState());
  const coarse = endFieldInteraction(started);
  const medium = advanceFieldProgression(coarse, coarse.generation, "medium");
  const interrupted = beginFieldProgression(medium);
  assert.equal(interrupted.interactionActive, true);
  assert.equal(fieldProgressivePhase(interrupted), "proxy");
  assert.equal(fieldProgressivePhase(advanceFieldProgression(interrupted, medium.generation, "fine")), "proxy");
  const left = leaveFieldProgression(interrupted);
  assert.equal(left.active, false);
  assert.equal(left.quality, "fine");
});

test("quality ladder stays presentation-only and never drops below the bounded proxy tier", () => {
  assert.deepEqual(FIELD_PREVIEW_MARCH_STEPS, { proxy: 48, coarse: 72, medium: 112, fine: 160 });
  assert.ok(FIELD_PREVIEW_MARCH_STEPS.proxy > 0);
  assert.ok(FIELD_PREVIEW_MARCH_STEPS.coarse < FIELD_PREVIEW_MARCH_STEPS.fine);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceProgressiveRender,
  beginProgressiveRender,
  createRealtimeRenderState,
  fitProgressiveRenderSize,
  progressivePixelJitter,
  progressiveSampleWeight,
  stopProgressiveRender,
} from "../../src/studies/cloud-sculpt/progressiveRender.ts";

test("progressive render completes at the requested deterministic sample count", () => {
  let state = beginProgressiveRender(4, 100);
  state = advanceProgressiveRender(state, 110);
  state = advanceProgressiveRender(state, 120);
  state = advanceProgressiveRender(state, 130);
  assert.equal(state.kind, "rendering");
  state = advanceProgressiveRender(state, 140);
  assert.deepEqual(
    { kind: state.kind, completed: state.completedSamples, elapsed: state.elapsedMs },
    { kind: "complete", completed: 4, elapsed: 40 },
  );
  assert.equal(advanceProgressiveRender(state, 150), state);
});

test("stopping preserves a non-empty accumulation and discards an empty one", () => {
  const empty = stopProgressiveRender(beginProgressiveRender(64, 10), 20);
  assert.deepEqual(empty, createRealtimeRenderState("レンダーを停止しました"));

  const oneSample = advanceProgressiveRender(beginProgressiveRender(64, 10), 20);
  const stopped = stopProgressiveRender(oneSample, 25);
  assert.equal(stopped.kind, "complete");
  assert.equal(stopped.completedSamples, 1);
  assert.equal(stopped.message, "途中結果で停止");
});

test("running-average weights and Halton jitter are stable", () => {
  assert.deepEqual([0, 1, 2, 3].map(progressiveSampleWeight), [1, 0.5, 1 / 3, 0.25]);
  const expected = [[0, -1 / 6], [-0.25, 1 / 6], [0.25, -7 / 18]];
  expected.forEach((pair, index) => {
    const actual = progressivePixelJitter(index);
    assert.ok(Math.abs(actual[0] - pair[0]) < 1e-12);
    assert.ok(Math.abs(actual[1] - pair[1]) < 1e-12);
  });
});

test("invalid sample counts are rejected", () => {
  assert.throws(() => beginProgressiveRender(0, 0), RangeError);
  assert.throws(() => beginProgressiveRender(1.5, 0), RangeError);
  assert.throws(() => progressiveSampleWeight(-1), RangeError);
  assert.throws(() => progressivePixelJitter(-1), RangeError);
});

test("progressive target size preserves aspect while capping HDR memory", () => {
  assert.deepEqual(fitProgressiveRenderSize(1880, 1344), { width: 1880, height: 1344 });
  const capped = fitProgressiveRenderSize(5120, 2880);
  assert.ok(capped.width * capped.height <= 2560 * 1440);
  assert.ok(Math.abs(capped.width / capped.height - 16 / 9) < 0.002);
});

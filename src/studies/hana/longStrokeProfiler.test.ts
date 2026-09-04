import assert from "node:assert/strict";
import test from "node:test";

import {
  HANA_LONG_STROKE_CHECKPOINTS,
  HANA_LONG_STROKE_LIVE_PROXY_CAP,
  HanaLongStrokeProfiler,
  formatHanaLongStrokeProfile,
  liveIsolationModeLabel,
} from "./longStrokeProfiler.ts";

test("long-stroke profiler records stage checkpoints and the preceding gap", () => {
  const profiler = new HanaLongStrokeProfiler();
  profiler.start("raw-control-smooth-proxy");
  profiler.recordEvent({ timestamp: 0, rawCount: 50, stages: { pointerCallback: 0.2, rawAppend: 0.1 } });
  profiler.recordFrame({
    rawCount: 50,
    liveSampleCount: 50,
    liveProxySegmentCount: 50,
    stages: { control: 0.4, smooth: 0.3, proxy: 0.2, buffer: 0.1, render: 0.5, total: 1.5 },
  });
  profiler.recordEvent({ timestamp: 125, rawCount: 100, stages: { pointerCallback: 0.2, rawAppend: 0.1 } });
  profiler.recordFrame({
    rawCount: 100,
    liveSampleCount: 192,
    liveProxySegmentCount: 192,
    processedRawPrefixLength: 192,
    stages: { control: 0.4, smooth: 0.3, proxy: 0.2, buffer: 0.1, render: 0.5, total: 1.5 },
  });
  profiler.recordEventLoopLag(51);
  profiler.recordEventLoopLag(101);

  const summary = profiler.summary();
  assert.equal(summary.mode, "raw-control-smooth-proxy");
  assert.equal(summary.largestRawGap?.deltaMilliseconds, 125);
  assert.equal(summary.largestRawGap?.precedingStages?.proxy, 0.2);
  assert.equal(summary.eventLoopLagOver50, 2);
  assert.equal(summary.eventLoopLagOver100, 1);
  assert.equal(summary.checkpoints[0]?.threshold, 50);
  assert.equal(summary.checkpoints[1]?.threshold, 100);
  assert.equal(summary.checkpoints[1]?.processedRawPrefixLength, 192);
  assert.match(formatHanaLongStrokeProfile(summary), /RAW \+ CONTROL/);
});

test("long-stroke checkpoint bounds are explicit and mode labels are stable", () => {
  assert.deepEqual(HANA_LONG_STROKE_CHECKPOINTS.slice(0, 6), [50, 100, 200, 400, 800, 1600]);
  assert.equal(HANA_LONG_STROKE_LIVE_PROXY_CAP, 192);
  assert.equal(liveIsolationModeLabel("raw-only"), "A RAW ONLY");
  assert.equal(liveIsolationModeLabel("full"), "E FULL CURRENT LIVE PATH + RENDER");
});

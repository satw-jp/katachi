import assert from "node:assert/strict";
import test from "node:test";
import {
  HanaLivePathProfiler,
  formatHanaLivePathSummary,
} from "./livePathProfiler.ts";

test("live path profiler keeps bounded samples and deterministic percentile summaries", () => {
  const profiler = new HanaLivePathProfiler(3);
  profiler.record({ eventTimestamp: 0, stages: { rawAppend: 1 } });
  profiler.record({ eventTimestamp: 10, frameTimestamp: 11, stages: { rawAppend: 3 } });
  profiler.record({ eventTimestamp: 30, frameTimestamp: 32, stages: { rawAppend: 2 } });
  profiler.record({ eventTimestamp: 60, frameTimestamp: 63, stages: { rawAppend: 4 } });

  const summary = profiler.summarize();
  assert.equal(profiler.recentSamples.length, 3);
  assert.equal(summary.sampleCount, 3);
  assert.equal(summary.eventInterval?.median, 20);
  assert.equal(summary.stages.rawAppend?.median, 3);
  assert.equal(summary.stages.rawAppend?.p95, 4);
  assert.match(formatHanaLivePathSummary(summary), /proxy —/);
});

test("reset clears event and frame history without touching external data", () => {
  const profiler = new HanaLivePathProfiler();
  profiler.record({ eventTimestamp: 100, frameTimestamp: 101, stages: { totalUpdate: 5 } });
  profiler.reset();
  const summary = profiler.summarize();
  assert.equal(summary.sampleCount, 0);
  assert.equal(summary.eventCount, 0);
  assert.equal(summary.frameCount, 0);
  assert.equal(summary.stages.totalUpdate, null);
});

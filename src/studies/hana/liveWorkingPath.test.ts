import assert from "node:assert/strict";
import test from "node:test";

import type { HanaStrokePoint } from "./gesture.ts";
import {
  appendLiveWorkingPoint,
  createLiveWorkingPath,
  HANA_LIVE_WORKING_MAX_POINTS,
  liveWorkingStrokeSamples,
} from "./liveWorkingPath.ts";

function replayLongPath(): ReturnType<typeof liveWorkingStrokeSamples> {
  const makePoint = (index: number): HanaStrokePoint => ({
    x: index * 280 / 6969,
    y: Math.sin(index * 0.03) * 12,
    pressure: 0.2 + (index % 20) / 100,
    time: index * 4.6,
  });
  const position = (point: HanaStrokePoint) => ({ x: point.x, y: point.y, z: 0 });
  const first = makePoint(0);
  const path = createLiveWorkingPath(first, position(first), 0, { initialSpacing: 0.08 });
  for (let index = 1; index < 6970; index += 1) {
    const point = makePoint(index);
    appendLiveWorkingPoint(path, point, position(point), index);
  }
  return liveWorkingStrokeSamples(path);
}

test("Live working representation stays bounded while retaining the Raw endpoint", () => {
  const samples = replayLongPath();
  assert.ok(samples.length <= HANA_LIVE_WORKING_MAX_POINTS + 1);
  assert.ok(samples.every((sample, index) => (
    Number.isFinite(sample.point.x)
    && Number.isFinite(sample.point.y)
    && Number.isFinite(sample.sourceT)
    && (index === 0 || sample.sourceT >= samples[index - 1].sourceT)
  )));
  assert.equal(samples[0].sourcePointStart, 0);
  assert.equal(samples.at(-1)?.sourcePointStart, 6969);
  assert.equal(samples.at(-1)?.sourceT, 1);
});

test("Live working compaction is deterministic and does not change Raw input", () => {
  const first = replayLongPath();
  const second = replayLongPath();
  assert.deepEqual(second, first);
});

test("Long-stroke live prefixes keep the working representation bounded", () => {
  const prefixCounts = [100, 500, 1000, 2000, 5000, 10000];
  for (const prefixCount of prefixCounts) {
    const makePoint = (index: number): HanaStrokePoint => ({
      x: index * 10 / Math.max(1, prefixCount - 1),
      y: Math.sin(index * 0.02),
      pressure: 0.5,
      time: index,
    });
    const position = (point: HanaStrokePoint) => ({ x: point.x, y: point.y, z: 0 });
    const first = makePoint(0);
    const path = createLiveWorkingPath(first, position(first), 0);
    for (let index = 1; index < prefixCount; index += 1) {
      const point = makePoint(index);
      appendLiveWorkingPoint(path, point, position(point), index);
    }
    const samples = liveWorkingStrokeSamples(path);
    assert.ok(samples.length <= HANA_LIVE_WORKING_MAX_POINTS + 1);
    assert.equal(samples.at(-1)?.sourcePointStart, prefixCount - 1);
    assert.equal(samples.at(-1)?.sourceT, 1);
  }
});

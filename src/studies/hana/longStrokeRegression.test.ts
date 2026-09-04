import assert from "node:assert/strict";
import test from "node:test";

import type { HanaStrokePoint } from "./gesture.ts";
import { sampleLiveProxySegments } from "./liveProxy.ts";
import {
  appendLiveWorkingPoint,
  createLiveWorkingPath,
  HANA_LIVE_WORKING_MAX_POINTS,
  liveWorkingStrokeSamples,
} from "./liveWorkingPath.ts";
import type { HanaSmoothCenterlinePoint } from "./smoothCenterline.ts";

function replayLongStroke(rawCount: number) {
  const point = (index: number): HanaStrokePoint => ({
    x: index * 280 / Math.max(1, rawCount - 1),
    y: Math.sin(index * 0.03) * 12,
    pressure: 0.25 + (index % 16) / 100,
    time: index * 4,
  });
  const position = (sample: HanaStrokePoint) => ({ x: sample.x, y: sample.y, z: 0 });
  const first = point(0);
  const path = createLiveWorkingPath(first, position(first), 0);
  for (let index = 1; index < rawCount; index += 1) {
    const next = point(index);
    appendLiveWorkingPoint(path, next, position(next), index);
  }
  return { path, samples: liveWorkingStrokeSamples(path) };
}

test("synthetic long strokes keep live work bounded from 100 through 10000 Raw points", () => {
  for (const rawCount of [100, 500, 1000, 2000, 5000, 10000]) {
    const { path, samples } = replayLongStroke(rawCount);
    const centerline: HanaSmoothCenterlinePoint[] = samples.map((sample) => ({
      position: { x: sample.point.x, y: sample.point.y, z: 0 },
      sourceT: sample.sourceT,
      pressure: sample.point.pressure,
      time: sample.point.time,
    }));
    const proxy = sampleLiveProxySegments(centerline, 0.18);

    assert.ok(path.samples.length <= HANA_LIVE_WORKING_MAX_POINTS);
    assert.ok(samples.length <= HANA_LIVE_WORKING_MAX_POINTS + 1);
    assert.ok(proxy.length <= 192);
    assert.equal(samples[0]?.sourcePointStart, 0);
    assert.equal(samples[samples.length - 1]?.sourcePointStart, rawCount - 1);
    assert.ok(path.samples.every((sample) => sample.sourcePointEnd < rawCount));
  }
});

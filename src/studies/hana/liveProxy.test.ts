import assert from "node:assert/strict";
import test from "node:test";

import type { HanaSmoothCenterlinePoint } from "./smoothCenterline.ts";
import {
  HANA_LIVE_PROXY_MAX_SEGMENTS,
  sampleLiveProxySegments,
} from "./liveProxy.ts";

function longCenterline(): HanaSmoothCenterlinePoint[] {
  return Array.from({ length: 249 }, (_, index) => ({
    position: { x: index * 68.33 / 248, y: Math.sin(index * 0.08) * 0.4, z: index * 0.03 },
    sourceT: index / 248,
    pressure: 0.2,
    time: index,
    segmentIndex: Math.floor(index / 8),
    segmentT: (index % 8) / 8,
  }));
}

test("Live Material Proxy stays bounded and preserves the derived Centerline path", () => {
  const centerline = longCenterline();
  const before = structuredClone(centerline);
  const segments = sampleLiveProxySegments(centerline, 0.18);
  assert.equal(segments.length, HANA_LIVE_PROXY_MAX_SEGMENTS);
  assert.deepEqual(segments[0].start, centerline[0].position);
  assert.deepEqual(segments.at(-1)?.end, centerline.at(-1)?.position);
  assert.ok(segments.every((segment, index) => {
    const points = [segment.start, segment.end];
    return segment.radius === 0.18
      && points.every((point) => (
        Number.isFinite(point.x)
        && Number.isFinite(point.y)
        && Number.isFinite(point.z)
      ))
      && (index === 0 || segment.start.x >= segments[index - 1].start.x);
  }));
  for (let index = 1; index < segments.length; index += 1) {
    assert.deepEqual(segments[index - 1].end, segments[index].start);
  }
  assert.deepEqual(sampleLiveProxySegments(centerline, 0.18), segments);
  assert.deepEqual(centerline, before);
});

test("Short Live Material Proxy uses adjacent Centerline intervals without final sample density", () => {
  const centerline = longCenterline().slice(0, 5);
  const segments = sampleLiveProxySegments(centerline, 0.3, 128);
  assert.equal(segments.length, centerline.length - 1);
  assert.equal(segments[0].radius, 0.3);
  assert.deepEqual(segments.at(-1)?.end, centerline.at(-1)?.position);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPointerEventSamples,
  dedupeExactPointerSamples,
  summarizeRawGestureCapture,
} from "./rawGestureCapture.ts";

function pointer(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    pressure: 0.2,
    timeStamp: 10,
    ...overrides,
  } as PointerEvent;
}

function rawPoint(x: number, y: number, time: number, pressure = 0.2) {
  return { x, y, pressure, time };
}

test("parent + coalesced duplicate keeps every intermediate and one final sample", () => {
  const parent = pointer();
  const candidates = collectPointerEventSamples(parent, [
    pointer({ clientX: 98, clientY: 100, timeStamp: 8 }),
    pointer({ clientX: 99, clientY: 100, timeStamp: 9 }),
    pointer(),
  ]);
  const result = dedupeExactPointerSamples(candidates, null);
  assert.deepEqual(result.accepted.map(({ event }) => event.clientX), [98, 99, 100]);
  assert.equal(result.suppressedExactDuplicateCount, 0);
  assert.equal(collectPointerEventSamples(parent, candidates.slice(0, 2).map(({ event }) => event)).length, 3);
});

test("multiple coalesced samples are all Raw candidates while preview may consume the latest", () => {
  const candidates = collectPointerEventSamples(pointer({ clientX: 104, timeStamp: 14 }), [
    pointer({ clientX: 101, timeStamp: 11 }),
    pointer({ clientX: 102, timeStamp: 12 }),
    pointer({ clientX: 103, timeStamp: 13 }),
  ]);
  const result = dedupeExactPointerSamples(candidates, null);
  assert.equal(result.accepted.length, 4);
  assert.equal(result.accepted.at(-1)?.event.clientX, 104);
});

test("exact duplicates are suppressed without proximity decimation", () => {
  const first = pointer({ clientX: 100, clientY: 100, timeStamp: 10 });
  const candidates = collectPointerEventSamples(first, [first]);
  const result = dedupeExactPointerSamples(candidates, null);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.suppressedExactDuplicateCount, 0);
  const next = dedupeExactPointerSamples([
    { event: pointer({ clientX: 100, clientY: 100, timeStamp: 10 }), source: "parent-pointer-event" },
    { event: pointer({ clientX: 100.001, clientY: 100, timeStamp: 10.001 }), source: "parent-pointer-event" },
  ], result.lastCaptured);
  assert.equal(next.accepted.length, 1);
  assert.equal(next.accepted[0]?.event.clientX, 100.001);
  assert.equal(next.suppressedExactDuplicateCount, 1);
});

test("raw diagnostics report intervals, gaps, spatial jumps, uniqueness, and monotonic time", () => {
  const diagnostics = summarizeRawGestureCapture([
    rawPoint(0, 0, 0),
    rawPoint(1, 0, 10),
    rawPoint(1, 0, 10),
    rawPoint(10, 0, 110),
    rawPoint(11, 0, 90),
  ], { parentPointerEvent: 2, coalescedEvent: 3 }, 1);
  assert.equal(diagnostics.sampleCount, 5);
  assert.equal(diagnostics.uniqueSampleCount, 4);
  assert.equal(diagnostics.exactDuplicateCount, 1);
  assert.equal(diagnostics.suppressedExactDuplicateCount, 1);
  assert.equal(diagnostics.intervalOver50Milliseconds, 1);
  assert.equal(diagnostics.intervalOver100Milliseconds, 0);
  assert.equal(diagnostics.maxSampleInterval, 100);
  assert.equal(diagnostics.maxSpatialJump, 9);
  assert.equal(diagnostics.largestGap?.fromIndex, 2);
  assert.equal(diagnostics.largestGap?.deltaTime, 100);
  assert.equal(diagnostics.monotonicTime, false);
  assert.equal(diagnostics.parentPointerSamples, 2);
  assert.equal(diagnostics.coalescedSamples, 3);
});

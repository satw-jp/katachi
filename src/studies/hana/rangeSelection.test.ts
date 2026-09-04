import assert from "node:assert/strict";
import test from "node:test";

import {
  hanaRangeSegmentTouchesRect,
  isHanaRangePointInRect,
  mergeHanaRangeSelection,
  normalizeHanaRangeRect,
  selectHanaStrokesInRange,
  type HanaRangeStroke,
} from "./rangeSelection.ts";

function stroke(id: string, points: Array<[number, number]>): HanaRangeStroke {
  return { id, polyline: points.map(([x, y]) => ({ x, y })) };
}

test("drag direction decides Window versus Crossing", () => {
  assert.equal(normalizeHanaRangeRect({ x: 10, y: 10 }, { x: 60, y: 40 }).direction, "window");
  assert.equal(normalizeHanaRangeRect({ x: 60, y: 10 }, { x: 10, y: 40 }).direction, "crossing");
  const rect = normalizeHanaRangeRect({ x: 60, y: 40 }, { x: 10, y: 10 });
  assert.deepEqual([rect.left, rect.top, rect.right, rect.bottom], [10, 10, 60, 40]);
});

test("Window keeps fully enclosed Strokes only", () => {
  const rect = normalizeHanaRangeRect({ x: 10, y: 10 }, { x: 60, y: 60 });
  const strokes = [
    stroke("inside-a", [[20, 20], [30, 30], [40, 25]]),
    stroke("crossing-b", [[40, 40], [80, 80]]),
    stroke("outside-c", [[70, 70], [90, 90]]),
  ];
  assert.deepEqual(selectHanaStrokesInRange(strokes, rect), ["inside-a"]);
});

test("Crossing keeps enclosed and intersecting Strokes", () => {
  const rect = normalizeHanaRangeRect({ x: 60, y: 10 }, { x: 10, y: 60 });
  assert.equal(rect.direction, "crossing");
  const strokes = [
    stroke("inside-a", [[20, 20], [30, 30], [40, 25]]),
    stroke("crossing-b", [[40, 40], [80, 80]]),
    stroke("outside-c", [[70, 70], [90, 90]]),
  ];
  assert.deepEqual(selectHanaStrokesInRange(strokes, rect), ["inside-a", "crossing-b"]);
});

test("Crossing detects border intersection even when no point is inside", () => {
  const rect = normalizeHanaRangeRect({ x: 50, y: 10 }, { x: 10, y: 30 });
  assert.equal(hanaRangeSegmentTouchesRect({ x: 0, y: 20 }, { x: 100, y: 20 }, rect), true);
  assert.equal(hanaRangeSegmentTouchesRect({ x: 0, y: 0 }, { x: 5, y: 5 }, rect), false);
  assert.equal(isHanaRangePointInRect({ x: 10, y: 10 }, rect), true);
  assert.equal(isHanaRangePointInRect({ x: 9, y: 10 }, rect), false);
});

test("plain range replaces the set while Shift range adds to it", () => {
  assert.deepEqual(
    mergeHanaRangeSelection({ current: ["stroke-0"], hits: ["stroke-1", "stroke-2"], additive: false }),
    ["stroke-1", "stroke-2"],
  );
  assert.deepEqual(
    mergeHanaRangeSelection({ current: ["stroke-0"], hits: ["stroke-1", "stroke-2"], additive: true }),
    ["stroke-0", "stroke-1", "stroke-2"],
  );
  assert.deepEqual(
    mergeHanaRangeSelection({ current: ["stroke-0", "stroke-1"], hits: ["stroke-1", "stroke-2"], additive: true }),
    ["stroke-0", "stroke-1", "stroke-2"],
  );
  assert.deepEqual(
    mergeHanaRangeSelection({ current: ["stroke-0"], hits: [], additive: false }),
    [],
  );
});

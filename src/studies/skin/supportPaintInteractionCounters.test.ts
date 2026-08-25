import assert from "node:assert/strict";
import test from "node:test";
import { createSupportPaintInteractionCounters, supportPaintInteractionCounterFailures } from "./supportPaintInteractionCounters.ts";

test("300 hover moves remain CSS-only", () => {
  const counters = createSupportPaintInteractionCounters();
  counters.hoverPointerMoves = 300;
  assert.deepEqual(supportPaintInteractionCounterFailures(counters), []);
  assert.equal(counters.hoverSurfaceRaycasts, 0);
  assert.equal(counters.hoverWebglRenders, 0);
  assert.equal(counters.hoverMarkerBufferUpdates, 0);
});

test("drag uses persistent deltas and pointerup only commits one history operation", () => {
  const counters = createSupportPaintInteractionCounters();
  counters.dragPointerMoves = 600;
  counters.dragWorkerRaycasts = 40;
  counters.dragDabRequests = 36;
  counters.dragMarkerPartialUpdates = 120;
  counters.dragWebglRenders = 20;
  counters.pointerupHistoryCommits = 1;
  assert.deepEqual(supportPaintInteractionCounterFailures(counters, true), []);
  counters.paintApplyWorkerLaunches = 1;
  assert.match(supportPaintInteractionCounterFailures(counters).join("; "), /must not launch/);
});

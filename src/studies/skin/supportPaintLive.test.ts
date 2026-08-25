import assert from "node:assert/strict";
import test from "node:test";
import { routeClassifiedSupportSites, applySupportPaintToPolicyResult } from "./overhangSupportPolicy.ts";
import {
  appendSupportPaintStroke,
  buildSupportPaintFrame,
  createSupportPaintStroke,
  emptySupportPaint,
} from "./supportPaint.ts";
import { SupportPaintLiveState } from "./supportPaintLive.ts";

const surface = new Float32Array([
  -10, -10, -2, 10, -10, -2, 0, 10, -2,
  -10, -10, 2, 0, 10, 2, 10, -10, 2,
]);
const sites = Array.from({ length: 120 }, (_, index) => ({
  id: "site-" + index,
  source: "diagnosed-face" as const,
  sourceIndex: Math.floor(index / 4),
  siteIndex: index % 4,
  faceIndex: Math.floor(index / 4),
  classification: index % 2 === 0 ? "inside" as const : "outside" as const,
  positionMm: { xMm: -9 + index * 18 / 119, yMm: 0, zMm: 0 },
  normal: { xMm: 0, yMm: 0, zMm: 1 },
}));
const automatic = routeClassifiedSupportSites({
  sites,
  deduplicationToleranceMm: 1e-6,
  diagnosedFacePositionsMm: new Float32Array(),
  supportSurfacePositionsMm: surface,
});
const frame = buildSupportPaintFrame(surface);

function stroke(order: number, mode: "inside" | "outside" | "auto", xMm: number) {
  return createSupportPaintStroke({
    order,
    mode,
    centerMm: { xMm, yMm: 0, zMm: 0 },
    radiusMm: 4,
    surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 },
    frame,
    paintBackfaces: false,
  });
}

test("persistent live dabs match the existing full-document application", () => {
  let paint = emptySupportPaint(frame.longestMm);
  const strokes = [stroke(0, "outside", -5), stroke(1, "inside", 0), stroke(2, "auto", 4)];
  const live = new SupportPaintLiveState(automatic, surface, null);
  let latest = live.applyDab(strokes[0]);
  paint = appendSupportPaintStroke(paint, strokes[0]);
  for (let index = 1; index < strokes.length; index++) {
    latest = live.applyDab(strokes[index]);
    paint = appendSupportPaintStroke(paint, strokes[index]);
  }
  const full = applySupportPaintToPolicyResult(automatic, surface, paint);
  assert.deepEqual(latest.facts, full.paintFacts);
  const liveClasses = new Map<number, string>();
  const replay = new SupportPaintLiveState(automatic, surface, null).replace(paint);
  for (const change of replay.changes) liveClasses.set(change.siteIndex, change.classification);
  for (let index = 0; index < full.entries.length; index++) {
    assert.equal(liveClasses.get(index) ?? automatic.entries[index].classification, full.entries[index].classification);
  }
});

test("replace supports Undo/Redo documents without reinitializing geometry", () => {
  const first = appendSupportPaintStroke(emptySupportPaint(frame.longestMm), stroke(0, "outside", -4));
  const second = appendSupportPaintStroke(first, stroke(1, "inside", 4));
  const live = new SupportPaintLiveState(automatic, surface, first);
  const redo = live.replace(second);
  const expectedRedo = applySupportPaintToPolicyResult(automatic, surface, second);
  assert.deepEqual(redo.facts, expectedRedo.paintFacts);
  const undo = live.replace(first);
  const expectedUndo = applySupportPaintToPolicyResult(automatic, surface, first);
  assert.deepEqual(undo.facts, expectedUndo.paintFacts);
  assert.ok(undo.changes.length > 0);
});

test("a drag journal restores only changed sites without replaying 929 samples", () => {
  const live = new SupportPaintLiveState(automatic, surface, null);
  const emptyFacts = new SupportPaintLiveState(automatic, surface, null)
    .replace(emptySupportPaint(frame.longestMm)).facts;
  let painted = live.applyDab(stroke(0, "outside", 0));
  for (let order = 1; order < 929; order++) painted = live.applyDab(stroke(order, "outside", 0));
  const beforeChanges = painted.changes.map((change) => {
    const entry = automatic.entries[change.siteIndex];
    return {
      siteIndex: change.siteIndex,
      id: entry.id,
      classification: entry.classification,
      automaticClassification: entry.automaticClassification ?? entry.classification,
      supportPaintStrokeOrder: undefined,
      supportPaintMode: undefined,
      manuallyPainted: false,
      manuallyOverridden: false,
    };
  });
  const startedAt = performance.now();
  const restored = live.restore({ changes: beforeChanges, facts: emptyFacts });
  const elapsedMs = performance.now() - startedAt;
  assert.deepEqual(restored.facts, emptyFacts);
  assert.ok(elapsedMs < 20, `journal restore must be changed-site bounded, got ${elapsedMs.toFixed(2)}ms`);
});

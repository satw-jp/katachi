import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSupportPaintStroke,
  applySupportPaintOverrides,
  appendActiveSupportPaintSample,
  beginSupportPaintStroke,
  buildSupportPaintBrushRing,
  buildSupportPaintFrame,
  commitSupportPaint,
  createSupportPaintHistory,
  createSupportPaintSession,
  createSupportPaintStroke,
  emptySupportPaint,
  finishActiveSupportPaintStroke,
  redoSupportPaint,
  resetSupportPaint,
  shouldSampleSupportPaintPoint,
  undoSupportPaint,
  validateSupportPaint,
  supportPaintVisibilityAllows,
  supportPaintSessionDocument,
  supportPaintWorkerRevisionIsCurrent,
  type SupportPaintMode,
  type SupportPaintSite,
} from "./supportPaint.ts";

const surface = new Float32Array([
  -10, -10, -10, 10, -10, -10, 10, 10, 10,
  -10, -10, -10, 10, 10, 10, -10, 10, 10,
]);
const frame = buildSupportPaintFrame(surface);

function site(id: string, classification: "inside" | "outside" | "unresolved", x: number, normalZ = 1): SupportPaintSite {
  return {
    id,
    classification,
    positionMm: { xMm: x, yMm: 0, zMm: 0 },
    normal: { xMm: 0, yMm: 0, zMm: normalZ },
  };
}

function stroke(paint: ReturnType<typeof emptySupportPaint>, mode: SupportPaintMode, x: number, radiusMm = 3, normalZ = 1) {
  return appendSupportPaintStroke(paint, createSupportPaintStroke({
    order: paint.strokes.length,
    mode,
    centerMm: { xMm: x, yMm: 0, zMm: 0 },
    radiusMm,
    surfaceNormal: { xMm: 0, yMm: 0, zMm: normalZ },
    frame,
    paintBackfaces: false,
  }));
}

test("no paint is byte-for-byte classification equivalent", () => {
  const input = [site("a", "inside", -5), site("b", "outside", 5), site("u", "unresolved", 0)];
  const result = applySupportPaintOverrides({ sites: input, supportSurfacePositionsMm: surface });
  assert.deepEqual(result.sites.map((entry) => entry.classification), input.map((entry) => entry.classification));
  assert.equal(result.facts.manualOverrideSupportSiteCount, 0);
});

test("blue, orange and Auto apply with later stroke priority", () => {
  let paint = emptySupportPaint(frame.longestMm);
  paint = stroke(paint, "inside", 0, 8);
  paint = stroke(paint, "outside", 5, 3);
  let result = applySupportPaintOverrides({ sites: [site("left", "outside", -5), site("right", "inside", 5)], supportSurfacePositionsMm: surface, supportPaint: paint });
  assert.deepEqual(result.sites.map((entry) => entry.classification), ["inside", "outside"]);
  assert.equal(result.facts.manualOverrideSupportSiteCount, 2);
  paint = stroke(paint, "auto", 5, 3);
  result = applySupportPaintOverrides({ sites: [site("left", "outside", -5), site("right", "inside", 5)], supportSurfacePositionsMm: surface, supportPaint: paint });
  assert.deepEqual(result.sites.map((entry) => entry.classification), ["inside", "inside"]);
  assert.equal(result.facts.autoResetSupportSiteCount, 1);
});

test("opposite normals prevent brush penetration", () => {
  let paint = emptySupportPaint(frame.longestMm);
  paint = stroke(paint, "inside", 0, 10, 1);
  const result = applySupportPaintOverrides({
    sites: [site("front", "outside", 0, 1), site("back", "outside", 0, -1)],
    supportSurfacePositionsMm: surface,
    supportPaint: paint,
  });
  assert.deepEqual(result.sites.map((entry) => entry.classification), ["inside", "outside"]);
});

test("unresolved cannot be hidden by paint", () => {
  const paint = stroke(emptySupportPaint(frame.longestMm), "inside", 0, 10);
  const result = applySupportPaintOverrides({ sites: [site("u", "unresolved", 0)], supportSurfacePositionsMm: surface, supportPaint: paint });
  assert.equal(result.sites[0].classification, "unresolved");
  assert.equal(result.facts.manualOverrideSupportSiteCount, 0);
});

test("normalized positions and radii reproject to a changed physical size", () => {
  const paint = stroke(emptySupportPaint(frame.longestMm), "inside", 5, 2);
  const doubledSurface = new Float32Array(Array.from(surface, (value) => value * 2));
  const result = applySupportPaintOverrides({ sites: [site("scaled", "outside", 10)], supportSurfacePositionsMm: doubledSurface, supportPaint: paint });
  assert.equal(result.sites[0].classification, "inside");
});

test("Undo, Redo and reset preserve whole drag checkpoints", () => {
  const base = emptySupportPaint(frame.longestMm);
  const once = stroke(base, "inside", 0);
  let history = createSupportPaintHistory(base);
  history = commitSupportPaint(history, once);
  assert.equal(history.present.strokes.length, 1);
  history = undoSupportPaint(history);
  assert.equal(history.present.strokes.length, 0);
  history = redoSupportPaint(history);
  assert.equal(history.present.strokes.length, 1);
  history = resetSupportPaint(history);
  assert.equal(history.present.strokes.length, 0);
  history = undoSupportPaint(history);
  assert.equal(history.present.strokes.length, 1);
});

test("supportPaint validates a Profile round-trip shape", () => {
  const paint = stroke(emptySupportPaint(frame.longestMm), "outside", 1, 4);
  assert.deepEqual(validateSupportPaint(JSON.parse(JSON.stringify(paint))), paint);
});

test("back sites require an explicit paint-backfaces opt-in", () => {
  assert.equal(supportPaintVisibilityAllows(false, false), true);
  assert.equal(supportPaintVisibilityAllows(true, false), false);
  assert.equal(supportPaintVisibilityAllows(true, true), true);
});

test("brush trajectory samples by radius and one drag remains one undo transaction", () => {
  assert.equal(shouldSampleSupportPaintPoint(null, { xMm: 0, yMm: 0, zMm: 0 }, 6), true);
  assert.equal(shouldSampleSupportPaintPoint(
    { xMm: 0, yMm: 0, zMm: 0 },
    { xMm: 1, yMm: 0, zMm: 0 },
    6,
  ), false);
  assert.equal(shouldSampleSupportPaintPoint(
    { xMm: 0, yMm: 0, zMm: 0 },
    { xMm: 2.1, yMm: 0, zMm: 0 },
    6,
  ), true);

  const base = emptySupportPaint(frame.longestMm);
  const first = createSupportPaintStroke({
    order: 0,
    mode: "inside",
    centerMm: { xMm: 0, yMm: 0, zMm: 0 },
    radiusMm: 6,
    surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 },
    frame,
    paintBackfaces: false,
  });
  const second = createSupportPaintStroke({
    order: 1,
    mode: "inside",
    centerMm: { xMm: 3, yMm: 0, zMm: 0 },
    radiusMm: 6,
    surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 },
    frame,
    paintBackfaces: false,
  });
  let history = createSupportPaintHistory(base);
  history = commitSupportPaint(history, { ...base, strokes: [first, second] });
  assert.equal(history.past.length, 1);
  assert.equal(history.present.strokes.length, 2);
  history = undoSupportPaint(history);
  assert.equal(history.present.strokes.length, 0);
  history = redoSupportPaint(history);
  assert.equal(history.present.strokes.length, 2);
});

test("active and committed paint share one revisioned session and stale workers cannot restore old paint", () => {
  const base = emptySupportPaint(frame.longestMm);
  let session = createSupportPaintSession(base);
  session = beginSupportPaintStroke(session);
  const staleWorkerRevision = session.revision;
  session = appendActiveSupportPaintSample(session, createSupportPaintStroke({
    order: 0, mode: "inside", centerMm: { xMm: 0, yMm: 0, zMm: 0 }, radiusMm: 6,
    surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 }, frame, paintBackfaces: false,
  }));
  assert.equal(supportPaintSessionDocument(session, false).strokes.length, 0);
  assert.equal(supportPaintSessionDocument(session, true).strokes.length, 1);
  assert.equal(supportPaintWorkerRevisionIsCurrent(session, staleWorkerRevision), false);
  session = finishActiveSupportPaintStroke(session, true);
  assert.equal(session.history.present.strokes.length, 1);
  assert.equal(session.activeStroke, null);
  assert.equal(supportPaintWorkerRevisionIsCurrent(session, staleWorkerRevision), false);
  assert.equal(supportPaintWorkerRevisionIsCurrent(session, session.revision), true);
});

test("cancelled active stroke restores the committed document without erasing earlier work", () => {
  const base = stroke(emptySupportPaint(frame.longestMm), "outside", -4);
  let session = createSupportPaintSession(base);
  session = beginSupportPaintStroke(session);
  session = appendActiveSupportPaintSample(session, createSupportPaintStroke({
    order: 1, mode: "inside", centerMm: { xMm: 4, yMm: 0, zMm: 0 }, radiusMm: 4,
    surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 }, frame, paintBackfaces: false,
  }));
  session = finishActiveSupportPaintStroke(session, false);
  assert.deepEqual(session.history.present, base);
});

test("brush ring keeps the requested physical radius on the surface tangent plane", () => {
  const ring = buildSupportPaintBrushRing({ center: { x: 1, y: 2, z: 3 }, normal: { x: 1, y: 1, z: 1 }, radius: 6, segments: 48 });
  assert.equal(ring.length, 48 * 3);
  const normalLength = Math.sqrt(3);
  for (let offset = 0; offset < ring.length; offset += 3) {
    const dx = ring[offset] - 1; const dy = ring[offset + 1] - 2; const dz = ring[offset + 2] - 3;
    assert.ok(Math.abs(Math.hypot(dx, dy, dz) - 6) < 1e-5);
    assert.ok(Math.abs((dx + dy + dz) / normalLength) < 1e-5);
  }
});

test("30k-site ten-dab pointerup core stays below the 500ms editing target", () => {
  const largeSurface = new Float32Array([
    -60, -60, -60, 60, -60, -60, 60, 60, 60,
    -60, -60, -60, 60, 60, 60, -60, 60, 60,
  ]);
  const largeFrame = buildSupportPaintFrame(largeSurface);
  const sites: SupportPaintSite[] = Array.from({ length: 30_000 }, (_, index) => {
    const side = 32;
    return {
      id: "perf-" + index,
      classification: index % 3 === 0 ? "inside" : "outside",
      positionMm: {
        xMm: (index % side) * 3.75 - 58,
        yMm: (Math.floor(index / side) % side) * 3.75 - 58,
        zMm: Math.floor(index / (side * side)) * 3.75 - 58,
      },
      normal: { xMm: 0, yMm: 0, zMm: 1 },
    };
  });
  let paint = emptySupportPaint(largeFrame.longestMm);
  for (let index = 0; index < 10; index++) {
    paint = appendSupportPaintStroke(paint, createSupportPaintStroke({
      order: index,
      mode: index % 2 === 0 ? "inside" : "outside",
      centerMm: { xMm: -30 + index * 7, yMm: 0, zMm: 0 },
      radiusMm: 6,
      surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 },
      frame: largeFrame,
      paintBackfaces: false,
    }));
  }
  const started = performance.now();
  const result = applySupportPaintOverrides({
    sites,
    supportSurfacePositionsMm: largeSurface,
    supportPaint: paint,
  });
  const computeMs = performance.now() - started;
  assert.equal(result.facts.paintedSupportSiteCount, 106);
  assert.equal(result.facts.manualOverrideSupportSiteCount, 50);
  assert.ok(computeMs < 500, "Worker core should remain within the authoring target");
  console.info("[Support Paint pointerup core 30k/10]", computeMs.toFixed(2) + "ms");
});

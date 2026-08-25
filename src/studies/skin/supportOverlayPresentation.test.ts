import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORT_BACK_SCREEN_DOOR_COVERAGE,
  SUPPORT_SITE_PRESENTATION,
  buildSupportOverlayBatch,
  supportBackDitherRanks,
  supportOverlayPasses,
  supportOverlayPickingIncludesBack,
  type SupportOverlayMarkerInput,
} from "./supportOverlayPresentation.ts";

const marker = (
  classification: SupportOverlayMarkerInput["classification"],
  x: number,
): SupportOverlayMarkerInput => ({
  id: classification + "-" + x,
  classification,
  markerRadius: 0.5,
  position: { x, y: 2, z: 3 },
});

test("classification hue and glyph stay fixed in one camera-independent batch", () => {
  assert.deepEqual(SUPPORT_SITE_PRESENTATION, {
    inside: { colorHex: 0x3185ff, glyph: "circle" },
    outside: { colorHex: 0xff922e, glyph: "triangle" },
    unresolved: { colorHex: 0xff3b30, glyph: "cross" },
  });
  const markers = [marker("inside", 1), marker("outside", 2), marker("unresolved", 3)];
  const beforeRotation = buildSupportOverlayBatch(markers);
  const afterRotation = buildSupportOverlayBatch(markers);
  assert.deepEqual(afterRotation, beforeRotation);
  assert.deepEqual(beforeRotation?.classifications, ["inside", "outside", "unresolved"]);
  assert.deepEqual(Array.from(beforeRotation?.glyphIndices ?? []), [0, 1, 2]);
});

test("front uses depth writes while back uses order-independent 18.75% screen-door coverage", () => {
  assert.deepEqual(supportOverlayPasses("front-only"), [
    { kind: "front", depthTest: true, depthWrite: true, screenDoorCoverage: 1 },
  ]);
  assert.deepEqual(supportOverlayPasses("show-back"), [
    { kind: "back", depthTest: false, depthWrite: false, screenDoorCoverage: SUPPORT_BACK_SCREEN_DOOR_COVERAGE },
    { kind: "front", depthTest: true, depthWrite: true, screenDoorCoverage: 1 },
  ]);
  assert.equal(SUPPORT_BACK_SCREEN_DOOR_COVERAGE, 0.1875);
  const circle = supportBackDitherRanks("circle");
  const triangle = supportBackDitherRanks("triangle");
  const cross = supportBackDitherRanks("cross");
  assert.equal(new Set([...circle, ...triangle, ...cross]).size, 9);
  assert.deepEqual(circle, [0, 1, 2]);
  assert.deepEqual(triangle, [3, 4, 5]);
  assert.deepEqual(cross, [6, 7, 8]);
});

test("picking can include exactly the back sites present in the visible pass", () => {
  assert.equal(supportOverlayPickingIncludesBack("front-only", false), false);
  assert.equal(supportOverlayPickingIncludesBack("front-only", true), false);
  assert.equal(supportOverlayPickingIncludesBack("show-back", false), false);
  assert.equal(supportOverlayPickingIncludesBack("show-back", true), true);
});

test("unresolved zero puts no red cross in the shared display and picking arrays", () => {
  const batch = buildSupportOverlayBatch([
    marker("inside", 1),
    marker("inside", 2),
    marker("outside", 3),
  ]);
  assert.ok(batch);
  assert.deepEqual(batch.classificationCounts, { inside: 2, outside: 1, unresolved: 0 });
  assert.equal(Array.from(batch.glyphIndices).includes(2), false);
  assert.equal(batch.classifications.includes("unresolved"), false);
  const red = [0xff / 0xff, 0x3b / 0xff, 0x30 / 0xff];
  const colors = Array.from(batch.colors);
  assert.equal(colors.some((value, index) =>
    index % 3 === 0 && value === red[0] && colors[index + 1] === red[1] && colors[index + 2] === red[2]
  ), false);
});

test("one batch preserves every id, classification count and coordinate", () => {
  const markers = [
    marker("inside", 1),
    marker("inside", 2),
    marker("outside", 3),
    marker("unresolved", 4),
  ];
  const batch = buildSupportOverlayBatch(markers);
  assert.ok(batch);
  assert.deepEqual(batch.classificationCounts, { inside: 2, outside: 1, unresolved: 1 });
  assert.deepEqual(Array.from(batch.positions), [1, 2, 3, 2, 2, 3, 3, 2, 3, 4, 2, 3]);
  assert.deepEqual(batch.ids, ["inside-1", "inside-2", "outside-3", "unresolved-4"]);
  assert.deepEqual(batch.classifications, ["inside", "inside", "outside", "unresolved"]);
});

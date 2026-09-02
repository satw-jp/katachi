import assert from "node:assert/strict";
import test from "node:test";

import type { HanaEditorState, HanaViewportStroke } from "./gesture.ts";
import {
  HANA_CONTROL_POINT_COUNT,
  HANA_CURVE_SETTINGS,
  HANA_DOCUMENT_FORMAT,
  applyViewportEdit,
  createHanaDocument,
  deriveStroke3D,
  resampleRawGesture,
} from "./stroke3d.ts";

function rawStroke(): HanaViewportStroke {
  return {
    id: "gesture-1",
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: Array.from({ length: 65 }, (_, index) => ({
      x: index,
      y: index * 0.5,
      pressure: index / 128,
      time: index * 4,
    })),
  };
}

function editorState(): HanaEditorState {
  return {
    viewportMode: "four",
    selectedViewportId: "viewport-front",
    split: { x: 0.5, y: 0.5 },
    softEditStrength: "medium",
    viewports: [],
  };
}

test("raw gesture is deterministically resampled to 32 ordered controls", () => {
  const first = resampleRawGesture(rawStroke().points);
  const second = resampleRawGesture(rawStroke().points);
  assert.equal(first.length, HANA_CONTROL_POINT_COUNT);
  assert.deepEqual(first, second);
  assert.equal(first[0].sourceT, 0);
  assert.equal(first[first.length - 1]?.sourceT, 1);
  assert.ok(first.every((sample, index) => index === 0 || sample.point.time >= first[index - 1].point.time));
});

test("derived Stroke3D keeps pressure/time provenance separate from editable position", () => {
  const raw = rawStroke();
  const stroke = deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: -point.y }));
  assert.equal(stroke.controlPoints.length, 32);
  assert.equal(stroke.sourceGestureId, raw.id);
  assert.equal(stroke.sourceViewDirection, "front");
  assert.equal(stroke.controlPoints[0].position.x, 0);
  assert.equal(stroke.controlPoints[0].position.y, 0);
  assert.equal(Math.abs(stroke.controlPoints[0].position.z), 0);
  assert.equal(stroke.controlPoints[10].provenance.sourceStroke, raw.id);
  assert.ok(stroke.controlPoints[10].provenance.pressure > 0);
  assert.ok(stroke.controlPoints[10].provenance.time > 0);
});

test("provisional Stroke3D can follow a short growing gesture without mutating Raw Gesture", () => {
  const raw = rawStroke();
  raw.points = raw.points.slice(0, 3);
  const before = structuredClone(raw);
  const provisional = deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: -point.y }), raw.points.length);
  assert.equal(provisional.controlPoints.length, 3);
  assert.ok(provisional.controlPoints.every((point) => (
    Number.isFinite(point.position.x)
    && Number.isFinite(point.position.y)
    && Number.isFinite(point.position.z)
    && Number.isFinite(point.provenance.sourceT)
    && Number.isFinite(point.provenance.pressure)
    && Number.isFinite(point.provenance.time)
  )));
  assert.deepEqual(raw, before);
});

test("viewport edit changes only the two visible axes", () => {
  const makePoint = () => ({ id: "control-1", position: { x: 1, y: 2, z: 3 }, provenance: {
    sourceStroke: "gesture-1", sourceT: 0.5, sourcePointStart: 1, sourcePointEnd: 2, pressure: 0.4, time: 8,
  } });
  const front = makePoint();
  const right = makePoint();
  const top = makePoint();
  applyViewportEdit(front, "front", { x: 7, y: 99, z: 8 });
  applyViewportEdit(right, "right", { x: 99, y: 7, z: 8 });
  applyViewportEdit(top, "top", { x: 7, y: 8, z: 99 });
  assert.deepEqual(front.position, { x: 7, y: 2, z: 8 });
  assert.deepEqual(right.position, { x: 1, y: 7, z: 8 });
  assert.deepEqual(top.position, { x: 7, y: 8, z: 3 });
  assert.equal(right.provenance.pressure, 0.4);
  assert.equal(right.provenance.time, 8);
});

test("document export deep-clones raw gestures, Stroke3D and editor state", () => {
  const raw = rawStroke();
  const stroke = deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }));
  const state = editorState();
  const document = createHanaDocument([raw], [stroke], state);
  assert.equal(document.format, HANA_DOCUMENT_FORMAT);
  assert.equal(document.rawGestures.strokes.length, 1);
  assert.equal(document.strokes3D.length, 1);
  assert.deepEqual(document.strokes3D[0].curve, HANA_CURVE_SETTINGS);
  assert.equal("smoothCenterline" in document.strokes3D[0], false);
  assert.equal(document.editorState.softEditStrength, "medium");
  document.rawGestures.strokes[0].points[0].pressure = 1;
  document.strokes3D[0].controlPoints[0].position.y = 42;
  document.editorState.split.x = 0.7;
  assert.equal(raw.points[0].pressure, 0);
  assert.equal(stroke.controlPoints[0].position.y, 0);
  assert.equal(state.split.x, 0.5);
});

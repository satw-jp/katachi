import assert from "node:assert/strict";
import test from "node:test";

import {
  HANA_GESTURE_FORMAT,
  createGesturePayload,
  pointerTypeFromBrowser,
  pressureDisplayWidth,
  pressureStats,
  type HanaEditorState,
  type HanaViewportStroke,
} from "./gesture.ts";

function fixtureStroke(): HanaViewportStroke {
  return {
    id: "stroke-1",
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 640, height: 420 },
    points: [
      { x: 12.5, y: 20.25, pressure: 0.125, time: 0 },
      { x: 18.75, y: 24.5, pressure: 0.53125, time: 8.4 },
    ],
  };
}

function fixtureEditorState(): HanaEditorState {
  return {
    viewportMode: "four",
    selectedViewportId: "viewport-front",
    split: { x: 0.5, y: 0.5 },
    viewports: [
      {
        id: "viewport-front",
        viewDirection: "front",
        interactionMode: "draw",
        camera: {
          position: [0, -10, 0],
          up: [0, 0, 1],
          target: [0, 0, 0],
          zoom: 1,
        },
      },
    ],
  };
}

test("browser pointer identity keeps pen and touch distinct from mouse", () => {
  assert.equal(pointerTypeFromBrowser("pen"), "pen");
  assert.equal(pointerTypeFromBrowser("touch"), "touch");
  assert.equal(pointerTypeFromBrowser("mouse"), "mouse");
  assert.equal(pointerTypeFromBrowser(""), "mouse");
});

test("pressure display width is visual only and bounded", () => {
  assert.equal(pressureDisplayWidth(-1), 1);
  assert.equal(pressureDisplayWidth(0.5), 5.5);
  assert.equal(pressureDisplayWidth(2), 10);
});

test("pressure summary reports the raw range and distinct sample count", () => {
  assert.deepEqual(pressureStats(fixtureStroke()), {
    min: 0.125,
    max: 0.53125,
    distinct: 2,
  });
  assert.equal(pressureStats(null), null);
});

test("export separates raw gesture from editor state without changing samples", () => {
  const stroke = fixtureStroke();
  const editorState = fixtureEditorState();
  const payload = createGesturePayload([stroke], editorState);

  assert.equal(payload.format, HANA_GESTURE_FORMAT);
  assert.deepEqual(payload.rawGesture.strokes[0], stroke);
  assert.deepEqual(payload.editorState, editorState);
  assert.equal("camera" in payload.rawGesture.strokes[0], false);
  assert.equal("x3" in payload.rawGesture.strokes[0].points[0], false);

  payload.rawGesture.strokes[0].points[0].pressure = 0.9;
  payload.editorState.viewports[0].camera.position[0] = 99;
  assert.equal(stroke.points[0].pressure, 0.125);
  assert.equal(editorState.viewports[0].camera.position[0], 0);
});

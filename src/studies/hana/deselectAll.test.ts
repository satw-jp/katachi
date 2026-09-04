import assert from "node:assert/strict";
import test from "node:test";

import {
  addHanaStroke,
  createDefaultHanaEditorState,
  createHanaAuthoringDocument,
  selectHanaStrokes,
  type HanaAuthoringDocument,
} from "./authoringDocument.ts";
import type { HanaViewportStroke } from "./gesture.ts";
import {
  HANA_POINTER_DRAG_THRESHOLD,
  classifyHanaEmptyDrag,
  pointerMovementExceedsThreshold,
} from "./interactionRouting.ts";
import { sampleMaterialSamples } from "./materialField.ts";
import { sampleSmoothCenterline } from "./smoothCenterline.ts";
import { stroke3DFromHanaStroke } from "./authoringDocument.ts";
import type { HanaStroke3D } from "./stroke3d.ts";
import { resolveHanaSurfaceTarget } from "./surfaceTarget.ts";

function raw(id: string): HanaViewportStroke {
  return {
    id,
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: [
      { x: 0, y: 0, pressure: 0.3, time: 0 },
      { x: 10, y: 2, pressure: 0.5, time: 12 },
    ],
  };
}

function stroke(id: string, rawId: string, offset = 0): HanaStroke3D {
  return {
    id,
    sourceGestureId: rawId,
    sourceViewportId: "viewport-front",
    sourceViewDirection: "front",
    initialPlaneValue: 0,
    curve: { type: "catmull-rom", parameterization: "centripetal", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    controlPoints: [0, 1, 2].map((index) => ({
      id: `${id}-control-${index}`,
      position: { x: offset + index, y: 0, z: index },
      provenance: { sourceStroke: rawId, sourceT: index / 2, sourcePointStart: index, sourcePointEnd: index, pressure: 0.5, time: index },
    })),
  };
}

function twoStrokeDocument(): HanaAuthoringDocument {
  let document = createHanaAuthoringDocument([], [], { editorState: createDefaultHanaEditorState() });
  document = addHanaStroke(document, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  document = addHanaStroke(document, raw("gesture-2", 20), stroke("stroke-2", "gesture-2", 20));
  return selectHanaStrokes(document, ["stroke-1", "stroke-2"]);
}

test("clearing the selection keeps every authoring layer intact", () => {
  const selected = twoStrokeDocument();
  assert.deepEqual(selected.selectedStrokeIds, ["stroke-1", "stroke-2"]);
  const cleared = selectHanaStrokes(selected, []);
  assert.deepEqual(cleared.selectedStrokeIds, []);
  assert.equal(cleared.activeStrokeId, null);
  assert.deepEqual(cleared.strokes.map((item) => item.id), ["stroke-1", "stroke-2"]);
  assert.deepEqual(cleared.rawGestures.strokes.map((item) => item.id), ["gesture-1", "gesture-2"]);
});

test("deselect keeps the Surface target on the current authoring Stroke", () => {
  const selected = twoStrokeDocument();
  const cleared = selectHanaStrokes(selected, ["stroke-1"]);
  const active = cleared.strokes.find((item) => item.id === "stroke-2") ?? cleared.strokes[cleared.strokes.length - 1];
  const centerline = sampleSmoothCenterline(stroke3DFromHanaStroke(active));
  const samples = sampleMaterialSamples(centerline, 0.18);
  assert.ok(samples.length > 0);
  // Live shape after Deselect: selection empty, current target Stroke kept.
  assert.equal(
    resolveHanaSurfaceTarget({
      showSurface: true,
      strokeIds: cleared.strokes.map((item) => item.id),
      activeStrokeId: active.id,
      materialSampleCount: samples.length,
    }),
    active.id,
  );
});

test("empty pointer below threshold taps while mouse primary drag ranges", () => {
  assert.equal(pointerMovementExceedsThreshold(50, 50, 50, 50), false);
  assert.equal(
    pointerMovementExceedsThreshold(50, 50, 50 + HANA_POINTER_DRAG_THRESHOLD, 50),
    true,
  );
  assert.equal(
    classifyHanaEmptyDrag({ pointerType: "mouse", mouseButton: 0, candidateStrokeId: null }),
    "range-select",
  );
});

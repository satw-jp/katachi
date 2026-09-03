import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultHanaEditorState } from "./authoringDocument.ts";
import {
  HANA_AUTHORING_DOCUMENT_FORMAT,
  addHanaStroke,
  createHanaAuthoringDocument,
  migrateHanaDocument,
  removeHanaStroke,
  selectHanaStrokes,
  serializeHanaAuthoringDocument,
  setHanaStrokeRole,
} from "./authoringDocument.ts";
import { HanaUndoRedo } from "./undoRedo.ts";
import type { HanaViewportStroke } from "./gesture.ts";
import type { HanaStroke3D } from "./stroke3d.ts";

function raw(id: string, offset = 0): HanaViewportStroke {
  return {
    id,
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: [
      { x: offset, y: 0, pressure: 0.2, time: 0 },
      { x: offset + 10, y: 3, pressure: 0.5, time: 10 },
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
      position: { x: offset + index, y: 0, z: index * 2 },
      provenance: { sourceStroke: rawId, sourceT: index / 2, sourcePointStart: index, sourcePointEnd: index, pressure: 0.5, time: index },
    })),
  };
}

test("v2 authoring document supports independent multi-stroke selection and deletion", () => {
  let document = createHanaAuthoringDocument([], [], { editorState: createDefaultHanaEditorState() });
  document = addHanaStroke(document, raw("raw-1"), stroke("stroke-1", "raw-1"));
  document = addHanaStroke(document, raw("raw-2", 20), stroke("stroke-2", "raw-2", 20));
  assert.equal(document.format, HANA_AUTHORING_DOCUMENT_FORMAT);
  assert.equal(document.strokes.length, 2);
  document = selectHanaStrokes(document, ["stroke-1"]);
  assert.deepEqual(document.selectedStrokeIds, ["stroke-1"]);
  document = setHanaStrokeRole(document, "stroke-1", "petal");
  assert.equal(document.strokes[0].role, "petal");
  document = removeHanaStroke(document, "stroke-1");
  assert.deepEqual(document.strokes.map((item) => item.id), ["stroke-2"]);
  assert.deepEqual(document.rawGestures.strokes.map((item) => item.id), ["raw-2"]);
});

test("legacy HANA-2A JSON migrates without losing Raw Gesture, controls or provenance", () => {
  const legacy = {
    format: "katachi.hana-document.v1c",
    rawGestures: { strokes: [raw("raw-legacy")] },
    strokes3D: [stroke("stroke-legacy", "raw-legacy")],
    editorState: createDefaultHanaEditorState(),
  };
  const migrated = migrateHanaDocument(legacy);
  assert.equal(migrated.format, HANA_AUTHORING_DOCUMENT_FORMAT);
  assert.equal(migrated.rawGestures.strokes[0].points.length, 2);
  assert.equal(migrated.strokes[0].controlPoints.length, 3);
  assert.equal(migrated.strokes[0].controlPoints[1].provenance.sourceStroke, "raw-legacy");
  const roundTrip = migrateHanaDocument(JSON.parse(serializeHanaAuthoringDocument(migrated)));
  assert.deepEqual(roundTrip, migrated);
});

test("authoring Undo/Redo does not retain derived state", () => {
  const history = new HanaUndoRedo({ strokes: ["stroke-1"], derivedMesh: { triangles: 12 } });
  history.commit({ strokes: ["stroke-1", "stroke-2"], derivedMesh: { triangles: 24 } }, "Draw Stroke");
  assert.deepEqual(history.undo(), { strokes: ["stroke-1"], derivedMesh: { triangles: 12 } });
  assert.deepEqual(history.redo(), { strokes: ["stroke-1", "stroke-2"], derivedMesh: { triangles: 24 } });
});

import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultHanaEditorState } from "./authoringDocument.ts";
import {
  HANA_AUTHORING_DOCUMENT_FORMAT,
  allocateHanaAuthoringId,
  addHanaStroke,
  createHanaAuthoringIdentity,
  createHanaAuthoringDocument,
  deleteHanaStrokes,
  migrateHanaDocument,
  removeHanaStroke,
  selectHanaStrokes,
  serializeHanaAuthoringDocument,
  setHanaStrokeRole,
  validateHanaAuthoringDocument,
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

test("authoring identity allocates monotonically across deletion and undo", () => {
  const identity = createHanaAuthoringIdentity(
    [{ id: "gesture-1" }, { id: "gesture-3" }],
    [{ id: "stroke-1" }, { id: "stroke-3" }],
  );
  assert.equal(allocateHanaAuthoringId(identity, "gesture"), "gesture-4");
  assert.equal(allocateHanaAuthoringId(identity, "stroke"), "stroke-4");
  assert.equal(identity.nextGestureOrdinal, 5);
  assert.equal(identity.nextStrokeOrdinal, 5);
});

test("identity metadata survives authoring document save and legacy migration", () => {
  const document = createHanaAuthoringDocument(
    [raw("gesture-1"), raw("gesture-5")],
    [stroke("stroke-1", "gesture-1"), stroke("stroke-5", "gesture-5")],
    {
      documentId: "identity-document",
      editorState: createDefaultHanaEditorState(),
      identity: { nextGestureOrdinal: 9, nextStrokeOrdinal: 11 },
    },
  );
  const roundTrip = migrateHanaDocument(JSON.parse(serializeHanaAuthoringDocument(document)));
  assert.deepEqual(roundTrip.identity, { nextGestureOrdinal: 9, nextStrokeOrdinal: 11 });
  const legacy = migrateHanaDocument({
    rawGestures: { strokes: [raw("gesture-1"), raw("gesture-8")] },
    strokes: [stroke("stroke-2", "gesture-1"), stroke("stroke-9", "gesture-8")],
    editorState: createDefaultHanaEditorState(),
  });
  assert.deepEqual(legacy.identity, { nextGestureOrdinal: 9, nextStrokeOrdinal: 10 });
});

test("duplicate authoring identities fail validation without silent repair", () => {
  const document = migrateHanaDocument({
    rawGestures: { strokes: [raw("gesture-3"), raw("gesture-3")] },
    strokes: [stroke("stroke-3", "gesture-3"), stroke("stroke-3", "gesture-3")],
    editorState: createDefaultHanaEditorState(),
  });
  const validation = validateHanaAuthoringDocument(document);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.issues, [
    "Duplicate Raw Gesture id: gesture-3",
    "Duplicate Stroke id: stroke-3",
  ]);
  assert.equal(document.rawGestures.strokes.length, 2);
  assert.equal(document.strokes.length, 2);
});

test("delete retains a Raw Gesture that a surviving Stroke still references", () => {
  const sharedRaw = raw("gesture-shared");
  let document = createHanaAuthoringDocument(
    [sharedRaw],
    [stroke("stroke-1", sharedRaw.id), stroke("stroke-2", sharedRaw.id)],
    { editorState: createDefaultHanaEditorState() },
  );
  document = selectHanaStrokes(document, ["stroke-1"]);
  document = removeHanaStroke(document, "stroke-1");
  assert.deepEqual(document.strokes.map((item) => item.id), ["stroke-2"]);
  assert.deepEqual(document.rawGestures.strokes.map((item) => item.id), ["gesture-shared"]);
  assert.equal(document.identity.nextStrokeOrdinal, 3);
});

test("Delete Selected is one semantic transaction and identity high-water survives undo/redo", () => {
  let document = createHanaAuthoringDocument(
    [raw("gesture-1"), raw("gesture-2")],
    [stroke("stroke-1", "gesture-1"), stroke("stroke-2", "gesture-2")],
    { editorState: createDefaultHanaEditorState() },
  );
  document = selectHanaStrokes(document, ["stroke-1"]);
  const history = new HanaUndoRedo({ document });
  const deleted = deleteHanaStrokes(document, ["stroke-1"]);
  history.commit({ document: deleted }, "Delete Selected Strokes");
  const undone = history.undo();
  const redone = history.redo();
  assert.deepEqual(undone?.document.strokes.map((item) => item.id), ["stroke-1", "stroke-2"]);
  assert.deepEqual(redone?.document.strokes.map((item) => item.id), ["stroke-2"]);
  assert.equal(redone?.document.identity.nextStrokeOrdinal, 3);
});

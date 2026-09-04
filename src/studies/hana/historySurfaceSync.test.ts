import assert from "node:assert/strict";
import test from "node:test";

import {
  addHanaStroke,
  allocateHanaAuthoringId,
  cloneHanaAuthoringDocument,
  createDefaultHanaEditorState,
  createHanaAuthoringDocument,
  createHanaAuthoringIdentity,
  mergeHanaAuthoringIdentity,
  serializeHanaAuthoringDocument,
  updateHanaStroke,
  type HanaAuthoringDocument,
} from "./authoringDocument.ts";
import { createAuthoringGraph } from "./authoringGraph.ts";
import { HanaAuthoringHistory, emptyHanaAuthoringHistoryRoot, type HanaAuthoringHistorySnapshot } from "./authoringHistory.ts";
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

function emptyDocument(documentId: string): HanaAuthoringDocument {
  return createHanaAuthoringDocument([], [], {
    documentId,
    editorState: createDefaultHanaEditorState(),
  });
}

function snapshotFor(document: HanaAuthoringDocument): HanaAuthoringHistorySnapshot {
  return { document: cloneHanaAuthoringDocument(document), flowers: [], graph: createAuthoringGraph(), activeFlowerId: null };
}

test("New clears every authoring layer and restarts identity with an empty history root", () => {
  let document = emptyDocument("hana-document-before-new");
  document = addHanaStroke(document, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  document = addHanaStroke(document, raw("gesture-2", 20), stroke("stroke-2", "gesture-2", 20));
  const history = new HanaAuthoringHistory(snapshotFor(emptyDocument("hana-document-before-new")));
  history.commit(snapshotFor(document), "Draw Stroke");

  const fresh = emptyDocument("hana-document-after-new");
  assert.equal(fresh.rawGestures.strokes.length, 0);
  assert.equal(fresh.strokes.length, 0);
  assert.deepEqual(fresh.selectedStrokeIds, []);
  assert.equal(fresh.activeStrokeId, null);
  assert.notEqual(fresh.documentId, document.documentId);
  assert.deepEqual(fresh.identity, { nextGestureOrdinal: 1, nextStrokeOrdinal: 1 });

  history.reset({ document: fresh, flowers: [], graph: createAuthoringGraph(), activeFlowerId: null });
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), null);
  assert.equal(history.current.document.strokes.length, 0);
  assert.equal(history.current.document.rawGestures.strokes.length, 0);
});

test("first Draw Undo returns to the empty root and Redo restores Stroke plus Raw Gesture", () => {
  const history = new HanaAuthoringHistory({
    document: emptyDocument("hana-new-empty"),
    flowers: [],
    graph: createAuthoringGraph(),
    activeFlowerId: null,
  });
  let drawn = emptyDocument("hana-new-empty");
  drawn = addHanaStroke(drawn, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  history.commit(snapshotFor(drawn), "Draw Stroke");

  const undone = history.undo();
  assert.equal(undone?.document.strokes.length, 0);
  assert.equal(undone?.document.rawGestures.strokes.length, 0);

  const redone = history.redo();
  assert.deepEqual(redone?.document.strokes.map((item) => item.id), ["stroke-1"]);
  assert.deepEqual(redone?.document.rawGestures.strokes.map((item) => item.id), ["gesture-1"]);
});

test("Edit Undo restores the semantic revision and history never stores derived Surface state", () => {
  let document = emptyDocument("hana-edit-surface");
  document = addHanaStroke(document, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  const history = new HanaAuthoringHistory(snapshotFor(document));
  const edited = updateHanaStroke(document, "stroke-1", (item) => ({
    ...item,
    controlPoints: item.controlPoints.map((point, index) => (
      index === 1 ? { ...point, position: { ...point.position, x: point.position.x + 5 } } : point
    )),
  }));
  assert.equal(edited.strokes[0].revision, 1);
  history.commit(snapshotFor(edited), "Edit Stroke");

  const undone = history.undo();
  assert.equal(undone?.document.strokes[0].revision, 0);
  assert.equal(undone?.document.strokes[0].controlPoints[1].position.x, 1);

  const redone = history.redo();
  assert.equal(redone?.document.strokes[0].revision, 1);
  assert.equal(redone?.document.strokes[0].controlPoints[1].position.x, 6);

  for (const entry of [undone, redone]) {
    assert.deepEqual(Object.keys(entry!).sort(), ["activeFlowerId", "document", "flowers", "graph"]);
    const serialized = JSON.stringify(entry);
    assert.equal(serialized.includes("triangles"), false);
    assert.equal(serialized.includes("previewSurface"), false);
    assert.equal(serialized.includes("materialSamples"), false);
  }
  const serializedDocument = serializeHanaAuthoringDocument(edited);
  assert.equal(serializedDocument.includes("triangles"), false);
});

test("late async results cannot mutate history and revision mismatch marks them stale", () => {
  let document = emptyDocument("hana-stale-async");
  document = addHanaStroke(document, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  const history = new HanaAuthoringHistory(snapshotFor(document));
  const edited = updateHanaStroke(document, "stroke-1", (item) => ({
    ...item,
    controlPoints: item.controlPoints.map((point) => ({
      ...point,
      position: { ...point.position, x: point.position.x + 2 },
    })),
  }));
  history.commit(snapshotFor(edited), "Edit Stroke");

  const servedBeforeUndo = history.current;
  servedBeforeUndo.document.strokes.push(structuredClone(servedBeforeUndo.document.strokes[0]));
  assert.equal(history.current.document.strokes.length, 1);

  const staleRevision = history.current.document.revision;
  const undone = history.undo();
  assert.notEqual(undone?.document.revision, staleRevision);
});

test("Undo keeps the identity high-water so the next Draw allocates stroke-3", () => {
  const identity = createHanaAuthoringIdentity();
  assert.equal(allocateHanaAuthoringId(identity, "gesture"), "gesture-1");
  assert.equal(allocateHanaAuthoringId(identity, "gesture"), "gesture-2");
  assert.equal(allocateHanaAuthoringId(identity, "stroke"), "stroke-1");
  assert.equal(allocateHanaAuthoringId(identity, "stroke"), "stroke-2");

  const merged = mergeHanaAuthoringIdentity(
    createHanaAuthoringIdentity(),
    identity,
  );
  assert.equal(allocateHanaAuthoringId(merged, "stroke"), "stroke-3");
  assert.equal(allocateHanaAuthoringId(merged, "gesture"), "gesture-3");
});

test("fallback history root preserves the namespace but holds no authoring content", () => {
  let drawn = emptyDocument("hana-fallback-namespace");
  drawn = addHanaStroke(drawn, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  const root = emptyHanaAuthoringHistoryRoot(snapshotFor(drawn));
  assert.equal(root.document.documentId, "hana-fallback-namespace");
  assert.deepEqual(root.document.identity, drawn.identity);
  assert.equal(root.document.rawGestures.strokes.length, 0);
  assert.equal(root.document.strokes.length, 0);
  assert.deepEqual(root.document.selectedStrokeIds, []);
  assert.equal(root.document.activeStrokeId, null);
  assert.equal(root.flowers.length, 0);
  assert.deepEqual(root.graph.nodes, []);
  assert.deepEqual(root.graph.edges, []);
  assert.equal(root.activeFlowerId, null);
});

test("first mutation without a session history still keeps its Undo boundary", () => {
  let drawn = emptyDocument("hana-first-mutation");
  drawn = addHanaStroke(drawn, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  const first = snapshotFor(drawn);
  const history = new HanaAuthoringHistory(emptyHanaAuthoringHistoryRoot(first));
  assert.equal(history.canUndo, false);
  history.commit(first, "Draw Stroke");
  assert.equal(history.canUndo, true);

  const undone = history.undo();
  assert.equal(undone?.document.rawGestures.strokes.length, 0);
  assert.equal(undone?.document.strokes.length, 0);
  assert.equal(history.canUndo, false);

  const redone = history.redo();
  assert.deepEqual(redone?.document.strokes.map((item) => item.id), ["stroke-1"]);
  assert.deepEqual(redone?.document.rawGestures.strokes.map((item) => item.id), ["gesture-1"]);
});

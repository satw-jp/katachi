import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultHanaEditorState, createHanaAuthoringDocument } from "./authoringDocument.ts";
import { createAuthoringGraph } from "./authoringGraph.ts";
import { HanaAuthoringHistory, type HanaAuthoringHistorySnapshot } from "./authoringHistory.ts";

function snapshot(strokeCount: number, revision: number): HanaAuthoringHistorySnapshot {
  const document = createHanaAuthoringDocument([], [], {
    documentId: "history-test",
    editorState: createDefaultHanaEditorState(),
  });
  document.revision = revision;
  document.strokes = Array.from({ length: strokeCount }, (_, index) => ({
    id: `stroke-${index + 1}`,
    rawGestureId: `gesture-${index + 1}`,
    controlPoints: [],
    curveSettings: { type: "centripetal-catmull-rom", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    materialSettings: { mapping: "uniform", baseRadius: 0.18, minRadius: 0.05, maxRadius: 0.5, pressureInfluence: 0, speedInfluence: 0 },
    revision: 0,
    role: "free",
    visible: true,
  }));
  return { document, flowers: [], graph: createAuthoringGraph(), activeFlowerId: null };
}

test("global authoring history provides one Draw-like Undo/Redo boundary", () => {
  const history = new HanaAuthoringHistory(snapshot(0, 0));
  history.commit(snapshot(1, 1), "Draw Stroke");
  history.commit(snapshot(2, 2), "Draw Stroke");
  assert.equal(history.canUndo, true);
  assert.equal(history.undo()?.document.strokes.length, 1);
  assert.equal(history.redo()?.document.strokes.length, 2);
});

test("global history reset makes New/Load a session boundary", () => {
  const history = new HanaAuthoringHistory(snapshot(3, 3));
  history.reset(snapshot(0, 0));
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), null);
});

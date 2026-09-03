import assert from "node:assert/strict";
import test from "node:test";
import { createHanaAuthoringStudy } from "./authoringStudy.ts";

test("End-to-end authoring study contains stem, core, five petals, graph, profiles, and bridge", () => {
  const study = createHanaAuthoringStudy();
  assert.equal(study.document.strokes.length, 7);
  assert.equal(study.flowers.length, 1);
  assert.equal(study.flowers[0]?.petalStrokeIds.length, 5);
  assert.equal(study.flowers[0]?.coreStrokeIds.length, 1);
  assert.equal(study.graph.edges.filter((edge) => edge.role === "petal").length, 5);
  assert.equal(study.graph.edges.some((edge) => edge.role === "stem"), true);
  assert.equal(study.graph.edges.some((edge) => edge.role === "connector"), true);
  assert.equal(study.runtime.every((entry) => entry.smoothCount > 0 && entry.materialSamples.length > 0), true);
  const firstProfile = study.runtime.find((entry) => entry.strokeId === "petal-1")?.materialProfile ?? [];
  assert.ok(new Set(firstProfile.map((sample) => sample.radius.toFixed(6))).size > 1);
  assert.equal(study.bridgeValidation.valid, true);
});

test("End-to-end study document and semantic bridge survive JSON reload and authoring undo/redo", () => {
  const study = createHanaAuthoringStudy();
  assert.equal(study.reloadedDocument.strokes.length, study.document.strokes.length);
  assert.equal(study.reloadedDocument.rawGestures.strokes.length, study.document.rawGestures.strokes.length);
  assert.equal(study.reloadedBridge.flowers[0]?.provenance.sourceGestureIds.length, 6);
  assert.equal(study.undoRedo.undoRestored, true);
  assert.equal(study.undoRedo.redoRestored, true);
  assert.equal(study.serializedBridge, JSON.stringify(study.reloadedBridge, null, 2));
  assert.ok(!study.serializedDocument.includes("materialSamples"));
});

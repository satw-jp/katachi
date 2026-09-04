import assert from "node:assert/strict";
import test from "node:test";
import {
  createHanaRecoveryCheckpoint,
  createMemoryHanaRecoveryStore,
  HANA_RECOVERY_ALGORITHM_VERSION,
  isNewerHanaRecoveryCheckpoint,
  parseHanaRecoveryCheckpoint,
  validateHanaRecoveryCheckpoint,
} from "./recoveryCheckpoint.ts";
import { createDefaultHanaEditorState, createHanaAuthoringDocument } from "./authoringDocument.ts";
import { createHanaFlowerFromSelection } from "./flowerAuthoring.ts";
import { addAuthoringNode, connectAuthoringNodes, createAuthoringGraph } from "./authoringGraph.ts";

function documentFixture() {
  return createHanaAuthoringDocument([], [], {
    documentId: "recovery-fixture",
    editorState: createDefaultHanaEditorState(),
  });
}

test("recovery checkpoint round-trips authoring document and metadata", async () => {
  const document = documentFixture();
  const checkpoint = createHanaRecoveryCheckpoint(document, { savedAt: "2026-09-04T00:00:00.000Z" });
  assert.equal(validateHanaRecoveryCheckpoint(checkpoint).valid, true);
  assert.deepEqual(parseHanaRecoveryCheckpoint(JSON.parse(JSON.stringify(checkpoint))), checkpoint);

  const store = createMemoryHanaRecoveryStore();
  await store.save(checkpoint);
  assert.deepEqual(await store.load(document.documentId), checkpoint);
  assert.equal(isNewerHanaRecoveryCheckpoint(checkpoint, document.documentId, 0), true);
  await store.clear(document.documentId);
  assert.equal(await store.load(document.documentId), null);
});

test("recovery checkpoint rejects incompatible or stale schema data", () => {
  const checkpoint = createHanaRecoveryCheckpoint(documentFixture(), { savedAt: "2026-09-04T00:00:00.000Z" });
  const wrongAlgorithm = { ...checkpoint, algorithmVersion: "other" };
  assert.equal(validateHanaRecoveryCheckpoint(wrongAlgorithm).valid, false);
  assert.throws(() => parseHanaRecoveryCheckpoint(wrongAlgorithm), /algorithm version/);
  assert.equal(isNewerHanaRecoveryCheckpoint(checkpoint, "other-document", 0), false);
  assert.equal(HANA_RECOVERY_ALGORITHM_VERSION, "hana-authoring-stack-v0");
});

test("recovery checkpoint preserves optional Flower semantics without storing derived geometry", () => {
  const document = createHanaAuthoringDocument([], [], {
    documentId: "flower-recovery-fixture",
    editorState: createDefaultHanaEditorState(),
  });
  const source = {
    id: "stroke-1",
    rawGestureId: "raw-1",
    controlPoints: [{
      id: "control-1",
      position: { x: 1, y: 2, z: 3 },
      provenance: { sourceStroke: "raw-1", sourceT: 0, sourcePointStart: 0, sourcePointEnd: 0, pressure: 0.5, time: 0 },
    }],
    curveSettings: { type: "catmull-rom", parameterization: "centripetal", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    materialSettings: { mapping: "uniform", baseRadius: 0.18, minRadius: 0.05, maxRadius: 0.5, pressureInfluence: 0, speedInfluence: 0 },
    revision: 0,
    role: "free" as const,
    visible: true,
  };
  const withSource = { ...document, strokes: [source], rawGestures: { strokes: [] } };
  const flower = createHanaFlowerFromSelection("flower-1", withSource.strokes, ["stroke-1"]).flower;
  const checkpoint = createHanaRecoveryCheckpoint(withSource, { flowers: [flower], activeFlowerId: flower.id, savedAt: "2026-09-04T00:00:00.000Z" });
  const roundTrip = parseHanaRecoveryCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
  assert.deepEqual(roundTrip.flowers?.[0], flower);
  assert.equal(roundTrip.activeFlowerId, "flower-1");
  assert.equal("materialSamples" in roundTrip, false);
});

test("recovery checkpoint preserves optional Authoring Graph semantics", () => {
  let graph = createAuthoringGraph();
  graph = addAuthoringNode(graph, {
    id: "node-a",
    role: "anchor",
    sourceObjectId: "stroke-a",
    position: { x: 0, y: 0, z: 0 },
    protected: false,
    provenance: { sourceObjectIds: ["stroke-a"], sourceGestureIds: ["raw-a"] },
  });
  graph = addAuthoringNode(graph, {
    id: "node-b",
    role: "free-end",
    sourceObjectId: "stroke-a",
    position: { x: 1, y: 0, z: 0 },
    protected: false,
  });
  graph = connectAuthoringNodes(graph, {
    id: "edge-a-b",
    role: "gesture-stroke",
    sourceObjectId: "stroke-a",
    fromNodeId: "node-a",
    toNodeId: "node-b",
    protected: false,
    provenance: { sourceObjectIds: ["stroke-a"], sourceGestureIds: ["raw-a"] },
  });

  const checkpoint = createHanaRecoveryCheckpoint(documentFixture(), { graph });
  const roundTrip = parseHanaRecoveryCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
  assert.deepEqual(roundTrip.graph, graph);
});

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

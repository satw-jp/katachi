import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_HIKARI_SETTINGS } from "../../src/studies/cloud-sculpt/hikari.ts";
import {
  createHikariCase,
  parseHikariCase,
} from "../../src/studies/cloud-sculpt/hikariCase.ts";
import {
  createHikariDocument,
  hikariDocumentFilename,
  parseHikariDocument,
  serializeHikariDocument,
} from "../../src/studies/cloud-sculpt/hikariDocument.ts";

function fixedCase(caseId: string) {
  return createHikariCase({
    caseId,
    createdAt: "2026-08-01T00:00:00.000Z",
    appVersion: "test",
    commit: "test",
    observation: "",
    shape: { studyId: "cloud-sculpt", recipeEntries: [] },
    hikariSettings: { ...DEFAULT_HIKARI_SETTINGS },
    camera: { position: [4, 2.5, 5], target: [0, 0, 0], fov: 45, aspect: 1 },
    compatibility: { safeModeQuery: "auto", compatibilityMode: false },
    backend: { kind: "cpu", text: "test", requestedSampleCount: 2048 },
  });
}

test(".hkr round-trips multiple named views", () => {
  const document = createHikariDocument({
    documentId: "study-a",
    appVersion: "test",
    commit: "abc",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:01:00.000Z",
    activeViewId: "view-b",
    views: [
      { viewId: "view-a", name: "Morning", createdAt: "2026-08-01T00:00:00.000Z", case: fixedCase("case-a") },
      { viewId: "view-b", name: "Evening", createdAt: "2026-08-01T00:01:00.000Z", case: fixedCase("case-b") },
    ],
  });
  assert.deepEqual(parseHikariDocument(serializeHikariDocument(document)), document);
});

test(".hkr download names include the save time without repeating the date", () => {
  assert.equal(
    hikariDocumentFilename("hikari-2026-08-01", "2026-08-01T08:15:57.783Z"),
    "hikari-2026-08-01T08-15-57-783Z.hkr",
  );
  assert.equal(
    hikariDocumentFilename("purple study", "2026-08-01T08:15:57.783Z"),
    "purple-study-2026-08-01T08-15-57-783Z.hkr",
  );
});

test(".hkr preserves custom transmitted colors and the expressive receiver display", () => {
  const customCase = fixedCase("custom-color");
  customCase.hikariSettings.hostPreset = "custom";
  customCase.hikariSettings.hostTransmissionColor = "#3f8ad1";
  customCase.hikariSettings.inclusionTransmissionColor = "#d17a3f";
  customCase.hikariSettings.inclusionMode = "packed";
  customCase.hikariSettings.inclusionSeed = "saved-packing";
  customCase.hikariSettings.inclusionCount = 9;
  customCase.hikariSettings.inclusionShapeFamily = "mixed";
  customCase.hikariSettings.receiverDisplayMode = "stroke";
  const document = createHikariDocument({
    documentId: "custom-color-study",
    appVersion: "test",
    commit: "abc",
    activeViewId: "view-custom",
    views: [{
      viewId: "view-custom",
      name: "Blue",
      createdAt: "2026-08-01T00:00:00.000Z",
      case: customCase,
    }],
  });
  const restored = parseHikariDocument(serializeHikariDocument(document));
  assert.equal(restored.views[0].case.hikariSettings.hostPreset, "custom");
  assert.equal(restored.views[0].case.hikariSettings.hostTransmissionColor, "#3f8ad1");
  assert.equal(restored.views[0].case.hikariSettings.inclusionTransmissionColor, "#d17a3f");
  assert.equal(restored.views[0].case.hikariSettings.inclusionMode, "packed");
  assert.equal(restored.views[0].case.hikariSettings.inclusionSeed, "saved-packing");
  assert.equal(restored.views[0].case.hikariSettings.inclusionCount, 9);
  assert.equal(restored.views[0].case.hikariSettings.inclusionShapeFamily, "mixed");
  assert.equal(restored.views[0].case.hikariSettings.receiverDisplayMode, "stroke");
});

test(".hkr rejects duplicate view ids and an unknown active view", () => {
  const duplicate = {
    ...createHikariDocument({
      documentId: "study-a",
      appVersion: "test",
      commit: "abc",
      activeViewId: "view-a",
      views: [{ viewId: "view-a", name: "A", createdAt: "2026-08-01T00:00:00.000Z", case: fixedCase("case-a") }],
    }),
  };
  duplicate.views.push(structuredClone(duplicate.views[0]));
  assert.throws(() => parseHikariDocument(JSON.stringify(duplicate)), /重複/);
  duplicate.views.pop();
  duplicate.activeViewId = "missing";
  assert.throws(() => parseHikariDocument(JSON.stringify(duplicate)), /選択ビュー/);
});

test(".hkr rejects malformed history in active and inactive views", () => {
  const document = createHikariDocument({
    documentId: "study-a",
    appVersion: "test",
    commit: "abc",
    activeViewId: "view-a",
    views: [
      { viewId: "view-a", name: "A", createdAt: "2026-08-01T00:00:00.000Z", case: fixedCase("case-a") },
      { viewId: "view-b", name: "B", createdAt: "2026-08-01T00:01:00.000Z", case: fixedCase("case-b") },
    ],
  });
  for (const viewIndex of [0, 1]) {
    const malformed = structuredClone(document) as unknown as {
      views: Array<{ case: { shape: { recipeEntries: unknown[] } } }>;
    };
    malformed.views[viewIndex].case.shape.recipeEntries = [{
      t: 0,
      op: "addBall",
      args: {},
    }];
    assert.throws(() => parseHikariDocument(JSON.stringify(malformed)), /操作履歴/);
  }
});

test("legacy case validation rejects malformed operation args and backend counts", () => {
  const malformedHistory = structuredClone(fixedCase("legacy")) as unknown as {
    shape: { recipeEntries: unknown[] };
  };
  malformedHistory.shape.recipeEntries = [{
    t: 0,
    op: "setParam",
    args: { key: "unknown", value: Number.NaN },
  }];
  assert.throws(() => parseHikariCase(JSON.stringify(malformedHistory)), /操作履歴/);

  const malformedBackend = structuredClone(fixedCase("legacy")) as unknown as {
    backend: { requestedSampleCount: number };
  };
  malformedBackend.backend.requestedSampleCount = Number.POSITIVE_INFINITY;
  assert.throws(() => parseHikariCase(JSON.stringify(malformedBackend)), /計算情報/);
});

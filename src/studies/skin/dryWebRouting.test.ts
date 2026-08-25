import assert from "node:assert/strict";
import test from "node:test";
import { resolveDryWebRouting } from "./dryWebRouting.ts";
import type { OverhangAssignmentEntry } from "./overhangSupportPolicy.ts";

function entry(
  id: string,
  automatic: "inside" | "outside",
  final: "inside" | "outside",
  supportPaintMode?: "inside" | "outside" | "auto",
): OverhangAssignmentEntry {
  return {
    id,
    source: "diagnosed-face",
    sourceIndex: 0,
    siteIndex: 0,
    classification: final,
    automaticClassification: automatic,
    ...(supportPaintMode ? { supportPaintMode } : {}),
    positionMm: { xMm: 2, yMm: 4, zMm: 6 },
    normal: { xMm: 0, yMm: 0, zMm: -2 },
  };
}

const routedEntries = [
  entry("auto-inside", "inside", "inside"),
  entry("auto-outside", "outside", "outside"),
  entry("blue-add", "outside", "inside", "inside"),
  entry("orange-remove", "inside", "outside", "outside"),
  entry("auto-reset-inside", "inside", "inside", "auto"),
  entry("auto-reset-outside", "outside", "outside", "auto"),
];

test("automatic inside downward Surface survives Auto and paint-independent preview settings", () => {
  const first = resolveDryWebRouting(routedEntries, 2);
  const afterUnrelatedPreviewSettings = resolveDryWebRouting(
    JSON.parse(JSON.stringify(routedEntries)) as OverhangAssignmentEntry[],
    2,
  );
  assert.deepEqual(afterUnrelatedPreviewSettings, first);
  assert.deepEqual(first.targets.map((target) => target.assignmentId), [
    "auto-inside",
    "blue-add",
    "auto-reset-inside",
  ]);
  assert.deepEqual(first.targets[0].position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(first.targets[0].normal, { x: 0, y: 0, z: -1 });
});

test("blue adds, orange excludes, and Auto restores the automatic Dry Web baseline", () => {
  const result = resolveDryWebRouting(routedEntries, 1);
  assert.deepEqual(result.facts, {
    automaticDryWebCount: 3,
    blueAddedCount: 1,
    orangeExcludedCount: 1,
    finalDryWebCount: 3,
  });
});

test("Undo/Redo and saved JSON snapshots reproduce the same routed target IDs and facts", () => {
  const before = [entry("base", "inside", "inside")];
  const after = [entry("base", "inside", "outside", "outside")];
  const beforeResult = resolveDryWebRouting(before, 1);
  const afterResult = resolveDryWebRouting(after, 1);
  assert.equal(beforeResult.facts.finalDryWebCount, 1);
  assert.equal(afterResult.facts.finalDryWebCount, 0);
  assert.equal(afterResult.facts.orangeExcludedCount, 1);
  assert.deepEqual(resolveDryWebRouting(JSON.parse(JSON.stringify(before)), 1), beforeResult);
  assert.deepEqual(resolveDryWebRouting(JSON.parse(JSON.stringify(after)), 1), afterResult);
});

test("duplicate, unresolved, and malformed sites never enter the Dry Web target ledger", () => {
  const duplicate = { ...entry("duplicate", "inside", "inside"), duplicateOf: "base" };
  const unresolved = { ...entry("unresolved", "inside", "inside"), classification: "unresolved" as const };
  const malformed = { ...entry("malformed", "inside", "inside"), positionMm: undefined };
  const result = resolveDryWebRouting([duplicate, unresolved, malformed], 1);
  assert.equal(result.facts.automaticDryWebCount, 0);
  assert.equal(result.facts.finalDryWebCount, 0);
  assert.deepEqual(result.targets, []);
});

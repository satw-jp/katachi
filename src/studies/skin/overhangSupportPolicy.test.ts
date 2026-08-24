import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignOverhangSupportTargets,
  routeClassifiedSupportSites,
  summarizeOverhangAssignmentLedger,
  validateOverhangAssignmentLedger,
  type ClassifiedSupportSiteInput,
  type OverhangTargetClass,
} from "./overhangSupportPolicy.ts";

const lowerSurface = new Float32Array([0, 0, 1, 2, 0, 1, 0, 2, 1]);
const expected = (inside: number, outside: number, mixedFace: number) => ({
  total: 4,
  inside,
  outside,
  unresolved: 0,
  duplicate: 0,
  unassigned: 0,
  mixedFace,
  insideSupportSite: inside,
  outsideSupportSite: outside,
  unresolvedSupportSite: 0,
  duplicateSupportSite: 0,
});

function routeFour(classes: readonly OverhangTargetClass[]) {
  const sites: ClassifiedSupportSiteInput[] = classes.map((classification, siteIndex) => ({
    id: `diagnosed-face:000000:site:${siteIndex}`,
    source: "diagnosed-face",
    sourceIndex: 0,
    faceIndex: 0,
    siteIndex,
    classification,
    positionMm: { xMm: siteIndex * 2, yMm: 0, zMm: 3 },
  }));
  return routeClassifiedSupportSites({ sites, deduplicationToleranceMm: 0.001 });
}

for (const [name, classes] of [
  ["all outside", ["outside", "outside", "outside", "outside"]],
  ["1:3", ["inside", "outside", "outside", "outside"]],
  ["2:2", ["inside", "inside", "outside", "outside"]],
  ["3:1", ["inside", "inside", "inside", "outside"]],
  ["all inside", ["inside", "inside", "inside", "inside"]],
] as const) {
  test(`preclassified support sites route ${name}`, () => {
    const result = routeFour(classes);
    const inside = classes.filter((classification) => classification === "inside").length;
    const outside = classes.length - inside;
    assert.deepEqual(result.counts, expected(inside, outside, inside > 0 && outside > 0 ? 1 : 0));
    assert.equal(result.insideTargets.length, inside);
    assert.equal(result.outsideExplicitTargetsMm.length, outside);
    assert.equal(result.outsideFacePositionsMm.length, 0);
    assert.deepEqual(validateOverhangAssignmentLedger(result), result.counts);
  });
}

test("representative geometry classifies one mixed face into 1 inside and 3 outside sites", () => {
  const face = new Float32Array([0, 0, 3, 2, 0, 3, 0, 2, 3]);
  const lower = new Float32Array([0.9, 0, 1, 2.9, 0, 1, 0.9, 2, 1]);
  const result = assignOverhangSupportTargets({ diagnosedFaces: [face], finalSurfacePositionsMm: lower });
  assert.deepEqual(result.counts, expected(1, 3, 1));
  assert.deepEqual(result.entries.map((entry) => entry.classification), ["outside", "outside", "inside", "outside"]);
  assert.deepEqual(validateOverhangAssignmentLedger(result), result.counts);
});

test("a support site on an occluder boundary is inside", () => {
  const result = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: 0, yMm: 0, zMm: 3 }],
    finalSurfacePositionsMm: lowerSurface,
  });
  assert.equal(result.entries[0].classification, "inside");
  assert.equal(result.insideTargets.length, 1);
});

test("near support sites deduplicate deterministically but exact duplicates fail closed", () => {
  const near = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: 10, yMm: 10, zMm: 3 }, { xMm: 10.0005, yMm: 10, zMm: 3 }],
    finalSurfacePositionsMm: lowerSurface,
  });
  assert.equal(near.entries.length, 1);
  assert.equal(near.outsideExplicitTargetsMm.length, 1);
  assert.equal(near.counts.duplicateSupportSite, 0);

  const exact = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: 10, yMm: 10, zMm: 3 }, { xMm: 10, yMm: 10, zMm: 3 }],
    finalSurfacePositionsMm: lowerSurface,
  });
  assert.equal(exact.counts.duplicateSupportSite, 1);
  assert.equal(exact.outsideExplicitTargetsMm.length, 1);
  assert.throws(() => validateOverhangAssignmentLedger(exact), /duplicate support sites/);
});

test("an unresolved individual support site fails closed", () => {
  const result = routeClassifiedSupportSites({
    sites: [{
      id: "diagnosed-face:000000:site:0",
      source: "diagnosed-face",
      sourceIndex: 0,
      faceIndex: 0,
      siteIndex: 0,
      classification: "unresolved",
      positionMm: { xMm: 0, yMm: 0, zMm: 3 },
      reason: "unclassifiable-support-site",
    }],
    deduplicationToleranceMm: 0.001,
  });
  assert.equal(result.counts.unresolvedSupportSite, 1);
  assert.throws(() => validateOverhangAssignmentLedger(result), /unresolved support sites/);
});

test("duplicate and missing ledger assignments remain fail closed", () => {
  const valid = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: 10, yMm: 10, zMm: 3 }],
    finalSurfacePositionsMm: lowerSurface,
  });
  const duplicate = { ...valid, entries: [valid.entries[0], { ...valid.entries[0] }] };
  const duplicateCounts = summarizeOverhangAssignmentLedger(duplicate);
  assert.equal(duplicateCounts.duplicateSupportSite, 1);
  assert.throws(() => validateOverhangAssignmentLedger({ ...duplicate, counts: duplicateCounts }), /duplicate/);

  const missing = { ...valid, entries: [{ ...valid.entries[0], classification: undefined as never }] };
  const missingCounts = summarizeOverhangAssignmentLedger(missing);
  assert.throws(() => validateOverhangAssignmentLedger({ ...missing, counts: missingCounts }), /partition/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBaseFootprint, type BaseFootprint2d } from "./baseFootprint.ts";
import {
  assignOverhangSupportTargets,
  routeClassifiedSupportSites,
  summarizeOverhangAssignmentLedger,
  validateOverhangAssignmentLedger,
  type ClassifiedSupportSiteInput,
  type OverhangTargetClass,
} from "./overhangSupportPolicy.ts";
import { appendSupportPaintStroke, buildSupportPaintFrame, createSupportPaintStroke, emptySupportPaint } from "./supportPaint.ts";

const displayFootprint: BaseFootprint2d = {
  schema: "katachi.skin.base-footprint.v1",
  source: "support-free-host-field-outer-hull-v1",
  valid: true,
  reason: null,
  sourceBallCount: 1,
  boundaryEpsilonMm: 0.001,
  boundsMm: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
  vertices: [
    { xMm: -2, yMm: -2 },
    { xMm: 2, yMm: -2 },
    { xMm: 2, yMm: 2 },
    { xMm: -2, yMm: 2 },
  ],
};

const expected = (inside: number, outside: number, mixedFace: number, total = inside + outside) => ({
  total,
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

function triangle(z: number, size = 4, x = -2, y = -2): Float32Array {
  return new Float32Array([x, y, z, x + size, y, z, x, y + size, z]);
}

function routeFour(classes: readonly OverhangTargetClass[]) {
  const sites: ClassifiedSupportSiteInput[] = classes.map((classification, siteIndex) => ({
    id: "diagnosed-face:000000:site:" + siteIndex,
    source: "diagnosed-face",
    sourceIndex: 0,
    faceIndex: 0,
    siteIndex,
    classification,
    rayResult: classification === "inside" ? "body-blocked" : "plate-visible",
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
  test("preclassified support sites route " + name, () => {
    const result = routeFour(classes);
    const inside = classes.filter((classification) => classification === "inside").length;
    const outside = classes.length - inside;
    assert.deepEqual(result.counts, expected(inside, outside, inside > 0 && outside > 0 ? 1 : 0));
    assert.equal(result.insideTargets.length, inside);
    assert.equal(result.outsideExplicitTargetsMm.length, outside);
  });
}

function sphereTriangles(radius = 10, latitudeBands = 12, longitudeBands = 24): Float32Array {
  const values: number[] = [];
  const point = (lat: number, lon: number): [number, number, number] => {
    const phi = -Math.PI / 2 + Math.PI * lat / latitudeBands;
    const theta = 2 * Math.PI * lon / longitudeBands;
    return [radius * Math.cos(phi) * Math.cos(theta), radius * Math.cos(phi) * Math.sin(theta), radius * Math.sin(phi)];
  };
  for (let lat = 0; lat < latitudeBands; lat++) {
    for (let lon = 0; lon < longitudeBands; lon++) {
      const a = point(lat, lon);
      const b = point(lat + 1, lon);
      const c = point(lat + 1, lon + 1);
      const d = point(lat, lon + 1);
      if (lat > 0) values.push(...a, ...b, ...d);
      if (lat < latitudeBands - 1) values.push(...b, ...c, ...d);
    }
  }
  return new Float32Array(values);
}

test("most support sites on a sphere lower surface are plate-visible outside", () => {
  const surface = sphereTriangles();
  const lowerFaces: number[] = [];
  for (let offset = 0; offset < surface.length; offset += 9) {
    const centroidZ = (surface[offset + 2] + surface[offset + 5] + surface[offset + 8]) / 3;
    if (centroidZ < -0.5) lowerFaces.push(...surface.subarray(offset, offset + 9));
  }
  const result = assignOverhangSupportTargets({
    diagnosedFaces: new Float32Array(lowerFaces),
    supportSurfacePositionsMm: surface,
    baseFootprint: displayFootprint,
  });
  assert.equal(result.counts.unresolvedSupportSite, 0);
  assert.equal(result.counts.duplicateSupportSite, 0);
  assert.ok(result.counts.outsideSupportSite / result.counts.total > 0.8);
  assert.ok(result.entries.filter((entry) => entry.rayResult === "plate-visible").length > result.counts.total * 0.8);
  assert.doesNotThrow(() => validateOverhangAssignmentLedger(result));
});

test("a footprint-interior site remains outside when its -Z ray is open to the plate", () => {
  const ceiling = triangle(3);
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [ceiling],
    supportSurfacePositionsMm: ceiling,
    baseFootprint: displayFootprint,
  });
  assert.deepEqual(result.counts, expected(0, 4, 0));
  assert.deepEqual(result.entries.map((entry) => entry.rayResult), ["plate-visible", "plate-visible", "plate-visible", "plate-visible"]);
});

test("a closed internal cavity ceiling is inside because body blocks the downward ray", () => {
  const ceiling = triangle(3);
  const floor = triangle(1);
  const surface = new Float32Array([...ceiling, ...floor]);
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [ceiling],
    supportSurfacePositionsMm: surface,
    baseFootprint: displayFootprint,
  });
  assert.deepEqual(result.counts, expected(4, 0, 0));
  assert.ok(result.entries.every((entry) => entry.rayResult === "body-blocked"));
  assert.ok(result.entries.every((entry) => (entry.nearestLowerSurfaceDistanceMm ?? 0) > 1.9));
});

test("a downward-open cavity is outside", () => {
  const ceiling = triangle(3);
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [ceiling],
    supportSurfacePositionsMm: ceiling,
  });
  assert.equal(result.counts.insideSupportSite, 0);
  assert.equal(result.counts.outsideSupportSite, 4);
});

test("an internal region with support-free BODY below is inside", () => {
  const surface = triangle(1);
  const result = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: -1, yMm: -1, zMm: 3 }],
    supportSurfacePositionsMm: surface,
  });
  assert.equal(result.entries[0].classification, "inside");
  assert.equal(result.entries[0].reason, "body-blocked");
});

test("mixed faces report per-site results and never become a face-wide error", () => {
  const face = triangle(3);
  const partialFloor = triangle(1, 2.2);
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [face],
    supportSurfacePositionsMm: new Float32Array([...face, ...partialFloor]),
  });
  assert.equal(result.counts.mixedFace, 1);
  assert.equal(result.counts.insideSupportSite > 0, true);
  assert.equal(result.counts.outsideSupportSite > 0, true);
  assert.equal(result.counts.unresolvedSupportSite, 0);
  assert.doesNotThrow(() => validateOverhangAssignmentLedger(result));
});

test("the self surface is ignored by the stable millimetre epsilon", () => {
  const face = triangle(3);
  const result = assignOverhangSupportTargets({
    diagnosedFaces: [face],
    supportSurfacePositionsMm: face,
  });
  assert.equal(result.rayFacts?.lowerIntersectionEpsilonMm, 0.001);
  assert.ok(result.entries.every((entry) => entry.classification === "outside"));
});

test("Dry Web, scaffold, and generated BODY cannot change a reused support-free Surface classification", () => {
  const supportFreeSurface = triangle(1);
  const targets = [{ xMm: -1, yMm: -1, zMm: 3 }, { xMm: 10, yMm: 10, zMm: 3 }];
  const before = assignOverhangSupportTargets({ explicitTargets: targets, supportSurfacePositionsMm: supportFreeSurface });
  const dryWeb = new Float32Array([0, 0, 2]);
  const scaffold = new Float32Array([10, 10, 2]);
  const generatedBody = new Float32Array([10, 10, 1]);
  dryWeb[2] = scaffold[2] = generatedBody[2] = -999;
  const after = assignOverhangSupportTargets({ explicitTargets: targets, supportSurfacePositionsMm: supportFreeSurface });
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.rayFacts, before.rayFacts);
});

test("footprint changes only display evidence and never routing", () => {
  const supportFreeSurface = triangle(1);
  const targets = [{ xMm: -1, yMm: -1, zMm: 3 }, { xMm: 10, yMm: 10, zMm: 3 }];
  const a = assignOverhangSupportTargets({ explicitTargets: targets, supportSurfacePositionsMm: supportFreeSurface, baseFootprint: displayFootprint });
  const distant = buildBaseFootprint([{ id: 1, x: 100, y: 100, z: 0, r: 1 }], 0, 1);
  const b = assignOverhangSupportTargets({ explicitTargets: targets, supportSurfacePositionsMm: supportFreeSurface, baseFootprint: distant });
  assert.deepEqual(b.entries, a.entries);
  assert.notDeepEqual(b.baseFootprint?.vertices, a.baseFootprint?.vertices);
});

test("invalid coordinates are unresolved and fail closed", () => {
  const invalid = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: Number.NaN, yMm: 0, zMm: 3 }],
    supportSurfacePositionsMm: triangle(1),
  });
  assert.equal(invalid.counts.unresolvedSupportSite, 1);
  assert.equal(invalid.entries[0].rayResult, "ray-unresolved");
  assert.throws(() => validateOverhangAssignmentLedger(invalid), /unresolved support sites/);
});

test("near sites deduplicate stably while exact duplicates remain validation errors", () => {
  const surface = triangle(1);
  const near = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: 10, yMm: 10, zMm: 3 }, { xMm: 10.0005, yMm: 10, zMm: 3 }],
    supportSurfacePositionsMm: surface,
  });
  assert.equal(near.entries.length, 1);
  assert.equal(near.counts.duplicateSupportSite, 0);

  const exact = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: 1, yMm: 1, zMm: 3 }, { xMm: 1, yMm: 1, zMm: 3 }],
    supportSurfacePositionsMm: surface,
  });
  assert.equal(exact.counts.duplicateSupportSite, 1);
  assert.throws(() => validateOverhangAssignmentLedger(exact), /duplicate support sites/);
});

test("serialized CLI and Worker Surface inputs produce identical shared plans", () => {
  const face = triangle(3);
  const surface = new Float32Array([...face, ...triangle(1, 2.2)]);
  const cli = assignOverhangSupportTargets({ diagnosedFaces: [face], supportSurfacePositionsMm: surface, baseFootprint: displayFootprint });
  const workerSurface = new Float32Array(JSON.parse(JSON.stringify(Array.from(surface))));
  const workerFootprint = JSON.parse(JSON.stringify(displayFootprint)) as BaseFootprint2d;
  const worker = assignOverhangSupportTargets({ diagnosedFaces: [face], supportSurfacePositionsMm: workerSurface, baseFootprint: workerFootprint });
  assert.deepEqual(worker.entries, cli.entries);
  assert.deepEqual(worker.counts, cli.counts);
  assert.deepEqual(worker.rayFacts, cli.rayFacts);
  assert.equal(worker.counts.unresolvedSupportSite, 0);
  assert.equal(worker.counts.duplicateSupportSite, 0);
});

test("serialized CLI and Worker apply the same author paint after automatic routing", () => {
  const face = triangle(3);
  const surface = new Float32Array([...face, ...triangle(1, 2.2)]);
  const frame = buildSupportPaintFrame(surface);
  const paint = appendSupportPaintStroke(emptySupportPaint(frame.longestMm), createSupportPaintStroke({
    order: 0, mode: "outside", centerMm: { xMm: 0, yMm: 0, zMm: 3 }, radiusMm: 10,
    surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 }, frame, paintBackfaces: false,
  }));
  const cli = assignOverhangSupportTargets({ diagnosedFaces: [face], supportSurfacePositionsMm: surface, supportPaint: paint });
  const worker = assignOverhangSupportTargets({
    diagnosedFaces: [new Float32Array(Array.from(face))],
    supportSurfacePositionsMm: new Float32Array(Array.from(surface)),
    supportPaint: JSON.parse(JSON.stringify(paint)),
  });
  assert.deepEqual(worker.entries, cli.entries);
  assert.deepEqual(worker.paintFacts, cli.paintFacts);
  assert.equal(cli.paintFacts?.manualOverrideSupportSiteCount, cli.entries.filter((entry) => entry.automaticClassification === "inside").length);
  assert.equal(cli.counts.unresolvedSupportSite, 0);
});

test("duplicate and missing ledger assignments remain fail closed", () => {
  const valid = assignOverhangSupportTargets({
    explicitTargets: [{ xMm: 1, yMm: 1, zMm: 3 }],
    supportSurfacePositionsMm: triangle(1),
  });
  const duplicate = { ...valid, entries: [valid.entries[0], { ...valid.entries[0] }] };
  const duplicateCounts = summarizeOverhangAssignmentLedger(duplicate);
  assert.equal(duplicateCounts.duplicateSupportSite, 1);
  assert.throws(() => validateOverhangAssignmentLedger({ ...duplicate, counts: duplicateCounts }), /duplicate/);

  const missing = { ...valid, entries: [{ ...valid.entries[0], classification: undefined as never }] };
  const missingCounts = summarizeOverhangAssignmentLedger(missing);
  assert.throws(() => validateOverhangAssignmentLedger({ ...missing, counts: missingCounts }), /partition/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASTRA_CANDIDATE_FINGERPRINT_VERSION,
  buildArtworkCandidateSupport,
  candidatePreflight,
  currentnessParity,
  diagnoseArtworkCandidate,
  evaluateCandidatePipelineCurrentness,
  exportArtworkCandidate3mf,
  loadArtworkCandidate,
  type CandidateDiagnostics,
} from "./astraCandidatePrintLane.ts";
import {
  buildSparseRemovableSupport,
  type SparseRemovableSupportFace,
} from "./rebuild/sparseRemovableSupport.ts";
import { sha256Hex } from "../../lib/hash.ts";

function cubeStl(): ArrayBuffer {
  const vertices = [
    [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0],
    [-1, -1, 2], [1, -1, 2], [1, 1, 2], [-1, 1, 2],
  ];
  const faces: Array<[number, number, number, number]> = [
    [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [4, 0, 3, 7],
  ];
  const buffer = new ArrayBuffer(84 + faces.length * 2 * 50);
  const view = new DataView(buffer);
  view.setUint32(80, faces.length * 2, true);
  let offset = 84;
  for (const [a, b, c, d] of faces) {
    for (const triangle of [[a, b, c], [a, c, d]]) {
      for (let index = 0; index < 3; index++) view.setFloat32(offset + 12 + index * 12, vertices[triangle[index]][0], true);
      for (let index = 0; index < 3; index++) view.setFloat32(offset + 16 + index * 12, vertices[triangle[index]][1], true);
      for (let index = 0; index < 3; index++) view.setFloat32(offset + 20 + index * 12, vertices[triangle[index]][2], true);
      offset += 50;
    }
  }
  return buffer;
}

function face(z: number, x = 0, ownerPatchId = -1): SparseRemovableSupportFace {
  return { regionId: 0, ownerPatchId, position: { x, y: 0, z }, normal: { x: 0, y: 0, z: -1 }, faceIndex: 0, area: 1 };
}

function bodySdf(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z - 2) - 0.001;
}

function supportRequest(overrides: Partial<Parameters<typeof buildSparseRemovableSupport>[0]> = {}) {
  return {
    projectedOutsideFaces: [face(2)],
    outsideRegionCount: 1,
    plateZ: 0,
    shaftRadius: 0.05,
    neckRadius: 0.02,
    bodySdf,
    contactPolicy: "single-body" as const,
    maxLeaningRoutes: 0,
    coverageRadius: 0,
    ...overrides,
  };
}

test("single-body mode accepts ownerPatchId=-1 while patch-owned mode remains fail-closed", () => {
  const single = buildSparseRemovableSupport(supportRequest());
  assert.equal(single.diagnostics.generatedSupportCount, 1);
  assert.equal(single.diagnostics.acceptedBodyCollisionCount, 0);
  const legacy = buildSparseRemovableSupport({ ...supportRequest(), contactPolicy: "patch-owned" });
  assert.equal(legacy.diagnostics.generatedSupportCount, 0);
  assert.ok(legacy.diagnostics.unsupportedTargetCount > 0);
});

test("forbidden Rabbit SDF rejects capsule penetration and accepts an exterior capsule", () => {
  const interior = buildSparseRemovableSupport(supportRequest({
    forbiddenSdf: (x, y, z) => Math.hypot(x, y, z - 1) - 0.35,
  }));
  assert.equal(interior.diagnostics.generatedSupportCount, 0);
  assert.ok(interior.diagnostics.rejectedByForbiddenVolume > 0);
  const exterior = buildSparseRemovableSupport(supportRequest({
    forbiddenSdf: (x, y, z) => Math.hypot(x - 10, y, z) - 0.35,
  }));
  assert.equal(exterior.diagnostics.generatedSupportCount, 1);
  assert.equal(exterior.diagnostics.acceptedForbiddenCollisionCount, 0);
});

test("forbidden clearance includes the support radius and non-finite SDF fails closed", () => {
  const clear = buildSparseRemovableSupport(supportRequest({
    projectedOutsideFaces: [face(2, 1)],
    bodySdf: (x, y, z) => Math.hypot(x - 1, y, z - 2) - 0.001,
    forbiddenSdf: (x, y, z) => Math.hypot(x - 0.5, y, z - 1) - 0.3,
    forbiddenClearanceMm: 0,
  }));
  assert.equal(clear.diagnostics.generatedSupportCount, 1);
  const clearance = buildSparseRemovableSupport(supportRequest({
    projectedOutsideFaces: [face(2, 1)],
    bodySdf: (x, y, z) => Math.hypot(x - 1, y, z - 2) - 0.001,
    forbiddenSdf: (x, y, z) => Math.hypot(x - 0.5, y, z - 1) - 0.3,
    forbiddenClearanceMm: 0.3,
  }));
  assert.equal(clearance.diagnostics.generatedSupportCount, 0);
  const nonFinite = buildSparseRemovableSupport(supportRequest({ forbiddenSdf: () => Number.NaN }));
  assert.equal(nonFinite.diagnostics.generatedSupportCount, 0);
  assert.ok(nonFinite.diagnostics.rejectedByForbiddenVolume > 0);
});

test("candidate geometry fingerprint is deterministic and changes with print transform", async () => {
  const bytes = cubeStl();
  const first = await loadArtworkCandidate("A", bytes, "A2_BODY.stl");
  const second = await loadArtworkCandidate("A", bytes, "A2_BODY.stl");
  assert.equal(first.geometryFingerprint, second.geometryFingerprint);
  assert.equal(first.topologyFacts.connectedComponentCount, 1);
  assert.equal(first.topologyFacts.openEdgeCount, 0);
  assert.equal(first.signedVolumeCapability, "AVAILABLE");
  assert.equal(candidatePreflight(first).blocked, false);
  const translated = await (await import("./astraCandidatePrintLane.ts")).applyCommonCandidatePrintTransform(first, {
    translationMm: { x: 0, y: 0, z: 1 }, rotation: [0, 0, 0, 1], uniformScale: 1,
    rule: "common-lowest-candidate-point-to-plate-z0",
  });
  assert.notEqual(first.geometryFingerprint, translated.geometryFingerprint);
  assert.match(ASTRA_CANDIDATE_FINGERPRINT_VERSION, /f32-le-v0/);
});

test("candidate diagnostics and export preserve one BODY fingerprint through separate Support 3MF", async () => {
  const candidate = await loadArtworkCandidate("A", cubeStl(), "A2_BODY.stl");
  const diagnosticsBase = await diagnoseArtworkCandidate(candidate, { overhangThresholdDeg: 45, plateFloorMm: 0, plateBandMm: 0 });
  const diagnostics: CandidateDiagnostics = {
    ...diagnosticsBase,
    diagnosticsFingerprint: await sha256Hex(`manual-diagnostic:${candidate.geometryFingerprint}`),
    outsideSupportFaces: [face(2)],
    outsideFaces: 1,
    criticalTargets: 1,
  };
  const support = await buildArtworkCandidateSupport(candidate, diagnostics, () => 100, {
    overhangThresholdDeg: 45,
    plateBandMm: 0,
    shaftDiameterMm: 0.4,
    neckDiameterMm: 0.2,
    removalGapMm: 0.1,
    lowStartBandMm: 0.6,
    maxCandidatesPerRegion: 3,
    maxLeaningRoutes: 0,
    coverageRadiusMm: 0,
    hostClearanceMm: 0,
  });
  const exported = await exportArtworkCandidate3mf(candidate, support);
  assert.equal(exported.candidateFingerprintParity, true);
  assert.equal(exported.validation.valid, true);
  assert.ok(exported.stats.bodyFaces > 0);
  assert.ok(exported.stats.archiveBytes > 0);
  assert.equal(currentnessParity(candidate, diagnostics, support, exported), true);
  assert.deepEqual(evaluateCandidatePipelineCurrentness(candidate, diagnostics, support, exported, support.settings), {
    diagnosticsCurrent: true,
    supportCurrent: true,
    exportCurrent: true,
  });
  assert.equal(evaluateCandidatePipelineCurrentness(candidate, diagnostics, support, exported, {
    ...support.settings,
    hostClearanceMm: 0.2,
  }).supportCurrent, false);
});

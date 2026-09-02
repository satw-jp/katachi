import assert from "node:assert/strict";
import { buildSkinRebuildProject } from "./model.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "./fkei.ts";
import type { InternalPrintGateReport } from "../internalPrintGate.ts";
import type { SparseRemovableSupportDiagnostics } from "./sparseRemovableSupport.ts";
import type { Stage6MeshTopologyDiagnostics } from "./stage6MeshTopologyDiagnostics.ts";
import {
  createSkinRebuildPrintSnapshot,
  decodeSkinRebuildPrintSnapshot,
  evaluateSkinRebuildPrintSnapshotReuse,
  skinRebuildPrintSnapshotGraphFingerprint,
  type SkinRebuildPrintSnapshotData,
} from "./printSnapshot.ts";

function oneTriangleStl(): ArrayBuffer {
  const stl = new ArrayBuffer(84 + 50);
  new DataView(stl).setUint32(80, 1, true);
  return stl;
}

function gateReport(): InternalPrintGateReport {
  return {
    ok: true,
    profileId: "bambu-a1-mini-pla-04-02",
    reasons: [],
    watertight: true,
    meshComponents: 1,
    removedDegenerateTriangles: 0,
    graphComponents: 1,
    surfaceAnchorNodes: 1,
    buildPlateAnchorNodes: 0,
    floatingGraphComponents: 0,
    unsupportedNodes: 0,
    unsupportedEdges: 0,
    overlongBridges: 0,
    bridgeEdges: 0,
    minDiameterMm: 0.8,
    thinStrutCount: 0,
    invalidDiameterCount: 0,
    voxelStepMm: 0.1,
    voxelsAcrossDiameter: 8,
    maxBridgeMm: 5,
    maxObservedBridgeMm: 0,
  };
}

function sparseDiagnostics(): SparseRemovableSupportDiagnostics {
  return {
    outsideRegionCount: 1,
    rawCandidateCount: 1,
    criticalTargetCount: 1,
    coveredTargetCount: 1,
    unsupportedTargetCount: 0,
    generatedSupportCount: 1,
    rejectedByBody: 0,
    rejectedBySpacing: 0,
    rejectedByRemovability: 0,
    insideDerivedSupportCount: 0,
    verticalCount: 1,
    leaningCount: 0,
    routeCandidateCount: 1,
    straightRejectedByBody: 0,
    offsetBendCount: 0,
    acceptedBodyCollisionCount: 0,
    experimental: true,
    removalGap: 0.35,
    shaftRadius: 0.8,
    neckRadius: 0.3,
  };
}

function topology(): Stage6MeshTopologyDiagnostics {
  return {
    triangleCount: 1,
    componentCount: 1,
    components: [{
      id: 0,
      triangleCount: 1,
      volumeMm3: 1,
      signedVolumeMm3: 1,
      boundsMm: { min: [0, 0, 0], max: [1, 1, 0], size: [1, 1, 0] },
    }],
    faceComponentIds: new Int32Array([0]),
    degenerateFaceIndices: new Int32Array(),
    scaleMmPerUnit: 1,
    plateShiftSourceZ: 0,
  };
}

function snapshotData(graphFingerprint: string): SkinRebuildPrintSnapshotData {
  return {
    body: {
      fingerprint: "body-fingerprint-v1",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      summary: "cached BODY mesh · 1 triangle",
      watertightOk: true,
      topologyDiagnostics: topology(),
    },
    componentSelection: {
      explicit: true,
      componentIds: [0],
      triangleCount: 1,
      cacheFingerprint: "body-fingerprint-v1",
    },
    stage4: {
      current: true,
      faceCount: 1,
      regionCount: 1,
      insideFaceCount: 0,
      outsideFaceCount: 1,
      insideRegionCount: 0,
      outsideRegionCount: 1,
      unclassifiedFaceCount: 0,
    },
    stage6_5: {
      current: true,
      faceCount: 1,
      insideFaceCount: 1,
      outsideFaceCount: 0,
      boundaryFaceCount: 0,
      unclassifiedFaceCount: 0,
      boundaryRegionCount: 0,
      boundaryThicknessMm: 0.5,
    },
    stage7: {
      current: true,
      faceCount: 1,
      overhangFaceCount: 0,
      overhangRegionCount: 0,
      overhangAreaMm2: 0,
      overhangAreaPercent: 0,
    },
    stage7_5: {
      current: true,
      insideFaceCount: 1,
      outsideFaceCount: 0,
      ambiguousFaceCount: 0,
      ambiguousRegionCount: 0,
    },
    stage8: {
      current: true,
      supportMode: "automatic",
      supportDiameterMm: 1.6,
      sparseSupportGenerated: true,
      supportGraphFingerprint: graphFingerprint,
      supportGraphNodeCount: 0,
      supportGraphEdgeCount: 0,
      unresolvedSupportCount: 0,
      acceptedBodyCollisionCount: 0,
      diagnostics: sparseDiagnostics(),
    },
    internalPrintGate: {
      fingerprint: "pipeline-fingerprint-v1",
      report: gateReport(),
      stl: oneTriangleStl(),
      summary: "BODY gate passed",
      scaleMmPerUnit: 1,
      plateShiftSourceZ: 0,
    },
  };
}

const { project } = buildSkinRebuildProject();
const graphFingerprint = skinRebuildPrintSnapshotGraphFingerprint(project.printSupport);
const data = snapshotData(graphFingerprint);
const snapshot = createSkinRebuildPrintSnapshot(
  "source-fingerprint-v1",
  "pipeline-fingerprint-v1",
  data,
);

const decoded = decodeSkinRebuildPrintSnapshot(snapshot);
assert.deepEqual(decoded.body.positions, data.body.positions, "cached BODY positions must round-trip");
assert.deepEqual(decoded.body.normals, data.body.normals, "cached BODY normals must round-trip");
assert.deepEqual(decoded.body.topologyDiagnostics.faceComponentIds, data.body.topologyDiagnostics.faceComponentIds);
assert.deepEqual(decoded.componentSelection.componentIds, [0], "component selection must round-trip");
assert.equal(decoded.stage8.supportGraphFingerprint, graphFingerprint, "Sparse Support graph identity must round-trip");
assert.equal(decoded.internalPrintGate.stl.byteLength, data.internalPrintGate.stl.byteLength, "gate STL must round-trip");
assert.doesNotMatch(JSON.stringify(snapshot), /approval/i, "session-only approvals must not be stored in the snapshot");

const oldDocument = captureSkinRebuildFkei(project, { savedAt: "2026-09-02T00:00:00.000Z" });
assert.equal(oldDocument.printSnapshot, undefined, "ordinary/incomplete FKEI remains snapshot-free");
const beforeBytes = new TextEncoder().encode(serializeSkinRebuildFkei(oldDocument)).byteLength;
const snapshotDocument = captureSkinRebuildFkei(project, {
  savedAt: "2026-09-02T00:00:00.000Z",
  printSnapshot: snapshot,
});
const snapshotText = serializeSkinRebuildFkei(snapshotDocument);
const afterBytes = new TextEncoder().encode(snapshotText).byteLength;
const reopened = parseSkinRebuildFkei(snapshotText);
assert.ok(reopened.printSnapshot, "print-ready FKEI must retain the optional snapshot");
assert.deepEqual(
  decodeSkinRebuildPrintSnapshot(reopened.printSnapshot!),
  decoded,
  "FKEI save/open must preserve the decoded print snapshot",
);
assert.ok(afterBytes > beforeBytes, "snapshot FKEI must include its derived cache");
const legacyOpenStarted = performance.now();
parseSkinRebuildFkei(serializeSkinRebuildFkei(oldDocument));
const legacyOpenParseMs = performance.now() - legacyOpenStarted;
const snapshotOpenStarted = performance.now();
const measuredSnapshotDocument = parseSkinRebuildFkei(snapshotText);
decodeSkinRebuildPrintSnapshot(measuredSnapshotDocument.printSnapshot!);
const snapshotOpenRestoreMs = performance.now() - snapshotOpenStarted;

const reusable = evaluateSkinRebuildPrintSnapshotReuse({
  snapshot,
  data: decoded,
  currentSourceGeometryFingerprint: "source-fingerprint-v1",
  currentPipelineFingerprint: "pipeline-fingerprint-v1",
  currentGateFingerprint: "pipeline-fingerprint-v1",
  currentSupportGraphFingerprint: graphFingerprint,
  currentSupportGraphNodeCount: 0,
  currentSupportGraphEdgeCount: 0,
  currentSupportMode: "automatic",
  currentSparseSupportDiagnostics: sparseDiagnostics(),
});
assert.equal(reusable.state, "reuse", "matching fingerprints must reuse the cached snapshot");
const sourceMismatch = evaluateSkinRebuildPrintSnapshotReuse({
  snapshot,
  data: decoded,
  currentSourceGeometryFingerprint: "changed-source",
  currentPipelineFingerprint: "pipeline-fingerprint-v1",
  currentGateFingerprint: "pipeline-fingerprint-v1",
  currentSupportGraphFingerprint: graphFingerprint,
  currentSupportGraphNodeCount: 0,
  currentSupportGraphEdgeCount: 0,
  currentSupportMode: "automatic",
  currentSparseSupportDiagnostics: sparseDiagnostics(),
});
assert.equal(sourceMismatch.state, "stale", "source fingerprint mismatch must fail closed");
const pipelineMismatch = evaluateSkinRebuildPrintSnapshotReuse({
  snapshot,
  data: decoded,
  currentSourceGeometryFingerprint: "source-fingerprint-v1",
  currentPipelineFingerprint: "changed-settings",
  currentGateFingerprint: "pipeline-fingerprint-v1",
  currentSupportGraphFingerprint: graphFingerprint,
  currentSupportGraphNodeCount: 0,
  currentSupportGraphEdgeCount: 0,
  currentSupportMode: "automatic",
  currentSparseSupportDiagnostics: sparseDiagnostics(),
});
assert.equal(pipelineMismatch.state, "stale", "pipeline/settings fingerprint mismatch must fail closed");
const graphMismatch = evaluateSkinRebuildPrintSnapshotReuse({
  snapshot,
  data: decoded,
  currentSourceGeometryFingerprint: "source-fingerprint-v1",
  currentPipelineFingerprint: "pipeline-fingerprint-v1",
  currentGateFingerprint: "pipeline-fingerprint-v1",
  currentSupportGraphFingerprint: "changed-support-graph",
  currentSupportGraphNodeCount: 0,
  currentSupportGraphEdgeCount: 0,
  currentSupportMode: "automatic",
  currentSparseSupportDiagnostics: sparseDiagnostics(),
});
assert.equal(graphMismatch.state, "stale", "Sparse Support graph mismatch must fail closed");
const corrupted = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
corrupted.payload = { $fkei: "object", entries: [] };
assert.throws(
  () => decodeSkinRebuildPrintSnapshot(corrupted),
  /snapshot\.body|printSnapshot payload/,
  "corrupted snapshot must fail closed",
);

console.log(
  "SKIN REBUILD print snapshot tests passed",
  JSON.stringify({
    beforeBytes,
    afterBytes,
    deltaBytes: afterBytes - beforeBytes,
    legacyOpenParseMs: Number(legacyOpenParseMs.toFixed(3)),
    snapshotOpenRestoreMs: Number(snapshotOpenRestoreMs.toFixed(3)),
    measurementScope: "FKEI parse / snapshot decode fixture boundary; not browser E2E",
    remeshRunsOnRestore: 0,
    heavyStageRerunsOnRestore: 0,
  }),
);

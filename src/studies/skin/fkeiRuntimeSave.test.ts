import assert from "node:assert/strict";
import { createArtworkGraph } from "./artworkGraph.ts";
import { assignOverhangSupportTargets } from "./overhangSupportPolicy.ts";
import {
  FKEI_SCHEMA,
  parseFkeiDocument,
  serializeFkei,
  type FkeiDryWebArtifact,
  type FkeiSurfaceArtifact,
} from "./fkei.ts";
import { createSurfaceGraph } from "./surfaceGraph.ts";
import {
  buildFkeiRuntimeSaveSnapshot,
  formatFkeiFilename,
  saveFkeiRuntime,
  type FkeiRuntimeSaveFacts,
} from "./fkeiRuntimeSave.ts";

const shape = {
  formatVersion: 1 as const,
  entries: [{ t: 1, op: "clearAll" as const, args: {} }],
};

function baseFacts(stageCurrent: FkeiRuntimeSaveFacts["stageCurrent"]): FkeiRuntimeSaveFacts {
  return {
    shape,
    bindings: { shapeFingerprint: "surface-v1", patchSetRevision: 2, paintRevision: 3 },
    stageCurrent,
    compatibility: { appVersion: "test", generatorCommit: "0123456789abcdef0123456789abcdef01234567" },
  };
}

const policy = assignOverhangSupportTargets({
  explicitTargets: [{ xMm: 5, yMm: 5, zMm: 1 }],
  supportSurfacePositionsMm: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
});
const diagnosis = {
  type: "result" as const,
  generation: 1,
  metrics: {
    thresholdDeg: 45, surfaceArea: 1, dangerousAreaBefore: 0, dangerousAreaAfter: 0,
    mitigatedArea: 0, dangerousFaceCountBefore: 0, dangerousFaceCountAfter: 0,
    mitigatedFaceCount: 0, contactTolerance: 0.001,
  },
  basePositions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  baseNormals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  baseFaceCount: 1,
  resolution: 8,
  internalEdgeCount: 0,
  motifLowestPoints: [],
  beforeDangerPositions: new Float32Array(0),
  afterDangerPositions: new Float32Array(0),
  mitigatedPositions: new Float32Array(0),
  elapsedMs: 0,
};
const surfaceBinding = {
  surfaceFingerprint: "surface-v1",
  resolution: 8,
  targetLongestMm: 1,
  angleThresholdDeg: 45,
  cacheKeys: null,
};
const artworkSnapshot = createArtworkGraph(
  createSurfaceGraph([{ id: 1, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 0.5 }] }], 2, { revision: 2 }),
  { revision: 2 },
);
const artworkSourceKey = "artwork-v1";
const graph = {
  kind: "targetedGrid" as const,
  nodes: [],
  edges: [],
  stats: {
    inputPoints: 0, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0,
    removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0,
    requestedTargets: 0, connectedTargets: 0, gridNodeCount: 0, gridEdgeCount: 0,
    dryWebContactFacts: { usefulPatchCount: 0, componentCount: 0, mainComponentKey: null, mainComponentSize: 0, patches: [] },
  },
};
const dryWeb: FkeiDryWebArtifact = {
  preview: {
    surfaceFingerprint: "surface-v1",
    resolution: 8,
    paintRevision: 3,
    artworkGraphSnapshot: artworkSnapshot,
    artworkGraphSourceKey: artworkSourceKey,
    graph,
    targetConnectionFacts: [],
    contactFloorFacts: { requiredContacts: 0, mainComponentKey: null, patches: [] },
    facts: { automaticDryWebCount: 0, blueAddedCount: 0, orangeExcludedCount: 0, finalDryWebCount: 0 },
    computeMs: 1,
  },
  targetSource: { surfaceFingerprint: "surface-v1", resolution: 8, targets: [] },
  exactDiagnosis: diagnosis,
  exactBinding: surfaceBinding,
};
const surface: FkeiSurfaceArtifact = {
  diagnosis,
  automaticSupportResult: policy,
  effectiveSupportResult: policy,
  binding: surfaceBinding,
};

const allCurrent = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true } as const;
const fullFacts: FkeiRuntimeSaveFacts = {
  ...baseFacts(allCurrent),
  bindings: {
    shapeFingerprint: "surface-v1", patchSetRevision: 2, paintRevision: 3,
    surface: surfaceBinding,
    artworkGraph: { sourceKey: artworkSourceKey, patchSetRevision: 2 },
  },
  artworkGraph: { current: true, value: { snapshot: artworkSnapshot, sourceKey: artworkSourceKey } },
  surface: { current: true, value: surface, acceptedBinding: surfaceBinding, currentBinding: surfaceBinding },
  dryWeb: { current: true, value: dryWeb },
};

// A quantized target may coincide with its material node. The runtime
// generator cannot create a self-edge, so Save must conservatively record the
// target as unresolved without mutating the live graph/facts.
const selfContactDryWeb: FkeiDryWebArtifact = {
  ...dryWeb,
  preview: {
    ...dryWeb.preview,
    graph: {
      kind: "targetedGrid",
      nodes: [{ id: 0, position: { x: 0, y: 0, z: 0 }, radius: 0.1 }],
      edges: [],
      stats: {
        inputPoints: 1, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0,
        removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0,
        requestedTargets: 1, connectedTargets: 1, gridNodeCount: 1, gridEdgeCount: 0,
        dryWebContactFacts: {
          usefulPatchCount: 1,
          componentCount: 1,
          mainComponentKey: "1",
          mainComponentSize: 1,
          patches: [{ patchId: 1, contactNodeIds: [], contactCount: 0, componentKey: "1", componentSize: 1 }],
        },
      },
    },
    targetConnectionFacts: [{
      sourceTargetIndex: 0,
      contactNodeId: 0,
      materialNodeId: 0,
      edgeId: null,
      status: "connected",
    }],
  },
  targetSource: {
    surfaceFingerprint: "surface-v1",
    resolution: 8,
    targets: [{
      assignmentId: "self-contact",
      patchId: 1,
      position: { x: 0, y: 0, z: 0 },
      markerRadius: 0.1,
      reachedByInternal: true,
      basis: "finalMesh",
    }],
  },
};
const selfContactSnapshot = buildFkeiRuntimeSaveSnapshot({
  ...fullFacts,
  dryWeb: { current: true, value: selfContactDryWeb },
});
assert.deepEqual(selfContactSnapshot.dryWeb?.value.preview.targetConnectionFacts, [{
  sourceTargetIndex: 0,
  contactNodeId: null,
  materialNodeId: null,
  edgeId: null,
  status: "unresolved",
}]);
assert.equal(selfContactSnapshot.dryWeb?.value.preview.graph.stats.connectedTargets, 0);
assert.equal(selfContactDryWeb.preview.targetConnectionFacts?.[0].status, "connected");
assert.equal(selfContactDryWeb.preview.targetConnectionFacts?.[0].contactNodeId, 0);
assert.equal(selfContactDryWeb.preview.graph.stats.connectedTargets, 1);

// A runtime graph with multiple selected contact nodes on one Surface patch
// cannot satisfy the immutable .fkei topology validator when those nodes are
// separate graph components. Save must preserve the valid upstream artifacts,
// omit only Dry Web, and lower the resumable prefix without touching runtime.
const multiContactDryWeb: FkeiDryWebArtifact = {
  ...dryWeb,
  preview: {
    ...dryWeb.preview,
    graph: {
      kind: "targetedGrid",
      nodes: [
        { id: 0, position: { x: 0, y: 0, z: 0 }, radius: 0.1 },
        { id: 1, position: { x: 1, y: 0, z: 0 }, radius: 0.1 },
      ],
      edges: [],
      stats: {
        inputPoints: 0, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0,
        removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0,
        requestedTargets: 0, connectedTargets: 0, gridNodeCount: 2, gridEdgeCount: 0,
        dryWebContactFacts: {
          usefulPatchCount: 1,
          componentCount: 1,
          mainComponentKey: "1",
          mainComponentSize: 1,
          patches: [{ patchId: 1, contactNodeIds: [0, 1], contactCount: 2, componentKey: "1", componentSize: 1 }],
        },
      },
    },
  },
};
const multiContactBefore = structuredClone(multiContactDryWeb);
let multiContactDownloads = 0;
const multiContactSave = saveFkeiRuntime(buildFkeiRuntimeSaveSnapshot({
  ...fullFacts,
  dryWeb: { current: true, value: multiContactDryWeb },
}), {
  savedAt: new Date(2026, 7, 28, 13, 14, 15),
  download: () => { multiContactDownloads++; },
});
assert.equal(multiContactSave.document.completedStage, 3);
assert.equal(multiContactSave.document.dryWeb, undefined);
assert.ok(multiContactSave.document.surface && multiContactSave.document.artworkGraph);
assert.deepEqual(multiContactSave.omitted, ["dryWeb:validation"]);
assert.equal(multiContactDownloads, 1);
assert.deepEqual(multiContactDryWeb, multiContactBefore);

// 1. Stage 1 shape-only capture is a detached, parseable document.
let downloadCount = 0;
const stage1 = saveFkeiRuntime(buildFkeiRuntimeSaveSnapshot(baseFacts({ 1: true, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false })), {
  savedAt: new Date(2026, 7, 28, 13, 14, 15),
  download: () => { downloadCount++; },
});
assert.equal(stage1.document.schema, FKEI_SCHEMA);
assert.equal(stage1.document.completedStage, 1);
assert.equal(stage1.document.artworkGraph, undefined);
assert.equal(downloadCount, 1);

// 2. Current Surface/Artwork/Dry Web/exact artifacts are retained, while the
// unchanged document's restorable continuous prefix remains capped at Stage 4.
const full = saveFkeiRuntime(buildFkeiRuntimeSaveSnapshot(fullFacts), {
  savedAt: new Date(2026, 7, 28, 13, 14, 15),
  download: () => { downloadCount++; },
});
assert.equal(full.document.completedStage, 4);
assert.ok(full.document.surface && full.document.artworkGraph && full.document.dryWeb?.exactDiagnosis);
assert.deepEqual(parseFkeiDocument(full.text), full.document);
assert.equal(serializeFkei(full.document), full.text);

// 3–4. Source runtime values are not mutated or aliased into the result.
const sourceBefore = diagnosis.basePositions[0];
full.document.surface!.diagnosis.basePositions[0] = 99;
assert.equal(diagnosis.basePositions[0], sourceBefore);
full.document.dryWeb!.preview.graph.stats.inputPoints = 44;
assert.equal(graph.stats.inputPoints, 0);
assert.notEqual(full.document.artworkGraph!.snapshot, artworkSnapshot);

// 5. A stale Dry Web artifact is omitted even when the lower prefix is valid.
const staleDry = saveFkeiRuntime(buildFkeiRuntimeSaveSnapshot({
    ...fullFacts,
    dryWeb: { current: true, value: { ...dryWeb, preview: { ...dryWeb.preview, surfaceFingerprint: "stale" } } },
  }), { savedAt: new Date(2026, 7, 28, 13, 14, 15), download: () => { downloadCount++; } });
assert.equal(staleDry.document.dryWeb, undefined);
assert.equal(staleDry.document.completedStage, 3);

// 5b. Surface binding drift (including target-longest drift) fails closed and
// therefore drops Surface plus all dependent Dry Web/exact data.
const targetLongestDrift = saveFkeiRuntime(buildFkeiRuntimeSaveSnapshot({
  ...fullFacts,
  surface: {
    ...fullFacts.surface!,
    currentBinding: { ...surfaceBinding, targetLongestMm: 2 },
  },
}), { savedAt: new Date(2026, 7, 28, 13, 14, 15), download: () => { downloadCount++; } });
assert.equal(targetLongestDrift.document.surface, undefined);
assert.equal(targetLongestDrift.document.dryWeb, undefined);
assert.equal(targetLongestDrift.document.completedStage, 3);

// 5c. A running/error/stale Surface predicate also drops dependent artifacts.
for (const surfaceState of ["running", "error", "stale"] as const) {
  const omittedSurface = saveFkeiRuntime(buildFkeiRuntimeSaveSnapshot({
    ...fullFacts,
    surface: { ...fullFacts.surface!, current: false },
  }), { savedAt: new Date(2026, 7, 28, 13, 14, 15), download: () => { downloadCount++; } });
  assert.equal(omittedSurface.document.surface, undefined, `${surfaceState} Surface must be omitted`);
  assert.equal(omittedSurface.document.dryWeb, undefined, `${surfaceState} Dry Web must be omitted`);
  assert.equal(omittedSurface.document.completedStage, 3, `${surfaceState} Surface lowers Stage 4`);
}

// 5d. Unrepresented Stage 5/6/7 runtime flags cannot raise the saved prefix.
assert.equal(full.document.completedStage, 4);

// 6. A stale downstream flag cannot claim a skipped stage.
const lowered = buildFkeiRuntimeSaveSnapshot(baseFacts({ 1: true, 2: true, 3: false, 4: true, 5: true, 6: true, 7: true }));
assert.equal(saveFkeiRuntime(lowered, { savedAt: new Date(2026, 7, 28, 13, 14, 15), download: () => { downloadCount++; } }).completedStage, 2);

// 7. Filename uses local author time and always carries the .fkei extension.
assert.equal(formatFkeiFilename(new Date(2026, 0, 2, 3, 4, 5)), "skin-project-20260102-030405.fkei");
assert.match(full.filename, /^skin-project-\d{8}-\d{6}\.fkei$/);

// 8. Self-validation failure never reaches the injected download callback and
// the pure adapter/save path never constructs a Worker.
let failedDownloads = 0;
let workerConstructors = 0;
const globalRecord = globalThis as unknown as Record<string, unknown>;
const previousWorker = globalRecord.Worker;
globalRecord.Worker = function SentinelWorker(): void { workerConstructors++; };
try {
  const workerFreeSave = saveFkeiRuntime(
    buildFkeiRuntimeSaveSnapshot(baseFacts({ 1: true, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false })),
    { savedAt: new Date(2026, 7, 28, 13, 14, 15), download: () => {} },
  );
  assert.equal(workerFreeSave.document.completedStage, 1);
  assert.throws(() => saveFkeiRuntime({
    ...buildFkeiRuntimeSaveSnapshot(baseFacts({ 1: true, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false })),
    bindings: { shapeFingerprint: "", patchSetRevision: 2, paintRevision: 3 },
  }, {
    savedAt: new Date(2026, 7, 28, 13, 14, 15),
    download: () => { failedDownloads++; },
  }));
} finally {
  if (previousWorker === undefined) delete globalRecord.Worker;
  else globalRecord.Worker = previousWorker;
}
assert.equal(failedDownloads, 0);
assert.equal(workerConstructors, 0);

console.log("fkeiRuntimeSave.test.ts: all assertions passed");

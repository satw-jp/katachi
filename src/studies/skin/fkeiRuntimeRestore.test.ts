import assert from "node:assert/strict";
import { currentBallIdCounter, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import { createArtworkGraph } from "./artworkGraph.ts";
import { captureFkei, parseFkeiDocument, serializeFkei, type FkeiSurfaceArtifact } from "./fkei.ts";
import { fkeiArtworkGraphPatches, fkeiArtworkGraphSourceKey, fkeiShapeFingerprint } from "./fkeiRestoreIdentity.ts";
import {
  applyFkeiRestorePlanAtomically,
  createFkeiRestorePlan,
  parseFkeiRestorePlan,
} from "./fkeiRuntimeRestore.ts";
import { DEFAULT_SKIN_HOST_PARAMS, replayDetached, type SkinHistoryEntry } from "./history.ts";
import { currentPatchIdCounter, resetPatchIdCounter } from "./field.ts";
import { assignOverhangSupportTargets } from "./overhangSupportPolicy.ts";
import { createSurfaceGraph } from "./surfaceGraph.ts";
import { createSupportPaintHistory, emptySupportPaint } from "./supportPaint.ts";
import { fkeiRiskDrivenLatticeSemanticSha256, type FkeiCanonicalDryWebArtifact, type FkeiRiskDrivenLatticeArtifact } from "./fkeiRiskDrivenLattice.ts";

const shapeHistory: SkinHistoryEntry[] = [
  { t: 1, op: "growHost", args: { params: { ...DEFAULT_SKIN_HOST_PARAMS, count: 2 } } },
];
const stage1State = replayDetached(shapeHistory);
const stage1Document = captureFkei({
  shape: { formatVersion: 1, entries: shapeHistory },
  bindings: {
    shapeFingerprint: fkeiShapeFingerprint(stage1State),
    patchSetRevision: stage1State.patchSetRevision,
    paintRevision: 0,
  },
  completedStage: 1,
});

resetBallIdCounter(777);
resetPatchIdCounter(888);
const stage1Plan = createFkeiRestorePlan(stage1Document);
assert.equal(currentBallIdCounter(), 777, "Restore Plan replay must not change the live host id counter");
assert.equal(currentPatchIdCounter(), 888, "Restore Plan replay must not change the live patch id counter");
assert.equal(stage1Plan.completedStage, 1);
assert.equal(stage1Plan.history.length, 1);
assert.equal(stage1Plan.shapeState.host.length, stage1State.host.length);
assert.equal(stage1Plan.surface, null);
assert.equal(stage1Plan.artworkGraph, null);

const patch = { id: 1, shape: "coin" as const, points: [{ x: 0, y: 0, z: 0, r: 0.5 }] };
const stage3History: SkinHistoryEntry[] = [
  ...shapeHistory,
  { t: 2, op: "packPatches", args: { patches: [patch], identity: "replace" } },
];
const stage3State = replayDetached(stage3History);
const shapeFingerprint = fkeiShapeFingerprint(stage3State);
const artworkSourceKey = fkeiArtworkGraphSourceKey(stage3State);
const artworkSnapshot = createArtworkGraph(
  createSurfaceGraph(fkeiArtworkGraphPatches(stage3State), stage3State.patchSetRevision, {
    revision: stage3State.patchSetRevision,
  }),
  { revision: stage3State.patchSetRevision },
);
const diagnosis = {
  type: "result" as const,
  generation: 1,
  metrics: {
    thresholdDeg: 45,
    surfaceArea: 1,
    dangerousAreaBefore: 0,
    dangerousAreaAfter: 0,
    mitigatedArea: 0,
    dangerousFaceCountBefore: 0,
    dangerousFaceCountAfter: 0,
    mitigatedFaceCount: 0,
    contactTolerance: 0.001,
  },
  basePositions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  baseNormals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  baseFaceCount: 1,
  resolution: 48,
  internalEdgeCount: 0,
  motifLowestPoints: [],
  beforeDangerPositions: new Float32Array(0),
  afterDangerPositions: new Float32Array(0),
  mitigatedPositions: new Float32Array(0),
  elapsedMs: 0,
};
const policy = assignOverhangSupportTargets({
  explicitTargets: [{ xMm: 0, yMm: 0, zMm: 0 }],
  supportSurfacePositionsMm: diagnosis.basePositions,
});
const surfaceBinding = {
  surfaceFingerprint: shapeFingerprint,
  resolution: 48,
  targetLongestMm: 80,
  angleThresholdDeg: 45,
  cacheKeys: null,
};
const surface: FkeiSurfaceArtifact = {
  diagnosis,
  automaticSupportResult: policy,
  effectiveSupportResult: policy,
  binding: surfaceBinding,
};
const paint = emptySupportPaint(80);
const stage3Document = captureFkei({
  shape: { formatVersion: 1, entries: stage3History },
  bindings: {
    shapeFingerprint,
    patchSetRevision: stage3State.patchSetRevision,
    paintRevision: 4,
    surface: surfaceBinding,
    artworkGraph: { sourceKey: artworkSourceKey, patchSetRevision: stage3State.patchSetRevision },
  },
  supportPaint: {
    revision: 4,
    history: createSupportPaintHistory(paint),
    mode: "inside",
    radiusMm: 6,
    paintBackfaces: false,
    enabled: false,
  },
  artworkGraph: { snapshot: artworkSnapshot, sourceKey: artworkSourceKey },
  surface,
  completedStage: 3,
});

const sourceBefore = serializeFkei(stage3Document);
const stage3Plan = parseFkeiRestorePlan(sourceBefore);
assert.equal(stage3Plan.completedStage, 3);
assert.equal(stage3Plan.shapeState.patches.length, 1);
assert.equal(stage3Plan.supportPaint?.revision, 4);
assert.equal(stage3Plan.artworkGraph?.sourceKey, artworkSourceKey);
assert.equal(stage3Plan.artworkGraph?.snapshot.surfaceDraft.nodes.length, 1);
assert.equal(stage3Plan.surface?.binding.targetLongestMm, 80);
assert.equal(stage3Plan.downstream.dryWeb, null);
assert.equal(stage3Plan.downstream.dryWebExact, null);
assert.equal(stage3Plan.downstream.stage7Provisional, null);
assert.equal(stage3Plan.downstream.stage8, null);
assert.equal(serializeFkei(stage3Document), sourceBefore, "Restore Plan creation must not mutate the parsed document");
// Stage1–3 restoration remains isolated: no compact checkpoint artifact is
// synthesized from this legacy prefix, and exact per-face downstream facts
// remain unavailable.
assert.equal(stage3Plan.canonicalDryWeb, null);
assert.equal(stage3Plan.riskDrivenLattice, null);

const checkpointBinding = {
  shapeFingerprint,
  patchSetRevision: stage3State.patchSetRevision,
  paintRevision: 4,
  artworkGraphSourceKey: artworkSourceKey,
  canonicalRequestSha256: "request-sha",
  canonicalGraphSha256: "564dcd32c422149cba61ffa0ca5f7286ea9811410889d23400ea6312d71b3d3d",
  surfaceResolution: 48,
  surfaceTargetLongestMm: 80,
  surfaceAngleThresholdDeg: 45,
  exactDiagnosisProvenanceSha256: "exact-sha",
};
const canonicalDryWeb: FkeiCanonicalDryWebArtifact = {
  schemaVersion: 1,
  producer: "katachi.skin.risk-driven-permanent-lattice-v0",
  inputBinding: checkpointBinding,
  graph: {
    kind: "targetedGrid",
    nodes: [
      { id: 0, position: { x: 0, y: 0, z: 0 }, radius: 0.1 },
      { id: 1, position: { x: 0, y: 0, z: 1 }, radius: 0.1 },
    ],
    edges: [{ id: 0, start: 0, end: 1, radius: 0.1 }],
    stats: { inputPoints: 2, delaunayTetrahedra: 0, candidateEdges: 1, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
  },
  shapeSnapshot: {
    mode: stage3State.mode,
    patchSetRevision: stage3State.patchSetRevision,
    host: stage3State.host,
    hostK: stage3State.hostParams.k,
    thickness: stage3State.skinParams.thickness,
    roundK: stage3State.skinParams.roundK,
    coinBulge: stage3State.skinParams.coinBulge,
    coinBulgeBalance: stage3State.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: stage3State.skinParams.quadMeshJoinWidth,
    patches: stage3State.patches,
  },
  exactDiagnosisSummary: { teal: 1, orange: 0, red: 0, provenanceSha256: "exact-sha", summarySha256: "53e7677c52ec82fad85aa8ed757f766acf634a6c553e38931c3a494c5e4b27b1" },
};
const riskDrivenLattice: FkeiRiskDrivenLatticeArtifact = {
  schemaVersion: 1,
  producer: "katachi.skin.risk-driven-permanent-lattice-v0",
  inputBinding: { ...checkpointBinding, canonicalGraphNodes: 2, canonicalGraphEdges: 1 },
  planSha256: "plan", validationSha256: "validation", stlSha256: "stl", semanticSha256: "0".repeat(64),
  settings: { thresholdDeg: 45, meshStep: 0.1, scaleMmPerUnit: 11, diameterMm: 2.2, maximumSegmentLengthMm: 5, maximumAngleFromVerticalDeg: 45 },
  graph: {
    kind: "targetedGrid",
    nodes: [
      { id: 0, position: { x: 0, y: 0, z: 0 }, radius: 0.1, role: "surface-anchor", anchorId: 0 },
      { id: 1, position: { x: 0, y: 0, z: 1 }, radius: 0.1, role: "risk-target", candidateId: 0, spineId: 0 },
    ],
    edges: [{ id: 0, start: 0, end: 1, radius: 0.1, role: "branch", diameterMm: 2.2, physicalLengthMm: 1, horizontalMm: 0, verticalMm: 1, angleFromVerticalDeg: 0, candidateId: 0, spineId: 0 }],
    stats: { inputPoints: 2, delaunayTetrahedra: 0, candidateEdges: 1, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
  },
  anchors: [{ id: 0, diagnosisFaceId: 0, position: { x: 0, y: 0, z: 0 }, angleDeg: 0, candidateIds: [0] }],
  selectedCandidates: [{ id: 0, sourceRank: 0, riskClusterId: 0, position: { x: 0, y: 0, z: 1 }, affectedRiskArea: 1, remainingRiskArea: 0, requiredLatticeLength: 1, supportGain: 1, anchorId: 0 }],
  spines: [{ id: 0, anchorId: 0, candidateIds: [0], nodeIds: [0, 1], edgeIds: [0] }],
  branches: [{ candidateId: 0, spineId: 0, junctionNodeId: 0, targetNodeId: 1, edgeIds: [0] }],
  generationFacts: { canonicalNodeCount: 2, canonicalEdgeCount: 1, latticeNodeCount: 2, latticeEdgeCount: 1, augmentedNodeCount: 4, augmentedEdgeCount: 2, sharedSpineCount: 0, savedDiameterMm: 2.2, triangleCount: 1 },
  sourceSpace: { resolution: 128, targetLongestMm: 80 },
};
(riskDrivenLattice as { semanticSha256: string }).semanticSha256 = fkeiRiskDrivenLatticeSemanticSha256(riskDrivenLattice);
const checkpointText = serializeFkei({
  ...stage3Document,
  completedStage: 4,
  canonicalDryWeb,
  riskDrivenLattice,
});
const checkpointPlan = parseFkeiRestorePlan(checkpointText);
assert.equal(checkpointPlan.completedStage, 4);
assert.deepEqual([checkpointPlan.canonicalDryWeb?.graph.nodes.length, checkpointPlan.canonicalDryWeb?.graph.edges.length], [2, 1]);
assert.deepEqual([checkpointPlan.riskDrivenLattice?.graph.nodes.length, checkpointPlan.riskDrivenLattice?.graph.edges.length], [2, 1]);
assert.deepEqual([checkpointPlan.downstream.dryWeb?.graph.nodes.length, checkpointPlan.downstream.dryWeb?.graph.edges.length], [2, 1]);
assert.equal(checkpointPlan.downstream.dryWebExact, null);
assert.equal(checkpointPlan.downstream.stage7Provisional, null);
assert.equal(checkpointPlan.downstream.stage8, null);
const snapshotMismatchCheckpoint = parseFkeiDocument(checkpointText);
(snapshotMismatchCheckpoint.canonicalDryWeb!.shapeSnapshot as { hostK: number }).hostK = 0.75;
assert.throws(() => parseFkeiRestorePlan(serializeFkei(snapshotMismatchCheckpoint)), /Shape snapshot does not match authoritative Shape fingerprint/);
const exactSummaryMismatchCheckpoint = parseFkeiDocument(checkpointText);
(exactSummaryMismatchCheckpoint.canonicalDryWeb!.exactDiagnosisSummary as { red: number }).red = 1;
assert.throws(() => parseFkeiRestorePlan(serializeFkei(exactSummaryMismatchCheckpoint)), /summary SHA-256/);
const latticeGeometryMismatchCheckpoint = parseFkeiDocument(checkpointText);
(latticeGeometryMismatchCheckpoint.riskDrivenLattice!.graph.nodes[1]!.position as { z: number }).z = 2;
assert.throws(() => parseFkeiRestorePlan(serializeFkei(latticeGeometryMismatchCheckpoint)), /semantic SHA-256/);
let checkpointRuntime = { marker: "before-checkpoint", canonicalNodes: 0 };
assert.throws(() => applyFkeiRestorePlanAtomically(checkpointPlan, {
  capture: () => ({ ...checkpointRuntime }),
  cancelWorkers: () => {},
  replace: () => { checkpointRuntime = { marker: "partial-checkpoint", canonicalNodes: 2 }; throw new Error("checkpoint replace failed"); },
  restore: (snapshot) => { checkpointRuntime = snapshot; },
  redraw: () => {},
}), /checkpoint replace failed/);
assert.deepEqual(checkpointRuntime, { marker: "before-checkpoint", canonicalNodes: 0 });

// The production Open adapter uses this same atomic boundary after it has
// changed runtime state, UI bindings, and renderer resources.  A redraw
// failure must restore all three domains, not just the Shape history.
let productionLikeRuntime = {
  state: "before",
  ui: { meshResolution: 64, threshold: 40, permanentOverlay: true },
  renderer: { graph: "old", view: "beads", permanentOverlay: true },
};
const productionLikeBefore = structuredClone(productionLikeRuntime);
assert.throws(() => applyFkeiRestorePlanAtomically(checkpointPlan, {
  capture: () => structuredClone(productionLikeRuntime),
  cancelWorkers: () => {},
  replace: () => {
    productionLikeRuntime = {
      state: "partial",
      ui: { meshResolution: 48, threshold: 45, permanentOverlay: false },
      renderer: { graph: "checkpoint", view: "mesh", permanentOverlay: false },
    };
  },
  restore: (snapshot) => { productionLikeRuntime = snapshot; },
  redraw: () => { throw new Error("renderer redraw failed"); },
}), /renderer redraw failed/);
assert.deepEqual(productionLikeRuntime, productionLikeBefore, "Open redraw rollback restores runtime, UI, and renderer facts together");

assert.throws(() => parseFkeiRestorePlan("{broken"), /JSON|Unexpected/);
assert.throws(() => createFkeiRestorePlan({
  ...stage3Document,
  bindings: { ...stage3Document.bindings, shapeFingerprint: "stale-shape" },
}), /Shape replay/);
assert.throws(() => createFkeiRestorePlan({
  ...stage3Document,
  artworkGraph: { ...stage3Document.artworkGraph!, sourceKey: "stale-artwork" },
  bindings: { ...stage3Document.bindings, artworkGraph: { ...stage3Document.bindings.artworkGraph!, sourceKey: "stale-artwork" } },
}), /Artwork Graph identity/);

let runtime = { marker: "before", stage: 0 };
let cancelled = 0;
let redraws = 0;
assert.throws(() => applyFkeiRestorePlanAtomically(stage3Plan, {
  capture: () => ({ ...runtime }),
  cancelWorkers: () => { cancelled += 1; },
  replace: () => { runtime = { marker: "partial", stage: 3 }; throw new Error("replace failed"); },
  restore: (snapshot) => { runtime = snapshot; },
  redraw: () => { redraws += 1; },
}), /replace failed/);
assert.deepEqual(runtime, { marker: "before", stage: 0 }, "Open apply failure must preserve the old Runtime");
assert.equal(cancelled, 1);
assert.equal(redraws, 1);

applyFkeiRestorePlanAtomically(stage3Plan, {
  capture: () => ({ ...runtime }),
  cancelWorkers: () => { cancelled += 1; },
  replace: (plan) => { runtime = { marker: "restored", stage: plan.completedStage }; },
  restore: (snapshot) => { runtime = snapshot; },
  redraw: () => { redraws += 1; },
});
assert.deepEqual(runtime, { marker: "restored", stage: 3 });

console.log("fkeiRuntimeRestore tests passed");

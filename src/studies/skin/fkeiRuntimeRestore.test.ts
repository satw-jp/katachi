import assert from "node:assert/strict";
import { currentBallIdCounter, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import { createArtworkGraph } from "./artworkGraph.ts";
import { captureFkei, serializeFkei, type FkeiSurfaceArtifact } from "./fkei.ts";
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

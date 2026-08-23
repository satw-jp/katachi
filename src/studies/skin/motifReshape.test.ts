import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import {
  captureMotifShapeParams,
  DEFAULT_SKIN_PARAMS,
  generateShapePoints,
  realizeRing3dContinuity,
  type Patch,
  type Projected,
} from "./field.ts";
import { createEmptyState, record, replay, undoLastHistoryEntry, type SkinHistoryEntry } from "./history.ts";
import { gaussLinkingNumber } from "../rings/linking.ts";
import { buildSkinMesh } from "./meshExport.ts";
import { reshapePatchMotif, ring3dCenterlineDiameter } from "./motifReshape.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const anchor: Projected = { x: 1, y: 0, z: 0, nx: 1, ny: 0, nz: 0 };
const params = { ...DEFAULT_SKIN_PARAMS, patchShape: "flower" as const, flowerMotifPreset: "custom" as const };
const patch: Patch = {
  id: 17,
  shape: "flower",
  quadCellId: 8,
  surfaceCellId: 5,
  surfaceCellKind: "quad",
  motifParams: captureMotifShapeParams(params),
  points: generateShapePoints("flower", host, 0, anchor, 0.38, params, () => 0.37, 17, []),
};

const editedParams = { ...captureMotifShapeParams(params), flowerPetalCount: 9, flowerOpening: 1.12 };
const original = structuredClone(patch);
const first = reshapePatchMotif(patch, host, 0, params, editedParams, [patch]);
assert.equal(first.ok, true, "an isolated motif can be regenerated");
if (!first.ok) throw new Error(first.reason);
assert.deepEqual(patch, original, "reshape never mutates the previous patch");
assert.equal(first.patch.id, patch.id, "reshape preserves the stable Patch ID");
assert.equal(first.patch.shape, patch.shape, "reshape preserves the shape family");
assert.equal(first.patch.quadCellId, patch.quadCellId, "reshape preserves cell provenance");
assert.deepEqual(first.patch.motifParams, editedParams, "reshape records the exact values used");
assert.notDeepEqual(first.patch.points, patch.points, "changed motif values realize new geometry");

const second = reshapePatchMotif(patch, host, 0, params, editedParams, [patch]);
assert.deepEqual(second, first, "the same saved inputs regenerate deterministically");
const repeat = reshapePatchMotif(first.patch, host, 0, params, editedParams, [first.patch]);
assert.equal(repeat.ok, true, "the saved result can be reshaped again");
if (!repeat.ok) throw new Error(repeat.reason);
const envelope = (candidate: Patch) => Math.max(...candidate.points.map((point) =>
  Math.hypot(point.x - anchor.x, point.y - anchor.y, point.z - anchor.z) + (point.baseR ?? point.r),
));
assert.ok(Math.abs(envelope(repeat.patch) - envelope(first.patch)) < 1e-6, "repeating the same values does not drift a flower's size");

const bridged: Patch = {
  ...patch,
  points: [...patch.points, { x: 0.8, y: 0, z: 0, r: 0.05, role: "bridge" }],
};
assert.deepEqual(
  reshapePatchMotif(bridged, host, 0, params, editedParams, [bridged]),
  { ok: false, reason: "接続点を持つ要素は、接続を壊すため個別再生成できません" },
  "bridge-owned motifs are rejected instead of silently disconnecting them",
);

const bridgeOwner: Patch = { ...patch, id: 31, points: [...patch.points, { x: 0.8, y: 0, z: 0, r: 0.05, role: "bridge" }] };
const bridgePeer: Patch = { ...patch, id: 32, points: patch.points.map((point) => ({ ...point })) };
assert.deepEqual(
  reshapePatchMotif(bridgePeer, host, 0, params, editedParams, [bridgeOwner, bridgePeer]),
  { ok: false, reason: "花どうしの接続があるため、花は個別再生成できません" },
  "a bridge owned by the lower-ID flower blocks reshaping the higher-ID flower too",
);
const bridgedHistory: SkinHistoryEntry[] = [];
const bridgedState = createEmptyState();
record(bridgedHistory, bridgedState, "packPatches", { patches: [bridgeOwner, bridgePeer], identity: "replace" });
const beforeBridgedReplay = structuredClone(bridgedState.patches);
record(bridgedHistory, bridgedState, "reshapePatch", { patch: bridgePeer, params: bridgePeer.motifParams! });
assert.deepEqual(bridgedState.patches, beforeBridgedReplay, "history replay refuses a higher-ID flower reshape while any flower owns a bridge");

const flatParams = { ...DEFAULT_SKIN_PARAMS, patchShape: "flatRing" as const, ringWobblePos: 0 };
const flatParamsWithPositionWobble = { ...flatParams, ringWobblePos: 0.9 };
const flatPoints = (p: typeof flatParams) => {
  let random = 41;
  return generateShapePoints("flatRing", host, 0, anchor, 0.32, p, () => {
    random = (random * 1664525 + 1013904223) >>> 0;
    return random / 0x1_0000_0000;
  }, 41, []);
};
assert.deepEqual(flatPoints(flatParamsWithPositionWobble), flatPoints(flatParams), "flat-ring generation ignores position wobble, matching the selected editor");

const history: SkinHistoryEntry[] = [];
const state = createEmptyState();
record(history, state, "packPatches", { patches: [patch], identity: "replace" });
record(history, state, "setAnnotation", {
  reference: { domain: "surface", setRevision: state.patchSetRevision, patchId: patch.id },
  value: { keep: true, weakContact: false, largeOpening: false, note: "retain" },
});
state.partition = { groupA: [patch.id], groupB: [], seedIds: [patch.id], adjacencyThreshold: 0.01, confirmedAt: "test" };
record(history, state, "reshapePatch", { patch: first.patch, params: editedParams });
assert.equal(history.filter((entry) => entry.op === "reshapePatch").length, 1, "one local reshape records exactly one replayable reshapePatch entry");
assert.deepEqual(state.patches, [first.patch], "a valid reshape immediately adopts its changed realized point count and saved parameters");
assert.equal(state.partition, null, "reshape invalidates a stale physical partition");
assert.equal(state.patchSetRevision, 1, "reshape keeps the patch-set revision");
assert.equal(state.annotations[0]?.value.note, "retain", "reshape keeps review annotations");
assert.deepEqual(replay(history).patches, state.patches, "realized reshape geometry and values replay exactly");
const undone = undoLastHistoryEntry(history);
assert.deepEqual(undone.state.patches, [patch], "undo restores the prior realized geometry and saved parameters");

const invalidReplayHistory: SkinHistoryEntry[] = [];
const invalidReplayState = createEmptyState();
record(invalidReplayHistory, invalidReplayState, "packPatches", { patches: [patch], identity: "replace" });
const beforeInvalidReplay = structuredClone(invalidReplayState.patches);
record(invalidReplayHistory, invalidReplayState, "reshapePatch", {
  patch: { ...first.patch, quadCellId: 999 },
  params: editedParams,
});
assert.deepEqual(invalidReplayState.patches, beforeInvalidReplay, "reshape replay rejects a result that changes cell placement metadata");

let coinRandomState = 73;
const coinRandom = () => {
  coinRandomState = (coinRandomState * 1664525 + 1013904223) >>> 0;
  return coinRandomState / 0x1_0000_0000;
};
const coinAnchor: Projected = {
  x: 0.4364357804719848,
  y: 0.8728715609439696,
  z: 0.2182178902359924,
  nx: 0.4364357804719848,
  ny: 0.8728715609439696,
  nz: 0.2182178902359924,
};
const coinParams = { ...DEFAULT_SKIN_PARAMS, patchShape: "coin" as const, irregularity: 0.8 };
const irregularCoin: Patch = {
  id: 28,
  shape: "coin",
  motifParams: captureMotifShapeParams(coinParams),
  points: generateShapePoints("coin", host, 0, coinAnchor, 0.32, coinParams, coinRandom, 28, []),
};
const irregularCoinBefore = structuredClone(irregularCoin);
const coinNoOp = reshapePatchMotif(
  irregularCoin,
  host,
  0,
  coinParams,
  captureMotifShapeParams(coinParams),
  [irregularCoin],
);
assert.equal(coinNoOp.ok, true, "an irregular multi-point coin can be regenerated with unchanged values");
if (!coinNoOp.ok) throw new Error(coinNoOp.reason);
assert.deepEqual(irregularCoin, irregularCoinBefore, "coin reshape does not mutate its input");
assert.ok(
  Math.hypot(
    coinNoOp.patch.points[0].x - irregularCoin.points[0].x,
    coinNoOp.patch.points[0].y - irregularCoin.points[0].y,
    coinNoOp.patch.points[0].z - irregularCoin.points[0].z,
  ) < 1e-9,
  "coin no-op reshape retains its documented projected points[0] anchor",
);
const coinHistory: SkinHistoryEntry[] = [];
const coinState = createEmptyState();
record(coinHistory, coinState, "packPatches", { patches: [irregularCoin], identity: "replace" });
record(coinHistory, coinState, "reshapePatch", { patch: coinNoOp.patch, params: coinNoOp.patch.motifParams! });
assert.deepEqual(replay(coinHistory).patches, coinState.patches, "coin reshape replays its realized result exactly");
const coinUndone = undoLastHistoryEntry(coinHistory).state.patches[0];
assert.deepEqual(coinUndone?.points, irregularCoin.points, "coin undo restores the original realized geometry");
assert.deepEqual(coinUndone?.motifParams, irregularCoin.motifParams, "coin undo restores the original saved values");

// coin central opening ------------------------------------------------------

const coinRimParams = {
  ...coinParams,
  seed: "coin-rim",
  coinHoleRatio: 0.62,
  irregularity: 0.45,
  roundK: 0,
};
const coinRimPoints = generateShapePoints("coin", host, 0, anchor, 0.32, coinRimParams, () => 0.37, 81, []);
assert.ok(coinRimPoints.length >= 12, "a coin opening realizes a dense outer rim rather than one center sphere");
const coinRadial = (point: (typeof coinRimPoints)[number]) => Math.hypot(point.y - anchor.y, point.z - anchor.z);
assert.ok(Math.min(...coinRimPoints.map((point) => coinRadial(point) - point.r)) > 0.12, "the requested coin opening leaves a real central void");
assert.ok(Math.max(...coinRimPoints.map((point) => coinRadial(point) + point.r)) <= 0.35, "opening the coin preserves its authored outer envelope");
for (let index = 0; index < coinRimPoints.length; index++) {
  const a = coinRimPoints[index];
  const b = coinRimPoints[(index + 1) % coinRimPoints.length];
  assert.ok(
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= a.r + b.r + 1e-9,
    "every coin-rim edge, including the closing edge, remains connected",
  );
}
const thinCoinPoints = generateShapePoints("coin", host, 0, anchor, 0.32, { ...coinRimParams, coinHoleRatio: 0.95 }, () => 0.37, 82, []);
assert.ok(thinCoinPoints.length > coinRimPoints.length, "the outer-rim limit automatically increases node density instead of separating");
assert.ok(Math.max(...thinCoinPoints.map((point) => point.r)) <= 0.011, "the maximum opening leaves only the protected minimum-width outer rim");

const annularCoin: Patch = {
  id: 83,
  shape: "coin",
  motifParams: captureMotifShapeParams(coinRimParams),
  points: coinRimPoints,
};
const annularNoOp = reshapePatchMotif(annularCoin, host, 0, coinRimParams, annularCoin.motifParams!, [annularCoin]);
assert.equal(annularNoOp.ok, true, "an annular coin can be edited again without relying on a center point");
if (!annularNoOp.ok) throw new Error(annularNoOp.reason);
assert.ok((annularNoOp.patch.motifParams?.coinHoleRatio ?? 0) > 0, "individual coin reshape retains its explicit opening value");

const openedCoin = reshapePatchMotif(
  irregularCoin,
  host,
  0,
  coinParams,
  { ...captureMotifShapeParams(coinParams), coinHoleRatio: 0.72 },
  [irregularCoin],
);
assert.equal(openedCoin.ok, true, "one selected historical solid coin can be changed into an open coin");
if (!openedCoin.ok) throw new Error(openedCoin.reason);
const openedHistory: SkinHistoryEntry[] = [];
const openedState = createEmptyState();
record(openedHistory, openedState, "packPatches", { patches: [irregularCoin], identity: "replace" });
record(openedHistory, openedState, "reshapePatch", { patch: openedCoin.patch, params: openedCoin.patch.motifParams! });
assert.deepEqual(replay(openedHistory).patches, openedState.patches, "coin opening geometry and parameter replay exactly");
const restoredFilledCoin = undoLastHistoryEntry(openedHistory).state.patches[0];
assert.deepEqual(restoredFilledCoin?.points, irregularCoin.points, "undo restores the filled coin geometry before its opening edit");
assert.equal(restoredFilledCoin?.motifParams?.coinHoleRatio, 0, "undo restores the filled coin opening value");

const { coinHoleRatio: _legacyCoinHole, ...legacyCoinMotifParams } = irregularCoin.motifParams!;
const legacyCoinReplacement: Patch = { ...irregularCoin, motifParams: legacyCoinMotifParams };
const legacyCoinHistory: SkinHistoryEntry[] = [];
const legacyCoinState = createEmptyState();
record(legacyCoinHistory, legacyCoinState, "packPatches", { patches: [legacyCoinReplacement], identity: "replace" });
record(legacyCoinHistory, legacyCoinState, "reshapePatch", { patch: legacyCoinReplacement, params: legacyCoinMotifParams });
assert.deepEqual(replay(legacyCoinHistory).patches[0]?.points, irregularCoin.points, "pre-v0.47 motif params without coinHoleRatio replay as the historical solid coin");

// ring3d continuity ---------------------------------------------------------

const ringAnchor: Projected = { x: 1, y: 0, z: 0, nx: 1, ny: 0, nz: 0 };
const ringHost: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const ringCases = [
  { anchorR: 0.02, tube: 0.02, nodes: 3, wobbleR: 0, wobblePos: 0, seed: "min" },
  { anchorR: 0.8, tube: 0.02, nodes: 4, wobbleR: 1, wobblePos: 1, seed: "rough-four" },
  { anchorR: 0.8, tube: 0.3, nodes: 18, wobbleR: 1, wobblePos: 1, seed: "rough-eighteen" },
  { anchorR: 0.2, tube: 0.08, nodes: 9, wobbleR: 0.3, wobblePos: 0.15, seed: "defaultish" },
];
for (const [index, fixture] of ringCases.entries()) {
  const ringParams = {
    ...DEFAULT_SKIN_PARAMS,
    patchShape: "ring3d" as const,
    seed: fixture.seed,
    ringNodeCount: fixture.nodes,
    ringTubeR: fixture.tube,
    ringWobbleR: fixture.wobbleR,
    ringWobblePos: fixture.wobblePos,
    // Continuity is geometric and remains required even with a sharp union.
    roundK: 0,
  };
  const realized = generateShapePoints("ring3d", ringHost, 0, ringAnchor, fixture.anchorR, ringParams, () => 0.321, 400 + index, []);
  assert.equal(realized.filter((point) => point.ringPrimary).length, fixture.nodes, `${fixture.seed}: ringNodeCount remains the authored primary-node count`);
  assert.ok(realized.length >= fixture.nodes, `${fixture.seed}: realized point count includes only necessary connectors`);
  for (let i = 0; i < realized.length; i++) {
    const a = realized[i];
    const b = realized[(i + 1) % realized.length];
    assert.ok(
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= a.r + b.r,
      `${fixture.seed}: every cyclic edge including the closing edge overlaps`,
    );
  }
  const primary = realized.filter((point) => point.ringPrimary);
  const center = { x: ringAnchor.x + ringAnchor.nx * fixture.tube, y: 0, z: 0 };
  const inner = Math.min(...primary.map((point) => Math.hypot(point.y - center.y, point.z - center.z) - point.r));
  const outer = Math.max(...primary.map((point) => Math.hypot(point.y - center.y, point.z - center.z) + point.r));
  for (const connector of realized.filter((point) => !point.ringPrimary)) {
    const radial = Math.hypot(connector.y - center.y, connector.z - center.z);
    assert.ok(radial - connector.r >= inner - 1e-8 && radial + connector.r <= outer + 1e-8, `${fixture.seed}: connector stays inside the authored radial envelope`);
  }
}

const tangentRadius = Math.sqrt(3) / 2;
const subToleranceGap = 5e-10;
const almostTouchingPrimary = [
  { x: 1, y: 0, z: 0, r: tangentRadius },
  { x: Math.cos(Math.PI * 2 / 3 + subToleranceGap * 2), y: Math.sin(Math.PI * 2 / 3 + subToleranceGap * 2), z: 0, r: tangentRadius },
  { x: Math.cos(Math.PI * 4 / 3), y: Math.sin(Math.PI * 4 / 3), z: 0, r: tangentRadius },
];
const almostTouchingDistance = Math.hypot(
  almostTouchingPrimary[0].x - almostTouchingPrimary[1].x,
  almostTouchingPrimary[0].y - almostTouchingPrimary[1].y,
);
assert.ok(almostTouchingDistance > tangentRadius * 2 && almostTouchingDistance - tangentRadius * 2 < 1e-9, "the strict continuity fixture begins with a deliberately sub-tolerance gap");
const strictRealized = realizeRing3dContinuity(almostTouchingPrimary, { center: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 } });
assert.ok(strictRealized.some((point) => point.ringPrimary === false), "a 5e-10 gap still receives a connector under the strict invariant");
for (let index = 0; index < strictRealized.length; index++) {
  const a = strictRealized[index];
  const b = strictRealized[(index + 1) % strictRealized.length];
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= a.r + b.r, "the sub-tolerance fixture returns a strictly overlapping cyclic chain");
}

const legacyRing: Patch = {
  id: 201,
  shape: "ring3d",
  points: [
    { x: 1.2, y: 0, z: 0, r: 0.05 },
    { x: 1, y: 0.2, z: 0, r: 0.05 },
    { x: 0.8, y: 0, z: 0, r: 0.05 },
  ],
};
const legacyHistory: SkinHistoryEntry[] = [];
const legacyState = createEmptyState();
record(legacyHistory, legacyState, "packPatches", { patches: [legacyRing], identity: "replace" });
assert.deepEqual(replay(legacyHistory).patches[0]?.points, legacyRing.points, "legacy recipe point arrays remain literal and are never continuity-rewritten on replay");

const newRingParams = { ...DEFAULT_SKIN_PARAMS, patchShape: "ring3d" as const, seed: "new-ring-replay", ringNodeCount: 4, ringTubeR: 0.03, ringWobbleR: 1, ringWobblePos: 1 };
const newRing: Patch = {
  id: 202,
  shape: "ring3d",
  motifParams: captureMotifShapeParams(newRingParams),
  points: generateShapePoints("ring3d", ringHost, 0, ringAnchor, 0.25, newRingParams, () => 0.51, 202, []),
};
const newRingHistory: SkinHistoryEntry[] = [];
const newRingState = createEmptyState();
record(newRingHistory, newRingState, "packPatches", { patches: [newRing], identity: "replace" });
assert.deepEqual(replay(newRingHistory).patches[0]?.points, newRing.points, "new pack/manual generation replays its exact interleaved connector array");
const geometricRingDiameter = (candidate: Patch) => {
  const primary = candidate.points.filter((point) => point.ringPrimary);
  const center = primary.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
  center.x /= primary.length; center.y /= primary.length; center.z /= primary.length;
  return primary.reduce((sum, point) => sum + Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z), 0) / primary.length * 2;
};
const initialDiameter = ring3dCenterlineDiameter(newRing);
assert.ok(initialDiameter !== null && initialDiameter > 0, "legacy/generated ring derives an editable centerline diameter");
const diameterBaseline = reshapePatchMotif(newRing, ringHost, 0, newRingParams, newRing.motifParams!, [newRing]);
const desiredDiameter = 1.0;
const diameterOnly = reshapePatchMotif(newRing, ringHost, 0, newRingParams, newRing.motifParams!, [newRing], desiredDiameter);
assert.equal(diameterBaseline.ok, true);
assert.equal(diameterOnly.ok, true, "an isolated ring accepts a direct diameter");
if (!diameterBaseline.ok || !diameterOnly.ok) throw new Error("diameter reshape failed");
assert.equal(diameterOnly.patch.ringDiameter, desiredDiameter, "requested centerline diameter is stored independently");
assert.equal(ring3dCenterlineDiameter(diameterOnly.patch), desiredDiameter, "stored diameter is the next editor value");
assert.ok(geometricRingDiameter(diameterOnly.patch) > geometricRingDiameter(diameterBaseline.patch), "diameter widens the primary-node orbit");
assert.deepEqual(
  diameterOnly.patch.points.filter((point) => point.ringPrimary).map((point) => point.r),
  diameterBaseline.patch.points.filter((point) => point.ringPrimary).map((point) => point.r),
  "diameter does not alter the authored tube radii",
);
const diameterHistory: SkinHistoryEntry[] = [];
const diameterState = createEmptyState();
record(diameterHistory, diameterState, "packPatches", { patches: [newRing], identity: "replace" });
record(diameterHistory, diameterState, "reshapePatch", { patch: diameterOnly.patch, params: diameterOnly.patch.motifParams! });
assert.equal(replay(diameterHistory).patches[0]?.ringDiameter, desiredDiameter, "direct diameter replays without regenerating geometry");
assert.equal(undoLastHistoryEntry(diameterHistory).state.patches[0]?.ringDiameter, undefined, "undo restores the prior derived diameter state");
const reshapedRingParams = { ...newRing.motifParams!, ringNodeCount: 7, ringTubeR: 0.05 };
const reshapedRing = reshapePatchMotif(newRing, ringHost, 0, newRingParams, reshapedRingParams, [newRing]);
assert.equal(reshapedRing.ok, true, "an isolated ring with connector provenance can be explicitly reshaped");
if (!reshapedRing.ok) throw new Error(reshapedRing.reason);
record(newRingHistory, newRingState, "reshapePatch", { patch: reshapedRing.patch, params: reshapedRingParams });
assert.deepEqual(newRingState.patches, [reshapedRing.patch], "ring reshape adopts its new primary and connector count");
assert.deepEqual(replay(newRingHistory).patches, [reshapedRing.patch], "ring reshape replays the exact realized connector array");
assert.deepEqual(undoLastHistoryEntry(newRingHistory).state.patches[0]?.points, newRing.points, "ring reshape undo restores the prior realized connector array");

const loop = (id: number, vertical: boolean): Patch => ({
  id,
  shape: "ring3d",
  points: Array.from({ length: 48 }, (_, index) => {
    const theta = index / 48 * Math.PI * 2;
    return vertical
      ? { x: 1 + Math.cos(theta), y: 0, z: Math.sin(theta), r: 0.03 }
      : { x: Math.cos(theta), y: Math.sin(theta), z: 0, r: 0.03 };
  }),
});
const loopCenters = (patch: Patch) => patch.points.map(({ x, y, z }) => ({ x, y, z }));
assert.equal(Math.round(gaussLinkingNumber(loopCenters(loop(301, false)), loopCenters(loop(302, true)))), -1, "interleaved centreline ordering retains the known Hopf-link rounded value");
const shiftedLoop = { ...loop(304, true), points: loop(304, true).points.map((point) => ({ ...point, x: point.x + 4 })) };
assert.ok(Math.abs(Math.round(gaussLinkingNumber(loopCenters(loop(303, false)), loopCenters(shiftedLoop)))) === 0, "separate rings retain the known unlinked rounded value");

const meshRing: Patch = {
  id: 401,
  shape: "ring3d",
  points: generateShapePoints("ring3d", ringHost, 0, ringAnchor, 0.35, { ...DEFAULT_SKIN_PARAMS, patchShape: "ring3d", seed: "mesh-audit", ringNodeCount: 8, ringTubeR: 0.12, ringWobbleR: 0, ringWobblePos: 0 }, () => 0.2, 401, []),
};
for (const resolution of [32, 48]) {
  const mesh = buildSkinMesh("plate", ringHost, 0, 0.2, [meshRing], 0, { resolution, targetLongestMm: 40 }, 0);
  assert.equal(mesh.watertight.ok, true, `isolated continuous ring mesh is watertight at resolution ${resolution}`);
  assert.equal(mesh.connectedComponents, 1, `isolated continuous ring mesh has one component at resolution ${resolution}`);
}

console.log("Selected motif reshape tests: 64 passed");

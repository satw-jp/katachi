import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import {
  DEFAULT_SKIN_PARAMS,
  connectFlowerPatchesDirectly,
  compositeSdf,
  estimatePatchComponents,
  fuseFlowerPatchesByExpansion,
  generateShapePoints,
  packPatchesGreedy,
  shellSdf,
  type FlowerMotifPresetId,
  type Patch,
  type Projected,
} from "./field.ts";
import { createEmptyState, record, replay, serializeRecipe, parseRecipe } from "./history.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const projected: Projected = { x: 1, y: 0, z: 0, nx: 1, ny: 0, nz: 0 };

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function flower(preset: FlowerMotifPresetId, seed = 7): Patch {
  const params = { ...DEFAULT_SKIN_PARAMS, patchShape: "flower" as const, flowerMotifPreset: preset };
  return {
    id: 1,
    shape: "flower",
    points: generateShapePoints("flower", host, 0, projected, 0.38, params, rng(seed), 1, []),
  };
}

const six = flower("six-core");
assert.ok(six.points.length > 7, "motif includes petals/core plus connecting neck samples");
assert.ok(six.points.every((point) => point.r > 0), "all realized motif spheres have positive radii");
assert.ok(six.points.every((point) => point.role === "motif"), "realized flower components are distinguished from later bridges");
assert.ok(
  six.points.every((point) => Math.hypot(point.x - projected.x, point.y, point.z) + point.r <= 0.380001),
  "the complete motif remains inside the clearance-bounded anchor envelope",
);

function customFlower(
  overrides: Partial<typeof DEFAULT_SKIN_PARAMS>,
  seed = 23,
): Patch {
  const params = {
    ...DEFAULT_SKIN_PARAMS,
    patchShape: "flower" as const,
    flowerMotifPreset: "custom" as const,
    ...overrides,
  };
  return {
    id: 2,
    shape: "flower",
    points: generateShapePoints("flower", host, 0, projected, 0.38, params, rng(seed), 2, []),
  };
}

const customThreeCoreless = customFlower({ flowerPetalCount: 3, flowerShowCore: false });
const customTwelveCore = customFlower({ flowerPetalCount: 12, flowerShowCore: true });
assert.notEqual(
  customThreeCoreless.points.length,
  customTwelveCore.points.length,
  "custom petal count changes realized motif geometry",
);
assert.ok(
  customFlower({ flowerPetalCount: 6, flowerShowCore: true }).points.length
    > customFlower({ flowerPetalCount: 6, flowerShowCore: false }).points.length,
  "custom core toggle adds the core and its neck geometry",
);
assert.notDeepEqual(
  customFlower({ flowerCupping: -0.18 }).points,
  customFlower({ flowerCupping: 0.5 }).points,
  "advanced flower controls change realized component positions",
);

const projections: Projected[] = [
  { x: 1, y: 0, z: 0, nx: 1, ny: 0, nz: 0 },
  { x: 0, y: 1, z: 0, nx: 0, ny: 1, nz: 0 },
  { x: -1, y: 0, z: 0, nx: -1, ny: 0, nz: 0 },
  { x: 0, y: -1, z: 0, nx: 0, ny: -1, nz: 0 },
];
const directSource = projections.map((surface, index): Patch => ({
  id: index + 10,
  shape: "flower",
  points: generateShapePoints(
    "flower",
    host,
    0,
    surface,
    0.26,
    { ...DEFAULT_SKIN_PARAMS, patchShape: "flower", flowerMotifPreset: "six-core" },
    rng(100 + index),
    index + 10,
    [],
  ),
}));
const directSourceSnapshot = structuredClone(directSource);
const connected = connectFlowerPatchesDirectly(host, 0, directSource);
assert.equal(connected.connectionCount, directSource.length - 1, "a minimal N-1 connection network joins N flowers");
assert.ok(connected.bridgePointCount > 0, "direct connection realizes visible bridge spheres");
assert.deepEqual(directSource, directSourceSnapshot, "direct connection never mutates its input patches");
assert.deepEqual(
  connectFlowerPatchesDirectly(host, 0, connected.patches),
  connected,
  "rebuilding strips old bridges first and is deterministic/idempotent",
);
assert.equal(estimatePatchComponents(connected.patches, 0.05), 1, "the authored flower network reads as one connected patch component");

const fused = fuseFlowerPatchesByExpansion(directSource);
assert.deepEqual(directSource, directSourceSnapshot, "surface fusion never mutates its source flowers");
assert.equal(fused.flowerCount, directSource.length, "surface fusion keeps every flower and adds no connector object");
assert.ok(fused.fusionRadius > 0, "surface fusion derives one common positive expansion");
assert.ok(fused.patches.every((patch) => patch.points.every((point) =>
  point.role !== "bridge" && point.r >= (point.baseR ?? point.r))), "fused flowers contain no branch points");
assert.equal(estimatePatchComponents(fused.patches, 0.05), 1, "expanded flower surfaces form one connected group");
const unexpanded = fuseFlowerPatchesByExpansion(directSource, 0);
assert.equal(unexpanded.fusionRadius, 0, "expansion 0 keeps the original flower radii");
assert.ok(unexpanded.patches.every((patch) => patch.points.every((point) =>
  point.r === (point.baseR ?? point.r))), "expansion 0 does not swell any motif component");
const doubleExpanded = fuseFlowerPatchesByExpansion(directSource, 2);
assert.ok(
  Math.abs(doubleExpanded.fusionRadius - fused.fusionRadius * 2) < 1e-9,
  "expansion 2 realizes exactly twice the common expansion without compounding",
);
assert.deepEqual(
  fuseFlowerPatchesByExpansion(doubleExpanded.patches, 1),
  fused,
  "changing expansion reuses the stored base expansion instead of compounding realized radii",
);

const packedDirect = packPatchesGreedy(host, 0, directSource, {
  ...DEFAULT_SKIN_PARAMS,
  patchShape: "flower",
  flowerConnectionMode: "direct",
  attempts: 0,
});
assert.equal(packedDirect.flowerConnections, directSource.length - 1, "Pack reports the realized direct connections");
assert.equal(packedDirect.flowerBridgePoints, connected.bridgePointCount, "Pack reports the realized bridge-point count");
const packedSeparate = packPatchesGreedy(host, 0, connected.patches, {
  ...DEFAULT_SKIN_PARAMS,
  patchShape: "flower",
  flowerConnectionMode: "separate",
  attempts: 0,
});
assert.ok(
  packedSeparate.patches.every((patch) => patch.points.every((point) => point.role !== "bridge")),
  "separate mode removes a prior direct network on the next Pack pass",
);
const packedFused = packPatchesGreedy(host, 0, directSource, {
  ...DEFAULT_SKIN_PARAMS,
  patchShape: "flower",
  flowerConnectionMode: "fused",
  attempts: 0,
});
assert.equal(packedFused.flowerFusedPatches, directSource.length, "Pack reports all flowers participating in surface fusion");
assert.equal(estimatePatchComponents(packedFused.patches, 0.05), 1, "Pack's fused result is one flower group without branches");

const editHistory = [] as ReturnType<typeof parseRecipe>;
const editState = createEmptyState();
record(editHistory, editState, "setSkinParam", { key: "flowerConnectionMode", value: "fused" });
record(editHistory, editState, "packPatches", { patches: fused.patches });
record(editHistory, editState, "removePatch", { id: directSource[0].id });
const fusedAfterRemoval = fuseFlowerPatchesByExpansion(editState.patches);
record(editHistory, editState, "packPatches", { patches: fusedAfterRemoval.patches });
assert.equal(estimatePatchComponents(editState.patches, 0.05), 1, "removing a flower and re-fusing keeps the remaining shell connected");
const replacement = structuredClone(directSource[0]);
replacement.id = 99;
record(editHistory, editState, "addPatch", { patch: replacement });
const fusedAfterAddition = fuseFlowerPatchesByExpansion(editState.patches);
record(editHistory, editState, "packPatches", { patches: fusedAfterAddition.patches });
assert.ok(editState.patches.find((patch) => patch.id === 99)?.points.every((point) =>
  point.r > (point.baseR ?? point.r)), "a manually added flower receives the recomputed common fusion radius");
assert.ok(editState.patches.every((patch) => patch.points.every((point) => point.role !== "bridge")), "fused edits never reintroduce branch points");
assert.deepEqual(
  replay(parseRecipe(serializeRecipe(editHistory))).patches,
  editState.patches,
  "edited fused geometry replays exactly without recomputing fusion",
);
assert.ok(
  Math.abs(Math.min(...six.points.map((point) => point.x - point.r)) - projected.x) < 1e-6,
  "the motif's lowest surface is tangent to the host plane",
);
assert.deepEqual(flower("six-core", 19), flower("six-core", 19), "same preset and RNG reproduce identical points");

const counts = (["four-core", "six-core", "ten-ring", "twelve-core"] as const)
  .map((preset) => flower(preset).points.length);
assert.equal(new Set(counts).size, 4, "the four PACK-SPIKE presets realize distinct component counts");

const outer = six.points.reduce((best, point) => point.x > best.x ? point : best, six.points[0]);
assert.ok(shellSdf(host, 0, 0.12, outer.x, outer.y, outer.z) > 0, "a raised flower sample sits outside the thin host shell");
assert.ok(
  compositeSdf("plate", host, 0, 0.12, [six], 0.03, outer.x, outer.y, outer.z, 0) < 0,
  "plate mode keeps flower motifs as raised/raw geometry instead of clipping them flat",
);

const history = [] as ReturnType<typeof parseRecipe>;
const state = createEmptyState();
record(history, state, "setSkinParam", { key: "patchShape", value: "flower" });
record(history, state, "setSkinParam", { key: "flowerMotifPreset", value: "ten-ring" });
record(history, state, "setSkinParam", { key: "flowerPetalCount", value: 9 });
record(history, state, "setSkinParam", { key: "flowerShowCore", value: false });
record(history, state, "setSkinParam", { key: "flowerExpansion", value: 1.35 });
record(history, state, "setSkinParam", { key: "flowerConnectionMode", value: "direct" });
record(history, state, "packPatches", { patches: connected.patches });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.patchShape, "flower");
assert.equal(restored.skinParams.flowerMotifPreset, "ten-ring");
assert.equal(restored.skinParams.flowerPetalCount, 9);
assert.equal(restored.skinParams.flowerShowCore, false);
assert.equal(restored.skinParams.flowerExpansion, 1.35);
assert.equal(restored.skinParams.flowerConnectionMode, "direct");
assert.deepEqual(restored.patches, state.patches, "history stores realized motif geometry without rerunning generation");

const legacy = replay(parseRecipe(JSON.stringify({
  formatVersion: 1,
  studyId: "skin",
  exportedAt: "2026-08-10T00:00:00.000Z",
  entries: [],
})));
assert.equal(legacy.skinParams.flowerConnectionMode, "separate", "old recipes default to the pre-direct separate behavior");

const hostChangeHistory = [] as ReturnType<typeof parseRecipe>;
const hostChangeState = createEmptyState();
record(hostChangeHistory, hostChangeState, "confirmNPartition", {
  selection: { groups: [[1], [2]], seedIds: [1, 2], adjacencyThreshold: 0.01, confirmedAt: "test" },
});
record(hostChangeHistory, hostChangeState, "growHost", { params: { ...hostChangeState.hostParams } });
assert.equal(hostChangeState.nPartition, null, "regrowing the host invalidates a confirmed N selection");
record(hostChangeHistory, hostChangeState, "confirmNPartition", {
  selection: { groups: [[1], [2]], seedIds: [1, 2], adjacencyThreshold: 0.01, confirmedAt: "test-2" },
});
record(hostChangeHistory, hostChangeState, "setHostParam", { key: "k", value: 0.4 });
assert.equal(hostChangeState.nPartition, null, "changing the live host field invalidates a confirmed N selection");

console.log("Surface motif integration tests: 45 passed");

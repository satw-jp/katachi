import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import { DEFAULT_SKIN_PARAMS, resetPatchIdCounter } from "./field.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { fillLargestSurfaceGaps } from "./laceFill.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const params = {
  ...DEFAULT_SKIN_PARAMS,
  patchShape: "coin" as const,
  attempts: 240,
  minR: 0.14,
  maxR: 0.34,
  lacePasses: 3,
  laceMinScale: 0.45,
  laceGap: 0.03,
};

resetPatchIdCounter(1);
const first = fillLargestSurfaceGaps(host, 0, [], params);
assert.ok(first.laceAdded > 8, "largest-gap passes add a useful field of motifs");
assert.equal(first.patches.length, first.laceAdded, "empty input reports every realized lace motif as newly added");
assert.equal(first.lacePasses, 3, "result records the requested number of size bands");
assert.ok(
  first.laceSmallestRadius !== null && first.laceLargestRadius !== null
    && first.laceSmallestRadius < first.laceLargestRadius,
  "adaptive clearance produces mixed motif sizes rather than one uniform band",
);
assert.ok(first.patches.every((patch) => patch.surfaceCellKind === "lace"), "every added patch carries lace provenance");

resetPatchIdCounter(1);
const repeated = fillLargestSurfaceGaps(host, 0, [], params);
assert.deepEqual(repeated.patches, first.patches, "same host, seed, and lace controls reproduce the same realized placement");

const flowerParams = {
  ...params,
  patchShape: "flower" as const,
  lacePasses: 1,
  flowerCupping: 0.85,
  flowerCoreLift: 0.24,
};
resetPatchIdCounter(1);
const surfaceFlowers = fillLargestSurfaceGaps(host, 0, [], {
  ...flowerParams,
  laceMotifPlacement: "surface",
});
resetPatchIdCounter(1);
const centeredFlowers = fillLargestSurfaceGaps(host, 0, [], {
  ...flowerParams,
  laceMotifPlacement: "center",
});
assert.equal(centeredFlowers.laceMotifPlacement, "center", "result records the gap-fill-only placement choice");
assert.equal(
  centeredFlowers.patches[0]?.points.length,
  surfaceFlowers.patches[0]?.points.length,
  "changing later-stage placement keeps the authored flower structure",
);
const meanRadius = (points: Array<{ x: number; y: number; z: number }>) =>
  points.reduce((sum, point) => sum + Math.hypot(point.x, point.y, point.z), 0) / Math.max(1, points.length);
assert.ok(
  meanRadius(centeredFlowers.patches[0].points) < meanRadius(surfaceFlowers.patches[0].points) - 1e-4,
  "center placement moves a cupped gap-fill flower inward without changing the primary placement setting",
);

resetPatchIdCounter(1);
const ring = fillLargestSurfaceGaps(host, 0, [], {
  ...params,
  patchShape: "flatRing",
  lacePasses: 1,
  attempts: 240,
});
assert.ok(ring.laceAdded > 0 && ring.patches.every((patch) => patch.shape === "flatRing"), "the same post-process accepts non-flower motifs");

const state = createEmptyState();
const history: Parameters<typeof record>[0] = [];
record(history, state, "setSkinParam", { key: "lacePasses", value: params.lacePasses });
record(history, state, "setSkinParam", { key: "laceMinScale", value: params.laceMinScale });
record(history, state, "setSkinParam", { key: "laceGap", value: params.laceGap });
record(history, state, "setSkinParam", { key: "laceMotifPlacement", value: "center" });
record(history, state, "packPatches", { patches: first.patches });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.lacePasses, params.lacePasses, "recipe preserves lace size-band count");
assert.equal(restored.skinParams.laceMinScale, params.laceMinScale, "recipe preserves final size ratio");
assert.equal(restored.skinParams.laceGap, params.laceGap, "recipe preserves intended lace clearance");
assert.equal(restored.skinParams.laceMotifPlacement, "center", "recipe preserves the later-stage placement independently");
assert.equal(createEmptyState().skinParams.laceMotifPlacement, "surface", "legacy recipes default later-stage placement to the historical surface behavior");
assert.deepEqual(
  JSON.parse(JSON.stringify(restored.patches)),
  JSON.parse(JSON.stringify(first.patches)),
  "recipe replays realized positions without repeating the gap search",
);

console.log("lace-fill tests passed (16 assertions)");

import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import { buildPatchAdjacency, DEFAULT_SKIN_PARAMS } from "./field.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { __goldbergTest, packPatchesOnGoldberg } from "./goldbergFlow.ts";
import { proposeNGroups, validateNGroups } from "./nPartition.ts";

function valences(directionCount: number, edges: Array<[number, number]>): number[] {
  const result = Array.from({ length: directionCount }, () => 0);
  for (const [a, b] of edges) { result[a]++; result[b]++; }
  return result;
}

for (const [frequency, sites, edges] of [[1, 12, 30], [2, 42, 120], [3, 92, 270]] as const) {
  const topology = __goldbergTest.buildGoldbergDirections(frequency);
  assert.equal(topology.directions.length, sites, `frequency ${frequency}: site count follows 10*f^2+2`);
  assert.equal(topology.edges.length, edges, `frequency ${frequency}: triangulated sphere has 30*f^2 edges`);
  const siteValences = valences(topology.directions.length, topology.edges);
  assert.equal(siteValences.filter((value) => value === 5).length, 12,
    `frequency ${frequency}: exactly twelve Euler-required pentavalent sites remain`);
  assert.equal(siteValences.filter((value) => value === 6).length, sites - 12,
    `frequency ${frequency}: every remaining site is hexavalent`);
}

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const params = {
  ...DEFAULT_SKIN_PARAMS,
  surfaceGenerationMode: "goldberg" as const,
  goldbergFrequency: 2,
  patchShape: "flatRing" as const,
  quadConnectionMode: "local" as const,
};
const packed = packPatchesOnGoldberg(host, 0, params);
assert.equal(packed.goldbergSiteCount, 42, "frequency two realizes all 42 Goldberg sites");
assert.equal(packed.goldbergPentagonCount, 12, "realized Goldberg result reports twelve pentagonal fittings");
assert.equal(packed.goldbergHexagonCount, 30, "realized Goldberg result reports thirty hexagonal sites");
assert.equal(packed.goldbergIrregularCount, 0, "realized topology hides no other site valence");
assert.equal(packed.goldbergProjectionFailures, 0, "all Goldberg sites project to a spherical host");
assert.equal(packed.quadConnectionOpenEdges, 0, "surface lugs close every realized Goldberg graph edge");
assert.ok(packed.patches.every((patch) => patch.surfaceCellKind === "goldberg"),
  "every patch records Goldberg provenance");
assert.deepEqual(packPatchesOnGoldberg(host, 0, params), packed, "Goldberg authoring is deterministic");
const threeGroups = proposeNGroups(packed.patches, buildPatchAdjacency(packed.patches, 0.05), 3);
assert.equal(threeGroups.groups.length, 3, "Goldberg patches enter the common N-partition proposal path");
validateNGroups(packed.patches, threeGroups.groups);
assert.equal(new Set(threeGroups.groups.flat()).size, packed.patches.length,
  "Goldberg N groups own every realized patch exactly once");

const separate = packPatchesOnGoldberg(host, 0, { ...params, quadConnectionMode: "separate" });
for (let patchIndex = 0; patchIndex < separate.patches.length; patchIndex++) {
  const connectedMotif = packed.patches[patchIndex].points.filter((point) => point.role !== "surfaceConnector");
  assert.deepEqual(connectedMotif, separate.patches[patchIndex].points,
    "Goldberg connection preserves every authored ring point and radius");
}

const history = [] as ReturnType<typeof parseRecipe>;
const state = createEmptyState();
record(history, state, "setSkinParam", { key: "surfaceGenerationMode", value: "goldberg" });
record(history, state, "setSkinParam", { key: "goldbergFrequency", value: 5 });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.surfaceGenerationMode, "goldberg", "recipe preserves Goldberg mode");
assert.equal(restored.skinParams.goldbergFrequency, 5, "recipe preserves Goldberg frequency");

console.log("GOLDBERG-FLOW tests: 26 passed");

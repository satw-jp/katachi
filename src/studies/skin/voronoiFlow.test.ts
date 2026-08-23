import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import { DEFAULT_SKIN_PARAMS } from "./field.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { packPatchesOnVoronoi } from "./voronoiFlow.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const params = {
  ...DEFAULT_SKIN_PARAMS,
  surfaceGenerationMode: "voronoi" as const,
  voronoiSeedCount: 48,
  voronoiRelaxationSteps: 2,
  patchShape: "flatRing" as const,
  quadConnectionMode: "local" as const,
};

const packed = packPatchesOnVoronoi(host, 0, params);
assert.equal(packed.voronoiSeedCount, 48, "one motif is realized for every projected Voronoi seed");
assert.equal(packed.voronoiProjectionFailures, 0, "all spherical seeds project to a spherical host");
assert.equal(packed.voronoiRelaxationSteps, 2, "the result reports the requested relaxation count");
assert.ok(packed.voronoiNeighbourEdges >= 48 * 2, "the six-neighbour graph covers the seed set");
assert.equal(packed.quadConnectionOpenEdges, 0, "local connection closes every graph edge in the realized field");
assert.ok(packed.quadConnectionAdjustedPoints > 0, "local connection adds explicit points only beside graph gaps");
assert.ok(packed.patches.some((patch) => patch.points.some((point) => point.role === "surfaceConnector")),
  "connected Voronoi motifs carry explicit surface-connector provenance");
assert.ok(packed.patches.every((patch) =>
  patch.surfaceCellKind === "voronoi" && patch.surfaceCellId !== undefined && patch.points.length > 0),
"every realized motif records its Voronoi seed provenance");
assert.deepEqual(packPatchesOnVoronoi(host, 0, params), packed, "same host and seed reproduce the exact Voronoi prototype");

const separate = packPatchesOnVoronoi(host, 0, { ...params, quadConnectionMode: "separate" });
assert.equal(separate.quadConnectionAdjustedPoints, 0, "separate mode preserves every authored motif radius");
assert.ok(separate.patches.every((patch) => patch.points.every((point) => (point.meshJoinR ?? 0) === 0)),
  "separate mode does not add mesh-only joins");
for (let patchIndex = 0; patchIndex < separate.patches.length; patchIndex++) {
  const connectedMotif = packed.patches[patchIndex].points.filter((point) => point.role !== "surfaceConnector");
  assert.deepEqual(connectedMotif, separate.patches[patchIndex].points,
    "Voronoi connection preserves every authored flat-ring point and radius");
}

const history = [] as ReturnType<typeof parseRecipe>;
const state = createEmptyState();
record(history, state, "setSkinParam", { key: "surfaceGenerationMode", value: "voronoi" });
record(history, state, "setSkinParam", { key: "voronoiSeedCount", value: 84 });
record(history, state, "setSkinParam", { key: "voronoiRelaxationSteps", value: 4 });
record(history, state, "packPatches", { patches: packed.patches });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.surfaceGenerationMode, "voronoi", "recipe preserves the Voronoi generation mode");
assert.equal(restored.skinParams.voronoiSeedCount, 84, "recipe preserves the Voronoi seed count");
assert.equal(restored.skinParams.voronoiRelaxationSteps, 4, "recipe preserves the relaxation count");
assert.deepEqual(
  JSON.parse(JSON.stringify(restored.patches)),
  JSON.parse(JSON.stringify(packed.patches)),
  "recipe preserves realized Voronoi provenance and geometry",
);

console.log("VORONOI-FLOW tests: 14 passed");

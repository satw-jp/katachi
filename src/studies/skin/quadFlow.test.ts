import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import { fieldSdf } from "../cloud-sculpt/field.ts";
import { DEFAULT_SKIN_PARAMS, resetPatchIdCounter } from "./field.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import { buildQuadFlowGrid, packPatchesOnQuadFlow, patchSurfaceClearance } from "./quadFlow.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const grid = buildQuadFlowGrid(host, 0, 4);

assert.equal(grid.cells.length, 96, "six cube faces times 4x4 yields 96 all-quad cells");
assert.equal(grid.vertices.length, 98, "closed 4x4 cube-sphere topology shares edge and corner vertices");
assert.equal(grid.projectionFailures, 0, "analytic sphere projects every cube-sphere direction");
assert.ok(grid.cells.every((cell) => new Set(cell.vertexIds).size === 4), "every emitted cell has four distinct corners");

const valence = new Uint16Array(grid.vertices.length);
for (const cell of grid.cells) for (const vertexId of cell.vertexIds) valence[vertexId]++;
assert.equal([...valence].filter((count) => count === 3).length, 8, "the eight Euler-required cube corners are valence three");
assert.equal([...valence].filter((count) => count === 4).length, 90, "every other grid vertex has regular valence four");
assert.equal(grid.extraordinaryVertexCount, 8, "grid reports rather than hides extraordinary vertices");
assert.equal(grid.specialCellCount, 24, "cells touching the eight extraordinary corners are marked as future fittings");

const edgeUse = new Map<string, number>();
for (const cell of grid.cells) for (let edge = 0; edge < 4; edge++) {
  const a = cell.vertexIds[edge];
  const b = cell.vertexIds[(edge + 1) % 4];
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
}
assert.ok([...edgeUse.values()].every((count) => count === 2), "every quad edge is shared by exactly two cells");
assert.ok(
  grid.vertices.every((vertex) => Math.abs(fieldSdf(host, 0, vertex.x, vertex.y, vertex.z)) < 0.003),
  "every quad vertex lies on the source surface within the projection tolerance",
);
assert.deepEqual(buildQuadFlowGrid(host, 0, 4), grid, "same host and divisions reproduce the exact same quad grid");

resetPatchIdCounter(1);
const packed = packPatchesOnQuadFlow(host, 0, {
  ...DEFAULT_SKIN_PARAMS,
  surfaceGenerationMode: "quadFlow",
  quadDivisions: 4,
  patchShape: "flower",
  flowerConnectionMode: "separate",
  quadConnectionMode: "separate",
});
assert.equal(packed.patches.length, grid.cells.length, "one realized flower is authored for every quad, including fitting placeholders");
assert.equal(packed.placed, grid.cells.length, "quad result reports its cell-derived placement count");
assert.ok(packed.patches.every((patch) => patch.shape === "flower" && patch.points.length > 0), "every quad receives a non-empty selected motif");
const footprintRatios = grid.cells.map((cell, index) => {
  const corners = cell.vertexIds.map((vertexId) => grid.vertices[vertexId]);
  const center = corners.reduce((sum, corner) => ({
    x: sum.x + corner.x * 0.25,
    y: sum.y + corner.y * 0.25,
    z: sum.z + corner.z * 0.25,
  }), { x: 0, y: 0, z: 0 });
  const minimumEdge = Math.min(
    Math.hypot(corners[0].x - corners[1].x, corners[0].y - corners[1].y, corners[0].z - corners[1].z),
    Math.hypot(corners[1].x - corners[2].x, corners[1].y - corners[2].y, corners[1].z - corners[2].z),
    Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y, corners[2].z - corners[3].z),
    Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y, corners[3].z - corners[0].z),
  );
  const footprintRadius = Math.max(...packed.patches[index].points.map((point) => Math.hypot(
    point.x - center.x,
    point.y - center.y,
    point.z - center.z,
  ) + point.r));
  return footprintRadius / minimumEdge;
});
assert.ok(Math.min(...footprintRatios) > 0.48, "every flower footprint reaches approximately from cell centre to its quad boundary");

resetPatchIdCounter(1);
const fused = packPatchesOnQuadFlow(host, 0, {
  ...DEFAULT_SKIN_PARAMS,
  surfaceGenerationMode: "quadFlow",
  quadDivisions: 4,
  patchShape: "flower",
  flowerConnectionMode: "fused",
  flowerExpansion: 1,
});
const ownerByEdge = new Map<string, number>();
const neighbourPairs: Array<readonly [number, number]> = [];
for (const cell of grid.cells) for (let edge = 0; edge < 4; edge++) {
  const a = cell.vertexIds[edge];
  const b = cell.vertexIds[(edge + 1) % 4];
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  const owner = ownerByEdge.get(key);
  if (owner === undefined) ownerByEdge.set(key, cell.id);
  else neighbourPairs.push([owner, cell.id]);
}
assert.equal(neighbourPairs.length, 192, "closed 96-quad grid exposes all 192 shared-edge neighbour relationships");
assert.ok(fused.flowerFusionRadius > 0, "quad neighbour fusion derives a positive common expansion");
assert.equal(fused.flowerFusionLocalized, true, "quad fusion reports that it repairs local edge components rather than swelling every sphere");
assert.equal(fused.flowerFusionEdgeCount, 192, "local fusion reports every shared edge it inspected");
assert.equal(fused.flowerFusionOpenEdges, 0, "local fusion leaves no shared edge disconnected");
assert.ok(
  fused.flowerFusionAdjustedPoints > 0
    && fused.flowerFusionAdjustedPoints < fused.patches.reduce((sum, patch) => sum + patch.points.length, 0),
  "only the spheres beside gaps are enlarged; most motif spheres retain their authored radius",
);
assert.ok(
  Math.max(...neighbourPairs.map(([a, b]) => patchSurfaceClearance(fused.patches[a], fused.patches[b]))) < -1e-4,
  "expansion 1 overlaps every pair of motifs sharing a quad edge, not only a minimum spanning tree",
);

resetPatchIdCounter(1);
const restrainedTenPetal = packPatchesOnQuadFlow(host, 0, {
  ...DEFAULT_SKIN_PARAMS,
  surfaceGenerationMode: "quadFlow",
  quadDivisions: 4,
  patchShape: "flower",
  flowerMotifPreset: "ten-ring",
  flowerPetalCount: 10,
  flowerShowCore: false,
  flowerConnectionMode: "fused",
  flowerExpansion: 0.25,
});
assert.equal(
  restrainedTenPetal.flowerFusionOpenEdges,
  0,
  "the shared recipe's restrained 10-petal expansion still closes gaps locally instead of requiring global swelling",
);

resetPatchIdCounter(1);
const packedAgain = packPatchesOnQuadFlow(host, 0, {
  ...DEFAULT_SKIN_PARAMS,
  surfaceGenerationMode: "quadFlow",
  quadDivisions: 4,
  patchShape: "flower",
  flowerConnectionMode: "separate",
  quadConnectionMode: "separate",
});
assert.deepEqual(packedAgain, packed, "quad motif authoring is deterministic and history can store its realized result");
const packedWithoutExternalReset = packPatchesOnQuadFlow(host, 0, {
  ...DEFAULT_SKIN_PARAMS,
  surfaceGenerationMode: "quadFlow",
  quadDivisions: 4,
  patchShape: "flower",
  quadConnectionMode: "separate",
});
assert.deepEqual(
  packedWithoutExternalReset,
  packed,
  "repacking identical QUAD settings is deterministic without an external patch-ID reset",
);

const variedGrid = buildQuadFlowGrid(host, 0, 4, "varied", 0.4, "varied-grid-test");
assert.equal(variedGrid.cells.length, 96, "varied cells preserve the complete 6*n*n all-quad surface");
assert.equal(variedGrid.vertices.length, 98, "varied cells still share closed cube-sphere boundary vertices");
const variedEdgeUse = new Map<string, number>();
const variedEdgeLengths: number[] = [];
for (const cell of variedGrid.cells) for (let edge = 0; edge < 4; edge++) {
  const a = cell.vertexIds[edge];
  const b = cell.vertexIds[(edge + 1) % 4];
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  if (!variedEdgeUse.has(key)) {
    const va = variedGrid.vertices[a];
    const vb = variedGrid.vertices[b];
    variedEdgeLengths.push(Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z));
  }
  variedEdgeUse.set(key, (variedEdgeUse.get(key) ?? 0) + 1);
}
assert.ok([...variedEdgeUse.values()].every((count) => count === 2), "varied quad boundaries have no cracks or unpaired edges");
assert.ok(
  Math.max(...variedEdgeLengths) / Math.min(...variedEdgeLengths) > 1.1,
  "varied mode produces measurably different cell edge lengths",
);
assert.deepEqual(
  buildQuadFlowGrid(host, 0, 4, "varied", 0.4, "varied-grid-test"),
  variedGrid,
  "varied quad layout is deterministic for one seed",
);

const curvedHost: Ball[] = [
  { id: 1, x: -0.28, y: 0, z: 0, r: 0.86 },
  { id: 2, x: 0.62, y: 0.08, z: 0, r: 0.58 },
];
const regularCurvedGrid = buildQuadFlowGrid(curvedHost, 0.18, 4, "regular", 0, "field-grid-test", 0);
const fieldGrid = buildQuadFlowGrid(curvedHost, 0.18, 4, "field", 0, "field-grid-test", 0.75);
assert.equal(fieldGrid.cells.length, regularCurvedGrid.cells.length, "curvature redistribution preserves the closed all-quad cell count");
assert.equal(fieldGrid.vertices.length, regularCurvedGrid.vertices.length, "curvature redistribution preserves shared topology vertices");
assert.equal(fieldGrid.curvatureRedistributionPasses, 2, "field mode reports its two surface redistribution passes");
assert.ok(fieldGrid.curvatureMaximum > fieldGrid.curvatureMinimum, "a lumpy host exposes a non-zero curvature-proxy range");
assert.ok(fieldGrid.vertices.some((vertex, index) =>
  Math.hypot(vertex.x - regularCurvedGrid.vertices[index].x, vertex.y - regularCurvedGrid.vertices[index].y,
    vertex.z - regularCurvedGrid.vertices[index].z) > 1e-5),
"curvature attraction measurably redistributes vertices on a lumpy host");
assert.deepEqual(
  buildQuadFlowGrid(curvedHost, 0.18, 4, "field", 0, "field-grid-test", 0.75),
  fieldGrid,
  "curvature-density quad redistribution is deterministic",
);

for (const shape of ["coin", "flatRing", "ring3d", "flower"] as const) {
  resetPatchIdCounter(1);
  const separateShape = packPatchesOnQuadFlow(host, 0, {
    ...DEFAULT_SKIN_PARAMS,
    surfaceGenerationMode: "quadFlow",
    quadDivisions: 4,
    patchShape: shape,
    quadConnectionMode: "separate",
  });
  resetPatchIdCounter(1);
  const connectedShape = packPatchesOnQuadFlow(host, 0, {
    ...DEFAULT_SKIN_PARAMS,
    surfaceGenerationMode: "quadFlow",
    quadDivisions: 4,
    patchShape: shape,
    quadConnectionMode: "local",
    quadConnectionDepth: 0.25,
  });
  assert.equal(connectedShape.quadConnectionShape, shape, `${shape}: result names the connected shape`);
  assert.equal(connectedShape.quadConnectionEdgeCount, 192, `${shape}: every shared edge is inspected`);
  assert.equal(connectedShape.quadConnectionOpenEdges, 0, `${shape}: every shared edge reaches contact`);
  assert.ok(connectedShape.quadConnectionAdjustedPoints > 0, `${shape}: surface connector points are added beside gaps`);
  assert.ok(
    connectedShape.patches.some((patch) => patch.points.some((point) =>
      point.role === "surfaceConnector")),
    `${shape}: local connection is explicit connector provenance rather than motif swelling`,
  );
  assert.ok(
    connectedShape.quadConnectionAdjustedPoints
      < connectedShape.patches.reduce((sum, patch) => sum + patch.points.length, 0),
    `${shape}: connection remains local rather than enlarging every sphere`,
  );
  for (let patchIndex = 0; patchIndex < connectedShape.patches.length; patchIndex++) {
    for (let pointIndex = 0; pointIndex < separateShape.patches[patchIndex].points.length; pointIndex++) {
      assert.ok(
        Math.abs(
          connectedShape.patches[patchIndex].points[pointIndex].r
            - separateShape.patches[patchIndex].points[pointIndex].r,
        ) < 1e-9,
        `${shape}: local connection preserves every authored motif radius`,
      );
    }
  }
}

const legacyConnected = [{
  id: 1,
  shape: "coin" as const,
  quadCellId: 0,
  points: [{ x: 0, y: 0, z: 0, r: 0.12, baseR: 0.1, fusionR: 0.02, fusionBaseR: 0.02 }],
}];
const repairedLegacy = reinforceQuadConnectionsForMesh(legacyConnected, DEFAULT_SKIN_PARAMS.quadMeshJoinWidth);
assert.equal(repairedLegacy.reinforcedPointCount, 1, "old QUAD recipes receive a non-destructive mesh-only connection repair");
assert.equal(repairedLegacy.patches[0].points[0].r, 0.24, "legacy repair adds the requested mesh width to the realized old radius");
assert.equal(legacyConnected[0].points[0].r, 0.12, "legacy repair never mutates the stored input recipe point");

const history = [] as ReturnType<typeof parseRecipe>;
const state = createEmptyState();
record(history, state, "setSkinParam", { key: "surfaceGenerationMode", value: "quadFlow" });
record(history, state, "setSkinParam", { key: "quadDivisions", value: 7 });
record(history, state, "setSkinParam", { key: "quadTilingMode", value: "varied" });
record(history, state, "setSkinParam", { key: "quadSizeVariation", value: 0.37 });
record(history, state, "setSkinParam", { key: "quadCurvatureAttraction", value: 0.72 });
record(history, state, "setSkinParam", { key: "quadConnectionMode", value: "separate" });
record(history, state, "setSkinParam", { key: "quadConnectionDepth", value: 0.6 });
record(history, state, "setSkinParam", { key: "quadMeshJoinWidth", value: 0.18 });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.surfaceGenerationMode, "quadFlow", "recipe preserves the additive quad generation mode");
assert.equal(restored.skinParams.quadDivisions, 7, "recipe preserves quad density");
assert.equal(restored.skinParams.quadTilingMode, "varied", "recipe preserves varied quad cells");
assert.equal(restored.skinParams.quadSizeVariation, 0.37, "recipe preserves cell-size variation");
assert.equal(restored.skinParams.quadCurvatureAttraction, 0.72, "recipe preserves curvature attraction");
assert.equal(restored.skinParams.quadConnectionMode, "separate", "recipe preserves shared-edge connection mode");
assert.equal(restored.skinParams.quadConnectionDepth, 0.6, "recipe preserves connection overlap depth");
assert.equal(restored.skinParams.quadMeshJoinWidth, 0.18, "recipe preserves the mesh-only join width");
assert.equal(createEmptyState().skinParams.surfaceGenerationMode, "randomPack", "old recipes keep the v0.19 random PACK default");

console.log("QUAD-FLOW tests: 74 passed");

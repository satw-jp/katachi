import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import { fieldSdf } from "../cloud-sculpt/field.ts";
import { buildSkinMesh } from "./meshExport.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import {
  buildVoronoiInternalStructure,
  generateInteriorPointCloud,
  internalGraphToPatchPoints,
} from "./voronoi.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 2 }];
const density = 26;
const radius = 0.055;

const regular = generateInteriorPointCloud(host, 0, density, 0, "internal-test", radius);
const regularAgain = generateInteriorPointCloud(host, 0, density, 0, "internal-test", radius);
assert.deepEqual(regularAgain, regular, "same host, seed and parameters reproduce the point cloud");
assert.equal(regular.length, density, "Density requests the interior site count when the host has room");
assert.ok(
  regular.every((point) => fieldSdf(host, 0, point.x, point.y, point.z) <= -radius),
  "every site preserves at least one structure radius inside the host",
);

const randomised = generateInteriorPointCloud(host, 0, density, 0.85, "internal-test", radius);
assert.notDeepEqual(randomised, regular, "Randomness changes site placement");
assert.deepEqual(
  generateInteriorPointCloud(host, 0, density, 0.85, "internal-test", radius),
  randomised,
  "randomised placement remains seed-reproducible",
);

const graph = buildVoronoiInternalStructure(host, 0, density, radius, 0.85, "internal-test");
assert.ok(graph.nodes.length > 0, "3D Delaunay dual produces bounded Voronoi vertices");
assert.ok(graph.edges.length > 0, "3D Delaunay dual produces Voronoi edges");
assert.deepEqual(
  buildVoronoiInternalStructure(host, 0, density, radius, 0.85, "internal-test"),
  graph,
  "Voronoi graph generation is exactly reproducible",
);
assert.ok(
  graph.nodes.every((node) => fieldSdf(host, 0, node.position.x, node.position.y, node.position.z) <= -radius + 1e-6),
  "clipped Voronoi nodes keep the full edge radius inside the host field",
);
assert.ok(
  graph.edges.every((edge) =>
    edge.start >= 0 && edge.start < graph.nodes.length
    && edge.end >= 0 && edge.end < graph.nodes.length
    && edge.start !== edge.end
    && edge.radius === radius),
  "every edge references two valid nodes and keeps the requested constant radius",
);

const patchPoints = internalGraphToPatchPoints(graph);
assert.ok(patchPoints.length > graph.nodes.length, "edge graph is resampled into the existing SKIN sphere vocabulary");
assert.ok(patchPoints.every((point) => point.r === radius), "the first implementation keeps a constant line radius");

const history = [] as ReturnType<typeof parseRecipe>;
const state = createEmptyState();
record(history, state, "setSkinParam", { key: "internalStructure", value: "voronoiEdge" });
record(history, state, "setSkinParam", { key: "internalDensity", value: density });
record(history, state, "setSkinParam", { key: "internalRadius", value: radius });
record(history, state, "setSkinParam", { key: "internalRandomness", value: 0.85 });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.internalStructure, "voronoiEdge", "recipe preserves the internal structure selector");
assert.equal(restored.skinParams.internalDensity, density, "recipe preserves Density");
assert.equal(restored.skinParams.internalRadius, radius, "recipe preserves Radius");
assert.equal(restored.skinParams.internalRandomness, 0.85, "recipe preserves Randomness");

const mesh = buildSkinMesh(
  "window",
  host,
  0,
  0.18,
  [],
  0.035,
  { resolution: 22, targetLongestMm: 100 },
  0,
  0,
  0,
  graph,
);
assert.equal(mesh.internalEdgeCount, graph.edges.length, "existing SKIN mesh pipeline reports the included graph");
assert.ok(mesh.triangles.length > 0, "surface and internal graph produce one exportable triangle soup");

console.log("INTERNAL VORONOI tests: 15 passed");

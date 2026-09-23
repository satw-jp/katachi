import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCompositionBranches,
  compareAnchorPosition,
  DEFAULT_COMPOSITION_RECIPE,
  placeCompositionFlowers,
  type CompositionHost,
  type CompositionRecipe,
} from "./compositionModel.ts";

function cubeHost(): CompositionHost {
  const triangles = [
    [0, 0, 10, 20, 0, 10, 20, 20, 10], [0, 0, 10, 20, 20, 10, 0, 20, 10],
    [0, 0, 0, 20, 20, 0, 20, 0, 0], [0, 0, 0, 0, 20, 0, 20, 20, 0],
    [20, 0, 0, 20, 20, 0, 20, 20, 10], [20, 0, 0, 20, 20, 10, 20, 0, 10],
    [0, 0, 0, 0, 20, 10, 0, 20, 0], [0, 0, 0, 0, 0, 10, 0, 20, 10],
    [0, 20, 0, 20, 20, 10, 20, 20, 0], [0, 20, 0, 0, 20, 10, 20, 20, 10],
    [0, 0, 0, 20, 0, 0, 20, 0, 10], [0, 0, 0, 20, 0, 10, 0, 0, 10],
  ];
  const positions = new Float64Array(triangles.flat());
  const cumulativeAreas = new Float64Array(triangles.length);
  const normals = new Float64Array(triangles.length * 3);
  let totalArea = 0;
  for (let triangle = 0; triangle < triangles.length; triangle += 1) {
    const offset = triangle * 9;
    const abx = positions[offset + 3] - positions[offset];
    const aby = positions[offset + 4] - positions[offset + 1];
    const abz = positions[offset + 5] - positions[offset + 2];
    const acx = positions[offset + 6] - positions[offset];
    const acy = positions[offset + 7] - positions[offset + 1];
    const acz = positions[offset + 8] - positions[offset + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    totalArea += length / 2;
    normals.set([nx / length, ny / length, nz / length], triangle * 3);
    cumulativeAreas[triangle] = totalArea;
  }
  return {
    source: {} as CompositionHost["source"],
    bytes: new Uint8Array(),
    sourceHash: "test-only",
    fileName: "cube-test.stl",
    rawMesh: {
      positions,
      triangleCount: triangles.length,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 20, z: 10 } },
    },
    cumulativeAreas,
    normals,
    totalArea,
    validTriangleCount: triangles.length,
  };
}

function recipe(overrides: Partial<CompositionRecipe> = {}): CompositionRecipe {
  return Object.freeze({ ...DEFAULT_COMPOSITION_RECIPE, flowerCount: 8, minAnchorSpacingMm: 4, ...overrides });
}

test("flower placement is deterministic, source-triangle based, spaced, and scale-independent", () => {
  const host = cubeHost();
  const first = placeCompositionFlowers(host, recipe());
  const second = placeCompositionFlowers(host, recipe());
  assert.deepEqual(first, second);
  assert.equal(first.length, 8);
  assert.equal(new Set(first.map((flower) => flower.id)).size, 8);
  for (let index = 0; index < first.length; index += 1) {
    const flower = first[index];
    assert.equal(flower.id, `flower-${String(index).padStart(4, "0")}`);
    assert.ok(flower.triangleIndex >= 0 && flower.triangleIndex < 12);
    assert.ok(Math.abs(flower.barycentric.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
    assert.ok(compareAnchorPosition(host, flower) < 1e-8);
    for (const other of first.slice(0, index)) {
      assert.ok(Math.hypot(...flower.position.map((value, axis) => value - other.position[axis]) as [number, number, number]) >= 4);
    }
  }
  const scaled = placeCompositionFlowers(host, recipe({ flowerScale: 2 }));
  assert.deepEqual(scaled.map((flower) => flower.position), first.map((flower) => flower.position));
  assert.ok(scaled.every((flower) => flower.scale === 2));
});

test("branch generation creates one connected tree with one back and one surface node per flower", () => {
  const flowers = placeCompositionFlowers(cubeHost(), recipe());
  const graph = buildCompositionBranches(flowers, 3, 8);
  assert.equal(graph.nodes.length, flowers.length * 2);
  assert.equal(graph.edges.length, flowers.length * 2 - 1);
  assert.equal(graph.edges.filter((edge) => edge.role === "relay").length, flowers.length - 1);
  assert.equal(graph.edges.filter((edge) => edge.role === "attachment").length, flowers.length);
  assert.ok(graph.nodes.every((node) => node.position.every(Number.isFinite)));
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }
  const reached = new Set<string>([graph.rootNodeId]);
  const pending = [graph.rootNodeId];
  while (pending.length) {
    for (const next of adjacency.get(pending.pop()!) ?? []) {
      if (!reached.has(next)) { reached.add(next); pending.push(next); }
    }
  }
  assert.equal(reached.size, graph.nodes.length);
  assert.throws(() => buildCompositionBranches(flowers, 0, 8), /positive/);
  assert.throws(() => buildCompositionBranches([], 3, 8), /flower/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Triangle } from "../../cloud-sculpt/meshExport.ts";
import {
  detectSkinRebuildOverhangRegions,
  sampleSkinRebuildOverhangRegionSurface,
} from "./overhangRegions.ts";

const downward = (z: number, x = 0): Triangle => ({
  a: { x, y: 0, z },
  b: { x, y: 1, z },
  c: { x: x + 1, y: 0, z },
});

test("detects disconnected downward regions and excludes direct plate faces", () => {
  const upward: Triangle = {
    a: { x: 20, y: 0, z: 2 },
    b: { x: 21, y: 0, z: 2 },
    c: { x: 20, y: 1, z: 2 },
  };
  const result = detectSkinRebuildOverhangRegions([
    downward(2, 0),
    downward(3, 4),
    downward(0.05, 8),
    upward,
  ], 45, 0, 0.1);
  assert.equal(result.faceCount, 2);
  assert.equal(result.regionCount, 2);
  assert.equal(result.positions.length, 18);
  assert.equal(result.areaSourceSquared, 1);
  assert.equal(result.regions[0].minimumZ, 2);
  assert.equal(result.regions[1].minimumZ, 3);
  assert.deepEqual([...result.faceRegionIds], [0, 1]);
  assert.equal(result.regions[0].supportPoint.z, 2);
  assert.ok(result.regions[0].supportNormal.z < 0);
});

test("edge-adjacent risky faces form one region", () => {
  const first = downward(2);
  const second: Triangle = {
    a: { x: 1, y: 0, z: 2 },
    b: { x: 0, y: 1, z: 2 },
    c: { x: 1, y: 1, z: 2 },
  };
  const result = detectSkinRebuildOverhangRegions([first, second], 45, 0, 0.1);
  assert.equal(result.faceCount, 2);
  assert.equal(result.regionCount, 1);
  assert.equal(result.regions[0].faceCount, 2);
  assert.equal(result.regions[0].areaSourceSquared, 1);
  assert.deepEqual([...result.faceRegionIds], [0, 0]);
  const samples = sampleSkinRebuildOverhangRegionSurface(result, 0, 0.2);
  assert.equal(samples.length, 2, "both separated face centroids must receive physical Stage 5B coverage");
  assert.ok(samples.every((sample) => sample.normal.z < -0.99));
  assert.equal(samples[0].faceIndex, 0, "the deterministic centroid-nearest face becomes the hub");
});

test("threshold follows the build-direction overhang angle", () => {
  const slope: Triangle = {
    a: { x: 0, y: 0, z: 2 },
    b: { x: 0, y: 1, z: 2 },
    c: { x: 1, y: 0, z: 3 },
  };
  assert.equal(detectSkinRebuildOverhangRegions([slope], 44, 0, 0.1).faceCount, 1);
  assert.equal(detectSkinRebuildOverhangRegions([slope], 46, 0, 0.1).faceCount, 0);
});

test("surface sampling is bounded and spatially spread", () => {
  const triangles = Array.from({ length: 20 }, (_, index) => downward(2, index * 1.25));
  const result = detectSkinRebuildOverhangRegions(triangles, 45, 0, 0.1);
  // These triangles do not share edges, so collect their positions under a
  // synthetic single region to isolate the deterministic sampler contract.
  result.faceRegionIds.fill(0);
  const samples = sampleSkinRebuildOverhangRegionSurface(result, 0, 0.5, 5);
  assert.equal(samples.length, 5);
  assert.equal(new Set(samples.map((sample) => sample.faceIndex)).size, 5);
  assert.deepEqual(sampleSkinRebuildOverhangRegionSurface(result, 0, 0.5, 5), samples);
});

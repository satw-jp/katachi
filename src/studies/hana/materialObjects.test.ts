import assert from "node:assert/strict";
import test from "node:test";

import {
  HanaMaterialObjectRegistry,
  createMaterialObject,
  localCandidateSampleIndices,
} from "./materialObjects.ts";
import type { HanaMaterialSample } from "./materialField.ts";

function samples(offset: number): HanaMaterialSample[] {
  return [0, 1, 2].map((index) => ({
    position: { x: offset + index, y: 0, z: 0 },
    sourceT: index / 2,
    pressure: 0.5,
    time: index,
  }));
}

test("local Material Objects isolate dirty state and candidate queries", () => {
  const registry = new HanaMaterialObjectRegistry();
  registry.upsert(createMaterialObject("stroke-a", "stroke", ["stroke-a"], samples(0), 1));
  registry.upsert(createMaterialObject("stroke-b", "stroke", ["stroke-b"], samples(10), 1));
  registry.markDirty(["stroke-a"]);
  assert.equal(registry.get("stroke-a")?.dirty, true);
  assert.equal(registry.get("stroke-b")?.dirty, true);
  const cleanB = registry.applyGeneration(registry.beginGeneration("stroke-b"), 12);
  assert.equal(cleanB?.dirty, false);
  assert.deepEqual(localCandidateSampleIndices(cleanB as NonNullable<typeof cleanB>, { x: 11, y: 0, z: 0 }, 0.2), [1]);
  assert.equal(registry.get("stroke-a")?.dirty, true);
});

test("object generation is latest-only and does not accumulate resources", () => {
  const registry = new HanaMaterialObjectRegistry();
  registry.upsert(createMaterialObject("stroke", "stroke", ["stroke"], samples(0), 1));
  const first = registry.beginGeneration("stroke");
  const second = registry.beginGeneration("stroke");
  assert.equal(registry.isCurrentGeneration(first), false);
  assert.equal(registry.applyGeneration(first, 1), null);
  assert.equal(registry.applyGeneration(second, 2)?.meshCache?.triangleCount, 2);
  assert.equal(registry.size, 1);
  assert.equal(registry.values().length, 1);
});

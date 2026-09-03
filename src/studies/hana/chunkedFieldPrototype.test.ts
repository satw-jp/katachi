import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkKeysForBounds,
  createChunkedFieldPrototype,
  indexMaterialObjectInChunks,
  regenerateDirtyChunks,
  serializeChunkedFieldPrototype,
  validateChunkBoundaryConsistency,
} from "./chunkedFieldPrototype.ts";
import { createMaterialObject } from "./materialObjects.ts";

const sample = (x: number) => ({ position: { x, y: 0, z: 0 }, sourceT: x, pressure: 0.5, time: x });

test("Chunked Field prototype indexes boundary-crossing objects and regenerates only dirty chunks", () => {
  const object = createMaterialObject("stroke-1", "stroke", ["stroke-1"], [sample(0), sample(1.1)], 1);
  let prototype = indexMaterialObjectInChunks(createChunkedFieldPrototype(1), object);
  assert.deepEqual(chunkKeysForBounds(object.bounds, 1), ["0,0,0", "1,0,0"]);
  assert.equal(prototype.chunks.length, 2);
  assert.equal(prototype.dirtyChunkKeys.length, 2);
  prototype = regenerateDirtyChunks(prototype, { "stroke-1": 2 });
  assert.equal(prototype.dirtyChunkKeys.length, 0);
  assert.equal(prototype.chunks.every((chunk) => chunk.cache?.sampleCount === 2), true);
  assert.equal(validateChunkBoundaryConsistency(prototype).valid, true);
});

test("Re-indexing a moved object replaces old boundary membership without cache accumulation", () => {
  const first = createMaterialObject("stroke-1", "stroke", ["stroke-1"], [sample(0), sample(0.2)], 1);
  const moved = createMaterialObject("stroke-1", "stroke", ["stroke-1"], [sample(2), sample(2.2)], 2);
  let prototype = indexMaterialObjectInChunks(createChunkedFieldPrototype(1), first);
  prototype = regenerateDirtyChunks(prototype, { "stroke-1": 2 });
  prototype = indexMaterialObjectInChunks(prototype, moved);
  assert.equal(validateChunkBoundaryConsistency(prototype).valid, true);
  assert.deepEqual(prototype.objectToChunkKeys["stroke-1"], ["2,0,0"]);
  assert.equal(prototype.chunks.find((chunk) => chunk.key === "0,0,0")?.objectIds.length, 0);
  assert.ok(serializeChunkedFieldPrototype(prototype).includes("objectToChunkKeys"));
});

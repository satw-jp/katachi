import assert from "node:assert/strict";
import { buildFieldPrimitiveStore, isValidFieldPrimitive, canonicalStringifyPrimitive, PatchShapeKind } from "./fieldPrimitiveStore.ts";
import { Patch } from "./field.ts";

console.log("=== FieldPrimitiveStore Phase 1A Tests ===\n");

// Test 1: empty Patch[] -> empty store
{
  const store = buildFieldPrimitiveStore([]);
  assert.strictEqual(store.primitives.length, 0);
  assert.strictEqual(store.primitiveCount, 0);
  assert.strictEqual(store.patchCount, 0);
  assert.strictEqual(store.bounds, null);
  console.log("PASS: 1. empty Patch[] -> empty store");
}

// Test 2: single patch / single point -> exact primitive
{
  const patch: Patch = {
    id: 42,
    shape: "coin",
    points: [{ x: 10, y: 20, z: 30, r: 5 }],
    motifPlacement: undefined,
  };
  const store = buildFieldPrimitiveStore([patch]);
  assert.strictEqual(store.primitiveCount, 1);
  assert.strictEqual(store.patchCount, 1);
  assert.strictEqual(store.primitives[0].position.x, 10);
  assert.strictEqual(store.primitives[0].position.y, 20);
  assert.strictEqual(store.primitives[0].position.z, 30);
  assert.strictEqual(store.primitives[0].radius, 5);
  assert.strictEqual(store.primitives[0].patchIndex, 0);
  assert.strictEqual(store.primitives[0].patchId, 42);
  assert.strictEqual(store.primitives[0].shape, "coin");
  assert.strictEqual(store.primitives[0].pointIndex, 0);
  // bounds should include radius extent
  assert.strictEqual(store.bounds!.min.x, 5);
  assert.strictEqual(store.bounds!.min.y, 15);
  assert.strictEqual(store.bounds!.min.z, 25);
  assert.strictEqual(store.bounds!.max.x, 15);
  assert.strictEqual(store.bounds!.max.y, 25);
  assert.strictEqual(store.bounds!.max.z, 35);
  assert.strictEqual(store.bounds!.maxRadius, 5);
  console.log("PASS: 2. single patch / single point -> exact primitive");
}

// Test 3: multiple patches -> patch order + point order preserved
{
  const patches: Patch[] = [
    {
      id: 1,
      shape: "coin",
      points: [{ x: 0, y: 0, z: 0, r: 1 }, { x: 1, y: 1, z: 1, r: 2 }],
    },
    {
      id: 2,
      shape: "flatRing",
      points: [{ x: 5, y: 5, z: 5, r: 3 }],
    },
  ];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitiveCount, 3);
  assert.strictEqual(store.patchCount, 2);
  assert.strictEqual(store.primitives[0].shape, "coin");
  assert.strictEqual(store.primitives[0].pointIndex, 0);
  assert.strictEqual(store.primitives[1].shape, "coin");
  assert.strictEqual(store.primitives[1].pointIndex, 1);
  assert.strictEqual(store.primitives[2].shape, "flatRing");
  assert.strictEqual(store.primitives[2].pointIndex, 0);
  console.log("PASS: 3. multiple patches -> patch order + point order preserved");
}

// Test 4: patchIndex and Patch.id remain distinct
{
  const patches: Patch[] = [
    { id: 99, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 1 }] },
    { id: 42, shape: "flatRing", points: [{ x: 10, y: 10, z: 10, r: 2 }] },
  ];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitives[0].patchIndex, 0);
  assert.strictEqual(store.primitives[0].patchId, 99);
  assert.strictEqual(store.primitives[1].patchIndex, 1);
  assert.strictEqual(store.primitives[1].patchId, 42);
  console.log("PASS: 4. patchIndex and Patch.id remain distinct");
}

// Test 5: coin preserved
{
  const patches: Patch[] = [{ id: 1, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 1 }] }];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitives[0].shape, "coin");
  console.log("PASS: 5. coin preserved");
}

// Test 6: flatRing preserved
{
  const patches: Patch[] = [{ id: 1, shape: "flatRing", points: [{ x: 0, y: 0, z: 0, r: 1 }] }];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitives[0].shape, "flatRing");
  console.log("PASS: 6. flatRing preserved");
}

// Test 7: ring3d preserved
{
  const patches: Patch[] = [{ id: 1, shape: "ring3d", points: [{ x: 0, y: 0, z: 0, r: 1 }] }];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitives[0].shape, "ring3d");
  console.log("PASS: 7. ring3d preserved");
}

// Test 8: flower preserved
{
  const patches: Patch[] = [{ id: 1, shape: "flower", points: [{ x: 0, y: 0, z: 0, r: 1 }] }];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitives[0].shape, "flower");
  console.log("PASS: 8. flower preserved");
}

// Test 9: 256 points -> 256, no truncation
{
  const patches: Patch[] = [];
  for (let i = 0; i < 256; i++) {
    patches.push({
      id: i,
      shape: "coin",
      points: [{ x: i, y: i, z: i, r: 1 }],
    });
  }
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitiveCount, 256);
  assert.strictEqual(store.patchCount, 256);
  console.log("PASS: 9. 256 points -> 256, no truncation");
}

// Test 10: 257 points -> 257, no truncation
{
  const patches: Patch[] = [];
  for (let i = 0; i < 257; i++) {
    patches.push({
      id: i,
      shape: "coin",
      points: [{ x: i, y: i, z: i, r: 1 }],
    });
  }
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitiveCount, 257);
  assert.strictEqual(store.patchCount, 257);
  console.log("PASS: 10. 257 points -> 257, no truncation");
}

// Test 11: 512 points -> 512, no truncation
{
  const patches: Patch[] = [];
  for (let i = 0; i < 512; i++) {
    patches.push({
      id: i,
      shape: "coin",
      points: [{ x: i, y: i, z: i, r: 1 }],
    });
  }
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.primitiveCount, 512);
  assert.strictEqual(store.patchCount, 512);
  console.log("PASS: 11. 512 points -> 512, no truncation");
}

// Test 12: bounds include radius extents
{
  const patches: Patch[] = [
    { id: 1, shape: "coin", points: [{ x: 10, y: 10, z: 10, r: 5 }] },
    { id: 2, shape: "coin", points: [{ x: 20, y: 20, z: 20, r: 3 }] },
  ];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.bounds!.min.x, 5);
  assert.strictEqual(store.bounds!.min.y, 5);
  assert.strictEqual(store.bounds!.min.z, 5);
  assert.strictEqual(store.bounds!.max.x, 23);
  assert.strictEqual(store.bounds!.max.y, 23);
  assert.strictEqual(store.bounds!.max.z, 23);
  assert.strictEqual(store.bounds!.maxRadius, 5);
  console.log("PASS: 12. bounds include radius extents");
}

// Test 13: maxRadius correct
{
  const patches: Patch[] = [
    { id: 1, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 7 }] },
    { id: 2, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 2 }] },
  ];
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store.bounds!.maxRadius, 7);
  console.log("PASS: 13. maxRadius correct");
}

// Test 14: NaN position rejected
{
  const patches: Patch[] = [
    { id: 1, shape: "coin", points: [{ x: NaN, y: 0, z: 0, r: 1 }] },
  ];
  try {
    buildFieldPrimitiveStore(patches);
    assert.fail("should have thrown");
  } catch (e: any) {
    assert.strictEqual(e.message, "FieldPrimitiveStore: non-finite position or radius at patch 1 point 0");
  }
  console.log("PASS: 14. NaN position rejected");
}

// Test 15: Infinity radius rejected
{
  const patches: Patch[] = [
    { id: 1, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: Infinity }] },
  ];
  try {
    buildFieldPrimitiveStore(patches);
    assert.fail("should have thrown");
  } catch (e: any) {
    assert.strictEqual(e.message, "FieldPrimitiveStore: non-finite position or radius at patch 1 point 0");
  }
  console.log("PASS: 15. Infinity radius rejected");
}

// Test 16: input Patch[] and points not mutated
{
  const patches: Patch[] = [
    { id: 1, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 1 }] },
  ];
  const original = { x: patches[0].points[0].x, y: patches[0].points[0].y, z: patches[0].points[0].z, r: patches[0].points[0].r };
  const store = buildFieldPrimitiveStore(patches);
  assert.strictEqual(patches[0].points[0].x, original.x);
  assert.strictEqual(patches[0].points[0].y, original.y);
  assert.strictEqual(patches[0].points[0].z, original.z);
  assert.strictEqual(patches[0].points[0].r, original.r);
  console.log("PASS: 16. input Patch[] and points not mutated");
}

// Test 17: same input twice -> structurally identical output
{
  const patches: Patch[] = [
    { id: 1, shape: "coin", points: [{ x: 5, y: 5, z: 5, r: 2 }] },
    { id: 2, shape: "flatRing", points: [{ x: 10, y: 10, z: 10, r: 3 }] },
  ];
  const store1 = buildFieldPrimitiveStore(patches);
  const store2 = buildFieldPrimitiveStore(patches);
  assert.strictEqual(store1.primitiveCount, store2.primitiveCount);
  assert.strictEqual(store1.patchCount, store2.patchCount);
  for (let i = 0; i < store1.primitiveCount; i++) {
    assert.strictEqual(store1.primitives[i].position.x, store2.primitives[i].position.x);
    assert.strictEqual(store1.primitives[i].position.y, store2.primitives[i].position.y);
    assert.strictEqual(store1.primitives[i].position.z, store2.primitives[i].position.z);
    assert.strictEqual(store1.primitives[i].radius, store2.primitives[i].radius);
    assert.strictEqual(store1.primitives[i].patchIndex, store2.primitives[i].patchIndex);
    assert.strictEqual(store1.primitives[i].patchId, store2.primitives[i].patchId);
    assert.strictEqual(store1.primitives[i].shape, store2.primitives[i].shape);
    assert.strictEqual(store1.primitives[i].pointIndex, store2.primitives[i].pointIndex);
  }
  console.log("PASS: 17. same input twice -> structurally identical output");
}

// Test 18: canonicalStringifyPrimitive deterministic
{
  const p = { position: { x: 1, y: 2, z: 3 }, radius: 4, patchIndex: 0, patchId: 42, shape: "coin", pointIndex: 1 };
  const s1 = canonicalStringifyPrimitive(p);
  const s2 = canonicalStringifyPrimitive(p);
  assert.strictEqual(s1, s2);
  assert.strictEqual(s1, "1,2,3,4,0,42,coin,1");
  console.log("PASS: 18. canonicalStringifyPrimitive deterministic");
}

// Test 19: isValidFieldPrimitive validates correctly
{
  assert.strictEqual(isValidFieldPrimitive({ position: { x: 0, y: 0, z: 0 }, radius: 1, patchIndex: 0, patchId: 1, shape: "coin", pointIndex: 0 }), true);
  assert.strictEqual(isValidFieldPrimitive({ position: { x: NaN, y: 0, z: 0 }, radius: 1, patchIndex: 0, patchId: 1, shape: "coin", pointIndex: 0 }), false);
  assert.strictEqual(isValidFieldPrimitive({ position: { x: 0, y: 0, z: 0 }, radius: Infinity, patchIndex: 0, patchId: 1, shape: "coin", pointIndex: 0 }), false);
  assert.strictEqual(isValidFieldPrimitive({ position: { x: 0, y: 0, z: 0 }, radius: 1, patchIndex: 1.5, patchId: 1, shape: "coin", pointIndex: 0 }), false);
  assert.strictEqual(isValidFieldPrimitive({ position: { x: 0, y: 0, z: 0 }, radius: 1, patchId: 1, shape: "coin", pointIndex: 0 }), false);
  assert.strictEqual(isValidFieldPrimitive({ position: { x: 0, y: 0, z: 0 }, radius: 1, patchIndex: 0, patchId: 1, shape: "square", pointIndex: 0 }), false);
  console.log("PASS: 19. isValidFieldPrimitive validates correctly");
}

console.log("\n=== All 19 FieldPrimitiveStore Phase 1A Tests PASSED ===\n");
import assert from "node:assert/strict";
import { buildFieldGpuSpatialGridPayload, isValidFieldGpuSpatialGridPayload } from "./fieldGpuSpatialGrid.ts";
import { buildFieldPrimitiveStore, FieldPrimitive } from "./fieldPrimitiveStore.ts";

console.log("=== FieldGpuSpatialGrid Phase 3A Tests ===\n");

// Helper: create a FieldPrimitive
function makePrim(pos: { x: number; y: number; z: number }, r: number, id: number): FieldPrimitive {
  return { position: pos, radius: r, shape: "coin" as const, patchIndex: id, pointIndex: id };
}

function makePrims(...prims: FieldPrimitive[]): FieldPrimitive[] {
  return prims;
}

console.log("Test 1: Empty store -> explicit empty grid payload");
{
  const payload = buildFieldGpuSpatialGridPayload([]);
  assert.strictEqual(payload.primitiveCount, 0);
  assert.strictEqual(payload.cellSize, 0);
  assert.strictEqual(payload.bounds.min.x, 0);
  assert.strictEqual(payload.bounds.min.y, 0);
  assert.strictEqual(payload.bounds.min.z, 0);
  assert.strictEqual(payload.bounds.max.x, 0);
  assert.strictEqual(payload.bounds.max.y, 0);
  assert.strictEqual(payload.bounds.max.z, 0);
  assert.strictEqual(payload.dimensions.x, 0);
  assert.strictEqual(payload.dimensions.y, 0);
  assert.strictEqual(payload.dimensions.z, 0);
  assert.strictEqual(payload.cellCount, 0);
  assert.strictEqual(payload.cellTable.byteLength, 0);
  assert.strictEqual(payload.primitiveIndices.byteLength, 0);
  assert.strictEqual(payload.maxRadius, 0);
  assert.strictEqual(isValidFieldGpuSpatialGridPayload(payload), true);
  console.log("  PASS");
}

console.log("Test 2: Single primitive -> one populated cell");
{
  const primitives = [makePrim({ x: 10, y: 20, z: 30 }, 5, 0)];
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 1);
  // Automatic cellSize; just check structure
  assert.strictEqual(payload.cellCount, 1);
  assert.strictEqual(payload.cellTable.byteLength, 2 * 4);
  assert.strictEqual(payload.primitiveIndices.byteLength, 1 * 4);
  assert.strictEqual(payload.cellTable[0], 0);
  assert.strictEqual(payload.cellTable[1], 1);
  assert.strictEqual(payload.primitiveIndices[0], 0);
  assert.strictEqual(payload.cellTable[1], 1);
  console.log("  PASS");
}

console.log("Test 3: Two primitives same cell -> count 2, stable order");
{
  const primitives = [
    makePrim({ x: 10, y: 20, z: 30 }, 5, 0),
    makePrim({ x: 10, y: 20, z: 30 }, 5, 1),
  ];
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 2);
  assert.strictEqual(payload.cellCount, 1);
  assert.strictEqual(payload.cellTable[1], 2);
  assert.strictEqual(payload.primitiveIndices[0], 0);
  assert.strictEqual(payload.primitiveIndices[1], 1);
  assert.strictEqual(payload.cellTable[1], 2);
  console.log("  PASS");
}

console.log("Test 3b: Two primitives different cells -> distinct dense cells");
{
  const primitives = [
    makePrim({ x: 10, y: 20, z: 30 }, 5, 0),
    makePrim({ x: 100, y: 200, z: 300 }, 5, 1),
  ];
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 2);
  assert.strictEqual(payload.cellCount, 2);
  assert.strictEqual(payload.cellTable[1], 1);
  assert.strictEqual(payload.cellTable[3], 1);
  assert.strictEqual(payload.primitiveIndices[0], 0);
  assert.strictEqual(payload.primitiveIndices[1], 1);
  console.log("  PASS");
}

console.log("Test 4: 256 primitives -> all 256 indexed once");
{
  const primitives = [];
  for (let i = 0; i < 256; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 256);
  const seen = new Set<number>();
  for (let i = 0; i < 256; i++) {
    const idx = payload.primitiveIndices[i];
    assert.strictEqual(idx, i, `primitiveIndices[${i}] should be ${i}, got ${idx}`);
    seen.add(idx);
  }
  assert.strictEqual(seen.size, 256);
  let sumCounts = 0;
  for (let i = 0; i < payload.cellCount; i++) {
    sumCounts += payload.cellTable[2 * i + 1];
  }
  assert.strictEqual(sumCounts, 256);
  console.log("  PASS");
}

console.log("Test 4b: 257 primitives -> all 257 indexed once");
{
  const primitives = [];
  for (let i = 0; i < 257; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 257);
  const seen = new Set<number>();
  for (let i = 0; i < 257; i++) {
    const idx = payload.primitiveIndices[i];
    assert.strictEqual(idx, i, `primitiveIndices[${i}] should be ${i}, got ${idx}`);
    seen.add(idx);
  }
  assert.strictEqual(seen.size, 257);
  let sumCounts = 0;
  for (let i = 0; i < payload.cellCount; i++) {
    sumCounts += payload.cellTable[2 * i + 1];
  }
  assert.strictEqual(sumCounts, 257);
  console.log("  PASS");
}

console.log("Test 6: 512 primitives -> all 512 indexed once");
{
  const primitives = [];
  for (let i = 0; i < 512; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 512);
  const seen = new Set<number>();
  for (let i = 0; i < 512; i++) {
    const idx = payload.primitiveIndices[i];
    assert.strictEqual(idx, i, `primitiveIndices[${i}] should be ${i}, got ${idx}`);
    seen.add(idx);
  }
  assert.strictEqual(seen.size, 512);
  let sumCounts = 0;
  for (let i = 0; i < payload.cellCount; i++) {
    sumCounts += payload.cellTable[2 * i + 1];
  }
  assert.strictEqual(sumCounts, 512);
  console.log("  PASS");
}

console.log("Test 7: 1024 primitives -> all 1024 indexed once");
{
  const primitives = [];
  for (let i = 0; i < 1024; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 1024);
  const seen = new Set<number>();
  for (let i = 0; i < 1024; i++) {
    const idx = payload.primitiveIndices[i];
    assert.strictEqual(idx, i, `primitiveIndices[${i}] should be ${i}, got ${idx}`);
    seen.add(idx);
  }
  assert.strictEqual(seen.size, 1024);
  let sumCounts = 0;
  for (let i = 0; i < payload.cellCount; i++) {
    sumCounts += payload.cellTable[2 * i + 1];
  }
  assert.strictEqual(sumCounts, 1024);
  console.log("  PASS");
}

console.log("Test 8: 2048 primitives -> all 2048 indexed once");
{
  const primitives = [];
  for (let i = 0; i < 2048; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.primitiveCount, 2048);
  const seen = new Set<number>();
  for (let i = 0; i < 2048; i++) {
    const idx = payload.primitiveIndices[i];
    assert.strictEqual(idx, i, `primitiveIndices[${i}] should be ${i}, got ${idx}`);
    seen.add(idx);
  }
  assert.strictEqual(seen.size, 2048);
  let sumCounts = 0;
  for (let i = 0; i < payload.cellCount; i++) {
    sumCounts += payload.cellTable[2 * i + 1];
  }
  assert.strictEqual(sumCounts, 2048);
  console.log("  PASS");
}

console.log("Test 7b: sum cell counts == primitiveCount (parity check)");
{
  const primitives = [];
  for (let i = 0; i < 100; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  let sumCounts = 0;
  for (let i = 0; i < payload.cellCount; i++) {
    sumCounts += payload.cellTable[2 * i + 1];
  }
  assert.strictEqual(sumCounts, payload.primitiveCount);
  console.log("  PASS");
}

console.log("Test 7b: no duplicate primitive index");
{
  const primitives = [];
  for (let i = 0; i < 50; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  const seen = new Set<number>();
  for (let i = 0; i < payload.primitiveCount; i++) {
    const idx = payload.primitiveIndices[i];
    if (seen.has(idx)) throw new Error(`Duplicate index ${idx}`);
    seen.add(idx);
  }
  console.log("  PASS (no duplicates)");
}

console.log("Test 7b: no missing primitive index");
{
  const primitives = [];
  for (let i = 0; i < 50; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  const seen = new Set<number>();
  for (let i = 0; i < payload.primitiveCount; i++) {
    const idx = payload.primitiveIndices[i];
    if (seen.has(idx)) throw new Error(`Duplicate index ${idx}`);
    seen.add(idx);
  }
  for (let i = 0; i < payload.primitiveCount; i++) {
    assert.strictEqual(payload.primitiveIndices[i], i);
  }
  console.log("  PASS (no missing)");
}

console.log("Test 8: deterministic same store twice -> byte-identical arrays");
{
  const primitives = [];
  for (let i = 0; i < 50; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const payload1 = buildFieldGpuSpatialGridPayload(primitives);
  const payload2 = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload1.primitiveCount, payload2.primitiveCount);
  assert.strictEqual(payload1.cellCount, payload2.cellCount);
  for (let i = 0; i < payload1.cellTable.byteLength; i++) {
    assert.strictEqual(payload1.cellTable[i], payload2.cellTable[i]);
  }
  for (let i = 0; i < payload1.primitiveIndices.byteLength; i++) {
    assert.strictEqual(payload1.primitiveIndices[i], payload2.primitiveIndices[i]);
  }
  console.log("  PASS");
}

console.log("Test 8b: store not mutated");
{
  const primitives = [];
  for (let i = 0; i < 10; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, i));
  }
  const positionsBefore = primitives.map(p => ({ x: p.position.x, y: p.position.y, z: p.position.z }));
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  for (let i = 0; i < primitives.length; i++) {
    assert.strictEqual(primitives[i].position.x, positionsBefore[i].x);
    assert.strictEqual(primitives[i].position.y, positionsBefore[i].y);
    assert.strictEqual(primitives[i].position.z, positionsBefore[i].z);
  }
  console.log("  PASS");
}

console.log("Test 8b: maxRadius preserved");
{
  const primitives = [
    makePrim({ x: 0, y: 0, z: 0 }, 5, 0),
    makePrim({ x: 10, y: 10, z: 10 }, 10, 1),
  ];
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.maxRadius, 10);
  console.log("  PASS");
}

console.log("Test 7b: bounds distinction (centers vs radius extents) documented");
{
  const primitives = [
    makePrim({ x: 10, y: 10, z: 10 }, 5, 0),
  ];
  const payload = buildFieldGpuSpatialGridPayload(primitives);
  assert.strictEqual(payload.bounds.min.x, 10);
  assert.strictEqual(payload.bounds.max.x, 10);
  assert.strictEqual(payload.maxRadius, 5);
  console.log("  PASS (bounds distinction preserved)");
}

console.log("\n=== All FieldGpuSpatialGrid Phase 3A Tests PASSED ===\n");
import assert from "node:assert/strict";
import { packFieldGpuPayload, encodeGpuShapeCode, decodeGpuShapeCode, isValidFieldGpuPayload, GpuShapeCode, FieldGpuPayload } from "./fieldGpuPayload.ts";
import { FieldPrimitive } from "./fieldPrimitiveStore.ts";

console.log("=== FieldGpuPayload Phase 2A Tests ===\n");

// Helper: create a FieldPrimitive directly
function makePrim(pos: { x: number; y: number; z: number }, r: number, shape: string, patchIdx: number, ptIdx: number): FieldPrimitive {
  return { position: pos, radius: r, shape, patchIndex: patchIdx, pointIndex: ptIdx };
}

// A 1×1 texture needs 4 Float32 values (R,G,B,A per texel)
// new Float32Array(4) → 4 elements, byteLength=16
// new Float32Array(16) → 16 elements, byteLength=64  (was the bug in original test)

console.log("Test 1: Empty store -> valid empty payload");
{
  // 1×1 texture with 0 primitives: geometry/metadata need 4 Float32 values each
  const geom = new Float32Array(4);
  const meta = new Float32Array(4);
  const payload = packFieldGpuPayload([], 256);
  assert.strictEqual(payload.primitiveCount, 0);
  assert.strictEqual(payload.width, 1);
  assert.strictEqual(payload.height, 1);
  assert.strictEqual(payload.geometry.byteLength, 16); // 1*1*4*4 = 16, Float32Array(4).byteLength=16
  assert.strictEqual(payload.metadata.byteLength, 16);
  assert.strictEqual(isValidFieldGpuPayload(payload), true);
  console.log("  PASS");
}

console.log("Test 2: Single primitive -> exact geometry + metadata");
{
  const payload = packFieldGpuPayload([makePrim({ x: 10, y: 20, z: 30 }, 5, "coin", 0, 0)], 256);
  assert.strictEqual(payload.primitiveCount, 1);
  assert.strictEqual(payload.width, 1);
  assert.strictEqual(payload.height, 1);
  assert.strictEqual(payload.geometry[0], 10);
  assert.strictEqual(payload.geometry[1], 20);
  assert.strictEqual(payload.geometry[2], 30);
  assert.strictEqual(payload.geometry[3], 5);
  assert.strictEqual(payload.metadata[0], 0);
  assert.strictEqual(payload.metadata[1], 0); // coin code
  assert.strictEqual(payload.metadata[2], 0);
  assert.strictEqual(payload.metadata[3], 0);
  console.log("  PASS");
}

console.log("Test 3: Shape codes coin=0, flatRing=1, ring3d=2, flower=3");
{
  const codes: { shape: string; expectedCode: number }[] = [
    { shape: "coin", expectedCode: 0 },
    { shape: "flatRing", expectedCode: 1 },
    { shape: "ring3d", expectedCode: 2 },
    { shape: "flower", expectedCode: 3 },
  ];
  for (const { shape, expectedCode } of codes) {
    assert.strictEqual(encodeGpuShapeCode(shape), expectedCode);
  }
  console.log("  PASS");
}

console.log("Test 4: decodeGpuShapeCode round-trip");
{
  assert.strictEqual(decodeGpuShapeCode(0), "coin");
  assert.strictEqual(decodeGpuShapeCode(1), "flatRing");
  assert.strictEqual(decodeGpuShapeCode(2), "ring3d");
  assert.strictEqual(decodeGpuShapeCode(3), "flower");
  console.log("  PASS");
}

console.log("Test 4b: 256 primitives -> fits in 256x256 texture");
{
  const primitives: FieldPrimitive[] = [];
  for (let i = 0; i < 256; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, "coin", i % 16, i % 16));
  }
  const payload = packFieldGpuPayload(primitives, 256);
  assert.strictEqual(payload.primitiveCount, 256);
  assert.strictEqual(payload.width, 256);
  assert.strictEqual(payload.height, 1);
  console.log("  PASS");
}

console.log("Test 6: 257 primitives -> exceeds maxTextureSize^2 check with maxTextureSize=16");
{
  const primitives: FieldPrimitive[] = [];
  for (let i = 0; i < 257; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, "coin", i % 16, i % 16));
  }
  try {
    packFieldGpuPayload(primitives, 16); // 16*16=256 < 257 → should throw
    assert.fail("should have thrown");
  } catch (e: any) {
    assert.strictEqual(e.message.includes("exceeds"), true);
  }
  console.log("  PASS (257 > 16^2 → threw error)");
}

console.log("Test 6b: 512 primitives with maxTextureSize=24 (24^2=576 >= 512)");
{
  const primitives: FieldPrimitive[] = [];
  for (let i = 0; i < 512; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, "coin", i % 24, i % 24));
  }
  const payload = packFieldGpuPayload(primitives, 24);
  assert.strictEqual(payload.primitiveCount, 512);
  assert.strictEqual(payload.width, 24);
  assert.strictEqual(payload.height, 22); // ceil(512/24) = 22 (24*22=528 >= 512)
  console.log("  PASS (512 fits in 24x24=576)");
}

console.log("Test 7: patchIndex is GPU owner (not Patch.id)");
{
  const primitives: FieldPrimitive[] = [
    makePrim({ x: 0, y: 0, z: 0 }, 1, "coin", 999, 0),
    makePrim({ x: 10, y: 10, z: 10 }, 2, "flatRing", 42, 0),
  ];
  const payload = packFieldGpuPayload(primitives, 256);
  // primitive 0: metadata[0]=patchIndex=999, metadata[1]=shapeCode=0(coin), metadata[2]=pointIndex=0, metadata[3]=0
  // primitive 1: metadata[4]=patchIndex=42, metadata[5]=shapeCode=1(flatRing), metadata[6]=pointIndex=0, metadata[7]=0
  assert.strictEqual(payload.metadata[0], 999);
  assert.strictEqual(payload.metadata[1], 0);
  assert.strictEqual(payload.metadata[4], 42);
  assert.strictEqual(payload.metadata[5], 1); // flatRing code
  console.log("  PASS");
}

console.log("Test 8: 1024 primitives with maxTextureSize=32 (32^2=1024)");
{
  const primitives: FieldPrimitive[] = [];
  for (let i = 0; i < 1024; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, "coin", i % 32, i % 32));
  }
  const payload = packFieldGpuPayload(primitives, 32);
  assert.strictEqual(payload.primitiveCount, 1024);
  assert.strictEqual(payload.width, 32);
  assert.strictEqual(payload.height, 32);
  console.log("  PASS");
}

console.log("Test 8b: 2048 primitives with maxTextureSize=47 (47^2=2209 >= 2048)");
{
  const primitives: FieldPrimitive[] = [];
  for (let i = 0; i < 2048; i++) {
    primitives.push(makePrim({ x: i, y: i, z: i }, 1, "coin", i % 47, i % 47));
  }
  const payload = packFieldGpuPayload(primitives, 47);
  assert.strictEqual(payload.primitiveCount, 2048);
  assert.strictEqual(payload.width, 47);
  assert.strictEqual(payload.height, 44); // ceil(2048/47) = 44 (47*44=2068)
  console.log("  PASS");
}

console.log("Test 8c: capacity overflow with tiny maxTextureSize");
{
  const primitives2 = [
    makePrim({ x: 0, y: 0, z: 0 }, 1, "coin", 0, 0),
    makePrim({ x: 1, y: 1, z: 1 }, 2, "flatRing", 1, 0),
  ];
  try {
    packFieldGpuPayload(primitives2, 1); // 1*1=1 < 2 → should throw
    assert.fail("should have thrown for 2 primitives / maxTextureSize=1");
  } catch (e: any) {
    assert.strictEqual(e.message.includes("exceeds"), true);
  }
  console.log("  PASS (capacity overflow threw as expected)");
}

console.log("Test 8d: isValidFieldGpuPayload validates structure");
{
  // 1×1 texture: geometry/metadata need 4 Float32 values each → byteLength=16
  assert.strictEqual(isValidFieldGpuPayload({ primitiveCount: 0, width: 1, height: 1, geometry: new Float32Array(4), metadata: new Float32Array(4) } as any), true);
  // 2×3 texture (6 texels): geometry/metadata need 6*4=24 Float32 values
  assert.strictEqual(isValidFieldGpuPayload({ primitiveCount: 5, width: 2, height: 3, geometry: new Float32Array(24), metadata: new Float32Array(24) } as any), true);
  // pc=10 > w*h=6 → invalid
  assert.strictEqual(isValidFieldGpuPayload({ primitiveCount: 10, width: 2, height: 3, geometry: new Float32Array(24), metadata: new Float32Array(24) } as any), false);
  console.log("  PASS");
}

console.log("Test 10: same input twice -> byte-identical arrays");
{
  const primitives: FieldPrimitive[] = [
    makePrim({ x: 1, y: 2, z: 3 }, 5, "coin", 0, 0),
    makePrim({ x: 10, y: 20, z: 30 }, 7, "flatRing", 1, 1),
  ];
  const p1 = packFieldGpuPayload(primitives, 256);
  const p2 = packFieldGpuPayload(primitives, 256);
  assert.strictEqual(p1.primitiveCount, p2.primitiveCount);
  assert.strictEqual(p1.width, p2.width);
  assert.strictEqual(p1.height, p2.height);
  for (let i = 0; i < p1.geometry.length; i++) {
    assert.strictEqual(p1.geometry[i], p2.geometry[i]);
  }
  for (let i = 0; i < p1.metadata.length; i++) {
    assert.strictEqual(p1.metadata[i], p2.metadata[i]);
  }
  console.log("  PASS");
}

console.log("Test 10b: primitives not mutated");
{
  const primitives: FieldPrimitive[] = [
    makePrim({ x: 1, y: 2, z: 3 }, 5, "coin", 0, 0),
  ];
  const positionsBefore = { x: primitives[0].position.x, y: primitives[0].position.y, z: primitives[0].position.z };
  const payload = packFieldGpuPayload(primitives, 256);
  assert.strictEqual(primitives[0].position.x, positionsBefore.x);
  assert.strictEqual(primitives[0].position.y, positionsBefore.y);
  assert.strictEqual(primitives[0].position.z, positionsBefore.z);
  console.log("  PASS");
}

console.log("\n=== All FieldGpuPayload Phase 2A Tests PASSED ===\n");
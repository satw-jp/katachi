import assert from "node:assert/strict";
import { buildFieldPrimitiveStore } from "./fieldPrimitiveStore.ts";
import { buildLegacyPayloadFromStore, isValidLegacyPayload } from "./fieldLegacyPayload.ts";

console.log("=== FieldLegacyPayload Parity Tests ===\n");

// Helper: create a minimal FieldPrimitive (we construct it directly since
// buildFieldPrimitiveStore expects Patch[], but the payload builder just
// needs primitives with position/radius/shape/patchIndex)
function makePrim(position: { x: number; y: number; z: number }, radius: number, shape: string, patchIndex: number): any {
  return { position, radius, shape, patchIndex };
}

console.log("Test 1: Empty primitives -> empty payload (count=0, lengths=256)");
{
  const payload = buildLegacyPayloadFromStore([]);
  assert.strictEqual(payload.patchPointCount, 0);
  assert.strictEqual(payload.patchPos.length, 256);
  assert.strictEqual(payload.patchData.length, 256);
  assert.strictEqual(payload.hostCount, 96);
  console.log("  PASS");
}

console.log("Test 2: Single coin -> radius + ownerFloat = patchIndex + 0.0");
{
  const payload = buildLegacyPayloadFromStore([makePrim({ x: 10, y: 20, z: 30 }, 5, "coin", 0)]);
  assert.strictEqual(payload.patchPointCount, 1);
  assert.strictEqual(payload.patchPos[0].x, 10);
  assert.strictEqual(payload.patchPos[0].y, 20);
  assert.strictEqual(payload.patchPos[0].z, 30);
  assert.strictEqual(payload.patchData[0].x, 5); // radius
  // ownerFloat = patchIndex + shapeFraction = 0 + 0.0 = 0
  assert.strictEqual(payload.patchData[0].y, 0);
  console.log("  PASS");
}

console.log("Test 3: flatRing -> y = patchIndex + 0.25");
{
  const payload = buildLegacyPayloadFromStore([makePrim({ x: 10, y: 20, z: 30 }, 5, "flatRing", 0)]);
  assert.strictEqual(payload.patchData[0].y, 0.25);
  console.log("  PASS");
}

console.log("Test 4: ring3d -> y = patchIndex + 0.5");
{
  const payload = buildLegacyPayloadFromStore([makePrim({ x: 10, y: 20, z: 30 }, 5, "ring3d", 0)]);
  assert.strictEqual(payload.patchData[0].y, 0.5);
  console.log("  PASS");
}

console.log("Test 5: flower -> y = patchIndex + 0.75");
{
  const payload = buildLegacyPayloadFromStore([makePrim({ x: 10, y: 20, z: 30 }, 5, "flower", 0)]);
  assert.strictEqual(payload.patchData[0].y, 0.75);
  console.log("  PASS");
}

console.log("Test 5b: 257 primitives -> capped at 256 (legacy behaviour)");
{
  const patches: any[] = [];
  for (let i = 0; i < 257; i++) {
    patches.push(makePrim({ x: i, y: i, z: i }, 1, "coin", i));
  }
  // buildFieldPrimitiveStore expects Patch[], but buildLegacyPayloadFromStore
  // just takes primitives array. We'll test with direct primitives.
  const payload = buildLegacyPayloadFromStore(patches);
  assert.strictEqual(payload.patchPointCount, 256);
  assert.strictEqual(payload.patchPos.length, 256);
  assert.strictEqual(payload.patchData.length, 256);
  console.log("  PASS (257 -> capped to 256)");
}

console.log("Test 6: 512 primitives -> capped at 256");
{
  const patches: any[] = [];
  for (let i = 0; i < 512; i++) {
    patches.push(makePrim({ x: i, y: i, z: i }, 1, "coin", i));
  }
  const payload = buildLegacyPayloadFromStore(patches);
  assert.strictEqual(payload.patchPointCount, 256);
  assert.strictEqual(payload.patchPos.length, 256);
  console.log("  PASS (512 -> capped to 256)");
}

console.log("Test 7: mixed shapes preserve owner+fraction order");
{
  const primitives: any[] = [
    makePrim({ x: 0, y: 0, z: 0 }, 1, "coin", 0),
    makePrim({ x: 10, y: 10, z: 10 }, 2, "flatRing", 1),
    makePrim({ x: 20, y: 20, z: 20 }, 3, "ring3d", 2),
    makePrim({ x: 30, y: 30, z: 30 }, 4, "flower", 3),
  ];
  const payload = buildLegacyPayloadFromStore(primitives);
  assert.strictEqual(payload.patchPointCount, 4);
  assert.strictEqual(payload.patchData[0].y, 0 + 0.0);  // coin
  assert.strictEqual(payload.patchData[1].y, 1 + 0.25); // flatRing
  assert.strictEqual(payload.patchData[2].y, 2 + 0.5);  // ring3d
  assert.strictEqual(payload.patchData[3].y, 3 + 0.75); // flower
  console.log("  PASS");
}

console.log("Test 7b: isValidLegacyPayload validates shape");
{
  assert.strictEqual(isValidLegacyPayload({} as any), false);
  assert.strictEqual(isValidLegacyPayload({ patchPos: [], patchData: [], patchPointCount: 0, hostCount: 96 } as any), true);
  assert.strictEqual(isValidLegacyPayload({ patchPos: [{ x: 0, y: 0, z: 0 }], patchData: [{ x: 0, y: 0 }], patchPointCount: 1, hostCount: 96 } as any), true);
  assert.strictEqual(isValidLegacyPayload({ patchPos: [{ x: 0, y: 0, z: 0 }], patchData: [{ x: 0, y: 0 }], patchPointCount: 5, hostCount: 96 } as any), false);
  assert.strictEqual(isValidLegacyPayload({ patchPos: [{ x: 0, y: 0, z: 0 }], patchData: [{ x: 0, y: 0 }], patchPointCount: 1, hostCount: 64 } as any), false);
  console.log("  PASS");
}

console.log("Test 8: same input twice -> identical payload");
{
  const primitives: any[] = [
    makePrim({ x: 5, y: 5, z: 5 }, 2, "coin", 0),
    makePrim({ x: 10, y: 10, z: 10 }, 3, "flatRing", 1),
  ];
  const p1 = buildLegacyPayloadFromStore(primitives);
  const p2 = buildLegacyPayloadFromStore(primitives);
  assert.strictEqual(p1.patchPointCount, p2.patchPointCount);
  for (let i = 0; i < p1.patchPos.length; i++) {
    assert.strictEqual(p1.patchPos[i].x, p2.patchPos[i].x);
    assert.strictEqual(p1.patchPos[i].y, p2.patchPos[i].y);
    assert.strictEqual(p1.patchPos[i].z, p2.patchPos[i].z);
    assert.strictEqual(p1.patchData[i].x, p2.patchData[i].x);
    assert.strictEqual(p1.patchData[i].y, p2.patchData[i].y);
  }
  console.log("  PASS");
}

console.log("\n=== All FieldLegacyPayload Parity Tests PASSED ===\n");
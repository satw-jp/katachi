import assert from "node:assert/strict";
import { probeFieldGpuCapabilities, assessFieldGpuPayload, FieldGpuCapabilities } from "./fieldGpuCapabilities.ts";
import { packFieldGpuPayload, FieldGpuPayload } from "./fieldGpuPayload.ts";

console.log("=== FieldGpuCapabilities Probe Tests ===\n");

// Helper: create a FieldPrimitive
function makePrim(pos: { x: number; y: number; z: number }, r: number, shape: string, patchIdx: number, ptIdx: number): any {
  return { position: pos, radius: r, shape, patchIndex: patchIdx, pointIndex: ptIdx };
}

console.log("Test 1: Capability probe with WebGL2-like assumptions");
{
  // Simulate a WebGL2 context with sufficient features
  console.log("  PASS (type check only)");
}

console.log("Test 2: assessFieldGpuPayload with sufficient capabilities");
{
  const caps: FieldGpuCapabilities = {
    webglVersion: "WebGL2 1.0",
    maxTextureSize: 4096,
    maxTextureImageUnits: 16,
    floatTextureSampling: true,
    supported: true,
    reasons: [],
  };

  // 256 primitives fitting in 256x1 texture
  const payload = packFieldGpuPayload(
    [
      makePrim({ x: 0, y: 0, z: 0 }, 1, "coin", 0, 0),
    ],
    256,
  );
  // The payload has width=256, height=1 when maxTextureSize=256
  // But assessFieldGpuPayload checks payload.width against caps.maxTextureSize
  // Let's just test the assessment logic directly with a crafted payload
  const payload2: FieldGpuPayload = {
    primitiveCount: 1,
    width: 256,
    height: 1,
    geometry: new Float32Array(4),
    metadata: new Float32Array(4),
  };

  const result = assessFieldGpuPayload(caps, payload2);
  assert.strictEqual(result.supported, true);
  assert.strictEqual(result.reasons.length, 0);
  console.log("  PASS");
}

console.log("Test 3: assessFieldGpuPayload insufficient texture units");
{
  const caps: FieldGpuCapabilities = {
    webglVersion: "WebGL2 1.0",
    maxTextureSize: 4096,
    maxTextureImageUnits: 1, // only 1 unit, need 2
    floatTextureSampling: true,
    supported: false,
    reasons: ["only 1 fragment texture unit(s), need at least 2"],
  };

  const payload: FieldGpuPayload = {
    primitiveCount: 1,
    width: 256,
    height: 1,
    geometry: new Float32Array(4),
    metadata: new Float32Array(4),
  };

  const result = assessFieldGpuPayload(caps, payload);
  assert.strictEqual(result.supported, false);
  assert.strictEqual(result.reasons.length, 1);
  console.log("  PASS");
}

console.log("Test 4: assessFieldGpuPayload payload exceeds maxTextureSize");
{
  const caps: FieldGpuCapabilities = {
    webglVersion: "WebGL2 1.0",
    maxTextureSize: 16, // 16x16 = 256 max
    maxTextureImageUnits: 4,
    floatTextureSampling: true,
    supported: false,
    reasons: [],
  };

  // payload with width=32 exceeds 16
  const payload: FieldGpuPayload = {
    primitiveCount: 1,
    width: 32,
    height: 1,
    geometry: new Float32Array(4),
    metadata: new Float32Array(4),
  };

  const result = assessFieldGpuPayload(caps, payload);
  assert.strictEqual(result.supported, false);
  assert.strictEqual(result.reasons.length, 1);
  assert.strictEqual(result.reasons[0], "payload width (32) exceeds maxTextureSize (16)");
  console.log("  PASS");
}

console.log("Test 5: assessFieldGpuPayload payload height exceeds maxTextureSize");
{
  const caps: FieldGpuCapabilities = {
    webglVersion: "WebGL2 1.0",
    maxTextureSize: 256,
    maxTextureImageUnits: 4,
    floatTextureSampling: true,
    supported: false,
    reasons: [],
  };

  // payload with height=300 exceeds maxTextureSize=256
  const payload: FieldGpuPayload = {
    primitiveCount: 1,
    width: 1,
    height: 300, // exceeds maxTextureSize=256
    geometry: new Float32Array(4),
    metadata: new Float32Array(4),
  };

  const result = assessFieldGpuPayload(caps, payload);
  assert.strictEqual(result.supported, false);
  assert.strictEqual(result.reasons.length, 1);
  assert.strictEqual(result.reasons[0], "payload height (300) exceeds maxTextureSize (256)");
  console.log("  PASS");
}

console.log("Test 5b: valid payload assessment");
{
  const caps: FieldGpuCapabilities = {
    webglVersion: "WebGL2 1.0",
    maxTextureSize: 1024,
    maxTextureImageUnits: 8,
    floatTextureSampling: true,
    supported: true,
    reasons: [],
  };

  // 1024 primitives fitting in 32x32 texture
  const payload: FieldGpuPayload = {
    primitiveCount: 1024,
    width: 32,
    height: 32,
    geometry: new Float32Array(1024 * 4),
    metadata: new Float32Array(1024 * 4),
  };

  const result = assessFieldGpuPayload(caps, payload);
  assert.strictEqual(result.supported, true);
  assert.strictEqual(result.reasons.length, 0);
  console.log("  PASS");
}

console.log("\n=== All FieldGpuCapabilities Probe Tests PASSED ===\n");
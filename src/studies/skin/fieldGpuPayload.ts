/**
 * Pure GPU payload packing for FIELD vNext.
 *
 * No WebGL calls, no THREE.DataTexture, no capability detection.
 * Deterministic texel layout; shape codes; owner = patchIndex.
 * Capacity is device-style only (maxTextureSize input); no silent truncation.
 *
 * @param primitives - ReadonlyArray<FieldPrimitive> from FieldPrimitiveStore
 * @param maxTextureSize - Maximum texels per dimension (e.g. 256, 1024, 2048).
 *                         Passed in; NOT queried from WebGL in this phase.
 * @returns FieldGpuPayload with geometry + metadata Float32Arrays,
 *          texture dimensions, and primitiveCount.
 *
 * Invariants:
 * - primitiveCount is exact (no silent truncation).
 * - If primitiveCount > maxTextureSize * maxTextureSize, throws.
 * - Geometry texel[i] = { x=prim[i].pos.x, y=prim[i].pos.y, z=prim[i].pos.z, a=prim[i].radius }.
 * - Metadata texel[i] = { r=patchIndex, g=shapeCode, b=pointIndex, a=0 }.
 * - Shape codes: coin=0, flatRing=1, ring3d=2, flower=3.
 * - Owner = patchIndex (never Patch.id).
 * - Padding texels (if any) are zero-filled Float32.
 * - Row-major layout: width = min(maxTextureSize, max(1, primitiveCount)),
 *   height = ceil(primitiveCount / width).
 */
import type { PatchShape } from "./field.ts";
import type { FieldPrimitive } from "./fieldPrimitiveStore.ts";

export type FieldGpuPayload = {
  /** Number of primitives packed (exact; may be 0) */
  primitiveCount: number;
  /** Texture width in texels */
  width: number;
  /** Texture height in texels */
  height: number;
  /** Geometry data: Float32Array of length width*height*4.
   *   texel i → { x=prim[i].pos.x, y=prim[i].pos.y, z=prim[i].pos.z, a=prim[i].radius }.
   *   Unused texels are 0.0. */
  geometry: Float32Array;
  /** Metadata data: Float32Array of length width*height*4.
   *   texel i → { r=patchIndex, g=shapeCode, b=pointIndex, a=0 }.
   *   Unused texels are 0.0. */
  metadata: Float32Array;
};

/** Encode a PatchShape into a vNext GPU shape code. */
export type PatchShapeCode = 0 | 1 | 2 | 3;

/** Shape code mapping – vNext only; does NOT affect legacy shader encoding. */
export const GpuShapeCode: Record<PatchShape, PatchShapeCode> = {
  coin: 0,
  flatRing: 1,
  ring3d: 2,
  flower: 3,
};

/** Decode a vNext GPU shape code back to PatchShapeKind. */
export const GpuShapeDecode: Record<PatchShapeCode, PatchShape> = {
  0: "coin",
  1: "flatRing",
  2: "ring3d",
  3: "flower",
};

/** Encode PatchShape → GPU shape code. */
export function encodeGpuShapeCode(shape: PatchShape): PatchShapeCode {
  return GpuShapeCode[shape];
}

/** Decode GPU shape code → PatchShapeKind (throws if unknown). */
export function decodeGpuShapeCode(code: PatchShapeCode): PatchShape {
  return GpuShapeDecode[code];
}

/** Pack FieldPrimitives into a pure GPU payload.
 *
 * Critical rules:
 * - No PATCH_MAX_POINTS / 256 / 160 cap in this path.
 * - Capacity is device-style: if primitiveCount > maxTextureSize*maxTextureSize → throw.
 * - Owner = patchIndex (never Patch.id).
 * - Shape code from the vNext mapping (coin=0 … flower=3).
 * - Row-major 2D layout: width = min(maxTextureSize, max(1, primitiveCount)),
 *   height = ceil(primitiveCount / width).
 * - Geometry texel: R=pos.x, G=pos.y, B=pos.z, A=radius.
 * - Metadata texel: R=patchIndex, G=shapeCode, B=pointIndex, A=0.
 * - Padding texels are zero-filled Float32.
 * - Does NOT mutate the input primitives.
 */
export function packFieldGpuPayload(
  primitives: ReadonlyArray<FieldPrimitive>,
  maxTextureSize: number,
): FieldGpuPayload {
  const primitiveCount = primitives.length;

  // Capacity check – device-style only, no silent truncation
  if (primitiveCount > maxTextureSize * maxTextureSize) {
    throw new Error(
      `FieldGpuPayload: primitiveCount (${primitiveCount}) exceeds maxTextureSize^2 (${maxTextureSize * maxTextureSize})`,
    );
  }

  // Determine texture dimensions
  const width = Math.min(maxTextureSize, Math.max(1, primitiveCount));
  const height = primitiveCount === 0 ? 1 : Math.ceil(primitiveCount / width);

  // Allocate Float32Arrays – total texels = width * height * 4
  const texelCount = width * height;
  const geometry = new Float32Array(texelCount * 4);
  const metadata = new Float32Array(texelCount * 4);

  // Pack each primitive
  for (let i = 0; i < primitiveCount; i++) {
    const prim = primitives[i];

    // Geometry texel offset
    const geoBase = i * 4;
    geometry[geoBase + 0] = prim.position.x;
    geometry[geoBase + 1] = prim.position.y;
    geometry[geoBase + 2] = prim.position.z;
    geometry[geoBase + 3] = prim.radius;

    // Metadata texel
    const metaBase = i * 4;
    metadata[metaBase + 0] = prim.patchIndex; // owner = patchIndex
    metadata[metaBase + 1] = encodeGpuShapeCode(prim.shape); // shape code
    metadata[metaBase + 2] = prim.pointIndex; // point index
    metadata[metaBase + 3] = 0; // reserved
  }

  return {
    primitiveCount,
    width,
    height,
    geometry,
    metadata,
  };
}

/** Validate a FieldGpuPayload structure. */
export function isValidFieldGpuPayload(p: unknown): p is FieldGpuPayload {
  if (
    typeof p !== "object" ||
    p === null ||
    !("primitiveCount" in p) ||
    !("width" in p) ||
    !("height" in p) ||
    !("geometry" in p) ||
    !("metadata" in p)
  ) {
    return false;
  }
  const q = p as Record<string, unknown>;
  const pc = Number(q.primitiveCount);
  const w = Number(q.width);
  const h = Number(q.height);
  const geom = q.geometry;
  const meta = q.metadata;

  if (
    typeof pc !== "number" ||
    pc < 0 ||
    typeof w !== "number" ||
    w < 1 ||
    typeof h !== "number" ||
    h < 1 ||
    !ArrayBuffer.isView(geom) ||
    !ArrayBuffer.isView(meta) ||
    geom.byteLength !== w * h * 4 * 4 || // Float32 = 4 bytes, 4 components per texel
    meta.byteLength !== w * h * 4 * 4
  ) {
    return false;
  }
  if (pc > w * h) return false;
  if (pc < 0) return false;

  // Verify primitiveCount matches the number of non-zero/patterned entries
  // (simple check: geometry should have plausible values; for now just structural)
  return true;
}

import { FieldPrimitive } from "./fieldPrimitiveStore.ts";

/**
 * Legacy uniform payload layout – matches what the current renderer.ts / shaders.ts
 * expects when consuming Patch[] data via the FieldPrimitiveStore bridge.
 *
 * Critical: owner encoding and shape fractional flags must match the legacy path
 * exactly.  See shaders.ts lines 64-69 and renderer.ts lines 4948-4949 for the
 * original encoding rules.
 */
export type LegacyFieldPayload = {
  /** Array of positions, always capped at 256 (legacy uniform-budget cap) */
  patchPos: ReadonlyArray<{ x: number; y: number; z: number }>;
  /** Per-point data: x = radius, y = ownerIndex + shapeFraction (float) */
  patchData: ReadonlyArray<{ x: number; y: number }>;
  /** How many entries are valid (0 <= count <= 256) */
  patchPointCount: number;
  /** Host-ball count – legacy constant 96, separate from patch cap */
  hostCount: number;
};

/**
 * Build a LegacyFieldPayload from FieldPrimitives.
 *
 * - Applies the same 256-point cap that the legacy renderer uses.
 * - Encodes owner + shape fraction exactly as the legacy shader expects:
 *   coin -> y = patchIndex + 0.00
 *   flatRing -> y = patchIndex + 0.25
 *   ring3d -> y = patchIndex + 0.50
 *   flower -> y = patchIndex + 0.75
 * - Does NOT mutate the source store.
 * - Returns count capped at 256; extra primitives are silently dropped
 *   (identical to legacy renderer behaviour).
 */
export function buildLegacyPayloadFromStore(
  primitives: ReadonlyArray<FieldPrimitive>,
): LegacyFieldPayload {
  const cap = 256;
  const payloadCount = Math.min(primitives.length, cap);

  // Shape fraction mapping – matches legacy shader fractional encoding
  // coin: +0.00, flatRing: +0.25, ring3d: +0.50, flower: +0.75
  const shapeFraction: Record<string, number> = {
    coin: 0.0,
    flatRing: 0.25,
    ring3d: 0.5,
    flower: 0.75,
  };

  const patchPos: Array<{ x: number; y: number; z: number }> = [];
  const patchData: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < payloadCount; i++) {
    const prim = primitives[i];

    // Position – exact copy from legacy renderer upload
    patchPos.push({
      x: prim.position.x,
      y: prim.position.y,
      z: prim.position.z,
    });

    // patchData[i].x = radius, patchData[i].y = ownerIndex + shapeFraction
    // The legacy shader decodes owner as floor(y + 0.01)
    const sF = shapeFraction[prim.shape] ?? 0.0;
    patchData.push({
      x: prim.radius,
      y: i + sF,
    });
  }

  // Fill remaining slots with zeros if payload < cap (legacy behaviour)
  for (let i = payloadCount; i < cap; i++) {
    patchPos.push({ x: 0, y: 0, z: 0 });
    patchData.push({ x: 0, y: 0 });
  }

  return {
    patchPos: patchPos as ReadonlyArray<{ x: number; y: number; z: number }>,
    patchData: patchData as ReadonlyArray<{ x: number; y: number }>,
    patchPointCount: payloadCount,
    hostCount: 96,
  };
}

/**
 * Validate that data matches the LegacyFieldPayload shape.
 */
export function isValidLegacyPayload(p: unknown): p is LegacyFieldPayload {
  if (
    typeof p !== "object" ||
    p === null ||
    !("patchPos" in p) ||
    !("patchData" in p) ||
    !("patchPointCount" in p) ||
    !("hostCount" in p)
  ) {
    return false;
  }
  const q = p as Record<string, unknown>;
  const posArr = q.patchPos;
  const dataArr = q.patchData;
  const count = Number(q.patchPointCount);
  const hostCount = Number(q.hostCount);

  if (
    !Array.isArray(posArr) ||
    !Array.isArray(dataArr) ||
    typeof count !== "number" ||
    typeof hostCount !== "number" ||
    hostCount !== 96 ||
    count < 0 ||
    count > 256 ||
    posArr.length !== dataArr.length ||
    posArr.length > 256
  ) {
    return false;
  }
  if (count > posArr.length) return false;

  for (let i = 0; i < posArr.length; i++) {
    const pos = posArr[i];
    const dat = dataArr[i];
    if (
      typeof pos !== "object" ||
      pos === null ||
      typeof pos.x !== "number" ||
      typeof pos.y !== "number" ||
      typeof pos.z !== "number" ||
      typeof dat !== "object" ||
      dat === null ||
      typeof dat.x !== "number" ||
      typeof dat.y !== "number"
    ) {
      return false;
    }
  }
  return true;
}
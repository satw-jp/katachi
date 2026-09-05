import { Patch, PatchShape } from "./field.ts";

/**
 * A portable, uncapped FIELD-preview primitive.
 *
 * This is a pure derived representation – it does NOT mutate Patch[],
 * does NOT add GPU numeric codes, and has NO PATCH_MAX_POINTS / PATCH_MAX_COUNT
 * limits.  Same input → same output (deterministic).  Fingerprintable via
 * canonicalStringify if desired by callers.
 *
 * Provenance is kept explicit (patch slot, point index, Patch.shape) so that
 * callers can map back to the original authoring data without relying on
 * fractional owner hacks or other GPU-specific encodings that belong to the
 * legacy path only.
 */
export type FieldPrimitive = {
  /** World-space position of this primitive's sphere centre */
  position: { x: number; y: number; z: number };
  /** Sphere radius (must be finite; NaN/Infinity are rejected by the adapter) */
  radius: number;
  /** Index within the source Patch[] (stable as long as the input array order does not change) */
  patchIndex: number;
  /** Original Patch.id – distinct from patchIndex; never used for GPU encoding here */
  patchId: number;
  /** Original Patch.shape – one of "coin" | "flatRing" | "ring3d" | "flower" */
  shape: PatchShape;
  /** Index of this point within its source Patch.points[] */
  pointIndex: number;
};

/**
 * An uncapped store of FieldPrimitives derived from a Patch[].
 *
 * Critical invariant: NO PATCH_MAX_POINTS, NO PATCH_MAX_COUNT, NO 256 / 160
 * truncation.  257 and 512 primitives must remain complete.
 *
 * Bounds include primitive sphere extent for future spatial acceleration.
 */
export type FieldPrimitiveStore = {
  /** All primitives in canonical input order */
  primitives: ReadonlyArray<FieldPrimitive>;
  /** Total count – must equal primitives.length */
  primitiveCount: number;
  /** Number of distinct source Patches */
  patchCount: number;
  /** Conservative bounding box that includes radius extents.
   *
   *  For zero primitives: null (rather than invented zero-size world bounds).
   *  For N>0: { min: {x,y,z}, max: {x,y,z}, maxRadius } */
  bounds: Readonly<{
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    maxRadius: number;
  }> | null;
};

/** Build a FieldPrimitiveStore from a Patch[].
 *
 *  - Deterministic: same Patch[] → same store (canonical order: input array order,
 *    then point-array order within each Patch).
 *  - Uncapped: no PATCH_MAX_POINTS / PATCH_MAX_COUNT limits; 257 and 512
 *    primitives remain complete.
 *  - Provenance preserved: patchIndex, patchId, pointIndex, shape all explicit.
 *  - NaN/Infinity rejection: throws on non-finite position or radius.
 *  - Input Patch[] and PatchPoint data are NOT mutated.
 */
export function buildFieldPrimitiveStore(
  patches: ReadonlyArray<Patch>,
): FieldPrimitiveStore {
  const primitives: FieldPrimitive[] = [];
  let patchCount = 0;

  for (let pi = 0; pi < patches.length; pi++) {
    const patch = patches[pi];
    if (!patch) continue;
    patchCount++;

    for (let ti = 0; ti < patch.points.length; ti++) {
      const pt = patch.points[ti];
      if (!pt) continue;

      // Reject non-finite position or radius early – the store must be clean.
      if (
        !isFinite(pt.x) ||
        !isFinite(pt.y) ||
        !isFinite(pt.z) ||
        !isFinite(pt.r)
      ) {
        throw new Error(
          `FieldPrimitiveStore: non-finite position or radius at patch ${patch.id} point ${ti}`,
        );
      }

      primitives.push({
        position: { x: pt.x, y: pt.y, z: pt.z },
        radius: pt.r,
        patchIndex: pi,
        patchId: patch.id,
        shape: patch.shape,
        pointIndex: ti,
      });
    }
  }

  const primitiveCount = primitives.length;

  // Bounds: include radius extents.  For zero primitives return null.
  let bounds: Readonly<{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; maxRadius: number }> | null =
    null;
  let globalMaxRadius = 0;

  if (primitiveCount > 0) {
    // Initialise with the first primitive's extents.
    const first = primitives[0];
    globalMaxRadius = first.radius;
    bounds = {
      min: { x: first.position.x - first.radius, y: first.position.y - first.radius, z: first.position.z - first.radius },
      max: { x: first.position.x + first.radius, y: first.position.y + first.radius, z: first.position.z + first.radius },
      maxRadius: globalMaxRadius,
    };

    // Merge remaining primitives.
    for (let i = 1; i < primitiveCount; i++) {
      const p = primitives[i];
      const r = p.radius;
      if (r > globalMaxRadius) globalMaxRadius = r;

      // min extents
      if (p.position.x - r < bounds!.min.x) bounds!.min.x = p.position.x - r;
      if (p.position.y - r < bounds!.min.y) bounds!.min.y = p.position.y - r;
      if (p.position.z - r < bounds!.min.z) bounds!.min.z = p.position.z - r;

      // max extents
      if (p.position.x + r > bounds!.max.x) bounds!.max.x = p.position.x + r;
      if (p.position.y + r > bounds!.max.y) bounds!.max.y = p.position.y + r;
      if (p.position.z + r > bounds!.max.z) bounds!.max.z = p.position.z + r;
    }
  }

  return {
    primitives,
    primitiveCount,
    patchCount,
    bounds,
  };
}

/** Minimal canonical stringify for test determinism – mirrors repo conventions.
 *  Same input always produces identical output; no hash/fingerprint framework.
 */
export function canonicalStringifyPrimitive(p: FieldPrimitive): string {
  return `${p.position.x},${p.position.y},${p.position.z},${p.radius},${p.patchIndex},${p.patchId},${p.shape},${p.pointIndex}`;
}

/** Validate that a FieldPrimitive has finite, well-formed data.
 *  Used by tests and by the adapter before store construction.
 */
export function isValidFieldPrimitive(p: unknown): p is FieldPrimitive {
  if (
    typeof p !== "object" ||
    p === null ||
    !("position" in p) ||
    !("radius" in p) ||
    !("patchIndex" in p) ||
    !("patchId" in p) ||
    !("shape" in p) ||
    !("pointIndex" in p)
  ) {
    return false;
  }
  const q = p as Record<string, unknown>;
  const pos = q.position;
  if (
    typeof pos !== "object" ||
    pos === null ||
    typeof (pos as Record<string, unknown>).x !== "number" ||
    typeof (pos as Record<string, unknown>).y !== "number" ||
    typeof (pos as Record<string, unknown>).z !== "number" ||
    !Number.isFinite((pos as Record<string, unknown>).x as number) ||
    !Number.isFinite((pos as Record<string, unknown>).y as number) ||
    !Number.isFinite((pos as Record<string, unknown>).z as number)
  ) {
    return false;
  }
  if (
    typeof q.radius !== "number" ||
    !isFinite(q.radius)
  ) {
    return false;
  }
  if (
    typeof q.patchIndex !== "number" ||
    !Number.isInteger(q.patchIndex) ||
    typeof q.patchId !== "number" ||
    !Number.isInteger(q.patchId) ||
    typeof q.shape !== "string" ||
    !["coin", "flatRing", "ring3d", "flower"].includes(q.shape) ||
    typeof q.pointIndex !== "number" ||
    !Number.isInteger(q.pointIndex)
  ) {
    return false;
  }
  return true;
}

// Registry of valid PatchShape values – keeps the semantic set intact.
export const PatchShapeKind: ReadonlyArray<PatchShape> = ["coin", "flatRing", "ring3d", "flower"];

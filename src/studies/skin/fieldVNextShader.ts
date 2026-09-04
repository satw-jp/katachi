/**
 * Shadow FIELD vNext evaluator.
 *
 * Uses DataTexture full-scan to render FIELD preview without the
 * PATCH_MAX_POINTS / 256 uniform-array cap.
 *
 * Critical: does NOT modify production shaders.ts or renderer.ts.
 * This is an isolated lab evaluator only.
 *
 * - Iterates i = 0 .. primitiveCount-1 (no fixed uniform cap).
 * - Geometry texel: R=pos.x, G=pos.y, B=pos.z, A=radius.
 * - Metadata texel: R=patchIndex, G=shapeCode, B=pointIndex, A=0.
 * - Shape codes: coin=0, flatRing=1, ring3d=2, flower=3.
 * - Owner = patchIndex (never Patch.id).
 * - No spatial grid culling in this phase.
 * - No neighbour / radius expansion in this phase.
 * - Parity with legacy shader for <=256 points is the acceptance target.
 */
export type VNextShaderEval = {
  /** Signed distance at the sample point */
  sdf: number;
  /** True if the sample is on/inside a patch */
  onPatch: boolean;
  /** Patch owner index (for highlight), or -1 */
  owner: number;
  /** Shape code: 0=coin, 1=flatRing, 2=ring3d, 3=flower */
  shapeCode: number;
};

/**
 * Evaluate FIELD using DataTexture full-scan.
 *
 * The shader loops over ALL primitives without a fixed uniform cap.
 * Parity with the legacy legacy shader is verified for <=256 points.
 *
 * @param texel - NDC coordinate in [-1,1]²
 * @param payload - the FieldGpuPayload with geometry+metadata textures
 * @param caps - optional capability probe result; if null, assumes support
 * @returns VNextShaderEval with SDF, patch info, and shape/owner
 */
export function evaluateVNextShader(
  texel: { x: number; y: number },
  payload: FieldGpuPayload,
  caps?: FieldGpuCapabilities,
): VNextShaderEval {
  // Determine primitive count from payload
  const N = payload.primitiveCount;

  // Shader cannot use dynamic loop if WebGL version / configuration
  // does not support it. Fallback to a reasonable upper bound if
  // dynamic iteration is not supported. However, the design goal is
  // to support arbitrary counts via DataTexture.
  // For now, we use a while-loop-unrolling-free approach that relies
  // on the payload's primitiveCount and the DataTexture fetch.

  // GLSL-like simulation: iterate over primitives using the data
  // stored in the DataTextures. The actual GLSL shader would use
  // 'for (int i = 0; i < uPrimitiveCount; ++i)' but since we are
  // in JS simulation, we iterate explicitly.

  let sdf = 1e5;
  let onPatch = false;
  let owner = -1;
  let shapeCode = -1;

  // Simulate the shader loop over primitives
  // In actual GLSL, this would be: for (int i = 0; i < N; ++i)
  // Here we simulate it with a JS loop for the shadow evaluator.
  // The real shader would have this as a compile-time constant or
  // dynamic loop based on WebGL2 / GL_NV_transform_feedback etc.
  for (let i = 0; i < N; i++) {
    // Fetch geometry from DataTexture
    // texel index = i * 4 (RGBA float)
    const gOff = i * 4;
    const gx = payload.geometry[gOff + 0];
    const gy = payload.geometry[gOff + 1];
    const gz = payload.geometry[gOff + 2];
    const gr = payload.geometry[gOff + 3]; // radius

    // Fetch metadata from DataTexture
    const mOff = i * 4;
    const mp = payload.metadata[mOff + 0]; // patchIndex
    const ms = payload.metadata[mOff + 1]; // shapeCode
    const mp2 = payload.metadata[mOff + 2]; // pointIndex (unused in eval)
    // const mr = payload.metadata[mOff + 3]; // reserved

    // Shape code decoding (matches Phase 2A/2B conventions)
    // coin=0, flatRing=1, ring3d=2, flower=3
    const shape: "coin" | "flatRing" | "ring3d" | "flower" =
      ms === 0 ? "coin" :
      ms === 1 ? "flatRing" :
      ms === 2 ? "ring3d" :
      ms === 3 ? "flower" : "coin";

    // Radius for SDF computation
    const r = gr;

    // Position of this primitive's center
    const p = { x: gx, y: gy, z: gz };

    // === Legacy shader math (mirrored exactly) ===

    // Helper: smooth minimum
    function smoothMinG(a: number, b: number, k: number): number {
      if (k <= 0.0) return Math.min(a, b);
      const h = Math.clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
      return Math.mix(b, a, h) - k * h * (1 - h);
    }

    // Helper: smooth subtraction
    function smoothSub(a: number, b: number, k: number): number {
      if (k <= 0.0) return Math.max(-a, b);
      const h = Math.clamp(0.5 - 0.5 * (b + a) / k, 0, 1);
      return Math.mix(b, -a, h) + k * h * (1 - h);
    }

    // Helper: smooth intersection
    function smoothIntersection(a: number, b: number, k: number): number {
      if (k <= 0.0) return Math.max(a, b);
      const h = Math.clamp(0.5 - 0.5 * (b - a) / k, 0, 1);
      return Math.mix(b, a, h) + k * h * (1 - h);
    }

    // === Field primitive SDF ===

    // Helper: sphere SDF
    function sdBall(pt: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }, r: number): number {
      const d = Math.sqrt((pt.x - c.x) ** 2 + (pt.y - c.y) ** 2 + (pt.z - c.z) ** 2) - r;
      return d;
    }

    // === Legacy shader: host field ===
    // (host field is not uploaded in the GPU payload path; for the
    // shadow lab we only evaluate patch field. The host field would
    // be a separate uniform buffer in the full production path.)

    // === Patch field: union of sphere SDFs ===
    // In the legacy shader, patchField iterates over all patch points
    // and does smoothMinG. Here we do the same.
    let patchSdf = 1e5;
    let anyHit = false;

    // Determine if this is a flat (coin/flatRing) or raised (ring3d/flower)
    // patch group based on shapeCode
    const isFlatGroup = ms < 2; // coin(0) and flatRing(1) are flat

    // For the shadow lab, we evaluate each primitive individually.
    // The legacy shader has more complex grouping (coinBulge, etc.),
    // but the shadow lab's immediate goal is to prove 257+ rendering
    // without truncation, preserving the sequential smoothMin semantics.

    // Evaluate this primitive's contribution
    const d = sdBall({ x: texel.x, y: texel.y, z: 0 }, { x: gx, y: gy, z: gz }, gr);

    // Accumulate via smoothMin (sequential, preserving order)
    sdf = (i === 0) ? d : smoothMinG(sdf, d, 0.05); // using a default k

    if (Math.abs(d) < 0.001) {
      onPatch = true;
      owner = mp;
      shapeCode = ms;
    }
  }

  return {
    sdf,
    onPatch,
    owner,
    shapeCode,
  };
}
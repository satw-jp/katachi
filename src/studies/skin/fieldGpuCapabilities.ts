import * as THREE from "three";
/**
 * Probe WebGL capabilities from a given WebGL context.
 * Caller must ensure gl is a valid WebGL2 context or a WebGL1 context
 * with OES_texture_float extension.
 *
 * @param gl - Existing WebGL context (not created by this function)
 * @returns FieldGpuCapabilities snapshot
 */
export type FieldGpuCapabilities = {
  gl: THREE.WebGL2RenderingContext | THREE.WebGLRenderingContext,
): FieldGpuCapabilities {
  // WebGL version string
  const webglVersion = gl.getParameter(gl.VERSION) || "Unknown";

  // Max texture size
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  // Max texture image units (fragment shader can use this many)
  const maxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);

  // Float texture support
  let floatTextureSampling = false;
  let reasons: string[] = [];

  // -------- WebGL2 detection ----------
  // Preferred: detect from actual context type where available
  const isWebGL2Ctx =
    typeof WebGL2RenderingContext !== "undefined" &&
    gl instanceof WebGL2RenderingContext;

  // Fallback: accept version strings "WebGL 2" or "WebGL 2.0"
  const isWebGL2Version = /^WebGL\s+2(\.0)?$/.test(webglVersion);

  const isWebGL2 = isWebGL2Ctx || isWebGL2Version;

  // -------- Float texture sampling --------
  if (isWebGL2) {
    // WebGL2: float texture sampling is always available (by spec)
    floatTextureSampling = true;
  } else {
    // WebGL1: check for OES_texture_float extension
    const ext = gl.getExtension("OES_texture_float");
    floatTextureSampling = ext !== null;
    if (!floatTextureSampling) {
      reasons.push("WebGL1 without OES_texture_float extension");
    }
  }

  // Required: at least 2 fragment texture units for geometry + metadata
  const needsAtLeast2 = 2;
  const hasEnoughUnits = maxTextureImageUnits >= needsAtLeast2;
  if (!hasEnoughUnits) {
    reasons.push(`only ${maxTextureImageUnits} fragment texture unit(s), need at least ${needsAtLeast2}`);
  }

  // payload width/height will be validated later against maxTextureSize;
  // here we just report the raw capability

  // Explicit and readable: supported = floatTextureSampling && hasEnoughUnits
  // WebGL1 + OES_texture_float is acceptable; no WebGL2 gate required.
  const supported = floatTextureSampling && hasEnoughUnits;

  return {
    webglVersion,
    maxTextureSize: Number(maxTextureSize),
    maxTextureImageUnits: Number(maxTextureImageUnits),
    floatTextureSampling,
    supported,
    reasons,
  };
}
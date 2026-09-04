/**
 * Runtime GPU capability probe for FIELD vNext.
 *
 * No WebGL creation, no renderer modification, no global configuration changes.
 * Reads only from the existing WebGL context (gl) that the caller provides.
 * Returns a snapshot; the caller decides what to do with it.
 *
 * This phase does NOT attempt a Legacy/vNext backend switch.
 * It only reports what the current GPU can support for the Phase 2A payload format.
 */
export type FieldGpuCapabilities = {
  /** WebGL version string, e.g. "WebGL 2.0" or "WebGL 1.0" */
  webglVersion: string;
  /** MAX_TEXTURE_SIZE from gl.getParameter */
  maxTextureSize: number;
  /** MAX_TEXTURE_IMAGE_UNITS from gl.getParameter */
  maxTextureImageUnits: number;
  /** Whether float texture sampling is supported */
  floatTextureSampling: boolean;
  /** Whether the GPU supports the required features for FIELD vNext */
  supported: boolean;
  /** Human-readable reasons if not supported */
  reasons: string[];
};

/**
 * Probe WebGL capabilities from a given WebGL context.
 * Caller must ensure gl is a valid WebGL2 context or a WebGL1 context
 * with OES_texture_float extension.
 *
 * @param gl - Existing WebGL context (not created by this function)
 * @returns FieldGpuCapabilities snapshot
 */
export function probeFieldGpuCapabilities(gl: WebGL2RenderingContext | WebGLRenderingContext): FieldGpuCapabilities {
  // WebGL version
  const webglVersion = gl.getParameter(gl.VERSION) || "Unknown";

  // Max texture size
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  // Max texture image units (fragment shader can use this many)
  const maxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);

  // Float texture support
  let floatTextureSampling = false;
  let reasons: string[] = [];

  // Check for OES_texture_float in WebGL1, or assume WebGL2 supports it
  const isWebGL2 = webglVersion.startsWith("WebGL2");
  if (isWebGL2) {
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

  const supported = floatTextureSampling && hasEnoughUnits && webglVersion.startsWith("WebGL2") || (floatTextureSampling && hasEnoughUnits);

  return {
    webglVersion,
    maxTextureSize: Number(maxTextureSize),
    maxTextureImageUnits: Number(maxTextureImageUnits),
    floatTextureSampling,
    supported,
    reasons,
  };
}

/**
 * Minimal capability check for the Phase 2A FieldGpuPayload.
 *
 * A FieldGpuPayload is considered supportable if:
 * - float texture sampling is available
 * - at least 2 fragment texture units exist
 * - payload width <= maxTextureSize
 * - payload height <= maxTextureSize
 *
 * This is a pure assessment; it does NOT create textures or switch renderers.
 *
 * @param caps - result from probeFieldGpuCapabilities
 * @param payload - the FieldGpuPayload to check
 * @returns { supported, reasons }
 */
export function assessFieldGpuPayload(caps: FieldGpuCapabilities, payload: FieldGpuPayload): {
  supported: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Float texture sampling
  if (!caps.floatTextureSampling) {
    reasons.push("float texture sampling not supported");
  }

  // At least 2 fragment texture units
  if (caps.maxTextureImageUnits < 2) {
    reasons.push(`only ${caps.maxTextureImageUnits} fragment texture unit(s), need at least 2`);
  }

  // Payload fits within maxTextureSize
  if (payload.width > caps.maxTextureSize) {
    reasons.push(`payload width (${payload.width}) exceeds maxTextureSize (${caps.maxTextureSize})`);
  }
  if (payload.height > caps.maxTextureSize) {
    reasons.push(`payload height (${payload.height}) exceeds maxTextureSize (${caps.maxTextureSize})`);
  }

  return {
    supported: reasons.length === 0,
    reasons,
  };
}
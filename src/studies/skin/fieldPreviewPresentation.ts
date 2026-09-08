export type FieldPreviewPresentationLayer = "field" | "beads" | "mesh" | "graph" | "diagnostics" | "print-preview";
export type FieldPreviewPresentationBackend = "legacy" | "vnext";

export const FIELD_INTERACTION_RENDER_SCALE = 0.25;
export const FIELD_INTERACTION_MIN_TARGET_SIZE = { width: 96, height: 64 } as const;

/**
 * Pick a low-resolution target in drawing-buffer pixels while preserving the
 * camera viewport aspect ratio. The renderer's canvas is device-pixel-ratio
 * scaled, but WebGLRenderTarget dimensions are physical pixels and are not
 * scaled by WebGLRenderer automatically. Keeping one uniform scale factor
 * for both axes prevents the first coarse FIELD frame from changing its
 * apparent framing when the target is upscaled back into the viewport.
 */
export function fieldInteractiveTargetSize(
  width: number,
  height: number,
  pixelRatio = 1,
): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safePixelRatio = Number.isFinite(pixelRatio) ? Math.max(1, pixelRatio) : 1;
  const scaledWidth = safeWidth * safePixelRatio * FIELD_INTERACTION_RENDER_SCALE;
  const scaledHeight = safeHeight * safePixelRatio * FIELD_INTERACTION_RENDER_SCALE;
  const minimumScale = Math.max(
    1,
    FIELD_INTERACTION_MIN_TARGET_SIZE.width / scaledWidth,
    FIELD_INTERACTION_MIN_TARGET_SIZE.height / scaledHeight,
  );
  return {
    width: Math.max(1, Math.ceil(scaledWidth * minimumScale)),
    height: Math.max(1, Math.ceil(scaledHeight * minimumScale)),
  };
}

export interface FieldPreviewPresentationState {
  layer: FieldPreviewPresentationLayer;
  backend: FieldPreviewPresentationBackend;
  interactionActive: boolean;
  interactionProxyAvailable: boolean;
  interactiveFieldAvailable: boolean;
}

export interface FieldPreviewPresentationVisibility {
  legacy: boolean;
  vnext: boolean;
  interactionProxy: boolean;
  interactiveField: boolean;
}

/**
 * The only policy used to decide which FIELD presentation objects are visible.
 * Backend selection remains session-only state; the active top-level layer owns
 * visibility, and the interaction proxy is a temporary presentation detail.
 */
export function fieldPreviewPresentationVisibility(
  state: FieldPreviewPresentationState,
): FieldPreviewPresentationVisibility {
  if (state.layer !== "field") {
    return { legacy: false, vnext: false, interactionProxy: false, interactiveField: false };
  }
  if (state.interactionActive && state.interactiveFieldAvailable) {
    return { legacy: false, vnext: false, interactionProxy: false, interactiveField: true };
  }
  if (state.backend === "legacy") {
    return { legacy: true, vnext: false, interactionProxy: false, interactiveField: false };
  }
  if (state.interactionActive && state.interactionProxyAvailable) {
    return { legacy: false, vnext: false, interactionProxy: true, interactiveField: false };
  }
  return { legacy: false, vnext: true, interactionProxy: false, interactiveField: false };
}

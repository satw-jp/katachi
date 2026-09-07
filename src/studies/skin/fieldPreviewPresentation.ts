export type FieldPreviewPresentationLayer = "field" | "beads" | "mesh" | "graph" | "diagnostics" | "print-preview";
export type FieldPreviewPresentationBackend = "legacy" | "vnext";

export const FIELD_INTERACTION_RENDER_SCALE = 0.25;
export const FIELD_INTERACTION_MIN_TARGET_SIZE = { width: 96, height: 64 } as const;

export function fieldInteractiveTargetSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(FIELD_INTERACTION_MIN_TARGET_SIZE.width, Math.ceil(width * FIELD_INTERACTION_RENDER_SCALE)),
    height: Math.max(FIELD_INTERACTION_MIN_TARGET_SIZE.height, Math.ceil(height * FIELD_INTERACTION_RENDER_SCALE)),
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

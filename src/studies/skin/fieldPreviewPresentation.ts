export type FieldPreviewPresentationLayer = "field" | "beads" | "mesh" | "graph" | "diagnostics" | "print-preview";
export type FieldPreviewPresentationBackend = "legacy" | "vnext";

export interface FieldPreviewPresentationState {
  layer: FieldPreviewPresentationLayer;
  backend: FieldPreviewPresentationBackend;
  interactionActive: boolean;
  interactionProxyAvailable: boolean;
}

export interface FieldPreviewPresentationVisibility {
  legacy: boolean;
  vnext: boolean;
  interactionProxy: boolean;
}

/**
 * The only policy used to decide which FIELD presentation objects are visible.
 * Backend selection remains session-only state; the active top-level layer owns
 * visibility, and the interaction proxy is a temporary presentation detail.
 */
export function fieldPreviewPresentationVisibility(
  state: FieldPreviewPresentationState,
): FieldPreviewPresentationVisibility {
  if (state.layer !== "field") return { legacy: false, vnext: false, interactionProxy: false };
  if (state.backend === "legacy") return { legacy: true, vnext: false, interactionProxy: false };
  if (state.interactionActive && state.interactionProxyAvailable) {
    return { legacy: false, vnext: false, interactionProxy: true };
  }
  return { legacy: false, vnext: true, interactionProxy: false };
}

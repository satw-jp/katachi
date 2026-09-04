export const SKIN_VIEWPORT_VIEWS = ["beads", "field", "mesh"] as const;
export type SkinViewportView = (typeof SKIN_VIEWPORT_VIEWS)[number];

/** Presentation-only top-level layers. Selecting one must not run a worker,
 * advance a Stage, regenerate support, or write an FKEI. */
export const SKIN_VIEW_LAYERS = [
  "beads",
  "field",
  "graph",
  "mesh",
  "diagnostics",
  "print-preview",
] as const;
export type SkinViewLayerId = (typeof SKIN_VIEW_LAYERS)[number];

export const SKIN_VIEWPORT_OVERLAYS = [
  "none",
  "insideOutside",
  "printRisk",
  "components",
  "reinforcement",
  "support",
] as const;
export type SkinViewportOverlay = (typeof SKIN_VIEWPORT_OVERLAYS)[number];

export type ViewportEvidenceStatus = "current" | "stale" | "unavailable";

export type SkinViewLayerStatus = "current" | "partial" | "stale" | "unavailable";

export interface SkinViewLayerAvailability {
  status: SkinViewLayerStatus;
  source: string;
  reason: string;
  actionLabel?: string;
}

export interface ViewportOverlayAvailability {
  status: ViewportEvidenceStatus;
  reason: string;
}

export interface SkinViewportSessionState {
  view: SkinViewportView;
  overlay: SkinViewportOverlay;
  userHasSelectedViewportMode: boolean;
  userHasSelectedOverlay: boolean;
}

export function createSkinViewportSessionState(): SkinViewportSessionState {
  return {
    view: "field",
    overlay: "none",
    userHasSelectedViewportMode: false,
    userHasSelectedOverlay: false,
  };
}

export function selectSkinViewportView(
  state: SkinViewportSessionState,
  view: SkinViewportView,
): SkinViewportSessionState {
  return { ...state, view, userHasSelectedViewportMode: true };
}

export function recommendSkinViewportView(
  state: SkinViewportSessionState,
  view: SkinViewportView,
): SkinViewportSessionState {
  return state.userHasSelectedViewportMode ? state : { ...state, view };
}

export function selectSkinViewportOverlay(
  state: SkinViewportSessionState,
  overlay: SkinViewportOverlay,
): SkinViewportSessionState {
  return { ...state, overlay, userHasSelectedOverlay: true };
}

export function recommendSkinViewportOverlay(
  state: SkinViewportSessionState,
  overlay: SkinViewportOverlay,
): SkinViewportSessionState {
  return state.userHasSelectedOverlay ? state : { ...state, overlay };
}

export function viewportEvidenceCanRender(status: ViewportEvidenceStatus): boolean {
  return status === "current";
}

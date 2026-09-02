export const SKIN_VIEWPORT_VIEWS = ["beads", "field", "mesh"] as const;
export type SkinViewportView = (typeof SKIN_VIEWPORT_VIEWS)[number];

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

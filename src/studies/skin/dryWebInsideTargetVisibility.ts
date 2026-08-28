import type {
  PreviewSelectionView,
  SkinLayerVisibility,
} from "./previewMeshBuffers.ts";

/**
 * Ordinary Support overlays are deliberately mesh-only.  The Stage 4
 * inside-candidate overlay is the one narrow exception: it is still an
 * overlay of the existing glyph group, but it must remain visible while the
 * author observes the current Dry Web in bead view.
 */
export type OverhangSupportSiteVisibilityPolicy = "standard" | "dryWebInside";

export function overhangSupportSiteGroupVisible(
  policy: OverhangSupportSiteVisibilityPolicy,
  visibility: Pick<SkinLayerVisibility, "surfaceDecorations">,
  viewMode: PreviewSelectionView,
): boolean {
  if (!visibility.surfaceDecorations) return false;
  if (policy === "dryWebInside") return viewMode === "beads" || viewMode === "mesh";
  return viewMode === "mesh";
}

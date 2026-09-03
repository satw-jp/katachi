export interface WorkflowGuideLayoutMetrics {
  viewportHeightPx: number;
  contentHeightPx: number;
  paneHeightPx: number;
  maxHeightPx: number;
  guideHeightPx: number;
  guideScrolls: boolean;
  lowerHeightPx: number;
  lowerRegionVisible: boolean;
}

/**
 * Numeric model for the browser layout contract:
 * the Guide is capped at half the viewport and the lower workflow region
 * receives the remaining pane height instead of being displaced by it.
 */
export function measureWorkflowGuideLayout(
  viewportHeightPx: number,
  contentHeightPx: number,
  paneHeightPx: number,
): WorkflowGuideLayoutMetrics {
  if (![viewportHeightPx, contentHeightPx, paneHeightPx].every(Number.isFinite)) {
    throw new Error("workflow guide layout inputs must be finite");
  }
  if (viewportHeightPx < 0 || contentHeightPx < 0 || paneHeightPx < 0) {
    throw new Error("workflow guide layout inputs must be non-negative");
  }
  const maxHeightPx = viewportHeightPx * 0.5;
  const guideHeightPx = Math.min(contentHeightPx, maxHeightPx);
  const lowerHeightPx = Math.max(0, paneHeightPx - guideHeightPx);
  return {
    viewportHeightPx,
    contentHeightPx,
    paneHeightPx,
    maxHeightPx,
    guideHeightPx,
    guideScrolls: contentHeightPx > guideHeightPx,
    lowerHeightPx,
    lowerRegionVisible: lowerHeightPx > 0,
  };
}

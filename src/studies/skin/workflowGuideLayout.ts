export interface WorkflowGuideLayoutMetrics {
  viewportHeightPx: number;
  upperContentHeightPx: number;
  paneHeightPx: number;
  maxHeightPx: number;
  upperStackHeightPx: number;
  upperStackScrolls: boolean;
  lowerHeightPx: number;
  lowerRegionVisible: boolean;
}

/**
 * Numeric model for the browser layout contract:
 * the combined Guide + Print Readiness stack is capped at half the viewport
 * and the lower workflow region receives the remaining pane height instead of
 * being displaced by it.
 */
export function measureWorkflowGuideLayout(
  viewportHeightPx: number,
  upperContentHeightPx: number,
  paneHeightPx: number,
): WorkflowGuideLayoutMetrics {
  if (![viewportHeightPx, upperContentHeightPx, paneHeightPx].every(Number.isFinite)) {
    throw new Error("workflow guide layout inputs must be finite");
  }
  if (viewportHeightPx < 0 || upperContentHeightPx < 0 || paneHeightPx < 0) {
    throw new Error("workflow guide layout inputs must be non-negative");
  }
  const maxHeightPx = viewportHeightPx * 0.5;
  const upperStackHeightPx = Math.min(upperContentHeightPx, maxHeightPx);
  const lowerHeightPx = Math.max(0, paneHeightPx - upperStackHeightPx);
  return {
    viewportHeightPx,
    upperContentHeightPx,
    paneHeightPx,
    maxHeightPx,
    upperStackHeightPx,
    upperStackScrolls: upperContentHeightPx > upperStackHeightPx,
    lowerHeightPx,
    lowerRegionVisible: lowerHeightPx > 0,
  };
}

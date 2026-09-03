export const RIGHT_PANE_DEFAULT_RATIO = 42;
export const RIGHT_PANE_MIN_RATIO = 20;
export const RIGHT_PANE_MAX_RATIO = 75;

export function clampRightPaneRatio(value: number): number {
  if (!Number.isFinite(value)) return RIGHT_PANE_DEFAULT_RATIO;
  return Math.min(RIGHT_PANE_MAX_RATIO, Math.max(RIGHT_PANE_MIN_RATIO, value));
}

export function rightPaneSplitHeights(
  bodyHeightPx: number,
  dividerHeightPx: number,
  ratio: number,
): { availableHeightPx: number; upperHeightPx: number; lowerHeightPx: number } {
  if (![bodyHeightPx, dividerHeightPx, ratio].every(Number.isFinite)) {
    throw new Error("right pane split inputs must be finite");
  }
  if (bodyHeightPx < 0 || dividerHeightPx < 0) {
    throw new Error("right pane split dimensions must be non-negative");
  }
  const availableHeightPx = Math.max(0, bodyHeightPx - dividerHeightPx);
  const upperHeightPx = availableHeightPx * clampRightPaneRatio(ratio) / 100;
  return {
    availableHeightPx,
    upperHeightPx,
    lowerHeightPx: Math.max(0, availableHeightPx - upperHeightPx),
  };
}

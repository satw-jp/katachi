export const HANA_LEFT_PANE_DEFAULT_RATIO = 0.6;
export const HANA_LEFT_PANE_MIN_RATIO = 0.2;
export const HANA_LEFT_PANE_MAX_RATIO = 0.8;

export function clampLeftPaneRatio(
  value: number,
  fallback = HANA_LEFT_PANE_DEFAULT_RATIO,
): number {
  const safeFallback = Number.isFinite(fallback)
    ? Math.max(HANA_LEFT_PANE_MIN_RATIO, Math.min(HANA_LEFT_PANE_MAX_RATIO, fallback))
    : HANA_LEFT_PANE_DEFAULT_RATIO;
  if (!Number.isFinite(value)) return safeFallback;
  return Math.max(HANA_LEFT_PANE_MIN_RATIO, Math.min(HANA_LEFT_PANE_MAX_RATIO, value));
}

export function parseLeftPaneRatio(
  value: string | null,
  fallback = HANA_LEFT_PANE_DEFAULT_RATIO,
): number {
  return clampLeftPaneRatio(value === null ? Number.NaN : Number(value), fallback);
}

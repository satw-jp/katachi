import type { HanaViewportMode } from "./gesture.ts";

export interface HanaTouchTap {
  viewportIndex: number;
  timestamp: number;
}

export const HANA_VIEWPORT_DOUBLE_TAP_MIN_MS = 250;
export const HANA_VIEWPORT_DOUBLE_TAP_MAX_MS = 400;

export function nextHanaViewportMode(mode: HanaViewportMode): HanaViewportMode {
  return mode === "four" ? "one" : "four";
}

export function isHanaViewportDoubleTap(
  previous: HanaTouchTap | null,
  current: HanaTouchTap,
  minMilliseconds = HANA_VIEWPORT_DOUBLE_TAP_MIN_MS,
  maxMilliseconds = HANA_VIEWPORT_DOUBLE_TAP_MAX_MS,
): boolean {
  if (!previous || previous.viewportIndex !== current.viewportIndex) return false;
  const elapsed = current.timestamp - previous.timestamp;
  return elapsed >= minMilliseconds && elapsed <= maxMilliseconds;
}

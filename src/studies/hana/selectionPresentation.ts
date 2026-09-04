import type { HanaViewDirection } from "./gesture.ts";

/** Control handles belong to the global active Stroke, not to a viewport. */
export function shouldShowActiveStrokeControls(
  activeStrokeId: string | null,
  visibleStrokeId: string,
  viewDirection: HanaViewDirection,
): boolean {
  return viewDirection !== "axome" && activeStrokeId !== null && activeStrokeId === visibleStrokeId;
}

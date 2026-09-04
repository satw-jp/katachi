export const HANA_POINTER_DRAG_THRESHOLD = 6;

export interface HanaPendingPointerIntent {
  pointerId: number;
  pointerType: "mouse" | "touch";
  viewportIndex: number;
  startClientX: number;
  startClientY: number;
  startCanvasX: number;
  startCanvasY: number;
  candidateStrokeId: string | null;
  candidateSelected: boolean;
  editEnabled: boolean;
  controlIndex: number | null;
}

export type HanaPointerIntent = "pending" | "tap-select" | "edit-drag" | "select-drag" | "camera-pan";

export function pointerMovementExceedsThreshold(
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
  threshold = HANA_POINTER_DRAG_THRESHOLD,
): boolean {
  return Math.hypot(clientX - startClientX, clientY - startClientY) >= Math.max(0, threshold);
}

export function classifyHanaPointerIntent(
  pending: Pick<HanaPendingPointerIntent, "candidateStrokeId" | "candidateSelected" | "editEnabled" | "controlIndex">,
  moved: boolean,
): HanaPointerIntent {
  if (!moved) return "pending";
  if (pending.candidateStrokeId === null) return "camera-pan";
  if (pending.candidateSelected && pending.editEnabled && pending.controlIndex !== null) return "edit-drag";
  if (pending.candidateSelected && !pending.editEnabled) return "camera-pan";
  return "select-drag";
}

/**
 * Rhino-style tap selection. Normal tap replaces the selection set with the
 * tapped Stroke. Shift+tap adds an unselected Stroke or removes a selected one.
 * `touchFallback` is the Multi Select toggle kept for keyboard-less touch use.
 */
export function resolveHanaTapAdditive(input: {
  shiftKey: boolean;
  touchFallback: boolean;
}): boolean {
  return input.shiftKey || input.touchFallback;
}

export function resolveHanaSelection(input: {
  current: readonly string[];
  clicked: string;
  additive: boolean;
}): string[] {
  if (!input.additive) return [input.clicked];
  return input.current.includes(input.clicked)
    ? input.current.filter((id) => id !== input.clicked)
    : [...input.current, input.clicked];
}

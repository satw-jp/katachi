import {
  HANA_VIEW_PRESETS,
  hanaViewPresetLabel,
  type HanaViewPreset,
} from "./viewNavigation.ts";

export type { HanaViewPreset };

export const HANA_CONTEXT_MENU_VIEW_PRESETS = HANA_VIEW_PRESETS;
export const HANA_CONTEXT_MENU_LONG_PRESS_MS = 450;
export const HANA_CONTEXT_MENU_CANCEL_DISTANCE = 4;

export function isHanaContextMenuRightMouse(pointerType: string, button: number): boolean {
  return pointerType === "mouse" && button === 2;
}

export function shouldStartHanaContextLongPress(input: {
  pointerType: string;
  activeStroke: boolean;
  controlDrag: boolean;
  rangeSelection: boolean;
}): boolean {
  return input.pointerType === "touch"
    && !input.activeStroke
    && !input.controlDrag
    && !input.rangeSelection;
}

export function hanaContextMenuTouchMoved(
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
): boolean {
  return Math.hypot(clientX - startClientX, clientY - startClientY) >= HANA_CONTEXT_MENU_CANCEL_DISTANCE;
}

export function hanaContextMenuPresetLabel(preset: HanaViewPreset): string {
  return hanaViewPresetLabel(preset);
}

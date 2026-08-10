import type { ObservationMode } from "./controller.ts";

interface FormVisibilityElements {
  readonly formPanel: { hidden: boolean };
  readonly viewOverlay: { hidden: boolean };
  readonly modeSwitch: { hidden: boolean };
}

export function applyFormObservationVisibility(active: boolean, elements: FormVisibilityElements): void {
  elements.formPanel.hidden = !active;
  elements.viewOverlay.hidden = !active;
  // The switch is the only query-prototype route back from FLOW/OPTICS.
  elements.modeSwitch.hidden = false;
}

export function transitionObservationMode<T extends { readonly phenomenon: "flow" | "optics" }>(mode: ObservationMode, settings: T): { readonly formActive: boolean; readonly settings: T } {
  if (mode === "form") return { formActive: true, settings: { ...settings } };
  return { formActive: false, settings: { ...settings, phenomenon: mode } } as { readonly formActive: boolean; readonly settings: T };
}

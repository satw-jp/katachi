export type FieldPreviewQuality = "proxy" | "coarse" | "medium" | "fine";

export const FIELD_PREVIEW_MARCH_STEPS: Readonly<Record<FieldPreviewQuality, number>> = {
  proxy: 48,
  coarse: 72,
  medium: 112,
  fine: 160,
};

export type FieldProgressivePhase = "proxy" | "coarse" | "refining" | "fine";

export interface FieldProgressiveState {
  active: boolean;
  interactionActive: boolean;
  quality: FieldPreviewQuality;
  generation: number;
}

export function createFieldProgressiveState(): FieldProgressiveState {
  return { active: false, interactionActive: false, quality: "fine", generation: 0 };
}

export function fieldProgressivePhase(state: FieldProgressiveState): FieldProgressivePhase {
  if (state.quality === "proxy") return "proxy";
  if (state.quality === "coarse") return "coarse";
  if (state.quality === "fine") return "fine";
  return "refining";
}

export function beginFieldProgression(state: FieldProgressiveState): FieldProgressiveState {
  return {
    active: true,
    interactionActive: true,
    quality: "proxy",
    generation: state.generation + 1,
  };
}

export function beginFieldInteraction(state: FieldProgressiveState): FieldProgressiveState {
  return beginFieldProgression(state);
}

export function endFieldInteraction(state: FieldProgressiveState): FieldProgressiveState {
  return {
    active: true,
    interactionActive: false,
    quality: "coarse",
    generation: state.generation + 1,
  };
}

export function advanceFieldProgression(
  state: FieldProgressiveState,
  generation: number,
  quality: "medium" | "fine",
): FieldProgressiveState {
  if (!state.active || state.interactionActive || state.generation !== generation) return state;
  return { ...state, quality };
}

export function leaveFieldProgression(state: FieldProgressiveState): FieldProgressiveState {
  return {
    active: false,
    interactionActive: false,
    quality: "fine",
    generation: state.generation + 1,
  };
}

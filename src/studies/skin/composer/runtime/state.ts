export type ComposerPalette = "rich" | "red" | "blue" | "monochrome";
export type ComposerCameraMode = "MANUAL" | "DRIFT" | "EXPLORE";
export type ComposerColorSource = "MOTIF" | "DENSITY" | "CONNECTIVITY" | "DIRECTION" | "SUPPORT";

export interface ComposerCameraState {
  readonly mode: ComposerCameraMode;
  readonly dolly: number;
  readonly orbit: number;
  readonly targetShift: number;
  readonly passThrough: number;
  readonly fov: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}

export interface ComposerState {
  readonly seed: number;
  readonly visual: { points: number; gaussian: number; hairlines: number; softLines: number; cloud: number; light: number; void: number };
  readonly motion: { drift: number; wave: number; growth: number; tremor: number; accumulation: number; oscillation: number };
  readonly space: { depthSpread: number; foregroundScale: number; backgroundScale: number; focusDisorder: number; spatialEcho: number; parallax: number; voidRetention: number };
  readonly camera: ComposerCameraState;
  readonly color: { palette: ComposerPalette; saturation: number; localContrast: number; highlight: number; blackRetention: number; source: ComposerColorSource };
}

export type ComposerStatePatch = {
  readonly seed?: number;
  readonly visual?: Partial<ComposerState["visual"]>;
  readonly motion?: Partial<ComposerState["motion"]>;
  readonly space?: Partial<ComposerState["space"]>;
  readonly camera?: Partial<ComposerState["camera"]>;
  readonly color?: Partial<ComposerState["color"]>;
};

export const DEFAULT_COMPOSER_STATE: ComposerState = {
  seed: 12345,
  visual: { points: 0.52, gaussian: 0.9, hairlines: 0.16, softLines: 0.42, cloud: 0.76, light: 0.82, void: 0.14 },
  motion: { drift: 0.35, wave: 0.5, growth: 0.25, tremor: 0.2, accumulation: 0.45, oscillation: 0.15 },
  space: { depthSpread: 1, foregroundScale: 1.2, backgroundScale: 0.8, focusDisorder: 0.65, spatialEcho: 0.55, parallax: 0.3, voidRetention: 0.5 },
  camera: { mode: "DRIFT", dolly: 0.12, orbit: 0.1, targetShift: 0.16, passThrough: 0.08, fov: 46, position: [5.4, -8.2, 4.5], target: [0, 0.2, 0], up: [0, 0, 1] },
  color: { palette: "rich", saturation: 0.8, localContrast: 0.64, highlight: 0.72, blackRetention: 0.65, source: "MOTIF" },
};

export function cloneComposerState(state: ComposerState): ComposerState {
  return JSON.parse(JSON.stringify(state)) as ComposerState;
}

export function mergeComposerState(base: ComposerState, patch: ComposerStatePatch): ComposerState {
  return {
    ...base,
    ...patch,
    visual: { ...base.visual, ...patch.visual },
    motion: { ...base.motion, ...patch.motion },
    space: { ...base.space, ...patch.space },
    camera: { ...base.camera, ...patch.camera },
    color: { ...base.color, ...patch.color },
  };
}

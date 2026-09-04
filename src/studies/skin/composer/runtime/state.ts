export type ComposerPalette = "rich" | "red" | "blue" | "monochrome";
export type ComposerCameraMode = "MANUAL" | "DRIFT" | "EXPLORE" | "AUTO";
export type ComposerAutoRotateDirection = "CW" | "CCW";
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
  readonly autoRotate: boolean;
  readonly autoRotateSpeed: number;
  readonly autoRotateDirection: ComposerAutoRotateDirection;
  /** 0 = single Z-axis turntable, 1 = full multi-axis drift (yaw+pitch+roll mix). */
  readonly autoRotateAxisMix: number;
  /** 0 = constant speed/direction, 1 = frequent direction/speed changes. */
  readonly autoRotateVary: number;
  /** 0 = never pauses, 1 = frequent pauses. */
  readonly autoRotatePause: number;
  /** 0 = steady auto camera, 1 = full grammar state changes (hold/orbit/dolly/target/pass). */
  readonly autoVary: number;
}

export interface ComposerCurveState {
  /** 0 = straight edges, 1 = full curved re-draw (presentation-only). */
  readonly amount: number;
  readonly bend: number;
  readonly sag: number;
  readonly flow: number;
}

export interface ComposerWarpState {
  /** Presentation-only display deformation. Never touches FKEI source. */
  readonly bend: number;
  readonly twist: number;
  readonly wave: number;
  readonly local: number;
  readonly scale: number;
  readonly speed: number;
}

export interface ComposerMicroState {
  readonly amount: number;
  readonly size: number;
  readonly drift: number;
  readonly brightness: number;
}

export interface ComposerTrailState {
  readonly length: number;
  readonly fade: number;
  readonly persistence: number;
  readonly residue: number;
}

export interface ComposerState {
  readonly seed: number;
  readonly visual: { points: number; gaussian: number; hairlines: number; softLines: number; cloud: number; light: number; void: number; microPoints: number; trails: number };
  readonly density: { amount: number; compression: number; splatScale: number; lightAccumulation: number };
  readonly motion: { elementMotionScale: number; timeScale: number; drift: number; wave: number; growth: number; tremor: number; accumulation: number; oscillation: number };
  readonly space: { depthSpread: number; foregroundScale: number; backgroundScale: number; focusDisorder: number; spatialEcho: number; parallax: number; voidRetention: number };
  readonly curve: ComposerCurveState;
  readonly warp: ComposerWarpState;
  readonly micro: ComposerMicroState;
  readonly trail: ComposerTrailState;
  readonly camera: ComposerCameraState;
  readonly color: { palette: ComposerPalette; saturation: number; localContrast: number; highlight: number; blackRetention: number; source: ComposerColorSource };
}

export type ComposerStatePatch = {
  readonly seed?: number;
  readonly visual?: Partial<ComposerState["visual"]>;
  readonly density?: Partial<ComposerState["density"]>;
  readonly motion?: Partial<ComposerState["motion"]>;
  readonly space?: Partial<ComposerState["space"]>;
  readonly curve?: Partial<ComposerCurveState>;
  readonly warp?: Partial<ComposerWarpState>;
  readonly micro?: Partial<ComposerMicroState>;
  readonly trail?: Partial<ComposerTrailState>;
  readonly camera?: Partial<ComposerCameraState>;
  readonly color?: Partial<ComposerState["color"]>;
};

export const DEFAULT_COMPOSER_STATE: ComposerState = {
  seed: 12345,
  visual: { points: 0.42, gaussian: 0.9, hairlines: 0.12, softLines: 0.42, cloud: 0.76, light: 0.85, void: 0.14, microPoints: 0.65, trails: 0.45 },
  density: { amount: 1, compression: 0, splatScale: 1, lightAccumulation: 1 },
  motion: { elementMotionScale: 1, timeScale: 1, drift: 0.35, wave: 0.5, growth: 0.25, tremor: 0.2, accumulation: 0.45, oscillation: 0.15 },
  space: { depthSpread: 1, foregroundScale: 1.2, backgroundScale: 0.8, focusDisorder: 0.65, spatialEcho: 0.55, parallax: 0.3, voidRetention: 0.5 },
  curve: { amount: 0.45, bend: 0.35, sag: 0.25, flow: 0.4 },
  warp: { bend: 0.12, twist: 0.08, wave: 0.1, local: 0.15, scale: 1, speed: 0.5 },
  micro: { amount: 0.7, size: 0.6, drift: 0.5, brightness: 1 },
  trail: { length: 0.5, fade: 0.5, persistence: 0.35, residue: 0.4 },
  camera: { mode: "DRIFT", dolly: 0.12, orbit: 0.1, targetShift: 0.16, passThrough: 0.08, fov: 46, position: [5.4, -8.2, 4.5], target: [0, 0.2, 0], up: [0, 0, 1], autoRotate: false, autoRotateSpeed: 1.2, autoRotateDirection: "CW", autoRotateAxisMix: 0.6, autoRotateVary: 0.6, autoRotatePause: 0.4, autoVary: 0.7 },
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
    density: { ...base.density, ...patch.density },
    motion: { ...base.motion, ...patch.motion },
    space: { ...base.space, ...patch.space },
    curve: { ...base.curve, ...patch.curve },
    warp: { ...base.warp, ...patch.warp },
    micro: { ...base.micro, ...patch.micro },
    trail: { ...base.trail, ...patch.trail },
    camera: { ...base.camera, ...patch.camera },
    color: { ...base.color, ...patch.color },
  };
}

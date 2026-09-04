export interface ArtEnvironmentState {
  /** 0=depleted, 1=fully charged */
  density: number;
  /** Momentum of motion/particle movement */
  velocity: number;
  /** Structural tension/distortion level */
  tension: number;
  /** How much past state is remembered */
  memory: number;
  /** How quickly state fades when idle */
  decay: number;
  /** Current accumulation/overlap level */
  accumulation: number;
}

/** Minimal input from composer/source to initialize environment */
export interface ArtEnvironmentInput {
  density: number;
  velocity: number;
  tension: number;
  memory: number;
  decay: number;
  accumulation: number;
}
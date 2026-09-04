import { ArtEnvironmentState } from './environmentTypes';
export class EnvironmentRuntime {
  /** Compute ArtEnvironmentState from composer state and source stats */
  static compute(
    state: { density: number; motion: { elementMotionScale: number; timeScale: number } },
    sourceStats: { densityMean: number; supportMean: number; directionChangeMean: number } | null
  ): ArtEnvironmentState {
    // DENSITY: composer density + source density mean
    const density = state.density * 0.6 + (sourceStats?.densityMean ?? 0.5) * 0.4;

    // VELOCITY: motion intensity
    const velocity = Math.min(1, state.motion.elementMotionScale * state.motion.timeScale * 0.5);

    // TENSION: warp + curve + direction change
    const tension = 0.3; // base, modulated later

    // MEMORY: persistence + accumulation residual
    const memory = 0.3; // base memory

    // DECAY: how fast state fades
    const decay = 0.5; // base decay

    // ACCUMULATION: light + point overlap
    const accumulation = 0.3; // base accumulation

    return {
      density: Math.max(0, Math.min(1, density)),
      velocity: Math.max(0, Math.min(1, velocity)),
      tension: Math.max(0, Math.min(1, tension)),
      memory: Math.max(0, Math.min(1, memory)),
      decay: Math.max(0, Math.min(1, decay)),
      accumulation: Math.max(0, Math.min(1, accumulation)),
    };
  }
}
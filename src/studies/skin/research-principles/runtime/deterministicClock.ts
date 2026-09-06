import { clamp } from "./studyTypes.ts";

export class DeterministicClock {
  elapsedSeconds = 0;
  playing = true;
  speed = 1;

  advance(realDeltaSeconds: number): number {
    const delta = this.playing ? Math.max(0, Math.min(realDeltaSeconds, 0.1)) * this.speed : 0;
    this.elapsedSeconds += delta;
    return delta;
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.playing = true;
  }

  setSpeed(value: number): void {
    this.speed = clamp(value, 0.25, 2.5);
  }
}

export function stepDeterministically<T>(
  initial: T,
  elapsedSeconds: number,
  stepSeconds: number,
  update: (state: T, deltaSeconds: number) => T,
): T {
  let state = initial;
  const count = Math.max(0, Math.floor(elapsedSeconds / stepSeconds));
  for (let index = 0; index < count; index += 1) state = update(state, stepSeconds);
  const remainder = elapsedSeconds - count * stepSeconds;
  if (remainder > 1e-9) state = update(state, remainder);
  return state;
}

import { makeSeededRandom } from "../seed.ts";

export class EventScheduler {
  private readonly phases: readonly number[];
  private readonly speeds: readonly number[];

  constructor(seed: number) {
    const random = makeSeededRandom(seed ^ 0x72a1);
    this.phases = Array.from({ length: 7 }, () => random() * Math.PI * 2);
    this.speeds = Array.from({ length: 7 }, (_, index) => 0.07 + random() * 0.12 + index * 0.008);
  }

  energy(time: number, density: number, pauseBias: number): number {
    const local = this.phases.reduce((sum, phase, index) => sum + Math.sin(time * this.speeds[index]! + phase) / (index + 1), 0) / 2.6;
    const quiet = Math.max(0, pauseBias) * 0.18;
    return Math.max(0, Math.min(1, 0.48 + local * density * 0.32 - quiet));
  }
}

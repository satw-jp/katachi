import type { ComposerSource } from "../source/composerSource.ts";

export interface ComposerBudget {
  readonly pointLike: number;
  readonly gaussian: number;
  readonly cloud: number;
  readonly ribbonSamples: number;
  readonly complexityScale: number;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

export function composerBudget(source: ComposerSource): ComposerBudget {
  const edgeScale = Math.sqrt(source.statistics.edgeCount / 270);
  const motifScale = Math.sqrt(source.statistics.motifCount / 38);
  const complexityScale = clamp(0.64 + edgeScale * 0.22 + motifScale * 0.14, 0.64, 1.45);
  return {
    pointLike: Math.round(clamp(4000 * complexityScale, 2400, 14000)),
    gaussian: Math.round(clamp(2300 * complexityScale, 1400, 9000)),
    cloud: Math.round(clamp(900 * complexityScale, 480, 3200)),
    ribbonSamples: Math.round(clamp(720 * complexityScale, 420, 2600)),
    complexityScale,
  };
}

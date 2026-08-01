export type ProgressiveRenderKind = "realtime" | "rendering" | "complete";

export interface ProgressiveRenderState {
  kind: ProgressiveRenderKind;
  targetSamples: number;
  completedSamples: number;
  startedAt: number | null;
  elapsedMs: number;
  message: string;
}

export const DEFAULT_PROGRESSIVE_SAMPLES = 64;
export const PROGRESSIVE_SAMPLE_OPTIONS = [16, 64, 256] as const;
export const MAX_PROGRESSIVE_PIXELS = 2560 * 1440;

export function fitProgressiveRenderSize(
  width: number,
  height: number,
  maxPixels = MAX_PROGRESSIVE_PIXELS,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(1, Math.floor(Number.isFinite(height) ? height : 1));
  const safeMaxPixels = Math.max(1, Math.floor(Number.isFinite(maxPixels) ? maxPixels : 1));
  const pixelCount = safeWidth * safeHeight;
  if (pixelCount <= safeMaxPixels) return { width: safeWidth, height: safeHeight };
  const scale = Math.sqrt(safeMaxPixels / pixelCount);
  return {
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
  };
}

export function createRealtimeRenderState(message = "リアルタイム表示"): ProgressiveRenderState {
  return {
    kind: "realtime",
    targetSamples: 0,
    completedSamples: 0,
    startedAt: null,
    elapsedMs: 0,
    message,
  };
}

export function beginProgressiveRender(
  targetSamples: number,
  now: number,
): ProgressiveRenderState {
  if (!Number.isInteger(targetSamples) || targetSamples < 1 || targetSamples > 1024) {
    throw new RangeError("Progressive render samples must be an integer from 1 to 1024");
  }
  return {
    kind: "rendering",
    targetSamples,
    completedSamples: 0,
    startedAt: now,
    elapsedMs: 0,
    message: "静止画を蓄積中",
  };
}

export function advanceProgressiveRender(
  state: ProgressiveRenderState,
  now: number,
): ProgressiveRenderState {
  if (state.kind !== "rendering") return state;
  const completedSamples = Math.min(state.targetSamples, state.completedSamples + 1);
  const complete = completedSamples >= state.targetSamples;
  return {
    ...state,
    kind: complete ? "complete" : "rendering",
    completedSamples,
    elapsedMs: Math.max(0, now - (state.startedAt ?? now)),
    message: complete ? "静止画レンダー完了" : state.message,
  };
}

export function stopProgressiveRender(
  state: ProgressiveRenderState,
  now: number,
): ProgressiveRenderState {
  if (state.kind !== "rendering") return state;
  if (state.completedSamples === 0) return createRealtimeRenderState("レンダーを停止しました");
  return {
    ...state,
    kind: "complete",
    elapsedMs: Math.max(0, now - (state.startedAt ?? now)),
    message: "途中結果で停止",
  };
}

export function progressiveSampleWeight(completedSamples: number): number {
  if (!Number.isInteger(completedSamples) || completedSamples < 0) {
    throw new RangeError("Completed sample count must be a non-negative integer");
  }
  return 1 / (completedSamples + 1);
}

function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let value = index;
  while (value > 0) {
    fraction /= base;
    result += fraction * (value % base);
    value = Math.floor(value / base);
  }
  return result;
}

/** Deterministic sub-pixel offset in the half-open range [-0.5, 0.5). */
export function progressivePixelJitter(sampleIndex: number): readonly [number, number] {
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0) {
    throw new RangeError("Progressive sample index must be a non-negative integer");
  }
  const sequenceIndex = sampleIndex + 1;
  return [halton(sequenceIndex, 2) - 0.5, halton(sequenceIndex, 3) - 0.5] as const;
}

// ---------------------------------------------------------------------------
// Experimental Hikari light drawing — deterministic, derived ShapeSource.
// It appends balls only for Hikari; the KATACHI history remains untouched.
// ---------------------------------------------------------------------------

import { fieldSdf, type Ball } from "./field.ts";

export type ExperimentalLightBandPosition = "off" | "left" | "center" | "right";

export const EXPERIMENTAL_LIGHT_BAND_BALL_COUNT = 17;
export const EXPERIMENTAL_LIGHT_BAND_RADIUS_RATIO = 0.16;
export const EXPERIMENTAL_LIGHT_BAND_Z_SPACING_RATIO = 0.1;
export const EXPERIMENTAL_LIGHT_BAND_ROOT_SCAN_INTERVALS = 256;
export const EXPERIMENTAL_LIGHT_BAND_ROOT_BISECTIONS = 64;
export const EXPERIMENTAL_LIGHT_BAND_MAX_BASE_BALLS = 239;
export const EXPERIMENTAL_LIGHT_BAND_SOURCE_SIZES = [0.53, 5, 20] as const;

/** Saved alongside Hikari appearance settings, never in the KATACHI recipe. */
export interface ExperimentalLightBandConfig {
  version: 1;
  position: ExperimentalLightBandPosition;
  ballCount: typeof EXPERIMENTAL_LIGHT_BAND_BALL_COUNT;
  radiusRatio: typeof EXPERIMENTAL_LIGHT_BAND_RADIUS_RATIO;
  xOffsetRatio: 0.25;
  zSpacingRatio: typeof EXPERIMENTAL_LIGHT_BAND_Z_SPACING_RATIO;
  insetRatio: 0.25;
  rootScanIntervals: typeof EXPERIMENTAL_LIGHT_BAND_ROOT_SCAN_INTERVALS;
  rootBisections: typeof EXPERIMENTAL_LIGHT_BAND_ROOT_BISECTIONS;
}

export const DEFAULT_EXPERIMENTAL_LIGHT_BAND: ExperimentalLightBandConfig = {
  version: 1,
  position: "off",
  ballCount: EXPERIMENTAL_LIGHT_BAND_BALL_COUNT,
  radiusRatio: EXPERIMENTAL_LIGHT_BAND_RADIUS_RATIO,
  xOffsetRatio: 0.25,
  zSpacingRatio: EXPERIMENTAL_LIGHT_BAND_Z_SPACING_RATIO,
  insetRatio: 0.25,
  rootScanIntervals: EXPERIMENTAL_LIGHT_BAND_ROOT_SCAN_INTERVALS,
  rootBisections: EXPERIMENTAL_LIGHT_BAND_ROOT_BISECTIONS,
};

export interface ExperimentalLightBandSettings {
  lightDrawingBand: ExperimentalLightBandConfig;
}

export interface ExperimentalLightBandResult {
  /** Original array when disabled/unavailable; otherwise original balls + 17 derived balls. */
  balls: Ball[];
  enabled: boolean;
  reason: string | null;
  appendedCount: number;
}

const POSITION_OFFSET: Record<Exclude<ExperimentalLightBandPosition, "off">, number> = {
  left: -0.25,
  center: 0,
  right: 0.25,
};

/**
 * Appends a shallow, connected band.  “Upward” is Hikari's +Y receiver
 * convention. Each ball uses the uppermost base-field -→+ exit, then is inset
 * by one quarter of its own radius before protruding from the original field.
 */
export function deriveExperimentalLightBand(
  balls: Ball[],
  k: number,
  settings: ExperimentalLightBandSettings,
): ExperimentalLightBandResult {
  if (settings.lightDrawingBand.position === "off") {
    return { balls, enabled: false, reason: null, appendedCount: 0 };
  }
  if (!Number.isFinite(k) || k < 0) {
    return unavailable(balls, "ブレンド強さが有効ではありません");
  }
  if (balls.length === 0 || balls.length > EXPERIMENTAL_LIGHT_BAND_MAX_BASE_BALLS) {
    return unavailable(
      balls,
      balls.length === 0
        ? "形が空のため帯を置けません"
        : `GPUの256球上限を守るため、元の形は${EXPERIMENTAL_LIGHT_BAND_MAX_BASE_BALLS}球以下にしてください`,
    );
  }
  if (!balls.every(isFinitePositiveBall)) return unavailable(balls, "有効な球がないため帯を置けません");
  const anchor = largestFiniteBall(balls)!;

  const rho = anchor.r * EXPERIMENTAL_LIGHT_BAND_RADIUS_RATIO;
  if (rho < 0.03) return unavailable(balls, "帯の太さが小さすぎます");
  const x = anchor.x + anchor.r * POSITION_OFFSET[settings.lightDrawingBand.position];
  const ids = derivedIds(balls, EXPERIMENTAL_LIGHT_BAND_BALL_COUNT);
  const appended: Ball[] = [];
  for (let index = 0; index < EXPERIMENTAL_LIGHT_BAND_BALL_COUNT; index++) {
    const j = index - 8;
    const z = anchor.z + anchor.r * EXPERIMENTAL_LIGHT_BAND_Z_SPACING_RATIO * j;
    const root = uppermostBaseExit(balls, k, x, z, anchor.y);
    if (root === null) return unavailable(balls, "帯を形の表面へ接続できませんでした");
    appended.push({ id: ids[index], x, y: root - rho * 0.25, z, r: rho });
  }
  for (let index = 1; index < appended.length; index++) {
    const previous = appended[index - 1];
    const current = appended[index];
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
    if (!(distance < rho * 2)) return unavailable(balls, "帯の球が連結しませんでした");
  }
  return { balls: [...balls, ...appended], enabled: true, reason: null, appendedCount: appended.length };
}

function unavailable(balls: Ball[], reason: string): ExperimentalLightBandResult {
  return { balls, enabled: false, reason, appendedCount: 0 };
}

function largestFiniteBall(balls: readonly Ball[]): Ball | null {
  let largest: Ball | null = null;
  for (const ball of balls) {
    if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y) || !Number.isFinite(ball.z)
      || !Number.isFinite(ball.r) || ball.r <= 0) continue;
    // Strictly greater keeps the lowest input index for equal-radius ties.
    if (largest === null || ball.r > largest.r) largest = ball;
  }
  return largest;
}

function isFinitePositiveBall(ball: Ball): boolean {
  return Number.isFinite(ball.x) && Number.isFinite(ball.y) && Number.isFinite(ball.z)
    && Number.isFinite(ball.r) && ball.r > 0;
}

function derivedIds(balls: readonly Ball[], count: number): number[] {
  const occupied = new Set(balls.map((ball) => ball.id));
  const ids: number[] = [];
  let candidate = -1_000_000_000;
  while (ids.length < count) {
    if (!occupied.has(candidate)) {
      ids.push(candidate);
      occupied.add(candidate);
    }
    candidate--;
  }
  return ids;
}

function uppermostBaseExit(
  balls: Ball[], k: number, x: number, z: number, centerY: number,
): number | null {
  const maxY = Math.max(...balls.map((ball) => ball.y + ball.r));
  const largestR = Math.max(...balls.map((ball) => ball.r));
  const startY = centerY;
  const endY = maxY + (balls.length - 1) * k / 4 + largestR;
  let previousY = startY;
  let previousDistance = fieldSdf(balls, k, x, previousY, z);
  let uppermost: [number, number] | null = null;
  for (let step = 1; step <= EXPERIMENTAL_LIGHT_BAND_ROOT_SCAN_INTERVALS; step++) {
    const y = startY + (endY - startY) * step / EXPERIMENTAL_LIGHT_BAND_ROOT_SCAN_INTERVALS;
    const distance = fieldSdf(balls, k, x, y, z);
    if (previousDistance <= 0 && distance > 0) uppermost = [previousY, y];
    previousY = y;
    previousDistance = distance;
  }
  if (!uppermost) return null;
  let [low, high] = uppermost;
  for (let iteration = 0; iteration < EXPERIMENTAL_LIGHT_BAND_ROOT_BISECTIONS; iteration++) {
    const mid = (low + high) * 0.5;
    if (fieldSdf(balls, k, x, mid, z) <= 0) low = mid;
    else high = mid;
  }
  return (low + high) * 0.5;
}

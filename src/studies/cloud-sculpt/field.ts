// ---------------------------------------------------------------------------
// The field: a cloud is a list of balls (metaballs), smooth-min blended.
// This IS the shape's first-class definition (RESEARCH.md §3, §5 "場が第一級").
// Everything else (mesh, render) is a derived view of this list.
// ---------------------------------------------------------------------------

import { hashSeed, makeRng } from "./random.ts";

export interface Ball {
  id: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Blend / generation parameters — the "つまみ" (knobs) half of the two hands. */
export interface FieldParams {
  /** Smooth-min blend strength k. 0 = hard union, larger = softer merge. */
  k: number;
  /** How many balls a fresh "grow" produces. */
  count: number;
  /** Base radius of a grown ball. */
  radiusBase: number;
  /** Spread of radius around the base (0 = uniform, 1 = wide variance). */
  radiusSpread: number;
  /** Seed string for the deterministic grow. */
  seed: string;
}

export const DEFAULT_FIELD_PARAMS: FieldParams = {
  k: 0.6,
  count: 12,
  radiusBase: 0.7,
  radiusSpread: 0.5,
  seed: "yohaku",
};

let nextBallId = 1;
export function freshBallId(): number {
  return nextBallId++;
}
/** Reset the id counter — used only when replaying a history from scratch. */
export function resetBallIdCounter(startAt = 1): void {
  nextBallId = startAt;
}

/**
 * Polynomial smooth-min (Inigo Quilez's formulation):
 *   h = clamp(0.5 + 0.5*(b-a)/k, 0, 1)
 *   mix(b, a, h) - k*h*(1-h)
 * k = 0 degenerates to a hard min (plain union), which is why k=0 is a
 * legal, useful knob position rather than a special case to avoid.
 */
export function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

/** Signed distance from point p to a single ball (negative = inside). */
export function ballSdf(ball: Ball, x: number, y: number, z: number): number {
  const dx = x - ball.x;
  const dy = y - ball.y;
  const dz = z - ball.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - ball.r;
}

/** Signed distance of the whole field (all balls smooth-min'd together). */
export function fieldSdf(balls: Ball[], k: number, x: number, y: number, z: number): number {
  if (balls.length === 0) return 1e3;
  let d = ballSdf(balls[0], x, y, z);
  for (let i = 1; i < balls.length; i++) {
    d = smoothMin(d, ballSdf(balls[i], x, y, z), k);
  }
  return d;
}

/**
 * Deterministically grow `params.count` balls from `params.seed`.
 * Same seed + same params -> same balls, every time (needed for history replay).
 */
export function growBalls(params: FieldParams): Ball[] {
  const rng = makeRng(hashSeed(params.seed));
  const balls: Ball[] = [];
  for (let i = 0; i < Math.round(params.count); i++) {
    // Balls scattered in a soft ellipsoid cluster so they merge into one mass
    // rather than a scattered field of separate spheres.
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const radius = Math.pow(rng(), 0.6) * 1.6; // bias toward center
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta) * 0.6; // flatten a bit
    const z = radius * Math.cos(phi);
    const spread = params.radiusSpread;
    const r = params.radiusBase * (1 - spread / 2 + rng() * spread);
    balls.push({ id: freshBallId(), x, y, z, r: Math.max(0.05, r) });
  }
  return balls;
}

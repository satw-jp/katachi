// ---------------------------------------------------------------------------
// Ring: the first "unit" above a bare ball (RESEARCH.md v5 Y7 補正 —
// "穴を持つ単位を下から積む" / "単位という階層"). A ring is a closed chain of
// balls (metaballs) arranged around a circle, generated deterministically
// from a recipe (center, axis, radius, node count, ball size, wobble, seed)
// so history replay reproduces it bit-for-bit — same contract as
// growBalls() in cloud-sculpt/field.ts.
//
// Irregularity is not a bug here: the task doc is explicit that the
// author's 3rings reference work reads as alive *because* its nodes are
// uneven ("均質な輪はおそらく死ぬ"). wobbleR/wobblePos exist to keep that
// unevenness available as a first-class knob, not an accident of noise.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { freshBallId } from "../cloud-sculpt/field.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RingRecipe {
  center: Vec3;
  /** Ring's normal (perpendicular to the ring plane). Need not be unit length. */
  axis: Vec3;
  /** Ring radius (center to node, before wobble). */
  R: number;
  /** Number of nodes (balls) around the ring. */
  n: number;
  /** Base ball radius. */
  r: number;
  /** Fractional jitter (0..1) of ball radius around `r` — node-to-node. */
  wobbleR: number;
  /** Fractional jitter (0..1) of node position, both radial and axial, relative to R. */
  wobblePos: number;
  seed: string;
}

export const DEFAULT_RING_RECIPE: RingRecipe = {
  center: { x: 0, y: 0, z: 0 },
  axis: { x: 0, y: 0, z: 1 },
  R: 1.1,
  n: 14,
  r: 0.17,
  wobbleR: 0.35,
  wobblePos: 0.12,
  seed: "ring",
};

export interface RingGroup {
  id: number;
  ballIds: number[];
  /** Current centroid — kept in sync by moveRing/rotateRing/duplicateRing, used as the default rotate pivot. */
  center: Vec3;
  /** Current ring normal — kept in sync by rotateRing (direction only). */
  axis: Vec3;
  /** The recipe this ring was created with (for reference/UI; not re-evaluated after move/rotate — the balls are the source of truth after creation). */
  recipe: RingRecipe;
}

let nextRingId = 1;
export function freshRingId(): number {
  return nextRingId++;
}
export function resetRingIdCounter(startAt = 1): void {
  nextRingId = startAt;
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function vScale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function vCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
export function vDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function vLen(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
export function vNorm(a: Vec3): Vec3 {
  const l = vLen(a);
  return l < 1e-9 ? { x: 0, y: 0, z: 1 } : { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** An arbitrary orthonormal basis {u, v} spanning the plane perpendicular to `axis`. */
function ringBasis(axis: Vec3): { u: Vec3; v: Vec3; n: Vec3 } {
  const n = vNorm(axis);
  const helper = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = vNorm(vCross(helper, n));
  const v = vCross(n, u);
  return { u, v, n };
}

/**
 * Deterministically generate the balls of a ring from its recipe, in world
 * coordinates. Same recipe (incl. seed) -> same balls, always (needed for
 * history replay, same contract as growBalls in cloud-sculpt/field.ts).
 */
export function generateRingBalls(recipe: RingRecipe): Ball[] {
  const rng = makeRng(hashSeed(recipe.seed));
  const { u, v, n } = ringBasis(recipe.axis);
  const count = Math.max(3, Math.round(recipe.n));
  const balls: Ball[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    // Order of rng() calls matters for determinism but not for correctness:
    // radial jitter, axial jitter, then radius jitter, per node.
    const radialJitter = 1 + (rng() * 2 - 1) * recipe.wobblePos;
    const axialJitter = (rng() * 2 - 1) * recipe.wobblePos * recipe.R * 0.5;
    const rr = recipe.R * radialJitter;
    const cos = Math.cos(theta) * rr;
    const sin = Math.sin(theta) * rr;
    const x = recipe.center.x + u.x * cos + v.x * sin + n.x * axialJitter;
    const y = recipe.center.y + u.y * cos + v.y * sin + n.y * axialJitter;
    const z = recipe.center.z + u.z * cos + v.z * sin + n.z * axialJitter;
    const radius = Math.max(0.02, recipe.r * (1 - recipe.wobbleR / 2 + rng() * recipe.wobbleR));
    balls.push({ id: freshBallId(), x, y, z, r: radius });
  }
  return balls;
}

/** Rodrigues' rotation formula: rotate vector `v` by `angle` radians around unit `axis`. */
export function rotateVector(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = vNorm(axis);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const kv = vCross(k, v);
  const kdotv = vDot(k, v);
  return vAdd(vAdd(vScale(v, cosA), vScale(kv, sinA)), vScale(k, kdotv * (1 - cosA)));
}

/** Rotate a point around `pivot` by `angle` radians around unit-ish `axis`. */
export function rotatePoint(p: Vec3, pivot: Vec3, axis: Vec3, angle: number): Vec3 {
  return vAdd(pivot, rotateVector(vSub(p, pivot), axis, angle));
}

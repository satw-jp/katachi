// ---------------------------------------------------------------------------
// Foam cell decomposition and the foam SDF (T7 / Y7 "穴の造形").
// The field's first-class definition stays the ball list (field.ts, shared
// with S1) — this file is a *lens* on that same field: a scalar function
// that reads as "体積 -> 穴あき殻 -> 糸" as the 開口 (opening) knob sweeps
// 0 -> 1. Nothing here mutates the ball list.
//
// Cell metric (選定と理由): the task invites either nearest/second-nearest
// distance difference, or a radius-weighted power distance. We use
// ballSdf(p) = |p - center| - r (already in field.ts) as the per-ball
// "distance" instead of the textbook power distance |p-c|^2 - r^2. Both
// make cell size follow ball size, but ballSdf needs no extra tuning
// constant and is already exactly the function the raymarcher and CPU
// picking use for the cloud's own surface — reusing it keeps the wall
// geometry, the shell geometry and S1's silhouette all commensurable
// (same units, same k). Sort the per-ball ballSdf values ascending and
// keep the nearest three (d1 <= d2 <= d3):
//   - cellWall  = d2 - d1   (0 exactly on the bisector between the two
//                            nearest cells — this is the Voronoi wall)
//   - cellEdge  = d3 - d1   (0 exactly on a Plateau border: the curve
//                            where three cells meet)
// These are not true Euclidean distances to the wall/edge (ballSdf's
// gradient isn't unit outside a single ball's own surface), but they are
// well-behaved, zero exactly on the feature, and monotonically increasing
// away from it — enough for both marching-tetrahedra sign extraction
// (meshExport.ts, which only needs correct sign + smooth interpolation)
// and, with a step-damping factor, sphere-traced raymarching (shaders.ts).
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { ballSdf, fieldSdf, smoothMin } from "../cloud-sculpt/field.ts";

export interface FoamParams {
  /** 0 = closed shell per cell. 1 = only the Plateau-border thread network remains. */
  opening: number;
  /** Wall / shell / thread thickness, in the same world units as ball radius. */
  thickness: number;
}

export const DEFAULT_FOAM_PARAMS: FoamParams = {
  opening: 0.35,
  thickness: 0.035,
};

const HUGE = 1e5;

/** -smoothMin(-a, -b, k): the smooth-max counterpart used to soften the shell/wall cap. */
export function smoothMax(a: number, b: number, k: number): number {
  return -smoothMin(-a, -b, k);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface NearestThree {
  d1: number;
  d2: number;
  d3: number;
}

/**
 * Nearest, second-nearest and third-nearest ballSdf at a point, tracked with
 * three running minimums (no sort/allocation) — this loop shape is mirrored
 * exactly in shaders.ts's map() so the CPU (picking/mesh) and GPU (raymarch)
 * views of a cell never disagree.
 */
export function nearestThreeBallSdf(balls: Ball[], x: number, y: number, z: number): NearestThree {
  let d1 = HUGE;
  let d2 = HUGE;
  let d3 = HUGE;
  for (const b of balls) {
    const d = ballSdf(b, x, y, z);
    if (d < d1) {
      d3 = d2;
      d2 = d1;
      d1 = d;
    } else if (d < d2) {
      d3 = d2;
      d2 = d;
    } else if (d < d3) {
      d3 = d;
    }
  }
  return { d1, d2, d3 };
}

/**
 * A rough radius for the whole cloud (centroid to farthest ball surface).
 * Used only to scale the opening knob's "how much of a face counts as
 * near-the-center" threshold to the cloud's own size, so the same opening
 * value reads similarly on a tight cluster and a spread-out one.
 */
export function estimateCloudScale(balls: Ball[]): number {
  if (balls.length === 0) return 1;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const b of balls) {
    cx += b.x;
    cy += b.y;
    cz += b.z;
  }
  cx /= balls.length;
  cy /= balls.length;
  cz /= balls.length;
  let maxReach = 0;
  for (const b of balls) {
    const reach = Math.hypot(b.x - cx, b.y - cy, b.z - cz) + b.r;
    maxReach = Math.max(maxReach, reach);
  }
  return Math.max(0.3, maxReach);
}

// Tuning constants — kept in lockstep with the GLSL map() in shaders.ts.
// (documented, not derived: a first pass. See README "Hypothesis"/"Next".)
const OPEN_WIDTH_MAX_FACTOR = 0.9; // opening=0: keep-region spans ~90% of cloud scale (whole face)
const OPEN_WIDTH_MIN_FACTOR = 0.6; // opening=1 floor, relative to thickness
const OPEN_WIDTH_FLOOR_FACTOR = 0.5; // absolute floor (never fully vanish the Plateau threads)
const KEEP_SOFTEN = 0.65; // smoothstep low edge, as a fraction of openWidth
const HOLE_PENALTY = 6; // how emphatically an "opened" point pushes the sdf positive
const WALL_BLEND = 0.3; // fraction of k used to soften wall/shell union and the outer cap

/**
 * The foam SDF at a point: negative = inside solid material (wall, shell or
 * thread), 0 = surface, positive = empty. Not a true Euclidean SDF near
 * holes (see file header) — raymarchers must damp their step size.
 */
export function foamSdf(
  balls: Ball[],
  k: number,
  opening: number,
  thickness: number,
  cloudScale: number,
  x: number,
  y: number,
  z: number,
): number {
  if (balls.length === 0) return HUGE;
  const surf = fieldSdf(balls, k, x, y, z);

  if (balls.length === 1) {
    // No cell wall possible with a single ball: a plain thin shell.
    const shell = Math.abs(surf) - thickness;
    return Math.max(shell, surf - thickness);
  }

  const { d1, d2, d3 } = nearestThreeBallSdf(balls, x, y, z);
  const cellWall = d2 - d1;
  const cellEdge = balls.length >= 3 ? d3 - d1 : HUGE;

  // Which membrane this point belongs to: an internal 2-cell wall, or the
  // cloud's own outer skin — whichever is closer. Each membrane has its own
  // notion of "edge" (Plateau border for a wall; the seam where a wall
  // reaches the skin, for the skin itself).
  const onWall = cellWall < Math.abs(surf);
  const edgeDist = onWall ? cellEdge : cellWall;

  const big = cloudScale * OPEN_WIDTH_MAX_FACTOR;
  const small = thickness * OPEN_WIDTH_MIN_FACTOR;
  const openWidth = Math.max(big + (small - big) * opening, thickness * OPEN_WIDTH_FLOOR_FACTOR);

  const keep = 1 - smoothstep(openWidth * KEEP_SOFTEN, openWidth, edgeDist);
  const holePenalty = (1 - keep) * HOLE_PENALTY;

  const membraneDist = smoothMin(cellWall, Math.abs(surf), k * WALL_BLEND);
  const shellCore = membraneDist - thickness;

  // Cap material to stay within `thickness` of the cloud's own surface so
  // a coincidentally-small cellWall far from the cloud never grows a stray
  // wall sheet reaching to infinity.
  return smoothMax(shellCore + holePenalty, surf - thickness, k * WALL_BLEND);
}

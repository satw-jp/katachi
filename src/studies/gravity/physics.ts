// ---------------------------------------------------------------------------
// The "苦しさ" (strain) approximation. Deliberately crude — RESEARCH §3 calls
// this the ②図で解く（力の図式）blood line, NOT ③数で解く（FEM）. See T2-gravity.md
// and this Study's README "Setup" for the derivation and its stated limits.
//
// Model: balls are nodes, overlaps are edges. Grounded balls (touching y=0)
// are roots. For every other ball, find the shortest path (by center-to-center
// distance) down to some grounded ball — this is the "force flow" tree.
// Each ball's strain = (volume of itself + everything it carries above it)
// divided by the cross-section of the one connection it hangs from (the
// overlap lens with its parent, or the ground-contact circle for a root).
// Balls with no path to any grounded ball at all are unsupported islands —
// reported at maximum strain, unconditionally.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";

/** How close (in world units) a ball's bottom has to be to y=0 to count as "touching". */
export const GROUND_TOUCH_EPS = 0.02;

/**
 * Reference strain (volume ÷ area, in the field's own units) that maps to
 * fully red ("限界"). Chosen empirically against the S1 default field
 * (count=12, radiusBase=0.7): a ball at the base of that cloud carrying the
 * whole mass through a modest neck lands in the 3〜7 range, so 6.0 gives a
 * readable gradient rather than an all-blue or all-red default view.
 * This is a visualization calibration constant, not a material property —
 * S3 (印刷して壊す) is what eventually grounds it in something real.
 */
export const STRAIN_REFERENCE = 6.0;

export interface StrainResult {
  /** Normalized 0 (楽/blue) .. 1 (限界/red) strain per ball, same order as input. */
  normalized: number[];
  /** Raw (unclamped) volume/area strain per ball, for debugging/export. */
  raw: number[];
  /** Whether each ball directly touches the ground. */
  grounded: boolean[];
  /** Whether each ball has no path (direct or via other balls) to the ground at all. */
  island: boolean[];
}

// Exported (not just used internally) so S2b ("たわむ") can import these
// instead of copying them — same volume/contact-area model, now shared
// between the strain approximation and the spring-sag approximation.
export function ballVolume(r: number): number {
  return (4 / 3) * Math.PI * r * r * r;
}

/** Cross-section area of the lens where two overlapping spheres meet. */
export function overlapArea(r1: number, r2: number, d: number): number {
  if (d <= 1e-6) return Math.PI * Math.min(r1, r2) ** 2;
  if (d >= r1 + r2) return 0;
  const a2 = (4 * d * d * r1 * r1 - (d * d - r2 * r2 + r1 * r1) ** 2) / (4 * d * d);
  return Math.PI * Math.max(0, a2);
}

/** Contact-circle area where a ball meets the ground plane y=0. */
function groundContactArea(ball: Ball): number {
  if (ball.y >= ball.r) return 0; // not touching
  const clampedY = Math.max(ball.y, -ball.r); // fully embedded caps out at the great circle
  const a2 = Math.max(0, ball.r * ball.r - clampedY * clampedY);
  return Math.PI * a2;
}

/**
 * Compute the crude gravity strain for a ball list. Pure function of the
 * field (no history, no side effects) — the color it drives is a derived
 * view, not part of the operation history (T2-gravity.md §4).
 */
export function computeStrain(balls: Ball[]): StrainResult {
  const n = balls.length;
  const raw = new Array<number>(n).fill(0);
  const normalized = new Array<number>(n).fill(0);
  const grounded = new Array<boolean>(n).fill(false);
  const island = new Array<boolean>(n).fill(false);
  if (n === 0) return { normalized, raw, grounded, island };

  for (let i = 0; i < n; i++) {
    grounded[i] = balls[i].y - balls[i].r <= GROUND_TOUCH_EPS;
  }

  // Dijkstra from a virtual "ground" node (distance 0 to every grounded ball)
  // over the overlap graph, weighted by center-to-center distance.
  const dist = new Array<number>(n).fill(Infinity);
  const parent = new Array<number>(n).fill(-1); // -1 = ground, -2 = unvisited/unreachable
  const visited = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    parent[i] = -2;
    if (grounded[i]) dist[i] = 0;
  }

  // Precompute pairwise overlap adjacency once (n is small: sculpting-scale clouds).
  const neighbors: { j: number; d: number }[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = balls[i].x - balls[j].x;
      const dy = balls[i].y - balls[j].y;
      const dz = balls[i].z - balls[j].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < balls[i].r + balls[j].r) {
        neighbors[i].push({ j, d });
        neighbors[j].push({ j: i, d });
      }
    }
  }

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break; // remaining nodes are unreachable
    visited[u] = true;
    for (const { j, d } of neighbors[u]) {
      const cand = dist[u] + d;
      if (cand < dist[j]) {
        dist[j] = cand;
        parent[j] = u;
      }
    }
  }
  // Grounded balls are reached "for free" at dist 0 by their own initial
  // condition, never via another ball's edge (dist 0 is already minimal) —
  // so their parent stays the ground sentinel (-1), not a -2 placeholder.
  for (let i = 0; i < n; i++) {
    if (grounded[i] && dist[i] === 0) parent[i] = -1;
  }
  for (let i = 0; i < n; i++) {
    island[i] = !grounded[i] && !visited[i]; // never reached by Dijkstra at all
  }

  // Build children lists from the shortest-path tree (skip islands: no parent edge).
  const children: number[][] = Array.from({ length: n }, () => []);
  const roots: number[] = [];
  for (let i = 0; i < n; i++) {
    if (island[i]) continue;
    if (parent[i] === -1) roots.push(i);
    else if (parent[i] >= 0) children[parent[i]].push(i);
  }

  // Post-order subtree volume (own volume + everything carried above it).
  const subtreeVolume = new Array<number>(n).fill(0);
  function accumulate(i: number): number {
    let v = ballVolume(balls[i].r);
    for (const c of children[i]) v += accumulate(c);
    subtreeVolume[i] = v;
    return v;
  }
  for (const r of roots) accumulate(r);
  // Islands still get their own volume counted (for completeness / debugging)
  // even though they carry no load anywhere.
  for (let i = 0; i < n; i++) {
    if (island[i]) subtreeVolume[i] = ballVolume(balls[i].r);
  }

  for (let i = 0; i < n; i++) {
    if (island[i]) {
      raw[i] = Infinity;
      normalized[i] = 1;
      continue;
    }
    let area: number;
    if (parent[i] === -1) {
      area = groundContactArea(balls[i]);
    } else {
      const p = parent[i];
      const dx = balls[i].x - balls[p].x;
      const dy = balls[i].y - balls[p].y;
      const dz = balls[i].z - balls[p].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      area = overlapArea(balls[i].r, balls[p].r, d);
    }
    // A near-zero neck is a real bottleneck, not a division error — clamp
    // the denominator instead of the result so a thread-thin connection
    // reads as maximally strained, matching "支えが無いものは立てない".
    const safeArea = Math.max(area, 1e-5);
    raw[i] = subtreeVolume[i] / safeArea;
    normalized[i] = Math.max(0, Math.min(1, raw[i] / STRAIN_REFERENCE));
  }

  return { normalized, raw, grounded, island };
}

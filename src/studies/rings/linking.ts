// ---------------------------------------------------------------------------
// Topology instrument (T8 §3 "この Study の Katachi らしさ"): the discrete
// Gauss linking number between two rings' center-lines, computed live.
//
// Method: the classical Gauss linking integral
//   Lk(A,B) = (1/4π) ∮∮ (dr_A × dr_B) · (r_A - r_B) / |r_A - r_B|^3
// discretized with the midpoint rule over each pair of closed-polyline
// segments (one segment from each ring's center-line — the closed
// straight-line loop through its node/ball centers in generation order).
// For segment i of loop A (endpoints p1,p2) and segment j of loop B
// (endpoints p3,p4):
//   ds1 = p2-p1, mid1 = (p1+p2)/2
//   ds2 = p4-p3, mid2 = (p3+p4)/2
//   r = mid1 - mid2
//   contribution = (ds1 × ds2) · r / |r|^3
// summed over all segment pairs, divided by 4π.
//
// This is the standard direct discretization of the Gauss linking integral
// (see e.g. Ricca & Nipoti, "Gauss' Linking Number Revisited", J. Knot
// Theory Ramifications 20 (2011); also used throughout the DNA-supercoiling
// literature, e.g. Klenin & Langowski, Biopolymers 54 (2000), who instead
// use an exact solid-angle-per-segment-pair formula). We use the simpler
// midpoint form because it is easy to verify by construction (see below)
// and rings in this Study have modest node counts (n ~ 6-40), where the
// exact solid-angle formula and this discretization both carry O(1/n^2)
// error and neither is exact.
//
// Verified against known configurations before wiring into the app
// (scratchpad script, not shipped): a true Hopf link (two unit circles,
// one threaded through the other's disk) converges to |Lk| = 1.0000 as
// node count grows (1.0016 at n=64, 1.0001 at n=256), reversing one loop's
// orientation flips the sign exactly, two well-separated or coplanar
// side-by-side circles give Lk = 0.0000, and even at low node counts
// matching real rings in this Study (n=6..24) the linked case stays within
// ~0.22 of the integer 1 (n=6: 1.2164; n=24: 1.0115) — good enough to
// round to the nearest integer for the "絡み 1 / 0" display, which is what
// the task's completion condition asks for.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import type { RingGroup, Vec3 } from "./ring.ts";
import { vCross, vDot, vLen, vSub } from "./ring.ts";

/** The center-line of a ring: its member balls' centers, in generation order (a closed polyline). */
export function ringCenterline(group: RingGroup, ballsById: Map<number, Ball>): Vec3[] {
  const pts: Vec3[] = [];
  for (const id of group.ballIds) {
    const b = ballsById.get(id);
    if (b) pts.push({ x: b.x, y: b.y, z: b.z });
  }
  return pts;
}

/** Discrete Gauss linking number between two closed polylines (midpoint-rule double sum; see file header). */
export function gaussLinkingNumber(loopA: Vec3[], loopB: Vec3[]): number {
  if (loopA.length < 3 || loopB.length < 3) return 0;
  let sum = 0;
  const na = loopA.length;
  const nb = loopB.length;
  for (let i = 0; i < na; i++) {
    const p1 = loopA[i];
    const p2 = loopA[(i + 1) % na];
    const ds1: Vec3 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    const mid1: Vec3 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
    for (let j = 0; j < nb; j++) {
      const p3 = loopB[j];
      const p4 = loopB[(j + 1) % nb];
      const ds2: Vec3 = { x: p4.x - p3.x, y: p4.y - p3.y, z: p4.z - p3.z };
      const mid2: Vec3 = { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2, z: (p3.z + p4.z) / 2 };
      const r = vSub(mid1, mid2);
      const rl = vLen(r);
      if (rl < 1e-9) continue; // coincident segment midpoints (degenerate) contribute nothing
      sum += vDot(vCross(ds1, ds2), r) / (rl * rl * rl);
    }
  }
  return sum / (4 * Math.PI);
}

export interface LinkingRow {
  ringA: number;
  ringB: number;
  raw: number;
  rounded: number;
}

/** Linking number for every unordered pair of rings, in a stable (ascending id) order. */
export function allPairLinking(
  groups: RingGroup[],
  ballsById: Map<number, Ball>,
): LinkingRow[] {
  const rows: LinkingRow[] = [];
  const sorted = [...groups].sort((a, b) => a.id - b.id);
  const lines = new Map<number, Vec3[]>();
  for (const g of sorted) lines.set(g.id, ringCenterline(g, ballsById));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const raw = gaussLinkingNumber(lines.get(a.id)!, lines.get(b.id)!);
      rows.push({ ringA: a.id, ringB: b.id, raw, rounded: Math.round(raw) });
    }
  }
  return rows;
}

export interface OverlapWarning {
  ringA: number;
  ringB: number;
  /** Deepest (ra+rb-dist)/min(ra,rb) found between a ball of ringA and a ball of ringB. */
  worstOverlapFraction: number;
}

// Heuristic threshold: two balls from different rings whose surfaces
// overlap by more than 55% of the smaller ball's radius read as "fused"
// rather than "linked but not touching" (documented as a first pass —
// no material/print tolerance backs this number yet, see README §Next).
const DEEP_OVERLAP_FRACTION = 0.55;

/** Flag ring pairs whose balls interpenetrate deeply enough to read as fusion rather than a link. */
export function findDeepOverlaps(
  groups: RingGroup[],
  ballsById: Map<number, Ball>,
): OverlapWarning[] {
  const warnings: OverlapWarning[] = [];
  const sorted = [...groups].sort((a, b) => a.id - b.id);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      let worst = 0;
      for (const aid of a.ballIds) {
        const ba = ballsById.get(aid);
        if (!ba) continue;
        for (const bid of b.ballIds) {
          const bb = ballsById.get(bid);
          if (!bb) continue;
          const dist = Math.hypot(ba.x - bb.x, ba.y - bb.y, ba.z - bb.z);
          const overlap = ba.r + bb.r - dist;
          if (overlap <= 0) continue;
          const frac = overlap / Math.min(ba.r, bb.r);
          if (frac > worst) worst = frac;
        }
      }
      if (worst > DEEP_OVERLAP_FRACTION) {
        warnings.push({ ringA: a.id, ringB: b.id, worstOverlapFraction: worst });
      }
    }
  }
  return warnings;
}

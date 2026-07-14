// ---------------------------------------------------------------------------
// T11 §2 "絡み計器": reuses S-rings' Gauss linking number (rings/linking.ts,
// imported not copied) to answer "布になったか、まだ点在か" for 立体リング
// (ring3d) patches. A ring3d patch's own `points` array (generated in
// generation order by buildRing3dPoints/generateRingBalls) already IS a
// closed polyline through node centers -- exactly the centerline shape
// gaussLinkingNumber expects, so no adapter beyond a field rename (x,y,z) is
// needed.
//
// Reported (T11 §2's exact wording): "絡んだペア数 / 隣接ペア数" and a
// connected-component count over the ring3d patches (union-find on "linked",
// i.e. |rounded Lk| >= 1).
// ---------------------------------------------------------------------------

import { gaussLinkingNumber } from "../rings/linking.ts";
import type { Vec3 } from "../rings/ring.ts";
import type { Patch } from "./field.ts";

// 仮決め, same status as rings/linking.ts's own heuristics (undocumented
// material/print backing, first pass only, see README §Next): two ring3d
// patches are only worth running the O(n^2) Gauss sum on if their closest
// point-pair clearance is within a few ring-sizes of each other -- this is
// a NEIGHBOR test (candidate for possibly being linked), not the linking
// verdict itself (that's Lk). Kept generous on purpose: false positives here
// only cost a cheap linking computation, false negatives would silently
// hide a real link.
const ADJACENCY_SIZE_FACTOR = 3;

export interface SkinLinkingRow {
  patchA: number;
  patchB: number;
  raw: number;
  rounded: number;
}

export interface SkinLinkingReport {
  ringPatchCount: number;
  /** Pairs close enough to be worth checking (see ADJACENCY_SIZE_FACTOR). */
  adjacentPairs: number;
  /** Of the adjacent pairs, how many have a nonzero rounded Gauss linking number. */
  linkedPairs: number;
  /** Connected components among ring3d patches, unioned by "linked"
   * (rounded Lk != 0) edges -- an isolated ring with no linked neighbor
   * counts as its own component. "布になったか" reads as this number
   * shrinking well below ringPatchCount. */
  componentCount: number;
  rows: SkinLinkingRow[];
}

function patchLoop(patch: Patch): Vec3[] {
  return patch.points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

/** Rough patch-size proxy (max node radius) for the adjacency heuristic only. */
function patchExtent(patch: Patch): number {
  let m = 0;
  for (const p of patch.points) if (p.r > m) m = p.r;
  return m;
}

export function estimateRingLinking(patches: Patch[]): SkinLinkingReport {
  const ringPatches = patches.filter((p) => p.shape === "ring3d" && p.points.length >= 3);
  const rows: SkinLinkingRow[] = [];
  let adjacentPairs = 0;
  let linkedPairs = 0;

  const parent = ringPatches.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < ringPatches.length; i++) {
    for (let j = i + 1; j < ringPatches.length; j++) {
      const a = ringPatches[i];
      const b = ringPatches[j];
      let closest = Infinity;
      for (const pa of a.points) {
        for (const pb of b.points) {
          const d = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) - pa.r - pb.r;
          if (d < closest) closest = d;
        }
      }
      const sizeProxy = Math.max(patchExtent(a), patchExtent(b), 0.02);
      if (closest >= sizeProxy * ADJACENCY_SIZE_FACTOR) continue; // not a candidate, skip the Gauss sum
      adjacentPairs++;
      const raw = gaussLinkingNumber(patchLoop(a), patchLoop(b));
      const rounded = Math.round(raw);
      rows.push({ patchA: a.id, patchB: b.id, raw, rounded });
      if (rounded !== 0) {
        linkedPairs++;
        union(i, j);
      }
    }
  }

  const roots = new Set<number>();
  for (let i = 0; i < ringPatches.length; i++) roots.add(find(i));

  return {
    ringPatchCount: ringPatches.length,
    adjacentPairs,
    linkedPairs,
    componentCount: ringPatches.length === 0 ? 0 : roots.size,
    rows,
  };
}

export interface SkinOverlapWarning {
  patchA: number;
  patchB: number;
  worstOverlapFraction: number;
}

// Same threshold and same "no material/print tolerance backs this number"
// caveat as rings/linking.ts's findDeepOverlaps -- applied here across ANY
// two DIFFERENT patches' points (not just ring3d), since fusion-vs-linking
// confusion can happen for overlapping flatRing patches too, not only rings.
const DEEP_OVERLAP_FRACTION = 0.55;

/** Flag patch pairs whose points interpenetrate deeply enough to read as
 * fusion (one printed lump) rather than a link (two separate, interlocked
 * pieces) -- T11 §2 "深いめり込み（融合でなく絡み）の警告". */
export function findDeepPatchOverlaps(patches: Patch[]): SkinOverlapWarning[] {
  const warnings: SkinOverlapWarning[] = [];
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      const a = patches[i];
      const b = patches[j];
      let worst = 0;
      for (const pa of a.points) {
        for (const pb of b.points) {
          const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
          const overlap = pa.r + pb.r - dist;
          if (overlap <= 0) continue;
          const frac = overlap / Math.min(pa.r, pb.r);
          if (frac > worst) worst = frac;
        }
      }
      if (worst > DEEP_OVERLAP_FRACTION) {
        warnings.push({ patchA: a.id, patchB: b.id, worstOverlapFraction: worst });
      }
    }
  }
  return warnings;
}

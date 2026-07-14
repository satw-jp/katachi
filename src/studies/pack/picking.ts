// ---------------------------------------------------------------------------
// CPU-side ray/field intersection for mouse interaction (click-to-select a
// unit for deletion, click-to-place a manual unit). Mirrors cloud-sculpt/
// picking.ts's sphere-tracing loop, generalized to the composite field and
// to a host-only field (used for manual placement — see main.ts).
//
// T14: hits resolve to a UNIT index (not a ball index) — "単位ごとの選択・
// 削除が効くこと" per the task doc. Ownership lookup follows the same
// precedent skin/picking.ts's nearestPatchId already established for its own
// point-owning units: scan every ball of every unit, find the ball whose own
// surface the hit point is nearest to, return THAT ball's owning unit's
// index. No ball carries a back-reference to its unit — the unit's own
// `balls` array IS the ownership record (see field.ts's PackUnit doc).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import type { Ball } from "../cloud-sculpt/field.ts";
import { ballSdf, fieldSdf } from "../cloud-sculpt/field.ts";
import { compositeSdf } from "./field.ts";
import type { PackMode, PackUnit } from "./field.ts";

export interface CompositeHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Index into `units` of the nearest unit at the hit point, or -1 if the
   * point is closer to the host's own skin (not a cavity wall). In "fill"
   * mode every hit is, by construction, on some unit's own surface (the
   * composite IS the units' union). */
  unitIndex: number;
}

/** Sphere-trace the mode-dependent composite field (T13 §1, T14: units). */
export function raymarchComposite(
  mode: PackMode,
  host: Ball[],
  hostK: number,
  units: PackUnit[],
  roundK: number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist = 50,
): CompositeHit | null {
  if (mode === "carve" && host.length === 0) return null;
  if (mode === "fill" && units.length === 0) return null;
  let t = 0;
  for (let i = 0; i < 160; i++) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const d = compositeSdf(mode, host, hostK, units, roundK, x, y, z);
    if (d < 0.001) {
      const point = new THREE.Vector3(x, y, z);
      const normal = estimateCompositeNormal(mode, host, hostK, units, roundK, point);
      const unitIndex = nearestUnitIndexIfOnCavityWall(units, x, y, z);
      return { point, normal, unitIndex };
    }
    t += d;
    if (t > maxDist) break;
  }
  return null;
}

function estimateCompositeNormal(
  mode: PackMode,
  host: Ball[],
  hostK: number,
  units: PackUnit[],
  roundK: number,
  p: THREE.Vector3,
): THREE.Vector3 {
  const e = 0.0015;
  const d = (x: number, y: number, z: number) => compositeSdf(mode, host, hostK, units, roundK, x, y, z);
  return new THREE.Vector3(
    d(p.x + e, p.y, p.z) - d(p.x - e, p.y, p.z),
    d(p.x, p.y + e, p.z) - d(p.x, p.y - e, p.z),
    d(p.x, p.y, p.z + e) - d(p.x, p.y, p.z - e),
  ).normalize();
}

/**
 * A hit point counts as "on a cavity wall" (belongs to a unit, for
 * selection) if some unit's own constituent ball has a near-zero ballSdf
 * there. Returns the INDEX of that ball's owning unit within `units` (T14),
 * not a ball id. In fill mode this is unconditionally true at any hit
 * (composite == unitsField).
 */
function nearestUnitIndexIfOnCavityWall(units: PackUnit[], x: number, y: number, z: number): number {
  let bestUnitIndex = -1;
  let best = Infinity;
  for (let i = 0; i < units.length; i++) {
    for (const b of units[i].balls) {
      const d = Math.abs(ballSdf(b, x, y, z));
      if (d < best) {
        best = d;
        bestUnitIndex = i;
      }
    }
  }
  return best < 0.05 ? bestUnitIndex : -1;
}

/** Sphere-trace the HOST field alone (ignores units) — used for manual unit
 * placement, so a click always targets the host's own skin regardless of
 * what cavities are already open (T9 §2 "手動追加...望ましい"; scoped to the
 * outer skin only, documented as a simplification in README). */
export function raymarchHost(
  host: Ball[],
  hostK: number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist = 50,
): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
  if (host.length === 0) return null;
  let t = 0;
  for (let i = 0; i < 128; i++) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const d = fieldSdf(host, hostK, x, y, z);
    if (d < 0.001) {
      const point = new THREE.Vector3(x, y, z);
      const e = 0.0015;
      const df = (px: number, py: number, pz: number) => fieldSdf(host, hostK, px, py, pz);
      const normal = new THREE.Vector3(
        df(x + e, y, z) - df(x - e, y, z),
        df(x, y + e, z) - df(x, y - e, z),
        df(x, y, z + e) - df(x, y, z - e),
      ).normalize();
      return { point, normal };
    }
    t += d;
    if (t > maxDist) break;
  }
  return null;
}

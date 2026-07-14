// ---------------------------------------------------------------------------
// CPU-side ray/field intersection for mouse interaction (click-to-select a
// patch for deletion, click-to-place a manual patch). Mirrors pack/
// picking.ts's sphere-tracing loop, generalized to the mode-aware composite
// field and to a host-only field (manual placement always targets the bare
// host skin, same simplification pack made -- see main.ts).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import type { Ball, Patch, SkinMode } from "./field.ts";
import { compositeSdf } from "./field.ts";
import { fieldSdf } from "../cloud-sculpt/field.ts";

export interface CompositeHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Patch id at the hit point, or null if the point is on bare shell (no
   * patch nearby) rather than a patch surface. */
  patchId: number | null;
}

/** Sphere-trace the composite (mode-dependent) field. */
export function raymarchComposite(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist = 50,
): CompositeHit | null {
  if (host.length === 0) return null;
  let t = 0;
  for (let i = 0; i < 160; i++) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const d = compositeSdf(mode, host, hostK, thickness, patches, roundK, x, y, z);
    if (d < 0.001) {
      const point = new THREE.Vector3(x, y, z);
      const normal = estimateCompositeNormal(mode, host, hostK, thickness, patches, roundK, point);
      const patchId = nearestPatchId(mode, patches, x, y, z);
      return { point, normal, patchId };
    }
    t += d;
    if (t > maxDist) break;
  }
  return null;
}

function estimateCompositeNormal(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  p: THREE.Vector3,
): THREE.Vector3 {
  const e = 0.0015;
  const d = (x: number, y: number, z: number) => compositeSdf(mode, host, hostK, thickness, patches, roundK, x, y, z);
  return new THREE.Vector3(
    d(p.x + e, p.y, p.z) - d(p.x - e, p.y, p.z),
    d(p.x, p.y + e, p.z) - d(p.x, p.y - e, p.z),
    d(p.x, p.y, p.z + e) - d(p.x, p.y, p.z - e),
  ).normalize();
}

/**
 * Which patch (if any) a composite-surface hit point "belongs to", for
 * click-selection. The two modes need different tests because of what the
 * visible surface actually IS:
 *  - window mode: most of the shell has nothing to do with any patch (only
 *    the rim of a carved opening does), so a hit only counts as "on a
 *    patch" if it sits close to that patch's OWN zero surface (near a
 *    point's sphere boundary) -- same threshold test pack uses for cavity
 *    walls.
 *  - plate mode: the composite is shell ∩ patches, which is empty wherever
 *    no patch reaches -- so ANY hit found by raymarchComposite in plate
 *    mode is, by construction, already inside some patch's influence (deep
 *    inside its point spheres, not necessarily near their zero surface).
 *    The zero-surface threshold test would almost always fail here (a
 *    plate's face sits well inside its points, only the very rim nears
 *    dPatch=0), which is the bug this Study's own verification caught:
 *    click-to-select silently did nothing on plate faces. Plate mode
 *    instead picks the nearest patch unconditionally (no threshold).
 */
function nearestPatchId(mode: SkinMode, patches: Patch[], x: number, y: number, z: number): number | null {
  let bestId: number | null = null;
  let best = Infinity;
  for (const patch of patches) {
    for (const pt of patch.points) {
      const d = Math.abs(Math.hypot(x - pt.x, y - pt.y, z - pt.z) - pt.r);
      if (d < best) {
        best = d;
        bestId = patch.id;
      }
    }
  }
  if (mode === "plate") return bestId;
  return best < 0.05 ? bestId : null;
}

/** Sphere-trace the HOST field alone (ignores the shell/patch boolean) --
 * used for manual patch placement, so a click always targets the host's own
 * skin (T10 §2 manual add; scoped to the outer skin only, same documented
 * simplification pack made for manual void placement). */
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

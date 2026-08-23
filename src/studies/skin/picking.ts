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

/** Fast direct-manipulation pick for dense realized motifs. It checks the
 * actual point spheres once instead of repeatedly evaluating the complete
 * composite field for every raymarch step. */
export function pickPatchBySpheres(
  patches: readonly Patch[],
  origin: Pick<THREE.Vector3, "x" | "y" | "z">,
  dir: Pick<THREE.Vector3, "x" | "y" | "z">,
  padding = 0,
): number | null {
  let bestT = Infinity;
  let bestId: number | null = null;
  for (const patch of patches) {
    for (const point of patch.points) {
      const radius = point.r + Math.max(0, padding);
      if (!Number.isFinite(radius) || radius <= 0) continue;
      const ox = origin.x - point.x;
      const oy = origin.y - point.y;
      const oz = origin.z - point.z;
      const along = -(ox * dir.x + oy * dir.y + oz * dir.z);
      const discriminant = along * along - (ox * ox + oy * oy + oz * oz - radius * radius);
      if (discriminant < 0) continue;
      const root = Math.sqrt(discriminant);
      const near = along - root;
      const far = along + root;
      const t = near > 0 ? near : far > 0 ? far : Infinity;
      if (t < bestT) {
        bestT = t;
        bestId = patch.id;
      }
    }
  }
  return bestId;
}

const HIT_EPSILON = 0.001;

/**
 * Sphere-trace the composite (mode-dependent) field.
 *
 * gate-correction P2 (raymarchComposite robustness): compositeSdf composes
 * many primitives through smooth-min/smooth-boolean ops (opSmoothIntersection
 * / opSmoothSubtraction), which are NOT guaranteed Lipschitz-1 -- unlike a
 * plain union/intersection of exact-distance primitives, a smoothed blend
 * can, in the transition zone between two nearby primitives, report a value
 * LARGER than the true distance to the nearest surface. A naive
 * `t += d` sphere trace treats every `d` as a safe step size, so on a dense
 * real packing (141 patches close together, lots of blend zones) it can
 * step clean over a thin patch instead of landing on it -- this is exactly
 * what broke real-coordinate click-to-select on the real CoinSRF packing.
 *
 * Two changes address this without abandoning sphere tracing for the common
 * (open, uncluttered) case:
 *  1. Damp the step (`t += d * STEP_DAMPING`) and raise the iteration count,
 *     so a step that overshoots the true distance by some bounded factor
 *     still converges instead of tunnelling through.
 *  2. If damped sphere tracing still finds nothing, fall back to a coarse
 *     fixed-step linear scan for a sign change (positive -> at/below the hit
 *     epsilon, i.e. entering the solid) followed by bisection to refine the
 *     crossing. This is slower (bounded step count, not adaptive), but is
 *     immune to the Lipschitz assumption entirely -- it only relies on the
 *     field being continuous, which composite SDFs are.
 */
export function raymarchComposite(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  coinBulge: number,
  coinBulgeBalance = 0,
  maxDist = 50,
): CompositeHit | null {
  if (host.length === 0) return null;
  const sdf = (x: number, y: number, z: number) =>
    compositeSdf(mode, host, hostK, thickness, patches, roundK, x, y, z, coinBulge, coinBulgeBalance);

  const primaryT = dampedSphereTrace(sdf, origin, dir, maxDist);
  const t = primaryT ?? coarseScanWithBisection(sdf, origin, dir, maxDist);
  if (t === null) return null;

  const x = origin.x + dir.x * t;
  const y = origin.y + dir.y * t;
  const z = origin.z + dir.z * t;
  const point = new THREE.Vector3(x, y, z);
  const normal = estimateCompositeNormal(
    mode, host, hostK, thickness, patches, roundK, coinBulge, coinBulgeBalance, point,
  );
  const patchId = nearestPatchId(mode, patches, x, y, z);
  return { point, normal, patchId };
}

const STEP_DAMPING = 0.75;
const SPHERE_TRACE_ITERATIONS = 400;

function dampedSphereTrace(
  sdf: (x: number, y: number, z: number) => number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
): number | null {
  let t = 0;
  for (let i = 0; i < SPHERE_TRACE_ITERATIONS; i++) {
    const d = sdf(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    if (d < HIT_EPSILON) return t;
    t += d * STEP_DAMPING;
    if (t > maxDist) return null;
  }
  return null;
}

/**
 * Fixed-step linear scan for a crossing into the solid (d falling below the
 * hit epsilon), then bisection to refine the crossing point. Step count is
 * bounded (not resolution-adaptive to maxDist) to keep the fallback's worst
 * case bounded on a large scene -- this only runs after sphere tracing has
 * already failed, so it is off the interactive hot path.
 */
const COARSE_SCAN_STEPS = 3000;
const BISECTION_ITERATIONS = 24;

function coarseScanWithBisection(
  sdf: (x: number, y: number, z: number) => number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
): number | null {
  const step = maxDist / COARSE_SCAN_STEPS;
  let prevT = 0;
  if (sdf(origin.x, origin.y, origin.z) < HIT_EPSILON) return 0;
  for (let i = 1; i <= COARSE_SCAN_STEPS; i++) {
    const t = i * step;
    const d = sdf(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    if (d < HIT_EPSILON) {
      return bisectHitEpsilonCrossing(sdf, origin, dir, prevT, t);
    }
    prevT = t;
  }
  return null;
}

function bisectHitEpsilonCrossing(
  sdf: (x: number, y: number, z: number) => number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  tLo: number,
  tHi: number,
): number {
  let lo = tLo;
  let hi = tHi;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const d = sdf(origin.x + dir.x * mid, origin.y + dir.y * mid, origin.z + dir.z * mid);
    if (d < HIT_EPSILON) hi = mid;
    else lo = mid;
  }
  return hi;
}

function estimateCompositeNormal(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  coinBulge: number,
  coinBulgeBalance: number,
  p: THREE.Vector3,
): THREE.Vector3 {
  const e = 0.0015;
  const d = (x: number, y: number, z: number) =>
    compositeSdf(mode, host, hostK, thickness, patches, roundK, x, y, z, coinBulge, coinBulgeBalance);
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

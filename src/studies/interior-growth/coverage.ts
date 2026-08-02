// ---------------------------------------------------------------------------
// S-interior-growth — surface coverage measurement (S1 of
// Optimizer/docs/katachi-interior-growth-surface-coverage-plan-20260725.md).
//
// "表面" here means the HOST's own target boundary (hostSdf(p)=0), never the
// generated mesh's own surface — §1 "指定hostの目標境界面". The reference
// mesh is built ONCE from the host SDF alone (no dependency on any candidate,
// printer preset, or growth params), so all three candidates and every
// re-generation at the same host/resolution measure against the identical
// set of samples (§3.1 "同一host…同一resolution…printer preset変更によって
// サンプル分布自体を変えない").
//
// Sampling: fixed sample count N, drawn via inverse-CDF over triangle area
// (each triangle's selection probability is proportional to its own area,
// each accepted sample carries equal weight totalArea/N) with a seeded RNG.
// This was reconciled after discovering a second, independent S1
// implementation (surfaceCoverage.ts, since removed — see below) had reached
// the same area-weighted-sampling idea via fixed-N CDF sampling rather than
// this file's original one-sample-per-triangle-centroid approach. Consulted
// via `codex exec` (2026-07-25): fixed-N sampling decouples sample count from
// mesh/triangle resolution, avoiding aliasing when a coverage boundary
// crosses a triangle — the reference-mesh resolution and the sample count
// are now independent Study constants.
//
// Covered test: reconciled the same way. The other implementation's
// probe test used a GLOBAL smooth-min blend across all reachable units'
// points — flagged by codex review as capable of falsely fusing adjacent
// ring/coin material (or a ring's own opposite-side nodes) into apparent
// coverage, i.e. exactly the over-counting §5 forbids ("ringの穴を
// coveredとして数えない"). This file's original raw-sphere-union test avoided
// that over-count but under-counted ring coverage in exchange: adjacent ring
// NODE spheres don't fully overlap, so probe points over the true tube
// surface BETWEEN nodes could land outside every node's own raw ball. Fixed
// by testing ring material as a tapered-capsule union along the node chain
// (points are already emitted in closed-loop order by generateRingBalls, see
// growth.ts's buildRingPoints) instead of either a blended field or a raw
// sphere union. Coin material stays a raw point-sphere union — a coin has no
// interior hole to protect, and its sub-points already overlap into one
// blob by construction (buildCoinPoints).
//
// Reachability: reconciled a real bug the same review caught — the original
// `findCoveringUnit` walked `units` in array order and returned the FIRST
// unit whose material contained the probe point, even if that unit was
// unreachable while a later, reachable unit's material also covered the same
// point. Fixed by computing the full reachable-unit-id set once, then
// classifying a sample as "covered" if ANY reachable unit's material covers
// it (falling back to "unreachable" only if no reachable unit does but some
// unreachable one does, and "no-material" only if none do at all).
// ---------------------------------------------------------------------------

import { buildMeshFromField, type Bounds, type Triangle } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import { hostBounds, hostSdf, type GrowthUnit, type GrowthUnitPoint, type HostFixtureId, type Vec3 } from "./field.ts";

export interface SurfaceSample {
  id: number;
  point: Vec3;
  /** Points INTO the host (opposite the reference mesh's own outward-oriented triangle normal). */
  inwardNormal: Vec3;
  /** Every sample carries the SAME weight (totalReferenceArea / sampleCount) — an equal-weight Monte Carlo estimator over an area-proportional draw. Never renormalized per-candidate; callers sum raw weights so the denominator is always the reference mesh's actual total surface area. */
  areaWeight: number;
}

function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function vCross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function vLen(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function vScale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function vDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Padding around the host's own bounds so the marching-tetrahedra pass has room to close the isosurface exactly at hostSdf=0, same margin idiom as computeUnitBounds in meshExport.ts. */
function paddedHostBounds(hostId: HostFixtureId): Bounds {
  const b = hostBounds(hostId);
  const margin = Math.max(0.05, b.longest * 0.03);
  const min = { x: b.min.x - margin, y: b.min.y - margin, z: b.min.z - margin };
  const max = { x: b.max.x + margin, y: b.max.y + margin, z: b.max.z + margin };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

function triangleNormal(tri: Triangle): Vec3 {
  const n = vCross(vSub(tri.b, tri.a), vSub(tri.c, tri.a));
  const len = vLen(n) || 1;
  return vScale(n, 1 / len);
}

function triangleArea(tri: Triangle): number {
  const n = vCross(vSub(tri.b, tri.a), vSub(tri.c, tri.a));
  return vLen(n) / 2;
}

/** Study constant — the reference mesh's own marching-tetrahedra resolution. Independent of COVERAGE_SAMPLE_COUNT (below): this only needs to be fine enough that the host's true boundary is well-approximated, not tied to how many surface samples are drawn from it. */
export const COVERAGE_REFERENCE_RESOLUTION = 48;

/** Study constant — fixed sample count, decoupled from mesh resolution so the same N is drawn regardless of triangle count (avoids the aliasing a fixed one-sample-per-triangle scheme would have when a coverage boundary crosses a triangle). */
export const COVERAGE_SAMPLE_COUNT = 4000;

/** Study constant — fixed seed for the reference sampling draw itself (distinct from the growth seed): the reference sample SET must be identical across variants/printer-preset changes for a given host, never reseeded per-run. */
export const COVERAGE_SAMPLE_SEED = "s-interior-growth-coverage-reference-v2";

/**
 * The "coverage reference mesh", reduced directly to a fixed-N area-weighted
 * sample list — callers never need the triangles themselves. Built ONCE from
 * hostSdf alone (never the generated candidate mesh, §3.1). Marching-
 * tetrahedra's own orientTriangle already makes every triangle normal point
 * along +gradient(hostSdf), i.e. outward — inwardNormal is simply the
 * negation, no extra orientation pass needed.
 */
export function buildCoverageReferenceSamples(
  hostId: HostFixtureId,
  resolution: number = COVERAGE_REFERENCE_RESOLUTION,
  sampleCount: number = COVERAGE_SAMPLE_COUNT,
  seed: string = COVERAGE_SAMPLE_SEED,
): SurfaceSample[] {
  const bounds = paddedHostBounds(hostId);
  const mesh = buildMeshFromField(bounds, (x, y, z) => hostSdf(hostId, x, y, z), { resolution, targetLongestMm: 1 });
  const triangles = mesh.triangles;
  if (triangles.length === 0) return [];

  const areas = new Float64Array(triangles.length);
  let totalArea = 0;
  for (let i = 0; i < triangles.length; i++) {
    const area = triangleArea(triangles[i]);
    areas[i] = area;
    totalArea += area;
  }
  if (totalArea <= 0) return [];

  const cdf = new Float64Array(triangles.length);
  let acc = 0;
  for (let i = 0; i < triangles.length; i++) {
    acc += areas[i];
    cdf[i] = acc / totalArea;
  }

  const rng = makeRng(hashSeed(seed));
  const areaWeight = totalArea / sampleCount;
  const samples: SurfaceSample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    // Stratified draw over [0,1): sample i falls in [i/N, (i+1)/N) — full area coverage without N draws clustering, while cdf inversion keeps the pick area-proportional per triangle.
    const u = (i + rng()) / sampleCount;
    let low = 0;
    let high = triangles.length - 1;
    let triIdx = high;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cdf[mid] >= u) {
        triIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    if (areas[triIdx] <= 0) {
      for (let j = 0; j < triangles.length; j++) {
        if (areas[j] > 0) { triIdx = j; break; }
      }
    }

    // Uniform-in-triangle barycentric draw (standard sqrt trick).
    const r1 = rng();
    const r2 = rng();
    const sqrtR1 = Math.sqrt(r1);
    const wa = 1 - sqrtR1;
    const wb = sqrtR1 * (1 - r2);
    const wc = sqrtR1 * r2;
    const tri = triangles[triIdx];
    const point: Vec3 = {
      x: tri.a.x * wa + tri.b.x * wb + tri.c.x * wc,
      y: tri.a.y * wa + tri.b.y * wb + tri.c.y * wc,
      z: tri.a.z * wa + tri.b.z * wb + tri.c.z * wc,
    };
    const outward = triangleNormal(tri);
    samples.push({ id: i, point, inwardNormal: vScale(outward, -1), areaWeight });
  }
  return samples;
}

/**
 * §3.2's probe depth: derived from the unit's OWN size, never an author/
 * printer input (the plan doc is explicit: "作者のprinter設定として扱わない").
 * Half a unit radius reaches just past a unit's own surface without punching
 * all the way through a thin single-unit wall.
 */
export function computeProbeDepthField(unitRadius: number): number {
  return unitRadius * 0.5;
}

/** Closest point on segment ab to p, parameterized 0..1 and clamped. */
function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): { point: Vec3; t: number } {
  const ab = vSub(b, a);
  const abLenSq = vDot(ab, ab);
  let t = abLenSq > 1e-12 ? vDot(vSub(p, a), ab) / abLenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return { point: vAdd(a, vScale(ab, t)), t };
}

/** True if `point` lies within the tapered capsule between node spheres a and b (radius linearly interpolated along the segment). Used for ring material: adjacent node spheres don't fully overlap, so a raw per-node-sphere union under-counts the actual tube surface between them, while this models the tube itself. */
function pointInTaperedCapsule(point: Vec3, a: GrowthUnitPoint, b: GrowthUnitPoint): boolean {
  const { point: closest, t } = closestPointOnSegment(point, a, b);
  const r = a.r + (b.r - a.r) * t;
  const dx = point.x - closest.x, dy = point.y - closest.y, dz = point.z - closest.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/**
 * Per-unit material test (§3.2 step 1, "material field内にある"), kind-aware:
 * - coin: union of its own raw point-spheres (they already overlap into one
 *   blob by construction — buildCoinPoints in growth.ts).
 * - ring: union of tapered capsules along the CLOSED node chain (points are
 *   emitted in loop order by generateRingBalls; wraparound closes the loop).
 *   Deliberately NOT a smooth-min blend and NOT a raw node-sphere union —
 *   see the file header for why both of those misclassify ring coverage.
 */
export function isInsideUnitMaterial(point: Vec3, unit: GrowthUnit): boolean {
  const pts = unit.points;
  if (unit.kind === "coin") {
    for (const p of pts) {
      const dx = point.x - p.x, dy = point.y - p.y, dz = point.z - p.z;
      if (dx * dx + dy * dy + dz * dz <= p.r * p.r) return true;
    }
    return false;
  }
  // ring
  if (pts.length === 1) {
    const p = pts[0];
    const dx = point.x - p.x, dy = point.y - p.y, dz = point.z - p.z;
    return dx * dx + dy * dy + dz * dz <= p.r * p.r;
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (pointInTaperedCapsule(point, a, b)) return true;
  }
  return false;
}

/** Walks parentId back to a build-plate root. Bounded by units.size+1 hops — growth.ts only ever assigns parentId to an already-registered earlier unit, so a cycle cannot occur by construction; the hop bound is a defensive backstop, not a cycle detector. */
function isUnitReachableToRoot(unit: GrowthUnit, byId: Map<number, GrowthUnit>): boolean {
  let cur: GrowthUnit | undefined = unit;
  let hops = 0;
  while (cur && cur.parentId !== null && hops < byId.size + 1) {
    cur = byId.get(cur.parentId);
    hops++;
  }
  return !!cur && cur.supportContact === "build-plate";
}

/** Full reachable-unit-id set, computed once per coverage pass (not re-walked per sample-per-unit). */
export function computeReachableUnitIds(units: GrowthUnit[]): Set<number> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const reachable = new Set<number>();
  for (const u of units) {
    if (isUnitReachableToRoot(u, byId)) reachable.add(u.id);
  }
  return reachable;
}

export type SampleStatus = "covered" | "no-material" | "unreachable";

export interface ClassifiedSample {
  sample: SurfaceSample;
  status: SampleStatus;
}

/**
 * §3.2's two-step covered test, corrected for reachable-set-first evaluation
 * (see file header): "covered" if ANY reachable unit's own material contains
 * the probe point; "unreachable" if only unreachable units' material does
 * (material present but orphaned — should not occur given growNetwork's own
 * invariants, but classified honestly rather than assumed, §5's "黙って分母
 * から除外しない"); "no-material" if no unit's material reaches the probe at
 * all.
 */
export function classifySample(sample: SurfaceSample, units: GrowthUnit[], reachableIds: Set<number>, probeDepthField: number): ClassifiedSample {
  const probe = vAdd(sample.point, vScale(sample.inwardNormal, probeDepthField));
  let anyMaterial = false;
  for (const u of units) {
    if (!isInsideUnitMaterial(probe, u)) continue;
    if (reachableIds.has(u.id)) return { sample, status: "covered" };
    anyMaterial = true;
  }
  return { sample, status: anyMaterial ? "unreachable" : "no-material" };
}

export interface SurfaceCoverageResult {
  measuredCoverage: number;
  totalWeight: number;
  coveredWeight: number;
  noMaterialWeight: number;
  unreachableWeight: number;
  sampleCount: number;
  coveredSampleCount: number;
  noMaterialSampleCount: number;
  unreachableSampleCount: number;
  probeDepthField: number;
  classified: ClassifiedSample[];
}

/**
 * §3.2's ratio, computed over the FULL reference sample set every time — the
 * denominator (`totalWeight`) never shrinks to exclude unreachable or
 * unreached area (§3.3 "常に…host全表面を分母とする").
 */
export function computeSurfaceCoverage(samples: SurfaceSample[], units: GrowthUnit[], probeDepthField: number): SurfaceCoverageResult {
  const reachableIds = computeReachableUnitIds(units);
  let totalWeight = 0;
  let coveredWeight = 0;
  let noMaterialWeight = 0;
  let unreachableWeight = 0;
  let coveredSampleCount = 0;
  let noMaterialSampleCount = 0;
  let unreachableSampleCount = 0;
  const classified: ClassifiedSample[] = [];
  for (const s of samples) {
    const c = classifySample(s, units, reachableIds, probeDepthField);
    classified.push(c);
    totalWeight += s.areaWeight;
    if (c.status === "covered") {
      coveredWeight += s.areaWeight;
      coveredSampleCount++;
    } else if (c.status === "no-material") {
      noMaterialWeight += s.areaWeight;
      noMaterialSampleCount++;
    } else {
      unreachableWeight += s.areaWeight;
      unreachableSampleCount++;
    }
  }
  return {
    measuredCoverage: totalWeight > 0 ? coveredWeight / totalWeight : 0,
    totalWeight,
    coveredWeight,
    noMaterialWeight,
    unreachableWeight,
    sampleCount: samples.length,
    coveredSampleCount,
    noMaterialSampleCount,
    unreachableSampleCount,
    probeDepthField,
    classified,
  };
}

const referenceSamplesCache = new Map<string, SurfaceSample[]>();

/** Cached by hostId+resolution+sampleCount+seed — the reference sample set is host-only (§3.1), so it never needs rebuilding for a printer/param change, only when the host or the Study's own reference constants change. */
export function getCoverageReferenceMesh(
  hostId: HostFixtureId,
  resolution: number = COVERAGE_REFERENCE_RESOLUTION,
  sampleCount: number = COVERAGE_SAMPLE_COUNT,
  seed: string = COVERAGE_SAMPLE_SEED,
): SurfaceSample[] {
  const key = `${hostId}:${resolution}:${sampleCount}:${seed}`;
  let cached = referenceSamplesCache.get(key);
  if (!cached) {
    cached = buildCoverageReferenceSamples(hostId, resolution, sampleCount, seed);
    referenceSamplesCache.set(key, cached);
  }
  return cached;
}

/**
 * Why growth stopped. Only `target-reached` is success — every other value is
 * an honest non-success reason and is never reported as if the target had been
 * met (O2 §6.5: "budget切れを成功扱いしない").
 *
 * The `base-*`/`trunk-*`/`surface-spread-blocked` members were added with the
 * connected-base + multi-source rewrite so a stall can be attributed to the
 * STAGE it happened in, instead of every stall collapsing into one
 * "candidate-budget-exhausted" that says nothing about which part of the
 * shape principle ran out first.
 */
export type CoverageStopReason =
  | "target-reached"
  | "coverage-unreachable"
  | "candidate-budget-exhausted"
  | "base-budget-exhausted"
  | "trunk-budget-exhausted"
  | "surface-spread-blocked"
  | "support-angle-blocked"
  | "host-boundary-blocked"
  | "mesh-connectivity-failed"
  | "not-run";

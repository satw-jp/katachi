// ---------------------------------------------------------------------------
// S-interior-growth — S2.1 "coverage attainment" support machinery
// (Optimizer/docs/sonnet-instruction-20260725-katachi-interior-growth-s2-1-
// coverage-attainment.md). Everything here is a SEARCH/SCORING aid for
// growth.ts's growSurfaceColonization — none of it redefines what "covered"
// means (that stays coverage.ts's computeSurfaceCoverage alone, §3's
// invariant) or is ever saved as the final measured coverage (§3: "最終
// coverageは必ず正本computeSurfaceCoverageで再計算する").
//
// Three pieces, each addressing one diagnosed cause of S2's low attainment
// (instruction §4):
// 1. Regions (§5.1): reference samples grouped into small deterministic grid
//    cells so target selection reasons about "an unreached patch of surface"
//    instead of one arbitrary point, and height-band quotas keep targets
//    from clustering at a single height band.
// 2. A reachability cone test (§5.2): reuses rule 5's OWN lateral:vertical
//    cap (see growth.ts's evaluateCandidate) to cheaply reject a frontier-
//    target pair that could never be connected under the current support
//    angle, before spending a candidate-generation attempt on it.
// 3. A spatial hash (§5.6) for unit points, so "does this candidate touch
//    ANY existing material" (used both by ordinary parent-contact checks and
//    by the plate-connected-base frontier's own connectivity requirement)
//    doesn't rescan every unit's every point every time.
// ---------------------------------------------------------------------------

import { allowedLateralForStepMm, vAdd, vDot, vLen, vScale, vSub, type Vec3 } from "./field.ts";
import type { GrowthUnit, GrowthUnitKind, GrowthUnitPoint } from "./field.ts";
import { isInsideUnitMaterial, type SurfaceSample } from "./coverage.ts";
import type { Bounds } from "./field.ts";

// --- §5.1 regions -------------------------------------------------------

export interface SurfaceRegion {
  id: string;
  sampleIds: number[];
  totalWeight: number;
  centroid: Vec3;
  /** Mean of member samples' own inward normals — an approximate "which way is inward" for the region as a whole, used to place an aim point pulled inward from the region centroid. Not renormalized to unit length by callers that need direction only (aim-point placement scales it anyway). */
  avgInwardNormal: Vec3;
  /** Index into a fixed set of build-axis height bands (see computeSurfaceRegions) — used for the height-band quota in target selection, not for the coverage measurement itself. */
  heightBand: number;
}

const TARGET_SAMPLES_PER_REGION = 14; // Study仮値: small enough that a region reads as "a patch", large enough that 4000 samples don't explode into thousands of near-empty regions
export const HEIGHT_BAND_COUNT = 8; // Study仮値, matches the quota granularity §5.1 asks for without being so fine it starves any one band of candidates

/**
 * Deterministic region assignment: a uniform 3D grid over the (padded) host
 * bounds, cell size chosen so the average region holds ~TARGET_SAMPLES_PER_REGION
 * samples. Region id is the quantized cell coordinate string, so the SAME
 * host+resolution+sampleCount+seed always produces the SAME region ids for
 * the SAME samples (§8 test 3's determinism requirement) — no randomness,
 * no dependency on growth state.
 */
export function computeSurfaceRegions(samples: SurfaceSample[], bounds: Bounds, buildAxis: Vec3): { regionOf: Map<number, string>; regions: Map<string, SurfaceRegion> } {
  const targetRegionCount = Math.max(1, Math.round(samples.length / TARGET_SAMPLES_PER_REGION));
  const volume = Math.max(1e-9, bounds.size.x * bounds.size.y * bounds.size.z);
  const cellSize = Math.max(1e-6, Math.cbrt(volume / targetRegionCount));

  const axis = vLen(buildAxis) > 1e-9 ? vScale(buildAxis, 1 / vLen(buildAxis)) : { x: 0, y: 1, z: 0 };
  const heights = samples.map((s) => vDot(s.point, axis));
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const heightSpan = Math.max(1e-9, maxH - minH);

  const regionOf = new Map<number, string>();
  const regions = new Map<string, SurfaceRegion>();
  for (const s of samples) {
    const ix = Math.floor((s.point.x - bounds.min.x) / cellSize);
    const iy = Math.floor((s.point.y - bounds.min.y) / cellSize);
    const iz = Math.floor((s.point.z - bounds.min.z) / cellSize);
    const id = `${ix},${iy},${iz}`;
    regionOf.set(s.id, id);
    let region = regions.get(id);
    if (!region) {
      const h = vDot(s.point, axis);
      const band = Math.min(HEIGHT_BAND_COUNT - 1, Math.max(0, Math.floor(((h - minH) / heightSpan) * HEIGHT_BAND_COUNT)));
      region = { id, sampleIds: [], totalWeight: 0, centroid: { x: 0, y: 0, z: 0 }, avgInwardNormal: { x: 0, y: 0, z: 0 }, heightBand: band };
      regions.set(id, region);
    }
    region.sampleIds.push(s.id);
    region.totalWeight += s.areaWeight;
    region.centroid = vAdd(region.centroid, s.point);
    region.avgInwardNormal = vAdd(region.avgInwardNormal, s.inwardNormal);
  }
  for (const region of regions.values()) {
    const n = Math.max(1, region.sampleIds.length);
    region.centroid = vScale(region.centroid, 1 / n);
    const normalLen = vLen(region.avgInwardNormal) || 1;
    region.avgInwardNormal = vScale(region.avgInwardNormal, 1 / normalLen);
  }
  return { regionOf, regions };
}

// --- §5.2 reachability cone ----------------------------------------------

export interface ConeCheck {
  feasible: boolean;
  verticalRiseField: number;
  lateralDistField: number;
}

/**
 * Cheap pre-filter, NOT a guarantee: reuses rule 5's own per-step cap
 * (lateralStepMm <= verticalStepMm / tan(supportThresholdAngleDeg) for a
 * positive-rise step — see evaluateCandidate) generalized to a multi-step
 * bound. Since that cap is linear and additive across steps, the maximum
 * lateral distance reachable over a path whose TOTAL vertical rise is R is
 * bounded by R/tan(angle), regardless of how many steps the path takes —
 * so a target whose straight-line lateral distance already exceeds that
 * bound cannot be reached by ANY sequence of valid steps, no matter how
 * cleverly they're arranged. A target within the bound is not guaranteed
 * reachable (host geometry, ring-specific rules, and material overlap can
 * still block it) — this only rules out the geometrically hopeless cases
 * before spending a real candidate-generation attempt on them (§5.2).
 */
/**
 * S2.1 audit-fix §4: this used to be an independently-reimplemented formula
 * (`verticalRise/tan(angle-margin)`) that moved in the OPPOSITE direction
 * from evaluateCandidate's own tilt cap as margin changed — an inconsistency
 * the audit caught. It now calls the SAME shared `allowedLateralForStepMm`
 * (field.ts) the real rule uses, integrated over an ESTIMATED route of
 * roughly-equal steps (via `stepLengthField`) rather than a single
 * continuous formula — because that per-step floor (never less than one
 * layer's worth of lateral, even for a tiny rise) means many small steps
 * can reach further, in total, than a naive verticalRise/tan(angle)
 * estimate suggests (audit §4.1).
 *
 * This is a PRIORITY/planning estimate, not a hard proof of reachability
 * (§4.2 "連続coneを残す場合はhard excludeに使わず、priorityの楽観的推定に限定する")
 * — callers should prefer feasible-looking frontiers but must not refuse to
 * try an "infeasible" one outright, since the real per-step evaluateCandidate
 * rule (and the actual, not estimated, step geometry) is the only true
 * arbiter.
 */
export function coneReachable(
  fromCentroid: Vec3,
  toPoint: Vec3,
  buildAxis: Vec3,
  layerHeightMm: number,
  derivedMaxLateralAdvancePerLayerMm: number,
  canonicalScaleMmPerUnit: number,
  stepLengthField: number,
): ConeCheck {
  const axis = vLen(buildAxis) > 1e-9 ? vScale(buildAxis, 1 / vLen(buildAxis)) : { x: 0, y: 1, z: 0 };
  const rel = vSub(toPoint, fromCentroid);
  const verticalRiseField = vDot(rel, axis);
  const lateralDistField = vLen(vSub(rel, vScale(axis, verticalRiseField)));
  if (verticalRiseField <= 1e-9) {
    // Rule 5's own flat/negative-rise branch only allows a tiny lateral
    // advance (capped at the per-layer allowance itself, not scaled by
    // rise) — treat "target at or below frontier height" as reachable only
    // when it's already essentially at the same point (no real lateral
    // travel needed), matching that same physical restriction.
    return { feasible: lateralDistField < 1e-6, verticalRiseField, lateralDistField };
  }
  // Route-level integration: estimate the step count from straight-line
  // distance / step length (a reasonable lower bound on how many steps a
  // real route would take), split the total rise evenly across them, and
  // sum each step's OWN allowedLateralForStepMm (which floors at one
  // layer's worth even for a sub-layer rise) — not
  // `totalRise/tan(angle)` treated as if it were exact for an arbitrary
  // number of steps.
  const straightLineDistField = Math.hypot(verticalRiseField, lateralDistField);
  const stepCount = Math.max(1, Math.ceil(straightLineDistField / Math.max(1e-6, stepLengthField)));
  const verticalRiseMm = verticalRiseField * canonicalScaleMmPerUnit;
  const perStepVerticalMm = verticalRiseMm / stepCount;
  const perStepAllowedLateralMm = allowedLateralForStepMm(perStepVerticalMm, layerHeightMm, derivedMaxLateralAdvancePerLayerMm);
  const routeLateralBudgetMm = perStepAllowedLateralMm * stepCount;
  const lateralDistMm = lateralDistField * canonicalScaleMmPerUnit;
  return { feasible: lateralDistMm <= routeLateralBudgetMm, verticalRiseField, lateralDistField };
}

// --- O2 §6.2 route cost / region assignment ---------------------------------

/**
 * Expected number of accepted units to get from `from` to `toAim` under the
 * current support angle, growing at `stepLengthField` per step with a maximum
 * tilt of `tiltRad` off the build axis. This is the §6.2 cost the region
 * assignment minimizes — deliberately NOT Euclidean distance, because two
 * points the same distance away cost wildly different amounts depending on
 * how much of that distance is lateral (a lateral move must "buy" vertical
 * rise it may not have room for) and on whether the target sits BELOW the
 * launch point (rule 5 rejects a negative rise outright, so the only way
 * down is not to go there at all).
 *
 * Returns Infinity for a target the cone genuinely cannot serve, so callers
 * can distinguish "expensive" from "impossible" instead of both collapsing
 * into one large number.
 */
export function estimateRouteUnitCost(from: Vec3, toAim: Vec3, buildAxis: Vec3, tiltRad: number, stepLengthField: number): number {
  const axis = vLen(buildAxis) > 1e-9 ? vScale(buildAxis, 1 / vLen(buildAxis)) : { x: 0, y: 1, z: 0 };
  const rel = vSub(toAim, from);
  const rise = vDot(rel, axis);
  const lateral = vLen(vSub(rel, vScale(axis, rise)));
  const step = Math.max(1e-6, stepLengthField);
  // Per-step budget at the steepest tilt the support angle allows.
  const perStepLateral = step * Math.sin(tiltRad);
  const perStepRiseAtMaxTilt = step * Math.cos(tiltRad);
  if (perStepLateral <= 1e-9) return rise >= -1e-9 ? Math.ceil(Math.max(0, rise) / Math.max(1e-9, step)) : Infinity;
  // Steps needed to cover the lateral distance, and the rise those steps
  // necessarily produce along the way. A target BELOW the frontier by more
  // than the rise that lateral travel forces is unreachable: every step must
  // be non-descending.
  const lateralSteps = lateral / perStepLateral;
  const forcedRise = lateralSteps * perStepRiseAtMaxTilt;
  if (rise < -1e-9 && Math.abs(rise) > 1e-9) return Infinity;
  if (forcedRise > rise + 1e-9) {
    // Lateral travel forces more climb than the target has headroom for —
    // reachable only by weaving (longer path), approximated by the vertical-
    // limited count. Still finite: weaving is a real option, just costly.
    const verticalSteps = rise / Math.max(1e-9, perStepRiseAtMaxTilt);
    return Math.ceil(Math.max(lateralSteps, verticalSteps) * (1 + (forcedRise - rise) / Math.max(1e-9, forcedRise)));
  }
  const verticalSteps = rise / Math.max(1e-9, step);
  return Math.ceil(Math.max(lateralSteps, verticalSteps));
}

export interface LaunchPoint {
  unitId: number;
  centroid: Vec3;
}

export interface RegionAssignment {
  /** region id -> launch point unit id serving it. */
  launchOf: Map<string, number>;
  /** region id -> that route's estimated unit cost (Infinity kept, never silently dropped). */
  costOf: Map<string, number>;
  /** launch unit id -> region ids assigned to it, in deterministic id order. */
  regionsOf: Map<number, string[]>;
}

/**
 * §6.2: every region goes to the launch point with the lowest
 * `estimateRouteUnitCost`, ties broken by the smaller unit id so the same
 * inputs always produce the same assignment (§11 test 4). Regions no launch
 * point can serve keep an Infinity cost and are still recorded — the caller
 * decides what to do with them, they are never quietly removed from the
 * denominator.
 */
export function assignRegionsToLaunchPoints(
  regions: Map<string, SurfaceRegion>,
  launches: LaunchPoint[],
  aimOf: (region: SurfaceRegion) => Vec3,
  buildAxis: Vec3,
  tiltRad: number,
  stepLengthField: number,
): RegionAssignment {
  const launchOf = new Map<string, number>();
  const costOf = new Map<string, number>();
  const regionsOf = new Map<number, string[]>();
  for (const l of launches) regionsOf.set(l.unitId, []);
  const regionIds = [...regions.keys()].sort();
  for (const rid of regionIds) {
    const region = regions.get(rid)!;
    const aim = aimOf(region);
    let bestCost = Infinity;
    let bestId: number | null = null;
    for (const l of launches) {
      const cost = estimateRouteUnitCost(l.centroid, aim, buildAxis, tiltRad, stepLengthField);
      if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && bestId !== null && l.unitId < bestId)) {
        bestCost = cost;
        bestId = l.unitId;
      }
    }
    costOf.set(rid, bestCost);
    if (bestId !== null) {
      launchOf.set(rid, bestId);
      regionsOf.get(bestId)!.push(rid);
    }
  }
  return { launchOf, costOf, regionsOf };
}

/**
 * §6.2's support-angle term: can material actually TRAVEL ALONG the host
 * surface here, or only be placed on it one unit at a time?
 *
 * Let `alpha` be the angle between the surface's outward normal and the build
 * axis. The tangent plane is perpendicular to that normal, so the tangent
 * direction closest to the build axis sits `|90deg - alpha|` away from it. A
 * step is only valid within `tiltRad` of the build axis (rule 5's own cap, see
 * colonizeTiltRad), so surface-following is possible exactly when
 * `|90deg - alpha| <= tiltRad`.
 *
 * This is not a nicety — it is the difference between a region that pays for
 * itself and one that does not. A sphere at the default 30deg threshold is
 * traversable only between about y=-0.63 and its top cap; below that its own
 * surface is steeper (60.5deg at y=-1.0) than the 57deg cone, so each unit of
 * coverage down there needs its own fresh approach from the interior instead
 * of continuing from its neighbour. Measured: with every region treated as
 * equally worth committing to, sphere spent its whole budget in the bottom cap
 * (every spread unit below height 0.17 on a host 2.3 tall) and stalled at 6-7%.
 *
 * Callers must use this to PRIORITIZE, never to exclude: a non-traversable
 * region is still coverable, just expensive, and it stays in the denominator.
 */
export function isSurfaceTraversable(inwardNormal: Vec3, buildAxis: Vec3, tiltRad: number): boolean {
  const axis = vLen(buildAxis) > 1e-9 ? vScale(buildAxis, 1 / vLen(buildAxis)) : { x: 0, y: 1, z: 0 };
  const outward = vScale(inwardNormal, -1);
  const len = vLen(outward);
  if (len < 1e-9) return true;
  const cosAlpha = Math.max(-1, Math.min(1, vDot(outward, axis) / len));
  const alpha = Math.acos(cosAlpha);
  return Math.abs(Math.PI / 2 - alpha) <= tiltRad;
}

// --- O2 §6.4 local tangent plane --------------------------------------------

/**
 * An orthonormal pair spanning the plane TANGENT to the host surface at a
 * point whose outward normal is `outwardNormal`.
 *
 * This is the piece §6.4 insists on ("「接線方向」と書くだけで、固定azimuth fanを
 * 再利用しない。sample normalから局所接平面を実際に作る"). The S2.1 code it
 * replaces built its "spread" headings as a fixed fan of azimuths around the
 * BUILD AXIS, which has nothing to do with where the host's surface actually
 * faces: against a flat vertical wall, most of that fan points straight
 * through the wall. That was measurable, not theoretical — the O1 diagnosis
 * found `host-exterior` was the single largest rejection reason on all three
 * hosts (box 2890, sphere 5114, waisted 7059) and the reason box plateaued
 * into `host-boundary-blocked` at 2.85%.
 */
export function localTangentBasis(outwardNormal: Vec3): { t1: Vec3; t2: Vec3 } {
  const n = vLen(outwardNormal) > 1e-9 ? vScale(outwardNormal, 1 / vLen(outwardNormal)) : { x: 0, y: 1, z: 0 };
  const helper = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1raw = vSub(helper, vScale(n, vDot(helper, n)));
  const l = vLen(t1raw);
  const t1 = l > 1e-9 ? vScale(t1raw, 1 / l) : { x: 1, y: 0, z: 0 };
  const t2 = {
    x: n.y * t1.z - n.z * t1.y,
    y: n.z * t1.x - n.x * t1.z,
    z: n.x * t1.y - n.y * t1.x,
  };
  return { t1, t2 };
}

/** `dir` with its component along `outwardNormal` removed (and a small inward bias applied), renormalized. Zero-length results fall back to `fallback`. */
export function projectOntoTangentPlane(dir: Vec3, outwardNormal: Vec3, inwardBias: number, fallback: Vec3): Vec3 {
  const n = vLen(outwardNormal) > 1e-9 ? vScale(outwardNormal, 1 / vLen(outwardNormal)) : { x: 0, y: 1, z: 0 };
  const tangential = vSub(dir, vScale(n, vDot(dir, n)));
  const biased = vSub(tangential, vScale(n, inwardBias));
  const l = vLen(biased);
  return l > 1e-9 ? vScale(biased, 1 / l) : fallback;
}

// --- §5.6 spatial hash ------------------------------------------------------

/** Minimal uniform-grid spatial hash — self-contained, Study-local (instruction §5.6: "小さいbinary heap/gridはStudy内で実装してよい"), not promoted to a shared Library since no second Study needs it yet. */
export class SpatialHash<T> {
  private cellSize: number;
  private cells = new Map<string, { point: Vec3; item: T }[]>();

  constructor(cellSize: number) {
    this.cellSize = Math.max(1e-6, cellSize);
  }

  private key(x: number, y: number, z: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }

  insert(point: Vec3, item: T): void {
    const k = this.key(point.x, point.y, point.z);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push({ point, item });
  }

  /** All items within `radius` of `point` (radius search over the 3x3x3 neighborhood of cells the sphere can touch — exact within that neighborhood, not an approximation of WHICH items qualify, only of which cells are scanned). */
  queryRadius(point: Vec3, radius: number): T[] {
    const out: T[] = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    const cz = Math.floor(point.z / this.cellSize);
    const r2 = radius * radius;
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const bucket = this.cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bucket) continue;
          for (const entry of bucket) {
            const dxp = entry.point.x - point.x;
            const dyp = entry.point.y - point.y;
            const dzp = entry.point.z - point.z;
            if (dxp * dxp + dyp * dyp + dzp * dzp <= r2) out.push(entry.item);
          }
        }
      }
    }
    return out;
  }
}

// --- §5's incremental coverage gain (feeds Gate A + §5.5's score) ----------
// Gate A's OWN contract (§5.6, §3): this is a fast ESTIMATE used only to
// choose between candidates during search. The authoritative number is
// always a fresh computeSurfaceCoverage over the real accepted unit set —
// growth.ts's growSurfaceColonization cross-checks this against that full
// recompute periodically and treats drift as a bug, never as acceptable
// approximation error to just live with.

/** Reference samples indexed by position for the marginal-gain radius query below. Built once per colonization run (samples don't move), not per candidate. */
export function buildSampleSpatialHash(samples: SurfaceSample[], cellSize: number): SpatialHash<SurfaceSample> {
  const hash = new SpatialHash<SurfaceSample>(cellSize);
  for (const s of samples) hash.insert(s.point, s);
  return hash;
}

export interface MarginalGainResult {
  gainedWeight: number;
  gainedSampleIds: number[];
  /** Weight of nearby samples this candidate's material also reaches but that were ALREADY covered before it — feeds the overlap penalty term (§5.5), not the coverage gain itself. */
  overlapWeight: number;
  /**
   * S2.1 audit-fix §6.3: total areaWeight of every sample the search even
   * LOOKED AT (covered, newly-gained, and no-material-here, all summed) —
   * a LOCAL denominator for normalizing coverageGain, instead of the whole
   * host's totalReferenceWeight. A single candidate's realistic gain is a
   * few thousandths of the whole host's area (audit-measured: ~0.0005-0.002)
   * — dividing by the whole host made the coverage-gain score term
   * structurally unable to compete with the other terms (audit-measured
   * material penalty ~0.116, two orders of magnitude larger). Dividing by
   * "how much of the locally-searched area did this candidate actually
   * cover" instead keeps the term on a comparable 0..1-ish scale.
   */
  localSearchWeight: number;
}

/**
 * Only samples within `searchRadiusField` of one of the candidate's own
 * points are even considered — this is what turns candidate scoring from an
 * O(sampleCount) scan into an O(local density) one. `candidate` only needs
 * kind+points (isInsideUnitMaterial's own two fields); a full GrowthUnit
 * isn't required since candidates aren't registered yet when this runs.
 */
export function estimateMarginalGain(
  candidate: { kind: GrowthUnitKind; points: GrowthUnitPoint[] },
  sampleHash: SpatialHash<SurfaceSample>,
  probeDepthField: number,
  alreadyCoveredIds: ReadonlySet<number>,
  searchRadiusField: number,
): MarginalGainResult {
  const seen = new Set<number>();
  let gainedWeight = 0;
  let overlapWeight = 0;
  let localSearchWeight = 0;
  const gainedSampleIds: number[] = [];
  for (const p of candidate.points) {
    const nearby = sampleHash.queryRadius(p, p.r + probeDepthField + searchRadiusField);
    for (const s of nearby) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      localSearchWeight += s.areaWeight;
      const probe = vAdd(s.point, vScale(s.inwardNormal, probeDepthField));
      if (!isInsideUnitMaterial(probe, candidate as GrowthUnit)) continue;
      if (alreadyCoveredIds.has(s.id)) {
        overlapWeight += s.areaWeight;
      } else {
        gainedWeight += s.areaWeight;
        gainedSampleIds.push(s.id);
      }
    }
  }
  return { gainedWeight, gainedSampleIds, overlapWeight, localSearchWeight };
}

// --- §5.5 multi-term candidate score ----------------------------------------

/** Study仮値 weights (never author-exposed, §5.5) — deliberately modest relative to coverageGain so a candidate that actually reduces uncovered area is essentially always favored over penalty-driven alternatives; the penalties break ties among several coverage-improving candidates rather than overriding coverage itself. */
export const SCORE_WEIGHTS = {
  materialCost: 0.15,
  supportRisk: 0.2,
  overlap: 0.25,
  pathLength: 0.1,
  boundaryRisk: 0.2,
};

export interface ScoreTerms {
  normalizedCoverageGain: number;
  normalizedAddedMaterial: number;
  normalizedConstraintMarginRisk: number;
  normalizedCoveredOverlap: number;
  normalizedAddedPathLength: number;
  normalizedHostBoundaryRisk: number;
}

export function computeCandidateScore(terms: ScoreTerms): number {
  return (
    terms.normalizedCoverageGain -
    SCORE_WEIGHTS.materialCost * terms.normalizedAddedMaterial -
    SCORE_WEIGHTS.supportRisk * terms.normalizedConstraintMarginRisk -
    SCORE_WEIGHTS.overlap * terms.normalizedCoveredOverlap -
    SCORE_WEIGHTS.pathLength * terms.normalizedAddedPathLength -
    SCORE_WEIGHTS.boundaryRisk * terms.normalizedHostBoundaryRisk
  );
}

// ---------------------------------------------------------------------------
// S-interior-growth: the support-constrained growth walk (instruction §7),
// void/reachability analysis (§8), and the coin/ring point generators (§3).
//
// Design note on RNG use: `growthDirection` (field.ts) is a pure function of
// POSITION — it draws no randomness. The seeded RNG here (`makeRng`, same
// mulberry32 as the rest of Katachi) is used ONLY for (a) where root/child
// candidate positions are sampled, (b) how many children a parent attempts,
// (c) the voidBias skip decision, and (d) coin sub-point scatter. Same seed +
// same params + same host + same variant -> byte-identical units/edges/
// rejected-reason counts, every time (verified in growth.test.ts).
//
// Reuse, not copy (AGENTS.md "推測で壊さない" / plan doc §3 "KumoのコードをKatachi
// へ丸ごとコピーしない"): `smoothMin` from cloud-sculpt/field.ts (pure number
// function), `generateRingBalls`/`rotateVector`/`vCross` from rings/ring.ts
// (S-rings' own chain generator, imported exactly like S-pack and S-skin
// already do), `hashSeed`/`makeRng` from cloud-sculpt/random.ts.
// ---------------------------------------------------------------------------

import { smoothMin } from "../cloud-sculpt/field.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import { generateRingBalls, rotateVector, vCross, type RingRecipe } from "../rings/ring.ts";
import { computeProbeDepthField, computeSurfaceCoverage, getCoverageReferenceMesh, type CoverageStopReason, type SurfaceSample } from "./coverage.ts";
import {
  assignRegionsToLaunchPoints,
  buildSampleSpatialHash,
  computeCandidateScore,
  computeSurfaceRegions,
  estimateMarginalGain,
  estimateRouteUnitCost,
  HEIGHT_BAND_COUNT,
  isSurfaceTraversable,
  localTangentBasis,
  projectOntoTangentPlane,
  SCORE_WEIGHTS,
  SpatialHash,
  type ScoreTerms,
  type SurfaceRegion,
} from "./colonization.ts";
import {
  allowedLateralForStepMm,
  buildPlateOffset,
  hashNoiseVec3,
  hostBounds,
  hostSdf,
  hostTopOffset,
  isEnvelopeValid,
  vAdd,
  vDot,
  vLen,
  vNorm,
  vSub,
  vScale,
  type Bounds,
  type FabricationEnvelope,
  type GrowthParams,
  type GrowthUnit,
  type GrowthUnitKind,
  type GrowthUnitPoint,
  type GrowthUnitRole,
  type HostFixtureId,
  type Vec3,
} from "./field.ts";

export type GrowthVariant = "field-only" | "coin-constrained" | "ring-constrained";

export const REJECTION_REASONS = [
  "host-exterior",
  "root-not-on-plate",
  "no-parent-contact",
  "lateral-advance-exceeded",
  "unsupported-span-exceeded",
  "ring-horizontal",
  "ring-discontinuous-support",
  "void-bias-skip",
  "negative-rise-rejected",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export function zeroRejectionCounts(): Record<RejectionReason, number> {
  const out = {} as Record<RejectionReason, number>;
  for (const r of REJECTION_REASONS) out[r] = 0;
  return out;
}

export interface GrowthResult {
  variant: GrowthVariant;
  hostId: HostFixtureId;
  params: GrowthParams;
  envelope: FabricationEnvelope;
  effectiveKind: GrowthUnitKind;
  constraintsActive: boolean;
  canonicalScaleMmPerUnit: number;
  units: GrowthUnit[];
  edges: { parentId: number; childId: number }[];
  rejected: Record<RejectionReason, number>;
  /** Number of graph roots (parentId===null units). After the S2.1 audit-fix (Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-s2-1-audit-fixes.md §3) this is always 1 (or 0 if no root was ever found) — growNetwork no longer creates independent extra roots. */
  rootCount: number;
  /**
   * O2 audit-fix §2.2: how many units' OWN MATERIAL actually reaches the build
   * plate, measured with `countActualPlateContacts` AFTER every growth stage
   * (including the connected base) has run. Distinct from `rootCount` (graph
   * roots only — always 1) and from `launchPointCount` (near-plate launch
   * CANDIDATES, a coarse centroid test).
   *
   * The old `plateContactCount` field this replaces was computed BEFORE the
   * connected base existed and measured centroids rather than material, so it
   * reported 2 on all three default coin hosts. It is deliberately NOT kept
   * under its old name (correction doc §2.2: "旧来の曖昧な値を同名で使い続けない").
   */
  actualPlateContactCount: number;
  /** Accepted units whose points poked past the host surface within the small documented tolerance (see evaluateCandidate) — recorded, never silent (instruction §5). */
  clippedUnitCount: number;
  /** Largest such poke, in field units, across all accepted units. 0 if none. */
  maxClipFieldUnits: number;
  /** True if Phase B/C's coverage-directed colonization plateaued before reaching the target coverage (stopReason "support-angle-blocked" or "host-boundary-blocked" — see coverageStopReason below). */
  earlyTerminated: boolean;
  /**
   * Lightweight rejected-candidate positions for THIS run's "rejected candidate
   * 表示toggle" (§9) — center + reason only, no point clusters kept. This is a
   * display convenience for the current 3-candidate batch, not a persisted
   * ledger: §7's "不合格候補は削除して忘れ" is honored at the geometry level
   * (sub-points are always discarded) and at the state level (a NEW
   * generateCandidates call replaces this array wholesale — see history.ts —
   * nothing rejected accumulates across generations). void-bias skips are
   * excluded (no candidate geometry was ever scored against a rule for them).
   */
  rejectedSamples: { center: Vec3; reason: RejectionReason; isRoot: boolean }[];
  /**
   * Stage 1A.1 (author feedback §5): the Phase A primary path, root-to-
   * highest-reached-unit, captured ONCE right after Phase A completes and
   * never touched by Phase B's branching/fill (verified in growth.test.ts —
   * "branch追加後もprimary path不変").
   */
  primaryPathUnitIds: number[];
  /** `(maxAcceptedProjection - buildPlateProjection) / (hostTopProjection - buildPlateProjection)`, clamped 0..1, measured across Phase A's own accepted units only (see primaryPathUnitIds doc). */
  heightCoverage: number;
  /** `heightCoverage >= 0.95`. */
  topReached: boolean;
  autoBudget: AutoBudget;
  /** §3.2 of the surface-coverage plan doc: final measured surface coverage after Phase B/C, over the FULL host reference-mesh sample set (never a shrunk denominator). */
  measuredSurfaceCoverage: number;
  /** Why Phase B/C stopped — "target-reached" is success; the others are honest non-success reasons, never silently reported as if the target were met. */
  coverageStopReason: CoverageStopReason;
  /**
   * S2.1 diagnostics (Optimizer/docs/sonnet-instruction-20260725-katachi-
   * interior-growth-s2-1-coverage-attainment.md §10) — never used to compute
   * measuredSurfaceCoverage itself, only recorded alongside it.
   *
   * `algorithmVersion` is always a real string: `S21_ALGORITHM_VERSION` for
   * anything actually grown by this file's own growSurfaceColonization, or
   * `"legacy-pre-s2.1"` for a result migrated in from a Phase 1A / Stage
   * 1A.1 / S2-era stored recipe (audit-fix §7: history.ts's migration
   * detects this specifically via algorithmVersion's OWN absence, not via
   * primaryPathUnitIds — an S2-era stored result already HAD
   * primaryPathUnitIds, so that check let S2 results through unmigrated).
   * The rest are nullable and stay `null` for a migrated legacy result
   * rather than being fabricated as 0/empty (audit §7.2: "古い結果の未測定値
   * を0として捏造しない") — the UI shows "未記録" for null, never a fake number.
   */
  algorithmVersion: string;
  regionCount: number | null;
  reachedRegionCount: number | null;
  zeroGainAcceptedCount: number | null;
  coverageCurve: number[] | null;
  /** |incremental running estimate at the end of the search - the canonical final recompute|. Should stay ~0; a real drift would indicate a bug in the incremental index, never silently absorbed into the saved coverage number (which is always the canonical recompute regardless of this value). null for a migrated legacy result. */
  incrementalFinalDrift: number | null;
  /**
   * Snapshot of the ACTUAL score weights used at generation time (audit
   * §7.3: "scoreWeightsを現在のglobal constantから書き出さない" — a replayed
   * legacy or even an older S2.1 recipe must not have provenance built from
   * whatever the CURRENT code's weights happen to be). `null` for a
   * migrated legacy result (weights didn't exist as a concept yet).
   */
  scoreWeights: Record<string, number> | null;
  /**
   * O2 §6.1/§6.2 diagnostics. All `null` for a result migrated in from an
   * algorithm generation that never measured them — never fabricated as 0.
   *
   * `launchPointCount` is how many region-assignment launch CANDIDATES were
   * selected by the coarse near-plate test (`isUnitNearPlate` — centroid
   * within a unit-radius-derived band of the plate), NOT how many units were
   * verified to touch the plate with their own material. An independent audit
   * (correction doc §2.2) measured units inside this set with positive gaps up
   * to 3.630mm (box) / 5.922mm (sphere) / 3.322mm (waisted). §10's "plate
   * contact 2以上を利用する" gate reads this candidate count, NOT rootCount
   * (there is still exactly one graph root) and NOT
   * `actualPlateContactCount` (the verified material-contact number).
   * `meanAssignedRouteCost` vs `meanSingleSourceRouteCost` is the pair that
   * makes the connected base's effect reportable instead of asserted: both
   * are the mean §6.2 route cost over the same regions, the first from the
   * whole set of launch points, the second from the single Phase-A root.
   */
  launchPointCount: number | null;
  assignedRegionCount: number | null;
  meanAssignedRouteCost: number | null;
  meanSingleSourceRouteCost: number | null;
}

let nextUnitId = 1;
export function freshUnitId(): number {
  return nextUnitId++;
}
export function resetUnitIdCounter(startAt = 1): void {
  nextUnitId = startAt;
}

export function unitCentroid(unit: GrowthUnit): Vec3 {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of unit.points) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const n = unit.points.length || 1;
  return { x: sx / n, y: sy / n, z: sz / n };
}


function tangentBasis(n: Vec3): { u: Vec3; v: Vec3 } {
  const helper = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = vNorm(vCross(helper, n));
  const v = vCross(n, u);
  return { u, v };
}

function angleBetween(a: Vec3, b: Vec3): number {
  const na = vNorm(a);
  const nb = vNorm(b);
  const d = Math.max(-1, Math.min(1, vDot(na, nb)));
  // abs(): a ring's axis has no preferred sign, only "how far from parallel to buildAxis" matters.
  return Math.acos(Math.abs(d));
}

// --- §3: coin/ring point generators (interior units — NOT surface-anchored,
// unlike S-skin's Patch; there is no host surface to project onto here). ---

function buildCoinPoints(center: Vec3, heading: Vec3, unitRadius: number, rng: () => number): GrowthUnitPoint[] {
  const { u, v } = tangentBasis(heading);
  const subCount = 4 + Math.floor(rng() * 4); // 4..7, same range S-skin's coin uses
  const points: GrowthUnitPoint[] = [{ x: center.x, y: center.y, z: center.z, r: unitRadius * 0.55 }];
  const flatten = 0.32; // coin = flattened along `heading` — the growth direction plays the shell-normal role S-skin's coin used the surface normal for
  for (let i = 0; i < subCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * unitRadius * 0.6;
    const along = (rng() - 0.5) * unitRadius * flatten;
    const x = center.x + (u.x * Math.cos(angle) + v.x * Math.sin(angle)) * dist + heading.x * along;
    const y = center.y + (u.y * Math.cos(angle) + v.y * Math.sin(angle)) * dist + heading.y * along;
    const z = center.z + (u.z * Math.cos(angle) + v.z * Math.sin(angle)) * dist + heading.z * along;
    const r = unitRadius * (0.35 + rng() * 0.25);
    points.push({ x, y, z, r });
  }
  return points;
}

function buildRingPoints(
  center: Vec3,
  heading: Vec3,
  unitRadius: number,
  nodeCount: number,
  tubeRFraction: number,
  seedStr: string,
): GrowthUnitPoint[] {
  const recipe: RingRecipe = {
    center,
    axis: heading,
    R: unitRadius,
    n: Math.max(3, Math.round(nodeCount)),
    r: Math.max(0.01, unitRadius * tubeRFraction),
    wobbleR: 0.25,
    wobblePos: 0.12,
    seed: seedStr,
  };
  // generateRingBalls returns Ball[] {id,x,y,z,r} in node order (a closed loop) — the id is discarded,
  // this Study tracks unit identity at the GrowthUnit level, not per-point.
  return generateRingBalls(recipe).map((b) => ({ x: b.x, y: b.y, z: b.z, r: b.r }));
}

function buildUnitPoints(
  kind: GrowthUnitKind,
  center: Vec3,
  heading: Vec3,
  params: GrowthParams,
  seedStr: string,
  rng: () => number,
): GrowthUnitPoint[] {
  return kind === "coin"
    ? buildCoinPoints(center, heading, params.unitRadius, rng)
    : buildRingPoints(center, heading, params.unitRadius, params.ringNodeCount, params.ringTubeR, seedStr);
}

function lateralExtentField(points: GrowthUnitPoint[], center: Vec3, buildAxis: Vec3): number {
  let maxR = 0;
  for (const p of points) {
    const rel = vSub(p, center);
    const lateral = vSub(rel, vScale(buildAxis, vDot(rel, buildAxis)));
    maxR = Math.max(maxR, vLen(lateral) + p.r);
  }
  return maxR * 2; // diameter, used as a coarse "span" proxy
}

function ringMaxConsecutiveHeightJumpField(points: GrowthUnitPoint[], buildAxis: Vec3): number {
  if (points.length < 2) return 0;
  let maxJump = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const jump = Math.abs(vDot(a, buildAxis) - vDot(b, buildAxis));
    if (jump > maxJump) maxJump = jump;
  }
  return maxJump;
}

// --- §7: acceptance ---------------------------------------------------------

const MIN_RING_TILT_RAD = (20 * Math.PI) / 180; // 仮決め: ring axis must tilt at least this far from buildAxis (rejects "水平ring")


/** Shared NEAR-plate tolerance factor (times a unit's own max point radius) — the same rejection-sampling coarseness rule 2 uses for root acceptance, reused by `isUnitNearPlate` so "is this unit near the plate" means the same thing in both places. This is a candidate-selection coarseness, not a contact criterion: see `isUnitNearPlate`. */
const PLATE_CONTACT_TOLERANCE_FACTOR = 2.0;

/**
 * COARSE near-plate test: `unit`'s own CENTROID sits within a
 * unit-radius-derived band of the build plate.
 *
 * This is NOT a material-contact test and must never be reported as one
 * (correction doc §2.2). It looks at the centroid, not the material's lowest
 * extent, and its tolerance comes from the unit's own radius, not from the
 * layer height — so a unit whose material floats well clear of the plate can
 * still pass it. An independent audit of the default coin candidates measured
 * units inside this set with positive gaps up to 3.630mm (box) / 5.922mm
 * (sphere) / 3.322mm (waisted).
 *
 * What it IS for: picking base seeds and region-assignment launch CANDIDATES
 * cheaply, before any material has been measured. Verified material contact is
 * `isUnitOnPlate` / `countActualPlateContacts` below.
 */
function isUnitNearPlate(unit: GrowthUnit, buildAxis: Vec3, plateOffset: number): boolean {
  const centroid = unitCentroid(unit);
  const maxR = unit.points.reduce((m, p) => Math.max(m, p.r), 0.01);
  return Math.abs(vDot(centroid, buildAxis) - plateOffset) <= maxR * PLATE_CONTACT_TOLERANCE_FACTOR;
}

/**
 * Lowest extent of a unit's ACTUAL material along `buildAxis`, in FIELD units.
 *
 * Uses `unitFieldElements` — raw spheres for a coin, tapered capsules for a
 * ring — so it measures the same material the mesh and the coverage model
 * build, not the centroid. A tapered capsule is the convex hull of its two end
 * spheres, so the minimum over its endpoints of (projection − radius) is
 * exact, not an approximation.
 */
export function lowestMaterialField(kind: GrowthUnitKind, points: GrowthUnitPoint[], buildAxis: Vec3): number {
  let lowest = Infinity;
  for (const e of fieldElementsOf(kind, points)) {
    const a = vDot(e.a, buildAxis) - e.a.r;
    if (a < lowest) lowest = a;
    if (e.b !== null) {
      const b = vDot(e.b, buildAxis) - e.b.r;
      if (b < lowest) lowest = b;
    }
  }
  return Number.isFinite(lowest) ? lowest : 0;
}

export function unitLowestMaterialField(unit: GrowthUnit, buildAxis: Vec3): number {
  return lowestMaterialField(unit.kind, unit.points, buildAxis);
}

/**
 * Signed clearance in MM between a material lowest extent (field units) and
 * the build plate. Positive = floating above the plate.
 *
 * P2.1 (Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-
 * plate-support-and-export-plane.md §2): the ONE place this conversion lives.
 * Rule 2b's plate-support test and the accepted-unit `actualPlateContactCount`
 * metric both go through here, so they cannot disagree about what "on the
 * plate" means — which is exactly what went wrong before (rule 2b used a
 * unit-radius band ~10x looser than the metric's one-layer rule).
 */
export function plateClearanceMm(lowestField: number, plateOffset: number, scaleMmPerUnit: number): number {
  return (lowestField - plateOffset) * scaleMmPerUnit;
}

/** The shared criterion: material reaches the plate when it floats no more than ONE LAYER above it. Tolerance comes from layer height, never from a unit radius. */
export function isOnPlateMm(clearanceMm: number, layerHeightMm: number): boolean {
  return clearanceMm <= layerHeightMm;
}

/**
 * Signed clearance in MM between a unit's lowest material and the build plate
 * (correction doc §2.3: "判定はcanonical scaleでmmへ換算する"). Negative means
 * the unit's material sits at or below the plate plane.
 */
export function unitPlateClearanceMm(
  unit: GrowthUnit,
  buildAxis: Vec3,
  plateOffset: number,
  scaleMmPerUnit: number,
): number {
  return plateClearanceMm(unitLowestMaterialField(unit, buildAxis), plateOffset, scaleMmPerUnit);
}

/**
 * True when the unit's OWN material reaches the build plate within one layer
 * height. The tolerance derives from `layerHeightMm` — never from the unit's
 * radius (correction doc §2.3: "許容差はunit半径ではなくlayer heightに由来させる";
 * "unit中心が近いだけではcontactにしない").
 */
export function isUnitOnPlate(
  unit: GrowthUnit,
  buildAxis: Vec3,
  plateOffset: number,
  scaleMmPerUnit: number,
  layerHeightMm: number,
): boolean {
  return isOnPlateMm(unitPlateClearanceMm(unit, buildAxis, plateOffset, scaleMmPerUnit), layerHeightMm);
}

/**
 * How many units actually touch the build plate.
 *
 * MUST be called after ALL growth stages have run (including the connected
 * base) — never before. Calling it early is exactly the bug correction doc
 * §2.1 found: the old `plateContactCount` was computed before
 * `growConnectedMultiSource` built the base, so the default coin candidates
 * reported 2 instead of ~108.
 */
export function countActualPlateContacts(
  units: GrowthUnit[],
  buildAxis: Vec3,
  plateOffset: number,
  scaleMmPerUnit: number,
  layerHeightMm: number,
): number {
  let n = 0;
  for (const u of units) {
    if (isUnitOnPlate(u, buildAxis, plateOffset, scaleMmPerUnit, layerHeightMm)) n++;
  }
  return n;
}

export interface EvaluateInput {
  hostId: HostFixtureId;
  buildAxis: Vec3;
  plateOffset: number;
  canonicalScaleMmPerUnit: number;
  envelope: FabricationEnvelope;
  constraintsActive: boolean;
  isRoot: boolean;
  kind: GrowthUnitKind;
  heading: Vec3;
  parentPoints: GrowthUnitPoint[] | null;
  parentCentroid: Vec3 | null;
  center: Vec3;
  /** §4.1: the unsupported-span hard limit, derived from the unit's OWN geometry (see computeDerivedMaxUnsupportedSpanField) — compared directly in FIELD units, never an author-typed mm value. */
  derivedMaxUnsupportedSpanField: number;
}

export interface EvaluateOutcome {
  accepted: boolean;
  reason?: RejectionReason;
  verticalStepField: number;
  lateralStepField: number;
  clipFieldUnits: number;
}

/**
 * The 6 rules of §7, plus the ring-specific pair from the same section.
 * Rule 3 ("root以外なら既存accepted unitの少なくとも1個をparentとして持つ") is not
 * checked here — it holds STRUCTURALLY, because growNetwork only ever calls
 * this with a specific existing accepted `parent`, never with a free-floating
 * candidate (verified in growth.test.ts by walking every unit's parent
 * chain).
 */
export function evaluateCandidate(input: EvaluateInput, points: GrowthUnitPoint[]): EvaluateOutcome {
  const {
    hostId,
    buildAxis,
    plateOffset,
    canonicalScaleMmPerUnit,
    envelope,
    constraintsActive,
    isRoot,
    kind,
    heading,
    parentPoints,
    parentCentroid,
    center,
    derivedMaxUnsupportedSpanField,
  } = input;

  // Rule 1 (always, both variants): host containment, small documented tolerance.
  // §5 asks for exact intersection with clip bookkeeping; a full boolean clip
  // of the point-cluster geometry is deferred (see README Next) — instead,
  // any candidate whose maximum poke exceeds the tolerance is REJECTED
  // outright (never silently accepted with material outside the host), and
  // any accepted candidate that pokes within tolerance is recorded via
  // clipFieldUnits so the caller can tally clippedUnitCount/maxClipFieldUnits.
  let maxPoke = 0;
  for (const p of points) {
    const hs = hostSdf(hostId, p.x, p.y, p.z);
    if (hs > maxPoke) maxPoke = hs;
  }
  const maxR = points.reduce((m, p) => Math.max(m, p.r), 0.01);
  const boundaryTolerance = maxR * 0.25;
  if (maxPoke > boundaryTolerance) {
    return { accepted: false, reason: "host-exterior", verticalStepField: 0, lateralStepField: 0, clipFieldUnits: 0 };
  }
  const clipFieldUnits = Math.max(0, maxPoke);

  const verticalStepField = isRoot ? vDot(center, buildAxis) - plateOffset : vDot(vSub(center, parentCentroid!), buildAxis);
  const lateralStepField = isRoot
    ? 0
    : vLen(vSub(vSub(center, parentCentroid!), vScale(buildAxis, verticalStepField)));

  if (!constraintsActive) {
    return { accepted: true, verticalStepField, lateralStepField, clipFieldUnits };
  }

  if (isRoot) {
    // Rule 2: root must contact the build plate within a coarse tolerance.
    // maxR*2.0 (not maxR*0.6): a tight tolerance made root-finding on CURVED
    // hosts (sphere) unreliable — near a sphere's pole the qualifying
    // xz-footprint shrinks with the tolerance band, so a tight band starves
    // root sampling of enough candidates within the attempt budget (measured:
    // sphere+coin-constrained sometimes found ZERO roots at 0.6x). 2.0x keeps
    // "touching" meaningfully coarse (this is a rejection-sampling tolerance,
    // not a claim about actual contact geometry) while staying well under
    // the unit's own diameter.
    const plateTolerance = maxR * PLATE_CONTACT_TOLERANCE_FACTOR;
    if (Math.abs(verticalStepField) > plateTolerance) {
      return { accepted: false, reason: "root-not-on-plate", verticalStepField, lateralStepField, clipFieldUnits };
    }
    return { accepted: true, verticalStepField, lateralStepField, clipFieldUnits };
  }

  // Rule 4: candidate must actually touch its parent's field.
  let minGap = Infinity;
  for (const cp of points) {
    for (const pp of parentPoints!) {
      const d = Math.hypot(cp.x - pp.x, cp.y - pp.y, cp.z - pp.z) - cp.r - pp.r;
      if (d < minGap) minGap = d;
    }
  }
  if (minGap > 0) {
    return { accepted: false, reason: "no-parent-contact", verticalStepField, lateralStepField, clipFieldUnits };
  }

  // Rule 2b (O2 §6.1, "connected base"): a NON-root candidate whose own
  // centre sits within the same plate-contact tolerance rule 2 uses for roots
  // is supported BY THE BUILD PLATE, not cantilevered off its parent — so
  // rule 5's overhang cone and the negative-rise rule, both of which model
  // "how far can material lean out over the material below it", do not apply
  // to it. It still has to touch its parent's material (rule 4, already
  // checked above), so the piece stays a single component with one graph root.
  //
  // This is what makes §6.1's connected base geometrically possible at all.
  // Without it a base is not merely hard to grow, it is FORBIDDEN: a step
  // along the plate is ~90deg from the build axis, and rule 5 caps any step
  // at 90deg - supportThresholdAngleDeg (57deg at the default 30deg), so
  // every horizontal step fails by construction. That is why both this
  // round's first attempt and the previous round's "plate-walk" mode produced
  // exactly ZERO base units on all three hosts while still describing the
  // base as implemented — measured, then fixed here rather than re-described.
  //
  // Scope is deliberately narrow: only the plate band, only the two rules
  // that are about overhang. Host containment (rule 1) and the unsupported-
  // span limit (rule 6) still apply, and the build plate is by construction
  // tangent to the host's lowest point, so "below the plate" is already
  // outside the host and rejected by rule 1.
  // P2.1: judged by the SAME mm/layer criterion as `actualPlateContactCount`,
  // through the same shared helpers — a unit is only excused from the overhang
  // rules when its own material genuinely reaches the plate.
  //
  // This used to be `lowestPointClearance <= maxR * 0.35`, a unit-radius band
  // that at the shipped defaults allowed ~1.8-2.2mm of float — about ten times
  // the 0.2mm layer height, and inconsistent with the metric of the same name.
  // Independently measured before this fix: 10 (box) / 50 (sphere) / 12
  // (waisted) accepted DESCENDING units were floating up to 2.047mm above the
  // plate while being excused from both the negative-rise rule and the overhang
  // cone — i.e. claiming the build plate supported them when it did not touch
  // them. The coarse centroid-based near-plate rule (`isUnitNearPlate`) still
  // exists, but only to pick region-assignment launch CANDIDATES; it is
  // deliberately not the criterion for excusing a support rule.
  const candidateLowestField = lowestMaterialField(kind, points, buildAxis);
  const plateSupported = isOnPlateMm(plateClearanceMm(candidateLowestField, plateOffset, canonicalScaleMmPerUnit), envelope.layerHeightMm);

  if (!plateSupported) {
    // Build-axis monotonicity. Growth off the plate never intentionally steps
    // DOWNWARD — a real negative rise would mean material hanging below its
    // own parent with no support argument for it at all (unlike a small
    // positive-but-sub-layer rise, which rule 5 below treats specially).
    // Rejected outright rather than folded into the flat-rise branch's
    // small-lateral-only allowance, which previously let a genuinely downward
    // step through as long as its lateral component happened to be tiny.
    const verticalStepMmRaw = verticalStepField * canonicalScaleMmPerUnit;
    if (verticalStepMmRaw < -1e-9) {
      return { accepted: false, reason: "negative-rise-rejected", verticalStepField, lateralStepField, clipFieldUnits };
    }

    // Rule 5: lateral advance vs. layer height — delegates to the single
    // shared allowedLateralForStepMm helper ("同じ数式を複数箇所へ再実装しない").
    // derivedMaxLateralAdvancePerLayerMm is always in sync with
    // layerHeightMm/supportThresholdAngleDeg — see field.ts's
    // computeDerivedLateralAllowance.
    const verticalStepMm = verticalStepField * canonicalScaleMmPerUnit;
    const lateralStepMm = lateralStepField * canonicalScaleMmPerUnit;
    const allowedLateralMm = allowedLateralForStepMm(verticalStepMm, envelope.layerHeightMm, envelope.derivedMaxLateralAdvancePerLayerMm);
    if (lateralStepMm > allowedLateralMm) {
      return { accepted: false, reason: "lateral-advance-exceeded", verticalStepField, lateralStepField, clipFieldUnits };
    }
  }

  // Rule 6: unsupported span estimate — §4.1: derived from the unit's own
  // geometry (derivedMaxUnsupportedSpanField, field units), not an author mm value.
  const spanField = lateralExtentField(points, center, buildAxis);
  if (spanField > derivedMaxUnsupportedSpanField) {
    return { accepted: false, reason: "unsupported-span-exceeded", verticalStepField, lateralStepField, clipFieldUnits };
  }

  // Ring-specific: reject a horizontal ring plane (axis nearly parallel to buildAxis) by default,
  // and require the node loop to have no single unsupported jump beyond the same derived span limit.
  if (kind === "ring") {
    if (angleBetween(heading, buildAxis) < MIN_RING_TILT_RAD) {
      return { accepted: false, reason: "ring-horizontal", verticalStepField, lateralStepField, clipFieldUnits };
    }
    const jumpField = ringMaxConsecutiveHeightJumpField(points, buildAxis);
    if (jumpField > derivedMaxUnsupportedSpanField) {
      return { accepted: false, reason: "ring-discontinuous-support", verticalStepField, lateralStepField, clipFieldUnits };
    }
  }

  return { accepted: true, verticalStepField, lateralStepField, clipFieldUnits };
}

// --- growth walk -------------------------------------------------------------

// Candidate step length, in units of unitRadius. Calibrated (not guessed)
// against rule 4's own contact requirement: a coin's anchor point (radius
// 0.55*unitRadius) sits exactly at its center with zero heading-axis offset,
// so two coin anchors touch only if step <= 2*0.55 = 1.1*unitRadius. A
// ring's nodes sit on a ring of radius unitRadius entirely WITHIN the plane
// perpendicular to heading (near-zero offset along heading itself), so two
// same-phase ring nodes at consecutive centers touch only if
// step <= 2*ringTubeR*unitRadius — with DEFAULT_GROWTH_PARAMS.ringTubeR=0.28
// that is 0.56*unitRadius, and node phase is NOT guaranteed aligned between
// independently-seeded rings, so the real threshold is stricter still. An
// initial STEP_FACTOR of 1.7 (a size-only guess, undocumented derivation)
// left contact essentially unreachable for both shapes — measured in
// isolated Chrome (port 5185) as coin-constrained/ring-constrained BFS
// growth producing 0 edges beyond the roots, 100% "no-parent-contact"
// rejections on every child attempt. 0.5 clears both thresholds with margin.
const STEP_FACTOR = 0.5;

/**
 * §4.1: "unitの無支持距離はmetricとして測る…hard rejectが必要なら、unit geometryと
 * 連続parent contactから導いた内部値に限定する". No author mm input backs this
 * anymore — the limit is a fixed multiple of the unit's OWN radius (仮決め,
 * documented here rather than derived from a printer spec, since a printer
 * build volume says nothing about single-unit bridging). 3.0 keeps typical
 * coin/ring extents (~2.4x/~2.3x unitRadius, see field header derivations)
 * comfortably inside the limit while still catching genuinely oversized
 * candidates.
 */
const UNSUPPORTED_SPAN_FACTOR = 3.0;

export function computeDerivedMaxUnsupportedSpanField(unitRadius: number): number {
  return unitRadius * UNSUPPORTED_SPAN_FACTOR;
}


export interface AutoBudget {
  minimumPathUnits: number;
  totalBudget: number;
}

const SAFETY_MARGIN_UNITS = 20;
/** §5.3: Phase B (branching/fill) gets this multiple of the primary path's own minimum length as extra budget — a 仮決め generosity factor, not derived from any external spec. */
const BRANCH_BUDGET_MULTIPLIER = 3;

/**
 * §5.3: `Math.ceil(hostHeightField / effectiveForwardStepField) + safetyMarginUnits`,
 * plus Phase B's own branch budget on top. Never an author input — always
 * recomputed from the host/printer/unit geometry actually in play.
 */
export function computeAutoBudget(hostId: HostFixtureId, buildAxis: Vec3, unitRadius: number): AutoBudget {
  const b = hostBounds(hostId);
  const hostHeightField = Math.abs(b.size.x * buildAxis.x + b.size.y * buildAxis.y + b.size.z * buildAxis.z);
  const effectiveForwardStepField = Math.max(1e-6, unitRadius * STEP_FACTOR);
  const minimumPathUnits = Math.ceil(hostHeightField / effectiveForwardStepField) + SAFETY_MARGIN_UNITS;
  const totalBudget = minimumPathUnits * (1 + BRANCH_BUDGET_MULTIPLIER);
  return { minimumPathUnits, totalBudget };
}

/**
 * §5.1: the primary-path search's base heading tilts away from pure-vertical
 * ONLY as far as the candidate's OWN kind actually requires. Coin has no
 * angle-from-buildAxis rule at all, so tilting it unnecessarily just wastes
 * step length as lateral drift (measured: a uniform 35° tilt left the sphere
 * host's coin primary path at heightCoverage 0.948, just short of 0.95,
 * purely from that wasted lateral component — the host's own footprint
 * narrowing near the pole was not the limiting factor). Ring's own
 * "水平ring" rule rejects any heading within MIN_RING_TILT_RAD(20°) of
 * buildAxis, so ring keeps a real tilt with margin above that threshold.
 */
const PRIMARY_PATH_TILT_RAD_COIN = (4 * Math.PI) / 180; // near-vertical; coin has no angle rule to satisfy
const PRIMARY_PATH_TILT_RAD_RING = (28 * Math.PI) / 180; // clears MIN_RING_TILT_RAD(20°) with margin

/** §5.1: 14 deterministic azimuthal candidates (rotations AROUND buildAxis, which preserve the tilt angle from buildAxis and therefore never re-trigger ring-horizontal) tried in order at each primary-path node before backtracking. */
const PRIMARY_PATH_HEADING_OFFSETS_DEG = [0, 25, -25, 50, -50, 75, -75, 100, -100, 130, -130, 160, -160, 180];

/**
 * The primary-path search's base heading at `p`: buildAxis tilted by the
 * kind-appropriate angle toward a deterministic lateral direction (itself
 * derived from position + seed, so the SAME seed always proposes the same
 * base heading — no RNG draw here, matching growthDirection's own contract).
 * PRIMARY_PATH_HEADING_OFFSETS_DEG then spins this azimuthally around
 * buildAxis to produce the actual candidate list.
 */
function primaryPathBaseHeading(p: Vec3, buildAxis: Vec3, seedInt: number, kind: GrowthUnitKind): Vec3 {
  const axis = vNorm(buildAxis);
  const { u } = tangentBasis(axis);
  const noise = hashNoiseVec3(p, seedInt + 9973);
  const noiseLateral = vSub(noise, vScale(axis, vDot(noise, axis)));
  const lateralDir = vNorm(noiseLateral, u);
  const tiltRad = kind === "ring" ? PRIMARY_PATH_TILT_RAD_RING : PRIMARY_PATH_TILT_RAD_COIN;
  return vNorm(vAdd(vScale(axis, Math.cos(tiltRad)), vScale(lateralDir, Math.sin(tiltRad))));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function sampleWithinBounds(bounds: Bounds, rng: () => number): Vec3 {
  return {
    x: bounds.min.x + rng() * bounds.size.x,
    y: bounds.min.y + rng() * bounds.size.y,
    z: bounds.min.z + rng() * bounds.size.z,
  };
}

const COVERAGE_TOLERANCE = 0.02; // §3.4 of the surface-coverage plan doc, Study仮値 (2 percentage points), not a machine spec — never changed to make a target easier to reach
const APPROACH_AZIMUTH_OFFSETS_DEG = [0, 12, -12, 25, -25, 40, -40]; // approach fan: narrow, since approach is travel, not coverage
const TRUNK_AZIMUTH_OFFSETS_DEG = [0, 20, -20, 45, -45]; // §6.3 upward trunk fan
const PLATE_WALK_AZIMUTH_OFFSETS_DEG = [0, 15, -15, 30, -30, 50, -50]; // §6.1 connected-base fan
const FIELD_ONLY_HEADING_OFFSETS = [
  { du: 0, dv: 0 },
  { du: 0.22, dv: 0 },
  { du: -0.22, dv: 0 },
  { du: 0, dv: 0.22 },
  { du: 0, dv: -0.22 },
  { du: 0.35, dv: 0.35 },
  { du: -0.35, dv: -0.35 },
]; // field-only stays the unconstrained baseline (§3's comparison axis) and keeps a direct-toward-aim fan, not the cone/tangent machinery
const COLONIZE_STEP_FRACTIONS = [1, 0.7, 0.45, 0.25]; // progressively smaller steps tried along the same heading fan before giving up an attempt
const TARGET_ATTEMPT_LIMIT = 30; // consecutive iterations with no qualifying acceptance on the SAME committed region before abandoning just that region
const TARGET_STAGNANT_LIMIT = 50; // consecutive iterations without the best approach-distance improving, regardless of accept/reject
const COVERAGE_PLATEAU_LIMIT = 120; // consecutive iterations (across region switches) with no qualifying acceptance before reporting a stuck reason
const APPROACH_SWITCH_STEP_MULTIPLE = 2.5; // Study仮値: once the aim point is within this many step-lengths, prefer spread over approach
const MARGINAL_GAIN_SEARCH_RADIUS_FACTOR = 1.5; // Study仮値: estimateMarginalGain's search radius beyond a candidate's own point radii, in units of unitRadius
const EXPECTED_UNIT_VOLUME_FIELD_FACTOR = 4 / 3; // Study仮値: (4/3)*pi*r^3-ish reference scale for normalizing "added material" in the score
const COVERAGE_FULL_RECOMPUTE_INTERVAL = 20; // accepted units between authoritative full recomputes (drift-check/stop-condition refresh only, never the final saved number)

// ---------------------------------------------------------------------------
// O2 constants — every one of these replaces a value the O1 diagnosis
// measured to be wrong, not a value that merely looked improvable.
// (Optimizer/docs/opus-instruction-20260725-katachi-interior-growth-connected-
// multisource.md §5/§6.)
// ---------------------------------------------------------------------------

/**
 * How far INSIDE the host boundary a unit aimed at the surface should sit,
 * as a fraction of unitRadius.
 *
 * O1 measurement (ideal placement, growth loop removed entirely — 700-1600
 * coins placed directly on each host's reference surface): a coin centred at
 * 0.5*unitRadius covers ~0.026 field^2 of host surface; the SAME coin at
 * 1.0*unitRadius (the value the previous central-trunk code used) covers
 * ~0.016. That is a 1.6-1.7x coverage loss per unit for free, and it has a
 * simple cause: the coverage probe shell sits at exactly
 * computeProbeDepthField = 0.5*unitRadius, so a unit centred a full radius in
 * only reaches the shell with its outermost sub-points.
 */
const AIM_DEPTH_FACTOR = 0.5;

/**
 * Realistic host-surface area one accepted unit covers, as a fraction of the
 * unit's own footprint circle (pi*unitRadius^2).
 *
 * The previous budget formula sized `requiredUnitsForTarget` as
 * `targetArea / (pi*r^2)`, i.e. it assumed a unit covers its whole footprint.
 * O1 measured the real figure at ideal placement: 0.026 field^2 against a
 * pi*r^2 of 0.0616 — the formula overestimated per-unit yield by ~2.4x and so
 * under-sized the budget by the same factor. This is a CORRECTION of a
 * measured-wrong constant, not a budget increase dressed up as one: the O1
 * report records both the old and new numbers, and the coverage gate is only
 * claimed when per-unit yield improves too.
 */
const SURFACE_YIELD_FACTOR = 0.42;

/**
 * Units the run actually spends per unit of PRODUCTIVE surface coverage.
 *
 * SURFACE_YIELD_FACTOR above is an ideal-placement figure: it says what one
 * coin covers when something has already put it in exactly the right place.
 * A real run also pays for the Phase A primary path, for approach/trunk
 * travel to each new part of the surface, and for the diminishing returns of
 * spreading into an area its neighbours already partly cover. Measured
 * end-to-end at the diagnosis conditions, the whole-run effective yield per
 * ACCEPTED unit was 0.217x pi*r^2 on box, 0.192x on waisted and 0.134x on
 * sphere — i.e. between 2.0x and 3.1x the ideal-placement cost. Re-measured
 * once the budget stopped binding, sphere's own overhead is higher still
 * (0.094x, ~4.5x) because 23% of its surface is too steep to travel along and
 * its equator is a long approach from the axis.
 *
 * 4.5 is the worst measured case. Over-sizing this costs a host that reaches
 * its target nothing at all — the loop stops on `target-reached`, so the
 * budget is a ceiling and not a quota (box stops at 413 units against a
 * ceiling of 900). Under-sizing it, as the previous formula did by ignoring
 * route overhead entirely, guaranteed the run stopped short of any target it
 * was given no matter how well it grew.
 */
const ROUTE_OVERHEAD_FACTOR = 4.5;

/** §6.1: share of the total budget the connected base may consume before trunks/spread begin. Study仮値. */
const BASE_BUDGET_FRACTION = 0.12;
const BASE_MIN_UNITS = 8;
/**
 * §6.1 "単なるtarget距離の短縮だけでbaseを無制限に増やさない": a base candidate must
 * save at least this much expected route cost, averaged over EVERY region,
 * to be worth its own material.
 *
 * The units here are "expected accepted units saved per region". One base
 * step moves the launch footprint by STEP_FACTOR*unitRadius, so its mean
 * saving across a few hundred regions is genuinely small — an initial guess
 * of 0.15 rejected every candidate on all three hosts and produced a base of
 * exactly zero units. What actually bounds the base is BASE_BUDGET_FRACTION;
 * this threshold's job is only to stop base growth once it has stopped
 * helping at all.
 */
const BASE_MIN_COST_REDUCTION = 0.004;
/** Scales the §6.1 base score into the same range as computeCandidateScore's other terms, so the base's own ranking isn't swamped by material/overlap penalties. Study仮値. */
const BASE_SCORE_SCALE = 8;

/** §6.4: a frontier within this many unitRadius of the host boundary counts as "on the surface" and switches to tangent-plane spread. Study仮値. */
const SPREAD_SURFACE_BAND_FACTOR = 2.5;
/** §6.4 fan, swept WITHIN the local tangent plane (rotations about the surface normal), not about the build axis. */
const SPREAD_TANGENT_OFFSETS_DEG = [0, 30, -30, 60, -60, 90, -90, 135, -135, 180];
/** §6.4 "covered repulsion" strength relative to uncovered attraction. Study仮値. */
const SPREAD_COVERED_REPULSION = 0.6;
/**
 * How hard a spread step steers back toward AIM_DEPTH_FACTOR*unitRadius
 * below the surface, as a fraction of the step length per unit of depth
 * error.
 *
 * A first version of this used a constant inward bias instead, and measured
 * far WORSE than the algorithm it replaced (box 2.85% -> 0.40%): a fixed
 * inward push makes every spread step sink a little deeper, so the frontier
 * slides away from the probe shell and then travels along the surface at a
 * depth where it covers nothing at all (measured: 344 of 395 accepted units
 * gained zero coverage). Depth is a setpoint to be held, not a direction to
 * be pushed in.
 */
const SPREAD_DEPTH_GAIN = 2.5;
/** Depth error (in unitRadius) below which a spread step counts as "holding the surface" for the purpose of accepting a zero-gain traversal step. Study仮値. */
const SPREAD_DEPTH_TOLERANCE_FACTOR = 0.6;
/**
 * How many consecutive ACCEPTED-but-zero-gain traversal steps a single region
 * may take before it is abandoned.
 *
 * Without this the frontier can crawl a region forever: a traversal step is a
 * genuine acceptance, so it resets the ordinary stall counters, and a region
 * that can never be fully covered therefore never releases the frontier.
 * Measured on sphere: all 206 spread units ended up inside the bottom cap
 * (height 0.09-0.15 field-units above the plate, on a host 2.3 tall), the run
 * saturated that cap at 4.85% and then spent the entire remaining budget
 * traversing it. Study仮値.
 */
const SPREAD_ZERO_GAIN_TRAVERSAL_LIMIT = 10;
/** Radius (in unitRadius) over which spread looks for uncovered/covered neighbours to build its bearing. Study仮値. */
const SPREAD_NEIGHBOUR_RADIUS_FACTOR = 4;
/** Region-selection locality (§6.2): priority is divided by (1 + cost/this), so a nearby region beats a slightly larger far one. Study仮値. */
const REGION_COST_DISCOUNT = 6;
/** §6.3: multiplier applied to the route cost of a start unit OUTSIDE the region's assigned launch-point subtree, so the assignment is honoured without ever forbidding a much cheaper start elsewhere. Study仮値. */
const SUBTREE_PREFERENCE_PENALTY = 1.25;
/** §6.2: priority multiplier for a region whose own surface is too steep to travel along (see colonization.ts's isSurfaceTraversable). Deprioritized, never excluded — such a region stays fully in the coverage denominator and can still be picked once the traversable ones are done. Study仮値. */
const NON_TRAVERSABLE_REGION_PRIORITY = 0.12;

interface SurfaceColonizationInput {
  hostId: HostFixtureId;
  envelope: FabricationEnvelope;
  params: GrowthParams;
  effectiveKind: GrowthUnitKind;
  canonicalScaleMmPerUnit: number;
  buildAxis: Vec3;
  plateOffset: number;
  derivedMaxUnsupportedSpanField: number;
  constraintsActive: boolean;
  autoBudget: AutoBudget;
  units: GrowthUnit[];
  edges: { parentId: number; childId: number }[];
  rejected: Record<RejectionReason, number>;
  rejectedSamples: { center: Vec3; reason: RejectionReason; isRoot: boolean }[];
  registerAccepted: (kind: GrowthUnitKind, points: GrowthUnitPoint[], parentId: number | null, generation: number, heading: Vec3, outcome: EvaluateOutcome, role: GrowthUnitRole) => GrowthUnit;
  rng: () => number;
  nextAttemptSalt: () => number;
  /** Optional cooperative progress/cancel hook (O3). Returning false asks growth to stop at the next loop boundary and report honestly how far it got. */
  onProgress?: (completed: number, total: number) => boolean;
}

export const O2_ALGORITHM_VERSION = "connected-base-multisource-o2";
/** Kept exported for provenance/tests that need to recognise the previous algorithm's own results. */
export const S21_ALGORITHM_VERSION = "surface-colonization-s2.1";

interface SurfaceColonizationResult {
  measuredSurfaceCoverage: number;
  stopReason: CoverageStopReason;
  algorithmVersion: string;
  regionCount: number;
  reachedRegionCount: number;
  zeroGainAcceptedCount: number;
  coverageCurve: number[];
  incrementalFinalDrift: number;
  scoreWeights: Record<string, number>;
  lastScoreBreakdown: ScoreTerms | null;
  /** §6.1: units touching the build plate that trunks were actually launched from. */
  launchPointCount: number;
  /** §6.2: regions that got assigned to some launch point at finite cost. */
  assignedRegionCount: number;
  /** §6.2: mean estimated route cost (in units) over assigned regions — the number the connected base exists to reduce. */
  meanAssignedRouteCost: number;
  /** Mean estimated route cost from the SINGLE Phase-A root, measured on the same regions, so the base's effect is reportable rather than asserted. */
  meanSingleSourceRouteCost: number;
  cancelled: boolean;
}

interface ScoredCandidate {
  travel: Vec3;
  heading: Vec3;
  center: Vec3;
  points: GrowthUnitPoint[];
  outcome: EvaluateOutcome;
  score: number;
  terms: ScoreTerms;
  gainedSampleIds: number[];
  gainedWeight: number;
  /** True if this candidate has real (>0) coverage gain — selection stratifies on this so ANY direct-gain candidate beats ANY zero-gain route candidate, never blended by score alone. */
  isDirectGain: boolean;
}

/** A candidate direction: where the unit's CENTRE travels, and separately how the unit's own geometry is oriented. §6.4 needs these decoupled — a coin lying flat against the host surface is oriented by the surface normal while it travels along the tangent plane. */
interface HeadingSpec {
  travel: Vec3;
  heading: Vec3;
}

/** Per-region route state: `frontierUnitId` is the unit the NEXT step grows from, advanced to each newly accepted child so a chain genuinely extends outward instead of repeatedly re-selecting the same starting unit. */
interface RegionRouteState {
  mode: "trunk" | "approach" | "spread";
  frontierUnitId: number;
  acceptedPathUnitIds: number[];
  /** Consecutive accepted-but-zero-gain steps on this region — see SPREAD_ZERO_GAIN_TRAVERSAL_LIMIT. */
  zeroGainRun: number;
  /**
   * Whether this route has ever produced a covering step. Traversal (§6.4's
   * zero-gain "keep moving along the surface" step) is only allowed once it
   * has: on a host whose lower surface is steeper than the support cone
   * permits — a sphere below y=-0.626 at the default 30deg, which is 23% of
   * its area — a large number of regions are simply not reachable by
   * following the surface, and letting each of them spend traversal steps
   * before being abandoned drained the budget a few units at a time.
   */
  gainedAny: boolean;
}

/** §5.5's normalization: each raw term divided down to an O(1)-ish scale so no single term structurally dominates just from having larger raw units. All Study仮値, documented here and in README, never author-exposed. */
function computeScoreTerms(
  gainedWeight: number,
  overlapWeight: number,
  localSearchWeight: number,
  points: GrowthUnitPoint[],
  unitRadius: number,
  outcome: EvaluateOutcome,
  envelope: FabricationEnvelope,
  canonicalScaleMmPerUnit: number,
  spanField: number,
  derivedMaxUnsupportedSpanField: number,
  stepLengthField: number,
  actualStepField: number,
): ScoreTerms {
  // Normalized against the LOCALLY-searched area (how much of what this
  // candidate could plausibly reach did it actually cover), not the whole
  // host's reference weight — a single candidate's real coverage gain is a
  // few thousandths of the whole host, structurally unable to outweigh the
  // material penalty on the host-wide scale.
  const normalizedCoverageGain = localSearchWeight > 0 ? gainedWeight / localSearchWeight : 0;

  let addedVolume = 0;
  for (const p of points) addedVolume += EXPECTED_UNIT_VOLUME_FIELD_FACTOR * Math.PI * p.r * p.r * p.r;
  const expectedUnitVolume = EXPECTED_UNIT_VOLUME_FIELD_FACTOR * Math.PI * Math.pow(unitRadius * 0.5, 3) * points.length;
  const normalizedAddedMaterial = expectedUnitVolume > 0 ? addedVolume / expectedUnitVolume : 0;

  // How close this candidate sits to rule 5/6's OWN caps (0 = well inside, 1 = right at the boundary) — a proxy for "how fragile is this step under small perturbation", not a claim about real support risk.
  const maxLateralPerLayerMm = envelope.derivedMaxLateralAdvancePerLayerMm;
  const verticalStepMm = outcome.verticalStepField * canonicalScaleMmPerUnit;
  const lateralStepMm = outcome.lateralStepField * canonicalScaleMmPerUnit;
  const allowedLateralMm = allowedLateralForStepMm(verticalStepMm, envelope.layerHeightMm, maxLateralPerLayerMm);
  const lateralRisk = allowedLateralMm > 1e-9 ? Math.min(1, lateralStepMm / allowedLateralMm) : 0;
  const spanRisk = derivedMaxUnsupportedSpanField > 1e-9 ? Math.min(1, spanField / derivedMaxUnsupportedSpanField) : 0;
  const normalizedConstraintMarginRisk = Math.max(lateralRisk, spanRisk);

  const normalizedCoveredOverlap = localSearchWeight > 0 ? overlapWeight / localSearchWeight : 0;

  const normalizedAddedPathLength = stepLengthField > 1e-9 ? Math.min(2, actualStepField / stepLengthField) : 1;

  const normalizedHostBoundaryRisk = Math.min(1, outcome.clipFieldUnits / (unitRadius * 0.25 || 1));

  return {
    normalizedCoverageGain,
    normalizedAddedMaterial,
    normalizedConstraintMarginRisk,
    normalizedCoveredOverlap,
    normalizedAddedPathLength,
    normalizedHostBoundaryRisk,
  };
}

// ---------------------------------------------------------------------------
// Phase B/C — Connected Base + Multi-source Upward Colonization (O2 §6).
//
// WHY THIS REPLACED THE PREVIOUS CENTRAL-TRUNK COLONIZATION — measured, not
// assumed. O1 ran the previous algorithm at the fixed diagnosis conditions
// (A1 mini, coin-constrained, target 25%, default seed/layer/angle) and
// classified every accepted unit by the job it was accepted for:
//
//   role              box            sphere         waisted     samples/unit
//   primary-path      49 (36%)       55 (26%)       59 (27%)    0.27-0.39
//   surface-approach  59 (43%)      121 (57%)      125 (57%)    0.82-0.97
//   surface-spread    28 (20%)       35 (17%)       35 (16%)    1.54-3.91
//   base               0              0              0          --
//
// Three facts fell out of that table, and they set this file's priorities:
//
// 1. Surface-spread is 4-14x more productive per unit than anything else,
//    and it was getting 16-20% of the budget. The previous loop abandoned a
//    region as soon as its aim sample was covered and then re-approached a
//    distant region chosen by uncovered-weight alone, so it kept paying the
//    approach cost over and over. Region selection here is locality-aware
//    (§6.2's route cost, not Euclidean distance) and spread continues from
//    wherever the frontier already is.
// 2. `host-exterior` was the single largest rejection reason on all three
//    hosts (box 2890, sphere 5114, waisted 7059) and drove box to plateau at
//    2.85% with `host-boundary-blocked`. Cause: the old "spread" mode built
//    its headings as a fixed fan of azimuths around the BUILD AXIS. Against a
//    flat vertical wall most of that fan points straight through the wall.
//    §6.4 is explicit that writing "tangential" is not enough — spread here
//    builds the real local tangent plane from the nearest reference sample's
//    own normal (colonization.ts's localTangentBasis) and sweeps within it.
// 3. The "plate-connected base" the previous round documented never actually
//    ran: zero base units on all three hosts, and the second-lowest unit on
//    box already sat 0.23 field-units up. The base was a single point, so
//    there was only ever one place to launch from. §6.1's base is grown
//    explicitly here, before any trunk, and §6.2 assigns each region to the
//    launch point with the lowest route cost.
//
// The graph root stays exactly 1 and every unit is still accepted only via
// rule 4 material contact with an existing parent — multiple PLATE CONTACTS,
// never multiple independent roots (§4 "追加rootを離して置く方式ではない").
// ---------------------------------------------------------------------------

const COLONIZE_TILT_MARGIN_DEG = 3; // stays under rule 5's hard cap so float rounding at a non-axis-aligned parent centroid never tips a candidate over the boundary

/**
 * Rule 5's own cap re-derived: a step of length s at tilt theta from buildAxis
 * has verticalStep = s*cos(theta) and lateralStep = s*sin(theta), and rule 5
 * requires lateralStep <= verticalStep/tan(angleDeg); therefore
 * tan(theta) <= cot(angleDeg), i.e. theta <= 90deg - angleDeg. Verified
 * numerically at 10/20/30/45/60/80deg.
 */
function colonizeTiltRad(supportThresholdAngleDeg: number): number {
  const capDeg = Math.max(0, 90 - supportThresholdAngleDeg - COLONIZE_TILT_MARGIN_DEG);
  return (capDeg * Math.PI) / 180;
}

/** The azimuthal (buildAxis-perpendicular) unit direction from `from` toward `target`. Falls back to `fallback` when the target sits directly along buildAxis from `from`. */
function azimuthalBearingToward(target: Vec3, from: Vec3, buildAxis: Vec3, fallback: Vec3): Vec3 {
  const toTarget = vSub(target, from);
  const lateral = vSub(toTarget, vScale(buildAxis, vDot(toTarget, buildAxis)));
  const len = vLen(lateral);
  return len > 1e-9 ? vScale(lateral, 1 / len) : fallback;
}

function tiltedHeading(buildAxis: Vec3, azimuthDir: Vec3, tiltRad: number): Vec3 {
  return vNorm(vAdd(vScale(buildAxis, Math.cos(tiltRad)), vScale(azimuthDir, Math.sin(tiltRad))));
}

function growConnectedMultiSource(input: SurfaceColonizationInput): SurfaceColonizationResult {
  const {
    hostId,
    envelope,
    params,
    effectiveKind,
    canonicalScaleMmPerUnit,
    buildAxis,
    plateOffset,
    derivedMaxUnsupportedSpanField,
    constraintsActive,
    autoBudget,
    units,
    edges,
    rejected,
    rejectedSamples,
    registerAccepted,
    rng,
    nextAttemptSalt,
    onProgress,
  } = input;

  const emptyResult = (stopReason: CoverageStopReason): SurfaceColonizationResult => ({
    measuredSurfaceCoverage: 0,
    stopReason,
    algorithmVersion: O2_ALGORITHM_VERSION,
    regionCount: 0,
    reachedRegionCount: 0,
    zeroGainAcceptedCount: 0,
    coverageCurve: [],
    incrementalFinalDrift: 0,
    scoreWeights: SCORE_WEIGHTS,
    lastScoreBreakdown: null,
    launchPointCount: 0,
    assignedRegionCount: 0,
    meanAssignedRouteCost: 0,
    meanSingleSourceRouteCost: 0,
    cancelled: false,
  });

  if (units.length === 0) {
    // Phase A found no primary root at all — nothing to colonize from. Never
    // hidden behind a fabricated coverage number.
    return emptyResult("host-boundary-blocked");
  }

  const samples = getCoverageReferenceMesh(hostId);
  const probeDepthField = computeProbeDepthField(params.unitRadius);
  const step = params.unitRadius * STEP_FACTOR;
  const fallbackAzimuth = tangentBasis(buildAxis).u;
  const tiltRad = colonizeTiltRad(envelope.supportThresholdAngleDeg);
  const aimDepth = params.unitRadius * AIM_DEPTH_FACTOR;
  const spreadBand = params.unitRadius * SPREAD_SURFACE_BAND_FACTOR;
  const spreadNeighbourRadius = params.unitRadius * SPREAD_NEIGHBOUR_RADIUS_FACTOR;

  // Regions are deterministic given host + reference-mesh conditions (never
  // reseeded per growth run), so region ids are stable across candidates and
  // across a recipe's own re-generation at the same conditions.
  const { regionOf, regions } = computeSurfaceRegions(samples, hostBounds(hostId), buildAxis);
  const sampleById = new Map(samples.map((s) => [s.id, s]));
  const sampleHash = buildSampleSpatialHash(samples, Math.max(1e-6, params.unitRadius * 1.2));
  const marginalGainSearchRadius = params.unitRadius * MARGINAL_GAIN_SEARCH_RADIUS_FACTOR;

  /** §6.4: the point a region is actually aimed at — pulled inward from the region's own surface centroid by AIM_DEPTH_FACTOR (see that constant for the measurement behind the depth). */
  const aimOf = (region: SurfaceRegion): Vec3 => vAdd(region.centroid, vScale(region.avgInwardNormal, aimDepth));
  const regionAim = new Map<string, Vec3>();
  for (const region of regions.values()) regionAim.set(region.id, aimOf(region));

  // Initial coverage classification seeds the incrementally-maintained state
  // below — computed ONCE via the canonical function, then updated by ADDING
  // each accepted candidate's own already-computed marginal gain.
  const initialCoverage = computeSurfaceCoverage(samples, units, probeDepthField);
  const coveredIds = new Set<number>(initialCoverage.classified.filter((c) => c.status === "covered").map((c) => c.sample.id));
  const totalReferenceWeight = initialCoverage.totalWeight;
  let coveredWeightRunning = initialCoverage.coveredWeight;

  const regionUncoveredWeight = new Map<string, number>();
  const recomputeRegionUncovered = (): void => {
    for (const region of regions.values()) {
      let covered = 0;
      for (const sid of region.sampleIds) if (coveredIds.has(sid)) covered += sampleById.get(sid)!.areaWeight;
      regionUncoveredWeight.set(region.id, Math.max(0, region.totalWeight - covered));
    }
  };
  recomputeRegionUncovered();
  const bandTargetCount = new Array(HEIGHT_BAND_COUNT).fill(0) as number[];

  // Budget. `requiredUnitsForTarget` now uses the O1-measured per-unit
  // surface yield instead of the unit's whole footprint circle (see
  // SURFACE_YIELD_FACTOR) — the old formula's 2.4x overestimate is exactly
  // why sphere/waisted ran out of budget at 6-7%.
  const COLONIZATION_BUDGET_SAFETY_FACTOR = 1.0;
  const COLONIZATION_BUDGET_HARD_CAP = 900;
  const estimatedYieldPerUnit = Math.PI * params.unitRadius * params.unitRadius * SURFACE_YIELD_FACTOR;
  const productiveUnitsForTarget = (totalReferenceWeight * params.targetSurfaceCoverage) / Math.max(1e-9, estimatedYieldPerUnit);
  const requiredUnitsForTarget = Math.ceil(productiveUnitsForTarget * ROUTE_OVERHEAD_FACTOR);
  const colonizationBudget = Math.min(
    COLONIZATION_BUDGET_HARD_CAP,
    Math.max(autoBudget.totalBudget, units.length + requiredUnitsForTarget * COLONIZATION_BUDGET_SAFETY_FACTOR),
  );
  const baseBudget = Math.max(BASE_MIN_UNITS, Math.round(colonizationBudget * BASE_BUDGET_FRACTION));

  let plateauCount = 0;
  let stopReason: CoverageStopReason = "candidate-budget-exhausted";
  let zeroGainAcceptedCount = 0;
  const coverageCurve: number[] = [coveredWeightRunning / Math.max(1e-9, totalReferenceWeight)];
  let lastScoreBreakdown: ScoreTerms | null = null;
  let acceptedSinceRefresh = 0;
  let cancelled = false;
  let baseBudgetExhausted = false;
  let baseUnitsAdded = 0;
  let mainLoopAcceptances = 0;

  const measuredCoverageRunning = (): number => (totalReferenceWeight > 0 ? coveredWeightRunning / totalReferenceWeight : 0);
  const targetMet = (): boolean => measuredCoverageRunning() >= params.targetSurfaceCoverage - COVERAGE_TOLERANCE;

  const reportProgress = (): boolean => {
    if (!onProgress) return true;
    const ok = onProgress(units.length, Math.max(1, Math.round(colonizationBudget)));
    if (!ok) cancelled = true;
    return ok;
  };

  // --- shared candidate machinery ------------------------------------------

  /** Deterministic candidate ordering: score first, then position, so the same inputs always pick the same winner regardless of evaluation order. */
  const byScoreThenPosition = (a: ScoredCandidate, b: ScoredCandidate): number =>
    b.score - a.score || a.center.x - b.center.x || a.center.y - b.center.y || a.center.z - b.center.z;

  /**
   * Builds every spec's geometry from `parent`, evaluates it against the SAME
   * six rules the rest of the Study uses (evaluateCandidate is the only
   * arbiter — nothing here decides acceptance on its own), and returns the
   * best-scoring accepted candidate from the first step-fraction tier that
   * yields any. Direct-gain candidates always outrank zero-gain route
   * candidates; score only breaks ties within whichever class has members.
   */
  const proposeBest = (
    parent: GrowthUnit,
    specs: HeadingSpec[],
    opts: {
      aimPoint: Vec3 | null;
      currentDistToAim: number;
      /** Extra score added to every candidate (used by §6.1's base score, which is not about coverage at all). Returning <= 0 also disqualifies a zero-gain candidate when there is no aim point to measure progress against. */
      extraScore?: (centroid: Vec3) => number;
      /**
       * Extra way for a zero-gain candidate to qualify as real progress.
       * §6.4's traversal steps need this: moving along a surface without
       * covering anything new IS how a surface gets crossed. It is a
       * PREDICATE, never a blanket allowance — a version that simply let
       * every zero-gain spread step through measured 0.40% on box, because
       * the frontier wandered instead of traversing.
       */
      zeroGainProgress?: (centroid: Vec3) => boolean;
    },
  ): ScoredCandidate | null => {
    const parentCentroid = unitCentroid(parent);
    let fallback: ScoredCandidate | null = null;
    for (const stepFraction of COLONIZE_STEP_FRACTIONS) {
      const tierAccepted: ScoredCandidate[] = [];
      for (const spec of specs) {
        const actualStep = step * stepFraction;
        const center = vAdd(parentCentroid, vScale(spec.travel, actualStep));
        const salt = nextAttemptSalt();
        const seedStr = `${params.seed}#cover#${salt}`;
        const points = buildUnitPoints(effectiveKind, center, spec.heading, params, seedStr, rng);
        const outcome = evaluateCandidate(
          {
            hostId,
            buildAxis,
            plateOffset,
            canonicalScaleMmPerUnit,
            envelope,
            constraintsActive,
            isRoot: false,
            kind: effectiveKind,
            heading: spec.heading,
            parentPoints: parent.points,
            parentCentroid,
            center,
            derivedMaxUnsupportedSpanField,
          },
          points,
        );
        if (!outcome.accepted) {
          rejected[outcome.reason!]++;
          rejectedSamples.push({ center, reason: outcome.reason!, isRoot: false });
          continue;
        }
        const gain = estimateMarginalGain({ kind: effectiveKind, points }, sampleHash, probeDepthField, coveredIds, marginalGainSearchRadius);
        const isDirectGain = gain.gainedWeight > 1e-12;
        const extra = opts.extraScore ? opts.extraScore(center) : 0;
        if (!isDirectGain) {
          const closer = opts.aimPoint ? vLen(vSub(opts.aimPoint, center)) < opts.currentDistToAim - 1e-9 : false;
          const worthwhile = opts.extraScore ? extra > 0 : false;
          const traversing = opts.zeroGainProgress ? opts.zeroGainProgress(center) : false;
          if (!closer && !worthwhile && !traversing) continue;
        }
        const terms = computeScoreTerms(
          gain.gainedWeight,
          gain.overlapWeight,
          gain.localSearchWeight,
          points,
          params.unitRadius,
          outcome,
          envelope,
          canonicalScaleMmPerUnit,
          lateralExtentField(points, center, buildAxis),
          derivedMaxUnsupportedSpanField,
          step,
          actualStep,
        );
        const score = computeCandidateScore(terms) + extra;
        tierAccepted.push({
          travel: spec.travel,
          heading: spec.heading,
          center,
          points,
          outcome,
          score,
          terms,
          gainedSampleIds: gain.gainedSampleIds,
          gainedWeight: gain.gainedWeight,
          isDirectGain,
        });
      }
      const directGainPool = tierAccepted.filter((c) => c.isDirectGain);
      if (directGainPool.length > 0 || (opts.extraScore && tierAccepted.length > 0)) {
        const pool = opts.extraScore ? tierAccepted : directGainPool;
        pool.sort(byScoreThenPosition);
        return pool[0];
      }
      // This tier only produced zero-gain (route/traversal) candidates. Keep
      // the best of them, but KEEP SEARCHING smaller step fractions first — a
      // shorter step along the same heading often lands on still-uncovered
      // surface where the full-length one overshot it. Returning the first
      // tier that accepted anything at all, as an earlier version did, let a
      // zero-gain full-length step pre-empt a gaining short one; that alone
      // cost sphere most of its coverage (10.4% -> 6.6% when the candidate
      // set grew and full-length acceptances became more likely).
      if (tierAccepted.length > 0 && fallback === null) {
        tierAccepted.sort(byScoreThenPosition);
        fallback = tierAccepted[0];
      }
    }
    return fallback;
  };

  const acceptCandidate = (parent: GrowthUnit, cand: ScoredCandidate, role: GrowthUnitRole): GrowthUnit => {
    const child = registerAccepted(effectiveKind, cand.points, parent.id, parent.generation + 1, cand.heading, cand.outcome, role);
    units.push(child);
    edges.push({ parentId: parent.id, childId: child.id });
    lastScoreBreakdown = cand.terms;
    if (cand.gainedWeight <= 1e-12) {
      zeroGainAcceptedCount++;
    } else {
      coveredWeightRunning += cand.gainedWeight;
      for (const sid of cand.gainedSampleIds) {
        coveredIds.add(sid);
        const rid = regionOf.get(sid);
        if (rid) regionUncoveredWeight.set(rid, Math.max(0, (regionUncoveredWeight.get(rid) ?? 0) - sampleById.get(sid)!.areaWeight));
      }
    }
    coverageCurve.push(measuredCoverageRunning());
    acceptedSinceRefresh++;
    if (acceptedSinceRefresh >= COVERAGE_FULL_RECOMPUTE_INTERVAL) {
      // Drift check: the incremental running total is a search aid, never the
      // saved value — resync to a fresh canonical recompute rather than let
      // error accumulate silently.
      const full = computeSurfaceCoverage(samples, units, probeDepthField);
      coveredWeightRunning = full.coveredWeight;
      coveredIds.clear();
      for (const c of full.classified) if (c.status === "covered") coveredIds.add(c.sample.id);
      recomputeRegionUncovered();
      acceptedSinceRefresh = 0;
    }
    return child;
  };

  // --- Stage 1: §6.1 connected base ---------------------------------------

  // Coarse candidate set (centroid-based near-plate test), NOT verified
  // material contact — see isUnitNearPlate's own doc.
  const nearPlateUnits = (): GrowthUnit[] => units.filter((u) => isUnitNearPlate(u, buildAxis, plateOffset));

  /** Lowest existing unit — always a valid base seed even when the root's own centroid sits a hair outside the plate-contact tolerance (measured on box: root centroid 0.1586 vs a 0.1581 tolerance). */
  const lowestUnit = (): GrowthUnit => {
    let best = units[0];
    let bestH = Infinity;
    for (const u of units) {
      const h = vDot(unitCentroid(u), buildAxis);
      if (h < bestH - 1e-12 || (Math.abs(h - bestH) <= 1e-12 && u.id < best.id)) {
        bestH = h;
        best = u;
      }
    }
    return best;
  };

  const launchCentroids = (): Vec3[] => {
    const contacts = nearPlateUnits();
    const list = contacts.length > 0 ? contacts : [lowestUnit()];
    return list.map((u) => unitCentroid(u));
  };

  /** Mean, over every region, of the cheapest §6.2 route cost from any of `froms`. This is the quantity §6.1 says the base must actually reduce. */
  const meanRouteCost = (froms: Vec3[]): number => {
    if (froms.length === 0 || regions.size === 0) return Infinity;
    let sum = 0;
    let counted = 0;
    for (const region of regions.values()) {
      const aim = regionAim.get(region.id)!;
      let best = Infinity;
      for (const f of froms) best = Math.min(best, estimateRouteUnitCost(f, aim, buildAxis, tiltRad, step));
      if (Number.isFinite(best)) {
        sum += best;
        counted++;
      }
    }
    return counted > 0 ? sum / counted : Infinity;
  };

  const singleSourceCost = meanRouteCost([unitCentroid(lowestUnit())]);

  if (constraintsActive) {
    // Round-robin over the current base frontier so the base spreads in
    // several directions rather than running out in one line.
    const baseFrontier: number[] = [lowestUnit().id];
    let baseAdded = 0;
    let baseCursor = 0;
    let baseStall = 0;
    while (baseAdded < baseBudget && units.length < colonizationBudget && baseFrontier.length > 0 && baseStall < baseFrontier.length * 2 + 4) {
      if (!reportProgress()) break;
      const parentId = baseFrontier[baseCursor % baseFrontier.length];
      baseCursor++;
      const parent = units.find((u) => u.id === parentId);
      if (!parent) {
        baseStall++;
        continue;
      }
      const parentCentroid = unitCentroid(parent);
      const existing = launchCentroids();
      const costBefore = meanRouteCost(existing);

      // §6.1's base score: what this step is worth is how much cheaper it
      // makes every future region route, minus its own material/overlap/
      // boundary cost — NOT how much closer it gets to one target.
      const baseReductionOf = (centroid: Vec3): number => {
        const after = meanRouteCost([...existing, centroid]);
        return Number.isFinite(costBefore) && Number.isFinite(after) ? costBefore - after : 0;
      };
      const baseScoreOf = (centroid: Vec3): number => (baseReductionOf(centroid) - BASE_MIN_COST_REDUCTION) * BASE_SCORE_SCALE;

      const azimuthSeed = azimuthalBearingToward(
        // Fan outward from the network's own lowest point, so successive base
        // units walk AWAY from the existing base rather than back into it.
        vAdd(parentCentroid, vSub(parentCentroid, unitCentroid(lowestUnit()))),
        parentCentroid,
        buildAxis,
        fallbackAzimuth,
      );
      // The base holds the SAME depth setpoint the spread stage uses, measured
      // from the build plate: a base unit is material laid against the host's
      // own bottom face, so it only covers anything if it sits where the
      // coverage probe shell is. Letting it drift upward at a fixed small rise
      // put most base units at the wrong height (measured: base yield 0.80
      // samples/unit against an ideal-placement 4.4).
      const heightAbovePlate = vDot(parentCentroid, buildAxis) - plateOffset;
      const riseFraction = Math.max(
        -0.35,
        Math.min(0.35, ((aimDepth - heightAbovePlate) / Math.max(1e-6, step)) * 0.5),
      );
      const specs: HeadingSpec[] = [];
      for (const offsetDeg of PLATE_WALK_AZIMUTH_OFFSETS_DEG) {
        const azimuth = rotateVector(azimuthSeed, buildAxis, (offsetDeg * Math.PI) / 180);
        const lateral = vScale(azimuth, Math.sqrt(Math.max(0, 1 - riseFraction * riseFraction)));
        const travel = vNorm(vAdd(vScale(buildAxis, riseFraction), lateral));
        // A base unit lies flat against the host's bottom face, so a coin is
        // oriented by the build axis (the bottom face's own normal), not by its
        // travel direction. Ring keeps travel-oriented headings for the same
        // reason spread does — its axis rules are defined against buildAxis.
        specs.push({ travel, heading: effectiveKind === "coin" ? buildAxis : travel });
      }

      const winner = proposeBest(parent, specs, { aimPoint: null, currentDistToAim: Infinity, extraScore: baseScoreOf });
      if (winner && (winner.isDirectGain || baseReductionOf(winner.center) > BASE_MIN_COST_REDUCTION)) {
        const child = acceptCandidate(parent, winner, "base");
        baseFrontier.push(child.id);
        baseAdded++;
        baseStall = 0;
      } else {
        // This frontier unit has nothing worthwhile left — drop it.
        const idx = baseFrontier.indexOf(parentId);
        if (idx >= 0) baseFrontier.splice(idx, 1);
        baseStall++;
      }
    }
    baseBudgetExhausted = baseAdded >= baseBudget;
    baseUnitsAdded = baseAdded;
  }

  // --- Stage 2: §6.2 region assignment ------------------------------------

  // Launch CANDIDATES, selected by the coarse near-plate test — this set is
  // what `launchPointCount` reports, and it is not a verified-material-contact
  // set (correction doc §2.2).
  const launchUnits = (): GrowthUnit[] => {
    const contacts = nearPlateUnits();
    return contacts.length > 0 ? contacts : [lowestUnit()];
  };
  const launches = launchUnits().map((u) => ({ unitId: u.id, centroid: unitCentroid(u) }));
  const assignment = assignRegionsToLaunchPoints(regions, launches, (r) => regionAim.get(r.id)!, buildAxis, tiltRad, step);
  let assignedRegionCount = 0;
  let assignedCostSum = 0;
  for (const [, cost] of assignment.costOf) {
    if (Number.isFinite(cost)) {
      assignedRegionCount++;
      assignedCostSum += cost;
    }
  }
  const meanAssignedRouteCost = assignedRegionCount > 0 ? assignedCostSum / assignedRegionCount : Infinity;

  // Every launch point's own subtree, so a region's route starts from material
  // that actually descends from the launch point it was assigned to (§6.3
  // "各trunkは割当region群を担当").
  const subtreeOf = new Map<number, Set<number>>();
  const rebuildSubtrees = (): void => {
    subtreeOf.clear();
    for (const l of launches) subtreeOf.set(l.unitId, new Set([l.unitId]));
    const byId = new Map(units.map((u) => [u.id, u]));
    for (const u of units) {
      let cur: GrowthUnit | undefined = u;
      let hops = 0;
      while (cur && hops < units.length + 1) {
        const set = subtreeOf.get(cur.id);
        if (set) {
          set.add(u.id);
          break;
        }
        cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
        hops++;
      }
    }
  };
  rebuildSubtrees();

  // --- Stages 3+4: §6.3 trunks / §6.4 surface spread ----------------------

  let committedRegionId: string | null = null;
  let targetAttempts = 0;
  let targetBestApproachDist = Infinity;
  let targetStagnantSteps = 0;
  const abandonedRegionIds = new Set<string>();
  const regionRoutes = new Map<string, RegionRouteState>();
  /** How many times the abandoned-region set may be given a second chance (see the plateau branch below). Study仮値 — small, so a genuinely stuck run still terminates promptly. */
  let retriesLeft = 2;

  /** Nearest reference sample to `p` within a growing radius — the source of the LOCAL surface normal §6.4's tangent plane is built from. */
  const nearestSample = (p: Vec3): SurfaceSample | null => {
    for (const factor of [1, 2, 4]) {
      const found = sampleHash.queryRadius(p, params.unitRadius * SPREAD_SURFACE_BAND_FACTOR * factor);
      let best: SurfaceSample | null = null;
      let bestD = Infinity;
      for (const s of found) {
        const d = vLen(vSub(s.point, p));
        if (d < bestD - 1e-12 || (Math.abs(d - bestD) <= 1e-12 && best !== null && s.id < best.id)) {
          bestD = d;
          best = s;
        }
      }
      if (best) return best;
    }
    return null;
  };

  while (units.length < colonizationBudget) {
    if (!reportProgress()) break;
    if (targetMet()) {
      stopReason = "target-reached";
      break;
    }
    let uncoveredRegions = [...regionUncoveredWeight.entries()].filter(([id, w]) => w > 1e-9 && !abandonedRegionIds.has(id));
    if (uncoveredRegions.length === 0 && retriesLeft > 0 && abandonedRegionIds.size > 0) {
      retriesLeft--;
      abandonedRegionIds.clear();
      regionRoutes.clear();
      committedRegionId = null;
      uncoveredRegions = [...regionUncoveredWeight.entries()].filter(([, w]) => w > 1e-9);
    }
    if (uncoveredRegions.length === 0) {
      stopReason = "coverage-unreachable";
      break;
    }

    let region: SurfaceRegion | null = committedRegionId !== null ? regions.get(committedRegionId) ?? null : null;
    if (region && (regionUncoveredWeight.get(region.id) ?? 0) <= 1e-9) region = null;
    if (!region) {
      // §6.2 target selection: uncovered area, damped by the height-band
      // quota (so one band can't absorb the whole budget) AND by the route
      // cost from wherever the frontier currently is. That second factor is
      // the O1 fix — the previous version picked purely by uncovered weight
      // and so kept paying a fresh multi-step approach for a region on the
      // far side of the host, which is exactly where 43-57% of the budget
      // was going.
      const fromCentroid = unitCentroid(units[units.length - 1]);
      let bestId: string | null = null;
      let bestPriority = -Infinity;
      for (const [id, uncoveredWeight] of uncoveredRegions) {
        const r = regions.get(id)!;
        const cost = estimateRouteUnitCost(fromCentroid, regionAim.get(id)!, buildAxis, tiltRad, step);
        const reachCost = Number.isFinite(cost) ? cost : estimateRouteUnitCost(unitCentroid(lowestUnit()), regionAim.get(id)!, buildAxis, tiltRad, step);
        if (!Number.isFinite(reachCost)) continue;
        // §6.2: a region whose own surface is traversable is worth far more
        // than its area alone suggests — covering it lets the frontier
        // continue into its neighbours instead of paying a fresh approach for
        // every unit. Plate-supported regions count as traversable because
        // rule 2b lets material walk flat across them.
        const traversable = isSurfaceTraversable(r.avgInwardNormal, buildAxis, tiltRad) || vDot(r.centroid, buildAxis) - plateOffset <= params.unitRadius * PLATE_CONTACT_TOLERANCE_FACTOR;
        const traversalWeight = traversable ? 1 : NON_TRAVERSABLE_REGION_PRIORITY;
        const priority = (uncoveredWeight * traversalWeight) / (1 + bandTargetCount[r.heightBand]) / (1 + reachCost / REGION_COST_DISCOUNT);
        if (priority > bestPriority + 1e-12 || (Math.abs(priority - bestPriority) <= 1e-12 && (bestId === null || id < bestId))) {
          bestPriority = priority;
          bestId = id;
        }
      }
      region = bestId ? regions.get(bestId)! : null;
      if (!region) {
        stopReason = "coverage-unreachable";
        break;
      }
      committedRegionId = region.id;
      bandTargetCount[region.heightBand]++;
      targetAttempts = 0;
      targetBestApproachDist = Infinity;
      targetStagnantSteps = 0;
    }

    // Aim at the nearest still-uncovered sample WITHIN the region, so the aim
    // tracks whatever part of the region is still open as it fills in.
    let targetSample: SurfaceSample | null = null;
    let bestSampleDist = Infinity;
    for (const sid of region.sampleIds) {
      if (coveredIds.has(sid)) continue;
      const s = sampleById.get(sid)!;
      const d = vLen(vSub(s.point, region.centroid));
      if (d < bestSampleDist) {
        bestSampleDist = d;
        targetSample = s;
      }
    }
    const targetPoint = targetSample ? targetSample.point : region.centroid;
    const targetInwardNormal = targetSample ? targetSample.inwardNormal : region.avgInwardNormal;
    const aimPoint = vAdd(targetPoint, vScale(targetInwardNormal, aimDepth));

    let route = regionRoutes.get(region.id);
    if (!route) {
      // §6.3: start from the cheapest unit inside the subtree of the launch
      // point this region was assigned to, falling back to the cheapest unit
      // anywhere if that subtree can't serve it. Cost is §6.2's route cost,
      // not Euclidean distance.
      const assignedLaunch = assignment.launchOf.get(region.id) ?? null;
      const preferred = assignedLaunch !== null ? subtreeOf.get(assignedLaunch) ?? null : null;
      // The assigned launch point's subtree is a SOFT preference (a modest
      // cost discount), not a hard filter. Hard-filtering it was measurably
      // wrong: on sphere every one of the 38 launch points sits in the tiny
      // bottom cap, so a region assigned to a base unit could only ever start
      // from that base unit's own low chain — and every spread unit on the
      // whole host ended up below height 0.17 on a host 2.3 tall. The Phase A
      // primary path is the natural start for an upper region even when the
      // region's cheapest PLATE contact is somewhere else.
      let best: GrowthUnit | null = null;
      let bestScore = Infinity;
      for (const u of units) {
        const inPreferred = preferred ? preferred.has(u.id) : false;
        const cost = estimateRouteUnitCost(unitCentroid(u), aimPoint, buildAxis, tiltRad, step);
        if (!Number.isFinite(cost)) continue;
        const score = cost * (inPreferred ? 1 : SUBTREE_PREFERENCE_PENALTY);
        if (best === null || score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && u.id < best.id)) {
          best = u;
          bestScore = score;
        }
      }
      const initialParent = best ?? lowestUnit();
      route = { mode: "approach", frontierUnitId: initialParent.id, acceptedPathUnitIds: [initialParent.id], zeroGainRun: 0, gainedAny: false };
      regionRoutes.set(region.id, route);
      targetAttempts = 0;
      targetBestApproachDist = Infinity;
      targetStagnantSteps = 0;
    }

    const unitsById = new Map(units.map((u) => [u.id, u]));
    const parent = unitsById.get(route.frontierUnitId) ?? units[units.length - 1];
    const parentCentroid = unitCentroid(parent);
    const distToAim = vLen(vSub(aimPoint, parentCentroid));

    // §6.4's mode switch is measured against the HOST BOUNDARY, not against
    // the aim point: what makes tangent-plane spread the right move is being
    // near a surface, and being near a surface is what the host SDF says.
    const depthInside = -hostSdf(hostId, parentCentroid.x, parentCentroid.y, parentCentroid.z);
    const nearSurface = depthInside <= spreadBand;
    let mode: RegionRouteState["mode"];
    if (!constraintsActive) {
      mode = "approach";
    } else if (nearSurface) {
      mode = "spread";
    } else if (distToAim <= step * APPROACH_SWITCH_STEP_MULTIPLE) {
      mode = "spread";
    } else {
      // Still deep inside the host: this is trunk work (rising toward the
      // assigned regions) rather than a short approach.
      mode = depthInside > spreadBand * 2 ? "trunk" : "approach";
    }
    route.mode = mode;

    if (distToAim < targetBestApproachDist - params.unitRadius * 0.1) {
      targetBestApproachDist = distToAim;
      targetStagnantSteps = 0;
    } else {
      targetStagnantSteps++;
    }

    // --- heading construction -------------------------------------------
    const specs: HeadingSpec[] = [];
    if (!constraintsActive) {
      const towardTarget = vNorm(vSub(aimPoint, parentCentroid), buildAxis);
      const { u: perpU, v: perpV } = tangentBasis(towardTarget);
      for (const offset of FIELD_ONLY_HEADING_OFFSETS) {
        const travel = vNorm(vAdd(towardTarget, vAdd(vScale(perpU, offset.du), vScale(perpV, offset.dv))));
        specs.push({ travel, heading: travel });
      }
    } else if (mode === "spread") {
      // §6.4 — the real local tangent plane, built from the nearest reference
      // sample's OWN normal.
      const near = nearestSample(parentCentroid);
      const outward = near ? vScale(near.inwardNormal, -1) : vNorm(vSub(parentCentroid, vScale(buildAxis, vDot(parentCentroid, buildAxis))), fallbackAzimuth);
      const { t1 } = localTangentBasis(outward);

      // Bearing = uncovered-neighbour attraction minus covered repulsion,
      // both projected into that tangent plane.
      let attract: Vec3 = { x: 0, y: 0, z: 0 };
      let repel: Vec3 = { x: 0, y: 0, z: 0 };
      for (const s of sampleHash.queryRadius(parentCentroid, spreadNeighbourRadius)) {
        const rel = vSub(s.point, parentCentroid);
        const d = vLen(rel);
        if (d < 1e-6) continue;
        const w = 1 / (d * d);
        const dir = vScale(rel, 1 / d);
        if (coveredIds.has(s.id)) repel = vAdd(repel, vScale(dir, w));
        else attract = vAdd(attract, vScale(dir, w));
      }
      let bearing = vSub(attract, vScale(repel, SPREAD_COVERED_REPULSION));
      if (vLen(bearing) < 1e-9) bearing = vSub(aimPoint, parentCentroid);
      const tangentBearing = projectOntoTangentPlane(bearing, outward, 0, t1);

      // Depth is a SETPOINT, not a push direction: hold the frontier at
      // AIM_DEPTH_FACTOR*unitRadius below the boundary, where the coverage
      // probe shell actually is. Positive correction = move outward.
      const depthError = depthInside - aimDepth;
      const normalCorrection = Math.max(-0.6, Math.min(0.6, (depthError / Math.max(1e-6, step)) * (SPREAD_DEPTH_GAIN / 10)));

      for (const offsetDeg of SPREAD_TANGENT_OFFSETS_DEG) {
        // Rotating a tangent vector ABOUT THE SURFACE NORMAL keeps it in the
        // tangent plane — this is what makes the fan a surface fan instead of
        // the build-axis fan that drove box's host-exterior plateau.
        const tangentDir = rotateVector(tangentBearing, outward, (offsetDeg * Math.PI) / 180);
        // The unit is oriented by the SURFACE, not by its travel direction —
        // a coin lying flat against the host wall. Ring keeps travel-oriented
        // headings, because its own axis rules are defined against buildAxis
        // and a surface-normal axis would trip ring-horizontal on every
        // horizontal face.
        const heading = effectiveKind === "coin" ? outward : tangentDir;
        const withDepth = vNorm(vAdd(tangentDir, vScale(outward, normalCorrection)), tangentDir);
        const rise = vDot(withDepth, buildAxis);
        const lateralVec = vSub(withDepth, vScale(buildAxis, rise));
        const lateralLen = vLen(lateralVec);
        const riseMm = rise * step * canonicalScaleMmPerUnit;
        const lateralMm = lateralLen * step * canonicalScaleMmPerUnit;
        const allowedMm = allowedLateralForStepMm(riseMm, envelope.layerHeightMm, envelope.derivedMaxLateralAdvancePerLayerMm);
        // Always offer the PURE tangent step, even when rule 5's cone would
        // refuse it off the plate: down at the host's own bottom face the
        // tangent plane is horizontal, and a horizontal step there is exactly
        // the connected base — rule 2b accepts it when the candidate really
        // rests on the plate and rejects it otherwise. Letting the rule decide
        // is what lets one spread implementation serve both the bottom face
        // and the walls, instead of a separate hand-scheduled base phase
        // competing with spread for the same budget.
        specs.push({ travel: withDepth, heading });
        if (rise < 0 || lateralMm > allowedMm) {
          // Off the plate the same tangent direction has to be tilted toward
          // the build axis by exactly the cone rule 5 allows, keeping the
          // lateral direction tangent, with the same depth correction applied.
          // On a vertical wall this is what turns "spread sideways" into the
          // diagonal stripe a 30deg support threshold actually permits.
          const lateralHat = lateralLen > 1e-9 ? vScale(lateralVec, 1 / lateralLen) : t1;
          const tilted = tiltedHeading(buildAxis, lateralHat, tiltRad);
          specs.push({ travel: vNorm(vAdd(tilted, vScale(outward, normalCorrection)), tilted), heading });
        }
      }
    } else {
      const azimuthBearing = azimuthalBearingToward(aimPoint, parentCentroid, buildAxis, fallbackAzimuth);
      const offsets = mode === "trunk" ? TRUNK_AZIMUTH_OFFSETS_DEG : APPROACH_AZIMUTH_OFFSETS_DEG;
      for (const offsetDeg of offsets) {
        const azimuth = rotateVector(azimuthBearing, buildAxis, (offsetDeg * Math.PI) / 180);
        const travel = tiltedHeading(buildAxis, azimuth, tiltRad);
        specs.push({ travel, heading: travel });
      }
    }

    // A zero-gain spread step is only real progress if it is TRAVERSING:
    // it must sit at (or move toward) the probe depth, and it must not just
    // sit still. Everywhere else a zero-gain step must close distance to the
    // aim point, which proposeBest checks on its own.
    const depthToleranceField = params.unitRadius * SPREAD_DEPTH_TOLERANCE_FACTOR;
    const currentDepthError = Math.abs(depthInside - aimDepth);
    const winner = proposeBest(parent, specs, {
      aimPoint,
      currentDistToAim: distToAim,
      zeroGainProgress:
        mode === "spread" && route.gainedAny
          ? (centroid) => {
              const d = -hostSdf(hostId, centroid.x, centroid.y, centroid.z);
              const err = Math.abs(d - aimDepth);
              return err <= depthToleranceField || err < currentDepthError - 1e-9;
            }
          : undefined,
    });

    if (winner) {
      const role: GrowthUnitRole = mode === "spread" ? "surface-spread" : mode === "trunk" ? "trunk" : "surface-approach";
      const child = acceptCandidate(parent, winner, role);
      mainLoopAcceptances++;
      route.frontierUnitId = child.id;
      route.acceptedPathUnitIds.push(child.id);
      // Only a step that actually reduced uncovered area counts as progress.
      // An accepted zero-gain traversal step is movement, not progress, and
      // must not reset the stall counters — see
      // SPREAD_ZERO_GAIN_TRAVERSAL_LIMIT for what happened when it did.
      if (winner.isDirectGain) {
        targetAttempts = 0;
        plateauCount = 0;
        route.zeroGainRun = 0;
        route.gainedAny = true;
      } else if (mode === "spread") {
        route.zeroGainRun++;
      }
      // An approach/trunk step is zero-gain BY DESIGN — it is travel toward a
      // region that isn't reachable yet, and a long one is normal (a sphere's
      // equator is ~19 steps of lateral travel from its axis). Neither those
      // nor bounded spread traversal count against the GLOBAL plateau
      // counter, which exists to detect "nothing can be accepted at all any
      // more"; letting accepted route steps increment it stopped sphere at
      // 22.85% mid-approach with budget still in hand. Per-region runaway is
      // bounded separately by SPREAD_ZERO_GAIN_TRAVERSAL_LIMIT and
      // TARGET_STAGNANT_LIMIT, which is where that belongs.
      if ((regionUncoveredWeight.get(region.id) ?? 0) <= 1e-9 || route.zeroGainRun >= SPREAD_ZERO_GAIN_TRAVERSAL_LIMIT) {
        if (route.zeroGainRun >= SPREAD_ZERO_GAIN_TRAVERSAL_LIMIT) abandonedRegionIds.add(region.id);
        committedRegionId = null;
        regionRoutes.delete(region.id);
      }
    } else {
      plateauCount++;
      targetAttempts++;
      if (targetAttempts >= TARGET_ATTEMPT_LIMIT) {
        abandonedRegionIds.add(region.id);
        committedRegionId = null;
        regionRoutes.delete(region.id);
      }
    }

    if (committedRegionId !== null && targetStagnantSteps >= TARGET_STAGNANT_LIMIT) {
      abandonedRegionIds.add(region.id);
      committedRegionId = null;
      regionRoutes.delete(region.id);
    }

    if (plateauCount >= COVERAGE_PLATEAU_LIMIT) {
      // A region is abandoned for a reason that is TRUE OF THE MOMENT — the
      // frontier was somewhere else, or the route into it had not been built
      // yet. That reason expires. Before declaring the whole run stuck, give
      // the abandoned set a fresh pass from wherever the network has since
      // grown to; without this, sphere stalled at 22.85% with a third of its
      // budget unspent, holding a permanent grudge against regions it had
      // written off hundreds of units earlier.
      if (retriesLeft > 0 && abandonedRegionIds.size > 0) {
        retriesLeft--;
        abandonedRegionIds.clear();
        regionRoutes.clear();
        committedRegionId = null;
        plateauCount = 0;
        continue;
      }
      // §6.5: attribute the stall to what actually blocked it, using this
      // run's own rejection tallies — never reported as success.
      const angleBlocked = rejected["lateral-advance-exceeded"] + rejected["ring-horizontal"] + rejected["ring-discontinuous-support"] + rejected["negative-rise-rejected"];
      const boundaryBlocked = rejected["host-exterior"] + rejected["unsupported-span-exceeded"];
      const contactBlocked = rejected["no-parent-contact"];
      if (contactBlocked >= angleBlocked && contactBlocked >= boundaryBlocked) stopReason = "surface-spread-blocked";
      else stopReason = angleBlocked >= boundaryBlocked ? "support-angle-blocked" : "host-boundary-blocked";
      break;
    }
  }

  // §6.5: attribute the stop to the stage that actually ran out. The base
  // hitting its own cap is only the REASON growth stopped if the trunk/spread
  // stages then never managed a single step — otherwise the base finishing is
  // just the base finishing, and it must not be reported as the stop reason
  // (an earlier version did exactly that, and mislabelled two budget-bound
  // runs as `base-budget-exhausted`).
  if (cancelled) stopReason = "candidate-budget-exhausted";
  else if (stopReason === "candidate-budget-exhausted") {
    if (baseBudgetExhausted && mainLoopAcceptances === 0) stopReason = "base-budget-exhausted";
    else if (units.length >= colonizationBudget) stopReason = "trunk-budget-exhausted";
  }
  void baseUnitsAdded;

  // Authoritative final measurement — the returned/saved number is ALWAYS
  // this fresh canonical recompute, never the incrementally-tracked running
  // total, however close the two usually are.
  const finalCoverage = computeSurfaceCoverage(samples, units, probeDepthField);
  const incrementalFinalDrift = Math.abs(measuredCoverageRunning() - finalCoverage.measuredCoverage);

  let reachedRegionCount = 0;
  for (const region of regions.values()) {
    if ((regionUncoveredWeight.get(region.id) ?? 0) <= 1e-9) reachedRegionCount++;
  }

  return {
    measuredSurfaceCoverage: finalCoverage.measuredCoverage,
    stopReason,
    algorithmVersion: O2_ALGORITHM_VERSION,
    regionCount: regions.size,
    reachedRegionCount,
    zeroGainAcceptedCount,
    coverageCurve,
    incrementalFinalDrift,
    scoreWeights: SCORE_WEIGHTS,
    lastScoreBreakdown,
    launchPointCount: launches.length,
    assignedRegionCount,
    meanAssignedRouteCost: Number.isFinite(meanAssignedRouteCost) ? meanAssignedRouteCost : -1,
    meanSingleSourceRouteCost: Number.isFinite(singleSourceCost) ? singleSourceCost : -1,
    cancelled,
  };
}


export interface GrowNetworkOptions {
  /**
   * O3 §8: called during colonization with (accepted units so far, this run's
   * own unit ceiling). Returning false asks growth to stop at the next loop
   * boundary and report honestly how far it got — the result is still a real
   * result, never a fabricated one.
   *
   * The Worker does not use the return value (it cancels by being terminated,
   * see growthWorkerProtocol.ts); the hook exists so a caller running growth
   * on the main thread — including the tests — can still bound it.
   */
  onProgress?: (completed: number, total: number) => boolean;
}

export function growNetwork(
  hostId: HostFixtureId,
  envelope: FabricationEnvelope,
  params: GrowthParams,
  variant: GrowthVariant,
  canonicalScaleMmPerUnit: number,
  options: GrowNetworkOptions = {},
): GrowthResult {
  const constraintsActive = variant !== "field-only";
  if (constraintsActive && !isEnvelopeValid(envelope)) {
    throw new Error("layer height / support threshold angle が不正なため、制約付き生成は実行できません。");
  }
  const effectiveKind: GrowthUnitKind = variant === "field-only" ? params.unitKind : variant === "coin-constrained" ? "coin" : "ring";

  resetUnitIdCounter(1);
  const rng = makeRng(hashSeed(params.seed));
  const bounds = hostBounds(hostId);
  const buildAxis = vNorm(envelope.buildAxis);
  const plateOffset = buildPlateOffset(hostId, buildAxis);
  const topOffset = hostTopOffset(hostId, buildAxis);
  const plateBand = params.unitRadius * 4; // widened alongside rule 2's own tolerance (see evaluateCandidate) so curved hosts propose enough in-band candidates to actually pass it
  const derivedMaxUnsupportedSpanField = computeDerivedMaxUnsupportedSpanField(params.unitRadius);
  const autoBudget = computeAutoBudget(hostId, buildAxis, params.unitRadius);

  const units: GrowthUnit[] = [];
  const edges: { parentId: number; childId: number }[] = [];
  const rejected = zeroRejectionCounts();
  const rejectedSamples: { center: Vec3; reason: RejectionReason; isRoot: boolean }[] = [];
  let clippedUnitCount = 0;
  let maxClipFieldUnits = 0;
  let attemptSalt = 0;

  const registerAccepted = (
    kind: GrowthUnitKind,
    points: GrowthUnitPoint[],
    parentId: number | null,
    generation: number,
    heading: Vec3,
    outcome: EvaluateOutcome,
    role: GrowthUnitRole,
  ): GrowthUnit => {
    const unit: GrowthUnit = {
      id: freshUnitId(),
      kind,
      points,
      parentId,
      generation,
      supportContact: parentId === null ? "build-plate" : "parent",
      role,
      heading,
      verticalStepField: outcome.verticalStepField,
      lateralStepField: outcome.lateralStepField,
    };
    if (outcome.clipFieldUnits > 0) {
      clippedUnitCount++;
      maxClipFieldUnits = Math.max(maxClipFieldUnits, outcome.clipFieldUnits);
    }
    return unit;
  };

  /**
   * Rejection-sampled root near the build plate (§5, host-level rule — every
   * variant). Returns null if no accepted root was found within the attempt
   * budget.
   *
   * Keeps the LOWEST accepted candidate rather than the first one. Rule 2's
   * plate tolerance is deliberately coarse (2x the unit's own max point
   * radius), so "first accepted" could legitimately land a whole tolerance
   * band above the plate — measured on box: the root's centroid sat 0.159
   * field-units up, which puts it ABOVE the coverage probe shell of the
   * host's own bottom face, and since rule 5 rejects every negative-rise
   * step nothing can ever come back down to it. The bottom face is 1/6 of a
   * box's surface area, so where the root lands is worth this much care.
   */
  const sampleOneRoot = (attemptsMax: number): GrowthUnit | null => {
    let fails = 0;
    let best: { points: GrowthUnitPoint[]; heading: Vec3; outcome: EvaluateOutcome; height: number } | null = null;
    while (fails < attemptsMax) {
      const p = sampleWithinBounds(bounds, rng);
      attemptSalt++;
      const proj = vDot(p, buildAxis);
      if (proj - plateOffset > plateBand || hostSdf(hostId, p.x, p.y, p.z) >= 0) {
        fails++;
        continue;
      }
      const heading = buildAxis; // roots point straight up by convention — unambiguous, deterministic
      const seedStr = `${params.seed}#root#${attemptSalt}`;
      const points = buildUnitPoints(effectiveKind, p, heading, params, seedStr, rng);
      const outcome = evaluateCandidate(
        {
          hostId,
          buildAxis,
          plateOffset,
          canonicalScaleMmPerUnit,
          envelope,
          constraintsActive,
          isRoot: true,
          kind: effectiveKind,
          heading,
          parentPoints: null,
          parentCentroid: null,
          center: p,
          derivedMaxUnsupportedSpanField,
        },
        points,
      );
      if (outcome.accepted) {
        let sum = 0;
        for (const q of points) sum += vDot(q, buildAxis);
        const height = sum / points.length - plateOffset;
        if (!best || height < best.height - 1e-12) best = { points, heading, outcome, height };
        // Good enough to stop early: already within half a layer-ish of the
        // plate, so further sampling can only trade RNG draws for nothing.
        if (height <= params.unitRadius * 0.35) break;
        fails++;
        continue;
      }
      rejected[outcome.reason!]++;
      rejectedSamples.push({ center: p, reason: outcome.reason!, isRoot: true });
      fails++;
    }
    if (best) return registerAccepted(effectiveKind, best.points, null, 0, best.heading, best.outcome, "root");
    return null;
  };

  // S2.1 audit-fix §3.2: no longer scaled by params.rootTarget (that field
  // is now a documented no-op, see field.ts) — a fixed generous budget for
  // finding Phase A's ONE primary root.
  const rootAttemptsMax = 400;

  // --- Phase A: primary path, build plate -> host top, deterministic DFS
  // with backtracking (author feedback §5.1). A single continuous chain is
  // grown BEFORE any branching, so height coverage is never starved by
  // branch/root budget spent elsewhere (§5 "unit数を増やすだけの修正は禁止").
  const primaryRoot = sampleOneRoot(rootAttemptsMax);
  const primaryPathUnitIds: number[] = [];
  let heightCoverage = 0;
  let topReached = false;

  if (primaryRoot) {
    units.push(primaryRoot);
    const stack: { unit: GrowthUnit; tryIndex: number }[] = [{ unit: primaryRoot, tryIndex: 0 }];
    const maxIterations = autoBudget.minimumPathUnits * 8; // generous safety valve — NOT a success condition (§5.3 "上端到達前に上限へ達した場合は成功扱いしない")
    let iterations = 0;
    while (stack.length > 0 && !topReached && iterations < maxIterations && units.length < autoBudget.totalBudget) {
      iterations++;
      const frame = stack[stack.length - 1];
      if (frame.tryIndex >= PRIMARY_PATH_HEADING_OFFSETS_DEG.length) {
        stack.pop(); // deterministic backtrack: this node's candidates are exhausted
        continue;
      }
      const offsetDeg = PRIMARY_PATH_HEADING_OFFSETS_DEG[frame.tryIndex];
      frame.tryIndex++;
      const parent = frame.unit;
      const parentCentroid = unitCentroid(parent);
      attemptSalt++;
      const baseHeading = primaryPathBaseHeading(parentCentroid, buildAxis, hashSeed(params.seed), effectiveKind);
      const heading = rotateVector(baseHeading, buildAxis, (offsetDeg * Math.PI) / 180);
      const step = params.unitRadius * STEP_FACTOR;
      const center = vAdd(parentCentroid, vScale(heading, step));
      const seedStr = `${params.seed}#path#${attemptSalt}`;
      const points = buildUnitPoints(effectiveKind, center, heading, params, seedStr, rng);
      const outcome = evaluateCandidate(
        {
          hostId,
          buildAxis,
          plateOffset,
          canonicalScaleMmPerUnit,
          envelope,
          constraintsActive,
          isRoot: false,
          kind: effectiveKind,
          heading,
          parentPoints: parent.points,
          parentCentroid,
          center,
          derivedMaxUnsupportedSpanField,
        },
        points,
      );
      if (outcome.accepted) {
        const child = registerAccepted(effectiveKind, points, parent.id, parent.generation + 1, heading, outcome, "primary-path");
        units.push(child);
        edges.push({ parentId: parent.id, childId: child.id });
        stack.push({ unit: child, tryIndex: 0 });
      } else {
        rejected[outcome.reason!]++;
        rejectedSamples.push({ center, reason: outcome.reason!, isRoot: false });
      }
    }

    // Height coverage/topReached/primaryPathUnitIds are captured HERE, from
    // Phase A's own accepted units ONLY, and never recomputed after this
    // point — Phase B (below) may add many more units but must not move
    // these numbers (verified in growth.test.ts).
    let topUnit = primaryRoot;
    let maxProjection = vDot(unitCentroid(primaryRoot), buildAxis);
    for (const u of units) {
      const proj = vDot(unitCentroid(u), buildAxis);
      if (proj > maxProjection) {
        maxProjection = proj;
        topUnit = u;
      }
    }
    heightCoverage = topOffset > plateOffset ? clamp01((maxProjection - plateOffset) / (topOffset - plateOffset)) : 1;
    topReached = heightCoverage >= 0.95;
    const byId = new Map(units.map((u) => [u.id, u]));
    let cur: GrowthUnit | undefined = topUnit;
    while (cur) {
      primaryPathUnitIds.unshift(cur.id);
      cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
    }
  }

  // S2.1 audit-fix §3.2: no more independent extra roots here — that loop
  // (removed) created parentId=null units with no material connection to
  // Phase A's own chain, which could and did land as multiple disconnected
  // mesh components (measured: default rootTarget=5 produced 3-4 components,
  // and the old save gate accepted it as "monolithic"). There is always
  // exactly one graph root. Widening the build-plate-supported base for
  // hard-to-reach surface regions is now Phase B/C's own job
  // (growSurfaceColonization's "plate-walk" mode, §5.3), which only ever
  // extends the network via an existing unit's own material contact (rule 4)
  // — never a disconnected second part.
  const rootCount = units.filter((u) => u.parentId === null).length;

  // --- Phase B/C: coverage-directed surface colonization (plan doc
  // katachi-interior-growth-surface-coverage-plan-20260725.md §4). Replaces
  // Phase 1A/Stage 1A.1's undirected branch/fill entirely — the plan doc is
  // explicit that "単にbranching値やunit数を増やす方法は禁止する"; growth here is
  // always aimed at a specific currently-uncovered reference-mesh sample,
  // never a random direction. Never revisits/alters Phase A's captured
  // primary-path numbers above (§5.2 of the earlier instruction, still
  // honored: Phase A already ran to completion before this starts).
  let earlyTerminated = false;
  const coverageResult = growConnectedMultiSource({
    hostId,
    envelope,
    params,
    effectiveKind,
    canonicalScaleMmPerUnit,
    buildAxis,
    plateOffset,
    derivedMaxUnsupportedSpanField,
    constraintsActive,
    autoBudget,
    units,
    edges,
    rejected,
    rejectedSamples,
    registerAccepted,
    rng,
    nextAttemptSalt: () => ++attemptSalt,
    onProgress: options.onProgress,
  });
  earlyTerminated = coverageResult.stopReason === "support-angle-blocked" || coverageResult.stopReason === "host-boundary-blocked";

  // Correction doc §2.2: measured HERE, after every growth stage (the
  // connected base included) has finished — measuring it before
  // growConnectedMultiSource is exactly the bug that made the old
  // plateContactCount report 2 while ~108 base units were sitting on the plate.
  const actualPlateContactCount = countActualPlateContacts(
    units,
    buildAxis,
    plateOffset,
    canonicalScaleMmPerUnit,
    envelope.layerHeightMm,
  );

  return {
    variant,
    hostId,
    // Snapshot, not the caller's live object: main.ts always replaces (never
    // in-place-mutates) its own state.params/envelope on every change, but a
    // defensive copy here means a GrowthResult's own record of "what it was
    // generated with" can never drift out from under it regardless of caller
    // discipline (verified in growth.test.ts).
    params: { ...params },
    envelope: { ...envelope, buildAxis: { ...envelope.buildAxis } },
    effectiveKind,
    constraintsActive,
    canonicalScaleMmPerUnit,
    units,
    edges,
    rejected,
    rootCount,
    actualPlateContactCount,
    clippedUnitCount,
    maxClipFieldUnits,
    earlyTerminated,
    rejectedSamples,
    primaryPathUnitIds,
    heightCoverage,
    topReached,
    autoBudget,
    measuredSurfaceCoverage: coverageResult.measuredSurfaceCoverage,
    coverageStopReason: coverageResult.stopReason,
    algorithmVersion: coverageResult.algorithmVersion,
    regionCount: coverageResult.regionCount,
    reachedRegionCount: coverageResult.reachedRegionCount,
    zeroGainAcceptedCount: coverageResult.zeroGainAcceptedCount,
    coverageCurve: coverageResult.coverageCurve,
    incrementalFinalDrift: coverageResult.incrementalFinalDrift,
    scoreWeights: coverageResult.scoreWeights,
    launchPointCount: coverageResult.launchPointCount,
    assignedRegionCount: coverageResult.assignedRegionCount,
    meanAssignedRouteCost: coverageResult.meanAssignedRouteCost,
    meanSingleSourceRouteCost: coverageResult.meanSingleSourceRouteCost,
  };
}

// --- §8: void / reachability analysis ---------------------------------------

/**
 * One piece of material: a sphere (coin sub-point) or a tapered capsule
 * between two consecutive ring nodes.
 *
 * §7 — why ring material is a capsule chain and not a sphere union. The
 * previous mesh field was a raw union of every unit's own point spheres, and
 * measured against a ring's actual geometry that is wrong: `generateRingBalls`
 * places `ringNodeCount` (8) nodes on a circle of radius `unitRadius` (0.14),
 * so consecutive nodes sit 2*0.14*sin(pi/8) = 0.107 apart while their radii
 * sum to only 2*0.14*0.28 = 0.078. A ring's own nodes DO NOT TOUCH — every
 * ring was already eight separate balls in the mesh field, which is the whole
 * reason a ring-constrained candidate came out as 8-22 mesh components while
 * its graph reported exactly one root.
 *
 * Three things were ruled out by measurement before landing here:
 *  - mesh resolution: raising it 64 -> 96 -> 128 made components WORSE
 *    (12 -> 15 -> 16), because finer sampling reveals the true separation
 *    instead of letting neighbouring blobs merge by under-sampling;
 *  - parent contact: every parent/child pair really does overlap, gaps
 *    measured at -0.009 to -0.064 (rule 4 requires <= 0);
 *  - blendK: at 0.042 it is already 1.2x the tube radius and was papering
 *    over part of the gap — raising it further would dissolve the whole form,
 *    which §7 explicitly forbids.
 *
 * coverage.ts has ALWAYS modelled ring material as a tapered-capsule union
 * along the node chain (see isInsideUnitMaterial). So the real defect was that
 * the coverage measurement and the exported mesh disagreed about what a ring
 * IS — coverage counted tube material the mesh never built. This makes the
 * mesh field match the model coverage already used, rather than inflating any
 * radius or blend to hide the gap.
 */
export interface FieldElement {
  a: GrowthUnitPoint;
  /** null for a sphere; the far end of the capsule otherwise. */
  b: GrowthUnitPoint | null;
  /** Centre and radius of a bound enclosing this element, for the spatial index. */
  cx: number;
  cy: number;
  cz: number;
  bound: number;
}

export function elementSdf(e: FieldElement, x: number, y: number, z: number): number {
  const a = e.a;
  if (e.b === null) return Math.hypot(x - a.x, y - a.y, z - a.z) - a.r;
  const b = e.b;
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = lenSq > 1e-12 ? ((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / lenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a.x + abx * t, py = a.y + aby * t, pz = a.z + abz * t;
  return Math.hypot(x - px, y - py, z - pz) - (a.r + (b.r - a.r) * t);
}

/** The material elements of one unit: raw spheres for a coin, a closed tapered-capsule chain for a ring — the SAME decomposition coverage.ts's isInsideUnitMaterial uses. */
export function unitFieldElements(unit: GrowthUnit): FieldElement[] {
  return fieldElementsOf(unit.kind, unit.points);
}

/** The kind/points form, for callers that do not have a registered GrowthUnit yet — notably evaluateCandidate, which must judge a CANDIDATE's material by exactly the same decomposition an accepted unit's is judged by. */
export function fieldElementsOf(kind: GrowthUnitKind, points: GrowthUnitPoint[]): FieldElement[] {
  const pts = points;
  const out: FieldElement[] = [];
  if (kind === "ring" && pts.length > 1) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push({
        a,
        b,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        cz: (a.z + b.z) / 2,
        bound: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 2 + Math.max(a.r, b.r),
      });
    }
    return out;
  }
  for (const p of pts) out.push({ a: p, b: null, cx: p.x, cy: p.y, cz: p.z, bound: p.r });
  return out;
}

/** Smooth-min union of every unit's material. The exact O(elements) reference definition — `createUnitsFieldSampler` below is the indexed form every hot caller should use, and is verified against this in growth.test.ts. */
export function unitsPointsSdf(units: GrowthUnit[], blendK: number, x: number, y: number, z: number): number {
  let d = 1e5;
  let first = true;
  for (const u of units) {
    for (const e of unitFieldElements(u)) {
      const de = elementSdf(e, x, y, z);
      d = first ? de : smoothMin(d, de, blendK);
      first = false;
    }
  }
  return d;
}

/**
 * O4 §9 "unit point spatial index / voxelごとの近傍unitだけをSDF評価": the same
 * field as `unitsPointsSdf`, but each query only smooth-mins the points that
 * can actually affect it.
 *
 * Why this exists: the marching-tetrahedra mesh pass evaluates the field at
 * resolution^3 points, and the exact form walks EVERY point of EVERY unit at
 * each one. At the diagnosis conditions that was already the dominant cost
 * (measured: 3.3-4.7s per candidate at 137-220 units, against well under 1s
 * for growth itself), and it grows linearly with unit count — which is exactly
 * what the coverage target needs more of.
 *
 * Accuracy: `smoothMin(a, b, k)` differs from `min(a, b)` only while
 * `|a - b| < k`, so a point farther than `cutoff` from the query cannot change
 * the result of a query that already has material nearby. Queries with NO
 * point inside the cutoff return `cutoff` itself — a positive value, and the
 * true distance there is positive too, so the zero isosurface (the only level
 * the mesh and the void grid read) is unaffected. This is a documented
 * far-field approximation, not an exact reproduction: it is exact wherever the
 * field is anywhere near zero, and deliberately coarse where it is far from it.
 */
export function createUnitsFieldSampler(units: GrowthUnit[], blendK: number): (x: number, y: number, z: number) => number {
  const elements: FieldElement[] = [];
  let maxBound = 0;
  for (const u of units) {
    for (const e of unitFieldElements(u)) {
      elements.push(e);
      if (e.bound > maxBound) maxBound = e.bound;
    }
  }
  if (elements.length === 0) return () => 1e5;
  const cutoff = maxBound + Math.max(blendK * 6, maxBound * 2);
  // Elements are indexed by their bounding-sphere CENTRE, so the query radius
  // has to be widened by the largest bound for the lookup to stay exact.
  const queryRadius = cutoff + maxBound;
  const hash = new SpatialHash<FieldElement>(Math.max(1e-6, queryRadius));
  for (const e of elements) hash.insert({ x: e.cx, y: e.cy, z: e.cz }, e);
  return (x: number, y: number, z: number): number => {
    const nearby = hash.queryRadius({ x, y, z }, queryRadius);
    if (nearby.length === 0) return cutoff;
    let d = 1e5;
    let first = true;
    for (const e of nearby) {
      const de = elementSdf(e, x, y, z);
      d = first ? de : smoothMin(d, de, blendK);
      first = false;
    }
    return Math.min(d, cutoff);
  };
}

export interface VoidAnalysis {
  resolution: number;
  cellVolumeField: number;
  solidCells: number;
  exteriorConnectedVoidCells: number;
  closedVoidComponents: number;
  closedVoidCells: number;
  hostInteriorCells: number;
}

/**
 * Grid-based flood fill (instruction §8). A void cell that is 6-connected
 * (through other void cells) to any exterior cell OR to the grid boundary is
 * "exterior-connected"; everything else void is "closed". This is a coarse
 * Monte-Carlo-like grid approximation (resolution³ samples), not an exact
 * volume integral — documented in the UI caption, not hidden (AGENTS §6).
 * "外部連通voidがある"ことと「サポートを除去できる」ことは同一視しない — this function
 * reports geometry only, never a printability claim.
 */
interface VoidGrid {
  n: number;
  bounds: Bounds;
  stepX: number;
  stepY: number;
  stepZ: number;
  /** 0 = exterior, 1 = void, 2 = solid. */
  cls: Uint8Array;
  /** 1 = void cell reachable from the exterior/grid boundary through other void cells. */
  visited: Uint8Array;
  idx: (x: number, y: number, z: number) => number;
  neighborsOf: (x: number, y: number, z: number) => number[];
}

/** Shared grid classification + exterior-connectivity flood fill, consumed by both analyzeVoids (aggregate stats) and sampleVoidCellCenters (renderer display points) — one classification, never two that could silently disagree. */
function buildVoidGrid(hostId: HostFixtureId, units: GrowthUnit[], blendK: number, resolution: number): VoidGrid {
  const b = hostBounds(hostId);
  const materialAt = createUnitsFieldSampler(units, blendK);
  const n = Math.max(6, Math.round(resolution));
  const stepX = b.size.x / n;
  const stepY = b.size.y / n;
  const stepZ = b.size.z / n;
  const total = n * n * n;
  const cls = new Uint8Array(total);
  const idx = (x: number, y: number, z: number) => x + y * n + z * n * n;
  for (let z = 0; z < n; z++) {
    const pz = b.min.z + (z + 0.5) * stepZ;
    for (let y = 0; y < n; y++) {
      const py = b.min.y + (y + 0.5) * stepY;
      for (let x = 0; x < n; x++) {
        const px = b.min.x + (x + 0.5) * stepX;
        const i = idx(x, y, z);
        const hs = hostSdf(hostId, px, py, pz);
        if (hs >= 0) {
          cls[i] = 0;
          continue;
        }
        const ms = units.length === 0 ? 1e5 : materialAt(px, py, pz);
        cls[i] = ms < 0 ? 2 : 1;
      }
    }
  }

  const neighborsOf = (x: number, y: number, z: number): number[] => {
    const out: number[] = [];
    out.push(x > 0 ? idx(x - 1, y, z) : -1);
    out.push(x < n - 1 ? idx(x + 1, y, z) : -1);
    out.push(y > 0 ? idx(x, y - 1, z) : -1);
    out.push(y < n - 1 ? idx(x, y + 1, z) : -1);
    out.push(z > 0 ? idx(x, y, z - 1) : -1);
    out.push(z < n - 1 ? idx(x, y, z + 1) : -1);
    return out;
  };

  const visited = new Uint8Array(total);
  const queue: number[] = [];
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = idx(x, y, z);
        if (cls[i] !== 1) continue;
        const touchesExteriorOrBoundary = neighborsOf(x, y, z).some((ni) => ni === -1 || cls[ni] === 0);
        if (touchesExteriorOrBoundary) {
          visited[i] = 1;
          queue.push(i);
        }
      }
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const z = Math.floor(i / (n * n));
    const y = Math.floor((i - z * n * n) / n);
    const x = i - z * n * n - y * n;
    for (const ni of neighborsOf(x, y, z)) {
      if (ni === -1) continue;
      if (cls[ni] === 1 && visited[ni] === 0) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  return { n, bounds: b, stepX, stepY, stepZ, cls, visited, idx, neighborsOf };
}

/**
 * Grid-based flood fill (instruction §8). A void cell that is 6-connected
 * (through other void cells) to any exterior cell OR to the grid boundary is
 * "exterior-connected"; everything else void is "closed". This is a coarse
 * Monte-Carlo-like grid approximation (resolution³ samples), not an exact
 * volume integral — documented in the UI caption, not hidden (AGENTS §6).
 * "外部連通voidがある"ことと「サポートを除去できる」ことは同一視しない — this function
 * reports geometry only, never a printability claim.
 */
export function analyzeVoids(hostId: HostFixtureId, units: GrowthUnit[], blendK: number, resolution = 26): VoidAnalysis {
  const grid = buildVoidGrid(hostId, units, blendK, resolution);
  const { n, cls, visited, idx, neighborsOf } = grid;
  const cellVolumeField = grid.stepX * grid.stepY * grid.stepZ;
  const total = n * n * n;

  let solidCells = 0;
  let exteriorConnectedVoidCells = 0;
  let closedVoidCells = 0;
  let hostInteriorCells = 0;
  const closedVisited = new Uint8Array(total);
  let closedVoidComponents = 0;
  for (let i = 0; i < total; i++) {
    if (cls[i] === 2) {
      solidCells++;
      hostInteriorCells++;
    } else if (cls[i] === 1) {
      hostInteriorCells++;
      if (visited[i] === 1) {
        exteriorConnectedVoidCells++;
      } else {
        closedVoidCells++;
      }
    }
  }
  // Component count for closed voids only (separate BFS pass, small extra cost, kept simple).
  const compQueue: number[] = [];
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = idx(x, y, z);
        if (cls[i] !== 1 || visited[i] === 1 || closedVisited[i] === 1) continue;
        closedVoidComponents++;
        closedVisited[i] = 1;
        compQueue.push(i);
        for (let qi2 = 0; qi2 < compQueue.length; qi2++) {
          const j = compQueue[qi2];
          const jz = Math.floor(j / (n * n));
          const jy = Math.floor((j - jz * n * n) / n);
          const jx = j - jz * n * n - jy * n;
          for (const nj of neighborsOf(jx, jy, jz)) {
            if (nj === -1) continue;
            if (cls[nj] === 1 && visited[nj] === 0 && closedVisited[nj] === 0) {
              closedVisited[nj] = 1;
              compQueue.push(nj);
            }
          }
        }
        compQueue.length = 0;
      }
    }
  }

  return { resolution: n, cellVolumeField, solidCells, exteriorConnectedVoidCells, closedVoidComponents, closedVoidCells, hostInteriorCells };
}

export interface VoidCellSamples {
  exteriorConnected: Vec3[];
  closed: Vec3[];
  /** True if either list was subsampled (stride > 1) to stay under the display cap — honest disclosure for the renderer's caption, not a hidden truncation. */
  subsampled: boolean;
}

const VOID_DISPLAY_CAP = 4000;

/** Same classification as analyzeVoids (via the shared buildVoidGrid), returning cell CENTERS for the renderer's void color-coding (§9) instead of aggregate counts. Deterministic stride-subsampling (not random) keeps both lists under VOID_DISPLAY_CAP each. */
export function sampleVoidCellCenters(hostId: HostFixtureId, units: GrowthUnit[], blendK: number, resolution: number): VoidCellSamples {
  const grid = buildVoidGrid(hostId, units, blendK, resolution);
  const { n, bounds, stepX, stepY, stepZ, cls, visited, idx } = grid;
  const exteriorIdx: number[] = [];
  const closedIdx: number[] = [];
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = idx(x, y, z);
        if (cls[i] !== 1) continue;
        (visited[i] === 1 ? exteriorIdx : closedIdx).push(i);
      }
    }
  }
  const strideOf = (count: number) => Math.max(1, Math.ceil(count / VOID_DISPLAY_CAP));
  const strideE = strideOf(exteriorIdx.length);
  const strideC = strideOf(closedIdx.length);
  const centerOf = (i: number): Vec3 => {
    const z = Math.floor(i / (n * n));
    const y = Math.floor((i - z * n * n) / n);
    const x = i - z * n * n - y * n;
    return {
      x: bounds.min.x + (x + 0.5) * stepX,
      y: bounds.min.y + (y + 0.5) * stepY,
      z: bounds.min.z + (z + 0.5) * stepZ,
    };
  };
  const exteriorConnected = exteriorIdx.filter((_, k) => k % strideE === 0).map(centerOf);
  const closed = closedIdx.filter((_, k) => k % strideC === 0).map(centerOf);
  return { exteriorConnected, closed, subsampled: strideE > 1 || strideC > 1 };
}

export function countUnreachableUnits(units: GrowthUnit[]): number {
  const byId = new Map(units.map((u) => [u.id, u]));
  let unreachable = 0;
  for (const u of units) {
    let cur: GrowthUnit | undefined = u;
    let hops = 0;
    while (cur && cur.parentId !== null && hops < units.length + 1) {
      cur = byId.get(cur.parentId);
      hops++;
    }
    if (!cur || cur.supportContact !== "build-plate") unreachable++;
  }
  return unreachable;
}

export interface DegreeStats {
  min: number;
  median: number;
  max: number;
}

export function degreeStats(units: GrowthUnit[], edges: { parentId: number; childId: number }[]): DegreeStats {
  const outDeg = new Map<number, number>();
  for (const u of units) outDeg.set(u.id, 0);
  for (const e of edges) outDeg.set(e.parentId, (outDeg.get(e.parentId) ?? 0) + 1);
  const values = [...outDeg.values()].sort((a, b) => a - b);
  if (values.length === 0) return { min: 0, median: 0, max: 0 };
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  return { min: values[0], median, max: values[values.length - 1] };
}

// --- §8 display panel: one aggregator combining everything above -----------

export interface GrowthMetrics {
  acceptedCount: number;
  rejectedTotal: number;
  rejected: Record<RejectionReason, number>;
  edgeCount: number;
  rootCount: number;
  unreachableCount: number;
  degree: DegreeStats;
  materialVolumeFieldUnits: number;
  hostVolumeFieldUnits: number;
  hostOccupancy: number;
  closedVoidComponents: number;
  closedVoidVolumeFieldUnits: number;
  exteriorConnectedVoidVolumeFieldUnits: number;
  maxLateralStepField: number;
  clippedUnitCount: number;
  maxClipFieldUnits: number;
  earlyTerminated: boolean;
  voidGridResolution: number;
  heightCoverage: number;
  topReached: boolean;
  primaryPathLength: number;
  autoBudget: AutoBudget;
  /** §6 "target %" — the author's requested surfaceCoverage at generation time (copied from params, not re-read live, so a metrics snapshot stays self-consistent even if the UI's control moves afterward). */
  targetSurfaceCoverage: number;
  /** §3.2's ratio, recomputed fresh from result.units against the host's reference sample set — never stored/duplicated from growNetwork's own internal loop, same "one source of numbers" rule this function documents at the top. */
  measuredSurfaceCoverage: number;
  /** target - measured. Negative means measured exceeded target (can happen: the tolerance band in growSurfaceColonization stops at target-0.02, so measured can land anywhere from target-0.02 up to whatever the accepted step overshot to). Never clamped — an honest signed gap, §3.3. */
  coverageGap: number;
  coverageSampleCount: number;
  coveredSampleCount: number;
  noMaterialSampleCount: number;
  unreachableSampleCount: number;
  coverageProbeDepthField: number;
  coverageStopReason: CoverageStopReason;
  /** S2.1 diagnostics — copied straight from GrowthResult, never recomputed here (see growNetwork's own header comment on "one source of numbers"). null for a migrated pre-S2.1 legacy result (never fabricated as 0) — the UI shows "未記録". */
  algorithmVersion: string;
  regionCount: number | null;
  reachedRegionCount: number | null;
  zeroGainAcceptedCount: number | null;
  /**
   * O2 audit-fix §2.2 — three DIFFERENT numbers, never collapsed into one row:
   * `rootCount` (graph roots), `actualPlateContactCount` (units whose own
   * material reaches the plate within one layer height, measured after all
   * growth stages), and `launchPointCount` (near-plate launch CANDIDATES).
   * Both nullable fields are copied straight from GrowthResult, never
   * recomputed here (the "one source of numbers" rule). null for a result
   * migrated in from before they were measured — the UI shows "未記録", never a
   * fabricated 0.
   */
  actualPlateContactCount: number | null;
  launchPointCount: number | null;
  assignedRegionCount: number | null;
  meanAssignedRouteCost: number | null;
  meanSingleSourceRouteCost: number | null;
  /** §5/§13's "unit用途別内訳": how many accepted units did each job. Derived here from result.units, never stored separately (one source of numbers). */
  roleCounts: Record<GrowthUnitRole, number>;
}

/**
 * The single function the UI's metric table and the export provenance both
 * call — one source of numbers, never two independently-drifting displays
 * (AGENTS §6 "正直な計算"). `blendK`/`voidResolution` are passed explicitly
 * (never defaulted silently inside) since they change what the grid-based
 * void/occupancy numbers mean.
 */
export function summarizeMetrics(result: GrowthResult, blendK: number, voidResolution = 26): GrowthMetrics {
  const voids = analyzeVoids(result.hostId, result.units, blendK, voidResolution);
  const degree = degreeStats(result.units, result.edges);
  const rejectedTotal = REJECTION_REASONS.reduce((sum, r) => sum + result.rejected[r], 0);
  let maxLateralStepField = 0;
  for (const u of result.units) maxLateralStepField = Math.max(maxLateralStepField, u.lateralStepField);
  const coverageSamples = getCoverageReferenceMesh(result.hostId);
  const coverageProbeDepthField = computeProbeDepthField(result.params.unitRadius);
  const coverage = computeSurfaceCoverage(coverageSamples, result.units, coverageProbeDepthField);
  const roleCounts: Record<GrowthUnitRole, number> = {
    root: 0,
    "primary-path": 0,
    base: 0,
    trunk: 0,
    "surface-approach": 0,
    "surface-spread": 0,
    unknown: 0,
  };
  for (const u of result.units) roleCounts[u.role ?? "unknown"]++;
  return {
    acceptedCount: result.units.length,
    rejectedTotal,
    rejected: result.rejected,
    edgeCount: result.edges.length,
    rootCount: result.rootCount,
    unreachableCount: countUnreachableUnits(result.units),
    degree,
    materialVolumeFieldUnits: voids.solidCells * voids.cellVolumeField,
    hostVolumeFieldUnits: voids.hostInteriorCells * voids.cellVolumeField,
    hostOccupancy: voids.hostInteriorCells > 0 ? voids.solidCells / voids.hostInteriorCells : 0,
    closedVoidComponents: voids.closedVoidComponents,
    closedVoidVolumeFieldUnits: voids.closedVoidCells * voids.cellVolumeField,
    exteriorConnectedVoidVolumeFieldUnits: voids.exteriorConnectedVoidCells * voids.cellVolumeField,
    maxLateralStepField,
    clippedUnitCount: result.clippedUnitCount,
    maxClipFieldUnits: result.maxClipFieldUnits,
    earlyTerminated: result.earlyTerminated,
    voidGridResolution: voids.resolution,
    heightCoverage: result.heightCoverage,
    topReached: result.topReached,
    primaryPathLength: result.primaryPathUnitIds.length,
    autoBudget: result.autoBudget,
    targetSurfaceCoverage: result.params.targetSurfaceCoverage,
    measuredSurfaceCoverage: coverage.measuredCoverage,
    coverageGap: result.params.targetSurfaceCoverage - coverage.measuredCoverage,
    coverageSampleCount: coverage.sampleCount,
    coveredSampleCount: coverage.coveredSampleCount,
    noMaterialSampleCount: coverage.noMaterialSampleCount,
    unreachableSampleCount: coverage.unreachableSampleCount,
    coverageProbeDepthField,
    coverageStopReason: result.coverageStopReason,
    algorithmVersion: result.algorithmVersion,
    regionCount: result.regionCount,
    reachedRegionCount: result.reachedRegionCount,
    zeroGainAcceptedCount: result.zeroGainAcceptedCount,
    actualPlateContactCount: result.actualPlateContactCount ?? null,
    launchPointCount: result.launchPointCount,
    assignedRegionCount: result.assignedRegionCount,
    meanAssignedRouteCost: result.meanAssignedRouteCost,
    meanSingleSourceRouteCost: result.meanSingleSourceRouteCost,
    roleCounts,
  };
}

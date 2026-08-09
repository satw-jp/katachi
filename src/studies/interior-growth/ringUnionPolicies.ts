// ---------------------------------------------------------------------------
// P24 material-composition POLICY COMPARISON — diagnosis only.
//
// WHY THIS FILE EXISTS
// `ring-constrained` grows a single-rooted graph (one parentless unit, every
// other unit reachable by `parentId`) yet the saved mesh comes out as several
// connected components. The audited P2.3 round measured, at the default
// fixture and resolution 64:
//   - current flat smooth union .... box 10 / sphere 3 / waisted 5 components
//   - `blendK -> 0` hard union ..... box 27 / sphere 12 / waisted 20
// and proved VOLUMETRICALLY (not by surface vertices) that the non-largest
// smooth components contain no hard material — they are blend-only lobes.
//
// So the current flat left-fold smooth-min over EVERY element does two things
// at once: it fattens the connections it needs, AND it creates independent
// material where the graph has no edge at all. This module implements four
// candidate compositions as DIAGNOSTIC fields and measures them side by side on
// the same `GrowthResult`. It ships nothing:
//
//  - No production function is modified. `buildCandidateMesh`,
//    `unitsPointsSdf`, `createUnitsFieldSampler`, the production `blendK`, the
//    save gate, the plate clip and coverage are all IMPORTED and used unchanged.
//  - Nothing here is imported by a production entry point (growth.test.ts's
//    P2.3-18 crawler covers the diagnosis modules; `ringUnionPolicies.test.ts`
//    adds the same crawl for this file).
//  - Every function returns MEASUREMENTS. Nothing here decides what ships.
//
// AGENTS.md §1「正直な計算」/「分からないものを分かった顔で表示しない」: every sampled
// quantity says it is sampled and carries its own error bound; every verdict
// word has an `undetermined` outcome that is never rounded into one of the two
// answers; no tolerance here is tuned to a result.
// ---------------------------------------------------------------------------

import {
  buildMeshFromField,
  orientMeshForSavedStl,
  rescaleMeshResult,
  encodeBinaryStl,
  type Bounds,
  type MeshVertex,
  type Triangle,
} from "../cloud-sculpt/meshExport.ts";
import { smoothMin } from "../cloud-sculpt/field.ts";
import { buildPlateOffset, vNorm, type GrowthUnit, type HostFixtureId, type Vec3 } from "./field.ts";
import {
  createUnitsFieldSampler,
  elementSdf,
  unitFieldElements,
  unitsPointsSdf,
  type FieldElement,
  type GrowthResult,
} from "./growth.ts";
import { SpatialHash } from "./colonization.ts";
import {
  computeProbeDepthField,
  computeReachableUnitIds,
  computeSurfaceCoverage,
  getCoverageReferenceMesh,
  type SurfaceSample,
} from "./coverage.ts";
import {
  aboveBuildPlateSdf,
  buildCandidateMesh,
  computeUnitBounds,
  countPlateContactVertices,
  evaluateSaveGate,
  meshLowestBuildAxisMm,
  plateBoundaryEpsilonMm,
  type CandidateMeshResult,
  type SavedPlateReference,
  type SaveGateResult,
} from "./meshExport.ts";
import {
  componentSignatures,
  componentTriangles,
  decodeBinaryStlTriangles,
  diagnosisBounds,
  matchComponentSets,
  measureComponentHardOverlap,
  measureComponents,
  type ComponentHardOverlap,
  type ComponentReport,
  type ComponentSetMatching,
  type ComponentSignature,
} from "./ringFusionDiagnosis.ts";

// ===========================================================================
// 1. The four policies
// ===========================================================================

export type PolicyId =
  /** The existing composition: flat left-fold smooth-min over every element of every unit, production `blendK`. CONTROL. */
  | "P0-flat-smooth"
  /** Hard min over every element. Must reproduce the audited 27 / 12 / 20 control. */
  | "P1-hard-union"
  /** Reduced UNIFORM flat blend — the same left-fold, smaller k. */
  | "P2-reduced-flat"
  /** Graph-local smooth union: hard base + smooth fusion confined to parent-child contacts. */
  | "P3-graph-local";

export const POLICY_IDS: readonly PolicyId[] = ["P0-flat-smooth", "P1-hard-union", "P2-reduced-flat", "P3-graph-local"] as const;

// ===========================================================================
// 2. The building blocks every policy shares
// ===========================================================================

/**
 * ONE unit's own material: the HARD min over that unit's own element chain
 * (`unitFieldElements` — spheres for a coin, a closed tapered-capsule chain for
 * a ring; the same decomposition `coverage.ts`'s `isInsideUnitMaterial` uses).
 *
 * `Math.min` is exact float selection, so this value cannot depend on the order
 * the elements come back in — which is P3's contract clause 1 and the reason it
 * is a hard min rather than any blend.
 */
export function unitHardSdf(unit: GrowthUnit, x: number, y: number, z: number): number {
  let d = Infinity;
  for (const e of unitFieldElements(unit)) {
    const de = elementSdf(e, x, y, z);
    if (de < d) d = de;
  }
  return d;
}

/**
 * The BASE material: hard min over every unit's own hard material — i.e. the
 * true hard union of every element. This is both P1's whole field and P3's
 * clause-2 base.
 *
 * WHY THIS IS NOT `hardUnionSdf` FROM `ringFusionDiagnosis.ts`: that function is
 * `unitsPointsSdf(units, 1e-9, …)`, i.e. a smooth-min with a tiny-but-positive
 * k, so it is `min` only to within k/4 = 2.5e-10 and it is a left FOLD (order
 * dependent in principle). P1 is specified as a hard min, and P3's contract
 * requires order independence, so both are built on this exact `Math.min` form
 * instead. `ringUnionPolicies.test.ts` measures the two against each other
 * rather than assuming they agree.
 *
 * Returns `Infinity` for an empty unit list — a caller meshing zero units has a
 * different problem, and a fabricated large finite number would hide it.
 */
export function baseHardSdf(units: GrowthUnit[], x: number, y: number, z: number): number {
  let d = Infinity;
  for (const u of units) {
    const du = unitHardSdf(u, x, y, z);
    if (du < d) d = du;
  }
  return d;
}

/**
 * Indexed form of `baseHardSdf`, built on the SAME spatial-index idiom
 * `createUnitsFieldSampler` uses (elements keyed by bounding-sphere centre,
 * query radius widened by the largest bound) so the two forms' far-field
 * behaviour is comparable rather than differently approximated.
 *
 * Far-field approximation, stated because it is real: a query with no element
 * inside `queryRadius` returns `cutoff`, a positive number, instead of the true
 * (larger) distance. The mesher and every measurement here read only the sign
 * near zero, where this form is exact — but `compareFieldForms` below measures
 * the disagreement rather than trusting this paragraph.
 */
export function createBaseHardSampler(units: GrowthUnit[], blendK: number): (x: number, y: number, z: number) => number {
  const elements: FieldElement[] = [];
  let maxBound = 0;
  for (const u of units) {
    for (const e of unitFieldElements(u)) {
      elements.push(e);
      if (e.bound > maxBound) maxBound = e.bound;
    }
  }
  if (elements.length === 0) return () => Infinity;
  // Same cutoff expression as createUnitsFieldSampler, kept identical on purpose
  // so a P0-vs-P3 difference can never be an artefact of two different cutoffs.
  const cutoff = maxBound + Math.max(blendK * 6, maxBound * 2);
  const queryRadius = cutoff + maxBound;
  const hash = new SpatialHash<FieldElement>(Math.max(1e-6, queryRadius));
  for (const e of elements) hash.insert({ x: e.cx, y: e.cy, z: e.cz }, e);
  return (x: number, y: number, z: number): number => {
    const nearby = hash.queryRadius({ x, y, z }, queryRadius);
    if (nearby.length === 0) return cutoff;
    let d = Infinity;
    for (const e of nearby) {
      const de = elementSdf(e, x, y, z);
      if (de < d) d = de;
    }
    // `Math.min` over an arbitrary-order bucket list is order-independent, so
    // the indexed base cannot depend on the hash's iteration order.
    return Math.min(d, cutoff);
  };
}

// ===========================================================================
// 3. P2 — the reduced uniform flat blend, and where its k comes from
// ===========================================================================

/**
 * P2's blend is a REDUCED version of the production one, and the reduction
 * factor is the only free number in the policy — so it is derived from the
 * candidate's own geometry against a stated criterion instead of picked.
 *
 * Criterion: a flat smooth-min with parameter k grows the surface outward by at
 * most k/4 (the polynomial smin's maximum correction term, at `a === b`). P2's k
 * is the largest value whose maximum outward growth is at most
 * `addedThicknessFractionCap` of the THINNEST tube radius in the candidate:
 *
 *     k = 4 × cap × minNodeRadius
 *
 * so `cap` reads directly as "the blend may not fatten the thinnest tube by
 * more than this fraction of its radius". Nothing else about P2 is tunable.
 */
export interface ReducedBlendDerivation {
  /** Smallest node radius over every unit's points, field units — the thinnest tube the blend could fatten. */
  minNodeRadiusFieldUnits: number;
  maxNodeRadiusFieldUnits: number;
  /** The stated criterion: max outward growth (k/4) as a fraction of `minNodeRadiusFieldUnits`. */
  addedThicknessFractionCap: number;
  /** The derived blend. */
  blendK: number;
  /** Maximum outward growth this k permits, field units (`blendK / 4`). */
  maxAddedThicknessFieldUnits: number;
  /** Production blend for the same candidate (`params.unitRadius * 0.3`), for scale. */
  productionBlendK: number;
  ratioToProductionBlendK: number;
}

export function deriveReducedFlatBlend(
  units: GrowthUnit[],
  productionBlendK: number,
  addedThicknessFractionCap: number,
): ReducedBlendDerivation {
  let minR = Infinity;
  let maxR = -Infinity;
  for (const u of units) {
    for (const p of u.points) {
      if (p.r < minR) minR = p.r;
      if (p.r > maxR) maxR = p.r;
    }
  }
  if (!Number.isFinite(minR)) {
    throw new Error("deriveReducedFlatBlend: no unit points — there is no tube radius to derive a blend from");
  }
  const blendK = 4 * addedThicknessFractionCap * minR;
  return {
    minNodeRadiusFieldUnits: minR,
    maxNodeRadiusFieldUnits: maxR,
    addedThicknessFractionCap,
    blendK,
    maxAddedThicknessFieldUnits: blendK / 4,
    productionBlendK,
    ratioToProductionBlendK: productionBlendK > 0 ? blendK / productionBlendK : Infinity,
  };
}

/**
 * P2's default cap: the blend may fatten the thinnest tube by at most 1/16 of
 * its radius (6.25%). Chosen ONCE, before any P2 measurement was taken, so it
 * is not a number tuned to a result — and P2 is reported as the one-parameter
 * family it is: `cap -> 0` degenerates to P1, `cap -> 0.27` (at this fixture)
 * reaches the production blend, so a second cap is always measured alongside
 * to show which direction the family moves in.
 */
export const P2_DEFAULT_ADDED_THICKNESS_CAP = 1 / 16;

// ===========================================================================
// 4. P3 — graph-local smooth union
// ===========================================================================

/**
 * THE MATERIAL CONTRACT P3 SATISFIES (the instruction's clauses, in order):
 *  1. one unit's material `dUnit` is the HARD min of that unit's own element
 *     chain (`unitHardSdf`);
 *  2. the base material is the HARD min of every `dUnit` (`baseHardSdf`);
 *  3. smooth fusion exists ONLY on parent-child graph edges — one joint per
 *     edge, derived from `parentId` alone;
 *  4. each edge's fusion is spatially CONFINED to a neighbourhood of that
 *     edge's actual closest contact, with radii derived from the contacting
 *     capsule pair's own radii, the measured gap and `kJoint`;
 *  5. the final field is the HARD min of the base and every local joint, so the
 *     edge enumeration order cannot change the shape.
 *
 * HOW CLAUSE 4 IS IMPLEMENTED, AND WHY NOT BY INTERSECTION
 * The instruction sketches `dLocalJoint = intersection(dPair, contactNeighborhood)`,
 * i.e. `max(smoothMin(dP, dC, k), ballSdf)`. That satisfies "no material
 * outside the ball", but it does NOT satisfy the stronger requirement that
 * `dFinal === dBase` EXACTLY outside the neighbourhood: far from all material
 * `min(dBase, max(dPair, ballSdf))` returns the ball's distance, not the base's,
 * because the ball SDF is smaller there. The field would be wrong (not just
 * differently valued) in the far field, and any measurement that reads a value
 * rather than a sign would read the ball instead of the material.
 *
 * So the confinement is applied to the blend's CORRECTION TERM instead, which is
 * exact and strictly simpler:
 *
 *     hardPair = min(dParent, dChild)                       // no blend
 *     delta    = hardPair - smoothMin(dParent, dChild, k)   // >= 0 always
 *     dJoint   = hardPair - w · delta                       // w in [0, 1]
 *
 * with `w` exactly 1 inside the inner radius and exactly 0 outside the outer
 * radius. Then:
 *  - outside the neighbourhood `w = 0`, so `dJoint = hardPair >= dBase` and
 *    `min(dBase, dJoint) === dBase` EXACTLY — bit-for-bit, not approximately;
 *  - inside the core `w = 1`, so the joint is exactly the pairwise smooth-min
 *    the contract asks for;
 *  - `delta >= 0` (the polynomial smooth-min is never above `min`), so a joint
 *    can only ADD material, never carve any away. `dBase - kJoint/4 <= dFinal <= dBase`
 *    holds everywhere, which is what bounds P3's added volume a priori.
 *
 * `min` and `max` on floats are exact selections, so every combination step
 * above is order-independent by construction rather than by convention.
 */

/** Stable identity of one parent-child edge. Derived from `parentId` only, and formatted from the two unit ids so it is stable across runs and independent of array order. */
export function edgeIdOf(parentId: number, childId: number): string {
  return `${parentId}->${childId}`;
}

/** Stable identity of one element inside a unit: unit id + the index `unitFieldElements` emitted it at (for a ring, the segment index of the closed node chain). */
export function elementIdOf(unitId: number, elementIndex: number): string {
  return `${unitId}#${elementIndex}`;
}

/**
 * The closest contact between two units' real material, located by DETERMINISTIC
 * SAMPLING with local refinement. Every field says what it is; nothing here is
 * an exact capsule-capsule distance and nothing claims to be.
 */
export interface EdgeContact {
  edgeId: string;
  parentId: number;
  childId: number;
  /** Stable element ids of the closest pair (`unitId#elementIndex`). */
  parentElementId: string;
  childElementId: string;
  parentElementIndex: number;
  childElementIndex: number;
  /** Parameter along each element's segment, 0..1 (0 for a sphere element). */
  tParent: number;
  tChild: number;
  /** Axis points at those parameters and the interpolated radii there. */
  parentAxisPoint: Vec3;
  childAxisPoint: Vec3;
  parentRadiusFieldUnits: number;
  childRadiusFieldUnits: number;
  /** `|parentAxisPoint - childAxisPoint| - parentRadius - childRadius`. Negative = the two units' material already overlaps here. SAMPLED: the true minimum is <= this. */
  sampledMinSignedGapFieldUnits: number;
  /** Half the finest sampling step reached on the refined element pair — the amount by which the true minimum can sit below the sampled one. */
  samplingErrorBoundFieldUnits: number;
  /** Midway between the two SURFACES along the axis-point line: the neighbourhood centre. */
  contactCentre: Vec3;
  /** `max(parentRadius, childRadius)` at the contact — the local tube radius the neighbourhood is sized from. */
  contactTubeRadiusFieldUnits: number;
  /** How many (element pair × parameter pair) samples were evaluated. Reported so the cost and the density are both visible. */
  sampleCount: number;
}

function elementSampleAt(e: FieldElement, t: number): { x: number; y: number; z: number; r: number } {
  const a = e.a;
  if (e.b === null) return { x: a.x, y: a.y, z: a.z, r: a.r };
  const b = e.b;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, r: a.r + (b.r - a.r) * t };
}

function elementSegmentLength(e: FieldElement): number {
  if (e.b === null) return 0;
  return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z);
}

/**
 * Locate one edge's closest contact.
 *
 * Method, deliberately simple and deterministic (no RNG, no early exit that
 * could depend on array order):
 *  1. coarse pass — every parent element × every child element, `coarseSamples`
 *     evenly-spaced parameters on each, keeping the minimum of
 *     `|pa - qb| - ra - rb`;
 *  2. refinement — the best `refinedPairCount` element pairs are re-sampled on a
 *     window around their own best parameters, shrunk by `refineShrink` each of
 *     `refineRounds` rounds.
 * Ties are broken on (parentElementIndex, childElementIndex, tParent, tChild) in
 * ascending order, so two samples with an identical gap always pick the same one.
 *
 * `samplingErrorBoundFieldUnits` is half the finest parameter step actually
 * reached, converted to length — the honest bound on how far below the reported
 * gap the true minimum can be. NOT an exact tapered-capsule distance.
 */
export function measureEdgeContact(
  parent: GrowthUnit,
  child: GrowthUnit,
  options: {
    coarseSamples: number;
    refinedPairCount: number;
    refineRounds: number;
    refineSamples: number;
    refineShrink: number;
  },
): EdgeContact {
  const pe = unitFieldElements(parent);
  const ce = unitFieldElements(child);
  const nCoarse = Math.max(2, Math.round(options.coarseSamples));
  let sampleCount = 0;

  interface Best {
    i: number;
    j: number;
    tp: number;
    tc: number;
    gap: number;
    stepP: number;
    stepC: number;
  }
  const better = (a: Best, b: Best): boolean =>
    a.gap < b.gap ||
    (a.gap === b.gap && (a.i < b.i || (a.i === b.i && (a.j < b.j || (a.j === b.j && (a.tp < b.tp || (a.tp === b.tp && a.tc < b.tc)))))));

  const perPair: Best[] = [];
  for (let i = 0; i < pe.length; i++) {
    const lenP = elementSegmentLength(pe[i]);
    for (let j = 0; j < ce.length; j++) {
      const lenC = elementSegmentLength(ce[j]);
      let best: Best | null = null;
      for (let a = 0; a < nCoarse; a++) {
        const tp = nCoarse === 1 ? 0 : a / (nCoarse - 1);
        const pa = elementSampleAt(pe[i], tp);
        for (let b = 0; b < nCoarse; b++) {
          const tc = nCoarse === 1 ? 0 : b / (nCoarse - 1);
          const qb = elementSampleAt(ce[j], tc);
          const gap = Math.hypot(pa.x - qb.x, pa.y - qb.y, pa.z - qb.z) - pa.r - qb.r;
          sampleCount++;
          const cand: Best = { i, j, tp, tc, gap, stepP: lenP / (nCoarse - 1), stepC: lenC / (nCoarse - 1) };
          if (best === null || better(cand, best)) best = cand;
        }
      }
      if (best) perPair.push(best);
    }
  }
  if (perPair.length === 0) {
    throw new Error(`measureEdgeContact: unit ${parent.id} or ${child.id} has no field elements`);
  }
  perPair.sort((a, b) => (a.gap - b.gap) || (a.i - b.i) || (a.j - b.j));

  const refinedCount = Math.max(1, Math.min(Math.round(options.refinedPairCount), perPair.length));
  const shrink = Math.max(1.0000001, options.refineShrink);
  const nRefine = Math.max(2, Math.round(options.refineSamples));
  let overall: Best | null = null;
  for (let k = 0; k < refinedCount; k++) {
    let cur = perPair[k];
    let halfP = 1 / (nCoarse - 1);
    let halfC = 1 / (nCoarse - 1);
    for (let round = 0; round < Math.max(0, Math.round(options.refineRounds)); round++) {
      halfP /= shrink;
      halfC /= shrink;
      const loP = Math.max(0, cur.tp - halfP);
      const hiP = Math.min(1, cur.tp + halfP);
      const loC = Math.max(0, cur.tc - halfC);
      const hiC = Math.min(1, cur.tc + halfC);
      const lenP = elementSegmentLength(pe[cur.i]);
      const lenC = elementSegmentLength(ce[cur.j]);
      let best = cur;
      for (let a = 0; a < nRefine; a++) {
        const tp = loP + ((hiP - loP) * a) / (nRefine - 1);
        const pa = elementSampleAt(pe[cur.i], tp);
        for (let b = 0; b < nRefine; b++) {
          const tc = loC + ((hiC - loC) * b) / (nRefine - 1);
          const qb = elementSampleAt(ce[cur.j], tc);
          const gap = Math.hypot(pa.x - qb.x, pa.y - qb.y, pa.z - qb.z) - pa.r - qb.r;
          sampleCount++;
          const cand: Best = {
            i: cur.i,
            j: cur.j,
            tp,
            tc,
            gap,
            stepP: (lenP * (hiP - loP)) / (nRefine - 1),
            stepC: (lenC * (hiC - loC)) / (nRefine - 1),
          };
          if (better(cand, best)) best = cand;
        }
      }
      cur = best;
    }
    if (overall === null || better(cur, overall)) overall = cur;
  }
  const win = overall!;
  const pa = elementSampleAt(pe[win.i], win.tp);
  const qb = elementSampleAt(ce[win.j], win.tc);
  const L = Math.hypot(pa.x - qb.x, pa.y - qb.y, pa.z - qb.z);
  // Midway between the two SURFACES along the axis-point line. With L > 0 this
  // is `pa + u · (ra + (L - ra - rb)/2)`; degenerate coincident axis points fall
  // back to the shared point itself rather than dividing by zero.
  const along = L > 1e-12 ? pa.r + (L - pa.r - qb.r) / 2 : 0;
  const ux = L > 1e-12 ? (qb.x - pa.x) / L : 0;
  const uy = L > 1e-12 ? (qb.y - pa.y) / L : 0;
  const uz = L > 1e-12 ? (qb.z - pa.z) / L : 0;
  return {
    edgeId: edgeIdOf(parent.id, child.id),
    parentId: parent.id,
    childId: child.id,
    parentElementId: elementIdOf(parent.id, win.i),
    childElementId: elementIdOf(child.id, win.j),
    parentElementIndex: win.i,
    childElementIndex: win.j,
    tParent: win.tp,
    tChild: win.tc,
    parentAxisPoint: { x: pa.x, y: pa.y, z: pa.z },
    childAxisPoint: { x: qb.x, y: qb.y, z: qb.z },
    parentRadiusFieldUnits: pa.r,
    childRadiusFieldUnits: qb.r,
    sampledMinSignedGapFieldUnits: win.gap,
    samplingErrorBoundFieldUnits: Math.max(win.stepP, win.stepC) / 2,
    contactCentre: { x: pa.x + ux * along, y: pa.y + uy * along, z: pa.z + uz * along },
    contactTubeRadiusFieldUnits: Math.max(pa.r, qb.r),
    sampleCount,
  };
}

/** Contact-locator settings. Fixed defaults so a policy measurement is reproducible without the caller choosing numbers. */
export const DEFAULT_CONTACT_OPTIONS = {
  coarseSamples: 13,
  refinedPairCount: 3,
  refineRounds: 4,
  refineSamples: 9,
  refineShrink: 3,
} as const;

/** One graph-local joint: an edge, its contact and the neighbourhood radii DERIVED from that contact. */
export interface GraphLocalJoint {
  edgeId: string;
  parentId: number;
  childId: number;
  contact: EdgeContact;
  kJoint: number;
  /**
   * Inner radius — the blend is at full strength inside it:
   *   `rInner = contactTubeRadius + kJoint + max(0, sampledGap)`
   * Each term is a measured quantity, not a constant: the tube radius is the
   * larger of the two contacting capsule radii AT the contact, `kJoint` is the
   * blend whose influence has to fit inside (the smooth-min differs from `min`
   * only while the two distances are within `kJoint` of each other), and the gap
   * term widens the core by however far apart the two surfaces actually are so a
   * separated pair's bridge is not cut off by its own confinement.
   */
  rInnerFieldUnits: number;
  /** Outer radius — the blend is exactly 0 at and beyond it. `rOuter = rInner + kJoint`: one blend-width of falloff shell, so the added field's extra gradient is at most `(kJoint/4)/kJoint = 0.25`. */
  rOuterFieldUnits: number;
}

/**
 * The confinement weight. Exactly 1 at/below `rInner`, exactly 0 at/above
 * `rOuter`, a C1 cubic in between (`1 - t²(3-2t)`, whose derivative vanishes at
 * both ends so the field has no kink at either radius).
 *
 * The two exact endpoints are the point: `w === 0` outside is what makes
 * `dFinal === dBase` bit-for-bit there, and `w === 1` inside is what makes the
 * joint exactly the contract's pairwise smooth-min.
 */
export function jointConfinementWeight(distance: number, rInner: number, rOuter: number): number {
  if (distance <= rInner) return 1;
  if (distance >= rOuter) return 0;
  const t = (distance - rInner) / (rOuter - rInner);
  return 1 - t * t * (3 - 2 * t);
}

/** One joint's field contribution, given the two units' own hard fields at the query point. Returns `min(dParent, dChild)` unchanged wherever the weight is 0. */
export function jointSdf(joint: GraphLocalJoint, x: number, y: number, z: number, dParent: number, dChild: number): number {
  const c = joint.contact.contactCentre;
  const dist = Math.hypot(x - c.x, y - c.y, z - c.z);
  const w = jointConfinementWeight(dist, joint.rInnerFieldUnits, joint.rOuterFieldUnits);
  const hardPair = Math.min(dParent, dChild);
  if (w === 0) return hardPair;
  const blended = smoothMin(dParent, dChild, joint.kJoint);
  // `blended <= hardPair` always (the polynomial smooth-min is never above
  // `min`), so `delta >= 0` and a joint can only ADD material.
  return hardPair - w * (hardPair - blended);
}

export interface GraphLocalJointSet {
  joints: GraphLocalJoint[];
  kJoint: number;
  /** Parent-child edges found by walking `parentId` (the graph, not `result.edges`). */
  edgeCount: number;
  /** Edges whose `parentId` names a unit that is not in the list — skipped, and COUNTED rather than ignored. */
  danglingParentEdgeCount: number;
  /** Largest `rOuter` over all joints — the spatial index's query radius. */
  maxOuterRadiusFieldUnits: number;
  contactOptions: typeof DEFAULT_CONTACT_OPTIONS;
}

/**
 * Build one joint per parent-child edge. Edges come from `parentId` alone (the
 * instruction's "the parent-child graph is available from `result.units`
 * alone"), and the list is sorted by (parentId, childId) so the joint array is
 * in canonical id order regardless of the order `units` arrived in. That order
 * is a REPORTING convenience only — the field combines joints with a hard min,
 * so nothing about the shape depends on it (proved by the reverse/shuffle tests).
 */
export function buildGraphLocalJoints(
  units: GrowthUnit[],
  kJoint: number,
  contactOptions: typeof DEFAULT_CONTACT_OPTIONS = DEFAULT_CONTACT_OPTIONS,
): GraphLocalJointSet {
  const byId = new Map<number, GrowthUnit>();
  for (const u of units) byId.set(u.id, u);
  const pairs: Array<{ parent: GrowthUnit; child: GrowthUnit }> = [];
  let dangling = 0;
  for (const child of units) {
    if (child.parentId === null) continue;
    const parent = byId.get(child.parentId);
    if (!parent) {
      dangling++;
      continue;
    }
    pairs.push({ parent, child });
  }
  pairs.sort((a, b) => a.parent.id - b.parent.id || a.child.id - b.child.id);
  const joints: GraphLocalJoint[] = [];
  let maxOuter = 0;
  for (const { parent, child } of pairs) {
    const contact = measureEdgeContact(parent, child, contactOptions);
    const rInner = contact.contactTubeRadiusFieldUnits + kJoint + Math.max(0, contact.sampledMinSignedGapFieldUnits);
    const rOuter = rInner + kJoint;
    if (rOuter > maxOuter) maxOuter = rOuter;
    joints.push({
      edgeId: contact.edgeId,
      parentId: parent.id,
      childId: child.id,
      contact,
      kJoint,
      rInnerFieldUnits: rInner,
      rOuterFieldUnits: rOuter,
    });
  }
  return {
    joints,
    kJoint,
    edgeCount: pairs.length,
    danglingParentEdgeCount: dangling,
    maxOuterRadiusFieldUnits: maxOuter,
    contactOptions,
  };
}

/**
 * P3's EXACT REFERENCE field: every unit and every joint evaluated at every
 * query, slowly and purely. No spatial index, no cutoff, no early exit — this is
 * the definition the indexed form below is measured against.
 */
export function createGraphLocalFieldExact(
  units: GrowthUnit[],
  jointSet: GraphLocalJointSet,
): (x: number, y: number, z: number) => number {
  const byId = new Map<number, GrowthUnit>();
  for (const u of units) byId.set(u.id, u);
  return (x: number, y: number, z: number): number => {
    const perUnit = new Map<number, number>();
    let base = Infinity;
    for (const u of units) {
      const du = unitHardSdf(u, x, y, z);
      perUnit.set(u.id, du);
      if (du < base) base = du;
    }
    let d = base;
    for (const j of jointSet.joints) {
      const dp = perUnit.get(j.parentId);
      const dc = perUnit.get(j.childId);
      if (dp === undefined || dc === undefined) continue;
      const dj = jointSdf(j, x, y, z, dp, dc);
      if (dj < d) d = dj;
    }
    return d;
  };
}

/**
 * P3's INDEXED FAST field: only the elements and only the joints that can matter
 * at the query point are evaluated.
 *
 * What "can matter" means, per term:
 *  - base: the same element index and the same `cutoff` rule
 *    `createUnitsFieldSampler` uses (see `createBaseHardSampler`);
 *  - joints: a joint whose `rOuter` does not reach the query point has weight
 *    exactly 0 and therefore contributes `min(dParent, dChild) >= dBase`, which
 *    the hard min discards. So skipping it is EXACT, not an approximation — the
 *    index is queried at `maxOuterRadius` and no joint outside that can change
 *    the value.
 *  - a joint that IS in range needs its two units' own hard fields, computed
 *    from those units' own elements only (not from the base's nearby-element
 *    set, which is a different set).
 *
 * Order independence: both combining steps are `Math.min`, so the hash's bucket
 * iteration order cannot reach the result.
 */
export function createGraphLocalFieldIndexed(
  units: GrowthUnit[],
  jointSet: GraphLocalJointSet,
  farFieldBlendK: number,
): (x: number, y: number, z: number) => number {
  const baseAt = createBaseHardSampler(units, farFieldBlendK);
  const byId = new Map<number, GrowthUnit>();
  for (const u of units) byId.set(u.id, u);
  const radius = Math.max(1e-6, jointSet.maxOuterRadiusFieldUnits);
  const hash = new SpatialHash<GraphLocalJoint>(radius);
  for (const j of jointSet.joints) hash.insert(j.contact.contactCentre, j);
  const hasJoints = jointSet.joints.length > 0;
  return (x: number, y: number, z: number): number => {
    let d = baseAt(x, y, z);
    if (!hasJoints) return d;
    const nearby = hash.queryRadius({ x, y, z }, radius);
    if (nearby.length === 0) return d;
    for (const j of nearby) {
      const parent = byId.get(j.parentId);
      const child = byId.get(j.childId);
      if (!parent || !child) continue;
      const dj = jointSdf(j, x, y, z, unitHardSdf(parent, x, y, z), unitHardSdf(child, x, y, z));
      if (dj < d) d = dj;
    }
    return d;
  };
}

// ===========================================================================
// 5. Policy assembly
// ===========================================================================

export interface PolicyInstance {
  id: PolicyId;
  label: string;
  /** The blend parameter this policy's smooth term uses (0 for P1). */
  blendKUsed: number;
  /** The PRODUCTION blend, kept for every policy because the sampling box is derived from it and must be identical across policies. */
  boundsBlendK: number;
  /** Exact reference field (material only, before the plate clip). */
  exact: (x: number, y: number, z: number) => number;
  /** Indexed fast field (material only, before the plate clip). */
  indexed: (x: number, y: number, z: number) => number;
  /** P3 only. */
  jointSet: GraphLocalJointSet | null;
  /** P2 only. */
  reducedBlend: ReducedBlendDerivation | null;
  /** One-line derivation of every number this policy chose, for the report. */
  derivation: string;
}

export interface BuildPolicyOptions {
  /** `params.unitRadius * 0.3` — the production blend. Read from the candidate by the caller, never hard-coded here. */
  productionBlendK: number;
  /** P2's stated criterion (see `deriveReducedFlatBlend`). */
  p2AddedThicknessCap?: number;
  /** P3's joint blend. Defaults to the production blend: the SAME blend strength, restricted to graph edges and confined in space, so a P3-vs-P0 difference is attributable to the restriction alone and not to a different k. */
  p3KJoint?: number;
  contactOptions?: typeof DEFAULT_CONTACT_OPTIONS;
}

export function buildPolicy(units: GrowthUnit[], id: PolicyId, options: BuildPolicyOptions): PolicyInstance {
  const k = options.productionBlendK;
  switch (id) {
    case "P0-flat-smooth":
      return {
        id,
        label: "P0 current flat smooth union",
        blendKUsed: k,
        boundsBlendK: k,
        exact: (x, y, z) => unitsPointsSdf(units, k, x, y, z),
        indexed: createUnitsFieldSampler(units, k),
        jointSet: null,
        reducedBlend: null,
        derivation: `flat left-fold smoothMin over all elements, k = production blendK = ${k}`,
      };
    case "P1-hard-union":
      return {
        id,
        label: "P1 hard union",
        blendKUsed: 0,
        boundsBlendK: k,
        exact: (x, y, z) => baseHardSdf(units, x, y, z),
        indexed: createBaseHardSampler(units, k),
        jointSet: null,
        reducedBlend: null,
        derivation: "hard Math.min over all elements of all units; no blend anywhere",
      };
    case "P2-reduced-flat": {
      const derived = deriveReducedFlatBlend(units, k, options.p2AddedThicknessCap ?? P2_DEFAULT_ADDED_THICKNESS_CAP);
      return {
        id,
        label: "P2 reduced uniform flat blend",
        blendKUsed: derived.blendK,
        boundsBlendK: k,
        exact: (x, y, z) => unitsPointsSdf(units, derived.blendK, x, y, z),
        indexed: createUnitsFieldSampler(units, derived.blendK),
        jointSet: null,
        reducedBlend: derived,
        derivation:
          `flat left-fold smoothMin over all elements, k = 4 × cap × minNodeRadius = ` +
          `4 × ${derived.addedThicknessFractionCap} × ${derived.minNodeRadiusFieldUnits.toFixed(5)} = ${derived.blendK.toFixed(5)} ` +
          `(${derived.ratioToProductionBlendK.toFixed(3)}× production)`,
      };
    }
    case "P3-graph-local": {
      const kJoint = options.p3KJoint ?? k;
      const jointSet = buildGraphLocalJoints(units, kJoint, options.contactOptions ?? DEFAULT_CONTACT_OPTIONS);
      return {
        id,
        label: "P3 graph-local smooth union",
        blendKUsed: kJoint,
        boundsBlendK: k,
        exact: createGraphLocalFieldExact(units, jointSet),
        indexed: createGraphLocalFieldIndexed(units, jointSet, k),
        jointSet,
        reducedBlend: null,
        derivation:
          `hard base + ${jointSet.joints.length} confined parent-child joints, kJoint = ${kJoint} (= production blendK); ` +
          `per joint rInner = tubeR@contact + kJoint + max(0, gap), rOuter = rInner + kJoint`,
      };
    }
  }
}

// ===========================================================================
// 6. Meshing a policy through the production composition
// ===========================================================================

/**
 * The plate reference for a candidate, derived the way `buildCandidateMesh`
 * derives it. Re-derived here (rather than imported) only because
 * `cardinalBuildAxis` is private to `meshExport.ts`; `ringUnionPolicies.test.ts`
 * asserts this equals the `plateReference` a real `buildCandidateMesh` attaches,
 * so the two can never silently disagree.
 */
export function policyPlateReference(result: GrowthResult): SavedPlateReference {
  const a = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, a);
  const ax = Math.abs(a.x);
  const ay = Math.abs(a.y);
  const az = Math.abs(a.z);
  const axis = ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z";
  const sign: 1 | -1 = a[axis] < 0 ? -1 : 1;
  return { axis, sign, plateOffsetFieldUnits: plateOffset };
}

/**
 * The saved field for a policy: `max(material, aboveBuildPlateSdf)` — the SAME
 * hard intersection `buildCandidateMesh` uses, with only the material term
 * swapped. The plate clip itself is untouched and still a hard `Math.max`.
 */
export function policySavedField(
  result: GrowthResult,
  material: (x: number, y: number, z: number) => number,
): (x: number, y: number, z: number) => number {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  return (x: number, y: number, z: number): number => Math.max(material(x, y, z), aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset));
}

/**
 * Mesh a policy's field at the production bounds/resolution/canonical scale.
 * `postClip` and `orient` are separate flags so the four stages the table needs
 * differ from each other by exactly one step:
 *  - pre-clip:  material alone
 *  - post-clip: `max(material, plate)` — what `buildCandidateMesh` meshes
 *  - saved:     post-clip + `orientMeshForSavedStl` — what is written to the STL
 *
 * The sampling box comes from `diagnosisBounds(result, boundsBlendK)` with the
 * PRODUCTION blend for every policy, so no policy is measured in a different box.
 */
export function buildPolicyMesh(
  result: GrowthResult,
  material: (x: number, y: number, z: number) => number,
  resolution: number,
  boundsBlendK: number,
  opts: { postClip: boolean; orient: boolean },
): CandidateMeshResult {
  const bounds: Bounds = diagnosisBounds(result, boundsBlendK);
  const field = opts.postClip ? policySavedField(result, material) : material;
  const raw = buildMeshFromField(bounds, field, { resolution, targetLongestMm: 1 });
  const rescaled = rescaleMeshResult(raw, result.canonicalScaleMmPerUnit);
  const oriented = opts.orient ? orientMeshForSavedStl(rescaled) : rescaled;
  return { ...oriented, plateReference: policyPlateReference(result) };
}

// ===========================================================================
// 7. Field-form agreement (exact vs indexed), sign AND value
// ===========================================================================

export interface FieldFormAgreement {
  latticePerAxis: number;
  compared: number;
  /** Lattice points where the two forms disagree about the SIGN of the field — the only difference the mesher can read. */
  signDisagreements: number;
  /** Largest |exact| at a sign disagreement. A disagreement only at tiny |exact| is a float tie at the isosurface; one at a large |exact| is a real difference. */
  maxAbsExactAtSignDisagreement: number;
  /** Largest |exact - indexed| over ALL compared points (the far-field cutoff makes this large by design). */
  maxAbsDifference: number;
  /** Points with `|exact| <= nearSurfaceBand` — where the value, not only the sign, has to agree. */
  nearSurfaceCompared: number;
  /** Largest |exact - indexed| among those. */
  maxAbsDifferenceNearSurface: number;
  nearSurfaceBandFieldUnits: number;
}

/**
 * Compare two forms of the same policy at IDENTICAL sample points: a
 * deterministic lattice over the candidate's own sampling box (cell centres, so
 * no sample lands exactly on a box face).
 *
 * `nearSurfaceBand` defaults to one production grid step: inside that band the
 * mesher interpolates values, so the two forms must agree on the VALUE there,
 * not merely on the sign.
 */
export function compareFieldForms(
  bounds: Bounds,
  exact: (x: number, y: number, z: number) => number,
  indexed: (x: number, y: number, z: number) => number,
  latticePerAxis: number,
  nearSurfaceBandFieldUnits: number,
): FieldFormAgreement {
  const n = Math.max(2, Math.round(latticePerAxis));
  let compared = 0;
  let signDisagreements = 0;
  let maxAbsExactAtSign = 0;
  let maxAbsDiff = 0;
  let nearCompared = 0;
  let maxNearDiff = 0;
  for (let i = 0; i < n; i++) {
    const x = bounds.min.x + ((i + 0.5) * bounds.size.x) / n;
    for (let j = 0; j < n; j++) {
      const y = bounds.min.y + ((j + 0.5) * bounds.size.y) / n;
      for (let k = 0; k < n; k++) {
        const z = bounds.min.z + ((k + 0.5) * bounds.size.z) / n;
        const a = exact(x, y, z);
        const b = indexed(x, y, z);
        compared++;
        const diff = Math.abs(a - b);
        if (diff > maxAbsDiff) maxAbsDiff = diff;
        if (a <= 0 !== b <= 0) {
          signDisagreements++;
          if (Math.abs(a) > maxAbsExactAtSign) maxAbsExactAtSign = Math.abs(a);
        }
        if (Math.abs(a) <= nearSurfaceBandFieldUnits) {
          nearCompared++;
          if (diff > maxNearDiff) maxNearDiff = diff;
        }
      }
    }
  }
  return {
    latticePerAxis: n,
    compared,
    signDisagreements,
    maxAbsExactAtSignDisagreement: maxAbsExactAtSign,
    maxAbsDifference: maxAbsDiff,
    nearSurfaceCompared: nearCompared,
    maxAbsDifferenceNearSurface: maxNearDiff,
    nearSurfaceBandFieldUnits,
  };
}

// ===========================================================================
// 8. Volumetric comparison against the hard union
// ===========================================================================

export interface AddedMaterialMeasurement {
  latticePerLongestEdge: number;
  cellsX: number;
  cellsY: number;
  cellsZ: number;
  cellVolumeMm3: number;
  /** Cells where the HARD union is inside (`<= 0`). */
  hardInsideCells: number;
  hardVolumeMm3: number;
  /** Cells where the POLICY field is inside. */
  policyInsideCells: number;
  policyVolumeMm3: number;
  /** Cells the policy calls inside that the hard union calls outside — the material the policy ADDS. */
  addedCells: number;
  addedVolumeMm3: number;
  /** Cells the hard union calls inside that the policy calls outside. A correct policy must never remove hard material, so this is expected 0 and reported (never assumed). */
  removedCells: number;
  removedVolumeMm3: number;
  /** Of the added cells, how many lie BELOW the build plate plane (pre-clip): a policy that adds material under the plate is adding material the clip then has to cut. */
  addedCellsBelowPlate: number;
  addedVolumeBelowPlateMm3: number;
  /** `addedVolumeMm3 / hardVolumeMm3`. */
  addedFractionOfHardVolume: number;
}

/**
 * How much material a policy adds relative to the hard union, by VOLUME on a
 * deterministic cell-centre grid over the candidate's own sampling box (the same
 * box every policy is meshed in, so the two numbers are commensurable).
 *
 * A grid estimate, not an integral: each number carries its cell volume so the
 * quantisation is visible. Both fields are evaluated at the SAME cell centres,
 * so the DIFFERENCE is not affected by the grid's absolute accuracy the way each
 * total is.
 */
export function measureAddedMaterial(
  bounds: Bounds,
  hard: (x: number, y: number, z: number) => number,
  policy: (x: number, y: number, z: number) => number,
  scaleMmPerUnit: number,
  latticePerLongestEdge: number,
  plateSdf: (x: number, y: number, z: number) => number,
): AddedMaterialMeasurement {
  const n = Math.max(2, Math.round(latticePerLongestEdge));
  const cellsOf = (extent: number): number => (bounds.longest > 0 ? Math.max(1, Math.round((extent / bounds.longest) * n)) : 1);
  const cx = cellsOf(bounds.size.x);
  const cy = cellsOf(bounds.size.y);
  const cz = cellsOf(bounds.size.z);
  const sx = bounds.size.x / cx;
  const sy = bounds.size.y / cy;
  const sz = bounds.size.z / cz;
  const cellVolumeMm3 = sx * sy * sz * scaleMmPerUnit ** 3;
  let hardInside = 0;
  let policyInside = 0;
  let added = 0;
  let removed = 0;
  let addedBelow = 0;
  for (let i = 0; i < cx; i++) {
    const x = bounds.min.x + (i + 0.5) * sx;
    for (let j = 0; j < cy; j++) {
      const y = bounds.min.y + (j + 0.5) * sy;
      for (let k = 0; k < cz; k++) {
        const z = bounds.min.z + (k + 0.5) * sz;
        const h = hard(x, y, z) <= 0;
        const p = policy(x, y, z) <= 0;
        if (h) hardInside++;
        if (p) policyInside++;
        if (p && !h) {
          added++;
          if (plateSdf(x, y, z) > 0) addedBelow++;
        }
        if (h && !p) removed++;
      }
    }
  }
  return {
    latticePerLongestEdge: n,
    cellsX: cx,
    cellsY: cy,
    cellsZ: cz,
    cellVolumeMm3,
    hardInsideCells: hardInside,
    hardVolumeMm3: hardInside * cellVolumeMm3,
    policyInsideCells: policyInside,
    policyVolumeMm3: policyInside * cellVolumeMm3,
    addedCells: added,
    addedVolumeMm3: added * cellVolumeMm3,
    removedCells: removed,
    removedVolumeMm3: removed * cellVolumeMm3,
    addedCellsBelowPlate: addedBelow,
    addedVolumeBelowPlateMm3: addedBelow * cellVolumeMm3,
    addedFractionOfHardVolume: hardInside > 0 ? added / hardInside : Infinity,
  };
}

/**
 * How far a policy's surface sits OUTSIDE the hard union's surface: the hard-union
 * SDF evaluated at every vertex of the policy's own mesh.
 *
 * Reads a value, not a sign, so it is exposed to `elementSdf`'s own convention:
 * that function is an exact distance for a straight capsule of constant radius
 * and an approximation for a TAPERED one (it interpolates the radius at the
 * closest point of the axis, which is not the closest point of the tapered
 * surface). The error is bounded by the radius variation along one element and is
 * quoted here rather than hidden — it is the same function the production field
 * is built from, so this is the outward distance in the Study's own metric.
 */
export interface OutwardDistanceMeasurement {
  vertexCount: number;
  maxOutwardFieldUnits: number;
  maxOutwardMm: number;
  meanOutwardMm: number;
  /** Vertices where the hard union is negative, i.e. the policy surface lies INSIDE the hard material (expected only at the plate clip's flat face). */
  verticesInsideHardUnion: number;
}

export function measureOutwardDistance(
  triangles: Triangle[],
  hard: (x: number, y: number, z: number) => number,
  scaleMmPerUnit: number,
): OutwardDistanceMeasurement {
  let maxOutward = -Infinity;
  let sum = 0;
  let count = 0;
  let inside = 0;
  for (const t of triangles) {
    for (const v of [t.a, t.b, t.c]) {
      const h = hard(v.x, v.y, v.z);
      if (h > maxOutward) maxOutward = h;
      if (h < 0) inside++;
      sum += Math.max(0, h);
      count++;
    }
  }
  return {
    vertexCount: count,
    maxOutwardFieldUnits: count > 0 ? maxOutward : 0,
    maxOutwardMm: count > 0 ? maxOutward * scaleMmPerUnit : 0,
    meanOutwardMm: count > 0 ? (sum / count) * scaleMmPerUnit : 0,
    verticesInsideHardUnion: inside,
  };
}

// ===========================================================================
// 9. Coverage honesty (§6)
// ===========================================================================

/**
 * §6. The Study's canonical ring coverage counts a sample covered when its probe
 * point lies inside some REACHABLE unit's own HARD capsule material
 * (`coverage.ts`'s `isInsideUnitMaterial`). If a policy adds joint material, the
 * saved mesh's material and the coverage material are no longer the same set, so
 * both are measured and the difference is reported. Coverage is never silently
 * redefined to whatever the new field happens to be.
 *
 * Both numbers use the SAME sample set, the SAME probe depth and the SAME
 * reachable-unit restriction — the policy field is rebuilt over the reachable
 * subset for exactly that reason, so the only difference between the two numbers
 * is the material definition.
 */
export interface CoverageComparison {
  sampleCount: number;
  probeDepthFieldUnits: number;
  reachableUnitCount: number;
  totalUnitCount: number;
  /** The Study's canonical number: `computeSurfaceCoverage` over the hard capsule union. */
  canonicalHardCoverage: number;
  /** The same samples judged by the POLICY's material field (`<= 0` at the probe point), reachable units only. */
  policyFieldCoverage: number;
  /** `policyFieldCoverage - canonicalHardCoverage`. */
  coverageDifference: number;
  /** Samples the policy field calls covered that the canonical hard test does not. */
  policyOnlyCoveredSamples: number;
  /** Samples the canonical hard test calls covered that the policy field does not. Expected 0 for any policy that only adds material; reported, not assumed. */
  canonicalOnlyCoveredSamples: number;
}

export function measureCoverageComparison(
  hostId: HostFixtureId,
  units: GrowthUnit[],
  unitRadius: number,
  buildPolicyField: (reachableUnits: GrowthUnit[]) => (x: number, y: number, z: number) => number,
  samples: SurfaceSample[] = getCoverageReferenceMesh(hostId),
): CoverageComparison {
  const probeDepth = computeProbeDepthField(unitRadius);
  const reachableIds = computeReachableUnitIds(units);
  const reachable = units.filter((u) => reachableIds.has(u.id));
  const canonical = computeSurfaceCoverage(samples, units, probeDepth);
  const policyAt = buildPolicyField(reachable);
  let totalWeight = 0;
  let policyWeight = 0;
  let policyOnly = 0;
  let canonicalOnly = 0;
  const canonicalCovered = new Set<number>();
  for (const c of canonical.classified) if (c.status === "covered") canonicalCovered.add(c.sample.id);
  for (const s of samples) {
    totalWeight += s.areaWeight;
    const px = s.point.x + s.inwardNormal.x * probeDepth;
    const py = s.point.y + s.inwardNormal.y * probeDepth;
    const pz = s.point.z + s.inwardNormal.z * probeDepth;
    const covered = policyAt(px, py, pz) <= 0;
    if (covered) policyWeight += s.areaWeight;
    const wasCovered = canonicalCovered.has(s.id);
    if (covered && !wasCovered) policyOnly++;
    if (!covered && wasCovered) canonicalOnly++;
  }
  const policyFieldCoverage = totalWeight > 0 ? policyWeight / totalWeight : 0;
  return {
    sampleCount: samples.length,
    probeDepthFieldUnits: probeDepth,
    reachableUnitCount: reachable.length,
    totalUnitCount: units.length,
    canonicalHardCoverage: canonical.measuredCoverage,
    policyFieldCoverage,
    coverageDifference: policyFieldCoverage - canonical.measuredCoverage,
    policyOnlyCoveredSamples: policyOnly,
    canonicalOnlyCoveredSamples: canonicalOnly,
  };
}

// ===========================================================================
// 10. Blend-only component classification (volumetric, imported instrument)
// ===========================================================================

export type HardMaterialVerdict = "contains-hard-material" | "blend-only" | "undetermined";

/**
 * The SAME rule the audited P2.3 report uses, restated here (this file may not
 * edit `ringFusionDiagnosis.report.ts`, where it currently lives) so the tallies
 * in the two rounds are produced by an identical criterion:
 *  - an open or winding-inconsistent component is `undetermined` (the ray-parity
 *    inside test is only valid on a closed surface);
 *  - densities that disagree are `undetermined`;
 *  - hard-negative cells at every density means it contains hard material;
 *  - otherwise `blend-only`, UNLESS the ambiguous band swallowed more than 20%
 *    of the interior, in which case "found none" is not "there is none" and it
 *    is `undetermined`.
 * The 20% figure is the report's own reporting threshold, carried over unchanged.
 */
export function hardMaterialVerdictOf(o: ComponentHardOverlap): HardMaterialVerdict {
  if (!o.surface.closed || !o.surface.windingConsistent) return "undetermined";
  if (!o.densitiesAgree) return "undetermined";
  if (o.hardNegativeAtEveryDensity) return "contains-hard-material";
  const worstAmbiguousShare = Math.max(...o.grids.map((g) => (g.insideCells > 0 ? g.ambiguousInsideCells / g.insideCells : 1)));
  return worstAmbiguousShare > 0.2 ? "undetermined" : "blend-only";
}

export interface NonLargestComponentTally {
  nonLargestCount: number;
  containsHardMaterial: number;
  blendOnly: number;
  undetermined: number;
  /**
   * How many of the non-largest components are smaller, along their own longest
   * bbox edge, than ONE mesh grid cell.
   *
   * Reported because it separates two very different failures that the raw
   * component count folds together: a real detached piece of the sculpture, and
   * a single-cell speck that marching tetrahedra shed off a tube only about one
   * cell thick. Both cost exactly one component at the save gate, but only the
   * first is a composition problem. `gridStepMm` is the step the number is
   * judged against and is carried on the tally so it is never read without it.
   */
  smallerThanOneGridCell: number;
  gridStepMm: number;
  /** Per-component detail, rank order. */
  perComponent: Array<{ rank: number; verdict: HardMaterialVerdict; absoluteVolumeProxyMm3: number; bboxLongestMm: number; touchesPlate: boolean }>;
}

export function tallyNonLargestComponents(
  triangles: Triangle[],
  report: ComponentReport,
  units: GrowthUnit[],
  scaleMmPerUnit: number,
  densities: readonly number[],
  plateReference: SavedPlateReference,
  gridStepMm: number,
): NonLargestComponentTally {
  const perComponent: NonLargestComponentTally["perComponent"] = [];
  let containsHard = 0;
  let blendOnly = 0;
  let undetermined = 0;
  for (const c of report.components) {
    if (c.rank === 0) continue;
    const o = measureComponentHardOverlap(
      componentTriangles(triangles, report, c.rank),
      c.rank,
      units,
      scaleMmPerUnit,
      densities,
      plateReference,
    );
    const verdict = hardMaterialVerdictOf(o);
    if (verdict === "contains-hard-material") containsHard++;
    else if (verdict === "blend-only") blendOnly++;
    else undetermined++;
    perComponent.push({
      rank: c.rank,
      verdict,
      absoluteVolumeProxyMm3: o.absoluteVolumeProxyMm3,
      bboxLongestMm: o.bboxLongestMm,
      touchesPlate: c.touchesPlate,
    });
  }
  return {
    nonLargestCount: report.components.length - (report.components.length > 0 ? 1 : 0),
    containsHardMaterial: containsHard,
    blendOnly,
    undetermined,
    smallerThanOneGridCell: perComponent.filter((c) => c.bboxLongestMm < gridStepMm).length,
    gridStepMm,
    perComponent,
  };
}

// ===========================================================================
// 11. The per-policy, per-host measurement
// ===========================================================================

export interface PolicyMeasurementOptions {
  resolution: number;
  /** Run the EXACT stage. ~25-45s per host per policy at resolution 64; the flag is recorded on the result so a partial row is never read as a full one. */
  includeExact: boolean;
  /** Grid densities for the volumetric blend-only classification (cells across each component's own longest bbox edge). Two, so a verdict that flips shows up as non-converged. */
  hardOverlapDensities: readonly number[];
  /** Lattice per longest edge for the added-volume measurement. */
  addedVolumeLattice: number;
  /** Lattice per axis for the exact-vs-indexed field comparison. */
  fieldFormLattice: number;
  /** Component-identity + blend-only classification are the expensive tails; skip for a fast smoke run. */
  includeComponentIdentity: boolean;
  includeBlendOnlyTally: boolean;
  includeCoverage: boolean;
  buildVolumeMm: Vec3;
}

export const DEFAULT_POLICY_MEASUREMENT_OPTIONS: Omit<PolicyMeasurementOptions, "buildVolumeMm"> = {
  resolution: 64,
  includeExact: true,
  hardOverlapDensities: [20, 32],
  addedVolumeLattice: 96,
  fieldFormLattice: 24,
  includeComponentIdentity: true,
  includeBlendOnlyTally: true,
  includeCoverage: true,
};

export interface PolicyHostMeasurement {
  hostId: HostFixtureId;
  policyId: PolicyId;
  policyLabel: string;
  derivation: string;
  unitCount: number;
  resolution: number;
  productionBlendK: number;
  blendKUsed: number;
  canonicalScaleMmPerUnit: number;
  gridStepFieldUnits: number;
  gridStepMm: number;

  // --- component counts along the pipeline ---
  /** Post-clip EXACT field. `null` when `includeExact` was false. */
  exactComponentCount: number | null;
  /** Post-clip INDEXED field. */
  indexedComponentCount: number;
  /** Post-clip indexed + `orientMeshForSavedStl` — the saved mesh. */
  savedComponentCount: number;
  /** The saved mesh's bytes, decoded and re-counted. */
  stlRoundTripComponentCount: number;

  // --- exact vs indexed IDENTITY, not merely count ---
  exactVsIndexedIdentity: {
    countPreserved: boolean;
    identityPreserved: boolean;
    identicalPairs: number;
    changedPairs: number;
    /** Worst nearest-centre pairing distance accepted, mm — how far the weakest pairing had to reach. */
    worstPairingDistanceMm: number;
    /** Largest absolute per-component volume change over the pairing, mm³. */
    worstAbsoluteVolumeDeltaMm3: number;
    disappearedBeforeRanks: number[];
    appearedAfterRanks: number[];
  } | null;
  fieldFormAgreement: FieldFormAgreement | null;

  // --- blend-only (volumetric) ---
  blendOnly: NonLargestComponentTally | null;

  // --- volume / distance vs the hard union ---
  addedMaterial: AddedMaterialMeasurement;
  outwardDistance: OutwardDistanceMeasurement;

  // --- coverage (§6) ---
  coverage: CoverageComparison | null;

  // --- save gate + plate + build volume ---
  saveGate: { ok: boolean; reasons: string[]; connectedComponents: number };
  lowestBuildAxisMm: number;
  plateBoundaryEpsilonMm: number;
  plateContactVertexCount: number;
  savedBboxMm: MeshVertex;
  buildVolumeMm: Vec3;
  bboxFitsBuildVolume: boolean;

  // --- joints (P3) ---
  jointCount: number;
  /** Joint neighbourhood radii, field units and mm — the confinement's actual size. */
  jointRInnerMinMaxFieldUnits: [number, number] | null;
  jointROuterMinMaxFieldUnits: [number, number] | null;
  /** Signed gap at each edge's contact, field units: min / median / max. Negative = the two units' hard material already overlaps there. */
  jointGapMinMedianMaxFieldUnits: [number, number, number] | null;
  jointGapMaxSamplingErrorFieldUnits: number | null;
  /** For P3 every added cell is joint material, so this equals `addedMaterial.addedVolumeMm3`; carried separately so the column exists for every policy and reads `null` where "joint volume" is not defined. */
  addedJointVolumeMm3: number | null;

  // --- cost ---
  exactMeshMs: number | null;
  indexedMeshMs: number;
  savedMeshMs: number;
  totalMs: number;

  // --- the meshes/reports, so a caller can ask further questions without re-meshing ---
  savedMesh: CandidateMeshResult;
  savedReport: ComponentReport;
  savedSignatures: ComponentSignature[];
}

function medianOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Measure ONE policy on ONE already-grown candidate. Pure: no RNG, no shared
 * mutable state, so the same `GrowthResult` and options always give identical
 * numbers (asserted by the determinism test).
 */
export function measurePolicy(
  result: GrowthResult,
  policyId: PolicyId,
  options: PolicyMeasurementOptions,
  buildOptions?: Partial<BuildPolicyOptions>,
): PolicyHostMeasurement {
  const t0 = Date.now();
  const productionBlendK = result.params.unitRadius * 0.3;
  const layerHeightMm = result.envelope.layerHeightMm;
  const policy = buildPolicy(result.units, policyId, { productionBlendK, ...buildOptions });
  const bounds = diagnosisBounds(result, policy.boundsBlendK);
  const plateReference = policyPlateReference(result);
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const plateSdf = (x: number, y: number, z: number): number => aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset);
  const gridStep = bounds.longest / Math.max(8, Math.round(options.resolution));

  // --- the three meshes -----------------------------------------------------
  let exactReport: ComponentReport | null = null;
  let exactMesh: CandidateMeshResult | null = null;
  let exactMs: number | null = null;
  if (options.includeExact) {
    const te = Date.now();
    exactMesh = buildPolicyMesh(result, policy.exact, options.resolution, policy.boundsBlendK, { postClip: true, orient: false });
    exactMs = Date.now() - te;
    exactReport = measureComponents(exactMesh.triangles, exactMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  }

  const ti = Date.now();
  const indexedMesh = buildPolicyMesh(result, policy.indexed, options.resolution, policy.boundsBlendK, { postClip: true, orient: false });
  const indexedMs = Date.now() - ti;
  const indexedReport = measureComponents(indexedMesh.triangles, indexedMesh.scaleMmPerUnit, plateReference, layerHeightMm);

  const ts = Date.now();
  const savedMesh = buildPolicyMesh(result, policy.indexed, options.resolution, policy.boundsBlendK, { postClip: true, orient: true });
  const savedMs = Date.now() - ts;
  const savedReport = measureComponents(savedMesh.triangles, savedMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  const savedSignatures = componentSignatures(savedMesh.triangles, savedReport, savedMesh.scaleMmPerUnit);

  // --- the bytes ------------------------------------------------------------
  const decoded = decodeBinaryStlTriangles(encodeBinaryStl(savedMesh, "p24-policy.stl"));
  const stlReport = measureComponents(
    decoded,
    1,
    { ...plateReference, plateOffsetFieldUnits: plateReference.plateOffsetFieldUnits * savedMesh.scaleMmPerUnit },
    layerHeightMm,
  );

  // --- exact vs indexed identity -------------------------------------------
  let identity: PolicyHostMeasurement["exactVsIndexedIdentity"] = null;
  if (exactMesh && exactReport && options.includeComponentIdentity) {
    const matching: ComponentSetMatching = matchComponentSets(
      componentSignatures(exactMesh.triangles, exactReport, exactMesh.scaleMmPerUnit),
      componentSignatures(indexedMesh.triangles, indexedReport, indexedMesh.scaleMmPerUnit),
    );
    identity = {
      countPreserved: matching.countPreserved,
      identityPreserved: matching.identityPreserved,
      identicalPairs: matching.identicalPairs.length,
      changedPairs: matching.changedPairs.length,
      worstPairingDistanceMm: matching.changedPairs.reduce((m, p) => Math.max(m, p.centreDistanceMm), 0),
      worstAbsoluteVolumeDeltaMm3: matching.changedPairs.reduce((m, p) => Math.max(m, Math.abs(p.absoluteVolumeDeltaMm3)), 0),
      disappearedBeforeRanks: matching.disappearedBeforeRanks,
      appearedAfterRanks: matching.appearedAfterRanks,
    };
  }
  const fieldFormAgreement = options.includeExact
    ? compareFieldForms(bounds, policy.exact, policy.indexed, options.fieldFormLattice, gridStep)
    : null;

  // --- blend-only tally on the SAVED mesh ----------------------------------
  const blendOnly = options.includeBlendOnlyTally
    ? tallyNonLargestComponents(
        savedMesh.triangles,
        savedReport,
        result.units,
        savedMesh.scaleMmPerUnit,
        options.hardOverlapDensities,
        plateReference,
        gridStep * result.canonicalScaleMmPerUnit,
      )
    : null;

  // --- volume / outward distance vs the hard union -------------------------
  const hardIndexed = createBaseHardSampler(result.units, productionBlendK);
  const addedMaterial = measureAddedMaterial(
    bounds,
    hardIndexed,
    policy.indexed,
    result.canonicalScaleMmPerUnit,
    options.addedVolumeLattice,
    plateSdf,
  );
  const outwardDistance = measureOutwardDistance(savedMesh.triangles, hardIndexed, savedMesh.scaleMmPerUnit);

  // --- coverage ------------------------------------------------------------
  const coverage = options.includeCoverage
    ? measureCoverageComparison(result.hostId, result.units, result.params.unitRadius, (reachable) =>
        buildPolicy(reachable, policyId, { productionBlendK, ...buildOptions }).indexed,
      )
    : null;

  // --- save gate -----------------------------------------------------------
  const gate: SaveGateResult = evaluateSaveGate(savedMesh, options.buildVolumeMm, layerHeightMm);
  const size = savedMesh.mmBounds.size;

  const joints = policy.jointSet;
  const gaps = joints ? joints.joints.map((j) => j.contact.sampledMinSignedGapFieldUnits) : null;

  return {
    hostId: result.hostId,
    policyId,
    policyLabel: policy.label,
    derivation: policy.derivation,
    unitCount: result.units.length,
    resolution: options.resolution,
    productionBlendK,
    blendKUsed: policy.blendKUsed,
    canonicalScaleMmPerUnit: result.canonicalScaleMmPerUnit,
    gridStepFieldUnits: gridStep,
    gridStepMm: gridStep * result.canonicalScaleMmPerUnit,

    exactComponentCount: exactReport ? exactReport.componentCount : null,
    indexedComponentCount: indexedReport.componentCount,
    savedComponentCount: savedReport.componentCount,
    stlRoundTripComponentCount: stlReport.componentCount,

    exactVsIndexedIdentity: identity,
    fieldFormAgreement,
    blendOnly,
    addedMaterial,
    outwardDistance,
    coverage,

    saveGate: { ok: gate.ok, reasons: gate.reasons, connectedComponents: gate.topology.connectedComponents },
    lowestBuildAxisMm: meshLowestBuildAxisMm(savedMesh),
    plateBoundaryEpsilonMm: plateBoundaryEpsilonMm(layerHeightMm),
    plateContactVertexCount: countPlateContactVertices(savedMesh, layerHeightMm),
    savedBboxMm: { x: size.x, y: size.y, z: size.z },
    buildVolumeMm: options.buildVolumeMm,
    bboxFitsBuildVolume: size.x <= options.buildVolumeMm.x && size.y <= options.buildVolumeMm.y && size.z <= options.buildVolumeMm.z,

    jointCount: joints ? joints.joints.length : 0,
    jointRInnerMinMaxFieldUnits: joints && joints.joints.length > 0
      ? [Math.min(...joints.joints.map((j) => j.rInnerFieldUnits)), Math.max(...joints.joints.map((j) => j.rInnerFieldUnits))]
      : null,
    jointROuterMinMaxFieldUnits: joints && joints.joints.length > 0
      ? [Math.min(...joints.joints.map((j) => j.rOuterFieldUnits)), Math.max(...joints.joints.map((j) => j.rOuterFieldUnits))]
      : null,
    jointGapMinMedianMaxFieldUnits: gaps && gaps.length > 0 ? [Math.min(...gaps), medianOf(gaps), Math.max(...gaps)] : null,
    jointGapMaxSamplingErrorFieldUnits: joints && joints.joints.length > 0
      ? Math.max(...joints.joints.map((j) => j.contact.samplingErrorBoundFieldUnits))
      : null,
    addedJointVolumeMm3: joints ? addedMaterial.addedVolumeMm3 : null,

    exactMeshMs: exactMs,
    indexedMeshMs: indexedMs,
    savedMeshMs: savedMs,
    totalMs: Date.now() - t0,

    savedMesh,
    savedReport,
    savedSignatures,
  };
}

/** The numbers a determinism check compares: everything that must be bit-identical for a fixed seed, with the meshes (large, not independently informative) left out. */
export function policyMeasurementFingerprint(m: PolicyHostMeasurement): string {
  return JSON.stringify({
    hostId: m.hostId,
    policyId: m.policyId,
    derivation: m.derivation,
    unitCount: m.unitCount,
    blendKUsed: m.blendKUsed,
    exactComponentCount: m.exactComponentCount,
    indexedComponentCount: m.indexedComponentCount,
    savedComponentCount: m.savedComponentCount,
    stlRoundTripComponentCount: m.stlRoundTripComponentCount,
    exactVsIndexedIdentity: m.exactVsIndexedIdentity,
    fieldFormAgreement: m.fieldFormAgreement,
    blendOnly: m.blendOnly,
    addedMaterial: m.addedMaterial,
    outwardDistance: m.outwardDistance,
    coverage: m.coverage,
    saveGate: m.saveGate,
    lowestBuildAxisMm: m.lowestBuildAxisMm,
    plateContactVertexCount: m.plateContactVertexCount,
    savedBboxMm: m.savedBboxMm,
    jointCount: m.jointCount,
    jointRInnerMinMaxFieldUnits: m.jointRInnerMinMaxFieldUnits,
    jointROuterMinMaxFieldUnits: m.jointROuterMinMaxFieldUnits,
    jointGapMinMedianMaxFieldUnits: m.jointGapMinMedianMaxFieldUnits,
    addedJointVolumeMm3: m.addedJointVolumeMm3,
    components: m.savedReport.components.map((c) => ({
      rank: c.rank,
      triangleCount: c.triangleCount,
      signedVolumeProxyMm3: c.signedVolumeProxyMm3,
      touchesPlate: c.touchesPlate,
    })),
  });
}

// ===========================================================================
// 12. Following ONE region (e.g. box rank 1) across policies
// ===========================================================================

export interface RegionUnderPolicy {
  policyId: PolicyId;
  /** The policy component whose bbox centre is nearest the reference region's, or null when the policy's mesh has no component whose bbox overlaps the reference bbox at all. */
  matchedRank: number | null;
  centreDistanceMm: number | null;
  /** Whether the matched component's bbox overlaps the reference bbox (a nearest-centre match with no overlap is not the same region). */
  bboxOverlaps: boolean;
  matchedTriangleCount: number | null;
  matchedAbsoluteVolumeProxyMm3: number | null;
  matchedIsLargestComponent: boolean | null;
  /** A fresh volumetric hard-material verdict for the matched component, or null when nothing matched. */
  verdict: HardMaterialVerdict | null;
  /** True when NO component of this policy occupies the region as a separate piece — i.e. the region was absorbed into the largest component or has no material at all. */
  absorbedOrAbsent: boolean;
}

function bboxesOverlap(aMin: MeshVertex, aMax: MeshVertex, bMin: MeshVertex, bMax: MeshVertex): boolean {
  return aMin.x <= bMax.x && bMin.x <= aMax.x && aMin.y <= bMax.y && bMin.y <= aMax.y && aMin.z <= bMax.z && bMin.z <= aMax.z;
}

/**
 * Follow a named REGION (identified by a reference component's signature, e.g.
 * P0's box rank 1) into another policy's mesh: which component, if any, occupies
 * it, whether that component is the largest one (i.e. the region got absorbed
 * into the main body) and whether it holds hard material.
 *
 * A locator, not an identification: `centreDistanceMm` and `bboxOverlaps` are
 * both reported so a match that is really a mismatch is visible.
 */
export function locateRegionUnderPolicy(
  reference: ComponentSignature,
  policyId: PolicyId,
  triangles: Triangle[],
  report: ComponentReport,
  units: GrowthUnit[],
  scaleMmPerUnit: number,
  densities: readonly number[],
  plateReference: SavedPlateReference,
): RegionUnderPolicy {
  const signatures = componentSignatures(triangles, report, scaleMmPerUnit);
  let best: ComponentSignature | null = null;
  let bestD = Infinity;
  for (const s of signatures) {
    const d = Math.hypot(s.centreMm.x - reference.centreMm.x, s.centreMm.y - reference.centreMm.y, s.centreMm.z - reference.centreMm.z);
    if (d < bestD || (d === bestD && best !== null && s.rank < best.rank)) {
      bestD = d;
      best = s;
    }
  }
  if (!best) {
    return {
      policyId,
      matchedRank: null,
      centreDistanceMm: null,
      bboxOverlaps: false,
      matchedTriangleCount: null,
      matchedAbsoluteVolumeProxyMm3: null,
      matchedIsLargestComponent: null,
      verdict: null,
      absorbedOrAbsent: true,
    };
  }
  const overlaps = bboxesOverlap(best.bboxMinMm, best.bboxMaxMm, reference.bboxMinMm, reference.bboxMaxMm);
  const overlap = measureComponentHardOverlap(
    componentTriangles(triangles, report, best.rank),
    best.rank,
    units,
    scaleMmPerUnit,
    densities,
    plateReference,
  );
  return {
    policyId,
    matchedRank: best.rank,
    centreDistanceMm: bestD,
    bboxOverlaps: overlaps,
    matchedTriangleCount: best.triangleCount,
    matchedAbsoluteVolumeProxyMm3: best.absoluteVolumeProxyMm3,
    matchedIsLargestComponent: best.rank === 0,
    verdict: hardMaterialVerdictOf(overlap),
    absorbedOrAbsent: best.rank === 0,
  };
}

// ===========================================================================
// 12b. Can ONE unit's own hard material mesh as one piece at all?
// ===========================================================================

/**
 * The measurement that decides whether a multi-component result is a COMPOSITION
 * problem or a DISCRETISATION problem, and therefore whether any policy on this
 * page could ever reach one component.
 *
 * P3's contract clause 1 fixes one unit's material as the HARD min of its own
 * capsule chain — no policy here is allowed to fuse a unit to itself. So if a
 * SINGLE unit's hard material does not already mesh as one connected component
 * at the candidate's own absolute grid step, then no admissible policy can
 * produce one component at that resolution, and a policy's component count is
 * measuring the mesher rather than the policy.
 *
 * The unit is meshed in its OWN sampling box at whatever resolution reproduces
 * the FULL candidate's absolute step (the `compareSubsetSteps` idiom), because a
 * subset meshed at the same RESOLUTION over a small box is at a much finer step
 * and would answer a different question. `buildMeshFromField`'s own
 * `Math.max(8, …)` floor can still force a finer step on a small box; when it
 * does, `stepRatioToFullCandidate < 1` says so and the row is NOT a
 * production-step row.
 */
export interface UnitResolvability {
  unitId: number;
  kind: GrowthUnit["kind"];
  elementCount: number;
  minNodeRadiusFieldUnits: number;
  maxNodeRadiusFieldUnits: number;
  /** The full candidate's absolute grid step at `resolution`, field units. */
  fullStepFieldUnits: number;
  /** Tube radius as a multiple of that step — below ~1 the tube is thinner than one cell. */
  minNodeRadiusInSteps: number;
  requestedSubsetResolution: number;
  effectiveSubsetResolution: number;
  subsetStepFieldUnits: number;
  stepRatioToFullCandidate: number;
  /** Components of THIS UNIT'S OWN hard material at that step. 1 = the mesher resolves the unit; more = it does not. */
  componentCount: number;
  triangleCount: number;
}

export function measureUnitResolvability(
  result: GrowthResult,
  unit: GrowthUnit,
  resolution: number,
  boundsBlendK: number,
  layerHeightMm: number,
): UnitResolvability {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const fullBounds = diagnosisBounds(result, boundsBlendK);
  const fullStep = fullBounds.longest / Math.max(8, Math.round(resolution));
  const subsetBounds = computeUnitBounds([unit], result.hostId, boundsBlendK, buildAxis, plateOffset);
  const requested = Math.round(subsetBounds.longest / fullStep);
  const effective = Math.max(8, requested);
  const raw = buildMeshFromField(subsetBounds, (x, y, z) => unitHardSdf(unit, x, y, z), {
    resolution: requested,
    targetLongestMm: 1,
  });
  const mesh = rescaleMeshResult(raw, result.canonicalScaleMmPerUnit);
  const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, policyPlateReference(result), layerHeightMm);
  let minR = Infinity;
  let maxR = -Infinity;
  for (const p of unit.points) {
    if (p.r < minR) minR = p.r;
    if (p.r > maxR) maxR = p.r;
  }
  const subsetStep = subsetBounds.longest / effective;
  return {
    unitId: unit.id,
    kind: unit.kind,
    elementCount: unitFieldElements(unit).length,
    minNodeRadiusFieldUnits: minR,
    maxNodeRadiusFieldUnits: maxR,
    fullStepFieldUnits: fullStep,
    minNodeRadiusInSteps: minR / fullStep,
    requestedSubsetResolution: requested,
    effectiveSubsetResolution: effective,
    subsetStepFieldUnits: subsetStep,
    stepRatioToFullCandidate: subsetStep / fullStep,
    componentCount: report.componentCount,
    triangleCount: report.triangleCount,
  };
}

export interface UnitResolvabilitySurvey {
  resolution: number;
  unitsSampled: number;
  /** Every `stride`-th unit in id order — a deterministic sample, never a random one. */
  stride: number;
  unitsResolvedAsOnePiece: number;
  unitsSplitByTheMesher: number;
  worstComponentCount: number;
  /** True when the subset boxes were forced finer than the production step by `buildMeshFromField`'s floor — the survey then UNDERSTATES the splitting. */
  anyRowFinerThanProductionStep: boolean;
  rows: UnitResolvability[];
}

export function surveyUnitResolvability(
  result: GrowthResult,
  resolution: number,
  boundsBlendK: number,
  layerHeightMm: number,
  maxUnits: number,
): UnitResolvabilitySurvey {
  const units = [...result.units].sort((a, b) => a.id - b.id);
  const stride = Math.max(1, Math.ceil(units.length / Math.max(1, maxUnits)));
  const rows: UnitResolvability[] = [];
  for (let i = 0; i < units.length; i += stride) {
    rows.push(measureUnitResolvability(result, units[i], resolution, boundsBlendK, layerHeightMm));
  }
  return {
    resolution,
    unitsSampled: rows.length,
    stride,
    unitsResolvedAsOnePiece: rows.filter((r) => r.componentCount === 1).length,
    unitsSplitByTheMesher: rows.filter((r) => r.componentCount !== 1).length,
    worstComponentCount: rows.reduce((m, r) => Math.max(m, r.componentCount), 0),
    anyRowFinerThanProductionStep: rows.some((r) => r.stepRatioToFullCandidate < 0.999),
    rows,
  };
}

// ===========================================================================
// 13. The gate the instruction asks P3 to be judged by
// ===========================================================================

export interface PolicyGateItem {
  name: string;
  pass: boolean;
  detail: string;
}

export interface PolicyGateReport {
  hostId: HostFixtureId;
  policyId: PolicyId;
  resolution: number;
  items: PolicyGateItem[];
  allPass: boolean;
}

/**
 * Turn one measurement into the instruction's explicit gate list. Every item is
 * a separate pass/fail with the number that decided it — a failure is never
 * rounded up to a pass, and an item that could not be measured (e.g. the exact
 * stage was skipped) FAILS with "not measured" rather than being dropped.
 *
 * `control` is the same host's P0 measurement, needed by the two "no worse than
 * the current policy" items.
 */
export function evaluatePolicyGate(m: PolicyHostMeasurement, control: PolicyHostMeasurement | null): PolicyGateReport {
  const items: PolicyGateItem[] = [];
  const push = (name: string, pass: boolean, detail: string): void => {
    items.push({ name, pass, detail });
  };

  const counts = [m.exactComponentCount, m.indexedComponentCount, m.savedComponentCount, m.stlRoundTripComponentCount];
  push(
    "exact = indexed = saved = STL round-trip = 1 component",
    m.exactComponentCount === 1 && m.indexedComponentCount === 1 && m.savedComponentCount === 1 && m.stlRoundTripComponentCount === 1,
    `exact ${m.exactComponentCount ?? "not measured"} / indexed ${m.indexedComponentCount} / saved ${m.savedComponentCount} / stl ${m.stlRoundTripComponentCount}` +
      (counts.includes(null) ? " (a null means that stage was not measured — counted as a FAIL, never skipped)" : ""),
  );
  push(
    "exact-vs-indexed component identity matched",
    m.exactVsIndexedIdentity !== null && m.exactVsIndexedIdentity.identityPreserved,
    m.exactVsIndexedIdentity === null
      ? "not measured"
      : `identityPreserved ${m.exactVsIndexedIdentity.identityPreserved}, byte-identical pairs ${m.exactVsIndexedIdentity.identicalPairs}, ` +
        `changed ${m.exactVsIndexedIdentity.changedPairs}, worst pairing ${m.exactVsIndexedIdentity.worstPairingDistanceMm.toFixed(4)}mm`,
  );
  push("save gate pass", m.saveGate.ok, m.saveGate.ok ? "ok" : m.saveGate.reasons.join(" / "));
  push(
    "plate contact present",
    m.plateContactVertexCount > 0 && m.lowestBuildAxisMm >= -m.plateBoundaryEpsilonMm,
    `plate-contact vertices ${m.plateContactVertexCount}, lowest build-axis ${m.lowestBuildAxisMm.toFixed(4)}mm (tolerance -${m.plateBoundaryEpsilonMm.toFixed(4)}mm)`,
  );
  push(
    "zero detached blend-only components",
    m.blendOnly !== null && m.blendOnly.blendOnly === 0 && m.blendOnly.undetermined === 0,
    m.blendOnly === null
      ? "not measured"
      : `non-largest ${m.blendOnly.perComponent.length}: contains-hard ${m.blendOnly.containsHardMaterial}, blend-only ${m.blendOnly.blendOnly}, undetermined ${m.blendOnly.undetermined}`,
  );
  push(
    "added volume no worse than the current policy",
    control !== null && m.addedMaterial.addedVolumeMm3 <= control.addedMaterial.addedVolumeMm3,
    control === null
      ? "no P0 control measurement to compare against"
      : `${m.addedMaterial.addedVolumeMm3.toFixed(3)}mm³ vs P0 ${control.addedMaterial.addedVolumeMm3.toFixed(3)}mm³`,
  );
  push(
    "max outward distance no worse than the current policy",
    control !== null && m.outwardDistance.maxOutwardMm <= control.outwardDistance.maxOutwardMm,
    control === null
      ? "no P0 control measurement to compare against"
      : `${m.outwardDistance.maxOutwardMm.toFixed(4)}mm vs P0 ${control.outwardDistance.maxOutwardMm.toFixed(4)}mm`,
  );
  return { hostId: m.hostId, policyId: m.policyId, resolution: m.resolution, items, allPass: items.every((i) => i.pass) };
}

// ===========================================================================
// 14. Reporting helpers (formatting only — no new measurement)
// ===========================================================================

function num(v: number | null, digits = 3): string {
  return v === null || !Number.isFinite(v) ? "n/a" : v.toFixed(digits);
}

/** One table row per policy × host. Formatting only. */
export function policyRowLines(m: PolicyHostMeasurement): string[] {
  const id = m.exactVsIndexedIdentity;
  const b = m.blendOnly;
  return [
    `${m.hostId.padEnd(8)} ${m.policyId.padEnd(16)} k=${num(m.blendKUsed, 5)} units=${m.unitCount} res=${m.resolution}`,
    `    components   exact ${m.exactComponentCount ?? "skipped"} | indexed ${m.indexedComponentCount} | saved ${m.savedComponentCount} | stl ${m.stlRoundTripComponentCount}`,
    `    identity     ${id === null ? "not measured" : `preserved ${id.identityPreserved} (identical ${id.identicalPairs}, changed ${id.changedPairs}, worst pairing ${num(id.worstPairingDistanceMm, 4)}mm, worst |ΔV| ${num(id.worstAbsoluteVolumeDeltaMm3, 4)}mm³, disappeared [${id.disappearedBeforeRanks.join(",")}], appeared [${id.appearedAfterRanks.join(",")}])`}`,
    `    field forms  ${m.fieldFormAgreement === null ? "not measured" : `sign disagreements ${m.fieldFormAgreement.signDisagreements}/${m.fieldFormAgreement.compared} (max |exact| there ${num(m.fieldFormAgreement.maxAbsExactAtSignDisagreement, 6)}), near-surface max |Δ| ${num(m.fieldFormAgreement.maxAbsDifferenceNearSurface, 8)} over ${m.fieldFormAgreement.nearSurfaceCompared} points`}`,
    `    blend-only   ${b === null ? "not measured" : `non-largest ${b.perComponent.length}: hard ${b.containsHardMaterial}, blend-only ${b.blendOnly}, undetermined ${b.undetermined}; smaller than one grid cell (${num(b.gridStepMm, 3)}mm) ${b.smallerThanOneGridCell}`}`,
    `    volume       hard ${num(m.addedMaterial.hardVolumeMm3, 2)}mm³, policy ${num(m.addedMaterial.policyVolumeMm3, 2)}mm³, added ${num(m.addedMaterial.addedVolumeMm3, 3)}mm³ (${num(m.addedMaterial.addedFractionOfHardVolume * 100, 2)}% of hard), removed ${num(m.addedMaterial.removedVolumeMm3, 3)}mm³, added below plate ${num(m.addedMaterial.addedVolumeBelowPlateMm3, 3)}mm³`,
    `    outward      max ${num(m.outwardDistance.maxOutwardMm, 4)}mm, mean ${num(m.outwardDistance.meanOutwardMm, 4)}mm over ${m.outwardDistance.vertexCount} saved vertices`,
    `    coverage     ${m.coverage === null ? "not measured" : `canonical hard ${num(m.coverage.canonicalHardCoverage * 100, 3)}%, policy field ${num(m.coverage.policyFieldCoverage * 100, 3)}%, difference ${num(m.coverage.coverageDifference * 100, 3)}pp (policy-only samples ${m.coverage.policyOnlyCoveredSamples}, canonical-only ${m.coverage.canonicalOnlyCoveredSamples})`}`,
    `    gate         ${m.saveGate.ok ? "PASS" : `FAIL: ${m.saveGate.reasons.join(" / ")}`}`,
    `    plate        lowest ${num(m.lowestBuildAxisMm, 4)}mm (tol -${num(m.plateBoundaryEpsilonMm, 4)}), contact vertices ${m.plateContactVertexCount}`,
    `    bbox         ${num(m.savedBboxMm.x, 1)}×${num(m.savedBboxMm.y, 1)}×${num(m.savedBboxMm.z, 1)}mm vs build volume ${m.buildVolumeMm.x}×${m.buildVolumeMm.y}×${m.buildVolumeMm.z}mm — fits ${m.bboxFitsBuildVolume}`,
    `    joints       ${m.jointCount}${m.jointCount > 0 ? ` | rInner ${num(m.jointRInnerMinMaxFieldUnits?.[0] ?? null, 4)}..${num(m.jointRInnerMinMaxFieldUnits?.[1] ?? null, 4)} | rOuter ${num(m.jointROuterMinMaxFieldUnits?.[0] ?? null, 4)}..${num(m.jointROuterMinMaxFieldUnits?.[1] ?? null, 4)} | gap min/med/max ${num(m.jointGapMinMedianMaxFieldUnits?.[0] ?? null, 5)}/${num(m.jointGapMinMedianMaxFieldUnits?.[1] ?? null, 5)}/${num(m.jointGapMinMedianMaxFieldUnits?.[2] ?? null, 5)} (±${num(m.jointGapMaxSamplingErrorFieldUnits, 6)}) | joint volume ${num(m.addedJointVolumeMm3, 3)}mm³` : ""}`,
    `    mesh time    exact ${m.exactMeshMs === null ? "skipped" : `${m.exactMeshMs}ms`} | indexed ${m.indexedMeshMs}ms | saved ${m.savedMeshMs}ms | total ${m.totalMs}ms`,
    `    derivation   ${m.derivation}`,
  ];
}

export function gateReportLines(g: PolicyGateReport): string[] {
  return [
    `gate ${g.hostId} ${g.policyId} @res ${g.resolution}: ${g.allPass ? "ALL PASS" : "NOT all pass"}`,
    ...g.items.map((i) => `    [${i.pass ? "PASS" : "FAIL"}] ${i.name} — ${i.detail}`),
  ];
}

/**
 * The production save path's own mesh for a candidate, for the report's control
 * column. Imported unchanged — this exists only so a caller does not have to
 * import `meshExport.ts` separately to state the control.
 */
export function productionSavedMesh(result: GrowthResult, resolution: number): CandidateMeshResult {
  return buildCandidateMesh(result, resolution, result.params.unitRadius * 0.3);
}

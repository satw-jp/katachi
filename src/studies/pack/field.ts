// ---------------------------------------------------------------------------
// S-pack's field: two layers of the SAME kind of ball list S1 uses (Ball,
// FieldParams, fieldSdf, growBalls all imported from cloud-sculpt/field.ts,
// not copied). RESEARCH.md v5 Y7 second correction (作者の言葉):
// "ある形態を実体としたときに、内部にできるだけ虚の物体を詰め込んで、
// ブーリアン除算したときに残る、元の形態の骨組みのようなものを作りたい" —
// 積む単位は虚。作品は残り物。
//
// Composite SDF = smooth(max(hostSdf, -voidSdf)) — Inigo Quilez's smooth
// subtraction (https://iquilezles.org/articles/distfunctions/), carving the
// void field out of the host field. This file owns that formula and the
// greedy packing algorithm; shaders.ts (GLSL) must stay in lockstep, exactly
// like foam/cell.ts <-> foam/shaders.ts.
//
// 仮決め (single "丸さ k"): the task doc names ONE roundness knob ("丸さの
// k"). Rather than invent an unrequested second knob, `roundK` is reused for
// both the void-void union (so packed voids merge into cavities, not stay as
// separate lens-shaped bites) and the host-minus-void subtraction itself.
// Documented in README "実装メモ".
//
// --- T14 (S-pack v0.3, 作者発注「球体じゃなくて雲自体を入れ込む」) --------
// 詰める単位が「球」から「単位」（PackUnit）に格上げされた。A unit owns a
// GROUP of balls (1 for "sphere" kind, 3-10 for "cloud" kind) plus a local
// blend k used ONLY to smooth-min that unit's OWN balls together — distinct
// from `roundK`, which still governs (a) how different units' fields merge
// with each other and (b) the host-minus-void subtraction, exactly as
// before. This is a genuine two-level smooth-min: unitSdf() blends within a
// unit with unit.localK, unitsFieldSdf() blends ACROSS units with roundK.
// For "sphere" kind units (balls.length === 1), localK is never consulted
// (a single ball has nothing to blend with), so sphere-mode packing is
// numerically IDENTICAL to pre-T14 behavior — this is how "球モードは無退行"
// is guaranteed by construction, not just by testing.
//
// Collision/clearance during packing is against each EXISTING unit's own
// circumscribing sphere (center + outerRadius), never its individual balls
// (T14 spec: "clearance は単位の外接球で粗く…精密判定はしない — 詰め方の
// 偶然が価値"). The existing minR/maxR knobs are reinterpreted as bounds on
// this circumscribing radius for whichever kind is selected — unchanged
// wiring, new meaning, documented in README.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "../cloud-sculpt/field.ts";
import { ballSdf, fieldSdf, smoothMin } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
// T15 (S-pack v0.4, 作者発注「表層の語彙〈コイン/リング〉を内部にも詰める」):
// 立体リングは S-rings の輪生成をそのまま共有（コピーしない、skin/field.ts の
// buildRing3dPoints と同じ精神）。rotatePoint も同様に共有 — 単位ごとの
// ランダム位相回転に使う。
import { generateRingBalls, rotatePoint } from "../rings/ring.ts";
import type { RingRecipe, Vec3 } from "../rings/ring.ts";

/**
 * T13 (S-pack v0.2, 作者発注「反転バージョンも作りたい」) — 地と図の反転:
 *  - "carve" (実体に虚を詰める, 現行): composite = host − voids (opSmoothSubtraction)
 *  - "fill" (虚に実を詰める, 新設): host is a MOLD ONLY — used to constrain
 *    WHERE voids may be placed (packVoidsGreedy is completely unchanged,
 *    "詰め込む際の挙動は今やったことと同じ" per the author), but the
 *    composite is the smooth-union of the packed balls themselves
 *    (fieldSdf(voids, roundK, ...) — the SAME roundK knob already reused for
 *    the void-void union in carve mode). The host is never part of the
 *    printed composite in fill mode (it is the "型枠"), and is shown only as
 *    a translucent backdrop in the bead view (renderer.ts), mirroring
 *    skin/renderer.ts's host bead treatment.
 */
export type PackMode = "carve" | "fill";

/**
 * T14/T15: which kind of unit the packer places. "sphere"/"cloud" unchanged
 * from T14. T15 adds the three surface-language shapes moved in from
 * S-skin (作者発注 2026-07-14 "内部にもコインやリングを詰める"):
 * "coin" (a flattened blob, oriented by a normal), "flatRing" (nodes on a
 * circle in a plane, oriented by a normal, opens a real hole above ~holeRatio
 * 0.47), "ring3d" (a torus of node balls, S-rings' own chain generator,
 * oriented by its axis = the same normal). Orientation for these three is
 * supplied by the PLACEMENT mode (T15 §2): grid gives an axis-aligned
 * normal (X/Y/Z, optionally alternating per layer); random placement has no
 * surface to take a normal from, so it draws an isotropic random one
 * (randomNormal below) — this is how "両モードで機能" is satisfied for the
 * new shapes without inventing a second orientation scheme.
 */
export type UnitKind = "sphere" | "cloud" | "coin" | "flatRing" | "ring3d";

/** T15 §2: which of the two ways "詰める" chooses candidate points.
 * "random" = T9's greedy rejection sampling, unchanged. "grid" = new: cubic
 * lattice points, host-interior only, with a continuous "ばらし" knob
 * bridging to something close to the random look (H1 UI, see packUnitsGrid). */
export type PlacementMode = "random" | "grid";

/** T15 §2: grid's base normal axis for oriented units (coin/flatRing/ring3d). */
export type GridAxis = "x" | "y" | "z";

/**
 * T14: one placed unit — the thing pack's greedy packer actually places one
 * of, per iteration. Owns a GROUP of balls (ownership is "this array belongs
 * to this unit", same precedent as skin/field.ts's Patch: points carry no
 * back-reference, the unit's own `balls` array IS the ownership record).
 * `center`/`outerRadius` are the circumscribing sphere used for coarse
 * clearance (see file header) and for the "最薄の肉" gauge (estimateThinnestWall
 * below) — the SAME coarse proxy the packer itself relied on, not a tighter
 * one it never actually enforced.
 */
export interface PackUnit {
  id: number;
  kind: UnitKind;
  /** World-space constituent balls. Length 1 for "sphere", 3-10 (typ.) for "cloud". */
  balls: Ball[];
  /** Local blend strength for this unit's OWN balls (see file header two-level note).
   * Meaningless (never read) when balls.length <= 1. */
  localK: number;
  center: { x: number; y: number; z: number };
  /** Circumscribing radius used for coarse clearance + gauges. */
  outerRadius: number;
  /** T15: the normal used to orient "coin"/"flatRing"/"ring3d" balls at
   * generation time (undefined for "sphere"/"cloud", which have no
   * orientation). Kept only for display/debugging — the balls themselves are
   * already baked in world space, so replay never re-reads this. */
  normal?: { x: number; y: number; z: number };
}

/**
 * T14 §2: a registered "詰め材" origin shape, read from an S1 recipe via
 * `loadHostFromS1Recipe`'s same replay machinery. `center`/`radius` are the
 * prototype's OWN bounding sphere (centroid + max ball-surface distance from
 * it — a cheap conservative bound, not a true minimal enclosing sphere;
 * documented as an approximation in README) so instancing can normalize:
 * scale = targetOuterRadius / radius.
 */
export interface CloudPrototype {
  balls: Ball[];
  k: number;
  center: { x: number; y: number; z: number };
  radius: number;
  source?: string;
}

export interface PackParams {
  /** Smallest allowed unit radius (circumscribing sphere for "cloud" kind, plain
   * ball radius for "sphere" kind — same knob, reinterpreted per T14). */
  minR: number;
  /** Largest allowed unit radius (same reinterpretation as minR). */
  maxR: number;
  /** Minimum clearance kept between unit surfaces (coarse, outer-sphere-to-outer-
   * sphere for T14) and between a unit and the host surface, before penetration. */
  gap: number;
  /** How far a unit is allowed to poke through the host surface. */
  penetration: number;
  /** Sample-point trials for one "詰める" pass. */
  attempts: number;
  seed: string;
  /** Roundness of the ACROSS-unit union and of the host-minus-void subtraction
   * (T14: distinct from unitLocalK, see file header two-level note). */
  roundK: number;
  /** T14: which kind of unit "詰める" and manual add place. */
  unitKind: UnitKind;
  /** T14: cloud unit ball-count range (inclusive), used only when no
   * cloudPrototypes are registered (procedural generation, see buildUnit). */
  unitBallsMin: number;
  unitBallsMax: number;
  /** T14: per-ball radius variance within a procedurally generated cloud unit
   * (same "ばらつき" convention as FieldParams.radiusSpread: 0=uniform). */
  unitRadiusSpread: number;
  /** T14: local blend k for a cloud unit's own balls (see file header).
   * T15: reused verbatim as the within-unit blend k for coin/flatRing/ring3d
   * units too (仮決め — no separate knob invented, same "one knob, reused"
   * precedent as roundK across this file). */
  unitLocalK: number;

  // --- T15 §1: shape knobs for coin/flatRing/ring3d, moved in from
  // S-skin's SkinParams (same field names/meanings so the vocabulary reads
  // the same across Studies) -----------------------------------------------
  /** "coin": 0..1 "形の不揃い" — how many sub-points scatter around the
   * anchor and how far/differently-sized (skin's `irregularity`, same
   * formula shape). */
  unitIrregularity: number;
  /** "flatRing": 0 = no hole (reads as a coin), toward 0.95 = thin ring with
   * a real hole (skin's `flatRingHoleRatio`, same formula). */
  flatRingHoleRatio: number;
  /** "flatRing"/"ring3d": node (ball) count around the ring. */
  ringNodeCount: number;
  /** "ring3d": tube (node ball) radius, as a fraction the packer clamps to
   * fit inside the unit's outer sphere (see buildRing3dUnitBalls). */
  ringTubeR: number;
  /** "flatRing"/"ring3d": fractional jitter of node ball radius. */
  ringWobbleR: number;
  /** "ring3d": fractional jitter of node position. */
  ringWobblePos: number;

  // --- T15 §2: grid placement knobs -----------------------------------------
  /** "random" (T9's greedy rejection sampling, default) or "grid" (new). */
  placementMode: PlacementMode;
  /** Uniform lattice spacing (world units). Unit radius at ばらし=0 is
   * derived from this (see packUnitsGrid), not from minR/maxR — grid's size
   * is a function of density, not a separately dialed range. */
  gridSpacing: number;
  /** 千鳥: offset every other layer (along `gridAxis`... no — along Z by
   * convention, see packUnitsGrid doc) by half the spacing in the two
   * in-plane directions (brick/checkerboard). */
  gridStagger: boolean;
  /** Base normal axis for oriented units (coin/flatRing/ring3d). No effect
   * on sphere/cloud units. */
  gridAxis: GridAxis;
  /** 層ごとに交互: alternate the normal between `gridAxis` and the next axis
   * in the cycle x→y→z→x on every other layer (合板/クロスライク). */
  gridAlternate: boolean;
  /** ばらし, 0..1: 0 = perfect lattice (deterministic position/rotation/size),
   * 1 = position/rotation/size jitter pushed far enough that the result reads
   * close to the random placement mode. THE bridge knob (T15's whole point —
   * H1 UI). See packUnitsGrid for the exact injection formula. */
  gridScatter: number;
}

export const DEFAULT_PACK_PARAMS: PackParams = {
  minR: 0.08,
  maxR: 0.35,
  gap: 0.05,
  penetration: 0,
  attempts: 600,
  seed: "yohaku-pack",
  // Kept <= gap by default: see README Observation -- when roundK exceeds the
  // physical shell thickness left by gap, the smooth subtraction visually
  // rounds/thins that shell into something that READS as a pinhole even
  // though it stays topologically closed (dHost never crosses zero at the
  // surface). Not wrong, just a subtlety worth defaulting away from so the
  // first-load state reads as the closed shell 完了条件2 describes.
  roundK: 0.04,
  unitKind: "sphere",
  unitBallsMin: 3,
  unitBallsMax: 7,
  unitRadiusSpread: 0.6,
  unitLocalK: 0.25,
  // T15 shape knobs (moved-in defaults match skin/field.ts's DEFAULT_SKIN_PARAMS
  // so switching between Studies reads the same numbers).
  unitIrregularity: 0.5,
  flatRingHoleRatio: 0.6,
  ringNodeCount: 10,
  ringTubeR: 0.06,
  ringWobbleR: 0.3,
  ringWobblePos: 0.15,
  // T15 grid knobs.
  placementMode: "random",
  gridSpacing: 0.35,
  gridStagger: false,
  gridAxis: "z",
  gridAlternate: false,
  gridScatter: 0,
};

let nextVoidId = 1;
export function freshVoidId(): number {
  return nextVoidId++;
}
/** Reset the void (ball) id counter — used only when replaying a history from scratch. */
export function resetVoidIdCounter(startAt = 1): void {
  nextVoidId = startAt;
}

let nextUnitId = 1;
export function freshUnitId(): number {
  return nextUnitId++;
}
/** Reset the unit id counter — used only when replaying a history from scratch. */
export function resetUnitIdCounter(startAt = 1): void {
  nextUnitId = startAt;
}

/** Flatten every unit's balls into one plain Ball[] — used wherever grouping
 * doesn't matter (shader uniforms build their own per-unit arrays separately;
 * this is for gauges/bounds callers that only ever wanted "all the balls"). */
export function flattenUnits(units: PackUnit[]): Ball[] {
  const out: Ball[] = [];
  for (const u of units) for (const b of u.balls) out.push(b);
  return out;
}

/**
 * T14 two-level blend, level 1: this unit's OWN balls, smooth-min'd with its
 * OWN localK. A single-ball unit ("sphere" kind, or a 1-ball cloud) has
 * nothing to blend, so this reduces to a plain ballSdf — no localK term
 * appears in the math at all in that case, which is exactly why sphere-kind
 * packing stays bit-identical to pre-T14 behavior.
 */
export function unitSdf(unit: PackUnit, x: number, y: number, z: number): number {
  if (unit.balls.length === 1) return ballSdf(unit.balls[0], x, y, z);
  return fieldSdf(unit.balls, unit.localK, x, y, z);
}

/**
 * T14 two-level blend, level 2: ACROSS units, smooth-min'd with `roundK` —
 * the same knob that (in carve mode) also governs the host-minus-void
 * subtraction, unchanged from T13/T9. Replaces the old flat
 * `fieldSdf(voids, roundK, ...)` call sites.
 */
export function unitsFieldSdf(units: PackUnit[], roundK: number, x: number, y: number, z: number): number {
  if (units.length === 0) return 1e5;
  let d = unitSdf(units[0], x, y, z);
  for (let i = 1; i < units.length; i++) {
    d = smoothMin(d, unitSdf(units[i], x, y, z), roundK);
  }
  return d;
}

/**
 * Quilez's smooth subtraction: smooth(max(-d1, d2)). Calling it with
 * d1 = voidSdf, d2 = hostSdf gives smooth(max(hostSdf, -voidSdf)) — exactly
 * the T9 spec's composite formula "max(hostSdf, −voidSdf) の滑らか版".
 * k <= 0 degenerates to the hard boolean subtraction (legal knob position,
 * same convention as field.ts's smoothMin).
 */
export function opSmoothSubtraction(d1: number, d2: number, k: number): number {
  if (k <= 0) return Math.max(-d1, d2);
  const h = Math.max(0, Math.min(1, 0.5 - (0.5 * (d2 + d1)) / k));
  return d2 * (1 - h) + -d1 * h + k * h * (1 - h);
}

/**
 * The whole composite field, mode-dependent (T13 §1), T14: now takes
 * PackUnit[] and routes through unitsFieldSdf's two-level blend instead of a
 * flat fieldSdf over a Ball[]:
 *  - "carve": host with units carved out, both smooth-min'd internally.
 *  - "fill": the host field is IGNORED for the composite (it is a mold, not
 *    printed material) — the result is the packed units' own smooth union.
 */
export function compositeSdf(
  mode: PackMode,
  host: Ball[],
  hostK: number,
  units: PackUnit[],
  roundK: number,
  x: number,
  y: number,
  z: number,
): number {
  if (mode === "fill") {
    if (units.length === 0) return 1e5;
    return unitsFieldSdf(units, roundK, x, y, z);
  }
  const dHost = fieldSdf(host, hostK, x, y, z);
  if (units.length === 0) return dHost;
  const dVoid = unitsFieldSdf(units, roundK, x, y, z);
  return opSmoothSubtraction(dVoid, dHost, roundK);
}

export interface PackResult {
  units: PackUnit[];
  placed: number;
  triedAndRejected: number;
  /** True if the pass gave up early because too many consecutive samples in a row
   * failed to find room (i.e. "置けなくなった"), rather than exhausting `attempts`. */
  stoppedEarly: boolean;
}

// How many consecutive rejected samples in a row count as "can't place any more"
// (完了条件2 "置けなくなるまで"). Scales with the requested attempt budget so a
// small "詰め込みの強さ" doesn't give up after just a couple of unlucky draws,
// but never demands more than a fixed floor of patience either. 仮決め — no
// principled derivation, documented here per AGENTS §5.
const FAIL_LIMIT_FLOOR = 120;

/**
 * Rodrigues rotation: builds a random-axis, random-angle rotation function
 * from a seeded rng. T14 §1 "配置はランダム回転つき". For a procedurally
 * generated cloud unit this has no visible effect (each ball's local offset
 * is already drawn from an isotropic random direction, so rotating the whole
 * isotropic set changes nothing statistically) — it matters for prototype
 * instancing (a FIXED shape reused across units), where it's the only source
 * of per-unit variety besides scale. Applied uniformly to both paths anyway
 * for one code path / one less special case (仮決め, documented in README).
 */
function randomRotation(rng: () => number): (v: { x: number; y: number; z: number }) => { x: number; y: number; z: number } {
  const theta = rng() * Math.PI * 2;
  const phi = Math.acos(2 * rng() - 1);
  const ax = Math.sin(phi) * Math.cos(theta);
  const ay = Math.sin(phi) * Math.sin(theta);
  const az = Math.cos(phi);
  const angle = rng() * Math.PI * 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return (v) => {
    const { x, y, z } = v;
    const dot = ax * x + ay * y + az * z;
    const crossX = ay * z - az * y;
    const crossY = az * x - ax * z;
    const crossZ = ax * y - ay * x;
    return {
      x: x * c + crossX * s + ax * dot * t,
      y: y * c + crossY * s + ay * dot * t,
      z: z * c + crossZ * s + az * dot * t,
    };
  };
}

// --- T15 §1: coin/flatRing/ring3d unit generation --------------------------
//
// These are pack-local COPIES of skin/field.ts's buildCoinPoints/
// buildFlatRingPoints/buildRing3dPoints, not imports, for one real reason:
// skin's generators re-project every sub-point back onto the HOST SURFACE
// (`projectToSurface`) because a patch lives glued to a curved skin. A pack
// unit lives loose in the host's INTERIOR volume — there is no surface to
// project onto — so the re-projection step is simply dropped and points stay
// exactly in the anchor's tangent plane (a flat "coin"/"ring" is the correct
// shape for an internal unit, unlike a surface patch which must bend to the
// skin's curvature). generateRingBalls/rotatePoint themselves ARE shared
// (imported from rings/ring.ts, not copied) — same "共有できれば共有" split
// skin/field.ts's own file header documents for its own ring3d generator.
// Ball ids from generateRingBalls come from cloud-sculpt's OWN counter
// (shared with the host balls) — re-issued here via freshVoidId() so a
// pack unit's ids stay in this Study's own id space, same discipline
// buildUnit's prototype-instancing path already follows below.

/** Orthonormal basis (t1, t2) spanning the tangent plane of a unit normal.
 * Pack-local copy of skin/field.ts's identical helper (self-contained
 * precedent, see file header). */
function tangentBasis(nx: number, ny: number, nz: number): { t1: [number, number, number]; t2: [number, number, number] } {
  const up = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const t1x = ny * up[2] - nz * up[1];
  const t1y = nz * up[0] - nx * up[2];
  const t1z = nx * up[1] - ny * up[0];
  const t1len = Math.hypot(t1x, t1y, t1z) || 1;
  const t1: [number, number, number] = [t1x / t1len, t1y / t1len, t1z / t1len];
  const t2: [number, number, number] = [
    ny * t1[2] - nz * t1[1],
    nz * t1[0] - nx * t1[2],
    nx * t1[1] - ny * t1[0],
  ];
  return { t1, t2 };
}

/** Isotropic random unit vector — the normal random-placement mode gives
 * coin/flatRing/ring3d units when no grid axis applies (see UnitKind doc
 * comment). Same theta/phi construction as randomRotation's axis draw. */
function randomNormal(rng: () => number): { x: number; y: number; z: number } {
  const theta = rng() * Math.PI * 2;
  const phi = Math.acos(2 * rng() - 1);
  return { x: Math.sin(phi) * Math.cos(theta), y: Math.sin(phi) * Math.sin(theta), z: Math.cos(phi) };
}

/**
 * Enforces the "no ball extends past outerRadius from center" contract
 * (see PackUnit doc comment, same contract T14's cloud clamp guarantees for
 * the procedural path) by uniformly SCALING the whole ball group toward
 * `center` if any ball pokes out — rather than clamping each point
 * individually mid-generation (which would distort a ring into a lopsided
 * shape). A no-op (returns `balls` unchanged) when already inside.
 */
function clampBallsToOuterRadius(center: { x: number; y: number; z: number }, balls: Ball[], outerRadius: number): Ball[] {
  let maxExtent = 0;
  for (const b of balls) {
    const d = Math.hypot(b.x - center.x, b.y - center.y, b.z - center.z) + b.r;
    if (d > maxExtent) maxExtent = d;
  }
  if (maxExtent <= outerRadius || maxExtent <= 1e-9) return balls;
  const scale = outerRadius / maxExtent;
  return balls.map((b) => ({
    id: b.id,
    x: center.x + (b.x - center.x) * scale,
    y: center.y + (b.y - center.y) * scale,
    z: center.z + (b.z - center.z) * scale,
    r: b.r * scale,
  }));
}

/** "コイン" (T15 §1, pack-local — see file section header for why this isn't
 * an import of skin's buildCoinPoints). An anchor ball plus a handful of
 * sub-points scattered in the plane perpendicular to `normal`, all
 * subsequently scaled to respect `outerRadius` (clampBallsToOuterRadius).
 * 仮決め sizing (no principled derivation, mirrors skin's own 仮決め
 * proportions): anchor r = outerRadius*0.55, sub-point scatter distance and
 * radius both scale with `unitIrregularity`. */
function buildCoinUnitBalls(
  center: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  outerRadius: number,
  params: PackParams,
  rng: () => number,
): Ball[] {
  const subCount = 3 + Math.round(params.unitIrregularity * 5);
  const anchorR = outerRadius * 0.55;
  const balls: Ball[] = [{ id: freshVoidId(), x: center.x, y: center.y, z: center.z, r: anchorR }];
  const { t1, t2 } = tangentBasis(normal.x, normal.y, normal.z);
  for (let s = 0; s < subCount; s++) {
    const theta = rng() * Math.PI * 2;
    const dist = outerRadius * (0.3 + 0.5 * params.unitIrregularity) * (0.4 + 0.6 * rng());
    const x = center.x + (t1[0] * Math.cos(theta) + t2[0] * Math.sin(theta)) * dist;
    const y = center.y + (t1[1] * Math.cos(theta) + t2[1] * Math.sin(theta)) * dist;
    const z = center.z + (t1[2] * Math.cos(theta) + t2[2] * Math.sin(theta)) * dist;
    const subR = outerRadius * (0.15 + 0.25 * rng() * (0.3 + params.unitIrregularity));
    balls.push({ id: freshVoidId(), x, y, z, r: subR });
  }
  return clampBallsToOuterRadius(center, balls, outerRadius);
}

/** "平リング" (T15 §1, pack-local copy of skin's buildFlatRingPoints minus
 * the surface re-projection — see section header). Nodes on a circle of
 * radius `majorR` in the plane perpendicular to `normal`. Same 仮決め formula
 * as skin: outer edge sits at ~outerRadius regardless of holeRatio
 * (majorR+nodeR ≈ outerRadius pre-clamp); a real hole opens once holeRatio
 * exceeds ~0.47. */
function buildFlatRingUnitBalls(
  center: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  outerRadius: number,
  params: PackParams,
  rng: () => number,
): Ball[] {
  const holeRatio = Math.max(0, Math.min(0.95, params.flatRingHoleRatio));
  const majorR = outerRadius * holeRatio;
  const nodeR = Math.max(0.01, outerRadius * (1 - holeRatio) * 0.9);
  const count = Math.max(4, Math.round(params.ringNodeCount));
  const { t1, t2 } = tangentBasis(normal.x, normal.y, normal.z);
  const phase = rng() * Math.PI * 2;
  const balls: Ball[] = [];
  for (let i = 0; i < count; i++) {
    const theta = phase + (i / count) * Math.PI * 2;
    const wobble = 1 + (rng() * 2 - 1) * params.ringWobbleR * 0.3;
    const x = center.x + (t1[0] * Math.cos(theta) + t2[0] * Math.sin(theta)) * majorR;
    const y = center.y + (t1[1] * Math.cos(theta) + t2[1] * Math.sin(theta)) * majorR;
    const z = center.z + (t1[2] * Math.cos(theta) + t2[2] * Math.sin(theta)) * majorR;
    balls.push({ id: freshVoidId(), x, y, z, r: nodeR * wobble });
  }
  return clampBallsToOuterRadius(center, balls, outerRadius);
}

/** "立体リング" (T15 §1): a torus of node balls, generated by S-rings' own
 * `generateRingBalls` (shared, not copied — see section header), centered
 * at the unit's own center (unlike skin's ring3d, which offsets the torus
 * center along the normal to stay tangent to a curved SURFACE — an internal
 * unit has no surface to be tangent to, so the torus is simply centered on
 * the placement point, plane perpendicular to `normal`). `outerRadius` bounds
 * the major radius before the tube radius is added, then
 * clampBallsToOuterRadius enforces the contract exactly (scaling down rather
 * than shrinking the tube, so a too-large `ringTubeR` setting reads as "the
 * whole ring shrinks" rather than "the tube flattens"). */
function buildRing3dUnitBalls(
  center: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  outerRadius: number,
  unitId: number,
  params: PackParams,
  rng: () => number,
): Ball[] {
  const tubeR = Math.min(Math.max(0.01, params.ringTubeR), outerRadius * 0.45);
  const majorR = Math.max(0.02, outerRadius - tubeR * 1.3);
  const recipe: RingRecipe = {
    center,
    axis: normal as Vec3,
    R: majorR,
    n: Math.max(3, Math.round(params.ringNodeCount)),
    r: tubeR,
    wobbleR: params.ringWobbleR,
    wobblePos: params.ringWobblePos,
    seed: `${params.seed}-ring3d-${unitId}`,
  };
  const raw = generateRingBalls(recipe);
  const phase = rng() * Math.PI * 2;
  const balls: Ball[] = raw.map((b) => {
    const p = rotatePoint({ x: b.x, y: b.y, z: b.z }, center, normal as Vec3, phase);
    return { id: freshVoidId(), x: p.x, y: p.y, z: p.z, r: b.r };
  });
  return clampBallsToOuterRadius(center, balls, outerRadius);
}

/**
 * T14: computes a prototype's own bounding sphere from a raw S1 ball list —
 * centroid of ball centers (unweighted) + max(dist(centroid, ball) + ball.r)
 * over all balls. A cheap CONSERVATIVE bound (always contains every ball),
 * not a true minimal enclosing sphere — documented as an approximation in
 * README, consistent with T14's "clearance は粗くてよい" spirit.
 */
export function computePrototypeFromBalls(balls: Ball[], k: number, source?: string): CloudPrototype {
  if (balls.length === 0) throw new Error("空の球リストからは原型を作れません");
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const b of balls) {
    cx += b.x;
    cy += b.y;
    cz += b.z;
  }
  cx /= balls.length;
  cy /= balls.length;
  cz /= balls.length;
  let radius = 0;
  for (const b of balls) {
    const d = Math.hypot(b.x - cx, b.y - cy, b.z - cz) + b.r;
    if (d > radius) radius = d;
  }
  return { balls: balls.map((b) => ({ ...b })), k, center: { x: cx, y: cy, z: cz }, radius: Math.max(radius, 1e-6), source };
}

/**
 * T14: places one unit of the requested kind, circumscribing radius
 * `outerRadius`, centered at `center`. "sphere" -> a single ball (byte-
 * identical to pre-T14 packVoidsGreedy's placement). "cloud" -> either an
 * instanced+scaled+rotated registered prototype (T14 §2, if any are
 * registered — picked uniformly at random per unit, "単位ごとにランダム
 *選択") or a procedurally generated small metaball group (growBalls-style:
 * isotropic random offsets biased toward center, T14 §1).
 */
export function buildUnit(
  kind: UnitKind,
  center: { x: number; y: number; z: number },
  outerRadius: number,
  params: PackParams,
  prototypes: CloudPrototype[],
  rng: () => number,
  /** T15: orientation for coin/flatRing/ring3d, supplied by the caller
   * (grid placement) or omitted (random placement draws an isotropic
   * random one — see UnitKind's doc comment for why). No effect for
   * sphere/cloud. */
  normal?: { x: number; y: number; z: number },
): PackUnit {
  const id = freshUnitId();
  if (kind === "sphere") {
    const ball: Ball = { id: freshVoidId(), x: center.x, y: center.y, z: center.z, r: outerRadius };
    return { id, kind, balls: [ball], localK: 0, center, outerRadius };
  }

  if (kind === "coin" || kind === "flatRing" || kind === "ring3d") {
    const n = normal ?? randomNormal(rng);
    const balls =
      kind === "coin"
        ? buildCoinUnitBalls(center, n, outerRadius, params, rng)
        : kind === "flatRing"
          ? buildFlatRingUnitBalls(center, n, outerRadius, params, rng)
          : buildRing3dUnitBalls(center, n, outerRadius, id, params, rng);
    return { id, kind, balls, localK: params.unitLocalK, center, outerRadius, normal: { ...n } };
  }

  if (prototypes.length > 0) {
    const proto = prototypes[Math.floor(rng() * prototypes.length) % prototypes.length];
    const scale = outerRadius / proto.radius;
    const rotate = randomRotation(rng);
    const balls: Ball[] = proto.balls.map((b) => {
      const local = { x: b.x - proto.center.x, y: b.y - proto.center.y, z: b.z - proto.center.z };
      const rotated = rotate(local);
      return {
        id: freshVoidId(),
        x: center.x + rotated.x * scale,
        y: center.y + rotated.y * scale,
        z: center.z + rotated.z * scale,
        r: b.r * scale,
      };
    });
    return { id, kind: "cloud", balls, localK: proto.k * scale, center, outerRadius };
  }

  // Procedural cloud: same isotropic-offset-with-center-bias shape as
  // cloud-sculpt's growBalls, but scaled to stay within `outerRadius` of
  // `center` (T14 §1's "外接半径" contract) rather than a fixed cluster size.
  const count = Math.max(1, Math.round(params.unitBallsMin + rng() * (params.unitBallsMax - params.unitBallsMin)));
  const balls: Ball[] = [];
  const spread = params.unitRadiusSpread;
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const offsetFrac = Math.pow(rng(), 0.6); // bias toward center, same shape bias as growBalls
    const offset = offsetFrac * outerRadius * 0.62; // margin so a ball's own radius still fits inside outerRadius
    const lx = offset * Math.sin(phi) * Math.cos(theta);
    const ly = offset * Math.sin(phi) * Math.sin(theta);
    const lz = offset * Math.cos(phi);
    const remaining = Math.max(outerRadius - offset, outerRadius * 0.08);
    const baseR = remaining * (0.55 + rng() * 0.35);
    // Clamp to (outerRadius - offset) AFTER applying the spread factor: the
    // circumscribing radius is a CONTRACT (coarse clearance and the
    // penetration=0 closed-shell guarantee both assume no ball pokes past
    // it), so spread may only vary radii downward near the boundary.
    // (Found in verification: without this clamp, spread up to 1.3x let
    // balls overflow the outer sphere by ~0.024 — half the default gap.)
    const r = Math.min(
      Math.max(outerRadius * 0.1, baseR * (1 - spread / 2 + rng() * spread)),
      outerRadius - offset,
    );
    balls.push({ id: freshVoidId(), x: center.x + lx, y: center.y + ly, z: center.z + lz, r });
  }
  return { id, kind: "cloud", balls, localK: params.unitLocalK, center, outerRadius };
}

/**
 * Greedy random packing (T9 §2, T14: units instead of bare balls): sample a
 * point uniformly inside the host's bounding box, reject if outside the
 * host; otherwise the placeable OUTER radius at that point is
 * min(maxR, distance-to-host-surface − gap + penetration, min over existing
 * UNITS(distance-to-unit-center − unit.outerRadius − gap)) — collision is
 * against each existing unit's own circumscribing sphere (T14's coarse
 * clearance contract), never its individual balls. Reject if that radius is
 * below minR. A unit of the configured kind is then built to fill exactly
 * that outer radius (buildUnit).
 */
export function packUnitsGreedy(
  host: Ball[],
  hostK: number,
  existingUnits: PackUnit[],
  params: PackParams,
  prototypes: CloudPrototype[],
): PackResult {
  const units: PackUnit[] = existingUnits.map((u) => ({
    ...u,
    center: { ...u.center },
    balls: u.balls.map((b) => ({ ...b })),
  }));
  if (host.length === 0) {
    return { units, placed: 0, triedAndRejected: 0, stoppedEarly: false };
  }

  const bounds = computeSamplingBounds(host, hostK);
  // T13 (skin's identical fix, T12末尾, T14: keyed on total BALL count so a
  // cloud unit's several balls advance the sequence the same way a sphere
  // unit's single ball does — a bare hashSeed(params.seed) replays the
  // IDENTICAL sample sequence on every "詰める" pass otherwise): folding in
  // the current ball count gives each pack a fresh, still-deterministic
  // sequence; replay safety is unaffected because packUnits records its
  // RESULT, never re-runs the RNG.
  const existingBallCount = flattenUnits(units).length;
  const rng = makeRng(hashSeed(`${params.seed}#${existingBallCount}`));
  const failLimit = Math.max(FAIL_LIMIT_FLOOR, Math.round(params.attempts * 0.3));
  const attempts = Math.max(0, Math.round(params.attempts));

  let placed = 0;
  let rejected = 0;
  let consecutiveFails = 0;
  let stoppedEarly = false;

  for (let i = 0; i < attempts; i++) {
    const x = bounds.min.x + rng() * bounds.size.x;
    const y = bounds.min.y + rng() * bounds.size.y;
    const z = bounds.min.z + rng() * bounds.size.z;

    const dHost = fieldSdf(host, hostK, x, y, z);
    if (dHost >= 0) {
      rejected++;
      consecutiveFails++;
      if (consecutiveFails > failLimit) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    // Host-surface constraint also honors `gap` (T9 §2). See T9 README
    // Observation for why gap must be subtracted here too, not just between
    // units, to keep "食い込み0=閉じた殻" exact.
    let maxR = Math.min(params.maxR, -dHost - params.gap + params.penetration);
    for (const u of units) {
      const d = Math.hypot(x - u.center.x, y - u.center.y, z - u.center.z) - u.outerRadius - params.gap;
      if (d < maxR) maxR = d;
    }

    if (maxR < params.minR) {
      rejected++;
      consecutiveFails++;
      if (consecutiveFails > failLimit) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    const unit = buildUnit(params.unitKind, { x, y, z }, maxR, params, prototypes, rng);
    units.push(unit);
    placed++;
    consecutiveFails = 0;
  }

  return { units, placed, triedAndRejected: rejected, stoppedEarly };
}

const AXES: GridAxis[] = ["x", "y", "z"];
function axisVector(axis: GridAxis): { x: number; y: number; z: number } {
  return axis === "x" ? { x: 1, y: 0, z: 0 } : axis === "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
}
function nextAxis(axis: GridAxis): GridAxis {
  return AXES[(AXES.indexOf(axis) + 1) % AXES.length];
}

// Safety cap on how many lattice points packUnitsGrid will ever iterate,
// independent of `attempts` (grid has no attempts knob — spacing alone
// determines candidate count, which can explode for a small spacing over a
// large host). 仮決め, not from the task doc, purely to keep the browser
// responsive; documented in README. Hitting it sets stoppedEarly=true, same
// honesty convention as packUnitsGreedy's FAIL_LIMIT.
const GRID_POINT_CAP = 40000;

/**
 * T15 §2: grid placement — sample the cubic lattice itself (not random
 * points), keep only points whose PLACED UNIT's outer sphere fits inside the
 * host (with the same `gap`/`penetration` convention packUnitsGreedy already
 * uses for its surface constraint), and orient coin/flatRing/ring3d units by
 * `gridAxis` (optionally alternating per Z-layer, `gridAlternate`).
 *
 * **Layer convention (仮決め, not specified by the task doc)**: 千鳥 (stagger)
 * and 層ごとに交互 (alternate) both index "layer" by the Z lattice index —
 * i.e. layers stack along world Z regardless of `gridAxis` (which only
 * controls unit ORIENTATION, not which axis the lattice is layered along).
 * This keeps one unambiguous meaning for "layer" instead of a second knob
 * for "which axis is vertical".
 *
 * **Unit size at ばらし=0**: derived from `gridSpacing` and `gap`, NOT from
 * minR/maxR (T15 §2 lists only 間隔・千鳥・向き・ばらし as grid's knobs — no
 * separate size range). `baseRadius = spacing/2 − gap/2`, so two
 * face-adjacent lattice neighbors (distance = spacing apart) keep exactly
 * `gap` of clearance between their outer spheres at ばらし=0 — reusing `gap`
 * ties the two placement modes to the same "骨の最小太さ" vocabulary rather
 * than inventing a grid-only size knob.
 *
 * **ばらし (T15's central knob, H1 UI)**: at 0, every accepted lattice point
 * places a unit at EXACTLY its lattice position, EXACTLY `gridAxis`-oriented,
 * EXACTLY `baseRadius` — a perfectly deterministic, perfectly regular
 * result (完了条件2). As it rises to 1: (a) position jitters by up to
 * `±0.35·gridScatter·spacing` per axis, (b) radius jitters by up to
 * `±0.35·gridScatter·baseRadius` (clamped to [0.35,1.4]×baseRadius so units
 * never vanish or balloon absurdly), (c) orientation is a linear blend
 * between the grid axis vector and a fresh isotropic random vector
 * (`normalize(lerp(axisVec, randomVec, gridScatter))`) — NOT a discrete
 * on/off switch to full randomness, so 完了条件3's "連続に効く" holds for
 * position, size, AND rotation simultaneously, not just one of the three.
 * At ばらし=1 the lattice POSITIONS themselves are still on-grid (only
 * jittered by ~0.35·spacing, not fully re-randomized to a Poisson-disc-like
 * distribution) — this is an honest limitation, not "true" random packing:
 * documented in README as "ばらし1は隣接構造をなお引きずる、真の貪欲詰めと
 * 完全一致はしない" (see also Next).
 *
 * Determinism (T15's explicit requirement "グリッドも決定的（シード×ば
 * らし）"): the RNG is seeded from `${seed}#grid#${existingBallCount}` (same
 * "fold in current content" convention packUnitsGreedy already uses for its
 * own continuation safety) and consumed in a FIXED order per lattice point
 * (position jitter × 3, then radius jitter, then orientation draw, then
 * whatever buildUnit itself consumes) — same seed + same params always
 * reproduces the same units, scatter included.
 */
export function packUnitsGrid(
  host: Ball[],
  hostK: number,
  existingUnits: PackUnit[],
  params: PackParams,
  prototypes: CloudPrototype[],
): PackResult {
  const units: PackUnit[] = existingUnits.map((u) => ({
    ...u,
    center: { ...u.center },
    balls: u.balls.map((b) => ({ ...b })),
    normal: u.normal ? { ...u.normal } : undefined,
  }));
  if (host.length === 0) {
    return { units, placed: 0, triedAndRejected: 0, stoppedEarly: false };
  }

  const bounds = computeSamplingBounds(host, hostK);
  const spacing = Math.max(0.02, params.gridSpacing);
  const gap = params.gap;
  const baseRadius = Math.max(0.01, spacing / 2 - gap / 2);
  const scatter = Math.max(0, Math.min(1, params.gridScatter));

  const existingBallCount = flattenUnits(units).length;
  const rng = makeRng(hashSeed(`${params.seed}#grid#${existingBallCount}`));

  const nx = Math.max(1, Math.ceil(bounds.size.x / spacing) + 1);
  const ny = Math.max(1, Math.ceil(bounds.size.y / spacing) + 1);
  const nz = Math.max(1, Math.ceil(bounds.size.z / spacing) + 1);

  let placed = 0;
  let rejected = 0;
  let stoppedEarly = false;
  let visited = 0;

  outer: for (let k = 0; k <= nz; k++) {
    const layerOdd = k % 2 !== 0;
    const stagger = params.gridStagger && layerOdd;
    const axis: GridAxis = params.gridAlternate ? (layerOdd ? nextAxis(params.gridAxis) : params.gridAxis) : params.gridAxis;
    const axisVec = axisVector(axis);
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        visited++;
        if (visited > GRID_POINT_CAP) {
          stoppedEarly = true;
          break outer;
        }
        const gx = bounds.min.x + i * spacing + (stagger ? spacing / 2 : 0);
        const gy = bounds.min.y + j * spacing + (stagger ? spacing / 2 : 0);
        const gz = bounds.min.z + k * spacing;

        let px = gx;
        let py = gy;
        let pz = gz;
        if (scatter > 0) {
          px += (rng() - 0.5) * scatter * spacing * 0.7;
          py += (rng() - 0.5) * scatter * spacing * 0.7;
          pz += (rng() - 0.5) * scatter * spacing * 0.7;
        }

        const dHost = fieldSdf(host, hostK, px, py, pz);
        if (dHost >= 0) {
          rejected++;
          continue;
        }

        let r = baseRadius;
        if (scatter > 0) {
          r = baseRadius * (1 + (rng() - 0.5) * scatter * 0.7);
          r = Math.max(baseRadius * 0.35, Math.min(baseRadius * 1.4, r));
        }

        // Outer-sphere-fits-the-host test, same convention as packUnitsGreedy's
        // surface constraint (gap subtracted, penetration allowance added).
        let maxAllowed = -dHost - gap + params.penetration;
        for (const u of units) {
          const d = Math.hypot(px - u.center.x, py - u.center.y, pz - u.center.z) - u.outerRadius - gap;
          if (d < maxAllowed) maxAllowed = d;
        }
        if (maxAllowed < r) {
          rejected++;
          continue;
        }

        let normal = axisVec;
        if (scatter > 0) {
          const rand = randomNormal(rng);
          const bx = axisVec.x * (1 - scatter) + rand.x * scatter;
          const by = axisVec.y * (1 - scatter) + rand.y * scatter;
          const bz = axisVec.z * (1 - scatter) + rand.z * scatter;
          const blen = Math.hypot(bx, by, bz) || 1;
          normal = { x: bx / blen, y: by / blen, z: bz / blen };
        }

        const unit = buildUnit(params.unitKind, { x: px, y: py, z: pz }, r, params, prototypes, rng, normal);
        units.push(unit);
        placed++;
      }
    }
  }

  return { units, placed, triedAndRejected: rejected, stoppedEarly };
}

// --- Gauges (計器・正直さ) ---------------------------------------------------

export interface ThinnestWallReport {
  /** Estimated thinnest remaining material, in field units. Clamped to >= 0 for
   * display; null when there are no units yet (nothing to measure between). */
  value: number | null;
  /** True if any measured gap was <= 0 -- i.e. an opening already exists
   * (a unit reached the host surface, or two units have fused). */
  hasOpening: boolean;
}

/**
 * "最薄の肉の推定" (T9 §3, T14: unit-level). T14 switches this from
 * per-BALL sampling to per-UNIT (center, outerRadius) sampling on purpose:
 * this is the SAME coarse proxy `packUnitsGreedy`'s own clearance check
 * used, so the gauge honestly reports the approximation the algorithm
 * actually relied on — sampling individual cloud balls instead would read
 * as a TIGHTER (more optimistic) number than what packing ever enforced,
 * which would be dishonest in the other direction. For "sphere" kind units
 * (outerRadius == the one ball's own radius, center == its own center) this
 * is numerically IDENTICAL to the pre-T14 per-ball computation — sphere mode
 * stays unregressed. Still just two cheap proxies, not a rigorous
 * medial-axis computation ("厳密でなくてよい" per the task doc):
 *  - unit-to-host-surface: -hostSdf(unit.center) - unit.outerRadius
 *  - unit-to-unit: center distance − outerRadius sum
 * The true thinnest point of the actual isosurface can be thinner than this
 * — a conservative *estimate*, not a guarantee (AGENTS §6 "正直な計算").
 */
export function estimateThinnestWall(host: Ball[], hostK: number, units: PackUnit[]): ThinnestWallReport {
  if (units.length === 0) return { value: null, hasOpening: false };
  let minVal = Infinity;
  for (const u of units) {
    const dHost = fieldSdf(host, hostK, u.center.x, u.center.y, u.center.z); // negative = inside host
    const shellHere = -dHost - u.outerRadius;
    minVal = Math.min(minVal, shellHere);
  }
  if (units.length >= 2) {
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];
        const gap = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y, a.center.z - b.center.z) - a.outerRadius - b.outerRadius;
        minVal = Math.min(minVal, gap);
      }
    }
  }
  return { value: Math.max(0, minVal), hasOpening: minVal <= 0 };
}

export interface FillReport {
  /** voidVolumeSum / hostVolumeEstimate. Can read > 1 if voids overlap heavily
   * (their volumes are summed independently, not de-duplicated by the union). */
  fillRatio: number;
  hostVolumeEstimate: number;
  voidVolumeSum: number;
}

/**
 * "充填率" (T9 §3): Monte Carlo estimate of the host's volume against the
 * sum of void ball volumes. T14: deliberately STAYS at ball-level (every
 * constituent ball of every unit, 4/3 π r³ each) rather than switching to
 * unit outer-sphere volume like estimateThinnestWall did — a cloud unit's
 * balls occupy only a fraction of its own circumscribing sphere, so using
 * the outer sphere here would badly OVERSTATE filled material. Different
 * gauges, different honest proxy for each: thinnest-wall reports the
 * clearance the packer actually enforced (outer sphere); fill ratio reports
 * an estimate of actual material (constituent balls). Not de-duplicated for
 * overlap either way — a known over-estimate when units touch, documented
 * rather than hidden per AGENTS §6.
 */
export function estimateFillRatio(
  host: Ball[],
  hostK: number,
  units: PackUnit[],
  sampleCount = 4000,
  seed = "pack-fill-probe",
): FillReport {
  if (host.length === 0) return { fillRatio: 0, hostVolumeEstimate: 0, voidVolumeSum: 0 };
  const bounds = computeSamplingBounds(host, hostK);
  const bboxVolume = bounds.size.x * bounds.size.y * bounds.size.z;
  const rng = makeRng(hashSeed(seed));
  let inside = 0;
  for (let i = 0; i < sampleCount; i++) {
    const x = bounds.min.x + rng() * bounds.size.x;
    const y = bounds.min.y + rng() * bounds.size.y;
    const z = bounds.min.z + rng() * bounds.size.z;
    if (fieldSdf(host, hostK, x, y, z) < 0) inside++;
  }
  const hostVolumeEstimate = bboxVolume * (inside / sampleCount);
  const voidVolumeSum = flattenUnits(units).reduce((sum, v) => sum + (4 / 3) * Math.PI * v.r ** 3, 0);
  const fillRatio = hostVolumeEstimate > 0 ? voidVolumeSum / hostVolumeEstimate : 0;
  return { fillRatio, hostVolumeEstimate, voidVolumeSum };
}

export type { Ball, FieldParams };

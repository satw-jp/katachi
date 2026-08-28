// ---------------------------------------------------------------------------
// S-skin's field: host (S1 ball list + k, imported not copied) + a shell
// carved from it + patches (irregular blobs glued to the shell's surface).
// RESEARCH.md v5 "Y7 表面版" (作者の言葉):
// "ある形態の表面にランダムな閉じた平面形状をパッキングする"
// "平面形状が実体で形態が虚になることもあればその逆もある"
//
// Shell: shellSdf(p) = |hostSdf(p)| - thickness/2 (negative = inside the
// thin shell band around the host's zero surface). T10 §1.
//
// Patch: NOT a true circle. An anchor point on the surface plus a handful of
// "副点" (sub-points) scattered in the anchor's local tangent plane and
// re-projected back onto the surface, all blended with the SAME smooth-min
// formula cloud-sculpt's fieldSdf already uses for balls -- i.e. a patch is
// structurally just another Ball[] (T10 §1's "2Dメタボールの表面版"), so no
// new distance-field math is invented; only the *placement* is new (points
// live near a curved surface instead of scattered in open space). Multiple
// patches are unioned into one flat point list and smooth-min'd together
// with a single roundK, exactly mirroring pack/field.ts's reuse of one
// roundness knob for both intra-group blending and the boolean op with the
// host (仮決め, documented in README "実装メモ", same precedent as T9).
//
// Composite (T10 §1, "この Study の眼目"):
//   plate (プレートが実) = shell ∩ patches  -> opSmoothIntersection(dShell, dPatch, k)
//   window (形態が実)    = shell − patches  -> opSmoothSubtraction(dPatch, dShell, k)
// Both formulas are Inigo Quilez's smooth boolean ops
// (https://iquilezles.org/articles/distfunctions/), written out locally
// (not imported from pack/field.ts) so this Study stays self-contained --
// same choice pack made relative to foam.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "../cloud-sculpt/field.ts";
import { fieldSdf, smoothMin } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
// T11 "S-rings のコードの共有を最大限": the 3D ring's node geometry is the
// literal S-rings ball-chain generator, not a reimplementation. rotatePoint
// is reused to give each ring a random phase around its own axis (T11 §1
// "法線まわりの回転はランダム" -- generateRingBalls's own basis is
// deterministic from the axis alone, so the phase freedom is applied as a
// post-rotation instead).
import { generateRingBalls, rotatePoint } from "../rings/ring.ts";
import type { RingRecipe, Vec3 } from "../rings/ring.ts";
import { createFlowerFormComponents } from "../flower-packing-spike/flowerForm.ts";
import type { FlowerPetalCount } from "../flower-packing-spike/flowerForm.ts";
import {
  normalizePackingMotif,
  PACKING_MOTIF_PRESETS,
} from "../flower-packing-spike/packing.ts";

export type SkinMode = "plate" | "window";
/** T11 §1: コイン(現状無変更) / 平リング(内孔率つまみ、窓モードでO字窓) /
 * 立体リング(S-rings 語彙 = 節のある球の鎖、表面に接するトーラス). All three
 * remain structurally "just another Ball[]" (see file header) -- only how
 * the points are laid out around the anchor differs. */
export type PatchShape = "coin" | "flatRing" | "ring3d" | "flower";
export type SurfaceGenerationMode = "randomPack" | "quadFlow" | "voronoi" | "goldberg";
export type MotifPlacement = "surface" | "center" | "inside";
export type QuadTilingMode = "regular" | "varied" | "field";
export type QuadConnectionMode = "separate" | "local";
export type FlowerMotifPresetId = "four-core" | "six-core" | "ten-ring" | "twelve-core" | "custom";
export type FlowerConnectionMode = "separate" | "fused" | "direct";
export type ContactReinforcementMode = "localPoints" | "wholeMotif";
export type InternalStructureMode = "none" | "targetedGrid" | "voronoiEdge";

export interface PatchPoint {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Flower-only provenance. Old recipes and non-flower points omit this.
   * `bridge` points form the authored flower-to-flower connection network. */
  role?: "motif" | "bridge" | "surfaceConnector";
  /** Flower-only realized radii. PACK-SPIKE's lace shell expands every
   * component by a shared local fusion radius; storing both values keeps
   * Pack replay and mode changes idempotent. */
  baseR?: number;
  /** The PACK-SPIKE-proportional expansion at flowerExpansion=1. Kept
   * separately from the realized fusionR so changing the slider never
   * compounds a previous expansion. */
  fusionBaseR?: number;
  fusionR?: number;
  /** Extra realized width reserved for a mesh-resolvable QUAD connection.
   * Old recipes omit it; mesh export can non-destructively supply the live
   * `quadMeshJoinWidth` difference without changing the input history. */
  meshJoinR?: number;
  /** Extra local radius added by the post-pack contact reinforcement pass.
   * Kept separate from fusionR/meshJoinR so the authored motif and QUAD
   * connection provenance remain readable and recipe replay stays exact. */
  contactR?: number;
  /** Uniform whole-motif scale added by contact reinforcement. The same
   * dimensionless value is stored on every editable point so recipes can
   * replay the realized expansion without inferring it again. */
  contactScale?: number;
  /** ring3d-only provenance. New ring recipes mark their authored recipe
   * nodes and the continuity connectors separately. Old recipes omit this
   * field and remain literal realized point arrays on replay. */
  ringPrimary?: boolean;
}

export interface Patch {
  id: number;
  shape: PatchShape;
  /** Per-element placement relative to the host. Legacy patches omit it and
   * are interpreted as `surface`. */
  motifPlacement?: MotifPlacement;
  /** Authored centerline diameter for an individually resized ring3d.
   * Older/generated patches omit it and derive a display value from their
   * realized primary nodes. It does not change flat rings or other motifs. */
  ringDiameter?: number;
  /** QUAD-FLOW provenance. Old recipes and ordinary PACK patches omit it. */
  quadCellId?: number;
  surfaceCellId?: number;
  surfaceCellKind?: "quad" | "voronoi" | "goldberg" | "lace";
  /** Shape-only authoring values used to create this individual motif.
   * Optional for legacy recipes; new generation paths always capture it so
   * one selected flower/ring/coin can be inspected and regenerated without
   * repacking its neighbours. */
  motifParams?: MotifShapeParams;
  /** For solid "coin" patches, points[0] is the anchor and the rest are the
   * "副点" scattered around it. A coin with coinHoleRatio>0 is instead an
   * annular cyclic point set with no distinguished anchor. For flatRing/
   * ring3d, every point is likewise a ring node. ring3d's
   * `ringNodeCount` is the authored primary-node count; its realized array
   * may also contain interleaved continuity connectors. */
  points: PatchPoint[];
}

export interface MotifShapeParams {
  irregularity: number;
  /** Optional only so recipes saved before v0.47 replay as the historical
   * solid coin. New captures always write an explicit value. */
  coinHoleRatio?: number;
  flatRingHoleRatio: number;
  ringNodeCount: number;
  ringTubeR: number;
  ringWobbleR: number;
  ringWobblePos: number;
  flowerMotifPreset: FlowerMotifPresetId;
  flowerPetalCount: FlowerPetalCount;
  flowerShowCore: boolean;
  flowerOpening: number;
  flowerNeck: number;
  flowerCoreSize: number;
  flowerCupping: number;
  flowerCoreLift: number;
  flowerGrowthDifference: number;
  flowerExpansion: number;
}

export interface SkinParams {
  /** Shell band half-width * 2 (T10 §1: "|hostSdf| < 厚み/2 の層"). Also the
   * plate's physical thickness in plate mode -- same knob, two readings. */
  thickness: number;
  /** Smallest allowed anchor (patch) radius. */
  minR: number;
  /** Largest allowed anchor (patch) radius -- the packing's size cap. */
  maxR: number;
  /** 0..1 "形の不揃い" -- how many sub-points a patch gets and how far/how
   * differently-sized they scatter around the anchor. 0 reads closest to a
   * disk (still not exactly circular, because there is always >= 1 sub-point). */
  irregularity: number;
  /** Minimum clearance kept between DIFFERENT patches' points -- the 目地
   * (T10 §2). Within one patch, points are meant to fuse (no gap enforced).
   * T11 §2 adds a NEGATIVE side ("重なり許容"): a negative gap is subtracted
   * the same way a positive one is (clearance - gap), so a negative value
   * simply *enlarges* the radius/room a new patch is allowed, letting
   * patches overlap on purpose -- the mechanism a ring's tube needs to pass
   * through a neighboring ring's hole is exactly this permitted overlap,
   * nothing new was added to the formula, only the UI range was widened. */
  gap: number;
  /** Sample-point trials for one "詰める" pass. */
  attempts: number;
  seed: string;
  /** Roundness of the patch-point union AND of the shell/patch boolean (see
   * file header "仮決め" -- one knob reused, precedent from pack/field.ts). */
  roundK: number;
  /** T11 §1: which shape newly packed/manually-added patches take. */
  patchShape: PatchShape;
  /** Placement of a newly generated motif envelope relative to the host's
   * projected zero surface. `surface` preserves every historical generator;
   * `center` centers the envelope across that surface; `inside` moves its
   * outermost extent just beneath the surface. */
  motifPlacement: MotifPlacement;
  /** Current authored surface principle. randomPack is the preserved v0.19
   * path; quadFlow is an additive experimental all-quad path. */
  surfaceGenerationMode: SurfaceGenerationMode;
  /** Number of quads along each cube face edge (total=6*n*n before any
   * honest projection failures). */
  quadDivisions: number;
  /** QUAD-FLOW cell layout. `varied` keeps the closed all-quad cube topology
   * but deterministically varies interval widths on the three cube axes. */
  quadTilingMode: QuadTilingMode;
  /** 0..0.45 deterministic size variation for `quadTilingMode=varied`. */
  quadSizeVariation: number;
  /** 0..1 attraction of the closed quad vertices toward locally higher
   * normal variation. This changes density, not principal-direction alignment. */
  quadCurvatureAttraction: number;
  /** Whether motifs in cells sharing an edge stay separate or meet by
   * enlarging only the closest realized sphere pair. Applies to every shape. */
  quadConnectionMode: QuadConnectionMode;
  /** Additional overlap after first contact, relative to the shared edge. */
  quadConnectionDepth: number;
  /** Minimum additional radius on the spheres that own a QUAD shared-edge
   * connection. This is geometry, not a printer guarantee. */
  quadMeshJoinWidth: number;
  /** Approximate spherical-CVT seed count and Lloyd relaxation passes. */
  voronoiSeedCount: number;
  voronoiRelaxationSteps: number;
  /** Subdivision frequency of the icosahedral Goldberg dual prototype.
   * Site count is 10*f^2+2, with exactly 12 pentavalent sites. */
  goldbergFrequency: number;
  /** Number of deterministic largest-gap passes in the optional lace-fill
   * post process. This is independent of the primary surface organization. */
  lacePasses: number;
  /** Placement used only by motifs added in the later largest-gap passes.
   * Kept separate from `motifPlacement` so the primary field can stay on the
   * surface while gap-fill motifs straddle or sit inside it. */
  laceMotifPlacement: MotifPlacement;
  /** Smallest motif band relative to minR/maxR on the final lace pass. */
  laceMinScale: number;
  /** Clearance deliberately retained between added motifs. Negative values
   * permit contact/overlap, using the same sign convention as `gap`. */
  laceGap: number;
  /** Desired number of distinct neighbouring motifs in the contact proxy. */
  contactTarget: number;
  /** Maximum radius added to any one realized sphere by local contact
   * reinforcement. This is a geometry cap, not a strength guarantee. */
  contactMaxGrowth: number;
  /** Small overlap requested after first contact for a reinforced pair. */
  contactOverlap: number;
  /** Keep the historical closest-point thickening, or enlarge each weak
   * flower/coin/ring as one motif about its editable-point centroid. */
  contactReinforcementMode: ContactReinforcementMode;
  /** Maximum whole-motif enlargement above 1.0. For example 0.15 = 115%. */
  contactWholeScaleMax: number;
  /** PACK-SPIKE / MOTIF ON SURFACE preset used for newly generated flower
   * patches. The realized spheres are stored in each Patch, so replay never
   * depends on re-running the motif generator. */
  flowerMotifPreset: FlowerMotifPresetId;
  /** Customizable PACK-SPIKE flower definition. Presets simply write these
   * same parameters, so history/replay has one source of truth. */
  flowerPetalCount: FlowerPetalCount;
  flowerShowCore: boolean;
  flowerOpening: number;
  flowerNeck: number;
  flowerCoreSize: number;
  flowerCupping: number;
  flowerCoreLift: number;
  flowerGrowthDifference: number;
  /** Multiplier for the automatically derived common surface expansion.
   * 1 = minimum connected reference, 0 = no expansion, >1 = fuller fusion. */
  flowerExpansion: number;
  /** How a newly packed flower field is authored. `separate` preserves the
   * v0.16 behavior; `direct` writes a minimum connection network into the
   * realized PatchPoint geometry, so replay never has to infer it again. */
  flowerConnectionMode: FlowerConnectionMode;
  /** Coin only: requested central opening relative to the authored outer
   * radius. 0 preserves the historical filled/scattered coin exactly;
   * toward 0.95 leaves a thin continuous outer rim. The generator retains
   * MIN_SUBPOINT_R, so the maximum is a printable-width rim rather than an
   * impossible zero-width mathematical circle. */
  coinHoleRatio: number;
  /** 平リング (flatRing) only: 0 = no hole (reads as a coin), toward 0.9 =
   * thin ring with a real hole. See buildFlatRingPoints for the exact
   * geometry (仮決め formula documented there). */
  flatRingHoleRatio: number;
  /** flatRing/ring3d: number of nodes (balls) around the ring -- same
   * meaning as S-rings' RingRecipe.n. */
  ringNodeCount: number;
  /** ring3d only: tube (node ball) radius -- same meaning as S-rings'
   * RingRecipe.r. Also sets how far the ring's plane is offset from the
   * anchor along the surface normal, so the torus is tangent to the host
   * surface along one circle (see buildRing3dPoints). */
  ringTubeR: number;
  /** ring3d/flatRing: fractional jitter of node ball radius -- same meaning
   * as S-rings' RingRecipe.wobbleR ("均質な輪は死ぬ", T8). */
  ringWobbleR: number;
  /** ring3d only: fractional jitter of node position -- S-rings'
   * RingRecipe.wobblePos. flatRing nodes are re-projected onto the surface
   * instead, so position wobble does not apply there. */
  ringWobblePos: number;
  /** T14 coin-bulge experiment (作者Observation 2026-07-20 "コイン部分が
   * 平べったくなっている...ふっくらとして...サポートが不要な形になっている
   * と自然になりそう" -- a HYPOTHESIS, not a settled conclusion, see
   * compositeSdf's doc comment). Additional shell half-width applied ONLY to
   * "coin"-shape patches in plate mode: instead of clipping a coin to the
   * normal thin shell band (thickness/2), it is clipped to a wider band
   * (thickness/2 + coinBulge), letting the coin's own round point geometry
   * push outward on both sides of the host surface up to that new limit --
   * never wider than the coin's raw (unclipped) field. Default 0 keeps the
   * exact old shell-clip formula (see compositeSdf's coinBulge<=0 branch:
   * NOT merely "coinBulge=0 happens to produce the same number", but a
   * literal old-code-path branch, since smooth booleans are not
   * distributive and splitting unconditionally could silently perturb
   * historic recipes by a hair). flatRing/ring3d/window-mode are entirely
   * unaffected by this value. */
  coinBulge: number;
  /** Coin only, plate mode: distributes `coinBulge` across the host surface.
   * -1 = back/inside only, 0 = historical equal front+back, +1 =
   * front/outside only. Front is positive host SDF (the exterior); back is
   * negative host SDF (the interior). This changes only the clipping band,
   * never the authored coin points or outer diameter. */
  coinBulgeBalance: number;
  /** Internal structures are a second layer under Surface, never a patch
   * generation mode. `none` preserves every pre-existing SKIN result. */
  internalStructure: InternalStructureMode;
  /** Requested number of sites in the bounded 3D Voronoi construction. */
  internalDensity: number;
  /** Constant node/edge radius in SKIN model units. */
  internalRadius: number;
  /** 0..1 jitter of the otherwise even interior site lattice. */
  internalRandomness: number;
  /** Dry Web artwork-integration screen: independent graph contact sites
   * required per Surface Pattern (legacy recipes omit this and read as 3). */
  dryWebRequiredContacts?: number;
}

export const DEFAULT_SKIN_PARAMS: SkinParams = {
  thickness: 0.12,
  minR: 0.12,
  maxR: 0.32,
  irregularity: 0.5,
  gap: 0.05,
  attempts: 500,
  seed: "yohaku-skin",
  roundK: 0.05,
  patchShape: "coin",
  motifPlacement: "surface",
  surfaceGenerationMode: "randomPack",
  quadDivisions: 4,
  quadTilingMode: "regular",
  quadSizeVariation: 0.28,
  quadCurvatureAttraction: 0.35,
  quadConnectionMode: "local",
  quadConnectionDepth: 0.25,
  quadMeshJoinWidth: 0.12,
  voronoiSeedCount: 150,
  voronoiRelaxationSteps: 2,
  goldbergFrequency: 3,
  lacePasses: 3,
  laceMotifPlacement: "surface",
  laceMinScale: 0.45,
  laceGap: 0.025,
  contactTarget: 3,
  contactMaxGrowth: 0.08,
  contactOverlap: 0.01,
  contactReinforcementMode: "localPoints",
  contactWholeScaleMax: 0.15,
  flowerMotifPreset: "six-core",
  flowerPetalCount: 6,
  flowerShowCore: true,
  flowerOpening: 0.93,
  flowerNeck: 0.36,
  flowerCoreSize: 0.57,
  flowerCupping: 0.32,
  flowerCoreLift: 0,
  flowerGrowthDifference: 0,
  flowerExpansion: 1,
  flowerConnectionMode: "separate",
  coinHoleRatio: 0,
  flatRingHoleRatio: 0.6,
  ringNodeCount: 10,
  ringTubeR: 0.06,
  ringWobbleR: 0.3,
  ringWobblePos: 0.15,
  coinBulge: 0,
  coinBulgeBalance: 0,
  internalStructure: "none",
  internalDensity: 28,
  internalRadius: 0.045,
  internalRandomness: 0.65,
  dryWebRequiredContacts: 3,
};

export function captureMotifShapeParams(params: SkinParams): MotifShapeParams {
  return {
    irregularity: params.irregularity,
    coinHoleRatio: params.coinHoleRatio,
    flatRingHoleRatio: params.flatRingHoleRatio,
    ringNodeCount: params.ringNodeCount,
    ringTubeR: params.ringTubeR,
    ringWobbleR: params.ringWobbleR,
    ringWobblePos: params.ringWobblePos,
    flowerMotifPreset: params.flowerMotifPreset,
    flowerPetalCount: params.flowerPetalCount,
    flowerShowCore: params.flowerShowCore,
    flowerOpening: params.flowerOpening,
    flowerNeck: params.flowerNeck,
    flowerCoreSize: params.flowerCoreSize,
    flowerCupping: params.flowerCupping,
    flowerCoreLift: params.flowerCoreLift,
    flowerGrowthDifference: params.flowerGrowthDifference,
    flowerExpansion: params.flowerExpansion,
  };
}

let nextPatchId = 1;
export function freshPatchId(): number {
  return nextPatchId++;
}
export function currentPatchIdCounter(): number {
  return nextPatchId;
}
export function resetPatchIdCounter(startAt = 1): void {
  nextPatchId = startAt;
}

// --- Boolean ops (Quilez, see file header) ---------------------------------

export function opSmoothSubtraction(d1: number, d2: number, k: number): number {
  if (k <= 0) return Math.max(-d1, d2);
  const h = Math.max(0, Math.min(1, 0.5 - (0.5 * (d2 + d1)) / k));
  return d2 * (1 - h) + -d1 * h + k * h * (1 - h);
}

export function opSmoothIntersection(d1: number, d2: number, k: number): number {
  if (k <= 0) return Math.max(d1, d2);
  const h = Math.max(0, Math.min(1, 0.5 - (0.5 * (d2 - d1)) / k));
  return d2 * (1 - h) + d1 * h + k * h * (1 - h);
}

// --- Shell / patch fields ----------------------------------------------------

/** |hostSdf(p)| - halfWidth. Negative = inside a band of that half-width
 * around the host's zero surface. shellSdf (below) is the thickness/2 case;
 * T14's coinBulge>0 path uses this directly with a WIDER half-width for
 * coin-shape patches only, without touching shellSdf's own contract. */
export function hostBandSdf(
  host: Ball[],
  hostK: number,
  halfWidth: number,
  x: number,
  y: number,
  z: number,
): number {
  return Math.abs(fieldSdf(host, hostK, x, y, z)) - halfWidth;
}

export interface CoinBulgeSides {
  front: number;
  back: number;
}

/** Split one bulge amount without increasing its historical maximum extent.
 * Balance 0 is exactly the old symmetric `coinBulge` interpretation. */
export function coinBulgeSides(coinBulge: number, balance: number): CoinBulgeSides {
  const amount = Math.max(0, coinBulge);
  const clamped = Math.max(-1, Math.min(1, balance));
  return clamped >= 0
    ? { front: amount, back: amount * (1 - clamped) }
    : { front: amount * (1 + clamped), back: amount };
}

/** Asymmetric band around the host zero surface. `frontHalfWidth` follows
 * positive host SDF (outside), `backHalfWidth` follows negative host SDF
 * (inside). Equal widths reduce to `abs(hostSdf)-width`. */
export function asymmetricHostBandSdf(
  host: Ball[],
  hostK: number,
  frontHalfWidth: number,
  backHalfWidth: number,
  x: number,
  y: number,
  z: number,
): number {
  const hostDistance = fieldSdf(host, hostK, x, y, z);
  return Math.max(hostDistance - frontHalfWidth, -hostDistance - backHalfWidth);
}

/** |hostSdf(p)| - thickness/2. Negative = inside the thin shell band. */
export function shellSdf(
  host: Ball[],
  hostK: number,
  thickness: number,
  x: number,
  y: number,
  z: number,
): number {
  return hostBandSdf(host, hostK, thickness / 2, x, y, z);
}

/** Flatten every patch's points into one smooth-min union (a patch is just a
 * Ball[] without ids -- see file header). Empty patch list -> "nothing here"
 * (large positive, same convention fieldSdf uses for an empty ball list). */
export function patchesSdf(patches: Patch[], roundK: number, x: number, y: number, z: number): number {
  let first: PatchPoint | null = null;
  let d = 1e5;
  for (const patch of patches) {
    for (const pt of patch.points) {
      const bd = Math.hypot(x - pt.x, y - pt.y, z - pt.z) - pt.r;
      if (first === null) {
        d = bd;
        first = pt;
      } else {
        d = smoothMin(d, bd, roundK);
      }
    }
  }
  return first === null ? 1e5 : d;
}

/** Compile immutable realized points into contiguous numeric buffers for
 * voxel sampling. Point order and the polynomial smooth-min sequence stay
 * identical to patchesSdf; only nested object/property work is removed. */
function createPatchesSdfEvaluator(
  patches: readonly Patch[],
  roundK: number,
): (x: number, y: number, z: number) => number {
  const count = patches.reduce((sum, patch) => sum + patch.points.length, 0);
  if (count === 0) return () => 1e5;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const zs = new Float64Array(count);
  const radii = new Float64Array(count);
  let cursor = 0;
  for (const patch of patches) {
    for (const point of patch.points) {
      xs[cursor] = point.x;
      ys[cursor] = point.y;
      zs[cursor] = point.z;
      radii[cursor] = point.r;
      cursor++;
    }
  }
  if (roundK <= 0) {
    return (x, y, z) => {
      let distance = 1e5;
      for (let index = 0; index < count; index++) {
        const dx = x - xs[index];
        const dy = y - ys[index];
        const dz = z - zs[index];
        distance = Math.min(distance, Math.sqrt(dx * dx + dy * dy + dz * dz) - radii[index]);
      }
      return distance;
    };
  }
  return (x, y, z) => {
    let dx = x - xs[0];
    let dy = y - ys[0];
    let dz = z - zs[0];
    let distance = Math.sqrt(dx * dx + dy * dy + dz * dz) - radii[0];
    for (let index = 1; index < count; index++) {
      dx = x - xs[index];
      dy = y - ys[index];
      dz = z - zs[index];
      const candidate = Math.sqrt(dx * dx + dy * dy + dz * dz) - radii[index];
      const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (candidate - distance)) / roundK));
      distance = candidate * (1 - h) + distance * h - roundK * h * (1 - h);
    }
    return distance;
  };
}

/** The whole composite field, mode-dependent (T10 §1's "眼目" -- same
 * host+patches, two different booleans).
 *
 * T11 §1 splits plate mode by shape: "コイン" and "平リング" stay flush with
 * the surface (intersected with the thin shell band, exactly T10's
 * behavior -- unchanged when every patch is a coin, satisfying 無退行), but
 * "立体リング" patches are full 3D objects that only *touch* the surface
 * along one circle (buildRing3dPoints) -- clipping them to the shell band
 * would slice away almost the whole ring and leave a sliver, defeating T11's
 * "リングだけでホストの総体形状が読める". So in plate mode, ring3d patches
 * are unioned in RAW (never intersected with the shell): with an all-ring3d
 * packing, plate mode's result is simply "the union of the rings", which is
 * already exactly the "host hidden" reading T11 完了条件3 asks a screenshot
 * to show -- no separate visibility toggle needed. Window mode is
 * unaffected by this split (any patch shape still just carves the shell,
 * same opSmoothSubtraction as T10 -- a bulging ring still carves a
 * ring-shaped hole, which is the intended "殻に窓が開く" reading either way).
 *
 * T14 (coinBulge, 作者Observation 2026-07-20 "コインがふっくらすれば
 * サポート不要な形になりそう" -- a HYPOTHESIS this Study exists to let the
 * author visually compare, not a settled fact): plate mode only, and only
 * for `coinBulge > 0`. Instead of clipping coin patches to the same
 * thickness/2 shell band as flatRing, coins are clipped to a WIDER band
 * (thickness/2 + coinBulge) so their own round point geometry can push
 * outward on both sides of the host surface, up to their raw (unclipped)
 * extent. flatRing keeps the ordinary shell band; ring3d and window mode are
 * entirely unaffected by coinBulge.
 *
 * `coinBulge <= 0` runs the EXACT old code path (coin+flatRing unioned into
 * one field, THEN intersected with the shell once) rather than "splitting
 * unconditionally with a zero-width extra band", because smooth booleans are
 * not distributive:
 *   intersection(shell, union(coin, flatRing))                       -- old
 *   union(intersection(shell, coin), intersection(shell, flatRing))  -- split
 * these are not guaranteed numerically identical even at zero extra band
 * width, so an old recipe (or any coinBulge=0 use) must not run through the
 * split path at all -- see README v0.13 for the reasoning this branch exists
 * to protect. */
export function compositeSdf(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  x: number,
  y: number,
  z: number,
  coinBulge: number,
  coinBulgeBalance = 0,
): number {
  const dShell = shellSdf(host, hostK, thickness, x, y, z);
  if (patches.length === 0) {
    // plate ∩ nothing = nothing; window: shell minus nothing = the shell itself.
    return mode === "plate" ? 1e5 : dShell;
  }
  if (mode === "window") {
    const dPatch = patchesSdf(patches, roundK, x, y, z);
    return opSmoothSubtraction(dPatch, dShell, roundK);
  }
  if (coinBulge <= 0) {
    // plate mode, old exact path: split only coin+flatRing vs ring3d (see
    // doc comment above), coin and flatRing stay unioned together.
    const flatPatches = patches.filter((p) => p.shape !== "ring3d" && p.shape !== "flower");
    const raisedPatches = patches.filter((p) => p.shape === "ring3d" || p.shape === "flower");
    let plateFlat = 1e5;
    if (flatPatches.length > 0) {
      const dFlat = patchesSdf(flatPatches, roundK, x, y, z);
      plateFlat = opSmoothIntersection(dShell, dFlat, roundK);
    }
    if (raisedPatches.length === 0) return plateFlat;
    const dRaised = patchesSdf(raisedPatches, roundK, x, y, z);
    return flatPatches.length === 0 ? dRaised : smoothMin(plateFlat, dRaised, roundK);
  }
  // plate mode, coinBulge > 0: coin/flatRing/ring3d are now three separate
  // groups, each intersected (or left raw, for ring3d) with its own band,
  // then unioned together.
  const coinPatches = patches.filter((p) => p.shape === "coin");
  const flatRingPatches = patches.filter((p) => p.shape === "flatRing");
  const raisedPatches = patches.filter((p) => p.shape === "ring3d" || p.shape === "flower");
  let plateFlat = 1e5;
  let hasFlat = false;
  if (coinPatches.length > 0) {
    const sides = coinBulgeSides(coinBulge, coinBulgeBalance);
    const dCoinBand = asymmetricHostBandSdf(
      host,
      hostK,
      thickness / 2 + sides.front,
      thickness / 2 + sides.back,
      x,
      y,
      z,
    );
    const dCoin = patchesSdf(coinPatches, roundK, x, y, z);
    plateFlat = opSmoothIntersection(dCoinBand, dCoin, roundK);
    hasFlat = true;
  }
  if (flatRingPatches.length > 0) {
    const dFlatRing = patchesSdf(flatRingPatches, roundK, x, y, z);
    const plateFlatRing = opSmoothIntersection(dShell, dFlatRing, roundK);
    plateFlat = hasFlat ? smoothMin(plateFlat, plateFlatRing, roundK) : plateFlatRing;
    hasFlat = true;
  }
  if (raisedPatches.length === 0) return hasFlat ? plateFlat : 1e5;
  const dRaised = patchesSdf(raisedPatches, roundK, x, y, z);
  return hasFlat ? smoothMin(plateFlat, dRaised, roundK) : dRaised;
}

/** Compile the shape grouping once for dense sampling. `compositeSdf` is
 * intentionally kept as the convenient point-query API, but filtering all
 * patches again at every voxel creates millions of temporary arrays during
 * mesh construction. This evaluator preserves the same point order and
 * boolean formulas while doing that invariant work once. */
export function createCompositeSdfEvaluator(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  coinBulge: number,
  coinBulgeBalance = 0,
): (x: number, y: number, z: number) => number {
  if (patches.length === 0) {
    return (x, y, z) => mode === "plate" ? 1e5 : shellSdf(host, hostK, thickness, x, y, z);
  }
  if (mode === "window") {
    const evaluatePatches = createPatchesSdfEvaluator(patches, roundK);
    return (x, y, z) => {
      const dShell = shellSdf(host, hostK, thickness, x, y, z);
      return opSmoothSubtraction(evaluatePatches(x, y, z), dShell, roundK);
    };
  }
  if (coinBulge <= 0) {
    const flatPatches = patches.filter((patch) => patch.shape !== "ring3d" && patch.shape !== "flower");
    const raisedPatches = patches.filter((patch) => patch.shape === "ring3d" || patch.shape === "flower");
    const evaluateFlat = createPatchesSdfEvaluator(flatPatches, roundK);
    const evaluateRaised = createPatchesSdfEvaluator(raisedPatches, roundK);
    return (x, y, z) => {
      const dShell = shellSdf(host, hostK, thickness, x, y, z);
      let plateFlat = 1e5;
      if (flatPatches.length > 0) {
        plateFlat = opSmoothIntersection(dShell, evaluateFlat(x, y, z), roundK);
      }
      if (raisedPatches.length === 0) return plateFlat;
      const dRaised = evaluateRaised(x, y, z);
      return flatPatches.length === 0 ? dRaised : smoothMin(plateFlat, dRaised, roundK);
    };
  }
  const coinPatches = patches.filter((patch) => patch.shape === "coin");
  const flatRingPatches = patches.filter((patch) => patch.shape === "flatRing");
  const raisedPatches = patches.filter((patch) => patch.shape === "ring3d" || patch.shape === "flower");
  const evaluateCoins = createPatchesSdfEvaluator(coinPatches, roundK);
  const evaluateFlatRings = createPatchesSdfEvaluator(flatRingPatches, roundK);
  const evaluateRaised = createPatchesSdfEvaluator(raisedPatches, roundK);
  const coinBulgeDistribution = coinBulgeSides(coinBulge, coinBulgeBalance);
  return (x, y, z) => {
    const dShell = shellSdf(host, hostK, thickness, x, y, z);
    let plateFlat = 1e5;
    let hasFlat = false;
    if (coinPatches.length > 0) {
      const dCoinBand = asymmetricHostBandSdf(
        host,
        hostK,
        thickness / 2 + coinBulgeDistribution.front,
        thickness / 2 + coinBulgeDistribution.back,
        x,
        y,
        z,
      );
      plateFlat = opSmoothIntersection(dCoinBand, evaluateCoins(x, y, z), roundK);
      hasFlat = true;
    }
    if (flatRingPatches.length > 0) {
      const plateFlatRing = opSmoothIntersection(
        dShell,
        evaluateFlatRings(x, y, z),
        roundK,
      );
      plateFlat = hasFlat ? smoothMin(plateFlat, plateFlatRing, roundK) : plateFlatRing;
      hasFlat = true;
    }
    if (raisedPatches.length === 0) return hasFlat ? plateFlat : 1e5;
    const dRaised = evaluateRaised(x, y, z);
    return hasFlat ? smoothMin(plateFlat, dRaised, roundK) : dRaised;
  };
}

// --- Surface projection ------------------------------------------------------

export interface Projected {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/** Newton-step a point toward host's zero surface along the SDF gradient
 * (T10 §2: "内部サンプル→SDF勾配で表面へ射影"). Not guaranteed to converge
 * for every starting point (blobby fields can have saddle regions) --
 * returns null if it doesn't settle within maxSteps, and the caller treats
 * that as a rejected sample, same as any other packing failure. */
export function projectToSurface(
  host: Ball[],
  hostK: number,
  x0: number,
  y0: number,
  z0: number,
  maxSteps = 24,
): Projected | null {
  const e = 0.0015;
  let x = x0;
  let y = y0;
  let z = z0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < maxSteps; i++) {
    const d = fieldSdf(host, hostK, x, y, z);
    const gx = fieldSdf(host, hostK, x + e, y, z) - fieldSdf(host, hostK, x - e, y, z);
    const gy = fieldSdf(host, hostK, x, y + e, z) - fieldSdf(host, hostK, x, y - e, z);
    const gz = fieldSdf(host, hostK, x, y, z + e) - fieldSdf(host, hostK, x, y, z - e);
    const glen = Math.hypot(gx, gy, gz) || 1;
    nx = gx / glen;
    ny = gy / glen;
    nz = gz / glen;
    if (Math.abs(d) < 0.0015) {
      return { x, y, z, nx, ny, nz };
    }
    x -= nx * d;
    y -= ny * d;
    z -= nz * d;
  }
  const d = fieldSdf(host, hostK, x, y, z);
  return Math.abs(d) < 0.02 ? { x, y, z, nx, ny, nz } : null;
}

/** Orthonormal basis (t1, t2) spanning the tangent plane of a unit normal. */
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

/** Distance from a candidate point to the nearest point of any patch OTHER
 * than `ownerPatchId`, minus that point's radius. Infinity if there is
 * nothing to compare against. Used both by the greedy packer (target
 * clearance) and by the gauges (realized clearance). */
function clearanceToOtherPatches(
  patches: Patch[],
  ownerPatchId: number | null,
  x: number,
  y: number,
  z: number,
): number {
  let best = Infinity;
  for (const patch of patches) {
    if (patch.id === ownerPatchId) continue;
    for (const pt of patch.points) {
      const d = Math.hypot(x - pt.x, y - pt.y, z - pt.z) - pt.r;
      if (d < best) best = d;
    }
  }
  return best;
}

export interface PackPatchesResult {
  patches: Patch[];
  placed: number;
  triedAndRejected: number;
  stoppedEarly: boolean;
  /** Direct-flower authoring facts for this realized result. */
  flowerConnections: number;
  flowerBridgePoints: number;
  /** Flowers expanded with PACK-SPIKE's lace-shell fusion radius. */
  flowerFusedPatches: number;
  /** Common expansion, or the maximum local expansion in QUAD-FLOW. */
  flowerFusionRadius: number;
  /** QUAD-FLOW repairs only the closest components beside an open edge. */
  flowerFusionLocalized: boolean;
  flowerFusionAdjustedPoints: number;
  flowerFusionEdgeCount: number;
  flowerFusionOpenEdges: number;
  /** Shape-neutral QUAD-FLOW shared-edge connection facts. */
  quadConnectionShape: PatchShape | null;
  quadConnectionLocalized: boolean;
  quadConnectionAdjustedPoints: number;
  quadConnectionEdgeCount: number;
  quadConnectionOpenEdges: number;
  quadConnectionMaxRadius: number;
}

const FAIL_LIMIT_FLOOR = 120;
/** Minimum sub-point radius worth keeping (T10 §1 "形の不揃いのつまみ" --
 * below this a sub-point would be an invisible speck, so it is dropped
 * rather than emitted at a near-zero radius). 仮決め, no principled derivation. */
const MIN_SUBPOINT_R = 0.01;

// Greedy random patch packing (T10 §2, the surface-constrained sibling of
// pack/field.ts's packVoidsGreedy):
//  1. sample a point uniformly in the host's bounding box
//  2. reject if it isn't inside the host (nothing to project from)
//  3. project it onto the host surface via SDF-gradient descent
//  4. the placeable ANCHOR radius at that surface point is
//     min(maxR, clearance to every other patch's points − gap)
//  5. reject if that radius is below minR
//  6. generate the shape's points around that anchor (T11 §1 adds a shape
//     dispatch here -- coin/flatRing/ring3d, see generateShapePoints)
// Stops early after `FAIL_LIMIT` consecutive rejections, same convention as
// pack. Geodesic distance is NOT computed -- clearance is plain Euclidean
// distance between points that happen to sit near the surface (T10 "やらない
// こと": 測地距離の厳密計算, ユークリッド近似で始める).

/** "コイン" point generation -- exactly T10's original logic, factored out
 * unchanged so the greedy packer and manual add can share it. Sub-points
 * honor `gap` individually (see file's original doc), which for negative
 * `gap` simply makes each sub-point's allowed radius larger, same mechanism
 * as the anchor. */
function buildCoinPoints(
  host: Ball[],
  hostK: number,
  proj: Projected,
  anchorR: number,
  params: SkinParams,
  rng: () => number,
  patchId: number,
  patches: Patch[],
): PatchPoint[] {
  const holeRatio = Math.max(0, Math.min(0.95, params.coinHoleRatio ?? 0));
  // An explicit zero is a compatibility boundary: old recipes keep the
  // exact historical random calls, point order, and generated geometry.
  if (holeRatio > 1e-6) {
    return buildCoinRimPoints(host, hostK, proj, anchorR, params, rng);
  }
  const subCount = 3 + Math.round(params.irregularity * 5);
  const points: PatchPoint[] = [{ x: proj.x, y: proj.y, z: proj.z, r: anchorR }];
  const { t1, t2 } = tangentBasis(proj.nx, proj.ny, proj.nz);
  for (let s = 0; s < subCount; s++) {
    const theta = rng() * Math.PI * 2;
    const dist = anchorR * (0.35 + 0.85 * params.irregularity) * (0.4 + 0.6 * rng());
    const ox = proj.x + (t1[0] * Math.cos(theta) + t2[0] * Math.sin(theta)) * dist;
    const oy = proj.y + (t1[1] * Math.cos(theta) + t2[1] * Math.sin(theta)) * dist;
    const oz = proj.z + (t1[2] * Math.cos(theta) + t2[2] * Math.sin(theta)) * dist;
    const subProj = projectToSurface(host, hostK, ox, oy, oz, 6) ?? { x: ox, y: oy, z: oz, nx: proj.nx, ny: proj.ny, nz: proj.nz };
    const subRCap = anchorR * (0.35 + 0.55 * rng() * (0.3 + params.irregularity));
    const clearance = Math.min(
      subRCap,
      clearanceToOtherPatches(patches, patchId, subProj.x, subProj.y, subProj.z) - params.gap,
    );
    if (clearance < MIN_SUBPOINT_R) continue; // dropped, not shrunk to a speck
    points.push({ x: subProj.x, y: subProj.y, z: subProj.z, r: clearance });
  }
  return points;
}

/** Coin-with-hole generation. Unlike flatRing, this remains a coin: it
 * keeps coin bulge/shell behavior and derives its own dense continuous rim
 * automatically instead of exposing ring node/tube controls.
 *
 * The requested inner radius is anchorR*holeRatio. Before the minimum-width
 * clamp, `tube=(outer-inner)/2` and `orbit=outer-tube`, hence
 * orbit+tube=anchorR and orbit-tube=anchorR*holeRatio. At the thin end we
 * keep MIN_SUBPOINT_R and increase node density; this is the physical
 * meaning of "外周円だけ" in a volumetric/printable model. */
function buildCoinRimPoints(
  host: Ball[],
  hostK: number,
  proj: Projected,
  anchorR: number,
  params: SkinParams,
  rng: () => number,
): PatchPoint[] {
  const holeRatio = Math.max(0, Math.min(0.95, params.coinHoleRatio ?? 0));
  const tubeR = Math.min(anchorR * 0.5, Math.max(MIN_SUBPOINT_R, anchorR * (1 - holeRatio) * 0.5));
  const orbitR = Math.max(0, anchorR - tubeR);
  const maxChord = Math.max(MIN_SUBPOINT_R, tubeR * 1.65);
  const count = Math.max(12, Math.min(128, Math.ceil((Math.PI * 2 * orbitR) / maxChord)));
  const { t1, t2 } = tangentBasis(proj.nx, proj.ny, proj.nz);
  const phase = rng() * Math.PI * 2;
  // As the centre opens, the outside becomes progressively more circle-like
  // instead of turning into a noisy string of beads.
  const irregularity = params.irregularity * (1 - holeRatio) * 0.12;
  const primary: PatchPoint[] = [];
  for (let index = 0; index < count; index++) {
    const theta = phase + (index / count) * Math.PI * 2;
    const wave = 1 + irregularity * (0.58 * Math.sin(theta * 3 + 0.7) + 0.42 * Math.sin(theta * 5 - 0.4));
    const radial = orbitR * wave;
    const ox = proj.x + (t1[0] * Math.cos(theta) + t2[0] * Math.sin(theta)) * radial;
    const oy = proj.y + (t1[1] * Math.cos(theta) + t2[1] * Math.sin(theta)) * radial;
    const oz = proj.z + (t1[2] * Math.cos(theta) + t2[2] * Math.sin(theta)) * radial;
    const surface = projectToSurface(host, hostK, ox, oy, oz, 6) ?? { x: ox, y: oy, z: oz };
    primary.push({ x: surface.x, y: surface.y, z: surface.z, r: tubeR });
  }

  // Curved hosts can stretch projected neighbours. Add deterministic
  // interleaved spheres wherever a cyclic edge would otherwise separate.
  const points: PatchPoint[] = [];
  for (let index = 0; index < primary.length; index++) {
    const a = primary[index];
    const b = primary[(index + 1) % primary.length];
    points.push(a);
    const distance = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const steps = Math.max(1, Math.ceil(distance / Math.max(MIN_SUBPOINT_R, (a.r + b.r) * 0.82)));
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      const surface = projectToSurface(host, hostK, x, y, z, 4) ?? { x, y, z };
      points.push({ x: surface.x, y: surface.y, z: surface.z, r: tubeR });
    }
  }
  return points;
}

/** "平リング" point generation (T11 §1): nodes placed on a circle of radius
 * `majorR` in the anchor's tangent plane, each with ball radius `nodeR`, all
 * re-projected onto the host surface. The union of these balls (same
 * smooth-min as everything else in this file) IS the ring shape -- no
 * separate "subtract a hole" boolean is needed, only the *placement*
 * differs from a coin's scattered blob (file header's stated principle).
 *
 * 仮決め formula (documented here, no principled derivation): with
 * holeRatio in [0,1], majorR = anchorR*holeRatio and
 * nodeR = anchorR*(1-holeRatio)*0.9. Outer edge sits at ~anchorR regardless
 * of holeRatio (majorR+nodeR ≈ anchorR); the inner (hole) radius is
 * majorR-nodeR, which only turns positive (a real hole opens) once
 * holeRatio exceeds ~0.47 -- below that the nodes overlap through the
 * center and the patch reads as a solid disk, same as a coin. */
function buildFlatRingPoints(
  host: Ball[],
  hostK: number,
  proj: Projected,
  anchorR: number,
  params: SkinParams,
  rng: () => number,
): PatchPoint[] {
  const holeRatio = Math.max(0, Math.min(0.95, params.flatRingHoleRatio));
  const majorR = anchorR * holeRatio;
  const nodeR = Math.max(MIN_SUBPOINT_R, anchorR * (1 - holeRatio) * 0.9);
  const count = Math.max(4, Math.round(params.ringNodeCount));
  const { t1, t2 } = tangentBasis(proj.nx, proj.ny, proj.nz);
  const phase = rng() * Math.PI * 2; // random rotation, same spirit as ring3d's post-rotation
  const points: PatchPoint[] = [];
  for (let i = 0; i < count; i++) {
    const theta = phase + (i / count) * Math.PI * 2;
    const wobble = 1 + (rng() * 2 - 1) * params.ringWobbleR * 0.3;
    const ox = proj.x + (t1[0] * Math.cos(theta) + t2[0] * Math.sin(theta)) * majorR;
    const oy = proj.y + (t1[1] * Math.cos(theta) + t2[1] * Math.sin(theta)) * majorR;
    const oz = proj.z + (t1[2] * Math.cos(theta) + t2[2] * Math.sin(theta)) * majorR;
    const subProj = projectToSurface(host, hostK, ox, oy, oz, 6) ?? { x: ox, y: oy, z: oz };
    points.push({ x: subProj.x, y: subProj.y, z: subProj.z, r: nodeR * wobble });
  }
  return points;
}

/** "立体リング" point generation (T11 §1): a torus of node balls resting
 * tangent to the host surface at the anchor, reusing S-rings' own
 * `generateRingBalls` (imported, not copied -- T11's "最大限共有").
 *
 * Tangency: a torus with plane-normal `axis`, major radius R and tube
 * (node) radius r, whose CENTER sits at height r above a plane along
 * `axis`, touches that plane along the full circle of radius R around the
 * center's foot-point (every node's closest surface point sits exactly at
 * height 0). So center = anchor + normal*ringTubeR, axis = normal, giving a
 * ring that lies flush against the anchor's tangent plane the way T11 §1
 * asks ("リングの面はアンカー点の接平面に沿わせる"), touching the real
 * (curved) host surface only approximately at the anchor itself (the
 * tangent-plane approximation, same one `projectToSurface`'s local basis
 * already relies on elsewhere in this Study).
 *
 * `anchorR` (the clearance-bounded radius every patch shape shares) is used
 * as the ring's major radius R -- so the same negative-gap mechanism that
 * lets rings overlap also lets a ring grow big enough to catch a neighbor.
 * The random post-rotation around `axis` (T11 §1 "法線まわりの回転はランダ
 * ム") is applied via `rotatePoint`, since `generateRingBalls`'s own basis
 * is deterministic from the axis alone and exposes no phase parameter. */
type RingFrame = { center: Vec3; axis: Vec3 };

function normalizeRingAxis(axis: Vec3): Vec3 {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length < 1e-12) throw new Error("ring3d の軸を正規化できません");
  return { x: axis.x / length, y: axis.y / length, z: axis.z / length };
}

function dotVec(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function pointDistance(a: PatchPoint, b: PatchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Make a new ring3d's generated centreline a continuous cyclic sphere chain.
 * The primary points come directly from S-rings in its deterministic recipe
 * order; only failing edges receive points between them. Interpolation stays
 * in the known ring frame (angle, radial distance, axial distance), rather
 * than cutting a chord across the hole. This function is intentionally only
 * called while generating a new or explicit-reshape ring: replay consumes
 * recorded point arrays verbatim, including legacy arrays without markers.
 */
export function realizeRing3dContinuity(primary: PatchPoint[], frame: RingFrame): PatchPoint[] {
  if (primary.length < 3) throw new Error("ring3d は3個以上の主節を必要とします");
  const axis = normalizeRingAxis(frame.axis);
  const realized: PatchPoint[] = [];
  for (let i = 0; i < primary.length; i++) {
    const current = primary[i];
    const next = primary[(i + 1) % primary.length];
    if (!(current.r > 0) || !(next.r > 0)) throw new Error("ring3d の節半径が不正です");
    realized.push({ ...current, ringPrimary: true });
    if (pointDistance(current, next) <= current.r + next.r) continue;

    const currentOffset: Vec3 = {
      x: current.x - frame.center.x,
      y: current.y - frame.center.y,
      z: current.z - frame.center.z,
    };
    const nextOffset: Vec3 = {
      x: next.x - frame.center.x,
      y: next.y - frame.center.y,
      z: next.z - frame.center.z,
    };
    const axialCurrent = dotVec(currentOffset, axis);
    const axialNext = dotVec(nextOffset, axis);
    const radialCurrent: Vec3 = {
      x: currentOffset.x - axis.x * axialCurrent,
      y: currentOffset.y - axis.y * axialCurrent,
      z: currentOffset.z - axis.z * axialCurrent,
    };
    const radialNext: Vec3 = {
      x: nextOffset.x - axis.x * axialNext,
      y: nextOffset.y - axis.y * axialNext,
      z: nextOffset.z - axis.z * axialNext,
    };
    const radiusCurrent = Math.hypot(radialCurrent.x, radialCurrent.y, radialCurrent.z);
    const radiusNext = Math.hypot(radialNext.x, radialNext.y, radialNext.z);
    if (radiusCurrent < 1e-12 || radiusNext < 1e-12) throw new Error("ring3d の半径方向を決められません");
    const radialUnit: Vec3 = {
      x: radialCurrent.x / radiusCurrent,
      y: radialCurrent.y / radiusCurrent,
      z: radialCurrent.z / radiusCurrent,
    };
    const tangentUnit = crossVec(axis, radialUnit);
    // Adjacent authored nodes are ordered around the ring. The principal arc
    // is therefore the intended local arc (also for the closing edge), not a
    // chord through the hole. Its sign is deterministic from the frame.
    let deltaAngle = Math.atan2(dotVec(radialNext, tangentUnit), dotVec(radialNext, radialUnit));
    if (deltaAngle <= -Math.PI) deltaAngle += Math.PI * 2;
    if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
    const connectorRadius = Math.min(current.r, next.r);
    const metric = Math.hypot(
      radiusNext - radiusCurrent,
      axialNext - axialCurrent,
      Math.max(radiusCurrent, radiusNext) * Math.abs(deltaAngle),
    );
    let intervals = Math.max(1, Math.ceil(metric / (2 * connectorRadius)));
    for (;;) {
      const connectors: PatchPoint[] = [];
      for (let step = 1; step < intervals; step++) {
        const t = step / intervals;
        const angle = deltaAngle * t;
        const radial = radiusCurrent + (radiusNext - radiusCurrent) * t;
        const axial = axialCurrent + (axialNext - axialCurrent) * t;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        connectors.push({
          x: frame.center.x + radialUnit.x * radial * cos + tangentUnit.x * radial * sin + axis.x * axial,
          y: frame.center.y + radialUnit.y * radial * cos + tangentUnit.y * radial * sin + axis.y * axial,
          z: frame.center.z + radialUnit.z * radial * cos + tangentUnit.z * radial * sin + axis.z * axial,
          r: connectorRadius,
          ringPrimary: false,
        });
      }
      const chain = [current, ...connectors, next];
      if (chain.every((point, index) => index === 0 || pointDistance(chain[index - 1], point) <= chain[index - 1].r + point.r)) {
        realized.push(...connectors);
        break;
      }
      // The arc metric is conservative, but keep the postcondition exact in
      // floating point as well. There is deliberately no silent cap: a bad
      // interval must refine until this edge is connected.
      intervals++;
    }
  }
  if (!realized.every((point, index) => {
    const previous = realized[(index + realized.length - 1) % realized.length];
    return pointDistance(previous, point) <= previous.r + point.r;
  })) throw new Error("ring3d の連続化後に未接続の辺が残りました");
  return realized;
}

function buildRing3dPoints(
  proj: Projected,
  anchorR: number,
  patchId: number,
  params: SkinParams,
  rng: () => number,
): PatchPoint[] {
  const tubeR = Math.max(0.01, params.ringTubeR);
  const axis: Vec3 = { x: proj.nx, y: proj.ny, z: proj.nz };
  const center: Vec3 = {
    x: proj.x + proj.nx * tubeR,
    y: proj.y + proj.ny * tubeR,
    z: proj.z + proj.nz * tubeR,
  };
  const recipe: RingRecipe = {
    center,
    axis,
    R: Math.max(0.02, anchorR),
    n: Math.max(3, Math.round(params.ringNodeCount)),
    r: tubeR,
    wobbleR: params.ringWobbleR,
    wobblePos: params.ringWobblePos,
    seed: `${params.seed}-ring3d-${patchId}`,
  };
  const balls = generateRingBalls(recipe);
  const phase = rng() * Math.PI * 2;
  const primary = balls.map((b) => {
    const p = rotatePoint({ x: b.x, y: b.y, z: b.z }, center, axis, phase);
    return { x: p.x, y: p.y, z: p.z, r: b.r };
  });
  return realizeRing3dContinuity(primary, { center, axis });
}

/** PACK-SPIKE's motif definition adapted to S-skin's arbitrary host field.
 * The original motif components are scaled into the same clearance-bounded
 * anchor envelope used by every other Patch shape, rotated in the local
 * tangent frame, and lifted so the lowest sphere touches the host surface.
 * Short sampled neck spheres mirror PACK-SPIKE's unified-field connection
 * without introducing a second field representation into S-skin. */
function buildFlowerMotifPoints(
  proj: Projected,
  anchorR: number,
  params: SkinParams,
  rng: () => number,
): PatchPoint[] {
  const preset = PACKING_MOTIF_PRESETS.find((entry) => entry.id === params.flowerMotifPreset)
    ?? PACKING_MOTIF_PRESETS[1];
  const definition = normalizePackingMotif(params.flowerMotifPreset === "custom" ? {
    petalCount: params.flowerPetalCount,
    showCore: params.flowerShowCore,
    opening: params.flowerOpening,
    neck: params.flowerNeck,
    coreSize: params.flowerCoreSize,
    cupping: params.flowerCupping,
    coreLift: params.flowerCoreLift,
    growthDifference: params.flowerGrowthDifference,
  } : preset.definition);
  const components = createFlowerFormComponents(definition.petalCount, definition, definition.showCore);
  if (components.length === 0) return [];

  const connections: Array<readonly [typeof components[number], typeof components[number]]> = [];
  const core = components.find((component) => component.kind === "core");
  const petals = components.filter((component) => component.kind === "petal");
  if (core) {
    for (const petal of petals) connections.push([core, petal]);
  } else {
    for (let index = 0; index < petals.length; index++) {
      connections.push([petals[index], petals[(index + 1) % petals.length]]);
    }
  }
  const local = components.map((component) => ({
    x: component.position.x,
    y: component.position.y,
    z: component.position.z,
    r: component.radius,
  }));
  for (const [start, end] of connections) {
    const neckR = Math.max(MIN_SUBPOINT_R, Math.min(start.radius, end.radius) * definition.neck);
    const length = Math.hypot(
      end.position.x - start.position.x,
      end.position.y - start.position.y,
      end.position.z - start.position.z,
    );
    const steps = Math.max(1, Math.min(8, Math.ceil(length / Math.max(neckR * 1.6, 1e-4)) - 1));
    for (let step = 1; step <= steps; step++) {
      const t = step / (steps + 1);
      local.push({
        x: start.position.x + (end.position.x - start.position.x) * t,
        y: start.position.y + (end.position.y - start.position.y) * t,
        z: start.position.z + (end.position.z - start.position.z) * t,
        r: neckR,
      });
    }
  }

  const bottom = Math.min(...local.map((point) => point.z - point.r));
  for (const point of local) point.z -= bottom;
  const envelope = Math.max(...local.map((point) => Math.hypot(point.x, point.y, point.z) + point.r));
  const motifScale = anchorR / Math.max(envelope, 1e-6);
  const phase = rng() * Math.PI * 2;
  const c = Math.cos(phase);
  const s = Math.sin(phase);
  const { t1, t2 } = tangentBasis(proj.nx, proj.ny, proj.nz);
  // PACK-SPIKE's reference lace-shell state uses fusionRadius=0.1 in the
  // same local flower definition whose components are scaled here. Applying
  // the addition before motifScale preserves that exact proportion on an
  // arbitrary S-skin host; unlike the old MST draft it introduces no branch
  // geometry between flowers.
  // In the PACK-SPIKE reference, flowerSize=0.25 produces a motif envelope
  // of about 0.36 and the lace-shell adds 0.10: roughly 28% of the complete
  // flower envelope. S-skin's `anchorR` is that complete envelope, so this
  // is the scale-equivalent value (not 0.1 * component scale).
  const fusionBaseR = anchorR * 0.28;
  return local.map((point) => {
    const lx = (point.x * c - point.y * s) * motifScale;
    const ly = (point.x * s + point.y * c) * motifScale;
    const lz = point.z * motifScale;
    return {
      x: proj.x + t1[0] * lx + t2[0] * ly + proj.nx * lz,
      y: proj.y + t1[1] * lx + t2[1] * ly + proj.ny * lz,
      z: proj.z + t1[2] * lx + t2[2] * ly + proj.nz * lz,
      // Packing must use the unexpanded component, exactly as PACK-SPIKE's
      // lace-shell path does. All flowers are expanded together only after
      // placement; expanding here would make later flowers avoid the fusion
      // envelope and remain disconnected.
      r: Math.max(MIN_SUBPOINT_R, point.r * motifScale),
      role: "motif",
      baseR: Math.max(MIN_SUBPOINT_R, point.r * motifScale),
      fusionBaseR,
      fusionR: 0,
    };
  });
}

export interface FlowerConnectionReport {
  patches: Patch[];
  flowerCount: number;
  connectionCount: number;
  bridgePointCount: number;
}

export interface FlowerFusionReport {
  patches: Patch[];
  flowerCount: number;
  fusionRadius: number;
}

/** PACK-SPIKE lace-shell semantics on an arbitrary S-skin host.
 * Placement is already complete. We choose one common component expansion
 * from the widest edge of the flowers' closest-surface minimum spanning tree.
 * This connects the flowers by their own swollen surfaces: no branches,
 * per-edge connector geometry, or hidden host shell are introduced. */
export function fuseFlowerPatchesByExpansion(
  inputPatches: Patch[],
  expansionMultiplier = 1,
): FlowerFusionReport {
  const patches = inputPatches.map((patch) => ({
    id: patch.id,
    shape: patch.shape ?? "coin",
    ...(patch.motifPlacement !== undefined ? { motifPlacement: patch.motifPlacement } : {}),
    quadCellId: patch.quadCellId,
    surfaceCellId: patch.surfaceCellId,
    surfaceCellKind: patch.surfaceCellKind,
    motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
    points: patch.points.filter((point) => point.role !== "bridge").map((point) => {
      if ((patch.shape ?? "coin") !== "flower" || point.role !== "motif") return { ...point };
      const baseR = point.baseR ?? point.r;
      return { ...point, baseR, r: baseR };
    }),
  }));
  const flowers = patches.filter((patch) => patch.shape === "flower" && patch.points.length > 0);
  if (flowers.length === 0) return { patches, flowerCount: 0, fusionRadius: 0 };

  const edges: Array<{ a: number; b: number; clearance: number }> = [];
  for (let a = 0; a < flowers.length; a++) {
    for (let b = a + 1; b < flowers.length; b++) {
      let clearance = Infinity;
      for (const pa of flowers[a].points) for (const pb of flowers[b].points) {
        clearance = Math.min(
          clearance,
          Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) - (pa.baseR ?? pa.r) - (pb.baseR ?? pb.r),
        );
      }
      edges.push({ a, b, clearance });
    }
  }
  edges.sort((a, b) =>
    a.clearance - b.clearance || flowers[a.a].id - flowers[b.a].id || flowers[a.b].id - flowers[b.b].id);
  const parent = flowers.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  let widestSelectedGap = 0;
  let selected = 0;
  for (const edge of edges) {
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    widestSelectedGap = Math.max(widestSelectedGap, edge.clearance);
    selected++;
    if (selected === flowers.length - 1) break;
  }
  const referenceRadius = flowers.flatMap((patch) => patch.points).reduce(
    (maximum, point) => Math.max(maximum, point.fusionBaseR ?? point.fusionR ?? 0), 0);
  const automaticRadius = Math.max(referenceRadius, widestSelectedGap * 0.5 + 1e-4);
  const fusionRadius = automaticRadius * Math.max(0, Math.min(2, expansionMultiplier));
  for (const patch of flowers) for (const point of patch.points) {
    if (point.role !== "motif") continue;
    point.fusionR = fusionRadius;
    point.r = (point.baseR ?? point.r) + fusionRadius;
  }
  return { patches, flowerCount: flowers.length, fusionRadius };
}

type FlowerConnectionCandidate = {
  aIndex: number;
  bIndex: number;
  aPoint: PatchPoint;
  bPoint: PatchPoint;
  clearance: number;
};

/** Build a sparse, deterministic flower-to-flower network.
 *
 * A minimum spanning tree is selected from the closest realized motif
 * spheres, so N flowers need only N-1 authored connections. Each connection
 * follows short projected samples near the host surface and is then
 * re-sampled densely enough for neighboring bridge spheres to overlap.
 * Existing bridge points are stripped first, making repeated Pack passes
 * idempotent and keeping the caller's input immutable. */
export function connectFlowerPatchesDirectly(
  host: Ball[],
  hostK: number,
  inputPatches: Patch[],
): FlowerConnectionReport {
  const patches = inputPatches.map((patch) => ({
    id: patch.id,
    shape: patch.shape ?? "coin",
    ...(patch.motifPlacement !== undefined ? { motifPlacement: patch.motifPlacement } : {}),
    quadCellId: patch.quadCellId,
    surfaceCellId: patch.surfaceCellId,
    surfaceCellKind: patch.surfaceCellKind,
    motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
    points: patch.points.filter((point) => point.role !== "bridge").map((point) => ({ ...point })),
  }));
  const flowers = patches
    .map((patch, index) => ({ patch, index }))
    .filter(({ patch }) => patch.shape === "flower" && patch.points.length > 0);
  if (flowers.length < 2) {
    return { patches, flowerCount: flowers.length, connectionCount: 0, bridgePointCount: 0 };
  }

  const candidates: FlowerConnectionCandidate[] = [];
  for (let i = 0; i < flowers.length; i++) {
    for (let j = i + 1; j < flowers.length; j++) {
      let best: FlowerConnectionCandidate | null = null;
      for (const aPoint of flowers[i].patch.points) {
        for (const bPoint of flowers[j].patch.points) {
          const clearance = Math.hypot(
            aPoint.x - bPoint.x,
            aPoint.y - bPoint.y,
            aPoint.z - bPoint.z,
          ) - aPoint.r - bPoint.r;
          if (!best || clearance < best.clearance) {
            best = { aIndex: i, bIndex: j, aPoint, bPoint, clearance };
          }
        }
      }
      if (best) candidates.push(best);
    }
  }
  candidates.sort((a, b) =>
    a.clearance - b.clearance ||
    flowers[a.aIndex].patch.id - flowers[b.aIndex].patch.id ||
    flowers[a.bIndex].patch.id - flowers[b.bIndex].patch.id,
  );

  const parent = flowers.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const selected: FlowerConnectionCandidate[] = [];
  for (const candidate of candidates) {
    const aRoot = find(candidate.aIndex);
    const bRoot = find(candidate.bIndex);
    if (aRoot === bRoot) continue;
    parent[aRoot] = bRoot;
    selected.push(candidate);
    if (selected.length === flowers.length - 1) break;
  }

  let bridgePointCount = 0;
  for (const connection of selected) {
    const start = connection.aPoint;
    const end = connection.bPoint;
    // At 80 mm output scale this lower bound is roughly a 1-2 mm diameter
    // candidate on the default host. It is a geometric draft, not a printer
    // or material guarantee; the saved mesh inspection remains authoritative.
    const bridgeR = Math.max(0.035, Math.min(start.r, end.r) * 0.72);
    const directLength = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    const routeSegments = Math.max(1, Math.min(24, Math.ceil(directLength / Math.max(bridgeR * 3, 1e-6))));
    const startHeight = Math.max(bridgeR * 0.5, fieldSdf(host, hostK, start.x, start.y, start.z));
    const endHeight = Math.max(bridgeR * 0.5, fieldSdf(host, hostK, end.x, end.y, end.z));
    const controls: PatchPoint[] = [{ ...start }];
    for (let step = 1; step < routeSegments; step++) {
      const t = step / routeSegments;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      const z = start.z + (end.z - start.z) * t;
      const projected = projectToSurface(host, hostK, x, y, z, 16);
      if (!projected) {
        controls.push({ x, y, z, r: bridgeR, role: "bridge" });
        continue;
      }
      const height = startHeight + (endHeight - startHeight) * t;
      controls.push({
        x: projected.x + projected.nx * height,
        y: projected.y + projected.ny * height,
        z: projected.z + projected.nz * height,
        r: bridgeR,
        role: "bridge",
      });
    }
    controls.push({ ...end });

    const bridgePoints: PatchPoint[] = [];
    for (let segment = 0; segment < controls.length - 1; segment++) {
      const a = controls[segment];
      const b = controls[segment + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const divisions = Math.max(1, Math.ceil(length / (bridgeR * 1.35)));
      for (let division = 1; division <= divisions; division++) {
        const isFinalEndpoint = segment === controls.length - 2 && division === divisions;
        if (isFinalEndpoint) continue;
        const t = division / divisions;
        bridgePoints.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          r: bridgeR,
          role: "bridge",
        });
      }
    }
    // Assign the realized bridge to the lower-id endpoint for stable replay.
    const owner = flowers[connection.aIndex].patch.id <= flowers[connection.bIndex].patch.id
      ? flowers[connection.aIndex].patch
      : flowers[connection.bIndex].patch;
    owner.points.push(...bridgePoints);
    bridgePointCount += bridgePoints.length;
  }
  return {
    patches,
    flowerCount: flowers.length,
    connectionCount: selected.length,
    bridgePointCount,
  };
}

/** Dispatch to the right point-generator for a patch shape. Shared by the
 * greedy packer and manual single-patch placement (main.ts) so both honor
 * the same shape knobs. */
export function generateShapePoints(
  shape: PatchShape,
  host: Ball[],
  hostK: number,
  proj: Projected,
  anchorR: number,
  params: SkinParams,
  rng: () => number,
  patchId: number,
  patches: Patch[],
): PatchPoint[] {
  const points = shape === "flatRing" ? buildFlatRingPoints(host, hostK, proj, anchorR, params, rng)
    : shape === "ring3d" ? buildRing3dPoints(proj, anchorR, patchId, params, rng)
    : shape === "flower" ? buildFlowerMotifPoints(proj, anchorR, params, rng)
    : buildCoinPoints(host, hostK, proj, anchorR, params, rng, patchId, patches);
  return placeMotifRelativeToSurface(points, proj, params.motifPlacement ?? "surface");
}

export function placeMotifRelativeToSurface(
  points: PatchPoint[],
  surface: Pick<Projected, "x" | "y" | "z" | "nx" | "ny" | "nz">,
  placement: MotifPlacement,
): PatchPoint[] {
  if (placement === "surface" || points.length === 0) return points;
  let minExtent = Infinity;
  let maxExtent = -Infinity;
  for (const point of points) {
    const signed = (point.x - surface.x) * surface.nx +
      (point.y - surface.y) * surface.ny +
      (point.z - surface.z) * surface.nz;
    minExtent = Math.min(minExtent, signed - point.r);
    maxExtent = Math.max(maxExtent, signed + point.r);
  }
  const shift = placement === "center" ? -(minExtent + maxExtent) * 0.5 : -maxExtent;
  return points.map((point) => ({
    ...point,
    x: point.x + surface.nx * shift,
    y: point.y + surface.ny * shift,
    z: point.z + surface.nz * shift,
  }));
}

export function packPatchesGreedy(
  host: Ball[],
  hostK: number,
  existingPatches: Patch[],
  params: SkinParams,
): PackPatchesResult {
  let patches: Patch[] = existingPatches.map((p) => ({
    id: p.id,
    shape: p.shape ?? "coin",
    ...(p.motifPlacement !== undefined ? { motifPlacement: p.motifPlacement } : {}),
    motifParams: p.motifParams ? { ...p.motifParams } : undefined,
    // Rebuild direct connections after the packing pass instead of letting
    // old bridge points consume clearance or accumulate on repeated passes.
    points: p.points.filter((pt) => pt.role !== "bridge").map((pt) => {
      if ((p.shape ?? "coin") !== "flower" || pt.role !== "motif") return { ...pt };
      const baseR = pt.baseR ?? pt.r;
      const fusionBaseR = pt.fusionBaseR ?? pt.fusionR ?? baseR * 0.27;
      return {
        ...pt,
        baseR,
        fusionBaseR,
        // Clearance/placement always sees the original motif. The common
        // fusion pass runs once after every placement has been decided.
        r: baseR,
      };
    }),
  }));
  if (host.length === 0) {
    return {
      patches,
      placed: 0,
      triedAndRejected: 0,
      stoppedEarly: false,
      flowerConnections: 0,
      flowerBridgePoints: 0,
      flowerFusedPatches: 0,
      flowerFusionRadius: 0,
      flowerFusionLocalized: false,
      flowerFusionAdjustedPoints: 0,
      flowerFusionEdgeCount: 0,
      flowerFusionOpenEdges: 0,
      quadConnectionShape: null,
      quadConnectionLocalized: false,
      quadConnectionAdjustedPoints: 0,
      quadConnectionEdgeCount: 0,
      quadConnectionOpenEdges: 0,
      quadConnectionMaxRadius: 0,
    };
  }

  const bounds = computeSamplingBounds(host, hostK);
  // Seed the RNG with the CURRENT patch count folded in: a bare
  // hashSeed(params.seed) replays the identical sample sequence on every
  // pack, so a second pack retries exactly the spots the first pack already
  // consumed and adds ~nothing ("数回に分けて詰める" was broken — author
  // report 2026-07-13). Folding in patches.length gives each pack a fresh,
  // still-deterministic sequence (replay safety is unaffected: the
  // packPatches op records its RESULTS, never re-runs the RNG).
  const rng = makeRng(hashSeed(`${params.seed}#${patches.length}`));
  const failLimit = Math.max(FAIL_LIMIT_FLOOR, Math.round(params.attempts * 0.3));
  const attempts = Math.max(0, Math.round(params.attempts));

  let placed = 0;
  let rejected = 0;
  let consecutiveFails = 0;
  let stoppedEarly = false;

  const fail = (): boolean => {
    rejected++;
    consecutiveFails++;
    return consecutiveFails > failLimit;
  };

  for (let i = 0; i < attempts; i++) {
    const x = bounds.min.x + rng() * bounds.size.x;
    const y = bounds.min.y + rng() * bounds.size.y;
    const z = bounds.min.z + rng() * bounds.size.z;

    if (fieldSdf(host, hostK, x, y, z) >= 0) {
      if (fail()) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    const proj = projectToSurface(host, hostK, x, y, z);
    if (!proj) {
      if (fail()) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    // Negative `gap` (T11 §2 "重なり許容") makes this radius LARGER than the
    // realized clearance, i.e. deliberately overlapping placements.
    const anchorR = Math.min(params.maxR, clearanceToOtherPatches(patches, null, proj.x, proj.y, proj.z) - params.gap);
    if (anchorR < params.minR) {
      if (fail()) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    const patchId = freshPatchId();
    const points = generateShapePoints(params.patchShape, host, hostK, proj, anchorR, params, rng, patchId, patches);
    if (points.length === 0) {
      if (fail()) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    patches.push({
      id: patchId,
      shape: params.patchShape,
      motifPlacement: params.motifPlacement ?? "surface",
      motifParams: captureMotifShapeParams(params),
      points,
    });
    placed++;
    consecutiveFails = 0;
  }

  let flowerFusionRadius = 0;
  if (params.flowerConnectionMode === "fused") {
    const fused = fuseFlowerPatchesByExpansion(patches, params.flowerExpansion);
    patches = fused.patches;
    flowerFusionRadius = fused.fusionRadius;
  }

  let flowerConnections = 0;
  let flowerBridgePoints = 0;
  const flowerFusedPatches = params.flowerConnectionMode === "fused"
    ? patches.filter((patch) => patch.shape === "flower" && patch.points.some((point) =>
      point.role === "motif" && (point.fusionR ?? 0) > 0 && point.r > (point.baseR ?? point.r))).length
    : 0;
  if (params.flowerConnectionMode === "direct") {
    const connected = connectFlowerPatchesDirectly(host, hostK, patches);
    patches = connected.patches;
    flowerConnections = connected.connectionCount;
    flowerBridgePoints = connected.bridgePointCount;
  }
  return {
    patches,
    placed,
    triedAndRejected: rejected,
    stoppedEarly,
    flowerConnections,
    flowerBridgePoints,
    flowerFusedPatches,
    flowerFusionRadius,
    flowerFusionLocalized: false,
    flowerFusionAdjustedPoints: 0,
    flowerFusionEdgeCount: 0,
    flowerFusionOpenEdges: 0,
    quadConnectionShape: null,
    quadConnectionLocalized: false,
    quadConnectionAdjustedPoints: 0,
    quadConnectionEdgeCount: 0,
    quadConnectionOpenEdges: 0,
    quadConnectionMaxRadius: 0,
  };
}

// --- Gauges (計器・正直さ) ---------------------------------------------------

export interface MortarReport {
  /** Estimated thinnest realized clearance between two DIFFERENT patches, in
   * field units. null when fewer than 2 patches exist. Same number reads as
   * "最薄の目地" (window mode: bone left between openings) or "プレート最小
   * 間隔" (plate mode: how close two separate plates came to touching) --
   * see README for why one gauge serves both readings. */
  value: number | null;
  /** True if two different patches' points are already touching/overlapping
   * (clearance <= 0) -- in window mode this means their openings have
   * fused; in plate mode it means those two plates would merge into one
   * printed piece instead of staying separate. */
  touching: boolean;
}

/** Cheapest available proxy: scan every cross-patch point pair (not a true
 * medial-axis / nearest-surface computation -- "厳密でなくてよい" per T9's
 * precedent, inherited here). O(points^2); fine at the point counts a
 * "詰める" pass produces (each patch has a handful of points). */
export function estimateMortar(patches: Patch[]): MortarReport {
  if (patches.length < 2) return { value: null, touching: false };
  let minVal = Infinity;
  for (let i = 0; i < patches.length; i++) {
    for (const pt of patches[i].points) {
      for (let j = i + 1; j < patches.length; j++) {
        for (const pt2 of patches[j].points) {
          const d = Math.hypot(pt.x - pt2.x, pt.y - pt2.y, pt.z - pt2.z) - pt.r - pt2.r;
          if (d < minVal) minVal = d;
        }
      }
    }
  }
  return { value: Math.max(0, minVal), touching: minVal <= 0 };
}

export interface CoverageReport {
  /** Fraction of Monte-Carlo shell-band sample points that also land inside
   * some patch. "粗い推定" -- see estimateCoverage's doc comment. */
  coverage: number;
  /** How many of the sampleCount tries actually landed in the shell band
   * (the denominator coverage is computed against). Low values mean the
   * estimate itself is noisy -- shown so the number isn't taken on faith. */
  shellSamples: number;
}

/**
 * "表面被覆率の粗い推定" (T10 §3): sample points uniformly in the host's
 * bounding box, keep only the ones that land inside the shell band
 * (|hostSdf| < thickness/2 -- a volumetric proxy for "on the surface", not a
 * true area integral over the curved 2-manifold), then report what fraction
 * of THOSE also land inside some patch (patchesSdf < 0). Two approximations
 * stacked (volume-band-for-area, Monte Carlo for the ratio) -- both are
 * named in README rather than hidden, per AGENTS §6 "正直な計算".
 */
export function estimateCoverage(
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  sampleCount = 20000,
  seed = "skin-coverage-probe",
): CoverageReport {
  if (host.length === 0) return { coverage: 0, shellSamples: 0 };
  const bounds = computeSamplingBounds(host, hostK);
  const rng = makeRng(hashSeed(seed));
  let shellSamples = 0;
  let covered = 0;
  for (let i = 0; i < sampleCount; i++) {
    const x = bounds.min.x + rng() * bounds.size.x;
    const y = bounds.min.y + rng() * bounds.size.y;
    const z = bounds.min.z + rng() * bounds.size.z;
    if (Math.abs(fieldSdf(host, hostK, x, y, z)) >= thickness / 2) continue;
    shellSamples++;
    if (patches.length > 0 && patchesSdf(patches, roundK, x, y, z) < 0) covered++;
  }
  return { coverage: shellSamples > 0 ? covered / shellSamples : 0, shellSamples };
}

/**
 * Patch-adjacency proxy for "連結成分数" (T10 §3): union-find over patches,
 * joining two patches whenever any pair of their points would blend in the
 * smooth-min patch field (clearance <= roundK*0.5, a generous touch
 * threshold -- smooth-min still visibly separates surfaces well past exact
 * contact, so this OVER-counts fusion slightly, i.e. UNDER-counts pieces;
 * documented as a fast estimate, not a guarantee). This is a PATCH-LEVEL
 * proxy: it is meaningful for plate mode ("プレートがいくつの部品に融合し
 * たか"), but says nothing about whether the WINDOW-mode shell itself stays
 * connected (that depends on the host topology and can only be answered
 * from the actual generated mesh -- see meshExport.ts's
 * countConnectedComponents, which is the number this Study's completion
 * report actually cites).
 */
export function estimatePatchComponents(patches: Patch[], roundK: number): number {
  if (patches.length === 0) return 0;
  const edges = buildPatchAdjacency(patches, roundK);
  const indexOf = new Map(patches.map((p, i) => [p.id, i]));
  const parent = patches.map((_, i) => i);
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
  for (const edge of edges) {
    const ia = indexOf.get(edge.aId);
    const ib = indexOf.get(edge.bId);
    if (ia !== undefined && ib !== undefined) union(ia, ib);
  }
  const roots = new Set<number>();
  for (let i = 0; i < patches.length; i++) roots.add(find(i));
  return roots.size;
}

// --- Patch adjacency graph (T13 "coin由来A/B分割") --------------------------

export interface PatchAdjacencyEdge {
  aId: number;
  bId: number;
  /** Minimum point-to-point surface clearance between the two patches (their
   * closest pair of points' center distance minus both radii). Negative =
   * already overlapping/fused in the smooth-min union. */
  distance: number;
  reason: "touching" | "near";
}

function patchPairClearance(aPatch: Patch, bPatch: Patch): number {
  let best = Infinity;
  for (const a of aPatch.points) {
    for (const b of bPatch.points) {
      const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - a.r - b.r;
      if (distance < best) best = distance;
    }
  }
  return best;
}

/**
 * First-class adjacency graph over patches, factored out of
 * estimatePatchComponents (which now just unions its edges) so seed-based
 * A/B grouping (see proposeGroupsFromSeeds) shares the exact same distance
 * convention and touch threshold as the existing "連結成分数" gauge --
 * per the author's instruction, no separate/new distance regime is invented.
 * `threshold` defaults to the same `roundK * 0.5` estimatePatchComponents
 * always used (a generous touch threshold since smooth-min still visibly
 * separates surfaces well past exact contact -- see that function's original
 * doc comment, preserved here since this IS that same approximation, only
 * exposed as data instead of an opaque union-find pass).
 */
export function buildPatchAdjacency(
  patches: Patch[],
  roundK: number,
  threshold = Math.max(0.001, roundK * 0.5),
): PatchAdjacencyEdge[] {
  const edges: PatchAdjacencyEdge[] = [];
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      const best = patchPairClearance(patches[i], patches[j]);
      if (best <= threshold) {
        edges.push({ aId: patches[i].id, bId: patches[j].id, distance: best, reason: best <= 0 ? "touching" : "near" });
      }
    }
  }
  return edges;
}

/** Same edge semantics as buildPatchAdjacency, but measures only pairs that
 * touch one selected patch. This avoids rebuilding the complete O(n²) graph
 * when the author merely clicks or nudges one motif. */
export function buildPatchAdjacencyForPatch(
  patches: Patch[],
  patchId: number,
  roundK: number,
  threshold = Math.max(0.001, roundK * 0.5),
): PatchAdjacencyEdge[] {
  const selectedIndex = patches.findIndex((patch) => patch.id === patchId);
  if (selectedIndex < 0) return [];
  const selected = patches[selectedIndex];
  const edges: PatchAdjacencyEdge[] = [];
  for (let index = 0; index < patches.length; index++) {
    if (index === selectedIndex) continue;
    const other = patches[index];
    const best = patchPairClearance(selected, other);
    if (best > threshold) continue;
    const aPatch = index < selectedIndex ? other : selected;
    const bPatch = index < selectedIndex ? selected : other;
    edges.push({ aId: aPatch.id, bId: bPatch.id, distance: best, reason: best <= 0 ? "touching" : "near" });
  }
  return edges;
}

export interface PatchGroups {
  groupA: number[];
  groupB: number[];
}

/**
 * Seed-driven A/B candidate (T13 §2): A = every patch reachable from any
 * seed id by walking the adjacency graph (its connected component(s)), B =
 * everything else. This is a PROPOSAL only -- the caller (main.ts) keeps it
 * as an editable draft the author can override patch-by-patch before
 * recording a `confirmPartition` history entry; nothing here decides which
 * side is "kept". Unknown seed ids (not in `patches`) are ignored rather
 * than throwing, so a stale seed list from a prior state doesn't crash the
 * proposal.
 */
export function proposeGroupsFromSeeds(patches: Patch[], edges: PatchAdjacencyEdge[], seedIds: number[]): PatchGroups {
  const known = new Set(patches.map((p) => p.id));
  const adjacency = new Map<number, number[]>();
  for (const p of patches) adjacency.set(p.id, []);
  for (const edge of edges) {
    adjacency.get(edge.aId)?.push(edge.bId);
    adjacency.get(edge.bId)?.push(edge.aId);
  }
  const groupA = new Set<number>();
  const queue = seedIds.filter((id) => known.has(id));
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (groupA.has(id)) continue;
    groupA.add(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!groupA.has(neighbor)) queue.push(neighbor);
    }
  }
  const groupB = patches.map((p) => p.id).filter((id) => !groupA.has(id));
  return { groupA: [...groupA], groupB };
}

/**
 * Two-ended split proposal. Each patch is ranked by the difference between
 * its graph-geodesic distance from the A endpoint and the B endpoint, then
 * the ordered patches are divided at the midpoint. This keeps the proposal
 * close to 50/50 while respecting the packed shape's adjacency instead of
 * treating one connected component as a single side.
 */
export function proposeGroupsBetweenEndpoints(
  patches: Patch[],
  edges: PatchAdjacencyEdge[],
  seedAId: number,
  seedBId: number,
): PatchGroups {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  if (seedAId === seedBId || !byId.has(seedAId) || !byId.has(seedBId)) {
    return { groupA: [], groupB: patches.map((patch) => patch.id) };
  }

  const representative = (patch: Patch): PatchPoint => {
    const n = Math.max(1, patch.points.length);
    const sum = patch.points.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z, r: 0 }),
      { x: 0, y: 0, z: 0, r: 0 },
    );
    return { x: sum.x / n, y: sum.y / n, z: sum.z / n, r: 0 };
  };
  const positions = new Map(patches.map((patch) => [patch.id, representative(patch)]));
  const adjacency = new Map<number, Array<{ id: number; cost: number }>>();
  for (const patch of patches) adjacency.set(patch.id, []);
  for (const edge of edges) {
    const a = positions.get(edge.aId);
    const b = positions.get(edge.bId);
    if (!a || !b) continue;
    const cost = Math.max(1e-6, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    adjacency.get(edge.aId)?.push({ id: edge.bId, cost });
    adjacency.get(edge.bId)?.push({ id: edge.aId, cost });
  }

  const distancesFrom = (sourceId: number): Map<number, number> => {
    const distances = new Map(patches.map((patch) => [patch.id, Number.POSITIVE_INFINITY]));
    const pending = new Set(patches.map((patch) => patch.id));
    distances.set(sourceId, 0);
    while (pending.size > 0) {
      let current: number | null = null;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (const id of pending) {
        const distance = distances.get(id)!;
        if (distance < currentDistance) {
          current = id;
          currentDistance = distance;
        }
      }
      if (current === null) break;
      pending.delete(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        const candidate = currentDistance + neighbor.cost;
        if (candidate < distances.get(neighbor.id)!) distances.set(neighbor.id, candidate);
      }
    }
    return distances;
  };

  const distanceA = distancesFrom(seedAId);
  const distanceB = distancesFrom(seedBId);
  const positionA = positions.get(seedAId)!;
  const positionB = positions.get(seedBId)!;
  const euclidean = (id: number, target: PatchPoint): number => {
    const p = positions.get(id)!;
    return Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
  };
  const score = (id: number): number => {
    const a = distanceA.get(id)!;
    const b = distanceB.get(id)!;
    return (Number.isFinite(a) ? a : euclidean(id, positionA)) -
      (Number.isFinite(b) ? b : euclidean(id, positionB));
  };

  const targetA = Math.ceil(patches.length / 2);
  const middle = patches
    .map((patch) => patch.id)
    .filter((id) => id !== seedAId && id !== seedBId)
    .sort((a, b) => score(a) - score(b) || a - b);
  const inA = new Set([seedAId, ...middle.slice(0, Math.max(0, targetA - 1))]);
  const inB = new Set(patches.map((patch) => patch.id).filter((id) => !inA.has(id)));

  // Connectivity repair for the intended "two physical pieces" workflow.
  // Keep the component containing each endpoint and move every same-colour
  // island to the opposite side. On a connected source graph, an island
  // necessarily touches the opposite endpoint component after this A-then-B
  // pass, so both results remain connected. If the source graph itself has
  // endpoint-free components, the later real-mesh gate still fails closed.
  const reachableWithin = (seedId: number, group: Set<number>): Set<number> => {
    const reached = new Set<number>();
    const queue = group.has(seedId) ? [seedId] : [];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (reached.has(id)) continue;
      reached.add(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (group.has(neighbor.id) && !reached.has(neighbor.id)) queue.push(neighbor.id);
      }
    }
    return reached;
  };
  const connectedA = reachableWithin(seedAId, inA);
  for (const id of [...inA]) {
    if (!connectedA.has(id)) {
      inA.delete(id);
      inB.add(id);
    }
  }
  const connectedB = reachableWithin(seedBId, inB);
  for (const id of [...inB]) {
    if (!connectedB.has(id)) {
      inB.delete(id);
      inA.add(id);
    }
  }

  return {
    groupA: patches.map((patch) => patch.id).filter((id) => inA.has(id)),
    groupB: patches.map((patch) => patch.id).filter((id) => inB.has(id)),
  };
}

export type { Ball, FieldParams };

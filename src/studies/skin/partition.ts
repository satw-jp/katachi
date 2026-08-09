// ---------------------------------------------------------------------------
// T13 "coin由来A/B分割" -- physically splitting the composite solid into two
// complementary parts along a patch-group boundary, NOT a plane and NOT a
// hole carved through the middle (author's instruction, codex-instruction-
// 20260719-katachi-coin-ab-partition.md §3). Builds directly on this
// Study's own field/mesh machinery (compositeSdf, buildMeshesFromSharedField)
// -- nothing here reimplements marching-tetrahedra or the smooth-min ops.
//
// Two rounds of audit fixes are folded in here (both documented in
// skin/README.md's Observation log, not restated per-line below):
//
// audit-fixes (P0-1/P0-2/P0-3 first round): `overlap/gap` must be measured
// on the ACTUAL output triangles (`meshFidelity`, via buildInsideTester),
// not by re-evaluating the analytic fields (kept as `fieldConsistency`, a
// fast but non-authoritative sanity check). buildPartitionMeshes runs off
// the main thread (see partition.worker.ts).
//
// gate-correction (this round): (1) original/A/B must share exactly ONE
// physical scale -- buildMeshesFromSharedField previously derived each
// field's scaleMmPerUnit from THAT field's own longest edge, so A and B
// were independently stretched to targetLongestMm and saved in incompatible
// unit systems. (2) the watertight check that gates a normal export must
// run on the mesh AS IT WILL ACTUALLY BE SAVED (float32-rounded STL bytes),
// not the pre-rounding Float64 in-memory triangles -- Katachi's own
// Float64 check said "watertight" for a mesh Optimizer's independent
// float32 STL reader found non-manifold. (3) the gate must also weigh
// volumeDiff and the inconsistent-volume measurement, and must use each
// Monte Carlo quantity's 95% UPPER bound (Wilson score, not a normal
// approximation that reports margin=0 at a zero count) rather than the
// bare point estimate.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import {
  buildMeshesFromSharedField,
  computeSignedMeshVolume,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  rescaleMeshResult,
} from "../cloud-sculpt/meshExport.ts";
import type { Bounds, MeshBuildResult, SavedStlTopologyReport } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import { buildInsideTester } from "../../lib/geometry/pointInMesh.ts";
import { compositeSdf } from "./field.ts";
import type { Patch, SkinMode } from "./field.ts";
import { computeSkinSamplingBounds, countConnectedComponents } from "./meshExport.ts";

export interface PartitionSideResult {
  patchIds: number[];
  mesh: MeshBuildResult;
  connectedComponents: number;
  /** abs(signedVolumeMm3) -- kept for backward-compatible display. */
  volumeMm3: number;
  /** winding-volume-final Task 4: the divergence-theorem sum WITHOUT
   * Math.abs. A consistently-outward-wound closed mesh is positive; a
   * globally-reversed or winding-broken mesh can read negative or an
   * implausibly small magnitude (partial cancellation) -- this is the
   * cheapest signal that `savedTopology.windingConsistent` should also be
   * checked before trusting `volumeMm3`. */
  signedVolumeMm3: number;
  /** Topology of the mesh AS SAVED (float32-rounded STL bytes) -- this, not
   * `mesh.watertight` (Float64, pre-rounding), is what the gate checks. */
  savedTopology: SavedStlTopologyReport;
}

/** Fast analytic sanity check: re-evaluates dOriginal/sdfA/sdfB at sample
 * points directly (not the output triangles). Confirms the ownership
 * FORMULA is analytically exact -- it CANNOT detect a marching-tetrahedra
 * reconstruction defect, because it never looks at the mesh that was
 * actually produced. See `meshFidelity` for the real measurement. */
export interface FieldConsistencyReport {
  sampleCount: number;
  insideOriginalSamples: number;
  overlapVolumeMm3: number;
  gapVolumeMm3: number;
}

/** One Monte Carlo quantity: point estimate plus a Wilson-score 95% upper
 * bound (never 0 just because the sample count of successes was 0 -- see
 * wilsonUpper95's doc comment) in both count and volume form. */
export interface FidelityQuantity {
  count: number;
  volumeMm3: number;
  upper95Count: number;
  upper95VolumeMm3: number;
}

/** Authoritative measurement: samples points against the REAL
 * meshA/meshB/originalMesh triangle soups (ray-parity point-in-mesh test).
 * `overlap` = inside both A and B's output mesh; `gap` = inside the
 * original output mesh but neither A nor B; `inconsistent` = inside A or B
 * but NOT inside the original mesh (should be near-zero if the ownership
 * math and reconstruction agree -- measured, not assumed). Every quantity
 * carries a Wilson-score 95% upper bound, not just a point estimate, so a
 * literal-zero sample count is never reported as "zero risk". */
export interface MeshFidelityReport {
  sampleCount: number;
  insideOriginalSamples: number;
  overlap: FidelityQuantity;
  gap: FidelityQuantity;
  inconsistent: FidelityQuantity;
  seed: string;
}

export interface PartitionGateCheck {
  ok: boolean;
  /** point estimate ratio (measured/originalVolume), for display only --
   * the gate itself decides pass/fail from `upper95Ratio`. */
  ratio: number;
  upper95Ratio: number;
  toleranceRatio: number;
}

export interface PartitionGateResult {
  ok: boolean;
  reasons: string[];
  originalVolumeFinite: boolean;
  commonScale: boolean;
  watertightOriginal: boolean;
  watertightA: boolean;
  watertightB: boolean;
  singleComponentA: boolean;
  singleComponentB: boolean;
  /** winding-volume-final Task 1/4: true only when original/A/B ALL have
   * valid saved topology (closed + windingConsistent + degenerateFree).
   * When false, signed volume / volumeDiff / the Monte Carlo ratios below
   * are NOT trustworthy (a broken mesh's "volume" is not a real number) and
   * the gate fails on this alone, regardless of what those numbers say. */
  volumeMetricsValid: boolean;
  /** winding-volume-final Task 5: gap/overlap must condition on samples
   * that landed inside the original mesh -- if none did (degenerate
   * sampling bounds, or a vanishingly small original), that ratio is
   * undecidable, not zero. */
  insideOriginalSamplesValid: boolean;
  overlap: PartitionGateCheck;
  gap: PartitionGateCheck;
  inconsistent: PartitionGateCheck;
  volumeDiff: PartitionGateCheck;
}

export interface PartitionResult {
  a: PartitionSideResult;
  b: PartitionSideResult;
  /** abs(originalSignedVolumeMm3) -- kept for backward-compatible display. */
  originalVolumeMm3: number;
  originalSignedVolumeMm3: number;
  /** Topology of the ORIGINAL mesh AS SAVED (float32-rounded, common
   * scale) -- winding-volume-final Task 1: previously only A/B were
   * checked, but volumeDiff/ratio math implicitly trusts original's
   * triangles too, so an invalid original must also fail the gate. */
  originalSavedTopology: SavedStlTopologyReport;
  /** null when volumeMetricsValid is false -- winding-volume-final Task 4:
   * "無効時はvolumeDiffMm3: null等にし、0や見かけ上小さい値を出さない". */
  volumeDiffMm3: number | null;
  /** Triangle-scan estimate over part A's own mesh (see estimateBoundaryAreaMm2) --
   * an approximation, not an exact area integral over the analytic cut surface. */
  boundaryAreaMm2: number;
  fieldConsistency: FieldConsistencyReport;
  meshFidelity: MeshFidelityReport;
  /** Common to original/A/B by construction (P0-1) -- also re-verified as
   * gate.commonScale rather than only assumed from the code path. */
  scaleMmPerUnit: number;
  resolution: number;
  targetLongestMm: number;
  /** Computed HERE (not by a separate main-thread function) so the UI and
   * provenance can never compute gate pass/fail differently -- both read
   * this same object (gate-correction P0-3: "ゲート結果と同じ値を
   * provenanceへ保存し、UIだけ別計算にしない"). */
  gate: PartitionGateResult;
}

export interface PartitionOptions {
  resolution: number;
  targetLongestMm: number;
}

export type PartitionProgress = (fraction: number, stage: string) => void;

// Gate tolerances (仮決め -- no material/print calibration behind these
// numbers; author judgment only, per both audit documents). All are ratios
// against the common-scale original volume.
const OVERLAP_TOLERANCE_RATIO = 0.01;
const GAP_TOLERANCE_RATIO = 0.01;
const INCONSISTENT_TOLERANCE_RATIO = 0.01;
const VOLUME_DIFF_TOLERANCE_RATIO = 0.01;

/**
 * Build the two complementary A/B solids for a confirmed patch grouping.
 *
 * Ownership field (instruction §3, initial design adopted as-is): for a
 * candidate point, dA/dB are the composite fields built from ONLY that
 * group's own patches (same host/thickness/mode/roundK, so a fair
 * comparison). `dA - dB < 0` reads "closer to A's own patch composite than
 * B's" -- NOT a distance-to-nearest-patch in isolation, but a genuine
 * ownership field derived from each group's smooth-blended shape, so a
 * patch's neighbors on the same side still pull the boundary the way a
 * human tracing "which cluster does this bit of shell belong to" would.
 * Intersecting that half-space with the TRUE original composite (`max`,
 * the exact/non-smoothed boolean, not smoothMin) means every point kept in
 * either output was already part of the original solid at the CONTINUOUS
 * level -- `meshFidelity` measures whether the DISCRETIZED (marching-
 * tetrahedra), FLOAT32-ROUNDED (`savedTopology`) output still holds that
 * property, instead of assuming it does.
 *
 * dOriginal/dA/dB are each evaluated exactly ONCE per grid corner (shared
 * across all three output fields via buildMeshesFromSharedField). A/B are
 * then rescaled (not remeshed) onto the ORIGINAL field's own scale so all
 * three share one physical unit system (gate-correction P0-1).
 */
export function buildPartitionMeshes(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  allPatches: Patch[],
  groupAIds: number[],
  groupBIds: number[],
  roundK: number,
  options: PartitionOptions,
  coinBulge: number,
  onProgress?: PartitionProgress,
): PartitionResult {
  if (host.length === 0) {
    throw new Error("実体（ホスト）が空です。まず育ててください。");
  }
  const idSet = new Set(allPatches.map((p) => p.id));
  const aSet = new Set(groupAIds);
  const bSet = new Set(groupBIds);
  for (const id of aSet) {
    if (bSet.has(id)) throw new Error(`Patch #${id} がA/B両方に割り当てられています`);
  }
  const assigned = new Set<number>([...aSet, ...bSet]);
  if (assigned.size !== idSet.size || ![...idSet].every((id) => assigned.has(id))) {
    throw new Error("A/B群は全Patchを重複・未割当なく1回ずつ割り当ててください");
  }
  if (aSet.size === 0 || bSet.size === 0) {
    throw new Error("A/Bとも1個以上のPatchが必要です");
  }

  const patchesA = allPatches.filter((p) => aSet.has(p.id));
  const patchesB = allPatches.filter((p) => bSet.has(p.id));

  const bounds = computeSkinSamplingBounds(host, hostK, thickness, allPatches);
  const sampleAll = (x: number, y: number, z: number): Record<"original" | "sdfA" | "sdfB", number> => {
    const dOriginal = compositeSdf(mode, host, hostK, thickness, allPatches, roundK, x, y, z, coinBulge);
    const dA = compositeSdf(mode, host, hostK, thickness, patchesA, roundK, x, y, z, coinBulge);
    const dB = compositeSdf(mode, host, hostK, thickness, patchesB, roundK, x, y, z, coinBulge);
    return { original: dOriginal, sdfA: Math.max(dOriginal, dA - dB), sdfB: Math.max(dOriginal, dB - dA) };
  };
  onProgress?.(0, "サンプリング中");
  const meshes = buildMeshesFromSharedField(bounds, ["original", "sdfA", "sdfB"] as const, sampleAll, options, onProgress);
  const originalMesh = orientMeshForSavedStl(meshes.original);
  // P0-1: force A/B onto the ORIGINAL field's own scale instead of each
  // using its own (different) longest-edge-derived scale. originalMesh
  // itself needs no rescale -- its scale IS the canonical one.
  const canonicalScale = originalMesh.scaleMmPerUnit;
  const meshA = orientMeshForSavedStl(rescaleMeshResult(meshes.sdfA, canonicalScale));
  const meshB = orientMeshForSavedStl(rescaleMeshResult(meshes.sdfB, canonicalScale));

  const signedVolumeA = computeSignedMeshVolume(meshA);
  const signedVolumeB = computeSignedMeshVolume(meshB);
  const signedVolumeOriginal = computeSignedMeshVolume(originalMesh);
  const volumeA = Math.abs(signedVolumeA);
  const volumeB = Math.abs(signedVolumeB);
  const originalVolume = Math.abs(signedVolumeOriginal);

  onProgress?.(0, "境界面積を推定中");
  const dA = (x: number, y: number, z: number) => compositeSdf(mode, host, hostK, thickness, patchesA, roundK, x, y, z, coinBulge);
  const dB = (x: number, y: number, z: number) => compositeSdf(mode, host, hostK, thickness, patchesB, roundK, x, y, z, coinBulge);
  const step = bounds.longest / Math.max(8, Math.round(options.resolution));
  const boundaryAreaMm2 = estimateBoundaryAreaMm2(meshA, dA, dB, step);

  onProgress?.(0, "解析場の整合を確認中");
  const dOriginal = (x: number, y: number, z: number) =>
    compositeSdf(mode, host, hostK, thickness, allPatches, roundK, x, y, z, coinBulge);
  const sdfAFn = (x: number, y: number, z: number) => Math.max(dOriginal(x, y, z), dA(x, y, z) - dB(x, y, z));
  const sdfBFn = (x: number, y: number, z: number) => Math.max(dOriginal(x, y, z), dB(x, y, z) - dA(x, y, z));
  const fieldConsistency = estimateFieldConsistency(bounds, dOriginal, sdfAFn, sdfBFn, canonicalScale);

  // winding-volume-final Task 1: original's own saved topology is now
  // checked too (previously only A/B were) -- volumeDiff/ratio math
  // implicitly trusts original's triangles, so an invalid original must
  // also invalidate those numbers, not just an invalid A or B.
  onProgress?.(0, "保存後STLの位相を検証中（float32丸め後）");
  const savedTopologyOriginal = inspectSavedStlTopology(originalMesh.triangles, canonicalScale);
  const savedTopologyA = inspectSavedStlTopology(meshA.triangles, canonicalScale);
  const savedTopologyB = inspectSavedStlTopology(meshB.triangles, canonicalScale);
  const volumeMetricsValid = savedTopologyOriginal.ok && savedTopologyA.ok && savedTopologyB.ok;

  onProgress?.(0, "出力メッシュの重複・隙間を検証中（実三角形）");
  // winding-volume-final Task 5: gap/overlap-inside-original are now scaled
  // by original's EXACT (signed-triangle-sum) volume instead of a
  // Monte-Carlo bbox-volume estimate -- see verifyMeshPartition's doc
  // comment for the ~6.94x discrepancy this fixes. `originalVolume` here is
  // the same number reported in provenance regardless of volumeMetricsValid
  // (the measurement itself doesn't fail -- the GATE separately refuses to
  // trust it when volumeMetricsValid is false, via watertightOriginal/
  // watertightA/watertightB/volumeMetricsValid reasons).
  const meshFidelity = verifyMeshPartition(bounds, originalMesh, meshA, meshB, canonicalScale, originalVolume, (fraction) =>
    onProgress?.(fraction, "出力メッシュの重複・隙間を検証中（実三角形）"),
  );

  const volumeDiffMm3 = volumeMetricsValid ? Math.abs(signedVolumeA + signedVolumeB - signedVolumeOriginal) : null;
  const gate = evaluatePartitionGate({
    originalVolumeMm3: originalVolume,
    volumeDiffMm3,
    volumeMetricsValid,
    commonScale: meshA.scaleMmPerUnit === canonicalScale && meshB.scaleMmPerUnit === canonicalScale,
    watertightOriginal: savedTopologyOriginal.ok,
    watertightA: savedTopologyA.ok,
    watertightB: savedTopologyB.ok,
    connectedComponentsA: savedTopologyA.connectedComponents,
    connectedComponentsB: savedTopologyB.connectedComponents,
    meshFidelity,
  });

  return {
    a: {
      patchIds: [...aSet],
      mesh: meshA,
      connectedComponents: countConnectedComponents(meshA.triangles),
      volumeMm3: volumeA,
      signedVolumeMm3: signedVolumeA,
      savedTopology: savedTopologyA,
    },
    b: {
      patchIds: [...bSet],
      mesh: meshB,
      connectedComponents: countConnectedComponents(meshB.triangles),
      volumeMm3: volumeB,
      signedVolumeMm3: signedVolumeB,
      savedTopology: savedTopologyB,
    },
    originalVolumeMm3: originalVolume,
    originalSignedVolumeMm3: signedVolumeOriginal,
    originalSavedTopology: savedTopologyOriginal,
    volumeDiffMm3,
    boundaryAreaMm2,
    fieldConsistency,
    meshFidelity,
    scaleMmPerUnit: canonicalScale,
    resolution: options.resolution,
    targetLongestMm: options.targetLongestMm,
    gate,
  };
}

/**
 * The single source of truth for pass/fail (gate-correction P0-3): computed
 * once inside buildPartitionMeshes (so it runs in the Worker, alongside the
 * measurements it judges) and carried in `PartitionResult.gate` -- neither
 * the UI nor provenance ever recompute this independently.
 */
export function evaluatePartitionGate(input: {
  originalVolumeMm3: number;
  /** null when volumeMetricsValid is false -- see PartitionResult doc. */
  volumeDiffMm3: number | null;
  volumeMetricsValid: boolean;
  commonScale: boolean;
  watertightOriginal: boolean;
  watertightA: boolean;
  watertightB: boolean;
  connectedComponentsA: number;
  connectedComponentsB: number;
  meshFidelity: MeshFidelityReport;
}): PartitionGateResult {
  const reasons: string[] = [];
  const originalVolumeFinite = Number.isFinite(input.originalVolumeMm3) && input.originalVolumeMm3 > 0;
  if (!originalVolumeFinite) reasons.push("元形状の体積が0または非有限です");
  if (!input.commonScale) reasons.push("original/A/Bのscaleが一致していません");
  if (!input.watertightOriginal) reasons.push("元形状の保存後STLがwatertightではありません");
  if (!input.watertightA) reasons.push("part-Aの保存後STLがwatertightではありません");
  if (!input.watertightB) reasons.push("part-Bの保存後STLがwatertightではありません");
  const singleComponentA = input.connectedComponentsA === 1;
  const singleComponentB = input.connectedComponentsB === 1;
  if (!singleComponentA) reasons.push(`part-Aが${input.connectedComponentsA}個の独立部品に分かれています（必要1個）`);
  if (!singleComponentB) reasons.push(`part-Bが${input.connectedComponentsB}個の独立部品に分かれています（必要1個）`);
  // winding-volume-final Task 1/4: a mesh with invalid saved topology has
  // no trustworthy volume -- this is checked EXPLICITLY (not inferred from
  // watertightA/B/Original alone) because it's the one condition that must
  // gate every ratio-based check below, and stating it once here keeps that
  // dependency visible instead of implicit in five separate places.
  if (!input.volumeMetricsValid) {
    reasons.push("元形状またはA/Bの保存後トポロジーが無効なため、体積・統計指標を合否判定に使用できません");
  }

  const insideOriginalSamplesValid = input.meshFidelity.insideOriginalSamples > 0;
  if (!insideOriginalSamplesValid) {
    reasons.push("サンプル点が元形状内部に1つも無く、重複・未割当の割合を判定できません");
  }

  const denom = originalVolumeFinite ? input.originalVolumeMm3 : Number.POSITIVE_INFINITY;
  const ratiosTrustworthy = input.volumeMetricsValid && insideOriginalSamplesValid;
  const check = (quantity: FidelityQuantity, toleranceRatio: number, label: string): PartitionGateCheck => {
    const ratio = quantity.volumeMm3 / denom;
    const upper95Ratio = quantity.upper95VolumeMm3 / denom;
    const ok = originalVolumeFinite && ratiosTrustworthy && upper95Ratio <= toleranceRatio;
    if (!ok && ratiosTrustworthy) {
      // Only add a numeric reason when the number itself is trustworthy --
      // otherwise the volumeMetricsValid/insideOriginalSamplesValid reasons
      // above already explain the failure, and printing a ratio computed
      // from an invalid mesh would misleadingly suggest the NUMBER is what
      // failed rather than its precondition.
      reasons.push(
        `${label}の95%上限が元形状の${(upper95Ratio * 100).toFixed(2)}%（許容${(toleranceRatio * 100).toFixed(0)}%超）`,
      );
    }
    return { ok, ratio, upper95Ratio, toleranceRatio };
  };
  const overlap = check(input.meshFidelity.overlap, OVERLAP_TOLERANCE_RATIO, "実メッシュ重複体積");
  const gap = check(input.meshFidelity.gap, GAP_TOLERANCE_RATIO, "実メッシュ未割当体積");
  const inconsistent = check(input.meshFidelity.inconsistent, INCONSISTENT_TOLERANCE_RATIO, "A/Bにあるが元形状外の不整合体積");

  const volumeDiffOk =
    originalVolumeFinite &&
    input.volumeMetricsValid &&
    input.volumeDiffMm3 !== null &&
    input.volumeDiffMm3 / denom <= VOLUME_DIFF_TOLERANCE_RATIO;
  const volumeDiffRatio = input.volumeDiffMm3 !== null ? input.volumeDiffMm3 / denom : Number.POSITIVE_INFINITY;
  if (!volumeDiffOk && input.volumeMetricsValid) {
    reasons.push(`元形状との体積差が${(volumeDiffRatio * 100).toFixed(2)}%（許容${(VOLUME_DIFF_TOLERANCE_RATIO * 100).toFixed(0)}%超）`);
  }
  const volumeDiff: PartitionGateCheck = {
    ok: volumeDiffOk,
    ratio: volumeDiffRatio,
    upper95Ratio: volumeDiffRatio, // volumeDiff is a direct measurement, not a Monte Carlo count -- no CI to widen it.
    toleranceRatio: VOLUME_DIFF_TOLERANCE_RATIO,
  };

  const ok =
    originalVolumeFinite &&
    input.commonScale &&
    input.watertightOriginal &&
    input.watertightA &&
    input.watertightB &&
    singleComponentA &&
    singleComponentB &&
    input.volumeMetricsValid &&
    insideOriginalSamplesValid &&
    overlap.ok &&
    gap.ok &&
    inconsistent.ok &&
    volumeDiffOk;

  return {
    ok,
    reasons,
    originalVolumeFinite,
    commonScale: input.commonScale,
    watertightOriginal: input.watertightOriginal,
    watertightA: input.watertightA,
    watertightB: input.watertightB,
    singleComponentA,
    singleComponentB,
    volumeMetricsValid: input.volumeMetricsValid,
    insideOriginalSamplesValid,
    overlap,
    gap,
    inconsistent,
    volumeDiff,
  };
}

/**
 * Triangle-scan boundary-area estimate: sum the area of every triangle in
 * part A's own mesh whose centroid sits within ~1.5 grid steps of the
 * dA=dB cut (i.e. near the shared boundary rather than on the original
 * outer surface). An approximation (grid-step-dependent), not an exact
 * area integral over the analytic ownership surface -- documented in the
 * UI/README rather than presented as exact, per AGENTS §6 "正直な計算".
 */
function estimateBoundaryAreaMm2(
  mesh: MeshBuildResult,
  dA: (x: number, y: number, z: number) => number,
  dB: (x: number, y: number, z: number) => number,
  stepFieldUnits: number,
): number {
  const eps = stepFieldUnits * 1.5;
  let area = 0;
  for (const tri of mesh.triangles) {
    const cx = (tri.a.x + tri.b.x + tri.c.x) / 3;
    const cy = (tri.a.y + tri.b.y + tri.c.y) / 3;
    const cz = (tri.a.z + tri.b.z + tri.c.z) / 3;
    if (Math.abs(dA(cx, cy, cz) - dB(cx, cy, cz)) > eps) continue;
    const ux = tri.b.x - tri.a.x;
    const uy = tri.b.y - tri.a.y;
    const uz = tri.b.z - tri.a.z;
    const vx = tri.c.x - tri.a.x;
    const vy = tri.c.y - tri.a.y;
    const vz = tri.c.z - tri.a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    area += Math.hypot(nx, ny, nz) / 2;
  }
  return area * mesh.scaleMmPerUnit ** 2;
}

/**
 * Fast analytic sanity check (see FieldConsistencyReport doc comment) --
 * re-evaluates the SDF formulas directly at sample points, same style as
 * field.ts's estimateCoverage (uniform Monte Carlo, deterministic via
 * makeRng/hashSeed). Kept because a mismatch here (which should never
 * happen given the `max()` construction) would indicate a bug in the
 * ownership formula ITSELF, distinct from a reconstruction defect.
 */
function estimateFieldConsistency(
  bounds: Bounds,
  dOriginal: (x: number, y: number, z: number) => number,
  sdfA: (x: number, y: number, z: number) => number,
  sdfB: (x: number, y: number, z: number) => number,
  scaleMmPerUnit: number,
  sampleCount = 20000,
  seed = "skin-partition-field-consistency",
): FieldConsistencyReport {
  const rng = makeRng(hashSeed(seed));
  const bboxVolumeFieldUnits = bounds.size.x * bounds.size.y * bounds.size.z;
  let insideOriginal = 0;
  let overlap = 0;
  let gap = 0;
  for (let i = 0; i < sampleCount; i++) {
    const x = bounds.min.x + rng() * bounds.size.x;
    const y = bounds.min.y + rng() * bounds.size.y;
    const z = bounds.min.z + rng() * bounds.size.z;
    if (dOriginal(x, y, z) >= 0) continue;
    insideOriginal++;
    const inA = sdfA(x, y, z) < 0;
    const inB = sdfB(x, y, z) < 0;
    if (inA && inB) overlap++;
    if (!inA && !inB) gap++;
  }
  const perSampleVolume = sampleCount > 0 ? bboxVolumeFieldUnits / sampleCount : 0;
  const scale3 = scaleMmPerUnit ** 3;
  return {
    sampleCount,
    insideOriginalSamples: insideOriginal,
    overlapVolumeMm3: overlap * perSampleVolume * scale3,
    gapVolumeMm3: gap * perSampleVolume * scale3,
  };
}

/**
 * Wilson score interval's upper bound for a binomial proportion (Wilson
 * 1927) -- unlike the normal approximation `p +/- 1.96*sqrt(p(1-p)/n)`,
 * this stays well-behaved at k=0 or k=n (gate-correction P1-1: the normal
 * approximation reports margin=0 at k=0, silently claiming a Monte Carlo
 * sample that happened to find zero occurrences PROVES the true rate is
 * zero, which a finite sample can never do). At k=0, this reduces to
 * z^2/(n+z^2) (~3.84/n for large n at 95%, the well-known "rule of three"
 * ballpark), giving a small but honestly non-zero upper bound instead.
 */
export function wilsonUpper95(successCount: number, sampleCount: number): number {
  if (sampleCount <= 0) return 1;
  const z = 1.96;
  const n = sampleCount;
  const phat = successCount / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return Math.min(1, (center + margin) / denominator);
}

/** Unconditioned: proportion of the FULL sample (bbox-wide), scaled by the
 * bbox's own Monte Carlo volume estimate. Used only for `inconsistent`
 * (winding-volume-final Task 5's "outside original" population has no
 * independent exact-volume reference to condition on -- bbox-wide is a
 * valid, if conservative, absolute upper bound on that material's volume;
 * the gate then expresses it as a ratio against original's EXACT volume). */
function fidelityQuantity(successCount: number, sampleCount: number, perSampleVolumeMm3: number): FidelityQuantity {
  const upper95Fraction = wilsonUpper95(successCount, sampleCount);
  return {
    count: successCount,
    volumeMm3: successCount * perSampleVolumeMm3,
    upper95Count: upper95Fraction * sampleCount,
    upper95VolumeMm3: upper95Fraction * sampleCount * perSampleVolumeMm3,
  };
}

/**
 * winding-volume-final Task 5: conditioned on a sub-population (here,
 * `insideOriginalSamples`) and scaled by that condition's own EXACT volume
 * (signed-triangle-sum, not a Monte Carlo bbox estimate). The previous
 * round's `overlap`/`gap` used the unconditioned bbox-wide fidelityQuantity
 * above -- since the original solid typically occupies only a few percent
 * of its own sampling bbox, that inflated the effective "volume per
 * sample" by the same factor the bbox is larger than the solid (the
 * instruction's re-audit measured ~6.94x for the real CoinSRF case: a
 * bbox-based estimate of original's own volume, ~37,054mm3, against the
 * signed-triangle-sum truth, ~5,336mm3). Conditioning on
 * insideOriginalSamples and scaling by the EXACT original volume removes
 * that inflation for the two quantities that are naturally population
 * subsets of "inside original" (gap, and the inside-original half of
 * overlap). Returns an all-Infinity report (undecidable, not zero) when
 * `conditionSampleCount<=0` -- callers must fail closed on that, which
 * evaluatePartitionGate's `insideOriginalSamplesValid` does.
 */
export function conditionedFidelityQuantity(
  successCount: number,
  conditionSampleCount: number,
  conditionVolumeMm3: number,
): FidelityQuantity {
  if (conditionSampleCount <= 0) {
    return {
      count: successCount,
      volumeMm3: Number.POSITIVE_INFINITY,
      upper95Count: Number.POSITIVE_INFINITY,
      upper95VolumeMm3: Number.POSITIVE_INFINITY,
    };
  }
  const phat = successCount / conditionSampleCount;
  const upper95Fraction = wilsonUpper95(successCount, conditionSampleCount);
  return {
    count: successCount,
    volumeMm3: phat * conditionVolumeMm3,
    upper95Count: upper95Fraction * conditionSampleCount,
    upper95VolumeMm3: upper95Fraction * conditionVolumeMm3,
  };
}

/**
 * Authoritative fidelity measurement (see MeshFidelityReport doc comment):
 * samples deterministic points across the shared bounding box and tests
 * each against the ACTUAL triangle soups of `originalMesh`, `meshA`,
 * `meshB` via buildInsideTester (ray-parity point-in-mesh, Y/Z-bucketed for
 * speed). `onProgress` is called periodically (every 5% of samples).
 * `originalVolumeMm3` is the caller's best-available measurement of
 * original's own volume (exact signed-triangle-sum, abs'd) -- passed
 * through regardless of topology validity so the numbers are still
 * reported for diagnosis; the GATE (not this function) is what refuses to
 * trust them when invalid.
 */
function verifyMeshPartition(
  bounds: Bounds,
  originalMesh: MeshBuildResult,
  meshA: MeshBuildResult,
  meshB: MeshBuildResult,
  scaleMmPerUnit: number,
  originalVolumeMm3: number,
  onProgress?: (fraction: number) => void,
  sampleCount = 20000,
  seed = "skin-partition-mesh-fidelity",
): MeshFidelityReport {
  const originalTester = buildInsideTester(originalMesh.triangles);
  const aTester = buildInsideTester(meshA.triangles);
  const bTester = buildInsideTester(meshB.triangles);
  const rng = makeRng(hashSeed(seed));
  const bboxVolumeFieldUnits = bounds.size.x * bounds.size.y * bounds.size.z;
  let insideOriginal = 0;
  let overlapInsideOriginal = 0;
  let gap = 0;
  let inconsistent = 0;
  const progressEvery = Math.max(1, Math.floor(sampleCount / 20));
  for (let i = 0; i < sampleCount; i++) {
    const x = bounds.min.x + rng() * bounds.size.x;
    const y = bounds.min.y + rng() * bounds.size.y;
    const z = bounds.min.z + rng() * bounds.size.z;
    const inOriginal = originalTester.isInside(x, y, z);
    const inA = aTester.isInside(x, y, z);
    const inB = bTester.isInside(x, y, z);
    if (inOriginal) {
      insideOriginal++;
      if (inA && inB) overlapInsideOriginal++;
      if (!inA && !inB) gap++;
    } else if (inA || inB) {
      // Includes both "A and B both (wrongly) claim this outside point"
      // and "exactly one of A/B claims it" -- winding-volume-final Task 5
      // explicitly folds original-external overlap into `inconsistent`
      // rather than double-reporting it under `overlap` too.
      inconsistent++;
    }
    if (i % progressEvery === 0) onProgress?.(i / sampleCount);
  }
  onProgress?.(1);
  const bboxPerSampleVolumeMm3 = sampleCount > 0 ? (bboxVolumeFieldUnits / sampleCount) * scaleMmPerUnit ** 3 : 0;
  return {
    sampleCount,
    insideOriginalSamples: insideOriginal,
    overlap: conditionedFidelityQuantity(overlapInsideOriginal, insideOriginal, originalVolumeMm3),
    gap: conditionedFidelityQuantity(gap, insideOriginal, originalVolumeMm3),
    inconsistent: fidelityQuantity(inconsistent, sampleCount, bboxPerSampleVolumeMm3),
    seed,
  };
}

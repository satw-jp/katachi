// ---------------------------------------------------------------------------
// S-interior-growth's 出口 (instruction §11): mesh build (reusing cloud-
// sculpt/meshExport.ts's marching-tetrahedra + saved-topology-gate mechanism,
// not copying it), per-candidate STL + provenance saved SEPARATELY (§10:
// "候補ごとに…個別に保存できるようにする。全部を一括自動ダウンロードしなくてよい").
// ---------------------------------------------------------------------------

import {
  buildMeshFromField,
  computeMeshVolume,
  encodeBinaryStl,
  inspectSavedStlTopology,
  meshSummary as baseMeshSummary,
  orientMeshForSavedStl,
  rescaleMeshResult,
  type Bounds,
  type MeshBuildResult,
  type SavedStlTopologyReport,
} from "../cloud-sculpt/meshExport.ts";
import type { FabricationEnvelope, GrowthParams, GrowthUnit, GrowthUnitKind, HostFitResult, HostFixtureId, PrinterPreset, Vec3 } from "./field.ts";
import { buildPlateOffset, hostBounds, vDot, vNorm } from "./field.ts";
import { sha256Hex } from "../../lib/hash.ts";
import { COVERAGE_REFERENCE_RESOLUTION, COVERAGE_SAMPLE_COUNT, COVERAGE_SAMPLE_SEED } from "./coverage.ts";
import { createUnitsFieldSampler, summarizeMetrics, type GrowthMetrics, type GrowthResult, type GrowthVariant } from "./growth.ts";
import type { HistoryEntry } from "./history.ts";
import { serializeRecipe } from "./history.ts";

export type { MeshBuildResult };

// --- build-plate half-space (P2.2) -------------------------------------------
// Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-plate-
// support-and-export-plane.md §3: the units' smooth-min union inflates material
// resting on the plate OUTWARD, so the saved isosurface used to sit below the
// build plate. Fixed by intersecting the material field with the
// above-the-plate half-space BEFORE meshing — never by translating the finished
// mesh (§3 "単に完成mesh全体を上へ平行移動して最低Zを0にする方法は避ける").

export type BuildAxisKey = "x" | "y" | "z";

/**
 * Which cardinal axis `buildAxis` lies on, and in which direction. This Study
 * only ever produces +x/+y/+z (ui.ts's axis radio, main.ts's
 * `{x: axis==="x"?1:0, ...}`), and `buildPlateOffset` already documents that
 * only axis-aligned build axes are supported — the sign is carried anyway so
 * the half-space and the measurement below can never disagree about direction.
 */
function cardinalBuildAxis(buildAxis: Vec3): { axis: BuildAxisKey; sign: 1 | -1 } {
  const a = vNorm(buildAxis);
  const ax = Math.abs(a.x);
  const ay = Math.abs(a.y);
  const az = Math.abs(a.z);
  if (ax >= ay && ax >= az) return { axis: "x", sign: a.x < 0 ? -1 : 1 };
  if (ay >= az) return { axis: "y", sign: a.y < 0 ? -1 : 1 };
  return { axis: "z", sign: a.z < 0 ? -1 : 1 };
}

/**
 * Where the build plate sits in the SAVED mesh's own coordinates, recorded on
 * the mesh so a later measurement never has to guess the axis or re-derive the
 * host's plate offset.
 *
 * Investigated for this fix (documented because it is not what the name
 * suggests): `orientMeshForSavedStl` in ../cloud-sculpt/meshExport.ts orients
 * FACES only — it flips winding per connected component and drops
 * float32-degenerate triangles. It never rotates, translates or re-origins
 * geometry, and neither does `rescaleMeshResult` (it only re-derives
 * mmBounds/watertight at an externally chosen scale). So the saved mesh stays
 * in the host's own field frame: the build axis is still whatever
 * `envelope.buildAxis` was (y by default), and the plate plane is still at the
 * host's `buildPlateOffset`, NOT at 0.
 */
export interface SavedPlateReference {
  axis: BuildAxisKey;
  sign: 1 | -1;
  /** `dot(platePoint, buildAxis)` in FIELD units — the plate's coordinate along the signed build axis, in the saved mesh's own (un-re-origined) frame. */
  plateOffsetFieldUnits: number;
}

/** `buildCandidateMesh`'s result: a plain `MeshBuildResult` plus the plate reference above (structured-clone safe — the Worker posts this mesh to the main thread). */
export interface CandidateMeshResult extends MeshBuildResult {
  plateReference?: SavedPlateReference;
}

/** Above-the-build-plate half-space in this Study's SDF convention (negative = inside/above the plate): `plateOffset - dot(p, buildAxis)`. */
export function aboveBuildPlateSdf(x: number, y: number, z: number, axis: Vec3, plateOffset: number): number {
  return plateOffset - vDot({ x, y, z }, axis);
}

/** Numerical tolerance for build-plate boundary checks, in mm: `min(layerHeightMm / 4, 0.05)` (correction doc §3 "数値許容差はmesh離散化由来の小さい値に限定する"). Mesh-discretisation scale only — deliberately NOT blendK, which is 2.8-3.4mm at this Study's canonical scale and would re-admit exactly the defect this tolerance exists to catch. Falls back to the 0.05mm cap for a non-positive/non-finite layer height (a mid-edit UI value must not turn into NaN and silently pass a comparison). */
export function plateBoundaryEpsilonMm(layerHeightMm: number): number {
  const cap = 0.05;
  if (!Number.isFinite(layerHeightMm) || layerHeightMm <= 0) return cap;
  return Math.min(layerHeightMm / 4, cap);
}

/**
 * Lowest coordinate of the SAVED mesh along the build axis, in mm, measured
 * RELATIVE TO THE BUILD PLATE PLANE (plate = 0, above the plate = positive) —
 * so `< 0` means the saved shape pokes below the plate.
 *
 * Which axis, and why "relative to": `orientMeshForSavedStl` orients faces
 * only — it never rotates or re-origins the geometry (see
 * `SavedPlateReference` above for the full finding), so the saved mesh keeps
 * the host's own field frame, the build axis stays on whatever axis
 * `envelope.buildAxis` named (y for the default envelope), and the plate plane
 * is at the host's own `buildPlateOffset` rather than at 0. That offset is
 * therefore subtracted here, using the `plateReference` `buildCandidateMesh`
 * attaches. A mesh WITHOUT a plateReference (a synthetic test fixture, or a
 * mesh from some other path) is measured as +y with the plate at 0.
 *
 * Vertices are float32-rounded first, exactly as `encodeBinaryStl` writes them
 * — this is the coordinate a reader of the saved bytes would measure, not the
 * pre-rounding Float64 in memory. Returns 0 for a triangle-less mesh (there is
 * nothing to measure; an empty mesh already fails the save gate on its own
 * condition).
 */
export function meshLowestBuildAxisMm(mesh: CandidateMeshResult): number {
  if (mesh.triangles.length === 0) return 0;
  const ref = mesh.plateReference;
  const axis: BuildAxisKey = ref?.axis ?? "y";
  const sign = ref?.sign ?? 1;
  // `plateOffsetFieldUnits` is already dot(platePoint, buildAxis), i.e. the
  // plate's coordinate ALONG the signed axis — scaling it to mm is all that is
  // needed (multiplying by `sign` a second time would double-apply it).
  const plateAlongAxisMm = (ref?.plateOffsetFieldUnits ?? 0) * mesh.scaleMmPerUnit;
  let lowest = Infinity;
  for (const t of mesh.triangles) {
    for (const v of [t.a, t.b, t.c]) {
      const coord = sign * Math.fround(v[axis] * mesh.scaleMmPerUnit);
      if (coord < lowest) lowest = coord;
    }
  }
  return lowest - plateAlongAxisMm;
}

/**
 * How many saved vertices lie within `plateBoundaryEpsilonMm(layerHeightMm)`
 * of the build plate plane — correction doc §3 "plate面と接する頂点/面が存在する".
 * The clip's whole point is a genuinely flat bottom face IN the plate plane, so
 * the absence of a dip alone is not evidence of it; this counts the material
 * that actually reaches the plane. Counts VERTICES (not welded, not faces):
 * marching tetrahedra emits duplicated vertices per triangle, so this is a
 * presence/absence measure, not a vertex-cardinality claim.
 */
export function countPlateContactVertices(mesh: CandidateMeshResult, layerHeightMm: number): number {
  const epsilon = plateBoundaryEpsilonMm(layerHeightMm);
  const ref = mesh.plateReference;
  const axis: BuildAxisKey = ref?.axis ?? "y";
  const sign = ref?.sign ?? 1;
  const plateAlongAxisMm = (ref?.plateOffsetFieldUnits ?? 0) * mesh.scaleMmPerUnit;
  let count = 0;
  for (const t of mesh.triangles) {
    for (const v of [t.a, t.b, t.c]) {
      const coord = sign * Math.fround(v[axis] * mesh.scaleMmPerUnit) - plateAlongAxisMm;
      if (Math.abs(coord) <= epsilon) count++;
    }
  }
  return count;
}

/** Bounds from the accepted units' own point positions+radii (not the host's — a candidate can legitimately stay well inside the host). Falls back to the host's own bounds when there are zero accepted units (caller still refuses to build a mesh in that case, see buildCandidateMesh). `plateOffset`/`buildAxis`: the sampling box must also contain at least `margin` of room BELOW the build plate plane, or marching tetrahedra has no positive-valued grid corner beneath the clipped field and cannot close the new flat bottom face. Only ever grows the box, and only when the plate is that close — a candidate whose material sits far above the plate keeps exactly the bounds it had before this fix. */
export function computeUnitBounds(units: GrowthUnit[], hostId: HostFixtureId, blendK: number, buildAxis: Vec3, plateOffset: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const u of units) {
    for (const p of u.points) {
      minX = Math.min(minX, p.x - p.r);
      minY = Math.min(minY, p.y - p.r);
      minZ = Math.min(minZ, p.z - p.r);
      maxX = Math.max(maxX, p.x + p.r);
      maxY = Math.max(maxY, p.y + p.r);
      maxZ = Math.max(maxZ, p.z + p.r);
    }
  }
  if (units.length === 0) {
    const hb = hostBounds(hostId);
    minX = hb.min.x;
    minY = hb.min.y;
    minZ = hb.min.z;
    maxX = hb.max.x;
    maxY = hb.max.y;
    maxZ = hb.max.z;
  }
  const margin = Math.max(0.2, blendK * 1.5);
  const min = { x: minX - margin, y: minY - margin, z: minZ - margin };
  const max = { x: maxX + margin, y: maxY + margin, z: maxZ + margin };
  // Guarantee `margin` of room below the plate plane (see the doc comment).
  const { axis, sign } = cardinalBuildAxis(buildAxis);
  const platePlaneCoord = sign * plateOffset; // plateOffset is dot(platePoint, buildAxis); its coordinate on `axis` is sign * that
  if (sign > 0) {
    const materialBottom = min[axis] + margin; // the units' own extreme, before padding
    if (materialBottom <= platePlaneCoord + margin) min[axis] = Math.min(min[axis], platePlaneCoord - margin);
  } else {
    const materialBottom = max[axis] - margin;
    if (materialBottom >= platePlaneCoord - margin) max[axis] = Math.max(max[axis], platePlaneCoord + margin);
  }
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

/**
 * Builds the candidate's mesh at the CANONICAL scale (§7: derived once from
 * the host's own bounds, shared by all three candidates — never each
 * candidate's own bbox). `buildMeshFromField` is called with an arbitrary
 * `targetLongestMm` (irrelevant, immediately discarded) purely to get its
 * marching-tetrahedra mechanism; `rescaleMeshResult` then re-derives
 * mmBounds/watertight at `result.canonicalScaleMmPerUnit`, the same
 * gate-correction idiom S-skin's A/B partition already established.
 *
 * P2.2 (correction doc §3): what is meshed is NOT the units' smooth union
 * alone but its INTERSECTION with the above-the-build-plate half-space —
 * `savedField = max(unitsSmoothField, aboveBuildPlateHalfSpace)`. The
 * intersection is a HARD `Math.max`, never a smooth blend: the requirement is
 * a genuinely flat bottom face lying IN the plate plane, and a smooth
 * intersection would round it away and put material back below the plate. The
 * host id and build axis come from `result` itself (`hostId`,
 * `envelope.buildAxis`) rather than from new parameters.
 */
export function buildCandidateMesh(result: GrowthResult, resolution: number, blendK: number): CandidateMeshResult {
  if (result.units.length === 0) {
    throw new Error("採用されたunitがありません。この候補は書き出せません（生成条件を見直してください）。");
  }
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const bounds = computeUnitBounds(result.units, result.hostId, blendK, buildAxis, plateOffset);
  // O4 §9: one spatial index built per candidate and reused across every
  // marching-tetrahedra sample, instead of rescanning all units per sample.
  const materialAt = createUnitsFieldSampler(result.units, blendK);
  const savedField = (x: number, y: number, z: number): number =>
    Math.max(materialAt(x, y, z), aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset));
  const raw = buildMeshFromField(bounds, savedField, {
    resolution,
    targetLongestMm: 1,
  });
  const rescaled = rescaleMeshResult(raw, result.canonicalScaleMmPerUnit);
  const { axis, sign } = cardinalBuildAxis(buildAxis);
  return {
    ...orientMeshForSavedStl(rescaled),
    plateReference: { axis, sign, plateOffsetFieldUnits: plateOffset },
  };
}

export interface SaveGateResult {
  ok: boolean;
  topology: SavedStlTopologyReport;
  reasons: string[];
  /** Measured lowest saved build-axis coordinate relative to the plate, in mm (see meshLowestBuildAxisMm). Always set by evaluateSaveGate — optional only so a synthetic gate object in a test need not restate it. */
  lowestBuildAxisMm?: number;
  /** The tolerance that measurement was judged against, in mm (see plateBoundaryEpsilonMm). Always set by evaluateSaveGate. */
  plateBoundaryEpsilonMm?: number;
}

/**
 * §11's normal-save gate: non-empty, finite coordinates, watertight, winding
 * consistent, 0 boundary edges, 0 non-manifold edges, 0 degenerate triangles,
 * plus (§2.1 "生成STLがbuild volumeを超えたら保存ゲート不合格") the saved mesh's own
 * mm bounding box must fit within the printer's raw build volume — checked
 * against the RAW volume, not the (1-margin) fit target, since Phase B
 * branching or a unit's own radius can legitimately push the actual mesh a
 * little past the host's nominal bounds that the margin was sized against.
 * A failing mesh is never silently treated as 0/pass — every failing
 * condition is listed in `reasons` (AGENTS §6 "正直な計算").
 *
 * P2.2 (correction doc §3 "保存ゲート"): also rejects a mesh whose lowest saved
 * build-axis coordinate falls below the build plate by more than
 * `plateBoundaryEpsilonMm(layerHeightMm)`. `buildCandidateMesh` already clips
 * the field at the plate, but the doc is explicit that the mesh-side clip and
 * the gate-side detection are BOTH required — a mesh arriving from any other
 * path (a replayed recipe, a future generator) still has to prove it.
 */
export function evaluateSaveGate(mesh: CandidateMeshResult, buildVolumeMm: Vec3, layerHeightMm: number): SaveGateResult {
  const topology = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);
  const reasons: string[] = [];
  if (mesh.triangles.length === 0) reasons.push("メッシュが空です");
  const hasNonFinite = mesh.triangles.some(
    (t) =>
      ![t.a, t.b, t.c].every(
        (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
      ),
  );
  if (hasNonFinite) reasons.push("非有限座標を含みます");
  if (!topology.closed) reasons.push(`境界が閉じていません（開いた辺 ${topology.openEdges} / 非多様体辺 ${topology.nonManifoldEdges}）`);
  if (!topology.windingConsistent) reasons.push(`面方向が不整合です（${topology.windingInconsistentEdges} 辺）`);
  if (!topology.degenerateFree) reasons.push(`退化三角形が ${topology.degenerateTriangleCount} 枚あります（Float32保存時）`);
  // S2.1 audit-fix §3.3: a "monolithic" (one-piece) candidate must actually
  // BE one piece — this Study makes no partitioned/assembled candidates
  // (that's S4's future responsibility, no exception carved out here).
  // Independent audit found the old gate silently accepted a 3-4-component
  // STL as a normal save because it only checked watertightness, never
  // component count.
  if (topology.connectedComponents !== 1) {
    reasons.push(`一体形状ではありません（connected component数 ${topology.connectedComponents}、monolithicには1が必要）`);
  }
  const size = mesh.mmBounds.size;
  if (size.x > buildVolumeMm.x || size.y > buildVolumeMm.y || size.z > buildVolumeMm.z) {
    reasons.push(
      `build volumeを超えています (${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}mm vs ${buildVolumeMm.x}×${buildVolumeMm.y}×${buildVolumeMm.z}mm)`,
    );
  }
  const lowestBuildAxisMm = meshLowestBuildAxisMm(mesh);
  const epsilonMm = plateBoundaryEpsilonMm(layerHeightMm);
  if (lowestBuildAxisMm < -epsilonMm) {
    reasons.push(
      `build plate平面より下へ出ています（保存meshの最低build軸座標 ${lowestBuildAxisMm.toFixed(3)}mm、許容 -${epsilonMm.toFixed(3)}mm = min(layer height/4, 0.05mm)）`,
    );
  }
  return { ok: reasons.length === 0, topology, reasons, lowestBuildAxisMm, plateBoundaryEpsilonMm: epsilonMm };
}

export function meshSummary(mesh: MeshBuildResult): string {
  return baseMeshSummary(mesh);
}

export function variantFileSuffix(variant: GrowthVariant): string {
  return variant; // "field-only" | "coin-constrained" | "ring-constrained" — already filename-safe
}

export function makeExportBaseName(hostId: HostFixtureId): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `katachi-interior-growth-${hostId}-${stamp}`;
}

// --- provenance --------------------------------------------------------------

export interface CandidateProvenance {
  toolVersion: string;
  generatedAt: string;
  sourceFixture: {
    hostId: HostFixtureId;
    boundsLongestFieldUnits: number;
  };
  printer: {
    presetId: PrinterPreset["id"];
    label: string;
    source: PrinterPreset["source"];
    buildVolumeMm: Vec3;
    studyMarginFraction: number;
  };
  hostBboxMm: Vec3;
  canonicalScaleMmPerUnit: number;
  resolution: number;
  params: GrowthParams;
  envelope: FabricationEnvelope;
  /** §4: Katachi's own local overhang-angle convention, restated in every provenance file so it is never ambiguous later — 0° = downward face parallel to the build plate, 90° = vertical wall. Not asserted to match any specific slicer's own angle definition. */
  angleConvention: "0deg=parallel-to-plate, 90deg=vertical-wall (Katachi local approximation, not asserted to match any specific slicer)";
  variant: GrowthVariant;
  effectiveKind: GrowthUnitKind;
  primaryPathUnitIds: number[];
  heightCoverage: number;
  topReached: boolean;
  /** §3.1 "recipeへreference mesh条件とseedを保存" — the exact reference-sample-set identity this run's metrics.measuredSurfaceCoverage was measured against, so a later re-measurement can confirm it used the same reference. */
  coverageReference: {
    resolution: number;
    sampleCount: number;
    seed: string;
  };
  metrics: GrowthMetrics;
  /** S2.1 (Optimizer/docs/sonnet-instruction-20260725-katachi-interior-growth-s2-1-coverage-attainment.md §10): measured coverage sampled after every accepted colonization unit, so a later viewer can see the shape of the search (fast early gains vs. a long zero-gain tail), not just the final number. null for a migrated pre-S2.1 legacy result. */
  coverageCurve: number[] | null;
  /**
   * Study仮値 multi-term score weights actually used this run (§5.5
   * "weightは作者UIへ出さない…Study仮値としてコードとREADMEに根拠を残す") — never
   * author-editable. S2.1 audit-fix §7.3: taken from `result.scoreWeights`
   * (a snapshot captured AT GENERATION TIME), never from the current
   * SCORE_WEIGHTS constant directly — a replayed older recipe must not get
   * provenance that looks like it used whatever weights today's code
   * happens to have. `null` for a migrated pre-S2.1 legacy result (the
   * concept didn't exist yet).
   */
  scoreWeights: Record<string, number> | null;
  topology: SavedStlTopologyReport;
  /**
   * P2.2 (correction doc §3 "provenanceへ最低座標と判定値を残す"): the MEASURED
   * lowest saved build-axis coordinate relative to the build plate plane, in mm
   * (negative = below the plate), and the tolerance it was judged against.
   * Recorded as numbers, not as a verdict — a later reader can re-apply their
   * own threshold instead of having to trust this run's pass/fail.
   */
  savedLowestBuildAxisMm: number;
  savedPlateBoundaryEpsilonMm: number;
  /** How many saved vertices lie within that tolerance OF the plate plane — evidence that the clipped bottom face actually reaches the plate, rather than merely not dipping below it (correction doc §3 "plate面と接する頂点/面が存在する"). A vertex count over the un-welded triangle soup, so a presence measure, not a vertex cardinality claim. */
  savedPlateContactVertexCount: number;
  /** R3: 保存STLを単体で読むための座標系情報。記述のみで、geometryへは適用していない。 */
  savedFrame: SavedFrameProvenance;
  meshVolumeMm3: number;
  /** null until the STL has actually been saved once (this function is called before the save dialog fires — see main.ts). */
  savedStlSha256: string | null;
  /** True if this candidate's own envelope (or the recipe it was replayed from) went through history.ts's legacy-recipe migration (§8). */
  legacyMigrated: boolean;
  limits: string[];
}

const TOOL_VERSION = "0.2.0";

const PROVENANCE_LIMITS = [
  "hostSdfは3種の合成フィクスチャすべてで近似（符号は正しいが正確な距離場ではない）",
  "host内外判定・clip記録の許容量は unit半径の25% — 完全な boolean intersection ではない",
  "void/occupancy/最大横張り出しはgrid resolutionに依存する近似値（Monte Carlo的グリッドサンプリング）",
  "unsupported-span推定はunit自身のradiusに比例した内部derived値であり、作者入力のmm値ではない",
  "ring-discontinuous-supportは同じ内部derived値を流用した簡易判定であり、独立したスライサー相当の検証ではない",
  "support threshold angleはKatachi独自の局所近似規約であり、特定スライサーと同一のsupport領域になるとは断定しない",
  "primaryPathはPhase Aで一度だけ確定し、Phase Bの分岐追加後も変わらない",
  "この結果は「内部サポート危険域の推定」であり、印刷可能性・サポート不要を断定しない",
  "surface coverageはhost SDFから直接作った参照sample集合に対する近似測定であり、生成meshの実表面積そのものではない",
  "ring材質のcovered判定はnode間の先細りcapsule近似であり、厳密なtube形状の境界ではない",
  "surface coverageは指定被覆率をどれだけ満たしたかの推定であり、これだけで支持不要・印刷可能・強度が高いを断定しない",
  "プレート接触unitは複数あるが graph rootは常に1で、全unitは既存材質への接触経由でのみ増える（独立rootではない）",
  "region launch候補（near-plate）はunit重心がプレート近傍にあるだけの粗い候補集合であり、材質接触を検証した数ではない — 検証済みの数は metrics.actualPlateContactCount（材質最下端がlayer height以内）",
  "actualPlateContactCountはunit自身の材質最下端とプレート面の距離をcanonical scaleでmm換算した判定であり、実機で接着・定着したことの確認ではない",
  "build plate上のunitはrule 5のoverhang cone判定を免除する（板が支えるため）— これは造形上の仮定であり、実機で検証していない",
  "region到達コストは step長・support角度から導いた推定unit数であり、実際の経路長そのものではない",
  "ring-constrained候補は既定条件では保存後meshが複数componentになり通常保存できない（未解決、README参照）",
  "保存meshはunitのsmooth union場をbuild plate平面のhalf-spaceとhard intersection（Math.max）してから生成する — 底面はその平面で切った面であり、実機での定着や接地面積を検証したものではない",
  "savedLowestBuildAxisMm / savedPlateContactVertexCountはmesh離散化（resolution 64のmarching tetrahedra）由来の誤差を含む測定値であり、厳密な解析解ではない",
  "savedFrame.toPrintReadyに記録した回転・平行移動は**未適用**（applied:false）であり、保存STLのbytesは変換前のraw座標のままである。この記録は印刷可能性を保証しない",
  "savedFrame.toPrintReady.directionToPositiveZが指定するのはup軸だけで、水平面内の向き（Z周りのazimuth）は指定していない。up軸を+Zへ送る回転には自由度が残り、Optimizer orientが実際に選ぶazimuthは最短弧回転とは異なる（実測）",
  "savedFrame.toPrintReady.translationAfterRotationMmはKatachiの定義（plate面をz=0へ）であり、Optimizer orientの定義（meshの最小Zをz=0へ）とは別物。両者はmeshの最下点がplateに接しているときだけ一致し、Katachiはそれを全候補で保証していない",
];


// --- R3: 保存座標系の来歴 -----------------------------------------------------

/**
 * 保存STLを**単体で**読むために必要な情報
 * (Optimizer/docs/sonnet-instruction-20260726-katachi-r3-saved-frame-provenance.md §3)。
 *
 * なぜ要るのか: 保存STLはKatachiのhost field frameをmm換算しただけで、
 * 原点も軸も正規化されていない（`SavedPlateReference` の調査コメント参照）。
 * STLファイル自体はbuild axisもplate位置も持たないため、
 * 「どちらが上か」「plateはどこか」はprovenanceにしか書けない。
 *
 * ここに書くのは**記述であって適用ではない**。geometryは一切動かさない
 * （§9 禁止「STLを回転・移動」）。Z-up / plate=0 への実変換は Optimizer `orient` の
 * 担当であり、Katachiは raw を保存して読み方だけを残す（作者判断 Q2 = A案）。
 */
export interface SavedFrameProvenance {
  /** 保存meshは `rescaleMeshResult` でmm換算済み。field単位ではない。 */
  coordinateUnit: "mm";
  /** `envelope.buildAxis` を保存mesh自身のframeで表したもの。現在UIが作るのは +x/+y/+z だけだが、型と導出は sign を落とさない。 */
  upAxis: {
    axis: BuildAxisKey;
    sign: 1 | -1;
  };
  /**
   * build plate 面の、**保存STL自身のaxis座標**（mm）。
   *
   * `savedLowestBuildAxisMm` は plate からの相対値なので流用しない。
   * `plateReference.plateOffsetFieldUnits`（= dot(platePoint, buildAxis)、
   * 既に符号付き軸に沿った量）に `scaleMmPerUnit` を掛け、
   * 生座標へ戻すために sign を1回だけ掛ける。**sign を二重に適用しない。**
   */
  platePlane: {
    axis: BuildAxisKey;
    coordinateMm: number;
  };
  /**
   * raw から Z-up / plate=0 へ変換する**手順の記述**。適用はしていない。
   *
   * `directionToPositiveZ`: 保存frameの中で、回転後に +Z になる方向。
   * `translationAfterRotationMm`: **回転後のframe**でのmm平行移動。
   *
   * --- Optimizer `orient` との対応（実測、2026-07-26） -------------------
   * この語彙は Optimizer の `orient_stl_bytes` に合わせてあるが、
   * **「同じ変換」ではない**。Optimizer 側の実装を読んで実際に走らせた結果、
   * 一致する点と一致しない点がある。似ているから同一と書かない（指示書§7）。
   *
   * 一致する:
   * - `directionToPositiveZ` ⟷ Optimizer `direction_to_positive_z`。
   *   どちらも「元frameのどの方向が回転後に +Z になるか」を、正規化した
   *   3成分ベクトルで、**符号を反転せずに**持つ。buildAxis=+Y なら両方 `[0,1,0]`
   * - 平行移動が回転の**後**に、回転後frameで効くという順序
   *
   * 一致しない（重要）:
   * 1. **平行移動の定義が違う。** Katachi のこの値は「**plate 面**を z=0 へ」。
   *    Optimizer の `translation_mm` は「**mesh の最小Z**を z=0 へ」
   *    （`mesh.bounds[0,2]` から算出）。両者が同じ数になるのは
   *    mesh の最下点が plate に接しているときだけである。
   *    Katachi は保存前に plate half-space で hard clip しており、
   *    `savedPlateContactVertexCount > 0` がその接触の証拠になるが、
   *    **どの候補でも必ず接すると保証してはいない**。接していない候補では
   *    Katachi の値と Optimizer の値はずれる（実測: 最下点が plate より
   *    10mm 上にある mesh で、Katachi 側 +81 に対し Optimizer は +71）
   * 2. **回転そのものはこの方向だけでは決まらない。** up 軸を +Z へ送る回転は
   *    Z 周りの回転の分だけ自由度が残る。Optimizer が実際に選ぶのは最短弧回転
   *    ではなく、+Y の場合 `[[0,0,-1],[-1,0,0],[0,1,0]]`（最短弧に -90° の
   *    Z 回転が乗る）。したがってこの field が指定しているのは **up 軸だけ**で、
   *    水平面内の向き（azimuth）は指定していない。行列は持たせていない —
   *    持たせると Optimizer が選ぶ azimuth と食い違う値を「変換」と称することになる
   * 3. Optimizer の `translation_mm` は「入力STLの座標単位」であり、
   *    mm であることは同ツールの前提（--scale）による。Katachi のこの値は
   *    `scaleMmPerUnit` 適用済みで実際に mm である。数値は一致しても保証が違う
   */
  toPrintReady: {
    /** 常に false。この情報を書いても bytes は変えない。 */
    applied: false;
    directionToPositiveZ: [number, number, number];
    translationAfterRotationMm: [number, number, number];
  };
}

/** 単位ベクトル（保存frame）。`sign` を掛けて向きまで表す。 */
function axisUnitVector(axis: BuildAxisKey, sign: 1 | -1): [number, number, number] {
  return [axis === "x" ? sign : 0, axis === "y" ? sign : 0, axis === "z" ? sign : 0];
}

/**
 * 保存済み mesh から `SavedFrameProvenance` を導く。
 *
 * fixture 非依存: plate 位置は `mesh.plateReference` と `mesh.scaleMmPerUnit`
 * からその都度求める。既定 +Y fixture で約 `y = -81 mm` になることは
 * テストで実測して確かめる（定数として焼き込まない）。
 */
export function deriveSavedFrame(mesh: CandidateMeshResult): SavedFrameProvenance {
  // fail closed。`plateReference` が無い mesh から保存座標系は導けない。
  //
  // 初版はここで `?? "y"` / `?? 1` / `?? 0` と既定値へ落としていた。本番の
  // `buildCandidateMesh` は必ず `plateReference` を付けるので実害は出ていなかったが、
  // export された `deriveSavedFrame` / `buildProvenance` へ別経路や synthetic mesh が
  // 渡ると、**根拠の無い `+Y / plate=0` を正しい保存座標系として記録できてしまう**。
  // R3 の目的は「provenance 単体で保存STLの読み方を説明する」ことなので、
  // 分からないものを分かった顔で書くのは目的そのものに反する
  // （Katachi AGENTS.md §1「正直な計算」「分からないものを分かった顔で表示しない」）。
  //
  // 以降は optional chaining や fallback を使わず `ref` から読む。
  //
  // 注: `meshLowestBuildAxisMm` と `countPlateContactVertices` の既存 fallback は
  // ここでは変えない。あちらは synthetic fixture との互換のために意図的に残してある
  // 測定関数であり、保存座標系の「宣言」ではない。
  const ref = mesh.plateReference;
  if (!ref) {
    throw new Error("savedFrameを導出できません: meshにplateReferenceがありません（保存座標系のaxis/plate位置を推測しません）");
  }
  const axis: BuildAxisKey = ref.axis;
  const sign: 1 | -1 = ref.sign;
  // plateOffsetFieldUnits は「符号付き軸に沿った座標」。生のaxis座標へ戻すのに
  // sign を1回だけ掛ける（meshLowestBuildAxisMm が sign を二重に掛けないのと同じ理由）。
  const plateAlongAxisMm = ref.plateOffsetFieldUnits * mesh.scaleMmPerUnit;
  const plateCoordinateMm = sign * plateAlongAxisMm;
  return {
    coordinateUnit: "mm",
    upAxis: { axis, sign },
    platePlane: { axis, coordinateMm: plateCoordinateMm },
    toPrintReady: {
      applied: false,
      directionToPositiveZ: axisUnitVector(axis, sign),
      // 回転後、plate の z は「符号付き軸に沿った plate 座標」になる。
      // それを 0 にする平行移動なので、符号を反転した値を z に置く。
      translationAfterRotationMm: [0, 0, -plateAlongAxisMm],
    },
  };
}

export function buildProvenance(
  result: GrowthResult,
  mesh: CandidateMeshResult,
  fit: HostFitResult,
  printer: PrinterPreset,
  resolution: number,
  blendK: number,
  topology: SavedStlTopologyReport,
  legacyMigrated: boolean,
): CandidateProvenance {
  const hb = hostBounds(result.hostId);
  return {
    toolVersion: TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    sourceFixture: { hostId: result.hostId, boundsLongestFieldUnits: hb.longest },
    printer: {
      presetId: printer.id,
      label: printer.label,
      source: printer.source,
      buildVolumeMm: fit.buildVolumeMm,
      studyMarginFraction: fit.marginFraction,
    },
    hostBboxMm: fit.hostBboxMm,
    canonicalScaleMmPerUnit: result.canonicalScaleMmPerUnit,
    resolution,
    params: result.params,
    envelope: result.envelope,
    angleConvention: "0deg=parallel-to-plate, 90deg=vertical-wall (Katachi local approximation, not asserted to match any specific slicer)",
    variant: result.variant,
    effectiveKind: result.effectiveKind,
    primaryPathUnitIds: result.primaryPathUnitIds,
    heightCoverage: result.heightCoverage,
    topReached: result.topReached,
    coverageReference: {
      resolution: COVERAGE_REFERENCE_RESOLUTION,
      sampleCount: COVERAGE_SAMPLE_COUNT,
      seed: COVERAGE_SAMPLE_SEED,
    },
    coverageCurve: result.coverageCurve,
    scoreWeights: result.scoreWeights,
    metrics: summarizeMetrics(result, blendK),
    topology,
    savedLowestBuildAxisMm: meshLowestBuildAxisMm(mesh),
    savedPlateBoundaryEpsilonMm: plateBoundaryEpsilonMm(result.envelope.layerHeightMm),
    savedPlateContactVertexCount: countPlateContactVertices(mesh, result.envelope.layerHeightMm),
    savedFrame: deriveSavedFrame(mesh),
    meshVolumeMm3: computeMeshVolume(mesh),
    savedStlSha256: null,
    legacyMigrated,
    limits: PROVENANCE_LIMITS,
  };
}

/**
 * R2 昇格 (2026-07-26): 実装は Library (`src/lib/hash.ts`) が正本。
 *
 * ここで `export { sha256Hex } from "../../lib/hash.ts"` と一行で書かないのは、
 * その形が **local binding を作らない**ため。このファイル自身が
 * `saveCandidateStl` の中で `sha256Hex` を呼んでいるので、
 * import と export を明示的に分ける必要がある。
 *
 * 再export を残すのは、既存の import path
 * (`import { sha256Hex } from "./meshExport.ts"` — growth.test.ts が使う) を
 * 壊さないため。
 */
export { sha256Hex };

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves the STL alone. Throws (never silently substitutes) if the save gate fails — §11 "保存後topology不合格なら通常STLを提供しない". Returns the exact bytes' SHA-256 so the caller can fold it into provenance. */
export async function saveCandidateStl(mesh: MeshBuildResult, baseName: string, variant: GrowthVariant, gate: SaveGateResult): Promise<string> {
  if (!gate.ok) {
    throw new Error(`保存後topologyが不合格のため、通常STLは提供できません: ${gate.reasons.join(" / ")}`);
  }
  const filename = `${baseName}-${variantFileSuffix(variant)}.stl`;
  const buffer = encodeBinaryStl(mesh, filename);
  const sha256 = await sha256Hex(buffer);
  downloadBlob(new Blob([buffer], { type: "model/stl" }), filename);
  return sha256;
}

export function saveCandidateProvenance(provenance: CandidateProvenance, baseName: string, variant: GrowthVariant): void {
  const filename = `${baseName}-${variantFileSuffix(variant)}-growth-provenance.json`;
  downloadBlob(new Blob([JSON.stringify(provenance, null, 2)], { type: "application/json" }), filename);
}

export function saveRecipeJson(history: HistoryEntry[], baseName: string): void {
  downloadBlob(new Blob([serializeRecipe(history)], { type: "application/json" }), `${baseName}-growth.recipe.json`);
}

// ---------------------------------------------------------------------------
// S-interior-growth (Phase 0/1A, docs/sonnet-instruction-20260724-katachi-
// interior-growth-stage1.md, plan: Optimizer/docs/katachi-optimizer-interior-
// growth-multipart-structure-plan-20260724.md).
//
// This file owns: (a) three PURE synthetic host fixtures (box/sphere/waisted,
// `hostSdf(p) < 0` = inside), (b) the data types shared by growth.ts/
// meshExport.ts/history.ts, (c) a deterministic, dimensionless "growth
// direction" field (lift/drift/cohesion — the Kumo-inspired axes named in the
// instruction §6). This is NOT Kumo's code — no weather, no moisture, no
// convection — a small pure function reproducing only the vocabulary the
// instruction asked for (§6 "Kumoの気象コードをコピーしない。まず純粋で決定論的な
// dimensionless fieldを作る").
//
// Vocabulary note: nothing here claims "support-free" or "printable". Support
// ACCEPTANCE (the 6 rules) lives in growth.ts, not here — this file only
// supplies the field a candidate is grown ALONG, before any constraint is
// applied.
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function vScale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function vDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function vLen(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
/** Normalized `a`, falling back to `fallback` (assumed already unit-length) when `a` is ~zero. */
export function vNorm(a: Vec3, fallback: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 {
  const l = vLen(a);
  return l < 1e-9 ? fallback : { x: a.x / l, y: a.y / l, z: a.z / l };
}

// ---------------------------------------------------------------------------
// Shared data types (instruction §4, adjusted per its own "既存型に合わせて調整
// してよい" — GrowthParams gained a few fields the instruction's sketch didn't
// name (unitRadius, ringNodeCount, ringTubeR, maxUnits, rootTarget) because
// there is no way to place a coin or ring in space without SOME size/count,
// and the instruction's own type sketch is explicitly a minimum, not a ban on
// additions).
// ---------------------------------------------------------------------------

export type GrowthUnitKind = "coin" | "ring";

export interface GrowthUnitPoint {
  x: number;
  y: number;
  z: number;
  r: number;
}

export type SupportContact = "build-plate" | "parent";

/**
 * What JOB this unit was accepted to do (Optimizer/docs/opus-instruction-
 * 20260725-katachi-interior-growth-connected-multisource.md §5: "各accepted
 * unitを次へ分類する… どの分類がbudgetを消費し、どれがcoverageを増やしたかを測る").
 * Purely a bookkeeping label recorded at acceptance time — no rule reads it,
 * and it never changes after the unit is registered. Older stored results
 * (pre-O2) have no `role` at all; history.ts backfills those to "unknown"
 * rather than guessing a category that was never measured.
 */
export type GrowthUnitRole =
  | "root"
  /** Phase A's build-plate -> host-top primary path. */
  | "primary-path"
  /** §6.1 connected base: plate-contacting material spreading the launch footprint. */
  | "base"
  /** §6.3 an upward trunk rising from a launch point toward its assigned regions. */
  | "trunk"
  /** §6.4's pre-surface travel: moving toward a region that isn't reachable yet. */
  | "surface-approach"
  /** §6.4 spreading along the host's local tangent plane once the surface is reached. */
  | "surface-spread"
  /** Only ever set by history.ts's migration of a result that predates this field. */
  | "unknown";

export interface GrowthUnit {
  id: number;
  kind: GrowthUnitKind;
  points: GrowthUnitPoint[];
  parentId: number | null;
  generation: number;
  supportContact: SupportContact;
  role: GrowthUnitRole;
  /** Growth heading at generation time (display/debugging only — points are already baked in world space, replay never re-reads this). */
  heading: Vec3;
  /** Vertical rise (along buildAxis) and lateral offset from the parent (or from the build plate for a root), in FIELD units. Used by the overhang gauge and by rule 5's own bookkeeping. undefined for a root has no parent to measure from — still measured from the build plate for consistency. */
  verticalStepField: number;
  lateralStepField: number;
}

// ---------------------------------------------------------------------------
// Stage 1A.1 (docs/sonnet-instruction-20260724-katachi-interior-growth-
// author-feedback.md): author feedback after trying Phase 1A directly —
// "lateral"/"span" as raw mm inputs didn't match how a printer setup is
// actually thought about; the two numbers an author recognizes are layer
// height and a support/overhang threshold ANGLE. `FabricationEnvelope` is
// redefined around that: the angle is the author input, the lateral
// allowance is a READ-ONLY derived value (never independently editable),
// and `maxUnsupportedSpanMm` is removed from the envelope entirely — the
// (still-enforced) unsupported-span rule now derives its limit from the
// unit's OWN geometry (see growth.ts's UNSUPPORTED_SPAN_FACTOR), not an
// arbitrary author mm value.
// ---------------------------------------------------------------------------

export interface FabricationEnvelope {
  buildAxis: Vec3;
  layerHeightMm: number;
  /** Author input. Katachi's own local overhang-angle convention (§4 of the
   * feedback instruction): 0° = a downward face parallel to the build plate,
   * 90° = a vertical wall. Not asserted to reproduce any specific slicer's
   * support-angle definition or output — a same-named, same-shaped knob for
   * the author to start comparisons with, calibrated later against real
   * slicer results. */
  supportThresholdAngleDeg: number;
  /** READ-ONLY, always recomputed from layerHeightMm/supportThresholdAngleDeg
   * (see computeDerivedLateralAllowance) — never stored as an independent
   * author-editable value, so it can never silently drift out of sync. */
  derivedMaxLateralAdvancePerLayerMm: number;
}

export const DEFAULT_LAYER_HEIGHT_MM = 0.2;
export const DEFAULT_SUPPORT_THRESHOLD_ANGLE_DEG = 30;

/** `0 < angle < 90` and finite — 0°/90° are asymptotes of `tan` (infinite or zero allowance) and are rejected outright rather than silently clamped. */
export function isValidSupportAngle(angleDeg: number): boolean {
  return Number.isFinite(angleDeg) && angleDeg > 0 && angleDeg < 90;
}

/**
 * §4: `layerHeightMm / tan(angleDeg)`. At 45° the allowance equals the layer
 * height exactly; larger angles (steeper required overhang tolerance) shrink
 * the allowance. Returns 0 for an invalid angle (caller must check
 * `isValidSupportAngle` first — this function does not throw, so a caller
 * mid-input-edit never sees NaN propagate into a rejection rule).
 */
export function computeDerivedLateralAllowance(layerHeightMm: number, angleDeg: number): number {
  if (!isValidSupportAngle(angleDeg) || !(layerHeightMm > 0)) return 0;
  return layerHeightMm / Math.tan((angleDeg * Math.PI) / 180);
}

/**
 * S2.1 audit-fix (Optimizer/docs/sonnet-correction-20260725-katachi-
 * interior-growth-s2-1-audit-fixes.md §4.2): the ONE shared source of truth
 * for "how much lateral advance is allowed for a step with this vertical
 * rise" — used by growth.ts's evaluateCandidate (rule 5), by
 * colonization.ts's route-feasibility check, and by the S2.1 score's
 * constraint-margin-risk term. Never reimplemented separately (an earlier
 * version had the cone-feasibility pre-filter use a DIFFERENT, inconsistent
 * margin direction than this rule — audit-confirmed bug: `90-angle-margin`
 * for the candidate tilt vs `vertical/tan(angle-margin)` for the cone,
 * which move in OPPOSITE directions as margin increases).
 *
 * verticalStepMm<=0: only the flat per-layer allowance (no rise to spend).
 * verticalStepMm>0: layerHeightMm/tan(angle) per layer, times the number of
 * layers spanned — but never fewer than 1 layer's worth, even for a rise
 * smaller than one layer. That floor matters: many SMALL steps (as
 * growSurfaceColonization takes) can each individually qualify for a full
 * layer's lateral budget despite a tiny actual rise, so a route built from
 * many small steps can reach further laterally, in total, than a single
 * continuous verticalRise/tan(angle) formula would suggest (audit §4.1's
 * finding — "小さい正のriseでは1layer分のlateral allowanceを使える").
 */
export function allowedLateralForStepMm(verticalStepMm: number, layerHeightMm: number, maxLateralPerLayerMm: number): number {
  if (verticalStepMm <= 0) return maxLateralPerLayerMm;
  const layersSpanned = Math.max(1, verticalStepMm / layerHeightMm);
  return maxLateralPerLayerMm * layersSpanned;
}

export const DEFAULT_FABRICATION_ENVELOPE: FabricationEnvelope = {
  buildAxis: { x: 0, y: 1, z: 0 },
  layerHeightMm: DEFAULT_LAYER_HEIGHT_MM,
  supportThresholdAngleDeg: DEFAULT_SUPPORT_THRESHOLD_ANGLE_DEG,
  derivedMaxLateralAdvancePerLayerMm: computeDerivedLateralAllowance(DEFAULT_LAYER_HEIGHT_MM, DEFAULT_SUPPORT_THRESHOLD_ANGLE_DEG),
};

/** True when the envelope's own numbers are usable (not NaN/negative/out-of-range) — a defensive guard against a mid-edit Custom/angle field, not an "unset" gate like Phase 1A's `isEnvelopeComplete` (§6: generation must be possible immediately, from the very first paint). */
export function isEnvelopeValid(envelope: FabricationEnvelope): boolean {
  return envelope.layerHeightMm > 0 && isValidSupportAngle(envelope.supportThresholdAngleDeg);
}

export interface GrowthParams {
  seed: string;
  /** 0..1: build-axis方向の成長傾向. */
  lift: number;
  /** 0..1: 水平方向の偏り. */
  drift: number;
  /** 0..1: 既存networkへ寄る傾向. */
  cohesion: number;
  /** 0..1: 新しい枝の発生傾向 (spawns more children per parent). */
  branching: number;
  /** 0..1: host内部の空きを残す傾向 (probability a candidate attempt is skipped before geometry is even built). */
  voidBias: number;
  unitKind: GrowthUnitKind;
  /** Nominal unit radius, in HOST-FIELD units (not mm) — instruction's type sketch has no size knob; one is unavoidable to place geometry. */
  unitRadius: number;
  /** "ring" 用ノード数. */
  ringNodeCount: number;
  /** "ring" 用チューブ半径 (unitRadius に対する比率). */
  ringTubeR: number;
  /**
   * S2.1 audit-fix (Optimizer/docs/sonnet-correction-20260725-katachi-
   * interior-growth-s2-1-audit-fixes.md §3.2): historically "目標root数" —
   * growNetwork used to spawn this many INDEPENDENT graph roots
   * (parentId=null), which could land as disconnected mesh components with
   * no material connection to each other (a real bug: default rootTarget=5
   * produced a 3-4-component "monolithic" STL that the old save gate
   * accepted). growNetwork no longer creates independent extra roots —
   * there is always exactly ONE graph root. This field is kept for recipe/
   * params-shape compatibility and is currently NOT wired to anything in
   * growSurfaceColonization (an honest no-op, not a hidden behavior change
   * dressed up as still doing what its name implies) — see
   * `actualPlateContactCount` on GrowthResult for the measured count of units
   * whose own material reaches the build plate.
   */
  rootTarget: number;
  /**
   * 0..1: 表面被覆率の目標
   * （Optimizer/docs/katachi-interior-growth-surface-coverage-plan-20260725.md
   * §6）。printer設定ではなく作者が形を決める creative parameter — layer
   * height/support threshold angleとは別セクションでUIに置く。既定0.5。
   */
  targetSurfaceCoverage: number;
}

// 生成上限は作者入力から撤去した(Stage 1A.1 §5.3) — computeAutoBudget
// (growth.ts) がhost高さとunit stepから毎回導く。GrowthParamsに
// 対応するフィールドはもう存在しない。

export const DEFAULT_GROWTH_PARAMS: GrowthParams = {
  seed: "katachi-interior-growth",
  lift: 0.6,
  drift: 0.3,
  cohesion: 0.4,
  branching: 0.35,
  voidBias: 0.3,
  unitKind: "coin",
  unitRadius: 0.14,
  ringNodeCount: 8,
  ringTubeR: 0.28,
  rootTarget: 5,
  targetSurfaceCoverage: 0.5,
};

// ---------------------------------------------------------------------------
// Host fixtures. All three SDFs are SIGN-CORRECT (inside < 0) but NOT exact
// Euclidean distance fields outside the smooth regions — same approximation
// convention already used elsewhere in Katachi (e.g. skin/field.ts's
// shellSdf). Marching-tetrahedra meshing and inside/outside classification
// only need the sign and continuity, not an exact metric, so this is
// documented as a limit, not silently passed off as precise.
// ---------------------------------------------------------------------------

export type HostFixtureId = "box" | "sphere" | "waisted";

export interface HostFixtureInfo {
  id: HostFixtureId;
  label: string;
}

export const HOST_FIXTURES: HostFixtureInfo[] = [
  { id: "box", label: "box（立方体）" },
  { id: "sphere", label: "sphere（球）" },
  { id: "waisted", label: "waisted（中央にくびれ）" },
];

const BOX_HALF: Vec3 = { x: 1, y: 1, z: 1 };
const SPHERE_R = 1.15;
const WAIST_H = 1.2;
const WAIST_R_MAX = 0.95;
const WAIST_R_MIN = 0.45;

function boxSdf(x: number, y: number, z: number): number {
  const qx = Math.abs(x) - BOX_HALF.x;
  const qy = Math.abs(y) - BOX_HALF.y;
  const qz = Math.abs(z) - BOX_HALF.z;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

function sphereSdf(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z) - SPHERE_R;
}

/**
 * "くびれ" (waisted): radius(y) is a double-Gaussian lobe (fat top and
 * bottom, pinched middle), intersected with a flat vertical extent. This is
 * NOT an exact SDF (the flat-cap intersection via `Math.max` is a standard
 * approximate-SDF idiom, sign-correct but not metric near the cap edges) —
 * good enough for §5's "hostSdf(p)<0 = inside" contract and for marching
 * tetrahedra, not offered as a precision distance field.
 */
/** Exported for renderer.ts's LatheGeometry host wireframe — no other Study reads this, kept here since it's the profile's own definition. */
export function waistedRadius(y: number): number {
  const t = Math.max(-1, Math.min(1, y / WAIST_H));
  const lobe = Math.exp(-((Math.abs(t) - 0.55) ** 2) / (2 * 0.28 ** 2));
  return WAIST_R_MIN + (WAIST_R_MAX - WAIST_R_MIN) * lobe;
}

function waistedSdf(x: number, y: number, z: number): number {
  const dRadial = Math.hypot(x, z) - waistedRadius(y);
  const dCap = Math.abs(y) - WAIST_H;
  return Math.max(dRadial, dCap);
}

export function hostSdf(id: HostFixtureId, x: number, y: number, z: number): number {
  switch (id) {
    case "box":
      return boxSdf(x, y, z);
    case "sphere":
      return sphereSdf(x, y, z);
    case "waisted":
      return waistedSdf(x, y, z);
  }
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  longest: number;
}

function makeBounds(min: Vec3, max: Vec3): Bounds {
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

/** Host bounding box in field units, WITHOUT margin (callers pad as needed — mirrors cloud-sculpt/meshExport.ts's computeSamplingBounds margin convention but kept separate since this margin is unit-radius-dependent, not ball-radius-dependent). */
export function hostBounds(id: HostFixtureId): Bounds {
  switch (id) {
    case "box":
      return makeBounds({ x: -BOX_HALF.x, y: -BOX_HALF.y, z: -BOX_HALF.z }, BOX_HALF);
    case "sphere":
      return makeBounds(
        { x: -SPHERE_R, y: -SPHERE_R, z: -SPHERE_R },
        { x: SPHERE_R, y: SPHERE_R, z: SPHERE_R },
      );
    case "waisted":
      return makeBounds(
        { x: -WAIST_R_MAX, y: -WAIST_H, z: -WAIST_R_MAX },
        { x: WAIST_R_MAX, y: WAIST_H, z: WAIST_R_MAX },
      );
  }
}

/**
 * The build plate is the plane, perpendicular to buildAxis, tangent to the
 * host's lowest point along buildAxis (§5: "build plateはbuild axisに沿った
 * host最下点の接平面"). Only axis-aligned buildAxis values (±x/±y/±z) are
 * supported by the three synthetic hosts' bounds-based lowest-point lookup —
 * documented, not a general oblique-axis solver.
 */
export function buildPlateOffset(id: HostFixtureId, buildAxis: Vec3): number {
  const b = hostBounds(id);
  // min projected onto buildAxis, using the bounds corners (exact for an
  // axis-aligned buildAxis against these three axis-aligned-bounded hosts).
  const corners: Vec3[] = [
    { x: b.min.x, y: b.min.y, z: b.min.z },
    { x: b.max.x, y: b.min.y, z: b.min.z },
    { x: b.min.x, y: b.max.y, z: b.min.z },
    { x: b.min.x, y: b.min.y, z: b.max.z },
    { x: b.max.x, y: b.max.y, z: b.min.z },
    { x: b.max.x, y: b.min.y, z: b.max.z },
    { x: b.min.x, y: b.max.y, z: b.max.z },
    { x: b.max.x, y: b.max.y, z: b.max.z },
  ];
  let minProj = Infinity;
  for (const c of corners) minProj = Math.min(minProj, vDot(c, buildAxis));
  return minProj;
}

// ---------------------------------------------------------------------------
// Growth direction field. Deterministic function of POSITION + seed only (no
// RNG draw) — this is what makes it a "field" rather than a random walk:
// re-evaluating growthDirection at the same point with the same params always
// returns the same vector, independent of generation order. RNG (growth.ts)
// is used only for WHERE to sample root/child candidate positions and for
// branching count / void-skip decisions — never for the direction itself.
// ---------------------------------------------------------------------------

/** Cheap deterministic hash noise in [-1, 1], continuous-ish, no external dependency. Not a gradient-continuous Perlin/Simplex noise — a coarse sine-hash, documented as an approximation (same spirit as the codebase's other 仮決め noise-like formulas, e.g. skin's irregularity scatter). */
function hashNoise1(x: number, y: number, z: number, salt: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + salt * 0.6180339887) * 43758.5453123;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Exported for growth.ts's primaryPathBaseHeading (Stage 1A.1 §5.1), which needs the same deterministic-noise idiom for its own lateral-direction pick. */
export function hashNoiseVec3(p: Vec3, seedInt: number): Vec3 {
  return {
    x: hashNoise1(p.x, p.y, p.z, seedInt),
    y: hashNoise1(p.y, p.z, p.x, seedInt + 101),
    z: hashNoise1(p.z, p.x, p.y, seedInt + 202),
  };
}

/**
 * Growth heading at `p`, given the current network's lateral centroid (for
 * `cohesion`). Always returns a unit vector. `lift` biases toward
 * `envelope.buildAxis`; `drift` adds a deterministic lateral wobble (its
 * component ALONG buildAxis is removed, so `drift` never fights `lift`);
 * `cohesion` gently steers toward the network's own lateral centroid so
 * branches curve back toward each other rather than radiating independently
 * (this is what "布/network" instead of "点在" is meant to encourage, same
 * vocabulary S-skin's ring-linking work used for a different geometry).
 */
export function growthDirection(
  p: Vec3,
  params: GrowthParams,
  buildAxis: Vec3,
  networkLateralCentroid: Vec3,
  seedInt: number,
): Vec3 {
  const axis = vNorm(buildAxis);
  const lift = vScale(axis, params.lift);

  const noise = hashNoiseVec3(p, seedInt);
  const noiseLateral = vSub(noise, vScale(axis, vDot(noise, axis)));
  const drift = vScale(vNorm(noiseLateral, { x: 1, y: 0, z: 0 }), params.drift);

  const towardCentroid = vSub(networkLateralCentroid, p);
  const towardCentroidLateral = vSub(towardCentroid, vScale(axis, vDot(towardCentroid, axis)));
  const cohesion = vScale(vNorm(towardCentroidLateral, { x: 0, y: 0, z: 0 }), params.cohesion * 0.6);

  const sum = vAdd(vAdd(lift, drift), cohesion);
  return vNorm(sum, axis);
}

// ---------------------------------------------------------------------------
// Stage 1A.1 §2: printer / build-volume presets. The scale that used to come
// from an author-typed "STL目標最長辺 (mm)" number now comes from fitting the
// host into a printer's build volume instead — §2.1 "targetLongestMmの数値
// 入力は主画面から除去". Only build volume is modeled; material, nozzle,
// adhesion, cooling, speed, and bridging are explicitly NOT decided here
// (§2 "材料、ノズル、実効造形限界...を決め打ちしない").
// ---------------------------------------------------------------------------

export type PrinterPresetId = "bambu-a1" | "bambu-a1-mini" | "custom";

export interface PrinterPreset {
  id: PrinterPresetId;
  label: string;
  buildVolumeMm: Vec3;
  source: "official" | "author";
}

/** Build volumes confirmed 2026-07-24 against the manufacturer's own spec pages (§2): A1 https://bambulab.com/hu/a1/tech-specs, A1 mini https://uk.store.bambulab.com/products/a1-mini. "custom"'s buildVolumeMm here is just a starting default the author overwrites — its `source` is "author", never presented as a manufacturer figure. */
export const PRINTER_PRESETS: PrinterPreset[] = [
  { id: "bambu-a1", label: "Bambu Lab A1", buildVolumeMm: { x: 256, y: 256, z: 256 }, source: "official" },
  { id: "bambu-a1-mini", label: "Bambu Lab A1 mini", buildVolumeMm: { x: 180, y: 180, z: 180 }, source: "official" },
  { id: "custom", label: "Custom", buildVolumeMm: { x: 200, y: 200, z: 200 }, source: "author" },
];

export const DEFAULT_PRINTER_PRESET_ID: PrinterPresetId = "bambu-a1-mini";

export function findPrinterPreset(id: PrinterPresetId): PrinterPreset {
  return PRINTER_PRESETS.find((p) => p.id === id)!;
}

/** Katachi's own assumed clearance inside the build volume (§2.1: "機種仕様ではなくKatachi側の仮の余白と表示" — never presented as a manufacturer figure). 10% per axis. */
export const STUDY_MARGIN_FRACTION = 0.1;

/** The magnitude of `v`'s component along one of the three CARDINAL axes (buildAxis is always exactly x/y/z in this Study — no oblique-axis solver, same limit buildPlateOffset already documents). */
function axisComponent(v: Vec3, axis: Vec3): number {
  return Math.abs(v.x * axis.x + v.y * axis.y + v.z * axis.z);
}

/** `v`'s other two components (not along `axis`), in a fixed x/y/z order skipping the axis index — used to compare a host's lateral footprint against a build volume's two non-height dimensions. */
function footprintComponents(v: Vec3, axis: Vec3): [number, number] {
  const comps: number[] = [v.x, v.y, v.z];
  const axisIdx = axis.x !== 0 ? 0 : axis.y !== 0 ? 1 : 2;
  const rest = comps.filter((_, i) => i !== axisIdx);
  return [rest[0], rest[1]];
}

export interface HostFitResult {
  scaleMmPerUnit: number;
  hostBboxMm: Vec3;
  buildVolumeMm: Vec3;
  marginFraction: number;
}

/**
 * §2.1: fit the host into `(1 - marginFraction)` of the printer's build
 * volume along all three axes simultaneously (a uniform "contain" fit, the
 * limiting axis wins) — the SAME canonical scale §7's original instruction
 * asked for, just derived from a printer preset instead of a typed mm
 * target. All three synthetic host fixtures happen to be footprint-
 * symmetric in their two non-buildAxis dimensions (box/sphere/waisted are
 * all circular or square in cross-section regardless of which axis is
 * "up"), so this fit is exact for them without needing a canonical X/Y
 * assignment between the host's local axes and the printer's W/D.
 */
export function fitHostToBuildVolume(hostId: HostFixtureId, buildAxis: Vec3, buildVolumeMm: Vec3, marginFraction = STUDY_MARGIN_FRACTION): HostFitResult {
  const b = hostBounds(hostId);
  const heightField = axisComponent(b.size, buildAxis);
  const heightMm = axisComponent(buildVolumeMm, buildAxis) * (1 - marginFraction);
  const [footA, footB] = footprintComponents(b.size, buildAxis);
  const [footAMm, footBMm] = footprintComponents(buildVolumeMm, buildAxis).map((v) => v * (1 - marginFraction)) as [number, number];
  const candidates = [
    heightField > 0 ? heightMm / heightField : Infinity,
    footA > 0 ? footAMm / footA : Infinity,
    footB > 0 ? footBMm / footB : Infinity,
  ];
  const scaleMmPerUnit = Math.min(...candidates);
  const hostBboxMm = { x: b.size.x * scaleMmPerUnit, y: b.size.y * scaleMmPerUnit, z: b.size.z * scaleMmPerUnit };
  return { scaleMmPerUnit, hostBboxMm, buildVolumeMm, marginFraction };
}

/**
 * The host's HIGHEST point along buildAxis (mirrors buildPlateOffset's
 * lowest-point lookup) — used for height-coverage (§5.4).
 */
export function hostTopOffset(id: HostFixtureId, buildAxis: Vec3): number {
  const b = hostBounds(id);
  const corners: Vec3[] = [
    { x: b.min.x, y: b.min.y, z: b.min.z },
    { x: b.max.x, y: b.min.y, z: b.min.z },
    { x: b.min.x, y: b.max.y, z: b.min.z },
    { x: b.min.x, y: b.min.y, z: b.max.z },
    { x: b.max.x, y: b.max.y, z: b.min.z },
    { x: b.max.x, y: b.min.y, z: b.max.z },
    { x: b.min.x, y: b.max.y, z: b.max.z },
    { x: b.max.x, y: b.max.y, z: b.max.z },
  ];
  let maxProj = -Infinity;
  for (const c of corners) maxProj = Math.max(maxProj, vDot(c, buildAxis));
  return maxProj;
}

// ---------------------------------------------------------------------------
// Shell containment tree for the mesh AS IT WILL BE SAVED (T1 / Phase C1).
// T2 cavity-aware orientation is deliberately NOT connected here yet: the real
// box candidate still has field-inconsistent shells, so this round stops at the
// measured classifier instead of changing any save-path orientation.
//
// WHY THIS EXISTS
// ---------------
// `inspectSavedStlTopology().connectedComponents` counts SURFACE SHELLS. That
// is a correct measurement — of a different thing than "how many pieces is
// this". A single solid with nine enclosed voids has ten shells: one outer
// boundary and nine cavity walls. Reading that 10 as "ten pieces" is the
// reading this module replaces (P2.5 measured, and this module re-derives from
// scratch, that the ring-constrained candidate is ONE solid with cavities).
//
// The signed volume alone can never make that distinction, for two independent
// reasons, both already measured in this Study:
//   - a cavity wall and a globally reversed shell share a sign, and
//   - `orientMeshForSavedStl` forces EVERY shell positive, so by the time the
//     saved mesh exists the sign has been normalised away.
// So nothing here classifies by signed volume. Classification is by
// CONTAINMENT (ray-parity point-in-mesh, the shared lib/geometry tester) and is
// then cross-checked against the material FIELD's own sign on both sides of the
// surface. A shell whose containment parity and field sign disagree is reported
// AMBIGUOUS and is never rounded to outer/cavity (AGENTS.md §1 「分からない
// ものを分かった顔で表示しない」).
//
// TWO DIFFERENT MEASUREMENTS, ON PURPOSE (Phase C1)
// -------------------------------------------------
// The containment representative is chosen DEEP — the largest offset from a
// triangle centroid that still resolves a side — because depth is what makes
// ray parity stable. Reusing that point and its mirror to ask the FIELD which
// side holds material was a defect: the mirror sits the same deep distance on
// the far side, so wherever the material layer beside a cavity wall is thinner
// than that, the mirror crosses the wall, crosses the material, and lands in
// the next void. Both sides then read confidently POSITIVE — with no cavity
// having been disproved.
//
// So the field-side verdict comes from a SEPARATE, LOCAL probe: several large,
// mutually distant triangles, both normal directions, at fixed multiples of the
// SOURCE GRID STEP the mesh was actually built with (passed in, never derived
// from a fraction of the shell's bounding box — a shell's size says nothing
// about the material thickness beside it). The containment representative is
// never made shallower to suit it, and its verdict is still reported, as
// `deepMirrorFieldCheck`, so the overshoot stays visible.
//
// The field check has FOUR outcomes, not three: `agrees`, `inconclusive` (the
// shell may still be classified by containment parity, but counted separately
// and never called "field-checked"), `contradicts`, and
// `field-inconsistent-shell` — both sides the same sign outside the measured
// error band, across several triangles and several distances, so the surface
// cannot be explained as a local zero boundary of the field at all. The last
// one is never guessed to be a cavity wall; it stays ambiguous.
//
// WHAT IS MEASURED, EXACTLY
// -------------------------
// The same triangle set that reaches the STL bytes: every vertex Float32-
// rounded at the mesh's own mm scale first (`roundVertexToF32`, the shared
// function `inspectSavedStlTopology` and `orientMeshForSavedStl` use — imported,
// not re-derived), the same "collapsed after rounding" faces excluded, and the
// same edge identity. Shells are the SAME edge-connected components
// `orientMeshForSavedStl` orients (adjacency across edges used exactly twice),
// so a shell index here and a shell there can never drift apart. Measured
// BEFORE any orientation normalisation — though the classification is in fact
// invariant to it, which the tests pin rather than assume.
// ---------------------------------------------------------------------------

import { buildInsideTester, type InsideTester } from "../../lib/geometry/pointInMesh.ts";
import {
  roundVertexToF32,
  type MeshVertex,
  type Triangle,
} from "../cloud-sculpt/meshExport.ts";

// --- shell classification -----------------------------------------------------

/**
 * What a shell bounds.
 *
 * - `outer-boundary`: even containment depth. Its own interior is material, so
 *   it is the outer surface of a SOLID component (depth 0 = the object's outer
 *   boundary, depth 2 = a solid island floating inside a cavity, …).
 * - `cavity-wall`: odd containment depth. Its own interior is void enclosed by
 *   material — it does NOT add a piece.
 * - `ambiguous`: could not be resolved. Never silently rounded to either of the
 *   above; see `ambiguousReasons` for which condition failed.
 */
export type ShellKind = "outer-boundary" | "cavity-wall" | "ambiguous";

/**
 * Outcome of cross-checking one shell's containment parity against the material
 * field, measured by the LOCAL probe (see `FieldProbeTriangle`) — never by the
 * containment representative and its mirror, which are deliberately deep and
 * can overshoot a thin material layer entirely.
 *
 * - `"agrees"`: several local triangles resolve a negative/positive boundary
 *   and its orientation matches the containment parity.
 * - `"inconclusive"`: a first-class answer, NOT a soft failure. A probe that
 *   sits inside the mesh-vs-field approximation error carries no sign
 *   information, and calling that a contradiction would reject perfectly
 *   well-determined cavity walls. The shell's kind may still be decided by
 *   containment parity, but the field did NOT confirm it.
 * - `"contradicts"`: a local boundary IS resolved, oriented opposite to the
 *   containment parity. Makes the shell ambiguous.
 * - `"field-inconsistent-shell"`: across several triangles and several
 *   distances both sides stay the SAME sign outside the error band, so this
 *   surface cannot be explained as a local zero boundary of the field at all.
 *   Makes the shell ambiguous. It is NEVER rounded to "cavity wall" — that
 *   would be exactly the "分からないものを分かった顔で表示する" this module
 *   exists to refuse.
 */
export type FieldCheck =
  | "agrees"
  | "contradicts"
  | "inconclusive"
  | "field-inconsistent-shell"
  | "not-measured";

/** Which side of a probe triangle a value was read on. Purely a label for the ±normal directions — the normal's sign depends on the input winding, so nothing may be concluded from `"plus"`/`"minus"` alone. */
export type ProbeSide = "plus" | "minus";

/**
 * The band, in field units, within which this shell's field sign says nothing:
 * the MEASURED |field| at the shell's own vertices. Those vertices lie on the
 * meshed surface, so their field magnitude IS the gap between where marching
 * tetrahedra put the surface and where the field's zero actually is.
 *
 * All four statistics are reported so no single percentile silently decides
 * anything. `decision` is the one the confidence test actually uses, and it is
 * p90 by a fixed, stated choice: the max (and, on a shell with a handful of
 * outlier vertices, p99) lets one vertex widen the band without limit, which
 * would make every probe "inconclusive"; p50 would ignore half the measured
 * error. The choice is fixed in the code and is never re-picked per shell to
 * move a shell toward an expected class.
 */
export interface FieldBand {
  p50: number;
  p90: number;
  p99: number;
  max: number;
  /** The threshold actually used: `max(p90, Number.EPSILON)` (a zero band would make every probe "confident"). */
  decision: number;
  /** How many |field| samples the four statistics were computed from. */
  sampleCount: number;
}

function shellFieldBand(
  triangleIndices: number[],
  survivors: Triangle[],
  scaleMmPerUnit: number,
  fieldAt: (x: number, y: number, z: number) => number,
): FieldBand {
  const magnitudes: number[] = [];
  const step = Math.max(1, Math.floor(triangleIndices.length / 64));
  for (let i = 0; i < triangleIndices.length; i += step) {
    const t = survivors[triangleIndices[i]];
    for (const v of [t.a, t.b, t.c]) {
      magnitudes.push(Math.abs(fieldAt(v.x / scaleMmPerUnit, v.y / scaleMmPerUnit, v.z / scaleMmPerUnit)));
    }
  }
  if (magnitudes.length === 0) {
    return { p50: 0, p90: 0, p99: 0, max: 0, decision: Number.EPSILON, sampleCount: 0 };
  }
  magnitudes.sort((a, b) => a - b);
  const at = (q: number): number => magnitudes[Math.min(magnitudes.length - 1, Math.floor(magnitudes.length * q))];
  const p90 = at(0.9);
  return {
    p50: at(0.5),
    p90,
    p99: at(0.99),
    max: magnitudes[magnitudes.length - 1],
    decision: Math.max(p90, Number.EPSILON),
    sampleCount: magnitudes.length,
  };
}

/**
 * The multiples of the SOURCE GRID STEP at which the local field probe reads
 * both sides of a probe triangle. The grid step is the real spacing the mesh
 * was built with (`bounds.longest / resolution`) and must be PASSED IN — it is
 * never derived from a fraction of the shell's own bounding box, because a
 * shell's size says nothing about how thick the material layer beside it is.
 *
 * The ladder starts well inside one cell (0.125) so that a material layer only
 * a fraction of a cell thick is still probed from within, and stops at 1.5
 * cells: past that a probe can leave the local neighbourhood the mesh triangle
 * was interpolated in, which is the very overshoot this probe replaces.
 */
export const LOCAL_PROBE_GRID_STEP_MULTIPLES: readonly number[] = [0.125, 0.25, 0.5, 1.0, 1.5];

/** One ±normal reading at one distance from one probe triangle's centroid. */
export interface FieldProbeSample {
  /** Index, within this shell's own triangle list, of the probe triangle. */
  shellTriangle: number;
  /** Multiple of the source grid step this reading was taken at. */
  gridStepMultiple: number;
  /** The distance actually used, in field units. */
  distanceFieldUnits: number;
  /** The same distance in saved mm. */
  distanceMm: number;
  /** The point actually read on the +normal side, in saved mm. Written out so it is visible that this is NOT the containment representative's point. */
  plusPointMm: MeshVertex;
  /** The point actually read on the -normal side, in saved mm. */
  minusPointMm: MeshVertex;
  /** Field value on the +normal side. */
  plusValue: number;
  /** Field value on the -normal side. */
  minusValue: number;
  /** Which side this shell's OWN inside tester puts inside the shell AT THIS DISTANCE. null when it puts both, or neither, inside — which happens as soon as the distance exceeds the shell's own thickness, and is why the orientation used for the verdict is the TRIANGLE-level one (`FieldProbeTriangle.insideSide`), taken from the nearest distance that resolved it. */
  insideSide: ProbeSide | null;
  /** Which side holds confident NEGATIVE material (|value| > band). null when neither does. */
  negativeSide: ProbeSide | null;
  /** Which side holds confident POSITIVE void. null when neither does. */
  positiveSide: ProbeSide | null;
  /** One side confidently negative, the other confidently positive: a local zero boundary IS resolved here. */
  resolved: boolean;
  /** Both sides confident and the SAME sign: this reading actively contradicts "the surface is a local zero boundary". */
  sameSign: boolean;
}

/** What the local probe found for ONE probe triangle, across the whole distance ladder. */
export type ProbeTriangleVerdict = "agrees" | "contradicts" | "same-sign" | "inconclusive";

export interface FieldProbeTriangle {
  /** Index within this shell's own triangle list. */
  shellTriangle: number;
  areaMm2: number;
  centroidMm: MeshVertex;
  /** Every reading, in ladder order. */
  samples: FieldProbeSample[];
  /**
   * Which ±normal side is the shell's own INTERIOR, taken from the nearest
   * ladder distance at which the shell's inside tester separates the two
   * points. Decided ONCE per triangle, not per distance: which side of a
   * surface is its inside is a property of the surface, while the tester stops
   * answering as soon as the probe distance exceeds the shell's own thickness.
   * null when no distance resolved it — then this triangle carries no
   * orientation and can neither agree nor contradict.
   */
  insideSide: ProbeSide | null;
  /** The ladder multiple `insideSide` came from. */
  insideSideFromGridStepMultiple: number | null;
  /**
   * The NEAREST distance whose reading carried information at all — either a
   * resolved negative/positive boundary or a confident same-sign pair — and
   * which of the two it was. Nearest, not majority, and not "the nearest
   * RESOLVED": a same-sign reading closer in than the first resolved one is the
   * more local evidence, and letting a farther reading override it is exactly
   * the overshoot this probe exists to avoid.
   */
  decidingGridStepMultiple: number | null;
  decidingReading: "resolved" | "same-sign" | null;
  /** At `decidingGridStepMultiple`, whether the shell's own inside was the negative (material) side. null when the deciding reading was same-sign, or the triangle has no orientation. */
  insideIsNegative: boolean | null;
  /** How many readings, at any distance, had both sides confident and the same sign. */
  sameSignSamples: number;
  /** How many readings resolved a negative/positive boundary at any distance. */
  resolvedSamples: number;
  /** Filled in once the containment parity is known. */
  verdict: ProbeTriangleVerdict;
}

/** Per-shell tally of `FieldProbeTriangle.verdict`. */
export interface FieldProbeTally {
  agree: number;
  contradict: number;
  sameSign: number;
  inconclusive: number;
}

/** A point strictly inside a shell, the mirrored point strictly outside it, and how they were found. All coordinates are the saved Float32 mm coordinates. */
export interface ShellRepresentative {
  /** Inside this shell (by this shell's OWN inside tester, alone). */
  point: MeshVertex;
  /** The mirror of `point` across the source triangle — strictly outside this shell. */
  outsidePoint: MeshVertex;
  /** The offset actually used, in mm. */
  offsetMm: number;
  /** MEASURED minimum distance from `point` to this shell's own surface, in mm. Not the offset — the offset is an upper bound on it. This is the "away from the surface band" evidence. */
  clearanceMm: number;
  /** Index, within this shell's own triangle list, of the triangle the point was offset from. */
  fromShellTriangle: number;
}

export interface ShellStat {
  /** Discovery-order index, stable for a given triangle array. */
  index: number;
  /** Smallest surviving-triangle index in this shell — the shell's identity, and exactly the index `orientMeshForSavedStl` starts this shell's traversal from. */
  startTriangleIndex: number;
  /** Indices into the degenerate-filtered (surviving) triangle list. */
  triangleIndices: number[];
  /** The same triangles' indices in the ORIGINAL input array. */
  sourceTriangleIndices: number[];
  triangleCount: number;
  closed: boolean;
  manifold: boolean;
  windingConsistent: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  windingInconsistentEdges: number;
  /** Divergence-theorem signed volume of this shell alone, mm^3, AS MEASURED (never normalised). Reported, never used to classify. */
  signedVolumeMm3: number;
  absoluteVolumeMm3: number;
  bboxMm: { min: MeshVertex; max: MeshVertex };
  representative: ShellRepresentative | null;
  /** How many independent representative points (from different triangles) agreed on the containment set. */
  agreeingRepresentatives: number;
  /** Number of OTHER shells containing this one. null when it could not be resolved. */
  containmentDepth: number | null;
  /** The SMALLEST containing shell by absolute volume — never the largest, never by signed-volume ordering. */
  parentShell: number | null;
  /** Every shell containing this one, ascending by index. */
  containedBy: number[];
  /** Shells this one demonstrably crosses (part of its surface inside, part outside) — mutual intersection. */
  crossesShells: number[];
  kind: ShellKind;
  /**
   * Material field at `representative.point` — the DEEP containment point, in
   * the field's own units, or null if no field was supplied.
   *
   * REPORTED, NOT DECISIVE. The containment representative is deliberately as
   * far from the surface as the shell allows, and its mirror is the same
   * distance on the other side; when the material layer beside a cavity wall is
   * thinner than that distance, the mirror crosses the wall, crosses the
   * material, and lands in another void — reading positive on both sides
   * WITHOUT that meaning "not a cavity". That defect is exactly why the verdict
   * comes from `fieldProbeTriangles` instead.
   */
  fieldInside: number | null;
  /** Material field at `representative.outsidePoint` (the deep mirror). Reported, not decisive — see `fieldInside`. */
  fieldOutside: number | null;
  /** What the deep containment point and its mirror ALONE would have concluded. Reported so the overshoot above is visible rather than invisible; it never affects `kind`, the counts, or any flag. */
  deepMirrorFieldCheck: FieldCheck;
  /** True when the LOCAL probe resolved a boundary oriented as the containment depth's parity predicts. false on `"contradicts"`. null when no field was supplied, or the local probe was inconclusive / field-inconsistent. */
  fieldAgreesWithParity: boolean | null;
  /** Outcome of the local field cross-check. `"contradicts"` and `"field-inconsistent-shell"` make a shell ambiguous; `"inconclusive"` leaves the containment verdict standing but unconfirmed. */
  fieldCheck: FieldCheck;
  /** True only when `fieldCheck === "agrees"`. A shell whose kind came from containment parity alone has this false, and must not be quoted as "field-checked". */
  fieldConfirmed: boolean;
  /** The MEASURED band (field units) below which this shell's probes carry no sign information: p50/p90/p99/max plus the threshold actually used. null when no field was supplied. */
  fieldBand: FieldBand | null;
  /** The decision threshold from `fieldBand` (`fieldBand.decision`), or null. Kept as its own field so a caller reading one number reads the one the code used. */
  fieldBandFieldUnits: number | null;
  /** The local probe's full record: several large, mutually distant triangles × the whole distance ladder. Empty when no field or no grid step was supplied. */
  fieldProbeTriangles: FieldProbeTriangle[];
  /** Tally of the above triangles' verdicts. */
  fieldProbeTally: FieldProbeTally;
  /** Why the field could NOT confirm this shell, when it could not. Never a reason for ambiguity — an inconclusive field leaves the containment verdict standing, unconfirmed. */
  fieldNotes: string[];
  ambiguousReasons: string[];
}

export interface SolidTopologyReport {
  /** Edge-connected closed-surface components — the same thing `connectedComponents` was being read as "pieces". */
  shellCount: number;
  /** Even-depth shells: how many separate pieces of material this mesh actually is. */
  solidComponentCount: number;
  /** Odd-depth shells: enclosed voids. These do NOT make the mesh multi-piece. */
  closedCavityCount: number;
  ambiguousShellCount: number;
  /** Faces dropped because they collapse in Float32 saved coordinates (same exclusion `inspectSavedStlTopology` applies). */
  degenerateTriangleCount: number;
  /**
   * True when a material field was supplied — that a cross-check was ATTEMPTED,
   * not that it succeeded. It cannot tell "all shells agreed" from "all shells
   * were inconclusive"; the four counts below are the only honest reading.
   */
  fieldChecked: boolean;
  /** Shells whose local field probe agreed with the containment parity. */
  fieldAgreementCount: number;
  /** Shells whose local field probe carried no usable sign (inside the error band, or no side confident within the local distances). Their kind, if any, rests on containment parity ALONE. */
  fieldInconclusiveCount: number;
  /** Shells where a local boundary resolved OPPOSITE to the containment parity. Each is ambiguous. */
  fieldContradictionCount: number;
  /** Shells that could not be explained as a local zero boundary at all (both sides the same sign, outside the band, across several triangles and distances). Each is ambiguous, and NONE of them is counted as a cavity. */
  fieldInconsistentShellCount: number;
  /** True when every shell got a containment depth from the containment machinery alone: unanimous representatives, a chained nesting, and no surface defect. Says nothing about the field. */
  containmentResolved: boolean;
  /** True when a field was supplied AND every shell's local probe returned `"agrees"`. False if even one shell was inconclusive. */
  fieldFullyConfirmed: boolean;
  /** True when every shell has a definite kind, i.e. `ambiguousShellCount === 0`, so every shell has a sign to orient by. Does NOT imply the field confirmed those signs. */
  safeToOrient: boolean;
  /**
   * True when nothing measured here argues against using this classification in
   * a save gate: `safeToOrient`, no contradiction, no field-inconsistent shell,
   * and no surface defect (open / non-manifold / winding-inconsistent edges, or
   * a crossing shell). Deliberately does NOT require the field to have been
   * supplied — read it together with `fieldChecked` and `fieldFullyConfirmed`,
   * which state whether the field corroborated anything at all.
   */
  safeForGate: boolean;
  shells: ShellStat[];
}

export interface SolidTopologyOptions {
  /**
   * The material field, in the MESH'S OWN field units (`< 0` = material), i.e.
   * the same convention and frame `buildMeshFromField` sampled. Probe points
   * are measured in saved mm and divided by `scaleMmPerUnit` before being
   * handed here. Optional: without it the classification rests on containment
   * parity alone and `fieldChecked` is false.
   */
  fieldAt?: (x: number, y: number, z: number) => number;
  /**
   * The REAL grid step the mesh was built with, in field units:
   * `bounds.longest / resolution`, the same `buildMeshFromField` used. The
   * local field probe's distances are multiples of it
   * (`LOCAL_PROBE_GRID_STEP_MULTIPLES`).
   *
   * Required for the local probe. Without it the field values are still
   * measured and reported, but every shell's `fieldCheck` is `"inconclusive"`
   * with that stated as the reason — the probe distance is NOT back-derived
   * from a fraction of the shell's bounding box, because a shell's size says
   * nothing about the thickness of the material layer beside it, and that
   * substitution is precisely the defect this probe replaces.
   */
  sourceGridStepFieldUnits?: number;
  /**
   * How many independent representative points (each from a different, widely
   * separated triangle) must agree about which shells contain this one.
   * Default 3, minimum 2 — a single point cannot be verified, and the whole
   * point of the check is that a non-convex shell's first guess is not trusted.
   */
  representativeCandidates?: number;
  /**
   * How many large, mutually distant triangles the LOCAL field probe reads.
   * Default 3, minimum 3 — "several triangles" is the whole reason a single
   * local reading is not trusted. These are picked independently of the
   * containment representatives and, even when the same triangles come up, the
   * points read are different points at different distances.
   */
  fieldProbeTriangles?: number;
}

const DEFAULT_REPRESENTATIVE_CANDIDATES = 3;
const DEFAULT_FIELD_PROBE_TRIANGLES = 3;
/** How many probe triangles must agree before a shell's field check is `"agrees"`. "Several", fixed here, never re-picked per shell. */
const MIN_AGREEING_PROBE_TRIANGLES = 2;
/** How many probe triangles must be same-sign, with none resolving, before a shell is `"field-inconsistent-shell"`. */
const MIN_SAME_SIGN_PROBE_TRIANGLES = 2;

/**
 * Offsets tried when looking for a representative point, as fractions of the
 * shell's own bbox diagonal, LARGEST FIRST — the deepest offset that still
 * resolves is preferred, so the point lands away from the surface band rather
 * than in the numerical noise beside it. The ladder bottoms out well below any
 * marching-tetrahedra triangle at this Study's resolutions; a shell that needs
 * a smaller offset than the last rung is reported ambiguous instead of being
 * pushed further into the noise.
 */
const OFFSET_LADDER: number[] = [];
for (let k = 3; k <= 14; k++) OFFSET_LADDER.push(2 ** -k);

const F32_KEY = (v: MeshVertex): string => `${v.x},${v.y},${v.z}`;

function subtract(a: MeshVertex, b: MeshVertex): MeshVertex {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: MeshVertex, b: MeshVertex): MeshVertex {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: MeshVertex, b: MeshVertex): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Unit normal, or null for a triangle with no area (collinear but not vertex-identical, so it survived the degenerate filter). */
function unitNormal(t: Triangle): MeshVertex | null {
  const n = cross(subtract(t.b, t.a), subtract(t.c, t.a));
  const len = Math.hypot(n.x, n.y, n.z);
  if (!(len > 0) || !Number.isFinite(len)) return null;
  return { x: n.x / len, y: n.y / len, z: n.z / len };
}

function triangleArea(t: Triangle): number {
  const n = cross(subtract(t.b, t.a), subtract(t.c, t.a));
  return Math.hypot(n.x, n.y, n.z) / 2;
}

function centroid(t: Triangle): MeshVertex {
  return { x: (t.a.x + t.b.x + t.c.x) / 3, y: (t.a.y + t.b.y + t.c.y) / 3, z: (t.a.z + t.b.z + t.c.z) / 3 };
}

/** Squared distance from `p` to the triangle (clamped barycentric / edge projection — the standard closest-point-on-triangle). */
function pointTriangleDistanceSq(p: MeshVertex, t: Triangle): number {
  const ab = subtract(t.b, t.a);
  const ac = subtract(t.c, t.a);
  const ap = subtract(p, t.a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = subtract(p, t.b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const q = { x: t.a.x + ab.x * v, y: t.a.y + ab.y * v, z: t.a.z + ab.z * v };
    const d = subtract(p, q);
    return dot(d, d);
  }
  const cp = subtract(p, t.c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const q = { x: t.a.x + ac.x * w, y: t.a.y + ac.y * w, z: t.a.z + ac.z * w };
    const d = subtract(p, q);
    return dot(d, d);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const q = { x: t.b.x + (t.c.x - t.b.x) * w, y: t.b.y + (t.c.y - t.b.y) * w, z: t.b.z + (t.c.z - t.b.z) * w };
    const d = subtract(p, q);
    return dot(d, d);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const q = { x: t.a.x + ab.x * v + ac.x * w, y: t.a.y + ab.y * v + ac.y * w, z: t.a.z + ab.z * v + ac.z * w };
  const d = subtract(p, q);
  return dot(d, d);
}

function minDistanceToShell(p: MeshVertex, tris: Triangle[]): number {
  let best = Infinity;
  for (const t of tris) {
    const d = pointTriangleDistanceSq(p, t);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

interface RepresentativeCandidate {
  representative: ShellRepresentative;
  /** Which shells (indices into the shell array) contain this point — filled in during the containment pass. */
  containedBy: number[];
}

/**
 * Pick up to `count` source triangles for representative points: the largest
 * by area first (the most numerically stable to offset from), then greedily the
 * ones whose centroids are FARTHEST from the ones already picked, so the
 * verification points do not all sit on the same feature of a non-convex shell.
 * Deterministic: no randomness, ties broken by triangle index.
 */
function pickSourceTriangles(tris: Triangle[], count: number): number[] {
  const pool = tris
    .map((t, i) => ({ i, area: triangleArea(t) }))
    .filter((e) => e.area > 0)
    .sort((a, b) => (b.area - a.area) || (a.i - b.i))
    .slice(0, 256)
    .map((e) => e.i);
  if (pool.length === 0) return [];
  const chosen = [pool[0]];
  while (chosen.length < count && chosen.length < pool.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of pool) {
      if (chosen.includes(i)) continue;
      const ci = centroid(tris[i]);
      let nearest = Infinity;
      for (const j of chosen) {
        const cj = centroid(tris[j]);
        nearest = Math.min(nearest, Math.hypot(ci.x - cj.x, ci.y - cj.y, ci.z - cj.z));
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = i;
      }
    }
    if (best < 0) break;
    chosen.push(best);
  }
  return chosen;
}

/**
 * A representative point for ONE shell, found by offsetting a triangle centroid
 * along ±normal and asking THIS SHELL'S OWN inside tester which side is inside.
 *
 * Deliberately NOT the bbox centre and NOT the mean of all vertices: both were
 * already measured to fail on the non-convex shells and cavity walls this
 * Study actually produces (a cavity wall's bbox centre is inside the cavity for
 * a sphere and outside it for a horseshoe, and the vertex mean of a ring lands
 * in the hole). The offset ladder runs largest-first so the accepted point is
 * as far from the surface as this shell allows.
 */
function findRepresentative(tris: Triangle[], tester: InsideTester, shellTriangle: number, diagonal: number): ShellRepresentative | null {
  const tri = tris[shellTriangle];
  const n = unitNormal(tri);
  if (!n) return null;
  const c = centroid(tri);
  for (const fraction of OFFSET_LADDER) {
    const offset = diagonal * fraction;
    if (!(offset > 0)) continue;
    const plus = { x: c.x + n.x * offset, y: c.y + n.y * offset, z: c.z + n.z * offset };
    const minus = { x: c.x - n.x * offset, y: c.y - n.y * offset, z: c.z - n.z * offset };
    const insidePlus = tester.isInside(plus.x, plus.y, plus.z);
    const insideMinus = tester.isInside(minus.x, minus.y, minus.z);
    if (insidePlus === insideMinus) continue; // both in or both out: this offset does not resolve a side
    const point = insidePlus ? plus : minus;
    const outsidePoint = insidePlus ? minus : plus;
    return {
      point,
      outsidePoint,
      offsetMm: offset,
      clearanceMm: minDistanceToShell(point, tris),
      fromShellTriangle: shellTriangle,
    };
  }
  return null;
}

/**
 * The LOCAL field probe for one shell — a measurement entirely separate from
 * the containment representative.
 *
 * The containment representative is chosen DEEP on purpose (largest clearance
 * from the surface), because that is what makes the ray-parity containment
 * answer stable. Reusing it to ask the field which side holds material is the
 * defect this replaces: its mirror sits the same deep distance on the other
 * side, so wherever the material layer beside the surface is thinner than that,
 * the mirror crosses the wall, crosses the material, and lands in the next
 * void — reading positive on both sides while the shell is a perfectly ordinary
 * cavity wall.
 *
 * So this probe never moves the representative shallower. It reads DIFFERENT
 * points: from several large, mutually distant triangle centroids, both normal
 * directions, at fixed multiples of the SOURCE GRID STEP. Which side is "inside
 * the shell" comes from the shell's own inside tester, never from the sign of
 * the normal — the normal's direction depends on the input winding.
 */
function probeShellFieldLocally(
  tris: Triangle[],
  tester: InsideTester,
  probeTriangles: number[],
  gridStepFieldUnits: number,
  scaleMmPerUnit: number,
  band: FieldBand,
  fieldAt: (x: number, y: number, z: number) => number,
): FieldProbeTriangle[] {
  const out: FieldProbeTriangle[] = [];
  for (const shellTriangle of probeTriangles) {
    const tri = tris[shellTriangle];
    const n = unitNormal(tri);
    if (!n) continue;
    const c = centroid(tri);
    const samples: FieldProbeSample[] = [];
    for (const multiple of LOCAL_PROBE_GRID_STEP_MULTIPLES) {
      const distanceFieldUnits = multiple * gridStepFieldUnits;
      const distanceMm = distanceFieldUnits * scaleMmPerUnit;
      if (!(distanceMm > 0) || !Number.isFinite(distanceMm)) continue;
      const plus = { x: c.x + n.x * distanceMm, y: c.y + n.y * distanceMm, z: c.z + n.z * distanceMm };
      const minus = { x: c.x - n.x * distanceMm, y: c.y - n.y * distanceMm, z: c.z - n.z * distanceMm };
      const plusValue = fieldAt(plus.x / scaleMmPerUnit, plus.y / scaleMmPerUnit, plus.z / scaleMmPerUnit);
      const minusValue = fieldAt(minus.x / scaleMmPerUnit, minus.y / scaleMmPerUnit, minus.z / scaleMmPerUnit);
      const plusInside = tester.isInside(plus.x, plus.y, plus.z);
      const minusInside = tester.isInside(minus.x, minus.y, minus.z);
      const insideSide: ProbeSide | null =
        plusInside === minusInside ? null : plusInside ? "plus" : "minus";
      const plusConfident = Math.abs(plusValue) > band.decision && Number.isFinite(plusValue);
      const minusConfident = Math.abs(minusValue) > band.decision && Number.isFinite(minusValue);
      let negativeSide: ProbeSide | null = null;
      let positiveSide: ProbeSide | null = null;
      if (plusConfident) (plusValue < 0 ? (negativeSide = "plus") : (positiveSide = "plus"));
      if (minusConfident) (minusValue < 0 ? (negativeSide = "minus") : (positiveSide = "minus"));
      const bothConfident = plusConfident && minusConfident;
      const resolved = bothConfident && negativeSide !== null && positiveSide !== null;
      const sameSign = bothConfident && !resolved;
      samples.push({
        shellTriangle,
        gridStepMultiple: multiple,
        distanceFieldUnits,
        distanceMm,
        plusPointMm: plus,
        minusPointMm: minus,
        plusValue,
        minusValue,
        insideSide,
        negativeSide,
        positiveSide,
        resolved,
        sameSign,
      });
    }
    if (samples.length === 0) continue;

    // Orientation: decided ONCE, from the nearest distance at which the shell's
    // own tester separates the two points. Past the shell's own thickness the
    // tester puts both points outside and says nothing — that is a limit of the
    // tester at that distance, not a change in which side is the interior.
    let insideSide: ProbeSide | null = null;
    let insideSideFromGridStepMultiple: number | null = null;
    for (const sample of samples) {
      if (sample.insideSide !== null) {
        insideSide = sample.insideSide;
        insideSideFromGridStepMultiple = sample.gridStepMultiple;
        break;
      }
    }

    // The verdict comes from the NEAREST reading that carries information.
    let decidingGridStepMultiple: number | null = null;
    let decidingReading: "resolved" | "same-sign" | null = null;
    let insideIsNegative: boolean | null = null;
    for (const sample of samples) {
      if (!sample.resolved && !sample.sameSign) continue;
      decidingGridStepMultiple = sample.gridStepMultiple;
      decidingReading = sample.resolved ? "resolved" : "same-sign";
      if (sample.resolved && insideSide !== null) insideIsNegative = sample.negativeSide === insideSide;
      break;
    }

    out.push({
      shellTriangle,
      areaMm2: triangleArea(tri),
      centroidMm: c,
      samples,
      insideSide,
      insideSideFromGridStepMultiple,
      decidingGridStepMultiple,
      decidingReading,
      insideIsNegative,
      sameSignSamples: samples.filter((s) => s.sameSign).length,
      resolvedSamples: samples.filter((s) => s.resolved).length,
      verdict: "inconclusive",
    });
  }
  return out;
}

/**
 * Turn the per-triangle probe verdicts into ONE of the four states. The
 * thresholds are the module constants above and are never re-picked per shell.
 *
 * Order matters and is deliberate: a resolved contradiction outranks any number
 * of agreements (a shell whose local field boundary points the wrong way
 * anywhere is not something to be averaged into "fine"), and
 * `field-inconsistent-shell` is only reached when NOTHING resolved — if even
 * one triangle found a real boundary, "this surface is not a boundary of the
 * field" is a claim the evidence does not support, and the answer is
 * `inconclusive` instead.
 */
function classifyFieldProbe(tally: FieldProbeTally, probeCount: number): FieldCheck {
  if (probeCount === 0) return "inconclusive";
  if (tally.contradict > 0) return "contradicts";
  if (tally.agree >= MIN_AGREEING_PROBE_TRIANGLES) return "agrees";
  if (tally.agree === 0 && tally.sameSign >= MIN_SAME_SIGN_PROBE_TRIANGLES) return "field-inconsistent-shell";
  return "inconclusive";
}

/**
 * Classify the shells of a saved mesh into solid components and enclosed
 * cavities.
 *
 * `triangles` / `scaleMmPerUnit` are the same pair `inspectSavedStlTopology`
 * takes, and the vertices are rounded the same way before anything is measured.
 * Pass the mesh BEFORE `orientMeshForSavedStl` when you have the choice — the
 * result is invariant to it (the tests pin that), but the reported
 * `signedVolumeMm3` only carries information before the sign is normalised.
 */
export function classifySolidTopology(
  triangles: Triangle[],
  scaleMmPerUnit: number,
  options: SolidTopologyOptions = {},
): SolidTopologyReport {
  const wantCandidates = Math.max(2, Math.round(options.representativeCandidates ?? DEFAULT_REPRESENTATIVE_CANDIDATES));
  const wantProbeTriangles = Math.max(3, Math.round(options.fieldProbeTriangles ?? DEFAULT_FIELD_PROBE_TRIANGLES));
  const fieldAt = options.fieldAt;
  const gridStepFieldUnits = options.sourceGridStepFieldUnits;
  const haveGridStep = typeof gridStepFieldUnits === "number" && Number.isFinite(gridStepFieldUnits) && gridStepFieldUnits > 0;

  // --- the saved triangle set ------------------------------------------------
  const survivors: Triangle[] = [];
  const sourceIndex: number[] = [];
  let degenerateTriangleCount = 0;
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    const rounded: Triangle = {
      a: roundVertexToF32(t.a, scaleMmPerUnit),
      b: roundVertexToF32(t.b, scaleMmPerUnit),
      c: roundVertexToF32(t.c, scaleMmPerUnit),
    };
    const ka = F32_KEY(rounded.a);
    const kb = F32_KEY(rounded.b);
    const kc = F32_KEY(rounded.c);
    if (ka === kb || kb === kc || kc === ka) {
      degenerateTriangleCount++;
      continue;
    }
    survivors.push(rounded);
    sourceIndex.push(i);
  }

  if (survivors.length === 0) {
    return {
      shellCount: 0,
      solidComponentCount: 0,
      closedCavityCount: 0,
      ambiguousShellCount: 0,
      degenerateTriangleCount,
      fieldChecked: Boolean(fieldAt),
      fieldAgreementCount: 0,
      fieldInconclusiveCount: 0,
      fieldContradictionCount: 0,
      fieldInconsistentShellCount: 0,
      containmentResolved: true,
      fieldFullyConfirmed: Boolean(fieldAt),
      safeToOrient: true,
      safeForGate: true,
      shells: [],
    };
  }

  // --- edges, with the identity the saved bytes have --------------------------
  type EdgeUse = { triangle: number; forward: boolean };
  const edgeUses = new Map<string, EdgeUse[]>();
  const triangleEdges: string[][] = [];
  for (let ti = 0; ti < survivors.length; ti++) {
    const t = survivors[ti];
    const keys = [F32_KEY(t.a), F32_KEY(t.b), F32_KEY(t.c)];
    const own: string[] = [];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
      const a = keys[i];
      const b = keys[j];
      const forward = a < b;
      const edge = forward ? `${a}|${b}` : `${b}|${a}`;
      const uses = edgeUses.get(edge) ?? [];
      uses.push({ triangle: ti, forward });
      edgeUses.set(edge, uses);
      own.push(edge);
    }
    triangleEdges.push(own);
  }

  // --- shells: EXACTLY the components `orientMeshForSavedStl` walks -----------
  // (adjacency across edges used exactly twice, so the two can never disagree
  // about which triangles belong together).
  const adjacency: number[][] = Array.from({ length: survivors.length }, () => []);
  for (const uses of edgeUses.values()) {
    if (uses.length !== 2) continue;
    adjacency[uses[0].triangle].push(uses[1].triangle);
    adjacency[uses[1].triangle].push(uses[0].triangle);
  }
  const shellOf = new Int32Array(survivors.length).fill(-1);
  const shellTriangleIndices: number[][] = [];
  for (let start = 0; start < survivors.length; start++) {
    if (shellOf[start] >= 0) continue;
    const shellIndex = shellTriangleIndices.length;
    const queue = [start];
    shellOf[start] = shellIndex;
    const members: number[] = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const current = queue[qi];
      members.push(current);
      for (const other of adjacency[current]) {
        if (shellOf[other] >= 0) continue;
        shellOf[other] = shellIndex;
        queue.push(other);
      }
    }
    members.sort((a, b) => a - b);
    shellTriangleIndices.push(members);
  }
  const shellCount = shellTriangleIndices.length;

  // --- per-shell geometry and surface integrity -------------------------------
  const shellTris: Triangle[][] = [];
  const testers: InsideTester[] = [];
  const bboxes: Array<{ min: MeshVertex; max: MeshVertex }> = [];
  const diagonals: number[] = [];
  const signedVolumes: number[] = [];
  const integrity: Array<{ openEdges: number; nonManifoldEdges: number; windingInconsistentEdges: number }> = [];

  for (let s = 0; s < shellCount; s++) {
    const members = shellTriangleIndices[s];
    const tris = members.map((i) => survivors[i]);
    shellTris.push(tris);
    testers.push(buildInsideTester(tris));
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let sixVolume = 0;
    for (const t of tris) {
      for (const v of [t.a, t.b, t.c]) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.z < minZ) minZ = v.z;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
        if (v.z > maxZ) maxZ = v.z;
      }
      const { a, b, c } = t;
      sixVolume += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    }
    bboxes.push({ min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } });
    diagonals.push(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ));
    signedVolumes.push(sixVolume / 6);

    // Edge conditions, counted over the distinct edges this shell's triangles
    // touch. A >2-use edge is counted in every shell that touches it.
    const seen = new Set<string>();
    let openEdges = 0;
    let nonManifoldEdges = 0;
    let windingInconsistentEdges = 0;
    for (const ti of members) {
      for (const edge of triangleEdges[ti]) {
        if (seen.has(edge)) continue;
        seen.add(edge);
        const uses = edgeUses.get(edge)!;
        if (uses.length === 1) {
          openEdges++;
          continue;
        }
        if (uses.length > 2) {
          nonManifoldEdges++;
          continue;
        }
        if (uses[0].forward === uses[1].forward) windingInconsistentEdges++;
      }
    }
    integrity.push({ openEdges, nonManifoldEdges, windingInconsistentEdges });
  }

  // --- representative points, and the containment they resolve ----------------
  const candidates: RepresentativeCandidate[][] = [];
  for (let s = 0; s < shellCount; s++) {
    const tris = shellTris[s];
    const sources = pickSourceTriangles(tris, wantCandidates);
    const found: RepresentativeCandidate[] = [];
    for (const source of sources) {
      const rep = findRepresentative(tris, testers[s], source, diagonals[s]);
      if (rep) found.push({ representative: rep, containedBy: [] });
    }
    // Prefer the point with the largest MEASURED clearance as the primary one.
    found.sort((a, b) => b.representative.clearanceMm - a.representative.clearanceMm);
    candidates.push(found);
  }

  for (let s = 0; s < shellCount; s++) {
    for (const candidate of candidates[s]) {
      const p = candidate.representative.point;
      for (let other = 0; other < shellCount; other++) {
        if (other === s) continue;
        if (testers[other].isInside(p.x, p.y, p.z)) candidate.containedBy.push(other);
      }
    }
  }

  // --- mutual intersection ----------------------------------------------------
  // A shell that is neither wholly inside nor wholly outside another CROSSES it,
  // and containment is then not a tree. Measured on triangle centroids (points
  // that lie on this shell's surface but, for any two shells that merely nest or
  // merely touch at a vertex, never on the OTHER shell's surface), so a
  // vertex-touching pair is not mistaken for an intersecting one.
  const crosses: number[][] = Array.from({ length: shellCount }, () => []);
  for (let a = 0; a < shellCount; a++) {
    for (let b = 0; b < shellCount; b++) {
      if (a === b) continue;
      if (!bboxesOverlap(bboxes[a], bboxes[b])) continue;
      let inside = 0;
      let total = 0;
      for (const t of shellTris[a]) {
        const c = centroid(t);
        if (testers[b].isInside(c.x, c.y, c.z)) inside++;
        total++;
      }
      if (inside > 0 && inside < total) {
        if (!crosses[a].includes(b)) crosses[a].push(b);
        if (!crosses[b].includes(a)) crosses[b].push(a);
      }
    }
  }
  for (const list of crosses) list.sort((x, y) => x - y);

  // --- assemble, then classify ------------------------------------------------
  const depths: Array<number | null> = new Array(shellCount).fill(null);
  const containedBySets: number[][] = new Array(shellCount).fill(null).map(() => []);
  /** Why a shell is AMBIGUOUS. Only conditions that actually make it ambiguous go here. */
  const reasons: string[][] = Array.from({ length: shellCount }, () => []);
  /** Why the field could not confirm a shell whose kind still stands on containment parity. Never makes a shell ambiguous. */
  const fieldNotes: string[][] = Array.from({ length: shellCount }, () => []);
  const agreeing: number[] = new Array(shellCount).fill(0);

  /** Open / non-manifold / winding-inconsistent edges, or a crossing shell: a surface defect, independent of anything the field says. */
  const surfaceDefect: boolean[] = new Array(shellCount).fill(false);

  for (let s = 0; s < shellCount; s++) {
    const found = candidates[s];
    const integ = integrity[s];
    if (integ.openEdges > 0 || integ.nonManifoldEdges > 0 || integ.windingInconsistentEdges > 0 || crosses[s].length > 0) {
      surfaceDefect[s] = true;
    }
    if (integ.openEdges > 0 || integ.nonManifoldEdges > 0) {
      reasons[s].push(
        `開いた辺 ${integ.openEdges} / 非多様体辺 ${integ.nonManifoldEdges} — 閉じていない面からは内外を決められない`,
      );
    }
    if (integ.windingInconsistentEdges > 0) {
      reasons[s].push(`面方向が不整合な辺 ${integ.windingInconsistentEdges}`);
    }
    if (crosses[s].length > 0) {
      reasons[s].push(`shell ${crosses[s].join(",")} と交差している（包含関係が木にならない）`);
    }
    if (found.length === 0) {
      reasons[s].push("代表点が取れない（±法線オフセットのどの距離でも内外が決まらない）");
      continue;
    }
    if (found.length < 2) {
      reasons[s].push("代表点が1つしか取れず、別三角形からの照合ができない");
      continue;
    }
    agreeing[s] = found.length;
    const primary = found[0].containedBy.join(",");
    const disagreeing = found.filter((c) => c.containedBy.join(",") !== primary);
    if (disagreeing.length > 0) {
      reasons[s].push(
        `代表点ごとに包含関係が食い違う（${found.map((c) => `[${c.containedBy.join(",")}]`).join(" vs ")}）`,
      );
      continue;
    }
    containedBySets[s] = [...found[0].containedBy].sort((a, b) => a - b);
    depths[s] = containedBySets[s].length;
  }

  // Parent = the SMALLEST containing shell by absolute volume. Never by signed
  // volume, and never "the largest shell that contains it".
  const parents: Array<number | null> = new Array(shellCount).fill(null);
  for (let s = 0; s < shellCount; s++) {
    if (depths[s] === null || containedBySets[s].length === 0) continue;
    let best: number | null = null;
    for (const other of containedBySets[s]) {
      if (best === null) {
        best = other;
        continue;
      }
      const a = Math.abs(signedVolumes[other]);
      const b = Math.abs(signedVolumes[best]);
      if (a < b || (a === b && other < best)) best = other;
    }
    parents[s] = best;
  }
  // The containment chain has to be a chain: the parent must sit exactly one
  // level up. If it does not, the nesting did not resolve and the shell is
  // ambiguous rather than assigned a depth we cannot justify.
  for (let s = 0; s < shellCount; s++) {
    const d = depths[s];
    if (d === null || d === 0) continue;
    const parent = parents[s];
    if (parent === null || depths[parent] === null || depths[parent]! !== d - 1) {
      reasons[s].push(`包含の入れ子が連鎖していない（depth ${d} の親が depth ${parent === null ? "なし" : depths[parent]}）`);
      depths[s] = null;
    }
  }

  // Whether the CONTAINMENT machinery alone resolved each shell — captured
  // before the field check can null a depth, so `containmentResolved` never
  // silently absorbs a field verdict.
  const containmentDepthResolved: boolean[] = depths.map((d, s) => d !== null && reasons[s].length === 0);

  // --- the field cross-check --------------------------------------------------
  // Even depth: the shell's own interior is MATERIAL and just outside it is not.
  // Odd depth: the shell's own interior is VOID and just outside it is material.
  //
  // Measured by the LOCAL probe (several large, mutually distant triangles ×
  // the grid-step distance ladder), NOT by the deep containment representative
  // and its mirror — those are recorded alongside, as `deepMirrorFieldCheck`,
  // precisely so their overshoot is visible.
  const fieldInside: Array<number | null> = new Array(shellCount).fill(null);
  const fieldOutside: Array<number | null> = new Array(shellCount).fill(null);
  const deepChecks: Array<FieldCheck> = new Array(shellCount).fill("not-measured");
  const fieldAgrees: Array<boolean | null> = new Array(shellCount).fill(null);
  const fieldChecks: Array<FieldCheck> = new Array(shellCount).fill("not-measured");
  const fieldBands: Array<FieldBand | null> = new Array(shellCount).fill(null);
  const probeRecords: FieldProbeTriangle[][] = Array.from({ length: shellCount }, () => []);
  const tallies: FieldProbeTally[] = Array.from({ length: shellCount }, () => ({
    agree: 0,
    contradict: 0,
    sameSign: 0,
    inconclusive: 0,
  }));
  if (fieldAt) {
    const toField = (p: MeshVertex): [number, number, number] => [
      p.x / scaleMmPerUnit,
      p.y / scaleMmPerUnit,
      p.z / scaleMmPerUnit,
    ];
    for (let s = 0; s < shellCount; s++) {
      // The mesh surface is an APPROXIMATION of the field's zero set, so a probe
      // sitting closer to the surface than that approximation error tells us
      // nothing about which side it is on. Measure that error instead of
      // assuming it: |field| at this shell's OWN vertices is exactly the gap
      // between where the mesh puts the surface and where the field's zero is.
      // A probe whose |field| is inside that band is NOT a contradiction, it is
      // an absent measurement.
      const band = shellFieldBand(shellTriangleIndices[s], survivors, scaleMmPerUnit, fieldAt);
      fieldBands[s] = band;
      const d = depths[s];
      const even = d === null ? null : d % 2 === 0;

      // (a) the DEEP containment point and its mirror — reported only.
      const found = candidates[s];
      if (found.length > 0) {
        const rep = found[0].representative;
        const [ix, iy, iz] = toField(rep.point);
        const [ox, oy, oz] = toField(rep.outsidePoint);
        const vin = fieldAt(ix, iy, iz);
        const vout = fieldAt(ox, oy, oz);
        fieldInside[s] = vin;
        fieldOutside[s] = vout;
        if (even !== null) {
          const confident = (v: number): boolean => Math.abs(v) > band.decision && Number.isFinite(v);
          const bothConfident = confident(vin) && confident(vout);
          if (!bothConfident) deepChecks[s] = "inconclusive";
          else if (vin < 0 === vout < 0) deepChecks[s] = "field-inconsistent-shell";
          else deepChecks[s] = (vin < 0) === even ? "agrees" : "contradicts";
        }
      }

      // (b) the LOCAL probe — the only thing that decides.
      if (!haveGridStep) {
        fieldChecks[s] = "inconclusive";
        fieldNotes[s].push(
          "sourceGridStepFieldUnits が渡されていないため局所プローブを実施できない（shellのbbox対角の一部で代用しない）。この shell の種別は包含parityのみに基づく",
        );
        continue;
      }
      const probeTriangles = pickSourceTriangles(shellTris[s], wantProbeTriangles);
      const probes = probeShellFieldLocally(
        shellTris[s],
        testers[s],
        probeTriangles,
        gridStepFieldUnits!,
        scaleMmPerUnit,
        band,
        fieldAt,
      );
      probeRecords[s] = probes;
      const tally = tallies[s];
      for (const probe of probes) {
        if (probe.decidingReading === "resolved") {
          // A local boundary IS the nearest thing this triangle found. It can
          // only be compared to the containment parity when both the shell's
          // orientation and its depth are known; otherwise the boundary is real
          // but unreadable, which is `inconclusive` — never `same-sign`, since
          // a boundary was found.
          probe.verdict =
            probe.insideIsNegative !== null && even !== null
              ? probe.insideIsNegative === even
                ? "agrees"
                : "contradicts"
              : "inconclusive";
        } else if (probe.decidingReading === "same-sign") {
          probe.verdict = "same-sign";
        } else {
          probe.verdict = "inconclusive";
        }
        tally[
          probe.verdict === "agrees"
            ? "agree"
            : probe.verdict === "contradicts"
              ? "contradict"
              : probe.verdict === "same-sign"
                ? "sameSign"
                : "inconclusive"
        ]++;
      }
      const check = classifyFieldProbe(tally, probes.length);
      fieldChecks[s] = check;
      fieldAgrees[s] = check === "agrees" ? true : check === "contradicts" ? false : null;

      const near = (p: FieldProbeTriangle): string =>
        p.decidingGridStepMultiple === null ? "情報なし" : `${p.decidingGridStepMultiple}×step(${p.decidingReading})`;
      if (check === "contradicts") {
        reasons[s].push(
          `局所プローブが包含parityと逆向きの境界を解決（depth ${d}、期待は内側 ${even ? "負" : "正"}、` +
            `三角形 一致 ${tally.agree} / 矛盾 ${tally.contradict} / 同符号 ${tally.sameSign} / 不確定 ${tally.inconclusive}、` +
            `誤差帯 p50 ${band.p50.toExponential(3)} / p90 ${band.p90.toExponential(3)} / p99 ${band.p99.toExponential(3)} / max ${band.max.toExponential(3)}、` +
            `最近接解決距離 ${probes.map(near).join(", ")}）`,
        );
        depths[s] = null;
      } else if (check === "field-inconsistent-shell") {
        reasons[s].push(
          `局所プローブが複数三角形・複数距離で両側とも同符号（誤差帯の外）— この面は場のゼロ境界として説明できない。` +
            `空洞壁とは判定しない（三角形 同符号 ${tally.sameSign} / 不確定 ${tally.inconclusive}、` +
            `誤差帯 p50 ${band.p50.toExponential(3)} / p90 ${band.p90.toExponential(3)} / p99 ${band.p99.toExponential(3)} / max ${band.max.toExponential(3)}）`,
        );
        depths[s] = null;
      } else if (check === "inconclusive") {
        fieldNotes[s].push(
          `局所プローブでは符号が決まらなかった（三角形 一致 ${tally.agree} / 矛盾 ${tally.contradict} / 同符号 ${tally.sameSign} / 不確定 ${tally.inconclusive}、` +
            `誤差帯 p50 ${band.p50.toExponential(3)} / p90 ${band.p90.toExponential(3)} / p99 ${band.p99.toExponential(3)} / max ${band.max.toExponential(3)}）。` +
            `この shell の種別は包含parityのみに基づく`,
        );
      }
    }
  }

  const shells: ShellStat[] = [];
  let solidComponentCount = 0;
  let closedCavityCount = 0;
  let ambiguousShellCount = 0;
  for (let s = 0; s < shellCount; s++) {
    const d = reasons[s].length > 0 ? null : depths[s];
    let kind: ShellKind;
    if (d === null) {
      kind = "ambiguous";
      ambiguousShellCount++;
    } else if (d % 2 === 0) {
      kind = "outer-boundary";
      solidComponentCount++;
    } else {
      kind = "cavity-wall";
      closedCavityCount++;
    }
    const integ = integrity[s];
    shells.push({
      index: s,
      startTriangleIndex: shellTriangleIndices[s][0],
      triangleIndices: shellTriangleIndices[s],
      sourceTriangleIndices: shellTriangleIndices[s].map((i) => sourceIndex[i]),
      triangleCount: shellTriangleIndices[s].length,
      closed: integ.openEdges === 0 && integ.nonManifoldEdges === 0,
      manifold: integ.nonManifoldEdges === 0,
      windingConsistent: integ.windingInconsistentEdges === 0,
      openEdges: integ.openEdges,
      nonManifoldEdges: integ.nonManifoldEdges,
      windingInconsistentEdges: integ.windingInconsistentEdges,
      signedVolumeMm3: signedVolumes[s],
      absoluteVolumeMm3: Math.abs(signedVolumes[s]),
      bboxMm: bboxes[s],
      representative: candidates[s][0]?.representative ?? null,
      agreeingRepresentatives: agreeing[s],
      containmentDepth: d,
      parentShell: d === null ? null : parents[s],
      containedBy: containedBySets[s],
      crossesShells: crosses[s],
      kind,
      fieldInside: fieldInside[s],
      fieldOutside: fieldOutside[s],
      deepMirrorFieldCheck: deepChecks[s],
      fieldAgreesWithParity: fieldAgrees[s],
      fieldCheck: fieldChecks[s],
      fieldConfirmed: fieldChecks[s] === "agrees",
      fieldBand: fieldBands[s],
      fieldBandFieldUnits: fieldBands[s]?.decision ?? null,
      fieldProbeTriangles: probeRecords[s],
      fieldProbeTally: tallies[s],
      fieldNotes: fieldNotes[s],
      ambiguousReasons: reasons[s],
    });
  }

  let fieldAgreementCount = 0;
  let fieldInconclusiveCount = 0;
  let fieldContradictionCount = 0;
  let fieldInconsistentShellCount = 0;
  for (const check of fieldChecks) {
    if (check === "agrees") fieldAgreementCount++;
    else if (check === "inconclusive") fieldInconclusiveCount++;
    else if (check === "contradicts") fieldContradictionCount++;
    else if (check === "field-inconsistent-shell") fieldInconsistentShellCount++;
  }

  const containmentResolved = containmentDepthResolved.every(Boolean);
  const safeToOrient = ambiguousShellCount === 0;
  const anySurfaceDefect = surfaceDefect.some(Boolean);
  return {
    shellCount,
    solidComponentCount,
    closedCavityCount,
    ambiguousShellCount,
    degenerateTriangleCount,
    fieldChecked: Boolean(fieldAt),
    fieldAgreementCount,
    fieldInconclusiveCount,
    fieldContradictionCount,
    fieldInconsistentShellCount,
    containmentResolved,
    fieldFullyConfirmed: Boolean(fieldAt) && fieldAgreementCount === shellCount,
    safeToOrient,
    safeForGate:
      safeToOrient &&
      fieldContradictionCount === 0 &&
      fieldInconsistentShellCount === 0 &&
      !anySurfaceDefect,
    shells,
  };
}

function bboxesOverlap(a: { min: MeshVertex; max: MeshVertex }, b: { min: MeshVertex; max: MeshVertex }): boolean {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

/**
 * One-line summary. States the counts as MEASURED, and never hides ambiguity
 * behind a total.
 *
 * It never says 「場の符号で照合済み」: that sentence cannot distinguish "every
 * shell agreed" from "every shell was inconclusive", and saying it while any
 * shell was inconclusive would be the plainest possible case of 「分からない
 * ものを分かった顔で表示する」. The breakdown is stated instead, always.
 */
export function solidTopologySummary(report: SolidTopologyReport): string {
  const base = `shell ${report.shellCount} = 実体 ${report.solidComponentCount} + 閉じた空洞 ${report.closedCavityCount}`;
  const head =
    report.ambiguousShellCount > 0 ? `${base} + 判定不能 ${report.ambiguousShellCount}` : base;
  if (!report.fieldChecked) return `${head}（場の照合なし（包含parityのみ））`;
  const field =
    `field照合: 一致 ${report.fieldAgreementCount} / 不確定 ${report.fieldInconclusiveCount} ` +
    `/ 矛盾 ${report.fieldContradictionCount} / 場と不整合なshell ${report.fieldInconsistentShellCount}`;
  return `${head}（${field}）`;
}

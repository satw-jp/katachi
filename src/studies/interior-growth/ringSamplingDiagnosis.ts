// ---------------------------------------------------------------------------
// P25 sampling-density diagnosis (DIAGNOSIS ONLY — changes no production
// behaviour, and `growth.test.ts`'s import-graph crawler asserts this file is
// unreachable from every shipped entry point).
//
// WHAT IT IS FOR
// The prior audited round established, at the default `ring-constrained`
// fixture and resolution 64, that the order-independent hard union comes out as
// box 27 / sphere 12 / waisted 20 components; that EVERY parent-child graph
// edge is in contact and resolved (box 352/352, sphere 287/287, waisted
// 370/370); and that the fragmentation therefore lives WITHIN single ring units
// (53 / 8 / 49 units spanning more than one component) rather than between
// them. It also measured the ring tube at 1.5–2.2 grid steps thick.
//
// The HYPOTHESIS this module exists to test — and which it is equally free to
// reject — is that the within-ring fragmentation is UNDERSAMPLING: a closed
// tapered-capsule chain is a connected solid by construction, so a hard union of
// one ring cannot be topologically disconnected in the field; anything that
// splits it must come from the marching-tetrahedra grid.
//
// SINGLE SOURCE OF TRUTH (AGENTS.md §1 「正直な計算」)
//  - the sampling lattice is `buildMeshFromField`'s own
//    (`step = sourceBounds.longest / resolution`); `recordSamplingLattice`
//    below MEASURES it by recording the sdf call sites rather than restating it;
//  - the hard union is `ringUnionPolicies.ts`'s `P1-hard-union`
//    (`baseHardSdf` / `createBaseHardSampler`) — the order-independent
//    `Math.min` form that reproduced the audited 27 / 12 / 20 control. No third
//    hard union is written here;
//  - the plate clip is `policySavedField` (`Math.max(material,
//    aboveBuildPlateSdf)`), untouched;
//  - components are `measureComponents` from `ringFusionDiagnosis.ts`, and
//    within-unit fragmentation is `measureWholeMeshFragmentation` from the same
//    file. Neither is re-implemented.
//
// The only genuinely new code here is (a) a grid-ORIGIN phase shift that keeps
// the step and the cell counts identical, (b) a centreline walk that locates
// where along a ring the mesh breaks, and (c) the cell-phase arithmetic that
// says where a break sits relative to a grid corner, a grid edge and the
// tetrahedron decomposition.
//
// EVERY NUMBER HERE IS A MEASUREMENT, NEVER A VERDICT.
// ---------------------------------------------------------------------------

import {
  buildMeshFromField,
  computeConnectedComponentsWithKey,
  encodeBinaryStl,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  rescaleMeshResult,
  type Bounds,
  type MeshVertex,
  type Triangle,
} from "../cloud-sculpt/meshExport.ts";
import { buildPlateOffset, vNorm, type GrowthUnit, type GrowthUnitPoint, type Vec3 } from "./field.ts";
import { elementSdf, fieldElementsOf, type GrowthResult } from "./growth.ts";
import { SpatialHash } from "./colonization.ts";
import {
  aboveBuildPlateSdf,
  countPlateContactVertices,
  meshLowestBuildAxisMm,
  plateBoundaryEpsilonMm,
  type CandidateMeshResult,
  type SavedPlateReference,
} from "./meshExport.ts";
import {
  createNearestUnitLookup,
  decodeBinaryStlTriangles,
  diagnosisBounds,
  measureCapsulePairGap,
  measureComponents,
  measureWholeMeshFragmentation,
  type ComponentReport,
  type WholeMeshFragmentation,
} from "./ringFusionDiagnosis.ts";
import { buildPolicy, policyPlateReference, policySavedField } from "./ringUnionPolicies.ts";

// ===========================================================================
// 1. The sampling lattice — measured, not restated
// ===========================================================================

/**
 * The clamp `buildMeshFromField` applies to `options.resolution` before it
 * derives anything. Mirrored here (one line, from the imported function's own
 * source) so `fieldStepOf` cannot disagree with the mesher about what
 * "resolution 64" means; `recordSamplingLattice` then proves the mirror right
 * by watching where the mesher actually samples.
 */
export function effectiveResolution(resolution: number): number {
  return Math.max(8, Math.round(resolution));
}

/** `buildMeshFromField`'s step: `sourceBounds.longest / resolution`, in FIELD units. NOT affected by `targetLongestMm`, which is a post-meshing rescale. */
export function fieldStepOf(bounds: Bounds, resolution: number): number {
  return bounds.longest / effectiveResolution(resolution);
}

export interface GridCounts {
  nx: number;
  ny: number;
  nz: number;
  /** Grid CORNERS: `(nx+1)(ny+1)(nz+1)` — the number of sdf evaluations the mesher makes. */
  fieldSampleCount: number;
}

/** The cell counts `buildMeshFromField` derives from the same bounds and resolution. */
export function gridCountsOf(bounds: Bounds, resolution: number): GridCounts {
  const r = effectiveResolution(resolution);
  const nx = Math.max(2, Math.ceil((bounds.size.x / bounds.longest) * r));
  const ny = Math.max(2, Math.ceil((bounds.size.y / bounds.longest) * r));
  const nz = Math.max(2, Math.ceil((bounds.size.z / bounds.longest) * r));
  return { nx, ny, nz, fieldSampleCount: (nx + 1) * (ny + 1) * (nz + 1) };
}

export interface SamplingLatticeRecord {
  stepX: number;
  stepY: number;
  stepZ: number;
  nx: number;
  ny: number;
  nz: number;
  sampleCount: number;
  minSample: MeshVertex;
  maxSample: MeshVertex;
  /** Largest |recorded coordinate - (bounds.min + i*step)| over every recorded sample, per axis. Zero means the lattice IS the derived one. */
  maxLatticeDeviation: number;
}

/**
 * Run the SHIPPED mesher over a bounds/resolution with an sdf that records every
 * call site, and report the lattice it actually sampled. This is how the
 * "`step === bounds.longest / resolution`" and "`targetLongestMm` does not
 * change sampling density" claims are checked against the mesher instead of
 * against a comment.
 *
 * The recording sdf returns a constant, so no triangle is produced and the cost
 * is one Map insert per grid corner.
 */
export function recordSamplingLattice(bounds: Bounds, resolution: number, targetLongestMm: number): SamplingLatticeRecord {
  const xs = new Set<number>();
  const ys = new Set<number>();
  const zs = new Set<number>();
  let count = 0;
  const min: MeshVertex = { x: Infinity, y: Infinity, z: Infinity };
  const max: MeshVertex = { x: -Infinity, y: -Infinity, z: -Infinity };
  buildMeshFromField(
    bounds,
    (x, y, z) => {
      count++;
      xs.add(x);
      ys.add(y);
      zs.add(z);
      if (x < min.x) min.x = x;
      if (y < min.y) min.y = y;
      if (z < min.z) min.z = z;
      if (x > max.x) max.x = x;
      if (y > max.y) max.y = y;
      if (z > max.z) max.z = z;
      return 1;
    },
    { resolution, targetLongestMm },
  );
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  const sortedZ = [...zs].sort((a, b) => a - b);
  const step = fieldStepOf(bounds, resolution);
  let deviation = 0;
  for (const [axis, sorted] of [["x", sortedX], ["y", sortedY], ["z", sortedZ]] as const) {
    for (let i = 0; i < sorted.length; i++) {
      deviation = Math.max(deviation, Math.abs(sorted[i] - (bounds.min[axis] + i * step)));
    }
  }
  return {
    stepX: sortedX.length > 1 ? sortedX[1] - sortedX[0] : NaN,
    stepY: sortedY.length > 1 ? sortedY[1] - sortedY[0] : NaN,
    stepZ: sortedZ.length > 1 ? sortedZ[1] - sortedZ[0] : NaN,
    nx: sortedX.length - 1,
    ny: sortedY.length - 1,
    nz: sortedZ.length - 1,
    sampleCount: count,
    minSample: min,
    maxSample: max,
    maxLatticeDeviation: deviation,
  };
}

// ===========================================================================
// 2. The feature size: how many cells lie across the tube
// ===========================================================================

export interface TubeScale {
  /** Node points belonging to RING units — the tube whose thickness is in question. */
  ringNodeCount: number;
  ringUnitCount: number;
  /** Units that are not rings (coins). Reported so a mixed candidate is never silently read as an all-ring one. */
  nonRingUnitCount: number;
  minNodeRadiusFieldUnits: number;
  medianNodeRadiusFieldUnits: number;
  maxNodeRadiusFieldUnits: number;
  /** `2 × radius` — the diagnosis's feature size, per the instruction's derivation. */
  minTubeDiameterFieldUnits: number;
  medianTubeDiameterFieldUnits: number;
  maxTubeDiameterFieldUnits: number;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Tube radii over the candidate's RING units, in FIELD units. Never mm: the grid comparison is done in field units and mm is only ever reported alongside. */
export function measureTubeScale(units: GrowthUnit[]): TubeScale {
  const radii: number[] = [];
  let ringUnits = 0;
  let nonRing = 0;
  for (const u of units) {
    if (u.kind !== "ring") {
      nonRing++;
      continue;
    }
    ringUnits++;
    for (const p of u.points) radii.push(p.r);
  }
  if (radii.length === 0) {
    throw new Error("measureTubeScale: no ring node points — there is no tube to measure a cell count across");
  }
  const min = Math.min(...radii);
  const max = Math.max(...radii);
  const med = median(radii);
  return {
    ringNodeCount: radii.length,
    ringUnitCount: ringUnits,
    nonRingUnitCount: nonRing,
    minNodeRadiusFieldUnits: min,
    medianNodeRadiusFieldUnits: med,
    maxNodeRadiusFieldUnits: max,
    minTubeDiameterFieldUnits: 2 * min,
    medianTubeDiameterFieldUnits: 2 * med,
    maxTubeDiameterFieldUnits: 2 * max,
  };
}

export interface CellsAcrossTube {
  min: number;
  median: number;
  max: number;
}

/** `tubeDiameterField / stepField` — cells across the tube, the ratio the verdict is stated in. */
export function cellsAcrossTube(tube: TubeScale, stepFieldUnits: number): CellsAcrossTube {
  return {
    min: tube.minTubeDiameterFieldUnits / stepFieldUnits,
    median: tube.medianTubeDiameterFieldUnits / stepFieldUnits,
    max: tube.maxTubeDiameterFieldUnits / stepFieldUnits,
  };
}

// ===========================================================================
// 3. Grid PHASE — origin only, same step, same cell counts
// ===========================================================================

/** Each axis shifted by 0 or 0.5 of a step. `[0,0,0]` is the production grid. */
export const GRID_PHASES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [0.5, 0, 0],
  [0, 0.5, 0],
  [0, 0, 0.5],
  [0.5, 0.5, 0],
  [0.5, 0, 0.5],
  [0, 0.5, 0.5],
  [0.5, 0.5, 0.5],
] as const;

export function phaseLabel(phase: readonly [number, number, number]): string {
  return `(${phase[0]},${phase[1]},${phase[2]})`;
}

/**
 * TRANSLATE the sampling box by `phase × step`, changing NOTHING else.
 *
 * Why translation and not padding: `size` and therefore `longest` are preserved
 * exactly, so `buildMeshFromField` derives the identical `step` and the
 * identical `nx/ny/nz`, and the ONLY difference between two phases is where the
 * grid corners land. Enlarging the box instead would add cells at a new offset
 * AND more of them, which is precisely the way to hide phase sensitivity behind
 * extra samples — so it is not done here. `phaseClearanceFieldUnits` below
 * reports how much room the translation ate, and a caller that sees it go
 * non-positive must not believe the row.
 */
export function phaseShiftedBounds(bounds: Bounds, phase: readonly [number, number, number], stepFieldUnits: number): Bounds {
  const dx = phase[0] * stepFieldUnits;
  const dy = phase[1] * stepFieldUnits;
  const dz = phase[2] * stepFieldUnits;
  const min = { x: bounds.min.x + dx, y: bounds.min.y + dy, z: bounds.min.z + dz };
  const max = { x: bounds.max.x + dx, y: bounds.max.y + dy, z: bounds.max.z + dz };
  // Recomputed rather than copied, so a future change to `size`'s definition
  // cannot make the shifted box quietly inconsistent with the original.
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

/**
 * Smallest distance from the units' own material bbox (points ± radii) to any
 * face of `box`, in field units. Positive means no material was pushed outside
 * the sampling box by the phase shift; a value at or below zero means the row
 * is measuring a clipped candidate and must be discarded, not explained.
 */
export function materialClearanceFieldUnits(units: GrowthUnit[], box: Bounds): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
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
  if (!Number.isFinite(minX)) return NaN;
  return Math.min(
    minX - box.min.x, minY - box.min.y, minZ - box.min.z,
    box.max.x - maxX, box.max.y - maxY, box.max.z - maxZ,
  );
}

// ===========================================================================
// 4. Where a point sits inside its grid cell
// ===========================================================================

/**
 * `buildMeshFromField`'s tetrahedron decomposition, copied here because the
 * constant is module-private in `cloud-sculpt/meshExport.ts` and this file must
 * not modify a production file to read it. The copy is NOT trusted: the test
 * suite greps the literal out of that file's source and compares, so a change
 * there fails here loudly instead of silently making `tetIndexOf` describe a
 * decomposition the mesher no longer uses.
 */
export const MESHER_TETS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
] as const;

/** The cube corner numbering the same file uses (`CUBE_OFFSETS`), same copy-and-check rule as `MESHER_TETS`. */
export const MESHER_CUBE_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
] as const;

/**
 * Which of the six tetrahedra contains a point at cell-fraction `(fx,fy,fz)`.
 *
 * DERIVATION (so the mapping is readable rather than a table to trust): every
 * entry of `MESHER_TETS` starts at corner 0 = (0,0,0) and ends at corner 6 =
 * (1,1,1), and its two middle corners walk from one to the other by adding a
 * single coordinate at a time — e.g. `[0,5,1,6]` reorders to
 * (0,0,0)→(1,0,0)→(1,0,1)→(1,1,1), i.e. "x then z then y". These are the six
 * Kuhn simplices of the unit cube, and the one containing a point is the one
 * whose coordinate order matches the DESCENDING order of `(fx,fy,fz)`.
 * A point on a shared face belongs to both; the tie is broken by `>=` in a
 * fixed order and the tie itself is reported by `onTetFace`.
 */
export function tetIndexOf(fx: number, fy: number, fz: number): number {
  if (fx >= fy && fy >= fz) return 1; // x, y, z
  if (fx >= fz && fz >= fy) return 0; // x, z, y
  if (fy >= fx && fx >= fz) return 2; // y, x, z
  if (fy >= fz && fz >= fx) return 3; // y, z, x
  if (fz >= fy && fy >= fx) return 4; // z, y, x
  return 5; // z, x, y
}

export interface CellPhase {
  /** Position within the cell, per axis, in [0,1). */
  cellFraction: [number, number, number];
  /** Distance to the nearest grid CORNER, in step units. 0 = on a corner, at most sqrt(3)/2 ≈ 0.866. */
  cornerDistanceSteps: number;
  /** Distance to the nearest axis-aligned grid EDGE (a line joining two corners), in step units. At most sqrt(2)/2 ≈ 0.707. */
  edgeDistanceSteps: number;
  /** Distance to the nearest grid PLANE, in step units. At most 0.5. */
  planeDistanceSteps: number;
  tetIndex: number;
  /** True when two coordinates tie, i.e. the point lies on a face shared by two tetrahedra and `tetIndex` picked one arbitrarily. */
  onTetFace: boolean;
}

/** Where a world point sits relative to the sampling grid of `bounds` at `step`. */
export function cellPhaseOf(point: { x: number; y: number; z: number }, bounds: Bounds, stepFieldUnits: number): CellPhase {
  const frac = (v: number, min: number): number => {
    const u = (v - min) / stepFieldUnits;
    const f = u - Math.floor(u);
    return f < 0 ? f + 1 : f;
  };
  const fx = frac(point.x, bounds.min.x);
  const fy = frac(point.y, bounds.min.y);
  const fz = frac(point.z, bounds.min.z);
  const dx = Math.min(fx, 1 - fx);
  const dy = Math.min(fy, 1 - fy);
  const dz = Math.min(fz, 1 - fz);
  return {
    cellFraction: [fx, fy, fz],
    cornerDistanceSteps: Math.hypot(dx, dy, dz),
    // The nearest grid edge runs along one axis; the distance to it is the
    // in-plane distance in the OTHER two.
    edgeDistanceSteps: Math.min(Math.hypot(dy, dz), Math.hypot(dx, dz), Math.hypot(dx, dy)),
    planeDistanceSteps: Math.min(dx, dy, dz),
    tetIndex: tetIndexOf(fx, fy, fz),
    onTetFace: fx === fy || fy === fz || fx === fz,
  };
}

// ===========================================================================
// 5. Meshing the hard union at an arbitrary grid origin
// ===========================================================================

export interface HardUnionMeshAtPhase {
  bounds: Bounds;
  stepFieldUnits: number;
  grid: GridCounts;
  /** Post-clip, NOT oriented — the mesh the component count is quoted from. */
  mesh: CandidateMeshResult;
  meshMs: number;
}

/**
 * `max(hardUnion, aboveBuildPlateSdf)` meshed at the given bounds, resolution
 * and canonical scale. Everything except the sampling box comes from the shared
 * pieces: the field is `ringUnionPolicies`' `P1-hard-union` and the plate clip
 * is `policySavedField`, both unchanged.
 */
export function buildHardUnionMeshAt(
  result: GrowthResult,
  material: (x: number, y: number, z: number) => number,
  bounds: Bounds,
  resolution: number,
  opts: { orient: boolean },
): HardUnionMeshAtPhase {
  const field = policySavedField(result, material);
  const t0 = Date.now();
  const raw = buildMeshFromField(bounds, field, { resolution, targetLongestMm: 1 });
  const rescaled = rescaleMeshResult(raw, result.canonicalScaleMmPerUnit);
  const oriented = opts.orient ? orientMeshForSavedStl(rescaled) : rescaled;
  return {
    bounds,
    stepFieldUnits: fieldStepOf(bounds, resolution),
    grid: gridCountsOf(bounds, resolution),
    mesh: { ...oriented, plateReference: policyPlateReference(result) },
    meshMs: Date.now() - t0,
  };
}

// ===========================================================================
// 5b. The GRID-FREE control: is the material connected at all?
// ===========================================================================

export interface UnionConnectivityReport {
  samplesPerSegment: number;
  unitCount: number;
  /** Unit pairs the bounding-sphere prune admitted for measurement (a superset of the pairs that can possibly touch). */
  pairsMeasured: number;
  /**
   * Pairs with at least one SAMPLED point pair strictly overlapping. This
   * direction needs no error bound: a sampled overlap is a CERTIFICATE that the
   * two units' material intersects, because the sampled points are real points
   * of the two capsules.
   */
  provenOverlappingPairs: number;
  /** Pairs whose sampled gap is >= 0 but within its own `samplingErrorBoundFieldUnits` of zero — the true minimum could be either sign. Counted, never guessed. */
  ambiguousPairs: number;
  /** Pairs with `sampledGap - errorBound > 0`: proven apart. */
  provenSeparatedPairs: number;
  maxSamplingErrorFieldUnits: number;

  /**
   * Connected components of the UNITS under proven overlaps only. Because every
   * omitted (ambiguous) edge could only merge components, this is an UPPER bound
   * on the true number of connected components of the material.
   */
  componentUpperBound: number;
  /** The same graph with every ambiguous pair ALSO joined — a LOWER bound. */
  componentLowerBound: number;
  /** Component sizes (unit counts) under the proven-only graph, descending. */
  upperBoundComponentSizes: number[];
  /**
   * Same as `componentUpperBound` but an overlap only counts when at least one
   * of its overlapping sample midpoints is ABOVE the build plate — i.e. the
   * contact survives the plate clip the saved mesh applies. Never below the
   * pre-clip number.
   */
  componentUpperBoundAbovePlate: number;
  parentChildEdgeCount: number;
  /** Parent-child graph edges whose two units are NOT proven to overlap. */
  parentChildEdgesNotProvenOverlapping: number;
  /** …of those, how many are merely ambiguous rather than proven separated. */
  parentChildEdgesAmbiguous: number;

  /**
   * The NECK, over the proven-overlapping pairs — the second length scale the
   * mesher has to resolve, and a different question from the tube diameter.
   * `contained` pairs (one sphere entirely inside the other at the closest
   * sample) have no finite neck because the material there is fully merged; they
   * are counted separately rather than folded in as a zero or a large number.
   */
  neck: {
    lensPairs: number;
    containedPairs: number;
    /** `2 × neckRadiusProxy` over the `lens` pairs, field units: min / median / max. NaN when there are none. */
    widthMinFieldUnits: number;
    widthMedianFieldUnits: number;
    widthMaxFieldUnits: number;
    /** Same three numbers restricted to parent-child graph edges. */
    parentChildLensPairs: number;
    parentChildContainedPairs: number;
    parentChildWidthMinFieldUnits: number;
    parentChildWidthMedianFieldUnits: number;
    parentChildWidthMaxFieldUnits: number;
    /** Every `lens` pair's neck width, ascending — so a caller can count how many fall under any given grid step without this function having to know the resolutions. */
    widthsFieldUnits: number[];
    /** The same, restricted to parent-child graph edges. */
    parentChildWidthsFieldUnits: number[];
  };
}

/**
 * Connectivity of the hard union WITHOUT any grid, so it can be compared against
 * the meshed component count and the two can be told apart.
 *
 * Why unit granularity is the right granularity: one unit's own material is a
 * chain of capsules that share endpoints, so a single unit is a connected solid
 * by construction. The union of all units is therefore connected exactly when
 * the graph "unit A's material intersects unit B's" is connected — no third
 * body can bridge two units without itself being one of the units.
 *
 * The pairwise test is the imported `measureCapsulePairGap`, whose sampled
 * minimum is an upper bound with a stated error bound. That asymmetry is kept
 * rather than smoothed over: overlaps are certificates, separations are not, so
 * the result is a BRACKET (`componentLowerBound` … `componentUpperBound`) and
 * never a single number pretending to be exact.
 */
export function measureUnionConnectivity(
  result: GrowthResult,
  samplesPerSegment = 16,
): UnionConnectivityReport {
  const units = result.units;
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const scale = result.canonicalScaleMmPerUnit;

  // Bounding sphere per unit: centroid of its points, radius reaching every
  // point's own surface. Two units can only touch if their spheres do.
  const centre: Array<{ x: number; y: number; z: number; r: number; index: number }> = [];
  let maxRadius = 0;
  units.forEach((u, index) => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of u.points) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const k = Math.max(1, u.points.length);
    cx /= k;
    cy /= k;
    cz /= k;
    let r = 0;
    for (const p of u.points) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy, p.z - cz) + p.r);
    maxRadius = Math.max(maxRadius, r);
    centre.push({ x: cx, y: cy, z: cz, r, index });
  });

  const hash = new SpatialHash<{ x: number; y: number; z: number; r: number; index: number }>(Math.max(1e-6, 2 * maxRadius));
  for (const c of centre) hash.insert(c, c);

  const parent = units.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const parentLoose = units.map((_, i) => i);
  const findLoose = (i: number): number => {
    while (parentLoose[i] !== i) {
      parentLoose[i] = parentLoose[parentLoose[i]];
      i = parentLoose[i];
    }
    return i;
  };
  const joinLoose = (a: number, b: number): void => {
    const ra = findLoose(a);
    const rb = findLoose(b);
    if (ra !== rb) parentLoose[ra] = rb;
  };
  const parentPlate = units.map((_, i) => i);
  const findPlate = (i: number): number => {
    while (parentPlate[i] !== i) {
      parentPlate[i] = parentPlate[parentPlate[i]];
      i = parentPlate[i];
    }
    return i;
  };
  const joinPlate = (a: number, b: number): void => {
    const ra = findPlate(a);
    const rb = findPlate(b);
    if (ra !== rb) parentPlate[ra] = rb;
  };

  let pairsMeasured = 0;
  let proven = 0;
  let ambiguous = 0;
  let separated = 0;
  let maxError = 0;
  const provenPair = new Set<string>();
  const ambiguousPair = new Set<string>();
  const neckWidths: number[] = [];
  const neckWidthOfPair = new Map<string, number>();
  const containedPairs = new Set<string>();

  for (const a of centre) {
    for (const b of hash.queryRadius(a, a.r + maxRadius)) {
      if (b.index <= a.index) continue;
      // Bounding spheres must actually reach each other.
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > a.r + b.r) continue;
      pairsMeasured++;
      const gap = measureCapsulePairGap(units[a.index], units[b.index], samplesPerSegment, buildAxis, plateOffset, scale);
      maxError = Math.max(maxError, gap.samplingErrorBoundFieldUnits);
      const key = `${a.index}>${b.index}`;
      if (gap.sampledMinSignedGapFieldUnits < 0) {
        proven++;
        provenPair.add(key);
        join(a.index, b.index);
        joinLoose(a.index, b.index);
        if (gap.overlapSurvivesAbovePlate) joinPlate(a.index, b.index);
        if (gap.neckState === "contained") {
          containedPairs.add(key);
        } else if (gap.neckRadiusProxyFieldUnits !== null) {
          const w = 2 * gap.neckRadiusProxyFieldUnits;
          neckWidths.push(w);
          neckWidthOfPair.set(key, w);
        }
      } else if (gap.sampledMinSignedGapFieldUnits - gap.samplingErrorBoundFieldUnits > 0) {
        separated++;
      } else {
        ambiguous++;
        ambiguousPair.add(key);
        joinLoose(a.index, b.index);
      }
    }
  }

  const sizes = new Map<number, number>();
  for (let i = 0; i < units.length; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  const looseRoots = new Set<number>();
  for (let i = 0; i < units.length; i++) looseRoots.add(findLoose(i));
  const plateRoots = new Set<number>();
  for (let i = 0; i < units.length; i++) plateRoots.add(findPlate(i));

  const indexOfId = new Map(units.map((u, i) => [u.id, i]));
  let edgeCount = 0;
  let edgesNotProven = 0;
  let edgesAmbiguous = 0;
  const edgeNeckWidths: number[] = [];
  let edgeContained = 0;
  for (const child of units) {
    if (child.parentId === null) continue;
    const pi = indexOfId.get(child.parentId);
    const ci = indexOfId.get(child.id);
    if (pi === undefined || ci === undefined) continue;
    edgeCount++;
    const key = pi < ci ? `${pi}>${ci}` : `${ci}>${pi}`;
    if (!provenPair.has(key)) {
      edgesNotProven++;
      if (ambiguousPair.has(key)) edgesAmbiguous++;
      continue;
    }
    if (containedPairs.has(key)) edgeContained++;
    const w = neckWidthOfPair.get(key);
    if (w !== undefined) edgeNeckWidths.push(w);
  }

  return {
    samplesPerSegment,
    unitCount: units.length,
    pairsMeasured,
    provenOverlappingPairs: proven,
    ambiguousPairs: ambiguous,
    provenSeparatedPairs: separated,
    maxSamplingErrorFieldUnits: maxError,
    componentUpperBound: sizes.size,
    componentLowerBound: looseRoots.size,
    upperBoundComponentSizes: [...sizes.values()].sort((p, q) => q - p),
    componentUpperBoundAbovePlate: plateRoots.size,
    parentChildEdgeCount: edgeCount,
    parentChildEdgesNotProvenOverlapping: edgesNotProven,
    parentChildEdgesAmbiguous: edgesAmbiguous,
    neck: {
      lensPairs: neckWidths.length,
      containedPairs: containedPairs.size,
      widthMinFieldUnits: neckWidths.length > 0 ? Math.min(...neckWidths) : NaN,
      widthMedianFieldUnits: median(neckWidths),
      widthMaxFieldUnits: neckWidths.length > 0 ? Math.max(...neckWidths) : NaN,
      parentChildLensPairs: edgeNeckWidths.length,
      parentChildContainedPairs: edgeContained,
      parentChildWidthMinFieldUnits: edgeNeckWidths.length > 0 ? Math.min(...edgeNeckWidths) : NaN,
      parentChildWidthMedianFieldUnits: median(edgeNeckWidths),
      parentChildWidthMaxFieldUnits: edgeNeckWidths.length > 0 ? Math.max(...edgeNeckWidths) : NaN,
      widthsFieldUnits: [...neckWidths].sort((p, q) => p - q),
      parentChildWidthsFieldUnits: [...edgeNeckWidths].sort((p, q) => p - q),
    },
  };
}

// ===========================================================================
// 6. D2 — where along a ring does it break?
// ===========================================================================

export type BreakSite = "at-plate-boundary" | "near-node" | "mid-segment";

export interface RingBreak {
  unitId: number;
  /** Chain segment `points[i] -> points[(i+1) % n]` the break falls in. */
  segmentIndex: number;
  /** Parameter along that segment, 0..1. */
  t: number;
  point: Vec3;
  /** Interpolated tube radius at the break, field units. */
  tubeRadiusFieldUnits: number;
  /** Arc length from the break to the nearer of the segment's two node centres, field units. */
  distanceToNearestNodeFieldUnits: number;
  /** That node's own radius — the length scale the `near-node` test compares against. */
  nearestNodeRadiusFieldUnits: number;
  /** `aboveBuildPlateSdf` at the break point, field units. Zero = exactly on the plate plane. */
  plateSdfFieldUnits: number;
  /** How wide the interval between the last sample of one component and the first of the next was, in field units — this break's position is only known to within it. */
  positionUncertaintyFieldUnits: number;
  fromComponentRank: number;
  toComponentRank: number;
  phase: CellPhase;
  site: BreakSite;
}

export interface RingBreakReport {
  /** Samples per grid step along the centreline. */
  samplesPerStep: number;
  /** A component must hold at least this share of a unit's triangles to be one of that unit's components (same rule and default as `measureWholeMeshFragmentation`). */
  minComponentShare: number;
  /** `|plateSdf| <= plateBandFieldUnits` classifies a break as `at-plate-boundary`. Set to one grid step: within one cell of the plate plane the clip's own discretisation is a candidate cause and the node/mid-segment question cannot be separated from it. */
  plateBandFieldUnits: number;
  unitsExamined: number;
  /** Units that span more than one component but where the centreline walk found no transition — reported, never rounded to zero. A ring whose two pieces are not separated ALONG the centreline (e.g. a lengthwise split) lands here. */
  unitsWithNoLocatedBreak: number[];
  breaks: RingBreak[];
  bySite: Record<BreakSite, number>;
  /**
   * The share of the examined rings' TOTAL centreline arc that falls inside the
   * `near-node` band (within one node radius of a node centre), over the same
   * units the breaks came from.
   *
   * This is the null: if breaks were placed uniformly along the centreline,
   * `bySite["near-node"] / breaks.length` would come out at about this value.
   * Reported because "most breaks are near a node" means nothing until it is
   * read against how much of the ring counts as "near a node" — and on these
   * rings that is most of it.
   */
  nearNodeArcShare: number;
  /** Centreline samples that found no surface of their own unit within the search radius, over all examined units — the walk's blind spots. */
  blindSamples: number;
  totalSamples: number;
}

/**
 * Triangle index -> the unit it lies closest to, using the IMPORTED
 * `createNearestUnitLookup` — the same assignment `mapUnitsToComponents` (and
 * therefore `measureWholeMeshFragmentation`) uses, so the D2 break locations and
 * the D1 within-ring counts can never be based on two different opinions about
 * which unit a triangle belongs to.
 */
function assignTrianglesToUnits(units: GrowthUnit[], triangles: Triangle[]): Int32Array {
  const nearest = createNearestUnitLookup(units);
  const unitOf = new Int32Array(triangles.length).fill(-1);
  for (let t = 0; t < triangles.length; t++) {
    const { a, b, c } = triangles[t];
    const hit = nearest((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
    if (hit) unitOf[t] = hit.unitId;
  }
  return unitOf;
}

/**
 * Walk each fragmenting ring's own centreline and report where the component
 * label changes.
 *
 * The label at a centreline point is taken from the NEAREST triangle that the
 * nearest-unit assignment gave to THAT unit — a neighbouring unit's surface can
 * therefore never supply the label. Where no such triangle is within the search
 * radius the sample is `blind` (counted, never guessed); a break is placed at
 * the midpoint of the blind run separating two different labels and its width is
 * carried as `positionUncertaintyFieldUnits`.
 *
 * `triangles` and `report` must be the SAME mesh: `report.labelOf` is indexed by
 * triangle index.
 */
export function locateRingBreaks(
  units: GrowthUnit[],
  triangles: Triangle[],
  report: ComponentReport,
  geometry: {
    bounds: Bounds;
    stepFieldUnits: number;
    /** `aboveBuildPlateSdf` bound to this candidate's axis and plate offset, or null for a synthetic fixture with no plate. */
    plateSdf: ((x: number, y: number, z: number) => number) | null;
  },
  options: { samplesPerStep?: number; minComponentShare?: number } = {},
): RingBreakReport {
  const samplesPerStep = options.samplesPerStep ?? 8;
  const minComponentShare = options.minComponentShare ?? 0.05;
  const step = geometry.stepFieldUnits;
  const unitOf = assignTrianglesToUnits(units, triangles);

  const byUnit = new Map<number, number[]>();
  for (let t = 0; t < triangles.length; t++) {
    const id = unitOf[t];
    if (id < 0) continue;
    let list = byUnit.get(id);
    if (!list) {
      list = [];
      byUnit.set(id, list);
    }
    list.push(t);
  }

  const breaks: RingBreak[] = [];
  const bySite: Record<BreakSite, number> = { "at-plate-boundary": 0, "near-node": 0, "mid-segment": 0 };
  const noBreak: number[] = [];
  let examined = 0;
  let blindSamples = 0;
  let totalSamples = 0;
  let nearNodeArc = 0;
  let totalArcOverExamined = 0;

  for (const unit of units) {
    if (unit.kind !== "ring" || unit.points.length < 2) continue;
    const own = byUnit.get(unit.id);
    if (!own || own.length === 0) continue;
    const perComponent = new Map<number, number>();
    for (const t of own) perComponent.set(report.labelOf[t], (perComponent.get(report.labelOf[t]) ?? 0) + 1);
    const significant = new Set(
      [...perComponent.entries()].filter(([, count]) => count / own.length >= minComponentShare).map(([rank]) => rank),
    );
    if (significant.size <= 1) continue;
    examined++;

    // Index this unit's own triangles by centroid so the centreline walk reads
    // only its own surface.
    const maxR = Math.max(...unit.points.map((p) => p.r));
    const searchRadius = maxR + 2 * step;
    const cellSize = Math.max(1e-6, searchRadius);
    const hash = new SpatialHash<{ t: number; x: number; y: number; z: number }>(cellSize);
    for (const t of own) {
      const { a, b, c } = triangles[t];
      const p = { t, x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 };
      hash.insert(p, p);
    }

    // Walk the closed chain, recording (arcLength, segmentIndex, t, label).
    interface Walk {
      s: number;
      seg: number;
      t: number;
      x: number;
      y: number;
      z: number;
      r: number;
      label: number;
    }
    const walk: Walk[] = [];
    let arc = 0;
    const n = unit.points.length;
    const segLengths: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = unit.points[i];
      const b = unit.points[(i + 1) % n];
      segLengths.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    for (let i = 0; i < n; i++) {
      const a = unit.points[i];
      const b = unit.points[(i + 1) % n];
      const len = segLengths[i];
      const count = Math.max(2, Math.ceil((len / step) * samplesPerStep));
      for (let k = 0; k < count; k++) {
        const t = k / count;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const z = a.z + (b.z - a.z) * t;
        const r = a.r + (b.r - a.r) * t;
        const near = hash.queryRadius({ x, y, z }, searchRadius);
        let label = -1;
        let best = Infinity;
        for (const c of near) {
          const d = (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2;
          const candidate = report.labelOf[c.t];
          if (!significant.has(candidate)) continue;
          if (d < best) {
            best = d;
            label = candidate;
          }
        }
        totalSamples++;
        if (label < 0) blindSamples++;
        walk.push({ s: arc + len * t, seg: i, t, x, y, z, r, label });
      }
      arc += len;
    }
    const totalArc = arc;
    // The null against which "most breaks are near a node" has to be read: how
    // much of this ring's own centreline the near-node test already covers.
    totalArcOverExamined += totalArc;
    for (let i = 0; i < n; i++) {
      const a = unit.points[i];
      const b = unit.points[(i + 1) % n];
      const len = segLengths[i];
      nearNodeArc += Math.min(len, Math.min(a.r, len / 2) + Math.min(b.r, len / 2));
    }
    if (walk.length === 0) {
      noBreak.push(unit.id);
      continue;
    }

    // Transitions on the CLOSED walk: for each pair of consecutive labelled
    // samples with different labels, place the break between them.
    const labelled = walk.map((w, i) => ({ w, i })).filter((e) => e.w.label >= 0);
    if (labelled.length < 2) {
      noBreak.push(unit.id);
      continue;
    }
    let found = 0;
    for (let e = 0; e < labelled.length; e++) {
      const from = labelled[e];
      const to = labelled[(e + 1) % labelled.length];
      if (from.w.label === to.w.label) continue;
      // Arc distance forward from `from` to `to` on the closed ring.
      const forward = to.w.s >= from.w.s ? to.w.s - from.w.s : to.w.s + totalArc - from.w.s;
      const mid = (from.w.s + forward / 2) % totalArc;
      // Resolve `mid` back to (segment, t).
      let seg = 0;
      let acc = 0;
      while (seg < n - 1 && acc + segLengths[seg] < mid) {
        acc += segLengths[seg];
        seg++;
      }
      const tt = segLengths[seg] > 0 ? Math.min(1, Math.max(0, (mid - acc) / segLengths[seg])) : 0;
      const a = unit.points[seg];
      const b = unit.points[(seg + 1) % n];
      const point: Vec3 = { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt, z: a.z + (b.z - a.z) * tt };
      const radius = a.r + (b.r - a.r) * tt;
      const dNode = Math.min(segLengths[seg] * tt, segLengths[seg] * (1 - tt));
      const nearestNodeRadius = tt <= 0.5 ? a.r : b.r;
      const plateSdf = geometry.plateSdf ? geometry.plateSdf(point.x, point.y, point.z) : NaN;
      const site: BreakSite =
        geometry.plateSdf && Math.abs(plateSdf) <= step
          ? "at-plate-boundary"
          : dNode <= nearestNodeRadius
            ? "near-node"
            : "mid-segment";
      bySite[site]++;
      found++;
      breaks.push({
        unitId: unit.id,
        segmentIndex: seg,
        t: tt,
        point,
        tubeRadiusFieldUnits: radius,
        distanceToNearestNodeFieldUnits: dNode,
        nearestNodeRadiusFieldUnits: nearestNodeRadius,
        plateSdfFieldUnits: plateSdf,
        positionUncertaintyFieldUnits: forward,
        fromComponentRank: from.w.label,
        toComponentRank: to.w.label,
        phase: cellPhaseOf(point, geometry.bounds, step),
        site,
      });
    }
    if (found === 0) noBreak.push(unit.id);
  }

  return {
    samplesPerStep,
    minComponentShare,
    plateBandFieldUnits: step,
    unitsExamined: examined,
    unitsWithNoLocatedBreak: noBreak.sort((a, b) => a - b),
    breaks,
    bySite,
    nearNodeArcShare: totalArcOverExamined > 0 ? nearNodeArc / totalArcOverExamined : NaN,
    blindSamples,
    totalSamples,
  };
}

// ===========================================================================
// 6b. What IS a non-largest component made of?
// ===========================================================================

/**
 * What a non-largest component encloses.
 *
 * `cavity-wall` and `solid-island` are opposite things that a component COUNT
 * cannot tell apart, and conflating them is the difference between "the shape
 * fell into pieces" and "the shape has pockets in it".
 */
export type ComponentEnclosure = "cavity-wall" | "solid-island" | "undetermined";

export interface ComponentIslandStat {
  rank: number;
  triangleCount: number;
  /** This component's own bbox, longest edge, in grid steps. Under 1 means it does not span even one cell. */
  bboxLongestSteps: number;
  /** Grid corners of THIS row's lattice inside the component's own bbox at which the meshed field is negative (inside material). */
  negativeGridCornersInBbox: number;
  /** …and positive (outside material). A closed surface must have at least one of each nearby; which one is INSIDE it is what `enclosure` answers. */
  positiveGridCornersInBbox: number;
  /** Signed volume proxy on the UN-ORIENTED mesh, mm³ — the sign is the evidence for `enclosure`. */
  signedVolumeProxyMm3: number;
  closed: boolean;
  windingConsistent: boolean;
  /**
   * WHY THE SIGN DECIDES THIS. `buildMeshFromField` orients each triangle by the
   * field GRADIENT (`orientTriangle`/`tetGradient`), so every normal points from
   * negative (inside material) toward positive (outside). A closed surface
   * bounding a solid island therefore has OUTWARD normals and a positive signed
   * volume; a closed surface bounding a CAVITY inside material has its normals
   * pointing into the cavity, so its signed volume is negative. This is the same
   * convention `measureSignedVolumeConvention` establishes and `growth.test.ts`
   * P2.3-11 asserts, and it is only readable BEFORE `orientMeshForSavedStl`,
   * which forces every component positive — which is why this measurement is
   * taken on the un-oriented mesh.
   *
   * `undetermined` for a component that is not closed and consistently wound, or
   * whose signed volume is exactly zero: the sign carries no meaning there and
   * is not read as one.
   */
  enclosure: ComponentEnclosure;
}

export interface ComponentIslandReport {
  /** Rows for every component past the largest. */
  stats: ComponentIslandStat[];
  /** Components whose surface encloses exactly one negative grid corner. */
  singleCornerIslands: number;
  /** …at most four (a corner and its immediate lattice neighbours). */
  atMostFourCornerIslands: number;
  /** Largest `negativeGridCornersInBbox` over the non-largest components. */
  maxCornersInANonLargestComponent: number;
  /** Non-largest components that are the wall of an enclosed VOID inside the solid — not pieces of it. */
  cavityWallCount: number;
  /** Non-largest components that really are detached solid material. */
  solidIslandCount: number;
  undeterminedCount: number;
  /** Total |signed volume| held by the cavity walls and by the solid islands, mm³ — so "how many" is never read without "how much". */
  cavityVolumeMm3: number;
  solidIslandVolumeMm3: number;
  /** The largest component's own enclosure, for the control: it must read `solid-island`. */
  largestEnclosure: ComponentEnclosure;
}

/**
 * Ask what the extra components actually ARE, instead of inferring it from a
 * triangle count.
 *
 * The mesh is in FIELD units (`rescaleMeshResult` re-derives the mm bounds and
 * the scale but leaves the vertices alone), so a component's bbox can be walked
 * against the same lattice the mesher used, and the field re-evaluated at each
 * corner with the SAME composite the row meshed.
 */
export function measureComponentIslands(
  triangles: Triangle[],
  report: ComponentReport,
  field: (x: number, y: number, z: number) => number,
  bounds: Bounds,
  stepFieldUnits: number,
): ComponentIslandReport {
  const enclosureOf = (c: ComponentReport["components"][number]): ComponentEnclosure => {
    if (!c.surface.closed || !c.surface.windingConsistent || c.signedVolumeProxyMm3 === 0) return "undetermined";
    return c.signedVolumeProxyMm3 > 0 ? "solid-island" : "cavity-wall";
  };
  const stats: ComponentIslandStat[] = [];
  for (const c of report.components) {
    if (c.rank === 0) continue;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let t = 0; t < triangles.length; t++) {
      if (report.labelOf[t] !== c.rank) continue;
      for (const v of [triangles[t].a, triangles[t].b, triangles[t].c]) {
        minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); minZ = Math.min(minZ, v.z);
        maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); maxZ = Math.max(maxZ, v.z);
      }
    }
    if (!Number.isFinite(minX)) continue;
    const lo = { x: minX - stepFieldUnits, y: minY - stepFieldUnits, z: minZ - stepFieldUnits };
    const hi = { x: maxX + stepFieldUnits, y: maxY + stepFieldUnits, z: maxZ + stepFieldUnits };
    let negatives = 0;
    let positives = 0;
    const first = (v: number, min: number): number => Math.ceil((v - min) / stepFieldUnits);
    const last = (v: number, min: number): number => Math.floor((v - min) / stepFieldUnits);
    for (let i = first(lo.x, bounds.min.x); i <= last(hi.x, bounds.min.x); i++) {
      for (let j = first(lo.y, bounds.min.y); j <= last(hi.y, bounds.min.y); j++) {
        for (let k = first(lo.z, bounds.min.z); k <= last(hi.z, bounds.min.z); k++) {
          const x = bounds.min.x + i * stepFieldUnits;
          const y = bounds.min.y + j * stepFieldUnits;
          const z = bounds.min.z + k * stepFieldUnits;
          if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) continue;
          if (field(x, y, z) < 0) negatives++;
          else positives++;
        }
      }
    }
    stats.push({
      rank: c.rank,
      triangleCount: c.triangleCount,
      bboxLongestSteps: Math.max(maxX - minX, maxY - minY, maxZ - minZ) / stepFieldUnits,
      negativeGridCornersInBbox: negatives,
      positiveGridCornersInBbox: positives,
      signedVolumeProxyMm3: c.signedVolumeProxyMm3,
      closed: c.surface.closed,
      windingConsistent: c.surface.windingConsistent,
      enclosure: enclosureOf(c),
    });
  }
  const cavities = stats.filter((s) => s.enclosure === "cavity-wall");
  const islands = stats.filter((s) => s.enclosure === "solid-island");
  return {
    stats,
    singleCornerIslands: stats.filter((s) => s.negativeGridCornersInBbox === 1).length,
    atMostFourCornerIslands: stats.filter((s) => s.negativeGridCornersInBbox <= 4).length,
    maxCornersInANonLargestComponent: stats.reduce((m, s) => Math.max(m, s.negativeGridCornersInBbox), 0),
    cavityWallCount: cavities.length,
    solidIslandCount: islands.length,
    undeterminedCount: stats.length - cavities.length - islands.length,
    cavityVolumeMm3: cavities.reduce((s, c) => s + Math.abs(c.signedVolumeProxyMm3), 0),
    solidIslandVolumeMm3: islands.reduce((s, c) => s + Math.abs(c.signedVolumeProxyMm3), 0),
    largestEnclosure: report.components.length > 0 ? enclosureOf(report.components[0]) : "undetermined",
  };
}

// ===========================================================================
// 7. One sweep row
// ===========================================================================

export interface SamplingRowOptions {
  /** Grid-origin phase in units of the field step. `[0,0,0]` is the production grid. */
  phase: readonly [number, number, number];
  /** Also mesh the EXACT `baseHardSdf` and report its component count, so the indexed sampler is proved to agree rather than assumed to. Affordable only at low resolution. */
  includeExact: boolean;
  /** Assign triangles to units and report the WITHIN-ring fragmentation (D1's headline column). */
  includeFragmentation: boolean;
  /** Locate and classify each break (D2). Requires `includeFragmentation`. */
  includeBreaks: boolean;
  /** Ask what each non-largest component is built around (§6b). */
  includeIslands: boolean;
  minComponentShare: number;
  breakSamplesPerStep: number;
}

export const DEFAULT_SAMPLING_ROW_OPTIONS: SamplingRowOptions = {
  phase: [0, 0, 0],
  includeExact: false,
  includeFragmentation: true,
  includeBreaks: false,
  includeIslands: true,
  minComponentShare: 0.05,
  breakSamplesPerStep: 8,
};

export interface SamplingSweepRow {
  hostId: string;
  unitCount: number;
  resolution: number;
  phase: [number, number, number];
  phaseLabel: string;

  productionBlendK: number;
  canonicalScaleMmPerUnit: number;
  boundsLongestFieldUnits: number;
  stepFieldUnits: number;
  stepMm: number;
  grid: GridCounts;
  /** Material-to-box clearance after the phase shift, field units. Must stay positive. */
  materialClearanceFieldUnits: number;

  tube: TubeScale;
  cellsAcrossTube: CellsAcrossTube;
  minTubeDiameterMm: number;

  /** Post-clip INDEXED hard union, un-oriented. The count the sweep is read from. */
  hardUnionComponentCount: number;
  /** Post-clip EXACT hard union (`baseHardSdf`), or null when not run. */
  exactHardUnionComponentCount: number | null;
  /** Post-clip indexed + `orientMeshForSavedStl` — the saved mesh. */
  savedComponentCount: number;
  /** The saved mesh's bytes, decoded and re-counted. */
  stlRoundTripComponentCount: number;

  /** Triangle counts of the hard-union mesh's components, descending. Reported because "27 components" and "52 components" mean very different things depending on whether the extras are whole rings or single-cell specks. */
  componentTriangleCounts: number[];
  /** Components with fewer than 32 triangles — roughly one grid cell's worth of surface. */
  tinyComponentCount: number;
  /** Share of all triangles NOT in the largest component. */
  nonLargestTriangleShare: number;
  /** What the non-largest components are made of. Null when `includeIslands` was false. */
  islands: ComponentIslandReport | null;

  triangleCount: number;
  savedTriangleCount: number;
  openEdges: number;
  nonManifoldEdges: number;
  windingInconsistentEdges: number;
  degenerateTriangleCount: number;

  lowestBuildAxisMm: number;
  plateBoundaryEpsilonMm: number;
  plateContactVertexCount: number;
  savedBboxMm: { x: number; y: number; z: number };

  fragmentation: WholeMeshFragmentation | null;
  /** `fragmentation.unitsSpanningMultipleComponents.length`, hoisted because it is the column the verdict reads. */
  withinRingFragmentingUnitCount: number | null;
  breaks: RingBreakReport | null;

  meshMs: number;
  savedMeshMs: number;
  componentMs: number;
  fragmentationMs: number;
  breakMs: number;
  totalMs: number;
  /** `process.resourceUsage().maxRSS` in MB — a PROCESS-lifetime peak, not this row's own peak, and monotone across rows. Null where the runtime does not expose it. */
  processPeakRssMb: number | null;
  rssAfterMb: number | null;
}

// Module-scoped, following `ringFusionDiagnosis.report.ts`'s idiom: this repo
// deliberately has no `@types/node`, so only the members actually read are
// declared. Nothing here is reachable from a browser build.
declare const process: {
  memoryUsage?: () => { rss: number };
  resourceUsage?: () => { maxRSS: number };
};

/**
 * Process-lifetime peak resident set, MB.
 *
 * UNIT NOTE, stated because getting it wrong misreports by 1000×: `getrusage`'s
 * raw `ru_maxrss` is kilobytes on Linux and BYTES on macOS, but libuv normalises
 * it, so Node's `maxRSS` is kilobytes on both. That was not taken on faith —
 * it was cross-checked on this machine (darwin) against `memoryUsage().rss`
 * measured in the same row: rss 934 MB against maxRSS/1024 = 976 MB, i.e. the
 * same order, where the bytes reading would have given 1 MB. `rssAfterMb` is
 * carried alongside in every row so the same cross-check is available to any
 * reader on any platform.
 *
 * It is a PROCESS peak, not this row's peak, so it is monotone across rows —
 * read differences between consecutive rows, never a single row's value as
 * "what this resolution cost".
 */
function processPeakRssMb(): number | null {
  if (typeof process === "undefined" || typeof process.resourceUsage !== "function") return null;
  return process.resourceUsage().maxRSS / 1024;
}

function rssMb(): number | null {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") return null;
  return process.memoryUsage().rss / 1e6;
}

/**
 * One host × one resolution × one grid phase, measured through the shared
 * pipeline. Pure apart from the wall-clock and memory columns, which are
 * measurements OF THIS MACHINE and are excluded from the determinism
 * fingerprint.
 */
export function measureSamplingRow(
  result: GrowthResult,
  resolution: number,
  options: Partial<SamplingRowOptions> = {},
): SamplingSweepRow {
  const o: SamplingRowOptions = { ...DEFAULT_SAMPLING_ROW_OPTIONS, ...options };
  const t0 = Date.now();
  const productionBlendK = result.params.unitRadius * 0.3;
  const layerHeightMm = result.envelope.layerHeightMm;
  const policy = buildPolicy(result.units, "P1-hard-union", { productionBlendK });
  const baseBounds = diagnosisBounds(result, policy.boundsBlendK);
  const step = fieldStepOf(baseBounds, resolution);
  const phase: [number, number, number] = [o.phase[0], o.phase[1], o.phase[2]];
  const bounds = phaseShiftedBounds(baseBounds, phase, step);
  const plateReference: SavedPlateReference = policyPlateReference(result);
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const plateSdf = (x: number, y: number, z: number): number => aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset);

  const indexed = buildHardUnionMeshAt(result, policy.indexed, bounds, resolution, { orient: false });
  const tc = Date.now();
  const indexedReport = measureComponents(indexed.mesh.triangles, indexed.mesh.scaleMmPerUnit, plateReference, layerHeightMm);
  const componentMs = Date.now() - tc;

  let exactCount: number | null = null;
  if (o.includeExact) {
    const exact = buildHardUnionMeshAt(result, policy.exact, bounds, resolution, { orient: false });
    exactCount = measureComponents(exact.mesh.triangles, exact.mesh.scaleMmPerUnit, plateReference, layerHeightMm).componentCount;
  }

  const saved = buildHardUnionMeshAt(result, policy.indexed, bounds, resolution, { orient: true });
  const savedReport = measureComponents(saved.mesh.triangles, saved.mesh.scaleMmPerUnit, plateReference, layerHeightMm);
  const topology = inspectSavedStlTopology(saved.mesh.triangles, saved.mesh.scaleMmPerUnit);
  const decoded = decodeBinaryStlTriangles(encodeBinaryStl(saved.mesh, "p25-sampling.stl"));
  const stlReport = measureComponents(
    decoded,
    1,
    { ...plateReference, plateOffsetFieldUnits: plateReference.plateOffsetFieldUnits * saved.mesh.scaleMmPerUnit },
    layerHeightMm,
  );

  const tf = Date.now();
  const fragmentation = o.includeFragmentation
    ? measureWholeMeshFragmentation(result, indexed.mesh.triangles, indexedReport, null, o.minComponentShare)
    : null;
  const fragmentationMs = Date.now() - tf;

  const tb = Date.now();
  const breaks =
    o.includeBreaks && fragmentation
      ? locateRingBreaks(result.units, indexed.mesh.triangles, indexedReport, { bounds, stepFieldUnits: step, plateSdf }, {
          samplesPerStep: o.breakSamplesPerStep,
          minComponentShare: o.minComponentShare,
        })
      : null;
  const breakMs = Date.now() - tb;

  const tube = measureTubeScale(result.units);
  const size = saved.mesh.mmBounds.size;
  return {
    hostId: result.hostId,
    unitCount: result.units.length,
    resolution,
    phase,
    phaseLabel: phaseLabel(phase),

    productionBlendK,
    canonicalScaleMmPerUnit: result.canonicalScaleMmPerUnit,
    boundsLongestFieldUnits: bounds.longest,
    stepFieldUnits: step,
    stepMm: step * result.canonicalScaleMmPerUnit,
    grid: indexed.grid,
    materialClearanceFieldUnits: materialClearanceFieldUnits(result.units, bounds),

    tube,
    cellsAcrossTube: cellsAcrossTube(tube, step),
    minTubeDiameterMm: tube.minTubeDiameterFieldUnits * result.canonicalScaleMmPerUnit,

    hardUnionComponentCount: indexedReport.componentCount,
    exactHardUnionComponentCount: exactCount,
    savedComponentCount: savedReport.componentCount,
    stlRoundTripComponentCount: stlReport.componentCount,

    componentTriangleCounts: indexedReport.components.map((c) => c.triangleCount),
    tinyComponentCount: indexedReport.components.filter((c) => c.triangleCount < 32).length,
    nonLargestTriangleShare:
      indexedReport.triangleCount > 0
        ? (indexedReport.triangleCount - (indexedReport.components[0]?.triangleCount ?? 0)) / indexedReport.triangleCount
        : 0,
    islands: o.includeIslands
      ? measureComponentIslands(indexed.mesh.triangles, indexedReport, policySavedField(result, policy.indexed), bounds, step)
      : null,

    triangleCount: indexed.mesh.triangles.length,
    savedTriangleCount: saved.mesh.triangles.length,
    openEdges: topology.openEdges,
    nonManifoldEdges: topology.nonManifoldEdges,
    windingInconsistentEdges: topology.windingInconsistentEdges,
    degenerateTriangleCount: topology.degenerateTriangleCount,

    lowestBuildAxisMm: meshLowestBuildAxisMm(saved.mesh),
    plateBoundaryEpsilonMm: plateBoundaryEpsilonMm(layerHeightMm),
    plateContactVertexCount: countPlateContactVertices(saved.mesh, layerHeightMm),
    savedBboxMm: { x: size.x, y: size.y, z: size.z },

    fragmentation,
    withinRingFragmentingUnitCount: fragmentation ? fragmentation.unitsSpanningMultipleComponents.length : null,
    breaks,

    meshMs: indexed.meshMs,
    savedMeshMs: saved.meshMs,
    componentMs,
    fragmentationMs,
    breakMs,
    totalMs: Date.now() - t0,
    processPeakRssMb: processPeakRssMb(),
    rssAfterMb: rssMb(),
  };
}

/** Everything a determinism check must find bit-identical — the wall-clock and memory columns are measurements of the machine and are deliberately excluded. */
export function samplingRowFingerprint(row: SamplingSweepRow): string {
  return JSON.stringify({
    hostId: row.hostId,
    unitCount: row.unitCount,
    resolution: row.resolution,
    phase: row.phase,
    boundsLongestFieldUnits: row.boundsLongestFieldUnits,
    stepFieldUnits: row.stepFieldUnits,
    grid: row.grid,
    materialClearanceFieldUnits: row.materialClearanceFieldUnits,
    tube: row.tube,
    cellsAcrossTube: row.cellsAcrossTube,
    hardUnionComponentCount: row.hardUnionComponentCount,
    exactHardUnionComponentCount: row.exactHardUnionComponentCount,
    savedComponentCount: row.savedComponentCount,
    stlRoundTripComponentCount: row.stlRoundTripComponentCount,
    componentTriangleCounts: row.componentTriangleCounts,
    tinyComponentCount: row.tinyComponentCount,
    nonLargestTriangleShare: row.nonLargestTriangleShare,
    islands: row.islands === null
      ? null
      : {
          singleCornerIslands: row.islands.singleCornerIslands,
          atMostFourCornerIslands: row.islands.atMostFourCornerIslands,
          maxCornersInANonLargestComponent: row.islands.maxCornersInANonLargestComponent,
          cavityWallCount: row.islands.cavityWallCount,
          solidIslandCount: row.islands.solidIslandCount,
          undeterminedCount: row.islands.undeterminedCount,
          largestEnclosure: row.islands.largestEnclosure,
        },
    triangleCount: row.triangleCount,
    savedTriangleCount: row.savedTriangleCount,
    openEdges: row.openEdges,
    nonManifoldEdges: row.nonManifoldEdges,
    windingInconsistentEdges: row.windingInconsistentEdges,
    degenerateTriangleCount: row.degenerateTriangleCount,
    lowestBuildAxisMm: row.lowestBuildAxisMm,
    plateContactVertexCount: row.plateContactVertexCount,
    savedBboxMm: row.savedBboxMm,
    withinRingFragmentingUnitCount: row.withinRingFragmentingUnitCount,
    withinUnitExcess: row.fragmentation?.withinUnitExcess ?? null,
    maxComponentsPerUnit: row.fragmentation?.maxComponentsPerUnit ?? null,
    severedEdgeCount: row.fragmentation?.severedEdgeCount ?? null,
    residual: row.fragmentation?.residual ?? null,
    breaksBySite: row.breaks?.bySite ?? null,
    breakCount: row.breaks?.breaks.length ?? null,
  });
}

// ===========================================================================
// 8. A synthetic closed ring — the control the whole hypothesis rests on
// ===========================================================================

export interface SyntheticRingMeasurement {
  resolution: number;
  phase: [number, number, number];
  bounds: Bounds;
  stepFieldUnits: number;
  tubeDiameterFieldUnits: number;
  cellsAcrossTube: number;
  triangleCount: number;
  componentCount: number;
  /** The mesh itself, so a caller can run the D2 break locator over the control without re-meshing it. */
  triangles: Triangle[];
}

/**
 * A closed tapered-capsule chain — the SAME `fieldElementsOf("ring", points)`
 * decomposition a real ring unit uses — hard-unioned and meshed by the SHIPPED
 * mesher, with no plate clip and no other unit anywhere near it.
 *
 * This is the control: such a chain is a connected solid by construction, so
 * every component past the first is the grid's, not the field's. If it does not
 * fragment at a coarse step and fuse at a fine one, the undersampling
 * explanation is dead on the simplest possible case and nothing measured on the
 * real candidate can revive it.
 */
export function measureSyntheticRing(
  points: GrowthUnitPoint[],
  resolution: number,
  phase: readonly [number, number, number] = [0, 0, 0],
  marginFieldUnits = 0.2,
): SyntheticRingMeasurement {
  const elements = fieldElementsOf("ring", points);
  if (elements.length === 0) throw new Error("measureSyntheticRing: no elements");
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x - p.r);
    minY = Math.min(minY, p.y - p.r);
    minZ = Math.min(minZ, p.z - p.r);
    maxX = Math.max(maxX, p.x + p.r);
    maxY = Math.max(maxY, p.y + p.r);
    maxZ = Math.max(maxZ, p.z + p.r);
  }
  const min = { x: minX - marginFieldUnits, y: minY - marginFieldUnits, z: minZ - marginFieldUnits };
  const max = { x: maxX + marginFieldUnits, y: maxY + marginFieldUnits, z: maxZ + marginFieldUnits };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const base: Bounds = { min, max, size, longest: Math.max(size.x, size.y, size.z) };
  const step = fieldStepOf(base, resolution);
  const bounds = phaseShiftedBounds(base, phase, step);
  const field = (x: number, y: number, z: number): number => {
    let d = Infinity;
    for (const e of elements) {
      const de = elementSdf(e, x, y, z);
      if (de < d) d = de;
    }
    return d;
  };
  const mesh = buildMeshFromField(bounds, field, { resolution, targetLongestMm: 1 });
  const keyOf = (v: MeshVertex) => `${Math.fround(v.x)},${Math.fround(v.y)},${Math.fround(v.z)}`;
  const tubeDiameter = 2 * Math.min(...points.map((p) => p.r));
  return {
    resolution,
    phase: [phase[0], phase[1], phase[2]],
    bounds,
    stepFieldUnits: step,
    tubeDiameterFieldUnits: tubeDiameter,
    cellsAcrossTube: tubeDiameter / step,
    triangleCount: mesh.triangles.length,
    componentCount: computeConnectedComponentsWithKey(mesh.triangles, keyOf),
    triangles: mesh.triangles,
  };
}

/** A planar closed ring of `n` equal-radius nodes on a circle — the simplest possible instance of the shape under test. */
export function syntheticRingPoints(nodeCount: number, ringRadius: number, tubeRadius: number, centre: Vec3 = { x: 0, y: 0, z: 0 }): GrowthUnitPoint[] {
  const points: GrowthUnitPoint[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const a = (2 * Math.PI * i) / nodeCount;
    points.push({ x: centre.x + ringRadius * Math.cos(a), y: centre.y + ringRadius * Math.sin(a), z: centre.z, r: tubeRadius });
  }
  return points;
}

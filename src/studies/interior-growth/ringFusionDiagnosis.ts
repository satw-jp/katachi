// ---------------------------------------------------------------------------
// P23 diagnosis-only measurement module.
//
// WHY THIS FILE EXISTS
// A `ring-constrained` candidate grows a graph with `rootCount === 1` (verified
// by growth.test.ts §11-2's sibling assertions) yet the SAVED mesh comes out as
// several connected components under default conditions — measured 2026-07-25:
// box 10, sphere 3, waisted 5. The save gate correctly refuses those. This
// module measures WHERE along the save pipeline the single piece becomes
// several. It changes NO behavior: every function here is a pure measurement,
// nothing in the growth rules, the material field, the plate clip, the meshing
// resolution or the save gate is touched or re-implemented.
//
// SINGLE SOURCE OF TRUTH (AGENTS.md §1 "正直な計算")
// The plate half-space (`aboveBuildPlateSdf`), the sampling box
// (`computeUnitBounds`), the material element SDF (`elementSdf`), the material
// decomposition (`unitFieldElements`), the exact union (`unitsPointsSdf`), the
// indexed union (`createUnitsFieldSampler`), the mesher
// (`buildMeshFromField`), the canonical rescale (`rescaleMeshResult`), the face
// orientation (`orientMeshForSavedStl`) and the component count
// (`computeConnectedComponentsWithKey` / `inspectSavedStlTopology`) are all
// IMPORTED. None of them is duplicated here. The only new code is
// (a) union-find LABELLING (the shared helper returns a count, not a
// partition — the label count is cross-checked against the shared count on
// every call, see `measureComponents`), (b) a binary-STL byte READER for the
// Float32 round-trip stage, and (c) sampled capsule-pair measurements that are
// explicitly labelled as sampled bounds.
//
// EVERY NUMBER THIS MODULE RETURNS IS A MEASUREMENT, NEVER A VERDICT. It does
// not classify the cause; the report does that from these numbers.
// ---------------------------------------------------------------------------

import {
  buildMeshFromField,
  computeConnectedComponentsWithKey,
  encodeBinaryStl,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  rescaleMeshResult,
  type Bounds,
  type MeshBuildResult,
  type MeshVertex,
  type Triangle,
} from "../cloud-sculpt/meshExport.ts";
// The binary smooth-min operator itself. Imported, never re-derived: the P2.4
// order-dependence measurement below has to fold THIS operator in a different
// order, which is impossible through `unitsPointsSdf` (whose whole job is to fix
// the order). `measureFoldFidelity` proves the fold reproduces `unitsPointsSdf`
// bit-for-bit in the natural order before any permuted row is believed.
import { smoothMin } from "../cloud-sculpt/field.ts";
import { buildInsideTester } from "../../lib/geometry/pointInMesh.ts";
import { buildPlateOffset, vNorm, type GrowthUnit, type Vec3 } from "./field.ts";
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
  aboveBuildPlateSdf,
  buildCandidateMesh,
  computeUnitBounds,
  meshLowestBuildAxisMm,
  plateBoundaryEpsilonMm,
  type CandidateMeshResult,
  type SavedPlateReference,
} from "./meshExport.ts";

// --- the four field stages ---------------------------------------------------

/**
 * Which field is meshed. The two axes are orthogonal ON PURPOSE, so a
 * difference can only be attributed to one of them:
 *  - clip:  `pre` = the units' union alone; `post` = `Math.max(union,
 *           aboveBuildPlateSdf)`, exactly what `buildCandidateMesh` meshes.
 *  - union: `exact` = `unitsPointsSdf`; `indexed` = `createUnitsFieldSampler`.
 * Everything else (bounds, resolution, blendK, canonical scale) is held
 * identical across all four.
 */
export type FieldStage = "pre-clip-exact" | "pre-clip-indexed" | "post-clip-exact" | "post-clip-indexed";

export const FIELD_STAGES: readonly FieldStage[] = [
  "pre-clip-exact",
  "pre-clip-indexed",
  "post-clip-exact",
  "post-clip-indexed",
] as const;

export function stageIsPostClip(stage: FieldStage): boolean {
  return stage === "post-clip-exact" || stage === "post-clip-indexed";
}

export function stageIsIndexed(stage: FieldStage): boolean {
  return stage === "pre-clip-indexed" || stage === "post-clip-indexed";
}

/** The sampling box `buildCandidateMesh` would use for this result — imported, not re-derived. */
export function diagnosisBounds(result: GrowthResult, blendK: number): Bounds {
  const buildAxis = vNorm(result.envelope.buildAxis);
  return computeUnitBounds(result.units, result.hostId, blendK, buildAxis, buildPlateOffset(result.hostId, buildAxis));
}

/**
 * The scalar field for one stage, assembled ONLY from imported pieces.
 * `post-clip-*` is byte-for-byte the same composition `buildCandidateMesh`
 * uses (`Math.max(material, aboveBuildPlateSdf(...))`); `pre-clip-*` is that
 * same expression with the second term dropped and nothing else changed.
 */
export function stageField(result: GrowthResult, stage: FieldStage, blendK: number): (x: number, y: number, z: number) => number {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const indexed = createUnitsFieldSampler(result.units, blendK);
  const materialAt = stageIsIndexed(stage)
    ? indexed
    : (x: number, y: number, z: number): number => unitsPointsSdf(result.units, blendK, x, y, z);
  if (!stageIsPostClip(stage)) return materialAt;
  return (x: number, y: number, z: number): number =>
    Math.max(materialAt(x, y, z), aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset));
}

/**
 * Mesh one stage at the SAME bounds, SAME resolution and SAME canonical scale
 * the production save path uses, then rescale to that canonical scale so the
 * Float32 vertex keys every stage is counted with are identical.
 *
 * Deliberately NOT run through `orientMeshForSavedStl`: keeping it out is what
 * makes the `post-clip-indexed` row and the `saved-mesh` row differ by exactly
 * one step (face orientation + Float32-degenerate face removal), so that step
 * can be read off the table instead of guessed at.
 */
export function buildStageMesh(result: GrowthResult, stage: FieldStage, resolution: number, blendK: number): MeshBuildResult {
  const raw = buildMeshFromField(diagnosisBounds(result, blendK), stageField(result, stage, blendK), {
    resolution,
    targetLongestMm: 1,
  });
  return rescaleMeshResult(raw, result.canonicalScaleMmPerUnit);
}

// --- component labelling -----------------------------------------------------

/** The EXACT key `inspectSavedStlTopology` / `orientMeshForSavedStl` use: Float32-rounded millimetre coordinates. Kept in one place here so every stage is partitioned by the same identity the shared count uses. */
function savedVertexKey(v: MeshVertex, scaleMmPerUnit: number): string {
  return `${Math.fround(v.x * scaleMmPerUnit)},${Math.fround(v.y * scaleMmPerUnit)},${Math.fround(v.z * scaleMmPerUnit)}`;
}

/**
 * Per-component surface integrity, measured by the SHARED
 * `inspectSavedStlTopology` restricted to that component's own triangles (same
 * Float32-millimetre rounding, same edge bookkeeping the save gate uses).
 *
 * P2.3 correction 4: this is reported BEFORE any volume number is read, because
 * every volume statement below — the divergence-theorem proxy AND the ray-parity
 * inside/outside test the volumetric hard-overlap measurement depends on — is
 * only meaningful on a closed, consistently-wound surface. An open component's
 * numbers are still reported (never silently suppressed), but these flags are
 * what says whether they may be believed.
 */
export interface ComponentSurfaceIntegrity {
  openEdges: number;
  nonManifoldEdges: number;
  windingInconsistentEdges: number;
  degenerateTriangleCount: number;
  closed: boolean;
  windingConsistent: boolean;
  /**
   * Components WITHIN this component as `inspectSavedStlTopology` counts them.
   * Must be 1: this module's own labelling already partitioned by the identical
   * Float32 key, so anything else means the topology inspector's
   * degenerate-triangle exclusion split the piece further. Reported rather than
   * asserted, since a component made only of degenerate faces legitimately
   * yields 0.
   */
  selfComponentCount: number;
}

export interface ComponentStat {
  /** Rank by triangle count, 0 = largest. Stable: ties break on the component's smallest triangle index. */
  rank: number;
  triangleCount: number;
  /**
   * SIGNED volume proxy, mm³ — `signed tetrahedron sum / 6 × scale³` over this
   * component's own triangles (`computeSignedMeshVolume`'s formula applied to a
   * subset), WITHOUT `Math.abs`.
   *
   * P2.3 correction 4: the previous field kept only the absolute value, so the
   * sign the P2.3 Observation appealed to was never actually retained. Both are
   * stored now. Read `measureSignedVolumeConvention` (bottom of this file)
   * before using the sign as evidence of anything: on a mesh that has been
   * through `orientMeshForSavedStl` — i.e. every `buildCandidateMesh` output,
   * which is the saved mesh — the sign is FORCED positive per component and
   * carries no information at all.
   */
  signedVolumeProxyMm3: number;
  /** `Math.abs(signedVolumeProxyMm3)`. Exact only for a closed, consistently-wound component; a magnitude proxy otherwise, which is why it is named one. Not offered as this component's true volume. */
  absoluteVolumeProxyMm3: number;
  /** Build-axis extent in mm, measured RELATIVE TO THE PLATE PLANE (plate = 0, above = positive) — the same convention `meshLowestBuildAxisMm` reports. */
  axisMinMm: number;
  axisMaxMm: number;
  /** `axisMinMm <= plateBoundaryEpsilonMm(layerHeightMm)`: this component reaches the plate plane within mesh-discretisation tolerance. */
  touchesPlate: boolean;
  /** Axis-aligned bounding box in mm, in the mesh's OWN frame (Float32-rounded coordinates × scale, no plate offset, no sign flip) — the frame a component signature is matched in. */
  bboxMinMm: MeshVertex;
  bboxMaxMm: MeshVertex;
  surface: ComponentSurfaceIntegrity;
}

export interface ComponentReport {
  triangleCount: number;
  /** From the SHARED `computeConnectedComponentsWithKey`. This is the authoritative count. */
  componentCount: number;
  /** From this module's own labelling. Asserted equal to `componentCount` on every call — a labelling that disagreed with the shared count would make every per-component number below meaningless. */
  labelledComponentCount: number;
  components: ComponentStat[];
  plateTouchingComponentCount: number;
  /** Triangle count of the SECOND-largest component (0 when there is only one) — the headline "how much is being lost" number. */
  largestNonLargestTriangleCount: number;
  /** Per-triangle component label, index into `components` by rank. Same order as the input triangle array. */
  labelOf: number[];
}

/**
 * Partition a triangle soup into connected components (shared vertex identity
 * on Float32 millimetre coordinates) and measure each one.
 *
 * `plateReference` fixes which axis is the build axis and where the plate plane
 * sits; it comes from the production mesh (`buildCandidateMesh` attaches it) so
 * the diagnosis can never disagree with the save path about the axis.
 */
export function measureComponents(
  triangles: Triangle[],
  scaleMmPerUnit: number,
  plateReference: SavedPlateReference,
  layerHeightMm: number,
): ComponentReport {
  const keyOf = (v: MeshVertex) => savedVertexKey(v, scaleMmPerUnit);
  const componentCount = computeConnectedComponentsWithKey(triangles, keyOf);

  // Union-find over vertex keys, keeping the PARTITION (the shared helper
  // returns only its size).
  const idOf = new Map<string, number>();
  const parent: number[] = [];
  const idFor = (v: MeshVertex): number => {
    const key = keyOf(v);
    let id = idOf.get(key);
    if (id === undefined) {
      id = parent.length;
      parent.push(id);
      idOf.set(key, id);
    }
    return id;
  };
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
  const triVertexIds: Array<[number, number, number]> = [];
  for (const tri of triangles) {
    const a = idFor(tri.a);
    const b = idFor(tri.b);
    const c = idFor(tri.c);
    union(a, b);
    union(b, c);
    triVertexIds.push([a, b, c]);
  }

  // Group triangles by root, in first-appearance order (deterministic).
  const groupOfRoot = new Map<number, number>();
  const groups: number[][] = [];
  const rawLabel: number[] = new Array(triangles.length);
  for (let t = 0; t < triangles.length; t++) {
    const root = find(triVertexIds[t][0]);
    let g = groupOfRoot.get(root);
    if (g === undefined) {
      g = groups.length;
      groups.push([]);
      groupOfRoot.set(root, g);
    }
    groups[g].push(t);
    rawLabel[t] = g;
  }

  const axis = plateReference.axis;
  const sign = plateReference.sign;
  // Same expression `meshLowestBuildAxisMm` uses: `plateOffsetFieldUnits` is
  // already dot(platePoint, buildAxis), so `sign` is applied ONCE, to the
  // vertex coordinate — never twice.
  const plateAlongAxisMm = plateReference.plateOffsetFieldUnits * scaleMmPerUnit;
  const epsilon = plateBoundaryEpsilonMm(layerHeightMm);

  const raw = groups.map((tris, g) => {
    let signedSix = 0;
    let axisMin = Infinity;
    let axisMax = -Infinity;
    const bboxMin: MeshVertex = { x: Infinity, y: Infinity, z: Infinity };
    const bboxMax: MeshVertex = { x: -Infinity, y: -Infinity, z: -Infinity };
    const ownTriangles: Triangle[] = [];
    for (const t of tris) {
      const { a, b, c } = triangles[t];
      ownTriangles.push(triangles[t]);
      signedSix += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
      for (const v of [a, b, c]) {
        const coord = sign * Math.fround(v[axis] * scaleMmPerUnit) - plateAlongAxisMm;
        if (coord < axisMin) axisMin = coord;
        if (coord > axisMax) axisMax = coord;
        for (const k of ["x", "y", "z"] as const) {
          const mm = Math.fround(v[k] * scaleMmPerUnit);
          if (mm < bboxMin[k]) bboxMin[k] = mm;
          if (mm > bboxMax[k]) bboxMax[k] = mm;
        }
      }
    }
    // P2.3 correction 4: keep the SIGN. `Math.abs` alone hid both a globally
    // reversed component and a cavity wall behind a plausible positive number.
    const signedVolumeProxyMm3 = (signedSix / 6) * scaleMmPerUnit ** 3;
    const topology = inspectSavedStlTopology(ownTriangles, scaleMmPerUnit);
    return {
      g,
      triangleCount: tris.length,
      signedVolumeProxyMm3,
      absoluteVolumeProxyMm3: Math.abs(signedVolumeProxyMm3),
      axisMinMm: axisMin,
      axisMaxMm: axisMax,
      touchesPlate: axisMin <= epsilon,
      bboxMinMm: bboxMin,
      bboxMaxMm: bboxMax,
      surface: {
        openEdges: topology.openEdges,
        nonManifoldEdges: topology.nonManifoldEdges,
        windingInconsistentEdges: topology.windingInconsistentEdges,
        degenerateTriangleCount: topology.degenerateTriangleCount,
        closed: topology.closed,
        windingConsistent: topology.windingConsistent,
        selfComponentCount: topology.connectedComponents,
      } satisfies ComponentSurfaceIntegrity,
    };
  });

  // Rank by triangle count desc; deterministic tie-break on group index.
  raw.sort((p, q) => (q.triangleCount - p.triangleCount) || (p.g - q.g));
  const rankOfGroup = new Map<number, number>();
  raw.forEach((r, i) => rankOfGroup.set(r.g, i));
  const components: ComponentStat[] = raw.map((r, i) => ({
    rank: i,
    triangleCount: r.triangleCount,
    signedVolumeProxyMm3: r.signedVolumeProxyMm3,
    absoluteVolumeProxyMm3: r.absoluteVolumeProxyMm3,
    axisMinMm: r.axisMinMm,
    axisMaxMm: r.axisMaxMm,
    touchesPlate: r.touchesPlate,
    bboxMinMm: r.bboxMinMm,
    bboxMaxMm: r.bboxMaxMm,
    surface: r.surface,
  }));
  const labelOf = rawLabel.map((g) => rankOfGroup.get(g)!);

  // The per-component numbers below are only meaningful if this module's
  // partition IS the shared helper's partition. Fail loudly rather than report
  // stats against a partition nothing else agrees with.
  if (groups.length !== componentCount) {
    throw new Error(
      `ringFusionDiagnosis labelling disagrees with computeConnectedComponentsWithKey (${groups.length} vs ${componentCount}) — per-component measurements would be meaningless`,
    );
  }

  return {
    triangleCount: triangles.length,
    componentCount,
    labelledComponentCount: groups.length,
    components,
    plateTouchingComponentCount: components.filter((c) => c.touchesPlate).length,
    largestNonLargestTriangleCount: components.length > 1 ? components[1].triangleCount : 0,
    labelOf,
  };
}

// --- stage 1: the graph ------------------------------------------------------

export interface GraphStage {
  unitCount: number;
  /** `parentId === null` count. */
  rootUnitCount: number;
  /** As reported by growNetwork itself. */
  reportedRootCount: number;
  /** Connected components of the undirected parent-child graph. */
  graphComponentCount: number;
  /** Units that reach a parentless unit by walking `parentId`. */
  unitsReachingARoot: number;
  parentChildEdgeCount: number;
}

export function measureGraphStage(result: GrowthResult): GraphStage {
  const units = result.units;
  const index = new Map<number, number>();
  units.forEach((u, i) => index.set(u.id, i));
  const parent: number[] = units.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  let edges = 0;
  for (let i = 0; i < units.length; i++) {
    const pid = units[i].parentId;
    if (pid === null) continue;
    const j = index.get(pid);
    if (j === undefined) continue;
    edges++;
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  }
  const roots = new Set<number>();
  for (let i = 0; i < units.length; i++) roots.add(find(i));

  const byId = new Map(units.map((u) => [u.id, u]));
  let reaching = 0;
  for (const u of units) {
    let cur: GrowthUnit | undefined = u;
    for (let hops = 0; cur && hops <= units.length; hops++) {
      if (cur.parentId === null) {
        reaching++;
        break;
      }
      cur = byId.get(cur.parentId);
    }
  }
  return {
    unitCount: units.length,
    rootUnitCount: units.filter((u) => u.parentId === null).length,
    reportedRootCount: result.rootCount,
    graphComponentCount: units.length === 0 ? 0 : roots.size,
    unitsReachingARoot: reaching,
    parentChildEdgeCount: edges,
  };
}

// --- stage 7: the Float32 STL round trip ------------------------------------

/**
 * Read back the triangles a binary STL's BYTES actually contain (little-endian,
 * 80-byte header, uint32 count, 50 bytes per facet). A reader, not a second
 * encoder — `encodeBinaryStl` remains the only writer.
 *
 * The returned vertices are already in millimetres and already Float32, so the
 * caller counts them at `scaleMmPerUnit = 1`.
 */
export function decodeBinaryStlTriangles(buffer: ArrayBuffer): Triangle[] {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const out: Triangle[] = [];
  let offset = 84;
  for (let i = 0; i < count; i++) {
    offset += 12; // normal
    const v: MeshVertex[] = [];
    for (let k = 0; k < 3; k++) {
      v.push({ x: view.getFloat32(offset, true), y: view.getFloat32(offset + 4, true), z: view.getFloat32(offset + 8, true) });
      offset += 12;
    }
    offset += 2; // attribute byte count
    out.push({ a: v[0], b: v[1], c: v[2] });
  }
  return out;
}

// --- component <-> unit mapping ---------------------------------------------

interface OwnedElement {
  unitId: number;
  element: FieldElement;
}

/** Nearest-unit lookup over the units' OWN material elements (the imported `unitFieldElements` decomposition and the imported `elementSdf`) — never node spheres, never a re-derived tube. */
export function createNearestUnitLookup(units: GrowthUnit[]): (x: number, y: number, z: number) => { unitId: number; sdf: number } | null {
  const owned: OwnedElement[] = [];
  let maxBound = 0;
  for (const u of units) {
    for (const element of unitFieldElements(u)) {
      owned.push({ unitId: u.id, element });
      if (element.bound > maxBound) maxBound = element.bound;
    }
  }
  if (owned.length === 0) return () => null;
  const cell = Math.max(1e-6, maxBound * 4);
  const hash = new SpatialHash<OwnedElement>(cell);
  for (const o of owned) hash.insert({ x: o.element.cx, y: o.element.cy, z: o.element.cz }, o);
  const pick = (cands: OwnedElement[], x: number, y: number, z: number) => {
    let best: { unitId: number; sdf: number } | null = null;
    for (const o of cands) {
      const d = elementSdf(o.element, x, y, z);
      // Deterministic tie-break on the lower unit id.
      if (best === null || d < best.sdf || (d === best.sdf && o.unitId < best.unitId)) best = { unitId: o.unitId, sdf: d };
    }
    return best;
  };
  return (x: number, y: number, z: number) => {
    for (const radius of [cell, cell * 2, cell * 4]) {
      const near = hash.queryRadius({ x, y, z }, radius);
      if (near.length > 0) return pick(near, x, y, z);
    }
    return pick(owned, x, y, z); // exhaustive fallback — never returns "unknown" silently
  };
}

export interface UnitComponentMap {
  /** unitId -> the component rank holding MOST of that unit's assigned triangles (argmax, ties to the lower rank). Absent for a unit no triangle was assigned to. */
  dominantComponentOf: Map<number, number>;
  /** unitId -> triangles assigned to it per component rank. */
  trianglesOf: Map<number, Map<number, number>>;
  unassignedUnitCount: number;
}

/**
 * Assign every triangle to the unit whose own material it lies closest to
 * (triangle centroid, nearest element SDF), then tally components per unit.
 *
 * LIMIT, stated because it matters for reading D-2: a triangle near a
 * parent/child overlap is genuinely ambiguous — either unit's material is
 * within blendK of it — so an individual assignment there is arbitrary. What
 * this map is used for is the MAJORITY component of each unit, which is not
 * sensitive to those few boundary triangles.
 */
export function mapUnitsToComponents(units: GrowthUnit[], triangles: Triangle[], report: ComponentReport): UnitComponentMap {
  const nearest = createNearestUnitLookup(units);
  const trianglesOf = new Map<number, Map<number, number>>();
  for (let t = 0; t < triangles.length; t++) {
    const { a, b, c } = triangles[t];
    const hit = nearest((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
    if (!hit) continue;
    let per = trianglesOf.get(hit.unitId);
    if (!per) {
      per = new Map();
      trianglesOf.set(hit.unitId, per);
    }
    per.set(report.labelOf[t], (per.get(report.labelOf[t]) ?? 0) + 1);
  }
  const dominantComponentOf = new Map<number, number>();
  for (const [unitId, per] of trianglesOf) {
    let bestRank = -1;
    let bestCount = -1;
    for (const [rank, count] of [...per.entries()].sort((p, q) => p[0] - q[0])) {
      if (count > bestCount) {
        bestCount = count;
        bestRank = rank;
      }
    }
    if (bestRank >= 0) dominantComponentOf.set(unitId, bestRank);
  }
  return {
    dominantComponentOf,
    trianglesOf,
    unassignedUnitCount: units.filter((u) => !dominantComponentOf.has(u.id)).length,
  };
}

// --- D-2: parent/child capsule-pair measurement -----------------------------

export interface CapsuleGapMeasurement {
  /**
   * SAMPLED UPPER BOUND on the minimum signed gap between the two units'
   * material, in field units (negative = overlapping). NOT an exact
   * tapered-capsule distance: both segments are sampled at `samplesPerSegment`
   * evenly-spaced parameters and the interpolated radii subtracted, so the true
   * minimum is <= this value. `samplingErrorBoundFieldUnits` states by how much.
   */
  sampledMinSignedGapFieldUnits: number;
  samplesPerSegment: number;
  /**
   * Half the longest sampling step over the two elements that produced the
   * minimum — the amount by which the true minimum can sit below the sampled
   * one. Reported so the sampled number is never read as exact.
   */
  samplingErrorBoundFieldUnits: number;
  /** Same number in mm at the candidate's canonical scale, for reading against layer height. */
  sampledMinSignedGapMm: number;
  /**
   * Neck-width proxy at the minimum-gap sample pair: the radius of the circle
   * where two SPHERES of the interpolated radii, at the two sample centres,
   * intersect. A two-sphere lens proxy for the local neck — NOT the true
   * capsule-capsule intersection curve.
   *
   * **`null`, never 0, when no intersection circle exists.** Two distinct cases
   * produce no circle and they are opposites, so they must not share a value:
   * the spheres are apart (`neckState: "separated"`), or one sphere lies
   * entirely inside the other (`neckState: "contained"` — the material is
   * fully merged there, the most connected case possible). An earlier version
   * returned 0 for both, which made deep containment read as a zero-width neck.
   */
  neckRadiusProxyFieldUnits: number | null;
  neckRadiusProxyMm: number | null;
  /** Which of the three cases the minimum-gap sample pair is in. `"lens"` is the only one with a finite neck radius. */
  neckState: "separated" | "lens" | "contained";
  /** Build-axis extent (mm, plate-relative) of the SAMPLED overlap region: the midpoints of every sample pair whose signed gap is negative. null when no sample pair overlaps. */
  overlapAxisMinMm: number | null;
  overlapAxisMaxMm: number | null;
  /** How many sampled midpoints of the overlap region lie ABOVE the plate (`aboveBuildPlateSdf <= 0`), and how many below. */
  overlapSamplesAbovePlate: number;
  overlapSamplesBelowPlate: number;
  /** True when at least one overlapping sample pair's midpoint is above the plate — i.e. the overlap is not purely a below-the-plate artefact. */
  overlapSurvivesAbovePlate: boolean;
  /**
   * P2.4 §3 addition (purely additive — every field above is computed exactly as
   * before): WHERE the minimum was found. `closestElementIndexA/B` index each
   * unit's OWN `unitFieldElements` list, `closestSampleIndexA/B` are the sample
   * indices along those two elements, and the two points are the sampled centres
   * (NOT surface points) whose interpolated radii produced
   * `sampledMinSignedGapFieldUnits`. `null` only for an empty element list.
   */
  closestElementIndexA: number | null;
  closestElementIndexB: number | null;
  closestSampleIndexA: number | null;
  closestSampleIndexB: number | null;
  closestPointA: Vec3 | null;
  closestPointB: Vec3 | null;
  /** The interpolated tube radii at those two points, field units. */
  closestRadiusA: number | null;
  closestRadiusB: number | null;
  /** Centre-to-centre distance at the minimum, field units (`gap = this - rA - rB`). */
  closestCentreDistanceFieldUnits: number | null;
}

function pointAt(e: FieldElement, t: number): { x: number; y: number; z: number; r: number } {
  const a = e.a;
  if (e.b === null) return { x: a.x, y: a.y, z: a.z, r: a.r };
  const b = e.b;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, r: a.r + (b.r - a.r) * t };
}

function elementLength(e: FieldElement): number {
  if (e.b === null) return 0;
  return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z);
}

/**
 * Minimum signed gap between two units' REAL material (the imported
 * `unitFieldElements` decomposition: tapered capsules for a ring), by dense
 * sampling along both segments. See `CapsuleGapMeasurement` for the exactness
 * caveats — this function never claims an exact distance.
 */
export function measureCapsulePairGap(
  a: GrowthUnit,
  b: GrowthUnit,
  samplesPerSegment: number,
  buildAxis: Vec3,
  plateOffset: number,
  scaleMmPerUnit: number,
): CapsuleGapMeasurement {
  const ea = unitFieldElements(a);
  const eb = unitFieldElements(b);
  const n = Math.max(2, Math.round(samplesPerSegment));
  let best = Infinity;
  let bestErr = 0;
  let bestNeck: number | null = null;
  let bestNeckState: "separated" | "lens" | "contained" = "separated";
  let overlapAxisMin = Infinity;
  let overlapAxisMax = -Infinity;
  let above = 0;
  let below = 0;
  const axisKey = Math.abs(buildAxis.x) >= Math.abs(buildAxis.y) && Math.abs(buildAxis.x) >= Math.abs(buildAxis.z)
    ? "x"
    : Math.abs(buildAxis.y) >= Math.abs(buildAxis.z) ? "y" : "z";
  const axisSign: 1 | -1 = (buildAxis as unknown as Record<string, number>)[axisKey] < 0 ? -1 : 1;
  const plateAlongAxisMm = plateOffset * scaleMmPerUnit;
  // P2.4 §3: where the minimum lives. Written only inside the SAME `gap < best`
  // branch that already updates `best`, so no existing number changes.
  let bestEi: number | null = null;
  let bestEj: number | null = null;
  let bestSi: number | null = null;
  let bestSj: number | null = null;
  let bestPa: { x: number; y: number; z: number; r: number } | null = null;
  let bestQb: { x: number; y: number; z: number; r: number } | null = null;
  let bestL: number | null = null;

  for (let ei = 0; ei < ea.length; ei++) {
    const p = ea[ei];
    for (let ej = 0; ej < eb.length; ej++) {
      const q = eb[ej];
      const stepP = elementLength(p) / (n - 1);
      const stepQ = elementLength(q) / (n - 1);
      const err = Math.max(stepP, stepQ) / 2;
      for (let i = 0; i < n; i++) {
        const pa = pointAt(p, i / (n - 1));
        for (let j = 0; j < n; j++) {
          const qb = pointAt(q, j / (n - 1));
          const L = Math.hypot(pa.x - qb.x, pa.y - qb.y, pa.z - qb.z);
          const gap = L - pa.r - qb.r;
          if (gap < best) {
            best = gap;
            bestErr = err;
            bestEi = ei;
            bestEj = ej;
            bestSi = i;
            bestSj = j;
            bestPa = pa;
            bestQb = qb;
            bestL = L;
            // Two-sphere lens radius at this sample pair. `h2 <= 0` while the
            // spheres overlap means one CONTAINS the other — fully merged
            // material, not a thin neck — so it is reported as such, not as 0.
            if (gap >= 0) {
              bestNeck = null;
              bestNeckState = "separated";
            } else if (L <= 1e-12 || L + Math.min(pa.r, qb.r) <= Math.max(pa.r, qb.r)) {
              bestNeck = null;
              bestNeckState = "contained";
            } else {
              const d1 = (L * L + pa.r * pa.r - qb.r * qb.r) / (2 * L);
              const h2 = pa.r * pa.r - d1 * d1;
              if (h2 > 0) {
                bestNeck = Math.sqrt(h2);
                bestNeckState = "lens";
              } else {
                bestNeck = null;
                bestNeckState = "contained";
              }
            }
          }
          if (gap < 0) {
            const mx = (pa.x + qb.x) / 2;
            const my = (pa.y + qb.y) / 2;
            const mz = (pa.z + qb.z) / 2;
            const m = { x: mx, y: my, z: mz } as unknown as Record<string, number>;
            const coordMm = axisSign * (m[axisKey] * scaleMmPerUnit) - plateAlongAxisMm;
            if (coordMm < overlapAxisMin) overlapAxisMin = coordMm;
            if (coordMm > overlapAxisMax) overlapAxisMax = coordMm;
            if (aboveBuildPlateSdf(mx, my, mz, buildAxis, plateOffset) <= 0) above++;
            else below++;
          }
        }
      }
    }
  }
  return {
    sampledMinSignedGapFieldUnits: best,
    samplesPerSegment: n,
    samplingErrorBoundFieldUnits: bestErr,
    sampledMinSignedGapMm: best * scaleMmPerUnit,
    neckRadiusProxyFieldUnits: bestNeck,
    neckRadiusProxyMm: bestNeck === null ? null : bestNeck * scaleMmPerUnit,
    neckState: bestNeckState,
    overlapAxisMinMm: Number.isFinite(overlapAxisMin) ? overlapAxisMin : null,
    overlapAxisMaxMm: Number.isFinite(overlapAxisMax) ? overlapAxisMax : null,
    overlapSamplesAbovePlate: above,
    overlapSamplesBelowPlate: below,
    overlapSurvivesAbovePlate: above > 0,
    closestElementIndexA: bestEi,
    closestElementIndexB: bestEj,
    closestSampleIndexA: bestSi,
    closestSampleIndexB: bestSj,
    closestPointA: bestPa === null ? null : { x: bestPa.x, y: bestPa.y, z: bestPa.z },
    closestPointB: bestQb === null ? null : { x: bestQb.x, y: bestQb.y, z: bestQb.z },
    closestRadiusA: bestPa === null ? null : bestPa.r,
    closestRadiusB: bestQb === null ? null : bestQb.r,
    closestCentreDistanceFieldUnits: bestL,
  };
}

/** Centroid of a unit's node points (unweighted) — a locator for the report, not a mass centre. */
export function unitPointCentroid(unit: GrowthUnit): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of unit.points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = Math.max(1, unit.points.length);
  return { x: x / n, y: y / n, z: z / n };
}

/**
 * Best-fit plane normal of a ring's node points, by the smallest-eigenvalue
 * direction of the covariance matrix, found by inverse power iteration on a
 * fixed number of steps from fixed start vectors (deterministic, no RNG).
 * Returns null for fewer than 3 points. An APPROXIMATION of the ring plane —
 * good to a few degrees for a planar 8-node ring, not an exact fit.
 */
export function ringPlaneNormal(unit: GrowthUnit): Vec3 | null {
  const pts = unit.points;
  if (pts.length < 3) return null;
  const c = unitPointCentroid(unit);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) {
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  // Smallest-eigenvalue direction = the one MOST shrunk by repeated application
  // of (traceI - M). Power-iterate that from three fixed seeds and keep the
  // direction with the smallest quadratic form.
  const tr = xx + yy + zz;
  const apply = (v: Vec3): Vec3 => ({
    x: tr * v.x - (xx * v.x + xy * v.y + xz * v.z),
    y: tr * v.y - (xy * v.x + yy * v.y + yz * v.z),
    z: tr * v.z - (xz * v.x + yz * v.y + zz * v.z),
  });
  const quad = (v: Vec3): number =>
    v.x * (xx * v.x + xy * v.y + xz * v.z) + v.y * (xy * v.x + yy * v.y + yz * v.z) + v.z * (xz * v.x + yz * v.y + zz * v.z);
  let bestV: Vec3 | null = null;
  let bestQ = Infinity;
  for (const seed of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
    let v = seed as Vec3;
    for (let i = 0; i < 60; i++) {
      const w = apply(v);
      const len = Math.hypot(w.x, w.y, w.z);
      if (!(len > 1e-15)) break;
      v = { x: w.x / len, y: w.y / len, z: w.z / len };
    }
    const q = quad(v);
    if (q < bestQ) {
      bestQ = q;
      bestV = v;
    }
  }
  if (!bestV) return null;
  // Fix the sign deterministically (largest |component| positive).
  const ax = Math.abs(bestV.x), ay = Math.abs(bestV.y), az = Math.abs(bestV.z);
  const dominant = ax >= ay && ax >= az ? bestV.x : ay >= az ? bestV.y : bestV.z;
  return dominant < 0 ? { x: -bestV.x, y: -bestV.y, z: -bestV.z } : bestV;
}

/** Angle in degrees between two ring planes' normals, folded into [0, 90]. null when either is not a ring of >=3 nodes. */
export function ringPlaneAngleDeg(a: GrowthUnit, b: GrowthUnit): number | null {
  const na = ringPlaneNormal(a);
  const nb = ringPlaneNormal(b);
  if (!na || !nb) return null;
  const dot = Math.abs(na.x * nb.x + na.y * nb.y + na.z * nb.z);
  return (Math.acos(Math.min(1, Math.max(0, dot))) * 180) / Math.PI;
}

/** Node phase: the angle (degrees, [0,360)) of a unit's FIRST node about its own centroid, measured in the ring plane using a deterministic in-plane basis. A relative-orientation locator for the report, not a growth-rule quantity. */
export function ringNodePhaseDeg(unit: GrowthUnit): number | null {
  const n = ringPlaneNormal(unit);
  if (!n || unit.points.length < 3) return null;
  const c = unitPointCentroid(unit);
  // Deterministic in-plane basis: cross the normal with whichever cardinal axis it is least aligned to.
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const helper = ax <= ay && ax <= az ? { x: 1, y: 0, z: 0 } : ay <= az ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const ux = n.y * helper.z - n.z * helper.y;
  const uy = n.z * helper.x - n.x * helper.z;
  const uz = n.x * helper.y - n.y * helper.x;
  const ul = Math.hypot(ux, uy, uz);
  if (!(ul > 1e-12)) return null;
  const u = { x: ux / ul, y: uy / ul, z: uz / ul };
  const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
  const p = unit.points[0];
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
  const deg = (Math.atan2(dx * v.x + dy * v.y + dz * v.z, dx * u.x + dy * u.y + dz * u.z) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export interface BrokenEdge {
  childId: number;
  parentId: number;
  childComponentRank: number;
  parentComponentRank: number;
  gap: CapsuleGapMeasurement;
  childCentroid: Vec3;
  parentCentroid: Vec3;
  childRingNormal: Vec3 | null;
  parentRingNormal: Vec3 | null;
  ringPlaneAngleDeg: number | null;
  childPhaseDeg: number | null;
  parentPhaseDeg: number | null;
  childIsGraphRoot: boolean;
  parentIsGraphRoot: boolean;
  /** Whether either unit's own component reaches the plate plane (from the mesh components, not from a growth-rule flag). */
  childComponentTouchesPlate: boolean;
  parentComponentTouchesPlate: boolean;
}

/** Every parent-child edge whose two units end up in DIFFERENT mesh components, with the D-2 measurements for each. */
export function findBrokenEdges(
  result: GrowthResult,
  report: ComponentReport,
  map: UnitComponentMap,
  samplesPerSegment: number,
): BrokenEdge[] {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const byId = new Map(result.units.map((u) => [u.id, u]));
  const out: BrokenEdge[] = [];
  for (const child of result.units) {
    if (child.parentId === null) continue;
    const parent = byId.get(child.parentId);
    if (!parent) continue;
    const cc = map.dominantComponentOf.get(child.id);
    const pc = map.dominantComponentOf.get(parent.id);
    if (cc === undefined || pc === undefined || cc === pc) continue;
    out.push({
      childId: child.id,
      parentId: parent.id,
      childComponentRank: cc,
      parentComponentRank: pc,
      gap: measureCapsulePairGap(parent, child, samplesPerSegment, buildAxis, plateOffset, result.canonicalScaleMmPerUnit),
      childCentroid: unitPointCentroid(child),
      parentCentroid: unitPointCentroid(parent),
      childRingNormal: ringPlaneNormal(child),
      parentRingNormal: ringPlaneNormal(parent),
      ringPlaneAngleDeg: ringPlaneAngleDeg(parent, child),
      childPhaseDeg: ringNodePhaseDeg(child),
      parentPhaseDeg: ringNodePhaseDeg(parent),
      childIsGraphRoot: child.parentId === null,
      parentIsGraphRoot: parent.parentId === null,
      childComponentTouchesPlate: report.components[cc]?.touchesPlate ?? false,
      parentComponentTouchesPlate: report.components[pc]?.touchesPlate ?? false,
    });
  }
  return out.sort((a, b) => a.childId - b.childId);
}

// --- D-3: the ring alone vs. the junction -----------------------------------

export interface SubsetComponentCounts {
  preClipComponentCount: number;
  postClipComponentCount: number;
  preClipTriangleCount: number;
  postClipTriangleCount: number;
  /** Post-clip only: how many of the components reach the plate plane. */
  postClipPlateTouchingComponentCount: number;
  preClipAxisMinMm: number | null;
  postClipAxisMinMm: number | null;
  /**
   * P2.3 correction 5 — the numbers that say what step this row was actually
   * measured at, so a subset count can never be read as a full-candidate count
   * by accident. `requestedResolution` is what the caller asked for;
   * `effectiveResolution` is what `buildMeshFromField` used after its own
   * `Math.max(8, Math.round(...))` clamp; `stepFieldUnits` is
   * `subsetBoundsLongest / effectiveResolution`, i.e. the ABSOLUTE sampling step
   * — the only quantity comparable across differently-sized boxes.
   */
  requestedResolution: number;
  effectiveResolution: number;
  subsetBoundsLongestFieldUnits: number;
  stepFieldUnits: number;
  stepMm: number;
}

/** `buildMeshFromField`'s own resolution clamp, restated here so the diagnosis can report the resolution that was ACTUALLY used rather than the one it asked for. Kept in sync by `P2.3-E2`, which asserts the derived step against a real mesh. */
function effectiveMeshResolution(resolution: number): number {
  return Math.max(8, Math.round(resolution));
}

/**
 * Mesh a SUBSET of a candidate's units on their own, pre-clip and post-clip,
 * and count components. The subset gets its OWN sampling box (`computeUnitBounds`
 * over just those units) so a small subset is not meshed at the whole
 * candidate's coarse step — `resolution` therefore means "resolution of this
 * subset's own box", which is a FINER absolute step than the full-candidate
 * mesh. Stated because it means a subset count is not directly comparable to a
 * full-candidate count; it answers "can this piece hold together at all",
 * not "does it hold together at production step size".
 *
 * P2.3 correction 5: that caveat is now a MEASUREMENT, not just a sentence —
 * every row carries the absolute step it was taken at (see
 * `SubsetComponentCounts`), and `compareSubsetSteps` below runs the same subset
 * at both the fine resolution and the resolution that reproduces the full
 * candidate's absolute step, returning both rows so they cannot be conflated.
 */
export function measureSubsetComponents(
  result: GrowthResult,
  units: GrowthUnit[],
  resolution: number,
  blendK: number,
  layerHeightMm: number,
  /**
   * P2.4 §3 addition. The blend the FIELD is evaluated at, when it must differ
   * from the blend the BOUNDS are computed at. Defaults to `blendK`, so every
   * existing caller is byte-for-byte unchanged.
   *
   * Why it exists: `computeUnitBounds`'s margin is `max(0.2, blendK * 1.5)`, so
   * asking for the HARD union by passing `blendK = 1e-9` would also shrink the
   * box and therefore change the absolute sampling step — turning a
   * "does the hard union fuse at the production step" question into a
   * "does it fuse at a different step" one. Separating the two keeps the step
   * identical between the smooth and hard passes, which is the only way the two
   * counts are comparable.
   */
  fieldBlendK: number = blendK,
): SubsetComponentCounts {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const bounds = computeUnitBounds(units, result.hostId, blendK, buildAxis, plateOffset);
  const material = createUnitsFieldSampler(units, fieldBlendK);
  const plateReference: SavedPlateReference = {
    axis: Math.abs(buildAxis.x) >= Math.abs(buildAxis.y) && Math.abs(buildAxis.x) >= Math.abs(buildAxis.z)
      ? "x"
      : Math.abs(buildAxis.y) >= Math.abs(buildAxis.z) ? "y" : "z",
    sign: 1,
    plateOffsetFieldUnits: plateOffset,
  };
  if ((buildAxis as unknown as Record<string, number>)[plateReference.axis] < 0) plateReference.sign = -1;

  const mesh = (clip: boolean): MeshBuildResult => {
    const field = clip
      ? (x: number, y: number, z: number) => Math.max(material(x, y, z), aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset))
      : material;
    return rescaleMeshResult(buildMeshFromField(bounds, field, { resolution, targetLongestMm: 1 }), result.canonicalScaleMmPerUnit);
  };
  const pre = mesh(false);
  const post = mesh(true);
  const preReport = measureComponents(pre.triangles, pre.scaleMmPerUnit, plateReference, layerHeightMm);
  const postReport = measureComponents(post.triangles, post.scaleMmPerUnit, plateReference, layerHeightMm);
  const effectiveResolution = effectiveMeshResolution(resolution);
  const stepFieldUnits = bounds.longest / effectiveResolution;
  return {
    preClipComponentCount: preReport.componentCount,
    postClipComponentCount: postReport.componentCount,
    preClipTriangleCount: preReport.triangleCount,
    postClipTriangleCount: postReport.triangleCount,
    postClipPlateTouchingComponentCount: postReport.plateTouchingComponentCount,
    preClipAxisMinMm: preReport.components[0]?.axisMinMm ?? null,
    postClipAxisMinMm: postReport.components[0]?.axisMinMm ?? null,
    requestedResolution: resolution,
    effectiveResolution,
    subsetBoundsLongestFieldUnits: bounds.longest,
    stepFieldUnits,
    stepMm: stepFieldUnits * result.canonicalScaleMmPerUnit,
  };
}

// --- E (correction 5): fine subset vs production-equivalent step -------------

export interface SubsetStepRow {
  /**
   * `fine-subset` = the subset meshed at the caller's chosen resolution over its
   * own small box (a finer absolute step than production).
   * `production-equivalent-step` = the same subset meshed at whatever resolution
   * reproduces the FULL candidate's absolute step over the subset's box.
   */
  label: "fine-subset" | "production-equivalent-step";
  counts: SubsetComponentCounts;
  /** `stepFieldUnits / fullCandidateStepFieldUnits`. 1 means this row really is at the production step; < 1 means finer. */
  stepRatioToFullCandidate: number;
}

export interface SubsetStepComparison {
  fullResolution: number;
  fullBoundsLongestFieldUnits: number;
  fullStepFieldUnits: number;
  fullStepMm: number;
  rows: SubsetStepRow[];
  /**
   * True when `buildMeshFromField`'s `Math.max(8, …)` floor forced the
   * production-equivalent row to a FINER step than asked for — which happens for
   * any subset whose own box is less than 8 production steps across. When this
   * is true the second row is NOT at the production step and must not be read as
   * such; `stepRatioToFullCandidate` says by how much it missed.
   */
  productionEquivalentClamped: boolean;
}

/**
 * P2.3 correction 5. "Each parent-child pair is 1 component in a subset" does
 * NOT prove the production mesher resolves that neck, because the subset was
 * sampled on its own small box at the same RESOLUTION — i.e. a much finer
 * absolute step. This runs the subset twice and returns both rows, never one.
 *
 * The production-equivalent resolution is derived, not guessed:
 * `buildMeshFromField` uses `step = bounds.longest / resolution`, so the
 * resolution that gives the subset's box the full candidate's step is
 * `round(subsetLongest × fullResolution / fullLongest)`. The clamp inside
 * `buildMeshFromField` can still raise it; `productionEquivalentClamped` says
 * when it did.
 */
export function compareSubsetSteps(
  result: GrowthResult,
  units: GrowthUnit[],
  fineResolution: number,
  fullResolution: number,
  blendK: number,
  layerHeightMm: number,
): SubsetStepComparison {
  const derived = productionEquivalentSubsetResolution(result, units, blendK, fullResolution);
  const { fullStepFieldUnits, equivalentResolution } = derived;

  const fine = measureSubsetComponents(result, units, fineResolution, blendK, layerHeightMm);
  const equivalent = measureSubsetComponents(result, units, equivalentResolution, blendK, layerHeightMm);
  return {
    fullResolution,
    fullBoundsLongestFieldUnits: derived.fullBoundsLongestFieldUnits,
    fullStepFieldUnits,
    fullStepMm: fullStepFieldUnits * result.canonicalScaleMmPerUnit,
    rows: [
      { label: "fine-subset", counts: fine, stepRatioToFullCandidate: fine.stepFieldUnits / fullStepFieldUnits },
      {
        label: "production-equivalent-step",
        counts: equivalent,
        stepRatioToFullCandidate: equivalent.stepFieldUnits / fullStepFieldUnits,
      },
    ],
    // The only thing that can push the derived resolution off the production
    // step is `buildMeshFromField`'s `Math.max(8, …)` floor.
    productionEquivalentClamped: derived.clamped,
  };
}

export interface ProductionEquivalentSubsetResolution {
  fullBoundsLongestFieldUnits: number;
  subsetBoundsLongestFieldUnits: number;
  /** `fullBounds.longest / effectiveMeshResolution(fullResolution)` — the ABSOLUTE step the full candidate is meshed at. */
  fullStepFieldUnits: number;
  /** The resolution that gives the SUBSET's own box that same absolute step. */
  equivalentResolution: number;
  /** `buildMeshFromField`'s `Math.max(8, …)` floor will raise it — this row is then FINER than production, never coarser. */
  clamped: boolean;
}

/**
 * P2.4 §3 extraction. The derivation `compareSubsetSteps` has always used,
 * pulled out so the all-edge pass (which cannot afford the fine row — it would
 * mesh a 48³ box per edge, ~350 times per host) reaches the production-equivalent
 * resolution through the SAME arithmetic instead of a second copy of it.
 * `compareSubsetSteps` now calls this, so there is exactly one definition.
 */
export function productionEquivalentSubsetResolution(
  result: GrowthResult,
  units: GrowthUnit[],
  blendK: number,
  fullResolution: number,
): ProductionEquivalentSubsetResolution {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const fullBounds = computeUnitBounds(result.units, result.hostId, blendK, buildAxis, plateOffset);
  const subsetBounds = computeUnitBounds(units, result.hostId, blendK, buildAxis, plateOffset);
  const fullStepFieldUnits = fullBounds.longest / effectiveMeshResolution(fullResolution);
  const equivalentResolution = Math.round(subsetBounds.longest / fullStepFieldUnits);
  return {
    fullBoundsLongestFieldUnits: fullBounds.longest,
    subsetBoundsLongestFieldUnits: subsetBounds.longest,
    fullStepFieldUnits,
    equivalentResolution,
    clamped: equivalentResolution < 8,
  };
}

// --- the whole D-1 table ----------------------------------------------------

export interface StageRow {
  stage: FieldStage | "saved-mesh" | "stl-round-trip";
  report: ComponentReport;
}

export interface HostDiagnosis {
  hostId: GrowthResult["hostId"];
  variant: GrowthResult["variant"];
  unitCount: number;
  resolution: number;
  blendK: number;
  canonicalScaleMmPerUnit: number;
  plateReference: SavedPlateReference;
  plateBoundaryEpsilonMm: number;
  graph: GraphStage;
  rows: StageRow[];
  /** The `saved-mesh` row's own report, for convenience (same object as in `rows`). */
  savedMesh: ComponentReport;
  /** Component counts keyed by stage, so a table can be printed without re-walking `rows`. */
  componentCountByStage: Record<string, number>;
  /** True when the exact and indexed forms disagree on component count at the SAME clip stage — the hard-stop condition for cause D. */
  exactIndexedDisagree: boolean;
  brokenEdges: BrokenEdge[];
  unitToComponent: UnitComponentMap;
}

export interface DiagnosisOptions {
  /** Mesh resolution. Production save path uses 64 (growth.test.ts §11-11 idiom). */
  resolution: number;
  /** Smooth-min blend. Production save path uses `params.unitRadius * 0.3`. */
  blendK: number;
  /** Samples per capsule segment for the D-2 gap measurement. */
  gapSamplesPerSegment: number;
  /** Skip the two EXACT (`unitsPointsSdf`) stages. They cost ~25-30s each at resolution 64 with ~300 ring units; a fast run for the determinism/assertion tests can leave them out — the flag is recorded on the result so a partial table is never read as a full one. */
  includeExactStages: boolean;
}

export const DEFAULT_DIAGNOSIS_OPTIONS: Omit<DiagnosisOptions, "blendK"> = {
  resolution: 64,
  gapSamplesPerSegment: 33,
  includeExactStages: true,
};

/**
 * The full D-1 stage table for ONE already-grown candidate, plus the D-2 broken
 * edge list. Deterministic: no RNG anywhere in this module, so the same
 * `GrowthResult` and the same options always produce identical numbers.
 */
export function diagnoseCandidate(result: GrowthResult, options: DiagnosisOptions): HostDiagnosis {
  const { resolution, blendK, gapSamplesPerSegment, includeExactStages } = options;
  const layerHeightMm = result.envelope.layerHeightMm;

  // The production mesh first — its `plateReference` is the authority on axis
  // and plate position for every other row (never re-derived here).
  const saved: CandidateMeshResult = buildCandidateMesh(result, resolution, blendK);
  const plateReference = saved.plateReference;
  if (!plateReference) throw new Error("buildCandidateMesh returned no plateReference — the diagnosis will not guess the build axis");

  const rows: StageRow[] = [];
  for (const stage of FIELD_STAGES) {
    if (!includeExactStages && !stageIsIndexed(stage)) continue;
    const mesh = buildStageMesh(result, stage, resolution, blendK);
    rows.push({ stage, report: measureComponents(mesh.triangles, mesh.scaleMmPerUnit, plateReference, layerHeightMm) });
  }

  const savedReport = measureComponents(saved.triangles, saved.scaleMmPerUnit, plateReference, layerHeightMm);
  rows.push({ stage: "saved-mesh", report: savedReport });

  // Stage 7: the bytes. Already millimetres and already Float32, so counted at scale 1.
  const decoded = decodeBinaryStlTriangles(encodeBinaryStl(saved, "p23-diagnosis.stl"));
  rows.push({
    stage: "stl-round-trip",
    report: measureComponents(decoded, 1, { ...plateReference, plateOffsetFieldUnits: plateReference.plateOffsetFieldUnits * saved.scaleMmPerUnit }, layerHeightMm),
  });

  const componentCountByStage: Record<string, number> = {};
  for (const row of rows) componentCountByStage[row.stage] = row.report.componentCount;

  const exactIndexedDisagree =
    (includeExactStages &&
      ((componentCountByStage["pre-clip-exact"] !== componentCountByStage["pre-clip-indexed"]) ||
        (componentCountByStage["post-clip-exact"] !== componentCountByStage["post-clip-indexed"]))) || false;

  const unitToComponent = mapUnitsToComponents(result.units, saved.triangles, savedReport);
  const brokenEdges = findBrokenEdges(result, savedReport, unitToComponent, gapSamplesPerSegment);

  return {
    hostId: result.hostId,
    variant: result.variant,
    unitCount: result.units.length,
    resolution,
    blendK,
    canonicalScaleMmPerUnit: result.canonicalScaleMmPerUnit,
    plateReference,
    plateBoundaryEpsilonMm: plateBoundaryEpsilonMm(layerHeightMm),
    graph: measureGraphStage(result),
    rows,
    savedMesh: savedReport,
    componentCountByStage,
    exactIndexedDisagree,
    brokenEdges,
    unitToComponent,
  };
}

/** The numbers a determinism check compares: everything that must be bit-identical for a fixed seed, with the per-triangle label arrays (which are large and not independently informative) left out. */
export function diagnosisFingerprint(d: HostDiagnosis): string {
  return JSON.stringify({
    hostId: d.hostId,
    unitCount: d.unitCount,
    graph: d.graph,
    componentCountByStage: d.componentCountByStage,
    rows: d.rows.map((r) => ({
      stage: r.stage,
      triangleCount: r.report.triangleCount,
      componentCount: r.report.componentCount,
      plateTouchingComponentCount: r.report.plateTouchingComponentCount,
      largestNonLargestTriangleCount: r.report.largestNonLargestTriangleCount,
      components: r.report.components,
    })),
    exactIndexedDisagree: d.exactIndexedDisagree,
    brokenEdges: d.brokenEdges.map((e) => ({
      childId: e.childId,
      parentId: e.parentId,
      childComponentRank: e.childComponentRank,
      parentComponentRank: e.parentComponentRank,
      gap: e.gap,
      ringPlaneAngleDeg: e.ringPlaneAngleDeg,
      childPhaseDeg: e.childPhaseDeg,
      parentPhaseDeg: e.parentPhaseDeg,
    })),
  });
}

/**
 * Zero-isosurface classification of the EXACT vs the INDEXED union at a fixed
 * deterministic lattice inside the candidate's own sampling box: how many
 * lattice points the two forms disagree about the SIGN of, and the largest
 * absolute field value at which they disagreed.
 *
 * This is the hard-stop test for cause D at the level the mesher actually
 * reads: the mesher only cares which side of zero each grid corner is on, so a
 * sign disagreement is the only approximation difference that can change a
 * component count.
 */
export interface IsosurfaceAgreement {
  compared: number;
  signDisagreements: number;
  /** Largest |exact| at a sign disagreement. A disagreement only ever at tiny |exact| is the documented order-dependent smooth-min band; one at a large |exact| would not be. */
  maxAbsExactAtDisagreement: number;
  maxAbsDifference: number;
}

export function compareIsosurfaceClassification(result: GrowthResult, blendK: number, lattice: number): IsosurfaceAgreement {
  const bounds = diagnosisBounds(result, blendK);
  const sampler = createUnitsFieldSampler(result.units, blendK);
  const n = Math.max(2, Math.round(lattice));
  let compared = 0;
  let signDisagreements = 0;
  let maxAbsExactAtDisagreement = 0;
  let maxAbsDifference = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = bounds.min.x + (bounds.size.x * (i + 0.5)) / n;
        const y = bounds.min.y + (bounds.size.y * (j + 0.5)) / n;
        const z = bounds.min.z + (bounds.size.z * (k + 0.5)) / n;
        const exact = unitsPointsSdf(result.units, blendK, x, y, z);
        const indexed = sampler(x, y, z);
        maxAbsDifference = Math.max(maxAbsDifference, Math.abs(exact - indexed));
        compared++;
        if ((exact < 0) !== (indexed < 0)) {
          signDisagreements++;
          maxAbsExactAtDisagreement = Math.max(maxAbsExactAtDisagreement, Math.abs(exact));
        }
      }
    }
  }
  return { compared, signDisagreements, maxAbsExactAtDisagreement, maxAbsDifference };
}

// ===========================================================================
// P2.3 CORRECTION ROUND (2026-07-27)
//
// An independent audit found the previous P2.3 conclusion — "the small
// components are not any unit's material, they are satellite material created
// purely by the smooth blend" — was NOT proven by the evidence behind it. The
// evidence was `unitsPointsSdf(units, 1e-9, …) > 0` at the small components'
// SURFACE VERTICES.
//
// WHY THAT EVIDENCE CANNOT SUPPORT THAT CONCLUSION
// `smoothMin(a, b, k) <= Math.min(a, b)` for every k >= 0 (the polynomial
// smooth-min in cloud-sculpt/field.ts: the convex-combination term is >= min
// and the `- k·h·(1-h)` term is <= 0, and the whole is <= min for every input —
// see `measureSmoothVsHardOrdering`, which measures this rather than assuming
// it). The union is a left fold of that operator over the SAME element order in
// both forms, so `blended(p) <= hard(p)` everywhere. A vertex on the blended
// isosurface has `blended(p) = 0`, hence `hard(p) >= 0`: the smooth surface can
// never lie strictly inside the hard union. "0% of surface vertices are
// hard-negative" is therefore true of EVERY component of EVERY smooth mesh,
// including one packed with hard material. It distinguishes nothing.
//
// WHAT REPLACES IT
// A VOLUMETRIC measurement: how much hard-union material lies inside the
// component's own closed surface, by sampling the component's bbox, classifying
// inside/outside with the shared ray-parity `buildInsideTester` over that
// component's triangles alone, and evaluating the hard union at the inside
// cells. Run at two grid densities so a verdict that flips with resolution is
// visible as non-converged, with an epsilon band around the hard isosurface
// held out of the verdict entirely.
//
// As everywhere else in this module: these functions return numbers, never a
// verdict string. The report does the classifying.
// ===========================================================================

/**
 * The blend the "hard" union is evaluated at. `smoothMin(a, b, 1e-9)` differs
 * from `Math.min(a, b)` by at most k/4 = 2.5e-10 field units — 12 orders of
 * magnitude below this Study's smallest length — so this is `min` for every
 * practical purpose while still going through the SAME `unitsPointsSdf` the
 * production field uses, rather than a second re-derived union.
 */
export const HARD_UNION_BLEND_K = 1e-9;

/** The hard (unblended) union of the units' own material, at a point in FIELD units. */
export function hardUnionSdf(units: GrowthUnit[], x: number, y: number, z: number): number {
  return unitsPointsSdf(units, HARD_UNION_BLEND_K, x, y, z);
}

export interface SmoothVsHardOrdering {
  compared: number;
  /** Points where `blended > hard`. The analytic claim above says this must be 0; measured, not assumed. */
  blendedAboveHardCount: number;
  /** Largest `blended - hard` seen (<= 0 if the ordering holds). */
  maxBlendedMinusHard: number;
  /** Largest `hard - blended`: how far OUTSIDE the hard surface the blend pushes the isosurface, in field units. This is the size of the gap the old surface-vertex criterion mistook for evidence. */
  maxHardMinusBlended: number;
}

/**
 * Measure `blended <= hard` on a deterministic lattice inside the candidate's
 * own sampling box. This is the whole reason the old criterion was invalid, so
 * it is measured rather than asserted from the algebra.
 */
export function measureSmoothVsHardOrdering(result: GrowthResult, blendK: number, lattice: number): SmoothVsHardOrdering {
  const bounds = diagnosisBounds(result, blendK);
  const n = Math.max(2, Math.round(lattice));
  let compared = 0;
  let blendedAboveHardCount = 0;
  let maxBlendedMinusHard = -Infinity;
  let maxHardMinusBlended = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = bounds.min.x + (bounds.size.x * (i + 0.5)) / n;
        const y = bounds.min.y + (bounds.size.y * (j + 0.5)) / n;
        const z = bounds.min.z + (bounds.size.z * (k + 0.5)) / n;
        const blended = unitsPointsSdf(result.units, blendK, x, y, z);
        const hard = hardUnionSdf(result.units, x, y, z);
        compared++;
        if (blended > hard) blendedAboveHardCount++;
        maxBlendedMinusHard = Math.max(maxBlendedMinusHard, blended - hard);
        maxHardMinusBlended = Math.max(maxHardMinusBlended, hard - blended);
      }
    }
  }
  return { compared, blendedAboveHardCount, maxBlendedMinusHard, maxHardMinusBlended };
}

/** This component's own triangles, in the input array's order. */
export function componentTriangles(triangles: Triangle[], report: ComponentReport, rank: number): Triangle[] {
  const out: Triangle[] = [];
  for (let t = 0; t < triangles.length; t++) if (report.labelOf[t] === rank) out.push(triangles[t]);
  return out;
}

export interface HardOverlapGridRow {
  /**
   * Cells across the component's OWN longest bbox edge. The rule (deliberate,
   * see `measureComponentHardOverlap`): a FIXED count per longest edge, not a
   * count proportional to physical size — so a 0.5mm speck and a 20mm piece both
   * get ~N cells across and therefore comparable statistics. A density fixed in
   * absolute mm would give the speck single-digit cells and no usable count.
   */
  samplesPerLongestEdge: number;
  cellsX: number;
  cellsY: number;
  cellsZ: number;
  totalCells: number;
  /** Cell size in field units, per axis (the bbox is tiled exactly, so cells are only approximately cubic). */
  cellSizeFieldUnits: MeshVertex;
  cellVolumeMm3: number;
  /** Cell centres the ray-parity tester calls inside this component's surface. */
  insideCells: number;
  /** Inside cells with `hardUnionSdf < -epsilon` — hard material, beyond the ambiguous band. THE verdict-eligible count. */
  hardNegativeInsideCells: number;
  /** Inside cells with `hardUnionSdf > +epsilon` — provably no hard material at that cell. */
  hardPositiveInsideCells: number;
  /**
   * Inside cells with `|hardUnionSdf| <= epsilon`: the hard isosurface may cross
   * the cell, so the cell is neither. EXCLUDED from the verdict and reported on
   * its own, never folded into either side.
   */
  ambiguousInsideCells: number;
  insideVolumeMm3: number;
  hardNegativeInsideVolumeMm3: number;
  hardPositiveInsideVolumeMm3: number;
  ambiguousInsideVolumeMm3: number;
  /** Most negative hard SDF found at any inside cell (null when there are no inside cells). Field units. */
  minHardSdfInside: number | null;
  /** Half the cell diagonal — the radius within which the hard isosurface could pass through a cell whose centre is being classified. */
  epsilonFieldUnits: number;
}

export interface ComponentHardOverlap {
  rank: number;
  triangleCount: number;
  /** Reported BEFORE any volume: the inside/outside test below assumes a closed surface, and this says whether that assumption holds for this component. */
  surface: ComponentSurfaceIntegrity;
  signedVolumeProxyMm3: number;
  absoluteVolumeProxyMm3: number;
  bboxMinMm: MeshVertex;
  bboxMaxMm: MeshVertex;
  bboxLongestMm: number;
  axisMinMm: number;
  axisMaxMm: number;
  grids: HardOverlapGridRow[];
  /**
   * THE OLD, INVALID CRITERION, kept as a permanent exhibit rather than deleted:
   * the fraction of this component's SURFACE VERTICES at which the hard union is
   * <= 0. See this section's header for why a near-zero value here means
   * nothing — the smooth isosurface is outside the hard union by construction.
   */
  surfaceVertexCount: number;
  surfaceVerticesInsideHardUnion: number;
  surfaceVertexInsideFraction: number;
  minHardSdfAtSurfaceVertex: number;
  /** Every grid density found at least one verdict-eligible hard-negative inside cell. */
  hardNegativeAtEveryDensity: boolean;
  /** No grid density found any. */
  hardNegativeAtNoDensity: boolean;
  /**
   * The densities agree with each other (`hardNegativeAtEveryDensity ||
   * hardNegativeAtNoDensity`). When false the measurement is NON-CONVERGED and
   * neither answer may be quoted — that is the whole point of running two.
   */
  densitiesAgree: boolean;
}

/**
 * CORRECTION A. How much hard-union material lies inside ONE component's closed
 * surface, measured by volume rather than by surface vertices.
 *
 * Method, in order:
 *  1. `inspectSavedStlTopology` on this component's triangles alone — closed?
 *     winding-consistent? Reported first, never silently skipped: the ray-parity
 *     test below is only valid on a closed surface (`buildInsideTester`'s own
 *     doc states that caveat, and this module restates it rather than relying on
 *     the reader having read it).
 *  2. Sample the component's own bbox on a deterministic grid of
 *     `samplesPerLongestEdge` cells across its LONGEST edge (fixed count, not
 *     fixed millimetres — see `HardOverlapGridRow.samplesPerLongestEdge`), at
 *     cell centres, tiling the bbox exactly so the per-cell volumes sum to the
 *     bbox volume.
 *  3. Classify each centre with `buildInsideTester` over THIS COMPONENT'S
 *     triangles only.
 *  4. At inside cells evaluate `hardUnionSdf`, splitting into hard-negative /
 *     ambiguous-band / hard-positive.
 *
 * `scaleMmPerUnit` converts field units to millimetres; the triangles and the
 * hard union are both in field units, so nothing is scaled before sampling.
 *
 * Returns numbers only. Whether "some hard material inside" means "this
 * component is a fragment of a unit" is a question for the report.
 */
export function measureComponentHardOverlap(
  triangles: Triangle[],
  rank: number,
  units: GrowthUnit[],
  scaleMmPerUnit: number,
  samplesPerLongestEdgeList: readonly number[],
  plateReference?: SavedPlateReference,
): ComponentHardOverlap {
  const topology = inspectSavedStlTopology(triangles, scaleMmPerUnit);
  const surface: ComponentSurfaceIntegrity = {
    openEdges: topology.openEdges,
    nonManifoldEdges: topology.nonManifoldEdges,
    windingInconsistentEdges: topology.windingInconsistentEdges,
    degenerateTriangleCount: topology.degenerateTriangleCount,
    closed: topology.closed,
    windingConsistent: topology.windingConsistent,
    selfComponentCount: topology.connectedComponents,
  };

  const min: MeshVertex = { x: Infinity, y: Infinity, z: Infinity };
  const max: MeshVertex = { x: -Infinity, y: -Infinity, z: -Infinity };
  let signedSix = 0;
  for (const tri of triangles) {
    const { a, b, c } = tri;
    signedSix += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    for (const v of [a, b, c]) {
      for (const k of ["x", "y", "z"] as const) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
    }
  }
  const signedVolumeProxyMm3 = (signedSix / 6) * scaleMmPerUnit ** 3;

  // Build-axis extent, plate-relative, in the same convention ComponentStat
  // uses. A negative `sign` swaps which bbox end is the lower coordinate, so
  // both are computed and ordered rather than assumed.
  let axisMinMm = 0;
  let axisMaxMm = 0;
  if (triangles.length > 0) {
    const axis = plateReference?.axis ?? "y";
    const sign = plateReference?.sign ?? 1;
    const plateAlongAxisMm = (plateReference?.plateOffsetFieldUnits ?? 0) * scaleMmPerUnit;
    const a = sign * Math.fround(min[axis] * scaleMmPerUnit) - plateAlongAxisMm;
    const b = sign * Math.fround(max[axis] * scaleMmPerUnit) - plateAlongAxisMm;
    axisMinMm = Math.min(a, b);
    axisMaxMm = Math.max(a, b);
  }

  // The old criterion, measured so it can be shown to be uninformative.
  let surfaceVertexCount = 0;
  let surfaceVerticesInsideHardUnion = 0;
  let minHardSdfAtSurfaceVertex = Infinity;
  for (const tri of triangles) {
    for (const v of [tri.a, tri.b, tri.c]) {
      const hard = hardUnionSdf(units, v.x, v.y, v.z);
      if (hard <= 0) surfaceVerticesInsideHardUnion++;
      if (hard < minHardSdfAtSurfaceVertex) minHardSdfAtSurfaceVertex = hard;
      surfaceVertexCount++;
    }
  }

  const tester = buildInsideTester(triangles);
  const size: MeshVertex = triangles.length > 0
    ? { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z }
    : { x: 0, y: 0, z: 0 };
  const longest = Math.max(size.x, size.y, size.z);
  const grids: HardOverlapGridRow[] = [];
  // An empty component has no bbox to sample, so it gets NO grid rows at all —
  // which makes `densitiesAgree` false and the result UNDETERMINED, rather than
  // a fabricated "no hard material found" from a grid of NaNs.
  for (const requested of triangles.length > 0 ? samplesPerLongestEdgeList : []) {
    const n = Math.max(2, Math.round(requested));
    const cellsOf = (extent: number): number =>
      longest > 0 ? Math.max(1, Math.round((extent / longest) * n)) : 1;
    const cellsX = cellsOf(size.x);
    const cellsY = cellsOf(size.y);
    const cellsZ = cellsOf(size.z);
    const stepX = size.x / cellsX;
    const stepY = size.y / cellsY;
    const stepZ = size.z / cellsZ;
    // Half the cell diagonal: if |hard| at the centre is below this, the hard
    // isosurface can pass through the cell and the cell is genuinely ambiguous.
    const epsilon = 0.5 * Math.hypot(stepX, stepY, stepZ);
    const cellVolumeMm3 = stepX * stepY * stepZ * scaleMmPerUnit ** 3;
    let insideCells = 0;
    let hardNegative = 0;
    let hardPositive = 0;
    let ambiguous = 0;
    let minHardSdfInside: number | null = null;
    for (let i = 0; i < cellsX; i++) {
      const x = min.x + (i + 0.5) * stepX;
      for (let j = 0; j < cellsY; j++) {
        const y = min.y + (j + 0.5) * stepY;
        for (let k = 0; k < cellsZ; k++) {
          const z = min.z + (k + 0.5) * stepZ;
          if (!tester.isInside(x, y, z)) continue;
          insideCells++;
          const hard = hardUnionSdf(units, x, y, z);
          if (minHardSdfInside === null || hard < minHardSdfInside) minHardSdfInside = hard;
          if (hard < -epsilon) hardNegative++;
          else if (hard > epsilon) hardPositive++;
          else ambiguous++;
        }
      }
    }
    grids.push({
      samplesPerLongestEdge: n,
      cellsX,
      cellsY,
      cellsZ,
      totalCells: cellsX * cellsY * cellsZ,
      cellSizeFieldUnits: { x: stepX, y: stepY, z: stepZ },
      cellVolumeMm3,
      insideCells,
      hardNegativeInsideCells: hardNegative,
      hardPositiveInsideCells: hardPositive,
      ambiguousInsideCells: ambiguous,
      insideVolumeMm3: insideCells * cellVolumeMm3,
      hardNegativeInsideVolumeMm3: hardNegative * cellVolumeMm3,
      hardPositiveInsideVolumeMm3: hardPositive * cellVolumeMm3,
      ambiguousInsideVolumeMm3: ambiguous * cellVolumeMm3,
      minHardSdfInside,
      epsilonFieldUnits: epsilon,
    });
  }

  const hardNegativeAtEveryDensity = grids.length > 0 && grids.every((g) => g.hardNegativeInsideCells > 0);
  const hardNegativeAtNoDensity = grids.length > 0 && grids.every((g) => g.hardNegativeInsideCells === 0);
  return {
    rank,
    triangleCount: triangles.length,
    surface,
    signedVolumeProxyMm3,
    absoluteVolumeProxyMm3: Math.abs(signedVolumeProxyMm3),
    bboxMinMm: triangles.length > 0
      ? { x: min.x * scaleMmPerUnit, y: min.y * scaleMmPerUnit, z: min.z * scaleMmPerUnit }
      : { x: 0, y: 0, z: 0 },
    bboxMaxMm: triangles.length > 0
      ? { x: max.x * scaleMmPerUnit, y: max.y * scaleMmPerUnit, z: max.z * scaleMmPerUnit }
      : { x: 0, y: 0, z: 0 },
    bboxLongestMm: longest * scaleMmPerUnit,
    axisMinMm,
    axisMaxMm,
    grids,
    surfaceVertexCount,
    surfaceVerticesInsideHardUnion,
    surfaceVertexInsideFraction: surfaceVertexCount > 0 ? surfaceVerticesInsideHardUnion / surfaceVertexCount : 0,
    minHardSdfAtSurfaceVertex: Number.isFinite(minHardSdfAtSurfaceVertex) ? minHardSdfAtSurfaceVertex : 0,
    hardNegativeAtEveryDensity,
    hardNegativeAtNoDensity,
    densitiesAgree: hardNegativeAtEveryDensity || hardNegativeAtNoDensity,
  };
}

/** `measureComponentHardOverlap` for a set of component ranks of one already-measured mesh. */
export function measureComponentsHardOverlap(
  triangles: Triangle[],
  report: ComponentReport,
  units: GrowthUnit[],
  scaleMmPerUnit: number,
  samplesPerLongestEdgeList: readonly number[],
  ranks: readonly number[],
  plateReference?: SavedPlateReference,
): ComponentHardOverlap[] {
  return ranks.map((rank) =>
    measureComponentHardOverlap(
      componentTriangles(triangles, report, rank),
      rank,
      units,
      scaleMmPerUnit,
      samplesPerLongestEdgeList,
      plateReference,
    ),
  );
}

// --- D (correction 3): component identity, not component COUNT ---------------

/**
 * 32-bit FNV-1a. Two passes from different offset bases are concatenated into
 * the 64-bit geometry hash below. NOT cryptographic: its only job is to answer
 * "is this the same coordinate set", and a collision would surface as a
 * spurious exact match that the separately-reported bbox/volume deltas would
 * immediately contradict.
 */
function fnv1a32(text: string, offsetBasis: number): number {
  let h = offsetBasis >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function geometryHashOf(sortedKeys: string[]): string {
  const joined = sortedKeys.join(";");
  const a = fnv1a32(joined, 0x811c9dc5);
  const b = fnv1a32(joined, 0x9e3779b9);
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export interface ComponentSignature {
  rank: number;
  triangleCount: number;
  distinctVertexCount: number;
  /**
   * Hash of this component's SORTED SET of distinct Float32-millimetre vertex
   * coordinates. Order-independent and triangle-order-independent, so two
   * components with identical geometry hash identically no matter how the
   * mesher happened to emit them.
   */
  geometryHash: string;
  signedVolumeProxyMm3: number;
  absoluteVolumeProxyMm3: number;
  bboxMinMm: MeshVertex;
  bboxMaxMm: MeshVertex;
  /** bbox centre, mm — the locator the fallback nearest-pairing below uses. */
  centreMm: MeshVertex;
  axisMinMm: number;
  axisMaxMm: number;
  touchesPlate: boolean;
}

/** Stable per-component signatures for identity matching (correction 3). */
export function componentSignatures(triangles: Triangle[], report: ComponentReport, scaleMmPerUnit: number): ComponentSignature[] {
  const keysByRank = new Map<number, Set<string>>();
  for (let t = 0; t < triangles.length; t++) {
    const rank = report.labelOf[t];
    let set = keysByRank.get(rank);
    if (!set) {
      set = new Set();
      keysByRank.set(rank, set);
    }
    const tri = triangles[t];
    for (const v of [tri.a, tri.b, tri.c]) {
      set.add(
        `${Math.fround(v.x * scaleMmPerUnit)},${Math.fround(v.y * scaleMmPerUnit)},${Math.fround(v.z * scaleMmPerUnit)}`,
      );
    }
  }
  return report.components.map((c) => {
    const keys = [...(keysByRank.get(c.rank) ?? new Set<string>())].sort();
    return {
      rank: c.rank,
      triangleCount: c.triangleCount,
      distinctVertexCount: keys.length,
      geometryHash: geometryHashOf(keys),
      signedVolumeProxyMm3: c.signedVolumeProxyMm3,
      absoluteVolumeProxyMm3: c.absoluteVolumeProxyMm3,
      bboxMinMm: c.bboxMinMm,
      bboxMaxMm: c.bboxMaxMm,
      centreMm: {
        x: (c.bboxMinMm.x + c.bboxMaxMm.x) / 2,
        y: (c.bboxMinMm.y + c.bboxMaxMm.y) / 2,
        z: (c.bboxMinMm.z + c.bboxMaxMm.z) / 2,
      },
      axisMinMm: c.axisMinMm,
      axisMaxMm: c.axisMaxMm,
      touchesPlate: c.touchesPlate,
    };
  });
}

export interface ComponentPairDelta {
  beforeRank: number;
  afterRank: number;
  centreDistanceMm: number;
  triangleCountDelta: number;
  signedVolumeDeltaMm3: number;
  absoluteVolumeDeltaMm3: number;
  axisMinDeltaMm: number;
  axisMaxDeltaMm: number;
  /** Largest per-axis bbox corner movement, mm — a shape-change locator the volume delta alone would miss. */
  bboxCornerMaxDeltaMm: number;
}

export interface ComponentSetMatching {
  beforeCount: number;
  afterCount: number;
  /** The number was preserved. On its own this proves NOTHING about identity — that is correction 3's entire point. */
  countPreserved: boolean;
  /** Pairs whose geometry hashes are identical: byte-for-byte the same coordinate set. */
  identicalPairs: Array<{ beforeRank: number; afterRank: number; geometryHash: string }>;
  /**
   * Everything not hash-identical, paired greedily by ascending bbox-centre
   * distance (deterministic: ties break on beforeRank then afterRank). A
   * PAIRING, not an identification — every pair carries the deltas that say how
   * different the two actually are, so a bad pairing is visible instead of
   * hidden.
   */
  changedPairs: ComponentPairDelta[];
  /** Before-components left over after both passes: present before, gone after. */
  disappearedBeforeRanks: number[];
  /** After-components left over: not present before. */
  appearedAfterRanks: number[];
  /** Every before-component has a hash-identical after-twin and vice versa. The ONLY condition under which "nothing was severed" may be claimed. */
  identityPreserved: boolean;
}

/**
 * CORRECTION 3. Counting components before and after an operation and finding
 * the same number does NOT prove the operation severed nothing: an intersection
 * can split one component in two and delete another, leaving the total
 * unchanged. This matches the two sets by IDENTITY instead.
 */
export function matchComponentSets(before: ComponentSignature[], after: ComponentSignature[]): ComponentSetMatching {
  const identicalPairs: Array<{ beforeRank: number; afterRank: number; geometryHash: string }> = [];
  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();
  const afterByHash = new Map<string, number[]>();
  for (const a of after) {
    const list = afterByHash.get(a.geometryHash) ?? [];
    list.push(a.rank);
    afterByHash.set(a.geometryHash, list);
  }
  for (const b of before) {
    const candidates = (afterByHash.get(b.geometryHash) ?? []).filter((r) => !usedAfter.has(r));
    if (candidates.length === 0) continue;
    const afterRank = Math.min(...candidates);
    usedBefore.add(b.rank);
    usedAfter.add(afterRank);
    identicalPairs.push({ beforeRank: b.rank, afterRank, geometryHash: b.geometryHash });
  }

  const remainingBefore = before.filter((b) => !usedBefore.has(b.rank));
  const remainingAfter = after.filter((a) => !usedAfter.has(a.rank));
  const candidatePairs: Array<{ b: ComponentSignature; a: ComponentSignature; d: number }> = [];
  for (const b of remainingBefore) {
    for (const a of remainingAfter) {
      candidatePairs.push({
        b,
        a,
        d: Math.hypot(a.centreMm.x - b.centreMm.x, a.centreMm.y - b.centreMm.y, a.centreMm.z - b.centreMm.z),
      });
    }
  }
  candidatePairs.sort((p, q) => p.d - q.d || p.b.rank - q.b.rank || p.a.rank - q.a.rank);
  const pairedBefore = new Set<number>();
  const pairedAfter = new Set<number>();
  const changedPairs: ComponentPairDelta[] = [];
  for (const { b, a, d } of candidatePairs) {
    if (pairedBefore.has(b.rank) || pairedAfter.has(a.rank)) continue;
    pairedBefore.add(b.rank);
    pairedAfter.add(a.rank);
    let cornerDelta = 0;
    for (const k of ["x", "y", "z"] as const) {
      cornerDelta = Math.max(cornerDelta, Math.abs(a.bboxMinMm[k] - b.bboxMinMm[k]), Math.abs(a.bboxMaxMm[k] - b.bboxMaxMm[k]));
    }
    changedPairs.push({
      beforeRank: b.rank,
      afterRank: a.rank,
      centreDistanceMm: d,
      triangleCountDelta: a.triangleCount - b.triangleCount,
      signedVolumeDeltaMm3: a.signedVolumeProxyMm3 - b.signedVolumeProxyMm3,
      absoluteVolumeDeltaMm3: a.absoluteVolumeProxyMm3 - b.absoluteVolumeProxyMm3,
      axisMinDeltaMm: a.axisMinMm - b.axisMinMm,
      axisMaxDeltaMm: a.axisMaxMm - b.axisMaxMm,
      bboxCornerMaxDeltaMm: cornerDelta,
    });
  }
  changedPairs.sort((p, q) => p.beforeRank - q.beforeRank);

  return {
    beforeCount: before.length,
    afterCount: after.length,
    countPreserved: before.length === after.length,
    identicalPairs,
    changedPairs,
    disappearedBeforeRanks: remainingBefore.filter((b) => !pairedBefore.has(b.rank)).map((b) => b.rank).sort((p, q) => p - q),
    appearedAfterRanks: remainingAfter.filter((a) => !pairedAfter.has(a.rank)).map((a) => a.rank).sort((p, q) => p - q),
    identityPreserved: identicalPairs.length === before.length && before.length === after.length,
  };
}

export interface StageIdentityComparison {
  beforeStage: FieldStage;
  afterStage: FieldStage;
  beforeReport: ComponentReport;
  afterReport: ComponentReport;
  matching: ComponentSetMatching;
}

/**
 * Correction 3 applied to the plate clip: match the pre-clip components to the
 * post-clip components by identity, at the same bounds/resolution/blend.
 */
export function compareStageComponentIdentity(
  result: GrowthResult,
  beforeStage: FieldStage,
  afterStage: FieldStage,
  resolution: number,
  blendK: number,
  plateReference: SavedPlateReference,
  layerHeightMm: number,
): StageIdentityComparison {
  const beforeMesh = buildStageMesh(result, beforeStage, resolution, blendK);
  const afterMesh = buildStageMesh(result, afterStage, resolution, blendK);
  const beforeReport = measureComponents(beforeMesh.triangles, beforeMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  const afterReport = measureComponents(afterMesh.triangles, afterMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  return {
    beforeStage,
    afterStage,
    beforeReport,
    afterReport,
    matching: matchComponentSets(
      componentSignatures(beforeMesh.triangles, beforeReport, beforeMesh.scaleMmPerUnit),
      componentSignatures(afterMesh.triangles, afterReport, afterMesh.scaleMmPerUnit),
    ),
  };
}

// --- F (correction 2.3): the full HARD-union mesh ---------------------------

/**
 * Mesh the HARD union at the SAME candidate, SAME bounds and SAME resolution as
 * the smooth stages. Bounds still come from `diagnosisBounds(result, blendK)`
 * with the PRODUCTION blendK, so the sampling box is identical and the only
 * thing that differs between this mesh and the corresponding smooth stage row
 * is the blend.
 */
export function buildHardUnionStageMesh(result: GrowthResult, resolution: number, blendK: number, postClip: boolean): MeshBuildResult {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const material = (x: number, y: number, z: number): number => hardUnionSdf(result.units, x, y, z);
  const field = postClip
    ? (x: number, y: number, z: number): number => Math.max(material(x, y, z), aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset))
    : material;
  const raw = buildMeshFromField(diagnosisBounds(result, blendK), field, { resolution, targetLongestMm: 1 });
  return rescaleMeshResult(raw, result.canonicalScaleMmPerUnit);
}

/**
 * PRECISION CAVEAT, stated because it decides which of two measurements wins
 * when they disagree: this containment is measured against the MESHED hard
 * union, i.e. a marching-tetrahedra isosurface at the production resolution,
 * whose surface can sit up to one grid step from the true hard isosurface. When
 * the ring struts are only ~1 cell thick that error is comparable to a small
 * component's whole clearance from the hard union. So a hard component whose
 * cells partly fall inside a smooth component that
 * `measureComponentHardOverlap` reports as hard-free is NOT a contradiction —
 * it is this discretisation error. `measureComponentHardOverlap` evaluates the
 * hard FIELD directly and is the authority; this map is a locator.
 */
export interface HardComponentContainment {
  hardRank: number;
  /** Cells sampled inside this HARD component (same grid rule as `measureComponentHardOverlap`). */
  insideCells: number;
  insideVolumeMm3: number;
  /** For each smooth component rank, how many of those cells fall inside it, and the volume that represents. Sorted by descending cells. */
  bySmoothRank: Array<{ smoothRank: number; cells: number; volumeMm3: number }>;
  /** Cells inside this hard component that no smooth component contains. Should be ~0 (the smooth union contains the hard union); a large value means the two meshes disagree and the containment map must not be trusted. */
  cellsInNoSmoothComponent: number;
  /** Smooth rank holding the most of this hard component's volume, or null when none does. */
  dominantSmoothRank: number | null;
}

export interface HardUnionMeshReport {
  resolution: number;
  postClip: boolean;
  /** Component structure of the hard-union mesh itself. */
  report: ComponentReport;
  /** Volume-based containment: which smooth component each hard component's VOLUME lies inside (compare volumes, never surface vertices). */
  containment: HardComponentContainment[];
  /** Smooth component ranks that contain at least one hard component's dominant volume. */
  smoothRanksContainingHardMaterial: number[];
  samplesPerLongestEdge: number;
}

/**
 * CORRECTION 2.3. Mesh the hard union at production bounds/resolution, count and
 * measure ITS components, and map each one into the smooth mesh's components by
 * VOLUME — sampling the hard component's interior and asking which smooth
 * component's closed surface contains those points.
 */
export function measureHardUnionMesh(
  result: GrowthResult,
  smoothTriangles: Triangle[],
  smoothReport: ComponentReport,
  resolution: number,
  blendK: number,
  plateReference: SavedPlateReference,
  layerHeightMm: number,
  samplesPerLongestEdge: number,
  postClip = true,
): HardUnionMeshReport {
  const hardMesh = buildHardUnionStageMesh(result, resolution, blendK, postClip);
  const report = measureComponents(hardMesh.triangles, hardMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  const smoothTesters = smoothReport.components.map((c) => ({
    rank: c.rank,
    tester: buildInsideTester(componentTriangles(smoothTriangles, smoothReport, c.rank)),
  }));
  const scale = hardMesh.scaleMmPerUnit;
  const containment: HardComponentContainment[] = [];
  for (const c of report.components) {
    const tris = componentTriangles(hardMesh.triangles, report, c.rank);
    const min: MeshVertex = { x: Infinity, y: Infinity, z: Infinity };
    const max: MeshVertex = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const tri of tris) {
      for (const v of [tri.a, tri.b, tri.c]) {
        for (const k of ["x", "y", "z"] as const) {
          if (v[k] < min[k]) min[k] = v[k];
          if (v[k] > max[k]) max[k] = v[k];
        }
      }
    }
    const tester = buildInsideTester(tris);
    const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
    const longest = Math.max(size.x, size.y, size.z);
    const n = Math.max(2, Math.round(samplesPerLongestEdge));
    const cellsOf = (extent: number) => (longest > 0 ? Math.max(1, Math.round((extent / longest) * n)) : 1);
    const cx = cellsOf(size.x);
    const cy = cellsOf(size.y);
    const cz = cellsOf(size.z);
    const sx = size.x / cx;
    const sy = size.y / cy;
    const sz = size.z / cz;
    const cellVolumeMm3 = sx * sy * sz * scale ** 3;
    const perRank = new Map<number, number>();
    let insideCells = 0;
    let none = 0;
    for (let i = 0; i < cx; i++) {
      const x = min.x + (i + 0.5) * sx;
      for (let j = 0; j < cy; j++) {
        const y = min.y + (j + 0.5) * sy;
        for (let k = 0; k < cz; k++) {
          const z = min.z + (k + 0.5) * sz;
          if (!tester.isInside(x, y, z)) continue;
          insideCells++;
          let hit = false;
          for (const s of smoothTesters) {
            if (s.tester.isInside(x, y, z)) {
              perRank.set(s.rank, (perRank.get(s.rank) ?? 0) + 1);
              hit = true;
            }
          }
          if (!hit) none++;
        }
      }
    }
    const bySmoothRank = [...perRank.entries()]
      .map(([smoothRank, cells]) => ({ smoothRank, cells, volumeMm3: cells * cellVolumeMm3 }))
      .sort((p, q) => q.cells - p.cells || p.smoothRank - q.smoothRank);
    containment.push({
      hardRank: c.rank,
      insideCells,
      insideVolumeMm3: insideCells * cellVolumeMm3,
      bySmoothRank,
      cellsInNoSmoothComponent: none,
      dominantSmoothRank: bySmoothRank.length > 0 ? bySmoothRank[0].smoothRank : null,
    });
  }
  const smoothRanksContainingHardMaterial = [
    ...new Set(containment.map((c) => c.dominantSmoothRank).filter((r): r is number => r !== null)),
  ].sort((p, q) => p - q);
  return {
    resolution,
    postClip,
    report,
    containment,
    smoothRanksContainingHardMaterial,
    samplesPerLongestEdge: Math.max(2, Math.round(samplesPerLongestEdge)),
  };
}

// --- G (correction 7): exact-only vs indexed-added populations ---------------

export interface ExactIndexedPopulations {
  exactComponentCount: number;
  indexedComponentCount: number;
  /** exact (before) -> indexed (after). The two fields differ within the documented sampler tolerance, so hash-identical pairs are NOT expected; the nearest-centre pairing carries the deltas. */
  matching: ComponentSetMatching;
  /** Indexed-mesh component ranks with no exact counterpart: the population the INDEXED sampler adds. */
  indexedAddedRanks: number[];
  /** Indexed-mesh component ranks that do have an exact counterpart: the population already present in the EXACT field. */
  indexedSharedRanks: number[];
  /** Exact-mesh component ranks with no indexed counterpart. */
  exactOnlyRanks: number[];
  /** Largest nearest-pairing distance accepted, mm — how far the weakest pairing had to reach. Reported so a pairing that is really a mismatch is visible. */
  maxPairingDistanceMm: number;
  /** The two meshes and their reports, returned so a caller can measure hard overlap PER POPULATION without paying for the exact stage twice (~30s at production resolution). */
  exactMesh: MeshBuildResult;
  indexedMesh: MeshBuildResult;
  exactReport: ComponentReport;
  indexedReport: ComponentReport;
}

/**
 * CORRECTION 7. On box the exact field gives 9 components and the indexed
 * sampler gives 10. Those are two different populations and folding them into
 * one cause is wrong. This separates them: pair the exact and indexed
 * components, and report which indexed components are ADDED by the sampler.
 *
 * The pairing is by nearest bbox centre (`matchComponentSets`), because the two
 * fields differ slightly and their vertex sets are therefore never identical.
 * `maxPairingDistanceMm` is reported for exactly that reason — it is a pairing,
 * not an identification, and the numbers say how good it is.
 */
export function partitionExactIndexedPopulations(
  result: GrowthResult,
  resolution: number,
  blendK: number,
  plateReference: SavedPlateReference,
  layerHeightMm: number,
  postClip = true,
): ExactIndexedPopulations {
  const exactStage: FieldStage = postClip ? "post-clip-exact" : "pre-clip-exact";
  const indexedStage: FieldStage = postClip ? "post-clip-indexed" : "pre-clip-indexed";
  const exactMesh = buildStageMesh(result, exactStage, resolution, blendK);
  const indexedMesh = buildStageMesh(result, indexedStage, resolution, blendK);
  const exactReport = measureComponents(exactMesh.triangles, exactMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  const indexedReport = measureComponents(indexedMesh.triangles, indexedMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  const matching = matchComponentSets(
    componentSignatures(exactMesh.triangles, exactReport, exactMesh.scaleMmPerUnit),
    componentSignatures(indexedMesh.triangles, indexedReport, indexedMesh.scaleMmPerUnit),
  );
  const pairedIndexed = new Set<number>([
    ...matching.identicalPairs.map((p) => p.afterRank),
    ...matching.changedPairs.map((p) => p.afterRank),
  ]);
  return {
    exactComponentCount: exactReport.componentCount,
    indexedComponentCount: indexedReport.componentCount,
    matching,
    indexedAddedRanks: matching.appearedAfterRanks,
    indexedSharedRanks: [...pairedIndexed].sort((p, q) => p - q),
    exactOnlyRanks: matching.disappearedBeforeRanks,
    maxPairingDistanceMm: matching.changedPairs.reduce((m, p) => Math.max(m, p.centreDistanceMm), 0),
    exactMesh,
    indexedMesh,
    exactReport,
    indexedReport,
  };
}

// --- correction 4: what the SIGN of the volume proxy can and cannot say ------

export interface SignedVolumeConvention {
  triangleCount: number;
  closed: boolean;
  windingConsistent: boolean;
  /** Divergence-theorem sum WITHOUT `Math.abs`, mm³, as the triangles were handed in. */
  signedVolumeProxyMm3: number;
  absoluteVolumeProxyMm3: number;
  /**
   * The same sum AFTER `orientMeshForSavedStl` — the last step of
   * `buildCandidateMesh`, i.e. the step every SAVED mesh goes through.
   *
   * THE FINDING (correction 4): that function ends by flipping any connected
   * component whose signed six-volume is negative. So on a saved mesh this value
   * is non-negative for EVERY component regardless of what the component
   * actually is, and a cavity's inner wall is indistinguishable from an outward
   * solid shell by sign. The sign therefore must NOT be used to argue "positive
   * volume, therefore solid" anywhere downstream of `buildCandidateMesh`.
   */
  signedVolumeAfterSavedOrientationMm3: number;
  /** `orientMeshForSavedStl` changed the sign: proof that the sign was normalised away rather than measured. */
  orientationFlippedTheSign: boolean;
}

/**
 * CORRECTION 4's instrument. Measures the signed volume of a triangle soup both
 * as given and after the production face-orientation step, so the difference
 * between "the mesh has this winding" and "the saved mesh is allowed to have
 * this winding" is a number rather than an assumption.
 *
 * Use on a mesh that has NOT been through `orientMeshForSavedStl` if the sign is
 * to carry information: outward shell > 0, reversed shell < 0, cavity inner wall
 * < 0 (its normals point away from the surrounding solid, i.e. inward relative
 * to the cavity). Note that the last two are the SAME sign — the sign
 * distinguishes orientation, never "solid vs void". Distinguishing those needs
 * containment, which is what `measureComponentHardOverlap` does volumetrically.
 */
export function measureSignedVolumeConvention(triangles: Triangle[], scaleMmPerUnit: number): SignedVolumeConvention {
  const sumOf = (tris: Triangle[]): number => {
    let six = 0;
    for (const { a, b, c } of tris) {
      six += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    }
    return (six / 6) * scaleMmPerUnit ** 3;
  };
  const topology = inspectSavedStlTopology(triangles, scaleMmPerUnit);
  const asGiven = sumOf(triangles);
  // `orientMeshForSavedStl` only reads `triangles` and `scaleMmPerUnit` of the
  // result it is given; the rest of MeshBuildResult is untouched by it, so a
  // minimal stand-in is honest here rather than a fabricated bounds/watertight.
  const stub = {
    triangles,
    scaleMmPerUnit,
    sourceBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 }, longest: 0 },
    mmBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 }, longest: 0 },
    watertight: { ok: false, openEdges: 0, nonManifoldEdges: 0, totalEdges: 0 },
  } satisfies MeshBuildResult;
  const oriented = sumOf(orientMeshForSavedStl(stub).triangles);
  return {
    triangleCount: triangles.length,
    closed: topology.closed,
    windingConsistent: topology.windingConsistent,
    signedVolumeProxyMm3: asGiven,
    absoluteVolumeProxyMm3: Math.abs(asGiven),
    signedVolumeAfterSavedOrientationMm3: oriented,
    orientationFlippedTheSign: Math.sign(asGiven) !== Math.sign(oriented),
  };
}

// ===========================================================================
// P2.4 MEASUREMENT ROUND (2026-07-27) — diagnosis only, no production behavior
// touched, nothing below is reachable from a shipped entry point (growth.test.ts
// P2.3-18 crawls the import graph and fails if that stops being true).
//
// The P2.3 round established WHAT the saved mesh is (box 10 / sphere 3 /
// waisted 5 smooth components; box 27 / sphere 12 / waisted 20 under a hard
// union; 15 of the 19 non-largest smooth components volumetrically hard-free).
// It did not establish WHY. This round measures four things it left open:
//
//   §1 Is the current flat left-fold smooth union ORDER-DEPENDENT? The
//      polynomial smooth-min is commutative but NOT associative, so a flat fold
//      over ~3000 elements has no a-priori right to be order-invariant. Measured
//      over unit order × element order × {exact, indexed}.
//   §2 What does blendK actually buy? A sweep of the production blend, with the
//      hard/smooth/blend-only counts at each point. The multipliers are a SEARCH
//      DEVICE for this diagnosis — no author-facing control is added anywhere.
//   §3 EVERY parent-child edge at the production-equivalent absolute step (not a
//      representative pair, not the 2.4-2.7x-finer subset row), plus every unit
//      on its own, so the hard union's 27/12/20 can be accounted for rather than
//      guessed at.
//   §4 waisted meshes to 5 components in BOTH fields yet the worst component
//      pairing distance is 65.763mm. Equal counts are not a pass. The difference
//      is decomposed into the element SET the indexed query returns, the ORDER
//      it returns it in, and the far-field CUTOFF clamp — separately, at both
//      the field level and the topology level.
//
// As everywhere else in this module: these functions return numbers. The only
// function that turns numbers into a word is `classifyComponentHardOverlap`,
// and it returns "undetermined" rather than round an inconclusive measurement
// into one of the two answers.
// ===========================================================================

// --- shared: the one place an overlap measurement becomes a word ------------

export type HardOverlapVerdict = "contains-hard-material" | "no-hard-material-found" | "undetermined";

/**
 * The share of a component's interior that may sit in the ambiguous band around
 * the hard isosurface before "found no hard material" stops meaning "there is
 * none". Stated as a named constant so the threshold is never silent.
 */
export const HARD_OVERLAP_AMBIGUOUS_SHARE_LIMIT = 0.2;

/**
 * The P2.3 report's `verdictOf`, promoted into the module so the report, the
 * blendK sweep and the order matrix all classify by ONE rule instead of three
 * copies of it. The rules, unchanged:
 *  - an open or winding-inconsistent surface makes the ray-parity interior test
 *    invalid, so nothing may be concluded;
 *  - the two grid densities must agree, or the measurement is non-converged;
 *  - hard material at every density is the only "contains" answer;
 *  - "found none" is downgraded to undetermined when the excluded ambiguous band
 *    swallowed more than `HARD_OVERLAP_AMBIGUOUS_SHARE_LIMIT` of the interior.
 */
export function classifyComponentHardOverlap(o: ComponentHardOverlap): HardOverlapVerdict {
  if (!o.surface.closed || !o.surface.windingConsistent) return "undetermined";
  if (!o.densitiesAgree) return "undetermined";
  if (o.hardNegativeAtEveryDensity) return "contains-hard-material";
  const worstAmbiguousShare = Math.max(...o.grids.map((g) => (g.insideCells > 0 ? g.ambiguousInsideCells / g.insideCells : 1)));
  return worstAmbiguousShare > HARD_OVERLAP_AMBIGUOUS_SHARE_LIMIT ? "undetermined" : "no-hard-material-found";
}

export interface NonLargestHardTally {
  /** Components measured: every rank except 0. */
  measuredComponentCount: number;
  containsHardMaterial: number;
  blendOnly: number;
  undetermined: number;
  /** |signed volume proxy| summed over the components classified blend-only, mm³. */
  blendOnlyVolumeMm3: number;
  containsHardMaterialVolumeMm3: number;
  undeterminedVolumeMm3: number;
  /**
   * ALWAYS true here, stated as a field rather than a comment: rank 0 is
   * excluded. It is the main body, it always holds hard material, and at these
   * grid densities its own bbox is far too coarse to measure — the P2.3 round
   * already recorded the three largest components as undetermined for that
   * reason. Including it would add a known-undetermined row to every tally.
   */
  rank0Excluded: boolean;
}

/** `measureComponentHardOverlap` + `classifyComponentHardOverlap` over every non-largest component of one mesh. */
export function tallyNonLargestHardOverlap(
  triangles: Triangle[],
  report: ComponentReport,
  units: GrowthUnit[],
  scaleMmPerUnit: number,
  densities: readonly number[],
  plateReference?: SavedPlateReference,
): NonLargestHardTally {
  const tally: NonLargestHardTally = {
    measuredComponentCount: 0,
    containsHardMaterial: 0,
    blendOnly: 0,
    undetermined: 0,
    blendOnlyVolumeMm3: 0,
    containsHardMaterialVolumeMm3: 0,
    undeterminedVolumeMm3: 0,
    rank0Excluded: true,
  };
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
    tally.measuredComponentCount++;
    const verdict = classifyComponentHardOverlap(o);
    if (verdict === "contains-hard-material") {
      tally.containsHardMaterial++;
      tally.containsHardMaterialVolumeMm3 += o.absoluteVolumeProxyMm3;
    } else if (verdict === "no-hard-material-found") {
      tally.blendOnly++;
      tally.blendOnlyVolumeMm3 += o.absoluteVolumeProxyMm3;
    } else {
      tally.undetermined++;
      tally.undeterminedVolumeMm3 += o.absoluteVolumeProxyMm3;
    }
  }
  return tally;
}

// --- §1 machinery: canonical element identity, and the fold itself ----------

export interface CanonicalElement {
  /**
   * Position in the NATURAL flattened order — `for (const u of units) for (const
   * e of unitFieldElements(u))`, i.e. exactly the order `unitsPointsSdf` folds
   * in. This is the element's identity for every order comparison below.
   */
  canonicalId: number;
  unitId: number;
  unitIndex: number;
  elementIndexWithinUnit: number;
  element: FieldElement;
}

/** The units' material elements in the order `unitsPointsSdf` walks them, each tagged with its position in that order. */
export function canonicalElements(units: GrowthUnit[]): CanonicalElement[] {
  const out: CanonicalElement[] = [];
  units.forEach((u, unitIndex) => {
    unitFieldElements(u).forEach((element, elementIndexWithinUnit) => {
      out.push({ canonicalId: out.length, unitId: u.id, unitIndex, elementIndexWithinUnit, element });
    });
  });
  return out;
}

/**
 * The SAME left fold `unitsPointsSdf` performs (`d = 1e5`, first element seeds
 * it, every later element is `smoothMin`'d in), over an EXPLICITLY GIVEN element
 * order.
 *
 * This is not a second union: it is the one operator, applied in a stated order,
 * because measuring order dependence is impossible through a function whose job
 * is to fix the order. `measureFoldFidelity` checks it against `unitsPointsSdf`
 * bit-for-bit in the natural order, and growth.test.ts P2.4-1 asserts that
 * check, before any permuted row below is read as meaning anything.
 */
export function foldExactUnionSdf(elements: readonly FieldElement[], blendK: number, x: number, y: number, z: number): number {
  let d = 1e5;
  let first = true;
  for (const e of elements) {
    const de = elementSdf(e, x, y, z);
    d = first ? de : smoothMin(d, de, blendK);
    first = false;
  }
  return d;
}

export interface OrderedIndexedQuery {
  /** Same value `createUnitsFieldSampler` would return, for the element list and order given. */
  sample: (x: number, y: number, z: number) => number;
  /** The elements the spatial index returns for this point, IN THE ORDER the sampler folds them. */
  queryOrder: (x: number, y: number, z: number) => FieldElement[];
  cutoff: number;
  queryRadius: number;
  elementCount: number;
}

/**
 * `createUnitsFieldSampler`'s indexing and fold, over an EXPLICITLY GIVEN
 * element order — the indexed counterpart of `foldExactUnionSdf`, and for the
 * same reason. Every constant (`cutoff`, `queryRadius`, the SpatialHash cell
 * size, the empty-query `return cutoff` and the final `Math.min(d, cutoff)`) is
 * the same expression the shipped sampler uses; `measureFoldFidelity` proves the
 * natural-order instance is bit-identical to it.
 *
 * `queryOrder` exposes what the shipped sampler keeps private: WHICH elements a
 * point's query returned and in what order. §4 is entirely built on that.
 */
export function createOrderedIndexedQuery(elements: readonly FieldElement[], blendK: number): OrderedIndexedQuery {
  let maxBound = 0;
  for (const e of elements) if (e.bound > maxBound) maxBound = e.bound;
  if (elements.length === 0) {
    return { sample: () => 1e5, queryOrder: () => [], cutoff: 1e5, queryRadius: 0, elementCount: 0 };
  }
  const cutoff = maxBound + Math.max(blendK * 6, maxBound * 2);
  const queryRadius = cutoff + maxBound;
  const hash = new SpatialHash<FieldElement>(Math.max(1e-6, queryRadius));
  for (const e of elements) hash.insert({ x: e.cx, y: e.cy, z: e.cz }, e);
  const queryOrder = (x: number, y: number, z: number): FieldElement[] => hash.queryRadius({ x, y, z }, queryRadius);
  return {
    sample: (x: number, y: number, z: number): number => {
      const nearby = queryOrder(x, y, z);
      if (nearby.length === 0) return cutoff;
      let d = 1e5;
      let first = true;
      for (const e of nearby) {
        const de = elementSdf(e, x, y, z);
        d = first ? de : smoothMin(d, de, blendK);
        first = false;
      }
      return Math.min(d, cutoff);
    },
    queryOrder,
    cutoff,
    queryRadius,
    elementCount: elements.length,
  };
}

export interface FoldFidelity {
  latticeCompared: number;
  /** Lattice points where `foldExactUnionSdf(canonical order)` returned a value not `Object.is`-identical to `unitsPointsSdf`. Must be 0. */
  exactMismatches: number;
  maxAbsExactDifference: number;
  /** Same, for `createOrderedIndexedQuery(canonical order).sample` vs `createUnitsFieldSampler`. Must be 0. */
  indexedMismatches: number;
  maxAbsIndexedDifference: number;
}

/**
 * The precondition for everything in §1 and §4: the two order-explicit folds
 * reproduce the two shipped unions EXACTLY when handed the natural order. If
 * this is ever not 0/0, every permuted row below is measuring the instrument
 * rather than the field, and must be discarded.
 */
export function measureFoldFidelity(result: GrowthResult, blendK: number, lattice: number): FoldFidelity {
  const bounds = diagnosisBounds(result, blendK);
  const canonical = canonicalElements(result.units).map((c) => c.element);
  const shippedIndexed = createUnitsFieldSampler(result.units, blendK);
  const orderedIndexed = createOrderedIndexedQuery(canonical, blendK);
  const n = Math.max(2, Math.round(lattice));
  let latticeCompared = 0;
  let exactMismatches = 0;
  let indexedMismatches = 0;
  let maxAbsExactDifference = 0;
  let maxAbsIndexedDifference = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = bounds.min.x + (bounds.size.x * (i + 0.5)) / n;
        const y = bounds.min.y + (bounds.size.y * (j + 0.5)) / n;
        const z = bounds.min.z + (bounds.size.z * (k + 0.5)) / n;
        const shippedExactValue = unitsPointsSdf(result.units, blendK, x, y, z);
        const foldedExact = foldExactUnionSdf(canonical, blendK, x, y, z);
        if (!Object.is(shippedExactValue, foldedExact)) exactMismatches++;
        maxAbsExactDifference = Math.max(maxAbsExactDifference, Math.abs(shippedExactValue - foldedExact));
        const shippedIndexedValue = shippedIndexed(x, y, z);
        const foldedIndexed = orderedIndexed.sample(x, y, z);
        if (!Object.is(shippedIndexedValue, foldedIndexed)) indexedMismatches++;
        maxAbsIndexedDifference = Math.max(maxAbsIndexedDifference, Math.abs(shippedIndexedValue - foldedIndexed));
        latticeCompared++;
      }
    }
  }
  return { latticeCompared, exactMismatches, maxAbsExactDifference, indexedMismatches, maxAbsIndexedDifference };
}

// --- §1: the orderings ------------------------------------------------------

export type UnitOrder = "natural" | "reversed" | "sorted-by-id" | "seeded-shuffle";
export type ElementOrder = "natural" | "reversed";
export type UnionForm = "exact" | "indexed";

export const UNIT_ORDERS: readonly UnitOrder[] = ["natural", "reversed", "sorted-by-id", "seeded-shuffle"] as const;
export const ELEMENT_ORDERS: readonly ElementOrder[] = ["natural", "reversed"] as const;
export const UNION_FORMS: readonly UnionForm[] = ["exact", "indexed"] as const;

/** Fixed seed for the deterministic shuffle. Changing it changes every shuffled row, so it is a named constant, never an inline literal. */
export const ORDER_SHUFFLE_SEED = "katachi-p24-order";

/** mulberry32 — a deterministic 32-bit PRNG. No `Math.random` anywhere in this module. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The units in the requested order. Never mutates the input array. */
export function orderUnits(units: GrowthUnit[], order: UnitOrder): GrowthUnit[] {
  if (order === "natural") return [...units];
  if (order === "reversed") return [...units].reverse();
  if (order === "sorted-by-id") {
    // Stable by construction: ties (impossible for distinct ids, but not assumed)
    // fall back to the natural index.
    return units.map((u, i) => ({ u, i })).sort((p, q) => p.u.id - q.u.id || p.i - q.i).map((p) => p.u);
  }
  const rng = mulberry32(fnv1a32(ORDER_SHUFFLE_SEED, 0x811c9dc5));
  const out = [...units];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/**
 * The flattened element list for one (unit order, element order) condition, each
 * element still tagged with its CANONICAL id — so an order comparison is against
 * the natural order's identity, not against a position.
 */
export function orderedElementList(units: GrowthUnit[], unitOrder: UnitOrder, elementOrder: ElementOrder): CanonicalElement[] {
  const canonicalIdOf = new Map<string, number>();
  for (const c of canonicalElements(units)) canonicalIdOf.set(`${c.unitId}:${c.elementIndexWithinUnit}`, c.canonicalId);
  const out: CanonicalElement[] = [];
  orderUnits(units, unitOrder).forEach((u, unitIndex) => {
    const own = unitFieldElements(u);
    const indices = own.map((_, i) => i);
    if (elementOrder === "reversed") indices.reverse();
    for (const elementIndexWithinUnit of indices) {
      out.push({
        canonicalId: canonicalIdOf.get(`${u.id}:${elementIndexWithinUnit}`)!,
        unitId: u.id,
        unitIndex,
        elementIndexWithinUnit,
        element: own[elementIndexWithinUnit],
      });
    }
  });
  return out;
}

export interface OrderConditionRow {
  form: UnionForm;
  unitOrder: UnitOrder;
  elementOrder: ElementOrder;
  label: string;
  /** This condition IS the natural order of its form — the reference every other row is compared against. */
  isNaturalReference: boolean;
  /**
   * The element sequence really differs from the natural one. `sorted-by-id` on
   * a candidate whose units are already appended in ascending id order is the
   * same sequence, and a row that is secretly the reference must be visible as
   * such rather than quoted as evidence of order-invariance.
   */
  permutationDiffersFromNatural: boolean;
  /** Canonical ids: how far the furthest element moved from its natural position. 0 for an unchanged sequence. */
  maxCanonicalDisplacement: number;

  // --- field, measured on the MATERIAL union alone (no plate clip) ----------
  latticeCompared: number;
  /** Lattice points where this order and the natural order of the SAME form disagree about the SIGN of the field — the only thing the mesher reads. */
  signDisagreementsVsNatural: number;
  /** Largest |natural| at a sign disagreement. A disagreement only ever at tiny |natural| is a knife-edge; one at a large value is not. */
  maxAbsNaturalAtSignDisagreement: number;
  maxAbsFieldDifferenceVsNatural: number;

  // --- mesh, at the PRODUCTION composition (post-clip) ----------------------
  triangleCount: number;
  componentCount: number;
  /** Every component has a byte-identical twin in the natural order's set. The only condition under which "this order changes nothing" may be said. */
  identityPreservedVsNatural: boolean;
  identicalPairCount: number;
  changedPairCount: number;
  disappearedCount: number;
  appearedCount: number;
  /** Worst nearest-centre pairing distance among the non-identical pairs, mm. 0 when every pair was hash-identical. */
  worstPairingDistanceMm: number;
  totalSignedVolumeProxyMm3: number;
  totalAbsoluteVolumeProxyMm3: number;
  bboxMinMm: MeshVertex;
  bboxMaxMm: MeshVertex;

  /** Non-largest components only (see `NonLargestHardTally.rank0Excluded`). `null` when the tally was not requested. */
  hardTally: NonLargestHardTally | null;
  buildMs: number;
}

export interface OrderDependenceReport {
  hostId: GrowthResult["hostId"];
  unitCount: number;
  elementCount: number;
  resolution: number;
  blendK: number;
  lattice: number;
  densities: readonly number[];
  fidelity: FoldFidelity;
  rows: OrderConditionRow[];
  /**
   * THE VERDICT, and it is a measurement not an opinion: some condition whose
   * element sequence really differs from the natural one disagreed with the
   * natural order on the field's sign, on the component count, or on component
   * identity.
   */
  orderDependent: boolean;
  /** Which rows did. Empty iff `orderDependent` is false. */
  orderDependentLabels: string[];
  /** Spread of component counts across all rows of each form. 0 means every order gave the same count (which still does not mean the same components — see the identity columns). */
  componentCountSpreadExact: number;
  componentCountSpreadIndexed: number;
  /** Largest field difference any permuted row showed against its form's natural order, field units. */
  maxAbsFieldDifferenceAnyRow: number;
  /** Largest sign-disagreement count any permuted row showed. */
  maxSignDisagreementsAnyRow: number;
}

export interface OrderDependenceOptions {
  resolution: number;
  blendK: number;
  /** Cells per axis for the field-level sign/difference comparison. */
  lattice: number;
  /** Grid densities for the per-component hard-overlap tally, or `null` to skip it (it is by far the most expensive column). */
  hardOverlapDensities: readonly number[] | null;
  /** Include the EXACT form. It costs ~res³ x element-count per row; a fast determinism check can leave it out, and the flag is recorded on every row. */
  includeExactForm: boolean;
  layerHeightMm: number;
  plateReference: SavedPlateReference;
}

function orderedStageMesh(
  result: GrowthResult,
  elements: readonly FieldElement[],
  form: UnionForm,
  resolution: number,
  blendK: number,
  postClip: boolean,
): MeshBuildResult {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const indexed = form === "indexed" ? createOrderedIndexedQuery(elements, blendK) : null;
  const materialAt = indexed
    ? indexed.sample
    : (x: number, y: number, z: number): number => foldExactUnionSdf(elements, blendK, x, y, z);
  const field = postClip
    ? (x: number, y: number, z: number): number => Math.max(materialAt(x, y, z), aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset))
    : materialAt;
  // Bounds come from `diagnosisBounds(result, blendK)` — a function of the units
  // and the blend only, never of the order — so every row below is meshed in the
  // SAME box at the SAME absolute step and a difference can only be the order.
  return rescaleMeshResult(buildMeshFromField(diagnosisBounds(result, blendK), field, { resolution, targetLongestMm: 1 }), result.canonicalScaleMmPerUnit);
}

/**
 * §1. Vary the unit order and, independently, the element order within each
 * unit, in both the exact and the indexed form, and measure what changes.
 *
 * What is held identical across every row: the units, the blend, the sampling
 * box, the resolution, the canonical scale, the plate clip. The ONLY thing that
 * varies is the sequence the smooth-min operator is folded in.
 */
export function measureOrderDependence(result: GrowthResult, options: OrderDependenceOptions): OrderDependenceReport {
  const { resolution, blendK, lattice, hardOverlapDensities, includeExactForm, layerHeightMm, plateReference } = options;
  const bounds = diagnosisBounds(result, blendK);
  const n = Math.max(2, Math.round(lattice));
  const canonical = orderedElementList(result.units, "natural", "natural");
  const canonicalIds = canonical.map((c) => c.canonicalId);

  const rows: OrderConditionRow[] = [];
  const forms: UnionForm[] = includeExactForm ? [...UNION_FORMS] : ["indexed"];

  for (const form of forms) {
    // The reference for this form: natural units, natural elements.
    let referenceValues: Float64Array | null = null;
    let referenceSignatures: ComponentSignature[] | null = null;
    for (const unitOrder of UNIT_ORDERS) {
      for (const elementOrder of ELEMENT_ORDERS) {
        const started = Date.now();
        const ordered = orderedElementList(result.units, unitOrder, elementOrder);
        const elements = ordered.map((c) => c.element);
        const ids = ordered.map((c) => c.canonicalId);
        let maxCanonicalDisplacement = 0;
        for (let i = 0; i < ids.length; i++) maxCanonicalDisplacement = Math.max(maxCanonicalDisplacement, Math.abs(ids[i] - canonicalIds[i]));
        const permutationDiffersFromNatural = ids.some((id, i) => id !== canonicalIds[i]);
        const isNaturalReference = unitOrder === "natural" && elementOrder === "natural";

        // --- field level, material union only (the plate clip is order-free) --
        const indexed = form === "indexed" ? createOrderedIndexedQuery(elements, blendK) : null;
        const at = indexed ? indexed.sample : (x: number, y: number, z: number) => foldExactUnionSdf(elements, blendK, x, y, z);
        const values = new Float64Array(n * n * n);
        let v = 0;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            for (let k = 0; k < n; k++) {
              values[v++] = at(
                bounds.min.x + (bounds.size.x * (i + 0.5)) / n,
                bounds.min.y + (bounds.size.y * (j + 0.5)) / n,
                bounds.min.z + (bounds.size.z * (k + 0.5)) / n,
              );
            }
          }
        }
        if (isNaturalReference) referenceValues = values;
        const ref = referenceValues!;
        let signDisagreements = 0;
        let maxAbsNaturalAtSignDisagreement = 0;
        let maxAbsFieldDifference = 0;
        for (let i = 0; i < values.length; i++) {
          maxAbsFieldDifference = Math.max(maxAbsFieldDifference, Math.abs(values[i] - ref[i]));
          if ((values[i] < 0) !== (ref[i] < 0)) {
            signDisagreements++;
            maxAbsNaturalAtSignDisagreement = Math.max(maxAbsNaturalAtSignDisagreement, Math.abs(ref[i]));
          }
        }

        // --- mesh level, the production composition --------------------------
        const mesh = orderedStageMesh(result, elements, form, resolution, blendK, true);
        const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, plateReference, layerHeightMm);
        const signatures = componentSignatures(mesh.triangles, report, mesh.scaleMmPerUnit);
        if (isNaturalReference) referenceSignatures = signatures;
        const matching = matchComponentSets(referenceSignatures!, signatures);
        const bboxMinMm: MeshVertex = { x: Infinity, y: Infinity, z: Infinity };
        const bboxMaxMm: MeshVertex = { x: -Infinity, y: -Infinity, z: -Infinity };
        let totalSigned = 0;
        let totalAbsolute = 0;
        for (const c of report.components) {
          totalSigned += c.signedVolumeProxyMm3;
          totalAbsolute += c.absoluteVolumeProxyMm3;
          for (const k of ["x", "y", "z"] as const) {
            bboxMinMm[k] = Math.min(bboxMinMm[k], c.bboxMinMm[k]);
            bboxMaxMm[k] = Math.max(bboxMaxMm[k], c.bboxMaxMm[k]);
          }
        }

        rows.push({
          form,
          unitOrder,
          elementOrder,
          label: `${form}/${unitOrder}/${elementOrder}`,
          isNaturalReference,
          permutationDiffersFromNatural,
          maxCanonicalDisplacement,
          latticeCompared: values.length,
          signDisagreementsVsNatural: signDisagreements,
          maxAbsNaturalAtSignDisagreement,
          maxAbsFieldDifferenceVsNatural: maxAbsFieldDifference,
          triangleCount: report.triangleCount,
          componentCount: report.componentCount,
          identityPreservedVsNatural: matching.identityPreserved,
          identicalPairCount: matching.identicalPairs.length,
          changedPairCount: matching.changedPairs.length,
          disappearedCount: matching.disappearedBeforeRanks.length,
          appearedCount: matching.appearedAfterRanks.length,
          worstPairingDistanceMm: matching.changedPairs.reduce((m, p) => Math.max(m, p.centreDistanceMm), 0),
          totalSignedVolumeProxyMm3: totalSigned,
          totalAbsoluteVolumeProxyMm3: totalAbsolute,
          bboxMinMm: report.components.length > 0 ? bboxMinMm : { x: 0, y: 0, z: 0 },
          bboxMaxMm: report.components.length > 0 ? bboxMaxMm : { x: 0, y: 0, z: 0 },
          hardTally: hardOverlapDensities
            ? tallyNonLargestHardOverlap(mesh.triangles, report, result.units, mesh.scaleMmPerUnit, hardOverlapDensities, plateReference)
            : null,
          buildMs: Date.now() - started,
        });
      }
    }
  }

  const dependent = rows.filter(
    (r) =>
      r.permutationDiffersFromNatural &&
      (r.signDisagreementsVsNatural > 0 ||
        !r.identityPreservedVsNatural ||
        r.componentCount !== rows.find((q) => q.form === r.form && q.isNaturalReference)!.componentCount),
  );
  const spread = (form: UnionForm): number => {
    const counts = rows.filter((r) => r.form === form).map((r) => r.componentCount);
    return counts.length === 0 ? 0 : Math.max(...counts) - Math.min(...counts);
  };
  return {
    hostId: result.hostId,
    unitCount: result.units.length,
    elementCount: canonical.length,
    resolution,
    blendK,
    lattice: n,
    densities: hardOverlapDensities ?? [],
    fidelity: measureFoldFidelity(result, blendK, Math.min(n, 12)),
    rows,
    orderDependent: dependent.length > 0,
    orderDependentLabels: dependent.map((r) => r.label),
    componentCountSpreadExact: spread("exact"),
    componentCountSpreadIndexed: spread("indexed"),
    maxAbsFieldDifferenceAnyRow: rows.filter((r) => r.permutationDiffersFromNatural).reduce((m, r) => Math.max(m, r.maxAbsFieldDifferenceVsNatural), 0),
    maxSignDisagreementsAnyRow: rows.filter((r) => r.permutationDiffersFromNatural).reduce((m, r) => Math.max(m, r.signDisagreementsVsNatural), 0),
  };
}

// --- §2: the blendK sweep ---------------------------------------------------

/**
 * Multipliers ON the candidate's own production blend (`params.unitRadius * 0.3`,
 * read from the code at every call site, never hard-coded here). 1.0 is the
 * shipped value and is deliberately in the middle of the list so it is measured
 * by exactly the same path as every other point.
 *
 * A SEARCH DEVICE for this diagnosis. No author-facing control is added for it
 * anywhere; nothing in `src/` outside this diagnosis module reads it.
 */
export const BLEND_K_SWEEP_MULTIPLIERS: readonly number[] = [0, 0.25, 0.5, 0.75, 1, 1.25] as const;

export interface SmoothOnlyRegion {
  lattice: number;
  compared: number;
  cellVolumeMm3: number;
  insideSmoothCells: number;
  insideHardCells: number;
  /** Cells inside the SMOOTH union and outside the HARD one — the material the blend adds. */
  smoothOnlyCells: number;
  /**
   * Cells inside the HARD union and outside the smooth one. `smoothMin <= min`
   * makes this impossible; it is counted rather than assumed, and a non-zero
   * value invalidates the smooth-only volume below.
   */
  hardOnlyCells: number;
  insideSmoothVolumeMm3: number;
  insideHardVolumeMm3: number;
  smoothOnlyVolumeMm3: number;
}

/**
 * §2's volume column, on a deterministic lattice over the candidate's own
 * sampling box: how much of the box the smooth union covers, how much the hard
 * union covers, and the difference. A cell-count integral at the stated lattice,
 * never an exact volume — which is why every field is named after cells or
 * carries `Mm3` alongside its own cell count.
 *
 * The max-outward-DISTANCE proxy is not computed here: `measureSmoothVsHardOrdering`
 * already measures it (`maxHardMinusBlended`) and is called separately, so there
 * is one definition of it rather than two.
 */
export function measureSmoothOnlyRegion(result: GrowthResult, blendK: number, lattice: number): SmoothOnlyRegion {
  const bounds = diagnosisBounds(result, blendK);
  const n = Math.max(2, Math.round(lattice));
  const scale = result.canonicalScaleMmPerUnit;
  const cellVolumeMm3 = ((bounds.size.x / n) * (bounds.size.y / n) * (bounds.size.z / n)) * scale ** 3;
  let insideSmooth = 0;
  let insideHard = 0;
  let smoothOnly = 0;
  let hardOnly = 0;
  let compared = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = bounds.min.x + (bounds.size.x * (i + 0.5)) / n;
        const y = bounds.min.y + (bounds.size.y * (j + 0.5)) / n;
        const z = bounds.min.z + (bounds.size.z * (k + 0.5)) / n;
        const smooth = unitsPointsSdf(result.units, blendK, x, y, z);
        const hard = hardUnionSdf(result.units, x, y, z);
        compared++;
        if (smooth < 0) insideSmooth++;
        if (hard < 0) insideHard++;
        if (smooth < 0 && hard >= 0) smoothOnly++;
        if (hard < 0 && smooth >= 0) hardOnly++;
      }
    }
  }
  return {
    lattice: n,
    compared,
    cellVolumeMm3,
    insideSmoothCells: insideSmooth,
    insideHardCells: insideHard,
    smoothOnlyCells: smoothOnly,
    hardOnlyCells: hardOnly,
    insideSmoothVolumeMm3: insideSmooth * cellVolumeMm3,
    insideHardVolumeMm3: insideHard * cellVolumeMm3,
    smoothOnlyVolumeMm3: smoothOnly * cellVolumeMm3,
  };
}

export interface BlendKSweepPoint {
  multiplier: number;
  blendK: number;
  /** `computeUnitBounds`'s margin is `max(0.2, blendK * 1.5)`, so the sampling box and therefore the absolute step MOVE with blendK. Both are recorded rather than assumed constant. */
  boundsLongestFieldUnits: number;
  stepFieldUnits: number;
  stepMm: number;

  hardComponentCount: number;
  smoothComponentCount: number;
  savedMeshComponentCount: number;
  savedMeshTriangleCount: number;
  savedMeshOpenEdges: number;
  savedMeshNonManifoldEdges: number;
  savedMeshWindingInconsistentEdges: number;
  savedMeshClosed: boolean;
  savedMeshWindingConsistent: boolean;
  /** `meshLowestBuildAxisMm` of the saved mesh: the lowest plate-relative coordinate, mm. Negative means below the plate. */
  savedMeshLowestBuildAxisMm: number;
  savedMeshBboxMinMm: MeshVertex;
  savedMeshBboxMaxMm: MeshVertex;

  hardTally: NonLargestHardTally | null;
  smoothOnly: SmoothOnlyRegion;
  ordering: SmoothVsHardOrdering;
  /** `ordering.maxHardMinusBlended` in mm — the max-outward-distance PROXY from the hard surface, at the stated lattice. */
  maxOutwardDistanceProxyMm: number;

  /** Recorded per point although it CANNOT vary with blendK: `computeSurfaceCoverage` classifies against `isInsideUnitMaterial`, the hard material model, which has no blend in it. A varying value here would mean the coverage measurement had acquired a blend dependency. */
  measuredSurfaceCoverage: number;

  exactComponentCount: number | null;
  indexedComponentCount: number | null;
  exactIndexedIdentityPreserved: boolean | null;
  exactIndexedMaxPairingDistanceMm: number | null;
  exactIndexedAddedRanks: number[] | null;

  meshMs: number;
}

export interface BlendKSweepReport {
  hostId: GrowthResult["hostId"];
  unitCount: number;
  resolution: number;
  productionBlendK: number;
  /** `result.params.unitRadius`, so the reader can check the production blend is really `unitRadius * 0.3` rather than take it on trust. */
  unitRadius: number;
  hostBoundsFieldUnits: Bounds;
  buildVolumeMm: Vec3 | null;
  points: BlendKSweepPoint[];
  /** Points where NO non-largest component was classified blend-only AND the exact/indexed component sets matched by identity. The §2 question, answered as a list of multipliers (possibly empty). */
  multipliersWithNoBlendOnlyAndIdentityMatch: number[];
}

export interface BlendKSweepOptions {
  resolution: number;
  multipliers: readonly number[];
  lattice: number;
  hardOverlapDensities: readonly number[] | null;
  /** Run the EXACT stage (and therefore the exact-vs-indexed identity column). ~res³ x element-count per point. */
  includeExactIndexedIdentity: boolean;
  buildVolumeMm?: Vec3;
}

export function measureBlendKSweep(result: GrowthResult, options: BlendKSweepOptions): BlendKSweepReport {
  const { resolution, multipliers, lattice, hardOverlapDensities, includeExactIndexedIdentity } = options;
  const layerHeightMm = result.envelope.layerHeightMm;
  const productionBlendK = result.params.unitRadius * 0.3;
  const points: BlendKSweepPoint[] = [];
  for (const multiplier of multipliers) {
    const started = Date.now();
    const blendK = productionBlendK * multiplier;
    const bounds = diagnosisBounds(result, blendK);
    const stepFieldUnits = bounds.longest / Math.max(8, Math.round(resolution));

    const saved = buildCandidateMesh(result, resolution, blendK);
    const plateReference = saved.plateReference;
    if (!plateReference) throw new Error("buildCandidateMesh returned no plateReference — the blendK sweep will not guess the build axis");
    const savedReport = measureComponents(saved.triangles, saved.scaleMmPerUnit, plateReference, layerHeightMm);
    const savedTopology = inspectSavedStlTopology(saved.triangles, saved.scaleMmPerUnit);

    const smoothMesh = buildStageMesh(result, "post-clip-indexed", resolution, blendK);
    const smoothReport = measureComponents(smoothMesh.triangles, smoothMesh.scaleMmPerUnit, plateReference, layerHeightMm);

    const hardMesh = buildHardUnionStageMesh(result, resolution, blendK, true);
    const hardReport = measureComponents(hardMesh.triangles, hardMesh.scaleMmPerUnit, plateReference, layerHeightMm);

    let exactComponentCount: number | null = null;
    let indexedComponentCount: number | null = null;
    let identityPreserved: boolean | null = null;
    let maxPairingDistanceMm: number | null = null;
    let addedRanks: number[] | null = null;
    if (includeExactIndexedIdentity) {
      const populations = partitionExactIndexedPopulations(result, resolution, blendK, plateReference, layerHeightMm);
      exactComponentCount = populations.exactComponentCount;
      indexedComponentCount = populations.indexedComponentCount;
      identityPreserved = populations.matching.identityPreserved;
      maxPairingDistanceMm = populations.maxPairingDistanceMm;
      addedRanks = populations.indexedAddedRanks;
    }

    const ordering = measureSmoothVsHardOrdering(result, blendK, lattice);
    points.push({
      multiplier,
      blendK,
      boundsLongestFieldUnits: bounds.longest,
      stepFieldUnits,
      stepMm: stepFieldUnits * result.canonicalScaleMmPerUnit,
      hardComponentCount: hardReport.componentCount,
      smoothComponentCount: smoothReport.componentCount,
      savedMeshComponentCount: savedReport.componentCount,
      savedMeshTriangleCount: savedReport.triangleCount,
      savedMeshOpenEdges: savedTopology.openEdges,
      savedMeshNonManifoldEdges: savedTopology.nonManifoldEdges,
      savedMeshWindingInconsistentEdges: savedTopology.windingInconsistentEdges,
      savedMeshClosed: savedTopology.closed,
      savedMeshWindingConsistent: savedTopology.windingConsistent,
      savedMeshLowestBuildAxisMm: meshLowestBuildAxisMm(saved),
      savedMeshBboxMinMm: saved.mmBounds.min,
      savedMeshBboxMaxMm: saved.mmBounds.max,
      hardTally: hardOverlapDensities
        ? tallyNonLargestHardOverlap(saved.triangles, savedReport, result.units, saved.scaleMmPerUnit, hardOverlapDensities, plateReference)
        : null,
      smoothOnly: measureSmoothOnlyRegion(result, blendK, lattice),
      ordering,
      maxOutwardDistanceProxyMm: ordering.maxHardMinusBlended * result.canonicalScaleMmPerUnit,
      measuredSurfaceCoverage: result.measuredSurfaceCoverage,
      exactComponentCount,
      indexedComponentCount,
      exactIndexedIdentityPreserved: identityPreserved,
      exactIndexedMaxPairingDistanceMm: maxPairingDistanceMm,
      exactIndexedAddedRanks: addedRanks,
      meshMs: Date.now() - started,
    });
  }
  return {
    hostId: result.hostId,
    unitCount: result.units.length,
    resolution,
    productionBlendK,
    unitRadius: result.params.unitRadius,
    hostBoundsFieldUnits: diagnosisBounds(result, productionBlendK),
    buildVolumeMm: options.buildVolumeMm ?? null,
    points,
    multipliersWithNoBlendOnlyAndIdentityMatch: points
      .filter((p) => p.hardTally !== null && p.hardTally.blendOnly === 0 && p.exactIndexedIdentityPreserved === true)
      .map((p) => p.multiplier),
  };
}

// --- §3: every parent-child edge, and every unit alone ----------------------

export type EdgeContactClass =
  | "not-in-contact"
  | "in-contact-neck-unresolved-at-production-step"
  | "in-contact-resolved-at-production-step"
  | "unclassified";

export const EDGE_CONTACT_CLASSES: readonly EdgeContactClass[] = [
  "not-in-contact",
  "in-contact-neck-unresolved-at-production-step",
  "in-contact-resolved-at-production-step",
  "unclassified",
] as const;

export interface EdgeMeasurement {
  childId: number;
  parentId: number;
  gap: CapsuleGapMeasurement;
  /** The subset's own resolution that reproduces the FULL candidate's absolute step, from `productionEquivalentSubsetResolution`. */
  productionEquivalentResolution: number;
  productionEquivalentClamped: boolean;
  /** `stepFieldUnits / fullStepFieldUnits` for the row that was actually meshed. 1 means it really is at the production step. */
  stepRatioToFullCandidate: number;
  preClipComponentCount: number;
  postClipComponentCount: number;
  meshesAsOneComponentPreClip: boolean;
  meshesAsOneComponentPostClip: boolean;
  /** `2 x neckRadiusProxy` at the minimum-gap sample pair, field units. null for a separated or fully-contained pair (see `CapsuleGapMeasurement.neckState`). */
  neckWidthFieldUnits: number | null;
  neckWidthMm: number | null;
  /** Neck width over the SMALLER of the two interpolated tube radii at the closest points. */
  neckWidthOverTubeRadius: number | null;
  /** Neck width over the full candidate's absolute sampling step: below ~1 the mesher has no grid corner inside the neck to resolve it with. */
  neckWidthOverProductionStep: number | null;
  /** The smaller of the two interpolated tube radii at the closest points, field units. */
  tubeRadiusFieldUnits: number | null;
  /**
   * TUBE diameter over the full candidate's absolute sampling step. Reported
   * next to the neck ratio because it is a different question and the two are
   * easy to conflate: a junction can have a perfectly wide neck and still
   * fragment if the TUBE ITSELF is only ~2 grid cells across, since then whether
   * any given segment is captured depends on where the grid corners happen to
   * fall inside it.
   */
  tubeDiameterOverProductionStep: number | null;
  classification: EdgeContactClass;
}

export interface UnitAloneMeasurement {
  unitId: number;
  kind: GrowthUnit["kind"];
  pointCount: number;
  productionEquivalentResolution: number;
  productionEquivalentClamped: boolean;
  preClipComponentCount: number;
  postClipComponentCount: number;
  /** Components beyond the first, post-clip: this unit fragments into pieces on its own at the production step. */
  fragmentExcess: number;
}

export interface AllEdgeReport {
  hostId: GrowthResult["hostId"];
  resolution: number;
  /** The blend the sampling BOX is computed at — always the production blend, so every subset row sits at the production absolute step. */
  boundsBlendK: number;
  /** The blend the FIELD is evaluated at. Equal to `boundsBlendK` for the smooth pass; `HARD_UNION_BLEND_K` for the hard pass. */
  fieldBlendK: number;
  gapSamplesPerSegment: number;
  fullStepFieldUnits: number;
  fullStepMm: number;
  edgeCount: number;
  edges: EdgeMeasurement[];
  countByClass: Record<EdgeContactClass, number>;
  /** Edges that do NOT mesh as one component at the production-equivalent step, post-clip. */
  severedAtProductionStep: number;
  unitCount: number;
  units: UnitAloneMeasurement[];
  unitsFragmentingAlone: number[];
  /** Sum over units of `postClipComponentCount - 1`: pieces added by WITHIN-unit fragmentation alone. */
  withinUnitFragmentExcess: number;
}

export interface AllEdgeOptions {
  resolution: number;
  boundsBlendK: number;
  /** Defaults to `boundsBlendK`. Pass `HARD_UNION_BLEND_K` for the hard-union pass. */
  fieldBlendK?: number;
  gapSamplesPerSegment: number;
  layerHeightMm: number;
  /** Also mesh every unit ALONE (the within-unit fragmentation column). */
  includeUnitsAlone: boolean;
}

/**
 * §3. EVERY parent-child edge of the graph, measured at the
 * PRODUCTION-EQUIVALENT absolute step — never the fine-subset row, which is
 * 2.4-2.7x finer and answers a different question ("can this piece hold together
 * at all" rather than "does the production mesher resolve it").
 *
 * The classification, and what each class is allowed to claim:
 *  - `not-in-contact`: `sampledMinSignedGap - samplingErrorBound > 0`. The sampled
 *    gap is an UPPER bound on the true minimum, so a merely-positive sampled gap
 *    does not prove separation; only a gap clear of its own error bound does.
 *  - `in-contact-neck-unresolved-at-production-step`: the sampled gap is negative
 *    (an actual overlapping point pair was found, so the overlap is real) AND the
 *    pair still meshes as more than one component at the production step.
 *  - `in-contact-resolved-at-production-step`: sampled gap negative and the pair
 *    meshes as one component.
 *  - `unclassified`: sampled gap >= 0 but within its own error bound of zero.
 *    Counted, never guessed at.
 */
export function measureAllEdges(result: GrowthResult, options: AllEdgeOptions): AllEdgeReport {
  const { resolution, boundsBlendK, gapSamplesPerSegment, layerHeightMm, includeUnitsAlone } = options;
  const fieldBlendK = options.fieldBlendK ?? boundsBlendK;
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const byId = new Map(result.units.map((u) => [u.id, u]));
  const scale = result.canonicalScaleMmPerUnit;

  const edges: EdgeMeasurement[] = [];
  const countByClass: Record<EdgeContactClass, number> = {
    "not-in-contact": 0,
    "in-contact-neck-unresolved-at-production-step": 0,
    "in-contact-resolved-at-production-step": 0,
    unclassified: 0,
  };
  let fullStepFieldUnits = 0;
  for (const child of result.units) {
    if (child.parentId === null) continue;
    const parent = byId.get(child.parentId);
    if (!parent) continue;
    const pair = [parent, child];
    const derived = productionEquivalentSubsetResolution(result, pair, boundsBlendK, resolution);
    fullStepFieldUnits = derived.fullStepFieldUnits;
    const counts = measureSubsetComponents(result, pair, derived.equivalentResolution, boundsBlendK, layerHeightMm, fieldBlendK);
    const gap = measureCapsulePairGap(parent, child, gapSamplesPerSegment, buildAxis, plateOffset, scale);

    const neckWidth = gap.neckRadiusProxyFieldUnits === null ? null : gap.neckRadiusProxyFieldUnits * 2;
    const tubeRadius =
      gap.closestRadiusA === null || gap.closestRadiusB === null ? null : Math.min(gap.closestRadiusA, gap.closestRadiusB);
    const meshesAsOnePost = counts.postClipComponentCount === 1;

    let classification: EdgeContactClass;
    if (gap.sampledMinSignedGapFieldUnits - gap.samplingErrorBoundFieldUnits > 0) classification = "not-in-contact";
    else if (gap.sampledMinSignedGapFieldUnits < 0)
      classification = meshesAsOnePost ? "in-contact-resolved-at-production-step" : "in-contact-neck-unresolved-at-production-step";
    else classification = "unclassified";
    countByClass[classification]++;

    edges.push({
      childId: child.id,
      parentId: parent.id,
      gap,
      productionEquivalentResolution: derived.equivalentResolution,
      productionEquivalentClamped: derived.clamped,
      stepRatioToFullCandidate: counts.stepFieldUnits / derived.fullStepFieldUnits,
      preClipComponentCount: counts.preClipComponentCount,
      postClipComponentCount: counts.postClipComponentCount,
      meshesAsOneComponentPreClip: counts.preClipComponentCount === 1,
      meshesAsOneComponentPostClip: meshesAsOnePost,
      neckWidthFieldUnits: neckWidth,
      neckWidthMm: neckWidth === null ? null : neckWidth * scale,
      neckWidthOverTubeRadius: neckWidth === null || tubeRadius === null || tubeRadius <= 0 ? null : neckWidth / tubeRadius,
      neckWidthOverProductionStep: neckWidth === null ? null : neckWidth / derived.fullStepFieldUnits,
      tubeRadiusFieldUnits: tubeRadius,
      tubeDiameterOverProductionStep: tubeRadius === null ? null : (tubeRadius * 2) / derived.fullStepFieldUnits,
      classification,
    });
  }
  edges.sort((a, b) => a.childId - b.childId);

  const unitRows: UnitAloneMeasurement[] = [];
  if (includeUnitsAlone) {
    for (const u of result.units) {
      const derived = productionEquivalentSubsetResolution(result, [u], boundsBlendK, resolution);
      const counts = measureSubsetComponents(result, [u], derived.equivalentResolution, boundsBlendK, layerHeightMm, fieldBlendK);
      unitRows.push({
        unitId: u.id,
        kind: u.kind,
        pointCount: u.points.length,
        productionEquivalentResolution: derived.equivalentResolution,
        productionEquivalentClamped: derived.clamped,
        preClipComponentCount: counts.preClipComponentCount,
        postClipComponentCount: counts.postClipComponentCount,
        fragmentExcess: Math.max(0, counts.postClipComponentCount - 1),
      });
    }
  }

  return {
    hostId: result.hostId,
    resolution,
    boundsBlendK,
    fieldBlendK,
    gapSamplesPerSegment,
    fullStepFieldUnits,
    fullStepMm: fullStepFieldUnits * scale,
    edgeCount: edges.length,
    edges,
    countByClass,
    severedAtProductionStep: edges.filter((e) => !e.meshesAsOneComponentPostClip).length,
    unitCount: result.units.length,
    units: unitRows,
    unitsFragmentingAlone: unitRows.filter((u) => u.fragmentExcess > 0).map((u) => u.unitId),
    withinUnitFragmentExcess: unitRows.reduce((s, u) => s + u.fragmentExcess, 0),
  };
}

export interface HardUnionFragmentationAccounting {
  hostId: GrowthResult["hostId"];
  /** The number being accounted for: components of the meshed HARD union at production bounds/resolution. */
  hardUnionComponentCount: number;
  unitCount: number;
  edgeCount: number;
  countByClass: Record<EdgeContactClass, number>;
  severedEdges: number;
  unitsFragmentingAlone: number;
  withinUnitFragmentExcess: number;
  /**
   * `1 + severedEdges + withinUnitFragmentExcess` — a PREDICTION from the
   * per-edge and per-unit measurements, on the assumption that a graph whose
   * every edge fuses and whose every unit is whole meshes as one piece.
   */
  predictedComponentCount: number;
  /** `hardUnionComponentCount - predictedComponentCount`. Reported, never absorbed: a non-zero residual means the two-unit and one-unit subsets do not fully explain the whole-candidate count. */
  residual: number;
}

/**
 * §3's accounting step. Deliberately a SUBTRACTION with a reported residual
 * rather than a fit: pair subsets are meshed in their own small boxes, and
 * neighbours a pair does not include can fuse things a pair cannot, so the
 * prediction is an upper bound on fragmentation and the residual says by how much.
 */
export function accountHardUnionFragmentation(
  hardUnionComponentCount: number,
  edgeReport: AllEdgeReport,
): HardUnionFragmentationAccounting {
  const predicted = 1 + edgeReport.severedAtProductionStep + edgeReport.withinUnitFragmentExcess;
  return {
    hostId: edgeReport.hostId,
    hardUnionComponentCount,
    unitCount: edgeReport.unitCount,
    edgeCount: edgeReport.edgeCount,
    countByClass: edgeReport.countByClass,
    severedEdges: edgeReport.severedAtProductionStep,
    unitsFragmentingAlone: edgeReport.unitsFragmentingAlone.length,
    withinUnitFragmentExcess: edgeReport.withinUnitFragmentExcess,
    predictedComponentCount: predicted,
    residual: hardUnionComponentCount - predicted,
  };
}

// --- §4: what the exact/indexed gap is actually made of ---------------------

export interface ExactIndexedCauseBreakdown {
  lattice: number;
  compared: number;
  totalElements: number;
  /** Lattice points where the indexed query returned FEWER elements than the exact form walks. */
  pointsWithReducedElementSet: number;
  minElementsReturned: number;
  maxElementsReturned: number;
  meanElementsReturned: number;
  /** Points where the query returned nothing at all — the sampler's `return cutoff` branch. Excluded from every effect maximum below (the empty fold's `1e5` sentinel would swamp them) and reported on its own. */
  pointsWithEmptyQuery: number;
  maxAbsTotalDifferenceAtEmptyQuery: number;
  /** Points where the returned order is not ascending by canonical id. */
  pointsWithNonCanonicalOrder: number;
  /** Largest |position in the query - position in canonical order| seen. */
  maxRankDisplacement: number;
  /**
   * Dropped elements whose OWN sdf at that point is within `blendK` of the fold's
   * result — i.e. elements the smooth-min would still have been moved by. This is
   * the "contributes near zero in exact but is dropped by the indexed cutoff"
   * count.
   */
  pointsWithInfluentialDrops: number;
  maxInfluentialDropsAtAPoint: number;
  totalInfluentialDrops: number;

  /** `exactAll - exactOnQueriedSubset`: the effect of the SET the query returns. */
  maxAbsSetEffect: number;
  setEffectSignFlips: number;
  /** `exactOnQueriedSubset - foldInQueryOrder`: the effect of the ORDER alone, on the identical element set. */
  maxAbsOrderEffect: number;
  orderEffectSignFlips: number;
  /** `foldInQueryOrder - indexedFinal`: the effect of the far-field `Math.min(d, cutoff)` clamp. */
  maxAbsCutoffEffect: number;
  cutoffEffectSignFlips: number;
  maxAbsTotalDifference: number;
  totalSignFlips: number;
  /** `max |(set + order + cutoff) - total|`. The three effects are a partition of the difference by construction, so this is float round-off only; a large value means the decomposition is broken. */
  maxReconstructionResidual: number;
  /** Which single effect had the largest magnitude at the point of the largest total difference. */
  dominantEffectAtWorstPoint: "set" | "order" | "cutoff" | "none";
  /** Field values at that worst point, so the number can be re-derived by hand. */
  worstPoint: Vec3 | null;
  worstExact: number;
  worstIndexed: number;
}

/**
 * §4. Decompose `exact(p) - indexed(p)` into three named, mutually exclusive
 * effects at every lattice point of `region` (default: the candidate's own
 * sampling box):
 *
 *   SET    the indexed query returns a SUBSET of the elements; folding the same
 *          operator over fewer elements is a different number.
 *   ORDER  the subset comes back in SpatialHash bucket order, not canonical
 *          order, and the polynomial smooth-min is NOT associative.
 *   CUTOFF the sampler clamps with `Math.min(d, cutoff)` and answers `cutoff`
 *          for an empty query.
 *
 * The three sum to the whole difference by construction (`maxReconstructionResidual`
 * measures that they do), so "the gap is caused by X" becomes a number instead
 * of a story.
 */
export function decomposeExactIndexedDifference(
  result: GrowthResult,
  blendK: number,
  lattice: number,
  region?: Bounds,
): ExactIndexedCauseBreakdown {
  const bounds = region ?? diagnosisBounds(result, blendK);
  const canonical = canonicalElements(result.units);
  const canonicalIdOfElement = new Map<FieldElement, number>();
  for (const c of canonical) canonicalIdOfElement.set(c.element, c.canonicalId);
  const elements = canonical.map((c) => c.element);
  const query = createOrderedIndexedQuery(elements, blendK);
  const n = Math.max(2, Math.round(lattice));

  let compared = 0;
  let pointsWithReducedElementSet = 0;
  let minElementsReturned = Infinity;
  let maxElementsReturned = 0;
  let totalElementsReturned = 0;
  let pointsWithEmptyQuery = 0;
  let maxAbsTotalDifferenceAtEmptyQuery = 0;
  let pointsWithNonCanonicalOrder = 0;
  let maxRankDisplacement = 0;
  let pointsWithInfluentialDrops = 0;
  let maxInfluentialDropsAtAPoint = 0;
  let totalInfluentialDrops = 0;
  let maxAbsSetEffect = 0;
  let setEffectSignFlips = 0;
  let maxAbsOrderEffect = 0;
  let orderEffectSignFlips = 0;
  let maxAbsCutoffEffect = 0;
  let cutoffEffectSignFlips = 0;
  let maxAbsTotalDifference = 0;
  let totalSignFlips = 0;
  let maxReconstructionResidual = 0;
  let dominantEffectAtWorstPoint: "set" | "order" | "cutoff" | "none" = "none";
  let worstPoint: Vec3 | null = null;
  let worstExact = 0;
  let worstIndexed = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = bounds.min.x + (bounds.size.x * (i + 0.5)) / n;
        const y = bounds.min.y + (bounds.size.y * (j + 0.5)) / n;
        const z = bounds.min.z + (bounds.size.z * (k + 0.5)) / n;
        compared++;
        const queried = query.queryOrder(x, y, z);
        totalElementsReturned += queried.length;
        minElementsReturned = Math.min(minElementsReturned, queried.length);
        maxElementsReturned = Math.max(maxElementsReturned, queried.length);
        if (queried.length < elements.length) pointsWithReducedElementSet++;

        const exactAll = foldExactUnionSdf(elements, blendK, x, y, z);
        const indexedFinal = query.sample(x, y, z);
        const total = exactAll - indexedFinal;

        if (queried.length === 0) {
          pointsWithEmptyQuery++;
          maxAbsTotalDifferenceAtEmptyQuery = Math.max(maxAbsTotalDifferenceAtEmptyQuery, Math.abs(total));
          if ((exactAll < 0) !== (indexedFinal < 0)) totalSignFlips++;
          continue;
        }

        const ids = queried.map((e) => canonicalIdOfElement.get(e)!);
        const sortedIds = [...ids].sort((p, q) => p - q);
        const positionInCanonicalOrder = new Map<number, number>();
        sortedIds.forEach((id, idx) => positionInCanonicalOrder.set(id, idx));
        let nonCanonical = false;
        for (let t = 0; t < ids.length; t++) {
          const displacement = Math.abs(positionInCanonicalOrder.get(ids[t])! - t);
          if (displacement !== 0) nonCanonical = true;
          maxRankDisplacement = Math.max(maxRankDisplacement, displacement);
        }
        if (nonCanonical) pointsWithNonCanonicalOrder++;

        const byCanonical = [...queried].sort(
          (p, q) => canonicalIdOfElement.get(p)! - canonicalIdOfElement.get(q)!,
        );
        const exactOnSubset = foldExactUnionSdf(byCanonical, blendK, x, y, z);
        const foldInQueryOrder = foldExactUnionSdf(queried, blendK, x, y, z);

        // Elements the query DROPPED whose own sdf could still have moved the
        // smooth-min: |own sdf - result| < blendK is exactly the band in which
        // smoothMin differs from min.
        if (queried.length < elements.length) {
          const kept = new Set(ids);
          let influential = 0;
          for (const c of canonical) {
            if (kept.has(c.canonicalId)) continue;
            if (Math.abs(elementSdf(c.element, x, y, z) - exactAll) < blendK) influential++;
          }
          if (influential > 0) {
            pointsWithInfluentialDrops++;
            totalInfluentialDrops += influential;
            maxInfluentialDropsAtAPoint = Math.max(maxInfluentialDropsAtAPoint, influential);
          }
        }

        const setEffect = exactAll - exactOnSubset;
        const orderEffect = exactOnSubset - foldInQueryOrder;
        const cutoffEffect = foldInQueryOrder - indexedFinal;
        maxAbsSetEffect = Math.max(maxAbsSetEffect, Math.abs(setEffect));
        maxAbsOrderEffect = Math.max(maxAbsOrderEffect, Math.abs(orderEffect));
        maxAbsCutoffEffect = Math.max(maxAbsCutoffEffect, Math.abs(cutoffEffect));
        if ((exactAll < 0) !== (exactOnSubset < 0)) setEffectSignFlips++;
        if ((exactOnSubset < 0) !== (foldInQueryOrder < 0)) orderEffectSignFlips++;
        if ((foldInQueryOrder < 0) !== (indexedFinal < 0)) cutoffEffectSignFlips++;
        if ((exactAll < 0) !== (indexedFinal < 0)) totalSignFlips++;
        maxReconstructionResidual = Math.max(maxReconstructionResidual, Math.abs(setEffect + orderEffect + cutoffEffect - total));
        if (Math.abs(total) > maxAbsTotalDifference) {
          maxAbsTotalDifference = Math.abs(total);
          const m = Math.max(Math.abs(setEffect), Math.abs(orderEffect), Math.abs(cutoffEffect));
          dominantEffectAtWorstPoint =
            m === 0 ? "none" : Math.abs(setEffect) === m ? "set" : Math.abs(orderEffect) === m ? "order" : "cutoff";
          worstPoint = { x, y, z };
          worstExact = exactAll;
          worstIndexed = indexedFinal;
        }
      }
    }
  }

  return {
    lattice: n,
    compared,
    totalElements: elements.length,
    pointsWithReducedElementSet,
    minElementsReturned: Number.isFinite(minElementsReturned) ? minElementsReturned : 0,
    maxElementsReturned,
    meanElementsReturned: compared > 0 ? totalElementsReturned / compared : 0,
    pointsWithEmptyQuery,
    maxAbsTotalDifferenceAtEmptyQuery,
    pointsWithNonCanonicalOrder,
    maxRankDisplacement,
    pointsWithInfluentialDrops,
    maxInfluentialDropsAtAPoint,
    totalInfluentialDrops,
    maxAbsSetEffect,
    setEffectSignFlips,
    maxAbsOrderEffect,
    orderEffectSignFlips,
    maxAbsCutoffEffect,
    cutoffEffectSignFlips,
    maxAbsTotalDifference,
    totalSignFlips,
    maxReconstructionResidual,
    dominantEffectAtWorstPoint,
    worstPoint,
    worstExact,
    worstIndexed,
  };
}

/**
 * The three fields §4 needs to separate SET from ORDER at the TOPOLOGY level,
 * not just the field level:
 *  - `exact-all-canonical`      every element, canonical order   (= `unitsPointsSdf`)
 *  - `indexed-set-canonical-order` the query's SET, canonical ORDER, no cutoff clamp
 *  - `indexed-as-shipped`       the query's set, the query's order, the clamp (= `createUnitsFieldSampler`)
 *
 * The middle field exists only here: it is the control that says which of the
 * two differences between the outer two is doing the work.
 */
export type ExactIndexedProbeField = "exact-all-canonical" | "indexed-set-canonical-order" | "indexed-as-shipped";

export const EXACT_INDEXED_PROBE_FIELDS: readonly ExactIndexedProbeField[] = [
  "exact-all-canonical",
  "indexed-set-canonical-order",
  "indexed-as-shipped",
] as const;

export function buildExactIndexedProbeMesh(
  result: GrowthResult,
  field: ExactIndexedProbeField,
  resolution: number,
  blendK: number,
  postClip: boolean,
): MeshBuildResult {
  const buildAxis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, buildAxis);
  const canonical = canonicalElements(result.units);
  const elements = canonical.map((c) => c.element);
  const canonicalIdOfElement = new Map<FieldElement, number>();
  for (const c of canonical) canonicalIdOfElement.set(c.element, c.canonicalId);
  const query = createOrderedIndexedQuery(elements, blendK);
  let materialAt: (x: number, y: number, z: number) => number;
  if (field === "exact-all-canonical") {
    materialAt = (x, y, z) => foldExactUnionSdf(elements, blendK, x, y, z);
  } else if (field === "indexed-as-shipped") {
    materialAt = query.sample;
  } else {
    materialAt = (x, y, z) => {
      const queried = query.queryOrder(x, y, z);
      if (queried.length === 0) return query.cutoff;
      const byCanonical = [...queried].sort((p, q) => canonicalIdOfElement.get(p)! - canonicalIdOfElement.get(q)!);
      return Math.min(foldExactUnionSdf(byCanonical, blendK, x, y, z), query.cutoff);
    };
  }
  const composed = postClip
    ? (x: number, y: number, z: number): number => Math.max(materialAt(x, y, z), aboveBuildPlateSdf(x, y, z, buildAxis, plateOffset))
    : materialAt;
  return rescaleMeshResult(
    buildMeshFromField(diagnosisBounds(result, blendK), composed, { resolution, targetLongestMm: 1 }),
    result.canonicalScaleMmPerUnit,
  );
}

export interface ExactIndexedTopologyAttribution {
  resolution: number;
  blendK: number;
  reports: Array<{ field: ExactIndexedProbeField; report: ComponentReport }>;
  componentCountByField: Record<string, number>;
  /** exact-all-canonical -> indexed-set-canonical-order. Everything this pairing shows is attributable to the SET the query returns. */
  setStep: ComponentSetMatching;
  setStepMaxPairingDistanceMm: number;
  /** indexed-set-canonical-order -> indexed-as-shipped. Everything THIS pairing shows is attributable to the ORDER (plus the cutoff clamp, which is measured separately by `decomposeExactIndexedDifference`). */
  orderStep: ComponentSetMatching;
  orderStepMaxPairingDistanceMm: number;
  /** exact-all-canonical -> indexed-as-shipped: the whole gap, for comparison with the two halves. */
  wholeGap: ComponentSetMatching;
  wholeGapMaxPairingDistanceMm: number;
  /** Which half of the gap carries the larger worst-pairing distance. `"equal"` when they are exactly equal (including both zero). */
  dominantStep: "set" | "order" | "equal";
}

/**
 * §4's topology-level attribution. Two component-set matchings in series, so the
 * 65.763mm worst pairing distance the P2.3 round measured between the exact and
 * indexed meshes can be split into the part the element SET causes and the part
 * the element ORDER causes, rather than attributed to "the sampler".
 */
export function measureExactIndexedTopologyAttribution(
  result: GrowthResult,
  resolution: number,
  blendK: number,
  plateReference: SavedPlateReference,
  layerHeightMm: number,
  postClip = true,
): ExactIndexedTopologyAttribution {
  const built = EXACT_INDEXED_PROBE_FIELDS.map((field) => {
    const mesh = buildExactIndexedProbeMesh(result, field, resolution, blendK, postClip);
    const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, plateReference, layerHeightMm);
    return { field, mesh, report, signatures: componentSignatures(mesh.triangles, report, mesh.scaleMmPerUnit) };
  });
  const [exact, setOnly, shipped] = built;
  const worst = (m: ComponentSetMatching): number => m.changedPairs.reduce((x, p) => Math.max(x, p.centreDistanceMm), 0);
  const setStep = matchComponentSets(exact.signatures, setOnly.signatures);
  const orderStep = matchComponentSets(setOnly.signatures, shipped.signatures);
  const wholeGap = matchComponentSets(exact.signatures, shipped.signatures);
  const componentCountByField: Record<string, number> = {};
  for (const b of built) componentCountByField[b.field] = b.report.componentCount;
  const setWorst = worst(setStep);
  const orderWorst = worst(orderStep);
  return {
    resolution,
    blendK,
    reports: built.map((b) => ({ field: b.field, report: b.report })),
    componentCountByField,
    setStep,
    setStepMaxPairingDistanceMm: setWorst,
    orderStep,
    orderStepMaxPairingDistanceMm: orderWorst,
    wholeGap,
    wholeGapMaxPairingDistanceMm: worst(wholeGap),
    dominantStep: setWorst === orderWorst ? "equal" : setWorst > orderWorst ? "set" : "order",
  };
}

/** A `Bounds` around one component's bbox, in FIELD units, for a region-restricted probe. `padFieldUnits` widens it so the region includes the material just outside the component's own surface. */
export function boundsAroundComponent(
  triangles: Triangle[],
  report: ComponentReport,
  rank: number,
  padFieldUnits: number,
): Bounds | null {
  const own = componentTriangles(triangles, report, rank);
  if (own.length === 0) return null;
  const min: MeshVertex = { x: Infinity, y: Infinity, z: Infinity };
  const max: MeshVertex = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const t of own) {
    for (const v of [t.a, t.b, t.c]) {
      for (const k of ["x", "y", "z"] as const) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
    }
  }
  const lo = { x: min.x - padFieldUnits, y: min.y - padFieldUnits, z: min.z - padFieldUnits };
  const hi = { x: max.x + padFieldUnits, y: max.y + padFieldUnits, z: max.z + padFieldUnits };
  const size = { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z };
  return { min: lo, max: hi, size, longest: Math.max(size.x, size.y, size.z) };
}

// --- §3 addendum: fragmentation as the WHOLE-candidate mesh actually has it --

export interface WholeMeshFragmentation {
  /** Component count of the mesh being explained. */
  componentCount: number;
  unitCount: number;
  /** A unit's triangles must be at least this share of its own total for the component they are in to count as one of that unit's components. Stated because a nearest-unit assignment near a parent/child overlap is genuinely ambiguous (see `mapUnitsToComponents`), and a single stray triangle must not read as a fragmented ring. */
  minComponentShare: number;
  /** Units whose own triangles occupy more than one component past that share — WITHIN-unit (for a ring: within-ring) fragmentation, as the production mesher actually produced it. */
  unitsSpanningMultipleComponents: number[];
  maxComponentsPerUnit: number;
  unassignedUnitCount: number;
  /** Extra components attributable to within-unit fragmentation: sum over units of (components past the share threshold - 1). */
  withinUnitExcess: number;

  edgeCount: number;
  /** Parent-child edges whose two units' DOMINANT components differ in this mesh — BETWEEN parent and child. */
  severedEdgeCount: number;
  severedEdges: Array<{ parentId: number; childId: number; parentComponentRank: number; childComponentRank: number; contactClass: EdgeContactClass | null }>;
  /** The severed edges cross-classified by the per-edge contact measurement, when one was supplied. */
  severedEdgeCountByContactClass: Record<EdgeContactClass, number> | null;
  /** Components no unit claims a majority of — pieces that are nobody's dominant material. */
  componentsWithNoDominantUnit: number[];

  /** `1 + severedEdgeCount + withinUnitExcess`: what the two causes above predict. */
  predictedComponentCount: number;
  /** `componentCount - predictedComponentCount`, reported and never absorbed. */
  residual: number;
}

/**
 * §3's bridge from the per-pair measurement to the number actually being
 * explained. `measureAllEdges` meshes each pair in the pair's OWN box; this
 * measures the SAME candidate's whole mesh and asks which units and which edges
 * are actually split IN IT, using the imported `mapUnitsToComponents`
 * assignment. The two can legitimately disagree — a pair that fuses in its own
 * box need not fuse at the whole box's grid PHASE — and that disagreement is
 * exactly what the residual of the pair-based accounting was hiding.
 *
 * `contactClassOf` maps `"parentId>childId"` to the class `measureAllEdges` gave
 * that edge, so a severed edge can be reported as "not in contact" or "in
 * contact but unresolved" rather than merely "severed". Pass `null` to skip.
 */
export function measureWholeMeshFragmentation(
  result: GrowthResult,
  triangles: Triangle[],
  report: ComponentReport,
  contactClassOf: Map<string, EdgeContactClass> | null,
  minComponentShare = 0.05,
): WholeMeshFragmentation {
  const map = mapUnitsToComponents(result.units, triangles, report);
  const unitsSpanning: number[] = [];
  let maxComponentsPerUnit = 0;
  let withinUnitExcess = 0;
  for (const u of result.units) {
    const per = map.trianglesOf.get(u.id);
    if (!per) continue;
    let own = 0;
    for (const count of per.values()) own += count;
    const significant = [...per.values()].filter((count) => own > 0 && count / own >= minComponentShare).length;
    maxComponentsPerUnit = Math.max(maxComponentsPerUnit, significant);
    if (significant > 1) {
      unitsSpanning.push(u.id);
      withinUnitExcess += significant - 1;
    }
  }

  const byId = new Map(result.units.map((u) => [u.id, u]));
  const severedEdges: WholeMeshFragmentation["severedEdges"] = [];
  const byClass: Record<EdgeContactClass, number> = {
    "not-in-contact": 0,
    "in-contact-neck-unresolved-at-production-step": 0,
    "in-contact-resolved-at-production-step": 0,
    unclassified: 0,
  };
  let edgeCount = 0;
  for (const child of result.units) {
    if (child.parentId === null) continue;
    const parent = byId.get(child.parentId);
    if (!parent) continue;
    edgeCount++;
    const cc = map.dominantComponentOf.get(child.id);
    const pc = map.dominantComponentOf.get(parent.id);
    if (cc === undefined || pc === undefined || cc === pc) continue;
    const contactClass = contactClassOf?.get(`${parent.id}>${child.id}`) ?? null;
    if (contactClass) byClass[contactClass]++;
    severedEdges.push({ parentId: parent.id, childId: child.id, parentComponentRank: pc, childComponentRank: cc, contactClass });
  }

  const claimed = new Set(map.dominantComponentOf.values());
  const componentsWithNoDominantUnit = report.components.map((c) => c.rank).filter((r) => !claimed.has(r));
  const predicted = 1 + severedEdges.length + withinUnitExcess;
  return {
    componentCount: report.componentCount,
    unitCount: result.units.length,
    minComponentShare,
    unitsSpanningMultipleComponents: unitsSpanning.sort((a, b) => a - b),
    maxComponentsPerUnit,
    unassignedUnitCount: map.unassignedUnitCount,
    withinUnitExcess,
    edgeCount,
    severedEdgeCount: severedEdges.length,
    severedEdges,
    severedEdgeCountByContactClass: contactClassOf ? byClass : null,
    componentsWithNoDominantUnit,
    predictedComponentCount: predicted,
    residual: report.componentCount - predicted,
  };
}

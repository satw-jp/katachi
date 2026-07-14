// ---------------------------------------------------------------------------
// Pack's STL/OBJ export — reuses cloud-sculpt/meshExport.ts's marching-
// tetrahedra mechanism (buildMeshFromField, computeSamplingBounds,
// encodeObj/encodeBinaryStl, meshSummary) with the mode-dependent composite
// SDF swapped in, instead of copying that mechanism. S1's own
// buildCloudMesh/behavior is unchanged — same pattern as foam/meshExport.ts.
//
// sourceBounds is mode-dependent (T13 §1):
//  - "carve": computed from the HOST only (computeSamplingBounds(host,
//    hostK)) — the composite surface is always <= the host surface
//    (subtraction only removes material, never adds outside the host's own
//    extent, per opSmoothSubtraction's definition), unchanged from T9.
//  - "fill": the host is never part of the composite (it's a mold, not
//    printed material — field.ts's compositeSdf doc comment), so its bounds
//    would both be irrelevant AND could clip voids that poked past the
//    host's own skin during packing (a manual void, or one placed with
//    penetration>0). Bounds are instead computed directly from the voids'
//    own extent (every void's center ± radius), mirroring skin/meshExport.ts's
//    patch-point-derived padding for the same reason (ring3d patches
//    bulging past the shell band).
//
// This file also owns countConnectedComponents (T13 §1: "反転は分離部品が
// ありうる → 連結成分数を正直に表示"), a self-contained copy of skin/
// meshExport.ts's identical function (union-find over the actual generated
// triangle soup's shared vertices) — kept local rather than imported so this
// Study stays self-contained, same precedent pack already set relative to
// foam and skin set relative to pack.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import {
  buildMeshFromField,
  computeSamplingBounds,
  encodeBinaryStl,
  encodeObj,
  meshSummary as baseMeshSummary,
} from "../cloud-sculpt/meshExport.ts";
import type { Bounds, MeshBuildResult, Triangle } from "../cloud-sculpt/meshExport.ts";
import { compositeSdf, flattenUnits } from "./field.ts";
import type { PackMode, PackUnit } from "./field.ts";
import type { PackHistoryEntry } from "./history.ts";
import { serializeRecipe } from "./history.ts";

export type { MeshBuildResult };

export interface PackMeshOptions {
  resolution: number;
  targetLongestMm: number;
}

export interface PackMeshResult extends MeshBuildResult {
  connectedComponents: number;
}

/** Bounds computed directly from the units' own constituent balls' centers+
 * radii — used for "fill" mode where the host is not part of the printed
 * geometry (see file header). Not just a convenience: a unit placed via
 * manual add or penetration>0 can extend past the host's own extent. T14:
 * still ball-level (not unit outer-sphere) so a cloud unit's bounds hug its
 * actual balls, not its (larger) circumscribing sphere. */
function computeVoidsBounds(units: PackUnit[], roundK: number): Bounds {
  const balls = flattenUnits(units);
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  let maxR = 0;
  let maxLocalK = 0;
  for (const u of units) maxLocalK = Math.max(maxLocalK, u.localK);
  for (const v of balls) {
    maxR = Math.max(maxR, v.r);
    min = { x: Math.min(min.x, v.x - v.r), y: Math.min(min.y, v.y - v.r), z: Math.min(min.z, v.z - v.r) };
    max = { x: Math.max(max.x, v.x + v.r), y: Math.max(max.y, v.y + v.r), z: Math.max(max.z, v.z + v.r) };
  }
  // T14 (found in verification: fill-mode CLOUD units were NOT watertight at
  // res 64 before this): the smooth-min union's zero surface can bulge past
  // the constituent balls' own extents in blend regions (both the within-
  // unit localK and the across-unit roundK add material in crevices), so a
  // zero-margin box clips the isosurface at the boundary and the mesh comes
  // back with open edges. Pad with the same margin formula cloud-sculpt's
  // computeSamplingBounds uses, with (roundK + maxLocalK) standing in for
  // its single k. (Sphere-only fills never triggered this in T13 because a
  // bounds-extreme sphere's outer tangent has no neighbor to blend with —
  // the latent gap only opened once units carried their own local blend.)
  const margin = Math.max(0.25, maxR * 0.25, (roundK + maxLocalK) * 0.75);
  min = { x: min.x - margin, y: min.y - margin, z: min.z - margin };
  max = { x: max.x + margin, y: max.y + margin, z: max.z + margin };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

export function buildPackMesh(
  mode: PackMode,
  host: Ball[],
  hostK: number,
  units: PackUnit[],
  roundK: number,
  options: PackMeshOptions,
): PackMeshResult {
  const sdf = (x: number, y: number, z: number) => compositeSdf(mode, host, hostK, units, roundK, x, y, z);
  if (mode === "fill") {
    if (units.length === 0) {
      throw new Error("虚（詰めた実）が空です。まず詰めてください。");
    }
    const bounds = computeVoidsBounds(units, roundK);
    const result = buildMeshFromField(bounds, sdf, options);
    return { ...result, connectedComponents: countConnectedComponents(result.triangles) };
  }
  if (host.length === 0) {
    throw new Error("実体（ホスト）が空です。まず育ててください。");
  }
  const bounds = computeSamplingBounds(host, hostK);
  const result = buildMeshFromField(bounds, sdf, options);
  return { ...result, connectedComponents: countConnectedComponents(result.triangles) };
}

/**
 * Union-find over the mesh's own vertices (quantized the same way
 * cloud-sculpt's inspectWatertight keys them) to count connected pieces of
 * the ACTUAL generated surface — T13 §1's "反転は分離部品がありうる →
 * 連結成分数を正直に表示". Self-contained copy of skin/meshExport.ts's
 * identical function (see file header for why it isn't imported).
 */
export function countConnectedComponents(triangles: Triangle[]): number {
  if (triangles.length === 0) return 0;
  const idOf = new Map<string, number>();
  const parent: number[] = [];
  const q = 1e5;
  const keyOf = (x: number, y: number, z: number) => `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
  const idFor = (x: number, y: number, z: number): number => {
    const key = keyOf(x, y, z);
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

  for (const tri of triangles) {
    const a = idFor(tri.a.x, tri.a.y, tri.a.z);
    const b = idFor(tri.b.x, tri.b.y, tri.b.z);
    const c = idFor(tri.c.x, tri.c.y, tri.c.z);
    union(a, b);
    union(b, c);
  }

  const roots = new Set<number>();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  return roots.size;
}

export function meshSummary(result: PackMeshResult): string {
  return `${baseMeshSummary(result)} / 部品数 ${result.connectedComponents}`;
}

export function makePackExportBaseName(mode: PackMode): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `yohaku-pack-${mode}-${stamp}`;
}

/**
 * Downloads STL + OBJ + this Study's own recipe JSON. NOT an S1 recipe — T9
 * §4 is explicit that S1's recipe format cannot represent a void, so this
 * bundle carries pack's own format (studyId "pack") instead of pretending to
 * be S1-compatible.
 */
export function downloadPackMeshBundle(
  result: PackMeshResult,
  history: PackHistoryEntry[],
  baseName: string,
): void {
  downloadBlob(new Blob([encodeBinaryStl(result, baseName)], { type: "model/stl" }), `${baseName}.stl`);
  downloadBlob(new Blob([encodeObj(result)], { type: "text/plain" }), `${baseName}.obj`);
  downloadBlob(
    new Blob([serializeRecipe(history)], { type: "application/json" }),
    `${baseName}.recipe.json`,
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

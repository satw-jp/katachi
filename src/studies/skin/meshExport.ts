// ---------------------------------------------------------------------------
// Skin's STL/OBJ export -- reuses cloud-sculpt/meshExport.ts's marching-
// tetrahedra mechanism (buildMeshFromField, computeSamplingBounds,
// encodeObj/encodeBinaryStl, meshSummary) with the mode-dependent composite
// SDF swapped in, instead of copying that mechanism. Same pattern as
// pack/meshExport.ts and foam/meshExport.ts.
//
// This file also owns countConnectedComponents: the AUTHORITATIVE "N個の
//分離した部品" number T10 完了条件3 asks for, computed from the actual
// triangle soup a build produced (union-find over shared vertices, same
// vertex-quantization convention cloud-sculpt's inspectWatertight uses for
// its own edge map) -- not the cheap patch-adjacency proxy field.ts exposes
// for the live-updating gauge panel. See field.ts's estimatePatchComponents
// doc comment for why the two can disagree and which one this Study's
// README cites for the actual claim.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import {
  buildMeshFromField,
  computeSamplingBounds,
  encodeBinaryStl,
  encodeObj,
  meshSummary as baseMeshSummary,
} from "../cloud-sculpt/meshExport.ts";
import type { MeshBuildResult, Triangle } from "../cloud-sculpt/meshExport.ts";
import { compositeSdf } from "./field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { SkinHistoryEntry } from "./history.ts";
import { serializeRecipe } from "./history.ts";

export type { MeshBuildResult };

export interface SkinMeshOptions {
  resolution: number;
  targetLongestMm: number;
}

export interface SkinMeshResult extends MeshBuildResult {
  connectedComponents: number;
}

export function buildSkinMesh(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  options: SkinMeshOptions,
): SkinMeshResult {
  if (host.length === 0) {
    throw new Error("実体（ホスト）が空です。まず育ててください。");
  }
  if (mode === "plate" && patches.length === 0) {
    throw new Error("プレート版は虚（パッチ）が無いと何も残りません。まず詰めてください。");
  }
  // sourceBounds from the host alone: the shell is always <= the host's own
  // extent (|hostSdf| < thickness/2 never reaches further out than the
  // host surface plus half the shell thickness), and both booleans (∩ / −)
  // only ever remove material from the shell, never add outside it --
  // mirrors pack/meshExport.ts's identical reasoning for host vs. void.
  const bounds = computeSamplingBounds(host, hostK);
  // Pad the host's own bounds so the sampling grid covers everything that
  // can actually appear: the shell's half-thickness on the outside (T10's
  // original reasoning) PLUS, new for T11, every patch point's own extent --
  // 立体リング (ring3d) patches are full 3D objects that only touch the
  // shell band at one circle (field.ts's compositeSdf doc comment) and can
  // bulge well past thickness/2, so a fixed thickness-only pad would clip
  // them. Computed directly from the actual patch geometry rather than a
  // guessed formula (exact, and a strict superset of T10's coin-only case,
  // so this is not a behavior change when every patch is a coin).
  let min = { x: bounds.min.x - thickness / 2, y: bounds.min.y - thickness / 2, z: bounds.min.z - thickness / 2 };
  let max = { x: bounds.max.x + thickness / 2, y: bounds.max.y + thickness / 2, z: bounds.max.z + thickness / 2 };
  for (const patch of patches) {
    for (const pt of patch.points) {
      min = { x: Math.min(min.x, pt.x - pt.r), y: Math.min(min.y, pt.y - pt.r), z: Math.min(min.z, pt.z - pt.r) };
      max = { x: Math.max(max.x, pt.x + pt.r), y: Math.max(max.y, pt.y + pt.r), z: Math.max(max.z, pt.z + pt.r) };
    }
  }
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const padded = {
    min,
    max,
    size,
    longest: Math.max(size.x, size.y, size.z),
  };
  const sdf = (x: number, y: number, z: number) => compositeSdf(mode, host, hostK, thickness, patches, roundK, x, y, z);
  const result = buildMeshFromField(padded, sdf, options);
  return { ...result, connectedComponents: countConnectedComponents(result.triangles) };
}

/**
 * Union-find over the mesh's own vertices (quantized the same way
 * inspectWatertight keys them) to count connected pieces of the ACTUAL
 * generated surface. This is what T10 完了条件3's "N 個の分離した部品"
 * cites -- not a topology guess, a count taken from the exported geometry
 * itself. O(triangles) with near-constant-time union-find.
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

export function meshSummary(result: SkinMeshResult): string {
  return `${baseMeshSummary(result)} / 部品数 ${result.connectedComponents}`;
}

export function makeSkinExportBaseName(mode: SkinMode): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `yohaku-skin-${mode}-${stamp}`;
}

/**
 * Downloads STL + OBJ + this Study's own recipe JSON. NOT an S1 or pack
 * recipe -- patches have no representation in either format, so this
 * bundle carries skin's own format (studyId "skin") instead.
 */
export function downloadSkinMeshBundle(
  result: SkinMeshResult,
  history: SkinHistoryEntry[],
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

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
  computeConnectedComponentsWithKey,
  computeSamplingBounds,
  encodeBinaryStl,
  encodeObj,
  meshSummary as baseMeshSummary,
} from "../cloud-sculpt/meshExport.ts";
import type { Bounds, MeshBuildResult, MeshVertex, Triangle } from "../cloud-sculpt/meshExport.ts";
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

/**
 * The sampling bounds every skin mesh build (full composite, or a partition
 * side -- see partition.ts) must use: the host's own bounds (shell never
 * reaches further out than host surface + thickness/2, mirrors pack/
 * meshExport.ts's host-vs-void reasoning) padded by every patch point's own
 * extent (立体リング patches can bulge well past thickness/2 -- T11's fix,
 * see prior inline comment history). Factored out of buildSkinMesh so
 * partition.ts's two per-side builds sample the EXACT same grid as the
 * original composite would, which is required for the shared A/B boundary
 * to close (T13 §3's "同一sampling bounds・同一resolutionでメッシュ化").
 */
export function computeSkinSamplingBounds(host: Ball[], hostK: number, thickness: number, patches: Patch[]): Bounds {
  const bounds = computeSamplingBounds(host, hostK);
  let min = { x: bounds.min.x - thickness / 2, y: bounds.min.y - thickness / 2, z: bounds.min.z - thickness / 2 };
  let max = { x: bounds.max.x + thickness / 2, y: bounds.max.y + thickness / 2, z: bounds.max.z + thickness / 2 };
  for (const patch of patches) {
    for (const pt of patch.points) {
      min = { x: Math.min(min.x, pt.x - pt.r), y: Math.min(min.y, pt.y - pt.r), z: Math.min(min.z, pt.z - pt.r) };
      max = { x: Math.max(max.x, pt.x + pt.r), y: Math.max(max.y, pt.y + pt.r), z: Math.max(max.z, pt.z + pt.r) };
    }
  }
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

export function buildSkinMesh(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  options: SkinMeshOptions,
  coinBulge: number,
): SkinMeshResult {
  if (host.length === 0) {
    throw new Error("実体（ホスト）が空です。まず育ててください。");
  }
  if (mode === "plate" && patches.length === 0) {
    throw new Error("プレート版は虚（パッチ）が無いと何も残りません。まず詰めてください。");
  }
  const padded = computeSkinSamplingBounds(host, hostK, thickness, patches);
  const sdf = (x: number, y: number, z: number) =>
    compositeSdf(mode, host, hostK, thickness, patches, roundK, x, y, z, coinBulge);
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
const CONNECTED_COMPONENTS_QUANTUM = 1e5;

export function countConnectedComponents(triangles: Triangle[]): number {
  const keyOf = (v: MeshVertex) =>
    `${Math.round(v.x * CONNECTED_COMPONENTS_QUANTUM)},${Math.round(v.y * CONNECTED_COMPONENTS_QUANTUM)},${Math.round(v.z * CONNECTED_COMPONENTS_QUANTUM)}`;
  return computeConnectedComponentsWithKey(triangles, keyOf);
}

export function meshSummary(result: SkinMeshResult): string {
  return `${baseMeshSummary(result)} / 部品数 ${result.connectedComponents}`;
}

/** T14: coinBulge>0 gets folded into the filename itself (0 keeps the old
 * name unchanged, per instruction §3.3 "0は従来名を維持してよい") so a
 * candidate's STL/OBJ/recipe files never collide with -- or get silently
 * confused with -- the value-0 baseline or a different candidate, without
 * relying on opening the recipe JSON to tell them apart. */
export function makeSkinExportBaseName(mode: SkinMode, coinBulge: number): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const bulgeSuffix = coinBulge > 0 ? `-coin-bulge-${coinBulge.toFixed(3).replace(".", "p")}` : "";
  return `yohaku-skin-${mode}${bulgeSuffix}-${stamp}`;
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

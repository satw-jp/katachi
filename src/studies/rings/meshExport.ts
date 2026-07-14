// ---------------------------------------------------------------------------
// Exit door (T8 §4 "既存資産との接続"): flatten the ring balls into an S1
// (cloud-sculpt) recipe — group information is intentionally dropped, per
// the task doc ("グループ情報は失われてよい — 正本の互換性が優先"). Once in
// S1 form, STL/MPM/foam can all open it unmodified.
//
// The mesh build itself (marching-tetrahedra over the shared fieldSdf,
// watertight check) is not reimplemented — it's the exact same function
// cloud-sculpt and foam already use, imported directly.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import type { HistoryEntry as S1HistoryEntry } from "../cloud-sculpt/history.ts";
import { serializeRecipe as serializeS1Recipe } from "../cloud-sculpt/history.ts";
import type { MeshBuildResult } from "../cloud-sculpt/meshExport.ts";
import {
  buildCloudMesh,
  encodeBinaryStl,
  encodeObj,
  meshSummary as s1MeshSummary,
} from "../cloud-sculpt/meshExport.ts";

/** Turn the current ball list into a self-sufficient S1 recipe: one addBall op per ball. */
export function toS1Entries(balls: Ball[]): S1HistoryEntry[] {
  const now = Date.now();
  return balls.map(
    (b): S1HistoryEntry => ({
      t: now,
      op: "addBall",
      args: { id: b.id, x: b.x, y: b.y, z: b.z, r: b.r },
    }),
  );
}

export function downloadS1Recipe(balls: Ball[], baseName = makeExportBaseName()): void {
  const entries = toS1Entries(balls);
  const json = serializeS1Recipe(entries);
  downloadBlob(new Blob([json], { type: "application/json" }), `${baseName}.s1-recipe.json`);
}

export interface RingsMeshUiOptions {
  resolution: number;
  targetLongestMm: number;
}

export function buildRingsMesh(
  balls: Ball[],
  k: number,
  options: RingsMeshUiOptions,
): MeshBuildResult {
  // Delegates to cloud-sculpt's own field->mesh pipeline (same fieldSdf,
  // same marching-tetrahedra + watertight check) — rings are, at the mesh
  // level, just a ball list like any S1 cloud.
  return buildCloudMesh(balls, k, options);
}

export function meshSummary(result: MeshBuildResult): string {
  return s1MeshSummary(result);
}

export function makeExportBaseName(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `yohaku-rings-${stamp}`;
}

export function downloadRingsMeshBundle(
  result: MeshBuildResult,
  balls: Ball[],
  baseName = makeExportBaseName(),
): void {
  downloadBlob(new Blob([encodeBinaryStl(result, baseName)], { type: "model/stl" }), `${baseName}.stl`);
  downloadBlob(new Blob([encodeObj(result)], { type: "text/plain" }), `${baseName}.obj`);
  // Pair with the S1-openable recipe (not the rings-native one) so the mesh
  // and the recipe you'd feed back into S1 always travel together.
  const entries = toS1Entries(balls);
  downloadBlob(
    new Blob([serializeS1Recipe(entries)], { type: "application/json" }),
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

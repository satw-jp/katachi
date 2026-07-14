// ---------------------------------------------------------------------------
// Foam's STL/OBJ export — reuses cloud-sculpt/meshExport.ts's marching-
// tetrahedra mechanism (buildMeshFromField, computeSamplingBounds,
// encodeObj/encodeBinaryStl, inspectWatertight, meshSummary) with the foam
// SDF swapped in, instead of copying that mechanism. S1's own
// buildCloudMesh/behavior is unchanged (see the comment there).
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import {
  buildMeshFromField,
  computeSamplingBounds,
  encodeBinaryStl,
  encodeObj,
  meshSummary,
} from "../cloud-sculpt/meshExport.ts";
import type { MeshBuildResult } from "../cloud-sculpt/meshExport.ts";
import { estimateCloudScale, foamSdf } from "./cell.ts";
import type { FoamParams } from "./cell.ts";
import type { FoamHistoryEntry } from "./history.ts";
import { serializeFoamRecipe } from "./history.ts";

export { meshSummary };
export type { MeshBuildResult };

export interface FoamMeshOptions {
  resolution: number;
  targetLongestMm: number;
}

export function buildFoamMesh(
  balls: Ball[],
  k: number,
  foamParams: FoamParams,
  options: FoamMeshOptions,
): MeshBuildResult {
  if (balls.length === 0) {
    throw new Error("雲が空です。まず球を育ててください。");
  }
  const bounds = computeSamplingBounds(balls, k);
  const cloudScale = estimateCloudScale(balls);
  const sdf = (x: number, y: number, z: number) =>
    foamSdf(balls, k, foamParams.opening, foamParams.thickness, cloudScale, x, y, z);
  return buildMeshFromField(bounds, sdf, options);
}

export function makeFoamExportBaseName(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `yohaku-foam-${stamp}`;
}

export function downloadFoamMeshBundle(
  result: MeshBuildResult,
  history: FoamHistoryEntry[],
  baseName = makeFoamExportBaseName(),
): void {
  downloadBlob(new Blob([encodeBinaryStl(result, baseName)], { type: "model/stl" }), `${baseName}.stl`);
  downloadBlob(new Blob([encodeObj(result)], { type: "text/plain" }), `${baseName}.obj`);
  downloadBlob(
    new Blob([serializeFoamRecipe(history)], { type: "application/json" }),
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

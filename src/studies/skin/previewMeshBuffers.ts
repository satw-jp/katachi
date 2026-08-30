import type { Triangle } from "../cloud-sculpt/meshExport.ts";

export interface PreviewMeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
}

/** Build flat GPU normals directly from an exact triangle-soup buffer.
 * Stage 6 already owns these Float32 positions after final meshing, so this
 * keeps its visual confirmation exact without rebuilding or resampling the
 * artwork on the main browser thread. */
export function flatNormalsFromTriangleSoup(positions: Float32Array): Float32Array {
  if (positions.length % 9 !== 0) throw new Error("mesh position buffer is not triangular");
  const normals = new Float32Array(positions.length);
  for (let offset = 0; offset < positions.length; offset += 9) {
    const abx = positions[offset + 3] - positions[offset];
    const aby = positions[offset + 4] - positions[offset + 1];
    const abz = positions[offset + 5] - positions[offset + 2];
    const acx = positions[offset + 6] - positions[offset];
    const acy = positions[offset + 7] - positions[offset + 1];
    const acz = positions[offset + 8] - positions[offset + 2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const magnitude = Math.hypot(nx, ny, nz) || 1;
    nx /= magnitude;
    ny /= magnitude;
    nz /= magnitude;
    for (let vertex = 0; vertex < 3; vertex++) {
      const normalOffset = offset + vertex * 3;
      normals[normalOffset] = nx;
      normals[normalOffset + 1] = ny;
      normals[normalOffset + 2] = nz;
    }
  }
  return normals;
}

export type PreviewSelectionView = "raymarch" | "beads" | "mesh";
export type InternalObservationMode = "normal" | "ghostSkin" | "internalOnly";

export interface SkinLayerVisibility {
  raymarch: boolean;
  overlay: boolean;
  hostBeads: boolean;
  patchBeads: boolean;
  internalGraph: boolean;
  surfaceDecorations: boolean;
}

/** Display-only layer separation for observing an internal graph. It never
 * changes the field, mesh export, recipe, or generated Surface patches. */
export function deriveSkinLayerVisibility(
  viewMode: PreviewSelectionView,
  observationMode: InternalObservationMode,
  denseSampleActive = false,
): SkinLayerVisibility {
  const surfaceVisible = !denseSampleActive && observationMode !== "internalOnly";
  return {
    raymarch: surfaceVisible && viewMode === "raymarch",
    overlay: surfaceVisible && viewMode === "mesh",
    hostBeads: surfaceVisible && viewMode === "beads",
    patchBeads: surfaceVisible && viewMode === "beads",
    internalGraph: !denseSampleActive && (viewMode !== "mesh" || observationMode !== "normal"),
    surfaceDecorations: surfaceVisible,
  };
}

/** A non-empty Dry Web inside an opaque mesh would appear to vanish even
 * though it is still part of the mesh request. Promote only that transition
 * to the existing ghost-SKIN observation mode; explicit ghost/internal-only
 * choices and empty graphs are left untouched. */
export function observationModeKeepingInternalGraphVisible(
  viewMode: PreviewSelectionView,
  observationMode: InternalObservationMode,
  internalEdgeCount: number,
): InternalObservationMode {
  return viewMode === "mesh" && observationMode === "normal" && internalEdgeCount > 0
    ? "ghostSkin"
    : observationMode;
}

/** Selected source-bead wire presentation by viewport mode. Bead view keeps
 * the established strong 1.2x selection outline; mesh view uses an almost
 * exact envelope with a small lift to prevent the wire from z-fighting with
 * the generated surface. Raymarch has its own shader selection cue. */
export function selectedBeadWireScale(viewMode: PreviewSelectionView): number | null {
  if (viewMode === "beads") return 1.2;
  if (viewMode === "mesh") return 1.025;
  return null;
}

/** Pack triangle objects into transferable GPU-ready buffers in the Worker.
 * Flat normals are intentional for the low-resolution authoring preview; the
 * high-resolution export mesh remains untouched. */
export function packPreviewMeshBuffers(triangles: Triangle[]): PreviewMeshBuffers {
  const positions = new Float32Array(triangles.length * 9);
  const normals = new Float32Array(triangles.length * 9);
  let cursor = 0;
  for (const triangle of triangles) {
    const abx = triangle.b.x - triangle.a.x;
    const aby = triangle.b.y - triangle.a.y;
    const abz = triangle.b.z - triangle.a.z;
    const acx = triangle.c.x - triangle.a.x;
    const acy = triangle.c.y - triangle.a.y;
    const acz = triangle.c.z - triangle.a.z;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[cursor] = point.x;
      positions[cursor + 1] = point.y;
      positions[cursor + 2] = point.z;
      normals[cursor] = nx;
      normals[cursor + 1] = ny;
      normals[cursor + 2] = nz;
      cursor += 3;
    }
  }
  return { positions, normals };
}

export function choosePreviewMeshResolution(requestedResolution: number, patchPointCount: number): number {
  const requested = Number.isFinite(requestedResolution) ? requestedResolution : 96;
  const cap = patchPointCount > 4_000 ? 32
    : patchPointCount > 2_000 ? 36
    : patchPointCount > 1_000 ? 40
    : patchPointCount > 500 ? 44
    : 48;
  return Math.max(28, Math.min(cap, Math.round(requested * 0.5)));
}

/** The coarse stage protects interaction latency; the final stage restores
 * the exact author-selected screen resolution in the Worker. */
export function chooseProgressivePreviewResolutions(
  requestedResolution: number,
  patchPointCount: number,
): { coarse: number; final: number } {
  const requested = Number.isFinite(requestedResolution) ? Math.max(32, Math.min(224, Math.round(requestedResolution))) : 96;
  const coarse = choosePreviewMeshResolution(requested, patchPointCount);
  return { coarse, final: Math.max(coarse, requested) };
}

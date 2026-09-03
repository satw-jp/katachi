import {
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  type MeshBuildResult,
  type SavedStlTopologyReport,
} from "../../cloud-sculpt/meshExport.ts";

export interface SkinRebuildExportDegenerateCanonicalization {
  mesh: MeshBuildResult;
  canonicalizedSavedDegenerateTriangleCount: number;
  before: SavedStlTopologyReport;
  after: SavedStlTopologyReport;
}

/**
 * Canonicalize only faces that collapse in the exact Float32 coordinates
 * written to STL. This boundary is opt-in for SKIN REBUILD export: it never
 * moves or welds a vertex, and the surviving saved-coordinate topology must
 * be closed and finite before the result can be used by the print gate.
 *
 * `removedSavedDegenerateTriangleCount` may already be populated when the
 * bounded SKIN REBUILD repair ran before this export-local boundary. In that
 * case the count is evidence that the exact collapsed faces were removed;
 * the post-repair topology check below is still mandatory before clearing the
 * gate-facing counter.
 */
export function canonicalizeSkinRebuildExportDegenerates(
  result: MeshBuildResult,
  expectedCount = 2,
): SkinRebuildExportDegenerateCanonicalization {
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    throw new Error("SKIN REBUILD export degenerate canonicalization requires a non-negative integer count");
  }
  const before = inspectSavedStlTopology(result.triangles, result.scaleMmPerUnit);
  if (before.nonFiniteTriangleCount > 0) {
    throw new Error(`export-local degenerate canonicalization refuses non-finite STL coordinates (${before.nonFiniteTriangleCount})`);
  }
  const reported = result.removedSavedDegenerateTriangleCount ?? 0;
  if (!Number.isSafeInteger(reported) || reported < 0) {
    throw new Error("export-local degenerate canonicalization received an invalid saved-degenerate count");
  }
  const canonicalizedCount = before.degenerateTriangleCount > 0
    ? before.degenerateTriangleCount
    : reported;
  if (canonicalizedCount > 0 && canonicalizedCount !== expectedCount) {
    throw new Error(`export-local canonicalization expected exactly ${expectedCount} fully degenerate faces, found ${canonicalizedCount}`);
  }

  // orientMeshForSavedStl drops only exact saved-coordinate zero-area faces
  // and otherwise preserves every vertex position. It also makes the
  // surviving closed surface deterministic for the STL bytes.
  const oriented = orientMeshForSavedStl({
    ...result,
    removedSavedDegenerateTriangleCount: 0,
  });
  const after = inspectSavedStlTopology(oriented.triangles, oriented.scaleMmPerUnit);
  if (!after.ok || after.connectedComponents !== before.connectedComponents) {
    throw new Error(
      `export-local canonicalization changed saved STL topology (closed=${after.closed}, winding=${after.windingConsistent}, degenerate=${after.degenerateTriangleCount}, nonFinite=${after.nonFiniteTriangleCount}, components=${after.connectedComponents}, open=${after.openEdges}, nonManifold=${after.nonManifoldEdges})`,
    );
  }
  return {
    mesh: { ...oriented, removedSavedDegenerateTriangleCount: 0 },
    canonicalizedSavedDegenerateTriangleCount: canonicalizedCount,
    before,
    after,
  };
}

import {
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  type MeshBuildResult,
  type MeshVertex,
  type SavedStlTopologyReport,
} from "../../cloud-sculpt/meshExport.ts";

export type SkinRebuildArtifactExportFormat = "3MF" | "BODY STL" | "PRINT_SUPPORT STL" | "OBJ" | "report JSON";

export interface SkinRebuildArtifactExportFormatSelection {
  threeMf: boolean;
  bodyStl: boolean;
  supportStl: boolean;
  obj: boolean;
  report: boolean;
}

export interface SkinRebuildArtifactExportAvailabilityInput {
  hasCurrentProject: boolean;
  bodyPositions: Float32Array | null;
  bodyGenerationAvailable?: boolean;
  supportPositions?: Float32Array | null;
  supportRequested: boolean;
  supportMeshable: boolean | null;
  selectedFormats: SkinRebuildArtifactExportFormatSelection;
  bodySource?: string;
  supportSource?: string;
  warnings?: readonly string[];
}

export interface SkinRebuildArtifactExportAvailability {
  canExportArtifact: boolean;
  technicalBlockReason: string | null;
  warnings: string[];
  bodySource: string;
  supportSource: string;
  selectedFormats: SkinRebuildArtifactExportFormat[];
  bodyTriangleCount: number;
  supportTriangleCount: number;
}

export interface SkinRebuildArtifactDegenerateCanonicalization {
  positions: Float32Array;
  removedFaceIndices: number[];
  inputTriangleCount: number;
  outputTriangleCount: number;
}

export interface SkinRebuildArtifactMeshCanonicalization {
  mesh: MeshBuildResult;
  removedFaceIndices: number[];
  before: SavedStlTopologyReport;
  after: SavedStlTopologyReport;
}

function selectedFormats(input: SkinRebuildArtifactExportFormatSelection): SkinRebuildArtifactExportFormat[] {
  return [
    input.threeMf ? "3MF" : "",
    input.bodyStl ? "BODY STL" : "",
    input.supportStl ? "PRINT_SUPPORT STL" : "",
    input.obj ? "OBJ" : "",
    input.report ? "report JSON" : "",
  ].filter((format): format is SkinRebuildArtifactExportFormat => format !== "");
}

function exactSavedVertex(value: MeshVertex, scaleMmPerUnit: number): MeshVertex {
  return {
    x: Math.fround(value.x * scaleMmPerUnit),
    y: Math.fround(value.y * scaleMmPerUnit),
    z: Math.fround(value.z * scaleMmPerUnit),
  };
}

function savedTriangleIsFinite(a: MeshVertex, b: MeshVertex, c: MeshVertex): boolean {
  return [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(Number.isFinite);
}

function savedTriangleHasArea(a: MeshVertex, b: MeshVertex, c: MeshVertex): boolean {
  if (`${a.x},${a.y},${a.z}` === `${b.x},${b.y},${b.z}`
    || `${b.x},${b.y},${b.z}` === `${c.x},${c.y},${c.z}`
    || `${c.x},${c.y},${c.z}` === `${a.x},${a.y},${a.z}`) return false;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  return aby * acz - abz * acy !== 0
    || abz * acx - abx * acz !== 0
    || abx * acy - aby * acx !== 0;
}

/**
 * Export-only canonicalization at the exact Float32 coordinates written to
 * STL/3MF. It removes only zero-area faces and never welds, moves, smooths,
 * decimates, or repairs topology.
 */
export function canonicalizeSkinRebuildArtifactPositions(
  positions: Float32Array,
): SkinRebuildArtifactDegenerateCanonicalization {
  if (positions.length % 9 !== 0) throw new Error("triangle buffer is structurally broken: length is not divisible by 9");
  const output: number[] = [];
  const removedFaceIndices: number[] = [];
  for (let offset = 0, face = 0; offset < positions.length; offset += 9, face++) {
    const a = { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
    const b = { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] };
    const c = { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] };
    if (!savedTriangleIsFinite(a, b, c)) throw new Error(`triangle buffer contains non-finite BODY coordinates at face ${face}`);
    if (!savedTriangleHasArea(a, b, c)) {
      removedFaceIndices.push(face);
      continue;
    }
    output.push(...positions.subarray(offset, offset + 9));
  }
  return {
    positions: Float32Array.from(output),
    removedFaceIndices,
    inputTriangleCount: positions.length / 9,
    outputTriangleCount: output.length / 9,
  };
}

/** Apply the same exact saved-coordinate rule to a MeshBuildResult before a
 * serializer gets its hands on it, while retaining topology evidence. */
export function canonicalizeSkinRebuildArtifactMesh(
  result: MeshBuildResult,
): SkinRebuildArtifactMeshCanonicalization {
  if (!(result.scaleMmPerUnit > 0) || !Number.isFinite(result.scaleMmPerUnit)) {
    throw new Error("artifact export mesh scale is invalid");
  }
  const before = inspectSavedStlTopology(result.triangles, result.scaleMmPerUnit);
  if (before.nonFiniteTriangleCount > 0) {
    throw new Error(`artifact export mesh contains non-finite coordinates (${before.nonFiniteTriangleCount} faces)`);
  }
  const removedFaceIndices: number[] = [];
  const survivors = result.triangles.filter((triangle, face) => {
    const a = exactSavedVertex(triangle.a, result.scaleMmPerUnit);
    const b = exactSavedVertex(triangle.b, result.scaleMmPerUnit);
    const c = exactSavedVertex(triangle.c, result.scaleMmPerUnit);
    if (!savedTriangleHasArea(a, b, c)) {
      removedFaceIndices.push(face);
      return false;
    }
    return true;
  });
  const oriented = orientMeshForSavedStl({
    ...result,
    triangles: survivors,
    removedSavedDegenerateTriangleCount: 0,
  });
  const after = inspectSavedStlTopology(oriented.triangles, oriented.scaleMmPerUnit);
  return {
    mesh: { ...oriented, removedSavedDegenerateTriangleCount: 0 },
    removedFaceIndices,
    before,
    after,
  };
}

function hasTechnicalBodyBufferError(positions: Float32Array | null): string | null {
  if (!positions) return "現在のBODY geometryがありません";
  if (positions.length === 0) return "現在のBODY triangle bufferが空です";
  if (positions.length % 9 !== 0) return "現在のBODY triangle bufferの構造が壊れています";
  try {
    const canonicalized = canonicalizeSkinRebuildArtifactPositions(positions);
    if (canonicalized.outputTriangleCount === 0) return "canonicalization後に有限なBODY triangleがありません";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

export function evaluateSkinRebuildArtifactExportAvailability(
  input: SkinRebuildArtifactExportAvailabilityInput,
): SkinRebuildArtifactExportAvailability {
  const warnings = [...(input.warnings ?? [])];
  const formats = selectedFormats(input.selectedFormats);
  const bodyError = input.hasCurrentProject
    ? input.bodyPositions || !input.bodyGenerationAvailable
      ? hasTechnicalBodyBufferError(input.bodyPositions)
      : null
    : "現在のSKIN project / BODY sourceがありません";
  if (input.supportRequested && input.supportMeshable === false) {
    warnings.push("現在のSupportはmesh化できません。BODY-onlyで書き出してください");
  }
  if (!formats.length) {
    return {
      canExportArtifact: false,
      technicalBlockReason: "少なくとも1つのArtifact Export形式を選択してください",
      warnings,
      bodySource: input.bodySource ?? "none",
      supportSource: input.supportSource ?? "none",
      selectedFormats: formats,
      bodyTriangleCount: Math.floor((input.bodyPositions?.length ?? 0) / 9),
      supportTriangleCount: Math.floor((input.supportPositions?.length ?? 0) / 9),
    };
  }
  if (bodyError) {
    return {
      canExportArtifact: false,
      technicalBlockReason: bodyError,
      warnings,
      bodySource: input.bodySource ?? "none",
      supportSource: input.supportSource ?? "none",
      selectedFormats: formats,
      bodyTriangleCount: Math.floor((input.bodyPositions?.length ?? 0) / 9),
      supportTriangleCount: Math.floor((input.supportPositions?.length ?? 0) / 9),
    };
  }
  const supportOnlyRequested = input.supportRequested
    && input.supportMeshable === false
    && !input.selectedFormats.bodyStl
    && !input.selectedFormats.obj
    && !input.selectedFormats.report;
  return {
    canExportArtifact: !supportOnlyRequested,
    technicalBlockReason: supportOnlyRequested ? "現在のSupportを選択形式へmesh化できません。BODY STL / OBJ / report JSONを選択してください" : null,
    warnings,
    bodySource: input.bodySource ?? "stage6-cache",
    supportSource: input.supportSource ?? (input.supportRequested ? "current-renderer" : "none"),
    selectedFormats: formats,
    bodyTriangleCount: Math.floor((input.bodyPositions?.length ?? 0) / 9),
    supportTriangleCount: Math.floor((input.supportPositions?.length ?? 0) / 9),
  };
}

export interface SkinRebuildArtifactExportReportInput {
  generatedAt: string;
  appCommit: string;
  projectFingerprint: string;
  bodyFingerprint: string;
  supportFingerprint: string | null;
  bodySource: string;
  supportSource: string;
  formats: readonly SkinRebuildArtifactExportFormat[];
  transforms: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  warnings: readonly string[];
  removedDegenerates: Record<string, unknown>;
  bounds: Record<string, unknown>;
  unresolved: number | null;
  acceptedBodyCollision: number | null;
  printApproval: false;
}

export function serializeSkinRebuildArtifactExportReport(
  input: SkinRebuildArtifactExportReportInput,
): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}

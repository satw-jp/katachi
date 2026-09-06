import { fieldSdf } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds, type MeshBuildResult } from "../cloud-sculpt/meshExport.ts";
import { sha256Hex, sha256HexSync } from "../../lib/hash.ts";
import {
  createFinishedSkinBodySdfEvaluator,
} from "../skin/meshExport.ts";
import {
  SKIN_REBUILD_FKEI_SCHEMA,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
  type SkinRebuildFkeiDocument,
} from "../skin/rebuild/fkei.ts";
import {
  DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY,
  buildSkinProductionV0FromProject,
  type SkinProductionV0RuntimeBuild,
} from "../skin/rebuild/productionV0.ts";
import type { SkinRebuildProject } from "../skin/rebuild/model.ts";
import { analyzeVoid, type VoidAnalysisResult } from "./voidAnalysis.ts";

export interface ViewerArtifact {
  filename: string;
  schema: typeof SKIN_REBUILD_FKEI_SCHEMA;
  document: SkinRebuildFkeiDocument;
  sourceSha256: string;
  canonicalSerialization: string;
  canonicalHash: string;
  sourceProject: SkinRebuildProject;
  runtime: SkinProductionV0RuntimeBuild;
  surface: MeshBuildResult;
  hostBounds: MeshBuildResult["sourceBounds"];
  voidAnalysis: VoidAnalysisResult;
  finalBodyExtendsOutsideHost: boolean;
}

export async function loadViewerArtifact(file: File): Promise<ViewerArtifact> {
  const bytes = await file.arrayBuffer();
  const sourceText = new TextDecoder().decode(bytes);
  const sourceSha256 = await sha256Hex(bytes);
  return buildViewerArtifact(sourceText, file.name, sourceSha256);
}

/** Use the canonical SKIN REBUILD parser first; this function intentionally
 * does not accept arbitrary JSON or reconstruct a project from loose fields. */
export function buildViewerArtifact(
  sourceText: string,
  filename: string,
  sourceSha256 = sha256HexSync(sourceText),
): ViewerArtifact {
  const document = parseSkinRebuildFkei(sourceText);
  const sourceProject = projectFromSkinRebuildFkei(document);
  const runtime = buildSkinProductionV0FromProject(sourceProject);
  const surface = runtime.analysisMesh;
  const hostBounds = computeSamplingBounds(runtime.project.base.host, runtime.project.base.hostK);
  const bodySdf = createFinishedSkinBodySdfEvaluator({
    mode: "plate",
    host: runtime.project.base.host,
    hostK: runtime.project.base.hostK,
    thickness: runtime.project.settings.surfaceThickness,
    patches: runtime.project.patterns,
    roundK: runtime.project.settings.roundK,
    coinBulge: 0,
    quadMeshJoinWidth: DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY.quadMeshJoinWidthSource,
    internalGraph: runtime.project.finalGraph,
  });
  const voidAnalysis = analyzeVoid({
    bounds: hostBounds,
    insideHost: (x, y, z) => fieldSdf(runtime.project.base.host, runtime.project.base.hostK, x, y, z) <= 0,
    insideFinalBody: (x, y, z) => bodySdf(x, y, z) <= 0,
  });
  let finalBodyExtendsOutsideHost = false;
  for (const triangle of surface.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      if (fieldSdf(runtime.project.base.host, runtime.project.base.hostK, point.x, point.y, point.z) > 1e-7) {
        finalBodyExtendsOutsideHost = true;
        break;
      }
    }
    if (finalBodyExtendsOutsideHost) break;
  }
  const canonicalSerialization = serializeSkinRebuildFkei(document);
  return {
    filename,
    schema: SKIN_REBUILD_FKEI_SCHEMA,
    document,
    sourceSha256,
    canonicalSerialization,
    canonicalHash: sha256HexSync(canonicalSerialization),
    sourceProject,
    runtime,
    surface,
    hostBounds,
    voidAnalysis,
    finalBodyExtendsOutsideHost,
  };
}

export function verifyReadOnlyIdentity(artifact: ViewerArtifact): boolean {
  const serialization = serializeSkinRebuildFkei(artifact.document);
  return serialization === artifact.canonicalSerialization
    && sha256HexSync(serialization) === artifact.canonicalHash;
}

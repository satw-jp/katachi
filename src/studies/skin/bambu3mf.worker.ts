/// <reference lib="webworker" />

import {
  buildBambu3mf,
  parseBinaryStlPositions,
  scaleTriangleSoup,
} from "./bambu3mf.ts";
import { buildExternalPerimeterScaffold } from "./externalScaffold.ts";
import { filterSupportEnforcerReachability } from "./supportReachability.ts";
import type { Bambu3mfExportRequest, Bambu3mfProgressStage, Bambu3mfWorkerMessage, SupportReachabilityStats } from "./bambu3mfWorkerProtocol.ts";
import { buildSkinMesh, countConnectedComponents, reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import { buildParallelMeshBuffers } from "./parallelMeshBuffers.ts";
import type { PreviewMeshRequest } from "./previewMeshWorkerProtocol.ts";
import { inspectFusedScaffoldPlateAnchoring, normalizeFusedScaffoldPlatePlane, type SkinScaffoldPillar } from "./scaffoldFusion.ts";
import { buildMeshResultFromTriangles, inspectSavedStlTopology, orientMeshForSavedStl, summarizeSavedStlComponents } from "../cloud-sculpt/meshExport.ts";
import type { Triangle } from "../cloud-sculpt/meshExport.ts";

function trianglesFromPositions(positions: Float32Array): Triangle[] {
  if (positions.length % 9 !== 0) throw new Error("parallel mesh position buffer is not triangular");
  const triangles: Triangle[] = new Array(positions.length / 9);
  for (let i = 0, face = 0; i < positions.length; i += 9, face++) {
    triangles[face] = {
      a: { x: positions[i], y: positions[i + 1], z: positions[i + 2] },
      b: { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] },
      c: { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] },
    };
  }
  return triangles;
}

self.onmessage = async (event: MessageEvent<Bambu3mfExportRequest>): Promise<void> => {
  const request = event.data;
  if (request.type !== "export") return;
  const started = performance.now();
  const postProgress = (stageIndex: number, stage: Bambu3mfProgressStage, detail?: string): void => {
    const message: Bambu3mfWorkerMessage = {
      type: "progress", requestId: request.requestId, generation: request.generation,
      stage, stageIndex, stageCount: 7, detail, elapsedMs: performance.now() - started,
    };
    self.postMessage(message);
  };
  try {
    postProgress(1, "入力を準備");
    const finalSurfaceMm = scaleTriangleSoup(request.finalSurfacePositions, request.scaleMmPerUnit);
    const bodyPositionsMm = request.bodyStl
      ? parseBinaryStlPositions(request.bodyStl)
      : request.bodyPositions
        ? scaleTriangleSoup(request.bodyPositions, request.scaleMmPerUnit)
        : finalSurfaceMm;
    if (!bodyPositionsMm) throw new Error("BODY meshを受け取れませんでした");
    const dangerMm = scaleTriangleSoup(request.dangerousPositions, request.scaleMmPerUnit);
    postProgress(2, "危険面の到達性を判定", "候補" + (dangerMm.length / 9).toLocaleString() + "面");
    const reachability = filterSupportEnforcerReachability(dangerMm, finalSurfaceMm);
    if (reachability.keptPositions.length === 0) throw new Error(`外側へ直下到達する支柱候補が0面です（候補${reachability.candidateFaceCount}面・内側/遮蔽除外${reachability.rejectedFaceCount}面・無効${reachability.invalidCandidateFaceCount}面）。角度診断または形状を確認してください`);
    postProgress(3, "支柱を選択", "外側直下到達" + reachability.keptFaceCount.toLocaleString() + "面");
    const scaffold = buildExternalPerimeterScaffold(
      reachability.keptPositions,
      finalSurfaceMm,
      bodyPositionsMm,
      request.scaffoldOptions,
    );
    if (scaffold.stats.pillarCount === 0 || scaffold.positions.length === 0) {
      throw new Error(`外周の直線支柱を作れませんでした（全到達候補${scaffold.stats.coverageFaceCount}面・BODY衝突除外${scaffold.stats.collisionRejectedFaceCount}面・短すぎる除外${scaffold.stats.shortRejectedFaceCount}面）`);
    }
    const mmToSource = 1 / request.scaleMmPerUnit;
    const sourcePillars: SkinScaffoldPillar[] = scaffold.pillars.map((pillar) => ({
      x: pillar.xMm * mmToSource,
      y: pillar.yMm * mmToSource,
      plateZ: pillar.plateZMm * mmToSource,
      topZ: pillar.topZMm * mmToSource,
      shaftRadius: request.scaffoldOptions.shaftRadiusMm * mmToSource,
      baseRadius: request.scaffoldOptions.baseRadiusMm * mmToSource,
      tipRadius: pillar.contactRadiusMm * mmToSource,
      baseHeight: request.scaffoldOptions.baseHeightMm * mmToSource,
      tipHeight: request.scaffoldOptions.tipHeightMm * mmToSource,
    }));
    const input = request.fusedMeshInput;
    const workerCount = Math.max(2, Math.min(8, Math.floor(self.navigator.hardwareConcurrency || 4)));
    postProgress(4, "最終一体メッシュを生成", "支柱" + scaffold.stats.pillarCount.toLocaleString() + "本 · " + workerCount + "並列");
    let fused: ReturnType<typeof buildSkinMesh>;
    try {
      const parallelRequest: PreviewMeshRequest = {
        type: "build", requestId: request.requestId, generation: request.generation,
        mode: input.mode, host: input.host, hostK: input.hostK, thickness: input.thickness,
        patches: input.patches, internalGraph: input.internalGraph, roundK: input.roundK,
        coinBulge: input.coinBulge, coinBulgeBalance: input.coinBulgeBalance,
        quadMeshJoinWidth: input.quadMeshJoinWidth, resolution: input.options.resolution,
        targetLongestMm: input.options.targetLongestMm, workerCount,
        scaffoldPillars: sourcePillars, positionsOnly: true,
      };
      let completedFaces = 0;
      const buffers = await buildParallelMeshBuffers(parallelRequest, (completed, total, faceCount) => {
        completedFaces += faceCount;
        postProgress(4, "最終一体メッシュを生成",
          "支柱" + scaffold.stats.pillarCount.toLocaleString() + "本 · " + completed + "/" + total + " slice · " + completedFaces.toLocaleString() + "面");
      });
      const triangles = trianglesFromPositions(buffers.positions);
      const base = buildMeshResultFromTriangles(triangles, input.options.targetLongestMm);
      fused = {
        ...base,
        connectedComponents: countConnectedComponents(triangles),
        reinforcedConnectionPoints: reinforceQuadConnectionsForMesh(input.patches, input.quadMeshJoinWidth).reinforcedPointCount,
        internalEdgeCount: input.internalGraph?.edges.length ?? 0,
      };
    } catch (parallelError) {
      postProgress(4, "最終一体メッシュを生成", "並列経路を再試行 · 1 worker · " + (parallelError instanceof Error ? parallelError.message : String(parallelError)));
      fused = buildSkinMesh(
        input.mode, input.host, input.hostK, input.thickness, input.patches, input.roundK, input.options,
        input.coinBulge, input.quadMeshJoinWidth, input.coinBulgeBalance, input.internalGraph, sourcePillars,
      );
    }
    postProgress(5, "トポロジーを検査", fused.triangles.length.toLocaleString() + "面");
    const before = inspectSavedStlTopology(fused.triangles, fused.scaleMmPerUnit);
    if (!before.closed || !before.degenerateFree || before.nonFiniteTriangleCount > 0 || before.connectedComponents !== 1) {
      const componentDetail = summarizeSavedStlComponents(fused.triangles, fused.scaleMmPerUnit)
        .slice(0, 6)
        .map((component, index) => `#${index + 1} ${component.triangleCount.toLocaleString()}面 / ${component.boundsMm.size.x.toFixed(1)}×${component.boundsMm.size.y.toFixed(1)}×${component.boundsMm.size.z.toFixed(1)} mm / Z ${component.boundsMm.min.z.toFixed(1)}〜${component.boundsMm.max.z.toFixed(1)}`)
        .join("｜");
      throw new Error("Fail closed: fused BODY topology NG before winding repair (closed=" + before.closed + ", components=" + before.connectedComponents + ", degenerate=" + before.degenerateTriangleCount + ", open=" + before.openEdges + ", nonManifold=" + before.nonManifoldEdges + "; 部品=" + componentDetail + ")");
    }
    const repaired = orientMeshForSavedStl(fused);
    const plateNormalization = normalizeFusedScaffoldPlatePlane(repaired, sourcePillars);
    const after = inspectSavedStlTopology(repaired.triangles, repaired.scaleMmPerUnit);
    if (!after.ok || after.connectedComponents !== 1) {
      throw new Error("Fail closed: fused BODY topology NG after winding repair (closed=" + after.closed + ", winding=" + after.windingConsistent + ", components=" + after.connectedComponents + ", degenerate=" + after.degenerateTriangleCount + ")");
    }
    postProgress(6, "初層パッドを検査", plateNormalization.correctedVertexCount > 0
      ? "SDF補間" + plateNormalization.correctionMm.toFixed(3) + " mmをプレート面へ整列"
      : undefined);
    const plateAnchor = inspectFusedScaffoldPlateAnchoring(repaired, sourcePillars, 0.2);
    if (!plateAnchor.ok) {
      throw new Error("Fail closed: fused scaffold does not start on layer 1 (clearance=" + plateAnchor.plateClearanceMm.toFixed(3) + " mm, spread=" + plateAnchor.plateSpreadMm.toFixed(3) + " mm)");
    }
    const fusedPositionsMm = new Float32Array(repaired.triangles.flatMap((triangle) => [
      triangle.a.x * repaired.scaleMmPerUnit, triangle.a.y * repaired.scaleMmPerUnit, triangle.a.z * repaired.scaleMmPerUnit,
      triangle.b.x * repaired.scaleMmPerUnit, triangle.b.y * repaired.scaleMmPerUnit, triangle.b.z * repaired.scaleMmPerUnit,
      triangle.c.x * repaired.scaleMmPerUnit, triangle.c.y * repaired.scaleMmPerUnit, triangle.c.z * repaired.scaleMmPerUnit,
    ]));
    postProgress(7, "3MFを圧縮", (fusedPositionsMm.length / 9).toLocaleString() + "面");
    const result = await buildBambu3mf([
      { name: "BODY_WITH_FUSED_SCAFFOLD", role: "body", positions: fusedPositionsMm },
    ], {
      title: request.title, supportType: request.supportType, generatorVersion: request.generatorVersion,
    });
    const message: Bambu3mfWorkerMessage = {
      type: "result",
      requestId: request.requestId,
      generation: request.generation,
      archive: result.archive,
      stats: result.stats,
      reachability: {
        candidateFaceCount: reachability.candidateFaceCount,
        keptFaceCount: reachability.keptFaceCount,
        rejectedFaceCount: reachability.rejectedFaceCount,
        invalidCandidateFaceCount: reachability.invalidCandidateFaceCount,
        meshScaleMm: reachability.meshScaleMm,
        lowerIntersectionEpsilonMm: reachability.lowerIntersectionEpsilonMm,
        gridCellSizeMm: reachability.gridCellSizeMm,
        gridCellCount: reachability.gridCellCount,
        surfaceTriangleCount: reachability.surfaceTriangleCount,
        invalidSurfaceTriangleCount: reachability.invalidSurfaceTriangleCount,
      } satisfies SupportReachabilityStats,
      scaffold: scaffold.stats,
      plateAnchor,
      elapsedMs: performance.now() - started,
    };
    self.postMessage(message, { transfer: [result.archive] });
  } catch (error) {
    const message: Bambu3mfWorkerMessage = {
      type: "error",
      requestId: request.requestId,
      generation: request.generation,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: performance.now() - started,
    };
    self.postMessage(message);
  }
};

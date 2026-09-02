import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  encodeBinaryStl,
  inspectSavedStlTopology,
  meshSummary,
} from "../src/studies/cloud-sculpt/meshExport.ts";
import { createCompositeSdfEvaluator } from "../src/studies/skin/field.ts";
import { evaluateInternalPrintGate } from "../src/studies/skin/internalPrintGate.ts";
import { replay, type SkinHistoryEntry } from "../src/studies/skin/history.ts";
import {
  buildSkinRebuildFinalMesh,
  findSkinRebuildLowestPoints,
  mergeSkinRebuildGraphsAtSupportContacts,
  meshPositions,
} from "../src/studies/skin/rebuild/model.ts";
import {
  classifySkinRebuildOverhangFromStage3,
  computeSkinRebuildMeshInteriorInterfaceDistancesMm,
  projectSkinRebuildFinalArtworkOverhangToStage4,
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
} from "../src/studies/skin/rebuild/overhangInteriorClassification.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "../src/studies/skin/rebuild/fkei.ts";
import { fkeiShapeFingerprint } from "../src/studies/skin/fkeiRestoreIdentity.ts";
import {
  createSkinRebuildPrintSnapshot,
  skinRebuildPrintSnapshotGraphFingerprint,
  type SkinRebuildPrintSnapshotData,
} from "../src/studies/skin/rebuild/printSnapshot.ts";
import { analyzeStage6MeshTopology } from "../src/studies/skin/rebuild/stage6MeshTopologyDiagnostics.ts";
import type { SkinMeshResult } from "../src/studies/skin/meshExport.ts";
import manifest from "../src/studies/skin/manifest.json";

const outputDirectory = resolve(process.argv[2] ?? "public/samples");
const baseName = "skin-rebuild-completed-print-ready";
const sourceName = "skin-rebuild-first-print.fkei";
const sampleTimestamp = "2026-09-02T00:00:00.000Z";
const generatorCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
const exportResolution = 128;
const boundaryThicknessMm = 2;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function triangleSoupLongestExtent(positions: Float32Array): number {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
}

function flatNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let base = 0; base < positions.length; base += 9) {
    const abx = positions[base + 3] - positions[base];
    const aby = positions[base + 4] - positions[base + 1];
    const abz = positions[base + 5] - positions[base + 2];
    const acx = positions[base + 6] - positions[base];
    const acy = positions[base + 7] - positions[base + 1];
    const acz = positions[base + 8] - positions[base + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    for (let corner = 0; corner < 3; corner += 1) {
      normals[base + corner * 3] = Math.fround(nx / length);
      normals[base + corner * 3 + 1] = Math.fround(ny / length);
      normals[base + corner * 3 + 2] = Math.fround(nz / length);
    }
  }
  return normals;
}

function displayableTriangle(positions: Float32Array, faceIndex: number): boolean {
  const offset = faceIndex * 9;
  for (let index = 0; index < 9; index += 1) {
    if (!Number.isFinite(positions[offset + index])) return false;
  }
  const abx = positions[offset + 3] - positions[offset];
  const aby = positions[offset + 4] - positions[offset + 1];
  const abz = positions[offset + 5] - positions[offset + 2];
  const acx = positions[offset + 6] - positions[offset];
  const acy = positions[offset + 7] - positions[offset + 1];
  const acz = positions[offset + 8] - positions[offset + 2];
  return Math.hypot(
    aby * acz - abz * acy,
    abz * acx - abx * acz,
    abx * acy - aby * acx,
  ) > 1e-12;
}

function buildStage4Evidence(project: ReturnType<typeof projectFromSkinRebuildFkei>): SkinRebuildPrintSnapshotData["stage4"] {
  const diagnosis = findSkinRebuildLowestPoints(
    project.base,
    project.patterns,
    project.patternSides,
    project.dryWeb,
    project.settings,
  );
  const interior = classifySkinRebuildOverhangFromStage3(
    diagnosis.overhang.positions,
    diagnosis.overhang.faceRegionIds,
    project.patternSides,
  );
  return {
    current: true,
    faceCount: interior.faceClasses.length,
    regionCount: interior.insideRegionIds.length + interior.outsideRegionIds.length + interior.unclassifiedRegionIds.length,
    insideFaceCount: interior.insideFaceCount,
    outsideFaceCount: interior.outsideFaceCount,
    insideRegionCount: interior.insideRegionIds.length,
    outsideRegionCount: interior.outsideRegionIds.length,
    unclassifiedFaceCount: interior.unclassifiedFaceCount,
  };
}

function buildStage65Evidence(
  project: ReturnType<typeof projectFromSkinRebuildFkei>,
  positions: Float32Array,
): SkinRebuildPrintSnapshotData["stage6_5"] {
  const faceCount = positions.length / 9;
  const sourceLongest = triangleSoupLongestExtent(positions);
  const scaleMmPerUnit = project.settings.targetLongestMm / sourceLongest;
  const projection = classifySkinRebuildOverhangFromStage3(
    positions,
    new Int32Array(faceCount).fill(-1),
    project.patternSides,
  );
  const classes = new Int8Array(faceCount).fill(3);
  const sideByPatchId = new Map(project.patternSides
    .filter((side) => side.baseSideIsInside)
    .map((side) => [side.patchId, side]));
  let insideFaceCount = 0;
  let outsideFaceCount = 0;
  let unclassifiedFaceCount = 0;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    if (!displayableTriangle(positions, faceIndex)) {
      unclassifiedFaceCount++;
      continue;
    }
    const side = sideByPatchId.get(projection.faceOwnerPatchIds[faceIndex]);
    const faceClass = projection.faceClasses[faceIndex];
    if (!side || (faceClass !== SKIN_REBUILD_OVERHANG_INSIDE && faceClass !== SKIN_REBUILD_OVERHANG_OUTSIDE)) {
      unclassifiedFaceCount++;
      continue;
    }
    classes[faceIndex] = faceClass;
    if (faceClass === SKIN_REBUILD_OVERHANG_INSIDE) insideFaceCount++;
    else outsideFaceCount++;
  }
  const interfaceDistances = computeSkinRebuildMeshInteriorInterfaceDistancesMm(positions, classes, scaleMmPerUnit);
  let boundaryFaceCount = 0;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    if ((classes[faceIndex] === SKIN_REBUILD_OVERHANG_INSIDE || classes[faceIndex] === SKIN_REBUILD_OVERHANG_OUTSIDE)
      && Number.isFinite(interfaceDistances[faceIndex])
      && interfaceDistances[faceIndex] <= boundaryThicknessMm * 0.5) {
      if (classes[faceIndex] === SKIN_REBUILD_OVERHANG_INSIDE) insideFaceCount--;
      else outsideFaceCount--;
      classes[faceIndex] = 2;
      boundaryFaceCount++;
    }
  }
  const boundaryRegionCount = boundaryFaceCount > 0 ? 1 : 0;
  return {
    current: true,
    faceCount,
    insideFaceCount,
    outsideFaceCount,
    boundaryFaceCount,
    unclassifiedFaceCount,
    boundaryRegionCount,
    boundaryThicknessMm,
  };
}

function buildStage75Evidence(
  project: ReturnType<typeof projectFromSkinRebuildFkei>,
  stage7: ReturnType<typeof findSkinRebuildLowestPoints>,
): SkinRebuildPrintSnapshotData["stage7_5"] {
  const stage4Diagnosis = findSkinRebuildLowestPoints(
    project.base,
    project.patterns,
    project.patternSides,
    project.dryWeb,
    project.settings,
  );
  const stage4Interior = classifySkinRebuildOverhangFromStage3(
    stage4Diagnosis.overhang.positions,
    stage4Diagnosis.overhang.faceRegionIds,
    project.patternSides,
  );
  const projected = projectSkinRebuildFinalArtworkOverhangToStage4(
    stage7.overhang.positions,
    stage7.overhang.faceRegionIds,
    stage4Diagnosis.overhang.positions,
    stage4Interior,
  );
  const projectedFaceIndices = new Set(projected.faces.map((face) => face.stage7FaceIndex));
  const ambiguousRegionIds = new Set<number>(stage4Interior.unclassifiedRegionIds);
  for (let faceIndex = 0; faceIndex < stage7.overhang.faceRegionIds.length; faceIndex += 1) {
    if (!projectedFaceIndices.has(faceIndex)) ambiguousRegionIds.add(stage7.overhang.faceRegionIds[faceIndex]);
  }
  for (const face of projected.faces) {
    if (face.responsibility !== SKIN_REBUILD_OVERHANG_INSIDE
      && (face.responsibility !== SKIN_REBUILD_OVERHANG_OUTSIDE || face.responsibilityRegionId < 0)) {
      ambiguousRegionIds.add(face.responsibilityRegionId);
    }
  }
  return {
    current: true,
    insideFaceCount: projected.insideFaceCount,
    outsideFaceCount: projected.outsideFaceCount,
    ambiguousFaceCount: stage4Interior.unclassifiedFaceCount + projected.unclassifiedFaceCount,
    ambiguousRegionCount: ambiguousRegionIds.size,
  };
}

function gateFingerprint(
  history: SkinHistoryEntry[],
  mode: string,
  resolution: number,
  targetLongestMm: number,
  graph: { kind: string; nodes: Array<{ id: number; position: { x: number; y: number; z: number }; radius: number }>; edges: Array<{ start: number; end: number; radius: number }> },
  selection: { cacheFingerprint: string; componentIds: number[]; triangleCount: number } | null,
): string {
  return JSON.stringify({
    history,
    mode,
    resolution: Math.max(16, Math.round(resolution)),
    targetLongestMm,
    graphKind: graph.kind,
    nodes: graph.nodes.map((node) => [node.id, node.position.x, node.position.y, node.position.z, node.radius]),
    edges: graph.edges.map((edge) => [edge.start, edge.end, edge.radius]),
    exportComponentSelection: selection
      ? { cacheFingerprint: selection.cacheFingerprint, componentIds: selection.componentIds, triangleCount: selection.triangleCount }
      : null,
  });
}

function pipelineFingerprint(
  settings: ReturnType<typeof projectFromSkinRebuildFkei>["settings"],
  gate: string,
): string {
  return JSON.stringify({
    gateFingerprint: gate,
    supportMode: "automatic",
    settings: {
      baseStretch: settings.baseStretch,
      patternCount: settings.patternCount,
      strutDiameterMm: settings.strutDiameterMm,
      targetLongestMm: settings.targetLongestMm,
      surfaceThickness: settings.surfaceThickness,
      patternRadius: settings.patternRadius,
      roundK: settings.roundK,
      overhangThresholdDeg: settings.overhangThresholdDeg,
      analysisResolution: settings.analysisResolution,
      exportResolution: settings.exportResolution,
      supportDiameterMm: settings.supportDiameterMm,
    },
  });
}

const startedAt = Date.now();
const sourceDocument = parseSkinRebuildFkei(readFileSync(resolve("public/samples", sourceName), "utf8"));
if (!sourceDocument.shapeRecipe) throw new Error("Completed sample source must contain a shapeRecipe");
const recipe = JSON.parse(sourceDocument.shapeRecipe) as { entries: SkinHistoryEntry[] };
const state = replay(recipe.entries);
const sourceProject = projectFromSkinRebuildFkei(sourceDocument);
const pointRadii = state.patches.flatMap((patch) => patch.points.map((point) => point.r)).filter(Number.isFinite);
const averagePointRadius = pointRadii.length > 0
  ? pointRadii.reduce((sum, radius) => sum + radius, 0) / pointRadii.length
  : 0.18;
const project = {
  ...sourceProject,
  settings: {
    ...sourceProject.settings,
    // These are the current original-editor print settings restored from the
    // project controls. The source geometry and graph remain unchanged.
    patternRadius: Math.max(0.18, Math.min(0.38, averagePointRadius)),
    exportResolution,
  },
};
const bodyMesh = buildSkinRebuildFinalMesh(project, exportResolution);
const bodyPositions = meshPositions(bodyMesh);
const bodyNormals = flatNormals(bodyPositions);
const bodyTopology = analyzeStage6MeshTopology(bodyPositions, project.settings.targetLongestMm);
if (bodyTopology.componentCount !== 1 || bodyTopology.degenerateFaceIndices.length !== 0 || !bodyMesh.watertight.ok) {
  throw new Error(`Completed sample BODY topology is not print-ready: ${JSON.stringify({ componentCount: bodyTopology.componentCount, degenerate: bodyTopology.degenerateFaceIndices.length, watertight: bodyMesh.watertight })}`);
}
const stage4 = buildStage4Evidence(project);
const stage65 = buildStage65Evidence(project, bodyPositions);
const stage7 = findSkinRebuildLowestPoints(
  project.base,
  project.patterns,
  project.patternSides,
  project.finalGraph,
  { ...project.settings, analysisResolution: exportResolution },
  bodyMesh as unknown as SkinMeshResult,
);
const stage75 = buildStage75Evidence(project, stage7);
if (stage75.ambiguousFaceCount !== 0 || stage75.ambiguousRegionCount !== 0) {
  throw new Error(`Completed sample Stage 7.5 evidence is ambiguous: ${JSON.stringify(stage75)}`);
}
const supportStats = project.printSupport.stats;
const requestedTargets = Math.max(0, supportStats.requestedTargets ?? project.printSupport.edges.length);
const acceptedSupportCount = Math.max(0, supportStats.acceptedSupportCount ?? supportStats.connectedTargets ?? project.printSupport.edges.length);
const rejectedByBody = Math.max(0, supportStats.rejectedByBodyIntersection ?? 0);
const unsupportedCount = Math.max(0, supportStats.unsupportedCount ?? requestedTargets - acceptedSupportCount);
if (unsupportedCount !== 0 || rejectedByBody !== 0) {
  throw new Error(`Completed sample Sparse Support is unresolved: ${JSON.stringify({ requestedTargets, acceptedSupportCount, rejectedByBody, unsupportedCount })}`);
}
const supportRadius = project.printSupport.edges.length > 0 ? Math.min(...project.printSupport.edges.map((edge) => edge.radius)) : project.settings.supportDiameterMm / (2 * bodyMesh.scaleMmPerUnit);
const stage8: SkinRebuildPrintSnapshotData["stage8"] = {
  current: true,
  supportMode: "automatic",
  supportDiameterMm: project.settings.supportDiameterMm,
  sparseSupportGenerated: true,
  supportGraphFingerprint: skinRebuildPrintSnapshotGraphFingerprint(project.printSupport),
  supportGraphNodeCount: project.printSupport.nodes.length,
  supportGraphEdgeCount: project.printSupport.edges.length,
  unresolvedSupportCount: unsupportedCount,
  acceptedBodyCollisionCount: 0,
  diagnostics: {
    outsideRegionCount: stage4.outsideRegionCount,
    rawCandidateCount: requestedTargets,
    criticalTargetCount: requestedTargets,
    coveredTargetCount: acceptedSupportCount,
    unsupportedTargetCount: unsupportedCount,
    generatedSupportCount: acceptedSupportCount,
    rejectedByBody,
    rejectedBySpacing: 0,
    rejectedByRemovability: 0,
    insideDerivedSupportCount: 0,
    verticalCount: project.printSupport.edges.length,
    leaningCount: 0,
    routeCandidateCount: requestedTargets,
    straightRejectedByBody: rejectedByBody,
    offsetBendCount: 0,
    acceptedBodyCollisionCount: 0,
    experimental: true,
    removalGap: 0.35,
    shaftRadius: supportRadius,
    neckRadius: supportRadius,
  },
};
const bodyFingerprint = gateFingerprint(recipe.entries, state.mode, exportResolution, project.settings.targetLongestMm, project.finalGraph, null);
const selectedComponentIds = Array.from({ length: bodyTopology.componentCount }, (_, index) => index);
const selection = {
  explicit: true,
  componentIds: selectedComponentIds,
  triangleCount: bodyTopology.triangleCount,
  cacheFingerprint: bodyFingerprint,
};
const reachabilityGraph = mergeSkinRebuildGraphsAtSupportContacts(project.finalGraph, project.printSupport);
const gate = gateFingerprint(recipe.entries, state.mode, exportResolution, project.settings.targetLongestMm, reachabilityGraph, {
  cacheFingerprint: bodyFingerprint,
  componentIds: selectedComponentIds,
  triangleCount: bodyTopology.triangleCount,
});
const surfaceSdf = createCompositeSdfEvaluator(
  state.mode,
  state.host,
  state.hostParams.k,
  state.skinParams.thickness,
  state.patches,
  state.skinParams.roundK,
  state.skinParams.coinBulge,
  state.skinParams.coinBulgeBalance,
);
const gateReport = evaluateInternalPrintGate({
  graph: reachabilityGraph,
  mesh: { ...bodyMesh, connectedComponents: bodyTopology.componentCount },
  resolution: exportResolution,
  targetLongestMm: project.settings.targetLongestMm,
  surfaceSdf: (point) => surfaceSdf(point.x, point.y, point.z),
  buildPlateZSource: Math.min(...project.lowestPoints.map((point) => point.position.z)),
  expectedMeshComponents: selectedComponentIds.length,
});
if (!gateReport.ok) throw new Error(`Completed sample Internal print gate is not ready: ${JSON.stringify(gateReport)}`);
const stl = encodeBinaryStl(bodyMesh, `${baseName}.stl`);
const stlTopology = inspectSavedStlTopology(bodyMesh.triangles, bodyMesh.scaleMmPerUnit);
if (!stlTopology.ok) throw new Error(`Completed sample STL topology is not ready: ${JSON.stringify(stlTopology)}`);
const snapshotData: SkinRebuildPrintSnapshotData = {
  body: {
    fingerprint: bodyFingerprint,
    positions: bodyPositions,
    normals: bodyNormals,
    summary: meshSummary(bodyMesh),
    watertightOk: bodyMesh.watertight.ok,
    topologyDiagnostics: bodyTopology,
  },
  componentSelection: selection,
  stage4,
  stage6_5: stage65,
  stage7: {
    current: true,
    faceCount: stage7.mesh.triangles.length,
    overhangFaceCount: stage7.overhang.faceCount,
    overhangRegionCount: stage7.overhang.regionCount,
    overhangAreaMm2: stage7.overhang.areaSourceSquared * bodyMesh.scaleMmPerUnit ** 2,
    overhangAreaPercent: stage7.overhang.totalAreaSourceSquared > 0
      ? stage7.overhang.areaSourceSquared / stage7.overhang.totalAreaSourceSquared * 100
      : 0,
  },
  stage7_5: stage75,
  stage8,
  internalPrintGate: {
    fingerprint: gate,
    report: gateReport,
    stl,
    summary: meshSummary(bodyMesh),
    scaleMmPerUnit: bodyMesh.scaleMmPerUnit,
    plateShiftSourceZ: bodyMesh.plateShiftSourceZ ?? 0,
  },
};
const sourceFingerprint = fkeiShapeFingerprint(state);
const fixedSnapshot = createSkinRebuildPrintSnapshot(
  sourceFingerprint,
  pipelineFingerprint(project.settings, gate),
  snapshotData,
);
const completedDocument = captureSkinRebuildFkei(project, {
  savedAt: sampleTimestamp,
  appVersion: manifest.version,
  generatorCommit,
  shapeRecipe: sourceDocument.shapeRecipe,
  printSnapshot: fixedSnapshot,
});
const finalText = serializeSkinRebuildFkei(completedDocument);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, `${baseName}.fkei`), finalText, "utf8");
const validation = {
  schema: "katachi.skin-rebuild.completed-print-ready-validation.v1",
  generatedAt: sampleTimestamp,
  generatorCommit,
  sourceSample: sourceName,
  sourceSampleSha256: sha256(readFileSync(resolve("public/samples", sourceName), "utf8")),
  algorithmVersion: project.algorithmVersion,
  printApproval: false,
  slicerPreview: "not-run",
  physicalPrint: "not-run",
  snapshot: {
    version: fixedSnapshot.version,
    sourceGeometryFingerprint: fixedSnapshot.sourceGeometryFingerprint,
    pipelineFingerprint: fixedSnapshot.pipelineFingerprint,
    payloadSha256: fixedSnapshot.payloadSha256,
    encoding: "existing base64-binary-v1 FKEI codec",
  },
  settings: project.settings,
  audit: project.audit,
  body: {
    triangleCount: bodyTopology.triangleCount,
    componentCount: bodyTopology.componentCount,
    scaleMmPerUnit: bodyMesh.scaleMmPerUnit,
    boundsMm: bodyMesh.mmBounds,
    topology: stlTopology,
  },
  componentSelection: selection,
  stages: { stage4, stage6_5: stage65, stage7: snapshotData.stage7, stage7_5: stage75, stage8 },
  internalPrintGate: { fingerprint: gate, report: gateReport },
  files: {
    fkei: { filename: `${baseName}.fkei`, bytes: Buffer.byteLength(finalText), sha256: sha256(finalText) },
    cachedBodyStl: { filename: `${baseName}.stl` , bytes: stl.byteLength, sha256: sha256(new Uint8Array(stl)), written: false },
  },
  elapsedMs: Date.now() - startedAt,
  restoreExecution: { stage6RemeshRuns: 0, stage4to8HeavyRediagnosisRuns: 0 },
};
writeFileSync(resolve(outputDirectory, `${baseName}.validation.json`), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
console.log(JSON.stringify(validation, null, 2));

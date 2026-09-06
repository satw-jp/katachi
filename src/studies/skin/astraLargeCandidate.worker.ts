/// <reference lib="webworker" />

import {
  ASTRA_RABBIT_REPAIR_FINGERPRINT,
  ASTRA_RABBIT_SOURCE_SHA256,
} from "./astraCandidatePrintLane.ts";
import {
  applyApprovedBoundaryRepair,
  APPROVED_USAGI_BOUNDARY_LOOPS,
  USAGI_REPAIR_POLICY_VERSION,
} from "./externalStlHostRepair.ts";
import { createImportedHostInstance, createImportedHostSource, type ImportedHostInstance } from "./externalStlHost.ts";
import { buildPackedCandidateQuery, type PackedCandidateQuery } from "./astraPackedCandidateQuery.ts";
import { readLargeBinaryStl, type LargeStlReadResult } from "./astraLargeCandidateStl.ts";
import { detectSkinRebuildOverhangRegionsFromPositions, type SkinRebuildOverhangDetection } from "./rebuild/overhangRegions.ts";
import { createPackedSupportReachabilityIndex, type SupportReachabilityIndex } from "./supportReachability.ts";
import {
  buildSparseRemovableSupport,
  deriveA1MiniPlateBoundsFromBodyPositions,
  type SparseRemovableSupportFace,
  type SparseRemovableSupportResult,
} from "./rebuild/sparseRemovableSupport.ts";
import { buildPrintSupportMesh } from "./meshExport.ts";
import { buildBambu3mf } from "./bambu3mf.ts";
import { validateSkin3mf } from "./rebuild/threeMfValidation.ts";
import { makeSourceSpaceExecutionFingerprint, type DeferredPrintPlacement } from "./astraLargeCandidateSourceSpace.ts";
import type {
  LargeCandidateCommand,
  LargeCandidateCompactSummary,
  LargeCandidateId,
  LargeCandidateInventory,
  LargeCandidateProgressStage,
  LargeCandidateWorkerMessage,
} from "./astraLargeCandidateWorkerProtocol.ts";

const EXPECTED_CANDIDATE_SHA256: Readonly<Record<LargeCandidateId, string>> = Object.freeze({
  A: "2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c",
  G: "69977b9376988ee4c260022a9f527fda3a12c90877db20293d19c15f0c90adfc",
  H: "e7a0c13c49a1dea82085cb2cbd090a316c26e11b592761ad6d6144869f9f5469",
  J: "48e429e6b6d5de4881a41d902b6d8d36ac33293c32f3250bb5ec0367dbbdbf61",
});

type Timings = Record<string, number>;
type LargeIngestResult = LargeStlReadResult;
type Bounds = LargeStlReadResult["bounds"];

interface ActiveCandidate {
  readonly candidateId: LargeCandidateId;
  readonly filename: string;
  readonly sourceSha256: string;
  readonly geometryFingerprint: string;
  readonly placement: DeferredPrintPlacement;
  readonly inventory: LargeCandidateInventory;
  readonly positions: Float32Array;
  readonly executionSourceFaceIndices: Uint32Array;
  readonly query: PackedCandidateQuery;
  readonly timings: Timings;
  detection: SkinRebuildOverhangDetection | null;
  outsideFaces: SparseRemovableSupportFace[] | null;
  diagnosticsFingerprint: string | null;
  support: SparseRemovableSupportResult | null;
  supportFingerprint: string | null;
  performance: NonNullable<LargeCandidateCompactSummary["performance"]> | null;
}

let referenceHost: ImportedHostInstance | null = null;
let activeCandidate: ActiveCandidate | null = null;
let cancelledGeneration = -1;

function now(): number { return performance.now(); }
function candidateTag(command: { requestId: number; generation: number; candidateId?: LargeCandidateId }): { candidateId?: LargeCandidateId; requestId: number; generation: number } {
  return { ...(command.candidateId ? { candidateId: command.candidateId } : {}), requestId: command.requestId, generation: command.generation };
}
function isCancelled(generation: number): boolean { return cancelledGeneration === generation; }
function post(message: LargeCandidateWorkerMessage, transfer: Transferable[] = []): void { self.postMessage(message, { transfer }); }

function emptyBounds(): Bounds { return { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } }; }
function updateBounds(bounds: Bounds, x: number, y: number, z: number): void {
  bounds.min.x = Math.min(bounds.min.x, x); bounds.min.y = Math.min(bounds.min.y, y); bounds.min.z = Math.min(bounds.min.z, z);
  bounds.max.x = Math.max(bounds.max.x, x); bounds.max.y = Math.max(bounds.max.y, y); bounds.max.z = Math.max(bounds.max.z, z);
}

function postProgress(
  command: LargeCandidateCommand,
  stage: LargeCandidateProgressStage,
  started: number,
  detail?: string,
  completed?: number,
  total?: number,
): void {
  const candidateId = "candidateId" in command ? command.candidateId : undefined;
  post({ type: "PROGRESS", ...candidateTag(command), sourceSha256: activeCandidate?.sourceSha256 ?? (candidateId ? EXPECTED_CANDIDATE_SHA256[candidateId] : ""), geometryFingerprint: activeCandidate?.geometryFingerprint ?? (candidateId ? "pending-source-space-execution" : ""), stage, completed, total, detail, elapsedMs: now() - started });
}

async function ingestBinaryStl(
  file: Blob,
  retainPositions: boolean,
  command: LargeCandidateCommand,
  started: number,
): Promise<LargeIngestResult> {
  return readLargeBinaryStl(file, {
    retainPositions,
    onProgress: (stage, completed, total) => postProgress(command, stage, started, undefined, completed, total),
    isCancelled: () => isCancelled(command.generation),
  });
}

function makeInventory(candidateId: LargeCandidateId, filename: string, result: LargeIngestResult): LargeCandidateInventory {
  return Object.freeze({
    candidateId,
    filename,
    sourceByteLength: result.byteLength,
    sourceSha256: result.sourceSha256,
    sourceGeometrySha256: result.sourceGeometrySha256,
    executionGeometrySha256: result.executionGeometrySha256,
    triangleCount: result.triangleCount,
    executionTriangleCount: result.executionTriangleCount,
    finite: result.finite,
    nearDegenerateCount: result.nearDegenerateCount,
    exactZeroTriangleCount: result.exactZeroTriangleCount,
    removedExactZeroSourceFaceIndices: result.removedExactZeroSourceFaceIndices,
    bounds: result.bounds,
    topologyStatus: "NOT_RECOMPUTED",
    astraRound2Evidence: "PASS",
  });
}

function faceFromDetection(detection: SkinRebuildOverhangDetection, faceIndex: number): SparseRemovableSupportFace | null {
  const offset = faceIndex * 9; const a = { x: detection.positions[offset], y: detection.positions[offset + 1], z: detection.positions[offset + 2] }; const b = { x: detection.positions[offset + 3], y: detection.positions[offset + 4], z: detection.positions[offset + 5] }; const c = { x: detection.positions[offset + 6], y: detection.positions[offset + 7], z: detection.positions[offset + 8] };
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const normal = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x }; const magnitude = Math.hypot(normal.x, normal.y, normal.z);
  if (!(magnitude > 1e-12)) return null;
  return { regionId: detection.faceRegionIds[faceIndex], ownerPatchId: -1, position: { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 }, normal: { x: normal.x / magnitude, y: normal.y / magnitude, z: normal.z / magnitude }, faceIndex, area: magnitude * 0.5 };
}

function triangleSoupBounds(positions: Float32Array): Bounds {
  const bounds = emptyBounds();
  for (let index = 0; index < positions.length; index += 3) updateBounds(bounds, positions[index], positions[index + 1], positions[index + 2]);
  return bounds;
}

async function diagnose(command: Extract<LargeCandidateCommand, { type: "DIAGNOSE" }>, started: number): Promise<void> {
  const candidate = activeCandidate;
  if (!candidate || candidate.candidateId !== command.candidateId || candidate.sourceSha256 !== command.sourceSha256 || candidate.geometryFingerprint !== command.geometryFingerprint) throw new Error("Candidate activation/currentness mismatch");
  const detection = detectSkinRebuildOverhangRegionsFromPositions(candidate.positions, command.settings.overhangThresholdDeg, command.settings.plateFloorMm, command.settings.plateBandMm);
  postProgress(command, "Overhang detection", started, `${detection.faceCount.toLocaleString()} faces`, detection.faceCount, candidate.positions.length / 9);
  const reachability: SupportReachabilityIndex = createPackedSupportReachabilityIndex(candidate.positions);
  const outsideFaces: SparseRemovableSupportFace[] = []; let inside = 0; let unresolved = 0;
  for (let faceIndex = 0; faceIndex < detection.faceCount; faceIndex += 1) {
    const classification = reachability.classifyTriangle(detection.positions, faceIndex * 9);
    if (classification === "outside") { const face = faceFromDetection(detection, faceIndex); if (face) outsideFaces.push(face); }
    else if (classification === "inside") inside++;
    else unresolved++;
    if (faceIndex % 10_000 === 0) postProgress(command, "Outside classification", started, `${faceIndex.toLocaleString()} / ${detection.faceCount.toLocaleString()}`, faceIndex, detection.faceCount);
  }
  candidate.detection = detection; candidate.outsideFaces = outsideFaces;
  candidate.diagnosticsFingerprint = await sha256Fingerprint(JSON.stringify({ candidate: candidate.geometryFingerprint, settings: command.settings, faceCount: detection.faceCount, regionCount: detection.regionCount, outside: outsideFaces.length, inside, unresolved }));
  candidate.support = null; candidate.supportFingerprint = null;
  candidate.timings.overhang = now() - started;
  const summary = compactSummary(candidate, { overhangFaces: detection.faceCount, overhangRegions: detection.regionCount, outside: outsideFaces.length, insideExcluded: inside, unresolved, criticalTargets: outsideFaces.length });
  post({ type: "DIAGNOSTICS", requestId: command.requestId, generation: command.generation, summary });
}

async function sha256Fingerprint(value: string): Promise<string> { const { sha256Hex } = await import("../../lib/hash.ts"); return sha256Hex(value); }

async function buildSupport(command: Extract<LargeCandidateCommand, { type: "BUILD_SUPPORT" }>, started: number): Promise<void> {
  const candidate = activeCandidate;
  if (!candidate || !referenceHost?.signedVolumeQuery || candidate.candidateId !== command.candidateId || candidate.sourceSha256 !== command.sourceSha256 || candidate.geometryFingerprint !== command.geometryFingerprint || candidate.diagnosticsFingerprint !== command.diagnosticsFingerprint || !candidate.outsideFaces) throw new Error("Support currentness/reference mismatch");
  let candidateBodySignedDistanceCalls = 0;
  let rabbitSignedDistanceCalls = 0;
  let rabbitUnsignedSurfaceDistanceCalls = 0;
  let rabbitUnsignedSurfaceDistanceMs = 0;
  let candidateBodyAuditMs = 0;
  let rabbitAuditMs = 0;
  referenceHost.signedVolumeQuery.setTelemetryEnabled(true);
  referenceHost.signedVolumeQuery.resetTelemetry();
  const measureQueryTimings = candidate.query.readTelemetry().enabled;
  const tailWindowEnds = new Set([512, 1024, 1536, 2048, 2304, 2560, 3072, 3584, 4096, 4561]);
  const tailWindowSnapshots = new Map<number, {
    bodySdfCalls: number;
    rabbitSdfCalls: number;
    candidateBvhNodesVisited: number;
    candidateBvhTrianglesTested: number;
  }>();
  const tailStartQueryTelemetry = candidate.query.readTelemetry();
  type TailQuerySnapshot = {
    bodySdfCalls: number;
    rabbitSdfCalls: number;
    candidateBvhNodesVisited: number;
    candidateBvhTrianglesTested: number;
  };
  const tailWindowCumulativeSnapshots = new Map<number, TailQuerySnapshot>();
  const tailInitialSnapshot: TailQuerySnapshot = {
    bodySdfCalls: 0,
    rabbitSdfCalls: 0,
    candidateBvhNodesVisited: tailStartQueryTelemetry.closestSurfaceNodesVisited + tailStartQueryTelemetry.rayIntersectionNodesVisited,
    candidateBvhTrianglesTested: tailStartQueryTelemetry.closestSurfaceTrianglesTested + tailStartQueryTelemetry.rayIntersectionTrianglesTested,
  };
  tailWindowCumulativeSnapshots.set(0, tailInitialSnapshot);
  let previousTailSnapshot = tailInitialSnapshot;
  const captureTailWindow = (progress: { targetsProcessed: number }): void => {
    if (!command.profile?.enabled || !tailWindowEnds.has(progress.targetsProcessed)) return;
    const telemetry = candidate.query.readTelemetry();
    const current: TailQuerySnapshot = {
      bodySdfCalls: candidateBodySignedDistanceCalls,
      rabbitSdfCalls: rabbitSignedDistanceCalls,
      candidateBvhNodesVisited: telemetry.closestSurfaceNodesVisited + telemetry.rayIntersectionNodesVisited,
      candidateBvhTrianglesTested: telemetry.closestSurfaceTrianglesTested + telemetry.rayIntersectionTrianglesTested,
    };
    tailWindowCumulativeSnapshots.set(progress.targetsProcessed, current);
    tailWindowSnapshots.set(progress.targetsProcessed, {
      bodySdfCalls: current.bodySdfCalls - previousTailSnapshot.bodySdfCalls,
      rabbitSdfCalls: current.rabbitSdfCalls - previousTailSnapshot.rabbitSdfCalls,
      candidateBvhNodesVisited: current.candidateBvhNodesVisited - previousTailSnapshot.candidateBvhNodesVisited,
      candidateBvhTrianglesTested: current.candidateBvhTrianglesTested - previousTailSnapshot.candidateBvhTrianglesTested,
    });
    previousTailSnapshot = current;
  };
  const forbidden = (x: number, y: number, z: number): number => {
    rabbitSignedDistanceCalls += 1;
    const queryStarted = measureQueryTimings ? now() : 0;
    const result = referenceHost!.signedVolumeQuery!.signedDistance({ x, y, z });
    if (measureQueryTimings) rabbitAuditMs += now() - queryStarted;
    return result;
  };
  const forbiddenClosedSurfaceDistance = (x: number, y: number, z: number): number => {
    rabbitUnsignedSurfaceDistanceCalls += 1;
    const queryStarted = measureQueryTimings ? now() : 0;
    const result = referenceHost!.query.closestSurface({ x, y, z })?.distance ?? Number.NaN;
    if (measureQueryTimings) {
      const elapsed = now() - queryStarted;
      rabbitUnsignedSurfaceDistanceMs += elapsed;
      rabbitAuditMs += elapsed;
    }
    return result;
  };
  const bounds = triangleSoupBounds(candidate.positions); const extent = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  const request = {
    projectedOutsideFaces: candidate.outsideFaces,
    outsideRegionCount: candidate.detection?.regionCount ?? 0,
    plateZ: candidate.placement.sourcePlateZMm,
    shaftRadius: command.settings.shaftDiameterMm * 0.5,
    neckRadius: command.settings.neckDiameterMm * 0.5,
    bodySdf: (x: number, y: number, z: number) => {
      candidateBodySignedDistanceCalls += 1;
      const queryStarted = measureQueryTimings ? now() : 0;
      const result = candidate.query.signedDistance({ x, y, z });
      if (measureQueryTimings) candidateBodyAuditMs += now() - queryStarted;
      return result;
    },
    contactPolicy: "single-body" as const,
    forbiddenSdf: forbidden,
    forbiddenClosedSurfaceDistance,
    forbiddenClearanceMm: command.settings.hostClearanceMm,
    removalGapMm: command.settings.removalGapMm,
    lowStartBand: command.settings.lowStartBandMm,
    maxCandidatesPerRegion: command.settings.maxCandidatesPerRegion,
    maxLeaningRoutes: command.settings.maxLeaningRoutes,
    coverageRadius: command.settings.coverageRadiusMm,
    plateBounds: deriveA1MiniPlateBoundsFromBodyPositions(candidate.positions, extent),
    maximumOverlapLength: command.settings.neckDiameterMm + command.settings.shaftDiameterMm,
    maximumDepth: command.settings.neckDiameterMm + command.settings.shaftDiameterMm,
    ...(command.profile ? { profile: command.profile } : {}),
    onProgress: (progress: { targetsProcessed: number; totalTargets: number; routeOptionsTested: number; routeAudits: number; acceptedSupportCount: number; elapsedMs: number }) => {
      captureTailWindow(progress);
      postProgress(
        command,
        "Sparse Support",
        started,
        `targets ${progress.targetsProcessed.toLocaleString()} / ${progress.totalTargets.toLocaleString()} · routes ${progress.routeOptionsTested.toLocaleString()} · audits ${progress.routeAudits.toLocaleString()} · accepted ${progress.acceptedSupportCount.toLocaleString()}`,
        progress.targetsProcessed,
        progress.totalTargets,
      );
    },
  };
  candidate.support = buildSparseRemovableSupport(request); candidate.supportFingerprint = candidate.support.performance.state === "COMPLETE"
    ? await sha256Fingerprint(JSON.stringify({ candidate: candidate.geometryFingerprint, diagnostics: candidate.diagnosticsFingerprint, rabbitSourceSha256: ASTRA_RABBIT_SOURCE_SHA256, rabbitRepairFingerprint: ASTRA_RABBIT_REPAIR_FINGERPRINT, settings: command.settings, graph: candidate.support.graph }))
    : null;
  const boundedSemanticDigest = command.profile?.enabled === true
    && (command.profile.maxProcessedTargets !== undefined || command.profile.maxRouteAudits !== undefined)
    ? await sha256Fingerprint(JSON.stringify({
      candidates: candidate.support.candidates,
      acceptedRoutes: candidate.support.acceptedRoutes,
      graph: candidate.support.graph,
      diagnostics: candidate.support.diagnostics,
      debug: candidate.support.debug,
    }))
    : undefined;
  if (candidate.support.diagnostics.acceptedBodyCollisionCount !== 0 || candidate.support.diagnostics.acceptedForbiddenCollisionCount !== 0) {
    throw new Error("Fail closed: Sparse Support accepted a BODY or Rabbit forbidden-volume collision");
  }
  if (candidate.support.performance.tailProfile) {
    const finalTelemetry = candidate.query.readTelemetry();
    const finalSnapshot: TailQuerySnapshot = {
      bodySdfCalls: candidateBodySignedDistanceCalls,
      rabbitSdfCalls: rabbitSignedDistanceCalls,
      candidateBvhNodesVisited: finalTelemetry.closestSurfaceNodesVisited + finalTelemetry.rayIntersectionNodesVisited,
      candidateBvhTrianglesTested: finalTelemetry.closestSurfaceTrianglesTested + finalTelemetry.rayIntersectionTrianglesTested,
    };
    for (const window of candidate.support.performance.tailProfile.windows) {
      const measured = tailWindowSnapshots.get(window.endTarget);
      const measuredQueryWork = measured
        ? measured.bodySdfCalls + measured.rabbitSdfCalls + measured.candidateBvhNodesVisited + measured.candidateBvhTrianglesTested
        : 0;
      if (measured && (window.routeAudits === 0 || measuredQueryWork > 0)) {
        Object.assign(window, measured);
        continue;
      }
      const start = tailWindowCumulativeSnapshots.get(window.startTarget) ?? tailInitialSnapshot;
      const cumulativeEnd = tailWindowCumulativeSnapshots.get(window.endTarget);
      const cumulativeEndQueryWork = cumulativeEnd
        ? cumulativeEnd.bodySdfCalls + cumulativeEnd.rabbitSdfCalls + cumulativeEnd.candidateBvhNodesVisited + cumulativeEnd.candidateBvhTrianglesTested
        : 0;
      const end = cumulativeEnd && (window.routeAudits === 0 || cumulativeEndQueryWork > 0) ? cumulativeEnd : finalSnapshot;
      Object.assign(window, {
        bodySdfCalls: end.bodySdfCalls - start.bodySdfCalls,
        rabbitSdfCalls: end.rabbitSdfCalls - start.rabbitSdfCalls,
        candidateBvhNodesVisited: end.candidateBvhNodesVisited - start.candidateBvhNodesVisited,
        candidateBvhTrianglesTested: end.candidateBvhTrianglesTested - start.candidateBvhTrianglesTested,
      });
    }
  }
  candidate.timings.support = now() - started;
  const diagnostics = candidate.detection;
  const performance = {
    support: candidate.support.performance,
    candidateQuery: candidate.query.readTelemetry(),
    candidateBodySignedDistanceCalls,
    rabbitSignedDistanceCalls,
    rabbitSignedQuery: referenceHost.signedVolumeQuery.readTelemetry(),
    rabbitUnsignedSurfaceDistanceCalls,
    rabbitUnsignedSurfaceDistanceMs,
    ...(boundedSemanticDigest ? { boundedSemanticDigest } : {}),
    candidateBodyAuditMs,
    rabbitAuditMs,
  };
  candidate.performance = performance;
  const summary = compactSummary(candidate, {
    overhangFaces: diagnostics?.faceCount ?? 0, overhangRegions: diagnostics?.regionCount ?? 0, outside: candidate.outsideFaces.length, insideExcluded: 0, unresolved: 0, criticalTargets: candidate.support.diagnostics.criticalTargetCount,
    support: { critical: candidate.support.diagnostics.criticalTargetCount, supported: candidate.support.diagnostics.criticalTargetCount - candidate.support.diagnostics.unsupportedTargetCount, unsupported: candidate.support.diagnostics.unsupportedTargetCount, bodyReject: candidate.support.diagnostics.rejectedByBody, rabbitReject: candidate.support.diagnostics.rejectedByForbiddenVolume, vertical: candidate.support.diagnostics.verticalCount, offsetBend: candidate.support.diagnostics.offsetBendCount, nodes: candidate.support.graph.nodes.length, edges: candidate.support.graph.edges.length, acceptedBodyCollision: candidate.support.diagnostics.acceptedBodyCollisionCount, acceptedRabbitCollision: candidate.support.diagnostics.acceptedForbiddenCollisionCount },
    performance,
  });
  post({ type: "SUPPORT", requestId: command.requestId, generation: command.generation, summary });
}

async function export3mf(command: Extract<LargeCandidateCommand, { type: "EXPORT_3MF" }>, started: number): Promise<void> {
  const candidate = activeCandidate;
  if (!candidate || !candidate.support || candidate.candidateId !== command.candidateId || candidate.sourceSha256 !== command.sourceSha256 || candidate.geometryFingerprint !== command.geometryFingerprint || candidate.supportFingerprint !== command.supportFingerprint) throw new Error("Export currentness mismatch");
  postProgress(command, "Support mesh", started, "Building unchanged printable support mesh");
  const supportMesh = candidate.support.graph.edges.length > 0 ? buildPrintSupportMesh(candidate.support.graph, 1, { radialSegments: 12 }) : null;
  const supportPositions = supportMesh ? Float32Array.from(supportMesh.triangles.flatMap((triangle) => [triangle.a.x, triangle.a.y, triangle.a.z, triangle.b.x, triangle.b.y, triangle.b.z, triangle.c.x, triangle.c.y, triangle.c.z])) : new Float32Array(0);
  const bodyBounds = triangleSoupBounds(candidate.positions);
  const expectedPackageTranslationZ = candidate.placement.translationMm.z;
  const placementTolerance = Math.max(1e-5, Math.abs(expectedPackageTranslationZ) * 1e-7);
  if (supportPositions.length === 0 && Math.abs(bodyBounds.min.z - candidate.placement.sourcePlateZMm) > placementTolerance) {
    throw new Error("common deferred plate placement cannot be proven for body-only candidate");
  }
  const exportStarted = now();
  const result = await buildBambu3mf([
    { name: `ASTRA_${candidate.candidateId}_ARTWORK`, role: "body", positions: candidate.positions },
    { name: `SKIN_${candidate.candidateId}_PRINT_SUPPORT`, role: "printable_support", positions: supportPositions },
  ], { title: `Astra ${candidate.candidateId} candidate physical comparison`, supportType: "normal(manual)", mergePrintableSupportIntoBody: false }, {
    onProgress: (progress) => postProgress(
      command,
      progress.stage,
      started,
      `uncompressed ${(progress.uncompressedBytes ?? 0).toLocaleString()} · compressed ${(progress.compressedBytes ?? 0).toLocaleString()} bytes`,
      progress.completed,
      progress.total,
    ),
  });
  const exportElapsedMs = now() - exportStarted;
  postProgress(command, "Validation", started, "Validating streamed 3MF package");
  const validation = await validateSkin3mf(result.archive); candidate.timings["3MF"] = now() - started;
  if (!validation.valid) throw new Error(validation.errors.join("; ") || "3MF validator failed");
  const actualPackageTranslationZ = result.stats.placementTranslationMm.z;
  const packagePlacementParity = Math.abs(actualPackageTranslationZ - expectedPackageTranslationZ) <= placementTolerance;
  if (!packagePlacementParity) throw new Error("3MF package placement translation does not match deferred common placement");
  if (result.stats.bodyRemovedDegenerateTriangles !== 0) throw new Error("3MF BODY indexing removed an unexpected degenerate triangle");
  const exportFingerprint = await sha256Fingerprint(JSON.stringify({ candidate: candidate.geometryFingerprint, support: candidate.supportFingerprint, package: "candidate-body-plus-separate-print-support-v0" }));
  const summary = compactSummary(candidate, { overhangFaces: candidate.detection?.faceCount ?? 0, overhangRegions: candidate.detection?.regionCount ?? 0, outside: candidate.outsideFaces?.length ?? 0, insideExcluded: 0, unresolved: 0, criticalTargets: candidate.support.diagnostics.criticalTargetCount, support: { critical: candidate.support.diagnostics.criticalTargetCount, supported: candidate.support.diagnostics.criticalTargetCount - candidate.support.diagnostics.unsupportedTargetCount, unsupported: candidate.support.diagnostics.unsupportedTargetCount, bodyReject: candidate.support.diagnostics.rejectedByBody, rabbitReject: candidate.support.diagnostics.rejectedByForbiddenVolume, vertical: candidate.support.diagnostics.verticalCount, offsetBend: candidate.support.diagnostics.offsetBendCount, nodes: candidate.support.graph.nodes.length, edges: candidate.support.graph.edges.length, acceptedBodyCollision: candidate.support.diagnostics.acceptedBodyCollisionCount, acceptedRabbitCollision: candidate.support.diagnostics.acceptedForbiddenCollisionCount }, export: { archive: result.archive, archiveBytes: result.stats.archiveBytes, supportTriangleCount: supportPositions.length / 9, validator: "PASS", exportFingerprint, expectedPackageTranslationZ, actualPackageTranslationZ, packagePlacementParity, bodyRemovedDegenerateTriangles: result.stats.bodyRemovedDegenerateTriangles, bodyVertices: result.stats.bodyVertices, bodyFaces: result.stats.bodyFaces, modelUncompressedBytes: result.stats.modelUncompressedBytes, compressedModelBytes: result.stats.compressedModelBytes, largestSerializationChunkBytes: result.stats.largestSerializationChunkBytes, bodyIndexedVertexBytes: result.stats.bodyIndexedVertexBytes, bodyIndexedIndexBytes: result.stats.bodyIndexedIndexBytes, supportIndexedBytes: result.stats.supportIndexedBytes, peakJsHeapBytes: result.stats.peakJsHeapBytes, exportElapsedMs } });
  post({ type: "EXPORT", requestId: command.requestId, generation: command.generation, summary }, [result.archive]);
}

function compactSummary(candidate: ActiveCandidate, facts: { overhangFaces: number; overhangRegions: number; outside: number; insideExcluded: number; unresolved: number; criticalTargets: number; support?: Record<string, number>; performance?: NonNullable<LargeCandidateCompactSummary["performance"]>; export?: LargeCandidateCompactSummary["export"] }): LargeCandidateCompactSummary {
  const performance = facts.performance ?? candidate.performance;
  return { candidateId: candidate.candidateId, sourceSha256: candidate.sourceSha256, geometryFingerprint: candidate.geometryFingerprint, ...(candidate.diagnosticsFingerprint ? { diagnosticsFingerprint: candidate.diagnosticsFingerprint } : {}), ...(candidate.supportFingerprint ? { supportFingerprint: candidate.supportFingerprint } : {}), timings: { ...candidate.timings }, telemetry: { peakJsHeapBytes: null, largestTypedArrayBytes: Math.max(candidate.positions.byteLength, candidate.query.stats.totalTypedArrayBytes), residentTypedArrayBytes: candidate.positions.byteLength + candidate.query.stats.totalTypedArrayBytes }, inventory: candidate.inventory, ...(performance ? { performance } : {}), diagnostics: { overhangFaces: facts.overhangFaces, overhangRegions: facts.overhangRegions, outside: facts.outside, insideExcluded: facts.insideExcluded, unresolved: facts.unresolved, reachabilityInvalidSurfaceTriangles: 0, criticalTargets: facts.criticalTargets, topologyStatus: "NOT_RECOMPUTED", astraRound2Evidence: "PASS" }, ...(facts.support ? { support: facts.support } : {}), ...(facts.export ? { export: facts.export } : {}) };
}

async function handle(command: LargeCandidateCommand): Promise<void> {
  cancelledGeneration = -1;
  const started = now();
  try {
    if (command.type === "CANCEL") { cancelledGeneration = command.generation; return; }
    if (command.type === "LOAD_REFERENCE_HOST") {
      postProgress(command, "Reading STL", started, "Rabbit source");
      const bytes = await command.file.arrayBuffer(); const source = await createImportedHostSource(bytes, { filename: command.filename, interpretation: { unitStatus: "explicit", mmPerSourceUnit: 1, upAxis: "y", handedness: "right", importPolicyVersion: "stl-host-v0" } });
      if (source.sourceIdentity.sha256 !== ASTRA_RABBIT_SOURCE_SHA256) throw new Error(`Unexpected Rabbit SHA-256 ${source.sourceIdentity.sha256}`);
      const original = createImportedHostInstance(source, { translation: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], uniformScale: 20 });
      const repaired = await applyApprovedBoundaryRepair(original, { originalSourceSha256: ASTRA_RABBIT_SOURCE_SHA256, repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION, approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS });
      if (repaired.materialization.repairedFingerprint !== ASTRA_RABBIT_REPAIR_FINGERPRINT) throw new Error("Rabbit repair fingerprint mismatch");
      referenceHost = repaired.repaired;
      post({ type: "REFERENCE_READY", requestId: command.requestId, generation: command.generation, sourceSha256: ASTRA_RABBIT_SOURCE_SHA256, geometryFingerprint: "rabbit-reference-repaired", repairFingerprint: ASTRA_RABBIT_REPAIR_FINGERPRINT, signedVolume: referenceHost.signedVolumeQuery ? "AVAILABLE" : "UNAVAILABLE" });
      return;
    }
    if (command.type === "INVENTORY_CANDIDATE") {
      const result = await ingestBinaryStl(command.file, false, command, started);
      if (result.sourceSha256 !== EXPECTED_CANDIDATE_SHA256[command.candidateId]) throw new Error(`Candidate ${command.candidateId} SHA-256 differs from the inventoried Round-2 artifact: actual ${result.sourceSha256}, expected ${EXPECTED_CANDIDATE_SHA256[command.candidateId]}`);
      post({ type: "INVENTORY", requestId: command.requestId, generation: command.generation, candidateId: command.candidateId, sourceSha256: result.sourceSha256, geometryFingerprint: "pending-source-space-execution", inventory: makeInventory(command.candidateId, command.filename, result) });
      return;
    }
    if (command.type === "ACTIVATE_CANDIDATE") {
      if (activeCandidate) throw new Error("Release the previous Candidate before activation");
      const result = await ingestBinaryStl(command.file, true, command, started);
      if (!result.positions) throw new Error("Packed positions were not retained");
      if (!result.executionSourceFaceIndices) throw new Error("Source face provenance was not retained");
      if (!result.finite) throw new Error("Fail closed: Candidate source geometry contains non-finite coordinates");
      if (result.sourceSha256 !== EXPECTED_CANDIDATE_SHA256[command.candidateId]) throw new Error(`Candidate ${command.candidateId} SHA-256 differs from the inventoried Round-2 artifact: actual ${result.sourceSha256}, expected ${EXPECTED_CANDIDATE_SHA256[command.candidateId]}`);
      const geometryFingerprint = await makeSourceSpaceExecutionFingerprint({
        sourceSha256: result.sourceSha256,
        sourceGeometrySha256: result.sourceGeometrySha256,
        executionGeometrySha256: result.executionGeometrySha256,
        sourceTriangleCount: result.triangleCount,
        executionTriangleCount: result.executionTriangleCount,
        removedExactZeroSourceFaceIndices: result.removedExactZeroSourceFaceIndices,
        placement: command.placement,
        sourceInterpretationVersion: "astra-round-2-export-mm-20x-v0",
      });
      const queryStarted = now(); const query = buildPackedCandidateQuery(result.positions, (stage, completed, total) => postProgress(command, "Building Candidate query", queryStarted, stage, completed, total), { telemetry: command.telemetry === true });
      const inventory = makeInventory(command.candidateId, command.filename, result);
      activeCandidate = { candidateId: command.candidateId, filename: command.filename, sourceSha256: result.sourceSha256, geometryFingerprint, placement: command.placement, inventory, positions: result.positions, executionSourceFaceIndices: result.executionSourceFaceIndices, query, timings: { ingest: now() - started, hash: 0, parse: now() - started, query: now() - queryStarted }, detection: null, outsideFaces: null, diagnosticsFingerprint: null, support: null, supportFingerprint: null, performance: null };
      post({ type: "INVENTORY", requestId: command.requestId, generation: command.generation, candidateId: command.candidateId, sourceSha256: result.sourceSha256, geometryFingerprint, inventory });
      return;
    }
    if (command.type === "DIAGNOSE") { await diagnose(command, started); return; }
    if (command.type === "BUILD_SUPPORT") { await buildSupport(command, started); return; }
    if (command.type === "EXPORT_3MF") { await export3mf(command, started); return; }
    if (command.type === "RELEASE_CANDIDATE") {
      if (!activeCandidate || activeCandidate.candidateId !== command.candidateId || activeCandidate.sourceSha256 !== command.sourceSha256 || activeCandidate.geometryFingerprint !== command.geometryFingerprint) throw new Error("Release currentness mismatch");
      const releasedBytes = activeCandidate.positions.byteLength + activeCandidate.query.stats.totalTypedArrayBytes;
      activeCandidate.query.release(); activeCandidate = null;
      post({ type: "RELEASED", requestId: command.requestId, generation: command.generation, candidateId: command.candidateId, sourceSha256: command.sourceSha256, geometryFingerprint: command.geometryFingerprint, releasedTypedArrayBytes: releasedBytes });
    }
  } catch (error) {
    post({ type: "ERROR", ...candidateTag(command), sourceSha256: activeCandidate?.sourceSha256 ?? ("sourceSha256" in command ? command.sourceSha256 : ""), geometryFingerprint: activeCandidate?.geometryFingerprint ?? ("geometryFingerprint" in command ? command.geometryFingerprint : ""), stage: command.type === "CANCEL" ? "Protocol" : command.type === "EXPORT_3MF" ? "3MF" : command.type === "BUILD_SUPPORT" ? "Sparse Support" : command.type === "DIAGNOSE" ? "Overhang detection" : command.type === "ACTIVATE_CANDIDATE" || command.type === "INVENTORY_CANDIDATE" ? "Reading STL" : "Protocol", message: error instanceof Error ? error.message : String(error) });
  }
}

self.onmessage = (event: MessageEvent<LargeCandidateCommand>): void => { void handle(event.data); };

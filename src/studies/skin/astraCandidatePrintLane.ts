import type { Triangle, MeshVertex } from "../cloud-sculpt/meshExport.ts";
import { sha256Hex } from "../../lib/hash.ts";
import {
  buildBambu3mf,
  parseBinaryStlPositions,
  type Bambu3mfResult,
} from "./bambu3mf.ts";
import {
  buildPrintSupportMesh,
} from "./meshExport.ts";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostInstanceTransform,
  type HostVec3,
  type ImportedHostInstance,
  type ImportedHostSource,
} from "./externalStlHost.ts";
import {
  detectSkinRebuildOverhangRegions,
  type SkinRebuildOverhangDetection,
} from "./rebuild/overhangRegions.ts";
import {
  buildSparseRemovableSupport,
  deriveA1MiniPlateBoundsFromBodyPositions,
  type SparseRemovableSupportFace,
  type SparseRemovableSupportRequest,
  type SparseRemovableSupportResult,
} from "./rebuild/sparseRemovableSupport.ts";
import {
  createSupportReachabilityIndex,
  type SupportReachabilityClassification,
} from "./supportReachability.ts";
import { validateSkin3mf, type Skin3mfValidationReport } from "./rebuild/threeMfValidation.ts";

export type AstraCandidateId = "A" | "G" | "H" | "J";

export const ASTRA_CANDIDATE_FILENAMES: Readonly<Record<AstraCandidateId, string>> = Object.freeze({
  A: "A2_BODY.stl",
  G: "G2_BODY.stl",
  H: "H2_BODY.stl",
  J: "J2_BODY.stl",
});

export const ASTRA_RABBIT_SOURCE_SHA256 = "c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8";
export const ASTRA_RABBIT_REPAIR_FINGERPRINT = "90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6";
export const ASTRA_CANDIDATE_FINGERPRINT_VERSION = "astra-candidate-print-space-f32-le-v0";
export const ASTRA_CANDIDATE_INTERPRETATION_VERSION = "astra-round-2-export-mm-20x-v0";

export const ASTRA_COMMON_SUPPORT_SETTINGS = Object.freeze({
  overhangThresholdDeg: 45,
  plateBandMm: 0,
  shaftDiameterMm: 1.6,
  neckDiameterMm: 0.6,
  removalGapMm: 0.35,
  lowStartBandMm: 2.4,
  maxCandidatesPerRegion: 3,
  maxLeaningRoutes: 30,
  coverageRadiusMm: 2,
  hostClearanceMm: 0,
});

export interface CandidateSourceInterpretation {
  readonly mmPerSourceUnit: 1;
  readonly upAxis: "+Y";
  readonly handedness: "right-handed";
  readonly exportScaleApplied: 20;
  readonly version: typeof ASTRA_CANDIDATE_INTERPRETATION_VERSION;
}

export interface CandidatePrintTransform {
  readonly translationMm: HostVec3;
  readonly rotation: readonly [0, 0, 0, 1];
  readonly uniformScale: 1;
  readonly rule: "common-lowest-candidate-point-to-plate-z0";
}

export interface CandidateTopologyFacts {
  readonly triangleCount: number;
  readonly validTriangleCount: number;
  readonly finite: boolean;
  readonly degenerateTriangleCount: number;
  readonly connectedComponentCount: number;
  readonly openEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly windingInconsistentEdgeCount: number;
  readonly closed: boolean;
}

export interface ArtworkCandidateSnapshot {
  readonly candidateId: AstraCandidateId;
  readonly sourceFilename: string;
  readonly sourceByteLength: number;
  readonly sourceSha256: string;
  readonly source: ImportedHostSource;
  readonly sourceInstance: ImportedHostInstance;
  readonly sourceInterpretation: CandidateSourceInterpretation;
  readonly sourceTransform: CandidatePrintTransform;
  /** The exact Float32 triangle soup used by Diagnostics, Support and 3MF. */
  readonly exactPrintSpacePositionsMm: Float32Array;
  readonly geometryFingerprint: string;
  readonly topologyFacts: CandidateTopologyFacts;
  readonly signedVolumeCapability: "AVAILABLE" | "UNAVAILABLE";
  readonly printable: true;
}

export interface CandidatePreflightFacts {
  readonly finite: boolean;
  readonly invalidTriangleCount: number;
  readonly closed: boolean;
  readonly manifoldEnough: boolean;
  readonly signedVolumeAvailable: boolean;
  readonly componentCount: number;
  readonly blocked: boolean;
  readonly blockReason?: string;
}

export interface CandidateDiagnosticSettings {
  readonly overhangThresholdDeg: number;
  readonly plateFloorMm: number;
  readonly plateBandMm: number;
}

export interface CandidateDiagnostics {
  readonly candidateId: AstraCandidateId;
  readonly geometryFingerprint: string;
  readonly diagnosticsFingerprint: string;
  readonly settings: CandidateDiagnosticSettings;
  readonly preflight: CandidatePreflightFacts;
  readonly overhangFaces: number;
  readonly overhangRegions: number;
  readonly outsideFaces: number;
  readonly insideExcludedFaces: number;
  readonly unresolvedFaces: number;
  readonly criticalTargets: number;
  readonly outsideSupportFaces: readonly SparseRemovableSupportFace[];
  readonly detection: SkinRebuildOverhangDetection;
}

export interface CandidateSupportSettings {
  readonly overhangThresholdDeg: number;
  readonly plateBandMm: number;
  readonly shaftDiameterMm: number;
  readonly neckDiameterMm: number;
  readonly removalGapMm: number;
  readonly lowStartBandMm: number;
  readonly maxCandidatesPerRegion: number;
  readonly maxLeaningRoutes: number;
  readonly coverageRadiusMm: number;
  readonly hostClearanceMm: number;
}

export interface CandidateSupportResult {
  readonly candidateId: AstraCandidateId;
  readonly geometryFingerprint: string;
  readonly diagnosticsFingerprint: string;
  readonly supportFingerprint: string;
  readonly settings: CandidateSupportSettings;
  readonly sparse: SparseRemovableSupportResult;
  readonly rabbitForbiddenTargetCount: number;
}

export interface CandidateExportResult {
  readonly candidateId: AstraCandidateId;
  readonly geometryFingerprint: string;
  readonly supportFingerprint: string;
  readonly exportFingerprint: string;
  readonly archive: ArrayBuffer;
  readonly stats: Bambu3mfResult["stats"];
  readonly validation: Skin3mfValidationReport;
  readonly candidateFingerprintParity: boolean;
  readonly supportTriangleCount: number;
}

export interface CandidatePipelineCurrentness {
  readonly diagnosticsCurrent: boolean;
  readonly supportCurrent: boolean;
  readonly exportCurrent: boolean;
}

function finite(value: number): boolean { return Number.isFinite(value); }

function clonePoint(point: HostVec3): HostVec3 {
  return { x: point.x, y: point.y, z: point.z };
}

function identityPrintTransform(): CandidatePrintTransform {
  return {
    translationMm: { x: 0, y: 0, z: 0 },
    rotation: [0, 0, 0, 1],
    uniformScale: 1,
    rule: "common-lowest-candidate-point-to-plate-z0",
  };
}

function clonePositions(positions: Float32Array, transform: CandidatePrintTransform): Float32Array {
  const result = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    result[index] = positions[index] + transform.translationMm.x;
    result[index + 1] = positions[index + 1] + transform.translationMm.y;
    result[index + 2] = positions[index + 2] + transform.translationMm.z;
  }
  return result;
}

function stableGeometryDescriptor(
  sourceSha256: string,
  transform: CandidatePrintTransform,
  positionSha256: string,
): string {
  return JSON.stringify({
    version: ASTRA_CANDIDATE_FINGERPRINT_VERSION,
    sourceSha256,
    transform,
    float32LittleEndianGeometrySha256: positionSha256,
  });
}

async function geometryFingerprint(
  sourceSha256: string,
  positions: Float32Array,
  transform: CandidatePrintTransform,
): Promise<string> {
  // Typed-array bytes are the browser's canonical little-endian Float32
  // representation. Hash the exact print-space soup first, then bind the
  // explicit transform/version metadata into the authority fingerprint.
  const positionSha256 = await sha256Hex(positions.slice().buffer);
  return sha256Hex(stableGeometryDescriptor(sourceSha256, transform, positionSha256));
}

function topologyFacts(instance: ImportedHostInstance): CandidateTopologyFacts {
  const topology = instance.volumePreflight.diagnostics.topology;
  const finiteGeometry = topology.validTriangleCount + topology.degenerateTriangleCount === topology.triangleCount;
  return Object.freeze({
    triangleCount: topology.triangleCount,
    validTriangleCount: topology.validTriangleCount,
    finite: finiteGeometry,
    degenerateTriangleCount: topology.degenerateTriangleCount,
    connectedComponentCount: topology.connectedComponentCount,
    openEdgeCount: topology.boundaryEdgeCount,
    nonManifoldEdgeCount: topology.nonManifoldEdgeCount,
    windingInconsistentEdgeCount: topology.orientationInconsistencyEdgeCount,
    closed: topology.boundaryEdgeCount === 0 && topology.nonManifoldEdgeCount === 0,
  });
}

function transformedBodyDistance(snapshot: ArtworkCandidateSnapshot, point: HostVec3): number {
  const query = snapshot.sourceInstance.signedVolumeQuery;
  if (!query) return Number.NaN;
  const translation = snapshot.sourceTransform.translationMm;
  return query.signedDistance({
    x: point.x - translation.x,
    y: point.y - translation.y,
    z: point.z - translation.z,
  });
}

export function candidatePreflight(snapshot: ArtworkCandidateSnapshot): CandidatePreflightFacts {
  const topology = snapshot.topologyFacts;
  const invalidTriangleCount = topology.triangleCount - topology.validTriangleCount;
  const manifoldEnough = topology.openEdgeCount === 0
    && topology.nonManifoldEdgeCount === 0
    && topology.windingInconsistentEdgeCount === 0;
  const signedVolumeAvailable = snapshot.signedVolumeCapability === "AVAILABLE";
  const blocked = !topology.finite || invalidTriangleCount !== 0 || !topology.closed
    || !manifoldEnough || topology.connectedComponentCount !== 1 || !signedVolumeAvailable;
  const blockReason = !topology.finite ? "non-finite triangle soup"
    : invalidTriangleCount !== 0 ? `${invalidTriangleCount} invalid/degenerate triangles`
      : !topology.closed ? "candidate is open"
        : !manifoldEnough ? "candidate is not manifold/orientation-consistent"
          : topology.connectedComponentCount !== 1 ? "candidate has multiple components"
            : !signedVolumeAvailable ? "Signed Volume unavailable" : undefined;
  return { finite: topology.finite, invalidTriangleCount, closed: topology.closed,
    manifoldEnough, signedVolumeAvailable, componentCount: topology.connectedComponentCount,
    blocked, ...(blockReason ? { blockReason } : {}) };
}

export async function loadArtworkCandidate(
  candidateId: AstraCandidateId,
  bytes: ArrayBuffer,
  filename = ASTRA_CANDIDATE_FILENAMES[candidateId],
): Promise<ArtworkCandidateSnapshot> {
  const source = await createImportedHostSource(bytes, {
    filename,
    interpretation: {
      unitStatus: "explicit",
      mmPerSourceUnit: 1,
      upAxis: "y",
      handedness: "right",
      importPolicyVersion: ASTRA_CANDIDATE_INTERPRETATION_VERSION,
    },
  });
  const sourceInstance = createImportedHostInstance(source, {
    translation: { x: 0, y: 0, z: 0 },
    rotation: [0, 0, 0, 1],
    uniformScale: 1,
  });
  const positions = parseBinaryStlPositions(bytes);
  if (84 + positions.length / 9 * 50 !== bytes.byteLength) {
    throw new Error("Candidate STL byte length does not exactly match its binary triangle count");
  }
  if (positions.length / 9 !== sourceInstance.mesh.triangleCount) {
    throw new Error("Candidate parser triangle count mismatch");
  }
  const transform = identityPrintTransform();
  return createCandidateSnapshot(candidateId, source, sourceInstance, positions, transform,
    await geometryFingerprint(source.sourceIdentity.sha256, positions, transform));
}

function createCandidateSnapshot(
  candidateId: AstraCandidateId,
  source: ImportedHostSource,
  sourceInstance: ImportedHostInstance,
  sourcePositions: Float32Array,
  transform: CandidatePrintTransform,
  fingerprint: string,
): ArtworkCandidateSnapshot {
  const positions = clonePositions(sourcePositions, transform);
  return Object.freeze({
    candidateId,
    sourceFilename: source.filename,
    sourceByteLength: source.sourceIdentity.byteLength,
    sourceSha256: source.sourceIdentity.sha256,
    source,
    sourceInstance,
    sourceInterpretation: {
      mmPerSourceUnit: 1,
      upAxis: "+Y",
      handedness: "right-handed",
      exportScaleApplied: 20,
      version: ASTRA_CANDIDATE_INTERPRETATION_VERSION,
    } as const,
    sourceTransform: transform,
    exactPrintSpacePositionsMm: positions,
    geometryFingerprint: fingerprint,
    topologyFacts: topologyFacts(sourceInstance),
    signedVolumeCapability: sourceInstance.capabilities.signedVolumeCapability.availability,
    printable: true,
  });
}

export function deriveCommonCandidatePrintTransform(
  candidates: readonly ArtworkCandidateSnapshot[],
): CandidatePrintTransform {
  if (candidates.length === 0) throw new Error("At least one candidate is required for a common print transform");
  let minimumZ = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    for (let index = 2; index < candidate.exactPrintSpacePositionsMm.length; index += 3) {
      minimumZ = Math.min(minimumZ, candidate.exactPrintSpacePositionsMm[index]);
    }
  }
  if (!finite(minimumZ)) throw new Error("Candidate lower extent is not finite");
  return {
    translationMm: { x: 0, y: 0, z: -minimumZ },
    rotation: [0, 0, 0, 1],
    uniformScale: 1,
    rule: "common-lowest-candidate-point-to-plate-z0",
  };
}

export async function applyCommonCandidatePrintTransform(
  candidate: ArtworkCandidateSnapshot,
  transform: CandidatePrintTransform,
): Promise<ArtworkCandidateSnapshot> {
  const sourcePositions = clonePositions(candidate.exactPrintSpacePositionsMm, {
    translationMm: {
      x: -candidate.sourceTransform.translationMm.x,
      y: -candidate.sourceTransform.translationMm.y,
      z: -candidate.sourceTransform.translationMm.z,
    },
    rotation: [0, 0, 0, 1],
    uniformScale: 1,
    rule: transform.rule,
  });
  const fingerprint = await geometryFingerprint(candidate.sourceSha256, clonePositions(sourcePositions, transform), transform);
  return createCandidateSnapshot(candidate.candidateId, candidate.source, candidate.sourceInstance,
    sourcePositions, transform, fingerprint);
}

function positionsToTriangles(positions: Float32Array): Triangle[] {
  const triangles: Triangle[] = [];
  for (let offset = 0; offset < positions.length; offset += 9) {
    triangles.push({
      a: { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] },
      b: { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] },
      c: { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] },
    });
  }
  return triangles;
}

function triangleFace(facts: SkinRebuildOverhangDetection, faceIndex: number): SparseRemovableSupportFace | null {
  const offset = faceIndex * 9;
  const a = { x: facts.positions[offset], y: facts.positions[offset + 1], z: facts.positions[offset + 2] };
  const b = { x: facts.positions[offset + 3], y: facts.positions[offset + 4], z: facts.positions[offset + 5] };
  const c = { x: facts.positions[offset + 6], y: facts.positions[offset + 7], z: facts.positions[offset + 8] };
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const magnitude = Math.hypot(normal.x, normal.y, normal.z);
  if (!(magnitude > 1e-12)) return null;
  return {
    regionId: facts.faceRegionIds[faceIndex],
    ownerPatchId: -1,
    position: { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 },
    normal: { x: normal.x / magnitude, y: normal.y / magnitude, z: normal.z / magnitude },
    faceIndex,
    area: magnitude * 0.5,
  };
}

function classifyOutside(
  detection: SkinRebuildOverhangDetection,
  positions: Float32Array,
): { outsideFaces: SparseRemovableSupportFace[]; inside: number; unresolved: number } {
  const index = createSupportReachabilityIndex(positions);
  const outsideFaces: SparseRemovableSupportFace[] = [];
  let inside = 0;
  let unresolved = 0;
  for (let faceIndex = 0; faceIndex < detection.faceCount; faceIndex += 1) {
    const classification: SupportReachabilityClassification = index.classifyTriangle(detection.positions, faceIndex * 9);
    if (classification === "outside") {
      const face = triangleFace(detection, faceIndex);
      if (face) outsideFaces.push(face);
    } else if (classification === "inside") inside++;
    else unresolved++;
  }
  return { outsideFaces, inside, unresolved };
}

export async function diagnoseArtworkCandidate(
  candidate: ArtworkCandidateSnapshot,
  settings: CandidateDiagnosticSettings = {
    overhangThresholdDeg: ASTRA_COMMON_SUPPORT_SETTINGS.overhangThresholdDeg,
    plateFloorMm: 0,
    plateBandMm: ASTRA_COMMON_SUPPORT_SETTINGS.plateBandMm,
  },
): Promise<CandidateDiagnostics> {
  const preflight = candidatePreflight(candidate);
  if (preflight.blocked) {
    return {
      candidateId: candidate.candidateId,
      geometryFingerprint: candidate.geometryFingerprint,
      diagnosticsFingerprint: await sha256Hex(JSON.stringify({ candidate: candidate.geometryFingerprint, settings, blocked: preflight })),
      settings,
      preflight,
      overhangFaces: 0,
      overhangRegions: 0,
      outsideFaces: 0,
      insideExcludedFaces: 0,
      unresolvedFaces: 0,
      criticalTargets: 0,
      outsideSupportFaces: [],
      detection: {
        positions: new Float32Array(0),
        faceCount: 0,
        regionCount: 0,
        areaSourceSquared: 0,
        totalAreaSourceSquared: 0,
        regions: [],
        faceRegionIds: new Int32Array(0),
      },
    };
  }
  const detection = detectSkinRebuildOverhangRegions(
    positionsToTriangles(candidate.exactPrintSpacePositionsMm),
    settings.overhangThresholdDeg,
    settings.plateFloorMm,
    settings.plateBandMm,
  );
  const classified = classifyOutside(detection, candidate.exactPrintSpacePositionsMm);
  const diagnosticsFingerprint = await sha256Hex(JSON.stringify({
    candidate: candidate.geometryFingerprint,
    settings,
    faceCount: detection.faceCount,
    regionCount: detection.regionCount,
    outside: classified.outsideFaces.length,
    inside: classified.inside,
    unresolved: classified.unresolved,
  }));
  return {
    candidateId: candidate.candidateId,
    geometryFingerprint: candidate.geometryFingerprint,
    diagnosticsFingerprint,
    settings,
    preflight,
    overhangFaces: detection.faceCount,
    overhangRegions: detection.regionCount,
    outsideFaces: classified.outsideFaces.length,
    insideExcludedFaces: classified.inside,
    unresolvedFaces: classified.unresolved,
    criticalTargets: classified.outsideFaces.length,
    outsideSupportFaces: classified.outsideFaces,
    detection,
  };
}

export function makeRabbitForbiddenSdf(
  signedDistance: (point: HostVec3) => number,
  transform: CandidatePrintTransform,
): (x: number, y: number, z: number) => number {
  return (x, y, z) => signedDistance({
    x: x - transform.translationMm.x,
    y: y - transform.translationMm.y,
    z: z - transform.translationMm.z,
  });
}

export async function buildArtworkCandidateSupport(
  candidate: ArtworkCandidateSnapshot,
  diagnostics: CandidateDiagnostics,
  rabbitForbiddenSdf: (x: number, y: number, z: number) => number,
  settings: CandidateSupportSettings = ASTRA_COMMON_SUPPORT_SETTINGS,
): Promise<CandidateSupportResult> {
  if (diagnostics.geometryFingerprint !== candidate.geometryFingerprint) {
    throw new Error("Candidate changed after diagnostics; support is stale");
  }
  if (diagnostics.preflight.blocked) throw new Error(diagnostics.preflight.blockReason ?? "Candidate preflight blocked");
  const bodyQuery = candidate.sourceInstance.signedVolumeQuery;
  if (!bodyQuery) throw new Error("Candidate Signed Volume is unavailable");
  const bounds = triangleSoupBounds(candidate.exactPrintSpacePositionsMm);
  const candidateLongestExtent = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const plateBounds = deriveA1MiniPlateBoundsFromBodyPositions(
    candidate.exactPrintSpacePositionsMm,
    candidateLongestExtent,
  );
  const request: SparseRemovableSupportRequest = {
    projectedOutsideFaces: diagnostics.outsideSupportFaces,
    outsideRegionCount: diagnostics.overhangRegions,
    plateZ: 0,
    shaftRadius: settings.shaftDiameterMm * 0.5,
    neckRadius: settings.neckDiameterMm * 0.5,
    bodySdf: (x, y, z) => transformedBodyDistance(candidate, { x, y, z }),
    contactPolicy: "single-body",
    forbiddenSdf: rabbitForbiddenSdf,
    forbiddenClearanceMm: settings.hostClearanceMm,
    removalGapMm: settings.removalGapMm,
    lowStartBand: settings.lowStartBandMm,
    maxCandidatesPerRegion: settings.maxCandidatesPerRegion,
    maxLeaningRoutes: settings.maxLeaningRoutes,
    coverageRadius: settings.coverageRadiusMm,
    plateBounds,
    maximumOverlapLength: settings.neckDiameterMm + settings.shaftDiameterMm,
    maximumDepth: settings.neckDiameterMm + settings.shaftDiameterMm,
  };
  const sparse = buildSparseRemovableSupport(request);
  const supportFingerprint = await sha256Hex(JSON.stringify({
    candidate: candidate.geometryFingerprint,
    diagnostics: diagnostics.diagnosticsFingerprint,
    rabbitSourceSha256: ASTRA_RABBIT_SOURCE_SHA256,
    rabbitRepairFingerprint: ASTRA_RABBIT_REPAIR_FINGERPRINT,
    settings,
    graph: sparse.graph,
  }));
  return {
    candidateId: candidate.candidateId,
    geometryFingerprint: candidate.geometryFingerprint,
    diagnosticsFingerprint: diagnostics.diagnosticsFingerprint,
    supportFingerprint,
    settings,
    sparse,
    rabbitForbiddenTargetCount: sparse.diagnostics.rejectedByForbiddenVolume,
  };
}

export async function exportArtworkCandidate3mf(
  candidate: ArtworkCandidateSnapshot,
  support: CandidateSupportResult,
): Promise<CandidateExportResult> {
  if (support.geometryFingerprint !== candidate.geometryFingerprint) {
    throw new Error("Candidate / Support fingerprint mismatch; export blocked");
  }
  const supportMesh = support.sparse.graph.edges.length > 0
    ? buildPrintSupportMesh(support.sparse.graph, 1, { radialSegments: 12 })
    : null;
  const supportPositions = supportMesh
    ? Float32Array.from(supportMesh.triangles.flatMap((triangle) => [
      triangle.a.x, triangle.a.y, triangle.a.z,
      triangle.b.x, triangle.b.y, triangle.b.z,
      triangle.c.x, triangle.c.y, triangle.c.z,
    ]))
    : new Float32Array(0);
  const result = await buildBambu3mf([
    { name: `ASTRA_${candidate.candidateId}_ARTWORK`, role: "body", positions: candidate.exactPrintSpacePositionsMm },
    { name: `SKIN_${candidate.candidateId}_PRINT_SUPPORT`, role: "printable_support", positions: supportPositions },
  ], {
    title: `Astra ${candidate.candidateId} candidate physical comparison`,
    supportType: "normal(manual)",
    mergePrintableSupportIntoBody: false,
  });
  const validation = await validateSkin3mf(result.archive);
  const exportFingerprint = await sha256Hex(JSON.stringify({
    candidate: candidate.geometryFingerprint,
    support: support.supportFingerprint,
    package: "candidate-body-plus-separate-print-support-v0",
  }));
  return {
    candidateId: candidate.candidateId,
    geometryFingerprint: candidate.geometryFingerprint,
    supportFingerprint: support.supportFingerprint,
    exportFingerprint,
    archive: result.archive,
    stats: result.stats,
    validation,
    candidateFingerprintParity: candidate.geometryFingerprint === support.geometryFingerprint,
    supportTriangleCount: supportPositions.length / 9,
  };
}

export function currentnessParity(
  candidate: ArtworkCandidateSnapshot,
  diagnostics: CandidateDiagnostics,
  support: CandidateSupportResult,
  exported: CandidateExportResult,
): boolean {
  return candidate.geometryFingerprint === diagnostics.geometryFingerprint
    && diagnostics.geometryFingerprint === support.geometryFingerprint
    && support.geometryFingerprint === exported.geometryFingerprint
    && exported.candidateFingerprintParity;
}

/** Fail-closed state contract for display-only changes versus geometry and
 * common-setting changes. A new candidate invalidates every downstream stage;
 * a changed settings snapshot invalidates Support and Export. */
export function evaluateCandidatePipelineCurrentness(
  candidate: ArtworkCandidateSnapshot,
  diagnostics: CandidateDiagnostics | null,
  support: CandidateSupportResult | null,
  exported: CandidateExportResult | null,
  expectedSettings?: CandidateSupportSettings,
): CandidatePipelineCurrentness {
  const diagnosticsCurrent = diagnostics !== null
    && diagnostics.geometryFingerprint === candidate.geometryFingerprint;
  const supportSettingsCurrent = expectedSettings === undefined || support === null
    ? true
    : JSON.stringify(support.settings) === JSON.stringify(expectedSettings);
  const supportCurrent = diagnosticsCurrent
    && support !== null
    && support.geometryFingerprint === candidate.geometryFingerprint
    && support.diagnosticsFingerprint === diagnostics!.diagnosticsFingerprint
    && supportSettingsCurrent;
  const exportCurrent = supportCurrent
    && exported !== null
    && exported.geometryFingerprint === candidate.geometryFingerprint
    && exported.supportFingerprint === support!.supportFingerprint;
  return { diagnosticsCurrent, supportCurrent, exportCurrent };
}

export function triangleSoupBounds(positions: Float32Array): { min: HostVec3; max: HostVec3 } {
  const min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY };
  const max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY };
  for (let index = 0; index < positions.length; index += 3) {
    min.x = Math.min(min.x, positions[index]); min.y = Math.min(min.y, positions[index + 1]); min.z = Math.min(min.z, positions[index + 2]);
    max.x = Math.max(max.x, positions[index]); max.y = Math.max(max.y, positions[index + 1]); max.z = Math.max(max.z, positions[index + 2]);
  }
  return { min, max };
}

export function candidatePlateTransformToHostTransform(transform: CandidatePrintTransform): HostInstanceTransform {
  return {
    translation: clonePoint(transform.translationMm),
    rotation: transform.rotation,
    uniformScale: transform.uniformScale,
  };
}

export function candidateMeshVertex(position: HostVec3): MeshVertex {
  return { x: position.x, y: position.y, z: position.z };
}

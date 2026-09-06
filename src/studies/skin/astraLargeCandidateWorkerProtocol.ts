import type { CandidateDiagnosticSettings, CandidateSupportSettings } from "./astraCandidatePrintLane.ts";
import type { PackedCandidateQueryTelemetry } from "./astraPackedCandidateQuery.ts";
import type { HostSignedVolumeQueryTelemetry } from "./externalStlHostVolume.ts";
import type { DeferredPrintPlacement } from "./astraLargeCandidateSourceSpace.ts";
import type { SparseSupportPerformance } from "./rebuild/sparseRemovableSupport.ts";

export type LargeCandidateId = "A" | "G" | "H" | "J";

export type LargeCandidateCommand = {
  type: "LOAD_REFERENCE_HOST";
  requestId: number;
  generation: number;
  filename: string;
  file: Blob;
} | {
  type: "INVENTORY_CANDIDATE";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  filename: string;
  file: Blob;
} | {
  type: "ACTIVATE_CANDIDATE";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  filename: string;
  file: Blob;
  placement: DeferredPrintPlacement;
  telemetry?: boolean;
} | {
  type: "DIAGNOSE";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
  settings: CandidateDiagnosticSettings;
} | {
  type: "BUILD_SUPPORT";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
  diagnosticsFingerprint: string;
  settings: CandidateSupportSettings;
  profile?: {
    enabled: boolean;
    maxProcessedTargets?: number;
    maxRouteAudits?: number;
  };
} | {
  type: "EXPORT_3MF";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
  supportFingerprint: string;
} | {
  type: "RELEASE_CANDIDATE";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
} | {
  type: "CANCEL";
  requestId: number;
  generation: number;
};

export type LargeCandidateProgressStage =
  | "Reading STL"
  | "Hashing"
  | "Parsing source-space positions"
  | "Topology preflight"
  | "Building Candidate query"
  | "Overhang detection"
  | "Outside classification"
  | "Sparse Support"
  | "Support mesh"
  | "Indexing BODY"
  | "Indexing Support"
  | "Writing vertices"
  | "Writing triangles"
  | "Compressing model XML"
  | "Assembling ZIP"
  | "3MF"
  | "Validation"
  | "Release";

export interface LargeCandidateInventory {
  readonly candidateId: LargeCandidateId;
  readonly filename: string;
  readonly sourceByteLength: number;
  readonly sourceSha256: string;
  readonly sourceGeometrySha256: string;
  readonly executionGeometrySha256: string;
  readonly triangleCount: number;
  readonly executionTriangleCount: number;
  readonly finite: boolean;
  readonly nearDegenerateCount: number;
  readonly exactZeroTriangleCount: number;
  readonly removedExactZeroSourceFaceIndices: readonly number[];
  readonly bounds: { readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } };
  readonly topologyStatus: "NOT_RECOMPUTED";
  readonly astraRound2Evidence: "PASS";
}

export interface LargeCandidateCompactSummary {
  readonly candidateId: LargeCandidateId;
  readonly sourceSha256: string;
  readonly geometryFingerprint: string;
  readonly diagnosticsFingerprint?: string;
  readonly supportFingerprint?: string;
  readonly timings: Record<string, number>;
  readonly telemetry: {
    readonly peakJsHeapBytes: number | null;
    readonly largestTypedArrayBytes: number;
    readonly residentTypedArrayBytes: number;
  };
  readonly performance?: {
    readonly support: SparseSupportPerformance;
    readonly candidateQuery: PackedCandidateQueryTelemetry;
    readonly candidateBodySignedDistanceCalls: number;
    readonly rabbitSignedDistanceCalls: number;
    readonly rabbitSignedQuery: HostSignedVolumeQueryTelemetry;
    readonly rabbitUnsignedSurfaceDistanceCalls: number;
    readonly rabbitUnsignedSurfaceDistanceMs: number;
    readonly boundedSemanticDigest?: string;
    readonly candidateBodyAuditMs: number;
    readonly rabbitAuditMs: number;
  };
  readonly inventory: LargeCandidateInventory;
  readonly diagnostics?: Record<string, number | string>;
  readonly support?: Record<string, number>;
  readonly export?: {
    readonly archive: ArrayBuffer;
    readonly archiveBytes: number;
    readonly generatedSupportTriangleCount: number;
    readonly indexedSupportFaceCount: number;
    readonly supportRemovedDegenerateTriangles: number;
    readonly validator: "PASS" | "FAIL";
    readonly exportFingerprint: string;
    readonly expectedPackageTranslationZ: number;
    readonly actualPackageTranslationZ: number;
    readonly packagePlacementParity: boolean;
    readonly bodyRemovedDegenerateTriangles: number;
    readonly bodyVertices: number;
    readonly bodyFaces: number;
    readonly modelUncompressedBytes: number;
    readonly compressedModelBytes: number;
    readonly largestSerializationChunkBytes: number;
    readonly bodyIndexedVertexBytes: number;
    readonly bodyIndexedIndexBytes: number;
    readonly supportIndexedBytes: number;
    readonly peakJsHeapBytes: number | null;
    readonly exportElapsedMs: number;
  };
}

export type LargeCandidateWorkerMessage = {
  type: "PROGRESS";
  requestId: number;
  generation: number;
  candidateId?: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
  stage: LargeCandidateProgressStage;
  completed?: number;
  total?: number;
  detail?: string;
  elapsedMs: number;
} | {
  type: "REFERENCE_READY";
  requestId: number;
  generation: number;
  sourceSha256: string;
  geometryFingerprint: string;
  repairFingerprint: string;
  signedVolume: "AVAILABLE" | "UNAVAILABLE";
} | {
  type: "INVENTORY";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
  inventory: LargeCandidateInventory;
} | {
  type: "DIAGNOSTICS";
  requestId: number;
  generation: number;
  summary: LargeCandidateCompactSummary;
} | {
  type: "SUPPORT";
  requestId: number;
  generation: number;
  summary: LargeCandidateCompactSummary;
} | {
  type: "EXPORT";
  requestId: number;
  generation: number;
  summary: LargeCandidateCompactSummary;
} | {
  type: "RELEASED";
  requestId: number;
  generation: number;
  candidateId: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
  releasedTypedArrayBytes: number;
} | {
  type: "ERROR";
  requestId: number;
  generation: number;
  candidateId?: LargeCandidateId;
  sourceSha256: string;
  geometryFingerprint: string;
  stage: LargeCandidateProgressStage | "Protocol";
  message: string;
};

/** Main-thread gate: a response from a previous run cannot mutate current UI. */
export function isLargeCandidateMessageCurrent(messageGeneration: number, currentGeneration: number): boolean {
  return messageGeneration === currentGeneration;
}

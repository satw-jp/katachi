import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { SurfaceAngleDiagnosisMetrics, SurfaceAngleDiagnosisProgressStage } from "./surfaceAngleDiagnosis.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
import type {
  Stage7ProvisionalDeltaBaseline,
  Stage7ProvisionalRecheckMode,
  Stage7ProvisionalReachabilityProof,
} from "./stage7ProvisionalDeltaRecheck.ts";

export type SurfaceAngleDiagnosisView = "before" | "after";

export interface SurfaceAngleDiagnosisBuildRequest {
  type: "build";
  generation: number;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  internalGraph: InternalStructureGraph | null;
  roundK: number;
  coinBulge: number;
  coinBulgeBalance: number;
  quadMeshJoinWidth: number;
  mode: SkinMode;
  thresholdDeg: number;
  resolution: number;
  targetLongestMm: number;
  workerCount: number;
}

export interface SurfaceAngleDiagnosisRecheckRequest {
  type: "recheck";
  generation: number;
  basePositions: Float32Array;
  baseNormals: Float32Array;
  baseFaceCount: number;
  resolution: number;
  internalGraph: InternalStructureGraph | null;
  thresholdDeg: number;
  meshStep: number;
  mode: SkinMode;
  patches: Patch[];
  roundK: number;
  previousElapsedMs: number;
  /** Optional saved final-mesh attribution. Presence, including [], selects the reuse path. */
  motifLowestPoints?: MotifLowestPoint[];
  /** Optional Stage 7 execution request; omitted callers retain the old full path. */
  recheckMode?: Stage7ProvisionalRecheckMode;
  /** Base graph used only to prove additive/split reachability for delta mode. */
  baseGraph?: InternalStructureGraph | null;
  /** Exact baseline captured from the current Stage 7 result, never live-derived in the Worker. */
  baseline?: Stage7ProvisionalDeltaBaseline;
}

export type SurfaceAngleDiagnosisRequest = SurfaceAngleDiagnosisBuildRequest | SurfaceAngleDiagnosisRecheckRequest;

export type SurfaceAngleWorkerMessage = {
  type: "progress";
  generation: number;
  completedSlices: number;
  totalSlices: number;
  faceCount: number;
  elapsedMs: number;
  /** Optional phase fields keep the original mesh-build progress wire shape compatible. */
  stage?: SurfaceAngleDiagnosisProgressStage;
  completed?: number;
  total?: number;
  /** Runtime-only Stage 7 scope metadata; absent for legacy/build progress. */
  recheckMode?: Stage7ProvisionalRecheckMode;
  recheckQueryFaceCount?: number;
  recheckBaselineFaceCount?: number;
} | {
  type: "result";
  generation: number;
  metrics: SurfaceAngleDiagnosisMetrics;
  basePositions: Float32Array;
  baseNormals: Float32Array;
  baseFaceCount: number;
  resolution: number;
  internalEdgeCount: number;
  motifLowestPoints: MotifLowestPoint[];
  beforeDangerPositions: Float32Array;
  afterDangerPositions: Float32Array;
  mitigatedPositions: Float32Array;
  elapsedMs: number;
  /** Runtime-only audit for Stage 7; absent for legacy/canonical rechecks. */
  recheckAudit?: {
    requestedMode: Stage7ProvisionalRecheckMode;
    mode: Stage7ProvisionalRecheckMode;
          queryFaceCount: number;
          baselineBeforeDangerFaceCount: number;
          baselineAfterDangerFaceCount: number;
          monotonicProof: Stage7ProvisionalReachabilityProof | "not-requested";
          fallbackReason?: "proof-failed" | "baseline-invalid" | "composition-mismatch";
        };
} | {
  type: "error";
  generation: number;
  message: string;
  elapsedMs: number;
};

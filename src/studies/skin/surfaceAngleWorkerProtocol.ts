import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { SurfaceAngleDiagnosisMetrics } from "./surfaceAngleDiagnosis.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";

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
  internalGraph: InternalStructureGraph;
  thresholdDeg: number;
  meshStep: number;
  mode: SkinMode;
  patches: Patch[];
  roundK: number;
  previousElapsedMs: number;
}

export type SurfaceAngleDiagnosisRequest = SurfaceAngleDiagnosisBuildRequest | SurfaceAngleDiagnosisRecheckRequest;

export type SurfaceAngleWorkerMessage = {
  type: "progress";
  generation: number;
  completedSlices: number;
  totalSlices: number;
  faceCount: number;
  elapsedMs: number;
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
} | {
  type: "error";
  generation: number;
  message: string;
  elapsedMs: number;
};

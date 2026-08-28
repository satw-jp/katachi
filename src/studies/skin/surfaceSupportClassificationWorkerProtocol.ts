import type { Ball } from "../cloud-sculpt/field.ts";
import type {
  OverhangAssignmentEntry,
  OverhangExplicitTargetMm,
  OverhangSupportRayFacts,
  OverhangSupportPolicyResult,
} from "./overhangSupportPolicy.ts";
import type { SurfaceAngleResult } from "./surfaceAnglePersistentCache.ts";

export interface SurfaceSupportClassificationRequest {
  type: "classify";
  generation: number;
  diagnosis: SurfaceAngleResult;
  targetLongestMm: number;
  host: Ball[];
  hostK: number;
  explicitTargets: OverhangExplicitTargetMm[];
  workerCount: number;
}

export interface SurfaceSupportClassificationChunkRequest {
  type: "classify-chunk";
  generation: number;
  chunkIndex: number;
  startFaceIndex: number;
  endFaceIndex: number;
  faces: Float32Array;
  supportSurfacePositionsMm: Float32Array;
  /** Only chunk 0 receives these; its raw entries are appended after the
   * globally merged diagnosed-face entries by the coordinator. */
  explicitTargets: OverhangExplicitTargetMm[];
}

export type SurfaceSupportClassificationChildRequest = SurfaceSupportClassificationChunkRequest;

export type SurfaceSupportClassificationChildMessage = {
  type: "progress";
  generation: number;
  chunkIndex: number;
  completedFaceCount: number;
  totalFaceCount: number;
} | {
  type: "result";
  generation: number;
  chunkIndex: number;
  startFaceIndex: number;
  endFaceIndex: number;
  entries: OverhangAssignmentEntry[];
  explicitEntries: OverhangAssignmentEntry[];
  diagnosedFacePositionsMm: Float32Array;
  rayFacts: OverhangSupportRayFacts;
} | {
  type: "error";
  generation: number;
  chunkIndex: number;
  message: string;
};

export type SurfaceSupportClassificationWorkerRequest =
  | SurfaceSupportClassificationRequest
  | SurfaceSupportClassificationChunkRequest;

export type SurfaceSupportClassificationMessage = {
  type: "result";
  generation: number;
  diagnosis: SurfaceAngleResult;
  automaticResult: OverhangSupportPolicyResult;
  computeMs: number;
} | {
  type: "progress";
  generation: number;
  classifiedFaceCount: number;
  totalFaceCount: number;
  workerCount: number;
  elapsedMs: number;
} | {
  type: "error";
  generation: number;
  message: string;
  computeMs: number;
};

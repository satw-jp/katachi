import type { Ball } from "../cloud-sculpt/field.ts";
import type { OverhangExplicitTargetMm, OverhangSupportPolicyResult } from "./overhangSupportPolicy.ts";
import type { SurfaceAngleResult } from "./surfaceAnglePersistentCache.ts";

export interface SurfaceSupportClassificationRequest {
  type: "classify";
  generation: number;
  diagnosis: SurfaceAngleResult;
  targetLongestMm: number;
  host: Ball[];
  hostK: number;
  explicitTargets: OverhangExplicitTargetMm[];
}

export type SurfaceSupportClassificationMessage = {
  type: "result";
  generation: number;
  diagnosis: SurfaceAngleResult;
  automaticResult: OverhangSupportPolicyResult;
  computeMs: number;
} | {
  type: "error";
  generation: number;
  message: string;
  computeMs: number;
};

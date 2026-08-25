import type { OverhangSupportPolicyResult } from "./overhangSupportPolicy.ts";
import type { SupportPaintV1 } from "./supportPaint.ts";

export interface SupportPaintWorkerRequest {
  type: "apply";
  revision: number;
  automaticResult: OverhangSupportPolicyResult;
  supportSurfacePositionsMm: Float32Array;
  supportPaint: SupportPaintV1 | null;
}

export type SupportPaintWorkerMessage =
  | {
      type: "result";
      revision: number;
      result: OverhangSupportPolicyResult;
      computeMs: number;
    }
  | {
      type: "error";
      revision: number;
      message: string;
      computeMs: number;
    };

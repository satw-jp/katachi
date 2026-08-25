import type { OverhangSupportPolicyResult } from "./overhangSupportPolicy.ts";
import type { SupportPaintStrokeV1, SupportPaintV1 } from "./supportPaint.ts";
import type { SupportPaintLiveChange, SupportPaintLiveSnapshot } from "./supportPaintLive.ts";

export type SupportPaintWorkerRequest =
  | {
      type: "initialize";
      generation: number;
      revision: number;
      automaticResult: OverhangSupportPolicyResult;
      supportSurfacePositionsMm: Float32Array;
      supportPaint: SupportPaintV1 | null;
    }
  | {
      type: "dab";
      generation: number;
      revision: number;
      requestId: number;
      stroke: SupportPaintStrokeV1;
    }
  | {
      type: "replace";
      generation: number;
      revision: number;
      requestId: number;
      supportPaint: SupportPaintV1;
    }
  | {
      type: "restore";
      generation: number;
      revision: number;
      requestId: number;
      snapshot: SupportPaintLiveSnapshot;
    };

export type SupportPaintWorkerMessage =
  | {
      type: "ready";
      generation: number;
      revision: number;
      snapshot: SupportPaintLiveSnapshot;
      computeMs: number;
    }
  | {
      type: "dab";
      generation: number;
      revision: number;
      requestId: number;
      changes: SupportPaintLiveChange[];
      facts: SupportPaintLiveSnapshot["facts"];
      computeMs: number;
    }
  | {
      type: "replace";
      generation: number;
      revision: number;
      requestId: number;
      changes: SupportPaintLiveChange[];
      facts: SupportPaintLiveSnapshot["facts"];
      computeMs: number;
    }
  | {
      type: "restore";
      generation: number;
      revision: number;
      requestId: number;
      changes: SupportPaintLiveChange[];
      facts: SupportPaintLiveSnapshot["facts"];
      computeMs: number;
    }
  | {
      type: "error";
      generation: number;
      revision: number;
      requestId?: number;
      message: string;
      computeMs: number;
    };

export const HANA_FINALIZATION_STATES = [
  "IDLE",
  "EDITING",
  "FINAL_REQUESTED",
  "FINAL_BUILDING",
  "FINAL_CPU_READY",
  "FINAL_UPLOAD_SUBMITTED",
  "FINAL_PRESENTED",
] as const;

export type HanaFinalizationState = typeof HANA_FINALIZATION_STATES[number];

export interface HanaFinalizationTimestamps {
  tPointerUp: number | null;
  tProxyFrozen: number | null;
  tProxyFrozenPresented: number | null;
  tFinalBuildStart: number | null;
  tSmoothReady: number | null;
  tMaterialReady: number | null;
  tKDTreeReady: number | null;
  tFieldReady: number | null;
  tMeshReady: number | null;
  tGeometryReady: number | null;
  tUploadSubmitted: number | null;
  tFirstRender: number | null;
  tNextRAF: number | null;
  tFinalPresented: number | null;
  tReady: number | null;
}

export interface HanaFinalizationTrace {
  documentRevision: number;
  editSessionId: number;
  finalRequestId: number;
  finalGenerationId: number;
  state: HanaFinalizationState;
  finalizeReason: string;
  finalProfile: "normal" | "skip" | "cpu-only" | "upload-only";
  status: "pending" | "completed" | "skipped" | "failed";
  skipReason: string | null;
  error: string | null;
  timestamps: HanaFinalizationTimestamps;
  stages: Record<string, number | null>;
  counts: Record<string, number | string | null>;
}

const timestampKeyByState: Partial<Record<HanaFinalizationState, keyof HanaFinalizationTimestamps>> = {
  FINAL_BUILDING: "tFinalBuildStart",
  FINAL_CPU_READY: "tMeshReady",
  FINAL_UPLOAD_SUBMITTED: "tUploadSubmitted",
  FINAL_PRESENTED: "tFinalPresented",
};

export function createHanaFinalizationTrace(input: {
  documentRevision: number;
  editSessionId: number;
  finalRequestId: number;
  finalGenerationId: number;
  finalizeReason: string;
  finalProfile: HanaFinalizationTrace["finalProfile"];
  pointerUpTimestamp: number | null;
}): HanaFinalizationTrace {
  return {
    documentRevision: input.documentRevision,
    editSessionId: input.editSessionId,
    finalRequestId: input.finalRequestId,
    finalGenerationId: input.finalGenerationId,
    state: "FINAL_REQUESTED",
    finalizeReason: input.finalizeReason,
    finalProfile: input.finalProfile,
    status: "pending",
    skipReason: null,
    error: null,
    timestamps: {
      tPointerUp: input.pointerUpTimestamp,
      tProxyFrozen: null,
      tProxyFrozenPresented: null,
      tFinalBuildStart: null,
      tSmoothReady: null,
      tMaterialReady: null,
      tKDTreeReady: null,
      tFieldReady: null,
      tMeshReady: null,
      tGeometryReady: null,
      tUploadSubmitted: null,
      tFirstRender: null,
      tNextRAF: null,
      tFinalPresented: null,
      tReady: null,
    },
    stages: {},
    counts: {},
  };
}

/** Pure state transition used by the HANA finalization diagnostic. */
export function transitionHanaFinalization(
  trace: HanaFinalizationTrace,
  state: HanaFinalizationState,
  timestamp: number,
): HanaFinalizationTrace {
  const next: HanaFinalizationTrace = {
    ...trace,
    state,
    timestamps: { ...trace.timestamps },
    stages: { ...trace.stages },
    counts: { ...trace.counts },
  };
  const timestampKey = timestampKeyByState[state];
  if (timestampKey) next.timestamps[timestampKey] = timestamp;
  return next;
}

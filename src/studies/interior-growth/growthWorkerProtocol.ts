// ---------------------------------------------------------------------------
// Message protocol shared between main.ts and growth.worker.ts (O3 §8).
//
// Kept in its own file — not inside growth.ts or growth.worker.ts — so both
// sides import the identical types without either file pulling in the other's
// runtime code. Same precedent as skin/partitionWorkerProtocol.ts.
//
// Cancellation is `worker.terminate()` from main.ts, not a flag the Worker
// polls: growNetwork + buildCandidateMesh run as one long synchronous stretch,
// so the Worker's own message loop is blocked for the whole run and could not
// receive a cancel message anyway. Terminate is blunt but immediate and
// correct here — there is no partial state worth preserving, and main.ts
// discards the results of a terminated run by requestId regardless.
// ---------------------------------------------------------------------------

import type { FabricationEnvelope, GrowthParams, HostFixtureId, Vec3 } from "./field.ts";
import type { GrowthResult, GrowthVariant } from "./growth.ts";
import type { MeshBuildResult } from "../cloud-sculpt/meshExport.ts";
import type { SaveGateResult } from "./meshExport.ts";

export interface GenerateRequest {
  type: "generate";
  /** Monotonically increasing per main.ts session. Every reply carries it back so a reply from a superseded run can be dropped instead of overwriting newer state (§8 "stale result破棄"). */
  requestId: number;
  hostId: HostFixtureId;
  envelope: FabricationEnvelope;
  params: GrowthParams;
  variants: GrowthVariant[];
  canonicalScaleMmPerUnit: number;
  buildVolumeMm: Vec3;
  meshResolution: number;
  blendK: number;
}

/** Which stage of one candidate is running. Reported separately from the candidate index so the UI can say "2/3 · mesh" rather than one opaque percentage. */
export type GenerateStage = "growth" | "mesh" | "gate";

export interface GenerateProgress {
  type: "progress";
  requestId: number;
  /** 1-based index of the candidate being worked on, and how many there are in total (§8's "1/3、2/3、3/3"). */
  candidateIndex: number;
  candidateTotal: number;
  variant: GrowthVariant;
  stage: GenerateStage;
  /** Units accepted so far / the run's own unit ceiling, for the growth stage. Both 0 outside it. */
  completed: number;
  total: number;
  /** Milliseconds since the Worker received THIS request — never since module load, so it measures the work and not the Worker's own startup. */
  elapsedMs: number;
}

export interface GeneratedCandidate {
  result: GrowthResult;
  /** Absent when mesh construction failed for this candidate; `meshError` then says why. The candidate itself is still returned — a candidate that grew but cannot be meshed is a real result, not an error for the whole batch. */
  mesh?: MeshBuildResult;
  gate?: SaveGateResult;
  meshError?: string;
  growthMs: number;
  meshMs: number;
}

export type GrowthWorkerMessage =
  | GenerateProgress
  | { type: "result"; requestId: number; candidates: GeneratedCandidate[]; elapsedMs: number }
  | { type: "error"; requestId: number; message: string; elapsedMs: number };

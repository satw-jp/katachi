// ---------------------------------------------------------------------------
// Message protocol shared between main.ts and partition.worker.ts (T13 audit
// fix P0-2: buildPartitionMeshes moved off the main thread). Kept in its own
// file (not inside partition.ts or partition.worker.ts) so both sides import
// the identical types without either file needing to import the other's
// runtime code.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { PartitionOptions, PartitionResult } from "./partition.ts";

export interface PartitionBuildRequest {
  type: "build";
  requestId: number;
  mode: SkinMode;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  groupA: number[];
  groupB: number[];
  roundK: number;
  options: PartitionOptions;
  /** T14: explicit, never implicitly defaulted inside the Worker -- main.ts
   * must always pass the live state.skinParams.coinBulge value here. */
  coinBulge: number;
}

export type PartitionWorkerMessage =
  | { type: "progress"; requestId: number; stage: string; fraction: number; elapsedMs: number }
  | { type: "result"; requestId: number; result: PartitionResult; elapsedMs: number }
  | { type: "error"; requestId: number; message: string; elapsedMs: number };

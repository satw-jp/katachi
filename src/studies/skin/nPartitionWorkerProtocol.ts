import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { PartitionOptions } from "./partition.ts";
import type { NPartitionResult } from "./nPartition.ts";

export interface NPartitionBuildRequest {
  type: "build-n";
  requestId: number;
  mode: SkinMode;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  groups: number[][];
  roundK: number;
  options: PartitionOptions;
  coinBulge: number;
  coinBulgeBalance: number;
  quadMeshJoinWidth: number;
}

export type NPartitionWorkerMessage =
  | { type: "progress"; requestId: number; stage: string; fraction: number; elapsedMs: number }
  | { type: "result"; requestId: number; result: NPartitionResult; elapsedMs: number }
  | { type: "error"; requestId: number; message: string; elapsedMs: number };

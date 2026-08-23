import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { SkinScaffoldPillar } from "./scaffoldFusion.ts";

export interface PreviewMeshRequest {
  type: "build";
  requestId: number;
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
  resolution: number;
  targetLongestMm: number;
  workerCount: number;
  /** Optional final-export geometry. Preview requests leave this empty. */
  scaffoldPillars?: SkinScaffoldPillar[];
  /** Skip display normals when the caller only needs exact triangle positions. */
  positionsOnly?: boolean;
}

export type PreviewMeshWorkerMessage =
  | { type: "result"; requestId: number; generation: number; positions: Float32Array; normals: Float32Array; faceCount: number; resolution: number; elapsedMs: number }
  | { type: "error"; requestId: number; generation: number; message: string; elapsedMs: number };

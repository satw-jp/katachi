import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { InternalPrintGateReport } from "./internalPrintGate.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

export interface InternalPrintGateRequest {
  type: "check";
  requestId: number;
  generation: number;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  internalGraph: InternalStructureGraph;
  roundK: number;
  coinBulge: number;
  coinBulgeBalance: number;
  quadMeshJoinWidth: number;
  mode: SkinMode;
  resolution: number;
  targetLongestMm: number;
  workerCount: number;
  /** Exact final preview triangles for the same fingerprint, when already built. */
  prebuiltPositions?: Float32Array;
  baseName: string;
}

export type InternalPrintGateWorkerMessage =
  | { type: "result"; requestId: number; generation: number; report: InternalPrintGateReport; stl: ArrayBuffer; elapsedMs: number }
  | { type: "error"; requestId: number; generation: number; message: string; elapsedMs: number };

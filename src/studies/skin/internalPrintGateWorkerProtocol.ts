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
  /** Separate removable support used only for build-order reachability. It is
   * not fused into the BODY mesh generated from internalGraph. */
  printSupportGraph?: InternalStructureGraph | null;
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
  /** Keep the original-editor Stage 6 mesh identity equal to the standalone
   * SKIN REBUILD exporter, including its bounded tiny-island repair. */
  skinRebuildRepair?: boolean;
  buildPlateZSource?: number;
  baseName: string;
}

export type InternalPrintGateProgressPhase =
  | "preparing"
  | "sampling"
  | "assembling"
  | "topology"
  | "components"
  | "repair"
  | "saved-topology"
  | "printability"
  | "encoding";

export type InternalPrintGateWorkerMessage =
  | { type: "progress"; requestId: number; generation: number; phase: InternalPrintGateProgressPhase; completedSlices: number; totalSlices: number; faceCount: number; detail: string; elapsedMs: number }
  | { type: "result"; requestId: number; generation: number; report: InternalPrintGateReport; stl: ArrayBuffer; summary: string; scaleMmPerUnit: number; plateShiftSourceZ: number; repairedSavedTriangleHoleCount: number; elapsedMs: number }
  | { type: "error"; requestId: number; generation: number; message: string; elapsedMs: number };

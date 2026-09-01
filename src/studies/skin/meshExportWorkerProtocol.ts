import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { Stage6MeshTopologyDiagnostics } from "./rebuild/stage6MeshTopologyDiagnostics.ts";

export interface MeshExportRequest {
  type: "export";
  /** stl is used by print checking: build the exact final mesh and encode
   * only STL, without paying the unrelated OBJ serialization cost. */
  operation: "inspect" | "stl" | "export";
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
  baseName: string;
  /** Exact STL already accepted by the Internal Print Gate. Export may turn
   * this into OBJ in the Worker instead of evaluating the same field twice. */
  cachedStl?: ArrayBuffer;
  cachedSummary?: string;
  cachedScaleMmPerUnit?: number;
  /** Exact source-space Z translation already applied to cached BODY. */
  cachedPlateShiftSourceZ?: number;
  /** Removable support is exported as its own aligned STL/OBJ pair. */
  printSupportGraph?: InternalStructureGraph | null;
  /** Exact BODY triangles already sampled by a matching final preview or
   * mesh inspection. Reusing them skips the resolution³ field pass. */
  prebuiltPositions?: Float32Array;
}

export type MeshExportProgressPhase =
  | "preparing"
  | "sampling"
  | "assembling"
  | "topology"
  | "components"
  | "encoding"
  | "support";

export type MeshExportWorkerMessage =
  | {
      type: "progress";
      requestId: number;
      generation: number;
      phase: MeshExportProgressPhase;
      completedSlices: number;
      totalSlices: number;
      faceCount: number;
      detail: string;
      elapsedMs: number;
    }
  | {
      type: "result";
      requestId: number;
      generation: number;
      stl: ArrayBuffer;
      obj: string;
      supportStl?: ArrayBuffer;
      supportObj?: string;
      supportSummary?: string;
      /** Returned only by mesh inspection so the later Internal gate can
       * reuse the exact triangles without sampling the field again. */
      positions?: Float32Array;
      /** Flat display normals paired with inspection positions. Stage 6
       * uses these to show the exact meshed artwork, including 5B members. */
      normals?: Float32Array;
      /** Display-only raw component/degenerate-face evidence for Stage 6.4.
       * It never participates in repair, BODY generation, or export. */
      topologyDiagnostics?: Stage6MeshTopologyDiagnostics;
      summary: string;
      watertightOk: boolean;
      cacheHit: boolean;
      elapsedMs: number;
    }
  | {
      type: "error";
      requestId: number;
      generation: number;
      message: string;
      elapsedMs: number;
    };

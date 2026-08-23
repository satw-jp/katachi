import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

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
}

export type MeshExportWorkerMessage =
  | {
      type: "progress";
      requestId: number;
      generation: number;
      completedSlices: number;
      totalSlices: number;
      faceCount: number;
      elapsedMs: number;
    }
  | {
      type: "result";
      requestId: number;
      generation: number;
      stl: ArrayBuffer;
      obj: string;
      summary: string;
      watertightOk: boolean;
      elapsedMs: number;
    }
  | {
      type: "error";
      requestId: number;
      generation: number;
      message: string;
      elapsedMs: number;
    };

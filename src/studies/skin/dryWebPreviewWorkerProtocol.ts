import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch } from "./field.ts";
import type { OverhangAssignmentEntry, OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import type { DryWebRoutingFacts } from "./dryWebRouting.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

export interface DryWebPreviewWorkerRequest {
  type: "build";
  generation: number;
  requestId: number;
  paintRevision: number;
  surfaceFingerprint: string;
  resolution: number;
  entries: OverhangAssignmentEntry[];
  scaleMmPerUnit: number;
  host: Ball[];
  hostK: number;
  patches: Patch[];
  internalDensity: number;
  internalRadius: number;
}

export type DryWebPreviewWorkerMessage =
  | {
      type: "result";
      generation: number;
      requestId: number;
      paintRevision: number;
      surfaceFingerprint: string;
      resolution: number;
      targets: OverhangDryWebTarget[];
      facts: DryWebRoutingFacts;
      graph: InternalStructureGraph;
      computeMs: number;
    }
  | {
      type: "error";
      generation: number;
      requestId: number;
      paintRevision: number;
      message: string;
      computeMs: number;
    };

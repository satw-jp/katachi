import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch } from "./field.ts";
import type { OverhangAssignmentEntry, OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import type { DryWebRoutingFacts } from "./dryWebRouting.ts";
import type {
  TargetedGridProgressPhase,
  TargetedGridContactFloorFacts,
  TargetedGridTargetConnectionFact,
} from "./targetedGrid.ts";
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
  /** Explicit author-selected artwork contact floor for this generation.
   * Omitted requests retain the legacy builder fallback. */
  dryWebRequiredContacts?: number;
}

export type DryWebPreviewWorkerMessage =
  | {
      type: "progress";
      generation: number;
      requestId: number;
      paintRevision: number;
      surfaceFingerprint: string;
      resolution: number;
      phase: "routing" | TargetedGridProgressPhase;
      completed: number;
      total: number;
    }
  | {
      type: "result";
      generation: number;
      requestId: number;
      paintRevision: number;
      surfaceFingerprint: string;
      resolution: number;
      targets: OverhangDryWebTarget[];
      /** Runtime-only numeric mapping; old workers may omit this field. */
      targetConnectionFacts?: TargetedGridTargetConnectionFact[];
      /** Runtime-only contact-floor explanation; old workers may omit this field. */
      contactFloorFacts?: TargetedGridContactFloorFacts;
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

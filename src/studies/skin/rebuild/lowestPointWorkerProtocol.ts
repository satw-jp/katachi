import type { Patch } from "../field.ts";
import type { InternalStructureGraph } from "../voronoi.ts";
import type {
  SkinRebuildBase,
  SkinRebuildLowestPoint,
  SkinRebuildPatternSide,
  SkinRebuildSettings,
} from "./model.ts";
import type { SkinRebuildOverhangRegion } from "./overhangRegions.ts";
import type { SkinRebuildOverhangInteriorClassification } from "./overhangInteriorClassification.ts";

export type SkinRebuildLowestProgressPhase =
  | "mesh"
  | "fallback"
  | "orientation"
  | "attribution"
  | "reachability"
  | "overhang"
  | "complete";

export interface SkinRebuildLowestPointRequest {
  type: "build";
  requestId: number;
  base: SkinRebuildBase;
  patterns: Patch[];
  patternSides: SkinRebuildPatternSide[];
  dryWeb: InternalStructureGraph;
  settings: SkinRebuildSettings;
  workerCount: number;
}

export type SkinRebuildLowestPointWorkerMessage =
  | {
    type: "progress";
    requestId: number;
    phase: SkinRebuildLowestProgressPhase;
    completed: number;
    total: number;
    workerCount: number;
    faceCount: number;
    elapsedMs: number;
  }
  | {
    type: "result";
    requestId: number;
    lowestPoints: SkinRebuildLowestPoint[];
    meshPositions: Float32Array;
    meshNormals: Float32Array;
    overhangFacePositions: Float32Array;
    overhangFaceRegionIds: Int32Array;
    overhangRegions: SkinRebuildOverhangRegion[];
    overhangInterior: SkinRebuildOverhangInteriorClassification;
    overhangFaceCount: number;
    overhangRegionCount: number;
    overhangAreaMm2: number;
    overhangAreaPercent: number;
    workerCount: number;
    faceCount: number;
    parallel: boolean;
    elapsedMs: number;
  }
  | {
    type: "error";
    requestId: number;
    message: string;
    elapsedMs: number;
  };

/** One browser thread remains available for interaction. Up to sixteen
 * slices let 10-core/20-thread desktops participate without creating a
 * Worker per logical thread and overwhelming lower-end machines. */
export function chooseSkinRebuildLowestWorkerCount(hardwareConcurrency: number | undefined): number {
  const available = Number.isFinite(hardwareConcurrency) && (hardwareConcurrency ?? 0) > 0
    ? Math.floor(hardwareConcurrency!)
    : 4;
  if (available <= 1) return 1;
  return Math.min(16, Math.max(2, available - 1));
}

export function skinRebuildLowestProgressPercent(
  phase: SkinRebuildLowestProgressPhase,
  completed: number,
  total: number,
): number {
  const fraction = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  switch (phase) {
    case "mesh": return 4 + fraction * 66;
    case "fallback": return 8;
    case "orientation": return 72;
    case "attribution": return 74 + fraction * 22;
    case "reachability": return 95 + fraction * 2;
    case "overhang": return 97 + fraction * 2;
    case "complete": return 100;
  }
}

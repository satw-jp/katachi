import type { Patch } from "../field.ts";
import type { InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import type {
  SkinRebuildBase,
  SkinRebuildOverhangReinforcementProgress,
  SkinRebuildPatternSide,
  SkinRebuildSettings,
} from "./model.ts";
import type { SkinRebuildOverhangSurfaceSample } from "./overhangRegions.ts";

export interface SkinRebuildStage5BRegionTask {
  regionId: number;
  surfacePoint: Vector3Value;
  surfaceNormal: Vector3Value;
  surfaceSamples: SkinRebuildOverhangSurfaceSample[];
}

export interface SkinRebuildStage5BRequest {
  type: "build";
  requestId: number;
  base: SkinRebuildBase;
  patterns: Patch[];
  patternSides: SkinRebuildPatternSide[];
  lattice: InternalStructureGraph;
  settings: SkinRebuildSettings;
  regions: SkinRebuildStage5BRegionTask[];
}

export interface SkinRebuildStage5BRegionResult {
  regionId: number;
  complete: boolean;
  passCount: number;
  surfaceContactCount: number;
  uncoveredSurfaceContactCount: number;
  segmentCount: number;
  maximumEdgeAngleDeg: number;
}

export interface SkinRebuildStage5BRegionFailure {
  regionId: number;
  message: string;
}

export type SkinRebuildStage5BWorkerMessage =
  | {
    type: "progress";
    requestId: number;
    regionIndex: number;
    regionCount: number;
    regionId: number;
    progress: SkinRebuildOverhangReinforcementProgress;
    elapsedMs: number;
  }
  | {
    type: "result";
    requestId: number;
    lattice: InternalStructureGraph;
    reinforcement: InternalStructureGraph;
    regions: SkinRebuildStage5BRegionResult[];
    failures: SkinRebuildStage5BRegionFailure[];
    elapsedMs: number;
  }
  | {
    type: "error";
    requestId: number;
    message: string;
    elapsedMs: number;
  };

export function skinRebuildStage5BProgressPercent(
  regionIndex: number,
  regionCount: number,
  progress: SkinRebuildOverhangReinforcementProgress,
): number {
  const safeRegionCount = Math.max(1, regionCount);
  const contactFraction = progress.contactCount > 0
    ? Math.max(0, Math.min(1, (
      progress.completedContactCount
      + (progress.phase === "routing" && progress.candidateCount > 0
        ? Math.min(0.9, progress.candidateIndex / progress.candidateCount)
        : 0)
    ) / progress.contactCount))
    : progress.phase === "complete" ? 1 : 0;
  const regionFraction = progress.phase === "containment" ? 0.97
    : progress.phase === "complete" ? 1
      : contactFraction * 0.96;
  return Math.max(1, Math.min(100, (regionIndex + regionFraction) / safeRegionCount * 100));
}

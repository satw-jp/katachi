export interface SkinRebuildWorkflowPhase {
  readonly label: string;
  readonly targetId: string;
}

export const SKIN_REBUILD_WORKFLOW_PHASES: readonly SkinRebuildWorkflowPhase[] = [
  { label: "BASE SHAPE", targetId: "skin-stage-1" },
  { label: "SURFACE PATTERN", targetId: "skin-stage-2" },
  { label: "NETWORK", targetId: "skin-stage-3" },
  { label: "PRINT / EXPORT", targetId: "skin-stage-6" },
] as const;

export function moveSkinRebuildWorkflowPhase(index: number, direction: -1 | 1): number {
  const lastIndex = SKIN_REBUILD_WORKFLOW_PHASES.length - 1;
  return Math.max(0, Math.min(lastIndex, index + direction));
}

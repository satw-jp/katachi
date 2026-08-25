export interface SupportPaintInteractionCounters {
  hoverPointerMoves: number;
  hoverSurfaceRaycasts: number;
  hoverWebglRenders: number;
  hoverMarkerBufferUpdates: number;
  dragPointerMoves: number;
  dragMainThreadTriangleScans: number;
  dragWebglRenders: number;
  dragWorkerRaycasts: number;
  dragDabRequests: number;
  dragMarkerPartialUpdates: number;
  pointerupHistoryCommits: number;
  paintApplyWorkerLaunches: number;
  fullOverlaySyncsAfterPointerup: number;
  fullRendersAfterPointerup: number;
}

export function createSupportPaintInteractionCounters(): SupportPaintInteractionCounters {
  return {
    hoverPointerMoves: 0, hoverSurfaceRaycasts: 0, hoverWebglRenders: 0, hoverMarkerBufferUpdates: 0,
    dragPointerMoves: 0, dragMainThreadTriangleScans: 0, dragWebglRenders: 0, dragWorkerRaycasts: 0,
    dragDabRequests: 0, dragMarkerPartialUpdates: 0, pointerupHistoryCommits: 0,
    paintApplyWorkerLaunches: 0, fullOverlaySyncsAfterPointerup: 0, fullRendersAfterPointerup: 0,
  };
}

export function supportPaintInteractionCounterFailures(counters: SupportPaintInteractionCounters, expectCommittedPointerup = false): string[] {
  const failures: string[] = [];
  if (counters.hoverSurfaceRaycasts !== 0) failures.push("hover Surface raycast must be 0");
  if (counters.hoverWebglRenders !== 0) failures.push("hover WebGL render must be 0");
  if (counters.hoverMarkerBufferUpdates !== 0) failures.push("hover marker Buffer update must be 0");
  if (counters.dragMainThreadTriangleScans !== 0) failures.push("drag main-thread triangle scan must be 0");
  if (counters.paintApplyWorkerLaunches !== 0) failures.push("pointerup must not launch a Paint apply Worker");
  if (counters.fullOverlaySyncsAfterPointerup !== 0) failures.push("pointerup must not rebuild the full overlay");
  if (counters.fullRendersAfterPointerup !== 0) failures.push("pointerup must not request a full render");
  if (expectCommittedPointerup && counters.pointerupHistoryCommits !== 1) failures.push("pointerup must commit exactly one history operation");
  return failures;
}

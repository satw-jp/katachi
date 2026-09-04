/**
 * Resolve which Stroke an authoritative Surface rebuild must target after a
 * semantic state restore (Undo / Redo / Delete / Load / Recovery).
 *
 * The Surface Preview covers the current Surface target only — never the whole
 * document. Snapshots store semantic state alone, so the target has to be
 * re-derived from the restored state on every apply. An empty restore has no
 * target and must not trigger a build.
 */
export function resolveHanaSurfaceTarget(state: {
  showSurface: boolean;
  strokeIds: readonly string[];
  activeStrokeId: string | null;
  materialSampleCount: number;
}): string | null {
  if (!state.showSurface) return null;
  if (state.strokeIds.length === 0 || state.materialSampleCount === 0) return null;
  if (state.activeStrokeId && state.strokeIds.includes(state.activeStrokeId)) return state.activeStrokeId;
  return state.strokeIds[state.strokeIds.length - 1] ?? null;
}

export interface HanaRestoredSelection {
  selectedStrokeIds: string[];
  activeStrokeId: string | null;
}

/**
 * Resolve selection/active for a restored snapshot under preserve-selection
 * applies (Undo / Redo). Live selection entries that survive in the restored
 * document are kept. When the restore target holds Strokes but the surviving
 * selection is empty, the most recent Stroke becomes the selection so the
 * Surface rebuild target, the active Stroke and the selection stay coherent
 * instead of leaving `active === null` next to a live `stroke3D`.
 * Empty restores stay empty.
 */
export function resolveHanaRestoredSelection(input: {
  liveSelectedStrokeIds: readonly string[];
  liveActiveStrokeId: string | null;
  restoredStrokeIds: readonly string[];
}): HanaRestoredSelection {
  const selected = input.liveSelectedStrokeIds.filter((id) => input.restoredStrokeIds.includes(id));
  const active = input.liveActiveStrokeId && input.restoredStrokeIds.includes(input.liveActiveStrokeId)
    ? input.liveActiveStrokeId
    : null;
  if (selected.length > 0 || input.restoredStrokeIds.length === 0) {
    return {
      selectedStrokeIds: selected,
      activeStrokeId: active ?? selected[selected.length - 1] ?? null,
    };
  }
  const fallback = input.restoredStrokeIds[input.restoredStrokeIds.length - 1];
  return { selectedStrokeIds: [fallback], activeStrokeId: fallback };
}

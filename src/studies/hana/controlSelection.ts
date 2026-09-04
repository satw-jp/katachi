/**
 * Global single Control Point selection.
 *
 * A selection is the parent Stroke identity plus the Control Point identity.
 * Control Point ids (`control-N`) repeat across Strokes, so the point id alone
 * is never a global identity. Viewport switches, layout toggles, and camera
 * moves never clear the selection; only explicit deselect, deletion, document
 * boundaries, or a dangling reference after Undo / Redo do.
 */

export interface HanaControlPointSelection {
  strokeId: string;
  controlPointId: string;
}

export interface HanaControlPointSource {
  id: string;
  controlPointIds: readonly string[];
}

export function findHanaControlPointIndex(
  strokes: readonly HanaControlPointSource[],
  selection: HanaControlPointSelection,
): { strokeIndex: number; controlIndex: number } | null {
  const strokeIndex = strokes.findIndex((stroke) => stroke.id === selection.strokeId);
  if (strokeIndex < 0) return null;
  const controlIndex = strokes[strokeIndex].controlPointIds.indexOf(selection.controlPointId);
  if (controlIndex < 0) return null;
  return { strokeIndex, controlIndex };
}

export interface HanaReconciledControlSelection {
  selection: HanaControlPointSelection | null;
  controlIndex: number | null;
}

/**
 * Reconcile the global selection against live authoring state. Keeps the
 * selection (and its working index) while the same stroke + point identity
 * exists; clears it when the parent Stroke or the point is gone, so Undo /
 * Redo / Delete / New / Load can never leave a dangling reference.
 */
export function reconcileHanaControlPointSelection(
  selection: HanaControlPointSelection | null,
  strokes: readonly HanaControlPointSource[],
): HanaReconciledControlSelection {
  if (!selection) return { selection: null, controlIndex: null };
  const found = findHanaControlPointIndex(strokes, selection);
  if (!found) return { selection: null, controlIndex: null };
  return { selection: { ...selection }, controlIndex: found.controlIndex };
}

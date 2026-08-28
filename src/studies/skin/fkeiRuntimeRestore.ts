import { parseFkeiDocument, type FkeiCompletedStage, type FkeiDocument } from "./fkei.ts";
import { replayDetached, type SkinHistoryEntry, type SkinState } from "./history.ts";
import { fkeiArtworkGraphSourceKey, fkeiShapeFingerprint } from "./fkeiRestoreIdentity.ts";

export interface FkeiRestorePlan {
  readonly completedStage: 1 | 2 | 3;
  readonly history: readonly SkinHistoryEntry[];
  readonly shapeState: SkinState;
  readonly bindings: FkeiDocument["bindings"];
  readonly supportPaint: FkeiDocument["supportPaint"] | null;
  readonly artworkGraph: FkeiDocument["artworkGraph"] | null;
  readonly surface: FkeiDocument["surface"] | null;
  readonly downstream: {
    readonly dryWeb: null;
    readonly dryWebExact: null;
    readonly stage7Provisional: null;
    readonly stage8: null;
  };
}

export interface FkeiAtomicRestoreTarget<Snapshot> {
  capture(): Snapshot;
  cancelWorkers(): void;
  replace(plan: FkeiRestorePlan): void;
  restore(snapshot: Snapshot): void;
  redraw(): void;
}

function cloneDetached<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as { slice?: () => unknown };
    if (typeof view.slice !== "function") throw new Error("FKEI restore cannot detach this binary value");
    return view.slice() as T;
  }
  if (Array.isArray(value)) return value.map((item) => cloneDetached(item)) as T;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) result[key] = cloneDetached(item);
  return result as T;
}

function restoredStage(value: FkeiCompletedStage | undefined): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error("FKEI Open supports an explicit completedStage from 1 through 3 only");
  }
  return value;
}

/**
 * Pure parse/replay/validation boundary. No DOM, renderer, Worker, cache or
 * live Runtime object is accepted by this function.
 */
export function createFkeiRestorePlan(document: FkeiDocument): FkeiRestorePlan {
  const completedStage = restoredStage(document.completedStage);
  const history = cloneDetached(document.shape.entries);
  if (history.length === 0) throw new Error("FKEI Shape history is empty");
  const shapeState = replayDetached(history);
  const shapeFingerprint = fkeiShapeFingerprint(shapeState);
  if (shapeFingerprint !== document.bindings.shapeFingerprint) {
    throw new Error("FKEI Shape replay does not match the authoritative Shape fingerprint");
  }
  if (shapeState.patchSetRevision !== document.bindings.patchSetRevision) {
    throw new Error("FKEI Shape replay does not match patchSetRevision");
  }
  if (completedStage >= 2 && shapeState.patches.length === 0) {
    throw new Error("FKEI completedStage requires restored Surface Pattern patches");
  }
  if (document.surface) {
    if (document.surface.binding.surfaceFingerprint !== shapeFingerprint) {
      throw new Error("FKEI Surface binding does not match replayed Shape");
    }
    if (document.surface.binding.resolution !== document.surface.diagnosis.resolution
      || document.surface.binding.angleThresholdDeg !== document.surface.diagnosis.metrics.thresholdDeg) {
      throw new Error("FKEI Surface diagnosis does not match its binding");
    }
  }
  if (document.supportPaint && document.supportPaint.revision !== document.bindings.paintRevision) {
    throw new Error("FKEI Support Paint revision does not match its binding");
  }
  if (completedStage === 3 && !document.artworkGraph) {
    throw new Error("FKEI completedStage 3 requires Artwork Graph");
  }
  if (document.artworkGraph) {
    const sourceKey = fkeiArtworkGraphSourceKey(shapeState);
    if (document.artworkGraph.sourceKey !== sourceKey
      || document.bindings.artworkGraph?.sourceKey !== sourceKey
      || document.artworkGraph.snapshot.surfaceDraft.patchSetRevision !== shapeState.patchSetRevision) {
      throw new Error("FKEI Artwork Graph identity does not match replayed Shape");
    }
  }

  return {
    completedStage,
    history,
    shapeState: cloneDetached(shapeState),
    bindings: cloneDetached(document.bindings),
    supportPaint: document.supportPaint ? cloneDetached(document.supportPaint) : null,
    artworkGraph: document.artworkGraph ? cloneDetached(document.artworkGraph) : null,
    surface: document.surface ? cloneDetached(document.surface) : null,
    downstream: { dryWeb: null, dryWebExact: null, stage7Provisional: null, stage8: null },
  };
}

export function parseFkeiRestorePlan(text: string): FkeiRestorePlan {
  return createFkeiRestorePlan(parseFkeiDocument(text));
}

/** Apply only a fully-built plan; any replacement/redraw failure rolls back. */
export function applyFkeiRestorePlanAtomically<Snapshot>(
  plan: FkeiRestorePlan,
  target: FkeiAtomicRestoreTarget<Snapshot>,
): void {
  const before = target.capture();
  try {
    target.cancelWorkers();
    target.replace(plan);
    target.redraw();
  } catch (error) {
    target.restore(before);
    target.redraw();
    throw error;
  }
}

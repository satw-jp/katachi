import { parseFkeiDocument, type FkeiCompletedStage, type FkeiDocument } from "./fkei.ts";
import { replayDetached, type SkinHistoryEntry, type SkinState } from "./history.ts";
import { fkeiArtworkGraphSourceKey, fkeiShapeFingerprint } from "./fkeiRestoreIdentity.ts";
import {
  hydrateFkeiRiskDrivenLatticeArtifact,
  type FkeiCanonicalDryWebArtifact,
  type FkeiRiskDrivenLatticeArtifact,
} from "./fkeiRiskDrivenLattice.ts";

export interface FkeiRestorePlan {
  readonly completedStage: 1 | 2 | 3 | 4;
  readonly history: readonly SkinHistoryEntry[];
  readonly shapeState: SkinState;
  readonly bindings: FkeiDocument["bindings"];
  readonly supportPaint: FkeiDocument["supportPaint"] | null;
  readonly artworkGraph: FkeiDocument["artworkGraph"] | null;
  readonly surface: FkeiDocument["surface"] | null;
  readonly canonicalDryWeb: FkeiCanonicalDryWebArtifact | null;
  readonly riskDrivenLattice: FkeiRiskDrivenLatticeArtifact | null;
  readonly downstream: {
    /** Saved compact canonical graph; never causes a worker launch. */
    readonly dryWeb: FkeiCanonicalDryWebArtifact | null;
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

function restoredStage(value: FkeiCompletedStage | undefined): 1 | 2 | 3 | 4 {
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4) {
    throw new Error("FKEI Open supports an explicit completedStage from 1 through 4 only");
  }
  return value;
}

/** The v0 checkpoint carries exact shape-space facts from the immutable
 * canonical request. Older Stage 1–3 files never reach this branch and keep
 * their historical procedural replay identity contract unchanged. */
function applyCanonicalShapeSnapshot(replayed: SkinState, canonical: FkeiCanonicalDryWebArtifact): SkinState {
  const snapshot = canonical.shapeSnapshot;
  const state: SkinState = {
    ...cloneDetached(replayed),
    mode: snapshot.mode,
    host: cloneDetached([...snapshot.host]),
    hostParams: { ...cloneDetached(replayed.hostParams), k: snapshot.hostK },
    patches: cloneDetached([...snapshot.patches]),
    skinParams: {
      ...cloneDetached(replayed.skinParams),
      thickness: snapshot.thickness,
      roundK: snapshot.roundK,
      coinBulge: snapshot.coinBulge,
      coinBulgeBalance: snapshot.coinBulgeBalance,
      quadMeshJoinWidth: snapshot.quadMeshJoinWidth,
    },
    patchSetRevision: snapshot.patchSetRevision,
  };
  return state;
}

/**
 * Pure parse/replay/validation boundary. No DOM, renderer, Worker, cache or
 * live Runtime object is accepted by this function.
 */
export function createFkeiRestorePlan(document: FkeiDocument): FkeiRestorePlan {
  const completedStage = restoredStage(document.completedStage);
  const history = cloneDetached(document.shape.entries);
  if (history.length === 0) throw new Error("FKEI Shape history is empty");
  const replayedShapeState = replayDetached(history);
  const isCheckpoint = document.canonicalDryWeb !== undefined || document.riskDrivenLattice !== undefined;
  const shapeState = isCheckpoint
    ? (() => {
      if (!document.canonicalDryWeb || !document.riskDrivenLattice) throw new Error("FKEI checkpoint artifacts must be present together");
      const exact = applyCanonicalShapeSnapshot(replayedShapeState, document.canonicalDryWeb);
      if (document.canonicalDryWeb.shapeSnapshot.patchSetRevision !== document.bindings.patchSetRevision) throw new Error("FKEI canonical Shape snapshot patchSetRevision does not match binding");
      return exact;
    })()
    : replayedShapeState;
  const shapeFingerprint = fkeiShapeFingerprint(shapeState);
  if (shapeFingerprint !== document.bindings.shapeFingerprint) {
    throw new Error(isCheckpoint
      ? "FKEI canonical Shape snapshot does not match the authoritative Shape fingerprint"
      : "FKEI Shape replay does not match the authoritative Shape fingerprint");
  }
  if (shapeState.patchSetRevision !== document.bindings.patchSetRevision) {
    throw new Error("FKEI Shape replay/snapshot does not match patchSetRevision");
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
  if (completedStage === 4 && (!document.canonicalDryWeb || !document.riskDrivenLattice)) {
    throw new Error("FKEI completedStage 4 requires canonical Dry Web and Risk-driven Lattice artifacts");
  }
  if (document.canonicalDryWeb && document.riskDrivenLattice) {
    if (!document.surface
      || document.canonicalDryWeb.inputBinding.surfaceResolution !== document.surface.binding.resolution
      || document.canonicalDryWeb.inputBinding.surfaceTargetLongestMm !== document.surface.binding.targetLongestMm
      || document.canonicalDryWeb.inputBinding.surfaceAngleThresholdDeg !== document.surface.binding.angleThresholdDeg
      || document.canonicalDryWeb.inputBinding.exactDiagnosisProvenanceSha256 !== document.canonicalDryWeb.exactDiagnosisSummary.provenanceSha256) {
      throw new Error("FKEI checkpoint Surface/exact evidence binding mismatch");
    }
    // Hydration only checks and appends saved graph facts. It deliberately
    // cannot call either lattice planner or a renderer/Worker.
    hydrateFkeiRiskDrivenLatticeArtifact(document.canonicalDryWeb, document.riskDrivenLattice);
  } else if (document.riskDrivenLattice) {
    throw new Error("FKEI Risk-driven Lattice requires canonical Dry Web");
  }

  return {
    completedStage,
    history,
    shapeState: cloneDetached(shapeState),
    bindings: cloneDetached(document.bindings),
    supportPaint: document.supportPaint ? cloneDetached(document.supportPaint) : null,
    artworkGraph: document.artworkGraph ? cloneDetached(document.artworkGraph) : null,
    surface: document.surface ? cloneDetached(document.surface) : null,
    canonicalDryWeb: document.canonicalDryWeb ? cloneDetached(document.canonicalDryWeb) : null,
    riskDrivenLattice: document.riskDrivenLattice ? cloneDetached(document.riskDrivenLattice) : null,
    downstream: { dryWeb: document.canonicalDryWeb ? cloneDetached(document.canonicalDryWeb) : null, dryWebExact: null, stage7Provisional: null, stage8: null },
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

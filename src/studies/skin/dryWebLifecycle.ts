import type { SkinState } from "./history.ts";

/**
 * The contact threshold is an author-facing interpretation of an already
 * generated graph.  A replay/Undo transition may therefore reuse the graph
 * only when every other replayed state fact is unchanged.
 */
function stateWithoutDryWebRequiredContacts(state: SkinState): unknown {
  const { dryWebRequiredContacts: _dryWebRequiredContacts, ...skinParams } = state.skinParams;
  return {
    host: state.host,
    hostParams: state.hostParams,
    patches: state.patches,
    skinParams,
    mode: state.mode,
    partition: state.partition,
    nPartition: state.nPartition,
    patchSetRevision: state.patchSetRevision,
    annotations: state.annotations,
  };
}

export function isDryWebRequiredContactsOnlyChange(previous: SkinState, next: SkinState): boolean {
  return previous.skinParams.dryWebRequiredContacts !== next.skinParams.dryWebRequiredContacts
    && JSON.stringify(stateWithoutDryWebRequiredContacts(previous))
      === JSON.stringify(stateWithoutDryWebRequiredContacts(next));
}

/**
 * The Dry Web contact palette may be restored after a non-geometry refresh
 * only when no other author diagnostic has claimed the beads.  Keeping this
 * policy pure gives history replay a small, testable ownership boundary:
 * partition/contact views can remain visible without a misleading Dry Web
 * legend, while the active Dry Web view can be reapplied after refreshes that
 * temporarily rebuild bead groups.
 */
export type DryWebContactPresentationOwner =
  | "none"
  | "dryWeb"
  | "partition"
  | "nPartition"
  | "contactStrength";

export function dryWebContactPresentationCanReapply(
  owner: DryWebContactPresentationOwner,
): boolean {
  return owner === "none" || owner === "dryWeb";
}

export type DryWebPreviewTerminalKind = "success" | "stale" | "message-error" | "onerror" | "cancel";

export interface DryWebPreviewTerminalDecision {
  /** Whether the terminal message belongs to the current preview run. */
  status: "current" | "stale" | "error" | "cancelled";
  detachWorker: true;
  clearPending: true;
  /** A preview worker success may hand the heavy shelf to exact recheck. */
  releaseHeavy: boolean;
  clearPreview: boolean;
}

/**
 * Shared, DOM/Worker-independent terminal policy.  Main-thread handlers use
 * these flags for the actual detach/clear operations; tests can verify that
 * every terminal failure path is fail-closed without constructing a Worker.
 */
export function dryWebPreviewTerminalDecision(kind: DryWebPreviewTerminalKind): DryWebPreviewTerminalDecision {
  if (kind === "success") {
    return {
      status: "current",
      detachWorker: true,
      clearPending: true,
      releaseHeavy: false,
      clearPreview: false,
    };
  }
  return {
    status: kind === "cancel" ? "cancelled" : kind === "stale" ? "stale" : "error",
    detachWorker: true,
    clearPending: true,
    releaseHeavy: true,
    clearPreview: true,
  };
}

/**
 * The post-attachment exact diagnosis is an explicit second author action.
 * Keep its readiness decision separate from the Worker starter so the UI can
 * hide old Stage 7 facts while a graph is merely ready for diagnosis.
 */
export type DryWebExactRecheckPresentationState = "missing" | "stale" | "running" | "ready" | "current";

export interface DryWebExactRecheckPresentationInput {
  /** The existing internal-structure selection, not a replacement predicate. */
  readonly targetedGrid: boolean;
  /** The caller's canonical dryWebPreviewIsCurrent() result. */
  readonly graphCurrent: boolean;
  readonly graphKind: string | null;
  /** The existing Stage 3 Artwork Graph boundary result. */
  readonly stage3BoundaryCurrent: boolean;
  /** True when any previous generator graph exists, even if it is stale. */
  readonly hasGraph: boolean;
  /** True only for current exact-recheck facts. */
  readonly exactFactsCurrent: boolean;
  /** Existing generator/recheck/diagnosis guard, supplied by the caller. */
  readonly runActive: boolean;
}

export interface DryWebExactRecheckPresentation {
  readonly state: DryWebExactRecheckPresentationState;
  readonly enabled: boolean;
  /** Old exact facts are never exposed outside the current settled state. */
  readonly exactFactsCurrent: boolean;
  readonly reason: string;
}

function exactRecheckUnavailable(
  state: Exclude<DryWebExactRecheckPresentationState, "ready" | "current">,
  reason: string,
): DryWebExactRecheckPresentation {
  return { state, enabled: false, exactFactsCurrent: false, reason };
}

/**
 * Pure presentation/lifecycle boundary for the explicit Stage 7 action.
 * `graphCurrent` remains the canonical caller decision; this helper only
 * combines it with the existing Stage 3 boundary and active-run guard.
 */
export function createDryWebExactRecheckPresentation(
  input: DryWebExactRecheckPresentationInput,
): DryWebExactRecheckPresentation {
  if (!input.targetedGrid) {
    return exactRecheckUnavailable("missing", "Dry Web付加後のexact診断はtargetedGridでのみ実行できます。");
  }
  if (input.runActive) {
    return exactRecheckUnavailable(
      "running",
      "Dry Web生成またはDry Web付加後のexact診断が実行中です。旧Stage 7 factsは表示しません。",
    );
  }
  if (!input.stage3BoundaryCurrent) {
    return exactRecheckUnavailable(
      input.hasGraph ? "stale" : "missing",
      input.hasGraph
        ? "Stage 3 boundaryまたはDry Web graphがstaleです。旧Stage 7 exact factsは表示しません。"
        : "Stage 3 snapshotがありません。先に現在のSurfaceをArtwork Graph化してください。",
    );
  }
  if (!input.graphCurrent || input.graphKind !== "targetedGrid") {
    return exactRecheckUnavailable(
      input.hasGraph ? "stale" : "missing",
      input.hasGraph
        ? "Dry Web graphがstaleです。旧Stage 7 exact factsは表示しません。"
        : "Dry Web graphがありません。先にDry Webを生成してください。",
    );
  }
  if (input.exactFactsCurrent) {
    return {
      state: "current",
      enabled: true,
      exactFactsCurrent: true,
      reason: "Dry Web付加後のexact診断は完了しています。必要なら再診断できます。",
    };
  }
  return {
    state: "ready",
    enabled: true,
    exactFactsCurrent: false,
    reason: "Dry Web生成が完了しました。Dry Web付加後のexact診断は未実行です。「Dry Web付加後を再診断」で実行できます。",
  };
}

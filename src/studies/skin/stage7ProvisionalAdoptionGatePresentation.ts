import type {
  Stage7ProvisionalRecheckPresentation,
  Stage7ProvisionalRecheckStatus,
} from "./stage7ProvisionalRecheckPresentation.ts";

/**
 * Stage 7's adoption checkpoint is an author-review marker only.  It does not
 * mean that the provisional graph is canonical, printable, or safe to export.
 */
export type Stage7ProvisionalAdoptionGateState =
  | "unavailable"
  | "ready-for-author-review"
  | "author-approved-for-next-confirmation"
  | "stale";

export interface Stage7ProvisionalAdoptionGateIdentity {
  /** Existing plan object identity; no derived fingerprint is introduced. */
  readonly planIdentity: object;
  /** Existing provisional recheck result object identity. */
  readonly resultIdentity: object;
}

export interface Stage7ProvisionalAdoptionGatePresentationInput {
  /** The exact current plan returned by the existing current/stale guard. */
  readonly planIdentity: object | null;
  /** The exact current result object returned by the existing binding guard. */
  readonly resultIdentity: object | null;
  /** Existing plan identity/settings guard. */
  readonly planCurrent: boolean;
  /** Existing provisional result binding guard. */
  readonly resultCurrent: boolean;
  /** Existing comparison presentation state. */
  readonly comparisonState: Stage7ProvisionalRecheckPresentation["state"];
  /** True only when the current comparison exposes its current facts. */
  readonly comparisonCurrent: boolean;
  /** Factual comparison outcome; never used to infer approval. */
  readonly comparisonStatus: Stage7ProvisionalRecheckStatus | null;
  /** Volatile author marker bound to exact object identities. */
  readonly approval: Stage7ProvisionalAdoptionGateIdentity | null;
}

export interface Stage7ProvisionalAdoptionGatePresentation {
  readonly state: Stage7ProvisionalAdoptionGateState;
  /** Explicit author action is enabled only for a current unapproved result. */
  readonly approveEnabled: boolean;
  /** Reversible action is enabled only after explicit approval. */
  readonly returnToPendingEnabled: boolean;
  /** Factual comparison status, hidden when comparison is not current. */
  readonly comparisonStatus: Stage7ProvisionalRecheckStatus | null;
  readonly reason: string;
  /** Copy explaining that approval is not canonical adoption. */
  readonly copy: string;
}

const CHECKPOINT_COPY =
  "これはこのexact provisional比較を作者が確認したというvolatileな記録です。canonical Graphの採用・Surface診断・cache・history・renderer・outputは変更しません。";

function output(
  state: Stage7ProvisionalAdoptionGateState,
  approveEnabled: boolean,
  returnToPendingEnabled: boolean,
  comparisonStatus: Stage7ProvisionalRecheckStatus | null,
  reason: string,
): Stage7ProvisionalAdoptionGatePresentation {
  return Object.freeze({
    state,
    approveEnabled,
    returnToPendingEnabled,
    comparisonStatus,
    reason,
    copy: CHECKPOINT_COPY,
  });
}

/**
 * Derive the fail-closed author checkpoint from the already-established
 * Stage 7 identities.  This helper intentionally does not inspect counts or
 * red reduction and never mutates its input.
 */
export function createStage7ProvisionalAdoptionGatePresentation(
  input: Stage7ProvisionalAdoptionGatePresentationInput | null,
): Stage7ProvisionalAdoptionGatePresentation {
  if (!input) {
    return output(
      "unavailable",
      false,
      false,
      null,
      "currentの仮Graph計画とprovisional比較結果がそろうまで、採用確認へは進めません。",
    );
  }

  const currentComparison = input.planIdentity !== null
    && input.resultIdentity !== null
    && input.planCurrent
    && input.resultCurrent
    && input.comparisonCurrent
    && input.comparisonState === "current";
  const approvalMatches = currentComparison
    && input.approval !== null
    && input.approval.planIdentity === input.planIdentity
    && input.approval.resultIdentity === input.resultIdentity;
  const hasPriorComparison = input.resultIdentity !== null || input.approval !== null;
  const approvalIdentityChanged = input.approval !== null && !approvalMatches;

  // A plan without a result is simply unavailable.  Once a result (or an
  // approval marker) exists, any failed current/binding guard is stale. An
  // explicit stale terminal state stays visible even after the result object
  // has been cleared by an invalidation path.
  if (input.comparisonState === "stale" || (hasPriorComparison && (approvalIdentityChanged
    || !input.planCurrent
    || !input.resultCurrent))) {
    return output(
      "stale",
      false,
      false,
      null,
      "仮Graph計画またはprovisional比較結果がcurrentではありません。countは表示せず、採用確認は保留に戻ります。",
    );
  }

  if (!currentComparison) {
    const reason = input.comparisonState === "running"
      ? "仮Graph exact比較を実行中です。current結果になるまで、採用確認へは進めません。"
      : input.comparisonState === "error"
        ? "仮Graph exact比較が完了していません。エラーを解消してcurrent結果を確認してください。"
        : input.planIdentity === null
          ? "currentの仮Graph計画がありません。先に仮Graph計画を作成してください。"
          : input.resultIdentity === null
            ? "currentのprovisional比較結果がありません。先に「仮Graphで再診断」を実行してください。"
            : "currentの仮Graph計画・provisional比較結果・exact identityがそろっていません。";
    return output("unavailable", false, false, null, reason);
  }

  if (approvalMatches) {
    return output(
      "author-approved-for-next-confirmation",
      false,
      true,
      input.comparisonStatus,
      "作者がこのexact provisional比較を確認済みです。次のcanonical採用確認へ進める状態ですが、canonical Graphはまだ変更していません。",
    );
  }

  return output(
    "ready-for-author-review",
    true,
    false,
    input.comparisonStatus,
    "currentの比較を確認し、作者が明示的に次の採用確認へ進むか判断してください。赤面の改善・不変・悪化は自動承認の根拠になりません。",
  );
}

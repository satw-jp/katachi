import type { InternalStructureGraph } from "./voronoi.ts";

export type Stage7CanonicalCandidateAdoptionState =
  | "unavailable"
  | "approved-ready"
  | "adopted"
  | "adopted-exact-validated"
  | "undo-ready"
  | "stale";

export interface Stage7CanonicalCandidateAdoptionPresentationInput {
  readonly approved: boolean;
  readonly adopted: boolean;
  readonly adoptionCurrent: boolean;
  readonly undoCurrent: boolean;
  readonly exactValidated?: boolean;
  readonly competingWorkActive?: boolean;
  readonly graph: InternalStructureGraph | null;
}

export interface Stage7CanonicalCandidateAdoptionPresentation {
  readonly state: Stage7CanonicalCandidateAdoptionState;
  readonly adoptEnabled: boolean;
  readonly undoEnabled: boolean;
  readonly nodeCount: number | null;
  readonly edgeCount: number | null;
  readonly reason: string;
  readonly copy: string;
}

export type Stage7CanonicalCandidateExactRecheckDecision =
  | "commit"
  | "fail-closed"
  | "ignore-stale-worker";

export interface Stage7CanonicalCandidateExactRecheckPolicyInput {
  /** The callback's Worker is still the installed exact-recheck Worker. */
  readonly workerIdentityCurrent: boolean;
  /** The callback still belongs to the active exact-recheck run. */
  readonly runGenerationCurrent: boolean;
  /** The message's generation matches the generation sent to that Worker. */
  readonly messageGenerationCurrent: boolean;
  /** Candidate identity and its captured canonical bindings still match. */
  readonly candidateBindingCurrent: boolean;
  /** The graph passed to the Worker is still the current preview/internal graph. */
  readonly graphBindingCurrent: boolean;
  /** Stage 3's artwork source boundary has not drifted. */
  readonly stage3BoundaryCurrent: boolean;
  /** Stage 4/current-surface settings still match the run's captured binding. */
  readonly settingsCurrent: boolean;
}

/**
 * Pure terminal policy for an exact recheck. An old Worker callback is
 * ignored so it cannot erase a newer run; a current Worker with a malformed
 * generation or drifted binding fails closed before canonical state is
 * updated.
 */
export function decideStage7CanonicalCandidateExactRecheck(
  input: Stage7CanonicalCandidateExactRecheckPolicyInput,
): Stage7CanonicalCandidateExactRecheckDecision {
  if (!input.workerIdentityCurrent || !input.runGenerationCurrent) {
    return "ignore-stale-worker";
  }
  if (!input.messageGenerationCurrent
    || !input.candidateBindingCurrent
    || !input.graphBindingCurrent
    || !input.stage3BoundaryCurrent
    || !input.settingsCurrent) {
    return "fail-closed";
  }
  return "commit";
}

const COPY =
  "セッション中だけの候補Graph遷移です。history・recipe・cache・outputは変更せず、printabilityも示しません。";

function output(
  state: Stage7CanonicalCandidateAdoptionState,
  adoptEnabled: boolean,
  undoEnabled: boolean,
  graph: InternalStructureGraph | null,
  reason: string,
): Stage7CanonicalCandidateAdoptionPresentation {
  return {
    state,
    adoptEnabled,
    undoEnabled,
    nodeCount: graph?.nodes.length ?? null,
    edgeCount: graph?.edges.length ?? null,
    reason,
    copy: COPY,
  };
}

/**
 * Pure UI state for the final Stage 7 candidate transition. Identity and
 * currentness are supplied by main.ts; this helper never infers approval from
 * comparison counts and never mutates its input.
 */
export function createStage7CanonicalCandidateAdoptionPresentation(
  input: Stage7CanonicalCandidateAdoptionPresentationInput | null,
): Stage7CanonicalCandidateAdoptionPresentation {
  if (!input) {
    return output(
      "unavailable",
      false,
      false,
      null,
      "exact provisional比較を作者が承認するまで、作品候補への採用はできません。",
    );
  }
  if (input.adopted && !input.adoptionCurrent) {
    return output(
      "stale",
      false,
      false,
      null,
      "採用済み候補のSurface・Stage 3・Paint・Graph identityが変わりました。採用とundoを無効化しました。",
    );
  }
  if (input.adopted && input.adoptionCurrent && input.undoCurrent) {
    return output(
      "undo-ready",
      false,
      true,
      input.graph,
      "Stage 7候補をセッションのDry Web candidate Graphとして採用中です。旧factsと旧exact separationは無効で、次に「Dry Web付加後を再診断」してください。",
    );
  }
  if (input.adopted && input.adoptionCurrent && input.exactValidated) {
    return output(
      "adopted-exact-validated",
      false,
      false,
      input.graph,
      "採用済みStage 7候補の通常exact再診断が完了しました。現在のSurface診断と支持分離はこのcandidateに束縛されています。",
    );
  }
  if (input.adopted && input.adoptionCurrent) {
    return output(
      "adopted",
      false,
      false,
      input.graph,
      "Stage 7候補をセッションのDry Web candidate Graphとして採用中です。旧factsと旧exact separationは無効で、次に「Dry Web付加後を再診断」してください。",
    );
  }
  if (input.approved) {
    return output(
      "approved-ready",
      !input.competingWorkActive,
      false,
      null,
      input.competingWorkActive
        ? "別のWorkerまたは重い処理が実行中です。完了後に作品候補として採用できます。"
        : "作者承認済みのexact provisional比較を、作品候補としてセッション中のDry Webへ反映できます。",
    );
  }
  return output(
    "unavailable",
    false,
    false,
    null,
    "exact provisional比較を作者が承認するまで、作品候補への採用はできません。",
  );
}

export function cloneStage7CanonicalCandidateGraph(
  graph: InternalStructureGraph,
): InternalStructureGraph {
  const clonedStats = { ...graph.stats };
  delete (clonedStats as { dryWebContactFacts?: unknown }).dryWebContactFacts;
  return {
    kind: graph.kind,
    nodes: graph.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    stats: clonedStats,
  };
}

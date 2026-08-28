import type { TargetedGridTargetConnectionFact } from "./targetedGrid.ts";

export const DRY_WEB_TARGET_CONNECTION_MAPPING_COPY =
  "exact generator mapping · mesh/strength/printability未判定";

export type DryWebTargetConnectionMappingState = "missing" | "running" | "stale" | "current";

export interface DryWebTargetConnectionMappingInput {
  /** Existing dryWebPreviewIsCurrent() boundary. */
  readonly current: boolean;
  /** Existing preview/exact-recheck active state. */
  readonly running: boolean;
  /** A preview exists, but the caller's existing current boundary rejected it. */
  readonly stale: boolean;
  /** Optional worker fact; old worker results legitimately omit it. */
  readonly facts: readonly TargetedGridTargetConnectionFact[] | null;
  /** Current source target array, kept separate from the numeric runtime fact. */
  readonly sourceTargets: readonly unknown[] | null;
}

export interface DryWebTargetConnectionMappingPresentation {
  state: DryWebTargetConnectionMappingState;
  connectedCount: number | null;
  unresolvedCount: number | null;
  totalCount: number | null;
  available: boolean;
  copy: string;
  reason: string;
}

function sourceTargetHasAssignmentId(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const assignmentId = (value as { assignmentId?: unknown }).assignmentId;
  return typeof assignmentId === "string" && assignmentId.length > 0;
}

function isNodeOrEdgeId(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function hasValidFactShape(
  fact: TargetedGridTargetConnectionFact,
  sourceTargetCount: number,
): boolean {
  if (!Number.isSafeInteger(fact.sourceTargetIndex) || fact.sourceTargetIndex < 0
    || fact.sourceTargetIndex >= sourceTargetCount) return false;
  if (fact.status === "unresolved") {
    return fact.contactNodeId === null && fact.materialNodeId === null && fact.edgeId === null;
  }
  if (fact.status !== "connected") return false;
  const contactNodeId = fact.contactNodeId;
  const materialNodeId = fact.materialNodeId;
  return contactNodeId !== null
    && Number.isSafeInteger(contactNodeId)
    && contactNodeId >= 0
    && materialNodeId !== null
    && Number.isSafeInteger(materialNodeId)
    && materialNodeId >= 0
    && isNodeOrEdgeId(fact.edgeId);
}

function invalidPresentation(reason: string, state: "missing" | "running" | "stale"): DryWebTargetConnectionMappingPresentation {
  return {
    state,
    connectedCount: null,
    unresolvedCount: null,
    totalCount: null,
    available: false,
    copy: DRY_WEB_TARGET_CONNECTION_MAPPING_COPY,
    reason,
  };
}

/**
 * Present only a complete, current worker mapping.  The source array remains
 * the owner of assignmentId strings; this helper never derives identity from
 * position, sorting, or graph coordinates.
 */
export function createDryWebTargetConnectionMappingPresentation(
  input: DryWebTargetConnectionMappingInput,
): DryWebTargetConnectionMappingPresentation {
  if (input.running) {
    return invalidPresentation(
      "Dry Web生成中です。target接続 mappingは完了後に確認できます。",
      "running",
    );
  }
  if (!input.current) {
    return input.stale
      ? invalidPresentation(
        "Surface変更後の旧Dry Webです。Stage 3を再Graph化し、Dry Webを再生成してください。",
        "stale",
      )
      : invalidPresentation(
        "target接続 mappingは未確認です。current Dry Webを生成してください。",
        "missing",
      );
  }

  const facts = input.facts;
  const sourceTargets = input.sourceTargets;
  if (!facts || !sourceTargets || facts.length !== sourceTargets.length) {
    return invalidPresentation(
      "current Dry Webのexact generator mapping factがありません。Dry Webを再生成してください。",
      "missing",
    );
  }

  const seen = new Set<number>();
  let connectedCount = 0;
  let unresolvedCount = 0;
  for (const fact of facts) {
    if (!hasValidFactShape(fact, sourceTargets.length)
      || !sourceTargetHasAssignmentId(sourceTargets[fact.sourceTargetIndex])
      || seen.has(fact.sourceTargetIndex)) {
      return invalidPresentation(
        "current mapping factが不正です。古いcountは表示しません。Dry Webを再生成してください。",
        "missing",
      );
    }
    seen.add(fact.sourceTargetIndex);
    if (fact.status === "connected") connectedCount++;
    else unresolvedCount++;
  }
  if (seen.size !== sourceTargets.length) {
    return invalidPresentation(
      "current mapping factが不完全です。古いcountは表示しません。Dry Webを再生成してください。",
      "missing",
    );
  }

  return {
    state: "current",
    connectedCount,
    unresolvedCount,
    totalCount: facts.length,
    available: true,
    copy: DRY_WEB_TARGET_CONNECTION_MAPPING_COPY,
    reason: "current exact generator mapping。sourceTargetIndexからcurrent target assignmentIdへ解決します。",
  };
}

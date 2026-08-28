import type {
  TargetedGridContactFacts,
  TargetedGridContactFloorFacts,
  TargetedGridContactFloorPatchFact,
} from "./targetedGrid.ts";

export const DRY_WEB_CONTACT_FLOOR_COPY =
  "generator candidate facts only · 接続距離上限は現設定 · mesh / strength / printability未判定";

export type DryWebContactFloorCategory =
  | "satisfied"
  | "candidateShortage"
  | "duplicateContactPositions"
  | "outsideMainComponent"
  | "plannerUnresolved";

export type DryWebContactFloorPresentationState = "missing" | "running" | "stale" | "current";

export interface DryWebContactFloorPresentationInput {
  /** Existing dryWebPreviewIsCurrent() boundary. */
  readonly current: boolean;
  /** Existing Dry Web generation or exact-recheck activity. */
  readonly running: boolean;
  /** Existing preview exists but failed the current boundary. */
  readonly stale: boolean;
  /** Runtime-only builder fact; old worker responses may omit it. */
  readonly facts: TargetedGridContactFloorFacts | null;
  /** Canonical contact facts emitted before target connections. */
  readonly contactFacts: TargetedGridContactFacts | null;
  /** Current author setting; a mismatch with the generation fact fails closed. */
  readonly requiredContacts: number | undefined;
}

export interface DryWebContactFloorPresentation {
  state: DryWebContactFloorPresentationState;
  available: boolean;
  requiredContacts: number | null;
  totalPatchCount: number | null;
  categoryCounts: Record<DryWebContactFloorCategory, number> | null;
  /** Full current IDs for presentation consumers; UI uses the capped field below. */
  allCategoryPatchIds: Record<DryWebContactFloorCategory, number[]> | null;
  categoryPatchIds: Record<DryWebContactFloorCategory, number[]> | null;
  categoryPatchIdsTruncated: Record<DryWebContactFloorCategory, boolean> | null;
  copy: string;
  reason: string;
}

export const DRY_WEB_CONTACT_FLOOR_CATEGORY_LABELS: Record<DryWebContactFloorCategory, string> = {
  satisfied: "satisfied",
  candidateShortage: "候補不足",
  duplicateContactPositions: "接点位置重複",
  outsideMainComponent: "main component外",
  plannerUnresolved: "planner未達",
};

const CATEGORY_KEYS: DryWebContactFloorCategory[] = [
  "satisfied",
  "candidateShortage",
  "duplicateContactPositions",
  "outsideMainComponent",
  "plannerUnresolved",
];

const MAX_CATEGORY_PATCH_IDS = 12;

function invalidPresentation(
  state: "missing" | "running" | "stale",
  reason: string,
): DryWebContactFloorPresentation {
  return {
    state,
    available: false,
    requiredContacts: null,
    totalPatchCount: null,
    categoryCounts: null,
    allCategoryPatchIds: null,
    categoryPatchIds: null,
    categoryPatchIdsTruncated: null,
    copy: DRY_WEB_CONTACT_FLOOR_COPY,
    reason,
  };
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validRequiredContacts(value: unknown): value is number {
  return validCount(value) && value >= 1 && value <= 3;
}

function validContactFacts(facts: TargetedGridContactFacts): boolean {
  if (!validCount(facts.usefulPatchCount)
    || !validCount(facts.componentCount)
    || !validCount(facts.mainComponentSize)
    || (facts.mainComponentKey !== null && typeof facts.mainComponentKey !== "string")
    || !Array.isArray(facts.patches)
    || facts.patches.length !== facts.usefulPatchCount) return false;
  let previousPatchId = -1;
  const patchIds = new Set<number>();
  for (const patch of facts.patches) {
    if (typeof patch !== "object" || patch === null
      || !validCount(patch.patchId)
      || patch.patchId <= previousPatchId
      || patchIds.has(patch.patchId)
      || !validCount(patch.contactCount)
      || !Array.isArray(patch.contactNodeIds)
      || patch.contactNodeIds.length !== patch.contactCount
      || typeof patch.componentKey !== "string"
      || !validCount(patch.componentSize)) return false;
    previousPatchId = patch.patchId;
    patchIds.add(patch.patchId);
    const nodeIds = new Set<number>();
    for (const nodeId of patch.contactNodeIds) {
      if (!validCount(nodeId) || nodeIds.has(nodeId)) return false;
      nodeIds.add(nodeId);
    }
  }
  return facts.patches.length === 0 || facts.mainComponentKey !== null;
}

function validFloorFact(
  fact: TargetedGridContactFloorPatchFact,
  contactFact: TargetedGridContactFacts["patches"][number],
): boolean {
  return validCount(fact.patchId)
    && fact.patchId === contactFact.patchId
    && validCount(fact.selectedDistinctContactCount)
    && fact.selectedDistinctContactCount === contactFact.contactCount
    && validCount(fact.candidateLinkCount)
    && validCount(fact.candidateDistinctContactCount)
    && fact.candidateDistinctContactCount <= fact.candidateLinkCount
    && typeof fact.componentKey === "string"
    && fact.componentKey === contactFact.componentKey;
}

/**
 * Explain the current generated contact floor without looking at positions or
 * rebuilding candidates. Every category is derived from the runtime-only
 * candidate facts and the canonical dryWebContactFacts snapshot.
 */
export function createDryWebContactFloorPresentation(
  input: DryWebContactFloorPresentationInput,
): DryWebContactFloorPresentation {
  if (input.running) {
    return invalidPresentation("running", "Dry Web生成または付加後Surface再診断中です。完了後に確認できます。");
  }
  if (!input.current) {
    return input.stale
      ? invalidPresentation("stale", "旧Dry Webです。Stage 3を再Graph化し、Stage 4でDry Webを再生成してください。")
      : invalidPresentation("missing", "接触不足の理由は未確認です。Stage 4でDry Webを生成してください。");
  }

  const facts = input.facts;
  const contactFacts = input.contactFacts;
  const requiredContacts = input.requiredContacts ?? 3;
  if (!facts || !contactFacts
    || !validRequiredContacts(requiredContacts)
    || !validRequiredContacts(facts.requiredContacts)
    || facts.requiredContacts !== requiredContacts
    || !validContactFacts(contactFacts)
    || !Array.isArray(facts.patches)
    || facts.patches.length !== contactFacts.patches.length
    || facts.mainComponentKey !== contactFacts.mainComponentKey) {
    return invalidPresentation("missing", "currentのcontact floor factsがありません。不足理由のcountを表示せず、Dry Webを再生成してください。");
  }

  const contactFactsByPatchId = new Map(contactFacts.patches.map((patch) => [patch.patchId, patch]));
  const seenPatchIds = new Set<number>();
  let previousPatchId = -1;
  for (const fact of facts.patches) {
    const contactFact = contactFactsByPatchId.get(fact.patchId);
    if (!contactFact || seenPatchIds.has(fact.patchId) || fact.patchId <= previousPatchId
      || !validFloorFact(fact, contactFact)) {
      return invalidPresentation("missing", "currentのcontact floor factsが不完全です。古い不足理由を表示せず、Dry Webを再生成してください。");
    }
    seenPatchIds.add(fact.patchId);
    previousPatchId = fact.patchId;
  }
  if (seenPatchIds.size !== contactFacts.patches.length) {
    return invalidPresentation("missing", "Surface Pattern全要素のcontact floor factsがありません。Dry Webを再生成してください。");
  }

  const categoryCounts = {} as Record<DryWebContactFloorCategory, number>;
  const categoryIds = {} as Record<DryWebContactFloorCategory, number[]>;
  for (const key of CATEGORY_KEYS) {
    categoryCounts[key] = 0;
    categoryIds[key] = [];
  }
  for (const fact of facts.patches) {
    const category: DryWebContactFloorCategory = fact.componentKey !== facts.mainComponentKey
      ? "outsideMainComponent"
      : fact.selectedDistinctContactCount >= requiredContacts
        ? "satisfied"
        : fact.candidateLinkCount < requiredContacts
          ? "candidateShortage"
          : fact.candidateDistinctContactCount < requiredContacts
            ? "duplicateContactPositions"
            : "plannerUnresolved";
    categoryCounts[category]++;
    categoryIds[category].push(fact.patchId);
  }

  const categoryPatchIdsTruncated = Object.fromEntries(CATEGORY_KEYS.map((key) => [
    key,
    categoryIds[key].length > MAX_CATEGORY_PATCH_IDS,
  ])) as Record<DryWebContactFloorCategory, boolean>;
  const categoryPatchIds = Object.fromEntries(CATEGORY_KEYS.map((key) => [
    key,
    categoryIds[key].slice(0, MAX_CATEGORY_PATCH_IDS),
  ])) as Record<DryWebContactFloorCategory, number[]>;
  const plannerWarning = categoryCounts.plannerUnresolved > 0
    ? " planner未達はgeneratorの実装警告です。"
    : "";
  return {
    state: "current",
    available: true,
    requiredContacts,
    totalPatchCount: facts.patches.length,
    categoryCounts,
    allCategoryPatchIds: categoryIds,
    categoryPatchIds,
    categoryPatchIdsTruncated,
    copy: DRY_WEB_CONTACT_FLOOR_COPY,
    reason: `current generator candidate factsで接触不足の理由を分類しました。${plannerWarning}`,
  };
}

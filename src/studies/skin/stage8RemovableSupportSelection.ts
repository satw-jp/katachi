import type { OverhangAssignmentEntry } from "./overhangSupportPolicy.ts";
import {
  selectSupportForestPreviewLeaves,
  type SupportForestPreviewLeafSelection,
} from "./branchingSupport.ts";
import type { DryWebSupportSeparationPresentation } from "./dryWebSupportSeparationPresentation.ts";

export const STAGE8_REMOVABLE_SUPPORT_PREVIEW_MAX_LEAVES = 2_000;

type FaceIndexCollection = readonly number[] | ReadonlySet<number>;

export interface Stage8RemovableSupportSelectionInput {
  /** The current support ledger. It is read only; no entry is rewritten. */
  readonly entries: readonly OverhangAssignmentEntry[] | null;
  /** The current exact post-attachment separation, when available. */
  readonly separation?: DryWebSupportSeparationPresentation | null;
  /**
   * Test/adapter form of the exact-orange fact. When `separation` is
   * supplied it remains authoritative; this form keeps the helper pure and
   * useful to callers that already hold the runtime fact separately.
   */
  readonly exactOrangeSourceFaceIndices?: FaceIndexCollection | null;
  readonly maximumLeaves?: number;
}

export interface Stage8RemovableSupportSelection extends SupportForestPreviewLeafSelection {
  /** Number of exact-orange post-attachment faces used as the diagnosis gate. */
  readonly exactOrangeFaceCount: number;
  /** Eligible, finite, non-duplicate diagnosed-face sites after exact gating. */
  readonly diagnosedEligibleSiteCount: number;
  /** Eligible, finite, non-duplicate explicit print-plan sites. */
  readonly explicitEligibleSiteCount: number;
  /**
   * Eligible diagnosed outside sites present before the exact-orange gate but
   * excluded because their source face is not in the post-attachment orange
   * subset (including a malformed/missing entry face index).
   */
  readonly excludedPreAttachmentDiagnosedOutsideSiteCount: number;
  /** Number of leaves actually handed to the support-forest preview. */
  readonly sampledCount: number;
  /** Null when the exact diagnosed-face gate was valid. */
  readonly failClosedReason: string | null;
  /** A compact reason suitable for the Stage 8 status line. */
  readonly reason: string;
}

interface ExactOrangeFact {
  readonly indices: ReadonlySet<number> | null;
  readonly exactOrangeFaceCount: number;
  readonly failClosedReason: string | null;
}

function finitePosition(entry: OverhangAssignmentEntry): boolean {
  const position = entry.positionMm;
  return Boolean(position)
    && Number.isFinite(position!.xMm)
    && Number.isFinite(position!.yMm)
    && Number.isFinite(position!.zMm);
}

function existingPreviewEligibility(entry: OverhangAssignmentEntry): boolean {
  return entry.classification === "outside"
    && !entry.duplicateOf
    && finitePosition(entry);
}

function validFaceCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function faceIndexValues(value: FaceIndexCollection | null | undefined): number[] | null {
  if (Array.isArray(value)) return value.slice();
  if (value instanceof Set) return [...value];
  return null;
}

function resolveExactOrangeFact(input: Stage8RemovableSupportSelectionInput): ExactOrangeFact {
  const separationWasSupplied = input.separation !== undefined;
  const separation = input.separation ?? null;
  const declaredCount = separationWasSupplied ? validFaceCount(separation?.outsideFaceCount) : null;
  const exactOrangeFaceCount = declaredCount ?? faceIndexValues(input.exactOrangeSourceFaceIndices)?.length ?? 0;
  if (separationWasSupplied && (!separation || separation.state !== "current")) {
    return {
      indices: null,
      exactOrangeFaceCount,
      failClosedReason: "current exact-orange separation is missing or stale",
    };
  }

  const rawIndices = separationWasSupplied
    ? separation?.outsideSourceFaceIndices
    : input.exactOrangeSourceFaceIndices;
  const indices = faceIndexValues(rawIndices);
  if (!indices) {
    return {
      indices: null,
      exactOrangeFaceCount,
      failClosedReason: "exact-orange source face indices are missing or malformed",
    };
  }
  if (separationWasSupplied) {
    const outsidePositions = separation?.outsidePositions;
    if (!(outsidePositions instanceof Float32Array)
      || outsidePositions.length % 9 !== 0
      || outsidePositions.length / 9 !== exactOrangeFaceCount) {
      return {
        indices: null,
        exactOrangeFaceCount,
        failClosedReason: "exact-orange face count and positions are inconsistent",
      };
    }
  }
  if (indices.length !== exactOrangeFaceCount) {
    return {
      indices: null,
      exactOrangeFaceCount,
      failClosedReason: "exact-orange source face index count does not match the orange face count",
    };
  }

  const unique = new Set<number>();
  for (const faceIndex of indices) {
    if (!Number.isSafeInteger(faceIndex) || faceIndex < 0 || unique.has(faceIndex)) {
      return {
        indices: null,
        exactOrangeFaceCount,
        failClosedReason: "exact-orange source face indices are not unique non-negative integers",
      };
    }
    unique.add(faceIndex);
  }
  return { indices: unique, exactOrangeFaceCount, failClosedReason: null };
}

function makeResult(
  preview: SupportForestPreviewLeafSelection,
  exactOrangeFaceCount: number,
  diagnosedEligibleSiteCount: number,
  explicitEligibleSiteCount: number,
  excludedPreAttachmentDiagnosedOutsideSiteCount: number,
  failClosedReason: string | null,
): Stage8RemovableSupportSelection {
  const sampledCount = preview.leaves.length;
  const reason = failClosedReason
    ? `fail-closed: ${failClosedReason} · explicit-profile outside sites only`
    : `exact orange ${exactOrangeFaceCount.toLocaleString()} faces · diagnosed sites ${diagnosedEligibleSiteCount.toLocaleString()} · explicit profile sites ${explicitEligibleSiteCount.toLocaleString()} · sampled ${sampledCount.toLocaleString()}${preview.limited ? " / limited" : ""}`;
  return {
    ...preview,
    exactOrangeFaceCount,
    diagnosedEligibleSiteCount,
    explicitEligibleSiteCount,
    excludedPreAttachmentDiagnosedOutsideSiteCount,
    sampledCount,
    failClosedReason,
    reason,
  };
}

function selectStage8RemovableSupportPreviewLeavesFromInput(
  input: Stage8RemovableSupportSelectionInput | null,
): Stage8RemovableSupportSelection {
  const entries = input?.entries ?? null;
  const maximumLeaves = input?.maximumLeaves ?? STAGE8_REMOVABLE_SUPPORT_PREVIEW_MAX_LEAVES;
  if (!entries) {
    const preview = selectSupportForestPreviewLeaves([], maximumLeaves);
    return makeResult(preview, 0, 0, 0, 0, "support assignment ledger is missing");
  }

  const exactOrange = input ? resolveExactOrangeFact(input) : {
    indices: null,
    exactOrangeFaceCount: 0,
    failClosedReason: "exact-orange source face indices are missing or malformed",
  };
  const candidates: OverhangAssignmentEntry[] = [];
  let diagnosedEligibleSiteCount = 0;
  let explicitEligibleSiteCount = 0;
  let excludedPreAttachmentDiagnosedOutsideSiteCount = 0;
  for (const entry of entries) {
    if (!existingPreviewEligibility(entry)) continue;
    if (entry.source === "explicit-profile") {
      explicitEligibleSiteCount++;
      candidates.push(entry);
      continue;
    }
    const faceIndex = entry.faceIndex;
    if (!exactOrange.indices || typeof faceIndex !== "number" || !Number.isSafeInteger(faceIndex) || faceIndex < 0 || !exactOrange.indices.has(faceIndex)) {
      excludedPreAttachmentDiagnosedOutsideSiteCount++;
      continue;
    }
    diagnosedEligibleSiteCount++;
    candidates.push(entry);
  }

  const preview = selectSupportForestPreviewLeaves(candidates, maximumLeaves);
  return makeResult(
    preview,
    exactOrange.exactOrangeFaceCount,
    diagnosedEligibleSiteCount,
    explicitEligibleSiteCount,
    excludedPreAttachmentDiagnosedOutsideSiteCount,
    exactOrange.failClosedReason,
  );
}

/**
 * Select the bounded Stage 8 removable-support preview. The existing
 * deterministic sampler remains the only cap/order implementation; this
 * helper only narrows the candidate ledger before that sampler runs.
 */
export function selectStage8RemovableSupportPreviewLeaves(
  input: Stage8RemovableSupportSelectionInput | null,
): Stage8RemovableSupportSelection;
export function selectStage8RemovableSupportPreviewLeaves(
  entries: readonly OverhangAssignmentEntry[] | null,
  separation: DryWebSupportSeparationPresentation | null,
  maximumLeaves?: number,
): Stage8RemovableSupportSelection;
export function selectStage8RemovableSupportPreviewLeaves(
  inputOrEntries: Stage8RemovableSupportSelectionInput | readonly OverhangAssignmentEntry[] | null,
  separation?: DryWebSupportSeparationPresentation | null,
  maximumLeaves?: number,
): Stage8RemovableSupportSelection {
  if (Array.isArray(inputOrEntries) || inputOrEntries === null) {
    return selectStage8RemovableSupportPreviewLeavesFromInput({
      entries: inputOrEntries,
      separation,
      maximumLeaves,
    });
  }
  return selectStage8RemovableSupportPreviewLeavesFromInput(inputOrEntries as Stage8RemovableSupportSelectionInput);
}

/** Short alias for callers that do not need the Stage number in the name. */
export function selectRemovableSupportPreviewLeaves(
  input: Stage8RemovableSupportSelectionInput | null,
): Stage8RemovableSupportSelection {
  return selectStage8RemovableSupportPreviewLeaves(input);
}

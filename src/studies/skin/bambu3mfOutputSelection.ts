import type { SupportPaintApplicationFacts } from "./supportPaint.ts";
import type {
  OverhangAssignmentCounts,
  OverhangAssignmentEntry,
  OverhangSupportRayFacts,
} from "./overhangSupportPolicy.ts";
import type { DryWebSupportSeparationPresentation } from "./dryWebSupportSeparationPresentation.ts";

/** Stable wire values for the two 3MF candidate-input routes. */
export const BAMBU3MF_LEGACY_SELECTION_MODE = "legacy-full-diagnosis-v1" as const;
export const BAMBU3MF_EXACT_ORANGE_SELECTION_MODE = "targetedGrid-exact-orange-v1" as const;
export type Bambu3mfSupportSelectionMode =
  | typeof BAMBU3MF_LEGACY_SELECTION_MODE
  | typeof BAMBU3MF_EXACT_ORANGE_SELECTION_MODE;

/**
 * Exact-orange positions already carry the current Support Paint result. The
 * legacy route still owns the historical diagnosed-face Paint application.
 */
export function shouldApplyBambu3mfDiagnosedSupportPaint(
  mode: Bambu3mfSupportSelectionMode,
): boolean {
  if (mode === BAMBU3MF_LEGACY_SELECTION_MODE) return true;
  if (mode === BAMBU3MF_EXACT_ORANGE_SELECTION_MODE) return false;
  throw new Error("Fail closed: unsupported 3MF support selection mode");
}

export interface Bambu3mfSupportSelectionEvidence {
  mode: Bambu3mfSupportSelectionMode;
  /** Surface-diagnosis generation which owns the exact source IDs. */
  generation: number;
  /** Number of full pre-attachment diagnosed triangles in source order. */
  sourceFaceCount: number;
  /** Number of exact-orange triangles selected for removable support. */
  exactOrangeFaceCount: number;
  /** Source ordinals for exact-orange triangles, in selected soup order. */
  exactOrangeSourceFaceIndices: number[];
  /** Number of original ledger diagnosed sites belonging to selected faces. */
  exactOrangeDiagnosedSiteCount: number;
  /** Original ledger faces whose diagnosed sites are all outside/non-duplicate. */
  originalDiagnosedOutsideFaceIndices: number[];
  /** Exact post-attachment teal/mitigated triangle count. */
  mitigatedOrExcludedTealFaceCount: number;
  /** Exact post-attachment red/unresolved triangle count. */
  unresolvedFaceCount: number;
  /** Number of explicit Profile targets retained as a separate source. */
  explicitTargetCount: number;
  /** Original full classification ledger facts. Never narrowed for dispatch. */
  originalClassificationCounts: OverhangAssignmentCounts;
  /** Original support-free Surface ray facts. */
  originalSupportRayFacts: OverhangSupportRayFacts;
  /** Original full Support Paint application facts. */
  originalSupportPaintFacts: SupportPaintApplicationFacts;
  /** Deterministic identity for export/cache invalidation. */
  selectionIdentity: string;
}

export interface Bambu3mfOutputSelectionInput {
  internalStructure: string;
  /** Legacy full-diagnosis source soup, already converted to source units. */
  legacyDangerousPositions: Float32Array;
  /** Current exact Stage 7/8 separation, when the targeted route is used. */
  separation: DryWebSupportSeparationPresentation | null;
  /** Includes source/result identity checks beyond separation.state. */
  separationIsCurrent: boolean;
  sourceFaceCount: number;
  generation: number;
  originalClassificationCounts: OverhangAssignmentCounts;
  originalSupportRayFacts: OverhangSupportRayFacts | null;
  originalSupportPaintFacts: SupportPaintApplicationFacts | null;
  explicitTargetCount: number;
  /** Original diagnosed entries used to bind exact IDs to classifications. */
  originalEntries: readonly OverhangAssignmentEntry[] | null;
}

export type Bambu3mfOutputSelection =
  | {
    ok: true;
    dangerousPositions: Float32Array;
    evidence: Bambu3mfSupportSelectionEvidence;
  }
  | {
    ok: false;
    reason: string;
  };

const COUNT_KEYS = [
  "total", "inside", "outside", "unresolved", "duplicate", "unassigned",
  "mixedFace", "insideSupportSite", "outsideSupportSite", "unresolvedSupportSite", "duplicateSupportSite",
] as const;

function cloneCounts(counts: OverhangAssignmentCounts): OverhangAssignmentCounts {
  return { ...counts };
}

function cloneRayFacts(facts: OverhangSupportRayFacts): OverhangSupportRayFacts {
  return { ...facts };
}

function clonePaintFacts(facts: SupportPaintApplicationFacts): SupportPaintApplicationFacts {
  return {
    ...facts,
    automaticCounts: { ...facts.automaticCounts },
    finalCounts: { ...facts.finalCounts },
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validCounts(value: unknown): value is OverhangAssignmentCounts {
  if (!value || typeof value !== "object") return false;
  const counts = value as Record<string, unknown>;
  if (!COUNT_KEYS.every((key) => isNonNegativeSafeInteger(counts[key]))) return false;
  const typed = counts as unknown as OverhangAssignmentCounts;
  return typed.total === typed.inside + typed.outside + typed.unresolved;
}

function validPaintFacts(value: unknown): value is SupportPaintApplicationFacts {
  if (!value || typeof value !== "object") return false;
  const facts = value as SupportPaintApplicationFacts;
  return isNonNegativeSafeInteger(facts.strokeCount)
    && isNonNegativeSafeInteger(facts.paintedSupportSiteCount)
    && isNonNegativeSafeInteger(facts.manualOverrideSupportSiteCount)
    && isNonNegativeSafeInteger(facts.autoResetSupportSiteCount)
    && [facts.automaticCounts, facts.finalCounts].every((counts) =>
      counts && [counts.inside, counts.outside, counts.unresolved].every(isNonNegativeSafeInteger));
}

function finiteTriangleSoup(value: unknown): value is Float32Array {
  if (!(value instanceof Float32Array) || value.length % 9 !== 0) return false;
  return value.every(Number.isFinite);
}

function validRayFacts(value: unknown): value is OverhangSupportRayFacts {
  if (!value || typeof value !== "object") return false;
  const facts = value as OverhangSupportRayFacts;
  return facts.method === "support-free-surface-downward-ray-v1"
    && facts.surfaceSource === "support-free-final-surface"
    && facts.rayDirection === "negative-z"
    && [facts.meshScaleMm, facts.lowerIntersectionEpsilonMm, facts.gridCellSizeMm, facts.gridCellCount,
      facts.surfaceTriangleCount, facts.invalidSurfaceTriangleCount].every(Number.isFinite);
}

function buildSelectionIdentity(input: Pick<Bambu3mfSupportSelectionEvidence,
  "mode" | "generation" | "sourceFaceCount" | "exactOrangeFaceCount" | "exactOrangeSourceFaceIndices">): string {
  return JSON.stringify({
    mode: input.mode,
    generation: input.generation,
    sourceFaceCount: input.sourceFaceCount,
    exactOrangeFaceCount: input.exactOrangeFaceCount,
    exactOrangeSourceFaceIndices: input.exactOrangeSourceFaceIndices,
  });
}

function diagnosedOutsideFaceIndices(entries: readonly OverhangAssignmentEntry[] | null): number[] | null {
  if (!entries) return null;
  const byFace = new Map<number, OverhangAssignmentEntry[]>();
  for (const entry of entries) {
    if (entry.source !== "diagnosed-face" || !isNonNegativeSafeInteger(entry.faceIndex)) continue;
    const faceEntries = byFace.get(entry.faceIndex) ?? [];
    faceEntries.push(entry);
    byFace.set(entry.faceIndex, faceEntries);
  }
  const outside: number[] = [];
  for (const [faceIndex, faceEntries] of byFace) {
    const siteIndices = new Set<number>();
    let valid = faceEntries.length === 4;
    for (const entry of faceEntries) {
      if (entry.duplicateOf || entry.classification !== "outside"
        || !isNonNegativeSafeInteger(entry.siteIndex)
        || entry.siteIndex > 3 || siteIndices.has(entry.siteIndex)) {
        valid = false;
        break;
      }
      siteIndices.add(entry.siteIndex);
    }
    if (!valid) continue;
    if (siteIndices.size === 4) outside.push(faceIndex);
  }
  return outside.sort((a, b) => a - b);
}

function fail(reason: string): Bambu3mfOutputSelection {
  return { ok: false, reason: `Fail closed: ${reason}` };
}

function validateCommonInput(input: Bambu3mfOutputSelectionInput): string | null {
  if (!finiteTriangleSoup(input.legacyDangerousPositions)) return "legacy diagnosis positions are not a finite triangle soup";
  if (!isNonNegativeSafeInteger(input.sourceFaceCount)) return "diagnosed source face count is invalid";
  if (input.legacyDangerousPositions.length / 9 !== input.sourceFaceCount) return "diagnosed source face count does not match the original soup";
  if (!isNonNegativeSafeInteger(input.generation)) return "Surface diagnosis generation is invalid";
  if (!isNonNegativeSafeInteger(input.explicitTargetCount)) return "explicit Profile target count is invalid";
  if (!input.originalEntries) return "original classification entries are missing";
  if (!validCounts(input.originalClassificationCounts)) return "original classification counts are invalid";
  if (!validRayFacts(input.originalSupportRayFacts)) return "original support ray facts are missing or invalid";
  if (!validPaintFacts(input.originalSupportPaintFacts)) return "original Support Paint facts are missing or invalid";
  return null;
}

/** Validate the selection evidence again inside the Worker boundary. */
export function validateBambu3mfSupportSelectionEvidence(input: {
  evidence: Bambu3mfSupportSelectionEvidence;
  dangerousPositions: Float32Array;
}): void {
  const evidence = input.evidence;
  if (!evidence || typeof evidence !== "object") throw new Error("Fail closed: 3MF support selection evidence is missing");
  if (!finiteTriangleSoup(input.dangerousPositions)) throw new Error("Fail closed: selected diagnosis positions are not a finite triangle soup");
  if (!isNonNegativeSafeInteger(evidence.generation) || !isNonNegativeSafeInteger(evidence.sourceFaceCount)) {
    throw new Error("Fail closed: 3MF support selection generation/source count is invalid");
  }
  if (!isNonNegativeSafeInteger(evidence.exactOrangeFaceCount)
    || !isNonNegativeSafeInteger(evidence.exactOrangeDiagnosedSiteCount)
    || !isNonNegativeSafeInteger(evidence.mitigatedOrExcludedTealFaceCount)
    || !isNonNegativeSafeInteger(evidence.unresolvedFaceCount)
    || !isNonNegativeSafeInteger(evidence.explicitTargetCount)
    || !validCounts(evidence.originalClassificationCounts)
    || !validRayFacts(evidence.originalSupportRayFacts)
    || !validPaintFacts(evidence.originalSupportPaintFacts)) {
    throw new Error("Fail closed: 3MF support selection evidence facts are invalid");
  }
  if (!Array.isArray(evidence.exactOrangeSourceFaceIndices)
    || !evidence.exactOrangeSourceFaceIndices.every(isNonNegativeSafeInteger)) {
    throw new Error("Fail closed: exact-orange source face IDs are invalid");
  }
  const unique = new Set(evidence.exactOrangeSourceFaceIndices);
  if (unique.size !== evidence.exactOrangeSourceFaceIndices.length
    || evidence.exactOrangeSourceFaceIndices.some((index) => index >= evidence.sourceFaceCount)) {
    throw new Error("Fail closed: exact-orange source face IDs are not unique or in range");
  }
  if (!Array.isArray(evidence.originalDiagnosedOutsideFaceIndices)
    || !evidence.originalDiagnosedOutsideFaceIndices.every(isNonNegativeSafeInteger)) {
    throw new Error("Fail closed: original diagnosed outside face IDs are invalid");
  }
  const originalOutside = new Set(evidence.originalDiagnosedOutsideFaceIndices);
  if (originalOutside.size !== evidence.originalDiagnosedOutsideFaceIndices.length
    || evidence.originalDiagnosedOutsideFaceIndices.some((index) => index >= evidence.sourceFaceCount)) {
    throw new Error("Fail closed: original diagnosed outside face IDs are not unique or in range");
  }
  if (evidence.selectionIdentity !== buildSelectionIdentity(evidence)) {
    throw new Error("Fail closed: exact selection identity is inconsistent");
  }
  if (evidence.mode === BAMBU3MF_EXACT_ORANGE_SELECTION_MODE) {
    if (evidence.unresolvedFaceCount !== 0) throw new Error("Fail closed: exact selection has unresolved red faces");
    if (evidence.exactOrangeFaceCount !== evidence.exactOrangeSourceFaceIndices.length
      || evidence.exactOrangeFaceCount !== input.dangerousPositions.length / 9) {
      throw new Error("Fail closed: exact-orange face count does not match IDs and selected positions");
    }
    if (evidence.exactOrangeSourceFaceIndices.some((index) => !originalOutside.has(index))) {
      throw new Error("Fail closed: exact-orange source face is not outside in the original ledger");
    }
    if (evidence.exactOrangeDiagnosedSiteCount !== evidence.exactOrangeFaceCount * 4) {
      throw new Error("Fail closed: exact-orange diagnosed site count is inconsistent");
    }
  } else if (evidence.mode === BAMBU3MF_LEGACY_SELECTION_MODE) {
    if (evidence.exactOrangeFaceCount !== 0 || evidence.exactOrangeSourceFaceIndices.length !== 0
      || evidence.exactOrangeDiagnosedSiteCount !== 0 || evidence.originalDiagnosedOutsideFaceIndices.length !== 0) {
      throw new Error("Fail closed: legacy selection carries exact-orange IDs");
    }
    if (input.dangerousPositions.length / 9 !== evidence.sourceFaceCount) {
      throw new Error("Fail closed: legacy diagnosis face count is inconsistent");
    }
  } else {
    throw new Error("Fail closed: unsupported 3MF support selection mode");
  }
}

/**
 * Build the immutable output-input boundary. TargetedGrid uses only the
 * current exact-orange soup; all other modes retain the existing full
 * diagnosis soup. No source array or evidence object is mutated.
 */
export function buildBambu3mfOutputSelection(input: Bambu3mfOutputSelectionInput): Bambu3mfOutputSelection {
  const commonError = validateCommonInput(input);
  if (commonError) return fail(commonError);

  const exact = input.internalStructure === "targetedGrid";
  const originalOutsideFaceIndices = diagnosedOutsideFaceIndices(input.originalEntries);
  if (!originalOutsideFaceIndices) return fail("original classification entries are missing");
  if (!exact) {
    const evidence: Bambu3mfSupportSelectionEvidence = {
      mode: BAMBU3MF_LEGACY_SELECTION_MODE,
      generation: input.generation,
      sourceFaceCount: input.sourceFaceCount,
      exactOrangeFaceCount: 0,
      exactOrangeSourceFaceIndices: [],
      exactOrangeDiagnosedSiteCount: 0,
      originalDiagnosedOutsideFaceIndices: [],
      mitigatedOrExcludedTealFaceCount: 0,
      unresolvedFaceCount: 0,
      explicitTargetCount: input.explicitTargetCount,
      originalClassificationCounts: cloneCounts(input.originalClassificationCounts),
      originalSupportRayFacts: cloneRayFacts(input.originalSupportRayFacts!),
      originalSupportPaintFacts: clonePaintFacts(input.originalSupportPaintFacts!),
      selectionIdentity: "",
    };
    evidence.selectionIdentity = buildSelectionIdentity(evidence);
    const result: Bambu3mfOutputSelection = { ok: true, dangerousPositions: input.legacyDangerousPositions.slice(), evidence };
    validateBambu3mfSupportSelectionEvidence({ evidence, dangerousPositions: result.dangerousPositions });
    return result;
  }

  const separation = input.separation;
  if (!input.separationIsCurrent || !separation || separation.state !== "current") {
    return fail("current exact-orange separation is missing or stale");
  }
  if (separation.unresolvedFaceCount !== 0) return fail("exact-orange separation still has unresolved red faces");
  if (!isNonNegativeSafeInteger(separation.outsideFaceCount)
    || !finiteTriangleSoup(separation.outsidePositions)
    || separation.outsidePositions.length / 9 !== separation.outsideFaceCount) {
    return fail("exact-orange positions are not a finite triangle soup matching the orange count");
  }
  if (!Array.isArray(separation.outsideSourceFaceIndices)
    || separation.outsideSourceFaceIndices.length !== separation.outsideFaceCount) {
    return fail("exact-orange source face IDs do not match the orange count");
  }
  const sourceIds = separation.outsideSourceFaceIndices.slice();
  const unique = new Set(sourceIds);
  if (!sourceIds.every((index) => isNonNegativeSafeInteger(index) && index < input.sourceFaceCount)
    || unique.size !== sourceIds.length) {
    return fail("exact-orange source face IDs are not unique finite in-range integers");
  }
  const originalOutside = new Set(originalOutsideFaceIndices);
  if (sourceIds.some((index) => !originalOutside.has(index))) {
    return fail("exact-orange source face is not outside in the original ledger");
  }
  const selectedSourceIds = new Set(sourceIds);
  const exactOrangeDiagnosedSiteCount = input.originalEntries!.filter((entry) =>
    entry.source === "diagnosed-face"
    && isNonNegativeSafeInteger(entry.faceIndex)
    && selectedSourceIds.has(entry.faceIndex)
    && !entry.duplicateOf).length;
  const evidence: Bambu3mfSupportSelectionEvidence = {
    mode: BAMBU3MF_EXACT_ORANGE_SELECTION_MODE,
    generation: input.generation,
    sourceFaceCount: input.sourceFaceCount,
    exactOrangeFaceCount: separation.outsideFaceCount,
    exactOrangeSourceFaceIndices: sourceIds,
    exactOrangeDiagnosedSiteCount,
    originalDiagnosedOutsideFaceIndices: originalOutsideFaceIndices,
    mitigatedOrExcludedTealFaceCount: separation.mitigatedFaceCount,
    unresolvedFaceCount: separation.unresolvedFaceCount,
    explicitTargetCount: input.explicitTargetCount,
    originalClassificationCounts: cloneCounts(input.originalClassificationCounts),
    originalSupportRayFacts: cloneRayFacts(input.originalSupportRayFacts!),
    originalSupportPaintFacts: clonePaintFacts(input.originalSupportPaintFacts!),
    selectionIdentity: "",
  };
  evidence.selectionIdentity = buildSelectionIdentity(evidence);
  const result: Bambu3mfOutputSelection = { ok: true, dangerousPositions: separation.outsidePositions.slice(), evidence };
  try {
    validateBambu3mfSupportSelectionEvidence({ evidence, dangerousPositions: result.dangerousPositions });
  } catch (error) {
    return fail(error instanceof Error ? error.message.replace(/^Fail closed:\s*/, "") : String(error));
  }
  return result;
}

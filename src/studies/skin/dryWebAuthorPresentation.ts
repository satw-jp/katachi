import type { TargetedGridContactFacts } from "./targetedGrid.ts";

export type DryWebAuthorPresentationStatus = "uncomputed" | "pass" | "warning";

export type DryWebContactBinKey = "zero" | "one" | "two" | "threeOrMore";

export interface DryWebContactBin {
  key: DryWebContactBinKey;
  /** Short author-facing label used by the Stage 4 legend. */
  label: string;
  count: number;
  /** True when this bin meets the selected per-element requirement. */
  passesThreshold: boolean;
}

export interface DryWebAuthorPresentation {
  hideRemovableSupportOverlay: true;
  hideSurfaceAngleOverlay: true;
  status: DryWebAuthorPresentationStatus;
  requiredContacts: number;
  /** Existing caller-facing count retained for compatibility. */
  patchCount: number;
  totalPatchCount: number;
  passingPatchCount: number;
  insufficientPatchCount: number;
  mainComponentPatchCount: number;
  mainComponentSize: number;
  componentCount: number;
  insufficientPatchIds: number[];
  insufficientPatchIdsTruncated: boolean;
  /** Four fixed contact-count bins for the display-only 3D legend. */
  contactBins: DryWebContactBin[] | null;
  text: string;
}

export interface DryWebAuthorPresentationOptions {
  maxInsufficientPatchIds?: number;
}

export const DEFAULT_MAX_INSUFFICIENT_PATCH_IDS = 12;

export function normalizeDryWebRequiredContacts(value: number | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(3, Math.round(value!)));
}

function normalizePatchCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeIdLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_INSUFFICIENT_PATCH_IDS;
  return Math.max(0, Math.round(value!));
}

function hasContactFacts(value: TargetedGridContactFacts | null | undefined): value is TargetedGridContactFacts {
  return Boolean(value)
    && Number.isFinite(value!.usefulPatchCount)
    && value!.usefulPatchCount >= 0
    && Number.isFinite(value!.componentCount)
    && value!.componentCount >= 0
    && Number.isFinite(value!.mainComponentSize)
    && value!.mainComponentSize >= 0
    && (value!.mainComponentKey === null || typeof value!.mainComponentKey === "string")
    && Array.isArray(value!.patches);
}

export function dryWebContactBinKey(value: number): DryWebContactBinKey {
  const count = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (count <= 0) return "zero";
  if (count === 1) return "one";
  if (count === 2) return "two";
  return "threeOrMore";
}

/**
 * Count the already-generated per-patch contact facts into four stable bins.
 * This is intentionally independent of the graph builder: changing the
 * author threshold only changes passesThreshold and never starts a Worker.
 */
export function dryWebContactBins(
  requiredContacts: number | undefined,
  facts: TargetedGridContactFacts | null | undefined,
): DryWebContactBin[] | null {
  if (!hasContactFacts(facts)) return null;
  const contacts = normalizeDryWebRequiredContacts(requiredContacts);
  const counts: Record<DryWebContactBinKey, number> = {
    zero: 0,
    one: 0,
    two: 0,
    threeOrMore: 0,
  };
  for (const patch of facts.patches) counts[dryWebContactBinKey(patch.contactCount)]++;
  return [
    { key: "zero", label: "0接点", count: counts.zero, passesThreshold: 0 >= contacts },
    { key: "one", label: "1接点", count: counts.one, passesThreshold: 1 >= contacts },
    { key: "two", label: "2接点", count: counts.two, passesThreshold: 2 >= contacts },
    { key: "threeOrMore", label: "3接点以上", count: counts.threeOrMore, passesThreshold: 3 >= contacts },
  ];
}

export function dryWebAuthorPresentation(
  requiredContacts: number | undefined,
  patchCount: number,
  facts?: TargetedGridContactFacts | null,
  options: DryWebAuthorPresentationOptions = {},
): DryWebAuthorPresentation {
  const contacts = normalizeDryWebRequiredContacts(requiredContacts);
  const patches = normalizePatchCount(patchCount);
  if (!hasContactFacts(facts)) {
    return {
      hideRemovableSupportOverlay: true,
      hideSurfaceAngleOverlay: true,
      status: "uncomputed",
      requiredContacts: contacts,
      patchCount: patches,
      totalPatchCount: patches,
      passingPatchCount: 0,
      insufficientPatchCount: 0,
      mainComponentPatchCount: 0,
      mainComponentSize: 0,
      componentCount: 0,
      insufficientPatchIds: [],
      insufficientPatchIdsTruncated: false,
      contactBins: null,
      text: `Artwork Integration: 未計算 / gray · target source=support-derived provisional（Surface Pattern target replacementが必要） · 必要接触数 ${contacts} · Surface Pattern ${patches}要素`,
    };
  }

  const totalPatchCount = Math.max(0, Math.round(facts.usefulPatchCount));
  const orderedPatches = facts.patches.slice().sort((a, b) => a.patchId - b.patchId);
  const mainComponentPatchCount = orderedPatches.filter((patch) => patch.componentKey === facts.mainComponentKey).length;
  const insufficient = orderedPatches.filter((patch) =>
    patch.componentKey !== facts.mainComponentKey || patch.contactCount < contacts);
  const passingPatchCount = Math.max(0, orderedPatches.length - insufficient.length);
  const maxInsufficientPatchIds = normalizeIdLimit(options.maxInsufficientPatchIds);
  const insufficientPatchIds = insufficient.slice(0, maxInsufficientPatchIds).map((patch) => patch.patchId);
  const insufficientPatchIdsTruncated = insufficient.length > insufficientPatchIds.length;
  const insufficientIdsText = insufficientPatchIds.length > 0
    ? insufficientPatchIds.join(", ") + (insufficientPatchIdsTruncated ? " …" : "")
    : "なし";
  const status: DryWebAuthorPresentationStatus = totalPatchCount > 0 && insufficient.length === 0
    ? "pass"
    : "warning";
  return {
    hideRemovableSupportOverlay: true,
    hideSurfaceAngleOverlay: true,
    status,
    requiredContacts: contacts,
    patchCount: patches,
    totalPatchCount,
    passingPatchCount,
    insufficientPatchCount: insufficient.length,
    mainComponentPatchCount,
    mainComponentSize: Math.max(0, Math.round(facts.mainComponentSize)),
    componentCount: Math.max(0, Math.round(facts.componentCount)),
    insufficientPatchIds,
    insufficientPatchIdsTruncated,
    contactBins: dryWebContactBins(contacts, facts),
    text: `Artwork Integration preview: ${status} · generator facts only（mesh / printabilityは未判定） · target source=support-derived provisional · Surface Pattern ${totalPatchCount}要素 · 必要接触数 ${contacts} · pass ${passingPatchCount} · insufficient ${insufficient.length} · main component ${mainComponentPatchCount} / ${totalPatchCount}（size ${Math.max(0, Math.round(facts.mainComponentSize))} / components ${Math.max(0, Math.round(facts.componentCount))}） · insufficient patch IDs ${insufficientIdsText}`,
  };
}

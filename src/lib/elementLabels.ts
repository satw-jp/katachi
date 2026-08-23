export type ElementLabelDomain = "surface" | "interior";
export type ElementLabelKind = "flower" | "coin" | "flatRing" | "ring3d" | "ring";
export type InteriorLabelVariant = "field-only" | "coin-constrained" | "ring-constrained";

const KIND_NAME: Record<ElementLabelKind, string> = {
  flower: "花",
  coin: "コイン",
  flatRing: "平リング",
  ring3d: "立体リング",
  ring: "リング",
};

/** Stable, short vocabulary for discussing one generated element. The id is
 * already recipe data; deriving the name avoids inventing unsaved identity. */
export function elementDisplayName(
  domain: ElementLabelDomain,
  kind: ElementLabelKind,
  id: number,
  interiorVariant?: InteriorLabelVariant,
): string {
  const prefix = domain === "surface"
    ? "S"
    : interiorVariant === "field-only"
      ? "I-F"
      : interiorVariant === "coin-constrained"
        ? "I-C"
        : interiorVariant === "ring-constrained"
          ? "I-R"
          : "I";
  return `${prefix}・${KIND_NAME[kind]} ${String(id).padStart(3, "0")}`;
}

/** Search derived Japanese names by every meaningful query token.  Spaces and
 * punctuation are separators, so an author can type `I-C 001` for the
 * rendered `I-C・コイン 001` without coupling persistence to that label. */
export function matchesElementSearch(name: string, id: number, query: string): boolean {
  const tokens = query.toLocaleLowerCase().split(/[\s\p{P}\p{S}_]+/u).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = `${name} ${id}`.toLocaleLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/** Deterministically keep labels readable on dense fields. The selected item
 * is always included, followed by an even sample spanning the full result. */
export function representativeElements<T extends { id: number }>(
  items: T[],
  limit: number,
  selectedId: number | null = null,
): T[] {
  const cap = Math.max(0, Math.floor(limit));
  if (cap === 0 || items.length === 0) return [];
  if (items.length <= cap) return [...items];
  const selected = selectedId === null ? undefined : items.find((item) => item.id === selectedId);
  const result: T[] = selected ? [selected] : [];
  const used = new Set(result.map((item) => item.id));
  const slots = cap - result.length;
  for (let i = 0; i < slots; i++) {
    const index = slots === 1 ? 0 : Math.round((i * (items.length - 1)) / (slots - 1));
    const item = items[index];
    if (!used.has(item.id)) { result.push(item); used.add(item.id); }
  }
  for (const item of items) {
    if (result.length >= cap) break;
    if (!used.has(item.id)) { result.push(item); used.add(item.id); }
  }
  return result;
}

/** Fade labels continuously from front to back while keeping the actively
 * selected element fully readable. Distances are measured in camera space. */
export function elementLabelDepthOpacity(
  distance: number,
  nearest: number,
  farthest: number,
  selected = false,
): number {
  if (selected) return 1;
  if (![distance, nearest, farthest].every(Number.isFinite) || farthest - nearest < 1e-6) return 0.82;
  const depth = Math.max(0, Math.min(1, (distance - nearest) / (farthest - nearest)));
  return 1 - depth * 0.7;
}

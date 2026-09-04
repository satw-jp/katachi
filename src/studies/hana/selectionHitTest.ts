export type HanaSelectionElementKind = "stroke" | "flower";

export interface HanaSelectionCandidate {
  kind: HanaSelectionElementKind;
  id: string;
  distance: number;
  frontMost?: number;
}

/** Choose a semantic authoring element deterministically; no Surface triangle is retained. */
export function chooseHanaSelectionCandidate(
  candidates: readonly HanaSelectionCandidate[],
  hitRadius: number,
): HanaSelectionCandidate | null {
  const eligible = candidates
    .filter((candidate) => Number.isFinite(candidate.distance) && candidate.distance <= hitRadius)
    .map((candidate) => ({ ...candidate, frontMost: candidate.frontMost ?? 0 }))
    .sort((a, b) => (
      a.distance - b.distance
      || b.frontMost - a.frontMost
      || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "flower" ? -1 : 1)
    ));
  return eligible[0] ?? null;
}

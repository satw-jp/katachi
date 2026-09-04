import { archiveAxisValues } from "./classification.ts";
import type { SkinArtArchiveItem } from "./types.ts";

export function matchesArchiveSearch(item: SkinArtArchiveItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return archiveAxisValues(item).some((value) => value.toLowerCase().includes(normalized));
}

export function searchArchiveItems(items: readonly SkinArtArchiveItem[], query: string): readonly SkinArtArchiveItem[] {
  return items.filter((item) => matchesArchiveSearch(item, query));
}

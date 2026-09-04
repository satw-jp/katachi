import { archiveSignature } from "./classification.ts";
import type { SkinArtArchiveItem } from "./types.ts";

export function jaccardSimilarity(left: SkinArtArchiveItem, right: SkinArtArchiveItem): number {
  const a = archiveSignature(left);
  const b = archiveSignature(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

export function relatedArchiveItems(item: SkinArtArchiveItem, candidates: readonly SkinArtArchiveItem[], limit = 5): readonly { item: SkinArtArchiveItem; score: number }[] {
  return candidates
    .filter((candidate) => candidate.id !== item.id)
    .map((candidate) => ({ item: candidate, score: jaccardSimilarity(item, candidate) }))
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .slice(0, limit);
}

export function similarityLabel(score: number): "VERY CLOSE" | "CLOSE" | "RELATED" {
  if (score >= 0.45) return "VERY CLOSE";
  if (score >= 0.27) return "CLOSE";
  return "RELATED";
}

import type { SkinArtArchiveItem } from "./types.ts";

export function archiveSignature(item: SkinArtArchiveItem): ReadonlySet<string> {
  return new Set([...item.sourceLogic, ...item.primitives, ...item.temporalModes, ...item.spatialModes]);
}

export function archiveAxisValues(item: SkinArtArchiveItem): readonly string[] {
  return [...archiveSignature(item), ...item.tags, item.primaryGenre, item.generation, item.title, item.description];
}

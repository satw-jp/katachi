export interface RecipeEnvelope<StudyId extends string, Entry> {
  formatVersion: 1;
  studyId: StudyId;
  exportedAt: string;
  entries: Entry[];
}

/** Serialize the shared recipe envelope without interpreting Study entries. */
export function serializeRecipeEnvelope<StudyId extends string, Entry>(
  studyId: StudyId,
  entries: Entry[],
): string {
  const recipe: RecipeEnvelope<StudyId, Entry> = {
    formatVersion: 1,
    studyId,
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(recipe, null, 2);
}

/**
 * Preserve the original permissive contract: both the wrapped v1 envelope
 * and legacy bare entry arrays are accepted. Study/version validation stays
 * deliberately outside this shared structural parser.
 */
export function parseRecipeEntries<Entry>(text: string): Entry[] {
  const data = JSON.parse(text) as Partial<RecipeEnvelope<string, Entry>> | Entry[];
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}

import { composerSourceFromFkeiText, type ComposerSource } from "./composerSource.ts";

export type { ComposerSource } from "./composerSource.ts";

export const FIRST_PRINT_FKEI_URL = "/samples/skin-rebuild-first-print.fkei";

export async function loadComposerSourceFromText(text: string): Promise<ComposerSource> {
  return composerSourceFromFkeiText(text);
}

export async function loadBundledComposerSource(): Promise<ComposerSource> {
  const response = await fetch(FIRST_PRINT_FKEI_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Bundled FKEI returned HTTP ${response.status}`);
  return composerSourceFromFkeiText(await response.text());
}

export async function loadComposerSourceFromFile(file: File): Promise<ComposerSource> {
  return composerSourceFromFkeiText(await file.text());
}

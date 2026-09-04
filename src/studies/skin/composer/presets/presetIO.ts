import type { ComposerState } from "../runtime/state.ts";

const key = "skin-art-composer-preset";

export function saveComposerPreset(state: ComposerState): void { localStorage.setItem(key, JSON.stringify(state)); }
export function loadComposerPreset(): ComposerState | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as ComposerState : null;
  } catch {
    return null;
  }
}

export function downloadComposerManifest(manifest: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

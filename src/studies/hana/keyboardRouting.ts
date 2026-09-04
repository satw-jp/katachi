const HANA_DELETE_KEYS = new Set(["Delete", "Backspace"]);
const HANA_TEXT_TARGET_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isHanaDeleteKey(key: string): boolean {
  return HANA_DELETE_KEYS.has(key);
}

export function shouldIgnoreHanaDeleteForTarget(
  tagName: string | null,
  isContentEditable: boolean,
): boolean {
  return isContentEditable || (tagName !== null && HANA_TEXT_TARGET_TAGS.has(tagName.toUpperCase()));
}

export type HanaHistoryShortcut = "undo" | "redo" | null;

export function hanaHistoryShortcut(input: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): HanaHistoryShortcut {
  if (input.altKey || (!input.metaKey && !input.ctrlKey)) return null;
  const key = input.key.toLowerCase();
  if (key === "z") return input.shiftKey ? "redo" : "undo";
  if (key === "y" && !input.shiftKey) return "redo";
  return null;
}

/**
 * Deselect-all shortcuts: bare Esc, or Cmd/Ctrl+. (iPad/Mac/Windows).
 * Plain "." alone never deselects. Text editing targets are excluded by the
 * caller via shouldIgnoreHanaDeleteForTarget.
 */
export function hanaDeselectShortcut(input: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  if (input.key === "Escape" && !input.metaKey && !input.ctrlKey) return true;
  if (input.key === "." && (input.metaKey || input.ctrlKey)) return true;
  return false;
}

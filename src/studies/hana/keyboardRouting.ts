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

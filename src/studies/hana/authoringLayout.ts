export const HANA_LEFT_PANE_DEFAULT_RATIO = 0.6;
export const HANA_LEFT_PANE_MIN_RATIO = 0.2;
export const HANA_LEFT_PANE_MAX_RATIO = 0.8;

export function clampLeftPaneRatio(
  value: number,
  fallback = HANA_LEFT_PANE_DEFAULT_RATIO,
): number {
  const safeFallback = Number.isFinite(fallback)
    ? Math.max(HANA_LEFT_PANE_MIN_RATIO, Math.min(HANA_LEFT_PANE_MAX_RATIO, fallback))
    : HANA_LEFT_PANE_DEFAULT_RATIO;
  if (!Number.isFinite(value)) return safeFallback;
  return Math.max(HANA_LEFT_PANE_MIN_RATIO, Math.min(HANA_LEFT_PANE_MAX_RATIO, value));
}

export function parseLeftPaneRatio(
  value: string | null,
  fallback = HANA_LEFT_PANE_DEFAULT_RATIO,
): number {
  return clampLeftPaneRatio(value === null ? Number.NaN : Number(value), fallback);
}

export interface HanaDocumentCommand {
  id: string;
  label: string;
  className?: string;
  disabled?: boolean;
}

/** Canonical Top Pane document commands. Order is fixed: New Save Load Export Undo Redo Clear. */
export const HANA_DOCUMENT_COMMANDS: readonly HanaDocumentCommand[] = [
  { id: "new-document", label: "New" },
  { id: "save-document", label: "Save", className: "hana-primary" },
  { id: "load-document", label: "Load" },
  { id: "export-document", label: "Export" },
  { id: "undo-document", label: "Undo", disabled: true },
  { id: "redo-document", label: "Redo", disabled: true },
  { id: "clear-document", label: "Clear" },
];

export function renderHanaDocumentCommandBar(): string {
  const buttons = HANA_DOCUMENT_COMMANDS.map((command) => {
    const classAttribute = command.className ? ` class="${command.className}"` : "";
    const disabledAttribute = command.disabled ? " disabled" : "";
    return `<button id="${command.id}" type="button"${classAttribute}${disabledAttribute}>${command.label}</button>`;
  });
  return `<nav class="hana-document-command-bar" aria-label="Document commands">${buttons.join("")}</nav>`;
}

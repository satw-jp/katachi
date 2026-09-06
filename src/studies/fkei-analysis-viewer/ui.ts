import type { ViewerRepresentation } from "./renderer.ts";

export interface ViewerUi {
  viewport: HTMLElement;
  openButton: HTMLButtonElement;
  openInput: HTMLInputElement;
  sampleButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  viewButtons: Map<ViewerRepresentation, HTMLButtonElement>;
  filename: HTMLElement;
  schema: HTMLElement;
  identity: HTMLElement;
  status: HTMLElement;
  summaryTitle: HTMLElement;
  summary: HTMLElement;
}

function factRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "fact-row";
  const key = document.createElement("span");
  key.className = "fact-key";
  key.textContent = label;
  const text = document.createElement("span");
  text.className = "fact-value";
  text.textContent = value;
  row.append(key, text);
  return row;
}

export function createViewerUi(root: HTMLElement, version: string, updatedAt: string): ViewerUi {
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "viewer-shell";
  shell.innerHTML = `
    <header class="viewer-header">
      <div>
        <p class="eyebrow">GEOMETRY FOUNDATIONS / RESEARCH INSTRUMENT</p>
        <h1>FKEI ANALYSIS VIEWER <span>v0</span></h1>
        <p class="subtitle">Same artifact · same camera · different representation</p>
      </div>
      <div class="read-only-badge">READ ONLY</div>
    </header>
    <section class="viewer-toolbar" aria-label="Viewer controls">
      <div class="toolbar-actions">
        <button class="primary-action" type="button" data-action="open">Open FKEI</button>
        <button class="secondary-action" type="button" data-action="sample">C0 Sample</button>
        <input type="file" accept=".fkei,application/json" hidden />
      </div>
      <div class="meta-grid">
        <div><span>artifact</span><strong data-meta="filename">No artifact loaded</strong></div>
        <div><span>schema</span><strong data-meta="schema">—</strong></div>
        <div><span>identity</span><strong data-meta="identity">—</strong></div>
      </div>
    </section>
    <nav class="representation-tabs" aria-label="Representation">
      <button type="button" data-view="Geometry">Geometry</button>
      <button type="button" data-view="Graph">Graph</button>
      <button type="button" data-view="Surface">Surface</button>
      <button type="button" data-view="Void">Void</button>
      <button class="reset-action" type="button" data-action="reset">Reset View</button>
    </nav>
    <section class="viewport-frame">
      <div class="viewport" data-viewport></div>
      <div class="viewport-hint">Orbit: drag · Zoom: wheel · Pan: right drag</div>
    </section>
    <section class="summary-panel" aria-live="polite">
      <div class="summary-heading">
        <div>
          <p class="eyebrow">REPRESENTATION SUMMARY</p>
          <h2 data-summary-title>Waiting for an artifact</h2>
        </div>
        <div class="study-meta">version ${version} · updated ${updatedAt}</div>
      </div>
      <div data-summary></div>
      <p class="status-line" data-status>Open a canonical SKIN REBUILD FKEI to begin.</p>
    </section>
  </main>`;
  root.append(shell);

  const viewButtons = new Map<ViewerRepresentation, HTMLButtonElement>();
  for (const button of shell.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    const view = button.dataset.view as ViewerRepresentation;
    viewButtons.set(view, button);
    button.disabled = true;
  }
  const openButton = shell.querySelector<HTMLButtonElement>("[data-action=open]")!;
  const sampleButton = shell.querySelector<HTMLButtonElement>("[data-action=sample]")!;
  const resetButton = shell.querySelector<HTMLButtonElement>("[data-action=reset]")!;
  const openInput = shell.querySelector<HTMLInputElement>("input[type=file]")!;
  return {
    viewport: shell.querySelector<HTMLElement>("[data-viewport]")!,
    openButton,
    openInput,
    sampleButton,
    resetButton,
    viewButtons,
    filename: shell.querySelector<HTMLElement>("[data-meta=filename]")!,
    schema: shell.querySelector<HTMLElement>("[data-meta=schema]")!,
    identity: shell.querySelector<HTMLElement>("[data-meta=identity]")!,
    status: shell.querySelector<HTMLElement>("[data-status]")!,
    summaryTitle: shell.querySelector<HTMLElement>("[data-summary-title]")!,
    summary: shell.querySelector<HTMLElement>("[data-summary]")!,
  };
}

export function setMetadata(ui: ViewerUi, filename: string, schema: string, sourceSha256: string): void {
  ui.filename.textContent = filename;
  ui.schema.textContent = schema;
  ui.identity.textContent = `Source SHA-256 ${sourceSha256.slice(0, 16)}…`;
}

export function setRepresentationEnabled(ui: ViewerUi, enabled: boolean): void {
  for (const button of ui.viewButtons.values()) button.disabled = !enabled;
}

export function setActiveRepresentation(ui: ViewerUi, representation: ViewerRepresentation): void {
  for (const [view, button] of ui.viewButtons) {
    button.classList.toggle("is-active", view === representation);
    button.setAttribute("aria-pressed", String(view === representation));
  }
}

export function setSummary(ui: ViewerUi, title: string, facts: Array<[string, string]>, note?: string): void {
  ui.summaryTitle.textContent = title;
  ui.summary.replaceChildren(...facts.map(([label, value]) => factRow(label, value)));
  if (note) {
    const noteElement = document.createElement("p");
    noteElement.className = "summary-note";
    noteElement.textContent = note;
    ui.summary.append(noteElement);
  }
}

export function setStatus(ui: ViewerUi, text: string, kind: "normal" | "ok" | "error" = "normal"): void {
  ui.status.textContent = text;
  ui.status.dataset.kind = kind;
}

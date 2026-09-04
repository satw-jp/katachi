import "./style.css";
import { ARCHIVE_ITEMS, archiveItem } from "./registry.ts";
import { filterArchiveItems, EMPTY_FILTERS, type ArchiveFilters } from "./filters.ts";
import { relatedArchiveItems } from "./similarity.ts";
import { parseArchiveUrl, serializeArchiveUrl, type ArchiveUrlState } from "./urlState.ts";
import { renderArchive } from "./archiveIndex.ts";

const archiveRoot = document.querySelector<HTMLElement>("#skin-art-index");
if (!archiveRoot) throw new Error("SKIN ART archive root was not found");
const root: HTMLElement = archiveRoot;

let state: ArchiveUrlState = parseArchiveUrl(window.location.search);

function render(): void {
  const selected = archiveItem(state.item);
  const filteredItems = filterArchiveItems(ARCHIVE_ITEMS, state);
  const related = selected ? relatedArchiveItems(selected, ARCHIVE_ITEMS) : [];
  renderArchive({ root, allItems: ARCHIVE_ITEMS, filteredItems, selected, related, state });
  bind();
}

function update(next: Partial<ArchiveUrlState>, replace = false): void {
  state = { ...state, ...next };
  const url = serializeArchiveUrl(window.location.href, state);
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  render();
}

function bind(): void {
  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => update({ view: button.dataset.view as ArchiveUrlState["view"] }));
  });

  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-filter]").forEach((control) => {
    const key = control.dataset.filter as keyof ArchiveFilters;
    control.addEventListener(control instanceof HTMLInputElement ? "input" : "change", () => {
      update({ [key]: control.value } as Partial<ArchiveUrlState>, control instanceof HTMLInputElement);
    });
  });

  root.querySelectorAll<HTMLElement>("[data-select-item]").forEach((target) => {
    target.addEventListener("click", () => update({ item: target.dataset.selectItem ?? "" }));
  });

  root.querySelector<HTMLButtonElement>('[data-action="clear-filters"]')?.addEventListener("click", () => {
    update({ ...EMPTY_FILTERS, item: "" });
  });
  root.querySelector<HTMLButtonElement>('[data-action="open-filters"]')?.addEventListener("click", () => {
    root.querySelector<HTMLElement>("[data-filter-drawer]")?.setAttribute("data-filter-drawer", "true");
  });
  root.querySelector<HTMLButtonElement>('[data-action="close-filters"]')?.addEventListener("click", () => {
    root.querySelector<HTMLElement>("[data-filter-drawer]")?.setAttribute("data-filter-drawer", "false");
  });
}

window.addEventListener("popstate", () => {
  state = parseArchiveUrl(window.location.search);
  render();
});

document.title = "SKIN ART ARCHIVE — Katachi";
render();

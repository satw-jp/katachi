import { ARCHIVE_GENRE_IDS, ARCHIVE_GENRE_LABELS, ARCHIVE_GENERATIONS, type ArchiveGeneration, type ArchiveVersionStatus, type SkinArtArchiveItem, type SkinArtGenre } from "./types.ts";
import { relatedArchiveItems, similarityLabel } from "./similarity.ts";
import type { ArchiveView } from "./urlState.ts";

const generationLabels: Record<ArchiveGeneration, string> = {
  works: "WORKS",
  studies: "STUDIES",
  v1: "CONCEPT V1",
  v2: "CONCEPT V2",
  v3: "CONCEPT V3",
  v4: "CONCEPT V4",
};

const statusLabels: Record<ArchiveVersionStatus, string> = {
  current: "CURRENT",
  baseline: "BASELINE",
  archive: "ARCHIVE",
  reference: "REFERENCE",
};

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
const tokenMarkup = (values: readonly string[]) => values.map((value) => `<span class="archive-token">${escapeHtml(value)}</span>`).join("");
const itemNumber = (items: readonly SkinArtArchiveItem[], item: SkinArtArchiveItem) => String(items.indexOf(item) + 1).padStart(3, "0");
const itemButton = (item: SkinArtArchiveItem, number: string, compact = false) => `<button class="archive-item-row${compact ? " archive-item-row--compact" : ""}" type="button" data-select-item="${escapeHtml(item.id)}" aria-label="Open details for ${escapeHtml(item.title)}"><span class="archive-item-number">${number}</span><span class="archive-item-main"><span class="archive-item-title">${escapeHtml(item.title)}</span><span class="archive-item-description">${escapeHtml(item.description)}</span></span><span class="archive-item-kind">${escapeHtml(generationLabels[item.generation])}</span></button>`;
const composerPresetForArchiveId: Readonly<Record<string, string>> = {
  "study-field": "study-field",
  "study-dust": "study-dust",
  "study-gaussian": "study-gaussian",
  "v4-visible-mending": "v4-visible-mending",
  "v4-shadow-room": "v4-shadow-room",
};
const composerStartUrl = (item: SkinArtArchiveItem): string => {
  const preset = composerPresetForArchiveId[item.id];
  return `/skin-art/composer/${preset ? `?preset=${encodeURIComponent(preset)}` : ""}`;
};

function groupMarkup(items: readonly SkinArtArchiveItem[], mode: ArchiveView, allItems: readonly SkinArtArchiveItem[]): string {
  if (mode === "genre") {
    return ARCHIVE_GENRE_IDS.map((genre) => {
      const group = items.filter((item) => item.primaryGenre === genre);
      return group.length ? `<section class="archive-group"><h3>${escapeHtml(ARCHIVE_GENRE_LABELS[genre])}<span>${group.length.toString().padStart(2, "0")}</span></h3>${group.map((item) => itemButton(item, itemNumber(allItems, item))).join("")}</section>` : "";
    }).join("");
  }
  if (mode === "generation") {
    return ARCHIVE_GENERATIONS.map((generation) => {
      const group = items.filter((item) => item.generation === generation);
      return group.length ? `<section class="archive-group"><h3>${generationLabels[generation]}<span>${group.length.toString().padStart(2, "0")}</span></h3>${group.map((item) => itemButton(item, itemNumber(allItems, item))).join("")}</section>` : "";
    }).join("");
  }
  return items.map((item) => itemButton(item, itemNumber(allItems, item))).join("");
}

function detailMarkup(selected: SkinArtArchiveItem | undefined, allItems: readonly SkinArtArchiveItem[], related: ReturnType<typeof relatedArchiveItems>): string {
  if (!selected) {
    return `<aside class="archive-detail archive-detail--empty"><span class="archive-detail-kicker">ARCHIVE / RESEARCH INDEX</span><p>Select an exploration to inspect its source, visual grammar, temporal behavior, spatial mode, versions, and lineage.</p><span class="archive-detail-hint">40 REGISTERED EXPLORATIONS</span></aside>`;
  }
  const versionRows = selected.versions.map((version) => `<a class="archive-version" href="${escapeHtml(version.url)}"><span>${escapeHtml(version.label)}</span><span>${statusLabels[version.status]}</span></a>`).join("");
  const relatedRows = related.length ? related.map(({ item, score }) => `<button class="archive-related-row" type="button" data-select-item="${escapeHtml(item.id)}"><span>${escapeHtml(item.title)}</span><span>${similarityLabel(score)} · ${Math.round(score * 100)}%</span></button>`).join("") : `<p class="archive-muted">No related explorations registered.</p>`;
  const lineageRoots = [...(selected.derivedFrom ?? []), ...(selected.influencedBy ?? [])].map((id) => allItems.find((item) => item.id === id)).filter((item): item is SkinArtArchiveItem => Boolean(item));
  const lineageMarkup = lineageRoots.length ? lineageRoots.map((item) => `<button class="archive-lineage-row" type="button" data-select-item="${escapeHtml(item.id)}"><span>${escapeHtml(item.title)}</span><span>${generationLabels[item.generation]}</span></button>`).join("") : `<p class="archive-muted">Source relation not recorded.</p>`;
  const firstOpen = selected.versions.find((version) => version.status === "current") ?? selected.versions[0];
  return `<aside class="archive-detail"><div class="archive-detail-top"><span class="archive-detail-kicker">${escapeHtml(itemNumber(allItems, selected))} / ${escapeHtml(generationLabels[selected.generation])}</span><span class="archive-detail-kind">${escapeHtml(selected.kind.replace(/-/g, " ").toUpperCase())}</span></div><h2>${escapeHtml(selected.title)}</h2><p class="archive-detail-description">${escapeHtml(selected.description)}</p><dl class="archive-meta"><div><dt>PRIMARY GENRE</dt><dd>${escapeHtml(ARCHIVE_GENRE_LABELS[selected.primaryGenre])}</dd></div><div><dt>FAMILY</dt><dd>${escapeHtml(selected.family ?? "—")}</dd></div><div><dt>TAGS</dt><dd class="archive-token-list">${tokenMarkup(selected.tags)}</dd></div></dl><div class="archive-axis-block"><h3>SOURCE LOGIC</h3><div class="archive-token-list">${tokenMarkup(selected.sourceLogic)}</div></div><div class="archive-axis-block"><h3>VISUAL PRIMITIVES</h3><div class="archive-token-list">${tokenMarkup(selected.primitives)}</div></div><div class="archive-axis-block"><h3>TIME / SPACE</h3><div class="archive-token-list">${tokenMarkup(selected.temporalModes)}${tokenMarkup(selected.spatialModes)}</div></div><div class="archive-detail-section"><h3>VERSIONS</h3><div>${versionRows}</div></div><div class="archive-detail-section"><h3>RELATED / JACCARD</h3><div>${relatedRows}</div></div><div class="archive-detail-section"><h3>LINEAGE</h3><div>${lineageMarkup}</div></div><a class="archive-open-link" href="${escapeHtml(firstOpen.url)}">OPEN EXPLORATION <span>↗</span></a><a class="archive-open-link archive-composer-link" href="${escapeHtml(composerStartUrl(selected))}">LOAD AS COMPOSER START <span>↗</span></a></aside>`;
}

function optionMarkup(values: readonly string[], selected: string, label: (value: string) => string = (value) => value): string {
  return [`<option value="">ALL</option>`, ...values.map((value) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(label(value))}</option>`)].join("");
}

export interface ArchiveRenderInput {
  readonly root: HTMLElement;
  readonly allItems: readonly SkinArtArchiveItem[];
  readonly filteredItems: readonly SkinArtArchiveItem[];
  readonly selected: SkinArtArchiveItem | undefined;
  readonly related: ReturnType<typeof relatedArchiveItems>;
  readonly state: { readonly view: ArchiveView; readonly query: string; readonly generation: string; readonly genre: string; readonly source: string; readonly primitive: string; readonly time: string; readonly space: string };
}

export function renderArchive({ root, allItems, filteredItems, selected, related, state }: ArchiveRenderInput): void {
  const displayItems = state.view === "similarity" && selected ? related.map((entry) => entry.item) : filteredItems;
  const similarityHint = state.view === "similarity" && !selected ? `<p class="archive-empty-note">SELECT AN EXPLORATION TO SEE ITS FIVE CLOSEST NEIGHBORS.</p>` : "";
  root.innerHTML = `<div class="archive-shell"><header class="archive-header"><div class="archive-heading"><a class="archive-brand" href="/skin-art/">SKIN ART ARCHIVE</a><span>FUNCTIONAL RESEARCH INDEX</span></div><div class="archive-header-meta"><span>${displayItems.length.toString().padStart(2, "0")} / ${allItems.length.toString().padStart(2, "0")} EXPLORATIONS</span><a href="/skin-art/composer/">LIVE COMPOSER ↗</a><a href="/skin-art/index-legacy/">LEGACY INDEX</a></div></header><nav class="archive-modes" aria-label="Archive views"><span class="archive-modes-label">VIEW</span>${([ ["all", "ALL"], ["genre", "BY GENRE"], ["generation", "BY GENERATION"], ["similarity", "SIMILARITY"] ] as const).map(([value, label]) => `<button type="button" data-view="${value}" class="${state.view === value ? "is-active" : ""}">${label}</button>`).join("")}</nav><div class="archive-workspace"><aside class="archive-filters" data-filter-drawer="false"><div class="archive-filter-head"><span>FILTERS</span><button type="button" data-action="close-filters">CLOSE</button></div><label>SEARCH<input type="search" data-filter="query" value="${escapeHtml(state.query)}" placeholder="title, tag, axis" autocomplete="off"></label><label>GENERATION<select data-filter="generation">${optionMarkup(ARCHIVE_GENERATIONS, state.generation, (value) => generationLabels[value as ArchiveGeneration])}</select></label><label>PRIMARY GENRE<select data-filter="genre">${optionMarkup(ARCHIVE_GENRE_IDS, state.genre, (value) => ARCHIVE_GENRE_LABELS[value as SkinArtGenre])}</select></label><label>SOURCE LOGIC<select data-filter="source" >${optionMarkup(["GRAPH", "MOTIF", "LOCAL METRIC", "FIELD", "LIGHT", "GESTURE PROXY", "MATERIAL PROXY", "SHADOW OCCLUDER"], state.source)}</select></label><label>PRIMITIVE<select data-filter="primitive">${optionMarkup(["LINE", "HAIRLINE", "POINT", "PARTICLE", "GAUSSIAN", "RIBBON", "VOLUME", "FOG", "SHADOW", "MESH", "MIXED"], state.primitive)}</select></label><label>TIME<select data-filter="time">${optionMarkup(["TRAVERSAL", "SEQUENCE", "GROWTH", "PROPAGATION", "CONTINUOUS", "EVENT", "PHYSICS", "OSCILLATION", "ACCUMULATION"], state.time)}</select></label><label>SPACE<select data-filter="space">${optionMarkup(["OBJECT", "FIELD", "ROOM", "VOID", "INTERIOR", "MULTISCALE", "CAMERA JOURNEY", "SCREEN-FILLING"], state.space)}</select></label><button class="archive-reset" type="button" data-action="clear-filters">RESET FILTERS</button></aside><main class="archive-results"><div class="archive-results-head"><button type="button" data-action="open-filters">FILTERS</button><span>RESULTS</span><span>${displayItems.length} MATCHES</span></div>${similarityHint}<div class="archive-results-layout"><section class="archive-list" aria-label="Explorations">${displayItems.length ? groupMarkup(displayItems, state.view, allItems) : `<p class="archive-empty-note">NO EXPLORATIONS MATCH THIS QUERY.</p>`}</section>${detailMarkup(selected, allItems, related)}</div></main></div></div>`;
}

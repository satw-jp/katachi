import "./style.css";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "../rebuild/fkei.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";
import {
  adjacentConceptMovie,
  conceptMovieChoice,
  CONCEPT_MOVIES,
  resolveConceptMovieId,
  resolveConceptPalette,
  type ConceptMovieId,
  type ConceptPalette,
} from "./catalog.ts";
import { ConceptMovieRenderer } from "./renderer.ts";

const rootElement = document.getElementById("skin-concept-movies");
if (!rootElement) throw new Error("Concept Movies root is missing");
const root = rootElement;
root.className = "concept-movies";
root.innerHTML = `
  <div class="concept-movies-loading" role="status">READING COMPLETED SKIN</div>
  <div class="concept-movies-stage"></div>
  <header class="concept-movies-header">
    <a class="concept-movies-brand" href="../" aria-label="Back to SKIN ART index">
      <span>KATACHI</span><strong>SKIN ART</strong>
    </a>
    <div class="concept-movies-route-links">
      <a href="../studies/">VISUAL STUDIES ↗</a>
      <span>CONCEPT MOVIES</span>
    </div>
  </header>
  <section class="concept-movies-caption" aria-live="polite">
    <span class="concept-movies-kicker">CONCEPT 01 / 05</span>
    <h1>BLOOM SATURATION</h1>
    <p>Colour leaves the bouquet and fills the room.</p>
    <small class="concept-movies-stage-label">SOURCE / READY</small>
  </section>
  <nav class="concept-movies-movie-nav" aria-label="Concept movies">
    <div class="concept-movies-nav-heading"><span>CONCEPT MOVIES</span><small>05 PROPOSALS</small></div>
    <div class="concept-movies-links"></div>
  </nav>
  <details class="concept-movies-mobile-nav">
    <summary>CONCEPTS</summary>
    <div class="concept-movies-mobile-links"></div>
  </details>
  <div class="concept-movies-palette" hidden>
    <span>PALETTE</span>
    <a href="?movie=breathing-bouquet&amp;palette=rich">RICH</a>
    <a href="?movie=breathing-bouquet&amp;palette=red">RED</a>
    <a href="?movie=breathing-bouquet&amp;palette=blue">BLUE</a>
  </div>
  <div class="concept-movies-source-facts" aria-live="polite">
    <span class="concept-movies-source-status">SOURCE / LOADING</span>
    <span class="concept-movies-source-counts"></span>
  </div>
  <div class="concept-movies-controls">
    <button type="button" class="concept-movies-previous">PREVIOUS</button>
    <button type="button" class="concept-movies-next">NEXT</button>
    <button type="button" class="concept-movies-replay">REPLAY</button>
    <a href="../" class="concept-movies-back">BACK</a>
  </div>
`;

const stage = root.querySelector<HTMLElement>(".concept-movies-stage")!;
const loading = root.querySelector<HTMLElement>(".concept-movies-loading")!;
const captionKicker = root.querySelector<HTMLElement>(".concept-movies-kicker")!;
const captionTitle = root.querySelector<HTMLElement>(".concept-movies-caption h1")!;
const captionDescription = root.querySelector<HTMLElement>(".concept-movies-caption p")!;
const stageLabel = root.querySelector<HTMLElement>(".concept-movies-stage-label")!;
const sourceStatus = root.querySelector<HTMLElement>(".concept-movies-source-status")!;
const sourceCounts = root.querySelector<HTMLElement>(".concept-movies-source-counts")!;
const desktopLinks = root.querySelector<HTMLElement>(".concept-movies-links")!;
const mobileLinks = root.querySelector<HTMLElement>(".concept-movies-mobile-links")!;
const previous = root.querySelector<HTMLButtonElement>(".concept-movies-previous")!;
const next = root.querySelector<HTMLButtonElement>(".concept-movies-next")!;
const replay = root.querySelector<HTMLButtonElement>(".concept-movies-replay")!;
const palette = root.querySelector<HTMLElement>(".concept-movies-palette")!;

let renderer: ConceptMovieRenderer | null = null;
let activeMovie: ConceptMovieId = resolveConceptMovieId(new URLSearchParams(window.location.search).get("movie"));
let activePalette: ConceptPalette = resolveConceptPalette(new URLSearchParams(window.location.search).get("palette"));

function updateUrl(replace = false): void {
  const url = new URL(window.location.href);
  url.searchParams.set("movie", activeMovie);
  if (activeMovie === "breathing-bouquet" && activePalette !== "rich") url.searchParams.set("palette", activePalette);
  else url.searchParams.delete("palette");
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function setCaption(): void {
  const choice = conceptMovieChoice(activeMovie);
  captionKicker.textContent = `CONCEPT ${choice.number} / 05`;
  captionTitle.textContent = choice.title;
  captionDescription.textContent = choice.description;
  root.dataset.activeMovie = activeMovie;
  palette.hidden = activeMovie !== "breathing-bouquet";
  for (const link of root.querySelectorAll<HTMLElement>("[data-movie-id]")) {
    const active = link.dataset.movieId === activeMovie;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function addMovieLink(parent: HTMLElement, movie: typeof CONCEPT_MOVIES[number]): void {
  const link = document.createElement("a");
  link.href = `?movie=${encodeURIComponent(movie.id)}`;
  link.dataset.movieId = movie.id;
  link.innerHTML = `<span>${movie.number}</span><strong>${movie.title}</strong>`;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activeMovie = movie.id;
    activePalette = resolveConceptPalette(new URLSearchParams(window.location.search).get("palette"));
    updateUrl();
    setCaption();
    renderer?.setMovie(activeMovie, activePalette);
    const navigation = root.querySelector<HTMLDetailsElement>(".concept-movies-mobile-nav");
    if (navigation) navigation.open = false;
  });
  parent.appendChild(link);
}

for (const movie of CONCEPT_MOVIES) {
  addMovieLink(desktopLinks, movie);
  addMovieLink(mobileLinks, movie);
}
setCaption();
updateUrl(true);

const selectAdjacent = (direction: -1 | 1): void => {
  activeMovie = adjacentConceptMovie(activeMovie, direction);
  activePalette = activeMovie === "breathing-bouquet" ? activePalette : "rich";
  updateUrl();
  setCaption();
  renderer?.setMovie(activeMovie, activePalette);
};
previous.addEventListener("click", () => selectAdjacent(-1));
next.addEventListener("click", () => selectAdjacent(1));
replay.addEventListener("click", () => renderer?.replay());
window.addEventListener("popstate", () => {
  activeMovie = resolveConceptMovieId(new URLSearchParams(window.location.search).get("movie"));
  activePalette = resolveConceptPalette(new URLSearchParams(window.location.search).get("palette"));
  updateUrl(true);
  setCaption();
  renderer?.setMovie(activeMovie, activePalette);
});

async function loadSource(): Promise<VisualStudySource> {
  const sampleUrl = new URL("../../samples/skin-rebuild-first-print.fkei", window.location.href);
  const response = await fetch(sampleUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Completed SKIN source returned HTTP ${response.status}`);
  const document = parseSkinRebuildFkei(await response.text());
  const project = projectFromSkinRebuildFkei(document);
  return { graph: project.finalGraph, base: project.base, patterns: project.patterns, project };
}

void loadSource().then((source) => {
  sourceStatus.textContent = "SOURCE / COMPLETED GRAPH";
  sourceCounts.textContent = `${source.graph.nodes.length} NODES / ${source.graph.edges.length} EDGES / ${source.patterns.length} MOTIFS`;
  renderer = new ConceptMovieRenderer(stage, source, (frame) => {
    stageLabel.textContent = frame.stable ? "MOVIE HOLDS" : frame.stage;
    root.style.setProperty("--concept-movie-progress", String(frame.progress));
  });
  renderer.setMovie(activeMovie, activePalette);
  loading.hidden = true;
}).catch((error: unknown) => {
  loading.textContent = `SOURCE UNAVAILABLE / ${error instanceof Error ? error.message : String(error)}`;
  loading.dataset.error = "true";
  sourceStatus.textContent = "SOURCE / UNAVAILABLE";
});

import "./style.css";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "../rebuild/fkei.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";
import {
  adjacentConceptMovieV2,
  conceptMovieV2Choice,
  resolveConceptMovieV2Id,
  resolveConceptMovieV2Palette,
  type ConceptMovieV2Id,
  type ConceptMovieV2Palette,
} from "./catalog.ts";
import { ConceptMovieV2Renderer } from "./renderer.ts";

const rootElement = document.getElementById("skin-concept-movies-v2");
if (!rootElement) throw new Error("Concept Movies V2 root is missing");
const root = rootElement;
root.className = "concept-movies-v2";
root.innerHTML = `
  <div class="concept-movies-v2-loading" role="status">READING COMPLETED SKIN</div>
  <div class="concept-movies-v2-stage"></div>
  <header class="concept-movies-v2-header">
    <a class="concept-movies-v2-brand" href="../" aria-label="Back to SKIN ART index">
      <span>KATACHI</span><strong>SKIN ART</strong>
    </a>
    <span class="concept-movies-v2-route">CONCEPT MOVIES / V2</span>
  </header>
  <section class="concept-movies-v2-caption" aria-live="polite">
    <span class="concept-movies-v2-kicker">CONCEPT 01 / 05</span>
    <h1>LUMINOUS CLOUD</h1>
    <p>A bouquet enters the room as point, cloud, and light.</p>
    <small class="concept-movies-v2-stage-label">BLACK / QUIET</small>
  </section>
  <div class="concept-movies-v2-source" aria-live="polite">
    <span class="concept-movies-v2-source-status">SOURCE / LOADING</span>
    <span class="concept-movies-v2-source-counts"></span>
  </div>
  <nav class="concept-movies-v2-controls" aria-label="Concept movie controls">
    <button type="button" class="concept-movies-v2-previous">PREVIOUS</button>
    <button type="button" class="concept-movies-v2-next">NEXT</button>
    <button type="button" class="concept-movies-v2-replay">REPLAY</button>
    <a href="../" class="concept-movies-v2-back">BACK</a>
  </nav>
  <div class="concept-movies-v2-index-hint">01—05 / NEXT TO MOVE</div>
`;

const stage = root.querySelector<HTMLElement>(".concept-movies-v2-stage")!;
const loading = root.querySelector<HTMLElement>(".concept-movies-v2-loading")!;
const captionKicker = root.querySelector<HTMLElement>(".concept-movies-v2-kicker")!;
const captionTitle = root.querySelector<HTMLElement>(".concept-movies-v2-caption h1")!;
const captionDescription = root.querySelector<HTMLElement>(".concept-movies-v2-caption p")!;
const stageLabel = root.querySelector<HTMLElement>(".concept-movies-v2-stage-label")!;
const sourceStatus = root.querySelector<HTMLElement>(".concept-movies-v2-source-status")!;
const sourceCounts = root.querySelector<HTMLElement>(".concept-movies-v2-source-counts")!;
const previous = root.querySelector<HTMLButtonElement>(".concept-movies-v2-previous")!;
const next = root.querySelector<HTMLButtonElement>(".concept-movies-v2-next")!;
const replay = root.querySelector<HTMLButtonElement>(".concept-movies-v2-replay")!;

let renderer: ConceptMovieV2Renderer | null = null;
let activeMovie: ConceptMovieV2Id = resolveConceptMovieV2Id(new URLSearchParams(window.location.search).get("movie"));
let activePalette: ConceptMovieV2Palette = resolveConceptMovieV2Palette(new URLSearchParams(window.location.search).get("palette"));

function updateUrl(replace = false): void {
  const url = new URL(window.location.href);
  url.searchParams.set("movie", activeMovie);
  if (activePalette !== "rich") url.searchParams.set("palette", activePalette);
  else url.searchParams.delete("palette");
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function setCaption(): void {
  const choice = conceptMovieV2Choice(activeMovie);
  captionKicker.textContent = `CONCEPT ${choice.number} / 05`;
  captionTitle.textContent = choice.title;
  captionDescription.textContent = choice.description;
  root.dataset.activeMovie = activeMovie;
  root.dataset.intro = "on";
}

setCaption();
updateUrl(true);

const selectAdjacent = (direction: -1 | 1): void => {
  activeMovie = adjacentConceptMovieV2(activeMovie, direction);
  updateUrl();
  setCaption();
  renderer?.setMovie(activeMovie, activePalette);
};

previous.addEventListener("click", () => selectAdjacent(-1));
next.addEventListener("click", () => selectAdjacent(1));
replay.addEventListener("click", () => renderer?.replay());
window.addEventListener("popstate", () => {
  activeMovie = resolveConceptMovieV2Id(new URLSearchParams(window.location.search).get("movie"));
  activePalette = resolveConceptMovieV2Palette(new URLSearchParams(window.location.search).get("palette"));
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
  renderer = new ConceptMovieV2Renderer(stage, source, (frame) => {
    stageLabel.textContent = frame.stable ? "THE AIR HOLDS" : frame.stage;
    root.style.setProperty("--concept-movie-v2-progress", String(frame.progress));
    root.dataset.intro = frame.progress < 0.16 ? "on" : "off";
  });
  renderer.setMovie(activeMovie, activePalette);
  loading.hidden = true;
}).catch((error: unknown) => {
  loading.textContent = `SOURCE UNAVAILABLE / ${error instanceof Error ? error.message : String(error)}`;
  loading.dataset.error = "true";
  sourceStatus.textContent = "SOURCE / UNAVAILABLE";
});

import "./style.css";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "../rebuild/fkei.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";
import { CONCEPT_MOVIE_V3, resolveConceptMovieV3Palette } from "./catalog.ts";
import { resolveReplaySeed } from "./replaySeed.ts";
import { ConceptMovieV3Renderer } from "./renderer.ts";
import { projectV3Source } from "./source.ts";

const rootElement = document.getElementById("skin-concept-movies-v3");
if (!rootElement) throw new Error("Concept Movies V3 root is missing");
const root = rootElement;
root.className = "concept-movies-v3";
root.innerHTML = `
  <div class="concept-movies-v3-loading" role="status">READING COMPLETED SKIN</div>
  <div class="concept-movies-v3-stage"></div>
  <header class="concept-movies-v3-header">
    <a class="concept-movies-v3-brand" href="../" aria-label="Back to SKIN ART index">V3 / BOUQUET WEATHER</a>
  </header>
  <nav class="concept-movies-v3-controls" aria-label="Concept movie controls">
    <button type="button" class="concept-movies-v3-replay">REPLAY</button>
    <a href="../" class="concept-movies-v3-back">BACK</a>
  </nav>
  <div class="concept-movies-v3-source" aria-live="polite">
    <span class="concept-movies-v3-stage-label">SOURCE / LOADING</span>
    <span class="concept-movies-v3-source-counts"></span>
  </div>
`;

const stage = root.querySelector<HTMLElement>(".concept-movies-v3-stage")!;
const loading = root.querySelector<HTMLElement>(".concept-movies-v3-loading")!;
const stageLabel = root.querySelector<HTMLElement>(".concept-movies-v3-stage-label")!;
const sourceCounts = root.querySelector<HTMLElement>(".concept-movies-v3-source-counts")!;
const replay = root.querySelector<HTMLButtonElement>(".concept-movies-v3-replay")!;
const params = new URLSearchParams(window.location.search);
const palette = resolveConceptMovieV3Palette(params.get("palette"));
const seedResolution = resolveReplaySeed(params.get("seed"));
let activeSeed = seedResolution.seed;
let renderer: ConceptMovieV3Renderer | null = null;
let idleTimer = 0;

root.dataset.palette = palette;
root.dataset.seed = String(activeSeed);

function showUi(): void {
  root.dataset.ui = "visible";
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => { root.dataset.ui = "idle"; }, 2_800);
}

function loadSource(): Promise<VisualStudySource> {
  const sampleUrl = new URL("../../samples/skin-rebuild-first-print.fkei", window.location.href);
  return fetch(sampleUrl, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`Completed SKIN source returned HTTP ${response.status}`);
    const document = parseSkinRebuildFkei(await response.text());
    const project = projectFromSkinRebuildFkei(document);
    return { graph: project.finalGraph, base: project.base, patterns: project.patterns, project };
  });
}

replay.addEventListener("click", () => {
  const nextSeed = seedResolution.fixed ? activeSeed : resolveReplaySeed(null).seed;
  activeSeed = nextSeed;
  root.dataset.seed = String(activeSeed);
  renderer?.replay(activeSeed);
  showUi();
});

for (const eventName of ["pointermove", "pointerdown", "touchstart", "keydown"] as const) {
  window.addEventListener(eventName, showUi, { passive: true });
}
root.dataset.ui = "visible";
showUi();

void loadSource().then((source) => {
  const mapped = projectV3Source(source);
  sourceCounts.textContent = `${source.graph.nodes.length} NODES / ${source.graph.edges.length} EDGES / ${source.patterns.length} MOTIFS`;
  renderer = new ConceptMovieV3Renderer(stage, mapped, palette, activeSeed, (frame) => {
    stageLabel.textContent = frame.stage;
    root.style.setProperty("--concept-movies-v3-progress", String(frame.progress));
  });
  loading.hidden = true;
  stageLabel.textContent = `${CONCEPT_MOVIE_V3.title} / READY`;
}).catch((error: unknown) => {
  loading.textContent = `SOURCE UNAVAILABLE / ${error instanceof Error ? error.message : String(error)}`;
  loading.dataset.error = "true";
  stageLabel.textContent = "SOURCE / UNAVAILABLE";
});

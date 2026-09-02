import "./style.css";
import {
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
} from "../rebuild/fkei.ts";
import {
  resolveVisualStudyId,
  visualStudyChoice,
  VISUAL_STUDIES,
  type VisualStudyId,
  type VisualStudySource,
} from "./catalog.ts";
import { VisualStudyRenderer } from "./renderer.ts";

const rootElement = document.getElementById("skin-visual-studies");
if (!rootElement) throw new Error("Visual Studies root is missing");
const root = rootElement;

root.className = "visual-studies";
root.innerHTML = `
  <div class="visual-studies-loading" role="status">READING COMPLETED SKIN</div>
  <div class="visual-studies-stage"></div>
  <header class="visual-studies-header">
    <a class="visual-studies-brand" href="../" aria-label="Back to SKIN ART index">
      <span>KATACHI</span><strong>SKIN ART</strong>
    </a>
    <span class="visual-studies-heading">VISUAL STUDIES / ONE SOURCE</span>
  </header>
  <section class="visual-studies-caption" aria-live="polite">
    <span class="visual-studies-kicker">VISUAL STUDY 01</span>
    <h1>FIELD</h1>
    <p>Can the graph become a continuous influence field?</p>
    <small class="visual-studies-stage-label">SOURCE / READY</small>
  </section>
  <nav class="visual-studies-navigation" aria-label="Visual studies">
    <div class="visual-studies-navigation-heading"><span>STUDIES</span><small>08 DIRECTIONS</small></div>
    <div class="visual-studies-links"></div>
  </nav>
  <details class="visual-studies-mobile-navigation">
    <summary>STUDIES</summary>
    <div class="visual-studies-mobile-links"></div>
  </details>
  <div class="visual-studies-source-facts" aria-live="polite">
    <span class="visual-studies-source-status">SOURCE / LOADING</span>
    <span class="visual-studies-source-counts"></span>
  </div>
  <div class="visual-studies-controls">
    <button type="button" class="visual-studies-replay">REPLAY</button>
    <a href="../" class="visual-studies-index-link">BACK TO INDEX</a>
  </div>
`;

const stage = root.querySelector<HTMLElement>(".visual-studies-stage")!;
const loading = root.querySelector<HTMLElement>(".visual-studies-loading")!;
const captionKicker = root.querySelector<HTMLElement>(".visual-studies-kicker")!;
const captionTitle = root.querySelector<HTMLElement>("h1")!;
const captionQuestion = root.querySelector<HTMLElement>(".visual-studies-caption p")!;
const stageLabel = root.querySelector<HTMLElement>(".visual-studies-stage-label")!;
const sourceStatus = root.querySelector<HTMLElement>(".visual-studies-source-status")!;
const sourceCounts = root.querySelector<HTMLElement>(".visual-studies-source-counts")!;
const replay = root.querySelector<HTMLButtonElement>(".visual-studies-replay")!;
const desktopLinks = root.querySelector<HTMLElement>(".visual-studies-links")!;
const mobileLinks = root.querySelector<HTMLElement>(".visual-studies-mobile-links")!;

let renderer: VisualStudyRenderer | null = null;
let activeStudy: VisualStudyId = resolveVisualStudyId(new URLSearchParams(window.location.search).get("study"));

function updateUrl(study: VisualStudyId, replace = false): void {
  const url = new URL(window.location.href);
  url.searchParams.set("study", study);
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function setCaption(study: VisualStudyId): void {
  const choice = visualStudyChoice(study);
  captionKicker.textContent = `VISUAL STUDY ${choice.number}`;
  captionTitle.textContent = choice.title;
  captionQuestion.textContent = choice.question;
  root.dataset.activeStudy = study;
  for (const link of root.querySelectorAll<HTMLElement>("[data-study-id]")) {
    const active = link.dataset.studyId === study;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function addStudyLink(parent: HTMLElement, study: typeof VISUAL_STUDIES[number]): void {
  const link = document.createElement("a");
  link.href = `?study=${encodeURIComponent(study.id)}`;
  link.dataset.studyId = study.id;
  link.innerHTML = `<span>${study.number}</span><strong>${study.title}</strong>`;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activeStudy = study.id;
    updateUrl(activeStudy);
    setCaption(activeStudy);
    renderer?.setStudy(activeStudy);
    const mobileNavigation = root.querySelector<HTMLDetailsElement>(".visual-studies-mobile-navigation");
    if (mobileNavigation) mobileNavigation.open = false;
  });
  parent.appendChild(link);
}

for (const study of VISUAL_STUDIES) {
  addStudyLink(desktopLinks, study);
  addStudyLink(mobileLinks, study);
}
setCaption(activeStudy);
updateUrl(activeStudy, true);

replay.addEventListener("click", () => renderer?.replay());
window.addEventListener("popstate", () => {
  activeStudy = resolveVisualStudyId(new URLSearchParams(window.location.search).get("study"));
  setCaption(activeStudy);
  renderer?.setStudy(activeStudy);
});

async function loadSource(): Promise<VisualStudySource> {
  const sampleUrl = new URL("../../samples/skin-rebuild-first-print.fkei", window.location.href);
  const response = await fetch(sampleUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Completed SKIN source returned HTTP ${response.status}`);
  const document = parseSkinRebuildFkei(await response.text());
  const project = projectFromSkinRebuildFkei(document);
  return {
    graph: project.finalGraph,
    base: project.base,
    patterns: project.patterns,
    project,
  };
}

void loadSource().then((source) => {
  sourceStatus.textContent = "SOURCE / COMPLETED GRAPH";
  sourceCounts.textContent = `${source.graph.nodes.length} NODES / ${source.graph.edges.length} EDGES / ${source.patterns.length} MOTIFS`;
  renderer = new VisualStudyRenderer(stage, source, (frame) => {
    stageLabel.textContent = frame.stable ? "STUDY STABLE" : frame.stage;
    root.style.setProperty("--visual-study-progress", String(frame.progress));
  });
  renderer.setStudy(activeStudy);
  loading.hidden = true;
}).catch((error: unknown) => {
  loading.textContent = `SOURCE UNAVAILABLE / ${error instanceof Error ? error.message : String(error)}`;
  loading.dataset.error = "true";
  sourceStatus.textContent = "SOURCE / UNAVAILABLE";
});

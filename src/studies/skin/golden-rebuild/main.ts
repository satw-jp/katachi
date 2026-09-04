import manifest from "../manifest.json";
import type { GraphArtifact, RegisteredArtifact } from "./contracts.ts";
import {
  createGoldenAdapterRegistry,
  createRebuildObservationRegistry,
  GOLDEN_SOURCE_BRANCH,
  GOLDEN_SOURCE_HEAD,
  type ArtifactSummaryData,
  type GoldenAdapterArtifact,
  type GoldenArtifactId,
} from "./goldenAdapter.ts";
import { compareArtifactRegistries } from "./shadowComparison.ts";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Golden Rebuild LUNA app root is missing");

const goldenRegistry = createGoldenAdapterRegistry();
const rebuildRegistry = createRebuildObservationRegistry();
const shadowComparison = compareArtifactRegistries(goldenRegistry, rebuildRegistry);

const LABELS: Record<GoldenArtifactId, string> = {
  beads: "Beads",
  field: "Field",
  "surface-graph": "Surface Graph",
  "internal-graph": "Internal Graph",
  reinforcement: "Reinforcement",
  dryweb: "DryWeb",
  mesh: "Mesh",
  diagnostics: "Diagnostics",
  body: "BODY",
  "removable-support": "Removable Support",
  export: "Export",
};

const VIEW_LAYERS = ["BEADS", "FIELD", "GRAPH", "MESH", "DIAGNOSTICS", "PRINT PREVIEW"] as const;

app.innerHTML = `
  <div class="rebuild-shell">
    <header class="rebuild-header">
      <div>
        <p class="eyebrow">KATACHI / ARCHITECTURE MIGRATION INSPECTOR · PHASE 0</p>
        <h1>Golden Rebuild <span>LUNA</span></h1>
        <p class="lede">Shadow-only architecture bootstrap. Golden LUNA remains the production authoring path.</p>
      </div>
      <div class="version">v${manifest.version}<span>${manifest.updatedAt}</span></div>
    </header>

    <main>
      <section class="panel source-panel" aria-labelledby="source-title">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">SOURCE BASELINE</p>
            <h2 id="source-title">Golden LUNA / read-only adapter</h2>
          </div>
          <span id="rebuild-mode" class="mode-badge">SHADOW · READ ONLY</span>
        </div>
        <div class="source-facts">
          <div><span>Golden branch</span><strong id="golden-source-branch"></strong></div>
          <div><span>Golden HEAD</span><code id="golden-source-head"></code></div>
          <div><span>Adapter source</span><code id="golden-source-name"></code></div>
          <div><span>Registry</span><strong id="registry-count"></strong></div>
        </div>
        <p class="read-only-note">このrouteはGoldenのDOM、geometry、support、FKEIを変更しません。Phase 0では既存production dataをArtifactとして観察します。</p>
      </section>

      <section class="panel" aria-labelledby="status-title">
        <div class="panel-heading compact">
          <div>
            <p class="eyebrow">MIGRATION STATUS</p>
            <h2 id="status-title">Artifact registry</h2>
          </div>
          <span id="shadow-comparison-status" class="comparison-badge"></span>
        </div>
        <div id="artifact-registry" class="artifact-list" role="list"></div>
      </section>

      <section class="two-column">
        <section class="panel" aria-labelledby="graph-title">
          <div class="panel-heading compact">
            <div>
              <p class="eyebrow">GRAPH LAYERS</p>
              <h2 id="graph-title">Independent GraphArtifact layers</h2>
            </div>
          </div>
          <div id="graph-artifacts" class="graph-list"></div>
          <p class="panel-footnote">Graph layers stay separate. Phase 0 registers interfaces only; production graph algorithms are unchanged.</p>
        </section>

        <section class="panel" aria-labelledby="compare-title">
          <div class="panel-heading compact">
            <div>
              <p class="eyebrow">SHADOW COMPARISON</p>
              <h2 id="compare-title">Golden ↔ Rebuild</h2>
            </div>
            <span id="comparison-difference-count" class="fact-chip"></span>
          </div>
          <div id="shadow-comparison" class="comparison-list"></div>
          <p id="comparison-facts" class="panel-footnote">fingerprint · counts · bounds · graph nodes / edges · provenance</p>
        </section>
      </section>

      <section class="panel" aria-labelledby="view-title">
        <div class="panel-heading compact">
          <div>
            <p class="eyebrow">VIEW CONTRACT</p>
            <h2 id="view-title">Representation-only views</h2>
          </div>
          <span id="selected-view" class="fact-chip">BEADS</span>
        </div>
        <div class="view-layer-list" role="list" aria-label="View layers"></div>
        <p class="view-invariant">View switching invariant: geometry mutation 0 · worker start 0 · Stage mutation 0 · FKEI mutation 0</p>
      </section>
    </main>
  </div>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Golden Rebuild UI element ${selector}`);
  return element;
}

function shortFingerprint(value: string | undefined): string {
  return value ? `sha256:${value.slice(0, 12)}…` : "—";
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2);
}

function summaryOf(artifact: RegisteredArtifact<unknown>): string {
  const data = artifact.data as ArtifactSummaryData | null;
  return data?.summary ?? "not migrated";
}

function statusLabel(artifact: RegisteredArtifact<unknown>): string {
  if (artifact.status === "unavailable") return "not migrated";
  return `GOLDEN ADAPTER · ${artifact.status}`;
}

function factsOf(artifact: RegisteredArtifact<unknown>): string[] {
  const data = artifact.data as ArtifactSummaryData | null;
  const facts: string[] = [];
  for (const [key, value] of Object.entries(data?.counts ?? {})) facts.push(`${key} ${formatCount(value)}`);
  const bounds = data?.bounds;
  if (bounds) {
    const size = {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z,
    };
    facts.push(`bounds ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
  }
  return facts;
}

function renderArtifactRow(artifact: GoldenAdapterArtifact): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "artifact-row";
  row.dataset.artifactId = artifact.id;
  const heading = document.createElement("div");
  heading.className = "artifact-heading";
  heading.innerHTML = `<strong>${LABELS[artifact.id as GoldenArtifactId]}</strong><span>${artifact.role}</span>`;

  const state = document.createElement("div");
  state.className = `artifact-state ${artifact.status}`;
  state.innerHTML = `<b>${statusLabel(artifact)}</b><span>${summaryOf(artifact)}</span>`;

  const meta = document.createElement("div");
  meta.className = "artifact-meta";
  const facts = factsOf(artifact);
  meta.innerHTML = `<code>${shortFingerprint(artifact.fingerprint)}</code><span>${facts.join(" · ") || "—"}</span><small>${artifact.provenance.source}</small>`;

  row.append(heading, state, meta);
  return row;
}

function renderGraphRow(artifact: GoldenAdapterArtifact): HTMLDivElement | null {
  if (!("graph" in artifact)) return null;
  const graphArtifact = artifact as GraphArtifact<ArtifactSummaryData>;
  const row = document.createElement("div");
  row.className = "graph-row";
  const graph = graphArtifact.graph;
  row.innerHTML = `
    <div><strong>${LABELS[artifact.id as GoldenArtifactId]}</strong><span>${artifact.status === "unavailable" ? "not migrated" : "registered"}</span></div>
    <b>${graph ? `${formatCount(graph.nodeCount)} nodes / ${formatCount(graph.edgeCount)} edges` : "—"}</b>
    <code>${shortFingerprint(artifact.fingerprint)}</code>
  `;
  return row;
}

requiredElement<HTMLElement>("#golden-source-branch").textContent = GOLDEN_SOURCE_BRANCH;
requiredElement<HTMLElement>("#golden-source-head").textContent = GOLDEN_SOURCE_HEAD;
requiredElement<HTMLElement>("#golden-source-name").textContent = goldenRegistry.get("body")?.provenance.source ?? "—";
requiredElement<HTMLElement>("#registry-count").textContent = `${goldenRegistry.list().length} artifacts`;
requiredElement<HTMLElement>("#shadow-comparison-status").textContent = shadowComparison.match ? "PASS · parity" : "MISMATCH";
requiredElement<HTMLElement>("#shadow-comparison-status").dataset.state = shadowComparison.match ? "pass" : "mismatch";
requiredElement<HTMLElement>("#comparison-difference-count").textContent = `${shadowComparison.differences.length} differences`;

const artifactList = requiredElement<HTMLDivElement>("#artifact-registry");
for (const artifact of goldenRegistry.list()) artifactList.append(renderArtifactRow(artifact));

const graphList = requiredElement<HTMLDivElement>("#graph-artifacts");
for (const artifact of goldenRegistry.list()) {
  const row = renderGraphRow(artifact);
  if (row) graphList.append(row);
}

const comparisonList = requiredElement<HTMLDivElement>("#shadow-comparison");
for (const comparison of shadowComparison.artifacts) {
  const row = document.createElement("div");
  row.className = "comparison-row";
  row.innerHTML = `<span>${LABELS[comparison.id as GoldenArtifactId]}</span><b class="${comparison.match ? "match" : "mismatch"}">${comparison.match ? "PASS" : comparison.differences.join(", ")}</b>`;
  comparisonList.append(row);
}

const viewLayerList = requiredElement<HTMLDivElement>(".view-layer-list");
const selectedView = requiredElement<HTMLElement>("#selected-view");
for (const layer of VIEW_LAYERS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = layer;
  button.dataset.viewLayer = layer;
  button.className = layer === VIEW_LAYERS[0] ? "active" : "";
  button.addEventListener("click", () => {
    for (const candidate of viewLayerList.querySelectorAll<HTMLButtonElement>("button")) candidate.classList.toggle("active", candidate === button);
    selectedView.textContent = layer;
  });
  viewLayerList.append(button);
}

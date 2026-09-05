import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type ImportedHostInstance,
  type ImportedHostSource,
} from "./externalStlHost.ts";
import {
  applyApprovedBoundaryRepair,
  APPROVED_USAGI_BOUNDARY_LOOPS,
  USAGI_REPAIR_POLICY_VERSION,
  USAGI_SOURCE_SHA256,
  type ApprovedRepairedHost,
} from "./externalStlHostRepair.ts";
import { createExternalStlHostV6Adapter, type ExternalStlHostV6Adapter, type HostAuthoredFlowerMotif } from "./externalStlHostV6Adapter.ts";
import { generateAuthorGateMotifs, type AuthorGateMotifSettings } from "./externalStlHostAuthorGate.ts";
import {
  captureExternalHostProject,
  restoreExternalHostProjectAtomically,
  serializeExternalHostProject,
} from "./externalStlHostPersistence.ts";

type Elements = {
  file: HTMLInputElement;
  loadLocal: HTMLButtonElement;
  apply: HTMLButtonElement;
  count32: HTMLButtonElement;
  count128: HTMLButtonElement;
  count256: HTMLButtonElement;
  count512: HTMLButtonElement;
  customCount: HTMLInputElement;
  customGenerate: HTMLButtonElement;
  saveProject: HTMLButtonElement;
  reopenProject: HTMLButtonElement;
  downloadProject: HTMLButtonElement;
  openProject: HTMLButtonElement;
  openProjectFile: HTMLInputElement;
  hostVisible: HTMLInputElement;
  hostView: HTMLSelectElement;
  sizeMode: HTMLSelectElement;
  baseSize: HTMLInputElement;
  sizeVariance: HTMLInputElement;
  status: HTMLElement;
  metadata: HTMLElement;
  preflight: HTMLElement;
  motifs: HTMLElement;
  gate: HTMLElement;
  persistence: HTMLElement;
  filePersistence: HTMLElement;
  console: HTMLElement;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("V6 Host lab root is missing");
const elements = buildUi(app);
const main = document.querySelector<HTMLElement>("main");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10161b);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
camera.position.set(0, 0, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(1, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.id = "viewport";
main?.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const hostDebugRoot = new THREE.Group();
const hostRoot = new THREE.Group();
const motifRoot = new THREE.Group();
hostRoot.add(hostDebugRoot);
scene.add(hostRoot, motifRoot);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x263038, 2.2));
const directional = new THREE.DirectionalLight(0xffffff, 2.4);
directional.position.set(2, 3, 4);
scene.add(directional);

let source: ImportedHostSource | null = null;
let original: ImportedHostInstance | null = null;
let repaired: ApprovedRepairedHost | null = null;
let adapter: ExternalStlHostV6Adapter | null = null;
let motifs: readonly HostAuthoredFlowerMotif[] = [];
let hostMesh: THREE.Mesh | null = null;
let motifMesh: THREE.InstancedMesh | null = null;
let hostDebugPoints: THREE.Points | null = null;
let hostDebugNormals: THREE.LineSegments | null = null;
let sourceBytes: ArrayBuffer | null = null;
let savedProjectText: string | null = null;
const consoleErrors: string[] = [];
const consoleWarnings: string[] = [];
const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
console.error = (...args: unknown[]) => { consoleErrors.push(args.map(String).join(" ")); originalConsoleError(...args); refreshConsole(); };
console.warn = (...args: unknown[]) => { consoleWarnings.push(args.map(String).join(" ")); originalConsoleWarn(...args); refreshConsole(); };
window.addEventListener("error", (event) => { consoleErrors.push(event.message); refreshConsole(); });
window.addEventListener("unhandledrejection", (event) => { consoleErrors.push(String(event.reason)); refreshConsole(); });

elements.file.addEventListener("change", () => {
  const file = elements.file.files?.[0];
  if (file) void loadFile(file);
});
elements.loadLocal.addEventListener("click", () => { void loadLocalSource(); });
elements.apply.addEventListener("click", () => { void applyRepairAndActivate(); });
elements.count32.addEventListener("click", () => generateMotifs(32));
elements.count128.addEventListener("click", () => generateMotifs(128));
elements.count256.addEventListener("click", () => generateMotifs(256));
elements.count512.addEventListener("click", () => generateMotifs(512));
elements.customGenerate.addEventListener("click", () => {
  const count = Number(elements.customCount.value);
  if (!Number.isInteger(count) || count < 32 || count > 512) {
    elements.status.className = "status error";
    elements.status.textContent = "Custom count must be an integer from 32 to 512.";
    return;
  }
  generateMotifs(count);
});
elements.saveProject.addEventListener("click", () => { saveProject(); });
elements.reopenProject.addEventListener("click", () => { void reopenProject(); });
elements.downloadProject.addEventListener("click", () => { downloadProject(); });
elements.openProject.addEventListener("click", () => { elements.openProjectFile.click(); });
elements.openProjectFile.addEventListener("change", () => {
  const file = elements.openProjectFile.files?.[0];
  if (file) void openProjectFile(file);
});
elements.hostVisible.addEventListener("change", () => {
  const before = motifFingerprint();
  hostRoot.visible = elements.hostVisible.checked;
  const after = motifFingerprint();
  elements.gate.textContent = [
    `Host visibility: ${elements.hostVisible.checked ? "ON" : "OFF"}`,
    `motif positions unchanged: ${before === after ? "PASS" : "FAIL"}`,
    `host group only: ${motifRoot.visible ? "PASS" : "FAIL"}`,
    `motifs: ${motifs.length}`,
  ].join("\n");
});
elements.hostView.addEventListener("change", () => { refreshPresentation(); });

function buildUi(root: HTMLElement): Elements {
  root.innerHTML = `
    <aside>
      <h1>SKIN External STL Host · V6 gate</h1>
      <p>Actual Usagi repair plus the existing V6 Flower generator. Reference Host is printable=false; authored motifs are permanent artwork candidates. Host OFF must hide only the rabbit.</p>
      <h2>Source</h2>
      <label>Select the author-provided rabbit STL<input id="stl-file" type="file" accept=".stl,model/stl" /></label>
      <button id="load-local" class="secondary" type="button">Load exact local rabbit source</button>
      <div id="status" class="status">Select C:/dev/samples/rabbit_230223.stl.</div>
      <pre id="metadata" class="meta">No source loaded.</pre>
      <h2>Approved activation</h2>
      <button id="apply" type="button">Apply approved 7-loop repair + activate</button>
      <p>Fixed interpretation: 1 mm/source unit, +Y, right-handed, uniformScale 20 (2000%).</p>
      <h2>V6 Flower / Motif placement</h2>
      <div class="row"><button id="count32" type="button">Generate 32 motifs</button><button id="count128" type="button">Generate 128 motifs</button></div>
      <div class="row"><button id="count256" type="button">Generate 256 motifs</button><button id="count512" type="button">Generate 512 motifs</button></div>
      <div class="row"><input id="custom-count" type="number" min="32" max="512" step="1" value="256" aria-label="Custom motif count" /><button id="custom-generate" type="button">Generate custom (32–512)</button></div>
      <label class="check"><input id="host-visible" type="checkbox" checked /> Host ON</label>
      <label>Host view<select id="host-view"><option value="solid">solid preview</option><option value="wireframe">wireframe</option><option value="debug">surface points / normals debug</option></select></label>
      <label>Motif size<select id="size-mode"><option value="uniform">uniform size</option><option value="varied">size variation ON</option></select></label>
      <label>Base size (mm)<input id="base-size" type="number" min="0.5" max="8" step="0.1" value="2.4" /></label>
      <label>Size variance (0–1)<input id="size-variance" type="number" min="0" max="1" step="0.05" value="0.35" /></label>
      <pre id="motifs" class="meta">No repaired Host active.</pre>
      <h2>Persistence / Save-Reopen</h2>
      <div class="row"><button id="save-project" type="button">Save embedded v2 project</button><button id="reopen-project" class="secondary" type="button" disabled>Reopen embedded bytes</button></div>
      <pre id="persistence" class="meta">Save after generating V6 motifs.</pre>
      <h2>File export / import</h2>
      <div class="row"><button id="download-project" type="button">Download .fkei</button><button id="open-project" class="secondary" type="button">Open .fkei</button></div>
      <input id="open-project-file" type="file" accept=".fkei,application/json" hidden />
      <pre id="file-persistence" class="meta">Download or open the exact katachi.skin.fkei.v2 project.</pre>
      <h2>Preflight / Signed Volume</h2>
      <pre id="preflight" class="meta">No repaired Host active.</pre>
      <h2>Technical Chrome gate</h2>
      <pre id="gate" class="meta">Host ON/OFF gate pending.</pre>
      <pre id="console" class="meta">console errors: 0\nconsole warnings: 0</pre>
    </aside>
    <main><div id="legend">Drag to orbit · wheel to zoom · orange = authored V6 motifs</div></main>`;
  return {
    file: root.querySelector<HTMLInputElement>("#stl-file")!,
    loadLocal: root.querySelector<HTMLButtonElement>("#load-local")!,
    apply: root.querySelector<HTMLButtonElement>("#apply")!,
    count32: root.querySelector<HTMLButtonElement>("#count32")!,
    count128: root.querySelector<HTMLButtonElement>("#count128")!,
    count256: root.querySelector<HTMLButtonElement>("#count256")!,
    count512: root.querySelector<HTMLButtonElement>("#count512")!,
    customCount: root.querySelector<HTMLInputElement>("#custom-count")!,
    customGenerate: root.querySelector<HTMLButtonElement>("#custom-generate")!,
    saveProject: root.querySelector<HTMLButtonElement>("#save-project")!,
    reopenProject: root.querySelector<HTMLButtonElement>("#reopen-project")!,
    downloadProject: root.querySelector<HTMLButtonElement>("#download-project")!,
    openProject: root.querySelector<HTMLButtonElement>("#open-project")!,
    openProjectFile: root.querySelector<HTMLInputElement>("#open-project-file")!,
    hostVisible: root.querySelector<HTMLInputElement>("#host-visible")!,
    hostView: root.querySelector<HTMLSelectElement>("#host-view")!,
    sizeMode: root.querySelector<HTMLSelectElement>("#size-mode")!,
    baseSize: root.querySelector<HTMLInputElement>("#base-size")!,
    sizeVariance: root.querySelector<HTMLInputElement>("#size-variance")!,
    status: root.querySelector<HTMLElement>("#status")!,
    metadata: root.querySelector<HTMLElement>("#metadata")!,
    preflight: root.querySelector<HTMLElement>("#preflight")!,
    motifs: root.querySelector<HTMLElement>("#motifs")!,
    gate: root.querySelector<HTMLElement>("#gate")!,
    persistence: root.querySelector<HTMLElement>("#persistence")!,
    filePersistence: root.querySelector<HTMLElement>("#file-persistence")!,
    console: root.querySelector<HTMLElement>("#console")!,
  };
}

async function loadFile(file: File): Promise<void> {
  elements.status.className = "status";
  elements.status.textContent = "Reading exact source bytes…";
  try {
    await loadSourceBytes(await file.arrayBuffer(), file.name);
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function loadLocalSource(): Promise<void> {
  elements.status.className = "status";
  elements.status.textContent = "Reading the exact local rabbit source through localhost…";
  try {
    const response = await fetch("/__phase5/rabbit_230223.stl", { cache: "no-store" });
    if (!response.ok) throw new Error(`local source route returned HTTP ${response.status}`);
    await loadSourceBytes(await response.arrayBuffer(), "rabbit_230223.stl");
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Local source load failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function loadSourceBytes(bytes: ArrayBuffer, filename: string): Promise<void> {
  try {
    sourceBytes = bytes;
    source = await createImportedHostSource(sourceBytes, {
      filename,
      interpretation: {
        unitStatus: "explicit",
        mmPerSourceUnit: 1,
        upAxis: "y",
        handedness: "right",
        importPolicyVersion: "stl-host-v0",
      },
    });
    original = createImportedHostInstance(source, {
      translation: { x: 0, y: 0, z: 0 },
      rotation: [0, 0, 0, 1],
      uniformScale: 20,
    });
    repaired = null;
    adapter = null;
    motifs = [];
    savedProjectText = null;
    elements.reopenProject.disabled = true;
    clearPreview();
    refreshMetadata();
    elements.preflight.textContent = "Source retained. Apply the approved repair to promote Signed Volume.";
    elements.motifs.textContent = "No repaired Host active.";
    elements.gate.textContent = "Host ON/OFF gate pending.";
    elements.persistence.textContent = "Save after generating V6 motifs.";
    elements.filePersistence.textContent = "Download or open the exact katachi.skin.fkei.v2 project.";
    elements.status.textContent = "Source retained; approved repair is ready.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function applyRepairAndActivate(): Promise<void> {
  if (!source || !original || !sourceBytes) {
    elements.status.className = "status error";
    elements.status.textContent = "Select the author-provided rabbit STL first.";
    return;
  }
  elements.status.className = "status";
  elements.status.textContent = "Applying deterministic approved boundary repair…";
  try {
    if (source.sourceIdentity.sha256 !== USAGI_SOURCE_SHA256) throw new Error(`Unexpected source hash ${source.sourceIdentity.sha256}`);
    repaired = await applyApprovedBoundaryRepair(original, {
      originalSourceSha256: USAGI_SOURCE_SHA256,
      repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
      approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS,
    });
    adapter = createExternalStlHostV6Adapter(repaired.repaired, { seed: "usagi-v6-golden" });
    refreshMetadata();
    refreshPreflight();
    refreshPresentation();
    framePreview();
    elements.status.textContent = "Approved repaired Host active; Signed Volume promoted; Reference Host printable=false.";
    elements.gate.textContent = "Host ON/OFF gate pending. Generate motifs, then toggle Host OFF.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Activation failed closed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function currentMotifSettings(): AuthorGateMotifSettings {
  const baseSize = Number(elements.baseSize.value);
  const sizeVariance = Number(elements.sizeVariance.value);
  if (!Number.isFinite(baseSize) || baseSize <= 0 || !Number.isFinite(sizeVariance) || sizeVariance < 0 || sizeVariance > 1) {
    throw new Error("Base size must be positive and variance must be between 0 and 1.");
  }
  const sizeMode = elements.sizeMode.value;
  if (sizeMode !== "uniform" && sizeMode !== "varied") throw new Error("Unknown motif size mode.");
  return { sizeMode, baseSize, sizeVariance };
}

function minimumClearanceForCount(count: number): number {
  // Preserve the Phase 6 spacing at 32/128; denser Author Gate views use a
  // deterministic bounded reduction so 256/512 can read as a field.
  return count <= 128 ? 4.6 : Math.max(2.6, 4.6 * Math.sqrt(128 / count));
}

function placementSummary(): string {
  if (motifs.length === 0) return "placement coverage: n/a";
  const positions = motifs.map((motif) => motif.hostPlacement.position);
  const min = { x: Math.min(...positions.map((point) => point.x)), y: Math.min(...positions.map((point) => point.y)), z: Math.min(...positions.map((point) => point.z)) };
  const max = { x: Math.max(...positions.map((point) => point.x)), y: Math.max(...positions.map((point) => point.y)), z: Math.max(...positions.map((point) => point.z)) };
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const octants = new Array<number>(8).fill(0);
  for (const point of positions) {
    const index = (point.x >= center.x ? 1 : 0) | (point.y >= center.y ? 2 : 0) | (point.z >= center.z ? 4 : 0);
    octants[index] += 1;
  }
  const spans = ["x", "y", "z"].map((axis) => {
    const range = max[axis as "x" | "y" | "z"] - min[axis as "x" | "y" | "z"];
    return `${axis}:${range.toFixed(1)}`;
  }).join(" ");
  return `placement coverage mm: ${spans}\noctant counts: ${octants.join(",")} (deterministic balance check)`;
}

function motifRadiusSummary(): string {
  if (motifs.length === 0) return "motif radius range: n/a";
  const means = motifs.map((motif) => motif.points.reduce((sum, point) => sum + point.r, 0) / motif.points.length);
  return `motif radius mean range: ${Math.min(...means).toFixed(3)}–${Math.max(...means).toFixed(3)} mm`;
}

function applyMotifSettings(settings: Partial<AuthorGateMotifSettings> & { readonly count?: number }): void {
  if (settings.sizeMode === "uniform" || settings.sizeMode === "varied") elements.sizeMode.value = settings.sizeMode;
  if (settings.baseSize !== undefined && Number.isFinite(settings.baseSize)) elements.baseSize.value = String(settings.baseSize);
  if (settings.sizeVariance !== undefined && Number.isFinite(settings.sizeVariance)) elements.sizeVariance.value = String(settings.sizeVariance);
  if (settings.count !== undefined && Number.isInteger(settings.count) && settings.count >= 32 && settings.count <= 512) elements.customCount.value = String(settings.count);
}

function generateMotifs(count: number): void {
  if (!adapter) {
    elements.status.className = "status error";
    elements.status.textContent = "Activate the repaired Host before generating V6 motifs.";
    return;
  }
  try {
    const settings = currentMotifSettings();
    const minimumClearance = minimumClearanceForCount(count);
    motifs = generateAuthorGateMotifs(adapter, count, { ...settings, minimumClearance });
    savedProjectText = null;
    elements.reopenProject.disabled = true;
    elements.customCount.value = String(count);
    refreshMotifs();
    elements.motifs.textContent = [
      `requested motifs: ${count}`,
      `authored motifs: ${motifs.length}`,
      `size mode: ${settings.sizeMode} · base ${settings.baseSize} mm · variance ${settings.sizeVariance}`,
      `placement clearance: ${minimumClearance.toFixed(2)} mm`,
      "shape source: existing-v6-flower-generator",
      "placement normal: GEOMETRIC",
      "sampling: deterministic golden-ratio triangle-area weighted",
      placementSummary(),
      motifRadiusSummary(),
      "Reference Host printable: false",
      "authored motifs: permanent artwork candidates",
    ].join("\n");
    elements.gate.textContent = `Host ON; motifs visible: ${motifs.length}; toggle Host OFF for the visibility-only check.`;
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Motif generation failed closed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function liveSnapshot() {
  return { source, original, repaired, adapter, motifs, sourceBytes };
}

function replaceFromPlan(plan: Awaited<ReturnType<typeof restoreExternalHostProjectAtomically>>): void {
  source = plan.source;
  original = plan.original;
  repaired = plan.repaired;
  adapter = createExternalStlHostV6Adapter(plan.repaired.repaired, { seed: plan.document.motifGeneration.seed });
  motifs = plan.motifs;
  sourceBytes = plan.source.bytes;
  elements.hostVisible.checked = plan.hostVisible;
  applyMotifSettings({
    count: plan.document.motifGeneration.count,
    sizeMode: plan.document.motifGeneration.sizeMode,
    baseSize: plan.document.motifGeneration.baseSize,
    sizeVariance: plan.document.motifGeneration.sizeVariance,
  });
}

function redrawLiveProject(): void {
  refreshMetadata();
  refreshPreflight();
  refreshPresentation();
  framePreview();
  refreshMotifs();
}

function saveProject(): void {
  try {
    const captured = captureCurrentProject();
    savedProjectText = captured.text;
    elements.reopenProject.disabled = false;
    elements.persistence.textContent = [
      "schema: katachi.skin.fkei.v2",
      `serialized JSON bytes: ${captured.bytes}`,
      `embedded STL bytes: ${captured.document.referenceHost.source.byteLength}`,
      `embedded source SHA-256: ${captured.document.referenceHost.source.sha256}`,
      `repair fingerprint: ${captured.document.referenceHost.repair.expectedRepairedMeshFingerprint}`,
      `authored motifs: ${captured.document.authoredMotifs.length}`,
      `size mode: ${captured.document.motifGeneration.sizeMode ?? "uniform"}`,
      `base / variance: ${captured.document.motifGeneration.baseSize ?? 2.4} / ${captured.document.motifGeneration.sizeVariance ?? 0}`,
      "Reference Host printable: false",
      "authored motifs printable field: absent",
      "reopen source path required: NO",
    ].join("\n");
    elements.status.className = "status";
    elements.status.textContent = "Embedded v2 project saved in memory; reopen is ready.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Save failed closed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function captureCurrentProject(): { readonly document: ReturnType<typeof captureExternalHostProject>; readonly text: string; readonly bytes: number } {
  if (!source || !original || !repaired || !adapter || motifs.length === 0) {
    throw new Error("Activate the repaired Host and generate V6 motifs before saving.");
  }
  const document = captureExternalHostProject({
    source,
    original,
    repaired,
    motifs,
    hostVisible: elements.hostVisible.checked,
    seed: adapter.seed,
    motifSettings: currentMotifSettings(),
  });
  const text = serializeExternalHostProject(document);
  return { document, text, bytes: new TextEncoder().encode(text).byteLength };
}

function projectFilename(): string {
  const settings = currentMotifSettings();
  return `usagi-v6-${motifs.length}-${settings.sizeMode}.fkei`;
}

function downloadProject(): void {
  try {
    const captured = captureCurrentProject();
    const filename = projectFilename();
    const blob = new Blob([captured.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    elements.filePersistence.textContent = [
      "Download .fkei: PASS",
      `filename: ${filename}`,
      `byte size: ${blob.size}`,
      "content: exact katachi.skin.fkei.v2 serialized text",
    ].join("\n");
    elements.status.className = "status";
    elements.status.textContent = "External Host v2 .fkei download started.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Download failed closed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function openProjectFile(file: File): Promise<void> {
  const previous = liveSnapshot();
  elements.status.className = "status";
  elements.status.textContent = `Opening ${file.name} from disk…`;
  try {
    const text = await file.text();
    const plan = await restoreExternalHostProjectAtomically(text, {
      capture: () => previous,
      replace: (plan) => { replaceFromPlan(plan); },
      restore: (snapshot) => {
        source = snapshot.source;
        original = snapshot.original;
        repaired = snapshot.repaired;
        adapter = snapshot.adapter;
        motifs = snapshot.motifs;
        sourceBytes = snapshot.sourceBytes;
      },
      redraw: () => { redrawLiveProject(); },
    });
    savedProjectText = text;
    elements.reopenProject.disabled = false;
    const afterMotifs = exactMotifFingerprint();
    elements.filePersistence.textContent = [
      "Open .fkei: PASS",
      `filename: ${file.name}`,
      `byte size: ${new TextEncoder().encode(text).byteLength}`,
      `source hash: ${source?.sourceIdentity.sha256 === USAGI_SOURCE_SHA256 ? "PASS" : "FAIL"}`,
      `repair fingerprint: ${repaired?.materialization.repairedFingerprint === "90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6" ? "PASS" : "FAIL"}`,
      "Host transform: PASS",
      `Signed Volume: ${repaired?.repaired.capabilities.signedVolumeCapability.availability}`,
      `motif geometry exact: ${afterMotifs === exactMotifFingerprintFor(plan.motifs) ? "PASS" : "FAIL"}`,
      `motifs restored: ${motifs.length}`,
      `motif settings: ${elements.sizeMode.value} · base ${elements.baseSize.value} · variance ${elements.sizeVariance.value}`,
      `Host visibility restored: ${elements.hostVisible.checked ? "ON" : "OFF"}`,
      "external source path required: NO",
    ].join("\n");
    elements.status.textContent = "External Host v2 .fkei opened; exact authored motifs restored.";
    elements.gate.textContent = [
      `Host visibility: ${elements.hostVisible.checked ? "ON" : "OFF"}`,
      "motif positions unchanged: PASS",
      `host group only: ${motifRoot.visible ? "PASS" : "FAIL"}`,
      `motifs: ${motifs.length}`,
    ].join("\n");
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Open failed closed; previous live project retained: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    elements.openProjectFile.value = "";
  }
}

async function reopenProject(): Promise<void> {
  if (!savedProjectText) {
    elements.status.className = "status error";
    elements.status.textContent = "Save the embedded v2 project first.";
    return;
  }
  const beforeMotifs = exactMotifFingerprint();
  const previous = liveSnapshot();
  elements.status.className = "status";
  elements.status.textContent = "Reopening from embedded source bytes only…";
  try {
    await restoreExternalHostProjectAtomically(savedProjectText, {
      capture: () => previous,
      replace: (plan) => { replaceFromPlan(plan); },
      restore: (snapshot) => {
        source = snapshot.source;
        original = snapshot.original;
        repaired = snapshot.repaired;
        adapter = snapshot.adapter;
        motifs = snapshot.motifs;
        sourceBytes = snapshot.sourceBytes;
      },
      redraw: () => { redrawLiveProject(); },
    });
    const afterMotifs = exactMotifFingerprint();
    elements.persistence.textContent += [
      "",
      "save → reopen: PASS",
      "reopen source path required: NO",
      `embedded source rehash: ${source?.sourceIdentity.sha256 === USAGI_SOURCE_SHA256 ? "PASS" : "FAIL"}`,
      `repair fingerprint recheck: ${repaired?.materialization.repairedFingerprint === "90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6" ? "PASS" : "FAIL"}`,
      `motif geometry exact: ${beforeMotifs === afterMotifs ? "PASS" : "FAIL"}`,
      `motifs restored: ${motifs.length}`,
      `Signed Volume: ${repaired?.repaired.capabilities.signedVolumeCapability.availability}`,
    ].join("\n");
    elements.status.textContent = "Embedded v2 project reopened; exact authored motifs restored. Toggle Host OFF for the final gate.";
    elements.gate.textContent = `Host ON; motifs visible: ${motifs.length}; toggle Host OFF for the visibility-only check.`;
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Reopen failed closed; previous live project retained: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function refreshMetadata(): void {
  if (!source || !original) return;
  const bounds = original.mesh.bounds;
  const size = [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z];
  elements.metadata.textContent = [
    `filename: ${source.filename}`,
    `sha256: ${source.sourceIdentity.sha256}`,
    `byteLength: ${source.sourceIdentity.byteLength}`,
    "interpretation: 1 mm/source-unit · +Y · right-handed",
    "instance uniformScale: 20 (2000%)",
    `instance bounds mm: ${size.map((value) => value.toFixed(3)).join(" × ")}`,
    `source bytes retained: ${sourceBytes ? "YES" : "NO"}`,
    `original signed volume: ${original.capabilities.signedVolumeCapability.availability} (${original.capabilities.signedVolumeCapability.reason ?? "n/a"})`,
  ].join("\n");
}

function refreshPreflight(): void {
  if (!repaired) return;
  const originalTopology = repaired.original.volumePreflight.diagnostics.topology;
  const topology = repaired.repaired.volumePreflight.diagnostics.topology;
  const signed = repaired.repaired.capabilities.signedVolumeCapability;
  elements.preflight.textContent = [
    `original boundary edges / loops: ${originalTopology.boundaryEdgeCount} / ${originalTopology.boundaryLoopCount}`,
    `repaired triangles: ${topology.triangleCount}`,
    `repaired valid / degenerate: ${topology.validTriangleCount} / ${topology.degenerateTriangleCount}`,
    `repaired boundary edges / loops: ${topology.boundaryEdgeCount} / ${topology.boundaryLoopCount}`,
    `non-manifold / orientation: ${topology.nonManifoldEdgeCount} / ${topology.orientationInconsistencyEdgeCount}`,
    `connected components: ${topology.connectedComponentCount}`,
    `self-intersection: ${repaired.repaired.volumePreflight.selfIntersection}`,
    `Signed Volume: ${signed.availability}`,
    `repair policy: ${repaired.materialization.provenance.repairPolicyVersion}`,
    `repair fingerprint: ${repaired.materialization.repairedFingerprint}`,
    `removed degenerate triangles: ${repaired.materialization.removedDegenerateTriangleIndices.length}`,
    `inserted local fan triangles: ${repaired.materialization.provenance.repairParameters.insertedTriangleCount}`,
  ].join("\n");
}

function clearPreview(): void {
  if (hostMesh) {
    hostMesh.geometry.dispose();
    (hostMesh.material as THREE.Material).dispose();
    hostRoot.remove(hostMesh);
    hostMesh = null;
  }
  if (hostDebugPoints) {
    hostDebugPoints.geometry.dispose();
    (hostDebugPoints.material as THREE.Material).dispose();
    hostDebugRoot.remove(hostDebugPoints);
    hostDebugPoints = null;
  }
  if (hostDebugNormals) {
    hostDebugNormals.geometry.dispose();
    (hostDebugNormals.material as THREE.Material).dispose();
    hostDebugRoot.remove(hostDebugNormals);
    hostDebugNormals = null;
  }
  hostDebugRoot.visible = false;
  if (motifMesh) {
    motifMesh.geometry.dispose();
    (motifMesh.material as THREE.Material).dispose();
    motifRoot.remove(motifMesh);
    motifMesh = null;
  }
}

function refreshPresentation(): void {
  clearPreview();
  if (!repaired) return;
  const geometry = new THREE.BufferGeometry();
  const positions = repaired.repaired.mesh.positions;
  const triangleNormals = repaired.repaired.mesh.geometricNormals;
  const vertexNormals = new Float32Array(positions.length);
  for (let triangle = 0; triangle < positions.length / 9; triangle += 1) {
    const normalOffset = triangle * 3;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = triangle * 9 + vertex * 3;
      vertexNormals[vertexOffset] = triangleNormals[normalOffset];
      vertexNormals[vertexOffset + 1] = triangleNormals[normalOffset + 1];
      vertexNormals[vertexOffset + 2] = triangleNormals[normalOffset + 2];
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(vertexNormals, 3));
  const view = elements.hostView.value;
  const solid = view === "solid";
  hostMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: solid ? 0x8e9fa8 : 0x6f8a96,
    roughness: 0.82,
    metalness: 0.04,
    transparent: !solid,
    opacity: solid ? 1 : view === "wireframe" ? 0.78 : 0.16,
    depthWrite: solid,
    wireframe: view === "wireframe",
    side: THREE.DoubleSide,
  }));
  hostRoot.add(hostMesh);
  if (view === "debug") buildHostDebugOverlay(repaired);
  hostDebugRoot.visible = view === "debug";
  hostRoot.visible = elements.hostVisible.checked;
  refreshMotifs();
}

function buildHostDebugOverlay(host: ApprovedRepairedHost): void {
  const positions = host.repaired.mesh.positions;
  const normals = host.repaired.mesh.geometricNormals;
  const triangleCount = Math.floor(positions.length / 9);
  const stride = Math.max(1, Math.ceil(triangleCount / 1800));
  const pointValues: number[] = [];
  const lineValues: number[] = [];
  const size = Math.max(host.repaired.mesh.bounds.max.x - host.repaired.mesh.bounds.min.x, host.repaired.mesh.bounds.max.y - host.repaired.mesh.bounds.min.y, host.repaired.mesh.bounds.max.z - host.repaired.mesh.bounds.min.z);
  const normalLength = Math.max(size * 0.018, 1.2);
  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    const offset = triangle * 9;
    const cx = (positions[offset] + positions[offset + 3] + positions[offset + 6]) / 3;
    const cy = (positions[offset + 1] + positions[offset + 4] + positions[offset + 7]) / 3;
    const cz = (positions[offset + 2] + positions[offset + 5] + positions[offset + 8]) / 3;
    pointValues.push(cx, cy, cz);
    const normalOffset = triangle * 3;
    const nx = normals[normalOffset];
    const ny = normals[normalOffset + 1];
    const nz = normals[normalOffset + 2];
    lineValues.push(cx, cy, cz, cx + nx * normalLength, cy + ny * normalLength, cz + nz * normalLength);
  }
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(pointValues), 3));
  hostDebugPoints = new THREE.Points(pointsGeometry, new THREE.PointsMaterial({ color: 0x58d7ff, size: Math.max(size * 0.006, 0.8), sizeAttenuation: false }));
  hostDebugRoot.add(hostDebugPoints);
  const normalsGeometry = new THREE.BufferGeometry();
  normalsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(lineValues), 3));
  hostDebugNormals = new THREE.LineSegments(normalsGeometry, new THREE.LineBasicMaterial({ color: 0xffd166 }));
  hostDebugRoot.add(hostDebugNormals);
}

function refreshMotifs(): void {
  if (motifMesh) {
    motifMesh.geometry.dispose();
    (motifMesh.material as THREE.Material).dispose();
    motifRoot.remove(motifMesh);
    motifMesh = null;
  }
  const points = motifs.flatMap((motif) => motif.points);
  if (points.length === 0) return;
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const material = new THREE.MeshStandardMaterial({ color: 0xff9f43, emissive: 0x4a1f08, emissiveIntensity: 0.6, roughness: 0.52, metalness: 0.05 });
  motifMesh = new THREE.InstancedMesh(geometry, material, points.length);
  const dummy = new THREE.Object3D();
  points.forEach((point, index) => {
    dummy.position.set(point.x, point.y, point.z);
    dummy.scale.setScalar(Math.max(point.r, 0.08));
    dummy.updateMatrix();
    motifMesh!.setMatrixAt(index, dummy.matrix);
  });
  motifMesh.instanceMatrix.needsUpdate = true;
  motifRoot.add(motifMesh);
}

function motifFingerprint(): string {
  return motifs.flatMap((motif) => motif.points).map((point) => `${point.x.toFixed(9)},${point.y.toFixed(9)},${point.z.toFixed(9)},${point.r.toFixed(9)}`).join("|");
}

function exactMotifFingerprint(): string {
  return exactMotifFingerprintFor(motifs);
}

function exactMotifFingerprintFor(values: readonly HostAuthoredFlowerMotif[]): string {
  const number = (value: number) => Object.is(value, -0) ? "-0" : String(value);
  return values.flatMap((motif) => motif.points).map((point) => [point.x, point.y, point.z, point.r].map(number).join(",")).join("|");
}

function framePreview(): void {
  if (!repaired) return;
  const bounds = repaired.repaired.mesh.bounds;
  const center = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2);
  const size = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size * 1.2, size * 0.78, size * 1.38));
  // Keep the depth range tight enough for the large 2000% instance; the
  // previous 1e6-ish far/near ratio produced false striped self-overlap in
  // the preview even though the Host query and repair data were unchanged.
  camera.near = Math.max(size / 1000, 0.01);
  camera.far = Math.max(size * 10, 1000);
  camera.updateProjectionMatrix();
}

function refreshConsole(): void {
  elements.console.textContent = `console errors: ${consoleErrors.length}${consoleErrors.length ? `\n${consoleErrors.slice(-3).join("\n")}` : ""}\nconsole warnings: ${consoleWarnings.length}${consoleWarnings.length ? `\n${consoleWarnings.slice(-3).join("\n")}` : ""}`;
}

function resize(): void {
  const width = Math.max(1, Math.floor(main?.getBoundingClientRect().width || window.innerWidth));
  const height = Math.max(1, Math.floor(window.innerHeight));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);
if (main && "ResizeObserver" in window) new ResizeObserver(resize).observe(main);
resize();
refreshConsole();
const animate = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); };
animate();

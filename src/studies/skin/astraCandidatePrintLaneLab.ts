import {
  ASTRA_CANDIDATE_FILENAMES,
  ASTRA_COMMON_SUPPORT_SETTINGS,
} from "./astraCandidatePrintLane.ts";
import type {
  LargeCandidateCommand,
  LargeCandidateCompactSummary,
  LargeCandidateId,
  LargeCandidateInventory,
  LargeCandidateWorkerMessage,
} from "./astraLargeCandidateWorkerProtocol.ts";
import { isLargeCandidateMessageCurrent } from "./astraLargeCandidateWorkerProtocol.ts";

type Row = {
  id: LargeCandidateId;
  input: HTMLInputElement;
  status: HTMLElement;
  process: HTMLButtonElement;
  file: File | null;
  inventory: LargeCandidateInventory | null;
  summary: LargeCandidateCompactSummary | null;
  state: "NOT LOADED" | "READY" | "ACTIVE" | "PROCESSING" | "DONE" | "BLOCKED" | "RELEASED";
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Astra candidate lane root is missing");
app.innerHTML = `<aside><h1>SKIN · Astra Large Candidate execution</h1><p>Bounded-memory physical comparison lane. Main thread retains only File references and compact summaries. Exactly one Candidate is active in the Worker.</p><h2>Reference Host</h2><label>Rabbit STL <input id="rabbit" type="file" accept=".stl,model/stl"></label><button id="load-rabbit" type="button">Load Rabbit into Worker</button><pre id="reference" class="meta">Rabbit Reference Host not loaded.</pre><h2>Candidate files</h2><p>Choose the actual A2_BODY.stl / G2_BODY.stl / H2_BODY.stl / J2_BODY.stl files. Selecting a file does not read its bytes on the main thread.</p><div id="candidates"></div><div class="row"><button id="scan" type="button">Scan inventories</button><button id="process-all" type="button">Process All Sequentially</button></div><button id="cancel" type="button" disabled>Cancel active Candidate</button><h2>Common settings</h2><label>Overhang threshold (deg) <input id="threshold" type="number" value="45" min="30" max="65" step="1"></label><label>Rabbit Host clearance (mm) <input id="clearance" type="number" value="0" min="0" max="5" step="0.1"></label><div class="meta">source +Z · common lowest point to plate Z=0 · shaft 1.6 mm · neck 0.6 mm · gap 0.35 mm · Rabbit inside FORBIDDEN</div><p id="active" class="status">Active Candidate: none</p><p id="status" class="status">Load Rabbit and at least one actual Round 2 candidate.</p><pre id="progress" class="meta">Worker idle.</pre><pre id="console" class="meta">console errors: 0\nconsole warnings: 0</pre><p>No winner badge · no ranking · no production SKIN integration · no main merge · no deploy.</p></aside><main><h2>Sequential comparison table</h2><div id="table"></div></main>`;

const rabbitInput = document.querySelector<HTMLInputElement>("#rabbit")!;
const reference = document.querySelector<HTMLElement>("#reference")!;
const status = document.querySelector<HTMLElement>("#status")!;
const progress = document.querySelector<HTMLElement>("#progress")!;
const table = document.querySelector<HTMLElement>("#table")!;
const activeLabel = document.querySelector<HTMLElement>("#active")!;
const thresholdInput = document.querySelector<HTMLInputElement>("#threshold")!;
const clearanceInput = document.querySelector<HTMLInputElement>("#clearance")!;
const consolePanel = document.querySelector<HTMLElement>("#console")!;
const rows = new Map<LargeCandidateId, Row>();
const errors: string[] = [];
const warnings: string[] = [];
let worker: Worker | null = null;
let requestId = 0;
let generation = 0;
let activeCandidate: LargeCandidateId | null = null;
let rabbitReady = false;
let commonTranslationZ: number | null = null;
const pending = new Map<number, { resolve: (message: LargeCandidateWorkerMessage) => void; reject: (error: Error) => void }>();

function makeRow(id: LargeCandidateId): Row {
  const wrapper = document.createElement("section"); wrapper.className = "candidate";
  wrapper.innerHTML = `<strong>${id}</strong> <span>${ASTRA_CANDIDATE_FILENAMES[id]}</span> <span class="row-status">NOT LOADED</span><input type="file" accept=".stl,model/stl"><button type="button" disabled>Process ${id}</button>`;
  document.querySelector<HTMLDivElement>("#candidates")!.append(wrapper);
  const input = wrapper.querySelector<HTMLInputElement>("input")!; const rowStatus = wrapper.querySelector<HTMLElement>(".row-status")!; const process = wrapper.querySelector<HTMLButtonElement>("button")!;
  const row: Row = { id, input, status: rowStatus, process, file: null, inventory: null, summary: null, state: "NOT LOADED" };
  input.addEventListener("change", () => { row.file = input.files?.[0] ?? null; row.inventory = null; row.summary = null; setRowState(row, row.file ? "READY" : "NOT LOADED"); refreshTable(); });
  process.addEventListener("click", () => { void processRow(row); });
  return row;
}
for (const id of ["A", "G", "H", "J"] as const) rows.set(id, makeRow(id));

function setRowState(row: Row, state: Row["state"], detail?: string): void { row.state = state; row.status.textContent = detail ? `${state} · ${detail}` : state; row.process.disabled = !row.file || activeCandidate !== null; }
function nextRequest(): { requestId: number; generation: number } { requestId += 1; return { requestId, generation }; }
function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./astraLargeCandidate.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<LargeCandidateWorkerMessage>) => handleWorkerMessage(event.data);
    worker.onerror = (event) => fail(`Worker failed: ${event.message}`);
  }
  return worker;
}
function send<T extends LargeCandidateWorkerMessage["type"]>(command: LargeCandidateCommand, expected: T): Promise<Extract<LargeCandidateWorkerMessage, { type: T }>> {
  const instance = ensureWorker();
  return new Promise<LargeCandidateWorkerMessage>((resolve, reject) => {
    pending.set(command.requestId, { resolve: resolve as (message: LargeCandidateWorkerMessage) => void, reject });
    instance.postMessage(command);
  }).then((message: LargeCandidateWorkerMessage) => {
    if (message.type === "ERROR") throw new Error(message.message);
    if (message.type !== expected) throw new Error(`Worker protocol expected ${expected}, received ${message.type}`);
    return message as Extract<LargeCandidateWorkerMessage, { type: T }>;
  });
}
function handleWorkerMessage(message: LargeCandidateWorkerMessage): void {
  if (!isLargeCandidateMessageCurrent(message.generation, generation)) return;
  if (message.type === "PROGRESS") { progress.textContent = `${message.stage}${message.detail ? ` · ${message.detail}` : ""}${message.completed !== undefined && message.total !== undefined ? ` · ${message.completed.toLocaleString()} / ${message.total.toLocaleString()}` : ""}`; return; }
  if (message.type === "REFERENCE_READY") { rabbitReady = message.signedVolume === "AVAILABLE"; reference.textContent = [`source hash: ${message.sourceSha256}`, `repair fingerprint: ${message.repairFingerprint}`, `Signed Volume: ${message.signedVolume}`, "printable: false", "transform: 1 mm/source-unit · +Y · right-handed · uniformScale 20", "role: forbidden volume authority"].join("\n"); status.textContent = "Rabbit Reference Host ready in Worker."; return; }
  const waiter = pending.get(message.requestId); if (!waiter) return; pending.delete(message.requestId); if (message.type === "ERROR") waiter.reject(new Error(message.message)); else waiter.resolve(message);
}
function fail(message: string): void { status.className = "status error"; status.textContent = message; }
function refreshActive(): void { activeLabel.textContent = `Active Candidate: ${activeCandidate ?? "none"}`; document.querySelectorAll<HTMLButtonElement>(".candidate button").forEach((button) => { button.disabled = activeCandidate !== null; }); document.querySelector<HTMLButtonElement>("#cancel")!.disabled = activeCandidate === null; }
function refreshTable(): void {
  table.innerHTML = `<table><thead><tr><th>Candidate</th><th>Source</th><th>State / topology</th><th>Diagnostics</th><th>Support</th><th>3MF / telemetry</th></tr></thead><tbody>${[...rows.values()].map((row) => { const summary = row.summary; const inventory = row.inventory; const d = summary?.diagnostics; const s = summary?.support; const e = summary?.export; return `<tr><th>${row.id}</th><td>${inventory ? `${inventory.filename}<br>${inventory.sourceByteLength.toLocaleString()} bytes<br>${inventory.sourceSha256.slice(0, 16)}…<br>${inventory.triangleCount.toLocaleString()} triangles` : row.file ? "file reference retained" : "—"}</td><td>${row.state}<br>${inventory ? `SKIN_RUNTIME_TOPOLOGY=${inventory.topologyStatus}<br>ASTRA_ROUND2_EVIDENCE=${inventory.astraRound2Evidence}<br>finite=${inventory.finite}<br>degenerate=${inventory.degenerateTriangleCount}` : "—"}</td><td>${d ? `faces ${d.overhangFaces?.toLocaleString()}<br>regions ${d.overhangRegions}<br>outside ${d.outside?.toLocaleString()}<br>inside ${d.insideExcluded?.toLocaleString()}<br>unresolved ${d.unresolved?.toLocaleString()}` : "—"}</td><td>${s ? `critical ${s.critical}<br>supported ${s.supported}<br>unsupported ${s.unsupported}<br>BODY reject ${s.bodyReject}<br>Rabbit reject ${s.rabbitReject}<br>vertical ${s.vertical}<br>offset-bend ${s.offsetBend}<br>nodes ${s.nodes}<br>edges ${s.edges}<br>accepted BODY ${s.acceptedBodyCollision}<br>accepted Rabbit ${s.acceptedRabbitCollision}` : "—"}</td><td>${e ? `validator ${e.validator}<br>${e.archiveBytes.toLocaleString()} bytes<br>support ${e.supportTriangleCount.toLocaleString()} faces` : "—"}<br>${summary ? `typed resident ${summary.telemetry.residentTypedArrayBytes.toLocaleString()} bytes<br>largest ${summary.telemetry.largestTypedArrayBytes.toLocaleString()} bytes<br>heap ${summary.telemetry.peakJsHeapBytes === null ? "telemetry unavailable" : summary.telemetry.peakJsHeapBytes.toLocaleString()}` : "—"}</td></tr>`; }).join("")}</tbody></table>`;
  refreshActive();
}
function readSettings(): { threshold: number; clearance: number } { const threshold = Number(thresholdInput.value); const clearance = Number(clearanceInput.value); if (!Number.isFinite(threshold) || threshold < 30 || threshold > 65) throw new Error("Overhang threshold must be 30–65 degrees"); if (!Number.isFinite(clearance) || clearance < 0) throw new Error("Host clearance must be non-negative"); return { threshold, clearance }; }
async function loadRabbit(file: Blob, filename: string): Promise<void> { const data = nextRequest(); rabbitReady = false; status.textContent = "Loading Rabbit into Worker…"; await send({ type: "LOAD_REFERENCE_HOST", ...data, filename, file }, "REFERENCE_READY"); }
async function scanRow(row: Row): Promise<LargeCandidateInventory> { if (!row.file) throw new Error(`${row.id} file is not selected`); const data = nextRequest(); const result = await send({ type: "INVENTORY_CANDIDATE", ...data, candidateId: row.id, filename: row.file.name, file: row.file }, "INVENTORY"); row.inventory = result.inventory; setRowState(row, "READY", `${result.inventory.triangleCount.toLocaleString()} triangles · hash verified`); refreshTable(); return result.inventory; }
async function ensureInventories(): Promise<void> { for (const row of rows.values()) if (row.file && !row.inventory) await scanRow(row); const inventories = [...rows.values()].filter((row) => row.inventory).map((row) => row.inventory!); if (inventories.length > 0) commonTranslationZ = -Math.min(...inventories.map((inventory) => inventory.bounds.min.z)); }
async function processRow(row: Row): Promise<void> {
  if (!row.file) return;
  if (activeCandidate) throw new Error("Another Candidate is active");
  const settings = readSettings(); await ensureInventories(); if (!rabbitReady) throw new Error("Load Rabbit into Worker first"); if (commonTranslationZ === null) throw new Error("Candidate inventory is not ready");
  activeCandidate = row.id; setRowState(row, "ACTIVE"); refreshActive(); generation += 1;
  try {
    const activated = await send({ type: "ACTIVATE_CANDIDATE", ...nextRequest(), candidateId: row.id, filename: row.file.name, file: row.file, translationZ: commonTranslationZ }, "INVENTORY");
    row.inventory = activated.inventory; setRowState(row, "PROCESSING", "packed geometry active"); refreshTable();
    const diagnostics = await send({ type: "DIAGNOSE", ...nextRequest(), candidateId: row.id, sourceSha256: activated.sourceSha256, geometryFingerprint: activated.geometryFingerprint, settings: { overhangThresholdDeg: settings.threshold, plateFloorMm: 0, plateBandMm: ASTRA_COMMON_SUPPORT_SETTINGS.plateBandMm } }, "DIAGNOSTICS");
    row.summary = diagnostics.summary; const support = await send({ type: "BUILD_SUPPORT", ...nextRequest(), candidateId: row.id, sourceSha256: diagnostics.summary.sourceSha256, geometryFingerprint: diagnostics.summary.geometryFingerprint, diagnosticsFingerprint: diagnostics.summary.diagnosticsFingerprint!, settings: { ...ASTRA_COMMON_SUPPORT_SETTINGS, overhangThresholdDeg: settings.threshold, hostClearanceMm: settings.clearance } }, "SUPPORT");
    row.summary = support.summary; const exported = await send({ type: "EXPORT_3MF", ...nextRequest(), candidateId: row.id, sourceSha256: support.summary.sourceSha256, geometryFingerprint: support.summary.geometryFingerprint, supportFingerprint: support.summary.supportFingerprint! }, "EXPORT");
    const archive = exported.summary.export?.archive; if (!archive) throw new Error("Worker export did not return an archive");
    const downloadUrl = URL.createObjectURL(new Blob([archive], { type: "model/3mf" })); const link = document.createElement("a"); link.href = downloadUrl; link.download = `ASTRA_${row.id}_candidate-print-lane.3mf`; link.click(); URL.revokeObjectURL(downloadUrl);
    const compactExport = exported.summary.export ? { archiveBytes: exported.summary.export.archiveBytes, supportTriangleCount: exported.summary.export.supportTriangleCount, validator: exported.summary.export.validator, exportFingerprint: exported.summary.export.exportFingerprint } : undefined;
    row.summary = { ...exported.summary, ...(compactExport ? { export: compactExport as never } : {}) }; setRowState(row, "DONE", "3MF downloaded and validated"); refreshTable();
    const released = await send({ type: "RELEASE_CANDIDATE", ...nextRequest(), candidateId: row.id, sourceSha256: exported.summary.sourceSha256, geometryFingerprint: exported.summary.geometryFingerprint }, "RELEASED");
    setRowState(row, "RELEASED", `${released.releasedTypedArrayBytes.toLocaleString()} typed-array bytes released`); activeCandidate = null; refreshTable(); status.textContent = `${row.id} complete: download, validation and release PASS.`;
  } catch (error) { setRowState(row, "BLOCKED", error instanceof Error ? error.message : String(error)); activeCandidate = null; refreshTable(); fail(`${row.id} blocked: ${error instanceof Error ? error.message : String(error)}`); }
}
async function processAll(): Promise<void> { try { for (const row of rows.values()) if (row.file) await processRow(row); } catch (error) { fail(error instanceof Error ? error.message : String(error)); } }
function cancelActive(): void { if (!activeCandidate) return; generation += 1; for (const waiter of pending.values()) waiter.reject(new Error("Cancelled by author")); pending.clear(); worker?.terminate(); worker = null; rabbitReady = false; const row = rows.get(activeCandidate); if (row) setRowState(row, "BLOCKED", "cancelled; reload Rabbit before retry"); activeCandidate = null; refreshTable(); fail("Worker cancelled and released by termination. Rabbit must be loaded again."); }

document.querySelector<HTMLInputElement>("#rabbit")!.addEventListener("change", () => { const file = rabbitInput.files?.[0]; if (file) void loadRabbit(file, file.name).catch((error) => fail(`Rabbit load failed: ${error instanceof Error ? error.message : String(error)}`)); });
document.querySelector<HTMLButtonElement>("#load-rabbit")!.addEventListener("click", async () => { try { const response = await fetch("/__phase5/rabbit_230223.stl", { cache: "no-store" }); if (!response.ok) throw new Error(`Rabbit route returned HTTP ${response.status}`); await loadRabbit(await response.blob(), "rabbit_230223.stl"); } catch (error) { fail(`Rabbit load failed: ${error instanceof Error ? error.message : String(error)}`); } });
document.querySelector<HTMLButtonElement>("#scan")!.addEventListener("click", () => { void ensureInventories().then(() => { status.textContent = "Inventory scan complete. Candidate bytes remain Worker-owned only during processing."; }).catch((error) => fail(error instanceof Error ? error.message : String(error))); });
document.querySelector<HTMLButtonElement>("#process-all")!.addEventListener("click", () => { void processAll(); });
document.querySelector<HTMLButtonElement>("#cancel")!.addEventListener("click", cancelActive);
const originalError = console.error.bind(console); const originalWarn = console.warn.bind(console); console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); originalError(...args); refreshConsole(); }; console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); originalWarn(...args); refreshConsole(); };
window.addEventListener("error", (event) => { errors.push(event.message); refreshConsole(); }); window.addEventListener("unhandledrejection", (event) => { errors.push(String(event.reason)); refreshConsole(); });
function refreshConsole(): void { consolePanel.textContent = `console errors: ${errors.length}${errors.length ? `\n${errors.slice(-3).join("\n")}` : ""}\nconsole warnings: ${warnings.length}${warnings.length ? `\n${warnings.slice(-3).join("\n")}` : ""}`; }
refreshTable(); refreshConsole();

import { applyApprovedBoundaryRepair, APPROVED_USAGI_BOUNDARY_LOOPS, USAGI_REPAIR_POLICY_VERSION } from "./externalStlHostRepair.ts";
import { ASTRA_CANDIDATE_FILENAMES, ASTRA_COMMON_SUPPORT_SETTINGS, ASTRA_RABBIT_REPAIR_FINGERPRINT, ASTRA_RABBIT_SOURCE_SHA256, applyCommonCandidatePrintTransform, buildArtworkCandidateSupport, candidatePreflight, deriveCommonCandidatePrintTransform, diagnoseArtworkCandidate, exportArtworkCandidate3mf, evaluateCandidatePipelineCurrentness, loadArtworkCandidate, makeRabbitForbiddenSdf, type AstraCandidateId, type ArtworkCandidateSnapshot, type CandidateDiagnostics, type CandidateExportResult, type CandidateSupportResult } from "./astraCandidatePrintLane.ts";
import { createImportedHostInstance, createImportedHostSource, type ImportedHostInstance } from "./externalStlHost.ts";

type Row = { id: AstraCandidateId; input: HTMLInputElement; status: HTMLElement; snapshot: ArtworkCandidateSnapshot | null; diagnostics: CandidateDiagnostics | null; support: CandidateSupportResult | null; exported: CandidateExportResult | null };
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Astra candidate lane root is missing");
app.innerHTML = `<aside><h1>SKIN · Astra Round 2 physical comparison</h1><p>Bounded lane for imported Permanent Artwork BODY meshes. A/G/H/J remain peers; this lab never selects a winner or changes artwork.</p><h2>Reference Host</h2><label>Rabbit STL <input id="rabbit" type="file" accept=".stl,model/stl"></label><button id="load-rabbit" type="button">Load exact local Rabbit source</button><pre id="reference" class="meta">Rabbit Reference Host not loaded.</pre><h2>Candidates</h2><div id="candidates"></div><h2>Common settings</h2><label>Overhang threshold (deg) <input id="threshold" type="number" value="45" min="30" max="65" step="1"></label><label>Rabbit Host clearance (mm) <input id="clearance" type="number" value="0" min="0" max="5" step="0.1"></label><div class="meta">source +Z · common lowest point to plate Z=0 · shaft 1.6 mm · neck 0.6 mm · gap 0.35 mm · Rabbit inside FORBIDDEN</div><div class="row"><button id="diagnose" type="button">Diagnose All</button><button id="support" type="button">Build Support All</button></div><p id="status" class="status">Load Rabbit and the four actual Round 2 *_BODY.stl files.</p><pre id="console" class="meta">console errors: 0\nconsole warnings: 0</pre><p>No winner badge · no ranking · no production SKIN integration · no main merge · no deploy.</p></aside><main><h2>Comparison table</h2><div id="table"></div></main>`;

const rabbitInput = document.querySelector<HTMLInputElement>("#rabbit")!;
const reference = document.querySelector<HTMLElement>("#reference")!;
const status = document.querySelector<HTMLElement>("#status")!;
const table = document.querySelector<HTMLElement>("#table")!;
const consolePanel = document.querySelector<HTMLElement>("#console")!;
const thresholdInput = document.querySelector<HTMLInputElement>("#threshold")!;
const clearanceInput = document.querySelector<HTMLInputElement>("#clearance")!;
const rows = new Map<AstraCandidateId, Row>();
let repairedHost: ImportedHostInstance | null = null;
let commonTransform: ArtworkCandidateSnapshot["sourceTransform"] | null = null;
const errors: string[] = [];
const warnings: string[] = [];
for (const id of ["A", "G", "H", "J"] as const) rows.set(id, makeRow(id));

function makeRow(id: AstraCandidateId): Row {
  const wrapper = document.createElement("section");
  wrapper.className = "candidate";
  wrapper.innerHTML = `<strong>${id}</strong> <span>${ASTRA_CANDIDATE_FILENAMES[id]}</span> <span class="row-status">not loaded</span><input type="file" accept=".stl,model/stl"><button type="button" disabled>Export 3MF</button>`;
  document.querySelector<HTMLDivElement>("#candidates")!.append(wrapper);
  const input = wrapper.querySelector<HTMLInputElement>("input")!;
  const rowStatus = wrapper.querySelector<HTMLElement>(".row-status")!;
  const exportButton = wrapper.querySelector<HTMLButtonElement>("button")!;
  const row: Row = { id, input, status: rowStatus, snapshot: null, diagnostics: null, support: null, exported: null };
  input.addEventListener("change", () => { const file = input.files?.[0]; if (file) void loadCandidate(row, file); });
  exportButton.addEventListener("click", () => { void exportCandidate(row); });
  return row;
}

document.querySelector<HTMLButtonElement>("#load-rabbit")!.addEventListener("click", () => { void loadRabbitRoute(); });
rabbitInput.addEventListener("change", () => { const file = rabbitInput.files?.[0]; if (file) void loadRabbit(file); });
document.querySelector<HTMLButtonElement>("#diagnose")!.addEventListener("click", () => { void diagnoseAll(); });
document.querySelector<HTMLButtonElement>("#support")!.addEventListener("click", () => { void supportAll(); });
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);
console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); originalError(...args); refreshConsole(); };
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); originalWarn(...args); refreshConsole(); };
window.addEventListener("error", (event) => { errors.push(event.message); refreshConsole(); });
window.addEventListener("unhandledrejection", (event) => { errors.push(String(event.reason)); refreshConsole(); });

async function loadRabbitRoute(): Promise<void> {
  try { status.textContent = "Reading exact local Rabbit source…"; const response = await fetch("/__phase5/rabbit_230223.stl", { cache: "no-store" }); if (!response.ok) throw new Error(`Rabbit route returned HTTP ${response.status}`); await activateRabbit(await response.arrayBuffer(), "rabbit_230223.stl"); }
  catch (error) { fail(`Rabbit load failed: ${error instanceof Error ? error.message : String(error)}`); }
}
async function loadRabbit(file: File): Promise<void> { try { await activateRabbit(await file.arrayBuffer(), file.name); } catch (error) { fail(`Rabbit load failed: ${error instanceof Error ? error.message : String(error)}`); } }
async function activateRabbit(bytes: ArrayBuffer, filename: string): Promise<void> {
  const source = await createImportedHostSource(bytes, { filename, interpretation: { unitStatus: "explicit", mmPerSourceUnit: 1, upAxis: "y", handedness: "right", importPolicyVersion: "stl-host-v0" } });
  if (source.sourceIdentity.sha256 !== ASTRA_RABBIT_SOURCE_SHA256) throw new Error(`Unexpected Rabbit SHA-256 ${source.sourceIdentity.sha256}`);
  const original = createImportedHostInstance(source, { translation: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], uniformScale: 20 });
  const repaired = await applyApprovedBoundaryRepair(original, { originalSourceSha256: ASTRA_RABBIT_SOURCE_SHA256, repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION, approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS });
  if (repaired.materialization.repairedFingerprint !== ASTRA_RABBIT_REPAIR_FINGERPRINT) throw new Error("Rabbit repair fingerprint mismatch");
  repairedHost = repaired.repaired;
  const topology = repairedHost.volumePreflight.diagnostics.topology;
  reference.textContent = [`source hash: ${ASTRA_RABBIT_SOURCE_SHA256}`, `repair fingerprint: ${ASTRA_RABBIT_REPAIR_FINGERPRINT}`, `Signed Volume: ${repairedHost.signedVolumeQuery ? "AVAILABLE" : "UNAVAILABLE"}`, `triangles: ${topology.triangleCount.toLocaleString()}`, "printable: false", "transform: 1 mm/source-unit · +Y · right-handed · uniformScale 20", "role: forbidden volume authority"].join("\n");
  status.textContent = "Rabbit Reference Host ready.";
}
async function loadCandidate(row: Row, file: File): Promise<void> {
  row.status.textContent = "loading exact bytes…";
  try { row.snapshot = await loadArtworkCandidate(row.id, await file.arrayBuffer(), file.name); row.diagnostics = null; row.support = null; row.exported = null; row.status.textContent = `${row.snapshot.sourceByteLength.toLocaleString()} bytes · ${row.snapshot.topologyFacts.triangleCount.toLocaleString()} triangles · Signed Volume ${row.snapshot.signedVolumeCapability}`; refreshTable(); }
  catch (error) { row.snapshot = null; row.status.textContent = `BLOCKED: ${error instanceof Error ? error.message : String(error)}`; refreshTable(); }
}
function readSettings(): { threshold: number; clearance: number } { const threshold = Number(thresholdInput.value); const clearance = Number(clearanceInput.value); if (!Number.isFinite(threshold) || threshold < 30 || threshold > 65) throw new Error("Overhang threshold must be 30–65 degrees"); if (!Number.isFinite(clearance) || clearance < 0) throw new Error("Host clearance must be non-negative"); return { threshold, clearance }; }
async function diagnoseAll(): Promise<void> {
  try { const snapshots = [...rows.values()].map((row) => row.snapshot); if (snapshots.some((snapshot) => !snapshot)) throw new Error("Load A, G, H and J before Diagnose All"); commonTransform = deriveCommonCandidatePrintTransform(snapshots as ArtworkCandidateSnapshot[]); const settings = readSettings(); for (const row of rows.values()) { row.snapshot = await applyCommonCandidatePrintTransform(row.snapshot!, commonTransform); row.diagnostics = await diagnoseArtworkCandidate(row.snapshot!, { overhangThresholdDeg: settings.threshold, plateFloorMm: 0, plateBandMm: ASTRA_COMMON_SUPPORT_SETTINGS.plateBandMm }); row.support = null; row.exported = null; row.status.textContent = row.diagnostics.preflight.blocked ? `BLOCKED: ${row.diagnostics.preflight.blockReason ?? "preflight"}` : `diagnosed · outside ${row.diagnostics.outsideFaces.toLocaleString()} / regions ${row.diagnostics.overhangRegions}`; refreshTable(); } status.textContent = `Diagnose All complete. Common Z translation ${commonTransform.translationMm.z.toFixed(4)} mm. No winner selected.`; }
  catch (error) { fail(`Diagnose All failed closed: ${error instanceof Error ? error.message : String(error)}`); }
}
async function supportAll(): Promise<void> {
  try { if (!repairedHost?.signedVolumeQuery) throw new Error("Load the Rabbit Reference Host first"); const settings = readSettings(); for (const row of rows.values()) { if (!row.snapshot || !row.diagnostics) throw new Error(`Diagnose ${row.id} first`); const hostSdf = makeRabbitForbiddenSdf((point) => repairedHost!.signedVolumeQuery!.signedDistance(point), commonTransform ?? row.snapshot.sourceTransform); row.support = await buildArtworkCandidateSupport(row.snapshot, row.diagnostics, hostSdf, { ...ASTRA_COMMON_SUPPORT_SETTINGS, overhangThresholdDeg: settings.threshold, hostClearanceMm: settings.clearance }); row.exported = null; row.status.textContent = `supports ${row.support.sparse.diagnostics.generatedSupportCount} · unsupported ${row.support.sparse.diagnostics.unsupportedTargetCount} · Rabbit rejects ${row.support.sparse.diagnostics.rejectedByForbiddenVolume}`; refreshTable(); } status.textContent = "Build Support All complete. BODY and Rabbit forbidden-volume checks remain separate."; }
  catch (error) { fail(`Build Support All failed closed: ${error instanceof Error ? error.message : String(error)}`); }
}
async function exportCandidate(row: Row): Promise<void> {
  try { if (!row.snapshot || !row.support) throw new Error(`Build Support ${row.id} first`); const settings = readSettings(); const current = evaluateCandidatePipelineCurrentness(row.snapshot, row.diagnostics, row.support, row.exported, { ...ASTRA_COMMON_SUPPORT_SETTINGS, overhangThresholdDeg: settings.threshold, hostClearanceMm: settings.clearance }); if (!current.supportCurrent) throw new Error(`Candidate ${row.id} Support is stale; rerun Build Support All after settings or candidate changes`); row.status.textContent = "building and validating 3MF…"; row.exported = await exportArtworkCandidate3mf(row.snapshot, row.support); if (!row.exported.validation.valid) throw new Error(row.exported.validation.errors.join("; ") || "3MF validator failed"); const blob = new Blob([row.exported.archive], { type: "model/3mf" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `ASTRA_${row.id}_candidate-print-lane.3mf`; link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 0); row.status.textContent = `3MF PASS · ${row.exported.stats.archiveBytes.toLocaleString()} bytes`; refreshTable(); }
  catch (error) { row.status.textContent = `EXPORT BLOCKED: ${error instanceof Error ? error.message : String(error)}`; refreshTable(); }
}
function refreshTable(): void {
  table.innerHTML = `<table><thead><tr><th>Candidate</th><th>Source</th><th>Preflight</th><th>Diagnostics</th><th>Support</th><th>3MF</th></tr></thead><tbody>${[...rows.values()].map((row) => { const candidate = row.snapshot; const diagnostics = row.diagnostics; const support = row.support?.sparse.diagnostics; const exported = row.exported; const preflight = candidate ? candidatePreflight(candidate) : null; return `<tr><th>${row.id}</th><td>${candidate ? `${candidate.sourceFilename}<br>${candidate.sourceByteLength.toLocaleString()} bytes<br>${candidate.sourceSha256.slice(0, 16)}…<br>${candidate.topologyFacts.triangleCount.toLocaleString()} triangles` : "—"}</td><td>${preflight ? (preflight.blocked ? `BLOCKED<br>${preflight.blockReason ?? ""}` : "PASS") : "—"}</td><td>${diagnostics ? `faces ${diagnostics.overhangFaces.toLocaleString()}<br>regions ${diagnostics.overhangRegions}<br>outside ${diagnostics.outsideFaces.toLocaleString()}<br>inside ${diagnostics.insideExcludedFaces.toLocaleString()}<br>unresolved ${diagnostics.unresolvedFaces.toLocaleString()}` : "—"}</td><td>${support ? `targets ${support.criticalTargetCount}<br>generated ${support.generatedSupportCount}<br>unsupported ${support.unsupportedTargetCount}<br>BODY reject ${support.rejectedByBody}<br>Rabbit reject ${support.rejectedByForbiddenVolume}<br>accepted BODY ${support.acceptedBodyCollisionCount}<br>accepted Rabbit ${support.acceptedForbiddenCollisionCount}` : "—"}</td><td>${exported ? `validator ${exported.validation.valid ? "PASS" : "FAIL"}<br>${exported.stats.archiveBytes.toLocaleString()} bytes<br>BODY ${exported.stats.bodyFaces.toLocaleString()} faces<br>Support ${exported.supportTriangleCount.toLocaleString()} faces` : "—"}</td></tr>`; }).join("")}</tbody></table>`;
  for (const row of rows.values()) { const button = document.querySelector<HTMLButtonElement>(`#candidates section:nth-child(${[...rows.keys()].indexOf(row.id) + 1}) button`); if (button) button.disabled = !row.support; }
}
function fail(message: string): void { status.className = "status error"; status.textContent = message; }
function refreshConsole(): void { consolePanel.textContent = `console errors: ${errors.length}${errors.length ? `\n${errors.slice(-3).join("\n")}` : ""}\nconsole warnings: ${warnings.length}${warnings.length ? `\n${warnings.slice(-3).join("\n")}` : ""}`; }
refreshTable();
refreshConsole();

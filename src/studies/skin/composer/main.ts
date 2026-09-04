import "./style.css";
import { loadBundledComposerSource, loadComposerSourceFromFile, type ComposerSource } from "./source/fkeiLoader.ts";
import { ComposerRuntime } from "./runtime/composerRuntime.ts";
import { DEFAULT_COMPOSER_STATE, mergeComposerState, type ComposerState, type ComposerStatePatch } from "./runtime/state.ts";
import { parseComposerState, serializeComposerState } from "./runtime/urlState.ts";
import { ARCHIVE_COMPOSER_PRESETS } from "./presets/archivePresets.ts";
import { downloadComposerManifest, loadComposerPreset, saveComposerPreset } from "./presets/presetIO.ts";

const composerRoot = document.getElementById("skin-art-composer");
if (!composerRoot) throw new Error("SKIN ART Composer root is missing");
const root: HTMLElement = composerRoot;

let state = parseComposerState(window.location.search);
const requestedPreset = new URLSearchParams(window.location.search).get("preset");
if (requestedPreset && ARCHIVE_COMPOSER_PRESETS[requestedPreset]) state = mergeComposerState(state, ARCHIVE_COMPOSER_PRESETS[requestedPreset]!);
let runtime: ComposerRuntime | null = null;
let source: ComposerSource | null = null;
let lastFrameBucket = -1;

const range = (path: string, label: string, min = 0, max = 1, step = 0.01): string => `<label class="composer-control"><span>${label}<output data-value-for="${path}"></output></span><input type="range" data-control="${path}" min="${min}" max="${max}" step="${step}"></label>`;
const select = (path: string, label: string, options: readonly string[]): string => `<label class="composer-control"><span>${label}</span><select data-control="${path}">${options.map((option) => `<option value="${option}">${option}</option>`).join("")}</select></label>`;
const section = (title: string, content: string, open = true): string => `<section class="composer-section" data-section="${title.toLowerCase().replace(/[^a-z]+/g, "-")}" data-collapsed="${open ? "false" : "true"}"><button type="button" class="composer-section-title" data-action="toggle-section" aria-expanded="${open}"><span>${title}</span><span>＋</span></button><div class="composer-section-body">${content}</div></section>`;

function renderShell(): void {
  root.innerHTML = `<div class="composer-shell"><div class="composer-stage" data-composer-stage></div><aside class="composer-inspector" data-composer-inspector><header class="composer-inspector-head"><div><a href="/skin-art/" class="composer-brand">SKIN ART / COMPOSER</a><span class="composer-kicker">FKEI → SOURCE ANALYSIS → VISUAL MODULES → LIGHT / CAMERA / TIME</span></div><button type="button" data-action="presentation">PRESENTATION</button></header><div class="composer-status" data-status>READING SOURCE</div>${section("SOURCE", `<div class="composer-source-actions"><button type="button" data-action="load-file">LOAD FKEI</button><button type="button" data-action="load-sample">USE FIRST PRINT</button><button type="button" data-action="reset-source">RESET SOURCE</button><input type="file" data-file-input accept=".fkei,.json,application/json" hidden></div><div class="composer-dropzone" data-dropzone>DROP FKEI HERE</div><div class="composer-source-state" data-source-state>SOURCE / LOADING</div><div class="composer-stats" data-stats>—</div>`, true)}${section("VISUAL MODULES", `${range("visual.points", "POINTS", 0, 1)}${range("visual.gaussian", "GAUSSIAN", 0, 1)}${range("visual.hairlines", "HAIRLINES", 0, 1)}${range("visual.softLines", "SOFT LINES", 0, 1)}${range("visual.cloud", "CLOUD", 0, 1)}${range("visual.light", "LIGHT", 0, 1)}${range("visual.void", "VOID", 0, 1)}`, true)}${section("MOTION", `${range("motion.drift", "DRIFT", 0, 1)}${range("motion.wave", "WAVE", 0, 1)}${range("motion.growth", "GROWTH", 0, 1)}${range("motion.tremor", "TREMOR", 0, 1)}${range("motion.accumulation", "ACCUMULATION", 0, 1)}${range("motion.oscillation", "OSCILLATION", 0, 1)}`, false)}${section("SPACE", `${range("space.depthSpread", "DEPTH SPREAD", 0, 2, 0.01)}${range("space.foregroundScale", "FOREGROUND SCALE", 0.5, 2, 0.01)}${range("space.backgroundScale", "BACKGROUND SCALE", 0.4, 1.5, 0.01)}${range("space.focusDisorder", "FOCUS DISORDER", 0, 1)}${range("space.spatialEcho", "SPATIAL ECHO", 0, 1)}${range("space.parallax", "PARALLAX", 0, 1)}${range("space.voidRetention", "VOID RETENTION", 0, 1)}`, false)}${section("CAMERA", `${select("camera.mode", "MODE", ["MANUAL", "DRIFT", "EXPLORE"])}${range("camera.dolly", "DOLLY", 0, 1)}${range("camera.orbit", "ORBIT", 0, 1)}${range("camera.targetShift", "TARGET SHIFT", 0, 1)}${range("camera.passThrough", "PASS THROUGH", 0, 1)}${range("camera.fov", "FOV", 28, 75, 1)}<div class="composer-inline-actions"><button type="button" data-action="reset-camera">RESET CAMERA</button></div>`, false)}${section("COLOR", `${select("color.palette", "PALETTE", ["rich", "red", "blue", "monochrome"])}${range("color.saturation", "SATURATION", 0, 1)}${range("color.localContrast", "LOCAL CONTRAST", 0, 1)}${range("color.highlight", "HIGHLIGHT", 0, 1)}${range("color.blackRetention", "BLACK RETENTION", 0, 1)}${select("color.source", "COLOR SOURCE", ["MOTIF", "DENSITY", "CONNECTIVITY", "DIRECTION", "SUPPORT"])}`, false)}${section("PRESETS / CAPTURE", `<label class="composer-control"><span>ARCHIVE START</span><select data-preset><option value="">SELECT SOURCE GRAMMAR</option>${Object.keys(ARCHIVE_COMPOSER_PRESETS).map((key) => `<option value="${key}">${key.toUpperCase()}</option>`).join("")}</select></label><div class="composer-action-grid"><button type="button" data-action="save-preset">SAVE PRESET</button><button type="button" data-action="load-preset">LOAD PRESET</button><button type="button" data-action="copy-link">COPY LINK</button><button type="button" data-action="reset">RESET MIX</button><button type="button" data-action="png">PNG</button><button type="button" data-action="manifest">PNG + MANIFEST</button><button type="button" data-action="webm">WEBM</button><button type="button" data-action="play">PAUSE</button><button type="button" data-action="restart">RESTART</button></div></section>`, false)}<footer class="composer-footer"><span>FKEI IS READ-ONLY / PRESENTATION LAYER</span><span>PRESS TAB TO HIDE PANEL</span></footer></aside></div>`;
  syncControls();
  bindShell();
}

function valueAt(path: string): number | string {
  const [group, key] = path.split(".") as [keyof ComposerState, string];
  const groupValue = state[group] as unknown as Record<string, number | string>;
  return groupValue[key] ?? "";
}

function syncControls(): void {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-control]").forEach((control) => { const value = valueAt(control.dataset.control!); control.value = String(value); const output = root.querySelector<HTMLOutputElement>(`[data-value-for="${control.dataset.control}"]`); if (output) output.value = typeof value === "number" ? value.toFixed(2) : String(value); });
}

function updateControl(path: string, rawValue: string): void {
  const [group, key] = path.split(".") as [keyof ComposerState, string];
  const current = valueAt(path);
  const value = typeof current === "number" ? Number(rawValue) : rawValue;
  state = mergeComposerState(state, { [group]: { [key]: value } } as ComposerStatePatch);
  runtime?.setState(state);
  const output = root.querySelector<HTMLOutputElement>(`[data-value-for="${path}"]`); if (output) output.value = typeof value === "number" ? value.toFixed(2) : String(value);
}

function setStatus(message: string, error = false): void { const status = root.querySelector<HTMLElement>("[data-status]"); if (status) { status.textContent = message; status.dataset.error = String(error); } }
function downloadBlob(blob: Blob, filename: string): void { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function manifest(): Record<string, unknown> { const manifestState = runtime?.stateData() ?? state; return { format: "katachi.skin-art.composer.v1", sourceFingerprint: source?.fingerprint ?? "unavailable", seed: manifestState.seed, state: manifestState, timeSeconds: runtime?.timeSeconds ?? 0, camera: runtime?.cameraData() ?? null, budget: runtime?.budgetData ?? null }; }

async function capturePng(withManifest: boolean): Promise<void> { if (!runtime) return; runtime.renderNow(); const blob = await new Promise<Blob>((resolve, reject) => runtime!.canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG capture returned an empty blob")), "image/png")); downloadBlob(blob, `skin-art-composer_${state.color.palette}_${state.seed}.png`); if (withManifest) downloadComposerManifest(manifest(), `skin-art-composer_${state.color.palette}_${state.seed}.json`); setStatus(withManifest ? "CAPTURED / PNG + MANIFEST" : "CAPTURED / PNG"); }

async function captureWebm(): Promise<void> { if (!runtime || typeof MediaRecorder === "undefined" || typeof runtime.canvas.captureStream !== "function") { setStatus("WEBM UNSUPPORTED / PNG AVAILABLE", true); return; } const chunks: Blob[] = []; const recorder = new MediaRecorder(runtime.canvas.captureStream(30)); recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); }; const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); }); recorder.start(); setStatus("RECORDING / WEBM / 4S"); window.setTimeout(() => recorder.stop(), 4000); await stopped; downloadBlob(new Blob(chunks, { type: recorder.mimeType || "video/webm" }), `skin-art-composer_${state.color.palette}_${state.seed}.webm`); setStatus("CAPTURED / WEBM"); }

async function loadSource(loader: Promise<ComposerSource>, label: string): Promise<void> { setStatus(`READING ${label}`); root.querySelector<HTMLElement>("[data-source-state]")!.textContent = "SOURCE / LOADING"; try { const loaded = await loader; runtime?.dispose(); source = loaded; runtime = new ComposerRuntime(root.querySelector<HTMLElement>("[data-composer-stage]")!, source, state, (frame) => { const bucket = Math.floor(frame.elapsedSeconds * 4); if (bucket !== lastFrameBucket) { lastFrameBucket = bucket; const status = root.querySelector<HTMLElement>("[data-status]"); if (status && !status.dataset.error) status.textContent = `LIVE / ${frame.elapsedSeconds.toFixed(1)}S / ${source!.fingerprint}`; } }); renderSourceStats(); setStatus(`READY / ${loaded.fingerprint}`); } catch (error) { setStatus(`SOURCE UNAVAILABLE / ${error instanceof Error ? error.message : String(error)}`, true); root.querySelector<HTMLElement>("[data-source-state]")!.textContent = "SOURCE / UNSUPPORTED"; } }

function renderSourceStats(): void { if (!source) return; const stats = source.statistics; root.querySelector<HTMLElement>("[data-source-state]")!.textContent = `VALID / ${source.fingerprint}`; root.querySelector<HTMLElement>("[data-stats]")!.innerHTML = `<span>${stats.nodeCount} NODES</span><span>${stats.edgeCount} EDGES</span><span>${stats.motifCount} MOTIFS</span><span>AVG EDGE ${stats.averageEdgeLength.toFixed(2)}</span><span>DENSITY ${stats.densityMean.toFixed(2)} / ±${Math.sqrt(stats.densityVariance).toFixed(2)}</span><span>MAX CONNECTIVITY ${stats.maxConnectivity.toFixed(2)}</span><span>SUPPORT ${stats.supportMean.toFixed(2)}</span><span>DIRECTION CHANGE ${stats.directionChangeMean.toFixed(2)}</span><span>BUDGET ${runtime?.budgetData.complexityScale.toFixed(2) ?? "—"}×</span>`; }

function togglePanel(): void { root.dataset.panel = root.dataset.panel === "hidden" ? "open" : "hidden"; }
function applyState(next: ComposerState): void { state = next; runtime?.setState(state); syncControls(); }
function copyLink(): void { const url = new URL(serializeComposerState(window.location.href, runtime?.stateData() ?? state)); url.searchParams.delete("preset"); void navigator.clipboard?.writeText(url.toString()); setStatus("LINK COPIED / FIXED STATE"); }

function bindShell(): void {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-control]").forEach((control) => control.addEventListener(control instanceof HTMLInputElement ? "input" : "change", () => updateControl(control.dataset.control!, control.value)));
  root.querySelector<HTMLButtonElement>('[data-action="presentation"]')!.addEventListener("click", togglePanel);
  root.querySelector<HTMLButtonElement>('[data-action="load-file"]')!.addEventListener("click", () => root.querySelector<HTMLInputElement>("[data-file-input]")!.click());
  root.querySelector<HTMLInputElement>("[data-file-input]")!.addEventListener("change", () => { const file = root.querySelector<HTMLInputElement>("[data-file-input]")!.files?.[0]; if (file) void loadSource(loadComposerSourceFromFile(file), file.name.toUpperCase()); });
  root.querySelector<HTMLButtonElement>('[data-action="load-sample"]')!.addEventListener("click", () => void loadSource(loadBundledComposerSource(), "BUNDLED FIRST PRINT"));
  root.querySelector<HTMLButtonElement>('[data-action="reset-source"]')!.addEventListener("click", () => void loadSource(loadBundledComposerSource(), "RESET FIRST PRINT"));
  const dropzone = root.querySelector<HTMLElement>("[data-dropzone]")!; dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.dataset.active = "true"; }); dropzone.addEventListener("dragleave", () => { delete dropzone.dataset.active; }); dropzone.addEventListener("drop", (event) => { event.preventDefault(); delete dropzone.dataset.active; const file = event.dataTransfer?.files[0]; if (file) void loadSource(loadComposerSourceFromFile(file), file.name.toUpperCase()); });
  root.querySelector<HTMLSelectElement>("[data-preset]")!.addEventListener("change", (event) => { const preset = (event.target as HTMLSelectElement).value; if (preset) applyState(mergeComposerState(state, ARCHIVE_COMPOSER_PRESETS[preset]!)); });
  root.querySelector<HTMLButtonElement>('[data-action="save-preset"]')!.addEventListener("click", () => { saveComposerPreset(state); setStatus("PRESET SAVED / LOCAL"); });
  root.querySelector<HTMLButtonElement>('[data-action="load-preset"]')!.addEventListener("click", () => { const loaded = loadComposerPreset(); if (loaded) { applyState(loaded); setStatus("PRESET LOADED / LOCAL"); } else setStatus("NO LOCAL PRESET", true); });
  root.querySelector<HTMLButtonElement>('[data-action="copy-link"]')!.addEventListener("click", copyLink);
  root.querySelector<HTMLButtonElement>('[data-action="reset"]')!.addEventListener("click", () => { applyState(DEFAULT_COMPOSER_STATE); setStatus("RESET / DEFAULT MIX"); });
  root.querySelector<HTMLButtonElement>('[data-action="reset-camera"]')!.addEventListener("click", () => { runtime?.resetCamera(); setStatus("RESET / CAMERA POSE"); });
  root.querySelector<HTMLButtonElement>('[data-action="png"]')!.addEventListener("click", () => void capturePng(false));
  root.querySelector<HTMLButtonElement>('[data-action="manifest"]')!.addEventListener("click", () => void capturePng(true));
  root.querySelector<HTMLButtonElement>('[data-action="webm"]')!.addEventListener("click", () => void captureWebm());
  root.querySelector<HTMLButtonElement>('[data-action="restart"]')!.addEventListener("click", () => { runtime?.restart(); const play = root.querySelector<HTMLButtonElement>('[data-action="play"]'); if (play) play.textContent = "PAUSE"; setStatus("RESTARTED / TIMELINE"); });
  root.querySelector<HTMLButtonElement>('[data-action="play"]')!.addEventListener("click", (event) => { if (!runtime) return; runtime.setPlaying(!runtime.isPlaying); (event.currentTarget as HTMLButtonElement).textContent = runtime.isPlaying ? "PAUSE" : "PLAY"; });
  root.querySelectorAll<HTMLButtonElement>('[data-action="toggle-section"]').forEach((button) => button.addEventListener("click", () => { const sectionElement = button.closest<HTMLElement>(".composer-section")!; sectionElement.dataset.collapsed = sectionElement.dataset.collapsed === "true" ? "false" : "true"; button.setAttribute("aria-expanded", sectionElement.dataset.collapsed !== "true" ? "true" : "false"); }));
}

window.addEventListener("keydown", (event) => { if (event.key === "Tab" && event.target === document.body) { event.preventDefault(); togglePanel(); } else if (event.key === "Escape") root.dataset.panel = "open"; });
document.title = "SKIN ART / LIVE COMPOSER";
renderShell();
void loadSource(loadBundledComposerSource(), "BUNDLED FIRST PRINT");

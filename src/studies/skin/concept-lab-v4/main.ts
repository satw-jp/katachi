import "./style.css";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "../rebuild/fkei.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";
import { adaptConceptSource } from "./sourceAdapter.ts";
import { CONCEPT_DEFINITIONS, conceptDefinition } from "./conceptRegistry.ts";
import { V4_PALETTES, type PaletteColors, type PaletteName } from "./conceptTypes.ts";
import { defaultParameters, type ParameterDefinition, type ParameterValue } from "./parameterStore.ts";
import { parseConceptLabUrl, serializeConceptLabUrl } from "./urlState.ts";
import { ConceptRuntime } from "./runtime/conceptRuntime.ts";
import { saveStillCapture } from "./capture/stillCapture.ts";
import { selectVideoMimeType } from "./capture/mimeType.ts";
import { VideoCaptureController } from "./capture/videoCapture.ts";

const rootElement = document.getElementById("concept-lab-v4-root");
if (!rootElement) throw new Error("Concept Lab V4 root is missing");
const root: HTMLElement = rootElement;
root.className = "concept-lab-v4";
root.innerHTML = `<main class="concept-lab-v4-artwork"></main><aside class="concept-lab-v4-inspector" aria-label="Concept Lab inspector"></aside>`;
const artwork = root.querySelector<HTMLElement>(".concept-lab-v4-artwork")!;
const inspector = root.querySelector<HTMLElement>(".concept-lab-v4-inspector")!;
const initialUrl = parseConceptLabUrl(window.location.search, CONCEPT_DEFINITIONS[0]!.id);
const initialConcept = conceptDefinition(initialUrl.concept).id;
const paletteNames: readonly PaletteName[] = ["rich", "red", "blue", "monochrome", "custom"];
let activePalette: PaletteName = paletteNames.includes(initialUrl.palette as PaletteName) ? initialUrl.palette as PaletteName : "rich";
let customColors: PaletteColors = { ...V4_PALETTES.rich };
let runtime: ConceptRuntime | null = null;
let videoCapture: VideoCaptureController | null = null;
let rebuildTimer = 0;
let statusMessage = "SOURCE / LOADING";

function hexColor(value: string): number {
  return Number.parseInt(value.replace(/^#/, ""), 16) || 0;
}

function colorHex(value: number): string { return `#${value.toString(16).padStart(6, "0")}`; }

function currentPaletteColors(): PaletteColors {
  return activePalette === "custom" ? customColors : V4_PALETTES[activePalette];
}

function setPanel(open: boolean): void {
  root.dataset.panel = open ? "open" : "closed";
  const url = new URL(window.location.href);
  if (open) url.searchParams.set("panel", "1"); else url.searchParams.set("panel", "0");
  window.history.replaceState(null, "", url);
  runtime?.surface.resize();
}

function isPanelOpen(): boolean { return root.dataset.panel === "open"; }

function formatValue(value: ParameterValue): string {
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value;
}

function updateUrl(includeTime = false): void {
  if (!runtime) return;
  const state = runtime.captureState();
  const url = serializeConceptLabUrl(window.location.href, {
    concept: state.concept,
    seed: state.seed,
    timeMs: includeTime ? state.timeMs : 0,
    palette: state.palette,
    panel: isPanelOpen(),
    parameters: includeTime ? state.parameters : {},
    camera: includeTime ? state.camera : null,
  });
  window.history.replaceState(null, "", url);
}

function updateFrame(frame: { elapsedSeconds: number; paused: boolean; seed: number; concept: string }): void {
  const time = inspector.querySelector<HTMLElement>("[data-time]");
  if (time) time.textContent = `${frame.paused ? "PAUSED" : "PLAYING"} / ${frame.elapsedSeconds.toFixed(2)}S / SEED ${frame.seed}`;
  const play = inspector.querySelector<HTMLButtonElement>("[data-action=play]");
  if (play) play.textContent = frame.paused ? "PLAY" : "PAUSE";
  const freeze = inspector.querySelector<HTMLButtonElement>("[data-action=freeze]");
  if (freeze) freeze.textContent = frame.paused ? "UNFREEZE" : "FREEZE MOMENT";
}

function setStatus(message: string, error = false): void {
  statusMessage = message;
  const status = inspector.querySelector<HTMLElement>("[data-status]");
  if (status) { status.textContent = message; status.dataset.state = error ? "error" : ""; }
}

function archiveMarkup(): string {
  return `<section class="v4-section"><h2>ARCHIVE</h2><nav class="v4-archive" aria-label="SKIN ART archive">
    <a class="v4-link" href="../">INDEX ↗</a>
    <a class="v4-link" href="../studies/">VISUAL STUDIES ↗</a>
    <a class="v4-link" href="../concepts/">CONCEPT V1 ↗</a>
    <a class="v4-link" href="../concepts-v2/">CONCEPT V2 ↗</a>
    <a class="v4-link" href="../concepts-v3/">CONCEPT V3 ↗</a>
  </nav></section>`;
}

function conceptsMarkup(): string {
  return `<section class="v4-section"><h2>CONCEPT</h2><nav class="v4-concepts" aria-label="Ten V4 concepts">${CONCEPT_DEFINITIONS.map((definition) => `
    <button class="v4-concept-button" type="button" data-concept="${definition.id}" data-active="${definition.id === runtime?.concept()}"><span class="v4-number">${definition.number}</span><span>${definition.title}</span></button>`).join("")}</nav></section>`;
}

function controlMarkup(definition: ParameterDefinition, value: ParameterValue): string {
  if (definition.kind === "select") {
    return `<label class="v4-control"><span class="v4-label">${definition.label}</span><select data-param="${definition.id}">${(definition.options ?? []).map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
  }
  if (definition.kind === "toggle") return `<label class="v4-control"><span class="v4-label">${definition.label}</span><input data-param="${definition.id}" type="checkbox" ${value === true ? "checked" : ""}></label>`;
  if (definition.kind === "color") return `<label class="v4-color-row"><span class="v4-label">${definition.label}</span><input data-param="${definition.id}" type="color" value="${String(value)}"></label>`;
  return `<label class="v4-control"><span class="v4-label">${definition.label}</span><output data-value="${definition.id}">${formatValue(value)}</output><input data-param="${definition.id}" type="range" min="${definition.min ?? 0}" max="${definition.max ?? 1}" step="${definition.step ?? 0.01}" value="${String(value)}"></label>`;
}

function groupMarkup(title: string, definitions: readonly ParameterDefinition[]): string {
  if (!runtime || definitions.length === 0) return "";
  return `<section class="v4-section"><h2>${title}</h2>${definitions.map((definition) => controlMarkup(definition, runtime!.parameters()[definition.id] ?? definition.defaultValue)).join("")}</section>`;
}

function appearanceMarkup(): string {
  if (!runtime) return "";
  const definitions = runtime.globalDefinitions().filter((definition) => ["exposure", "localContrast", "saturation", "blackRetention", "highlightPeak", "blurAmount", "edgeClarity"].includes(definition.id));
  return groupMarkup("APPEARANCE", definitions);
}

function spaceMarkup(): string {
  if (!runtime) return "";
  const definitions = runtime.globalDefinitions().filter((definition) => ["cameraDepth", "depthSpread", "foregroundScale", "backgroundScale", "focusDisorder", "cameraDrift", "fieldOfView"].includes(definition.id));
  return groupMarkup("SPACE", definitions);
}

function momentMarkup(): string {
  if (!runtime) return "";
  const definitions = runtime.globalDefinitions().filter((definition) => ["timeScale", "eventDensity", "pauseBias"].includes(definition.id));
  return `<section class="v4-section"><h2>MOMENT</h2><div class="v4-actions"><button class="v4-button" data-action="play" type="button">${runtime.isPlaying() ? "PAUSE" : "PLAY"}</button><button class="v4-button" data-action="new" type="button">NEW REALIZATION</button><button class="v4-button" data-action="restart" type="button">RESTART SAME SEED</button></div><div data-time class="v4-capture-note"></div>${definitions.map((definition) => controlMarkup(definition, runtime!.parameters()[definition.id] ?? definition.defaultValue)).join("")}</section>`;
}

function paletteMarkup(): string {
  const colors = currentPaletteColors();
  return `<section class="v4-section"><h2>PALETTE</h2><label class="v4-control"><span class="v4-label">Palette</span><select data-palette>${paletteNames.map((name) => `<option value="${name}" ${name === activePalette ? "selected" : ""}>${name}</option>`).join("")}</select></label><div data-custom-colors ${activePalette === "custom" ? "" : "hidden"}>
    ${(["primary", "secondary", "highlight", "shadow"] as const).map((key) => `<label class="v4-color-row"><span class="v4-label">${key}</span><input type="color" data-custom-color="${key}" value="${colorHex(colors[key])}"></label>`).join("")}
  </div></section>`;
}

function captureMarkup(): string {
  const supported = Boolean(selectVideoMimeType());
  return `<section class="v4-section"><h2>CAPTURE</h2><div class="v4-actions"><button class="v4-button" data-action="freeze" type="button">FREEZE MOMENT</button><button class="v4-button" data-action="png" type="button">SAVE PNG</button><button class="v4-button" data-action="manifest" type="button">SAVE PNG + MANIFEST</button></div><div class="v4-actions" style="margin-top:14px"><button class="v4-button" data-action="video-start" type="button" ${supported ? "" : "disabled"}>START VIDEO</button><button class="v4-button" data-action="video-stop" type="button" disabled>STOP VIDEO</button></div><div class="v4-select-row"><label class="v4-control"><span class="v4-label">Duration</span><select data-capture-duration><option value="5">5S</option><option value="10" selected>10S</option><option value="20">20S</option><option value="manual">MANUAL</option></select></label><label class="v4-control"><span class="v4-label">FPS</span><select data-capture-fps><option value="24">24</option><option value="30" selected>30</option><option value="60">60</option></select></label></div><label class="v4-control"><span class="v4-label">Resolution</span><select data-capture-resolution><option value="1280x720">1280×720</option><option value="1920x1080" selected>1920×1080</option><option value="3840x2160">3840×2160</option></select></label><p class="v4-capture-note" data-capture-status>${supported ? "WEBM / CODEC AUTO-DETECTED" : "VIDEO UNSUPPORTED / PNG AVAILABLE"}</p><video class="v4-video-preview" data-video-preview controls hidden></video></section>`;
}

function presetMarkup(): string {
  return `<section class="v4-section"><h2>PRESET / LINK</h2><div class="v4-actions"><button class="v4-button" data-action="live-link" type="button">COPY LIVE LINK</button><button class="v4-button" data-action="fixed-link" type="button">COPY FIXED MOMENT LINK</button><button class="v4-button" data-action="save-preset" type="button">SAVE LOCAL PRESET</button><button class="v4-button" data-action="reset" type="button">RESET</button></div><p class="v4-source-note">GESTURE SOURCE / PROXY · FKEI GRAPH ${runtime?.sourceFingerprint() ?? ""}</p></section>`;
}

function bindParameterControls(): void {
  if (!runtime) return;
  inspector.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-param]").forEach((input) => {
    const id = input.dataset.param!;
    const definition = runtime!.definitions().find((item) => item.id === id);
    if (!definition) return;
    input.addEventListener("input", () => {
      let value: ParameterValue;
      if (input instanceof HTMLInputElement && input.type === "checkbox") value = input.checked;
      else if (input instanceof HTMLInputElement && input.type === "range") value = Number(input.value);
      else value = input.value;
      runtime!.setParameter(id, value);
      const output = inspector.querySelector<HTMLOutputElement>(`[data-value="${id}"]`);
      if (output) output.textContent = formatValue(value);
      if (definition.updateMode === "rebuild") {
        window.clearTimeout(rebuildTimer);
        setStatus(`REBUILD / ${definition.label.toUpperCase()} / DEBOUNCED 120MS`);
        rebuildTimer = window.setTimeout(() => runtime?.remount(), 120);
      } else if (definition.updateMode === "restart") runtime!.restartSameSeed();
    });
  });
}

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  let copied = false;
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); copied = true; } } catch { copied = false; }
  if (!copied) {
    const textarea = document.createElement("textarea"); textarea.value = text; textarea.setAttribute("readonly", "true"); textarea.style.position = "fixed"; textarea.style.opacity = "0"; document.body.appendChild(textarea); textarea.select(); copied = document.execCommand("copy"); textarea.remove();
  }
  const original = button.textContent ?? "COPY"; button.textContent = copied ? "COPIED" : "COPY FAILED"; window.setTimeout(() => { button.textContent = original; }, 1_600);
}

function readCaptureSize(): { width: number; height: number } {
  const value = inspector.querySelector<HTMLSelectElement>("[data-capture-resolution]")?.value ?? "1920x1080";
  const [width, height] = value.split("x").map(Number);
  return { width: width || 1920, height: height || 1080 };
}

function bindActions(): void {
  if (!runtime) return;
  inspector.querySelectorAll<HTMLButtonElement>("[data-concept]").forEach((button) => button.addEventListener("click", () => {
    const definition = conceptDefinition(button.dataset.concept ?? "");
    runtime!.mount(definition.id, activePalette, runtime!.seed(), { initialParameters: runtime!.parameters(), customColors });
    updateUrl(); renderInspector();
  }));
  inspector.querySelector<HTMLButtonElement>("[data-action=play]")?.addEventListener("click", () => { runtime!.togglePlaying(); updateUrl(true); });
  inspector.querySelector<HTMLButtonElement>("[data-action=new]")?.addEventListener("click", () => { runtime!.newRealization(); updateUrl(); setStatus("NEW REALIZATION / PRESENTATION SEED CHANGED"); });
  inspector.querySelector<HTMLButtonElement>("[data-action=restart]")?.addEventListener("click", () => { runtime!.restartSameSeed(); updateUrl(true); setStatus("RESTART SAME SEED / TIME 0"); });
  inspector.querySelector<HTMLButtonElement>("[data-action=freeze]")?.addEventListener("click", () => { runtime!.togglePlaying(); setStatus(runtime!.isPlaying() ? "PLAYING / LIVE MOMENT" : "FROZEN / READY FOR CAPTURE"); });
  inspector.querySelector<HTMLButtonElement>("[data-action=png]")?.addEventListener("click", async () => { try { const size = readCaptureSize(); const result = await saveStillCapture(runtime!, { ...size, includeManifest: false, gitCommit: import.meta.env.VITE_GIT_COMMIT }); setStatus(`PNG SAVED / ${result.filename} / ${result.blob.size} BYTES`); } catch (error) { setStatus(`PNG FAILED / ${error instanceof Error ? error.message : String(error)}`, true); } });
  inspector.querySelector<HTMLButtonElement>("[data-action=manifest]")?.addEventListener("click", async () => { try { const size = readCaptureSize(); const result = await saveStillCapture(runtime!, { ...size, includeManifest: true, gitCommit: import.meta.env.VITE_GIT_COMMIT }); setStatus(`PNG + MANIFEST SAVED / ${result.blob.size} BYTES`); } catch (error) { setStatus(`CAPTURE FAILED / ${error instanceof Error ? error.message : String(error)}`, true); } });
  inspector.querySelector<HTMLButtonElement>("[data-action=video-start]")?.addEventListener("click", () => {
    if (videoCapture) return;
    const size = readCaptureSize(); const fps = Number(inspector.querySelector<HTMLSelectElement>("[data-capture-fps]")?.value ?? 30); const durationText = inspector.querySelector<HTMLSelectElement>("[data-capture-duration]")?.value ?? "10"; const durationSeconds = durationText === "manual" ? "manual" : Number(durationText);
    const start = inspector.querySelector<HTMLButtonElement>("[data-action=video-start]")!; const stop = inspector.querySelector<HTMLButtonElement>("[data-action=video-stop]")!; start.disabled = true; stop.disabled = false; setStatus(`RECORDING / ${size.width}×${size.height} / ${fps}FPS`);
    videoCapture = new VideoCaptureController(runtime!, { ...size, fps, durationSeconds }, (seconds) => { const status = inspector.querySelector<HTMLElement>("[data-capture-status]"); if (status) status.textContent = `RECORDING / ${seconds.toFixed(1)}S`; });
    void videoCapture.promise.then((result) => { const preview = inspector.querySelector<HTMLVideoElement>("[data-video-preview]"); if (preview) { preview.src = URL.createObjectURL(result.blob); preview.hidden = false; } setStatus(`WEBM SAVED / ${result.blob.size} BYTES / ${result.width}×${result.height} / ${result.fps}FPS`); }).catch((error: unknown) => setStatus(`VIDEO FAILED / ${error instanceof Error ? error.message : String(error)}`, true)).finally(() => { videoCapture = null; start.disabled = false; stop.disabled = true; });
  });
  inspector.querySelector<HTMLButtonElement>("[data-action=video-stop]")?.addEventListener("click", () => videoCapture?.stop());
  inspector.querySelector<HTMLSelectElement>("[data-palette]")?.addEventListener("change", (event) => { activePalette = (event.target as HTMLSelectElement).value as PaletteName; runtime!.mount(runtime!.concept(), activePalette, runtime!.seed(), { initialParameters: runtime!.parameters(), customColors }); renderInspector(); updateUrl(); });
  inspector.querySelectorAll<HTMLInputElement>("[data-custom-color]").forEach((input) => input.addEventListener("input", () => { const key = input.dataset.customColor as keyof PaletteColors; customColors = { ...customColors, [key]: hexColor(input.value) }; if (activePalette === "custom") runtime!.mount(runtime!.concept(), "custom", runtime!.seed(), { initialParameters: runtime!.parameters(), customColors }); }));
  inspector.querySelector<HTMLButtonElement>("[data-action=live-link]")?.addEventListener("click", (event) => copyText(serializeConceptLabUrl(window.location.href, { concept: runtime!.concept(), seed: runtime!.seed(), timeMs: 0, palette: activePalette, panel: true, parameters: {}, camera: null }), event.currentTarget as HTMLButtonElement));
  inspector.querySelector<HTMLButtonElement>("[data-action=fixed-link]")?.addEventListener("click", (event) => copyText(serializeConceptLabUrl(window.location.href, { ...runtime!.captureState(), panel: true }), event.currentTarget as HTMLButtonElement));
  inspector.querySelector<HTMLButtonElement>("[data-action=save-preset]")?.addEventListener("click", (event) => { localStorage.setItem("skin-art-concept-lab-v4-preset", serializeConceptLabUrl(window.location.href, { ...runtime!.captureState(), panel: true })); (event.currentTarget as HTMLButtonElement).textContent = "SAVED"; });
  inspector.querySelector<HTMLButtonElement>("[data-action=reset]")?.addEventListener("click", () => { activePalette = "rich"; customColors = { ...V4_PALETTES.rich }; runtime!.mount(runtime!.concept(), activePalette, runtime!.seed(), { initialParameters: defaultParameters(conceptDefinition(runtime!.concept()).parameters) }); renderInspector(); updateUrl(); });
}

function renderInspector(): void {
  const definition = runtime?.currentDefinition();
  inspector.innerHTML = `<div class="v4-inspector-head"><a class="v4-brand" href="../">SKIN ART / LAB V4</a><button class="v4-presentation" data-action="presentation" type="button">PRESENTATION</button></div><div class="v4-status" data-status>${statusMessage}</div>${runtime && definition ? `<section class="v4-section"><h2>${definition.number} / ${definition.title}</h2><p class="v4-statement">${definition.statement}</p></section>${archiveMarkup()}${conceptsMarkup()}${momentMarkup()}${appearanceMarkup()}${spaceMarkup()}${groupMarkup("CONCEPT PARAMETERS", definition.parameters)}${paletteMarkup()}${captureMarkup()}${presetMarkup()}` : `<section class="v4-section"><h2>SOURCE</h2><p class="v4-statement">${statusMessage}</p></section>`}`;
  if (runtime) { bindParameterControls(); bindActions(); updateFrame({ elapsedSeconds: runtime.elapsedMs() / 1000, paused: !runtime.isPlaying(), seed: runtime.seed(), concept: runtime.concept() }); }
  inspector.querySelector<HTMLButtonElement>("[data-action=presentation]")?.addEventListener("click", () => setPanel(false));
}

function loadSource(): Promise<VisualStudySource> {
  const sampleUrl = new URL("../../samples/skin-rebuild-first-print.fkei", window.location.href);
  return fetch(sampleUrl, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(`Completed SKIN source returned HTTP ${response.status}`); const document = parseSkinRebuildFkei(await response.text()); const project = projectFromSkinRebuildFkei(document); return { graph: project.finalGraph, base: project.base, patterns: project.patterns, project }; });
}

const panelQuery = new URLSearchParams(window.location.search).get("panel");
setPanel(window.innerWidth > 760 ? panelQuery !== "0" : initialUrl.panel);
renderInspector();
window.addEventListener("keydown", (event) => { if (event.key.toLowerCase() === "p") setPanel(!isPanelOpen()); else if (event.key === "Escape" && !isPanelOpen()) setPanel(true); });
window.addEventListener("resize", () => { if (window.innerWidth <= 760 && !new URLSearchParams(window.location.search).has("panel")) setPanel(false); });

void loadSource().then((source) => {
  const mapped = adaptConceptSource(source);
  runtime = new ConceptRuntime(artwork, mapped, updateFrame);
  runtime.mount(initialConcept, activePalette, initialUrl.seed, { initialTimeMs: initialUrl.timeMs, initialParameters: initialUrl.parameters, camera: initialUrl.camera, customColors });
  statusMessage = `READY / ${mapped.nodes.length} NODES / ${mapped.edges.length} EDGES / ${mapped.motifs.length} MOTIFS`;
  renderInspector();
}).catch((error: unknown) => { setStatus(`SOURCE UNAVAILABLE / ${error instanceof Error ? error.message : String(error)}`, true); renderInspector(); });

window.addEventListener("beforeunload", () => runtime?.dispose());

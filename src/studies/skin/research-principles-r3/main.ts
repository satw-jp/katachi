import "./style.css";
import { startFrameLoop } from "../../../lib/loop.ts";
import { studyFromQuery } from "./catalog.ts";
import { INITIAL_PARAMS, phaseFor, type R3Params, type R3Phase, type RedundantFreeformState } from "./runtime/types.ts";

const root = document.getElementById("research-principles-r3");
if (!root) throw new Error("Research principles Round 03 root is missing");

const DEFAULT_SEED = 240906;
const url = new URL(window.location.href);
const definition = studyFromQuery(url.searchParams.get("study"));
const seedValue = Number(url.searchParams.get("seed") ?? DEFAULT_SEED);
const seed = Number.isFinite(seedValue) ? Math.trunc(seedValue) : DEFAULT_SEED;
let params: R3Params = { ...INITIAL_PARAMS };
let state: RedundantFreeformState = definition.createState(seed);
let playing = true;
let lastFrame = performance.now();
let canvasWidth = 1;
let canvasHeight = 1;
let currentPhase: R3Phase = phaseFor(state);
let frameIndex = 0;

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};

const header = make("header", "r3-header");
const eyebrow = make("div", "r3-eyebrow");
eyebrow.textContent = "ART LUNA / RESEARCH PRINCIPLES / ROUND 03";
const title = make("h1");
title.textContent = definition.title;
const subtitle = make("p", "r3-subtitle");
subtitle.textContent = "One freeform morphology study for accumulated alternatives.";
header.append(eyebrow, title, subtitle);

const studyBar = make("div", "r3-study-bar");
const studyLabel = make("div", "r3-study-label");
studyLabel.textContent = `${definition.studyId} · REDUNDANT-FREEFORM`;
const phaseStrip = make("div", "r3-phase-strip");
const phaseElements: HTMLSpanElement[] = [];
studyBar.append(studyLabel, phaseStrip);
const baselineLink = make("a", "r3-baseline-link");
baselineLink.href = "../research-principles-r2/?study=multi-reconnect";
baselineLink.textContent = "R2 CONTEXT";
studyBar.append(baselineLink);

const content = make("main", "r3-content");
const canvasPanel = make("section", "r3-canvas-panel");
const canvas = make("canvas", "r3-canvas");
canvas.setAttribute("aria-label", "Round 03 redundant freeform morphology artwork canvas");
const canvasNote = make("div", "r3-canvas-note");
canvasNote.textContent = "FIXED CAMERA · 3D DEPTH · AUDIO OFF";
canvasPanel.append(canvas, canvasNote);

const inspector = make("aside", "r3-inspector");
const idLabel = make("div", "r3-study-id");
const artTitle = make("h2", "r3-art-title");
const principle = make("p", "r3-principle");
const phaseDetail = make("div", "r3-phase-detail");
const readout = make("div", "r3-readout");
inspector.append(idLabel, artTitle, principle, phaseDetail, readout);

const controls = make("div", "r3-controls");
const transport = make("div", "r3-transport");
const playButton = make("button", "r3-button r3-button-primary");
playButton.type = "button";
const restartButton = make("button", "r3-button");
restartButton.type = "button";
restartButton.textContent = "RESTART";
transport.append(playButton, restartButton);
controls.append(transport);

const controlRows = new Map<keyof R3Params, { input: HTMLInputElement; output: HTMLOutputElement }>();
for (const control of definition.controls) {
  const row = make("label", "r3-control");
  const label = make("span", "r3-control-label");
  label.textContent = control.label;
  const input = make("input");
  input.type = "range";
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step);
  input.value = String(params[control.key]);
  const output = make("output", "r3-control-value");
  output.textContent = params[control.key].toFixed(2);
  row.append(label, input, output);
  controls.append(row);
  controlRows.set(control.key, { input, output });
  input.addEventListener("input", () => {
    params = { ...params, [control.key]: Number(input.value) };
    output.textContent = Number(input.value).toFixed(2);
    status.textContent = `${control.label} ${output.textContent}`;
  });
}

const captureRow = make("div", "r3-capture-row");
const frameButton = make("button", "r3-button");
frameButton.type = "button";
frameButton.textContent = "CAPTURE FRAME";
const manifestButton = make("button", "r3-button");
manifestButton.type = "button";
manifestButton.textContent = "MANIFEST";
const recordButton = make("button", "r3-button");
recordButton.type = "button";
recordButton.textContent = "RECORD 35S";
captureRow.append(frameButton, manifestButton, recordButton);
controls.append(captureRow);

const status = make("div", "r3-status");
status.setAttribute("aria-live", "polite");
status.textContent = "READY / DETERMINISTIC SEED 240906";
controls.append(status);

const docs = make("details", "r3-docs");
const docsSummary = make("summary");
docsSummary.textContent = "STUDY NOTES";
const docsBody = make("div", "r3-docs-body");
docs.append(docsSummary, docsBody);
inspector.append(controls, docs);

content.append(canvasPanel, inspector);
root.append(header, studyBar, content);

function updateUrl(): void {
  url.searchParams.set("study", definition.key);
  url.searchParams.set("seed", String(seed));
  window.history.replaceState({}, "", url);
}

function formatDocs(): void {
  docsBody.replaceChildren(...[
    ["SCIENTIFIC / COMPUTATIONAL CORE", definition.documentation.scientificCore],
    ["ART TRANSLATION", definition.documentation.artTranslation],
    ["WHAT CHANGED", definition.documentation.whatChanged],
    ["WHAT IS NOT CLAIMED", definition.documentation.notClaimed],
  ].map(([label, text]) => {
    const group = make("div", "r3-doc-group");
    const heading = make("strong");
    heading.textContent = label;
    const copy = make("p");
    copy.textContent = text;
    group.append(heading, copy);
    return group;
  }));
}

function resetStudy(): void {
  state = definition.createState(seed);
  playing = true;
  lastFrame = performance.now();
  status.textContent = "RESTARTED / GROWTH RESUMED";
  render();
}

function updatePhaseStrip(): void {
  currentPhase = phaseFor(state);
  phaseStrip.replaceChildren();
  phaseElements.length = 0;
  definition.phaseSequence.forEach((label, index) => {
    const element = make("span", "r3-phase");
    element.textContent = label;
    element.dataset.active = String(index === currentPhase.index);
    phaseElements.push(element);
    phaseStrip.append(element);
  });
}

function updateInspector(): void {
  currentPhase = phaseFor(state);
  idLabel.textContent = `${definition.studyId} / ${currentPhase.label}`;
  artTitle.textContent = definition.artTitle;
  principle.textContent = definition.principle;
  phaseDetail.textContent = `${currentPhase.detail} · ${state.elapsed.toFixed(1)}s · SEED ${seed}`;
  readout.replaceChildren(...definition.readouts(state).map((line) => {
    const item = make("div", "r3-readout-line");
    item.textContent = line;
    return item;
  }));
  updatePhaseStrip();
  playButton.textContent = playing ? "PAUSE" : "PLAY";
  for (const [key, row] of controlRows) row.output.textContent = params[key].toFixed(2);
}

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvasWidth = Math.max(1, rect.width);
  canvasHeight = Math.max(1, rect.height);
  canvas.width = Math.round(canvasWidth * devicePixelRatio);
  canvas.height = Math.round(canvasHeight * devicePixelRatio);
  const context = canvas.getContext("2d");
  if (context) context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  render();
}

function render(): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  const background = context.createRadialGradient(canvasWidth * 0.51, canvasHeight * 0.46, 0, canvasWidth * 0.51, canvasHeight * 0.46, Math.max(canvasWidth, canvasHeight) * 0.74);
  background.addColorStop(0, "#171b27");
  background.addColorStop(0.5, "#090c14");
  background.addColorStop(1, "#020304");
  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  definition.render(context, state, { width: canvasWidth, height: canvasHeight, elapsedSeconds: state.elapsed });
  updateInspector();
}

function downloadBlob(filename: string, blob: Blob): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function captureFrame(): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    frameIndex += 1;
    downloadBlob(`R3-01-redundant-freeform_${String(frameIndex).padStart(2, "0")}_${currentPhase.label.toLowerCase().split(" ").join("-")}.png`, blob);
    status.textContent = `${currentPhase.label} FRAME ${frameIndex} CAPTURED`;
  }, "image/png");
}

function captureManifest(): void {
  downloadBlob("R3-01-redundant-freeform_manifest.json", new Blob([JSON.stringify(definition.manifest(state, params), null, 2)], { type: "application/json" }));
  status.textContent = "MANIFEST READY";
}

function recordWebm(): void {
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    status.textContent = "WEBM CAPTURE UNAVAILABLE";
    return;
  }
  const stream = canvas.captureStream(30);
  const mimeType = ["video/webm;codecs=vp9", "video/webm"].find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    status.textContent = "WEBM FORMAT UNAVAILABLE";
    return;
  }
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  const wasPlaying = playing;
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  recorder.onstop = () => {
    downloadBlob("R3-01-redundant-freeform_35s.webm", new Blob(chunks, { type: mimeType }));
    stream.getTracks().forEach((track) => track.stop());
    playing = wasPlaying;
    recordButton.disabled = false;
    recordButton.textContent = "RECORD 35S";
    status.textContent = "WEBM READY";
  };
  recordButton.disabled = true;
  recordButton.textContent = "RECORDING…";
  status.textContent = "RECORDING 35S";
  playing = true;
  recorder.start();
  window.setTimeout(() => recorder.stop(), 35000);
}

playButton.addEventListener("click", () => { playing = !playing; status.textContent = playing ? "PLAYING" : "PAUSED"; render(); });
restartButton.addEventListener("click", resetStudy);
frameButton.addEventListener("click", captureFrame);
manifestButton.addEventListener("click", captureManifest);
recordButton.addEventListener("click", recordWebm);
window.addEventListener("resize", resizeCanvas);

updateUrl();
formatDocs();
resizeCanvas();
const stopFrameLoop = startFrameLoop((now) => {
  const delta = Math.max(0, Math.min((now - lastFrame) / 1000, 0.1));
  lastFrame = now;
  if (playing) state = definition.advanceState(state, delta, params);
  render();
});

(window as unknown as Record<string, unknown>).__rps3 = {
  getStudyKey: () => definition.key,
  getPhase: () => currentPhase,
  getState: () => state,
  getManifest: () => definition.manifest(state, params),
  stop: stopFrameLoop,
};

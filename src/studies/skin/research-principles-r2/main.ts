import "./style.css";
import { startFrameLoop } from "../../../lib/loop.ts";
import { STUDIES, STUDY_ORDER, studyFromQuery } from "./catalog.ts";
import type { R2Phase, StudyDefinition, StudyKey } from "./runtime/types.ts";

const root = document.getElementById("research-principles-r2");
if (!root) throw new Error("Research principles Round 02 root is missing");

const DEFAULT_SEED = 240906;
const url = new URL(window.location.href);
let definition: StudyDefinition = studyFromQuery(url.searchParams.get("study"));
let seed = Number(url.searchParams.get("seed") ?? DEFAULT_SEED);
if (!Number.isFinite(seed)) seed = DEFAULT_SEED;
let params: Record<string, number> = Object.fromEntries(definition.controls.map((control) => [control.key, control.value]));
let state = definition.createState(seed);
let elapsedSeconds = 0;
let playing = true;
let speed = 1;
let lastFrame = performance.now();
let canvasWidth = 1;
let canvasHeight = 1;
let currentPhase: R2Phase = definition.phase(state);

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};

const header = make("header", "r2-header");
const eyebrow = make("div", "r2-eyebrow");
eyebrow.textContent = "ART LUNA / RESEARCH PRINCIPLES / ROUND 02";
const title = make("h1");
title.textContent = "RECONNECTION + DYNAMIC EQUILIBRIUM";
const subtitle = make("p", "r2-subtitle");
subtitle.textContent = "Three small studies of relation, tension, and changing topology.";
header.append(eyebrow, title, subtitle);

const studyBar = make("div", "r2-study-bar");
const studyLabel = make("label", "r2-select-label");
studyLabel.textContent = "STUDY";
const studySelect = make("select", "r2-study-select");
studySelect.setAttribute("aria-label", "Round 02 study");
studyBar.append(studyLabel, studySelect);
const phaseStrip = make("div", "r2-phase-strip");
const phaseElements: HTMLSpanElement[] = [];
studyBar.append(phaseStrip);
const baselineLink = make("a", "r2-baseline-link");
baselineLink.href = "../research-principles/";
baselineLink.textContent = "ROUND 01 BASELINE";
studyBar.append(baselineLink);

const content = make("main", "r2-content");
const canvasPanel = make("section", "r2-canvas-panel");
const canvas = make("canvas", "r2-canvas");
canvas.setAttribute("aria-label", "Round 02 research principle artwork canvas");
const canvasNote = make("div", "r2-canvas-note");
canvasNote.textContent = "FIXED CAMERA · AUTO DETERMINISTIC · AUDIO OFF";
canvasPanel.append(canvas, canvasNote);

const inspector = make("aside", "r2-inspector");
const idLabel = make("div", "r2-study-id");
const artTitle = make("h2", "r2-art-title");
const principle = make("p", "r2-principle");
const readout = make("div", "r2-readout");
inspector.append(idLabel, artTitle, principle, readout);

const controls = make("div", "r2-controls");
const transport = make("div", "r2-transport");
const playButton = make("button", "r2-button r2-button-primary");
playButton.type = "button";
const restartButton = make("button", "r2-button");
restartButton.type = "button";
restartButton.textContent = "RESTART";
transport.append(playButton, restartButton);
controls.append(transport);

const speedRow = make("label", "r2-control");
const speedText = make("span", "r2-control-label");
speedText.textContent = "SPEED";
const speedInput = make("input");
speedInput.type = "range";
speedInput.min = "0.25";
speedInput.max = "2.5";
speedInput.step = "0.05";
speedInput.value = "1";
const speedValue = make("output", "r2-control-value");
speedRow.append(speedText, speedInput, speedValue);
controls.append(speedRow);

const studyControls = make("div", "r2-study-controls");
controls.append(studyControls);

const seedRow = make("label", "r2-control");
const seedText = make("span", "r2-control-label");
seedText.textContent = "SEED";
const seedInput = make("input", "r2-seed-input");
seedInput.type = "number";
seedInput.step = "1";
seedRow.append(seedText, seedInput);
controls.append(seedRow);

const captureRow = make("div", "r2-capture-row");
const frameButton = make("button", "r2-button");
frameButton.type = "button";
frameButton.textContent = "CAPTURE FRAME";
const manifestButton = make("button", "r2-button");
manifestButton.type = "button";
manifestButton.textContent = "MANIFEST";
const recordButton = make("button", "r2-button");
recordButton.type = "button";
recordButton.textContent = "RECORD 25S";
captureRow.append(frameButton, manifestButton, recordButton);
controls.append(captureRow);

const status = make("div", "r2-status");
status.setAttribute("aria-live", "polite");
status.textContent = "READY";
controls.append(status);

const docs = make("details", "r2-docs");
const docsSummary = make("summary");
docsSummary.textContent = "STUDY NOTES";
const docsBody = make("div", "r2-docs-body");
docs.append(docsSummary, docsBody);
inspector.append(controls, docs);

content.append(canvasPanel, inspector);
root.append(header, studyBar, content);

for (const key of STUDY_ORDER) {
  const option = make("option");
  option.value = key;
  option.textContent = `${STUDIES[key].studyId} · ${STUDIES[key].artTitle}`;
  studySelect.append(option);
}

function updateUrl(): void {
  url.searchParams.set("study", definition.key);
  if (definition.requiresSeed) url.searchParams.set("seed", String(seed));
  else url.searchParams.delete("seed");
  window.history.replaceState({}, "", url);
}

function resetClock(): void {
  elapsedSeconds = 0;
  playing = true;
  lastFrame = performance.now();
}

function resetStudy(): void {
  state = definition.createState(seed);
  resetClock();
  status.textContent = "RESTARTED";
  render();
}

function setStudy(key: StudyKey): void {
  definition = STUDIES[key];
  params = Object.fromEntries(definition.controls.map((control) => [control.key, control.value]));
  studySelect.value = key;
  seedRow.hidden = !definition.requiresSeed;
  seedInput.value = String(seed);
  updateUrl();
  renderStudyControls();
  resetStudy();
}

function formatControlValue(value: number, step: number): string {
  if (step < 0.01) return value.toFixed(3);
  if (step < 0.1) return value.toFixed(2);
  return value.toFixed(1);
}

function renderStudyControls(): void {
  studyControls.replaceChildren();
  for (const control of definition.controls) {
    const row = make("label", "r2-control");
    const label = make("span", "r2-control-label");
    label.textContent = control.label;
    const input = make("input");
    input.type = "range";
    input.min = String(control.min);
    input.max = String(control.max);
    input.step = String(control.step);
    input.value = String(params[control.key]);
    const output = make("output", "r2-control-value");
    output.textContent = formatControlValue(params[control.key], control.step);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      params[control.key] = value;
      output.textContent = formatControlValue(value, control.step);
      status.textContent = `${control.label} ${output.textContent}`;
    });
    row.append(label, input, output);
    studyControls.append(row);
  }
}

function updatePhaseStrip(): void {
  currentPhase = definition.phase(state);
  phaseStrip.replaceChildren();
  phaseElements.length = 0;
  definition.phaseSequence.forEach((label, index) => {
    const element = make("span", "r2-phase");
    element.textContent = label;
    element.dataset.active = String(index === currentPhase.index);
    phaseElements.push(element);
    phaseStrip.append(element);
  });
}

function updateInspector(): void {
  currentPhase = definition.phase(state);
  idLabel.textContent = `${definition.studyId} / ${currentPhase.label}`;
  artTitle.textContent = definition.artTitle;
  principle.textContent = definition.principle;
  readout.replaceChildren(...definition.readouts(state).map((line) => {
    const item = make("div", "r2-readout-line");
    item.textContent = line;
    return item;
  }));
  updatePhaseStrip();
  playButton.textContent = playing ? "PAUSE" : "PLAY";
  speedValue.textContent = `${speed.toFixed(2)}×`;
  docsBody.replaceChildren(...[
    ["SCIENTIFIC / COMPUTATIONAL CORE", definition.documentation.scientificCore],
    ["ART TRANSLATION", definition.documentation.artTranslation],
    ["WHAT CHANGED", definition.documentation.whatChanged],
    ["WHAT IS NOT CLAIMED", definition.documentation.notClaimed],
  ].map(([label, text]) => {
    const group = make("div", "r2-doc-group");
    const heading = make("strong");
    heading.textContent = label;
    const copy = make("p");
    copy.textContent = text;
    group.append(heading, copy);
    return group;
  }));
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
  const background = context.createRadialGradient(canvasWidth * 0.5, canvasHeight * 0.47, 0, canvasWidth * 0.5, canvasHeight * 0.47, Math.max(canvasWidth, canvasHeight) * 0.75);
  background.addColorStop(0, "#111725");
  background.addColorStop(0.58, "#080b12");
  background.addColorStop(1, "#030405");
  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  definition.render(context, state, { width: canvasWidth, height: canvasHeight, elapsedSeconds });
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
    downloadBlob(`${definition.studyId}-${definition.key}_seed-${seed}_${currentPhase.label.toLowerCase()}.png`, blob);
    status.textContent = `${currentPhase.label} FRAME CAPTURED`;
  }, "image/png");
}

function captureManifest(): void {
  downloadBlob(`${definition.studyId}-${definition.key}_seed-${seed}.json`, new Blob([JSON.stringify(definition.manifest(state, params), null, 2)], { type: "application/json" }));
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
    downloadBlob(`${definition.studyId}-${definition.key}_seed-${seed}.webm`, new Blob(chunks, { type: mimeType }));
    stream.getTracks().forEach((track) => track.stop());
    playing = wasPlaying;
    recordButton.disabled = false;
    recordButton.textContent = "RECORD 25S";
    status.textContent = "WEBM READY";
  };
  recordButton.disabled = true;
  recordButton.textContent = "RECORDING…";
  status.textContent = "RECORDING 25S";
  playing = true;
  recorder.start();
  window.setTimeout(() => recorder.stop(), 25000);
}

studySelect.addEventListener("change", () => setStudy(studySelect.value as StudyKey));
playButton.addEventListener("click", () => { playing = !playing; status.textContent = playing ? "PLAYING" : "PAUSED"; render(); });
restartButton.addEventListener("click", resetStudy);
speedInput.addEventListener("input", () => { speed = Number(speedInput.value); status.textContent = `SPEED ${speed.toFixed(2)}×`; render(); });
seedInput.addEventListener("input", () => {
  const nextSeed = Number(seedInput.value);
  if (!Number.isFinite(nextSeed)) {
    seedInput.value = String(seed);
    return;
  }
  seed = Math.trunc(nextSeed);
  updateUrl();
  resetStudy();
});
frameButton.addEventListener("click", captureFrame);
manifestButton.addEventListener("click", captureManifest);
recordButton.addEventListener("click", recordWebm);
window.addEventListener("resize", resizeCanvas);

studySelect.value = definition.key;
seedRow.hidden = !definition.requiresSeed;
seedInput.value = String(seed);
renderStudyControls();
updateUrl();
resizeCanvas();
const stopFrameLoop = startFrameLoop((now) => {
  const delta = Math.max(0, Math.min((now - lastFrame) / 1000, 0.1));
  lastFrame = now;
  if (playing) {
    const simulatedDelta = delta * speed;
    elapsedSeconds += simulatedDelta;
    state = definition.advanceState(state, simulatedDelta, params);
  }
  render();
});

(window as unknown as Record<string, unknown>).__rps2 = {
  getStudyKey: () => definition.key,
  getPhase: () => currentPhase,
  getState: () => state,
  getManifest: () => definition.manifest(state, params),
  stop: stopFrameLoop,
};

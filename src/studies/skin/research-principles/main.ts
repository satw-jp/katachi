import "./style.css";
import { startFrameLoop } from "../../../lib/loop.ts";
import { DeterministicClock } from "./runtime/deterministicClock.ts";
import { phaseForElapsed, type Phase, type StudyDefinition, type StudyKey } from "./runtime/studyTypes.ts";
import { STUDIES, STUDY_ORDER, studyFromQuery } from "./catalog.ts";

const root = document.getElementById("research-principles");
if (!root) throw new Error("Research principles root is missing");

const DEFAULT_SEED = 12345;
const url = new URL(window.location.href);
let definition: StudyDefinition = studyFromQuery(url.searchParams.get("study"));
let seed = Number(url.searchParams.get("seed") ?? DEFAULT_SEED);
if (!Number.isFinite(seed)) seed = DEFAULT_SEED;
let params: Record<string, number> = Object.fromEntries(definition.controls.map((control) => [control.key, control.value]));
let state = definition.createState(seed);
const clock = new DeterministicClock();
let lastFrame = performance.now();
let canvasWidth = 1;
let canvasHeight = 1;
let currentPhase: Phase = "BEFORE";

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};

const header = make("header", "rps-header");
const eyebrow = make("div", "rps-eyebrow");
eyebrow.textContent = "RESEARCH PRINCIPLES / ROUND 01";
const title = make("h1");
title.textContent = "RESEARCH PRINCIPLES";
const subtitle = make("p", "rps-subtitle");
subtitle.textContent = "Five small studies of change, memory, topology, and scale.";
header.append(eyebrow, title, subtitle);

const studyBar = make("div", "rps-study-bar");
const studyLabel = make("label", "rps-select-label");
studyLabel.textContent = "STUDY";
const studySelect = make("select", "rps-study-select");
studySelect.setAttribute("aria-label", "Study");
studyBar.append(studyLabel, studySelect);

const stageStrip = make("div", "rps-stage-strip");
const phaseElements = new Map<Phase, HTMLSpanElement>();
for (const phase of ["BEFORE", "CHANGE", "AFTER"] as const) {
  const element = make("span", "rps-stage");
  element.textContent = phase;
  phaseElements.set(phase, element);
  stageStrip.append(element);
}
studyBar.append(stageStrip);

const content = make("main", "rps-content");
const canvasPanel = make("section", "rps-canvas-panel");
const canvas = make("canvas", "rps-canvas");
canvas.setAttribute("aria-label", "Research principle artwork canvas");
const canvasNote = make("div", "rps-canvas-note");
canvasNote.textContent = "FIXED CAMERA · DETERMINISTIC FIELD · AUDIO OFF";
canvasPanel.append(canvas, canvasNote);

const inspector = make("aside", "rps-inspector");
const idLabel = make("div", "rps-study-id");
const artTitle = make("h2", "rps-art-title");
const principle = make("p", "rps-principle");
const readout = make("div", "rps-readout");
inspector.append(idLabel, artTitle, principle, readout);

const controls = make("div", "rps-controls");
const transport = make("div", "rps-transport");
const playButton = make("button", "rps-button rps-button-primary");
playButton.type = "button";
const restartButton = make("button", "rps-button");
restartButton.type = "button";
restartButton.textContent = "RESTART";
transport.append(playButton, restartButton);
controls.append(transport);

const speedRow = make("label", "rps-control");
const speedText = make("span", "rps-control-label");
speedText.textContent = "SPEED";
const speedInput = make("input");
speedInput.type = "range";
speedInput.min = "0.25";
speedInput.max = "2.5";
speedInput.step = "0.05";
speedInput.value = "1";
const speedValue = make("output");
speedValue.className = "rps-control-value";
speedRow.append(speedText, speedInput, speedValue);
controls.append(speedRow);

const studyControls = make("div", "rps-study-controls");
const seedRow = make("label", "rps-control");
const seedText = make("span", "rps-control-label");
seedText.textContent = "SEED";
const seedInput = make("input");
seedInput.type = "number";
seedInput.className = "rps-seed-input";
seedInput.value = String(seed);
seedInput.step = "1";
seedRow.append(seedText, seedInput);
controls.append(studyControls, seedRow);

const captureRow = make("div", "rps-capture-row");
const frameButton = make("button", "rps-button");
frameButton.type = "button";
frameButton.textContent = "CAPTURE FRAME";
const manifestButton = make("button", "rps-button");
manifestButton.type = "button";
manifestButton.textContent = "MANIFEST";
const recordButton = make("button", "rps-button");
recordButton.type = "button";
recordButton.textContent = "RECORD 20S";
captureRow.append(frameButton, manifestButton, recordButton);
controls.append(captureRow);

const status = make("div", "rps-status");
status.setAttribute("aria-live", "polite");
status.textContent = "READY";
controls.append(status);

const docs = make("details", "rps-docs");
const docsSummary = make("summary");
docsSummary.textContent = "STUDY NOTES";
const docsBody = make("div", "rps-docs-body");
docs.append(docsSummary, docsBody);
inspector.append(controls, docs);

content.append(canvasPanel, inspector);
root.append(header, studyBar, content);

for (const key of STUDY_ORDER) {
  const option = make("option");
  option.value = key;
  option.textContent = `${STUDIES[key].studyId.toUpperCase()} · ${STUDIES[key].artTitle}`;
  studySelect.append(option);
}

function updateUrl(): void {
  url.searchParams.set("study", definition.key);
  url.searchParams.set("seed", String(seed));
  window.history.replaceState({}, "", url);
}

function resetStudy(): void {
  state = definition.createState(seed);
  clock.reset();
  lastFrame = performance.now();
  status.textContent = "RESTARTED";
  render();
}

function setStudy(key: StudyKey): void {
  definition = STUDIES[key];
  params = Object.fromEntries(definition.controls.map((control) => [control.key, control.value]));
  studySelect.value = key;
  updateUrl();
  seedInput.value = String(seed);
  resetStudy();
}

function formatControlValue(value: number, step: number): string {
  return step < 0.1 ? value.toFixed(2) : value.toFixed(1);
}

function renderStudyControls(): void {
  studyControls.replaceChildren();
  for (const control of definition.controls) {
    const row = make("label", "rps-control");
    const label = make("span", "rps-control-label");
    label.textContent = control.label;
    const input = make("input");
    input.type = "range";
    input.min = String(control.min);
    input.max = String(control.max);
    input.step = String(control.step);
    input.value = String(params[control.key]);
    const output = make("output");
    output.className = "rps-control-value";
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

function updateInspector(): void {
  idLabel.textContent = `${definition.studyId.toUpperCase()} / ${definition.title}`;
  artTitle.textContent = definition.artTitle;
  principle.textContent = definition.principle;
  readout.replaceChildren(...definition.readouts(state).map((line) => {
    const item = make("div", "rps-readout-line");
    item.textContent = line;
    return item;
  }));
  docsBody.replaceChildren(
    ...[
      ["SCIENTIFIC / COMPUTATIONAL CORE", definition.documentation.scientificCore],
      ["ART TRANSLATION", definition.documentation.artTranslation],
      ["WHAT CHANGED", definition.documentation.whatChanged],
      ["WHAT IS NOT CLAIMED", definition.documentation.notClaimed],
    ].map(([label, text]) => {
      const group = make("div", "rps-doc-group");
      const heading = make("strong");
      heading.textContent = label;
      const copy = make("p");
      copy.textContent = text;
      group.append(heading, copy);
      return group;
    }),
  );
  for (const [phase, element] of phaseElements) element.dataset.active = String(phase === currentPhase);
  playButton.textContent = clock.playing ? "PAUSE" : "PLAY";
  speedValue.textContent = `${clock.speed.toFixed(2)}×`;
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
  currentPhase = phaseForElapsed(clock.elapsedSeconds);
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  const background = context.createRadialGradient(canvasWidth * 0.5, canvasHeight * 0.48, 0, canvasWidth * 0.5, canvasHeight * 0.48, Math.max(canvasWidth, canvasHeight) * 0.72);
  background.addColorStop(0, "#0d1119");
  background.addColorStop(0.62, "#07090d");
  background.addColorStop(1, "#030405");
  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  definition.render(context, state, { width: canvasWidth, height: canvasHeight, elapsedSeconds: clock.elapsedSeconds, phase: currentPhase });
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
    downloadBlob(`${definition.studyId}-${definition.key}_seed-${seed}_${currentPhase.toLowerCase()}.png`, blob);
    status.textContent = `${currentPhase} FRAME CAPTURED`;
  }, "image/png");
}

function captureManifest(): void {
  const contentText = JSON.stringify(definition.manifest(state, params), null, 2);
  downloadBlob(`${definition.studyId}-${definition.key}_seed-${seed}.json`, new Blob([contentText], { type: "application/json" }));
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
  const wasPlaying = clock.playing;
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  recorder.onstop = () => {
    downloadBlob(`${definition.studyId}-${definition.key}_seed-${seed}.webm`, new Blob(chunks, { type: mimeType }));
    stream.getTracks().forEach((track) => track.stop());
    clock.playing = wasPlaying;
    recordButton.disabled = false;
    recordButton.textContent = "RECORD 20S";
    status.textContent = "WEBM READY";
  };
  recordButton.disabled = true;
  recordButton.textContent = "RECORDING…";
  status.textContent = "RECORDING 20S";
  clock.playing = true;
  recorder.start();
  window.setTimeout(() => recorder.stop(), 20000);
}

studySelect.addEventListener("change", () => setStudy(studySelect.value as StudyKey));
playButton.addEventListener("click", () => { clock.playing = !clock.playing; status.textContent = clock.playing ? "PLAYING" : "PAUSED"; render(); });
restartButton.addEventListener("click", resetStudy);
speedInput.addEventListener("input", () => { clock.setSpeed(Number(speedInput.value)); status.textContent = `SPEED ${clock.speed.toFixed(2)}×`; render(); });
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
renderStudyControls();
updateUrl();
resizeCanvas();
const stopFrameLoop = startFrameLoop((now) => {
  const delta = Math.max(0, (now - lastFrame) / 1000);
  lastFrame = now;
  const simulatedDelta = clock.advance(delta);
  if (simulatedDelta > 0) state = definition.advanceState(state, simulatedDelta, params);
  render();
});

(window as unknown as Record<string, unknown>).__rps = {
  getStudyKey: () => definition.key,
  getPhase: () => currentPhase,
  getState: () => state,
  getManifest: () => definition.manifest(state, params),
  stop: stopFrameLoop,
};

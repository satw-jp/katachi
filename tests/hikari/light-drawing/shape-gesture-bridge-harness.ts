import * as THREE from "three";
import { OpticsLayer, type CausticField } from "../../../src/studies/cloud-sculpt/optics.ts";
import { BACKLIGHT_STUDY_SHAPE_SOURCE } from "./shape-source-reference.fixture.ts";
import { SHAPE_GESTURE_BRIDGE_CASES, type ShapeGestureBridgeResult } from "./shape-gesture-bridge.fixture.ts";
import { runShapeGestureBridgeCase, type ShapeGestureBridgeSummary } from "./shape-gesture-bridge.ts";

const COMMON_EXPOSURE = 32;
// Chosen before panels: one receiver irradiance unit at the common exposure.
const FIXED_SIGNED_DIFFERENCE_SCALE = 1 / COMMON_EXPOSURE;
type CaseId = typeof SHAPE_GESTURE_BRIDGE_CASES[number]["id"];
type RenderedCard = {
  readonly id: CaseId;
  readonly card: HTMLElement;
  readonly summary: ShapeGestureBridgeSummary;
};

const statusElement = document.querySelector<HTMLElement>("#status")!;
const selectorElement = document.querySelector<HTMLElement>("#selector")!;
const panelsElement = document.querySelector<HTMLElement>("#static-panels")!;
const detailsElement = document.querySelector<HTMLElement>("#details")!;
const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });
const renderedCards = new Map<CaseId, RenderedCard>();

void buildStaticCheckpoint();

function buildStaticCheckpoint(): void {
  let offIrradiance: Float32Array | null = null;
  for (const item of SHAPE_GESTURE_BRIDGE_CASES) {
    let result: ReturnType<typeof runShapeGestureBridgeCase> | null = runShapeGestureBridgeCase(layer, item.gesture === null ? "OFF" : item.gesture);
    const rendered = appendStaticCard(item.id, result.field, result.bridge, result.summary, offIrradiance);
    renderedCards.set(item.id, rendered);
    if (item.id === "OFF") offIrradiance = receiverIrradiance(result.field);
    result = null; // The CausticField and deposited arrays leave scope after this card is painted.
  }
  offIrradiance = null; // It was only temporary input for the three signed ON−OFF canvases.
  for (const item of SHAPE_GESTURE_BRIDGE_CASES) {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = item.label; button.dataset.case = item.id;
    button.addEventListener("click", () => show(item.id));
    selectorElement.append(button);
  }
  show("CENTER");
  statusElement.textContent = "Four fixed CPU states complete — canvases rendered once; no receiver-field arrays retained.";
}

function show(id: CaseId): void {
  const selected = renderedCards.get(id)!;
  selectorElement.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.ariaPressed = String(button.dataset.case === id);
  });
  panelsElement.querySelectorAll<HTMLElement>("article").forEach((card) => {
    card.dataset.selected = String(card.dataset.case === id);
  });
  detailsElement.innerHTML = rows([
    ["state", id],
    ["integrated deposited RGB", rgb(selected.summary.integratedDepositedRgb)],
    ["in / out-domain deposits", `${selected.summary.inDomainDepositCount} / ${selected.summary.outOfDomainDepositCount}`],
    ["fixed signed scale", `${FIXED_SIGNED_DIFFERENCE_SCALE.toExponential(4)} irradiance`],
  ]);
}

function appendStaticCard(
  id: CaseId,
  field: CausticField,
  body: typeof BACKLIGHT_STUDY_SHAPE_SOURCE | ShapeGestureBridgeResult,
  summary: ShapeGestureBridgeSummary,
  offIrradiance: Float32Array | null,
): RenderedCard {
  const card = document.createElement("article");
  card.className = "state-card"; card.dataset.case = id;
  card.innerHTML = `<h2>${id}</h2><div><h3>Body shape / 形</h3><canvas class="body" width="512" height="250"></canvas></div><div><h3>Receiver light / 受光面</h3><canvas class="receiver" width="512" height="512"></canvas></div><div><h3>Signed ON−OFF difference / 差分</h3><canvas class="difference" width="512" height="512"></canvas></div>`;
  panelsElement.append(card);
  drawBody(card.querySelector<HTMLCanvasElement>(".body")!, body);
  drawReceiver(card.querySelector<HTMLCanvasElement>(".receiver")!, field);
  const difference = card.querySelector<HTMLCanvasElement>(".difference")!;
  if (id === "OFF") drawZeroDifference(difference);
  else {
    if (offIrradiance === null) throw new Error("OFF receiver irradiance must precede ON difference rendering");
    drawDifference(difference, field, offIrradiance);
  }
  return { id, card, summary };
}

function drawReceiver(canvas: HTMLCanvasElement, field: CausticField): void {
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(field.width, field.height);
  for (let texel = 0; texel < field.width * field.height; texel++) {
    for (let channel = 0; channel < 3; channel++) image.data[texel * 4 + channel] = tone(field.depositedFluxRgb[texel * 3 + channel] / field.texelArea);
    image.data[texel * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function receiverIrradiance(field: CausticField): Float32Array {
  const irradiance = new Float32Array(field.width * field.height * 3);
  for (let source = 0; source < irradiance.length; source++) irradiance[source] = field.depositedFluxRgb[source] / field.texelArea;
  return irradiance;
}

function drawDifference(canvas: HTMLCanvasElement, onField: CausticField, off: Float32Array): void {
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(onField.width, onField.height);
  for (let texel = 0; texel < onField.width * onField.height; texel++) {
    const source = texel * 3; const target = texel * 4;
    const signed = .2126 * (onField.depositedFluxRgb[source] / onField.texelArea - off[source]) + .7152 * (onField.depositedFluxRgb[source + 1] / onField.texelArea - off[source + 1]) + .0722 * (onField.depositedFluxRgb[source + 2] / onField.texelArea - off[source + 2]);
    const amount = Math.min(1, Math.abs(signed) / FIXED_SIGNED_DIFFERENCE_SCALE);
    image.data[target] = signed >= 0 ? Math.round(35 * amount) : Math.round(255 * amount);
    image.data[target + 1] = signed >= 0 ? Math.round(228 * amount) : Math.round(94 * amount);
    image.data[target + 2] = signed >= 0 ? Math.round(255 * amount) : Math.round(36 * amount);
    image.data[target + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function drawZeroDifference(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawBody(canvas: HTMLCanvasElement, body: typeof BACKLIGHT_STUDY_SHAPE_SOURCE | ShapeGestureBridgeResult): void {
  const shape = "shape" in body ? body.shape : body;
  const context = canvas.getContext("2d")!; const { width, height } = canvas;
  context.fillStyle = "#061017"; context.fillRect(0, 0, width, height);
  const project = (x: number, y: number, z: number): [number, number] => [width * .52 + (x - z) * 105, height * .68 - y * 122 + (x + z) * 32];
  for (let index = 0; index < shape.balls.length; index++) {
    const ball = shape.balls[index]; const [x, y] = project(ball.center.x, ball.center.y, ball.center.z);
    context.beginPath(); context.arc(x, y, ball.radius * 74, 0, Math.PI * 2);
    const added = index >= BACKLIGHT_STUDY_SHAPE_SOURCE.balls.length;
    context.fillStyle = added ? "rgba(255,188,105,.19)" : "rgba(107,218,224,.10)";
    context.strokeStyle = added ? "rgba(255,210,139,.94)" : "rgba(161,239,239,.56)";
    context.fill(); context.stroke();
  }
}

function tone(irradiance: number): number {
  const exposed = Math.max(0, irradiance * COMMON_EXPOSURE);
  return Math.round(255 * exposed / (1 + exposed));
}
function rgb(value: { r: number; g: number; b: number }): string { return `${value.r.toExponential(4)} / ${value.g.toExponential(4)} / ${value.b.toExponential(4)}`; }
function rows(values: Array<[string, string]>): string { return values.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join(""); }

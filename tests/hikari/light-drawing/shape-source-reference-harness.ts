import * as THREE from "three";
import { OpticsLayer, type CausticField } from "../../../src/studies/cloud-sculpt/optics.ts";
import { BACKLIGHT_STUDY_SHAPE_SOURCE, SHAPE_SOURCE_REFERENCE_PANELS } from "./shape-source-reference.fixture.ts";
import { runShapeSourceReferencePanel, type ShapeSourceReferenceSummary } from "./shape-source-reference.ts";

const COMMON_EXPOSURE = 32;
const panelsElement = document.querySelector<HTMLElement>("#panels")!;
const statusElement = document.querySelector<HTMLElement>("#status")!;
const layer = new OpticsLayer(new THREE.Scene(), { disableWebGpu: true });

void renderPanels();

async function renderPanels(): Promise<void> {
  for (const panel of SHAPE_SOURCE_REFERENCE_PANELS) {
    await nextFrame();
    let result: ReturnType<typeof runShapeSourceReferencePanel> | null = runShapeSourceReferencePanel(layer, panel);
    appendPanel(panel.sunSize, result.field, result.summary);
    result = null; // Fields are dropped once their pixels and summary are drawn.
  }
  statusElement.textContent = "Fixed CPU panels complete — no field cache retained.";
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function appendPanel(sunSize: number, field: CausticField, summary: ShapeSourceReferenceSummary): void {
  const panel = document.createElement("article"); panel.className = "panel";
  panel.innerHTML = `<h2>Sun size ${sunSize}°</h2><p>Only sun size changes. Common fixed exposure ${COMMON_EXPOSURE}; no per-panel normalization.</p><canvas class="shape-preview" width="512" height="250"></canvas><div class="preview-label">Fixed ShapeSource ball projection — explanatory only; not a renderer.</div><canvas class="receiver" width="512" height="512" aria-label="Actual CPU receiver deposited flux"></canvas><dl class="metrics"></dl>`;
  panelsElement.append(panel);
  drawShapePreview(panel.querySelector<HTMLCanvasElement>(".shape-preview")!);
  drawReceiver(panel.querySelector<HTMLCanvasElement>(".receiver")!, field);
  panel.querySelector<HTMLElement>(".metrics")!.innerHTML = rows([
    ["integrated deposited RGB", rgb(summary.integratedDepositedRgb)],
    ["in / out-domain deposits", `${summary.inDomainDepositCount} / ${summary.outOfDomainDepositCount}`],
    ["closure residual RGB", rgb(summary.closureResidualRgb)],
    ["relative closure residual", summary.relativeClosureResidual.toExponential(3)],
  ]);
}

function drawReceiver(canvas: HTMLCanvasElement, field: CausticField): void {
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(field.width, field.height);
  for (let texel = 0; texel < field.width * field.height; texel++) {
    const source = texel * 3; const target = texel * 4;
    image.data[target] = tone(field.depositedFluxRgb[source] / field.texelArea);
    image.data[target + 1] = tone(field.depositedFluxRgb[source + 1] / field.texelArea);
    image.data[target + 2] = tone(field.depositedFluxRgb[source + 2] / field.texelArea);
    image.data[target + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function tone(irradiance: number): number {
  const exposed = Math.max(0, irradiance * COMMON_EXPOSURE);
  return Math.round(255 * exposed / (1 + exposed));
}

function drawShapePreview(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d")!; const { width, height } = canvas;
  context.fillStyle = "#061017"; context.fillRect(0, 0, width, height);
  const project = (x: number, y: number, z: number): [number, number] => [width * .52 + (x - z) * 105, height * .68 - y * 122 + (x + z) * 32];
  for (const ball of BACKLIGHT_STUDY_SHAPE_SOURCE.balls) {
    const [x, y] = project(ball.center.x, ball.center.y, ball.center.z);
    context.beginPath(); context.arc(x, y, ball.radius * 74, 0, Math.PI * 2);
    context.fillStyle = "rgba(107,218,224,.10)"; context.fill(); context.strokeStyle = "rgba(161,239,239,.56)"; context.stroke();
  }
}

function rgb(value: { r: number; g: number; b: number }): string { return `${value.r.toExponential(4)} / ${value.g.toExponential(4)} / ${value.b.toExponential(4)}`; }
function rows(values: Array<[string, string]>): string { return values.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join(""); }

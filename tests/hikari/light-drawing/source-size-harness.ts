import { LD1_GEOMETRY, lowerSurfaceAndGradient, physicalDisplayRgb, reliefAndGradient } from "../../../src/studies/cloud-sculpt/lightDrawing/ld1Reference.ts";
import { LD2_WARNINGS, evaluateLd2ReadinessGates, runLd2SourceSize, type Ld2Case, type Ld2GateEvaluation } from "../../../src/studies/cloud-sculpt/lightDrawing/ld2SourceSize.ts";

const casesElement = document.querySelector<HTMLElement>("#cases")!;
const state = document.querySelector<HTMLElement>("#state")!;
const readinessStatus = document.querySelector<HTMLElement>("#readiness-status")!;
const readinessExplanation = document.querySelector<HTMLElement>("#readiness-explanation")!;
const stability = document.querySelector<HTMLElement>("#stability")!;

/** This route has no controls: its visible columns are one common primary-32 run. */
requestAnimationFrame(() => {
  const primary16 = runLd2SourceSize(16384, "primary");
  const primary32 = runLd2SourceSize(32768, "primary");
  const audit16 = runLd2SourceSize(16384, "audit");
  const audit32 = runLd2SourceSize(32768, "audit");
  const gates = evaluateLd2ReadinessGates(primary16, primary32, audit16, audit32);
  renderReadiness(gates);
  for (const item of primary32.cases) appendCase(item);
  state.textContent = "primary/audit の固定 16,384 / 32,768 サンプル CPU 実行から判定。表示する3列は primary 32,768 の radius-8 readiness reconstruction で、同じ形・512²座標枠・露出です。半径8は 512 / 128 × LD1半径2 で固定しました。";
});

function renderReadiness(gates: Ld2GateEvaluation): void {
  readinessStatus.className = gates.qualified ? "qualified-status" : "failed-status";
  readinessStatus.textContent = gates.qualified ? "LOCAL CPU READINESS: QUALIFIED" : "LOCAL CPU READINESS: FAILED / 未合格";
  readinessExplanation.textContent = gates.qualified
    ? "固定の primary/audit 16,384 / 32,768 実行は full-field 17×17 local concentration による局所 CPU readiness を満たしました。正式 OPT-LD-1/2 は未開始・未受理です。"
    : "固定の primary/audit 16,384 / 32,768 実行に未達の gate があります。正式工程へは進めません。";
  stability.textContent = gates.qualified
    ? "Gate stability: all fixed local-concentration convergence, cross-estimator, closure, support, and trace checks passed."
    : `Gate stability: ${gates.failures.length} failed checks — ${gates.failures.map((failure) => `${failure.code} (${formatGateValue(failure.actual)} > ${formatGateValue(failure.threshold)})`).join("; ")}`;
}

function formatGateValue(value: number): string { return value.toExponential(3); }

function appendCase(item: Ld2Case): void {
  const panel = document.createElement("article"); panel.className = "case";
  panel.innerHTML = `<h2>光源径 ${item.diameterDegrees}°</h2><p class="caption">同じ形から計算した光。柔らかくなる傾向を観察。</p><canvas class="body-canvas" width="640" height="360" aria-label="解析的な二面体の斜投影"></canvas><p class="body-note">analytic explanatory projection — not ray-traced production BODY</p><canvas class="receiver-canvas" width="512" height="512" aria-label="実計算の受け面光束"></canvas><dl class="metrics"></dl>`;
  casesElement.append(panel);
  drawBody(panel.querySelector<HTMLCanvasElement>(".body-canvas")!, item.diameterDegrees);
  drawReceiver(panel.querySelector<HTMLCanvasElement>(".receiver-canvas")!, physicalDisplayRgb(item.qualificationField, item.result.config));
  const m = item.metrics;
  panel.querySelector<HTMLElement>(".metrics")!.innerHTML = rows([
    ["local concentration (17×17 / 0.09296875)", m.localConcentration.toExponential(4)], ["有効面積", m.effectiveArea.toFixed(1)],
    ["max-texel diagnostic", m.peakConcentration.toExponential(4)],
    ["生の透過 RGB", rgb(m.rawTransmission)], ["ROI 重心", m.centroid ? `${m.centroid.u.toFixed(4)}, ${m.centroid.v.toFixed(4)}` : "—"],
    ["主軸", m.principalAxisRadians === null ? "—" : `${(m.principalAxisRadians * 180 / Math.PI).toFixed(2)}°`],
    ["miss / escape / TIR", `${m.misses} / ${rgb(m.escaped)} / ${rgb(m.tir)}`], ["support 漏れ", m.supportLeakage.toExponential(2)], ["終端閉包残差", rgb(m.terminalClosureResidual)],
  ]);
}

function drawReceiver(canvas: HTMLCanvasElement, values: Float32Array): void {
  const context = canvas.getContext("2d")!; const image = context.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) { const a = i * 3; const b = i * 4; image.data[b] = tone(values[a]); image.data[b + 1] = tone(values[a + 1]); image.data[b + 2] = tone(values[a + 2]); image.data[b + 3] = 255; }
  context.putImageData(image, 0, 0);
}

/** Fixed isometric world projection; it draws analytic upper and lower surfaces only. */
function drawBody(canvas: HTMLCanvasElement, diameter: number): void {
  const c = canvas.getContext("2d")!; const w = canvas.width; const h = canvas.height;
  c.clearRect(0, 0, w, h); c.fillStyle = "#071015"; c.fillRect(0, 0, w, h);
  const project = (x: number, y: number, z: number): [number, number] => [w * .5 + (x - z) * 125, h * .70 - y * 190 + (x + z) * 38];
  const surface = (lower: boolean) => {
    for (let j = 0; j <= 16; j++) { c.beginPath(); for (let i = 0; i <= 24; i++) { const x = -1.08 + i * 2.16 / 24; const z = -1.08 + j * 2.16 / 16; const relief = reliefAndGradient(x, z, .18, "connected-ridge", 0, 0).relief; const y = lower ? lowerSurfaceAndGradient(x, z, .18, "connected-ridge", "opposing", 0, 0).height : LD1_GEOMETRY.baseTopY + relief; const p = project(x, y, z); i ? c.lineTo(...p) : c.moveTo(...p); } c.stroke(); }
    for (let i = 0; i <= 24; i++) { c.beginPath(); for (let j = 0; j <= 16; j++) { const x = -1.08 + i * 2.16 / 24; const z = -1.08 + j * 2.16 / 16; const relief = reliefAndGradient(x, z, .18, "connected-ridge", 0, 0).relief; const y = lower ? lowerSurfaceAndGradient(x, z, .18, "connected-ridge", "opposing", 0, 0).height : LD1_GEOMETRY.baseTopY + relief; const p = project(x, y, z); j ? c.lineTo(...p) : c.moveTo(...p); } c.stroke(); }
  };
  c.lineWidth = 1; c.strokeStyle = "rgba(236,176,99,.48)"; surface(true); c.strokeStyle = "rgba(114,221,232,.72)"; surface(false);
  drawSourceDirectionExplanation(c, w, diameter);
  c.fillStyle = "#8eb9c2"; c.font = "12px ui-monospace, monospace"; c.fillText("上面（形） / 下側（反対向き出口） / 縦の厚み", 16, 43);
}

/** A source-direction key only: these are not traced rays or receiver marks. */
function drawSourceDirectionExplanation(c: CanvasRenderingContext2D, width: number, diameter: number): void {
  const origin = { x: width * .50, y: 26 }; const length = 56;
  const radiusSlope = Math.tan((diameter * Math.PI / 180) / 2);
  const visualHalfAngle = Math.min(.56, .055 + Math.atan(radiusSlope) * 1.9);
  const endpoint = (angle: number): [number, number] => [origin.x + Math.sin(angle) * length, origin.y + Math.cos(angle) * length];
  c.lineWidth = 1.4; c.strokeStyle = "rgba(255,205,123,.86)";
  for (const angle of [-visualHalfAngle, 0, visualHalfAngle]) { const end = endpoint(angle); c.beginPath(); c.moveTo(origin.x, origin.y); c.lineTo(...end); c.stroke(); }
  c.fillStyle = "#ffd98f"; c.beginPath(); c.arc(origin.x, origin.y, 2.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#d5e7ec"; c.font = "11px ui-monospace, monospace"; c.fillText(`source-direction explanation · ${diameter}° diameter`, 16, 18);
}
function tone(value: number): number { return Math.round(255 * Math.max(0, Math.min(1, value / (1 + value)))); }
function rgb(value: { r: number; g: number; b: number }): string { return `${value.r.toFixed(5)} / ${value.g.toFixed(5)} / ${value.b.toFixed(5)}`; }
function rows(values: Array<[string, string]>): string { return values.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join(""); }
void LD2_WARNINGS;

import { physicalDisplayRgb } from "../../../src/studies/cloud-sculpt/lightDrawing/ld1Reference.ts";
import { createLd2SourceSizeStabilityBundle, type Ld2StabilityPanel } from "./source-size-stability.ts";

const panelsElement = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("#panels");
const evidenceElement = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("#gate-evidence");
const readinessStatusElement = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("#readiness-status");
const readinessFooterElement = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("#readiness-footer");

export const LD2_RADIUS2_NEGATIVE_EVIDENCE_CODES = [
  "primary:5:max-texel-concentration-convergence", "primary:5:effective-area-convergence",
  "primary:20:max-texel-concentration-convergence", "primary:20:effective-area-convergence",
  "audit:5:max-texel-concentration-convergence", "audit:5:effective-area-convergence",
  "audit:20:max-texel-concentration-convergence", "audit:20:effective-area-convergence",
] as const;

export interface Ld2EvidenceFailure { code: string; message: string; actual: number; threshold: number }
export interface Ld2GateStatus { qualified: boolean; failures: ReadonlyArray<Ld2EvidenceFailure> }

/** Pure ordered mapping used by the runtime evidence table; it does not touch the DOM. */
export function mapRadius2NegativeEvidence(failures: ReadonlyArray<Ld2EvidenceFailure>): readonly Ld2EvidenceFailure[] {
  const byCode = new Map(failures.map((failure) => [failure.code, failure]));
  return LD2_RADIUS2_NEGATIVE_EVIDENCE_CODES.map((code) => {
    const failure = byCode.get(code);
    if (!failure) throw new Error(`radius-2 negative evidence is missing required historical failure: ${code}`);
    return failure;
  });
}

/** No controls or reruns: this one page load makes the fixed four CPU runs once. */
if (panelsElement && evidenceElement && readinessStatusElement && readinessFooterElement) requestAnimationFrame(() => {
  const bundle = createLd2SourceSizeStabilityBundle();
  renderReadinessStatus(bundle.gates);
  renderGateEvidence(bundle.gates, bundle.radius8MaxTexelNegativeEvidence.failures, bundle.radius2NegativeEvidence.failures);
  for (const panel of bundle.panels) appendPanel(panel);
});

export function deriveLd2ReadinessCopy(gates: Ld2GateStatus): { className: "qualified-status" | "failed-status"; status: string; footer: string } {
  const qualified = gates.qualified && gates.failures.length === 0;
  return qualified
    ? { className: "qualified-status", status: "LOCAL CPU READINESS: QUALIFIED", footer: "LOCAL CPU READINESS: QUALIFIED。FORMAL OPT-LD-2 HAS NOT STARTED。NOT PRODUCTION。これは local CPU verification であり、formal GO または acceptance ではありません。" }
    : { className: "failed-status", status: `LOCAL CPU READINESS: FAILED / NOT QUALIFIED (${gates.failures.length} failures)`, footer: `LOCAL CPU READINESS: FAILED / NOT QUALIFIED (${gates.failures.length} failures)。FORMAL OPT-LD-2 HAS NOT STARTED。NOT PRODUCTION。これは local CPU verification であり、formal GO または acceptance ではありません。` };
}

function renderReadinessStatus(gates: Ld2GateStatus): void {
  const copy = deriveLd2ReadinessCopy(gates);
  readinessStatusElement!.className = copy.className;
  readinessStatusElement!.textContent = copy.status;
  readinessFooterElement!.textContent = copy.footer;
}

function renderGateEvidence(
  gates: Ld2GateStatus,
  maxTexelFailures: ReadonlyArray<Ld2EvidenceFailure>,
  radius2Failures: ReadonlyArray<Ld2EvidenceFailure>,
): void {
  const radius2Rows = mapRadius2NegativeEvidence(radius2Failures).map((failure) => {
    return `<tr><td>${escapeHtml(failure.message)}</td><td class="ratio">${formatRatio(failure.actual)}</td><td class="ratio">${formatRatio(failure.threshold)}</td><td class="where">${failureColumnExplanation(failure.code)}</td></tr>`;
  }).join("");
  const maxTexelRows = maxTexelFailures.map((failure) => `<tr><td>${escapeHtml(failure.message)}</td><td class="ratio">${formatRatio(failure.actual)}</td><td class="ratio">${formatRatio(failure.threshold)}</td><td class="where">${failureColumnExplanation(failure.code)}</td></tr>`).join("");
  const status = gates.qualified ? "LOCAL CPU READINESS: QUALIFIED — unchanged evaluator reports 0 failures" : `LOCAL CPU READINESS: PARTIAL / NOT QUALIFIED — unchanged evaluator reports ${gates.failures.length} failures`;
  const currentFailures = gates.failures.length === 0 ? "None." : gates.failures.map((failure) => `${escapeHtml(failure.code)} (${formatRatio(failure.actual)} > ${formatRatio(failure.threshold)})`).join("; ");
  evidenceElement!.innerHTML = `<h2>${status}</h2><p>Active readiness uses full-field local concentration: max complete 17×17 window / total luminance, physical side 0.09296875. The frozen radius-8 field, threshold, samples, and display are unchanged. Current active failures: ${currentFailures}</p><h3>Radius-8 max-texel diagnostic negative evidence: exact two failures</h3><p>Max-texel concentration is diagnostic only and is not the active qualifying metric.</p>${evidenceTable(maxTexelRows)}<h3>Radius-2 negative evidence retained: exact historical eight failures</h3><p>These are a pure replay of LD1's retained radius-2 reconstructed field, not the radius-8 qualification field.</p>${evidenceTable(radius2Rows)}`;
}

function evidenceTable(rows: string): string { return `<table><thead><tr><th>gate</th><th>actual ratio</th><th>threshold</th><th>visual / quantitative mapping</th></tr></thead><tbody>${rows}</tbody></table>`; }

export function failureColumnExplanation(code: string): string {
  if (code.startsWith("primary-audit:")) return "primary32 ↔ audit32: visual independent-estimator comparison";
  if (code.startsWith("primary:")) return "primary16 ↔ primary32: row の first ↔ middle column";
  return "audit16 ↔ audit32: quantitative-only; audit16 is not rendered";
}

function appendPanel(panel: Ld2StabilityPanel): void {
  const article = document.createElement("article");
  article.className = "panel";
  article.dataset.diameter = String(panel.diameterDegrees);
  article.dataset.run = panel.runId;
  const label = runLabel(panel.runId);
  article.innerHTML = `<h2>${panel.diameterDegrees}° · ${label}</h2><p>complete receiver frame [-1.4, 1.4]² · radius-8 qualification field</p><canvas class="receiver-canvas" width="512" height="512" aria-label="${panel.diameterDegrees} degree ${label} complete receiver field"></canvas><dl class="metrics"></dl>`;
  panelsElement!.append(article);
  drawReceiver(article.querySelector<HTMLCanvasElement>("canvas")!, physicalDisplayRgb(panel.item.qualificationField, panel.item.result.config));
  const metrics = panel.item.metrics;
  article.querySelector<HTMLElement>(".metrics")!.innerHTML = metricRows([
    ["peak concentration", metrics.peakConcentration.toExponential(6)],
    ["local concentration (17×17)", metrics.localConcentration.toExponential(6)],
    ["effective area", metrics.effectiveArea.toFixed(4)],
    ["raw transmission RGB", rgb(metrics.rawTransmission)],
  ]);
}

function runLabel(runId: Ld2StabilityPanel["runId"]): string {
  return runId === "primary16" ? "primary 16,384" : runId === "primary32" ? "primary 32,768" : "audit 32,768";
}

/** Same fixed display transfer for every physicalDisplayRgb value; no normalization or enhancement. */
function drawReceiver(canvas: HTMLCanvasElement, values: Float32Array): void {
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(512, 512);
  for (let index = 0; index < 512 * 512; index++) {
    const source = index * 3; const target = index * 4;
    image.data[target] = tone(values[source]); image.data[target + 1] = tone(values[source + 1]); image.data[target + 2] = tone(values[source + 2]); image.data[target + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function tone(value: number): number { return Math.round(255 * Math.max(0, Math.min(1, value / (1 + value)))); }
/** String preserves the evaluator's numeric value without choosing display precision. */
function formatRatio(value: number): string { return String(value); }
function rgb(value: { r: number; g: number; b: number }): string { return `${value.r.toFixed(6)} / ${value.g.toFixed(6)} / ${value.b.toFixed(6)}`; }
function metricRows(rows: ReadonlyArray<readonly [string, string]>): string { return rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join(""); }
function escapeHtml(value: string): string { return value.replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]!); }

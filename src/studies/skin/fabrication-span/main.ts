import "./fabricationSpan.css";
import { buildFabricationSpanCoupon } from "./fabricationSpanCoupon.ts";
import { generateMaterialSpanGcode } from "./fabricationSpanGcode.ts";
import { FABRICATION_SPAN_PRESETS } from "./fabricationSpanPresets.ts";
import { validateMaterialSpanCoupon } from "./fabricationSpanValidation.ts";
import type { MaterialSpanGcodeArtifact, MaterialSpanVariantId } from "./fabricationSpanTypes.ts";

const app = document.querySelector<HTMLElement>("[data-fabrication-span-app]");
if (!app) throw new Error("Fabrication Span Lab root is missing");

const generatorCommit = import.meta.env.VITE_GIT_COMMIT ?? "uncommitted";

app.innerHTML = `
  <div class="fabrication-span-shell">
    <div class="fabrication-span-kicker">Katachi · independent fabrication study</div>
    <h1>Material Span<br />Coupon v0</h1>
    <p class="fabrication-span-note">Bambu Lab A1 · 0.8 mm nozzle · PLA. The line below is a <strong>Commanded Path</strong>, not a prediction of the final physical filament.</p>
    <div class="fabrication-span-grid">
      <section class="fabrication-span-panel">
        <h2>Commanded Path</h2>
        <svg class="fabrication-span-svg" viewBox="30 0 60 28" role="img" aria-label="Commanded Material Span path between Anchor A and Anchor B">
          <line x1="35" y1="20" x2="85" y2="20" stroke="#303a42" stroke-width="0.2" />
          <g id="fabrication-span-path-layer"></g>
        </svg>
        <p class="fabrication-span-meta" id="fabrication-span-path-summary"></p>
      </section>
      <section class="fabrication-span-panel">
        <h2>Variant</h2>
        <div class="fabrication-span-controls">
          <label>Preset<select id="fabrication-span-variant"></select></label>
          <label>Speed mm/s<input id="fabrication-span-speed" type="number" min="1" max="60" step="1" value="20" /></label>
        </div>
        <div class="fabrication-span-status" id="fabrication-span-status" data-validation="pass" role="status"></div>
        <button id="fabrication-span-generate" type="button">Generate review G-code</button>
        <div class="fabrication-span-links">
          <a id="fabrication-span-gcode-download" hidden>Download G-code</a>
          <a id="fabrication-span-metadata-download" hidden>Download metadata JSON</a>
        </div>
        <pre class="fabrication-span-output" id="fabrication-span-output">No file generated yet.</pre>
      </section>
    </div>
    <section class="fabrication-span-panel">
      <h2>Anchors and contract</h2>
      <table class="fabrication-span-table">
        <tbody>
          <tr><th>Anchor A</th><td>40, 90, 20 mm</td></tr>
          <tr><th>Anchor B</th><td>80, 90, 20 mm</td></tr>
          <tr><th>Distance</th><td>40 mm XY</td></tr>
          <tr><th>Extrusion</th><td>M82 absolute E; deterministic area / filament-area model</td></tr>
          <tr><th>Safety</th><td>Coupon bounds, finite motion, feed, E, temperature and fan checks; invalid export is blocked</td></tr>
          <tr><th>Physical result</th><td>Measure sag, attachment and repeatability on the printed coupon; software does not simulate sag</td></tr>
        </tbody>
      </table>
    </section>
  </div>
`;

const variantSelect = document.querySelector<HTMLSelectElement>("#fabrication-span-variant")!;
const speedInput = document.querySelector<HTMLInputElement>("#fabrication-span-speed")!;
const status = document.querySelector<HTMLElement>("#fabrication-span-status")!;
const generateButton = document.querySelector<HTMLButtonElement>("#fabrication-span-generate")!;
const pathLayer = document.querySelector<SVGGElement>("#fabrication-span-path-layer")!;
const pathSummary = document.querySelector<HTMLElement>("#fabrication-span-path-summary")!;
const output = document.querySelector<HTMLElement>("#fabrication-span-output")!;
const gcodeDownload = document.querySelector<HTMLAnchorElement>("#fabrication-span-gcode-download")!;
const metadataDownload = document.querySelector<HTMLAnchorElement>("#fabrication-span-metadata-download")!;
let latestArtifact: MaterialSpanGcodeArtifact | null = null;
let objectUrls: string[] = [];

for (const preset of FABRICATION_SPAN_PRESETS) {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.label;
  variantSelect.append(option);
}

function clearObjectUrls(): void {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}

function renderPreview(coupon: ReturnType<typeof buildFabricationSpanCoupon>): void {
  pathLayer.innerHTML = "";
  const scale = 1;
  const points = coupon.path.points.map((point) => `${point.x * scale},${20 - (point.z - 15) * scale}`).join(" ");
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("class", "commanded-path");
  polyline.setAttribute("points", points);
  pathLayer.append(polyline);
  for (const [id, point] of [["A", coupon.anchors.a.positionMm], ["B", coupon.anchors.b.positionMm]] as const) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", "anchor");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(20 - (point.z - 15)));
    circle.setAttribute("r", "1.1");
    pathLayer.append(circle);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(point.x - 1));
    label.setAttribute("y", String(20 - (point.z - 15) - 2));
    label.textContent = id;
    pathLayer.append(label);
  }
  pathSummary.textContent = `A → B · ${coupon.path.points.length - 1} commanded segments · lift ${coupon.parameters.spanLiftMm.toFixed(1)} mm · physical sag is measured, not rendered`;
}

function update(): void {
  clearObjectUrls();
  latestArtifact = null;
  gcodeDownload.hidden = true;
  metadataDownload.hidden = true;
  const variantId = variantSelect.value as MaterialSpanVariantId;
  const speed = Number(speedInput.value);
  const coupon = buildFabricationSpanCoupon(variantId, { printSpeedMmPerSec: speed });
  renderPreview(coupon);
  const result = validateMaterialSpanCoupon(coupon);
  status.dataset.validation = result.ok ? "pass" : "fail";
  status.textContent = result.ok ? "Safety validation PASS — ready to generate a review file." : `Export blocked — ${result.errors[0]}`;
  generateButton.disabled = !result.ok;
  output.textContent = "No file generated yet.";
}

function downloadArtifact(): void {
  if (!latestArtifact) return;
  clearObjectUrls();
  const gcodeUrl = URL.createObjectURL(new Blob([latestArtifact.gcode], { type: "text/plain" }));
  const metadataUrl = URL.createObjectURL(new Blob([JSON.stringify(latestArtifact.metadata, null, 2) + "\n"], { type: "application/json" }));
  objectUrls = [gcodeUrl, metadataUrl];
  gcodeDownload.href = gcodeUrl;
  gcodeDownload.download = latestArtifact.fileName;
  metadataDownload.href = metadataUrl;
  metadataDownload.download = latestArtifact.fileName.replace(/\.gcode$/, ".json");
  gcodeDownload.hidden = false;
  metadataDownload.hidden = false;
}

variantSelect.addEventListener("change", () => {
  const preset = FABRICATION_SPAN_PRESETS.find((candidate) => candidate.id === variantSelect.value);
  if (preset) speedInput.value = String(preset.parameters.printSpeedMmPerSec);
  update();
});
speedInput.addEventListener("input", update);
generateButton.addEventListener("click", () => {
  const variantId = variantSelect.value as MaterialSpanVariantId;
  const coupon = buildFabricationSpanCoupon(variantId, { printSpeedMmPerSec: Number(speedInput.value) });
  latestArtifact = generateMaterialSpanGcode(coupon, { variantId, generatorCommit });
  status.dataset.validation = "pass";
  status.textContent = `Generated ${latestArtifact.fileName} · ${latestArtifact.lineCount} lines · ${latestArtifact.byteLength} bytes.`;
  output.textContent = latestArtifact.gcode.split("\n").slice(0, 18).join("\n") + "\n…";
  downloadArtifact();
});

update();

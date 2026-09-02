import "./style.css";
import manifest from "./manifest.json";
import {
  buildFabricationSpanCoupon,
  DEFAULT_EXTRUSION_PRESETS,
  DEFAULT_FABRICATION_FIXTURE,
  DEFAULT_FABRICATION_PROFILE,
  DEFAULT_FEED_PRESETS,
  generateFabricationGcode,
  type FabricationFixture,
  type FabricationProfile,
  type FabricationSpanCoupon,
  type ExtrusionPreset,
  type FeedPreset,
} from "./model.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("fabrication span app root is missing");

const profileInputs = [
  { key: "nozzleDiameterMm", label: "Nozzle diameter", value: DEFAULT_FABRICATION_PROFILE.nozzleDiameterMm, step: "0.05" },
  { key: "filamentDiameterMm", label: "Filament diameter", value: DEFAULT_FABRICATION_PROFILE.filamentDiameterMm, step: "0.05" },
  { key: "lineWidthMm", label: "Line width", value: DEFAULT_FABRICATION_PROFILE.lineWidthMm, step: "0.01" },
  { key: "layerHeightMm", label: "Layer height", value: DEFAULT_FABRICATION_PROFILE.layerHeightMm, step: "0.01" },
] as const;

const fixtureInputs = [
  { key: "spanLengthMm", label: "Span length", value: DEFAULT_FABRICATION_FIXTURE.spanLengthMm, step: "0.5" },
  { key: "rowSpacingMm", label: "Row spacing", value: DEFAULT_FABRICATION_FIXTURE.rowSpacingMm, step: "0.5" },
  { key: "railWidthMm", label: "Rail width", value: DEFAULT_FABRICATION_FIXTURE.railWidthMm, step: "0.5" },
  { key: "railDepthMm", label: "Rail depth", value: DEFAULT_FABRICATION_FIXTURE.railDepthMm, step: "0.5" },
  { key: "railHeightMm", label: "Rail top Z", value: DEFAULT_FABRICATION_FIXTURE.railHeightMm, step: "0.1" },
] as const;

const numberFieldMarkup = (field: { key: string; label: string; value: number; step: string }, group: string): string => `
  <label class="number-field">
    <span>${field.label}</span>
    <span class="number-input"><input data-group="${group}" data-key="${field.key}" type="number" value="${field.value}" step="${field.step}" min="0.001" inputmode="decimal" /><small>mm</small></span>
  </label>`;

const feedPresetMarkup = DEFAULT_FEED_PRESETS.map((preset) => `
  <label class="preset-field">
    <span><b>${preset.id}</b> ${preset.label}</span>
    <span class="number-input"><input data-preset-group="feed" data-preset-id="${preset.id}" type="number" value="${preset.feedRateMmPerMin}" step="50" min="1" inputmode="numeric" /><small>mm/min</small></span>
  </label>`).join("");

const extrusionPresetMarkup = DEFAULT_EXTRUSION_PRESETS.map((preset) => `
  <label class="preset-field">
    <span><b>${preset.id}</b> ${preset.label}</span>
    <span class="number-input"><input data-preset-group="extrusion" data-preset-id="${preset.id}" type="number" value="${preset.multiplier}" step="0.01" min="0.01" inputmode="decimal" /><small>×</small></span>
  </label>`).join("");

app.innerHTML = `
  <div class="fabrication-app">
    <aside class="control-panel">
      <header class="app-header">
        <p class="eyebrow">SKIN / RESEARCH PROTOTYPE</p>
        <h1>FABRICATION<br />SPAN <span>0</span></h1>
        <p class="lede">成立条件だけを計算し、最終的な線は材料・重力・冷却へ委ねる。</p>
        <div class="badges"><span>RESEARCH PRESET</span><span class="warning">NOT PHYSICALLY VERIFIED</span></div>
        <p class="version">v${manifest.version} · ${manifest.updatedAt}</p>
      </header>

      <section class="panel-section" aria-labelledby="profile-heading">
        <div class="section-heading"><span class="section-index">01</span><h2 id="profile-heading">Profile</h2></div>
        <p class="section-note">明示したfabrication profile。Bambu Studio純正値の複製ではありません。</p>
        <div class="field-grid">${profileInputs.map((field) => numberFieldMarkup(field, "profile")).join("")}</div>
      </section>

      <section class="panel-section" aria-labelledby="fixture-heading">
        <div class="section-heading"><span class="section-index">02</span><h2 id="fixture-heading">Fixture</h2></div>
        <p class="section-note">A/Bは左右railの中心。すべてのspanは同じ長さでY方向に並ぶ。</p>
        <div class="field-grid">${fixtureInputs.map((field) => numberFieldMarkup(field, "fixture")).join("")}</div>
      </section>

      <section class="panel-section" aria-labelledby="sweep-heading">
        <div class="section-heading"><span class="section-index">03</span><h2 id="sweep-heading">Sweep</h2></div>
        <p class="section-note">Feed × extrusion multiplier。値は再現可能な研究presetで、安全保証ではありません。</p>
        <div class="preset-columns">
          <div><h3>Feed rate</h3>${feedPresetMarkup}</div>
          <div><h3>Extrusion</h3>${extrusionPresetMarkup}</div>
        </div>
        <button id="regenerate" class="action-button" type="button">Regenerate sweep</button>
      </section>

      <section class="panel-section readout-section" aria-labelledby="readout-heading">
        <div class="section-heading"><span class="section-index">04</span><h2 id="readout-heading">Output</h2></div>
        <dl class="readout-grid">
          <div><dt>Planned spans</dt><dd id="span-count">—</dd></div>
          <div><dt>Span length</dt><dd id="span-length">—</dd></div>
          <div><dt>Trajectory</dt><dd id="trajectory-kind">—</dd></div>
          <div><dt>Extrusion mode</dt><dd>relative E</dd></div>
        </dl>
        <button id="export-gcode" class="action-button primary" type="button">Export G-code</button>
        <p id="status" class="status" role="status" aria-live="polite">Generating deterministic coupon…</p>
      </section>

      <footer class="panel-footer">
        <strong>Machine start/end not included.</strong>
        <span>Printer communication, calibration, purge, AMS, auto-print and deploy are outside this study.</span>
      </footer>
    </aside>

    <main class="preview-area">
      <header class="preview-header">
        <div><p class="eyebrow">PLANNED NOZZLE TRAJECTORY</p><h2>Material Span Coupon</h2></div>
        <div class="preview-meta"><span id="preview-profile">0.8 mm nozzle</span><span id="preview-z">Z 3.0 mm</span></div>
      </header>
      <section class="preview-card" aria-label="Planned straight span preview">
        <div id="preview" class="preview-canvas"></div>
        <div class="legend"><span><i class="legend-travel"></i>travel</span><span><i class="legend-span"></i>extrusion move</span><span><i class="legend-anchor"></i>anchors A / B</span></div>
      </section>
      <section class="gcode-section" aria-labelledby="gcode-heading">
        <div class="gcode-heading"><div><p class="eyebrow">TRACEABLE OUTPUT</p><h2 id="gcode-heading">G-code body</h2></div><span>read-only · deterministic text</span></div>
        <textarea id="gcode-output" readonly spellcheck="false" aria-label="Generated G-code"></textarea>
      </section>
      <p class="preview-honesty">Preview shows only the planned straight nozzle path. It does not draw, predict, or simulate sag, cooling deformation, string shape, contact, or surface texture.</p>
    </main>
  </div>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing fabrication span UI element: ${selector}`);
  return element;
}

function readNumber(input: HTMLInputElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function readProfile(): FabricationProfile {
  const values = new Map<string, number>();
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-group="profile"]')) {
    values.set(input.dataset.key ?? "", readNumber(input, input.dataset.key ?? "profile field"));
  }
  return {
    nozzleDiameterMm: values.get("nozzleDiameterMm") ?? Number.NaN,
    filamentDiameterMm: values.get("filamentDiameterMm") ?? Number.NaN,
    lineWidthMm: values.get("lineWidthMm") ?? Number.NaN,
    layerHeightMm: values.get("layerHeightMm") ?? Number.NaN,
  };
}

function readFixture(): FabricationFixture {
  const values = new Map<string, number>();
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-group="fixture"]')) {
    values.set(input.dataset.key ?? "", readNumber(input, input.dataset.key ?? "fixture field"));
  }
  return {
    spanLengthMm: values.get("spanLengthMm") ?? Number.NaN,
    rowSpacingMm: values.get("rowSpacingMm") ?? Number.NaN,
    railWidthMm: values.get("railWidthMm") ?? Number.NaN,
    railDepthMm: values.get("railDepthMm") ?? Number.NaN,
    railHeightMm: values.get("railHeightMm") ?? Number.NaN,
  };
}

function readFeedPresets(): FeedPreset[] {
  return DEFAULT_FEED_PRESETS.map((preset) => ({
    ...preset,
    feedRateMmPerMin: readNumber(requiredElement<HTMLInputElement>(`input[data-preset-group="feed"][data-preset-id="${preset.id}"]`), `${preset.id} feed`),
  }));
}

function readExtrusionPresets(): ExtrusionPreset[] {
  return DEFAULT_EXTRUSION_PRESETS.map((preset) => ({
    ...preset,
    multiplier: readNumber(requiredElement<HTMLInputElement>(`input[data-preset-group="extrusion"][data-preset-id="${preset.id}"]`), `${preset.id} extrusion`),
  }));
}

const preview = requiredElement<HTMLDivElement>("#preview");
const gcodeOutput = requiredElement<HTMLTextAreaElement>("#gcode-output");
const status = requiredElement<HTMLParagraphElement>("#status");
const spanCount = requiredElement<HTMLElement>("#span-count");
const spanLength = requiredElement<HTMLElement>("#span-length");
const trajectoryKind = requiredElement<HTMLElement>("#trajectory-kind");
const previewProfile = requiredElement<HTMLElement>("#preview-profile");
const previewZ = requiredElement<HTMLElement>("#preview-z");

function renderPreview(coupon: FabricationSpanCoupon): void {
  const { fixture } = coupon;
  const paddingX = fixture.railWidthMm + 8;
  const rowsHalfDepth = ((coupon.spans.length - 1) * fixture.rowSpacingMm) / 2;
  const top = -rowsHalfDepth - fixture.railDepthMm;
  const bottom = rowsHalfDepth + fixture.railDepthMm;
  const left = -paddingX;
  const right = fixture.spanLengthMm + paddingX;
  const width = right - left;
  const height = bottom - top;
  const railTop = -fixture.railDepthMm / 2 - rowsHalfDepth;
  const railHeight = rowsHalfDepth * 2 + fixture.railDepthMm;
  const svgParts = [
    `<svg viewBox="${left} ${top} ${width} ${height}" role="img" aria-label="${coupon.spans.length} planned straight spans between Anchor A and Anchor B">`,
    `<rect class="rail" x="${-fixture.railWidthMm / 2}" y="${railTop}" width="${fixture.railWidthMm}" height="${railHeight}" rx="${fixture.railWidthMm / 2}" />`,
    `<rect class="rail" x="${fixture.spanLengthMm - fixture.railWidthMm / 2}" y="${railTop}" width="${fixture.railWidthMm}" height="${railHeight}" rx="${fixture.railWidthMm / 2}" />`,
    `<text class="anchor-label" x="0" y="${top + 4}" text-anchor="middle">A</text>`,
    `<text class="anchor-label" x="${fixture.spanLengthMm}" y="${top + 4}" text-anchor="middle">B</text>`,
  ];
  for (const span of coupon.spans) {
    const travel = span.travelMove;
    const extrusion = span.extrusionMove;
    svgParts.push(
      `<line class="travel-line" x1="${travel.start.x}" y1="${travel.start.y}" x2="${travel.end.x}" y2="${travel.end.y}" />`,
      `<line class="span-line" x1="${extrusion.start.x}" y1="${extrusion.start.y}" x2="${extrusion.end.x}" y2="${extrusion.end.y}" />`,
      `<circle class="anchor-dot" cx="${extrusion.start.x}" cy="${extrusion.start.y}" r="${Math.max(0.35, fixture.railWidthMm / 10)}" />`,
      `<circle class="anchor-dot" cx="${extrusion.end.x}" cy="${extrusion.end.y}" r="${Math.max(0.35, fixture.railWidthMm / 10)}" />`,
      `<text class="span-label" x="${fixture.spanLengthMm + fixture.railWidthMm}" y="${extrusion.start.y + 1.2}">${span.intent.id}</text>`,
    );
  }
  svgParts.push("</svg>");
  preview.innerHTML = svgParts.join("");
}

let currentCoupon = buildFabricationSpanCoupon({
  profile: DEFAULT_FABRICATION_PROFILE,
  fixture: DEFAULT_FABRICATION_FIXTURE,
  feedPresets: DEFAULT_FEED_PRESETS,
  extrusionPresets: DEFAULT_EXTRUSION_PRESETS,
});
let currentGcode = generateFabricationGcode(currentCoupon);

function render(coupon: FabricationSpanCoupon, gcode: string): void {
  currentCoupon = coupon;
  currentGcode = gcode;
  renderPreview(coupon);
  gcodeOutput.value = gcode;
  spanCount.textContent = String(coupon.spans.length);
  spanLength.textContent = `${coupon.fixture.spanLengthMm.toFixed(1)} mm`;
  trajectoryKind.textContent = coupon.spans.every((span) => span.trajectory.geometry === "straight") ? "straight / planned" : "mixed";
  previewProfile.textContent = `${coupon.profile.nozzleDiameterMm.toFixed(2)} mm nozzle`;
  previewZ.textContent = `Z ${coupon.fixture.railHeightMm.toFixed(1)} mm`;
  status.dataset.kind = "ok";
  status.textContent = `${coupon.spans.length} deterministic spans generated · planned path only`;
}

function regenerate(): void {
  try {
    const profile = readProfile();
    const fixture = readFixture();
    const feedPresets = readFeedPresets();
    const extrusionPresets = readExtrusionPresets();
    const coupon = buildFabricationSpanCoupon({ profile, fixture, feedPresets, extrusionPresets });
    render(coupon, generateFabricationGcode(coupon));
  } catch (error) {
    status.dataset.kind = "error";
    status.textContent = `Not generated: ${error instanceof Error ? error.message : String(error)}`;
  }
}

for (const input of document.querySelectorAll<HTMLInputElement>("input")) input.addEventListener("input", regenerate);
requiredElement<HTMLButtonElement>("#regenerate").addEventListener("click", regenerate);

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

requiredElement<HTMLButtonElement>("#export-gcode").addEventListener("click", () => {
  downloadText(currentGcode, "skin-fabrication-span-0.gcode");
  status.dataset.kind = "ok";
  status.textContent = `G-code export ready · ${currentCoupon.spans.length} spans · body only`;
});

render(currentCoupon, currentGcode);

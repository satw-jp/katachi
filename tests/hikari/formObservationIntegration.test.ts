import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DEFAULT_FORM_SETTINGS, FORM_SETTINGS_KEY, isFormQueryEnabled, loadFormSettings, normalizeFormSettings, persistFormSettings } from "../../src/studies/cloud-sculpt/formObservation/state.ts";
import { SamplingLifecycle } from "../../src/studies/cloud-sculpt/formObservation/lifecycle.ts";
import { applyFormObservationVisibility, transitionObservationMode } from "../../src/studies/cloud-sculpt/formObservation/modeTransition.ts";
import { captureRendererState, FormRendererResources, restoreRendererState, type RendererStatePort } from "../../src/studies/cloud-sculpt/formObservation/rendererState.ts";
import { describeFormPng, formPngDimensions } from "../../src/studies/cloud-sculpt/formObservation/pngExport.ts";
import { cacheFormResult } from "../../src/studies/cloud-sculpt/formObservation/resultProvenance.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

test("FORM query gate and local settings are isolated from normal Hikari persistence", () => {
  assert.equal(isFormQueryEnabled("?form=1"), true);
  assert.equal(isFormQueryEnabled("?form=0"), false);
  assert.equal(isFormQueryEnabled("?safe=1"), false);
  const storage = new MemoryStorage();
  assert.deepEqual(loadFormSettings(storage as unknown as Storage), DEFAULT_FORM_SETTINGS);
  assert.equal(loadFormSettings(storage as unknown as Storage, 40_000).pointBudget, 40_000);
  const normalized = normalizeFormSettings({ layout: "single", activePanel: "principal", pointBudget: 40_000, pointSize: 9, zoom: -4, pan: [2, -3], pcaBasis: [1, 2, 3] });
  assert.equal(normalized.pointSize, 4);
  assert.equal(normalized.zoom, 0.25);
  assert.equal(normalized.pcaBasis, null);
  persistFormSettings(storage as unknown as Storage, normalized);
  assert.ok(storage.getItem(FORM_SETTINGS_KEY));
  assert.equal(storage.getItem("katachi-cloud-sculpt-hikari-v1"), null);
  const safe = normalizeFormSettings({ pointBudget: 160_000 }, 40_000);
  assert.equal(safe.pointBudget, 40_000);
  persistFormSettings(storage as unknown as Storage, safe);
  assert.equal(loadFormSettings(storage as unknown as Storage, 40_000).pointBudget, 40_000);
});

test("FORM Worker lifecycle ignores stale completion and retains last-good result across cancel/failure", () => {
  const terminated: string[] = [];
  const worker = (name: string) => ({ terminate: () => terminated.push(name) });
  const lifecycle = new SamplingLifecycle<string>();
  const first = lifecycle.begin(worker("first"));
  assert.equal(lifecycle.complete(first, "good"), true);
  const second = lifecycle.begin(worker("second"));
  const replacement = lifecycle.begin(worker("replacement"));
  assert.deepEqual(terminated, ["first", "second"]);
  assert.equal(lifecycle.complete(second, "stale"), false);
  assert.equal(lifecycle.lastSuccessful, "good");
  assert.equal(lifecycle.fail(replacement), true);
  assert.equal(lifecycle.lastSuccessful, "good");
  lifecycle.begin(worker("cancelled")); lifecycle.cancel();
  assert.deepEqual(terminated, ["first", "second", "replacement", "cancelled"]);
});

test("FORM cached identity invalidates an in-flight different-budget Worker before display", () => {
  let terminated = 0;
  const lifecycle = new SamplingLifecycle<string>();
  const inFlight40k = lifecycle.begin({ terminate: () => { terminated += 1; } });
  lifecycle.replaceWithCached("cached-80k");
  assert.equal(terminated, 1);
  assert.equal(lifecycle.complete(inFlight40k, "late-40k"), false);
  assert.equal(lifecycle.lastSuccessful, "cached-80k");
});

test("FORM transition preserves every Hikari setting; FLOW and OPTICS alter only phenomenon", () => {
  const settings = { phenomenon: "optics" as const, ior: 1.52, opticalExposure: 1.4, inclusionEnabled: true, daylightMinutes: 703 };
  const form = transitionObservationMode("form", settings);
  assert.equal(form.formActive, true); assert.deepEqual(form.settings, settings); assert.notEqual(form.settings, settings);
  const flow = transitionObservationMode("flow", settings);
  assert.equal(flow.formActive, false); assert.deepEqual(flow.settings, { ...settings, phenomenon: "flow" });
  const optics = transitionObservationMode("optics", { ...settings, phenomenon: "flow" as const });
  assert.deepEqual(optics.settings, settings);
});

test("FORM/FLOW/OPTICS switch remains available through active-mode roundtrips", () => {
  const elements = { formPanel: { hidden: false }, viewOverlay: { hidden: false }, modeSwitch: { hidden: false } };
  applyFormObservationVisibility(false, elements);
  assert.deepEqual(elements, { formPanel: { hidden: true }, viewOverlay: { hidden: true }, modeSwitch: { hidden: false } });
  applyFormObservationVisibility(true, elements);
  assert.deepEqual(elements, { formPanel: { hidden: false }, viewOverlay: { hidden: false }, modeSwitch: { hidden: false } });
});

test("FORM renderer state restoration and fixed resource accounting are stable", () => {
  type Value = { name: string };
  const port: RendererStatePort<Value, Value, Value> = {
    autoClear: false,
    getRenderTarget: () => ({ name: "target" }), getViewport: () => ({ name: "viewport" }), getScissor: () => ({ name: "scissor" }), getScissorTest: () => true, getClearColor: () => ({ name: "color" }), getClearAlpha: () => 0.35,
    setRenderTarget(value) { this.target = value; }, setViewport(value) { this.viewport = value; }, setScissor(value) { this.scissor = value; }, setScissorTest(value) { this.scissorTest = value; }, setClearColor(color, alpha) { this.color = color; this.alpha = alpha; },
  } as RendererStatePort<Value, Value, Value> & Record<string, unknown>;
  const saved = captureRendererState(port, { name: "v" }, { name: "s" }, { name: "c" });
  port.autoClear = true; restoreRendererState(port, saved);
  assert.deepEqual({ target: (port as unknown as { target: Value }).target, viewport: (port as unknown as { viewport: Value }).viewport, scissor: (port as unknown as { scissor: Value }).scissor, scissorTest: (port as unknown as { scissorTest: boolean }).scissorTest, color: (port as unknown as { color: Value }).color, alpha: (port as unknown as { alpha: number }).alpha, autoClear: port.autoClear }, { target: { name: "target" }, viewport: { name: "viewport" }, scissor: { name: "scissor" }, scissorTest: true, color: { name: "color" }, alpha: 0.35, autoClear: false });
  const resources = new FormRendererResources(); resources.update(); resources.replacePositionBuffer(); resources.replacePositionBuffer(); assert.deepEqual(resources.counts(), { points: 1, geometries: 1, attributes: 1, replacements: 2, releasedBuffers: 2 }); resources.dispose(); assert.deepEqual(resources.counts(), { points: 0, geometries: 0, attributes: 0, replacements: 2, releasedBuffers: 2 });
  const rendererSource = readFileSync(new URL("../../src/studies/cloud-sculpt/formObservation/formRenderer.ts", import.meta.url), "utf8");
  const paperClear = rendererSource.indexOf("renderer.clear(true, true, true)");
  const pointRender = rendererSource.indexOf("renderer.render(this.scene, camera)");
  assert.ok(paperClear > 0 && paperClear < pointRender, "paper must be cleared before points and while sampling is pending");
  assert.match(rendererSource, /renderer\.getSize\(this\.cssSize\)/, "viewport panels must use CSS pixels so device pixel ratio is applied exactly once");
  assert.doesNotMatch(rendererSource, /const width = canvas\.width/);
});

test("FORM retained point results keep the producing geometry, not a newer pending source", () => {
  const oldGeometry = { sourceId: "cloud", revision: "history-4", contentHash: "oldhash" };
  const cached = cacheFormResult({ pointCount: 8 } as never, {} as never, {} as never, oldGeometry as never);
  const pendingGeometry = { sourceId: "cloud", revision: "history-5", contentHash: "newhash" };
  assert.equal(cached.geometry.revision, "history-4");
  assert.equal(cached.geometry.contentHash, "oldhash");
  assert.notEqual(cached.geometry.contentHash, pendingGeometry.contentHash);
});

test("FORM PNG description includes current layout and independent provenance metadata", () => {
  const description = describeFormPng({ pointCount: 1234 } as never, { version: "0.32.1", updatedAt: "2026-08-09", geometry: { revision: "history-7", contentHash: "abcdef0123456789" } as never }, { layout: "quad", activePanel: "top" });
  assert.deepEqual(description.panelNames, ["XZ / TOP", "XY / FRONT", "ZY / SIDE", "PRINCIPAL / PCA"]);
  assert.match(description.footer, /0\.32\.1.*2026-08-09.*history-7.*abcdef012345.*1,234 points/);
  assert.match(description.assumptions, /approximate SDF surface; physical scale unknown; candidate density is biased/);
  assert.deepEqual(formPngDimensions(1), { width: 1600, height: 1120 });
  assert.deepEqual(formPngDimensions(2), { width: 3200, height: 2240 });
});

test("FORM integration keeps a real Worker entry, gates optical work before it is built, and lets in-flight completion publish retained results without invalidating FORM", () => {
  const main = readFileSync(new URL("../../src/studies/cloud-sculpt/main.ts", import.meta.url), "utf8");
  const renderStart = main.indexOf("function render(): void {");
  const initialFormSetup = main.indexOf("if (formObservationEnabled)");
  assert.ok(main.indexOf("let opticsRenderCalls = 0;") < initialFormSetup);
  assert.ok(main.indexOf("let opticsFrameCalls = 0;") < initialFormSetup);
  const formGate = main.indexOf("if (formObservation?.isActive())", renderStart);
  const opticalBuild = main.indexOf("buildCloudOpticalScene", renderStart);
  assert.ok(formGate > renderStart && formGate < opticalBuild);
  assert.ok(main.includes("formObservation.render();"));
  const controller = readFileSync(new URL("../../src/studies/cloud-sculpt/formObservation/controller.ts", import.meta.url), "utf8");
  assert.match(controller, /new Worker\(new URL\("\.\/sampling\.worker\.ts", import\.meta\.url\), \{ type: "module" \}\)/);
  const worker = readFileSync(new URL("../../src/studies/cloud-sculpt/formObservation/sampling.worker.ts", import.meta.url), "utf8");
  assert.match(worker, /positions\.buffer/);
  const style = readFileSync(new URL("../../src/studies/cloud-sculpt/style.css", import.meta.url), "utf8");
  assert.match(style, /\.form-mode-switch\s*\{[^}]*z-index:\s*2/s);
  assert.match(controller, /this\.root\.append\(this\.modeSwitch, this\.viewOverlay, this\.formPanel\)/);
  assert.match(style, /\.form-mode-switch\s*\{[^}]*position:\s*fixed[^}]*right:\s*12px[^}]*width:\s*316px/s);
  assert.match(style, /\.form-view-target:hover,[\s\S]*?background:\s*transparent/);
  assert.match(style, /#app\.form-observation-active #viewport\s*\{[^}]*width:\s*calc\(100vw - 340px\)/s);
  assert.match(style, /\.form-observation-panel\s*\{[^}]*position:\s*fixed[^}]*width:\s*340px/s);
  assert.match(style, /#app\.form-observation-active \.application-bar \.compute-mode-button,[\s\S]*?\.progressive-render-button\s*\{\s*display:\s*none/s);
  assert.match(main, /app\.classList\.add\("form-observation-active"\);\s+cloudRenderer\.resize\(\);/);
  assert.match(main, /app\.classList\.remove\("form-observation-active"\);\s+cloudRenderer\.resize\(\);/);
  assert.match(main, /pointerdown[\s\S]*formObservation\?\.isActive\(\)[\s\S]*clearFormMutationDrag/);
  assert.match(main, /window\.addEventListener\("keydown",[\s\S]*formObservation\?\.isActive\(\)/);
  assert.match(main, /if \(!formObservation\?\.isActive\(\)\)\s*\{\s*cloudRenderer\.invalidateProgressiveRender\(\s*"受光面が更新されたためリアルタイムへ戻りました"/);
  assert.match(main, /if \(pending && !formObservation\?\.isActive\(\)\)/);
  assert.match(controller, /result\.geometry\.revision.*result\.geometry\.contentHash/s);
  assert.match(controller, /if \(value > this\.options\.maxPointBudget\) continue/);
  assert.match(controller, /High · \$\{dimensions\.width\}×\$\{dimensions\.height\}/);
  assert.match(controller, /this\.settings, this\.pngScale/);
  assert.match(controller, /Render failed —/);
  assert.match(controller, /renderer: this\.renderer\.getDebugState\(\)/);
});

test("production build emits the dedicated FORM sampling Worker when present", () => {
  const assets = new URL("../../dist/assets/", import.meta.url);
  if (!existsSync(assets)) return;
  assert.ok(readdirSync(assets).some((name) => /^sampling\.worker-.*\.js$/.test(name)));
});

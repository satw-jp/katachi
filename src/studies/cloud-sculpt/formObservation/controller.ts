import type { FormGeometry, FormObservationSettings, SamplingWorkerResponse, SupportedPointBudget } from "./contracts.ts";
import type { CloudRenderer } from "../renderer.ts";
import { FormObservationRenderer } from "./formRenderer.ts";
import { composeFormPng, formPngDimensions, type FormPngScale } from "./pngExport.ts";
import { samplingIdentity, DEFAULT_SAMPLING_VERSION } from "./surfaceSampling.ts";
import { loadFormSettings, persistFormSettings } from "./state.ts";
import { SamplingLifecycle } from "./lifecycle.ts";
import { cacheFormResult, type CachedFormResult } from "./resultProvenance.ts";
import { applyFormObservationVisibility } from "./modeTransition.ts";

export type ObservationMode = "form" | "flow" | "optics";

export interface FormObservationControllerOptions {
  readonly viewport: HTMLElement;
  readonly cloudRenderer: CloudRenderer;
  readonly version: string;
  readonly updatedAt: string;
  readonly maxPointBudget: SupportedPointBudget;
  readonly onModeChange: (mode: ObservationMode) => void;
}

type CachedResult = CachedFormResult;

export class FormObservationController {
  private readonly renderer: FormObservationRenderer;
  private readonly root = document.createElement("aside");
  private readonly formPanel = document.createElement("div");
  private readonly viewOverlay = document.createElement("div");
  private readonly source = document.createElement("div");
  private readonly status = document.createElement("div");
  private readonly modeSwitch: HTMLElement;
  private readonly cache = new Map<string, CachedResult>();
  private readonly modeButtons = new Map<ObservationMode, HTMLButtonElement>();
  private readonly lifecycle = new SamplingLifecycle<CachedResult>();
  private geometry: FormGeometry | null = null;
  private settings: FormObservationSettings;
  private active = true;
  private lastSuccessfulIdentity: string | null = null;
  private drag: { x: number; y: number; pan: [number, number] } | null = null;
  private suppressPanelClickUntil = 0;
  private renderError: string | null = null;
  private pngScale: FormPngScale = 2;
  private readonly wheelListener: (event: WheelEvent) => void;
  private readonly pointerDownListener: (event: PointerEvent) => void;
  private readonly pointerMoveListener: (event: PointerEvent) => void;
  private readonly pointerUpListener: (event: PointerEvent) => void;

  constructor(private readonly options: FormObservationControllerOptions) {
    this.settings = loadFormSettings(localStorage, options.maxPointBudget);
    persistFormSettings(localStorage, this.settings);
    this.renderer = new FormObservationRenderer(options.cloudRenderer);
    this.root.className = "form-observation-controls";
    this.root.setAttribute("aria-label", "Experimental form observation controls");
    this.formPanel.className = "form-observation-panel";
    this.viewOverlay.className = "form-view-overlay";
    this.modeSwitch = this.makeModeControls();
    this.formPanel.append(this.makeControls());
    this.root.append(this.modeSwitch, this.viewOverlay, this.formPanel);
    options.viewport.appendChild(this.root);
    this.wheelListener = (event) => { if (!this.active || (event.target as Element).closest(".form-control-panel,.form-mode-switch")) return; event.preventDefault(); this.updateSettings({ zoom: this.settings.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1) }); };
    this.pointerDownListener = (event) => { if (!this.active || event.button !== 0 || (event.target as Element).closest(".form-control-panel,.form-mode-switch")) return; this.drag = { x: event.clientX, y: event.clientY, pan: [...this.settings.pan] }; options.viewport.setPointerCapture?.(event.pointerId); };
    this.pointerMoveListener = (event) => { if (!this.drag) return; const width = Math.max(1, options.viewport.clientWidth); const height = Math.max(1, options.viewport.clientHeight); this.updateSettings({ pan: [this.drag.pan[0] + (event.clientX - this.drag.x) / width, this.drag.pan[1] - (event.clientY - this.drag.y) / height] }); };
    this.pointerUpListener = (event) => { if (this.drag && Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > 4) this.suppressPanelClickUntil = Date.now() + 300; this.drag = null; };
    options.viewport.addEventListener("wheel", this.wheelListener, { passive: false });
    options.viewport.addEventListener("pointerdown", this.pointerDownListener); options.viewport.addEventListener("pointermove", this.pointerMoveListener); options.viewport.addEventListener("pointerup", this.pointerUpListener);
    this.refreshUi("Awaiting current Cloud SDF");
  }

  setActive(active: boolean): void {
    this.active = active;
    applyFormObservationVisibility(active, { formPanel: this.formPanel, viewOverlay: this.viewOverlay, modeSwitch: this.modeSwitch });
    if (!active) this.cancel(); else { this.selectMode("form"); this.requestCurrent(); }
  }
  isActive(): boolean { return this.active; }

  setGeometry(geometry: FormGeometry): void {
    const changed = this.geometry?.contentHash !== geometry.contentHash;
    this.geometry = geometry;
    if (this.lastSuccessfulIdentity === null) this.setDisplayedSource(geometry);
    if (changed && this.active) this.requestCurrent();
  }

  render(): void {
    if (!this.active) return;
    try {
      this.renderer.render(this.settings.layout, this.settings.activePanel, this.settings.zoom, this.settings.pan);
      if (this.renderError !== null) { this.renderError = null; this.publishDebugState(); }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (message !== this.renderError) { this.renderError = message; this.refreshUi(`Render failed — ${message}`); }
    }
  }

  cancel(): void { this.lifecycle.cancel(); this.refreshUi(this.lastSuccessfulIdentity ? "Cancelled — retaining last successful observation" : "Cancelled"); }

  dispose(): void {
    this.cancel(); this.renderer.dispose(); this.root.remove();
    this.options.viewport.removeEventListener("wheel", this.wheelListener); this.options.viewport.removeEventListener("pointerdown", this.pointerDownListener); this.options.viewport.removeEventListener("pointermove", this.pointerMoveListener); this.options.viewport.removeEventListener("pointerup", this.pointerUpListener);
  }

  getDebugState(): { mode: "form"; status: string; workerActive: boolean; cacheEntries: number; lastSuccessfulIdentity: string | null; renderError: string | null; renderer: ReturnType<FormObservationRenderer["getDebugState"]> } {
    return { mode: "form", status: this.status.textContent ?? "", workerActive: this.lifecycle.workerActive, cacheEntries: this.cache.size, lastSuccessfulIdentity: this.lastSuccessfulIdentity, renderError: this.renderError, renderer: this.renderer.getDebugState() };
  }

  private requestCurrent(force = false): void {
    if (!this.geometry) return;
    const requestGeometry = this.geometry;
    const identity = samplingIdentity(requestGeometry.contentHash, this.settings.pointBudget, DEFAULT_SAMPLING_VERSION);
    const cached = !force ? this.cache.get(identity) : undefined;
    if (cached) { this.lifecycle.replaceWithCached(cached); this.applyResult(identity, cached); return; }
    this.cancel();
    const worker = new Worker(new URL("./sampling.worker.ts", import.meta.url), { type: "module" });
    const requestId = this.lifecycle.begin(worker);
    this.refreshUi(`Inspecting ${requestGeometry.revision} · ${this.settings.pointBudget.toLocaleString()} requested points`);
    worker.onmessage = (event: MessageEvent<SamplingWorkerResponse>) => {
      if (!this.lifecycle.isCurrent(requestId)) return;
      const message = event.data;
      if (message.type === "progress") { this.refreshUi(message.progress.message); return; }
      if (message.type === "error") { this.lifecycle.fail(requestId); this.refreshUi(`Sampling failed — retaining last successful observation: ${message.error}`); return; }
      const result = cacheFormResult(message.pointSet, message.pca, message.cameraFit, requestGeometry);
      if (!this.lifecycle.complete(requestId, result)) return;
      this.cache.set(identity, result); this.applyResult(identity, result);
    };
    worker.onerror = (event) => { if (!this.lifecycle.fail(requestId)) return; this.refreshUi(`Worker failed — retaining last successful observation: ${event.message}`); };
    worker.postMessage({ type: "sample", requestId: String(requestId), geometry: requestGeometry, pointBudget: this.settings.pointBudget, samplingVersion: DEFAULT_SAMPLING_VERSION });
  }

  private applyResult(identity: string, result: CachedResult): void {
    this.renderer.setResult(result.pointSet, result.pca, result.cameraFit);
    this.lastSuccessfulIdentity = identity;
    this.setDisplayedSource(result.geometry);
    this.refreshUi(`${result.pointSet.pointCount.toLocaleString()} approximate SDF surface points · ${result.pca.ambiguous ? "PCA direction ambiguous" : "PCA stable"}`);
  }

  private updateSettings(patch: Partial<FormObservationSettings>): void {
    this.settings = { ...this.settings, ...patch };
    persistFormSettings(localStorage, this.settings); this.renderer.setPointSize(this.settings.pointSize); this.refreshUi(this.status.textContent ?? "FORM");
  }

  private makeModeControls(): HTMLElement {
    const row = document.createElement("div"); row.className = "form-mode-switch";
    for (const mode of ["form", "flow", "optics"] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = mode.toUpperCase(); button.classList.toggle("active", mode === "form"); button.onclick = () => { this.selectMode(mode); this.options.onModeChange(mode); }; this.modeButtons.set(mode, button); row.appendChild(button);
    }
    return row;
  }

  private makeControls(): HTMLElement {
    const panel = document.createElement("div"); panel.className = "form-control-panel";
    const note = document.createElement("p"); note.textContent = "EXPERIMENTAL · approximate SDF observation · physical scale unknown"; panel.append(note, this.source);
    const layout = document.createElement("div");
    for (const value of ["quad", "single"] as const) { const button = document.createElement("button"); button.type = "button"; button.textContent = value === "quad" ? "4 panels" : "Single panel"; button.onclick = () => this.updateSettings({ layout: value }); layout.appendChild(button); }
    panel.appendChild(layout);
    const panelSelect = document.createElement("select"); for (const value of ["top", "front", "side", "principal"] as const) { const option = document.createElement("option"); option.value = value; option.textContent = value.toUpperCase(); panelSelect.appendChild(option); } panelSelect.value = this.settings.activePanel; panelSelect.onchange = () => this.updateSettings({ activePanel: panelSelect.value as FormObservationSettings["activePanel"] }); panel.appendChild(panelSelect);
    const densityLabel = document.createElement("label"); densityLabel.htmlFor = "form-point-density"; const density = document.createElement("select"); density.id = densityLabel.htmlFor; for (const value of [20_000, 40_000, 80_000, 160_000] as const) { if (value > this.options.maxPointBudget) continue; const option = document.createElement("option"); option.value = String(value); option.textContent = `${value / 1000}k points`; density.appendChild(option); } density.value = String(this.settings.pointBudget); densityLabel.textContent = `Point density · ${Number(density.value) / 1000}k`; density.onchange = () => { densityLabel.textContent = `Point density · ${Number(density.value) / 1000}k`; this.updateSettings({ pointBudget: Number(density.value) as FormObservationSettings["pointBudget"] }); this.requestCurrent(); }; panel.append(densityLabel, density);
    const sizeLabel = document.createElement("label"); sizeLabel.htmlFor = "form-point-size"; const size = document.createElement("input"); size.id = sizeLabel.htmlFor; size.type = "range"; size.min = "0.5"; size.max = "4"; size.step = "0.1"; size.value = String(this.settings.pointSize); sizeLabel.textContent = `Point size · ${size.value}`; size.oninput = () => { sizeLabel.textContent = `Point size · ${size.value}`; this.updateSettings({ pointSize: Number(size.value) }); }; panel.append(sizeLabel, size);
    const fit = document.createElement("button"); fit.type = "button"; fit.textContent = "Fit all"; fit.onclick = () => this.updateSettings({ zoom: 1, pan: [0, 0] });
    const pca = document.createElement("button"); pca.type = "button"; pca.textContent = "Recalculate PCA"; pca.onclick = () => this.requestCurrent(true);
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = () => this.cancel();
    const pngQualityLabel = document.createElement("label"); pngQualityLabel.htmlFor = "form-png-quality"; pngQualityLabel.textContent = "PNG quality";
    const pngQuality = document.createElement("select"); pngQuality.id = pngQualityLabel.htmlFor;
    for (const scale of [1, 2] as const) { const dimensions = formPngDimensions(scale); const option = document.createElement("option"); option.value = String(scale); option.textContent = scale === 1 ? `Standard · ${dimensions.width}×${dimensions.height}` : `High · ${dimensions.width}×${dimensions.height}`; pngQuality.appendChild(option); }
    pngQuality.value = String(this.pngScale); pngQuality.onchange = () => { this.pngScale = Number(pngQuality.value) as FormPngScale; };
    const png = document.createElement("button"); png.type = "button"; png.textContent = "Save PNG"; png.onclick = () => this.exportPng();
    panel.append(fit, pca, cancel, pngQualityLabel, pngQuality, png, this.status); return panel;
  }

  private selectMode(mode: ObservationMode): void {
    for (const [name, button] of this.modeButtons) button.classList.toggle("active", name === mode);
  }

  private refreshViewOverlay(): void {
    this.viewOverlay.replaceChildren();
    const frames = ["top", "front", "side", "principal"] as const;
    if (this.settings.layout === "single") {
      const back = document.createElement("button"); back.type = "button"; back.className = "form-quad-return"; back.textContent = "4 PANELS"; back.onclick = () => this.updateSettings({ layout: "quad" }); this.viewOverlay.appendChild(back);
    }
    for (const frame of frames) {
      const target = document.createElement("button"); target.type = "button"; target.className = `form-view-target form-view-target-${frame}`; target.textContent = frame === "top" ? "XZ / TOP" : frame === "front" ? "XY / FRONT" : frame === "side" ? "ZY / SIDE" : "PRINCIPAL / PCA";
      target.onclick = () => { if (Date.now() >= this.suppressPanelClickUntil) this.updateSettings({ layout: "single", activePanel: frame }); }; this.viewOverlay.appendChild(target);
    }
  }

  private exportPng(): void {
    if (!this.geometry || !this.lastSuccessfulIdentity) { this.refreshUi("No successful point set to export"); return; }
    const result = this.cache.get(this.lastSuccessfulIdentity); if (!result) return;
    const canvas = composeFormPng(result.pointSet, result.cameraFit, { version: this.options.version, updatedAt: this.options.updatedAt, geometry: result.geometry }, this.settings, this.pngScale);
    canvas.toBlob((blob) => { if (!blob) return; const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `hikari-form-${result.geometry.revision}-${result.geometry.contentHash.slice(0, 12)}-${canvas.width}x${canvas.height}.png`; link.click(); URL.revokeObjectURL(link.href); }, "image/png");
  }

  private setDisplayedSource(geometry: FormGeometry): void {
    this.source.textContent = `${geometry.sourceId} · ${geometry.revision} · ${geometry.contentHash.slice(0, 12)}`;
  }

  private publishDebugState(): void { document.documentElement.dataset.hikariForm = JSON.stringify(this.getDebugState()); }

  private refreshUi(text: string): void { this.status.textContent = text; this.root.dataset.layout = this.settings.layout; this.root.dataset.activePanel = this.settings.activePanel; this.refreshViewOverlay(); this.publishDebugState(); }
}

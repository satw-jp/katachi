import { conceptDefinition } from "../conceptRegistry.ts";
import { CONCEPT_DEFINITIONS } from "../conceptRegistry.ts";
import type { ConceptInstance, PaletteColors, PaletteName } from "../conceptTypes.ts";
import { V4_PALETTES } from "../conceptTypes.ts";
import { GLOBAL_PARAMETER_DEFINITIONS, ParameterStore, type ParameterValue } from "../parameterStore.ts";
import type { ConceptSource } from "../sourceAdapter.ts";
import { resolveConceptLabSeed } from "../seed.ts";
import { EventScheduler } from "./eventScheduler.ts";
import { RenderSurface, type CameraState } from "./renderSurface.ts";

export interface RuntimeFrame {
  readonly elapsedSeconds: number;
  readonly paused: boolean;
  readonly seed: number;
  readonly concept: string;
}

export interface RuntimeOptions {
  readonly initialTimeMs?: number;
  readonly initialParameters?: Readonly<Record<string, ParameterValue>>;
  readonly camera?: CameraState | null;
  readonly customColors?: PaletteColors;
}

function quality(): "mobile" | "desktop" | "capture" {
  return window.innerWidth <= 760 ? "mobile" : "desktop";
}

export class ConceptRuntime {
  readonly surface: RenderSurface;
  private readonly source: ConceptSource;
  private readonly onFrame: (frame: RuntimeFrame) => void;
  private activeId = CONCEPT_DEFINITIONS[0]!.id;
  private activePalette: PaletteName = "rich";
  private activeSeed = 1;
  private instance: ConceptInstance | null = null;
  private store = new ParameterStore(GLOBAL_PARAMETER_DEFINITIONS);
  private scheduler = new EventScheduler(1);
  private elapsedSeconds = 0;
  private lastTick = performance.now();
  private animationFrame = 0;
  private playing = true;
  private destroyed = false;
  private paletteColors: PaletteColors = V4_PALETTES.rich;

  constructor(artwork: HTMLElement, source: ConceptSource, onFrame: (frame: RuntimeFrame) => void) {
    this.surface = new RenderSurface(artwork);
    this.source = source;
    this.onFrame = onFrame;
    this.tick = this.tick.bind(this);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  mount(id: string, palette: PaletteName, seed: number, options: RuntimeOptions = {}): void {
    this.disposeInstance();
    this.activeId = conceptDefinition(id).id;
    this.activePalette = palette;
    this.activeSeed = seed;
    this.scheduler = new EventScheduler(seed);
    this.paletteColors = palette === "custom" ? options.customColors ?? V4_PALETTES.rich : V4_PALETTES[palette];
    const definition = conceptDefinition(this.activeId);
    this.store = new ParameterStore([...GLOBAL_PARAMETER_DEFINITIONS, ...definition.parameters], options.initialParameters);
    this.elapsedSeconds = Math.max(0, (options.initialTimeMs ?? 0) / 1000);
    this.playing = true;
    this.surface.camera.position.set(5.4, -8.2, 4.5);
    this.surface.camera.lookAt(0, 0.2, 0);
    if (options.camera) this.applyCameraState(options.camera);
    this.instance = definition.create({
      source: this.source,
      scene: this.surface.scene,
      camera: this.surface.camera,
      seed,
      quality: quality(),
      parameters: this.store.snapshot(),
      palette,
      colors: this.paletteColors,
    });
    this.instance.applyUniformParameters(this.store.snapshot());
    this.emitFrame();
  }

  currentDefinition() { return conceptDefinition(this.activeId); }
  globalDefinitions() { return GLOBAL_PARAMETER_DEFINITIONS; }
  definitions() { return this.store.getDefinitions(); }
  parameters(): Record<string, ParameterValue> { return this.store.snapshot(); }
  concept(): string { return this.activeId; }
  palette(): PaletteName { return this.activePalette; }
  seed(): number { return this.activeSeed; }
  elapsedMs(): number { return this.elapsedSeconds * 1000; }
  isPlaying(): boolean { return this.playing; }
  sourceFingerprint(): string { return this.source.fingerprint; }
  customColors(): PaletteColors { return this.paletteColors; }

  setParameter(id: string, value: ParameterValue): boolean {
    const definition = this.store.getDefinitions().find((candidate) => candidate.id === id);
    if (!definition || !this.store.set(id, value)) return false;
    this.instance?.applyUniformParameters(this.store.snapshot());
    this.surface.setFieldOfView(this.number("fieldOfView", 46));
    return definition.updateMode !== "rebuild";
  }

  setParameters(values: Readonly<Record<string, ParameterValue>>): void {
    for (const [id, value] of Object.entries(values)) this.store.set(id, value);
    this.instance?.applyUniformParameters(this.store.snapshot());
    this.surface.setFieldOfView(this.number("fieldOfView", 46));
  }

  remount(): void {
    this.mount(this.activeId, this.activePalette, this.activeSeed, { initialTimeMs: this.elapsedMs(), initialParameters: this.parameters(), camera: this.surface.cameraState(), customColors: this.paletteColors });
  }

  restartSameSeed(timeMs = 0): void {
    this.mount(this.activeId, this.activePalette, this.activeSeed, { initialTimeMs: timeMs, initialParameters: this.parameters(), camera: this.surface.cameraState(), customColors: this.paletteColors });
  }

  newRealization(): number {
    const next = resolveConceptLabSeed(null).seed;
    this.mount(this.activeId, this.activePalette, next, { initialParameters: this.parameters(), customColors: this.paletteColors });
    return next;
  }

  setPlaying(playing: boolean): void { this.playing = playing; }
  togglePlaying(): boolean { this.playing = !this.playing; return this.playing; }
  setTimeScale(value: number): void { this.store.set("timeScale", value); }

  captureState(): { concept: string; seed: number; timeMs: number; palette: PaletteName; parameters: Record<string, ParameterValue>; camera: CameraState } {
    return { concept: this.activeId, seed: this.activeSeed, timeMs: this.elapsedMs(), palette: this.activePalette, parameters: this.parameters(), camera: this.surface.cameraState() };
  }

  applyCameraState(camera: CameraState): void {
    this.surface.camera.position.set(camera.x, camera.y, camera.z);
    this.surface.setFieldOfView(camera.fov);
    this.surface.camera.lookAt(0, 0.2, 0);
  }

  renderCapture(): void { this.surface.render(); }

  dispose(): void {
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    this.disposeInstance();
    this.surface.dispose();
  }

  private number(id: string, fallback: number): number {
    const value = this.store.get(id);
    return typeof value === "number" ? value : fallback;
  }

  private disposeInstance(): void {
    this.instance?.dispose();
    this.instance = null;
  }

  private readonly tick = (now: number): void => {
    if (this.destroyed) return;
    const delta = Math.min(0.06, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const timeScale = this.number("timeScale", 1);
    if (this.playing) this.elapsedSeconds += delta * timeScale;
    const density = this.number("eventDensity", 1);
    const pauseBias = this.number("pauseBias", 0.5);
    this.applyCameraMotion();
    this.instance?.update({ elapsedSeconds: this.elapsedSeconds, deltaSeconds: this.playing ? delta : 0, localTime: this.elapsedSeconds, eventEnergy: this.scheduler.energy(this.elapsedSeconds, density, pauseBias), paused: !this.playing });
    this.surface.render();
    this.emitFrame();
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private emitFrame(): void {
    this.onFrame({ elapsedSeconds: this.elapsedSeconds, paused: !this.playing, seed: this.activeSeed, concept: this.activeId });
  }

  private applyCameraMotion(): void {
    const depth = Math.max(0.5, this.number("cameraDepth", 1));
    const drift = this.number("cameraDrift", 0.22);
    const time = this.elapsedSeconds;
    const scale = 1 / depth;
    this.surface.camera.position.set(
      5.4 * scale + Math.sin(time * 0.13) * drift,
      -8.2 * scale + Math.cos(time * 0.11) * drift,
      4.5 * scale + Math.sin(time * 0.17) * drift * 0.7,
    );
    this.surface.camera.lookAt(0, 0.2, 0);
    this.surface.setFieldOfView(this.number("fieldOfView", 46));
  }
}

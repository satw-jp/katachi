import * as THREE from "three";
import {
  VIEW_PATH_CODE,
  type ViewPathCode,
} from "./opticalObservation.ts";
import {
  viewObservationFragmentShader,
  viewObservationVertexShader,
} from "./shaders.ts";

export const VIEW_OBSERVATION_MAX_PIXELS = 1280 * 720;
export const VIEW_OBSERVATION_SCALE = 0.5;
export const VIEW_OBSERVATION_MIN_INTERVAL_MS = 100;

export type ViewObservationAvailability = "disabled" | "available" | "unsupported";

export interface ViewObservationSize {
  readonly width: number;
  readonly height: number;
}

export interface ViewObservationCapability {
  readonly supported: boolean;
  readonly reason: string | null;
  readonly isWebGL2: boolean;
  readonly hasColorBufferFloat: boolean;
  readonly maxDrawBuffers: number;
  readonly maxColorAttachments: number;
  readonly framebufferComplete: boolean | null;
}

export interface ViewObservationStatus {
  readonly enabled: boolean;
  readonly availability: ViewObservationAvailability;
  /** Alias for consumers that use the common state spelling. */
  readonly state: ViewObservationAvailability;
  readonly reason: string | null;
  readonly size: ViewObservationSize;
  readonly width: number;
  readonly height: number;
  readonly vramBytes: number;
  readonly dirty: boolean;
  readonly dynamic: boolean;
  readonly lastRenderedAt: number | null;
  readonly renderCount: number;
  readonly textures: readonly THREE.Texture[];
  readonly capability: ViewObservationCapability;
}

interface CapabilityRendererLike {
  readonly capabilities?: { readonly isWebGL2?: boolean };
  readonly extensions?: { has(name: string): boolean };
  getContext?(): WebGLRenderingContext | WebGL2RenderingContext;
}

interface CapabilityProbeLike {
  readonly isWebGL2?: boolean;
  readonly hasColorBufferFloat?: boolean;
  readonly maxDrawBuffers?: number;
  readonly maxColorAttachments?: number;
  readonly framebufferComplete?: boolean;
}

function finitePositiveInteger(value: unknown, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.max(1, Math.floor(Number(value)))
    : fallback;
}

/**
 * Fit a half-resolution diagnostic target while retaining the drawing-buffer
 * aspect ratio and enforcing the 720p aggregate-pixel cap.
 */
export function fitViewObservationSize(
  width: number,
  height: number,
  maxPixels = VIEW_OBSERVATION_MAX_PIXELS,
): ViewObservationSize {
  const safeWidth = finitePositiveInteger(width, 1);
  const safeHeight = finitePositiveInteger(height, 1);
  const safeMaxPixels = Math.max(
    1,
    Math.floor(Number.isFinite(maxPixels) ? maxPixels : VIEW_OBSERVATION_MAX_PIXELS),
  );
  let fittedWidth = Math.max(1, Math.floor(safeWidth * VIEW_OBSERVATION_SCALE));
  let fittedHeight = Math.max(1, Math.floor(safeHeight * VIEW_OBSERVATION_SCALE));
  if (fittedWidth * fittedHeight > safeMaxPixels) {
    const scale = Math.sqrt(safeMaxPixels / (fittedWidth * fittedHeight));
    fittedWidth = Math.max(1, Math.floor(fittedWidth * scale));
    fittedHeight = Math.max(1, Math.floor(fittedHeight * scale));
  }
  // Flooring both axes above is conservative, but the loop protects the cap
  // if a caller supplies a very small/non-integer custom limit.
  while (fittedWidth * fittedHeight > safeMaxPixels && fittedWidth > 1 && fittedHeight > 1) {
    if (fittedWidth / fittedHeight >= safeWidth / safeHeight) fittedWidth--;
    else fittedHeight--;
  }
  return { width: fittedWidth, height: fittedHeight };
}

function capabilityFromProbe(probe: CapabilityProbeLike): ViewObservationCapability {
  const isWebGL2 = probe.isWebGL2 === true;
  const hasColorBufferFloat = probe.hasColorBufferFloat === true;
  const maxDrawBuffers = Number.isFinite(probe.maxDrawBuffers)
    ? Number(probe.maxDrawBuffers)
    : 0;
  const maxColorAttachments = Number.isFinite(probe.maxColorAttachments)
    ? Number(probe.maxColorAttachments)
    : 0;
  const framebufferComplete = typeof probe.framebufferComplete === "boolean"
    ? probe.framebufferComplete
    : null;
  let reason: string | null = null;
  if (!isWebGL2) reason = "WebGL2 is required for view observation MRT";
  else if (!hasColorBufferFloat) reason = "EXT_color_buffer_float is required for RGBA16F observation targets";
  else if (maxDrawBuffers < 2) reason = "MAX_DRAW_BUFFERS must be at least 2 for reflection/transmission MRT";
  else if (maxColorAttachments < 2) reason = "MAX_COLOR_ATTACHMENTS must be at least 2 for reflection/transmission MRT";
  else if (framebufferComplete === false) reason = "observation MRT framebuffer is incomplete";
  return {
    supported: reason === null,
    reason,
    isWebGL2,
    hasColorBufferFloat,
    maxDrawBuffers,
    maxColorAttachments,
    framebufferComplete,
  };
}

function capabilityWithFramebuffer(
  base: ViewObservationCapability,
  framebufferComplete: boolean,
  failureReason = "observation MRT framebuffer is incomplete",
): ViewObservationCapability {
  if (!base.supported) {
    return { ...base, framebufferComplete };
  }
  return {
    ...base,
    supported: framebufferComplete,
    reason: framebufferComplete ? null : failureReason,
    framebufferComplete,
  };
}

/** Check the hard WebGL2/HDR/MRT gates without allocating a target. */
export function detectViewObservationCapability(
  rendererOrProbe: CapabilityRendererLike | CapabilityProbeLike,
): ViewObservationCapability {
  const renderer = rendererOrProbe as CapabilityRendererLike;
  if (renderer.capabilities || renderer.extensions || renderer.getContext) {
    const isWebGL2 = renderer.capabilities?.isWebGL2 === true;
    let hasColorBufferFloat = false;
    try {
      hasColorBufferFloat = renderer.extensions?.has("EXT_color_buffer_float") === true;
    } catch {
      hasColorBufferFloat = false;
    }
    let maxDrawBuffers = 0;
    let maxColorAttachments = 0;
    try {
      const gl = renderer.getContext?.() as WebGL2RenderingContext | undefined;
      if (gl) {
        maxDrawBuffers = Number(gl.getParameter(gl.MAX_DRAW_BUFFERS) ?? 0);
        maxColorAttachments = Number(gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) ?? 0);
      }
    } catch {
      maxDrawBuffers = 0;
      maxColorAttachments = 0;
    }
    return capabilityFromProbe({
      isWebGL2,
      hasColorBufferFloat,
      maxDrawBuffers,
      maxColorAttachments,
    });
  }
  return capabilityFromProbe(rendererOrProbe as CapabilityProbeLike);
}

function statusSize(width: number, height: number): ViewObservationSize {
  return Object.freeze({ width, height });
}

/**
 * The isolated low-resolution BODY observation pass.  It deliberately owns
 * no receiver state and never changes the Beauty material; the uniforms object
 * is shared by reference so every scene edit is visible on the next pass.
 */
export class ViewObservationPass {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly geometry = new THREE.PlaneGeometry(2, 2);
  material: THREE.ShaderMaterial | null = null;
  quad: THREE.Mesh | null = null;
  capability: ViewObservationCapability;
  private target: THREE.WebGLRenderTarget | null = null;
  private width = 1;
  private height = 1;
  private enabled: boolean;
  private availability: ViewObservationAvailability;
  private reason: string | null;
  private dirty = true;
  private dynamic = false;
  private lastRenderedAt: number | null = null;
  private renderCount = 0;
  private disposed = false;
  private contextLost = false;
  private readonly onContextLostListener = (event: Event): void => {
    event.preventDefault?.();
    this.handleContextLost();
  };
  private readonly onContextRestoredListener = (): void => {
    this.handleContextRestored();
  };

  constructor(
    renderer: THREE.WebGLRenderer,
    beautyUniforms: THREE.ShaderMaterial["uniforms"],
    options: { enabled?: boolean; initialWidth?: number; initialHeight?: number } = {},
  ) {
    this.renderer = renderer;
    this.enabled = options.enabled !== false;
    this.capability = this.enabled
      ? detectViewObservationCapability(renderer)
      : capabilityFromProbe({
          isWebGL2: false,
          hasColorBufferFloat: false,
          maxDrawBuffers: 0,
          maxColorAttachments: 0,
        });
    this.reason = this.enabled ? this.capability.reason : "view observation is disabled";
    this.availability = !this.enabled
      ? "disabled"
      : this.capability.supported
        ? "available"
        : "unsupported";
    if (!this.enabled || !this.capability.supported) {
      this.geometry.dispose();
      return;
    }

    const initial = fitViewObservationSize(
      options.initialWidth ?? 1,
      options.initialHeight ?? 1,
    );
    this.width = initial.width;
    this.height = initial.height;
    this.target = this.createTarget(this.width, this.height);
    const framebufferComplete = this.checkFramebufferComplete(this.target);
    this.capability = capabilityWithFramebuffer(this.capability, framebufferComplete);
    if (!framebufferComplete) {
      this.target.dispose();
      this.target = null;
      this.availability = "unsupported";
      this.reason = this.capability.reason;
      this.geometry.dispose();
      return;
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: viewObservationVertexShader,
      fragmentShader: viewObservationFragmentShader,
      uniforms: beautyUniforms,
      defines: { HIKARI_VIEW_OBSERVATION: 1 },
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.material = material;
    const quad = new THREE.Mesh(this.geometry, material);
    quad.frustumCulled = false;
    quad.renderOrder = -101;
    this.quad = quad;
    this.scene.add(quad);
    const canvas = this.renderer.domElement;
    canvas?.addEventListener("webglcontextlost", this.onContextLostListener);
    canvas?.addEventListener("webglcontextrestored", this.onContextRestoredListener);
  }

  private createTarget(width: number, height: number): THREE.WebGLRenderTarget {
    const target = new THREE.WebGLRenderTarget(width, height, {
      count: 2,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
      samples: 0,
    });
    for (const texture of target.textures as unknown as THREE.Texture[]) {
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.needsUpdate = true;
    }
    return target;
  }

  private checkFramebufferComplete(target: THREE.WebGLRenderTarget): boolean {
    const previousTarget = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(target);
      const gl = this.renderer.getContext();
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    } catch {
      return false;
    } finally {
      this.renderer.setRenderTarget(previousTarget);
    }
  }

  resize(drawingBufferWidth: number, drawingBufferHeight: number): ViewObservationSize {
    const next = fitViewObservationSize(drawingBufferWidth, drawingBufferHeight);
    if (this.disposed || !this.enabled || this.availability !== "available") {
      this.width = next.width;
      this.height = next.height;
      return statusSize(this.width, this.height);
    }
    if (next.width === this.width && next.height === this.height) return statusSize(this.width, this.height);
    const nextTarget = this.createTarget(next.width, next.height);
    const framebufferComplete = this.checkFramebufferComplete(nextTarget);
    this.capability = capabilityWithFramebuffer(this.capability, framebufferComplete);
    if (!framebufferComplete) {
      nextTarget.dispose();
      this.target?.dispose();
      this.target = null;
      this.availability = "unsupported";
      this.reason = this.capability.reason;
      this.width = next.width;
      this.height = next.height;
      return statusSize(this.width, this.height);
    }
    const previousTarget = this.target;
    this.target = nextTarget;
    this.width = next.width;
    this.height = next.height;
    previousTarget?.dispose();
    this.dirty = true;
    return statusSize(this.width, this.height);
  }

  handleContextLost(): void {
    if (this.disposed || this.contextLost) return;
    this.contextLost = true;
    this.target?.dispose();
    this.target = null;
    this.capability = capabilityWithFramebuffer(
      this.capability,
      false,
      "WebGL context lost; waiting for restoration",
    );
    this.availability = "unsupported";
    this.reason = "WebGL context lost; waiting for restoration";
    this.dirty = true;
  }

  handleContextRestored(): void {
    if (this.disposed || !this.contextLost) return;
    this.contextLost = false;
    const staticCapability = detectViewObservationCapability(this.renderer);
    if (!staticCapability.supported) {
      this.capability = staticCapability;
      this.availability = "unsupported";
      this.reason = this.capability.reason;
      return;
    }
    const nextTarget = this.createTarget(this.width, this.height);
    const framebufferComplete = this.checkFramebufferComplete(nextTarget);
    this.capability = capabilityWithFramebuffer(staticCapability, framebufferComplete);
    if (!framebufferComplete) {
      nextTarget.dispose();
      this.availability = "unsupported";
      this.reason = this.capability.reason;
      return;
    }
    this.target = nextTarget;
    this.availability = "available";
    this.reason = null;
    this.dirty = true;
  }

  markDirty(): void {
    if (!this.disposed && this.enabled && this.availability === "available") this.dirty = true;
  }

  setDynamic(dynamic: boolean): void {
    this.dynamic = dynamic;
    if (dynamic) this.markDirty();
  }

  isDirty(): boolean {
    return this.dirty;
  }

  /** Render once when dirty, or at most 10 Hz for moving camera/video inputs. */
  render(camera: THREE.Camera, now = performance.now()): boolean {
    if (
      this.disposed
      || !this.enabled
      || this.availability !== "available"
      || !this.target
      || !this.material
      || !this.quad
      || !this.dirty
    ) return false;
    if (
      this.dynamic
      && this.lastRenderedAt !== null
      && now - this.lastRenderedAt < VIEW_OBSERVATION_MIN_INTERVAL_MS
    ) return false;

    const uniforms = this.material.uniforms;
    const renderMode = uniforms.uRenderMode?.value;
    const resolution = uniforms.uResolution?.value as THREE.Vector2 | undefined;
    const resolutionSnapshot = resolution?.clone();
    const pixelJitter = uniforms.uPixelJitter?.value as THREE.Vector2 | undefined;
    const pixelJitterSnapshot = pixelJitter?.clone();
    const progressiveLinearOutput = uniforms.uProgressiveLinearOutput?.value;
    const progressiveSampleIndex = uniforms.uProgressiveSampleIndex?.value;
    const previousTarget = this.renderer.getRenderTarget();
    const previousViewport = this.renderer.getViewport(new THREE.Vector4());
    const previousScissor = this.renderer.getScissor(new THREE.Vector4());
    const previousScissorTest = this.renderer.getScissorTest();
    const previousAutoClear = this.renderer.autoClear;
    const previousClearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = this.renderer.getClearAlpha();
    const xr = this.renderer.xr;
    const previousXrEnabled = xr?.enabled;
    try {
      if (uniforms.uRenderMode) uniforms.uRenderMode.value = 1;
      if (uniforms.uResolution) uniforms.uResolution.value.set(this.width, this.height);
      if (uniforms.uPixelJitter) uniforms.uPixelJitter.value.set(0, 0);
      if (uniforms.uProgressiveLinearOutput) uniforms.uProgressiveLinearOutput.value = 0;
      if (uniforms.uProgressiveSampleIndex) uniforms.uProgressiveSampleIndex.value = 0;
      if (xr) xr.enabled = false;
      this.renderer.autoClear = true;
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.width, this.height);
      this.renderer.setRenderTarget(this.target);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, camera);
      this.dirty = false;
      this.lastRenderedAt = now;
      this.renderCount++;
      return true;
    } catch (error) {
      this.reason = `view observation render failed: ${error instanceof Error ? error.message : String(error)}`;
      this.dirty = true;
      throw error;
    } finally {
      if (uniforms.uRenderMode) uniforms.uRenderMode.value = renderMode;
      if (resolution && resolutionSnapshot) resolution.copy(resolutionSnapshot);
      if (pixelJitter && pixelJitterSnapshot) pixelJitter.copy(pixelJitterSnapshot);
      if (uniforms.uProgressiveLinearOutput) uniforms.uProgressiveLinearOutput.value = progressiveLinearOutput;
      if (uniforms.uProgressiveSampleIndex) uniforms.uProgressiveSampleIndex.value = progressiveSampleIndex;
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setViewport(previousViewport);
      this.renderer.setScissor(previousScissor);
      this.renderer.setScissorTest(previousScissorTest);
      this.renderer.autoClear = previousAutoClear;
      this.renderer.setClearColor(previousClearColor, previousClearAlpha);
      if (xr && previousXrEnabled !== undefined) xr.enabled = previousXrEnabled;
    }
  }

  getTextures(): readonly THREE.Texture[] {
    return this.target
      ? (this.target.textures as unknown as THREE.Texture[])
      : [];
  }

  get textures(): readonly THREE.Texture[] {
    return this.getTextures();
  }

  get size(): ViewObservationSize {
    return this.getSize();
  }

  get vramBytes(): number {
    return this.getVramBytes();
  }

  get status(): ViewObservationStatus {
    return this.getStatus();
  }

  getTarget(): THREE.WebGLRenderTarget | null {
    return this.target;
  }

  getSize(): ViewObservationSize {
    return statusSize(this.width, this.height);
  }

  getVramBytes(): number {
    return this.target ? this.width * this.height * 4 * 2 * 2 : 0;
  }

  getStatus(): ViewObservationStatus {
    const textures = this.getTextures();
    return Object.freeze({
      enabled: this.enabled && !this.disposed,
      availability: this.disposed ? "disabled" : this.availability,
      state: this.disposed ? "disabled" : this.availability,
      reason: this.reason,
      size: statusSize(this.width, this.height),
      width: this.width,
      height: this.height,
      vramBytes: this.getVramBytes(),
      dirty: this.dirty,
      dynamic: this.dynamic,
      lastRenderedAt: this.lastRenderedAt,
      renderCount: this.renderCount,
      textures,
      capability: this.capability,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const canvas = this.renderer.domElement;
    canvas?.removeEventListener("webglcontextlost", this.onContextLostListener);
    canvas?.removeEventListener("webglcontextrestored", this.onContextRestoredListener);
    this.target?.dispose();
    this.target = null;
    this.material?.dispose();
    this.geometry.dispose();
    this.scene.clear();
    this.dirty = false;
    this.availability = "disabled";
    this.reason = "view observation disposed";
  }
}

/** Keep the path-code contract discoverable to downstream display code. */
export function isViewPathCode(value: number): value is ViewPathCode {
  return value === VIEW_PATH_CODE.noEvent
    || value === VIEW_PATH_CODE.transmittedWithoutInternalReflection
    || value === VIEW_PATH_CODE.transmittedAfterOneInternalReflection
    || value === VIEW_PATH_CODE.unresolvedOuterPath
    || value === VIEW_PATH_CODE.ambiguousNestedFallback;
}

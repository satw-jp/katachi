export interface RendererStatePort<Target = unknown, Vector = unknown, Color = unknown> {
  getRenderTarget(): Target;
  getViewport(target: Vector): Vector;
  getScissor(target: Vector): Vector;
  getScissorTest(): boolean;
  getClearColor(target: Color): Color;
  getClearAlpha(): number;
  setRenderTarget(target: Target): void;
  setViewport(value: Vector): void;
  setScissor(value: Vector): void;
  setScissorTest(value: boolean): void;
  setClearColor(color: Color, alpha: number): void;
  autoClear: boolean;
}

export interface CapturedRendererState<Target, Vector, Color> { target: Target; viewport: Vector; scissor: Vector; scissorTest: boolean; color: Color; alpha: number; autoClear: boolean; }

export function captureRendererState<Target, Vector, Color>(renderer: RendererStatePort<Target, Vector, Color>, viewport: Vector, scissor: Vector, color: Color): CapturedRendererState<Target, Vector, Color> {
  return { target: renderer.getRenderTarget(), viewport: renderer.getViewport(viewport), scissor: renderer.getScissor(scissor), scissorTest: renderer.getScissorTest(), color: renderer.getClearColor(color), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear };
}

export function restoreRendererState<Target, Vector, Color>(renderer: RendererStatePort<Target, Vector, Color>, state: CapturedRendererState<Target, Vector, Color>): void {
  renderer.setRenderTarget(state.target); renderer.setViewport(state.viewport); renderer.setScissor(state.scissor); renderer.setScissorTest(state.scissorTest); renderer.setClearColor(state.color, state.alpha); renderer.autoClear = state.autoClear;
}

export class FormRendererResources {
  private live = true;
  private replacements = 0;
  private releasedBuffers = 0;
  update(): void { if (!this.live) throw new Error("FORM renderer is disposed"); }
  replacePositionBuffer(): void { this.update(); this.replacements += 1; this.releasedBuffers += 1; }
  dispose(): void { this.live = false; }
  counts(): { readonly points: number; readonly geometries: number; readonly attributes: number; readonly replacements: number; readonly releasedBuffers: number } {
    return this.live ? { points: 1, geometries: 1, attributes: 1, replacements: this.replacements, releasedBuffers: this.releasedBuffers } : { points: 0, geometries: 0, attributes: 0, replacements: this.replacements, releasedBuffers: this.releasedBuffers };
  }
}

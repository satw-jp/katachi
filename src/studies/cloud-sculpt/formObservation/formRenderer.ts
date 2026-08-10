import * as THREE from "three";
import type { CameraFit, FormPointSet, PcaResult, ProjectionFrame } from "./contracts.ts";
import type { CloudRenderer } from "../renderer.ts";
import { captureRendererState, FormRendererResources, restoreRendererState, type RendererStatePort } from "./rendererState.ts";

const PAPER = 0xf2efe7;
const INK = 0x173d4b;

export class FormObservationRenderer {
  private readonly scene = new THREE.Scene();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.PointsMaterial({ color: INK, size: 1.35, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 });
  private readonly points = new THREE.Points(this.geometry, this.material);
  private readonly cameras = new Map<ProjectionFrame["name"], THREE.OrthographicCamera>();
  private readonly resources = new FormRendererResources();
  private readonly cssSize = new THREE.Vector2();
  private fit: CameraFit | null = null;
  private displayedPositions: Float32Array | null = null;
  private renderCount = 0;
  private lastFrame = { width: 0, height: 0, panelCount: 0, contextLost: false };

  constructor(private readonly cloud: CloudRenderer) {
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    for (const name of ["top", "front", "side", "principal"] as const) this.cameras.set(name, new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100));
  }

  setResult(pointSet: FormPointSet, _pca: PcaResult, fit: CameraFit): void {
    this.resources.update();
    this.fit = fit;
    if (this.displayedPositions !== pointSet.positions) {
      // BufferGeometry.dispose() releases the renderer-managed GPU buffer while
      // preserving this single geometry/Points object for the next render.
      const replacing = this.displayedPositions !== null;
      if (replacing) this.geometry.dispose();
      this.geometry.setAttribute("position", new THREE.BufferAttribute(pointSet.positions, 3));
      this.displayedPositions = pointSet.positions;
      if (replacing) this.resources.replacePositionBuffer();
    }
    this.geometry.computeBoundingSphere();
  }

  setPointSize(size: number): void { this.material.size = size; }
  getResourceCounts(): ReturnType<FormRendererResources["counts"]> { return this.resources.counts(); }
  getDebugState(): { readonly renderCount: number; readonly width: number; readonly height: number; readonly panelCount: number; readonly hasFit: boolean; readonly hasPositions: boolean; readonly contextLost: boolean } {
    return { renderCount: this.renderCount, ...this.lastFrame, hasFit: this.fit !== null, hasPositions: this.displayedPositions !== null };
  }

  render(layout: "quad" | "single", active: ProjectionFrame["name"], zoom: number, pan: readonly [number, number]): void {
    const renderer = this.cloud.renderer;
    // WebGLRenderer viewport/scissor values are CSS pixels and are multiplied
    // by its pixel ratio internally. Using canvas.width/height here applies DPR
    // twice, making every quad panel cover most of a Retina drawing buffer.
    renderer.getSize(this.cssSize);
    const width = this.cssSize.x;
    const height = this.cssSize.y;
    this.lastFrame = { width, height, panelCount: 0, contextLost: renderer.getContext().isContextLost() };
    if (width <= 0 || height <= 0) return;
    const panels = !this.fit ? [] : layout === "quad"
      ? this.fit.frames.map((frame, index) => ({ frame, x: (index % 2) * Math.floor(width / 2), y: index < 2 ? Math.floor(height / 2) : 0, width: Math.floor(width / 2), height: Math.floor(height / 2) }))
      : this.fit.frames.filter((frame) => frame.name === active).map((frame) => ({ frame, x: 0, y: 0, width, height }));
    this.lastFrame = { width, height, panelCount: panels.length, contextLost: renderer.getContext().isContextLost() };
    const statePort = renderer as unknown as RendererStatePort<THREE.WebGLRenderTarget | null, THREE.Vector4, THREE.Color>;
    const previous = captureRendererState(statePort, new THREE.Vector4(), new THREE.Vector4(), new THREE.Color());
    try {
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.setScissorTest(true);
      renderer.setClearColor(PAPER, 1);
      // Paint the observation paper even while the Worker is still sampling.
      // A slow or failed request must never leave the previous black frame.
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.clear(true, true, true);
      for (const panel of panels) {
        const camera = this.cameras.get(panel.frame.name)!;
        this.configureCamera(camera, panel.frame, panel.width / Math.max(1, panel.height), zoom, pan);
        renderer.setViewport(panel.x, panel.y, panel.width, panel.height);
        renderer.setScissor(panel.x, panel.y, panel.width, panel.height);
        renderer.render(this.scene, camera);
      }
      this.renderCount += 1;
    } finally {
      restoreRendererState(statePort, previous);
    }
  }

  private configureCamera(camera: THREE.OrthographicCamera, frame: ProjectionFrame, aspect: number, zoom: number, pan: readonly [number, number]): void {
    const span = this.fit!.orthographicSpan / zoom;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2;
    const horizontal = new THREE.Vector3(...frame.horizontalAxis);
    const vertical = new THREE.Vector3(...frame.verticalAxis);
    const normal = new THREE.Vector3().crossVectors(horizontal, vertical).normalize();
    const center = horizontal.multiplyScalar(frame.center[0] + pan[0] * span).addScaledVector(vertical, frame.center[1] + pan[1] * span);
    camera.position.copy(center).addScaledVector(normal, 20);
    camera.up.copy(vertical);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  dispose(): void { this.geometry.dispose(); this.material.dispose(); this.resources.dispose(); }
}

import * as THREE from "three";
import type { VisualQualityMode } from "../visual/visualQuality.ts";

export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fov: number;
}

export interface CaptureSurface {
  readonly canvas: HTMLCanvasElement;
  render(): void;
  dispose(): void;
}

function cloneCamera(source: THREE.PerspectiveCamera, width: number, height: number): THREE.PerspectiveCamera {
  const camera = source.clone() as THREE.PerspectiveCamera;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  return camera;
}

export class RenderSurface {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.01, 100);
  private readonly artwork: HTMLElement;

  constructor(artwork: HTMLElement, visualQuality: VisualQualityMode = "lifted") {
    this.artwork = artwork;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.domElement.setAttribute("aria-label", "SKIN ART Concept Lab artwork");
    this.renderer.domElement.className = "concept-lab-v4-canvas";
    this.artwork.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.scene.scale.setScalar(visualQuality === "baseline" ? 1.6 : 1.86);
    this.camera.position.set(5.4, -8.2, 4.5);
    this.camera.lookAt(0, 0.2, 0);
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  resize = (): void => {
    const width = Math.max(1, this.artwork.clientWidth || window.innerWidth);
    const height = Math.max(1, this.artwork.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  render(): void { this.renderer.render(this.scene, this.camera); }

  setFieldOfView(value: number): void {
    this.camera.fov = value;
    this.camera.updateProjectionMatrix();
  }

  cameraState(): CameraState {
    return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, fov: this.camera.fov };
  }

  createCaptureSurface(width: number, height: number): CaptureSurface {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    const camera = cloneCamera(this.camera, width, height);
    return {
      canvas,
      render: () => {
        camera.position.copy(this.camera.position);
        camera.quaternion.copy(this.camera.quaternion);
        camera.fov = this.camera.fov;
        camera.updateProjectionMatrix();
        renderer.render(this.scene, camera);
      },
      dispose: () => renderer.dispose(),
    };
  }

  async capturePng(width: number, height: number): Promise<Blob> {
    const pixels = new Uint8Array(width * height * 4);
    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, cloneCamera(this.camera, width, height));
    this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    this.renderer.setRenderTarget(null);
    target.dispose();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG capture requires a 2D canvas context");
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const sourceOffset = y * width * 4;
      const targetOffset = (height - y - 1) * width * 4;
      image.data.set(pixels.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
    }
    context.putImageData(image, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG capture returned an empty blob")), "image/png");
    });
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { HitsujiVariant } from "./deformation.ts";

const VARIANTS: HitsujiVariant[] = ["original", "differential-growth", "phase-separation", "flow-wool"];
const LABELS: Record<HitsujiVariant, string> = {
  original: "加工前",
  "differential-growth": "差分成長",
  "phase-separation": "相分離",
  "flow-wool": "流れに沿う羊毛化",
};

export class HitsujiRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly scenes = new Map<HitsujiVariant, THREE.Scene>();
  private readonly meshes = new Map<HitsujiVariant, THREE.Mesh>();
  private readonly labels: HTMLDivElement;
  private frame = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(3.25, 1.55, 3.75);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, -0.03, 0);
    this.controls.enableDamping = true;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.minDistance = 2.3;
    this.controls.maxDistance = 8;

    this.labels = document.createElement("div");
    this.labels.className = "comparison-labels";
    for (const variant of VARIANTS) {
      const label = document.createElement("div");
      label.textContent = LABELS[variant];
      this.labels.appendChild(label);
      this.scenes.set(variant, this.createScene());
    }
    container.appendChild(this.labels);

    this.render = this.render.bind(this);
    this.render();
  }

  private createScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101114);
    scene.add(new THREE.HemisphereLight(0xf7f3e8, 0x303640, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db8cf, 1.2);
    rim.position.set(-4, 1, -3);
    scene.add(rim);
    const grid = new THREE.GridHelper(5, 10, 0x34363b, 0x24262a);
    grid.position.y = -1.12;
    scene.add(grid);
    return scene;
  }

  setGeometries(geometries: Record<HitsujiVariant, THREE.BufferGeometry>): void {
    for (const variant of VARIANTS) {
      const old = this.meshes.get(variant);
      if (old) {
        this.scenes.get(variant)!.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
      }
      const material = new THREE.MeshStandardMaterial({
        color: variant === "original" ? 0xd9d8d2 : 0xe5e1d6,
        roughness: 0.72,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometries[variant], material);
      this.meshes.set(variant, mesh);
      this.scenes.get(variant)!.add(mesh);
    }
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  resetView(): void {
    this.camera.position.set(3.25, 1.55, 3.75);
    this.controls.target.set(0, -0.03, 0);
    this.controls.update();
  }

  private render(): void {
    this.frame = requestAnimationFrame(this.render);
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (this.renderer.domElement.width !== Math.round(width * this.renderer.getPixelRatio()) ||
        this.renderer.domElement.height !== Math.round(height * this.renderer.getPixelRatio())) {
      this.renderer.setSize(width, height, false);
    }
    this.controls.update();

    const cellWidth = Math.floor(width / 2);
    const cellHeight = Math.floor(height / 2);
    this.camera.aspect = cellWidth / cellHeight;
    this.camera.updateProjectionMatrix();

    VARIANTS.forEach((variant, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = col * cellWidth;
      const y = height - (row + 1) * cellHeight;
      const w = col === 1 ? width - x : cellWidth;
      const h = row === 1 ? height - cellHeight : cellHeight;
      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);
      this.renderer.render(this.scenes.get(variant)!, this.camera);
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------------------
// Three.js wiring for S2c. T2d-mpm.md §2 "表示: 第一段は粒子の点描でよい" —
// a plain THREE.Points cloud (no raymarched SDF like S1/S2/S2b; MPM's
// material isn't a smooth field of a handful of balls, it's thousands of
// discrete points, so a point splat is both the honest and the cheap
// choice here). Point color is a simple phase-tinted uniform color (NOT a
// calibrated 余白 instrument — Y6's role separation, T2d-mpm.md "やらないこと",
// explicitly defers strain/margin coloring to a later Study).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MpmParticle } from "./particle.ts";
import { DOMAIN_HALF, DOMAIN_SIZE, marginWorld } from "./sim.ts";

export class MpmRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private container: HTMLElement;
  private capacity = 0;
  private ground: THREE.Mesh;
  private gridHelper: THREE.GridHelper;

  constructor(container: HTMLElement, renderer: THREE.WebGLRenderer) {
    this.container = container;
    this.renderer = renderer;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    this.camera.position.set(5, 4.5, 7);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1.2, 0);
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.scene.background = new THREE.Color(0x101114);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(3, 6, 4);
    this.scene.add(dirLight);

    // Positioned at the ACTUAL simulated floor height (marginWorld — see
    // sim.ts's BOUND doc comment: the grid's boundary-safety margin means
    // the floor isn't literally at y=0), not at S1/S2/S2b's y=0 convention.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(DOMAIN_SIZE, DOMAIN_SIZE),
      new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);

    this.gridHelper = new THREE.GridHelper(DOMAIN_SIZE, 16, 0x33363f, 0x24262c);
    (this.gridHelper.material as THREE.Material).transparent = true;
    (this.gridHelper.material as THREE.Material).opacity = 0.5;
    this.scene.add(this.gridHelper);

    const box = new THREE.Box3(new THREE.Vector3(-DOMAIN_HALF, 0, -DOMAIN_HALF), new THREE.Vector3(DOMAIN_HALF, DOMAIN_SIZE, DOMAIN_HALF));
    this.scene.add(new THREE.Box3Helper(box, new THREE.Color(0x33363f)));

    this.setGridResolution(48);

    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.PointsMaterial({ size: 0.045, sizeAttenuation: true, vertexColors: true });
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Reposition the ground plane/grid helper to match the simulated floor for a given grid resolution (marginWorld() — sim.ts). */
  setGridResolution(gridN: number): void {
    const y = marginWorld(gridN);
    this.ground.position.y = y;
    this.gridHelper.position.y = y;
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** phase in [0,1]: solid tint (warm coral, "clay") .. fluid tint (cool blue, "water"). Purely illustrative, not a strain/margin instrument. */
  update(particles: MpmParticle[], phase: number): void {
    const n = particles.length;
    if (n > this.capacity || this.capacity === 0) {
      this.capacity = Math.max(n, Math.ceil(this.capacity * 1.5), 256);
      this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3));
      this.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3));
    }
    const posAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colorAttr = this.geometry.getAttribute("color") as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colorArr = colorAttr.array as Float32Array;

    const solidColor = new THREE.Color(0xe8a37a);
    const fluidColor = new THREE.Color(0x6fb1ff);
    const mix = new THREE.Color().lerpColors(solidColor, fluidColor, Math.max(0, Math.min(1, phase)));

    for (let i = 0; i < n; i++) {
      const p = particles[i];
      posArr[i * 3 + 0] = p.x;
      posArr[i * 3 + 1] = p.y;
      posArr[i * 3 + 2] = p.z;
      // A little speed-based brightening so motion reads even in a static
      // screenshot (illustrative, not a calibrated quantity).
      const speed = Math.min(1, Math.hypot(p.vx, p.vy, p.vz) * 0.6);
      colorArr[i * 3 + 0] = Math.min(1, mix.r + speed * 0.25);
      colorArr[i * 3 + 1] = Math.min(1, mix.g + speed * 0.25);
      colorArr[i * 3 + 2] = Math.min(1, mix.b + speed * 0.25);
    }
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
    this.geometry.computeBoundingSphere();
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

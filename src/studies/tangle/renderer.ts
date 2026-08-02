import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import type { Point3, VoxelDomain } from "./path.ts";
import type { WeavePattern } from "./weavePatterns.ts";

const PATH_COLORS = [0xd7c9a8, 0x91a9b8, 0xc39b88, 0xa6ad8a, 0xb89bb2, 0x8da6a0, 0xd0b77e, 0x9c9ab8];
const DEFAULT_TUBE_RADIUS = 0.031;

export interface TangleRenderStats {
  triangles: number;
  fieldSamples: number;
  elapsedMs: number;
}

export class TangleRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly trajectoryScene = this.createScene();
  private readonly fusedScene = this.createScene();
  private readonly trajectoryRoot = new THREE.Group();
  private readonly fusedPathRoot = new THREE.Group();
  private readonly trajectoryHostRoot = new THREE.Group();
  private readonly fusedHostRoot = new THREE.Group();
  private readonly comparisonScenes = Array.from({ length: 4 }, () => this.createScene());
  private readonly comparisonRoots = Array.from({ length: 4 }, () => new THREE.Group());
  private readonly comparisonHostRoots = Array.from({ length: 4 }, () => new THREE.Group());
  private readonly fusedMaterial = new THREE.MeshStandardMaterial({
    color: 0xe1d4bd,
    roughness: 0.72,
    metalness: 0.01,
    side: THREE.DoubleSide,
  });
  private readonly surface = new MarchingCubes(48, this.fusedMaterial, false, false, 100_000);
  private readonly labels: HTMLDivElement;
  private comparisonMode = false;
  private frame = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(2.8, 1.85, 3.65);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.65;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 7;

    this.trajectoryScene.add(this.trajectoryRoot);
    this.trajectoryScene.add(this.trajectoryHostRoot);
    this.fusedScene.add(this.fusedPathRoot);
    this.fusedScene.add(this.surface);
    this.fusedScene.add(this.fusedHostRoot);
    this.comparisonScenes.forEach((scene, index) => {
      scene.add(this.comparisonRoots[index]);
      scene.add(this.comparisonHostRoots[index]);
    });

    this.labels = document.createElement("div");
    this.labels.className = "comparison-labels";
    this.setLabels([
      { title: "軌跡" },
      { title: "太さ・接触・融合" },
    ]);
    container.appendChild(this.labels);

    this.render = this.render.bind(this);
    this.render();
  }

  private createScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101114);
    scene.fog = new THREE.FogExp2(0x101114, 0.045);
    scene.add(new THREE.HemisphereLight(0xf6f0e4, 0x232933, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8ca7be, 1.15);
    rim.position.set(-4, 1, -3);
    scene.add(rim);
    const grid = new THREE.GridHelper(2.6, 8, 0x36383d, 0x26282c);
    grid.position.y = -0.92;
    scene.add(grid);
    return scene;
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  resetView(): void {
    this.camera.position.set(2.8, 1.85, 3.65);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setComparisonMode(enabled: boolean): void {
    this.comparisonMode = enabled;
    this.labels.classList.toggle("four-up", enabled);
    if (!enabled) {
      this.setLabels([
        { title: "軌跡" },
        { title: "太さ・接触・融合" },
      ]);
    }
  }

  private setLabels(items: Array<{ title: string; note?: string }>): void {
    this.labels.replaceChildren(
      ...items.map((item) => {
        const label = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = item.title;
        label.appendChild(title);
        if (item.note) {
          const note = document.createElement("span");
          note.textContent = item.note;
          label.appendChild(note);
        }
        return label;
      }),
    );
  }

  private clearMeshes(root: THREE.Group): void {
    while (root.children.length > 0) {
      const child = root.children.pop();
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  setHostGeometry(geometry: THREE.BufferGeometry): void {
    const replaceHost = (root: THREE.Group, opacity: number) => {
      while (root.children.length > 0) {
        const child = root.children.pop();
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
      const material = new THREE.MeshBasicMaterial({
        color: 0x98a9b2,
        wireframe: true,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      root.add(new THREE.Mesh(geometry.clone(), material));
    };
    replaceHost(this.trajectoryHostRoot, 0.16);
    replaceHost(this.fusedHostRoot, 0.1);
    this.comparisonHostRoots.forEach((root) => replaceHost(root, 0.12));
  }

  private clipFieldToDomain(domain: VoxelDomain, boundaryFreedom: number): void {
    const size = this.surface.size;
    const outsideAllowanceVoxels =
      boundaryFreedom > 0 ? Math.max(1, Math.ceil(boundaryFreedom * 3)) : 0;
    const domainCoordinate = (value: number) =>
      Math.min(
        domain.size - 1,
        Math.max(0, Math.round((value / (domain.extent * 2) + 0.5) * (domain.size - 1))),
      );
    for (let z = 0; z < size; z++) {
      const worldZ = ((z - size / 2) / (size / 2)) * domain.extent;
      const dz = domainCoordinate(worldZ);
      for (let y = 0; y < size; y++) {
        const worldY = ((y - size / 2) / (size / 2)) * domain.extent;
        const dy = domainCoordinate(worldY);
        for (let x = 0; x < size; x++) {
          const worldX = ((x - size / 2) / (size / 2)) * domain.extent;
          const dx = domainCoordinate(worldX);
          const domainIndex = dx + domain.size * (dy + domain.size * dz);
          const outsideAllowed =
            outsideAllowanceVoxels > 0 &&
            domain.distanceToSurface[domainIndex] <= outsideAllowanceVoxels;
          if (domain.inside[domainIndex] !== 1 && !outsideAllowed) {
            this.surface.field[x + size * (y + size * z)] = 0;
          }
        }
      }
    }
  }

  setPaths(
    paths: Point3[][],
    fusion: number,
    boundaryFreedom: number,
    tubeRadius: number,
    domain: VoxelDomain,
  ): TangleRenderStats {
    const startedAt = performance.now();
    this.clearMeshes(this.trajectoryRoot);
    this.clearMeshes(this.fusedPathRoot);

    const curves: THREE.CatmullRomCurve3[] = [];
    const fusedPresence = THREE.MathUtils.smoothstep(fusion, 0.12, 0.92);
    const independentPresence = 1 - THREE.MathUtils.smoothstep(fusion, 0.45, 0.96);
    paths.forEach((path, index) => {
      if (path.length < 2) return;
      const points = path.map((point) => new THREE.Vector3(point.x, point.y, point.z));
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.45);
      curves.push(curve);
      const segments = Math.max(12, path.length * 2);
      const geometry = new THREE.TubeGeometry(
        curve,
        segments,
        Math.min(0.021, tubeRadius * 0.7),
        7,
        false,
      );
      const material = new THREE.MeshStandardMaterial({
        color: PATH_COLORS[index % PATH_COLORS.length],
        roughness: 0.62,
        metalness: 0,
      });
      this.trajectoryRoot.add(new THREE.Mesh(geometry, material));

      const fusedPathGeometry = new THREE.TubeGeometry(curve, segments, tubeRadius, 8, false);
      const fusedPathMaterial = new THREE.MeshStandardMaterial({
        color: PATH_COLORS[index % PATH_COLORS.length],
        roughness: 0.7,
        metalness: 0,
        transparent: independentPresence < 0.999,
        opacity: independentPresence,
        depthWrite: independentPresence > 0.92,
      });
      const fusedPathMesh = new THREE.Mesh(fusedPathGeometry, fusedPathMaterial);
      fusedPathMesh.visible = independentPresence > 0.01;
      this.fusedPathRoot.add(fusedPathMesh);
    });

    this.surface.reset();
    this.surface.isolation = 80;
    this.surface.scale.setScalar(domain.extent);
    this.surface.visible = fusedPresence > 0.01;
    this.fusedMaterial.transparent = fusedPresence < 0.999;
    this.fusedMaterial.opacity = fusedPresence;
    this.fusedMaterial.depthWrite = fusedPresence > 0.92;
    this.fusedMaterial.needsUpdate = true;

    const thicknessScale = (tubeRadius / DEFAULT_TUBE_RADIUS) ** 2;
    const strength = THREE.MathUtils.lerp(0.012, 0.075, fusion) * thicknessScale;
    const subtract = THREE.MathUtils.lerp(28, 12, fusion);
    let fieldSamples = 0;
    for (const curve of curves) {
      const sampleCount = Math.min(
        320,
        Math.max(52, Math.ceil(curve.getLength() / Math.max(tubeRadius * 1.4, 0.012))),
      );
      const samples = curve.getSpacedPoints(sampleCount);
      for (let index = 0; index < samples.length - 1; index++) {
        const point = samples[index];
        this.surface.addBall(
          point.x / (domain.extent * 2) + 0.5,
          point.y / (domain.extent * 2) + 0.5,
          point.z / (domain.extent * 2) + 0.5,
          strength,
          subtract,
        );
        fieldSamples++;
      }
    }
    if (this.surface.visible) {
      this.surface.blur(THREE.MathUtils.lerp(0, 0.45, fusion));
      this.clipFieldToDomain(domain, boundaryFreedom);
      this.surface.update();
    }

    return {
      triangles: this.surface.visible ? Math.round(this.surface.count / 3) : 0,
      fieldSamples,
      elapsedMs: performance.now() - startedAt,
    };
  }

  setComparisonPatterns(patterns: WeavePattern[], tubeRadius: number): void {
    this.comparisonRoots.forEach((root) => this.clearMeshes(root));
    patterns.slice(0, 4).forEach((pattern, patternIndex) => {
      pattern.paths.forEach((path, pathIndex) => {
        if (path.length < 2) return;
        const curve = new THREE.CatmullRomCurve3(
          path.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
          false,
          "centripetal",
          0.45,
        );
        const geometry = new THREE.TubeGeometry(
          curve,
          Math.max(10, Math.min(360, path.length * 2)),
          tubeRadius,
          7,
          false,
        );
        const material = new THREE.MeshStandardMaterial({
          color: PATH_COLORS[(patternIndex * 2 + pathIndex) % PATH_COLORS.length],
          roughness: 0.64,
          metalness: 0,
        });
        this.comparisonRoots[patternIndex].add(new THREE.Mesh(geometry, material));
      });
    });
    this.setLabels(
      patterns.slice(0, 4).map((pattern) => ({
        title: `${pattern.label} · ${pattern.totalLength.toFixed(1)} · ${pattern.paths.length}本`,
        note: pattern.note,
      })),
    );
  }

  private render(): void {
    this.frame = requestAnimationFrame(this.render);
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const pixelRatio = this.renderer.getPixelRatio();
    if (
      this.renderer.domElement.width !== Math.round(width * pixelRatio) ||
      this.renderer.domElement.height !== Math.round(height * pixelRatio)
    ) {
      this.renderer.setSize(width, height, false);
    }
    this.controls.update();

    if (this.comparisonMode) {
      const cellWidth = Math.floor(width / 2);
      const cellHeight = Math.floor(height / 2);
      this.camera.aspect = cellWidth / cellHeight;
      this.camera.updateProjectionMatrix();
      this.comparisonScenes.forEach((scene, index) => {
        const x = index % 2 === 0 ? 0 : cellWidth;
        const y = index < 2 ? height - cellHeight : 0;
        const viewportWidth = index % 2 === 0 ? cellWidth : width - cellWidth;
        const viewportHeight = index < 2 ? cellHeight : height - cellHeight;
        this.renderer.setViewport(x, y, viewportWidth, viewportHeight);
        this.renderer.setScissor(x, y, viewportWidth, viewportHeight);
        this.renderer.render(scene, this.camera);
      });
      return;
    }

    const leftWidth = Math.floor(width / 2);
    this.camera.aspect = leftWidth / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setViewport(0, 0, leftWidth, height);
    this.renderer.setScissor(0, 0, leftWidth, height);
    this.renderer.render(this.trajectoryScene, this.camera);

    this.renderer.setViewport(leftWidth, 0, width - leftWidth, height);
    this.renderer.setScissor(leftWidth, 0, width - leftWidth, height);
    this.renderer.render(this.fusedScene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.comparisonRoots.forEach((root) => this.clearMeshes(root));
    this.comparisonHostRoots.forEach((root) => this.clearMeshes(root));
    this.surface.geometry.dispose();
    this.fusedMaterial.dispose();
    this.renderer.dispose();
  }
}

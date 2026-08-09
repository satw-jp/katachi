import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import {
  FLOWER_FORM_SCALE,
  createFlowerFormComponents,
  type FlowerFormParams,
} from "./flowerForm.ts";
import type { FlowerComponent } from "./packing.ts";
import { flowerFieldSdf, unifiedSamplingCube } from "./unifiedField.ts";

const FORM_MAX_POLYGONS = 28_000;

export type FlowerFormView = "front" | "side" | "oblique" | "thumbnail";

export interface FlowerFormRendererOptions {
  view: FlowerFormView;
  resolution?: number;
  background?: THREE.ColorRepresentation;
  showGuide?: boolean;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

export class FlowerFormRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  private readonly content = new THREE.Group();
  private readonly resolution: number;
  private readonly showGuide: boolean;

  constructor(
    private readonly container: HTMLElement,
    options: FlowerFormRendererOptions,
  ) {
    this.resolution = options.resolution ?? 38;
    this.showGuide = options.showGuide ?? options.view !== "thumbnail";
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.view === "thumbnail" ? 1.25 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(options.background ?? 0x101114, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);

    this.positionCamera(options.view);
    this.scene.add(new THREE.HemisphereLight(0xf4f0e7, 0x141820, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.9);
    key.position.set(4, 6, 7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8aa4c5, 1.45);
    rim.position.set(-5, 1, -4);
    this.scene.add(rim);
    this.scene.add(this.content);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private positionCamera(view: FlowerFormView): void {
    if (view === "front") this.camera.position.set(0, 0, 5.2);
    else if (view === "side") this.camera.position.set(5.2, 0, 0);
    else if (view === "oblique") this.camera.position.set(3.8, 2.7, 4.7);
    else this.camera.position.set(3.9, 2.8, 4.8);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height);
    const aspect = width / height;
    const viewHeight = 3.25;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  update(petalCount: 3 | 4, params: FlowerFormParams, showSources = false): void {
    for (const child of [...this.content.children]) {
      this.content.remove(child);
      disposeObject(child);
    }
    this.content.add(this.buildFlower(petalCount, params, showSources));
  }

  private buildFlower(
    petalCount: 3 | 4,
    params: FlowerFormParams,
    showSources: boolean,
  ): THREE.Group {
    const group = new THREE.Group();
    const components = createFlowerFormComponents(petalCount, params);
    const blend = FLOWER_FORM_SCALE * 0.2;
    const cube = unifiedSamplingCube(components, blend, this.resolution);
    const material = new THREE.MeshStandardMaterial({
      color: petalCount === 3 ? 0xded9cf : 0xf19a7d,
      roughness: 0.6,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    const surface = new MarchingCubes(
      this.resolution,
      material,
      false,
      false,
      FORM_MAX_POLYGONS,
    );
    surface.isolation = 0;
    this.fillField(surface, components, cube.center, cube.halfExtent, blend, params.neck);
    surface.update();
    surface.scale.setScalar(cube.halfExtent);
    surface.position.set(cube.center.x, cube.center.y, cube.center.z);
    group.add(surface);

    if (showSources) group.add(this.buildSourceSpheres(components));
    if (this.showGuide) group.add(this.buildGuide());
    return group;
  }

  private fillField(
    surface: MarchingCubes,
    components: readonly FlowerComponent[],
    center: { x: number; y: number; z: number },
    halfExtent: number,
    blend: number,
    neck: number,
  ): void {
    const halfSize = surface.halfsize;
    for (let z = 0; z < surface.size; z++) {
      const pz = center.z + ((z - halfSize) / halfSize) * halfExtent;
      for (let y = 0; y < surface.size; y++) {
        const py = center.y + ((y - halfSize) / halfSize) * halfExtent;
        const row = surface.size2 * z + surface.size * y;
        for (let x = 0; x < surface.size; x++) {
          const px = center.x + ((x - halfSize) / halfSize) * halfExtent;
          surface.field[row + x] = -flowerFieldSdf(components, { x: px, y: py, z: pz }, blend, neck);
        }
      }
    }
  }

  private buildSourceSpheres(components: readonly FlowerComponent[]): THREE.InstancedMesh {
    const geometry = new THREE.SphereGeometry(1, 18, 12);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff845f,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, components.length);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      matrix.compose(
        new THREE.Vector3(component.position.x, component.position.y, component.position.z),
        new THREE.Quaternion(),
        new THREE.Vector3(component.radius, component.radius, component.radius),
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 4;
    return mesh;
  }

  private buildGuide(): THREE.Group {
    const guide = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: 0xb9bec8,
      transparent: true,
      opacity: 0.14,
    });
    for (const points of [
      [new THREE.Vector3(-1.22, 0, 0), new THREE.Vector3(1.22, 0, 0)],
      [new THREE.Vector3(0, -1.22, 0), new THREE.Vector3(0, 1.22, 0)],
      [new THREE.Vector3(0, 0, -0.72), new THREE.Vector3(0, 0, 0.72)],
    ]) {
      guide.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material.clone()));
    }
    return guide;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

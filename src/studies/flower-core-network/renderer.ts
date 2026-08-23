import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshBuildResult, Triangle } from "../cloud-sculpt/meshExport.ts";
import type { Vec3 } from "../flower-packing-spike/packing.ts";
import {
  ROUTE_LABELS,
  cross,
  dot,
  normalize,
  sub,
  type CoreNetworkParams,
  type CoreRoute,
  type RouteStrategy,
} from "./model.ts";
import type { CoreNetworkDiagnostics } from "./diagnostics.ts";

export type NetworkCameraView = "outside" | "inside" | "side";

export interface NetworkPanelRender {
  strategy: RouteStrategy;
  mesh: MeshBuildResult;
  routes: CoreRoute[];
  diagnostics: CoreNetworkDiagnostics;
  params: CoreNetworkParams;
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

function triangleNormal(triangle: Triangle): Vec3 {
  return normalize(cross(sub(triangle.b, triangle.a), sub(triangle.c, triangle.a)));
}

function meshCenter(mesh: MeshBuildResult): Vec3 {
  return {
    x: (mesh.sourceBounds.min.x + mesh.sourceBounds.max.x) * 0.5,
    y: (mesh.sourceBounds.min.y + mesh.sourceBounds.max.y) * 0.5,
    z: (mesh.sourceBounds.min.z + mesh.sourceBounds.max.z) * 0.5,
  };
}

function toThree(point: Vec3, center: Vec3, xOffset: number): THREE.Vector3 {
  return new THREE.Vector3(point.x - center.x + xOffset, point.y - center.y, point.z - center.z);
}

export class FlowerCoreNetworkRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  readonly controls: OrbitControls;

  private readonly container: HTMLElement;
  private readonly content = new THREE.Group();
  private view: NetworkCameraView = "outside";
  private patchDirection: Vec3 = { x: 0, y: 1, z: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x101114, 1);
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 4.5, 10.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 18;

    this.scene.add(new THREE.HemisphereLight(0xf4f0e7, 0x10131a, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 8, 7);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ba8cb, 1.2);
    fill.position.set(-6, 1, -5);
    this.scene.add(fill);
    this.scene.add(this.content);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setCameraView(view: NetworkCameraView, global = false): void {
    this.view = view;
    if (global) {
      if (view === "outside") {
        this.camera.position.set(0, 3.2, 8.4);
        this.camera.up.set(0, 1, 0);
        this.controls.target.set(0, 0, 0);
      } else if (view === "inside") {
        this.camera.position.set(0, 0, 0.08);
        this.camera.up.set(0, 1, 0);
        this.controls.target.set(0, 0, 3);
      } else {
        this.camera.position.set(0, 8.4, 0.2);
        this.camera.up.set(0, 0, -1);
        this.controls.target.set(0, 0, 0);
      }
    } else {
      const distance = 9.6;
      if (view === "outside") {
        this.camera.position.set(0, distance * 0.08, distance);
        this.camera.up.set(0, 1, 0);
      } else if (view === "inside") {
        this.camera.position.set(0, distance * 0.08, -distance);
        this.camera.up.set(0, 1, 0);
      } else {
        this.camera.position.set(0, distance, 0.2);
        this.camera.up.set(0, 0, -1);
      }
      this.controls.target.set(0, 0, 0);
    }
    this.controls.update();
  }

  setPatchDirection(direction: Vec3): void {
    this.patchDirection = normalize(direction);
    this.setCameraView(this.view, false);
  }

  updateComparison(panels: readonly NetworkPanelRender[]): void {
    this.clear();
    const offsets = [-3, 0, 3];
    panels.forEach((panel, index) => {
      const group = this.buildPanel(panel, 0);
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(this.patchDirection.x, this.patchDirection.y, this.patchDirection.z).normalize(),
        new THREE.Vector3(0, 0, 1),
      );
      group.position.x = offsets[index] ?? 0;
      this.content.add(group);
    });
    this.setCameraView(this.view, false);
  }

  updateGlobal(panel: NetworkPanelRender): void {
    this.clear();
    this.content.add(this.buildPanel(panel, 0));
    this.setCameraView(this.view, true);
  }

  private clear(): void {
    for (const child of [...this.content.children]) {
      this.content.remove(child);
      disposeObject(child);
    }
  }

  private buildPanel(panel: NetworkPanelRender, xOffset: number): THREE.Group {
    const group = new THREE.Group();
    const center = meshCenter(panel.mesh);
    group.add(this.buildMesh(panel, center, xOffset));
    group.add(this.buildRoutes(panel.routes, center, xOffset));
    group.add(this.buildDirectionArrow(panel.params.buildDirection, xOffset, panel.mesh.sourceBounds.longest));
    group.userData.label = ROUTE_LABELS[panel.strategy];
    return group;
  }

  private buildMesh(panel: NetworkPanelRender, center: Vec3, xOffset: number): THREE.Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    const up = normalize(panel.params.buildDirection);
    const threshold = -Math.cos((panel.params.overhangLimitDeg * Math.PI) / 180);
    const safe = new THREE.Color(0xb9cce5);
    const risk = new THREE.Color(0xee795e);
    for (const triangle of panel.mesh.triangles) {
      const normal = triangleNormal(triangle);
      const amount = dot(normal, up) < threshold ? 1 : 0;
      const color = safe.clone().lerp(risk, amount);
      for (const vertex of [triangle.a, triangle.b, triangle.c]) {
        positions.push(vertex.x - center.x + xOffset, vertex.y - center.y, vertex.z - center.z);
        colors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }

  private buildRoutes(routes: readonly CoreRoute[], center: Vec3, xOffset: number): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: 0xffd071,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
    });
    for (const route of routes) {
      const points = route.samples.map((sample) => toThree(sample.position, center, xOffset));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geometry, material.clone()));
    }
    return group;
  }

  private buildDirectionArrow(direction: Vec3, xOffset: number, size: number): THREE.ArrowHelper {
    const origin = new THREE.Vector3(xOffset - size * 0.38, -size * 0.42, -size * 0.2);
    return new THREE.ArrowHelper(
      new THREE.Vector3(direction.x, direction.y, direction.z).normalize(),
      origin,
      size * 0.38,
      0xf0c56e,
      size * 0.08,
      size * 0.045,
    );
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

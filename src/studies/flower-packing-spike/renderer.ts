import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import {
  DOMAIN_RADIUS,
  PLANE_RADIUS,
  collisionProxies,
  flowerComponents,
  type DomainKind,
  type PackingParams,
  type PackingResult,
  type Vec3,
} from "./packing.ts";
import { flowerFieldSdf, unifiedSamplingCube } from "./unifiedField.ts";
import type { MeshBuildResult } from "../cloud-sculpt/meshExport.ts";

const LEFT_OFFSET = -2.25;
const RIGHT_OFFSET = 2.25;

export interface RendererPanel {
  result: PackingResult;
  color: number;
  params: PackingParams;
}

export type FlowerViewMode = "spheres" | "unified";
export type PackingCameraView = "front" | "side" | "oblique";

const UNIFIED_RESOLUTION = 20;
const UNIFIED_MAX_POLYGONS = 6_000;

function toVector3(value: Vec3, xOffset: number): THREE.Vector3 {
  return new THREE.Vector3(value.x + xOffset, value.y, value.z);
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

export class FlowerPackingRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  readonly controls: OrbitControls;

  private readonly container: HTMLElement;
  private readonly content = new THREE.Group();

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x101114, 1);
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 4.8, 9.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 5;
    this.controls.maxDistance = 15;

    this.scene.add(new THREE.HemisphereLight(0xf4f0e7, 0x141820, 1.65));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 8, 7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8aa4c5, 1.2);
    rim.position.set(-6, 2, -5);
    this.scene.add(rim);
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

  setCameraView(view: PackingCameraView): void {
    const distance = 10.4;
    if (view === "front") this.camera.position.set(0, 0.4, distance);
    else if (view === "side") this.camera.position.set(0, distance, 0.4);
    else this.camera.position.set(0, 4.8, 9.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  update(
    left: RendererPanel,
    right: RendererPanel,
    showProxies: boolean,
    viewMode: FlowerViewMode,
    rightLaceMesh: MeshBuildResult | null = null,
  ): void {
    for (const child of [...this.content.children]) {
      this.content.remove(child);
      disposeObject(child);
    }
    this.content.add(this.buildPanel(left, left.params, LEFT_OFFSET, showProxies, viewMode));
    this.content.add(this.buildPanel(right, right.params, RIGHT_OFFSET, showProxies, viewMode, rightLaceMesh));
  }

  private buildPanel(
    panel: RendererPanel,
    params: PackingParams,
    xOffset: number,
    showProxies: boolean,
    viewMode: FlowerViewMode,
    laceMesh: MeshBuildResult | null = null,
  ): THREE.Group {
    const group = new THREE.Group();
    group.add(this.buildDomain(params.domain, xOffset));

    const coreColor = new THREE.Color(panel.color).multiplyScalar(0.68);
    const petalColor = new THREE.Color(panel.color).lerp(new THREE.Color(0xffffff), 0.32);

    if (viewMode === "unified" && laceMesh) {
      group.add(this.buildLaceMesh(laceMesh, xOffset, petalColor));
    } else if (viewMode === "unified") {
      group.add(this.buildUnifiedFlowers(panel, params, xOffset, petalColor));
    } else {
      const components = panel.result.instances.flatMap((instance) => flowerComponents(instance, params));
      const cores = components.filter((component) => component.kind === "core");
      const petals = components.filter((component) => component.kind === "petal");
      const geometry = new THREE.SphereGeometry(1, 16, 11);
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.48,
        metalness: 0.02,
      });
      const petalMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.58,
        metalness: 0.01,
      });
      group.add(this.buildInstances(geometry, coreMaterial, cores, xOffset, coreColor));
      group.add(this.buildInstances(geometry.clone(), petalMaterial, petals, xOffset, petalColor));
      group.add(this.buildConnections(panel.result, params, xOffset, coreColor));
    }

    if (showProxies) {
      group.add(this.buildProxies(panel.result, params, xOffset));
    }
    return group;
  }

  private buildLaceMesh(
    mesh: MeshBuildResult,
    xOffset: number,
    color: THREE.ColorRepresentation,
  ): THREE.Mesh {
    const positions = new Float32Array(mesh.triangles.length * 9);
    let cursor = 0;
    for (const triangle of mesh.triangles) {
      for (const vertex of [triangle.a, triangle.b, triangle.c]) {
        positions[cursor++] = vertex.x;
        positions[cursor++] = vertex.y;
        positions[cursor++] = vertex.z;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.58,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    const surface = new THREE.Mesh(geometry, material);
    surface.position.x = xOffset;
    return surface;
  }

  private buildUnifiedFlowers(
    panel: RendererPanel,
    params: PackingParams,
    xOffset: number,
    baseColor: THREE.ColorRepresentation,
  ): THREE.Group {
    const group = new THREE.Group();
    const blend = params.flowerSize * 0.24;

    for (const instance of panel.result.instances) {
      const components = flowerComponents(instance, params);
      const samplingCube = unifiedSamplingCube(components, blend, UNIFIED_RESOLUTION);
      const { center, halfExtent } = samplingCube;
      const shade = (((instance.id * 37) % 9) - 4) * 0.018;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor).offsetHSL(0, 0, shade),
        roughness: 0.62,
        metalness: 0.01,
        side: THREE.DoubleSide,
      });
      const surface = new MarchingCubes(
        UNIFIED_RESOLUTION,
        material,
        false,
        false,
        UNIFIED_MAX_POLYGONS,
      );
      surface.isolation = 0;

      const halfSize = surface.halfsize;

      for (let z = 0; z < surface.size; z++) {
        const pz = center.z + ((z - halfSize) / halfSize) * halfExtent;
        for (let y = 0; y < surface.size; y++) {
          const py = center.y + ((y - halfSize) / halfSize) * halfExtent;
          const row = surface.size2 * z + surface.size * y;
          for (let x = 0; x < surface.size; x++) {
            const px = center.x + ((x - halfSize) / halfSize) * halfExtent;
            surface.field[row + x] = -flowerFieldSdf(
              components,
              { x: px, y: py, z: pz },
              blend,
              params.motif.neck,
            );
          }
        }
      }

      surface.update();
      surface.scale.setScalar(halfExtent);
      surface.position.copy(toVector3(center, xOffset));
      group.add(surface);
    }
    return group;
  }

  private buildInstances(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    components: ReturnType<typeof flowerComponents>,
    xOffset: number,
    baseColor: THREE.ColorRepresentation,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, components.length);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      matrix.compose(
        toVector3(component.position, xOffset),
        new THREE.Quaternion(),
        new THREE.Vector3(component.radius, component.radius, component.radius),
      );
      mesh.setMatrixAt(index, matrix);
      const shade = (((component.instanceId * 37) % 9) - 4) * 0.018;
      mesh.setColorAt(index, new THREE.Color(baseColor).offsetHSL(0, 0, shade));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private buildConnections(
    result: PackingResult,
    params: PackingParams,
    xOffset: number,
    color: THREE.ColorRepresentation,
  ): THREE.LineSegments {
    const positions: number[] = [];
    for (const instance of result.instances) {
      const components = flowerComponents(instance, params);
      const core = components.find((component) => component.kind === "core");
      const petals = components.filter((component) => component.kind === "petal");
      const connections = core
        ? petals.map((petal) => [core, petal] as const)
        : petals.map((petal, index) => [petal, petals[(index + 1) % petals.length]] as const);
      for (const [start, end] of connections) {
        positions.push(
          start.position.x + xOffset,
          start.position.y,
          start.position.z,
          end.position.x + xOffset,
          end.position.y,
          end.position.z,
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lineColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.32);
    const material = new THREE.LineBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: result.response === "soft" ? 0.52 : 0.28,
      depthWrite: false,
    });
    return new THREE.LineSegments(geometry, material);
  }

  private buildProxies(result: PackingResult, params: PackingParams, xOffset: number): THREE.InstancedMesh {
    const proxies = collisionProxies(result.instances, params, result.proxyMode);
    const geometry = new THREE.SphereGeometry(1, 12, 8);
    const material = new THREE.MeshBasicMaterial({
      color: result.proxyMode === "single" ? 0x60a5fa : 0xff7b54,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, proxies.length);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < proxies.length; index++) {
      const proxy = proxies[index];
      matrix.compose(
        toVector3(proxy.position, xOffset),
        new THREE.Quaternion(),
        new THREE.Vector3(proxy.radius, proxy.radius, proxy.radius),
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 4;
    return mesh;
  }

  private buildDomain(domain: DomainKind, xOffset: number): THREE.Object3D {
    if (domain === "sphere-surface") {
      const geometry = new THREE.SphereGeometry(DOMAIN_RADIUS, 34, 22);
      const fill = new THREE.Mesh(
        geometry,
        new THREE.MeshPhongMaterial({
          color: 0x2c3038,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry.clone()),
        new THREE.LineBasicMaterial({ color: 0x7e838c, transparent: true, opacity: 0.12 }),
      );
      const group = new THREE.Group();
      group.position.x = xOffset;
      group.add(fill, wire);
      return group;
    }

    const geometry = new THREE.CircleGeometry(PLANE_RADIUS, 64);
    geometry.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(
      geometry,
      new THREE.MeshPhongMaterial({ color: 0x34373d, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    fill.position.x = xOffset;
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 96 }, (_, index) => {
          const angle = (index / 96) * Math.PI * 2;
          return new THREE.Vector3(
            xOffset + Math.cos(angle) * PLANE_RADIUS,
            0.006,
            Math.sin(angle) * PLANE_RADIUS,
          );
        }),
      ),
      new THREE.LineBasicMaterial({ color: 0x9a9da2, transparent: true, opacity: 0.5 }),
    );
    const group = new THREE.Group();
    group.add(fill, ring);
    return group;
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

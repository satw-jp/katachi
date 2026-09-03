import * as THREE from "three";

import {
  applyRhinoOrthographicDrag,
  type RhinoViewportGesture,
} from "../skin/rhinoViewportControls.ts";
import type { SkinViewportRect } from "../skin/multiViewport.ts";
import type {
  HanaCameraState,
  HanaViewDirection,
} from "./gesture.ts";
import type { HanaLiveProxySegment } from "./liveProxy.ts";
import type { HanaVector3 } from "./stroke3d.ts";

interface HanaPreviewTriangle {
  a: HanaVector3;
  b: HanaVector3;
  c: HanaVector3;
}

export interface HanaRendererResourceStats {
  sceneObjectCount: number;
  surfaceMeshCount: number;
  proxyObjectCount: number;
  proxyInstanceCount: number;
  proxyCapacity: number;
  bufferGeometryCount: number;
  materialCount: number;
  gpuGeometryCount: number;
  gpuTextureCount: number;
}

export interface HanaRendererRenderStats {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
}

export interface HanaRendererSurfaceUpdateStats {
  totalMilliseconds: number;
  bufferGeometryMilliseconds: number;
  bufferAttributeMilliseconds: number;
  normalGenerationMilliseconds: number;
  positionBufferBytes: number;
  normalBufferBytes: number;
  indexBufferBytes: number;
}

export interface HanaRendererPresentationStats {
  finalSurface: {
    objectId: string | null;
    visible: boolean;
    renderOrder: number | null;
    depthTest: boolean | null;
    depthWrite: boolean | null;
    opacity: number | null;
    frustumCulled: boolean | null;
    triangleCount: number;
    drawCalls: number;
  };
  editPreview: {
    objectId: string | null;
    visible: boolean;
    renderOrder: number | null;
    depthTest: boolean | null;
    depthWrite: boolean | null;
    opacity: number | null;
    frustumCulled: boolean | null;
    instanceCount: number;
    capacity: number;
    drawCalls: number;
  };
  sceneObjectIds: Array<{ id: string; name: string; visible: boolean }>;
  cameras: Array<{
    direction: HanaViewDirection;
    near: number;
    far: number;
    position: [number, number, number];
  }>;
}

interface ViewCamera {
  direction: HanaViewDirection;
  camera: THREE.OrthographicCamera;
  target: THREE.Vector3;
}

const CAMERA_DISTANCE = 12;
const VIEW_HEIGHT = 12;
const MATERIAL_PROXY_MIN_CAPACITY = 128;

function makeCamera(direction: HanaViewDirection): ViewCamera {
  const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.01, 100);
  const target = new THREE.Vector3(0, 0, 0);

  if (direction === "top") {
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.up.set(0, 1, 0);
  } else if (direction === "front") {
    camera.position.set(0, -CAMERA_DISTANCE, 0);
    camera.up.set(0, 0, 1);
  } else if (direction === "right") {
    camera.position.set(CAMERA_DISTANCE, 0, 0);
    camera.up.set(0, 0, 1);
  } else {
    camera.position.set(8, -8, 7);
    camera.up.set(-0.38, 0.38, 0.84).normalize();
  }

  camera.lookAt(target);
  camera.updateMatrixWorld();
  return { direction, camera, target };
}

function makeReferenceScene(): THREE.Scene {
  const scene = new THREE.Scene();

  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0xcbd1d8,
    transparent: true,
    opacity: 0.55,
  });
  const gridPositions: number[] = [];
  for (let index = -6; index <= 6; index += 1) {
    gridPositions.push(-6, index, 0, 6, index, 0);
    gridPositions.push(index, -6, 0, index, 6, 0);
    gridPositions.push(-6, 0, index, 6, 0, index);
    gridPositions.push(index, 0, -6, index, 0, 6);
    gridPositions.push(0, -6, index, 0, 6, index);
    gridPositions.push(0, index, -6, 0, index, 6);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(gridPositions, 3));
  scene.add(new THREE.LineSegments(gridGeometry, gridMaterial));

  const axisPositions = [
    0, 0, 0, 4, 0, 0,
    0, 0, 0, 0, 4, 0,
    0, 0, 0, 0, 0, 4,
  ];
  const axisColors = [
    0.78, 0.20, 0.20, 0.78, 0.20, 0.20,
    0.20, 0.55, 0.32, 0.20, 0.55, 0.32,
    0.20, 0.37, 0.78, 0.20, 0.37, 0.78,
  ];
  const axisGeometry = new THREE.BufferGeometry();
  axisGeometry.setAttribute("position", new THREE.Float32BufferAttribute(axisPositions, 3));
  axisGeometry.setAttribute("color", new THREE.Float32BufferAttribute(axisColors, 3));
  scene.add(new THREE.LineSegments(
    axisGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true }),
  ));

  const originGeometry = new THREE.BufferGeometry();
  originGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const origin = new THREE.Points(
    originGeometry,
    new THREE.PointsMaterial({ color: 0x34383e, size: 0.14 }),
  );
  scene.add(origin);
  return scene;
}

export class HanaViewportRenderer {
  private readonly renderer: THREE.WebGLRenderer | null;
  readonly webglAvailable: boolean;
  private readonly scene = makeReferenceScene();
  private readonly views: ViewCamera[];
  private previewSurface: THREE.Mesh | null = null;
  private previewSurfaceVisible = false;
  private materialProxy: THREE.InstancedMesh | null = null;
  private materialProxyCapacity = 0;
  private materialProxyVisible = false;
  private lastPresentationDrawCalls = { surface: 0, proxy: 0 };
  private lastSurfaceUpdate: HanaRendererSurfaceUpdateStats = {
    totalMilliseconds: 0,
    bufferGeometryMilliseconds: 0,
    bufferAttributeMilliseconds: 0,
    normalGenerationMilliseconds: 0,
    positionBufferBytes: 0,
    normalBufferBytes: 0,
    indexBufferBytes: 0,
  };
  private readonly materialProxyMatrix = new THREE.Matrix4();
  private readonly materialProxyPosition = new THREE.Vector3();
  private readonly materialProxyStart = new THREE.Vector3();
  private readonly materialProxyEnd = new THREE.Vector3();
  private readonly materialProxyDirection = new THREE.Vector3();
  private readonly materialProxyAxis = new THREE.Vector3(0, 1, 0);
  private readonly materialProxyScale = new THREE.Vector3();
  private readonly materialProxyQuaternion = new THREE.Quaternion();
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, directions: readonly HanaViewDirection[]) {
    let webglRenderer: THREE.WebGLRenderer | null = null;
    const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (context) {
      try {
        webglRenderer = new THREE.WebGLRenderer({
          canvas,
          context,
          antialias: true,
          alpha: false,
        });
        webglRenderer.setPixelRatio(Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
        webglRenderer.setClearColor(0xf7f8fa, 1);
      } catch {
        webglRenderer = null;
      }
    }
    this.renderer = webglRenderer;
    this.webglAvailable = webglRenderer !== null;
    this.views = directions.map(makeCamera);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer?.setSize(this.width, this.height, false);
  }

  setPreviewSurface(triangles: readonly HanaPreviewTriangle[] | null): void {
    const started = performance.now();
    if (this.previewSurface) {
      this.scene.remove(this.previewSurface);
      this.previewSurface.geometry.dispose();
      const material = this.previewSurface.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
      this.previewSurface = null;
    }
    if (!triangles || triangles.length === 0) {
      this.lastSurfaceUpdate = {
        totalMilliseconds: performance.now() - started,
        bufferGeometryMilliseconds: 0,
        bufferAttributeMilliseconds: 0,
        normalGenerationMilliseconds: 0,
        positionBufferBytes: 0,
        normalBufferBytes: 0,
        indexBufferBytes: 0,
      };
      return;
    }
    const geometryStarted = performance.now();
    const positions = new Float32Array(triangles.length * 9);
    let offset = 0;
    for (const triangle of triangles) {
      for (const point of [triangle.a, triangle.b, triangle.c]) {
        positions[offset++] = point.x;
        positions[offset++] = point.y;
        positions[offset++] = point.z;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const attributeCreated = performance.now();
    const normalStarted = attributeCreated;
    geometry.computeVertexNormals();
    const normalGenerated = performance.now();
    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshNormalMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.82,
      }),
    );
    surface.name = "hana-final-surface";
    surface.onBeforeRender = () => {
      this.lastPresentationDrawCalls.surface += 1;
    };
    surface.visible = this.previewSurfaceVisible;
    surface.renderOrder = 0;
    this.previewSurface = surface;
    this.scene.add(surface);
    const normal = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    this.lastSurfaceUpdate = {
      totalMilliseconds: performance.now() - started,
      bufferGeometryMilliseconds: attributeCreated - geometryStarted,
      bufferAttributeMilliseconds: attributeCreated - geometryStarted,
      normalGenerationMilliseconds: normalGenerated - normalStarted,
      positionBufferBytes: positions.byteLength,
      normalBufferBytes: normal?.array.byteLength ?? 0,
      indexBufferBytes: index?.array.byteLength ?? 0,
    };
  }

  surfaceUpdateStats(): HanaRendererSurfaceUpdateStats {
    return { ...this.lastSurfaceUpdate };
  }

  setPreviewSurfaceVisible(visible: boolean): void {
    this.previewSurfaceVisible = visible;
    if (this.previewSurface) this.previewSurface.visible = visible;
  }

  private disposeMaterialProxy(): void {
    if (!this.materialProxy) return;
    this.scene.remove(this.materialProxy);
    this.materialProxy.geometry.dispose();
    const material = this.materialProxy.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
    this.materialProxy = null;
    this.materialProxyCapacity = 0;
  }

  setMaterialProxy(segments: readonly HanaLiveProxySegment[] | null): void {
    if (!segments || segments.length === 0) {
      if (this.materialProxy) {
        this.materialProxy.count = 0;
        this.materialProxy.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    if (!this.materialProxy || this.materialProxyCapacity < segments.length) {
      const nextCapacity = Math.max(
        MATERIAL_PROXY_MIN_CAPACITY,
        segments.length,
        Math.ceil(Math.max(1, this.materialProxyCapacity) * 1.5),
      );
      this.disposeMaterialProxy();
      this.materialProxyCapacity = nextCapacity;
      this.materialProxy = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, 8, 1),
        new THREE.MeshNormalMaterial({
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
        }),
        this.materialProxyCapacity,
      );
      this.materialProxy.name = "hana-edit-preview-proxy";
      this.materialProxy.onBeforeRender = () => {
        this.lastPresentationDrawCalls.proxy += 1;
      };
      this.materialProxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.materialProxy.frustumCulled = false;
      this.materialProxy.renderOrder = 1;
      this.materialProxy.visible = this.materialProxyVisible;
      this.scene.add(this.materialProxy);
    }
    this.materialProxy.count = segments.length;
    for (let index = 0; index < this.materialProxy.count; index += 1) {
      const segment = segments[index];
      const radius = Math.max(0.001, segment.radius);
      this.materialProxyStart.set(segment.start.x, segment.start.y, segment.start.z);
      this.materialProxyEnd.set(segment.end.x, segment.end.y, segment.end.z);
      this.materialProxyDirection.subVectors(this.materialProxyEnd, this.materialProxyStart);
      const length = this.materialProxyDirection.length();
      if (length > Number.EPSILON) {
        this.materialProxyDirection.multiplyScalar(1 / length);
        this.materialProxyPosition.addVectors(this.materialProxyStart, this.materialProxyEnd).multiplyScalar(0.5);
      } else {
        this.materialProxyDirection.copy(this.materialProxyAxis);
        this.materialProxyPosition.copy(this.materialProxyStart);
      }
      this.materialProxyQuaternion.setFromUnitVectors(this.materialProxyAxis, this.materialProxyDirection);
      this.materialProxyScale.set(radius, Math.max(length, radius * 2), radius);
      this.materialProxyMatrix.compose(
        this.materialProxyPosition,
        this.materialProxyQuaternion,
        this.materialProxyScale,
      );
      this.materialProxy.setMatrixAt(index, this.materialProxyMatrix);
    }
    this.materialProxy.instanceMatrix.needsUpdate = true;
  }

  setMaterialProxyVisible(visible: boolean): void {
    this.materialProxyVisible = visible;
    if (this.materialProxy) this.materialProxy.visible = visible;
  }

  resourceStats(): HanaRendererResourceStats {
    let sceneObjectCount = 0;
    let surfaceMeshCount = 0;
    let proxyObjectCount = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      sceneObjectCount += 1;
      if (object === this.previewSurface) surfaceMeshCount += 1;
      if (object === this.materialProxy) proxyObjectCount += 1;
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
      const material = renderable.material;
      if (material instanceof THREE.Material) materials.add(material);
      else if (Array.isArray(material)) {
        material.filter((item): item is THREE.Material => item instanceof THREE.Material)
          .forEach((item) => materials.add(item));
      }
    });
    return {
      sceneObjectCount,
      surfaceMeshCount,
      proxyObjectCount,
      proxyInstanceCount: this.materialProxy?.count ?? 0,
      proxyCapacity: this.materialProxyCapacity,
      bufferGeometryCount: geometries.size,
      materialCount: materials.size,
      gpuGeometryCount: this.renderer?.info.memory.geometries ?? 0,
      gpuTextureCount: this.renderer?.info.memory.textures ?? 0,
    };
  }

  renderStats(): HanaRendererRenderStats {
    return {
      calls: this.renderer?.info.render.calls ?? 0,
      triangles: this.renderer?.info.render.triangles ?? 0,
      points: this.renderer?.info.render.points ?? 0,
      lines: this.renderer?.info.render.lines ?? 0,
    };
  }

  presentationStats(): HanaRendererPresentationStats {
    const materialStats = (object: THREE.Object3D | null) => {
      const renderable = object as (THREE.Object3D & {
        material?: THREE.Material | THREE.Material[];
      }) | null;
      const material = renderable?.material;
      const firstMaterial = Array.isArray(material) ? material[0] : material;
      return {
        renderOrder: object?.renderOrder ?? null,
        depthTest: firstMaterial?.depthTest ?? null,
        depthWrite: firstMaterial?.depthWrite ?? null,
        opacity: typeof firstMaterial?.opacity === "number" ? firstMaterial.opacity : null,
        frustumCulled: object ? object.frustumCulled : null,
      };
    };
    const surfaceMaterial = materialStats(this.previewSurface);
    const proxyMaterial = materialStats(this.materialProxy);
    const surfaceGeometry = this.previewSurface?.geometry;
    const position = surfaceGeometry?.getAttribute("position");
    return {
      finalSurface: {
        objectId: this.previewSurface?.uuid ?? null,
        visible: this.previewSurface?.visible ?? false,
        ...surfaceMaterial,
        triangleCount: position ? Math.floor(position.count / 3) : 0,
        drawCalls: this.lastPresentationDrawCalls.surface,
      },
      editPreview: {
        objectId: this.materialProxy?.uuid ?? null,
        visible: this.materialProxy?.visible ?? false,
        ...proxyMaterial,
        instanceCount: this.materialProxy?.count ?? 0,
        capacity: this.materialProxyCapacity,
        drawCalls: this.lastPresentationDrawCalls.proxy,
      },
      sceneObjectIds: this.scene.children.map((object) => ({
        id: object.uuid,
        name: object.name,
        visible: object.visible,
      })),
      cameras: this.views.map(({ direction, camera }) => ({
        direction,
        near: camera.near,
        far: camera.far,
        position: camera.position.toArray() as [number, number, number],
      })),
    };
  }

  render(rects: readonly SkinViewportRect[], selectedViewport: number): void {
    this.lastPresentationDrawCalls = { surface: 0, proxy: 0 };
    if (!this.renderer) return;
    this.renderer.setScissorTest(true);
    for (const rect of rects) {
      const view = this.views[rect.index];
      if (!view) continue;
      const aspect = Math.max(0.01, rect.width / Math.max(1, rect.height));
      view.camera.left = -VIEW_HEIGHT * aspect / 2;
      view.camera.right = VIEW_HEIGHT * aspect / 2;
      view.camera.top = VIEW_HEIGHT / 2;
      view.camera.bottom = -VIEW_HEIGHT / 2;
      view.camera.updateProjectionMatrix();

      const glY = this.height - rect.y - rect.height;
      this.renderer.setViewport(rect.x, glY, rect.width, rect.height);
      this.renderer.setScissor(rect.x, glY, rect.width, rect.height);
      this.renderer.setClearColor(rect.index === selectedViewport ? 0xf3f5f7 : 0xf8f9fa, 1);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, view.camera);
    }
    this.renderer.setScissorTest(false);
  }

  applyDrag(
    viewportIndex: number,
    gesture: RhinoViewportGesture,
    deltaX: number,
    deltaY: number,
    width: number,
    height: number,
  ): void {
    const view = this.views[viewportIndex];
    if (!view) return;
    applyRhinoOrthographicDrag(
      view.camera,
      view.target,
      gesture,
      deltaX,
      deltaY,
      width,
      height,
    );
  }

  projectPoint(
    viewportIndex: number,
    point: HanaVector3,
    rect: SkinViewportRect,
  ): { x: number; y: number; visible: boolean } {
    const view = this.views[viewportIndex];
    if (!view) throw new Error(`Unknown HANA viewport index: ${viewportIndex}`);
    const projected = new THREE.Vector3(point.x, point.y, point.z).project(view.camera);
    return {
      x: rect.x + (projected.x + 1) * rect.width / 2,
      y: rect.y + (1 - projected.y) * rect.height / 2,
      visible: projected.z >= -1 && projected.z <= 1,
    };
  }

  pointOnViewPlane(
    viewportIndex: number,
    canvasX: number,
    canvasY: number,
    rect: SkinViewportRect,
    direction: Exclude<HanaViewDirection, "axome">,
    planeValue: number,
  ): HanaVector3 | null {
    const view = this.views[viewportIndex];
    if (!view) throw new Error(`Unknown HANA viewport index: ${viewportIndex}`);
    const ndc = new THREE.Vector2(
      ((canvasX - rect.x) / Math.max(1, rect.width)) * 2 - 1,
      1 - ((canvasY - rect.y) / Math.max(1, rect.height)) * 2,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, view.camera);
    const normal = direction === "front"
      ? new THREE.Vector3(0, 1, 0)
      : direction === "right" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const plane = new THREE.Plane(normal, -planeValue);
    const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
  }

  cameraState(viewportIndex: number): HanaCameraState {
    const view = this.views[viewportIndex];
    if (!view) throw new Error(`Unknown HANA viewport index: ${viewportIndex}`);
    return {
      position: view.camera.position.toArray() as [number, number, number],
      up: view.camera.up.toArray() as [number, number, number],
      target: view.target.toArray() as [number, number, number],
      zoom: view.camera.zoom,
    };
  }

  dispose(): void {
    this.setPreviewSurface(null);
    this.disposeMaterialProxy();
    this.renderer?.dispose();
  }
}

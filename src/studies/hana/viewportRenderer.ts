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
import type { HanaVector3 } from "./stroke3d.ts";

interface ViewCamera {
  direction: HanaViewDirection;
  camera: THREE.OrthographicCamera;
  target: THREE.Vector3;
}

const CAMERA_DISTANCE = 12;
const VIEW_HEIGHT = 12;

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
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = makeReferenceScene();
  private readonly views: ViewCamera[];
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, directions: readonly HanaViewDirection[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
    this.renderer.setClearColor(0xf7f8fa, 1);
    this.views = directions.map(makeCamera);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, false);
  }

  render(rects: readonly SkinViewportRect[], selectedViewport: number): void {
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
    this.renderer.dispose();
  }
}

import * as THREE from "three";
import type { SkinViewDirection } from "./multiViewport.ts";

export type RhinoViewportGesture = "rotate" | "pan" | "zoom";

export function shouldStartRhinoCameraGesture(button: number, shiftKey = false): boolean {
  return button === 2 || (button === 0 && shiftKey);
}

export function resolveRhinoViewportGesture(
  direction: SkinViewDirection,
  modifiers: { shiftKey: boolean; metaKey: boolean },
): RhinoViewportGesture {
  if (modifiers.metaKey) return "zoom";
  if (direction === "axome") return modifiers.shiftKey ? "pan" : "rotate";
  return "pan";
}

function finiteDelta(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function applyRhinoOrthographicDrag(
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
  gesture: RhinoViewportGesture,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const dx = finiteDelta(deltaX);
  const dy = finiteDelta(deltaY);
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  if (gesture === "zoom") {
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * Math.exp(-dy * 0.01), 0.02, 100);
    camera.updateProjectionMatrix();
    return;
  }

  const eye = camera.position.clone().sub(target);
  if (eye.lengthSq() <= 1e-18) return;
  const up = camera.up.clone().normalize();

  if (gesture === "pan") {
    const worldPerPixelX = (camera.right - camera.left) / camera.zoom / width;
    const worldPerPixelY = (camera.top - camera.bottom) / camera.zoom / height;
    const pan = eye.clone().cross(up).normalize().multiplyScalar(dx * worldPerPixelX)
      .add(up.multiplyScalar(dy * worldPerPixelY));
    camera.position.add(pan);
    target.add(pan);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return;
  }

  const normalizedX = 2 * dx / width;
  const normalizedY = -2 * dy / width;
  const angle = Math.hypot(normalizedX, normalizedY);
  if (!(angle > 0)) return;
  const sideways = up.clone().cross(eye.clone().normalize()).normalize().multiplyScalar(normalizedX);
  const vertical = up.multiplyScalar(normalizedY);
  const move = vertical.add(sideways);
  const axis = move.cross(eye).normalize();
  if (axis.lengthSq() <= 1e-18) return;
  const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  eye.applyQuaternion(quaternion);
  camera.up.applyQuaternion(quaternion).normalize();
  camera.position.copy(target).add(eye);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

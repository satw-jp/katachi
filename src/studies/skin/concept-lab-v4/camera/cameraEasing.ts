import type { CameraEasing } from "./cameraTypes.ts";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function easeInOut(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function slowArrival(value: number): number {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3.2);
}

export function hesitate(value: number): number {
  const t = clamp01(value);
  if (t < 0.42) return easeInOut(t / 0.42) * 0.28;
  if (t < 0.58) return 0.28 + easeInOut((t - 0.42) / 0.16) * 0.05;
  return 0.33 + easeInOut((t - 0.58) / 0.42) * 0.67;
}

export function accelerate(value: number): number {
  return Math.pow(clamp01(value), 1.8);
}

export function driftEase(value: number): number {
  const t = clamp01(value);
  return easeInOut(t) + Math.sin(t * Math.PI * 2) * 0.035 * Math.sin(t * Math.PI);
}

export function applyCameraEasing(easing: CameraEasing, value: number): number {
  if (easing === "linear") return clamp01(value);
  if (easing === "ease-in-out") return easeInOut(value);
  if (easing === "slow-arrival") return slowArrival(value);
  if (easing === "hesitate") return hesitate(value);
  if (easing === "accelerate") return accelerate(value);
  return driftEase(value);
}

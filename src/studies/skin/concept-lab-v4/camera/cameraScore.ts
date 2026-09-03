import * as THREE from "three";
import { applyCameraEasing } from "./cameraEasing.ts";
import type { CameraEasing, CameraMotionKind, CameraPose, CameraScore, CameraSegment, CameraTemporalState } from "./cameraTypes.ts";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function pose(target: THREE.Vector3, offset: THREE.Vector3, options: Partial<Omit<CameraPose, "position" | "target">> = {}): CameraPose {
  return {
    position: target.clone().add(offset),
    target: target.clone(),
    fov: options.fov ?? 46,
    roll: options.roll ?? 0,
    focusDistance: options.focusDistance ?? Math.max(0.5, offset.length()),
    focusBias: options.focusBias ?? 0,
  };
}

export function segment(
  id: string,
  startTime: number,
  duration: number,
  kind: CameraMotionKind,
  from: CameraPose,
  to: CameraPose,
  easing: CameraEasing,
  options: Pick<CameraSegment, "holdFraction" | "parallaxStrength" | "focusTransition"> = {},
): CameraSegment {
  return { id, startTime, duration, kind, from, to, easing, ...options };
}

function interpolatePose(from: CameraPose, to: CameraPose, amount: number): CameraPose {
  const t = clamp01(amount);
  return {
    position: from.position.clone().lerp(to.position, t),
    target: from.target.clone().lerp(to.target, t),
    fov: THREE.MathUtils.lerp(from.fov, to.fov, t),
    roll: THREE.MathUtils.lerp(from.roll, to.roll, t),
    focusDistance: THREE.MathUtils.lerp(from.focusDistance, to.focusDistance, t),
    focusBias: THREE.MathUtils.lerp(from.focusBias, to.focusBias, t),
  };
}

export function makeCameraScore(id: string, segments: readonly CameraSegment[]): CameraScore {
  const ordered = [...segments].sort((a, b) => a.startTime - b.startTime);
  const duration = Math.max(1, ...ordered.map((item) => item.startTime + item.duration));
  return {
    id,
    duration,
    segments: ordered,
    sample(timeSeconds: number): CameraPose {
      if (ordered.length === 0) return pose(new THREE.Vector3(), new THREE.Vector3(5.4, -8.2, 4.5));
      const time = ((timeSeconds % duration) + duration) % duration;
      const active = ordered.find((item) => time >= item.startTime && time < item.startTime + item.duration) ?? ordered[ordered.length - 1]!;
      const local = clamp01((time - active.startTime) / Math.max(0.001, active.duration));
      const eased = applyCameraEasing(active.easing, local);
      const result = interpolatePose(active.from, active.to, eased);
      if (active.kind === "hold" && active.holdFraction) {
        const holdStart = clamp01(1 - active.holdFraction);
        const holdT = local >= holdStart ? 1 : clamp01(local / Math.max(0.001, holdStart));
        return interpolatePose(active.from, active.to, applyCameraEasing(active.easing, holdT));
      }
      return result;
    },
    temporalState(timeSeconds: number): CameraTemporalState {
      const time = ((timeSeconds % duration) + duration) % duration;
      const active = ordered.find((item) => time >= item.startTime && time < item.startTime + item.duration) ?? ordered[ordered.length - 1]!;
      if (active.kind === "hold") return "holding";
      if (active.kind === "target-shift") return "looking";
      if (active.kind === "pass-through") return "crossing";
      if (active.kind === "retreat") return "departing";
      const local = (time - active.startTime) / Math.max(0.001, active.duration);
      return local > 0.72 ? "slowing" : "moving";
    },
  };
}

export function sourceOffset(index: number, seed: number, distance: number, lateral: number, height: number): THREE.Vector3 {
  const phase = Math.sin(index * 12.9898 + seed * 0.017) * 0.5;
  return new THREE.Vector3(lateral + phase * 0.24, -distance + Math.cos(index * 3.17 + seed) * 0.16, height + Math.sin(index * 1.77 + seed) * 0.12);
}

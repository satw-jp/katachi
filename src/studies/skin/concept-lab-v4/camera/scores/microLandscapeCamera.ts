import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

function logDistance(minimum: number, maximum: number, amount: number): number {
  return Math.exp(THREE.MathUtils.lerp(Math.log(minimum), Math.log(maximum), THREE.MathUtils.clamp(amount, 0, 1)));
}

export function buildMicroLandscapeCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const micro = bestAnchor(anchors, ["junction", "dense-region"], center);
  const flower = bestAnchor(anchors, ["motif"], center);
  const far = pose(center.position, sourceOffset(47, seed, logDistance(6.2, 10.5, 0.9), -2.4, 3.8), { fov: 52, focusBias: -0.12 });
  const near = pose(micro.position, new THREE.Vector3(0.65, -0.82, 0.28), { fov: 36, focusDistance: 1.05, focusBias: 0.42 });
  const filament = pose(micro.position.clone().add(new THREE.Vector3(0.32, 0.18, 0.12)), new THREE.Vector3(-0.6, -1.05, 0.36), { fov: 35, focusDistance: 1.24, focusBias: 0.38, roll: params.cameraRoll * 0.5 });
  const junction = pose(micro.position, new THREE.Vector3(1.2, -1.55, 0.7), { fov: 39, focusDistance: 2.05, focusBias: 0.2 });
  const meso = pose(flower.position, sourceOffset(53, seed, logDistance(2.8, 5.8, 0.52), 2.0, 2.35), { fov: 45, focusBias: 0.04 });
  const macro = pose(center.position, sourceOffset(59, seed, logDistance(5.8, 10.8, 0.78), -2.9, 3.7), { fov: 54, focusBias: -0.08 });
  const motion = Math.max(0.6, Math.min(1.35, 0.76 + params.cameraMotion * 0.24));
  const t0 = 0;
  const d0 = 2.4 / motion;
  const t1 = t0 + d0;
  const d1 = 2.8 / motion;
  const t2 = t1 + d1;
  const d2 = 2.4 / motion;
  const t3 = t2 + d2;
  const d3 = 3.4 / motion;
  const t4 = t3 + d3;
  const d4 = 3.8 / motion;
  const t5 = t4 + d4;
  return makeCameraScore("micro-landscape-camera-v1", [
    segment("enter-micro-fiber", t0, d0, "dolly", far, near, "accelerate", { parallaxStrength: params.parallax * 1.1, focusTransition: 0.8 }),
    segment("track-filament", t1, d1, "macro-track", near, filament, "drift", { parallaxStrength: params.parallax * 1.3 }),
    segment("junction-pause", t2, d2, "hold", filament, junction, "hesitate", { holdFraction: 0.52, focusTransition: 0.9 }),
    segment("pull-to-meso-flower", t3, d3, "retreat", junction, meso, "slow-arrival", { parallaxStrength: params.parallax }),
    segment("reveal-landscape", t4, d4, "macro-track", meso, macro, "drift", { parallaxStrength: params.parallax * 0.9 }),
    segment("scale-hold", t5, 3.8, "hold", macro, macro, "linear", { holdFraction: 0.88 }),
  ]);
}

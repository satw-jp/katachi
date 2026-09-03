import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildWeightOfHesitationCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const sag = bestAnchor(anchors, ["support", "dense-region"], center);
  const catchPoint = bestAnchor(anchors, ["junction", "motif"], center);
  const side = 2.9 + params.orbit * 1.2;
  const outside = pose(sag.position, sourceOffset(83, seed, 7.6, side, 2.8), { fov: 50, focusBias: -0.08 });
  const follow = pose(sag.position.clone().add(new THREE.Vector3(0, -0.18, -0.25)), sourceOffset(89, seed, 4.8 - params.dolly * 0.45, side * 0.55, 1.62), { fov: 40, focusBias: 0.38, roll: params.cameraRoll });
  const under = pose(sag.position.clone().add(new THREE.Vector3(0, 0.2, -0.2)), new THREE.Vector3(-0.25, -1.15, 0.22), { fov: 38, focusBias: 0.5, roll: params.cameraRoll * 1.1 });
  const catchPose = pose(catchPoint.position, sourceOffset(97, seed, 4.5, -side * 0.36, 1.48), { fov: 42, focusBias: 0.28 });
  const reveal = pose(center.position, sourceOffset(101, seed, 7.6, -side * 0.25, 3.1), { fov: 49, focusBias: -0.04 });
  const motion = THREE.MathUtils.clamp(0.78 + params.cameraMotion * 0.18, 0.6, 1.2);
  const d0 = 2.8 / motion;
  const d1 = 2.1 / motion;
  const d2 = 2.1 / motion;
  const d3 = 2.6 / motion;
  const t0 = 0;
  const t1 = d0;
  const t2 = t1 + d1;
  const t3 = t2 + d2;
  const t4 = t3 + d3;
  return makeCameraScore("weight-of-hesitation-camera-v1", [
    segment("face-the-sag", t0, d0, "drift", outside, follow, "slow-arrival", { parallaxStrength: params.parallax }),
    segment("hold-the-hesitation", t1, d1, "hold", follow, under, "hesitate", { holdFraction: 0.48, focusTransition: 0.9 }),
    segment("look-for-support", t2, d2, "target-shift", under, catchPose, "slow-arrival", { focusTransition: 0.8 }),
    segment("weight-settles", t3, d3, "dolly", catchPose, reveal, "drift", { parallaxStrength: params.parallax * 0.85 }),
    segment("quiet-afterweight", t4, 3.8 + params.cameraHold, "hold", reveal, reveal, "linear", { holdFraction: 0.86, focusTransition: 1 }),
  ]);
}

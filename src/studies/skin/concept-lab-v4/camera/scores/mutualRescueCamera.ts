import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildMutualRescueCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const falling = bestAnchor(anchors, ["motif", "dense-region"], center);
  const catchAnchor = bestAnchor(anchors, ["support", "junction"], center);
  const reveal = anchors.find((item) => item.kind === "motif" && item.id !== falling.id) ?? center;
  const motion = Math.max(0.55, Math.min(1.45, 0.72 + params.cameraMotion * 0.28));
  const side = 3.4 + params.orbit * 1.4;
  const start = pose(falling.position, sourceOffset(2, seed, 7.4 - params.dolly * 0.9, side, 3.1), { fov: 48, focusBias: -0.1 });
  const follow = pose(falling.position.clone().add(new THREE.Vector3(0, -0.25, -0.25)), sourceOffset(3, seed, 5.9 - params.dolly * 0.8, side * 0.72, 2.35), { fov: 44, focusBias: 0.14 });
  const look = pose(catchAnchor.position, sourceOffset(5, seed, 5.6 - params.passThrough * 0.6, side * 0.52, 2.05), { fov: 43, focusBias: 0.2 });
  const catchPose = pose(catchAnchor.position, sourceOffset(7, seed, 4.8 - params.dolly * 0.7, side * 0.35, 1.75), { fov: 42, roll: params.cameraRoll * 0.6, focusBias: 0.34 });
  const revealPose = pose(reveal.position, sourceOffset(11, seed, 6.4, -side * 0.5, 2.8), { fov: 46, focusBias: 0.08 });
  const rest = pose(center.position, sourceOffset(13, seed, 7.8, -side * 0.35, 3.25), { fov: 49, focusBias: -0.05 });
  const t0 = 0;
  const d0 = 2.5 / motion;
  const t1 = t0 + d0;
  const d1 = 1.7 / motion;
  const t2 = t1 + d1;
  const d2 = 2.5 / motion;
  const t3 = t2 + d2;
  const d3 = 1.05 + params.cameraHold * 1.05;
  const t4 = t3 + d3;
  const d4 = 2.8 / motion;
  const t5 = t4 + d4;
  const d5 = 3.4 / motion;
  const t6 = t5 + d5;
  return makeCameraScore("mutual-rescue-camera-v1", [
    segment("follow-falling-flower", t0, d0, "drift", start, follow, "hesitate", { parallaxStrength: params.parallax }),
    segment("look-to-catch", t1, d1, "target-shift", follow, look, "slow-arrival", { focusTransition: 0.8 }),
    segment("approach-connection", t2, d2, "dolly", look, catchPose, "accelerate", { parallaxStrength: params.parallax * 1.1 }),
    segment("catch-hold", t3, d3, "hold", catchPose, catchPose, "linear", { holdFraction: 0.82, focusTransition: 1 }),
    segment("reveal-another-flower", t4, d4, "retreat", catchPose, revealPose, "drift", { parallaxStrength: params.parallax }),
    segment("quiet-bouquet", t5, d5, "target-shift", revealPose, rest, "slow-arrival", { focusTransition: 0.7 }),
    segment("after-catch-hold", t6, 2.8, "hold", rest, rest, "linear", { holdFraction: 0.9 }),
  ]);
}

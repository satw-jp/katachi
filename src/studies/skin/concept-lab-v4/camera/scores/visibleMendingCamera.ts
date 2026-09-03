import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildVisibleMendingCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const wound = bestAnchor(anchors, ["wound", "void"], center);
  const repair = bestAnchor(anchors, ["support", "dense-region"], center);
  const otherRepair = anchors.find((item) => item.kind === "support" && item.id !== repair.id) ?? repair;
  const side = 2.7 + params.orbit * 1.6;
  const facing = pose(wound.position, sourceOffset(67, seed, 7.6, side, 3.0), { fov: 49, focusBias: -0.08 });
  const gap = pose(wound.position, sourceOffset(71, seed, 4.6 - params.dolly * 0.8, side * 0.58, 1.65), { fov: 41, focusBias: 0.28 });
  const firstStitch = pose(repair.position, new THREE.Vector3(-0.35, -0.95, 0.22), { fov: 38, roll: params.cameraRoll, focusBias: 0.4 });
  const farSide = pose(otherRepair.position, new THREE.Vector3(0.55, -1.05, 0.32), { fov: 42, roll: -params.cameraRoll * 0.7, focusBias: 0.23 });
  const reveal = pose(center.position, sourceOffset(79, seed, 7.8, -side * 0.35, 3.25), { fov: 50, focusBias: -0.03 });
  const motion = Math.max(0.6, Math.min(1.35, 0.78 + params.cameraMotion * 0.22));
  const t0 = 0;
  const d0 = 2.6 / motion;
  const t1 = t0 + d0;
  const d1 = 2.4 / motion;
  const t2 = t1 + d1;
  const d2 = 2.9 / motion;
  const t3 = t2 + d2;
  const d3 = 2.8 / motion;
  const t4 = t3 + d3;
  return makeCameraScore("visible-mending-camera-v1", [
    segment("face-the-wound", t0, d0, "drift", facing, gap, "slow-arrival", { parallaxStrength: params.parallax }),
    segment("enter-the-gap", t1, d1, "pass-through", gap, firstStitch, "hesitate", { parallaxStrength: params.parallax * 1.28, focusTransition: 1 }),
    segment("follow-first-repair", t2, d2, "macro-track", firstStitch, farSide, "drift", { parallaxStrength: params.parallax * 1.15 }),
    segment("cross-to-other-side", t3, d3, "target-shift", farSide, reveal, "slow-arrival", { focusTransition: 0.9 }),
    segment("repair-hold", t4, 3.4, "hold", reveal, reveal, "linear", { holdFraction: 0.84, focusTransition: 1 }),
  ]);
}

import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildShadowRoomCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const wall = bestAnchor(anchors, ["void", "dense-region"], center);
  const floor = bestAnchor(anchors, ["support", "junction"], center);
  const start = pose(center.position, sourceOffset(181, seed, 8.9, -1.4, 3.8), { fov: 48, focusBias: -0.1 });
  const wallPose = pose(wall.position, sourceOffset(191, seed, 7.6, -1.0, 3.15), { fov: 47, focusBias: 0.1, roll: params.cameraRoll * 0.25 });
  const heldWall = pose(wall.position, sourceOffset(193, seed, 7.55, -0.98, 3.13), { fov: 47, focusBias: 0.14, roll: params.cameraRoll * 0.22 });
  const floorPose = pose(floor.position, sourceOffset(197, seed, 7.9, -0.75, 2.85), { fov: 46, focusBias: 0.12 });
  const returnRoom = pose(center.position, sourceOffset(199, seed, 9.2, -1.9, 3.95), { fov: 50, focusBias: -0.12 });
  const d0 = 3.7;
  const d1 = 2.8;
  const d2 = 3.2;
  const t0 = 0;
  const t1 = d0;
  const t2 = t1 + d1;
  const t3 = t2 + d2;
  return makeCameraScore("shadow-room-camera-v1", [
    segment("enter-the-room", t0, d0, "drift", start, wallPose, "slow-arrival", { parallaxStrength: params.parallax * 0.55 }),
    segment("shadow-holds", t1, d1, "hold", wallPose, heldWall, "hesitate", { holdFraction: 0.88, focusTransition: 0.7 }),
    segment("light-migrates-to-floor", t2, d2, "target-shift", heldWall, floorPose, "drift", { focusTransition: 0.62 }),
    segment("room-afterimage", t3, 4.5 + params.cameraHold, "retreat", floorPose, returnRoom, "slow-arrival", { parallaxStrength: params.parallax * 0.42, focusTransition: 0.6 }),
  ]);
}

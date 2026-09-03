import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildOneHandManyFlowersCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const motifs = anchors.filter((item) => item.kind === "motif");
  const first = motifs[0] ?? bestAnchor(anchors, ["junction"], center);
  const second = motifs[1] ?? bestAnchor(anchors, ["dense-region"], center);
  const third = motifs[2] ?? bestAnchor(anchors, ["support"], center);
  const side = 2.6 + params.orbit * 1.1;
  const hand = pose(first.position, sourceOffset(137, seed, 7.5, side, 3.25), { fov: 49, focusBias: -0.08 });
  const flowerOne = pose(first.position, sourceOffset(139, seed, 4.2 - params.dolly * 0.5, side * 0.5, 1.54), { fov: 39, focusBias: 0.4 });
  const flowerTwo = pose(second.position, sourceOffset(149, seed, 3.9, -side * 0.38, 1.48), { fov: 40, focusBias: 0.36, roll: params.cameraRoll * 0.7 });
  const flowerThree = pose(third.position, new THREE.Vector3(0.55, -1.05, 0.34), { fov: 38, focusBias: 0.46, roll: -params.cameraRoll });
  const family = pose(center.position, sourceOffset(157, seed, 7.6, -side * 0.32, 3.15), { fov: 50, focusBias: -0.06 });
  const motion = THREE.MathUtils.clamp(0.72 + params.cameraMotion * 0.23, 0.6, 1.3);
  const d0 = 2.6 / motion;
  const d1 = 2.2 / motion;
  const d2 = 2.3 / motion;
  const d3 = 2.6 / motion;
  const t0 = 0;
  const t1 = d0;
  const t2 = t1 + d1;
  const t3 = t2 + d2;
  const t4 = t3 + d3;
  return makeCameraScore("one-hand-many-flowers-camera-v1", [
    segment("follow-the-first-gesture", t0, d0, "macro-track", hand, flowerOne, "hesitate", { parallaxStrength: params.parallax * 1.15 }),
    segment("pass-to-second-flower", t1, d1, "target-shift", flowerOne, flowerTwo, "drift", { focusTransition: 0.75 }),
    segment("cross-the-family", t2, d2, "pass-through", flowerTwo, flowerThree, "slow-arrival", { parallaxStrength: params.parallax * 1.28, focusTransition: 0.86 }),
    segment("many-from-one", t3, d3, "retreat", flowerThree, family, "drift", { parallaxStrength: params.parallax }),
    segment("family-hold", t4, 3.6 + params.cameraHold, "hold", family, family, "linear", { holdFraction: 0.86, focusTransition: 1 }),
  ]);
}

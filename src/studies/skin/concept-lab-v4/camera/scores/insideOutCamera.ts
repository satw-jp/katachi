import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildInsideOutCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const shell = bestAnchor(anchors, ["dense-region", "motif"], center);
  const support = bestAnchor(anchors, ["support", "junction"], center);
  const side = 3.2 + params.orbit * 1.4;
  const outer = pose(shell.position, sourceOffset(109, seed, 8.4, side, 3.7), { fov: 51, focusBias: -0.15 });
  const rim = pose(shell.position.clone().add(new THREE.Vector3(0.18, 0, 0.15)), sourceOffset(113, seed, 4.8 - params.dolly * 0.5, side * 0.62, 1.72), { fov: 42, focusBias: 0.24, roll: params.cameraRoll });
  const crossing = pose(support.position, new THREE.Vector3(0.12, -0.75, 0.12), { fov: 37, focusDistance: 0.88, focusBias: 0.52, roll: params.cameraRoll * 1.2 });
  const inside = pose(support.position.clone().add(new THREE.Vector3(-0.12, -0.22, 0.08)), new THREE.Vector3(-0.12, -0.42, 0.18), { fov: 35, focusDistance: 0.55, focusBias: 0.62 });
  const bloom = pose(center.position, sourceOffset(127, seed, 6.8, -side * 0.4, 2.7), { fov: 46, focusBias: 0.04 });
  const d0 = 2.5;
  const d1 = 2.2;
  const d2 = 2.0;
  const d3 = 2.9;
  const t0 = 0;
  const t1 = d0;
  const t2 = t1 + d1;
  const t3 = t2 + d2;
  const t4 = t3 + d3;
  return makeCameraScore("inside-out-camera-v1", [
    segment("read-the-shell", t0, d0, "drift", outer, rim, "slow-arrival", { parallaxStrength: params.parallax }),
    segment("find-the-crossing", t1, d1, "target-shift", rim, crossing, "hesitate", { focusTransition: 0.9 }),
    segment("cross-the-shell", t2, d2, "pass-through", crossing, inside, "accelerate", { parallaxStrength: params.parallax * 1.45, focusTransition: 1 }),
    segment("inside-out-hold", t3, d3, "hold", inside, inside, "linear", { holdFraction: 0.7, focusTransition: 1 }),
    segment("outer-bloom-reveal", t4, 4.2 + params.cameraHold * 0.8, "retreat", inside, bloom, "drift", { parallaxStrength: params.parallax }),
  ]);
}

import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildVoidBouquetCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const voidAnchors = anchors.filter((item) => item.kind === "void");
  const firstVoid = bestAnchor(anchors, ["void", "wound"], center);
  const secondVoid = voidAnchors.find((item) => item.id !== firstVoid.id) ?? anchors.find((item) => item.kind === "wound" && item.id !== firstVoid.id) ?? center;
  const side = 2.8 + params.orbit * 1.8;
  const outer = pose(firstVoid.position.clone().add(new THREE.Vector3(0.2, 0, 0.2)), sourceOffset(19, seed, 8.5, side, 3.8), { fov: 52, focusBias: -0.18 });
  const mouth = pose(firstVoid.position, sourceOffset(23, seed, 4.8 - params.dolly * 1.1, side * 0.62, 1.8), { fov: 42, focusBias: 0.2, roll: params.cameraRoll });
  const inside = pose(firstVoid.position.clone().add(new THREE.Vector3(0, -0.45, 0.12)), new THREE.Vector3(0.16, -0.28, 0.12), { fov: 38, focusBias: 0.42, roll: params.cameraRoll * 1.2 });
  const deep = pose(secondVoid.position, new THREE.Vector3(-0.28, -1.1, 0.25), { fov: 40, focusBias: 0.3, roll: -params.cameraRoll * 0.8 });
  const emerge = pose(secondVoid.position, sourceOffset(29, seed, 4.9 - params.passThrough * 0.7, -side * 0.44, 2.0), { fov: 44, focusBias: 0.13 });
  const retreat = pose(center.position, sourceOffset(31, seed, 8.3, -side * 0.28, 3.6), { fov: 50, focusBias: -0.04 });
  const t0 = 0;
  const d0 = 2.6;
  const t1 = t0 + d0;
  const d1 = 2.8;
  const t2 = t1 + d1;
  const d2 = 2.3;
  const t3 = t2 + d2;
  const d3 = 1.1 + params.cameraHold * 1.5;
  const t4 = t3 + d3;
  const d4 = 3.2;
  const t5 = t4 + d4;
  const d5 = 1.8;
  const t6 = t5 + d5;
  return makeCameraScore("void-bouquet-camera-v1", [
    segment("approach-first-void", t0, d0, "drift", outer, mouth, "slow-arrival", { parallaxStrength: params.parallax }),
    segment("enter-black-cavity", t1, d1, "pass-through", mouth, inside, "hesitate", { parallaxStrength: params.parallax * 1.35, focusTransition: 1 }),
    segment("inside-void-hold", t2, d2, "hold", inside, inside, "linear", { holdFraction: 0.72, focusTransition: 1 }),
    segment("cross-to-another-gap", t3, d3, "pass-through", inside, deep, "drift", { parallaxStrength: params.parallax * 1.25 }),
    segment("emerge-through-light", t4, d4, "target-shift", deep, emerge, "slow-arrival", { focusTransition: 0.85 }),
    segment("void-reveal", t5, d5, "hold", emerge, emerge, "linear", { holdFraction: 0.78 }),
    segment("retreat-from-space", t6, 3.8, "retreat", emerge, retreat, "drift", { parallaxStrength: params.parallax }),
  ]);
}

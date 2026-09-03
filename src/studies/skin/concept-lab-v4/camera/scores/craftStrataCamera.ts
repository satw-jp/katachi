import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildCraftStrataCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const layer = bestAnchor(anchors, ["dense-region", "support"], center);
  const fusion = bestAnchor(anchors, ["junction", "motif"], center);
  const close = pose(layer.position, new THREE.Vector3(0.74, -1.18, 0.34), { fov: 35, focusDistance: 1.36, focusBias: 0.5 });
  const bead = pose(layer.position.clone().add(new THREE.Vector3(0.22, 0.12, 0.08)), new THREE.Vector3(-0.42, -0.82, 0.2), { fov: 33, focusDistance: 0.92, focusBias: 0.58, roll: params.cameraRoll });
  const sag = pose(layer.position.clone().add(new THREE.Vector3(-0.18, -0.14, -0.12)), new THREE.Vector3(-0.6, -0.94, -0.08), { fov: 34, focusDistance: 1.08, focusBias: 0.46, roll: -params.cameraRoll * 0.8 });
  const fuse = pose(fusion.position, new THREE.Vector3(0.18, -0.7, 0.2), { fov: 36, focusDistance: 0.9, focusBias: 0.54 });
  const deposited = pose(center.position, sourceOffset(173, seed, 6.5, -2.2, 2.6), { fov: 48, focusBias: -0.02 });
  const d0 = 2.3;
  const d1 = 2.0;
  const d2 = 1.8;
  const d3 = 2.4;
  const t0 = 0;
  const t1 = d0;
  const t2 = t1 + d1;
  const t3 = t2 + d2;
  const t4 = t3 + d3;
  return makeCameraScore("craft-strata-camera-v1", [
    segment("approach-material", t0, d0, "dolly", close, bead, "accelerate", { parallaxStrength: params.parallax * 1.18 }),
    segment("deposition-pause", t1, d1, "hold", bead, sag, "hesitate", { holdFraction: 0.45, focusTransition: 0.92 }),
    segment("follow-the-sag", t2, d2, "macro-track", sag, fuse, "slow-arrival", { parallaxStrength: params.parallax }),
    segment("fusion-pass", t3, d3, "pass-through", fuse, fuse, "linear", { holdFraction: 0.55, focusTransition: 1 }),
    segment("material-becomes-form", t4, 4 + params.cameraHold, "retreat", fuse, deposited, "drift", { parallaxStrength: params.parallax * 0.82 }),
  ]);
}

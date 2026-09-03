import type { ConceptSource } from "../../sourceAdapter.ts";
import { bestAnchor, buildCameraAnchors } from "../cameraAnchors.ts";
import { makeCameraScore, pose, segment, sourceOffset } from "../cameraScore.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export function buildStructuralChoirCameraScore(source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const anchors = buildCameraAnchors(source);
  const center = anchors.find((item) => item.kind === "center")!;
  const foreground = bestAnchor(anchors, ["junction", "support"], center);
  const middle = bestAnchor(anchors, ["dense-region", "motif"], center);
  const deep = bestAnchor(anchors, ["motif", "void"], center);
  const side = 3.5 + params.orbit * 1.5;
  const first = pose(foreground.position, sourceOffset(211, seed, 5.4, side * 0.58, 2.15), { fov: 42, focusBias: 0.28 });
  const second = pose(middle.position, sourceOffset(223, seed, 5.8, side * 0.26, 2.48), { fov: 44, focusBias: 0.16, roll: params.cameraRoll * 0.5 });
  const third = pose(deep.position, sourceOffset(227, seed, 6.5, -side * 0.42, 2.85), { fov: 46, focusBias: 0.04 });
  const ensemble = pose(center.position, sourceOffset(229, seed, 8.2, -side * 0.32, 3.55), { fov: 49, focusBias: -0.08 });
  const d0 = 2.8;
  const d1 = 2.5;
  const d2 = 2.9;
  const t0 = 0;
  const t1 = d0;
  const t2 = t1 + d1;
  const t3 = t2 + d2;
  return makeCameraScore("structural-choir-camera-v1", [
    segment("first-voice", t0, d0, "macro-track", first, first, "hesitate", { holdFraction: 0.4, focusTransition: 0.8, parallaxStrength: params.parallax }),
    segment("second-voice", t1, d1, "target-shift", first, second, "drift", { focusTransition: 0.74 }),
    segment("deep-voice", t2, d2, "target-shift", second, third, "slow-arrival", { focusTransition: 0.86, parallaxStrength: params.parallax * 0.9 }),
    segment("ensemble-reveal", t3, 4.6 + params.cameraHold, "retreat", third, ensemble, "drift", { parallaxStrength: params.parallax * 0.82, focusTransition: 0.72 }),
  ]);
}

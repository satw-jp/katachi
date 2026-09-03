import * as THREE from "three";
import type { ConceptSource } from "../../sourceAdapter.ts";
import { makeCameraScore, pose, segment } from "../cameraScore.ts";
import { buildCameraAnchors } from "../cameraAnchors.ts";
import { buildMicroLandscapeCameraScore } from "./microLandscapeCamera.ts";
import { buildMutualRescueCameraScore } from "./mutualRescueCamera.ts";
import { buildVisibleMendingCameraScore } from "./visibleMendingCamera.ts";
import { buildVoidBouquetCameraScore } from "./voidBouquetCamera.ts";
import { buildWeightOfHesitationCameraScore } from "./weightOfHesitationCamera.ts";
import { buildInsideOutCameraScore } from "./insideOutCamera.ts";
import { buildOneHandManyFlowersCameraScore } from "./oneHandManyFlowersCamera.ts";
import { buildCraftStrataCameraScore } from "./craftStrataCamera.ts";
import { buildShadowRoomCameraScore } from "./shadowRoomCamera.ts";
import { buildStructuralChoirCameraScore } from "./structuralChoirCamera.ts";
import type { CameraParameters, CameraScore } from "../cameraTypes.ts";

export type CameraScoreBuilder = (source: ConceptSource, seed: number, params: CameraParameters) => CameraScore;

const PRIORITY_BUILDERS: Record<string, CameraScoreBuilder> = {
  "weight-of-hesitation": buildWeightOfHesitationCameraScore,
  "mutual-rescue": buildMutualRescueCameraScore,
  "void-bouquet": buildVoidBouquetCameraScore,
  "inside-out": buildInsideOutCameraScore,
  "one-hand-many-flowers": buildOneHandManyFlowersCameraScore,
  "craft-strata": buildCraftStrataCameraScore,
  "shadow-room": buildShadowRoomCameraScore,
  "micro-landscape": buildMicroLandscapeCameraScore,
  "visible-mending": buildVisibleMendingCameraScore,
  "structural-choir": buildStructuralChoirCameraScore,
};

export function buildConceptCameraScore(conceptId: string, source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  return PRIORITY_BUILDERS[conceptId]?.(source, seed, params) ?? buildFallbackCameraScore(conceptId, source, seed, params);
}

function buildFallbackCameraScore(conceptId: string, source: ConceptSource, seed: number, params: CameraParameters): CameraScore {
  const center = buildCameraAnchors(source).find((item) => item.kind === "center")!;
  const first = pose(center.position, new THREE.Vector3(5.4, -8.2, 4.5), { fov: 46 });
  const second = pose(center.position, new THREE.Vector3(5.9 + params.orbit + Math.sin(seed) * 0.08, -7.5, 4.1), { fov: 45, roll: params.cameraRoll * 0.4 });
  return makeCameraScore(`${conceptId}-camera-v1`, [
    segment("default-drift", 0, 5.6, "drift", first, second, "drift", { parallaxStrength: params.parallax }),
    segment("default-hold", 5.6, 2.4 + params.cameraHold * 1.8, "hold", second, second, "linear", { holdFraction: 0.85 }),
    segment("default-reveal", 8 + params.cameraHold * 1.8, 5.2, "target-shift", second, first, "slow-arrival", { focusTransition: 0.6 }),
    segment("default-rest", 13.2 + params.cameraHold * 1.8, 4.2, "hold", first, first, "linear", { holdFraction: 0.9 }),
  ]);
}

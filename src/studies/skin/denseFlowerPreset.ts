import type { Ball } from "../cloud-sculpt/field.ts";
import { fillLargestSurfaceGaps, type LaceFillResult } from "./laceFill.ts";
import { packPatchesGreedy, type PackPatchesResult, type SkinParams } from "./field.ts";

export const DENSE_FLOWER_V6_STYLE_PRESET_ID = "dense-flower-v6-style" as const;

/** Editable reconstruction of the principles observed in the preserved v6
 * STL. It is deliberately named "style": the missing source recipe means
 * the exact preserved mesh cannot be regenerated honestly. */
export const DENSE_FLOWER_V6_STYLE_OVERRIDES: Readonly<Partial<SkinParams>> = {
  patchShape: "flower",
  surfaceGenerationMode: "randomPack",
  motifPlacement: "surface",
  minR: 0.12,
  maxR: 0.32,
  gap: 0.05,
  attempts: 500,
  seed: "yohaku-skin",
  roundK: 0.05,
  flowerMotifPreset: "six-core",
  flowerPetalCount: 6,
  flowerShowCore: true,
  flowerOpening: 0.93,
  flowerNeck: 0.36,
  flowerCoreSize: 0.57,
  flowerCupping: 0.32,
  flowerCoreLift: 0,
  flowerGrowthDifference: 0,
  flowerExpansion: 1,
  flowerConnectionMode: "separate",
  lacePasses: 3,
  laceMotifPlacement: "surface",
  laceMinScale: 0.45,
  laceGap: 0.025,
};

export interface DenseFlowerV6StyleResult {
  params: SkinParams;
  primary: PackPatchesResult;
  lace: LaceFillResult;
}

export function denseFlowerV6StyleParams(current: SkinParams): SkinParams {
  return { ...current, ...DENSE_FLOWER_V6_STYLE_OVERRIDES };
}

/** Build the editable primary flowers and decreasing-size gap-fill pass.
 * Inputs are not mutated; history stores the realized result. */
export function buildDenseFlowerV6Style(
  host: Ball[], hostK: number, current: SkinParams,
): DenseFlowerV6StyleResult {
  const params = denseFlowerV6StyleParams(current);
  const primary = packPatchesGreedy(host, hostK, [], params);
  const lace = fillLargestSurfaceGaps(host, hostK, primary.patches, params);
  return { params, primary, lace };
}

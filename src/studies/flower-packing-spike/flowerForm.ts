import type { FlowerComponent } from "./packing.ts";

export type FlowerFormVariantId = "flat" | "cupped" | "raised-core" | "growth-difference";
export type FlowerPetalCount = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const FLOWER_PETAL_COUNTS: readonly FlowerPetalCount[] = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
] as const;

export interface FlowerFormParams {
  opening: number;
  neck: number;
  coreSize: number;
  cupping: number;
  coreLift: number;
  growthDifference: number;
}

export interface FlowerFormVariant {
  id: FlowerFormVariantId;
  label: string;
  shortLabel: string;
  cause: string;
  naturalParams: Pick<FlowerFormParams, "cupping" | "coreLift" | "growthDifference">;
}

export const FLOWER_FORM_VARIANTS: readonly FlowerFormVariant[] = [
  {
    id: "flat",
    label: "平たい基準",
    shortLabel: "FLAT",
    cause: "すべてが同じ面で育つ",
    naturalParams: { cupping: 0, coreLift: 0, growthDifference: 0 },
  },
  {
    id: "cupped",
    label: "花弁が起きる",
    shortLabel: "CUPPING",
    cause: "花弁が中心から手前へ反る",
    naturalParams: { cupping: 0.32, coreLift: 0, growthDifference: 0 },
  },
  {
    id: "raised-core",
    label: "花芯が上がる",
    shortLabel: "RAISED CORE",
    cause: "中心だけが先に盛り上がる",
    naturalParams: { cupping: -0.06, coreLift: 0.34, growthDifference: 0 },
  },
  {
    id: "growth-difference",
    label: "育ち方が違う",
    shortLabel: "GROWTH",
    cause: "花弁ごとに成長量が違う",
    naturalParams: { cupping: 0.1, coreLift: 0.06, growthDifference: 0.24 },
  },
] as const;

export const DEFAULT_FLOWER_FORM_VARIANT: FlowerFormVariantId = "cupped";

const BASE_FLOWER_FORM_PARAMS: FlowerFormParams = {
  opening: 0.93,
  neck: 0.36,
  coreSize: 0.57,
  cupping: 0,
  coreLift: 0,
  growthDifference: 0,
};

export function paramsForFlowerVariant(
  variantId: FlowerFormVariantId,
  base: FlowerFormParams = BASE_FLOWER_FORM_PARAMS,
): FlowerFormParams {
  const variant = FLOWER_FORM_VARIANTS.find((entry) => entry.id === variantId);
  if (!variant) return { ...base };
  return { ...base, ...variant.naturalParams };
}

export const DEFAULT_FLOWER_FORM_PARAMS = paramsForFlowerVariant(DEFAULT_FLOWER_FORM_VARIANT);

export const FLOWER_FORM_SCALE = 0.72;

const growthPattern = [
  0.82, -0.46, 0.34, -0.78, 0.56, -0.22, 0.68, -0.58, 0.18, -0.36, 0.74, -0.12,
] as const;

/**
 * Builds the component field for one flower. Natural variation stays deterministic:
 * the same petal count and parameters always return the same form.
 */
export function createFlowerFormComponents(
  petalCount: FlowerPetalCount,
  params: FlowerFormParams,
  showCore = true,
): FlowerComponent[] {
  const coreRadius = FLOWER_FORM_SCALE * params.coreSize;
  // Above six petals, keep the flower envelope comparable by sharing the
  // available circumference among smaller petals instead of growing outward.
  const petalRadius = FLOWER_FORM_SCALE * 0.51 * Math.sqrt(6 / Math.max(6, petalCount));
  const requestedSpread = FLOWER_FORM_SCALE * params.opening;
  const corelessRingSpread = (petalRadius * 0.94) / Math.sin(Math.PI / petalCount);
  const spread = showCore ? requestedSpread : Math.min(requestedSpread, corelessRingSpread);
  const components: FlowerComponent[] = [];
  if (showCore) {
    components.push({
      instanceId: petalCount,
      componentIndex: -1,
      kind: "core",
      position: { x: 0, y: 0, z: FLOWER_FORM_SCALE * params.coreLift },
      radius: coreRadius,
    });
  }

  for (let index = 0; index < petalCount; index++) {
    const angle = Math.PI * 0.5 + (index / petalCount) * Math.PI * 2;
    const growth = growthPattern[index] * params.growthDifference;
    const petalSpread = spread * (1 + growth * 0.34);
    components.push({
      instanceId: petalCount,
      componentIndex: index,
      kind: "petal",
      position: {
        x: Math.cos(angle) * petalSpread,
        y: Math.sin(angle) * petalSpread,
        z: FLOWER_FORM_SCALE * params.cupping * (1 + growth * 0.18),
      },
      radius: petalRadius * (1 + growth),
    });
  }
  return components;
}

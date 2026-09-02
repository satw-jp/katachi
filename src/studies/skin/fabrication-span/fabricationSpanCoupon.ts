import { buildMaterialSpanPath } from "./fabricationSpanPath.ts";
import { FABRICATION_SPAN_SAFETY_BOUNDS, findFabricationSpanPreset } from "./fabricationSpanPresets.ts";
import type { FabricationParameters, MaterialSpanAnchor, MaterialSpanCoupon, MaterialSpanVariantId, Point3Mm } from "./fabricationSpanTypes.ts";

export const FABRICATION_SPAN_ANCHOR_A: MaterialSpanAnchor = {
  id: "A",
  positionMm: { x: 40, y: 90, z: 20 },
};

export const FABRICATION_SPAN_ANCHOR_B: MaterialSpanAnchor = {
  id: "B",
  positionMm: { x: 80, y: 90, z: 20 },
};

export const FABRICATION_SPAN_ANCHOR_WIDTH_MM = 10;
export const FABRICATION_SPAN_ANCHOR_DEPTH_MM = 10;

export function buildFabricationSpanCoupon(
  variantId: MaterialSpanVariantId = "baseline",
  parameterOverrides: Partial<FabricationParameters> = {},
): MaterialSpanCoupon {
  const preset = findFabricationSpanPreset(variantId);
  const parameters = { ...preset.parameters, ...parameterOverrides };
  return {
    anchors: {
      a: FABRICATION_SPAN_ANCHOR_A,
      b: FABRICATION_SPAN_ANCHOR_B,
    },
    path: buildMaterialSpanPath(FABRICATION_SPAN_ANCHOR_A, FABRICATION_SPAN_ANCHOR_B, parameters),
    anchorWidthMm: FABRICATION_SPAN_ANCHOR_WIDTH_MM,
    anchorDepthMm: FABRICATION_SPAN_ANCHOR_DEPTH_MM,
    safetyBounds: FABRICATION_SPAN_SAFETY_BOUNDS,
    parameters,
  };
}

export function couponPathPoints(coupon: MaterialSpanCoupon): readonly Point3Mm[] {
  return coupon.path.points;
}

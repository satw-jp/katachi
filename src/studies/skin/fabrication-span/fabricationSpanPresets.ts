import type { CouponSafetyBoundsMm, FabricationParameters, MaterialSpanPreset } from "./fabricationSpanTypes.ts";

export const FABRICATION_SPAN_SAFETY_BOUNDS: CouponSafetyBoundsMm = {
  // Conservative coupon envelope inside the A1's 256 x 256 x 256 mm nominal
  // build volume. The envelope is a study guardrail, not a printer guarantee.
  x: { min: 20, max: 100 },
  y: { min: 70, max: 110 },
  z: { min: 0, max: 30 },
  minFeedMmPerMin: 60,
  maxFeedMmPerMin: 3_600,
  maxExtrusionPerSegmentMm: 4,
  nozzleTemperatureC: { min: 180, max: 240 },
  bedTemperatureC: { min: 0, max: 80 },
};

export const FABRICATION_SPAN_BASE_PARAMETERS: FabricationParameters = {
  nozzleDiameterMm: 0.8,
  filamentDiameterMm: 1.75,
  layerHeightMm: 0.4,
  printSpeedMmPerSec: 20,
  travelSpeedMmPerSec: 35,
  extrusionMultiplier: 0.95,
  nozzleTemperatureC: 210,
  bedTemperatureC: 60,
  fanPercent: 30,
  spanLiftMm: 1.5,
  sampleCount: 24,
};

export const FABRICATION_SPAN_PRESETS: readonly MaterialSpanPreset[] = [
  {
    id: "baseline",
    label: "V0 — BASELINE",
    changedParameter: "none",
    parameters: FABRICATION_SPAN_BASE_PARAMETERS,
  },
  {
    id: "fast",
    label: "V1 — FAST",
    changedParameter: "printSpeedMmPerSec",
    parameters: { ...FABRICATION_SPAN_BASE_PARAMETERS, printSpeedMmPerSec: 26 },
  },
  {
    id: "slow",
    label: "V2 — SLOW",
    changedParameter: "printSpeedMmPerSec",
    parameters: { ...FABRICATION_SPAN_BASE_PARAMETERS, printSpeedMmPerSec: 14 },
  },
  {
    id: "low-flow",
    label: "V3 — LOW FLOW",
    changedParameter: "extrusionMultiplier",
    parameters: { ...FABRICATION_SPAN_BASE_PARAMETERS, extrusionMultiplier: 0.82 },
  },
  {
    id: "high-lift",
    label: "V4 — HIGH LIFT",
    changedParameter: "spanLiftMm",
    parameters: { ...FABRICATION_SPAN_BASE_PARAMETERS, spanLiftMm: 4 },
  },
];

export function findFabricationSpanPreset(id: string): MaterialSpanPreset {
  const preset = FABRICATION_SPAN_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown Material Span variant: ${id}`);
  return preset;
}

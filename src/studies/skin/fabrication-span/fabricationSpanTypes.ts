export type Mm = number;

export interface Point3Mm {
  x: Mm;
  y: Mm;
  z: Mm;
}

export interface MaterialSpanAnchor {
  id: string;
  positionMm: Point3Mm;
}

export interface MaterialSpanPath {
  startAnchor: MaterialSpanAnchor;
  endAnchor: MaterialSpanAnchor;
  points: Point3Mm[];
}

export interface FabricationParameters {
  nozzleDiameterMm: Mm;
  filamentDiameterMm: Mm;
  layerHeightMm: Mm;
  printSpeedMmPerSec: number;
  travelSpeedMmPerSec: number;
  extrusionMultiplier: number;
  nozzleTemperatureC: number;
  bedTemperatureC: number;
  fanPercent: number;
  spanLiftMm: Mm;
  sampleCount: number;
}

export interface AxisBoundsMm {
  min: Mm;
  max: Mm;
}

export interface CouponSafetyBoundsMm {
  x: AxisBoundsMm;
  y: AxisBoundsMm;
  z: AxisBoundsMm;
  minFeedMmPerMin: number;
  maxFeedMmPerMin: number;
  maxExtrusionPerSegmentMm: Mm;
  nozzleTemperatureC: AxisBoundsMm;
  bedTemperatureC: AxisBoundsMm;
}

export interface MaterialSpanCoupon {
  anchors: {
    a: MaterialSpanAnchor;
    b: MaterialSpanAnchor;
  };
  path: MaterialSpanPath;
  anchorWidthMm: Mm;
  anchorDepthMm: Mm;
  safetyBounds: CouponSafetyBoundsMm;
  parameters: FabricationParameters;
}

export type MaterialSpanVariantId =
  | "baseline"
  | "fast"
  | "slow"
  | "low-flow"
  | "high-lift";

export interface MaterialSpanPreset {
  id: MaterialSpanVariantId;
  label: string;
  changedParameter: "none" | keyof FabricationParameters;
  parameters: FabricationParameters;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface MaterialSpanMotion {
  kind: "travel" | "extrusion";
  start: Point3Mm;
  end: Point3Mm;
  feedMmPerMin: number;
  extrusionDeltaMm: Mm;
  absoluteExtrusionMm: Mm;
}

export interface MaterialSpanMetadata {
  study: "skin-fabrication-span";
  version: "0.1.0";
  generatorVersion: "fabrication-span-v0";
  generatorCommit: string;
  machine: "Bambu Lab A1";
  nozzleDiameterMm: Mm;
  filament: "PLA";
  filamentDiameterMm: Mm;
  extrusionMode: "absolute";
  coordinateContract: "machine-absolute-mm";
  anchorA: Point3Mm;
  anchorB: Point3Mm;
  pathPoints: Point3Mm[];
  parameters: FabricationParameters;
  physicalInterpretation: "commanded-path-only; measure-final-filament";
}

export interface MaterialSpanGcodeArtifact {
  fileName: string;
  gcode: string;
  metadata: MaterialSpanMetadata;
  motions: MaterialSpanMotion[];
  validation: ValidationResult;
  lineCount: number;
  byteLength: number;
}

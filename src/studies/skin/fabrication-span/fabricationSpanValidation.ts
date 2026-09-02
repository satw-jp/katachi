import type {
  FabricationParameters,
  MaterialSpanCoupon,
  MaterialSpanMotion,
  Point3Mm,
  ValidationResult,
} from "./fabricationSpanTypes.ts";
import { pointDistanceMm } from "./fabricationSpanPath.ts";

const EPSILON = 1e-9;

function isFinitePoint(point: Point3Mm): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function samePoint(a: Point3Mm, b: Point3Mm): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function addError(errors: string[], condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

function validateParameters(parameters: FabricationParameters, errors: string[]): void {
  const finiteFields: Array<keyof FabricationParameters> = [
    "nozzleDiameterMm",
    "filamentDiameterMm",
    "layerHeightMm",
    "printSpeedMmPerSec",
    "travelSpeedMmPerSec",
    "extrusionMultiplier",
    "nozzleTemperatureC",
    "bedTemperatureC",
    "fanPercent",
    "spanLiftMm",
    "sampleCount",
  ];
  for (const field of finiteFields) {
    addError(errors, Number.isFinite(parameters[field]), `${field} must be finite`);
  }
  addError(errors, parameters.nozzleDiameterMm >= 0.2 && parameters.nozzleDiameterMm <= 1.2, "nozzle diameter is outside the study range");
  addError(errors, parameters.filamentDiameterMm >= 1.5 && parameters.filamentDiameterMm <= 2.0, "filament diameter is outside the study range");
  addError(errors, parameters.layerHeightMm >= 0.1 && parameters.layerHeightMm <= 0.8, "layer height is outside the study range");
  addError(errors, parameters.printSpeedMmPerSec > 0 && parameters.printSpeedMmPerSec <= 60, "print speed is outside the study range");
  addError(errors, parameters.travelSpeedMmPerSec > 0 && parameters.travelSpeedMmPerSec <= 100, "travel speed is outside the study range");
  addError(errors, parameters.extrusionMultiplier > 0 && parameters.extrusionMultiplier <= 1.5, "extrusion multiplier is outside the study range");
  addError(errors, parameters.nozzleTemperatureC >= 170 && parameters.nozzleTemperatureC <= 250, "nozzle temperature is outside the study range");
  addError(errors, parameters.bedTemperatureC >= 0 && parameters.bedTemperatureC <= 100, "bed temperature is outside the study range");
  addError(errors, parameters.fanPercent >= 0 && parameters.fanPercent <= 100, "fan must be between 0 and 100 percent");
  addError(errors, parameters.spanLiftMm > 0 && parameters.spanLiftMm <= 8, "span lift is outside the study range");
  addError(errors, Number.isInteger(parameters.sampleCount) && parameters.sampleCount >= 2 && parameters.sampleCount <= 128, "sample count is outside the study range");
}

function validateBounds(coupon: MaterialSpanCoupon, errors: string[]): void {
  const { safetyBounds } = coupon;
  for (const [axis, bounds] of Object.entries({ x: safetyBounds.x, y: safetyBounds.y, z: safetyBounds.z })) {
    addError(errors, Number.isFinite(bounds.min) && Number.isFinite(bounds.max), `${axis} bounds must be finite`);
    addError(errors, bounds.min < bounds.max, `${axis} bounds must be increasing`);
  }
  addError(errors, Number.isFinite(safetyBounds.minFeedMmPerMin) && safetyBounds.minFeedMmPerMin > 0, "minimum feed must be positive and finite");
  addError(errors, Number.isFinite(safetyBounds.maxFeedMmPerMin) && safetyBounds.maxFeedMmPerMin >= safetyBounds.minFeedMmPerMin, "maximum feed is invalid");
  addError(errors, Number.isFinite(safetyBounds.maxExtrusionPerSegmentMm) && safetyBounds.maxExtrusionPerSegmentMm > 0, "maximum extrusion is invalid");
  addError(errors, safetyBounds.nozzleTemperatureC.min <= safetyBounds.nozzleTemperatureC.max, "nozzle temperature bounds are invalid");
  addError(errors, safetyBounds.bedTemperatureC.min <= safetyBounds.bedTemperatureC.max, "bed temperature bounds are invalid");
}

function validatePoint(point: Point3Mm, coupon: MaterialSpanCoupon, label: string, errors: string[]): void {
  addError(errors, isFinitePoint(point), `${label} must be finite`);
  addError(errors, point.x >= coupon.safetyBounds.x.min && point.x <= coupon.safetyBounds.x.max, `${label}.x is outside safe coupon bounds`);
  addError(errors, point.y >= coupon.safetyBounds.y.min && point.y <= coupon.safetyBounds.y.max, `${label}.y is outside safe coupon bounds`);
  addError(errors, point.z >= coupon.safetyBounds.z.min && point.z <= coupon.safetyBounds.z.max, `${label}.z is outside safe coupon bounds`);
}

export function validateMaterialSpanCoupon(coupon: MaterialSpanCoupon): ValidationResult {
  const errors: string[] = [];
  validateParameters(coupon.parameters, errors);
  validateBounds(coupon, errors);
  addError(errors, coupon.anchors.a.id.length > 0 && coupon.anchors.b.id.length > 0, "anchors must have ids");
  addError(errors, coupon.anchors.a.id !== coupon.anchors.b.id, "anchors must have distinct ids");
  addError(errors, Number.isFinite(coupon.anchorWidthMm) && coupon.anchorWidthMm > 0, "anchor width must be positive and finite");
  addError(errors, Number.isFinite(coupon.anchorDepthMm) && coupon.anchorDepthMm > 0, "anchor depth must be positive and finite");
  validatePoint(coupon.anchors.a.positionMm, coupon, "anchor A", errors);
  validatePoint(coupon.anchors.b.positionMm, coupon, "anchor B", errors);
  const points = coupon.path.points;
  addError(errors, points.length >= 4, "path must contain departure, span, arrival and terminal points");
  if (points.length >= 1) {
    addError(errors, samePoint(points[0], coupon.anchors.a.positionMm), "path must start exactly at anchor A");
    addError(errors, samePoint(points[points.length - 1], coupon.anchors.b.positionMm), "path must end exactly at anchor B");
  }
  addError(errors, samePoint(coupon.path.startAnchor.positionMm, coupon.anchors.a.positionMm), "path start anchor must be anchor A");
  addError(errors, samePoint(coupon.path.endAnchor.positionMm, coupon.anchors.b.positionMm), "path end anchor must be anchor B");

  for (let index = 0; index < points.length; index += 1) {
    validatePoint(points[index], coupon, `path point ${index}`, errors);
    if (index > 0) {
      addError(errors, pointDistanceMm(points[index - 1], points[index]) > EPSILON, `path segment ${index - 1} has zero length`);
    }
  }

  const { parameters, safetyBounds } = coupon;
  addError(errors, parameters.nozzleTemperatureC >= safetyBounds.nozzleTemperatureC.min && parameters.nozzleTemperatureC <= safetyBounds.nozzleTemperatureC.max, "nozzle temperature is outside configured bounds");
  addError(errors, parameters.bedTemperatureC >= safetyBounds.bedTemperatureC.min && parameters.bedTemperatureC <= safetyBounds.bedTemperatureC.max, "bed temperature is outside configured bounds");
  return { ok: errors.length === 0, errors };
}

export function validateMaterialSpanMotions(coupon: MaterialSpanCoupon, motions: MaterialSpanMotion[]): ValidationResult {
  const errors: string[] = [];
  const base = validateMaterialSpanCoupon(coupon);
  errors.push(...base.errors);
  let previousAbsoluteExtrusion = 0;

  for (let index = 0; index < motions.length; index += 1) {
    const motion = motions[index];
    validatePoint(motion.start, coupon, `motion ${index} start`, errors);
    validatePoint(motion.end, coupon, `motion ${index} end`, errors);
    const length = pointDistanceMm(motion.start, motion.end);
    addError(errors, Number.isFinite(length) && length > EPSILON, `motion ${index} has zero or non-finite length`);
    addError(errors, Number.isFinite(motion.feedMmPerMin) && motion.feedMmPerMin >= coupon.safetyBounds.minFeedMmPerMin && motion.feedMmPerMin <= coupon.safetyBounds.maxFeedMmPerMin, `motion ${index} feed is outside bounds`);
    addError(errors, Number.isFinite(motion.absoluteExtrusionMm) && motion.absoluteExtrusionMm >= previousAbsoluteExtrusion - EPSILON, `motion ${index} absolute E is not monotonic`);
    if (motion.kind === "travel") {
      addError(errors, Math.abs(motion.extrusionDeltaMm) <= EPSILON, `travel motion ${index} must not extrude`);
      addError(errors, Math.abs(motion.absoluteExtrusionMm - previousAbsoluteExtrusion) <= EPSILON, `travel motion ${index} changed absolute E`);
    } else {
      addError(errors, Number.isFinite(motion.extrusionDeltaMm) && motion.extrusionDeltaMm > EPSILON, `extrusion motion ${index} must extrude a positive amount`);
      addError(errors, motion.extrusionDeltaMm <= coupon.safetyBounds.maxExtrusionPerSegmentMm, `extrusion motion ${index} exceeds per-segment bound`);
      addError(errors, Math.abs(motion.absoluteExtrusionMm - (previousAbsoluteExtrusion + motion.extrusionDeltaMm)) <= EPSILON, `extrusion motion ${index} has inconsistent absolute E`);
    }
    previousAbsoluteExtrusion = motion.absoluteExtrusionMm;
  }
  addError(errors, motions.some((motion) => motion.kind === "extrusion"), "coupon must contain extrusion motions");
  return { ok: errors.length === 0, errors };
}

export function assertValidMaterialSpanCoupon(coupon: MaterialSpanCoupon): void {
  const result = validateMaterialSpanCoupon(coupon);
  if (!result.ok) throw new Error(`Material Span coupon validation failed: ${result.errors.join("; ")}`);
}

export function assertValidMaterialSpanMotions(coupon: MaterialSpanCoupon, motions: MaterialSpanMotion[]): void {
  const result = validateMaterialSpanMotions(coupon, motions);
  if (!result.ok) throw new Error(`Material Span motion validation failed: ${result.errors.join("; ")}`);
}

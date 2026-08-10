import {
  SUPPORTED_POINT_BUDGETS,
  type FiniteBounds,
  type FormGeometry,
  type FormRepresentation,
  type SdfBallUnionRepresentation,
  type Vec3,
} from "./contracts.ts";

export const MAX_POSITION_BYTES = 160_000 * 3 * Float32Array.BYTES_PER_ELEMENT;
/** Keeps bounded candidate evaluation from becoming an unbounded geometry request. */
export const MAX_SDF_BALLS = 4_096;

export interface ValidationOptions {
  /** Test-only escape hatch; production requests remain restricted to UI budgets. */
  readonly allowTestBudget?: number;
}

export function isFiniteVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((component) => typeof component === "number" && Number.isFinite(component));
}

export function isFiniteBounds(value: unknown): value is FiniteBounds {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as { min?: unknown; max?: unknown };
  return isFiniteVec3(candidate.min) && isFiniteVec3(candidate.max)
    && candidate.min[0] <= candidate.max[0]
    && candidate.min[1] <= candidate.max[1]
    && candidate.min[2] <= candidate.max[2];
}

function assertRepresentation(representation: FormRepresentation): asserts representation is SdfBallUnionRepresentation {
  if (representation.kind !== "sdf-ball-union") throw new RangeError("Unsupported FORM representation");
  if (!Array.isArray(representation.balls) || representation.balls.length === 0) throw new RangeError("FORM geometry must contain at least one SDF ball");
  if (representation.balls.length > MAX_SDF_BALLS) throw new RangeError("FORM SDF ball count exceeds the bounded request limit");
  if (!Number.isFinite(representation.smoothness) || representation.smoothness < 0) throw new RangeError("SDF smoothness must be finite and non-negative");
  if (!isFiniteBounds(representation.conservativeBounds)) throw new RangeError("FORM conservative bounds must be finite");
  for (const ball of representation.balls) {
    if (!isFiniteVec3(ball.center) || !Number.isFinite(ball.radius) || ball.radius <= 0) {
      throw new RangeError("Each SDF ball needs finite coordinates and a positive radius");
    }
  }
}

export function validateFormGeometry(geometry: FormGeometry): void {
  if (geometry === null || typeof geometry !== "object") throw new TypeError("FORM geometry is required");
  if (typeof geometry.sourceId !== "string" || typeof geometry.revision !== "string" || typeof geometry.contentHash !== "string" || geometry.contentHash.length === 0) {
    throw new RangeError("FORM geometry needs sourceId, revision, and contentHash");
  }
  assertRepresentation(geometry.representation);
}

export function validatePointBudget(pointBudget: number, options: ValidationOptions = {}): void {
  const isProductionBudget = SUPPORTED_POINT_BUDGETS.includes(pointBudget as (typeof SUPPORTED_POINT_BUDGETS)[number]);
  const isExplicitTestBudget = options.allowTestBudget === pointBudget && Number.isInteger(pointBudget) && pointBudget > 0 && pointBudget < SUPPORTED_POINT_BUDGETS[0];
  if (!isProductionBudget && !isExplicitTestBudget) throw new RangeError("FORM point budget must be one of 20k, 40k, 80k, or 160k");
  if (!Number.isInteger(pointBudget) || pointBudget * 3 * Float32Array.BYTES_PER_ELEMENT > MAX_POSITION_BYTES) {
    throw new RangeError("FORM point request exceeds its bounded memory budget");
  }
}

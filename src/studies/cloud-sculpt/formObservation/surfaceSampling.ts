import type { FiniteBounds, FormGeometry, FormPointSet, SamplingDiagnostics, SamplingProgress, Vec3 } from "./contracts.ts";
import { validateFormGeometry, validatePointBudget, type ValidationOptions } from "./validation.ts";

export const DEFAULT_SAMPLING_VERSION = "form-0-sdf-v1";
const MAX_ITERATIONS = 12;
const CANDIDATE_MULTIPLIER = 1.2;

export interface SamplingOptions extends ValidationOptions {
  readonly samplingVersion?: string;
  readonly onProgress?: (progress: SamplingProgress) => void;
}

interface Rng {
  next(): number;
}

function seededRng(identity: string): Rng {
  let state = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    state ^= identity.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return {
    next(): number {
      state += 0x6d2b79f5;
      let result = state;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function samplingIdentity(contentHash: string, pointBudget: number, samplingVersion = DEFAULT_SAMPLING_VERSION): string {
  return `${contentHash}:${pointBudget}:${samplingVersion}`;
}

function evaluateSdf(geometry: FormGeometry, x: number, y: number, z: number): number {
  const representation = geometry.representation;
  if (representation.kind !== "sdf-ball-union") return Number.NaN;
  const first = representation.balls[0];
  let distance = Math.hypot(x - first.center[0], y - first.center[1], z - first.center[2]) - first.radius;
  for (let index = 1; index < representation.balls.length; index += 1) {
    const ball = representation.balls[index];
    const other = Math.hypot(x - ball.center[0], y - ball.center[1], z - ball.center[2]) - ball.radius;
    if (representation.smoothness <= 0) {
      distance = Math.min(distance, other);
    } else {
      const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (other - distance)) / representation.smoothness));
      distance = other * (1 - h) + distance * h - representation.smoothness * h * (1 - h);
    }
  }
  return distance;
}

function boundsDiagonal(bounds: FiniteBounds): number {
  return Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
}

function normalizedDirection(rng: Rng): Vec3 {
  const z = rng.next() * 2 - 1;
  const theta = rng.next() * Math.PI * 2;
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  return [radial * Math.cos(theta), z, radial * Math.sin(theta)];
}

function chooseBallIndex(geometry: FormGeometry, rng: Rng): number {
  const representation = geometry.representation;
  if (representation.kind !== "sdf-ball-union") return 0;
  let total = 0;
  for (const ball of representation.balls) total += ball.radius * ball.radius;
  let threshold = rng.next() * total;
  for (let index = 0; index < representation.balls.length; index += 1) {
    threshold -= representation.balls[index].radius * representation.balls[index].radius;
    if (threshold <= 0) return index;
  }
  return representation.balls.length - 1;
}

function pointBounds(positions: Float32Array, count: number): FiniteBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count * 3; index += 3) {
    const x = positions[index]; const y = positions[index + 1]; const z = positions[index + 2];
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * Samples primitive-surface candidates then projects them onto the union SDF.
 * This is intentionally labelled as biased: primitive weighting and overlap both
 * make it unsuitable as a claim of uniform surface-area sampling.
 */
export function sampleSdfSurface(geometry: FormGeometry, pointBudget: number, options: SamplingOptions = {}): FormPointSet {
  validateFormGeometry(geometry);
  validatePointBudget(pointBudget, options);
  const samplingVersion = options.samplingVersion ?? DEFAULT_SAMPLING_VERSION;
  const identity = samplingIdentity(geometry.contentHash, pointBudget, samplingVersion);
  const rng = seededRng(identity);
  const representation = geometry.representation;
  if (representation.kind !== "sdf-ball-union") throw new RangeError("Unsupported FORM representation");
  const tolerance = Math.max(boundsDiagonal(representation.conservativeBounds) * 1e-5, 1e-6);
  const gradientStep = Math.max(boundsDiagonal(representation.conservativeBounds) * 1e-5, 1e-6);
  const candidateLimit = Math.ceil(pointBudget * CANDIDATE_MULTIPLIER);
  const positions = new Float32Array(pointBudget * 3);
  let accepted = 0;
  let rejected = 0;
  let nonconverged = 0;
  let totalIterations = 0;
  let residualSum = 0;
  let maxResidual = 0;

  options.onProgress?.({ stage: "sampling", fraction: 0, message: "Generating deterministic SDF surface candidates" });
  for (let candidate = 0; candidate < candidateLimit && accepted < pointBudget; candidate += 1) {
    const sourceBall = representation.balls[chooseBallIndex(geometry, rng)];
    const direction = normalizedDirection(rng);
    let x = sourceBall.center[0] + direction[0] * sourceBall.radius;
    let y = sourceBall.center[1] + direction[1] * sourceBall.radius;
    let z = sourceBall.center[2] + direction[2] * sourceBall.radius;
    let residual = Number.POSITIVE_INFINITY;
    let converged = false;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      const distance = evaluateSdf(geometry, x, y, z);
      totalIterations += 1;
      if (!Number.isFinite(distance)) break;
      residual = Math.abs(distance);
      if (residual <= tolerance) {
        converged = true;
        break;
      }
      const gx = (evaluateSdf(geometry, x + gradientStep, y, z) - evaluateSdf(geometry, x - gradientStep, y, z)) / (2 * gradientStep);
      const gy = (evaluateSdf(geometry, x, y + gradientStep, z) - evaluateSdf(geometry, x, y - gradientStep, z)) / (2 * gradientStep);
      const gz = (evaluateSdf(geometry, x, y, z + gradientStep) - evaluateSdf(geometry, x, y, z - gradientStep)) / (2 * gradientStep);
      const gradientSquared = gx * gx + gy * gy + gz * gz;
      if (!Number.isFinite(gradientSquared) || gradientSquared < 1e-16) break;
      const step = distance / gradientSquared;
      x -= step * gx;
      y -= step * gy;
      z -= step * gz;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) break;
    }
    if (!converged) {
      nonconverged += 1;
      rejected += 1;
    } else {
      positions[accepted * 3] = x;
      positions[accepted * 3 + 1] = y;
      positions[accepted * 3 + 2] = z;
      accepted += 1;
      residualSum += residual;
      maxResidual = Math.max(maxResidual, residual);
    }
    if (candidate % 1024 === 0 || candidate + 1 === candidateLimit) {
      options.onProgress?.({ stage: "sampling", fraction: (candidate + 1) / candidateLimit, message: `Projected ${accepted} SDF surface points` });
    }
  }
  const resultPositions = positions.slice(0, accepted * 3);
  const diagnostics: SamplingDiagnostics = {
    identity,
    samplingVersion,
    candidateCount: accepted + rejected,
    acceptedCount: accepted,
    rejectedCount: rejected,
    nonconvergedCount: nonconverged,
    totalIterations,
    maxIterations: MAX_ITERATIONS,
    maxResidual,
    meanResidual: accepted === 0 ? Number.POSITIVE_INFINITY : residualSum / accepted,
    limitations: ["Approximate SDF zero-surface projection; finite-difference gradients and a fixed iteration cap are used.", "Candidates are radius-squared weighted primitive-surface samples, so density is biased and is not uniform-area sampling."],
    warnings: accepted < pointBudget ? [`Only ${accepted} of ${pointBudget} requested points converged within the bounded candidate budget.`] : [],
  };
  if (accepted === 0) throw new RangeError("No finite SDF surface points converged");
  return { positions: resultPositions, pointCount: accepted, bounds: pointBounds(resultPositions, accepted), diagnostics };
}

export function evaluateSerializedSdf(geometry: FormGeometry, x: number, y: number, z: number): number {
  return evaluateSdf(geometry, x, y, z);
}

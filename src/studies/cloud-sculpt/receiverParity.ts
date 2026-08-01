import {
  dilateSupport,
  type FluxRgb,
  type ReceiverTransportField,
} from "./receiverTransport.ts";

export interface ReceiverParityThresholds {
  maxFluxRelativeError: number;
  maxCentroidDistanceTexels: number;
  maxEnvelopeDistanceTexels: number;
  minSupportIou: number;
  maxDepositNormalizedL1: number;
  maxCoverageNormalizedL1: number;
}

export const DEFAULT_RECEIVER_PARITY_THRESHOLDS: Readonly<ReceiverParityThresholds> =
  Object.freeze({
    maxFluxRelativeError: 0.05,
    maxCentroidDistanceTexels: 1,
    maxEnvelopeDistanceTexels: 2,
    minSupportIou: 0.9,
    maxDepositNormalizedL1: 0.15,
    maxCoverageNormalizedL1: 0.1,
  });

export interface ReceiverParityGates {
  structure: boolean;
  flux: boolean;
  centroid: boolean;
  envelope: boolean;
  support: boolean;
  depositShape: boolean;
  coverageShape: boolean;
}

export interface ReceiverFieldParityMetrics {
  compatible: boolean;
  incompatibilities: string[];
  relativeFluxErrorRgb: FluxRgb;
  centroidDistanceTexels: number | null;
  envelopeDistanceTexels: number | null;
  supportIou: number;
  normalizedDepositL1: number;
  normalizedCoverageL1: number;
  thresholds: ReceiverParityThresholds;
  gates: ReceiverParityGates;
  pass: boolean;
}

interface WeightedFieldGeometry {
  total: number;
  centroidU: number | null;
  centroidV: number | null;
  lowerU: number | null;
  upperU: number | null;
  lowerV: number | null;
  upperV: number | null;
}

const RELATIVE_EPSILON = 1e-12;

/**
 * Compares two completed fixed-domain receiver fields before display exposure,
 * tone mapping, or shader composition. All distances are reported in texels so
 * the result remains meaningful if the fixed receiver resolution changes.
 */
export function compareReceiverFields(
  reference: ReceiverTransportField,
  candidate: ReceiverTransportField,
  thresholdOverrides: Partial<ReceiverParityThresholds> = {},
): ReceiverFieldParityMetrics {
  const thresholds = resolveThresholds(thresholdOverrides);
  const incompatibilities = structuralIncompatibilities(reference, candidate);
  const compatible = incompatibilities.length === 0;
  const referenceFlux = integratedFlux(reference.depositedFluxRgb);
  const candidateFlux = integratedFlux(candidate.depositedFluxRgb);
  const relativeFluxErrorRgb = {
    r: relativeError(referenceFlux.r, candidateFlux.r),
    g: relativeError(referenceFlux.g, candidateFlux.g),
    b: relativeError(referenceFlux.b, candidateFlux.b),
  };

  let centroidDistanceTexels: number | null = null;
  let envelopeDistanceTexels: number | null = null;
  let supportIou = 0;
  let normalizedDepositL1 = 1;
  let normalizedCoverageL1 = 1;
  if (compatible) {
    const referenceGeometry = weightedFieldGeometry(reference);
    const candidateGeometry = weightedFieldGeometry(candidate);
    centroidDistanceTexels = geometryDistanceTexels(
      referenceGeometry,
      candidateGeometry,
      reference,
      "centroid",
    );
    envelopeDistanceTexels = geometryDistanceTexels(
      referenceGeometry,
      candidateGeometry,
      reference,
      "envelope",
    );
    supportIou = expandedSupportIou(reference, candidate);
    normalizedDepositL1 = normalizedLuminanceL1(
      reference.depositedFluxRgb,
      candidate.depositedFluxRgb,
    );
    normalizedCoverageL1 = normalizedScalarL1(
      reference.geometricCoverage,
      candidate.geometricCoverage,
    );
  }

  const gates: ReceiverParityGates = {
    structure: compatible,
    flux: maxRgb(relativeFluxErrorRgb) <= thresholds.maxFluxRelativeError,
    centroid: centroidDistanceTexels !== null
      && centroidDistanceTexels <= thresholds.maxCentroidDistanceTexels,
    envelope: envelopeDistanceTexels !== null
      && envelopeDistanceTexels <= thresholds.maxEnvelopeDistanceTexels,
    support: supportIou >= thresholds.minSupportIou,
    depositShape: normalizedDepositL1 <= thresholds.maxDepositNormalizedL1,
    coverageShape: normalizedCoverageL1 <= thresholds.maxCoverageNormalizedL1,
  };

  return {
    compatible,
    incompatibilities,
    relativeFluxErrorRgb,
    centroidDistanceTexels,
    envelopeDistanceTexels,
    supportIou,
    normalizedDepositL1,
    normalizedCoverageL1,
    thresholds,
    gates,
    pass: Object.values(gates).every(Boolean),
  };
}

function structuralIncompatibilities(
  reference: ReceiverTransportField,
  candidate: ReceiverTransportField,
): string[] {
  const issues: string[] = [];
  if (reference.receiverId !== candidate.receiverId) issues.push("receiverId");
  if (reference.sceneRevision !== candidate.sceneRevision) issues.push("sceneRevision");
  if (reference.lightRevision !== candidate.lightRevision) issues.push("lightRevision");
  if (reference.width !== candidate.width) issues.push("width");
  if (reference.height !== candidate.height) issues.push("height");
  for (const key of ["minU", "minV", "sizeU", "sizeV", "texelArea"] as const) {
    if (!nearlyEqual(reference[key], candidate[key])) issues.push(key);
  }
  if (reference.geometricCoverage.length !== candidate.geometricCoverage.length) {
    issues.push("geometricCoverage.length");
  }
  if (reference.depositedFluxRgb.length !== candidate.depositedFluxRgb.length) {
    issues.push("depositedFluxRgb.length");
  }
  return issues;
}

function resolveThresholds(
  overrides: Partial<ReceiverParityThresholds>,
): ReceiverParityThresholds {
  return {
    maxFluxRelativeError: finiteThreshold(
      overrides.maxFluxRelativeError,
      DEFAULT_RECEIVER_PARITY_THRESHOLDS.maxFluxRelativeError,
    ),
    maxCentroidDistanceTexels: finiteThreshold(
      overrides.maxCentroidDistanceTexels,
      DEFAULT_RECEIVER_PARITY_THRESHOLDS.maxCentroidDistanceTexels,
    ),
    maxEnvelopeDistanceTexels: finiteThreshold(
      overrides.maxEnvelopeDistanceTexels,
      DEFAULT_RECEIVER_PARITY_THRESHOLDS.maxEnvelopeDistanceTexels,
    ),
    minSupportIou: finiteThreshold(
      overrides.minSupportIou,
      DEFAULT_RECEIVER_PARITY_THRESHOLDS.minSupportIou,
    ),
    maxDepositNormalizedL1: finiteThreshold(
      overrides.maxDepositNormalizedL1,
      DEFAULT_RECEIVER_PARITY_THRESHOLDS.maxDepositNormalizedL1,
    ),
    maxCoverageNormalizedL1: finiteThreshold(
      overrides.maxCoverageNormalizedL1,
      DEFAULT_RECEIVER_PARITY_THRESHOLDS.maxCoverageNormalizedL1,
    ),
  };
}

function finiteThreshold(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 0 ? value! : fallback;
}

function integratedFlux(values: Float32Array): FluxRgb {
  const result = { r: 0, g: 0, b: 0 };
  for (let offset = 0; offset < values.length; offset += 3) {
    result.r += nonNegative(values[offset]);
    result.g += nonNegative(values[offset + 1]);
    result.b += nonNegative(values[offset + 2]);
  }
  return result;
}

function weightedFieldGeometry(field: ReceiverTransportField): WeightedFieldGeometry {
  const marginalU = new Float64Array(field.width);
  const marginalV = new Float64Array(field.height);
  let total = 0;
  let weightedU = 0;
  let weightedV = 0;
  const texelU = field.sizeU / field.width;
  const texelV = field.sizeV / field.height;
  for (let y = 0; y < field.height; y++) {
    const v = field.minV + (y + 0.5) * texelV;
    for (let x = 0; x < field.width; x++) {
      const offset = (y * field.width + x) * 3;
      const weight = nonNegative(field.depositedFluxRgb[offset])
        + nonNegative(field.depositedFluxRgb[offset + 1])
        + nonNegative(field.depositedFluxRgb[offset + 2]);
      if (!(weight > 0)) continue;
      const u = field.minU + (x + 0.5) * texelU;
      marginalU[x] += weight;
      marginalV[y] += weight;
      total += weight;
      weightedU += u * weight;
      weightedV += v * weight;
    }
  }
  if (!(total > 0)) {
    return {
      total: 0,
      centroidU: null,
      centroidV: null,
      lowerU: null,
      upperU: null,
      lowerV: null,
      upperV: null,
    };
  }
  return {
    total,
    centroidU: weightedU / total,
    centroidV: weightedV / total,
    lowerU: field.minU + (weightedQuantileIndex(marginalU, total, 0.025) + 0.5) * texelU,
    upperU: field.minU + (weightedQuantileIndex(marginalU, total, 0.975) + 0.5) * texelU,
    lowerV: field.minV + (weightedQuantileIndex(marginalV, total, 0.025) + 0.5) * texelV,
    upperV: field.minV + (weightedQuantileIndex(marginalV, total, 0.975) + 0.5) * texelV,
  };
}

function weightedQuantileIndex(
  marginal: Float64Array,
  total: number,
  quantile: number,
): number {
  const target = total * quantile;
  let accumulated = 0;
  for (let index = 0; index < marginal.length; index++) {
    accumulated += marginal[index];
    if (accumulated >= target) return index;
  }
  return Math.max(0, marginal.length - 1);
}

function geometryDistanceTexels(
  reference: WeightedFieldGeometry,
  candidate: WeightedFieldGeometry,
  field: ReceiverTransportField,
  kind: "centroid" | "envelope",
): number | null {
  if (reference.total === 0 && candidate.total === 0) return 0;
  if (reference.total === 0 || candidate.total === 0) return null;
  const texelU = field.sizeU / field.width;
  const texelV = field.sizeV / field.height;
  if (kind === "centroid") {
    return Math.hypot(
      (candidate.centroidU! - reference.centroidU!) / texelU,
      (candidate.centroidV! - reference.centroidV!) / texelV,
    );
  }
  return Math.max(
    Math.abs(candidate.lowerU! - reference.lowerU!) / texelU,
    Math.abs(candidate.upperU! - reference.upperU!) / texelU,
    Math.abs(candidate.lowerV! - reference.lowerV!) / texelV,
    Math.abs(candidate.upperV! - reference.upperV!) / texelV,
  );
}

function expandedSupportIou(
  reference: ReceiverTransportField,
  candidate: ReceiverTransportField,
): number {
  const referenceSupport = dilateSupport(
    reference.geometricCoverage,
    reference.width,
    reference.height,
    1,
  );
  const candidateSupport = dilateSupport(
    candidate.geometricCoverage,
    candidate.width,
    candidate.height,
    1,
  );
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < referenceSupport.length; index++) {
    const inReference = referenceSupport[index] !== 0;
    const inCandidate = candidateSupport[index] !== 0;
    if (inReference && inCandidate) intersection++;
    if (inReference || inCandidate) union++;
  }
  return union > 0 ? intersection / union : 1;
}

function normalizedL1(
  reference: ArrayLike<number>,
  candidate: ArrayLike<number>,
): number {
  let referenceTotal = 0;
  let candidateTotal = 0;
  for (let index = 0; index < reference.length; index++) {
    referenceTotal += nonNegative(Number(reference[index]));
    candidateTotal += nonNegative(Number(candidate[index]));
  }
  if (!(referenceTotal > 0) && !(candidateTotal > 0)) return 0;
  if (!(referenceTotal > 0) || !(candidateTotal > 0)) return 1;
  let difference = 0;
  for (let index = 0; index < reference.length; index++) {
    difference += Math.abs(
      nonNegative(Number(reference[index])) / referenceTotal
      - nonNegative(Number(candidate[index])) / candidateTotal,
    );
  }
  return difference * 0.5;
}

function normalizedLuminanceL1(
  reference: Float32Array,
  candidate: Float32Array,
): number {
  const texelCount = reference.length / 3;
  const referenceLuminance = new Float64Array(texelCount);
  const candidateLuminance = new Float64Array(texelCount);
  for (let index = 0; index < texelCount; index++) {
    const offset = index * 3;
    referenceLuminance[index] = nonNegative(reference[offset])
      + nonNegative(reference[offset + 1])
      + nonNegative(reference[offset + 2]);
    candidateLuminance[index] = nonNegative(candidate[offset])
      + nonNegative(candidate[offset + 1])
      + nonNegative(candidate[offset + 2]);
  }
  return normalizedL1(referenceLuminance, candidateLuminance);
}

function normalizedScalarL1(reference: Float32Array, candidate: Float32Array): number {
  return normalizedL1(reference, candidate);
}

function relativeError(reference: number, candidate: number): number {
  return Math.abs(candidate - reference) / Math.max(Math.abs(reference), RELATIVE_EPSILON);
}

function maxRgb(value: FluxRgb): number {
  return Math.max(value.r, value.g, value.b);
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nearlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= RELATIVE_EPSILON * scale;
}

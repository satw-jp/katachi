import type {
  EvaluateContainmentJobResult,
  EvaluateContainmentJobRequest,
} from "./contracts.ts";

export interface ContainmentComparison {
  matched: boolean;
  discreteMismatchSampleIds: string[];
  missingSampleIds: string[];
  maximumAbsoluteMarginDelta: number;
  marginTolerance: number;
}

export function compareContainmentResults(
  request: EvaluateContainmentJobRequest,
  reference: EvaluateContainmentJobResult,
  candidate: EvaluateContainmentJobResult,
  marginTolerance = request.input.boundaryTolerance,
): ContainmentComparison {
  const candidateById = new Map(candidate.result.samples.map((sample) => [sample.sampleId, sample]));
  const discreteMismatchSampleIds: string[] = [];
  const missingSampleIds: string[] = [];
  let maximumAbsoluteMarginDelta = 0;
  for (const expected of reference.result.samples) {
    const actual = candidateById.get(expected.sampleId);
    if (!actual) {
      missingSampleIds.push(expected.sampleId);
      continue;
    }
    if (actual.edgeId !== expected.edgeId || actual.classification !== expected.classification) {
      discreteMismatchSampleIds.push(expected.sampleId);
    }
    maximumAbsoluteMarginDelta = Math.max(
      maximumAbsoluteMarginDelta,
      Math.abs(actual.radiusAdjustedMargin - expected.radiusAdjustedMargin),
    );
    candidateById.delete(expected.sampleId);
  }
  missingSampleIds.push(...candidateById.keys());
  return {
    matched: discreteMismatchSampleIds.length === 0
      && missingSampleIds.length === 0
      && Number.isFinite(maximumAbsoluteMarginDelta)
      && maximumAbsoluteMarginDelta <= marginTolerance,
    discreteMismatchSampleIds,
    missingSampleIds,
    maximumAbsoluteMarginDelta,
    marginTolerance,
  };
}

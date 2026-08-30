import { fieldSdf } from "../../../cloud-sculpt/field.ts";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  GEOMETRY_JOB_RESULT_CONTRACT,
  GEOMETRY_PROTOCOL,
  type ContainmentClassification,
  type EvaluateContainmentJobRequest,
  type EvaluateContainmentJobResult,
  type EvaluateContainmentPayload,
  validateEvaluateContainmentJobRequest,
} from "./contracts.ts";

export function evaluateContainmentOnWeb(
  requestValue: EvaluateContainmentJobRequest,
): EvaluateContainmentJobResult {
  const request = validateEvaluateContainmentJobRequest(requestValue);
  const { base, boundaryTolerance, samples } = request.input;
  const results = samples.map((sample) => {
    const baseSignedDistance = fieldSdf(
      base.balls,
      base.smoothness,
      sample.position.x,
      sample.position.y,
      sample.position.z,
    );
    const radiusAdjustedMargin = baseSignedDistance + sample.radius;
    const classification: ContainmentClassification = !Number.isFinite(radiusAdjustedMargin)
      ? "unknown"
      : radiusAdjustedMargin > boundaryTolerance
        ? "outside"
        : radiusAdjustedMargin < -boundaryTolerance
          ? "inside"
          : "boundary";
    return {
      sampleId: sample.sampleId,
      edgeId: sample.edgeId,
      baseSignedDistance,
      radiusAdjustedMargin,
      radiusClearance: -radiusAdjustedMargin,
      classification,
    };
  });

  const outside = results.filter((sample) => sample.classification === "outside");
  const unknown = results.filter((sample) => sample.classification === "unknown");
  const maximumExcess = results.length === 0
    ? 0
    : Math.max(...results.map((sample) => sample.radiusAdjustedMargin));
  const minimumClearance = results.length === 0
    ? 0
    : Math.min(...results.map((sample) => sample.radiusClearance));
  const payload: EvaluateContainmentPayload = {
    samples: results,
    summary: {
      contained: outside.length === 0 && unknown.length === 0,
      checkedSampleCount: results.length,
      outsideSampleIds: outside.map((sample) => sample.sampleId),
      outsideEdgeIds: [...new Set(outside.map((sample) => sample.edgeId))],
      maximumExcess,
      maximumExcessMm: maximumExcess / request.coordinateContract.unitsPerMillimeter,
      minimumClearance,
    },
  };

  return {
    contract: GEOMETRY_JOB_RESULT_CONTRACT,
    protocol: GEOMETRY_PROTOCOL,
    status: "completed",
    shadow: true,
    productionApplied: false,
    jobId: `web-shadow:${request.clientRequestId}`,
    clientRequestId: request.clientRequestId,
    operation: "evaluateContainment",
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    projectFingerprint: request.projectFingerprint,
    backend: {
      backendId: "katachi-web-reference",
      backendKind: "web",
      engineVersion: "prototype-1",
      deviceName: null,
      precisionMode: "float64",
    },
    warnings: [{
      code: "shadow_only",
      detail: "Containment facts are observational and are not connected to production geometry.",
    }],
    result: payload,
  };
}

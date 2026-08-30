import type {
  EvaluateContainmentJobRequest,
  EvaluateContainmentJobResult,
} from "./contracts.ts";
import {
  compareContainmentResults,
  type ContainmentComparison,
} from "./resultComparison.ts";
import { evaluateContainmentOnWeb } from "./webGeometryEngine.ts";
import { WindowsLocalGeometryEngineClient } from "./windowsLocalClient.ts";

export type ShadowCandidateStatus =
  | "not_requested"
  | "helper_unavailable"
  | "cuda_unavailable"
  | "candidate_failed"
  | "candidate_mismatched"
  | "candidate_matched";

export interface ShadowEvaluateContainmentOutcome {
  /** This is always the current Web reference in the prototype. */
  authoritative: EvaluateContainmentJobResult;
  candidate?: EvaluateContainmentJobResult;
  comparison?: ContainmentComparison;
  candidateStatus: ShadowCandidateStatus;
  fallback?: { code: string; detail: string };
  shadowOnly: true;
  productionApplied: false;
}

export interface ShadowEvaluateContainmentOptions {
  preferWindowsCuda?: boolean;
  localClient?: WindowsLocalGeometryEngineClient;
  comparisonMarginTolerance?: number;
}

export async function evaluateContainmentShadow(
  request: EvaluateContainmentJobRequest,
  options: ShadowEvaluateContainmentOptions = {},
): Promise<ShadowEvaluateContainmentOutcome> {
  const authoritative = evaluateContainmentOnWeb(request);
  if (options.preferWindowsCuda !== true) {
    return {
      authoritative,
      candidateStatus: "not_requested",
      shadowOnly: true,
      productionApplied: false,
    };
  }

  const localClient = options.localClient ?? new WindowsLocalGeometryEngineClient();
  const probe = await localClient.probeCapabilities();
  if (!probe.available) {
    return {
      authoritative,
      candidateStatus: "helper_unavailable",
      fallback: { code: probe.code, detail: probe.detail },
      shadowOnly: true,
      productionApplied: false,
    };
  }
  if (!localClient.supportsCudaContainment(probe.capabilities)) {
    const cuda = probe.capabilities.backends.find((backend) => backend.kind === "cuda");
    return {
      authoritative,
      candidateStatus: "cuda_unavailable",
      fallback: {
        code: cuda?.reasonCode ?? "cuda_containment_not_advertised",
        detail: "The helper does not advertise a compatible available CUDA containment backend.",
      },
      shadowOnly: true,
      productionApplied: false,
    };
  }

  try {
    const candidate = await localClient.evaluateContainment(request);
    const comparison = compareContainmentResults(
      request,
      authoritative,
      candidate,
      options.comparisonMarginTolerance,
    );
    return {
      authoritative,
      candidate,
      comparison,
      candidateStatus: comparison.matched ? "candidate_matched" : "candidate_mismatched",
      fallback: comparison.matched ? undefined : {
        code: "candidate_comparison_failed",
        detail: "CUDA candidate facts did not match the frozen Web reference within tolerance.",
      },
      shadowOnly: true,
      productionApplied: false,
    };
  } catch (error) {
    return {
      authoritative,
      candidateStatus: "candidate_failed",
      fallback: {
        code: "local_job_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      shadowOnly: true,
      productionApplied: false,
    };
  }
}

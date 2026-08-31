import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_CUDA_EXECUTABLE_SHA256,
  GEOMETRY_ENGINE_API_BASE,
  GEOMETRY_JOB_ACCEPTED_CONTRACT,
  GEOMETRY_JOB_STATUS_CONTRACT,
  GEOMETRY_PROTOCOL,
  GeometryContractError,
  type EvaluateContainmentJobRequest,
  type EvaluateContainmentJobResult,
  type GeometryEngineCapabilities,
  type GeometryJobAccepted,
  type GeometryJobStatus,
  validateEvaluateContainmentJobRequest,
  validateEvaluateContainmentJobResult,
  validateGeometryEngineCapabilities,
} from "./contracts.ts";

export type LocalProbeFailureCode =
  | "helper_unreachable"
  | "access_denied_or_cors"
  | "incompatible_protocol"
  | "invalid_capabilities";

export type LocalCapabilityProbe =
  | { available: true; capabilities: GeometryEngineCapabilities }
  | { available: false; code: LocalProbeFailureCode; detail: string };

export class WindowsLocalGeometryEngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WindowsLocalGeometryEngineError";
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface WindowsLocalGeometryEngineClientOptions {
  fetch?: FetchLike;
  probeTimeoutMs?: number;
  jobTimeoutMs?: number;
  pollIntervalMs?: number;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function responseJson(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new WindowsLocalGeometryEngineError("invalid_json", `${label} did not return JSON`);
  }
}

export class WindowsLocalGeometryEngineClient {
  private readonly fetch: FetchLike;
  private readonly probeTimeoutMs: number;
  private readonly jobTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(options: WindowsLocalGeometryEngineClientOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.probeTimeoutMs = options.probeTimeoutMs ?? 1_200;
    this.jobTimeoutMs = options.jobTimeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 40;
  }

  async probeCapabilities(): Promise<LocalCapabilityProbe> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.probeTimeoutMs);
    try {
      const response = await this.fetch(`${GEOMETRY_ENGINE_API_BASE}/capabilities`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          available: false,
          code: response.status === 401 || response.status === 403
            ? "access_denied_or_cors"
            : "helper_unreachable",
          detail: `capability probe returned HTTP ${response.status}`,
        };
      }
      let capabilities: GeometryEngineCapabilities;
      try {
        capabilities = validateGeometryEngineCapabilities(await responseJson(response, "capability probe"));
      } catch (error) {
        return {
          available: false,
          code: "invalid_capabilities",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
      if (capabilities.protocol.major !== GEOMETRY_PROTOCOL.major) {
        return {
          available: false,
          code: "incompatible_protocol",
          detail: `helper protocol ${capabilities.protocol.major}.${capabilities.protocol.minor} is incompatible with client major ${GEOMETRY_PROTOCOL.major}`,
        };
      }
      return { available: true, capabilities };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { available: false, code: "helper_unreachable", detail };
    } finally {
      clearTimeout(timeout);
    }
  }

  async evaluateContainment(
    requestValue: EvaluateContainmentJobRequest,
  ): Promise<EvaluateContainmentJobResult> {
    const request = validateEvaluateContainmentJobRequest(requestValue);
    const response = await this.fetch(`${GEOMETRY_ENGINE_API_BASE}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Katachi-Geometry-Prototype": "shadow-only-v1",
      },
      body: JSON.stringify(request),
    });
    if (response.status !== 202) {
      throw new WindowsLocalGeometryEngineError(
        "job_rejected",
        `local helper rejected the shadow job with HTTP ${response.status}`,
      );
    }
    const acceptedValue = await responseJson(response, "job submission");
    const acceptedRecord = typeof acceptedValue === "object" && acceptedValue !== null
      ? acceptedValue as Partial<GeometryJobAccepted>
      : {};
    if (acceptedRecord.contract !== GEOMETRY_JOB_ACCEPTED_CONTRACT
      || acceptedRecord.status !== "queued"
      || typeof acceptedRecord.jobId !== "string"
      || acceptedRecord.clientRequestId !== request.clientRequestId) {
      throw new WindowsLocalGeometryEngineError("invalid_job_acceptance", "helper returned an invalid job acceptance");
    }

    const deadline = Date.now() + this.jobTimeoutMs;
    while (Date.now() <= deadline) {
      const statusResponse = await this.fetch(
        `${GEOMETRY_ENGINE_API_BASE}/jobs/${encodeURIComponent(acceptedRecord.jobId)}`,
        { method: "GET", cache: "no-store" },
      );
      if (!statusResponse.ok) {
        throw new WindowsLocalGeometryEngineError(
          "job_status_failed",
          `local helper job status returned HTTP ${statusResponse.status}`,
        );
      }
      const statusValue = await responseJson(statusResponse, "job status");
      const status = typeof statusValue === "object" && statusValue !== null
        ? statusValue as GeometryJobStatus
        : null;
      if (!status || status.contract !== GEOMETRY_JOB_STATUS_CONTRACT
        || status.jobId !== acceptedRecord.jobId
        || status.clientRequestId !== request.clientRequestId) {
        throw new WindowsLocalGeometryEngineError("invalid_job_status", "helper returned an invalid job status");
      }
      if (status.status === "completed") {
        if (!status.result) throw new GeometryContractError("completed local job omitted its result");
        const result = validateEvaluateContainmentJobResult(status.result, request);
        await this.releaseTerminalJob(acceptedRecord.jobId);
        return result;
      }
      if (status.status === "failed" || status.status === "canceled") {
        await this.releaseTerminalJob(acceptedRecord.jobId);
        throw new WindowsLocalGeometryEngineError(
          status.error?.code ?? status.status,
          status.error?.detail ?? `local helper job ${status.status}`,
        );
      }
      await wait(this.pollIntervalMs);
    }
    try {
      await this.fetch(
        `${GEOMETRY_ENGINE_API_BASE}/jobs/${encodeURIComponent(acceptedRecord.jobId)}`,
        { method: "DELETE" },
      );
    } catch {
      // Best-effort semantic cancellation. The timeout still falls back to Web.
    }
    throw new WindowsLocalGeometryEngineError("job_timeout", "local shadow containment job timed out");
  }

  supportsCudaContainment(capabilities: GeometryEngineCapabilities): boolean {
    const cudaBackendIds = new Set(capabilities.backends
      .filter((backend) => backend.kind === "cuda"
        && backend.status === "available"
        && backend.deviceName === EXPECTED_CUDA_DEVICE_NAME
        && backend.artifactSha256 === EXPECTED_CUDA_EXECUTABLE_SHA256
        && backend.precisionModes.includes("float32"))
      .map((backend) => backend.backendId));
    return capabilities.operations.some((operation) =>
      operation.operation === "evaluateContainment"
      && operation.algorithmContracts.includes(EVALUATE_CONTAINMENT_ALGORITHM)
      && operation.backendIds.some((backendId) => cudaBackendIds.has(backendId)));
  }

  private async releaseTerminalJob(jobId: string): Promise<void> {
    try {
      await this.fetch(
        `${GEOMETRY_ENGINE_API_BASE}/jobs/${encodeURIComponent(jobId)}`,
        { method: "DELETE", cache: "no-store" },
      );
    } catch {
      // The result is already validated. Cleanup is best effort and cannot make
      // a CUDA candidate authoritative or alter the Web fallback.
    }
  }
}

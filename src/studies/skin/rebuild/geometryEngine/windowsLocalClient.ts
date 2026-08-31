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
import {
  BROWSER_HELPER_BINARY_MEDIA_TYPE,
  BROWSER_HELPER_BINARY_ROUTE,
  decodeBrowserBinaryResponse,
  encodeBrowserBinaryRequest,
} from "./browserBinaryTransport.ts";

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
  transport?: "auto" | "json" | "binary";
}

export interface LocalGeometryTransportTiming {
  transport: "json" | "binary";
  requestEncodingMilliseconds: number;
  httpRoundTripMilliseconds: number;
  helperDecodeMilliseconds?: number;
  workerRoundTripMilliseconds?: number;
  workerTotalMilliseconds?: number;
  helperResponseEncodeMilliseconds?: number;
  responseDecodeMilliseconds: number;
  semanticValidationMilliseconds: number;
  totalMilliseconds: number;
  requestBytes: number;
  responseBytes: number;
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
  private readonly transport: "auto" | "json" | "binary";
  private lastCapabilities: GeometryEngineCapabilities | null = null;
  private lastTransportTiming: LocalGeometryTransportTiming | null = null;

  constructor(options: WindowsLocalGeometryEngineClientOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.probeTimeoutMs = options.probeTimeoutMs ?? 1_200;
    this.jobTimeoutMs = options.jobTimeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 40;
    this.transport = options.transport ?? "auto";
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
      this.lastCapabilities = capabilities;
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
    if (this.transport === "binary"
      || (this.transport === "auto" && this.supportsBrowserBinary(this.lastCapabilities))) {
      return this.evaluateContainmentBinary(request);
    }
    return this.evaluateContainmentJson(request);
  }

  getLastTransportTiming(): LocalGeometryTransportTiming | null {
    return this.lastTransportTiming ? { ...this.lastTransportTiming } : null;
  }

  private async evaluateContainmentJson(
    request: EvaluateContainmentJobRequest,
  ): Promise<EvaluateContainmentJobResult> {
    const totalStart = performance.now();
    const encodeStart = performance.now();
    const requestBody = JSON.stringify(request);
    const requestEncodingMilliseconds = performance.now() - encodeStart;
    const httpStart = performance.now();
    let responseDecodeMilliseconds = 0;
    let responseBytes = 0;
    let helperResponseEncodeMilliseconds = 0;
    let helperDecodeMilliseconds: number | undefined;
    const response = await this.fetch(`${GEOMETRY_ENGINE_API_BASE}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Katachi-Geometry-Prototype": "shadow-only-v1",
      },
      body: requestBody,
    });
    if (response.status !== 202) {
      throw new WindowsLocalGeometryEngineError(
        "job_rejected",
        `local helper rejected the shadow job with HTTP ${response.status}`,
      );
    }
    responseBytes += Number(response.headers.get("x-katachi-response-bytes") ?? 0) || 0;
    helperResponseEncodeMilliseconds += Number(
      response.headers.get("x-katachi-helper-response-encode-ms") ?? 0,
    ) || 0;
    const acceptanceDecodeStart = performance.now();
    const acceptedValue = await responseJson(response, "job submission");
    responseDecodeMilliseconds += performance.now() - acceptanceDecodeStart;
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
      responseBytes += Number(statusResponse.headers.get("x-katachi-response-bytes") ?? 0) || 0;
      helperResponseEncodeMilliseconds += Number(
        statusResponse.headers.get("x-katachi-helper-response-encode-ms") ?? 0,
      ) || 0;
      const helperDecodeHeader = Number(statusResponse.headers.get("x-katachi-helper-decode-ms"));
      if (Number.isFinite(helperDecodeHeader) && helperDecodeHeader >= 0) {
        helperDecodeMilliseconds = helperDecodeHeader;
      }
      const statusDecodeStart = performance.now();
      const statusValue = await responseJson(statusResponse, "job status");
      responseDecodeMilliseconds += performance.now() - statusDecodeStart;
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
        const validationStart = performance.now();
        const result = validateEvaluateContainmentJobResult(status.result, request);
        const semanticValidationMilliseconds = performance.now() - validationStart;
        const adapterTiming = (result.backend as typeof result.backend & {
          adapterTiming?: {
            totalMilliseconds?: number;
            workerRoundTripMilliseconds?: number;
          };
        }).adapterTiming;
        await this.releaseTerminalJob(acceptedRecord.jobId);
        this.lastTransportTiming = {
          transport: "json",
          requestEncodingMilliseconds,
          httpRoundTripMilliseconds: performance.now() - httpStart,
          helperDecodeMilliseconds,
          workerRoundTripMilliseconds: adapterTiming?.workerRoundTripMilliseconds,
          workerTotalMilliseconds: adapterTiming?.totalMilliseconds,
          helperResponseEncodeMilliseconds,
          responseDecodeMilliseconds,
          semanticValidationMilliseconds,
          totalMilliseconds: performance.now() - totalStart,
          requestBytes: new TextEncoder().encode(requestBody).byteLength,
          responseBytes,
        };
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

  private async evaluateContainmentBinary(
    request: EvaluateContainmentJobRequest,
  ): Promise<EvaluateContainmentJobResult> {
    const totalStart = performance.now();
    const encoded = await encodeBrowserBinaryRequest(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.jobTimeoutMs);
    const httpStart = performance.now();
    let response: Response;
    try {
      response = await this.fetch(`${GEOMETRY_ENGINE_API_BASE}${BROWSER_HELPER_BINARY_ROUTE}`, {
        method: "POST",
        headers: {
          "Content-Type": BROWSER_HELPER_BINARY_MEDIA_TYPE,
          "X-Katachi-Geometry-Prototype": "shadow-only-v1",
          "X-Katachi-Client-Request-Id": request.clientRequestId,
          "X-Katachi-Project-Fingerprint": request.projectFingerprint,
          "X-Katachi-Algorithm-Contract": request.algorithmContract,
        },
        body: encoded.payload.slice().buffer as ArrayBuffer,
        signal: controller.signal,
      });
    } catch (error) {
      throw new WindowsLocalGeometryEngineError(
        error instanceof DOMException && error.name === "AbortError" ? "job_timeout" : "binary_job_failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timeout);
    }
    const httpRoundTripMilliseconds = performance.now() - httpStart;
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new WindowsLocalGeometryEngineError(
        "job_rejected",
        `local helper rejected the binary shadow job with HTTP ${response.status}${detail ? `: ${detail.slice(0, 512)}` : ""}`,
      );
    }
    if (response.headers.get("content-type")?.split(";", 1)[0].toLowerCase()
      !== BROWSER_HELPER_BINARY_MEDIA_TYPE) {
      throw new WindowsLocalGeometryEngineError("invalid_binary_response", "helper returned an unexpected binary content type");
    }
    const jobId = response.headers.get("x-katachi-job-id");
    const engineVersion = response.headers.get("x-katachi-cuda-engine-version");
    const artifactSha256 = response.headers.get("x-katachi-artifact-sha256");
    if (!jobId || !engineVersion || artifactSha256 !== EXPECTED_CUDA_EXECUTABLE_SHA256
      || response.headers.get("x-katachi-shadow") !== "true"
      || response.headers.get("x-katachi-production-applied") !== "false") {
      throw new WindowsLocalGeometryEngineError("invalid_binary_identity", "helper binary response omitted required shadow identity");
    }
    const payload = await response.arrayBuffer();
    const decoded = decodeBrowserBinaryResponse(payload, request, encoded.identityFingerprint, {
      jobId,
      engineVersion,
      artifactSha256,
    });
    const validationStart = performance.now();
    const result = validateEvaluateContainmentJobResult(decoded.result, request);
    const semanticValidationMilliseconds = performance.now() - validationStart;
    const numberHeader = (name: string): number | undefined => {
      const value = response.headers.get(name);
      if (value === null) return undefined;
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : undefined;
    };
    this.lastTransportTiming = {
      transport: "binary",
      requestEncodingMilliseconds: encoded.timing.totalMilliseconds,
      httpRoundTripMilliseconds,
      helperDecodeMilliseconds: numberHeader("x-katachi-helper-decode-ms"),
      workerRoundTripMilliseconds: numberHeader("x-katachi-worker-roundtrip-ms"),
      workerTotalMilliseconds: numberHeader("x-katachi-worker-total-ms"),
      helperResponseEncodeMilliseconds: numberHeader("x-katachi-helper-response-encode-ms"),
      responseDecodeMilliseconds: decoded.timing.totalMilliseconds,
      semanticValidationMilliseconds,
      totalMilliseconds: performance.now() - totalStart,
      requestBytes: encoded.payload.byteLength,
      responseBytes: payload.byteLength,
    };
    return result;
  }

  private supportsBrowserBinary(capabilities: GeometryEngineCapabilities | null): boolean {
    if (!capabilities) return false;
    const policy = capabilities.policy as GeometryEngineCapabilities["policy"] & {
      browserHelperTransports?: string[];
    };
    return Array.isArray(policy.browserHelperTransports)
      && policy.browserHelperTransports.includes(BROWSER_HELPER_BINARY_MEDIA_TYPE);
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

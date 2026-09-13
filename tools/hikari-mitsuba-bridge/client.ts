export const HIKARI_MITSUBA_BRIDGE_URL = "http://127.0.0.1:47659";
export const HIKARI_MITSUBA_OPERATION = "hikari.mitsuba.render.v1";
export const HIKARI_MITSUBA_SCHEMA = "hikari-mitsuba-bridge.v1";
const MAX_REQUEST_BYTES = 8_000_000;
const MAX_ARTIFACT_BYTES = 8_000_000;
const SHA256 = /^[0-9a-f]{64}$/;

export type RenderPurpose = "body" | "receiver";
export type ComputeDevice = "cuda" | "cpu";

export interface HikariMitsubaRequest {
  requestId: string;
  operation: typeof HIKARI_MITSUBA_OPERATION;
  case: { id: string; label?: string };
  provenance: {
    repository: string;
    sourceCommit: string;
    sourceRef: string;
    shapeSource: string;
    fingerprint: string;
  };
  canonicalMesh: { format: "obj"; dataBase64: string; byteLength: number; sha256: string };
  physicalScale: { mmPerShapeUnit: number; source: "assumed" | "derived-from-mesh" | "author" };
  camera: {
    positionMm: Vec3;
    targetMm: Vec3;
    up: Vec3;
    fovDeg: number;
    aspect: number;
  };
  hostMaterial: { id: string; ior: number; absorptionPerMm: Rgb; roughness: number };
  light: { directionPropagation: Vec3; radiance: Rgb; angularDiameterDeg: number };
  receiver: { positionMm: Vec3; normal: Vec3; extentMm: { x: number; z: number }; reflectance: number };
  environment: { radiance: Rgb };
  renderPurpose: RenderPurpose;
  compute: { device: ComputeDevice };
  spp: number;
  resolution: { width: number; height: number };
}

export interface Vec3 { x: number; y: number; z: number }
export interface Rgb { r: number; g: number; b: number }

export interface HikariMitsubaCapabilities {
  schemaVersion: string;
  service: string;
  bindAddress: "127.0.0.1";
  port: 47659;
  mitsuba: { available: boolean; version: string | null };
  drjit: { available: boolean; version: string | null };
  pythonVersion: string;
  variants: string[];
  selectedVariant: string | null;
  cudaAvailable: boolean;
  gpu: { available: boolean; name: string; memoryMiB: number | null; computeCapability: string } | null;
  workerReady: boolean;
  supportedOperations: string[];
  supportedDevices: ComputeDevice[];
  optix: "unknown";
  artifactTransport: string;
  cancellation: string;
}

export interface HikariMitsubaRenderMetadata {
  requestId: string;
  success: true;
  operation: typeof HIKARI_MITSUBA_OPERATION;
  selectedVariant: string;
  gpu: HikariMitsubaCapabilities["gpu"];
  executionDevice: ComputeDevice;
  cudaFallback: false;
  purpose: RenderPurpose;
  resolution: { width: number; height: number };
  spp: number;
  renderMs: number;
  artifactHash: string;
  artifactByteLength: number;
  artifactUrl: string;
  provenanceHash: string;
  provenanceFingerprint: string;
  warnings: string[];
}

export interface HikariMitsubaRenderResult {
  metadata: HikariMitsubaRenderMetadata;
  artifact: Uint8Array;
}

export interface HikariMitsubaClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class HikariMitsubaBridgeError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "HikariMitsubaBridgeError";
    this.code = code;
    this.status = status;
  }
}

export function parseCapabilities(value: unknown): HikariMitsubaCapabilities {
  const object = asObject(value, "capabilities");
  requireExactKeys(object, [
    "schemaVersion", "service", "bindAddress", "port", "mitsuba", "drjit", "pythonVersion",
    "variants", "selectedVariant", "cudaAvailable", "gpu", "workerReady", "supportedOperations",
    "supportedDevices", "optix", "artifactTransport", "cancellation",
  ], "capabilities");
  if (object.schemaVersion !== HIKARI_MITSUBA_SCHEMA || object.service !== "hikari-mitsuba-local-bridge") {
    throw new HikariMitsubaBridgeError("unsupported_service", "response is not the Hikari Mitsuba bridge");
  }
  if (object.bindAddress !== "127.0.0.1" || object.port !== 47659 || object.optix !== "unknown") {
    throw new HikariMitsubaBridgeError("invalid_capabilities", "bridge capabilities violate the fixed local contract");
  }
  const variants = asStringArray(object.variants, "capabilities.variants");
  const supportedOperations = asStringArray(object.supportedOperations, "capabilities.supportedOperations");
  const supportedDevices = asStringArray(object.supportedDevices, "capabilities.supportedDevices")
    .filter((device): device is ComputeDevice => device === "cuda" || device === "cpu");
  if (!supportedOperations.includes(HIKARI_MITSUBA_OPERATION)) {
    throw new HikariMitsubaBridgeError("unsupported_operation", "bridge did not advertise the fixed render operation");
  }
  if (typeof object.cudaAvailable !== "boolean" || typeof object.workerReady !== "boolean") {
    throw new HikariMitsubaBridgeError("invalid_capabilities", "capability readiness fields are invalid");
  }
  const mitsuba = asObject(object.mitsuba, "capabilities.mitsuba");
  const drjit = asObject(object.drjit, "capabilities.drjit");
  if (typeof mitsuba.available !== "boolean" || !isNullableString(mitsuba.version)) {
    throw new HikariMitsubaBridgeError("invalid_capabilities", "Mitsuba capability is malformed");
  }
  if (typeof drjit.available !== "boolean" || !isNullableString(drjit.version)) {
    throw new HikariMitsubaBridgeError("invalid_capabilities", "Dr.Jit capability is malformed");
  }
  if (typeof object.pythonVersion !== "string" || typeof object.artifactTransport !== "string" || typeof object.cancellation !== "string") {
    throw new HikariMitsubaBridgeError("invalid_capabilities", "capability metadata is malformed");
  }
  const gpu = object.gpu === null ? null : parseGpu(object.gpu);
  const selectedVariant = object.selectedVariant === null ? null : asString(object.selectedVariant, "selectedVariant");
  return {
    schemaVersion: object.schemaVersion,
    service: object.service,
    bindAddress: "127.0.0.1",
    port: 47659,
    mitsuba: { available: mitsuba.available, version: mitsuba.version },
    drjit: { available: drjit.available, version: drjit.version },
    pythonVersion: object.pythonVersion,
    variants,
    selectedVariant,
    cudaAvailable: object.cudaAvailable,
    gpu,
    workerReady: object.workerReady,
    supportedOperations,
    supportedDevices,
    optix: "unknown",
    artifactTransport: object.artifactTransport,
    cancellation: object.cancellation,
  };
}

export function validateRenderRequest(request: HikariMitsubaRequest): void {
  if (!isRecord(request)) throw new HikariMitsubaBridgeError("invalid_request", "render request must be an object");
  rejectForbiddenKeys(request as unknown as Record<string, unknown>);
  requireExactKeys(request as unknown as Record<string, unknown>, [
    "requestId", "operation", "case", "provenance", "canonicalMesh", "physicalScale", "camera",
    "hostMaterial", "light", "receiver", "environment", "renderPurpose", "compute", "spp", "resolution",
  ], "request");
  if (typeof request.requestId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(request.requestId)) {
    throw new HikariMitsubaBridgeError("invalid_request", "requestId is invalid");
  }
  if (request.operation !== HIKARI_MITSUBA_OPERATION) {
    throw new HikariMitsubaBridgeError("unsupported_operation", "only hikari.mitsuba.render.v1 is accepted");
  }
  if (!isRecord(request.provenance)) {
    throw new HikariMitsubaBridgeError("invalid_request", "provenance must be an object");
  }
  const encoded = request.canonicalMesh?.dataBase64;
  if (request.canonicalMesh?.format !== "obj" || typeof encoded !== "string" || encoded.length > 5_500_000) {
    throw new HikariMitsubaBridgeError("invalid_request", "canonicalMesh is invalid or too large");
  }
  if (!Number.isInteger(request.canonicalMesh.byteLength) || request.canonicalMesh.byteLength < 1 || request.canonicalMesh.byteLength > 4_000_000 || !SHA256.test(request.canonicalMesh.sha256)) {
    throw new HikariMitsubaBridgeError("invalid_request", "canonicalMesh metadata is invalid");
  }
  if (!SHA256.test(request.provenance.fingerprint)) {
    throw new HikariMitsubaBridgeError("invalid_request", "provenance fingerprint is invalid");
  }
  const serializedLength = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  if (serializedLength > MAX_REQUEST_BYTES) {
    throw new HikariMitsubaBridgeError("request_too_large", "render request exceeds the bridge limit");
  }
}

export class HikariMitsubaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HikariMitsubaClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? HIKARI_MITSUBA_BRIDGE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async capabilities(signal?: AbortSignal): Promise<HikariMitsubaCapabilities> {
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/v1/capabilities`, { method: "GET" }, signal);
    } catch (error) {
      if (error instanceof HikariMitsubaBridgeError) throw error;
      throw new HikariMitsubaBridgeError("offline", "Hikari Mitsuba bridge is offline or unreachable");
    }
    const value = await readJson(response);
    if (!response.ok) throw bridgeErrorFrom(value, response.status, "capabilities_failed");
    try {
      return parseCapabilities(value);
    } catch (error) {
      throw error instanceof HikariMitsubaBridgeError
        ? error
        : new HikariMitsubaBridgeError("invalid_capabilities", "capabilities response is malformed");
    }
  }

  async render(request: HikariMitsubaRequest, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<HikariMitsubaRenderResult> {
    validateRenderRequest(request);
    let response: Response;
    try {
      response = await this.request(
        `${this.baseUrl}/v1/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
        options.signal,
        options.timeoutMs,
      );
    } catch (error) {
      if (options.signal?.aborted || (error instanceof HikariMitsubaBridgeError && error.code === "timeout")) {
        await this.cancel(request.requestId, request.provenance.fingerprint).catch(() => undefined);
      }
      if (error instanceof HikariMitsubaBridgeError) throw error;
      throw new HikariMitsubaBridgeError("offline", "Hikari Mitsuba bridge is offline or unreachable");
    }
    const value = await readJson(response);
    if (!response.ok) throw bridgeErrorFrom(value, response.status, "render_failed");
    const metadata = parseRenderMetadata(value, request);
    const artifactUrl = new URL(metadata.artifactUrl, `${this.baseUrl}/`).toString();
    let artifactResponse: Response;
    try {
      artifactResponse = await this.request(
        artifactUrl,
        {
          method: "GET",
          headers: { "X-Hikari-Provenance-Fingerprint": request.provenance.fingerprint },
        },
        options.signal,
        options.timeoutMs,
      );
    } catch (error) {
      if (options.signal?.aborted || (error instanceof HikariMitsubaBridgeError && error.code === "timeout")) {
        await this.cancel(request.requestId, request.provenance.fingerprint).catch(() => undefined);
      }
      throw error instanceof HikariMitsubaBridgeError
        ? error
        : new HikariMitsubaBridgeError("offline", "Hikari Mitsuba artifact endpoint is offline");
    }
    if (!artifactResponse.ok) throw bridgeErrorFrom(await readJson(artifactResponse), artifactResponse.status, "artifact_failed");
    const artifact = new Uint8Array(await artifactResponse.arrayBuffer());
    if (artifact.byteLength > MAX_ARTIFACT_BYTES || artifact.byteLength !== metadata.artifactByteLength) {
      throw new HikariMitsubaBridgeError("invalid_artifact", "artifact size does not match metadata");
    }
    if (!artifactResponse.headers.get("content-type")?.toLowerCase().startsWith("image/png")) {
      throw new HikariMitsubaBridgeError("invalid_artifact", "bridge artifact is not PNG");
    }
    const actualHash = await sha256Hex(artifact);
    if (actualHash !== metadata.artifactHash) {
      throw new HikariMitsubaBridgeError("invalid_artifact", "artifact hash does not match metadata");
    }
    if (options.signal?.aborted) {
      await this.cancel(request.requestId, request.provenance.fingerprint).catch(() => undefined);
      throw abortError();
    }
    return { metadata, artifact };
  }

  async cancel(requestId: string, provenanceFingerprint: string): Promise<{ cancelled: boolean; status: string }> {
    const response = await this.request(`${this.baseUrl}/v1/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, provenanceFingerprint }),
    }, undefined, Math.min(this.timeoutMs, 5_000));
    const value = await readJson(response);
    if (!response.ok) throw bridgeErrorFrom(value, response.status, "cancel_failed");
    const object = asObject(value, "cancel response");
    if (typeof object.cancelled !== "boolean" || typeof object.status !== "string") {
      throw new HikariMitsubaBridgeError("invalid_response", "cancel response is malformed");
    }
    return { cancelled: object.cancelled, status: object.status };
  }

  private async request(url: string, init: RequestInit, signal?: AbortSignal, timeoutMs = this.timeoutMs): Promise<Response> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    let timedOut = false;
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut) throw new HikariMitsubaBridgeError("timeout", "Hikari Mitsuba bridge request timed out");
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

function parseRenderMetadata(value: unknown, request: HikariMitsubaRequest): HikariMitsubaRenderMetadata {
  const object = asObject(value, "render response");
  const required = [
    "requestId", "success", "operation", "selectedVariant", "gpu", "executionDevice", "cudaFallback", "purpose",
    "resolution", "spp", "renderMs", "artifactHash", "artifactByteLength", "artifactUrl", "provenanceHash",
    "provenanceFingerprint", "warnings",
  ];
  requireExactKeys(object, required, "render response");
  if (object.success !== true || object.requestId !== request.requestId || object.operation !== HIKARI_MITSUBA_OPERATION) {
    throw new HikariMitsubaBridgeError("stale_result", "render response does not match the request");
  }
  if (object.provenanceFingerprint !== request.provenance.fingerprint || !SHA256.test(asString(object.provenanceHash, "provenanceHash"))) {
    throw new HikariMitsubaBridgeError("stale_result", "render response provenance does not match the request");
  }
  if (
    object.cudaFallback !== false
    || object.purpose !== request.renderPurpose
    || object.executionDevice !== request.compute.device
    || (request.compute.device === "cuda" && object.selectedVariant !== "cuda_ad_rgb")
    || (request.compute.device === "cpu" && object.selectedVariant !== "scalar_rgb")
  ) {
    throw new HikariMitsubaBridgeError("device_mismatch", "render did not use the requested device contract");
  }
  const resolution = asObject(object.resolution, "resolution");
  const width = integer(resolution.width, "resolution.width");
  const height = integer(resolution.height, "resolution.height");
  const gpu = object.gpu === null ? null : parseGpu(object.gpu);
  const warnings = asStringArray(object.warnings, "warnings");
  const artifactHash = asString(object.artifactHash, "artifactHash");
  const artifactByteLength = integer(object.artifactByteLength, "artifactByteLength");
  if (!SHA256.test(artifactHash) || artifactByteLength < 1 || artifactByteLength > MAX_ARTIFACT_BYTES) {
    throw new HikariMitsubaBridgeError("invalid_response", "artifact metadata is invalid");
  }
  const artifactUrl = asString(object.artifactUrl, "artifactUrl");
  if (!artifactUrl.startsWith("/v1/artifacts/")) throw new HikariMitsubaBridgeError("invalid_response", "artifact URL is not fixed");
  if (object.purpose !== "body" && object.purpose !== "receiver") throw new HikariMitsubaBridgeError("invalid_response", "render purpose is invalid");
  if (width !== request.resolution.width || height !== request.resolution.height || object.spp !== request.spp) {
    throw new HikariMitsubaBridgeError("stale_result", "render dimensions do not match the request");
  }
  if (object.executionDevice !== "cuda" && object.executionDevice !== "cpu") throw new HikariMitsubaBridgeError("invalid_response", "execution device is invalid");
  if (artifactUrl !== `/v1/artifacts/${request.requestId}`) throw new HikariMitsubaBridgeError("invalid_response", "artifact URL does not match the request");
  return {
    requestId: request.requestId,
    success: true,
    operation: HIKARI_MITSUBA_OPERATION,
    selectedVariant: asString(object.selectedVariant, "selectedVariant"),
    gpu,
    executionDevice: object.executionDevice,
    cudaFallback: false,
    purpose: object.purpose,
    resolution: { width, height },
    spp: integer(object.spp, "spp"),
    renderMs: number(object.renderMs, "renderMs"),
    artifactHash,
    artifactByteLength,
    artifactUrl,
    provenanceHash: asString(object.provenanceHash, "provenanceHash"),
    provenanceFingerprint: request.provenance.fingerprint,
    warnings,
  };
}

function parseGpu(value: unknown): NonNullable<HikariMitsubaCapabilities["gpu"]> {
  const gpu = asObject(value, "gpu");
  requireExactKeys(gpu, ["available", "name", "memoryMiB", "computeCapability"], "gpu");
  if (gpu.available !== true || typeof gpu.name !== "string" || !isNullableNumber(gpu.memoryMiB) || typeof gpu.computeCapability !== "string") {
    throw new HikariMitsubaBridgeError("invalid_capabilities", "GPU capability is malformed");
  }
  return { available: true, name: gpu.name, memoryMiB: gpu.memoryMiB, computeCapability: gpu.computeCapability };
}

function rejectForbiddenKeys(value: unknown): void {
  const forbidden = new Set(["command", "code", "executable", "filename", "file", "import", "module", "path", "plugin", "python", "scene", "script", "shell", "url"]);
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenKeys);
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key.toLowerCase())) throw new HikariMitsubaBridgeError("unsupported_field", `${key} is not accepted`);
      rejectForbiddenKeys(child);
    }
  }
}

function requireExactKeys(value: Record<string, unknown>, keys: string[], name: string): void {
  const expected = new Set(keys);
  const actual = new Set(Object.keys(value));
  if (actual.size !== expected.size || [...actual].some((key) => !expected.has(key))) {
    throw new HikariMitsubaBridgeError("invalid_response", `${name} contains unexpected fields`);
  }
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new HikariMitsubaBridgeError("invalid_response", `${name} must be an object`);
  return value;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new HikariMitsubaBridgeError("invalid_response", `${name} must be a string`);
  return value;
}

function asStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new HikariMitsubaBridgeError("invalid_response", `${name} must be a string array`);
  return [...value];
}

function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value)) throw new HikariMitsubaBridgeError("invalid_response", `${name} must be an integer`);
  return value as number;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new HikariMitsubaBridgeError("invalid_response", `${name} must be finite`);
  return value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new HikariMitsubaBridgeError("invalid_response", "bridge returned invalid JSON");
  }
}

function bridgeErrorFrom(value: unknown, status: number, fallbackCode: string): HikariMitsubaBridgeError {
  if (isRecord(value) && isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string") {
    return new HikariMitsubaBridgeError(value.error.code, value.error.message, status);
  }
  return new HikariMitsubaBridgeError(fallbackCode, `bridge request failed with HTTP ${status}`, status);
}

function abortError(): HikariMitsubaBridgeError {
  return new HikariMitsubaBridgeError("cancelled", "Hikari Mitsuba request was cancelled");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new HikariMitsubaBridgeError("crypto_unavailable", "Web Crypto SHA-256 is unavailable");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const GEOMETRY_PROTOCOL = { major: 1, minor: 0 } as const;

export const GEOMETRY_ENGINE_FIXED_ORIGIN = "http://127.0.0.1:47658" as const;
export const GEOMETRY_ENGINE_API_BASE = `${GEOMETRY_ENGINE_FIXED_ORIGIN}/v1` as const;

export const GEOMETRY_CAPABILITIES_CONTRACT =
  "katachi.geometry-engine-capabilities.v1" as const;
export const GEOMETRY_JOB_RESULT_CONTRACT =
  "katachi.geometry-job-result.v1" as const;
export const GEOMETRY_JOB_ACCEPTED_CONTRACT =
  "katachi.geometry-job-accepted.v1" as const;
export const GEOMETRY_JOB_STATUS_CONTRACT =
  "katachi.geometry-job-status.v1" as const;
export const EVALUATE_CONTAINMENT_ALGORITHM =
  "katachi.skin.evaluate-containment.metaball-radius.v1" as const;
export const EXPECTED_CUDA_DEVICE_NAME = "NVIDIA GeForce RTX 3080" as const;
export const EXPECTED_CUDA_EXECUTABLE_SHA256 =
  "0AE5FA195E6FE9FE5831603E3AC075FFBCF1B0F174E3768273EDD578BE516726" as const;

export const GEOMETRY_OPERATIONS = [
  "buildMesh",
  "analyzeSurface",
  "evaluateContainment",
  "importMeshBase",
  "realizeNetwork",
  "realizeJunction",
] as const;

export type GeometryOperation = (typeof GEOMETRY_OPERATIONS)[number];
export type GeometryBackendKind = "web" | "cpu" | "cuda";
export type GeometryPrecisionMode = "float32" | "float64" | "mixed";

export interface GeometryCoordinateContract {
  frame: "object" | "millimeter";
  unitsPerMillimeter: number;
  handedness: "right";
  buildAxis: "+z";
}

export interface GeometryArtifactReference {
  role: string;
  sha256: string;
  mediaType: string;
  byteLength: number;
}

export interface GeometryJobRequest<TInput = Record<string, unknown>> {
  protocol: { major: 1; minor: number };
  clientRequestId: string;
  operation: GeometryOperation;
  algorithmContract: string;
  projectFingerprint: string;
  coordinateContract: GeometryCoordinateContract;
  quality: Record<string, number | string | boolean>;
  input: TInput;
  artifacts: GeometryArtifactReference[];
}

export interface ContainmentBall {
  id: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface ContainmentSample {
  sampleId: string;
  edgeId: string;
  position: { x: number; y: number; z: number };
  radius: number;
}

export interface EvaluateContainmentInput {
  base: {
    kind: "metaball-smooth-union";
    contractVersion: 1;
    balls: ContainmentBall[];
    smoothness: number;
  };
  samples: ContainmentSample[];
  /** Matches the current Web screen: margin > tolerance is outside. */
  boundaryTolerance: number;
}

export type EvaluateContainmentJobRequest = GeometryJobRequest<EvaluateContainmentInput> & {
  operation: "evaluateContainment";
  algorithmContract: typeof EVALUATE_CONTAINMENT_ALGORITHM;
};

export type ContainmentClassification = "inside" | "outside" | "boundary" | "unknown";

export interface ContainmentSampleResult {
  sampleId: string;
  edgeId: string;
  baseSignedDistance: number;
  /** Base signed distance + complete cylindrical sample radius. */
  radiusAdjustedMargin: number;
  /** Positive means remaining inward clearance. */
  radiusClearance: number;
  classification: ContainmentClassification;
}

export interface EvaluateContainmentPayload {
  samples: ContainmentSampleResult[];
  summary: {
    contained: boolean;
    checkedSampleCount: number;
    outsideSampleIds: string[];
    outsideEdgeIds: string[];
    maximumExcess: number;
    maximumExcessMm: number;
    minimumClearance: number;
  };
}

export interface GeometryBackendProvenance {
  backendId: string;
  backendKind: GeometryBackendKind;
  engineVersion: string;
  deviceName: string | null;
  precisionMode: GeometryPrecisionMode;
  artifactSha256?: string;
  timing?: GeometryExecutionTiming;
}

export interface GeometryExecutionTiming {
  endToEndMilliseconds: number;
  setupMilliseconds: number;
  kernelTotalMilliseconds: number;
  kernelAverageMilliseconds: number;
  iterations: number;
}

export interface GeometryJobResult<TPayload = Record<string, unknown>> {
  contract: typeof GEOMETRY_JOB_RESULT_CONTRACT;
  protocol: { major: 1; minor: number };
  status: "completed";
  shadow: true;
  productionApplied: false;
  jobId: string;
  clientRequestId: string;
  operation: GeometryOperation;
  algorithmContract: string;
  projectFingerprint: string;
  backend: GeometryBackendProvenance;
  warnings: Array<{ code: string; detail: string }>;
  result: TPayload;
}

export type EvaluateContainmentJobResult = GeometryJobResult<EvaluateContainmentPayload> & {
  operation: "evaluateContainment";
  algorithmContract: typeof EVALUATE_CONTAINMENT_ALGORITHM;
};

export interface GeometryBackendCapability {
  backendId: string;
  kind: "cpu" | "cuda";
  status: "available" | "unavailable";
  deviceName?: string;
  artifactSha256?: string;
  precisionModes: GeometryPrecisionMode[];
  reasonCode?: string;
}

export interface GeometryOperationCapability {
  operation: GeometryOperation;
  algorithmContracts: string[];
  backendIds: string[];
}

export interface GeometryEngineCapabilities {
  contract: typeof GEOMETRY_CAPABILITIES_CONTRACT;
  protocol: { major: number; minor: number };
  engine: { id: string; version: string };
  endpoint: { host: "127.0.0.1"; port: 47658; apiBase: "/v1" };
  policy: {
    executionMode: "shadow-only";
    authoritativeBackend: "web";
    productionApplied: false;
  };
  backends: GeometryBackendCapability[];
  operations: GeometryOperationCapability[];
  limits: {
    maximumJobBytes: number;
    maximumContainmentSamples: number;
  };
}

export interface GeometryJobAccepted {
  contract: typeof GEOMETRY_JOB_ACCEPTED_CONTRACT;
  jobId: string;
  clientRequestId: string;
  status: "queued";
}

export interface GeometryJobStatus<TPayload = Record<string, unknown>> {
  contract: typeof GEOMETRY_JOB_STATUS_CONTRACT;
  jobId: string;
  clientRequestId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  result?: GeometryJobResult<TPayload>;
  error?: { code: string; detail: string };
}

export class GeometryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryContractError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GeometryContractError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown, label: string, minimum?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    throw new GeometryContractError(`${label} must be a finite number${minimum === undefined ? "" : ` >= ${minimum}`}`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GeometryContractError(`${label} must be a non-empty string`);
  }
  return value;
}

export function validateEvaluateContainmentJobRequest(
  value: unknown,
): EvaluateContainmentJobRequest {
  const request = record(value, "request");
  const protocol = record(request.protocol, "request.protocol");
  if (protocol.major !== GEOMETRY_PROTOCOL.major || !Number.isInteger(protocol.minor) || Number(protocol.minor) < 0) {
    throw new GeometryContractError("request.protocol must use major 1 and a non-negative integer minor");
  }
  nonEmptyString(request.clientRequestId, "request.clientRequestId");
  if (request.operation !== "evaluateContainment") {
    throw new GeometryContractError("request.operation must be evaluateContainment");
  }
  if (request.algorithmContract !== EVALUATE_CONTAINMENT_ALGORITHM) {
    throw new GeometryContractError(`unsupported algorithm contract: ${String(request.algorithmContract)}`);
  }
  nonEmptyString(request.projectFingerprint, "request.projectFingerprint");

  const coordinate = record(request.coordinateContract, "request.coordinateContract");
  if (coordinate.frame !== "object" && coordinate.frame !== "millimeter") {
    throw new GeometryContractError("coordinate frame must be object or millimeter");
  }
  finite(coordinate.unitsPerMillimeter, "coordinate unitsPerMillimeter", Number.MIN_VALUE);
  if (coordinate.handedness !== "right" || coordinate.buildAxis !== "+z") {
    throw new GeometryContractError("only right-handed +z coordinates are supported");
  }

  record(request.quality, "request.quality");
  if (!Array.isArray(request.artifacts) || request.artifacts.length !== 0) {
    throw new GeometryContractError("prototype containment jobs require an empty artifacts array");
  }

  const input = record(request.input, "request.input");
  const base = record(input.base, "request.input.base");
  if (base.kind !== "metaball-smooth-union" || base.contractVersion !== 1) {
    throw new GeometryContractError("only metaball-smooth-union contractVersion 1 is supported");
  }
  finite(base.smoothness, "base.smoothness", Number.MIN_VALUE);
  if (!Array.isArray(base.balls)) throw new GeometryContractError("base.balls must be an array");
  if (base.balls.length === 0) throw new GeometryContractError("base.balls must not be empty");
  const ballIds = new Set<number>();
  for (const [index, candidate] of base.balls.entries()) {
    const ball = record(candidate, `base.balls[${index}]`);
    if (!Number.isInteger(ball.id)) throw new GeometryContractError(`base.balls[${index}].id must be an integer`);
    const id = Number(ball.id);
    if (ballIds.has(id)) throw new GeometryContractError(`duplicate ball id ${id}`);
    ballIds.add(id);
    finite(ball.x, `base.balls[${index}].x`);
    finite(ball.y, `base.balls[${index}].y`);
    finite(ball.z, `base.balls[${index}].z`);
    finite(ball.r, `base.balls[${index}].r`, Number.MIN_VALUE);
  }

  finite(input.boundaryTolerance, "input.boundaryTolerance", 0);
  if (!Array.isArray(input.samples)) throw new GeometryContractError("input.samples must be an array");
  const sampleIds = new Set<string>();
  for (const [index, candidate] of input.samples.entries()) {
    const sample = record(candidate, `samples[${index}]`);
    const sampleId = nonEmptyString(sample.sampleId, `samples[${index}].sampleId`);
    if (sampleIds.has(sampleId)) throw new GeometryContractError(`duplicate sample id ${sampleId}`);
    sampleIds.add(sampleId);
    nonEmptyString(sample.edgeId, `samples[${index}].edgeId`);
    const position = record(sample.position, `samples[${index}].position`);
    finite(position.x, `samples[${index}].position.x`);
    finite(position.y, `samples[${index}].position.y`);
    finite(position.z, `samples[${index}].position.z`);
    finite(sample.radius, `samples[${index}].radius`, Number.MIN_VALUE);
  }
  return value as EvaluateContainmentJobRequest;
}

export function validateGeometryEngineCapabilities(value: unknown): GeometryEngineCapabilities {
  const capabilities = record(value, "capabilities");
  if (capabilities.contract !== GEOMETRY_CAPABILITIES_CONTRACT) {
    throw new GeometryContractError("unsupported capabilities contract");
  }
  const protocol = record(capabilities.protocol, "capabilities.protocol");
  if (!Number.isInteger(protocol.major) || !Number.isInteger(protocol.minor)) {
    throw new GeometryContractError("capabilities protocol versions must be integers");
  }
  const endpoint = record(capabilities.endpoint, "capabilities.endpoint");
  if (endpoint.host !== "127.0.0.1" || endpoint.port !== 47658 || endpoint.apiBase !== "/v1") {
    throw new GeometryContractError("helper did not advertise the fixed loopback endpoint");
  }
  const policy = record(capabilities.policy, "capabilities.policy");
  if (policy.executionMode !== "shadow-only"
    || policy.authoritativeBackend !== "web"
    || policy.productionApplied !== false) {
    throw new GeometryContractError("helper must advertise Web-authoritative shadow-only policy");
  }
  if (!Array.isArray(capabilities.backends) || !Array.isArray(capabilities.operations)) {
    throw new GeometryContractError("capabilities must advertise backend and operation arrays");
  }
  const engine = record(capabilities.engine, "capabilities.engine");
  nonEmptyString(engine.id, "capabilities.engine.id");
  nonEmptyString(engine.version, "capabilities.engine.version");
  const backendIds = new Set<string>();
  for (const [index, candidate] of capabilities.backends.entries()) {
    const backend = record(candidate, `capabilities.backends[${index}]`);
    const backendId = nonEmptyString(backend.backendId, `capabilities.backends[${index}].backendId`);
    if (backendIds.has(backendId)) throw new GeometryContractError(`duplicate backend id ${backendId}`);
    backendIds.add(backendId);
    if (backend.kind !== "cpu" && backend.kind !== "cuda") {
      throw new GeometryContractError(`capabilities.backends[${index}] has an invalid kind`);
    }
    if (backend.status !== "available" && backend.status !== "unavailable") {
      throw new GeometryContractError(`capabilities.backends[${index}] has an invalid status`);
    }
    if (!Array.isArray(backend.precisionModes)
      || backend.precisionModes.some((mode) => mode !== "float32" && mode !== "float64" && mode !== "mixed")) {
      throw new GeometryContractError(`capabilities.backends[${index}] has invalid precision modes`);
    }
    if (backend.kind === "cuda" && backend.status === "available"
      && (backend.deviceName !== EXPECTED_CUDA_DEVICE_NAME
        || !backend.precisionModes.includes("float32")
        || backend.artifactSha256 !== EXPECTED_CUDA_EXECUTABLE_SHA256)) {
      throw new GeometryContractError("available CUDA backend is not the reviewed RTX 3080 artifact");
    }
  }
  for (const [index, candidate] of capabilities.operations.entries()) {
    const operation = record(candidate, `capabilities.operations[${index}]`);
    if (!GEOMETRY_OPERATIONS.includes(operation.operation as GeometryOperation)) {
      throw new GeometryContractError(`capabilities.operations[${index}] has an invalid operation`);
    }
    if (!Array.isArray(operation.algorithmContracts)
      || operation.algorithmContracts.some((contract) => typeof contract !== "string" || contract.length === 0)
      || !Array.isArray(operation.backendIds)
      || operation.backendIds.some((id) => typeof id !== "string" || !backendIds.has(id))) {
      throw new GeometryContractError(`capabilities.operations[${index}] has invalid contracts or backend ids`);
    }
  }
  const limits = record(capabilities.limits, "capabilities.limits");
  finite(limits.maximumJobBytes, "capabilities.limits.maximumJobBytes", 1);
  finite(limits.maximumContainmentSamples, "capabilities.limits.maximumContainmentSamples", 1);
  return value as GeometryEngineCapabilities;
}

export function validateEvaluateContainmentJobResult(
  value: unknown,
  request: EvaluateContainmentJobRequest,
): EvaluateContainmentJobResult {
  const response = record(value, "job result");
  if (response.contract !== GEOMETRY_JOB_RESULT_CONTRACT
    || response.status !== "completed"
    || response.shadow !== true
    || response.productionApplied !== false
    || response.operation !== "evaluateContainment"
    || response.algorithmContract !== EVALUATE_CONTAINMENT_ALGORITHM) {
    throw new GeometryContractError("job result is not a shadow evaluateContainment v1 result");
  }
  if (response.clientRequestId !== request.clientRequestId
    || response.projectFingerprint !== request.projectFingerprint) {
    throw new GeometryContractError("job result does not match the active request and project fingerprint");
  }
  nonEmptyString(response.jobId, "job result.jobId");
  const backend = record(response.backend, "job result.backend");
  if (backend.backendKind !== "cuda") {
    throw new GeometryContractError("local candidate must report CUDA provenance");
  }
  nonEmptyString(backend.backendId, "job result.backend.backendId");
  nonEmptyString(backend.engineVersion, "job result.backend.engineVersion");
  if (backend.deviceName !== EXPECTED_CUDA_DEVICE_NAME
    || backend.precisionMode !== "float32"
    || backend.artifactSha256 !== EXPECTED_CUDA_EXECUTABLE_SHA256) {
    throw new GeometryContractError("local candidate must report the reviewed RTX 3080 float32 artifact");
  }
  if (backend.timing !== undefined) {
    const timing = record(backend.timing, "job result.backend.timing");
    finite(timing.endToEndMilliseconds, "job result.backend.timing.endToEndMilliseconds", 0);
    finite(timing.setupMilliseconds, "job result.backend.timing.setupMilliseconds", 0);
    finite(timing.kernelTotalMilliseconds, "job result.backend.timing.kernelTotalMilliseconds", 0);
    finite(timing.kernelAverageMilliseconds, "job result.backend.timing.kernelAverageMilliseconds", 0);
    if (!Number.isInteger(timing.iterations) || Number(timing.iterations) < 1) {
      throw new GeometryContractError("job result.backend.timing.iterations must be a positive integer");
    }
  }
  if (!Array.isArray(response.warnings)) throw new GeometryContractError("job result.warnings must be an array");
  const payload = record(response.result, "job result.result");
  if (!Array.isArray(payload.samples)) throw new GeometryContractError("job result samples must be an array");
  if (payload.samples.length !== request.input.samples.length) {
    throw new GeometryContractError("job result sample count does not match the request");
  }
  const expectedSamples = new Map(request.input.samples.map((sample) => [sample.sampleId, sample.edgeId]));
  for (const [index, candidate] of payload.samples.entries()) {
    const sample = record(candidate, `job result.samples[${index}]`);
    const sampleId = nonEmptyString(sample.sampleId, `job result.samples[${index}].sampleId`);
    const edgeId = nonEmptyString(sample.edgeId, `job result.samples[${index}].edgeId`);
    if (expectedSamples.get(sampleId) !== edgeId) {
      throw new GeometryContractError(`job result sample ${sampleId} does not match the request identity`);
    }
    expectedSamples.delete(sampleId);
    finite(sample.baseSignedDistance, `job result.samples[${index}].baseSignedDistance`);
    finite(sample.radiusAdjustedMargin, `job result.samples[${index}].radiusAdjustedMargin`);
    finite(sample.radiusClearance, `job result.samples[${index}].radiusClearance`);
    if (sample.classification !== "inside" && sample.classification !== "outside"
      && sample.classification !== "boundary" && sample.classification !== "unknown") {
      throw new GeometryContractError(`job result.samples[${index}] has an invalid classification`);
    }
  }
  if (expectedSamples.size !== 0) throw new GeometryContractError("job result omitted requested samples");
  const summary = record(payload.summary, "job result.summary");
  if (typeof summary.contained !== "boolean"
    || !Number.isInteger(summary.checkedSampleCount)
    || summary.checkedSampleCount !== request.input.samples.length
    || !Array.isArray(summary.outsideSampleIds)
    || !Array.isArray(summary.outsideEdgeIds)) {
    throw new GeometryContractError("job result summary has invalid discrete facts");
  }
  finite(summary.maximumExcess, "job result.summary.maximumExcess");
  finite(summary.maximumExcessMm, "job result.summary.maximumExcessMm");
  finite(summary.minimumClearance, "job result.summary.minimumClearance");
  return value as EvaluateContainmentJobResult;
}

export function createEvaluateContainmentJob(
  fields: Omit<EvaluateContainmentJobRequest, "protocol" | "operation" | "algorithmContract" | "artifacts">,
): EvaluateContainmentJobRequest {
  const request: EvaluateContainmentJobRequest = {
    ...fields,
    protocol: GEOMETRY_PROTOCOL,
    operation: "evaluateContainment",
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    artifacts: [],
  };
  return validateEvaluateContainmentJobRequest(request);
}

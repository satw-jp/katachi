import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  GEOMETRY_JOB_RESULT_CONTRACT,
  GEOMETRY_PROTOCOL,
  type EvaluateContainmentJobRequest,
  type EvaluateContainmentJobResult,
} from "./contracts.ts";

export const BROWSER_HELPER_BINARY_MEDIA_TYPE =
  "application/vnd.katachi.geometry-binary-v1" as const;
export const BROWSER_HELPER_BINARY_ROUTE = "/evaluate-containment-binary" as const;
export const SHADOW_SESSION_ROUTE = "/shadow-sessions" as const;
export const SHADOW_SESSION_PARAMETER_MEDIA_TYPE =
  "application/vnd.katachi.geometry-session-parameters-v1" as const;
export const SHADOW_SESSION_PARAMETER_BYTES = 64;
export const COMPACT_BINARY_REQUEST_HEADER_BYTES = 96;
export const COMPACT_BINARY_RESPONSE_HEADER_BYTES = 176;

const RECORD_BYTES = 16;
const textEncoder = new TextEncoder();

export interface BrowserBinaryEncodeTiming {
  identityMilliseconds: number;
  payloadMilliseconds: number;
  totalMilliseconds: number;
  requestBytes: number;
}

export interface BrowserBinaryDecodeTiming {
  payloadMilliseconds: number;
  totalMilliseconds: number;
  responseBytes: number;
}

export interface BrowserBinaryResponseMetadata {
  jobId: string;
  engineVersion: string;
  artifactSha256: string;
}

function protocolError(detail: string): Error {
  const error = new Error(detail);
  error.name = "BrowserBinaryTransportError";
  return error;
}

function checkedFloat32(
  value: number,
  label: string,
  options: { positive?: boolean; nonNegative?: boolean } = {},
): number {
  if (!Number.isFinite(value)) throw protocolError(`${label} must be finite`);
  const converted = Math.fround(value);
  if (!Number.isFinite(converted)
    || (options.positive && !(converted > 0))
    || (options.nonNegative && converted < 0)) {
    throw protocolError(`${label} is outside the supported float32 range`);
  }
  return converted;
}

function setAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}

function hasAscii(source: Uint8Array, offset: number, value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (source[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function binaryFingerprintToHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function binaryFingerprintFromHex(value: string): Uint8Array {
  if (!/^[0-9A-Fa-f]{64}$/.test(value)) throw protocolError("binary fingerprint must be 32-byte hexadecimal");
  const result = new Uint8Array(32);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

export function encodeShadowSessionParameters(
  geometryFingerprint: Uint8Array,
  {
    smoothness,
    boundaryTolerance,
    iterations = 1,
  }: {
    smoothness: number;
    boundaryTolerance: number;
    iterations?: number;
  },
): Uint8Array {
  if (geometryFingerprint.byteLength !== 32) throw protocolError("session geometry fingerprint must be 32 bytes");
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
    throw protocolError("session benchmarkIterations must be an integer in [1,10000]");
  }
  const payload = new Uint8Array(SHADOW_SESSION_PARAMETER_BYTES);
  const view = new DataView(payload.buffer);
  setAscii(payload, 0, "KSP1");
  view.setUint16(4, 1, true);
  view.setUint16(6, 1, true);
  view.setUint32(8, SHADOW_SESSION_PARAMETER_BYTES, true);
  payload.set(geometryFingerprint, 16);
  view.setFloat32(48, checkedFloat32(smoothness, "session smoothness", { positive: true }), true);
  view.setFloat32(52, checkedFloat32(boundaryTolerance, "session boundaryTolerance", { nonNegative: true }), true);
  view.setUint32(56, iterations, true);
  view.setUint32(60, SHADOW_SESSION_PARAMETER_BYTES, true);
  return payload;
}

function identityText(request: EvaluateContainmentJobRequest): string {
  const parts = [JSON.stringify({
    algorithmContract: request.algorithmContract,
    clientRequestId: request.clientRequestId,
    projectFingerprint: request.projectFingerprint,
    coordinateContract: request.coordinateContract,
    ballCount: request.input.base.balls.length,
    sampleCount: request.input.samples.length,
  })];
  for (const ball of request.input.base.balls) {
    parts.push(JSON.stringify(["ball", ball.id]), "\n");
  }
  for (const sample of request.input.samples) {
    parts.push(JSON.stringify([sample.sampleId, sample.edgeId]), "\n");
  }
  return parts.join("");
}

export async function encodeBrowserBinaryRequest(
  request: EvaluateContainmentJobRequest,
): Promise<{
  payload: Uint8Array;
  identityFingerprint: Uint8Array;
  timing: BrowserBinaryEncodeTiming;
}> {
  const encodeStart = performance.now();
  if (request.algorithmContract !== EVALUATE_CONTAINMENT_ALGORITHM) {
    throw protocolError("binary request uses an unsupported algorithm contract");
  }
  const balls = request.input.base.balls;
  const samples = request.input.samples;
  if (balls.length < 1) throw protocolError("binary request requires at least one ball");
  const identityStart = performance.now();
  const identityFingerprint = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(identityText(request)),
  ));
  const identityMilliseconds = performance.now() - identityStart;

  const payloadStart = performance.now();
  const ballsOffset = COMPACT_BINARY_REQUEST_HEADER_BYTES;
  const samplesOffset = ballsOffset + balls.length * RECORD_BYTES;
  const totalBytes = samplesOffset + samples.length * RECORD_BYTES;
  const payload = new Uint8Array(totalBytes);
  const view = new DataView(payload.buffer);
  setAscii(payload, 0, "KCB1");
  view.setUint16(4, 1, true);
  view.setUint16(6, 1, true);
  view.setUint32(8, COMPACT_BINARY_REQUEST_HEADER_BYTES, true);
  const frame = request.coordinateContract.frame;
  if ((frame !== "object" && frame !== "millimeter")
    || request.coordinateContract.handedness !== "right"
    || request.coordinateContract.buildAxis !== "+z") {
    throw protocolError("binary transport supports right-handed +z object/millimeter coordinates only");
  }
  view.setUint32(12, frame === "millimeter" ? 1 : 0, true);
  payload.set(identityFingerprint, 16);
  const unitsPerMillimeter = request.coordinateContract.unitsPerMillimeter;
  if (!Number.isFinite(unitsPerMillimeter) || !(unitsPerMillimeter > 0)) {
    throw protocolError("unitsPerMillimeter must be finite and positive");
  }
  view.setFloat64(48, unitsPerMillimeter, true);
  view.setFloat32(56, checkedFloat32(request.input.base.smoothness, "smoothness", { positive: true }), true);
  view.setFloat32(60, checkedFloat32(request.input.boundaryTolerance, "boundaryTolerance", { nonNegative: true }), true);
  const iterations = Number(request.quality.benchmarkIterations ?? 1);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
    throw protocolError("benchmarkIterations must be an integer in [1,10000]");
  }
  view.setUint32(64, iterations, true);
  view.setUint32(68, balls.length, true);
  view.setUint32(72, samples.length, true);
  view.setUint32(76, frame === "millimeter" ? 2 : 1, true);
  view.setUint32(80, ballsOffset, true);
  view.setUint32(84, samplesOffset, true);
  view.setUint32(88, totalBytes, true);

  balls.forEach((ball, index) => {
    const offset = ballsOffset + index * RECORD_BYTES;
    view.setFloat32(offset, checkedFloat32(ball.x, `ball ${index} x`), true);
    view.setFloat32(offset + 4, checkedFloat32(ball.y, `ball ${index} y`), true);
    view.setFloat32(offset + 8, checkedFloat32(ball.z, `ball ${index} z`), true);
    view.setFloat32(offset + 12, checkedFloat32(ball.r, `ball ${index} radius`, { positive: true }), true);
  });
  samples.forEach((sample, index) => {
    const offset = samplesOffset + index * RECORD_BYTES;
    view.setFloat32(offset, checkedFloat32(sample.position.x, `sample ${index} x`), true);
    view.setFloat32(offset + 4, checkedFloat32(sample.position.y, `sample ${index} y`), true);
    view.setFloat32(offset + 8, checkedFloat32(sample.position.z, `sample ${index} z`), true);
    view.setFloat32(offset + 12, checkedFloat32(sample.radius, `sample ${index} radius`, { positive: true }), true);
  });
  const payloadMilliseconds = performance.now() - payloadStart;
  return {
    payload,
    identityFingerprint,
    timing: {
      identityMilliseconds,
      payloadMilliseconds,
      totalMilliseconds: performance.now() - encodeStart,
      requestBytes: payload.byteLength,
    },
  };
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw protocolError(`${label} is non-finite`);
  return value;
}

export function decodeBrowserBinaryResponse(
  payloadBuffer: ArrayBuffer,
  request: EvaluateContainmentJobRequest,
  identityFingerprint: Uint8Array,
  metadata: BrowserBinaryResponseMetadata,
): { result: EvaluateContainmentJobResult; timing: BrowserBinaryDecodeTiming } {
  const decodeStart = performance.now();
  const payload = new Uint8Array(payloadBuffer);
  if (payload.byteLength < COMPACT_BINARY_RESPONSE_HEADER_BYTES || !hasAscii(payload, 0, "KBR1")) {
    throw protocolError("invalid binary response magic or header");
  }
  const view = new DataView(payloadBuffer);
  if (view.getUint16(4, true) !== 1
    || view.getUint16(6, true) !== 1
    || view.getUint32(8, true) !== COMPACT_BINARY_RESPONSE_HEADER_BYTES
    || !equalBytes(payload.subarray(16, 48), identityFingerprint)) {
    throw protocolError("unsupported binary response or identity fingerprint mismatch");
  }
  const sampleCount = view.getUint32(48, true);
  const iterations = view.getUint32(52, true);
  const outputsOffset = view.getUint32(56, true);
  const totalBytes = view.getUint32(60, true);
  if (sampleCount !== request.input.samples.length
    || iterations < 1
    || outputsOffset !== COMPACT_BINARY_RESPONSE_HEADER_BYTES
    || totalBytes !== outputsOffset + sampleCount * RECORD_BYTES
    || payload.byteLength !== totalBytes) {
    throw protocolError("binary response sample count, offsets, or length mismatch");
  }
  const timing = {
    setupMilliseconds: finite(view.getFloat64(64, true), "setup timing"),
    contextInitializationMilliseconds: finite(view.getFloat64(72, true), "context timing"),
    bufferPreparationMilliseconds: finite(view.getFloat64(80, true), "buffer timing"),
    hostToDeviceMilliseconds: finite(view.getFloat64(88, true), "H-to-D timing"),
    kernelTotalMilliseconds: finite(view.getFloat64(96, true), "kernel timing"),
    kernelAverageMilliseconds: finite(view.getFloat64(104, true), "average kernel timing"),
    deviceToHostMilliseconds: finite(view.getFloat64(112, true), "D-to-H timing"),
    endToEndMilliseconds: finite(view.getFloat64(120, true), "end-to-end timing"),
    iterations,
  };
  const samples = new Array(sampleCount);
  const outsideSampleIds: string[] = [];
  const outsideEdgeIds: string[] = [];
  const seenOutsideEdges = new Set<string>();
  let maximumExcess = sampleCount === 0 ? 0 : Number.NEGATIVE_INFINITY;
  let minimumClearance = sampleCount === 0 ? 0 : Number.POSITIVE_INFINITY;
  for (let index = 0; index < sampleCount; index += 1) {
    const offset = outputsOffset + index * RECORD_BYTES;
    const baseSignedDistance = finite(view.getFloat32(offset, true), `sample ${index} signed distance`);
    const radiusAdjustedMargin = finite(view.getFloat32(offset + 4, true), `sample ${index} margin`);
    const radiusClearance = finite(view.getFloat32(offset + 8, true), `sample ${index} clearance`);
    const classificationCode = view.getUint32(offset + 12, true);
    const classification = (["inside", "boundary", "outside"] as const)[classificationCode];
    if (!classification) throw protocolError(`sample ${index} classification is invalid`);
    const identity = request.input.samples[index];
    samples[index] = {
      sampleId: identity.sampleId,
      edgeId: identity.edgeId,
      baseSignedDistance,
      radiusAdjustedMargin,
      radiusClearance,
      classification,
    };
    if (classification === "outside") {
      outsideSampleIds.push(identity.sampleId);
      if (!seenOutsideEdges.has(identity.edgeId)) {
        seenOutsideEdges.add(identity.edgeId);
        outsideEdgeIds.push(identity.edgeId);
      }
    }
    maximumExcess = Math.max(maximumExcess, radiusAdjustedMargin);
    minimumClearance = Math.min(minimumClearance, radiusClearance);
  }
  const payloadMilliseconds = performance.now() - decodeStart;
  const result: EvaluateContainmentJobResult = {
    contract: GEOMETRY_JOB_RESULT_CONTRACT,
    protocol: GEOMETRY_PROTOCOL,
    status: "completed",
    shadow: true,
    productionApplied: false,
    jobId: metadata.jobId,
    clientRequestId: request.clientRequestId,
    operation: "evaluateContainment",
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    projectFingerprint: request.projectFingerprint,
    backend: {
      backendId: "windows-cuda-containment-v1",
      backendKind: "cuda",
      engineVersion: metadata.engineVersion,
      deviceName: "NVIDIA GeForce RTX 3080",
      precisionMode: "float32",
      artifactSha256: metadata.artifactSha256,
      timing: {
        endToEndMilliseconds: timing.endToEndMilliseconds,
        setupMilliseconds: timing.setupMilliseconds,
        kernelTotalMilliseconds: timing.kernelTotalMilliseconds,
        kernelAverageMilliseconds: timing.kernelAverageMilliseconds,
        iterations,
      },
    },
    warnings: [{
      code: "shadow_only",
      detail: "Candidate result is observational and cannot update production geometry.",
    }],
    result: {
      samples,
      summary: {
        checkedSampleCount: sampleCount,
        contained: outsideSampleIds.length === 0,
        maximumExcess,
        maximumExcessMm: maximumExcess / request.coordinateContract.unitsPerMillimeter,
        minimumClearance,
        outsideEdgeIds,
        outsideSampleIds,
      },
    },
  };
  return {
    result,
    timing: {
      payloadMilliseconds,
      totalMilliseconds: performance.now() - decodeStart,
      responseBytes: payload.byteLength,
    },
  };
}

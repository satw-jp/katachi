import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  EXECUTABLE_RESULT_CONTRACT,
} from "./compiled-executable-adapter.mjs";

export const COMPACT_BINARY_REQUEST_HEADER_BYTES = 96;
export const COMPACT_BINARY_RESPONSE_HEADER_BYTES = 176;
export const BROWSER_HELPER_BINARY_MEDIA_TYPE =
  "application/vnd.katachi.geometry-binary-v1";

const REQUEST_MAGIC = Buffer.from("KCB1", "ascii");
const RESPONSE_MAGIC = Buffer.from("KBR1", "ascii");
const PROTOCOL_VERSION = 1;
const OPERATION_EVALUATE_CONTAINMENT = 1;
const RECORD_BYTES = 16;

function protocolError(detail) {
  const error = new Error(detail);
  error.code = "cuda_worker_malformed_response";
  return error;
}

function checkedFloat32(value, label, { positive = false, nonNegative = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw protocolError(`${label} must be finite`);
  }
  const converted = Math.fround(value);
  if (!Number.isFinite(converted)
    || (positive && !(converted > 0))
    || (nonNegative && converted < 0)) {
    throw protocolError(`${label} is outside the supported float32 range`);
  }
  return converted;
}

function updateIdentityFingerprint(hash, request) {
  hash.update(JSON.stringify({
    algorithmContract: request.algorithmContract,
    clientRequestId: request.clientRequestId,
    projectFingerprint: request.projectFingerprint,
    coordinateContract: request.coordinateContract,
    ballCount: request.input.base.balls.length,
    sampleCount: request.input.samples.length,
  }));
  let chunk = [];
  for (const ball of request.input.base.balls) {
    chunk.push(JSON.stringify(["ball", ball.id]), "\n");
  }
  for (const sample of request.input.samples) {
    chunk.push(JSON.stringify([sample.sampleId, sample.edgeId]), "\n");
    if (chunk.length >= 4_096) {
      hash.update(chunk.join(""));
      chunk = [];
    }
  }
  if (chunk.length > 0) hash.update(chunk.join(""));
}

export function encodeCompactBinaryRequest(request) {
  const encodeStart = performance.now();
  if (request.algorithmContract !== EVALUATE_CONTAINMENT_ALGORITHM) {
    throw protocolError("compact binary request uses an unsupported algorithm contract");
  }
  const balls = request.input?.base?.balls;
  const samples = request.input?.samples;
  if (!Array.isArray(balls) || balls.length < 1 || !Array.isArray(samples)) {
    throw protocolError("compact binary request is missing balls or samples");
  }
  const identityStart = performance.now();
  const identityHash = createHash("sha256");
  updateIdentityFingerprint(identityHash, request);
  const identityFingerprint = identityHash.digest();
  const identityHashMilliseconds = performance.now() - identityStart;

  const payloadStart = performance.now();
  const ballsOffset = COMPACT_BINARY_REQUEST_HEADER_BYTES;
  const samplesOffset = ballsOffset + balls.length * RECORD_BYTES;
  const totalBytes = samplesOffset + samples.length * RECORD_BYTES;
  const payload = Buffer.allocUnsafe(totalBytes);
  payload.fill(0, 0, COMPACT_BINARY_REQUEST_HEADER_BYTES);
  REQUEST_MAGIC.copy(payload, 0);
  payload.writeUInt16LE(PROTOCOL_VERSION, 4);
  payload.writeUInt16LE(OPERATION_EVALUATE_CONTAINMENT, 6);
  payload.writeUInt32LE(COMPACT_BINARY_REQUEST_HEADER_BYTES, 8);
  const frame = request.coordinateContract?.frame;
  if ((frame !== "object" && frame !== "millimeter")
    || request.coordinateContract?.handedness !== "right"
    || request.coordinateContract?.buildAxis !== "+z") {
    throw protocolError("compact binary transport supports right-handed +z object/millimeter coordinates only");
  }
  payload.writeUInt32LE(frame === "millimeter" ? 1 : 0, 12);
  identityFingerprint.copy(payload, 16);
  const unitsPerMillimeter = request.coordinateContract.unitsPerMillimeter;
  if (typeof unitsPerMillimeter !== "number" || !Number.isFinite(unitsPerMillimeter)
    || !(unitsPerMillimeter > 0)) {
    throw protocolError("unitsPerMillimeter must be finite and positive");
  }
  payload.writeDoubleLE(unitsPerMillimeter, 48);
  payload.writeFloatLE(checkedFloat32(request.input.base.smoothness, "smoothness", { positive: true }), 56);
  payload.writeFloatLE(checkedFloat32(request.input.boundaryTolerance, "boundaryTolerance", { nonNegative: true }), 60);
  const iterations = request.quality?.benchmarkIterations ?? 1;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
    throw protocolError("benchmarkIterations must be an integer in [1,10000]");
  }
  payload.writeUInt32LE(iterations, 64);
  payload.writeUInt32LE(balls.length, 68);
  payload.writeUInt32LE(samples.length, 72);
  payload.writeUInt32LE(frame === "millimeter" ? 2 : 1, 76);
  payload.writeUInt32LE(ballsOffset, 80);
  payload.writeUInt32LE(samplesOffset, 84);
  payload.writeUInt32LE(totalBytes, 88);

  for (let index = 0; index < balls.length; index += 1) {
    const ball = balls[index];
    const offset = ballsOffset + index * RECORD_BYTES;
    payload.writeFloatLE(checkedFloat32(ball.x, `ball ${index} x`), offset);
    payload.writeFloatLE(checkedFloat32(ball.y, `ball ${index} y`), offset + 4);
    payload.writeFloatLE(checkedFloat32(ball.z, `ball ${index} z`), offset + 8);
    payload.writeFloatLE(checkedFloat32(ball.r, `ball ${index} radius`, { positive: true }), offset + 12);
  }
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const offset = samplesOffset + index * RECORD_BYTES;
    payload.writeFloatLE(checkedFloat32(sample.position.x, `sample ${index} x`), offset);
    payload.writeFloatLE(checkedFloat32(sample.position.y, `sample ${index} y`), offset + 4);
    payload.writeFloatLE(checkedFloat32(sample.position.z, `sample ${index} z`), offset + 8);
    payload.writeFloatLE(checkedFloat32(sample.radius, `sample ${index} radius`, { positive: true }), offset + 12);
  }
  const payloadBuildMilliseconds = performance.now() - payloadStart;
  return {
    payload,
    identityFingerprint,
    identityHashMilliseconds,
    payloadBuildMilliseconds,
    totalMilliseconds: performance.now() - encodeStart,
  };
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw protocolError(`${label} is non-finite`);
  return value;
}

export function validateCompactBinaryRequestEnvelope(payload, {
  maximumSamples = 250_000,
} = {}) {
  const start = performance.now();
  if (!Buffer.isBuffer(payload)
    || payload.length < COMPACT_BINARY_REQUEST_HEADER_BYTES
    || !payload.subarray(0, 4).equals(REQUEST_MAGIC)) {
    throw protocolError("invalid compact binary request magic or header");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint16(4, true) !== PROTOCOL_VERSION
    || view.getUint16(6, true) !== OPERATION_EVALUATE_CONTAINMENT
    || view.getUint32(8, true) !== COMPACT_BINARY_REQUEST_HEADER_BYTES) {
    throw protocolError("unsupported compact binary request contract");
  }
  const coordinateFrame = view.getUint32(12, true);
  const unitsPerMillimeter = view.getFloat64(48, true);
  const smoothness = view.getFloat32(56, true);
  const boundaryTolerance = view.getFloat32(60, true);
  const iterations = view.getUint32(64, true);
  const ballCount = view.getUint32(68, true);
  const sampleCount = view.getUint32(72, true);
  const coordinateMetadata = view.getUint32(76, true);
  const ballsOffset = view.getUint32(80, true);
  const samplesOffset = view.getUint32(84, true);
  const totalBytes = view.getUint32(88, true);
  if ((coordinateFrame !== 0 && coordinateFrame !== 1)
    || coordinateMetadata !== (coordinateFrame === 1 ? 2 : 1)
    || !Number.isFinite(unitsPerMillimeter)
    || !(unitsPerMillimeter > 0)
    || !Number.isFinite(smoothness)
    || !(smoothness > 0)
    || !Number.isFinite(boundaryTolerance)
    || boundaryTolerance < 0
    || !Number.isInteger(iterations)
    || iterations < 1
    || iterations > 10_000
    || ballCount < 1
    || sampleCount > maximumSamples
    || ballsOffset !== COMPACT_BINARY_REQUEST_HEADER_BYTES
    || samplesOffset !== ballsOffset + ballCount * RECORD_BYTES
    || totalBytes !== samplesOffset + sampleCount * RECORD_BYTES
    || payload.length !== totalBytes) {
    throw protocolError("compact binary request metadata, offsets, or length are invalid");
  }
  for (let offset = ballsOffset; offset < samplesOffset; offset += RECORD_BYTES) {
    if (!Number.isFinite(view.getFloat32(offset, true))
      || !Number.isFinite(view.getFloat32(offset + 4, true))
      || !Number.isFinite(view.getFloat32(offset + 8, true))
      || !Number.isFinite(view.getFloat32(offset + 12, true))
      || !(view.getFloat32(offset + 12, true) > 0)) {
      throw protocolError("compact binary request contains an invalid ball record");
    }
  }
  for (let offset = samplesOffset; offset < totalBytes; offset += RECORD_BYTES) {
    if (!Number.isFinite(view.getFloat32(offset, true))
      || !Number.isFinite(view.getFloat32(offset + 4, true))
      || !Number.isFinite(view.getFloat32(offset + 8, true))
      || !Number.isFinite(view.getFloat32(offset + 12, true))
      || !(view.getFloat32(offset + 12, true) > 0)) {
      throw protocolError("compact binary request contains an invalid sample record");
    }
  }
  return {
    identityFingerprint: Buffer.from(payload.subarray(16, 48)),
    coordinateFrame: coordinateFrame === 1 ? "millimeter" : "object",
    unitsPerMillimeter,
    smoothness,
    boundaryTolerance,
    iterations,
    ballCount,
    sampleCount,
    totalBytes,
    validationMilliseconds: performance.now() - start,
  };
}

export function validateCompactBinaryResponseEnvelope(payload, {
  identityFingerprint,
  sampleCount,
} = {}) {
  const start = performance.now();
  if (!Buffer.isBuffer(payload)
    || payload.length < COMPACT_BINARY_RESPONSE_HEADER_BYTES
    || !payload.subarray(0, 4).equals(RESPONSE_MAGIC)) {
    throw protocolError("invalid compact binary response magic or header");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const responseSampleCount = view.getUint32(48, true);
  const outputsOffset = view.getUint32(56, true);
  const totalBytes = view.getUint32(60, true);
  if (view.getUint16(4, true) !== PROTOCOL_VERSION
    || view.getUint16(6, true) !== OPERATION_EVALUATE_CONTAINMENT
    || view.getUint32(8, true) !== COMPACT_BINARY_RESPONSE_HEADER_BYTES
    || (identityFingerprint && !payload.subarray(16, 48).equals(identityFingerprint))
    || (sampleCount !== undefined && responseSampleCount !== sampleCount)
    || outputsOffset !== COMPACT_BINARY_RESPONSE_HEADER_BYTES
    || totalBytes !== outputsOffset + responseSampleCount * RECORD_BYTES
    || payload.length !== totalBytes) {
    throw protocolError("compact binary response identity, offsets, or length are invalid");
  }
  for (let offset = outputsOffset; offset < totalBytes; offset += RECORD_BYTES) {
    if (!Number.isFinite(view.getFloat32(offset, true))
      || !Number.isFinite(view.getFloat32(offset + 4, true))
      || !Number.isFinite(view.getFloat32(offset + 8, true))
      || view.getUint32(offset + 12, true) > 2) {
      throw protocolError("compact binary response contains an invalid output record");
    }
  }
  return {
    sampleCount: responseSampleCount,
    totalBytes,
    validationMilliseconds: performance.now() - start,
  };
}

export function decodeCompactBinaryResponse(payload, request, capabilities, identityFingerprint) {
  const decodeStart = performance.now();
  if (!Buffer.isBuffer(payload)
    || payload.length < COMPACT_BINARY_RESPONSE_HEADER_BYTES
    || !payload.subarray(0, 4).equals(RESPONSE_MAGIC)) {
    throw protocolError("invalid compact binary response magic or header");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint16(4, true) !== PROTOCOL_VERSION
    || view.getUint16(6, true) !== OPERATION_EVALUATE_CONTAINMENT
    || view.getUint32(8, true) !== COMPACT_BINARY_RESPONSE_HEADER_BYTES) {
    throw protocolError("unsupported compact binary response contract");
  }
  if (!payload.subarray(16, 48).equals(identityFingerprint)) {
    throw protocolError("compact binary response identity fingerprint mismatch");
  }
  const sampleCount = view.getUint32(48, true);
  const iterations = view.getUint32(52, true);
  const outputsOffset = view.getUint32(56, true);
  const totalBytes = view.getUint32(60, true);
  if (sampleCount !== request.input.samples.length
    || outputsOffset !== COMPACT_BINARY_RESPONSE_HEADER_BYTES
    || totalBytes !== outputsOffset + sampleCount * RECORD_BYTES
    || payload.length !== totalBytes) {
    throw protocolError("compact binary response sample count, offsets, or length mismatch");
  }
  const flags = view.getUint32(12, true);
  const timing = {
    setupMilliseconds: finite(view.getFloat64(64, true), "binary setup timing"),
    contextInitializationMilliseconds: finite(view.getFloat64(72, true), "binary context timing"),
    bufferPreparationMilliseconds: finite(view.getFloat64(80, true), "binary buffer timing"),
    hostToDeviceMilliseconds: finite(view.getFloat64(88, true), "binary H-to-D timing"),
    kernelTotalMilliseconds: finite(view.getFloat64(96, true), "binary kernel timing"),
    kernelAverageMilliseconds: finite(view.getFloat64(104, true), "binary average kernel timing"),
    deviceToHostMilliseconds: finite(view.getFloat64(112, true), "binary D-to-H timing"),
    endToEndMilliseconds: finite(view.getFloat64(120, true), "binary end-to-end timing"),
    ballBufferCapacityBytes: Number(view.getBigUint64(128, true)),
    sampleBufferCapacityBytes: Number(view.getBigUint64(136, true)),
    outputBufferCapacityBytes: Number(view.getBigUint64(144, true)),
    nativeRequestDecodeMilliseconds: finite(view.getFloat64(152, true), "native binary request decode timing"),
    nativeResponseEncodeMilliseconds: finite(view.getFloat64(160, true), "native binary response encode timing"),
    iterations,
    contextReused: Boolean(flags & (1 << 0)),
    moduleReused: Boolean(flags & (1 << 1)),
    functionReused: Boolean(flags & (1 << 2)),
    ballBufferReused: Boolean(flags & (1 << 3)),
    sampleBufferReused: Boolean(flags & (1 << 4)),
    outputBufferReused: Boolean(flags & (1 << 5)),
  };
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw protocolError("compact binary response iterations are invalid");
  }

  const samples = new Array(sampleCount);
  const outsideSampleIds = [];
  const outsideEdgeIds = [];
  const seenOutsideEdges = new Set();
  let maximumExcess = sampleCount === 0 ? 0 : Number.NEGATIVE_INFINITY;
  let minimumClearance = sampleCount === 0 ? 0 : Number.POSITIVE_INFINITY;
  for (let index = 0; index < sampleCount; index += 1) {
    const offset = outputsOffset + index * RECORD_BYTES;
    const baseSignedDistance = finite(view.getFloat32(offset, true), `binary sample ${index} signed distance`);
    const radiusAdjustedMargin = finite(view.getFloat32(offset + 4, true), `binary sample ${index} margin`);
    const radiusClearance = finite(view.getFloat32(offset + 8, true), `binary sample ${index} clearance`);
    const classificationCode = view.getUint32(offset + 12, true);
    const classification = ["inside", "boundary", "outside"][classificationCode];
    if (!classification) throw protocolError(`binary sample ${index} classification is invalid`);
    const identity = request.input.samples[index];
    samples[index] = {
      sampleId: identity.sampleId,
      edgeId: identity.edgeId,
      baseSignedDistance,
      radiusAdjustedMargin,
      radiusClearance,
      classification,
    };
    if (classificationCode === 2) {
      outsideSampleIds.push(identity.sampleId);
      if (!seenOutsideEdges.has(identity.edgeId)) {
        seenOutsideEdges.add(identity.edgeId);
        outsideEdgeIds.push(identity.edgeId);
      }
    }
    maximumExcess = Math.max(maximumExcess, radiusAdjustedMargin);
    minimumClearance = Math.min(minimumClearance, radiusClearance);
  }
  const result = {
    contract: EXECUTABLE_RESULT_CONTRACT,
    clientRequestId: request.clientRequestId,
    projectFingerprint: request.projectFingerprint,
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    backend: {
      backendId: "windows-cuda-containment-v1",
      backendKind: "cuda",
      deviceName: capabilities.device.name,
      engineVersion: capabilities.engineVersion,
      precisionMode: capabilities.precisionMode,
    },
    device: capabilities.device,
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
    timing,
    timingMilliseconds: timing.endToEndMilliseconds,
    shadow: true,
    productionApplied: false,
  };
  return { result, decodeMilliseconds: performance.now() - decodeStart };
}

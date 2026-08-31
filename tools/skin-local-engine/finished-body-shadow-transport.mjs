import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

export const FINISHED_BODY_SNAPSHOT_MEDIA_TYPE =
  "application/vnd.katachi.finished-body-snapshot-v1";
export const FINISHED_BODY_GRID_MEDIA_TYPE =
  "application/vnd.katachi.finished-body-grid-v1";
export const FINISHED_BODY_RESULT_MEDIA_TYPE =
  "application/vnd.katachi.finished-body-grid-result-v1";
export const FINISHED_BODY_SNAPSHOT_HEADER_BYTES = 128;
export const FINISHED_BODY_GRID_HEADER_BYTES = 96;
export const FINISHED_BODY_RESULT_HEADER_BYTES = 160;

const SNAPSHOT_MAGIC = Buffer.from("KFS1", "ascii");
const GRID_MAGIC = Buffer.from("KFG1", "ascii");
const ACK_MAGIC = Buffer.from("KFA1", "ascii");
const RESULT_MAGIC = Buffer.from("KFR1", "ascii");
const FLOAT4_BYTES = 16;
const CAPSULE_BYTES = 32;

function protocolError(code, detail) {
  return Object.assign(new Error(detail), { code });
}

function checkedFloat32(value, label, { positive = false } = {}) {
  const converted = Math.fround(value);
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(converted)
    || (positive && !(converted > 0))) {
    throw protocolError("invalid_finished_body_snapshot", `${label} must be finite${positive ? " and positive" : ""}`);
  }
  return converted;
}

function writeFloat4(payload, offset, value, label) {
  payload.writeFloatLE(checkedFloat32(value.x, `${label}.x`), offset);
  payload.writeFloatLE(checkedFloat32(value.y, `${label}.y`), offset + 4);
  payload.writeFloatLE(checkedFloat32(value.z, `${label}.z`), offset + 8);
  payload.writeFloatLE(checkedFloat32(value.r, `${label}.r`, { positive: true }), offset + 12);
}

export function encodeFinishedBodySnapshot(snapshot) {
  const started = performance.now();
  if (snapshot.contract !== "katachi.skin.finished-body-field-snapshot.v1"
    || snapshot.version !== 1
    || snapshot.mode !== "plate"
    || snapshot.coinBulge !== 0
    || snapshot.coinBulgeBalance !== 0
    || snapshot.quadMeshJoinWidth !== 0
    || snapshot.coordinateContract?.frame !== "object"
    || snapshot.coordinateContract?.handedness !== "right"
    || snapshot.coordinateContract?.buildAxis !== "+z") {
    throw protocolError("unsupported_finished_body_snapshot", "prototype supports exact plate/coinBulge=0/quadMeshJoinWidth=0 object coordinates only");
  }
  const { host, flatPoints, raisedPoints, capsules } = snapshot;
  if (!Array.isArray(host) || host.length < 1 || !Array.isArray(flatPoints)
    || !Array.isArray(raisedPoints) || !Array.isArray(capsules)) {
    throw protocolError("invalid_finished_body_snapshot", "snapshot primitive arrays are invalid");
  }
  if (!Number.isFinite(snapshot.coordinateContract.unitsPerMillimeter)
    || !(snapshot.coordinateContract.unitsPerMillimeter > 0)) {
    throw protocolError("invalid_finished_body_snapshot", "unitsPerMillimeter must be finite and positive");
  }
  const hostOffset = FINISHED_BODY_SNAPSHOT_HEADER_BYTES;
  const flatOffset = hostOffset + host.length * FLOAT4_BYTES;
  const raisedOffset = flatOffset + flatPoints.length * FLOAT4_BYTES;
  const capsulesOffset = raisedOffset + raisedPoints.length * FLOAT4_BYTES;
  const totalBytes = capsulesOffset + capsules.length * CAPSULE_BYTES;
  const payload = Buffer.alloc(totalBytes);
  SNAPSHOT_MAGIC.copy(payload, 0);
  payload.writeUInt16LE(1, 4);
  payload.writeUInt16LE(1, 6);
  payload.writeUInt32LE(FINISHED_BODY_SNAPSHOT_HEADER_BYTES, 8);
  payload.writeUInt32LE(1, 12); // right-handed object coordinates, +z build axis
  payload.writeFloatLE(checkedFloat32(snapshot.hostK, "hostK", { positive: true }), 48);
  payload.writeFloatLE(checkedFloat32(snapshot.roundK, "roundK", { positive: true }), 52);
  payload.writeFloatLE(checkedFloat32(snapshot.thickness / 2, "halfThickness", { positive: true }), 56);
  payload.writeFloatLE(checkedFloat32(snapshot.capsuleBlend, "capsuleBlend", { positive: capsules.length > 0 }), 60);
  payload.writeUInt32LE(host.length, 64);
  payload.writeUInt32LE(flatPoints.length, 68);
  payload.writeUInt32LE(raisedPoints.length, 72);
  payload.writeUInt32LE(capsules.length, 76);
  payload.writeUInt32LE(hostOffset, 80);
  payload.writeUInt32LE(flatOffset, 84);
  payload.writeUInt32LE(raisedOffset, 88);
  payload.writeUInt32LE(capsulesOffset, 92);
  payload.writeUInt32LE(totalBytes, 96);
  payload.writeDoubleLE(snapshot.coordinateContract.unitsPerMillimeter, 104);
  for (let index = 0; index < host.length; index++) writeFloat4(payload, hostOffset + index * FLOAT4_BYTES, host[index], `host[${index}]`);
  for (let index = 0; index < flatPoints.length; index++) writeFloat4(payload, flatOffset + index * FLOAT4_BYTES, flatPoints[index], `flatPoints[${index}]`);
  for (let index = 0; index < raisedPoints.length; index++) writeFloat4(payload, raisedOffset + index * FLOAT4_BYTES, raisedPoints[index], `raisedPoints[${index}]`);
  for (let index = 0; index < capsules.length; index++) {
    const capsule = capsules[index];
    const offset = capsulesOffset + index * CAPSULE_BYTES;
    writeFloat4(payload, offset, { ...capsule.start, r: capsule.radius }, `capsules[${index}].start`);
    payload.writeFloatLE(checkedFloat32(capsule.end.x, `capsules[${index}].end.x`), offset + 16);
    payload.writeFloatLE(checkedFloat32(capsule.end.y, `capsules[${index}].end.y`), offset + 20);
    payload.writeFloatLE(checkedFloat32(capsule.end.z, `capsules[${index}].end.z`), offset + 24);
    payload.writeFloatLE(0, offset + 28);
  }
  const fingerprint = createHash("sha256").update(payload).digest();
  fingerprint.copy(payload, 16);
  return {
    payload,
    fingerprint,
    geometryFingerprint: `sha256:${fingerprint.toString("hex")}`,
    encodeMilliseconds: performance.now() - started,
  };
}

export function validateFinishedBodySnapshotEnvelope(payload) {
  if (!Buffer.isBuffer(payload) || payload.length < FINISHED_BODY_SNAPSHOT_HEADER_BYTES
    || !payload.subarray(0, 4).equals(SNAPSHOT_MAGIC)
    || payload.readUInt16LE(4) !== 1 || payload.readUInt16LE(6) !== 1
    || payload.readUInt32LE(8) !== FINISHED_BODY_SNAPSHOT_HEADER_BYTES
    || payload.readUInt32LE(12) !== 1
    || payload.readUInt32LE(96) !== payload.length
    || !Number.isFinite(payload.readDoubleLE(104))
    || !(payload.readDoubleLE(104) > 0)) {
    throw protocolError("invalid_finished_body_snapshot", "invalid Finished BODY snapshot envelope");
  }
  const geometryFingerprint = Buffer.from(payload.subarray(16, 48));
  const canonical = Buffer.from(payload);
  canonical.fill(0, 16, 48);
  if (!createHash("sha256").update(canonical).digest().equals(geometryFingerprint)) {
    throw protocolError("invalid_finished_body_snapshot", "Finished BODY snapshot fingerprint mismatch");
  }
  return {
    geometryFingerprint,
    geometryFingerprintText: `sha256:${geometryFingerprint.toString("hex")}`,
    hostCount: payload.readUInt32LE(64),
    flatPointCount: payload.readUInt32LE(68),
    raisedPointCount: payload.readUInt32LE(72),
    capsuleCount: payload.readUInt32LE(76),
    totalBytes: payload.length,
  };
}

export function encodeFinishedBodyGridRequest(fingerprint, { bounds, shape }) {
  if (!Buffer.isBuffer(fingerprint) || fingerprint.length !== 32) {
    throw protocolError("invalid_finished_body_grid", "grid request requires a 32-byte snapshot fingerprint");
  }
  const sizeX = shape.nx + 1;
  const sizeY = shape.ny + 1;
  const sizeZ = shape.nz + 1;
  const sampleCount = sizeX * sizeY * sizeZ;
  const payload = Buffer.alloc(FINISHED_BODY_GRID_HEADER_BYTES);
  GRID_MAGIC.copy(payload, 0);
  payload.writeUInt16LE(1, 4);
  payload.writeUInt16LE(2, 6);
  payload.writeUInt32LE(FINISHED_BODY_GRID_HEADER_BYTES, 8);
  payload.writeUInt32LE(1, 12);
  fingerprint.copy(payload, 16);
  payload.writeFloatLE(checkedFloat32(bounds.min.x, "bounds.min.x"), 48);
  payload.writeFloatLE(checkedFloat32(bounds.min.y, "bounds.min.y"), 52);
  payload.writeFloatLE(checkedFloat32(bounds.min.z, "bounds.min.z"), 56);
  payload.writeFloatLE(checkedFloat32(shape.step, "grid step", { positive: true }), 60);
  payload.writeUInt32LE(sizeX, 64);
  payload.writeUInt32LE(sizeY, 68);
  payload.writeUInt32LE(sizeZ, 72);
  payload.writeUInt32LE(sampleCount, 76);
  payload.writeUInt32LE(FINISHED_BODY_GRID_HEADER_BYTES, 80);
  return { payload, sampleCount, sizeX, sizeY, sizeZ };
}

export function validateFinishedBodyGridEnvelope(payload, expectedFingerprint) {
  if (!Buffer.isBuffer(payload) || payload.length !== FINISHED_BODY_GRID_HEADER_BYTES
    || !payload.subarray(0, 4).equals(GRID_MAGIC)
    || payload.readUInt16LE(4) !== 1 || payload.readUInt16LE(6) !== 2
    || payload.readUInt32LE(8) !== FINISHED_BODY_GRID_HEADER_BYTES
    || payload.readUInt32LE(80) !== FINISHED_BODY_GRID_HEADER_BYTES
    || (expectedFingerprint && !payload.subarray(16, 48).equals(expectedFingerprint))) {
    throw protocolError("invalid_finished_body_grid", "invalid or stale Finished BODY grid envelope");
  }
  const sizeX = payload.readUInt32LE(64), sizeY = payload.readUInt32LE(68), sizeZ = payload.readUInt32LE(72);
  const sampleCount = payload.readUInt32LE(76);
  if (sizeX * sizeY * sizeZ !== sampleCount || sampleCount > 1_000_000) {
    throw protocolError("invalid_finished_body_grid", "Finished BODY grid dimensions are invalid");
  }
  return { sampleCount, sizeX, sizeY, sizeZ };
}

export function decodeFinishedBodySnapshotAck(payload, fingerprint) {
  if (!Buffer.isBuffer(payload) || payload.length !== 96 || !payload.subarray(0, 4).equals(ACK_MAGIC)
    || !payload.subarray(16, 48).equals(fingerprint)) {
    throw protocolError("malformed_finished_body_worker_response", "invalid Finished BODY snapshot acknowledgement");
  }
  return {
    nativeDecodeMilliseconds: payload.readDoubleLE(48),
    bufferPreparationMilliseconds: payload.readDoubleLE(56),
    hostToDeviceMilliseconds: payload.readDoubleLE(64),
    nativeTotalMilliseconds: payload.readDoubleLE(72),
  };
}

export function decodeFinishedBodyGridResult(payload, fingerprint, expectedSampleCount) {
  const started = performance.now();
  if (!Buffer.isBuffer(payload) || payload.length < FINISHED_BODY_RESULT_HEADER_BYTES
    || !payload.subarray(0, 4).equals(RESULT_MAGIC)
    || payload.readUInt16LE(4) !== 1 || payload.readUInt16LE(6) !== 2
    || payload.readUInt32LE(8) !== FINISHED_BODY_RESULT_HEADER_BYTES
    || !payload.subarray(16, 48).equals(fingerprint)
    || payload.readUInt32LE(48) !== expectedSampleCount
    || payload.readUInt32LE(52) !== FINISHED_BODY_RESULT_HEADER_BYTES
    || payload.readUInt32LE(56) !== payload.length) {
    throw protocolError("malformed_finished_body_worker_response", "invalid Finished BODY grid result envelope");
  }
  const values = new Float32Array(expectedSampleCount);
  for (let index = 0; index < expectedSampleCount; index++) {
    const value = payload.readFloatLE(FINISHED_BODY_RESULT_HEADER_BYTES + index * 4);
    if (!Number.isFinite(value)) throw protocolError("non_finite_finished_body_result", `non-finite SDF at ${index}`);
    values[index] = value;
  }
  return {
    values,
    timing: {
      nativeRequestDecodeMilliseconds: payload.readDoubleLE(64),
      bufferPreparationMilliseconds: payload.readDoubleLE(72),
      hostToDeviceMilliseconds: payload.readDoubleLE(80),
      kernelMilliseconds: payload.readDoubleLE(88),
      deviceToHostMilliseconds: payload.readDoubleLE(96),
      nativeEndToEndMilliseconds: payload.readDoubleLE(104),
      outputBufferReused: Boolean(payload.readUInt32LE(12) & 1),
      resultDecodeMilliseconds: performance.now() - started,
    },
  };
}

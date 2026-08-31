import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export const SHADOW_SESSION_PARAMETER_MEDIA_TYPE =
  "application/vnd.katachi.geometry-session-parameters-v1";
export const SHADOW_SESSION_PARAMETER_BYTES = 64;

const PARAMETER_MAGIC = Buffer.from("KSP1", "ascii");

function sessionError(code, detail) {
  const error = new Error(detail);
  error.code = code;
  return error;
}

function fingerprint(payload) {
  return createHash("sha256").update(payload).digest();
}

export function decodeShadowSessionParameters(payload, expectedGeometryFingerprint) {
  if (!Buffer.isBuffer(payload)
    || payload.length !== SHADOW_SESSION_PARAMETER_BYTES
    || !payload.subarray(0, 4).equals(PARAMETER_MAGIC)) {
    throw sessionError("invalid_session_parameters", "invalid shadow session parameter frame");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint16(4, true) !== 1
    || view.getUint16(6, true) !== 1
    || view.getUint32(8, true) !== SHADOW_SESSION_PARAMETER_BYTES
    || !payload.subarray(16, 48).equals(expectedGeometryFingerprint)
    || view.getUint32(60, true) !== SHADOW_SESSION_PARAMETER_BYTES) {
    throw sessionError("stale_shadow_session", "shadow session geometry fingerprint or protocol does not match");
  }
  const smoothness = view.getFloat32(48, true);
  const boundaryTolerance = view.getFloat32(52, true);
  const iterations = view.getUint32(56, true);
  if (!Number.isFinite(smoothness)
    || !(smoothness > 0)
    || !Number.isFinite(boundaryTolerance)
    || boundaryTolerance < 0
    || !Number.isInteger(iterations)
    || iterations < 1
    || iterations > 10_000) {
    throw sessionError("invalid_session_parameters", "shadow session parameters are outside supported bounds");
  }
  return { smoothness, boundaryTolerance, iterations };
}

export class ShadowGeometrySessionCache {
  constructor({
    maximumSessions = 4,
    maximumBytes = 32 * 1024 * 1024,
    ttlMilliseconds = 10 * 60 * 1_000,
  } = {}) {
    this.maximumSessions = maximumSessions;
    this.maximumBytes = maximumBytes;
    this.ttlMilliseconds = ttlMilliseconds;
    this.sessions = new Map();
    this.totalBytes = 0;
  }

  create(payload, {
    projectFingerprint,
    algorithmContract,
    envelope,
  }) {
    this.#evictExpired();
    if (payload.length > this.maximumBytes) {
      throw sessionError("shadow_session_too_large", "shadow geometry exceeds the in-memory session cache limit");
    }
    while (this.sessions.size >= this.maximumSessions
      || this.totalBytes + payload.length > this.maximumBytes) {
      const oldest = [...this.sessions.values()].sort((left, right) => left.lastAccessed - right.lastAccessed)[0];
      if (!oldest) break;
      this.delete(oldest.sessionId);
    }
    const now = performance.now();
    const sessionId = randomUUID();
    const geometryFingerprint = fingerprint(payload);
    const session = {
      sessionId,
      projectFingerprint,
      algorithmContract,
      coordinateFrame: envelope.coordinateFrame,
      unitsPerMillimeter: envelope.unitsPerMillimeter,
      ballCount: envelope.ballCount,
      sampleCount: envelope.sampleCount,
      identityFingerprint: Buffer.from(envelope.identityFingerprint),
      geometryFingerprint,
      payload: Buffer.from(payload),
      createdAt: now,
      lastAccessed: now,
    };
    this.sessions.set(sessionId, session);
    this.totalBytes += session.payload.length;
    return session;
  }

  resolve(sessionId, { projectFingerprint, algorithmContract }) {
    this.#evictExpired();
    const session = this.sessions.get(sessionId);
    if (!session) throw sessionError("shadow_session_not_found", "shadow geometry session is absent or expired");
    if (session.projectFingerprint !== projectFingerprint
      || session.algorithmContract !== algorithmContract) {
      throw sessionError("stale_shadow_session", "shadow session project or algorithm binding does not match");
    }
    session.lastAccessed = performance.now();
    return session;
  }

  createJobPayload(session, parameterPayload) {
    const parameters = decodeShadowSessionParameters(parameterPayload, session.geometryFingerprint);
    const payload = Buffer.from(session.payload);
    payload.writeFloatLE(parameters.smoothness, 56);
    payload.writeFloatLE(parameters.boundaryTolerance, 60);
    payload.writeUInt32LE(parameters.iterations, 64);
    return { payload, parameters };
  }

  delete(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    this.totalBytes -= session.payload.length;
    return true;
  }

  diagnostics() {
    this.#evictExpired();
    return {
      sessionCount: this.sessions.size,
      totalBytes: this.totalBytes,
      maximumSessions: this.maximumSessions,
      maximumBytes: this.maximumBytes,
      ttlMilliseconds: this.ttlMilliseconds,
    };
  }

  #evictExpired() {
    const cutoff = performance.now() - this.ttlMilliseconds;
    for (const session of this.sessions.values()) {
      if (session.lastAccessed < cutoff) this.delete(session.sessionId);
    }
  }
}

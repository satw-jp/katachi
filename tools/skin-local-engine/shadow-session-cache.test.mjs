import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeCompactBinaryRequest, validateCompactBinaryRequestEnvelope } from "./compact-binary-transport.mjs";
import {
  SHADOW_SESSION_PARAMETER_BYTES,
  ShadowGeometrySessionCache,
} from "./shadow-session-cache.mjs";
import { EVALUATE_CONTAINMENT_ALGORITHM } from "./compiled-executable-adapter.mjs";

function fixture() {
  return {
    protocol: { major: 1, minor: 0 },
    operation: "evaluateContainment",
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    clientRequestId: "session-cache-fixture",
    projectFingerprint: "sha256:session-cache-fixture",
    coordinateContract: {
      frame: "object",
      unitsPerMillimeter: 0.1,
      handedness: "right",
      buildAxis: "+z",
    },
    quality: { benchmarkIterations: 1 },
    input: {
      base: {
        kind: "metaball-smooth-union",
        contractVersion: 1,
        balls: [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
        smoothness: 0.6,
      },
      samples: [{
        sampleId: "sample-1",
        edgeId: "edge-1",
        position: { x: 0, y: 0, z: 0 },
        radius: 0.5,
      }],
      boundaryTolerance: 0.00005,
    },
    artifacts: [],
  };
}

function parameterPayload(fingerprint, smoothness = 0.8, tolerance = 0.0001) {
  const payload = Buffer.alloc(SHADOW_SESSION_PARAMETER_BYTES);
  payload.write("KSP1", 0, "ascii");
  payload.writeUInt16LE(1, 4);
  payload.writeUInt16LE(1, 6);
  payload.writeUInt32LE(SHADOW_SESSION_PARAMETER_BYTES, 8);
  fingerprint.copy(payload, 16);
  payload.writeFloatLE(smoothness, 48);
  payload.writeFloatLE(tolerance, 52);
  payload.writeUInt32LE(2, 56);
  payload.writeUInt32LE(SHADOW_SESSION_PARAMETER_BYTES, 60);
  return payload;
}

test("volatile shadow sessions bind project/algorithm/fingerprint and patch parameters only", () => {
  const request = fixture();
  const encoded = encodeCompactBinaryRequest(request);
  const envelope = validateCompactBinaryRequestEnvelope(encoded.payload);
  const cache = new ShadowGeometrySessionCache();
  const session = cache.create(encoded.payload, {
    projectFingerprint: request.projectFingerprint,
    algorithmContract: request.algorithmContract,
    envelope,
  });
  assert.equal(cache.diagnostics().sessionCount, 1);
  assert.equal(cache.resolve(session.sessionId, {
    projectFingerprint: request.projectFingerprint,
    algorithmContract: request.algorithmContract,
  }), session);
  assert.throws(() => cache.resolve(session.sessionId, {
    projectFingerprint: "sha256:another-project",
    algorithmContract: request.algorithmContract,
  }), /project or algorithm binding/);
  const repeat = cache.createJobPayload(session, parameterPayload(session.geometryFingerprint));
  assert.equal(repeat.payload.readFloatLE(56), Math.fround(0.8));
  assert.equal(repeat.payload.readFloatLE(60), Math.fround(0.0001));
  assert.equal(repeat.payload.readUInt32LE(64), 2);
  assert.deepEqual(repeat.payload.subarray(0, 56), encoded.payload.subarray(0, 56));
  assert.deepEqual(repeat.payload.subarray(68), encoded.payload.subarray(68));
  const stale = parameterPayload(Buffer.alloc(32, 0xff));
  assert.throws(() => cache.createJobPayload(session, stale), /fingerprint/);
  assert.equal(cache.delete(session.sessionId), true);
  assert.equal(cache.diagnostics().sessionCount, 0);
});
